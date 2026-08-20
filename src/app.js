import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { getLoggerConfig } from './utils/logger.js';

/**
 * Builds and configures the core Fastify application instance.
 *
 * @param {object} [opts={}] Optional Fastify instance configuration overrides
 * @returns {import('fastify').FastifyInstance} Configured Fastify instance
 */
export function buildApp(opts = {}) {
  const { logger: customLogger, loggerInstance, ...fastifyOpts } = opts;

  /** @type {object} */
  let loggerConfig;
  if (loggerInstance) {
    loggerConfig = { loggerInstance };
  } else if (customLogger !== undefined) {
    loggerConfig = { logger: customLogger };
  } else {
    loggerConfig = { logger: getLoggerConfig() };
  }

  const app = Fastify({
    ...loggerConfig,
    genReqId(req) {
      return (
        /** @type {string} */ (req.headers['x-request-id']) ||
        /** @type {string} */ (req.headers['x-correlation-id']) ||
        randomUUID()
      );
    },
    requestIdHeader: 'x-request-id',
    ...fastifyOpts,
  });

  // Base Health Check endpoint
  app.get('/healthz', async (_request, _reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'antigravity-career-hub',
    };
  });

  // Root platform status verification endpoint
  app.get('/', async (_request, _reply) => {
    return {
      name: 'Antigravity Career Hub API',
      version: '0.1.0',
      status: 'operational',
      mcpEndpoint: '/mcp',
    };
  });

  return app;
}
