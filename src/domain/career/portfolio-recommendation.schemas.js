/**
 * @file Canonical Domain Zod Schemas for Portfolio Recommendation Engine (P6-003)
 *
 * Implements the domain contracts approved in P6-003A (ARCH-019 / ADR-039):
 * 1. RecommendationStatusEnum
 * 2. OwnershipConfidenceEnum & ContributionConfidenceEnum
 * 3. TutorialClassificationEnum
 * 4. StoryCompletenessEnum
 * 5. JobFamilyEnum & PortfolioSignalEnum
 * 6. PortfolioOverrideSchema & PortfolioOverrideActionEnum
 * 7. HighlightedSkillSchema & RequirementCoverageItemSchema
 * 8. CaseStudyRecommendationSchema
 * 9. ProjectRecommendationSchema (featured, supporting, deprioritized)
 * 10. PortfolioWarningSchema
 * 11. PortfolioRecommendationSchema (canonical envelope)
 *
 * Strict validation rules:
 * - Strict object boundaries preventing accidental secret or provider payload propagation
 * - Decimal confidence and scores clamped [0.00, 1.00] and [0.0, 100.0]
 * - Bounded evidence highlights (max 5 per project)
 * - Bounded highlighted skills (max 6 across portfolio)
 * - Bounded featured projects (1 to 5)
 */

