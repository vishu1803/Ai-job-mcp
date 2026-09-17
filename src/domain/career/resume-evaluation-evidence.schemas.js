/**
 * @file Resume Evaluation Evidence Domain Schema
 *
 * Canonical internal traceability object linking requirements, candidate evidence,
 * structured claims, rendered/observed artifacts, validation status, and score contributions.
 *
 * Traceability Path:
 * Requirement -> Candidate Evidence -> Structured Claim -> Rendered Artifact -> Observed Artifact -> Validation -> Score Contribution
 */

import { z } from 'zod';

export const RequirementTypeEnum = z.enum([
  'TECHNICAL_SKILL',
  'EXPERIENCE',
  'EDUCATION',
  'LOCATION',
  'DOMAIN',
  'RESPONSIBILITY',
]);

export const RequirementImportanceEnum = z.enum([
  'REQUIRED',
  'PREFERRED',
  'OPTIONAL',
]);

export const CandidateAuthorizationEnum = z.enum([
  'AUTHORIZED',
  'UNAUTHORIZED',
  'EVIDENCE_MISSING',
  'CONTRADICTED',
  'UNKNOWN',
]);

export const KeywordPolarityEnum = z.enum([
  'POSITIVE',
  'NEGATED',
  'ASPIRATIONAL',
  'CONTEXT_ONLY',
  'UNKNOWN',
]);

export const EvidenceMatchTypeEnum = z.enum([
  'EXACT',
  'TAXONOMY_EQUIVALENT',
  'RELATED',
  'MISSING',
  'UNSUPPORTED_CANDIDATE',
]);

export const ResumeEvaluationEvidenceSchema = z.strictObject({
  id: z.string().trim().min(1),
  requirement: z.string().trim().min(1),
  requirementType: RequirementTypeEnum.default('TECHNICAL_SKILL'),
  importance: RequirementImportanceEnum.default('REQUIRED'),
  candidateAuthorization: CandidateAuthorizationEnum.default('UNKNOWN'),
  structuredPresence: z.boolean().default(false),
  artifactPresence: z.boolean().default(false),
  isRendered: z.boolean().default(false),
  polarity: KeywordPolarityEnum.default('POSITIVE'),
  matchType: EvidenceMatchTypeEnum.default('MISSING'),
  satisfiesRequirement: z.boolean().default(false),
  scoreContribution: z.number().min(0.0),
  maxPossibleScore: z.number().min(0.0),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0.0).max(1.0).default(1.0),
  confidenceFactors: z
    .strictObject({
      pdfExtractionQuality: z.number().min(0.0).max(1.0).optional(),
      requirementExtractionQuality: z.number().min(0.0).max(1.0).optional(),
      taxonomyResolution: z.number().min(0.0).max(1.0).optional(),
      evidenceCoverage: z.number().min(0.0).max(1.0).optional(),
    })
    .optional(),
  explanation: z.string().trim().min(1),
  recordedAt: z.string().datetime().default(() => new Date().toISOString()),
});

export const ResumeEvaluationTraceabilityReportSchema = z.strictObject({
  candidateId: z.string().nullable().optional(),
  jobId: z.string().nullable().optional(),
  totalRequirementsEvaluated: z.number().int().nonnegative(),
  totalEarnedScore: z.number().min(0.0),
  totalPossibleScore: z.number().min(0.0),
  evidenceItems: z.array(ResumeEvaluationEvidenceSchema).default([]),
  overallConfidence: z.number().min(0.0).max(1.0),
  generatedAt: z.string().datetime().default(() => new Date().toISOString()),
});
