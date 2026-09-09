import { classifyEmploymentType } from '../employment-type.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../json-ld.js';

/**
 * @file Cutshort Job Page Extraction Adapter (P16-001F-5).
 *
 * Cutshort is an Indian AI-powered startup hiring network. Job detail pages
 * (`/jobs/<slug>`) are Next.js-rendered with `__NEXT_DATA__` hydration state
 * and (on current templates) schema.org JobPosting JSON-LD.
 */

export class CutshortAdapter {
  static provider = 'CUTSHORT';

  static HOST_PATTERN = /(^|\.)(cutshort\.io)$/i;

  /**
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    try {
      if (CutshortAdapter.HOST_PATTERN.test(new URL(url).hostname)) return true;
    } catch {
      /* fall through to DOM heuristics */
    }
    return Boolean(doc.querySelector('[class*="job-view"]'));
  }

  /**
   * Pulls the deepest `props` payload from a __NEXT_DATA__ script.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  static extractNextData(doc) {
    const el = doc.querySelector('#__NEXT_DATA__');
    if (!el || typeof el.textContent !== 'string') return null;
    try {
      const parsed = JSON.parse(el.textContent);
      return parsed?.props?.pageProps ?? parsed ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Depth-first search for the first object that looks like a Cutshort job.
   *
   * @param {unknown} node Hydration tree
   * @param {number} depth
   * @returns {object|null}
   */
  static findJobDetail(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = CutshortAdapter.findJobDetail(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const keys = Object.keys(node);
    const hasTitle = keys.includes('title');
    const hasBody =
      keys.includes('description') ||
      keys.includes('content') ||
      keys.includes('skills') ||
      keys.includes('responsibilities');
    if (hasTitle && hasBody) return node;
    for (const key of keys) {
      const found = CutshortAdapter.findJobDetail(node[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  /** Strips HTML tags/entities from description fragments. */
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
    // 1. JSON-LD primary
    const jsonLd = extractJobPostingJsonLd(doc);
    if (jsonLd) {
      return jsonLdToJobPayload(jsonLd, url, CutshortAdapter.provider);
    }

    // 2. __NEXT_DATA__ hydration
    const hydration = CutshortAdapter.extractNextData(doc);
    if (hydration) {
      const job = CutshortAdapter.findJobDetail(hydration);
      if (job) {
        const title = job.title || '';
        const company = job.company?.name || job.companyName || job.company || '';
        const descriptionRaw = job.description || job.content || '';
        const description = CutshortAdapter.stripHtml(
          typeof descriptionRaw === 'string' ? descriptionRaw : JSON.stringify(descriptionRaw)
        );
        const skills = Array.isArray(job.skills)
          ? job.skills.map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean)
          : [];

        const combined = `${title} ${description}`.toLowerCase();
        let workplace = 'UNKNOWN';
        const location = job.location || job.locationName || 'Not specified';
        if (combined.includes('remote') || job.remote === true) workplace = 'REMOTE';
        else if (combined.includes('hybrid')) workplace = 'HYBRID';
        else if (location !== 'Not specified') workplace = 'ON_SITE';

        return {
          sourceUrl: url,
          provider: CutshortAdapter.provider,
          title: CutshortAdapter.stripHtml(title) || 'Untitled Role',
          company: CutshortAdapter.stripHtml(company) || 'Company',
          location,
          workplace,
          employmentType: classifyEmploymentType(combined),
          description,
          requirements: skills.slice(0, 30),
          responsibilities: [],
          compensation:
            job.salary || (job.maxSalary ? `${job.minSalary || ''}-${job.maxSalary}` : null),
          rawText: description,
        };
      }
    }

    // 3. OG / DOM fallback
    const metaContent = (selector) => doc.querySelector(selector)?.content?.trim() || '';
    const title =
      doc.querySelector('h1')?.textContent?.trim() || metaContent('meta[property="og:title"]');
    const company =
      metaContent('meta[property="og:site_name"]') ||
      doc.querySelector('[class*="company-name"]')?.textContent?.trim() ||
      'Company';
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

    const combined = `${title} ${description}`.toLowerCase();
    let workplace = 'UNKNOWN';
    if (combined.includes('remote') || combined.includes('work from home')) workplace = 'REMOTE';
    else if (combined.includes('hybrid')) workplace = 'HYBRID';

    return {
      sourceUrl: url,
      provider: CutshortAdapter.provider,
      title: title || 'Untitled Role',
      company,
      location: 'Not specified',
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
