/**
 * Real-DB performance invariants for the profile pipeline (read-only).
 *
 * Uses the stable MCP acceptance fixture (candidate 10a2b51b-…, user
 * 'Vishwanath Nishad'). No data is mutated.
 *
 * Invariants verified:
 *   1. getProfile executes ONE candidate_skills query and ONE batched
 *      project_resources query and ONE batched evidence query per candidate
 *      (previously 10× project_resources + 10× evidence_items — N+1).
 *   2. No per-project evidence equality filter is executed (batched IN instead).
 *   3. getCareerProfile(context, id, { profileView }) runs ZERO additional DB
 *      queries and produces output deep-equal to a fresh-load getCareerProfile.
 *   4. handleGetCandidateProfile (the MCP tool) loads the profile exactly once.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { pool, db } from '../../src/db/index.js';
import { users } from '../../src/db/schema.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';

const FIXTURE_USER = 'Vishwanath Nishad';
const FIXTURE_CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

const originalQuery = pg.Pool.prototype.query;
/** Records every SQL statement executed through the pool during a wrapped block. */
function startCapture() {
  const statements = [];
  pg.Pool.prototype.query = function patched(...args) {
    const config = args[0] && typeof args[0] === 'object' ? args[0] : {};
    if (config.text) statements.push(config.text);
    return originalQuery.apply(this, args);
  };
  return {
    statements,
    stop() {
      pg.Pool.prototype.query = originalQuery;
      return statements;
    },
  };
}

let ctx;

before(async () => {
  const [u] = await db
    .select({ id: users.id, tenantId: users.tenantId, role: users.role })
    .from(users)
    .where(eq(users.displayName, FIXTURE_USER))
    .limit(1);
  if (!u) {
    throw new Error(`Fixture user ${FIXTURE_USER} not found — integration DB required`);
  }
  ctx = {
    requestId: 'single-load-invariant',
    tenantId: u.tenantId,
    userId: u.id,
    role: u.role === 'OWNER' ? 'OWNER' : 'MEMBER',
    tokenScopes: ['career:read'],
    authMethod: 'MCP_API_TOKEN',
    clientInfo: { protocolVersion: '2026-07-28', ipAddress: '127.0.0.1' },
    authenticatedAt: new Date().toISOString(),
  };
});

after(async () => {
  pg.Pool.prototype.query = originalQuery;
  await pool.end();
});

function hasLegacyPerProjectEvidence(statements) {
  return statements.some(
    (s) => s.includes('from "evidence_items"') && /"evidence_items"\."project_id" = \$/.test(s)
  );
}

describe('profile pipeline single-load invariants (real DB, read-only)', () => {
  const svc = new CandidateProfileService();

  it('1. getProfile batches project resources + evidence (no N+1, single skill load)', async () => {
    const cap = startCapture();
    try {
      const view = await svc.getProfile(ctx, FIXTURE_CANDIDATE_ID);
      assert.ok(view.projects.length > 0, 'fixture must expose projects');
      assert.ok(view.skills.length > 0, 'fixture must expose skills');
      const statements = cap.stop();
      const evidenceStmts = statements.filter((s) => s.includes('from "evidence_items"'));
      const projectResStmts = statements.filter((s) => s.includes('from "project_resources"'));
      const candidateSkillsStmts = statements.filter((s) =>
        s.includes('from "candidate_skills"')
      );
      assert.equal(candidateSkillsStmts.length, 1, 'candidate_skills must be loaded exactly once');
      assert.equal(projectResStmts.length, 1, 'project_resources must be a single batched query');
      // One candidate-level evidence fetch (skills) + one batched project-evidence fetch
      assert.equal(evidenceStmts.length, 2, 'evidence_items must be 2 batched queries total');
      assert.ok(!hasLegacyPerProjectEvidence(statements), 'no per-project evidence equality query');
    } finally {
      cap.stop();
    }
  });

  it('2. getCareerProfile with reused profileView adds zero queries and equals fresh load', async () => {
    const cap = startCapture();
    try {
      const profileView = await svc.getProfile(ctx, FIXTURE_CANDIDATE_ID);
      const fresh = await svc.getCareerProfile(ctx, FIXTURE_CANDIDATE_ID);
      const reusedStatements = cap.stop();

      const cap2 = startCapture();
      const reused = await svc.getCareerProfile(ctx, FIXTURE_CANDIDATE_ID, { profileView });
      const reuseOnly = cap2.stop();

      assert.equal(reuseOnly.length, 0, 'reused-profileView path must run no additional queries');
      assert.deepEqual(JSON.parse(JSON.stringify(reused)), JSON.parse(JSON.stringify(fresh)),
        'career profile output must be identical between fresh-load and reused-profileView');
      assert.ok(reusedStatements.length > 0, 'sanity: fresh load actually queried');
      assert.equal(reused.candidateId, FIXTURE_CANDIDATE_ID);
    } finally {
      cap.stop();
    }
  });

  it('3. MCP handler executes a single profile data load end-to-end', async () => {
    const cap = startCapture();
    try {
      const output = await handleGetCandidateProfile(
        ctx,
        { candidateId: FIXTURE_CANDIDATE_ID },
        { candidateProfileService: svc }
      );
      const statements = cap.stop();
      const candidateSkillsStmts = statements.filter((s) =>
        s.includes('from "candidate_skills"')
      );
      const projectResStmts = statements.filter((s) => s.includes('from "project_resources"'));
      const evidenceStmts = statements.filter((s) => s.includes('from "evidence_items"'));
      assert.equal(candidateSkillsStmts.length, 1, 'handler must load candidate_skills once');
      assert.equal(projectResStmts.length, 1, 'handler must run one batched project_resources query');
      assert.equal(evidenceStmts.length, 2, 'handler must run 2 batched evidence queries');
      assert.ok(!hasLegacyPerProjectEvidence(statements));
      assert.equal(output.candidate.id, FIXTURE_CANDIDATE_ID);
      assert.equal(output.candidate.displayName, 'Vishwanath Nishad');
    } finally {
      cap.stop();
    }
  });
});
