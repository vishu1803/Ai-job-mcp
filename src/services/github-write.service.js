/**
 * @file GitHub Write Operations Service (Task P9-003)
 *
 * Implements the approved GitHub write layer for approved project improvements:
 * 1. Consumes APPROVED ActionApprovalTicket via ActionApprovalTicketService
 * 2. Resolves trusted resource connection and credentials
 * 3. Verifies optimistic concurrency on live base branch HEAD (expectedHeadSha)
 * 4. Creates atomic multi-file Git tree and commit via Git Data API
 * 5. Creates isolated feature branch ref (feat/career-hub-*)
 * 6. Creates Draft Pull Request against base branch
 * 7. Completes approval ticket lifecycle (EXECUTING -> EXECUTED)
 * 8. Handles bounded non-destructive rollback on partial failure
 * 9. Records comprehensive audit log events
 */

import { findConnectionByIdAndTenant } from '../db/repositories/connection.repository.js';
import { decryptSecret } from '../security/encryption.js';
import { SecretScrubber } from '../extractors/github/security/secret-scrubber.js';
import { createConnectorContext } from '../connectors/base/context.js';
import {
  GitHubWriteSafetyService,
  ALLOWED_BRANCH_REGEX,
  PROTECTED_BRANCH_BLOCKLIST,
  BLOCKED_PATH_PATTERNS,
} from './github-write-safety.service.js';
import {
  NotFoundError,
  ValidationError,
  StaleHeadShaError,
  BranchCollisionError,
} from '../errors/index.js';
import { logger } from '../utils/logger.js';

export const BRANCH_NAME_REGEX = ALLOWED_BRANCH_REGEX;
export const FORBIDDEN_BRANCHES = PROTECTED_BRANCH_BLOCKLIST;
export const FORBIDDEN_PATH_PATTERNS = BLOCKED_PATH_PATTERNS;

export class GitHubWriteService {
  /**
   * @param {object} options
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} options.db - Drizzle database instance
   * @param {import('../connectors/github/github-connector.js').GitHubAppConnector} options.connector - GitHub connector
   * @param {import('./action-approval-ticket.service.js').ActionApprovalTicketService} options.actionApprovalTicketService - Approval state machine
   * @param {GitHubWriteSafetyService} [options.safetyService] - Centralized execution safety kernel
   * @param {import('./mcp-audit.service.js').McpAuditService} [options.auditService] - Optional audit service
   * @param {import('pino').Logger} [options.logger] - Optional logger
   */
  constructor({
    db,
    connector,
    actionApprovalTicketService,
    safetyService = null,
    auditService = null,
    logger: loggerInstance = logger,
  }) {
    if (!db) throw new ValidationError('db is required to instantiate GitHubWriteService');
    if (!connector)
      throw new ValidationError('connector is required to instantiate GitHubWriteService');
    if (!actionApprovalTicketService) {
      throw new ValidationError(
        'actionApprovalTicketService is required to instantiate GitHubWriteService'
      );
    }

    this.db = db;
    this.connector = connector;
    this.actionApprovalTicketService = actionApprovalTicketService;
    this.auditService = auditService;
    this.logger = loggerInstance.child({ module: 'github-write-service' });
    this.safetyService =
      safetyService || new GitHubWriteSafetyService({ auditService, logger: this.logger });
  }

  /**
   * Executes an approved project improvement action against the target GitHub repository.
   *
   * @param {import('../domain/career/index.js').McpRequestContext} context - Authenticated context
   * @param {object} params
   * @param {string} params.ticketId - Approved ActionApprovalTicket UUID
   * @param {object} [params.proposal] - Optional proposal containing file contents
   * @param {string} [params.idempotencyKey] - Optional idempotency key for network retry recovery
   * @returns {Promise<{ prNumber: number, prUrl: string, branchName: string, commitSha: string }>}
   */
  async executeApprovedTicket(context, { ticketId, proposal = null, idempotencyKey = null }) {
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted context with tenantId is required');
    }
    if (!ticketId) {
      throw new ValidationError('ticketId is required to execute approved action');
    }

    const effectiveIdempotencyKey =
      idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.length >= 8
        ? idempotencyKey
        : `exec-${ticketId.replace(/-/g, '').slice(0, 12)}-${Date.now()}`;

    const startTime = Date.now();
    let branchCreated = false;
    let credentials = null;
    let targetRepo = null;
    let targetBranch = null;

