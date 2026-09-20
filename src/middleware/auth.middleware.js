/**
 * @file Fastify Authentication & Authorization Middleware.
 *
 * Provides preHandler hooks for:
 * 1. Session verification & request context hydration (`authenticate`)
 * 2. Role-based access control (`authorize`)
 * 3. CSRF Origin header validation for state-changing requests (`verifyCsrf`)
 */

import {
  validateSession,
  getSessionCookieOptions,
  hashSessionToken,
  validateCsrfToken,
} from '../security/session.service.js';
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
  let rawToken = req.cookies[cookieOpts.name] || req.cookies['career_hub_session'];
  if (!rawToken && req.headers?.authorization?.startsWith('Bearer ')) {
    rawToken = req.headers.authorization.slice(7).trim();
  }

  if (!rawToken) {
    throw new AuthenticationError(
      'Authentication required. Missing session cookie or bearer token.',
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
 * Validates Origin/Referer headers and session-bound CSRF tokens on state-changing methods
 * (POST, PUT, PATCH, DELETE) to provide defense-in-depth CSRF mitigation alongside SameSite cookies.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @param {import('fastify').FastifyReply} _reply Fastify reply
 * @param {object} [options={}] Configuration options
 * @param {boolean} [options.requireOrigin=false] Whether to strictly require Origin/Referer header
 * @param {boolean} [options.requireToken=false] Whether to strictly require a valid CSRF token
 */
export async function verifyCsrf(req, _reply, options = {}) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return;
  }

  // Exempt webhooks which authenticate via HMAC SHA-256 signatures
  const rawUrl = req.raw?.url || req.url || '';
  if (rawUrl.startsWith('/webhooks/')) {
    return;
  }

  // Exempt OAuth provider redirects/callbacks
  if (
    rawUrl.startsWith('/auth/github/callback') ||
    rawUrl.startsWith('/integrations/github/install/callback')
  ) {
    return;
  }

  // Detect session cookie presence
  const cookieOpts = getSessionCookieOptions(config);
  const rawSessionToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];
  const hasSessionCookie = Boolean(rawSessionToken);

  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  const secFetchSite = req.headers['sec-fetch-site'];

  // Defense: Explicitly block Sec-Fetch-Site: cross-site
  if (secFetchSite === 'cross-site') {
    throw new AuthorizationError(
      'Cross-Site Request Forgery blocked by Sec-Fetch-Site',
      'CSRF_DETECTED'
    );
  }

  // Build set of trusted hostnames:
  // 1. APP_URL hostname (if configured)
  // 2. Request Host header (reflects actual served hostname)
  const trustedHostnames = new Set();

  if (config.APP_URL) {
    try {
      trustedHostnames.add(new URL(config.APP_URL).hostname);
    } catch {
      /* ignore invalid APP_URL */
    }
  }

  if (req.headers.host) {
    const hostHeader = req.headers.host.split(':')[0];
    if (hostHeader) trustedHostnames.add(hostHeader);
  }

  const isTrustedHostname = (hostname) => {
    if (!hostname) return false;
    const isLoopback =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      /^127\./.test(hostname);
    return isLoopback || trustedHostnames.has(hostname);
  };

  if (origin) {
    if (origin === 'null') {
      throw new AuthorizationError(
        'Null Origin header rejected in state-changing request',
        'CSRF_DETECTED'
      );
    }
    try {
      const originUrl = new URL(origin);
      if (!isTrustedHostname(originUrl.hostname)) {
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
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (!isTrustedHostname(refererUrl.hostname)) {
        throw new AuthorizationError(
          'Cross-Site Request Forgery Referer validation failed',
          'CSRF_DETECTED'
        );
      }
    } catch (err) {
      if (err instanceof AuthorizationError) throw err;
      throw new AuthorizationError(
        'Malformed Referer header in state-changing request',
        'CSRF_DETECTED'
      );
    }
  } else {
    // If neither Origin nor Referer is present:
    // If strict requireOrigin is specified, or if browser request with session cookie
    if (options.requireOrigin || (hasSessionCookie && req.headers['sec-fetch-mode'])) {
      throw new AuthorizationError(
        'Missing Origin header in state-changing request',
        'CSRF_DETECTED'
      );
    }
  }

  // Resolve session ID if available (from req.session, or by hashing raw session cookie)
  let sessionId = req.session?.id;
  if (!sessionId && rawSessionToken) {
    try {
      sessionId = hashSessionToken(rawSessionToken);
    } catch {
      sessionId = null;
    }
  }

  // Extract candidate CSRF token from header, body, or query
  const csrfToken =
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'] ||
    req.body?._csrf ||
    req.body?.csrfToken ||
    req.query?._csrf ||
    req.query?.csrfToken;

  if (csrfToken) {
    if (!sessionId) {
      throw new AuthorizationError(
        'CSRF token provided but session is not authenticated',
        'CSRF_TOKEN_INVALID'
      );
    }
    const isValid = validateCsrfToken(sessionId, csrfToken);
    if (!isValid) {
      throw new AuthorizationError(
        'Cross-Site Request Forgery token validation failed',
        'CSRF_TOKEN_INVALID'
      );
    }
  } else if (options.requireToken && sessionId) {
    throw new AuthorizationError(
      'Missing CSRF token in state-changing request',
      'CSRF_TOKEN_MISSING'
    );
  }
}

/**
 * Creates a Fastify preHandler hook configuring verifyCsrf with custom options.
 *
 * @param {object} options Options to pass to verifyCsrf
 * @returns {import('fastify').preHandlerHookHandler}
 */
export function createVerifyCsrf(options = {}) {
  return async function (req, reply) {
    return verifyCsrf(req, reply, options);
  };
}
