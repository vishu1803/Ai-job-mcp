/**
 * @file MCP Audit Logging Service (P7-006 / ARCH-025 / ADR-046).
 *
 * Implements the unified MCP audit logging engine adhering to:
 * 1. Single unified PostgreSQL `audit_logs` table (zero second audit systems).
 * 2. Strict PII and credential sanitization via `sanitizeAuditDetails()`.
 * 3. 16 KB payload ceiling (`MAX_AUDIT_PAYLOAD_BYTES`) and string parameter clamping.
 * 4. Failure-isolated non-blocking asynchronous persistence.
 * 5. Sovereign multi-tenant default-deny isolation (WHERE tenant_id = :tenantId).
 * 6. Canonical event taxonomy (mcp.tool.*, mcp.resource.*, mcp.prompt.*, mcp.token.*).
 */

import { eq, and, desc, gte, lte, count } from 'drizzle-orm';
import { auditLogs } from '../db/schema.js';
import { db as defaultDb } from '../db/index.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { sanitizeAuditDetails } from '../utils/audit-sanitizer.js';
import { McpAuditQuerySchema } from '../domain/mcp/mcp.schemas.js';
import { ValidationError, AuthorizationError } from '../errors/index.js';

/** Maximum character length permitted for individual string parameters in audit metadata */
const MAX_PARAM_STRING_LENGTH = 1000;

/**
 * Clamps large string properties in parameter payloads to prevent audit buffer exhaustion.
 *
 * @param {any} value Raw parameter value
 * @param {number} [depth=0] Current recursion depth
 * @returns {any} Clamped, safe value
 */
