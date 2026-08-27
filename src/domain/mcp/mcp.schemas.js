/**
 * @file Model Context Protocol (MCP) Domain Schemas.
 *
 * Strict Zod definitions for MCP request context, tool registration,
 * execution envelopes, error mapping, and audit events.
 * Adheres strictly to ARCH-022 and the 2026-07-28 MCP specification.
 */

import { z } from 'zod';

/**
 * Standard MCP JSON-RPC 2.0 Error Codes.
 */
export const McpErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  UNAUTHENTICATED: -32001,
  FORBIDDEN: -32003,
  NOT_FOUND: -32004,
  CONFLICT: -32009,
  RATE_LIMITED: -32029,
};

/**
 * Permitted workspace roles for MCP operations.
 */
export const McpRoleEnum = z.enum(['OWNER', 'MEMBER', 'READONLY']);

/**
 * Permitted token scopes for MCP operations.
 */
export const McpScopeEnum = z.enum([
  'career:read',
  'career:write',
  'career:export',
  'career:admin',
]);

/**
 * MCP API token lifecycle states.
 */
export const McpTokenStatusEnum = z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']);

/**
 * MCP client authorization types.
 */
export const McpClientTypeEnum = z.enum(['PERSONAL', 'THIRD_PARTY']);

/**
 * MCP authentication method types.
 */
export const McpAuthMethodEnum = z.enum(['MCP_API_TOKEN', 'SESSION_FALLBACK', 'OAUTH_BEARER']);

/**
 * Client connection and environment metadata.
 */
export const McpClientInfoSchema = z
  .object({
    clientId: z.string().max(128).optional(),
    userAgent: z.string().max(256).optional(),
    protocolVersion: z.string().max(64).default('2026-07-28'),
    ipAddress: z.string().max(64).default('127.0.0.1'),
  })
  .strict();

/**
 * Sovereign, trusted request context minted during authentication.
 * Clients cannot supply or override this context in tool parameters.
 */
export const McpRequestContextSchema = z
  .object({
    requestId: z.string().uuid(),
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
    role: McpRoleEnum,
    tokenScopes: z.array(z.string()).default(['career:read']),
    authMethod: McpAuthMethodEnum.default('MCP_API_TOKEN'),
    clientInfo: McpClientInfoSchema.default({}),
    authenticatedAt: z
      .string()
      .datetime()
      .default(() => new Date().toISOString()),
  })
  .strict();

/**
 * Input schema for creating a new personal MCP API token.
 */
export const CreateMcpTokenInputSchema = z
  .object({
    name: z.string().min(1).max(128).trim(),
    scopes: z.array(McpScopeEnum).min(1).default(['career:read']),
    expiryDays: z.number().int().min(0).max(365).nullable().optional().default(30),
    clientType: McpClientTypeEnum.default('PERSONAL'),
  })
  .strict();

/**
 * Safe summary schema for listing MCP API tokens (never exposes hash or raw token).
 */
export const McpTokenSummarySchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string(),
    tokenPrefix: z.string(),
    scopes: z.array(z.string()),
    lastUsedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    createdAt: z.string(),
    revokedAt: z.string().nullable().optional(),
    status: McpTokenStatusEnum,
    clientType: McpClientTypeEnum,
  })
  .strict();

/**
 * Result schema returned ONLY once at token creation or rotation.
 */
export const McpTokenCreatedResultSchema = z
  .object({
    rawToken: z.string(),
    token: McpTokenSummarySchema,
  })
  .strict();

/**
 * Standardized audit event payload for MCP invocations and token lifecycle.
 */
export const McpAuditEventSchema = z
  .object({
    timestamp: z
      .string()
      .datetime()
      .default(() => new Date().toISOString()),
    event: z.enum([
      'mcp.tool.invoked',
      'mcp.tool.completed',
      'mcp.tool.denied',
      'mcp.tool.failed',
      'mcp.resource.listed',
      'mcp.resource.read',
      'mcp.prompt.listed',
      'mcp.prompt.rendered',
      'mcp.handshake.completed',
      'mcp.handshake.denied',
      'mcp.token.created',
      'mcp.token.revoked',
      'mcp.token.rotated',
      'mcp.token.expired',
      'mcp.token.authentication_failed',
    ]),
    tenantId: z.string().uuid().nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
    role: McpRoleEnum.optional(),
    toolName: z.string().max(64).optional(),
    resourceName: z.string().max(128).optional(),
    tokenId: z.string().uuid().optional(),
    tokenPrefix: z.string().max(32).optional(),
    requestId: z.string().uuid(),
    durationMs: z.number().nonnegative().optional(),
    statusCode: z.number().int(),
    errorCode: z.number().int().optional(),
    clientIp: z.string().max(64).optional(),
    userAgent: z.string().max(256).optional(),
    details: z.record(z.any()).optional(),
  })
  .strict();

/**
 * Filter schema for querying tenant MCP audit logs.
 */
export const McpAuditQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    eventType: z.string().max(64).optional(),
    toolName: z.string().max(64).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    requestId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Canonical tool definition schema for registration.
 */
export const McpToolDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/, 'Tool name must be lowercase alphanumeric with underscores'),
    description: z.string().min(1).max(1000),
    inputSchema: z.any(),
    outputSchema: z.any().optional(),
    requiredRole: McpRoleEnum.default('READONLY'),
    requiredScopes: z.array(z.string()).default(['career:read']),
    annotations: z.record(z.any()).optional(),
    _meta: z.record(z.any()).optional(),
  })
  .strict();

/**
 * Standard content items in an MCP response.
 */
export const McpTextContentSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
  })
  .strict();

export const McpResourceContentSchema = z
  .object({
    type: z.literal('resource'),
    resource: z
      .object({
        uri: z.string(),
        mimeType: z.string(),
        text: z.string().optional(),
        blob: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const McpToolContentItemSchema = z.discriminatedUnion('type', [
  McpTextContentSchema,
  McpResourceContentSchema,
]);

/**
 * Structured tool execution result envelope.
 */
export const McpToolResultSchema = z
  .object({
    content: z.array(McpToolContentItemSchema),
    isError: z.boolean().default(false),
    structuredData: z.record(z.any()).optional(),
    _meta: z.record(z.any()).optional(),
  })
  .strict();

/**
 * Canonical resource definition schema for registration.
 */
export const McpResourceDefinitionSchema = z
  .object({
    uri: z.string().min(1).max(256),
    name: z.string().min(1).max(64),
    description: z.string().min(1).max(1000).optional(),
    mimeType: z.string().default('application/json'),
    requiredRole: McpRoleEnum.default('READONLY'),
    requiredScopes: z.array(z.string()).default(['career:read']),
  })
  .strict();

/**
 * Canonical prompt definition schema for registration.
 */
export const McpPromptArgumentSchema = z
  .object({
    name: z.string().min(1).max(64),
    description: z.string().max(1000).optional(),
    required: z.boolean().default(false),
  })
  .strict();

export const McpPromptDefinitionSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/, 'Prompt name must be lowercase alphanumeric with underscores'),
    description: z.string().min(1).max(1000).optional(),
    argsSchema: z.record(z.any()).optional(),
    requiredRole: McpRoleEnum.default('READONLY'),
    requiredScopes: z.array(z.string()).default(['career:read']),
  })
  .strict();
