/**
 * @file SmartRecruiters Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for SmartRecruiters (jobs.smartrecruiters.com):
 * - Detection via hostnames (jobs.smartrecruiters.com) and DOM markers ([data-qa="smartr-application-form"]).
 * - Canonical form extraction: personal info, resume upload, experience/education repeated groups, screening questions.
 * - Sensitive disclosures and authorization questions protection.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  PortalRepeatedGroupSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class SmartRecruitersPortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'smartrecruiters-portal-adapter',
      name: 'SmartRecruiters Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['smartrecruiters', 'smartrecruiters.com', 'jobs.smartrecruiters.com'],
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
   * Deterministic detection for SmartRecruiters portal destinations.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url) {
      const lower = url.toLowerCase();
      if (lower.includes('smartrecruiters.com') || lower.includes('/smartrecruiters/')) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('[data-qa="smartr-application-form"]') ||
        doc.querySelector('form[action*="smartrecruiters.com"]') ||
        doc.querySelector('[data-qa="apply-button"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from SmartRecruiters DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    const doc = context.doc || context.document;
    const destinationUrl = context.destinationUrl || context.url || 'https://jobs.smartrecruiters.com/company/job/apply';
    const formId = 'smartrecruiters-application-form';

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
          source: 'SMARTRECRUITERS_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
          metadata: {
            isSensitive,
            smartrId: id,
          },
        })
      );
      return fieldId;
    };

    if (doc && typeof doc.querySelector === 'function') {
      // 1. Personal Details
      const firstNameEl = doc.querySelector('input[name="firstName"], [data-qa="first-name-input"]');
      if (firstNameEl) {
        addField({ name: 'firstName', id: 'firstName', label: 'First Name', type: 'text', required: true });
      }

      const lastNameEl = doc.querySelector('input[name="lastName"], [data-qa="last-name-input"]');
      if (lastNameEl) {
        addField({ name: 'lastName', id: 'lastName', label: 'Last Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('input[name="email"], [data-qa="email-input"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('input[name="phoneNumber"], [data-qa="phone-number-input"]');
      if (phoneEl) {
        addField({ name: 'phoneNumber', id: 'phoneNumber', label: 'Phone Number', type: 'tel', required: false });
      }

      // 2. Attachments
      const resumeEl = doc.querySelector('[data-qa="resume-upload"], input[type="file"][name*="resume"]');
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

      // 3. Repeated groups: Experience & Education
      const expContainer = doc.querySelector('[data-qa="experience-section"]');
      if (expContainer) {
        repeatedGroups.push(
          PortalRepeatedGroupSchema.parse({
            groupId: 'experience',
            label: 'Experience',
            minItems: 0,
            maxItems: 10,
            fields: [
              PortalFieldSchema.parse({ fieldId: 'sr_title', name: 'title', label: 'Title', type: 'text', required: true, source: 'SMARTRECRUITERS_DOM' }),
              PortalFieldSchema.parse({ fieldId: 'sr_company', name: 'company', label: 'Company', type: 'text', required: true, source: 'SMARTRECRUITERS_DOM' }),
            ],
          })
        );
      }

      // 4. Screening & Sensitive Questions
      const questionEls = doc.querySelectorAll ? doc.querySelectorAll('.screening-question, [data-qa^="question-"]') : [];
      for (const qEl of questionEls) {
        const qName = qEl.name || qEl.getAttribute('data-qa') || '';
        const qLabel = (qEl.getAttribute('aria-label') || qEl.placeholder || qName).trim();
        const isSensitive = /authorization|visa|sponsor|salary|veteran|disability/i.test(qName + ' ' + qLabel);
        addField({
          name: qName,
          id: qEl.id || qName,
          label: qLabel,
          type: (qEl.tagName || '').toLowerCase() === 'select' ? 'select' : 'text',
          required: Boolean(qEl.required),
          isSensitive,
          customQuestion: true,
        });
      }

      // 5. Multi-step detection
      const stepEl = doc.querySelector('[data-qa="steps-navigation"], .smartr-steps');
      if (stepEl) {
        isMultiStep = true;
        steps.push('step_personal', 'step_experience', 'step_questions', 'step_review');
      }
    } else {
      // Default canonical SmartRecruiters structure
      addField({ name: 'firstName', id: 'firstName', label: 'First Name', type: 'text', required: true });
      addField({ name: 'lastName', id: 'lastName', label: 'Last Name', type: 'text', required: true });
      addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      addField({ name: 'phoneNumber', id: 'phoneNumber', label: 'Phone Number', type: 'tel', required: false });

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
    }

    return PortalFormSchema.parse({
      portalId: 'smartrecruiters',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'smartrecruiters',
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
