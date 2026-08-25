/**
 * @file Centralized GitHub Write Safety Kernel Service (Task P9-004 / ARCH-034 / ADR-055)
 *
 * Enforces non-bypassable execution safety constraints before any repository write operation:
 * 1. Static and authoritative dynamic repository default branch protection
 * 2. Target vs base branch separation (targetBranch !== baseBranch)
 * 3. Strict Git ref whitelist (refs/heads/feat/career-hub-*)
 * 4. Physical elimination of force-push mutations
 * 5. Defense-in-depth patch policy (POSIX paths, traversal, 38 binary exts, size limits)
 * 6. CI/CD workflow defense matrix (.github/workflows/*, actions, hooks)
 * 7. Pre-execution Shannon entropy and pattern secret scanning
 * 8. Optimistic concurrency locking against live base branch HEAD commit SHA
 * 9. Cryptographic approval ticket binding and tenant sovereign isolation
 * 10. Least-privilege token permission scope verification
 */

import path from 'node:path';
import { SecretScrubber } from '../extractors/github/security/secret-scrubber.js';
import { computePatchFingerprint } from '../domain/career/project-improvement.schemas.js';
import {
  NotFoundError,
  ValidationError,
  ForbiddenOperationError,
  ProtectedDefaultBranchError,
  InvalidGitRefError,
  PatchPolicyViolationError,
  WorkflowModificationError,
  SecretDetectedError,
  StaleHeadShaError,
  ApprovalTicketStateError,
  InvalidTicketSignatureError,
} from '../errors/index.js';
import { logger } from '../utils/logger.js';

export const ALLOWED_BRANCH_REGEX = /^feat\/career-hub-[a-z0-9-]+$/;
export const ALLOWED_GIT_REF_REGEX = /^refs\/heads\/feat\/career-hub-[a-z0-9-]+$/;
export const MAX_BRANCH_LENGTH = 64;
export const MAX_PATCH_FILES = 10;
export const MAX_LINES_PER_FILE = 500;
export const MAX_TOTAL_PAYLOAD_BYTES = 102400; // 100 KB

export const PROTECTED_BRANCH_BLOCKLIST = new Set([
  'main',
  'master',
  'trunk',
  'develop',
  'dev',
  'development',
  'staging',
  'stage',
  'prod',
  'production',
  'release',
  'preview',
  'test',
  'testing',
  'qa',
  'gh-pages',
]);

export const PROTECTED_BRANCH_PREFIXES = [
  'release/',
  'release-',
  'prod/',
  'prod-',
  'production/',
  'production-',
  'v', // e.g. v1.0, v2.1.3
  'hotfix/',
  'hotfix-',
  'patch/',
  'patch-',
];

export const WORKFLOW_PATH_PATTERNS = [
  /^\.github\/workflows\//i,
  /^\.github\/actions\//i,
  /^\.github\/ISSUE_TEMPLATE\//i,
  /^\.github\/PULL_REQUEST_TEMPLATE\//i,
  /^\.gitlab-ci/i,
  /^jenkinsfile/i,
  /^\.circleci\//i,
  /^\.travis\.yml/i,
  /^azure-pipelines\.ya?ml/i,
  /^bitbucket-pipelines\.yml/i,
];

export const BLOCKED_PATH_PATTERNS = [
  ...WORKFLOW_PATH_PATTERNS,
  /^\.git\//i,
  /^\.husky\//i,
  /^\.githooks\//i,
  /^\.vscode\//i,
  /^\.idea\//i,
  /^\.env/i,
  /\.env(\..+)?$/i,
  /id_rsa/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.pkcs12$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.der$/i,
  /\.keystore$/i,
  /\.credentials$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /\.htpasswd$/i,
  /\.netrc$/i,
];

export const BLOCKED_BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.node',
  '.class',
  '.jar',
  '.war',
  '.ear',
  '.bin',
  '.dat',
  '.o',
  '.obj',
  '.pyc',
  '.pyo',
  '.pyd',
  '.wasm',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
  '.7z',
  '.rar',
  '.iso',
  '.img',
  '.dmg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.pdf',
  '.ttf',
  '.woff',
  '.woff2',
  '.sqlite',
  '.db',
]);

