/**
 * @file Model Context Protocol (MCP) Application Rate Limiter.
 *
 * Single-instance application rate limiter with concurrency protection.
 *
 * Algorithm: Sliding-window counter with bounded memory.
 * - Each key tracks an array of timestamps within the current window.
 * - Stale timestamps are pruned on each check.
 * - Memory is bounded: when unique keys exceed `maxKeys`, the least-recently-used
 *   keys are evicted. This prevents unbounded Map growth under key-explosion attacks.
 *
 * This is NOT a distributed rate limiter. It operates entirely in-process memory.
 * It is appropriate for single-instance deployments. For multi-instance deployments,
 * a shared store (Redis/Upstash/PostgreSQL-backed) would be required.
 *
 * Tool cost classification:
 * - CHEAP: protocol operations, simple reads (120/min/token)
 * - MEDIUM: standard DB reads (60/min/token)
 * - HIGH: analysis/synthesis operations (20/min/token)
 * - EXPENSIVE: write operations, document generation (5/min/token)
 */

import { logger } from '../utils/logger.js';
import { AppError } from '../errors/index.js';

// =============================================================================
// Tool Cost Classification
// =============================================================================

/**
 * Cost tier for MCP tools. Determines per-token rate limits.
 * - CHEAP:    120 requests/min/token (initialize, tools/list, simple reads)
 * - MEDIUM:   60 requests/min/token  (profile reads, evidence reads, tracking reads)
 * - HIGH:     20 requests/min/token  (analyze_job_fit, portfolio recommendation)
 * - EXPENSIVE: 5 requests/min/token  (write tools, resume/cover letter generation)
 */
export const ToolCostTier = Object.freeze({
  CHEAP: 'CHEAP',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  EXPENSIVE: 'EXPENSIVE',
});

/**
 * Maps MCP tool names to their cost tier.
 * Tools not listed default to MEDIUM.
 */
export const TOOL_COST_MAP = Object.freeze({
  // Protocol
  initialize: ToolCostTier.CHEAP,
  'tools/list': ToolCostTier.CHEAP,
  ping: ToolCostTier.CHEAP,

  // Career Read (MEDIUM for simple, HIGH for complex)
  get_candidate_profile: ToolCostTier.MEDIUM,
  list_verified_skills: ToolCostTier.MEDIUM,
  inspect_project_evidence: ToolCostTier.MEDIUM,
  analyze_job_fit: ToolCostTier.HIGH,

  // Career Artifact
  recommend_portfolio_projects: ToolCostTier.HIGH,
  draft_cover_letter: ToolCostTier.EXPENSIVE,
  generate_tailored_resume: ToolCostTier.EXPENSIVE,

  // Career Write
  propose_project_improvement: ToolCostTier.EXPENSIVE,
  confirm_and_create_pr: ToolCostTier.EXPENSIVE,

  // Career Tracking (reads are MEDIUM, writes are MEDIUM-HIGH)
  track_job_application: ToolCostTier.MEDIUM,
  update_application_status: ToolCostTier.MEDIUM,
  add_application_stage: ToolCostTier.MEDIUM,
  update_application_stage_outcome: ToolCostTier.MEDIUM,
  attach_application_document: ToolCostTier.HIGH,
  get_job_application: ToolCostTier.MEDIUM,
  list_active_applications: ToolCostTier.MEDIUM,
});

/**
 * Per-token rate limits (requests per 60-second sliding window) by cost tier.
 */
export const TIER_LIMITS = Object.freeze({
  [ToolCostTier.CHEAP]: 120,
  [ToolCostTier.MEDIUM]: 60,
  [ToolCostTier.HIGH]: 20,
  [ToolCostTier.EXPENSIVE]: 5,
});

// =============================================================================
// Bounded Sliding-Window Rate Limiter
// =============================================================================

