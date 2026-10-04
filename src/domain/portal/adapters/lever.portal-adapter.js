/**
 * @file Lever Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for Lever (jobs.lever.co):
 * - Detection via hostnames (jobs.lever.co) and DOM markers (.application-form, form#application-form).
 * - Canonical form extraction: name, email, phone, current company, resume, URL links, custom cards.
 * - Sensitive question protection and zero fabrication.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class LeverPortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'lever-portal-adapter',
      name: 'Lever Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['lever', 'lever.co', 'jobs.lever.co'],
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
   * Deterministic detection for Lever portal destinations.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url) {
      const lower = url.toLowerCase();
      if (lower.includes('lever.co') || lower.includes('/lever/')) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('.application-form') ||
        doc.querySelector('#application-form') ||
        doc.querySelector('form#application-form') ||
        doc.querySelector('form[action*="lever.co"]') ||
        doc.querySelector('[data-qa="btn-apply"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from Lever DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    const doc = context.doc || context.document;
    const destinationUrl = context.destinationUrl || context.url || 'https://jobs.lever.co/company/job/apply';
    const formId = 'lever-application-form';

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
          source: 'LEVER_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
          metadata: {
            isSensitive,
            leverName: name,
          },
        })
      );
      return fieldId;
    };

    if (doc && typeof doc.querySelector === 'function') {
      // 1. Candidate core details
      const nameEl = doc.querySelector('input[name="name"]');
      if (nameEl) {
        addField({ name: 'name', id: 'name', label: 'Full Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('input[name="email"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('input[name="phone"]');
      if (phoneEl) {
        addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
      }

      const orgEl = doc.querySelector('input[name="org"]');
      if (orgEl) {
        addField({ name: 'org', id: 'org', label: 'Current Company', type: 'text', required: false });
      }

      // 2. Attachments
      const resumeEl = doc.querySelector('input[name="resume"], [data-qa="resume-upload"]');
      if (resumeEl) {
        const fieldId = addField({ name: 'resume', id: 'resume', label: 'Resume/CV', type: 'file', required: true });
        attachments.push(
          PortalAttachmentFieldSchema.parse({
            fieldId,
            name: 'resume',
            label: 'Resume/CV',
            required: true,
            accept: '.pdf,.doc,.docx',
            maxSizeMb: 10,
          })
        );
      }

      // 3. Social and Portfolio Links
      const linkedinEl = doc.querySelector('input[name="urls[LinkedIn]"], #urls_linkedin, [name*="LinkedIn"], [name*="linkedin"]');
      if (linkedinEl) {
        addField({ name: 'urls[LinkedIn]', id: 'urls_linkedin', label: 'LinkedIn URL', type: 'url', required: false });
      }

      const githubEl = doc.querySelector('input[name="urls[GitHub]"], #urls_github, [name*="GitHub"], [name*="github"]');
      if (githubEl) {
        addField({ name: 'urls[GitHub]', id: 'urls_github', label: 'GitHub URL', type: 'url', required: false });
      }

      const portfolioEl = doc.querySelector('input[name="urls[Portfolio]"], #urls_portfolio, [name*="Portfolio"], [name*="portfolio"]');
      if (portfolioEl) {
        addField({ name: 'urls[Portfolio]', id: 'urls_portfolio', label: 'Portfolio URL', type: 'url', required: false });
      }

      const otherUrlEl = doc.querySelector('input[name="urls[Other]"]');
      if (otherUrlEl) {
        addField({ name: 'urls[Other]', id: 'urls_other', label: 'Other URL', type: 'url', required: false });
      }

      // 4. Custom Cards & Screening Questions
      const cardEls = doc.querySelectorAll ? doc.querySelectorAll('.application-question, [name^="cards["]') : [];
      for (const cardEl of cardEls) {
        const cName = cardEl.name || cardEl.id || '';
        const cLabel = (cardEl.getAttribute('aria-label') || cardEl.placeholder || cName).trim();
        const isSensitive = /authorization|visa|sponsor|salary|veteran|disability|gender/i.test(cName + ' ' + cLabel);
        addField({
          name: cName,
          id: cardEl.id || cName,
          label: cLabel,
          type: (cardEl.tagName || '').toLowerCase() === 'select' ? 'select' : 'text',
          required: Boolean(cardEl.required),
          isSensitive,
          customQuestion: true,
        });
      }

      // 5. Multi-step detection
      const multiStepIndicator = doc.querySelector('.lever-steps, [data-step-nav]');
      if (multiStepIndicator) {
        isMultiStep = true;
        steps.push('step_application', 'step_confirmation');
      }
    } else {
      // Default canonical Lever structure
      addField({ name: 'name', id: 'name', label: 'Full Name', type: 'text', required: true });
      addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
      addField({ name: 'org', id: 'org', label: 'Current Company', type: 'text', required: false });

      const resId = addField({ name: 'resume', id: 'resume', label: 'Resume/CV', type: 'file', required: true });
      attachments.push(
        PortalAttachmentFieldSchema.parse({
          fieldId: resId,
          name: 'resume',
          label: 'Resume/CV',
          required: true,
          accept: '.pdf,.doc,.docx',
          maxSizeMb: 10,
        })
      );

      addField({ name: 'urls[LinkedIn]', id: 'urls_linkedin', label: 'LinkedIn URL', type: 'url', required: false });
      addField({ name: 'urls[GitHub]', id: 'urls_github', label: 'GitHub URL', type: 'url', required: false });
      addField({ name: 'urls[Portfolio]', id: 'urls_portfolio', label: 'Portfolio URL', type: 'url', required: false });
    }

    return PortalFormSchema.parse({
      portalId: 'lever',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'lever',
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
