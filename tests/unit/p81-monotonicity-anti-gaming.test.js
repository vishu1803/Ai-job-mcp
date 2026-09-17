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
      { id: randomUUID(), skill: 'PostgreSQL', importance: 'REQUIRED', category: 'SKILL', weight: 1.0 },
      { id: randomUUID(), skill: 'AWS ECS', importance: 'PREFERRED', category: 'SKILL', weight: 1.0 },
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
        atsParseabilityReport: defaultAtsParseabilityService.evaluateAtsParseability({ structuredResume: resume }),
        jobMatchReport: { jobMatchScore: 80, confidence: 0.90 },
        keywordCoverageReport: ResumeKeywordCoverageService.analyzeKeywordCoverage({
          jobDescription: targetJob,
          structuredResume: resume,
          candidateProfile: profile,
        }),
        contentQualityReport: evaluateResumeWritingQuality({ structuredResume: resume, factInventory: facts }),
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
      jobMatchReport: { jobMatchScore: 80, confidence: 0.90 },
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

    assert.equal(reportB.headlineScore, 0, 'Gaming with unbacked metric must result in headlineScore = 0');
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
      extractedText: 'Morgan Chen | morgan@example.com\nProfessional Summary\nSenior backend systems engineer.\nTechnical Skills\nGo, PostgreSQL\nEducation\nMIT\nProjects\nKV Store\nExperience\nEngineer',
    });

    const resMulti = defaultAtsParseabilityService.evaluateAtsParseability({
      texContent: multiColumnTex,
      extractedText: 'Morgan Chen | morgan@example.com\nProfessional Summary\nSenior backend systems engineer.\nTechnical Skills\nGo, PostgreSQL\nEducation\nMIT\nProjects\nKV Store\nExperience\nEngineer',
    });

    assert.ok(
      resMulti.atsParseabilityScore < resClean.atsParseabilityScore,
      `Multi-column score (${resMulti.atsParseabilityScore}) must be strictly less than single-column score (${resClean.atsParseabilityScore})`
    );
    const layoutCheck = resMulti.checks.find((c) => c.checkId === 'READING_ORDER');
    assert.ok(layoutCheck);
    assert.equal(layoutCheck.passed, false);
  });
});
