/**
 * @file Model Context Protocol (MCP) Multi-Tier Rate Limiter.
 *
 * Implements sliding-window rate limiting across three tiers:
 * 1. IP-level protection against connection floods.
 * 2. Tenant-level quota enforcement against resource exhaustion.
 * 3. Per-tool compute budget management for compute-heavy actions.
 */

import { AppError } from '../errors/index.js';

export class McpRateLimiter {
  /**
   * @param {object} [options={}] Configuration options
   * @param {number} [options.ipLimit=120] Max requests per window per IP
   * @param {number} [options.tenantLimit=600] Max requests per window per Tenant
   * @param {number} [options.toolLimit=60] Max calls per window per Tool per Tenant
   * @param {number} [options.windowMs=60000] Time window duration in milliseconds (default 60s)
   */
  constructor(options = {}) {
    this.ipLimit = options.ipLimit || 120;
    this.tenantLimit = options.tenantLimit || 600;
    this.toolLimit = options.toolLimit || 60;
    this.windowMs = options.windowMs || 60000;
    this.hits = new Map();
  }

  /**
   * Evaluates request hit against a sliding time window limit.
   *
   * @param {string} key Unique tracking key
   * @param {number} maxRequests Maximum allowed requests in window
   * @param {number} [windowMs] Window length in milliseconds
   * @throws {AppError} If rate limit is exceeded (HTTP 429 / RATE_LIMITED)
   */
  checkLimit(key, maxRequests, windowMs = this.windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Prune stale timestamps outside window
    const validTimestamps = timestamps.filter((t) => t > windowStart);
    this.hits.set(key, validTimestamps);

    if (validTimestamps.length >= maxRequests) {
      throw new AppError('Rate limit exceeded. Please retry later.', 429, 'RATE_LIMITED');
    }

    validTimestamps.push(now);
  }

  /**
   * Checks IP rate limit tier.
   *
   * @param {string} ip Client IP address
   */
  checkIpLimit(ip) {
    if (!ip) return;
    this.checkLimit(`ip:${ip}`, this.ipLimit);
  }

  /**
   * Checks Tenant rate limit tier.
   *
   * @param {string} tenantId Tenant UUID
   */
  checkTenantLimit(tenantId) {
    if (!tenantId) return;
    this.checkLimit(`tenant:${tenantId}`, this.tenantLimit);
  }

  /**
   * Checks per-tool compute budget tier.
   *
   * @param {string} tenantId Tenant UUID
   * @param {string} toolName Name of the tool being called
   */
  checkToolLimit(tenantId, toolName) {
    if (!tenantId || !toolName) return;
    this.checkLimit(`tool:${tenantId}:${toolName}`, this.toolLimit);
  }

  /**
   * Resets all rate limit tracking state (useful in test teardown).
   */
  reset() {
    this.hits.clear();
  }
}

/**
 * Singleton rate limiter instance for application runtime.
 */
export const defaultMcpRateLimiter = new McpRateLimiter();
