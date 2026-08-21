/**
 * @file Resource Connection Lifecycle Service
 *
 * Core business orchestration for /connections lifecycle operations:
 * - Listing & detailed inspection with zero credential leakage
 * - Connection health testing via provider connectors
 * - Best-effort upstream revocation & cryptographic credential scrubbing on disconnect
 * - Permanent deletion with cascade enforcement
 * - User-creator & tenant role-based authorization
 * - Audit logging with strict data sanitization
 * - In-memory rate limiting for health test operations
 */

import { db as defaultDb } from '../db/index.js';
import {
  listConnectionsByTenant,
  findConnectionByIdAndTenant,
  updateConnectionMetadata,
  disconnectConnectionRecord,
  deleteConnectionRecord,
  writeAuditRecord,
} from '../db/repositories/connection.repository.js';
import {
  connectorRegistry as defaultConnectorRegistry,
  CONNECTOR_CAPABILITIES,
  ConnectionNotFoundError,
  ConnectorAuthError,
} from '../connectors/index.js';
import { decryptSecret, encryptSecret } from '../security/encryption.js';
import { sanitizeAuditDetails } from '../utils/audit-sanitizer.js';
import {
  authorizeResourceAccess,
  createTrustedConnectorContext,
} from '../security/resource-authorization.js';
import { ConflictError, AuthenticationError, RateLimitError } from '../errors/index.js';

export class ConnectionService {
  /**
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [database=defaultDb]
   * @param {import('../connectors/registry/connector-registry.js').ConnectorRegistry} [registry=defaultConnectorRegistry]
   */
  constructor(database = defaultDb, registry = defaultConnectorRegistry) {
    this.db = database;
    this.registry = registry;
    /** @type {Map<string, number[]>} Rate limit window tracking: key -> timestamp[] */
    this.testRateLimitWindows = new Map();
  }

  /**
   * Checks whether the user has permission to mutate (test, disconnect, delete) a connection.
   * Rule: User must be workspace OWNER OR the connection creator (userId === connection.userId).
   *
   * @param {{id: string, role: string}} user
   * @param {{userId: string, tenantId: string}} connection
   * @param {string} [tenantId]
   * @throws {AuthorizationError} If permission is denied
   */
  assertCanMutateConnection(user, connection, tenantId) {
    authorizeResourceAccess({
      user,
      tenantId: tenantId || connection.tenantId,
      resource: connection,
      action: 'mutate',
      requireCreator: true,
    });
  }

  /**
   * Enforces 10 requests per minute rate limit per user/connection for health test execution.
   *
   * @param {string} userId
   * @param {string} connectionId
   * @throws {RateLimitError} If limit is exceeded
   */
  enforceTestRateLimit(userId, connectionId) {
    const key = `${userId}:${connectionId}`;
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 10;

    let timestamps = this.testRateLimitWindows.get(key) || [];
    timestamps = timestamps.filter((ts) => now - ts < windowMs);

    if (timestamps.length >= maxRequests) {
      throw new RateLimitError(
        'Test rate limit exceeded for this connection. Maximum 10 requests per minute.',
        'RATE_LIMITED'
      );
    }

    timestamps.push(now);
    this.testRateLimitWindows.set(key, timestamps);
  }

  /**
   * Cleans internal rate limit windows (primarily for tests).
   */
  clearRateLimits() {
    this.testRateLimitWindows.clear();
  }

