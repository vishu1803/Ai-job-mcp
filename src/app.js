import Fastify from 'fastify';
import { config } from './config/env.js';

/**
 * Builds and configures the core Fastify application instance.
 *
 * @param {object} [opts={}] Optional Fastify instance configuration overrides
 * @returns {import('fastify').FastifyInstance} Configured Fastify instance
 */
export function buildApp(opts = {}) {
  const app = Fastify({
    logger: {
      level: opts.logLevel || config.LOG_LEVEL,
      serializers: {
        req(req) {
          return {
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
          };
        },
      },
    },
    ...opts,
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
