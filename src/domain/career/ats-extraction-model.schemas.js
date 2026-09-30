/**
 * @file ATS Extraction Model Domain Schemas (Priority 1)
 *
 * Implements the canonical industry ATS extraction contract.
 * Every extracted field adheres strictly to the envelope:
 * {
 *   "value": "...",
 *   "confidence": 0.97,
 *   "source": {
 *     "page": 1,
 *     "section": "experience",
 *     "textRange": "lines 14-22"
 *   }
 * }
 */

import { z } from 'zod';
import { ConfidenceScoreSchema } from '../candidate/candidate.schemas.js';

export const ATS_EXTRACTION_MODEL_VERSION = '1.0.0';

/**
 * Universal source provenance for an extracted field.
 */
export const AtsFieldSourceSchema = z
  .object({
    page: z.number().int().positive().default(1),
    section: z.string().trim().min(1),
    textRange: z.string().trim().optional(),
  })
  .strict();

/**
 * Creates an ATS extracted field schema for any inner value type.
 *
 * @param {z.ZodTypeAny} valueSchema
 */
export function createAtsExtractedFieldSchema(valueSchema) {
  return z
    .object({
      value: valueSchema,
      confidence: ConfidenceScoreSchema,
      source: AtsFieldSourceSchema,
    })
    .strict();
}

// ---------------------------------------------------------------------------
// Extracted Field Types
// ---------------------------------------------------------------------------

export const AtsExtractedStringFieldSchema = createAtsExtractedFieldSchema(
  z.string().nullable().optional()
);

export const AtsExtractedNumberFieldSchema = createAtsExtractedFieldSchema(
  z.number().nullable().optional()
);

export const AtsExtractedBooleanFieldSchema = createAtsExtractedFieldSchema(
  z.boolean().default(false)
);

// ---------------------------------------------------------------------------
// 1. Identity, Contact, Location & Authorization
// ---------------------------------------------------------------------------

export const AtsExtractedContactSchema = z
  .object({
    email: AtsExtractedStringFieldSchema,
    phone: AtsExtractedStringFieldSchema,
    address: AtsExtractedStringFieldSchema,
    city: AtsExtractedStringFieldSchema,
    state: AtsExtractedStringFieldSchema,
    country: AtsExtractedStringFieldSchema,
    postalCode: AtsExtractedStringFieldSchema,
  })
  .strict();

export const AtsExtractedLinksSchema = z
  .object({
    github: AtsExtractedStringFieldSchema,
    linkedin: AtsExtractedStringFieldSchema,
    portfolio: AtsExtractedStringFieldSchema,
    website: AtsExtractedStringFieldSchema,
    other: z
      .array(
        z.object({
          label: z.string().trim(),
          field: AtsExtractedStringFieldSchema,
        })
      )
      .default([]),
  })
  .strict();

export const AtsExtractedIdentitySchema = z
  .object({
    name: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    headline: AtsExtractedStringFieldSchema,
    location: AtsExtractedStringFieldSchema,
    workAuthorization: AtsExtractedStringFieldSchema,
    contact: AtsExtractedContactSchema,
    links: AtsExtractedLinksSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 2. Summary
// ---------------------------------------------------------------------------

export const AtsExtractedSummarySchema = z
  .object({
    text: AtsExtractedStringFieldSchema,
    yearsOfExperience: AtsExtractedNumberFieldSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Technical & Professional Skills
// ---------------------------------------------------------------------------

export const AtsExtractedSkillItemSchema = z
  .object({
    name: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    category: createAtsExtractedFieldSchema(
      z
        .enum([
          'LANGUAGE',
          'FRAMEWORK',
          'DATABASE',
          'CLOUD_DEVOPS',
          'TOOL',
          'ARCHITECTURE',
          'CONCEPT',
          'OTHER',
        ])
        .default('OTHER')
    ),
    yearsOfExperience: AtsExtractedNumberFieldSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Employment History & Roles
// ---------------------------------------------------------------------------

export const AtsExtractedEmploymentEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    jobTitle: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    employer: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    location: AtsExtractedStringFieldSchema,
    dates: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    startDate: AtsExtractedStringFieldSchema,
    endDate: AtsExtractedStringFieldSchema,
    isCurrent: AtsExtractedBooleanFieldSchema,
    tenureMonths: AtsExtractedNumberFieldSchema,
    responsibilities: createAtsExtractedFieldSchema(z.array(z.string().trim()).default([])),
    technologies: z.array(createAtsExtractedFieldSchema(z.string().trim().min(1))).default([]),
    bullets: createAtsExtractedFieldSchema(z.array(z.string().trim()).default([])),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Education
// ---------------------------------------------------------------------------

export const AtsExtractedEducationEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    institution: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    degree: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    fieldOfStudy: AtsExtractedStringFieldSchema,
    dates: AtsExtractedStringFieldSchema,
    graduationYear: AtsExtractedNumberFieldSchema,
    gpa: AtsExtractedStringFieldSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Certifications
// ---------------------------------------------------------------------------

export const AtsExtractedCertificationEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    name: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    issuingOrganization: AtsExtractedStringFieldSchema,
    issueDate: AtsExtractedStringFieldSchema,
    credentialId: AtsExtractedStringFieldSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// 7. Projects
// ---------------------------------------------------------------------------

export const AtsExtractedProjectEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    name: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    description: AtsExtractedStringFieldSchema,
    role: AtsExtractedStringFieldSchema,
    technologies: z.array(createAtsExtractedFieldSchema(z.string().trim().min(1))).default([]),
    url: AtsExtractedStringFieldSchema,
    githubUrl: AtsExtractedStringFieldSchema,
    bullets: createAtsExtractedFieldSchema(z.array(z.string().trim()).default([])),
  })
  .strict();

// ---------------------------------------------------------------------------
// 8. Achievements
// ---------------------------------------------------------------------------

export const AtsExtractedAchievementSchema = z
  .object({
    id: z.string().trim().min(1),
    title: createAtsExtractedFieldSchema(z.string().trim().min(1)),
    description: AtsExtractedStringFieldSchema,
    date: AtsExtractedStringFieldSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Top-Level Canonical ATS Extraction Model Schema
// ---------------------------------------------------------------------------

export const AtsExtractionModelSchema = z
  .object({
    extractionModelVersion: z.string().default(ATS_EXTRACTION_MODEL_VERSION),
    extractedAt: z.string().datetime(),
    overallConfidence: ConfidenceScoreSchema,
    identity: AtsExtractedIdentitySchema,
    summary: AtsExtractedSummarySchema,
    skills: z.array(AtsExtractedSkillItemSchema).default([]),
    employment: z.array(AtsExtractedEmploymentEntrySchema).default([]),
    education: z.array(AtsExtractedEducationEntrySchema).default([]),
    certifications: z.array(AtsExtractedCertificationEntrySchema).default([]),
    projects: z.array(AtsExtractedProjectEntrySchema).default([]),
    achievements: z.array(AtsExtractedAchievementSchema).default([]),
  })
  .strict();
