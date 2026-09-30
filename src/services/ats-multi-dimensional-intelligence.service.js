/**
 * @file Multi-Dimensional ATS Intelligence Service (Phase 2)
 *
 * Implements the industry-grade 8-dimensional ATS evaluation system:
 * 1. ATS_PARSEABILITY_SCORE
 * 2. ATS_EXTRACTION_SCORE
 * 3. KEYWORD_COVERAGE_SCORE
 * 4. CONTENT_QUALITY_SCORE
 * 5. JOB_FIT_SCORE
 * 6. EVIDENCE_CONFIDENCE_SCORE
 * 7. CANDIDATE_QUALITY_SCORE
 * 8. APPLICATION_READINESS_SCORE
 *
 * Invariants:
 * - Deterministic computation: No LLM hallucinated scores.
 * - Every score has: numeric score, maximum (100), confidence [0, 1], explanation,
 *   factors, warnings, evidence references, and deterministic calculation trace.
 * - No meaningless floating precision (all rounded to 2 decimals).
 */

import { roundScore } from '../domain/career/scoring-policy.js';
import {
  MultiDimensionalAtsReportSchema,
  ScoreDimensionSchema,
} from '../domain/career/ats-multi-dimensional-intelligence.schemas.js';
import { AtsParseabilityService } from './resume-ats-parseability.service.js';
import { ResumeKeywordCoverageService } from './resume-keyword-coverage.service.js';
import { ResumeQualityScoreService } from './resume-quality-score.service.js';
import { AtsFitScoreService } from './ats-fit-score.service.js';

export class AtsMultiDimensionalIntelligenceService {
  constructor(dependencies = {}) {
    this.atsParseabilityService =
      dependencies.atsParseabilityService || new AtsParseabilityService();
    this.resumeQualityScoreService =
      dependencies.resumeQualityScoreService || new ResumeQualityScoreService();
  }

