/**
 * @file GitHub App Authentication Unit Tests (Task P3-001)
 *
 * Tests:
 * 1. RSA Private Key Ingestion & Normalization
 * 2. RS256 App JWT Generation & Claim Verification
 * 3. Partitioned In-Memory Token Cache & 5-Minute Refresh Buffer
 * 4. Installation Token Acquisition & Least-Privilege Scoping
 * 5. Concurrency & Request Coalescing (Anti-Stampede)
 * 6. Upstream Error Mapping & Exponential Backoff Retries
 * 7. Upstream Token Revocation & Cache Eviction
 * 8. Security & Credential Leakage Prevention
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeAppPrivateKey,
  generateAppJwt,
  GitHubAppAuthManager,
  GitHubTokenCache,
  buildTokenCacheKey,
  GitHubAuthError,
  GitHubInstallationNotFoundError,
  GitHubRateLimitError,
  parseGitHubErrorResponse,
} from '../../src/connectors/github/index.js';
import { CryptoError, ValidationError } from '../../src/errors/index.js';
import { ProviderUnavailableError } from '../../src/connectors/errors/connector-errors.js';

describe('GitHub App Authentication Module Unit Tests (P3-001)', () => {
  let testKeyPair;
  let rawPemPrivateKey;
  let base64PemPrivateKey;
  let publicKeyObject;

  const testAppId = 123456;
  const tenantA = '550e8400-e29b-41d4-a716-446655440000';
  const tenantB = '660e8400-e29b-41d4-a716-446655440001';
  const installationId = '98765432';

  before(() => {
    // Generate high-entropy 2048-bit RSA key pair for testing
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rawPemPrivateKey = testKeyPair.privateKey;
    base64PemPrivateKey = Buffer.from(rawPemPrivateKey).toString('base64');
    publicKeyObject = crypto.createPublicKey(testKeyPair.publicKey);
  });

  // -------------------------------------------------------------------------
  // 1. Private Key Ingestion & Normalization
  // -------------------------------------------------------------------------
  describe('1. Private Key Ingestion & Normalization', () => {
    it('successfully parses and normalizes standard multiline RSA PEM string', () => {
      const keyObj = normalizeAppPrivateKey(rawPemPrivateKey);
      assert.ok(keyObj);
      assert.strictEqual(keyObj.asymmetricKeyType, 'rsa');
    });

    it('successfully parses and decodes single-line Base64-encoded RSA PEM string', () => {
      const keyObj = normalizeAppPrivateKey(base64PemPrivateKey);
      assert.ok(keyObj);
      assert.strictEqual(keyObj.asymmetricKeyType, 'rsa');
    });

    it('handles escaped literal newlines ("\\n") commonly present in environment variables', () => {
      const escapedPem = rawPemPrivateKey.replace(/\n/g, '\\n');
      const keyObj = normalizeAppPrivateKey(escapedPem);
      assert.ok(keyObj);
      assert.strictEqual(keyObj.asymmetricKeyType, 'rsa');
    });

    it('throws CryptoError on empty or null private key input', () => {
      assert.throws(
        () => normalizeAppPrivateKey(''),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'MISSING_PRIVATE_KEY');
          return true;
        }
      );
    });

    it('throws CryptoError on malformed PEM without leaking invalid string', () => {
      const malformedKey =
        '-----BEGIN RSA PRIVATE KEY-----\nNOT_A_VALID_KEY\n-----END RSA PRIVATE KEY-----';
      assert.throws(
        () => normalizeAppPrivateKey(malformedKey),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'INVALID_PRIVATE_KEY');
          // Security check: Message must NOT contain the key
          assert.strictEqual(err.message.includes('NOT_A_VALID_KEY'), false);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. App JWT Generation & Claim Verification
  // -------------------------------------------------------------------------
  describe('2. App JWT Generation & Claim Verification', () => {
    it('generates a valid 3-part RS256 signed JWT with correct RFC 7519 claims', () => {
      const fixedNow = 1787300000;
      const keyObj = normalizeAppPrivateKey(rawPemPrivateKey);
      const jwt = generateAppJwt(testAppId, keyObj, fixedNow);

      assert.ok(typeof jwt === 'string');
      const parts = jwt.split('.');
      assert.strictEqual(parts.length, 3);

      // Verify Header
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      assert.deepStrictEqual(header, { alg: 'RS256', typ: 'JWT' });

      // Verify Payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      assert.strictEqual(payload.iss, testAppId);
      assert.strictEqual(payload.iat, fixedNow - 60); // 60-second backdated clock skew buffer
      assert.strictEqual(payload.exp, fixedNow + 540); // 9-minute validity (< 10 min GitHub limit)

      // Verify RS256 cryptographic signature with public key
      const message = `${parts[0]}.${parts[1]}`;
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(message);
      const isValid = verifier.verify(publicKeyObject, parts[2], 'base64url');
      assert.strictEqual(isValid, true);
    });

    it('rejects JWT generation if App ID is missing', () => {
      const keyObj = normalizeAppPrivateKey(rawPemPrivateKey);
      assert.throws(() => generateAppJwt(null, keyObj), ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Partitioned In-Memory Token Cache
  // -------------------------------------------------------------------------
  describe('3. Partitioned In-Memory Token Cache', () => {
    let cache;
    let mockTime;

    beforeEach(() => {
      mockTime = 1000000000;
      cache = new GitHubTokenCache({
        defaultBufferMs: 300000, // 5-minute safety buffer
        nowFn: () => mockTime,
      });
    });

    it('builds a partitioned cache key binding tenantId, installationId, and repo scope hash', () => {
      const key1 = buildTokenCacheKey(tenantA, installationId, ['repo-b', 'repo-a']);
      const key2 = buildTokenCacheKey(tenantA, installationId, ['repo-a', 'repo-b']); // Sorted equivalence
      const key3 = buildTokenCacheKey(tenantB, installationId, ['repo-a', 'repo-b']); // Different tenant

      assert.strictEqual(key1, key2);
      assert.notStrictEqual(key1, key3);
      assert.ok(key1.startsWith(`gh_token:${tenantA}:${installationId}:`));
    });

    it('returns cached token when valid and outside the 5-minute buffer', () => {
      const expiresAt = new Date(mockTime + 60 * 60 * 1000); // 60 minutes in future
      cache.set(tenantA, installationId, null, {
        token: 'ghs_cached_token_123',
        expiresAt,
        permissions: { contents: 'read' },
      });

      const retrieved = cache.get(tenantA, installationId, null);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.token, 'ghs_cached_token_123');
    });

    it('enforces multi-tenant isolation: Tenant B cannot access Tenant A cached token', () => {
      const expiresAt = new Date(mockTime + 60 * 60 * 1000);
      cache.set(tenantA, installationId, null, {
        token: 'ghs_tenant_a_secret_token',
        expiresAt,
      });

      const retrievedTenantB = cache.get(tenantB, installationId, null);
      assert.strictEqual(retrievedTenantB, null);
    });

    it('returns null and evicts when token is within the 5-minute proactive refresh buffer', () => {
      // Token expires in 4 minutes (within 5-minute buffer)
      const expiresAt = new Date(mockTime + 4 * 60 * 1000);
      cache.set(tenantA, installationId, null, {
        token: 'ghs_almost_expired_token',
        expiresAt,
      });

      const retrieved = cache.get(tenantA, installationId, null);
      assert.strictEqual(retrieved, null);
      assert.strictEqual(cache.size(), 0);
    });

    it('evicts cached tokens on explicit evict and tenant eviction', () => {
      const expiresAt = new Date(mockTime + 30 * 60 * 1000);
      cache.set(tenantA, installationId, ['repo-1'], { token: 'tok1', expiresAt });
      cache.set(tenantA, installationId, ['repo-2'], { token: 'tok2', expiresAt });
      cache.set(tenantB, installationId, ['repo-1'], { token: 'tok3', expiresAt });

      assert.strictEqual(cache.size(), 3);

      // Evict all for tenant A installation
      cache.evict(tenantA, installationId);
      assert.strictEqual(cache.size(), 1);
      assert.ok(cache.get(tenantB, installationId, ['repo-1']));

      // Evict tenant B
      cache.evictTenant(tenantB);
      assert.strictEqual(cache.size(), 0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Installation Token Acquisition & Scoping via AuthManager
  // -------------------------------------------------------------------------
  describe('4. Installation Token Acquisition & Scoping', () => {
    it('mints an installation access token and stores it in cache', async () => {
      let capturedUrl;
      let capturedHeaders;
      let capturedBody;

      const mockFetch = async (url, opts) => {
        capturedUrl = url;
        capturedHeaders = opts.headers;
        capturedBody = JSON.parse(opts.body);

        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_synthetic_token_123456',
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            permissions: { contents: 'read', metadata: 'read' },
            repository_selection: 'selected',
          }),
        };
      };

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const tokenData = await manager.getInstallationToken({
        tenantId: tenantA,
        installationId,
        repositories: ['my-repo'],
      });

      assert.strictEqual(tokenData.token, 'ghs_synthetic_token_123456');
      assert.strictEqual(tokenData.installationId, installationId);
      assert.strictEqual(tokenData.repositorySelection, 'selected');
      assert.ok(tokenData.expiresAt instanceof Date);

      // Verify HTTP request details
      assert.ok(capturedUrl.includes(`/app/installations/${installationId}/access_tokens`));
      assert.ok(capturedHeaders.Authorization.startsWith('Bearer '));
      assert.deepStrictEqual(capturedBody.repositories, ['my-repo']);
      assert.deepStrictEqual(capturedBody.permissions, { contents: 'read', metadata: 'read' });

      // Second call should return from cache without calling fetch
      let fetchCalledSecondTime = false;
      manager.fetch = async () => {
        fetchCalledSecondTime = true;
      };

      const cachedTokenData = await manager.getInstallationToken({
        tenantId: tenantA,
        installationId,
        repositories: ['my-repo'],
      });

      assert.strictEqual(cachedTokenData.token, 'ghs_synthetic_token_123456');
      assert.strictEqual(fetchCalledSecondTime, false);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Concurrency & Anti-Stampede Request Coalescing
  // -------------------------------------------------------------------------
  describe('5. Concurrency & Anti-Stampede Request Coalescing', () => {
    it('coalesces multiple concurrent token requests for the same cache key into a single HTTP call', async () => {
      let httpCallsCount = 0;

      const mockFetch = async () => {
        httpCallsCount++;
        // Simulate 20ms network latency
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_coalesced_token_999',
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            permissions: { contents: 'read', metadata: 'read' },
            repository_selection: 'all',
          }),
        };
      };

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      // Launch 5 concurrent requests simultaneously
      const results = await Promise.all([
        manager.getInstallationToken({ tenantId: tenantA, installationId }),
        manager.getInstallationToken({ tenantId: tenantA, installationId }),
        manager.getInstallationToken({ tenantId: tenantA, installationId }),
        manager.getInstallationToken({ tenantId: tenantA, installationId }),
        manager.getInstallationToken({ tenantId: tenantA, installationId }),
      ]);

      // All 5 returned identical token
      for (const res of results) {
        assert.strictEqual(res.token, 'ghs_coalesced_token_999');
      }

      // Exactly ONE HTTP call was executed
      assert.strictEqual(httpCallsCount, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Upstream Error Mapping & Backoff Retries
  // -------------------------------------------------------------------------
  describe('6. Upstream Error Mapping & Backoff Retries', () => {
    it('maps 401 Unauthorized to GitHubAuthError without retrying', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        return {
          ok: false,
          status: 401,
          json: async () => ({ message: 'Bad credentials' }),
          headers: {},
        };
      };

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => manager.getInstallationToken({ tenantId: tenantA, installationId }),
        (err) => {
          assert.ok(err instanceof GitHubAuthError);
          assert.strictEqual(err.statusCode, 401);
          return true;
        }
      );

      assert.strictEqual(callCount, 1); // No retries for 401
    });

    it('maps 404 Installation Not Found to GitHubInstallationNotFoundError', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Installation was not found' }),
        headers: {},
      });

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => manager.getInstallationToken({ tenantId: tenantA, installationId }),
        GitHubInstallationNotFoundError
      );
    });

    it('maps 429 Too Many Requests to GitHubRateLimitError', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 429,
        json: async () => ({ message: 'You have exceeded a secondary rate limit' }),
        headers: {
          'x-ratelimit-remaining': '0',
          'retry-after': '60',
        },
      });

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        maxRetries: 0,
      });

      await assert.rejects(
        () => manager.getInstallationToken({ tenantId: tenantA, installationId }),
        (err) => {
          assert.ok(err instanceof GitHubRateLimitError);
          assert.strictEqual(err.statusCode, 429);
          return true;
        }
      );
    });

    it('retries on 503 Service Unavailable and succeeds on second attempt', async () => {
      let callCount = 0;
      const mockFetch = async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ message: 'GitHub API temporarily unavailable' }),
            headers: {},
          };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_recovered_token_555',
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          }),
        };
      };

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        maxRetries: 1,
      });

      const result = await manager.getInstallationToken({ tenantId: tenantA, installationId });
      assert.strictEqual(result.token, 'ghs_recovered_token_555');
      assert.strictEqual(callCount, 2);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Upstream Token Revocation & Eviction
  // -------------------------------------------------------------------------
  describe('7. Upstream Token Revocation & Eviction', () => {
    it('revokes token upstream and evicts from memory cache', async () => {
      let deleteCalled = false;
      let deleteAuthHeader;

      const mockFetch = async (url, opts) => {
        if (opts.method === 'DELETE') {
          deleteCalled = true;
          deleteAuthHeader = opts.headers.Authorization;
          return { ok: true, status: 204 };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_token_to_revoke',
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          }),
        };
      };

      const manager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      // 1. Fetch token and verify it is cached
      const tokenData = await manager.getInstallationToken({ tenantId: tenantA, installationId });
      assert.ok(manager.tokenCache.get(tenantA, installationId));

      // 2. Revoke token
      const res = await manager.revokeInstallationToken({
        tenantId: tenantA,
        installationId,
        token: tokenData.token,
      });

      assert.strictEqual(res.revoked, true);
      assert.strictEqual(deleteCalled, true);
      assert.strictEqual(deleteAuthHeader, `Bearer ${tokenData.token}`);

      // 3. Verify cache is evicted
      assert.strictEqual(manager.tokenCache.get(tenantA, installationId), null);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Error Parser Utility
  // -------------------------------------------------------------------------
  describe('8. parseGitHubErrorResponse utility', () => {
    it('parses generic status code and extracts rate limit headers', () => {
      const headers = {
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1787305000',
      };
      const err = parseGitHubErrorResponse(403, { message: 'API rate limit exceeded' }, headers);
      assert.ok(err instanceof GitHubRateLimitError);
      assert.strictEqual(err.remaining, 0);
      assert.strictEqual(err.limit, 5000);
      assert.ok(err.resetAt instanceof Date);
    });

    it('parses 500 server error as ProviderUnavailableError', () => {
      const err = parseGitHubErrorResponse(502, 'Bad Gateway');
      assert.ok(err instanceof ProviderUnavailableError);
      assert.strictEqual(err.statusCode, 503);
    });
  });
});
