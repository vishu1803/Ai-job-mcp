/** GitHub installation setup and separate, installation-bound App user authorization. */
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  githubInstallCallbackQuerySchema,
  githubAuthorizeCallbackQuerySchema,
} from './integrations.schemas.js';
import {
  GitHubInstallationService,
  getInstallationCookieOptions,
} from '../services/github-installation.service.js';
import { db as defaultDb } from '../db/index.js';

export default async function integrationsRoutes(fastify, opts = {}) {
  const service =
    opts.installationService ||
    new GitHubInstallationService({
      db: opts.db || defaultDb,
      tokenCache: opts.tokenCache,
    });
  const { name, ...cookieOptions } = getInstallationCookieOptions();
  const context = (request) => ({
    user: request.user,
    tenantId: request.auth.tenantId,
    session: request.session,
    stateToken: request.query.state,
    cookieToken: request.cookies[name],
    reqContext: {
      requestId: request.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    },
  });
  const protectedHandlers = [authenticate, authorize('OWNER', 'MEMBER')];

  fastify.get('/github/install', { preHandler: protectedHandlers }, async (request, reply) => {
    const { stateToken, installUrl } = await service.createInstallationState(context(request));
    reply.setCookie(name, stateToken, cookieOptions);
    return reply.redirect(installUrl, 302);
  });

  fastify.get(
    '/github/install/callback',
    {
      preHandler: [
        ...protectedHandlers,
        validateRequest({ query: githubInstallCallbackQuerySchema }),
      ],
    },
    async (request, reply) => {
      // Both install and update require the same state and user authority; no stateless update bypass.
      const { stateToken, authorizationUrl } = await service.beginUserAuthorization({
        ...context(request),
        installationId: request.query.installation_id,
      });
      reply.setCookie(name, stateToken, cookieOptions);
      return reply.redirect(authorizationUrl, 302);
    }
  );

  fastify.get(
    '/github/authorize/callback',
    {
      preHandler: [
        ...protectedHandlers,
        validateRequest({ query: githubAuthorizeCallbackQuerySchema }),
      ],
    },
    async (request, reply) => {
      const { isUpdate } = await service.linkInstallation({
        ...context(request),
        code: request.query.code,
        installationId: request.query.installation_id,
      });
      reply.clearCookie(name, cookieOptions);
      return reply.redirect(`/dashboard?connection=${isUpdate ? 'updated' : 'linked'}`, 302);
    }
  );
}