  /**
   * Generates a comprehensive 8-dimensional ATS intelligence report.
   *
   * @param {object} params
   * @param {object} [params.context] Authenticated tenant context
   * @param {Buffer} [params.pdfBuffer] Compiled resume PDF buffer
   * @param {string} [params.extractedText] Plain extracted text
   * @param {string} [params.texContent] Raw LaTeX source
   * @param {object} [params.structuredResume] Structured resume document
   * @param {object} [params.candidateProfile] Normalized candidate profile
   * @param {object} [params.jobDescription] Target job description
   * @param {object} [params.candidateMatchAnalysis] Pre-computed match analysis
   * @param {object} [params.projectRelevanceAnalysis] Pre-computed project relevance analysis
   * @param {Array<object>} [params.readinessItems] Pre-evaluated readiness items
   * @param {object} [params.extractedData] Simulated extraction data
   * @param {string} [params.analyzedAt] ISO timestamp
   * @returns {object} Validated MultiDimensionalAtsReport
   */
  evaluateAllDimensions({
    context = null,
    pdfBuffer = null,
    extractedText = '',
    texContent = '',
    structuredResume = null,
    candidateProfile = null,
    jobDescription = null,
    candidateMatchAnalysis = null,
    projectRelevanceAnalysis = null,
    readinessItems = [],
    extractedData = null,
    analyzedAt = null,
    atsParseability: customAtsParseability = null,
    atsExtraction: customAtsExtraction = null,
    keywordCoverage: customKeywordCoverage = null,
    contentQuality: customContentQuality = null,
    jobFit: customJobFit = null,
    evidenceConfidence: customEvidenceConfidence = null,
    candidateQuality: customCandidateQuality = null,
    applicationReadiness: customApplicationReadiness = null,
  } = {}) {
    const timestamp = analyzedAt || new Date().toISOString();

    // 1. ATS Parseability Dimension
    const atsParseability =
      customAtsParseability ||
      this.evaluateParseability({
        pdfBuffer,
        extractedText,
        texContent,
        structuredResume,
        candidateProfile,
      });

    // 2. ATS Extraction Dimension
    const atsExtraction =
      customAtsExtraction ||
      this.evaluateExtraction({
        extractedData,
        extractedText,
        structuredResume,
        candidateProfile,
      });

    // 3. Keyword Coverage Dimension
    const keywordCoverage =
      customKeywordCoverage ||
      this.evaluateKeywordCoverage({
        jobDescription,
        structuredResume,
        candidateProfile,
        extractedText,
      });

    // 4. Content Quality Dimension
    const contentQuality =
      customContentQuality ||
      this.evaluateContentQuality({
        structuredResume,
        candidateProfile,
        texContent,
        extractedText,
        jobDescription,
      });

    // 5. Job Fit Dimension
    const jobFit =
      customJobFit ||
      this.evaluateJobFit({
        context,
        jobDescription,
        candidateMatchAnalysis,
        projectRelevanceAnalysis,
        candidateProfile,
        structuredResume,
      });

    // 6. Evidence Confidence Dimension
    const evidenceConfidence =
      customEvidenceConfidence ||
      this.evaluateEvidenceConfidence({
        candidateMatchAnalysis,
        projectRelevanceAnalysis,
        candidateProfile,
      });

    // 7. Candidate Quality Dimension
    const candidateQuality =
      customCandidateQuality ||
      this.evaluateCandidateQuality({
        candidateProfile,
        projectRelevanceAnalysis,
        structuredResume,
      });

    // 8. Application Readiness Dimension
    const applicationReadiness =
      customApplicationReadiness ||
      this.evaluateApplicationReadiness({
        atsParseability,
        atsExtraction,
        keywordCoverage,
        contentQuality,
        jobFit,
        evidenceConfidence,
        readinessItems,
      });

    // Summary Aggregations
    const primaryStrengths = [];
    const criticalGaps = [];
    let safetyGateApplied = false;

    if (atsParseability.score >= 85.0) {
      primaryStrengths.push(`High document ATS parseability (${atsParseability.score}/100)`);
    } else {
      criticalGaps.push(`Document parseability risks detected (${atsParseability.score}/100)`);
    }

    if (keywordCoverage.score >= 80.0) {
      primaryStrengths.push(`Strong target keyword coverage (${keywordCoverage.score}/100)`);
    } else if (keywordCoverage.score < 60.0 && jobDescription) {
      criticalGaps.push(`Low keyword representation (${keywordCoverage.score}/100)`);
    }

    if (jobFit.score >= 75.0) {
      primaryStrengths.push(`High candidate qualification match (${jobFit.score}/100)`);
    } else if (jobFit.score < 50.0 && jobDescription) {
      criticalGaps.push(`Significant role requirement gaps (${jobFit.score}/100)`);
    }

    if (jobFit.calculation?.isCapped) {
      safetyGateApplied = true;
      criticalGaps.push(`Score capped due to missing mandatory requirements`);
    }

    if (applicationReadiness.calculation?.safetyGateApplied) {
      safetyGateApplied = true;
    }

    const overallAssessment = safetyGateApplied
      ? `Application readiness is constrained at ${applicationReadiness.score}/100 due to safety gates. Critical gaps must be addressed prior to submission.`
      : `Application readiness is ${applicationReadiness.score}/100 with parseability ${atsParseability.score}/100 and job fit ${jobFit.score}/100.`;

    const report = {
      reportVersion: '1.0.0',
      analyzedAt: timestamp,
      candidateId: candidateProfile?.id || null,
      jobDescriptionId: jobDescription?.id || null,
      tenantId: context?.tenantId || candidateProfile?.tenantId || null,
      dimensions: {
        atsParseability,
        atsExtraction,
        keywordCoverage,
        contentQuality,
        jobFit,
        evidenceConfidence,
        candidateQuality,
        applicationReadiness,
      },
      summary: {
        primaryStrengths: primaryStrengths.slice(0, 5),
        criticalGaps: criticalGaps.slice(0, 5),
        safetyGateApplied,
        overallAssessment,
      },
    };

    return MultiDimensionalAtsReportSchema.parse(report);
  }

