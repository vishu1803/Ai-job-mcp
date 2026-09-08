/**
 * @file Indeed Job Page Extraction Adapter (P15-001).
 *
 * Extracts structured job posting metadata from Indeed job posting pages
 * (indeed.com/viewjob?jk=...).
 */

export class IndeedAdapter {
  static provider = 'INDEED';

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    if (url.toLowerCase().includes('indeed.com/viewjob') || url.toLowerCase().includes('indeed.com/jobs')) return true;
    return Boolean(
      doc.querySelector('#jobDescriptionText') ||
      doc.querySelector('.jobsearch-JobInfoHeader-title') ||
      doc.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]')
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
      doc.querySelector('.jobsearch-JobInfoHeader-title') ||
      doc.querySelector('[data-testid="jobsearch-JobInfoHeader-title"]') ||
      doc.querySelector('h1.jobsearch-JobInfoHeader-title') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('[data-testid="inlineHeader-companyName"]') ||
      doc.querySelector('.jobsearch-CompanyInfoContainer a') ||
      doc.querySelector('.jobsearch-InlineCompanyRating-companyHeader') ||
      doc.querySelector('.companyName');

    const locationEl =
      doc.querySelector('[data-testid="inlineHeader-companyLocation"]') ||
      doc.querySelector('[data-testid="job-location"]') ||
      doc.querySelector('.jobsearch-JobInfoHeader-companyLocation') ||
      doc.querySelector('.companyLocation');

    const descEl =
      doc.querySelector('#jobDescriptionText') ||
      doc.querySelector('.jobsearch-jobDescriptionText') ||
      doc.querySelector('#jobDetailsSection');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const company = companyEl ? companyEl.textContent.trim() : 'Company';
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
      provider: IndeedAdapter.provider,
      title: title || 'Untitled Role',
      company,
      location: location || 'Not specified',
      workplace,
      employmentType: combinedText.includes('intern') ? 'INTERN' : combinedText.includes('contract') ? 'CONTRACT' : 'FULL_TIME',
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description,
    };
  }
}
