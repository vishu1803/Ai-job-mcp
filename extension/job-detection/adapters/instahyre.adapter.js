import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Instahyre Job Page Extraction Adapter (P16-001F-5).
 *
 * Instahyre is an India-focused tech hiring platform. Job detail pages are
 * Vue/Nuxt SPAs; the server response embeds JSON-LD on some templates and
 * OpenGraph meta plus semantic DOM elsewhere. Extraction tries JSON-LD →
 * OG meta → DOM heuristics.
 */

export class InstahyreAdapter {
  static provider = 'INSTAHYRE';

  static HOST_PATTERN = /(^|\.)(instahyre\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (InstahyreAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(doc.querySelector('[class*="job-description"]'));
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
      return jsonLdToJobPayload(jsonLd, url, InstahyreAdapter.provider);
    }

    // 2. OG / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const title =
      doc.querySelector('h1')?.textContent?.trim() ||
      metaContent('meta[property="og:title"]') ||
      '';

    // Instahyre og:title convention: "<Role> - <Company> hiring ..." — keep
    // the role part clean and derive the company when possible.
    let cleanTitle = title;
    let ogCompany = '';
    if (title.includes(' - ')) {
      const parts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        cleanTitle = parts[0];
        ogCompany = parts[1];
      }
    }

    const company =
      ogCompany ||
      metaContent('meta[property="og:site_name"]') ||
      doc.querySelector('[class*="company-name"]')?.textContent?.trim() ||
      'Company';

    const locationEl =
      doc.querySelector('[class*="location"]') ||
      doc.querySelector('.job-location');
    const location = locationEl ? locationEl.textContent.trim() : 'Not specified';

    const descEl =
      doc.querySelector('[class*="job-description"]') ||
      doc.querySelector('main');
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
      provider: InstahyreAdapter.provider,
      title: cleanTitle || 'Untitled Role',
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
