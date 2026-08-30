/**
 * @file Model Context Protocol (MCP) Server Factory & Wrapper (2026-07-28 Standard).
 *
 * Implements:
 * 1. MCP Server integration using official @modelcontextprotocol/server v2 (2026-07-28 revision).
 * 2. Modern stateless per-request handler factory via createMcpHandler.
 * 3. Typed tool, resource, and prompt registration with RBAC and scope assertions.
 * 4. Error mapping conforming to ARCH-022 and JSON-RPC 2.0 specifications.
 * 5. Lifecycle management (startup, teardown, connection cleanup).
 */

import { z } from 'zod';
import { McpServer, createMcpHandler, fromJsonSchema } from '@modelcontextprotocol/server';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  McpToolDefinitionSchema,
  McpResourceDefinitionSchema,
  McpPromptDefinitionSchema,
  McpErrorCode,
} from '../domain/mcp/mcp.schemas.js';
import { assertToolPermission } from '../security/mcp-auth.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../errors/index.js';
import {
  registerCareerReadTools,
  registerCareerArtifactTools,
  registerCareerWriteTools,
  registerCareerTrackingTools,
  registerJobWorkflowTools,
  registerCareerProfileTools,
} from './tools/index.js';
import { registerCareerMcpApps } from './apps/index.js';
import { registerCareerResources } from './resources/career-resources.js';
import { registerCareerPrompts } from './prompts/career-prompts.js';

/**
 * Normalizes inputSchema into a standard JSON schema wrapped with fromJsonSchema.
 *
 * @param {any} inputSchema Raw input schema object or Zod schema
 * @returns {any} Normalized schema compatible with v2 McpServer
 */
function toMcpInputSchema(inputSchema) {
  if (!inputSchema) {
    return fromJsonSchema({ type: 'object', properties: {} });
  }

  // If already standard JSON schema (has type / properties)
  if (inputSchema.type && typeof inputSchema.type === 'string') {
    return fromJsonSchema(inputSchema);
  }

  // If Zod schema instance
  if (
    inputSchema._def ||
    (typeof inputSchema.parse === 'function' && typeof inputSchema.safeParse === 'function')
  ) {
    const jsonSchema = zodToJsonSchema(inputSchema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    });
    return fromJsonSchema(jsonSchema);
  }

  // If raw shape object: e.g. { msg: z.string().optional() } or {}
  if (typeof inputSchema === 'object') {
    if (Object.keys(inputSchema).length === 0) {
      return fromJsonSchema({ type: 'object', properties: {} });
    }
    const wrappedZod = z.object(inputSchema);
    const jsonSchema = zodToJsonSchema(wrappedZod, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    });
    return fromJsonSchema(jsonSchema);
  }

  return fromJsonSchema({ type: 'object', properties: {} });
}

/**
 * Maps application and domain errors to standardized JSON-RPC 2.0 / MCP error envelopes.
 * Guarantees zero leakage of database credentials, SQL statements, stack traces, or file paths.
 *
 * @param {Error | import('../errors/index.js').AppError} err Error instance
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
  return {
    code: McpErrorCode.INTERNAL_ERROR,
    message: 'Internal error processing request.',
    data: requestId ? { requestId } : undefined,
  };
}

/**
 * Encapsulated MCP Server Foundation Wrapper for 2026-07-28 specification.
 */
export class McpServerWrapper {
  /**
   * @param {object} [options={}] Configuration options
   * @param {string} [options.name='antigravity-career-hub'] Server identification name
   * @param {string} [options.version='0.1.0'] Server semantic version
   * @param {string} [options.protocolVersion='2026-07-28'] Primary MCP protocol revision
   */
  constructor(options = {}) {
    this.name = options.name || 'antigravity-career-hub';
    this.version = options.version || '0.1.0';
    this.protocolVersion = options.protocolVersion || '2026-07-28';
    this.registeredTools = new Map();
    this.registeredResources = new Map();
    this.registeredPrompts = new Map();
    this.handler = null;
    this.isStarted = false;
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
  }

  /**
   * Registers a typed resource definition and read handler.
   *
   * @param {object} resourceDef Resource definition object
   * @param {Function} handler Resource read handler: `(context, uri) => Promise<object>`
   */
  registerResource(resourceDef, handler) {
    const validatedDef = McpResourceDefinitionSchema.parse(resourceDef);

    if (this.registeredResources.has(validatedDef.uri)) {
      throw new Error(`Resource with URI "${validatedDef.uri}" is already registered.`);
    }

    this.registeredResources.set(validatedDef.uri, {
      definition: validatedDef,
      handler,
    });
  }

