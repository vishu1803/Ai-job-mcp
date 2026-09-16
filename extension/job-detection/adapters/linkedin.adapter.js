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

    // Priority 2 — Structured data (JSON-LD JobPosting)
    if (doc && typeof doc.querySelectorAll === 'function') {
      const jsonLd = extractJobPostingJsonLd(doc);
      if (jsonLd && (jsonLd.title || jsonLd.name || jsonLd.description)) {
        return true;
      }
    }

    // Priority 3 — Active Job-specific DOM structure
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
        doc.querySelector('.jobs-box__html-content') ||
        doc.querySelector('.jobs-description') ||
        doc.querySelector('article.jobs-description__container')
      );

      if (hasActiveTopCard || hasJobDescription) {
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
      const activeRailItem =
        doc.querySelector('.jobs-search-results-list__list-item--active') ||
        doc.querySelector('[data-occludable-job-id]');
      const elWithId =
        activeRailItem ||
        doc.querySelector('.jobs-search-results-list__list-item--active[data-occludable-job-id]') ||
        doc.querySelector('.jobs-search-results-list__list-item--active[data-job-id]') ||
        doc.querySelector('[data-view-name="job-details"] [data-job-id]') ||
        doc.querySelector('.job-details-jobs-unified-top-card [data-job-id]') ||
        doc.querySelector('[data-current-job-id]') ||
        doc.querySelector('[data-job-id], [data-job-runner-job-id]');
      if (elWithId) {
        externalJobId =
          elWithId.getAttribute?.('data-occludable-job-id') ||
          elWithId.getAttribute?.('data-current-job-id') ||
          elWithId.getAttribute?.('data-job-id') ||
          elWithId.getAttribute?.('data-job-runner-job-id');
      }
    }

    // Title candidates organized by priority
    const titleEl =
      doc.querySelector('h1.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('h2.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.job-details-jobs-unified-top-card__job-title-link') ||
      doc.querySelector('.job-details-jobs-unified-top-card__job-title-link a') ||
      doc.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      doc.querySelector('.jobs-unified-top-card__job-title') ||
      doc.querySelector('h1.top-card-layout__title') ||
      doc.querySelector('h1.topcard__title') ||
      doc.querySelector('.job-details-jobs-unified-top-card h1') ||
      doc.querySelector('.job-details-jobs-unified-top-card h2') ||
      doc.querySelector('[data-view-name="job-details"] h1') ||
      doc.querySelector('[data-view-name="job-details"] h2') ||
      doc.querySelector('.jobs-details__main-content h1') ||
      doc.querySelector('.jobs-details__main-content h2') ||
      doc.querySelector('.job-view-layout h1') ||
      doc.querySelector('.jobs-search__job-details h1') ||
      doc.querySelector('h1.t-24') ||
      doc.querySelector('h2.t-24') ||
      doc.querySelector('.top-card-layout__title') ||
      doc.querySelector('[data-view-name="job-details"] [class*="title" i]') ||
      doc.querySelector('.jobs-details__main-content [class*="title" i]');

    // Company candidates organized by priority
    const companyEl =
      doc.querySelector('.job-details-jobs-unified-top-card__company-name a') ||
      doc.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      doc.querySelector('.jobs-unified-top-card__company-name a') ||
      doc.querySelector('.jobs-unified-top-card__company-name') ||
      doc.querySelector('.job-details-jobs-unified-top-card__subtitle-primary-grouping a') ||
      doc.querySelector('.job-details-jobs-unified-top-card__subtitle-grouping a') ||
      doc.querySelector('.jobs-unified-top-card__subtitle-primary-grouping a') ||
      doc.querySelector('a.topcard__org-name-link') ||
      doc.querySelector('a[data-tracking-control-name*="org-name"]') ||
      doc.querySelector('.topcard__flavor--black-link') ||
      doc.querySelector('.job-details-jobs-unified-top-card__primary-description a[href*="/company/"]') ||
      doc.querySelector('.jobs-details__main-content a[href*="/company/"]') ||
      doc.querySelector('[data-view-name="job-details"] a[href*="/company/"]') ||
      doc.querySelector('.jobs-details__main-content [data-tracking-control-name*="company"]') ||
      doc.querySelector('[data-view-name="job-details"] [class*="company" i]');

    const locationEl =
      doc.querySelector('.job-details-jobs-unified-top-card__bullet') ||
      doc.querySelector('.jobs-unified-top-card__bullet') ||
      doc.querySelector('.job-details-jobs-unified-top-card__primary-description-container span.tvm__text') ||
      doc.querySelector('span.topcard__flavor--bullet') ||
      doc.querySelector('.topcard__flavor--bullet') ||
      doc.querySelector('[data-view-name="job-details"] [class*="bullet" i]');

    let location = locationEl ? locationEl.textContent.trim() : '';

    // Description candidates (STRICTLY localized job-detail regions, NEVER doc.body)
    const descEl =
      doc.querySelector('.show-more-less-html__markup') ||
      doc.querySelector('#job-details') ||
      doc.querySelector('.jobs-description__content') ||
      doc.querySelector('.jobs-box__html-content') ||
      doc.querySelector('.jobs-description') ||
      doc.querySelector('article.jobs-description__container') ||
      doc.querySelector('[data-view-name="job-details"] article') ||
      doc.querySelector('[data-view-name="job-details"] [class*="description" i]') ||
      doc.querySelector('.jobs-details__main-content article') ||
      doc.querySelector('.jobs-details__main-content [class*="description" i]') ||
      doc.querySelector('.jobs-description-content__text') ||
      doc.querySelector('[data-job-description]');

    const jsonLd = doc && typeof doc.querySelectorAll === 'function' ? extractJobPostingJsonLd(doc) : null;

    let title = titleEl ? titleEl.textContent.trim() : '';
    let company = companyEl ? companyEl.textContent.trim() : '';

    if (company) {
      if (company.includes('\n')) {
        company = company.split('\n')[0].trim();
      }
      if (company.length > 80) {
        company = '';
      }
    }

    // JSON-LD upfront fallbacks
    if (!title && jsonLd && (jsonLd.title || jsonLd.name)) {
      title = (jsonLd.title || jsonLd.name).trim();
    }
    if ((!company || company === 'Company') && jsonLd?.hiringOrganization?.name) {
      company = jsonLd.hiringOrganization.name.trim();
    }

    // Resilient document.title fallback (Pipe format, Hiring format, At format)
    if ((!title || !company) && doc?.title && typeof doc.title === 'string') {
      const docTitle = doc.title.trim();

      // Pattern 1: Title | Company | LinkedIn (Standard 3-part desktop LinkedIn pipe format)
      const pipeParts = docTitle.split('|').map((s) => s.trim()).filter(Boolean);
      if (pipeParts.length >= 3 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
        if (!title) title = pipeParts[0];
        if (!company || company === 'Company') company = pipeParts[1];
      }

      // Pattern 2: Company hiring Title in Location | LinkedIn
      if (!title || !company) {
        const hiringMatch = docTitle.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+([^|]+?))?\s*\|\s*LinkedIn/i);
        if (hiringMatch) {
          if (!company || company === 'Company') company = hiringMatch[1].trim();
          if (!title) title = hiringMatch[2].trim();
          if (hiringMatch[3] && (!locationEl || !locationEl.textContent.trim())) {
            location = hiringMatch[3].trim();
          }
        }
      }

      // Pattern 3: Title at Company | LinkedIn
      if (!title || !company) {
        const atMatch = docTitle.match(/^(.+?)\s+at\s+([^|]+?)\s*\|\s*LinkedIn/i);
        if (atMatch) {
          if (!title) title = atMatch[1].trim();
          if (!company || company === 'Company') {
            let matchedCompany = atMatch[2].trim();
            // Clean location suffix e.g. "Appinventiv — India" or "Appinventiv - Noida"
            matchedCompany = matchedCompany.replace(/\s*[\u2014\u2013-]\s*.*$/, '').trim();
            company = matchedCompany;
          }
        }
      }

      // Pattern 4: Title | LinkedIn (2-part fallback)
      if (!title && pipeParts.length === 2 && pipeParts[pipeParts.length - 1].toLowerCase().includes('linkedin')) {
        title = pipeParts[0];
      }
    }

    if (company && company.length > 80) {
      company = '';
    }
    if (company === 'Company') {
      company = '';
    }

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

    // Description extraction strictly from localized container or JSON-LD (NEVER doc.body)
    let description = descEl ? descEl.textContent.trim().replace(/\s+/g, ' ') : '';
    if (description.length < 50 && jsonLd?.description) {
      const cleanJsonLdDesc = jsonLd.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanJsonLdDesc.length > description.length) {
        description = cleanJsonLdDesc;
      }
    }

    const requirements = [];
    if (descEl && typeof descEl.querySelectorAll === 'function') {
      descEl.querySelectorAll('li').forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 5) requirements.push(text);
      });
    }

    // Optional supporting signal: Easy Apply / Apply button presence
    const hasApplyCta = Boolean(
      doc.querySelector?.(
        '.jobs-apply-button, button[class*="jobs-apply-button" i], button[data-job-id], [data-view-name="job-apply-button"], [aria-label*="Easy Apply" i], [aria-label*="Apply to" i]'
      )
    );

    const hasMeaningfulCompany = Boolean(company && company !== 'Company');
    const hasMeaningfulDescription = Boolean(description && description.length >= 50);
    const hasValidTitle = Boolean(title && title !== 'Untitled Role');

    // Readiness gate: strong job-detail context + valid title + substantive content.
    // Detection readiness: valid identity, title, and company or description.
    const isReady = Boolean(hasValidTitle && (hasMeaningfulCompany || hasMeaningfulDescription));
    // Analysis readiness (P70): valid detected job with substantive description >= 50 chars.
    const analysisReady = Boolean(hasValidTitle && hasMeaningfulDescription);

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
      externalJobId: externalJobId || null,
      title: title || 'Untitled Role',
      company: company || '',
      location: location || 'Not specified',
      workplace,
      employmentType: classifyEmploymentType(combinedText),
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description,
      hasApplyCta,
      isReady,
      analysisReady,
    };
  }
}
