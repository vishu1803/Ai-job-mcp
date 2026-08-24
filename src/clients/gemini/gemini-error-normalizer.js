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

  const provider = context.provider || 'gemini';
  const providerLabel = provider === 'vertex' ? 'Vertex AI' : 'Gemini API';
  const message = err?.message || `${providerLabel} generation failed`;
  const status = err?.status || err?.statusCode || err?.response?.status || 500;

  // 1. Timeout / Abort
  if (
    err.name === 'AbortError' ||
    message.includes('aborted') ||
    message.includes('timed out') ||
    status === 504
  ) {
    return new AiTimeoutError(
      `${providerLabel} request timed out.`,
      { originalMessage: message, ...context },
      provider
    );
  }

  // 2. Authentication Failure (401 / 403 API_KEY_INVALID / ADC Failure / invalid_grant)
  if (
    status === 401 ||
    message.includes('invalid_grant') ||
    message.includes('unauthenticated') ||
    message.includes('credentials') ||
    message.includes('Could not load the default credentials') ||
    (status === 403 &&
      (message.includes('API_KEY') ||
        message.includes('PERMISSION_DENIED') ||
        message.includes('API key') ||
        message.includes('unauthenticated') ||
        message.includes('credentials')))
  ) {
    return new AiAuthenticationError(
      `${providerLabel} authentication failed. Verify credentials.`,
      { status, ...context },
      provider
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
      `${providerLabel} rate limit or quota exceeded.`,
      { status, ...context },
      provider
    );
  }

  // 4. Context Window Overflow (413 / Context Too Large)
  if (
    status === 413 ||
    message.includes('context window') ||
    message.includes('token count exceeds')
  ) {
    return new AiContextTooLargeError(
      `Prompt context exceeds model token limit.`,
      { status, ...context },
      provider
    );
  }

  // 5. Safety Filter Block
  if (message.includes('SAFETY') || message.includes('blocked by safety filters')) {
    return new AiSafetyBlockedError(
      `${providerLabel} generation blocked by safety filters.`,
      { ...context },
      provider
    );
  }

  // 6. Output Schema Validation Failure
  if (message.includes('schema') && (message.includes('validation') || message.includes('JSON'))) {
    return new AiOutputSchemaError(
      `${providerLabel} returned output that failed schema validation.`,
      { originalMessage: message, ...context },
      provider
    );
  }

  // 7. Invalid Request / Bad Arguments (400)
  if (status === 400 || message.includes('INVALID_ARGUMENT')) {
    return new AiInvalidRequestError(
      `Invalid request sent to ${providerLabel}.`,
      { originalMessage: message, status, ...context },
      provider
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
      `${providerLabel} is temporarily unavailable.`,
      { status, ...context },
      provider
    );
  }

  // 9. Generic Fallback
  return new AiProviderError(
    `An error occurred communicating with ${providerLabel}.`,
    status >= 400 && status < 600 ? status : 500,
    'AI_PROVIDER_ERROR',
    { originalMessage: message, status, ...context },
    provider
  );
}