    // -------------------------------------------------------------------------
    // STEP 1: Consume Approval Ticket (Sole Authorization Perimeter)
    // -------------------------------------------------------------------------
    const ticket = await this.actionApprovalTicketService.consumeTicketForExecution(context, {
      ticketId,
      idempotencyKey: effectiveIdempotencyKey,
    });

    // Idempotency: Return existing executionResult if ticket was already executed
    if (ticket.status === 'EXECUTED') {
      return ticket.executionResult;
    }

    targetRepo = ticket.repositoryName;
    targetBranch = ticket.targetBranch;

    try {
      // -----------------------------------------------------------------------
      // STEP 2: Tenant Isolation & Resource Connection Resolution
      // -----------------------------------------------------------------------
      if (ticket.tenantId !== context.tenantId) {
        throw new NotFoundError(`Ticket ${ticketId} not found`);
      }

      const connection = await findConnectionByIdAndTenant(
        this.db,
        ticket.resourceId,
        context.tenantId
      );

      if (!connection || connection.status !== 'ACTIVE') {
        throw new NotFoundError(
          `Active resource connection not found for connectionId: ${ticket.resourceId}`
        );
      }

      // Decrypt credentials
      let decrypted;
      try {
        const decryptedRaw = decryptSecret(connection.encryptedCredentials);
        decrypted = JSON.parse(decryptedRaw);
      } catch {
        // Handle raw string or object fallback
        const decryptedRaw = decryptSecret(connection.encryptedCredentials);
        decrypted = {
          installationId: connection.installationId,
          token: decryptedRaw,
        };
      }

      credentials = {
        installationId: connection.installationId || decrypted.installationId,
        token: decrypted.token || null,
      };

      const connectorContext = createConnectorContext({
        tenantId: context.tenantId,
        userId: context.userId,
        connectionId: connection.id,
        provider: connection.provider || 'GITHUB_APP',
        authType: connection.authType || 'APP_INSTALLATION',
      });

      const resolvedProposal = proposal || ticket.proposal || {};
      const files = Array.isArray(resolvedProposal.files)
        ? resolvedProposal.files
        : Array.isArray(resolvedProposal.patch?.files)
          ? resolvedProposal.patch.files
          : [];

      // -----------------------------------------------------------------------
      // STEP 3: Authoritative Dynamic Default Branch Discovery
      // -----------------------------------------------------------------------
      let defaultBranch = 'main';
      try {
        const repoMetadata = await this.connector.getRepository(
          connectorContext,
          credentials,
          ticket.repositoryName
        );
        if (repoMetadata && repoMetadata.defaultBranch) {
          defaultBranch = repoMetadata.defaultBranch;
        }
      } catch (repoErr) {
        this.logger.warn({
          msg: 'Could not fetch repository metadata for default branch discovery; using fallback',
          err: repoErr.message,
        });
      }

      // -----------------------------------------------------------------------
      // STEP 4: Live Base Branch HEAD SHA (Optimistic Concurrency)
      // -----------------------------------------------------------------------
      const liveHead = await this.connector.getBranchHeadSha(
        connectorContext,
        credentials,
        ticket.repositoryName,
        ticket.baseBranch
      );

      if (!liveHead || !liveHead.commitSha) {
        throw new NotFoundError(
          `Base branch '${ticket.baseBranch}' not found in repository '${ticket.repositoryName}'`
        );
      }

      // -----------------------------------------------------------------------
      // STEP 5: CENTRALIZED SAFETY KERNEL EXECUTION GATE (P9-004)
      // -----------------------------------------------------------------------
      this.safetyService.validateExecutionSafetyGate({
        context,
        ticket,
        proposal: resolvedProposal,
        repositoryDefaultBranch: defaultBranch,
        liveBaseHeadSha: liveHead.commitSha,
        commitMessage: resolvedProposal.title || '',
        prTitle: resolvedProposal.title || '',
        prBody: resolvedProposal.rationale || '',
        tokenPermissions: { contents: 'write', pull_requests: 'write' },
      });

      // -----------------------------------------------------------------------
      // STEP 6: Check Idempotency & Existing Pull Requests
      // -----------------------------------------------------------------------
      const existingPulls = await this.connector.getPullRequestByHead(
        connectorContext,
        credentials,
        ticket.repositoryName,
        { headBranch: ticket.targetBranch }
      );

      const cleanTarget = ticket.targetBranch.replace(/^refs\/heads\//, '');
      const openExistingPr = existingPulls.find((p) => {
        if (p.state !== 'open') return false;
        const rawHead = typeof p.head === 'string' ? p.head : p.head?.ref || p.headRef || '';
        const prHead = String(rawHead).replace(/^refs\/heads\//, '');
        return prHead === cleanTarget;
      });
      if (openExistingPr) {
        const commitSha =
          openExistingPr.head?.sha && /^[a-f0-9]{40}$/i.test(openExistingPr.head.sha)
            ? openExistingPr.head.sha
            : '0000000000000000000000000000000000000000';

        const executionResult = {
          prNumber: openExistingPr.number,
          prUrl: openExistingPr.html_url,
          branchName: ticket.targetBranch,
          commitSha,
        };

        await this.actionApprovalTicketService.completeExecution(context, {
          ticketId,
          executionResult,
        });

        return executionResult;
      }

      // -----------------------------------------------------------------------
      // STEP 7: Branch Collision Protection
      // -----------------------------------------------------------------------
      const existingBranchRef = await this.connector
        .getBranchHeadSha(connectorContext, credentials, ticket.repositoryName, ticket.targetBranch)
        .catch(() => null);

      if (existingBranchRef && existingBranchRef.commitSha && !openExistingPr) {
        throw new BranchCollisionError(
          `Target branch '${ticket.targetBranch}' already exists in repository without matching open PR. Overwriting is prohibited.`
        );
      }

      // -----------------------------------------------------------------------
      // STEP 7: Create Atomic Multi-File Git Tree & Single Commit (Git Data API)
      // -----------------------------------------------------------------------
      const treeEntries = files.map((f) => ({
        path: f.path,
        mode: '100644',
        type: 'blob',
        content: f.content,
      }));

      const tree = await this.connector.createGitTree(
        connectorContext,
        credentials,
        ticket.repositoryName,
        {
          baseTreeSha: ticket.expectedHeadSha,
          treeEntries,
        }
      );

      const commitTitle = SecretScrubber.scrub(
        resolvedProposal.title || 'implement project improvement'
      );
      const commitRationale = SecretScrubber.scrub(resolvedProposal.rationale || '');
      const commitMessage = `feat(career): ${commitTitle}\n\n${commitRationale}\n\nSkill Gap: ${resolvedProposal.targetSkill || 'Enhancement'}\n\nCo-authored-by: Antigravity Career Hub <bot@careerhub.antigravity.dev>`;

      const commit = await this.connector.createGitCommit(
        connectorContext,
        credentials,
        ticket.repositoryName,
        {
          message: commitMessage,
          treeSha: tree.treeSha,
          parentCommitShas: [ticket.expectedHeadSha],
        }
      );

      this._emitAuditEventSafe('github.commit.created', {
        context,
        ticketId,
        repository: ticket.repositoryName,
        commitSha: commit.commitSha,
        treeSha: tree.treeSha,
      });

      // -----------------------------------------------------------------------
      // STEP 8: Create Feature Branch Reference
      // -----------------------------------------------------------------------
      await this.connector.createGitRef(connectorContext, credentials, ticket.repositoryName, {
        ref: ticket.targetBranch,
        commitSha: commit.commitSha,
      });
      branchCreated = true;

      this._emitAuditEventSafe('github.branch.created', {
        context,
        ticketId,
        repository: ticket.repositoryName,
        branchName: ticket.targetBranch,
        commitSha: commit.commitSha,
      });

      // -----------------------------------------------------------------------
      // STEP 9: Create Draft Pull Request
      // -----------------------------------------------------------------------
      const prTitle = `[Career Hub] ${commitTitle}`;
      const prBody = this._buildPullRequestBody(ticket, resolvedProposal, files);

      const pr = await this.connector.createDraftPullRequest(
        connectorContext,
        credentials,
        ticket.repositoryName,
        {
          title: prTitle,
          head: ticket.targetBranch,
          base: ticket.baseBranch,
          body: prBody,
        }
      );

      this._emitAuditEventSafe('github.pull_request.created', {
        context,
        ticketId,
        repository: ticket.repositoryName,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        headBranch: ticket.targetBranch,
        baseBranch: ticket.baseBranch,
      });

      // -----------------------------------------------------------------------
      // STEP 10: Complete Execution Lifecycle
      // -----------------------------------------------------------------------
      const executionResult = {
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        branchName: ticket.targetBranch,
        commitSha: commit.commitSha,
      };

      await this.actionApprovalTicketService.completeExecution(context, {
        ticketId,
        executionResult,
      });

      this._emitAuditEventSafe('github.project_improvement.execution_completed', {
        context,
        ticketId,
        repository: ticket.repositoryName,
        prNumber: pr.prNumber,
        prUrl: pr.prUrl,
        durationMs: Date.now() - startTime,
        status: 'SUCCESS',
      });

      return executionResult;
    } catch (err) {
      this.logger.error({
        msg: 'Failed executing approved GitHub write operation',
        ticketId,
        targetRepo,
        targetBranch,
        err: err.message,
      });

      // -----------------------------------------------------------------------
      // STEP 11: Non-Destructive Rollback on Partial Failure
      // -----------------------------------------------------------------------
      if (branchCreated && credentials && targetRepo && targetBranch) {
        try {
          const connectorContext = createConnectorContext({
            tenantId: context.tenantId,
            userId: context.userId,
            connectionId: ticket.resourceId,
            provider: 'GITHUB_APP',
            authType: 'APP_INSTALLATION',
          });
          await this.connector.deleteGitRef(
            connectorContext,
            credentials,
            targetRepo,
            targetBranch
          );
          this.logger.info({
            msg: 'Rollback: successfully cleaned up isolated feature branch',
            targetBranch,
            targetRepo,
          });
        } catch (cleanupErr) {
          this.logger.warn({
            msg: 'Rollback warning: could not delete isolated feature branch',
            targetBranch,
            targetRepo,
            cleanupErr: cleanupErr.message,
          });
        }
      }

      // Mark ticket as FAILED in database if not already terminal
      await this.actionApprovalTicketService
        .failExecution(context, {
          ticketId,
          failureReason: (err instanceof StaleHeadShaError
            ? 'STALE_BASE_HEAD_SHA'
            : err.message || 'Execution error'
          ).slice(0, 1000),
        })
        .catch(() => {});

      this._emitAuditEventSafe('github.project_improvement.execution_failed', {
        context,
        ticketId,
        repository: targetRepo,
        error: err.message,
        durationMs: Date.now() - startTime,
        status: 'FAILED',
      });

      throw err;
    }
  }

  /**
   * Generates a safe, sanitized markdown envelope for the Draft Pull Request body.
   *
   * @private
   * @param {object} ticket
   * @param {object} proposal
   * @param {Array<object>} files
   * @returns {string}
   */
  _buildPullRequestBody(ticket, proposal, files) {
    const targetSkill = SecretScrubber.scrub(proposal.targetSkill || 'Skill Enhancement');
    const gapStatus = SecretScrubber.scrub(proposal.gapStatus || 'MISSING');
    const confidenceScore = Math.round((proposal.confidenceScore || 0.9) * 100);
    const rationale = SecretScrubber.scrub(
      proposal.rationale ||
        'Addresses missing job requirement by introducing a test-backed implementation.'
    );
    const verification = SecretScrubber.scrub(proposal.verificationInstructions || 'npm test');

    const fileLines = files
      .map((f) => `- \`${SecretScrubber.scrub(f.path)}\` (${f.changeType || 'CREATE'})`)
      .join('\n');

    return `## [Career Hub] Project Improvement Proposal

**Target Skill(s)**: \`${targetSkill}\`  
**Skill Gap Status**: \`${gapStatus}\`  
**Confidence Score**: \`${confidenceScore}%\`  
**Action Approval Ticket**: \`${ticket.id}\`

---

### Architectural Rationale
${rationale}

### Modified Files (${files.length})
${fileLines}

---

### Verification Instructions
\`\`\`bash
${verification}
\`\`\`

---
> ⚠️ **Draft Pull Request Notice**: This Draft Pull Request was generated by Antigravity Career Hub following explicit candidate confirmation. Review all code changes carefully before merging into your default branch.`;
  }

  /**
   * Emits audit log events asynchronously and safely without throwing.
   *
   * @private
   * @param {string} action
   * @param {object} metadata
   */
  _emitAuditEventSafe(action, metadata) {
    if (!this.auditService) return;
    try {
      this.auditService.logEvent({
        tenantId: metadata.context?.tenantId,
        userId: metadata.context?.userId,
        action,
        resourceType: 'GITHUB_REPOSITORY',
        resourceId: metadata.repository,
        details: {
          ticketId: metadata.ticketId,
          prNumber: metadata.prNumber,
          prUrl: metadata.prUrl,
          branchName: metadata.branchName,
          commitSha: metadata.commitSha,
          status: metadata.status,
          durationMs: metadata.durationMs,
        },
      });
    } catch (auditErr) {
      this.logger.warn({ msg: 'Failed emitting audit event', action, error: auditErr.message });
    }
  }
}
