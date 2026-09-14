/**
 * @file Base Job Portal Adapter (P57).
 *
 * Defines the standard adapter contract with explicit capability declarations.
 */

export class JobPortalAdapterBase {
  /**
   * @param {object} options
   * @param {string} options.id
   * @param {string} options.name
   * @param {number} [options.priority=10]
   * @param {object} [options.capabilities]
   */
  constructor({
    id,
    name,
    priority = 10,
    capabilities = {},
  }) {
    this.id = id;
    this.name = name;
    this.priority = priority;
    this.capabilities = {
      jobExtraction: true,
      applicationDetection: false,
      formExtraction: false,
      fieldMapping: false,
      navigationTracking: false,
      ...capabilities,
    };
  }

  /**
   * Determines whether this adapter handles the given page context.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  canHandle(doc, url) {
    return false;
  }

  /**
   * Evaluates job presence and returns signal confidence (0.0 - 1.0).
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ detected: boolean, confidence: number, signals: object }}
   */
  detectJob(doc, url) {
    return { detected: false, confidence: 0, signals: {} };
  }

  /**
   * Extracts the full normalized job payload from the document.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {object} NormalizedJobPayload
   */
  extractJob(doc, url) {
    throw new Error(`extractJob() not implemented by adapter "${this.id}"`);
  }

  /**
   * Identifies whether the current page is an active application submission step.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ isApplication: boolean, step: number|null, stepTitle: string|null }}
   */
  detectApplication(doc, url) {
    return { isApplication: false, step: null, stepTitle: null };
  }

  /**
   * Extracts form input elements for autofill assistance.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {{ formId: string|null, fields: Array<object> }}
   */
  extractForm(doc, url) {
    return { formId: null, fields: [] };
  }

  /**
   * Maps portal form fields to canonical candidate profile attributes.
   *
   * @param {Array<object>} fields
   * @param {object} candidateProfile
   * @returns {Array<object>}
   */
  mapFields(fields, candidateProfile) {
    return [];
  }
}