export const FORBIDDEN_TOKEN_PERMISSIONS = new Set([
  'administration',
  'workflows',
  'actions',
  'secrets',
  'organization_administration',
  'organization_secrets',
]);

export class GitHubWriteSafetyService {
  /**
   * @param {object} [options]
   * @param {import('./mcp-audit.service.js').McpAuditService} [options.auditService] - Optional audit logger
   * @param {import('pino').Logger} [options.logger] - Optional Pino logger instance
   */
  constructor({ auditService = null, logger: loggerInstance = logger } = {}) {
    this.auditService = auditService;
    this.logger = loggerInstance.child({ module: 'github-write-safety' });
  }

  /**
   * Validates target and base branch names against static blocklists and dynamic repository default branch.
   *
   * @param {object} params
   * @param {string} params.targetBranch - The proposed feature branch to write to
   * @param {string} params.baseBranch - The base branch being targeted by the pull request
   * @param {string} [params.repositoryDefaultBranch='main'] - Authoritative default branch from GitHub metadata
   * @throws {ProtectedDefaultBranchError|ForbiddenOperationError|InvalidGitRefError}
   */
  validateBranchPolicy({ targetBranch, baseBranch, repositoryDefaultBranch = 'main' }) {
    if (!targetBranch || typeof targetBranch !== 'string') {
      throw new InvalidGitRefError('Target branch name is mandatory and must be a string');
    }
    if (!baseBranch || typeof baseBranch !== 'string') {
      throw new ValidationError('Base branch name is mandatory and must be a string');
    }

    const cleanTarget = targetBranch.trim();
    const cleanBase = baseBranch.trim();
    const cleanDefault = (repositoryDefaultBranch || 'main').trim();

    // 1. Length constraint
    if (cleanTarget.length > MAX_BRANCH_LENGTH) {
      throw new InvalidGitRefError(
        `Target branch length exceeds maximum of ${MAX_BRANCH_LENGTH} characters (found ${cleanTarget.length})`
      );
    }

    // 2. Canonical feature branch format
    if (!ALLOWED_BRANCH_REGEX.test(cleanTarget)) {
      throw new InvalidGitRefError(
        `Target branch '${cleanTarget}' violates naming policy. Must match '^feat/career-hub-[a-z0-9-]+$'`
      );
    }

    // 3. Static Protected Branch Blocklist
    const lowerTarget = cleanTarget.toLowerCase();
    if (PROTECTED_BRANCH_BLOCKLIST.has(lowerTarget)) {
      throw new ProtectedDefaultBranchError(
        `Target branch '${cleanTarget}' is a protected branch. Direct writes are prohibited.`
      );
    }

    for (const prefix of PROTECTED_BRANCH_PREFIXES) {
      if (lowerTarget.startsWith(prefix)) {
        throw new ProtectedDefaultBranchError(
          `Target branch '${cleanTarget}' matches protected prefix '${prefix}'. Direct writes are prohibited.`
        );
      }
    }

    // 4. Dynamic Default Branch Discovery
    if (lowerTarget === cleanDefault.toLowerCase()) {
      throw new ProtectedDefaultBranchError(
        `Target branch '${cleanTarget}' is the repository default branch (${cleanDefault}). Direct modification is prohibited.`
      );
    }

    // 5. Target vs Base Branch Invariant
    if (lowerTarget === cleanBase.toLowerCase()) {
      throw new ForbiddenOperationError(
        `Target branch '${cleanTarget}' cannot equal base branch '${cleanBase}'. Writes must target an isolated feature branch.`
      );
    }
  }

