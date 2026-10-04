/**
 * @file Canonical Portal Adapter Contract & Form Schema Domain Models (Phase 8.1 / ARCH-056).
 *
 * Defines the provider-neutral lifecycle and formal schemas for job application portal adapters:
 * 1. Lifecycle Contract:
 *    - canHandle(destination)
 *    - detectJob(context)
 *    - extractFormSchema(context)
 *    - mapFields(applicationSnapshot, formSchema)
 *    - validateMappedFields(mappedFields, formSchema)
 *    - submitOrHandoff(context)
 *    - verifySubmission(context)
 * 2. Canonical Form Schema:
 *    - text, textarea, email, tel, url, number, date, select, radio, checkbox, file, hidden, custom_question, repeated_group, UNKNOWN
 *    - Strict preservation of unknown fields (zero silent omission)
 * 3. Zod-Enforced Validation:
 *    - PortalAdapterIdentitySchema
 *    - PortalFormSchema
 *    - PortalFieldSchema
 *    - PortalFieldOptionSchema
 *    - PortalQuestionSchema
 *    - PortalAttachmentFieldSchema
 *    - MappedPortalFieldSchema
 *    - PortalSubmissionResultSchema
 *    - PortalVerificationResultSchema
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { ValidationError } from '../../errors/index.js';

/**
 * Standard Portal Field Types Enum.
 * Comprehensive coverage including compound and unknown types.
 */
export const PortalFieldTypeEnum = z.enum([
  'text',
  'textarea',
  'email',
  'tel',
  'url',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'file',
  'hidden',
  'custom_question',
  'repeated_group',
  'UNKNOWN',
]);

/**
 * Option schema for selectable fields (select, radio, multi-checkbox).
 */
export const PortalFieldOptionSchema = z.object({
  label: z.string().min(1, 'Option label cannot be empty'),
  value: z.string(),
  selected: z.boolean().default(false),
  disabled: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

/**
 * Canonical form field representation.
 * Preserves structural metadata needed for safe autofill and verification.
 */
export const PortalFieldSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  name: z.string().min(1, 'name is required'),
  label: z.string().default(''),
  type: PortalFieldTypeEnum,
  required: z.boolean().default(false),
  value: z.any().optional(),
  options: z.array(PortalFieldOptionSchema).default([]),
  multiple: z.boolean().default(false),
  accept: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
  source: z.string().default('DOM'),
  description: z.string().optional().nullable(),
  placeholder: z.string().optional().nullable(),
  defaultValue: z.any().optional(),
  selector: z.string().optional().nullable(),
  customQuestion: z.boolean().default(false),
  verified: z.boolean().default(false),
  requiresUserReview: z.boolean().default(false),
  providerMetadata: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});

/**
 * Custom employer question schema.
 */
export const PortalQuestionSchema = z.object({
  questionId: z.string().min(1, 'questionId is required'),
  prompt: z.string().min(1, 'prompt is required'),
  label: z.string().optional(),
  type: PortalFieldTypeEnum.default('text'),
  required: z.boolean().default(false),
  options: z.array(PortalFieldOptionSchema).default([]),
  multiple: z.boolean().default(false),
  allowCustom: z.boolean().default(false),
  source: z.string().default('DOM'),
  requiresUserReview: z.boolean().default(true),
  sensitivityLevel: z.enum(['PUBLIC', 'STANDARD', 'CONFIDENTIAL', 'SENSITIVE']).default('STANDARD'),
  metadata: z.record(z.any()).default({}),
});

/**
 * Dedicated attachment specification schema.
 */
export const PortalAttachmentFieldSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  name: z.string().min(1, 'name is required'),
  label: z.string().default('Attachment'),
  required: z.boolean().default(false),
  accept: z.string().default('.pdf,.doc,.docx'),
  maxSizeMb: z.number().positive().default(10),
  multiple: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

/**
 * Repeated group schema for composite repeating items (e.g. employment history, references).
 */
