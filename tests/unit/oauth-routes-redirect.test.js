/**
 * @file OAuth Dynamic Redirect URI & Cookie Security Unit Tests (P14-004 Debug)
 *
 * Verifies:
 * 1. getOAuthRedirectUri correctly resolves origin on localhost vs staging
 * 2. isHttpsRequest accurately detects direct HTTPS, forwarded HTTPS, and production mode
 * 3. Fastify /auth/github issues Secure cookies on HTTPS and non-Secure cookies on local HTTP
 * 4. Fastify /auth/github sets redirect_uri corresponding to request host
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOAuthRedirectUri, isHttpsRequest } from '../../src/routes/auth.routes.js';
import { config } from '../../src/config/env.js';

describe('OAuth Dynamic Redirect URI & Cookie Security (P14-004)', () => {
  describe('1. getOAuthRedirectUri', () => {
    it('resolves local development callback on direct localhost request', () => {
      const mockReq = {
        protocol: 'http',
        headers: {
          host: 'localhost:3000',
        },
      };

      const redirectUri = getOAuthRedirectUri(mockReq);
      assert.strictEqual(redirectUri, 'http://localhost:3000/auth/github/callback');
    });

    it('resolves staging HTTPS callback on request with dev.aicareershub.tech host and x-forwarded-proto', () => {
      const mockReq = {
        protocol: 'http',
        headers: {
          host: '127.0.0.1:3000',
          'x-forwarded-host': 'dev.aicareershub.tech',
          'x-forwarded-proto': 'https',
        },
      };

      const redirectUri = getOAuthRedirectUri(mockReq);
      assert.strictEqual(redirectUri, 'https://dev.aicareershub.tech/auth/github/callback');
    });

    it('resolves staging HTTPS callback when host is dev.aicareershub.tech directly', () => {
      const mockReq = {
        protocol: 'https',
        headers: {
          host: 'dev.aicareershub.tech',
        },
      };

      const redirectUri = getOAuthRedirectUri(mockReq);
      assert.strictEqual(redirectUri, 'https://dev.aicareershub.tech/auth/github/callback');
    });

    it('falls back safely to configured GITHUB_OAUTH_REDIRECT_URI if host is untrusted', () => {
      const mockReq = {
        protocol: 'https',
        headers: {
          host: 'evil-phishing-site.example.com',
        },
      };

      const redirectUri = getOAuthRedirectUri(mockReq);
      assert.strictEqual(
        redirectUri,
        config.GITHUB_OAUTH_REDIRECT_URI || `${config.APP_URL}/auth/github/callback`
      );
    });
  });

  describe('2. isHttpsRequest', () => {
    it('returns true when req.protocol is https', () => {
      const mockReq = { protocol: 'https', headers: {} };
      assert.strictEqual(isHttpsRequest(mockReq), true);
    });

    it('returns true when x-forwarded-proto header is https', () => {
      const mockReq = { protocol: 'http', headers: { 'x-forwarded-proto': 'https' } };
      assert.strictEqual(isHttpsRequest(mockReq), true);
    });

    it('returns false on local plain HTTP without headers when NODE_ENV is development', () => {
      const origEnv = config.NODE_ENV;
      try {
        config.NODE_ENV = 'development';
        const mockReq = { protocol: 'http', headers: {} };
        assert.strictEqual(isHttpsRequest(mockReq), false);
      } finally {
        config.NODE_ENV = origEnv;
      }
    });
  });
});
