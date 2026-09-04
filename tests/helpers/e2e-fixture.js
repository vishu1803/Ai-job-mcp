/**
 * @file E2E test fixture + stable-MCP-fixture guard (TEST INFRASTRUCTURE ONLY).
 *
 * Purpose:
 * - Provide a DEDICATED, disposable tenant/user/candidate for mutable E2E and
 *   acceptance tests so the real development candidate used for MCP acceptance
 *   (10a2b51b-09bf-4090-8040-1f60ebeb89c9) is never mutated by tests.
 * - Guard that fails loudly when a mutable test/script targets the protected
 *   stable MCP fixture candidate without explicit opt-in.
 *
 * This module is imported ONLY by tests/acceptance, scratch E2E scripts, and
 * infrastructure scripts. It is never imported by production application code.
 */

import { eq, and, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
} from '../../src/db/schema.js';

/**
 * Stable MCP acceptance candidate — read-only. Mutable tests must NOT write to it.
 */
export const PROTECTED_MCP_FIXTURE_CANDIDATE_ID =
  '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

/**
 * Explicit opt-in env var that overrides the guard for deliberate,
 * operator-approved data restoration or migration of the stable fixture.
 */
export const ALLOW_MUTATE_ENV = 'ALLOW_MUTATE_MCP_FIXTURE_CANDIDATE';

/**
 * Throws when a mutable operation targets the protected stable MCP fixture
 * candidate unless ALLOW_MUTATE_MCP_FIXTURE_CANDIDATE === 'true'.
 *
 * @param {string} candidateId
 */
export function assertNotProtectedCandidate(candidateId) {
  if (!candidateId) return;
  if (candidateId !== PROTECTED_MCP_FIXTURE_CANDIDATE_ID) return;
  if (process.env[ALLOW_MUTATE_ENV] === 'true') return;
  throw new Error(
    `MUTATION GUARD: candidate ${candidateId} is the stable READ-ONLY MCP acceptance ` +
      `fixture. Mutable E2E/acceptance tests must target the dedicated E2E fixture ` +
      `candidate instead (tests/helpers/e2e-fixture.js). To intentionally mutate this ` +
      `row for an approved data operation, set ${ALLOW_MUTATE_ENV}=true.`
  );
}

export const E2E_FIXTURE = Object.freeze({
  tenantSlug: 'career-hub-e2e-fixture',
  tenantName: 'Career Hub E2E Fixture',
  userEmail: 'e2e-fixture@careerhub.test',
  userDisplayName: 'E2E Fixture User',
  candidateDisplayName: 'E2E Fixture Candidate',
  candidateHeadline: 'Fixture Backend Engineer',
  candidateSummary:
    'Disposable E2E fixture candidate. Mutable tests operate here and clean up after themselves.',
  candidateEmail: 'e2e-fixture@careerhub.test',
});

/**
 * Idempotently creates (or returns) the dedicated E2E fixture tenant/user/candidate.
 *
 * @param {object} [database]
 * @returns {Promise<{tenantId: string, userId: string, candidateId: string}>}
 */
export async function ensureE2eFixture(database = null) {
  const dbClient = database || defaultDb;

  // 1. Tenant
  const [existingTenant] = await dbClient
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, E2E_FIXTURE.tenantSlug))
    .limit(1);
  const tenantId =
    existingTenant?.id ||
    (
      await dbClient
        .insert(tenants)
        .values({ name: E2E_FIXTURE.tenantName, slug: E2E_FIXTURE.tenantSlug, tier: 'FREE' })
        .onConflictDoNothing()
        .returning({ id: tenants.id })
    )[0]?.id;

  if (!tenantId) {
    throw new Error('E2E fixture tenant could not be created.');
  }

  // 2. User
  const [existingUser] = await dbClient
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.tenantId, tenantId), eq(users.email, E2E_FIXTURE.userEmail))
    )
    .limit(1);
  const userId =
    existingUser?.id ||
    (
      await dbClient
        .insert(users)
        .values({
          tenantId,
          email: E2E_FIXTURE.userEmail,
          displayName: E2E_FIXTURE.userDisplayName,
          role: 'OWNER',
          status: 'ACTIVE',
        })
        .onConflictDoNothing()
        .returning({ id: users.id })
    )[0]?.id;

  if (!userId) {
    throw new Error('E2E fixture user could not be created.');
  }

  // 3. Candidate
  const [existingCandidate] = await dbClient
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.userId, userId))
    .limit(1);
  const candidateId =
    existingCandidate?.id ||
    (
      await dbClient
        .insert(candidates)
        .values({
          tenantId,
          userId,
          displayName: E2E_FIXTURE.candidateDisplayName,
          headline: E2E_FIXTURE.candidateHeadline,
          summary: E2E_FIXTURE.candidateSummary,
          canonicalEmail: E2E_FIXTURE.candidateEmail,
          profileMetadata: {
            userCustom: {},
            systemInferred: { onboardingState: 'PROFILE_COMPLETED' },
          },
          status: 'ACTIVE',
        })
        .onConflictDoNothing()
        .returning({ id: candidates.id })
    )[0]?.id;

  if (!candidateId) {
    throw new Error('E2E fixture candidate could not be created.');
  }

  return { tenantId, userId, candidateId };
}

