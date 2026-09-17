/**
 * @file Resume Keyword Coverage Domain Schemas
 *
 * Defines canonical schemas for ATS keyword coverage analysis,
 * match classification (EXACT, TAXONOMY_EQUIVALENT, RELATED, MISSING, UNSUPPORTED_CANDIDATE),
 * contextual section placement, and explainable keyword stuffing detection.
 */

import { z } from 'zod';

export const KeywordMatchClassificationEnum = z.enum([
  'EXACT',
  'TAXONOMY_EQUIVALENT',
  'RELATED',
  'MISSING',
  'UNSUPPORTED_CANDIDATE',
]);

export const ResumeSectionEnum = z.enum([
  'header',
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
  'dsa',
]);

export const KeywordPlacementSchema = z.strictObject({
  keyword: z.string().trim().min(1),
  canonicalSkill: z.string().trim().min(1),
  category: z.string().trim().default('TOOL'),
  occurrences: z.number().int().nonnegative(),
  sections: z.array(ResumeSectionEnum).default([]),
  contextualBreadthScore: z.number().min(0.0).max(1.0).default(0.0),
  isNaturalUsage: z.boolean().default(true),
  stuffingWarning: z.string().nullable().default(null),
});

export const TermCoverageItemSchema = z.strictObject({
  term: z.string().trim().min(1),
  canonicalSlug: z.string().trim().min(1),
  canonicalName: z.string().trim().min(1),
  importance: z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']),
  matchType: KeywordMatchClassificationEnum,
  satisfiesRequirement: z.boolean(),
  matchedResumeTerm: z.string().nullable().default(null),
  placements: z.array(ResumeSectionEnum).default([]),
  occurrences: z.number().int().nonnegative().default(0),
  relationshipType: z.string().nullable().default(null),
  explanation: z.string().trim().min(1),
});

export const KeywordStuffingWarningSchema = z.strictObject({
  term: z.string().trim().min(1),
  section: ResumeSectionEnum,
  occurrences: z.number().int().positive(),
  densityScore: z.number().min(0.0).max(1.0),
  reason: z.string().trim().min(1),
});

export const ResumeKeywordCoverageReportSchema = z.strictObject({
  overallCoveragePercent: z.number().min(0).max(100),
  totalJobTerms: z.number().int().nonnegative(),
  requiredTerms: z.number().int().nonnegative(),
  preferredTerms: z.number().int().nonnegative(),
  exactMatches: z.number().int().nonnegative(),
  taxonomyMatches: z.number().int().nonnegative(),
  semanticMatches: z.number().int().nonnegative(),
  missingTerms: z.number().int().nonnegative(),
  criticalMissingTerms: z.number().int().nonnegative(),
  termBreakdown: z.array(TermCoverageItemSchema).default([]),
  keywordPlacements: z.array(KeywordPlacementSchema).default([]),
  stuffingWarnings: z.array(KeywordStuffingWarningSchema).default([]),
  confidence: z.number().min(0.0).max(1.0).default(1.0),
  analyzedAt: z.string().datetime().default(() => new Date().toISOString()),
});