export const PortalRepeatedGroupSchema = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  label: z.string().default(''),
  minItems: z.number().int().nonnegative().default(0),
  maxItems: z.number().int().positive().optional(),
  fields: z.array(PortalFieldSchema).default([]),
  metadata: z.record(z.any()).default({}),
});

/**
 * Complete canonical form schema for a portal destination.
 */
export const PortalFormSchema = z.object({
  portalId: z.string().min(1, 'portalId is required'),
  formId: z.string().default('default-form'),
  destinationUrl: z.string().url().or(z.literal('')).default(''),
  fields: z.array(PortalFieldSchema).default([]),
  questions: z.array(PortalQuestionSchema).default([]),
  attachments: z.array(PortalAttachmentFieldSchema).default([]),
  repeatedGroups: z.array(PortalRepeatedGroupSchema).default([]),
  steps: z.array(z.string()).default([]),
  isMultiStep: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

/**
 * Generates a stable, deterministic fieldId from DOM attributes and hierarchy.
 * Prevents random UUID churn and ensures stability across repeated extractions.
 *
 * @param {object} params
 * @param {string} [params.formId]
 * @param {string} [params.name]
 * @param {string} [params.id]
 * @param {string} [params.label]
 * @param {string} [params.type]
 * @param {number|string} [params.position]
 * @returns {string} Deterministic field ID
 */
export function generateDeterministicFieldId({ formId, name, id, label, type, position }) {
  const cleanName = (name || id || '').toLowerCase().trim();
  const cleanLabel = (label || '').toLowerCase().trim();
  const cleanType = (type || 'text').toLowerCase().trim();
  const cleanForm = (formId || 'form').toLowerCase().trim();

  const payload = `${cleanForm}:${cleanName}:${cleanLabel}:${cleanType}:${position !== undefined ? position : ''}`;
  const hash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 12);
  const prefix = cleanName ? cleanName.replace(/[^a-z0-9_-]/gi, '_').slice(0, 24) : 'fld';
  return `${prefix}_${hash}`;
}

/**
 * Mapping of candidate application data to a portal field.
 */
export const MappedPortalFieldSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  name: z.string().min(1, 'name is required'),
  fieldType: PortalFieldTypeEnum,
  rawValue: z.any().optional(),
  sanitizedValue: z.any().optional(),
  provenance: z
    .enum(['USER_PROVIDED', 'VERIFIED_PROFILE', 'VERIFIED_EVIDENCE', 'INFERRED', 'GENERATED', 'UNKNOWN'])
    .default('UNKNOWN'),
  confidence: z.number().min(0).max(1).default(1),
  requiresUserReview: z.boolean().default(false),
  isSensitive: z.boolean().default(false),
  mappedFrom: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

/**
 * Maps canonical application snapshot data into canonical portal form fields.
 * Strictly adheres to the zero-fabrication invariant:
 * Never invents candidate data (work authorization, salary, visa status, etc.)
 * unless present in the application snapshot or explicit candidate answers.
 *
 * @param {object} applicationSnapshot
 * @param {z.infer<typeof PortalFormSchema>} formSchema
 * @returns {Array<z.infer<typeof MappedPortalFieldSchema>>}
 */
export function mapCanonicalApplicationToForm(applicationSnapshot, formSchema) {
  if (!formSchema || !Array.isArray(formSchema.fields)) {
    return [];
  }

  const rawCandidate = applicationSnapshot?.candidate || applicationSnapshot?.candidateProfile || {};
  const rawArtifacts = applicationSnapshot?.artifacts || {};
  const answers = applicationSnapshot?.answers || {};

  // Normalize candidate profile attributes with fallbacks for flat application package fields
  const fullName =
    rawCandidate.fullName ||
    rawCandidate.displayName ||
    (rawCandidate.firstName && rawCandidate.lastName
      ? `${rawCandidate.firstName} ${rawCandidate.lastName}`.trim()
      : null) ||
    applicationSnapshot?.candidateName ||
    null;

  const firstName =
    rawCandidate.firstName ||
    rawCandidate.contact?.firstName ||
    (fullName ? fullName.split(' ')[0] : null);

  const lastName =
    rawCandidate.lastName ||
    rawCandidate.contact?.lastName ||
    (fullName ? fullName.split(' ').slice(1).join(' ') : null);

  const email =
    rawCandidate.email ||
    rawCandidate.canonicalEmail ||
    rawCandidate.contact?.email ||
    applicationSnapshot?.candidateEmail ||
    null;

  const phone =
    rawCandidate.phone ||
    rawCandidate.contact?.phone ||
    applicationSnapshot?.candidatePhone ||
    null;

  const candidate = {
    ...rawCandidate,
    firstName,
    lastName,
    fullName,
    email,
    phone,
  };

  const resumeArtifact =
    rawArtifacts.resume ||
    (applicationSnapshot?.tailoredResume?.artifact
      ? {
          url:
            applicationSnapshot.tailoredResume.artifact.downloadUrl ||
            applicationSnapshot.tailoredResume.artifact.viewUrl,
          filename:
            applicationSnapshot.tailoredResume.artifact.filename ||
            applicationSnapshot.tailoredResume.title,
          text: applicationSnapshot.tailoredResume.markdownContent,
        }
      : applicationSnapshot?.tailoredResume
        ? {
            text: applicationSnapshot.tailoredResume.markdownContent,
            filename: applicationSnapshot.tailoredResume.title,
          }
        : null);

  const coverLetterArtifact =
    rawArtifacts.coverLetter ||
    (applicationSnapshot?.coverLetter?.artifact
      ? {
          url:
            applicationSnapshot.coverLetter.artifact.downloadUrl ||
            applicationSnapshot.coverLetter.artifact.viewUrl,
          filename:
            applicationSnapshot.coverLetter.artifact.filename ||
            applicationSnapshot.coverLetter.title,
          text: applicationSnapshot.coverLetter.markdownContent,
        }
      : applicationSnapshot?.coverLetter
        ? {
            text: applicationSnapshot.coverLetter.markdownContent,
            filename: applicationSnapshot.coverLetter.title,
          }
        : null);

  const artifacts = {
    ...rawArtifacts,
    ...(resumeArtifact ? { resume: resumeArtifact } : {}),
    ...(coverLetterArtifact ? { coverLetter: coverLetterArtifact } : {}),
  };

  const preferences = candidate.careerPreferences || {};
  const contact = candidate.contact || {};
  const socialLinks = candidate.socialLinks || {};

  const mappedFields = [];

  for (const field of formSchema.fields) {
    const fieldId = field.fieldId;
    const name = field.name || '';
    const label = field.label || '';
    const type = field.type || 'text';
    const descriptor = `${name} ${label}`.toLowerCase().trim();

    let rawValue = null;
    let sanitizedValue = null;
    let mappedFrom = null;
    let provenance = 'UNKNOWN';
    let confidence = 0;
    let requiresUserReview = field.requiresUserReview || false;

    // Check custom answers first by questionId, fieldId or name
    if (answers[fieldId] !== undefined) {
      rawValue = answers[fieldId]?.value !== undefined ? answers[fieldId].value : answers[fieldId];
      provenance = answers[fieldId]?.provenance || 'USER_PROVIDED';
      confidence = 1;
      mappedFrom = `answers.${fieldId}`;
    } else if (answers[name] !== undefined) {
      rawValue = answers[name]?.value !== undefined ? answers[name].value : answers[name];
      provenance = answers[name]?.provenance || 'USER_PROVIDED';
      confidence = 1;
      mappedFrom = `answers.${name}`;
    } else if (type === 'UNKNOWN') {
      rawValue = null;
      sanitizedValue = null;
      provenance = 'UNKNOWN';
      confidence = 0;
      requiresUserReview = true;
    } else if (field.customQuestion) {
      rawValue = null;
      sanitizedValue = null;
      provenance = 'UNKNOWN';
      confidence = 0;
      requiresUserReview = true;
    } else if (/first[\s_-]?name/i.test(descriptor)) {
      rawValue = candidate.firstName || (candidate.fullName ? candidate.fullName.split(' ')[0] : null);
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.firstName';
      }
    } else if (/last[\s_-]?name/i.test(descriptor)) {
      rawValue = candidate.lastName || (candidate.fullName ? candidate.fullName.split(' ').slice(1).join(' ') : null);
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.lastName';
      }
    } else if (/full[\s_-]?name|your\s+name|^name$/i.test(descriptor)) {
      rawValue = candidate.fullName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.fullName';
      }
    } else if (/email/i.test(descriptor) || type === 'email') {
      rawValue = candidate.email || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.email';
      }
    } else if (/phone|mobile|tel/i.test(descriptor) || type === 'tel') {
      rawValue = candidate.phone || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.phone';
      }
    } else if (/resume|cv/i.test(descriptor) || (type === 'file' && /resume|cv/i.test(descriptor))) {
      rawValue = artifacts.resume?.url || artifacts.resume?.filename || artifacts.resume?.text || null;
      if (rawValue) {
        provenance = 'VERIFIED_EVIDENCE';
        confidence = 1;
        mappedFrom = 'artifacts.resume';
      }
    } else if (/cover[\s_-]?letter/i.test(descriptor)) {
      rawValue = artifacts.coverLetter?.text || artifacts.coverLetter?.url || null;
      if (rawValue) {
        provenance = 'GENERATED';
        confidence = 1;
        mappedFrom = 'artifacts.coverLetter';
      }
    } else if (/linkedin/i.test(descriptor)) {
      rawValue = socialLinks.linkedin || candidate.linkedinUrl || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.socialLinks.linkedin';
      }
    } else if (/github/i.test(descriptor)) {
      rawValue = socialLinks.github || candidate.githubUrl || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.socialLinks.github';
      }
    } else if (/portfolio|website|url/i.test(descriptor) || type === 'url') {
      rawValue = candidate.portfolioUrl || candidate.website || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.portfolioUrl';
      }
    } else if (/city/i.test(descriptor)) {
      rawValue = contact.city || candidate.city || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.contact.city';
      }
    } else if (/state|province/i.test(descriptor)) {
      rawValue = contact.state || candidate.state || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.contact.state';
      }
    } else if (/postal|zip/i.test(descriptor)) {
      rawValue = contact.postalCode || candidate.postalCode || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.contact.postalCode';
      }
    } else if (/address/i.test(descriptor)) {
      rawValue = contact.address || candidate.location || null;
      if (rawValue) {
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.contact.address';
      }
    } else if (/authoriz|work\s*permit|legal\s*right\s*to\s*work|eligible\s*to\s*work|citizenship/i.test(descriptor)) {
      // ONLY map if explicitly present in candidate data - NEVER FABRICATE!
      if (preferences.workAuthorization !== undefined && preferences.workAuthorization !== null) {
        rawValue = preferences.workAuthorization;
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.careerPreferences.workAuthorization';
      }
    } else if (/sponsor/i.test(descriptor)) {
      if (preferences.visaSponsorshipRequired !== undefined && preferences.visaSponsorshipRequired !== null) {
        rawValue = preferences.visaSponsorshipRequired;
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.careerPreferences.visaSponsorshipRequired';
      }
    } else if (/salary|compensation|expected[\s_-]?pay|desired[\s_-]?pay/i.test(descriptor)) {
      if (preferences.salaryFloor !== undefined && preferences.salaryFloor !== null) {
        rawValue = preferences.salaryFloor;
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.careerPreferences.salaryFloor';
      }
    } else if (/notice[\s_-]?period|availability|start[\s_-]?date/i.test(descriptor)) {
      if (preferences.noticePeriod !== undefined && preferences.noticePeriod !== null) {
        rawValue = preferences.noticePeriod;
        provenance = 'VERIFIED_PROFILE';
        confidence = 1;
        mappedFrom = 'candidate.careerPreferences.noticePeriod';
      }
    }

    if (rawValue !== null && rawValue !== undefined) {
      sanitizedValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      requiresUserReview = field.requiresUserReview || false;
    } else {
      rawValue = null;
      sanitizedValue = null;
      provenance = 'UNKNOWN';
      confidence = 0;
      requiresUserReview = true;
    }

    const mappedField = MappedPortalFieldSchema.parse({
      fieldId,
      name,
      fieldType: type,
      rawValue,
      sanitizedValue,
      provenance,
      confidence,
      requiresUserReview,
      isSensitive: field.metadata?.isSensitive || false,
      mappedFrom,
      metadata: field.metadata || {},
    });

    mappedFields.push(mappedField);
  }

  return mappedFields;
}