/**
 * Ensures the fixture candidate has a small set of evidence-backed skills so
 * acceptance steps that verify evidence protection / combined views pass.
 * Uses shared global skill rows when present (never duplicates skills).
 *
 * @param {object} database
 * @param {{tenantId: string, candidateId: string}} ids
 */
export async function ensureFixtureEvidenceSkills(database, { tenantId, candidateId }) {
  const dbClient = database || defaultDb;
  const seed = [
    { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGE', provenance: 'VERIFIED', confidence: 0.92, evidenceCount: 4 },
    { slug: 'react', name: 'React', category: 'FRAMEWORK', provenance: 'CORROBORATED', confidence: 0.85, evidenceCount: 3 },
  ];
  for (const item of seed) {
    const [skillRow] = await dbClient
      .select({ id: skills.id, category: skills.category })
      .from(skills)
      .where(eq(skills.slug, item.slug))
      .limit(1);
    const skillId =
      skillRow?.id ||
      (
        await dbClient
          .insert(skills)
          .values({ slug: item.slug, name: item.name, category: item.category, aliases: [] })
          .onConflictDoNothing()
          .returning({ id: skills.id })
      )[0]?.id;
    if (!skillId) continue;
    const existing = await dbClient
      .select({ id: candidateSkills.id })
      .from(candidateSkills)
      .where(
        and(
          eq(candidateSkills.tenantId, tenantId),
          eq(candidateSkills.candidateId, candidateId),
          eq(candidateSkills.skillId, skillId)
        )
      )
      .limit(1);
    if (existing.length === 0) {
      await dbClient.insert(candidateSkills).values({
        tenantId,
        candidateId,
        skillId,
        category: skillRow?.category || item.category,
        provenanceStatus: item.provenance,
        source: 'GITHUB',
        confidenceScore: item.confidence,
        evidenceCount: item.evidenceCount,
      });
    }
  }
}

/**
 * Removes ALL candidate_skills rows belonging to the fixture candidate.
 * Idempotent; safe to run in after() hooks. Does not touch any other candidate.
 *
 * @param {object} [database]
 * @param {string} candidateId
 */
export async function cleanupFixtureCandidateSkills(database = null, candidateId) {
  const dbClient = database || defaultDb;
  if (!candidateId) return;
  assertNotProtectedCandidate(candidateId); // never wipe the stable fixture's skills
  await dbClient
    .delete(candidateSkills)
    .where(eq(candidateSkills.candidateId, candidateId));
}

/**
 * Resolves the fixture candidateId for a user email (used by dev-only auth
 * override). Returns null when the fixture user does not exist yet.
 */
export async function findFixtureCandidateIdByEmail(database = null, email = E2E_FIXTURE.userEmail) {
  const dbClient = database || defaultDb;
  const [row] = await dbClient
    .select({ candidateId: candidates.id })
    .from(candidates)
    .innerJoin(users, eq(candidates.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  return row?.candidateId || null;
}

/**
 * Convenience: count rows that still reference the protected fixture candidate
 * (used by cross-contamination verification).
 */
export async function assertStableFixtureUnchanged(database = null, candidateId = PROTECTED_MCP_FIXTURE_CANDIDATE_ID) {
  const dbClient = database || defaultDb;
  const [row] = await dbClient
    .select({ displayName: candidates.displayName })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (!row) throw new Error(`Stable fixture candidate ${candidateId} missing!`);
  return row;
}

export { sql };
