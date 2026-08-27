/**
 * @file Health Check & Liveness Route Handlers
 *
 * Implements:
 * - GET /livez: Fast, zero-dependency process liveness probe
 * - GET /healthz: Dependency-aware readiness probe (DB pool health + utilization)
 *
 * P14-003 additions:
 * - /healthz now includes pool utilization, rate limiter stats, and concurrency stats
 * - These metrics are safe to expose (no PII, no tokens, no credentials)
 */

import { checkDatabaseHealth } from '../db/index.js';
import { defaultMcpRateLimiter } from '../security/mcp-rate-limiter.js';
import { defaultConcurrencySemaphore } from '../security/concurrency-semaphore.js';

/**
 * Registers health check and liveness routes with the Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} [opts={}]
 * @param {import('../security/mcp-rate-limiter.js').McpRateLimiter} [opts.rateLimiter]
 * @param {import('../security/concurrency-semaphore.js').ConcurrencySemaphore} [opts.concurrencySemaphore]
 * @param {import('../security/db-pool-guard.js').DbPoolGuard} [opts.dbPoolGuard]
 */
export async function healthRoutes(app, opts = {}) {
  const startTime = Date.now();
  const rateLimiter = opts.rateLimiter || defaultMcpRateLimiter;
  const concurrencySemaphore = opts.concurrencySemaphore || defaultConcurrencySemaphore;
  const dbPoolGuard = opts.dbPoolGuard || null;

  // -------------------------------------------------------------------------
  // 1. GET /livez (Process Liveness Probe - zero DB / network dependencies)
  // -------------------------------------------------------------------------
  app.get('/livez', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    const uptimeSeconds = Math.round(((Date.now() - startTime) / 1000) * 100) / 100;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      service: 'antigravity-career-hub',
    };
  });

  // -------------------------------------------------------------------------
  // 2. GET /healthz (Dependency Readiness Probe - evaluates DB connectivity)
  // -------------------------------------------------------------------------
  app.get('/healthz', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
    const uptimeSeconds = Math.round(((Date.now() - startTime) / 1000) * 100) / 100;

    const dbHealth = await checkDatabaseHealth();
    const isHealthy = dbHealth.status === 'healthy';

    const statusCode = isHealthy ? 200 : 503;

    // Pool utilization (safe — no credentials or PII)
    const poolStats = dbPoolGuard
      ? dbPoolGuard.getPoolStats()
      : { totalCount: 0, idleCount: 0, waitingCount: 0, checkedOutCount: 0, utilization: 0 };

    // Rate limiter stats (safe — only counts, no keys or values)
    const limiterStats = rateLimiter.getStats ? rateLimiter.getStats() : null;

    // Concurrency stats (safe — only counts, no identity data)
    const concurrencyStats = concurrencySemaphore.getStats ? concurrencySemaphore.getStats() : null;

    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      service: 'antigravity-career-hub',
      dependencies: {
        database: {
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
          pool: {
            totalCount: poolStats.totalCount,
            idleCount: poolStats.idleCount,
            checkedOutCount: poolStats.checkedOutCount,
            waitingCount: poolStats.waitingCount,
            utilizationPercent: Math.round(poolStats.utilization * 100),
          },
          ...(dbHealth.error ? { error: dbHealth.error } : {}),
        },
      },
    };

    // Add rate limiter stats (non-sensitive)
    if (limiterStats) {
      response.rateLimiter = {
        allowed: limiterStats.allowed,
        denied: limiterStats.denied,
        uniqueKeys: limiterStats.uniqueKeys,
      };
    }

    // Add concurrency stats (non-sensitive)
    if (concurrencyStats) {
      response.concurrency = {
        acquired: concurrencyStats.acquired,
        rejected: concurrencyStats.rejected,
        config: concurrencyStats.config,
      };
    }

    // Add circuit breaker state if available
    if (dbPoolGuard && dbPoolGuard.state) {
      response.dependencies.database.circuitBreaker = {
        state: dbPoolGuard.state,
      };
    }

    return reply.code(statusCode).send(response);
  });
}
