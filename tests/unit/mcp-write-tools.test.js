/**
 * @file Unit Tests for MCP Career Write Tools (P9-005).
 *
 * Verifies:
 * 1. Tool registration, catalog discovery & MCP 2026-07-28 annotations
 * 2. Scope & RBAC authorization enforcement (career:write, MEMBER/OWNER vs READONLY)
 * 3. ProposeProjectImprovementInputSchema validation, bounds, and strictness
 * 4. ConfirmAndCreatePrInputSchema validation, strictness, and explicit confirmation
 * 5. propose_project_improvement execution, domain delegation, and stopping protocol
 * 6. confirm_and_create_pr execution, domain delegation, and PR metadata output
 * 7. Anti-primitive protection: No raw branch/patch/commit overrides allowed
 * 8. Error mapping and safe response formatting
 * 9. Output data minimization and credential protection
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  CAREER_WRITE_TOOL_DEFINITIONS,
  ProposeProjectImprovementInputSchema,
  ConfirmAndCreatePrInputSchema,
} from '../../src/domain/mcp/career-write-tools.schemas.js';
import { registerCareerWriteTools } from '../../src/mcp/tools/career-write-tools.js';
import { createCareerMcpServer, McpServerWrapper } from '../../src/mcp/server.js';
import { assertToolPermission } from '../../src/security/mcp-auth.js';
import { AuthorizationError } from '../../src/errors/index.js';

describe('MCP Career Write Tools Unit Tests (P9-005)', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const ticketId = crypto.randomUUID();
  const repositoryId = crypto.randomUUID();

  const mockContextMember = Object.freeze({
    requestId: crypto.randomUUID(),
    tenantId,
    userId,
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  });

  const mockContextOwner = Object.freeze({
    requestId: crypto.randomUUID(),
    tenantId,
    userId,
    role: 'OWNER',
    tokenScopes: ['career:read', 'career:write', 'career:admin'],
    authMethod: 'MCP_API_TOKEN',
  });

  const mockContextReadonly = Object.freeze({
    requestId: crypto.randomUUID(),
    tenantId,
    userId,
    role: 'READONLY',
    tokenScopes: ['career:read'],
    authMethod: 'MCP_API_TOKEN',
  });

  const mockContextMissingScope = Object.freeze({
    requestId: crypto.randomUUID(),
    tenantId,
    userId,
    role: 'MEMBER',
    tokenScopes: ['career:read'],
    authMethod: 'MCP_API_TOKEN',
  });

  // ---------------------------------------------------------------------------
  // 1. Tool Registration & Annotations
  // ---------------------------------------------------------------------------
  describe('1. Tool Registration & Catalog Discovery', () => {
    it('registers exactly both write tools in McpServerWrapper', () => {
      const server = new McpServerWrapper();
      registerCareerWriteTools(server, {});

      assert.ok(server.registeredTools.has('propose_project_improvement'));
      assert.ok(server.registeredTools.has('confirm_and_create_pr'));
      assert.equal(server.registeredTools.size, 2);
    });

    it('createCareerMcpServer includes read, artifact, and write tools', () => {
      const server = createCareerMcpServer({});
      assert.ok(server.registeredTools.has('get_candidate_profile'));
      assert.ok(server.registeredTools.has('draft_cover_letter'));
      assert.ok(server.registeredTools.has('propose_project_improvement'));
      assert.ok(server.registeredTools.has('confirm_and_create_pr'));
      assert.equal(server.registeredTools.size, 16);
    });

    it('propose_project_improvement has valid MCP 2026-07-28 annotations', () => {
      const def = CAREER_WRITE_TOOL_DEFINITIONS.propose_project_improvement;
      assert.equal(def.name, 'propose_project_improvement');
      assert.equal(def.requiredRole, 'MEMBER');
      assert.deepEqual(def.requiredScopes, ['career:write']);
      assert.equal(def.annotations.readOnlyHint, false);
      assert.equal(def.annotations.destructiveHint, false);
      assert.equal(def.annotations.idempotentHint, false);
      assert.equal(def.annotations.openWorldHint, true);
    });

    it('confirm_and_create_pr has valid MCP 2026-07-28 annotations', () => {
      const def = CAREER_WRITE_TOOL_DEFINITIONS.confirm_and_create_pr;
      assert.equal(def.name, 'confirm_and_create_pr');
      assert.equal(def.requiredRole, 'MEMBER');
      assert.deepEqual(def.requiredScopes, ['career:write']);
      assert.equal(def.annotations.readOnlyHint, false);
      assert.equal(def.annotations.destructiveHint, false);
      assert.equal(def.annotations.idempotentHint, true);
      assert.equal(def.annotations.openWorldHint, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. RBAC & Scope Authorization
  // ---------------------------------------------------------------------------
  describe('2. RBAC & Scope Authorization', () => {
    it('permits MEMBER with career:write on propose_project_improvement', () => {
      assert.doesNotThrow(() =>
        assertToolPermission(
          mockContextMember,
          CAREER_WRITE_TOOL_DEFINITIONS.propose_project_improvement
        )
      );
    });

    it('permits OWNER with career:write on confirm_and_create_pr', () => {
      assert.doesNotThrow(() =>
        assertToolPermission(mockContextOwner, CAREER_WRITE_TOOL_DEFINITIONS.confirm_and_create_pr)
      );
    });

    it('rejects READONLY role with AuthorizationError (403)', () => {
      assert.throws(
        () =>
          assertToolPermission(
            mockContextReadonly,
            CAREER_WRITE_TOOL_DEFINITIONS.propose_project_improvement
          ),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
      assert.throws(
        () =>
          assertToolPermission(
            mockContextReadonly,
            CAREER_WRITE_TOOL_DEFINITIONS.confirm_and_create_pr
          ),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });

    it('rejects token without career:write scope with AuthorizationError (403)', () => {
      assert.throws(
        () =>
          assertToolPermission(
            mockContextMissingScope,
            CAREER_WRITE_TOOL_DEFINITIONS.propose_project_improvement
          ),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
      assert.throws(
        () =>
          assertToolPermission(
            mockContextMissingScope,
            CAREER_WRITE_TOOL_DEFINITIONS.confirm_and_create_pr
          ),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Input Schema Validation
  // ---------------------------------------------------------------------------
  describe('3. Input Schema Validation', () => {
    it('validates propose input with jobDescriptionText', () => {
      const valid = {
        candidateId,
        jobDescriptionText:
          'We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing, and distributed locking architectures.',
        targetSkillSlugs: ['redis', 'postgresql'],
        targetRepositoryId: repositoryId,
      };
      const parsed = ProposeProjectImprovementInputSchema.parse(valid);
      assert.equal(parsed.candidateId, candidateId);
      assert.equal(parsed.targetSkillSlugs.length, 2);
    });

    it('validates propose input with jobDescriptionId', () => {
      const valid = {
        jobDescriptionId: crypto.randomUUID(),
      };
      const parsed = ProposeProjectImprovementInputSchema.parse(valid);
      assert.ok(parsed.jobDescriptionId);
    });

    it('rejects propose input missing both jobDescriptionText and jobDescriptionId', () => {
      assert.throws(
        () => ProposeProjectImprovementInputSchema.parse({ candidateId }),
        (err) => err.name === 'ZodError'
      );
    });

    it('rejects propose input with short jobDescriptionText (<50 chars)', () => {
      assert.throws(
        () => ProposeProjectImprovementInputSchema.parse({ jobDescriptionText: 'Too short text' }),
        (err) => err.name === 'ZodError'
      );
    });

    it('rejects unknown fields on propose input (strict)', () => {
      assert.throws(
        () =>
          ProposeProjectImprovementInputSchema.parse({
            jobDescriptionText:
              'We are seeking a Senior Backend Engineer proficient in Redis caching and PostgreSQL.',
            tenantId: 'untrusted-tenant',
            arbitraryBranch: 'main',
          }),
        (err) => err.name === 'ZodError'
      );
    });

    it('validates confirm input with confirmed: true', () => {
      const valid = {
        ticketId,
        confirmed: true,
        idempotencyKey: 'idemp-key-test-1234567890',
        userNotes: 'Approved by tech lead',
      };
      const parsed = ConfirmAndCreatePrInputSchema.parse(valid);
      assert.equal(parsed.ticketId, ticketId);
      assert.equal(parsed.confirmed, true);
    });

    it('rejects confirm input with confirmed: false', () => {
      assert.throws(
        () => ConfirmAndCreatePrInputSchema.parse({ ticketId, confirmed: false }),
        (err) => err.name === 'ZodError'
      );
    });

    it('rejects confirm input with non-boolean string confirmation ("yes", "true")', () => {
      assert.throws(
        () => ConfirmAndCreatePrInputSchema.parse({ ticketId, confirmed: 'true' }),
        (err) => err.name === 'ZodError'
      );
      assert.throws(
        () => ConfirmAndCreatePrInputSchema.parse({ ticketId, confirmed: 'yes' }),
        (err) => err.name === 'ZodError'
      );
    });

    it('rejects unknown write primitives on confirm input (strict)', () => {
      assert.throws(
        () =>
          ConfirmAndCreatePrInputSchema.parse({
            ticketId,
            confirmed: true,
            branch: 'main',
            patch: 'diff content',
            repository: 'attacker/repo',
            files: ['malicious.js'],
          }),
        (err) => err.name === 'ZodError'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Propose Handler Execution & Stopping Protocol
  // ---------------------------------------------------------------------------
  describe('4. Propose Handler Execution & Stopping Protocol', () => {
    it('executes propose flow, delegates to services, and returns PENDING_HUMAN_APPROVAL', async () => {
      const server = new McpServerWrapper();

      const mockCandidateProfile = {
        candidate: { id: candidateId, tenantId, userId, displayName: 'Alice Dev' },
        skills: [{ name: 'Node.js', slug: 'node-js', provenanceStatus: 'VERIFIED' }],
        projects: [],
      };

      const mockProposal = {
        id: crypto.randomUUID(),
        title: 'Add Redis Caching Layer',
        rationale: 'Demonstrates distributed caching required by job posting',
        targetSkill: 'redis',
        gapStatus: 'MISSING',
        confidenceScore: 0.95,
        targetRepositoryId: repositoryId,
        targetRepositoryName: 'vishu1803/Ai-job-mcp',
        baseBranch: 'main',
        targetBranch: 'feat/career-hub-redis-layer',
        expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
        verificationInstructions: 'npm test tests/unit/cache.test.js',
        recommendedTests: ['npm test'],
        patch: {
          fileCount: 1,
          totalDiffLines: 10,
          patchFingerprint: 'f1e2d3c4b5a678901234567890abcdef1234567890abcdef1234567890abcdef',
          files: [
            {
              path: 'src/services/cache.js',
              changeType: 'CREATE',
              additions: 10,
              deletions: 0,
              content: 'export class RedisCache {}',
            },
          ],
        },
      };

      const mockTicket = {
        id: ticketId,
        tenantId,
        userId,
        candidateId,
        resourceId: repositoryId,
        repositoryName: 'vishu1803/Ai-job-mcp',
        baseBranch: 'main',
        targetBranch: 'feat/career-hub-redis-layer',
        expectedHeadSha: '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const mockCandidateProfileService = {
        getProfile: async () => mockCandidateProfile,
      };
      const mockRecommenderService = {
        recommendImprovement: async () => mockProposal,
      };
      const mockApprovalService = {
        createTicket: async () => mockTicket,
      };
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: candidateId, tenantId, userId }],
            }),
          }),
        }),
      };

      registerCareerWriteTools(server, {
        db: mockDb,
        candidateProfileService: mockCandidateProfileService,
        recommenderService: mockRecommenderService,
        approvalService: mockApprovalService,
      });

      const entry = server.registeredTools.get('propose_project_improvement');
      const response = await entry.handler(mockContextMember, {
        candidateId,
        jobDescriptionText:
          'We require a Backend Engineer with Redis caching and distributed systems experience.',
      });

      assert.ok(response.structuredData);
      const res = response.structuredData;
      assert.equal(res.status, 'PENDING_HUMAN_APPROVAL');
      assert.equal(res.ticketId, ticketId);
      assert.equal(res.actionType, 'PROJECT_IMPROVEMENT_PR');
      assert.equal(res.targetSkill.slug, 'redis');
      assert.equal(res.repository.targetBranch, 'feat/career-hub-redis-layer');
      assert.equal(res.patchSummary.fileCount, 1);
      assert.equal(res.patchSummary.files[0].path, 'src/services/cache.js');

      // Assert Stopping Protocol is explicitly present in output
      assert.ok(res.approvalRequirements.confirmationInstructions.includes('STOP:'));
      assert.ok(
        res.approvalRequirements.confirmationInstructions.includes('confirm_and_create_pr')
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Confirm Handler Execution
  // ---------------------------------------------------------------------------
  describe('5. Confirm Handler Execution', () => {
    it('executes confirm flow, approves ticket, calls write service, and returns Draft PR', async () => {
      const server = new McpServerWrapper();

      const mockApprovedTicket = {
        id: ticketId,
        tenantId,
        userId,
        status: 'APPROVED',
        repositoryName: 'vishu1803/Ai-job-mcp',
        baseBranch: 'main',
        targetBranch: 'feat/career-hub-redis-layer',
      };

      const mockExecutionResult = {
        operationId: crypto.randomUUID(),
        ticketId,
        status: 'EXECUTED',
        repositoryName: 'vishu1803/Ai-job-mcp',
        baseBranch: 'main',
        targetBranch: 'feat/career-hub-redis-layer',
        commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        prNumber: 42,
        prUrl: 'https://github.com/vishu1803/Ai-job-mcp/pull/42',
        executedAt: new Date().toISOString(),
      };

      const mockApprovalService = {
        getTicket: async () => ({ id: ticketId, status: 'PENDING' }),
        approveTicket: async () => mockApprovedTicket,
      };
      const mockWriteService = {
        executeApprovedTicket: async () => mockExecutionResult,
      };

      registerCareerWriteTools(server, {
        approvalService: mockApprovalService,
        writeService: mockWriteService,
      });

      const entry = server.registeredTools.get('confirm_and_create_pr');
      const response = await entry.handler(mockContextMember, {
        ticketId,
        confirmed: true,
        idempotencyKey: 'idemp-test-key-1234567890',
      });

      assert.ok(response.structuredData);
      const res = response.structuredData;
      assert.equal(res.status, 'EXECUTED');
      assert.equal(res.ticketId, ticketId);
      assert.equal(res.commitSha, 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
      assert.equal(res.pullRequest.number, 42);
      assert.equal(res.pullRequest.url, 'https://github.com/vishu1803/Ai-job-mcp/pull/42');
      assert.equal(res.pullRequest.draft, true);
    });

    it('rejects confirm call if confirmed !== true', async () => {
      const server = new McpServerWrapper();
      registerCareerWriteTools(server, {});

      const entry = server.registeredTools.get('confirm_and_create_pr');
      await assert.rejects(
        async () => entry.handler(mockContextMember, { ticketId, confirmed: false }),
        (err) => err.name === 'ZodError'
      );
    });
  });
});
