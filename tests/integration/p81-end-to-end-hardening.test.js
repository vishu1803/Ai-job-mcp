/**
 * @file P81 End-to-End Hardening Integration Tests (Fixtures A–F)
 *
 * Verifies end-to-end real artifact compilation and evaluation:
 * - Fixture A (Clean Grounded Resume): 100% real Tectonic PDF compile, passes all checks, high score.
 * - Fixture B (Missing Contact in PDF): PDF omits email, triggers EMAIL_NOT_RENDERED, drops ATS parseability.
 * - Fixture C (Unrendered Required Keyword): Structured resume specifies PostgreSQL, but PDF omits it;
 *   detected as unrendered with renderedCoverage < intendedCoverage.
 * - Fixture D (Fabricated Metric): Claim contains unbacked 73% metric, fails closed in claim validation,
 *   zeroing headline score via Evidence Integrity Gate.
 * - Fixture E (Fabricated Technology): Claim contains unbacked AWS ECS, classified as UNSUPPORTED_CANDIDATE.
 * - Fixture F (Broken Word Hyphenation): PDF text stream contains fragmented words across lines, failing WORD_FRAGMENTATION.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { calculateJobMatchScore } from '../../src/services/ats-fit-score.service.js';
import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';

describe('P81 Integration: End-to-End Hardening & Real PDF Fixtures', () => {
  const compiler = new LatexCompilerService();
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const jobDescriptionId = randomUUID();
  const mockContext = { tenantId };

  const targetJob = {
    id: jobDescriptionId,
    tenantId,
    title: 'Senior Distributed Systems Engineer',
    companyName: 'CloudCorp',
    requirements: [
      { id: randomUUID(), skill: 'Go', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
      {
        id: randomUUID(),
        skill: 'PostgreSQL',
        importance: 'REQUIRED',
        category: 'SKILL',
        weight: 1.0,
      },
    ],
  };

  const canonicalCandidateProfile = {
    id: candidateId,
    tenantId,
    displayName: 'Morgan Chen',
    profileMetadata: {
      skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
      projects: [
        {
          id: randomUUID(),
          name: 'Distributed KV Store',
          technologies: ['Go', 'PostgreSQL'],
        },
      ],
      experience: [
        {
          company: 'Acme Cloud',
          title: 'Backend Engineer',
        },
      ],
      education: [
        {
          institution: 'MIT',
          degree: 'B.S. in Computer Science',
        },
      ],
    },
  };

  const canonicalFactInventory = {
    facts: [
      {
        id: 'fact-go-1',
        text: 'Engineered raft consensus in Go',
        technologies: ['Go'],
        metrics: {},
        agencyLevel: 'CANDIDATE',
        candidateAuthored: true,
      },
      {
        id: 'fact-pg-latency',
        text: 'Reduced database query latency from 1000ms to 600ms via index hints',
        technologies: ['PostgreSQL'],
        metrics: { baselineLatency: '1000ms', finalLatency: '600ms' },
        agencyLevel: 'CANDIDATE',
        candidateAuthored: true,
      },
    ],
  };

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE A: Clean Grounded Resume (Real Tectonic Compilation)
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture A: Clean Grounded Resume compiles with Tectonic and passes all ATS invariants', async () => {
    const cleanTex = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=0.75in]{geometry}
\\begin{document}
\\begin{center}
{\\huge \\textbf{Morgan Chen}} \\\\
morgan@example.com \\textbar{} (555) 123-4567 \\textbar{} github.com/morganchen
\\end{center}

\\section*{Professional Summary}
Senior backend distributed systems engineer with expertise in Go, PostgreSQL, and high-throughput datastores.

\\section*{Technical Skills}
\\textbf{Languages}: Go, SQL \\\\
\\textbf{Databases}: PostgreSQL, Redis

\\section*{Technical Projects}
\\textbf{Distributed KV Store} (Go, PostgreSQL) \\\\
\\begin{itemize}
  \\item Engineered raft consensus protocol in Go ensuring zero message loss across partitions.
  \\item Optimized PostgreSQL query execution reducing latency by 40\\% via index hints.
\\end{itemize}

\\section*{Professional Experience}
\\textbf{Backend Engineer} at Acme Cloud \\\\
\\begin{itemize}
  \\item Implemented distributed services in Go handling authenticated user requests.
\\end{itemize}

\\section*{Education}
B.S. in Computer Science, MIT
\\end{document}`;

    const compileResult = await compiler.compileLatexToPdf({
      texContent: cleanTex,
      jobName: 'fixture-a-clean',
    });

    assert.equal(compileResult.success, true);
    assert.ok(Buffer.isBuffer(compileResult.pdfBuffer));

    // 1. Evaluate ATS Parseability strictly from PDF artifact
    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: compileResult.pdfBuffer,
      structuredResume: {
        header: { name: 'Morgan Chen', email: 'morgan@example.com' },
      },
    });

    assert.equal(atsResult.passed, true);
    assert.ok(
      atsResult.atsParseabilityScore >= 90,
      `Expected score >= 90, got ${atsResult.atsParseabilityScore}`
    );
    assert.equal(atsResult.confidence, 0.95);
    const contactCheck = atsResult.checks.find((c) => c.checkId === 'CONTACT_COMPLETENESS');
    assert.equal(contactCheck.passed, true);

    // 2. Evaluate Keyword Coverage
    const keywordResult = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: targetJob,
      structuredResume: {
        skills: {
          categories: [
            { categoryName: 'Languages', skills: [{ name: 'Go' }, { name: 'PostgreSQL' }] },
          ],
        },
        projects: [{ name: 'Distributed KV Store', bullets: ['Engineered raft consensus in Go'] }],
      },
      pdfBuffer: compileResult.pdfBuffer,
    });

    assert.equal(keywordResult.overallCoveragePercent, 100);
    assert.equal(keywordResult.unrenderedTerms.length, 0);

    // 3. Evaluate Writing Quality
    const structuredResume = {
      summary: { text: 'Senior backend distributed systems engineer with expertise in Go.' },
      projects: [
        {
          name: 'Distributed KV Store',
          bullets: [
            {
              text: 'Optimized PostgreSQL query execution reducing latency by 40% via index hints.',
              composedFromFactIds: ['fact-pg-latency'],
            },
          ],
        },
      ],
    };

    const qualityResult = evaluateResumeWritingQuality({
      structuredResume,
      factInventory: canonicalFactInventory,
    });

    assert.ok(qualityResult.writingQualityScore >= 80);
    assert.equal(
      qualityResult.findings.some((f) => f.code === 'UNAUTHORIZED_METRIC_CLAIM'),
      false
    );

    // 4. Claim Validation
    const validationResult = ResumeClaimValidationService.validateClaim(
      {
        claimId: 'c1',
        text: 'Optimized PostgreSQL query execution reducing latency by 40% via index hints.',
        composedFromFactIds: ['fact-pg-latency'],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      },
      {
        factInventory: canonicalFactInventory,
      }
    );

    assert.equal(validationResult.valid, true);

    // 5. Unified Quality Report
    const unifiedReport = generateUnifiedQualityReport({
      atsParseabilityReport: atsResult,
      jobMatchReport: { jobMatchScore: 90, confidence: 0.95 },
      keywordCoverageReport: keywordResult,
      contentQualityReport: qualityResult,
      claimValidationReport: validationResult,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });

    assert.ok(unifiedReport.headlineScore >= 80);
    assert.equal(unifiedReport.status, 'OPTIMIZED');
    assert.equal(unifiedReport.dimensions.evidenceIntegrityGate.passed, true);
    assert.equal(unifiedReport.provenance.engineVersion, '2.0.0-hardened');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE B: Omitted Email in Compiled PDF Artifact
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture B: PDF artifact omits email, fails CONTACT_COMPLETENESS with EMAIL_NOT_RENDERED', async () => {
    // LaTeX intentionally omits email from rendered header
    const texWithoutEmail = `\\documentclass{article}
\\begin{document}
\\begin{center}
{\\huge \\textbf{Morgan Chen}} \\\\
(555) 123-4567 \\textbar{} github.com/morganchen
\\end{center}
\\section*{Professional Summary}
Engineer specializing in Go and PostgreSQL systems.
\\section*{Technical Skills}
Go, PostgreSQL
\\section*{Technical Projects}
Store
\\section*{Professional Experience}
Engineer
\\section*{Education}
MIT
\\end{document}`;

    const compileResult = await compiler.compileLatexToPdf({
      texContent: texWithoutEmail,
      jobName: 'fixture-b-no-email',
    });

    // Structured resume claims email is present
    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: compileResult.pdfBuffer,
      structuredResume: {
        header: { name: 'Morgan Chen', email: 'morgan@example.com' },
      },
    });

    const emailFinding = atsResult.findings.find((f) => f.finding === 'EMAIL_NOT_RENDERED');
    assert.ok(emailFinding, 'Must emit EMAIL_NOT_RENDERED finding');
    assert.equal(emailFinding.severity, 'FAIL');
    assert.ok(atsResult.atsParseabilityScore <= 85);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE C: Omitted Required Keyword in Compiled PDF Artifact
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture C: PDF omits required PostgreSQL keyword; detected as unrendered with reduced renderedCoverage', async () => {
    // LaTeX body only mentions Go, completely omitting PostgreSQL
    const texWithoutPg = `\\documentclass{article}
\\begin{document}
\\begin{center}
{\\huge \\textbf{Morgan Chen}} \\\\
morgan@example.com
\\end{center}
\\section*{Technical Skills}
Go, Redis, Distributed Consensus
\\section*{Technical Projects}
Raft Store in Go
\\end{document}`;

    const compileResult = await compiler.compileLatexToPdf({
      texContent: texWithoutPg,
      jobName: 'fixture-c-no-pg',
    });

    // Structured resume claims PostgreSQL in skills
    const structuredResume = {
      skills: {
        categories: [
          { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }, { name: 'Go' }] },
        ],
      },
    };

    const keywordResult = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: targetJob,
      structuredResume,
      pdfBuffer: compileResult.pdfBuffer,
    });

    assert.ok(keywordResult.unrenderedTerms.includes('PostgreSQL'));
    assert.equal(
      keywordResult.renderedCoveragePercent < keywordResult.intendedCoveragePercent,
      true
    );

    const pgItem = keywordResult.termBreakdown.find((t) => t.term === 'PostgreSQL');
    assert.equal(pgItem.intendedPresence, true);
    assert.equal(pgItem.artifactPresence, false);
    assert.equal(pgItem.isRendered, false);
    assert.equal(pgItem.satisfiesRequirement, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE D: Fabricated Metric in Resume Bullet
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture D: Fabricated 73% metric fails closed in claim validation and zeroes headline score', () => {
    const resumeWithFabricatedMetric = {
      summary: { text: 'Backend engineer.' },
      projects: [
        {
          name: 'Store',
          bullets: [
            {
              text: 'Optimized query engine reducing latency by 73% across all endpoints.',
              composedFromFactIds: ['fact-pg-latency'],
            },
          ],
        },
      ],
    };

    // 1. Writing Quality flags unauthorized metric
    const qualityResult = evaluateResumeWritingQuality({
      structuredResume: resumeWithFabricatedMetric,
      factInventory: canonicalFactInventory,
    });
    const unauthFinding = qualityResult.findings.find(
      (f) => f.code === 'UNAUTHORIZED_METRIC_CLAIM'
    );
    assert.ok(unauthFinding);

    // 2. Claim Validation fails
    const claimResult = ResumeClaimValidationService.validateClaim(
      {
        claimId: 'c2',
        text: 'Optimized query engine reducing latency by 73% across all endpoints.',
        composedFromFactIds: ['fact-pg-latency'],
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-1',
      },
      {
        factInventory: canonicalFactInventory,
      }
    );
    assert.equal(claimResult.valid, false);

    // 3. Unified report fails closed
    const unifiedReport = generateUnifiedQualityReport({
      atsParseabilityReport: { atsParseabilityScore: 90 },
      jobMatchReport: { jobMatchScore: 85 },
      keywordCoverageReport: { overallCoveragePercent: 90 },
      contentQualityReport: qualityResult,
      claimValidationReport: claimResult,
    });

    assert.equal(unifiedReport.headlineScore, 0);
    assert.equal(unifiedReport.status, 'REJECTED_BY_INTEGRITY_GATE');
    assert.equal(unifiedReport.dimensions.evidenceIntegrityGate.passed, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE E: Fabricated Technology Claim
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture E: Candidate profile lacks AWS ECS; classified as UNSUPPORTED_CANDIDATE', () => {
    const jobWithAws = {
      title: 'Cloud Engineer',
      requirements: [{ skill: 'AWS ECS', importance: 'REQUIRED' }],
    };

    const resumeWithFabricatedTech = {
      summary: { text: 'Cloud engineer specializing in AWS ECS containerization.' },
      skills: { categories: [{ categoryName: 'Cloud', skills: [{ name: 'AWS ECS' }] }] },
      projects: [],
      experience: [],
    };

    const keywordResult = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: jobWithAws,
      structuredResume: resumeWithFabricatedTech,
      candidateProfile: canonicalCandidateProfile,
    });

    const ecsItem = keywordResult.termBreakdown.find((t) => t.term === 'AWS ECS');
    assert.ok(ecsItem);
    assert.equal(ecsItem.matchType, 'UNSUPPORTED_CANDIDATE');
    assert.equal(ecsItem.satisfiesRequirement, false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FIXTURE F: Broken Word Hyphenation in Extracted Text Stream
  // ───────────────────────────────────────────────────────────────────────────
  it('Fixture F: Column word hyphenation in text stream fails WORD_FRAGMENTATION check', () => {
    const textWithBrokenHyphens = `
Morgan Chen | morgan@example.com | (555) 123-4567
Professional Summary
Senior engineer building dis-
tributed storage sys-
tems with high per-
formance.
Technical Skills
Go, PostgreSQL
Technical Projects
Store
Professional Experience
Engineer
Education
MIT
`;

    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: textWithBrokenHyphens,
    });

    const fragCheck = atsResult.checks.find((c) => c.checkId === 'WORD_FRAGMENTATION');
    assert.ok(fragCheck);
    assert.equal(fragCheck.passed, false);
    assert.ok(fragCheck.message.includes('split/hyphenated words across line breaks'));
  });
});
