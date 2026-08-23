/**
 * @file Model Context Protocol (MCP) Fastify Route Plugin (2026-07-28 Standard).
 *
 * Exposes Streamable HTTP endpoint for JSON-RPC 2.0 MCP requests (POST /mcp).
 * Handles:
 * 1. Request correlation (x-request-id).
 * 2. Payload size & prototype pollution defenses.
 * 3. Bearer token authentication & McpRequestContext minting.
 * 4. Dispatch to official @modelcontextprotocol/server v2 handler.
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

  // Ensure MCP handler is initialized
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
        // Set correlation header
        reply.header('x-request-id', requestId);

        // 1. Prototype pollution guard
        if (req.body) {
          assertNoPrototypePollution(req.body);
        }

        // 2. Authenticate request & mint sovereign McpRequestContext
        context = await authenticateMcpRequest(req, { db });

        // 3. Convert Fastify request to Web Standard Request
        const webHeaders = new globalThis.Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v !== undefined) {
            if (Array.isArray(v)) {
              v.forEach((item) => webHeaders.append(k, item));
            } else {
              webHeaders.set(k, v);
            }
          }
        }
        webHeaders.set('x-request-id', requestId);

        const url = 'http://' + (req.headers.host || 'localhost') + req.url;
        const webReq = new globalThis.Request(url, {
          method: req.method,
          headers: webHeaders,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body),
        });

        // 4. Delegate to official MCP v2 handler
        const webRes = await mcpServer.handler.fetch(webReq, {
          authInfo: context,
          parsedBody: req.body,
        });

        // 5. Transfer response back to Fastify
        reply.status(webRes.status);
        for (const [k, v] of webRes.headers.entries()) {
          reply.header(k, v);
        }
        reply.header('x-request-id', requestId);

        const responseText = await webRes.text();

        // 6. Emit audit log
        const durationMs = Date.now() - startTime;
        req.log.info(
          {
            event: 'mcp.tool.completed',
            tenantId: context.tenantId,
            userId: context.userId,
            role: context.role,
            requestId,
            durationMs,
            statusCode: webRes.status,
          },
          'MCP request completed'
        );

        return reply.send(responseText);
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

        reply.status(statusCode);
        reply.header('content-type', 'application/json');
        reply.header('x-request-id', requestId);

        return reply.send({
          jsonrpc: '2.0',
          id: req.body?.id !== undefined ? req.body.id : null,
          error: mappedError,
        });
      }
    }
  );

  // Clean shutdown hook
  fastify.addHook('onClose', async () => {
    await mcpServer.close();
  });
}

export default mcpRoutes;
