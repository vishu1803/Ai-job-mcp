/**
 * @file Extension AI Assistant Domain Schemas
 *
 * Formal contracts for AI assistant integration into the browser extension:
 * - Safe autofill with internal provenance tracking (source, confidence, evidence, requiresConfirmation)
 * - Strict zero-fabrication fallback ("Not available in your verified profile.")
 * - Sensitive/high-risk field confirmation gating
 * - Compact 5-dimension primary UI contracts
 * - Explain job, requirement comparison, error translation, and pre-submission conflicts
 */

import { z } from 'zod';

export const UNAVAILABLE_IN_VERIFIED_PROFILE_MESSAGE = 'Not available in your verified profile.';

export const AutofillSourceEnum = z.enum([
  'CANONICAL_PROFILE_IDENTITY',
  'CANONICAL_PROFILE_CONTACT',
  'CANONICAL_CAREER_PREFERENCES',
  'CANONICAL_PROFILE_CUSTOM',
  'CANONICAL_VERIFIED_SKILLS',
  'CANONICAL_FACT_INVENTORY',
  'NONE',
]);

/**
 * Sensitive or high-risk field types that strictly require explicit user confirmation.
 */
export const SENSITIVE_AUTOFILL_FIELDS = Object.freeze([
  'WORK_AUTHORIZATION',
  'VISA_SPONSORSHIP',
  'SALARY_EXPECTATION',
  'SALARY_FLOOR',
  'LEGAL_DECLARATION',
  'CRIMINAL_HISTORY',
  'EEO_STATUS',
  'EEO_RACE',
  'EEO_GENDER',
  'EEO_DISABILITY',
  'EEO_VETERAN',
  'SIGNATURE',
]);

/**
 * Single field autofill plan tracking full provenance and confirmation needs.
 */
export const AutofillFieldPlanSchema = z.object({
  fieldName: z.string(),
  fieldType: z.string(),
  label: z.string(),
  value: z.any().nullable(),
  source: AutofillSourceEnum,
  confidence: z.number().min(0).max(1),
  evidence: z.string(),
  requiresConfirmation: z.boolean(),
  isSensitive: z.boolean(),
  available: z.boolean(),
  unavailabilityReason: z.string().nullable().optional(),
});

/**
 * Aggregated safe autofill plan response.
 */
export const AutofillPlanResponseSchema = z.object({
  mappedFields: z.array(AutofillFieldPlanSchema),
  fillableCount: z.number(),
  sensitiveCount: z.number(),
  missingCount: z.number(),
  status: z.enum(['READY', 'NEEDS_CONFIRMATION', 'INCOMPLETE']),
});

/**
 * Extracted relevant job information.
 */
export const JobDetectionDetailsSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullable().optional(),
  workplace: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  salaryRange: z.string().nullable().optional(),
  experienceLevel: z.string().nullable().optional(),
  sponsorshipNotes: z.string().nullable().optional(),
  coreSkills: z.array(z.string()).default([]),
});

/**
 * Explaining current job page.
 */
export const ExplainJobResponseSchema = z.object({
  summary: z.string(),
  responsibilities: z.array(z.string()).default([]),
  keyExpectations: z.array(z.string()).default([]),
  detectedDetails: JobDetectionDetailsSchema.optional(),
  groundedInPage: z.boolean().default(true),
  aiAvailable: z.boolean().default(true),
});

/**
 * Explaining single requirement satisfaction with evidence citations.
 */
export const RequirementMatchExplanationSchema = z.object({
  requirement: z.string(),
  satisfied: z.boolean(),
  status: z.enum(['VERIFIED', 'MISSING', 'PARTIAL']),
  explanation: z.string(),
  evidence: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

/**
 * Full requirement comparison result.
 */
export const CompareRequirementsResponseSchema = z.object({
  totalRequirements: z.number(),
  satisfiedCount: z.number(),
  missingCount: z.number(),
  matches: z.array(RequirementMatchExplanationSchema),
  summary: z.string(),
});

/**
 * Application error explanation contract.
 */
export const ExplainErrorResponseSchema = z.object({
  humanSummary: z.string(),
  recoverySteps: z.array(z.string()).default([]),
  suggestedAction: z.string(),
  isRetryable: z.boolean().default(true),
  errorCategory: z.string().default('SUBMISSION_ERROR'),
});

/**
 * Primary compact UI payload contract (5 dimensions):
 * 1. Job match
 * 2. Application readiness
 * 3. Missing information
 * 4. Conflicts
 * 5. AI help
 */
export const CompactExtensionAssistantContextSchema = z.object({
  jobMatch: z.object({
    score: z.number(),
    band: z.string(),
    matchedSkills: z.array(z.string()).default([]),
    missingSkills: z.array(z.string()).default([]),
    summary: z.string(),
  }),
  applicationReadiness: z.object({
    readinessScore: z.number(),
    status: z.string(),
    profileComplete: z.boolean(),
    summary: z.string(),
  }),
  missingInformation: z
    .array(
      z.object({
        field: z.string(),
        label: z.string(),
        status: z.string(),
        notes: z.string(),
        profileAnchor: z.string().optional(),
      })
    )
    .default([]),
  conflicts: z
    .array(
      z.object({
        field: z.string(),
        fieldLabel: z.string(),
        profileValue: z.any(),
        applicationValue: z.any(),
        notes: z.string(),
        resolutionOptions: z.array(z.string()).default([]),
      })
    )
    .default([]),
  aiHelp: z.object({
    available: z.boolean(),
    overview: z.string(),
    quickActions: z.array(z.string()).default([]),
    errorGuidance: z.string().nullable().optional(),
    fallbackNotice: z.string().nullable().optional(),
  }),
  autofillPlan: AutofillPlanResponseSchema.optional(),
});
