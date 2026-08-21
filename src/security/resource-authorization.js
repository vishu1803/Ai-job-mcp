/**
 * @file Reusable Resource Authorization & Tenant Isolation Helper (P2-006)
 *
 * Provides centralized, platform-wide security checks for tenant isolation,
 * role-based access control, and resource creator ownership rules.
 */

import { ConnectionNotFoundError } from '../connectors/errors/connector-errors.js';
import { AuthorizationError, ValidationError } from '../errors/index.js';
import { createConnectorContext } from '../connectors/base/context.js';

/**
 * Validates that an operation on a resource conforms to tenant boundaries and RBAC permissions.
 *
 * Rules:
 * 1. Tenant Boundary: `resource.tenantId === tenantId`. If mismatched or missing, throws 404 NOT_FOUND.
 * 2. Read Operations: Permitted for `OWNER`, `MEMBER`, and `READONLY`.
 * 3. Mutation/Deletion Operations: Permitted for `OWNER` or the recorded `resource.userId` (creator).
 *    Rejected with 403 FORBIDDEN for `READONLY` or non-creator `MEMBER`.
 *
 * @param {object} params
 * @param {{id: string, role: 'OWNER' | 'MEMBER' | 'READONLY'}} params.user - Trusted user from session
 * @param {string} params.tenantId - Trusted tenant UUID from session
 * @param {object} params.resource - Resource record fetched from database
 * @param {'read' | 'mutate' | 'delete'} [params.action='read'] - Attempted operation category
 * @param {boolean} [params.requireCreator=false] - If true, enforces creator ownership for non-owners
 * @throws {ConnectionNotFoundError} If resource is null or belongs to another tenant (404)
 * @throws {AuthorizationError} If user role or creator check fails (403)
 */
export function authorizeResourceAccess({
  user,
  tenantId,
  resource,
  action = 'read',
  requireCreator = false,
}) {
  if (!user || !user.id || !user.role) {
    throw new AuthorizationError('Authentication context is required for authorization check');
  }

  if (!tenantId || typeof tenantId !== 'string') {
    throw new ValidationError('Trusted tenant identifier is required');
  }

  // 1. Cross-Tenant Isolation Barrier:
  // If the resource does not exist or belongs to another tenant, ALWAYS return 404 NOT_FOUND.
  // Never return 403 for cross-tenant lookups to prevent object enumeration and IDOR.
  if (!resource || resource.tenantId !== tenantId) {
    throw new ConnectionNotFoundError(resource?.id, tenantId);
  }

  // 2. Action & Role Checks
  const isMutatingAction = action === 'mutate' || action === 'delete' || requireCreator;

  if (isMutatingAction) {
    // READONLY users can never mutate or delete resources
    if (user.role === 'READONLY') {
      throw new AuthorizationError(
        'Read-only members do not have permission to modify or delete workspace resources.',
        'FORBIDDEN'
      );
    }

    const isCreator = resource.userId === user.id;
    const isOwner = user.role === 'OWNER';

    // For non-owner members, creator ownership is strictly required for mutating operations
    if (!isOwner && !isCreator) {
      throw new AuthorizationError(
        'You do not have permission to modify this resource. Only the resource creator or a workspace owner may perform this action.',
        'FORBIDDEN'
      );
    }
  }
}

/**
 * Creates an immutable ConnectorContext derived exclusively from verified session state
 * and authorized connection metadata.
 *
 * @param {object} params
 * @param {{id: string, role: string}} params.user - Trusted user
 * @param {string} params.tenantId - Trusted tenant ID
 * @param {object} params.connection - Authorized connection record
 * @param {string} [params.requestId] - Correlation request ID
 * @returns {import('../connectors/base/context.js').ConnectorContext}
 */
export function createTrustedConnectorContext({ user, tenantId, connection, requestId }) {
  // Enforce tenant boundary before minting connector context
  authorizeResourceAccess({
    user,
    tenantId,
    resource: connection,
    action: 'mutate',
  });

  return createConnectorContext({
    tenantId,
    userId: user.id,
    connectionId: connection.id,
    provider: connection.provider,
    authType: connection.authType,
    scopes: connection.scopes,
    requestId,
  });
}
