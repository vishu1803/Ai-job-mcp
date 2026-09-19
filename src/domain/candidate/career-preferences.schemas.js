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
  'UNKNOWN',
  'NOT_SET',
]);

export const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'OTHER',
]);

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

export const NoticePeriodEnum = z.enum([
  'IMMEDIATE',
  'LESS_THAN_1_WEEK',
  '1_TO_2_WEEKS',
  '30_DAYS',
  '60_DAYS',
  '90_DAYS',
  'CUSTOM',
  'NOT_SET',
  'UNKNOWN',
]);

export const CompensationPeriodEnum = z.enum([
  'YEARLY',
  'MONTHLY',
  'HOURLY',
  'WEEKLY',
  'NOT_SET',
  'UNKNOWN',
]);

export const CompensationTypeEnum = z.enum([
  'BASE_ONLY',
  'TOTAL_COMP',
  'BASE_PLUS_BONUS',
  'NOT_SET',
  'UNKNOWN',
]);

export const WorkAuthStatusEnum = z.enum([
  'CITIZEN',
  'PERMANENT_RESIDENT',
  'AUTHORIZED',
  'REQUIRES_SPONSORSHIP',
  'STUDENT_VISA_OPT_CPT',
  'WORK_VISA',
  'NOT_AUTHORIZED',
  'UNKNOWN',
  'NOT_SET',
]);

