import { z } from 'zod';
import { CandidateJobFitAnalysisSchema } from './ats-fit-score.schemas.js';
import { CandidateMatchAnalysisSchema } from './evidence-matching.schemas.js';
import { CandidateProjectRelevanceAnalysisSchema } from './project-relevance.schemas.js';
import { ResumeKeywordCoverageReportSchema } from './resume-keyword-coverage.schemas.js';

export const RESUME_STUDIO_CONTRACT_VERSION = '1.0.0';

export const StudioJobTargetSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    company: z.string().trim().min(1).max(255).optional(),
    sourceUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      }, 'Use an HTTP(S) URL without credentials')
      .optional(),
    rawDescription: z.string().trim().min(100).max(250000),
  })
  .strict();

export const StudioAnalyzeRequestSchema = z
  .object({
    jobTarget: StudioJobTargetSchema,
  })
  .strict();

export const StudioKeywordSchema = z
  .object({
    term: z.string(),
    category: z.enum([
      'EXACT_VERIFIED',
      'EXACT_CLAIMED',
      'TAXONOMY_EQUIVALENT',
      'RELATED_INSUFFICIENT',
      'MISSING_IN_PROFILE',
      'UNSUPPORTED_ON_RESUME',
    ]),
    truthState: z.enum(['VERIFIED', 'CLAIMED', 'INFERRED', 'MISSING_EVIDENCE']),
    lexicalMatchType: z.string(),
    satisfiesRequirement: z.boolean(),
    explanation: z.string(),
  })
  .strict();

export const StudioAnalyzeResponseSchema = z
  .object({
    contractVersion: z.literal(RESUME_STUDIO_CONTRACT_VERSION),
    candidateId: z.string().uuid(),
    analyzedAt: z.string().datetime(),
    target: z
      .object({
        title: z.string(),
        company: z.string().nullable(),
        requirementsCount: z.number().int().nonnegative(),
        extractionMode: z.literal('DETERMINISTIC'),
      })
      .strict(),
    warnings: z.array(
      z.object({ code: z.literal('JOB_DESCRIPTION_TRUNCATED'), message: z.string() }).strict()
    ),
    candidateFit: CandidateJobFitAnalysisSchema.nullable(),
    fitStatus: z.enum(['AVAILABLE', 'INSUFFICIENT_REQUIREMENTS']),
    requirementAnalysis: CandidateMatchAnalysisSchema,
    projectRelevance: CandidateProjectRelevanceAnalysisSchema,
    keywordCoverage: ResumeKeywordCoverageReportSchema,
    keywords: z.array(StudioKeywordSchema),
    writingQuality: z
      .object({
        status: z.enum(['AVAILABLE', 'NOT_EVALUABLE']),
        report: z
          .object({
            writingQualityScore: z.number().min(0).max(100),
            dimensions: z.record(z.unknown()),
            findings: z.array(z.unknown()),
            strengths: z.array(z.string()),
            recommendations: z.array(z.string()),
          })
          .passthrough()
          .nullable(),
      })
      .strict(),
    parseability: z.object({ status: z.literal('NOT_VERIFIED'), reason: z.string() }).strict(),
  })
  .strict();
