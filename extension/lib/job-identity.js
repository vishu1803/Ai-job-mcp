/**
 * @file Job Identity & Fingerprint System (P57).
 *
 * Normalizes job postings across tracking URLs, route changes, and multi-step
 * application wizards so workflow state is never lost during navigation.
 */

const TRACKING_QUERY_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'source',
  'gh_src',
  'gh_jid',
  'lever-source',
  'fbclid',
  'gclid',
  'trackingId',
  'currentJobId',
  'refId',
]);

const APPLICATION_ROUTE_REGEX = /\/(?:apply(?:ing)?|step[-_]?[0-9]+|application(?:s)?(?:\/new)?|form|candidate[-_]profile)\/?$/i;

/**
 * Normalizes a URL by stripping tracking parameters, hashes, and trailing route suffixes.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {boolean} [options.stripApplicationSuffix=true]
 * @returns {string}
 */
export function normalizeJobPostingUrl(url, options = {}) {
  if (!url || typeof url !== 'string') return '';
  const { stripApplicationSuffix = true } = options;

  try {
    const parsed = new URL(url);

    // Filter tracking queries
    const params = new URLSearchParams(parsed.search);
    for (const key of Array.from(params.keys())) {
      if (TRACKING_QUERY_PARAMS.has(key) || key.startsWith('utm_') || key.startsWith('session_')) {
        params.delete(key);
      }
    }

    let pathname = parsed.pathname.replace(/\/+$/, '');
    if (stripApplicationSuffix) {
      pathname = pathname.replace(APPLICATION_ROUTE_REGEX, '');
      // Handle /apply/123 -> /
      pathname = pathname.replace(/\/apply(?:\/.*)?$/i, '');
    }

    const cleanSearch = params.toString() ? `?${params.toString()}` : '';
    return `${parsed.protocol}//${parsed.host}${pathname}${cleanSearch}`;
  } catch {
    return url.split('?')[0].replace(/\/+$/, '');
  }
}

/**
 * Self-contained, synchronous SHA-256 hex digest generator.
 * Works uniformly in Node.js, Chrome extension background/content scripts, and browsers.
 *
 * @param {string} ascii
 * @returns {string} 64-character hex SHA-256 digest
 */
function sha256Hex(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';

  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;

  let hash = [];
  const k = [];
  let primeCounter = 0;

  const isPrime = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isPrime[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isPrime[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);

  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;

  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Derives a canonical job fingerprint to uniquely identify a target role across
 * page reloads, SPA transitions, and multi-step forms.
 *
 * @param {object} params
 * @param {string} [params.canonicalJobId]
 * @param {string} [params.provider]
 * @param {string} [params.externalJobId]
 * @param {string} [params.title]
 * @param {string} [params.company]
 * @param {string} [params.url]
 * @param {string} [params.sourceUrl]
 * @returns {string} Deterministic 64-character SHA-256 fingerprint string
 */
export function deriveJobFingerprint(params = {}) {
  const {
    canonicalJobId,
    provider,
    externalJobId,
    title = '',
    company = '',
    url = '',
    sourceUrl = '',
  } = params;

  let rawKey = '';
  if (canonicalJobId) {
    rawKey = `canon::${String(canonicalJobId).toLowerCase()}`;
  } else if (provider && externalJobId) {
    rawKey = `${String(provider).toLowerCase()}::${String(externalJobId).toLowerCase()}`;
  } else {
    const cleanTitle = String(title).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanCompany = String(company).toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanUrl = normalizeJobPostingUrl(url || sourceUrl || '');

    if (cleanCompany && cleanTitle) {
      rawKey = `role::${cleanCompany}::${cleanTitle}::${cleanUrl}`;
    } else if (cleanUrl) {
      rawKey = `url::${cleanUrl.toLowerCase()}`;
    } else {
      rawKey = 'unknown-job';
    }
  }

  if (rawKey === 'unknown-job') {
    return '0'.repeat(64);
  }

  return sha256Hex(rawKey);
}

/**
 * Compares two job identities to determine whether they refer to the identical role.
 *
 * @param {object} jobA
 * @param {object} jobB
 * @returns {boolean}
 */
export function isSameJobIdentity(jobA, jobB) {
  if (!jobA || !jobB) return false;

  // Direct canonical match
  if (jobA.canonicalJobId && jobB.canonicalJobId) {
    return jobA.canonicalJobId === jobB.canonicalJobId;
  }

  // External ID match under same provider
  if (
    jobA.provider &&
    jobB.provider &&
    jobA.externalJobId &&
    jobB.externalJobId &&
    String(jobA.provider).toUpperCase() === String(jobB.provider).toUpperCase()
  ) {
    return String(jobA.externalJobId) === String(jobB.externalJobId);
  }

  // Fingerprint match
  const fpA = deriveJobFingerprint(jobA);
  const fpB = deriveJobFingerprint(jobB);
  if (fpA !== 'unknown-job' && fpA === fpB) {
    return true;
  }

  // Normalized URL match
  const urlA = normalizeJobPostingUrl(jobA.sourceUrl || jobA.url);
  const urlB = normalizeJobPostingUrl(jobB.sourceUrl || jobB.url);
  if (urlA && urlB && urlA === urlB) {
    return true;
  }

  // Company and title match
  const titleA = String(jobA.title || '').trim().toLowerCase();
  const titleB = String(jobB.title || '').trim().toLowerCase();
  const compA = String(jobA.company || '').trim().toLowerCase();
  const compB = String(jobB.company || '').trim().toLowerCase();

  return Boolean(titleA && titleB && compA && compB && titleA === titleB && compA === compB);
}

export const JobIdentity = {
  normalizeJobUrl: normalizeJobPostingUrl,
  normalizeJobPostingUrl,
  deriveJobFingerprint,
  isSameJobIdentity,
};

