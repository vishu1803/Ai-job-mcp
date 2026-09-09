import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Foundit (Monster India) Job Page Extraction Adapter (P16-001F-5).
 *
 * foundit.in (formerly monsterindia.com) job detail pages ship OpenGraph
 * meta and semantic DOM; JSON-LD appears on many templates. Server-rendered
 * title conventions: "<Role> hiring <Company>" in og:title and dedicated
 * role/company/location header elements.
 */

export class FounditAdapter {
  static provider = 'FOUNDIT';

  static HOST_PATTERN = /(^|\.)(foundit\.in|monsterindia\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (FounditAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(
      doc.querySelector('#jobDescription') ||
      doc.querySelector('[class*="job-detail"]')
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
      return jsonLdToJobPayload(jsonLd, url, FounditAdapter.provider);
    }

    // 2. OG / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';

    const titleEl =
      doc.querySelector('h1[class*="job"]') ||
      doc.querySelector('[class*="job-role"]') ||
      doc.querySelector('h1');

    const companyEl =
      doc.querySelector('[class*="company-name"]') ||
      doc.querySelector('[class*="companyName"]') ||
      doc.querySelector('a[href*="/companies/"]');

    const locationEl =
      doc.querySelector('[class*="location"]') ||
      doc.querySelector('.job-location');

    const descEl =
      doc.querySelector('#jobDescription') ||
      doc.querySelector('[class*="job-description"]') ||
      doc.querySelector('[class*="job-detail"]');

    let title = titleEl
      ? titleEl.textContent.trim()
      : metaContent('meta[property="og:title"]');

    // Foundit og:title convention: "<Role> hiring <Company> - <Location>" or
    // "<Role> - <Company> - <Experience> - <Location>".
    let ogCompany = '';
    let ogLocation = '';
    if (title && !titleEl) {
      const hiringMatch = /^(.*?)\s+hiring\s+(.*)$/i.exec(title);
      if (hiringMatch) {
        // role is actually the second chunk for "X hiring Y" pages: the role
        // leads the title; company follows "hiring".
        const roleCandidate = hiringMatch[1].trim();
        const rest = hiringMatch[2].trim();
        const dashParts = rest.split(/\s+-\s+/).map((p) => p.trim());
        title = roleCandidate || rest.split(/\s+-\s+/)[0];
        ogCompany = dashParts[0] || '';
        ogLocation = dashParts[dashParts.length - 1] || '';
      } else if (title.includes(' - ')) {
        const parts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          title = parts[0];
          ogCompany = parts[1];
          ogLocation = parts[parts.length - 1];
        }
      }
    }

    const company =
      (companyEl ? companyEl.textContent.trim() : '') ||
      ogCompany ||
      metaContent('meta[property="og:site_name"]') ||
      'Company';

    const location =
      (locationEl ? locationEl.textContent.trim() : '') ||
      ogLocation ||
      'Not specified';

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
      provider: FounditAdapter.provider,
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
