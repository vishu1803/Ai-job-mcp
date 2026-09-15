import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

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
    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.includes('linkedin.com')) return false;

    // Explicit non-job sections on LinkedIn
    if (
      lowerUrl.includes('/feed') ||
      lowerUrl.includes('/in/') ||
      lowerUrl.includes('/messaging') ||
      lowerUrl.includes('/notifications') ||
      lowerUrl.includes('/mynetwork') ||
      lowerUrl.includes('/settings') ||
      lowerUrl.includes('/learning') ||
      lowerUrl.includes('/pulse') ||
      lowerUrl.includes('/groups')
    ) {
      return false;
    }

    // Company homepages / posts (unless specifically viewing job details)
    if (lowerUrl.includes('/company/') && !lowerUrl.includes('/jobs') && !lowerUrl.includes('currentjobid=')) {
      return false;
    }

    // Priority 1 — Canonical URL identity
    const hasCanonicalUrl =
      lowerUrl.includes('/jobs/view/') ||
      /[?&]currentjobid=\d+/i.test(url);

    if (hasCanonicalUrl) {
      return true;
    }

    // Priority 3 — Structured data (JSON-LD JobPosting)
    if (doc && typeof doc.querySelectorAll === 'function') {
      const jsonLd = extractJobPostingJsonLd(doc);
      if (jsonLd && (jsonLd.title || jsonLd.name || jsonLd.description)) {
        return true;
      }
    }

    // Priority 4 — Active Job-specific DOM structure
    // On search or collections pages, require an ACTIVE job details pane or top-card
    // (a raw search result listing without an active selected job does not count)
    if (doc && typeof doc.querySelector === 'function') {
      const hasActiveTopCard = Boolean(
        doc.querySelector('.job-details-jobs-unified-top-card') ||
        doc.querySelector('.jobs-details__main-content') ||
        doc.querySelector('.jobs-search__job-details') ||
        doc.querySelector('.job-view-layout') ||
        doc.querySelector('[data-view-name="job-details"]') ||
        doc.querySelector('h1.top-card-layout__title')
      );

      const hasJobDescription = Boolean(
        doc.querySelector('.show-more-less-html__markup') ||
        doc.querySelector('#job-details') ||
        doc.querySelector('.jobs-description__content') ||
        doc.querySelector('.jobs-description')
      );

      if (hasActiveTopCard || hasJobDescription) {
        return true;
      }

      // Check for standalone active job container with job ID
      if (doc.querySelector('[data-job-id].jobs-search-results-list__list-item--active')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts and normalizes job payload from the document.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    let externalJobId = null;
    const urlMatch = url.match(/\/jobs\/view\/(\d+)/i) || url.match(/[?&]currentJobId=(\d+)/i);
    if (urlMatch) {
      externalJobId = urlMatch[1];
    } else if (doc && typeof doc.querySelector === 'function') {
      const elWithId = doc.querySelector('[data-job-id], [data-job-runner-job-id]');
      if (elWithId) {
        externalJobId =
          elWithId.getAttribute('data-job-id') || elWithId.getAttribute('data-job-runner-job-id');
      }
    }

    const titleEl =
      doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.jobs-unified-top-card__job-title') ||
      doc.querySelector('h1.top-card-layout__title') ||
      doc.querySelector('.job-details-jobs-unified-top-card h1') ||
      doc.querySelector('.jobs-details__main-content h1') ||
      doc.querySelector('.top-card-layout__title') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      doc.querySelector('.jobs-unified-top-card__company-name') ||
      doc.querySelector('a.topcard__org-name-link') ||
      doc.querySelector('.topcard__flavor--black-link') ||
      doc.querySelector('.job-details-jobs-unified-top-card__primary-description a');

    const locationEl =
      doc.querySelector('.job-details-jobs-unified-top-card__bullet') ||
      doc.querySelector('.jobs-unified-top-card__bullet') ||
      doc.querySelector('span.topcard__flavor--bullet') ||
      doc.querySelector('.topcard__flavor--bullet');

    const descEl =
      doc.querySelector('.show-more-less-html__markup') ||
      doc.querySelector('#job-details') ||
      doc.querySelector('.jobs-description__content') ||
      doc.querySelector('.jobs-box__html-content') ||
      doc.querySelector('.jobs-description');

    const title = titleEl ? titleEl.textContent.trim() : '';

    // Fallback: JSON-LD JobPosting data
    if (!title) {
      const jsonLd = extractJobPostingJsonLd(doc);
      if (jsonLd) {
        const payload = jsonLdToJobPayload(jsonLd, url, LinkedInAdapter.provider);
        if (externalJobId) payload.externalJobId = externalJobId;
        return payload;
      }
    }

    const company = companyEl ? companyEl.textContent.trim() : 'Company';
    const location = locationEl ? locationEl.textContent.trim() : '';
    const description = descEl ? descEl.textContent.trim() : (doc.body ? doc.body.textContent.trim() : '');

    const requirements = [];
    if (descEl) {
      descEl.querySelectorAll('li').forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 5) requirements.push(text);
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
      externalJobId,
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
