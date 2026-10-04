/**
 * @file Centralized Job Source Adapter Registry (Phase 8.2 / ARCH-057).
 *
 * Provides a provider-neutral, prioritized registry for resolving job source
 * discovery adapters deterministically across all ingestion channels.
 */

import { JobSourceAdapterIdentitySchema } from './job-source-adapter.contract.js';
import { ValidationError } from '../../errors/index.js';

export class JobSourceRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this.adapters = new Map();
  }

  /**
   * Registers a job source adapter.
   *
   * @param {object} adapter Instance of JobSourceAdapterContract or compatible
   */
  register(adapter) {
    if (!adapter) {
      throw new ValidationError('JobSourceAdapter instance is required', 'INVALID_SOURCE_ADAPTER');
    }

    const identity = adapter.identity || {
      id: adapter.id,
      name: adapter.name,
      version: adapter.version || '1.0.0',
      providerCategory: adapter.providerCategory || 'UNKNOWN',
      supportedSources: adapter.supportedSources || [],
      priority: adapter.priority ?? 10,
      capabilities: adapter.capabilities || {},
    };

    const validatedIdentity = JobSourceAdapterIdentitySchema.safeParse(identity);
    if (!validatedIdentity.success) {
      throw new ValidationError(
        `Cannot register JobSourceAdapter with invalid identity: ${validatedIdentity.error.message}`,
        'INVALID_SOURCE_ADAPTER_IDENTITY'
      );
    }

    if (typeof adapter.canHandle !== 'function') {
      throw new ValidationError(
        `JobSourceAdapter "${identity.id}" must implement canHandle()`,
        'MISSING_SOURCE_ADAPTER_METHOD'
      );
    }

    if (!adapter.identity) {
      adapter.identity = validatedIdentity.data;
    }

    this.adapters.set(identity.id, adapter);
  }

  /**
   * Resolves the most appropriate JobSourceAdapter for the source context.
   * Evaluates in descending priority order (`priority` DESC, `id` ASC).
   *
   * @param {string|object} sourceContext URL string or query/source object
   * @returns {object|null} Matching JobSourceAdapter instance, or null if unhandled
   */
  resolve(sourceContext) {
    if (!sourceContext) return null;

    const normalizedContext =
      typeof sourceContext === 'string' ? sourceContext.trim() : sourceContext;

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
        if (typeof adapter.canHandle === 'function' && adapter.canHandle(normalizedContext)) {
          return adapter;
        }
      } catch {
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
   * Lists all registered job source adapters.
   *
   * @returns {Array<object>}
   */
  list() {
    return Array.from(this.adapters.values()).map((a) => ({
      id: a.id || a.identity?.id,
      name: a.name || a.identity?.name,
      version: a.identity?.version || '1.0.0',
      providerCategory: a.providerCategory || a.identity?.providerCategory || 'UNKNOWN',
      priority: a.priority ?? a.identity?.priority ?? 10,
      capabilities: a.capabilities || a.identity?.capabilities || {},
      supportedSources: a.identity?.supportedSources || [],
    }));
  }

  /**
   * Clears all registered source adapters (for testing).
   */
  clear() {
    this.adapters.clear();
  }
}

/** Global default job source registry */
export const jobSourceRegistry = new JobSourceRegistry();