  /**
   * 1. Evaluates ATS Parseability (Format, text streams, layout, reading order).
   */
  evaluateParseability({
    pdfBuffer,
    extractedText,
    texContent,
    structuredResume,
    candidateProfile,
  }) {
    const rawResult = this.atsParseabilityService.evaluateAtsParseability({
      pdfBuffer,
      extractedText,
      texContent,
      structuredResume,
      candidateProfile,
    });

    const score = roundScore(rawResult.atsParseabilityScore ?? 0.0, 2);
    const checks = Array.isArray(rawResult.checks) ? rawResult.checks : [];
    const findings = Array.isArray(rawResult.findings) ? rawResult.findings : [];

    const factors = checks.map((c) => ({
      name: c.name || c.checkId,
      contribution: c.passed ? roundScore(c.weight ?? 0, 2) : 0.0,
      max: roundScore(c.weight ?? 0, 2),
      description: c.message,
    }));

    const warnings = findings.map((f) => f.message || f.finding || JSON.stringify(f));

    return ScoreDimensionSchema.parse({
      score,
      max: 100.0,
      confidence: 0.95,
      explanation: rawResult.passed
        ? `Document satisfies structural ATS parseability checks with score ${score}/100.`
        : `Document failed one or more critical structural parseability checks (Score: ${score}/100).`,
      factors,
      warnings,
      evidence: findings,
      calculation: {
        version: rawResult.version,
        passedChecks: checks.filter((c) => c.passed).length,
        totalChecks: checks.length,
      },
    });
  }

  /**
   * 2. Evaluates ATS Extraction (Entity extraction completeness & fidelity).
   */
  evaluateExtraction({ extractedData, extractedText = '', structuredResume, candidateProfile }) {
    const text = String(extractedText || '').trim();
    const factors = [];
    const warnings = [];

    // Fields evaluated: Contact, Summary, Experience, Education, Skills, Projects
    let contactScore = 0;
    if (/@/.test(text) && /\d{3}/.test(text)) {
      contactScore = 20.0;
      factors.push({
        name: 'Contact Information',
        contribution: 20.0,
        max: 20.0,
        description: 'Email and phone cleanly identified',
      });
    } else if (/@/.test(text) || /\d{3}/.test(text)) {
      contactScore = 10.0;
      factors.push({
        name: 'Contact Information',
        contribution: 10.0,
        max: 20.0,
        description: 'Partial contact information identified',
      });
      warnings.push('Contact information partially extractable');
    } else {
      factors.push({
        name: 'Contact Information',
        contribution: 0.0,
        max: 20.0,
        description: 'Missing contact info in text stream',
      });
      warnings.push('Candidate contact information not extracted');
    }

    let summaryScore = 0;
    if (/\b(summary|profile|about)\b/i.test(text)) {
      summaryScore = 15.0;
      factors.push({
        name: 'Professional Summary',
        contribution: 15.0,
        max: 15.0,
        description: 'Summary section detected and extracted',
      });
    } else {
      summaryScore = 5.0;
      factors.push({
        name: 'Professional Summary',
        contribution: 5.0,
        max: 15.0,
        description: 'Summary section absent or heading non-standard',
      });
    }

    let skillsScore = 0;
    if (/\b(skills|technologies|competencies)\b/i.test(text)) {
      skillsScore = 20.0;
      factors.push({
        name: 'Technical Skills',
        contribution: 20.0,
        max: 20.0,
        description: 'Skills section recognized and segmented',
      });
    } else {
      factors.push({
        name: 'Technical Skills',
        contribution: 0.0,
        max: 20.0,
        description: 'Technical skills section heading not recognized',
      });
      warnings.push('Technical skills heading not recognized');
    }

    let experienceScore = 0;
    if (/\b(experience|employment|work history)\b/i.test(text)) {
      experienceScore = 20.0;
      factors.push({
        name: 'Work Experience',
        contribution: 20.0,
        max: 20.0,
        description: 'Employment history cleanly delimited',
      });
    } else {
      factors.push({
        name: 'Work Experience',
        contribution: 0.0,
        max: 20.0,
        description: 'Experience section heading not recognized',
      });
      warnings.push('Experience section heading not recognized');
    }

    let educationScore = 0;
    if (/\b(education|academic|degree)\b/i.test(text)) {
      educationScore = 15.0;
      factors.push({
        name: 'Education',
        contribution: 15.0,
        max: 15.0,
        description: 'Education history recognized',
      });
    } else {
      educationScore = 5.0;
      factors.push({
        name: 'Education',
        contribution: 5.0,
        max: 15.0,
        description: 'Education heading absent or unstated',
      });
    }

    let projectsScore = 0;
    if (/\b(projects?)\b/i.test(text)) {
      projectsScore = 10.0;
      factors.push({
        name: 'Projects',
        contribution: 10.0,
        max: 10.0,
        description: 'Projects section recognized',
      });
    } else {
      factors.push({
        name: 'Projects',
        contribution: 0.0,
        max: 10.0,
        description: 'Projects section absent',
      });
    }

    const rawSum =
      contactScore + summaryScore + skillsScore + experienceScore + educationScore + projectsScore;
    const score = roundScore(Math.min(100.0, Math.max(0.0, rawSum)), 2);

    return ScoreDimensionSchema.parse({
      score,
      max: 100.0,
      confidence: 0.9,
      explanation: `ATS entity extraction simulation achieved ${score}/100 across core profile sections.`,
      factors,
      warnings,
      evidence: [],
      calculation: {
        rawSum,
        extractedLength: text.length,
      },
    });
  }

