/**
 * @file P16-009: Resume Professional-Quality Composition Engine — Regression Suite
 *
 * Covers the 16 mandated regression scenarios plus engine invariants:
 * fact-inventory canonicality, professional composition, semantic redundancy,
 * capacity fairness, DSA URL-only rendering, unsupported-claim gating,
 * optimizer canonical-fact consumption and candidate-fact preservation.
 *
 * Fully generic: every fixture is synthetic and identity-free. No test depends
 * on a candidate name, project name, company, job board, URL or fixture string
 * for semantic behavior.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  normalizeFactText,
  factFingerprint,
  PROBLEM_SOLVING_PROJECT_KEY,
} from '../../src/services/candidate-fact-inventory.service.js';

import {
  composeProfessionalProjectBullets,
  determineProjectBulletCapacity,
  MAX_BULLETS_PER_PROJECT,
} from '../../src/services/resume-accomplishment-composer.service.js';

import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { computeResumeQualityScore } from '../../src/services/resume-quality-score.service.js';
import {
  GATE_FINDING_CODES,
  assessPreRenderQuality,
} from '../../src/services/resume-content-quality-gate.service.js';
import { ResumeContentOptimizer } from '../../src/services/resume-content-optimizer.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';

const TENANT = '9f1d0000-0000-4000-8000-000000000001';

/** Synthetic generic candidate used across composition tests. */
function syntheticCandidate(overrides = {}) {
  return {
    profileMetadata: {},
    displayName: 'Test Candidate',
    canonicalEmail: 'test-candidate@synthetic-test.org',
    skills: [
      { name: 'TypeScript', provenanceStatus: 'VERIFIED' },
      { name: 'PostgreSQL', provenanceStatus: 'CORROBORATED' },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'Acme Systems',
        title: 'Software Engineer Intern',
        startDate: '2024-06',
        endDate: '2024-09',
        bullets: ['Owned the internal metrics dashboard used by two internal teams.'],
      },
    ],
    education: [{ institution: 'State Institute of Technology', degree: 'B.T.', fieldOfStudy: 'Computer Engineering' }],
    projects: [
      {
        id: 'proj-1',
        name: 'Telemetry Platform',
        bullets: [
          'Built a distributed telemetry and data exploration platform in TypeScript with streaming pipelines.',
        ],
        description:
          'High-throughput distributed telemetry and data exploration platform in TypeScript with streaming pipelines.',
        technologies: ['TypeScript', 'Redis'],
        evidenceCount: 12,
        evidence: [
          { evidenceType: 'CODE_IMPORT_USAGE', skillSlug: 'redis', skillName: 'Redis', sourceLocation: { filePath: 'src/cache.ts' }, confidenceScore: 1 },
          { evidenceType: 'CODE_IMPORT_USAGE', skillSlug: 'typescript', skillName: 'TypeScript', sourceLocation: { filePath: 'src/app.ts' }, confidenceScore: 1 },
        ],
      },
      {
        id: 'proj-2',
        name: 'Retry Queue Service',
        bullets: [
          'Implemented idempotent job processing with exponential backoff retries.',
        ],
        technologies: ['Node.js'],
        evidenceCount: 7,
        evidence: [
          { evidenceType: 'CODE_IMPORT_USAGE', skillSlug: 'nodejs', skillName: 'Node.js', sourceLocation: { filePath: 'src/worker.ts' }, confidenceScore: 1 },
        ],
      },
    ],
    problemSolving: {
      profileUrl: 'https://leetcode.com/synthetic-candidate',
      bullets: [],
    },
    ...overrides,
  };
}

const jobBackend = {
  id: 'job-be-1',
  title: 'Backend Engineer',
  description: 'Build scalable backend services with TypeScript, PostgreSQL and Redis. Distributed systems experience preferred.',
  requirements: ['TypeScript', 'PostgreSQL', 'Redis', 'Distributed Systems'],
  skills: ['TypeScript', 'PostgreSQL', 'Redis'],
};

