/**
 * @file GitHub App Authentication Module (Task P3-001)
 *
 * Implements:
 * 1. RSA Private Key PEM / Base64 normalization & validation
 * 2. RS256 App JWT minting (9-minute lifetime, 60-second backdated clock skew buffer)
 * 3. Short-lived (60-minute) Installation Access Token (`ghs_*`) minting via GitHub REST API
 * 4. Partitioned in-memory caching with request coalescing (anti-stampede)
 * 5. Upstream token revocation and cache eviction hooks
 */

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { CryptoError, ValidationError } from '../../errors/index.js';
import { GitHubTokenCache, buildTokenCacheKey } from './token-cache.js';
import { parseGitHubErrorResponse, GitHubApiError } from './errors.js';

/**
 * Normalizes and validates an RSA private key PEM block.
 * Supports standard multiline PEM strings and single-line base64-encoded strings.
 *
 * @param {string} rawKey - Raw PEM or base64-encoded PEM string
 * @returns {import('node:crypto').KeyObject} Validated native RSA KeyObject
 * @throws {CryptoError} If key format is invalid or unsupported
 */
export function normalizeAppPrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim().length === 0) {
    throw new CryptoError('GitHub App private key is required', 'MISSING_PRIVATE_KEY');
  }

  let pemString = rawKey.trim();

  // If base64 encoded without standard PEM headers, decode it
  if (!pemString.includes('-----BEGIN')) {
    try {
      pemString = Buffer.from(pemString, 'base64').toString('utf8');
    } catch {
      throw new CryptoError('Failed to base64-decode private key', 'INVALID_PRIVATE_KEY');
    }
  }

  // Handle literal escaped newlines ("\n") often introduced by environment variable injection
  pemString = pemString.replace(/\\n/g, '\n');

  try {
    const keyObject = crypto.createPrivateKey({
      key: pemString,
      format: 'pem',
    });

    if (keyObject.asymmetricKeyType !== 'rsa') {
      throw new CryptoError(
        `Invalid key type '${keyObject.asymmetricKeyType}'. RSA 2048+ is required for GitHub Apps.`,
        'INVALID_KEY_TYPE'
      );
    }

    return keyObject;
  } catch (err) {
    if (err instanceof CryptoError) throw err;
    throw new CryptoError(
      'GitHub App private key validation failed: invalid RSA PEM structure',
      'INVALID_PRIVATE_KEY'
    );
  }
}

/**
 * Generates an RS256 signed JSON Web Token (JWT) authenticating as the GitHub App.
 *
 * Timing Specification:
 * - iat: now - 60s (60-second backdated clock skew buffer)
 * - exp: now + 540s (9 minutes validity, safely under GitHub's 10-minute maximum limit)
 * - iss: numeric GITHUB_APP_ID
 *
 * @param {string|number} appId - Numeric GitHub App ID
 * @param {import('node:crypto').KeyObject} privateKeyObject - Validated RSA KeyObject
 * @param {number} [nowEpochSeconds] - Optional epoch seconds for deterministic testing
 * @returns {string} Signed RS256 JWT
 */
export function generateAppJwt(appId, privateKeyObject, nowEpochSeconds = null) {
  if (!appId) {
    throw new ValidationError('GitHub App ID is required for JWT generation');
  }
  if (!privateKeyObject) {
    throw new CryptoError(
      'Private key object is required for JWT generation',
      'MISSING_PRIVATE_KEY'
    );
  }

  const now = nowEpochSeconds !== null ? nowEpochSeconds : Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // 60-second clock skew buffer
    exp: now + 540, // 9-minute validity (GitHub allows max 10 minutes)
    iss: Number(appId) || appId,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(privateKeyObject, 'base64url');

  return `${message}.${signature}`;
}

export class GitHubAppAuthManager {
  /**
   * @param {object} options
   * @param {string|number} options.appId - GitHub App ID
   * @param {string} [options.privateKey] - Raw PEM or base64 PEM
   * @param {string} [options.privateKeyBase64] - Base64 encoded PEM alternative
   * @param {GitHubTokenCache} [options.cache] - Partitioned in-memory token cache
   * @param {typeof fetch} [options.fetchFn=globalThis.fetch] - HTTP fetcher
   * @param {string} [options.baseUrl='https://api.github.com'] - GitHub API base URL
   * @param {number} [options.tokenBufferMs=300000] - 5-minute safety buffer prior to expiration
   * @param {() => number} [options.nowFn] - Time provider function for testing
   * @param {number} [options.maxRetries=2] - Maximum retries for transient 429/5xx errors
   */
  constructor({
    appId,
    privateKey,
    privateKeyBase64,
    cache,
    fetchFn = globalThis.fetch,
    baseUrl = 'https://api.github.com',
    tokenBufferMs = 300000,
    nowFn = () => Date.now(),
    maxRetries = 2,
  }) {
    if (!appId) {
      throw new ValidationError('appId is required to initialize GitHubAppAuthManager');
    }

    const keySource = privateKey || privateKeyBase64;
    if (!keySource) {
      throw new CryptoError(
        'privateKey is required to initialize GitHubAppAuthManager',
        'MISSING_PRIVATE_KEY'
      );
    }

    this.appId = appId;
    this.privateKeyObject = normalizeAppPrivateKey(keySource);
    this.tokenCache = cache || new GitHubTokenCache({ defaultBufferMs: tokenBufferMs, nowFn });
    this.fetch = fetchFn;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenBufferMs = tokenBufferMs;
    this.nowFn = nowFn;
    this.maxRetries = maxRetries;

    /** @type {Map<string, Promise<any>>} In-flight token request coalescing to prevent stampede */
    this.inflight = new Map();
  }

