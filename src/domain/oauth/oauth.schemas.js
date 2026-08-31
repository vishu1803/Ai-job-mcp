/**
 * @file OAuth 2.1 & Protected Resource Metadata Domain Schemas (P10-001).
 *
 * Implements strict Zod validation for:
 * 1. RFC 9728 Protected Resource Metadata (`/.well-known/oauth-protected-resource`).
 * 2. RFC 8414 Authorization Server Metadata (`/.well-known/oauth-authorization-server`).
 * 3. OAuth 2.1 Authorization Code Flow with PKCE (S256).
 * 4. Token requests, claims, refresh rotation, and revocation.
 * 5. Standards-compliant RFC 6749 / RFC 9700 OAuth error responses.
 */

import { z } from 'zod';

/**
 * Supported OAuth 2.1 Grant Types.
 */
export const OAuthGrantTypeEnum = z.enum(['authorization_code', 'refresh_token']);

/**
 * Supported PKCE Code Challenge Methods (S256 mandatory in OAuth 2.1).
 */
export const PKCECodeChallengeMethodEnum = z.enum(['S256']);

/**
 * Standard Career Hub OAuth Scopes.
 */
export const OAuthScopeEnum = z.enum(['career:read', 'career:write']);

/**
 * Standard RFC 6749 & RFC 8707 OAuth Error Codes.
 */
export const OAuthErrorCodeEnum = z.enum([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'invalid_target',
  'access_denied',
  'server_error',
  'temporarily_unavailable',
]);

/**
 * RFC 9728 Protected Resource Metadata Schema.
 */
export const OAuthProtectedResourceMetadataSchema = z
  .object({
    resource: z.string().url(),
    authorization_servers: z.array(z.string().url()).min(1),
    scopes_supported: z.array(z.string()).default(['career:read', 'career:write']),
    bearer_methods_supported: z.array(z.string()).default(['header']),
    resource_documentation: z.string().url().optional(),
  })
  .strict();

/**
 * RFC 8414 Authorization Server Metadata Schema.
 */
export const OAuthAuthorizationServerMetadataSchema = z
  .object({
    issuer: z.string().url(),
    authorization_endpoint: z.string().url(),
    token_endpoint: z.string().url(),
    revocation_endpoint: z.string().url().optional(),
    jwks_uri: z.string().url().optional(),
    response_types_supported: z.array(z.string()).default(['code']),
    response_modes_supported: z.array(z.string()).default(['query']),
    grant_types_supported: z.array(z.string()).default(['authorization_code', 'refresh_token']),
    code_challenge_methods_supported: z.array(z.string()).default(['S256']),
    scopes_supported: z.array(z.string()).default(['career:read', 'career:write']),
    resource_indicators_supported: z.boolean().default(true),
    token_endpoint_auth_methods_supported: z
      .array(z.string())
      .default(['none', 'client_secret_post', 'client_secret_basic']),
    service_documentation: z.string().url().optional(),
  })
  .strict();

/**
 * Schema for GET /oauth/authorize Query Parameters (RFC 6749 & RFC 8707).
 */
export const OAuthAuthorizeQuerySchema = z
  .object({
    response_type: z.literal('code', {
      errorMap: () => ({ message: 'Unsupported response_type. Only "code" is permitted.' }),
    }),
    client_id: z.string().min(1, 'client_id is required'),
    redirect_uri: z.string().url('redirect_uri must be a valid URL'),
    resource: z.string().url('resource must be a valid URL'),
    scope: z.string().optional().default('career:read'),
    state: z.string().min(1, 'state parameter is mandatory in OAuth 2.1'),
    code_challenge: z
      .string()
      .min(43, 'code_challenge must be at least 43 characters')
      .max(128, 'code_challenge cannot exceed 128 characters'),
    code_challenge_method: z.literal('S256', {
      errorMap: () => ({ message: 'OAuth 2.1 requires code_challenge_method=S256.' }),
    }),
    // Standard OIDC extension parameters (e.g. ui_locales from ChatGPT) are
    // tolerated but ignored. Only the required OAuth 2.1 + PKCE fields above
    // are validated and used.
    ui_locales: z.string().optional(),
    prompt: z.string().optional(),
    login_hint: z.string().optional(),
  })
  .strict();

/**
 * Schema for POST /oauth/authorize/consent Request Body.
 */
