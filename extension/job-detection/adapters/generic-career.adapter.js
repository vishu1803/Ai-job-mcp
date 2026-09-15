/**
 * @file Generic Career Page Extraction Adapter (P15-001).
 *
 * Universal fallback adapter supporting arbitrary company career portals,
 * Ashby, BambooHR, Workable, SmartRecruiters, and custom job description pages
 * via schema.org/JobPosting JSON-LD, OpenGraph metadata, and semantic DOM parsing.
 */

import { extractJobPostingJsonLd, isJobPostingObject } from '../json-ld.js';

export class GenericCareerPageAdapter {
  /**
   * Checks whether an object represents a schema.org JobPosting.
   *
   * @param {unknown} item
   * @returns {boolean}
   */
  static isJobPosting(item) {
    return isJobPostingObject(item);
  }

  static KNOWN_PORTAL_HOSTS = [
    'linkedin.com',
    'greenhouse.io',
    'lever.co',
    'myworkdayjobs.com',
    'workday.com',
    'indeed.com',
    'naukri.com',
    'iimjobs.com',
    'shine.com',
    'foundit.in',
    'foundit.sg',
    'timesjobs.com',
    'hirect.in',
    'cutshort.io',
    'instahyre.com',
  ];

  static NON_JOB_ROUTES = [
    /\/feed\b/i,
    /\/notifications\b/i,
    /\/messaging\b/i,
    /\/settings\b/i,
    /\/account\b/i,
    /\/login\b/i,
    /\/signin\b/i,
    /\/signup\b/i,
    /\/terms\b/i,
    /\/privacy\b/i,
    /\/in\/[a-z0-9_-]+\/?$/i,
  ];

  static provider = 'GENERIC';

  static CAREER_URL_PATTERNS = [
    /jobs\.ashbyhq\.com\//i,
    /[a-z0-9_-]+\.bamboohr\.com\/careers\//i,
    /[a-z0-9_-]+\.workable\.com\/j\//i,
    /[a-z0-9_-]+\.smartrecruiters\.com\//i,
    /jobs\.jobvite\.com\//i,
    /jobs\.lever\.co\//i,
    /boards\.greenhouse\.io\//i,
    /\/(?:careers?|jobs?|openings?|positions?|apply)\/[a-z0-9_-]+/i,
    /\/(?:job-detail|job-posting|view-job|job-description)\b/i,
  ];

