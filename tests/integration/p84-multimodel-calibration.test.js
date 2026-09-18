/**
 * @file P84 Integration: Multi-Model Blind ATS Benchmark & Calibration Suite
 *
 * Validates the full integration of:
 * 1. Real Tectonic PDF compilation, physical bytes, and SHA-256 hash provenance.
 * 2. Frozen deterministic evaluation under scoreVersion: "p82.0".
 * 3. External multi-model benchmark evaluation (Claude 70, Gemini 82, Grok 78).
 * 4. Preservation of cross-model disagreement (Job Match range 16, Overall range 12).
 * 5. Finding-level consensus and conflict classification (CONSENSUS, MAJORITY, MINORITY, CONFLICTING).
 * 6. Hardened generation safety: safe normalization, blocking unbacked AWS, blocking fabricated metrics.
 * 7. Visible URL preservation and date range normalization in rendered PDF.
 * 8. Formal, honest production verdict declaration:
 *    "IMPLEMENTATION COMPLETE / CALIBRATION EVIDENCE INSUFFICIENT FOR REAL-WORLD RECRUITER / ATS MARKET CLAIM"
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  P84_TARGET_JOB,
  P84_RESUME_TEXT,
  P84_EVALUATIONS,
  P84_CLAUDE_EVALUATION,
  P84_GEMINI_EVALUATION,
  P84_GROK_EVALUATION,
} from '../../src/domain/career/calibration/fixtures/p84-multimodel-fixtures.js';

import {
  calculateMultiModelStatistics,
  classifyDimensionDisagreement,
  extractFindingConsensus,
  auditClaimEvidenceProvenance,
  evaluateMultiModelCalibrationReport,
} from '../../src/domain/career/calibration/multimodel-calibration-engine.js';

import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('P84 Integration: Multi-Model Blind ATS Benchmark & Calibration', () => {
  const compiler = new LatexCompilerService();
  const latexGenerator = new LatexDocumentGenerator();

  // ── 1. Real PDF Compilation & SHA-256 Hash Provenance ─────────────────────
  it('Branch 1: Compiles physical PDF via Tectonic and establishes SHA-256 byte provenance', async () => {
    const candidateStructured = {
      candidateIdentity: {
        displayName: 'Vishwanath Nishad',
        email: 'vishwanath@candidate.io',
        phone: '+91 9876543210',
        links: [
          { platform: 'LINKEDIN', label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
          { platform: 'GITHUB', label: 'GitHub', url: 'https://github.com/vishwanath' },
          { platform: 'PORTFOLIO', label: 'Portfolio', url: 'https://vishwanath.dev' },
          { platform: 'LEETCODE', label: 'LeetCode', url: 'https://leetcode.com/vishwanath' },
        ],
      },
      summary: {
        text: 'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI) and Node.js (Express). Proven ability to deliver production-ready applications with PostgreSQL and modular service design.',
      },
      skills: {
        categories: [
          {
            categoryName: 'Languages & Core Systems',
            skills: [{ name: 'Python' }, { name: 'TypeScript' }, { name: 'JavaScript' }, { name: 'SQL' }],
          },
          {
            categoryName: 'Frontend Development',
            skills: [{ name: 'React' }, { name: 'Next.js' }, { name: 'Tailwind CSS' }],
          },
          {
            categoryName: 'Backend & APIs',
            skills: [{ name: 'Node.js' }, { name: 'Express.js' }, { name: 'REST APIs' }],
          },
          {
            categoryName: 'Databases & Tools',
            skills: [{ name: 'PostgreSQL' }, { name: 'Redis' }, { name: 'Prisma ORM' }, { name: 'Git' }],
          },
        ],
      },
      projects: [
        {
          name: 'Collaborative Task Manager',
          displayName: 'Collaborative Task Manager',
          technologies: ['TypeScript', 'Next.js', 'Express.js', 'PostgreSQL', 'Prisma'],
          bullets: [
            { text: 'Architected responsive task management platform using Next.js and TypeScript with server-side rendering.' },
            { text: 'Implemented RESTful CRUD APIs with Node.js, Express.js, and Prisma ORM backed by PostgreSQL.' },
            { text: 'Engineered role-based access control and JWT authentication for secure session management.' },
          ],
        },
        {
          name: 'AI-Powered Code Review Assistant',
          displayName: 'AI-Powered Code Review Assistant',
          technologies: ['Python', 'FastAPI', 'Redis', 'Next.js'],
          bullets: [
            { text: 'Built automated code review service integrating OpenAI API with asynchronous FastAPI endpoints.' },
            { text: 'Automated code evaluation across multiple repositories using asynchronous webhook queues.' },
            { text: 'Integrated Redis caching layer reducing redundant API evaluations and latency for repeated diffs.' },
          ],
        },
      ],
      experience: [
        {
          title: 'Full Stack Developer Intern',
          company: 'FTV Saloon',
          startDate: '2024-06',
          endDate: '2024-09',
          bullets: [
            { text: 'Designed and implemented modular RESTful APIs for core scheduling and customer operations.' },
            { text: 'Optimized critical backend database queries, accelerating query execution times.' },
            { text: 'Built secure role-based access control (RBAC) middleware for multi-tenant branch authentication.' },
          ],
        },
      ],
      education: [
        {
          degree: 'B.Tech in Electronics Engineering',
          institution: 'Dr. A.P.J. Abdul Kalam Technical University',
          startDate: '2021',
          endDate: '2025',
        },
      ],
      dsa: {
        hasSection: true,
        bullets: ['LeetCode: 300+ problems solved across Data Structures, Algorithms, and System Design fundamentals.'],
      },
    };

    // 1. Generate authentic LaTeX document
    const latexResult = latexGenerator.generateTailoredResumeLatex({
      applicationPackage: {
        structuredResume: candidateStructured,
        jobPosting: P84_TARGET_JOB,
      },
      layoutOverrides: { maxBulletsPerProject: 3 },
    });
    const texContent = latexResult.texContent;

    assert.ok(texContent.includes('\\documentclass'));
    // Verify visible URL preservation in LaTeX (Section 18.C)
    assert.ok(texContent.includes('linkedin.com/in/vishwanath-nishad'));
    assert.ok(texContent.includes('github.com/vishwanath'));
    // Verify date range normalization (Section 18.D)
    assert.ok(texContent.includes('Jun 2024 -- Sep 2024'));

    // 2. Compile real PDF via local Tectonic binary
    const compileResult = await compiler.compileLatexToPdf({
      texContent,
      jobName: 'p84-candidate-verified',
    });

    assert.equal(compileResult.success, true);
    assert.ok(Buffer.isBuffer(compileResult.pdfBuffer));
    assert.ok(compileResult.pdfBuffer.length > 500);

    const pdfSha256 = createHash('sha256').update(compileResult.pdfBuffer).digest('hex');
    assert.equal(pdfSha256.length, 64);
  });

  // ── 2. Deterministic Engine Evaluation Under Frozen p82.0 Policy ───────────
  it('Branch 2: Evaluates deterministic engine under frozen p82.0 with inspectable score separation', () => {
    const candidateStructured = {
      summary: {
        text: 'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python and Node.js. Experienced with PostgreSQL and React.',
      },
      skills: {
        categories: [
          { categoryName: 'Languages', skills: [{ name: 'Python' }, { name: 'TypeScript' }, { name: 'JavaScript' }] },
          { categoryName: 'Frontend', skills: [{ name: 'React' }, { name: 'Next.js' }] },
          { categoryName: 'Backend & DB', skills: [{ name: 'Node.js' }, { name: 'Express.js' }, { name: 'PostgreSQL' }, { name: 'REST APIs' }] },
        ],
      },
      projects: [
        {
          name: 'Task Manager',
          technologies: ['TypeScript', 'Next.js', 'Express.js', 'PostgreSQL'],
          bullets: [{ text: 'Built RESTful CRUD APIs using Express.js and PostgreSQL.' }],
        },
      ],
      experience: [],
    };

    const atsReport = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: P84_RESUME_TEXT,
      structuredResume: candidateStructured,
    });

    const keywordReport = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: P84_TARGET_JOB,
      structuredResume: candidateStructured,
      extractedText: P84_RESUME_TEXT,
    });

    const qualityReport = evaluateResumeWritingQuality({
      structuredResume: candidateStructured,
    });

    const claimValidationReport = {
      valid: true,
      rejected: false,
      violations: [],
    };

    const jobMatchReport = {
      jobMatchScore: 78,
      confidence: 0.90,
    };

    const engineReport = generateUnifiedQualityReport({
      atsParseabilityReport: atsReport,
      jobMatchReport,
      keywordCoverageReport: keywordReport,
      contentQualityReport: qualityReport,
      claimValidationReport,
      scoreVersion: 'p82.0',
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.equal(engineReport.scoreVersion, 'p82.0');
    assert.equal(engineReport.provenance.scoreVersion, 'p82.0');
    assert.ok(engineReport.publishableScore >= 70);
    assert.equal(typeof engineReport.dimensions.atsParseability.score, 'number');
    assert.equal(typeof engineReport.dimensions.jobMatch.score, 'number');
    assert.equal(typeof engineReport.dimensions.contentQuality.score, 'number');

    // ── 3. Multi-Model Benchmark Comparison ──────────────────────────────────
    const calReport = evaluateMultiModelCalibrationReport({
      engineReport,
      evaluations: P84_EVALUATIONS,
    });

    assert.equal(calReport.benchmarkVersion, 'p84.0');
    assert.equal(calReport.scoreNaming, 'ATS Compatibility & Job Match Score');

    // Multi-model descriptive statistics
    assert.equal(calReport.overallStatistics.claude, 70);
    assert.equal(calReport.overallStatistics.gemini, 82);
    assert.equal(calReport.overallStatistics.grok, 78);
    assert.equal(calReport.overallStatistics.external_model_mean, 76.67);
    assert.equal(calReport.overallStatistics.external_model_median, 78);
    assert.equal(calReport.overallStatistics.external_model_range, 12);

    // Dimension disagreement preservation (Job Match range = 16, Evidence Integrity = 16, Overall = 12)
    const jmDim = calReport.dimensionAgreement.find((d) => d.dimension === 'Job Match');
    assert.equal(jmDim.range, 16);
    assert.equal(jmDim.disagreementLevel, 'HIGH');

    const eiDim = calReport.dimensionAgreement.find((d) => d.dimension === 'Evidence Integrity');
    assert.equal(eiDim.range, 16);
    assert.equal(eiDim.disagreementLevel, 'HIGH');

    // Consensus findings
    const nestFinding = calReport.findingConsensus.find((f) => f.finding === 'NESTJS_UNSUPPORTED');
    assert.equal(nestFinding.consensus, 'CONSENSUS');
    assert.equal(nestFinding.actionableForOptimizer, true);

    const cloudFinding = calReport.findingConsensus.find((f) => f.finding === 'CLOUD_PROVIDER_GAP');
    assert.equal(cloudFinding.consensus, 'CONSENSUS');

    // Conflicting findings (Redis satisfies NoSQL)
    const redisFinding = calReport.findingConsensus.find((f) => f.finding === 'REDIS_SATISFIES_NOSQL');
    assert.equal(redisFinding.consensus, 'CONFLICTING');
    assert.equal(redisFinding.actionableForOptimizer, false, 'Must not auto-optimize on conflicting finding');

    // Production verdict honesty
    assert.equal(calReport.sampleSize, 1);
    assert.equal(calReport.isStatisticallySufficient, false);
    assert.equal(calReport.calibrationType, 'CASE_STUDY');
    assert.equal(
      calReport.productionVerdict,
      'IMPLEMENTATION COMPLETE / CALIBRATION EVIDENCE INSUFFICIENT FOR REAL-WORLD RECRUITER / ATS MARKET CLAIM'
    );
  });

  // ── 3. Generation Safety & Evidence Integrity (Anti-Gaming) ───────────────
  it('Branch 3: Proves AI generation safety blocks unevidenced AWS and ungrounded metrics', () => {
    const candidateProfile = {
      facts: [
        { text: 'Engineered RESTful APIs with Node.js, Express, and PostgreSQL.' },
      ],
    };

    const structuredResume = {
      summary: { text: 'Full-stack engineer specialized in Node.js and AWS.' },
      skills: { categories: [{ categoryName: 'Cloud', skills: ['AWS'] }] },
      projects: [],
      experience: [],
    };

    // 1. Audit AWS: Missing candidate evidence -> UNSUPPORTED, UNSAFE
    const awsAudit = auditClaimEvidenceProvenance('AWS', { candidateProfile, structuredResume });
    assert.equal(awsAudit.status, 'UNSUPPORTED');
    assert.equal(awsAudit.optimizationSafety, 'UNSAFE');
    assert.ok(awsAudit.decision.includes('DO NOT add AWS'));

    // 2. Audit NestJS: Missing project evidence -> UNSUPPORTED, UNSAFE
    const nestAudit = auditClaimEvidenceProvenance('NestJS', { candidateProfile, structuredResume });
    assert.equal(nestAudit.status, 'UNSUPPORTED');
    assert.equal(nestAudit.optimizationSafety, 'UNSAFE');

    // 3. Audit 40% Metric: Lacks baseline/measurement method -> PARTIALLY_SUPPORTED, CONDITIONAL
    const metricAudit = auditClaimEvidenceProvenance('40% page-load reduction', { candidateProfile, structuredResume });
    assert.equal(metricAudit.status, 'PARTIALLY_SUPPORTED');
    assert.equal(metricAudit.optimizationSafety, 'CONDITIONAL');

    // 4. Claim validator strictly fails closed if an unbacked metric is composed into a claim
    const claimValidator = new ResumeClaimValidationService();
    const fakeClaimResult = claimValidator.validateClaim(
      {
        claimId: 'claim-fake-metric',
        text: 'Optimized database queries reducing page load times by 40%.',
        composedFromFactIds: [], // 0 fact IDs
        sectionOwnerType: 'EXPERIENCE',
        sectionOwnerId: 'ftv-saloon',
      },
      { factInventory: { facts: [] }, candidateProfile }
    );
    assert.equal(fakeClaimResult.valid, false);
    assert.ok(fakeClaimResult.violations.some((v) => v.code === 'UNSUPPORTED_METRIC'));
  });

  // ── 4. Orphan Bullet Detection ─────────────────────────────────────────────
  it('Branch 4: Detects incomplete orphan bullets lacking technical mechanism or purpose/result', () => {
    const resumeWithOrphan = {
      projects: [
        {
          name: 'Code Review Assistant',
          bullets: [
            // Incomplete bullet flagged by Gemini: lacks tech/method and result
            { text: 'Automated code evaluation across multiple repositories.' },
            // Complete bullet
            { text: 'Engineered asynchronous webhook queue using FastAPI and Redis to optimize review response times.' },
          ],
        },
      ],
    };

    const qualityReport = evaluateResumeWritingQuality({
      structuredResume: resumeWithOrphan,
    });

    const orphanFinding = qualityReport.findings.find((f) => f.code === 'INCOMPLETE_ORPHAN_BULLET');
    assert.ok(orphanFinding, 'Must emit INCOMPLETE_ORPHAN_BULLET finding');
    assert.equal(orphanFinding.severity, 'WARN');
    assert.ok(orphanFinding.message.includes('dangling bullet'));
  });
});
