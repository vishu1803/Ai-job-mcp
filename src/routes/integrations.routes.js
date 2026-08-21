/**
 * @file GitHub App Integration Routes (Task P3-002)
 *
 * Implements:
 * - GET /integrations/github/install: Initiates GitHub App installation flow with signed anti-CSRF state.
 * - GET /integrations/github/install/callback: Handles callback, verifies state, verifies installation via GitHub API, checks tenant collision, and links connection.
 */

import { authenticate } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import { githubInstallCallbackQuerySchema } from './integrations.schemas.js';
import { GitHubInstallationService } from '../services/github-installation.service.js';
import { AuthorizationError } from '../errors/index.js';
import { config } from '../config/env.js';
import { writeAuditRecord } from '../db/repositories/connection.repository.js';
import { db as defaultDb } from '../db/index.js';

/**
 * Fastify plugin for third-party integration endpoints.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} [opts]
 * @param {GitHubInstallationService} [opts.installationService]
 */
export default async function integrationsRoutes(fastify, opts = {}) {
  const service =
    opts.installationService || new GitHubInstallationService({ db: opts.db || defaultDb });
  const db = opts.db || defaultDb;

  /**
   * GET /integrations/github/install
   * Initiates GitHub App installation flow.
   */
  fastify.get(
    '/github/install',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      // 1. Role Authorization: Deny READONLY
      if (request.auth.role === 'READONLY') {
        throw new AuthorizationError(
          'Read-only members do not have permission to link workspace integrations',
          'FORBIDDEN_READONLY_ROLE'
        );
      }

      // 2. Generate signed anti-CSRF state token
      const { stateToken, installUrl } = service.createInstallationState({
        userId: request.auth.userId,
        tenantId: request.auth.tenantId,
        role: request.auth.role,
      });

      // 3. Set secure, scoped transit cookie
      const isSecure = config.NODE_ENV === 'production' && config.DATABASE_SSL;
      const cookieName = isSecure ? '__Host-gh_install_state' : 'gh_install_state';

      reply.setCookie(cookieName, stateToken, {
        path: '/integrations/github',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
      });

      // 4. Record audit event
      await writeAuditRecord(db, {
        tenantId: request.auth.tenantId,
        userId: request.auth.userId,
        eventType: 'github.installation_started',
        resourceId: null,
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        details: {
          action: 'github_app_install',
        },
      });

      // 5. Redirect to GitHub App installation page
      return reply.redirect(installUrl, 302);
    }
  );

  /**
   * GET /integrations/github/install/callback
   * Handles return redirect from GitHub App installation.
   */
  fastify.get(
    '/github/install/callback',
    {
      preHandler: [authenticate, validateRequest({ query: githubInstallCallbackQuerySchema })],
    },
    async (request, reply) => {
      // 1. Role Authorization: Deny READONLY
      if (request.auth.role === 'READONLY') {
        throw new AuthorizationError(
          'Read-only members do not have permission to link workspace integrations',
          'FORBIDDEN_READONLY_ROLE'
        );
      }

      // 2. Read transit cookie
      const isSecure = config.NODE_ENV === 'production' && config.DATABASE_SSL;
      const cookieName = isSecure ? '__Host-gh_install_state' : 'gh_install_state';
      const cookieToken = request.cookies[cookieName] || request.cookies['gh_install_state'];

      // 3. Validate state token (signature, expiration, user/tenant binding)
      service.validateInstallationState({
        stateToken: request.query.state,
        cookieToken,
        userId: request.auth.userId,
        tenantId: request.auth.tenantId,
      });

      // 4. Invalidate transit cookie immediately to prevent replay attacks
      reply.clearCookie(cookieName, { path: '/integrations/github' });
      if (cookieName !== 'gh_install_state') {
        reply.clearCookie('gh_install_state', { path: '/integrations/github' });
      }

      // 5. Verify installation on GitHub and link to active tenant
      const reqContext = {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      };

      const { isUpdate } = await service.linkInstallation({
        user: request.user,
        tenantId: request.auth.tenantId,
        installationId: request.query.installation_id,
        reqContext,
      });

      // 6. Safe redirect to dashboard
      const redirectUrl = `/dashboard?connection=${isUpdate ? 'updated' : 'linked'}`;
      return reply.redirect(redirectUrl, 302);
    }
  );
}
