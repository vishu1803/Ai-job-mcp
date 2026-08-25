/**
 * @file MCP Authentication Middleware Unit Tests (P10-001).
 *
 * Tests:
 * 1. Dedicated personal API token validation (MCP_API_TOKEN).
 * 2. OAuth 2.1 Bearer access token validation (OAUTH_BEARER).
 * 3. Convergence into identical frozen McpRequestContext structure.
 * 4. Extraction of Bearer tokens from headers.
 * 5. Rejection of unauthenticated, malformed, or missing Authorization headers.
 * 6. assertToolPermission role and scope checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractBearerToken,
  authenticateMcpRequest,
  assertToolPermission,
} from '../../src/security/mcp-auth.js';
import { AuthenticationError, AuthorizationError } from '../../src/errors/index.js';

describe('MCP Authentication Header Extraction', () => {
  it('extracts valid Bearer tokens', () => {
    assert.equal(
      extractBearerToken(
        'Bearer mcp_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      ),
      'mcp_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
    assert.equal(
      extractBearerToken(
        'bearer mcp_oauth_acc_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      ),
      'mcp_oauth_acc_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    );
  });

  it('rejects missing or malformed Authorization headers', () => {
    assert.throws(() => extractBearerToken(undefined), AuthenticationError);
    assert.throws(() => extractBearerToken(''), AuthenticationError);
    assert.throws(() => extractBearerToken('Basic dXNlcjpwYXNz'), AuthenticationError);
    assert.throws(() => extractBearerToken('Bearer short'), AuthenticationError);
  });
});

describe('MCP Authentication Multi-Path Convergence', () => {
  const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userId = '11111111-1111-1111-1111-111111111111';

  it('authenticates dedicated personal MCP API tokens (MCP_API_TOKEN)', async () => {
    const mockTokenService = {
      validateToken: async () => ({
        user: { id: userId, role: 'MEMBER', status: 'ACTIVE' },
        tenant: { id: tenantId, status: 'ACTIVE' },
        effectiveScopes: ['career:read', 'career:write'],
      }),
    };

    const mockReq = {
      headers: {
        authorization:
          'Bearer mcp_live_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'mcp-protocol-version': '2026-07-28',
      },
      ip: '127.0.0.1',
    };

    const context = await authenticateMcpRequest(mockReq, {
      tokenService: mockTokenService,
    });

    assert.equal(context.authMethod, 'MCP_API_TOKEN');
    assert.equal(context.tenantId, tenantId);
    assert.equal(context.userId, userId);
    assert.equal(context.role, 'MEMBER');
    assert.deepEqual(context.tokenScopes, ['career:read', 'career:write']);
    assert.ok(Object.isFrozen(context));
  });

  it('authenticates OAuth 2.1 Bearer access tokens (OAUTH_BEARER)', async () => {
    const mockOAuthService = {
      validateAccessToken: async () => ({
        user: { id: userId, role: 'MEMBER', status: 'ACTIVE' },
        tenant: { id: tenantId, status: 'ACTIVE' },
        effectiveScopes: ['career:read', 'career:write'],
        clientId: 'claude-web',
      }),
    };

    const mockReq = {
      headers: {
        authorization:
          'Bearer mcp_oauth_acc_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        'mcp-protocol-version': '2026-07-28',
        'user-agent': 'Anthropic-Claude/1.0',
      },
      ip: '127.0.0.1',
    };

    const context = await authenticateMcpRequest(mockReq, {
      oauthService: mockOAuthService,
    });

    assert.equal(context.authMethod, 'OAUTH_BEARER');
    assert.equal(context.tenantId, tenantId);
    assert.equal(context.userId, userId);
    assert.equal(context.role, 'MEMBER');
    assert.deepEqual(context.tokenScopes, ['career:read', 'career:write']);
    assert.equal(context.clientInfo.clientId, 'claude-web');
    assert.ok(Object.isFrozen(context));
  });
});

describe('assertToolPermission Authorization Rules', () => {
  const context = {
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    userId: '11111111-1111-1111-1111-111111111111',
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
  };

  it('allows tool execution when role and scopes are satisfied', () => {
    const toolDef = {
      name: 'propose_project_improvement',
      requiredRole: 'MEMBER',
      requiredScopes: ['career:write'],
    };

    assert.doesNotThrow(() => assertToolPermission(context, toolDef));
  });

  it('rejects execution when role is insufficient', () => {
    const readonlyContext = {
      ...context,
      role: 'READONLY',
      tokenScopes: ['career:read'],
    };

    const toolDef = {
      name: 'propose_project_improvement',
      requiredRole: 'MEMBER',
      requiredScopes: ['career:write'],
    };

    assert.throws(() => assertToolPermission(readonlyContext, toolDef), AuthorizationError);
  });

  it('rejects execution when scope is missing', () => {
    const readOnlyScopeContext = {
      ...context,
      role: 'MEMBER',
      tokenScopes: ['career:read'], // missing career:write
    };

    const toolDef = {
      name: 'propose_project_improvement',
      requiredRole: 'MEMBER',
      requiredScopes: ['career:write'],
    };

    assert.throws(() => assertToolPermission(readOnlyScopeContext, toolDef), AuthorizationError);
  });
});
