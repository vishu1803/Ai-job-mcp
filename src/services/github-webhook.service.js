/**
 * @file GitHub App Webhook Processing Service (Task P3-003)
 *
 * Implements:
 * 1. Webhook header validation & cryptographic HMAC-SHA256 signature verification
 * 2. In-memory delivery deduplication via X-GitHub-Delivery (24-hour TTL)
 * 3. Authoritative tenant resolution via installation.id lookup in resource_connections
 * 4. Safe monotonic installation lifecycle synchronization (deleted, suspend, unsuspend, created)
 * 5. Repository selection metadata synchronization (added, removed)
 * 6. Partitioned in-memory token cache eviction (GitHubTokenCache)
 * 7. Structured audit logging without secret or token leakage
 */

import { eq, and, ne } from 'drizzle-orm';
import { resourceConnections } from '../db/schema.js';
import {
  findConnectionByInstallationId,
  writeAuditRecord,
} from '../db/repositories/connection.repository.js';
import { verifyWebhookSignature } from '../security/webhook-signature.js';
import { defaultWebhookDeliveryCache } from './webhook-delivery-cache.js';
import { ValidationError } from '../errors/index.js';
import { db as defaultDb } from '../db/index.js';
import { config } from '../config/env.js';

export class GitHubWebhookService {
  /**
   * @param {object} [options]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db]
   * @param {import('../connectors/github/token-cache.js').GitHubTokenCache} [options.tokenCache]
   * @param {import('./webhook-delivery-cache.js').WebhookDeliveryCache} [options.deliveryCache]
   * @param {string} [options.webhookSecret]
   */
  constructor({
    db,
    tokenCache = null,
    deliveryCache = defaultWebhookDeliveryCache,
    webhookSecret = config.GITHUB_APP_WEBHOOK_SECRET || config.GITHUB_WEBHOOK_SECRET,
  } = {}) {
    this.db = db || defaultDb;
    this.tokenCache = tokenCache;
    this.deliveryCache = deliveryCache;
    this.webhookSecret = webhookSecret;
  }

  /**
   * Processes an incoming GitHub webhook request.
   *
   * @param {object} params
   * @param {Record<string, string | string[] | undefined>} params.headers - HTTP request headers
   * @param {Buffer | string} params.rawBody - Raw unparsed request body Buffer
   * @param {any} params.payload - Parsed JSON webhook payload
   * @param {object} [params.reqContext] - Request metadata (ipAddress, userAgent, requestId)
   * @returns {Promise<object>} Processing outcome result
   */
  async processWebhook({ headers, rawBody, payload, reqContext = {} }) {
    // 1. Extract and validate required headers
    const eventType = headers['x-github-event'];
    const deliveryId = headers['x-github-delivery'];
    const signatureHeader = headers['x-hub-signature-256'];
    const hookId = headers['x-github-hook-id'];

    if (!eventType || typeof eventType !== 'string') {
      throw new ValidationError('Missing or invalid X-GitHub-Event header', 'MISSING_EVENT_HEADER');
    }

    if (!deliveryId || typeof deliveryId !== 'string') {
      throw new ValidationError(
        'Missing or invalid X-GitHub-Delivery header',
        'MISSING_DELIVERY_HEADER'
      );
    }

    // 2. Cryptographic signature verification over raw request body bytes
    verifyWebhookSignature(rawBody, signatureHeader, this.webhookSecret);

    // 3. Delivery deduplication check (24-hour in-memory idempotency cache)
    if (this.deliveryCache.has(deliveryId)) {
      return {
        success: true,
        duplicate: true,
        event: eventType,
        deliveryId,
      };
    }

    // Record delivery ID in cache
    this.deliveryCache.set(deliveryId);

    // 4. Validate payload object
    if (!payload || typeof payload !== 'object') {
      throw new ValidationError('Invalid or empty webhook JSON payload', 'INVALID_PAYLOAD');
    }

    // 5. Route event to dedicated handlers
    if (eventType === 'ping') {
      return {
        success: true,
        ping: true,
        hookId: payload.hook_id || hookId,
        deliveryId,
      };
    }

    if (eventType === 'installation') {
      return await this.handleInstallationEvent(payload, deliveryId, reqContext);
    }

    if (eventType === 'installation_repositories') {
      return await this.handleInstallationRepositoriesEvent(payload, deliveryId, reqContext);
    }

    // Acknowledge validly signed but unsupported/deferred events safely
    return {
      success: true,
      ignored: true,
      event: eventType,
      action: payload.action || null,
      reason: 'unsupported_event',
      deliveryId,
    };
  }

