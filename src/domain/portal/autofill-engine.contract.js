/**
 * @file Generic Browser Form Autofill Engine Contract & Schemas (Phase 8.3 / ARCH-058).
 *
 * Defines the provider-neutral lifecycle and formal schemas for safe, browser-side form autofill:
 * 1. Lifecycle Contract:
 *    - planFill(formSchema, applicationPackage, options)
 *    - validateFillPlan(fillPlan, formSchema)
 *    - executeFill(fillPlan, context)
 *    - verifyFill(fillPlan, context)
 * 2. Intermediate FillPlan Domain Model:
 *    - Strict separation of PLANNING, EXECUTION, and VERIFICATION
 *    - Actions: FILL, SELECT, CHECK, UNCHECK, UPLOAD, SKIP, REVIEW
 *    - Statuses: PLANNED, EXECUTED, SKIPPED, FAILED, VERIFIED, NEEDS_REVIEW
 * 3. Zero-Fabrication & Safety Gates:
 *    - Strict protection of legal attestations, accuracy confirmations, work authorization,
 *      visa sponsorship, salary expectations, criminal history, and demographic fields.
 *    - Missing, unknown, or uncorroborated fields unconditionally resolve to action: REVIEW.
 *    - Strict Invariant: Autofill NEVER submits applications (no clicking final submit).
 */

import { z } from 'zod';
import { PortalFieldTypeEnum } from './portal-adapter.contract.js';

/**
 * Standard Autofill Action Enum.
 */
export const AutofillActionEnum = z.enum([
  'FILL',
  'SELECT',
  'CHECK',
  'UNCHECK',
  'UPLOAD',
  'SKIP',
  'REVIEW',
]);

/**
 * Autofill Execution & Verification Status Enum.
 */
export const AutofillStatusEnum = z.enum([
  'PLANNED',
  'EXECUTED',
  'SKIPPED',
  'FAILED',
  'VERIFIED',
  'NEEDS_REVIEW',
]);

/**
 * Deterministic Autofill Confidence Classification.
 */
export const AutofillConfidenceEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);

/**
 * Protected Form Field Categories Requiring Human Review.
 */
export const ProtectedFieldCategoryEnum = z.enum([
  'legal_attestation',
  'accuracy_certification',
  'terms_acceptance',
  'privacy_consent',
  'work_authorization',
  'visa_sponsorship',
  'criminal_history',
  'demographic',
  'disability',
  'veteran',
  'salary_expectation',
  'relocation_commitment',
  'security_token',
  'unprotected',
]);

/**
 * Verification Method Enum.
 */
export const VerificationMethodEnum = z.enum([
  'DOM_VALUE',
  'INPUT_EVENT',
  'FILE_INPUT',
  'MANUAL_REVIEW',
  'NONE',
]);

/**
 * Planned Field Action Schema.
 */
export const PlannedFieldActionSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  fieldType: PortalFieldTypeEnum.default('text'),
  name: z.string().default(''),
  label: z.string().default(''),
  action: AutofillActionEnum,
  status: AutofillStatusEnum.default('PLANNED'),
  rawValue: z.any().optional().nullable(),
  sanitizedValue: z.any().optional().nullable(),
  previousValue: z.any().optional().nullable(),
  resultingValue: z.any().optional().nullable(),
  source: z.string().default(''),
  provenance: z
    .enum(['USER_PROVIDED', 'VERIFIED_PROFILE', 'VERIFIED_EVIDENCE', 'INFERRED', 'GENERATED', 'UNKNOWN'])
    .default('UNKNOWN'),
  confidence: AutofillConfidenceEnum.default('LOW'),
  requiresUserReview: z.boolean().default(false),
  isProtected: z.boolean().default(false),
  protectedCategory: ProtectedFieldCategoryEnum.default('unprotected'),
  verificationMethod: VerificationMethodEnum.default('NONE'),
  selector: z.string().optional().nullable(),
  options: z.array(z.any()).default([]),
  metadata: z.record(z.any()).default({}),
});

/**
 * Repeated Group Action Schema.
 */
export const RepeatedGroupActionSchema = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  label: z.string().default(''),
  category: z.enum(['EXPERIENCE', 'EDUCATION', 'PROJECT', 'CERTIFICATION', 'OTHER']).default('OTHER'),
  items: z.array(z.array(PlannedFieldActionSchema)).default([]),
  rowCount: z.number().int().nonnegative().default(0),
  maxRows: z.number().int().positive().default(10),
  requiresUserReview: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

/**
 * Intermediate FillPlan Schema.
 */
export const FillPlanSchema = z.object({
  planId: z.string().min(1, 'planId is required'),
  portalId: z.string().default('generic'),
  formId: z.string().default('default-form'),
  destinationUrl: z.string().default(''),
  packageHash: z.string().default(''),
  planOnly: z.boolean().default(false),
  actions: z.array(PlannedFieldActionSchema).default([]),
  repeatedGroupActions: z.array(RepeatedGroupActionSchema).default([]),
  summary: z
    .object({
      totalFields: z.number().int().nonnegative().default(0),
      autoFillableCount: z.number().int().nonnegative().default(0),
      reviewCount: z.number().int().nonnegative().default(0),
      skippedCount: z.number().int().nonnegative().default(0),
      protectedCount: z.number().int().nonnegative().default(0),
    })
    .default({}),
  createdAt: z.string().default(() => new Date().toISOString()),
  metadata: z.record(z.any()).default({}),
});

/**
 * Autofill Execution Result Telemetry Schema.
 */
