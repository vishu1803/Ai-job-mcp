import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Shine.com Job Page Extraction Adapter (P16-001F-5).
 *
 * Shine (formerly Shine.com, part of HT Media) is a major Indian job portal.
 * Detail pages (`/job/...` or new-detail templates) ship schema.org JobPosting
 * JSON-LD on most templates; OpenGraph meta and semantic DOM cover the rest.
 */

export class ShineAdapter {
  static provider = 'SHINE';

  static HOST_PATTERN = /(^|\.)(shine\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (ShineAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(
      doc.querySelector('.job-title-title') ||
      doc.querySelector('#job-description')
    );
  }

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    // 1. JSON-LD primary
    const jsonLd = extractJobPostingJsonLd(doc);
    if (jsonLd) {
      return jsonLdToJobPayload(jsonLd, url, ShineAdapter.provider);
    }

    // 2. OG / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const titleEl =
      doc.querySelector('.job-title-title') ||
      doc.querySelector('h1[class*="job-title"]') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('.job-company-name') ||
      doc.querySelector('[class*="company-name"]') ||
      doc.querySelector('[class*="companyName"]') ||
      doc.querySelector('a[href*="/company-profile/"]');

    const locationEl =
      doc.querySelector('.job-location, [class*="location"]');

    const descEl =
      doc.querySelector('#job-description') ||
      doc.querySelector('.jd-job-desc, [class*="job-description"], [class*="job_desc"]');

    const title = titleEl
      ? titleEl.textContent.trim()
      : metaContent('meta[property="og:title"]');
    const company = companyEl
      ? companyEl.textContent.trim()
      : metaContent('meta[property="og:site_name"]') || 'Company';
    const location = locationEl ? locationEl.textContent.trim() : 'Not specified';
    const description = descEl
      ? descEl.textContent.trim()
      : metaContent('meta[property="og:description"]') ||
        (doc.body ? doc.body.textContent.trim().slice(0, 20000) : '');

    const requirements = [];
    if (descEl && typeof descEl.querySelectorAll === 'function') {
      descEl.querySelectorAll('li').forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 10 && requirements.length < 30) requirements.push(text);
      });
    }

    const combined = `${title} ${location} ${description}`.toLowerCase();
    let workplace = 'UNKNOWN';
    if (combined.includes('remote') || combined.includes('work from home')) workplace = 'REMOTE';
    else if (combined.includes('hybrid')) workplace = 'HYBRID';
    else if (location && !location.toLowerCase().includes('not specified')) workplace = 'ON_SITE';

    return {
      sourceUrl: url,
      provider: ShineAdapter.provider,
      title: title || 'Untitled Role',
      company,
      location,
      workplace,
      employmentType: classifyEmploymentType(combined),
      description,
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description,
    };
  }
}