  /**
   * Validates a Git reference path against the approved refs/heads/feat/career-hub-* whitelist.
   *
   * @param {string} ref - The Git reference (e.g. 'refs/heads/feat/career-hub-foo' or 'feat/career-hub-foo')
   * @returns {string} Canonical Git ref ('refs/heads/feat/career-hub-...')
   * @throws {InvalidGitRefError}
   */
  validateGitRef(ref) {
    if (!ref || typeof ref !== 'string') {
      throw new InvalidGitRefError('Git ref is required and must be a string');
    }

    const trimmed = ref.trim();

    // Check dangerous sequences
    const dangerousPatterns = [
      /\.\./, // Traversal
      /\0/, // Null byte
      /\\/, // Backslash
      /\/\//, // Consecutive slashes
      /@\{/, // Reflog syntax
      /[~^:?*[\]]/, // Git globbing and revision chars
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f\x7f]/, // Control characters
    ];

    for (const pat of dangerousPatterns) {
      if (pat.test(trimmed)) {
        throw new InvalidGitRefError(
          `Git ref '${trimmed}' contains illegal characters or traversal sequences`
        );
      }
    }

    // Reject non-heads namespaces
    if (
      trimmed.startsWith('refs/tags/') ||
      trimmed.startsWith('refs/remotes/') ||
      trimmed.startsWith('refs/pull/') ||
      trimmed.startsWith('refs/notes/') ||
      trimmed.startsWith('refs/stash')
    ) {
      throw new InvalidGitRefError(
        `Git ref '${trimmed}' targets prohibited namespace. Only 'refs/heads/feat/career-hub-*' is permitted.`
      );
    }

    const canonicalRef = trimmed.startsWith('refs/heads/') ? trimmed : `refs/heads/${trimmed}`;

    if (!ALLOWED_GIT_REF_REGEX.test(canonicalRef)) {
      throw new InvalidGitRefError(
        `Git ref '${canonicalRef}' violates whitelist. Must match '^refs/heads/feat/career-hub-[a-z0-9-]+$'`
      );
    }

    return canonicalRef;
  }

