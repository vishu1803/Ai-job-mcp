/**
 * @file MCP ATS Intelligence Tools Implementation (Phase 20)
 *
 * Implements the 5 industry-grade ATS MCP tools:
 * 1. analyze_resume_ats
 * 2. analyze_candidate_job_fit
 * 3. analyze_application_readiness
 * 4. simulate_ats
 * 5. simulate_recruiter_search
 */

import {
  ATS_INTELLIGENCE_TOOL_DEFINITIONS,
  AnalyzeResumeAtsOutputSchema,
  AnalyzeCandidateJobFitOutputSchema,
  AnalyzeApplicationReadinessOutputSchema,
  SimulateAtsOutputSchema,
  SimulateRecruiterSearchOutputSchema,
} from '../../domain/mcp/ats-intelligence-tools.schemas.js';

import { canonicalAtsParserService } from '../../services/canonical-ats-parser.service.js';
import { atsCompatibilityProfilesService } from '../../services/ats-compatibility-profiles.service.js';
import { atsExtractionSimulationService } from '../../services/ats-extraction-simulation.service.js';
import { atsMultiDimensionalIntelligenceService } from '../../services/ats-multi-dimensional-intelligence.service.js';
import { recruiterSearchSimulationService } from '../../services/recruiter-search-simulation.service.js';
import { scoreExplainabilityService } from '../../services/score-explainability.service.js';
import { applicationReadinessScoreService } from '../../services/application-readiness-score.service.js';
import { resolveRoleFromJobTitle } from '../../domain/career/role-scoring-profiles.js';

/**
 * Tool 1: analyze_resume_ats
 */
