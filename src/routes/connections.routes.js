/**
 * @file Fastify Resource Connection Lifecycle Routes
 *
 * Implements HTTP endpoints for:
 * 1. GET /connections — List connection summaries with pagination and filters
 * 2. GET /connections/:id — Get detailed connection metadata
 * 3. POST /connections/:id/test — Run authorization health check against upstream provider
 * 4. POST /connections/:id/disconnect — Deactivate connection, purge credentials, best-effort revoke
 * 5. DELETE /connections/:id — Permanently delete connection record from workspace
 */

import {
  ConnectionParamsSchema,
  ConnectionListQuerySchema,
  ConnectionListResponseSchema,
  ConnectionDetailSchema,
  ConnectionTestResultSchema,
  ConnectionMutationResultSchema,
} from './connections.schemas.js';
import { connectionService as defaultConnectionService } from '../services/connection.service.js';
import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { validateRequest, validateResponse } from '../middleware/validate.js';

/**
 * Fastify plugin registering the resource connection routes.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} [opts]
 * @param {import('../services/connection.service.js').ConnectionService} [opts.connectionService]
 */
export async function connectionsRoutes(fastify, opts = {}) {
  const service = opts.connectionService || defaultConnectionService;

  // Enforce session authentication & CSRF validation across all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', verifyCsrf);

  // -------------------------------------------------------------------------
  // 1. GET /connections — List Connections
  // -------------------------------------------------------------------------
  fastify.get(
    '/',
    {
      preHandler: [validateRequest({ query: ConnectionListQuerySchema })],
      preSerialization: validateResponse(ConnectionListResponseSchema),
    },
    async (request, _reply) => {
      const { user, tenant } = request;
      const { provider, status, cursor, limit } = request.query;

      return service.listConnections(user, tenant.id, {
        provider,
        status,
        cursor,
        limit,
      });
    }
  );

  // -------------------------------------------------------------------------
  // 2. GET /connections/:id — Get Connection Detail
  // -------------------------------------------------------------------------
  fastify.get(
    '/:id',
    {
      preHandler: [validateRequest({ params: ConnectionParamsSchema })],
      preSerialization: validateResponse(ConnectionDetailSchema),
    },
    async (request, _reply) => {
      const { user, tenant } = request;
      const { id } = request.params;

      return service.getConnection(user, tenant.id, id);
    }
  );

  // -------------------------------------------------------------------------
  // 3. POST /connections/:id/test — Validate Upstream Connection Health
  // -------------------------------------------------------------------------
  fastify.post(
    '/:id/test',
    {
      preHandler: [validateRequest({ params: ConnectionParamsSchema })],
      preSerialization: validateResponse(ConnectionTestResultSchema),
    },
    async (request, _reply) => {
      const { user, tenant } = request;
      const { id } = request.params;

      return service.testConnection(user, tenant.id, id, {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
  );

  // -------------------------------------------------------------------------
  // 4. POST /connections/:id/disconnect — Disconnect Connection & Purge Credentials
  // -------------------------------------------------------------------------
  fastify.post(
    '/:id/disconnect',
    {
      preHandler: [validateRequest({ params: ConnectionParamsSchema })],
      preSerialization: validateResponse(ConnectionMutationResultSchema),
    },
    async (request, _reply) => {
      const { user, tenant } = request;
      const { id } = request.params;

      return service.disconnectConnection(user, tenant.id, id, {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
  );

  // -------------------------------------------------------------------------
  // 5. DELETE /connections/:id — Permanently Delete Connection Record
  // -------------------------------------------------------------------------
  fastify.delete(
    '/:id',
    {
      preHandler: [validateRequest({ params: ConnectionParamsSchema })],
      preSerialization: validateResponse(ConnectionMutationResultSchema),
    },
    async (request, _reply) => {
      const { user, tenant } = request;
      const { id } = request.params;

      return service.deleteConnection(user, tenant.id, id, {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
  );
}

export default connectionsRoutes;
