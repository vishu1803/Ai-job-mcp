/**
 * @file Provider Factory & Selector for AI Clients (ARCH-028 / ADR-049)
 *
 * Implements the provider selector enabling dynamic resolution between
 * Gemini Developer API (Google AI Studio) and Google Cloud Vertex AI (ADC)
 * without hardcoding provider logic in domain services.
 */

import { GeminiProviderAdapter, defaultGeminiAdapter } from '../gemini/gemini-adapter.js';
import { GeminiVertexAdapter, defaultVertexAdapter } from '../vertex/vertex-adapter.js';
import { AiInvalidRequestError } from '../../errors/ai.errors.js';

/**
 * Standard AI provider identifiers.
 */
export const AI_PROVIDERS = Object.freeze({
  GEMINI_DEVELOPER: 'gemini-developer',
  GEMINI_VERTEX: 'gemini-vertex',
});

/**
 * Creates an instance of an AiProvider based on requested type or environment configuration.
 *
 * @param {object} [options={}]
 * @param {string} [options.provider] Provider identifier ('gemini-developer' | 'gemini-vertex')
 * @param {object} [options.adapterOptions] Options passed directly to the adapter constructor
 * @returns {import('./ai-provider.interface.js').AiProvider} Configured AiProvider instance
 */
export function createAiProvider(options = {}) {
  const selected = (
    options.provider ||
    process.env.AI_PROVIDER ||
    AI_PROVIDERS.GEMINI_DEVELOPER
  ).toLowerCase();

  if (
    selected === AI_PROVIDERS.GEMINI_VERTEX ||
    selected === 'vertex' ||
    selected === 'gemini-vertex'
  ) {
    return new GeminiVertexAdapter(options.adapterOptions || {});
  }

  if (
    selected === AI_PROVIDERS.GEMINI_DEVELOPER ||
    selected === 'gemini' ||
    selected === 'gemini-developer' ||
    selected === 'developer'
  ) {
    return new GeminiProviderAdapter(options.adapterOptions || {});
  }

  throw new AiInvalidRequestError(
    `Unsupported AI provider "${selected}". Supported providers are "${AI_PROVIDERS.GEMINI_DEVELOPER}" and "${AI_PROVIDERS.GEMINI_VERTEX}".`,
    { selected, supportedProviders: Object.values(AI_PROVIDERS) }
  );
}

/**
 * Resolves the default configured singleton AI provider.
 *
 * @returns {import('./ai-provider.interface.js').AiProvider} Default AiProvider instance
 */
export function getDefaultAiProvider() {
  const selected = (process.env.AI_PROVIDER || AI_PROVIDERS.GEMINI_DEVELOPER).toLowerCase();
  if (
    selected === AI_PROVIDERS.GEMINI_VERTEX ||
    selected === 'vertex' ||
    selected === 'gemini-vertex'
  ) {
    return defaultVertexAdapter;
  }
  return defaultGeminiAdapter;
}

export default createAiProvider;
