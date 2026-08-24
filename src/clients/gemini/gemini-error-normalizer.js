/**
 * @file Gemini Error Normalizer (ARCH-026 / ADR-047)
 *
 * Maps upstream Google Gemini SDK and HTTP errors into standardized,
 * provider-neutral AiProviderError instances without leaking sensitive internals.
 */

import {
  AiProviderError,
  AiAuthenticationError,
  AiRateLimitedError,
  AiTimeoutError,
  AiInvalidRequestError,
  AiOutputSchemaError,
  AiSafetyBlockedError,
  AiContextTooLargeError,
  AiUnavailableError,
} from '../../errors/ai.errors.js';

/**
 * Normalizes an error caught during Gemini generation or tool invocation.
 *
 * @param {any} err Upstream error object
 * @param {object} [context] Request context for debugging
 * @returns {AiProviderError} Normalized AiProviderError instance
 */
export function normalizeGeminiError(err, context = {}) {
  if (err instanceof AiProviderError) {
    return err;
  }

  const message = err?.message || 'Gemini generation failed';
  const status = err?.status || err?.statusCode || err?.response?.status || 500;

  // 1. Timeout / Abort
  if (
    err.name === 'AbortError' ||
    message.includes('aborted') ||
    message.includes('timed out') ||
    status === 504
  ) {
    return new AiTimeoutError(
      'Gemini API request timed out.',
      { originalMessage: message, ...context },
      'gemini'
    );
  }

  // 2. Authentication Failure (401 / 403 API_KEY_INVALID)
  if (
    status === 401 ||
    (status === 403 &&
      (message.includes('API_KEY') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('API key')))
  ) {
    return new AiAuthenticationError(
      'Gemini API authentication failed. Verify GEMINI_API_KEY.',
      { status, ...context },
      'gemini'
    );
  }

  // 3. Rate Limit / Quota Exhaustion (429 / RESOURCE_EXHAUSTED)
  if (
    status === 429 ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('quota') ||
    message.includes('rate limit')
  ) {
    return new AiRateLimitedError(
      'Gemini API rate limit or quota exceeded.',
      { status, ...context },
      'gemini'
    );
  }

  // 4. Context Window Overflow (413 / Context Too Large)
  if (
    status === 413 ||
    message.includes('context window') ||
    message.includes('token count exceeds')
  ) {
    return new AiContextTooLargeError(
      'Prompt context exceeds Gemini model token limit.',
      { status, ...context },
      'gemini'
    );
  }

  // 5. Safety Filter Block
  if (message.includes('SAFETY') || message.includes('blocked by safety filters')) {
    return new AiSafetyBlockedError(
      'Gemini generation blocked by safety filters.',
      { ...context },
      'gemini'
    );
  }

  // 6. Output Schema Validation Failure
  if (message.includes('schema') && (message.includes('validation') || message.includes('JSON'))) {
    return new AiOutputSchemaError(
      'Gemini returned output that failed schema validation.',
      { originalMessage: message, ...context },
      'gemini'
    );
  }

  // 7. Invalid Request / Bad Arguments (400)
  if (status === 400 || message.includes('INVALID_ARGUMENT')) {
    return new AiInvalidRequestError(
      'Invalid request sent to Gemini API.',
      { originalMessage: message, status, ...context },
      'gemini'
    );
  }

  // 8. Service Unavailable / Capacity (503 / 500)
  if (
    status === 503 ||
    status === 502 ||
    message.includes('UNAVAILABLE') ||
    message.includes('high demand')
  ) {
    return new AiUnavailableError(
      'Gemini API is temporarily unavailable.',
      { status, ...context },
      'gemini'
    );
  }

  // 9. Generic Fallback
  return new AiProviderError(
    'An error occurred communicating with Google Gemini.',
    status >= 400 && status < 600 ? status : 500,
    'AI_PROVIDER_ERROR',
    { originalMessage: message, status, ...context },
    'gemini'
  );
}
