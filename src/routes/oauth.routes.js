/**
 * @file OAuth 2.1 & Protected Resource Metadata Fastify Routes (P10-001).
 *
 * Implements:
 * 1. RFC 9728 Protected Resource Metadata (`GET /.well-known/oauth-protected-resource`).
 * 2. RFC 8414 Authorization Server Metadata (`GET /.well-known/oauth-authorization-server` & `GET /.well-known/openid-configuration`).
 * 3. OAuth 2.1 Authorization Endpoint (`GET /oauth/authorize` & `POST /oauth/authorize/consent`).
 * 4. OAuth 2.1 Token Endpoint (`POST /oauth/token`) supporting authorization_code and refresh_token.
 * 5. OAuth 2.1 Token Revocation (`POST /oauth/revoke`).
 * 6. Multi-format body parsing (JSON and application/x-www-form-urlencoded).
 * 7. Structured audit logging without secret retention.
 */

import {
  OAuthAuthorizeQuerySchema,
  OAuthConsentBodySchema,
  OAuthTokenRequestSchema,
  OAuthRevokeRequestSchema,
} from '../domain/oauth/oauth.schemas.js';
import {
  OAuthAuthorizationService,
  defaultOAuthAuthorizationService,
} from '../services/oauth-authorization.service.js';
import { McpAuditService, defaultMcpAuditService } from '../services/mcp-audit.service.js';
import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { db as defaultDb } from '../db/index.js';
import { config } from '../config/env.js';
import { AuthenticationError } from '../errors/index.js';

/**
 * Escapes unsafe characters for HTML output.
 *
 * @param {string | null | undefined} str Raw string
 * @returns {string} HTML-escaped string
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Renders the secure HTML OAuth 2.1 Consent Screen.
 *
 * @param {object} options
 * @param {object} options.client
 * @param {object} options.user
 * @param {object} options.tenant
 * @param {string[]} options.scopes
 * @param {object} options.params
 * @returns {string} HTML markup string
 */
