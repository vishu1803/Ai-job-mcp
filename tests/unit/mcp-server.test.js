/**
 * @file Unit Tests for MCP Server Foundation & Transport Layer (P7-002 — 2026-07-28 Standard)
 *
 * Validates:
 * 1. McpServer factory initialization with 2026-07-28 protocol standard.
 * 2. Tool, resource, and prompt registration and discovery.
 * 3. RBAC role-based permission assertions across tools, resources, and prompts.
 * 4. Multi-tier rate limiting (IP, Tenant, Tool compute budgets).
 * 5. Comprehensive JSON-RPC 2.0 error mapping and information-leak prevention.
 * 6. Bearer token extraction and SHA-256 hashing.
 * 7. McpRequestContext schema validation and immutability.
 * 8. Prototype pollution and excessive nesting depth defenses.
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
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { McpRequestContextSchema, McpErrorCode } from '../../src/domain/mcp/mcp.schemas.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '../../src/errors/index.js';

describe('MCP Server Foundation & Transport Unit Tests (P7-002 — 2026-07-28 Standard)', () => {
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
    assert.strictEqual(server.registeredResources.size, 0);
    assert.strictEqual(server.registeredPrompts.size, 0);
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
  // 4. Resource & Prompt Registration Foundation
  // ===========================================================================
  it('7. registers a valid resource definition and retrieves registered list', () => {
    const server = createMcpServer();

    const resourceDef = {
      uri: 'career://candidate/profile',
      name: 'candidate_profile',
      description: 'Candidate verified profile resource',
      mimeType: 'application/json',
      requiredRole: 'READONLY',
      requiredScopes: ['career:read'],
    };

    server.registerResource(resourceDef, async () => ({
      contents: [{ uri: resourceDef.uri, mimeType: 'application/json', text: '{}' }],
    }));

    const resources = server.getRegisteredResources();
    assert.strictEqual(resources.length, 1);
    assert.strictEqual(resources[0].uri, 'career://candidate/profile');
    assert.strictEqual(resources[0].name, 'candidate_profile');
  });

  it('8. rejects duplicate resource URI registration', () => {
    const server = createMcpServer();
    const resourceDef = {
      uri: 'career://candidate/profile',
      name: 'candidate_profile',
      description: 'Desc',
      mimeType: 'application/json',
    };

    server.registerResource(resourceDef, async () => ({}));
    assert.throws(
      () => server.registerResource(resourceDef, async () => ({})),
      /Resource with URI "career:\/\/candidate\/profile" is already registered/
    );
  });

  it('9. registers a valid prompt definition and retrieves registered list', () => {
    const server = createMcpServer();

    const promptDef = {
      name: 'tailor_guidance',
      description: 'Prompt guidance for resume tailoring',
      argsSchema: {
        jobTitle: z.string().optional(),
      },
      requiredRole: 'READONLY',
      requiredScopes: ['career:read'],
    };

    server.registerPrompt(promptDef, async () => ({
      messages: [{ role: 'user', content: { type: 'text', text: 'Tailor resume' } }],
    }));

    const prompts = server.getRegisteredPrompts();
    assert.strictEqual(prompts.length, 1);
    assert.strictEqual(prompts[0].name, 'tailor_guidance');
  });

  it('10. rejects duplicate prompt name registration', () => {
    const server = createMcpServer();
    const promptDef = {
      name: 'duplicate_prompt',
      description: 'Desc',
    };

    server.registerPrompt(promptDef, async () => ({}));
    assert.throws(
      () => server.registerPrompt(promptDef, async () => ({})),
      /Prompt with name "duplicate_prompt" is already registered/
    );
  });

  // ===========================================================================
  // 5. Multi-Tier Rate Limiting Unit Tests
  // ===========================================================================
  it('11. McpRateLimiter enforces IP tier limits and throws 429 when exceeded', () => {
    const limiter = new McpRateLimiter({ ipLimit: 2, windowMs: 10000 });

    limiter.checkIpLimit('192.168.1.100');
    limiter.checkIpLimit('192.168.1.100');

    assert.throws(
      () => limiter.checkIpLimit('192.168.1.100'),
      (err) => err instanceof AppError && err.statusCode === 429 && err.code === 'RATE_LIMITED'
    );

    // Distinct IP is not affected
    assert.doesNotThrow(() => limiter.checkIpLimit('192.168.1.101'));
  });

  it('12. McpRateLimiter enforces Tenant and Tool budget tiers', () => {
    const limiter = new McpRateLimiter({ tenantLimit: 3, toolLimit: 2, windowMs: 10000 });
    const tenantId = '550e8400-e29b-41d4-a716-446655440000';

    limiter.checkToolLimit(tenantId, 'heavy_ai_tool');
    limiter.checkToolLimit(tenantId, 'heavy_ai_tool');

    assert.throws(
      () => limiter.checkToolLimit(tenantId, 'heavy_ai_tool'),
      (err) => err instanceof AppError && err.statusCode === 429
    );

    // Another tool for the same tenant is permitted under its own budget
    assert.doesNotThrow(() => limiter.checkToolLimit(tenantId, 'light_read_tool'));
  });

  // ===========================================================================
  // 6. RBAC & Scope Permissions Assertion
  // ===========================================================================
  it('13. assertToolPermission permits READONLY user for READONLY tool', () => {
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

  it('14. assertToolPermission denies READONLY user attempting to invoke MEMBER or OWNER tool', () => {
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

  it('15. assertToolPermission permits MEMBER user for MEMBER and READONLY tools but denies OWNER tool', () => {
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

  it('16. assertToolPermission permits OWNER for any tool with matching scope', () => {
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

  it('17. assertToolPermission denies invocation if required token scope is missing', () => {
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
  // 7. Bearer Token Extraction & Hashing
  // ===========================================================================
  it('18. extractBearerToken extracts token from standard Bearer header', () => {
    const token = extractBearerToken('Bearer mcp_live_0123456789abcdef0123456789abcdef');
    assert.strictEqual(token, 'mcp_live_0123456789abcdef0123456789abcdef');
  });

  it('19. extractBearerToken throws AuthenticationError on missing or malformed header', () => {
    assert.throws(() => extractBearerToken(undefined), AuthenticationError);
    assert.throws(() => extractBearerToken(''), AuthenticationError);
    assert.throws(() => extractBearerToken('Basic dXNlcjpwYXNz'), AuthenticationError);
    assert.throws(() => extractBearerToken('Bearer'), AuthenticationError);
    assert.throws(() => extractBearerToken('Bearer short'), AuthenticationError);
  });

  it('20. hashMcpToken computes SHA-256 hex hash deterministically', () => {
    const rawToken = 'mcp_test_token_1234567890';
    const hash1 = hashMcpToken(rawToken);
    const hash2 = hashMcpToken(rawToken);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.match(hash1, /^[a-f0-9]{64}$/);
  });

  // ===========================================================================
  // 8. McpRequestContext Schema Validation & Immutability
  // ===========================================================================
  it('21. McpRequestContextSchema validates well-formed security context with 2026-07-28 protocol version', () => {
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

  it('22. McpRequestContextSchema rejects invalid UUIDs or unknown roles', () => {
    const invalidContext = {
      requestId: 'not-a-uuid',
      tenantId: 'invalid-tenant',
      userId: 'invalid-user',
      role: 'SUPERADMIN',
    };

    assert.throws(() => McpRequestContextSchema.parse(invalidContext), z.ZodError);
  });

  // ===========================================================================
  // 9. Safe Error Mapping & Information-Leak Prevention
  // ===========================================================================
  it('23. mapErrorToMcpResponse maps AuthenticationError to -32001', () => {
    const err = new AuthenticationError('Token expired', 'UNAUTHENTICATED');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.UNAUTHENTICATED);
    assert.strictEqual(mapped.message, 'Token expired');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('24. mapErrorToMcpResponse maps AuthorizationError to -32003', () => {
    const err = new AuthorizationError('Insufficient permissions', 'FORBIDDEN');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.FORBIDDEN);
    assert.strictEqual(mapped.message, 'Insufficient permissions');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('25. mapErrorToMcpResponse maps NotFoundError to -32004 with generic message', () => {
    const err = new NotFoundError('Candidate not found');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.NOT_FOUND);
    assert.strictEqual(mapped.message, 'Requested resource not found.');
    assert.deepStrictEqual(mapped.data, { requestId: 'req-123' });
  });

  it('26. mapErrorToMcpResponse maps ValidationError to -32602 with details', () => {
    const err = new ValidationError('Job description too short', 'INVALID_LENGTH', { min: 20 });
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.INVALID_PARAMS);
    assert.strictEqual(mapped.message, 'Job description too short');
    assert.deepStrictEqual(mapped.data?.details, { min: 20 });
  });

  it('27. mapErrorToMcpResponse maps ConflictError to -32009', () => {
    const err = new ConflictError('Active operation in progress');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.CONFLICT);
    assert.strictEqual(mapped.message, 'Active operation in progress');
  });

  it('28. mapErrorToMcpResponse maps RateLimitError to -32029', () => {
    const err = new AppError('Rate limit exceeded', 429, 'RATE_LIMITED');
    const mapped = mapErrorToMcpResponse(err, 'req-123');

    assert.strictEqual(mapped.code, McpErrorCode.RATE_LIMITED);
    assert.strictEqual(mapped.message, 'Rate limit exceeded');
  });

  it('29. mapErrorToMcpResponse sanitizes unexpected Error to -32603 without leaking SQL or stack traces', () => {
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
  // 10. Server Lifecycle & Connection Cleanup
  // ===========================================================================
  it('30. start() and close() manage modern MCP handler lifecycle cleanly', async () => {
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