  /**
   * Handles GitHub App `installation` lifecycle events:
   * - `deleted`: marks connection REVOKED, evicts token cache, writes audit log
   * - `suspend`: marks connection REVOKED, evicts token cache, writes audit log
   * - `unsuspend`: restores connection to ACTIVE, clears error codes, writes audit log
   * - `created`: handles out-of-band install safely without inventing tenant binding
   *
   * @param {object} payload
   * @param {string} deliveryId
   * @param {object} reqContext
   * @returns {Promise<object>}
   */
  async handleInstallationEvent(payload, deliveryId, reqContext) {
    const installationId = payload.installation?.id;
    if (!installationId) {
      throw new ValidationError(
        'Missing installation.id in installation webhook payload',
        'INVALID_PAYLOAD'
      );
    }

    const action = payload.action;
    const connection = await findConnectionByInstallationId(this.db, installationId);

    // Case: Unlinked installation (no workspace tenant connection found in DB)
    if (!connection) {
      return {
        success: true,
        unlinked: true,
        event: 'installation',
        action,
        installationId: String(installationId),
        deliveryId,
      };
    }

    const tenantId = connection.tenantId;

    switch (action) {
      case 'deleted': {
        // Update connection status to REVOKED with error code
        await this.db
          .update(resourceConnections)
          .set({
            status: 'REVOKED',
            lastErrorCode: 'APP_UNINSTALLED',
            lastErrorAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(resourceConnections.id, connection.id),
              eq(resourceConnections.tenantId, tenantId)
            )
          );

        // Evict cached installation tokens for tenant + installation
        if (this.tokenCache) {
          this.tokenCache.evict(tenantId, installationId);
        }

        // Emit audit record
        await writeAuditRecord(this.db, {
          tenantId,
          userId: connection.userId,
          eventType: 'github.installation.deleted',
          resourceId: connection.id,
          requestId: reqContext.requestId,
          ipAddress: reqContext.ipAddress,
          userAgent: reqContext.userAgent,
          details: {
            deliveryId,
            installationId: String(installationId),
            externalAccountId: connection.externalAccountId,
            externalAccountName: connection.externalAccountName,
            previousStatus: connection.status,
          },
        });

        return {
          success: true,
          processed: true,
          event: 'installation',
          action: 'deleted',
          connectionId: connection.id,
          tenantId,
          deliveryId,
        };
      }

      case 'suspend': {
        // Update connection status to REVOKED with suspension code
        await this.db
          .update(resourceConnections)
          .set({
            status: 'REVOKED',
            lastErrorCode: 'INSTALLATION_SUSPENDED',
            lastErrorAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(resourceConnections.id, connection.id),
              eq(resourceConnections.tenantId, tenantId)
            )
          );

        // Evict cached tokens immediately
        if (this.tokenCache) {
          this.tokenCache.evict(tenantId, installationId);
        }

        // Emit audit record
        await writeAuditRecord(this.db, {
          tenantId,
          userId: connection.userId,
          eventType: 'github.installation.suspended',
          resourceId: connection.id,
          requestId: reqContext.requestId,
          ipAddress: reqContext.ipAddress,
          userAgent: reqContext.userAgent,
          details: {
            deliveryId,
            installationId: String(installationId),
            externalAccountId: connection.externalAccountId,
            suspendedAt: payload.installation?.suspended_at || new Date().toISOString(),
          },
        });

        return {
          success: true,
          processed: true,
          event: 'installation',
          action: 'suspend',
          connectionId: connection.id,
          tenantId,
          deliveryId,
        };
      }

      case 'unsuspend': {
        // If connection was soft-disconnected by user, do not force-activate
        if (connection.status === 'DISCONNECTED') {
          return {
            success: true,
            ignored: true,
            event: 'installation',
            action: 'unsuspend',
            reason: 'connection_user_disconnected',
            connectionId: connection.id,
            tenantId,
            deliveryId,
          };
        }

        // Restore status to ACTIVE and clear error codes
        await this.db
          .update(resourceConnections)
          .set({
            status: 'ACTIVE',
            lastErrorCode: null,
            lastErrorAt: null,
            lastValidatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(resourceConnections.id, connection.id),
              eq(resourceConnections.tenantId, tenantId),
              ne(resourceConnections.status, 'DISCONNECTED')
            )
          );

        // Emit audit record
        await writeAuditRecord(this.db, {
          tenantId,
          userId: connection.userId,
          eventType: 'github.installation.unsuspended',
          resourceId: connection.id,
          requestId: reqContext.requestId,
          ipAddress: reqContext.ipAddress,
          userAgent: reqContext.userAgent,
          details: {
            deliveryId,
            installationId: String(installationId),
            externalAccountId: connection.externalAccountId,
          },
        });

        return {
          success: true,
          processed: true,
          event: 'installation',
          action: 'unsuspend',
          connectionId: connection.id,
          tenantId,
          deliveryId,
        };
      }

      case 'created': {
        // Re-affirm active status if already linked to tenant
        await this.db
          .update(resourceConnections)
          .set({
            status: 'ACTIVE',
            lastValidatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(resourceConnections.id, connection.id),
              eq(resourceConnections.tenantId, tenantId)
            )
          );

        return {
          success: true,
          processed: true,
          event: 'installation',
          action: 'created',
          isUpdate: true,
          connectionId: connection.id,
          tenantId,
          deliveryId,
        };
      }

      default: {
        return {
          success: true,
          ignored: true,
          event: 'installation',
          action,
          connectionId: connection.id,
          tenantId,
          deliveryId,
        };
      }
    }
  }

