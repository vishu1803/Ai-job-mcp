/**
 * @file Unit Test Suite for P16-001E: Job-Tailored Heading & Dynamic Section Ordering (Batch 5)
 *
 * Requirements:
 * A. Backend job receives backend-compatible heading.
 * B. Frontend job receives frontend-compatible heading.
 * C. Senior job title does not cause unsupported seniority inflation.
 * D. Heading changes when target role meaningfully changes.
 * E. Candidate source headline/profile is not mutated.
 * F. Heading is stored in ResumeTailoringPlan.
 * G. StructuredResumeDocument headline matches the plan.
 * H. Entry-level project-heavy ordering is valid.
 * I. Experienced ordering is valid.
 * J. Package-specific section order is honored.
 * K. PdfGeometryAnalyzer accepts different valid section orders.
 * L. Wrong section order is rejected.
 * M. Duplicate sections are rejected.
 * N. Missing selected section is rejected.
 * O. Empty optional sections are not rendered.
 * P. Same inputs are deterministic.
 * Q. Candidate-specific hardcoded identity/link fallbacks are absent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  deriveTargetRoleHeading,
  deriveSectionOrdering,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
} from '../../src/services/structured-resume.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('P16-001E: Job-Tailored Heading & Dynamic Section Ordering', () => {
  const sampleFresherCandidate = {
    id: 'cand-fresher-001',
    displayName: 'Alex Chen',
    canonicalEmail: 'alex.chen@workmail.net',
    headline: 'Software Developer',
    seniority: 'ENTRY_LEVEL',
    careerStatus: 'FRESHER',
    skills: [
      { name: 'Python', slug: 'python', provenanceStatus: 'VERIFIED' },
      { name: 'FastAPI', slug: 'fastapi', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED' },
      { name: 'React', slug: 'react', provenanceStatus: 'VERIFIED' },
      { name: 'TypeScript', slug: 'typescript', provenanceStatus: 'VERIFIED' },
    ],
    projects: [
      {
        id: 'proj-pr-agent',
        name: 'PR Agent',
        technologies: ['Python', 'FastAPI', 'PostgreSQL'],
        bullets: ['Built asynchronous code review bot using FastAPI.'],
      },
      {
        id: 'proj-board',
        name: 'Kanban Board',
        technologies: ['React', 'TypeScript'],
        bullets: ['Implemented reactive drag-and-drop state manager.'],
      },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'Campus Lab',
        title: 'Software Developer Intern',
        startDate: '2023-05-01',
        endDate: '2023-08-31',
        bullets: ['Assisted in building internal automation scripts.'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Tech Institute of Science',
        degree: 'B.S. in Computer Science',
        startDate: '2020-09-01',
        endDate: '2024-05-15',
      },
    ],
  };

  const sampleExperiencedCandidate = {
    id: 'cand-exp-002',
    displayName: 'Jordan Miller',
    canonicalEmail: 'jordan.miller@workmail.net',
    headline: 'Senior Backend Engineer',
    seniority: 'SENIOR',
    careerStatus: 'EMPLOYED',
    skills: [
      { name: 'Python', slug: 'python', provenanceStatus: 'VERIFIED' },
      { name: 'FastAPI', slug: 'fastapi', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED' },
      { name: 'Go', slug: 'go', provenanceStatus: 'VERIFIED' },
      { name: 'Docker', slug: 'docker', provenanceStatus: 'VERIFIED' },
    ],
    projects: [
      {
        id: 'proj-distributed-indexer',
        name: 'Distributed Repo Indexer',
        technologies: ['Python', 'FastAPI', 'Go', 'PostgreSQL'],
        bullets: ['Scaled high-throughput repository indexer.'],
      },
    ],
    experience: [
      {
        id: 'exp-senior',
        company: 'Cloud Scale Inc',
        title: 'Senior Software Engineer',
        startDate: '2021-01-01',
        endDate: '2024-06-01',
        bullets: ['Architected core distributed microservices.'],
      },
      {
        id: 'exp-mid',
        company: 'First Tier Tech',
        title: 'Software Engineer',
        startDate: '2019-01-01',
        endDate: '2020-12-31',
        bullets: ['Built high-volume REST APIs.'],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Metro Tech University',
        degree: 'B.S. in Computer Engineering',
        startDate: '2015-09-01',
        endDate: '2019-05-15',
      },
    ],
  };

  const backendJob = {
    id: 'job-backend',
    title: 'Backend Engineer',
    company: 'Nexus Cloud',
    recommendedProjects: [{ projectId: 'proj-pr-agent', relevanceScore: 92 }],
  };

  const frontendJob = {
    id: 'job-frontend',
    title: 'Frontend Engineer',
    company: 'Pixel Interface',
    recommendedProjects: [{ projectId: 'proj-board', relevanceScore: 88 }],
  };

  const seniorBackendJob = {
    id: 'job-senior-backend',
    title: 'Senior Backend Engineer',
    company: 'Global Scale Networks',
    recommendedProjects: [{ projectId: 'proj-pr-agent', relevanceScore: 90 }],
  };

  const principalDataJob = {
    id: 'job-principal-data',
    title: 'Principal Software Engineer, DataHybrid',
    company: 'Cloud Data Corp',
    recommendedProjects: [{ projectId: 'proj-pr-agent', relevanceScore: 85 }],
  };

  it('Test A: Backend job receives backend-compatible heading', () => {
    const result = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });
    assert.ok(result.heading);
    assert.match(result.heading, /Backend\s+Engineer/i);
    assert.doesNotMatch(result.heading, /Frontend/i);
  });

  it('Test B: Frontend job receives frontend-compatible heading', () => {
    const result = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: frontendJob,
    });
    assert.ok(result.heading);
    assert.match(result.heading, /Frontend\s+Engineer/i);
    assert.doesNotMatch(result.heading, /Backend/i);
  });

  it('Test C: Senior job title does not cause unsupported seniority inflation', () => {
    // 1. Fresher candidate targeting Senior Backend Engineer
    const fresherSeniorResult = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: seniorBackendJob,
    });
    assert.ok(fresherSeniorResult.heading);
    assert.doesNotMatch(fresherSeniorResult.heading, /\b(senior|sr\.?|principal|lead|staff)\b/i);
    assert.strictEqual(fresherSeniorResult.seniorityAdjusted, true);
    assert.match(fresherSeniorResult.heading, /Backend\s+Engineer/i);

    // 2. Fresher candidate targeting Principal role
    const fresherPrincipalResult = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: principalDataJob,
    });
    assert.doesNotMatch(fresherPrincipalResult.heading, /\b(principal|datahybrid)\b/i);
    assert.strictEqual(fresherPrincipalResult.seniorityAdjusted, true);

    // 3. Experienced/Senior candidate targeting Senior role retains legitimate seniority
    const experiencedResult = deriveTargetRoleHeading({
      candidateProfile: sampleExperiencedCandidate,
      jobPosting: seniorBackendJob,
    });
    assert.match(experiencedResult.heading, /\bSenior\s+Backend\s+Engineer\b/i);
    assert.strictEqual(experiencedResult.seniorityAdjusted, false);
  });

  it('Test D: Heading changes when target role meaningfully changes', () => {
    const backendResult = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });
    const frontendResult = deriveTargetRoleHeading({
      candidateProfile: sampleFresherCandidate,
      jobPosting: frontendJob,
    });

    assert.notStrictEqual(backendResult.heading, frontendResult.heading);
    assert.match(backendResult.heading, /Backend/i);
    assert.match(frontendResult.heading, /Frontend/i);
  });

  it('Test E: Candidate source headline/profile is not mutated', () => {
    const candidateBefore = JSON.parse(JSON.stringify(sampleFresherCandidate));
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.ok(doc);
    assert.deepStrictEqual(sampleFresherCandidate, candidateBefore);
  });

  it('Test F: Heading is stored in ResumeTailoringPlan', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.ok(doc.tailoringPlan);
    assert.ok(doc.tailoringPlan.targetRoleTitle);
    assert.match(doc.tailoringPlan.targetRoleTitle, /Backend\s+Engineer/i);
  });

  it('Test G: StructuredResumeDocument headline matches the plan', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.strictEqual(doc.candidateIdentity.headline, doc.tailoringPlan.targetRoleTitle);
    assert.strictEqual(doc.targetRole, doc.tailoringPlan.targetRoleTitle);
  });

  it('Test H: Entry-level project-heavy ordering is valid', () => {
    const { sectionOrder, candidateArchetype } = deriveSectionOrdering({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.strictEqual(candidateArchetype, 'FRESHER');
    const projectsIdx = sectionOrder.indexOf('PROJECTS');
    const experienceIdx = sectionOrder.indexOf('EXPERIENCE');

    assert.ok(projectsIdx !== -1, 'PROJECTS section must be present');
    assert.ok(experienceIdx !== -1, 'EXPERIENCE section must be present');
    assert.ok(projectsIdx < experienceIdx, 'PROJECTS must precede EXPERIENCE for fresher');
  });

  it('Test I: Experienced ordering is valid', () => {
    const { sectionOrder, candidateArchetype } = deriveSectionOrdering({
      candidateProfile: sampleExperiencedCandidate,
      jobPosting: seniorBackendJob,
    });

    assert.strictEqual(candidateArchetype, 'EXPERIENCED');
    const experienceIdx = sectionOrder.indexOf('EXPERIENCE');
    const projectsIdx = sectionOrder.indexOf('PROJECTS');

    assert.ok(experienceIdx !== -1, 'EXPERIENCE section must be present');
    assert.ok(projectsIdx !== -1, 'PROJECTS section must be present');
    assert.ok(experienceIdx < projectsIdx, 'EXPERIENCE must precede PROJECTS for experienced candidate');
  });

  it('Test J: Package-specific section order is honored', () => {
    const customOrder = ['HEADER', 'SUMMARY', 'SKILLS', 'EDUCATION', 'PROJECTS', 'EXPERIENCE'];
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
      tailoringPlan: {
        sectionOrder: customOrder,
      },
    });

    assert.deepStrictEqual(doc.sectionOrder, customOrder);
    assert.deepStrictEqual(doc.tailoringPlan.sectionOrder, customOrder);
  });

  it('Test K: PdfGeometryAnalyzer accepts different valid section orders', () => {
    const analyzer = new PdfGeometryAnalyzer();

    // Package A: Projects precede Experience (e.g. Fresher)
    const detectedSectionsA = [
      { type: 'SUMMARY' },
      { type: 'SKILLS' },
      { type: 'PROJECTS' },
      { type: 'EXPERIENCE' },
      { type: 'EDUCATION' },
    ];
    const orderPlanA = ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'];
    const reportA = analyzer._verifySectionOrdering(detectedSectionsA, orderPlanA);

    assert.strictEqual(reportA.valid, true);
    assert.strictEqual(reportA.violations.length, 0);

    // Package B: Experience precedes Projects (e.g. Experienced)
    const detectedSectionsB = [
      { type: 'SUMMARY' },
      { type: 'SKILLS' },
      { type: 'EXPERIENCE' },
      { type: 'PROJECTS' },
      { type: 'EDUCATION' },
    ];
    const orderPlanB = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'EDUCATION'];
    const reportB = analyzer._verifySectionOrdering(detectedSectionsB, orderPlanB);

    assert.strictEqual(reportB.valid, true);
    assert.strictEqual(reportB.violations.length, 0);
  });

  it('Test L: Wrong section order is rejected', () => {
    const analyzer = new PdfGeometryAnalyzer();

    // Actual detected: EXPERIENCE before PROJECTS
    const detectedSections = [
      { type: 'SUMMARY' },
      { type: 'SKILLS' },
      { type: 'EXPERIENCE' },
      { type: 'PROJECTS' },
      { type: 'EDUCATION' },
    ];

    // Package plan expected: PROJECTS before EXPERIENCE
    const packageOrder = ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'];
    const report = analyzer._verifySectionOrdering(detectedSections, packageOrder);

    assert.strictEqual(report.valid, false);
    assert.ok(report.violations.length > 0);
    assert.match(report.violations[0], /EXPERIENCE appears before PROJECTS/i);
  });

  it('Test M: Duplicate sections are rejected', () => {
    const analyzer = new PdfGeometryAnalyzer();

    const detectedWithDuplicate = [
      { type: 'SUMMARY' },
      { type: 'SKILLS' },
      { type: 'EXPERIENCE' },
      { type: 'EXPERIENCE' }, // Duplicate!
      { type: 'PROJECTS' },
      { type: 'EDUCATION' },
    ];

    const packageOrder = ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'EDUCATION'];
    const report = analyzer._verifySectionOrdering(detectedWithDuplicate, packageOrder);

    assert.strictEqual(report.valid, false);
    assert.ok(report.violations.some((v) => /Duplicate section detected: EXPERIENCE/i.test(v)));
  });

  it('Test N: Missing selected section is rejected', () => {
    const analyzer = new PdfGeometryAnalyzer();

    const detectedSections = [
      { type: 'SUMMARY' },
      { type: 'SKILLS' },
      { type: 'EDUCATION' },
    ];

    const expectedSections = ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'];
    const presenceReport = analyzer._validateSectionPresence(detectedSections, expectedSections);

    assert.strictEqual(presenceReport.allPresent, false);
    assert.ok(presenceReport.missing.includes('PROJECTS'));
    assert.ok(presenceReport.missing.includes('EXPERIENCE'));
  });

  it('Test O: Empty optional sections are not rendered', () => {
    // Fresher has no DSA, no Certifications, no Coursework, no Publications
    const { sectionOrder } = deriveSectionOrdering({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.ok(!sectionOrder.includes('DSA'));
    assert.ok(!sectionOrder.includes('CERTIFICATIONS'));
    assert.ok(!sectionOrder.includes('COURSEWORK'));
    assert.ok(!sectionOrder.includes('PUBLICATIONS'));

    // Check LaTeX generation
    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    const latexGen = new LatexDocumentGenerator();
    const { texContent } = latexGen.generateTailoredResumeLatex({
      applicationPackage: {
        candidateName: sampleFresherCandidate.displayName,
        candidateEmail: sampleFresherCandidate.canonicalEmail,
        structuredResume: doc,
        tailoringPlan: doc.tailoringPlan,
      },
      candidateProfile: sampleFresherCandidate,
    });

    assert.doesNotMatch(texContent, /\\atssection\{Certifications\}/i);
    assert.doesNotMatch(texContent, /\\atssection\{Problem Solving/i);
    assert.doesNotMatch(texContent, /\\atssection\{Relevant Coursework\}/i);
    assert.doesNotMatch(texContent, /\\atssection\{Publications\}/i);
  });

  it('Test P: Same inputs are deterministic', () => {
    const doc1 = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });
    const doc2 = buildStructuredResumeDocument({
      candidateProfile: sampleFresherCandidate,
      jobPosting: backendJob,
    });

    assert.strictEqual(doc1.targetRole, doc2.targetRole);
    assert.strictEqual(doc1.candidateIdentity.headline, doc2.candidateIdentity.headline);
    assert.deepStrictEqual(doc1.sectionOrder, doc2.sectionOrder);
    assert.deepStrictEqual(doc1.tailoringPlan.sectionOrder, doc2.tailoringPlan.sectionOrder);
  });

  it('Test Q: Candidate-specific hardcoded identity/link fallbacks are absent', () => {
    // 1. Static check: Verify latex-document-generator.service.js contains no vishu1803
    const latexFilePath = path.resolve('src/services/latex-document-generator.service.js');
    const sourceCode = fs.readFileSync(latexFilePath, 'utf8');
    assert.doesNotMatch(
      sourceCode,
      /vishu1803/i,
      'Production LaTeX generator must NOT contain hardcoded GitHub handles or links'
    );

    // 2. Behavioral check: Candidate with name matching Vishwanath but no github link
    // must NOT produce a fallback github.com/vishu1803 link
    const candidateWithoutGithub = {
      displayName: 'Vishwanath Sharma',
      canonicalEmail: 'vishwanath.sharma@workmail.net',
      headline: 'Backend Developer',
      skills: [{ name: 'Python', slug: 'python', provenanceStatus: 'VERIFIED' }],
      projects: [],
      experience: [],
      education: [],
    };

    const doc = buildStructuredResumeDocument({
      candidateProfile: candidateWithoutGithub,
      jobPosting: backendJob,
    });

    const latexGen = new LatexDocumentGenerator();
    const { texContent } = latexGen.generateTailoredResumeLatex({
      applicationPackage: {
        candidateName: candidateWithoutGithub.displayName,
        candidateEmail: candidateWithoutGithub.canonicalEmail,
        structuredResume: doc,
        tailoringPlan: doc.tailoringPlan,
      },
      candidateProfile: candidateWithoutGithub,
    });

    assert.doesNotMatch(
      texContent,
      /github\.com\/vishu1803/i,
      'Generated LaTeX must NOT synthesize an ungrounded GitHub link for a candidate named Vishwanath'
    );
  });
});
