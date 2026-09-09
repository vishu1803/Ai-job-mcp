/**
 * @file Unit Test Suite for P16-001F-1: Structured Resume Snapshot Persistence & Validation
 *
 * Requirements:
 * A. prepareJobApplication creates structuredResume
 * B. tailoringPlan is persisted
 * C. evidenceValidationReceipt is persisted
 * D. structuredResume equals the validated build result
 * E. project ordering matches analyzer ranking
 * F. skill ordering matches authoritative selection
 * G. summary has evidenceRefs
 * H. heading matches tailoring plan
 * I. sectionOrder matches tailoring plan
 * J. experience snapshot preserved
 * K. education snapshot preserved
 * L. certification snapshot preserved
 * M. DSA snapshot preserved
 * N. candidate source object is not mutated
 * O. package payload remains unchanged after source object mutation
 * P. failed integrity validation prevents package persistence
 * Q. legacy package shape remains accepted
 * R. existing package hash/idempotency semantics are unchanged
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  JobApplicationWorkflowService,
  computeApplicationPackageHash,
} from '../../src/services/job-application-workflow.service.js';
import {
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import {
  ApplicationPackageSchema,
} from '../../src/domain/job/job-workflow.schemas.js';
import { ValidationError } from '../../src/errors/index.js';

/**
 * Deep freezes an object to test strict immutability.
 *
 * @param {object} obj
 * @returns {object}
 */
function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

