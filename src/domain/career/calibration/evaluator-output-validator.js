/**
 * @file Evaluator Output Validator & Adversarial Defense (P85)
 *
 * Implements strict schema validation and adversarial defense for external model outputs:
 * - Preserves raw response string and SHA-256 hash before parsing
 * - Rejects malformed JSON, missing dimensions, and out-of-range scores
 * - Defends against prompt injection (resume/JD text containing "IGNORE PREVIOUS INSTRUCTIONS")
 * - Enforces the RAW -> Schema validation -> NORMALIZED -> CALIBRATION pipeline
 */

import { computeSha256 } from './evaluator-provenance.service.js';
import { MultiModelEvaluationRecordSchema } from './multimodel-evaluation.schemas.js';

export const PROMPT_INJECTION_PATTERNS = Object.freeze([
  /ignore.*(previous|all).*instructions/i,
  /system.*override/i,
  /score.*(this.*resume.*100|100.*out.*of.*100)/i,
  /disable.*(evidence|validation|gate)/i,
  /production.*score.*should.*be/i,
]);

/**
 * Validates and preserves raw evaluator responses.
 *
 * @param {string|object} rawResponse Raw string or object from LLM provider
 * @param {object} [metadata] Optional metadata
 * @returns {{ rawResponseText: string, rawResponseSha256: string, validatedRecord: object, injectionDetected: boolean }}
 */
export function validateEvaluatorResponse(rawResponse, metadata = {}) {
  if (rawResponse === null || rawResponse === undefined) {
    throw new Error('rawResponse is required');
  }

  const rawResponseText = typeof rawResponse === 'string'
    ? rawResponse
    : JSON.stringify(rawResponse, null, 2);

  const rawResponseSha256 = computeSha256(rawResponseText);

  // Check for prompt injection text in response
  let injectionDetected = false;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(rawResponseText)) {
      injectionDetected = true;
      break;
    }
  }

  let parsedJson;
  try {
    parsedJson = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse;
  } catch (err) {
    throw new Error(`Malformed JSON response from evaluator: ${err.message}`);
  }

  // Schema validation against MultiModelEvaluationRecordSchema
  const validatedRecord = MultiModelEvaluationRecordSchema.parse(parsedJson);

  // Additional range and sanity verification
  for (const [key, val] of Object.entries(validatedRecord.scores)) {
    if (typeof val !== 'number' || val < 0 || val > 100 || Number.isNaN(val)) {
      throw new Error(`Score for dimension "${key}" is invalid: ${val}. Must be between 0 and 100.`);
    }
  }

  return {
    rawResponseText,
    rawResponseSha256,
    validatedRecord,
    injectionDetected,
  };
}

/**
 * Validates that an injected adversarial string in resume or JD text does NOT alter
 * deterministic scoring weights or produce unauthorized command execution.
 *
 * @param {string} text Sample input text
 * @returns {boolean} True if adversarial attack text is detected in candidate input
 */
export function detectAdversarialInputPatterns(text) {
  if (typeof text !== 'string') return false;
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