/**
 * In-memory sliding-window rate limiter with bounded memory and LRU eviction.
 *
 * Memory bounds:
 * - `maxKeys`: Maximum number of unique tracking keys. When exceeded,
 *   the least-recently-used keys are evicted. Default: 50,000.
 * - Each key stores an array of timestamps. The array is pruned on each check.
 *
 * Failure mode:
 * - If the limiter throws internally, the request is ALLOWED (fail-open).
 *   This prevents limiter bugs from causing a total service outage.
 *   Security-critical limits (auth brute-force) use tighter bounds that
 *   make fail-open acceptable because Cloudflare provides the outer protection.
 *
 * Thread safety:
 * - Single-process only. No locking needed.
 */
export class McpRateLimiter {
  /**
   * @param {object} [options={}]
   * @param {number} [options.ipLimit=30] Max requests per window per IP (pre-auth)
   * @param {number} [options.tenantLimit=100] Max requests per window per tenant (post-auth)
   * @param {number} [options.tokenLimit=60] Max requests per window per MCP token (post-auth)
   * @param {number} [options.windowMs=60000] Time window duration in ms (default 60s)
   * @param {number} [options.maxKeys=50000] Maximum unique keys before LRU eviction
   * @param {number} [options.authLimit=10] Max auth attempts per window per IP
   */
  constructor(options = {}) {
    this.ipLimit = options.ipLimit !== undefined ? options.ipLimit : 30;
    this.tenantLimit = options.tenantLimit !== undefined ? options.tenantLimit : 100;
    this.tokenLimit = options.tokenLimit !== undefined ? options.tokenLimit : 60;
    this.authLimit = options.authLimit !== undefined ? options.authLimit : 10;
    this.windowMs = options.windowMs !== undefined ? options.windowMs : 60000;
    this.maxKeys = options.maxKeys !== undefined ? options.maxKeys : 50000;
    // Backward compatibility: if toolLimit is provided, override tier-based limits
    if (options.toolLimit !== undefined) {
      this.toolLimit = options.toolLimit;
    }

    /** @type {Map<string, number[]>} key -> array of timestamps in window */
    this.hits = new Map();

    /** @type {Map<string, number>} key -> last access timestamp for LRU ordering */
    this.lastAccess = new Map();

    /** @type {{ allowed: number, denied: number, total: number }} */
    this.stats = { allowed: 0, denied: 0, total: 0 };
  }

  // -------------------------------------------------------------------------
  // Core sliding-window check
  // -------------------------------------------------------------------------

