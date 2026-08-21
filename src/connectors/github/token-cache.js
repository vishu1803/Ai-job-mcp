/**
 * @file Partitioned In-Memory GitHub Installation Token Cache
 *
 * Implements tenant-partitioned in-memory caching with a proactive 5-minute
 * safety refresh window to prevent in-flight token expiration.
 */

import crypto from 'node:crypto';
import { ValidationError } from '../../errors/index.js';

/**
 * Builds a deterministic, partitioned cache key for an installation access token.
 *
 * @param {string} tenantId - Trusted tenant UUID
 * @param {string|number} installationId - GitHub App installation ID
 * @param {string[]|null} [repositories=null] - Selected repository list
 * @returns {string} Partitioned cache key
 */
export function buildTokenCacheKey(tenantId, installationId, repositories = null) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ValidationError('tenantId is mandatory for token cache key');
  }
  if (!installationId) {
    throw new ValidationError('installationId is mandatory for token cache key');
  }

  const repoPart =
    Array.isArray(repositories) && repositories.length > 0
      ? [...repositories].map(String).sort().join(',')
      : '*';

  const repoHash = crypto.createHash('sha256').update(repoPart).digest('hex').slice(0, 16);
  return `gh_token:${tenantId}:${installationId}:${repoHash}`;
}

export class GitHubTokenCache {
  /**
   * @param {object} [options]
   * @param {number} [options.defaultBufferMs=300000] - 5-minute safety buffer prior to expiration
   * @param {() => number} [options.nowFn] - Time provider function for deterministic testing
   */
  constructor({ defaultBufferMs = 300000, nowFn = () => Date.now() } = {}) {
    this.defaultBufferMs = defaultBufferMs;
    this.nowFn = nowFn;
    /** @type {Map<string, { token: string, expiresAt: Date, permissions: object, repositorySelection?: string }>} */
    this.cache = new Map();
  }

  /**
   * Retrieves a cached token if present and not within the refresh safety buffer.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string[]|null} [repositories=null]
   * @param {number} [bufferMs=this.defaultBufferMs]
   * @returns {{ token: string, expiresAt: Date, permissions: object, repositorySelection?: string } | null}
   */
  get(tenantId, installationId, repositories = null, bufferMs = this.defaultBufferMs) {
    const key = buildTokenCacheKey(tenantId, installationId, repositories);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = this.nowFn();
    const expiryTime =
      entry.expiresAt instanceof Date
        ? entry.expiresAt.getTime()
        : new Date(entry.expiresAt).getTime();

    // If remaining lifetime is less than buffer window, evict and report cache miss
    if (now >= expiryTime - bufferMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  /**
   * Stores an installation access token in the partitioned cache.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string[]|null} repositories
   * @param {{ token: string, expiresAt: Date|string, permissions: object, repositorySelection?: string }} tokenData
   */
  set(tenantId, installationId, repositories, tokenData) {
    const key = buildTokenCacheKey(tenantId, installationId, repositories);
    const expiresAt =
      tokenData.expiresAt instanceof Date ? tokenData.expiresAt : new Date(tokenData.expiresAt);

    this.cache.set(key, {
      token: tokenData.token,
      expiresAt,
      permissions: tokenData.permissions || { contents: 'read', metadata: 'read' },
      repositorySelection: tokenData.repositorySelection,
    });
  }

  /**
   * Evicts cached tokens for a specific installation or repository scope.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string[]|null} [repositories]
   */
  evict(tenantId, installationId, repositories = null) {
    if (repositories !== null && repositories !== undefined) {
      const key = buildTokenCacheKey(tenantId, installationId, repositories);
      this.cache.delete(key);
      return;
    }

    const prefix = `gh_token:${tenantId}:${installationId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evicts all cached tokens belonging to a specific tenant workspace.
   *
   * @param {string} tenantId
   */
  evictTenant(tenantId) {
    const prefix = `gh_token:${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire in-memory cache.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Returns active entries count.
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }
}
