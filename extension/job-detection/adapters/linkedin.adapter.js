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
      doc.querySelector('h2.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.jobs-unified-top-card__job-title') ||
      doc.querySelector('h1.top-card-layout__title') ||
      doc.querySelector('.job-details-jobs-unified-top-card h1') ||
      doc.querySelector('.job-details-jobs-unified-top-card h2') ||
      doc.querySelector('.jobs-details__main-content h1') ||
      doc.querySelector('.jobs-details__main-content h2') ||
      doc.querySelector('.job-view-layout h1') ||
      doc.querySelector('[data-view-name="job-details"] h1') ||
      doc.querySelector('.jobs-search__job-details h1') ||
      doc.querySelector('h1.topcard__title') ||
      doc.querySelector('h1.t-24') ||
      doc.querySelector('.top-card-layout__title');

    const companyEl =
      doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      doc.querySelector('.jobs-unified-top-card__company-name') ||
      doc.querySelector('a.topcard__org-name-link') ||
      doc.querySelector('.topcard__flavor--black-link') ||
      doc.querySelector('.job-details-jobs-unified-top-card__primary-description a') ||
      doc.querySelector('.jobs-details__main-content a[href*="/company/"]') ||
      doc.querySelector('.jobs-details__main-content [data-tracking-control-name*="company"]');

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
      doc.querySelector('.jobs-description') ||
      doc.querySelector('article.jobs-description__container');

    const jsonLd = doc && typeof doc.querySelectorAll === 'function' ? extractJobPostingJsonLd(doc) : null;

    let title = titleEl ? titleEl.textContent.trim() : '';
    if (!title && jsonLd && (jsonLd.title || jsonLd.name)) {
      title = (jsonLd.title || jsonLd.name).trim();
    }
    if (!title && doc?.title && typeof doc.title === 'string') {
      const docTitle = doc.title.trim();
      const hiringMatch = docTitle.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+[^|]+)?\s*\|\s*LinkedIn/i);
      if (hiringMatch) {
        title = hiringMatch[2].trim();
      } else {
        const atMatch = docTitle.match(/^(.+?)\s+(?:at|–|-)\s+(.+?)\s*\|\s*LinkedIn/i);
        if (atMatch) {
          title = atMatch[1].trim();
        }
      }
    }

    let company = companyEl ? companyEl.textContent.trim() : '';
    if ((!company || company === 'Company') && jsonLd?.hiringOrganization?.name) {
      company = jsonLd.hiringOrganization.name.trim();
    }
    if ((!company || company === 'Company') && doc?.title && typeof doc.title === 'string') {
      const docTitle = doc.title.trim();
      const hiringMatch = docTitle.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+[^|]+)?\s*\|\s*LinkedIn/i);
      if (hiringMatch) {
        company = hiringMatch[1].trim();
      } else {
        const atMatch = docTitle.match(/^(.+?)\s+(?:at|–|-)\s+(.+?)\s*\|\s*LinkedIn/i);
        if (atMatch) {
          company = atMatch[2].trim();
        }
      }
    }
    if (!company) company = 'Company';

    let location = locationEl ? locationEl.textContent.trim() : '';
    if (!location && jsonLd?.jobLocation) {
      const locObj = jsonLd.jobLocation;
      const addr = locObj.address || locObj;
      location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ');
    }
    if (!location && doc?.title && typeof doc.title === 'string') {
      const inMatch = doc.title.match(/\s+in\s+([^|]+)\s*\|\s*LinkedIn/i);
      if (inMatch) {
        location = inMatch[1].trim();
      }
    }

    let description = descEl ? descEl.textContent.trim() : '';
    if (description.length < 50 && jsonLd?.description) {
      const cleanJsonLdDesc = jsonLd.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanJsonLdDesc.length > description.length) {
        description = cleanJsonLdDesc;
      }
    }
    if (!description && doc.body) {
      description = doc.body.textContent.trim();
    }

    const requirements = [];
    if (descEl && typeof descEl.querySelectorAll === 'function') {
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