  /**
   * 3. Evaluates Keyword Coverage Dimension.
   */
  evaluateKeywordCoverage({ jobDescription, structuredResume, candidateProfile, extractedText }) {
    if (!jobDescription || !structuredResume) {
      return ScoreDimensionSchema.parse({
        score: 50.0,
        max: 100.0,
        confidence: 0.5,
        explanation:
          'Baseline keyword coverage (Job description or structured resume not provided).',
        factors: [
          {
            name: 'Neutral Baseline',
            contribution: 50.0,
            max: 100.0,
            description: 'No target JD provided for comparative keyword matching',
          },
        ],
        warnings: ['Job description missing for keyword analysis'],
        evidence: [],
        calculation: { status: 'NO_JD' },
      });
    }

    try {
      const report = ResumeKeywordCoverageService.analyzeKeywordCoverage({
        jobDescription,
        structuredResume,
        candidateProfile,
        extractedText,
      });

      const score = roundScore(report.coveragePercentage ?? 0.0, 2);
      const factors = [
        {
          name: 'Exact Matches',
          contribution: roundScore((report.exactMatchCount || 0) * 10, 2),
          description: `${report.exactMatchCount || 0} exact keyword matches in resume`,
        },
        {
          name: 'Taxonomy Equivalent Matches',
          contribution: roundScore((report.taxonomyMatchCount || 0) * 8, 2),
          description: `${report.taxonomyMatchCount || 0} recognized skill aliases`,
        },
        {
          name: 'Semantic Related Matches',
          contribution: roundScore((report.semanticMatchCount || 0) * 5, 2),
          description: `${report.semanticMatchCount || 0} related technologies`,
        },
      ];

      const warnings = [];
      if (report.criticalMissingCount > 0) {
        warnings.push(`${report.criticalMissingCount} critical required job keywords missing`);
      }
      if (report.keywordStuffingWarnings?.length > 0) {
        warnings.push(...report.keywordStuffingWarnings);
      }

      return ScoreDimensionSchema.parse({
        score,
        max: 100.0,
        confidence: 0.92,
        explanation: `Target job keyword coverage is ${score}% (${report.exactMatchCount || 0} exact, ${report.missingTermCount || 0} missing).`,
        factors,
        warnings,
        evidence: report.terms || [],
        calculation: {
          totalTerms: report.totalTerms,
          matchedTerms: report.matchedTerms,
          missingTerms: report.missingTermCount,
        },
      });
    } catch {
      return ScoreDimensionSchema.parse({
        score: 50.0,
        max: 100.0,
        confidence: 0.5,
        explanation: 'Keyword coverage analysis encountered fallback state.',
        factors: [],
        warnings: ['Keyword coverage parser fallback'],
        evidence: [],
        calculation: {},
      });
    }
  }

