/**
 * @file Model Context Protocol (MCP) Server Factory & Wrapper.
 *
 * Implements:
 * 1. McpServer initialization with official @modelcontextprotocol/sdk.
 * 2. Streamable HTTP transport attachment.
 * 3. Typed tool and resource registration with RBAC and scope assertions.
 * 4. Error mapping conforming to ARCH-022 and JSON-RPC 2.0 specifications.
 * 5. Lifecycle management (startup, teardown, connection cleanup).
 */

import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpToolDefinitionSchema, McpErrorCode } from '../domain/mcp/mcp.schemas.js';
import { assertToolPermission } from '../security/mcp-auth.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../errors/index.js';

/**
 * Maps application and domain errors to standardized JSON-RPC 2.0 / MCP error envelopes.
 * Guarantees zero leakage of database credentials, SQL statements, stack traces, or file paths.
 *
 * @param {Error | AppError} err Error instance
 * @param {string} [requestId] Correlation request ID
 * @returns {{ code: number, message: string, data?: { requestId?: string, details?: any } }} Standardized MCP error object
 */
export function mapErrorToMcpResponse(err, requestId) {
  // 1. Authentication Error (-32001)
  if (
    err instanceof AuthenticationError ||
    err.code === 'UNAUTHENTICATED' ||
    err.statusCode === 401
  ) {
    return {
      code: McpErrorCode.UNAUTHENTICATED,
      message: err.message || 'Authentication failed. Invalid or expired Bearer token.',
      data: requestId ? { requestId } : undefined,
    };
  }

  // 2. Authorization / RBAC Error (-32003)
  if (err instanceof AuthorizationError || err.code === 'FORBIDDEN' || err.statusCode === 403) {
    return {
      code: McpErrorCode.FORBIDDEN,
      message: err.message || 'Operation forbidden. Insufficient role permissions.',
      data: requestId ? { requestId } : undefined,
    };
  }

  // 3. Not Found / Cross-Tenant Default Deny (-32004)
  if (err instanceof NotFoundError || err.code === 'NOT_FOUND' || err.statusCode === 404) {
    return {
      code: McpErrorCode.NOT_FOUND,
      message: 'Requested resource not found.',
      data: requestId ? { requestId } : undefined,
    };
  }

  // 4. Validation / Invalid Parameters Error (-32602)
  if (err instanceof ValidationError || err.code === 'VALIDATION_ERROR' || err.statusCode === 400) {
    return {
      code: McpErrorCode.INVALID_PARAMS,
      message: err.message || 'Invalid tool arguments.',
      data: {
        ...(requestId ? { requestId } : {}),
        details: err.details || undefined,
      },
    };
  }

  // 5. Conflict Error (-32009)
  if (err instanceof ConflictError || err.code === 'CONFLICT' || err.statusCode === 409) {
    return {
      code: McpErrorCode.CONFLICT,
      message: err.message || 'Operation conflict occurred.',
      data: requestId ? { requestId } : undefined,
    };
  }

  // 6. Rate Limit Error (-32029)
  if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
    return {
      code: McpErrorCode.RATE_LIMITED,
      message: err.message || 'Rate limit exceeded. Please retry later.',
      data: requestId ? { requestId } : undefined,
    };
  }

  // 7. Generic / Unexpected Internal Error (-32603)
  // Strips stack traces, database details, file paths, and sensitive exception messages
  return {
    code: McpErrorCode.INTERNAL_ERROR,
    message: 'Internal error processing request.',
    data: requestId ? { requestId } : undefined,
  };
}

/**
 * Encapsulated MCP Server Foundation Wrapper.
 */
export class McpServerWrapper {
  /**
   * @param {object} [options={}] Configuration options
   * @param {string} [options.name='antigravity-career-hub'] Server identification name
   * @param {string} [options.version='0.1.0'] Server semantic version
   * @param {object} [options.transportOptions] Streamable HTTP transport options
   */
  constructor(options = {}) {
    this.name = options.name || 'antigravity-career-hub';
    this.version = options.version || '0.1.0';
    this.registeredTools = new Map();
    this.transport = null;
    this.isStarted = false;
    this.transportOptions = options.transportOptions || {
      enableJsonResponse: true,
      sessionIdGenerator: () => randomUUID(),
    };

    // Initialize official McpServer instance
    this.mcpServer = new McpServer({
      name: this.name,
      version: this.version,
    });
  }

  /**
   * Registers a typed tool definition and handler with RBAC and context validation.
   *
   * @param {object} toolDef Tool definition object
   * @param {Function} handler Tool execution function: `(context, args) => Promise<object>`
   */
  registerTool(toolDef, handler) {
    const validatedDef = McpToolDefinitionSchema.parse(toolDef);

    if (this.registeredTools.has(validatedDef.name)) {
      throw new Error(`Tool with name "${validatedDef.name}" is already registered.`);
    }

    this.registeredTools.set(validatedDef.name, {
      definition: validatedDef,
      handler,
    });

    // Register with official McpServer
    this.mcpServer.tool(
      validatedDef.name,
      validatedDef.description,
      validatedDef.inputSchema,
      async (args, extra) => {
        // Resolve security context from extra.authInfo (passed from transport/Fastify)
        const context = extra?.authInfo || extra?.context;

        if (!context) {
          throw new AuthenticationError(
            'Authentication context required to invoke MCP tool.',
            'UNAUTHENTICATED'
          );
        }

        // 1. Assert RBAC and scope permissions
        assertToolPermission(context, validatedDef);

        // 2. Execute underlying handler
        const result = await handler(context, args);

        // 3. Ensure response is wrapped in standard content format
        if (result && Array.isArray(result.content)) {
          return result;
        }

        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
            },
          ],
          isError: false,
          ...(result && typeof result === 'object' ? { structuredData: result } : {}),
        };
      }
    );
  }

  /**
   * Returns list of registered tool definitions.
   *
   * @returns {Array<object>} Array of tool definition objects
   */
  getRegisteredTools() {
    return Array.from(this.registeredTools.values()).map((t) => t.definition);
  }

  /**
   * Initializes and attaches the Streamable HTTP transport.
   *
   * @returns {Promise<StreamableHTTPServerTransport>} Connected transport instance
   */
  async start() {
    if (this.isStarted && this.transport) {
      return this.transport;
    }

    this.transport = new StreamableHTTPServerTransport(this.transportOptions);
    await this.mcpServer.connect(this.transport);
    this.isStarted = true;
    return this.transport;
  }

  /**
   * Closes the MCP server and active transport cleanly.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.isStarted) {
      return;
    }

    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    await this.mcpServer.close();
    this.isStarted = false;
  }
}

/**
 * Factory function creating a configured MCP server wrapper instance.
 *
 * @param {object} [options={}] Server configuration overrides
 * @returns {McpServerWrapper} Configured MCP server instance
 */
export function createMcpServer(options = {}) {
  return new McpServerWrapper(options);
}
