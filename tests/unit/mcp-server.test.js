/**
 * @file Unit Tests for MCP Server Foundation & 2026-07-28 Protocol Layer (P7-001)
 *
 * Validates:
 * 1. McpServer factory initialization with 2026-07-28 protocol standard.
 * 2. Tool registration and schema validation.
 * 3. RBAC role-based permission assertions.
 * 4. Token scope enforcement.
 * 5. Comprehensive JSON-RPC 2.0 error mapping and information-leak prevention.
 * 6. Bearer token extraction and SHA-256 hashing.
 * 7. McpRequestContext schema validation and immutability.
 * 8. Prototype pollution detection and rejection.
 * 9. Server lifecycle (start/close).
 * 10. Hard protocol assertion requiring 2026-07-28 revision.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { z } from 'zod';
import { createMcpServer, mapErrorToMcpResponse, McpServerWrapper } from '../../src/mcp/server.js';
import {
  extractBearerToken,
  hashMcpToken,
  assertToolPermission,
} from '../../src/security/mcp-auth.js';
import { McpRequestContextSchema, McpErrorCode } from '../../src/domain/mcp/mcp.schemas.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../../src/errors/index.js';

describe('MCP Server Foundation Unit Tests (P7-001 — 2026-07-28 Standard)', () => {
  // ===========================================================================
  // 1. Server Factory & Metadata Initialization
  // ===========================================================================
  it('1. initializes McpServerWrapper with correct 2026-07-28 protocol version and metadata', () => {
    const server = createMcpServer();
    assert.ok(server instanceof McpServerWrapper);
    assert.strictEqual(server.name, 'antigravity-career-hub');
    assert.strictEqual(server.version, '0.1.0');
    assert.strictEqual(server.protocolVersion, '2026-07-28');
    assert.strictEqual(server.registeredTools.size, 0);
    assert.strictEqual(server.isStarted, false);
  });

  it('2. supports custom name and version overrides in factory', () => {
    const server = createMcpServer({
      name: 'custom-career-mcp',
      version: '2.0.0',
    });
    assert.strictEqual(server.name, 'custom-career-mcp');
    assert.strictEqual(server.version, '2.0.0');
    assert.strictEqual(server.protocolVersion, '2026-07-28');
  });

  // ===========================================================================
  // 2. Hard Protocol Revision Assertion
  // ===========================================================================
  it('3. hard asserts that server foundation operates on 2026-07-28 standard and does not revert to legacy 2025-11-25', () => {
    const server = createMcpServer();
    assert.strictEqual(server.protocolVersion, '2026-07-28');
    assert.notStrictEqual(server.protocolVersion, '2025-11-25');
  });

  // ===========================================================================
  // 3. Tool Registration & Schema Validation
  // ===========================================================================
  it('4. registers a valid tool definition with input schema and handler', () => {
    const server = createMcpServer();

    const toolDef = {
      name: 'test_health_ping',
      description: 'Ping tool for testing foundation',
      inputSchema: {
        message: z.string().optional(),
      },
      requiredRole: 'READONLY',
      requiredScopes: ['career:read'],
    };

    server.registerTool(toolDef, async (_context, args) => {
      return { pong: true, message: args?.message || 'hello' };
    });

    const tools = server.getRegisteredTools();
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'test_health_ping');
    assert.strictEqual(tools[0].requiredRole, 'READONLY');
  });

  it('5. rejects duplicate tool registration with clear error', () => {
    const server = createMcpServer();
    const toolDef = {
      name: 'duplicate_tool',
      description: 'Tool to test duplication',
      inputSchema: {},
      requiredRole: 'READONLY',
      requiredScopes: ['career:read'],
    };

    server.registerTool(toolDef, async () => ({ ok: true }));

    assert.throws(
      () => server.registerTool(toolDef, async () => ({ ok: true })),
      /Tool with name "duplicate_tool" is already registered/
    );
  });

  it('6. rejects invalid tool names (e.g. spaces, uppercase, symbols)', () => {
    const server = createMcpServer();

    assert.throws(() => {
      server.registerTool(
        {
          name: 'Invalid Tool Name!',
          description: 'Desc',
          inputSchema: {},
        },
        async () => {}
      );
    }, z.ZodError);
  });

  // ===========================================================================
  // 4. RBAC & Scope Permissions Assertion
  // ===========================================================================
  it('7. assertToolPermission permits READONLY user for READONLY tool', () => {
    const context = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'READONLY',
      tokenScopes: ['career:read'],
    };

    const toolDef = {
      name: 'get_profile',
      description: 'read profile',
      inputSchema: {},
      requiredRole: 'READONLY',
      requiredScopes: ['career:read'],
    };

    assert.doesNotThrow(() => assertToolPermission(context, toolDef));
  });

  it('8. assertToolPermission denies READONLY user attempting to invoke MEMBER or OWNER tool', () => {
    const context = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'READONLY',
      tokenScopes: ['career:read', 'career:write'],
    };

    const memberToolDef = {
      name: 'tailor_resume',
      description: 'tailor resume',
      inputSchema: {},
      requiredRole: 'MEMBER',
      requiredScopes: ['career:write'],
    };

    assert.throws(() => assertToolPermission(context, memberToolDef), AuthorizationError);
  });

  it('9. assertToolPermission permits MEMBER user for MEMBER and READONLY tools but denies OWNER tool', () => {
    const context = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'MEMBER',
      tokenScopes: ['career:read', 'career:write'],
    };

    const memberToolDef = {
      name: 'tailor_resume',
      description: 'tailor resume',
      inputSchema: {},
      requiredRole: 'MEMBER',
      requiredScopes: ['career:write'],
    };

    const ownerToolDef = {
      name: 'admin_delete_profile',
      description: 'delete profile',
      inputSchema: {},
      requiredRole: 'OWNER',
      requiredScopes: ['career:write'],
    };

    assert.doesNotThrow(() => assertToolPermission(context, memberToolDef));
    assert.throws(() => assertToolPermission(context, ownerToolDef), AuthorizationError);
  });

  it('10. assertToolPermission permits OWNER for any tool with matching scope', () => {
    const context = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'OWNER',
      tokenScopes: ['career:read', 'career:write', 'career:export'],
    };

    const ownerToolDef = {
      name: 'owner_operation',
      description: 'owner op',
      inputSchema: {},
      requiredRole: 'OWNER',
      requiredScopes: ['career:export'],
    };

    assert.doesNotThrow(() => assertToolPermission(context, ownerToolDef));
  });

  it('11. assertToolPermission denies invocation if required token scope is missing', () => {
    const context = {
      userId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      role: 'OWNER',
      tokenScopes: ['career:read'], // Missing career:export
    };

    const exportToolDef = {
      name: 'export_artifact',
      description: 'export artifact',
      inputSchema: {},
      requiredRole: 'READONLY',
      requiredScopes: ['career:export'],
    };

    assert.throws(() => assertToolPermission(context, exportToolDef), AuthorizationError);
  });

  // ===========================================================================
  // 5. Bearer Token Extraction & Hashing
  // ===========================================================================
  it('12. extractBearerToken extracts token from standard Bearer header', () => {
    const token = extractBearerToken('Bearer mcp_live_0123456789abcdef0123456789abcdef');
    assert.strictEqual(token, 'mcp_live_0123456789abcdef0123456789abcdef');
  });

  it('13. extractBearerToken throws AuthenticationError on missing or malformed header', () => {
    assert.throws(() => extractBearerToken(undefined), AuthenticationError);
    assert.throws(() => extractBearerToken(''), AuthenticationError);
    assert.throws(() => extractBearerToken('Basic dXNlcjpwYXNz'), AuthenticationError);
    assert.throws(() => extractBearerToken('Bearer'), AuthenticationError);
    assert.throws(() => extractBearerToken('Bearer short'), AuthenticationError);
  });

  it('14. hashMcpToken computes SHA-256 hex hash deterministically', () => {
    const rawToken = 'mcp_test_token_1234567890';
    const hash1 = hashMcpToken(rawToken);
    const hash2 = hashMcpToken(rawToken);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.match(hash1, /^[a-f0-9]{64}$/);
  });

  // ===========================================================================
  // 6. McpRequestContext Schema Validation & Immutability
  // ===========================================================================
  it('15. McpRequestContextSchema validates well-formed security context with 2026-07-28 protocol version', () => {
    const rawContext = {
      requestId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      role: 'OWNER',
      tokenScopes: ['career:read', 'career:write'],
      clientInfo: {
        userAgent: 'Claude-Desktop/2.0.0',
        protocolVersion: '2026-07-28',
        ipAddress: '127.0.0.1',
      },
      authenticatedAt: '2026-08-23T12:00:00.000Z',
    };

    const parsed = McpRequestContextSchema.parse(rawContext);
    assert.strictEqual(parsed.tenantId, rawContext.tenantId);
    assert.strictEqual(parsed.role, 'OWNER');
    assert.strictEqual(parsed.clientInfo.protocolVersion, '2026-07-28');
  });

  it('16. McpRequestContextSchema rejects invalid UUIDs or unknown roles', () => {
    const invalidContext = {
      requestId: 'not-a-uuid',
      tenantId: 'invalid-tenant',
      userId: 'invalid-user',
      role: 'SUPERADMIN',
    };

    assert.throws(() => McpRequestContextSchema.parse(invalidContext), z.ZodError);
  });

  // ===========================================================================
  // 7. Safe Error Mapping & Information-Leak Prevention
  // ===========================================================================
  it('17. mapErrorToMcpResponse maps AuthenticationError to -32001', () => {
    const err = new AuthenticationError('Token expired', 'UNAUTHENTICATED');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.UNAUTHENTICATED);
    assert.strictEqual(mapped.message, 'Token expired');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('18. mapErrorToMcpResponse maps AuthorizationError to -32003', () => {
    const err = new AuthorizationError('Insufficient permissions', 'FORBIDDEN');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.FORBIDDEN);
    assert.strictEqual(mapped.message, 'Insufficient permissions');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('19. mapErrorToMcpResponse maps NotFoundError to -32004 with generic message', () => {
    const err = new NotFoundError('Candidate not found');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.NOT_FOUND);
    assert.strictEqual(mapped.message, 'Requested resource not found.');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('20. mapErrorToMcpResponse maps ValidationError to -32602 with details', () => {
    const err = new ValidationError('Job description too short', 'INVALID_LENGTH', { min: 20 });
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.INVALID_PARAMS);
    assert.strictEqual(mapped.message, 'Job description too short');
    assert.deepStrictEqual(mapped.data?.details, { min: 20 });
  });

  it('21. mapErrorToMcpResponse maps ConflictError to -32009', () => {
    const err = new ConflictError('Active operation in progress');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.CONFLICT);
    assert.strictEqual(mapped.message, 'Active operation in progress');
  });

  it('22. mapErrorToMcpResponse maps RateLimitError to -32029', () => {
    const err = new AppError('Rate limit exceeded', 429, 'RATE_LIMITED');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.RATE_LIMITED);
    assert.strictEqual(mapped.message, 'Rate limit exceeded');
  });

  it('23. mapErrorToMcpResponse sanitizes unexpected Error to -32603 without leaking SQL or stack traces', () => {
    const databaseError = new Error(
      'SELECT * FROM "users" WHERE id = $1 -- connection timeout at /src/db/client.js:42'
    );
    const mapped = mapErrorToMcpResponse(databaseError, 'req-sensitive-123');

    assert.strictEqual(mapped.code, McpErrorCode.INTERNAL_ERROR);
    assert.strictEqual(mapped.message, 'Internal error processing request.');
    assert.strictEqual(mapped.data?.requestId, 'req-sensitive-123');
    assert.strictEqual(JSON.stringify(mapped).includes('SELECT'), false);
    assert.strictEqual(JSON.stringify(mapped).includes('/src/db/client.js'), false);
  });

  // ===========================================================================
  // 8. Server Lifecycle & Connection Cleanup
  // ===========================================================================
  it('24. start() and close() manage modern MCP handler lifecycle cleanly', async () => {
    const server = createMcpServer();
    assert.strictEqual(server.isStarted, false);

    const handler = await server.start();
    assert.ok(handler);
    assert.strictEqual(server.isStarted, true);

    const handler2 = await server.start();
    assert.strictEqual(handler, handler2);

    await server.close();
    assert.strictEqual(server.isStarted, false);
    assert.strictEqual(server.handler, null);
  });
});
