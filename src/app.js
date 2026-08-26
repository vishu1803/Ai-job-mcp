import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { getLoggerConfig } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import connectionsRoutes from './routes/connections.routes.js';
import integrationsRoutes from './routes/integrations.routes.js';
import webhooksRoutes from './routes/webhooks.routes.js';
import mcpRoutes from './routes/mcp.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import candidateRoutes from './routes/candidate.routes.js';
import accountRoutes from './routes/account.routes.js';
import webRoutes from './routes/web.routes.js';
import { config } from './config/env.js';
import { connectorRegistry } from './connectors/registry/connector-registry.js';
import { GitHubAppConnector } from './connectors/github/github-connector.js';
import { GitHubAppAuthManager } from './connectors/github/auth.js';

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

  // Global Cookie Support
  app.register(fastifyCookie, {
    secret: config.SESSION_COOKIE_SECRET || undefined,
  });

  // Multipart File Upload Support (PDF, DOCX, TXT <= 10MB)
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
    attachFieldsToBody: false,
  });

  // Support standard HTML form submissions (application/x-www-form-urlencoded)
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const parsed = Object.fromEntries(new URLSearchParams(body));
        done(null, parsed);
      } catch (err) {
        done(err, undefined);
      }
    }
  );

  // Global Error and Not Found Handlers
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Register GitHubAppConnector in default connectorRegistry if configured and not already registered
  if (
    config.GITHUB_APP_ID &&
    (config.GITHUB_APP_PRIVATE_KEY || config.GITHUB_APP_PRIVATE_KEY_BASE64) &&
    !connectorRegistry.has('GITHUB_APP')
  ) {
    const authManager = new GitHubAppAuthManager({
      appId: config.GITHUB_APP_ID,
      privateKey: config.GITHUB_APP_PRIVATE_KEY,
      privateKeyBase64: config.GITHUB_APP_PRIVATE_KEY_BASE64,
      tokenCache: opts.tokenCache,
    });
    connectorRegistry.register(
      'GITHUB_APP',
      new GitHubAppConnector({
        authManager,
        cache: opts.connectorCache,
        rateLimiter: opts.rateLimiter,
      })
    );
  }

  // Health and Liveness Routes (/livez, /healthz)
  app.register(healthRoutes);

  // Authentication Routes (/auth/github, /auth/github/callback, /auth/me, /auth/logout)
  app.register(authRoutes, opts.authService ? { authService: opts.authService } : {});

  // Resource Connection Lifecycle Routes (/connections)
  app.register(connectionsRoutes, {
    prefix: '/connections',
    connectionService: opts.connectionService,
  });

  // Third-Party Integration Setup Routes (/integrations/github/install, /integrations/github/install/callback)
  app.register(integrationsRoutes, {
    prefix: '/integrations',
    installationService: opts.installationService,
    tokenCache: opts.tokenCache,
    db: opts.db,
  });

  // GitHub Webhook Ingress Route (/webhooks/github)
  app.register(webhooksRoutes, {
    prefix: '/webhooks',
    webhookService: opts.webhookService,
    tokenCache: opts.tokenCache,
    connectorCache: opts.connectorCache,
    db: opts.db,
  });

  // Model Context Protocol (MCP) Streamable HTTP Route (/mcp)
  app.register(mcpRoutes, {
    prefix: '/mcp',
    mcpServer: opts.mcpServer,
    db: opts.db,
    rateLimiter: opts.rateLimiter,
    tokenService: opts.tokenService,
    oauthService: opts.oauthService,
    auditService: opts.auditService,
  });

  // OAuth 2.1 & RFC 9728 / RFC 8414 Metadata Discovery Routes (/.well-known, /oauth)
  app.register(oauthRoutes, {
    oauthService: opts.oauthService,
    auditService: opts.auditService,
    db: opts.db,
  });

  // Candidate Repository Sync Routes (/candidate/sync-repositories)
  app.register(candidateRoutes, {
    prefix: '/candidate',
    db: opts.db,
    ingestionService: opts.ingestionService,
    dataSovereigntyService: opts.dataSovereigntyService,
  });

  // Account Management & GDPR Deletion Routes (/account)
  app.register(accountRoutes, {
    prefix: '/account',
    dataSovereigntyService: opts.dataSovereigntyService,
  });

  // Human Web Application & View Routes (/, /login, /onboarding, /dashboard, /connect, /settings, /docs/mcp)
  app.register(webRoutes, {
    db: opts.db,
  });

  return app;
}
