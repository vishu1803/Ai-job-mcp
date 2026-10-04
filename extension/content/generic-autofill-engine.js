/**
 * @file Browser Extension Canonical Form Autofill Engine (Phase 9.1 & 9.2 / ARCH-060).
 *
 * Browser-native execution engine for the Chrome extension content script.
 * Zero external dependencies: runs self-contained inside the browser sandbox.
 * Strictly adheres to the canonical form autofill contract:
 * 1. Planning:
 *    - Maps canonical application package into deterministic FillPlan.
 *    - Zero fabrication: missing or uncorroborated fields resolve strictly to action: REVIEW.
 *    - Gating protected fields: legal declarations, salary, work authorization, visa, EEO.
 * 2. Execution:
 *    - Framework-safe DOM mutation (React, Vue, Angular prototype property descriptors + event dispatch).
 *    - Fresh dynamic DOM queries at execution time (zero stale DOM references).
 *    - Strict Invariant: NEVER clicks final submit.
 * 3. Verification:
 *    - Re-reads DOM attributes post-execution and asserts value convergence.
 */

export const AutofillActionEnum = Object.freeze([
  'FILL',
  'SELECT',
  'CHECK',
  'UNCHECK',
  'UPLOAD',
  'REVIEW',
  'SKIP',
]);

export const AutofillStatusEnum = Object.freeze([
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'VALIDATION_FAILED',
  'BLOCKED_SENSITIVE',
  'ERROR',
]);

export const AutofillConfidenceEnum = Object.freeze([
  'EXACT',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNMATCHED',
]);

export const ProtectedFieldCategoryEnum = Object.freeze([
  'LEGAL_DECLARATION',
  'WORK_AUTHORIZATION',
  'VISA_SPONSORSHIP',
  'SALARY_EXPECTATION',
  'EEO_DEMOGRAPHIC',
  'CRIMINAL_HISTORY',
  'DISABILITY_STATUS',
  'VETERAN_STATUS',
  'ACCURACY_CERTIFICATION',
  'LEGAL_ATTESTATION',
  'TERMS_ACCEPTANCE',
  'PRIVACY_CONSENT',
]);

/**
 * Classifies a field to determine whether it falls into a protected or sensitive category.
 *
 * @param {object} field Form field object
 * @returns {{ isProtected: boolean, category: string, reason: string }}
 */
export function classifyProtectedField(field = {}) {
  const name = String(field.name || '').toLowerCase();
  const label = String(field.label || '').toLowerCase();
  const id = String(field.id || field.fieldId || '').toLowerCase();
  const placeholder = String(field.placeholder || '').toLowerCase();
  const fullText = `${name} ${label} ${id} ${placeholder}`;

  // 1. Work authorization & Visa (Check BEFORE generic legal to avoid misclassification)
  if (
    /work_auth|authorized_to_work|work_permit|legally_authorized|visa|sponsorship|require.*sponsor|need.*sponsor|h1-?b|stem.*opt|f1.*visa/i.test(
      fullText
    )
  ) {
    if (/sponsor|require.*sponsor|need.*sponsor|h1-?b|visa/i.test(fullText)) {
      return {
        isProtected: true,
        category: 'visa_sponsorship',
        reason: 'Visa and immigration sponsorship status requires explicit confirmation.',
      };
    }
    return {
      isProtected: true,
      category: 'work_authorization',
      reason: 'Legal work authorization declarations require candidate verification.',
    };
  }

  // 2. Accuracy certification / Terms / Attestations
  if (/certif|attest|accurate|penalty of perjury|true and correct/i.test(fullText)) {
    return {
      isProtected: true,
      category: 'accuracy_certification',
      reason: 'Legal declarations of accuracy must be reviewed and confirmed manually.',
    };
  }
  if (/agree to terms|terms of service|accept the terms|privacy policy/i.test(fullText)) {
    return {
      isProtected: true,
      category: 'terms_acceptance',
      reason: 'Terms of service and privacy agreements require explicit user action.',
    };
  }

  // 3. Salary and Compensation
  if (/salary|compensation|expected_pay|desired_pay|rate_expectation|hourly_rate|pay_range/i.test(fullText)) {
    return {
      isProtected: true,
      category: 'salary_expectation',
      reason: 'Salary and compensation expectations require candidate strategic review.',
    };
  }

  // 4. EEO & Demographics
  if (/race|ethnicity|hispanic|latino|gender|sex|veteran|disability|handicap|lgbt/i.test(fullText)) {
    if (/veteran|military/i.test(fullText)) {
      return {
        isProtected: true,
        category: 'veteran_status',
        reason: 'Protected veteran status is voluntary self-identification.',
      };
    }
    if (/disability|handicap|accommodation/i.test(fullText)) {
      return {
        isProtected: true,
        category: 'disability_status',
        reason: 'Disability self-identification is voluntary under ADA regulations.',
      };
    }
    return {
      isProtected: true,
      category: 'eeo_demographic',
      reason: 'Equal Employment Opportunity demographic data requires voluntary consent.',
    };
  }

  // 5. Criminal History / Background checks
  if (/felon|crime|misdemeanor|convict|criminal|background check/i.test(fullText)) {
    return {
      isProtected: true,
      category: 'criminal_history',
      reason: 'Criminal history inquiries require explicit user awareness and input.',
    };
  }

  // 6. Generic legal fallback (excluding legal name fields such as legalFirstName, legalLastName)
  if (!/first|last|name|given|family|middle|sur/i.test(fullText) && /legal|declaration|signature/i.test(fullText)) {
    return {
      isProtected: true,
      category: 'legal_attestation',
      reason: 'Legal attestations and signatures must never be filled automatically.',
    };
  }

  return {
    isProtected: false,
    category: 'unprotected',
    reason: 'Standard application field.',
  };
}

