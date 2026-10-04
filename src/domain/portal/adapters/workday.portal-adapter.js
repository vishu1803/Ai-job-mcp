/**
 * @file Workday Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for Workday (myworkdayjobs.com):
 * - Detection via hostnames (*.myworkdayjobs.com, workday.com) and semantic automation markers ([data-automation-id]).
 * - Multi-step application architecture:
 *   1. My Information
 *   2. My Experience
 *   3. Application Questions
 *   4. Voluntary Disclosures
 *   5. Review
 * - Repeated groups for Work Experience and Education.
 * - Sensitive disclosures & legal attestations protection.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  PortalRepeatedGroupSchema,
  ApplicationStepSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class WorkdayPortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'workday-portal-adapter',
      name: 'Workday Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['workday', 'myworkdayjobs.com', 'workday.com'],
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
   * Deterministic detection for Workday portal destinations.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url) {
      const lower = url.toLowerCase();
      if (
        lower.includes('myworkdayjobs.com') ||
        lower.includes('workday.com') ||
        lower.includes('.wd1.') ||
        lower.includes('.wd5.') ||
        lower.includes('/workday/')
      ) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('[data-automation-id="workday-application"]') ||
        doc.querySelector('[data-automation-id="applyForm"]') ||
        doc.querySelector('[data-automation-id="legalNameSection_firstName"]') ||
        doc.querySelector('[data-automation-id="compositeHeader"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from Workday DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    // Support iframe detection in Workday setups
    const iframeResult = this.locateIframe(context, 'iframe[id*="workday"], iframe[data-automation-id*="frame"]');
    const doc = iframeResult.isAccessible && iframeResult.doc ? iframeResult.doc : (context.doc || context.document);
    const destinationUrl = context.destinationUrl || context.url || 'https://company.myworkdayjobs.com/apply';
    const formId = 'workday-application-form';

    const fields = [];
    const attachments = [];
    const repeatedGroups = [];
    const isMultiStep = true;
    const steps = [
      'step_my_information',
      'step_my_experience',
      'step_application_questions',
      'step_voluntary_disclosures',
      'step_review',
    ];

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
          source: 'WORKDAY_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
          metadata: {
            isSensitive,
            automationId: id,
          },
        })
      );
      return fieldId;
    };

    if (doc && typeof doc.querySelector === 'function') {
      // 1. Personal Information (Step 1)
      const firstNameEl = doc.querySelector('[data-automation-id="legalNameSection_firstName"], input[name="firstName"]');
      if (firstNameEl) {
        addField({ name: 'firstName', id: 'legalNameSection_firstName', label: 'First Name', type: 'text', required: true });
      }

      const lastNameEl = doc.querySelector('[data-automation-id="legalNameSection_lastName"], input[name="lastName"]');
      if (lastNameEl) {
        addField({ name: 'lastName', id: 'legalNameSection_lastName', label: 'Last Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('[data-automation-id="email"], input[type="email"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email Address', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('[data-automation-id="phone-number"], input[type="tel"]');
      if (phoneEl) {
        addField({ name: 'phone', id: 'phone-number', label: 'Phone Number', type: 'tel', required: false });
      }

      // Address fields
      const addressEl = doc.querySelector('[data-automation-id="addressSection_addressLine1"]');
      if (addressEl) {
        addField({ name: 'address', id: 'addressSection_addressLine1', label: 'Address Line 1', type: 'text', required: false });
      }

      const cityEl = doc.querySelector('[data-automation-id="addressSection_city"]');
      if (cityEl) {
        addField({ name: 'city', id: 'addressSection_city', label: 'City', type: 'text', required: false });
      }

      // 2. Attachments (Resume)
      const resumeEl = doc.querySelector('[data-automation-id="file-upload-drop-zone"], input[type="file"]');
      if (resumeEl) {
        const fieldId = addField({ name: 'resume', id: 'file-upload-drop-zone', label: 'Resume', type: 'file', required: true });
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

      // 3. Repeated groups: Experience & Education (Step 2)
      const expSection = doc.querySelector('[data-automation-id="workExperienceSection"]');
      if (expSection) {
        repeatedGroups.push(
          PortalRepeatedGroupSchema.parse({
            groupId: 'experience',
            label: 'Work Experience',
            minItems: 0,
            maxItems: 10,
            fields: [
              PortalFieldSchema.parse({ fieldId: 'wd_job_title', name: 'jobTitle', label: 'Job Title', type: 'text', required: true, source: 'WORKDAY_DOM' }),
              PortalFieldSchema.parse({ fieldId: 'wd_company', name: 'company', label: 'Company', type: 'text', required: true, source: 'WORKDAY_DOM' }),
              PortalFieldSchema.parse({ fieldId: 'wd_location', name: 'location', label: 'Location', type: 'text', required: false, source: 'WORKDAY_DOM' }),
            ],
          })
        );
      }

      const eduSection = doc.querySelector('[data-automation-id="educationSection"]');
      if (eduSection) {
        repeatedGroups.push(
          PortalRepeatedGroupSchema.parse({
            groupId: 'education',
            label: 'Education',
            minItems: 0,
            maxItems: 5,
            fields: [
              PortalFieldSchema.parse({ fieldId: 'wd_school', name: 'school', label: 'School or University', type: 'text', required: true, source: 'WORKDAY_DOM' }),
              PortalFieldSchema.parse({ fieldId: 'wd_degree', name: 'degree', label: 'Degree', type: 'text', required: false, source: 'WORKDAY_DOM' }),
            ],
          })
        );
      }

      // 4. Questions & Disclosures (Steps 3 & 4)
      const authQuestion = doc.querySelector('[data-automation-id="workAuthorizationQuestion"]');
      if (authQuestion) {
        addField({ name: 'work_authorization', id: 'workAuthorizationQuestion', label: 'Are you legally authorized to work?', type: 'select', required: true, isSensitive: true, customQuestion: true });
      }

      const disabQuestion = doc.querySelector('[data-automation-id="disabilitySection"]');
      if (disabQuestion) {
        addField({ name: 'disability', id: 'disabilitySection', label: 'Voluntary Self-Identification of Disability', type: 'select', required: false, isSensitive: true, customQuestion: true });
      }

      const vetQuestion = doc.querySelector('[data-automation-id="veteranSection"]');
      if (vetQuestion) {
        addField({ name: 'veteran', id: 'veteranSection', label: 'Veteran Status', type: 'select', required: false, isSensitive: true, customQuestion: true });
      }
    } else {
      // Default canonical Workday structure
      addField({ name: 'firstName', id: 'legalNameSection_firstName', label: 'First Name', type: 'text', required: true });
      addField({ name: 'lastName', id: 'legalNameSection_lastName', label: 'Last Name', type: 'text', required: true });
      addField({ name: 'email', id: 'email', label: 'Email Address', type: 'email', required: true });
      addField({ name: 'phone', id: 'phone-number', label: 'Phone Number', type: 'tel', required: false });

      const resId = addField({ name: 'resume', id: 'file-upload-drop-zone', label: 'Resume', type: 'file', required: true });
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

      // Sensitive fields default protected
      addField({ name: 'work_authorization', id: 'workAuthorizationQuestion', label: 'Work Authorization', type: 'select', required: true, isSensitive: true, customQuestion: true });
      addField({ name: 'disability', id: 'disabilitySection', label: 'Disability Status', type: 'select', required: false, isSensitive: true, customQuestion: true });
      addField({ name: 'veteran', id: 'veteranSection', label: 'Veteran Status', type: 'select', required: false, isSensitive: true, customQuestion: true });
    }

    return PortalFormSchema.parse({
      portalId: 'workday',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'workday',
        isIframe: iframeResult.isIframe,
        iframeStatus: iframeResult.status,
        extractedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Returns formal multi-step navigation plan for Workday.
   *
   * @param {object} context
   * @returns {Array<object>}
   */
  getSteps(_context = {}) {
    return [
      ApplicationStepSchema.parse({
        stepId: 'step_my_information',
        order: 1,
        name: 'My Information',
        navigation: { hasNext: true, hasPrevious: false, isFinalStep: false, nextSelector: '[data-automation-id="bottom-navigation-next-button"]' },
        completionState: 'NOT_STARTED',
        requiresReview: false,
      }),
      ApplicationStepSchema.parse({
        stepId: 'step_my_experience',
        order: 2,
        name: 'My Experience',
        navigation: { hasNext: true, hasPrevious: true, isFinalStep: false, nextSelector: '[data-automation-id="bottom-navigation-next-button"]', prevSelector: '[data-automation-id="bottom-navigation-back-button"]' },
        completionState: 'NOT_STARTED',
        requiresReview: false,
      }),
      ApplicationStepSchema.parse({
        stepId: 'step_application_questions',
        order: 3,
        name: 'Application Questions',
        navigation: { hasNext: true, hasPrevious: true, isFinalStep: false, nextSelector: '[data-automation-id="bottom-navigation-next-button"]', prevSelector: '[data-automation-id="bottom-navigation-back-button"]' },
        completionState: 'NOT_STARTED',
        requiresReview: true,
      }),
      ApplicationStepSchema.parse({
        stepId: 'step_voluntary_disclosures',
        order: 4,
        name: 'Voluntary Disclosures',
        navigation: { hasNext: true, hasPrevious: true, isFinalStep: false, nextSelector: '[data-automation-id="bottom-navigation-next-button"]', prevSelector: '[data-automation-id="bottom-navigation-back-button"]' },
        completionState: 'NOT_STARTED',
        requiresReview: true,
      }),
      ApplicationStepSchema.parse({
        stepId: 'step_review',
        order: 5,
        name: 'Review',
        navigation: { hasNext: false, hasPrevious: true, isFinalStep: true, prevSelector: '[data-automation-id="bottom-navigation-back-button"]', submitSelector: '[data-automation-id="bottom-navigation-submit-button"]' },
        completionState: 'NOT_STARTED',
        requiresReview: true,
      }),
    ];
  }
}
