/**
 * @file Canonical Domain Zod Schemas for Job Requirements & Classification Results
 *
 * Implements the domain contracts approved in P5-001A (ARCH-011 / ADR-031):
 * - RequirementCategoryEnum & RequirementImportanceEnum
 * - JobRequirementSourceSpanSchema
 * - Specialized Category Schemas (Skill, Experience, Education, Location, Domain, Generic)
 * - Canonical JobRequirementSchema
 * - JobClassificationResultSchema
 */

import { z } from 'zod';
import {
  SkillCategoryEnum,
  ConfidenceScoreSchema,
  SafeSlugSchema,
  DateOrIsoStringSchema,
} from '../candidate/candidate.schemas.js';
import { JobDescriptionSchema, WorkplaceTypeEnum } from './job-description.schemas.js';

// ---------------------------------------------------------------------------
// 1. Requirement Enumerations
// ---------------------------------------------------------------------------

export const RequirementCategoryEnum = z.enum([
  'SKILL',
  'EXPERIENCE',
  'EDUCATION',
  'DOMAIN',
  'LOCATION',
  'ELIGIBILITY',
  'CERTIFICATION',
  'OTHER',
]);

export const RequirementImportanceEnum = z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']);

// ---------------------------------------------------------------------------
// 1b. Canonical Bounded-Text Helper (requirement producer contract)
// ---------------------------------------------------------------------------

/**
 * Maximum persisted length for bounded requirement text fields.
 * Must stay in sync with the max(500) constraints on
 * JobRequirementSchema.rawSnippet / originalText and
 * JobRequirementSourceSpanSchema.snippet below.
 */
export const REQUIREMENT_TEXT_MAX = 500;

/**
 * Canonical bounder for JobRequirement text fields (rawSnippet, originalText,
 * sourceSpan.snippet). Guarantees the producer-side contract enforced by
 * JobRequirementSchema so that no producer can ever emit text longer than the
 * schema permits (which would fail validation and 503 the analyze_job_fit /
 * portfolio recommendation flows).
 *
 * Semantics:
 * - Trims surrounding whitespace (mirrors the schema's `.trim()`).
 * - Hard-caps at `max` characters, measured in UTF-8 bytes so multi-byte
 *   content (emoji, non-ASCII) can never exceed the persisted limit.
 * - Never splits inside a UTF-8 multi-byte sequence: the cap is pulled back
 *   to the nearest code-point boundary before slicing.
 * - Deterministic: identical input always yields identical output.
 *
 * @param {string} text - Full source text (never fabricated, only bounded).
 * @param {number} [max=REQUIREMENT_TEXT_MAX] - Upper bound (schema contract).
 * @returns {string} Trimmed, byte-bounded text safe for the schema contract.
 */
export function boundRequirementText(text, max = REQUIREMENT_TEXT_MAX) {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (Buffer.byteLength(trimmed, 'utf8') <= max) return trimmed;

  // Pull the cut index back so the byte footprint fits within `max` without
  // splitting a multi-byte UTF-8 sequence mid-way.
  let end = trimmed.length;
  while (end > 0 && Buffer.byteLength(trimmed.slice(0, end), 'utf8') > max) {
    end -= 1;
  }
  return trimmed.slice(0, end);
}

export const EducationDegreeLevelEnum = z.enum([
  'HIGH_SCHOOL',
  'ASSOCIATE',
  'BACHELOR',
  'MASTER',
  'DOCTORATE',
  'ANY',
]);

// ---------------------------------------------------------------------------
// 2. Source Span Schema
// ---------------------------------------------------------------------------

export const JobRequirementSourceSpanSchema = z
  .object({
    section: z.string().trim().min(1).max(100),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    snippet: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (data) => {
      if (data.startOffset !== undefined && data.endOffset !== undefined) {
        return data.startOffset <= data.endOffset;
      }
      return true;
    },
    {
      message: 'startOffset cannot exceed endOffset',
      path: ['startOffset'],
    }
  );

// ---------------------------------------------------------------------------
// 3. Specialized Requirement Payload Schemas
// ---------------------------------------------------------------------------

export const JobSkillRequirementCriteriaSchema = z
  .object({
    skillSlug: SafeSlugSchema,
    skillName: z.string().trim().min(1).max(100),
    skillCategory: SkillCategoryEnum.default('TOOL'),
    minYears: z.number().nonnegative().optional(),
    context: z.string().trim().max(255).optional(),
  })
  .strict();

export const JobExperienceRequirementCriteriaSchema = z
  .object({
    minYears: z.number().nonnegative().optional(),
    maxYears: z.number().nonnegative().optional(),
    target: z.string().trim().max(100).optional(),
    associatedSkillSlug: SafeSlugSchema.optional(),
    experienceType: z.string().trim().max(100).optional(),
    technology: z.string().trim().max(100).optional(),
    experienceConstraint: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minYears !== undefined && data.maxYears !== undefined) {
        return data.minYears <= data.maxYears;
      }
      return true;
    },
    {
      message: 'minYears cannot exceed maxYears',
      path: ['minYears'],
    }
  );

