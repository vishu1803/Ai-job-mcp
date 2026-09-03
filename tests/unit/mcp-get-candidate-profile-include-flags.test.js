/**
 * Contract tests: get_candidate_profile 7-field include-flag API.
 *
 * Proves the public input contract is:
 *   candidateId (optional) + includeExperience + includeProjects +
 *   includeSkillsSummary + includeEducation + includeCertifications +
 *   includeLanguages — all optional booleans defaulting to true.
 *
 * Each gated section must be omitted when its flag is false and returned when
 * true/default. Flipping one flag must never drop unrelated sections, and the
 * always-on structural fields (additionalSkills / learningSkills) must remain.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGetCandidateProfile,
} from '../../src/mcp/tools/career-read-tools.js';
import {
  GetCandidateProfileInputSchema,
  GetCandidateProfileOutputSchema,
} from '../../src/domain/mcp/career-read-tools.schemas.js';

const tenantId = 'a0000000-0000-4000-a000-000000000002';
const candidateId = 'c0000000-0000-4000-a000-000000000002';

const mockContext = {
  requestId: 'req-include-flags',
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

const profileView = {
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
    {
      skillId: '00000000-0000-4000-a000-0000000000b2',
      slug: 'aws',
      name: 'AWS',
      category: 'CLOUD_DEVOPS',
      provenanceStatus: 'SELF_DECLARED',
      confidenceScore: 0.0,
      evidenceCount: 0,
      source: 'CANDIDATE_DECLARED',
      proficiency: 'PROFICIENT',
    },
  ],
};

const careerProfile = {
  headline: 'Backend Developer',
  summary: 'Summary',
  canonicalEmail: 'alice@example.com',
  topSkills: [
    { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGES', tier: 'PRIMARY', confidenceScore: 0.95, evidenceCount: 8, provenanceStatus: 'VERIFIED' },
  ],
  highlightedProjects: [
    {
      id: 'p0000000-0000-4000-a000-000000000001',
      name: 'vishu1803/project-a',
      headline: 'Headline A',
      role: 'Backend Engineer',
      summary: 'Repository: https://github.com/vishu1803/project-a',
      technologies: ['TypeScript', 'Node.js'],
      bullets: ['Built X', 'Built Y'],
      startDate: '2025-01-01',
      endDate: '2025-06-01',
      provenanceStatus: 'VERIFIED',
    },
  ],
  recentExperience: [
    {
      company: 'Acme Corp',
      title: 'Backend Intern',
      employmentType: 'INTERNSHIP',
      location: 'Gorakhpur',
      startDate: '2025-01-01',
      endDate: '2025-04-30',
      isCurrent: false,
      bullets: ['Built API'],
      technologies: ['Node.js'],
      provenanceStatus: 'VERIFIED',
    },
  ],
  education: [
    {
      institution: 'Rajkiya Engineering College',
      degree: 'Bachelor of Technology',
      fieldOfStudy: 'Electronics Engineering',
      degreeType: 'BACHELORS',
      startDate: '2021-07-01',
      endDate: '2025-06-30',
      isCurrent: false,
      provenanceStatus: 'VERIFIED',
    },
  ],
  certifications: [
    {
      name: 'AWS Certified Developer',
      issuer: 'Amazon',
      issueDate: '2025-05-01',
      provenanceStatus: 'CLAIMED',
    },
  ],
  languages: [
    {
      language: 'English',
      proficiency: 'PROFESSIONAL',
      provenanceStatus: 'CLAIMED',
    },
    {
      language: 'Hindi',
      proficiency: 'NATIVE',
      provenanceStatus: 'CLAIMED',
    },
  ],
};

function buildProfileService() {
  return {
    getProfile: async () => profileView,
    getCareerProfile: async () => careerProfile,
  };
}

const deps = { db: mockDb, candidateProfileService: buildProfileService() };

const SECTIONS = {
  experience: 'recentExperience',
  projects: 'highlightedProjects',
  skills: 'topSkills',
  education: 'education',
  certifications: 'certifications',
  languages: 'languages',
};

describe('get_candidate_profile — 7-field include-flag contract', () => {
  it('1. input schema accepts all seven fields with default=true', () => {
    const parsed = GetCandidateProfileInputSchema.parse({ candidateId });
    assert.equal(parsed.includeExperience, true);
    assert.equal(parsed.includeProjects, true);
    assert.equal(parsed.includeSkillsSummary, true);
    assert.equal(parsed.includeEducation, true);
    assert.equal(parsed.includeCertifications, true);
    assert.equal(parsed.includeLanguages, true);

    const explicit = GetCandidateProfileInputSchema.parse({
      candidateId,
      includeExperience: false,
      includeProjects: false,
      includeSkillsSummary: false,
      includeEducation: false,
      includeCertifications: false,
      includeLanguages: false,
    });
    assert.equal(explicit.includeEducation, false);
    assert.equal(explicit.includeCertifications, false);
    assert.equal(explicit.includeLanguages, false);
  });

  it('2. defaults return every section with fixture data', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId },
      deps
    );
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
    for (const key of Object.values(SECTIONS)) {
      assert.ok(key in result, `expected ${key} present by default`);
    }
    assert.equal(result.education.length, 1);
    assert.equal(result.education[0].institution, 'Rajkiya Engineering College');
    assert.equal(result.certifications[0].name, 'AWS Certified Developer');
    assert.equal(result.languages.length, 2);
  });

  it('3. includeEducation=false omits education only', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId, includeEducation: false },
      deps
    );
    assert.ok(!('education' in result), 'education must be omitted when includeEducation=false');
    assert.ok('certifications' in result, 'certifications must remain');
    assert.ok('languages' in result, 'languages must remain');
    assert.ok('recentExperience' in result, 'experience must remain');
    assert.ok('highlightedProjects' in result, 'projects must remain');
    assert.ok('topSkills' in result, 'skills must remain');
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('4. includeCertifications=false omits certifications only', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId, includeCertifications: false },
      deps
    );
    assert.ok(!('certifications' in result));
    assert.ok('education' in result);
    assert.ok('languages' in result);
    assert.ok('recentExperience' in result);
    assert.ok('highlightedProjects' in result);
    assert.ok('topSkills' in result);
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('5. includeLanguages=false omits languages only', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId, includeLanguages: false },
      deps
    );
    assert.ok(!('languages' in result));
    assert.ok('education' in result);
    assert.ok('certifications' in result);
    assert.ok('recentExperience' in result);
    assert.ok('highlightedProjects' in result);
    assert.ok('topSkills' in result);
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('6. education+certifications+languages=false omits all three while keeping other sections', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      {
        candidateId,
        includeEducation: false,
        includeCertifications: false,
        includeLanguages: false,
      },
      deps
    );
    assert.ok(!('education' in result));
    assert.ok(!('certifications' in result));
    assert.ok(!('languages' in result));
    assert.ok('recentExperience' in result);
    assert.ok('highlightedProjects' in result);
    assert.ok('topSkills' in result);
    assert.ok(Array.isArray(result.additionalSkills), 'additionalSkills always structural');
    assert.ok(Array.isArray(result.learningSkills), 'learningSkills always structural');
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('7. all seven include* flags false keep only always-on structural fields', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      {
        candidateId,
        includeExperience: false,
        includeProjects: false,
        includeSkillsSummary: false,
        includeEducation: false,
        includeCertifications: false,
        includeLanguages: false,
      },
      deps
    );
    for (const key of Object.values(SECTIONS)) {
      assert.ok(!(key in result), `expected ${key} omitted when its flag=false`);
    }
    assert.equal(result.candidate.id, candidateId, 'candidate identity always present');
    assert.ok(Array.isArray(result.additionalSkills));
    assert.ok(Array.isArray(result.learningSkills));
    assert.ok(result.jobPreferences, 'jobPreferences always present');
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });

  it('8. original three flags still gate their sections (regression)', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId, includeExperience: false, includeProjects: false, includeSkillsSummary: false },
      deps
    );
    assert.ok(!('recentExperience' in result));
    assert.ok(!('highlightedProjects' in result));
    assert.ok(!('topSkills' in result));
    assert.ok('education' in result, 'education default true');
    assert.ok('certifications' in result, 'certifications default true');
    assert.ok('languages' in result, 'languages default true');
    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
  });
});
