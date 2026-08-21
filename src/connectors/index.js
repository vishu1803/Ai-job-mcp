/**
 * @file Resource Connector Core Framework Index
 *
 * Re-exports the complete provider-neutral connector abstraction layer:
 * - BaseResourceConnector
 * - CONNECTOR_CAPABILITIES
 * - createConnectorContext
 * - Normalized domain models (Account, Resource, OperationResult, Pagination)
 * - ConnectorRegistry & singleton connectorRegistry
 * - Connector error hierarchy
 * - MockResourceConnector (testing utility)
 */

export * from './base/resource-connector.js';
export * from './base/capabilities.js';
export * from './base/context.js';
export * from './base/models.js';
export * from './errors/index.js';
export * from './registry/connector-registry.js';
export * from './testing/mock-connector.js';
export * from './github/index.js';
