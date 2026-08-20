import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  generateSessionToken,
  hashSessionToken,
  getSessionCookieOptions,
} from '../../src/security/session.service.js';
import { AuthenticationError } from '../../src/errors/index.js';

describe('Session Service Utilities (P2-002)', () => {
  describe('1. Token Generation & Hashing', () => {
    it('generates 256-bit cryptographically random base64url session token', () => {
      const token = generateSessionToken();
      assert.strictEqual(typeof token, 'string');
      assert.ok(token.length >= 43); // 32 bytes base64url = 43 chars
      assert.match(token, /^[A-Za-z0-9_-]+$/);
    });

    it('generates distinct tokens on subsequent calls', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      assert.notStrictEqual(token1, token2);
    });

    it('hashes raw token deterministically using SHA-256', () => {
      const rawToken = 'test_session_raw_token_value_123';
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const computedHash = hashSessionToken(rawToken);
      assert.strictEqual(computedHash, expectedHash);
      assert.strictEqual(computedHash.length, 64);
    });

    it('throws AuthenticationError when hashing null or empty token', () => {
      assert.throws(
        () => hashSessionToken(''),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_SESSION'
      );
      assert.throws(
        () => hashSessionToken(null),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_SESSION'
      );
    });
  });

  describe('2. Cookie Options Helper', () => {
    it('configures standard development cookie options', () => {
      const devConfig = {
        NODE_ENV: 'development',
        SESSION_COOKIE_NAME: 'career_hub_session',
      };

      const opts = getSessionCookieOptions(devConfig, 604800);
      assert.strictEqual(opts.name, 'career_hub_session');
      assert.strictEqual(opts.httpOnly, true);
      assert.strictEqual(opts.secure, false);
      assert.strictEqual(opts.sameSite, 'lax');
      assert.strictEqual(opts.path, '/');
      assert.strictEqual(opts.maxAge, 604800);
    });

    it('configures __Host- prefixed Secure cookie in production environment', () => {
      const prodConfig = {
        NODE_ENV: 'production',
        SESSION_COOKIE_NAME: 'career_hub_session',
      };

      const opts = getSessionCookieOptions(prodConfig, 604800);
      assert.strictEqual(opts.name, '__Host-career_hub_session');
      assert.strictEqual(opts.httpOnly, true);
      assert.strictEqual(opts.secure, true);
      assert.strictEqual(opts.sameSite, 'lax');
      assert.strictEqual(opts.path, '/');
    });
  });
});
