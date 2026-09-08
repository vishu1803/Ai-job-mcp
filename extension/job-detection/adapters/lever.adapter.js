import { classifyEmploymentType } from '../employment-type.js';

/**
 * @file Lever Job Page Extraction Adapter (P15-001).
 *
 * Extracts structured job posting metadata from Lever-hosted career pages
 * (jobs.lever.co/<company>/<job_id>).
 */

export class LeverAdapter {
  static provider = 'LEVER';

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    if (url.toLowerCase().includes('jobs.lever.co')) return true;
    return Boolean(
      doc.querySelector('.posting-headline') ||
      doc.querySelector('.lever-job') ||
      doc.querySelector('.posting-categories')
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
      doc.querySelector('.posting-headline h2') ||
      doc.querySelector('.posting-header h2') ||
      doc.querySelector('h2') ||
      doc.querySelector('h1');

    const companyLogo = doc.querySelector('.main-header-logo img');
    let company = companyLogo ? companyLogo.getAttribute('alt') || '' : '';

    if (!company && url) {
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0]) {
          company = parts[0].replace(/[-_]/g, ' ');
          company = company.charAt(0).toUpperCase() + company.slice(1);
        }
      } catch {
        /* ignore url parse error */
      }
    }

    const locationEl = doc.querySelector('.posting-categories .location') || doc.querySelector('.location');
    const workplaceEl = doc.querySelector('.posting-categories .workplaceTypes');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const location = locationEl ? locationEl.textContent.trim() : '';

    // Description container
    const sectionContainers = doc.querySelectorAll('.section-wrapper, [data-qa="job-description"], .posting-page .content');
    let description = '';
    const requirements = [];

    if (sectionContainers.length > 0) {
      sectionContainers.forEach((section) => {
        description += section.textContent.trim() + '\n\n';
        section.querySelectorAll('li').forEach((li) => {
          const text = li.textContent.trim();
          if (text.length > 10) requirements.push(text);
        });
      });
    } else {
      description = doc.body ? doc.body.textContent.trim() : '';
    }

    // Workplace
    let workplace = 'UNKNOWN';
    const wpText = workplaceEl ? workplaceEl.textContent.toLowerCase() : '';
    const combinedText = `${wpText} ${location} ${description}`.toLowerCase();
    if (combinedText.includes('remote')) {
      workplace = 'REMOTE';
    } else if (combinedText.includes('hybrid')) {
      workplace = 'HYBRID';
    } else if (location) {
      workplace = 'ON_SITE';
    }

    return {
      sourceUrl: url,
      provider: LeverAdapter.provider,
      title: title || 'Untitled Role',
      company: company || 'Company',
      location: location || 'Not specified',
      workplace,
      employmentType: classifyEmploymentType(combinedText),
      description: description.trim(),
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description.trim(),
    };
  }
}
