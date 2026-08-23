/**
 * @file Model Context Protocol (MCP) Fastify Route Plugin.
 *
 * Exposes Streamable HTTP endpoint for JSON-RPC 2.0 MCP requests (POST /mcp).
 * Handles:
 * 1. Request correlation (x-request-id).
 * 2. Payload size & prototype pollution defenses.
 * 3. Bearer token authentication & McpRequestContext minting.
 * 4. Dispatch to official StreamableHTTPServerTransport.
 * 5. Structured JSON-RPC 2.0 error mapping & sanitized audit logging.
 */

import { createMcpServer, mapErrorToMcpResponse } from '../mcp/server.js';
import { authenticateMcpRequest } from '../security/mcp-auth.js';
import { ValidationError } from '../errors/index.js';

/**
 * Checks for prototype pollution attempts in JSON payloads.
 *
 * @param {any} obj Object to inspect
 * @throws {ValidationError} If prototype pollution keys are detected
 */
function assertNoPrototypePollution(obj) {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  const keys = Object.getOwnPropertyNames(obj);
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new ValidationError(
        'Malformed request: illegal prototype property detected.',
        'PROTOTYPE_POLLUTION'
      );
    }

    if (typeof obj[key] === 'object' && obj[key] !== null) {
      assertNoPrototypePollution(obj[key]);
    }
  }
}

/**
 * Fastify plugin registering the Model Context Protocol (MCP) endpoint.
 *
 * @param {import('fastify').FastifyInstance} fastify Fastify instance
 * @param {object} [opts={}] Plugin options
 * @param {import('../mcp/server.js').McpServerWrapper} [opts.mcpServer] Optional custom MCP server wrapper instance
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [opts.db] Optional database client override
 */
export async function mcpRoutes(fastify, opts = {}) {
  const mcpServer = opts.mcpServer || createMcpServer();
  const db = opts.db || fastify.db;

  // Ensure transport is initialized
  await mcpServer.start();

  // Fastify route handler for MCP Streamable HTTP transport
  fastify.post(
    '/',
    {
      bodyLimit: 1048576, // 1 MB request size limit
    },
    async (req, reply) => {
      const startTime = Date.now();
      const requestId = req.id;
      let context = null;

      try {
        // Set correlation header on raw reply before any streaming or response
        reply.raw.setHeader('x-request-id', requestId);

        // 1. Prototype pollution guard
        if (req.body) {
          assertNoPrototypePollution(req.body);
        }

        // 2. Authenticate request & mint sovereign McpRequestContext
        context = await authenticateMcpRequest(req, { db });

        // 3. Attach trusted context for official StreamableHTTPServerTransport
        req.raw.auth = context;
        req.mcpContext = context;

        // 4. Delegate to official MCP transport
        reply.hijack();
        await mcpServer.transport.handleRequest(req.raw, reply.raw, req.body);

        // 5. Emit audit event on completion
        const durationMs = Date.now() - startTime;
        req.log.info(
          {
            event: 'mcp.tool.completed',
            tenantId: context.tenantId,
            userId: context.userId,
            role: context.role,
            requestId,
            durationMs,
            statusCode: reply.raw.statusCode || 200,
          },
          'MCP request completed successfully'
        );
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const mappedError = mapErrorToMcpResponse(err, requestId);
        const statusCode =
          err.statusCode ||
          (mappedError.code === -32001
            ? 401
            : mappedError.code === -32003
              ? 403
              : mappedError.code === -32004
                ? 404
                : mappedError.code === -32602
                  ? 400
                  : 500);

        req.log.warn(
          {
            event: 'mcp.tool.failed',
            tenantId: context?.tenantId || null,
            userId: context?.userId || null,
            requestId,
            durationMs,
            statusCode,
            errorCode: mappedError.code,
            errorMessage: mappedError.message,
          },
          'MCP request failed'
        );

        if (!reply.raw.headersSent) {
          reply.raw.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'x-request-id': requestId,
          });

          const errorPayload = {
            jsonrpc: '2.0',
            id: req.body?.id !== undefined ? req.body.id : null,
            error: mappedError,
          };

          reply.raw.end(JSON.stringify(errorPayload));
        }
      }
    }
  );

  // Clean shutdown hook
  fastify.addHook('onClose', async () => {
    await mcpServer.close();
  });
}

export default mcpRoutes;
