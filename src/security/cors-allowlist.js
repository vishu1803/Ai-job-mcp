/**
 * @file CORS Origin Allowlist for Extension API Traffic (P15-002).
 *
 * Provides an explicit, configurable origin allowlist for credentialed
 * `/api/extension/*` requests. Replaces the previous permissive behavior
 * that reflected any origin containing `localhost` / `127.0.0.1` /
 * `aicareershub.tech` / `chrome-extension://`.
 *
 * Rules:
 * 1. Wildcard (`*`) origins are never honored.
 * 2. Loopback dev origins (localhost / 127.0.0.1 on any port) are allowed
 *    ONLY outside production.
 * 3. Production origins must be explicitly configured via
 *    `EXTENSION_ALLOWED_ORIGINS` (comma-separated exact origins).
 * 4. Unknown origins are rejected (no CORS headers emitted), which makes
 *    the browser block credentialed cross-origin reads.
 */

import { config } from '../config/env.js';

/**
 * Builds the set of allowed origins from configuration.
 *
 * @param {object} [appConfig=config] Application config
 * @returns {Set<string>} Lowercased exact origins allowed to call the extension API
 */
export function buildExtensionAllowedOrigins(appConfig = config) {
  const origins = new Set();

  // 1. Explicitly configured origins (comma-separated). Wildcards ignored.
  const configured = String(appConfig.EXTENSION_ALLOWED_ORIGINS || '');
  for (const raw of configured.split(',')) {
    const origin = raw.trim().toLowerCase();
    if (!origin) continue;
    if (origin === '*' || origin.includes('*')) continue; // wildcards never honored
    const normalized = normalizeOrigin(origin);
    if (normalized) origins.add(normalized);
  }

  // 2. The web app origin itself (from APP_URL) is always allowed — the
  //    extension deep-links into it and the web app calls the same API.
  if (appConfig.APP_URL) {
    const normalized = normalizeOrigin(String(appConfig.APP_URL).toLowerCase());
    if (normalized) origins.add(normalized);
  }

  // 3. Loopback dev origins — only outside production.
  if (appConfig.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return origins;
}

/**
 * Determines whether a request Origin is allowed to make credentialed
 * requests to the extension API.
 *
 * `chrome-extension://<id>` origins are allowed only when that exact origin
 * has been explicitly configured (e.g. the official extension's ID).
 *
 * @param {string} origin Request Origin header value
 * @param {Set<string>} allowedOrigins Prebuilt allowlist (see buildExtensionAllowedOrigins)
 * @returns {boolean}
 */
export function isAllowedExtensionOrigin(origin, allowedOrigins) {
  if (!origin || typeof origin !== 'string') return false;

  const lowered = origin.trim().toLowerCase();
  if (lowered === '*' || lowered.includes('*')) return false;

  const normalized = normalizeOrigin(lowered);
  if (!normalized) return false;
  return allowedOrigins.has(normalized);
}

/**
 * Normalizes an origin string for allowlist comparison.
 *
 * For http/https, `new URL(x).origin` is used (scheme + host + port).
 * Non-HTTP(S) schemes (e.g. `chrome-extension://<id>`) are opaque origins:
 * the URL parser reports their `.origin` as the string "null", which would
 * collapse ALL such origins into one bucket and let any chrome-extension
 * origin match any other. Instead, the full origin string is used as the
 * comparison key so each extension ID is distinct.
 *
 * @param {string} origin Lowercased origin string
 * @returns {string|null} Normalized origin key, or null if invalid
 */
function normalizeOrigin(origin) {
  if (!origin || typeof origin !== 'string') return null;

  if (origin.startsWith('chrome-extension://')) {
    // Require a 32-char lowercase extension ID (Chrome's format).
    const id = origin.slice('chrome-extension://'.length).replace(/\/$/, '');
    if (!/^[a-p]{32}$/.test(id)) return null;
    return `chrome-extension://${id}`;
  }

  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const normalized = url.origin.toLowerCase();
    if (normalized === 'null') return null;
    return normalized;
  } catch {
    return null;
  }
}