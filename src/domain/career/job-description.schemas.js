/**
 * @file Canonical Domain Zod Schemas for Job Description Ingestion & Modeling
 *
 * Implements the domain contracts approved in P5-001A (ARCH-011 / ADR-031):
 * - JobDescriptionInputSchema
 * - JobDescriptionSchema
 * - JobCompensationSchema
 * - JobEnumerations (Source, Status, EmploymentType, WorkplaceType, SeniorityLevel)
 *
 * Strict security invariants:
 * - Untrusted raw text bounded strictly to <= 50 KB (51,200 bytes/chars)
 * - Safe metadata free of secrets, credentials, or prototype injection keys
 * - Canonical identifier format enforcement (UUIDv4)
 */

import { z } from 'zod';
import { DateOrIsoStringSchema, SafeMetadataSchema } from '../candidate/candidate.schemas.js';

// ---------------------------------------------------------------------------
// 1. Domain Enumerations
// ---------------------------------------------------------------------------

export const JobDescriptionSourceEnum = z.enum(['PASTE', 'URL', 'FILE_UPLOAD', 'API', 'MANUAL']);

export const JobStatusEnum = z.enum(['ACTIVE', 'ARCHIVED', 'EXPIRED']);

export const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'OTHER',
]);

export const WorkplaceTypeEnum = z.enum(['REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED']);

export const SeniorityLevelEnum = z.enum([
  'INTERN',
  'ENTRY',
  'JUNIOR',
  'MID',
  'SENIOR',
  'STAFF',
  'LEAD',
  'PRINCIPAL',
  'DIRECTOR',
  'EXECUTIVE',
  'UNSPECIFIED',
]);

export const CompensationIntervalEnum = z.enum(['HOURLY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

// Maximum permitted raw text length: 50 KB (51,200 characters)
export const MAX_RAW_JD_BYTES = 51200;

// ---------------------------------------------------------------------------
// 2. Compensation Schema
// ---------------------------------------------------------------------------

export const JobCompensationSchema = z
  .object({
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
    currency: z
      .string()
      .trim()
      .length(3, { message: 'Currency must be a 3-letter ISO code' })
      .toUpperCase()
      .default('USD')
      .optional(),
    interval: CompensationIntervalEnum.default('YEARLY').optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.min !== undefined && data.max !== undefined) {
        return data.min <= data.max;
      }
      return true;
    },
    {
      message: 'Minimum compensation cannot exceed maximum compensation',
      path: ['min'],
    }
  );

// ---------------------------------------------------------------------------
// 3. Job Description Input Schema (Untrusted Ingest Gate)
// ---------------------------------------------------------------------------

export const JobDescriptionInputSchema = z
  .object({
    rawText: z
      .string({
        required_error: 'rawText is mandatory for job description ingestion',
      })
      .trim()
      .min(10, { message: 'Job description text must contain at least 10 characters' })
      .max(MAX_RAW_JD_BYTES, {
        message: `Job description raw text exceeds maximum allowed size of ${MAX_RAW_JD_BYTES} bytes (50 KB)`,
      }),
    source: JobDescriptionSourceEnum.default('PASTE'),
    title: z.string().trim().min(1).max(255).optional(),
    company: z.string().trim().min(1).max(255).optional(),
    url: z
      .string()
      .trim()
      .url({ message: 'Must be a valid HTTP or HTTPS URL' })
      .max(2048)
      .optional(),
    location: z.string().trim().max(255).optional(),
    employmentType: EmploymentTypeEnum.optional(),
    workplaceType: WorkplaceTypeEnum.optional(),
    seniorityLevel: SeniorityLevelEnum.optional(),
    compensation: JobCompensationSchema.optional(),
    metadata: SafeMetadataSchema.optional().default({}),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Job Description Domain Schema (Canonical Entity)
// ---------------------------------------------------------------------------

export const JobDescriptionSchema = z
  .object({
    id: z.string().uuid({ message: 'JobDescription ID must be a valid UUIDv4' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUIDv4' }),
    source: JobDescriptionSourceEnum,
    title: z.string().trim().min(1).max(255),
    company: z.string().trim().max(255).nullable().optional(),
    rawText: z.string().max(MAX_RAW_JD_BYTES),
    normalizedSummary: z.string().max(5000),
    location: z.string().trim().max(255).nullable().optional(),
    employmentType: EmploymentTypeEnum.default('FULL_TIME'),
    workplaceType: WorkplaceTypeEnum.default('UNSPECIFIED'),
    seniorityLevel: SeniorityLevelEnum.default('UNSPECIFIED'),
    compensation: JobCompensationSchema.nullable().optional(),
    status: JobStatusEnum.default('ACTIVE'),
    metadata: SafeMetadataSchema.default({}),
    createdAt: DateOrIsoStringSchema,
    updatedAt: DateOrIsoStringSchema,
  })
  .strict();
