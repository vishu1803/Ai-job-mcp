/**
 * @file Unit Tests: Part 54 — Minimal Project-Bullet Content Fix
 *
 * Verifies:
 * 1. Both selected projects render AT LEAST 3 bullets each (total ≥ 6 bullets for 2 projects).
 * 2. Complete elimination of repo description fragments:
 *    - No "Intelligent automated code review system integrating OpenAI API and FastAPI webhooks."
 *    - No "Real-time collaborative task manager built with TypeScript, Express, Prisma, and PostgreSQL."
 * 3. Every rendered bullet is a complete recruiter-readable sentence ending with a period (.),
 *    opening with an active engineering action verb.
 * 4. Bullets cover 3 diverse technical aspects (Core architecture, Backend/Data, Integration/Async/Performance).
 * 5. Strict evidence grounding: unsupported technologies (AWS) are rejected for projects.
 * 6. Fail-closed contract: throws INSUFFICIENT_SOURCE_EVIDENCE if < 3 grounded facts exist.
 * 7. Layout engine and LaTeX generator preserve the 3-bullet contract without trimming to 2.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { ResumeLayoutEngine } from '../../src/services/resume-layout-engine.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';

describe('Part 54: Minimal Project-Bullet Content Fix', () => {
  const candidateId = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const projTaskMgrId = '389d1357-156a-4296-a1bb-603140897bc3';
  const projCodeReviewId = 'ea5137c3-2f7f-4e29-a884-28ff3c659ebf';

  const mockCandidateProfile = {
    id: candidateId,
    displayName: 'Vishwanath Nishad',
    email: 'vishwanath.work01@gmail.com',
    skills: [
      { name: 'Python', category: 'Languages', provenanceStatus: 'VERIFIED' },
      { name: 'TypeScript', category: 'Languages', provenanceStatus: 'VERIFIED' },
      { name: 'FastAPI', category: 'Frameworks & Libraries', provenanceStatus: 'VERIFIED' },
      { name: 'Node.js', category: 'Frameworks & Libraries', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', category: 'Databases', provenanceStatus: 'VERIFIED' },
      { name: 'Prisma', category: 'Databases', provenanceStatus: 'VERIFIED' },
      { name: 'AWS', category: 'Cloud, DevOps & Systems', provenanceStatus: 'USER_PROVIDED' },
    ],
    projects: [
      {
        id: projTaskMgrId,
        projectId: projTaskMgrId,
        name: 'Collaborative Task Manager',
        technologies: ['TypeScript', 'Node.js', 'Express', 'Prisma', 'PostgreSQL'],
        bullets: [
          'Built a secure, full-stack task management platform with JWT-based authentication and fine-grained Role-Based Access Control (RBAC) for collaboration.',
          'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM, optimizing complex PostgreSQL queries to support real-time updates.',
          'Improved team productivity and coordination overhead by providing a responsive interface with real-time updates and an optimized database structure.',
        ],
        metadata: {
          bullets: [
            'Built a secure, full-stack task management platform with JWT-based authentication and fine-grained Role-Based Access Control (RBAC) for collaboration.',
            'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM, optimizing complex PostgreSQL queries to support real-time updates.',
            'Improved team productivity and coordination overhead by providing a responsive interface with real-time updates and an optimized database structure.',
          ],
          featureDescriptions: [
            'Real-time collaborative task manager built with TypeScript, Express, Prisma, and PostgreSQL.',
          ],
        },
      },
      {
        id: projCodeReviewId,
        projectId: projCodeReviewId,
        name: 'AI-Powered Code Review Assistant',
        technologies: ['Python', 'FastAPI', 'Flask', 'GitHub Webhooks', 'OpenAI API'],
        bullets: [
          'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests, identifying style issues and suggesting bug fixes.',
          'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations, ensuring high concurrency and application availability.',
          'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
        ],
        metadata: {
          bullets: [
            'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests, identifying style issues and suggesting bug fixes.',
            'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations, ensuring high concurrency and application availability.',
            'Reduced average manual code review time across multiple repositories by automating code evaluation, resulting in improved developer velocity and code quality standards.',
          ],
          featureDescriptions: [
            'Intelligent automated code review system integrating OpenAI API and FastAPI webhooks.',
          ],
        },
      },
    ],
  };

  const sampleJob = {
    title: 'Senior Backend Engineer — Python & Node.js',
    description: 'Design and build high-performance APIs and scalable data architectures with Python, FastAPI, and PostgreSQL.',
    requirements: ['Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'REST APIs'],
  };

  const authoritativeRankings = [
    {
      id: projCodeReviewId,
      projectId: projCodeReviewId,
      name: 'AI-Powered Code Review Assistant',
      relevanceScore: 94,
      status: 'SELECTED',
      matchedRequirements: ['Python', 'FastAPI', 'REST APIs'],
    },
    {
      id: projTaskMgrId,
      projectId: projTaskMgrId,
      name: 'Collaborative Task Manager',
      relevanceScore: 89,
      status: 'SELECTED',
      matchedRequirements: ['Node.js', 'PostgreSQL', 'REST APIs'],
    },
  ];

  it('1. Filters out repo description fragments and generates >= 3 accomplishment bullets', async () => {
    const proj = mockCandidateProfile.projects[1]; // AI-Powered Code Review Assistant
    const bullets = await defaultAiResumeContentGenerator.generateJobConditionedProjectBullets({
      project: proj,
      candidateProfile: mockCandidateProfile,
      targetJobPosting: sampleJob,
      projectFacts: [
        { text: 'Intelligent automated code review system integrating OpenAI API and FastAPI webhooks.', factType: 'feature-description' },
        ...proj.bullets.map((text, idx) => ({
          factId: `f-${idx + 1}`,
          text,
          factType: 'candidate-authored',
          technologies: proj.technologies,
        })),
      ],
      aiProvider: null, // Test deterministic path directly
    });

    assert.ok(Array.isArray(bullets), 'Must return an array of bullets');
    assert.strictEqual(bullets.length, 3, 'Must return exactly 3 bullets per the 3-bullet contract');

    for (const b of bullets) {
      assert.ok(!b.text.includes('Intelligent automated code review system integrating'),
        'Fragment description must NOT be included in generated bullets');
      assert.ok(b.text.endsWith('.'), `Bullet must end with period: "${b.text}"`);
      assert.ok(/^[A-Z][a-z]+/.test(b.text), `Bullet must start capitalized: "${b.text}"`);
    }
  });

  it('2. Enforces complete sentence structure and action verb openers via ResumeClaimValidationService', () => {
    const validator = new ResumeClaimValidationService();
    const factText = 'Engineered a Flask backend with asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations, ensuring high concurrency and application availability.';
    const context = {
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: projCodeReviewId,
      factInventory: [
        {
          factId: 'f-1',
          ownerType: 'PROJECT',
          ownerId: projCodeReviewId,
          sectionOwnerId: projCodeReviewId,
          text: factText,
          technologies: ['Python', 'FastAPI', 'Flask'],
          agencySource: 'CANDIDATE_AUTHORED',
          ownership: 'CANDIDATE',
        },
      ],
    };

    // Fragment test
    const fragmentResult = validator.validateClaim(
      { text: 'Intelligent automated code review system integrating OpenAI API and FastAPI webhooks.', factIds: ['f-1'] },
      context
    );
    assert.ok(!fragmentResult.valid, 'Fragment bullet must fail validation');
    assert.ok(
      fragmentResult.violations.some((v) => v.code === 'FRAGMENT_BULLET'),
      'Must record FRAGMENT_BULLET violation'
    );

    // Missing period test
    const missingPeriodResult = validator.validateClaim(
      { text: 'Engineered asynchronous FastAPI endpoints to handle real-time GitHub webhook integrations', factIds: ['f-1'] },
      context
    );
    assert.ok(!missingPeriodResult.valid, 'Bullet without ending punctuation must fail validation');
    assert.ok(
      missingPeriodResult.violations.some((v) => v.code === 'INCOMPLETE_SENTENCE'),
      'Must record INCOMPLETE_SENTENCE violation'
    );

    // Valid complete sentence accomplishment test
    const validResult = validator.validateClaim(
      { text: factText, factIds: ['f-1'] },
      context
    );
    assert.ok(validResult.valid, `Valid bullet must pass validation, got: ${JSON.stringify(validResult.violations)}`);
  });

  it('3. Fails closed with INSUFFICIENT_SOURCE_EVIDENCE if project has < 3 grounded facts', async () => {
    const thinProject = {
      id: 'thin-proj-1',
      name: 'Thin Project',
      technologies: ['Python'],
      bullets: [
        'Engineered a minimal Python CLI utility for file conversions.',
      ],
    };

    await assert.rejects(
      async () => {
        await defaultAiResumeContentGenerator.generateJobConditionedProjectBullets({
          project: thinProject,
          candidateProfile: mockCandidateProfile,
          targetJobPosting: sampleJob,
          projectFacts: thinProject.bullets.map((text, idx) => ({ factId: `f-${idx}`, text })),
          aiProvider: null,
        });
      },
      (err) => {
        return err.code === 'INSUFFICIENT_SOURCE_EVIDENCE' || /INSUFFICIENT_SOURCE_EVIDENCE/.test(err.message);
      },
      'Must throw INSUFFICIENT_SOURCE_EVIDENCE error when project has < 3 facts'
    );
  });

  it('4. Rejects unsupported technologies (AWS) in project bullet claims', () => {
    const validator = new ResumeClaimValidationService();
    const context = {
      sectionOwnerType: 'PROJECT',
      sectionOwnerId: projTaskMgrId,
      factInventory: [
        {
          factId: 'f-task-1',
          ownerType: 'PROJECT',
          ownerId: projTaskMgrId,
          sectionOwnerId: projTaskMgrId,
          text: 'Built a secure, full-stack task management platform with JWT authentication and PostgreSQL.',
          technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
          agencySource: 'CANDIDATE_AUTHORED',
          ownership: 'CANDIDATE',
        },
      ],
      candidateProfile: mockCandidateProfile, // Candidate has AWS in profile skills, but NOT in this project
    };

    const awsBulletResult = validator.validateClaim(
      { text: 'Deployed collaborative task manager on AWS ECS with RDS PostgreSQL.', factIds: ['f-task-1'] },
      context
    );

    assert.ok(!awsBulletResult.valid, 'Project bullet claiming ungrounded AWS must fail validation');
    assert.ok(
      awsBulletResult.violations.some((v) => v.code === 'UNAUTHORIZED_TECHNOLOGY'),
      'Must record UNAUTHORIZED_TECHNOLOGY for project bullet claiming AWS'
    );
  });

  it('5. ResumeLayoutEngine calibrates maxBulletsPerProject to 3 (never 2)', () => {
    const engine = new ResumeLayoutEngine();
    const budget = {
      printableHeightPt: 792,
      bodyBudgetPt: 650,
      marginPt: 37.4,
      targetPageCount: 1,
    };
    const model = {
      projectCount: 2,
      experienceCount: 1,
      skillCategoryCount: 4,
    };

    const layout = engine.calculateAdaptiveSpacing(model, budget, 'SINGLE_PAGE');
    assert.strictEqual(
      layout.maxBulletsPerProject,
      3,
      'ResumeLayoutEngine must assign maxBulletsPerProject = 3'
    );

    const calibrated = engine.calibrateLayoutFromMeasurement({
      targetPageCount: 1,
      overflowPt: 15,
      currentLayout: layout,
      budget,
      model,
    });
    assert.strictEqual(
      calibrated.maxBulletsPerProject,
      3,
      'Calibrated layout must preserve maxBulletsPerProject = 3'
    );
  });

  it('6. LatexDocumentGenerator does not trim project bullets below 3', () => {
    const generator = new LatexDocumentGenerator();
    const structuredResume = {
      candidateIdentity: {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanath.work01@gmail.com',
        phone: '+91 7905087928',
        location: 'Gorakhpur, India',
      },
      basics: {
        name: 'Vishwanath Nishad',
        email: 'vishwanath.work01@gmail.com',
        phone: '+91 7905087928',
        location: 'Gorakhpur, India',
      },
      summary: { text: 'Engineered robust software solutions across full-stack applications.' },
      skillsByCategory: {
        'Languages': [{ name: 'TypeScript' }, { name: 'Python' }],
        'Databases': [{ name: 'PostgreSQL' }],
      },
      projects: [
        {
          name: 'Collaborative Task Manager',
          bullets: [
            { text: 'Built a secure, full-stack task management platform with JWT-based authentication and RBAC.' },
            { text: 'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM.' },
            { text: 'Optimized complex PostgreSQL queries to support real-time multi-user task updates.' },
          ],
        },
        {
          name: 'AI-Powered Code Review Assistant',
          bullets: [
            { text: 'Developed an automated code review system by integrating OpenAI API to analyze pull requests.' },
            { text: 'Engineered a Flask backend with asynchronous FastAPI endpoints to handle webhook events.' },
            { text: 'Reduced manual review turnaround time by automating code style and syntax evaluations.' },
          ],
        },
      ],
      education: [
        { institution: 'Madan Mohan Malaviya University of Technology', degree: 'B.Tech' },
      ],
    };

    const latex = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume },
      layoutOverrides: { maxBulletsPerProject: 2 }, // Even if layout requests 2, minimum 3 must be honored
    }).texContent;

    // Count \item entries in the Technical Projects section
    const projSectionMatch = latex.match(/\\atssection\{Technical Projects\}([\s\S]*?)(?:\\atssection|$)/);
    assert.ok(projSectionMatch, 'Must generate Technical Projects section');
    const itemMatches = projSectionMatch[1].match(/\\item\s/g) || [];
    assert.strictEqual(
      itemMatches.length,
      6,
      'Must render exactly 6 bullets in total (3 bullets per project × 2 projects)'
    );
  });

  it('7. End-to-end: Snapshot produces 2 projects with >= 3 bullets each (total >= 6 bullets)', () => {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: mockCandidateProfile,
      jobPosting: sampleJob,
      options: {
        projectRankings: authoritativeRankings,
      },
    });

    const renderedProjects = snapshot.structuredResume.projects;
    assert.strictEqual(renderedProjects.length, 2, 'Must render exactly 2 selected projects');

    let totalBullets = 0;
    for (const p of renderedProjects) {
      assert.ok(p.bullets.length >= 3, `Project "${p.name}" must have >= 3 bullets, got ${p.bullets.length}`);
      totalBullets += p.bullets.length;

      for (const b of p.bullets) {
        const text = typeof b === 'string' ? b : b.text;
        assert.ok(!text.includes('Intelligent automated code review system integrating'),
          'Fragment description must NOT appear in final resume bullets');
        assert.ok(!text.includes('Real-time collaborative task manager built with'),
          'Fragment description must NOT appear in final resume bullets');
        assert.ok(text.endsWith('.'), `Bullet must end with period: "${text}"`);
      }
    }
    assert.ok(totalBullets >= 6, `Total bullets must be >= 6, got ${totalBullets}`);
  });
});
