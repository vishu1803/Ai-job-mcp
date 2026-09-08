/**
 * @file Generic Career Page Extraction Adapter (P15-001).
 *
 * Universal fallback adapter supporting arbitrary company career portals,
 * Ashby, BambooHR, Workable, SmartRecruiters, and custom job description pages
 * via schema.org/JobPosting JSON-LD, OpenGraph metadata, and semantic DOM parsing.
 */

export class GenericCareerPageAdapter {
  static provider = 'GENERIC';

  /**
   * Generic adapter can attempt extraction on any page.
   *
   * @param {Document} doc
   * @param {string} url
   * @returns {boolean}
   */
  static canHandle(_doc, _url) {
    return true;
  }

  /**
   * Extracts JSON-LD schema.org/JobPosting object if present.
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  static extractJsonLd(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const text = script.textContent.trim();
        if (!text) continue;
        const parsed = JSON.parse(text);
        if (parsed['@type'] === 'JobPosting') return parsed;
        if (Array.isArray(parsed)) {
          const found = parsed.find((item) => item?.['@type'] === 'JobPosting');
          if (found) return found;
        }
        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
          const found = parsed['@graph'].find((item) => item?.['@type'] === 'JobPosting');
          if (found) return found;
        }
      } catch {
        /* ignore JSON parse errors in inline scripts */
      }
    }
    return null;
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
    if (jsonLd) {
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
      const listItems = mainContainer.querySelectorAll('li');
      listItems.forEach((li) => {
        const text = li.textContent.trim();
        if (text.length > 15 && text.length < 500) {
          requirements.push(text);
        }
      });
      description = mainContainer.textContent.trim().replace(/\s+/g, ' ');
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