/**
 * Submission Result Schema.
 */
export const PortalSubmissionResultSchema = z.object({
  status: z.enum(['SUBMITTED', 'HANDOFF_READY', 'READY_FOR_FINAL_REVIEW', 'REJECTED', 'FAILED']),
  externalReference: z.string().optional().nullable(),
  confirmationNumber: z.string().optional().nullable(),
  portalType: z.string().min(1, 'portalType is required'),
  destinationUrl: z.string().min(1, 'destinationUrl is required'),
  message: z.string().min(1, 'message is required'),
  submittedAt: z.string().optional(),
  handoffKit: z.record(z.any()).optional().nullable(),
  retryState: z.enum(['NOT_SENT', 'SENT_UNKNOWN', 'CONFIRMED', 'FAILED']).default('NOT_SENT'),
  metadata: z.record(z.any()).default({}),
});

/**
 * Verification Result Schema.
 */
export const PortalVerificationResultSchema = z.object({
  status: z.enum(['CONFIRMED', 'SENT_UNKNOWN', 'FAILED', 'NOT_SENT']),
  externalReference: z.string().optional().nullable(),
  verificationMethod: z.enum([
    'DOM_CONFIRMATION',
    'HTTP_RESPONSE',
    'API_STATUS',
    'MANUAL_ATTESTATION',
    'URL_REDIRECT',
  ]),
  verifiedAt: z.string(),
  details: z.record(z.any()).default({}),
});