  /**
   * Generic adapter can handle company career portals and unrecognized job pages,
   * but strictly rejects known specialized portals, non-job utility pages,
   * and generic web pages lacking sufficient independent job evidence.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(doc, url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();

    // Reject known specialized portals so we never misidentify or over-extract them
    for (const host of GenericCareerPageAdapter.KNOWN_PORTAL_HOSTS) {
      if (lowerUrl.includes(host)) {
        return false;
      }
    }

    // Reject obvious non-job URLs
    for (const pattern of GenericCareerPageAdapter.NON_JOB_ROUTES) {
      if (pattern.test(url)) {
        return false;
      }
    }

    // 1. Check for schema.org/JobPosting JSON-LD structured data (strongest positive signal)
    if (doc && typeof doc.querySelectorAll === 'function') {
      const jsonLd = GenericCareerPageAdapter.extractJsonLd(doc);
      if (jsonLd && GenericCareerPageAdapter.isJobPosting(jsonLd) && (jsonLd.title || jsonLd.name || jsonLd.description)) {
        return true;
      }
    }

    // 2. Check for career/job URL patterns
    const isCareerUrl = GenericCareerPageAdapter.CAREER_URL_PATTERNS.some((p) => p.test(url));
    if (isCareerUrl) {
      if (!doc) return true; // URL-only evaluation passes for recognized career routes
      // If doc is available, verify it's not an empty page or search index
      const hasJobContent = Boolean(
        doc.querySelector?.('button[class*="apply" i]') ||
        doc.querySelector?.('a[class*="apply" i]') ||
        doc.querySelector?.('[data-qa*="apply" i]') ||
        doc.querySelector?.('input[type="submit"]') ||
        doc.querySelector?.('h1') ||
        doc.querySelector?.('h2')
      );
      if (hasJobContent) return true;
    }

    // 3. Without job-specific URL or JSON-LD: require strong independent DOM semantic signals
    // Normal content pages (ChatGPT, GitHub repo/issue, Google, articles, docs) MUST NOT match!
    if (!doc || typeof doc.querySelector !== 'function') {
      return false;
    }

    // Signal A: Explicit Application CTA (button or link to apply)
    const applyCta = Boolean(
      doc.querySelector?.('button[class*="apply" i]') ||
      doc.querySelector?.('a[class*="apply" i]') ||
      doc.querySelector?.('[data-qa*="apply" i]') ||
      doc.querySelector?.('[aria-label*="apply" i]')
    );

    // Signal B: Job description/requirements section heading
    const headings = [
      ...(doc.querySelectorAll?.('h1') || []),
      ...(doc.querySelectorAll?.('h2') || []),
      ...(doc.querySelectorAll?.('h3') || []),
      ...(doc.querySelectorAll?.('h4') || []),
    ];
    const JOB_HEADING_REGEX =
      /^(?:job description|about the role|requirements?|qualifications?|responsibilities?|what you('ll| will) do|what we('re| are) looking for|role overview)$/i;
    const hasJobHeading = headings.some((h) => JOB_HEADING_REGEX.test((h.textContent || '').trim()));

    // Signal C: Substantive requirements/responsibilities list items
    const listItems = Array.from(doc.querySelectorAll?.('li') || []);
    const candidateBullets = listItems.filter((li) => {
      const t = (li.textContent || '').trim();
      return t.length > 20 && t.length < 400;
    });
    const hasBullets = candidateBullets.length >= 3;

    // Signal D: Job metadata container (workplace, employment type, location)
    const hasJobMeta = Boolean(
      doc.querySelector?.(
        '[class*="job-meta" i], [class*="job-info" i], [class*="job-header" i], [class*="posting-header" i]'
      )
    );

    // Require combination of Application CTA + Job Heading + (Bullets or Job Meta)
    if (applyCta && hasJobHeading && (hasBullets || hasJobMeta)) {
      return true;
    }

    return false;
  }

  /**
   * Extracts JSON-LD schema.org/JobPosting object if present.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  static extractJsonLd(doc) {
    return extractJobPostingJsonLd(doc);
  }

  /**
   * Strips HTML tags and decodes simple entities.
   *
   * @param {string} html
   * @returns {string} Plain text
   */
  static stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extracts and normalizes job payload from the document.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {object} Normalized job payload
   */
  static extract(doc, url) {
    // 1. Try structured JSON-LD first
    const jsonLd = GenericCareerPageAdapter.extractJsonLd(doc);
    if (jsonLd && GenericCareerPageAdapter.isJobPosting(jsonLd)) {
      const title = jsonLd.title || jsonLd.name || '';
      let company = '';
      if (typeof jsonLd.hiringOrganization === 'string') {
        company = jsonLd.hiringOrganization;
      } else if (jsonLd.hiringOrganization?.name) {
        company = jsonLd.hiringOrganization.name;
      }

      let location = '';
      if (jsonLd.jobLocation) {
        if (typeof jsonLd.jobLocation === 'string') {
          location = jsonLd.jobLocation;
        } else if (jsonLd.jobLocation.address) {
          const addr = jsonLd.jobLocation.address;
          location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter(Boolean)
            .join(', ');
        }
      }

      const description = GenericCareerPageAdapter.stripHtml(jsonLd.description || '');

      let workplace = 'UNKNOWN';
      if (jsonLd.jobLocationType === 'TELECOMMUTE' || description.toLowerCase().includes('remote')) {
        workplace = 'REMOTE';
      } else if (description.toLowerCase().includes('hybrid')) {
        workplace = 'HYBRID';
      } else if (location) {
        workplace = 'ON_SITE';
      }

      return {
        sourceUrl: url,
        provider: 'GENERIC_JSONLD',
        title: title || 'Untitled Role',
        company: company || 'Company',
        location: location || 'Not specified',
        workplace,
        employmentType: jsonLd.employmentType || 'FULL_TIME',
        description,
        requirements: [],
        responsibilities: [],
        compensation: jsonLd.baseSalary ? JSON.stringify(jsonLd.baseSalary) : null,
        rawText: description,
      };
    }

    // 2. DOM-based heuristic extraction
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.content;
    const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.content;
    const ogDesc = doc.querySelector('meta[property="og:description"]')?.content;

    const titleEl =
      doc.querySelector('h1[class*="title"]') ||
      doc.querySelector('h1[class*="job"]') ||
      doc.querySelector('h1') ||
      doc.querySelector('h2');

    let title = titleEl ? titleEl.textContent.trim() : (ogTitle || '');

    // Cleanup title if it has " - Company" suffix
    if (title && title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts[0].length > 4) {
        title = parts[0].trim();
      }
    }

    let company = ogSiteName || '';
    if (!company && url) {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, '');
        const hostPart = host.split('.')[0];
        if (hostPart) {
          company = hostPart.charAt(0).toUpperCase() + hostPart.slice(1);
        }
      } catch {
        /* ignore */
      }
    }

    // Candidate description containers
    const candidateContainers = [
      doc.querySelector('main'),
      doc.querySelector('article'),
      doc.querySelector('[class*="job-description"]'),
      doc.querySelector('[id*="job-description"]'),
      doc.querySelector('[class*="description"]'),
      doc.querySelector('.content'),
      doc.body,
    ].filter(Boolean);

    const mainContainer = candidateContainers[0] || doc.body;

    // Clone and clean scripts/styles to avoid noise
    let description = '';
    const requirements = [];

    if (mainContainer) {
      const listItems = typeof mainContainer.querySelectorAll === 'function'
        ? mainContainer.querySelectorAll('li')
        : (typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('li') : []);
      listItems.forEach((li) => {
        const text = (li.textContent || '').trim();
        if (text.length > 15 && text.length < 500) {
          requirements.push(text);
        }
      });
      description = (mainContainer.textContent || '').trim().replace(/\s+/g, ' ');
    } else {
      description = ogDesc || '';
    }

    let workplace = 'UNKNOWN';
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('remote') || lowerDesc.includes('work from anywhere')) {
      workplace = 'REMOTE';
    } else if (lowerDesc.includes('hybrid')) {
      workplace = 'HYBRID';
    }

    return {
      sourceUrl: url,
      provider: GenericCareerPageAdapter.provider,
      title: title || 'Job Posting',
      company: company || 'Company',
      location: 'Not specified',
      workplace,
      employmentType: 'FULL_TIME',
      description: description || ogDesc || '',
      requirements: requirements.slice(0, 30),
      responsibilities: [],
      compensation: null,
      rawText: description || ogDesc || '',
    };
  }
}
