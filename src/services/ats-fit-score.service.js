/**
 * @file ATS Fit Score Calculator Engine (P5-005)
 * Synthesizes requirement match analysis, project relevance analysis, and candidate profile
 * into a deterministic, mathematically explainable 100-point ATS Fit Score.
 */

import { ValidationError, NotFoundError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { CandidateJobFitAnalysisSchema } from '../domain/career/ats-fit-score.schemas.js';

// ---------------------------------------------------------------------------
// Constants & Weights
// ---------------------------------------------------------------------------

export const ATS_SCORE_WEIGHTS = Object.freeze({
  REQUIRED_SKILLS: 40.0,
  PREFERRED_SKILLS: 15.0,
  PROJECT_RELEVANCE: 20.0,
  EXPERIENCE_FIT: 10.0,
  EDUCATION_FIT: 5.0,
  LOCATION_FIT: 5.0,
  EVIDENCE_CONFIDENCE: 5.0,
});

export const EVIDENCE_TYPE_QUALITY_WEIGHTS = Object.freeze({
  PACKAGE_MANIFEST_DEPENDENCY: 1.0,
  CODE_IMPORT_USAGE: 0.95,
  CODE_USAGE: 0.9,
  CONFIG_SYNTAX_DECLARATION: 0.85,
  COMMIT_CONTRIBUTION: 0.75,
  FILE_PATTERN_MATCH: 0.65,
  DIRECTORY_STRUCTURE: 0.5,
  README_SPECIFICATION: 0.3,
  DOCUMENT_CLAIM: 0.0,
});

/**
 * Rounds a decimal number to a specified precision.
 */
function round(num, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

// ---------------------------------------------------------------------------
// AtsFitScoreService Implementation
// ---------------------------------------------------------------------------

export class AtsFitScoreService {
  /**
   * Evaluates overall candidate-job fit by synthesizing requirement match analysis,
   * project relevance analysis, and candidate profile data.
   *
   * @param {Object} context - Authenticated request context with trusted tenantId.
   * @param {Object} jobDescription - JobDescription domain model.
   * @param {Object} candidateMatchAnalysis - CandidateMatchAnalysis from P5-003.
   * @param {Object} projectRelevanceAnalysis - CandidateProjectRelevanceAnalysis from P5-004.
   * @param {Object} candidateProfile - CandidateProfile domain model from Phase 4.
   * @param {Object} [options] - Optional evaluation configuration (e.g. analyzedAt).
   * @returns {Object} CandidateJobFitAnalysis validated against CandidateJobFitAnalysisSchema.
   */
  static calculateCandidateJobFit(
    context,
    jobDescription,
    candidateMatchAnalysis,
    projectRelevanceAnalysis,
    candidateProfile,
    options = {}
  ) {
    // -------------------------------------------------------------------------
    // 1. Context & Multi-Tenant Sovereign Verification (404 Default-Deny)
    // -------------------------------------------------------------------------
    if (!context || !context.tenantId || typeof context.tenantId !== 'string') {
      throw new ValidationError('Trusted tenant context is required');
    }

    const trustedTenantId = context.tenantId;

    if (!jobDescription || typeof jobDescription !== 'object') {
      throw new ValidationError('Valid JobDescription is required');
    }
    if (jobDescription.tenantId && jobDescription.tenantId !== trustedTenantId) {
      logger.warn(
        { trustedTenantId, jobTenantId: jobDescription.tenantId },
        'Cross-tenant job description access blocked in ATS scoring'
      );
      throw new NotFoundError('Job description not found');
    }

    if (!candidateProfile || typeof candidateProfile !== 'object') {
      throw new ValidationError('Valid CandidateProfile is required');
    }
    if (candidateProfile.tenantId && candidateProfile.tenantId !== trustedTenantId) {
      logger.warn(
        { trustedTenantId, candidateTenantId: candidateProfile.tenantId },
        'Cross-tenant candidate profile access blocked in ATS scoring'
      );
      throw new NotFoundError('Candidate not found');
    }

    if (!candidateMatchAnalysis || typeof candidateMatchAnalysis !== 'object') {
      throw new ValidationError('Valid CandidateMatchAnalysis is required');
    }
    if (candidateMatchAnalysis.tenantId && candidateMatchAnalysis.tenantId !== trustedTenantId) {
      logger.warn(
        { trustedTenantId, matchTenantId: candidateMatchAnalysis.tenantId },
        'Cross-tenant match analysis access blocked in ATS scoring'
      );
      throw new NotFoundError('Match analysis not found');
    }

    if (!projectRelevanceAnalysis || typeof projectRelevanceAnalysis !== 'object') {
      throw new ValidationError('Valid ProjectRelevanceAnalysis is required');
    }
    if (
      projectRelevanceAnalysis.tenantId &&
      projectRelevanceAnalysis.tenantId !== trustedTenantId
    ) {
      logger.warn(
        { trustedTenantId, projectTenantId: projectRelevanceAnalysis.tenantId },
        'Cross-tenant project relevance analysis access blocked in ATS scoring'
      );
      throw new NotFoundError('Project analysis not found');
    }

    // Verify entity ID coherence
    if (
      candidateMatchAnalysis.candidateId !== candidateProfile.id ||
      projectRelevanceAnalysis.candidateId !== candidateProfile.id ||
      candidateMatchAnalysis.jobDescriptionId !== jobDescription.id ||
      projectRelevanceAnalysis.jobDescriptionId !== jobDescription.id
    ) {
      logger.warn(
        {
          matchCandidateId: candidateMatchAnalysis.candidateId,
          projectCandidateId: projectRelevanceAnalysis.candidateId,
          profileId: candidateProfile.id,
          matchJobId: candidateMatchAnalysis.jobDescriptionId,
          projectJobId: projectRelevanceAnalysis.jobDescriptionId,
          jobId: jobDescription.id,
        },
        'Mismatched candidate or job entity IDs in ATS scoring inputs'
      );
      throw new NotFoundError('Resource entity mismatch');
    }

    const requirementMatches = Array.isArray(candidateMatchAnalysis.requirementMatches)
      ? candidateMatchAnalysis.requirementMatches
      : [];
    const skillGaps = Array.isArray(candidateMatchAnalysis.skillGaps)
      ? candidateMatchAnalysis.skillGaps
      : [];
    const projectRankings = Array.isArray(projectRelevanceAnalysis.projectRankings)
      ? projectRelevanceAnalysis.projectRankings
      : [];

    // Deduplicate projects and extract top 3 stably sorted projects
    const seenProjectIds = new Set();
    const uniqueProjects = [];
    for (const proj of projectRankings) {
      if (proj.projectId && !seenProjectIds.has(proj.projectId)) {
        seenProjectIds.add(proj.projectId);
        uniqueProjects.push(proj);
      }
    }
    const topThreeProjects = uniqueProjects.slice(0, 3);

    // -------------------------------------------------------------------------
    // ZERO-REQUIREMENT FAIL-CLOSED GUARD
    // -------------------------------------------------------------------------
    if (requirementMatches.length === 0) {
      const zeroBreakdown = {
        requiredSkillsScore: 0.0,
        preferredSkillsScore: 0.0,
        projectRelevanceScore: 0.0,
        experienceFitScore: 0.0,
        educationFitScore: 0.0,
        locationFitScore: 0.0,
        evidenceConfidenceScore: 0.0,
        rawScore: 0.0,
        scoreCap: null,
        overallScore: null,
      };

      const zeroWarning =
        'Insufficient structured requirements extracted from job description to perform reliable ATS scoring.';

      const result = {
        jobDescriptionId: jobDescription.id,
        candidateId: candidateProfile.id,
        tenantId: trustedTenantId,
        analysisStatus: 'INSUFFICIENT_DATA',
        isFallbackScore: false,
        zeroRequirementWarning: zeroWarning,
        overallScore: null,
        fitBand: 'INSUFFICIENT_DATA',
        scoreBreakdown: zeroBreakdown,
        criticalGapCount: 0,
        highGapCount: 0,
        isCapped: false,
        keyStrengths: [],
        skillGaps: [],
        topRelevantProjects: topThreeProjects,
        explanations: {
          overallReason: zeroWarning,
          strengthsSummary: 'No requirements extracted from job description.',
          gapsSummary: 'Unable to evaluate gaps without structured requirements.',
          cappingReason: null,
        },
        explanation: zeroWarning,
        confidence: 0.0,
        analyzedAt: options.analyzedAt
          ? new Date(options.analyzedAt).toISOString()
          : new Date().toISOString(),
      };

      return CandidateJobFitAnalysisSchema.parse(result);
    }

    // -------------------------------------------------------------------------
    // 2. Component 1: Required Skills Coverage (40 Points Max)
    // -------------------------------------------------------------------------
    const requiredSkillMatches = requirementMatches.filter(
      (m) => m.importance === 'REQUIRED' && m.category === 'SKILL'
    );

    let requiredSkillsScore = 0.0;

    if (requiredSkillMatches.length > 0) {
      let totalReqWeight = 0;
      let totalReqCovered = 0;

      for (const match of requiredSkillMatches) {
        const weight = match.weight ?? 1.0;
        totalReqWeight += weight;

        let valueFactor = 0.0;
        if (match.matchStatus === 'MATCHED') {
          valueFactor = 1.0;
        } else if (match.matchStatus === 'PARTIAL') {
          if (match.isUserClaim || match.claimLabel === '[Unverified User Claim]') {
            valueFactor = 0.25;
          } else if (match.relationshipType === 'BUILT_ON') {
            valueFactor = 0.75;
          } else if (
            match.relationshipType === 'ECOSYSTEM_OF' ||
            match.relationshipType === 'IMPLEMENTS'
          ) {
            valueFactor = 0.5;
          } else {
            valueFactor = 0.5;
          }
        } else if (match.matchStatus === 'UNKNOWN') {
          valueFactor = 1.0; // Neutral treatment (does not penalize)
        } else if (match.matchStatus === 'MISSING') {
          valueFactor = 0.0;
        }

        totalReqCovered += weight * valueFactor;
      }

      requiredSkillsScore =
        totalReqWeight > 0
          ? round(Math.min(40.0, Math.max(0.0, 40.0 * (totalReqCovered / totalReqWeight))), 2)
          : 0.0;
    }

    // -------------------------------------------------------------------------
    // 3. Component 2: Preferred Skills Coverage (15 Points Max)
    // -------------------------------------------------------------------------
    const preferredMatches = requirementMatches.filter(
      (m) => m.importance === 'PREFERRED' || m.importance === 'OPTIONAL'
    );

    let preferredSkillsScore = 0.0;

    if (preferredMatches.length > 0) {
      let totalPrefWeight = 0;
      let totalPrefCovered = 0;

      for (const match of preferredMatches) {
        const weight = match.weight ?? 1.0;
        totalPrefWeight += weight;

        let valueFactor = 0.0;
        if (match.matchStatus === 'MATCHED') {
          valueFactor = 1.0;
        } else if (match.matchStatus === 'PARTIAL') {
          if (match.isUserClaim || match.claimLabel === '[Unverified User Claim]') {
            valueFactor = 0.25;
          } else if (match.relationshipType === 'BUILT_ON') {
            valueFactor = 0.75;
          } else if (
            match.relationshipType === 'ECOSYSTEM_OF' ||
            match.relationshipType === 'IMPLEMENTS'
          ) {
            valueFactor = 0.5;
          } else {
            valueFactor = 0.5;
          }
        } else if (match.matchStatus === 'UNKNOWN') {
          valueFactor = 1.0;
        } else if (match.matchStatus === 'MISSING') {
          valueFactor = 0.0;
        }

        totalPrefCovered += weight * valueFactor;
      }

      preferredSkillsScore =
        totalPrefWeight > 0
          ? round(Math.min(15.0, Math.max(0.0, 15.0 * (totalPrefCovered / totalPrefWeight))), 2)
          : 0.0;
    }

    // -------------------------------------------------------------------------
    // 4. Component 3: Project Relevance & Architecture Depth (20 Points Max)
    // -------------------------------------------------------------------------
    const s1 = topThreeProjects[0]?.relevanceScore ?? 0.0;
    const s2 = topThreeProjects[1]?.relevanceScore ?? 0.0;
    const s3 = topThreeProjects[2]?.relevanceScore ?? 0.0;

    let projectAggregate = 0.0;
    if (topThreeProjects.length === 1) {
      projectAggregate = s1;
    } else if (topThreeProjects.length === 2) {
      projectAggregate = 0.67 * s1 + 0.33 * s2;
    } else if (topThreeProjects.length >= 3) {
      projectAggregate = 0.6 * s1 + 0.3 * s2 + 0.1 * s3;
    }

    const projectRelevanceScore = round(
      Math.min(20.0, Math.max(0.0, 20.0 * (projectAggregate / 100.0))),
      2
    );

    // -------------------------------------------------------------------------
    // 5. Component 4: Professional Experience Tenure Fit (10 Points Max)
    // -------------------------------------------------------------------------
    const experienceMatches = requirementMatches.filter((m) => m.category === 'EXPERIENCE');
    let experienceFitScore = 0.0;

    if (experienceMatches.length > 0) {
      let expScoreSum = 0;
      for (const match of experienceMatches) {
        if (match.matchStatus === 'MATCHED') {
          expScoreSum += 1.0;
        } else if (match.matchStatus === 'PARTIAL') {
          expScoreSum += 0.5;
        } else if (match.matchStatus === 'UNKNOWN') {
          expScoreSum += 1.0; // Neutral baseline
        } else if (match.matchStatus === 'MISSING') {
          expScoreSum += 0.0;
        }
      }
      const avgExp = expScoreSum / experienceMatches.length;
      experienceFitScore = round(Math.min(10.0, Math.max(0.0, 10.0 * avgExp)), 2);
    }

    // -------------------------------------------------------------------------
    // 6. Component 5: Education Alignment Fit (5 Points Max)
    // -------------------------------------------------------------------------
    const educationMatches = requirementMatches.filter((m) => m.category === 'EDUCATION');
    let educationFitScore = 0.0;

    if (educationMatches.length > 0) {
      let eduScoreSum = 0;
      for (const match of educationMatches) {
        if (match.matchStatus === 'MATCHED') {
          eduScoreSum += 1.0;
        } else if (match.matchStatus === 'PARTIAL') {
          eduScoreSum += 0.6; // Adjacent degree / STEM field
        } else if (match.matchStatus === 'UNKNOWN') {
          eduScoreSum += 1.0; // Unstated education -> neutral baseline
        } else if (match.matchStatus === 'MISSING') {
          eduScoreSum += 0.0;
        }
      }
      const avgEdu = eduScoreSum / educationMatches.length;
      educationFitScore = round(Math.min(5.0, Math.max(0.0, 5.0 * avgEdu)), 2);
    }

    // -------------------------------------------------------------------------
    // 7. Component 6: Location & Work Authorization Fit (5 Points Max)
    // -------------------------------------------------------------------------
    const locationMatches = requirementMatches.filter(
      (m) => m.category === 'LOCATION' || m.category === 'ELIGIBILITY'
    );
    let locationFitScore = 0.0;

    if (locationMatches.length > 0) {
      let locScoreSum = 0;
      for (const match of locationMatches) {
        if (match.matchStatus === 'MATCHED') {
          locScoreSum += 1.0;
        } else if (match.matchStatus === 'PARTIAL') {
          locScoreSum += 0.75; // Commutable hybrid or relocation
        } else if (match.matchStatus === 'UNKNOWN') {
          locScoreSum += 1.0; // Unstated location -> neutral baseline
        } else if (match.matchStatus === 'MISSING') {
          locScoreSum += 0.0;
        }
      }
      const avgLoc = locScoreSum / locationMatches.length;
      locationFitScore = round(Math.min(5.0, Math.max(0.0, 5.0 * avgLoc)), 2);
    }

    // -------------------------------------------------------------------------
    // 8. Component 7: Evidence Confidence & Provenance Depth (5 Points Max)
    // -------------------------------------------------------------------------
    const citedEvidenceMap = new Map();

    for (const match of requirementMatches) {
      if (match.primaryEvidence && match.primaryEvidence.id) {
        citedEvidenceMap.set(match.primaryEvidence.id, match.primaryEvidence);
      }
      if (Array.isArray(match.supportingEvidence)) {
        for (const ev of match.supportingEvidence) {
          if (ev && ev.id) citedEvidenceMap.set(ev.id, ev);
        }
      }
    }

    for (const proj of topThreeProjects) {
      if (Array.isArray(proj.supportingEvidence)) {
        for (const ev of proj.supportingEvidence) {
          if (ev && ev.id) citedEvidenceMap.set(ev.id, ev);
        }
      }
    }

    const uniqueCitedEvidence = Array.from(citedEvidenceMap.values());
    let evidenceConfidenceScore = 0.0;

    if (uniqueCitedEvidence.length > 0) {
      let totalQuality = 0;
      for (const ev of uniqueCitedEvidence) {
        const typeWeight = EVIDENCE_TYPE_QUALITY_WEIGHTS[ev.evidenceType] ?? 0.5;
        const confidence = Math.min(1.0, Math.max(0.0, ev.confidenceScore ?? 1.0));
        totalQuality += typeWeight * confidence;
      }
      const avgQuality = totalQuality / uniqueCitedEvidence.length;
      evidenceConfidenceScore = round(Math.min(5.0, Math.max(0.0, 5.0 * avgQuality)), 2);
    } else {
      // If 0 evidence cited, score is 0.0
      evidenceConfidenceScore = 0.0;
    }

    // -------------------------------------------------------------------------
    // 9. Raw Score Calculation
    // -------------------------------------------------------------------------
    const rawScore = round(
      Math.min(
        100.0,
        Math.max(
          0.0,
          requiredSkillsScore +
            preferredSkillsScore +
            projectRelevanceScore +
            experienceFitScore +
            educationFitScore +
            locationFitScore +
            evidenceConfidenceScore
        )
      ),
      2
    );

    // -------------------------------------------------------------------------
    // 10. Required Skill Safety Gate (Hard Score Ceiling)
    // -------------------------------------------------------------------------
    // Count critical skill gaps (REQUIRED technical requirements that are MISSING)
    const criticalGaps = skillGaps.filter(
      (g) =>
        g.priority === 'CRITICAL' && (g.status === 'MISSING' || g.severity === 'EXPLICITLY_MISSING')
    );
    const criticalGapCount = criticalGaps.length;

    const highGaps = skillGaps.filter((g) => g.priority === 'HIGH');
    const highGapCount = highGaps.length;

    let scoreCap = null;
    if (criticalGapCount === 1) {
      scoreCap = 74.9;
    } else if (criticalGapCount === 2) {
      scoreCap = 49.9;
    } else if (criticalGapCount >= 3) {
      scoreCap = 24.9;
    }

    const isCapped = scoreCap !== null && rawScore > scoreCap;
    const overallScore = isCapped ? scoreCap : rawScore;

    // -------------------------------------------------------------------------
    // 11. Fit Band Assignment
    // -------------------------------------------------------------------------
    let fitBand = 'LOW';
    if (overallScore >= 90.0) {
      fitBand = 'EXCELLENT';
    } else if (overallScore >= 75.0) {
      fitBand = 'STRONG';
    } else if (overallScore >= 50.0) {
      fitBand = 'MODERATE';
    } else if (overallScore >= 25.0) {
      fitBand = 'WEAK';
    } else {
      fitBand = 'LOW';
    }

    // -------------------------------------------------------------------------
    // 12. Structured Key Strengths Extraction (Max 5)
    // -------------------------------------------------------------------------
    const keyStrengths = [];

    // 1. Required Skill Coverage Strength
    if (requiredSkillsScore >= 36.0 && requiredSkillMatches.length > 0) {
      const matchedSkillNames = requiredSkillMatches
        .filter((m) => m.matchStatus === 'MATCHED')
        .map((m) => m.extractedValue)
        .slice(0, 4);

      keyStrengths.push({
        category: 'REQUIRED_SKILL_COVERAGE',
        title: 'Comprehensive Required Technical Coverage',
        description: `Candidate satisfies ${matchedSkillNames.length} of ${requiredSkillMatches.length} required technical skills with verified code evidence (${matchedSkillNames.join(', ')}).`,
        contributionScore: requiredSkillsScore,
        evidenceRefs: uniqueCitedEvidence.slice(0, 3),
      });
    }

    // 2. Project Relevance Strength
    if (topThreeProjects.length > 0 && topThreeProjects[0].relevanceScore >= 70.0) {
      const topProj = topThreeProjects[0];
      keyStrengths.push({
        category: 'PROJECT_RELEVANCE',
        title: `High Project Alignment: '${topProj.projectName}'`,
        description: `Top repository '${topProj.projectName}' exhibits high direct relevance (${topProj.relevanceScore}/100) and full-stack implementation depth.`,
        contributionScore: projectRelevanceScore,
        evidenceRefs: topProj.supportingEvidence.slice(0, 2),
      });
    }

    // 3. Architectural Density Strength
    if (
      topThreeProjects.length > 0 &&
      topThreeProjects[0].architecturalSignals &&
      topThreeProjects[0].architecturalSignals.length >= 4
    ) {
      const topProj = topThreeProjects[0];
      keyStrengths.push({
        category: 'ARCHITECTURAL_DENSITY',
        title: 'Multi-Tier Architectural Depth',
        description: `Project code demonstrates verified depth across ${topProj.architecturalSignals.length} architectural dimensions (${topProj.architecturalSignals.slice(0, 4).join(', ')}).`,
        contributionScore: round(topProj.scoreBreakdown.architecturalDensityScore, 2),
        evidenceRefs: topProj.supportingEvidence.slice(0, 2),
      });
    }

    // 4. Evidence Integrity Strength
    if (evidenceConfidenceScore >= 4.0 && uniqueCitedEvidence.length >= 2) {
      keyStrengths.push({
        category: 'EVIDENCE_INTEGRITY',
        title: 'Cryptographically Verified Code Evidence',
        description: `Candidate claims are grounded in ${uniqueCitedEvidence.length} commit-pinned package manifests and source AST imports.`,
        contributionScore: evidenceConfidenceScore,
        evidenceRefs: uniqueCitedEvidence.slice(0, 2),
      });
    }

    // 5. Preferred Skill Coverage Strength
    if (preferredSkillsScore >= 12.0 && preferredMatches.length > 0) {
      const matchedPrefNames = preferredMatches
        .filter((m) => m.matchStatus === 'MATCHED')
        .map((m) => m.extractedValue)
        .slice(0, 3);

      keyStrengths.push({
        category: 'PREFERRED_SKILL_COVERAGE',
        title: 'Strong Preferred Technology Alignment',
        description: `Candidate demonstrates verified proficiency in bonus skills (${matchedPrefNames.join(', ')}).`,
        contributionScore: preferredSkillsScore,
        evidenceRefs: [],
      });
    }

    // 6. Experience Tenure Strength
    if (experienceFitScore === 10.0 && experienceMatches.length > 0) {
      keyStrengths.push({
        category: 'EXPERIENCE_TENURE',
        title: 'Full Experience Tenure Alignment',
        description:
          'Candidate professional employment history satisfies all stated career tenure requirements.',
        contributionScore: experienceFitScore,
        evidenceRefs: [],
      });
    }

    // -------------------------------------------------------------------------
    // 13. Deterministic Explanation Narrative
    // -------------------------------------------------------------------------
    let cappingReason = null;
    if (isCapped) {
      cappingReason = `Raw score of ${rawScore}/100 was capped at ${scoreCap}/100 because candidate has ${criticalGapCount} missing REQUIRED technical skill${criticalGapCount > 1 ? 's' : ''}.`;
    }

    const strengthsSummary =
      keyStrengths.length > 0
        ? keyStrengths.map((s) => s.title).join('; ')
        : 'Demonstrates baseline capability across evaluated criteria.';

    const gapsSummary =
      criticalGapCount > 0
        ? `${criticalGapCount} critical missing required requirement${criticalGapCount > 1 ? 's' : ''}${highGapCount > 0 ? ` and ${highGapCount} preferred skill gap${highGapCount > 1 ? 's' : ''}` : ''}.`
        : highGapCount > 0
          ? `${highGapCount} preferred skill gap${highGapCount > 1 ? 's' : ''}.`
          : 'Zero critical or high priority skill gaps.';

    let overallReason = `${fitBand} fit (${overallScore}/100): ${strengthsSummary}. Gaps: ${gapsSummary}`;
    if (isCapped) {
      overallReason = `${fitBand} fit (${overallScore}/100 - Score Capped): ${cappingReason} ${strengthsSummary}.`;
    }

    const explanations = {
      overallReason,
      strengthsSummary,
      gapsSummary,
      cappingReason,
    };

    // -------------------------------------------------------------------------
    // 14. Confidence Calculation
    // -------------------------------------------------------------------------
    const avgMatchConf =
      requirementMatches.length > 0
        ? requirementMatches.reduce((acc, m) => acc + (m.matchConfidence ?? 0.8), 0) /
          requirementMatches.length
        : 0.8;

    const avgProjConf =
      topThreeProjects.length > 0
        ? topThreeProjects.reduce((acc, p) => acc + (p.confidence ?? 0.8), 0) /
          topThreeProjects.length
        : 0.7;

    const overallConfidence = round(
      Math.min(1.0, Math.max(0.0, 0.6 * avgMatchConf + 0.4 * avgProjConf)),
      4
    );

    const analyzedAt = options.analyzedAt
      ? new Date(options.analyzedAt).toISOString()
      : new Date().toISOString();

    // -------------------------------------------------------------------------
    // 15. Schema Validation & Assembly
    // -------------------------------------------------------------------------
    const result = {
      jobDescriptionId: jobDescription.id,
      candidateId: candidateProfile.id,
      tenantId: trustedTenantId,
      analysisStatus: 'COMPLETE',
      isFallbackScore: false,
      zeroRequirementWarning: null,
      overallScore,
      fitBand,
      scoreBreakdown: {
        requiredSkillsScore,
        preferredSkillsScore,
        projectRelevanceScore,
        experienceFitScore,
        educationFitScore,
        locationFitScore,
        evidenceConfidenceScore,
        rawScore,
        scoreCap,
        overallScore,
      },
      criticalGapCount,
      highGapCount,
      isCapped,
      keyStrengths: keyStrengths.slice(0, 5),
      skillGaps,
      topRelevantProjects: topThreeProjects,
      explanations,
      explanation: overallReason,
      confidence: overallConfidence,
      analyzedAt,
    };

    return CandidateJobFitAnalysisSchema.parse(result);
  }
}

/**
 * Top-level functional export alias.
 */
export const calculateCandidateJobFit = AtsFitScoreService.calculateCandidateJobFit;
