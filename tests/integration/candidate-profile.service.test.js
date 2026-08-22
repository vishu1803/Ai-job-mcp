/**
 * @file Live Integration Tests for Candidate Profile Service (P4-005)
 *
 * Runs against the active Aiven PostgreSQL database to verify:
 * 1. Candidate CRUD lifecycle and full profile aggregation
 * 2. Manual skill claim creation, [Unverified User Claim] labeling, and claim removal
 * 3. Verified evidence precedence over manual claims and monotonic scoring
 * 4. Narrative sovereignty (background sync preserves user-authored headline/summary)
 * 5. Metadata partitioning (userCustom vs systemInferred)
 * 6. Archive and restore lifecycle management
 * 7. Strict multi-tenant isolation (404 default-deny on foreign tenant access)
 * 8. RBAC enforcement (OWNER vs MEMBER self-linked vs MEMBER other vs READONLY)
 * 9. Credential scrubbing and safe resource/identity projection
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
  resources,
  projects,
  skills,
  evidenceItems,
} from '../../src/db/schema.js';
import { createConnectorContext } from '../../src/connectors/base/context.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { EvidenceLinkingService } from '../../src/services/evidence/index.js';
import { NotFoundError, AuthorizationError } from '../../src/errors/index.js';

describe('Live Candidate Profile Service Integration Tests (P4-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];
  const profileService = new CandidateProfileService();
  const linkingService = new EvidenceLinkingService();

  let tenantA;
  let userOwnerA;
  let userMemberA;
  let userOtherMemberA;
  let userReadonlyA;

  let tenantB;
  let userOwnerB;
  let candidateB;

  let candidateA;
  let skillRust;
  let skillGo;

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
    // 1. Provision Canonical Global Skills
    const [rustRow] = await db
      .insert(skills)
      .values({
        slug: `rust-${testRunId}`,
        name: 'Rust',
        category: 'LANGUAGE',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'Rust' },
      })
      .returning();
    skillRust = rustRow;

    const [goRow] = await db
      .insert(skills)
      .values({
        slug: `golang-${testRunId}`,
        name: 'Go',
        category: 'LANGUAGE',
      })
      .onConflictDoUpdate({
        target: skills.slug,
        set: { name: 'Go' },
      })
      .returning();
    skillGo = goRow;

    // 2. Provision Tenant A & Users
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Profile Tenant A ${testRunId}`,
        slug: `prof-a-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userOwnerA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `owner-a-${testRunId}@example.com`,
        displayName: 'Owner User A',
        role: 'OWNER',
      })
      .returning();

    [userMemberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `member-a-${testRunId}@example.com`,
        displayName: 'Member User A',
        role: 'MEMBER',
      })
      .returning();

    [userOtherMemberA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `other-a-${testRunId}@example.com`,
        displayName: 'Other Member User A',
        role: 'MEMBER',
      })
      .returning();

    [userReadonlyA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `readonly-a-${testRunId}@example.com`,
        displayName: 'Readonly User A',
        role: 'READONLY',
      })
      .returning();

    // 3. Provision Tenant B & Candidate B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Profile Tenant B ${testRunId}`,
        slug: `prof-b-${testRunId}`,
        tier: 'FREE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userOwnerB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `owner-b-${testRunId}@example.com`,
        displayName: 'Owner User B',
        role: 'OWNER',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userOwnerB.id,
        displayName: 'Candidate B',
        canonicalEmail: `cand-b-${testRunId}@example.com`,
      })
      .returning();
  });

  after(async () => {
    try {
      for (const tenantId of createdTenantIds) {
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
      if (skillRust) await db.delete(skills).where(eq(skills.id, skillRust.id));
      if (skillGo) await db.delete(skills).where(eq(skills.id, skillGo.id));
    } catch {
      // Cleanup
    } finally {
      await closeDatabase();
    }
  });

  // -------------------------------------------------------------------------
  // 1. Candidate Creation & CRUD Operations
  // -------------------------------------------------------------------------
  describe('1. Candidate Creation & Full Profile Aggregation', () => {
    it('creates candidate with partitioned metadata and status ACTIVE', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      candidateA = await profileService.createCandidate(ownerCtx, {
        userId: userMemberA.id,
        displayName: 'Alex River',
        headline: 'Senior Distributed Systems Engineer',
        summary: 'Specializing in Rust, Go, and high-throughput streamable architectures.',
        canonicalEmail: `alex-${testRunId}@example.com`,
        profileMetadata: {
          userCustom: { preferredRole: 'Staff Engineer' },
        },
      });

      assert.ok(candidateA);
      assert.strictEqual(candidateA.displayName, 'Alex River');
      assert.strictEqual(candidateA.tenantId, tenantA.id);
      assert.strictEqual(candidateA.userId, userMemberA.id);
      assert.strictEqual(candidateA.status, 'ACTIVE');
      assert.deepStrictEqual(candidateA.profileMetadata, {
        userCustom: { preferredRole: 'Staff Engineer' },
        systemInferred: {},
      });
    });

    it('aggregates full profile view with clean resources, projects, and skills', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      // Add a resource for Candidate A
      const [resRow] = await db
        .insert(resources)
        .values({
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-a-${testRunId}`,
          name: 'stream-engine',
          displayName: 'alex/stream-engine',
          url: 'https://github.com/alex/stream-engine',
        })
        .returning();

      // Add a project for Candidate A
      await db.insert(projects).values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Stream Processing Platform',
        slug: `stream-processing-${testRunId}`,
        headline: 'Real-time telemetry processor in Rust',
      });

      const profileView = await profileService.getProfile(ownerCtx, candidateA.id);

      assert.ok(profileView);
      assert.strictEqual(profileView.candidate.id, candidateA.id);
      assert.strictEqual(profileView.candidate.displayName, 'Alex River');
      assert.strictEqual(profileView.resources.length, 1);
      assert.strictEqual(profileView.resources[0].id, resRow.id);
      assert.strictEqual(profileView.resources[0].name, 'stream-engine');
      // Assert no credentials leaked
      assert.strictEqual(profileView.resources[0].encryptedCredentials, undefined);
      assert.strictEqual(profileView.projects.length, 1);
      assert.strictEqual(profileView.projects[0].name, 'Stream Processing Platform');
    });

    it('updates user narrative fields without modifying systemInferred metadata', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const updated = await profileService.updateProfile(ownerCtx, candidateA.id, {
        headline: 'Principal Distributed Systems Architect',
        profileMetadata: {
          userCustom: { preferredRole: 'Principal Architect' },
        },
      });

      assert.strictEqual(updated.headline, 'Principal Distributed Systems Architect');
      assert.strictEqual(updated.profileMetadata.userCustom.preferredRole, 'Principal Architect');
      assert.deepStrictEqual(updated.profileMetadata.systemInferred, {});
    });

    it('lists candidates in tenant with pagination', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const result = await profileService.listCandidates(ownerCtx, { page: 1, pageSize: 10 });
      assert.ok(result.items.length >= 1);
      assert.strictEqual(result.pagination.page, 1);
      assert.ok(result.items.some((c) => c.id === candidateA.id));
    });
  });

  // -------------------------------------------------------------------------
  // 2. Manual Skill Claims & Verified Precedence
  // -------------------------------------------------------------------------
  describe('2. Manual Skill Claims & Verified Evidence Precedence', () => {
    it('creates manual skill claim with [Unverified User Claim] label and 0.0 confidence', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const claim = await profileService.addSkillClaim(ownerCtx, candidateA.id, {
        skillSlug: `rust-${testRunId}`,
        claimNote: '4 years of personal Rust hobby projects',
      });

      assert.ok(claim);
      assert.strictEqual(claim.provenanceStatus, 'CLAIMED');
      assert.strictEqual(claim.confidenceScore, 0.0);
      assert.strictEqual(claim.isUserClaim, true);
      assert.strictEqual(claim.claimLabel, '[Unverified User Claim]');

      // Inspect via getProfile
      const profile = await profileService.getProfile(ownerCtx, candidateA.id);
      const rustSkill = profile.skills.find((s) => s.slug === `rust-${testRunId}`);
      assert.ok(rustSkill);
      assert.strictEqual(rustSkill.provenanceStatus, 'CLAIMED');
      assert.strictEqual(rustSkill.claimLabel, '[Unverified User Claim]');
      assert.strictEqual(rustSkill.primaryEvidence, null);
    });

    it('elevates manual claim to VERIFIED when evidence is subsequently linked', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      // Fetch candidate resource
      const [res] = await db
        .select()
        .from(resources)
        .where(eq(resources.candidateId, candidateA.id));

      // Insert real verified evidence item (Cargo.toml dependency)
      const [evidence] = await db
        .insert(evidenceItems)
        .values({
          tenantId: tenantA.id,
          candidateId: candidateA.id,
          resourceId: res.id,
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'Cargo.toml',
            commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
          },
          excerpt: '[dependencies]\ntokio = "1.0"',
          confidenceScore: 1.0,
          metadata: { fingerprint: `fp-rust-${testRunId}` },
        })
        .returning();

      // Link evidence to Rust skill via EvidenceLinkingService
      await linkingService.linkEvidenceToSkill({
        context: ownerCtx,
        candidateId: candidateA.id,
        evidenceId: evidence.id,
        skillId: skillRust.id,
      });

      // Verify profile now shows VERIFIED with score >= 0.85
      const profile = await profileService.getProfile(ownerCtx, candidateA.id);
      const rustSkill = profile.skills.find((s) => s.slug === `rust-${testRunId}`);
      assert.ok(rustSkill);
      assert.strictEqual(rustSkill.provenanceStatus, 'VERIFIED');
      assert.strictEqual(rustSkill.confidenceScore, 0.85);
      assert.strictEqual(rustSkill.evidenceCount, 1);
      assert.ok(rustSkill.primaryEvidence);
      assert.strictEqual(rustSkill.primaryEvidence.evidenceId, evidence.id);
      assert.strictEqual(rustSkill.claimLabel, null);
    });

    it('preserves verified status and score when addSkillClaim is called on already-verified skill', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const claim = await profileService.addSkillClaim(ownerCtx, candidateA.id, {
        skillSlug: `rust-${testRunId}`,
        claimNote: 'Updated self-assessment note',
      });

      assert.strictEqual(claim.provenanceStatus, 'VERIFIED');
      assert.strictEqual(claim.confidenceScore, 0.85); // NOT downgraded to 0!
      assert.strictEqual(claim.claimLabel, null); // Not labeled unverified since real evidence exists
    });

    it('removeSkillClaim preserves verified skill while clearing user claim note', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const res = await profileService.removeSkillClaim(ownerCtx, candidateA.id, skillRust.id);
      assert.strictEqual(res.success, true);

      // Verify skill still exists and remains VERIFIED in profile
      const profile = await profileService.getProfile(ownerCtx, candidateA.id);
      const rustSkill = profile.skills.find((s) => s.slug === `rust-${testRunId}`);
      assert.ok(rustSkill, 'Verified skill must not be deleted');
      assert.strictEqual(rustSkill.provenanceStatus, 'VERIFIED');
    });

    it('removeSkillClaim deletes candidate_skills row if skill was purely a manual claim', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      // Add pure claim for Go
      await profileService.addSkillClaim(ownerCtx, candidateA.id, {
        skillSlug: `golang-${testRunId}`,
        claimNote: 'Learning Go currently',
      });

      // Remove claim
      const res = await profileService.removeSkillClaim(ownerCtx, candidateA.id, skillGo.id);
      assert.strictEqual(res.success, true);

      // Verify Go skill was deleted
      const profile = await profileService.getProfile(ownerCtx, candidateA.id);
      const goSkill = profile.skills.find((s) => s.slug === `golang-${testRunId}`);
      assert.strictEqual(goSkill, undefined);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Narrative Sovereignty on Background Sync
  // -------------------------------------------------------------------------
  describe('3. Narrative Sovereignty on Resource Synchronization', () => {
    it('syncProfileFromResources updates systemInferred metadata without overwriting headline or summary', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      const profileBefore = await profileService.getProfile(ownerCtx, candidateA.id);
      const customHeadline = profileBefore.candidate.headline;
      const customSummary = profileBefore.candidate.summary;

      const profileAfter = await profileService.syncProfileFromResources(ownerCtx, candidateA.id);

      // Assert narrative remains 100% sovereign!
      assert.strictEqual(profileAfter.candidate.headline, customHeadline);
      assert.strictEqual(profileAfter.candidate.summary, customSummary);

      // Assert systemInferred metadata was updated
      assert.ok(profileAfter.candidate.profileMetadata.systemInferred.lastSyncedAt);
      assert.strictEqual(
        profileAfter.candidate.profileMetadata.systemInferred.syncedResourceCount,
        1
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Archive and Restore Lifecycle
  // -------------------------------------------------------------------------
  describe('4. Archive and Restore Lifecycle', () => {
    it('archives and restores candidate preserving all evidence and skills', async () => {
      const ownerCtx = makeContext(tenantA, userOwnerA);

      // Archive
      const archived = await profileService.archiveCandidate(ownerCtx, candidateA.id);
      assert.strictEqual(archived.status, 'ARCHIVED');

      // Verify in getProfile
      const profArchived = await profileService.getProfile(ownerCtx, candidateA.id);
      assert.strictEqual(profArchived.candidate.status, 'ARCHIVED');

      // Restore
      const restored = await profileService.restoreCandidate(ownerCtx, candidateA.id);
      assert.strictEqual(restored.status, 'ACTIVE');

      // Verify in getProfile
      const profRestored = await profileService.getProfile(ownerCtx, candidateA.id);
      assert.strictEqual(profRestored.candidate.status, 'ACTIVE');
      assert.strictEqual(profRestored.skills.length, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Multi-Tenant Isolation & Default-Deny
  // -------------------------------------------------------------------------
  describe('5. Strict Multi-Tenant Isolation', () => {
    it('rejects cross-tenant candidate profile access with 404 NotFoundError', async () => {
      const contextA = makeContext(tenantA, userOwnerA);

      // Tenant A trying to get Tenant B's candidate
      await assert.rejects(
        async () => profileService.getProfile(contextA, candidateB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );

      // Tenant A trying to update Tenant B's candidate
      await assert.rejects(
        async () => profileService.updateProfile(contextA, candidateB.id, { headline: 'Hacked' }),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );

      // Tenant A trying to archive Tenant B's candidate
      await assert.rejects(
        async () => profileService.archiveCandidate(contextA, candidateB.id),
        (err) => err instanceof NotFoundError && err.statusCode === 404
      );
    });
  });

  // -------------------------------------------------------------------------
  // 6. Role-Based Access Control (RBAC)
  // -------------------------------------------------------------------------
  describe('6. RBAC Permission Matrix Enforcement', () => {
    it('permits MEMBER to mutate their self-linked candidate profile', async () => {
      const memberCtx = makeContext(tenantA, userMemberA); // self-linked to candidateA

      const updated = await profileService.updateProfile(memberCtx, candidateA.id, {
        summary: 'Updated summary by self-linked member',
      });
      assert.strictEqual(updated.summary, 'Updated summary by self-linked member');
    });

    it('rejects MEMBER from mutating another member candidate profile with 403', async () => {
      const otherMemberCtx = makeContext(tenantA, userOtherMemberA); // NOT self-linked to candidateA

      await assert.rejects(
        async () =>
          profileService.updateProfile(otherMemberCtx, candidateA.id, {
            summary: 'Unauthorized update attempt',
          }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });

    it('rejects READONLY user from any mutating operation with 403', async () => {
      const readonlyCtx = makeContext(tenantA, userReadonlyA);

      await assert.rejects(
        async () =>
          profileService.updateProfile(readonlyCtx, candidateA.id, {
            summary: 'Readonly update attempt',
          }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );

      await assert.rejects(
        async () =>
          profileService.addSkillClaim(readonlyCtx, candidateA.id, {
            skillSlug: `rust-${testRunId}`,
          }),
        (err) => err instanceof AuthorizationError && err.statusCode === 403
      );
    });
  });
});