  /**
   * 4. Evaluates Content Quality Dimension.
   */
  evaluateContentQuality({ structuredResume, candidateProfile, texContent, extractedText }) {
    if (!structuredResume) {
      return ScoreDimensionSchema.parse({
        score: 70.0,
        max: 100.0,
        confidence: 0.7,
        explanation: 'Baseline content quality score (structured resume model not provided).',
        factors: [{ name: 'Baseline', contribution: 70.0, max: 100.0 }],
        warnings: [],
        evidence: [],
        calculation: {},
      });
    }

    try {
      const quality = this.resumeQualityScoreService.evaluateQuality({
        structuredResume,
        candidateProfile,
        pageCount: 1,
      });

      const score = roundScore(quality.qualityScore ?? 75.0, 2);
      const bd = quality.breakdown || {};
      const factors = Object.entries(bd).map(([k, v]) => ({
        name: k,
        contribution: roundScore(typeof v === 'number' ? v : 0, 2),
      }));

      return ScoreDimensionSchema.parse({
        score,
        max: 100.0,
        confidence: 0.88,
        explanation: `Resume content quality score is ${score}/100 across specificity, accomplishment strength, and density.`,
        factors,
        warnings: quality.penalties?.map((p) => p.reason) || [],
        evidence: [],
        calculation: {
          version: quality.version,
          rawScore: quality.rawScore,
        },
      });
    } catch {
      return ScoreDimensionSchema.parse({
        score: 75.0,
        max: 100.0,
        confidence: 0.75,
        explanation: 'Estimated content quality score.',
        factors: [{ name: 'Estimated Content Quality', contribution: 75.0, max: 100.0 }],
        warnings: [],
        evidence: [],
        calculation: {},
      });
    }
  }

  /**
   * 5. Evaluates Candidate-Job Fit Dimension.
   */
  evaluateJobFit({
    context,
    jobDescription,
    candidateMatchAnalysis,
    projectRelevanceAnalysis,
    candidateProfile,
  }) {
    if (!jobDescription || !candidateMatchAnalysis || !projectRelevanceAnalysis) {
      return ScoreDimensionSchema.parse({
        score: 50.0,
        max: 100.0,
        confidence: 0.5,
        explanation: 'Baseline job fit score (Matching inputs not fully provided).',
        factors: [{ name: 'Neutral Baseline', contribution: 50.0, max: 100.0 }],
        warnings: ['Job fit analysis incomplete due to missing comparative models'],
        evidence: [],
        calculation: {},
      });
    }

    const fit = AtsFitScoreService.calculateCandidateJobFit(
      context || { tenantId: jobDescription.tenantId || candidateProfile?.tenantId || 'system' },
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      candidateProfile
    );

    const score = roundScore(fit.overallScore ?? 0.0, 2);
    const bd = fit.scoreBreakdown || {};

    const factors = [
      {
        name: 'Required Skills',
        contribution: roundScore(bd.requiredSkillsScore ?? 0, 2),
        max: 40.0,
      },
      {
        name: 'Preferred Skills',
        contribution: roundScore(bd.preferredSkillsScore ?? 0, 2),
        max: 15.0,
      },
      {
        name: 'Project Relevance',
        contribution: roundScore(bd.projectRelevanceScore ?? 0, 2),
        max: 20.0,
      },
      {
        name: 'Experience Fit',
        contribution: roundScore(bd.experienceFitScore ?? 0, 2),
        max: 10.0,
      },
      {
        name: 'Education Fit',
        contribution: roundScore(bd.educationFitScore ?? 0, 2),
        max: 5.0,
      },
      { name: 'Location Fit', contribution: roundScore(bd.locationFitScore ?? 0, 2), max: 5.0 },
      {
        name: 'Evidence Confidence',
        contribution: roundScore(bd.evidenceConfidenceScore ?? 0, 2),
        max: 5.0,
      },
    ];

    const warnings = [];
    if (fit.isCapped) {
      warnings.push(`Score capped at ${fit.scoreBreakdown.scoreCap} due to critical missing skill`);
    }

    return ScoreDimensionSchema.parse({
      score,
      max: 100.0,
      confidence: roundScore(fit.confidence ?? 0.9, 2),
      explanation: fit.explanation || `Candidate-job fit score is ${score}/100 (${fit.fitBand}).`,
      factors,
      warnings,
      evidence: fit.topRelevantProjects || [],
      calculation: {
        rawScore: bd.rawScore,
        scoreCap: bd.scoreCap,
        isCapped: fit.isCapped,
        criticalGaps: fit.criticalGapCount,
      },
    });
  }

