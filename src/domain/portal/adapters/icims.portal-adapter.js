/**
 * @file iCIMS Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for iCIMS (icims.com):
 * - Detection via hostnames (*.icims.com) and DOM/iframe markers (iframe#icims_content_iframe, .iCIMS_JobContent).
 * - Iframe boundary discovery: resolves scoped document if accessible; handles cross-origin blocked frames safely.
 * - Form extraction: candidate fields, file uploads, unknown dynamic widgets, screening questions.
 * - Sensitive disclosures protection.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class IcimsPortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'icims-portal-adapter',
      name: 'iCIMS Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['icims', 'icims.com'],
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
   * Deterministic detection for iCIMS portal destinations.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url) {
      const lower = url.toLowerCase();
      if (lower.includes('icims.com') || lower.includes('/icims/')) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('#icims_content_iframe') ||
        doc.querySelector('iframe#icims_content_iframe') ||
        doc.querySelector('.iCIMS_JobContent') ||
        doc.querySelector('form#iCIMS_form') ||
        doc.querySelector('[data-icims-form]') ||
        doc.querySelector('table.iCIMS_JobHeaderTable')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from iCIMS DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    // iCIMS commonly uses an iframe container: iframe#icims_content_iframe
    const iframeResult = this.locateIframe(context, 'iframe#icims_content_iframe, iframe.iCIMS_iframe');
    const doc = iframeResult.isAccessible && iframeResult.doc ? iframeResult.doc : (context.doc || context.document);
    const destinationUrl = context.destinationUrl || context.url || 'https://careers-company.icims.com/jobs/1000/apply';
    const formId = 'icims-application-form';

    const fields = [];
    const attachments = [];
    const repeatedGroups = [];
    const isMultiStep = false;
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
          source: 'ICIMS_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN' || iframeResult.isBlocked,
          metadata: {
            isSensitive,
            icimsId: id,
          },
        })
      );
      return fieldId;
    };

    if (iframeResult.isBlocked) {
      // Graceful blocked iframe handling: preserve unknown field so user can manually review
      addField({
        name: 'icims_frame_blocked',
        id: 'icims_frame_blocked',
        label: 'iCIMS Application Frame (Cross-Origin Blocked)',
        type: 'UNKNOWN',
        required: true,
        isSensitive: false,
        customQuestion: false,
      });
    } else if (doc && typeof doc.querySelector === 'function') {
      // 1. Personal details inside iCIMS document
      const firstNameEl = doc.querySelector('#firstName, input[name="firstName"], input[id*="FirstName"]');
      if (firstNameEl) {
        addField({ name: 'firstName', id: 'firstName', label: 'First Name', type: 'text', required: true });
      }

      const lastNameEl = doc.querySelector('#lastName, input[name="lastName"], input[id*="LastName"]');
      if (lastNameEl) {
        addField({ name: 'lastName', id: 'lastName', label: 'Last Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('#email, input[name="email"], input[type="email"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('#phone, input[name="phone"], input[type="tel"]');
      if (phoneEl) {
        addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
      }

      // 2. Attachments
      const resumeEl = doc.querySelector('#resume, input[type="file"], [data-qa="resume"]');
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

      // 3. Custom Questions & Dynamic blocks
      const questionBlocks = doc.querySelectorAll ? doc.querySelectorAll('.iCIMS_QuestionBlock, .question-row') : [];
      for (const qEl of questionBlocks) {
        const input = qEl.querySelector('input, select, textarea');
        if (input) {
          const qName = input.name || input.id || 'question';
          const qLabel = (qEl.textContent || qName).trim().slice(0, 100);
          const isSensitive = /authorization|visa|sponsor|salary|veteran|disability/i.test(qName + ' ' + qLabel);
          addField({
            name: qName,
            id: input.id || qName,
            label: qLabel,
            type: (input.tagName || '').toLowerCase() === 'select' ? 'select' : 'text',
            required: Boolean(input.required),
            isSensitive,
            customQuestion: true,
          });
        }
      }

      // 4. Nonstandard / Unknown widgets
      const unknownWidgets = doc.querySelectorAll ? doc.querySelectorAll('[data-custom-widget], .icims-special-widget') : [];
      for (const uEl of unknownWidgets) {
        const uId = uEl.id || 'unknown_widget';
        addField({
          name: uId,
          id: uId,
          label: 'Custom iCIMS Widget',
          type: 'UNKNOWN',
          required: false,
          isSensitive: false,
          customQuestion: false,
        });
      }
    } else {
      // Default canonical iCIMS structure
      addField({ name: 'firstName', id: 'firstName', label: 'First Name', type: 'text', required: true });
      addField({ name: 'lastName', id: 'lastName', label: 'Last Name', type: 'text', required: true });
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
    }

    return PortalFormSchema.parse({
      portalId: 'icims',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'icims',
        isIframe: iframeResult.isIframe,
        iframeStatus: iframeResult.status,
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