export const WorkAuthorizationRecordSchema = z.strictObject({
  country: z.string().min(1).max(100),
  status: WorkAuthStatusEnum.default('AUTHORIZED'),
  sponsorshipRequired: z
    .union([z.boolean(), z.enum(['YES', 'NO', 'UNKNOWN', 'NOT_SET'])])
    .nullable()
    .optional(),
  visaType: z.string().max(100).optional().nullable(),
  expiryDate: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const WorkAuthorizationItemSchema = z.union([
  z.string().min(1).max(100),
  WorkAuthorizationRecordSchema,
]);

/**
 * Normalizes user or application notice period input to standard NoticePeriodEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeNoticePeriod(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(immediate|immediately|now|asap|none)$/i.test(s)) return 'IMMEDIATE';
  if (/^(less than 1 week|< 1 week|<1 week|under a week|less_than_1_week)$/i.test(s)) return 'LESS_THAN_1_WEEK';
  if (/^(1-2 weeks|1–2 weeks|1 to 2 weeks|2 weeks|two weeks|14 days|1_to_2_weeks)$/i.test(s)) return '1_TO_2_WEEKS';
  if (/^(30 days|1 month|one month|4 weeks|30_days)$/i.test(s)) return '30_DAYS';
  if (/^(60 days|2 months|two months|8 weeks|60_days)$/i.test(s)) return '60_DAYS';
  if (/^(90 days|3 months|three months|12 weeks|90_days)$/i.test(s)) return '90_DAYS';
  if (/^(custom)$/i.test(s)) return 'CUSTOM';
  if (/^(not_set|not set|unset)$/i.test(s)) return 'NOT_SET';
  if (/^(unknown)$/i.test(s)) return 'UNKNOWN';
  const upper = val.toUpperCase().trim();
  if (NoticePeriodEnum.options.includes(upper)) return upper;
  return 'CUSTOM';
}

/**
 * Normalizes remote preference input to standard RemotePreferenceEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeRemotePreference(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(remote_only|remote only|remote)$/i.test(s)) return 'REMOTE_ONLY';
  if (/^(remote_first|remote first|remote-first)$/i.test(s)) return 'REMOTE_FIRST';
  if (/^(hybrid)$/i.test(s)) return 'HYBRID';
  if (/^(on_site|onsite|on-site|on site|in_person|in person)$/i.test(s)) return 'ON_SITE';
  if (/^(flexible)$/i.test(s)) return 'FLEXIBLE';
  if (/^(unknown)$/i.test(s)) return 'UNKNOWN';
  if (/^(not_set|not set|no preference|no_preference|none)$/i.test(s)) return 'NOT_SET';
  const upper = val.toUpperCase().trim();
  if (RemotePreferenceEnum.options.includes(upper)) return upper;
  return null;
}

/**
 * Normalizes relocation preference input to standard RelocationPreferenceEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeRelocationPreference(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(willing_to_relocate|willing to relocate|will_relocate|will relocate|yes)$/i.test(s)) return 'WILLING_TO_RELOCATE';
  if (/^(open_to_relocation|open to relocation|open)$/i.test(s)) return 'OPEN_TO_RELOCATION';
  if (/^(not_willing|not willing|no)$/i.test(s)) return 'NOT_WILLING';
  if (/^(remote_only|remote only|remote)$/i.test(s)) return 'REMOTE_ONLY';
  if (/^(unknown)$/i.test(s)) return 'UNKNOWN';
  if (/^(not_set|not set|none)$/i.test(s)) return 'NOT_SET';
  const upper = val.toUpperCase().trim();
  if (RelocationPreferenceEnum.options.includes(upper)) return upper;
  return null;
}

/**
 * Normalizes compensation period input to standard CompensationPeriodEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeCompensationPeriod(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(yearly|annual|annually|year|per year)$/i.test(s)) return 'YEARLY';
  if (/^(monthly|month|per month)$/i.test(s)) return 'MONTHLY';
  if (/^(hourly|hour|per hour|hr)$/i.test(s)) return 'HOURLY';
  if (/^(weekly|week|per week)$/i.test(s)) return 'WEEKLY';
  if (/^(unknown)$/i.test(s)) return 'UNKNOWN';
  if (/^(not_set|not set|none)$/i.test(s)) return 'NOT_SET';
  const upper = val.toUpperCase().trim();
  if (CompensationPeriodEnum.options.includes(upper)) return upper;
  return null;
}

/**
 * Normalizes compensation type input to standard CompensationTypeEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeCompensationType(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(base_only|base only|base|base_salary|base salary)$/i.test(s)) return 'BASE_ONLY';
  if (/^(total_comp|total comp|total|total_compensation|total compensation)$/i.test(s)) return 'TOTAL_COMP';
  if (/^(base_plus_bonus|base plus bonus|base \+ bonus)$/i.test(s)) return 'BASE_PLUS_BONUS';
  if (/^(unknown)$/i.test(s)) return 'UNKNOWN';
  if (/^(not_set|not set|none)$/i.test(s)) return 'NOT_SET';
  const upper = val.toUpperCase().trim();
  if (CompensationTypeEnum.options.includes(upper)) return upper;
  return null;
}

/**
 * Normalizes single employment type string to EmploymentTypeEnum.
 *
 * @param {string|null} val
 * @returns {string|null}
 */
export function normalizeEmploymentType(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toLowerCase();
  if (/^(full_time|full-time|full time)$/i.test(s)) return 'FULL_TIME';
  if (/^(part_time|part-time|part time)$/i.test(s)) return 'PART_TIME';
  if (/^(contract|contractor)$/i.test(s)) return 'CONTRACT';
  if (/^(internship|intern)$/i.test(s)) return 'INTERNSHIP';
  if (/^(freelance|freelancer)$/i.test(s)) return 'FREELANCE';
  if (/^(temporary|temp)$/i.test(s)) return 'CONTRACT';
  if (/^(other)$/i.test(s)) return 'OTHER';
  const upper = val.toUpperCase().trim();
  if (EmploymentTypeEnum.options.includes(upper)) return upper;
  return null;
}

/**
 * Normalizes list of employment types to array of EmploymentTypeEnum.
 *
 * @param {Array<string>|string|null} val
 * @returns {Array<string>}
 */
export function normalizeEmploymentTypes(val) {
  if (!val) return [];
  const list = Array.isArray(val)
    ? val
    : typeof val === 'string'
      ? val.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  return list.map(normalizeEmploymentType).filter(Boolean);
}

/**
 * Normalizes visa sponsorship value to standard tri-state/boolean representation.
 *
 * @param {string|boolean|null} val
 * @returns {'YES'|'NO'|'UNKNOWN'|'NOT_SET'|null}
 */
export function normalizeVisaSponsorship(val) {
  if (val === true || val === 'true') return 'YES';
  if (val === false || val === 'false') return 'NO';
  if (!val || (typeof val === 'string' && !val.trim())) return null;
  if (typeof val !== 'string') return null;
  const s = val.trim().toUpperCase();
  if (s === 'YES' || s === 'TRUE' || s === 'REQUIRED') return 'YES';
  if (s === 'NO' || s === 'FALSE' || s === 'NOT_REQUIRED') return 'NO';
  if (s === 'UNKNOWN' || s === 'UNCERTAIN' || s === 'DEPENDS' || s === 'CASE_BY_CASE') return 'UNKNOWN';
  if (s === 'NOT_SET') return 'NOT_SET';
  return null;
}

/**
 * Normalizes career status string to standard CareerStatusEnum.
 *
 * @param {string|null} val
 * @returns {string}
 */
export function normalizeCareerStatus(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return 'UNKNOWN';
  if (typeof val !== 'string') return 'UNKNOWN';
  const s = val.trim().toLowerCase();
  if (/^(employed|employed_full_time)$/i.test(s)) return 'EMPLOYED';
  if (/^(unemployed|open_to_work)$/i.test(s)) return 'UNEMPLOYED';
  if (/^(student)$/i.test(s)) return 'STUDENT';
  if (/^(fresher|early_career|early career|entry_level|entry level|junior)$/i.test(s)) return 'FRESHER';
  if (/^(freelance|freelancer)$/i.test(s)) return 'FREELANCE';
  if (/^(contractor|contract)$/i.test(s)) return 'CONTRACTOR';
  if (/^(mid_level|mid level|mid)$/i.test(s)) return 'MID_LEVEL';
  if (/^(senior|sr)$/i.test(s)) return 'SENIOR';
  if (/^(lead|staff|principal)$/i.test(s)) return 'LEAD';
  if (/^(executive|manager)$/i.test(s)) return 'EXECUTIVE';
  if (/^(unknown|not_set)$/i.test(s)) return 'UNKNOWN';
  const upper = val.toUpperCase().trim();
  if (CareerStatusEnum.options.includes(upper)) return upper;
  return 'UNKNOWN';
}

/**
 * Normalizes seniority level string to standard SeniorityLevelEnum.
 *
 * @param {string|null} val
 * @returns {string}
 */
export function normalizeSeniorityLevel(val) {
  if (!val || (typeof val === 'string' && !val.trim())) return 'UNKNOWN';
  if (typeof val !== 'string') return 'UNKNOWN';
  const s = val.trim().toLowerCase();
  if (/^(intern|internship)$/i.test(s)) return 'INTERN';
  if (/^(entry_level|entry-level|entry level|fresher)$/i.test(s)) return 'ENTRY_LEVEL';
  if (/^(junior|jr)$/i.test(s)) return 'JUNIOR';
  if (/^(mid|mid_level|mid-level|mid level)$/i.test(s)) return 'MID_LEVEL';
  if (/^(senior|sr)$/i.test(s)) return 'SENIOR';
  if (/^(staff)$/i.test(s)) return 'STAFF';
  if (/^(principal)$/i.test(s)) return 'PRINCIPAL';
  if (/^(lead|executive)$/i.test(s)) return 'LEAD';
  const upper = val.toUpperCase().trim();
  if (SeniorityLevelEnum.options.includes(upper)) return upper;
  return 'UNKNOWN';
}

/**
 * Canonicalizes all enum-backed career preferences input fields before schema validation.
 *
 * @param {object} [rawInput={}]
 * @returns {object} Canonical preferences object
 */
export function canonicalizeCareerPreferencesInput(rawInput = {}) {
  if (!rawInput || typeof rawInput !== 'object') return rawInput;
  const copy = { ...rawInput };
  if (copy.noticePeriod !== undefined) {
    copy.noticePeriod = normalizeNoticePeriod(copy.noticePeriod);
  }
  if (copy.remotePreference !== undefined) {
    copy.remotePreference = normalizeRemotePreference(copy.remotePreference);
  }
  if (copy.relocationPreference !== undefined) {
    copy.relocationPreference = normalizeRelocationPreference(copy.relocationPreference);
  }
  if (copy.compensationPeriod !== undefined) {
    copy.compensationPeriod = normalizeCompensationPeriod(copy.compensationPeriod);
  }
  if (copy.compensationType !== undefined) {
    copy.compensationType = normalizeCompensationType(copy.compensationType);
  }
  if (copy.employmentTypes !== undefined) {
    copy.employmentTypes = normalizeEmploymentTypes(copy.employmentTypes);
  }
  if (copy.visaSponsorshipRequired !== undefined) {
    copy.visaSponsorshipRequired = normalizeVisaSponsorship(copy.visaSponsorshipRequired);
  }
  if (copy.salaryCurrency !== undefined && copy.salaryCurrency) {
    copy.salaryCurrency = String(copy.salaryCurrency).toUpperCase().trim().slice(0, 3);
  }
  return copy;
}

/**
 * Formats a NoticePeriodEnum value into an applicant-facing human label.
 *
 * @param {string|null} period
 * @param {string|null} [customValue]
 * @returns {string|null}
 */
export function formatNoticePeriodLabel(period, customValue = null) {
  switch (period) {
    case 'IMMEDIATE':
      return 'Immediate';
    case 'LESS_THAN_1_WEEK':
      return 'Less than 1 week';
    case '1_TO_2_WEEKS':
      return '1–2 weeks';
    case '30_DAYS':
      return '30 days';
    case '60_DAYS':
      return '60 days';
    case '90_DAYS':
      return '90 days';
    case 'CUSTOM':
      return customValue || 'Custom';
    case 'NOT_SET':
    case 'UNKNOWN':
    default:
      return null;
  }
}

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
  'OPEN_TO_RELOCATION',
  'UNKNOWN',
  'NOT_SET',
]);

