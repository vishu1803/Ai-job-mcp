/**
 * @file URL Normalization & Canonical Job ID Resolution Utilities.
 *
 * Provides deterministic URL normalization and canonical job ID derivation
 * across provider portals (Greenhouse, Lever, generic portals).
 *
 * Guarantees:
 * 1. Normalized URLs strip tracking parameters (utm_*, gh_src, ref, etc.)
 * 2. Hostname canonicalization (e.g. job-boards.greenhouse.io -> boards.greenhouse.io)
 * 3. Stable canonicalJobId derivation from provider job URLs when explicit ID is absent
 * 4. Zero mutation of underlying payloads
 */

import { generateCanonicalJobId } from '../services/job-discovery.service.js';

/**
 * Normalizes a job portal or posting URL for deterministic equality comparisons.
 *
 * @param {string|null|undefined} rawUrl
 * @returns {string|null} Canonical normalized URL, or null
 */
export function normalizeJobUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.protocol = parsed.protocol.toLowerCase();
    let host = parsed.hostname.toLowerCase();

    // Greenhouse board hostname normalization
    if (host === 'job-boards.greenhouse.io') {
      host = 'boards.greenhouse.io';
    }
    parsed.hostname = host;

    // Strip common tracking and referral parameters
    const TRACKING_PARAMS = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gh_src',
      'gh_jid',
      'ref',
      'source',
      'tracking_id',
      'fbclid',
      'gclid',
      'msclkid',
      '_ga',
      '_gl',
      'mc_cid',
      'mc_eid',
    ]);
    const keysToDelete = [];
    for (const key of parsed.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || lower.startsWith('lever-') || TRACKING_PARAMS.has(lower)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Strip trailing slashes on pathname
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.replace(/\/+$/, '');
    }
    parsed.pathname = pathname;

    // Build normalized string (omit empty search/hash)
    const search = parsed.searchParams.toString();
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}${search ? '?' + search : ''}`;
  } catch {
    // If URL parsing fails, fallback to basic whitespace and trailing slash removal
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Derives or extracts the canonical job ID from a job posting, target object, or URL.
 *
 * Priority:
 * 1. Explicit canonicalJobId or jobId
 * 2. jobPosting.id (if canonical UUID)
 * 3. Extracted provider + externalId from Greenhouse/Lever URLs
 *
 * @param {object} target Target or job posting descriptor
 * @returns {string|null} Canonical UUID v4-compatible ID, or null
 */
export function deriveCanonicalJobId(target) {
  if (!target || typeof target !== 'object') return null;

  // 1. Explicit properties on target
  if (target.canonicalJobId && typeof target.canonicalJobId === 'string') {
    return target.canonicalJobId.trim();
  }
  if (target.jobId && typeof target.jobId === 'string') {
    return target.jobId.trim();
  }
  if (target.metadata?.canonicalJobId && typeof target.metadata.canonicalJobId === 'string') {
    return target.metadata.canonicalJobId.trim();
  }
  if (target.metadata?.jobId && typeof target.metadata.jobId === 'string') {
    return target.metadata.jobId.trim();
  }

  // 2. jobPosting nested object
  const jobPosting = target.jobPosting || (target.company && target.title ? target : null);
  if (jobPosting?.id && typeof jobPosting.id === 'string') {
    const trimmedId = jobPosting.id.trim();
    if (trimmedId) {
      return trimmedId;
    }
  }

  // 3. Explicit provider + externalJobId
  const provider = target.provider || jobPosting?.provider || target.source || jobPosting?.source;
  const externalJobId = target.externalJobId || jobPosting?.externalJobId;
  if (provider && externalJobId) {
    return generateCanonicalJobId(String(provider).toUpperCase(), String(externalJobId));
  }

  // 4. Derive from recognized ATS URLs (Greenhouse, Lever)
  const candidateUrl =
    target.jobUrl ||
    target.applicationUrl ||
    target.directPortalUrl ||
    jobPosting?.applicationUrl ||
    jobPosting?.directPortalUrl ||
    jobPosting?.url;

  if (candidateUrl && typeof candidateUrl === 'string') {
    const normalized = normalizeJobUrl(candidateUrl);
    if (!normalized) return null;

    // Greenhouse pattern: boards.greenhouse.io/{boardToken}/jobs/{jobId}
    const ghMatch = normalized.match(
      /^https?:\/\/boards\.greenhouse\.io\/([^/]+)\/jobs\/([^/?#]+)/i
    );
    if (ghMatch) {
      const boardToken = ghMatch[1].toLowerCase();
      const rawJobId = ghMatch[2];
      return generateCanonicalJobId('GREENHOUSE', `gh-${boardToken}-${rawJobId}`);
    }

    // Lever pattern: jobs.lever.co/{boardToken}/{jobId}
    const leverMatch = normalized.match(/^https?:\/\/jobs\.lever\.co\/([^/]+)\/([^/?#]+)/i);
    if (leverMatch) {
      const boardToken = leverMatch[1].toLowerCase();
      const rawJobId = leverMatch[2];
      return generateCanonicalJobId('LEVER', `lever-${boardToken}-${rawJobId}`);
    }
  }

  return null;
}