/**
 * Application Step Schema for Multi-step Portal Applications.
 */
export const ApplicationStepSchema = z.object({
  stepId: z.string().min(1, 'stepId is required'),
  order: z.number().int().nonnegative().default(1),
  name: z.string().default('Application Step'),
  formSchema: PortalFormSchema.optional(),
  navigation: z
    .object({
      hasNext: z.boolean().default(false),
      hasPrevious: z.boolean().default(false),
      isFinalStep: z.boolean().default(false),
      nextSelector: z.string().optional().nullable(),
      prevSelector: z.string().optional().nullable(),
      submitSelector: z.string().optional().nullable(),
    })
    .default({}),
  completionState: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'REQUIRES_REVIEW'])
    .default('NOT_STARTED'),
  requiresReview: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
});

/**
 * Normalized Field Validation Error Schema.
 */
export const FieldValidationErrorSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  name: z.string().default(''),
  message: z.string().min(1, 'message is required'),
  code: z.string().default('VALIDATION_ERROR'),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']).default('ERROR'),
  recoverable: z.boolean().default(true),
  requiresUserReview: z.boolean().default(true),
  rawMessage: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

/**
 * Canonical Application State Machine States.
 */
export const PortalApplicationStateEnum = z.enum([
  'NOT_STARTED',
  'DETECTED',
  'FORM_EXTRACTED',
  'READY_FOR_FILL',
  'FILLING',
  'FILLED',
  'VALIDATING',
  'VALIDATION_ERROR',
  'READY_FOR_REVIEW',
  'SUBMISSION_PENDING',
  'SUBMITTED',
  'FAILED',
]);