  /**
   * Generates a signed App JWT for current timestamp.
   *
   * @param {number} [nowEpochSeconds]
   * @returns {string}
   */
  getAppJwt(nowEpochSeconds = null) {
    const now = nowEpochSeconds !== null ? nowEpochSeconds : Math.floor(this.nowFn() / 1000);
    return generateAppJwt(this.appId, this.privateKeyObject, now);
  }

  /**
   * Resolves a cached or fresh Installation Access Token (`ghs_*`).
   * Concurrent requests for the same tenant + installation + repo scope coalesce into a single HTTP call.
   *
   * @param {object} params
   * @param {string} params.tenantId - Trusted tenant UUID
   * @param {string|number} params.installationId - GitHub App installation ID
   * @param {string[]|null} [params.repositories=null] - Optional repository names scope
   * @returns {Promise<{ token: string, expiresAt: Date, permissions: object, repositorySelection: string, installationId: string }>}
   */
  async getInstallationToken({ tenantId, installationId, repositories = null }) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new ValidationError('tenantId is required to get installation token');
    }
    if (!installationId) {
      throw new ValidationError('installationId is required to get installation token');
    }

    // 1. Check in-memory partitioned cache
    const cached = this.tokenCache.get(tenantId, installationId, repositories, this.tokenBufferMs);
    if (cached) {
      return {
        token: cached.token,
        expiresAt: cached.expiresAt,
        permissions: cached.permissions,
        repositorySelection: cached.repositorySelection || (repositories ? 'selected' : 'all'),
        installationId: String(installationId),
      };
    }

    // 2. Coalesce in-flight token requests for the same cache key
    const cacheKey = buildTokenCacheKey(tenantId, installationId, repositories);
    if (this.inflight.has(cacheKey)) {
      return this.inflight.get(cacheKey);
    }

    // 3. Initiate single-flight token generation
    const tokenPromise = this._fetchInstallationTokenWithRetry(
      tenantId,
      installationId,
      repositories
    ).finally(() => {
      this.inflight.delete(cacheKey);
    });

    this.inflight.set(cacheKey, tokenPromise);
    return tokenPromise;
  }

  /**
   * Fetches an installation access token from GitHub REST API with bounded exponential backoff.
   *
   * @private
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string[]|null} repositories
   * @returns {Promise<{ token: string, expiresAt: Date, permissions: object, repositorySelection: string, installationId: string }>}
   */
  async _fetchInstallationTokenWithRetry(tenantId, installationId, repositories) {
    const url = `${this.baseUrl}/app/installations/${encodeURIComponent(String(installationId))}/access_tokens`;
    const requestBody = {
      permissions: {
        contents: 'read',
        metadata: 'read',
      },
    };

    if (Array.isArray(repositories) && repositories.length > 0) {
      requestBody.repositories = repositories;
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      const jwt = this.getAppJwt();

      try {
        const res = await this.fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'Antigravity-Career-Hub/0.1.0',
          },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          let errorPayload;
          try {
            errorPayload = await res.json();
          } catch {
            errorPayload = await res.text().catch(() => '');
          }

          const parsedError = parseGitHubErrorResponse(res.status, errorPayload, res.headers);

          // If rate limited or 5xx service unavailable and attempts remain, retry with backoff
          const shouldRetry =
            (res.status === 429 || res.status >= 500) && attempt < this.maxRetries;

          if (shouldRetry) {
            attempt++;
            const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 5000);
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw parsedError;
        }

        const data = await res.json();
        if (!data || !data.token || !data.expires_at) {
          throw new GitHubApiError(
            'Malformed token response received from GitHub API',
            'MALFORMED_TOKEN_RESPONSE',
            502
          );
        }

        const tokenData = {
          token: data.token,
          expiresAt: new Date(data.expires_at),
          permissions: data.permissions || { contents: 'read', metadata: 'read' },
          repositorySelection: data.repository_selection || (repositories ? 'selected' : 'all'),
          installationId: String(installationId),
        };

        // Cache the newly minted token
        this.tokenCache.set(tenantId, installationId, repositories, tokenData);

        return tokenData;
      } catch (err) {
        if (err.isOperational) throw err;
        // Network errors (DNS, TCP, timeouts)
        if (attempt < this.maxRetries) {
          attempt++;
          const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 100, 3000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new GitHubApiError(
          `Failed to connect to GitHub API: ${err.message}`,
          'GITHUB_NETWORK_ERROR',
          503,
          true
        );
      }
    }

    throw new GitHubApiError(
      'Exceeded maximum token acquisition retry attempts',
      'MAX_RETRIES_EXCEEDED',
      503
    );
  }

  /**
   * Revokes an installation token upstream and evicts from local memory cache.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string|number} params.installationId
   * @param {string} [params.token] - Optional ghs_* token to revoke upstream
   * @returns {Promise<{ revoked: boolean }>}
   */
  async revokeInstallationToken({ tenantId, installationId, token = null }) {
    // 1. Evict from memory cache immediately
    this.tokenCache.evict(tenantId, installationId);

    // 2. If token is provided, attempt best-effort upstream revocation
    if (token && typeof token === 'string' && token.startsWith('ghs_')) {
      try {
        await this.fetch(`${this.baseUrl}/installation/token`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Antigravity-Career-Hub/0.1.0',
          },
        });
      } catch {
        // Upstream revocation is best-effort
      }
    }

    return { revoked: true };
  }

  /**
   * Explicitly evicts cached tokens for a tenant and installation.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   */
  evictInstallationTokens(tenantId, installationId) {
    this.tokenCache.evict(tenantId, installationId);
  }
}