  /**
   * Registers a typed prompt definition and generator handler.
   *
   * @param {object} promptDef Prompt definition object
   * @param {Function} handler Prompt generator handler: `(context, args) => Promise<object>`
   */
  registerPrompt(promptDef, handler) {
    const validatedDef = McpPromptDefinitionSchema.parse(promptDef);

    if (this.registeredPrompts.has(validatedDef.name)) {
      throw new Error(`Prompt with name "${validatedDef.name}" is already registered.`);
    }

    this.registeredPrompts.set(validatedDef.name, {
      definition: validatedDef,
      handler,
    });
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
   * Returns list of registered resource definitions.
   *
   * @returns {Array<object>} Array of resource definition objects
   */
  getRegisteredResources() {
    return Array.from(this.registeredResources.values()).map((r) => r.definition);
  }

  /**
   * Returns list of registered prompt definitions.
   *
   * @returns {Array<object>} Array of prompt definition objects
   */
  getRegisteredPrompts() {
    return Array.from(this.registeredPrompts.values()).map((p) => p.definition);
  }

  /**
   * Builds and instantiates a per-request McpServer instance populated with all registered tools, resources, and prompts.
   *
   * @param {object} params Factory parameters
   * @param {string} params.era Protocol era ('modern' | 'legacy')
   * @param {object} [params.authInfo] Trusted authentication context
   * @returns {Promise<McpServer>} Configured McpServer instance
   */
  async buildServerInstance({ era: _era, authInfo }) {
    const server = new McpServer({
      name: this.name,
      version: this.version,
    });

    // 1. Register Tools
    for (const [toolName, { definition, handler }] of this.registeredTools) {
      server.registerTool(
        toolName,
        {
          description: definition.description,
          inputSchema: toMcpInputSchema(definition.inputSchema),
          ...(definition.annotations ? { annotations: definition.annotations } : {}),
          ...(definition._meta ? { _meta: definition._meta } : {}),
        },
        async (args, extra) => {
          const context = authInfo || extra?.authInfo || extra?.context;

          if (!context) {
            throw new AuthenticationError(
              'Authentication context required to invoke MCP tool.',
              'UNAUTHENTICATED'
            );
          }

          assertToolPermission(context, definition);
          const result = await handler(context, args);

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
            ...(result && typeof result === 'object' ? { structuredData: result } : {}),
            ...(result?._meta ? { _meta: result._meta } : {}),
          };
        }
      );
    }

    // 2. Register Resources
    for (const [uri, { definition, handler }] of this.registeredResources) {
      server.registerResource(
        definition.name,
        uri,
        {
          description: definition.description,
          mimeType: definition.mimeType,
        },
        async (resourceUri, extra) => {
          const context = authInfo || extra?.authInfo || extra?.context;

          if (!context) {
            throw new AuthenticationError(
              'Authentication context required to read MCP resource.',
              'UNAUTHENTICATED'
            );
          }

          assertToolPermission(context, definition);
          const result = await handler(context, resourceUri);

          if (result && Array.isArray(result.contents)) {
            return result;
          }

          return {
            contents: [
              {
                uri: typeof resourceUri === 'string' ? resourceUri : resourceUri.href,
                mimeType: definition.mimeType || 'application/json',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          };
        }
      );
    }

    // 3. Register Prompts
    for (const [promptName, { definition, handler }] of this.registeredPrompts) {
      server.registerPrompt(
        promptName,
        {
          description: definition.description,
          argsSchema: toMcpInputSchema(definition.argsSchema),
        },
        async (args, extra) => {
          const context = authInfo || extra?.authInfo || extra?.context;

          if (!context) {
            throw new AuthenticationError(
              'Authentication context required to generate MCP prompt.',
              'UNAUTHENTICATED'
            );
          }

          assertToolPermission(context, definition);
          const result = await handler(context, args);

          if (result && Array.isArray(result.messages)) {
            return result;
          }

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
              },
            ],
          };
        }
      );
    }

    return server;
  }

  /**
   * Initializes the official MCP request handler.
   *
   * @returns {Promise<object>} Initialized handler object
   */
  async start() {
    if (this.isStarted && this.handler) {
      return this.handler;
    }

    this.handler = createMcpHandler(async (params) => this.buildServerInstance(params), {
      legacy: 'allow',
      responseMode: 'json',
    });

    this.isStarted = true;
    return this.handler;
  }

  /**
   * Closes the MCP server handler cleanly.
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.isStarted) {
      return;
    }

    if (this.handler?.close) {
      await this.handler.close();
      this.handler = null;
    }

    this.isStarted = false;
  }
}

export {
  registerCareerReadTools,
  registerCareerArtifactTools,
  registerCareerWriteTools,
  registerCareerTrackingTools,
  registerJobWorkflowTools,
  registerCareerProfileTools,
  registerCareerMcpApps,
  registerCareerResources,
  registerCareerPrompts,
};

/**
 * Factory function creating a configured MCP server wrapper instance with career read, artifact, write, tracking, job workflow, profile tools, resources, and prompts pre-registered.
 *
 * @param {object} [options={}] Server configuration overrides and tool dependencies
 * @returns {McpServerWrapper} Configured MCP server instance with career tools
 */
export function createCareerMcpServer(options = {}) {
  const server = new McpServerWrapper(options);
  const toolDeps = options.deps || options.toolDependencies || {};
  registerCareerReadTools(server, toolDeps);
  registerCareerArtifactTools(server, toolDeps);
  registerCareerWriteTools(server, toolDeps);
  registerCareerTrackingTools(server, toolDeps);
  registerJobWorkflowTools(server, toolDeps);
  registerCareerProfileTools(server, toolDeps);
  registerCareerMcpApps(server, toolDeps);
  registerCareerResources(server, toolDeps);
  registerCareerPrompts(server, toolDeps);
  return server;
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
