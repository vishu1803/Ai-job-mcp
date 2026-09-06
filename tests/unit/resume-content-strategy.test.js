/**
 * @file Unit Tests: Resume Content Strategy Redesign (P14-007)
 *
 * Verifies:
 * 1. Low-value tooling noise (Cypress, ESLint, Vite, Tailwind CSS) omitted for backend roles.
 * 2. Core backend technologies dynamically categorized.
 * 3. Provenance truth strictly preserved in skill audit.
 * 4. Rich backend projects outrank generic/toy repositories.
 * 5. Repository names containing job keywords never grant capability points.
 * 6. Projects without authentic bullets/evidence are rejected.
 * 7. Archived projects are rejected but auditable.
 * 8. Zero-evidence/zero-bullet repositories are rejected with clear audit reason.
 * 9. Deterministic project-selection audit with score components.
 * 10. Deterministic skill-selection audit with category and reason.
 * 11. Project diversity is a secondary tie-breaker only.
 * 12. Authentic technical bullets preserved in selectedProjects and portfolioLinks.
 * 13. Generic filler phrase is forbidden in audits.
 * 14. Professional summary remains concise and does not duplicate full skills list.
 * 15. FTV Saloon experience remains prominent with authentic bullets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('Resume Content Strategy Redesign (P14-007)', () => {
  const service = new CandidateArtifactContentService();

  const vercelBackendJob = {
    id: 'job-vercel-backend-001',
    source: 'GREENHOUSE',
    company: 'Vercel',
    title: 'Software Engineer, Backend',
    location: 'Remote',
    description:
      'We are looking for a Backend Software Engineer to design, build, and scale high-throughput REST APIs and backend microservices using Node.js, TypeScript, and PostgreSQL.',
    responsibilities: [
      'Architect and maintain high-reliability backend services and RESTful APIs',
      'Optimize complex PostgreSQL database queries and schemas',
      'Ensure secure authentication and robust distributed systems design',
    ],
    requirements: [
      'Strong experience with Node.js, TypeScript, or Python',
      'Deep experience with relational databases (PostgreSQL preferred)',
      'REST API design, asynchronous event handling, and modular service architecture',
    ],
    skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'REST APIs', 'FastAPI'],
    applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/1234567',
    retrievedAt: '2026-09-06T00:00:00Z',
  };

  const sampleCandidateData = {
    displayName: 'Vishwanath Nishad',
    email: 'vishwanatnishad@gmail.com',
    phone: '7905087928',
    location: 'Gorakhpur',
    headline: 'Backend Software Engineer',
    summary:
      'Backend engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI) and Node.js, leveraging PostgreSQL and modular service design.',
    jobKeywords: ['backend', 'node.js', 'typescript', 'postgresql', 'api', 'rest', 'fastapi'],
    jobPosting: vercelBackendJob,
    skills: [
      { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
      { name: 'FastAPI', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
      { name: 'TypeScript', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
      { name: 'Node.js', provenanceStatus: 'VERIFIED', evidenceCount: 14 },
      { name: 'Prisma ORM', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
      { name: 'Docker', provenanceStatus: 'VERIFIED', evidenceCount: 4 },
      { name: 'Git', provenanceStatus: 'VERIFIED', evidenceCount: 20 },
      { name: 'ESLint', provenanceStatus: 'VERIFIED', evidenceCount: 20 },
      { name: 'Cypress', provenanceStatus: 'VERIFIED', evidenceCount: 18 },
      { name: 'Vite', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
      { name: 'Tailwind CSS', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
      { name: 'Django', provenanceStatus: 'CLAIMED' },
      { name: 'Flask', provenanceStatus: 'CLAIMED' },
      { name: 'AWS', provenanceStatus: 'SELF_DECLARED' },
    ],
    experience: [
      {
        title: 'Full Stack Developer Intern',
        company: 'FTV Saloon',
        startDate: '2024-06',
        endDate: '2024-09',
        isCurrent: false,
        location: 'Remote',
        bullets: [
          'Designed and implemented robust RESTful APIs for core salon operations.',
          'Optimized critical backend database queries, resulting in a 40% reduction in page load time.',
          'Built secure role-based access control (RBAC) middleware for multi-tenant administrative portals.',
          'Maintained 85%+ test coverage across backend endpoints using Jest.',
        ],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Technology in Electronics Engineering',
        institution: 'Rajkiya Engineering College',
        startDate: '2021',
        endDate: '2025-07',
        isCurrent: false,
        coursework: ['Data Structures & Algorithms', 'Operating Systems', 'DBMS'],
      },
    ],
    projects: [
      {
        name: 'Collaborative Task Manager',
        title: 'Collaborative Task Manager',
        repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
        liveUrl: 'https://collaborative-task-manager-fc26.vercel.app/',
        summary: 'Full-stack collaborative project management platform.',
        technologies: ['Node.js', 'Prisma', 'PostgreSQL', 'Next.js', 'TypeScript'],
        bullets: [
          'Engineered a full-stack project tracking application with Next.js, Prisma, and PostgreSQL, implementing complete CRUD workflows and role-based access control.',
          'Built RESTful API endpoints and integrated responsive front-end interfaces with live demo deployment.',
          'Designed relational data schemas and managed migrations using Prisma ORM with PostgreSQL backend.',
        ],
        evidenceCount: 34,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
      },
      {
        name: 'AI-Powered Code Review Assistant',
        title: 'AI-Powered Code Review Assistant',
        repositoryUrl: 'https://github.com/vishu1803/Ai-powered-code-review-assistant',
        liveUrl: null,
        summary: 'Automated GitHub pull request code review service.',
        technologies: ['Python', 'Flask', 'FastAPI', 'Next.js', 'OpenAI API', 'GitHub'],
        bullets: [
          'Architected an asynchronous PR review pipeline using FastAPI, Python, and OpenAI API, analyzing pull requests with automated feedback.',
          'Implemented modular webhook receiver architecture to process GitHub events with sub-2-second latency.',
          'Integrated secure API key handling and customizable prompt configurations for enterprise code standards.',
        ],
        evidenceCount: 33,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
      },
      {
        name: 'Python-projects',
        title: 'Python-projects',
        repositoryUrl: 'https://github.com/vishu1803/Python-projects',
        summary: '',
        technologies: ['Python'],
        bullets: [],
        evidenceCount: 0,
        isArchived: false,
      },
      {
        name: 'Object-detection-web-app',
        title: 'Object-detection-web-app',
        repositoryUrl: 'https://github.com/vishu1803/Object-detection-web-app',
        summary: 'Computer vision web application using OpenCV and Streamlit.',
        technologies: ['Python', 'OpenCV', 'Streamlit'],
        bullets: ['Built a simple camera object detection prototype.'],
        evidenceCount: 1,
        isArchived: false,
      },
      {
        name: 'vishu1803/Ai-job-mcp-archived',
        title: 'vishu1803/Ai-job-mcp-archived',
        repositoryUrl: 'https://github.com/vishu1803/Ai-job-mcp',
        summary: 'Archived duplicate row.',
        technologies: ['Node.js'],
        bullets: [],
        evidenceCount: 0,
        isArchived: true,
      },
    ],
  };

  it('1. low-value tooling noise is omitted from backend resume and audited', () => {
    const { categorizedSkills, skillAudit } = service.selectAndCategorizeSkillsForJob(
      sampleCandidateData,
      vercelBackendJob
    );

    const allPresentedSkills = Object.values(categorizedSkills).flat();
    assert.ok(!allPresentedSkills.includes('ESLint'), 'ESLint must be omitted');
    assert.ok(!allPresentedSkills.includes('Cypress'), 'Cypress must be omitted');
    assert.ok(!allPresentedSkills.includes('Vite'), 'Vite must be omitted');
    assert.ok(!allPresentedSkills.includes('Tailwind CSS'), 'Tailwind CSS must be omitted');

    const eslintAudit = skillAudit.find((s) => s.skill === 'ESLint');
    assert.ok(eslintAudit);
    assert.equal(eslintAudit.status, 'OMITTED');
    assert.ok(eslintAudit.reason.includes('tooling noise'));

    const cypressAudit = skillAudit.find((s) => s.skill === 'Cypress');
    assert.ok(cypressAudit);
    assert.equal(cypressAudit.status, 'OMITTED');
  });

  it('2. core backend technologies are selected and dynamically categorized', () => {
    const { categorizedSkills } = service.selectAndCategorizeSkillsForJob(
      sampleCandidateData,
      vercelBackendJob
    );

    assert.ok(categorizedSkills['Databases & ORMs']);
    assert.ok(categorizedSkills['Databases & ORMs'].includes('PostgreSQL'));
    assert.ok(categorizedSkills['Databases & ORMs'].includes('Prisma ORM'));

    assert.ok(categorizedSkills['Backend & APIs']);
    assert.ok(categorizedSkills['Backend & APIs'].includes('FastAPI'));
    assert.ok(categorizedSkills['Backend & APIs'].includes('Node.js'));

    assert.ok(categorizedSkills['Languages']);
    assert.ok(categorizedSkills['Languages'].includes('TypeScript'));
  });

  it('3. skill provenance truth remains strictly accurate and auditable', () => {
    const { skillAudit } = service.selectAndCategorizeSkillsForJob(
      sampleCandidateData,
      vercelBackendJob
    );

    const pg = skillAudit.find((s) => s.skill === 'PostgreSQL');
    assert.equal(pg.provenance, 'VERIFIED');

    const django = skillAudit.find((s) => s.skill === 'Django');
    assert.equal(django.provenance, 'CLAIMED');

    const aws = skillAudit.find((s) => s.skill === 'AWS');
    assert.equal(aws.provenance, 'SELF_DECLARED');
  });

  it('4. rich backend projects outrank generic and toy repositories', () => {
    const ranked = service.rankProjectsForJob(sampleCandidateData, vercelBackendJob);
    const selected = ranked.selectedProjects;

    assert.equal(selected.length, 2);
    const names = selected.map((p) => p.name);
    assert.ok(names.includes('Collaborative Task Manager'));
    assert.ok(names.includes('AI-Powered Code Review Assistant'));
    assert.ok(!names.includes('Python-projects'));
    assert.ok(!names.includes('Object-detection-web-app'));
  });

  it('5. repository name containing keywords alone does NOT grant technical capability points', () => {
    const candidateWithKeywordRepo = {
      ...sampleCandidateData,
      projects: [
        {
          name: 'backend-rest-api-postgresql-microservice',
          repositoryUrl: 'https://github.com/vishu1803/backend-rest-api-postgresql-microservice',
          summary: '',
          technologies: [],
          bullets: [],
          evidenceCount: 0,
        },
      ],
    };

    const ranked = service.rankProjectsForJob(candidateWithKeywordRepo, vercelBackendJob);
    const auditItem = ranked.selectionAudit.find(
      (a) => a.projectName === 'backend-rest-api-postgresql-microservice'
    );
    assert.equal(auditItem.status, 'REJECTED');
    assert.equal(auditItem.score, 0);
  });

  it('6. projects lacking authentic bullets or evidence are rejected', () => {
    const ranked = service.rankProjectsForJob(sampleCandidateData, vercelBackendJob);
    const pythonProjAudit = ranked.selectionAudit.find((a) => a.projectName === 'Python-projects');
    assert.equal(pythonProjAudit.status, 'REJECTED');
    assert.ok(pythonProjAudit.rejectionReason.includes('Zero repository evidence'));
  });

  it('7. archived projects are never selected but preserved in audit', () => {
    const ranked = service.rankProjectsForJob(sampleCandidateData, vercelBackendJob);
    const archivedAudit = ranked.selectionAudit.find(
      (a) => a.projectName === 'vishu1803/Ai-job-mcp-archived'
    );
    assert.ok(archivedAudit);
    assert.equal(archivedAudit.status, 'REJECTED');
    assert.ok(archivedAudit.rejectionReason.includes('archived'));
  });

  it('8. deterministic project-selection audit outputs score components and reasons', () => {
    const ranked = service.rankProjectsForJob(sampleCandidateData, vercelBackendJob);
    assert.ok(ranked.selectionAudit.length >= 4);

    for (const item of ranked.selectionAudit) {
      assert.ok(item.projectName);
      assert.equal(typeof item.score, 'number');
      assert.ok(item.scoreComponents);
      assert.equal(typeof item.scoreComponents.evidenceQuality, 'number');
      assert.equal(typeof item.scoreComponents.technicalDepth, 'number');
      assert.equal(typeof item.scoreComponents.roleRelevance, 'number');
      assert.equal(typeof item.scoreComponents.technologyOverlap, 'number');
      assert.ok(['SELECTED', 'REJECTED'].includes(item.status));
    }
  });

  it('9. project diversity acts as a secondary tie-breaker only', () => {
    const ranked = service.rankProjectsForJob(sampleCandidateData, vercelBackendJob);
    const aiReview = ranked.selectionAudit.find(
      (a) => a.projectName === 'AI-Powered Code Review Assistant'
    );
    assert.equal(aiReview.scoreComponents.diversityTieBreaker, 3);
  });

  it('10. authentic technical bullets from candidate records are preserved in resume', () => {
    const resume = service.buildTailoredResumeMarkdown(sampleCandidateData, vercelBackendJob);
    assert.ok(
      resume.markdownContent.includes(
        'Engineered a full-stack project tracking application with Next.js, Prisma, and PostgreSQL'
      )
    );
    assert.ok(
      resume.markdownContent.includes(
        'Architected an asynchronous PR review pipeline using FastAPI, Python, and OpenAI API'
      )
    );
  });

  it('11. generic filler "Evidence-backed project referenced in tailored documents" is forbidden', () => {
    const badContent = '### Project\n- Evidence-backed project referenced in tailored documents\n';
    const audit = CandidateArtifactContentService.auditDocumentContent(badContent);
    assert.equal(audit.passed, false);
    assert.ok(audit.violations.some((v) => v.includes('Forbidden placeholder content')));

    const latexAudit = LatexDocumentGenerator.auditLatexContent(badContent);
    assert.equal(latexAudit.passed, false);
  });

  it('12. professional summary remains concise and does not duplicate full skills list', () => {
    const resume = service.buildTailoredResumeMarkdown(sampleCandidateData, vercelBackendJob);
    const summaryMatch = resume.markdownContent.match(
      /## Professional Summary\n+([\s\S]*?)(?=\n+##)/
    );
    assert.ok(summaryMatch);
    const summaryText = summaryMatch[1].trim();
    assert.ok(summaryText.length < 300, 'Summary must remain concise');
    assert.doesNotMatch(summaryText, /\bLanguages:\b/i);
    assert.doesNotMatch(summaryText, /\bCypress\b/i);
  });

  it('13. FTV Saloon experience remains prominent with authentic stored bullets', () => {
    const resume = service.buildTailoredResumeMarkdown(sampleCandidateData, vercelBackendJob);
    assert.ok(resume.markdownContent.includes('Full Stack Developer Intern — FTV Saloon'));
    assert.ok(
      resume.markdownContent.includes(
        'Designed and implemented robust RESTful APIs for core salon operations.'
      )
    );
    assert.ok(resume.markdownContent.includes('40% reduction in page load time'));
  });

  it('14. resume information architecture hierarchy is Header -> Summary -> Technical Skills -> Projects -> Experience -> Education', () => {
    const resume = service.buildTailoredResumeMarkdown(sampleCandidateData, vercelBackendJob);
    const content = resume.markdownContent;

    const summaryIdx = content.indexOf('## Professional Summary');
    const skillsIdx = content.indexOf('## Technical Skills');
    const projectsIdx = content.indexOf('## Technical Projects');
    const expIdx = content.indexOf('## Professional Experience');
    const eduIdx = content.indexOf('## Education');

    assert.ok(summaryIdx !== -1, 'Summary present');
    assert.ok(skillsIdx !== -1, 'Skills present');
    assert.ok(projectsIdx !== -1, 'Projects present');
    assert.ok(expIdx !== -1, 'Experience present');
    assert.ok(eduIdx !== -1, 'Education present');

    assert.ok(summaryIdx < skillsIdx, 'Summary precedes Skills');
    assert.ok(skillsIdx < projectsIdx, 'Skills precede Projects');
    assert.ok(projectsIdx < expIdx, 'Projects precede Experience');
    assert.ok(expIdx < eduIdx, 'Experience precedes Education');
  });

  it('15. cover letter cites authentic top projects and truthfully separates verified from claimed skills', () => {
    const letter = service.buildCoverLetterMarkdown(sampleCandidateData, vercelBackendJob);
    const content = letter.markdownContent;

    assert.ok(
      content.includes('Collaborative Task Manager'),
      'Must cite Collaborative Task Manager'
    );
    assert.ok(
      content.includes('AI-Powered Code Review Assistant'),
      'Must cite AI-Powered Code Review Assistant'
    );
    assert.ok(content.includes('verified proficiency in'), 'Must mention verified proficiency');
    assert.ok(
      content.includes('practical experience with'),
      'Must mention claimed practical experience'
    );
    assert.doesNotMatch(content, /Each of these skills is verified/i);
  });
});
