/**
 * @file GitHub Webhook Ingress Route Plugin
 *
 * Implements:
 * - POST /webhooks/github with 10 MB payload limit
 * - Raw request body buffering for cryptographic HMAC-SHA256 signature verification
 * - Machine-to-machine authentication (independent from user browser sessions)
 * - Delegation to GitHubWebhookService
 */

import { GitHubWebhookService } from '../services/github-webhook.service.js';

/**
 * Fastify route plugin for webhook ingress.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} opts
 * @param {GitHubWebhookService} [opts.webhookService]
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [opts.db]
 * @param {import('../connectors/github/token-cache.js').GitHubTokenCache} [opts.tokenCache]
 * @param {import('../connectors/github/github-connector-cache.js').GitHubConnectorCache} [opts.connectorCache]
 */
export default async function webhooksRoutes(fastify, opts = {}) {
  const webhookService =
    opts.webhookService ||
    new GitHubWebhookService({
      db: opts.db,
      tokenCache: opts.tokenCache,
      connectorCache: opts.connectorCache,
    });

  // Scoped Content-Type parser capturing raw request body Buffer for HMAC verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 },
    (req, body, done) => {
      req.rawBody = body;
      if (!body || body.length === 0) {
        return done(null, {});
      }
      try {
        const json = JSON.parse(body.toString('utf8'));
        done(null, json);
      } catch (err) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  // POST /webhooks/github (when registered under prefix /webhooks)
  fastify.post(
    '/github',
    {
      bodyLimit: 10 * 1024 * 1024,
    },
    async (request, reply) => {
      const result = await webhookService.processWebhook({
        headers: request.headers,
        rawBody: request.rawBody,
        payload: request.body,
        reqContext: {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] || 'GitHub-Hookshot',
          requestId: request.id,
        },
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    }
  );
}
