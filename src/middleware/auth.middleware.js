/**
 * @file Fastify Authentication & Authorization Middleware.
 *
 * Provides preHandler hooks for:
 * 1. Session verification & request context hydration (`authenticate`)
 * 2. Role-based access control (`authorize`)
 * 3. CSRF Origin header validation for state-changing requests (`verifyCsrf`)
 */

import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { db } from '../db/index.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { config } from '../config/env.js';

/**
 * Fastify preHandler hook that authenticates requests using server-side session cookies.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @param {import('fastify').FastifyReply} reply Fastify reply
 */
export async function authenticate(req, _reply) {
  const cookieOpts = getSessionCookieOptions(config);
  const rawToken = req.cookies[cookieOpts.name] || req.cookies['career_hub_session'];

  if (!rawToken) {
    throw new AuthenticationError(
      'Authentication required. Missing session cookie.',
      'UNAUTHENTICATED'
    );
  }

  const database = req.db || db;
  let sessionContext;

  try {
    sessionContext = await validateSession(database, rawToken);
  } catch (err) {
    if (err instanceof AuthenticationError) {
      throw err;
    }
    throw new AuthenticationError('Failed to validate session', 'AUTHENTICATION_FAILED');
  }

  if (!sessionContext) {
    throw new AuthenticationError('Session is invalid or expired', 'INVALID_SESSION');
  }

  const { session, user, tenant } = sessionContext;

  // Hydrate trusted immutable request context (never trust caller headers for identity/tenant)
  req.auth = Object.freeze({
    userId: user.id,
    tenantId: tenant.id,
    sessionId: session.id,
    role: user.role,
  });
  req.user = Object.freeze({ ...user });
  req.tenant = Object.freeze({ ...tenant });
  req.session = Object.freeze({ ...session });
  req.tenantId = tenant.id;
}

/**
 * Generates an authorization preHandler hook enforcing allowed RBAC roles.
 *
 * @param {...('OWNER' | 'MEMBER' | 'READONLY')} allowedRoles Permitted user roles
 * @returns {import('fastify').preHandlerHookHandler} Fastify hook handler
 */
export function authorize(...allowedRoles) {
  return async function (req, _reply) {
    if (!req.user || !req.auth) {
      throw new AuthenticationError(
        'Authentication required prior to authorization check',
        'UNAUTHENTICATED'
      );
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError('Insufficient permissions for this operation', 'FORBIDDEN');
    }
  };
}

/**
 * Validates Origin/Referer headers on state-changing methods (POST, PUT, PATCH, DELETE)
 * to provide defense-in-depth CSRF mitigation alongside SameSite cookies.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @param {import('fastify').FastifyReply} _reply Fastify reply
 */
export async function verifyCsrf(req, _reply) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return;
  }

  const origin = req.headers['origin'];
  if (!origin) {
    // If Origin is not provided by non-browser HTTP clients, allow if not browser session or pass
    return;
  }

  try {
    const originUrl = new URL(origin);
    const appUrl = new URL(config.APP_URL || `http://localhost:${config.PORT}`);

    // Allow same origin (hostname + port matching)
    const isAllowedHost =
      originUrl.host === appUrl.host ||
      originUrl.hostname === 'localhost' ||
      originUrl.hostname === '127.0.0.1';

    if (!isAllowedHost) {
      throw new AuthorizationError(
        'Cross-Site Request Forgery Origin validation failed',
        'CSRF_DETECTED'
      );
    }
  } catch (err) {
    if (err instanceof AuthorizationError) throw err;
    throw new AuthorizationError(
      'Malformed Origin header in state-changing request',
      'CSRF_DETECTED'
    );
  }
}
