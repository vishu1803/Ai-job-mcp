/**
 * @file OAuth 2.1 State and PKCE Transient Management.
 *
 * Implements cryptographically secure, encrypted state and PKCE verifier generation
 * and verification using authenticated symmetric encryption (AES-256-GCM).
 */

import crypto from 'node:crypto';
import { encryptSecret, decryptSecret } from './encryption.js';
import { AuthenticationError } from '../errors/index.js';

export const OAUTH_TRANSIT_COOKIE_NAME = 'oauth_transit';
export const DEFAULT_STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * @typedef {Object} OAuthStatePackage
 * @property {string} state Cryptographically random anti-CSRF state token
 * @property {string} codeVerifier PKCE code verifier (base64url)
 * @property {string} codeChallenge PKCE code challenge (S256 base64url)
 * @property {string} transitCookieValue Encrypted transit cookie payload
 */

/**
 * Validates a returnTo URL against strict open-redirect defense rules.
 *
 * Rules:
 * 1. Must be a non-empty string.
 * 2. Must be a relative path beginning with '/' (not '//' or '/\\').
 * 3. Disallows control characters, null bytes, newlines, tabs, and backslashes.
 * 4. Pathname must start with '/oauth/authorize' or '/dashboard'.
 * 5. Rejects external schemes (http:, https:, javascript:, data:).
 *
 * @param {string} returnTo URL string to validate
 * @returns {boolean} True if returnTo is a safe, relative application path
 */
export function isValidReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== 'string') {
    return false;
  }

  const trimmed = returnTo.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return false;
  }

  // Reject newlines, carriage returns, tabs, null bytes, and backslashes
  if (/[\r\n\t\0\\]/.test(trimmed)) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    // Ensure origin is unchanged (i.e. strictly relative)
    if (parsed.origin !== 'http://localhost') {
      return false;
    }
    const pathname = parsed.pathname;
    // Must begin with /oauth/authorize or /dashboard
    if (
      pathname !== '/oauth/authorize' &&
      !pathname.startsWith('/oauth/authorize/') &&
      pathname !== '/dashboard'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates high-entropy OAuth state and PKCE verifier, encrypted in a transit cookie payload.
 *
 * @param {Object} [options={}] Options
 * @param {string} [options.provider='github'] Identity provider name
 * @param {string} [options.returnTo] Optional validated relative return-to URL
 * @param {number} [options.ttlSeconds=600] State lifetime in seconds
 * @param {string | Buffer} [options.encryptionKey] Optional master key override for tests
 * @returns {OAuthStatePackage} Generated state package
 */
export function generateOAuthState(options = {}) {
  const provider = options.provider || 'github';
  const ttlSeconds = options.ttlSeconds || DEFAULT_STATE_TTL_SECONDS;

  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const now = Date.now();
  const payload = {
    state,
    codeVerifier,
    provider,
    redirectUri: options.redirectUri || null,
    returnTo: options.returnTo && isValidReturnTo(options.returnTo) ? options.returnTo : null,
    createdAt: now,
    expiresAt: now + ttlSeconds * 1000,
  };

  const transitCookieValue = encryptSecret(JSON.stringify(payload), {
    key: options.encryptionKey,
  });

  return {
    state,
    codeVerifier,
    codeChallenge,
    transitCookieValue,
  };
}

/**
 * Validates the OAuth callback state against the encrypted transit cookie payload.
 *
 * @param {string} incomingState State parameter received in callback query
 * @param {string} transitCookieValue Encrypted transit cookie value
 * @param {Object} [options={}] Validation options
 * @param {string} [options.provider='github'] Expected identity provider name
 * @param {string | Buffer} [options.encryptionKey] Optional master key override for tests
 * @returns {{ codeVerifier: string, provider: string, redirectUri: string | null, returnTo: string | null }} Verified state contents
 * @throws {AuthenticationError} If state is missing, corrupted, expired, or mismatched
 */
export function validateAndConsumeOAuthState(incomingState, transitCookieValue, options = {}) {
  if (!incomingState || typeof incomingState !== 'string') {
    throw new AuthenticationError(
      'Missing or invalid OAuth state in callback',
      'INVALID_OAUTH_STATE'
    );
  }

  if (!transitCookieValue || typeof transitCookieValue !== 'string') {
    throw new AuthenticationError('Missing OAuth transit state cookie', 'INVALID_OAUTH_STATE');
  }

  let decryptedJson;
  try {
    decryptedJson = decryptSecret(transitCookieValue, {
      key: options.encryptionKey,
    });
  } catch (err) {
    throw new AuthenticationError(
      'Corrupted or forged OAuth transit state cookie',
      'INVALID_OAUTH_STATE',
      {
        reason: err.code || 'DECRYPTION_FAILED',
      }
    );
  }

  let payload;
  try {
    payload = JSON.parse(decryptedJson);
  } catch {
    throw new AuthenticationError('Malformed OAuth transit state structure', 'INVALID_OAUTH_STATE');
  }

  const expectedProvider = options.provider || 'github';
  if (payload.provider !== expectedProvider) {
    throw new AuthenticationError(
      `OAuth provider mismatch: expected "${expectedProvider}", got "${payload.provider}"`,
      'INVALID_OAUTH_STATE'
    );
  }

  // Constant-time state comparison
  const incomingBuf = Buffer.from(incomingState, 'utf8');
  const storedBuf = Buffer.from(payload.state || '', 'utf8');

  if (incomingBuf.length !== storedBuf.length || !crypto.timingSafeEqual(incomingBuf, storedBuf)) {
    throw new AuthenticationError(
      'OAuth state mismatch: possible CSRF attempt',
      'INVALID_OAUTH_STATE'
    );
  }

  if (Date.now() > payload.expiresAt) {
    throw new AuthenticationError('OAuth authorization state has expired', 'EXPIRED_OAUTH_STATE');
  }

  const returnTo = payload.returnTo && isValidReturnTo(payload.returnTo) ? payload.returnTo : null;

  return {
    codeVerifier: payload.codeVerifier,
    provider: payload.provider,
    redirectUri: payload.redirectUri || null,
    returnTo,
  };
}
