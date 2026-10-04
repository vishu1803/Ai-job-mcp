/**
 * @file Greenhouse Portal Application Adapter (Phase 8.4 / ARCH-059).
 *
 * Implements canonical application portal adaptation for Greenhouse (boards.greenhouse.io):
 * - Detection via hostnames (boards.greenhouse.io, grnh.se, etc.) and DOM markers (#application_form, form#new_applicant).
 * - Canonical form extraction: personal details, resume/cover letter, education/experience repeated groups, custom questions.
 * - Sensitive & legal protections (EEO, demographic, work authorization, legal certifications).
 * - Multi-step application modeling and step progression.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  PortalRepeatedGroupSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class GreenhousePortalAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'greenhouse-portal-adapter',
      name: 'Greenhouse Portal Application Adapter',
      version: '1.0.0',
      supportedPortals: ['greenhouse', 'greenhouse.io', 'boards.greenhouse.io', 'grnh.se'],
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
   * Deterministic detection for Greenhouse portal destinations.
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
        lower.includes('boards.greenhouse.io') ||
        lower.includes('job-boards.greenhouse.io') ||
        lower.includes('grnh.se') ||
        lower.includes('gh_src=') ||
        lower.includes('gh_jid=') ||
        lower.includes('/greenhouse/')
      ) {
        return true;
      }
    }

    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (
        doc.querySelector('#application_form') ||
        doc.querySelector('form#new_applicant') ||
        doc.querySelector('form[action*="greenhouse.io"]') ||
        doc.querySelector('[data-qa="apply-button"]')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical form schema from Greenhouse DOM or context.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async extractFormSchema(context = {}) {
    const doc = context.doc || context.document;
    const destinationUrl = context.destinationUrl || context.url || 'https://boards.greenhouse.io/job/apply';
    const formId = 'greenhouse-application-form';

    const fields = [];
    const attachments = [];
    const repeatedGroups = [];
    let isMultiStep = false;
    const steps = [];

    // Helper to push field safely
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
          source: 'GREENHOUSE_DOM',
          customQuestion,
          verified: false,
          requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
          metadata: {
            isSensitive,
            greenhouseId: id || name,
          },
        })
      );
      return fieldId;
    };

    if (doc && typeof doc.querySelector === 'function') {
      // 1. Core candidate fields
      const firstNameEl = doc.querySelector('#first_name, [name="first_name"]');
      if (firstNameEl) {
        addField({ name: 'first_name', id: 'first_name', label: 'First Name', type: 'text', required: true });
      }

      const lastNameEl = doc.querySelector('#last_name, [name="last_name"]');
      if (lastNameEl) {
        addField({ name: 'last_name', id: 'last_name', label: 'Last Name', type: 'text', required: true });
      }

      const emailEl = doc.querySelector('#email, [name="email"]');
      if (emailEl) {
        addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      }

      const phoneEl = doc.querySelector('#phone, [name="phone"]');
      if (phoneEl) {
        addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
      }

      // 2. Attachments
      const resumeEl = doc.querySelector('#resume, input[name="resume"], [data-qa="resume"]');
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

      const coverLetterEl = doc.querySelector('#cover_letter, input[name="cover_letter"]');
      if (coverLetterEl) {
        const fieldId = addField({ name: 'cover_letter', id: 'cover_letter', label: 'Cover Letter', type: 'file', required: false });
        attachments.push(
          PortalAttachmentFieldSchema.parse({
            fieldId,
            name: 'cover_letter',
            label: 'Cover Letter',
            required: false,
            accept: '.pdf,.doc,.docx',
            maxSizeMb: 10,
          })
        );
      }

      // 3. URLs
      const linkedinEl = doc.querySelector('[name*="linkedin"], #job_application_answers_attributes_linkedin');
      if (linkedinEl) {
        addField({ name: 'linkedin', id: 'linkedin', label: 'LinkedIn Profile', type: 'url', required: false });
      }

      const githubEl = doc.querySelector('[name*="github"], #job_application_answers_attributes_github');
      if (githubEl) {
        addField({ name: 'github', id: 'github', label: 'GitHub Profile', type: 'url', required: false });
      }

      const websiteEl = doc.querySelector('[name*="website"], #job_application_answers_attributes_website');
      if (websiteEl) {
        addField({ name: 'website', id: 'website', label: 'Website / Portfolio', type: 'url', required: false });
      }

      // 4. Repeated groups: Education & Experience
      const eduContainer = doc.querySelector('#education_section, [data-group="education"]');
      if (eduContainer) {
        const eduFields = [
          PortalFieldSchema.parse({
            fieldId: 'gh_edu_school',
            name: 'school',
            label: 'School',
            type: 'text',
            required: true,
            source: 'GREENHOUSE_DOM',
          }),
          PortalFieldSchema.parse({
            fieldId: 'gh_edu_degree',
            name: 'degree',
            label: 'Degree',
            type: 'text',
            required: false,
            source: 'GREENHOUSE_DOM',
          }),
          PortalFieldSchema.parse({
            fieldId: 'gh_edu_discipline',
            name: 'discipline',
            label: 'Discipline / Major',
            type: 'text',
            required: false,
            source: 'GREENHOUSE_DOM',
          }),
        ];
        repeatedGroups.push(
          PortalRepeatedGroupSchema.parse({
            groupId: 'education',
            label: 'Education History',
            minItems: 0,
            maxItems: 5,
            fields: eduFields,
          })
        );
      }

      // 5. Custom & Sensitive screening questions
      const customQuestionEls = doc.querySelectorAll
        ? doc.querySelectorAll('.custom_question, [id^="job_application_answers_attributes"], [id^="custom_"], [name^="custom_"]')
        : [];
      for (const qEl of customQuestionEls) {
        const qName = qEl.name || qEl.id || '';
        const qLabel = (qEl.getAttribute('aria-label') || qEl.placeholder || qName).trim();
        const isAuth = /authorization|visa|sponsor/i.test(qName + ' ' + qLabel);
        const isSalary = /salary|compensation/i.test(qName + ' ' + qLabel);
        addField({
          name: qName,
          id: qEl.id || qName,
          label: qLabel,
          type: (qEl.tagName || '').toLowerCase() === 'select' ? 'select' : 'text',
          required: Boolean(qEl.required),
          isSensitive: isAuth || isSalary,
          customQuestion: true,
        });
      }

      // 6. Demographic & EEO Questions (strictly protected)
      const eeoSection = doc.querySelector('#demographic_questions, [data-qa="eeoc-section"]');
      if (eeoSection) {
        addField({
          name: 'eeo_gender',
          id: 'eeo_gender',
          label: 'Gender',
          type: 'select',
          required: false,
          isSensitive: true,
          customQuestion: true,
        });
        addField({
          name: 'eeo_race',
          id: 'eeo_race',
          label: 'Race / Ethnicity',
          type: 'select',
          required: false,
          isSensitive: true,
          customQuestion: true,
        });
        addField({
          name: 'eeo_veteran',
          id: 'eeo_veteran',
          label: 'Veteran Status',
          type: 'select',
          required: false,
          isSensitive: true,
          customQuestion: true,
        });
        addField({
          name: 'eeo_disability',
          id: 'eeo_disability',
          label: 'Disability Status',
          type: 'select',
          required: false,
          isSensitive: true,
          customQuestion: true,
        });
      }

      // 7. Multi-step detection
      const stepIndicator = doc.querySelector('.step-indicator, [data-step-container], #step_container');
      if (stepIndicator) {
        isMultiStep = true;
        steps.push('step_personal', 'step_experience', 'step_questions', 'step_review');
      }
    } else {
      // Default canonical Greenhouse structure for headless / fixture mode
      addField({ name: 'first_name', id: 'first_name', label: 'First Name', type: 'text', required: true });
      addField({ name: 'last_name', id: 'last_name', label: 'Last Name', type: 'text', required: true });
      addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
      addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });

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

      const covId = addField({ name: 'cover_letter', id: 'cover_letter', label: 'Cover Letter', type: 'file', required: false });
      attachments.push(
        PortalAttachmentFieldSchema.parse({
          fieldId: covId,
          name: 'cover_letter',
          label: 'Cover Letter',
          required: false,
          accept: '.pdf,.doc,.docx',
          maxSizeMb: 10,
        })
      );

      addField({ name: 'linkedin', id: 'linkedin', label: 'LinkedIn Profile', type: 'url', required: false });
      addField({ name: 'github', id: 'github', label: 'GitHub Profile', type: 'url', required: false });
      addField({ name: 'website', id: 'website', label: 'Website', type: 'url', required: false });
    }

    return PortalFormSchema.parse({
      portalId: 'greenhouse',
      formId,
      destinationUrl,
      fields,
      questions: [],
      attachments,
      repeatedGroups,
      steps,
      isMultiStep,
      metadata: {
        provider: 'greenhouse',
        extractedAt: new Date().toISOString(),
      },
    });
  }
}
