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
    provider,
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
