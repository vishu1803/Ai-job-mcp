/**
 * @file Unit Tests for Step 1: Career Profile Completeness & Resume-to-Profile Ingestion
 *
 * Covers 18 Mandatory Quality Scenarios:
 * 1. Existing profile retrieval
 * 2. Preferences retrieval
 * 3. Profile with complete preferences
 * 4. Profile with missing preferences
 * 5. Resume -> profile extraction
 * 6. Explicit preference extraction
 * 7. No preference inference (strict truth model)
 * 8. User-approved preference save
 * 9. One-time search override
 * 10. Override not persisted
 * 11. Verified skill preservation
 * 12. Claimed skill preservation
 * 13. Project verified with evidence
 * 14. Project remains claimed when evidence absent
 * 15. Multi-tenant profile isolation
 * 16. Sensitive eligibility access control
 * 17. MCP profile output includes preferences
 * 18. Secrets never exposed
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { CareerPreferencesSchema } from '../../src/domain/candidate/career-preferences.schemas.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Step 1: Career Profile Completeness & Resume-to-Profile Ingestion Unit Tests', () => {
  const tenantA = 'a0000000-0000-4000-a000-000000000001';
  const tenantB = 'b0000000-0000-4000-a000-000000000002';
  const userA = '10000000-0000-4000-a000-000000000001';
  const candidateIdA = 'c0000000-0000-4000-a000-000000000001';

  const contextA = {
    tenantId: tenantA,
    userId: userA,
    role: 'MEMBER',
  };

  const resumeParser = new ResumeParserService();

  // Mock candidate in DB
  const mockCandidateRecord = {
    id: candidateIdA,
    tenantId: tenantA,
    userId: userA,
    displayName: 'Vishw Nath',
    headline: 'Senior Full Stack Engineer | Node.js & React',
    summary: 'Full stack developer with 5+ years of production experience.',
    canonicalEmail: 'vishw@example.com',
    status: 'ACTIVE',
    profileMetadata: {
      currentRole: 'Senior Full Stack Engineer',
      location: 'San Francisco, CA',
      seniority: 'SENIOR',
      yearsOfExperience: 5,
      careerPreferences: {
        targetRoles: ['Staff Backend Engineer', 'Distributed Systems Architect'],
        preferredLocations: ['Remote', 'San Francisco, CA'],
        remotePreference: 'REMOTE_FIRST',
        employmentTypes: ['FULL_TIME'],
        salaryFloor: 180000,
        salaryCurrency: 'USD',
        industries: ['Developer Tools', 'Cloud Infrastructure'],
        companiesToPrioritize: ['Stripe', 'Datadog'],
        companiesToAvoid: ['Legacy Corp'],
        preferredTechStack: ['Node.js', 'Fastify', 'PostgreSQL', 'Docker'],
        workAuthorization: ['United States', 'India'],
        visaSponsorshipRequired: false,
        availabilityDate: 'Immediate',
        relocationPreference: 'REMOTE_ONLY',
      },
      userCustom: {
        experience: [
          {
            company: 'Tech Corp',
            title: 'Senior Backend Engineer',
            startDate: '2022-01-01',
            endDate: null,
            isCurrent: true,
            skills: ['Node.js', 'PostgreSQL'],
          },
        ],
        education: [
          {
            institution: 'University of Engineering',
            degree: 'B.S. Computer Science',
            fieldOfStudy: 'Software Engineering',
            startDate: '2016-08-01',
            endDate: '2020-05-01',
          },
        ],
        certifications: ['AWS Certified Solutions Architect'],
        languages: ['English (Fluent)', 'Hindi (Native)'],
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Mock DB factory
  function createMockDb(customCandidate = mockCandidateRecord, skillsList = [], projectsList = []) {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(projectsList),
            limit: () => Promise.resolve([customCandidate]),
            then: (resolve) => resolve([customCandidate]),
          }),
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(skillsList),
              then: (resolve) => resolve(skillsList),
            }),
          }),
          leftJoin: () => ({
            where: () => ({
              orderBy: () => {
                const allEvidence = projectsList
                  .flatMap((p) => p.evidence || [])
                  .map((e) => ({
                    id: e.id || 'ev-1',
                    evidenceType: e.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
                    confidenceScore: 1.0,
                    detectedAt: new Date().toISOString(),
                  }));
                return Promise.resolve(allEvidence);
              },
              then: (resolve) => {
                const allEvidence = projectsList
                  .flatMap((p) => p.evidence || [])
                  .map((e) => ({
                    id: e.id || 'ev-1',
                    evidenceType: e.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
                    confidenceScore: 1.0,
                    detectedAt: new Date().toISOString(),
                  }));
                resolve(allEvidence);
              },
            }),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([customCandidate]),
          }),
        }),
      }),
    };
  }

  // 1. Existing profile retrieval
  it('1. retrieves existing canonical candidate profile with full metadata', async () => {
    const mockDb = createMockDb();
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.ok(profile);
    assert.strictEqual(profile.displayName, 'Vishw Nath');
    assert.strictEqual(profile.headline, 'Senior Full Stack Engineer | Node.js & React');
    assert.strictEqual(profile.currentRole, 'Senior Full Stack Engineer');
    assert.strictEqual(profile.location, 'San Francisco, CA');
    assert.strictEqual(profile.canonicalEmail, 'vishw@example.com');
  });

  // 2. Preferences retrieval
  it('2. retrieves saved career preferences accurately matching schema', async () => {
    const mockDb = createMockDb();
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const prefs = profile.jobPreferences;
    assert.deepStrictEqual(prefs.targetRoles, [
      'Staff Backend Engineer',
      'Distributed Systems Architect',
    ]);
    assert.strictEqual(prefs.remotePreference, 'REMOTE_FIRST');
    assert.strictEqual(prefs.salaryFloor, 180000);
    assert.strictEqual(prefs.salaryCurrency, 'USD');
    assert.deepStrictEqual(prefs.preferredTechStack, [
      'Node.js',
      'Fastify',
      'PostgreSQL',
      'Docker',
    ]);
  });

  // 3. Profile with complete preferences
  it('3. marks profile as COMPLETE FOR JOB SEARCH when required fields are present', async () => {
    const mockDb = createMockDb();
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.ok(profile.completeness);
    assert.strictEqual(profile.completeness.isReadyForJobSearch, true);
    assert.strictEqual(profile.completeness.status, 'COMPLETE FOR JOB SEARCH');
    assert.strictEqual(profile.completeness.missingRequiredForSearch.length, 0);
  });

  // 4. Profile with missing preferences
  it('4. identifies missing preferences and indicates incomplete status', async () => {
    const incompleteCandidate = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        careerPreferences: {
          targetRoles: [],
          preferredLocations: [],
          remotePreference: 'FLEXIBLE',
        },
      },
    };
    const mockDb = createMockDb(incompleteCandidate);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.strictEqual(profile.completeness.isReadyForJobSearch, false);
    assert.ok(profile.completeness.status.includes('NEEDS ATTENTION'));
    assert.ok(profile.completeness.missingRequiredForSearch.includes('targetRoles'));
    assert.ok(profile.completeness.missingRequiredForSearch.includes('preferredLocations'));
  });

  // 5. Resume -> profile extraction
  it('5. extracts professional narrative, experience, and education from resume text', () => {
    const sampleResume = `
      Jane Doe
      jane@example.com | San Francisco, CA
      Senior Backend Engineer

      SUMMARY
      Experienced distributed systems engineer with 8 years in cloud architecture.

      EXPERIENCE
      Cloud Systems Inc | Lead Architect | 2021 - Present
      - Designed distributed consensus engine in Go and Kubernetes.
      - Reduced p99 latency by 45% using Redis caching.

      EDUCATION
      Stanford University | B.S. Computer Science | 2013 - 2017

      SKILLS
      Languages: Go, TypeScript, Python
      Technologies: Docker, Kubernetes, PostgreSQL
    `;

    const sections = resumeParser.splitIntoSections(sampleResume);
    assert.ok(sections.length >= 4);

    const summarySec = sections.find((s) => s.sectionType === 'SUMMARY');
    assert.ok(summarySec);

    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    assert.ok(skillsSec);
    assert.ok(skillsSec.structuredData.skills.includes('Go'));
    assert.ok(skillsSec.structuredData.skills.includes('Kubernetes'));
  });

  // 6. Explicit preference extraction
  it('6. extracts explicitly declared user job preferences when stated in resume', () => {
    const textWithExplicitIntent = `
      John Smith
      john@example.com
      Seeking remote Senior Backend Engineer roles in India.
      Summary: 6 years building microservices with Fastify and PostgreSQL.
    `;

    const explicit = resumeParser.extractExplicitPreferences(textWithExplicitIntent);
    assert.strictEqual(explicit.hasExplicitPreferences, true);
    assert.strictEqual(explicit.remotePreference, 'REMOTE_ONLY');
    assert.ok(explicit.targetRoles.some((r) => /senior backend engineer/i.test(r)));
    assert.ok(explicit.preferredLocations.includes('India'));
    assert.strictEqual(explicit.provenance, 'USER_PROVIDED');
  });

  // 7. No preference inference
  it('7. strictly refuses to infer preferences (salary, remote, roles) when not explicitly stated', () => {
    const historicalResume = `
      Bob Engineer
      Worked remotely at Acme Corp as a Staff Platform Engineer from 2019 to 2023.
      Earned competitive equity package. Managed US and EU infrastructure.
    `;

    const explicit = resumeParser.extractExplicitPreferences(historicalResume);
    // Historical work experience should NOT trigger explicit job preferences
    assert.strictEqual(explicit.hasExplicitPreferences, false);
    assert.strictEqual(explicit.targetRoles.length, 0);
    assert.strictEqual(explicit.preferredLocations.length, 0);
  });

  // 8. User-approved preference save
  it('8. updates and persists career preferences with strict schema validation', async () => {
    let capturedUpdate = null;
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([mockCandidateRecord]),
        }),
      }),
      update: () => ({
        set: (data) => {
          capturedUpdate = data;
          return {
            where: () => Promise.resolve([{ ...mockCandidateRecord, ...data }]),
          };
        },
      }),
    };

    const service = new CandidateProfileService(mockDb);
    const updatePayload = {
      targetRoles: ['Principal AI Architect'],
      salaryFloor: 250000,
      remotePreference: 'REMOTE_ONLY',
    };

    const updated = await service.updateCareerPreferences(contextA, candidateIdA, updatePayload);
    assert.ok(updated);
    assert.deepStrictEqual(updated.targetRoles, ['Principal AI Architect']);
    assert.strictEqual(updated.salaryFloor, 250000);
    assert.strictEqual(updated.remotePreference, 'REMOTE_ONLY');
    assert.ok(capturedUpdate);
  });

  // 9. One-time search override
  it('9. applies one-time query overrides during job search', async () => {
    const discovery = new JobDiscoveryService();
    const savedPreferences = {
      targetRoles: ['Backend Engineer'],
      preferredLocations: ['San Francisco'],
      remotePreference: 'REMOTE_FIRST',
      salaryFloor: 150000,
    };

    // Explicit override: "Fastify Engineer in Bangalore"
    const searchResult = await discovery.searchJobs(
      {
        query: 'Fastify Engineer',
        location: 'Bangalore',
        workplaceType: 'REMOTE',
      },
      savedPreferences
    );

    assert.ok(searchResult);
    assert.ok(Array.isArray(searchResult.jobs));
  });

  // 10. Override not persisted
  it('10. verifies that one-time search query parameters do not mutate saved profile', async () => {
    const originalPreferences = { ...mockCandidateRecord.profileMetadata.careerPreferences };
    const discovery = new JobDiscoveryService();

    // Perform query with overrides
    await discovery.searchJobs(
      { query: 'Temporary Query', location: 'London' },
      mockCandidateRecord.profileMetadata.careerPreferences
    );

    // Assert saved preferences object was not mutated
    assert.deepStrictEqual(
      mockCandidateRecord.profileMetadata.careerPreferences.targetRoles,
      originalPreferences.targetRoles
    );
    assert.deepStrictEqual(
      mockCandidateRecord.profileMetadata.careerPreferences.preferredLocations,
      originalPreferences.preferredLocations
    );
  });

  // 11. Verified skill preservation
  it('11. preserves VERIFIED skills backed by AST repository evidence', async () => {
    const verifiedSkillRow = {
      cs: {
        candidateId: candidateIdA,
        tenantId: tenantA,
        skillId: 's-1',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 8,
      },
      skillSlug: 'fastify',
      skillName: 'Fastify',
    };

    const mockDb = createMockDb(mockCandidateRecord, [verifiedSkillRow]);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.ok(profile.verifiedSkillsSummary.includes('Fastify'));
  });

  // 12. Claimed skill preservation
  it('12. preserves CLAIMED skills without promoting them to verified', async () => {
    const claimedSkillRow = {
      cs: {
        candidateId: candidateIdA,
        tenantId: tenantA,
        skillId: 's-2',
        provenanceStatus: 'CLAIMED',
        confidenceScore: 0.3,
        evidenceCount: 0,
      },
      skillSlug: 'rust',
      skillName: 'Rust',
    };

    const mockDb = createMockDb(mockCandidateRecord, [claimedSkillRow]);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    // Claimed skills should NOT be in verifiedSkillsSummary
    assert.strictEqual(profile.verifiedSkillsSummary.includes('Rust'), false);
  });

  // 13. Project verified with evidence
  it('13. marks projects with linked repository evidence as VERIFIED', async () => {
    const verifiedProject = {
      id: 'b0000000-0000-4000-a000-000000000001',
      candidateId: candidateIdA,
      tenantId: tenantA,
      name: 'Fastify MCP Gateway',
      headline: 'High-performance MCP server',
      role: 'Creator',
      isHighlighted: true,
      createdAt: new Date().toISOString(),
      evidence: [{ id: 'ev-1', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' }],
    };

    const mockDb = createMockDb(mockCandidateRecord, [], [verifiedProject]);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const proj = profile.highlightedProjects.find((p) => p.name === 'Fastify MCP Gateway');
    assert.ok(proj);
    assert.strictEqual(proj.provenanceStatus, 'VERIFIED');
  });

  // 14. Project remains claimed when evidence absent
  it('14. retains projects without repository evidence as CLAIMED / UNVERIFIED (never deleted)', async () => {
    const unverifiedProject = {
      id: 'b0000000-0000-4000-a000-000000000002',
      candidateId: candidateIdA,
      tenantId: tenantA,
      name: 'Unverified Resume Project',
      headline: 'Closed source enterprise work',
      role: 'Contributor',
      isHighlighted: false,
      createdAt: new Date().toISOString(),
      evidence: [], // 0 evidence signals
    };

    const mockDb = createMockDb(mockCandidateRecord, [], [unverifiedProject]);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const proj = profile.highlightedProjects.find((p) => p.name === 'Unverified Resume Project');
    assert.ok(proj);
    assert.strictEqual(proj.provenanceStatus, 'CLAIMED');
  });

  // 15. Multi-tenant profile isolation
  it('15. rejects cross-tenant profile access with default-deny 404', async () => {
    const crossTenantContext = { tenantId: tenantB, userId: 'user-b', role: 'MEMBER' };
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]), // Empty for wrong tenant
        }),
      }),
    };

    const service = new CandidateProfileService(mockDb);
    await assert.rejects(
      async () => service.getCareerProfile(crossTenantContext, candidateIdA),
      (err) => err instanceof NotFoundError && err.statusCode === 404
    );
  });

  // 16. Sensitive eligibility access control
  it('16. securely models voluntary eligibility fields without exposing private credentials', () => {
    const prefs = CareerPreferencesSchema.parse({
      workAuthorization: ['US Citizen'],
      visaSponsorshipRequired: false,
      availabilityDate: '2 Weeks Notice',
    });

    assert.deepStrictEqual(prefs.workAuthorization, ['US Citizen']);
    assert.strictEqual(prefs.visaSponsorshipRequired, false);
    assert.strictEqual(prefs.availabilityDate, '2 Weeks Notice');
  });

  // 17. MCP profile output includes preferences
  it('17. verifies get_candidate_profile MCP output contains full job preferences and eligibility', async () => {
    const mockProfileService = {
      getProfile: async () => ({
        candidate: mockCandidateRecord,
        identities: [{ provider: 'GITHUB_APP', externalUsername: 'vishw', verified: true }],
        resources: [{ id: 'res-1', provider: 'GITHUB_APP', name: 'career-hub', isPrivate: false }],
        projects: [
          {
            id: 'b0000000-0000-4000-a000-000000000001',
            name: 'Career Hub',
            headline: 'MCP Career Agent',
            role: 'Lead',
            startDate: '2023-01-01',
            endDate: null,
            isHighlighted: true,
            linkedResourceCount: 1,
            evidence: [{ id: 'ev-1' }],
          },
        ],
        skills: [
          {
            slug: 'nodejs',
            name: 'Node.js',
            category: 'LANGUAGES',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            evidenceCount: 10,
          },
        ],
      }),
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ id: candidateIdA }],
          }),
        }),
      }),
    };

    const mcpContext = {
      requestId: 'req-1',
      tenantId: tenantA,
      userId: userA,
      role: 'MEMBER',
      tokenScopes: ['career:read'],
      authMethod: 'MCP_API_TOKEN',
      clientInfo: { protocolVersion: '2026-07-28', ipAddress: '127.0.0.1' },
      authenticatedAt: new Date().toISOString(),
    };

    const result = await handleGetCandidateProfile(
      mcpContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
    assert.ok(result.jobPreferences);
    assert.deepStrictEqual(result.jobPreferences.targetRoles, [
      'Staff Backend Engineer',
      'Distributed Systems Architect',
    ]);
    assert.strictEqual(result.jobPreferences.remotePreference, 'REMOTE_FIRST');
    assert.strictEqual(result.jobPreferences.salaryFloor, 180000);
    assert.ok(result.eligibility);
    assert.deepStrictEqual(result.eligibility.workAuthorization, ['United States', 'India']);
    assert.ok(result.profileCompleteness);
    assert.strictEqual(result.profileCompleteness.isReadyForJobSearch, true);
  });

  // 18. Secrets never exposed
  it('18. guarantees zero secrets or private credentials in profile JSON output', async () => {
    const mockDb = createMockDb();
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const serialized = JSON.stringify(profile);

    assert.strictEqual(serialized.includes('encryptedCredentials'), false);
    assert.strictEqual(serialized.includes('accessToken'), false);
    assert.strictEqual(serialized.includes('refreshToken'), false);
    assert.strictEqual(serialized.includes('privateKey'), false);
    assert.strictEqual(serialized.includes('clientSecret'), false);
  });
});
