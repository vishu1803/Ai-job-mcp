import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { getLoggerConfig } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.routes.js';

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

  // Ensure request correlation ID is echoed in the response header
  app.addHook('onSend', async (request, reply) => {
    if (request.id) {
      reply.header('x-request-id', request.id);
    }
  });

  // Global Error and Not Found Handlers
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Health and Liveness Routes (/livez, /healthz)
  app.register(healthRoutes);

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
