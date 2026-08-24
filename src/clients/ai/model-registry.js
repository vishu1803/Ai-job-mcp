/**
 * @file Dynamic AI Model Registry (ARCH-026 / ADR-047)
 *
 * Implements the centralized AI model catalog and capability resolution.
 * Strictly separates STABLE, PREVIEW, and DEPRECATED models and prevents
 * hardcoded model IDs from polluting core domain services.
 */

import { ModelMetadataSchema } from '../../domain/ai/ai.schemas.js';
import { AiInvalidRequestError } from '../../errors/ai.errors.js';

/**
 * Canonical 2026 Model Catalog.
 */
const CANONICAL_MODELS = Object.freeze([
  {
    modelId: 'gemini-3.7-flash',
    displayName: 'Google Gemini 3.7 Flash',
    provider: 'gemini',
    stability: 'STABLE',
    status: 'ACTIVE',
    capabilities: [
      'reasoning',
      'coding',
      'agentic',
      'structured_output',
      'function_calling',
      'caching',
    ],
    maxInputTokens: 1048576,
    maxOutputTokens: 65536,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: true,
    isProductionDefault: true,
  },
  {
    modelId: 'gemini-3.6-flash',
    displayName: 'Google Gemini 3.6 Flash',
    provider: 'gemini',
    stability: 'STABLE',
    status: 'ACTIVE',
    capabilities: ['fast_interactive', 'structured_output', 'function_calling', 'caching'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: false,
    isProductionDefault: false,
  },
  {
    modelId: 'gemini-3.5-flash',
    displayName: 'Google Gemini 3.5 Flash',
    provider: 'gemini',
    stability: 'STABLE',
    status: 'ACTIVE',
    capabilities: ['fast_synthesis', 'structured_output', 'function_calling'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: false,
    isProductionDefault: false,
  },
  {
    modelId: 'gemini-3.5-flash-lite',
    displayName: 'Google Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    stability: 'STABLE',
    status: 'ACTIVE',
    capabilities: ['micro_tasks', 'ultra_low_latency', 'structured_output'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: false,
    isProductionDefault: false,
  },
  {
    modelId: 'gemini-2.5-flash',
    displayName: 'Google Gemini 2.5 Flash',
    provider: 'gemini',
    stability: 'STABLE',
    status: 'ACTIVE',
    capabilities: ['stable_fallback', 'structured_output', 'function_calling'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: true,
    isProductionDefault: false,
  },
  {
    modelId: 'gemini-3.1-pro-preview',
    displayName: 'Google Gemini 3.1 Pro (Preview)',
    provider: 'gemini',
    stability: 'PREVIEW',
    status: 'ACTIVE',
    capabilities: [
      'deep_reasoning',
      'complex_architecture',
      'structured_output',
      'function_calling',
    ],
    maxInputTokens: 2097152,
    maxOutputTokens: 65536,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: true,
    supportsThinking: true,
    isProductionDefault: false,
  },
  {
    modelId: 'gemini-2.0-flash',
    displayName: 'Google Gemini 2.0 Flash (Deprecated)',
    provider: 'gemini',
    stability: 'DEPRECATED',
    status: 'DEPRECATED',
    capabilities: ['legacy'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: false,
    supportsThinking: false,
    isProductionDefault: false,
    deprecatedAt: '2026-01-01',
  },
  {
    modelId: 'gemini-1.5-pro',
    displayName: 'Google Gemini 1.5 Pro (Legacy)',
    provider: 'gemini',
    stability: 'DEPRECATED',
    status: 'DEPRECATED',
    capabilities: ['legacy'],
    maxInputTokens: 2097152,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: false,
    supportsThinking: false,
    isProductionDefault: false,
    deprecatedAt: '2025-10-01',
  },
  {
    modelId: 'gemini-1.5-flash',
    displayName: 'Google Gemini 1.5 Flash (Legacy)',
    provider: 'gemini',
    stability: 'DEPRECATED',
    status: 'DEPRECATED',
    capabilities: ['legacy'],
    maxInputTokens: 1048576,
    maxOutputTokens: 8192,
    supportsStructuredOutput: true,
    supportsFunctionCalling: true,
    supportsCaching: false,
    supportsThinking: false,
    isProductionDefault: false,
    deprecatedAt: '2025-10-01',
  },
]);

export class ModelRegistry {
  /**
   * @param {Array<object>} [customModels] Optional initial model catalog overrides
   */
  constructor(customModels = null) {
    this.models = new Map();
    const initial = customModels || CANONICAL_MODELS;
    for (const m of initial) {
      const validated = ModelMetadataSchema.parse(m);
      this.models.set(validated.modelId, validated);
    }
  }

  /**
   * Retrieves metadata for a specific model ID.
   *
   * @param {string} modelId Model identifier string
   * @returns {object | null} Validated model metadata
   */
  getModel(modelId) {
    return this.models.get(modelId) || null;
  }

  /**
   * Returns all registered models.
   *
   * @param {object} [filter]
   * @param {string} [filter.stability] 'STABLE' | 'PREVIEW' | 'DEPRECATED'
   * @param {string} [filter.provider] 'gemini' | 'claude' | 'openai'
   * @returns {Array<object>}
   */
  listModels(filter = {}) {
    let list = Array.from(this.models.values());
    if (filter.stability) {
      list = list.filter((m) => m.stability === filter.stability);
    }
    if (filter.provider) {
      list = list.filter((m) => m.provider === filter.provider);
    }
    return list;
  }

  /**
   * Returns the canonical production default workhorse model.
   *
   * @returns {object} Default model metadata
   */
  getDefaultModel() {
    for (const m of this.models.values()) {
      if (m.isProductionDefault && m.stability === 'STABLE') {
        return m;
      }
    }
    const flash = this.models.get('gemini-3.7-flash');
    if (flash) return flash;
    throw new Error('No valid production default model found in ModelRegistry.');
  }

  /**
   * Asserts that a model is allowed for production usage.
   * Throws AiInvalidRequestError if the model is DEPRECATED or PREVIEW without explicit permission.
   *
   * @param {string} modelId Model ID to check
   * @param {boolean} [allowPreview=false] Whether preview models are permitted for this request
   * @returns {object} Validated model metadata
   */
  assertProductionModel(modelId, allowPreview = false) {
    const model = this.getModel(modelId);
    if (!model) {
      throw new AiInvalidRequestError(
        `Unknown AI model "${modelId}". Not registered in ModelRegistry.`,
        { modelId }
      );
    }

    if (model.stability === 'DEPRECATED') {
      throw new AiInvalidRequestError(
        `AI model "${modelId}" is DEPRECATED and cannot be used in production.`,
        { modelId, stability: model.stability, deprecatedAt: model.deprecatedAt }
      );
    }

    if (model.stability === 'PREVIEW' && !allowPreview) {
      throw new AiInvalidRequestError(
        `AI model "${modelId}" is a PREVIEW model. Set allowsPreviewModel: true in TaskPolicy to permit.`,
        { modelId, stability: model.stability }
      );
    }

    return model;
  }

  /**
   * Registers or updates a model definition in the registry.
   *
   * @param {object} modelDef Model metadata definition
   */
  registerModel(modelDef) {
    const validated = ModelMetadataSchema.parse(modelDef);
    this.models.set(validated.modelId, validated);
  }
}

export const defaultModelRegistry = new ModelRegistry();
export default defaultModelRegistry;