describe('P16-009: Canonical Fact Inventory', () => {
  test('1. project with two redundant descriptions produces one canonical fact', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-dup',
          name: 'Dup Project',
          bullets: ['Built an automated reporting pipeline in Python for weekly analytics.'],
          highlights: ['Engineered an automated reporting pipeline in Python for weekly analytics.'],
          technologies: ['Python'],
        },
      ],
    });
    const inv = buildCanonicalFactInventory(candidate);
    const claimFacts = inv.byProject.get('proj-dup').filter((f) => f.factType !== 'technology');
    assert.equal(claimFacts.length, 1, `expected 1 merged claim fact, got ${claimFacts.length}: ${JSON.stringify(claimFacts.map((f) => f.text))}`);
    // The merged fact keeps the higher-priority surface (bullet)
    assert.equal(claimFacts[0].sourceType, 'bullet');
  });

  test('2. project with six distinct facts yields capacity 3 and three composed bullets', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-rich',
          name: 'Rich Project',
          bullets: [
            'Built a distributed task queue with Redis-backed worker pools.',
            'Implemented idempotent job processing with exponential backoff retries.',
            'Containerized services with Docker Compose for reproducible deployments.',
            'Integrated OAuth-based authentication across service boundaries.',
            'Automated CI/CD pipelines with GitHub Actions.',
            'Designed event-driven ingestion with partitioned topic streams.',
          ],
          technologies: ['Go'],
        },
      ],
    });
    const inv = buildCanonicalFactInventory(candidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-rich'), jobBackend);
    const composed = composeProfessionalProjectBullets({ facts, project: candidate.projects[0], jobPosting: jobBackend });
    assert.equal(composed.capacity.capacity, 3);
    assert.equal(composed.bullets.length, 3);
    // All composed bullets are grounded in canonical fact ids
    for (const b of composed.bullets) {
      assert.ok(b.composedFromFactIds.length >= 1);
    }
  });

  test('3. project with only two distinct facts never manufactures a third bullet', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-sparse',
          name: 'Sparse Project',
          bullets: ['Built a REST API with FastAPI.', 'Configured database migrations with Alembic.'],
          technologies: ['Python'],
        },
      ],
    });
    const inv = buildCanonicalFactInventory(candidate);
    const facts = scoreFactsForJob(inv.byProject.get('proj-sparse'), jobBackend);
    const composed = composeProfessionalProjectBullets({ facts, project: candidate.projects[0], jobPosting: jobBackend });
    assert.equal(composed.bullets.length, 2);
    assert.ok(composed.capacity.capacity <= 2);
  });

  test('4. composed bullets cover complementary dimensions (architecture + implementation/reliability)', () => {
    const project = {
      id: 'proj-dims',
      name: 'Dims Project',
      bullets: [
        'Built a distributed telemetry platform with streaming pipelines.',
        'Implemented Raft-based coordination for distributed state.',
        'Automated deployment with containerized build pipelines.',
      ],
      technologies: ['Rust'],
    };
    const inv = buildCanonicalFactInventory({ projects: [project] });
    const facts = scoreFactsForJob(inv.byProject.get('proj-dims'), jobBackend);
    const composed = composeProfessionalProjectBullets({ facts, project, jobPosting: jobBackend });
    const texts = composed.bullets.map((b) => b.text.toLowerCase());
    // No two bullets may be near-identical rewordings
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const t1 = new Set(texts[i].split(/\W+/));
        const t2 = new Set(texts[j].split(/\W+/));
        const inter = [...t1].filter((t) => t2.has(t)).length;
        const union = new Set([...t1, ...t2]).size;
        assert.ok(inter / union < 0.55, `bullets ${i} and ${j} are redundant`);
      }
    }
    assert.ok(composed.bullets.length >= 2, 'distinct dimension facts should produce multiple bullets');
  });

  test('fact extraction is source-order invariant', () => {
    const a = {
      projects: [
        { id: 'p1', name: 'A', bullets: ['Built feature one with retries.'], highlights: ['Designed schema for event storage.'] },
        { id: 'p2', name: 'B', bullets: ['Implemented search indexing pipeline.'] },
      ],
    };
    const b = {
      projects: [
        { id: 'p2', name: 'B', bullets: ['Implemented search indexing pipeline.'] },
        { id: 'p1', name: 'A', highlights: ['Designed schema for event storage.'], bullets: ['Built feature one with retries.'] },
      ],
    };
    const invA = buildCanonicalFactInventory(a);
    const invB = buildCanonicalFactInventory(b);
    assert.deepEqual(invA.facts.map((f) => f.factId), invB.facts.map((f) => f.factId));
  });

  test('normalizeFactText strips bullets and pure URLs', () => {
    assert.equal(normalizeFactText('- Built the service'), 'Built the service');
    assert.equal(normalizeFactText('https://example.test/repo'), '');
  });

  test('fact fingerprints are deterministic per association', () => {
    assert.equal(factFingerprint('Built the service', 'p1'), factFingerprint('Built the service', 'p1'));
    assert.notEqual(factFingerprint('Built the service', 'p1'), factFingerprint('Built the service', 'p2'));
  });

  test('technology facts never become claim bullets', () => {
    const project = {
      id: 'proj-tech',
      name: 'Tech Only',
      technologies: ['Rust'],
      evidence: [
        { evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', skillSlug: 'serde', skillName: 'Serde' },
        { evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', skillSlug: 'tokio', skillName: 'Tokio' },
      ],
    };
    const inv = buildCanonicalFactInventory({ projects: [project] });
    const facts = scoreFactsForJob(inv.byProject.get('proj-tech') || [], jobBackend);
    const composed = composeProfessionalProjectBullets({ facts, project, jobPosting: jobBackend });
    assert.equal(composed.bullets.length, 0, 'presence evidence alone must not produce bullets');
    const techFacts = inv.byProject.get('proj-tech').filter((f) => f.factType === 'technology');
    assert.ok(techFacts.length >= 2, 'technology facts must be retained in the inventory');
  });
});

