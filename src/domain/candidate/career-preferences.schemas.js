/**
 * @file Canonical Domain Zod Schemas for Candidate Career Preferences & Intent (P14-004C / ARCH-056).
 *
 * Models persistent user career preferences and search intent:
 * 1. Target roles & seniority expectations
 * 2. Preferred locations & remote work policies
 * 3. Compensation floors and currency
 * 4. Technology stack and industry preferences
 * 5. Explicit, user-provided eligibility & work authorization (never inferred)
 */

import { z } from 'zod';
import { SafeMetadataSchema, DateOrIsoStringSchema } from './candidate.schemas.js';

export const RemotePreferenceEnum = z.enum([
  'REMOTE_ONLY',
  'REMOTE_FIRST',
  'HYBRID',
  'ON_SITE',
  'FLEXIBLE',
]);

export const EmploymentTypeEnum = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']);

export const SeniorityLevelEnum = z.enum([
  'INTERN',
  'ENTRY_LEVEL',
  'JUNIOR',
  'MID',
  'MID_LEVEL',
  'SENIOR',
  'STAFF',
  'PRINCIPAL',
  'LEAD',
  'UNKNOWN',
]);

export const CareerStatusEnum = z.enum([
  'EMPLOYED',
  'UNEMPLOYED',
  'STUDENT',
  'FRESHER',
  'FREELANCE',
  'CONTRACTOR',
  'UNKNOWN',
]);

export const CertificationItemSchema = z.union([
  z.string(),
  z.object({
    name: z.string().min(1),
    issuer: z.string().optional().nullable(),
    issueDate: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    credentialId: z.string().optional().nullable(),
    credentialUrl: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    provenanceStatus: z
      .enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED'])
      .optional()
      .default('USER_PROVIDED'),
  }),
]);

export const LanguageItemSchema = z.union([
  z.string(),
  z.object({
    language: z.string().min(1),
    proficiency: z
      .enum(['NATIVE', 'FLUENT', 'PROFESSIONAL', 'INTERMEDIATE', 'BASIC'])
      .optional()
      .default('PROFESSIONAL'),
    provenanceStatus: z
      .enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED'])
      .optional()
      .default('USER_PROVIDED'),
  }),
]);

export const CurrentEmploymentSchema = z
  .object({
    title: z.string().min(1).max(255),
    company: z.string().min(1).max(255),
    employmentType: z.string().max(100),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    isCurrent: z.boolean().optional().default(true),
  })
  .nullable();

export const ExperienceDurationSchema = z.object({
  totalMonths: z.number().int().nonnegative(),
  totalYears: z.number().nonnegative(),
  professionalMonths: z.number().int().nonnegative(),
  professionalYears: z.number().nonnegative(),
  softwareEngineeringMonths: z.number().int().nonnegative().optional(),
  softwareEngineeringYears: z.number().nonnegative().optional(),
});

export const RelocationPreferenceEnum = z.enum([
  'WILLING_TO_RELOCATE',
  'NOT_WILLING',
  'REMOTE_ONLY',
]);

/**
 * Career Job Preferences Schema (User Intent Model).
 */
export const CareerPreferencesSchema = z.strictObject({
  targetRoles: z.array(z.string().min(1).max(100)).default([]),
  preferredLocations: z.array(z.string().min(1).max(100)).default([]),
  remotePreference: RemotePreferenceEnum.default('FLEXIBLE'),
  employmentTypes: z.array(EmploymentTypeEnum).default(['FULL_TIME']),
  salaryFloor: z.number().nonnegative().optional().nullable().default(null),
  salaryCurrency: z.string().length(3).default('USD'),
  industries: z.array(z.string().min(1).max(100)).default([]),
  companiesToAvoid: z.array(z.string().min(1).max(100)).default([]),
  companiesToPrioritize: z.array(z.string().min(1).max(100)).default([]),
  preferredTechStack: z.array(z.string().min(1).max(100)).default([]),
  workAuthorization: z.array(z.string().min(1).max(100)).default([]),
  visaSponsorshipRequired: z.boolean().default(false),
  availabilityDate: z.string().max(100).optional().nullable().default(null),
  relocationPreference: RelocationPreferenceEnum.default('REMOTE_ONLY'),
  lastUpdated: DateOrIsoStringSchema.optional().nullable().default(null),
  metadata: SafeMetadataSchema.default({}),
});

/**
 * Update Career Preferences Input Schema.
 */
export const UpdateCareerPreferencesInputSchema = z.strictObject({
  targetRoles: z.array(z.string().min(1).max(100)).optional(),
  preferredLocations: z.array(z.string().min(1).max(100)).optional(),
  remotePreference: RemotePreferenceEnum.optional(),
  employmentTypes: z.array(EmploymentTypeEnum).optional(),
  salaryFloor: z.number().nonnegative().optional().nullable(),
  salaryCurrency: z.string().length(3).optional(),
  industries: z.array(z.string().min(1).max(100)).optional(),
  companiesToAvoid: z.array(z.string().min(1).max(100)).optional(),
  companiesToPrioritize: z.array(z.string().min(1).max(100)).optional(),
  preferredTechStack: z.array(z.string().min(1).max(100)).optional(),
  workAuthorization: z.array(z.string().min(1).max(100)).optional(),
  visaSponsorshipRequired: z.boolean().optional(),
  availabilityDate: z.string().max(100).optional().nullable(),
  relocationPreference: RelocationPreferenceEnum.optional(),
});

/**
 * Profile Completeness & Readiness Schema (Job Search Intent Model).
 */
export const ProfileCompletenessSchema = z.strictObject({
  score: z.number().min(0).max(100),
  status: z.string(),
  isReadyForJobSearch: z.boolean(),
  missingRequiredForSearch: z.array(z.string()).default([]),
  missingOptional: z.array(z.string()).default([]),
  actionableFeedback: z.string(),
});

