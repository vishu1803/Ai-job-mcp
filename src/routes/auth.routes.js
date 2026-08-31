/**
 * @file Fastify Authentication Routes.
 *
 * Implements HTTP endpoints for:
 * 1. GET /auth/github — Start OAuth 2.1 authorization with PKCE
 * 2. GET /auth/github/callback — Exchange code, resolve user, set session cookie
 * 3. GET /auth/me — Return authenticated user and tenant profile
 * 4. POST /auth/logout — Revoke server-side session and clear cookie
 */

import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { AuthService } from '../security/auth.service.js';
import {
  createSession,
  revokeSession,
  getSessionCookieOptions,
} from '../security/session.service.js';
import { OAUTH_TRANSIT_COOKIE_NAME, isValidReturnTo } from '../security/oauth-state.js';
import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { validateRequest, validateResponse } from '../middleware/validate.js';
import { db } from '../db/index.js';
import { users, tenants } from '../db/schema.js';
import { config } from '../config/env.js';
import { defaultMcpRateLimiter } from '../security/mcp-rate-limiter.js';
import { extractClientIp } from '../utils/extract-client-ip.js';

/**
 * Fastify preHandler hook for pre-auth IP rate limiting.
 * Returns HTTP 429 with Retry-After if rate limit exceeded.
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {import('fastify').FastifyReply} reply
 * @param {import('../security/mcp-rate-limiter.js').McpRateLimiter} rateLimiter
 */
async function preAuthRateLimit(req, reply, rateLimiter) {
  const clientIp = extractClientIp(req);
  const result = rateLimiter.checkAuthLimit(clientIp);
  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    reply.header('Retry-After', String(retryAfterSec));
    reply.status(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry after ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec,
    });
    return reply;
  }
}

/**
 * Resolves the authoritative public redirect URI for OAuth callbacks based on the incoming request,
 * falling back safely to the configured GITHUB_OAUTH_REDIRECT_URI / APP_URL.
 *
 * @param {import('fastify').FastifyRequest} req
 * @returns {string} Fully qualified callback URL
 */
export function getOAuthRedirectUri(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.protocol === 'https' ? 'https' : 'http');
  const host =
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    (config.APP_URL ? new URL(config.APP_URL).host : 'localhost:3000');

  // Verify host against safe allowed origins: config.APP_URL host, staging host, or localhost
  const appHostname = new URL(config.APP_URL).hostname.toLowerCase();
  const incomingHostname = host.split(':')[0].toLowerCase();

  const isAllowedHost =
    incomingHostname === appHostname ||
    incomingHostname === 'dev.aicareershub.tech' ||
    incomingHostname === 'staging.aicareershub.tech' ||
    incomingHostname === 'localhost' ||
    incomingHostname === '127.0.0.1';

  if (isAllowedHost) {
    return `${proto}://${host}/auth/github/callback`;
  }

  return config.GITHUB_OAUTH_REDIRECT_URI || `${config.APP_URL}/auth/github/callback`;
}

/**
 * Determines whether the request is transmitted over HTTPS (directly or behind trusted proxy).
 *
 * @param {import('fastify').FastifyRequest} req
 * @returns {boolean} True if HTTPS or in production mode
 */
export function isHttpsRequest(req) {
  return (
    req.protocol === 'https' ||
    req.headers['x-forwarded-proto'] === 'https' ||
    config.NODE_ENV === 'production'
  );
}

// Request Validation Schemas
const AuthGithubQuerySchema = z.object({
  return_to: z.string().optional(),
});

const CallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  format: z.enum(['json', 'html']).optional(),
});

// Response Validation Schemas
const MeResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    role: z.string(),
    avatarUrl: z.string().nullable(),
    status: z.string(),
  }),
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    tier: z.string(),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.date(),
  }),
});

/**
 * Fastify Authentication Route Plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {Object} [opts={}] Plugin options
 * @param {AuthService} [opts.authService] Custom AuthService instance override
 * @param {import('../security/mcp-rate-limiter.js').McpRateLimiter} [opts.rateLimiter] Custom rate limiter instance override
 */
