/**
 * @file Shared JSON-LD JobPosting Extraction (P15-002 Batch 3).
 *
 * Extracted from GenericCareerPageAdapter so any adapter can use the same
 * parser as a fallback when provider-specific DOM extraction is weak — ATS
 * pages (Greenhouse, Lever, Workday, LinkedIn, Indeed) embed JSON-LD
 * `JobPosting` structured data that survives DOM redesigns.
 */

/**
 * Finds the first JSON-LD `JobPosting` object in the document.
 *
 * Handles: direct object, top-level arrays, and `@graph` wrappers.
 *
 * @param {Document} doc
 * @returns {object|null} JobPosting object or null
 */
export function extractJobPostingJsonLd(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return null;
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const text = script.textContent.trim();
      if (!text) continue;
      const parsed = JSON.parse(text);
      if (parsed?.['@type'] === 'JobPosting') return parsed;
      if (Array.isArray(parsed)) {
        const found = parsed.find((item) => item?.['@type'] === 'JobPosting');
        if (found) return found;
      }
      if (parsed?.['@graph'] && Array.isArray(parsed['@graph'])) {
        const found = parsed['@graph'].find((item) => item?.['@type'] === 'JobPosting');
        if (found) return found;
      }
    } catch {
      /* ignore JSON parse errors in inline scripts */
    }
  }
  return null;
}

/** Strips HTML tags and decodes simple entities. */
export function stripHtml(html) {
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
 * Extracts requirement/responsibility bullet texts from a JSON-LD description
 * field that carries HTML `<li>` items. Many ATS/boards (Indeed, LinkedIn,
 * iimjobs, Hirect, Cutshort, Foundit, Instahyre) embed the full HTML
 * description in JSON-LD — discarding the list structure loses the very
 * requirements the matching pipeline needs.
 *
 * @param {string} html Raw JSON-LD description (may be HTML)
 * @returns {string[]} Bounded list of bullet texts (max 30)
 */
export function extractListItemsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const items = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) !== null && items.length < 30) {
    const text = stripHtml(match[1]);
    if (text.length >= 10 && text.length <= 500) {
      items.push(text);
    }
  }
  return items;
}

/**
 * Maps a JSON-LD JobPosting to a normalized job payload fragment, preserving
 * the calling adapter's provider identity.
 *
 * @param {object} jsonLd Parsed JobPosting object
 * @param {string} url Page URL
 * @param {string} provider Provider constant of the calling adapter
 * @returns {object} Normalized job payload fragment
 */
export function jsonLdToJobPayload(jsonLd, url, provider) {
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

  const description = stripHtml(jsonLd.description || '');

  // P16-001F-5: requirements/responsibilities from the HTML description's
  // list items instead of always [].
  const listItems = extractListItemsFromHtml(jsonLd.description || '');

  let workplace = 'UNKNOWN';
  const lowerDesc = description.toLowerCase();
  if (
    jsonLd.jobLocationType === 'TELECOMMUTE' ||
    lowerDesc.includes('remote') ||
    lowerDesc.includes('work from home') ||
    lowerDesc.includes('wfh')
  ) {
    workplace = 'REMOTE';
  } else if (lowerDesc.includes('hybrid')) {
    workplace = 'HYBRID';
  } else if (location) {
    workplace = 'ON_SITE';
  }

  return {
    sourceUrl: url,
    provider,
    title: title || 'Untitled Role',
    company: company || 'Company',
    location: location || 'Not specified',
    workplace,
    employmentType: jsonLd.employmentType || 'FULL_TIME',
    description,
    requirements: listItems,
    responsibilities: [],
    compensation: jsonLd.baseSalary ? JSON.stringify(jsonLd.baseSalary) : null,
    rawText: description,
  };
}
