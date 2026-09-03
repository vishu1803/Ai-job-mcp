/**
 * Regression tests for get_candidate_profile Additional Skills contract.
 *
 * Proves:
 * 1. SELF_DECLARED skills appear under additionalSkills (never flattened into
 *    topSkills as CORROBORATED/VERIFIED/CLAIMED).
 * 2. LEARNING skills appear under learningSkills with provenance LEARNING.
 * 3. Evidence-backed skills do NOT leak into additionalSkills.
 * 4. includeSkillsSummary=false omits topSkills but additionalSkills/learningSkills
 *    remain first-class structural fields.
 * 5. Output schema accepts SELF_DECLARED / LEARNING provenance on topSkills
 *    (schema enum was previously narrower than the handler mapping).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetCandidateProfile,
} from '../../src/mcp/tools/career-read-tools.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';

const tenantId = 'a0000000-0000-4000-a000-000000000001';
const candidateId = 'c0000000-0000-4000-a000-000000000001';

const mockContext = {
  requestId: 'req-additional-skills',
  tenantId,
  userId: '10000000-0000-4000-a000-000000000001',
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

function buildProfileService({ skills, topSkills, careerProfile = null } = {}) {
  const profileSkills = skills || [
    {
      skillId: '00000000-0000-4000-a000-0000000000a1',
      slug: 'typescript',
      name: 'TypeScript',
      category: 'LANGUAGES',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: 8,
      source: 'GITHUB',
    },
    {
      skillId: '00000000-0000-4000-a000-0000000000a2',
      slug: 'aws',
      name: 'AWS',
      category: 'CLOUD_DEVOPS',
      provenanceStatus: 'SELF_DECLARED',
      confidenceScore: 0.0,
      evidenceCount: 0,
      source: 'CANDIDATE_DECLARED',
      proficiency: 'PROFICIENT',
    },
    {
      skillId: '00000000-0000-4000-a000-0000000000a3',
      slug: 'kubernetes',
      name: 'Kubernetes',
      category: 'CLOUD_DEVOPS',
      provenanceStatus: 'SELF_DECLARED',
      confidenceScore: 0.0,
      evidenceCount: 0,
      source: 'CANDIDATE_DECLARED',
      proficiency: 'WORKING_KNOWLEDGE',
    },
    {
      skillId: '00000000-0000-4000-a000-0000000000a4',
      slug: 'terraform',
      name: 'Terraform',
      category: 'CLOUD_DEVOPS',
      provenanceStatus: 'LEARNING',
      confidenceScore: 0.0,
      evidenceCount: 0,
      source: 'CANDIDATE_DECLARED',
      proficiency: 'CURRENTLY_LEARNING',
    },
  ];

  return {
    getProfile: async () => ({
      candidate: {
        id: candidateId,
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
      skills: profileSkills,
    }),
    getCareerProfile: async () =>
      careerProfile || {
        headline: 'Backend Developer',
        summary: 'Summary',
        canonicalEmail: 'alice@example.com',
        topSkills: topSkills || [
          { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGES', tier: 'PRIMARY', confidenceScore: 0.95, evidenceCount: 8, provenanceStatus: 'VERIFIED' },
          { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS', tier: 'PRIMARY', confidenceScore: 0.5, evidenceCount: 1, provenanceStatus: 'SELF_DECLARED' },
        ],
      },
  };
}

describe('get_candidate_profile — Additional Skills contract', () => {
  it('1. surfaces SELF_DECLARED skills under additionalSkills with preserved provenance', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId },
      { db: mockDb, candidateProfileService: buildProfileService() }
    );

    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
    assert.ok(Array.isArray(result.additionalSkills), 'additionalSkills must be an array');
    assert.ok(result.additionalSkills.length >= 2, 'AWS and Kubernetes expected');

    const aws = result.additionalSkills.find((s) => s.slug === 'aws');
    assert.ok(aws, 'AWS should be in additionalSkills');
    assert.equal(aws.provenanceStatus, 'SELF_DECLARED');
    assert.equal(aws.source, 'CANDIDATE_DECLARED');
    assert.equal(aws.proficiency, 'PROFICIENT');
    assert.equal(aws.skillId, '00000000-0000-4000-a000-0000000000a2');
  });

  it('2. surfaces LEARNING skills under learningSkills with provenance LEARNING', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId },
      { db: mockDb, candidateProfileService: buildProfileService() }
    );

    assert.ok(Array.isArray(result.learningSkills), 'learningSkills must be an array');
    const tf = result.learningSkills.find((s) => s.slug === 'terraform');
    assert.ok(tf, 'Terraform should be in learningSkills');
    assert.equal(tf.provenanceStatus, 'LEARNING');
    assert.equal(tf.proficiency, 'CURRENTLY_LEARNING');
    assert.equal(tf.source, 'CANDIDATE_DECLARED');
  });

  it('3. evidence-backed VERIFIED skills do NOT leak into additionalSkills', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId },
      { db: mockDb, candidateProfileService: buildProfileService() }
    );

    const slugs = result.additionalSkills.map((s) => s.slug);
    assert.ok(!slugs.includes('typescript'), 'TypeScript (VERIFIED) must not appear in additionalSkills');
  });

  it('4. includeSkillsSummary=false omits topSkills but keeps additionalSkills/learningSkills structural', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId, includeSkillsSummary: false },
      { db: mockDb, candidateProfileService: buildProfileService() }
    );

    assert.equal(result.topSkills, undefined, 'topSkills should be omitted');
    assert.ok(Array.isArray(result.additionalSkills), 'additionalSkills should remain an array');
    assert.ok(Array.isArray(result.learningSkills), 'learningSkills should remain an array');
    assert.equal(result.additionalSkills.length, 2, 'AWS + Kubernetes still present');
    assert.equal(result.learningSkills.length, 1, 'Terraform still present');
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('5. schema accepts SELF_DECLARED / LEARNING provenance on topSkills entries', () => {
    const sample = {
      candidate: {
        id: candidateId,
        displayName: 'Alice',
        headline: 'H',
        summary: 'S',
        canonicalEmail: 'a@b.com',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      profileCompletenessScore: 50,
      identities: [],
      connectedResourcesSummary: { totalConnected: 0, publicRepositories: 0, privateRepositories: 0 },
      topSkills: [
        { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS', confidenceScore: 0.5, evidenceCount: 0, provenanceStatus: 'SELF_DECLARED' },
        { slug: 'terraform', name: 'Terraform', category: 'CLOUD_DEVOPS', confidenceScore: 0.2, evidenceCount: 0, provenanceStatus: 'LEARNING' },
      ],
    };
    const parsed = GetCandidateProfileOutputSchema.safeParse(sample);
    assert.ok(parsed.success, `schema should accept SELF_DECLARED/LEARNING topSkills: ${JSON.stringify(parsed.error?.errors)}`);
  });

  it('6. missing additional/learning skills yields empty arrays (no data fabrication)', async () => {
    const svc = buildProfileService();
    // Strip SELF_DECLARED/LEARNING from profile skills to simulate a candidate with none
    const profileService = {
      ...svc,
      getProfile: async () => {
        const base = await svc.getProfile();
        return {
          ...base,
          skills: base.skills.filter(
            (s) => s.provenanceStatus !== 'SELF_DECLARED' && s.provenanceStatus !== 'LEARNING'
          ),
        };
      },
    };
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId },
      { db: mockDb, candidateProfileService: profileService }
    );

    assert.ok(Array.isArray(result.additionalSkills));
    assert.ok(Array.isArray(result.learningSkills));
    assert.equal(result.additionalSkills.length, 0);
    assert.equal(result.learningSkills.length, 0);
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });
});
