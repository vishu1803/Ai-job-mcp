/**
 * @file Centralized Portal Adapter Registry (Phase 8.1 / ARCH-056).
 *
 * Provides a provider-neutral, prioritized registry for resolving application
 * portal adapters deterministically across MCP, Web App, and Chrome Extension.
 */

import { PortalAdapterIdentitySchema } from './portal-adapter.contract.js';
import { ValidationError } from '../../errors/index.js';

export class PortalAdapterRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.adapters = new Map();
  }

  /**
   * Registers a portal adapter into the registry.
   *
   * @param {object} adapter Instance of PortalAdapterContract or compatible adapter
   * @returns {void}
   */
  register(adapter) {
    if (!adapter) {
      throw new ValidationError('Adapter instance is required', 'INVALID_ADAPTER');
    }

    const identity = adapter.identity || {
      id: adapter.id,
      name: adapter.name,
      version: adapter.version || '1.0.0',
      supportedPortals: adapter.supportedPortals || [],
      priority: adapter.priority ?? 10,
      capabilities: adapter.capabilities || {},
    };

    const validatedIdentity = PortalAdapterIdentitySchema.safeParse(identity);
    if (!validatedIdentity.success) {
      throw new ValidationError(
        `Cannot register adapter with invalid identity: ${validatedIdentity.error.message}`,
        'INVALID_ADAPTER_IDENTITY'
      );
    }

    if (typeof adapter.canHandle !== 'function' && typeof adapter.canSubmit !== 'function') {
      throw new ValidationError(
        `Adapter "${identity.id}" must implement canHandle() or canSubmit()`,
        'MISSING_ADAPTER_METHOD'
      );
    }

    // Attach validated identity if missing
    if (!adapter.identity) {
      adapter.identity = validatedIdentity.data;
    }

    this.adapters.set(identity.id, adapter);
  }

  /**
   * Resolves the most appropriate portal adapter for the destination.
   * Evaluates in descending priority order. Deterministic resolution.
   *
   * @param {string|object} destination URL string or context object
   * @returns {object|null} Matching PortalAdapter instance, or null if unhandled
   */
  resolve(destination) {
    if (!destination) return null;

    const normalizedDest = typeof destination === 'string' ? destination.trim() : destination;

    // Sort by priority descending, then stable ID ascending
    const sorted = Array.from(this.adapters.values()).sort((a, b) => {
      const pA = a.priority ?? a.identity?.priority ?? 10;
      const pB = b.priority ?? b.identity?.priority ?? 10;
      if (pB !== pA) return pB - pA;
      const idA = a.id || a.identity?.id || '';
      const idB = b.id || b.identity?.id || '';
      return idA.localeCompare(idB);
    });

    for (const adapter of sorted) {
      try {
        if (typeof adapter.canHandle === 'function' && adapter.canHandle(normalizedDest)) {
          return adapter;
        }
        if (typeof adapter.canSubmit === 'function' && adapter.canSubmit(typeof normalizedDest === 'string' ? normalizedDest : normalizedDest.url)) {
          return adapter;
        }
      } catch {
        // Skip adapter if determination throws
        continue;
      }
    }

    return null;
  }

  /**
   * Unregisters an adapter by ID.
   *
   * @param {string} id
   * @returns {boolean} True if removed
   */
  unregister(id) {
    return this.adapters.delete(id);
  }

  /**
   * Lists all registered adapters and their capabilities.
   *
   * @returns {Array<object>}
   */
  list() {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id || a.identity?.id,
      name: a.name || a.identity?.name,
      version: a.identity?.version || '1.0.0',
      priority: a.priority ?? a.identity?.priority ?? 10,
      capabilities: a.capabilities || a.identity?.capabilities || {},
      supportedPortals: a.identity?.supportedPortals || [],
    }));
  }

  /**
   * Clears all registered adapters (useful for isolated tests).
   */
  clear() {
    this.adapters.clear();
  }
}

/** Global default portal adapter registry instance */
export const portalAdapterRegistry = new PortalAdapterRegistry();
