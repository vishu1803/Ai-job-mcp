import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  generateOAuthState,
  validateAndConsumeOAuthState,
  DEFAULT_STATE_TTL_SECONDS,
} from '../../src/security/oauth-state.js';
import { AuthenticationError } from '../../src/errors/index.js';

describe('OAuth State & PKCE Management (P2-002)', () => {
  const TEST_KEY = crypto.randomBytes(32);

  describe('1. State & PKCE Generation', () => {
    it('exports standard 600-second (10-minute) default state TTL', () => {
      assert.strictEqual(DEFAULT_STATE_TTL_SECONDS, 600);
    });

    it('generates high-entropy state and valid S256 code challenge', () => {
      const statePkg = generateOAuthState({
        provider: 'github',
        encryptionKey: TEST_KEY,
      });

      assert.ok(statePkg.state);
      assert.strictEqual(typeof statePkg.state, 'string');
      assert.strictEqual(statePkg.state.length, 64); // 32 bytes hex = 64 chars

      assert.ok(statePkg.codeVerifier);
      assert.strictEqual(typeof statePkg.codeVerifier, 'string');
      assert.ok(statePkg.codeVerifier.length >= 43); // PKCE standard 43-128 chars

      assert.ok(statePkg.codeChallenge);
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(statePkg.codeVerifier)
        .digest('base64url');
      assert.strictEqual(statePkg.codeChallenge, expectedChallenge);

      assert.ok(statePkg.transitCookieValue);
      assert.ok(statePkg.transitCookieValue.startsWith('enc:v1:'));
    });

    it('generates unique state and verifier on every call', () => {
      const pkg1 = generateOAuthState({ encryptionKey: TEST_KEY });
      const pkg2 = generateOAuthState({ encryptionKey: TEST_KEY });

      assert.notStrictEqual(pkg1.state, pkg2.state);
      assert.notStrictEqual(pkg1.codeVerifier, pkg2.codeVerifier);
      assert.notStrictEqual(pkg1.codeChallenge, pkg2.codeChallenge);
      assert.notStrictEqual(pkg1.transitCookieValue, pkg2.transitCookieValue);
    });
  });

  describe('2. State & PKCE Validation', () => {
    it('validates state successfully and returns codeVerifier', () => {
      const statePkg = generateOAuthState({
        provider: 'github',
        encryptionKey: TEST_KEY,
      });

      const result = validateAndConsumeOAuthState(statePkg.state, statePkg.transitCookieValue, {
        provider: 'github',
        encryptionKey: TEST_KEY,
      });

      assert.strictEqual(result.codeVerifier, statePkg.codeVerifier);
      assert.strictEqual(result.provider, 'github');
    });

    it('rejects missing or empty state parameter', () => {
      const statePkg = generateOAuthState({ encryptionKey: TEST_KEY });

      assert.throws(
        () =>
          validateAndConsumeOAuthState('', statePkg.transitCookieValue, {
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
      assert.throws(
        () =>
          validateAndConsumeOAuthState(null, statePkg.transitCookieValue, {
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
    });

    it('rejects missing or empty transit cookie', () => {
      assert.throws(
        () => validateAndConsumeOAuthState('some_state', '', { encryptionKey: TEST_KEY }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
    });

    it('rejects mismatched state (CSRF attempt)', () => {
      const statePkg = generateOAuthState({ encryptionKey: TEST_KEY });
      const forgedState = crypto.randomBytes(32).toString('hex');

      assert.throws(
        () =>
          validateAndConsumeOAuthState(forgedState, statePkg.transitCookieValue, {
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
    });

    it('rejects tampered or corrupted transit cookie', () => {
      const statePkg = generateOAuthState({ encryptionKey: TEST_KEY });
      const tamperedCookie = statePkg.transitCookieValue.replace(
        /:([a-zA-Z0-9_-]{10})/,
        ':tampered00'
      );

      assert.throws(
        () =>
          validateAndConsumeOAuthState(statePkg.state, tamperedCookie, {
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
    });

    it('rejects expired state cookie', () => {
      const expiredPkg = generateOAuthState({
        provider: 'github',
        ttlSeconds: -10, // already expired
        encryptionKey: TEST_KEY,
      });

      assert.throws(
        () =>
          validateAndConsumeOAuthState(expiredPkg.state, expiredPkg.transitCookieValue, {
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'EXPIRED_OAUTH_STATE'
      );
    });

    it('rejects provider mismatch', () => {
      const statePkg = generateOAuthState({
        provider: 'google',
        encryptionKey: TEST_KEY,
      });

      assert.throws(
        () =>
          validateAndConsumeOAuthState(statePkg.state, statePkg.transitCookieValue, {
            provider: 'github',
            encryptionKey: TEST_KEY,
          }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
    });
  });
});
