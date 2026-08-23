/**
 * @file Schema Definitions for MCP Application Artifact Tools (P7-005 / ARCH-024)
 *
 * Implements strict Zod validation contracts for the 3 core MCP application artifact tools:
 * 1. recommend_portfolio_projects (career:read / READONLY+MEMBER)
 * 2. draft_cover_letter (career:write / MEMBER)
 * 3. generate_tailored_resume (career:write / MEMBER)
 *
 * Enforces output budgets, advisory annotations, and safe response structures.
 */

import { z } from 'zod';
import { McpRoleEnum } from './mcp.schemas.js';
import {
  PortfolioOverrideSchema,
  JobFamilyEnum,
  RecommendationStatusEnum,
  OwnershipConfidenceEnum,
  ContributionConfidenceEnum,
  TutorialClassificationEnum,
  StoryCompletenessEnum,
} from '../career/portfolio-recommendation.schemas.js';
import { EvidenceRefSchema } from '../career/evidence-matching.schemas.js';
import { CoverLetterToneEnum } from '../career/cover-letter.schemas.js';
import {
  ResumePresentationModeEnum,
  ResumeTemplateIdEnum,
  PresentationIntegrityStatusEnum,
  SourceDocumentFormatEnum,
} from '../career/resume.schemas.js';

// =============================================================================
// Output Budget Constants
// =============================================================================

export const MAX_PORTFOLIO_OUTPUT_BYTES = 20480; // 20 KB
export const MAX_COVER_LETTER_OUTPUT_BYTES = 15360; // 15 KB
export const MAX_RESUME_OUTPUT_BYTES = 25600; // 25 KB

export const MAX_JOB_DESCRIPTION_CHARS = 20000; // 20 KB
export const MIN_JOB_DESCRIPTION_CHARS = 50;
export const MAX_EXISTING_RESUME_CHARS = 30000; // 30 KB

// =============================================================================
// Advisory Tool Annotations (MCP 2026-07-28 Standard)
// =============================================================================

export const CAREER_READ_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const CAREER_ARTIFACT_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const CAREER_ARTIFACT_TOOL_COST_METADATA = Object.freeze({
  recommend_portfolio_projects: {
    estimatedCost: 'medium',
    expectedLatencyMs: 80,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_PORTFOLIO_OUTPUT_BYTES,
  },
  draft_cover_letter: {
    estimatedCost: 'high',
    expectedLatencyMs: 150,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_COVER_LETTER_OUTPUT_BYTES,
  },
  generate_tailored_resume: {
    estimatedCost: 'high',
    expectedLatencyMs: 180,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_RESUME_OUTPUT_BYTES,
  },
});

// =============================================================================
// 1. recommend_portfolio_projects Schemas
// =============================================================================

export const RecommendPortfolioProjectsInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe(
        'Optional candidate UUID. If omitted, defaults to the candidate persona linked to the authenticated user.'
      ),
    jobDescriptionText: z
      .string()
      .min(
        MIN_JOB_DESCRIPTION_CHARS,
        `Job description must be at least ${MIN_JOB_DESCRIPTION_CHARS} characters.`
      )
      .max(
        MAX_JOB_DESCRIPTION_CHARS,
        `Job description exceeds maximum limit of ${MAX_JOB_DESCRIPTION_CHARS} characters.`
      )
      .optional()
      .describe('Direct text of the target job description (50 to 20,000 chars).'),
    jobId: z
      .string()
      .uuid('jobId must be a valid UUIDv4')
      .optional()
      .describe('Target job UUID previously indexed in the workspace.'),
    jobTitle: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe('Optional target job title (e.g., "Senior Backend Engineer").'),
    jobFamily: JobFamilyEnum.optional().describe(
      'Optional job family classification override (e.g., "BACKEND", "FRONTEND", "FULLSTACK", "DEVOPS_CLOUD", "DATA_ML", "AI_ENGINEERING", "GENERAL_SOFTWARE").'
    ),
    maxFeaturedProjects: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe('Maximum number of featured projects to recommend (1 to 5, default 3).'),
    userOverrides: z
      .array(PortfolioOverrideSchema)
      .optional()
      .describe('Optional user curation overrides (e.g. PIN_FEATURED, EXCLUDE_PROJECT).'),
  })
  .strict()
  .refine((data) => Boolean(data.jobDescriptionText || data.jobId), {
    message: 'Either jobDescriptionText or jobId must be provided.',
    path: ['jobDescriptionText'],
  });

export const HighlightedSkillSummarySchema = z
  .object({
    skillSlug: z.string(),
    skillName: z.string(),
    priority: z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']),
    demonstratedInProjects: z.array(z.string()).default([]),
  })
  .strict();

export const FeaturedProjectRecommendationSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string(),
    displayName: z.string().optional(),
    recommendationStatus: RecommendationStatusEnum.default('RECOMMENDED'),
    relevanceScore: z.number().min(0).max(100),
    marginalValueScore: z.number().default(0),
    ownershipConfidence: OwnershipConfidenceEnum.default('DIRECT_OWNER'),
    contributionConfidence: ContributionConfidenceEnum.default('PRIMARY_AUTHOR'),
    tutorialClassification: TutorialClassificationEnum.default('LIKELY_ORIGINAL'),
    storyCompleteness: StoryCompletenessEnum.default('DOCUMENTED'),
    primarySignals: z.array(z.string()).default([]),
    evidenceHighlights: z.array(EvidenceRefSchema).max(5).default([]),
    caseStudyPrompt: z.string().default(''),
    interviewDiscussionTopics: z.array(z.string()).default([]),
  })
  .strict();

export const SupportingProjectRecommendationSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string(),
    displayName: z.string().optional(),
    recommendationStatus: RecommendationStatusEnum.default('OPTIONAL'),
    relevanceScore: z.number().min(0).max(100),
    secondarySignals: z.array(z.string()).default([]),
  })
  .strict();

export const DeprioritizedProjectRecommendationSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string(),
    displayName: z.string().optional(),
    disqualificationReason: z.string(),
  })
  .strict();

