/**
 * @file Generic Career Site Portal Adapter (Phase 8.5 / ARCH-060).
 *
 * Provides universal, provider-agnostic fallback application adaptation for unknown
 * employer job portals, startup careers pages, and direct career sites:
 * 1. Semantic DOM field discovery (autocomplete, labels, aria, names, IDs, placeholders).
 * 2. Complete 24-attribute career taxonomy extraction into canonical PortalFormSchema.
 * 3. Strict sensitive field protection (work authorization, visa, salary, EEO, declarations).
 * 4. Generic multi-step form navigation detection (Next, Back, Review, Submit).
 * 5. Iframe scoping and security boundary isolation.
 * 6. Dynamic DOM change handling and validation recovery.
 * 7. Hard invariant: NEVER auto-submits; always halts at READY_FOR_FINAL_REVIEW.
 */

import { BasePortalAdapter } from '../base-portal-adapter.js';
import {
  PortalFormSchema,
  PortalFieldSchema,
  PortalAttachmentFieldSchema,
  PortalRepeatedGroupSchema,
  generateDeterministicFieldId,
} from '../portal-adapter.contract.js';

export class GenericCareerSiteAdapter extends BasePortalAdapter {
  constructor() {
    super({
      id: 'generic-career-site-adapter',
      name: 'Generic Career Site Portal Adapter',
      version: '1.0.0',
      supportedPortals: ['generic', 'career-site', 'fallback'],
      priority: 1, // Lowest priority: evaluated after all specific ATS adapters
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
   * Deterministic detection for generic career sites and unhandled employer portals.
   *
   * @param {string|object} destination
   * @returns {boolean}
   */
  canHandle(destination) {
    if (!destination) return false;

    // If explicit URL string or object provided
    const url = typeof destination === 'string' ? destination : destination.url || destination.destinationUrl || '';
    if (url && typeof url === 'string') {
      const lower = url.toLowerCase();
      // Valid HTTP/HTTPS web destinations
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        return true;
      }
    }

    // If DOM document provided with interactive form elements
    const doc = destination.doc || destination.document;
    if (doc && typeof doc.querySelector === 'function') {
      if (doc.querySelector('form, input, textarea, select')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts canonical PortalFormSchema from generic portal DOM using semantic priority.
   * Priority:
   * 1. Canonical field ID
   * 2. Autocomplete attribute
   * 3. Exact name
   * 4. Exact id
   * 5. Exact label / aria-label
   * 6. Semantic label mapping
   * 7. Conservative fallback (UNKNOWN or custom_question with requiresUserReview: true)
   *
   * @param {object} context
   * @returns {Promise<object>} Canonical PortalFormSchema
   */
  async extractFormSchema(context = {}) {
    let doc = context.doc || context.document;
    const destinationUrl = context.destinationUrl || context.url || 'https://careers.example.com/apply';
    const formId = `generic_form_${Math.abs(this._hashString(destinationUrl))}`;

    // 1. Iframe scope detection & boundary isolation
    const iframeScope = this.locateIframe(context);
    if (iframeScope.isIframe) {
      if (iframeScope.isBlocked) {
        // Return a schema indicating blocked cross-origin frame requiring manual review
        return PortalFormSchema.parse({
          portalId: 'generic-career-site',
          formId,
          destinationUrl,
          fields: [],
          attachments: [],
          repeatedGroups: [],
          isMultiStep: false,
          steps: [],
          metadata: {
            iframeBlocked: true,
            status: 'NEEDS_REVIEW',
            warning: 'Application form is embedded in a cross-origin restricted iframe.',
          },
        });
      }
      doc = iframeScope.doc;
    }

    const fields = [];
    const attachments = [];
    const repeatedGroups = [];
    let isMultiStep = false;
    const steps = [];

    const addField = ({
      name,
      id,
      label,
      type,
      required = false,
      isSensitive = false,
      customQuestion = false,
      options = [],
      metadata = {},
    }) => {
      const fieldId = generateDeterministicFieldId({
        formId,
        name,
        id,
        label,
        type,
        position: fields.length,
      });

      const fieldObj = PortalFieldSchema.parse({
        fieldId,
        name,
        label,
        type,
        required,
        options,
        source: 'GENERIC_DOM',
        customQuestion,
        verified: false,
        requiresUserReview: isSensitive || customQuestion || type === 'UNKNOWN',
        metadata: {
          ...metadata,
          isSensitive,
          genericMatched: true,
        },
      });

      fields.push(fieldObj);
      return fieldId;
    };

    if (doc && typeof doc.querySelectorAll === 'function') {
      const inputElements = doc.querySelectorAll('input, textarea, select');
      const seenNames = new Set();

      for (const el of inputElements) {
        const rawType = (el.type || el.tagName || 'text').toLowerCase();
        const elName = (el.name || el.id || '').trim();
        const elId = (el.id || '').trim();
        const autocomplete = (el.getAttribute?.('autocomplete') || '').toLowerCase().trim();
        const placeholder = (el.placeholder || el.getAttribute?.('placeholder') || '').trim();
        const ariaLabel = (el.getAttribute?.('aria-label') || '').trim();

        // Find associated label text
        let labelText = ariaLabel || placeholder;
        if (!labelText && elId && typeof doc.querySelector === 'function') {
          const labelEl = doc.querySelector(`label[for="${elId}"]`);
          if (labelEl) {
            labelText = (labelEl.textContent || '').trim();
          }
        }
        if (!labelText && el.closest) {
          const parentLabel = el.closest('label');
          if (parentLabel) {
            labelText = (parentLabel.textContent || '').trim();
          }
        }
        if (!labelText) {
          labelText = elName || elId || 'Field';
        }

        // Skip submit/button inputs from field schema (handled by navigation/submit detection)
        if (rawType === 'submit' || rawType === 'button' || rawType === 'reset') {
          continue;
        }

        // Skip radio inputs that have already been grouped under same name
        if (rawType === 'radio' && elName && seenNames.has(`radio_${elName}`)) {
          continue;
        }

        // Semantic classification using Phase 6 priority
        const classification = this._classifyGenericField({
          id: elId,
          name: elName,
          type: rawType,
          autocomplete,
          label: labelText,
          placeholder,
          ariaLabel,
          element: el,
        });

        // Track seen names
        if (elName) {
          seenNames.add(rawType === 'radio' ? `radio_${elName}` : elName);
        }

        // Handle File attachments
        if (classification.type === 'file' || rawType === 'file') {
          const isCoverLetter = /cover[\s_-]?letter/i.test(classification.name + ' ' + labelText);
          const attachName = isCoverLetter ? 'cover_letter' : 'resume';
          const attachLabel = isCoverLetter ? 'Cover Letter' : 'Resume / CV';

          const fId = addField({
            name: attachName,
            id: elId || attachName,
            label: attachLabel,
            type: 'file',
            required: Boolean(el.required),
            isSensitive: false,
            customQuestion: false,
          });

          attachments.push(
            PortalAttachmentFieldSchema.parse({
              fieldId: fId,
              name: attachName,
              label: attachLabel,
              required: Boolean(el.required),
              accept: el.getAttribute?.('accept') || '.pdf,.doc,.docx',
              maxSizeMb: 10,
            })
          );
          continue;
        }

        // Handle select options
        let options = [];
        if (rawType === 'select' && el.options) {
          options = Array.from(el.options)
            .map((opt) => ({
              value: opt.value || opt.textContent?.trim() || '',
              label: opt.textContent?.trim() || opt.value || '',
            }))
            .filter((opt) => opt.value || opt.label);
        }

        // Handle radio options
        if (rawType === 'radio' && elName && typeof doc.querySelectorAll === 'function') {
          const radioEls = doc.querySelectorAll(`input[type="radio"][name="${elName}"]`);
          options = Array.from(radioEls).map((r) => ({
            value: r.value || '',
            label: (r.getAttribute?.('aria-label') || r.value || '').trim(),
          }));
        }

        addField({
          name: classification.name,
          id: elId || classification.name,
          label: labelText,
          type: classification.type,
          required: Boolean(el.required),
          isSensitive: classification.isSensitive,
          customQuestion: classification.customQuestion,
          options,
          metadata: {
            semanticCategory: classification.category,
            autocomplete,
          },
        });
      }

      // 2. Multi-step form detection
      const navInfo = this.detectNavigationAction(doc);
      if (
        navInfo.hasSteps ||
        doc.querySelector('.step, .steps, [data-step], .wizard-step, .pagination, .progress-bar')
      ) {
        isMultiStep = true;
        steps.push('step_information', 'step_questions', 'step_review');
      }

      // 3. Repeated groups detection (e.g. experience rows, education entries)
      const experienceRows = doc.querySelectorAll('.experience-item, .work-history-item, [data-group="experience"]');
      if (experienceRows.length > 0) {
        repeatedGroups.push(
          PortalRepeatedGroupSchema.parse({
            groupId: 'experience',
            label: 'Work Experience',
            minItems: 0,
            maxItems: 10,
            fields: [
              PortalFieldSchema.parse({
                fieldId: 'exp_company',
                name: 'company',
                label: 'Company',
                type: 'text',
                source: 'GENERIC_DOM',
              }),
              PortalFieldSchema.parse({
                fieldId: 'exp_title',
                name: 'job_title',
                label: 'Title',
                type: 'text',
                source: 'GENERIC_DOM',
              }),
            ],
          })
        );
      }
    } else {
      // Default canonical generic structure fallback
      this._populateDefaultGenericFields(addField, attachments);
    }

    return PortalFormSchema.parse({
      portalId: 'generic-career-site',
      formId,
      destinationUrl,
      fields,
      attachments,
      repeatedGroups,
      isMultiStep,
      steps,
      metadata: {
        isGenericFallback: true,
        extractedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Classifies an individual generic DOM field using Phase 6 semantic priorities.
   *
   * @private
   */
  _classifyGenericField({ id = '', name = '', type = 'text', autocomplete = '', label = '', placeholder = '', ariaLabel = '' }) {
    const descriptor = `${name} ${id} ${label} ${placeholder} ${ariaLabel}`.toLowerCase();

    // 1. Sensitive Category Checks (Strict Protection)
    if (/work[\s_-]?auth|authorized[\s_-]?to[\s_-]?work|eligib.*to[\s_-]?work/i.test(descriptor)) {
      return { name: name || 'work_authorization', type: type === 'select' ? 'select' : 'text', category: 'work_authorization', isSensitive: true, customQuestion: true };
    }
    if (/visa|sponsor|require[\s_-]?sponsorship/i.test(descriptor)) {
      return { name: name || 'visa_sponsorship', type: type === 'select' ? 'select' : 'text', category: 'visa_sponsorship', isSensitive: true, customQuestion: true };
    }
    if (/salary|compensation|desired[\s_-]?pay|expected[\s_-]?rate/i.test(descriptor)) {
      return { name: name || 'salary_expectation', type: 'text', category: 'salary_expectation', isSensitive: true, customQuestion: true };
    }
    if (/criminal|felony|conviction/i.test(descriptor)) {
      return { name: name || 'criminal_history', type: type === 'select' ? 'select' : 'text', category: 'criminal_history', isSensitive: true, customQuestion: true };
    }
    if (/disability|handicap|impairment/i.test(descriptor)) {
      return { name: name || 'disability_status', type: type === 'select' ? 'select' : 'text', category: 'disability', isSensitive: true, customQuestion: true };
    }
    if (/veteran|military/i.test(descriptor)) {
      return { name: name || 'veteran_status', type: type === 'select' ? 'select' : 'text', category: 'veteran', isSensitive: true, customQuestion: true };
    }
    if (/race|ethnicity|latino|hispanic/i.test(descriptor)) {
      return { name: name || 'race_ethnicity', type: 'select', category: 'race/ethnicity', isSensitive: true, customQuestion: true };
    }
    if (/gender|pronoun/i.test(descriptor)) {
      return { name: name || 'gender', type: 'select', category: 'gender', isSensitive: true, customQuestion: true };
    }
    if (/accuracy|certify|attest|accurate/i.test(descriptor)) {
      return { name: name || 'declarations_accuracyconfirmed', type: 'checkbox', category: 'legal_certification', isSensitive: true, customQuestion: true };
    }
    if (/terms|accept[\s_-]?terms|agree.*terms/i.test(descriptor)) {
      return { name: name || 'terms_acceptance', type: 'checkbox', category: 'terms_acceptance', isSensitive: true, customQuestion: true };
    }
    if (/privacy|data[\s_-]?protection|consent/i.test(descriptor)) {
      return { name: name || 'privacy_consent', type: 'checkbox', category: 'privacy_consent', isSensitive: true, customQuestion: true };
    }

    // 2. Autocomplete Priority Mapping
    if (autocomplete === 'given-name') return { name: 'first_name', type: 'text', category: 'first_name', isSensitive: false, customQuestion: false };
    if (autocomplete === 'family-name') return { name: 'last_name', type: 'text', category: 'last_name', isSensitive: false, customQuestion: false };
    if (autocomplete === 'name') return { name: 'full_name', type: 'text', category: 'full_name', isSensitive: false, customQuestion: false };
    if (autocomplete === 'email') return { name: 'email', type: 'email', category: 'email', isSensitive: false, customQuestion: false };
    if (autocomplete === 'tel' || autocomplete === 'tel-national') return { name: 'phone', type: 'tel', category: 'phone', isSensitive: false, customQuestion: false };
    if (autocomplete === 'street-address' || autocomplete === 'address-line1') return { name: 'address', type: 'text', category: 'address', isSensitive: false, customQuestion: false };
    if (autocomplete === 'address-level2') return { name: 'city', type: 'text', category: 'city', isSensitive: false, customQuestion: false };
    if (autocomplete === 'address-level1') return { name: 'state', type: 'text', category: 'state', isSensitive: false, customQuestion: false };
    if (autocomplete === 'postal-code') return { name: 'postal_code', type: 'text', category: 'postal_code', isSensitive: false, customQuestion: false };
    if (autocomplete === 'country' || autocomplete === 'country-name') return { name: 'country', type: 'text', category: 'country', isSensitive: false, customQuestion: false };
    if (autocomplete === 'organization') return { name: 'company', type: 'text', category: 'company', isSensitive: false, customQuestion: false };
    if (autocomplete === 'organization-title') return { name: 'job_title', type: 'text', category: 'job_title', isSensitive: false, customQuestion: false };

    // 3. Exact & Semantic Pattern Matching across Career Taxonomy
    if (/first[\s_-]?name|given[\s_-]?name|forename/i.test(descriptor)) {
      return { name: name || 'first_name', type: 'text', category: 'first_name', isSensitive: false, customQuestion: false };
    }
    if (/last[\s_-]?name|family[\s_-]?name|surname/i.test(descriptor)) {
      return { name: name || 'last_name', type: 'text', category: 'last_name', isSensitive: false, customQuestion: false };
    }
    if (/full[\s_-]?name|^name$/i.test(descriptor)) {
      return { name: name || 'full_name', type: 'text', category: 'full_name', isSensitive: false, customQuestion: false };
    }
    if (/email|e-mail/i.test(descriptor) || type === 'email') {
      return { name: name || 'email', type: 'email', category: 'email', isSensitive: false, customQuestion: false };
    }
    if (/phone|mobile|cell|telephone/i.test(descriptor) || type === 'tel') {
      return { name: name || 'phone', type: 'tel', category: 'phone', isSensitive: false, customQuestion: false };
    }
    if (/street|address[\s_-]?line|street[\s_-]?address/i.test(descriptor)) {
      return { name: name || 'address', type: 'text', category: 'address', isSensitive: false, customQuestion: false };
    }
    if (/^city$|town/i.test(descriptor)) {
      return { name: name || 'city', type: 'text', category: 'city', isSensitive: false, customQuestion: false };
    }
    if (/^state$|province|region/i.test(descriptor)) {
      return { name: name || 'state', type: 'text', category: 'state', isSensitive: false, customQuestion: false };
    }
    if (/^country$/i.test(descriptor)) {
      return { name: name || 'country', type: 'text', category: 'country', isSensitive: false, customQuestion: false };
    }
    if (/zip|postal[\s_-]?code|postcode/i.test(descriptor)) {
      return { name: name || 'postal_code', type: 'text', category: 'postal_code', isSensitive: false, customQuestion: false };
    }
    if (/linkedin/i.test(descriptor)) {
      return { name: name || 'linkedin', type: 'url', category: 'linkedin', isSensitive: false, customQuestion: false };
    }
    if (/github/i.test(descriptor)) {
      return { name: name || 'github', type: 'url', category: 'github', isSensitive: false, customQuestion: false };
    }
    if (/portfolio/i.test(descriptor)) {
      return { name: name || 'portfolio', type: 'url', category: 'portfolio', isSensitive: false, customQuestion: false };
    }
    if (/website|personal[\s_-]?site|homepage/i.test(descriptor) || type === 'url') {
      return { name: name || 'website', type: 'url', category: 'website', isSensitive: false, customQuestion: false };
    }
    if (/resume|cv|curriculum/i.test(descriptor) || type === 'file') {
      return { name: name || 'resume', type: 'file', category: 'resume', isSensitive: false, customQuestion: false };
    }
    if (/cover[\s_-]?letter/i.test(descriptor)) {
      return { name: name || 'cover_letter', type: type === 'file' ? 'file' : 'textarea', category: 'cover_letter', isSensitive: false, customQuestion: false };
    }
    if (/school|university|college|institution/i.test(descriptor)) {
      return { name: name || 'school', type: 'text', category: 'school', isSensitive: false, customQuestion: false };
    }
    if (/degree|major|field[\s_-]?of[\s_-]?study/i.test(descriptor)) {
      return { name: name || 'degree', type: 'text', category: 'degree', isSensitive: false, customQuestion: false };
    }
    if (/employer|company|organization/i.test(descriptor)) {
      return { name: name || 'company', type: 'text', category: 'company', isSensitive: false, customQuestion: false };
    }
    if (/job[\s_-]?title|role|position/i.test(descriptor)) {
      return { name: name || 'job_title', type: 'text', category: 'job_title', isSensitive: false, customQuestion: false };
    }
    if (/start[\s_-]?date|from[\s_-]?date/i.test(descriptor)) {
      return { name: name || 'start_date', type: 'date', category: 'start_date', isSensitive: false, customQuestion: false };
    }
    if (/end[\s_-]?date|to[\s_-]?date/i.test(descriptor)) {
      return { name: name || 'end_date', type: 'date', category: 'end_date', isSensitive: false, customQuestion: false };
    }
    if (/skills|technologies/i.test(descriptor)) {
      return { name: name || 'skills', type: 'textarea', category: 'skills', isSensitive: false, customQuestion: false };
    }

    // 4. Custom employer question fallback (e.g. Why join us? Describe experience)
    const isQuestionProse = label.length > 15 || label.endsWith('?') || /why|describe|tell us|explain/i.test(label);
    if (isQuestionProse || type === 'textarea') {
      return {
        name: name || id || 'custom_question',
        type: type === 'textarea' ? 'textarea' : 'text',
        category: 'custom_question',
        isSensitive: false,
        customQuestion: true,
      };
    }

    // 5. Conservative UNKNOWN Fallback
    return {
      name: name || id || 'unknown_field',
      type: type || 'UNKNOWN',
      category: 'UNKNOWN',
      isSensitive: false,
      customQuestion: true,
    };
  }

  /**
   * Populates standard canonical fields when no DOM is present (headless / fallback mode).
   *
   * @private
   */
  _populateDefaultGenericFields(addField, attachments) {
    addField({ name: 'first_name', id: 'first_name', label: 'First Name', type: 'text', required: true });
    addField({ name: 'last_name', id: 'last_name', label: 'Last Name', type: 'text', required: true });
    addField({ name: 'email', id: 'email', label: 'Email', type: 'email', required: true });
    addField({ name: 'phone', id: 'phone', label: 'Phone', type: 'tel', required: false });
    addField({ name: 'city', id: 'city', label: 'City', type: 'text', required: false });
    addField({ name: 'country', id: 'country', label: 'Country', type: 'text', required: false });
    addField({ name: 'linkedin', id: 'linkedin', label: 'LinkedIn', type: 'url', required: false });
    addField({ name: 'github', id: 'github', label: 'GitHub', type: 'url', required: false });

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

  /**
   * Detects multi-step navigation controls without triggering them.
   *
   * @param {object} doc DOM document
   * @returns {{ action: string, element: object|null, label: string|null, hasSteps: boolean }}
   */
  detectNavigationAction(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') {
      return { action: 'NONE', element: null, label: null, hasSteps: false };
    }

    const buttons = doc.querySelectorAll('button, input[type="button"], input[type="submit"], a.btn, a.button');
    let navAction = 'NONE';
    let matchedEl = null;
    let matchedLabel = null;
    let hasSteps = false;

    for (const btn of buttons) {
      const text = (btn.textContent || btn.value || btn.getAttribute?.('aria-label') || '').trim();
      const lower = text.toLowerCase();

      // Check submit first (to prevent auto-click)
      if (/submit|apply|send application|finish application|complete application/i.test(lower)) {
        navAction = 'SUBMIT';
        matchedEl = btn;
        matchedLabel = text;
        break;
      }

      // Check review
      if (/review|preview/i.test(lower)) {
        navAction = 'REVIEW';
        matchedEl = btn;
        matchedLabel = text;
        continue;
      }

      // Check forward navigation
      if (/next|continue|save and continue|proceed|step \d/i.test(lower)) {
        navAction = 'NAVIGATE_FORWARD';
        matchedEl = btn;
        matchedLabel = text;
        hasSteps = true;
        continue;
      }

      // Check backward navigation
      if (/prev|previous|back/i.test(lower)) {
        navAction = 'NAVIGATE_BACK';
        matchedEl = btn;
        matchedLabel = text;
        hasSteps = true;
      }
    }

    return {
      action: navAction,
      element: matchedEl,
      label: matchedLabel,
      hasSteps,
    };
  }

  /**
   * Refreshes the form schema dynamically after DOM mutation.
   *
   * @param {object} context
   * @returns {Promise<object>}
   */
  async refreshFormSchema(context = {}) {
    return this.extractFormSchema(context);
  }

  /**
   * Computes a simple deterministic hash of a string.
   *
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}