/**
 * Normalized Portal Error Status Enum.
 */
export const PortalErrorStatusEnum = z.enum([
  'FORM_NOT_FOUND',
  'UNSUPPORTED_FORM',
  'AUTH_REQUIRED',
  'IFRAME_BLOCKED',
  'VALIDATION_ERROR',
  'MISSING_REQUIRED_FIELD',
  'UPLOAD_FAILED',
  'NAVIGATION_FAILED',
  'UNKNOWN_PROVIDER_STATE',
  'READY_FOR_REVIEW',
  'SUBMISSION_READY',
]);

/**
 * Iframe Discovery and Scope Schema.
 */
export const IframeScopeSchema = z.object({
  isIframe: z.boolean().default(false),
  iframeSelector: z.string().optional().nullable(),
  isAccessible: z.boolean().default(true),
  isBlocked: z.boolean().default(false),
  status: z.enum(['ACCESSIBLE', 'BLOCKED', 'NOT_IFRAME']).default('NOT_IFRAME'),
  origin: z.string().optional().nullable(),
  metadata: z.record(z.any()).default({}),
});

/**
 * Canonical Application State Machine.
 * Enforces valid state transitions and strictly forbids automated READY_FOR_REVIEW -> SUBMITTED.
 */
export class PortalApplicationStateMachine {
  constructor(initialState = 'NOT_STARTED') {
    this.currentState = PortalApplicationStateEnum.parse(initialState);
    this.history = [{ state: this.currentState, timestamp: new Date().toISOString() }];
  }

