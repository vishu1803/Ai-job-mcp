/**
 * @file Connector Execution Context
 *
 * Implements immutable, server-minted execution context for connector operations.
 * Strictly validates tenant, user, connection, provider, and correlation metadata.
 */

import crypto from 'node:crypto';
import { ValidationError } from '../../errors/index.js';
import { resourceProviderEnum, connectionAuthTypeEnum } from '../../db/schema.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates and mints an immutable ConnectorContext.
 *
 * @param {Object} params
 * @param {string} params.tenantId - Valid tenant UUID
 * @param {string} params.userId - Valid user UUID
 * @param {string} params.connectionId - Valid connection UUID
 * @param {string} params.provider - Valid resource provider enum value
 * @param {string} params.authType - Valid connection auth type enum value
 * @param {string[]} [params.scopes=[]] - Array of verified permission scopes
 * @param {string} [params.requestId] - Optional request correlation ID (generates UUID if omitted)
 * @returns {Readonly<{tenantId: string, userId: string, connectionId: string, provider: string, authType: string, scopes: readonly string[], requestId: string}>}
 */
export function createConnectorContext({
  tenantId,
  userId,
  connectionId,
  provider,
  authType,
  scopes = [],
  requestId,
}) {
  const errors = [];

  // Validate tenantId
  if (!tenantId || typeof tenantId !== 'string' || !UUID_REGEX.test(tenantId)) {
    errors.push({ field: 'tenantId', message: 'tenantId must be a valid UUIDv4' });
  }

  // Validate userId
  if (!userId || typeof userId !== 'string' || !UUID_REGEX.test(userId)) {
    errors.push({ field: 'userId', message: 'userId must be a valid UUIDv4' });
  }

  // Validate connectionId
  if (!connectionId || typeof connectionId !== 'string' || !UUID_REGEX.test(connectionId)) {
    errors.push({ field: 'connectionId', message: 'connectionId must be a valid UUIDv4' });
  }

  // Validate provider
  if (
    !provider ||
    typeof provider !== 'string' ||
    !resourceProviderEnum.enumValues.includes(provider)
  ) {
    errors.push({
      field: 'provider',
      message: `provider must be one of: ${resourceProviderEnum.enumValues.join(', ')}`,
    });
  }

  // Validate authType
  if (
    !authType ||
    typeof authType !== 'string' ||
    !connectionAuthTypeEnum.enumValues.includes(authType)
  ) {
    errors.push({
      field: 'authType',
      message: `authType must be one of: ${connectionAuthTypeEnum.enumValues.join(', ')}`,
    });
  }

  // Validate scopes
  if (!Array.isArray(scopes) || !scopes.every((s) => typeof s === 'string')) {
    errors.push({ field: 'scopes', message: 'scopes must be an array of strings' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid connector execution context', errors);
  }

  const finalRequestId =
    requestId && typeof requestId === 'string' && requestId.trim().length > 0
      ? requestId.trim()
      : crypto.randomUUID();

  // Return strictly shaped, frozen object
  return Object.freeze({
    tenantId,
    userId,
    connectionId,
    provider,
    authType,
    scopes: Object.freeze([...scopes]),
    requestId: finalRequestId,
  });
}