/**
 * Career Job Preferences Schema (User Intent Model).
 *
 * Distinguishes SET vs NOT_SET/UNKNOWN. Dangerous defaults (e.g. visa sponsorship=false,
 * relocation=REMOTE_ONLY, remote=FLEXIBLE, currency=USD) are eliminated in favor of
 * honest null/unset semantics.
 */
export const CareerPreferencesSchema = z.strictObject({
  targetRoles: z.array(z.string().min(1).max(100)).default([]),
  preferredLocations: z.array(z.string().min(1).max(100)).default([]),
  remotePreference: RemotePreferenceEnum.nullable().optional().default(null),
  employmentTypes: z.array(EmploymentTypeEnum).default([]),
  salaryFloor: z.number().nonnegative().optional().nullable().default(null),
  targetSalary: z.number().nonnegative().optional().nullable().default(null),
  salaryCurrency: z.string().length(3).nullable().optional().default(null),
  compensationPeriod: CompensationPeriodEnum.nullable().optional().default(null),
  compensationType: CompensationTypeEnum.nullable().optional().default(null),
  industries: z.array(z.string().min(1).max(100)).default([]),
  companiesToAvoid: z.array(z.string().min(1).max(100)).default([]),
  companiesToPrioritize: z.array(z.string().min(1).max(100)).default([]),
  preferredTechStack: z.array(z.string().min(1).max(100)).default([]),
  workAuthorization: z.array(WorkAuthorizationItemSchema).default([]),
  workAuthConfirmedByUser: z.boolean().optional().default(false),
  visaSponsorshipRequired: z
    .union([z.boolean(), z.enum(['YES', 'NO', 'UNKNOWN', 'NOT_SET'])])
    .nullable()
    .optional()
    .default(null),
  visaSponsorshipConfirmedByUser: z.boolean().optional().default(false),
  availabilityDate: z.string().max(100).optional().nullable().default(null),
  noticePeriod: NoticePeriodEnum.nullable().optional().default(null),
  customNoticePeriod: z.string().max(100).nullable().optional().default(null),
  availableImmediately: z.boolean().nullable().optional().default(null),
  isCurrentlyEmployed: z.boolean().nullable().optional().default(null),
  relocationPreference: RelocationPreferenceEnum.nullable().optional().default(null),
  timezone: z.string().max(100).nullable().optional().default(null),
  timezoneConfirmedByUser: z.boolean().optional().default(false),
  lastUpdated: DateOrIsoStringSchema.optional().nullable().default(null),
  metadata: SafeMetadataSchema.default({}),
});

