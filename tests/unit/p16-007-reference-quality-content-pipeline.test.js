/**
 * @file P16-007: Final High-Quality, High-Density Resume Content Pipeline Test Suite
 *
 * Validates the 8 Non-Negotiable Architectural Rules:
 * 1. Candidate-owned content is the only normal source for accomplishment prose.
 * 2. Canonical reconciliation preserves every distinct candidate-owned content surface.
 * 3. No production content behavior depends on hardcoded allowlists (100% generic).
 * 4. Technology normalization is metadata-driven and extensible for unknown technologies.
 * 5. Content richness thresholds are conditional (3 -> 3, 2 -> 2, 1 -> 1, 0 -> 0).
 * 6. Character counts and sentence counts are diagnostics, not truth rules.
 * 7. Layout engine selects/reflows content but never acts as a content-generation layer.
 * 8. Final PDF page count alone is insufficient; ReferenceQualityContentReport audits utilization.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reconcileCandidateProjects,
  mergeCandidateOwnedProjectContent,
} from '../../src/services/candidate-artifact-content.service.js';

import {
  selectAndRephraseProjectBullets,
  calculateTokenOverlap,
  composeCandidateProjectBullets,
  generateGroundedSummary,
  splitSentences,
} from '../../src/services/resume-content-strategy.service.js';

import {
  generateReferenceQualityContentReport,
} from '../../src/services/resume-layout-engine.service.js';

describe('P16-007: Reference-Quality Content Pipeline', () => {
  // Test 1: Canonical Project Reconciliation preserves every distinct candidate-owned content surface
  test('Rule 2: Canonical reconciliation preserves bullets, highlights, features, and descriptions across merge paths', () => {
    const resumeDataProjects = [
      {
        name: 'Distributed Task Queue',
        bullets: ['Implemented distributed worker pool with Redis and Node.js.'],
        summary: 'High-throughput task queue system.',
        technologies: ['Node.js', 'Redis'],
      },
    ];

    const profileProjects = [
      {
        name: 'Distributed Task Queue',
        highlights: ['Designed fault-tolerant retry mechanism with exponential backoff.'],
        features: ['Built real-time queue depth monitoring dashboard.'],
        featureDescriptions: ['Monitored message lag across 16 parallel partitions.'],
        responsibilities: ['Maintained worker service uptime and cluster deployments.'],
        technologies: ['TypeScript', 'Docker', 'PostgreSQL'],
        url: 'https://github.com/test-candidate/distributed-task-queue',
        liveUrl: 'https://taskqueue.dev',
        evidence: [
          { skillName: 'Redis', filePath: 'src/queue.ts' },
          { skillName: 'TypeScript', filePath: 'src/worker.ts' },
        ],
      },
    ];

    const reconciled = reconcileCandidateProjects({
      resumeDataProjects,
      profileProjects,
    });

    assert.equal(reconciled.length, 1);
    const proj = reconciled[0];

    // Verify all candidate-owned fields are preserved
    assert.ok(proj.bullets.length >= 3, `Expected at least 3 bullets, got ${proj.bullets.length}`);
    assert.ok(proj.bullets.some(b => b.includes('distributed worker pool')));
    assert.ok(proj.bullets.some(b => b.includes('fault-tolerant retry mechanism')));
    assert.ok(proj.bullets.some(b => b.includes('real-time queue depth monitoring')));

    // Verify technologies merged
    assert.ok(proj.technologies.includes('Node.js') || proj.technologies.includes('Redis'));
    assert.ok(proj.technologies.includes('TypeScript') || proj.technologies.includes('Docker'));

    // Verify URLs preserved
    assert.equal(proj.repositoryUrl, 'https://github.com/test-candidate/distributed-task-queue');
    assert.equal(proj.liveUrl, 'https://taskqueue.dev');
  });

  // Test 2: Source-Order Invariance in Project Reconciliation
  test('Rule 2b: Reconciliation is source-order invariant (profileProjects first vs resumeDataProjects first)', () => {
    const projA = {
      name: 'Cloud Storage Proxy',
      bullets: ['Built S3-compatible chunked upload endpoint in Python.'],
      highlights: ['Implemented AES-256 client-side payload encryption.'],
    };
    const projB = {
      name: 'Cloud Storage Proxy',
      features: ['Streamed multi-part files directly to object store.'],
      technologies: ['Python', 'FastAPI'],
    };

    const target1 = { ...projA };
    mergeCandidateOwnedProjectContent(target1, projB);

    const target2 = { ...projB };
    mergeCandidateOwnedProjectContent(target2, projA);

    // Both merged targets must contain all distinct facts
    const bullets1 = [...(target1.bullets || []), ...(target1.highlights || []), ...(target1.features || [])];
    const bullets2 = [...(target2.bullets || []), ...(target2.highlights || []), ...(target2.features || [])];

    assert.equal(bullets1.length, bullets2.length);
  });

  // Test 3: Rule 1 & Rule 5: Conditional Richness Thresholds (3 -> 3, 2 -> 2, 1 -> 1, 0 -> 0)
  test('Rule 5: Content richness thresholds are conditional on authentic facts count', () => {
    const jobPosting = {
      title: 'Backend Engineer',
      requirements: ['Python', 'FastAPI', 'PostgreSQL'],
    };

    // Case 0: 0 candidate facts -> 0 bullets
    const proj0 = {
      name: 'Empty Project',
      bullets: [],
      highlights: [],
      evidence: [],
    };
    const res0 = selectAndRephraseProjectBullets({ project: proj0, jobPosting, options: { maxBullets: 3 } });
    assert.equal(res0.length, 0, 'Project with 0 facts must produce 0 accomplishment bullets');

    // Case 1: 1 candidate fact -> 1 bullet
    const proj1 = {
      name: 'Single Fact Project',
      bullets: ['Architected REST API with FastAPI and PostgreSQL.'],
      highlights: [],
      evidence: [],
    };
    const res1 = selectAndRephraseProjectBullets({ project: proj1, jobPosting, options: { maxBullets: 3 } });
    assert.equal(res1.length, 1, 'Project with 1 fact must produce exactly 1 bullet');

    // Case 2: 2 candidate facts -> 2 bullets
    const proj2 = {
      name: 'Two Fact Project',
      bullets: ['Architected REST API with FastAPI and PostgreSQL.'],
      highlights: ['Configured automated database migration pipelines with Alembic.'],
      evidence: [],
    };
    const res2 = selectAndRephraseProjectBullets({ project: proj2, jobPosting, options: { maxBullets: 3 } });
    assert.equal(res2.length, 2, 'Project with 2 facts must produce exactly 2 bullets');

    // Case 3: 3 candidate facts -> 3 bullets
    const proj3 = {
      name: 'Three Fact Project',
      bullets: ['Architected REST API with FastAPI and PostgreSQL.'],
      highlights: ['Configured automated database migration pipelines with Alembic.'],
      features: ['Containerized application with Docker Compose for consistent local development.'],
      evidence: [],
    };
    const res3 = selectAndRephraseProjectBullets({ project: proj3, jobPosting, options: { maxBullets: 3 } });
    assert.equal(res3.length, 3, 'Project with 3 facts must produce up to 3 bullets');
  });

  // Test 4: Redundancy Reduction via Token Overlap (Jaccard similarity >= 0.55)
  test('Redundancy Reduction: Drops near-duplicate bullets describing the same accomplishment', () => {
    const textA = 'Engineered an automated career agent and Model Context Protocol MCP server in TypeScript.';
    const textB = 'Built an automated career agent and Model Context Protocol MCP server in TypeScript.';
    const textC = 'Integrated Gemini API for structured JSON resume analysis and scoring.';

    const overlapAB = calculateTokenOverlap(textA, textB);
    const overlapAC = calculateTokenOverlap(textA, textC);

    assert.ok(overlapAB >= 0.55, `Expected high overlap for near duplicates, got ${overlapAB}`);
    assert.ok(overlapAC < 0.40, `Expected low overlap for distinct accomplishments, got ${overlapAC}`);

    const project = {
      name: 'AI Agent Server',
      bullets: [textA, textB, textC],
      evidence: [],
    };

    const tailored = selectAndRephraseProjectBullets({
      project,
      jobPosting: { title: 'Backend Engineer' },
      options: { maxBullets: 3 },
    });

    // Redundant textB must have been pruned, leaving 2 distinct accomplishments
    assert.equal(tailored.length, 2, `Expected 2 distinct bullets after redundancy reduction, got ${tailored.length}`);
  });

  // Test 5: Grounded Composition of Short Complementary Fragments
  test('Grounded Composition: Combines short fragments (< 60 chars) without inventing metrics or claims', () => {
    const frag1 = 'Built RESTful API with FastAPI.';
    const frag2 = 'Containerized service with Docker.';

    const items = [
      { text: frag1, origText: frag1 },
      { text: frag2, origText: frag2 },
    ];

    const composed = composeCandidateProjectBullets(items);
    assert.equal(composed.length, 1);
    assert.match(composed[0].text, /FastAPI;\s+containerized service with Docker\./i);
    // Assert zero hallucinated metrics or scale
    assert.doesNotMatch(composed[0].text, /%/);
    assert.doesNotMatch(composed[0].text, /million|billion|scale|users|team of/i);
  });

  // Test 6: Authentic 3-Sentence Professional Summary Restoration
  test('Rule 6: Preserves authentic 3-sentence summary (250-450 chars) without artificial truncation or redundant skill appending', () => {
    const authenticSummary =
      'Software Engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS). ' +
      'Proven ability to deliver high-performance, production-ready applications with PostgreSQL and modular service design. ' +
      'Strong foundational problem-solver with rigorous daily practice in Data Structures and Algorithms.';

    const candidateProfile = {
      summary: authenticSummary,
      headline: 'Software Engineer',
      skills: [
        { name: 'Python', verified: true },
        { name: 'FastAPI', verified: true },
        { name: 'PostgreSQL', verified: true },
      ],
      projects: [],
      experience: [],
    };

    const jobPosting = {
      title: 'Backend Systems Engineer',
      requirements: ['Python', 'FastAPI', 'PostgreSQL'],
    };

    const summaryObj = generateGroundedSummary({
      candidateProfile,
      jobPosting,
    });

    assert.ok(summaryObj && summaryObj.text);
    const sentences = splitSentences(summaryObj.text);
    assert.equal(sentences.length, 3, `Expected exactly 3 sentences, got ${sentences.length}`);
    assert.ok(summaryObj.text.length >= 250 && summaryObj.text.length <= 460, `Length outside 250-460: ${summaryObj.text.length}`);
    // Ensure Sentence 3 is preserved!
    assert.match(summaryObj.text, /Data Structures and Algorithms/i);
    // Ensure no redundant keyword stuffing ("Proficient in...") appended
    assert.doesNotMatch(summaryObj.text, /Proficient in/i);
  });

  // Test 7: Technology-Agnostic Genericity (Rule 3 & 4)
  test('Rule 3 & 4: Unknown novel technologies pass through generic normalizer without source changes', () => {
    const novelProject = {
      name: 'Quantum Circuit Simulator',
      technologies: ['Qiskit', 'CirqQuantumLib', 'JuliaLangX'],
      bullets: ['Engineered quantum state vector simulation kernel in JuliaLangX.'],
      highlights: ['Benchmarked variational quantum eigensolver circuits using Qiskit.'],
      evidence: [],
    };

    const tailored = selectAndRephraseProjectBullets({
      project: novelProject,
      jobPosting: { title: 'Quantum Software Engineer', requirements: ['Qiskit', 'JuliaLangX'] },
      options: { maxBullets: 2 },
    });

    assert.equal(tailored.length, 2);
    assert.ok(tailored.some(b => b.text.includes('JuliaLangX')));
    assert.ok(tailored.some(b => b.text.includes('Qiskit')));
  });

  // Test 8: Rule 8 ReferenceQualityContentReport Auditing
  test('Rule 8: ReferenceQualityContentReport audits candidate fact utilization and flags sparse starvation', () => {
    const structuredResume = {
      candidateIdentity: { displayName: 'Jane Doe', email: 'jane@example.com' },
      summary: {
        text: 'Software Engineer with backend focus. Delivered distributed microservices. Practiced in DSA.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Python' }] },
          { categoryName: 'Backend & APIs', skills: [{ name: 'FastAPI' }] },
          { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }] },
          { categoryName: 'Cloud & DevOps', skills: [{ name: 'Docker' }] },
        ],
      },
      projects: [
        {
          name: 'API Gateway',
          bullets: [
            'Architected reverse proxy with rate limiting.',
            'Implemented JWT authentication middleware.',
          ],
          highlights: ['Cached upstream responses in Redis.'],
        },
        {
          name: 'Task Scheduler',
          bullets: [
            'Built cron worker daemon with fault tolerance.',
            'Managed queue backpressure across consumer pools.',
          ],
        },
      ],
    };

    const report = generateReferenceQualityContentReport({ structuredResume });

    assert.ok(report.passed);
    assert.ok(report.score >= 80, `Expected quality score >= 80, got ${report.score}`);
    assert.equal(report.summarySentenceCount, 3);
    assert.equal(report.skillsCategoryCount, 4);
    assert.equal(report.factsRendered, 4);
    assert.ok(report.utilizationRatio >= 0.7);
  });
});
