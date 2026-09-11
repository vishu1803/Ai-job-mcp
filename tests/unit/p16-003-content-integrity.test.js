/**
 * @file Unit Tests: P16-003 Resume Content Integrity + Requirements 1-30
 *
 * Verifies:
 * - Negative tests: Zero file-path leakage (src/, .js, Dockerfile) in rendered prose
 * - Negative tests: Zero synthetic bullet templates ("Developed X functionality in Y", "verified by repository evidence")
 * - Canonical technology normalization (NestJS, PostgreSQL, Tailwind CSS, RESTful APIs, etc.)
 * - Unknown/new technologies render safely without code changes (Req 26)
 * - Dynamic capacity-aware one-page project budgeting (fresher vs experienced)
 * - Quality gate ordering: pre-render remediation runs before integrity validation, final snapshot validated post-remediation
 * - DSA consistency between quality gate and renderer (isMeaningfulDsa)
 * - Grounded professional summary without generic filler (Req 29)
 * - Every rendered fact has provenance and semantic evidence support (Req 28, 30)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTechnologyName,
  normalizeTechnologySlug,
  isNoisyTechnology,
  formatTechnologyStack,
} from '../../src/utils/technology-normalizer.js';
import {
  EVIDENCE_SEMANTIC_CLASS,
  classifyEvidenceSemanticType,
  isClaimSafeToRender,
  isMeaningfulDsa,
  generateGroundedSummary,
  deriveSectionOrdering,
  deriveTargetRoleHeading,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import {
  assessPreRenderQuality,
  classifyRoleFocus,
  GATE_FINDING_CODES,
} from '../../src/services/resume-content-quality-gate.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('P16-003: Technology Normalizer & Canonical Vocabulary (Req 7, 26)', () => {
  it('normalizes common aliases to canonical ATS display names', () => {
    assert.equal(normalizeTechnologyName('nestjs'), 'NestJS');
    assert.equal(normalizeTechnologyName('nest.js'), 'NestJS');
    assert.equal(normalizeTechnologyName('postgres'), 'PostgreSQL');
    assert.equal(normalizeTechnologyName('postgresql'), 'PostgreSQL');
    assert.equal(normalizeTechnologyName('tailwind'), 'Tailwind CSS');
    assert.equal(normalizeTechnologyName('tailwindcss'), 'Tailwind CSS');
    assert.equal(normalizeTechnologyName('rest api'), 'RESTful APIs');
    assert.equal(normalizeTechnologyName('rest apis'), 'RESTful APIs');
    assert.equal(normalizeTechnologyName('nodejs'), 'Node.js');
    assert.equal(normalizeTechnologyName('node.js'), 'Node.js');
    assert.equal(normalizeTechnologyName('docker'), 'Docker');
    assert.equal(normalizeTechnologyName('k8s'), 'Kubernetes');
    assert.equal(normalizeTechnologyName('kubernetes'), 'Kubernetes');
  });

  it('preserves unknown/new technologies safely without code changes (Req 26)', () => {
    // Unseen emerging technologies should preserve their original casing and trim safely
    assert.equal(normalizeTechnologyName('SurrealDB'), 'SurrealDB');
    assert.equal(normalizeTechnologyName('Mojo'), 'Mojo');
    assert.equal(normalizeTechnologyName('Bun'), 'Bun');
    assert.equal(normalizeTechnologyName('Zig'), 'Zig');
    assert.equal(normalizeTechnologyName('Qdrant'), 'Qdrant');
  });

  it('filters out noisy developer/build tools from resume tech stacks', () => {
    assert.ok(isNoisyTechnology('eslint'));
    assert.ok(isNoisyTechnology('prettier'));
    assert.ok(isNoisyTechnology('npm'));
    assert.ok(isNoisyTechnology('yarn'));
    assert.ok(isNoisyTechnology('nodemon'));
    assert.ok(!isNoisyTechnology('TypeScript'));
    assert.ok(!isNoisyTechnology('PostgreSQL'));
  });

  it('formats technology stacks into canonical, deduplicated lists', () => {
    const formatted = formatTechnologyStack([
      'postgres',
      'PostgreSQL',
      'nestjs',
      'eslint',
      'Tailwind CSS',
      'tailwind',
      'SurrealDB',
    ]);
    assert.deepEqual(formatted, ['PostgreSQL', 'NestJS', 'Tailwind CSS', 'SurrealDB']);
  });
});

describe('P16-003: Evidence Semantic Classification & Zero File-Path Leakage (Req 1, 2, 3, 28)', () => {
  it('correctly classifies presence vs feature vs outcome evidence', () => {
    assert.equal(
      classifyEvidenceSemanticType({ evidenceType: 'CODE_USAGE', sourceLocation: { filePath: 'src/main.ts' } }),
      EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE
    );
    assert.equal(
      classifyEvidenceSemanticType({ evidenceType: 'DEPENDENCY', name: 'drizzle-orm' }),
      EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE
    );
    assert.equal(
      classifyEvidenceSemanticType({ evidenceType: 'FEATURE_SPEC', featureSummary: 'OAuth2 login flow' }),
      EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE
    );
    assert.equal(
      classifyEvidenceSemanticType({ evidenceType: 'OUTCOME', metric: 'Reduced query latency by 40%' }),
      EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE
    );
    assert.equal(
      classifyEvidenceSemanticType({ candidateAuthored: true, text: 'Architected distributed event queue' }),
      EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM
    );
  });

  it('rejects claims with file-path leakage or synthetic template phrases (Req C)', () => {
    assert.equal(isClaimSafeToRender('Built authentication in src/auth/login.ts', EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE), false);
    assert.equal(isClaimSafeToRender('Configured deployment with Dockerfile', EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE), false);
    assert.equal(isClaimSafeToRender('Developed Redis functionality in src/dedup.js, verified by repository evidence', EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE), false);
    assert.equal(isClaimSafeToRender('Applied PostgreSQL in verified project implementation', EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE), false);
    assert.equal(isClaimSafeToRender('Implemented robust data pipeline supporting streaming telemetry', EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM), true);
  });
});

describe('P16-003: DSA Authenticity Consistency (Req G, 14)', () => {
  it('recognizes meaningful candidate DSA profiles with valid URLs and bullets', () => {
    const strongDsa = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/candidate-dev',
      bullets: ['Solved 350+ data structures and algorithmic problems across dynamic programming and graph theory.'],
    };
    assert.ok(isMeaningfulDsa(strongDsa));
  });

  it('rejects weak or filler DSA boilerplate', () => {
    const weakDsa = {
      hasSection: true,
      profileUrl: 'not-a-url',
      bullets: ['Built foundational analytical complexity'],
    };
    assert.equal(isMeaningfulDsa(weakDsa), false);
  });
});

describe('P16-003: Dynamic Capacity-Aware One-Page Budgeting (Req H, 21)', () => {
  const baseCandidate = {
    id: 'cand-001',
    displayName: 'Jordan Test',
    email: 'jordan@synthetic-test.org',
    skills: [
      { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
      { name: 'Node.js', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' },
    ],
    projects: [
      { id: 'p1', name: 'Project 1', technologies: ['TypeScript', 'Node.js'], bullets: ['Built real-time messaging pipeline.'] },
      { id: 'p2', name: 'Project 2', technologies: ['PostgreSQL'], bullets: ['Optimized indexing queries for telemetry.'] },
      { id: 'p3', name: 'Project 3', technologies: ['TypeScript'], bullets: ['Implemented responsive client portal.'] },
      { id: 'p4', name: 'Project 4', technologies: ['Node.js'], bullets: ['Created worker queue for background jobs.'] },
      { id: 'p5', name: 'Project 5', technologies: ['Docker'], bullets: ['Automated container builds in CI.'] },
    ],
    experience: [],
    education: [
      { institution: 'State University', degree: 'B.S. in Computer Science', year: '2024' },
    ],
  };

  const rankings = [
    { projectId: 'p1', relevanceScore: 90, relevanceRank: 1 },
    { projectId: 'p2', relevanceScore: 80, relevanceRank: 2 },
    { projectId: 'p3', relevanceScore: 70, relevanceRank: 3 },
    { projectId: 'p4', relevanceScore: 60, relevanceRank: 4 },
    { projectId: 'p5', relevanceScore: 50, relevanceRank: 5 },
  ];

  const job = {
    id: 'job-1',
    title: 'Software Engineer',
    company: 'Tech Corp',
    description: 'Looking for a talented software engineer with TypeScript and Node.js expertise.',
    projectRankings: rankings,
  };

  it('fresher profiles with zero work history budget up to 4 projects to fill the single page', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: baseCandidate,
      jobPosting: job,
      options: { projectRankings: rankings },
    });
    assert.equal(doc.experience.length, 0);
    assert.ok(doc.projects.length >= 3 && doc.projects.length <= 4, `fresher should feature 3-4 projects, got ${doc.projects.length}`);
  });

  it('candidates with heavy professional experience budget exactly 2 projects to prevent 2-page overflow', () => {
    const experiencedCandidate = {
      ...baseCandidate,
      experience: [
        {
          company: 'First Corp',
          title: 'Senior Software Engineer',
          startDate: '2022-01-01',
          endDate: 'Present',
          isCurrent: true,
          bullets: [
            'Led migration of monolithic backend to microservices.',
            'Architected distributed caching layer with Redis and PostgreSQL.',
            'Mentored junior engineers and improved team velocity.',
          ],
        },
        {
          company: 'Second Corp',
          title: 'Software Engineer',
          startDate: '2020-01-01',
          endDate: '2021-12-31',
          bullets: [
            'Built core RESTful APIs handling millions of requests daily.',
            'Implemented comprehensive end-to-end testing suite.',
          ],
        },
      ],
    };

    const doc = buildStructuredResumeDocument({
      candidateProfile: experiencedCandidate,
      jobPosting: job,
      options: { projectRankings: rankings },
    });
    assert.equal(doc.experience.length, 2);
    assert.equal(doc.projects.length, 2, `experienced candidate should feature 2 projects, got ${doc.projects.length}`);
  });
});

describe('P16-003: Quality Gate Ordering & Synchronization (Req K, 15)', () => {
  it('runs quality gate assessment and validates final snapshot post-remediation', () => {
    const candidateWithWeakDsa = {
      id: 'cand-gate-001',
      displayName: 'Alex Gate',
      email: 'alex.gate@synthetic-test.org',
      skills: [{ name: 'Go', provenanceStatus: 'VERIFIED' }],
      projects: [
        { id: 'p1', name: 'Go Gateway', technologies: ['Go'], bullets: ['Built HTTP reverse proxy gateway.'] },
      ],
      education: [{ institution: 'Tech Institute', degree: 'B.S.', year: '2023' }],
      problemSolving: {
        hasSection: true,
        bullets: ['Built foundational analytical complexity'], // weak filler
      },
    };

    const { structuredResume, evidenceValidationReceipt, contentQualityGate } = buildStructuredResumeSnapshot({
      candidateProfile: candidateWithWeakDsa,
      jobPosting: { title: 'Backend Engineer', description: 'Go engineering role' },
    });

    // The post-remediation document must have remediated weak DSA and have clean receipt
    assert.equal(structuredResume.dsa?.hasSection, false, 'weak DSA section must be omitted during remediation');
    assert.equal(isMeaningfulDsa(structuredResume.dsa), false, 'remediated DSA must not be considered meaningful');
    assert.ok(contentQualityGate, 'snapshot must return content quality gate result');
    assert.equal(contentQualityGate.passed, true, 'content quality gate must PASS post-remediation');
    assert.equal(evidenceValidationReceipt.overallStatus, 'PASS', 'final receipt must reflect PASS after remediation');
  });
});

describe('P16-003: Professional Summary Grounding (Req 29)', () => {
  it('generates grounded professional summaries without generic filler or false claims', () => {
    const candidate = {
      displayName: 'Morgan Lee',
      email: 'morgan.lee@synthetic-test.org',
      headline: 'Full-Stack Developer',
      skills: [
        { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
        { name: 'React', provenanceStatus: 'VERIFIED' },
      ],
      projects: [
        { name: 'Analytics Portal', technologies: ['TypeScript', 'React'], bullets: ['Built dashboards for analytics.'] },
      ],
    };

    const summary = generateGroundedSummary({
      candidateProfile: candidate,
      jobPosting: { title: 'Frontend Engineer', description: 'React and TypeScript engineering role' },
    });

    assert.ok(summary.text, 'summary text must be generated');
    assert.match(summary.text, /TypeScript|React/i, 'summary references candidate skills');
    assert.doesNotMatch(summary.text, /dedicated professional tailored for/i, 'no tailoring boilerplate');
    assert.doesNotMatch(summary.text, /delivering immediate value/i, 'no filler phrases');
  });
});
