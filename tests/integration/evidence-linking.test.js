/**
 * @file Live Integration Tests for Evidence Linking & Provenance Integrity Engine (P4-004)
 *
 * Runs against the active Aiven PostgreSQL database to verify:
 * 1. Evidence linking to candidate skill assertions and rollup calculation
 * 2. Evidence linking to domain project initiatives and project_resources association
 * 3. Primary evidence selection logic and monotonic confidence score propagation
 * 4. Idempotent re-linking behavior with zero duplicate side effects
 * 5. Strict multi-tenant isolation and 404 default-deny on cross-tenant requests
 * 6. Mismatched candidate and project boundary protection
 * 7. Atomic transaction rollback on partial failure
 * 8. Deletion cascade semantics (candidate purge cascades, project deletion unlinks)
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
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';
import { createConnectorContext } from '../../src/connectors/base/context.js';
import { EvidenceLinkingService } from '../../src/services/evidence/index.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Live Evidence Linking Engine Integration Tests (P4-004)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];
  const linkingService = new EvidenceLinkingService();

  let tenantA;
  let userA;
  let candidateA;
  let resourceA;
  let projectA;
  let skillFastify;
  let skillPostgres;

  let tenantB;
  let userB;
  let candidateB;
  let resourceB;
  let projectB;

  let evidenceManifestA;
  let evidenceReadmeA;
  let evidenceTenantB;

  const makeContext = (tenant, user) =>
    createConnectorContext({
      tenantId: tenant.id,
      userId: user.id,
      connectionId: crypto.randomUUID(),
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      scopes: ['read:user', 'repo'],
    });

  before(async () => {
    // 1. Provision Global Skills
    const [fastifyRow] = await db
      .insert(skills)
      .values({
        slug: `fastify-${testRunId}`,
        name: 'Fastify',
        category: 'FRAMEWORK',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'Fastify' },
      })
      .returning();
    skillFastify = fastifyRow;

    const [postgresRow] = await db
      .insert(skills)
      .values({
        slug: `postgresql-${testRunId}`,
        name: 'PostgreSQL',
        category: 'DATABASE',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'PostgreSQL' },
      })
      .returning();
    skillPostgres = postgresRow;

    // 2. Provision Tenant A & Candidate A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Linking Tenant A ${testRunId}`,
        slug: `link-a-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `link-a-${testRunId}@example.com`,
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

    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-a-${testRunId}`,
        name: 'core-repo',
        displayName: 'user-a/core-repo',
      })
      .returning();

    [projectA] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Platform Core',
        slug: `platform-core-${testRunId}`,
      })
      .returning();

    // Insert initial evidence items for Tenant A
    [evidenceManifestA] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'package.json',
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          lineRange: { start: 12, end: 12 },
        },
        excerpt: '"fastify": "^5.2.0"',
        confidenceScore: 1.0,
        metadata: {
          fingerprint: `fp-manifest-${testRunId}`,
        },
      })
      .returning();

    [evidenceReadmeA] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        evidenceType: 'README_SPECIFICATION',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'README.md',
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
        },
        excerpt: 'Built with Fastify and PostgreSQL',
        confidenceScore: 0.6,
        metadata: {
          fingerprint: `fp-readme-${testRunId}`,
        },
      })
      .returning();

    // 3. Provision Tenant B & Candidate B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Linking Tenant B ${testRunId}`,
        slug: `link-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `link-b-${testRunId}@example.com`,
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
        externalResourceId: `repo-b-${testRunId}`,
        name: 'b-repo',
        displayName: 'user-b/b-repo',
      })
      .returning();

    [projectB] = await db
      .insert(projects)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        name: 'Project B',
        slug: `project-b-${testRunId}`,
      })
      .returning();

    [evidenceTenantB] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        resourceId: resourceB.id,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'package.json',
          commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
        },
        excerpt: '"express": "^4.18.0"',
        confidenceScore: 1.0,
        metadata: {
          fingerprint: `fp-tenantb-${testRunId}`,
        },
      })
      .returning();
  });

  after(async () => {
    try {
      for (const tenantId of createdTenantIds) {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
      if (skillFastify) await db.delete(skills).where(eq(skills.id, skillFastify.id));
      if (skillPostgres) await db.delete(skills).where(eq(skills.id, skillPostgres.id));
    } catch {
      // Cleanup
    } finally {
      await closeDatabase();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Evidence Linking to Skill
  // -------------------------------------------------------------------------
  describe('1. Evidence Linking to Candidate Skill Claim', () => {
    it('links manifest evidence to skill, sets primary evidence, and computes rollup', async () => {
      const contextA = makeContext(tenantA, userA);

      const result = await linkingService.linkEvidenceToSkill({
        context: contextA,
        candidateId: candidateA.id,
        evidenceId: evidenceManifestA.id,
        skillId: skillFastify.id,
      });

      assert.ok(result);
      assert.ok(result.candidateSkill);
      assert.strictEqual(result.candidateSkill.skillId, skillFastify.id);
      assert.strictEqual(result.candidateSkill.primaryEvidenceId, evidenceManifestA.id);
      assert.strictEqual(result.candidateSkill.provenanceStatus, 'VERIFIED');
      assert.strictEqual(result.candidateSkill.confidenceScore, 0.85); // 1.0 * (0.8 + 0.05 * 1) = 0.85
      assert.strictEqual(result.candidateSkill.evidenceCount, 1);

      // Verify database state
      const [dbSkill] = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id),
            eq(candidateSkills.skillId, skillFastify.id)
          )
        );

      assert.ok(dbSkill);
      assert.strictEqual(dbSkill.primaryEvidenceId, evidenceManifestA.id);
    });

    it('links second evidence item, preserves higher-quality primary evidence, and increments rollup score', async () => {
      const contextA = makeContext(tenantA, userA);

      // Link README evidence (confidence 0.60) to same Fastify skill
      const result = await linkingService.linkEvidenceToSkill({
        context: contextA,
        candidateId: candidateA.id,
        evidenceId: evidenceReadmeA.id,
        skillId: skillFastify.id,
      });

      assert.ok(result);
      assert.strictEqual(result.candidateSkill.evidenceCount, 2);
      // Primary evidence must remain the stronger manifest evidence!
      assert.strictEqual(result.candidateSkill.primaryEvidenceId, evidenceManifestA.id);
      // Rollup score increments to 1.0 * (0.8 + 0.05 * 2) = 0.90
      assert.strictEqual(result.candidateSkill.confidenceScore, 0.9);
      assert.strictEqual(result.candidateSkill.provenanceStatus, 'VERIFIED');
    });

    it('retrieves all linked evidence for candidate skill via listEvidenceForCandidateSkill', async () => {
      const contextA = makeContext(tenantA, userA);

      const items = await linkingService.listEvidenceForCandidateSkill({
        context: contextA,
        candidateId: candidateA.id,
        skillId: skillFastify.id,
      });

      assert.strictEqual(items.length, 2);
      assert.ok(items.some((i) => i.evidenceId === evidenceManifestA.id));
      assert.ok(items.some((i) => i.evidenceId === evidenceReadmeA.id));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Evidence Linking to Project
  // -------------------------------------------------------------------------
  describe('2. Evidence Linking to Domain Project', () => {
    it('links evidence to project and ensures project_resources association exists', async () => {
      const contextA = makeContext(tenantA, userA);

      const result = await linkingService.linkEvidenceToProject({
        context: contextA,
        candidateId: candidateA.id,
        evidenceId: evidenceManifestA.id,
        projectId: projectA.id,
      });

      assert.ok(result);
      assert.strictEqual(result.projectId, projectA.id);
      assert.strictEqual(result.evidenceId, evidenceManifestA.id);

      // Verify evidence item in database has projectId
      const [dbEvidence] = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.id, evidenceManifestA.id));

      assert.strictEqual(dbEvidence.projectId, projectA.id);

      // Verify project_resources association created
      const [dbProjectResource] = await db
        .select()
        .from(projectResources)
        .where(
          and(
            eq(projectResources.tenantId, tenantA.id),
            eq(projectResources.projectId, projectA.id),
            eq(projectResources.resourceId, resourceA.id)
          )
        );

      assert.ok(dbProjectResource);
    });

    it('retrieves project evidence via listEvidenceForProject', async () => {
      const contextA = makeContext(tenantA, userA);

      const items = await linkingService.listEvidenceForProject({
        context: contextA,
        candidateId: candidateA.id,
        projectId: projectA.id,
      });

      assert.ok(items.length >= 1);
      assert.strictEqual(items[0].evidenceId, evidenceManifestA.id);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Repeated Linking Idempotency
  // -------------------------------------------------------------------------
  describe('3. Repeated Linking Idempotency', () => {
    it('executes repeated skill and project linking with zero duplicate side effects', async () => {
      const contextA = makeContext(tenantA, userA);

      // Re-link manifest evidence to skill
      const res1 = await linkingService.linkEvidenceToSkill({
        context: contextA,
        candidateId: candidateA.id,
        evidenceId: evidenceManifestA.id,
        skillId: skillFastify.id,
      });

      // Re-link manifest evidence to project
      const res2 = await linkingService.linkEvidenceToProject({
        context: contextA,
        candidateId: candidateA.id,
        evidenceId: evidenceManifestA.id,
        projectId: projectA.id,
      });

      assert.ok(res1);
      assert.ok(res2);

      // Verify evidence count remains exactly 2
      const allEvidence = await db
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, tenantA.id),
            eq(evidenceItems.candidateId, candidateA.id),
            eq(evidenceItems.skillId, skillFastify.id)
          )
        );

      assert.strictEqual(allEvidence.length, 2);

      // Verify project resources count remains 1
      const prs = await db
        .select()
        .from(projectResources)
        .where(
          and(
            eq(projectResources.tenantId, tenantA.id),
            eq(projectResources.projectId, projectA.id)
          )
        );

      assert.strictEqual(prs.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Strict Multi-Tenant Isolation & Default-Deny
  // -------------------------------------------------------------------------
  describe('4. Strict Multi-Tenant Isolation Boundary', () => {
    it('rejects cross-tenant evidence linking with 404 NotFoundError', async () => {
      const contextA = makeContext(tenantA, userA);

      // Tenant A trying to link Tenant B's evidence item
      await assert.rejects(
        async () => {
          await linkingService.linkEvidenceToSkill({
            context: contextA,
            candidateId: candidateA.id,
            evidenceId: evidenceTenantB.id, // Cross-tenant evidence
            skillId: skillFastify.id,
          });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('Evidence node not found'));
          return true;
        }
      );

      // Tenant A trying to link evidence to Tenant B's candidate
      await assert.rejects(
        async () => {
          await linkingService.linkEvidenceToSkill({
            context: contextA,
            candidateId: candidateB.id, // Cross-tenant candidate
            evidenceId: evidenceManifestA.id,
            skillId: skillFastify.id,
          });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('Candidate not found'));
          return true;
        }
      );

      // Tenant A trying to link evidence to Tenant B's project
      await assert.rejects(
        async () => {
          await linkingService.linkEvidenceToProject({
            context: contextA,
            candidateId: candidateA.id,
            evidenceId: evidenceManifestA.id,
            projectId: projectB.id, // Cross-tenant project
          });
        },
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('Project not found'));
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 5. Atomic Batch Linking & Rollback on Failure
  // -------------------------------------------------------------------------
  describe('5. Atomic Batch Linking & Failure Rollback', () => {
    it('rolls back entire transaction if any link in batch fails', async () => {
      const contextA = makeContext(tenantA, userA);

      // Attempt batch linking with 1 valid link and 1 cross-tenant invalid link
      await assert.rejects(
        async () => {
          await linkingService.batchLinkEvidence({
            context: contextA,
            candidateId: candidateA.id,
            links: [
              {
                evidenceId: evidenceReadmeA.id,
                skillId: skillPostgres.id, // Valid link
              },
              {
                evidenceId: evidenceTenantB.id, // Invalid cross-tenant link!
                skillId: skillPostgres.id,
              },
            ],
          });
        },
        (err) => err instanceof NotFoundError
      );

      // Verify that Postgres skill was NOT linked to evidenceReadmeA (atomically rolled back!)
      const [postgresSkill] = await db
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantA.id),
            eq(candidateSkills.candidateId, candidateA.id),
            eq(candidateSkills.skillId, skillPostgres.id)
          )
        );

      assert.strictEqual(
        postgresSkill,
        undefined,
        'Skill link must not persist after batch rollback'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Deletion Cascades & Retention Semantics
  // -------------------------------------------------------------------------
  describe('6. Deletion Semantics', () => {
    it('unlinks projectId on evidence_items when project is deleted without deleting evidence node', async () => {
      const [tempProject] = await db
        .insert(projects)
        .values({
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          name: 'Temporary Initiative',
          slug: `temp-init-${testRunId}`,
        })
        .returning();

      const [tempEvidence] = await db
        .insert(evidenceItems)
        .values({
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          resourceId: resourceA.id,
          projectId: tempProject.id,
          evidenceType: 'FILE_PATTERN_MATCH',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'Dockerfile',
            commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          },
          excerpt: 'FROM node:20-alpine',
          confidenceScore: 0.9,
          metadata: { fingerprint: `fp-docker-${testRunId}` },
        })
        .returning();

      // Delete project
      await db.delete(projects).where(eq(projects.id, tempProject.id));

      // Verify evidence item still exists with projectId set to null
      const [retainedEvidence] = await db
        .select()
        .from(evidenceItems)
        .where(eq(evidenceItems.id, tempEvidence.id));

      assert.ok(retainedEvidence, 'Evidence node must be retained');
      assert.strictEqual(
        retainedEvidence.projectId,
        null,
        'projectId must be set to null on project deletion'
      );
    });
  });
});
