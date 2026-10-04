/**
 * @file Ashby Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for Ashby (jobs.ashbyhq.com):
 * - Detection via hostnames (jobs.ashbyhq.com) and DOM markers ([data-ashby-application-form], [data-testid="ashby-apply-form"]).
 * - Canonical form extraction: React-controlled inputs, personal data, resume file uploads, custom questions.
 * - Multi-step transition support and sensitive field protection.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class AshbyPortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'ashby-portal-adapter',
      name: 'Ashby Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['ashby', 'ashbyhq.com', 'jobs.ashbyhq.com'],
      priority: 25,
      capabilities: {
        jobDetection: true,
        formExtraction: true,
        fieldMapping: true,
        automatedSubmission: false,
        submissionVerification: true,
      },
    });
  }

  /**
   * Deterministic detection for Ashby portal destinations.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url) {
      const lower = url.toLowerCase();
      if (lower.includes('jobs.ashbyhq.com') || lower.includes('ashbyhq.com') || lower.includes('/ashby/')) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('[data-ashby-application-form]') ||
        doc.querySelector('[data-testid="ashby-apply-form"]') ||
        doc.querySelector('.ashby-application-form') ||
        doc.querySelector('form[action*="ashby"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from Ashby DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    const doc = context.doc || context.document;
    const destinationUrl = context.destinationUrl || context.url || 'https://jobs.ashbyhq.com/company/job/apply';
    const formId = 'ashby-application-form';

    const fields = [];
    const attachments = [];
    const repeatedGroups = [];
    let isMultiStep = false;
    const steps = [];

    const addField = ({ name, id, label, type, required = false, isSensitive = false, customQuestion = false, options = [] }) => {
      const fieldId = generateDeterministicFieldId({ formId, name, id, label, type, position: fields.length });
      fields.push(
        PortalFieldSchema.parse({
          fieldId,
          name,
          label,
          type,
          required,
          options,
          source: 'ASHBY_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
          metadata: {
            isSensitive,
            ashbyTestId: id,
          },
        })
      );
      return fieldId;
    };

    if (doc && typeof doc.querySelector === 'function') {
      // 1. Core candidate fields (Ashby uses React-controlled name/email/phone)
      const nameEl = doc.querySelector('input[name="name"], [data-testid="field-name"], input[name="fullName"]');
      if (nameEl) {
        addField({ name: 'name', id: 'name', label: 'Full Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('input[name="email"], [data-testid="field-email"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('input[name="phoneNumber"], [data-testid="field-phone"], input[name="phone"]');
      if (phoneEl) {
        addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
      }

      // 2. Attachments
      const resumeEl = doc.querySelector('#resume, input[name*="resume"], input[type="file"][name*="resume"], [data-testid="resume-upload"]');
      if (resumeEl) {
        const fieldId = addField({ name: 'resume', id: 'resume', label: 'Resume', type: 'file', required: true });
        attachments.push(
          PortalAttachmentFieldSchema.parse({
            fieldId,
            name: 'resume',
            label: 'Resume',
            required: true,
            accept: '.pdf,.doc,.docx',
            maxSizeMb: 10,
          })
        );
      }

      // 3. Social & Portfolio Links
      const linkedinEl = doc.querySelector('input[name*="linkedin"], [data-testid="field-linkedin"]');
      if (linkedinEl) {
        addField({ name: 'linkedin', id: 'linkedin', label: 'LinkedIn', type: 'url', required: false });
      }

      const githubEl = doc.querySelector('input[name*="github"], [data-testid="field-github"]');
      if (githubEl) {
        addField({ name: 'github', id: 'github', label: 'GitHub', type: 'url', required: false });
      }

      // 4. Custom questions
      const customEls = doc.querySelectorAll ? doc.querySelectorAll('[data-testid^="custom-field-"], [name^="field-"]') : [];
      for (const cEl of customEls) {
        const cName = cEl.name || cEl.getAttribute('data-testid') || '';
        const cLabel = (cEl.getAttribute('aria-label') || cEl.placeholder || cName).trim();
        const isAuth = /authorization|visa|sponsor|salary/i.test(cName + ' ' + cLabel);
        addField({
          name: cName,
          id: cEl.id || cName,
          label: cLabel,
          type: (cEl.tagName || '').toLowerCase() === 'select' ? 'select' : 'text',
          required: Boolean(cEl.required),
          isSensitive: isAuth,
          customQuestion: true,
        });
      }

      // 5. Multi-step detection
      const stepIndicator = doc.querySelector('[data-testid="application-step-indicator"], [data-step]');
      if (stepIndicator) {
        isMultiStep = true;
        steps.push('step_basic_info', 'step_questions', 'step_review');
      }
    } else {
      // Default canonical Ashby structure
      addField({ name: 'name', id: 'name', label: 'Full Name', type: 'text', required: true });
      addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });

      const resId = addField({ name: 'resume', id: 'resume', label: 'Resume', type: 'file', required: true });
      attachments.push(
        PortalAttachmentFieldSchema.parse({
          fieldId: resId,
          name: 'resume',
          label: 'Resume',
          required: true,
          accept: '.pdf,.doc,.docx',
          maxSizeMb: 10,
        })
      );

      addField({ name: 'linkedin', id: 'linkedin', label: 'LinkedIn', type: 'url', required: false });
      addField({ name: 'github', id: 'github', label: 'GitHub', type: 'url', required: false });
    }

    return PortalFormSchema.parse({
      portalId: 'ashby',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'ashby',
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
