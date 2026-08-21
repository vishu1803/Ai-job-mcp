/**
 * @file GitHub Connector In-Memory LRU Cache (Task P3-006)
 *
 * Implements a multi-tenant partitioned, size-bounded in-memory LRU cache
 * with HTTP ETag support and centralized TTL selection:
 * 1. O(1) lookups via Map-based LRU tracking
 * 2. Deterministic cache key generation with parameter hashing
 * 3. Multi-tenant isolation (strict tenantId + installationId namespacing)
 * 4. Fresh cache hits, stale hits with ETag, 304 revalidations, and 200 invalidations
 * 5. Global capacity limit (2,000 entries) and per-tenant limit (500 entries)
 * 6. Hard payload size bounds (rejects items > 1 MB)
 * 7. Webhook-driven targeted purging by installation, operation, or resourceId
 */

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import { ValidationError } from '../../errors/index.js';

/**
 * Standard TTL definitions in seconds for GitHub connector operations.
 * @readonly
 */
export const GITHUB_CACHE_TTL = Object.freeze({
  GET_ACCOUNT: 300, // 5 minutes
  LIST_RESOURCES: 600, // 10 minutes
  GET_RESOURCE: 900, // 15 minutes
  GET_LANGUAGES: 1800, // 30 minutes
  GET_REPOSITORY_TREE: 900, // 15 minutes
  GET_REPOSITORY_TREE_PINNED: 86400, // 24 hours (for immutable commit/tree SHA)
  GET_README: 900, // 15 minutes
  GET_README_PINNED: 86400, // 24 hours
  GET_FILE_CONTENT: 900, // 15 minutes
  GET_FILE_CONTENT_PINNED: 86400, // 24 hours
  GET_RECENT_COMMITS: 300, // 5 minutes
});

const MAX_GLOBAL_ENTRIES = 2000;
const MAX_TENANT_ENTRIES = 500;
const MAX_ITEM_SIZE_BYTES = 1048576; // 1 MB