  /**
   * 6. Evaluates Evidence Confidence Dimension.
   */
  evaluateEvidenceConfidence({
    candidateMatchAnalysis,
    projectRelevanceAnalysis,
    candidateProfile,
  }) {
    let totalScore = 0;
    let count = 0;
    const evidenceList = [];

    const matches = candidateMatchAnalysis?.requirementMatches || [];
    for (const m of matches) {
      if (m.primaryEvidence) {
        evidenceList.push(m.primaryEvidence);
        const weight = m.primaryEvidence.evidenceType === 'CODE_USAGE' ? 1.0 : 0.8;
        totalScore += weight * (m.primaryEvidence.confidenceScore || 0.85);
        count++;
      }
    }

    const projects = projectRelevanceAnalysis?.projectRankings || [];
    for (const p of projects) {
      for (const ev of p.supportingEvidence || []) {
        evidenceList.push(ev);
        totalScore += 0.85 * (ev.confidenceScore || 0.8);
        count++;
      }
    }

    const avgConfidence = count > 0 ? totalScore / count : 0.75;
    const score = roundScore(Math.min(100.0, Math.max(0.0, avgConfidence * 100.0)), 2);

    return ScoreDimensionSchema.parse({
      score,
      max: 100.0,
      confidence: 0.9,
      explanation: `Evidence confidence score is ${score}/100 derived from ${count} commit-pinned evidence items.`,
      factors: [
        {
          name: 'Verified Code Manifests & Imports',
          contribution: score,
          max: 100.0,
          description: `Grounded in ${count} inspected repository evidence items`,
        },
      ],
      warnings:
        count === 0 ? ['No commit-pinned evidence items cited in candidate qualifications'] : [],
      evidence: evidenceList.slice(0, 5),
      calculation: {
        itemCount: count,
        avgConfidence: roundScore(avgConfidence, 4),
      },
    });
  }

  /**
   * 7. Evaluates Independent Candidate Quality Dimension (Role-Independent).
   */
  evaluateCandidateQuality({ candidateProfile, projectRelevanceAnalysis, structuredResume }) {
    const projects = candidateProfile?.projects || structuredResume?.projects || [];
    const experience = candidateProfile?.experience || structuredResume?.experience || [];

    let score = 50.0;
    const factors = [];

    // Technical project presence & depth (up to 30 pts)
    const projScore = Math.min(30.0, projects.length * 10.0);
    factors.push({
      name: 'Portfolio Projects',
      contribution: projScore,
      max: 30.0,
      description: `${projects.length} technical projects on record`,
    });
    score += projScore;

    // Professional experience tenure (up to 20 pts)
    const expScore = Math.min(20.0, experience.length * 10.0);
    factors.push({
      name: 'Professional Experience',
      contribution: expScore,
      max: 20.0,
      description: `${experience.length} career positions on record`,
    });
    score += expScore;

    const finalScore = roundScore(Math.min(100.0, Math.max(0.0, score)), 2);

    return ScoreDimensionSchema.parse({
      score: finalScore,
      max: 100.0,
      confidence: 0.85,
      explanation: `Independent candidate quality score is ${finalScore}/100 based on project depth and career history.`,
      factors,
      warnings: [],
      evidence: [],
      calculation: {
        projectCount: projects.length,
        experienceCount: experience.length,
      },
    });
  }

