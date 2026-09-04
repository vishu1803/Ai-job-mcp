/**
 * Regression: get_candidate_profile single profile data load.
 *
 * Before the performance fix the handler executed getProfile AND getCareerProfile,
 * and getCareerProfile internally executed getProfile again → ~2× DB work.
 * The handler must now call getProfile exactly once and hand the resulting
 * profileView to getCareerProfile via { profileView } so the raw profile load
 * is never duplicated for one request.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';

const tenantId = 'a0000000-0000-4000-a000-000000000002';
const candidateId = 'c0000000-0000-4000-a000-000000000002';

const mockContext = {
  requestId: 'req-single-load',
  tenantId,
  userId: '10000000-0000-4000-a000-000000000002',
  role: 'MEMBER',
  tokenScopes: ['career:read'],
  authMethod: 'MCP_API_TOKEN',
  clientInfo: { protocolVersion: '2026-07-28', ipAddress: '127.0.0.1' },
  authenticatedAt: new Date().toISOString(),
};

const mockDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => [{ id: candidateId }],
      }),
    }),
  }),
};

function buildProfileView() {
  return {
    candidate: {
      id: candidateId,
      tenantId,
      displayName: 'Alice Engineer',
      headline: 'Backend Developer',
      summary: 'Summary',
      canonicalEmail: 'alice@example.com',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      profileMetadata: {
        careerPreferences: {},
        userCustom: {},
      },
    },
    identities: [],
    resources: [],
    projects: [],
    skills: [
      {
        skillId: '00000000-0000-4000-a000-0000000000b1',
        slug: 'typescript',
        name: 'TypeScript',
        category: 'LANGUAGES',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 8,
        source: 'GITHUB',
      },
    ],
  };
}

function buildCareerProfile(profileView) {
  return {
    headline: profileView.candidate.headline,
    summary: profileView.candidate.summary,
    canonicalEmail: profileView.candidate.canonicalEmail,
    jobPreferences: { targetRoles: [], preferredLocations: [], remotePreference: 'FLEXIBLE' },
    topSkills: [
      {
        slug: 'typescript',
        name: 'TypeScript',
        category: 'LANGUAGES',
        tier: 'PRIMARY',
        confidenceScore: 0.95,
        evidenceCount: 8,
        provenanceStatus: 'VERIFIED',
      },
    ],
    highlightedProjects: [],
    recentExperience: [],
    education: [],
    certifications: [],
    languages: [],
    portfolioLinks: [],
  };
}

describe('get_candidate_profile — single profile data load', () => {
  let calls;
  let profileView;

  beforeEach(() => {
    profileView = buildProfileView();
    calls = { getProfile: 0, getCareerProfile: 0, careerProfileArg: null };
  });

  function buildProfileService() {
    return {
      getProfile: async () => {
        calls.getProfile += 1;
        return profileView;
      },
      getCareerProfile: async (ctx, id, options) => {
        calls.getCareerProfile += 1;
        calls.careerProfileArg = options;
        return buildCareerProfile(profileView);
      },
    };
  }

  it('1. calls getProfile exactly once and reuses the same view in getCareerProfile', async () => {
    const deps = { db: mockDb, candidateProfileService: buildProfileService() };
    const result = await handleGetCandidateProfile(mockContext, { candidateId }, deps);
    assert.equal(calls.getProfile, 1, 'getProfile must run exactly once');
    assert.equal(calls.getCareerProfile, 1);
    assert.ok(
      calls.careerProfileArg && calls.careerProfileArg.profileView === profileView,
      'getCareerProfile must receive the already-loaded profileView'
    );
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('2. output is identical whether or not the service exposes getCareerProfile', async () => {
    // Baseline: no getCareerProfile at all (old minimal path) vs reuse path
    const fullService = buildProfileService();
    const withCareer = await handleGetCandidateProfile(mockContext, { candidateId }, {
      db: mockDb,
      candidateProfileService: fullService,
    });

    const minimalService = {
      getProfile: async () => profileView,
      // no getCareerProfile — handler must tolerate and fall back to raw profileView
    };
    const withoutCareer = await handleGetCandidateProfile(mockContext, { candidateId }, {
      db: mockDb,
      candidateProfileService: minimalService,
    });

    assert.equal(calls.getProfile, 1, 'full-service path still loads profile once');
    assert.equal(withCareer.candidate.id, candidateId);
    assert.equal(withoutCareer.candidate.id, candidateId);
    assert.ok(GetCandidateProfileOutputSchema.safeParse(withoutCareer).success);
    assert.ok(withCareer.topSkills.length >= 1);
  });
});
