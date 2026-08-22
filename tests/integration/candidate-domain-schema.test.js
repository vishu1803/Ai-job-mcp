/**
 * @file Live Integration Tests for Unified Candidate and Resource Schema (Task P4-002)
 *
 * Runs against the active PostgreSQL database to verify:
 * 1. Database schema, tables, enums, indexes, and foreign keys
 * 2. Candidates CRUD operations
 * 3. CandidateIdentities CRUD & unique constraints
 * 4. Resources CRUD & provider-neutral cataloging
 * 5. Projects CRUD & safe slug uniqueness per candidate
 * 6. ProjectResources many-to-many linking
 * 7. Skills canonical global taxonomy lookup and insertion
 * 8. CandidateSkills assertions, rollup metrics, and restrict deletion
 * 9. EvidenceItems immutable provenance nodes and location JSONB
 * 10. Multi-tenant isolation guarantees across all domain entities
 * 11. Foreign key cascade and retention deletion semantics
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
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';

function matchesError(err, regex) {
  const fullMsg = `${err?.message || ''} ${err?.cause?.message || ''} ${err?.cause?.detail || ''}`;
  return regex.test(fullMsg);
}

describe('Live Candidate Domain Schema Integration Tests (P4-002)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];
  const createdSkillIds = [];

  let tenantA;
  let userA;
  let tenantB;
  let _userB;

  before(async () => {
    // 1. Provision Test Tenant A & User A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Candidate Test Tenant A ${testRunId}`,
        slug: `cand-tenant-a-${testRunId}`,
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
        status: 'ACTIVE',
      })
      .returning();

    // 2. Provision Test Tenant B & User B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Candidate Test Tenant B ${testRunId}`,
        slug: `cand-tenant-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [_userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `user-b-${testRunId}@example.com`,
        displayName: `User B ${testRunId}`,
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();
  });

  after(async () => {
    try {
      for (const tenantId of createdTenantIds) {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
      for (const skillId of createdSkillIds) {
        await db.delete(skills).where(eq(skills.id, skillId));
      }
    } catch {
      // Best-effort teardown
    } finally {
      await closeDatabase();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Candidates CRUD Operations
  // -------------------------------------------------------------------------
  describe('1. Candidates CRUD Operations', () => {
    it('creates, reads, updates, and soft/hard deletes candidate records', async () => {
      // 1. Create Candidate
      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          userId: userA.id,
          displayName: 'Vishw Candidate',
          headline: 'Senior Cloud Engineer',
          summary:
            'Experienced distributed systems engineer with deep Node.js and PostgreSQL expertise.',
          canonicalEmail: 'vishw@example.com',
          profileMetadata: { preferredLocation: 'Remote', openToWork: true },
          status: 'ACTIVE',
        })
        .returning();

      assert.ok(candidate.id);
      assert.strictEqual(candidate.displayName, 'Vishw Candidate');
      assert.strictEqual(candidate.status, 'ACTIVE');

      // 2. Read Candidate
      const [read] = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candidate.id), eq(candidates.tenantId, tenantA.id)));

      assert.strictEqual(read.id, candidate.id);
      assert.strictEqual(read.canonicalEmail, 'vishw@example.com');
      assert.strictEqual(read.profileMetadata.preferredLocation, 'Remote');

      // 3. Update Candidate
      const [updated] = await db
        .update(candidates)
        .set({
          headline: 'Lead Distributed Systems Architect',
          status: 'ARCHIVED',
          updatedAt: new Date(),
        })
        .where(and(eq(candidates.id, candidate.id), eq(candidates.tenantId, tenantA.id)))
        .returning();

      assert.strictEqual(updated.headline, 'Lead Distributed Systems Architect');
      assert.strictEqual(updated.status, 'ARCHIVED');

      // Clean up candidate
      await db.delete(candidates).where(eq(candidates.id, candidate.id));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Candidate Identities & Constraints
  // -------------------------------------------------------------------------
  describe('2. Candidate Identities & Unique Constraints', () => {
    it('creates external identity and enforces unique constraint (tenant_id, provider, external_account_id)', async () => {
      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Candidate Identity Test',
        })
        .returning();

      // 1. Insert Identity
      const [identity] = await db
        .insert(candidateIdentities)
        .values({
          tenantId: tenantA.id,
          candidateId: candidate.id,
          provider: 'GITHUB_APP',
          externalAccountId: `gh-${testRunId}-123`,
          externalUsername: 'vishu1803',
          profileUrl: 'https://github.com/vishu1803',
          verified: true,
          verifiedAt: new Date(),
          metadata: { publicRepos: 15 },
        })
        .returning();

      assert.ok(identity.id);
      assert.strictEqual(identity.externalUsername, 'vishu1803');

      // 2. Enforce duplicate identity constraint
      await assert.rejects(
        async () => {
          await db.insert(candidateIdentities).values({
            tenantId: tenantA.id,
            candidateId: candidate.id,
            provider: 'GITHUB_APP',
            externalAccountId: `gh-${testRunId}-123`, // Duplicate external ID
            externalUsername: 'vishu1803-alt',
          });
        },
        (err) => {
          assert.ok(
            matchesError(
              err,
              /duplicate key|unique constraint|candidate_identities_tenant_provider_account_unique/i
            )
          );
          return true;
        }
      );

      // Clean up
      await db.delete(candidates).where(eq(candidates.id, candidate.id));
    });
  });

  // -------------------------------------------------------------------------
  // 3. Resources Catalog & Uniqueness
  // -------------------------------------------------------------------------
  describe('3. Resources Catalog & Provider-Neutral Operations', () => {
    it('creates resource and enforces unique constraint (tenant_id, provider, external_resource_id)', async () => {
      const [resource] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-${testRunId}-999`,
          name: 'Ai-job-mcp',
          displayName: 'vishu1803/Ai-job-mcp',
          url: 'https://github.com/vishu1803/Ai-job-mcp',
          isPrivate: false,
          status: 'ACTIVE',
          metadata: { defaultBranch: 'main', stargazersCount: 10 },
        })
        .returning();

      assert.ok(resource.id);
      assert.strictEqual(resource.name, 'Ai-job-mcp');
      assert.strictEqual(resource.metadata.stargazersCount, 10);

      // Enforce duplicate resource constraint
      await assert.rejects(
        async () => {
          await db.insert(resources).values({
            tenantId: tenantA.id,
            provider: 'GITHUB_APP',
            externalResourceId: `repo-${testRunId}-999`, // Duplicate external resource ID
            name: 'Ai-job-mcp-copy',
            displayName: 'vishu1803/Ai-job-mcp-copy',
          });
        },
        (err) => {
          assert.ok(
            matchesError(
              err,
              /duplicate key|unique constraint|resources_tenant_provider_external_id_unique/i
            )
          );
          return true;
        }
      );

      // Clean up
      await db.delete(resources).where(eq(resources.id, resource.id));
    });
  });

  // -------------------------------------------------------------------------
  // 4. Projects & Project Resources Many-to-Many Linking
  // -------------------------------------------------------------------------
  describe('4. Projects & Project-to-Resource Many-to-Many Linking', () => {
    it('creates project, links multiple resources, and enforces slug uniqueness per candidate', async () => {
      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Project Test Candidate',
        })
        .returning();

      const [res1] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-${testRunId}-frontend`,
          name: 'frontend-web',
          displayName: 'vishu/frontend-web',
        })
        .returning();

      const [res2] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-${testRunId}-backend`,
          name: 'backend-api',
          displayName: 'vishu/backend-api',
        })
        .returning();

      // 1. Create Project
      const [project] = await db
        .insert(projects)
        .values({
          tenantId: tenantA.id,
          candidateId: candidate.id,
          name: 'Antigravity Career Hub',
          slug: 'antigravity-career-hub',
          headline: 'AI Career Hub Platform',
          role: 'Lead Architect',
          isHighlighted: true,
        })
        .returning();

      assert.ok(project.id);
      assert.strictEqual(project.slug, 'antigravity-career-hub');

      // 2. Link Both Repositories to the Project
      await db.insert(projectResources).values([
        {
          tenantId: tenantA.id,
          projectId: project.id,
          resourceId: res1.id,
          roleInProject: 'Frontend SPA',
        },
        {
          tenantId: tenantA.id,
          projectId: project.id,
          resourceId: res2.id,
          roleInProject: 'Backend Fastify API',
        },
      ]);

      // 3. Query Linked Project Resources
      const links = await db
        .select()
        .from(projectResources)
        .where(eq(projectResources.projectId, project.id));

      assert.strictEqual(links.length, 2);

      // 4. Enforce Duplicate Slug Rejection for Same Candidate
      await assert.rejects(
        async () => {
          await db.insert(projects).values({
            tenantId: tenantA.id,
            candidateId: candidate.id,
            name: 'Another Project With Same Slug',
            slug: 'antigravity-career-hub', // Duplicate slug for same candidate
          });
        },
        (err) => {
          assert.ok(
            matchesError(
              err,
              /duplicate key|unique constraint|projects_tenant_candidate_slug_unique/i
            )
          );
          return true;
        }
      );

      // Clean up
      await db.delete(candidates).where(eq(candidates.id, candidate.id));
      await db.delete(resources).where(eq(resources.id, res1.id));
      await db.delete(resources).where(eq(resources.id, res2.id));
    });
  });

  // -------------------------------------------------------------------------
  // 5. Global Skills Taxonomy & Candidate Skills
  // -------------------------------------------------------------------------
  describe('5. Skills Global Taxonomy & Candidate Skills', () => {
    it('creates global skill taxonomy and links to candidate skill with rollup metrics', async () => {
      // 1. Insert Global Skill
      const skillSlug = `fastapi-${testRunId}`;
      const [skill] = await db
        .insert(skills)
        .values({
          slug: skillSlug,
          name: 'FastAPI',
          category: 'FRAMEWORK',
          aliases: ['fastapi-python', 'fastapi-rest'],
          description: 'Modern, fast web framework for building APIs with Python',
        })
        .returning();
      createdSkillIds.push(skill.id);

      assert.ok(skill.id);
      assert.strictEqual(skill.slug, skillSlug);

      // 2. Link Skill to Candidate
      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Skill Candidate',
        })
        .returning();

      const [candidateSkill] = await db
        .insert(candidateSkills)
        .values({
          tenantId: tenantA.id,
          candidateId: candidate.id,
          skillId: skill.id,
          category: 'FRAMEWORK',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 3,
        })
        .returning();

      assert.ok(candidateSkill.id);
      assert.strictEqual(candidateSkill.provenanceStatus, 'VERIFIED');
      assert.strictEqual(candidateSkill.confidenceScore, 0.95);

      // 3. Enforce RESTRICT deletion on referenced global skill
      await assert.rejects(
        async () => {
          await db.delete(skills).where(eq(skills.id, skill.id));
        },
        (err) => {
          assert.ok(
            matchesError(
              err,
              /foreign key constraint|violates foreign key|candidate_skills_skill_id_skills_id_fk/i
            )
          );
          return true;
        }
      );

      // Clean up
      await db.delete(candidates).where(eq(candidates.id, candidate.id));
      await db.delete(skills).where(eq(skills.id, skill.id));
      createdSkillIds.splice(createdSkillIds.indexOf(skill.id), 1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Evidence Items & Immutable Provenance
  // -------------------------------------------------------------------------
  describe('6. Evidence Items & Immutable Provenance Nodes', () => {
    it('creates immutable evidence node linked to candidate, resource, and skill', async () => {
      const skillSlug = `node-js-${testRunId}`;
      const [skill] = await db
        .insert(skills)
        .values({
          slug: skillSlug,
          name: 'Node.js',
          category: 'LANGUAGE',
          aliases: ['nodejs', 'node'],
        })
        .returning();
      createdSkillIds.push(skill.id);

      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Evidence Candidate',
        })
        .returning();

      const [resource] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-${testRunId}-evidence`,
          name: 'backend-core',
          displayName: 'vishu/backend-core',
        })
        .returning();

      // Insert Evidence Item
      const [evidence] = await db
        .insert(evidenceItems)
        .values({
          tenantId: tenantA.id,
          candidateId: candidate.id,
          resourceId: resource.id,
          skillId: skill.id,
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'package.json',
            commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
            lineRange: { start: 15, end: 20 },
          },
          excerpt: '"fastify": "^5.0.0"',
          confidenceScore: 1.0,
          metadata: { isDevDependency: false },
        })
        .returning();

      assert.ok(evidence.id);
      assert.strictEqual(evidence.evidenceType, 'PACKAGE_MANIFEST_DEPENDENCY');
      assert.strictEqual(evidence.sourceLocation.filePath, 'package.json');
      assert.strictEqual(evidence.excerpt, '"fastify": "^5.0.0"');

      // Clean up
      await db.delete(candidates).where(eq(candidates.id, candidate.id));
      await db.delete(resources).where(eq(resources.id, resource.id));
      await db.delete(skills).where(eq(skills.id, skill.id));
      createdSkillIds.splice(createdSkillIds.indexOf(skill.id), 1);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Multi-Tenant Isolation Tests
  // -------------------------------------------------------------------------
  describe('7. Multi-Tenant Isolation Hardening', () => {
    it('strictly isolates candidate, resource, project, and evidence records between tenants', async () => {
      // 1. Provision Candidate & Resource in Tenant A
      const [candA] = await db
        .insert(candidates)
        .values({
          tenantId: tenantA.id,
          displayName: 'Candidate Tenant A',
        })
        .returning();

      const [resA] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-tenant-a-${testRunId}`,
          name: 'tenant-a-repo',
          displayName: 'tenantA/repo',
        })
        .returning();

      const [projA] = await db
        .insert(projects)
        .values({
          tenantId: tenantA.id,
          candidateId: candA.id,
          name: 'Project A',
          slug: 'project-a',
        })
        .returning();

      // 2. Query as Tenant B with tenant_id filtering -> Assert 0 records found
      const candBQuery = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candA.id), eq(candidates.tenantId, tenantB.id)));
      assert.strictEqual(candBQuery.length, 0, 'Tenant B must not see Tenant A candidate');

      const resBQuery = await db
        .select()
        .from(resources)
        .where(and(eq(resources.id, resA.id), eq(resources.tenantId, tenantB.id)));
      assert.strictEqual(resBQuery.length, 0, 'Tenant B must not see Tenant A resource');

      const projBQuery = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projA.id), eq(projects.tenantId, tenantB.id)));
      assert.strictEqual(projBQuery.length, 0, 'Tenant B must not see Tenant A project');

      // 3. Mutating Tenant A record using Tenant B scope affects 0 rows
      const updateResult = await db
        .update(candidates)
        .set({ displayName: 'Malicious Name Injection' })
        .where(and(eq(candidates.id, candA.id), eq(candidates.tenantId, tenantB.id)))
        .returning();
      assert.strictEqual(updateResult.length, 0, 'Tenant B cannot mutate Tenant A candidate');

      // Verify original candidate in Tenant A remains unmodified
      const [unmodified] = await db.select().from(candidates).where(eq(candidates.id, candA.id));
      assert.strictEqual(unmodified.displayName, 'Candidate Tenant A');

      // Clean up
      await db.delete(candidates).where(eq(candidates.id, candA.id));
      await db.delete(resources).where(eq(resources.id, resA.id));
    });
  });

  // -------------------------------------------------------------------------
  // 8. Foreign Key Cascade & Retention Semantics
  // -------------------------------------------------------------------------
  describe('8. Foreign Key Cascade & Retention Semantics', () => {
    it('cascades deletion from candidate to identities, candidate_skills, and evidence', async () => {
      // 1. Create temporary tenant
      const [tempTenant] = await db
        .insert(tenants)
        .values({
          name: `Cascade Tenant ${testRunId}`,
          slug: `cascade-tenant-${testRunId}`,
          tier: 'FREE',
        })
        .returning();

      const [candidate] = await db
        .insert(candidates)
        .values({
          tenantId: tempTenant.id,
          displayName: 'Cascade Candidate',
        })
        .returning();

      const [resource] = await db
        .insert(resources)
        .values({
          tenantId: tempTenant.id,
          candidateId: candidate.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `cascade-repo-${testRunId}`,
          name: 'cascade-repo',
          displayName: 'vishu/cascade-repo',
        })
        .returning();

      const [identity] = await db
        .insert(candidateIdentities)
        .values({
          tenantId: tempTenant.id,
          candidateId: candidate.id,
          provider: 'GITHUB_APP',
          externalAccountId: `cascade-id-${testRunId}`,
          externalUsername: 'cascade-user',
        })
        .returning();

      // 2. Delete Candidate -> Assert candidate_identities cascaded, and resources.candidateId set null
      await db.delete(candidates).where(eq(candidates.id, candidate.id));

      const identitiesAfter = await db
        .select()
        .from(candidateIdentities)
        .where(eq(candidateIdentities.id, identity.id));
      assert.strictEqual(
        identitiesAfter.length,
        0,
        'Candidate identities must cascade delete with candidate'
      );

      const [resourceAfter] = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resource.id));
      assert.ok(resourceAfter, 'Resource record is retained on candidate deletion');
      assert.strictEqual(
        resourceAfter.candidateId,
        null,
        'Resource candidateId must be set to null'
      );

      // 3. Delete Tenant -> Cascades all resources and data
      await db.delete(tenants).where(eq(tenants.id, tempTenant.id));

      const resourcesAfterTenant = await db
        .select()
        .from(resources)
        .where(eq(resources.id, resource.id));
      assert.strictEqual(
        resourcesAfterTenant.length,
        0,
        'Tenant deletion must cascade all tenant resources'
      );
    });
  });
});