export default async function authRoutes(app, opts = {}) {
  const authService = opts.authService || new AuthService({ db: app.db || db });
  const rateLimiter = opts.rateLimiter || defaultMcpRateLimiter;

  // -------------------------------------------------------------------------
  // 1. GET /auth/github — Start OAuth 2.1 PKCE authorization flow
  // -------------------------------------------------------------------------
  app.get(
    '/auth/github',
    {
      preHandler: [
        async (req, reply) => preAuthRateLimit(req, reply, rateLimiter),
        validateRequest({ query: AuthGithubQuerySchema }),
      ],
    },
    async (req, reply) => {
      const returnTo =
        req.query?.return_to && isValidReturnTo(req.query.return_to)
          ? req.query.return_to
          : undefined;

      const redirectUri = getOAuthRedirectUri(req);
      const isSecure = isHttpsRequest(req);

      const { authorizationUrl, transitCookieValue } = authService.startOAuthFlow('github', {
        redirectUri,
        returnTo,
      });

      reply.setCookie(OAUTH_TRANSIT_COOKIE_NAME, transitCookieValue, {
        path: '/auth/github/callback',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
      });

      return reply.redirect(authorizationUrl);
    }
  );

  // -------------------------------------------------------------------------
  // 2. GET /auth/github/callback — OAuth 2.1 callback handler
  // -------------------------------------------------------------------------
  app.get(
    '/auth/github/callback',
    {
      preHandler: [validateRequest({ query: CallbackQuerySchema })],
    },
    async (req, reply) => {
      const { code, state, format } = req.query;
      const transitCookie = req.cookies[OAUTH_TRANSIT_COOKIE_NAME];
      const isSecure = isHttpsRequest(req);

      const result = await authService.handleOAuthCallback('github', {
        code,
        state,
        transitCookieValue: transitCookie,
        redirectUri: getOAuthRedirectUri(req),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      });

      // Clear the temporary transit cookie
      reply.clearCookie(OAUTH_TRANSIT_COOKIE_NAME, {
        path: '/auth/github/callback',
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
      });

      // Set the session cookie
      const cookieOpts = getSessionCookieOptions(config, config.SESSION_TTL_SECONDS);
      reply.setCookie(cookieOpts.name, result.session.rawToken, {
        path: cookieOpts.path,
        httpOnly: cookieOpts.httpOnly,
        secure: isSecure || cookieOpts.secure,
        sameSite: cookieOpts.sameSite,
        maxAge: cookieOpts.maxAge,
      });

      // If a validated returnTo URL was stored in transit state, follow it
      if (result.returnTo && isValidReturnTo(result.returnTo)) {
        return reply.redirect(result.returnTo);
      }

      if (format === 'json' || req.headers['accept']?.includes('application/json')) {
        return reply.status(200).send({
          message: 'Authentication successful',
          isNewUser: result.isNewUser,
          user: {
            id: result.user.id,
            email: result.user.email,
            displayName: result.user.displayName,
            role: result.user.role,
          },
          tenant: {
            id: result.tenant.id,
            name: result.tenant.name,
            slug: result.tenant.slug,
          },
          candidate: result.candidate
            ? {
                id: result.candidate.id,
                displayName: result.candidate.displayName,
                onboardingState: result.onboardingState,
              }
            : null,
          onboardingState: result.onboardingState,
        });
      }

      if (result.isNewUser) {
        return reply.redirect('/onboarding');
      }

      return reply.redirect('/dashboard');
    }
  );

  // -------------------------------------------------------------------------
  // 3. GET /auth/me — Return authenticated user profile
  // -------------------------------------------------------------------------
  app.get(
    '/auth/me',
    {
      preHandler: [authenticate],
      preSerialization: [validateResponse(MeResponseSchema)],
    },
    async (req) => {
      return {
        user: {
          id: req.user.id,
          email: req.user.email,
          displayName: req.user.displayName,
          role: req.user.role,
          avatarUrl: req.user.avatarUrl || null,
          status: req.user.status,
        },
        tenant: {
          id: req.tenant.id,
          name: req.tenant.name,
          slug: req.tenant.slug,
          tier: req.tenant.tier,
        },
        session: {
          id: req.session.id,
          expiresAt: req.session.expiresAt,
        },
      };
    }
  );

  // -------------------------------------------------------------------------
  // 4. POST /auth/logout — Revoke session and clear session cookie
  // -------------------------------------------------------------------------
  app.post(
    '/auth/logout',
    {
      preHandler: [async (req, reply) => preAuthRateLimit(req, reply, rateLimiter), verifyCsrf],
    },
    async (req, reply) => {
      const cookieOpts = getSessionCookieOptions(config);
      let rawToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];

      if (!rawToken && req.headers?.cookie) {
        const header = req.headers.cookie;
        const match =
          header.match(new RegExp(`(?:^|; )${cookieOpts.name}=([^;]*)`)) ||
          header.match(/(?:^|; )career_hub_session=([^;]*)/);
        if (match) {
          rawToken = decodeURIComponent(match[1]);
        }
      }

      if (rawToken) {
        const database = req.db || db;
        await revokeSession(database, rawToken);
      }

      reply.clearCookie(cookieOpts.name, {
        path: '/',
        httpOnly: true,
        secure: cookieOpts.secure,
        sameSite: 'lax',
      });
      reply.clearCookie('career_hub_session', {
        path: '/',
        httpOnly: true,
        secure: cookieOpts.secure,
        sameSite: 'lax',
      });

      const accept = req.headers['accept'] || '';
      const contentType = req.headers['content-type'] || '';
      const isBrowserForm =
        contentType.includes('application/x-www-form-urlencoded') ||
        (accept.includes('text/html') && !accept.includes('application/json'));

      if (isBrowserForm) {
        return reply.redirect('/login');
      }

      return reply.send({
        message: 'Successfully logged out',
      });
    }
  );

  // -------------------------------------------------------------------------
  // 5. GET /auth/logout — Safe browser logout navigation fallback
  // -------------------------------------------------------------------------
  app.get(
    '/auth/logout',
    {
      preHandler: [async (req, reply) => preAuthRateLimit(req, reply, rateLimiter)],
    },
    async (req, reply) => {
      const cookieOpts = getSessionCookieOptions(config);
      let rawToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];

      if (!rawToken && req.headers?.cookie) {
        const header = req.headers.cookie;
        const match =
          header.match(new RegExp(`(?:^|; )${cookieOpts.name}=([^;]*)`)) ||
          header.match(/(?:^|; )career_hub_session=([^;]*)/);
        if (match) {
          rawToken = decodeURIComponent(match[1]);
        }
      }

      if (rawToken) {
        const database = req.db || db;
        await revokeSession(database, rawToken);
      }

      reply.clearCookie(cookieOpts.name, {
        path: '/',
        httpOnly: true,
        secure: cookieOpts.secure,
        sameSite: 'lax',
      });
      reply.clearCookie('career_hub_session', {
        path: '/',
        httpOnly: true,
        secure: cookieOpts.secure,
        sameSite: 'lax',
      });

      const accept = req.headers['accept'] || '';
      const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

      if (wantsJson) {
        return reply.send({
          message: 'Successfully logged out',
        });
      }

      return reply.redirect('/login');
    }
  );

  // -------------------------------------------------------------------------
  // 6. GET /auth/dev-login — Local Development / Testing One-Click Login
  // -------------------------------------------------------------------------
  if (config.NODE_ENV !== 'production') {
    app.get('/auth/dev-login', async (req, reply) => {
      const database = req.db || db;
      let [user] = await database
        .select()
        .from(users)
        .where(eq(users.displayName, 'Vishwanath Nishad'))
        .limit(1);
      if (!user) {
        [user] = await database.select().from(users).limit(1);
      }
      if (!user) {
        return reply.status(500).send({ error: 'No development candidate user found' });
      }
      const [tenant] = await database
        .select()
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1);
      if (!tenant) {
        return reply.status(500).send({ error: 'No development tenant found' });
      }
      const session = await createSession(database, {
        userId: user.id,
        tenantId: tenant.id,
        ipAddress: extractClientIp(req),
        userAgent: req.headers['user-agent'] || 'dev-browser',
      });
      const cookieOpts = getSessionCookieOptions(config);
      reply.setCookie(cookieOpts.name, session.rawToken, cookieOpts);
      reply.setCookie('career_hub_session', session.rawToken, cookieOpts);
      const returnTo =
        req.query?.returnTo && isValidReturnTo(req.query.returnTo)
          ? req.query.returnTo
          : '/dashboard';
      return reply.redirect(returnTo);
    });
  }
}
