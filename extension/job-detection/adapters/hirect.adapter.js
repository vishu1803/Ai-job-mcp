import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Hirect.in Job Page Extraction Adapter (P16-001F-5).
 *
 * Hirect is an India-focused direct-hire startup job board. Job detail pages
 * (`/job-detail/<id>`) are a client-rendered SPA that ships schema.org
 * JobPosting JSON-LD in the server response plus Nuxt-style hydration state;
 * OpenGraph meta is the reliable server-rendered fallback.
 */

export class HirectAdapter {
  static provider = 'HIRECT';

  static HOST_PATTERN = /(^|\.)(hirect\.(?:in|com))$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (HirectAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(doc.querySelector('[class*="job-detail"]'));
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
      return jsonLdToJobPayload(jsonLd, url, HirectAdapter.provider);
    }

    // 2. OG meta / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const title =
      doc.querySelector('h1')?.textContent?.trim() ||
      metaContent('meta[property="og:title"]') ||
      '';

    const companyEl =
      doc.querySelector('[class*="company-name"]') ||
      doc.querySelector('[class*="companyName"]');

    const locationEl =
      doc.querySelector('[class*="job-location"]') ||
      doc.querySelector('[class*="location"]');

    const descEl =
      doc.querySelector('[class*="job-description"]') ||
      doc.querySelector('[class*="job-detail"]') ||
      doc.querySelector('main');

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
      provider: HirectAdapter.provider,
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
