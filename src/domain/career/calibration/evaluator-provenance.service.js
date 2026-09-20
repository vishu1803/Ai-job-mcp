/**
 * @file Evaluator Provenance Service (P85)
 *
 * Implements cryptographic provenance tracking for external multi-model evaluators:
 * - Canonical evaluator input package hashing (evaluatorInputDigest)
 * - Exact model identity and version verification (rejects bare "Claude", "Gemini", "Grok")
 * - Raw response hashing and audit retention (outputDigest, responseSha256)
 * - Honest representation of provider generation parameters (null instead of fabricated values)
 */

import { createHash } from 'node:crypto';
import { EvaluatorProvenanceSchema, EvaluatorTypeEnum } from './multimodel-evaluation.schemas.js';

/**
 * Computes deterministic SHA-256 hash for string or buffer data.
 *
 * @param {string|Buffer} data
 * @returns {string} 64-character lowercase hex digest
 */
export function computeSha256(data) {
  if (data === null || data === undefined) {
    throw new TypeError('Cannot compute SHA-256 hash of null or undefined');
  }
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Deterministically sorts object keys recursively for canonical serialization.
 *
 * @param {unknown} obj
 * @returns {unknown}
 */
export function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj).sort();
  const result = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson(obj[key]);
  }
  return result;
}

/**
 * Known supported specific model identifiers. Bare provider names are rejected.
 */
export const ALLOWED_MODEL_IDENTIFIERS = Object.freeze([
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'gemini-1.5-pro-002',
  'gemini-1.5-pro-latest',
  'gemini-2.0-flash',
  'grok-2-1212',
  'grok-2-latest',
  'human-recruiter-verified',
]);

/**
 * Builds the canonical evaluator input package and computes its deterministic digest.
 *
 * @param {object} params
 * @param {string} params.inputPdfSha256
 * @param {string} params.extractedTextSha256
 * @param {string} params.inputJobDescriptionSha256
 * @param {string} params.promptDigest
 * @param {string} [params.schemaVersion='p85.0']
 * @param {string} params.evaluatorProvider
 * @param {string} params.modelId
 * @param {string|null} [params.modelVersion=null]
 * @param {number|null} [params.temperature=null]
 * @param {object} [params.generationParameters={}]
 * @param {string} params.evaluationTimestamp
 * @param {string} [params.anonymousCandidateId='candidate-anon-001']
 * @param {string} [params.anonymousJobId='job-anon-001']
 * @returns {{ canonicalPackage: object, evaluatorInputDigest: string }}
 */
export function buildCanonicalEvaluatorPackage(params) {
  const {
    inputPdfSha256,
    extractedTextSha256,
    inputJobDescriptionSha256,
    promptDigest,
    schemaVersion = 'p85.0',
    evaluatorProvider,
    modelId,
    modelVersion = null,
    temperature = null,
    generationParameters = {},
    evaluationTimestamp,
    anonymousCandidateId = 'candidate-anon-001',
    anonymousJobId = 'job-anon-001',
  } = params;

  if (!modelId || typeof modelId !== 'string') {
    throw new Error('Specific modelId is required');
  }

  // Reject bare provider names ("Claude", "Gemini", "Grok")
  const normalizedModelId = modelId.toLowerCase().trim();
  if (['claude', 'gemini', 'grok'].includes(normalizedModelId)) {
    throw new Error(
      `Bare provider name "${modelId}" is not a reproducible evaluator identity. Must provide specific model identifier.`
    );
  }

  const canonicalPackage = {
    anonymousCandidateId,
    anonymousJobId,
    evaluationTimestamp,
    evaluatorProvider,
    evaluatorSchemaVersion: schemaVersion,
    exactExtractedTextSha256: extractedTextSha256 ?? null,
    exactJobDescriptionSha256: inputJobDescriptionSha256,
    exactPdfSha256: inputPdfSha256 ?? null,
    generationParameters: canonicalizeJson(generationParameters),
    modelIdentifier: modelId,
    modelVersion,
    promptSha256: promptDigest,
    temperature,
  };

  const serialized = JSON.stringify(canonicalizeJson(canonicalPackage));
  const evaluatorInputDigest = computeSha256(serialized);

  return {
    canonicalPackage,
    evaluatorInputDigest,
  };
}

/**
 * Creates and validates an EvaluatorProvenance record.
 *
 * @param {object} params
 * @param {string} params.evaluationId
 * @param {string} [params.evaluatorType='LLM_EXTERNAL']
 * @param {string} params.provider
 * @param {string} params.model
 * @param {string|null} [params.modelVersion=null]
 * @param {string} params.promptVersion
 * @param {string|null} [params.promptDigest=null]
 * @param {string} [params.rubricVersion='p84-rubric-v1']
 * @param {string} params.evaluationTimestamp
 * @param {string} params.inputResumeSha256
 * @param {string} params.inputJobDescriptionSha256
 * @param {string|null} [params.inputPdfSha256=null]
 * @param {string|null} [params.extractedTextSha256=null]
 * @param {string|null} [params.inputDigest=null]
 * @param {string|object} params.rawResponse
 * @param {number|null} [params.temperature=null]
 * @param {number|null} [params.seed=null]
 * @param {object} [params.generationParameters={}]
 * @param {string} [params.sourceType]
 * @returns {object} Validated EvaluatorProvenanceSchema object
 */
export function createEvaluatorProvenanceRecord(params) {
  const {
    evaluationId,
    evaluatorType = 'LLM_EXTERNAL',
    provider,
    model,
    modelVersion = null,
    promptVersion,
    promptDigest = null,
    rubricVersion = 'p84-rubric-v1',
    evaluationTimestamp,
    inputResumeSha256,
    inputJobDescriptionSha256,
    inputPdfSha256 = null,
    extractedTextSha256 = null,
    inputDigest = null,
    rawResponse,
    temperature = null,
    seed = null,
    generationParameters = {},
    sourceType,
  } = params;

  // Reject bare provider names
  const normalizedModel = (model || '').toLowerCase().trim();
  if (['claude', 'gemini', 'grok'].includes(normalizedModel)) {
    throw new Error(
      `Bare provider name "${model}" is not a reproducible evaluator identity. Must provide specific model identifier.`
    );
  }

  // Prevent mislabeling LLMs as human recruiters
  if (
    evaluatorType !== 'LLM_EXTERNAL' &&
    ['claude', 'gemini', 'grok'].includes(provider.toLowerCase())
  ) {
    throw new Error(
      `External LLM provider "${provider}" cannot be labeled as "${evaluatorType}". Must be LLM_EXTERNAL.`
    );
  }

  // Compute raw response hash
  const rawString =
    typeof rawResponse === 'string' ? rawResponse : JSON.stringify(canonicalizeJson(rawResponse));
  const outputDigest = computeSha256(rawString);

  const derivedSourceType =
    sourceType ??
    (evaluatorType === 'LLM_EXTERNAL' ? 'SYNTHETIC_LLM_EVALUATOR' : 'VERIFIED_HUMAN_EVALUATOR');

  const record = {
    evaluationId,
    evaluatorType,
    provider,
    model,
    modelVersion,
    promptVersion,
    promptDigest,
    rubricVersion,
    evaluationTimestamp,
    inputResumeSha256,
    inputJobDescriptionSha256,
    inputPdfSha256,
    extractedTextSha256,
    inputDigest,
    outputDigest,
    responseSha256: outputDigest,
    temperature,
    seed,
    generationParameters,
    schemaVersion: 'p85.0',
    sourceType: derivedSourceType,
  };

  return EvaluatorProvenanceSchema.parse(record);
}
