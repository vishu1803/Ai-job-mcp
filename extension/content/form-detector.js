/**
 * @file Application Form Detector & Field Extractor (P57.6).
 *
 * Scans the DOM for job application forms, multi-step wizards, and candidate input fields.
 * Normalizes detected inputs against canonical profile attributes.
 */

export class FormDetector {
  /**
   * Scans the document for active job application forms.
   *
   * @param {Document} doc
   * @returns {{ hasForm: boolean, step: number, totalSteps: number, stepTitle: string, fields: Array<object> }}
   */
  static detect(doc) {
    if (!doc) {
      return { hasForm: false, step: 1, totalSteps: 1, stepTitle: '', fields: [] };
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

    const inputs = formEl ? formEl.querySelectorAll('input, select, textarea') : doc.querySelectorAll('input, select, textarea');

    const detectedFields = [];
    inputs.forEach((input) => {
      const field = FormDetector._classifyField(input);
      if (field) {
        detectedFields.push(field);
      }
    });

    const hasForm = detectedFields.length >= 2;

    return {
      hasForm,
      step: stepInfo.step,
      totalSteps: stepInfo.totalSteps,
      stepTitle: stepInfo.title,
      fields: detectedFields,
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

  static _classifyField(input) {
    if (!input || input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
      return null;
    }

    const name = (input.name || input.id || input.getAttribute('placeholder') || '').toLowerCase();
    const label = FormDetector._findLabelText(input).toLowerCase();
    const descriptor = `${name} ${label}`;

    let fieldType = 'UNKNOWN';
    let canonicalMapping = null;

    if (/first[\s_-]?name/i.test(descriptor) || (descriptor.includes('first') && descriptor.includes('name'))) {
      fieldType = 'FIRST_NAME';
      canonicalMapping = 'candidate.firstName';
    } else if (/last[\s_-]?name/i.test(descriptor) || (descriptor.includes('last') && descriptor.includes('name'))) {
      fieldType = 'LAST_NAME';
      canonicalMapping = 'candidate.lastName';
    } else if (/full[\s_-]?name/i.test(descriptor) || descriptor === 'name') {
      fieldType = 'FULL_NAME';
      canonicalMapping = 'candidate.fullName';
    } else if (/email/i.test(descriptor) || input.type === 'email') {
      fieldType = 'EMAIL';
      canonicalMapping = 'candidate.email';
    } else if (/phone|mobile|telephone/i.test(descriptor) || input.type === 'tel') {
      fieldType = 'PHONE';
      canonicalMapping = 'candidate.phone';
    } else if (/resume|cv|curriculum/i.test(descriptor) || (input.type === 'file' && /resume|cv/i.test(descriptor))) {
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
    }

    if (fieldType === 'UNKNOWN') {
      return null;
    }

    return {
      fieldType,
      canonicalMapping,
      name: input.name || input.id || fieldType,
      label: FormDetector._findLabelText(input) || fieldType,
      type: input.type || 'text',
      required: input.required || input.getAttribute('aria-required') === 'true',
      verified: true,
    };
  }

  static _findLabelText(input) {
    if (input.id) {
      const label = input.ownerDocument.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    return input.getAttribute('aria-label') || input.getAttribute('placeholder') || '';
  }
}