export const RecommendPortfolioProjectsOutputSchema = z
  .object({
    recommendationId: z.string().uuid(),
    candidateId: z.string().uuid(),
    jobTitle: z.string(),
    jobFamily: JobFamilyEnum,
    signalComplementarityScore: z.number().min(0).max(100),
    highlightedSkills: z.array(HighlightedSkillSummarySchema).max(6).default([]),
    featuredProjects: z.array(FeaturedProjectRecommendationSchema).min(1).max(5),
    supportingProjects: z.array(SupportingProjectRecommendationSchema).max(5).default([]),
    deprioritizedProjects: z.array(DeprioritizedProjectRecommendationSchema).default([]),
    warnings: z.array(z.string()).default([]),
    _meta: z
      .object({
        cacheControl: z.object({
          cacheScope: z.string(),
          ttlMs: z.number(),
        }),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// 2. draft_cover_letter Schemas
// =============================================================================

export const DraftCoverLetterInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe(
        'Optional candidate UUID. If omitted, defaults to the candidate persona linked to the authenticated user.'
      ),
    jobDescriptionText: z
      .string()
      .min(
        MIN_JOB_DESCRIPTION_CHARS,
        `Job description must be at least ${MIN_JOB_DESCRIPTION_CHARS} characters.`
      )
      .max(
        MAX_JOB_DESCRIPTION_CHARS,
        `Job description exceeds maximum limit of ${MAX_JOB_DESCRIPTION_CHARS} characters.`
      )
      .optional()
      .describe('Direct text of the target job description (50 to 20,000 chars).'),
    jobId: z
      .string()
      .uuid('jobId must be a valid UUIDv4')
      .optional()
      .describe('Target job UUID previously indexed in the workspace.'),
    jobTitle: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe('Optional target job title (e.g., "Senior Backend Engineer").'),
    companyName: z.string().trim().max(255).optional().describe('Optional hiring company name.'),
    recipientName: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe('Optional hiring manager or team name (e.g., "Engineering Hiring Team").'),
    tone: CoverLetterToneEnum.default('PROFESSIONAL').describe(
      'Tone preset for cover letter phrasing: "PROFESSIONAL", "CONCISE", "CONFIDENT", or "WARM".'
    ),
    targetParagraphCount: z
      .number()
      .int()
      .min(3)
      .max(6)
      .default(4)
      .describe('Target number of paragraphs to generate (3 to 6, default 4).'),
    preferredProjectIds: z
      .array(z.string().uuid())
      .max(3)
      .optional()
      .describe('Optional array of project UUIDs (up to 3) to emphasize in evidence paragraphs.'),
  })
  .strict()
  .refine((data) => Boolean(data.jobDescriptionText || data.jobId), {
    message: 'Either jobDescriptionText or jobId must be provided.',
    path: ['jobDescriptionText'],
  });

export const CoverLetterParagraphOutputSchema = z
  .object({
    paragraphId: z.string().uuid(),
    paragraphType: z.enum([
      'OPENING',
      'COMPANY_ALIGNMENT',
      'RELEVANT_EXPERIENCE',
      'PROJECT_EVIDENCE',
      'MOTIVATION',
      'CLOSING',
    ]),
    text: z.string().trim().min(1).max(3000),
    status: z.enum(['VERIFIED', 'INFERRED', 'CLAIMED']).default('VERIFIED'),
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
    matchedKeywords: z.array(z.string().trim()).default([]),
    claimLabel: z.string().trim().nullable().optional(),
  })
  .strict();

export const DraftCoverLetterOutputSchema = z
  .object({
    letterId: z.string().uuid(),
    candidateId: z.string().uuid(),
    companyName: z.string(),
    jobTitle: z.string(),
    recipientName: z.string().nullable().optional(),
    tone: CoverLetterToneEnum,
    metadata: z
      .object({
        totalParagraphs: z.number().int().nonnegative(),
        wordCount: z.number().int().nonnegative(),
        characterCount: z.number().int().nonnegative(),
        verifiedParagraphsCount: z.number().int().nonnegative(),
        inferredParagraphsCount: z.number().int().nonnegative(),
        claimedParagraphsCount: z.number().int().nonnegative(),
      })
      .strict(),
    integrityReport: z
      .object({
        overallStatus: z.enum(['PASS', 'PARTIAL']),
        evidenceItemsCitedCount: z.number().int().nonnegative(),
      })
      .strict(),
    paragraphs: z.array(CoverLetterParagraphOutputSchema).min(3).max(6),
    warnings: z.array(z.string()).default([]),
    _meta: z
      .object({
        cacheControl: z.object({
          cacheScope: z.string(),
          ttlMs: z.number(),
        }),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// 3. generate_tailored_resume Schemas
// =============================================================================

export const GenerateTailoredResumeInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe(
        'Optional candidate UUID. If omitted, defaults to the candidate persona linked to the authenticated user.'
      ),
    jobDescriptionText: z
      .string()
      .min(
        MIN_JOB_DESCRIPTION_CHARS,
        `Job description must be at least ${MIN_JOB_DESCRIPTION_CHARS} characters.`
      )
      .max(
        MAX_JOB_DESCRIPTION_CHARS,
        `Job description exceeds maximum limit of ${MAX_JOB_DESCRIPTION_CHARS} characters.`
      )
      .optional()
      .describe('Direct text of the target job description (50 to 20,000 chars).'),
    jobId: z
      .string()
      .uuid('jobId must be a valid UUIDv4')
      .optional()
      .describe('Target job UUID previously indexed in the workspace.'),
    jobTitle: z
      .string()
      .trim()
      .max(255)
      .optional()
      .describe('Optional target job title (e.g., "Senior Backend Engineer").'),
    presentationMode: ResumePresentationModeEnum.default('GENERATE_NEW').describe(
      'Presentation mode: "GENERATE_NEW" (clean modern template) or "PRESERVE_EXISTING" (audited layout preservation).'
    ),
    existingResumeText: z
      .string()
      .max(
        MAX_EXISTING_RESUME_CHARS,
        `Existing resume text exceeds maximum limit of ${MAX_EXISTING_RESUME_CHARS} characters.`
      )
      .optional()
      .describe(
        'Existing resume text in Markdown or Plain Text when presentationMode is PRESERVE_EXISTING.'
      ),
    existingResumeFormat: SourceDocumentFormatEnum.optional().describe(
      'Format of the provided existing resume: "MARKDOWN", "PLAIN_TEXT", "DOCX", or "PDF".'
    ),
    templateId: ResumeTemplateIdEnum.default('ATS_FOCUSED').describe(
      'Visual template style when GENERATE_NEW mode is used: "ATS_FOCUSED", "PROFESSIONAL", "MODERN", "MINIMAL", or "TRADITIONAL".'
    ),
    targetOptions: z
      .object({
        includeSummary: z
          .boolean()
          .default(true)
          .describe('Whether to generate a targeted executive summary.'),
        maxProjects: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Max featured projects to highlight.'),
        maxBulletsPerRole: z
          .number()
          .int()
          .min(1)
          .max(6)
          .default(4)
          .describe('Max bullet points per experience role.'),
        preferredProjectIds: z
          .array(z.string().uuid())
          .max(3)
          .optional()
          .describe('Optional array of project UUIDs (up to 3) to prioritize.'),
      })
      .optional()
      .describe('Optional fine-grained tailoring parameters.'),
  })
  .strict()
  .refine((data) => Boolean(data.jobDescriptionText || data.jobId), {
    message: 'Either jobDescriptionText or jobId must be provided.',
    path: ['jobDescriptionText'],
  });

export const ResumeSkillCategoryOutputSchema = z
  .object({
    category: z.string(),
    skills: z.array(
      z.object({
        skillSlug: z.string(),
        skillName: z.string(),
        provenance: z.enum(['VERIFIED', 'INFERRED', 'CLAIMED']),
        confidenceScore: z.number().min(0).max(1).default(1.0),
        evidenceCount: z.number().int().nonnegative().default(0),
        claimLabel: z.string().nullable().optional(),
      })
    ),
  })
  .strict();

export const ResumeBulletOutputSchema = z
  .object({
    bulletId: z.string().uuid(),
    text: z.string().trim().min(1),
    status: z.enum(['VERIFIED', 'INFERRED', 'CLAIMED']).default('VERIFIED'),
    confidenceScore: z.number().min(0).max(1).default(1.0),
    evidenceRefs: z.array(EvidenceRefSchema).default([]),
    assertionIds: z.array(z.string().uuid()).default([]),
    matchedKeywords: z.array(z.string()).default([]),
    claimLabel: z.string().nullable().optional(),
  })
  .strict();

export const ResumeExperienceEntryOutputSchema = z
  .object({
    company: z.string(),
    title: z.string(),
    location: z.string().nullable().optional(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
    isCurrent: z.boolean().default(false),
    bullets: z.array(ResumeBulletOutputSchema).default([]),
  })
  .strict();

export const ResumeProjectEntryOutputSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string(),
    displayName: z.string().optional(),
    description: z.string().nullable().optional(),
    relevanceScore: z.number().min(0).max(100).default(0.0),
    relevanceBand: z.string().optional(),
    bullets: z.array(ResumeBulletOutputSchema).default([]),
  })
  .strict();

export const GenerateTailoredResumeOutputSchema = z
  .object({
    resumeId: z.string().uuid(),
    candidateId: z.string().uuid(),
    jobTitle: z.string(),
    presentationMode: ResumePresentationModeEnum,
    templateId: z.string().nullable().optional(),
    presentationAudit: z
      .object({
        status: PresentationIntegrityStatusEnum,
        preservedAttributes: z.record(z.any()).nullable().optional(),
        modifiedAttributes: z.record(z.any()).nullable().optional(),
        warnings: z.array(z.string()).default([]),
      })
      .strict(),
    integrityReport: z
      .object({
        overallStatus: z.enum(['PASS', 'PARTIAL']),
        verifiedAssertionsCount: z.number().int().nonnegative(),
        inferredAssertionsCount: z.number().int().nonnegative(),
        claimedAssertionsCount: z.number().int().nonnegative(),
        evidenceItemsCitedCount: z.number().int().nonnegative(),
      })
      .strict(),
    auditReport: z
      .object({
        status: z.enum(['PASS', 'WARN']),
        totalClaimsChecked: z.number().int().nonnegative(),
        verifiedClaimsCount: z.number().int().nonnegative(),
        warningsCount: z.number().int().nonnegative(),
      })
      .strict(),
    resume: z
      .object({
        basics: z.object({
          name: z.string(),
          headline: z.string().nullable().optional(),
          summary: z.string().nullable().optional(),
          email: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
        }),
        summaryBullets: z.array(z.string()).default([]),
        skills: z.array(ResumeSkillCategoryOutputSchema).default([]),
        experience: z.array(ResumeExperienceEntryOutputSchema).default([]),
        projects: z.array(ResumeProjectEntryOutputSchema).default([]),
        education: z.array(z.record(z.any())).default([]),
        certifications: z.array(z.record(z.any())).default([]),
      })
      .strict(),
    warnings: z.array(z.string()).default([]),
    _meta: z
      .object({
        cacheControl: z.object({
          cacheScope: z.string(),
          ttlMs: z.number(),
        }),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// Tool Definitions Catalog (P7-005)
// =============================================================================

export const CAREER_ARTIFACT_TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'recommend_portfolio_projects',
    description:
      'Recommends optimal featured portfolio repositories and architectural hiring signals for a target job without modifying projects or storing state.',
    inputSchema: RecommendPortfolioProjectsInputSchema,
    outputSchema: RecommendPortfolioProjectsOutputSchema,
    requiredScopes: ['career:read'],
    requiredRole: McpRoleEnum.enum.READONLY,
    annotations: CAREER_READ_TOOL_ANNOTATIONS,
  },
  {
    name: 'draft_cover_letter',
    description:
      'Drafts an authentic, evidence-backed cover letter tailored for a target role using verified candidate experience and tone presets without database persistence.',
    inputSchema: DraftCoverLetterInputSchema,
    outputSchema: DraftCoverLetterOutputSchema,
    requiredScopes: ['career:write'],
    requiredRole: McpRoleEnum.enum.MEMBER,
    annotations: CAREER_ARTIFACT_TOOL_ANNOTATIONS,
  },
  {
    name: 'generate_tailored_resume',
    description:
      'Synthesizes an evidence-backed tailored resume for a target job, verifying bullet truthfulness against repository code and preserving visual/template styling.',
    inputSchema: GenerateTailoredResumeInputSchema,
    outputSchema: GenerateTailoredResumeOutputSchema,
    requiredScopes: ['career:write'],
    requiredRole: McpRoleEnum.enum.MEMBER,
    annotations: CAREER_ARTIFACT_TOOL_ANNOTATIONS,
  },
]);
