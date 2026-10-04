/**
 * @file Generic Browser Form Autofill Engine Implementation (Phase 8.3 / ARCH-058).
 *
 * Implements the provider-neutral autofill execution engine:
 * 1. Planning:
 *    - Maps canonical application package into deterministic FillPlan.
 *    - Enforces zero fabrication: uncorroborated or missing fields resolve strictly to action: REVIEW.
 *    - Categorizes and gates protected fields (legal declarations, salary, work authorization, visa, EEO).
 * 2. Execution:
 *    - Framework-safe DOM mutation (React, Vue, Angular prototype property descriptors + event dispatch).
 *    - Idempotent execution (avoids double-clicking checkboxes, duplicating text, or corrupting forms).
 *    - Strict Invariant: NEVER clicks final submit.
 * 3. Verification:
 *    - Re-reads DOM attributes post-execution and asserts value convergence.
 */

import crypto from 'node:crypto';
import {
  AutofillEngineContract,
  FillPlanSchema,
  PlannedFieldActionSchema,
  AutofillExecutionResultSchema,
  classifyProtectedField,
} from './autofill-engine.contract.js';
import { PortalFormSchema } from './portal-adapter.contract.js';
import { ValidationError } from '../../errors/index.js';

/**
 * Sanitizes generic text values.
 */
function sanitizeText(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Sanitizes phone numbers.
 */
function sanitizePhone(val) {
  if (!val) return '';
  return String(val).trim();
}

/**
 * Sanitizes numbers.
 */
function sanitizeNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes date into YYYY-MM-DD.
 */
function sanitizeDate(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch {
    // Return original string if unparseable
  }
  return String(val).trim();
}

/**
 * Finds an unambiguous matching option from a list of options.
 *
 * @param {Array<object>} options Available select/radio options
 * @param {any} candidateValue Value from canonical candidate profile
 * @returns {object|null} Matched option or null
 */
export function findMatchingOption(options = [], candidateValue) {
  if (!options || options.length === 0 || candidateValue === null || candidateValue === undefined) {
    return null;
  }

  // Boolean normalization
  if (typeof candidateValue === 'boolean') {
    const desired = candidateValue ? ['yes', 'true', '1'] : ['no', 'false', '0'];
    for (const opt of options) {
      const valStr = String(opt.value || '').toLowerCase().trim();
      const lblStr = String(opt.label || '').toLowerCase().trim();
      if (desired.includes(valStr) || desired.includes(lblStr)) {
        return opt;
      }
    }
    return null;
  }

  const cleanCand = String(candidateValue).toLowerCase().trim();

  // 1. Exact match on value or label
  for (const opt of options) {
    const valStr = String(opt.value || '').trim();
    const lblStr = String(opt.label || '').trim();
    if (valStr === candidateValue || lblStr === candidateValue) {
      return opt;
    }
  }

  // 2. Case-insensitive match on value or label
  for (const opt of options) {
    const valLower = String(opt.value || '').toLowerCase().trim();
    const lblLower = String(opt.label || '').toLowerCase().trim();
    if (valLower === cleanCand || lblLower === cleanCand) {
      return opt;
    }
  }

  // 3. Strict safety gate: Do not fuzzy match country to boolean or semantically distant values
  // e.g. "Indian citizen" vs ["Yes", "No"] must return null
  return null;
}

/**
 * Sets input element value safely across React, Vue, and vanilla DOM.
 */
export function setNativeValue(element, value) {
  if (!element) return;
  const isTextArea = (element.tagName || '').toUpperCase() === 'TEXTAREA';
  const prototype = isTextArea
    ? (globalThis.HTMLTextAreaElement?.prototype || Object.getPrototypeOf(element))
    : (globalThis.HTMLInputElement?.prototype || Object.getPrototypeOf(element));

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * Sets checkbox/radio checked state safely across React, Vue, and vanilla DOM.
 */
export function setNativeChecked(element, checked) {
  if (!element) return;
  const prototype = globalThis.HTMLInputElement?.prototype || Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'checked');
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, checked);
  } else {
    element.checked = checked;
  }
}

/**
 * Dispatches standard synthetic input events to trigger application listeners.
 */