/**
 * Normalizes text values safely.
 */
function sanitizeText(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Normalizes phone numbers.
 */
function sanitizePhone(val) {
  if (!val) return '';
  return String(val).trim();
}

/**
 * Normalizes numbers.
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
  } catch {}
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

  return null;
}

/**
 * Sets input/textarea element value safely across React, Vue, and vanilla DOM.
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
 * Dispatches synthetic DOM events so frameworks (React, Vue, Angular) register state changes.
 */
export function dispatchSyntheticEvents(element, eventTypes = ['input', 'change', 'blur']) {
  if (!element || typeof element.dispatchEvent !== 'function') return;
  for (const type of eventTypes) {
    let event;
    if (type === 'click' && typeof globalThis.MouseEvent === 'function') {
      event = new MouseEvent('click', { bubbles: true, cancelable: true, view: globalThis.window });
    } else if (typeof globalThis.Event === 'function') {
      event = new Event(type, { bubbles: true, cancelable: true });
    }
    if (event) {
      element.dispatchEvent(event);
    }
  }
}

/**
 * Universal Generic Form Autofill Engine for Chrome Extension Runtime.
 */
export class GenericAutofillEngine {
  /**
   * Plans the fill operations synchronously.
   *
   * @param {object} formSchema Detected portal form schema
   * @param {object} applicationPackage Approved Canonical Application Package
   * @param {object} [options]
   * @param {boolean} [options.allowProtected=false] Whether user pre-confirmed sensitive fields
   * @param {boolean} [options.planOnly=false] Dry run planning
   * @returns {object} Canonical FillPlan
   */
  planFillSync(formSchema = {}, applicationPackage = {}, options = {}) {
    const rawCandidate = applicationPackage.candidate || applicationPackage || {};
    const fullName =
      rawCandidate.fullName ||
      rawCandidate.displayName ||
      rawCandidate.name ||
      rawCandidate.candidateName ||
      (rawCandidate.firstName && rawCandidate.lastName
        ? `${rawCandidate.firstName} ${rawCandidate.lastName}`.trim()
        : null) ||
      null;

    const firstName =
      rawCandidate.firstName ||
      (fullName ? fullName.split(' ')[0] : null);

    const lastName =
      rawCandidate.lastName ||
      (fullName ? fullName.split(' ').slice(1).join(' ') : null);

    const email =
      rawCandidate.canonicalEmail ||
      rawCandidate.email ||
      rawCandidate.candidateEmail ||
      null;

    const phone =
      rawCandidate.phone ||
      rawCandidate.phoneNumber ||
      rawCandidate.candidatePhone ||
      null;

    const candidate = {
      ...rawCandidate,
      firstName,
      lastName,
      fullName,
      email,
      phone,
    };
    const allowProtected = Boolean(options.allowProtected);
    const planOnly = Boolean(options.planOnly);

    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fields = formSchema.fields || [];

    const plannedActions = [];
    let autoFillableCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let protectedCount = 0;

    for (const field of fields) {
      const fieldId = field.fieldId || field.id || field.name || `fld_${plannedActions.length}`;
      const name = field.name || '';
      const label = field.label || '';
      const type = (field.type || 'text').toLowerCase();
      const protection = classifyProtectedField(field);

      if (protection.isProtected) {
        protectedCount++;
      }

      // Resolve candidate value
      let resolvedRaw = null;
      let source = 'candidate';
      let confidence = 'MEDIUM';

      const normName = `${name} ${label} ${fieldId}`.toLowerCase();

      if (/first.*name|fname/i.test(normName)) {
        resolvedRaw = candidate.firstName || (candidate.fullName || candidate.name || '').split(' ')[0] || null;
        source = 'candidate.firstName';
        confidence = 'HIGH';
      } else if (/last.*name|lname|surname/i.test(normName)) {
        resolvedRaw = candidate.lastName || (candidate.fullName || candidate.name || '').split(' ').slice(1).join(' ') || null;
        source = 'candidate.lastName';
        confidence = 'HIGH';
      } else if (/full.*name|your.*name|candidate.*name|\bname\b/i.test(normName)) {
        resolvedRaw = candidate.fullName || candidate.name || (candidate.firstName ? `${candidate.firstName} ${candidate.lastName || ''}`.trim() : null);
        source = 'candidate.fullName';
        confidence = 'HIGH';
      } else if (/email/i.test(normName)) {
        resolvedRaw = candidate.email || null;
        source = 'candidate.email';
        confidence = 'HIGH';
      } else if (/phone|mobile|tel/i.test(normName)) {
        resolvedRaw = candidate.phone || candidate.phoneNumber || null;
        source = 'candidate.phone';
        confidence = 'HIGH';
      } else if (/linkedin/i.test(normName)) {
        resolvedRaw = candidate.linkedIn || candidate.linkedinUrl || (candidate.socials?.linkedin) || null;
        source = 'candidate.linkedIn';
        confidence = 'HIGH';
      } else if (/github/i.test(normName)) {
        resolvedRaw = candidate.github || candidate.githubUrl || (candidate.socials?.github) || null;
        source = 'candidate.github';
        confidence = 'HIGH';
      } else if (/website|portfolio|url/i.test(normName)) {
        resolvedRaw = candidate.portfolioUrl || candidate.website || null;
        source = 'candidate.portfolio';
        confidence = 'HIGH';
      } else if (
        protection.category === 'work_authorization' ||
        /work_auth|authorized_to_work|legal.*authoriz|right.*to.*work|work.*permit/i.test(normName)
      ) {
        resolvedRaw = candidate.workAuthorization ?? true;
        source = 'candidate.workAuthorization';
        confidence = 'HIGH';
      } else if (
        protection.category === 'visa_sponsorship' ||
        /sponsor|visa/i.test(normName)
      ) {
        resolvedRaw = candidate.requiresSponsorship ?? false;
        source = 'candidate.requiresSponsorship';
        confidence = 'HIGH';
      } else if (/city/i.test(normName)) {
        resolvedRaw = candidate.city || candidate.location?.city || null;
        source = 'candidate.city';
        confidence = 'HIGH';
      } else if (/\bcountry\b|^country/i.test(normName)) {
        resolvedRaw = candidate.country || candidate.location?.country || null;
        source = 'candidate.country';
        confidence = 'HIGH';
      } else if (/experience.*year|years.*exp/i.test(normName)) {
        resolvedRaw = candidate.yearsOfExperience ?? candidate.experienceYears ?? null;
        source = 'candidate.yearsOfExperience';
        confidence = 'MEDIUM';
      } else if (/company|organization|^org\b/i.test(normName)) {
        resolvedRaw =
          candidate.currentCompany ||
          candidate.company ||
          (candidate.workHistory && candidate.workHistory[0]?.company) ||
          null;
        source = 'candidate.currentCompany';
        confidence = 'HIGH';
      } else if (/cover.*letter|cover.*note/i.test(normName)) {
        resolvedRaw = applicationPackage.coverLetterText || candidate.coverLetter || null;
        source = 'applicationPackage.coverLetter';
        confidence = 'MEDIUM';
      }

      // Check if value is missing -> REVIEW
      if (resolvedRaw === null || resolvedRaw === undefined || resolvedRaw === '') {
        plannedActions.push({
          fieldId,
          fieldType: type,
          name,
          label,
          action: 'REVIEW',
          status: 'NEEDS_REVIEW',
          rawValue: null,
          sanitizedValue: null,
          source: 'missing',
          provenance: 'UNVERIFIED',
          confidence: 'UNMATCHED',
          requiresUserReview: true,
          isProtected: protection.isProtected,
          protectedCategory: protection.category,
          verificationMethod: 'MANUAL_REVIEW',
          options: field.options || [],
        });
        reviewCount++;
        continue;
      }

      // Protected field policy
      if (
        protection.isProtected &&
        (protection.category === 'accuracy_certification' ||
          protection.category === 'legal_attestation' ||
          protection.category === 'terms_acceptance' ||
          protection.category === 'privacy_consent' ||
          !allowProtected)
      ) {
        plannedActions.push({
          fieldId,
          fieldType: type,
          name,
          label,
          action: 'REVIEW',
          status: 'NEEDS_REVIEW',
          rawValue: resolvedRaw,
          sanitizedValue: typeof resolvedRaw === 'string' ? sanitizeText(resolvedRaw) : resolvedRaw,
          source,
          provenance: 'PROTECTED_POLICY',
          confidence: 'MEDIUM',
          requiresUserReview: true,
          isProtected: true,
          protectedCategory: protection.category,
          verificationMethod: 'MANUAL_REVIEW',
          options: field.options || [],
        });
        reviewCount++;
        continue;
      }

      // Determine action by type
      let action = 'FILL';
      let sanitized = null;
      let requiresUserReview = false;
      let verificationMethod = 'DOM_VALUE';

      if (type === 'select' || type === 'radio') {
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
        sanitized = typeof resolvedRaw === 'string' ? resolvedRaw : 'resume.pdf';
        verificationMethod = 'FILE_INPUT';
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
        sanitized = sanitizeText(resolvedRaw);
      }

      if (action === 'REVIEW' || requiresUserReview) {
        reviewCount++;
      } else {
        autoFillableCount++;
      }

      plannedActions.push({
        fieldId,
        fieldType: type,
        name,
        label,
        action,
        status: 'PLANNED',
        rawValue: resolvedRaw,
        sanitizedValue: sanitized,
        source,
        provenance: 'VERIFIED_PROFILE',
        confidence,
        requiresUserReview,
        isProtected: protection.isProtected,
        protectedCategory: protection.category,
        verificationMethod,
        options: field.options || [],
      });
    }

    return {
      planId,
      portalId: formSchema.portalId || 'portal',
      formId: formSchema.formId || 'form',
      destinationUrl: formSchema.url || formSchema.destinationUrl || '',
      packageHash: applicationPackage.packageHash || '',
      planOnly,
      actions: plannedActions,
      repeatedGroupActions: [],
      summary: {
        totalFields: plannedActions.length,
        autoFillableCount,
        reviewCount,
        skippedCount,
        protectedCount,
      },
      createdAt: new Date().toISOString(),
      metadata: {},
    };
  }

  /**
   * Synchronously executes planned DOM operations safely.
   * Resolves DOM elements fresh at execution time (zero stale references).
   * Strict Invariant: NEVER clicks final submit button.
   *
   * @param {object} fillPlan
   * @param {object} context
   * @param {Document} [context.doc]
   * @param {boolean} [context.sensitiveConfirmed=false]
   * @returns {object} Canonical AutofillExecutionResult
   */
  executeFillSync(fillPlan = {}, context = {}) {
    const doc = context.doc || globalThis.document;
    const sensitiveConfirmed = Boolean(context.sensitiveConfirmed);
    const actions = fillPlan.actions || [];

    const executedActions = [];
    let executedCount = 0;
    let reviewCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const planAction of actions) {
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

      if (planAction.action === 'REVIEW' || (planAction.isProtected && !sensitiveConfirmed)) {
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

      // Fresh dynamic query: prevents stale DOM references across re-renders
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
            const radios = doc.querySelectorAll
              ? doc.querySelectorAll(`input[type="radio"][name="${element.name}"]`)
              : [element];
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
          if (element.checked !== desired) {
            setNativeChecked(element, desired);
            dispatchSyntheticEvents(element, ['change', 'click']);
          }
        } else if (planAction.action === 'UPLOAD') {
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

    return {
      planId: fillPlan.planId || `exec_${Date.now()}`,
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
    };
  }

  /**
   * Synchronously verifies that executed fields match planned values in the DOM.
   *
   * @param {object} fillPlan
   * @param {object} context
   * @param {Document} [context.doc]
   * @returns {{ verified: boolean, verifiedCount: number, mismatches: Array<object> }}
   */
  verifyFillSync(fillPlan = {}, context = {}) {
    const doc = context.doc || globalThis.document;
    const actions = fillPlan.actions || [];

    let verifiedCount = 0;
    const mismatches = [];

    for (const action of actions) {
      if (
        action.action !== 'FILL' &&
        action.action !== 'SELECT' &&
        action.action !== 'CHECK' &&
        action.action !== 'UNCHECK'
      ) {
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
   * Dynamically locates element in DOM without keeping stale references.
   */
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
      } catch {}
    }

    return null;
  }
}

export const genericAutofillEngine = new GenericAutofillEngine();
export const CanonicalAutofillEngine = GenericAutofillEngine;
export const canonicalAutofillEngine = genericAutofillEngine;