function renderConsentHtml({ client, user, tenant, scopes, params }) {
  const clientName = client?.name || 'Claude (Web Client)';
  const userDisplayName = user?.displayName || user?.email || 'Authenticated User';
  const tenantName = tenant?.name || 'Personal Workspace';
  const roleName = user?.role || 'MEMBER';

  const hasRead = scopes.includes('career:read');
  const hasWrite = scopes.includes('career:write');
  const hasExport = scopes.includes('career:export');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize ${escapeHtml(clientName)} - Antigravity Career Hub</title>
  <style>
    :root {
      --bg-color: #0b0f19;
      --card-bg: #131b2e;
      --border-color: #23304a;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --secondary: #1f293d;
      --secondary-hover: #2c3b57;
      --badge-bg: #1e293b;
      --badge-text: #93c5fd;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px 16px;
    }
    .consent-card {
      background-color: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      width: 100%;
      max-width: 520px;
      padding: 32px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      font-size: 24px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .context-box {
      background-color: var(--secondary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .context-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .context-row:last-child {
      margin-bottom: 0;
    }
    .context-label {
      color: var(--text-muted);
    }
    .context-val {
      font-weight: 600;
      color: var(--text-main);
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      background-color: var(--badge-bg);
      color: var(--badge-text);
      border: 1px solid var(--border-color);
    }
    .permissions-section {
      margin-bottom: 24px;
    }
    .permissions-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .perm-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      background-color: rgba(31, 41, 61, 0.4);
      margin-bottom: 8px;
    }
    .perm-icon {
      font-size: 18px;
      line-height: 1;
      margin-top: 2px;
    }
    .perm-text h3 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--text-main);
    }
    .perm-text p {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .security-notice {
      background-color: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 24px;
      font-size: 12px;
      color: #6ee7b7;
      line-height: 1.5;
    }
    .security-notice strong {
      color: #a7f3d0;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .btn {
      flex: 1;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background-color 0.15s ease, transform 0.05s ease;
      text-align: center;
      text-decoration: none;
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn-primary {
      background-color: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background-color: var(--primary-hover);
    }
    .btn-secondary {
      background-color: var(--secondary);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .btn-secondary:hover {
      background-color: var(--secondary-hover);
    }
  </style>
</head>
<body>
  <div class="consent-card">
    <div class="header">
      <div class="logo-badge">⚡</div>
      <h1>Authorize ${escapeHtml(clientName)}</h1>
      <p class="subtitle">An external client is requesting access to your Career Hub MCP resources.</p>
    </div>

    <div class="context-box">
      <div class="context-row">
        <span class="context-label">Account</span>
        <span class="context-val">${escapeHtml(userDisplayName)} <span class="badge">${escapeHtml(roleName)}</span></span>
      </div>
      <div class="context-row">
        <span class="context-label">Workspace</span>
        <span class="context-val">${escapeHtml(tenantName)}</span>
      </div>
      <div class="context-row">
        <span class="context-label">Client</span>
        <span class="context-val">${escapeHtml(clientName)}</span>
      </div>
    </div>

    <div class="permissions-section">
      <div class="permissions-title">Requested Scopes</div>
      ${
        hasRead
          ? `<div class="perm-item">
        <div class="perm-icon">📖</div>
        <div class="perm-text">
          <h3>Read Career Intelligence & Evidence (<code>career:read</code>)</h3>
          <p>Access your verified skills, candidate profile, code evidence, and job-fit analyses.</p>
        </div>
      </div>`
          : ''
      }
      ${
        hasWrite
          ? `<div class="perm-item">
        <div class="perm-icon">✍️</div>
        <div class="perm-text">
          <h3>Propose & Confirm Improvements (<code>career:write</code>)</h3>
          <p>Propose project enhancements and create human-confirmed draft pull requests on connected repositories.</p>
        </div>
      </div>`
          : ''
      }
      ${
        hasExport
          ? `<div class="perm-item">
        <div class="perm-icon">📄</div>
        <div class="perm-text">
          <h3>Export Tailored Artifacts (<code>career:export</code>)</h3>
          <p>Generate verifiable tailored resumes and cover letters.</p>
        </div>
      </div>`
          : ''
      }
    </div>

    <div class="security-notice">
      🔒 <strong>Human-in-the-Loop Safety Guarantee</strong>: Claude never receives direct GitHub credentials. All repository modifications require explicit human confirmation and pass through GitHub write safety controls.
    </div>

    <form method="POST" action="/oauth/authorize/consent">
      <input type="hidden" name="client_id" value="${escapeHtml(params.client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirect_uri)}">
      <input type="hidden" name="resource" value="${escapeHtml(params.resource)}">
      <input type="hidden" name="scope" value="${escapeHtml(params.scope)}">
      <input type="hidden" name="state" value="${escapeHtml(params.state)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.code_challenge_method)}">

      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn btn-secondary">Cancel</button>
        <button type="submit" name="action" value="allow" class="btn btn-primary">Authorize Claude</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

/**
 * Fastify plugin registering OAuth 2.1 and metadata discovery routes.
 *
 * @param {import('fastify').FastifyInstance} fastify Fastify instance
 * @param {object} [opts={}] Plugin options
 * @param {OAuthAuthorizationService} [opts.oauthService] Optional OAuth service override
 * @param {McpAuditService} [opts.auditService] Optional audit service override
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [opts.db] Optional database override
 */
export async function oauthRoutes(fastify, opts = {}) {
  const db = opts.db || fastify.db || defaultDb;
  const oauthService =
    opts.oauthService ||
    (db ? new OAuthAuthorizationService({ db }) : defaultOAuthAuthorizationService);
  const auditService =
    opts.auditService ||
    (db ? new McpAuditService({ db, logger: fastify.log }) : defaultMcpAuditService);

  // Support application/x-www-form-urlencoded in addition to application/json
  if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
    fastify.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (req, body, done) => {
        try {
          const parsed = Object.fromEntries(new URLSearchParams(body));
          done(null, parsed);
        } catch (err) {
          done(err, undefined);
        }
      }
    );
  }

  // ---------------------------------------------------------------------------
  // 1. RFC 9728 Protected Resource Metadata Discovery
  // ---------------------------------------------------------------------------
  fastify.get('/.well-known/oauth-protected-resource', async (req, reply) => {
    const metadata = oauthService.getProtectedResourceMetadata();
    reply.header('content-type', 'application/json');
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send(metadata);
  });

  // ---------------------------------------------------------------------------
  // 2. RFC 8414 OAuth 2.0 Authorization Server Metadata Discovery
  // ---------------------------------------------------------------------------
  fastify.get('/.well-known/oauth-authorization-server', async (req, reply) => {
    const metadata = oauthService.getAuthorizationServerMetadata();
    reply.header('content-type', 'application/json');
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send(metadata);
  });

  fastify.get('/.well-known/openid-configuration', async (req, reply) => {
    const metadata = oauthService.getAuthorizationServerMetadata();
    reply.header('content-type', 'application/json');
    reply.header('cache-control', 'public, max-age=3600');
    return reply.send(metadata);
  });

  // ---------------------------------------------------------------------------
  // 3. OAuth 2.1 Authorization Endpoint (GET /oauth/authorize)
  // ---------------------------------------------------------------------------
  fastify.get('/oauth/authorize', async (req, reply) => {
    const queryResult = OAuthAuthorizeQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      const firstError =
        queryResult.error.errors[0]?.message || 'Invalid authorization request parameters.';
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: firstError,
      });
    }

    const {
      client_id,
      redirect_uri,
      resource,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = queryResult.data;

    let validatedRequest;
    try {
      validatedRequest = await oauthService.validateAuthorizationRequest({
        clientId: client_id,
        redirectUri: redirect_uri,
        resource,
        scope,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      });
    } catch (err) {
      const errorCode =
        err.code === 'INVALID_CLIENT'
          ? 'invalid_client'
          : err.code === 'INVALID_TARGET'
            ? 'invalid_target'
            : 'invalid_request';
      return reply.status(400).send({
        error: errorCode,
        error_description: err.message,
        state,
      });
    }

    // Authenticate user strictly via Session Cookie
    const cookieOpts = getSessionCookieOptions(config);
    const rawSessionToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];
    let sessionContext = null;

    if (rawSessionToken && db) {
      try {
        sessionContext = await validateSession(db, rawSessionToken);
      } catch {
        sessionContext = null;
      }
    }

    // If unauthenticated, redirect browser to GitHub OAuth login with preserved return_to
    if (!sessionContext) {
      const queryParams = new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri,
        resource,
        scope: validatedRequest.scopes.join(' '),
        state,
        code_challenge,
        code_challenge_method,
      });
      const returnToUrl = `/oauth/authorize?${queryParams.toString()}`;
      return reply.redirect(`/auth/github?return_to=${encodeURIComponent(returnToUrl)}`);
    }

    const { user, tenant } = sessionContext;

    // Record audit telemetry for authorization request landing
    await auditService.recordEvent({
      context: {
        tenantId: tenant.id,
        userId: user.id,
        role: user.role,
        tokenScopes: validatedRequest.scopes,
        authMethod: 'SESSION_COOKIE',
      },
      eventType: 'oauth.authorize.requested',
      resourceType: 'oauth_authorization',
      resourceId: client_id,
      clientIp: req.ip || undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      parameters: {
        clientId: client_id,
        redirectUri: redirect_uri,
        resource: validatedRequest.resource,
        scopes: validatedRequest.scopes,
      },
    });

    // Render interactive HTML Consent Screen
    const html = renderConsentHtml({
      client: validatedRequest.client,
      user,
      tenant,
      scopes: validatedRequest.scopes,
      params: {
        client_id,
        redirect_uri,
        resource: validatedRequest.resource,
        scope: validatedRequest.scopes.join(' '),
        state,
        code_challenge,
        code_challenge_method,
      },
    });

    reply.header('content-type', 'text/html; charset=utf-8');
    return reply.send(html);
  });

  // ---------------------------------------------------------------------------
  // 3b. OAuth 2.1 Consent Submission Endpoint (POST /oauth/authorize/consent)
  // ---------------------------------------------------------------------------
  fastify.post('/oauth/authorize/consent', async (req, reply) => {
    const parseResult = OAuthConsentBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Invalid consent parameters.';
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: firstError,
      });
    }

    const {
      client_id,
      redirect_uri,
      resource,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      action,
    } = parseResult.data;

    let validatedRequest;
    try {
      validatedRequest = await oauthService.validateAuthorizationRequest({
        clientId: client_id,
        redirectUri: redirect_uri,
        resource,
        scope,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
      });
    } catch (err) {
      const errorCode =
        err.code === 'INVALID_CLIENT'
          ? 'invalid_client'
          : err.code === 'INVALID_TARGET'
            ? 'invalid_target'
            : 'invalid_request';
      return reply.status(400).send({
        error: errorCode,
        error_description: err.message,
        state,
      });
    }

    // Authenticate user strictly via Session Cookie
    const cookieOpts = getSessionCookieOptions(config);
    const rawSessionToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];
    let sessionContext = null;

    if (rawSessionToken && db) {
      try {
        sessionContext = await validateSession(db, rawSessionToken);
      } catch {
        sessionContext = null;
      }
    }

    if (!sessionContext) {
      const queryParams = new URLSearchParams({
        response_type: 'code',
        client_id,
        redirect_uri,
        resource,
        scope,
        state,
        code_challenge,
        code_challenge_method,
      });
      const returnToUrl = `/oauth/authorize?${queryParams.toString()}`;
      return reply.redirect(`/auth/github?return_to=${encodeURIComponent(returnToUrl)}`);
    }

    const { user, tenant } = sessionContext;

    // Handle user denial
    if (action === 'deny') {
      await auditService.recordEvent({
        context: {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          tokenScopes: validatedRequest.scopes,
          authMethod: 'SESSION_COOKIE',
        },
        eventType: 'oauth.consent.denied',
        resourceType: 'oauth_authorization',
        resourceId: client_id,
        clientIp: req.ip || undefined,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
        parameters: {
          clientId: client_id,
          redirectUri: redirect_uri,
          resource: validatedRequest.resource,
        },
      });

      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set(
        'error_description',
        'The user denied the authorization request.'
      );
      redirectUrl.searchParams.set('state', state);
      return reply.redirect(redirectUrl.toString());
    }

    // Handle user approval: Mint single-use authorization code
    const rawCode = await oauthService.createAuthorizationCode({
      clientId: client_id,
      redirectUri: redirect_uri,
      resource: validatedRequest.resource,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      scopes: validatedRequest.scopes,
      tenantId: tenant.id,
      userId: user.id,
      userRole: user.role,
    });

    await auditService.recordEvent({
      context: {
        tenantId: tenant.id,
        userId: user.id,
        role: user.role,
        tokenScopes: validatedRequest.scopes,
        authMethod: 'SESSION_COOKIE',
      },
      eventType: 'oauth.consent.granted',
      resourceType: 'oauth_authorization',
      resourceId: client_id,
      clientIp: req.ip || undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      parameters: {
        clientId: client_id,
        redirectUri: redirect_uri,
        resource: validatedRequest.resource,
        scopes: validatedRequest.scopes,
      },
    });

    // Build redirect target URL with code & state
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', rawCode);
    redirectUrl.searchParams.set('state', state);

    return reply.redirect(redirectUrl.toString());
  });

  // ---------------------------------------------------------------------------
  // 4. OAuth 2.1 Token Endpoint (POST /oauth/token)
  // ---------------------------------------------------------------------------
  fastify.post('/oauth/token', async (req, reply) => {
    const parseResult = OAuthTokenRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      const firstError =
        parseResult.error.errors[0]?.message || 'Invalid token request parameters.';
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: firstError,
      });
    }

    const { grant_type, client_id, redirect_uri, resource, code, code_verifier, refresh_token } =
      parseResult.data;

    try {
      if (grant_type === 'authorization_code') {
        const tokenResponse = await oauthService.exchangeAuthorizationCode({
          clientId: client_id,
          redirectUri: /** @type {string} */ (redirect_uri),
          resource: /** @type {string} */ (resource),
          code: /** @type {string} */ (code),
          codeVerifier: /** @type {string} */ (code_verifier),
        });

        await auditService.recordEvent({
          context: null,
          eventType: 'oauth.token.issued',
          resourceType: 'oauth_token',
          resourceId: client_id,
          clientIp: req.ip || undefined,
          parameters: {
            clientId: client_id,
            grantType: grant_type,
            resource,
            scopes: tokenResponse.scope,
          },
        });

        reply.header('cache-control', 'no-store');
        reply.header('pragma', 'no-cache');
        return reply.send(tokenResponse);
      } else if (grant_type === 'refresh_token') {
        const tokenResponse = await oauthService.refreshAccessToken({
          clientId: client_id,
          refreshToken: /** @type {string} */ (refresh_token),
          resource: resource || undefined,
        });

        await auditService.recordEvent({
          context: null,
          eventType: 'oauth.token.refreshed',
          resourceType: 'oauth_token',
          resourceId: client_id,
          clientIp: req.ip || undefined,
          parameters: {
            clientId: client_id,
            grantType: grant_type,
            resource: resource || undefined,
            scopes: tokenResponse.scope,
          },
        });

        reply.header('cache-control', 'no-store');
        reply.header('pragma', 'no-cache');
        return reply.send(tokenResponse);
      } else {
        return reply.status(400).send({
          error: 'unsupported_grant_type',
          error_description: `Grant type "${grant_type}" is not supported.`,
        });
      }
    } catch (err) {
      await auditService.recordEvent({
        context: null,
        eventType: 'oauth.token.rejected',
        resourceType: 'oauth_token',
        resourceId: client_id,
        clientIp: req.ip || undefined,
        isError: true,
        errorMessage: err.message,
        parameters: {
          clientId: client_id,
          grantType: grant_type,
          errorCode: err.code || 'INVALID_GRANT',
        },
      });

      const statusCode = err instanceof AuthenticationError ? 400 : err.statusCode || 400;
      const errorCode =
        err.code === 'INVALID_CLIENT'
          ? 'invalid_client'
          : err.code === 'INVALID_GRANT'
            ? 'invalid_grant'
            : err.code === 'INVALID_TARGET'
              ? 'invalid_target'
              : 'invalid_request';

      return reply.status(statusCode).send({
        error: errorCode,
        error_description: err.message,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. OAuth 2.1 Token Revocation Endpoint (POST /oauth/revoke)
  // ---------------------------------------------------------------------------
  fastify.post('/oauth/revoke', async (req, reply) => {
    const parseResult = OAuthRevokeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'invalid_request',
        error_description: 'token parameter is required for revocation.',
      });
    }

    const { token, token_type_hint, client_id } = parseResult.data;

    try {
      const result = await oauthService.revokeToken({
        token,
        tokenTypeHint: token_type_hint,
        clientId: client_id,
      });

      await auditService.recordEvent({
        context: null,
        eventType: 'oauth.token.revoked',
        resourceType: 'oauth_token',
        resourceId: client_id || 'unknown',
        clientIp: req.ip || undefined,
        parameters: {
          clientId: client_id,
          tokenTypeHint: token_type_hint,
        },
      });

      return reply.status(200).send(result);
    } catch {
      return reply.status(200).send({ revoked: true });
    }
  });
}

export default oauthRoutes;
