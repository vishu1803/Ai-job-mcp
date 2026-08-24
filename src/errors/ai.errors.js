/**
 * @file Provider-Neutral AI Layer Error Hierarchy (ARCH-026 / ADR-047)
 *
 * Defines machine-readable, normalized error classes for external AI operations.
 * Strictly prevents leaking upstream vendor exception objects or credentials.
 */

import { AppError } from './base.error.js';

/**
 * Base error class for all AI provider operations.
 */
export class AiProviderError extends AppError {
  /**
   * @param {string} message Safe human-readable error message
   * @param {number} [statusCode=500] HTTP status code
   * @param {string} [code='AI_PROVIDER_ERROR'] Normalized error code
   * @param {any} [details=null] Safe structured metadata
   * @param {string} [provider='gemini'] Provider identifier
   */
  constructor(
    message,
    statusCode = 500,
    code = 'AI_PROVIDER_ERROR',
    details = null,
    provider = 'gemini'
  ) {
    super(message, statusCode, code, details);
    this.provider = provider;
  }
}

/**
 * 401 AI Authentication Failure (Invalid or missing provider API key).
 */
export class AiAuthenticationError extends AiProviderError {
  constructor(message = 'AI provider authentication failed.', details = null, provider = 'gemini') {
    super(message, 401, 'AI_AUTHENTICATION_ERROR', details, provider);
  }
}

/**
 * 429 AI Provider Rate Limited / Quota Exhausted.
 */
export class AiRateLimitedError extends AiProviderError {
  constructor(message = 'AI provider rate limit exceeded.', details = null, provider = 'gemini') {
    super(message, 429, 'AI_RATE_LIMITED', details, provider);
  }
}

/**
 * 504 AI Request Timeout.
 */
export class AiTimeoutError extends AiProviderError {
  constructor(message = 'AI provider request timed out.', details = null, provider = 'gemini') {
    super(message, 504, 'AI_TIMEOUT', details, provider);
  }
}

/**
 * 400 Invalid AI Generation Request / Parameter Error.
 */
export class AiInvalidRequestError extends AiProviderError {
  constructor(
    message = 'Invalid AI generation request parameters.',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 400, 'AI_INVALID_REQUEST', details, provider);
  }
}

/**
 * 400 AI Output Schema Validation Failure (Output failed Zod / JSON Schema contract).
 */
export class AiOutputSchemaError extends AiProviderError {
  constructor(
    message = 'AI provider returned malformed structured output violating schema contract.',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 400, 'AI_OUTPUT_SCHEMA_ERROR', details, provider);
  }
}

/**
 * 403 AI Safety Policy Block (Generation blocked by provider safety filters).
 */
export class AiSafetyBlockedError extends AiProviderError {
  constructor(
    message = 'AI generation was blocked by provider safety filters.',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 403, 'AI_SAFETY_BLOCKED', details, provider);
  }
}

/**
 * 413 AI Context Window Overflow / Request Payload Too Large.
 */
export class AiContextTooLargeError extends AiProviderError {
  constructor(
    message = 'Context payload exceeds model token ceiling.',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 413, 'AI_CONTEXT_TOO_LARGE', details, provider);
  }
}

/**
 * 503 AI Provider Unavailable / Capacity Degradation.
 */
export class AiUnavailableError extends AiProviderError {
  constructor(
    message = 'AI provider service is temporarily unavailable.',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 503, 'AI_UNAVAILABLE', details, provider);
  }
}

/**
 * 504 / -32008 AI Tool Execution Loop Exhausted (Exceeded 3 turns).
 */
export class AiToolLoopExhaustedError extends AiProviderError {
  constructor(
    message = 'AI tool execution loop reached maximum allowed turn depth (3 rounds).',
    details = null,
    provider = 'gemini'
  ) {
    super(message, 504, 'AI_TOOL_LOOP_EXHAUSTED', details, provider);
  }
}