import { z } from 'zod';
import { SafeSlugSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';

// ---------------------------------------------------------------------------
// 1. Domain Enumerations
// ---------------------------------------------------------------------------

export const RecommendationStatusEnum = z.enum(['RECOMMENDED', 'OPTIONAL', 'DEPRIORITIZED']);

export const OwnershipConfidenceEnum = z.enum([
  'DIRECT_OWNER',
  'ORGANIZATION_MEMBER',
  'COLLABORATOR',
  'FORK_UPSTREAM',
  'UNCERTAIN',
]);

export const ContributionConfidenceEnum = z.enum([
  'PRIMARY_AUTHOR',
  'MAJOR_CONTRIBUTOR',
  'MINOR_CONTRIBUTOR',
  'UNVERIFIED',
]);

export const TutorialClassificationEnum = z.enum(['LIKELY_ORIGINAL', 'LIKELY_TUTORIAL', 'UNKNOWN']);

export const StoryCompletenessEnum = z.enum(['DOCUMENTED', 'PARTIAL', 'MISSING']);

export const JobFamilyEnum = z.enum([
  'BACKEND',
  'FRONTEND',
  'FULLSTACK',
  'DEVOPS_CLOUD',
  'DATA_ML',
  'AI_ENGINEERING',
  'GENERAL_SOFTWARE',
]);

export const PortfolioSignalEnum = z.enum([
  'BACKEND_DISTRIBUTED',
  'DATABASE_DATA_MODELING',
  'FRONTEND_UI_UX',
  'DEVOPS_INFRASTRUCTURE',
  'SECURITY_AUTH',
  'TESTING_QUALITY',
  'API_INTEGRATIONS',
]);

export const PortfolioOverrideActionEnum = z.enum([
  'PIN_FEATURED',
  'EXCLUDE_PROJECT',
  'REORDER_OVERRIDE',
]);

export const PortfolioPresentationModeEnum = z.enum(['PRESERVE_EXISTING', 'GENERATE_NEW']);

// ---------------------------------------------------------------------------
// 2. User Override Schema
// ---------------------------------------------------------------------------

export const PortfolioOverrideSchema = z.strictObject({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  action: PortfolioOverrideActionEnum,
  targetOrder: z.number().int().min(1).max(10).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

// ---------------------------------------------------------------------------
// 3. Highlighted Skills & Requirement Coverage Schemas
// ---------------------------------------------------------------------------

export const HighlightedSkillSchema = z.strictObject({
  skillSlug: SafeSlugSchema,
  skillName: z.string().min(1).max(100),
  priority: z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']),
  status: z.enum(['VERIFIED', 'INFERRED', 'CLAIMED']),
  confidenceScore: z.number().min(0.0).max(1.0),
  primaryProjectId: z.string().uuid().optional().nullable(),
  primaryProjectName: z.string().max(255).optional().nullable(),
});

export const RequirementCoverageItemSchema = z.strictObject({
  requirementId: z.string().uuid({ message: 'Requirement ID must be a valid UUID' }),
  requirementTitle: z.string().min(1).max(255),
  skillSlug: SafeSlugSchema.optional().nullable(),
  priority: z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']),
  status: z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN']),
  coveredByProjectId: z.string().uuid().optional().nullable(),
  coveredByProjectName: z.string().max(255).optional().nullable(),
  isPrimaryCoverage: z.boolean().default(true),
  isRedundantCoverage: z.boolean().default(false),
  contributionScore: z.number().min(0.0).max(100.0).default(0.0),
});

// ---------------------------------------------------------------------------
// 4. Case Study Recommendation Schema
// ---------------------------------------------------------------------------

export const CaseStudyRecommendationSchema = z.strictObject({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  projectDisplayName: z.string().min(1).max(255),
  whyFeatured: z.string().min(1).max(1000),
  primaryRoleHighlighted: z.string().min(1).max(100),
  skillsToHighlight: z.array(z.string().min(1).max(100)).default([]),
  evidenceCitations: z.array(EvidenceRefSchema).max(5).default([]),
  missingStoryElements: z.array(z.string()).default([]),
  questionsForCandidate: z.array(z.string()).max(10).default([]),
  interviewDiscussionTopics: z.array(z.string()).max(10).default([]),
});

// ---------------------------------------------------------------------------
// 5. Project Recommendation Item Schema
// ---------------------------------------------------------------------------

export const ProjectRecommendationSchema = z.strictObject({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  projectName: z.string().min(1).max(255),
  projectSlug: SafeSlugSchema,
  recommendationStatus: RecommendationStatusEnum,
  rank: z.number().int().min(1).max(100),
  selectionScore: z.number().min(0.0).max(100.0),
  marginalValue: z.number().min(0.0).max(100.0),
  ownershipConfidence: OwnershipConfidenceEnum.default('DIRECT_OWNER'),
  contributionConfidence: ContributionConfidenceEnum.default('PRIMARY_AUTHOR'),
  tutorialClassification: TutorialClassificationEnum.default('LIKELY_ORIGINAL'),
  storyCompleteness: StoryCompletenessEnum.default('PARTIAL'),
  interviewDiscussionValue: z.number().min(0.0).max(100.0).default(50.0),
  liveDemoAvailable: z.boolean().default(false),
  sourceAvailable: z.boolean().default(true),
  documentationAvailable: z.boolean().default(true),
  primaryRoleHighlighted: z.string().min(1).max(100).default('Software Engineer'),
  requirementsCovered: z.array(z.string().uuid()).default([]),
  signalsAdded: z.array(PortfolioSignalEnum).default([]),
  skillsToHighlight: z.array(z.string().min(1).max(100)).default([]),
  evidenceHighlights: z.array(EvidenceRefSchema).max(5).default([]),
  reason: z.string().min(1).max(1000),
  whyNotFeatured: z.string().max(1000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// 6. Portfolio Warnings & Metadata Schemas
// ---------------------------------------------------------------------------

export const PortfolioWarningSchema = z.strictObject({
  warningCode: z.enum([
    'UNCOVERED_CRITICAL_REQUIREMENT',
    'TUTORIAL_CLONE_DETECTED',
    'LOW_ARCHITECTURAL_DENSITY',
    'NO_AUTOMATED_TESTS',
    'UNCERTAIN_OWNERSHIP',
    'REDUNDANT_PORTFOLIO_SIGNALS',
    'USER_OVERRIDE_GAP_CREATED',
    'EMPTY_PORTFOLIO_RECOMMENDATION',
  ]),
  message: z.string().min(1).max(500),
  affectedProjectId: z.string().uuid().optional().nullable(),
  affectedRequirementId: z.string().uuid().optional().nullable(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).default('WARNING'),
});

export const PortfolioCoverageSchema = z.strictObject({
  totalRequirementsCount: z.number().int().nonnegative(),
  requiredRequirementsCount: z.number().int().nonnegative(),
  requiredCoveredCount: z.number().int().nonnegative(),
  preferredRequirementsCount: z.number().int().nonnegative(),
  preferredCoveredCount: z.number().int().nonnegative(),
  coveragePercentage: z.number().min(0.0).max(100.0),
  coveredRequirementIds: z.array(z.string().uuid()),
  uncoveredRequirementIds: z.array(z.string().uuid()),
});

export const PortfolioSignalCoverageSchema = z.strictObject({
  activeSignals: z.array(PortfolioSignalEnum),
  missingSignals: z.array(PortfolioSignalEnum),
  signalComplementarityScore: z.number().min(0.0).max(100.0),
  signalDistribution: z.record(PortfolioSignalEnum, z.number().int().nonnegative()),
});

export const PortfolioRecommendationMetadataSchema = z.strictObject({
  totalProjectsEvaluated: z.number().int().nonnegative(),
  featuredCount: z.number().int().min(1).max(5),
  supportingCount: z.number().int().nonnegative(),
  deprioritizedCount: z.number().int().nonnegative(),
  overridesAppliedCount: z.number().int().nonnegative().default(0),
  jobFamilyDetected: JobFamilyEnum,
  presentationMode: PortfolioPresentationModeEnum.default('GENERATE_NEW'),
  evaluatedAt: z.string().datetime({ message: 'evaluatedAt must be a valid ISO 8601 string' }),
  executionTimeMs: z.number().min(0.0),
});

// ---------------------------------------------------------------------------
// 7. Canonical Top-Level PortfolioRecommendation Schema
// ---------------------------------------------------------------------------

export const PortfolioRecommendationSchema = z.strictObject({
  recommendationId: z.string().uuid({ message: 'Recommendation ID must be a valid UUID' }),
  tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  targetJobId: z.string().uuid({ message: 'Job ID must be a valid UUID' }),
  targetJobTitle: z.string().min(1).max(255),
  targetCompanyName: z.string().min(1).max(255),
  jobFamily: JobFamilyEnum,

  // Curated Project Tiers
  featuredProjects: z
    .array(ProjectRecommendationSchema)
    .min(1, { message: 'Must contain at least 1 featured project' })
    .max(5, { message: 'Cannot feature more than 5 projects' }),
  supportingProjects: z.array(ProjectRecommendationSchema).default([]),
  deprioritizedProjects: z.array(ProjectRecommendationSchema).default([]),

  // Strategy & Coverage
  portfolioStrategySummary: z.string().min(10).max(2000),
  overallPortfolioConfidence: z.number().min(0.0).max(1.0),
  requirementCoverage: PortfolioCoverageSchema,
  targetRequirementsCovered: z.array(RequirementCoverageItemSchema).default([]),
  uncoveredRequirements: z.array(z.string()).default([]),
  portfolioSignals: PortfolioSignalCoverageSchema,
  highlightedSkills: z.array(HighlightedSkillSchema).max(6).default([]),

  // Case Studies & Enablement
  caseStudyRecommendations: z.array(CaseStudyRecommendationSchema).default([]),

  // Warnings
  warnings: z.array(PortfolioWarningSchema).default([]),

  // Metadata
  metadata: PortfolioRecommendationMetadataSchema,
});