export const OAuthConsentBodySchema = z
  .object({
    client_id: z.string().min(1, 'client_id is required'),
    redirect_uri: z.string().url('redirect_uri must be a valid URL'),
    resource: z.string().url('resource must be a valid URL'),
    scope: z.string().min(1, 'scope is required'),
    state: z.string().min(1, 'state is required'),
    code_challenge: z
      .string()
      .min(43, 'code_challenge must be at least 43 characters')
      .max(128, 'code_challenge cannot exceed 128 characters'),
    code_challenge_method: z.literal('S256', {
      errorMap: () => ({ message: 'OAuth 2.1 requires code_challenge_method=S256.' }),
    }),
    action: z.enum(['allow', 'deny'], {
      errorMap: () => ({ message: 'action must be either "allow" or "deny"' }),
    }),
  })
  .strict();

/**
 * Schema for POST /oauth/register — RFC 7591 Dynamic Client Registration.
 * Used by ChatGPT, Claude, and other MCP clients that generate their own
 * client_id via the registration endpoint.
 */
export const OAuthClientRegistrationSchema = z
  .object({
    client_name: z.string().min(1, 'client_name is required').max(128),
    redirect_uris: z
      .array(z.string().url('Each redirect_uri must be a valid URL'))
      .min(1, 'At least one redirect_uri is required')
      .max(10, 'Maximum 10 redirect URIs allowed'),
    grant_types: z
      .array(z.enum(['authorization_code', 'refresh_token']))
      .optional()
      .default(['authorization_code']),
    response_types: z
      .array(z.enum(['code']))
      .optional()
      .default(['code']),
    token_endpoint_auth_method: z
      .enum(['none', 'client_secret_post', 'client_secret_basic'])
      .optional()
      .default('none'),
    // RFC 7591 also allows arbitrary JSON metadata — we use .passthrough()
    // so unknown fields from ChatGPT/Claude don't cause validation failures.
  })
  .passthrough();

/**
 * Schema for POST /oauth/token Request Body (RFC 6749 & RFC 8707).
 */
export const OAuthTokenRequestSchema = z
  .object({
    grant_type: OAuthGrantTypeEnum,
    client_id: z.string().min(1, 'client_id is required'),
    code: z.string().optional(),
    redirect_uri: z.string().url().optional(),
    code_verifier: z.string().min(43).max(128).optional(),
    resource: z.string().url('resource must be a valid URL').optional(),
    refresh_token: z.string().optional(),
    client_secret: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.grant_type === 'authorization_code') {
      if (!data.code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'code is required for grant_type=authorization_code',
          path: ['code'],
        });
      }
      if (!data.redirect_uri) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'redirect_uri is required for grant_type=authorization_code',
          path: ['redirect_uri'],
        });
      }
      if (!data.code_verifier) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'code_verifier is required for grant_type=authorization_code',
          path: ['code_verifier'],
        });
      }
      if (!data.resource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'resource is required for grant_type=authorization_code',
          path: ['resource'],
        });
      }
    } else if (data.grant_type === 'refresh_token') {
      if (!data.refresh_token) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'refresh_token is required for grant_type=refresh_token',
          path: ['refresh_token'],
        });
      }
    }
  });

/**
 * Schema for Successful POST /oauth/token Response.
 */
export const OAuthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.literal('Bearer'),
    expires_in: z.number().int().positive(),
    refresh_token: z.string().optional(),
    scope: z.string(),
  })
  .strict();

/**
 * Schema for POST /oauth/revoke Request Body.
 */
export const OAuthRevokeRequestSchema = z
  .object({
    token: z.string().min(1, 'token is required for revocation'),
    token_type_hint: z.enum(['access_token', 'refresh_token']).optional(),
    client_id: z.string().optional(),
  })
  .strict();

/**
 * Standard RFC 6749 OAuth Error Response.
 */
export const OAuthErrorResponseSchema = z
  .object({
    error: OAuthErrorCodeEnum,
    error_description: z.string().optional(),
    state: z.string().optional(),
  })
  .strict();

/**
 * Schema for Internal Decoded Token Claims.
 */
export const OAuthTokenClaimsSchema = z
  .object({
    iss: z.string().url(),
    aud: z.string().url(),
    sub: z.string().uuid(),
    tid: z.string().uuid(),
    role: z.enum(['OWNER', 'MEMBER', 'READONLY']),
    scope: z.string(),
    client_id: z.string(),
    jti: z.string(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();
