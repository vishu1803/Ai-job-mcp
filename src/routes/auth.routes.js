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
import { AuthService } from '../security/auth.service.js';
import { revokeSession, getSessionCookieOptions } from '../security/session.service.js';
import { OAUTH_TRANSIT_COOKIE_NAME, isValidReturnTo } from '../security/oauth-state.js';
import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { validateRequest, validateResponse } from '../middleware/validate.js';
import { db } from '../db/index.js';
import { config } from '../config/env.js';

// Request Validation Schemas
const AuthGithubQuerySchema = z.object({
  return_to: z.string().optional(),
});

const CallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'OAuth state parameter is required'),
  format: z.enum(['json', 'redirect']).optional().default('redirect'),
});

// Response Validation Schemas
const MeResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    role: z.enum(['OWNER', 'MEMBER', 'READONLY']),
    avatarUrl: z.string().nullable(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  }),
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.union([z.date(), z.string()]),
  }),
});

/**
 * Registers authentication routes with the Fastify application.
 *
 * @param {import('fastify').FastifyInstance} app Fastify instance
 * @param {Object} [opts={}] Plugin options
 * @param {AuthService} [opts.authService] Custom AuthService instance (for testing)
 */
export default async function authRoutes(app, opts = {}) {
  const authService = opts.authService || new AuthService({ db: app.db || db });

  // -------------------------------------------------------------------------
  // 1. GET /auth/github — Start OAuth 2.1 PKCE authorization flow
  // -------------------------------------------------------------------------
  app.get(
    '/auth/github',
    {
      preHandler: [validateRequest({ query: AuthGithubQuerySchema })],
    },
    async (req, reply) => {
      const returnTo =
        req.query?.return_to && isValidReturnTo(req.query.return_to)
          ? req.query.return_to
          : undefined;

      const { authorizationUrl, transitCookieValue } = authService.startOAuthFlow('github', {
        returnTo,
      });

      const isProd = config.NODE_ENV === 'production';
      reply.setCookie(OAUTH_TRANSIT_COOKIE_NAME, transitCookieValue, {
        path: '/auth/github/callback',
        httpOnly: true,
        secure: isProd,
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

      const result = await authService.handleOAuthCallback('github', {
        code,
        state,
        transitCookieValue: transitCookie,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.id,
      });

      // Clear the temporary transit cookie
      reply.clearCookie(OAUTH_TRANSIT_COOKIE_NAME, {
        path: '/auth/github/callback',
        httpOnly: true,
        sameSite: 'lax',
      });

      // Set the session cookie
      const cookieOpts = getSessionCookieOptions(config, config.SESSION_TTL_SECONDS);
      reply.setCookie(cookieOpts.name, result.session.rawToken, {
        path: cookieOpts.path,
        httpOnly: cookieOpts.httpOnly,
        secure: cookieOpts.secure,
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
      preHandler: [verifyCsrf],
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
  // 5. GET /auth/logout — Safe browser logout navigation fallback
  // -------------------------------------------------------------------------
  app.get('/auth/logout', async (req, reply) => {
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
  });
}
