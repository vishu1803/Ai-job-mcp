import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file TimesJobs Job Page Extraction Adapter (P16-001F-5).
 *
 * TimesJobs (timesjobs.com, Times of India group) is a high-volume Indian job
 * portal with server-rendered detail pages (`/jobdetail/...`). Pages carry
 * semantic DOM (`#jobDescription`, `.job-title`) and OG meta; JSON-LD appears
 * on newer templates.
 */

export class TimesJobsAdapter {
  static provider = 'TIMESJOBS';

  static HOST_PATTERN = /(^|\.)(timesjobs\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (TimesJobsAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(
      doc.querySelector('#jobDescription') ||
      doc.querySelector('.job-detail-head')
    );
  }

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    // 1. JSON-LD when present
    const jsonLd = extractJobPostingJsonLd(doc);
    if (jsonLd) {
      return jsonLdToJobPayload(jsonLd, url, TimesJobsAdapter.provider);
    }

    // 2. DOM / OG fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const titleEl =
      doc.querySelector('.job-title') ||
      doc.querySelector('h1[class*="job"]') ||
      doc.querySelector('.job-detail-head h1') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('.company-name') ||
      doc.querySelector('[class*="companyName"]') ||
      doc.querySelector('.jd-company') ||
      doc.querySelector('.job-company') ||
      doc.querySelector('a[href*="/top-companies/"]');

    const locationEl =
      doc.querySelector('.job-location') ||
      doc.querySelector('[class*="location"]') ||
      doc.querySelector('.jd-loc');

    const descEl =
      doc.querySelector('#jobDescription') ||
      doc.querySelector('.job-description') ||
      doc.querySelector('[class*="jobDesc"]') ||
      doc.querySelector('.jd-desc');

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
      provider: TimesJobsAdapter.provider,
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
