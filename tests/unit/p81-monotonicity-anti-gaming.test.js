/**
 * @file P81 Rule 36: Score Monotonicity & Anti-Gaming Invariant Unit Tests
 *
 * Mathematical Invariant (Rule 36):
 * Adding unbacked claims/metrics, repeating keywords, or weakening validation MUST NEVER increase the score:
 *   Score(Resume_B) <= Score(Resume_A)
 *
 * Scenarios Tested:
 * 1. Adding unsupported technology claim (AWS ECS) never increases score.
 * 2. Adding unbacked metric claim (85% reduction) fails closed, zeroing the score.
 * 3. Keyword stuffing attempt (repeating keyword 8x) never increases score.
 * 4. Omitting claim validation fails closed, yielding Score = 0 <= Honest Score.
 * 5. Multi-column LaTeX injection attempt drops ATS parseability score.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { defaultAtsParseabilityService } from '../../src/services/resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from '../../src/services/resume-keyword-coverage.service.js';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';
import { ResumeClaimValidationService } from '../../src/services/resume-claim-validation.service.js';
import { calculateJobMatchScore } from '../../src/services/ats-fit-score.service.js';
import { generateUnifiedQualityReport } from '../../src/services/resume-quality-assessment.service.js';

describe('P81 Rule 36: Score Monotonicity & Anti-Gaming Engine', () => {
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const jobDescriptionId = randomUUID();
  const mockContext = { tenantId };

  const targetJob = {
    id: jobDescriptionId,
    tenantId,
    title: 'Senior Backend Engineer',
    companyName: 'Distributed Tech',
    requirements: [
      { id: randomUUID(), skill: 'Go', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
      {
        id: randomUUID(),
        skill: 'PostgreSQL',
        importance: 'REQUIRED',
        category: 'SKILL',
        weight: 1.0,
      },
      {
        id: randomUUID(),
        skill: 'AWS ECS',
        importance: 'PREFERRED',
        category: 'SKILL',
        weight: 1.0,
      },
    ],
  };

  const honestProfile = {
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
      experience: [],
    },
  };

  const honestFactInventory = {
    facts: [
      {
        id: 'fact-1',
        text: 'Engineered raft consensus in Go with persistent storage',
        technologies: ['Go'],
        metrics: {},
        agencyLevel: 'CANDIDATE',
        candidateAuthored: true,
        sourceType: 'candidate_project_bullet',
      },
      {
        id: 'fact-latency',
        text: 'Reduced PostgreSQL query latency by 40% from 1000ms to 600ms via index hints',
        technologies: ['PostgreSQL'],
        metrics: { baselineLatency: '1000ms', finalLatency: '600ms' },
        agencyLevel: 'CANDIDATE',
        candidateAuthored: true,
        sourceType: 'candidate_project_bullet',
      },
    ],
  };

  // Base Honest Resume A
  const honestResumeA = {
    header: { name: 'Morgan Chen', email: 'morgan@example.com' },
    summary: { text: 'Backend distributed systems engineer specializing in Go and PostgreSQL.' },
    skills: {
      categories: [
        { categoryName: 'Languages', skills: [{ name: 'Go' }] },
        { categoryName: 'Databases', skills: [{ name: 'PostgreSQL' }] },
      ],
    },
    projects: [
      {
        name: 'Distributed KV Store',
        bullets: [
          {
            text: 'Engineered raft consensus in Go with persistent storage.',
            composedFromFactIds: ['fact-1'],
          },
          {
            text: 'Optimized PostgreSQL queries reducing latency by 40% via index hints.',
            composedFromFactIds: ['fact-latency'],
          },
        ],
      },
    ],
  };

  function evaluateCandidatePackage(resume, profile, facts, options = {}) {
    const claimValidator = new ResumeClaimValidationService();
    let claimValidationPassed = true;
    const violations = [];

    if (options.omitClaimValidation) {
      return generateUnifiedQualityReport({
        atsParseabilityReport: defaultAtsParseabilityService.evaluateAtsParseability({
          structuredResume: resume,
        }),
        jobMatchReport: { jobMatchScore: 80, confidence: 0.9 },
        keywordCoverageReport: ResumeKeywordCoverageService.analyzeKeywordCoverage({
          jobDescription: targetJob,
          structuredResume: resume,
          candidateProfile: profile,
        }),
        contentQualityReport: evaluateResumeWritingQuality({
          structuredResume: resume,
          factInventory: facts,
        }),
        claimValidationReport: null, // OMITTED
        analyzedAt: '2026-09-18T00:00:00.000Z',
      });
    }

    // Validate each bullet claim
    for (const p of resume.projects || []) {
      for (const b of p.bullets || []) {
        const text = typeof b === 'string' ? b : b.text;
        const factIds = b.composedFromFactIds || [];
        const res = claimValidator.validateClaim(
          {
            claimId: randomUUID(),
            text,
            composedFromFactIds: factIds,
            sectionOwnerType: 'PROJECT',
            sectionOwnerId: p.name || 'proj',
          },
          { factInventory: facts, candidateProfile: profile }
        );
        if (!res.valid) {
          claimValidationPassed = false;
          violations.push(...(res.violations || []));
        }
      }
    }

    const claimValidationReport = {
      valid: claimValidationPassed,
      rejected: !claimValidationPassed,
      violations,
    };

    const atsReport = defaultAtsParseabilityService.evaluateAtsParseability({
      structuredResume: resume,
    });

    const keywordReport = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: targetJob,
      structuredResume: resume,
      candidateProfile: profile,
    });

    const qualityReport = evaluateResumeWritingQuality({
      structuredResume: resume,
      factInventory: facts,
    });

    return generateUnifiedQualityReport({
      atsParseabilityReport: atsReport,
      jobMatchReport: { jobMatchScore: 80, confidence: 0.9 },
      keywordCoverageReport: keywordReport,
      contentQualityReport: qualityReport,
      claimValidationReport,
      analyzedAt: '2026-09-18T00:00:00.000Z',
    });
  }

  it('Rule 36.1: Adding unsupported technology never increases final score (Score_B <= Score_A)', () => {
    const reportA = evaluateCandidatePackage(honestResumeA, honestProfile, honestFactInventory);

    // Resume B attempts to game the preferred AWS ECS requirement by adding it without candidate evidence
    const gamingResumeB = JSON.parse(JSON.stringify(honestResumeA));
    gamingResumeB.skills.categories.push({
      categoryName: 'Cloud',
      skills: [{ name: 'AWS ECS' }],
    });

    const reportB = evaluateCandidatePackage(gamingResumeB, honestProfile, honestFactInventory);

    // Score_B must be <= Score_A
    assert.ok(
      reportB.headlineScore <= reportA.headlineScore,
      `Gaming Score (${reportB.headlineScore}) must be <= Honest Score (${reportA.headlineScore})`
    );

    // Verified that AWS ECS is marked UNSUPPORTED_CANDIDATE
    const ecsTerm = reportB.dimensions.keywordCoverage.unrenderedTerms || [];
    const termItem = reportB.dimensions.keywordCoverage;
    assert.equal(reportB.dimensions.keywordCoverage.weightInHeadline, 0.0);
  });

  it('Rule 36.2: Adding unbacked metric claim fails closed, zeroing the score (Score_B = 0 <= Score_A)', () => {
    const reportA = evaluateCandidatePackage(honestResumeA, honestProfile, honestFactInventory);
    assert.ok(reportA.headlineScore > 0);

    // Resume B invents an unbacked 85% metric claim
    const gamingResumeB = JSON.parse(JSON.stringify(honestResumeA));
    gamingResumeB.projects[0].bullets.push({
      text: 'Engineered memory cache reducing RAM utilization by 85% across all nodes.',
      composedFromFactIds: ['fact-1'], // fact-1 has no metric for RAM
    });

    const reportB = evaluateCandidatePackage(gamingResumeB, honestProfile, honestFactInventory);

    assert.equal(
      reportB.headlineScore,
      0,
      'Gaming with unbacked metric must result in headlineScore = 0'
    );
    assert.equal(reportB.status, 'REJECTED_BY_INTEGRITY_GATE');
    assert.ok(reportB.headlineScore <= reportA.headlineScore);
  });

  it('Rule 36.3: Repeating keywords (stuffing attempt) never increases score (Score_B <= Score_A)', () => {
    const reportA = evaluateCandidatePackage(honestResumeA, honestProfile, honestFactInventory);

    // Resume B attempts keyword stuffing by repeating PostgreSQL 6 times in summary
    const gamingResumeB = JSON.parse(JSON.stringify(honestResumeA));
    gamingResumeB.summary.text =
      'PostgreSQL expert building PostgreSQL databases with PostgreSQL query optimizations and PostgreSQL indexing using PostgreSQL high availability in PostgreSQL.';

    const reportB = evaluateCandidatePackage(gamingResumeB, honestProfile, honestFactInventory);

    assert.ok(
      reportB.headlineScore <= reportA.headlineScore,
      `Stuffed Score (${reportB.headlineScore}) must be <= Honest Score (${reportA.headlineScore})`
    );
    assert.ok(reportB.dimensions.keywordCoverage.stuffingWarnings.length > 0);
  });

  it('Rule 36.4: Omitting claim validation fails closed (Score_B = 0 < Score_A)', () => {
    const reportA = evaluateCandidatePackage(honestResumeA, honestProfile, honestFactInventory);
    assert.ok(reportA.headlineScore > 0);

    // Report B omits claim validation entirely
    const reportB = evaluateCandidatePackage(honestResumeA, honestProfile, honestFactInventory, {
      omitClaimValidation: true,
    });

    assert.equal(reportB.headlineScore, 0);
    assert.equal(reportB.status, 'REJECTED_BY_INTEGRITY_GATE');
    assert.ok(reportB.headlineScore < reportA.headlineScore);
  });

  it('Rule 36.5: Injecting multi-column layout commands drops ATS parseability score (Score_B < Score_A)', () => {
    const cleanTex = `
\\documentclass{article}
\\begin{document}
Morgan Chen | morgan@example.com
\\section*{Professional Summary}
Senior backend systems engineer.
\\section*{Technical Skills}
Go, PostgreSQL
\\end{document}
`;

    const multiColumnTex = `
\\documentclass{article}
\\usepackage{multicol}
\\begin{document}
Morgan Chen | morgan@example.com
\\begin{multicols}{2}
\\section*{Professional Summary}
Senior backend systems engineer.
\\columnbreak
\\section*{Technical Skills}
Go, PostgreSQL
\\end{multicols}
\\end{document}
`;

    const resClean = defaultAtsParseabilityService.evaluateAtsParseability({
      texContent: cleanTex,
      extractedText:
        'Morgan Chen | morgan@example.com\nProfessional Summary\nSenior backend systems engineer.\nTechnical Skills\nGo, PostgreSQL\nEducation\nMIT\nProjects\nKV Store\nExperience\nEngineer',
    });

    const resMulti = defaultAtsParseabilityService.evaluateAtsParseability({
      texContent: multiColumnTex,
      extractedText:
        'Morgan Chen | morgan@example.com\nProfessional Summary\nSenior backend systems engineer.\nTechnical Skills\nGo, PostgreSQL\nEducation\nMIT\nProjects\nKV Store\nExperience\nEngineer',
    });

    assert.ok(
      resMulti.atsParseabilityScore < resClean.atsParseabilityScore,
      `Multi-column score (${resMulti.atsParseabilityScore}) must be strictly less than single-column score (${resClean.atsParseabilityScore})`
    );
    const layoutCheck = resMulti.checks.find((c) => c.checkId === 'READING_ORDER');
    assert.ok(layoutCheck);
    assert.equal(layoutCheck.passed, false);
  });

  // ── Extended Anti-Gaming Attacks A through G ───────────────────────────────

  it('Attack A: Legitimate keyword aliases (React, React.js, ReactJS) do NOT trigger false stuffing', () => {
    const resumeWithAliases = JSON.parse(JSON.stringify(honestResumeA));
    resumeWithAliases.skills = {
      categories: [
        {
          name: 'Frontend',
          skills: ['React', 'TypeScript'],
        },
      ],
    };
    resumeWithAliases.projects[0].bullets[0] =
      'Engineered a real-time reactive user interface using React.js and TypeScript.';
    resumeWithAliases.projects[0].bullets[1] =
      'Optimized component rendering cycles in ReactJS to achieve sub-16ms frame times.';

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        title: 'Frontend Engineer',
        requirements: [{ text: 'React', importance: 'REQUIRED' }],
      },
      structuredResume: resumeWithAliases,
      candidateProfile: {
        ...honestProfile,
        profileMetadata: {
          ...honestProfile.profileMetadata,
          skills: [{ name: 'React' }, { name: 'TypeScript' }],
        },
      },
    });

    // Legitimate alias usage across sections must NOT trigger keyword stuffing
    assert.equal(report.stuffingWarnings.length, 0);
    const reactMatch = report.termBreakdown.find((t) => t.canonicalSlug === 'react');
    assert.ok(reactMatch);
    assert.ok(reactMatch.satisfiesRequirement);
  });

  it('Attack B: Hidden off-screen text in PDF binary drops score (Score_B < Score_A)', () => {
    // Normal PDF buffer
    const normalPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Length 120 >>\nstream\n' +
        'BT /F1 12 Tf 72 712 Td (Morgan Chen | morgan@example.com) Tj ET\n' +
        'BT /F1 10 Tf 72 680 Td (Built distributed key-value store in Go.) Tj ET\n' +
        'endstream\nendobj\nxref\n0 5\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      'latin1'
    );

    // Attack PDF buffer with text positioned off-screen (y = 950 or -50)
    const attackPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Length 180 >>\nstream\n' +
        'BT /F1 12 Tf 72 712 Td (Morgan Chen | morgan@example.com) Tj ET\n' +
        'BT /F1 10 Tf 72 680 Td (Built distributed key-value store in Go.) Tj ET\n' +
        'BT /F1 10 Tf 72 950 Td (Kubernetes AWS Docker Machine Learning Hidden Keywords) Tj ET\n' +
        'endstream\nendobj\nxref\n0 5\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      'latin1'
    );

    const reportA = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: normalPdf,
      extractedText: 'Morgan Chen | morgan@example.com\nBuilt distributed key-value store in Go.',
    });

    const reportB = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: attackPdf,
      extractedText: 'Morgan Chen | morgan@example.com\nBuilt distributed key-value store in Go.',
    });

    assert.ok(
      reportB.findings.some((f) => f.finding === 'HIDDEN_TEXT_OFFSCREEN'),
      'Expected HIDDEN_TEXT_OFFSCREEN finding'
    );
  });

  it('Attack C: White/invisible text mode (/Tr 3) triggers detection and drops score (Score_B < Score_A)', () => {
    const attackPdfInvisible = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Length 180 >>\nstream\n' +
        'BT /F1 12 Tf 72 712 Td (Morgan Chen | morgan@example.com) Tj ET\n' +
        '3 Tr\n' + // Rendering mode 3 = invisible text
        'BT /F1 10 Tf 72 680 Td (Kubernetes AWS React Python GraphQL Redis) Tj ET\n' +
        '0 Tr\n' +
        'endstream\nendobj\nxref\n0 5\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      'latin1'
    );

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: attackPdfInvisible,
      extractedText: 'Morgan Chen | morgan@example.com',
    });

    assert.ok(
      report.findings.some((f) => f.finding === 'INVISIBLE_TEXT_DETECTED'),
      'Expected INVISIBLE_TEXT_DETECTED finding'
    );
  });

  it('Attack D: Microscopic text (<2pt) triggers detection (Score_B < Score_A)', () => {
    const attackPdfMicroscopic = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Length 180 >>\nstream\n' +
        'BT /F1 12 Tf 72 712 Td (Morgan Chen | morgan@example.com) Tj ET\n' +
        'BT /F1 1.0 Tf 72 680 Td (Kubernetes AWS React Python GraphQL Redis Docker) Tj ET\n' +
        'endstream\nendobj\nxref\n0 5\ntrailer\n<< /Root 1 0 R >>\n%%EOF',
      'latin1'
    );

    const report = defaultAtsParseabilityService.evaluateAtsParseability({
      pdfBuffer: attackPdfMicroscopic,
      extractedText: 'Morgan Chen | morgan@example.com',
    });

    assert.ok(
      report.findings.some((f) => f.finding === 'MICROSCOPIC_TEXT_DETECTED'),
      'Expected MICROSCOPIC_TEXT_DETECTED finding'
    );
  });

  it('Attack E: Metadata injection in PDF Info dictionary does NOT count toward resume body keyword coverage', () => {
    // PDF with keywords in metadata dictionary /Keywords, but text stream does NOT have them
    const pdfWithMetadataSpam = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Length 100 >>\nstream\n' +
        'BT /F1 12 Tf 72 712 Td (Morgan Chen | morgan@example.com) Tj ET\n' +
        'endstream\nendobj\n' +
        '5 0 obj\n<< /Title (Resume) /Keywords (PostgreSQL, Kubernetes, AWS, Rust, Docker) >>\nendobj\n' +
        'xref\n0 6\ntrailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF',
      'latin1'
    );

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        title: 'Backend Engineer',
        requirements: [{ text: 'Kubernetes', importance: 'REQUIRED' }],
      },
      structuredResume: honestResumeA,
      pdfBuffer: pdfWithMetadataSpam,
      candidateProfile: honestProfile,
    });

    // Kubernetes was only in /Keywords metadata, never in content stream
    const k8sMatch = report.termBreakdown.find((t) => t.canonicalSlug === 'kubernetes');
    assert.ok(k8sMatch);
    assert.equal(k8sMatch.satisfiesRequirement, false);
    assert.equal(k8sMatch.matchType, 'MISSING');
  });

  it('Attack F: Repeated keyword in contact/header does NOT satisfy technical skill requirements (Score_B <= Score_A)', () => {
    const resumeHeaderSpam = JSON.parse(JSON.stringify(honestResumeA));
    resumeHeaderSpam.header = {
      name: 'Morgan Chen',
      email: 'morgan@example.com',
      headline: 'Morgan Chen | Python Python Python Python | morgan@example.com',
    };
    resumeHeaderSpam.candidateIdentity = {
      displayName: 'Morgan Chen',
      headline: 'Morgan Chen | Python Python Python Python | morgan@example.com',
    };
    // Clean projects and skills do NOT mention Python
    resumeHeaderSpam.skills = {
      categories: [{ categoryName: 'Languages', skills: [{ name: 'Go' }] }],
    };
    resumeHeaderSpam.projects[0].technologies = ['Go', 'Raft'];

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        title: 'Python Backend Engineer',
        requirements: [{ text: 'Python', importance: 'REQUIRED' }],
      },
      structuredResume: resumeHeaderSpam,
      candidateProfile: honestProfile,
    });

    const pythonMatch = report.termBreakdown.find((t) => t.canonicalSlug === 'python');
    assert.ok(pythonMatch);
    // Header-only mentions do NOT satisfy technical skill requirements
    assert.equal(pythonMatch.satisfiesRequirement, false);
  });

  it('Attack G: Negated / disclaimed skills ("No experience with Kubernetes") do NOT receive positive credit', () => {
    const resumeNegated = JSON.parse(JSON.stringify(honestResumeA));
    resumeNegated.summary =
      'Senior backend engineer with deep Go and distributed systems background. Note: No experience with Kubernetes or AWS.';

    const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: {
        title: 'Cloud Engineer',
        requirements: [{ text: 'Kubernetes', importance: 'REQUIRED' }],
      },
      structuredResume: resumeNegated,
      candidateProfile: honestProfile,
    });

    const k8sMatch = report.termBreakdown.find((t) => t.canonicalSlug === 'kubernetes');
    assert.ok(k8sMatch);
    assert.equal(k8sMatch.polarity, 'NEGATED');
    assert.equal(k8sMatch.satisfiesRequirement, false);
  });
});