function clampParameterStrings(value, depth = 0) {
  if (depth > 6) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_PARAM_STRING_LENGTH
      ? `${value.slice(0, MAX_PARAM_STRING_LENGTH)}... [TRUNCATED_${value.length}_CHARS]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => clampParameterStrings(item, depth + 1));
  }
  if (typeof value === 'object') {
    const clamped = {};
    for (const [k, v] of Object.entries(value)) {
      clamped[k] = clampParameterStrings(v, depth + 1);
    }
    return clamped;
  }
  return String(value);
}

/**
 * Asserts that a valid tenantId is provided for repository queries.
 *
 * @param {string} tenantId Tenant UUID
 * @param {string} fnName Function name for error context
 */
function assertTenantId(tenantId, fnName) {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ValidationError(
      `tenantId is mandatory for audit operation ${fnName}`,
      'INVALID_TENANT_ID'
    );
  }
}

export class McpAuditService {
  /**
   * @param {object} [options={}] Service dependencies
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client override
   * @param {import('pino').Logger} [options.logger] Logger instance override
   */
  constructor(options = {}) {
    this.db = options.db || defaultDb;
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Records an MCP audit event into the PostgreSQL `audit_logs` table.
   * Runs in a failure-isolated try/catch block so transient DB write errors
   * never crash or delay client tool execution.
   *
   * @param {object} params Event parameters
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} [params.context] Authenticated MCP request context
   * @param {string} [params.tenantId] Explicit tenant UUID (if context not provided)
   * @param {string} [params.userId] Explicit user UUID (if context not provided)
   * @param {string} params.eventType Canonical event name (e.g. 'mcp.tool.completed', 'mcp.tool.denied')
   * @param {string} [params.resourceType='mcp_tool'] Resource classification ('mcp_tool', 'mcp_resource', 'mcp_prompt')
   * @param {string} [params.resourceId] Specific tool, resource, or prompt name
   * @param {string} [params.requestId] Request correlation UUID
   * @param {string} [params.clientIp] Caller IP address
   * @param {string} [params.userAgent] Caller User-Agent
   * @param {number} [params.durationMs] Execution duration in milliseconds
   * @param {number} [params.statusCode=200] HTTP / JSON-RPC status code
   * @param {number | null} [params.errorCode=null] Standard MCP / JSON-RPC error code
   * @param {string | null} [params.errorMessage=null] Human-readable error message (if applicable)
   * @param {boolean} [params.isError=false] Error indicator
   * @param {object} [params.parameters] Sanitized request arguments
   * @param {object} [params.summary] High-level result summary
   * @param {string} [params.protocolVersion='2026-07-28'] MCP protocol version
   * @param {string} [params.authMethod] Authentication method used
   * @param {string} [params.tokenPrefix] Safe token prefix (e.g. 'mcp_live_4a8b9c1d')
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Transaction/DB client override
   * @returns {Promise<object | null>} Created audit record summary, or null if unpersisted/failed
   */
  async recordEvent(params, options = {}) {
    const database = options.db || this.db;
    const context = params.context || null;
    const tenantId = context?.tenantId || params.tenantId || null;
    const userId = context?.userId || params.userId || null;
    const role = context?.role || undefined;

    const resourceType = params.resourceType || 'mcp_tool';
    const resourceId = params.resourceId || params.toolName || null;
    const protocolVersion =
      params.protocolVersion || context?.clientInfo?.protocolVersion || '2026-07-28';
    const authMethod =
      params.authMethod || context?.authMethod || (context ? 'MCP_API_TOKEN' : 'UNAUTHENTICATED');

    // Build raw metadata payload
    let clampedParams = undefined;
    if (params.parameters && typeof params.parameters === 'object') {
      try {
        clampedParams = clampParameterStrings(params.parameters);
      } catch {
        clampedParams = '[UNSERIALIZABLE_PARAMS]';
      }
    }

    const rawDetails = {
      protocolVersion,
      mcpMethod: resourceType === 'mcp_tool' ? 'tools/call' : undefined,
      toolName: resourceType === 'mcp_tool' ? resourceId : undefined,
      resourceName: resourceType === 'mcp_resource' ? resourceId : undefined,
      promptName: resourceType === 'mcp_prompt' ? resourceId : undefined,
      role,
      authMethod,
      tokenPrefix: params.tokenPrefix || undefined,
      durationMs: typeof params.durationMs === 'number' ? Math.max(0, params.durationMs) : 0,
      statusCode: typeof params.statusCode === 'number' ? params.statusCode : 200,
      errorCode: params.errorCode !== undefined ? params.errorCode : null,
      errorMessage: params.errorMessage ? String(params.errorMessage).slice(0, 500) : null,
      isError: Boolean(params.isError),
      parameters: clampedParams,
      summary: params.summary || undefined,
    };

    // Sanitize metadata: strip credentials/secrets/PII and enforce 16 KB cap
    let sanitizedDetails = {};
    try {
      sanitizedDetails = sanitizeAuditDetails(rawDetails);
    } catch (sanitizationErr) {
      this.logger.warn(
        { err: sanitizationErr, eventType: params.eventType, resourceId },
        'Audit details sanitization failed or exceeded limit; falling back to minimal envelope'
      );
      sanitizedDetails = {
        protocolVersion,
        toolName: resourceId,
        durationMs: rawDetails.durationMs,
        statusCode: rawDetails.statusCode,
        isError: rawDetails.isError,
        errorCode: rawDetails.errorCode,
        sanitizationNotice: '[PAYLOAD_EXCEEDED_OR_INVALID]',
      };
    }

    // If tenantId is not present (unauthenticated stranger), log to Pino operational logger and exit
    if (!tenantId) {
      this.logger.info(
        {
          eventType: params.eventType,
          resourceType,
          resourceId,
          requestId: params.requestId,
          statusCode: params.statusCode,
          clientIp: params.clientIp,
        },
        'Unauthenticated MCP event logged to operational stream (no tenantId)'
      );
      return null;
    }

    // Failure-isolated database insertion into PostgreSQL audit_logs
    try {
      const [inserted] = await database
        .insert(auditLogs)
        .values({
          tenantId,
          userId,
          eventType: params.eventType,
          resourceType,
          resourceId,
          requestId: params.requestId || null,
          ipAddress: params.clientIp || null,
          userAgent: params.userAgent ? String(params.userAgent).slice(0, 256) : null,
          details: sanitizedDetails,
        })
        .returning();

      return inserted || null;
    } catch (dbError) {
      this.logger.error(
        {
          err: dbError,
          tenantId,
          eventType: params.eventType,
          resourceId,
          requestId: params.requestId,
        },
        'Failed to record MCP database audit log entry (failure isolated; client response unblocked)'
      );
      return null;
    }
  }

  /**
   * Queries audit logs strictly scoped to the authenticated tenant.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
   * @param {object} [query={}] Filter and pagination parameters
   * @param {object} [options={}] Execution overrides
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db] Database client override
   * @returns {Promise<{ items: Array<object>, total: number, page: number, limit: number, totalPages: number }>}
   */
  async listAuditLogs(context, query = {}, options = {}) {
    if (!context || !context.tenantId) {
      throw new AuthorizationError(
        'Authentication context required to query audit logs',
        'UNAUTHENTICATED'
      );
    }
    assertTenantId(context.tenantId, 'listAuditLogs');

    const database = options.db || this.db;
    const validated = McpAuditQuerySchema.parse(query);

    const conditions = [eq(auditLogs.tenantId, context.tenantId)];

    if (validated.eventType) {
      conditions.push(eq(auditLogs.eventType, validated.eventType));
    }
    if (validated.toolName) {
      conditions.push(
        and(eq(auditLogs.resourceType, 'mcp_tool'), eq(auditLogs.resourceId, validated.toolName))
      );
    }
    if (validated.requestId) {
      conditions.push(eq(auditLogs.requestId, validated.requestId));
    }
    if (validated.startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(validated.startDate)));
    }
    if (validated.endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(validated.endDate)));
    }

    const whereClause = and(...conditions);
    const offset = (validated.page - 1) * validated.limit;

    // Run count and paginated query in parallel
    const [totalRows, rows] = await Promise.all([
      database.select({ count: count() }).from(auditLogs).where(whereClause),
      database
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.createdAt))
        .limit(validated.limit)
        .offset(offset),
    ]);

    const total = Number(totalRows[0]?.count || 0);
    const totalPages = Math.ceil(total / validated.limit) || 1;

    return {
      items: rows,
      total,
      page: validated.page,
      limit: validated.limit,
      totalPages,
    };
  }
}

export const defaultMcpAuditService = new McpAuditService();
export default McpAuditService;
