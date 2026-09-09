import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Naukri.com Job Page Extraction Adapter (P16-001F-5).
 *
 * Naukri is India's largest job board. Job detail pages
 * (`/job-listings-<slug>-<id>`) are client-rendered: the title/company/
 * description arrive via embedded state (`window.__NEXT_DATA__` or legacy
 * `window.INITIAL_STATE`), while server-rendered fallbacks exist in
 * OpenGraph meta tags and (on some templates) schema.org JSON-LD.
 *
 * The adapter tries, in order:
 *   1. schema.org JobPosting JSON-LD (when present)
 *   2. embedded hydration state (__NEXT_DATA__ / INITIAL_STATE)
 *   3. OpenGraph + semantic DOM fallback
 */

export class NaukriAdapter {
  static provider = 'NAUKRI';

  static HOST_PATTERN = /(^|\.)(naukri\.com)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    if (NaukriAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    return Boolean(
      doc.querySelector('.job-desc') ||
      doc.querySelector('#job_description') ||
      doc.querySelector('[class*="job-detail"]')
    );
  }

  /**
   * Pulls the deepest `props` payload from a __NEXT_DATA__ script.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  static extractNextData(doc) {
    const el = doc.querySelector('#__NEXT_DATA__') || doc.querySelector('script#__NEXT_DATA__');
    if (!el || typeof el.textContent !== 'string') return null;
    try {
      const parsed = JSON.parse(el.textContent);
      return parsed?.props?.pageProps ?? parsed ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Legacy Naukri hydration blob (pre-Next templates).
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  static extractInitialState(doc) {
    const scripts = typeof doc.querySelectorAll === 'function'
      ? doc.querySelectorAll('script')
      : [];
    for (const script of scripts) {
      const text = typeof script.textContent === 'string' ? script.textContent : '';
      if (!text.includes('window.INITIAL_STATE')) continue;
      try {
        const start = text.indexOf('{');
        const candidate = start >= 0 ? text.slice(start) : '';
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        /* best-effort only */
      }
    }
    return null;
  }

  /**
   * Depth-first search for the first object that looks like a Naukri job detail.
   *
   * @param {unknown} node Hydration tree
   * @returns {object|null}
   */
  static findJobDetail(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = NaukriAdapter.findJobDetail(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const keys = Object.keys(node);
    const hasTitle = keys.some((k) => k === 'title' || k === 'jobTitle' || k === 'jobTitleFromJD');
    const hasBody = keys.some(
      (k) => k === 'jobDescription' || k === 'description' || k === 'jdBody' || k === 'jdUrl'
    );
    if (hasTitle && hasBody) return node;
    for (const key of keys) {
      const found = NaukriAdapter.findJobDetail(node[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  /** Strips HTML tags and common entities from a description fragment. */
  static stripHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    // 1. JSON-LD when the template ships it
    const jsonLd = extractJobPostingJsonLd(doc);
    if (jsonLd) {
      return jsonLdToJobPayload(jsonLd, url, NaukriAdapter.provider);
    }

    // 2. Embedded hydration state
    const hydration = NaukriAdapter.extractNextData(doc) || NaukriAdapter.extractInitialState(doc);
    if (hydration) {
      const job = NaukriAdapter.findJobDetail(hydration);
      if (job) {
        const title = job.title || job.jobTitle || job.jobTitleFromJD || '';
        const company =
          job.companyName || job.company?.name || job.company || '';
        const descriptionRaw =
          job.jobDescription || job.description || job.jdBody || '';
        const description = NaukriAdapter.stripHtml(
          typeof descriptionRaw === 'string' ? descriptionRaw : JSON.stringify(descriptionRaw)
        );

        const locationParts = [
          job.location,
          job.city,
          job.state,
          Array.isArray(job.locations) ? job.locations.join(', ') : '',
        ].filter(Boolean);
        const location = String(locationParts[0] || 'Not specified');

        const combined = `${title} ${location} ${description}`.toLowerCase();
        const requirements = [];
        const descEl =
          doc.querySelector('.job-desc') ||
          doc.querySelector('#job_description') ||
          doc.querySelector('[class*="job-detail"]');
        if (descEl && typeof descEl.querySelectorAll === 'function') {
          descEl.querySelectorAll('li').forEach((li) => {
            const text = li.textContent.trim();
            if (text.length > 10 && requirements.length < 30) requirements.push(text);
          });
        }

        let workplace = 'UNKNOWN';
        if (combined.includes('remote') || combined.includes('work from home')) workplace = 'REMOTE';
        else if (combined.includes('hybrid')) workplace = 'HYBRID';
        else if (location && !location.toLowerCase().includes('not specified')) workplace = 'ON_SITE';

        return {
          sourceUrl: url,
          provider: NaukriAdapter.provider,
          title: NaukriAdapter.stripHtml(title) || 'Untitled Role',
          company: NaukriAdapter.stripHtml(company) || 'Company',
          location,
          workplace,
          employmentType: classifyEmploymentType(combined),
          description,
          requirements: requirements.slice(0, 30),
          responsibilities: [],
          compensation: job.salary || job.salaryRange || null,
          rawText: description,
        };
      }
    }

    // 3. OpenGraph / DOM fallback (server-rendered meta is present on detail pages)
    const metaContent = (selector) =>
      doc.querySelector(selector)?.content?.trim() || '';

    const title =
      metaContent('meta[property="og:title"]') ||
      doc.querySelector('h1[class*="title"]')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      '';

    // Naukri og:title convention: "<Role> - <Company> - <Years exp> - <Location>"
    let cleanTitle = title;
    let ogCompany = '';
    let ogLocation = '';
    if (title.includes(' - ')) {
      const parts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        cleanTitle = parts[0];
        ogCompany = parts[1];
        ogLocation = parts[parts.length - 1];
      }
    }

    const company =
      ogCompany ||
      metaContent('meta[name="companyName"]') ||
      doc.querySelector('.comp-name')?.textContent?.trim() ||
      doc.querySelector('[class*="company-name"]')?.textContent?.trim() ||
      'Company';

    const location =
      ogLocation ||
      doc.querySelector('.loc')?.textContent?.trim() ||
      doc.querySelector('[class*="location"]')?.textContent?.trim() ||
      'Not specified';

    const descEl =
      doc.querySelector('.job-desc') ||
      doc.querySelector('#job_description') ||
      doc.querySelector('[class*="job-detail"]') ||
      doc.querySelector('[class*="job-description"]');

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
      provider: NaukriAdapter.provider,
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
