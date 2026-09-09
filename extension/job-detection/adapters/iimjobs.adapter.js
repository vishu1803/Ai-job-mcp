import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file iimjobs.com Job Page Extraction Adapter (P16-001F-5).
 *
 * iimjobs is a leading Indian management/executive job board (IIM/IIT talent).
 * Job detail pages (`/job/<slug>`) ship schema.org JobPosting JSON-LD, which
 * is the primary extraction source; OpenGraph meta and semantic DOM are the
 * fallbacks for templates where structured data is absent.
 */

export class IimjobsAdapter {
  static provider = 'IIMJOBS';

  static HOST_PATTERN = /(^|\.)(iimjobs\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (IimjobsAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(
      doc.querySelector('.job-title') &&
      doc.querySelector('.job-description, [class*="job_details"]')
    );
  }

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    // 1. JSON-LD primary (confirmed present on /job/<slug> pages)
    const jsonLd = extractJobPostingJsonLd(doc);
    if (jsonLd) {
      return jsonLdToJobPayload(jsonLd, url, IimjobsAdapter.provider);
    }

    // 2. OpenGraph / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const titleEl =
      doc.querySelector('h1[class*="job-title"]') ||
      doc.querySelector('h1') ||
      doc.querySelector('.job-title');

    const companyEl =
      doc.querySelector('[class*="company-name"]') ||
      doc.querySelector('.company-name') ||
      doc.querySelector('a[href*="/company/"]');

    const locationEl =
      doc.querySelector('[class*="location"]') ||
      doc.querySelector('.job-location');

    const descEl =
      doc.querySelector('.job-description') ||
      doc.querySelector('[class*="job_details"]') ||
      doc.querySelector('[class*="job-description"]');

    const title = titleEl ? titleEl.textContent.trim() : metaContent('meta[property="og:title"]');
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
      provider: IimjobsAdapter.provider,
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
