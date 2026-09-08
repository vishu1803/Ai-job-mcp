/**
 * @file Extension Environment & Backend Endpoint Configuration (P15-002 Batch 2).
 *
 * PRODUCTION BUILDS MUST PIN THE BACKEND ORIGIN:
 *  - Set `EXTENSION_ENV=production` at build/packaging time and ship
 *    `PROD_BACKEND_URL` as the exact https origin of the deployed backend.
 *  - Session cookies and Bearer tokens must never be allowed to point at an
 *    arbitrary host (a stored `backendUrl` is credential-bearing state).
 *
 * This module is dependency-free so it can be imported by the service worker,
 * popup, and test harnesses alike.
 */

/** Build-time environment marker: 'development' | 'production'. */
export const EXTENSION_ENV =
  typeof process !== 'undefined' && process.env && process.env.EXTENSION_ENV
    ? process.env.EXTENSION_ENV
    : 'development';

/** The only backend origin a production build may talk to. */
export const PROD_BACKEND_URL = 'https://aicareershub.tech';

/** Loopback origins are only ever valid outside production. */
const LOOPBACK_HTTP_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const PRIVATE_HOST_PATTERN = /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[::1\])/i;

/**
 * Resolves whether an origin string is a loopback URL.
 *
 * @param {string} urlString
 * @returns {boolean}
 */
export function isLoopbackUrl(urlString) {
  return LOOPBACK_HTTP_PATTERN.test(String(urlString || ''));
}

/**
 * Validates a candidate backend base URL for the given environment.
 *
 * Rules:
 *  - Must be an absolute http(s) origin (no path/query/hash).
 *  - Plain http is permitted ONLY for loopback hosts and ONLY outside
 *    production (credentials over plaintext to a public host is never valid).
 *  - In production the URL must be https, must not be loopback/private, and
 *    must match PROD_BACKEND_URL exactly (pinning).
 *
 * @param {string} urlString
 * @param {{ isProduction?: boolean }} [options]
 * @returns {{ valid: boolean, url: string | null, reason: string | null }}
 */
export function validateBackendUrl(urlString, options = {}) {
  const isProduction = options.isProduction ?? EXTENSION_ENV === 'production';
  const raw = String(urlString || '').trim();

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { valid: false, url: null, reason: 'BACKEND_URL_MALFORMED' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, url: null, reason: 'BACKEND_URL_BAD_SCHEME' };
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    return { valid: false, url: null, reason: 'BACKEND_URL_NOT_ORIGIN' };
  }

  const origin = parsed.origin;

  if (isProduction) {
    if (parsed.protocol !== 'https:') {
      return { valid: false, url: null, reason: 'BACKEND_URL_INSECURE_FOR_PRODUCTION' };
    }
    if (PRIVATE_HOST_PATTERN.test(parsed.hostname)) {
      return { valid: false, url: null, reason: 'BACKEND_URL_PRIVATE_HOST_FOR_PRODUCTION' };
    }
    if (PROD_BACKEND_URL && origin !== PROD_BACKEND_URL) {
      return { valid: false, url: null, reason: 'BACKEND_URL_NOT_PINNED' };
    }
    return { valid: true, url: origin, reason: null };
  }

  // Development: https anywhere; plain http only for loopback.
  if (parsed.protocol === 'http:' && !LOOPBACK_HTTP_PATTERN.test(origin)) {
    return { valid: false, url: null, reason: 'BACKEND_URL_INSECURE_PLAINTEXT' };
  }
  return { valid: true, url: origin, reason: null };
}
