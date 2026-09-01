/**
 * @file MCP Skill Provenance Alignment Tests
 *
 * Verifies that get_candidate_profile and list_verified_skills report
 * identical provenanceStatus for the same candidate skill.
 *
 * Root cause: list_verified_skills hard-coded 'VERIFIED' while
 * get_candidate_profile computed 'CORROBORATED' via getCareerProfile reconciliation.
 *
 * Fix: Both tools now use CandidateProfileService.resolveSkillProvenanceStatus.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { ListVerifiedSkillsOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { randomUUID } from 'node:crypto';

// =============================================================================
// 1. Unit Tests: resolveSkillProvenanceStatus
// =============================================================================

describe('CandidateProfileService.resolveSkillProvenanceStatus', () => {
  const resumeSkillNames = new Set(['react', 'postgresql', 'fastapi', 'next.js', 'typescript']);

  it('returns CORROBORATED when GitHub evidence + resume claim both exist', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'React',
      canonicalSlug: 'react',
      resumeSkillNames,
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('returns VERIFIED when GitHub evidence exists but no resume claim', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Fastify',
      canonicalSlug: 'fastify',
      resumeSkillNames,
    });
    assert.equal(result, 'VERIFIED');
  });

  it('returns CORROBORATED for PostgreSQL (GitHub + resume)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'PostgreSQL',
      canonicalSlug: 'postgresql',
      resumeSkillNames,
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('returns CORROBORATED for FastAPI (GitHub + resume)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'FastAPI',
      canonicalSlug: 'fastapi',
      resumeSkillNames,
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('returns CORROBORATED for Next.js (GitHub + resume)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Next.js',
      canonicalSlug: 'nextjs',
      resumeSkillNames,
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('returns CORROBORATED for TypeScript (GitHub + resume)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'TypeScript',
      canonicalSlug: 'typescript',
      resumeSkillNames,
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('returns VERIFIED for Drizzle ORM (GitHub only, not in resume)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Drizzle ORM',
      canonicalSlug: 'drizzle-orm',
      resumeSkillNames,
    });
    assert.equal(result, 'VERIFIED');
  });

  it('returns CLAIMED when only resume claim exists (no GitHub evidence)', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'CLAIMED',
      skillName: 'Django',
      canonicalSlug: 'django',
      resumeSkillNames,
    });
    assert.equal(result, 'CLAIMED');
  });

  it('returns USER_PROVIDED for manual user claims', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'CLAIMED',
      skillName: 'Custom Skill',
      canonicalSlug: 'custom-skill',
      resumeSkillNames: new Set(),
      metadata: { isUserClaim: true, source: 'USER_PROVIDED' },
    });
    assert.equal(result, 'USER_PROVIDED');
  });

  it('returns INFERRED for taxonomy-inferred skills', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'INFERRED',
      skillName: 'GraphQL',
      canonicalSlug: 'graphql',
      resumeSkillNames: new Set(),
      metadata: { source: 'TAXONOMY_INFERRED' },
    });
    assert.equal(result, 'INFERRED');
  });

  it('is case-insensitive for resume skill matching', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'REACT',
      canonicalSlug: 'REACT',
      resumeSkillNames: new Set(['react']),
    });
    assert.equal(result, 'CORROBORATED');
  });

  it('matches by slug when name does not match', () => {
    const result = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Some Alias',
      canonicalSlug: 'react',
      resumeSkillNames: new Set(['react']),
    });
    assert.equal(result, 'CORROBORATED');
  });
});

// =============================================================================
// 2. Cross-Tool Consistency Tests (Mock-based)
// =============================================================================

describe('Cross-Tool Provenance Consistency', () => {
  // Skills in candidate_skills table (all VERIFIED — GitHub-backed)
  const candidateSkillsRows = [
    {
      slug: 'react',
      name: 'React',
      category: 'FRAMEWORK',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceCount: 34,
    },
    {
      slug: 'postgresql',
      name: 'PostgreSQL',
      category: 'DATABASE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceCount: 13,
    },
    {
      slug: 'fastapi',
      name: 'FastAPI',
      category: 'FRAMEWORK',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.9,
      evidenceCount: 8,
    },
    {
      slug: 'nextjs',
      name: 'Next.js',
      category: 'FRAMEWORK',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: 12,
    },
    {
      slug: 'typescript',
      name: 'TypeScript',
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceCount: 20,
    },
    {
      slug: 'fastify',
      name: 'Fastify',
      category: 'FRAMEWORK',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 1.0,
      evidenceCount: 9,
    },
    {
      slug: 'drizzle-orm',
      name: 'Drizzle ORM',
      category: 'DATABASE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.85,
      evidenceCount: 5,
    },
  ];

  // Resume skills (subset — not all GitHub skills appear in resume)
  const resumeSkills = ['React', 'PostgreSQL', 'FastAPI', 'Next.js', 'TypeScript'];

  // Mock profile for get_candidate_profile
  const mockCareerProfile = {
    topSkills: candidateSkillsRows.map((s) => ({
      slug: s.slug,
      name: s.name,
      category: s.category,
      tier: 'PRIMARY',
      confidenceScore: s.confidenceScore,
      evidenceCount: s.evidenceCount,
      // These are computed by getCareerProfile reconciliation
      provenanceStatus: resumeSkills.some((r) => r.toLowerCase() === s.name.toLowerCase())
        ? 'CORROBORATED'
        : 'VERIFIED',
      truthStatus: 'VERIFIED',
      githubEvidence: true,
      resumeClaim: resumeSkills.some((r) => r.toLowerCase() === s.name.toLowerCase()),
    })),
    highlightedProjects: [],
    recentExperience: [],
    education: [],
    certifications: [],
    languages: [],
    jobPreferences: {
      targetRoles: [],
      preferredLocations: [],
      remotePreference: 'FLEXIBLE',
      employmentTypes: ['FULL_TIME'],
    },
    eligibility: { workAuthorization: [], visaSponsorshipRequired: false, availabilityDate: null },
    experienceDuration: {
      totalMonths: 0,
      totalYears: 0,
      professionalMonths: 0,
      professionalYears: 0,
    },
    profileReadiness: {
      score: 100,
      status: 'PROFILE POPULATED',
      isComplete: true,
      missingFields: [],
      actionableFeedback: 'Complete.',
    },
    completeness: {
      score: 100,
      status: 'STRONG',
      isReadyForJobSearch: true,
      missingRequiredForSearch: [],
      missingOptional: [],
      actionableFeedback: 'Complete.',
    },
    portfolioLinks: [],
    headline: 'Backend Developer',
    summary: 'Building systems.',
    location: 'Remote',
    canonicalEmail: 'test@example.com',
    currentRole: 'Backend Developer',
    currentEmployment: null,
    careerStatus: 'EMPLOYED',
    seniority: 'SENIOR',
    yearsOfExperience: 5,
  };

  it('both tools return identical provenanceStatus for every shared skill', async () => {
    // 1. Get skills from get_candidate_profile (via careerProfile.topSkills)
    const profileSkills = mockCareerProfile.topSkills.map((s) => ({
      name: s.name,
      slug: s.slug,
      provenanceStatus: s.provenanceStatus,
    }));

    // 2. Get skills from list_verified_skills (via resolveSkillProvenanceStatus)
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const listSkills = candidateSkillsRows.map((s) => ({
      name: s.name,
      slug: s.slug,
      provenanceStatus: CandidateProfileService.resolveSkillProvenanceStatus({
        dbProvenanceStatus: s.provenanceStatus,
        skillName: s.name,
        canonicalSlug: s.slug,
        resumeSkillNames: resumeSkillNamesSet,
      }),
    }));

    // 3. Assert consistency for every skill present in both
    for (const profileSkill of profileSkills) {
      const listSkill = listSkills.find((s) => s.slug === profileSkill.slug);
      assert.ok(listSkill, `Skill ${profileSkill.name} should appear in list_verified_skills`);
      assert.equal(
        listSkill.provenanceStatus,
        profileSkill.provenanceStatus,
        `Provenance mismatch for ${profileSkill.name}: get_candidate_profile=${profileSkill.provenanceStatus} vs list_verified_skills=${listSkill.provenanceStatus}`
      );
    }
  });

  it('React is CORROBORATED in both tools', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const reactFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'react');
    const reactFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'React',
      canonicalSlug: 'react',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(reactFromProfile.provenanceStatus, 'CORROBORATED');
    assert.equal(reactFromList, 'CORROBORATED');
    assert.equal(reactFromProfile.provenanceStatus, reactFromList);
  });

  it('PostgreSQL is CORROBORATED in both tools', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const pgFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'postgresql');
    const pgFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'PostgreSQL',
      canonicalSlug: 'postgresql',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(pgFromProfile.provenanceStatus, 'CORROBORATED');
    assert.equal(pgFromList, 'CORROBORATED');
  });

  it('FastAPI is CORROBORATED in both tools', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const fastapiFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'fastapi');
    const fastapiFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'FastAPI',
      canonicalSlug: 'fastapi',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(fastapiFromProfile.provenanceStatus, 'CORROBORATED');
    assert.equal(fastapiFromList, 'CORROBORATED');
  });

  it('Next.js is CORROBORATED in both tools', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const nextFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'nextjs');
    const nextFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Next.js',
      canonicalSlug: 'nextjs',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(nextFromProfile.provenanceStatus, 'CORROBORATED');
    assert.equal(nextFromList, 'CORROBORATED');
  });

  it('TypeScript is CORROBORATED in both tools', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const tsFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'typescript');
    const tsFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'TypeScript',
      canonicalSlug: 'typescript',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(tsFromProfile.provenanceStatus, 'CORROBORATED');
    assert.equal(tsFromList, 'CORROBORATED');
  });

  it('Fastify is VERIFIED in both tools (no resume claim)', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const ffFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'fastify');
    const ffFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Fastify',
      canonicalSlug: 'fastify',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(ffFromProfile.provenanceStatus, 'VERIFIED');
    assert.equal(ffFromList, 'VERIFIED');
  });

  it('Drizzle ORM is VERIFIED in both tools (no resume claim)', () => {
    const resumeSkillNamesSet = new Set(resumeSkills.map((s) => s.toLowerCase()));
    const drzFromProfile = mockCareerProfile.topSkills.find((s) => s.slug === 'drizzle-orm');
    const drzFromList = CandidateProfileService.resolveSkillProvenanceStatus({
      dbProvenanceStatus: 'VERIFIED',
      skillName: 'Drizzle ORM',
      canonicalSlug: 'drizzle-orm',
      resumeSkillNames: resumeSkillNamesSet,
    });
    assert.equal(drzFromProfile.provenanceStatus, 'VERIFIED');
    assert.equal(drzFromList, 'VERIFIED');
  });

  it('Python does NOT appear in list_verified_skills (no GitHub evidence)', () => {
    // Python has no entry in candidateSkillsRows (no GitHub evidence)
    const pythonInList = candidateSkillsRows.some(
      (s) => s.slug === 'python' || s.name.toLowerCase() === 'python'
    );
    assert.equal(pythonInList, false, 'Python should not be in candidateSkillsRows');
  });

  it('list_verified_skills output schema accepts CORROBORATED', () => {
    const output = {
      items: [
        {
          skillId: randomUUID(),
          slug: 'react',
          name: 'React',
          category: 'FRAMEWORK',
          provenanceStatus: 'CORROBORATED',
          confidenceScore: 1.0,
          evidenceCount: 34,
          firstObservedAt: new Date().toISOString(),
          lastObservedAt: new Date().toISOString(),
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    };

    // Should not throw
    const result = ListVerifiedSkillsOutputSchema.parse(output);
    assert.equal(result.items[0].provenanceStatus, 'CORROBORATED');
  });

  it('list_verified_skills output schema still accepts VERIFIED', () => {
    const output = {
      items: [
        {
          skillId: randomUUID(),
          slug: 'fastify',
          name: 'Fastify',
          category: 'FRAMEWORK',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 1.0,
          evidenceCount: 9,
          firstObservedAt: new Date().toISOString(),
          lastObservedAt: new Date().toISOString(),
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    };

    const result = ListVerifiedSkillsOutputSchema.parse(output);
    assert.equal(result.items[0].provenanceStatus, 'VERIFIED');
  });

  it('list_verified_skills output schema rejects CLAIMED', () => {
    const output = {
      items: [
        {
          skillId: randomUUID(),
          slug: 'django',
          name: 'Django',
          category: 'FRAMEWORK',
          provenanceStatus: 'CLAIMED',
          confidenceScore: 0.5,
          evidenceCount: 0,
          firstObservedAt: null,
          lastObservedAt: null,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalCount: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    };

    assert.throws(() => ListVerifiedSkillsOutputSchema.parse(output), /Invalid/);
  });
});