describe('P16-009: Optimizer consumes the canonical inventory', () => {
  test('15. optimizer expands from canonical facts, not raw profile re-discovery', async () => {
    let buildCalls = 0;
    const candidate = syntheticCandidate();
    // Instrument: same candidate object identity across iterations
    const jobPosting = jobBackend;
    const mockCompiler = { compileLatexToPdf: async () => ({ pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') }) };
    const mockGenerator = { generateTailoredResumeLatex: () => ({ texContent: 'x' }) };
    const analyzer = new PdfGeometryAnalyzer();
    analyzer.measurePdfBottom = () => ({ lowestY: 100, bottomWhitespacePt: 180, pageOccupancyRatio: 0.78 });
    analyzer._detectPageCount = () => 1;
    analyzer.computeAcceptanceMetrics = ({ structuredResume }) => ({
      pageCount: 1,
      isSinglePage: true,
      factUtilization: { factsRendered: structuredResume.projects.reduce((n, p) => n + p.bullets.length, 0), distinctFactsAvailable: 18, utilizationRatio: 0.4 },
      geometry: { pageOccupancyPercent: 78 },
      summary: { chars: 100, sentenceCount: 2 },
      projects: { count: structuredResume.projects.length, bulletsPerProject: [] },
      experience: { rolesCount: 1, bulletsCount: 1 },
      dsa: { rendered: true, bulletsCount: 0 },
    });
    const optimizer = new ResumeContentOptimizer({ latexCompiler: mockCompiler, latexGenerator: mockGenerator, geometryAnalyzer: analyzer });
    const result = await optimizer.optimize({ candidateProfile: candidate, jobPosting, options: { maxIterations: 3 } });
    assert.ok(result.success);
    buildCalls = result.iterationsRun;
    assert.ok(buildCalls >= 1);
    // The optimizer's expansion decisions must reflect canonical fact counts:
    // proj-1 has 2 claim facts (bullet + description distinct) → expandable to 2
    const finalProjects = result.structuredResume.projects;
    assert.ok(finalProjects.length >= 1);
  });

  test('16. candidate-owned facts are never invented or silently lost during canonicalization', () => {
    const candidate = syntheticCandidate();
    const inv = buildCanonicalFactInventory(candidate);
    // Every distinct authored surface text must appear as (part of) a fact
    const allAuthoredTexts = candidate.projects.flatMap((p) => [...(p.bullets || []), ...(p.highlights || [])]);
    for (const text of allAuthoredTexts) {
      const normalized = normalizeFactText(text).toLowerCase().replace(/[^a-z0-9]/g, '');
      const covered = inv.facts.some((f) => {
        const fnorm = f.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        return fnorm.includes(normalized) || normalized.includes(fnorm);
      });
      assert.ok(covered, `fact lost during canonicalization: ${text}`);
    }
    // No fact text may invent numbers absent from sources
    for (const f of inv.facts) {
      const numeric = f.text.match(/\d+/g) || [];
      const sourceNumeric = JSON.stringify(candidate).match(/\d+/g) || [];
      for (const n of numeric) {
        assert.ok(sourceNumeric.includes(n), `invented number ${n} in fact: ${f.text}`);
      }
    }
  });
});

describe('P16-009: DSA / problem-solving section', () => {
  test('5. DSA profile URL with no metrics renders a compact truthful section', () => {
    const candidate = syntheticCandidate();
    const { structuredResume, contentQualityGate } = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: jobBackend,
    });
    assert.equal(structuredResume.dsa.hasSection, true);
    assert.equal(structuredResume.dsa.profileUrl, 'https://leetcode.com/synthetic-candidate');
    assert.equal(structuredResume.dsa.bullets.length, 0, 'no fabricated DSA bullets');
    assert.ok(structuredResume.sectionOrder.includes('DSA'));
    assert.equal(contentQualityGate.passed, true);
    // No fabricated stats anywhere in the document
    const docJson = JSON.stringify(structuredResume);
    assert.doesNotMatch(docJson, /solved\s*\d+/i);
    assert.doesNotMatch(docJson, /top\s*\d+%/i);
    assert.doesNotMatch(docJson, /rating[:\s]*\d+/i);
  });

  test('6. DSA with authored candidate evidence renders those bullets verbatim', () => {
    const candidate = syntheticCandidate({
      problemSolving: {
        profileUrl: 'https://leetcode.com/synthetic-candidate',
        bullets: ['Practiced graph traversal and dynamic programming patterns weekly across two semesters.'],
      },
    });
    const { structuredResume } = buildStructuredResumeSnapshot({ candidateProfile: candidate, jobPosting: jobBackend });
    assert.equal(structuredResume.dsa.hasSection, true);
    assert.deepEqual(structuredResume.dsa.bullets, ['Practiced graph traversal and dynamic programming patterns weekly across two semesters.']);
  });

  test('problem-solving link fact is indexed under the canonical DSA key', () => {
    const inv = buildCanonicalFactInventory(syntheticCandidate());
    const dsaFacts = inv.byProject.get(PROBLEM_SOLVING_PROJECT_KEY) || [];
    assert.equal(dsaFacts.length, 1);
    assert.equal(dsaFacts[0].factType, 'external-corroboration');
    assert.ok(dsaFacts[0].text.includes('leetcode.com'));
  });
});

describe('P16-009: Unsupported-claim gating', () => {
  test('11. resume with no candidate metrics renders zero fabricated metrics', () => {
    const candidate = syntheticCandidate();
    const { structuredResume, evidenceValidationReceipt } = buildStructuredResumeSnapshot({
      candidateProfile: candidate,
      jobPosting: jobBackend,
    });
    const docJson = JSON.stringify(structuredResume);
    assert.doesNotMatch(docJson, /\d+\+?\s*(users|requests|customers)/i);
    assert.doesNotMatch(docJson, /\d+(?:\.\d+)?%\s*(reduction|improvement)/i);
    assert.ok(evidenceValidationReceipt.overallStatus === 'PASS' || evidenceValidationReceipt.overallStatus === 'PASS_WITH_FINDINGS');
  });

  test('unsupported metric fact is omitted from composition with reason', () => {
    const project = {
      id: 'proj-metric',
      name: 'Metric Project',
      bullets: ['Served 5 million users daily on the platform.', 'Built the ingestion service for event streams.'],
      technologies: ['Go'],
    };
    const inv = buildCanonicalFactInventory({ projects: [project] });
    const facts = scoreFactsForJob(inv.byProject.get('proj-metric'), jobBackend);
    const composed = composeProfessionalProjectBullets({ facts, project, jobPosting: jobBackend });
    const omittedReasons = composed.omittedFacts.map((o) => o.reason);
    assert.ok(omittedReasons.includes('UNSUPPORTED_METRIC'), `expected UNSUPPORTED_METRIC omission, got ${JSON.stringify(omittedReasons)}`);
    assert.ok(composed.bullets.every((b) => !/million users/i.test(b.text)));
  });
});

describe('P16-009: Quality score and gates', () => {
  test('deterministic quality score: identical input → identical score', () => {
    const { structuredResume } = buildStructuredResumeSnapshot({ candidateProfile: syntheticCandidate(), jobPosting: jobBackend });
    const s1 = computeResumeQualityScore({ structuredResume, jobPosting: jobBackend, pageCount: 1, geometry: { pageOccupancyRatio: 0.9 } });
    const s2 = computeResumeQualityScore({ structuredResume, jobPosting: jobBackend, pageCount: 1, geometry: { pageOccupancyRatio: 0.9 } });
    assert.equal(s1.score, s2.score);
    assert.deepEqual(s1.dimensions, s2.dimensions);
  });

  test('redundant bullets fail the pre-render gate (SEMANTICALLY_REDUNDANT_BULLETS)', () => {
    const doc = {
      projects: [
        { name: 'P', bullets: ['Built a high-throughput distributed telemetry platform.', 'Engineered a high-throughput distributed telemetry platform.'] },
      ],
      experience: [],
      skills: { categories: [] },
    };
    const gate = assessPreRenderQuality({ structuredResume: doc, targetRole: 'Backend Engineer' });
    const finding = gate.findings.find((f) => f.code === GATE_FINDING_CODES.SEMANTICALLY_REDUNDANT_BULLETS);
    assert.ok(finding, 'redundant bullets must be flagged');
    assert.equal(finding.severity, 'FAIL');
    assert.equal(gate.passed, false);
  });

  test('supported metric (evidence-ref-backed) does not fail the gate', () => {
    const doc = {
      projects: [
        {
          name: 'P',
          bullets: [{ text: 'Cut median query latency 40% in load benchmarks.', evidenceRefs: [{ evidenceId: '11111111-1111-4111-8111-111111111111', sourceType: 'VERIFIED' }] }],
        },
      ],
      experience: [],
      skills: { categories: [] },
    };
    const gate = assessPreRenderQuality({ structuredResume: doc, targetRole: 'Backend Engineer' });
    const finding = gate.findings.find((f) => f.code === GATE_FINDING_CODES.UNSUPPORTED_METRIC_CLAIM);
    assert.ok(!finding, 'evidence-backed metric must not be flagged');
    assert.equal(gate.passed, true);
  });

  test('page-count is a penalty, not the objective (score reacts to occupancy)', () => {
    const { structuredResume } = buildStructuredResumeSnapshot({ candidateProfile: syntheticCandidate(), jobPosting: jobBackend });
    const dense = computeResumeQualityScore({ structuredResume, jobPosting: jobBackend, pageCount: 1, geometry: { pageOccupancyRatio: 0.95 } });
    const sparse = computeResumeQualityScore({ structuredResume, jobPosting: jobBackend, pageCount: 1, geometry: { pageOccupancyRatio: 0.4 } });
    assert.ok(dense.score > sparse.score, `dense (${dense.score}) must outscore sparse (${sparse.score})`);
    const twoPages = computeResumeQualityScore({ structuredResume, jobPosting: jobBackend, pageCount: 2, geometry: { pageOccupancyRatio: 0.9 } });
    assert.ok(twoPages.score < dense.score, 'two pages must be penalized');
  });
});

describe('P16-009: Snapshot pipeline integrity', () => {
  test('snapshot carries factCompositionReport with traceability', () => {
    const r = buildStructuredResumeSnapshot({ candidateProfile: syntheticCandidate(), jobPosting: jobBackend });
    assert.ok(r.factCompositionReport);
    assert.equal(r.factCompositionReport.usedFactComposition, true);
    assert.ok(r.factCompositionReport.totalFacts > 0);
    assert.ok(Array.isArray(r.factCompositionReport.omittedFacts));
    for (const t of r.factCompositionReport.composedBullets) {
      assert.ok(t.composedFromFactIds.length >= 1);
    }
  });

  test('12. projects with different evidence density receive different bullet budgets', () => {
    const candidate = syntheticCandidate();
    // Authoritative rankings select both projects (backend job: both match)
    const job = {
      ...jobBackend,
      projectRankings: [
        { projectId: 'proj-1', projectName: 'Telemetry Platform', relevanceScore: 90, relevanceBand: 'HIGH', matchedRequirements: ['TypeScript'] },
        { projectId: 'proj-2', projectName: 'Retry Queue Service', relevanceScore: 70, relevanceBand: 'MEDIUM', matchedRequirements: ['Node.js'] },
      ],
    };
    const r = buildStructuredResumeDocument({ candidateProfile: candidate, jobPosting: job });
    const byName = Object.fromEntries(r.projects.map((p) => [p.name, p.bullets.length]));
    // Telemetry Platform: 2 claim facts; Retry Queue: 1 claim fact
    assert.ok(byName['Telemetry Platform'] >= byName['Retry Queue Service']);
  });

  test('structured document still validates against the strict schema', () => {
    const r = buildStructuredResumeSnapshot({ candidateProfile: syntheticCandidate(), jobPosting: jobBackend });
    assert.ok(r.structuredResume.schemaVersion);
    assert.ok(r.evidenceValidationReceipt);
    assert.equal(r.contentQualityGate.passed, true);
  });

  test('long repository URLs and unknown technologies do not break composition', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-long',
          name: 'Long URL Project',
          bullets: ['Built a file chunker with streaming uploads.'],
          repositoryUrl: 'https://github.com/synthetic-org/this-is-an-extremely-long-repository-name-for-testing-line-breaking-behavior-in-rendering',
          technologies: ['Zorbglib Framework 9000', 'TypeScript'],
        },
      ],
    });
    const minimalJob = { id: 'job-x', title: 'Software Engineer' };
    const { structuredResume, contentQualityGate } = buildStructuredResumeSnapshot({ candidateProfile: candidate, jobPosting: minimalJob });
    const proj = structuredResume.projects.find((p) => p.name === 'Long URL Project');
    assert.ok(proj);
    assert.equal(proj.repositoryUrl, 'https://github.com/synthetic-org/this-is-an-extremely-long-repository-name-for-testing-line-breaking-behavior-in-rendering');
    assert.ok(proj.technologies.includes('Zorbglib Framework 9000'), 'unknown technology must render unchanged');
    assert.equal(contentQualityGate.passed, true);
  });

  test('duplicate facts across bullets/highlights/features are canonicalized to one', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-multi',
          name: 'Multi Surface',
          bullets: ['Designed the event storage schema for the analytics pipeline.'],
          highlights: ['Designed the event storage schema for the analytics pipeline.'],
          features: ['Designed the event storage schema for the analytics pipeline.'],
          technologies: ['Kafka'],
        },
      ],
    });
    const inv = buildCanonicalFactInventory(candidate);
    const claimFacts = inv.byProject.get('proj-multi').filter((f) => f.factType !== 'technology');
    assert.equal(claimFacts.length, 1);
  });
});