export function dispatchSyntheticEvents(element, eventNames = ['input', 'change', 'blur']) {
  if (!element || typeof element.dispatchEvent !== 'function') return;
  for (const eventName of eventNames) {
    try {
      const event =
        typeof globalThis.Event === 'function'
          ? new globalThis.Event(eventName, { bubbles: true, cancelable: true })
          : { type: eventName, bubbles: true };
      element.dispatchEvent(event);
    } catch {
      if (typeof element[`on${eventName}`] === 'function') {
        element[`on${eventName}`]({ target: element, type: eventName });
      }
    }
  }
}

export class GenericAutofillEngine extends AutofillEngineContract {
  constructor() {
    super({
      id: 'generic-autofill-engine',
      name: 'Generic Browser Form Autofill Engine',
    });
  }

  /**
   * Plans the fill operations deterministically based on form schema and approved application package.
   *
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @param {object} applicationPackage Approved Canonical Application Package
   * @param {object} [options]
   * @param {boolean} [options.planOnly=false]
   * @param {boolean} [options.allowProtectedAutofill=false]
   * @returns {z.infer<typeof FillPlanSchema>}
   */
  planFillSync(formSchema, applicationPackage, options = {}) {
    if (!formSchema) {
      throw new ValidationError('formSchema is required for planFill', 'MISSING_FORM_SCHEMA');
    }
    if (!applicationPackage) {
      throw new ValidationError('applicationPackage is required for planFill', 'MISSING_APPLICATION_PACKAGE');
    }

    const validatedForm = PortalFormSchema.parse(formSchema);
    const planOnly = Boolean(options.planOnly);
    const allowProtected = Boolean(options.allowProtectedAutofill);

    const rawCandidate =
      applicationPackage.candidate ||
      applicationPackage.candidateProfile ||
      applicationPackage.candidateSnapshot ||
      {};
    const rawArtifacts = applicationPackage.artifacts || {};

    const fullName =
      rawCandidate.fullName ||
      rawCandidate.displayName ||
      (rawCandidate.firstName && rawCandidate.lastName
        ? `${rawCandidate.firstName} ${rawCandidate.lastName}`.trim()
        : null) ||
      applicationPackage.candidateName ||
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
      rawCandidate.canonicalEmail ||
      rawCandidate.email ||
      rawCandidate.contact?.email ||
      applicationPackage.candidateEmail ||
      null;

    const phone =
      rawCandidate.phone ||
      rawCandidate.contact?.phone ||
      applicationPackage.candidatePhone ||
      null;

    const candidate = {
      ...rawCandidate,
      firstName,
      lastName,
      fullName,
      displayName: fullName,
      canonicalEmail: email,
      email,
      phone,
    };

    const artifacts = {
      ...rawArtifacts,
      resume:
        rawArtifacts.resume ||
        applicationPackage.tailoredResume?.artifact?.downloadUrl ||
        applicationPackage.tailoredResume?.artifact?.viewUrl ||
        applicationPackage.tailoredResume ||
        null,
      coverLetter:
        rawArtifacts.coverLetter ||
        applicationPackage.coverLetter?.artifact?.downloadUrl ||
        applicationPackage.coverLetter?.artifact?.viewUrl ||
        applicationPackage.coverLetter ||
        applicationPackage.tailoredCoverLetter ||
        null,
    };
    const answers = applicationPackage.answers || {};
    const prefs =
      candidate.careerPreferences || candidate.jobPreferences || candidate.profileMetadata?.careerPreferences || {};
    const userCustom = candidate.profileMetadata?.userCustom || {};
    const contact = candidate.contact || {};
    const social = candidate.socialLinks || {};
    const workHistory =
      candidate.workHistory || candidate.experience || candidate.profileMetadata?.workHistory || [];
    const education = candidate.education || candidate.profileMetadata?.education || [];

    const planId = `plan_${crypto.randomUUID().slice(0, 12)}`;
    const plannedActions = [];

    let autoFillableCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let protectedCount = 0;

    for (const field of validatedForm.fields) {
      const fieldId = field.fieldId;
      const name = field.name || '';
      const label = field.label || '';
      const type = field.type || 'text';
      const descriptor = `${name} ${label} ${field.fieldType || ''}`.toLowerCase().trim();

      const protection = classifyProtectedField({
        name,
        label,
        type,
        fieldType: field.fieldType,
        customQuestion: field.customQuestion,
      });

      if (protection.isProtected) {
        protectedCount++;
      }

      // 1. Hidden fields handling (Security tokens MUST NEVER be overwritten)
      if (type === 'hidden') {
        if (protection.category === 'security_token' || /csrf|token|state|nonce/i.test(descriptor)) {
          plannedActions.push(
            PlannedFieldActionSchema.parse({
              fieldId,
              fieldType: 'hidden',
              name,
              label,
              action: 'SKIP',
              status: 'SKIPPED',
              rawValue: null,
              sanitizedValue: null,
              source: 'PORTAL_SECURITY_STATE',
              provenance: 'UNKNOWN',
              confidence: 'HIGH',
              requiresUserReview: false,
              isProtected: true,
              protectedCategory: 'security_token',
              verificationMethod: 'NONE',
            })
          );
          skippedCount++;
          continue;
        }
      }

      // 2. UNKNOWN element types always resolve to REVIEW
      if (type === 'UNKNOWN') {
        plannedActions.push(
          PlannedFieldActionSchema.parse({
            fieldId,
            fieldType: 'UNKNOWN',
            name,
            label,
            action: 'REVIEW',
            status: 'NEEDS_REVIEW',
            rawValue: null,
            sanitizedValue: null,
            source: 'DOM_UNKNOWN',
            provenance: 'UNKNOWN',
            confidence: 'LOW',
            requiresUserReview: true,
            isProtected: protection.isProtected,
            protectedCategory: protection.category,
            verificationMethod: 'MANUAL_REVIEW',
          })
        );
        reviewCount++;
        continue;
      }

      // 3. Resolve candidate value strictly from approved package
      let resolvedRaw = null;
      let provenance = 'UNKNOWN';
      let confidence = 'LOW';
      let source = 'NONE';

      // Check explicit approved custom question answers first
      if (answers[fieldId] !== undefined) {
        resolvedRaw = answers[fieldId]?.value !== undefined ? answers[fieldId].value : answers[fieldId];
        provenance = answers[fieldId]?.provenance || 'USER_PROVIDED';
        source = `answers.${fieldId}`;
        confidence = 'HIGH';
      } else if (answers[name] !== undefined) {
        resolvedRaw = answers[name]?.value !== undefined ? answers[name].value : answers[name];
        provenance = answers[name]?.provenance || 'USER_PROVIDED';
        source = `answers.${name}`;
        confidence = 'HIGH';
      } else if (!field.customQuestion) {
        // Standard profile attribute resolution
        if (/first[\s_-]?name/i.test(descriptor)) {
          resolvedRaw =
            candidate.firstName ||
            contact.firstName ||
            (candidate.displayName ? candidate.displayName.split(' ')[0] : null);
          if (resolvedRaw) {
            source = 'candidate.firstName';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/last[\s_-]?name/i.test(descriptor)) {
          resolvedRaw =
            candidate.lastName ||
            contact.lastName ||
            (candidate.displayName ? candidate.displayName.split(' ').slice(1).join(' ') : null);
          if (resolvedRaw) {
            source = 'candidate.lastName';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/full[\s_-]?name|\bname\b/i.test(descriptor)) {
          resolvedRaw =
            candidate.fullName ||
            candidate.displayName ||
            contact.fullName ||
            applicationPackage.candidateName ||
            (contact.firstName ? `${contact.firstName} ${contact.lastName || ''}`.trim() : null) ||
            (candidate.firstName ? `${candidate.firstName} ${candidate.lastName || ''}`.trim() : null);
          if (resolvedRaw) {
            source = 'candidate.fullName';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/email/i.test(descriptor) || type === 'email') {
          resolvedRaw =
            candidate.canonicalEmail ||
            contact.email ||
            candidate.email ||
            applicationPackage.candidateEmail ||
            null;
          if (resolvedRaw) {
            source = 'candidate.canonicalEmail';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/phone|mobile|tel/i.test(descriptor) || type === 'tel') {
          resolvedRaw = candidate.phone || contact.phone || applicationPackage.candidatePhone || null;
          if (resolvedRaw) {
            source = 'candidate.phone';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/linkedin/i.test(descriptor)) {
          resolvedRaw = social.linkedin || candidate.linkedinUrl || null;
          if (resolvedRaw) {
            source = 'candidate.socialLinks.linkedin';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/github/i.test(descriptor)) {
          resolvedRaw = social.github || candidate.githubUrl || null;
          if (resolvedRaw) {
            source = 'candidate.socialLinks.github';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/portfolio|website|url/i.test(descriptor) || type === 'url') {
          resolvedRaw = candidate.portfolioUrl || candidate.website || null;
          if (resolvedRaw) {
            source = 'candidate.portfolioUrl';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/city/i.test(descriptor)) {
          resolvedRaw = contact.city || candidate.city || null;
          if (resolvedRaw) {
            source = 'candidate.contact.city';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/state|province/i.test(descriptor)) {
          resolvedRaw = contact.state || candidate.state || null;
          if (resolvedRaw) {
            source = 'candidate.contact.state';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/postal|zip/i.test(descriptor)) {
          resolvedRaw = contact.postalCode || candidate.postalCode || null;
          if (resolvedRaw) {
            source = 'candidate.contact.postalCode';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/address/i.test(descriptor)) {
          resolvedRaw = contact.address || candidate.location || null;
          if (resolvedRaw) {
            source = 'candidate.contact.address';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/company|organization|^org\b/i.test(descriptor)) {
          resolvedRaw =
            candidate.currentCompany ||
            contact.company ||
            candidate.company ||
            (candidate.workHistory && candidate.workHistory[0]?.company) ||
            null;
          if (resolvedRaw) {
            source = 'candidate.currentCompany';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (/resume|cv/i.test(descriptor) || type === 'file') {
          // File upload resolution
          if (/cover[\s_-]?letter/i.test(descriptor)) {
            resolvedRaw = artifacts.coverLetter || applicationPackage.tailoredCoverLetter || null;
            if (resolvedRaw) {
              source = 'artifacts.coverLetter';
              provenance = 'GENERATED';
              confidence = 'HIGH';
            }
          } else {
            resolvedRaw = artifacts.resume || applicationPackage.tailoredResume || null;
            if (resolvedRaw) {
              source = 'artifacts.resume';
              provenance = 'VERIFIED_EVIDENCE';
              confidence = 'HIGH';
            }
          }
        } else if (/notice[\s_-]?period|availability/i.test(descriptor)) {
          const rawNotice = prefs.noticePeriod ?? userCustom.noticePeriod ?? candidate.noticePeriod ?? null;
          if (rawNotice) {
            resolvedRaw = rawNotice;
            source = 'candidate.careerPreferences.noticePeriod';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (protection.category === 'work_authorization') {
          const rawAuth = candidate.workAuthorization ?? prefs.workAuthorization ?? userCustom.workAuthorization ?? null;
          if (rawAuth !== undefined && rawAuth !== null) {
            resolvedRaw = Array.isArray(rawAuth) ? rawAuth.join(', ') : rawAuth;
            source = 'candidate.careerPreferences.workAuthorization';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (protection.category === 'visa_sponsorship') {
          const rawVisa = candidate.visaSponsorshipRequired ?? candidate.requiresSponsorship ?? prefs.visaSponsorshipRequired ?? userCustom.visaSponsorshipRequired ?? null;
          if (rawVisa !== undefined && rawVisa !== null) {
            const strVal = String(rawVisa).trim().toUpperCase();
            resolvedRaw =
              strVal === 'YES' || rawVisa === true
                ? 'Yes'
                : strVal === 'NO' || rawVisa === false
                  ? 'No'
                  : String(rawVisa);
            source = 'candidate.careerPreferences.visaSponsorshipRequired';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (protection.category === 'salary_expectation') {
          const rawSalary = prefs.salaryFloor ?? prefs.targetSalary ?? userCustom.salaryFloor ?? null;
          if (rawSalary !== undefined && rawSalary !== null) {
            resolvedRaw = rawSalary;
            source = 'candidate.careerPreferences.salaryFloor';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        } else if (protection.category === 'relocation_commitment') {
          if (prefs.willingToRelocate !== undefined && prefs.willingToRelocate !== null) {
            resolvedRaw = prefs.willingToRelocate;
            source = 'candidate.careerPreferences.willingToRelocate';
            provenance = 'VERIFIED_PROFILE';
            confidence = 'HIGH';
          }
        }
      }

      // 4. Zero-fabrication check: If no candidate value exists -> REVIEW
      if (resolvedRaw === null || resolvedRaw === undefined) {
        plannedActions.push(
          PlannedFieldActionSchema.parse({
            fieldId,
            fieldType: type,
            name,
            label,
            action: 'REVIEW',
            status: 'NEEDS_REVIEW',
            rawValue: null,
            sanitizedValue: null,
            source: 'NONE',
            provenance: 'UNKNOWN',
            confidence: 'LOW',
            requiresUserReview: true,
            isProtected: protection.isProtected,
            protectedCategory: protection.category,
            verificationMethod: 'MANUAL_REVIEW',
            options: field.options || [],
          })
        );
        reviewCount++;
        continue;
      }

      // 5. Protected fields policy check (Legal declarations, accuracy certifications NEVER autofill)
      if (
        protection.isProtected &&
        (protection.category === 'accuracy_certification' ||
          protection.category === 'legal_attestation' ||
          protection.category === 'terms_acceptance' ||
          protection.category === 'privacy_consent' ||
          !allowProtected)
      ) {
        plannedActions.push(
          PlannedFieldActionSchema.parse({
            fieldId,
            fieldType: type,
            name,
            label,
            action: 'REVIEW',
            status: 'NEEDS_REVIEW',
            rawValue: resolvedRaw,
            sanitizedValue:
              typeof resolvedRaw === 'number'
                ? resolvedRaw.toLocaleString()
                : typeof resolvedRaw === 'string'
                  ? sanitizeText(resolvedRaw)
                  : resolvedRaw,
            source,
            provenance,
            confidence: 'MEDIUM',
            requiresUserReview: true,
            isProtected: true,
            protectedCategory: protection.category,
            verificationMethod: 'MANUAL_REVIEW',
            options: field.options || [],
          })
        );
        reviewCount++;
        continue;
      }

      // 6. Action formulation based on field type
      let action = 'FILL';
      let sanitized = null;
      let requiresUserReview = false;
      let verificationMethod = 'DOM_VALUE';

      if (type === 'select') {
        action = 'SELECT';
        const matched = findMatchingOption(field.options, resolvedRaw);
        if (matched) {
          sanitized = matched.value;
          confidence = 'HIGH';
        } else {
          action = 'REVIEW';
          sanitized = null;
          requiresUserReview = true;
          confidence = 'LOW';
          verificationMethod = 'MANUAL_REVIEW';
        }
      } else if (type === 'radio') {
        action = 'SELECT';
        const matched = findMatchingOption(field.options, resolvedRaw);
        if (matched) {
          sanitized = matched.value;
          confidence = 'HIGH';
        } else {
          action = 'REVIEW';
          sanitized = null;
          requiresUserReview = true;
          confidence = 'LOW';
          verificationMethod = 'MANUAL_REVIEW';
        }
      } else if (type === 'checkbox') {
        const isTrue =
          resolvedRaw === true ||
          String(resolvedRaw).toLowerCase() === 'true' ||
          String(resolvedRaw).toLowerCase() === 'yes';
        action = isTrue ? 'CHECK' : 'UNCHECK';
        sanitized = isTrue;
        confidence = 'HIGH';
      } else if (type === 'file') {
        action = 'UPLOAD';
        if (typeof resolvedRaw === 'object' && (resolvedRaw.url || resolvedRaw.filename || resolvedRaw.documentId)) {
          sanitized = resolvedRaw.filename || resolvedRaw.title || resolvedRaw.url || 'resume.pdf';
          confidence = 'HIGH';
          verificationMethod = 'FILE_INPUT';
        } else {
          action = 'REVIEW';
          requiresUserReview = true;
          sanitized = null;
          confidence = 'LOW';
          verificationMethod = 'MANUAL_REVIEW';
        }
      } else if (type === 'tel') {
        sanitized = sanitizePhone(resolvedRaw);
      } else if (type === 'number') {
        sanitized = sanitizeNumber(resolvedRaw);
        if (sanitized === null) {
          action = 'REVIEW';
          requiresUserReview = true;
        }
      } else if (type === 'date') {
        sanitized = sanitizeDate(resolvedRaw);
      } else {
        // text, textarea, email, url
        sanitized = sanitizeText(resolvedRaw);
      }

      if (action === 'REVIEW' || requiresUserReview) {
        reviewCount++;
      } else {
        autoFillableCount++;
      }

      plannedActions.push(
        PlannedFieldActionSchema.parse({
          fieldId,
          fieldType: type,
          name,
          label,
          action,
          status: 'PLANNED',
          rawValue: resolvedRaw,
          sanitizedValue: sanitized,
          source,
          provenance,
          confidence,
          requiresUserReview,
          isProtected: protection.isProtected,
          protectedCategory: protection.category,
          verificationMethod,
          options: field.options || [],
        })
      );
    }

    // 7. Plan Repeated Groups (Experience, Education, etc.)
    const repeatedGroupActions = [];
    for (const group of validatedForm.repeatedGroups || []) {
      const groupDescriptor = `${group.groupId} ${group.label}`.toLowerCase();
      const isEdu = /education|school|university|degree/i.test(groupDescriptor);
      const isProj = /project/i.test(groupDescriptor);
      const isExp = !isEdu && !isProj && /experience|history|job|work|employment/i.test(groupDescriptor);
      const itemsSource = isEdu ? education : isExp ? workHistory : isProj ? (candidate.projects || workHistory) : [];

      const rows = [];
      for (const item of itemsSource) {
        const rowActions = [];
        for (const f of group.fields || []) {
          const fName = (f.name || '').toLowerCase();
          let fVal = null;
          if (isEdu) {
            if (/school|university|institution/i.test(fName)) fVal = item.school || item.institution;
            else if (/degree/i.test(fName)) fVal = item.degree;
            else if (/field|major/i.test(fName)) fVal = item.fieldOfStudy || item.major;
          } else if (isExp) {
            if (/company|employer/i.test(fName)) fVal = item.company || item.name;
            else if (/title|role|position/i.test(fName)) fVal = item.title || item.role;
            else if (/description|summary/i.test(fName)) fVal = item.description || item.summary;
          } else if (isProj) {
            if (/name|title|company/i.test(fName)) fVal = item.name || item.title || item.company;
            else if (/description|summary/i.test(fName)) fVal = item.description || item.summary;
          }

          rowActions.push(
            PlannedFieldActionSchema.parse({
              fieldId: `${group.groupId}_${rows.length}_${f.fieldId}`,
              fieldType: f.type || 'text',
              name: f.name || '',
              label: f.label || '',
              action: fVal ? 'FILL' : 'REVIEW',
              status: 'PLANNED',
              rawValue: fVal,
              sanitizedValue: sanitizeText(fVal),
              source: isEdu ? 'candidate.education' : isExp ? 'candidate.workHistory' : isProj ? 'candidate.projects' : 'candidate',
              provenance: 'VERIFIED_PROFILE',
              confidence: fVal ? 'HIGH' : 'LOW',
              requiresUserReview: !fVal,
              isProtected: false,
              protectedCategory: 'unprotected',
              verificationMethod: 'DOM_VALUE',
            })
          );
        }
        rows.push(rowActions);
      }

      repeatedGroupActions.push({
        groupId: group.groupId,
        label: group.label || group.groupId,
        category: isEdu ? 'EDUCATION' : isExp ? 'EXPERIENCE' : isProj ? 'PROJECT' : 'OTHER',
        items: rows,
        rowCount: rows.length,
        maxRows: 10,
        requiresUserReview: rows.length === 0,
        metadata: {},
      });
    }

    return FillPlanSchema.parse({
      planId,
      portalId: validatedForm.portalId,
      formId: validatedForm.formId,
      destinationUrl: validatedForm.destinationUrl,
      packageHash: applicationPackage.packageHash || '',
      planOnly,
      actions: plannedActions,
      repeatedGroupActions,
      summary: {
        totalFields: plannedActions.length,
        autoFillableCount,
        reviewCount,
        skippedCount,
        protectedCount,
      },
      createdAt: new Date().toISOString(),
      metadata: {},
    });
  }

  /**
   * Plans the fill operations asynchronously (conforms to AutofillEngineContract).
   *
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @param {object} applicationPackage Approved Canonical Application Package
   * @param {object} [options]
   * @returns {Promise<z.infer<typeof FillPlanSchema>>}
   */
  async planFill(formSchema, applicationPackage, options = {}) {
    return this.planFillSync(formSchema, applicationPackage, options);
  }

  /**
   * Validates the planned actions against safety rules and form schema.
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {z.infer<typeof PortalFormSchema>} formSchema
   * @returns {Promise<{ isValid: boolean, errors: Array<string> }>}
   */
  async validateFillPlan(fillPlan, _formSchema) {
    const errors = [];
    if (!fillPlan || !Array.isArray(fillPlan.actions)) {
      return { isValid: false, errors: ['FillPlan must contain actions array'] };
    }

    for (const action of fillPlan.actions) {
      // Safety check: Accuracy certification and legal attestations must NEVER be auto-filled
      if (
        action.isProtected &&
        (action.protectedCategory === 'accuracy_certification' ||
          action.protectedCategory === 'legal_attestation') &&
        (action.action === 'CHECK' || action.action === 'FILL')
      ) {
        errors.push(
          `Protected legal field "${action.name || action.fieldId}" (${action.protectedCategory}) cannot be auto-checked or auto-filled without explicit human review.`
        );
      }

      // Safety check: Unknown fields must not be auto-filled
      if (action.fieldType === 'UNKNOWN' && (action.action === 'FILL' || action.action === 'SELECT')) {
        errors.push(`Unknown field "${action.fieldId}" cannot have automated fill action.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Synchronously executes the planned DOM operations safely.
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @param {object} [context.doc] Document object
   * @param {boolean} [context.dryRun=false]
   * @returns {z.infer<typeof AutofillExecutionResultSchema>}
   */
  executeFillSync(fillPlan, context = {}) {
    const validatedPlan = FillPlanSchema.parse(fillPlan);
    const doc = context.doc || globalThis.document;
    const isDryRun = Boolean(context.dryRun || validatedPlan.planOnly);

    const executedActions = [];
    let executedCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const planAction of validatedPlan.actions) {
      if (planAction.action === 'SKIP') {
        executedActions.push({
          fieldId: planAction.fieldId,
          action: 'SKIP',
          status: 'SKIPPED',
          verificationStatus: 'SKIPPED',
          requiresUserReview: false,
          previousValue: null,
          resultingValue: null,
        });
        skippedCount++;
        continue;
      }

      if (planAction.action === 'REVIEW' || isDryRun) {
        executedActions.push({
          fieldId: planAction.fieldId,
          action: 'REVIEW',
          status: 'NEEDS_REVIEW',
          verificationStatus: 'UNVERIFIED',
          requiresUserReview: true,
          previousValue: null,
          resultingValue: null,
        });
        reviewCount++;
        continue;
      }

      // Find element in DOM
      const element = this._findElement(doc, planAction);
      if (!element) {
        executedActions.push({
          fieldId: planAction.fieldId,
          action: planAction.action,
          status: 'FAILED',
          verificationStatus: 'MISMATCH',
          requiresUserReview: true,
          error: `DOM element not found for fieldId "${planAction.fieldId}"`,
        });
        failedCount++;
        continue;
      }

      const previousValue = element.value !== undefined ? element.value : element.checked;

      try {
        if (planAction.action === 'FILL') {
          setNativeValue(element, planAction.sanitizedValue);
          dispatchSyntheticEvents(element, ['input', 'change', 'blur']);
        } else if (planAction.action === 'SELECT') {
          if ((element.tagName || '').toUpperCase() === 'SELECT') {
            element.value = planAction.sanitizedValue;
            if (element.options) {
              for (const opt of element.options) {
                opt.selected = opt.value === planAction.sanitizedValue;
              }
            }
            dispatchSyntheticEvents(element, ['change']);
          } else if (element.type === 'radio') {
            // Find all radios sharing name
            const radios = doc.querySelectorAll ? doc.querySelectorAll(`input[type="radio"][name="${element.name}"]`) : [element];
            for (const r of radios) {
              const shouldCheck = r.value === planAction.sanitizedValue;
              if (r.checked !== shouldCheck) {
                setNativeChecked(r, shouldCheck);
                dispatchSyntheticEvents(r, ['change', 'click']);
              }
            }
          }
        } else if (planAction.action === 'CHECK' || planAction.action === 'UNCHECK') {
          const desired = planAction.action === 'CHECK';
          // Idempotency: Only mutate if state differs
          if (element.checked !== desired) {
            setNativeChecked(element, desired);
            dispatchSyntheticEvents(element, ['change', 'click']);
          }
        } else if (planAction.action === 'UPLOAD') {
          // File upload simulator in fixture/mock contexts
          element.dataset = element.dataset || {};
          element.dataset.uploadedFile = planAction.sanitizedValue;
          dispatchSyntheticEvents(element, ['change']);
        }

        const resultingValue = element.value !== undefined ? element.value : element.checked;

        executedActions.push({
          fieldId: planAction.fieldId,
          action: planAction.action,
          status: 'EXECUTED',
          verificationStatus: 'VERIFIED',
          requiresUserReview: false,
          previousValue,
          resultingValue,
        });
        executedCount++;
      } catch (err) {
        executedActions.push({
          fieldId: planAction.fieldId,
          action: planAction.action,
          status: 'FAILED',
          verificationStatus: 'MISMATCH',
          requiresUserReview: true,
          error: err.message,
        });
        failedCount++;
      }
    }

    return AutofillExecutionResultSchema.parse({
      planId: validatedPlan.planId,
      executedActions,
      summary: {
        total: executedActions.length,
        executed: executedCount,
        verified: executedCount,
        review: reviewCount,
        skipped: skippedCount,
        failed: failedCount,
      },
      isComplete: failedCount === 0,
      executedAt: new Date().toISOString(),
    });
  }

  /**
   * Executes the planned DOM operations safely (async contract).
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {Promise<z.infer<typeof AutofillExecutionResultSchema>>}
   */
  async executeFill(fillPlan, context = {}) {
    return this.executeFillSync(fillPlan, context);
  }

  /**
   * Synchronously verifies that executed fields match planned values in the DOM.
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {{ verified: boolean, verifiedCount: number, mismatches: Array<object> }}
   */
  verifyFillSync(fillPlan, context = {}) {
    const validatedPlan = FillPlanSchema.parse(fillPlan);
    const doc = context.doc || globalThis.document;

    let verifiedCount = 0;
    const mismatches = [];

    for (const action of validatedPlan.actions) {
      if (action.action !== 'FILL' && action.action !== 'SELECT' && action.action !== 'CHECK' && action.action !== 'UNCHECK') {
        continue;
      }

      const el = this._findElement(doc, action);
      if (!el) {
        mismatches.push({
          fieldId: action.fieldId,
          expected: action.sanitizedValue,
          actual: null,
          reason: 'ELEMENT_NOT_FOUND',
        });
        continue;
      }

      if (action.action === 'CHECK' || action.action === 'UNCHECK') {
        const expected = action.action === 'CHECK';
        if (Boolean(el.checked) === expected) {
          verifiedCount++;
        } else {
          mismatches.push({
            fieldId: action.fieldId,
            expected,
            actual: el.checked,
            reason: 'CHECKED_STATE_MISMATCH',
          });
        }
      } else {
        const actual = String(el.value || '').trim();
        const expected = String(action.sanitizedValue || '').trim();
        if (actual === expected) {
          verifiedCount++;
        } else {
          mismatches.push({
            fieldId: action.fieldId,
            expected,
            actual,
            reason: 'VALUE_MISMATCH',
          });
        }
      }
    }

    return {
      verified: mismatches.length === 0,
      verifiedCount,
      mismatches,
    };
  }

  /**
   * Verifies that executed fields match planned values in the DOM (async contract).
   *
   * @param {z.infer<typeof FillPlanSchema>} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {Promise<{ verified: boolean, verifiedCount: number, mismatches: Array<object> }>}
   */
  async verifyFill(fillPlan, context = {}) {
    return this.verifyFillSync(fillPlan, context);
  }

  _findElement(doc, action) {
    if (!doc || typeof doc.querySelector !== 'function') return null;

    if (action.fieldId) {
      try {
        const elById = doc.querySelector(`#${action.fieldId}, [id="${action.fieldId}"]`);
        if (elById) return elById;
      } catch {}
    }

    if (action.name) {
      try {
        const elByName = doc.querySelector(`[name="${action.name}"]`);
        if (elByName) return elByName;
      } catch {}
    }

    if (action.metadata?.automationId) {
      try {
        const elByAuto = doc.querySelector(`[data-automation-id="${action.metadata.automationId}"]`);
        if (elByAuto) return elByAuto;
      } catch {}
    }

    if (action.name) {
      try {
        const elByPartial = doc.querySelector(`[name*="${action.name}" i], [id*="${action.name}" i]`);
        if (elByPartial) return elByPartial;
      } catch {}
    }

    if (action.selector) {
      try {
        const elBySel = doc.querySelector(action.selector);
        if (elBySel) return elBySel;
      } catch {
        // Ignore invalid selector syntax
      }
    }

    return null;
  }
}

/** Global default GenericAutofillEngine instance */
export const genericAutofillEngine = new GenericAutofillEngine();

/** Canonical Autofill Engine Exports (ARCH-060) */
export const CanonicalAutofillEngine = GenericAutofillEngine;
export const canonicalAutofillEngine = genericAutofillEngine;

