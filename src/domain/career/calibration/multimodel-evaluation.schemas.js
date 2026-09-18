/**
 * @file Multi-Model Evaluation & Benchmark Calibration Schemas (P84)
 *
 * Defines canonical schemas for multi-model independent ATS evaluations
 * (Claude, Gemini, Grok), cross-model agreement metrics, consensus/conflict
 * classification, claim evidence provenance audits, and safe optimization rules.
 */

import { z } from 'zod';

export const MultiModelProviderEnum = z.enum(['claude', 'gemini', 'grok']);

export const MultiModelRecommendationEnum = z.enum([
  'STRONG_MATCH',
  'MODERATE_MATCH',
  'WEAK_MATCH',
  'NO_MATCH',
]);

export const DisagreementLevelEnum = z.enum([
  'LOW',      // range <= 5
  'MODERATE', // range 6-10
  'HIGH',     // range > 10
]);

export const FindingConsensusLevelEnum = z.enum([
  'CONSENSUS',   // 3/3 agreement
  'MAJORITY',    // 2/3 agreement
  'MINORITY',    // 1/3 single model
  'CONFLICTING', // Models directly contradict each other
  'UNVERIFIED',  // Flagged without evidence
]);

export const ClaimEvidenceStatusEnum = z.enum([
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'UNSUPPORTED',
  'CONTRADICTED',
]);

export const SafeOptimizationCategoryEnum = z.enum([
  'SAFE',        // Terminology normalization / preserving verified facts
  'UNSAFE',      // Injecting unevidenced technologies or fabricated metrics
  'CONDITIONAL', // Restoring candidate-owned verified facts omitted from draft
]);

export const MultiModelConfidenceEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const EvaluatorIdentitySchema = z.strictObject({
  provider: MultiModelProviderEnum,
  model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
});

export const MultiModelScoresSchema = z.strictObject({
  ats_parseability: z.number().min(0).max(100),
  job_match: z.number().min(0).max(100),
  keyword_coverage: z.number().min(0).max(100),
  content_quality: z.number().min(0).max(100),
  evidence_integrity: z.number().min(0).max(100),
  human_recruiter_strength: z.number().min(0).max(100),
  overall_resume_quality: z.number().min(0).max(100),
});

export const MultiModelEvaluationRecordSchema = z.strictObject({
  evaluationVersion: z.string().trim().default('p84.0'),
  resumeArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash'),
  jobDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash'),
  engineScoreVersion: z.string().trim().default('p82.0'),
  evaluator: EvaluatorIdentitySchema,
  scores: MultiModelScoresSchema,
  recommendation: MultiModelRecommendationEnum,
  criticalWeaknesses: z.array(z.string().trim().min(1)).default([]),
  strongestEvidence: z.array(z.string().trim().min(1)).default([]),
  atsRiskFlags: z.array(z.string().trim().min(1)).default([]),
  unsupportedOrSuspicious: z.array(z.string().trim().min(1)).default([]),
  confidence: MultiModelConfidenceEnum.default('MEDIUM'),
  createdAt: z.string().trim().min(1),
});

export const DimensionAgreementMetricSchema = z.strictObject({
  dimension: z.string().trim().min(1),
  claude: z.number().min(0).max(100),
  gemini: z.number().min(0).max(100),
  grok: z.number().min(0).max(100),
  mean: z.number().min(0).max(100),
  median: z.number().min(0).max(100),
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  range: z.number().min(0).max(100),
  standardDeviation: z.number().min(0),
  disagreementLevel: DisagreementLevelEnum,
});

export const ConsensusFindingItemSchema = z.strictObject({
  finding: z.string().trim().min(1),
  claude: z.boolean(),
  gemini: z.boolean(),
  grok: z.boolean(),
  agreementRate: z.number().min(0.0).max(1.0),
  consensus: FindingConsensusLevelEnum,
  observation: z.string().trim().min(1),
  actionableForOptimizer: z.boolean(),
});

export const ClaimProvenanceAuditSchema = z.strictObject({
  claim: z.string().trim().min(1),
  status: ClaimEvidenceStatusEnum,
  evidence: z.strictObject({
    inSummary: z.boolean(),
    inSkills: z.boolean(),
    inProjects: z.boolean(),
    inExperience: z.boolean(),
    inCanonicalFacts: z.boolean(),
    hasBaseline: z.boolean().default(false),
    hasMeasurementMethod: z.boolean().default(false),
  }),
  decision: z.string().trim().min(1),
  optimizationSafety: SafeOptimizationCategoryEnum,
});

export const RequirementMappingComparisonSchema = z.strictObject({
  requirement: z.string().trim().min(1),
  importance: z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']),
  engineStatus: z.string().trim().min(1),
  claudeStatus: z.string().trim().min(1),
  geminiStatus: z.string().trim().min(1),
  grokStatus: z.string().trim().min(1),
  agreementRate: z.number().min(0.0).max(1.0),
  consensus: FindingConsensusLevelEnum,
});

export const MultiModelCalibrationReportSchema = z.strictObject({
  benchmarkVersion: z.string().trim().default('p84.0'),
  scoreNaming: z.string().trim().default('ATS Compatibility & Job Match Score'),
  sampleSize: z.number().int().positive(),
  isStatisticallySufficient: z.boolean(),
  calibrationType: z.enum(['CASE_STUDY', 'EMPIRICAL_BENCHMARK']),
  evaluatedAt: z.string().trim(),
  overallStatistics: z.strictObject({
    claude: z.number(),
    gemini: z.number(),
    grok: z.number(),
    external_model_mean: z.number(),
    external_model_median: z.number(),
    external_model_range: z.number(),
    min: z.number(),
    max: z.number(),
    standardDeviation: z.number(),
    disagreementLevel: DisagreementLevelEnum,
  }),
  dimensionAgreement: z.array(DimensionAgreementMetricSchema),
  findingConsensus: z.array(ConsensusFindingItemSchema),
  claimAudits: z.array(ClaimProvenanceAuditSchema),
  requirementMappings: z.array(RequirementMappingComparisonSchema),
  engineVsBenchmark: z.strictObject({
    enginePublishableScore: z.number(),
    externalMedianDelta: z.number(),
    externalMeanDelta: z.number(),
    divergenceAlert: z.boolean(),
  }),
  productionVerdict: z.string().trim(),
});
