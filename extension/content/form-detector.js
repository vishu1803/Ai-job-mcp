/**
 * @file Application Form Detector & Field Extractor (Phase 8.2 / P57.6).
 *
 * Scans the DOM for job application forms, multi-step wizards, custom questions,
 * repeated groups, and candidate input fields.
 * Preserves all unknown fields (zero silent omission) and produces deterministic field identities.
 */

/**
 * Generates a stable, deterministic field ID from DOM attributes and position.
 * Prevents random UUID churn and ensures stability across repeated extractions.
 *
 * @param {object} params
 * @param {string} [params.formId]
 * @param {string} [params.name]
 * @param {string} [params.id]
 * @param {string} [params.label]
 * @param {string} [params.type]
 * @param {number|string} [params.position]
 * @returns {string} Deterministic field ID
 */
export function generateDeterministicFieldId({ formId = 'form', name = '', id = '', label = '', type = 'text', position = 0 }) {
  const cleanName = (name || id || '').toLowerCase().trim();
  const cleanLabel = (label || '').toLowerCase().trim();
  const cleanType = (type || 'text').toLowerCase().trim();
  const cleanForm = (formId || 'form').toLowerCase().trim();

  const payload = `${cleanForm}:${cleanName}:${cleanLabel}:${cleanType}:${position}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  const prefix = cleanName ? cleanName.replace(/[^a-z0-9_-]/gi, '_').slice(0, 24) : 'fld';
  return `${prefix}_${hex}`;
}

export class FormDetector {
  /**
   * Scans the document for active job application forms.
   *
   * @param {Document} doc
   * @returns {{ hasForm: boolean, formId: string, step: number, totalSteps: number, stepTitle: string, fields: Array<object>, repeatedGroups: Array<object> }}
   */
  static detect(doc) {
    if (!doc) {
      return { hasForm: false, formId: 'default-form', step: 1, totalSteps: 1, stepTitle: '', fields: [], repeatedGroups: [] };
    }

    // Step indicators (e.g. "Step 2 of 4", "Personal Information", etc.)
    const stepInfo = FormDetector._detectStep(doc);

    // Form search
    const formEl =
      doc.querySelector('form[action*="apply" i]') ||
      doc.querySelector('form[action*="job" i]') ||
      doc.querySelector('form[id*="application" i]') ||
      doc.querySelector('form[class*="application" i]') ||
      doc.querySelector('#application-form, #job-application, .application-form') ||
      doc.querySelector('form');

    const formId = formEl?.id || 'application-form';

    const inputs = formEl
      ? formEl.querySelectorAll('input, select, textarea, [role="textbox"], [role="combobox"], [contenteditable="true"], [data-custom-widget]')
      : doc.querySelectorAll('input, select, textarea, [role="textbox"], [role="combobox"], [contenteditable="true"], [data-custom-widget]');

    const seenRadioGroups = new Map();
    const detectedFields = [];

    inputs.forEach((input, index) => {
      const field = FormDetector._classifyField(input, index, formId);
      if (!field) return;

      // Group radio buttons sharing the same name
      if (field.type === 'radio' && field.name) {
        if (seenRadioGroups.has(field.name)) {
          const group = seenRadioGroups.get(field.name);
          if (field.options && field.options.length > 0) {
            group.options.push(...field.options);
          }
          return;
        } else {
          seenRadioGroups.set(field.name, field);
          detectedFields.push(field);
          return;
        }
      }

      detectedFields.push(field);
    });

    // Detect repeated groups (e.g. fieldset[data-group], .repeated-group, .history-entry, etc.)
    const repeatedGroups = [];
    if (typeof doc.querySelectorAll === 'function') {
      try {
        const groupContainers = doc.querySelectorAll('fieldset[data-group], [data-repeated-group], .repeated-group, .history-entry, .education-entry, .experience-item');
        if (groupContainers && typeof groupContainers.forEach === 'function') {
          groupContainers.forEach((container, gIdx) => {
            if (!container || typeof container.querySelectorAll !== 'function' || container.tagName === 'INPUT' || container.tagName === 'SELECT' || container.tagName === 'TEXTAREA') {
              return;
            }
            const groupId = (typeof container.getAttribute === 'function' ? container.getAttribute('data-group') || container.getAttribute('id') : null) || `group_${gIdx + 1}`;
            const groupLabel = (typeof container.querySelector === 'function' ? container.querySelector('legend, h3, h4, .group-title')?.textContent?.trim() : null) || `Group ${gIdx + 1}`;
            const groupInputs = container.querySelectorAll('input, select, textarea');
            const groupFields = [];
            if (groupInputs && typeof groupInputs.forEach === 'function') {
              groupInputs.forEach((inp, idx) => {
                const fld = FormDetector._classifyField(inp, idx, groupId);
                if (fld) groupFields.push(fld);
              });
            }
            if (groupFields.length > 0) {
              repeatedGroups.push({
                groupId,
                label: groupLabel,
                minItems: 0,
                fields: groupFields,
                metadata: {},
              });
            }
          });
        }
      } catch {
        // Safe fallback if DOM selector fails
      }
    }

    const hasForm = detectedFields.length >= 2 || (formEl !== null && detectedFields.length >= 1);

    return {
      hasForm,
      formId,
      step: stepInfo.step,
      totalSteps: stepInfo.totalSteps,
      stepTitle: stepInfo.title,
      fields: detectedFields,
      repeatedGroups,
    };
  }

  static _detectStep(doc) {
    let step = 1;
    let totalSteps = 1;
    let title = 'Application Form';

    // Check common wizard step text
    const textNodes = doc.querySelectorAll('h1, h2, h3, h4, span, div.step, [class*="step" i]');
    for (const el of textNodes) {
      const text = el.textContent?.trim() || '';
      const match = text.match(/step\s*([0-9]+)\s*(?:of|\/)\s*([0-9]+)/i);
      if (match) {
        step = parseInt(match[1], 10);
        totalSteps = parseInt(match[2], 10);
        title = text;
        break;
      }
    }

    return { step, totalSteps, title };
  }

  static _classifyField(input, position = 0, formId = 'form') {
    if (!input) return null;

    const inputTypeAttr = (input.type || '').toLowerCase();
    const tagName = (input.tagName || '').toUpperCase();

    // Submit / Reset / Button elements are action buttons, not data fields
    if (
      inputTypeAttr === 'submit' ||
      inputTypeAttr === 'reset' ||
      inputTypeAttr === 'button' ||
      (tagName === 'BUTTON' && inputTypeAttr !== 'checkbox' && inputTypeAttr !== 'radio')
    ) {
      return null;
    }

    const name = input.name || input.id || input.getAttribute?.('placeholder') || '';
    const label = FormDetector._findLabelText(input);
    const descriptor = `${name} ${label}`.toLowerCase().trim();

    let fieldType = 'UNKNOWN';
    let canonicalMapping = null;

    if (
      /first[\s_-]?name/i.test(descriptor) ||
      (descriptor.includes('first') && descriptor.includes('name'))
    ) {
      fieldType = 'FIRST_NAME';
      canonicalMapping = 'candidate.firstName';
    } else if (
      /last[\s_-]?name/i.test(descriptor) ||
      (descriptor.includes('last') && descriptor.includes('name'))
    ) {
      fieldType = 'LAST_NAME';
      canonicalMapping = 'candidate.lastName';
    } else if (/full[\s_-]?name/i.test(descriptor) || descriptor === 'name') {
      fieldType = 'FULL_NAME';
      canonicalMapping = 'candidate.fullName';
    } else if (/email/i.test(descriptor) || inputTypeAttr === 'email') {
      fieldType = 'EMAIL';
      canonicalMapping = 'candidate.email';
    } else if (/phone|mobile|telephone/i.test(descriptor) || inputTypeAttr === 'tel') {
      fieldType = 'PHONE';
      canonicalMapping = 'candidate.phone';
    } else if (
      /resume|cv|curriculum/i.test(descriptor) ||
      (inputTypeAttr === 'file' && /resume|cv/i.test(descriptor))
    ) {
      fieldType = 'RESUME_UPLOAD';
      canonicalMapping = 'artifacts.resume';
    } else if (/cover[\s_-]?letter/i.test(descriptor)) {
      fieldType = 'COVER_LETTER';
      canonicalMapping = 'artifacts.coverLetter';
    } else if (/linkedin/i.test(descriptor)) {
      fieldType = 'LINKEDIN_URL';
      canonicalMapping = 'candidate.socialLinks.linkedin';
    } else if (/github/i.test(descriptor)) {
      fieldType = 'GITHUB_URL';
      canonicalMapping = 'candidate.socialLinks.github';
    } else if (/portfolio|website|url/i.test(descriptor)) {
      fieldType = 'PORTFOLIO_URL';
      canonicalMapping = 'candidate.portfolioUrl';
    } else if (
      /authoriz|work\s*permit|legal\s*right\s*to\s*work|eligible\s*to\s*work|citizenship/i.test(
        descriptor
      )
    ) {
      fieldType = 'WORK_AUTHORIZATION';
      canonicalMapping = 'candidate.careerPreferences.workAuthorization';
    } else if (/sponsor/i.test(descriptor)) {
      fieldType = 'VISA_SPONSORSHIP';
      canonicalMapping = 'candidate.careerPreferences.visaSponsorshipRequired';
    } else if (/notice[\s_-]?period|how\s*soon|availability|start[\s_-]?date/i.test(descriptor)) {
      fieldType = 'NOTICE_PERIOD';
      canonicalMapping = 'candidate.careerPreferences.noticePeriod';
    } else if (/salary|compensation|desired[\s_-]?pay|expected[\s_-]?pay/i.test(descriptor)) {
      fieldType = 'SALARY_EXPECTATION';
      canonicalMapping = 'candidate.careerPreferences.salaryFloor';
    } else if (/city/i.test(descriptor)) {
      fieldType = 'CITY';
      canonicalMapping = 'candidate.contact.city';
    } else if (/state|province/i.test(descriptor)) {
      fieldType = 'STATE';
      canonicalMapping = 'candidate.contact.state';
    } else if (/postal|zip/i.test(descriptor)) {
      fieldType = 'POSTAL_CODE';
      canonicalMapping = 'candidate.contact.postalCode';
    } else if (/address/i.test(descriptor)) {
      fieldType = 'ADDRESS';
      canonicalMapping = 'candidate.contact.address';
    }

    // Determine normalized form element type
    let resolvedType = 'text';
    if (tagName === 'SELECT') {
      resolvedType = 'select';
    } else if (tagName === 'TEXTAREA') {
      resolvedType = 'textarea';
    } else if (inputTypeAttr === 'hidden') {
      resolvedType = 'hidden';
    } else if (inputTypeAttr === 'radio') {
      resolvedType = 'radio';
    } else if (inputTypeAttr === 'checkbox') {
      resolvedType = 'checkbox';
    } else if (inputTypeAttr === 'file') {
      resolvedType = 'file';
    } else if (inputTypeAttr === 'number') {
      resolvedType = 'number';
    } else if (inputTypeAttr === 'date') {
      resolvedType = 'date';
    } else if (inputTypeAttr === 'tel') {
      resolvedType = 'tel';
    } else if (inputTypeAttr === 'url') {
      resolvedType = 'url';
    } else if (inputTypeAttr === 'email') {
      resolvedType = 'email';
    } else if (tagName === 'INPUT' && inputTypeAttr && inputTypeAttr !== 'text') {
      // Unrecognized input type
      resolvedType = 'UNKNOWN';
    } else if (tagName !== 'INPUT' && tagName !== 'SELECT' && tagName !== 'TEXTAREA') {
      // Custom widget or contenteditable
      resolvedType = 'UNKNOWN';
    }

    const options = FormDetector._extractOptions(input, resolvedType);
    const fieldId = generateDeterministicFieldId({
      formId,
      name: input.name || '',
      id: input.id || '',
      label,
      type: resolvedType,
      position,
    });

    const isCustomQuestion = fieldType === 'UNKNOWN' && (tagName === 'TEXTAREA' || tagName === 'SELECT' || Boolean(name) || Boolean(label));
    const isUnknown = fieldType === 'UNKNOWN' && resolvedType === 'UNKNOWN';

    return {
      fieldId,
      fieldType,
      canonicalMapping,
      name: input.name || input.id || fieldType,
      label: label || input.name || input.id || fieldType,
      type: resolvedType,
      required: Boolean(input.required || input.getAttribute?.('aria-required') === 'true'),
      verified: fieldType !== 'UNKNOWN' && resolvedType !== 'UNKNOWN',
      requiresUserReview: fieldType === 'UNKNOWN' || resolvedType === 'UNKNOWN',
      options,
      multiple: Boolean(input.multiple),
      accept: input.getAttribute?.('accept') || null,
      customQuestion: isCustomQuestion,
      providerMetadata: {},
      metadata: {},
    };
  }

  static _extractOptions(input, resolvedType) {
    if (!input) return [];
    const tagName = (input.tagName || '').toUpperCase();

    if (tagName === 'SELECT' && input.options) {
      return Array.from(input.options).map((opt) => ({
        label: opt.textContent?.trim() || opt.value || '',
        value: opt.value || opt.textContent?.trim() || '',
        selected: Boolean(opt.selected),
      }));
    }

    if (resolvedType === 'radio' || resolvedType === 'checkbox') {
      const label = FormDetector._findLabelText(input) || input.value || '';
      return [
        {
          label: label.trim(),
          value: input.value || (resolvedType === 'checkbox' ? 'true' : ''),
          selected: Boolean(input.checked),
        },
      ];
    }

    return [];
  }

  static _findLabelText(input) {
    if (input.id && input.ownerDocument) {
      const label = input.ownerDocument.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = input.closest?.('label');
    if (parentLabel) return parentLabel.textContent.trim();

    return (
      input.getAttribute?.('aria-label') ||
      input.getAttribute?.('placeholder') ||
      input.getAttribute?.('title') ||
      ''
    );
  }
}