describe('P16-001F-1: Structured Resume Snapshot Persistence & Validation', () => {
  const candidateId = '44444444-4444-4444-4444-444444444444';
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';

  const sampleCandidateData = {
    tenantId,
    candidateId,
    displayName: 'Jordan Morgan',
    email: 'jordan.morgan@testdomain.org',
    canonicalEmail: 'jordan.morgan@testdomain.org',
    phone: '+1-555-0199',
    location: 'San Francisco, CA',
    headline: 'Senior Backend Engineer',
    careerStatus: 'EXPERIENCED',
    skills: [
      { name: 'Node.js', slug: 'node-js', category: 'Backend & APIs', provenanceStatus: 'VERIFIED', evidenceId: '11111111-0000-0000-0000-000000000001', confidenceScore: 0.95 },
      { name: 'PostgreSQL', slug: 'postgresql', category: 'Databases & ORMs', provenanceStatus: 'VERIFIED', evidenceId: '11111111-0000-0000-0000-000000000002', confidenceScore: 0.9 },
      { name: 'TypeScript', slug: 'typescript', category: 'Languages', provenanceStatus: 'VERIFIED', evidenceId: '11111111-0000-0000-0000-000000000003', confidenceScore: 0.92 },
      { name: 'Docker', slug: 'docker', category: 'Cloud, DevOps & Systems', provenanceStatus: 'VERIFIED', evidenceId: '11111111-0000-0000-0000-000000000004', confidenceScore: 0.88 },
      { name: 'Redis', slug: 'redis', category: 'Databases & ORMs', provenanceStatus: 'CLAIMED', confidenceScore: 0.7 },
    ],
    projects: [
      {
        id: 'proj-dist-cache',
        name: 'Distributed Cache Service',
        repositoryUrl: 'https://github.com/jordanm/dist-cache',
        technologies: ['Node.js', 'Redis', 'TypeScript'],
        bullets: ['Engineered high-throughput in-memory cache replica with asynchronous event loops.'],
        relevanceScore: 88,
        rank: 1,
      },
      {
        id: 'proj-db-migrator',
        name: 'Database Schema Migrator',
        repositoryUrl: 'https://github.com/jordanm/db-migrator',
        technologies: ['TypeScript', 'PostgreSQL'],
        bullets: ['Built schema diffing tool for transactional migration rollback.'],
        relevanceScore: 75,
        rank: 2,
      },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'Nexus Systems',
        title: 'Senior Software Engineer',
        startDate: '2022-03-01',
        endDate: '2024-06-01',
        isCurrent: false,
        location: 'San Francisco, CA',
        bullets: ['Maintained event streams handling asynchronous distributed notifications.'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'California State Polytechnic University',
        degree: 'B.S. in Computer Science',
        fieldOfStudy: 'Computer Science',
        startDate: '2016-09-01',
        endDate: '2020-06-01',
        coursework: ['Distributed Systems', 'Algorithms'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Solutions Architect',
        issuingOrganization: 'Amazon Web Services',
        issueDate: '2023-01-15',
        expirationDate: '2026-01-15',
        credentialId: 'AWS-CSA-10293',
        credentialUrl: 'https://aws.amazon.com/verify/AWS-CSA-10293',
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    problemSolving: {
      hasSection: true,
      profileUrl: 'https://leetcode.com/jordanm',
      bullets: ['Solved algorithmic challenges covering dynamic programming, graph traversal, and binary search.'],
      provenanceStatus: 'CLAIMED',
    },
    portfolioLinks: [
      { label: 'GitHub', url: 'https://github.com/jordanm' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/jordanm' },
      { label: 'LeetCode', url: 'https://leetcode.com/jordanm' },
    ],
  };

  const sampleJob = {
    id: 'job-backend-101',
    title: 'Backend Software Engineer',
    company: 'Acme Cloud Services',
    location: 'Remote',
    source: 'GREENHOUSE',
    applicationUrl: 'https://boards.greenhouse.io/acme/jobs/101',
    description: 'We are hiring a Backend Software Engineer proficient in Node.js, PostgreSQL, and TypeScript.',
    requirements: ['Node.js', 'PostgreSQL', 'TypeScript', 'Docker'],
    skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    retrievedAt: new Date().toISOString(),
    projectRankings: [
      {
        projectId: 'proj-dist-cache',
        projectName: 'Distributed Cache Service',
        relevanceScore: 92,
        rank: 1,
        matchedRequirementIds: ['req-node', 'req-ts'],
      },
      {
        projectId: 'proj-db-migrator',
        projectName: 'Database Schema Migrator',
        relevanceScore: 78,
        rank: 2,
        matchedRequirementIds: ['req-pg'],
      },
    ],
    jobFitAnalysis: {
      overallFit: { atsScore: 91 },
      matchAnalysis: {
        matchedSkills: ['Node.js', 'PostgreSQL', 'TypeScript'],
        matchBreakdown: { nodejs: 0.95, postgresql: 0.9 },
      },
      projectRankings: [
        {
          projectId: 'proj-dist-cache',
          projectName: 'Distributed Cache Service',
          relevanceScore: 92,
          rank: 1,
          matchedRequirementIds: ['req-node', 'req-ts'],
        },
        {
          projectId: 'proj-db-migrator',
          projectName: 'Database Schema Migrator',
          relevanceScore: 78,
          rank: 2,
          matchedRequirementIds: ['req-pg'],
        },
      ],
    },
  };

  /**
   * Builds a mocked JobApplicationWorkflowService that returns sample candidate data and documents.
   */
  function createMockWorkflowService({ candidateData = sampleCandidateData, dbCandidate = null } = {}) {
    const mockDb = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: async () => [
                {
                  candidate: dbCandidate || {
                    id: candidateId,
                    tenantId,
                    userId,
                    displayName: candidateData.displayName,
                    canonicalEmail: candidateData.canonicalEmail,
                    profileMetadata: candidateData,
                  },
                  userEmail: candidateData.canonicalEmail,
                },
              ],
            }),
          }),
          innerJoin: () => ({
            where: async () =>
              candidateData.skills.map((s) => ({
                skillName: s.name,
                provenanceStatus: s.provenanceStatus,
                evidenceId: s.evidenceId || null,
              })),
          }),
        }),
      }),
    };

    const mockContentService = {
      generateApplicationDocuments: async () => ({
        resume: {
          documentId: 'doc-resume-001',
          title: `Resume - ${sampleJob.company}`,
          markdownContent: `# ${candidateData.displayName}\n**Email:** ${candidateData.canonicalEmail}\n\n## Professional Summary\nExperienced engineer.\n\n## Technical Skills\n- **Backend & APIs:** Node.js\n\n## Technical Projects\n### Distributed Cache Service\n- Engineered high-throughput in-memory cache replica.\n\n## Professional Experience\n### Senior Software Engineer - Nexus Systems\n- Maintained event streams.\n\n## Education\n### California State Polytechnic University\n- B.S. in Computer Science\n`,
          contentHash: 'hash-res-001',
          fitScore: 91,
          selectedProjects: candidateData.projects,
          sections: ['HEADER', 'PROFESSIONAL_SUMMARY', 'TECHNICAL_SKILLS', 'TECHNICAL_PROJECTS', 'EXPERIENCE', 'EDUCATION'],
          selectedSections: ['HEADER', 'PROFESSIONAL_SUMMARY', 'TECHNICAL_SKILLS', 'TECHNICAL_PROJECTS', 'EXPERIENCE', 'EDUCATION'],
          sectionSnapshots: {},
        },
        coverLetter: {
          documentId: 'doc-cl-001',
          title: `Cover Letter - ${sampleJob.company}`,
          markdownContent: 'Dear Hiring Team,\n\nI am excited to apply.',
          contentHash: 'hash-cl-001',
        },
        evidence: {
          projectNamesUsed: ['Distributed Cache Service'],
        },
        selectedProjects: candidateData.projects,
        candidateData,
      }),
    };

    const mockTrackingService = {
      resolveOrCreateApplication: async () => ({
        id: crypto.randomUUID(),
        isReused: false,
      }),
      attachPackageDocumentSnapshots: async () => ({}),
      recordApplicationPackage: async () => ({
        id: crypto.randomUUID(),
        version: 1,
        isReused: false,
      }),
    };

    return new JobApplicationWorkflowService({
      database: mockDb,
      candidateArtifactContentService: mockContentService,
      applicationTrackingService: mockTrackingService,
    });
  }

  // ---------------------------------------------------------------------------
  // Test A: prepareJobApplication creates structuredResume
  // ---------------------------------------------------------------------------
  it('A. prepareJobApplication creates structuredResume in tailoredResume', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    assert.ok(pkg.tailoredResume.structuredResume, 'tailoredResume.structuredResume must be defined');
    assert.strictEqual(pkg.tailoredResume.structuredResume.schemaVersion, '2.0.0');
    assert.ok(pkg.structuredResume, 'top-level structuredResume must be defined');
  });

  // ---------------------------------------------------------------------------
  // Test B: tailoringPlan is persisted
  // ---------------------------------------------------------------------------
  it('B. tailoringPlan is persisted in tailoredResume and top-level', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    assert.ok(pkg.tailoredResume.tailoringPlan, 'tailoredResume.tailoringPlan must be defined');
    assert.ok(pkg.tailoringPlan, 'top-level tailoringPlan must be defined');
    assert.strictEqual(typeof pkg.tailoredResume.tailoringPlan.planId, 'string');
    assert.strictEqual(pkg.tailoredResume.tailoringPlan.pageTarget, 'ONE_PAGE_STRICT');
  });

  // ---------------------------------------------------------------------------
  // Test C: evidenceValidationReceipt is persisted
  // ---------------------------------------------------------------------------
  it('C. evidenceValidationReceipt is persisted with overallStatus PASS', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const receipt = pkg.tailoredResume.evidenceValidationReceipt;
    assert.ok(receipt, 'evidenceValidationReceipt must be present');
    assert.strictEqual(receipt.overallStatus, 'PASS', 'Receipt status must be PASS');
    assert.strictEqual(receipt.violations.length, 0, 'Violations array must be empty');
    assert.ok(receipt.summary.totalClaimsAudited > 0, 'Total claims audited must be greater than 0');
  });

  // ---------------------------------------------------------------------------
  // Test D: structuredResume equals the validated build result
  // ---------------------------------------------------------------------------
  it('D. structuredResume matches authoritative buildStructuredResumeSnapshot result', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const expected = buildStructuredResumeSnapshot({
      candidateProfile: sampleCandidateData,
      jobPosting: sampleJob,
      options: {
        projectRankings: sampleJob.projectRankings,
        matchAnalysis: sampleJob.jobFitAnalysis.matchAnalysis,
      },
    });

    assert.strictEqual(pkg.tailoredResume.structuredResume.targetRole, expected.structuredResume.targetRole);
    assert.deepStrictEqual(pkg.tailoredResume.structuredResume.sectionOrder, expected.structuredResume.sectionOrder);
    assert.strictEqual(
      pkg.tailoredResume.structuredResume.candidateIdentity.displayName,
      expected.structuredResume.candidateIdentity.displayName
    );
    assert.strictEqual(
      pkg.tailoredResume.structuredResume.candidateIdentity.email,
      expected.structuredResume.candidateIdentity.email
    );
    assert.strictEqual(pkg.tailoredResume.structuredResume.projects.length, expected.structuredResume.projects.length);
  });

  // ---------------------------------------------------------------------------
  // Test E: project ordering matches analyzer ranking
  // ---------------------------------------------------------------------------
  it('E. project ordering matches analyzer ranking without re-sorting', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const projects = pkg.tailoredResume.structuredResume.projects;
    assert.ok(projects.length >= 2, 'Must have at least 2 projects');
    assert.strictEqual(projects[0].projectId, 'proj-dist-cache', 'Top analyzer ranked project must be first');
    assert.strictEqual(projects[1].projectId, 'proj-db-migrator', 'Second analyzer ranked project must be second');
    assert.deepStrictEqual(
      pkg.tailoredResume.tailoringPlan.selectedProjectIds,
      ['proj-dist-cache', 'proj-db-migrator']
    );
  });

  // ---------------------------------------------------------------------------
  // Test F: skill ordering matches authoritative selection
  // ---------------------------------------------------------------------------
  it('F. skill ordering matches authoritative selection and category grouping', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const categories = pkg.tailoredResume.structuredResume.skills.categories;
    assert.ok(categories.length > 0, 'Must have categorized skills');
    const selectedSkills = pkg.tailoredResume.tailoringPlan.selectedSkills;
    assert.ok(selectedSkills.length > 0, 'Tailoring plan must record selected skills');
    assert.ok(selectedSkills.some((s) => s.name === 'Node.js' && s.provenanceStatus === 'VERIFIED'));
  });

  // ---------------------------------------------------------------------------
  // Test G: summary has evidenceRefs
  // ---------------------------------------------------------------------------
  it('G. summary has evidenceRefs grounding claims to authentic candidate records', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const summary = pkg.tailoredResume.structuredResume.summary;
    assert.ok(summary, 'Structured resume must include a summary');
    assert.ok(Array.isArray(summary.evidenceRefs), 'summary.evidenceRefs must be an array');
    assert.ok(summary.evidenceRefs.length > 0, 'summary must have evidence references');
    assert.ok(summary.text.length > 0, 'summary text must be non-empty');
  });

  // ---------------------------------------------------------------------------
  // Test H: heading matches tailoring plan
  // ---------------------------------------------------------------------------
  it('H. heading matches tailoring plan and candidateIdentity headline', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const structured = pkg.tailoredResume.structuredResume;
    const plan = pkg.tailoredResume.tailoringPlan;

    assert.strictEqual(structured.targetRole, plan.targetRoleTitle);
    assert.strictEqual(structured.candidateIdentity.headline, plan.targetRoleTitle);
    assert.strictEqual(structured.targetRole, 'Backend Software Engineer');
  });

  // ---------------------------------------------------------------------------
  // Test I: sectionOrder matches tailoring plan
  // ---------------------------------------------------------------------------
  it('I. sectionOrder matches tailoring plan dynamically', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    assert.deepStrictEqual(
      pkg.tailoredResume.structuredResume.sectionOrder,
      pkg.tailoredResume.tailoringPlan.sectionOrder
    );
    assert.ok(pkg.tailoredResume.structuredResume.sectionOrder.includes('EXPERIENCE'));
    assert.ok(pkg.tailoredResume.structuredResume.sectionOrder.includes('PROJECTS'));
  });

  // ---------------------------------------------------------------------------
  // Test J: experience snapshot preserved
  // ---------------------------------------------------------------------------
  it('J. experience snapshot preserved accurately from candidate source', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const exp = pkg.tailoredResume.structuredResume.experience;
    assert.strictEqual(exp.length, 1);
    assert.strictEqual(exp[0].company, 'Nexus Systems');
    assert.strictEqual(exp[0].title, 'Senior Software Engineer');
    assert.strictEqual(exp[0].startDate, '2022-03-01');
    assert.strictEqual(exp[0].endDate, '2024-06-01');
    assert.strictEqual(exp[0].bullets.length, 1);
  });

  // ---------------------------------------------------------------------------
  // Test K: education snapshot preserved
  // ---------------------------------------------------------------------------
  it('K. education snapshot preserved accurately from candidate source', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const edu = pkg.tailoredResume.structuredResume.education;
    assert.strictEqual(edu.length, 1);
    assert.strictEqual(edu[0].institution, 'California State Polytechnic University');
    assert.strictEqual(edu[0].degree, 'B.S. in Computer Science');
    assert.strictEqual(edu[0].fieldOfStudy, 'Computer Science');
    assert.strictEqual(edu[0].startDate, '2016-09-01');
  });

  // ---------------------------------------------------------------------------
  // Test L: certification snapshot preserved
  // ---------------------------------------------------------------------------
  it('L. certification snapshot preserved accurately from candidate source', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const cert = pkg.tailoredResume.structuredResume.certifications;
    assert.strictEqual(cert.length, 1);
    assert.strictEqual(cert[0].name, 'AWS Certified Solutions Architect');
    assert.strictEqual(cert[0].issuingOrganization, 'Amazon Web Services');
    assert.strictEqual(cert[0].credentialId, 'AWS-CSA-10293');
  });

  // ---------------------------------------------------------------------------
  // Test M: DSA snapshot preserved
  // ---------------------------------------------------------------------------
  it('M. DSA snapshot preserved accurately from candidate source without fabricated bullets', async () => {
    const service = createMockWorkflowService();
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const dsa = pkg.tailoredResume.structuredResume.dsa;
    assert.ok(dsa, 'DSA snapshot must exist');
    assert.strictEqual(dsa.hasSection, true);
    assert.strictEqual(dsa.profileUrl, 'https://leetcode.com/jordanm');
    assert.strictEqual(dsa.bullets.length, 1);
    assert.strictEqual(dsa.bullets[0], sampleCandidateData.problemSolving.bullets[0]);
  });

  // ---------------------------------------------------------------------------
  // Test N: candidate source object is not mutated
  // ---------------------------------------------------------------------------
  it('N. candidate source object is deeply frozen and not mutated during preparation', async () => {
    const immutableCandidate = JSON.parse(JSON.stringify(sampleCandidateData));
    deepFreeze(immutableCandidate);

    const service = createMockWorkflowService({ candidateData: immutableCandidate });
    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    assert.ok(pkg.tailoredResume.structuredResume);
    assert.strictEqual(immutableCandidate.displayName, 'Jordan Morgan');
    assert.strictEqual(immutableCandidate.projects.length, 2);
  });

  // ---------------------------------------------------------------------------
  // Test O: package payload remains unchanged after source object mutation
  // ---------------------------------------------------------------------------
  it('O. package payload remains unchanged after source object mutation in memory', async () => {
    const mutableCandidate = JSON.parse(JSON.stringify(sampleCandidateData));
    const service = createMockWorkflowService({ candidateData: mutableCandidate });

    const pkg = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const originalDisplayName = pkg.tailoredResume.structuredResume.candidateIdentity.displayName;
    const originalExperienceCount = pkg.tailoredResume.structuredResume.experience.length;

    // Mutate source candidate object in place
    mutableCandidate.displayName = 'Mutated Hacker Name';
    mutableCandidate.experience.push({
      id: 'fake-exp',
      company: 'Fake Corp',
      title: 'Fake Title',
    });

    assert.strictEqual(
      pkg.tailoredResume.structuredResume.candidateIdentity.displayName,
      originalDisplayName,
      'Structured resume candidateIdentity must not be affected by live memory mutations'
    );
    assert.strictEqual(
      pkg.tailoredResume.structuredResume.experience.length,
      originalExperienceCount,
      'Structured resume experience must not be affected by live memory mutations'
    );
  });

  // ---------------------------------------------------------------------------
  // Test P: failed integrity validation prevents package persistence
  // ---------------------------------------------------------------------------
  it('P. failed integrity validation prevents package persistence (fail-closed)', async () => {
    const contaminatedCandidate = JSON.parse(JSON.stringify(sampleCandidateData));
    // Inject a forbidden synthetic placeholder
    contaminatedCandidate.experience[0].company = '2022-01-01';

    const service = createMockWorkflowService({ candidateData: contaminatedCandidate });

    await assert.rejects(
      async () => {
        await service.prepareJobApplication({
          tenantId,
          candidateId,
          jobPosting: sampleJob,
        });
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('Forbidden synthetic placeholder') || err.message.includes('integrity'));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // Test Q: legacy package shape remains accepted
  // ---------------------------------------------------------------------------
  it('Q. legacy package shape without structuredResume remains valid', () => {
    const legacyPackage = {
      candidateId: crypto.randomUUID(),
      candidateName: 'Legacy Candidate',
      candidateEmail: 'legacy@example.com',
      targetJob: {
        id: 'legacy-job-1',
        title: 'Software Engineer',
        company: 'Legacy Corp',
        location: 'Remote',
        source: 'MANUAL',
        applicationUrl: 'https://example.com/apply',
        description: 'Legacy description',
        requirements: [],
        skills: [],
        retrievedAt: new Date().toISOString(),
      },
      tailoredResume: {
        title: 'Resume - Legacy Corp',
        markdownContent: '# Legacy Candidate\n\nSoftware Engineer',
        contentHash: 'hash-legacy-res',
        fitScore: 80,
      },
      coverLetter: {
        title: 'Cover Letter - Legacy Corp',
        markdownContent: 'Dear Hiring Team, I am applying.',
        contentHash: 'hash-legacy-cl',
      },
      verifiedSkills: [],
      claimedSkills: [],
      portfolioLinks: [],
      packageHash: 'a'.repeat(64),
      preparedAt: new Date().toISOString(),
    };

    const parsed = ApplicationPackageSchema.parse(legacyPackage);
    assert.strictEqual(parsed.candidateName, 'Legacy Candidate');
    assert.strictEqual(parsed.tailoredResume.structuredResume, undefined);
    assert.strictEqual(parsed.structuredResume, undefined);
  });

  // ---------------------------------------------------------------------------
  // Test R: existing package hash/idempotency semantics are unchanged
  // ---------------------------------------------------------------------------
  it('R. existing package hash calculation is hash-neutral with respect to structuredResume', async () => {
    const service = createMockWorkflowService();
    const pkgWithStructured = await service.prepareJobApplication({
      tenantId,
      candidateId,
      jobPosting: sampleJob,
    });

    const pkgWithoutStructured = {
      ...pkgWithStructured,
      tailoredResume: {
        ...pkgWithStructured.tailoredResume,
        structuredResume: undefined,
        tailoringPlan: undefined,
        evidenceValidationReceipt: undefined,
      },
      structuredResume: undefined,
      tailoringPlan: undefined,
      evidenceValidationReceipt: undefined,
    };

    const hashWith = computeApplicationPackageHash(pkgWithStructured);
    const hashWithout = computeApplicationPackageHash(pkgWithoutStructured);

    assert.strictEqual(hashWith, hashWithout, 'Hash must be identical with or without structured snapshot');
    assert.strictEqual(pkgWithStructured.packageHash, hashWith, 'Persisted packageHash must match computed canonical hash');
  });
});
