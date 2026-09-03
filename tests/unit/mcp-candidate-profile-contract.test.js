/**
 * @file MCP Candidate Profile Contract & Completeness Test Suite (P14-005W).
 *
 * Verifies that `handleGetCandidateProfile` exposes the canonical candidate profile
 * accurately to external AI clients (ChatGPT, Claude, Gemini) with:
 * A. Structured education records with graduation dates and coursework
 * B. Professional certifications and language proficiencies
 * C. Portfolio and social links
 * D. Compact experience bullets and technologies
 * E. Highlighted project technologies, repository URLs, and summary bullets
 * F. Preserved 5-tier truth/provenance (CORROBORATED, VERIFIED, CLAIMED)
 * G. Explicit separation of profileReadiness from jobSearchReadiness
 * H. Compact token safety (payload < 15KB JSON) with zero raw AST code leaks
 * I. Real candidate regression verification for candidate 10a2b51b-09bf-4090-8040-1f60ebeb89c9
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleGetCandidateProfile } from '../../src/mcp/tools/career-read-tools.js';
import { GetCandidateProfileOutputSchema } from '../../src/domain/mcp/career-read-tools.schemas.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { db, closeDatabase } from '../../src/db/index.js';

describe('MCP Candidate Profile Contract Completeness Suite', () => {
  const candidateIdA = 'a0000000-0000-4000-a000-000000000001';
  const mockContext = {
    requestId: 'req-contract-test',
    tenantId: 't0000000-0000-4000-a000-000000000001',
    userId: 'u0000000-0000-4000-a000-000000000001',
    role: 'MEMBER',
    tokenScopes: ['career:read'],
    authMethod: 'MCP_API_TOKEN',
    clientInfo: { protocolVersion: '2026-07-28', ipAddress: '127.0.0.1' },
    authenticatedAt: new Date().toISOString(),
  };

  const mockCareerProfile = {
    candidateId: candidateIdA,
    tenantId: mockContext.tenantId,
    displayName: 'Alex Rivers',
    headline: 'Senior Full-Stack Architect',
    summary: 'Distributed systems engineer with 6+ years building real-time applications.',
    currentRole: 'Principal Architect',
    currentEmployment: {
      title: 'Principal Architect',
      company: 'CloudScale Inc',
      employmentType: 'FULL_TIME',
      startDate: '2022-03',
      location: 'San Francisco, CA',
    },
    careerStatus: 'EMPLOYED',
    seniority: 'SENIOR',
    yearsOfExperience: 6,
    experienceDuration: {
      totalMonths: 72,
      totalYears: 6.0,
      professionalMonths: 72,
      professionalYears: 6.0,
      softwareEngineeringMonths: 72,
      softwareEngineeringYears: 6.0,
    },
    location: 'San Francisco, CA',
    canonicalEmail: 'alex.rivers@example.com',
    portfolioLinks: [
      { label: 'GitHub', url: 'https://github.com/alexrivers' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/alexrivers' },
      { label: 'Portfolio', url: 'https://alexrivers.dev' },
    ],
    jobPreferences: {
      targetRoles: ['Staff Engineer', 'Principal Architect'],
      preferredLocations: ['San Francisco, CA', 'Remote'],
      remotePreference: 'REMOTE_FIRST',
      employmentTypes: ['FULL_TIME'],
      salaryFloor: 220000,
      salaryCurrency: 'USD',
      industries: ['Cloud Infrastructure', 'Developer Tools'],
      companiesToAvoid: [],
      companiesToPrioritize: ['Stripe', 'Vercel'],
      preferredTechStack: ['TypeScript', 'Node.js', 'PostgreSQL'],
      relocationPreference: 'REMOTE_ONLY',
    },
    eligibility: {
      workAuthorization: ['United States'],
      visaSponsorshipRequired: false,
      availabilityDate: '2026-10-01',
    },
    topSkills: [
      {
        slug: 'react',
        name: 'React',
        category: 'FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 1.0,
        evidenceCount: 34,
        provenanceStatus: 'CORROBORATED',
        truthStatus: 'VERIFIED',
      },
      {
        slug: 'postgresql',
        name: 'PostgreSQL',
        category: 'DATABASE',
        tier: 'PRIMARY',
        confidenceScore: 1.0,
        evidenceCount: 13,
        provenanceStatus: 'CORROBORATED',
        truthStatus: 'VERIFIED',
      },
      {
        slug: 'fastify',
        name: 'Fastify',
        category: 'FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 1.0,
        evidenceCount: 9,
        provenanceStatus: 'VERIFIED',
        truthStatus: 'VERIFIED',
      },
      {
        slug: 'django',
        name: 'Django',
        category: 'FRAMEWORK',
        tier: 'PRIMARY',
        confidenceScore: 0.5,
        evidenceCount: 0,
        provenanceStatus: 'CLAIMED',
        truthStatus: 'CLAIMED',
      },
    ],
    highlightedProjects: [
      {
        id: 'p0000000-0000-4000-a000-000000000001',
        name: 'Distributed Stream Gateway',
        headline: 'High-throughput Kafka ingress service',
        role: 'Lead Architect',
        summary: 'Engineered sub-millisecond ingestion pipeline handling 50k req/sec.',
        technologies: ['Fastify', 'TypeScript', 'Kafka', 'PostgreSQL'],
        repositoryUrl: 'https://github.com/alexrivers/stream-gateway',
        bullets: [
          'Engineered sub-millisecond ingestion pipeline handling 50k req/sec.',
          'Built custom connection pool manager reducing memory footprint by 40%.',
        ],
        startDate: '2023-01',
        endDate: '2023-11',
        linkedResourceCount: 1,
        verifiedSignalCount: 18,
        provenanceStatus: 'CORROBORATED',
      },
    ],
    recentExperience: [
      {
        company: 'CloudScale Inc',
        title: 'Principal Architect',
        employmentType: 'FULL_TIME',
        location: 'San Francisco, CA',
        startDate: '2022-03',
        endDate: null,
        isCurrent: true,
        rawDateRange: 'March 2022 – Present',
        bullets: [
          'Architected core multi-tenant control plane serving 1M+ active endpoints.',
          'Spearheaded migration to distributed Postgres with zero downtime.',
          'Mentored 12 backend engineers across 3 squads on distributed consensus.',
          'Extra 4th bullet that should be capped out',
        ],
        technologies: ['Node.js', 'Fastify', 'PostgreSQL', 'Docker', 'Kubernetes'],
        verifiedSkillsUsed: ['Fastify', 'PostgreSQL'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    education: [
      {
        institution: 'University of California, Berkeley',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        degreeType: 'BACHELOR',
        location: 'Berkeley, CA',
        startDate: '2016-08',
        endDate: '2020-05',
        isCurrent: false,
        rawDateRange: '2016 – 2020',
        coursework: ['Operating Systems', 'Distributed Systems', 'Algorithms', 'Databases'],
        gradeOrGpa: '3.9 GPA',
        provenanceStatus: 'CLAIMED',
      },
      {
        institution: 'Stanford Center for Professional Development',
        degree: 'Graduate Certificate',
        fieldOfStudy: 'Advanced Software Systems',
        degreeType: 'DIPLOMA',
        location: 'Stanford, CA',
        startDate: '2021-01',
        endDate: '2021-12',
        isCurrent: false,
        rawDateRange: '2021',
        coursework: ['Cloud Computing Architecture', 'Concurrent Programming'],
        gradeOrGpa: null,
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    certifications: [
      {
        name: 'AWS Certified Solutions Architect – Professional',
        issuer: 'Amazon Web Services',
        issueDate: '2023-04',
        expiryDate: '2026-04',
        credentialId: 'AWS-PSA-884920',
        credentialUrl: 'https://aws.amazon.com/verification/AWS-PSA-884920',
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    languages: [
      {
        language: 'English',
        proficiency: 'Native / Fluent',
        provenanceStatus: 'USER_PROVIDED',
      },
      {
        language: 'Spanish',
        proficiency: 'Professional Working Proficiency',
        provenanceStatus: 'CLAIMED',
      },
    ],
    profileReadiness: {
      score: 95,
      status: 'PROFILE POPULATED',
      isComplete: true,
      missingFields: [],
      actionableFeedback: 'Profile is comprehensive and fully populated.',
    },
    completeness: {
      score: 90,
      status: 'COMPLETE FOR JOB SEARCH',
      isReadyForJobSearch: true,
      missingRequiredForSearch: [],
      missingOptional: [],
      actionableFeedback: 'Ready for automated matching.',
    },
  };

  const mockProfileService = {
    getProfile: async () => ({
      candidate: {
        id: candidateIdA,
        displayName: 'Alex Rivers',
        headline: mockCareerProfile.headline,
        summary: mockCareerProfile.summary,
        status: 'ACTIVE',
        canonicalEmail: mockCareerProfile.canonicalEmail,
        profileMetadata: {
          location: mockCareerProfile.location,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      identities: [
        {
          provider: 'github',
          externalUsername: 'alexrivers',
          verified: true,
        },
      ],
      resources: [
        {
          id: 'res-1',
          name: 'alexrivers/stream-gateway',
          isPrivate: false,
        },
      ],
      projects: mockCareerProfile.highlightedProjects,
      skills: mockCareerProfile.topSkills,
    }),
    getCareerProfile: async () => mockCareerProfile,
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

  // ===========================================================================
  // A, B, C. Education Contract
  // ===========================================================================
  it('A. exposes structured education in get_candidate_profile', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(GetCandidateProfileOutputSchema.safeParse(result).success);
    assert.ok(Array.isArray(result.education));
    assert.strictEqual(result.education.length, 2);
    assert.strictEqual(result.education[0].institution, 'University of California, Berkeley');
    assert.strictEqual(result.education[0].degree, 'Bachelor of Science');
    assert.strictEqual(result.education[0].fieldOfStudy, 'Computer Science');
    assert.strictEqual(result.education[0].degreeType, 'BACHELOR');
  });

  it('B. exposes graduation date, coursework, and GPA in education records', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const berkeley = result.education[0];
    assert.strictEqual(berkeley.startDate, '2016-08');
    assert.strictEqual(berkeley.endDate, '2020-05');
    assert.strictEqual(berkeley.isCurrent, false);
    assert.strictEqual(berkeley.gradeOrGpa, '3.9 GPA');
    assert.deepStrictEqual(berkeley.coursework, [
      'Operating Systems',
      'Distributed Systems',
      'Algorithms',
      'Databases',
    ]);
  });

  it('C. supports multiple education records without truncation or flattening', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.strictEqual(
      result.education[1].institution,
      'Stanford Center for Professional Development'
    );
    assert.strictEqual(result.education[1].degreeType, 'DIPLOMA');
    assert.strictEqual(result.education[1].provenanceStatus, 'USER_PROVIDED');
  });

  // ===========================================================================
  // D. Certifications Contract
  // ===========================================================================
  it('D. exposes certifications with issuer, credential ID, and verification URL', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(Array.isArray(result.certifications));
    assert.strictEqual(result.certifications.length, 1);
    const cert = result.certifications[0];
    assert.strictEqual(cert.name, 'AWS Certified Solutions Architect – Professional');
    assert.strictEqual(cert.issuer, 'Amazon Web Services');
    assert.strictEqual(cert.issueDate, '2023-04');
    assert.strictEqual(cert.expiryDate, '2026-04');
    assert.strictEqual(cert.credentialId, 'AWS-PSA-884920');
    assert.strictEqual(cert.credentialUrl, 'https://aws.amazon.com/verification/AWS-PSA-884920');
  });

  // ===========================================================================
  // E. Languages Contract
  // ===========================================================================
  it('E. exposes languages with proficiency level and provenance', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(Array.isArray(result.languages));
    assert.strictEqual(result.languages.length, 2);
    assert.strictEqual(result.languages[0].language, 'English');
    assert.strictEqual(result.languages[0].proficiency, 'Native / Fluent');
    assert.strictEqual(result.languages[1].language, 'Spanish');
    assert.strictEqual(result.languages[1].proficiency, 'Professional Working Proficiency');
  });

  // ===========================================================================
  // F. Portfolio & Social Links Contract
  // ===========================================================================
  it('F. exposes portfolio and professional links across candidate and top-level', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(Array.isArray(result.candidate.portfolioLinks));
    assert.strictEqual(result.candidate.portfolioLinks.length, 3);
    assert.strictEqual(result.candidate.portfolioLinks[0].label, 'GitHub');
    assert.strictEqual(result.candidate.portfolioLinks[0].url, 'https://github.com/alexrivers');
    assert.strictEqual(result.candidate.portfolioLinks[1].label, 'LinkedIn');
    assert.strictEqual(result.candidate.portfolioLinks[2].label, 'Portfolio');

    // Also present at top level for convenience
    assert.strictEqual(result.portfolioLinks.length, 3);
  });

  // ===========================================================================
  // G, H. Experience Details (Bullets & Technologies) Contract
  // ===========================================================================
  it('G. exposes experience bullets capped at maximum 3 per record', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(Array.isArray(result.recentExperience));
    assert.strictEqual(result.recentExperience.length, 1);
    const exp = result.recentExperience[0];
    assert.strictEqual(exp.bullets.length, 3, 'Bullets must be capped at 3 per record');
    assert.strictEqual(
      exp.bullets[0],
      'Architected core multi-tenant control plane serving 1M+ active endpoints.'
    );
  });

  it('H. exposes experience technologies array alongside verified skills', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const exp = result.recentExperience[0];
    assert.deepStrictEqual(exp.technologies, [
      'Node.js',
      'Fastify',
      'PostgreSQL',
      'Docker',
      'Kubernetes',
    ]);
    assert.deepStrictEqual(exp.verifiedSkillsUsed, ['Fastify', 'PostgreSQL']);
  });

  // ===========================================================================
  // I, J. Highlighted Project Technologies & Repository URL
  // ===========================================================================
  it('I. exposes project technologies and summary bullets in highlightedProjects', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    assert.ok(Array.isArray(result.highlightedProjects));
    assert.strictEqual(result.highlightedProjects.length, 1);
    const proj = result.highlightedProjects[0];
    assert.deepStrictEqual(proj.technologies, ['Fastify', 'TypeScript', 'Kafka', 'PostgreSQL']);
    assert.strictEqual(proj.bullets.length, 2);
    assert.strictEqual(
      proj.bullets[0],
      'Engineered sub-millisecond ingestion pipeline handling 50k req/sec.'
    );
  });

  it('J. exposes repository URL on highlightedProjects when available', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const proj = result.highlightedProjects[0];
    assert.strictEqual(proj.repositoryUrl, 'https://github.com/alexrivers/stream-gateway');
  });

  // ===========================================================================
  // K, L, M. Truth/Provenance Preservation (CORROBORATED, VERIFIED, CLAIMED)
  // ===========================================================================
  it('K. preserves CORROBORATED provenance status for corroborated skills', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const reactSkill = result.topSkills.find((s) => s.slug === 'react');
    assert.ok(reactSkill, 'React skill must be present in topSkills');
    assert.strictEqual(reactSkill.provenanceStatus, 'CORROBORATED');

    const postgresSkill = result.topSkills.find((s) => s.slug === 'postgresql');
    assert.ok(postgresSkill, 'PostgreSQL skill must be present in topSkills');
    assert.strictEqual(postgresSkill.provenanceStatus, 'CORROBORATED');
  });

  it('L. preserves VERIFIED provenance status for repository-only skills', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const fastifySkill = result.topSkills.find((s) => s.slug === 'fastify');
    assert.ok(fastifySkill, 'Fastify skill must be present in topSkills');
    assert.strictEqual(fastifySkill.provenanceStatus, 'VERIFIED');
  });

  it('M. preserves CLAIMED provenance status for resume-only skills', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const djangoSkill = result.topSkills.find((s) => s.slug === 'django');
    assert.ok(djangoSkill, 'Django skill must be present in topSkills');
    assert.strictEqual(djangoSkill.provenanceStatus, 'CLAIMED');
  });

  // ===========================================================================
  // N. Separate Profile Readiness from Job Search Readiness
  // ===========================================================================
  it('N. separates profileReadiness from jobSearchReadiness without conflation', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    // Profile population readiness
    assert.ok(result.profileReadiness);
    assert.strictEqual(result.profileReadiness.score, 95);
    assert.strictEqual(result.profileReadiness.status, 'PROFILE POPULATED');
    assert.strictEqual(result.profileReadiness.isComplete, true);

    // Job search criteria readiness
    assert.ok(result.jobSearchReadiness);
    assert.strictEqual(result.jobSearchReadiness.score, 90);
    assert.strictEqual(result.jobSearchReadiness.status, 'COMPLETE FOR JOB SEARCH');
    assert.strictEqual(result.jobSearchReadiness.isReadyForJobSearch, true);

    // Backward-compatible alias
    assert.strictEqual(result.profileCompleteness.score, 90);
  });

  // ===========================================================================
  // O. Zero Heavy AST Code Leaks & Token Budget Compliance
  // ===========================================================================
  it('O. guarantees zero raw AST code leaks and stays strictly under 20KB budget', async () => {
    const result = await handleGetCandidateProfile(
      mockContext,
      { candidateId: candidateIdA },
      { db: mockDb, candidateProfileService: mockProfileService }
    );

    const serialized = JSON.stringify(result);
    const byteLength = Buffer.byteLength(serialized, 'utf8');

    // Token size safety
    assert.ok(
      byteLength < 15360,
      `Output size ${byteLength} exceeds target compact threshold (15KB)`
    );

    // Anti-leak check
    assert.strictEqual(serialized.includes('codeExcerpt'), false);
    assert.strictEqual(serialized.includes('astNode'), false);
    assert.strictEqual(serialized.includes('filePath'), false);
    assert.strictEqual(serialized.includes('encryptedCredentials'), false);
  });

  // ===========================================================================
  // Real Candidate Regression: Vishwanath Nishad (10a2b51b-09bf-4090-8040-1f60ebeb89c9)
  // ===========================================================================
  describe('Real Candidate Regression (10a2b51b-09bf-4090-8040-1f60ebeb89c9)', () => {
    const realCandidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
    const realTenantId = '24d53f53-780e-4431-b065-32180c354175';

    it('successfully produces truthful compact profile answering all 17 ChatGPT questions', async () => {
      const realContext = {
        requestId: 'req-real-candidate-test',
        tenantId: realTenantId,
        userId: 'u-real-test',
        role: 'MEMBER',
        tokenScopes: ['career:read'],
        authMethod: 'MCP_API_TOKEN',
        clientInfo: { protocolVersion: '2026-07-28', ipAddress: '127.0.0.1' },
        authenticatedAt: new Date().toISOString(),
      };

      const realService = new CandidateProfileService();
      const realMcpOutput = await handleGetCandidateProfile(
        realContext,
        { candidateId: realCandidateId },
        { candidateProfileService: realService, db }
      );

      // Validate against schema
      assert.ok(
        GetCandidateProfileOutputSchema.safeParse(realMcpOutput).success,
        'Real candidate output must strictly validate against GetCandidateProfileOutputSchema'
      );

      // Q1: What is my professional role?
      assert.strictEqual(realMcpOutput.candidate.currentRole, 'Full-Stack & Backend Developer');

      // Q2: Am I a fresher?
      assert.strictEqual(realMcpOutput.candidate.careerStatus, 'FRESHER');
      assert.strictEqual(realMcpOutput.candidate.seniority, 'ENTRY_LEVEL');

      // Q3: Am I currently employed?
      assert.strictEqual(realMcpOutput.candidate.currentEmployment, null);
      assert.strictEqual(realMcpOutput.recentExperience[0]?.isCurrent, false);

      // Q4: What experience do I have? (Internship record with bullets)
      assert.ok(realMcpOutput.recentExperience.length >= 1);
      const internship = realMcpOutput.recentExperience[0];
      assert.strictEqual(internship.employmentType, 'INTERNSHIP');
      assert.ok(Array.isArray(internship.bullets));
      assert.strictEqual(internship.bullets.length, 3);
      assert.strictEqual(internship.company, 'FTV Saloon');

      // Q5: Where did I study?
      assert.ok(Array.isArray(realMcpOutput.education));
      assert.ok(realMcpOutput.education.length >= 1);
      const eduRecord = realMcpOutput.education[0];
      assert.ok(
        eduRecord.degree?.includes('Rajkiya Engineering College') ||
          eduRecord.institution?.includes('Rajkiya Engineering College')
      );

      // Q6: What degree / coursework information exists?
      assert.ok(
        realMcpOutput.education.some((e) =>
          (e.institution + ' ' + (e.degree || '')).includes('Bachelor of Technology')
        )
      );

      // Q7: When do I graduate?
      assert.ok(
        realMcpOutput.education.some(
          (e) => (e.fieldOfStudy || '').includes('2025') || (e.endDate || '').includes('2025')
        )
      );

      // Q8: What coursework information is present?
      assert.ok(
        realMcpOutput.education.some(
          (e) => (e.degree || '').includes('Coursework') || e.coursework.length > 0
        )
      );

      // Q9 & Q10: Certifications and Languages (present as arrays)
      assert.ok(Array.isArray(realMcpOutput.certifications));
      assert.ok(Array.isArray(realMcpOutput.languages));

      // Q11: What jobs am I seeking?
      assert.ok(realMcpOutput.jobPreferences.targetRoles.length > 0);
      assert.ok(realMcpOutput.jobPreferences.targetRoles.includes('Backend Engineer'));
      assert.ok(realMcpOutput.jobPreferences.targetRoles.includes('Full Stack Engineer'));
      assert.ok(realMcpOutput.jobPreferences.targetRoles.includes('Software Engineer'));

      // Portfolio Links
      assert.ok(realMcpOutput.portfolioLinks.length >= 3);
      const ghLink = realMcpOutput.portfolioLinks.find((l) => l.label === 'GITHUB');
      assert.ok(ghLink);
      assert.strictEqual(ghLink.url, 'https://github.com/vishu1803');

      // Q12, Q13, Q14: Skills Verification & Corroboration
      const reactSkill = realMcpOutput.topSkills.find((s) => s.slug === 'react');
      assert.ok(reactSkill, 'React must be in topSkills');
      assert.strictEqual(
        reactSkill.provenanceStatus,
        'CORROBORATED',
        'React with 34 GitHub citations must be CORROBORATED'
      );

      const postgresSkill = realMcpOutput.topSkills.find((s) => s.slug === 'postgresql');
      assert.ok(postgresSkill, 'PostgreSQL must be in topSkills');
      assert.strictEqual(
        postgresSkill.provenanceStatus,
        'CORROBORATED',
        'PostgreSQL with 13 GitHub citations must be CORROBORATED'
      );

      const fastapiSkill = realMcpOutput.topSkills.find((s) => s.slug === 'fastapi');
      assert.ok(fastapiSkill, 'FastAPI must be in topSkills');
      assert.strictEqual(
        fastapiSkill.provenanceStatus,
        'CORROBORATED',
        'FastAPI with 9 citations + resume claim must be CORROBORATED'
      );

      const fastifySkill = realMcpOutput.topSkills.find((s) => s.slug === 'fastify');
      assert.ok(fastifySkill, 'Fastify must be in topSkills');
      assert.strictEqual(
        fastifySkill.provenanceStatus,
        'VERIFIED',
        'Fastify with GitHub code only must be VERIFIED'
      );

      const pythonSkill = realMcpOutput.topSkills.find((s) => s.slug === 'python');
      assert.ok(pythonSkill, 'Python must be in topSkills');
      assert.strictEqual(
        pythonSkill.provenanceStatus,
        'CLAIMED',
        'Python without direct AST citations must be CLAIMED'
      );

      // Q15, Q16, Q17: Strongest projects, technologies used, and repository URLs
      assert.ok(realMcpOutput.highlightedProjects.length > 0);
      const pythonProj = realMcpOutput.highlightedProjects.find((p) =>
        p.name.includes('Python-projects')
      );
      assert.ok(pythonProj, 'Python-projects must be present');
      assert.ok(Array.isArray(pythonProj.technologies));
      assert.ok(pythonProj.technologies.includes('FastAPI'));
      assert.strictEqual(pythonProj.repositoryUrl, 'https://github.com/vishu1803/Python-projects');

      // Readiness separation
      assert.ok(realMcpOutput.profileReadiness);
      assert.ok(realMcpOutput.jobSearchReadiness);
      assert.strictEqual(realMcpOutput.profileReadiness.score, 100);
      assert.strictEqual(realMcpOutput.profileReadiness.isComplete, true);
      assert.strictEqual(realMcpOutput.jobSearchReadiness.isReadyForJobSearch, true);
      assert.strictEqual(realMcpOutput.jobSearchReadiness.score, 90);

      // Payload size check on real candidate data
      const jsonBytes = Buffer.byteLength(JSON.stringify(realMcpOutput), 'utf8');
      assert.ok(
        jsonBytes < 15360,
        `Real candidate profile JSON size ${jsonBytes} bytes must be under 15KB`
      );
    });

    after(async () => {
      await closeDatabase();
    });
  });
});
