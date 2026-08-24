/**
 * @file Canonical AI Provider Interface (ARCH-026 / ADR-047)
 *
 * Defines the contract that all external generative AI adapters (Gemini, Claude,
 * OpenAI, Mock) must implement. The core platform never depends on vendor SDK types.
 */

/* eslint-disable no-unused-vars */

export class AiProvider {
  /**
   * @param {string} id Unique provider identifier ('gemini' | 'claude' | 'openai' | 'mock')
   * @param {string} name Human-readable provider name
   */
  constructor(id, name) {
    if (new.target === AiProvider) {
      throw new TypeError('Cannot construct AiProvider instances directly; abstract class.');
    }
    this.id = id;
    this.name = name;
  }

  /**
   * Generates free-form text or prose using configured model and prompt blocks.
   *
   * @param {import('../../domain/ai/ai.schemas.js').AiGenerationRequest} request
   * @param {object} [options]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiGenerationResponse>}
   */
  async generateText(request, options = {}) {
    throw new Error('AiProvider.generateText() must be implemented by subclass.');
  }

  /**
   * Generates type-safe structured output conforming strictly to Zod or JSON Schema.
   *
   * @template T
   * @param {import('../../domain/ai/ai.schemas.js').AiStructuredRequest} request
   * @param {object} [options]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiStructuredResponse & { data: T }>}
   */
  async generateStructured(request, options = {}) {
    throw new Error('AiProvider.generateStructured() must be implemented by subclass.');
  }

  /**
   * Executes bounded multi-turn tool calling loop (max 3 rounds) with approved tools.
   *
   * @param {import('../../domain/ai/ai.schemas.js').AiToolLoopRequest} request
   * @param {object} [options]
   * @returns {Promise<import('../../domain/ai/ai.schemas.js').AiToolLoopResponse>}
   */
  async executeToolLoop(request, options = {}) {
    throw new Error('AiProvider.executeToolLoop() must be implemented by subclass.');
  }

  /**
   * Verifies provider connectivity and credential status with a minimal synthetic check.
   *
   * @returns {Promise<{ healthy: boolean, latencyMs: number, details?: any }>}
   */
  async validateHealth() {
    throw new Error('AiProvider.validateHealth() must be implemented by subclass.');
  }
}

export default AiProvider;
