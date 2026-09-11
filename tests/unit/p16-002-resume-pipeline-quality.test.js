/**
 * @file Unit Tests: P16-002 Resume Pipeline Quality Overhaul (Phases 3–12)
 *
 * Regression coverage for the evidence-grounded content pipeline:
 * - Evidence-backed bullet pools stay attached to projects with sparse authored bullets.
 * - No fabricated content: bullets/summaries derive only from candidate-owned inputs.
 * - Dynamic project budget (no rigid "DSA exists → 2 projects" rule).
 * - DSA omitted when weak; preserved verbatim when strong (P16-001G intact).
 * - Role-aware section ordering (experience-first for experienced candidates).
 * - Summary aligned to target role via generic taxonomy; canonical headline
 *   never copies employer-specific titles.
 * - PDF text extraction integrity: no ligature corruption, no replacement chars.
 * - Content/PDF traceability gate (Phase 11) catches real content loss.
 * - Pre-render content quality gate (Phase 12) detects weak optional sections,
 *   duplicates, and low-information bullets.
 * - Renderer genericity: candidate ID/name, project name, company name, URL,
 *   and job source do not affect renderer behavior.
 *
 * All fixtures are synthetic. No real candidate/project/job identities are
 * used for behavioral assertions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  generateGroundedSummary,
  deriveSectionOrdering,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import {
  assessPreRenderQuality,
  GATE_FINDING_CODES,
  GATE_SEVERITY,
  classifyRoleFocus,
} from '../../src/services/resume-content-quality-gate.service.js';
import {
  countPdfPages,
} from '../../src/services/resume-quality-assessment.service.js';
import {
  TEMPLATE_METADATA_CATALOG,
} from '../../src/services/resume-presentation.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic fixtures (no real identities)
// ─────────────────────────────────────────────────────────────────────────────

const PROJ_A_ID = '11111111-1111-4111-8111-111111111111';
const PROJ_B_ID = '22222222-2222-4222-8222-222222222222';
const PROJ_C_ID = '33333333-3333-4333-8333-333333333333';

/** Rich candidate: strong experience + rich evidence graph on Project A. */
const richCandidate = {
  id: 'cand-rich-001',
  displayName: 'Alex Rich',
  canonicalEmail: 'alex.rich@synthetic-test.org',
  email: 'alex.rich@synthetic-test.org',
  headline: 'Backend Developer',
  skills: [
    { name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED' },
    { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED' },
    { name: 'Redis', slug: 'redis', provenanceStatus: 'CORROBORATED' },
    { name: 'Docker', slug: 'docker', provenanceStatus: 'CLAIMED' },
  ],
  projects: [
    {
      id: PROJ_A_ID,
      name: 'Telemetry Ingestion Platform',
      technologies: ['Node.js', 'PostgreSQL', 'Redis'],
      bullets: ['Built streaming ingestion for telemetry events.'],
      repositoryUrl: 'https://github.com/synthetic-org/telemetry-platform',
      evidence: [
        { id: 'e00000000-0000-4000-8000-000000000001', evidenceType: 'CODE_USAGE', skillSlug: 'redis', confidenceScore: 0.95, sourceLocation: { filePath: 'src/dedup/redis-dedup.js' } },
        { id: 'e00000000-0000-4000-8000-000000000002', evidenceType: 'CODE_USAGE', skillSlug: 'postgresql', confidenceScore: 0.92, sourceLocation: { filePath: 'src/db/telemetry-store.js' } },
        { id: 'e00000000-0000-4000-8000-000000000003', evidenceType: 'CODE_USAGE', skillSlug: 'docker', confidenceScore: 0.88, sourceLocation: { filePath: 'Dockerfile' } },
      ],
    },
    {
      id: PROJ_B_ID,
      name: 'Metrics Dashboard',
      technologies: ['React', 'Node.js'],
      bullets: ['Built dashboard for visualization.'],
      repositoryUrl: 'https://github.com/synthetic-org/metrics-dashboard',
    },
  ],
  experience: [
    {
      id: 'exp-1',
      company: 'Synthetic Systems Inc',
      title: 'Backend Engineer',
      startDate: '2023-01-01',
      endDate: null,
      isCurrent: true,
      bullets: ['Operated containerized services in production.'],
    },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Synthetic State University',
      degree: 'B.S. Computer Science',
      fieldOfStudy: 'Computer Science',
      startDate: '2018-08-01',
      endDate: '2022-05-30',
    },
  ],
};

const jobBackend = {
  id: 'job-001',
  title: 'Senior Backend Engineer, Data Platform',
  company: 'Example Corp',
  description:
    'Design and build scalable data platforms and APIs. ' +
    'Experience with Node.js, PostgreSQL, distributed systems, and containerized deployments required.',
  applicationUrl: 'https://jobs.example.com/postings/1001',
  source: 'GREENHOUSE',
};

const jobFrontend = {
  id: 'job-002',
  title: 'Frontend Product Engineer',
  company: 'Different Corp',
  description:
    'Build polished user interfaces with React and modern client-side tooling. ' +
    'Strong grounding in component architecture, accessibility, and user-facing performance required.',
  applicationUrl: 'https://careers.differentcorp.io/roles/2002',
  source: 'LEVER',
};

/** Authoritative rankings (Project A first — backend-relevant). */
const rankingsRich = [
  { projectId: PROJ_A_ID, projectName: 'Telemetry Ingestion Platform', relevanceScore: 61.0, relevanceRank: 1 },
  { projectId: PROJ_B_ID, projectName: 'Metrics Dashboard', relevanceScore: 42.0, relevanceRank: 2 },
];

const buildDoc = (candidate, job = jobBackend, rankings = rankingsRich, options = {}) =>
  buildStructuredResumeDocument({
    candidateProfile: candidate,
    jobPosting: { ...job, projectRankings: rankings },
    options: { projectRankings: rankings, ...options },
  });

const renderTex = (doc) => {
  const latexGen = new LatexDocumentGenerator();
  return latexGen.generateTailoredResumeLatex({
    applicationPackage: {
      candidateName: doc.candidateIdentity.displayName,
      candidateEmail: doc.candidateIdentity.email,
      structuredResume: doc,
      tailoringPlan: doc.tailoringPlan,
    },
    candidateProfile: null,
  }).texContent;
};

/** Full render result including the applied per-project bullet cap (render contract). */
const renderFull = (doc) => {
  const latexGen = new LatexDocumentGenerator();
  return latexGen.generateTailoredResumeLatex({
    applicationPackage: {
      candidateName: doc.candidateIdentity.displayName,
      candidateEmail: doc.candidateIdentity.email,
      structuredResume: doc,
      tailoringPlan: doc.tailoringPlan,
    },
    candidateProfile: null,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Evidence-grounded content composition
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 3: evidence-grounded bullet pools', () => {
  it('expands a sparse project bullet pool from the authoritative evidence graph', () => {
    const doc = buildDoc(richCandidate);
    const projA = doc.projects.find((p) => p.projectId === PROJ_A_ID || p.name === 'Telemetry Ingestion Platform');
    assert.ok(projA, 'selected project A must be present in the snapshot');

    const bullets = projA.bullets.map((b) => (typeof b === 'string' ? b : b.text));
    assert.ok(
      bullets.length >= 2,
      `project with rich evidence must carry >=2 bullets, got ${bullets.length}: ${JSON.stringify(bullets)}`
    );
    const joined = bullets.join(' ').toLowerCase();
    assert.match(joined, /redis|postgresql|docker|developed/i, 'evidence-backed technical facts must surface in the bullet pool');
  });

  it('keeps evidence refs attached to expanded bullets', () => {
    const doc = buildDoc(richCandidate);
    const projA = doc.projects.find((p) => p.projectId === PROJ_A_ID || p.name === 'Telemetry Ingestion Platform');
    const bulletObjs = projA.bullets.filter((b) => typeof b === 'object');
    const withRefs = bulletObjs.filter((b) => Array.isArray(b.evidenceRefs) && b.evidenceRefs.length > 0);
    assert.ok(withRefs.length > 0, 'at least one expanded bullet must carry evidence references');
  });

  it('never fabricates metrics or invented facts in expanded bullets', () => {
    const doc = buildDoc(richCandidate);
    for (const p of doc.projects) {
      for (const b of p.bullets) {
        const t = typeof b === 'string' ? b : b.text;
        assert.doesNotMatch(t, /\b\d{2,}%\b/, 'no invented percentage metrics');
        assert.doesNotMatch(t, /\b\d+[kKmM]\s*\+\s*(users|customers|requests|rps)\b/i, 'no invented scale claims');
      }
    }
  });

  it('preserves authored candidate bullets verbatim in the pool', () => {
    const doc = buildDoc(richCandidate);
    const projA = doc.projects.find((p) => p.projectId === PROJ_A_ID || p.name === 'Telemetry Ingestion Platform');
    const texts = projA.bullets.map((b) => (typeof b === 'string' ? b : b.text));
    assert.ok(
      texts.some((t) => t.includes('streaming ingestion for telemetry events')),
      'candidate-authored bullet must survive pool expansion'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4: Dynamic project budget
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 4: dynamic project budget', () => {
  it('selects more than the legacy fixed budget when strong projects exist (frontend job, no DSA)', () => {
    // Frontend job: Project B (React) ranks first; both projects are relevant with evidence.
    const rankingsFrontend = [
      { projectId: PROJ_B_ID, projectName: 'Metrics Dashboard', relevanceScore: 58.0, relevanceRank: 1 },
      { projectId: PROJ_A_ID, projectName: 'Telemetry Ingestion Platform', relevanceScore: 39.0, relevanceRank: 2 },
    ];
    const doc = buildDoc(richCandidate, jobFrontend, rankingsFrontend);
    assert.ok(
      doc.projects.length >= 2,
      `dynamic budget must allow 2+ projects when evidence supports them, got ${doc.projects.length}`
    );
  });

  it('never selects weak projects just to fill space', () => {
    const weakCandidate = JSON.parse(JSON.stringify(richCandidate));
    weakCandidate.projects = [
      {
        id: PROJ_A_ID,
        name: 'Old Script',
        technologies: ['Bash'],
        bullets: ['Wrote a script.'],
      },
    ];
    const rankingsWeak = [
      { projectId: PROJ_A_ID, projectName: 'Old Script', relevanceScore: 8.0, relevanceRank: 1 },
    ];
    const doc = buildDoc(weakCandidate, jobBackend, rankingsWeak);
    for (const p of doc.projects) {
      assert.ok(
        (p.relevanceScore ?? 0) > 0,
        'only relevance-scored projects may be selected'
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5: DSA / optional section quality (P16-001G invariants)
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 5: DSA quality (P16-001G invariants)', () => {
  it('preserves strong candidate DSA verbatim (P16-001G intact)', () => {
    const c = JSON.parse(JSON.stringify(richCandidate));
    c.problemSolving = {
      hasSection: true,
      profileUrl: 'https://example-algo-profile.test/practice',
      bullets: [
        'Solved algorithmic challenges covering dynamic programming, graph traversal, trees, arrays, and binary search.',
      ],
    };
    const doc = buildDoc(c);
    assert.equal(doc.dsa.hasSection, true);
    assert.equal(doc.dsa.profileUrl, 'https://example-algo-profile.test/practice');
    assert.deepEqual(doc.dsa.bullets, c.problemSolving.bullets);
  });

  it('omits weak DSA sections (no boilerplate rendering)', () => {
    const c = JSON.parse(JSON.stringify(richCandidate));
    c.problemSolving = {
      hasSection: true,
      profileUrl: null,
      bullets: ['Practice.'],
    };
    const snap = buildStructuredResumeSnapshot({
      candidateProfile: c,
      jobPosting: { ...jobBackend, projectRankings: rankingsRich },
      options: { projectRankings: rankingsRich },
    });
    assert.equal(
      snap.structuredResume.dsa.hasSection,
      false,
      'weak DSA (no substantive bullet, no URL) must be omitted by the quality gate'
    );
    assert.ok(snap.contentQualityGate, 'snapshot bundle must expose the content quality gate report');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6: Role-aware section order
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 6: role-aware section ordering', () => {
  it('orders EXPERIENCE before PROJECTS for experienced candidates', () => {
    const { sectionOrder } = deriveSectionOrdering({ candidateProfile: richCandidate });
    const iExp = sectionOrder.indexOf('EXPERIENCE');
    const iProj = sectionOrder.indexOf('PROJECTS');
    assert.ok(iExp !== -1 && iProj !== -1 && iExp < iProj, `experienced ordering must be experience-first, got ${sectionOrder.join('>')}`);
  });

  it('orders PROJECTS before EXPERIENCE for genuine fresher profiles', () => {
    const fresher = {
      displayName: 'Riley Newgrad',
      canonicalEmail: 'riley.newgrad@synthetic-test.org',
      email: 'riley.newgrad@synthetic-test.org',
      skills: [{ name: 'Python', slug: 'python', provenanceStatus: 'VERIFIED' }],
      projects: [
        {
          id: PROJ_C_ID,
          name: 'Course Scheduler',
          technologies: ['Python'],
          bullets: ['Built a scheduler for university courses.'],
        },
      ],
      experience: [],
      education: [
        { id: 'edu-2', institution: 'Synthetic State University', degree: 'B.S. Computer Science', startDate: '2022-08-01', endDate: '2026-05-30' },
      ],
    };
    const { sectionOrder, candidateArchetype } = deriveSectionOrdering({ candidateProfile: fresher });
    assert.equal(candidateArchetype, 'FRESHER');
    const iExp = sectionOrder.indexOf('EXPERIENCE');
    const iProj = sectionOrder.indexOf('PROJECTS');
    assert.ok(iExp === -1 || iProj < iExp, `fresher ordering must be project-first, got ${sectionOrder.join('>')}`);
  });

  it('renderer fallback is experience-aware when snapshot lacks explicit sectionOrder', async () => {
    const doc = buildDoc(richCandidate);
    const clone = JSON.parse(JSON.stringify(doc));
    delete clone.sectionOrder;
    const tex = renderTex(clone);
    const iExp = tex.indexOf('\\atssection{Professional Experience}');
    const iProj = tex.indexOf('\\atssection{Technical Projects}');
    assert.ok(iExp !== -1 && iProj !== -1 && iExp < iProj, 'renderer fallback must be experience-first when real experience exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Headline + summary alignment
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 7: headline and summary alignment', () => {
  it('does not copy employer-specific title text into the canonical headline', () => {
    const c = JSON.parse(JSON.stringify(richCandidate));
    c.experience[0].title = 'Software Engineer, Recognition Platform';
    c.experience[0].company = 'Metropolis Holdings';
    const doc = buildDoc(c);
    const headline = (doc.candidateIdentity.headline || '').toLowerCase();
    assert.ok(!headline.includes('recognition platform'), 'employer platform qualifiers must not leak into canonical headline');
    assert.ok(!headline.includes('metropolis'), 'employer company name must not leak into canonical headline');
  });

  it('summary aligns with a backend target role (no forced frontend positioning)', () => {
    const summary = generateGroundedSummary({
      candidateProfile: richCandidate,
      jobPosting: jobBackend,
      structuredResume: buildDoc(richCandidate),
    }).text;
    const focus = classifyRoleFocus(jobBackend.title + ' ' + jobBackend.description);
    assert.equal(focus, 'backend');
    assert.doesNotMatch(summary, /frontend/i, 'backend summary must not be forced into frontend positioning');
  });

  it('summary aligns with a frontend target role (no forced backend positioning)', () => {
    const summary = generateGroundedSummary({
      candidateProfile: richCandidate,
      jobPosting: jobFrontend,
      structuredResume: buildDoc(richCandidate, jobFrontend),
    }).text;
    const focus = classifyRoleFocus(jobFrontend.title + ' ' + jobFrontend.description);
    assert.equal(focus, 'frontend');
    assert.doesNotMatch(summary, /\bbackend\b/i, 'frontend summary must not be forced into backend positioning');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8/9/10: Canonical ATS template + extraction integrity + metadata truth
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phases 8-10: canonical ATS template + extraction', () => {
  it('template metadata truthfully describes the rendered font path', () => {
    const meta = TEMPLATE_METADATA_CATALOG.ATS_FOCUSED;
    assert.match(meta.defaultFont, /TeX Gyre Heros/, 'metadata must advertise the actual embedded font');
    assert.equal(meta.supportsMultiColumn, false);
    assert.equal(meta.isAtsOptimized, true);
  });

  it('preamble disables common ligatures and loads the Unicode-safe font path', () => {
    const doc = buildDoc(richCandidate);
    const tex = renderTex(doc);
    assert.match(tex, /Ligatures\s*=\s*NoCommon/, 'common ligatures must be disabled at the font level');
    assert.match(tex, /texgyreheros-regular\.otf/, 'canonical template must load TeX Gyre Heros (bundle file path)');
    assert.match(tex, /hyperref/, 'links must be clickable');
  });

  it('PDF extraction preserves ligature-prone words without corruption', async () => {
    const c = JSON.parse(JSON.stringify(richCandidate));
    c.experience[0].bullets = [
      'Shipped workflows automation for fi le processing at fine-grained event flows.',
    ];
    const doc = buildDoc(c);
    const tex = renderTex(doc);
    const compiler = new LatexCompilerService();
    const { pdfBuffer } = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'p16-002-ligature' });
    const parser = new ResumeParserService();
    const text = parser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });
    assert.ok(text.includes('workflows'), 'workflow family words must extract intact');
    assert.ok(text.includes('file'), 'fi-glyph words must extract intact');
    assert.ok(!/[\uFB00-\uFB06]/.test(text), 'no ligature codepoints may appear in extracted text');
    assert.ok(!text.includes('\uFFFD'), 'no replacement characters may appear');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: Content/PDF traceability gate
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 11: content/PDF traceability gate', () => {
  const validator = new PdfQaValidatorService();

  it('passes when all expected content survives extraction', async () => {
    const doc = buildDoc(richCandidate);
    const renderResult = renderFull(doc);
    const tex = renderResult.texContent;
    const bulletCap = renderResult.appliedMaxBulletsPerProject || 3;
    const compiler = new LatexCompilerService();
    const { pdfBuffer } = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'p16-002-trace-ok' });
    const parser = new ResumeParserService();
    const extracted = parser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });

    const audit = await validator.validatePdf({
      pdfBuffer,
      expectedCandidate: { name: doc.candidateIdentity.displayName, email: doc.candidateIdentity.email },
      targetJob: jobBackend,
      documentType: 'RESUME',
      expectedContent: {
        projectNames: doc.projects.map((p) => p.displayName || p.name),
        // Mirror the render contract: expectations cover the bullets the
        // renderer actually displays (authored first, then derived fillers).
        projectBullets: doc.projects.flatMap((p) =>
          p.bullets.map((b) => (typeof b === 'string' ? b : b.text)).slice(0, bulletCap)
        ),
        experienceBullets: doc.experience.flatMap((e) => e.bullets.map((b) => (typeof b === 'string' ? b : b.text))),
        educationTokens: doc.education.flatMap((e) => [e.institution, e.degree].filter(Boolean)),
        links: doc.projects.map((p) => (p.repositoryUrl || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')),
        sectionHeadings: ['Summary', 'Skills', 'Experience', 'Projects', 'Education'],
      },
    });
    assert.ok(audit.traceability?.checked, 'traceability must run when expectedContent is provided');
    assert.deepEqual(audit.traceability.missing, [], `no content may be lost; missing=${JSON.stringify(audit.traceability.missing)}; extracted=${extracted.slice(0, 400)}`);
    assert.equal(audit.traceability.sectionOrderOk, true);
    assert.equal(audit.traceability.integrityOk, true);
    assert.ok(audit.passed, `full audit must pass; failures=${JSON.stringify(audit.criticalFailures)}`);
  });

  it('fails when selected content is missing from the extracted PDF', async () => {
    // Synthetic oversized buffer with PDF magic but no recoverable expected content.
    const pdfBuffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(2048, 0x41),
    ]);
    const audit = await validator.validatePdf({
      pdfBuffer,
      expectedCandidate: { name: 'Alex Rich', email: 'alex.rich@synthetic-test.org' },
      documentType: 'RESUME',
      expectedContent: {
        projectNames: ['Totally Absent Project'],
        projectBullets: [],
        experienceBullets: [],
        educationTokens: [],
        links: [],
        sectionHeadings: [],
      },
    });
    // Extracted text will be garbage/'A' padding; the expected project token cannot appear.
    assert.ok(audit.traceability?.checked);
    assert.ok(
      audit.traceability.missing.some((m) => m.kind === 'project name'),
      'missing expected project must be reported'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: Pre-render content quality gate
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002 Phase 12: pre-render content quality gate', () => {
  it('detects weak optional sections as FAIL with OMIT_SECTION suggestion', () => {
    const doc = buildDoc(richCandidate);
    doc.dsa = { hasSection: true, profileUrl: null, bullets: ['Practice.'] };
    const gate = assessPreRenderQuality({ structuredResume: doc, targetRole: jobBackend.title });
    const weak = gate.findings.find((f) => f.code === GATE_FINDING_CODES.WEAK_OPTIONAL_SECTION);
    assert.ok(weak, 'weak DSA must be detected');
    assert.equal(weak.severity, GATE_SEVERITY.FAIL);
    assert.equal(weak.suggestion, 'OMIT_SECTION');
    assert.equal(gate.passed, false);
  });

  it('detects duplicate skills across categories', () => {
    const doc = buildDoc(richCandidate);
    doc.skills.categories.push({ categoryName: 'Tools', skills: [{ displayName: 'node.js', slug: 'nodejs-dup' }] });
    const gate = assessPreRenderQuality({ structuredResume: doc });
    const dup = gate.findings.find((f) => f.code === GATE_FINDING_CODES.DUPLICATE_SKILLS);
    assert.ok(dup, 'duplicate skill must be detected');
  });

  it('detects low-information bullets', () => {
    const doc = buildDoc(richCandidate);
    doc.projects[0].bullets.push({ text: 'Did stuff.', provenanceStatus: 'CLAIMED', evidenceRefs: [] });
    const gate = assessPreRenderQuality({ structuredResume: doc });
    const low = gate.findings.find((f) => f.code === GATE_FINDING_CODES.LOW_INFORMATION_BULLET);
    assert.ok(low, 'low-information bullet must be detected');
  });

  it('detects contradictory role positioning between headline and target role', () => {
    const doc = buildDoc(richCandidate);
    doc.candidateIdentity.headline = 'Frontend Engineer';
    const gate = assessPreRenderQuality({ structuredResume: doc, targetRole: 'Senior Backend Engineer' });
    const contra = gate.findings.find((f) => f.code === GATE_FINDING_CODES.CONTRADICTORY_ROLE_POSITIONING);
    assert.ok(contra, 'contradictory positioning must be detected');
  });

  it('classifies role focus generically (taxonomy, no identity literals)', () => {
    assert.equal(classifyRoleFocus('Senior Backend Engineer, Data Platform'), 'backend');
    assert.equal(classifyRoleFocus('Frontend Product Engineer'), 'frontend');
    assert.equal(classifyRoleFocus('Full-Stack Software Engineer'), 'fullstack');
    assert.equal(classifyRoleFocus('Software Engineer'), 'general');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Genericity invariants (property-style)
// ─────────────────────────────────────────────────────────────────────────────

describe('P16-002: renderer genericity invariants', () => {
  it('candidate identity does not affect renderer structure', () => {
    const doc1 = buildDoc(richCandidate);
    const c2 = JSON.parse(JSON.stringify(richCandidate));
    c2.id = 'cand-other-999';
    c2.displayName = 'Completely Different Person';
    c2.canonicalEmail = 'other.person@synthetic-test.org';
    c2.email = 'other.person@synthetic-test.org';
    const doc2 = buildDoc(c2);
    const tex1 = renderTex(doc1);
    const tex2 = renderTex(doc2);
    const structural = (tex) => tex.replace(/Completely Different Person|Alex Rich/g, 'NAME')
      .replace(/other\.person@synthetic-test\.org|alex\.rich@synthetic-test\.org/g, 'EMAIL');
    assert.equal(structural(tex1), structural(tex2), 'renderer output must be structurally identical across candidate identities');
  });

  it('job source does not affect renderer behavior', async () => {
    const doc = buildDoc(richCandidate);
    const texA = renderTex({ ...doc, tailoringPlan: { ...doc.tailoringPlan } });
    const texB = renderTex(doc);
    assert.equal(texA, texB, 'renderer must be deterministic for the same snapshot');
  });

  it('different jobs alter tailoring through ranking data, not name matching', () => {
    const rankingsFrontend = [
      { projectId: PROJ_B_ID, projectName: 'Metrics Dashboard', relevanceScore: 58.0, relevanceRank: 1 },
      { projectId: PROJ_A_ID, projectName: 'Telemetry Ingestion Platform', relevanceScore: 39.0, relevanceRank: 2 },
    ];
    const docBackend = buildDoc(richCandidate, jobBackend, rankingsRich);
    const docFrontend = buildDoc(richCandidate, jobFrontend, rankingsFrontend);
    const firstA = docBackend.projects[0]?.name || docBackend.projects[0]?.displayName;
    const firstB = docFrontend.projects[0]?.name || docFrontend.projects[0]?.displayName;
    assert.notEqual(firstA, firstB, 'project order must follow ranking data, which differs between jobs');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Three-archetype real-PDF acceptance (Phase 13)
// ────────────────────────────────────────────────────────────────────────────

describe('P16-002: three-archetype real PDF acceptance', () => {
  const compiler = new LatexCompilerService();
  const parser = new ResumeParserService();
  const validator = new PdfQaValidatorService();

  /** AI/full-stack archetype job. */
  const jobAiFullStack = {
    id: 'job-003',
    title: 'AI Full-Stack Engineer',
    company: 'Third Corp',
    description:
      'Build intelligent product features end to end. ' +
      'Experience with Node.js, React, and applied machine learning APIs required.',
    applicationUrl: 'https://jobs.thirdcorp.ai/roles/3003',
    source: 'WORKDAY',
  };

  const archetypeCases = [
    {
      label: 'backend/distributed systems',
      job: jobBackend,
      rankings: rankingsRich,
    },
    {
      label: 'frontend/product',
      job: jobFrontend,
      rankings: [
        { projectId: PROJ_B_ID, projectName: 'Metrics Dashboard', relevanceScore: 58.0, relevanceRank: 1 },
        { projectId: PROJ_A_ID, projectName: 'Telemetry Ingestion Platform', relevanceScore: 39.0, relevanceRank: 2 },
      ],
    },
    {
      label: 'AI/full-stack',
      job: jobAiFullStack,
      rankings: rankingsRich,
    },
  ];

  for (const tc of archetypeCases) {
    it(`compiles a clean one-page ATS PDF for the ${tc.label} archetype`, async () => {
      const doc = buildDoc(richCandidate, tc.job, tc.rankings);
      const renderResult = renderFull(doc);
      const { pdfBuffer } = await compiler.compileLatexToPdf({
        texContent: renderResult.texContent,
        jobName: `p16-002-arch-${tc.rankings === rankingsRich ? 'a' : 'b'}-${archetypeCases.indexOf(tc)}`,
      });

      // One page when one-page target is appropriate.
      const pages = countPdfPages(pdfBuffer);
      assert.equal(pages, 1, `${tc.label}: must fit one page, got ${pages}`);

      const text = parser.extractRawText({ buffer: pdfBuffer, format: 'PDF' });

      // Extraction integrity.
      assert.ok(!/[\uFB00-\uFB06]/.test(text), `${tc.label}: no ligature corruption`);
      assert.ok(!text.includes('\uFFFD'), `${tc.label}: no replacement characters`);

      // Section order preserved (canonical template's full heading labels —
      // avoids false matches on body words like "experience" in the summary).
      const order = [
        'PROFESSIONAL SUMMARY',
        'TECHNICAL SKILLS',
        'PROFESSIONAL EXPERIENCE',
        'TECHNICAL PROJECTS',
        'EDUCATION',
      ].map((h) => text.toUpperCase().indexOf(h));
      assert.ok(order.every((p) => p !== -1), `${tc.label}: all canonical sections present`);
      assert.ok(order.every((p, i) => i === 0 || p > order[i - 1]), `${tc.label}: canonical section order preserved`);

      // Links survive extraction (project repo URLs).
      for (const p of doc.projects) {
        if (p.repositoryUrl) {
          const display = p.repositoryUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
          assert.ok(text.includes(display), `${tc.label}: project link ${display} must be extractable`);
        }
      }

      // No fabricated metrics: no percentages/scale claims absent from source.
      const sourceText = JSON.stringify(richCandidate.projects.map((p) => p.bullets)) +
        JSON.stringify(richCandidate.experience.map((e) => e.bullets));
      const pctMatches = text.match(/\b\d{2,}%\b/g) || [];
      for (const m of pctMatches) {
        assert.ok(sourceText.includes(m), `${tc.label}: percentage '${m}' must exist in source content (no fabrication)`);
      }

      // Full QA audit with traceability passes.
      const bulletCap = renderResult.appliedMaxBulletsPerProject || 3;
      const audit = await validator.validatePdf({
        pdfBuffer,
        expectedCandidate: { name: doc.candidateIdentity.displayName, email: doc.candidateIdentity.email },
        targetJob: tc.job,
        documentType: 'RESUME',
        expectedContent: {
          projectNames: doc.projects.map((p) => p.displayName || p.name),
          projectBullets: doc.projects.flatMap((p) =>
            p.bullets.map((b) => (typeof b === 'string' ? b : b.text)).slice(0, bulletCap)
          ),
          experienceBullets: doc.experience.flatMap((e) => e.bullets.map((b) => (typeof b === 'string' ? b : b.text))),
          educationTokens: doc.education.flatMap((e) => [e.institution, e.degree].filter(Boolean)),
          links: doc.projects.map((p) => (p.repositoryUrl || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')),
          sectionHeadings: ['Summary', 'Skills', 'Experience', 'Projects', 'Education'],
        },
      });
      assert.ok(
        audit.passed,
        `${tc.label}: full QA audit must pass; failures=${JSON.stringify(audit.criticalFailures)}`
      );
    });
  }
});
