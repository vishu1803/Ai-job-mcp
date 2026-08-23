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
 * Client connection and environment metadata.
 */
export const McpClientInfoSchema = z
  .object({
    userAgent: z.string().max(256).optional(),
    protocolVersion: z.string().max(64).default('2025-11-25'),
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
    clientInfo: McpClientInfoSchema.default({}),
    authenticatedAt: z
      .string()
      .datetime()
      .default(() => new Date().toISOString()),
  })
  .strict();

/**
 * Standardized audit event payload for MCP invocations.
 */
export const McpAuditEventSchema = z
  .object({
    timestamp: z.string().datetime(),
    event: z.enum([
      'mcp.tool.invoked',
      'mcp.tool.completed',
      'mcp.tool.denied',
      'mcp.tool.failed',
      'mcp.handshake.completed',
      'mcp.handshake.denied',
    ]),
    tenantId: z.string().uuid().nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
    role: McpRoleEnum.optional(),
    toolName: z.string().max(64).optional(),
    resourceName: z.string().max(128).optional(),
    requestId: z.string().uuid(),
    durationMs: z.number().nonnegative().optional(),
    statusCode: z.number().int(),
    errorCode: z.number().int().optional(),
    clientIp: z.string().max(64).optional(),
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
    inputSchema: z.record(z.any()),
    outputSchema: z.record(z.any()).optional(),
    requiredRole: McpRoleEnum.default('READONLY'),
    requiredScopes: z.array(z.string()).default(['career:read']),
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
  })
  .strict();
