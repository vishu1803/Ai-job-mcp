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
import {
  CareerPreferencesSchema,
  CandidateCareerProfileSchema,
} from '../../src/domain/candidate/career-preferences.schemas.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { renderProfilePage } from '../../src/views/profile.page.js';
import { NotFoundError } from '../../src/errors/index.js';
import {
  projectResources,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';

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
  // Table-aware stub emulating the real query shapes consumed by
  // CandidateProfileService.getProfile (batched project evidence + resources)
  // while preserving the legacy per-table row shapes the assertions rely on.
  function createMockDb(customCandidate = mockCandidateRecord, skillsList = [], projectsList = []) {
    const evidenceRowsForProject = (p) =>
      (p.evidence || []).map((e) => ({
        id: e.id || 'ev-1',
        tenantId: tenantA,
        candidateId: candidateIdA,
        projectId: p.id || null,
        skillId: e.skillId || null,
        evidenceType: e.evidenceType || 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceLocation: e.sourceLocation || { filePath: 'package.json' },
        excerpt: e.excerpt || null,
        confidenceScore: typeof e.confidenceScore === 'number' ? e.confidenceScore : 1.0,
        detectedAt: new Date().toISOString(),
        skillSlug: e.skillSlug || null,
        skillName: e.skillName || null,
        metadata: e.metadata || {},
      }));
    const allEvidenceRows = projectsList.flatMap((p) => evidenceRowsForProject(p));
    const projectResourceRows = projectsList.map((p) => ({
      id: `pr-${p.id}`,
      tenantId: tenantA,
      candidateId: candidateIdA,
      projectId: p.id,
    }));

    const makeChain = (val) => {
      const p = Promise.resolve(val);
      p.where = () => makeChain(val);
      p.orderBy = () => makeChain(val);
      p.limit = () => makeChain(val);
      p.innerJoin = () => makeChain(skillsList);
      return p;
    };

    const genericChain = () => {
      const chain = makeChain([customCandidate]);
      chain.where = () => {
        const wChain = makeChain([customCandidate]);
        wChain.orderBy = () => {
          const oChain = makeChain(projectsList);
          oChain.limit = () => makeChain([customCandidate]);
          return oChain;
        };
        return wChain;
      };
      chain.innerJoin = () => ({
        where: () => makeChain(skillsList),
        orderBy: () => makeChain(skillsList),
      });
      return chain;
    };

    return {
      select: () => ({
        from: (table) => {
          // Linked-resource rows must carry projectId for the batched count query.
          if (table === projectResources) {
            const chain = makeChain(projectResourceRows);
            chain.where = () => makeChain(projectResourceRows);
            return chain;
          }
          // Evidence items: project-evidence lookups run via leftJoin(skills) and must
          // carry their owning projectId so the batched grouping preserves per-project
          // evidence. Candidate-level all-evidence reads keep the plain candidate row.
          if (table === evidenceItems) {
            const chain = makeChain([customCandidate]);
            chain.where = () => makeChain([customCandidate]);
            chain.leftJoin = () => ({
              where: () => makeChain(allEvidenceRows),
              orderBy: () => makeChain(allEvidenceRows),
            });
            return chain;
          }
          if (table === candidateSkills) {
            const chain = makeChain(skillsList);
            chain.innerJoin = () => ({
              where: () => makeChain(skillsList),
              orderBy: () => makeChain(skillsList),
            });
            return chain;
          }
          // candidates / candidateIdentities / resources / projects / resumes /
          // resumeSections — preserved legacy chain behavior (where → candidate row,
          // where().orderBy() → projects list used by the projects query).
          return genericChain();
        },
      }),
      update: () => ({
        set: (data) => ({
          where: () => ({
            returning: () => Promise.resolve([{ ...customCandidate, ...data }]),
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

  // 19. Resume data propagation into career profile
  it('19. unifies resume experience, education, projects, and certifications into career profile', async () => {
    const candidateWithResumeData = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        userCustom: {}, // No custom edits
        resumeData: {
          sourceResumeId: 'r-1',
          sourceVersion: 1,
          identity: {
            name: 'Alex Rivera',
            email: 'alex@example.com',
            headline: 'Staff Systems Architect',
            location: 'Austin, TX',
            github: 'https://github.com/alexrivera',
            linkedin: 'https://linkedin.com/in/alexrivera',
            leetcode: 'https://leetcode.com/alexrivera',
            portfolioUrls: ['https://alexrivera.dev'],
          },
          summary: 'Experienced distributed systems engineer with 10 years experience.',
          experience: [
            {
              company: 'Cloud Corp',
              title: 'Principal Engineer',
              location: 'Austin, TX',
              startDate: '2020-01-01',
              endDate: null,
              isCurrent: true,
              bullets: ['Designed microservices architecture'],
              verifiedSkillsUsed: [],
              provenanceStatus: 'CLAIMED',
            },
          ],
          education: [
            {
              institution: 'MIT',
              degree: 'M.S. Computer Science',
              fieldOfStudy: 'Distributed Systems',
              startDate: null,
              endDate: null,
              provenanceStatus: 'CLAIMED',
            },
          ],
          projects: [
            {
              name: 'Distributed Raft Consensus',
              headline: 'Consensus engine in Rust',
              technologies: ['Rust', 'Tokio'],
              bullets: ['Implemented Raft algorithm'],
              urls: ['https://github.com/alexrivera/raft'],
              provenanceStatus: 'CLAIMED',
            },
          ],
          certifications: ['CKA Kubernetes Administrator'],
          skills: ['Rust', 'Distributed Systems'],
          provenance: 'RESUME_CLAIM',
        },
      },
    };

    const mockDb = createMockDb(candidateWithResumeData);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.ok(profile);
    assert.strictEqual(profile.recentExperience.length, 1);
    assert.strictEqual(profile.recentExperience[0].company, 'Cloud Corp');
    assert.strictEqual(profile.recentExperience[0].provenanceStatus, 'CLAIMED');

    assert.strictEqual(profile.education.length, 1);
    assert.strictEqual(profile.education[0].institution, 'MIT');
    assert.strictEqual(profile.education[0].provenanceStatus, 'CLAIMED');

    assert.ok(profile.certifications.includes('CKA Kubernetes Administrator'));
    assert.ok(profile.portfolioLinks.some((p) => p.url === 'https://alexrivera.dev'));
  });

  // 20. Precedence: explicit user edit > resume claims
  it('20. enforces userCustom edits taking precedence over resumeData claims', async () => {
    const candidateWithBoth = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        userCustom: {
          experience: [
            {
              company: 'User Custom Company',
              title: 'Lead Architect',
              startDate: '2023-01-01',
              isCurrent: true,
            },
          ],
          education: [
            {
              institution: 'Self-Directed University',
              degree: 'Ph.D.',
            },
          ],
        },
        resumeData: {
          experience: [
            {
              company: 'Resume Claim Company',
              title: 'Junior Developer',
              startDate: '2018-01-01',
            },
          ],
          education: [
            {
              institution: 'Resume School',
              degree: 'B.A.',
            },
          ],
        },
      },
    };

    const mockDb = createMockDb(candidateWithBoth);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.strictEqual(profile.recentExperience[0].company, 'User Custom Company');
    assert.strictEqual(profile.recentExperience[0].provenanceStatus, 'USER_PROVIDED');
    assert.strictEqual(profile.education[0].institution, 'Self-Directed University');
    assert.strictEqual(profile.education[0].provenanceStatus, 'USER_PROVIDED');
  });

  // 21. Skills truth status calculation
  it('21. cross-references skills with GitHub AST evidence and resume claims', async () => {
    const candidateWithSkills = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Fastify', 'Docker', 'Kubernetes'],
        },
      },
    };

    const skillsList = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastify',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 12,
        },
        skillSlug: 'fastify',
        skillName: 'Fastify',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-docker',
          provenanceStatus: 'CLAIMED',
          confidenceScore: 0.5,
          evidenceCount: 0,
        },
        skillSlug: 'docker',
        skillName: 'Docker',
      },
    ];

    const mockDb = createMockDb(candidateWithSkills, skillsList);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const fastifySkill = profile.topSkills.find((s) => s.slug === 'fastify');
    assert.ok(fastifySkill);
    assert.strictEqual(fastifySkill.githubEvidence, true);
    assert.strictEqual(fastifySkill.truthStatus, 'VERIFIED');

    const dockerSkill = profile.topSkills.find((s) => s.slug === 'docker');
    assert.ok(dockerSkill);
    assert.strictEqual(dockerSkill.githubEvidence, false);
    assert.strictEqual(dockerSkill.resumeClaim, true);
    assert.strictEqual(dockerSkill.truthStatus, 'CLAIMED');

    // Kubernetes from resumeData not in candidate_skills should also be included
    const k8sSkill = profile.topSkills.find((s) => s.slug === 'kubernetes');
    assert.ok(k8sSkill);
    assert.strictEqual(k8sSkill.truthStatus, 'CLAIMED');
    assert.strictEqual(k8sSkill.resumeClaim, true);
  });

  // 22. Project corroboration
  it('22. marks projects with AST evidence matching resume projects as CORROBORATED', async () => {
    const candidateWithResumeProjects = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          projects: [
            {
              name: 'Fastify MCP Gateway',
              technologies: ['Fastify', 'Node.js'],
              bullets: ['High-throughput MCP bridge'],
              urls: ['https://github.com/vishw/fastify-mcp'],
            },
            {
              name: 'Standalone Resume Project',
              technologies: ['Python'],
              bullets: ['Closed source tool'],
            },
          ],
        },
      },
    };

    const githubProjects = [
      {
        id: 'b0000000-0000-4000-a000-000000000001',
        name: 'Fastify MCP Gateway',
        slug: 'fastify-mcp',
        headline: 'MCP server',
        role: 'Creator',
        isHighlighted: true,
        linkedResourceCount: 1,
        verifiedSignalCount: 5,
        evidence: [{ id: 'ev-1', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' }],
      },
    ];

    const mockDb = createMockDb(candidateWithResumeProjects, [], githubProjects);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const matched = profile.highlightedProjects.find((p) => p.name === 'Fastify MCP Gateway');
    assert.ok(matched);
    assert.strictEqual(matched.provenanceStatus, 'CORROBORATED');

    const unmatchedResume = profile.highlightedProjects.find(
      (p) => p.name === 'Standalone Resume Project'
    );
    assert.ok(unmatchedResume);
    assert.strictEqual(unmatchedResume.provenanceStatus, 'CLAIMED');
  });

  // 23. Independent readiness scoring
  it('23. calculates profileReadiness independently from jobSearchReadiness', async () => {
    const candidatePopulatedNoPreferences = {
      ...mockCandidateRecord,
      headline: 'Principal Systems Engineer',
      summary: '10+ years engineering large-scale backend systems.',
      profileMetadata: {
        currentRole: 'Principal Systems Engineer',
        location: 'Seattle, WA',
        careerPreferences: {
          targetRoles: [], // Empty intent
          preferredLocations: [],
          remotePreference: 'FLEXIBLE',
        },
        resumeData: {
          experience: [{ company: 'Corp', title: 'Lead', startDate: '2020-01-01' }],
          education: [{ institution: 'UW', degree: 'B.S.' }],
          skills: ['Go', 'Kubernetes'],
        },
      },
    };

    const mockDb = createMockDb(candidatePopulatedNoPreferences);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    assert.ok(profile.profileReadiness);
    assert.strictEqual(profile.profileReadiness.isComplete, true);
    assert.ok(profile.profileReadiness.score >= 70);

    assert.ok(profile.completeness);
    assert.strictEqual(profile.completeness.isReadyForJobSearch, false);
  });

  // 24. Low-level dependencies classified into technologySignals (tier: SIGNAL)
  it('24. classifies low-level dependencies into technology signals and primary competencies into primarySkills', async () => {
    const candidateSkillsWithDeps = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastify',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 12,
        },
        skillSlug: 'fastify',
        skillName: 'Fastify',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-typescript',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 8,
        },
        skillSlug: 'typescript',
        skillName: 'TypeScript',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-dotenv',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.85,
          evidenceCount: 3,
        },
        skillSlug: 'dotenv',
        skillName: 'Dotenv',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-clsx',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.85,
          evidenceCount: 2,
        },
        skillSlug: 'clsx',
        skillName: 'Clsx',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkillsWithDeps);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    assert.ok(Array.isArray(profile.primarySkills));
    assert.ok(Array.isArray(profile.technologySignals));

    const primarySlugs = profile.primarySkills.map((s) => s.slug);
    const signalSlugs = profile.technologySignals.map((s) => s.slug);

    assert.ok(primarySlugs.includes('fastify'));
    assert.ok(primarySlugs.includes('typescript'));
    assert.ok(signalSlugs.includes('dotenv'));
    assert.ok(signalSlugs.includes('clsx'));
  });

  // 25. Normalizes canonical variants safely
  it('25. normalizes canonical variants safely without creating duplicates', async () => {
    const candidateSkillsWithDuplicates = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-pg-1',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.9,
          evidenceCount: 4,
        },
        skillSlug: 'postgresql',
        skillName: 'PostgreSQL',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-pg-2',
          provenanceStatus: 'CLAIMED',
          confidenceScore: 0.5,
          evidenceCount: 0,
        },
        skillSlug: 'postgresql-custom',
        skillName: 'Postgresql',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkillsWithDuplicates);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const pgSkills = profile.topSkills.filter((s) => s.slug === 'postgresql');

    assert.strictEqual(pgSkills.length, 1);
    assert.strictEqual(pgSkills[0].name, 'PostgreSQL');
    assert.strictEqual(pgSkills[0].truthStatus, 'VERIFIED');
    assert.strictEqual(pgSkills[0].evidenceCount, 4);
  });

  // 26. Multi-factor project matching with tech stack overlap
  it('26. matches resume projects with GitHub projects using multi-factor technology overlap', async () => {
    const candidateWithTechOverlap = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          projects: [
            {
              name: 'Enterprise Backend Gateway',
              technologies: ['Fastify', 'PostgreSQL', 'Drizzle ORM'],
              bullets: ['Distributed microservice API gateway'],
            },
          ],
        },
      },
    };

    const githubProjects = [
      {
        id: 'b0000000-0000-4000-a000-000000000002',
        name: 'cloud-gateway-service',
        slug: 'cloud-gateway-service',
        headline: 'Fastify and PostgreSQL gateway',
        role: 'Maintainer',
        isHighlighted: true,
        linkedResourceCount: 1,
        verifiedSignalCount: 4,
        evidence: [{ id: 'ev-1', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' }],
      },
    ];

    const mockDb = createMockDb(candidateWithTechOverlap, [], githubProjects);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);
    const matched = profile.highlightedProjects.find((p) => p.name === 'cloud-gateway-service');
    assert.ok(matched);
    assert.strictEqual(matched.provenanceStatus, 'CORROBORATED');
    assert.ok(matched.technologies.includes('Fastify'));
  });

  // 27. HTML Profile View rendering parity
  it('27. renders separated primary career skills, technology signals, and readiness banner in HTML view', async () => {
    const profile = {
      candidateId: candidateIdA,
      tenantId: tenantA,
      displayName: 'Alex Mercer',
      headline: 'Staff Backend Engineer',
      summary: 'Specialized in distributed systems and Node.js.',
      currentRole: 'Staff Backend Engineer',
      location: 'San Francisco, CA',
      seniority: 'STAFF',
      yearsOfExperience: 10,
      canonicalEmail: 'alex@example.com',
      portfolioLinks: [],
      jobPreferences: {
        targetRoles: ['Staff Backend Engineer'],
        preferredLocations: ['Remote'],
        remotePreference: 'REMOTE_ONLY',
        employmentTypes: ['FULL_TIME'],
        salaryFloor: 200000,
        salaryCurrency: 'USD',
        industries: [],
        companiesToAvoid: [],
        companiesToPrioritize: [],
        preferredTechStack: ['TypeScript', 'Fastify', 'PostgreSQL'],
        relocationPreference: 'REMOTE_ONLY',
        workAuthorization: ['US_CITIZEN'],
        visaSponsorshipRequired: false,
        availabilityDate: null,
      },
      verifiedSkillsSummary: ['TypeScript', 'Fastify'],
      topSkills: [
        {
          slug: 'typescript',
          name: 'TypeScript',
          category: 'LANGUAGE',
          fineCategory: 'CORE_LANGUAGE',
          tier: 'PRIMARY',
          confidenceScore: 0.95,
          evidenceCount: 10,
          provenanceStatus: 'VERIFIED',
          truthStatus: 'VERIFIED',
          source: 'BOTH',
          resumeClaim: true,
          githubEvidence: true,
        },
        {
          slug: 'dotenv',
          name: 'Dotenv',
          category: 'TOOL',
          fineCategory: 'DEPENDENCY_SIGNAL',
          tier: 'SIGNAL',
          confidenceScore: 0.8,
          evidenceCount: 3,
          provenanceStatus: 'VERIFIED',
          truthStatus: 'VERIFIED',
          source: 'GITHUB',
          resumeClaim: false,
          githubEvidence: true,
        },
      ],
      primarySkills: [
        {
          slug: 'typescript',
          name: 'TypeScript',
          category: 'LANGUAGE',
          fineCategory: 'CORE_LANGUAGE',
          tier: 'PRIMARY',
          confidenceScore: 0.95,
          evidenceCount: 10,
          provenanceStatus: 'VERIFIED',
          truthStatus: 'VERIFIED',
          source: 'BOTH',
          resumeClaim: true,
          githubEvidence: true,
        },
      ],
      technologySignals: [
        {
          slug: 'dotenv',
          name: 'Dotenv',
          category: 'TOOL',
          fineCategory: 'DEPENDENCY_SIGNAL',
          tier: 'SIGNAL',
          confidenceScore: 0.8,
          evidenceCount: 3,
          provenanceStatus: 'VERIFIED',
          truthStatus: 'VERIFIED',
          source: 'GITHUB',
          resumeClaim: false,
          githubEvidence: true,
        },
      ],
      highlightedProjects: [
        {
          id: 'p-1',
          name: 'Fastify Gateway',
          headline: 'High throughput MCP bridge',
          role: 'Creator',
          summary: 'Fastify gateway with full MCP compliance',
          technologies: ['Fastify', 'TypeScript'],
          bullets: ['Sub-millisecond latency'],
          urls: ['https://github.com/alex/fastify-gateway'],
          startDate: '2024-01-01',
          endDate: null,
          linkedResourceCount: 1,
          verifiedSignalCount: 12,
          provenanceStatus: 'CORROBORATED',
          source: 'BOTH',
        },
      ],
      recentExperience: [],
      education: [],
      certifications: [],
      languages: [],
      completeness: {
        score: 100,
        status: 'COMPLETE FOR JOB SEARCH',
        isReadyForJobSearch: true,
        missingRequiredForSearch: [],
        missingOptional: [],
        actionableFeedback: 'Ready for search',
      },
      profileReadiness: {
        score: 100,
        status: 'PROFILE POPULATED',
        isComplete: true,
        missingFields: [],
        actionableFeedback: 'Profile populated',
      },
      updatedAt: new Date().toISOString(),
    };

    const html = renderProfilePage({
      user: { displayName: 'Alex Mercer', email: 'alex@example.com' },
      candidate: { displayName: 'Alex Mercer', headline: 'Staff Backend Engineer' },
      profile,
      csrfToken: 'test-csrf-token',
    });

    assert.ok(html.includes('Career Profile: 100% Populated'));
    assert.ok(html.includes('Career Skills ('));
    assert.ok(html.includes('TypeScript'));
    assert.ok(html.includes('Additional Libraries & Tools (1)'));
    assert.ok(html.includes('Dotenv'));
    assert.ok(html.includes('✓ Corroborated'));
    assert.ok(html.includes('Fastify Gateway'));
  });

  // 28. Verification Semantics: Decoupled Tier and Truth Status
  it('28. supports all 4 combinations: PRIMARY+VERIFIED, PRIMARY+CLAIMED, SIGNAL+VERIFIED, SIGNAL+CLAIMED', async () => {
    const candidateWithVariedSkills = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Python', 'Styled Components'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastify',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 10,
        },
        skillSlug: 'fastify',
        skillName: 'Fastify',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-dotenv',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.85,
          evidenceCount: 3,
        },
        skillSlug: 'dotenv',
        skillName: 'Dotenv',
      },
    ];

    const mockDb = createMockDb(candidateWithVariedSkills, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    // 1. PRIMARY + VERIFIED: Fastify (Framework from GitHub)
    const fastifySkill = profile.topSkills.find((s) => s.slug === 'fastify');
    assert.ok(fastifySkill);
    assert.strictEqual(fastifySkill.tier, 'PRIMARY');
    assert.strictEqual(fastifySkill.truthStatus, 'VERIFIED');

    // 2. PRIMARY + CLAIMED: Python (Language from Resume only)
    const pythonSkill = profile.topSkills.find((s) => s.slug === 'python');
    assert.ok(pythonSkill);
    assert.strictEqual(pythonSkill.tier, 'PRIMARY');
    assert.strictEqual(pythonSkill.truthStatus, 'CLAIMED');
    assert.strictEqual(pythonSkill.source, 'RESUME');

    // 3. SIGNAL + VERIFIED: Dotenv (Utility from GitHub)
    const dotenvSkill = profile.topSkills.find((s) => s.slug === 'dotenv');
    assert.ok(dotenvSkill);
    assert.strictEqual(dotenvSkill.tier, 'SIGNAL');
    assert.strictEqual(dotenvSkill.truthStatus, 'VERIFIED');

    // 4. SIGNAL + CLAIMED: Styled Components (Library from Resume only)
    const styledSkill = profile.topSkills.find((s) => s.slug === 'styled-components');
    assert.ok(styledSkill);
    assert.strictEqual(styledSkill.tier, 'SIGNAL');
    assert.strictEqual(styledSkill.truthStatus, 'CLAIMED');
  });

  // 29. Resume-only skills remain CLAIMED
  it('29. retains resume-only skills as CLAIMED without artificial promotion', async () => {
    const candidateWithResumeOnly = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Django', 'Flask', 'MongoDB', 'REST API Design'],
        },
      },
    };

    const mockDb = createMockDb(candidateWithResumeOnly, []);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const django = profile.topSkills.find((s) => s.slug === 'django');
    assert.ok(django);
    assert.strictEqual(django.truthStatus, 'CLAIMED');
    assert.strictEqual(django.provenanceStatus, 'CLAIMED');
    assert.strictEqual(django.githubEvidence, false);
    assert.strictEqual(django.resumeClaim, true);
  });

  // 30. GitHub evidence corroborates resume claims
  it('30. corroborates resume skills with GitHub evidence into VERIFIED status', async () => {
    const candidateWithResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['TypeScript', 'Fastify'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastify',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 15,
        },
        skillSlug: 'fastify',
        skillName: 'Fastify',
      },
    ];

    const mockDb = createMockDb(candidateWithResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const fastify = profile.topSkills.find((s) => s.slug === 'fastify');
    assert.ok(fastify);
    assert.strictEqual(fastify.truthStatus, 'VERIFIED');
    assert.strictEqual(fastify.provenanceStatus, 'CORROBORATED');
    assert.strictEqual(fastify.source, 'BOTH');
    assert.strictEqual(fastify.resumeClaim, true);
    assert.strictEqual(fastify.githubEvidence, true);
  });

  // 31. Package dependency alone does not imply primary career expertise
  it('31. classifies component packages as SIGNAL UI_COMPONENT rather than PRIMARY FRAMEWORK', async () => {
    const candidateSkillsWithComponents = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-radix-dialog',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 2,
        },
        skillSlug: 'react-dialog',
        skillName: 'React Dialog',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-next-themes',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 1,
        },
        skillSlug: 'next-themes',
        skillName: 'Next Themes',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkillsWithComponents);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const primarySlugs = profile.primarySkills.map((s) => s.slug);
    const signalSlugs = profile.technologySignals.map((s) => s.slug);

    assert.ok(!primarySlugs.includes('react-dialog'));
    assert.ok(!primarySlugs.includes('next-themes'));
    assert.ok(signalSlugs.includes('react-dialog'));
    assert.ok(signalSlugs.includes('next-themes'));
  });

  // 32. Schema & MCP consistency
  it('32. guarantees CareerProfile output validates against CandidateCareerProfileSchema', async () => {
    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastify',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 10,
        },
        skillSlug: 'fastify',
        skillName: 'Fastify',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const parsed = CandidateCareerProfileSchema.safeParse(profile);
    assert.ok(parsed.success, `Schema validation failed: ${JSON.stringify(parsed.error?.issues)}`);
  });

  // 33. Package-only JavaScript does not artificially promote to PRIMARY VERIFIED
  it('33. keeps JavaScript as CLAIMED when only package manifest/config signal exists despite resume claim', async () => {
    const candidateWithResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['JavaScript', 'TypeScript'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-js',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 1, // Only 1 citation from @eslint/js
        },
        skillSlug: 'javascript',
        skillName: 'JavaScript',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-ts',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 12, // Substantial TypeScript usage
        },
        skillSlug: 'typescript',
        skillName: 'TypeScript',
      },
    ];

    const mockDb = createMockDb(candidateWithResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const js = profile.primarySkills.find((s) => s.slug === 'javascript');
    const ts = profile.primarySkills.find((s) => s.slug === 'typescript');

    assert.ok(js);
    assert.strictEqual(js.truthStatus, 'CLAIMED');
    assert.strictEqual(js.evidenceLevel, 1);
    assert.ok(js.evidenceExplanation.includes('insufficient for primary verification'));

    assert.ok(ts);
    assert.strictEqual(ts.truthStatus, 'VERIFIED');
    assert.strictEqual(ts.provenanceStatus, 'CORROBORATED');
    assert.strictEqual(ts.evidenceLevel, 4);
  });

  // 34. Dockerfile container build vs docker-compose manifest only
  it('34. distinguishes Docker substantial build (PRIMARY VERIFIED) from Docker Compose manifest (SIGNAL VERIFIED)', async () => {
    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-docker',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.9,
          evidenceCount: 4,
        },
        skillSlug: 'docker',
        skillName: 'Docker',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-compose',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 1,
        },
        skillSlug: 'docker-compose',
        skillName: 'Docker Compose',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const docker = profile.primarySkills.find((s) => s.slug === 'docker');
    const compose = profile.technologySignals.find((s) => s.slug === 'docker-compose');

    assert.ok(docker);
    assert.strictEqual(docker.tier, 'PRIMARY');
    assert.strictEqual(docker.truthStatus, 'VERIFIED');
    assert.strictEqual(docker.evidenceLevel, 3);

    assert.ok(compose);
    assert.strictEqual(compose.tier, 'SIGNAL');
    assert.strictEqual(compose.truthStatus, 'VERIFIED');
    assert.strictEqual(compose.evidenceLevel, 1);
  });

  // 35. Actual AI/ML usage (Gemini / OpenAI) vs package-only
  it('35. verifies Google Gemini with substantial source implementation and preserves OpenAI claim', async () => {
    const candidateWithAiResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Google Gemini', 'OpenAI'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-gemini',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 6, // Substantial implementation
        },
        skillSlug: 'gemini',
        skillName: 'Google Gemini',
      },
    ];

    const mockDb = createMockDb(candidateWithAiResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const gemini = profile.primarySkills.find((s) => s.slug === 'gemini');
    const openai = profile.primarySkills.find((s) => s.slug === 'openai');

    assert.ok(gemini);
    assert.strictEqual(gemini.truthStatus, 'VERIFIED');
    assert.strictEqual(gemini.provenanceStatus, 'CORROBORATED');
    assert.strictEqual(gemini.evidenceLevel, 4);

    assert.ok(openai);
    assert.strictEqual(openai.truthStatus, 'CLAIMED');
    assert.strictEqual(openai.evidenceLevel, 0);
  });

  // 36. Test frameworks: actual test suites vs dependency-only
  it('36. distinguishes substantial test frameworks from unverified claims', async () => {
    const candidateWithTests = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Vitest', 'Cypress'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-vitest',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 8,
        },
        skillSlug: 'vitest',
        skillName: 'Vitest',
      },
    ];

    const mockDb = createMockDb(candidateWithTests, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const vitest = profile.primarySkills.find((s) => s.slug === 'vitest');
    const cypress = profile.primarySkills.find((s) => s.slug === 'cypress');

    assert.ok(vitest);
    assert.strictEqual(vitest.truthStatus, 'VERIFIED');
    assert.strictEqual(vitest.provenanceStatus, 'CORROBORATED');

    assert.ok(cypress);
    assert.strictEqual(cypress.truthStatus, 'CLAIMED');
  });

  // 37. GitHub Actions workflow-only signal
  it('37. reclassifies GitHub Actions with single workflow citation as SIGNAL tier', async () => {
    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-gha',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 1, // Single workflow file
        },
        skillSlug: 'github-actions',
        skillName: 'GitHub Actions',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const ghaPrimary = profile.primarySkills.find((s) => s.slug === 'github-actions');
    const ghaSignal = profile.technologySignals.find((s) => s.slug === 'github-actions');

    assert.strictEqual(ghaPrimary, undefined);
    assert.ok(ghaSignal);
    assert.strictEqual(ghaSignal.tier, 'SIGNAL');
    assert.strictEqual(ghaSignal.truthStatus, 'VERIFIED');
    assert.strictEqual(ghaSignal.evidenceLevel, 1);
  });

  // 38. Python language reconciliation with supporting framework package
  it('38. keeps Python as CLAIMED when only FastAPI package signal is detected without direct Python source code', async () => {
    const candidateWithResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Python', 'FastAPI'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastapi',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.85,
          evidenceCount: 1, // FastAPI manifest only
        },
        skillSlug: 'fastapi',
        skillName: 'FastAPI',
      },
    ];

    const mockDb = createMockDb(candidateWithResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const py = profile.primarySkills.find((s) => s.slug === 'python');
    assert.ok(py);
    assert.strictEqual(py.truthStatus, 'CLAIMED');
    assert.strictEqual(py.provenanceStatus, 'CLAIMED');
    assert.strictEqual(py.evidenceLevel, 1);
    assert.ok(py.evidenceExplanation.includes('FastAPI'));
  });

  // 39. Python language reconciliation with substantial direct source files
  it('39. promotes Python to PRIMARY + CORROBORATED when substantial .py source files and FastAPI AST exist', async () => {
    const candidateWithResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['Python', 'FastAPI'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-py',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 8, // Direct .py citations
        },
        skillSlug: 'python',
        skillName: 'Python',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-fastapi',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 16,
        },
        skillSlug: 'fastapi',
        skillName: 'FastAPI',
      },
    ];

    const mockDb = createMockDb(candidateWithResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const py = profile.primarySkills.find((s) => s.slug === 'python');
    assert.ok(py);
    assert.strictEqual(py.truthStatus, 'VERIFIED');
    assert.strictEqual(py.provenanceStatus, 'CORROBORATED');
    assert.strictEqual(py.evidenceLevel, 4);
    assert.ok(py.evidenceExplanation.includes('FastAPI'));
  });

  // 40. JavaScript language reconciliation in TypeScript-first codebase
  it('40. keeps JavaScript as CLAIMED when repository is TypeScript-first with zero direct JS source citations', async () => {
    const candidateWithResume = {
      ...mockCandidateRecord,
      profileMetadata: {
        ...mockCandidateRecord.profileMetadata,
        resumeData: {
          skills: ['JavaScript', 'TypeScript', 'Next.js'],
        },
      },
    };

    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-ts',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 20, // Substantial TypeScript
        },
        skillSlug: 'typescript',
        skillName: 'TypeScript',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-next',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.9,
          evidenceCount: 10,
        },
        skillSlug: 'next-js',
        skillName: 'Next.js',
      },
    ];

    const mockDb = createMockDb(candidateWithResume, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    const js = profile.primarySkills.find((s) => s.slug === 'javascript');
    const ts = profile.primarySkills.find((s) => s.slug === 'typescript');

    assert.ok(js);
    assert.strictEqual(js.truthStatus, 'CLAIMED');
    assert.strictEqual(js.provenanceStatus, 'CLAIMED');

    assert.ok(ts);
    assert.strictEqual(ts.truthStatus, 'VERIFIED');
    assert.strictEqual(ts.provenanceStatus, 'CORROBORATED');
    assert.strictEqual(ts.evidenceLevel, 4);
  });

  // 41. Clean separation between primary skills and technology signals
  it('41. produces deterministic primarySkills and technologySignals collections with zero cross-contamination', async () => {
    const candidateSkills = [
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-react',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 15,
        },
        skillSlug: 'react',
        skillName: 'React',
      },
      {
        cs: {
          candidateId: candidateIdA,
          tenantId: tenantA,
          skillId: 's-dialog',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.8,
          evidenceCount: 2,
        },
        skillSlug: 'react-dialog',
        skillName: 'React Dialog',
      },
    ];

    const mockDb = createMockDb(mockCandidateRecord, candidateSkills);
    const service = new CandidateProfileService(mockDb);

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    assert.strictEqual(profile.primarySkills.length, 1);
    assert.strictEqual(profile.primarySkills[0].slug, 'react');

    assert.strictEqual(profile.technologySignals.length, 1);
    assert.strictEqual(profile.technologySignals[0].slug, 'react-dialog');
  });
});