/**
 * Career Profile Readiness Schema (Candidate Truth & Graph Model).
 */
export const ProfileReadinessSchema = z.strictObject({
  score: z.number().min(0).max(100),
  status: z.string(),
  isComplete: z.boolean(),
  missingFields: z.array(z.string()).default([]),
  actionableFeedback: z.string(),
  provenance: z.record(z.string(), z.string()).optional(),
});

/**
 * Candidate Career Profile View Schema.
 */
export const CandidateCareerProfileSchema = z.strictObject({
  candidateId: z.string().uuid(),
  tenantId: z.string().uuid(),
  displayName: z.string().min(1).max(255),
  headline: z.string().max(500).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  currentRole: z.string().max(255).optional().nullable(),
  currentEmployment: CurrentEmploymentSchema.optional().nullable(),
  careerStatus: CareerStatusEnum.optional().default('UNKNOWN'),
  experienceDuration: ExperienceDurationSchema.optional(),
  location: z.string().max(255).optional().nullable(),
  seniority: SeniorityLevelEnum.optional().nullable(),
  yearsOfExperience: z.number().nonnegative().optional().nullable(),
  canonicalEmail: z.string().email().optional().nullable(),
  portfolioLinks: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        url: z.string().url(),
      })
    )
    .default([]),
  jobPreferences: CareerPreferencesSchema,
  verifiedSkillsSummary: z.array(z.string()).default([]),
  topSkills: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        category: z.string().optional(),
        fineCategory: z.string().optional(),
        tier: z.enum(['PRIMARY', 'SIGNAL']).optional().default('PRIMARY'),
        confidenceScore: z.number().min(0).max(1).optional(),
        evidenceCount: z.number().int().nonnegative().optional(),
        evidenceLevel: z.number().int().min(0).max(4).optional(),
        evidenceExplanation: z.string().optional(),
        provenanceStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        resumeClaim: z.boolean().optional().default(false),
        githubEvidence: z.boolean().optional().default(false),
        truthStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        source: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  primarySkills: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        category: z.string().optional(),
        fineCategory: z.string().optional(),
        tier: z.enum(['PRIMARY', 'SIGNAL']).optional().default('PRIMARY'),
        confidenceScore: z.number().min(0).max(1).optional(),
        evidenceCount: z.number().int().nonnegative().optional(),
        evidenceLevel: z.number().int().min(0).max(4).optional(),
        evidenceExplanation: z.string().optional(),
        provenanceStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        resumeClaim: z.boolean().optional().default(false),
        githubEvidence: z.boolean().optional().default(false),
        truthStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        source: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  technologySignals: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string(),
        category: z.string().optional(),
        fineCategory: z.string().optional(),
        tier: z.enum(['PRIMARY', 'SIGNAL']).optional().default('SIGNAL'),
        confidenceScore: z.number().min(0).max(1).optional(),
        evidenceCount: z.number().int().nonnegative().optional(),
        evidenceLevel: z.number().int().min(0).max(4).optional(),
        evidenceExplanation: z.string().optional(),
        provenanceStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        resumeClaim: z.boolean().optional().default(false),
        githubEvidence: z.boolean().optional().default(false),
        truthStatus: z
          .enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING', 'CORROBORATED', 'USER_PROVIDED'])
          .optional(),
        source: z.string().optional(),
      })
    )
    .optional()
    .default([]),
  highlightedProjects: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string(),
        headline: z.string().nullable().optional(),
        role: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        technologies: z.array(z.string()).optional().default([]),
        bullets: z.array(z.string()).optional().default([]),
        urls: z.array(z.string()).optional().default([]),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        linkedResourceCount: z.number().int().nonnegative().optional(),
        verifiedSignalCount: z.number().int().nonnegative().optional(),
        provenanceStatus: z
          .enum(['VERIFIED', 'CORROBORATED', 'CLAIMED', 'UNVERIFIED', 'USER_PROVIDED'])
          .optional()
          .default('CLAIMED'),
      })
    )
    .optional()
    .default([]),
  recentExperience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        employmentType: z.string().optional().default('FULL_TIME'),
        location: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        isCurrent: z.boolean().optional().default(false),
        rawDateRange: z.string().nullable().optional(),
        bullets: z.array(z.string()).optional().default([]),
        technologies: z.array(z.string()).optional().default([]),
        verifiedSkillsUsed: z.array(z.string()).optional().default([]),
        provenanceStatus: z
          .enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED', 'CORROBORATED'])
          .optional()
          .default('CLAIMED'),
      })
    )
    .optional()
    .default([]),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().optional().nullable(),
        fieldOfStudy: z.string().optional().nullable(),
        degreeType: z
          .enum([
            'BACHELOR',
            'MASTER',
            'DOCTORATE',
            'ASSOCIATE',
            'DIPLOMA',
            'BOOTCAMP',
            'COURSEWORK',
            'OTHER',
          ])
          .optional()
          .default('OTHER'),
        location: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        isCurrent: z.boolean().optional().default(false),
        rawDateRange: z.string().nullable().optional(),
        coursework: z.array(z.string()).optional().default([]),
        gradeOrGpa: z.string().nullable().optional(),
        rawText: z.string().optional(),
        provenanceStatus: z
          .enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED'])
          .optional()
          .default('CLAIMED'),
      })
    )
    .optional()
    .default([]),
  certifications: z.array(CertificationItemSchema).optional().default([]),
  languages: z.array(LanguageItemSchema).optional().default([]),
  completeness: ProfileCompletenessSchema.optional(),
  profileReadiness: ProfileReadinessSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional().nullable(),
});