export const AutofillExecutionResultSchema = z.object({
  planId: z.string(),
  executedActions: z.array(
    z.object({
      fieldId: z.string(),
      action: AutofillActionEnum,
      status: AutofillStatusEnum,
      verificationStatus: z.enum(['VERIFIED', 'MISMATCH', 'UNVERIFIED', 'SKIPPED']),
      requiresUserReview: z.boolean(),
      previousValue: z.any().optional().nullable(),
      resultingValue: z.any().optional().nullable(),
      error: z.string().optional().nullable(),
    })
  ),
  summary: z.object({
    total: z.number(),
    executed: z.number(),
    verified: z.number(),
    review: z.number(),
    skipped: z.number(),
    failed: z.number(),
  }),
  isComplete: z.boolean(),
  executedAt: z.string(),
});

/**
 * Classifies whether a field belongs to a protected, sensitive, or legal category.
 *
 * @param {object} params
 * @param {string} [params.name]
 * @param {string} [params.label]
 * @param {string} [params.type]
 * @param {string} [params.fieldType]
 * @param {boolean} [params.customQuestion]
 * @returns {{ isProtected: boolean, category: z.infer<typeof ProtectedFieldCategoryEnum> }}
 */
export function classifyProtectedField({ name = '', label = '', type = '', fieldType = '', _customQuestion = false }) {
  const descriptor = `${name} ${label} ${fieldType}`.toLowerCase().trim();

  // 1. Work Authorization & Visa Sponsorship
  if (/authoriz|work\s*permit|legal\s*right\s*to\s*work|eligible\s*to\s*work|citizenship|work_auth/i.test(descriptor)) {
    return { isProtected: true, category: 'work_authorization' };
  }
  if (/sponsor|visa\s*sponsorship|require\s*sponsorship/i.test(descriptor)) {
    return { isProtected: true, category: 'visa_sponsorship' };
  }

  // 2. Legal / Accuracy / Declarations (HIGHEST PRIORITY - NEVER AUTO-FILL)
  if (
    /declarations?_accuracyconfirmed|accuracy_confirmed|certif(y|ication)|attest|declaration/i.test(descriptor)
  ) {
    return { isProtected: true, category: 'accuracy_certification' };
  }
  if (/terms|agree\s+to\s+terms|terms\s+of\s+service|conditions/i.test(descriptor)) {
    return { isProtected: true, category: 'terms_acceptance' };
  }
  if (/privacy|gdpr|consent|data\s+processing/i.test(descriptor)) {
    return { isProtected: true, category: 'privacy_consent' };
  }
  if (
    !/first|last|name|given|family|middle|sur/i.test(descriptor) &&
    /legal|penalty\s+of\s+perjury|affirm/i.test(descriptor)
  ) {
    return { isProtected: true, category: 'legal_attestation' };
  }

  // 3. Compensation & Relocation
  if (/salary|compensation|desired[\s_-]?pay|expected[\s_-]?pay|hourly\s*rate/i.test(descriptor)) {
    return { isProtected: true, category: 'salary_expectation' };
  }
  if (/relocate|relocation|willing\s*to\s*relocate/i.test(descriptor)) {
    return { isProtected: true, category: 'relocation_commitment' };
  }

  // 4. EEO / Demographics / Protected Status
  if (/felon|convict|criminal|background\s*check/i.test(descriptor)) {
    return { isProtected: true, category: 'criminal_history' };
  }
  if (/disabilit|handicap|accommodation/i.test(descriptor)) {
    return { isProtected: true, category: 'disability' };
  }
  if (/veteran|military|armed\s*forces/i.test(descriptor)) {
    return { isProtected: true, category: 'veteran' };
  }
  if (/gender|race|ethnic|sexual\s*orientation|pronoun/i.test(descriptor)) {
    return { isProtected: true, category: 'demographic' };
  }

  // 5. Security tokens & Hidden portal state
  if (
    type === 'hidden' &&
    (/csrf|xsrf|_token|authenticity|session|security|captcha|nonce/i.test(descriptor) || descriptor.length === 0)
  ) {
    return { isProtected: true, category: 'security_token' };
  }

  return { isProtected: false, category: 'unprotected' };
}

/**
 * Abstract Base Class / Contract for all Autofill Engines.
 */
export class AutofillEngineContract {
  /**
   * @param {object} identity
   */
  constructor(identity = { id: 'autofill-engine', name: 'Autofill Engine' }) {
    if (new.target === AutofillEngineContract) {
      throw new TypeError('Cannot construct AutofillEngineContract instances directly; extend it instead.');
    }
    this.identity = identity;
  }

  get id() {
    return this.identity.id;
  }

  get name() {
    return this.identity.name;
  }

  /**
   * Plans the fill operations deterministically based on form schema and approved application package.
   *
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @param {object} applicationPackage Approved Canonical Application Package
   * @param {object} [options]
   * @returns {Promise<z.infer<typeof FillPlanSchema>>}
   */
  async planFill(_formSchema, _applicationPackage, _options = {}) {
    throw new Error(`planFill() not implemented by engine "${this.id}"`);
  }

  /**
   * Validates the planned actions against safety rules and form schema.
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @returns {Promise<{ isValid: boolean, errors: Array<string> }>}
   */
  async validateFillPlan(_fillPlan, _formSchema) {
    throw new Error(`validateFillPlan() not implemented by engine "${this.id}"`);
  }

  /**
   * Executes the planned DOM operations (dry-run safe).
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {Promise<z.infer<typeof AutofillExecutionResultSchema>>}
   */
  async executeFill(_fillPlan, _context = {}) {
    throw new Error(`executeFill() not implemented by engine "${this.id}"`);
  }

  /**
   * Verifies that executed fields match planned values in the DOM.
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {Promise<{ verified: boolean, verifiedCount: number, mismatches: Array<object> }>}
   */
  async verifyFill(_fillPlan, _context = {}) {
    throw new Error(`verifyFill() not implemented by engine "${this.id}"`);
  }
}