  /**
   * Formats a raw database row into a safe summary model.
   *
   * @param {any} row
   * @returns {any}
   */
  toSummaryModel(row) {
    return {
      id: row.id,
      provider: row.provider,
      authType: row.authType,
      displayName: row.displayName,
      externalAccountId: row.externalAccountId,
      externalAccountName: row.externalAccountName || null,
      installationId: row.installationId || null,
      status: row.status,
      scopes: Array.isArray(row.scopes) ? row.scopes : [],
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      refreshedAt: row.refreshedAt ? new Date(row.refreshedAt) : null,
      lastValidatedAt: row.lastValidatedAt ? new Date(row.lastValidatedAt) : null,
      lastErrorCode: row.lastErrorCode || null,
      lastErrorAt: row.lastErrorAt ? new Date(row.lastErrorAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  /**
   * Formats a raw database row into a safe detailed model.
   *
   * @param {any} row
   * @returns {any}
   */
  toDetailModel(row) {
    return {
      ...this.toSummaryModel(row),
      userId: row.userId,
      metadata: row.metadata || {},
    };
  }

  /**
   * Records a sanitized audit event in the database.
   *
   * @param {object} params
   */
  async recordAudit(params) {
    try {
      const sanitizedDetails = sanitizeAuditDetails(params.details || {});
      await writeAuditRecord(this.db, {
        tenantId: params.tenantId,
        userId: params.userId,
        eventType: params.eventType,
        resourceId: params.resourceId,
        requestId: params.requestId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        details: sanitizedDetails,
      });
    } catch {
      // Audit failures should not crash business operations but should be noted
    }
  }

  /**
   * Lists all resource connections for a tenant.
   *
   * @param {{id: string, role: string}} _user
   * @param {string} tenantId
   * @param {object} [options]
   * @returns {Promise<{items: Array<any>, pagination: object}>}
   */
  async listConnections(_user, tenantId, options = {}) {
    const result = await listConnectionsByTenant(this.db, tenantId, options);
    const summaries = result.items.map((row) => this.toSummaryModel(row));

    return {
      items: summaries,
      pagination: {
        cursor: options.cursor || null,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        limit: options.limit || 50,
        totalCount: result.totalCount,
      },
    };
  }

  /**
   * Retrieves detailed metadata for a single connection.
   *
   * @param {{id: string, role: string}} _user
   * @param {string} tenantId
   * @param {string} connectionId
   * @returns {Promise<any>}
   */
  async getConnection(_user, tenantId, connectionId) {
    const connection = await findConnectionByIdAndTenant(this.db, connectionId, tenantId);
    if (!connection) {
      throw new ConnectionNotFoundError(connectionId, tenantId);
    }

    return this.toDetailModel(connection);
  }

  /**
   * Tests the authorization health of an active resource connection against the upstream provider.
   *
   * @param {{id: string, role: string}} user
   * @param {string} tenantId
   * @param {string} connectionId
   * @param {object} [requestContext]
   * @returns {Promise<any>}
   */
  async testConnection(user, tenantId, connectionId, requestContext = {}) {
    this.enforceTestRateLimit(user.id, connectionId);

    const connection = await findConnectionByIdAndTenant(this.db, connectionId, tenantId);
    if (!connection) {
      throw new ConnectionNotFoundError(connectionId, tenantId);
    }

    this.assertCanMutateConnection(user, connection);

    if (connection.status === 'DISCONNECTED') {
      throw new ConflictError(
        'Cannot test a disconnected resource connection. Please reconnect.',
        'CONNECTION_INACTIVE'
      );
    }

    if (connection.status === 'REVOKED') {
      throw new AuthenticationError(
        'Resource connection authorization has been revoked upstream. Reconnection required.',
        'CONNECTION_REVOKED'
      );
    }

    // Transiently decrypt credentials
    let credentials;
    try {
      const decryptedString = decryptSecret(connection.encryptedCredentials);
      credentials = JSON.parse(decryptedString);
    } catch {
      await updateConnectionMetadata(this.db, connectionId, tenantId, {
        status: 'ERROR',
        lastValidatedAt: new Date(),
        lastErrorCode: 'CORRUPTED_CREDENTIALS',
        lastErrorAt: new Date(),
      });
      throw new AuthenticationError(
        'Stored credentials could not be decrypted or are corrupted',
        'CREDENTIAL_DECRYPTION_FAILED'
      );
    }

    const connector = this.registry.get(connection.provider);
    const context = createTrustedConnectorContext({
      user,
      tenantId,
      connection,
      requestId: requestContext.requestId,
    });

    try {
      const validationResult = await connector.validate(context, credentials);

      await updateConnectionMetadata(this.db, connectionId, tenantId, {
        status: 'ACTIVE',
        lastValidatedAt: new Date(),
        lastErrorCode: null,
        lastErrorAt: null,
      });

      await this.recordAudit({
        tenantId,
        userId: user.id,
        eventType: 'connection.tested',
        resourceId: connectionId,
        requestId: requestContext.requestId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        details: { provider: connection.provider, healthy: true },
      });

      return {
        connectionId,
        provider: connection.provider,
        healthy: true,
        status: 'ACTIVE',
        message: validationResult?.message || 'Connection validated successfully',
        validatedAt: new Date(),
        errorCode: null,
      };
    } catch (err) {
      const isAuthFail = err instanceof ConnectorAuthError || err.statusCode === 401;
      const nextStatus = isAuthFail ? 'REVOKED' : 'ERROR';
      const errorCode = err.code || (isAuthFail ? 'CONNECTOR_AUTH_FAILED' : 'PROVIDER_ERROR');

      await updateConnectionMetadata(this.db, connectionId, tenantId, {
        status: nextStatus,
        lastValidatedAt: new Date(),
        lastErrorCode: errorCode,
        lastErrorAt: new Date(),
      });

      await this.recordAudit({
        tenantId,
        userId: user.id,
        eventType: 'connection.test_failed',
        resourceId: connectionId,
        requestId: requestContext.requestId,
        ipAddress: requestContext.ipAddress,
        userAgent: requestContext.userAgent,
        details: { provider: connection.provider, healthy: false, errorCode },
      });

      throw err;
    }
  }

  /**
   * Disconnects a connection, attempts upstream revocation, scrubs local credentials,
   * and marks the status as DISCONNECTED. (Idempotent)
   *
   * @param {{id: string, role: string}} user
   * @param {string} tenantId
   * @param {string} connectionId
   * @param {object} [requestContext]
   * @returns {Promise<any>}
   */
  async disconnectConnection(user, tenantId, connectionId, requestContext = {}) {
    const connection = await findConnectionByIdAndTenant(this.db, connectionId, tenantId);
    if (!connection) {
      throw new ConnectionNotFoundError(connectionId, tenantId);
    }

    this.assertCanMutateConnection(user, connection);

    // Idempotency: If already disconnected, return immediately
    if (connection.status === 'DISCONNECTED') {
      return {
        connectionId,
        provider: connection.provider,
        status: 'DISCONNECTED',
        message: 'Connection is already disconnected',
        updatedAt: connection.updatedAt,
      };
    }

    // Best-effort upstream revocation if connector supports it
    let upstreamRevoked = false;
    try {
      if (this.registry.has(connection.provider)) {
        const connector = this.registry.get(connection.provider);
        if (connector.getCapabilities().has(CONNECTOR_CAPABILITIES.REVOKE_ACCESS)) {
          const decrypted = decryptSecret(connection.encryptedCredentials);
          const credentials = JSON.parse(decrypted);
          const ctx = createTrustedConnectorContext({
            user,
            tenantId,
            connection,
            requestId: requestContext.requestId,
          });
          await connector.revokeAccess(ctx, credentials);
          upstreamRevoked = true;
        }
      }
    } catch {
      // Best-effort: upstream revocation errors do not block local disconnect
      upstreamRevoked = false;
    }

    // Overwrite stored ciphertext with un-usable scrubbed package
    const scrubbedPayload = JSON.stringify({
      disconnected: true,
      scrubbedAt: new Date().toISOString(),
    });
    const scrubbedCiphertext = encryptSecret(scrubbedPayload);

    const updated = await disconnectConnectionRecord(
      this.db,
      connectionId,
      tenantId,
      scrubbedCiphertext
    );

    await this.recordAudit({
      tenantId,
      userId: user.id,
      eventType: 'connection.disconnected',
      resourceId: connectionId,
      requestId: requestContext.requestId,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      details: {
        provider: connection.provider,
        externalAccountId: connection.externalAccountId,
        upstreamRevoked,
      },
    });

    return {
      connectionId,
      provider: connection.provider,
      status: 'DISCONNECTED',
      message: 'Connection disconnected successfully and credentials purged',
      updatedAt: updated?.updatedAt || new Date(),
    };
  }

  /**
   * Permanently deletes a resource connection from the database.
   *
   * @param {{id: string, role: string}} user
   * @param {string} tenantId
   * @param {string} connectionId
   * @param {object} [requestContext]
   * @returns {Promise<any>}
   */
  async deleteConnection(user, tenantId, connectionId, requestContext = {}) {
    const connection = await findConnectionByIdAndTenant(this.db, connectionId, tenantId);
    if (!connection) {
      throw new ConnectionNotFoundError(connectionId, tenantId);
    }

    this.assertCanMutateConnection(user, connection);

    await deleteConnectionRecord(this.db, connectionId, tenantId);

    await this.recordAudit({
      tenantId,
      userId: user.id,
      eventType: 'connection.deleted',
      resourceId: connectionId,
      requestId: requestContext.requestId,
      ipAddress: requestContext.ipAddress,
      userAgent: requestContext.userAgent,
      details: {
        provider: connection.provider,
        externalAccountId: connection.externalAccountId,
      },
    });

    return {
      connectionId,
      provider: connection.provider,
      status: 'DELETED',
      message: 'Connection permanently deleted',
      updatedAt: new Date(),
    };
  }
}

export const connectionService = new ConnectionService();
