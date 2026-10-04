/**
 * @file Base Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Provides shared, provider-neutral foundations for all provider-specific application adapters:
 * 1. Iframe discovery and safety isolation.
 * 2. Multi-step application navigation and step modeling.
 * 3. Validation error normalization.
 * 4. Submit button detection and strict submission-blocking invariants.
 * 5. GenericAutofillEngine integration without duplication.
 */

import {
  PortalAdapterContract,
  PortalFormSchema,
  FieldValidationErrorSchema,
} from './portal-adapter.contract.js';
import { genericAutofillEngine } from './generic-autofill-engine.js';
import { ValidationError } from '../../errors/index.js';

export class BasePortalAdapter extends PortalAdapterContract {
  /**
   * @param {object} identity
   */
  constructor(identity) {
    super(identity);
    this.autofillEngine = genericAutofillEngine;
  }

  /**
   * Normalizes a provider-specific field error into canonical FieldValidationError.
   *
   * @param {object} params
   * @param {string} params.fieldId
   * @param {string} [params.name]
   * @param {string} [params.rawMessage]
   * @param {string} [params.code]
   * @param {string} [params.severity]
   * @param {boolean} [params.recoverable]
   * @param {boolean} [params.requiresUserReview]
   * @returns {object}
   */
  normalizeValidationError({
    fieldId,
    name = '',
    rawMessage = '',
    code = 'VALIDATION_ERROR',
    severity = 'ERROR',
    recoverable = true,
    requiresUserReview = true,
    metadata = {},
  }) {
    if (!fieldId) {
      throw new ValidationError('fieldId is required to normalize validation error', 'MISSING_FIELD_ID');
    }

    let normalizedMessage = rawMessage || 'Field validation error';
    let normalizedCode = code;

    const lower = (rawMessage || '').toLowerCase();
    if (/required|mandatory|cannot be blank|cannot be empty/i.test(lower)) {
      normalizedCode = 'MISSING_REQUIRED_FIELD';
      normalizedMessage = 'This field is required';
    } else if (/invalid email|valid email/i.test(lower)) {
      normalizedCode = 'INVALID_EMAIL_FORMAT';
      normalizedMessage = 'Invalid email address format';
    } else if (/phone|mobile|valid phone/i.test(lower)) {
      normalizedCode = 'INVALID_PHONE_FORMAT';
      normalizedMessage = 'Invalid phone number format';
    } else if (/resume|cv|file required/i.test(lower)) {
      normalizedCode = 'RESUME_REQUIRED';
      normalizedMessage = 'Resume attachment is required';
    }

    return FieldValidationErrorSchema.parse({
      fieldId,
      name,
      message: normalizedMessage,
      code: normalizedCode,
      severity,
      recoverable,
      requiresUserReview,
      rawMessage,
      metadata,
    });
  }

  /**
   * Inspects the context/document for embedded iframe forms.
   *
   * @param {object} context DOM or Window context
   * @param {string} [iframeSelector] Optional specific iframe selector
   * @returns {object} { isIframe, isAccessible, isBlocked, status, doc, error }
   */
  locateIframe(context = {}, iframeSelector = 'iframe') {
    const rootDoc = context.doc || context.document || (typeof globalThis.document !== 'undefined' ? globalThis.document : null);
    if (!rootDoc || typeof rootDoc.querySelector !== 'function') {
      return {
        isIframe: false,
        isAccessible: true,
        isBlocked: false,
        status: 'NOT_IFRAME',
        doc: rootDoc,
      };
    }

    const iframe = rootDoc.querySelector(iframeSelector);
    if (!iframe) {
      return {
        isIframe: false,
        isAccessible: true,
        isBlocked: false,
        status: 'NOT_IFRAME',
        doc: rootDoc,
      };
    }

    // Inspect iframe accessibility
    let iframeDoc = null;
    let isBlocked = false;

    try {
      iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        // If contentDocument is explicitly null or undefined, likely cross-origin blocked
        isBlocked = true;
      }
    } catch {
      isBlocked = true;
    }

    if (isBlocked || !iframeDoc) {
      return {
        isIframe: true,
        isAccessible: false,
        isBlocked: true,
        status: 'BLOCKED',
        doc: null,
        error: 'IFRAME_BLOCKED',
        requiresUserReview: true,
      };
    }

    return {
      isIframe: true,
      isAccessible: true,
      isBlocked: false,
      status: 'ACCESSIBLE',
      doc: iframeDoc,
    };
  }

  /**
   * Detects the presence of an application submit button without triggering it.
   *
   * @param {object} doc DOM document
   * @returns {{ hasSubmitButton: boolean, selector: string|null, label: string|null }}
   */
  detectSubmitButton(doc) {
    if (!doc || typeof doc.querySelector !== 'function') {
      return { hasSubmitButton: false, selector: null, label: null };
    }

    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '[data-qa="btn-submit"]',
      '[data-automation-id="submit-button"]',
      '[data-testid="submit-button"]',
      'button.submit-button',
      'button.btn-submit',
      'form button[id*="submit"]',
      'form input[id*="submit"]',
    ];

    for (const sel of selectors) {
      const el = doc.querySelector(sel);
      if (el) {
        const label = (el.textContent || el.value || 'Submit').trim();
        return { hasSubmitButton: true, selector: sel, label };
      }
    }

    return { hasSubmitButton: false, selector: null, label: null };
  }

  /**
   * Prepares autofill planning using canonical form schema and approved application package.
   *
   * @param {object} context DOM Document or context
   * @param {object} applicationPackage Approved Canonical Application Package
   * @param {object} [options]
   * @returns {Promise<{ formSchema: object, fillPlan: object }>}
   */
  async prepareAutofill(context, applicationPackage, options = {}) {
    const formSchema = await this.extractFormSchema(context);
    const validatedSchema = PortalFormSchema.parse(formSchema);
    const fillPlan = await this.autofillEngine.planFill(validatedSchema, applicationPackage, options);
    return { formSchema: validatedSchema, fillPlan };
  }

  /**
   * Executes autofill safely using GenericAutofillEngine.
   *
   * @param {object} fillPlan
   * @param {object} context DOM Document/Window context
   * @returns {Promise<{ executionResult: object, verificationResult: object }>}
   */
  async executeAutofill(fillPlan, context = {}) {
    const executionResult = await this.autofillEngine.executeFill(fillPlan, context);
    const verificationResult = await this.autofillEngine.verifyFill(fillPlan, context);
    return { executionResult, verificationResult };
  }

  /**
   * Submits or hands off the application.
   * Strict Invariant: NEVER clicks final submit button automatically in Phase 8.4.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async submitOrHandoff(context = {}) {
    const doc = context.doc || context.document;
    const submitInfo = this.detectSubmitButton(doc);

    return {
      status: 'HANDOFF_READY',
      portalType: this.id,
      destinationUrl: context.destinationUrl || context.url || '',
      message: 'Application form filled and verified. Staged for human review prior to final submission.',
      handoffKit: {
        requiresUserApproval: true,
        submissionReady: true,
        finalSubmitBlocked: true,
        status: 'READY_FOR_REVIEW',
        submitButtonDetected: submitInfo.hasSubmitButton,
        submitButtonSelector: submitInfo.selector,
      },
      retryState: 'NOT_SENT',
      metadata: {
        adapterId: this.id,
        autoSubmitBlocked: true,
        stagedAt: new Date().toISOString(),
      },
    };
  }
}
