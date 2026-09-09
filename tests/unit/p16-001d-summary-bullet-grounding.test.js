/**
 * @file Unit Tests: P16-001D — Job-Tailored Summary & Evidence-Grounded Bullets (Batch 4).
 *
 * Verifies:
 * - Test A: Backend job produces backend-focused summary.
 * - Test B: Frontend job produces frontend/full-stack-focused summary.
 * - Test C: Same candidate receives different summaries for different jobs.
 * - Test D: Summary only references candidate-owned skills/projects.
 * - Test E: Fabricated technology is rejected.
 * - Test F: Fabricated metric is rejected (40% reduction, 1000 users, 99.9% availability, 10M requests, 5-person team).
 * - Test G: Fabricated experience / tenure claim is rejected.
 * - Test H: Relevant project bullets are prioritized for target job.
 * - Test I: Irrelevant project bullets are not preferred when relevant evidence exists.
 * - Test J: Rephrasing preserves factual meaning.
 * - Test K: Generated bullet carries evidenceRefs.
 * - Test L: Matched requirement IDs are preserved.
 * - Test M: Missing evidence causes fail-closed behavior.
 * - Test N: Candidate source data is not mutated.
 * - Test O: Same inputs produce deterministic structured output.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateGroundedSummary,
  selectAndRephraseProjectBullets,
  assertMetricSafety,
  validateRephrasingSafety,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('P16-001D: Job-Tailored Summary & Evidence-Grounded Bullets', () => {
  const backendJob = {
    id: 'job-backend-001',
    title: 'Senior Backend Engineer',
    company: 'Cloudflare',
    description: 'Build robust, scalable backend APIs, database persistence layers, and distributed services using Python, FastAPI, and PostgreSQL.',
    requirements: [
      'req-b1: Extensive experience with Python and FastAPI',
      'req-b2: Deep expertise in relational databases and PostgreSQL query optimization',
      'req-b3: RESTful API design and asynchronous distributed architecture',
    ],
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'REST APIs'],
    recommendedProjects: ['AI-Powered Code Review Assistant'],
  };

  const frontendJob = {
    id: 'job-frontend-001',
    title: 'Senior Frontend & UI Engineer',
    company: 'Vercel',
    description: 'Design and deliver responsive, high-performance web applications using React, TypeScript, Next.js, and modern state management.',
    requirements: [
      'req-f1: Strong proficiency with React, TypeScript, and modern component lifecycle',
      'req-f2: Experience with Next.js and server-side rendering',
      'req-f3: Building accessible, performant UI with Tailwind CSS and responsive layout systems',
    ],
    skills: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
    recommendedProjects: ['Collaborative Task Manager'],
  };

  const sampleCandidate = {
    id: 'cand-vishw-001',
    name: 'Vishwanath Nishad',
    headline: 'Software Engineer',
    canonicalEmail: 'vishwanatnishad@gmail.com',
    phone: '7905087928',
    location: 'Remote',
    summary: 'Full-stack software developer with hands-on experience building backend APIs and modern frontend interfaces.',
    skills: [
      { name: 'Python', slug: 'python', provenanceStatus: 'VERIFIED', evidenceCount: 15, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0001' },
      { name: 'FastAPI', slug: 'fastapi', provenanceStatus: 'VERIFIED', evidenceCount: 12, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0002' },
      { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED', evidenceCount: 10, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0003' },
      { name: 'Node.js', slug: 'node-js', provenanceStatus: 'VERIFIED', evidenceCount: 14, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0004' },
      { name: 'React', slug: 'react', provenanceStatus: 'VERIFIED', evidenceCount: 18, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0005' },
      { name: 'TypeScript', slug: 'typescript', provenanceStatus: 'VERIFIED', evidenceCount: 16, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0006' },
      { name: 'Next.js', slug: 'next-js', provenanceStatus: 'VERIFIED', evidenceCount: 12, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0007' },
      { name: 'Tailwind CSS', slug: 'tailwind-css', provenanceStatus: 'VERIFIED', evidenceCount: 10, evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0008' },
    ],
    projects: [
      {
        id: 'proj-backend-review',
        projectId: 'proj-backend-review',
        name: 'AI-Powered Code Review Assistant',
        displayName: 'AI-Powered Code Review Assistant',
        technologies: ['FastAPI', 'Python', 'PostgreSQL', 'GitHub APIs'],
        provenanceStatus: 'VERIFIED',
        relevanceScore: 92,
        bullets: [
          {
            text: 'Architected an asynchronous PR review pipeline using FastAPI, Python, and OpenAI API.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0011', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0011', sourceLocation: { filePath: 'src/analyzer.py' } }],
            matchedRequirementIds: ['req-b1', 'req-b3'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Optimized PostgreSQL database queries and schemas for repository indexing and commit diffs.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0012', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0012', sourceLocation: { filePath: 'src/db.py' } }],
            matchedRequirementIds: ['req-b2'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Configured basic Docker container scripts for local developer environment setup.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0013', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0013', sourceLocation: { filePath: 'Dockerfile' } }],
            matchedRequirementIds: [],
            provenanceStatus: 'VERIFIED',
          },
        ],
        evidence: [
          { id: 'e810a976-a070-4f61-a8cf-432d561a0011', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0011', skillSlug: 'fastapi', sourceLocation: { filePath: 'src/analyzer.py' } },
          { id: 'e810a976-a070-4f61-a8cf-432d561a0012', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0012', skillSlug: 'postgresql', sourceLocation: { filePath: 'src/db.py' } },
        ],
      },
      {
        id: 'proj-frontend-task',
        projectId: 'proj-frontend-task',
        name: 'Collaborative Task Manager',
        displayName: 'Collaborative Task Manager',
        technologies: ['React', 'TypeScript', 'Next.js', 'Tailwind CSS'],
        provenanceStatus: 'VERIFIED',
        relevanceScore: 88,
        bullets: [
          {
            text: 'Developed reactive Kanban board with drag-and-drop state management using React and TypeScript.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0021', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0021', sourceLocation: { filePath: 'src/board.tsx' } }],
            matchedRequirementIds: ['req-f1'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Designed accessible responsive UI components using Next.js and Tailwind CSS styling.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0022', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0022', sourceLocation: { filePath: 'src/components.tsx' } }],
            matchedRequirementIds: ['req-f2', 'req-f3'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Configured local SQLite database for offline task persistence.',
            evidenceRefs: [{ id: 'e810a976-a070-4f61-a8cf-432d561a0023', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0023', sourceLocation: { filePath: 'src/db.ts' } }],
            matchedRequirementIds: [],
            provenanceStatus: 'VERIFIED',
          },
        ],
        evidence: [
          { id: 'e810a976-a070-4f61-a8cf-432d561a0021', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0021', skillSlug: 'react', sourceLocation: { filePath: 'src/board.tsx' } },
          { id: 'e810a976-a070-4f61-a8cf-432d561a0022', evidenceId: 'e810a976-a070-4f61-a8cf-432d561a0022', skillSlug: 'typescript', sourceLocation: { filePath: 'src/components.tsx' } },
        ],
      },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'FTV Saloon',
        title: 'Software Developer',
        startDate: '2023-03-01',
        endDate: '2024-06-30',
        bullets: ['Implemented backend APIs with Node.js and PostgreSQL.'],
      },
    ],
  };

  it('Test A: Backend job produces backend-focused summary', () => {
    const summary = generateGroundedSummary({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });

    assert.ok(summary.text, 'Summary text must be generated');
    assert.match(summary.text, /backend/i, 'Must emphasize backend focus');
    assert.match(summary.text, /python|fastapi|postgres/i, 'Must mention verified backend technologies');
    assert.doesNotMatch(summary.text, /react|next\.js|frontend/i, 'Must NOT emphasize frontend skills for backend job');
    assert.ok(summary.referencedSkillSlugs.some((s) => s.includes('python') || s.includes('fastapi') || s.includes('postgres')));
    assert.ok(summary.text.length < 350, 'Must remain concise');
  });

  it('Test B: Frontend job produces frontend/full-stack-focused summary', () => {
    const summary = generateGroundedSummary({
      candidateProfile: sampleCandidate,
      jobPosting: frontendJob,
    });

    assert.ok(summary.text, 'Summary text must be generated');
    assert.match(summary.text, /frontend|web/i, 'Must emphasize frontend focus');
    assert.match(summary.text, /react|typescript|next/i, 'Must mention verified frontend technologies');
    assert.doesNotMatch(summary.text, /fastapi|python/i, 'Must NOT emphasize backend Python/FastAPI for frontend job');
    assert.ok(summary.referencedSkillSlugs.some((s) => s.includes('react') || s.includes('typescript') || s.includes('next')));
    assert.ok(summary.text.length < 350, 'Must remain concise');
  });

  it('Test C: Same candidate can receive different summaries for different jobs', () => {
    const backendSummary = generateGroundedSummary({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });
    const frontendSummary = generateGroundedSummary({
      candidateProfile: sampleCandidate,
      jobPosting: frontendJob,
    });

    assert.notEqual(backendSummary.text, frontendSummary.text, 'Summaries for distinct jobs must be distinct');
    assert.match(backendSummary.text, /backend/i);
    assert.match(frontendSummary.text, /frontend/i);
  });

  it('Test D: Summary only references candidate-owned skills/projects', () => {
    const summary = generateGroundedSummary({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });

    const candidateSkillSlugs = new Set(sampleCandidate.skills.map((s) => s.slug));
    for (const slug of summary.referencedSkillSlugs) {
      assert.ok(candidateSkillSlugs.has(slug), `Referenced skill '${slug}' must be candidate-owned`);
    }

    const candidateProjectIds = new Set(sampleCandidate.projects.map((p) => p.id));
    for (const projId of summary.referencedProjectIds) {
      assert.ok(candidateProjectIds.has(projId), `Referenced project '${projId}' must be candidate-owned`);
    }
  });

  it('Test E: Fabricated technology is rejected', () => {
    const sourceBullet = 'Built async API endpoints using FastAPI.';
    const fabricatedBullet = 'Built async API endpoints using FastAPI and Kubernetes microservices.';

    assert.throws(
      () => {
        validateRephrasingSafety(sourceBullet, fabricatedBullet, sampleCandidate);
      },
      (err) => err instanceof ValidationError || err.message.includes('Kubernetes') || err.message.includes('technology')
    );
  });

  it('Test F: Fabricated metric is rejected', () => {
    // 1. "40% reduction"
    assert.throws(
      () => assertMetricSafety('Engineered database optimization resulting in a 40% reduction in query latency.', []),
      ValidationError,
      '40% reduction without evidence must throw ValidationError'
    );

    // 2. "1000 users"
    assert.throws(
      () => assertMetricSafety('Supported 1000 users across distributed production clusters.', []),
      ValidationError,
      '1000 users without evidence must throw ValidationError'
    );

    // 3. "99.9% availability"
    assert.throws(
      () => assertMetricSafety('Maintained 99.9% availability for mission-critical services.', []),
      ValidationError,
      '99.9% availability without evidence must throw ValidationError'
    );

    // 4. "10M requests"
    assert.throws(
      () => assertMetricSafety('Handled 10M requests per day with zero downtime.', []),
      ValidationError,
      '10M requests without evidence must throw ValidationError'
    );

    // 5. "5-person team"
    assert.throws(
      () => assertMetricSafety('Led a 5-person team of software engineers.', []),
      ValidationError,
      '5-person team without evidence must throw ValidationError'
    );
  });

  it('Test G: Fabricated experience claim is rejected', () => {
    assert.throws(
      () => assertMetricSafety('Over 10 years of professional software engineering experience.', []),
      ValidationError,
      '10+ years tenure without backing work history must throw ValidationError'
    );

    const source = 'Developed full-stack web applications.';
    const fabricated = 'Served as VP of Engineering scaling to millions of users.';
    assert.throws(
      () => validateRephrasingSafety(source, fabricated, sampleCandidate),
      ValidationError,
      'Ungrounded scale/executive title must throw ValidationError'
    );
  });

  it('Test H: Relevant project bullets are prioritized for target job', () => {
    const backendProj = sampleCandidate.projects[0];
    const backendBullets = selectAndRephraseProjectBullets({
      project: backendProj,
      jobPosting: backendJob,
    });

    assert.ok(backendBullets.length > 0);
    // FastAPI/Python or PostgreSQL should be first bullet for backend role
    assert.match(backendBullets[0].text, /FastAPI|PostgreSQL|asynchronous/i);

    const frontendProj = sampleCandidate.projects[1];
    const frontendBullets = selectAndRephraseProjectBullets({
      project: frontendProj,
      jobPosting: frontendJob,
    });

    assert.ok(frontendBullets.length > 0);
    // React / TypeScript / UI bullet should be first bullet for frontend role
    assert.match(frontendBullets[0].text, /React|TypeScript|Kanban|Next\.js|UI|Tailwind/i);
  });

  it('Test I: Irrelevant project bullets are not preferred when relevant evidence exists', () => {
    const backendProj = sampleCandidate.projects[0];
    const bullets = selectAndRephraseProjectBullets({
      project: backendProj,
      jobPosting: backendJob,
    });

    // The Docker setup bullet is less relevant than FastAPI and PostgreSQL
    const dockerIndex = bullets.findIndex((b) => /Docker/i.test(b.text));
    const fastApiIndex = bullets.findIndex((b) => /FastAPI/i.test(b.text));
    const postgresIndex = bullets.findIndex((b) => /PostgreSQL/i.test(b.text));

    assert.ok(fastApiIndex < dockerIndex, 'FastAPI bullet must precede Docker bullet');
    assert.ok(postgresIndex < dockerIndex, 'PostgreSQL bullet must precede Docker bullet');
  });

  it('Test J: Rephrasing preserves factual meaning', () => {
    const sourceBullet = 'Built async API endpoints using FastAPI.';
    const validRephrased = 'Engineered asynchronous API endpoints with FastAPI.';

    // Should not throw
    validateRephrasingSafety(sourceBullet, validRephrased, sampleCandidate);

    const invalidRephrased = 'Designed a distributed microservices platform serving millions of users.';
    assert.throws(
      () => validateRephrasingSafety(sourceBullet, invalidRephrased, sampleCandidate),
      ValidationError
    );
  });

  it('Test K: Generated bullet carries evidenceRefs', () => {
    const backendProj = sampleCandidate.projects[0];
    const bullets = selectAndRephraseProjectBullets({
      project: backendProj,
      jobPosting: backendJob,
    });

    for (const b of bullets) {
      assert.ok(Array.isArray(b.evidenceRefs), 'evidenceRefs must be an array');
      if (b.text.includes('FastAPI') || b.text.includes('PostgreSQL')) {
        assert.ok(b.evidenceRefs.length > 0, `Bullet '${b.text}' must carry evidenceRefs`);
        assert.ok(b.evidenceRefs[0].filePath || b.evidenceRefs[0].sourceLocation?.filePath, 'Must reference file path');
      }
    }
  });

  it('Test L: Matched requirement IDs are preserved', () => {
    const backendProj = sampleCandidate.projects[0];
    const bullets = selectAndRephraseProjectBullets({
      project: backendProj,
      jobPosting: backendJob,
    });

    const fastApiBullet = bullets.find((b) => /FastAPI/i.test(b.text));
    assert.ok(fastApiBullet);
    assert.ok(Array.isArray(fastApiBullet.matchedRequirementIds));
    assert.ok(fastApiBullet.matchedRequirementIds.includes('req-b1'));
  });

  it('Test M: Missing evidence causes fail-closed behavior', () => {
    const emptyCandidate = {
      id: 'cand-empty',
      name: 'Empty Profile',
      skills: [],
      projects: [],
      experience: [],
    };

    const summary = generateGroundedSummary({
      candidateProfile: emptyCandidate,
      jobPosting: backendJob,
    });

    assert.ok(summary.text);
    // Must NOT fabricate Python or FastAPI or any other technology
    assert.doesNotMatch(summary.text, /Python|FastAPI|PostgreSQL|React|AWS/i);
    assert.equal(summary.referencedSkillSlugs.length, 0);
    assert.equal(summary.referencedProjectIds.length, 0);
  });

  it('Test N: Candidate source data is not mutated', () => {
    const candidateBefore = JSON.parse(JSON.stringify(sampleCandidate));

    const doc = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });

    assert.ok(doc);
    assert.deepEqual(sampleCandidate, candidateBefore, 'Source candidate object must be strictly immutable');
  });

  it('Test O: Same inputs produce deterministic structured output', () => {
    const doc1 = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });
    const doc2 = buildStructuredResumeDocument({
      candidateProfile: sampleCandidate,
      jobPosting: backendJob,
    });

    assert.equal(doc1.summary.text, doc2.summary.text, 'Summary text must be 100% deterministic');
    assert.deepEqual(doc1.summary.referencedSkillSlugs, doc2.summary.referencedSkillSlugs);
    assert.deepEqual(doc1.summary.referencedProjectIds, doc2.summary.referencedProjectIds);
    assert.equal(doc1.projects[0].bullets[0].text, doc2.projects[0].bullets[0].text);

    // Verify structured document integrity validation passes cleanly
    const receipt = validateStructuredResumeIntegrity(doc1);
    assert.equal(receipt.overallStatus, 'PASS');
    assert.equal(receipt.violations.length, 0);
  });
});
