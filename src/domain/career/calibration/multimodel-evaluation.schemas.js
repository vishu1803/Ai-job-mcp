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
  'LOW', // range <= 5
  'MODERATE', // range 6-10
  'HIGH', // range > 10
]);

export const FindingConsensusLevelEnum = z.enum([
  'CONSENSUS', // 3/3 agreement
  'MAJORITY', // 2/3 agreement
  'MINORITY', // 1/3 single model
  'CONFLICTING', // Models directly contradict each other
  'UNVERIFIED', // Flagged without evidence
]);

export const ClaimEvidenceStatusEnum = z.enum([
  'VERIFIED',
  'SUPPORTED',
  'PARTIALLY_SUPPORTED',
  'UNSUPPORTED',
  'CONTRADICTED',
  'UNVERIFIED',
]);

export const SafeOptimizationCategoryEnum = z.enum([
  'SAFE', // Terminology normalization / preserving verified facts
  'UNSAFE', // Injecting unevidenced technologies or fabricated metrics
  'CONDITIONAL', // Restoring candidate-owned verified facts omitted from draft
]);

export const MultiModelConfidenceEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const EvaluatorTypeEnum = z.enum([
  'LLM_EXTERNAL',
  'HUMAN_RECRUITER',
  'HIRING_MANAGER',
  'ENGINEERING_REVIEWER',
]);

export const FindingTaxonomyEnum = z.enum([
  'MISSING_REQUIRED_SKILL',
  'MISSING_PREFERRED_SKILL',
  'EXACT_SKILL_MATCH',
  'RELATED_SKILL_MATCH',
  'UNSUPPORTED_CLAIM',
  'PARTIALLY_SUPPORTED_CLAIM',
  'VERIFIED_CLAIM',
  'METRIC_EVIDENCE_GAP',
  'FORMAT_RISK',
  'DATE_FORMAT_RISK',
  'LINK_EXTRACTION_RISK',
  'SECTION_STRUCTURE_RISK',
  'CONTENT_QUALITY_ISSUE',
  'KEYWORD_COVERAGE_GAP',
  'KEYWORD_STUFFING_RISK',
  'DEGREE_REQUIREMENT_MISMATCH',
  'EXPERIENCE_REQUIREMENT_MISMATCH',
  'LOCATION_REQUIREMENT_MISMATCH',
]);

export const FindingStanceEnum = z.enum(['SUPPORT', 'REJECT', 'PARTIAL', 'UNKNOWN']);

export const P85OptimizationActionEnum = z.enum([
  'SAFE_FIX',
  'CONDITIONAL_USER_CONFIRMATION',
  'UNSAFE_FABRICATION',
  'NO_ACTION',
  'NO_AUTO_ACTION',
]);

export const BenchmarkStateEnum = z.enum([
  'DRAFT',
  'FROZEN',
  'EVALUATING',
  'COMPLETE',
  'SUPERSEDED',
]);

export const DatasetRoleEnum = z.enum(['DEVELOPMENT', 'CALIBRATION', 'HOLDOUT']);

export const ContaminationStatusEnum = z.enum(['CLEAN', 'CONTAMINATED', 'UNKNOWN']);

export const EvaluatorIdentitySchema = z.strictObject({
  provider: MultiModelProviderEnum,
  model: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  modelVersion: z.string().trim().nullable().optional(),
  evaluatorType: EvaluatorTypeEnum.default('LLM_EXTERNAL'),
});

