/**
 * @file Account Management & GDPR Deletion Routes (Phase 13 / P13-002)
 *
 * Implements user data sovereignty and GDPR Article 17 account deletion endpoints.
 * Protected by session authentication and CSRF origin verification.
 */

import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { validateRequest, validateResponse } from '../middleware/validate.js';
import { DeleteAccountBodySchema, DeleteAccountResponseSchema } from './account.schemas.js';
import { dataSovereigntyService as defaultSovereigntyService } from '../services/data-sovereignty.service.js';
import { getSessionCookieOptions } from '../security/session.service.js';
import { config } from '../config/env.js';

/**
 * Registers account-level routes under the root /account prefix.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} [opts={}]
 * @param {import('../services/data-sovereignty.service.js').DataSovereigntyService} [opts.dataSovereigntyService]
 */
export async function accountRoutes(fastify, opts = {}) {
  const sovereigntyService = opts.dataSovereigntyService || defaultSovereigntyService;

  /**
   * DELETE /account — Hard-delete user account and personal workspace (GDPR Right to Erasure)
   *
   * Authentication: Session cookie required (OWNER role)
   * CSRF: Origin/Referer validated
   * Body: { confirmPhrase: "DELETE MY ACCOUNT" }
   */
  fastify.delete(
    '/',
    {
      preHandler: [authenticate, verifyCsrf, validateRequest({ body: DeleteAccountBodySchema })],
      preSerialization: validateResponse(DeleteAccountResponseSchema),
    },
    async (request, reply) => {
      const context = {
        tenantId: request.auth.tenantId,
        userId: request.auth.userId,
        role: request.user.role,
        user: request.user,
      };

      const result = await sovereigntyService.hardDeleteAccount(context, request.body, {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      // Clear the session cookie
      const cookieOpts = getSessionCookieOptions(config);
      reply.clearCookie(cookieOpts.name, {
        path: cookieOpts.path,
        httpOnly: cookieOpts.httpOnly,
        secure: cookieOpts.secure,
        sameSite: cookieOpts.sameSite,
      });

      return reply.status(200).send(result);
    }
  );
}

export default accountRoutes;