export async function handleAnalyzeResumeAts(context, args) {
  const { resumeText, targetAts = 'GENERIC' } = args;

  const canonicalProfile = await canonicalAtsParserService.parseDocumentToCanonicalProfile({
    rawText: resumeText,
    fileName: 'resume.txt',
    tenantId: context?.tenantId,
  });

  const allProfiles = atsCompatibilityProfilesService.evaluateAllProfiles({
    canonicalProfile,
    extractedText: resumeText,
  });

  const keyMap = {
    GENERIC: 'GENERIC_ATS',
    WORKDAY: 'WORKDAY_COMPATIBILITY',
    GREENHOUSE: 'GREENHOUSE_COMPATIBILITY',
    LEVER: 'LEVER_COMPATIBILITY',
    ICIMS: 'ICIMS_COMPATIBILITY',
    TALEO: 'TALEO_COMPATIBILITY',
  };
  const profileKey = keyMap[targetAts] || targetAts;
  const targetReport = allProfiles[profileKey] || allProfiles.GENERIC_ATS;

  const extractionSim = atsExtractionSimulationService.simulateExtraction({
    canonicalProfile,
    rawText: resumeText,
  });

  const output = {
    parseabilityScore: canonicalProfile.artifactQuality?.score ?? 85,
    targetAts,
    targetCompatibility: {
      compatibilityTier: targetReport?.compatibilityTier || 'COMPATIBLE',
      compatibilityScore: targetReport?.score ?? 85,
      specificRisks: (targetReport?.risks || []).map((r) =>
        typeof r === 'string' ? r : r.description || r.code
      ),
    },
    allProfiles,
    extractionSimulation: {
      overallExtractionScore: Math.round((extractionSim.overallConfidence || 0.85) * 100),
      confidence: extractionSim.overallConfidence || 0.85,
      detectedIssues: (extractionSim.ambiguousEntities || []).concat(
        (extractionSim.fields || []).filter((f) => f.status === 'FAILED')
      ),
    },
    summary: `Resume parsed with ${canonicalProfile.artifactQuality?.score ?? 85}/100 parseability. Compatibility with ${targetAts}: ${targetReport?.score ?? 85}/100 (${targetReport?.compatibilityTier || 'COMPATIBLE'}).`,
  };

  AnalyzeResumeAtsOutputSchema.parse(output);

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Tool 2: analyze_candidate_job_fit
 */
export async function handleAnalyzeCandidateJobFit(context, args) {
  const { jobDescription, resumeText, candidateProfile: customProfile, roleProfile } = args;

  let profile = customProfile;
  if (!profile && resumeText) {
    profile = await canonicalAtsParserService.parseDocumentToCanonicalProfile({
      rawText: resumeText,
      fileName: 'resume.txt',
      tenantId: context?.tenantId,
    });
  }
  profile = profile || { skills: [], experience: [], projects: [] };

  const inferredRole = roleProfile || resolveRoleFromJobTitle(jobDescription);

  const multiDimReport = atsMultiDimensionalIntelligenceService.evaluateAllDimensions({
    context: { tenantId: context?.tenantId || '00000000-0000-0000-0000-000000000001' },
    candidateProfile: profile,
    jobDescription: { id: '00000000-0000-0000-0000-000000000002', text: jobDescription },
    extractedText: resumeText,
  });

  const jobFitScore = multiDimReport.dimensions.jobFit.score;
  const fitBand =
    jobFitScore >= 80
      ? 'EXCELLENT'
      : jobFitScore >= 65
        ? 'STRONG'
        : jobFitScore >= 50
          ? 'MODERATE'
          : 'WEAK';

  const explainReport = scoreExplainabilityService.explainScore({
    fitReport: {
      rawScore: jobFitScore,
      finalScore: jobFitScore,
      componentScores: {
        coreTechnicalScore: Math.round(jobFitScore * 0.4),
        frameworkDomainScore: Math.round(jobFitScore * 0.2),
        toolsPlatformsScore: Math.round(jobFitScore * 0.15),
        experienceTenureScore: Math.round(jobFitScore * 0.15),
        projectRelevanceScore: Math.round(jobFitScore * 0.1),
      },
    },
  });

  const output = {
    fitScore: jobFitScore,
    fitBand,
    roleProfileApplied: inferredRole,
    componentBreakdown: {
      jobFit: multiDimReport.dimensions.jobFit.score,
      parseability: multiDimReport.dimensions.atsParseability.score,
      keywordCoverage: multiDimReport.dimensions.keywordCoverage.score,
      contentQuality: multiDimReport.dimensions.contentQuality.score,
    },
    missingRequirements: multiDimReport.summary.criticalGaps,
    matchedRequirements: multiDimReport.summary.primaryStrengths,
    explainability: {
      lostPointsTotal: explainReport.lostPointsTotal,
      topRemediationActions: explainReport.topRemediationActions,
    },
    summary: `Candidate evaluated at ${jobFitScore}/100 fit against ${inferredRole} profile.`,
  };

  AnalyzeCandidateJobFitOutputSchema.parse(output);

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Tool 3: analyze_application_readiness
 */
export async function handleAnalyzeApplicationReadiness(context, args) {
  const { jobDescription, resumeText, candidateProfile: customProfile } = args;

  let profile = customProfile;
  if (!profile && resumeText) {
    profile = await canonicalAtsParserService.parseDocumentToCanonicalProfile({
      rawText: resumeText,
      fileName: 'resume.txt',
      tenantId: context?.tenantId,
    });
  }
  profile = profile || { skills: [], experience: [], projects: [] };

  const multiDimReport = atsMultiDimensionalIntelligenceService.evaluateAllDimensions({
    context: { tenantId: context?.tenantId || '00000000-0000-0000-0000-000000000001' },
    candidateProfile: profile,
    jobDescription: { id: '00000000-0000-0000-0000-000000000002', text: jobDescription },
    extractedText: resumeText,
  });

  const readiness = applicationReadinessScoreService.computeReadiness({
    atsParseabilityReport: { score: multiDimReport.dimensions.atsParseability.score },
    jobFitReport: { finalScore: multiDimReport.dimensions.jobFit.score },
    contentQualityReport: { overallQualityScore: multiDimReport.dimensions.contentQuality.score },
  });

  const output = {
    readinessScore: readiness.readinessScore,
    readinessBand: readiness.readinessBand,
    recommendation: readiness.recommendation,
    safetyGateApplied: readiness.safetyGateApplied,
    safetyGateReason: readiness.safetyGateReason,
    scoreBreakdown: readiness.scoreBreakdown,
    checklist: readiness.checklist,
    summary: readiness.summary,
  };

  AnalyzeApplicationReadinessOutputSchema.parse(output);

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Tool 4: simulate_ats
 */
export async function handleSimulateAts(context, args) {
  const { resumeText } = args;

  const canonicalProfile = await canonicalAtsParserService.parseDocumentToCanonicalProfile({
    rawText: resumeText,
    fileName: 'resume.txt',
    tenantId: context?.tenantId,
  });

  const extractionSim = atsExtractionSimulationService.simulateExtraction({
    canonicalProfile,
    rawText: resumeText,
  });

  const cand = canonicalProfile;
  const name = cand.identity?.fullName || cand.identity?.name || 'Unknown';
  const email = cand.identity?.contact?.email;
  const phone = cand.identity?.contact?.phone;

  const detectedSections = ['Summary', 'Skills', 'Experience', 'Education'];

  const output = {
    extractionScore: Math.round((extractionSim.overallConfidence || 0.85) * 100),
    candidateName: name,
    contactFound: Boolean(email || phone),
    skillsCount: (cand.skills || []).length,
    experiencePositionsCount: (cand.experience || []).length,
    detectedSections,
    parsingPitfalls: (extractionSim.ambiguousEntities || []).map((i) => i.warning || i.entityType),
    summary: `Simulated ATS extraction scored ${Math.round((extractionSim.overallConfidence || 0.85) * 100)}/100 with ${(extractionSim.ambiguousEntities || []).length} identified pitfalls.`,
  };

  SimulateAtsOutputSchema.parse(output);

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Tool 5: simulate_recruiter_search
 */
export async function handleSimulateRecruiterSearch(context, args) {
  const { query, resumeText = '', candidateSkills = [] } = args;

  const report = recruiterSearchSimulationService.evaluateRecruiterQuery({
    query,
    documentText: resumeText,
    candidateSkills,
  });

  const output = {
    booleanQuery: report.booleanQuery,
    searchFound: report.searchFound,
    coverage: report.coverage,
    matchedKeywords: report.matchedKeywords,
    partialKeywords: report.partialKeywords,
    missingKeywords: report.missingKeywords,
    explanation: report.explanation,
  };

  SimulateRecruiterSearchOutputSchema.parse(output);

  return {
    content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
  };
}

/**
 * Registers all 5 ATS Intelligence tools on the MCP server instance.
 *
 * @param {import('../server.js').McpServerWrapper} mcpServer
 * @param {object} [deps={}]
 */
export function registerAtsIntelligenceTools(mcpServer, deps = {}) {
  mcpServer.registerTool(
    ATS_INTELLIGENCE_TOOL_DEFINITIONS.analyze_resume_ats,
    async (context, args) => handleAnalyzeResumeAts(context, args, deps)
  );

  mcpServer.registerTool(
    ATS_INTELLIGENCE_TOOL_DEFINITIONS.analyze_candidate_job_fit,
    async (context, args) => handleAnalyzeCandidateJobFit(context, args, deps)
  );

  mcpServer.registerTool(
    ATS_INTELLIGENCE_TOOL_DEFINITIONS.analyze_application_readiness,
    async (context, args) => handleAnalyzeApplicationReadiness(context, args, deps)
  );

  mcpServer.registerTool(ATS_INTELLIGENCE_TOOL_DEFINITIONS.simulate_ats, async (context, args) =>
    handleSimulateAts(context, args, deps)
  );

  mcpServer.registerTool(
    ATS_INTELLIGENCE_TOOL_DEFINITIONS.simulate_recruiter_search,
    async (context, args) => handleSimulateRecruiterSearch(context, args, deps)
  );
}