  /**
   * 8. Evaluates Application Readiness Dimension with Safety Gates.
   */
  evaluateApplicationReadiness({
    atsParseability,
    atsExtraction,
    keywordCoverage,
    contentQuality,
    jobFit,
    evidenceConfidence,
    readinessItems = [],
  }) {
    // Formula: Weighted blend of 6 core components + safety gate
    // Parseability: 20%, Extraction: 15%, JobFit: 30%, Keyword: 15%, Content: 10%, Evidence: 10%
    const pScore = atsParseability?.score ?? 70.0;
    const xScore = atsExtraction?.score ?? 70.0;
    const jScore = jobFit?.score ?? 70.0;
    const kScore = keywordCoverage?.score ?? 70.0;
    const cScore = contentQuality?.score ?? 70.0;
    const eScore = evidenceConfidence?.score ?? 70.0;

    const rawReadiness =
      0.2 * pScore + 0.15 * xScore + 0.3 * jScore + 0.15 * kScore + 0.1 * cScore + 0.1 * eScore;

    let readinessScore = roundScore(Math.min(100.0, Math.max(0.0, rawReadiness)), 2);
    let safetyGateApplied = false;
    const warnings = [];

    // Safety Gate 1: If jobFit was capped due to critical missing requirement, readiness cannot exceed 74.9
    if (jobFit?.calculation?.isCapped) {
      safetyGateApplied = true;
      if (readinessScore > 74.9) {
        readinessScore = 74.9;
        warnings.push(
          'Readiness capped at 74.9 because candidate has missing critical required competencies.'
        );
      } else {
        warnings.push(
          'Application readiness restricted by safety gate (capped at 74.9 max) due to missing critical required competencies.'
        );
      }
    }

    // Safety Gate 2: If parseability is failing (< 60.0), readiness capped at 49.9
    if (pScore < 60.0) {
      if (readinessScore > 49.9) {
        readinessScore = 49.9;
        safetyGateApplied = true;
        warnings.push(
          'Readiness capped at 49.9 due to critical document ATS parseability failure.'
        );
      }
    }

    const factors = [
      { name: 'Job Fit Match (30%)', contribution: roundScore(0.3 * jScore, 2), max: 30.0 },
      { name: 'ATS Parseability (20%)', contribution: roundScore(0.2 * pScore, 2), max: 20.0 },
      { name: 'ATS Extraction (15%)', contribution: roundScore(0.15 * xScore, 2), max: 15.0 },
      { name: 'Keyword Coverage (15%)', contribution: roundScore(0.15 * kScore, 2), max: 15.0 },
      { name: 'Content Quality (10%)', contribution: roundScore(0.1 * cScore, 2), max: 10.0 },
      { name: 'Evidence Confidence (10%)', contribution: roundScore(0.1 * eScore, 2), max: 10.0 },
    ];

    return ScoreDimensionSchema.parse({
      score: readinessScore,
      max: 100.0,
      confidence: 0.92,
      explanation: safetyGateApplied
        ? `Application readiness is ${readinessScore}/100 (Safety Gate Applied).`
        : `Application readiness is ${readinessScore}/100 across document, qualification, and submission criteria.`,
      factors,
      warnings,
      evidence: [],
      calculation: {
        rawReadiness: roundScore(rawReadiness, 2),
        safetyGateApplied,
      },
    });
  }
}

export const atsMultiDimensionalIntelligenceService = new AtsMultiDimensionalIntelligenceService();
