/**
 * @file Provider Application Adapters Index (Phase 8.4 / ARCH-059).
 *
 * Exports all six production-grade provider-specific portal adapters:
 * 1. GreenhousePortalAdapter
 * 2. LeverPortalAdapter
 * 3. AshbyPortalAdapter
 * 4. WorkdayPortalAdapter
 * 5. SmartRecruitersPortalAdapter
 * 6. IcimsPortalAdapter
 */

import { GreenhousePortalAdapter } from './greenhouse.portal-adapter.js';
import { LeverPortalAdapter } from './lever.portal-adapter.js';
import { AshbyPortalAdapter } from './ashby.portal-adapter.js';
import { WorkdayPortalAdapter } from './workday.portal-adapter.js';
import { SmartRecruitersPortalAdapter } from './smartrecruiters.portal-adapter.js';
import { IcimsPortalAdapter } from './icims.portal-adapter.js';
import { GenericCareerSiteAdapter } from './generic-career-site.portal-adapter.js';
import { portalAdapterRegistry } from '../portal-adapter-registry.js';

export {
  GreenhousePortalAdapter,
  LeverPortalAdapter,
  AshbyPortalAdapter,
  WorkdayPortalAdapter,
  SmartRecruitersPortalAdapter,
  IcimsPortalAdapter,
  GenericCareerSiteAdapter,
};

/**
 * Registers all six standard provider portal adapters into the given registry.
 *
 * @param {object} [registry] Defaults to global portalAdapterRegistry
 * @returns {void}
 */
export function registerStandardPortalAdapters(registry = portalAdapterRegistry) {
  registry.register(new GreenhousePortalAdapter());
  registry.register(new LeverPortalAdapter());
  registry.register(new AshbyPortalAdapter());
  registry.register(new WorkdayPortalAdapter());
  registry.register(new SmartRecruitersPortalAdapter());
  registry.register(new IcimsPortalAdapter());
}

/**
 * Registers the generic career site fallback adapter.
 *
 * @param {object} [registry]
 * @returns {void}
 */
export function registerGenericCareerSiteAdapter(registry = portalAdapterRegistry) {
  registry.register(new GenericCareerSiteAdapter());
}

/**
 * Registers all provider portal adapters including the generic career site fallback.
 *
 * @param {object} [registry]
 * @returns {void}
 */
export function registerAllPortalAdapters(registry = portalAdapterRegistry) {
  registerStandardPortalAdapters(registry);
  registerGenericCareerSiteAdapter(registry);
}

// Auto-register on import into standard portalAdapterRegistry
registerStandardPortalAdapters(portalAdapterRegistry);
