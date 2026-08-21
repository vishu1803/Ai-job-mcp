/**
 * @file Connector Capabilities Definition
 *
 * Defines the immutable set of capability flags that third-party connectors
 * declare to advertise their supported operations.
 */

/**
 * Standard connector capability identifiers.
 * @readonly
 * @enum {string}
 */
export const CONNECTOR_CAPABILITIES = Object.freeze({
  READ_ACCOUNT: 'READ_ACCOUNT',
  LIST_RESOURCES: 'LIST_RESOURCES',
  READ_RESOURCE: 'READ_RESOURCE',
  READ_CONTENT: 'READ_CONTENT',
  REFRESH_CREDENTIAL: 'REFRESH_CREDENTIAL',
  REVOKE_ACCESS: 'REVOKE_ACCESS',
  WRITE_RESOURCE: 'WRITE_RESOURCE',
});

/**
 * Helper to validate whether a capability string is a known capability.
 * @param {string} capability
 * @returns {boolean}
 */
export function isValidCapability(capability) {
  return Object.values(CONNECTOR_CAPABILITIES).includes(capability);
}