export const MultiModelScoresSchema = z.strictObject({
  ats_parseability: z.number().min(0).max(100),
  job_match: z.number().min(0).max(100),
  keyword_coverage: z.number().min(0).max(100),
  content_quality: z.number().min(0).max(100),
  evidence_integrity: z.number().min(0).max(100),
  human_recruiter_strength: z.number().min(0).max(100),
  human_review_proxy: z.number().min(0).max(100).optional(),
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

export const EvaluatorProvenanceSchema = z.strictObject({
  evaluationId: z.string().trim().min(1),
  evaluatorType: EvaluatorTypeEnum.default('LLM_EXTERNAL'),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  modelVersion: z.string().trim().nullable().default(null),
  promptVersion: z.string().trim().min(1),
  promptDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  rubricVersion: z.string().trim().default('p84-rubric-v1'),
  evaluationTimestamp: z.string().trim().min(1),
  inputResumeSha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash'),
  inputJobDescriptionSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash'),
  inputPdfSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  extractedTextSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  inputDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  outputDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  responseSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char SHA-256 hash')
    .nullable()
    .default(null),
  temperature: z.number().nullable().default(null),
  seed: z.number().nullable().default(null),
  generationParameters: z.record(z.unknown()).default({}),
  schemaVersion: z.string().trim().default('p85.0'),
  sourceType: z.string().trim().default('SYNTHETIC_LLM_EVALUATOR'),
});

export const NormalizedFindingSchema = z.strictObject({
  findingId: z.string().trim().min(1),
  category: FindingTaxonomyEnum,
  subject: z.string().trim().min(1),
  normalizedClaim: z.string().trim().min(1),
  evaluatorId: z.string().trim().min(1),
  stance: FindingStanceEnum,
  confidence: MultiModelConfidenceEnum.default('MEDIUM'),
  evidenceRequirement: z.string().trim().default('CANONICAL_FACTS_OR_PROJECTS'),
  evidenceStatus: ClaimEvidenceStatusEnum.default('UNVERIFIED'),
  rawText: z.string().trim().optional(),
});

export const ConflictingPositionItemSchema = z.strictObject({
  stance: FindingStanceEnum,
  evaluators: z.array(z.string().trim().min(1)),
  observation: z.string().trim().optional(),
});

export const SemanticConsensusFindingSchema = z.strictObject({
  findingId: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  category: FindingTaxonomyEnum,
  classification: FindingConsensusLevelEnum,
  positions: z.array(ConflictingPositionItemSchema),
  evidenceStatus: ClaimEvidenceStatusEnum,
  action: P85OptimizationActionEnum,
  rationale: z.string().trim().min(1),
});

export const BenchmarkGovernanceReportSchema = z.strictObject({
  benchmarkVersion: z.string().trim().default('p85.0'),
  benchmarkId: z.string().trim().min(1),
  datasetVersion: z.string().trim().min(1),
  datasetRole: DatasetRoleEnum.default('CALIBRATION'),
  contaminationStatus: ContaminationStatusEnum.default('CLEAN'),
  benchmarkState: BenchmarkStateEnum.default('COMPLETE'),
  scoreNaming: z.string().trim().default('ATS Compatibility & Job Match Score'),
  sampleSize: z.number().int().positive(),
  isStatisticallySufficient: z.boolean(),
  evaluatedAt: z.string().trim().min(1),
  evaluators: z.array(EvaluatorProvenanceSchema),
  inputHashes: z.strictObject({
    inputResumeSha256: z.string().regex(/^[a-f0-9]{64}$/i),
    inputJobDescriptionSha256: z.string().regex(/^[a-f0-9]{64}$/i),
    inputPdfSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .default(null),
    extractedTextSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .default(null),
    evaluatorInputDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .default(null),
  }),
  operationalDisagreementThresholds: z.strictObject({
    low: z.string().default('range <= 5'),
    moderate: z.string().default('6 <= range <= 10'),
    high: z.string().default('range > 10'),
    status: z.string().default('OPERATIONAL_HEURISTIC_NOT_STATISTICALLY_VALIDATED'),
  }),
  overallStatistics: z.strictObject({
    external_model_mean: z.number(),
    external_model_median: z.number(),
    external_model_range: z.number(),
    min: z.number(),
    max: z.number(),
    standardDeviation: z.number(),
    coefficientOfVariation: z.number().nullable().default(null),
    disagreementLevel: DisagreementLevelEnum,
    pairwiseDifferences: z.record(z.number()).default({}),
    recommendationsCategorical: z.record(z.number()).default({}),
  }),
  evaluatorReliability: z.strictObject({
    evaluatorCoverage: z.number().min(0).max(1.0),
    evaluatorAgreement: z.number().min(0).max(1.0),
    dimensionDisagreement: DisagreementLevelEnum,
    missingOutputRate: z.number().min(0).max(1.0).default(0),
    schemaViolationRate: z.number().min(0).max(1.0).default(0),
    unsupportedFindingRate: z.number().min(0).max(1.0).default(0),
    humanRecruiterClaimStatus: z.enum(['VERIFIED_HUMAN', 'SYNTHETIC_PROXY_ONLY']),
  }),
  dimensionAgreement: z.array(DimensionAgreementMetricSchema),
  semanticConsensusFindings: z.array(SemanticConsensusFindingSchema),
  blindnessStatus: z.enum(['VERIFIED_ISOLATED', 'CONTAMINATED_OR_LEAKED']),
  productionScoreImmutabilityStatus: z.enum(['VERIFIED_IMMUTABLE', 'MUTATED']),
  engineVsBenchmark: z.strictObject({
    enginePublishableScore: z.number(),
    externalMedianDelta: z.number(),
    externalMeanDelta: z.number(),
    divergenceAlert: z.boolean(),
  }),
  governanceVerdict: z.strictObject({
    implementationPass: z.boolean(),
    calibrationEvidence: z.string(),
    humanValidation: z.string(),
    summary: z.string(),
  }),
  limitations: z.array(z.string().trim().min(1)),
});