export class GitHubConnectorCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEntries=2000] - Maximum global entries
   * @param {number} [options.maxEntriesPerTenant=500] - Maximum entries per tenant
   */
  constructor({ maxEntries = MAX_GLOBAL_ENTRIES, maxEntriesPerTenant = MAX_TENANT_ENTRIES } = {}) {
    this.maxEntries = maxEntries;
    this.maxEntriesPerTenant = maxEntriesPerTenant;

    /** @type {Map<string, object>} */
    this.store = new Map();

    /** @type {Map<string, Set<string>>} */
    this.tenantKeys = new Map();

    this.stats = {
      hits: 0,
      misses: 0,
      revalidations304: 0,
      evictions: 0,
    };
  }

  /**
   * Generates a deterministic, stable cache key for a request.
   * Format: gh_cache:<tenantId>:<installationId>:<operation>:<resourceId>:<paramsHash>
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string} operation
   * @param {string|null} [resourceId=null]
   * @param {Record<string, any>} [params={}]
   * @returns {string}
   */
  generateKey(tenantId, installationId, operation, resourceId = null, params = {}) {
    if (!tenantId || typeof tenantId !== 'string') {
      throw new ValidationError('tenantId is mandatory for cache key generation');
    }
    if (!installationId) {
      throw new ValidationError('installationId is mandatory for cache key generation');
    }
    if (!operation || typeof operation !== 'string') {
      throw new ValidationError('operation is mandatory for cache key generation');
    }

    const safeResourceId = resourceId ? String(resourceId).trim() : 'root';
    const paramsHash = this._hashParams(params);

    return `gh_cache:${tenantId}:${installationId}:${operation}:${safeResourceId}:${paramsHash}`;
  }

  /**
   * Deterministically hashes query parameters.
   *
   * @private
   * @param {Record<string, any>} params
   * @returns {string}
   */
  _hashParams(params) {
    if (!params || typeof params !== 'object') {
      return 'none';
    }

    const keys = Object.keys(params).filter((k) => params[k] !== undefined);
    if (keys.length === 0) {
      return 'none';
    }

    keys.sort();
    const sortedObj = {};
    for (const key of keys) {
      sortedObj[key] = params[key];
    }

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(sortedObj))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Retrieves an item from the cache.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string} operation
   * @param {string|null} [resourceId=null]
   * @param {Record<string, any>} [params={}]
   * @returns {object|null}
   */
  get(tenantId, installationId, operation, resourceId = null, params = {}) {
    const key = this.generateKey(tenantId, installationId, operation, resourceId, params);
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Refresh LRU order (delete & re-set)
    this.store.delete(key);
    this.store.set(key, entry);

    const now = Date.now();
    const isExpired = now >= entry.expiresAt;

    if (!isExpired) {
      this.stats.hits++;
    }

    return {
      data: entry.data,
      etag: entry.etag,
      cachedAt: entry.cachedAt,
      expiresAt: entry.expiresAt,
      lastValidatedAt: entry.lastValidatedAt,
      sizeBytes: entry.sizeBytes,
      isExpired,
    };
  }

  /**
   * Stores an item in the cache with TTL and size limits.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string} operation
   * @param {string|null} resourceId
   * @param {Record<string, any>} params
   * @param {object} entry
   * @param {any} entry.data - Normalized domain model
   * @param {string|null} [entry.etag=null] - Upstream ETag header
   * @param {number} ttlSeconds - Time-to-live in seconds
   * @returns {boolean} True if successfully stored, false if rejected due to size
   */
  set(tenantId, installationId, operation, resourceId, params, entry, ttlSeconds) {
    if (!entry || entry.data === undefined) {
      return false;
    }

    const key = this.generateKey(tenantId, installationId, operation, resourceId, params);
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : 300;

    // Approximate size in bytes
    let sizeBytes = 0;
    try {
      sizeBytes = Buffer.byteLength(JSON.stringify(entry.data));
    } catch {
      sizeBytes = 1024;
    }

    // Reject payloads exceeding 1 MB
    if (sizeBytes > MAX_ITEM_SIZE_BYTES) {
      return false;
    }

    const now = Date.now();
    const cacheRecord = {
      key,
      tenantId,
      installationId: String(installationId),
      operation,
      resourceId: resourceId ? String(resourceId) : 'root',
      data: entry.data,
      etag: entry.etag || null,
      cachedAt: now,
      lastValidatedAt: now,
      expiresAt: now + ttl * 1000,
      sizeBytes,
    };

    // If key existed, delete it first to update tenant set properly
    if (this.store.has(key)) {
      this.store.delete(key);
    }

    // Enforce per-tenant capacity limit (500 max)
    let tenantKeySet = this.tenantKeys.get(tenantId);
    if (!tenantKeySet) {
      tenantKeySet = new Set();
      this.tenantKeys.set(tenantId, tenantKeySet);
    }

    if (tenantKeySet.size >= this.maxEntriesPerTenant) {
      // Evict oldest entry for this tenant
      const oldestTenantKey = tenantKeySet.values().next().value;
      if (oldestTenantKey) {
        this._removeKey(oldestTenantKey, tenantId);
        this.stats.evictions++;
      }
    }

    // Enforce global capacity limit (2,000 max)
    if (this.store.size >= this.maxEntries) {
      // Evict oldest global entry
      const oldestGlobalKey = this.store.keys().next().value;
      if (oldestGlobalKey) {
        const oldestItem = this.store.get(oldestGlobalKey);
        this._removeKey(oldestGlobalKey, oldestItem?.tenantId);
        this.stats.evictions++;
      }
    }

    // Insert new item
    this.store.set(key, cacheRecord);
    tenantKeySet.add(key);

    return true;
  }

  /**
   * Touches an existing cache entry on HTTP 304 Not Modified, resetting its TTL.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string} operation
   * @param {string|null} [resourceId=null]
   * @param {Record<string, any>} [params={}]
   * @param {number} [ttlSeconds=300]
   * @returns {boolean}
   */
  touch(tenantId, installationId, operation, resourceId = null, params = {}, ttlSeconds = 300) {
    const key = this.generateKey(tenantId, installationId, operation, resourceId, params);
    const entry = this.store.get(key);

    if (!entry) {
      return false;
    }

    const now = Date.now();
    entry.lastValidatedAt = now;
    entry.expiresAt = now + ttlSeconds * 1000;

    // Refresh LRU position
    this.store.delete(key);
    this.store.set(key, entry);

    this.stats.revalidations304++;
    return true;
  }

  /**
   * Evicts cache entries matching the specified tenant, installation, operation, and resource.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {string|null} [operation=null] - If null, evicts all for tenant+installation
   * @param {string|null} [resourceId=null] - If null, evicts all for operation
   * @returns {number} Number of evicted entries
   */
  evict(tenantId, installationId, operation = null, resourceId = null) {
    const tenantKeySet = this.tenantKeys.get(tenantId);
    if (!tenantKeySet || tenantKeySet.size === 0) {
      return 0;
    }

    const instIdStr = String(installationId);
    const targetResourceId = resourceId ? String(resourceId).trim() : null;
    const keysToDelete = [];

    for (const key of tenantKeySet) {
      const entry = this.store.get(key);
      if (!entry || entry.installationId !== instIdStr) {
        continue;
      }

      if (operation !== null && entry.operation !== operation) {
        continue;
      }

      if (targetResourceId !== null && entry.resourceId !== targetResourceId) {
        continue;
      }

      keysToDelete.push(key);
    }

    for (const key of keysToDelete) {
      this._removeKey(key, tenantId);
    }

    this.stats.evictions += keysToDelete.length;
    return keysToDelete.length;
  }

  /**
   * Evicts all cache entries belonging to a tenant.
   *
   * @param {string} tenantId
   * @returns {number}
   */
  evictTenant(tenantId) {
    const tenantKeySet = this.tenantKeys.get(tenantId);
    if (!tenantKeySet) {
      return 0;
    }

    const count = tenantKeySet.size;
    for (const key of tenantKeySet) {
      this.store.delete(key);
    }

    this.tenantKeys.delete(tenantId);
    this.stats.evictions += count;
    return count;
  }

  /**
   * Internal helper to remove a key from both main store and tenant set.
   *
   * @private
   * @param {string} key
   * @param {string} [tenantId]
   */
  _removeKey(key, tenantId) {
    this.store.delete(key);
    if (tenantId) {
      const tenantKeySet = this.tenantKeys.get(tenantId);
      if (tenantKeySet) {
        tenantKeySet.delete(key);
        if (tenantKeySet.size === 0) {
          this.tenantKeys.delete(tenantId);
        }
      }
    }
  }

  /**
   * Clears the entire cache store and tenant mappings.
   */
  clear() {
    this.store.clear();
    this.tenantKeys.clear();
  }

  /**
   * Returns current cache statistics.
   *
   * @returns {{ hits: number, misses: number, revalidations304: number, evictions: number, size: number }}
   */
  getStats() {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      revalidations304: this.stats.revalidations304,
      evictions: this.stats.evictions,
      size: this.store.size,
    };
  }
}

/**
 * Default singleton instance shared across GitHub connectors and webhook processors.
 */
export const defaultGitHubConnectorCache = new GitHubConnectorCache();
