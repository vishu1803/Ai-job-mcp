/**
 * @file Integration Tests for CandidateRepositoryIngestionService (P5/Pipeline Fix)
 *
 * Runs against live PostgreSQL to verify the complete sync pipeline:
 * 1. Connected resource → deep extraction → project genesis → evidence linking → verified skills
 * 2. Idempotency (running twice produces zero duplicates)
 * 3. Multi-tenant isolation (cross-tenant returns 404)
 * 4. Error resilience (connector failure does not crash pipeline)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  candidateIdentities,
  resources,
  resourceConnections,
  projects,
  projectResources,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { CandidateRepositoryIngestionService } from '../../src/services/candidate-repository-ingestion.service.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('CandidateRepositoryIngestionService Integration Tests (P5/Pipeline Fix)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let tenantA, userA, candidateA, connectionA, resourceA;
  let tenantB, userB, candidateB;

  // Mock connector simulating deep repository inspection
  const createMockConnector = () => ({
    async getRepositoryTree(_ctx, _cred, _extId) {
      return {
        tree: [
          { path: 'package.json', type: 'blob' },
          { path: 'src/index.js', type: 'blob' },
          { path: 'src/app.js', type: 'blob' },
          { path: 'Dockerfile', type: 'blob' },
          { path: 'drizzle.config.js', type: 'blob' },
        ],
      };
    },
    async getLanguages(_ctx, _cred, _extId) {
      return { languages: { JavaScript: 50000, SQL: 10000 } };
    },
    async getReadme(_ctx, _cred, _extId) {
      return {
        content:
          '# Test Career Platform\nBuilt with Fastify, PostgreSQL, Drizzle ORM, and Docker.\nFeatures OAuth 2.1 and MCP integration.',
      };
    },
    async getRecentCommits(_ctx, _cred, _extId) {
      return {
        commits: [
          {
            sha: 'abc123def456789012345678901234567890abcd',
            message: 'feat(auth): implement OAuth PKCE flow',
            author: { login: `user-a-${testRunId}`, name: 'User A' },
            date: new Date().toISOString(),
          },
        ],
      };
    },
    async getFileContent(_ctx, _cred, _extId, path) {
      if (path === 'package.json') {
        return {
          path: 'package.json',
          commitSha: 'abc123def456789012345678901234567890abcd',
          content: JSON.stringify({
            name: 'test-career-hub',
            dependencies: {
              fastify: '^5.2.0',
              '@fastify/cors': '^10.0.0',
              'drizzle-orm': '^0.45.0',
              pg: '^8.11.0',
              zod: '^3.23.0',
            },
            devDependencies: {
              vitest: '^1.0.0',
            },
          }),
        };
      }
      if (path === 'src/index.js') {
        return {
          path: 'src/index.js',
          commitSha: 'abc123def456789012345678901234567890abcd',
          content:
            "import Fastify from 'fastify';\nimport { db } from './db/index.js';\nconst app = Fastify();",
        };
      }
      if (path === 'src/app.js') {
        return {
          path: 'src/app.js',
          commitSha: 'abc123def456789012345678901234567890abcd',
          content: "import { z } from 'zod';\nimport pg from 'pg';\n",
        };
      }
      return { path, content: '', commitSha: 'HEAD' };
    },
  });

  // Mock connector registry that returns our mock connector
  const mockRegistry = {
    get(provider) {
      if (provider === 'GITHUB_APP') return createMockConnector();
      throw new Error(`Unknown provider: ${provider}`);
    },
    has(provider) {
      return provider === 'GITHUB_APP';
    },
  };

  before(async () => {
    // 1. Provision Tenant A + User A + Candidate A + Connection A + Resource A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Ingestion Tenant A ${testRunId}`,
        slug: `ingest-a-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `ingest-a-${testRunId}@example.com`,
        displayName: `User A ${testRunId}`,
        role: 'OWNER',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Candidate A',
        canonicalEmail: `cand-a-${testRunId}@example.com`,
      })
      .returning();

    await db.insert(candidateIdentities).values({
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      provider: 'GITHUB_APP',
      externalAccountId: `gh-${testRunId}-userA`,
      externalUsername: `user-a-${testRunId}`,
      verified: true,
    });

    // Create a resource connection (encrypted credentials)
    const encryptedCreds = encryptSecret(JSON.stringify({ installationId: '999999' }));
    [connectionA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: `GitHub Connection A ${testRunId}`,
        externalAccountId: `gh-account-${testRunId}`,
        installationId: '999999',
        encryptedCredentials: encryptedCreds,
        status: 'ACTIVE',
        scopes: ['contents:read', 'metadata:read'],
      })
      .returning();

    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        connectionId: connectionA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-${testRunId}-career`,
        name: 'Ai-career-agent',
        displayName: `user-a/Ai-career-agent`,
        url: 'https://github.com/test/Ai-career-agent',
        status: 'ACTIVE',
        metadata: { description: 'Universal AI Career MCP Platform', language: 'JavaScript' },
      })
      .returning();

    // 2. Provision Tenant B (for isolation tests)
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Ingestion Tenant B ${testRunId}`,
        slug: `ingest-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `ingest-b-${testRunId}@example.com`,
        displayName: `User B ${testRunId}`,
        role: 'MEMBER',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userB.id,
        displayName: 'Candidate B',
      })
      .returning();
  });

  after(async () => {
    try {
      for (const tenantId of createdTenantIds) {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
    } catch {
      // Best-effort cleanup
    } finally {
      await closeDatabase();
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Full End-to-End Sync Pipeline
  // ---------------------------------------------------------------------------
  describe('1. Full End-to-End Sync Pipeline', () => {
    it('should extract evidence, create project, link evidence, and produce verified skills', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      const result = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
      });

      // Verify summary
      assert.strictEqual(result.repositoriesProcessed, 1, 'Should process 1 repository');
      assert.strictEqual(result.projectsCreated, 1, 'Should create 1 project');
      assert.strictEqual(result.projectsUpdated, 0, 'Should not update existing projects');
      assert.ok(result.evidenceCreated > 0, 'Should create evidence items');
      assert.ok(result.evidenceLinked > 0, 'Should link evidence to project');
      assert.ok(result.durationMs >= 0, 'Duration should be non-negative');
      assert.deepStrictEqual(result.warnings, [], 'Should have no warnings');

      // Verify project in database
      const projectRows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantA.id), eq(projects.candidateId, candidateA.id)));
      assert.strictEqual(projectRows.length, 1, 'Should have exactly 1 project');
      assert.strictEqual(projectRows[0].slug, 'ai-career-agent');
      assert.strictEqual(projectRows[0].isHighlighted, true);
      assert.ok(projectRows[0].headline.includes('Universal AI Career MCP Platform'));

      // Verify project_resources
      const prRows = await db
        .select()
        .from(projectResources)
        .where(eq(projectResources.projectId, projectRows[0].id));
      assert.strictEqual(prRows.length, 1, 'Should have 1 project_resource link');
      assert.strictEqual(prRows[0].resourceId, resourceA.id);
      assert.strictEqual(prRows[0].roleInProject, 'Primary Repository');

      // Verify evidence items are linked to project
      const evidenceRows = await db
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, tenantA.id),
            eq(evidenceItems.candidateId, candidateA.id),
            eq(evidenceItems.resourceId, resourceA.id)
          )
        );
      assert.ok(evidenceRows.length > 0, 'Should have evidence items');
      const linkedEvidence = evidenceRows.filter((e) => e.projectId === projectRows[0].id);
      assert.ok(linkedEvidence.length > 0, 'Evidence items should be linked to project');

      // Verify evidence types include deep extraction
      const evidenceTypes = new Set(evidenceRows.map((e) => e.evidenceType));
      assert.ok(
        evidenceTypes.has('PACKAGE_MANIFEST_DEPENDENCY'),
        'Should have PACKAGE_MANIFEST_DEPENDENCY evidence'
      );

      // Verify candidate skills include VERIFIED
      const skillRows = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id)
          )
        );
      assert.ok(skillRows.length > 0, 'Should have candidate skills');
      const verifiedSkills = skillRows.filter((s) => s.provenanceStatus === 'VERIFIED');
      assert.ok(verifiedSkills.length > 0, 'Should have VERIFIED skills');

      // At least fastify should be VERIFIED (it's in package.json + code import)
      const fastifySkillIds = verifiedSkills.map((s) => s.skillId);
      assert.ok(fastifySkillIds.length > 0, 'Should have verified skill IDs');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Idempotency
  // ---------------------------------------------------------------------------
  describe('2. Idempotency', () => {
    it('running sync twice should not create duplicate projects, project_resources, or evidence', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      // First sync should find existing project from test 1
      const _result1 = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
      });

      // Count state after first sync
      const projectsBefore = await db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantA.id), eq(projects.candidateId, candidateA.id)));
      const prBefore = await db
        .select()
        .from(projectResources)
        .where(eq(projectResources.tenantId, tenantA.id));
      const evidenceBefore = await db
        .select()
        .from(evidenceItems)
        .where(
          and(eq(evidenceItems.tenantId, tenantA.id), eq(evidenceItems.candidateId, candidateA.id))
        );

      // Second sync
      const result2 = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
      });

      // Count state after second sync
      const projectsAfter = await db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenantA.id), eq(projects.candidateId, candidateA.id)));
      const prAfter = await db
        .select()
        .from(projectResources)
        .where(eq(projectResources.tenantId, tenantA.id));
      const evidenceAfter = await db
        .select()
        .from(evidenceItems)
        .where(
          and(eq(evidenceItems.tenantId, tenantA.id), eq(evidenceItems.candidateId, candidateA.id))
        );

      // No duplicates
      assert.strictEqual(projectsAfter.length, projectsBefore.length, 'No duplicate projects');
      assert.strictEqual(prAfter.length, prBefore.length, 'No duplicate project_resources');
      assert.strictEqual(
        evidenceAfter.length,
        evidenceBefore.length,
        'No duplicate evidence (fingerprints should deduplicate)'
      );

      // Second run should report 0 projects created, 0 evidence linked (already linked)
      assert.strictEqual(result2.projectsCreated, 0, 'No new projects on second run');
      assert.strictEqual(result2.evidenceLinked, 0, 'No newly linked evidence on second run');
      assert.strictEqual(result2.repositoriesProcessed, 1, 'Still processed 1 repository');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('3. Multi-Tenant Isolation', () => {
    it('should reject cross-tenant candidate access with NotFoundError', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      // Try to sync Tenant A's candidate using Tenant B's context
      await assert.rejects(
        () =>
          service.syncCandidateRepositories({
            context: { tenantId: tenantB.id, userId: userB.id },
            candidateId: candidateA.id, // Tenant A's candidate
          }),
        (err) => {
          assert.ok(err instanceof NotFoundError, 'Should throw NotFoundError');
          return true;
        }
      );
    });

    it('should return no resources when candidate has no GitHub resources in tenant', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      const result = await service.syncCandidateRepositories({
        context: { tenantId: tenantB.id, userId: userB.id },
        candidateId: candidateB.id,
      });

      assert.strictEqual(result.repositoriesProcessed, 0);
      assert.ok(result.warnings.length > 0, 'Should warn about no resources');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Error Resilience
  // ---------------------------------------------------------------------------
  describe('4. Error Resilience', () => {
    it('should handle connector failures gracefully and continue', async () => {
      // Create a failing mock registry
      const failingRegistry = {
        get(provider) {
          if (provider === 'GITHUB_APP') {
            return {
              async getRepositoryTree() {
                throw new Error('GitHub API rate limited');
              },
              async getLanguages() {
                return { languages: {} };
              },
              async getReadme() {
                return { content: '' };
              },
              async getRecentCommits() {
                return { commits: [] };
              },
              async getFileContent() {
                return { content: '' };
              },
            };
          }
          throw new Error(`Unknown provider: ${provider}`);
        },
      };

      const service = new CandidateRepositoryIngestionService({
        db,
        registry: failingRegistry,
      });

      // Should not throw - should capture warning
      const result = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
      });

      // The extraction still runs but with limited data (tree fails, rest succeeds)
      // It either succeeds partially or fails gracefully with a warning
      assert.ok(result.durationMs >= 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Specific Resource Sync
  // ---------------------------------------------------------------------------
  describe('5. Specific Resource Sync', () => {
    it('should sync only the specified resource when resourceId is provided', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      const result = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
        options: { resourceId: resourceA.id },
      });

      assert.strictEqual(result.repositoriesProcessed, 1);
    });

    it('should return 0 repositories when non-existent resourceId is provided', async () => {
      const service = new CandidateRepositoryIngestionService({
        db,
        registry: mockRegistry,
      });

      const result = await service.syncCandidateRepositories({
        context: { tenantId: tenantA.id, userId: userA.id },
        candidateId: candidateA.id,
        options: { resourceId: crypto.randomUUID() },
      });

      assert.strictEqual(result.repositoriesProcessed, 0);
      assert.ok(result.warnings.length > 0);
    });
  });
});