export const JobEducationRequirementCriteriaSchema = z
  .object({
    degreeLevel: EducationDegreeLevelEnum.default('BACHELOR'),
    field: z.string().trim().max(150).optional(),
  })
  .strict();

export const JobLocationRequirementCriteriaSchema = z
  .object({
    country: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    region: z.string().trim().max(100).optional(),
    workplaceType: WorkplaceTypeEnum.default('UNSPECIFIED'),
  })
  .strict();

export const JobDomainRequirementCriteriaSchema = z
  .object({
    domainSlug: SafeSlugSchema,
    domainName: z.string().trim().min(1).max(100),
  })
  .strict();

export const JobEligibilityRequirementCriteriaSchema = z
  .object({
    eligibilityType: z.string().trim().max(100).optional(),
    acceptedCountries: z.array(z.string().trim().max(100)).optional(),
    requiresSponsorship: z.boolean().optional(),
    context: z.string().trim().max(255).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Canonical Job Requirement Schema
// ---------------------------------------------------------------------------

export const JobRequirementSchema = z
  .object({
    id: z.string().uuid({ message: 'Requirement ID must be a valid UUIDv4' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUIDv4' }),
    jobDescriptionId: z.string().uuid({ message: 'JobDescription ID must be a valid UUIDv4' }),
    category: RequirementCategoryEnum,
    importance: RequirementImportanceEnum,
    weight: z
      .number()
      .min(0.1, { message: 'Weight must be at least 0.1' })
      .max(1.0, { message: 'Weight must not exceed 1.0' })
      .default(1.0),
    skillSlug: SafeSlugSchema.nullable().optional(),
    rawSnippet: z.string().trim().max(500),
    originalText: z.string().trim().max(500).optional(),
    extractedValue: z.string().trim().min(1).max(255),
    normalizedCriteria: z
      .union([
        JobSkillRequirementCriteriaSchema,
        JobExperienceRequirementCriteriaSchema,
        JobEducationRequirementCriteriaSchema,
        JobLocationRequirementCriteriaSchema,
        JobDomainRequirementCriteriaSchema,
        JobEligibilityRequirementCriteriaSchema,
        z.record(z.unknown()),
      ])
      .default({}),
    confidenceScore: ConfidenceScoreSchema.default(0.9),
    sourceSpan: JobRequirementSourceSpanSchema,
    createdAt: DateOrIsoStringSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Job Section Schema
// ---------------------------------------------------------------------------

export const JobSectionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    heading: z.string().trim().max(255),
    rawText: z.string().max(51200),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Classification & Extraction Result Schema
// ---------------------------------------------------------------------------

export const JobExtractionStatsSchema = z
  .object({
    totalRequirements: z.number().int().nonnegative(),
    requiredCount: z.number().int().nonnegative(),
    preferredCount: z.number().int().nonnegative(),
    optionalCount: z.number().int().nonnegative(),
    skillCount: z.number().int().nonnegative(),
    experienceCount: z.number().int().nonnegative(),
    educationCount: z.number().int().nonnegative(),
    domainCount: z.number().int().nonnegative(),
    locationCount: z.number().int().nonnegative(),
    eligibilityCount: z.number().int().nonnegative().optional(),
  })
  .strict();

export const JobExtractionMetadataSchema = z
  .object({
    mode: z.enum(['DETERMINISTIC', 'LLM_ASSISTED']),
    extractionDurationMs: z.number().nonnegative(),
    parserVersion: z.string().trim().default('1.0.0'),
  })
  .strict();

export const JobClassificationResultSchema = z
  .object({
    jobDescription: JobDescriptionSchema,
    requirements: z.array(JobRequirementSchema),
    sections: z.array(JobSectionSchema),
    stats: JobExtractionStatsSchema,
    extractionMetadata: JobExtractionMetadataSchema,
  })
  .strict();