  /**
   * Handles GitHub App `installation_repositories` events:
   * - `added`: updates repositorySelection metadata, evicts token cache, writes audit log
   * - `removed`: updates repositorySelection metadata, evicts token cache, writes audit log
   *
   * @param {object} payload
   * @param {string} deliveryId
   * @param {object} reqContext
   * @returns {Promise<object>}
   */
  async handleInstallationRepositoriesEvent(payload, deliveryId, reqContext) {
    const installationId = payload.installation?.id;
    if (!installationId) {
      throw new ValidationError(
        'Missing installation.id in installation_repositories webhook payload',
        'INVALID_PAYLOAD'
      );
    }

    const action = payload.action;
    const connection = await findConnectionByInstallationId(this.db, installationId);

    // Case: Unlinked installation
    if (!connection) {
      return {
        success: true,
        unlinked: true,
        event: 'installation_repositories',
        action,
        installationId: String(installationId),
        deliveryId,
      };
    }

    const tenantId = connection.tenantId;

    // Monotonic guard: Inactive connections (REVOKED, DISCONNECTED) ignore repository additions/removals
    if (connection.status === 'REVOKED' || connection.status === 'DISCONNECTED') {
      return {
        success: true,
        ignored: true,
        event: 'installation_repositories',
        action,
        reason: 'connection_inactive',
        status: connection.status,
        connectionId: connection.id,
        tenantId,
        deliveryId,
      };
    }

    // Update repositorySelection in metadata
    const currentMetadata =
      connection.metadata && typeof connection.metadata === 'object' ? connection.metadata : {};
    const repositorySelection =
      payload.repository_selection ||
      payload.installation?.repository_selection ||
      currentMetadata.repositorySelection ||
      'selected';
    const updatedMetadata = {
      ...currentMetadata,
      repositorySelection,
    };

    await this.db
      .update(resourceConnections)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(
        and(eq(resourceConnections.id, connection.id), eq(resourceConnections.tenantId, tenantId))
      );

    // Evict cached installation tokens
    if (this.tokenCache) {
      this.tokenCache.evict(tenantId, installationId);
    }

    // Emit structured audit log
    if (action === 'added') {
      const addedList = Array.isArray(payload.repositories_added) ? payload.repositories_added : [];
      const repoNames = addedList.map((r) => r.full_name || r.name).slice(0, 50);

      await writeAuditRecord(this.db, {
        tenantId,
        userId: connection.userId,
        eventType: 'github.repositories.added',
        resourceId: connection.id,
        requestId: reqContext.requestId,
        ipAddress: reqContext.ipAddress,
        userAgent: reqContext.userAgent,
        details: {
          deliveryId,
          installationId: String(installationId),
          repositorySelection,
          addedCount: addedList.length,
          repoNames,
        },
      });
    } else if (action === 'removed') {
      const removedList = Array.isArray(payload.repositories_removed)
        ? payload.repositories_removed
        : [];
      const repoNames = removedList.map((r) => r.full_name || r.name).slice(0, 50);

      await writeAuditRecord(this.db, {
        tenantId,
        userId: connection.userId,
        eventType: 'github.repositories.removed',
        resourceId: connection.id,
        requestId: reqContext.requestId,
        ipAddress: reqContext.ipAddress,
        userAgent: reqContext.userAgent,
        details: {
          deliveryId,
          installationId: String(installationId),
          repositorySelection,
          removedCount: removedList.length,
          repoNames,
        },
      });
    }

    return {
      success: true,
      processed: true,
      event: 'installation_repositories',
      action,
      repositorySelection,
      connectionId: connection.id,
      tenantId,
      deliveryId,
    };
  }
}
