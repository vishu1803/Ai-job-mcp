/**
 * @file Live Integration Tests for GitHub Evidence Extractor Service (P4-003)
 *
 * Runs against the active PostgreSQL database to verify:
 * 1. End-to-end repository evidence extraction, secret scrubbing, and taxonomy mapping
 * 2. Deterministic fingerprint deduplication across repeated scans
 * 3. Candidate skill rollup computation and provenance status assignment
 * 4. Multi-tenant isolation enforcement across candidate and resource bounds
 * 5. Secret redaction verification directly in database evidence items
 * 6. Foreign key cascades upon candidate or tenant deletion
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
  skills,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';
import { createConnectorContext } from '../../src/connectors/base/context.js';
import { GitHubEvidenceExtractorService } from '../../src/extractors/github/index.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Live GitHub Evidence Extractor Integration Tests (P4-003)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];
  const extractor = new GitHubEvidenceExtractorService();

  let tenantA;
  let userA;
  let candidateA;
  let resourceA;

  let tenantB;
  let userB;
  let candidateB;
  let resourceB;

  const makeContext = (tenant, user) =>
    createConnectorContext({
      tenantId: tenant.id,
      userId: user.id,
      connectionId: crypto.randomUUID(),
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      scopes: ['read:user', 'repo'],
    });

  // Mock GitHubAppConnector simulating deep repository inspection results
  const createMockConnector = (customManifest = null) => ({
    async getRepositoryTree(_ctx, _cred, _extId) {
      return {
        tree: [
          { path: 'package.json', type: 'blob' },
          { path: 'src/index.js', type: 'blob' },
          { path: 'Dockerfile', type: 'blob' },
          { path: 'drizzle.config.js', type: 'blob' },
          { path: '.github/workflows/ci.yml', type: 'blob' },
          { path: 'src/connectors/base/connector.js', type: 'blob' },
        ],
      };
    },
    async getLanguages(_ctx, _cred, _extId) {
      return {
        languages: {
          JavaScript: 45000,
          SQL: 12000,
        },
      };
    },
    async getReadme(_ctx, _cred, _extId) {
      return {
        content: '# Career Hub Platform\nBuilt with Fastify, PostgreSQL, Drizzle ORM, and Docker.',
      };
    },
    async getRecentCommits(_ctx, _cred, _extId) {
      return {
        commits: [
          {
            sha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
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
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          content:
            customManifest ||
            JSON.stringify({
              name: 'career-hub',
              dependencies: {
                fastify: '^5.2.0',
                '@fastify/cors': '^10.0.0',
                'drizzle-orm': '^0.45.0',
                pg: '^8.11.0',
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
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          content:
            "import fastify from 'fastify';\nimport { db } from './db/index.js';\nconst app = fastify();",
        };
      }
      return { path, content: '', commitSha: 'HEAD' };
    },
  });

  before(async () => {
    // 1. Provision Test Tenant A & Candidate A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Extractor Tenant A ${testRunId}`,
        slug: `extract-a-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `user-a-${testRunId}@example.com`,
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

    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-${testRunId}-core`,
        name: 'core-platform',
        displayName: `user-a-${testRunId}/core-platform`,
      })
      .returning();

    // 2. Provision Test Tenant B & Candidate B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Extractor Tenant B ${testRunId}`,
        slug: `extract-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `user-b-${testRunId}@example.com`,
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

    [resourceB] = await db
      .insert(resources)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-${testRunId}-b-repo`,
        name: 'b-repo',
        displayName: `user-b-${testRunId}/b-repo`,
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

  // -------------------------------------------------------------------------
  // 1. Full Extraction Pipeline
  // -------------------------------------------------------------------------
  describe('1. Full Extraction Pipeline', () => {
    it('extracts manifests, imports, infrastructure, and commits into evidence items and candidate skill rollups', async () => {
      const contextA = makeContext(tenantA, userA);

      const mockConnector = createMockConnector();

      const result = await extractor.extractRepositoryEvidence({
        context: contextA,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        connector: mockConnector,
        credentials: { installationId: '123456' },
      });

      assert.ok(result);
      assert.strictEqual(result.candidateId, candidateA.id);
      assert.strictEqual(result.resourceId, resourceA.id);
      assert.ok(result.evidenceCount > 0, 'Must extract evidence items');
      assert.ok(result.skillsCount > 0, 'Must normalize skills');

      // Verify evidence items in database
      const dbEvidence = await db
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, tenantA.id),
            eq(evidenceItems.candidateId, candidateA.id),
            eq(evidenceItems.resourceId, resourceA.id)
          )
        );

      assert.ok(dbEvidence.length >= 5);

      // Check for manifest evidence
      const fastifyEvidence = dbEvidence.find(
        (e) => e.evidenceType === 'PACKAGE_MANIFEST_DEPENDENCY' && e.excerpt?.includes('fastify')
      );
      assert.ok(fastifyEvidence);
      assert.strictEqual(fastifyEvidence.evidenceType, 'PACKAGE_MANIFEST_DEPENDENCY');
      assert.strictEqual(fastifyEvidence.confidenceScore, 1.0);

      // Verify candidate skills in database
      const dbCandidateSkills = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id)
          )
        );

      assert.ok(dbCandidateSkills.length >= 4);

      // Verify VERIFIED status for Fastify
      const [fastifySkillRow] = await db.select().from(skills).where(eq(skills.slug, 'fastify'));
      assert.ok(fastifySkillRow);

      const fastifyCandidateSkill = dbCandidateSkills.find(
        (cs) => cs.skillId === fastifySkillRow.id
      );
      assert.ok(fastifyCandidateSkill);
      assert.strictEqual(fastifyCandidateSkill.provenanceStatus, 'VERIFIED');
      assert.ok(fastifyCandidateSkill.confidenceScore >= 0.85);

      // Verify resource lastSyncedAt was updated
      const [updatedResource] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resourceA.id));
      assert.ok(updatedResource.lastSyncedAt);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Deterministic Deduplication & Idempotent Re-Extraction
  // -------------------------------------------------------------------------
  describe('2. Idempotent Deduplication Across Repeated Extractions', () => {
    it('executes repeated extraction without creating duplicate evidence items or candidate skills', async () => {
      const contextA = makeContext(tenantA, userA);

      const mockConnector = createMockConnector();

      // Count items before second scan
      const evidenceBefore = await db
        .select()
        .from(evidenceItems)
        .where(
          and(eq(evidenceItems.tenantId, tenantA.id), eq(evidenceItems.candidateId, candidateA.id))
        );
      const skillsBefore = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id)
          )
        );

      // Execute second scan with identical input
      const result2 = await extractor.extractRepositoryEvidence({
        context: contextA,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        connector: mockConnector,
        credentials: { installationId: '123456' },
      });

      assert.ok(result2);

      // Count items after second scan -> Must be identical!
      const evidenceAfter = await db
        .select()
        .from(evidenceItems)
        .where(
          and(eq(evidenceItems.tenantId, tenantA.id), eq(evidenceItems.candidateId, candidateA.id))
        );
      const skillsAfter = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id)
          )
        );

      assert.strictEqual(
        evidenceAfter.length,
        evidenceBefore.length,
        'Evidence count must not grow on idempotent re-scan'
      );
      assert.strictEqual(
        skillsAfter.length,
        skillsBefore.length,
        'Candidate skill count must not grow on idempotent re-scan'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Secret Redaction in Live Database Evidence
  // -------------------------------------------------------------------------
  describe('3. Secret Scrubber Live Database Redaction', () => {
    it('scrubs planted secrets from manifest excerpt before persisting to PostgreSQL', async () => {
      const contextA = makeContext(tenantA, userA);

      const plantedSecret = 'ghp_super_secret_github_token_9876543210123456';
      const maliciousManifest = JSON.stringify({
        name: 'secret-service',
        dependencies: {
          fastify: '^5.0.0',
          'secret-pkg': `1.0.0 // ${plantedSecret}`,
        },
      });

      const mockConnectorWithSecret = createMockConnector(maliciousManifest);

      await extractor.extractRepositoryEvidence({
        context: contextA,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        connector: mockConnectorWithSecret,
        credentials: { installationId: '123456' },
      });

      // Verify no evidence item in database contains the planted token
      const allEvidence = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.tenantId, tenantA.id));

      for (const item of allEvidence) {
        if (item.excerpt) {
          assert.strictEqual(
            item.excerpt.includes('ghp_super_secret'),
            false,
            'Planted GitHub token must be scrubbed from database excerpt'
          );
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Strict Multi-Tenant Isolation
  // -------------------------------------------------------------------------
  describe('4. Strict Multi-Tenant Isolation Barrier', () => {
    it('rejects cross-tenant candidate and resource access with 404 NotFoundError', async () => {
      // Context for Tenant A trying to access Tenant B candidate / resource
      const contextA = makeContext(tenantA, userA);

      const mockConnector = createMockConnector();

      // Tenant A context with Tenant B candidateId
      await assert.rejects(
        async () => {
          await extractor.extractRepositoryEvidence({
            context: contextA,
            candidateId: candidateB.id, // Cross-tenant candidate
            resourceId: resourceA.id,
            connector: mockConnector,
            credentials: { installationId: '123456' },
          });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('Candidate not found'));
          return true;
        }
      );

      // Tenant A context with Tenant B resourceId
      await assert.rejects(
        async () => {
          await extractor.extractRepositoryEvidence({
            context: contextA,
            candidateId: candidateA.id,
            resourceId: resourceB.id, // Cross-tenant resource
            connector: mockConnector,
            credentials: { installationId: '123456' },
          });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('Resource not found'));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Foreign Key Cascade Deletion
  // -------------------------------------------------------------------------
  describe('5. Foreign Key Cascade Semantics', () => {
    it('cascades evidence items and candidate skills when candidate is deleted', async () => {
      const [tempCand] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Temp Candidate',
        })
        .returning();

      const [tempRes] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          candidateId: tempCand.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-temp-${testRunId}`,
          name: 'temp-repo',
          displayName: 'user/temp-repo',
        })
        .returning();

      const contextTemp = makeContext(tenantA, userA);

      const mockConnector = createMockConnector();

      await extractor.extractRepositoryEvidence({
        context: contextTemp,
        candidateId: tempCand.id,
        resourceId: tempRes.id,
        connector: mockConnector,
        credentials: { installationId: '123456' },
      });

      // Verify items exist
      const evidenceBefore = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.candidateId, tempCand.id));
      assert.ok(evidenceBefore.length > 0);

      // Delete candidate
      await db.delete(candidates).where(eq(candidates.id, tempCand.id));

      // Assert evidence items were cascaded
      const evidenceAfter = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.candidateId, tempCand.id));
      assert.strictEqual(evidenceAfter.length, 0);

      // Clean up resource
      await db.delete(resources).where(eq(resources.id, tempRes.id));
    });
  });
});