  /**
   * Checks whether a request is within the rate limit for a given key.
   *
   * @param {string} key Unique tracking key
   * @param {number} maxRequests Maximum allowed requests in window
   * @param {number} [windowMs] Window length in milliseconds
   * @returns {{ allowed: boolean, retryAfterMs: number }} Result and suggested retry delay
   */
  checkLimit(key, maxRequests, windowMs = this.windowMs) {
    if (!key) {
      return { allowed: true, retryAfterMs: 0 };
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      // LRU eviction: if we're at capacity, evict the least-recently-used 10%
      if (this.hits.size >= this.maxKeys && !this.hits.has(key)) {
        this._evictLru(Math.ceil(this.maxKeys * 0.1));
      }

      let timestamps = this.hits.get(key);
      if (!timestamps) {
        timestamps = [];
        this.hits.set(key, timestamps);
      }

      // Prune stale timestamps outside window
      if (timestamps.length > 0) {
        let writeIdx = 0;
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] > windowStart) {
            timestamps[writeIdx++] = timestamps[i];
          }
        }
        timestamps.length = writeIdx;
      }

      // Update LRU access time
      this.lastAccess.set(key, Date.now());

      if (timestamps.length >= maxRequests) {
        // Compute retry-after: time until the oldest timestamp in window expires
        const oldestInWindow = timestamps[0];
        const retryAfterMs = Math.max(1, oldestInWindow + windowMs - now);
        this.stats.denied++;
        this.stats.total++;
        return { allowed: false, retryAfterMs };
      }

      timestamps.push(now);
      this.stats.allowed++;
      this.stats.total++;
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      // Fail-open: if limiter logic throws, allow the request
      logger.warn({ err, key }, 'Rate limiter internal error — failing open');
      this.stats.allowed++;
      this.stats.total++;
      return { allowed: true, retryAfterMs: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Tier-specific check methods (backward compatible)
  // -------------------------------------------------------------------------

  /**
   * Checks IP rate limit tier (pre-auth). Throws AppError on violation.
   * @param {string} ip Client IP address
   * @param {number} [limit] Override limit
   * @throws {Error} With statusCode 429 if rate limit exceeded
   */
  checkIpLimit(ip, limit) {
    if (!ip) return;
    const result = this.checkLimit(`ip:${ip}`, limit || this.ipLimit);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      throw new AppError(
        `Rate limit exceeded. Please retry after ${retryAfterSec} seconds.`,
        429,
        'RATE_LIMITED'
      );
    }
  }

  /**
   * Checks IP rate limit tier without throwing. Returns result object.
   * Used by MCP routes for proper Retry-After header handling.
   * @param {string} ip Client IP address
   * @param {number} [limit] Override limit
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkIpLimitResult(ip, limit) {
    if (!ip) return { allowed: true, retryAfterMs: 0 };
    return this.checkLimit(`ip:${ip}`, limit || this.ipLimit);
  }

  /**
   * Checks auth endpoint rate limit (pre-auth, tighter than general IP).
   * @param {string} ip Client IP address
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkAuthLimit(ip) {
    if (!ip) return { allowed: true, retryAfterMs: 0 };
    return this.checkLimit(`auth:${ip}`, this.authLimit);
  }

  /**
   * Checks Tenant rate limit tier (post-auth). Throws AppError on violation.
   * @param {string} tenantId Tenant UUID
   * @param {number} [limit] Override limit
   * @throws {Error} With statusCode 429 if rate limit exceeded
   */
  checkTenantLimit(tenantId, limit) {
    if (!tenantId) return;
    const result = this.checkLimit(`tenant:${tenantId}`, limit || this.tenantLimit);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      throw new AppError(
        `Rate limit exceeded. Please retry after ${retryAfterSec} seconds.`,
        429,
        'RATE_LIMITED'
      );
    }
  }

  /**
   * Checks Tenant rate limit tier without throwing. Returns result object.
   * Used by MCP routes for proper Retry-After header handling.
   * @param {string} tenantId Tenant UUID
   * @param {number} [limit] Override limit
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkTenantLimitResult(tenantId, limit) {
    if (!tenantId) return { allowed: true, retryAfterMs: 0 };
    return this.checkLimit(`tenant:${tenantId}`, limit || this.tenantLimit);
  }

  /**
   * Checks per-MCP-token rate limit tier (post-auth).
   * @param {string} tokenHash SHA-256 hash of the bearer token
   * @param {number} [limit] Override limit
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkTokenLimit(tokenHash, limit) {
    if (!tokenHash) return { allowed: true, retryAfterMs: 0 };
    return this.checkLimit(`token:${tokenHash}`, limit || this.tokenLimit);
  }

  /**
   * Checks per-tool compute budget tier (post-auth, cost-aware). Throws on violation.
   * Uses tool cost classification to determine limit.
   *
   * @param {string} tenantId Tenant UUID
   * @param {string} toolName Name of the tool being called
   * @param {string} [tokenHash] Optional token hash for per-token tool limits
   * @throws {Error} With statusCode 429 if rate limit exceeded
   */
  checkToolLimit(tenantId, toolName, _tokenHash) {
    if (!tenantId || !toolName) {
      return;
    }

    const tier = TOOL_COST_MAP[toolName] || ToolCostTier.MEDIUM;
    const limit = this.toolLimit !== undefined ? this.toolLimit : TIER_LIMITS[tier];

    // Use tenant+tool key (backward-compatible with original behavior)
    const result = this.checkLimit(`tool:${tenantId}:${toolName}`, limit);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      throw new AppError(
        `Rate limit exceeded for tool "${toolName}". Please retry after ${retryAfterSec} seconds.`,
        429,
        'RATE_LIMITED'
      );
    }
  }

  /**
   * Checks per-tool compute budget tier without throwing. Returns result object.
   * Used by MCP routes for proper Retry-After header handling.
   *
   * @param {string} tenantId Tenant UUID
   * @param {string} toolName Name of the tool being called
   * @param {string} [tokenHash] Optional token hash for per-token tool limits
   * @returns {{ allowed: boolean, retryAfterMs: number, tier: string }}
   */
  checkToolLimitResult(tenantId, toolName, tokenHash) {
    if (!tenantId || !toolName) {
      return { allowed: true, retryAfterMs: 0, tier: ToolCostTier.MEDIUM };
    }

    const tier = TOOL_COST_MAP[toolName] || ToolCostTier.MEDIUM;
    // Use toolLimit option if provided (backward compat), otherwise use tier-based limit
    const limit = this.toolLimit !== undefined ? this.toolLimit : TIER_LIMITS[tier];

    // Check per-token tool limit (most granular)
    if (tokenHash) {
      const result = this.checkLimit(`tool:${tokenHash}:${toolName}`, limit);
      if (!result.allowed) {
        return { ...result, tier };
      }
    }

    // Also check per-tenant tool limit (shared across all tokens)
    const tenantResult = this.checkLimit(`tool:${tenantId}:${toolName}`, limit * 3);
    return { ...tenantResult, tier };
  }

  // -------------------------------------------------------------------------
  // Daily / long-term counters
  // -------------------------------------------------------------------------

  /**
   * Checks a daily counter (24-hour fixed window).
   * Uses a simple daily key with count tracking.
   *
   * @param {string} key Counter key (e.g., "daily:tenant:{id}:sync")
   * @param {number} maxDaily Maximum allowed per day
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkDailyLimit(key, maxDaily) {
    if (!key) return { allowed: true, retryAfterMs: 0 };

    try {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const dayStart = Math.floor(now / dayMs) * dayMs;

      const entry = this.hits.get(key);
      if (entry && entry[0] >= dayStart) {
        // Same day, check count
        if (entry[1] >= maxDaily) {
          const retryAfterMs = dayStart + dayMs - now;
          this.stats.denied++;
          this.stats.total++;
          return { allowed: false, retryAfterMs };
        }
        entry[1]++;
      } else {
        // New day or first access
        this.hits.set(key, [dayStart, 1]);
      }

      this.lastAccess.set(key, now);
      this.stats.allowed++;
      this.stats.total++;
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      logger.warn({ err, key }, 'Daily rate limiter internal error — failing open');
      this.stats.allowed++;
      this.stats.total++;
      return { allowed: true, retryAfterMs: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // LRU eviction
  // -------------------------------------------------------------------------

  /**
   * Evicts the least-recently-used keys to stay within memory bounds.
   * @param {number} count Number of keys to evict
   * @private
   */
  _evictLru(count) {
    if (this.lastAccess.size === 0) return;

    // Sort by last access time, evict oldest
    const entries = Array.from(this.lastAccess.entries());
    entries.sort((a, b) => a[1] - b[1]);

    const toEvict = entries.slice(0, count);
    for (const [key] of toEvict) {
      this.hits.delete(key);
      this.lastAccess.delete(key);
    }

    logger.debug(
      { evicted: toEvict.length, remaining: this.hits.size },
      'Rate limiter LRU eviction'
    );
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Returns current rate limiter statistics.
   */
  getStats() {
    return {
      ...this.stats,
      uniqueKeys: this.hits.size,
      maxKeys: this.maxKeys,
    };
  }

  /**
   * Resets all rate limit tracking state (useful in test teardown).
   */
  reset() {
    this.hits.clear();
    this.lastAccess.clear();
    this.stats = { allowed: 0, denied: 0, total: 0 };
  }
}

/**
 * Singleton rate limiter instance for application runtime.
 */
export const defaultMcpRateLimiter = new McpRateLimiter();
