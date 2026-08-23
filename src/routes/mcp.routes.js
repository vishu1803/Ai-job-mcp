/**
 * @file Model Context Protocol (MCP) Fastify Route Plugin (2026-07-28 Standard).
 *
 * Exposes Streamable HTTP endpoint for JSON-RPC 2.0 MCP requests (POST /mcp).
 * Handles:
 * 1. Request correlation (x-request-id).
 * 2. Payload size & prototype pollution defenses.
 * 3. Content negotiation & header-based routing validation.
 * 4. Multi-tier rate limiting (IP, Tenant, Tool compute budget).
 * 5. Bearer token authentication & McpRequestContext minting.
 * 6. Dispatch to official @modelcontextprotocol/server v2 handler.
 * 7. Structured JSON-RPC 2.0 error mapping & sanitized audit logging.
 */

import { createCareerMcpServer, mapErrorToMcpResponse } from '../mcp/server.js';
import { authenticateMcpRequest } from '../security/mcp-auth.js';
import { defaultMcpRateLimiter } from '../security/mcp-rate-limiter.js';
import { ValidationError, AppError } from '../errors/index.js';

/**
 * Checks for prototype pollution attempts and excessive nesting depth in JSON payloads.
 *
 * @param {any} obj Object to inspect
 * @param {number} [depth=0] Current recursion depth
 * @throws {ValidationError} If prototype pollution keys or excessive depth are detected
 */
function assertNoPrototypePollution(obj, depth = 0) {
  if (depth > 32) {
    throw new ValidationError(
      'Malformed request: payload exceeds maximum nesting depth.',
      'EXCESSIVE_DEPTH'
    );
  }

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
      assertNoPrototypePollution(obj[key], depth + 1);
    }
  }
}

/**
 * Validates header routing against payload body declarations.
 *
 * @param {import('fastify').FastifyRequest} req Fastify request
 * @throws {ValidationError} If headers mismatch or are invalid
 */
function validateHeaderRouting(req) {
  const methodHeader = req.headers['mcp-method'];
  const nameHeader = req.headers['mcp-name'];
  const versionHeader = req.headers['mcp-protocol-version'];
  const body = req.body;

  // 1. Content-Type check
  const contentType = req.headers['content-type'];
  if (contentType && !contentType.includes('application/json')) {
    throw new AppError(
      'Unsupported Media Type: Content-Type must be application/json.',
      415,
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }

  // 2. Protocol Version check
  if (versionHeader && versionHeader !== '2026-07-28' && versionHeader !== '2025-11-25') {
    throw new ValidationError(
      `Unsupported protocol version "${versionHeader}". Supported: 2026-07-28, 2025-11-25.`,
      'UNSUPPORTED_PROTOCOL_VERSION'
    );
  }

  // 3. Mcp-Method header agreement
  if (methodHeader && body && body.method && methodHeader !== body.method) {
    throw new ValidationError(
      `Header Mcp-Method "${methodHeader}" does not match payload method "${body.method}".`,
      'HEADER_METHOD_MISMATCH'
    );
  }

  // 4. Mcp-Name header agreement
  if (body && body.method === 'tools/call' && body.params?.name) {
    if (nameHeader && nameHeader !== body.params.name) {
      throw new ValidationError(
        `Header Mcp-Name "${nameHeader}" does not match tool name "${body.params.name}".`,
        'HEADER_NAME_MISMATCH'
      );
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
 * @param {import('../security/mcp-rate-limiter.js').McpRateLimiter} [opts.rateLimiter] Optional rate limiter override
 * @param {import('../services/mcp-api-token.service.js').McpApiTokenService} [opts.tokenService] Optional token service override
 */
export async function mcpRoutes(fastify, opts = {}) {
  const db = opts.db || fastify.db;
  const mcpServer = opts.mcpServer || createCareerMcpServer({ deps: { db } });
  const rateLimiter = opts.rateLimiter || defaultMcpRateLimiter;
  const tokenService = opts.tokenService || fastify.tokenService;

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

        // 1. IP Rate Limiting Tier
        const clientIp =
          req.ip || /** @type {string} */ (req.headers['x-forwarded-for']) || '127.0.0.1';
        rateLimiter.checkIpLimit(clientIp);

        // 2. Prototype pollution & abuse guard
        if (req.body) {
          assertNoPrototypePollution(req.body);
        }

        // 3. Header routing & Content-Type validation
        validateHeaderRouting(req);

        // 4. Authenticate request & mint sovereign McpRequestContext
        context = await authenticateMcpRequest(req, { db, tokenService });

        // 5. Tenant & Tool Compute Rate Limiting Tiers
        rateLimiter.checkTenantLimit(context.tenantId);
        if (req.body?.method === 'tools/call' && req.body?.params?.name) {
          rateLimiter.checkToolLimit(context.tenantId, req.body.params.name);
        }

        // 6. Convert Fastify request to Web Standard Request
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

        // 7. Delegate to official MCP v2 handler
        const webRes = await mcpServer.handler.fetch(webReq, {
          authInfo: context,
          parsedBody: req.body,
        });

        // 8. Transfer response back to Fastify
        reply.status(webRes.status);
        for (const [k, v] of webRes.headers.entries()) {
          reply.header(k, v);
        }
        reply.header('x-request-id', requestId);

        const responseText = await webRes.text();

        // 9. Emit audit log
        const durationMs = Date.now() - startTime;
        req.log.info(
          {
            event: 'mcp.tool.completed',
            tenantId: context.tenantId,
            userId: context.userId,
            role: context.role,
            toolName: req.body?.params?.name || undefined,
            requestId,
            durationMs,
            statusCode: webRes.status,
            clientIp,
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
                : mappedError.code === -32029
                  ? 429
                  : mappedError.code === -32602
                    ? 400
                    : 500);

        req.log.warn(
          {
            event:
              mappedError.code === -32003 || mappedError.code === -32029
                ? 'mcp.tool.denied'
                : 'mcp.tool.failed',
            tenantId: context?.tenantId || null,
            userId: context?.userId || null,
            role: context?.role || undefined,
            toolName: req.body?.params?.name || undefined,
            requestId,
            durationMs,
            statusCode,
            errorCode: mappedError.code,
            errorMessage: mappedError.message,
            clientIp: req.ip || undefined,
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
