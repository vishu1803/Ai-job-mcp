/**
 * @file Centralized HTTP Security Headers Policy.
 *
 * Enforces production-grade defensive HTTP headers across all endpoints:
 * 1. Content-Security-Policy (CSP): restricts script, style, font, img, frame-ancestors, object-src
 * 2. X-Content-Type-Options: nosniff
 * 3. X-Frame-Options: SAMEORIGIN (with CSP frame-ancestors taking precedence for MCP clients)
 * 4. Referrer-Policy: strict-origin-when-cross-origin
 * 5. Permissions-Policy: camera=(), microphone=(), geolocation=()
 * 6. Cross-Origin-Opener-Policy: same-origin
 * 7. Strict-Transport-Security: HSTS enabled in production
 */

import { config } from '../config/env.js';

/**
 * Registers centralized HTTP security headers hook on the Fastify instance.
 *
 * @param {import('fastify').FastifyInstance} app
 */
export function registerSecurityHeaders(app) {
  app.addHook('onRequest', async (request, reply) => {
    // 1. Defend against MIME sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // 2. Referrer privacy policy
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 3. Permissions Policy: disable unused sensitive device APIs
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

    // 4. Cross-Origin-Opener-Policy
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');

    // 5. Strict Transport Security (HSTS) in production
    if (config.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // 6. Content-Security-Policy
    // Allow embedding by authorized MCP clients (Claude, ChatGPT) via frame-ancestors
    // Check if CSP header is already explicitly set (e.g. specialized sandbox views)
    if (!reply.getHeader('Content-Security-Policy')) {
      const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://generativelanguage.googleapis.com https://api.github.com",
        "frame-ancestors 'self' https://claude.ai https://chatgpt.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ];
      reply.header('Content-Security-Policy', cspDirectives.join('; '));
    }

    // 7. X-Frame-Options fallback for older user-agents
    if (!reply.getHeader('X-Frame-Options')) {
      reply.header('X-Frame-Options', 'SAMEORIGIN');
    }
  });
}
