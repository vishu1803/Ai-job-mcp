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
  'CERTIFICATION',
  'OTHER',
]);

export const RequirementImportanceEnum = z.enum(['REQUIRED', 'PREFERRED', 'OPTIONAL']);

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
    minYears: z.number().nonnegative(),
    maxYears: z.number().nonnegative().optional(),
    target: z.string().trim().max(100).optional(),
    associatedSkillSlug: SafeSlugSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.maxYears !== undefined) {
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
    extractedValue: z.string().trim().min(1).max(255),
    normalizedCriteria: z
      .union([
        JobSkillRequirementCriteriaSchema,
        JobExperienceRequirementCriteriaSchema,
        JobEducationRequirementCriteriaSchema,
        JobLocationRequirementCriteriaSchema,
        JobDomainRequirementCriteriaSchema,
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
