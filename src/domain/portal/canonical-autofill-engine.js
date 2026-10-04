/**
 * @file Canonical Autofill Engine (Phase 9.1 / ARCH-060)
 *
 * Establishes CanonicalAutofillEngine as the SINGLE source of truth
 * for all browser form planning, execution, and verification across:
 * - MCP tools
 * - Web Portal Adapters
 * - Chrome Extension
 */

import {
  GenericAutofillEngine,
  genericAutofillEngine,
  setNativeValue,
  setNativeChecked,
  dispatchSyntheticEvents,
  findMatchingOption,
} from './generic-autofill-engine.js';

export const CanonicalAutofillEngine = GenericAutofillEngine;
export const canonicalAutofillEngine = genericAutofillEngine;

export {
  GenericAutofillEngine,
  genericAutofillEngine,
  setNativeValue,
  setNativeChecked,
  dispatchSyntheticEvents,
  findMatchingOption,
};
