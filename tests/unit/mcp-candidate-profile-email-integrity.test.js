/**
 * @file Regression test: Candidate profile email integrity & synthetic email leakage prevention (P14-005AW).
 *
 * Verifies:
 * 1. getCandidateProfile and getProfile prioritize authentic candidate emails
 *    (linked user account email, parsed resume contact email) and strictly prevent
 *    test/demo fixture emails (such as vishw@example.com or candidate@example.com)
 *    from shadowing authentic candidate emails.
 * 2. Legitimate non-synthetic canonicalEmail values are preserved.
 * 3. In pure synthetic test environments without authentic emails, falls back gracefully.
 * 4. When no email is available anywhere, canonicalEmail safely resolves to null.
 * 5. The MCP tool `get_candidate_profile` itself returns the candidate's authentic stored email
 *    and never exposes vishw@example.com.
 * 6. Validates output strictly against GetCandidateProfileOutputSchema.
 * 7. Guarantees zero database mutations during read.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { isSyntheticEmail } from '../../src/utils/candidate-email-resolver.js';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { candidates, users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

function createTestMockDb(cand, userEmail = null) {
  const makeChain = (val) => {
    const p = Promise.resolve(val);
    p.where = () => makeChain(val);
    p.orderBy = () => makeChain(val);
    p.limit = () => makeChain(val);
    p.innerJoin = () => ({
      where: () => makeChain([]),
      orderBy: () => makeChain([]),
    });
    p.leftJoin = () => ({
      where: () => makeChain([]),
      orderBy: () => makeChain([]),
    });
    return p;
  };

  return {
    select: () => ({
      from: (tbl) => {
        if (tbl === users) {
          return makeChain(userEmail ? [{ email: userEmail }] : []);
        }
        return makeChain([cand]);
      },
    }),
  };
}

describe('Candidate Profile Email Integrity Suite (P14-005AW)', () => {
  after(async () => {
    await closeDatabase(pool);
  });

  const tenantId = '24d53f53-780e-4431-b065-32180c354175';
  const userId = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
  const context = {
    tenantId,
    userId,
    role: 'OWNER',
  };

  describe('CandidateProfileService Email Precedence Logic', () => {
    it('preserves legitimate non-synthetic canonicalEmail values', async () => {
      const mockCand = {
        id: 'c1111111-1111-4111-a111-111111111111',
        tenantId,
        userId,
        displayName: 'Authentic Dev',
        canonicalEmail: 'genuine.developer@realcompany.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'other.resume@realcompany.com',
            },
          },
        },
      };

      const mockDb = createTestMockDb(mockCand, 'user@account.com');
      const service = new CandidateProfileService(mockDb);
      const profile = await service.getProfile(context, mockCand.id);
      assert.strictEqual(profile.candidate.canonicalEmail, 'genuine.developer@realcompany.com');
    });

    it('prevents synthetic canonicalEmail (vishw@example.com) from shadowing authentic linked user email', async () => {
      const mockCand = {
        id: 'c2222222-2222-4222-a222-222222222222',
        tenantId,
        userId,
        displayName: 'Vishw Nath',
        canonicalEmail: 'vishw@example.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'resume.contact@realdomain.org',
            },
          },
        },
      };

      const mockDb = createTestMockDb(mockCand, 'authentic.user@accountdomain.com');
      const service = new CandidateProfileService(mockDb);
      const profile = await service.getProfile(context, mockCand.id);
      assert.strictEqual(profile.candidate.canonicalEmail, 'authentic.user@accountdomain.com');
      assert.notStrictEqual(profile.candidate.canonicalEmail, 'vishw@example.com');
    });

    it('prevents synthetic canonicalEmail from shadowing authentic parsed resume email when user email is absent', async () => {
      const mockCand = {
        id: 'c3333333-3333-4333-a333-333333333333',
        tenantId,
        userId: null,
        displayName: 'Vishw Nath',
        canonicalEmail: 'vishw@example.com',
        profileMetadata: {
          resumeData: {
            identity: {
              email: 'authentic.contact@workmail.net',
            },
          },
        },
      };

      const mockDb = createTestMockDb(mockCand, null);
      const service = new CandidateProfileService(mockDb);
      const profile = await service.getProfile(context, mockCand.id);
      assert.strictEqual(profile.candidate.canonicalEmail, 'authentic.contact@workmail.net');
      assert.notStrictEqual(profile.candidate.canonicalEmail, 'vishw@example.com');
    });

    it('gracefully falls back to available test fixture email in pure synthetic test environments', async () => {
      const mockCand = {
        id: 'c4444444-4444-4444-a444-444444444444',
        tenantId,
        userId: null,
        displayName: 'Mock Candidate',
        canonicalEmail: 'mock-candidate@example.test',
        profileMetadata: {},
      };

      const mockDb = createTestMockDb(mockCand, null);
      const service = new CandidateProfileService(mockDb);
      const profile = await service.getProfile(context, mockCand.id);
      assert.strictEqual(profile.candidate.canonicalEmail, 'mock-candidate@example.test');
    });

    it('safely resolves to null when no email exists in any source', async () => {
      const mockCand = {
        id: 'c5555555-5555-4555-a555-555555555555',
        tenantId,
        userId: null,
        displayName: 'Anonymous Candidate',
        canonicalEmail: null,
        profileMetadata: {},
      };

      const mockDb = createTestMockDb(mockCand, null);
      const service = new CandidateProfileService(mockDb);
      const profile = await service.getProfile(context, mockCand.id);
      assert.strictEqual(profile.candidate.canonicalEmail, null);
    });
  });

  describe('Live Candidate & MCP Tool Regression (candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9)', () => {
    it('get_candidate_profile MCP tool returns authentic profile email and never vishw@example.com', async () => {
      const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

      // 1. Verify authentic user account email in database
      const [u] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      assert.ok(u?.email, 'User record must exist in db');
      assert.notStrictEqual(u.email, 'vishw@example.com');
      assert.strictEqual(
        isSyntheticEmail(u.email),
        false,
        'User account email must not be synthetic'
      );

      // 2. Verify raw candidate record has legacy canonicalEmail in database (confirming DB has not been mutated)
      const [rawCand] = await db
        .select({ canonicalEmail: candidates.canonicalEmail })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1);

      assert.strictEqual(
        rawCand?.canonicalEmail,
        'vishw@example.com',
        'Database raw row must remain untouched and unmutated'
      );

      // 3. Execute MCP Tool: handleGetCandidateProfile
      const mcpResponse = await handleGetCandidateProfile(context, { candidateId });

      // 4. Validate output matches GetCandidateProfileOutputSchema
      const parseResult = GetCandidateProfileOutputSchema.safeParse(mcpResponse);
      assert.ok(
        parseResult.success,
        'MCP response must strictly validate against GetCandidateProfileOutputSchema'
      );

      // 5. Verify email authenticity in MCP output
      const candidateOutput = mcpResponse.candidate;
      assert.ok(candidateOutput, 'candidate object must be present');
      assert.strictEqual(candidateOutput.canonicalEmail, u.email);
      assert.notStrictEqual(candidateOutput.canonicalEmail, 'vishw@example.com');
      assert.strictEqual(candidateOutput.canonicalEmail.includes('example.com'), false);
      assert.strictEqual(isSyntheticEmail(candidateOutput.canonicalEmail), false);

      // 6. Verify CandidateProfileService.getCareerProfile also produces the authentic email
      const service = new CandidateProfileService();
      const careerProfile = await service.getCareerProfile(context, candidateId);
      assert.strictEqual(careerProfile.canonicalEmail, u.email);
      assert.notStrictEqual(careerProfile.canonicalEmail, 'vishw@example.com');
      assert.strictEqual(careerProfile.canonicalEmail.includes('example.com'), false);

      // 7. Verify zero DB mutations: re-read database record
      const [postCand] = await db
        .select({ canonicalEmail: candidates.canonicalEmail })
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .limit(1);

      assert.strictEqual(
        postCand?.canonicalEmail,
        'vishw@example.com',
        'Zero database mutation invariant: raw database canonical_email must remain unchanged'
      );
    });
  });
});
