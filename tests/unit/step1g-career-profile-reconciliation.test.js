/**
 * @file Unit Tests for Step 1G: Canonical Career Profile Reconciliation
 *
 * Validates:
 * 1. Resume-to-profile metadata enrichment on approval
 * 2. Read-time reconciliation of resume qualifications + GitHub evidence
 * 3. Strict precedence rules: EXPLICIT_USER_EDIT > RESUME_CLAIM > TRUSTED_IDENTITY
 * 4. Multi-signal project corroboration (GitHub + Resume) vs unverified retention
 * 5. Composite skill truth status (resumeClaim, githubEvidence, truthStatus)
 * 6. Dual readiness metrics (profileReadiness vs jobSearchReadiness)
 * 7. Multi-tenant 404 boundary enforcement
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Step 1G: Canonical Career Profile Reconciliation Unit Tests', () => {
  const tenantIdA = 'a0000000-0000-4000-a000-000000000001';
  const tenantIdB = 'b0000000-0000-4000-a000-000000000002';
  const userIdA = '10000000-0000-4000-a000-000000000001';
  const candidateIdA = 'c0000000-0000-4000-a000-000000000001';

  const contextA = {
    tenantId: tenantIdA,
    userId: userIdA,
    role: 'OWNER',
  };

  const sampleResumeData = {
    sourceResumeId: 'r0000000-0000-4000-a000-000000000001',
    sourceVersion: 1,
    extractedAt: '2026-08-30T12:00:00.000Z',
    identity: {
      email: 'vishwanath@example.com',
      phone: '+91 9876543210',
      location: 'Gorakhpur, UP, India',
      headline: 'Full-Stack & Backend Developer',
      currentRole: 'Backend Engineer',
      github: 'https://github.com/vishu1803',
      linkedin: 'https://linkedin.com/in/vishwanath-nishad',
      leetcode: 'https://leetcode.com/u/vishu1803',
      portfolioUrls: ['https://vishu.dev'],
    },
    summary: 'Full-stack & backend developer specializing in Python, FastAPI, Node.js, and PostgreSQL.',
    experience: [
      {
        company: 'Apex Tech Labs',
        title: 'Backend Engineer',
        location: 'Remote, India',
        startDate: '2023-01',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Engineered asynchronous message pipelines using Redis and Python FastAPI',
          'Reduced p95 API response times by 35%',
        ],
        verifiedSkillsUsed: [],
        provenanceStatus: 'CLAIMED',
      },
    ],
    education: [
      {
        institution: 'Dr. A.P.J. Abdul Kalam Technical University',
        degree: 'Bachelor of Technology in Computer Science',
        fieldOfStudy: 'Computer Science and Engineering',
        startDate: null,
        endDate: null,
        provenanceStatus: 'CLAIMED',
      },
    ],
    projects: [
      {
        name: 'AI Career MCP Hub',
        headline: 'Decentralized MCP Copilot for verified candidate evidence',
        role: null,
        summary: 'Decentralized MCP Copilot for verified candidate evidence',
        technologies: ['Node.js', 'Fastify', 'PostgreSQL', 'Drizzle ORM', 'Docker'],
        bullets: ['Built multi-tenant OAuth 2.1 authorization server with PKCE S256'],
        urls: ['https://github.com/vishu1803/Ai-job-mcp'],
        startDate: null,
        endDate: null,
        linkedResourceCount: 0,
        verifiedSignalCount: 0,
        provenanceStatus: 'CLAIMED',
      },
      {
        name: 'Distributed Task Queue',
        headline: 'Lightweight distributed worker framework in Python',
        role: null,
        summary: 'Lightweight distributed worker framework in Python',
        technologies: ['Python', 'FastAPI', 'Redis'],
        bullets: ['Implemented distributed lock and dead letter queue'],
        urls: [],
        startDate: null,
        endDate: null,
        linkedResourceCount: 0,
        verifiedSignalCount: 0,
        provenanceStatus: 'CLAIMED',
      },
    ],
    certifications: ['AWS Certified Solutions Architect - Associate', 'Certified Kubernetes Administrator'],
    skills: ['Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Docker', 'Redis', 'TypeScript'],
    provenance: 'RESUME_CLAIM',
  };

  it('1. populates candidate profile from resumeData when user has not author-overridden fields', async () => {
    const mockDb = {
      select: () => ({
        from: (_table) => ({
          where: () => ({
            orderBy: () => [],
            then: (resolve) =>
              resolve([
                {
                  id: candidateIdA,
                  tenantId: tenantIdA,
                  userId: userIdA,
                  displayName: 'VISHWANATH NISHAD',
                  headline: null,
                  summary: null,
                  canonicalEmail: null,
                  status: 'ACTIVE',
                  profileMetadata: {
                    resumeData: sampleResumeData,
                  },
                },
              ]),
          }),
        }),
      }),
    };

    const service = new CandidateProfileService(mockDb);

    // Mock getProfile
    service.getProfile = async () => ({
      candidate: {
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'VISHWANATH NISHAD',
        headline: null,
        summary: null,
        canonicalEmail: null,
        status: 'ACTIVE',
        profileMetadata: {
          resumeData: sampleResumeData,
        },
      },
      identities: [],
      resources: [],
      projects: [],
      skills: [],
    });

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    assert.equal(profile.displayName, 'VISHWANATH NISHAD');
    assert.equal(profile.headline, 'Full-Stack & Backend Developer');
    assert.equal(profile.location, 'Gorakhpur, UP, India');
    assert.equal(profile.canonicalEmail, 'vishwanath@example.com');
    assert.ok(profile.summary.includes('Full-stack & backend developer'));
    assert.equal(profile.recentExperience.length, 1);
    assert.equal(profile.recentExperience[0].company, 'Apex Tech Labs');
    assert.equal(profile.education.length, 1);
    assert.equal(profile.education[0].institution, 'Dr. A.P.J. Abdul Kalam Technical University');
    assert.equal(profile.certifications.length, 2);
    assert.equal(profile.highlightedProjects.length, 2);
    assert.equal(profile.topSkills.length, 7);
  });

  it('2. preserves narrative sovereignty: userCustom fields strictly override resume claims', async () => {
    const customHeadline = 'Principal Distributed Systems Architect';
    const customSummary = 'User authored custom professional narrative with 10+ years experience.';
    const customLocation = 'Bangalore, India';

    const service = new CandidateProfileService({});

    service.getProfile = async () => ({
      candidate: {
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'VISHWANATH NISHAD',
        headline: customHeadline,
        summary: customSummary,
        canonicalEmail: 'custom@vishu.dev',
        status: 'ACTIVE',
        profileMetadata: {
          location: customLocation,
          resumeData: sampleResumeData,
          userCustom: {
            headline: customHeadline,
            summary: customSummary,
            location: customLocation,
            experience: [
              {
                company: 'Google Cloud Platform',
                title: 'Staff Architect',
                startDate: '2024-01',
                endDate: null,
                isCurrent: true,
                skills: ['Go', 'Kubernetes'],
                provenanceStatus: 'USER_PROVIDED',
              },
            ],
          },
        },
      },
      identities: [],
      resources: [],
      projects: [],
      skills: [],
    });

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    assert.equal(profile.headline, customHeadline);
    assert.equal(profile.summary, customSummary);
    assert.equal(profile.location, customLocation);
    assert.equal(profile.canonicalEmail, 'custom@vishu.dev');
    assert.equal(profile.recentExperience.length, 1);
    assert.equal(profile.recentExperience[0].company, 'Google Cloud Platform');
    assert.equal(profile.recentExperience[0].provenanceStatus, 'USER_PROVIDED');
  });

  it('3. corroborates resume projects with GitHub AST evidence while preserving non-repo projects', async () => {
    const service = new CandidateProfileService({});

    service.getProfile = async () => ({
      candidate: {
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'VISHWANATH NISHAD',
        status: 'ACTIVE',
        profileMetadata: {
          resumeData: sampleResumeData,
        },
      },
      identities: [],
      resources: [],
      projects: [
        {
          id: 'e0000000-0000-4000-a000-000000000001',
          name: 'AI Career MCP Hub',
          slug: 'ai-job-mcp',
          headline: 'GitHub Verified Project Repository',
          role: 'Maintainer',
          startDate: '2026-01-01',
          endDate: null,
          linkedResourceCount: 1,
          verifiedSignalCount: 42,
          evidence: [{ id: 'e1' }, { id: 'e2' }],
          metadata: {},
        },
      ],
      skills: [],
    });

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    assert.equal(profile.highlightedProjects.length, 2);

    const corroborated = profile.highlightedProjects.find((p) => p.name === 'AI Career MCP Hub');
    assert.ok(corroborated, 'AI Career MCP Hub project should exist');
    assert.equal(corroborated.provenanceStatus, 'CORROBORATED');
    assert.equal(corroborated.verifiedSignalCount, 2);
    assert.ok(corroborated.technologies.includes('Node.js'));

    const unverified = profile.highlightedProjects.find((p) => p.name === 'Distributed Task Queue');
    assert.ok(unverified, 'Resume project without GitHub repo must NOT be deleted');
    assert.equal(unverified.provenanceStatus, 'CLAIMED');
    assert.equal(unverified.verifiedSignalCount, 0);
  });

  it('4. calculates composite skill truth status (resumeClaim vs githubEvidence)', async () => {
    const service = new CandidateProfileService({});

    service.getProfile = async () => ({
      candidate: {
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'VISHWANATH NISHAD',
        status: 'ACTIVE',
        profileMetadata: {
          resumeData: sampleResumeData,
        },
      },
      identities: [],
      resources: [],
      projects: [],
      skills: [
        {
          skillId: 's1',
          slug: 'python',
          name: 'Python',
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 18,
        },
        {
          skillId: 's2',
          slug: 'rust',
          name: 'Rust',
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.88,
          evidenceCount: 5,
        },
      ],
    });

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    // Python is in both GitHub (VERIFIED) and resume claims
    const pythonSkill = profile.topSkills.find((s) => s.slug === 'python');
    assert.ok(pythonSkill);
    assert.equal(pythonSkill.githubEvidence, true);
    assert.equal(pythonSkill.resumeClaim, true);
    assert.equal(pythonSkill.truthStatus, 'VERIFIED');

    // Rust is in GitHub (VERIFIED) only
    const rustSkill = profile.topSkills.find((s) => s.slug === 'rust');
    assert.ok(rustSkill);
    assert.equal(rustSkill.githubEvidence, true);
    assert.equal(rustSkill.resumeClaim, false);
    assert.equal(rustSkill.truthStatus, 'VERIFIED');

    // FastAPI is in resume claims only
    const fastapiSkill = profile.topSkills.find((s) => s.slug === 'fastapi');
    assert.ok(fastapiSkill);
    assert.equal(fastapiSkill.githubEvidence, false);
    assert.equal(fastapiSkill.resumeClaim, true);
    assert.equal(fastapiSkill.truthStatus, 'CLAIMED');

    assert.ok(profile.verifiedSkillsSummary.includes('Python'));
    assert.ok(profile.verifiedSkillsSummary.includes('Rust'));
    assert.ok(!profile.verifiedSkillsSummary.includes('FastAPI'));
  });

  it('5. evaluates profileReadiness independently from jobSearchReadiness', async () => {
    const service = new CandidateProfileService({});

    service.getProfile = async () => ({
      candidate: {
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'VISHWANATH NISHAD',
        status: 'ACTIVE',
        profileMetadata: {
          resumeData: sampleResumeData,
          careerPreferences: {
            targetRoles: [],
            preferredLocations: [],
          },
        },
      },
      identities: [],
      resources: [],
      projects: [],
      skills: [],
    });

    const profile = await service.getCareerProfile(contextA, candidateIdA);

    // Profile is populated with professional qualifications from resume
    assert.ok(profile.profileReadiness);
    assert.equal(profile.profileReadiness.isComplete, true);
    assert.ok(profile.profileReadiness.score >= 70);
    assert.equal(profile.profileReadiness.status, 'PROFILE POPULATED');

    // Job search readiness correctly reflects missing targetRoles
    assert.ok(profile.completeness);
    assert.equal(profile.completeness.isReadyForJobSearch, false);
    assert.ok(profile.completeness.missingRequiredForSearch.includes('targetRoles'));
  });

  it('6. enforces multi-tenant boundary: cross-tenant getCareerProfile throws NotFoundError', async () => {
    const service = new CandidateProfileService({
      select: () => ({
        from: () => ({
          where: () => [],
        }),
      }),
    });

    const crossTenantContext = {
      tenantId: tenantIdB,
      userId: userIdA,
      role: 'OWNER',
    };

    await assert.rejects(
      async () => service.getCareerProfile(crossTenantContext, candidateIdA),
      NotFoundError
    );
  });
});
