/**
 * @file Canonical Domain Zod Schemas for Project Relevance Scoring (P5-004)
 *
 * Implements the domain contracts approved in P5-004A (ARCH-014 / ADR-034):
 * 1. ProjectRelevanceBandEnum
 * 2. ProjectTypeEnum
 * 3. ProjectRelevanceScoreBreakdownSchema
 * 4. ProjectRelevanceExplanationSchema
 * 5. ProjectRelevanceSchema
 * 6. CandidateProjectRelevanceAnalysisSchema & ProjectRelevanceAnalysisSchema
 *
 * Strict validation rules:
 * - Strict object boundaries preventing accidental secret or provider payload propagation
 * - Canonical 0.0 - 100.0 score clamping
 * - Decimal confidence scores [0.00, 1.00]
 * - Bounded evidence references (max 5)
 * - Safe slugification and bounded strings
 */

import { z } from 'zod';
import { SafeSlugSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';

// ---------------------------------------------------------------------------
// 1. Domain Enumerations
// ---------------------------------------------------------------------------

export const ProjectRelevanceBandEnum = z.enum(['HIGH', 'MEDIUM', 'LOW', 'MINIMAL']);

export const ProjectTypeEnum = z.enum([
  'APPLICATION',
  'LIBRARY',
  'API',
  'WEBSITE',
  'CLI',
  'INFRASTRUCTURE',
  'DATA_PROJECT',
  'MONOREPO',
  'OTHER',
]);

export const ArchitecturalDimensionEnum = z.enum([
  'API_ROUTING',
  'DATA_PERSISTENCE',
  'AUTHENTICATION_SECURITY',
  'BACKGROUND_PROCESSING',
  'CLOUD_DEVOPS',
  'TESTING',
  'OBSERVABILITY',
  'CACHING',
  'EXTERNAL_INTEGRATIONS',
  'MODULAR_ARCHITECTURE',
]);

// ---------------------------------------------------------------------------
// 2. Score Breakdown Schema
// ---------------------------------------------------------------------------

export const ProjectRelevanceScoreBreakdownSchema = z.strictObject({
  requirementCoverageScore: z
    .number()
    .min(0.0, { message: 'requirementCoverageScore must be >= 0.0' })
    .max(50.0, { message: 'requirementCoverageScore cannot exceed 50.0' }),
  architecturalDensityScore: z
    .number()
    .min(0.0, { message: 'architecturalDensityScore must be >= 0.0' })
    .max(25.0, { message: 'architecturalDensityScore cannot exceed 25.0' }),
  evidenceQualityScore: z
    .number()
    .min(0.0, { message: 'evidenceQualityScore must be >= 0.0' })
    .max(15.0, { message: 'evidenceQualityScore cannot exceed 15.0' }),
  projectCompletenessScore: z
    .number()
    .min(0.0, { message: 'projectCompletenessScore must be >= 0.0' })
    .max(5.0, { message: 'projectCompletenessScore cannot exceed 5.0' }),
  recencyScore: z
    .number()
    .min(0.0, { message: 'recencyScore must be >= 0.0' })
    .max(5.0, { message: 'recencyScore cannot exceed 5.0' }),
  totalScore: z
    .number()
    .min(0.0, { message: 'totalScore must be >= 0.0' })
    .max(100.0, { message: 'totalScore cannot exceed 100.0' }),
});

// ---------------------------------------------------------------------------
// 3. Project Relevance Explanation Schema
// ---------------------------------------------------------------------------

export const ProjectRelevanceExplanationSchema = z.strictObject({
  requirementId: z.string().uuid().optional().nullable(),
  skillSlug: SafeSlugSchema.optional().nullable(),
  contribution: z.number().min(0.0).max(50.0),
  relationshipType: z
    .enum(['EXACT', 'BUILT_ON', 'ECOSYSTEM_OF', 'IMPLEMENTS', 'PARENT_OF', 'DOMAIN', 'NONE'])
    .default('NONE'),
  evidenceRefs: z.array(EvidenceRefSchema).default([]),
  reason: z.string().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// 4. Project Relevance Entity Schema
// ---------------------------------------------------------------------------

export const ProjectRelevanceSchema = z.strictObject({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  projectName: z.string().min(1, { message: 'Project name is required' }).max(255),
  projectSlug: SafeSlugSchema,
  projectType: ProjectTypeEnum.default('APPLICATION'),
  relevanceScore: z
    .number()
    .min(0.0, { message: 'relevanceScore must be >= 0.0' })
    .max(100.0, { message: 'relevanceScore cannot exceed 100.0' }),
  relevanceBand: ProjectRelevanceBandEnum,
  scoreBreakdown: ProjectRelevanceScoreBreakdownSchema,
  matchedRequirementIds: z.array(z.string().uuid()).default([]),
  contributingSkills: z.array(SafeSlugSchema).default([]),
  architecturalSignals: z.array(z.string()).default([]),
  supportingEvidence: z.array(EvidenceRefSchema).max(5).default([]),
  explanations: z.array(ProjectRelevanceExplanationSchema).default([]),
  explanation: z.string().min(1).max(1000),
  confidence: z
    .number()
    .min(0.0, { message: 'confidence must be >= 0.0' })
    .max(1.0, { message: 'confidence cannot exceed 1.0' }),
  resourcesCount: z.number().int().nonnegative().default(1),
});

// ---------------------------------------------------------------------------
// 5. Candidate Project Relevance Analysis (Top-Level Envelope)
// ---------------------------------------------------------------------------

export const CandidateProjectRelevanceAnalysisSchema = z.strictObject({
  jobDescriptionId: z.string().uuid({ message: 'JobDescription ID must be a valid UUID' }),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
  projectRankings: z.array(ProjectRelevanceSchema),
  topProject: ProjectRelevanceSchema.nullable().optional(),
  summary: z.strictObject({
    totalProjectsEvaluated: z.number().int().nonnegative(),
    highRelevanceCount: z.number().int().nonnegative(),
    mediumRelevanceCount: z.number().int().nonnegative(),
    lowRelevanceCount: z.number().int().nonnegative(),
    minimalRelevanceCount: z.number().int().nonnegative(),
    averageProjectScore: z.number().min(0.0).max(100.0),
  }),
  analyzedAt: z.string().datetime({ message: 'analyzedAt must be a valid ISO 8601 string' }),
});

/**
 * Functional schema alias for standalone or candidate-level project analysis.
 */
export const ProjectRelevanceAnalysisSchema = CandidateProjectRelevanceAnalysisSchema;
