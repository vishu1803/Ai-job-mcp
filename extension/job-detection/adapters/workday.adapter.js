import { classifyEmploymentType } from '../employment-type.js';

/**
 * @file Workday Job Page Extraction Adapter (P15-001).
 *
 * Extracts structured job posting metadata from Workday-hosted career sites
 * (*.myworkdayjobs.com).
 */

export class WorkdayAdapter {
  static provider = 'WORKDAY';

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    if (url.toLowerCase().includes('myworkdayjobs.com')) return true;
    return Boolean(
      doc.querySelector('[data-automation-id="jobPostingHeader"]') ||
      doc.querySelector('[data-automation-id="jobDescription"]') ||
      doc.querySelector('.workday-job-details')
    );
  }

  /**
   * Extracts and normalizes job payload from the document.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    const titleEl =
      doc.querySelector('[data-automation-id="jobPostingHeader"]') ||
      doc.querySelector('h1') ||
      doc.querySelector('h2.css-1r2iwdh');

    const locationEl =
      doc.querySelector('[data-automation-id="locations"]') ||
      doc.querySelector('[data-automation-id="jobPostingLocation"]') ||
      doc.querySelector('.css-cygeeu');

    let company = '';
    const companyEl = doc.querySelector('[data-automation-id="companyName"]');
    if (companyEl) {
      company = companyEl.textContent.trim();
    } else if (url) {
      try {
        const parsed = new URL(url);
        const hostParts = parsed.hostname.split('.');
        if (hostParts[0]) {
          company = hostParts[0].replace(/[-_]/g, ' ');
          company = company.charAt(0).toUpperCase() + company.slice(1);
        }
      } catch {
        /* ignore url parse error */
      }
    }

    const descEl =
      doc.querySelector('[data-automation-id="jobDescription"]') ||
      doc.querySelector('.css-ey7q0p') ||
      doc.querySelector('#jobDescription');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const location = locationEl ? locationEl.textContent.trim() : '';
    const description = descEl ? descEl.textContent.trim() : (doc.body ? doc.body.textContent.trim() : '');

    const requirements = [];
    if (descEl) {
      descEl.querySelectorAll('li').forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 10) requirements.push(text);
      });
    }

    let workplace = 'UNKNOWN';
    const combinedText = `${title} ${location} ${description}`.toLowerCase();
    if (combinedText.includes('remote')) {
      workplace = 'REMOTE';
    } else if (combinedText.includes('hybrid')) {
      workplace = 'HYBRID';
    } else if (location) {
      workplace = 'ON_SITE';
    }

    return {
      sourceUrl: url,
      provider: WorkdayAdapter.provider,
      title: title || 'Untitled Role',
      company: company || 'Company',
      location: location || 'Not specified',
      workplace,
      employmentType: classifyEmploymentType(combinedText),
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description,
    };
  }
}