/**
 * Base Update Career Preferences Input Schema.
 */
export const BaseUpdateCareerPreferencesInputSchema = z.strictObject({
  targetRoles: z.array(z.string().min(1).max(100)).optional(),
  preferredLocations: z.array(z.string().min(1).max(100)).optional(),
  remotePreference: RemotePreferenceEnum.nullable().optional(),
  employmentTypes: z.array(EmploymentTypeEnum).optional(),
  salaryFloor: z.number().nonnegative().optional().nullable(),
  targetSalary: z.number().nonnegative().optional().nullable(),
  salaryCurrency: z.string().length(3).nullable().optional(),
  compensationPeriod: CompensationPeriodEnum.nullable().optional(),
  compensationType: CompensationTypeEnum.nullable().optional(),
  industries: z.array(z.string().min(1).max(100)).optional(),
  companiesToAvoid: z.array(z.string().min(1).max(100)).optional(),
  companiesToPrioritize: z.array(z.string().min(1).max(100)).optional(),
  preferredTechStack: z.array(z.string().min(1).max(100)).optional(),
  workAuthorization: z.array(WorkAuthorizationItemSchema).optional(),
  workAuthConfirmedByUser: z.boolean().optional(),
  visaSponsorshipRequired: z
    .union([z.boolean(), z.enum(['YES', 'NO', 'UNKNOWN', 'NOT_SET'])])
    .nullable()
    .optional(),
  visaSponsorshipConfirmedByUser: z.boolean().optional(),
  availabilityDate: z.string().max(100).optional().nullable(),
  noticePeriod: NoticePeriodEnum.nullable().optional(),
  customNoticePeriod: z.string().max(100).nullable().optional(),
  availableImmediately: z.boolean().nullable().optional(),
  isCurrentlyEmployed: z.boolean().nullable().optional(),
  relocationPreference: RelocationPreferenceEnum.nullable().optional(),
  timezone: z.string().max(100).nullable().optional(),
  timezoneConfirmedByUser: z.boolean().optional(),
});

/**
 * Update Career Preferences Input Schema with automatic canonicalization.
 */
export const UpdateCareerPreferencesInputSchema = z.preprocess(
  (val) => canonicalizeCareerPreferencesInput(val),
  BaseUpdateCareerPreferencesInputSchema
);

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
  timezone: z.string().max(100).optional().nullable(),
  seniority: SeniorityLevelEnum.optional().nullable(),
  yearsOfExperience: z.number().nonnegative().optional().nullable(),
  canonicalEmail: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  countryCode: z.string().max(10).optional().nullable(),
  phoneNumber: z.string().max(40).optional().nullable(),
  noticePeriod: NoticePeriodEnum.optional().nullable(),
  customNoticePeriod: z.string().max(100).optional().nullable(),
  availableImmediately: z.boolean().optional().nullable(),
  isCurrentlyEmployed: z.boolean().optional().nullable(),
  workAuthConfirmedByUser: z.boolean().optional().default(false),
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
