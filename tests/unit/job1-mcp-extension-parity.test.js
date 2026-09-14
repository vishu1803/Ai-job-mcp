/**
 * @file Unit Test: Job 1 MCP vs Extension Cross-Surface Parity
 *
 * Verifies that both Extension (JobApplicationWorkflowService.prepareJobApplication)
 * and MCP (handleGenerateTailoredResume) consume the SAME canonical tailored-resume
 * workflow for Job 1 and produce semantically identical:
 * - project IDs and ordering
 * - project names
 * - skills, categories, and ordering
 * - professional summary text
 * - deterministic SHA-256 semantic fingerprint
 *
 * Also verifies that cross-surface semantic mismatches fail deterministically.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, db } from '../../src/db/index.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { handleGenerateTailoredResume } from '../../src/mcp/tools/career-artifact-tools.js';
import {
  computeResumeSemanticFingerprint,
  freezeSemanticResume,
} from '../../src/services/structured-resume.service.js';

describe('Job 1 MCP vs Extension Parity Regression Test', () => {
  const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const mcpContext = {
    tenantId: '24d53f53-780e-4431-b065-32180c354175',
    userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
    role: 'OWNER',
  };

  const job1Desc = `Build and maintain production web applications across the frontend and backend stack.

Responsibilities:
- Build responsive web applications using React and Next.js.
- Develop backend services and REST APIs using Node.js and Express.js.
- Design and consume PostgreSQL-backed data services.
- Write maintainable TypeScript and JavaScript.
- Improve frontend and backend performance.
- Participate in code reviews and engineering design discussions.
- Maintain automated tests and reliable development workflows.
- Collaborate with product, QA and backend/DevOps engineers.

Requirements:
- React
- Next.js
- TypeScript
- JavaScript
- Node.js
- Express.js
- REST APIs
- PostgreSQL
- Git`;

  const job1Posting = {
    id: 'job-1-fullstack',
    key: 'job1_fullstack',
    title: 'Senior Full-Stack Developer — React / Node.js / PostgreSQL',
    company: 'Vercel / NextStack',
    companyName: 'Vercel / NextStack',
    description: job1Desc,
    requirements: [
      'React',
      'Next.js',
      'TypeScript',
      'JavaScript',
      'Node.js',
      'Express.js',
      'REST APIs',
      'PostgreSQL',
      'Git',
    ],
    skills: [
      'React',
      'Next.js',
      'TypeScript',
      'JavaScript',
      'Node.js',
      'Express.js',
      'REST APIs',
      'PostgreSQL',
      'Git',
    ],
  };

  let workflowService;

  before(() => {
    workflowService = new JobApplicationWorkflowService({ database: db });
  });

  after(async () => {
    await pool.end();
  });

  it('produces semantically identical output across Extension and MCP for Job 1', async () => {
    // 1. Run canonical workflow via Extension surface
    const extPrep = await workflowService.prepareJobApplication({
      tenantId: mcpContext.tenantId,
      candidateId: CANDIDATE_ID,
      jobPosting: job1Posting,
    });
    const extStructured = extPrep.tailoredResume?.structuredResume;
    assert.ok(extStructured, 'Extension must produce structuredResume');

    // 2. Run MCP tool surface
    const mcpResult = await handleGenerateTailoredResume(
      mcpContext,
      {
        candidateId: CANDIDATE_ID,
        jobTitle: job1Posting.title,
        companyName: job1Posting.companyName,
        jobDescriptionText: job1Desc,
        requirements: job1Posting.requirements,
        skills: job1Posting.skills,
      },
      { db, workflowService }
    );
    assert.ok(mcpResult.resume, 'MCP result must contain resume');
    assert.ok(mcpResult.structuredResume, 'MCP result must contain canonical structuredResume snapshot');

    // 3. Project IDs and ordering parity
    const extProjectIds = extStructured.projects.map((p) => p.projectId);
    const mcpStructuredProjectIds = mcpResult.structuredResume.projects.map((p) => p.projectId);
    const mcpEnvelopeProjectIds = mcpResult.resume.projects.map((p) => p.projectId);

    const expectedProjectIds = [
      '389d1357-156a-4296-a1bb-603140897bc3', // Collaborative Task Manager
      'ea5137c3-2f7f-4e29-a884-28ff3c659ebf', // AI-Powered Code Review Assistant
    ];
    assert.deepStrictEqual(extProjectIds, expectedProjectIds, 'Extension must select authoritative top-2 projects');
    assert.deepStrictEqual(mcpStructuredProjectIds, expectedProjectIds, 'MCP structuredResume must match expected project IDs');
    assert.deepStrictEqual(mcpEnvelopeProjectIds, expectedProjectIds, 'MCP resume envelope must match expected project IDs');

    // 4. Project Names parity
    const extProjectNames = extStructured.projects.map((p) => p.name || p.displayName);
    const mcpProjectNames = mcpResult.resume.projects.map((p) => p.name || p.displayName);
    const expectedProjectNames = ['Collaborative Task Manager', 'AI-Powered Code Review Assistant'];
    assert.deepStrictEqual(extProjectNames, expectedProjectNames, 'Extension project names must match canonical names');
    assert.deepStrictEqual(mcpProjectNames, expectedProjectNames, 'MCP project names must match Extension project names');

    // 5. Skills, categories, and ordering parity
    const extSkillCategories = extStructured.skills.categories.map((c) => ({
      categoryName: c.categoryName,
      skills: c.skills.map((s) => s.name),
    }));
    const mcpStructuredSkillCategories = mcpResult.structuredResume.skills.categories.map((c) => ({
      categoryName: c.categoryName,
      skills: c.skills.map((s) => s.name),
    }));
    const mcpEnvelopeSkillCategories = mcpResult.resume.skills.map((c) => ({
      categoryName: c.category,
      skills: c.skills.map((s) => s.skillName),
    }));

    assert.deepStrictEqual(
      mcpStructuredSkillCategories,
      extSkillCategories,
      'MCP structuredResume skill categories must exactly match Extension'
    );
    assert.deepStrictEqual(
      mcpEnvelopeSkillCategories,
      extSkillCategories,
      'MCP envelope skill categories must exactly match Extension'
    );

    // Total skills count parity (12 candidate skills in 5 categories)
    const totalExtSkills = extSkillCategories.reduce((sum, c) => sum + c.skills.length, 0);
    const totalMcpSkills = mcpEnvelopeSkillCategories.reduce((sum, c) => sum + c.skills.length, 0);
    assert.strictEqual(totalExtSkills, 12, 'Must have 12 candidate skills');
    assert.strictEqual(totalMcpSkills, 12, 'MCP must have 12 candidate skills');

    // 6. Professional Summary text parity
    const extSummary = extStructured.summary?.text;
    const mcpStructuredSummary = mcpResult.structuredResume.summary?.text;
    const mcpEnvelopeSummary = mcpResult.resume.basics.summary;

    assert.ok(extSummary && extSummary.length > 50, 'Extension summary must be populated');
    assert.strictEqual(mcpStructuredSummary, extSummary, 'MCP structuredResume summary must match Extension summary');
    assert.strictEqual(mcpEnvelopeSummary, extSummary, 'MCP resume envelope summary must match Extension summary');

    // 6b. Target role heading parity
    assert.strictEqual(
      extStructured.targetRole,
      'Full-Stack Developer',
      'Extension targetRole must be conditioned to Full-Stack Developer'
    );
    assert.strictEqual(
      mcpResult.jobTitle,
      extStructured.targetRole,
      'MCP jobTitle must match Extension targetRole'
    );
    assert.strictEqual(
      mcpResult.structuredResume.targetRole,
      extStructured.targetRole,
      'MCP structuredResume targetRole must match Extension targetRole'
    );

    // 7. Deterministic SHA-256 semantic fingerprint parity
    const extFingerprint = computeResumeSemanticFingerprint(extStructured);
    const mcpStructuredFingerprint = computeResumeSemanticFingerprint(mcpResult.structuredResume);
    const mcpResultFingerprint = computeResumeSemanticFingerprint(mcpResult);

    assert.ok(extFingerprint && extFingerprint.length === 64, 'Extension fingerprint must be 64-character SHA-256');
    assert.strictEqual(
      mcpStructuredFingerprint,
      extFingerprint,
      'MCP structuredResume fingerprint must be identical to Extension'
    );
    assert.strictEqual(
      mcpResultFingerprint,
      extFingerprint,
      'MCP tool output fingerprint must be identical to Extension'
    );
  });

  it('fails on any simulated cross-surface semantic mismatch', () => {
    const canonicalSnapshot = {
      projects: [
        { projectId: '95a13c93-a198-4473-bf64-5b8a50cbd3b9', name: 'Product Data Explorer' },
        { projectId: '389d1357-156a-4296-a1bb-603140897bc3', name: 'Collaborative Task Manager' },
      ],
      selectedSkillSlugs: ['typescript', 'react', 'next-js', 'node-js', 'postgresql'],
      skills: {
        categories: [
          {
            categoryName: 'Frontend & Web',
            skills: [
              { slug: 'react', name: 'React' },
              { slug: 'next-js', name: 'Next.js' },
            ],
          },
          {
            categoryName: 'Languages',
            skills: [{ slug: 'typescript', name: 'TypeScript' }],
          },
        ],
      },
      summary: {
        text: 'Full-Stack Engineer with verified competencies in React and TypeScript.',
        composedFromFactIds: ['fact-1', 'fact-2'],
      },
      experience: [],
      education: [],
      sectionOrder: ['HEADER', 'SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'],
    };

    const baseFingerprint = computeResumeSemanticFingerprint(canonicalSnapshot);

    // Mismatch 1: Project re-ordering or alternate selection
    const alteredProjectsSnapshot = {
      ...canonicalSnapshot,
      projects: [
        { projectId: '389d1357-156a-4296-a1bb-603140897bc3', name: 'Collaborative Task Manager' },
        { projectId: '95a13c93-a198-4473-bf64-5b8a50cbd3b9', name: 'Product Data Explorer' },
      ],
    };
    const alteredProjectsFingerprint = computeResumeSemanticFingerprint(alteredProjectsSnapshot);
    assert.notStrictEqual(
      alteredProjectsFingerprint,
      baseFingerprint,
      'Re-ordered projects must alter semantic fingerprint'
    );

    // Mismatch 2: Summary text drift
    const alteredSummarySnapshot = {
      ...canonicalSnapshot,
      summary: {
        ...canonicalSnapshot.summary,
        text: 'Generic software developer with unspecified skills.',
      },
    };
    const alteredSummaryFingerprint = computeResumeSemanticFingerprint(alteredSummarySnapshot);
    assert.notStrictEqual(
      alteredSummaryFingerprint,
      baseFingerprint,
      'Altered summary text must alter semantic fingerprint'
    );

    // Mismatch 3: Skill vocabulary or category change
    const alteredSkillsSnapshot = {
      ...canonicalSnapshot,
      selectedSkillSlugs: ['typescript', 'react', 'rust'],
      skills: {
        categories: [
          {
            categoryName: 'Languages',
            skills: [
              { slug: 'typescript', name: 'TypeScript' },
              { slug: 'rust', name: 'Rust' },
            ],
          },
        ],
      },
    };
    const alteredSkillsFingerprint = computeResumeSemanticFingerprint(alteredSkillsSnapshot);
    assert.notStrictEqual(
      alteredSkillsFingerprint,
      baseFingerprint,
      'Altered skill selection must alter semantic fingerprint'
    );
  });
});