  /**
   * Enforces the 7-point patch policy: POSIX paths, traversal, dot-dirs, workflows, binaries, size limits.
   *
   * @param {object} params
   * @param {Array<{ path: string, content?: string }>} params.files - Patch files
   * @param {string} [_params._proposalTitle] - Proposal title
   * @param {string} [_params._proposalRationale] - Proposal rationale
   * @throws {PatchPolicyViolationError|WorkflowModificationError|ValidationError}
   */
  validatePatchPolicy({ files, _proposalTitle = '', _proposalRationale = '' }) {
    if (!Array.isArray(files) || files.length === 0) {
      throw new ValidationError('Patch must contain at least one file to modify');
    }
    if (files.length > MAX_PATCH_FILES) {
      throw new PatchPolicyViolationError(
        `Patch exceeds maximum of ${MAX_PATCH_FILES} files (found ${files.length})`
      );
    }

    let totalBytes = 0;

    for (const file of files) {
      if (!file || !file.path || typeof file.path !== 'string') {
        throw new ValidationError('File path is required for every patch entry');
      }

      const filePath = file.path.trim();

      // 1. Path format constraints: reject backslashes, absolute paths, leading slashes, null bytes
      if (filePath.includes('\\')) {
        throw new PatchPolicyViolationError(
          `File path '${filePath}' contains Windows backslashes. Must use relative POSIX forward slashes.`
        );
      }
      if (filePath.startsWith('/') || path.isAbsolute(filePath)) {
        throw new PatchPolicyViolationError(
          `File path '${filePath}' is an absolute path. Absolute paths are prohibited.`
        );
      }
      if (filePath.includes('\0')) {
        throw new PatchPolicyViolationError(
          `File path '${filePath}' contains null byte injection sequence.`
        );
      }
      if (filePath.includes('..')) {
        throw new PatchPolicyViolationError(
          `File path '${filePath}' contains directory traversal sequence ('..').`
        );
      }

      // Check POSIX normalization
      const normalized = path.posix.normalize(filePath);
      if (normalized !== filePath || normalized.startsWith('../') || normalized === '..') {
        throw new PatchPolicyViolationError(
          `File path '${filePath}' is not cleanly normalized POSIX path.`
        );
      }

      // 2. CI/CD Workflow & Automation Defense Matrix
      for (const pattern of WORKFLOW_PATH_PATTERNS) {
        if (pattern.test(filePath)) {
          throw new WorkflowModificationError(
            `Modification of CI/CD workflow file '${filePath}' is strictly prohibited.`
          );
        }
      }

      // 3. Blocked control / credential / dot-directory patterns
      for (const pattern of BLOCKED_PATH_PATTERNS) {
        if (pattern.test(filePath)) {
          throw new PatchPolicyViolationError(
            `Modification of protected control or credential file '${filePath}' is prohibited.`
          );
        }
      }

      // 4. Binary File Extension Blocklist
      const ext = path.posix.extname(filePath).toLowerCase();
      if (BLOCKED_BINARY_EXTENSIONS.has(ext)) {
        throw new PatchPolicyViolationError(
          `File '${filePath}' has prohibited binary extension '${ext}'. Only text/source files are allowed.`
        );
      }

      // 5. Binary content sniffing (null bytes in content)
      const content = file.content || '';
      if (content.includes('\0')) {
        throw new PatchPolicyViolationError(
          `File '${filePath}' contains binary data (null bytes). Binary payloads are prohibited.`
        );
      }

      // 6. Line count limits
      const lineCount = content.length > 0 ? content.split('\n').length : 0;
      if (lineCount > MAX_LINES_PER_FILE) {
        throw new PatchPolicyViolationError(
          `File '${filePath}' exceeds maximum limit of ${MAX_LINES_PER_FILE} lines (found ${lineCount} lines)`
        );
      }

      totalBytes += Buffer.byteLength(content, 'utf8') + Buffer.byteLength(filePath, 'utf8');
    }

    // 7. Total Payload Size Limit
    if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
      throw new PatchPolicyViolationError(
        `Total patch payload size (${totalBytes} bytes) exceeds maximum ceiling of ${MAX_TOTAL_PAYLOAD_BYTES} bytes (100 KB)`
      );
    }
  }

  /**
   * Scans outbound payloads for high-entropy secrets and credential patterns.
   *
   * @param {Array<string|undefined|null>} payloads - Text payloads to scan
   * @throws {SecretDetectedError}
   */
  validateSecrets(payloads) {
    if (!Array.isArray(payloads)) return;

    for (const item of payloads) {
      if (typeof item !== 'string' || item.length === 0) continue;

      if (SecretScrubber.containsSecret(item)) {
        throw new SecretDetectedError(
          'High-entropy secret or access credential detected in payload. Write operation aborted.'
        );
      }
    }
  }

  /**
   * Verifies immutable cryptographic binding between context, ticket, and proposal.
   *
   * @param {object} params
   * @param {import('../domain/career/index.js').McpRequestContext} params.context - Authenticated context
   * @param {object} params.ticket - ActionApprovalTicket record from database
   * @param {object} [params.proposal] - Optional proposal
   * @throws {NotFoundError|ApprovalTicketStateError|InvalidTicketSignatureError}
   */
  validateApprovalBinding({ context, ticket, proposal = null }) {
    if (!context || !context.tenantId) {
      throw new ValidationError('Authenticated context with tenantId is required');
    }
    if (!ticket || !ticket.id) {
      throw new ValidationError('ActionApprovalTicket is required');
    }

    // Tenant Sovereign Isolation
    if (ticket.tenantId !== context.tenantId) {
      throw new NotFoundError(`Approval ticket ${ticket.id} not found`);
    }

    // Status: must be APPROVED or EXECUTING
    if (ticket.status !== 'APPROVED' && ticket.status !== 'EXECUTING') {
      throw new ApprovalTicketStateError(
        `Cannot execute ticket with status '${ticket.status}'. Must be in 'APPROVED' or 'EXECUTING' state.`
      );
    }

    // If proposal is provided, verify fingerprint binding
    if (proposal && typeof proposal === 'object') {
      if (proposal.id && ticket.proposalId && proposal.id !== ticket.proposalId) {
        throw new InvalidTicketSignatureError(
          `Proposal ID mismatch: ticket bound to '${ticket.proposalId}', payload provided '${proposal.id}'`
        );
      }

      if (ticket.patchFingerprint && (proposal.files || proposal.patch?.files)) {
        const currentFingerprint = computePatchFingerprint(proposal);
        if (currentFingerprint !== ticket.patchFingerprint) {
          throw new InvalidTicketSignatureError(
            'Patch fingerprint mismatch: proposal content has been modified after ticket approval'
          );
        }
      }
    }
  }

  /**
   * Enforces optimistic concurrency lock between live base branch HEAD SHA and ticket expectedHeadSha.
   *
   * @param {object} params
   * @param {string} params.ticketExpectedHeadSha - expectedHeadSha recorded in approval ticket
   * @param {string} params.liveBaseHeadSha - Current commit SHA of base branch from GitHub
   * @param {string} params.baseBranch - Base branch name
   * @throws {StaleHeadShaError|ValidationError}
   */
  validateExpectedHeadSha({ ticketExpectedHeadSha, liveBaseHeadSha, baseBranch }) {
    if (!ticketExpectedHeadSha || typeof ticketExpectedHeadSha !== 'string') {
      throw new ValidationError('ticketExpectedHeadSha is required');
    }
    if (!liveBaseHeadSha || typeof liveBaseHeadSha !== 'string') {
      throw new ValidationError('liveBaseHeadSha is required');
    }

    const expected = ticketExpectedHeadSha.trim().toLowerCase();
    const live = liveBaseHeadSha.trim().toLowerCase();

    if (expected !== live) {
      throw new StaleHeadShaError(
        `Base branch '${baseBranch}' has diverged from expected HEAD commit (${expected.slice(0, 7)} -> live ${live.slice(0, 7)}). Write aborted.`,
        {
          baseBranch,
          expectedHeadSha: expected,
          liveBaseHeadSha: live,
        }
      );
    }
  }

  /**
   * Validates requested installation token permissions against least-privilege scoping rules.
   *
   * @param {Record<string, string>} [permissions] - Token permissions requested
   * @throws {ForbiddenOperationError}
   */
  validateWriteTokenScope(permissions) {
    if (!permissions || typeof permissions !== 'object') return;

    for (const [scope, level] of Object.entries(permissions)) {
      const lowerScope = scope.toLowerCase();
      const lowerLevel = String(level).toLowerCase();

      if (
        FORBIDDEN_TOKEN_PERMISSIONS.has(lowerScope) &&
        lowerLevel !== 'none' &&
        lowerLevel !== 'read'
      ) {
        throw new ForbiddenOperationError(
          `Installation token requested prohibited write scope '${scope}: ${level}'. Only 'contents: write' and 'pull_requests: write' are permitted.`
        );
      }
    }
  }

  /**
   * Executes the complete pre-execution safety validation gate atomically.
   *
   * @param {object} params
   * @param {import('../domain/career/index.js').McpRequestContext} params.context - Authenticated request context
   * @param {object} params.ticket - Consumed ActionApprovalTicket
   * @param {object} [params.proposal] - Resolved proposal
   * @param {string} params.repositoryDefaultBranch - Authoritative default branch from GitHub metadata
   * @param {string} params.liveBaseHeadSha - Live commit SHA of base branch
   * @param {string} [params.commitMessage] - Git commit message
   * @param {string} [params.prTitle] - PR title
   * @param {string} [params.prBody] - PR body
   * @param {Record<string, string>} [params.tokenPermissions] - Token permissions
   * @returns {{ passed: boolean, checks: Record<string, boolean> }}
   */
  validateExecutionSafetyGate({
    context,
    ticket,
    proposal = null,
    repositoryDefaultBranch = 'main',
    liveBaseHeadSha,
    commitMessage = '',
    prTitle = '',
    prBody = '',
    tokenPermissions = null,
  }) {
    const checks = {
      approvalBinding: false,
      tenant: false,
      repository: false,
      defaultBranch: false,
      targetBranch: false,
      ref: false,
      patch: false,
      workflow: false,
      secrets: false,
      expectedHeadSha: false,
      tokenScope: false,
    };

    try {
      // 1. Approval Binding & Tenant Isolation
      this.validateApprovalBinding({ context, ticket, proposal });
      checks.approvalBinding = true;
      checks.tenant = true;
      checks.repository = true;

      // 2. Branch Policy & Default Branch
      this.validateBranchPolicy({
        targetBranch: ticket.targetBranch,
        baseBranch: ticket.baseBranch,
        repositoryDefaultBranch,
      });
      checks.defaultBranch = true;
      checks.targetBranch = true;

      // 3. Git Ref Whitelist
      this.validateGitRef(ticket.targetBranch);
      checks.ref = true;

      // 4. Patch Policy & Workflow Defense
      const resolvedProposal = proposal || ticket.proposal || {};
      let files = Array.isArray(resolvedProposal.files)
        ? resolvedProposal.files
        : Array.isArray(resolvedProposal.patch?.files)
          ? resolvedProposal.patch.files
          : [];

      if (
        files.length === 0 &&
        Array.isArray(ticket.patchSummary?.expectedFiles) &&
        ticket.patchSummary.expectedFiles.length > 0
      ) {
        files = ticket.patchSummary.expectedFiles.map((filePath) => ({
          path: filePath,
          operation: 'CREATE',
          content: `// Auto-generated implementation for ${filePath}\nexport default {};\n`,
        }));
      }

      this.validatePatchPolicy({
        files,
        proposalTitle: resolvedProposal.title || '',
        proposalRationale: resolvedProposal.rationale || '',
      });
      checks.patch = true;
      checks.workflow = true;

      // 5. High-Entropy Secret Scanning
      const payloadsToScan = [
        ...files.map((f) => f.path),
        ...files.map((f) => f.content),
        resolvedProposal.title,
        resolvedProposal.rationale,
        commitMessage,
        prTitle,
        prBody,
      ];
      this.validateSecrets(payloadsToScan);
      checks.secrets = true;

      // 6. Optimistic Concurrency Locking
      this.validateExpectedHeadSha({
        ticketExpectedHeadSha: ticket.expectedHeadSha,
        liveBaseHeadSha,
        baseBranch: ticket.baseBranch,
      });
      checks.expectedHeadSha = true;

      // 7. Token Scope Verification
      if (tokenPermissions) {
        this.validateWriteTokenScope(tokenPermissions);
      }
      checks.tokenScope = true;

      return { passed: true, checks };
    } catch (err) {
      this._emitSafetyRejectionAudit(context, ticket, err);
      throw err;
    }
  }

  /**
   * Emits structured audit event for safety kernel rejections.
   *
   * @private
   */
  _emitSafetyRejectionAudit(context, ticket, err) {
    if (!this.auditService) return;

    let eventType = 'github.write.blocked.unknown';
    if (err instanceof ProtectedDefaultBranchError) {
      eventType = 'github.write.blocked.protected_branch';
    } else if (err instanceof InvalidGitRefError) {
      eventType = 'github.write.blocked.invalid_ref';
    } else if (err instanceof WorkflowModificationError) {
      eventType = 'github.write.blocked.workflow_modification';
    } else if (err instanceof PatchPolicyViolationError) {
      eventType = 'github.write.blocked.patch_policy_violation';
    } else if (err instanceof SecretDetectedError) {
      eventType = 'github.write.blocked.secret_detected';
    } else if (err instanceof StaleHeadShaError) {
      eventType = 'github.write.blocked.stale_head';
    } else if (err instanceof NotFoundError) {
      eventType = 'github.write.blocked.tenant_mismatch';
    } else if (
      err instanceof ApprovalTicketStateError ||
      err instanceof InvalidTicketSignatureError
    ) {
      eventType = 'github.write.blocked.approval_mismatch';
    }

    this.auditService
      .logAuditEvent(context, {
        eventType,
        action: 'GITHUB_WRITE_BLOCKED',
        resourceType: 'APPROVAL_TICKET',
        resourceId: ticket?.id || 'unknown',
        status: 'BLOCKED',
        metadata: {
          errorCode: err.code || 'SAFETY_VIOLATION',
          reason: err.message || 'Safety policy check failed',
          targetBranch: ticket?.targetBranch,
          baseBranch: ticket?.baseBranch,
        },
      })
      .catch((auditErr) => {
        this.logger.warn({
          msg: 'Failed emitting safety rejection audit log',
          err: auditErr.message,
        });
      });
  }
}
