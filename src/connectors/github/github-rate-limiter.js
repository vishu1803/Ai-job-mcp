/**
 * @file GitHub Connector Rate-Limit Tracker (Task P3-006)
 *
 * Implements an in-memory, tenant-partitioned rate-limit tracking and throttling layer:
 * 1. Tracks primary hourly quota per (tenantId + installationId)
 * 2. Parses GitHub x-ratelimit-limit, x-ratelimit-remaining, and x-ratelimit-reset headers
 * 3. Proactively warns when remaining quota <= 50
 * 4. Applies artificial delay throttling when remaining quota <= 5
 * 5. Rejects requests with ProviderRateLimitError when quota is exhausted
 */

import { ProviderRateLimitError } from '../errors/connector-errors.js';
import { logger } from '../../utils/logger.js';

export class GitHubRateLimiter {
  constructor() {
    /** @type {Map<string, { limit: number, remaining: number, resetAt: Date, updatedAt: number }>} */
    this.quotas = new Map();
  }

  /**
   * Generates internal namespace key for tenant + installation.
   *
   * @private
   * @param {string} tenantId
   * @param {string|number} installationId
   * @returns {string}
   */
  _getKey(tenantId, installationId) {
    return `${tenantId}:${installationId}`;
  }

  /**
   * Helper to safely extract a header value case-insensitively.
   *
   * @private
   * @param {Headers|Record<string, string>|null} headers
   * @param {string} name
   * @returns {string|null}
   */
  _getHeader(headers, name) {
    if (!headers) return null;
    const target = name.toLowerCase();

    // If headers is a Web standard Headers object or Map
    if (typeof headers.get === 'function') {
      const direct = headers.get(name) ?? headers.get(target);
      if (direct !== null && direct !== undefined) {
        return direct;
      }
    }

    if (typeof headers.entries === 'function') {
      for (const [key, val] of headers.entries()) {
        if (typeof key === 'string' && key.toLowerCase() === target) {
          return typeof val === 'string' ? val : Array.isArray(val) ? val[0] : String(val);
        }
      }
    }

    if (typeof headers === 'object') {
      for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === target) {
          return typeof val === 'string' ? val : Array.isArray(val) ? val[0] : String(val);
        }
      }
    }

    return null;
  }

  /**
   * Updates quota state from response headers.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @param {Headers|Record<string, string>|null} headers
   * @returns {object|null} Updated quota object or null if headers absent
   */
  updateFromHeaders(tenantId, installationId, headers) {
    if (!tenantId || !installationId || !headers) {
      return null;
    }

    const rawLimit = this._getHeader(headers, 'x-ratelimit-limit');
    const rawRemaining = this._getHeader(headers, 'x-ratelimit-remaining');
    const rawReset = this._getHeader(headers, 'x-ratelimit-reset');

    if (rawRemaining === null || rawRemaining === undefined) {
      return null;
    }

    const limit = rawLimit !== null ? Number(rawLimit) : 5000;
    const remaining = Number(rawRemaining);
    let resetAt;

    if (rawReset) {
      const resetEpoch = Number(rawReset);
      resetAt = !isNaN(resetEpoch) ? new Date(resetEpoch * 1000) : new Date(Date.now() + 3600000);
    } else {
      resetAt = new Date(Date.now() + 3600000);
    }

    const key = this._getKey(tenantId, installationId);
    const quotaState = {
      limit: !isNaN(limit) ? limit : 5000,
      remaining: !isNaN(remaining) ? remaining : 0,
      resetAt,
      updatedAt: Date.now(),
    };

    this.quotas.set(key, quotaState);

    // Proactive warning when quota is <= 50
    if (quotaState.remaining <= 50) {
      logger.warn(
        {
          provider: 'GITHUB_APP',
          tenantId,
          installationId: String(installationId),
          remaining: quotaState.remaining,
          limit: quotaState.limit,
          resetAt: quotaState.resetAt.toISOString(),
        },
        'GitHub API rate limit remaining quota is critically low (<= 50)'
      );
    }

    return quotaState;
  }

  /**
   * Returns current quota state for tenant + installation.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @returns {{ limit: number, remaining: number, resetAt: Date }|null}
   */
  getQuota(tenantId, installationId) {
    if (!tenantId || !installationId) return null;
    const key = this._getKey(tenantId, installationId);
    const quota = this.quotas.get(key);
    if (!quota) return null;

    return {
      limit: quota.limit,
      remaining: quota.remaining,
      resetAt: quota.resetAt,
    };
  }

  /**
   * Asserts that quota is available before making a request.
   * Enforces artificial jittered backoff if quota is <= 5, or throws ProviderRateLimitError if 0.
   *
   * @param {string} tenantId
   * @param {string|number} installationId
   * @returns {Promise<void>}
   */
  async assertAvailableQuota(tenantId, installationId) {
    if (!tenantId || !installationId) return;
    const key = this._getKey(tenantId, installationId);
    const quota = this.quotas.get(key);
    if (!quota) return;

    const now = Date.now();

    // If quota reset time has passed, reset assumed quota
    if (quota.resetAt && now >= quota.resetAt.getTime()) {
      this.quotas.delete(key);
      return;
    }

    // If remaining is 0 and still within reset window, reject immediately
    if (quota.remaining <= 0) {
      const retryAfter = Math.max(1, Math.ceil((quota.resetAt.getTime() - now) / 1000));
      throw new ProviderRateLimitError('GITHUB_APP', retryAfter, quota.resetAt);
    }

    // If remaining is dangerously low (<= 5), apply artificial throttling delay
    if (quota.remaining <= 5) {
      const throttleDelayMs = (6 - quota.remaining) * 100; // 100ms..500ms
      await new Promise((resolve) => setTimeout(resolve, throttleDelayMs));
    }
  }

  /**
   * Clears all in-memory quota records.
   */
  clear() {
    this.quotas.clear();
  }
}

/**
 * Default singleton instance shared across GitHub connectors.
 */
export const defaultGitHubRateLimiter = new GitHubRateLimiter();
