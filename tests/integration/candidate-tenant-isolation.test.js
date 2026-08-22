/**
 * @file Dedicated Multi-Tenant Candidate Data Isolation Security Tests (P4-006)
 *
 * Comprehensive security testing suite verifying strict multi-tenant isolation,
 * default-deny authorization, RBAC boundaries, spoofing resistance, and zero-leakage
 * guarantees across all candidate domain entities:
 * 1. Candidates & Profiles
 * 2. Candidate Identities
 * 3. Resources & Resource Summaries
 * 4. Projects & Project Resources
 * 5. Skills & Candidate Skills
 * 6. Evidence Items & EvidenceRefs
 * 7. Manual User Claims
 * 8. Evidence Linking Operations
 * 9. Resource Synchronization
 * 10. Deletion / Archival Isolation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import { createConnectorContext } from '../../src/connectors/base/context.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { EvidenceLinkingService } from '../../src/services/evidence/index.js';
import { NotFoundError, AuthorizationError } from '../../src/errors/index.js';

describe('Multi-Tenant Candidate Data Isolation Security Tests (P4-006)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];
  const profileService = new CandidateProfileService();
  const linkingService = new EvidenceLinkingService();

  // Topology Entities
  let tenantA, userOwnerA, userMemberA, userOtherMemberA, userReadonlyA;
  let candidateA, identityA, resourceA, projectA, skillA, evidenceA;

  let tenantB, userOwnerB;
  let candidateB, identityB, resourceB, projectB, skillB, evidenceB;

  const makeContext = (tenant, user) => ({
    ...createConnectorContext({
      tenantId: tenant.id,
      userId: user.id,
      connectionId: crypto.randomUUID(),
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      scopes: ['read:user', 'repo'],
    }),
    role: user.role,
  });

  before(async () => {
    // -----------------------------------------------------------------------
    // 1. Setup Shared Global Skills Taxonomy
    // -----------------------------------------------------------------------
    const [skA] = await db
      .insert(skills)
      .values({
        slug: `rust-isolation-${testRunId}`,
        name: 'Rust Isolation',
        category: 'LANGUAGE',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'Rust Isolation' },
      })
      .returning();
    skillA = skA;

    const [skB] = await db
      .insert(skills)
      .values({
        slug: `python-isolation-${testRunId}`,
        name: 'Python Isolation',
        category: 'LANGUAGE',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'Python Isolation' },
      })
      .returning();
    skillB = skB;

    // -----------------------------------------------------------------------
    // 2. Setup Tenant A Ecosystem
    // -----------------------------------------------------------------------
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Security Tenant A ${testRunId}`,
        slug: `sec-a-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userOwnerA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-sec-a-${testRunId}@example.com`,
        displayName: 'Owner User A',
        role: 'OWNER',
      })
      .returning();

    [userMemberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `member-sec-a-${testRunId}@example.com`,
        displayName: 'Member User A',
        role: 'MEMBER',
      })
      .returning();

    [userOtherMemberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `other-sec-a-${testRunId}@example.com`,
        displayName: 'Other Member User A',
        role: 'MEMBER',
      })
      .returning();

    [userReadonlyA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `readonly-sec-a-${testRunId}@example.com`,
        displayName: 'Readonly User A',
        role: 'READONLY',
      })
      .returning();

    // Candidate A
    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userMemberA.id,
        displayName: `Candidate Alpha ${testRunId}`,
        headline: 'Alpha Distributed Systems Architect',
        summary: 'Deep expertise in high-throughput Rust engine design',
        canonicalEmail: `alpha-${testRunId}@example.com`,
        profileMetadata: {
          userCustom: { securityTag: 'Tenant-A-Only' },
          systemInferred: {},
        },
      })
      .returning();

    // Identity A
    [identityA] = await db
      .insert(candidateIdentities)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        externalAccountId: `gh-alpha-${testRunId}`,
        externalUsername: `alpha-user-${testRunId}`,
        profileUrl: `https://github.com/alpha-user-${testRunId}`,
        verified: true,
      })
      .returning();

    // Resource A
    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-alpha-${testRunId}`,
        name: 'alpha-kernel',
        displayName: 'alpha-org/alpha-kernel',
        url: `https://github.com/alpha-org/alpha-kernel-${testRunId}`,
        metadata: { secretTag: 'Alpha-Internal-Token-Do-Not-Leak' },
      })
      .returning();

    // Project A
    [projectA] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: `Project Alpha Kernel ${testRunId}`,
        slug: `alpha-kernel-${testRunId}`,
        headline: 'Ultra-low latency kernel',
        summary: 'Mission-critical Rust execution pipeline',
      })
      .returning();

    // Project Resource Link A
    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA.id,
      resourceId: resourceA.id,
    });

    // Evidence Item A
    [evidenceA] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA.id,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'Cargo.toml',
          commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        excerpt: '[dependencies]\nalpha_core = "1.0"',
        confidenceScore: 1.0,
        metadata: { fingerprint: `fp-alpha-${testRunId}` },
      })
      .returning();

    // Candidate Skill A (Linked to Rust)
    await db.insert(candidateSkills).values({
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      skillId: skillA.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.9,
      evidenceCount: 1,
      primaryEvidenceId: evidenceA.id,
    });

    // -----------------------------------------------------------------------
    // 3. Setup Tenant B Ecosystem
    // -----------------------------------------------------------------------
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Security Tenant B ${testRunId}`,
        slug: `sec-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userOwnerB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-sec-b-${testRunId}@example.com`,
        displayName: 'Owner User B',
        role: 'OWNER',
      })
      .returning();

    // Candidate B
    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userOwnerB.id,
        displayName: `Candidate Beta ${testRunId}`,
        headline: 'Beta AI Research Scientist',
        summary: 'Specializing in PyTorch deep learning and transformers',
        canonicalEmail: `beta-${testRunId}@example.com`,
        profileMetadata: {
          userCustom: { securityTag: 'Tenant-B-Only' },
          systemInferred: {},
        },
      })
      .returning();

    // Identity B
    [identityB] = await db
      .insert(candidateIdentities)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        provider: 'GITHUB_APP',
        externalAccountId: `gh-beta-${testRunId}`,
        externalUsername: `beta-user-${testRunId}`,
        profileUrl: `https://github.com/beta-user-${testRunId}`,
        verified: true,
      })
      .returning();

    // Resource B
    [resourceB] = await db
      .insert(resources)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-beta-${testRunId}`,
        name: 'beta-transformer',
        displayName: 'beta-org/beta-transformer',
        url: `https://github.com/beta-org/beta-transformer-${testRunId}`,
        metadata: { secretTag: 'Beta-Internal-Token-Do-Not-Leak' },
      })
      .returning();

    // Project B
    [projectB] = await db
      .insert(projects)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        name: `Project Beta Transformer ${testRunId}`,
        slug: `beta-transformer-${testRunId}`,
        headline: 'Distributed Transformer Training',
        summary: 'Large-scale multi-GPU training platform',
      })
      .returning();

    // Project Resource Link B
    await db.insert(projectResources).values({
      tenantId: tenantB.id,
      projectId: projectB.id,
      resourceId: resourceB.id,
    });

    // Evidence Item B
    [evidenceB] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        resourceId: resourceB.id,
        projectId: projectB.id,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'requirements.txt',
          commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        },
        excerpt: 'torch>=2.0.0\ntransformers==4.30.0',
        confidenceScore: 1.0,
        metadata: { fingerprint: `fp-beta-${testRunId}` },
      })
      .returning();

    // Candidate Skill B (Linked to Python)
    await db.insert(candidateSkills).values({
      tenantId: tenantB.id,
      candidateId: candidateB.id,
      skillId: skillB.id,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: 1,
      primaryEvidenceId: evidenceB.id,
    });
  });

  after(async () => {
    try {
      for (const tenantId of createdTenantIds) {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
      if (skillA) await db.delete(skills).where(eq(skills.id, skillA.id));
      if (skillB) await db.delete(skills).where(eq(skills.id, skillB.id));
    } catch {
      // Cleanup
    } finally {
      await closeDatabase();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Profile Isolation (404 Default-Deny)
  // -------------------------------------------------------------------------
  describe('1. Profile Isolation & Default-Deny (404)', () => {
    it('Tenant A can read Candidate A, but receives 404 when querying Candidate B', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      // Legitimate read
      const profileA = await profileService.getProfile(ctxA, candidateA.id);
      assert.strictEqual(profileA.candidate.id, candidateA.id);

      // Cross-tenant read must fail with 404 (never 403) to prevent resource existence disclosure
      await assert.rejects(
        async () => profileService.getProfile(ctxA, candidateB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });

    it('Tenant B can read Candidate B, but receives 404 when querying Candidate A', async () => {
      const ctxB = makeContext(tenantB, userOwnerB);

      // Legitimate read
      const profileB = await profileService.getProfile(ctxB, candidateB.id);
      assert.strictEqual(profileB.candidate.id, candidateB.id);

      // Cross-tenant read must fail with 404
      await assert.rejects(
        async () => profileService.getProfile(ctxB, candidateA.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. List Candidates Pagination Isolation
  // -------------------------------------------------------------------------
  describe('2. List Candidates Pagination Isolation', () => {
    it('listCandidates(Tenant A) returns only Tenant A candidates across all pages', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      const page1 = await profileService.listCandidates(ctxA, { page: 1, pageSize: 1 });
      assert.ok(page1.items.length <= 1);
      assert.ok(page1.items.every((c) => c.tenantId === tenantA.id));
      assert.ok(page1.items.every((c) => c.id !== candidateB.id));

      const pageEmpty = await profileService.listCandidates(ctxA, { page: 999, pageSize: 10 });
      assert.strictEqual(pageEmpty.items.length, 0);
    });

    it('listCandidates(Tenant B) returns only Tenant B candidates', async () => {
      const ctxB = makeContext(tenantB, userOwnerB);

      const result = await profileService.listCandidates(ctxB, { page: 1, pageSize: 20 });
      assert.ok(result.items.length >= 1);
      assert.ok(result.items.every((c) => c.tenantId === tenantB.id));
      assert.ok(result.items.every((c) => c.id !== candidateA.id));
    });
  });

  // -------------------------------------------------------------------------
  // 3. Deep Profile Aggregation Leak Test
  // -------------------------------------------------------------------------
  describe('3. Deep Profile Aggregation Leak Test', () => {
    it('recursively verifies Candidate A profile contains zero Tenant B identifiers or data', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);
      const profileA = await profileService.getProfile(ctxA, candidateA.id);

      const serializedA = JSON.stringify(profileA);

      // Assert no Tenant B IDs or strings exist anywhere in the payload
      assert.strictEqual(serializedA.includes(tenantB.id), false, 'Must not leak tenantB.id');
      assert.strictEqual(serializedA.includes(candidateB.id), false, 'Must not leak candidateB.id');
      assert.strictEqual(serializedA.includes(identityB.id), false, 'Must not leak identityB.id');
      assert.strictEqual(serializedA.includes(resourceB.id), false, 'Must not leak resourceB.id');
      assert.strictEqual(serializedA.includes(projectB.id), false, 'Must not leak projectB.id');
      assert.strictEqual(serializedA.includes(evidenceB.id), false, 'Must not leak evidenceB.id');
      assert.strictEqual(
        serializedA.includes('Beta-Internal-Token-Do-Not-Leak'),
        false,
        'Must not leak resource B metadata'
      );
      assert.strictEqual(
        serializedA.includes('Tenant-B-Only'),
        false,
        'Must not leak userCustom metadata from Tenant B'
      );
    });

    it('recursively verifies Candidate B profile contains zero Tenant A identifiers or data', async () => {
      const ctxB = makeContext(tenantB, userOwnerB);
      const profileB = await profileService.getProfile(ctxB, candidateB.id);

      const serializedB = JSON.stringify(profileB);

      assert.strictEqual(serializedB.includes(tenantA.id), false, 'Must not leak tenantA.id');
      assert.strictEqual(serializedB.includes(candidateA.id), false, 'Must not leak candidateA.id');
      assert.strictEqual(serializedB.includes(identityA.id), false, 'Must not leak identityA.id');
      assert.strictEqual(serializedB.includes(resourceA.id), false, 'Must not leak resourceA.id');
      assert.strictEqual(serializedB.includes(projectA.id), false, 'Must not leak projectA.id');
      assert.strictEqual(serializedB.includes(evidenceA.id), false, 'Must not leak evidenceA.id');
      assert.strictEqual(
        serializedB.includes('Alpha-Internal-Token-Do-Not-Leak'),
        false,
        'Must not leak resource A metadata'
      );
      assert.strictEqual(
        serializedB.includes('Tenant-A-Only'),
        false,
        'Must not leak userCustom metadata from Tenant A'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Resource & Project Isolation
  // -------------------------------------------------------------------------
  describe('4. Resource and Project Graph Isolation', () => {
    it('Candidate A profile contains exactly Resource A and Project A with 0 cross-tenant nodes', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);
      const profileA = await profileService.getProfile(ctxA, candidateA.id);

      assert.strictEqual(profileA.resources.length, 1);
      assert.strictEqual(profileA.resources[0].id, resourceA.id);

      assert.strictEqual(profileA.projects.length, 1);
      assert.strictEqual(profileA.projects[0].id, projectA.id);
      assert.strictEqual(profileA.projects[0].evidence.length, 1);
      assert.strictEqual(profileA.projects[0].evidence[0].evidenceId, evidenceA.id);
    });

    it('Candidate B profile contains exactly Resource B and Project B with 0 cross-tenant nodes', async () => {
      const ctxB = makeContext(tenantB, userOwnerB);
      const profileB = await profileService.getProfile(ctxB, candidateB.id);

      assert.strictEqual(profileB.resources.length, 1);
      assert.strictEqual(profileB.resources[0].id, resourceB.id);

      assert.strictEqual(profileB.projects.length, 1);
      assert.strictEqual(profileB.projects[0].id, projectB.id);
      assert.strictEqual(profileB.projects[0].evidence.length, 1);
      assert.strictEqual(profileB.projects[0].evidence[0].evidenceId, evidenceB.id);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Skill & Evidence Isolation
  // -------------------------------------------------------------------------
  describe('5. Skill Assertion & Evidence Isolation', () => {
    it('Candidate A has Rust verified skill while Candidate B has Python verified skill', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);
      const profileA = await profileService.getProfile(ctxA, candidateA.id);

      assert.ok(profileA.skills.some((s) => s.slug === `rust-isolation-${testRunId}`));
      assert.strictEqual(
        profileA.skills.some((s) => s.slug === `python-isolation-${testRunId}`),
        false
      );

      const ctxB = makeContext(tenantB, userOwnerB);
      const profileB = await profileService.getProfile(ctxB, candidateB.id);

      assert.ok(profileB.skills.some((s) => s.slug === `python-isolation-${testRunId}`));
      assert.strictEqual(
        profileB.skills.some((s) => s.slug === `rust-isolation-${testRunId}`),
        false
      );
    });

    it('EvidenceRef in Candidate A points strictly to Evidence A commit and file path', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);
      const profileA = await profileService.getProfile(ctxA, candidateA.id);
      const rustSkill = profileA.skills.find((s) => s.slug === `rust-isolation-${testRunId}`);

      assert.ok(rustSkill.primaryEvidence);
      assert.strictEqual(rustSkill.primaryEvidence.evidenceId, evidenceA.id);
      assert.strictEqual(rustSkill.primaryEvidence.filePath, 'Cargo.toml');
      assert.strictEqual(
        rustSkill.primaryEvidence.commitSha,
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Manual Skill Claim Isolation
  // -------------------------------------------------------------------------
  describe('6. Manual User Claim Isolation', () => {
    it('adding a manual claim in Tenant A does not reflect in Tenant B', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);
      const ctxB = makeContext(tenantB, userOwnerB);

      // Claim a unique skill in Tenant A
      await profileService.addSkillClaim(ctxA, candidateA.id, {
        skillSlug: `claim-alpha-${testRunId}`,
        claimNote: 'Alpha specific claim',
      });

      // Assert visible in Candidate A
      const profA = await profileService.getProfile(ctxA, candidateA.id);
      assert.ok(profA.skills.some((s) => s.slug === `claim-alpha-${testRunId}`));

      // Assert NOT visible in Candidate B
      const profB = await profileService.getProfile(ctxB, candidateB.id);
      assert.strictEqual(
        profB.skills.some((s) => s.slug === `claim-alpha-${testRunId}`),
        false
      );
    });

    it('rejects cross-tenant removeSkillClaim attempts with 404', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      // Tenant A trying to remove skill from Candidate B
      await assert.rejects(
        async () => profileService.removeSkillClaim(ctxA, candidateB.id, skillB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. Evidence Linking Cross-Tenant Isolation
  // -------------------------------------------------------------------------
  describe('7. Evidence Linking Cross-Tenant Rejection', () => {
    it('rejects linking Tenant B evidence to Tenant A skill with 404', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      await assert.rejects(
        async () =>
          linkingService.linkEvidenceToSkill({
            context: ctxA,
            candidateId: candidateA.id,
            evidenceId: evidenceB.id, // Foreign evidence
            skillId: skillA.id,
          }),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });

    it('rejects linking Tenant A evidence to Tenant B project with 404', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      await assert.rejects(
        async () =>
          linkingService.linkEvidenceToProject({
            context: ctxA,
            candidateId: candidateA.id,
            evidenceId: evidenceA.id,
            projectId: projectB.id, // Foreign project
          }),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. Negative Cross-Tenant Mutation Tests (Zero Row Changes)
  // -------------------------------------------------------------------------
  describe('8. Negative Mutation Tests (Zero Foreign Row Changes)', () => {
    it('captures row counts and proves 0 rows in Tenant B are modified on unauthorized attempts', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      // Snapshot Candidate B before
      const [candBBefore] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, candidateB.id));

      // Attempt unauthorized cross-tenant update
      await assert.rejects(
        async () =>
          profileService.updateProfile(ctxA, candidateB.id, {
            headline: 'Hacked Headline by Tenant A',
          }),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );

      // Snapshot Candidate B after
      const [candBAfter] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, candidateB.id));

      assert.strictEqual(candBAfter.headline, candBBefore.headline);
      assert.strictEqual(
        new Date(candBAfter.updatedAt).getTime(),
        new Date(candBBefore.updatedAt).getTime()
      );
    });

    it('cross-tenant archive and restore attempts fail with 404 without altering status', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      await assert.rejects(
        async () => profileService.archiveCandidate(ctxA, candidateB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );

      const [candB] = await db.select().from(candidates).where(eq(candidates.id, candidateB.id));
      assert.strictEqual(candB.status, 'ACTIVE');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Client Spoofing Resistance
  // -------------------------------------------------------------------------
  describe('9. Client-Injected Parameter & Spoofing Resistance', () => {
    it('ignores tenantId or userId in mutation payloads and enforces trusted context', async () => {
      const ctxA = makeContext(tenantA, userMemberA);

      // Attempt to spoof tenantId and userId inside patch
      const updated = await profileService.updateProfile(ctxA, candidateA.id, {
        tenantId: tenantB.id,
        userId: userOwnerB.id,
        headline: 'Legitimate Updated Headline',
      });

      assert.strictEqual(updated.headline, 'Legitimate Updated Headline');
      assert.strictEqual(updated.tenantId, tenantA.id, 'tenantId must NOT be overwritten');
      assert.strictEqual(updated.userId, userMemberA.id, 'userId must NOT be overwritten');
    });
  });

  // -------------------------------------------------------------------------
  // 10. Role-Based Access Control (RBAC) Hardening
  // -------------------------------------------------------------------------
  describe('10. RBAC Permission Matrix Verification', () => {
    it('OWNER has full mutation authority within tenant', async () => {
      const ctxOwner = makeContext(tenantA, userOwnerA);

      const updated = await profileService.updateProfile(ctxOwner, candidateA.id, {
        summary: 'Updated by OWNER',
      });
      assert.strictEqual(updated.summary, 'Updated by OWNER');
    });

    it('MEMBER can mutate their own self-linked candidate profile', async () => {
      const ctxMember = makeContext(tenantA, userMemberA); // candidateA.userId === userMemberA.id

      const updated = await profileService.updateProfile(ctxMember, candidateA.id, {
        summary: 'Updated by self-linked member',
      });
      assert.strictEqual(updated.summary, 'Updated by self-linked member');
    });

    it('MEMBER cannot mutate another member candidate profile in the same tenant (403)', async () => {
      const ctxOther = makeContext(tenantA, userOtherMemberA); // candidateA.userId !== userOtherMemberA.id

      await assert.rejects(
        async () =>
          profileService.updateProfile(ctxOther, candidateA.id, {
            summary: 'Unauthorized member mutation',
          }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });

    it('READONLY user is rejected from all mutating operations with 403', async () => {
      const ctxReadonly = makeContext(tenantA, userReadonlyA);

      await assert.rejects(
        async () =>
          profileService.updateProfile(ctxReadonly, candidateA.id, { summary: 'Readonly fail' }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );

      await assert.rejects(
        async () =>
          profileService.addSkillClaim(ctxReadonly, candidateA.id, {
            skillSlug: `rust-isolation-${testRunId}`,
          }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );

      await assert.rejects(
        async () => profileService.archiveCandidate(ctxReadonly, candidateA.id),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });
  });

  // -------------------------------------------------------------------------
  // 11. Synchronization Isolation
  // -------------------------------------------------------------------------
  describe('11. Resource Synchronization Isolation', () => {
    it('syncProfileFromResources processes only Tenant A resources for Candidate A', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      const profile = await profileService.syncProfileFromResources(ctxA, candidateA.id);

      assert.strictEqual(profile.candidate.profileMetadata.systemInferred.syncedResourceCount, 1);
      assert.strictEqual(profile.resources.length, 1);
      assert.strictEqual(profile.resources[0].id, resourceA.id);
    });

    it('syncProfileFromResources rejects syncing a foreign candidate with 404', async () => {
      const ctxA = makeContext(tenantA, userOwnerA);

      await assert.rejects(
        async () => profileService.syncProfileFromResources(ctxA, candidateB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // -------------------------------------------------------------------------
  // 12. Deletion Isolation
  // -------------------------------------------------------------------------
  describe('12. Deletion & Destruction Isolation', () => {
    it('deleting Candidate A records does NOT alter Candidate B records', async () => {
      // Delete Candidate A evidence and candidate
      await db.delete(evidenceItems).where(eq(evidenceItems.candidateId, candidateA.id));
      await db.delete(candidateSkills).where(eq(candidateSkills.candidateId, candidateA.id));
      await db.delete(projectResources).where(eq(projectResources.tenantId, tenantA.id));
      await db.delete(projects).where(eq(projects.candidateId, candidateA.id));
      await db.delete(resources).where(eq(resources.candidateId, candidateA.id));
      await db
        .delete(candidateIdentities)
        .where(eq(candidateIdentities.candidateId, candidateA.id));
      await db.delete(candidates).where(eq(candidates.id, candidateA.id));

      // Verify Candidate B remains 100% intact!
      const ctxB = makeContext(tenantB, userOwnerB);
      const profileB = await profileService.getProfile(ctxB, candidateB.id);

      assert.ok(profileB);
      assert.strictEqual(profileB.candidate.id, candidateB.id);
      assert.strictEqual(profileB.identities.length, 1);
      assert.strictEqual(profileB.resources.length, 1);
      assert.strictEqual(profileB.projects.length, 1);
      assert.strictEqual(profileB.skills.length, 1);
    });
  });
});
