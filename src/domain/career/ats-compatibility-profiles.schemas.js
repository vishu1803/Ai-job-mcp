/**
 * @file ATS Compatibility Profile Schemas (Phase 4 & 5)
 *
 * Implements observable compatibility profiles based on document parsing constraints:
 * - GENERIC_ATS
 * - WORKDAY_COMPATIBILITY
 * - GREENHOUSE_COMPATIBILITY
 * - LEVER_COMPATIBILITY
 * - ICIMS_COMPATIBILITY
 * - TALEO_COMPATIBILITY
 *
 * Evaluates observable risks (reading order, column risk, table risk, header/footer risk,
 * font/text extraction, special characters, section naming, duplicate content) without
 * claiming proprietary access to private vendor source code.
 */

import { z } from 'zod';
import { ConfidenceScoreSchema } from '../candidate/candidate.schemas.js';

export const ATS_PROFILE_SCHEMA_VERSION = '1.0.0';

export const AtsProfileIdEnum = z.enum([
  'GENERIC_ATS',
  'WORKDAY_COMPATIBILITY',
  'GREENHOUSE_COMPATIBILITY',
  'LEVER_COMPATIBILITY',
  'ICIMS_COMPATIBILITY',
  'TALEO_COMPATIBILITY',
]);

export const AtsRiskSeverityEnum = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);

export const CompatibilityTierEnum = z.enum([
  'OPTIMAL', // 85-100: Flawless parsing expected
  'COMPATIBLE', // 70-84: Minor non-critical warnings
  'MODERATE_RISK', // 50-69: Potential field extraction drops or ordering glitches
  'HIGH_RISK', // 0-49: Severe structural obstacles (tables, multi-column, missing headers)
]);

export const AtsRiskItemSchema = z
  .object({
    code: z.string().trim().min(1),
    severity: AtsRiskSeverityEnum,
    dimension: z.string().trim().min(1),
    description: z.string().trim().min(1),
    impact: z.string().trim().min(1),
    remediation: z.string().trim().min(1),
  })
  .strict();

export const FieldConfidenceSchema = z
  .object({
    candidateName: ConfidenceScoreSchema,
    contactInfo: ConfidenceScoreSchema,
    location: ConfidenceScoreSchema,
    jobTitles: ConfidenceScoreSchema,
    companies: ConfidenceScoreSchema,
    employmentDates: ConfidenceScoreSchema,
    workHistory: ConfidenceScoreSchema,
    skills: ConfidenceScoreSchema,
    education: ConfidenceScoreSchema,
    projects: ConfidenceScoreSchema,
    overallExtraction: ConfidenceScoreSchema,
  })
  .strict();

export const AtsSimulatedExtractionSchema = z
  .object({
    candidateName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    currentJobTitle: z.string().nullable().optional(),
    currentCompany: z.string().nullable().optional(),
    totalExperienceYears: z.number().nullable().optional(),
    rolesExtractedCount: z.number().int().nonnegative().default(0),
    skillsExtractedCount: z.number().int().nonnegative().default(0),
    educationInstitutionsCount: z.number().int().nonnegative().default(0),
    topSkills: z.array(z.string()).default([]),
  })
  .strict();

export const AtsProfileEvaluationSchema = z
  .object({
    profile: AtsProfileIdEnum,
    profileName: z.string().min(1),
    score: z.number().min(0).max(100),
    confidence: ConfidenceScoreSchema,
    compatibilityTier: CompatibilityTierEnum,
    risks: z.array(AtsRiskItemSchema).default([]),
    extraction: AtsSimulatedExtractionSchema,
    fieldConfidence: FieldConfidenceSchema,
    constraintsEvaluated: z.array(z.string()).default([]),
    remediationGuidance: z.array(z.string()).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// Phase 5: ATS Extraction Simulation Report Schemas
// ---------------------------------------------------------------------------

export const ExtractionFieldStatusEnum = z.enum([
  'EXTRACTED',
  'PARTIALLY_EXTRACTED',
  'AMBIGUOUS',
  'FAILED',
]);

export const ExtractionFieldReportItemSchema = z
  .object({
    fieldName: z.string().trim().min(1),
    status: ExtractionFieldStatusEnum,
    extractedValue: z.any().optional(),
    confidence: ConfidenceScoreSchema,
    ambiguityReason: z.string().nullable().optional(),
    rawSnippet: z.string().nullable().optional(),
  })
  .strict();

export const AtsExtractionReportSchema = z
  .object({
    reportVersion: z.string().default('1.0.0'),
    overallConfidence: ConfidenceScoreSchema,
    fieldsExtractedCount: z.number().int().nonnegative(),
    fieldsPartialCount: z.number().int().nonnegative(),
    fieldsAmbiguousCount: z.number().int().nonnegative(),
    fieldsFailedCount: z.number().int().nonnegative(),
    fields: z.array(ExtractionFieldReportItemSchema),
    ambiguousEntities: z.array(
      z.object({
        entityType: z.string(),
        rawText: z.string(),
        possibleInterpretations: z.array(z.string()),
        warning: z.string(),
      })
    ).default([]),
    summary: z.string(),
  })
  .strict();
