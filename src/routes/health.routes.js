/**
 * @file Health Check & Liveness Route Handlers
 *
 * Implements:
 * - GET /livez: Fast, zero-dependency process liveness probe
 * - GET /healthz: Dependency-aware readiness probe (evaluates PostgreSQL connection pool health)
 */

import { checkDatabaseHealth } from '../db/index.js';

/**
 * Registers health check and liveness routes with the Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export async function healthRoutes(app) {
  const startTime = Date.now();

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

    const response = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      service: 'antigravity-career-hub',
      dependencies: {
        database: {
          status: dbHealth.status,
          latencyMs: dbHealth.latencyMs,
          ...(dbHealth.error ? { error: dbHealth.error } : {}),
        },
      },
    };

    return reply.code(statusCode).send(response);
  });
}
