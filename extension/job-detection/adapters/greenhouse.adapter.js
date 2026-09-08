import { classifyEmploymentType } from '../employment-type.js';

/**
 * @file Greenhouse Job Page Extraction Adapter (P15-001).
 *
 * Extracts structured job posting metadata from Greenhouse-hosted job boards
 * (boards.greenhouse.io, job-boards.greenhouse.io, embedded greenhouse iframes/divs).
 */

export class GreenhouseAdapter {
  static provider = 'GREENHOUSE';

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('boards.greenhouse.io') || lowerUrl.includes('job-boards.greenhouse.io')) {
      return true;
    }
    return Boolean(
      doc.querySelector('#app_body') ||
      doc.querySelector('.job-post') ||
      doc.querySelector('[data-mapped="job-post"]') ||
      doc.querySelector('#content.job__description')
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
      doc.querySelector('#app_body .app-title') ||
      doc.querySelector('.job__title') ||
      doc.querySelector('h1.app-title') ||
      doc.querySelector('h1.job-title') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('.company-name') ||
      doc.querySelector('#header .company-name') ||
      doc.querySelector('.job__company') ||
      doc.querySelector('meta[property="og:site_name"]');

    const locationEl =
      doc.querySelector('.location') ||
      doc.querySelector('.job__location') ||
      doc.querySelector('.body--metadata');

    let company = companyEl ? (companyEl.content || companyEl.textContent).trim() : '';
    if (!company && url) {
      // Derive from boards.greenhouse.io/<company_token>/jobs/...
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] && parts[0] !== 'jobs' && parts[0] !== 'embed') {
          company = parts[0].replace(/[-_]/g, ' ');
          company = company.charAt(0).toUpperCase() + company.slice(1);
        }
      } catch {
        /* ignore url parse error */
      }
    }

    const title = titleEl ? titleEl.textContent.trim() : '';
    const location = locationEl ? locationEl.textContent.trim() : '';

    // Description container
    const descEl =
      doc.querySelector('#content') ||
      doc.querySelector('#app_body') ||
      doc.querySelector('.job__description') ||
      doc.querySelector('#job-description');

    const description = descEl ? descEl.textContent.trim() : (doc.body ? doc.body.textContent.trim() : '');

    // Extract bullet points for requirements/responsibilities
    const requirements = [];
    const responsibilities = [];
    if (descEl) {
      const listItems = descEl.querySelectorAll('li');
      listItems.forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 10) {
          requirements.push(text);
        }
      });
    }

    // Workplace detection
    let workplace = 'UNKNOWN';
    const combinedText = `${title} ${location} ${description}`.toLowerCase();
    if (combinedText.includes('remote') || combinedText.includes('work from home')) {
      workplace = 'REMOTE';
    } else if (combinedText.includes('hybrid')) {
      workplace = 'HYBRID';
    } else if (location && !location.toLowerCase().includes('remote')) {
      workplace = 'ON_SITE';
    }

    return {
      sourceUrl: url,
      provider: GreenhouseAdapter.provider,
      title: title || 'Untitled Role',
      company: company || 'Company',
      location: location || 'Not specified',
      workplace,
      employmentType: classifyEmploymentType(combinedText),
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: responsibilities.slice(0, 30),
      compensation: null,
      rawText: description,
    };
  }
}