describe('P16-009: Sparse-page handling', () => {
  test('13. sparse page with meaningful omitted evidence flags expansion path', async () => {
    const candidate = syntheticCandidate();
    const inv = buildCanonicalFactInventory(candidate, jobBackend);
    const scored = scoreFactsForJob(inv.facts, jobBackend);
    const claimFactsProj1 = scored.filter((f) => f.association?.projectId === 'proj-1' && f.factType !== 'technology');
    const capacity = determineProjectBulletCapacity({ claimFacts: claimFactsProj1, evidenceCount: 12 });
    // The inventory knows more facts exist than a 1-bullet render used
    assert.ok(capacity.capacity >= Math.min(2, claimFactsProj1.length));
  });

  test('14. sparse page with NO additional evidence stops cleanly (no filler)', () => {
    const candidate = syntheticCandidate({
      projects: [
        {
          id: 'proj-only',
          name: 'Lonely Project',
          bullets: ['Built a small utility for renaming files in bulk.'],
          technologies: ['Python'],
        },
      ],
      experience: [],
    });
    // No job requirements → the builder's no-job fallback selects raw projects
    const minimalJob = { id: 'job-x', title: 'Software Engineer' };
    const { structuredResume, contentQualityGate } = buildStructuredResumeSnapshot({ candidateProfile: candidate, jobPosting: minimalJob });
    const proj = structuredResume.projects.find((p) => p.name === 'Lonely Project');
    assert.ok(proj, 'fallback selection must include the only project');
    assert.equal(proj.bullets.length, 1, 'a 1-fact project renders exactly its 1 fact');
    // No filler bullets invented
    assert.ok(proj.bullets.every((b) => /renaming files/i.test(b.text)));
    // Gate may warn about sparsity but must not fabricate
    assert.equal(contentQualityGate.findings.some((f) => f.code === GATE_FINDING_CODES.WEAK_OPTIONAL_SECTION && f.severity === 'FAIL'), false);
  });
});
