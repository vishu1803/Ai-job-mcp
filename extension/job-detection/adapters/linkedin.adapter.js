import { classifyEmploymentType } from '../employment-type.js';

/**
 * @file LinkedIn Job Page Extraction Adapter (P15-001).
 *
 * Extracts structured job posting metadata from LinkedIn job detail pages
 * (linkedin.com/jobs/view/<id>).
 */

export class LinkedInAdapter {
  static provider = 'LINKEDIN';

  /**
   * Determines whether this adapter can handle the given page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    if (url.toLowerCase().includes('linkedin.com/jobs')) return true;
    return Boolean(
      doc.querySelector('.job-details-jobs-unified-top-card') ||
      doc.querySelector('.jobs-description') ||
      doc.querySelector('.jobs-details__main-content')
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
      doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.jobs-unified-top-card__job-title') ||
      doc.querySelector('h1.top-card-layout__title') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      doc.querySelector('.jobs-unified-top-card__company-name') ||
      doc.querySelector('.topcard__flavor--black-link') ||
      doc.querySelector('a.topcard__org-name-link');

    const locationEl =
      doc.querySelector('.job-details-jobs-unified-top-card__bullet') ||
      doc.querySelector('.jobs-unified-top-card__bullet') ||
      doc.querySelector('.topcard__flavor--bullet');

    const descEl =
      doc.querySelector('#job-details') ||
      doc.querySelector('.jobs-description__content') ||
      doc.querySelector('.jobs-box__html-content') ||
      doc.querySelector('.show-more-less-html__markup');

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
      provider: LinkedInAdapter.provider,
      title: title || 'Untitled Role',
      company,
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
