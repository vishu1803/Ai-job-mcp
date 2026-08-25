/**
 * @file GitHub Write Safety Kernel Service Unit Tests (Task P9-004 / ARCH-034 / ADR-055)
 *
 * Comprehensive unit and property-based test matrix for Centralized GitHub Write Safety Service:
 * - Valid feature branch policy
 * - Static & dynamic protected default branch rejection
 * - Target vs base branch separation
 * - Git ref whitelist & dangerous ref rejection
 * - Path traversal, absolute paths, and backslash rejection
 * - CI/CD workflow defense matrix (.github/workflows/*, actions, hooks)
 * - Environment & credential file blocking (.env*, *.pem, *.key, id_rsa)
 * - 38-extension binary file rejection & binary content sniffing
 * - Patch file count, line count, and payload size ceilings
 * - Pre-execution Shannon entropy secret scanning across contents and metadata
 * - Live base branch HEAD SHA optimistic concurrency locking
 * - Token permission scoping invariants
 * - Approval ticket cryptographic binding and tenant sovereign isolation
 * - Master validateExecutionSafetyGate atomic evaluation and audit logging
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubWriteSafetyService } from '../../src/services/github-write-safety.service.js';
import { computePatchFingerprint } from '../../src/domain/career/project-improvement.schemas.js';
import {
  ForbiddenOperationError,
  ProtectedDefaultBranchError,
  InvalidGitRefError,
  PatchPolicyViolationError,
  WorkflowModificationError,
  SecretDetectedError,
  StaleHeadShaError,
  ApprovalTicketStateError,
  InvalidTicketSignatureError,
  NotFoundError,
  ValidationError,
} from '../../src/errors/index.js';

describe('GitHub Write Safety Service Unit Tests (P9-004)', () => {
  let safetyService;
  let recordedAuditEvents;
  let mockAuditService;

  beforeEach(() => {
    recordedAuditEvents = [];
    mockAuditService = {
      logAuditEvent: async (context, event) => {
        recordedAuditEvents.push({ context, event });
        return { id: 'audit-123' };
      },
    };
    safetyService = new GitHubWriteSafetyService({ auditService: mockAuditService });
  });

  // ---------------------------------------------------------------------------
  // 1. Branch Policy & Protected Default Branch
  // ---------------------------------------------------------------------------
  describe('1. Branch Policy & Protected Branch Enforcement', () => {
    it('1. Accepts valid canonical feature branch names', () => {
      const validBranches = [
        'feat/career-hub-redis-cache',
        'feat/career-hub-graphql-api',
        'feat/career-hub-auth-jwt-123',
        'feat/career-hub-a',
        'feat/career-hub-1234567890',
      ];

      for (const branch of validBranches) {
        assert.doesNotThrow(() => {
          safetyService.validateBranchPolicy({
            targetBranch: branch,
            baseBranch: 'main',
            repositoryDefaultBranch: 'main',
          });
        });
      }
    });

    it('2. Rejects static protected branches (main, master, develop, prod, staging)', () => {
      const protectedBranches = [
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
        'qa',
        'gh-pages',
      ];

      for (const branch of protectedBranches) {
        assert.throws(
          () =>
            safetyService.validateBranchPolicy({
              targetBranch: branch,
              baseBranch: 'main',
              repositoryDefaultBranch: 'main',
            }),
          (err) => err instanceof ProtectedDefaultBranchError || err instanceof InvalidGitRefError
        );
      }
    });

    it('3. Rejects protected prefix branches (release/*, prod/*, v*, hotfix/*)', () => {
      const prefixBranches = [
        'release/v1.0.0',
        'release-2026',
        'prod/live',
        'prod-us-east',
        'production/deploy',
        'v1.2.3',
        'hotfix/patch-1',
        'patch/security-fix',
      ];

      for (const branch of prefixBranches) {
        assert.throws(
          () =>
            safetyService.validateBranchPolicy({
              targetBranch: branch,
              baseBranch: 'main',
              repositoryDefaultBranch: 'main',
            }),
          (err) => err instanceof ForbiddenOperationError
        );
      }
    });

    it('4. Rejects dynamically discovered repository default branch', () => {
      assert.throws(
        () =>
          safetyService.validateBranchPolicy({
            targetBranch: 'feat/career-hub-custom-default',
            baseBranch: 'feat/career-hub-custom-default',
            repositoryDefaultBranch: 'feat/career-hub-custom-default',
          }),
        (err) =>
          err instanceof ProtectedDefaultBranchError || err instanceof ForbiddenOperationError
      );
    });

    it('5. Rejects when target branch equals base branch', () => {
      assert.throws(
        () =>
          safetyService.validateBranchPolicy({
            targetBranch: 'feat/career-hub-auth-jwt',
            baseBranch: 'feat/career-hub-auth-jwt',
            repositoryDefaultBranch: 'main',
          }),
        (err) =>
          err instanceof ForbiddenOperationError && err.message.includes('cannot equal base branch')
      );
    });

    it('6. Rejects malformed branch names (uppercase, underscores, dots, special chars)', () => {
      const malformed = [
        'feat/career-hub-UPPERCASE',
        'feat/career_hub_underscore',
        'feat/career-hub.dot',
        'feat/career-hub:colon',
        'feat/career-hub branch with space',
        'feat/career-hub-@special',
        'feature/career-hub-wrong-prefix',
        'feat/career-hub-', // trailing hyphen
        '',
      ];

      for (const branch of malformed) {
        assert.throws(
          () =>
            safetyService.validateBranchPolicy({
              targetBranch: branch,
              baseBranch: 'main',
              repositoryDefaultBranch: 'main',
            }),
          (err) => err instanceof InvalidGitRefError || err instanceof ValidationError
        );
      }
    });

    it('7. Rejects branch names exceeding 64 characters', () => {
      const longBranch = `feat/career-hub-${'a'.repeat(55)}`;
      assert.ok(longBranch.length > 64);

      assert.throws(
        () =>
          safetyService.validateBranchPolicy({
            targetBranch: longBranch,
            baseBranch: 'main',
            repositoryDefaultBranch: 'main',
          }),
        (err) => err instanceof InvalidGitRefError && err.message.includes('exceeds maximum')
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Git Ref Whitelist & Sanitization
  // ---------------------------------------------------------------------------
  describe('2. Git Ref Whitelist & Sanitization', () => {
    it('8. Accepts valid refs/heads/feat/career-hub-* refs', () => {
      const validRef = 'refs/heads/feat/career-hub-redis-123';
      const canonical = safetyService.validateGitRef(validRef);
      assert.equal(canonical, validRef);

      const shorthand = 'feat/career-hub-redis-123';
      const normalized = safetyService.validateGitRef(shorthand);
      assert.equal(normalized, 'refs/heads/feat/career-hub-redis-123');
    });

    it('9. Rejects non-heads namespaces (tags, remotes, pull, notes, stash)', () => {
      const invalidRefs = [
        'refs/tags/v1.0.0',
        'refs/remotes/origin/main',
        'refs/pull/42/head',
        'refs/notes/commits',
        'refs/stash',
      ];

      for (const ref of invalidRefs) {
        assert.throws(
          () => safetyService.validateGitRef(ref),
          (err) => err instanceof InvalidGitRefError && err.message.includes('prohibited namespace')
        );
      }
    });

    it('10. Rejects dangerous characters and traversal sequences in Git refs', () => {
      const dangerousRefs = [
        'refs/heads/feat/career-hub-../escape',
        'refs/heads/feat/career-hub-null\0byte',
        'refs/heads/feat/career-hub-back\\slash',
        'refs/heads/feat/career-hub-//doubleslash',
        'refs/heads/feat/career-hub-@{reflog}',
        'refs/heads/feat/career-hub-~revision',
        'refs/heads/feat/career-hub-^parent',
        'refs/heads/feat/career-hub-:colon',
        'refs/heads/feat/career-hub-*glob',
        'refs/heads/feat/career-hub-[bracket]',
      ];

      for (const ref of dangerousRefs) {
        assert.throws(
          () => safetyService.validateGitRef(ref),
          (err) => err instanceof InvalidGitRefError
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Patch Policy & Defense-in-Depth
  // ---------------------------------------------------------------------------
  describe('3. Patch Policy & Defense-in-Depth', () => {
    it('11. Accepts valid text files with relative POSIX paths', () => {
      const files = [
        { path: 'src/services/cache.js', content: 'export class CacheService {}\n' },
        { path: 'tests/cache.test.js', content: 'import assert from "node:assert";\n' },
      ];

      assert.doesNotThrow(() => {
        safetyService.validatePatchPolicy({ files });
      });
    });

    it('12. Rejects path traversal and absolute paths in patch files', () => {
      const badPaths = [
        '../../etc/passwd',
        '..\\windows\\system32',
        '/var/www/index.js',
        '/src/services/cache.js',
        'src/services/../../app.js',
        'C:\\app\\index.js',
      ];

      for (const badPath of badPaths) {
        assert.throws(
          () => safetyService.validatePatchPolicy({ files: [{ path: badPath, content: 'code' }] }),
          (err) => err instanceof PatchPolicyViolationError
        );
      }
    });

    it('13. Rejects CI/CD workflow and action files', () => {
      const workflowPaths = [
        '.github/workflows/deploy.yml',
        '.github/workflows/ci.yaml',
        '.github/actions/setup/action.yml',
        '.gitlab-ci.yml',
        'Jenkinsfile',
        '.circleci/config.yml',
        '.travis.yml',
        'azure-pipelines.yml',
        'bitbucket-pipelines.yml',
      ];

      for (const wfPath of workflowPaths) {
        assert.throws(
          () => safetyService.validatePatchPolicy({ files: [{ path: wfPath, content: 'steps:' }] }),
          (err) => err instanceof WorkflowModificationError
        );
      }
    });

    it('14. Rejects environment, key, and credential files', () => {
      const secretPaths = [
        '.env',
        '.env.production',
        '.env.local',
        'id_rsa',
        'server.pem',
        'jwt.key',
        'cert.pfx',
        'keystore.p12',
        'credentials.json',
        'service-account.json',
        '.htpasswd',
        '.netrc',
      ];

      for (const secPath of secretPaths) {
        assert.throws(
          () =>
            safetyService.validatePatchPolicy({ files: [{ path: secPath, content: 'secret' }] }),
          (err) => err instanceof PatchPolicyViolationError
        );
      }
    });

    it('15. Rejects dot-control directories (.git, .husky, .vscode, .idea)', () => {
      const dotPaths = [
        '.git/config',
        '.git/hooks/pre-commit',
        '.husky/pre-commit',
        '.githooks/pre-push',
        '.vscode/settings.json',
        '.idea/workspace.xml',
      ];

      for (const dotPath of dotPaths) {
        assert.throws(
          () => safetyService.validatePatchPolicy({ files: [{ path: dotPath, content: 'hook' }] }),
          (err) => err instanceof PatchPolicyViolationError
        );
      }
    });

    it('16. Rejects 38 binary file extensions', () => {
      const binarySample = [
        'build/app.exe',
        'lib/addon.node',
        'target/lib.so',
        'app.dylib',
        'App.class',
        'bundle.jar',
        'module.wasm',
        'archive.zip',
        'assets/logo.png',
        'docs/spec.pdf',
        'db/data.sqlite',
      ];

      for (const binPath of binarySample) {
        assert.throws(
          () => safetyService.validatePatchPolicy({ files: [{ path: binPath, content: 'bin' }] }),
          (err) =>
            err instanceof PatchPolicyViolationError && err.message.includes('binary extension')
        );
      }
    });

    it('17. Rejects binary payloads via null-byte content sniffing', () => {
      assert.throws(
        () =>
          safetyService.validatePatchPolicy({
            files: [{ path: 'src/safe.js', content: 'const a = 1;\0binarydata' }],
          }),
        (err) => err instanceof PatchPolicyViolationError && err.message.includes('null bytes')
      );
    });

    it('18. Enforces file count ceiling (<= 10 files)', () => {
      const files = Array.from({ length: 11 }, (_, i) => ({
        path: `src/file_${i}.js`,
        content: `export const f${i} = ${i};\n`,
      }));

      assert.throws(
        () => safetyService.validatePatchPolicy({ files }),
        (err) =>
          err instanceof PatchPolicyViolationError && err.message.includes('exceeds maximum of 10')
      );
    });

    it('19. Enforces line count ceiling (<= 500 lines per file)', () => {
      const content = 'line\n'.repeat(501);
      assert.throws(
        () => safetyService.validatePatchPolicy({ files: [{ path: 'src/huge.js', content }] }),
        (err) =>
          err instanceof PatchPolicyViolationError &&
          err.message.includes('exceeds maximum limit of 500 lines')
      );
    });

    it('20. Enforces total payload size limit (<= 100 KB)', () => {
      const bigContent = 'a'.repeat(102401);
      assert.throws(
        () =>
          safetyService.validatePatchPolicy({
            files: [{ path: 'src/big.js', content: bigContent }],
          }),
        (err) =>
          err instanceof PatchPolicyViolationError &&
          err.message.includes('exceeds maximum ceiling of 102400 bytes')
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Pre-Execution Secret Scanning
  // ---------------------------------------------------------------------------
  describe('4. Pre-Execution Secret Scanning Engine', () => {
    it('21. Rejects payload containing GitHub personal access tokens', () => {
      assert.throws(
        () =>
          safetyService.validateSecrets([
            'const token = "ghp_111111111111111111111111111111111111";',
          ]),
        (err) => err instanceof SecretDetectedError
      );
    });

    it('22. Rejects payload containing AWS access keys', () => {
      assert.throws(
        () => safetyService.validateSecrets(['export const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";']),
        (err) => err instanceof SecretDetectedError
      );
    });

    it('23. Rejects payload containing RSA / EC private keys', () => {
      assert.throws(
        () =>
          safetyService.validateSecrets([
            '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----',
          ]),
        (err) => err instanceof SecretDetectedError
      );
    });

    it('24. Passes clean code without secrets', () => {
      assert.doesNotThrow(() => {
        safetyService.validateSecrets([
          'export class RedisCacheService { constructor(client) { this.client = client; } }',
          'src/services/redis-cache.service.js',
          'Implement Redis Caching Layer',
        ]);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Optimistic Concurrency & Live Base HEAD SHA
  // ---------------------------------------------------------------------------
  describe('5. Live Base HEAD SHA Optimistic Concurrency', () => {
    const validSha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';

    it('25. Accepts matching commit SHAs (case-insensitive)', () => {
      assert.doesNotThrow(() => {
        safetyService.validateExpectedHeadSha({
          ticketExpectedHeadSha: validSha,
          liveBaseHeadSha: validSha.toUpperCase(),
          baseBranch: 'main',
        });
      });
    });

    it('26. Rejects diverged live base branch commit SHA with StaleHeadShaError', () => {
      assert.throws(
        () =>
          safetyService.validateExpectedHeadSha({
            ticketExpectedHeadSha: validSha,
            liveBaseHeadSha: '1111111111111111111111111111111111111111',
            baseBranch: 'main',
          }),
        (err) => err instanceof StaleHeadShaError && err.statusCode === 409
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Token Scope Scrutiny
  // ---------------------------------------------------------------------------
  describe('6. Installation Token Scope Verification', () => {
    it('27. Accepts minimal write permissions (contents: write, pull_requests: write)', () => {
      assert.doesNotThrow(() => {
        safetyService.validateWriteTokenScope({
          contents: 'write',
          pull_requests: 'write',
          metadata: 'read',
        });
      });
    });

    it('28. Rejects excessive administrative or workflow token permissions', () => {
      const badScopes = [
        { administration: 'write' },
        { workflows: 'write' },
        { actions: 'write' },
        { secrets: 'write' },
      ];

      for (const scope of badScopes) {
        assert.throws(
          () => safetyService.validateWriteTokenScope(scope),
          (err) =>
            err instanceof ForbiddenOperationError && err.message.includes('prohibited write scope')
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Approval Ticket Binding & Sovereign Isolation
  // ---------------------------------------------------------------------------
  describe('7. Cryptographic Approval Binding & Sovereign Isolation', () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const ticketId = '33333333-3333-4333-8333-333333333333';

    it('29. Rejects cross-tenant ticket execution with 404 NotFoundError', () => {
      const ticket = { id: ticketId, tenantId: 'different-tenant', status: 'APPROVED' };
      const context = { tenantId, userId };

      assert.throws(
        () => safetyService.validateApprovalBinding({ context, ticket }),
        (err) => err instanceof NotFoundError
      );
    });

    it('30. Rejects unapproved ticket execution (PENDING, REJECTED, CANCELLED)', () => {
      const context = { tenantId, userId };
      const unapprovedStatuses = ['PENDING', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED'];

      for (const status of unapprovedStatuses) {
        assert.throws(
          () =>
            safetyService.validateApprovalBinding({
              context,
              ticket: { id: ticketId, tenantId, status },
            }),
          (err) => err instanceof ApprovalTicketStateError
        );
      }
    });

    it('31. Rejects tampered proposal patch fingerprint', () => {
      const proposal = {
        id: 'prop-1',
        title: 'Title',
        files: [{ path: 'src/a.js', content: 'const a = 1;' }],
      };
      const ticket = {
        id: ticketId,
        tenantId,
        status: 'APPROVED',
        proposalId: 'prop-1',
        patchFingerprint: 'tampered_invalid_fingerprint',
      };
      const context = { tenantId, userId };

      assert.throws(
        () => safetyService.validateApprovalBinding({ context, ticket, proposal }),
        (err) => err instanceof InvalidTicketSignatureError
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Master Atomic Safety Gate & Audit Logging
  // ---------------------------------------------------------------------------
  describe('8. Master validateExecutionSafetyGate & Audit Logging', () => {
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const userId = '22222222-2222-4222-8222-222222222222';
    const ticketId = '33333333-3333-4333-8333-333333333333';
    const sha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';

    it('32. Evaluates full safety gate atomically and returns verified check report', () => {
      const proposal = {
        id: 'prop-1',
        title: 'Implement Redis Cache',
        rationale: 'Addresses missing skill',
        files: [{ path: 'src/cache.js', content: 'export class Cache {}\n' }],
      };
      const fingerprint = computePatchFingerprint(proposal);
      const ticket = {
        id: ticketId,
        tenantId,
        status: 'APPROVED',
        proposalId: 'prop-1',
        targetBranch: 'feat/career-hub-redis-123',
        baseBranch: 'main',
        expectedHeadSha: sha,
        patchFingerprint: fingerprint,
        proposal,
      };

      const result = safetyService.validateExecutionSafetyGate({
        context: { tenantId, userId },
        ticket,
        proposal,
        repositoryDefaultBranch: 'main',
        liveBaseHeadSha: sha,
        commitMessage: 'feat: implement redis cache',
        prTitle: 'Implement Redis Cache',
        prBody: 'Addresses missing skill',
        tokenPermissions: { contents: 'write', pull_requests: 'write' },
      });

      assert.equal(result.passed, true);
      assert.equal(result.checks.approvalBinding, true);
      assert.equal(result.checks.tenant, true);
      assert.equal(result.checks.defaultBranch, true);
      assert.equal(result.checks.targetBranch, true);
      assert.equal(result.checks.ref, true);
      assert.equal(result.checks.patch, true);
      assert.equal(result.checks.workflow, true);
      assert.equal(result.checks.secrets, true);
      assert.equal(result.checks.expectedHeadSha, true);
      assert.equal(result.checks.tokenScope, true);
    });

    it('33. Emits structured audit event when safety gate rejects an operation', async () => {
      const ticket = {
        id: ticketId,
        tenantId,
        status: 'APPROVED',
        targetBranch: 'main', // Protected branch violation
        baseBranch: 'main',
        expectedHeadSha: sha,
      };

      assert.throws(
        () =>
          safetyService.validateExecutionSafetyGate({
            context: { tenantId, userId },
            ticket,
            repositoryDefaultBranch: 'main',
            liveBaseHeadSha: sha,
          }),
        (err) => err instanceof InvalidGitRefError || err instanceof ProtectedDefaultBranchError
      );

      // Wait brief microtask for async audit logger
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.ok(recordedAuditEvents.length >= 1);
      const audit = recordedAuditEvents[0].event;
      assert.equal(audit.action, 'GITHUB_WRITE_BLOCKED');
      assert.equal(audit.status, 'BLOCKED');
      assert.equal(audit.resourceId, ticketId);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Property-Based / Fuzz Invariant Tests
  // ---------------------------------------------------------------------------
  describe('9. Fuzzing & Property Invariants', () => {
    it('34. Rejects 100 randomly generated illegal branch names', () => {
      const fuzzCharacters = [
        ' ',
        '$',
        '@',
        '!',
        '#',
        '%',
        '^',
        '&',
        '*',
        '(',
        ')',
        '+',
        '=',
        '{',
        '}',
        '[',
        ']',
        ':',
        ';',
        '"',
        "'",
        '<',
        '>',
        ',',
        '?',
        '/',
        '\\',
        '|',
        '~',
        '`',
      ];

      for (let i = 0; i < 100; i++) {
        const badChar = fuzzCharacters[i % fuzzCharacters.length];
        const fuzzedBranch = `feat/career-hub-test${badChar}${i}`;

        assert.throws(
          () =>
            safetyService.validateBranchPolicy({
              targetBranch: fuzzedBranch,
              baseBranch: 'main',
              repositoryDefaultBranch: 'main',
            }),
          (err) => err instanceof InvalidGitRefError
        );
      }
    });
  });
});