  get state() {
    return this.currentState;
  }

  transition(targetState, reason = '') {
    const validatedTarget = PortalApplicationStateEnum.parse(targetState);

    // Hard Invariant: NEVER allow direct automated READY_FOR_REVIEW -> SUBMITTED
    if (this.currentState === 'READY_FOR_REVIEW' && validatedTarget === 'SUBMITTED') {
      throw new ValidationError(
        'Direct automated transition from READY_FOR_REVIEW to SUBMITTED is strictly forbidden. Consequential submission requires explicit user authorization and SUBMISSION_PENDING staging.',
        'FORBIDDEN_AUTOMATED_SUBMIT'
      );
    }

    const validTransitions = {
      NOT_STARTED: ['DETECTED', 'FAILED'],
      DETECTED: ['FORM_EXTRACTED', 'FAILED'],
      FORM_EXTRACTED: ['READY_FOR_FILL', 'FAILED'],
      READY_FOR_FILL: ['FILLING', 'FAILED'],
      FILLING: ['FILLED', 'FAILED'],
      FILLED: ['VALIDATING', 'FAILED'],
      VALIDATING: ['READY_FOR_REVIEW', 'VALIDATION_ERROR', 'FAILED'],
      VALIDATION_ERROR: ['READY_FOR_FILL', 'READY_FOR_REVIEW', 'FAILED'],
      READY_FOR_REVIEW: ['SUBMISSION_PENDING', 'READY_FOR_FILL', 'FAILED'],
      SUBMISSION_PENDING: ['SUBMITTED', 'FAILED', 'READY_FOR_REVIEW'],
      SUBMITTED: [],
      FAILED: ['NOT_STARTED', 'READY_FOR_FILL'],
    };

    const allowed = validTransitions[this.currentState] || [];
    if (!allowed.includes(validatedTarget)) {
      throw new ValidationError(
        `Invalid state transition from "${this.currentState}" to "${validatedTarget}". Allowed: [${allowed.join(', ')}]`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.currentState = validatedTarget;
    this.history.push({ state: this.currentState, reason, timestamp: new Date().toISOString() });
    return this.currentState;
  }
}

/**
 * Portal Adapter Identity & Capability Schema.
 */
export const PortalAdapterIdentitySchema = z.object({
  id: z.string().min(1, 'Adapter id is required'),
  name: z.string().min(1, 'Adapter name is required'),
  version: z.string().default('1.0.0'),
  supportedPortals: z.array(z.string()).default([]),
  priority: z.number().int().default(10),
  capabilities: z
    .object({
      jobDetection: z.boolean().default(true),
      formExtraction: z.boolean().default(true),
      fieldMapping: z.boolean().default(true),
      automatedSubmission: z.boolean().default(false),
      submissionVerification: z.boolean().default(false),
    })
    .default({}),
});

/**
 * Abstract Base Class / Contract for all Application Portal Adapters.
 * Enforces strict provider-neutral lifecycle and schema validation.
 */
export class PortalAdapterContract {
  /**
   * @param {object} identity
   */
  constructor(identity) {
    if (new.target === PortalAdapterContract) {
      throw new TypeError('Cannot construct PortalAdapterContract instances directly; extend it instead.');
    }
    const validatedIdentity = PortalAdapterIdentitySchema.safeParse(identity);
    if (!validatedIdentity.success) {
      throw new ValidationError(
        `Invalid PortalAdapter identity: ${validatedIdentity.error.message}`,
        'INVALID_PORTAL_ADAPTER_IDENTITY'
      );
    }
    this.identity = validatedIdentity.data;
  }

  get id() {
    return this.identity.id;
  }

  get name() {
    return this.identity.name;
  }

  get priority() {
    return this.identity.priority;
  }

  get capabilities() {
    return this.identity.capabilities;
  }

  /**
   * Determines whether this adapter handles the target destination URL or DOM context.
   *
   * @param {string|object} destination URL string or context object
   * @returns {boolean}
   */
  canHandle(_destination) {
    throw new Error(`canHandle() not implemented by adapter "${this.id}"`);
  }

  /**
   * Detects job identity signals from the page or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async detectJob(_context) {
    return { detected: false, confidence: 0, signals: {} };
  }

  /**
   * Extracts the canonical form schema from the destination context.
   *
   * @param {object} context
   * @returns {Promise<z.infer<typeof PortalFormSchema>>}
   */
  async extractFormSchema(_context) {
    throw new Error(`extractFormSchema() not implemented by adapter "${this.id}"`);
  }

  /**
   * Maps canonical application snapshot data into the portal form fields.
   *
   * @param {object} applicationSnapshot Canonical ApplicationSnapshot
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @returns {Promise<Array<z.infer<typeof MappedPortalFieldSchema>>>}
   */
  async mapFields(applicationSnapshot, formSchema) {
    return mapCanonicalApplicationToForm(applicationSnapshot, formSchema);
  }

  /**
   * Validates mapped fields against the portal form schema.
   *
   * @param {Array<z.infer<typeof MappedPortalFieldSchema>>} mappedFields
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @returns {Promise<{ isValid: boolean, missingRequiredFields: Array<string>, errors: Array<string> }>}
   */
  async validateMappedFields(mappedFields, formSchema) {
    const missing = [];
    const errors = [];
    const fieldsById = new Map((mappedFields || []).map((f) => [f.fieldId, f]));

    for (const formField of formSchema.fields || []) {
      if (formField.required) {
        const mapped = fieldsById.get(formField.fieldId);
        if (!mapped || mapped.sanitizedValue === undefined || mapped.sanitizedValue === null || mapped.sanitizedValue === '') {
          missing.push(formField.fieldId);
        }
      }
    }

    return {
      isValid: missing.length === 0 && errors.length === 0,
      missingRequiredFields: missing,
      errors,
    };
  }

  /**
   * Executes the submission action or returns structured manual handoff.
   *
   * @param {object} context
   * @returns {Promise<z.infer<typeof PortalSubmissionResultSchema>>}
   */
  async submitOrHandoff(_context) {
    throw new Error(`submitOrHandoff() not implemented by adapter "${this.id}"`);
  }

  /**
   * Verifies submission status from confirmation page, response, or external state.
   *
   * @param {object} context
   * @returns {Promise<z.infer<typeof PortalVerificationResultSchema>>}
   */
  async verifySubmission(_context) {
    return {
      status: 'NOT_SENT',
      externalReference: null,
      verificationMethod: 'MANUAL_ATTESTATION',
      verifiedAt: new Date().toISOString(),
      details: {},
    };
  }
}
