/**
 * @file Blind Input Isolation Service (P85)
 *
 * Enforces strict whitelist-only sanitization of external evaluator payloads.
 * Guarantees that internal scoring metrics, weights, thresholds, previous evaluator
 * outputs, and expected benchmark scores NEVER leak into external evaluator payloads.
 */

import { computeSha256, canonicalizeJson } from './evaluator-provenance.service.js';

export const FORBIDDEN_LEAKAGE_TOKENS = Object.freeze([
  'productionscore',
  'scoreversion',
  'expectedscore',
  'p82',
  'p83',
  'p84',
  'goldlabels',
  'testassertions',
  'threshold',
  'engineweaknesses',
  'previousmodeloutputs',
  'referencescore',
  'calibrationstatistics',
  'internalscore',
  'publishablescore',
]);

/**
 * Builds an isolated, strictly-whitelisted evaluator payload from raw internal state.
 *
 * MANDATORY INVARIANT: Whitelist-only construction.
 * Blacklisting or object spreading with deletes is strictly prohibited.
 *
 * @param {object} source Raw internal state
 * @returns {object} Sanitized blind evaluator payload
 */
export function buildBlindEvaluatorPayload(source) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('Source must be a valid object');
  }

  const rawJd = source.jobDescription || {};
  const sanitizedJd = {
    id: String(rawJd.id || 'job-target-001'),
    title: String(rawJd.title || ''),
    company: String(rawJd.company || ''),
    description: String(rawJd.description || ''),
    requirements: Array.isArray(rawJd.requirements)
      ? rawJd.requirements.map((r) => ({
          skill: String(r.skill || ''),
          importance: String(r.importance || 'REQUIRED'),
        }))
      : [],
  };

  const resumeText = typeof source.resumeText === 'string' ? source.resumeText : '';
  const pdfText = typeof source.pdfText === 'string' ? source.pdfText : null;
  const evaluationRubric = typeof source.evaluationRubric === 'string' ? source.evaluationRubric : '';
  const evaluatorInstructions = typeof source.evaluatorInstructions === 'string' ? source.evaluatorInstructions : '';
  const anonymousCandidateId = typeof source.anonymousCandidateId === 'string' ? source.anonymousCandidateId : 'candidate-anon-001';
  const anonymousJobId = typeof source.anonymousJobId === 'string' ? source.anonymousJobId : 'job-anon-001';

  // Explicit whitelist construction - NO spreading of source
  const payload = {
    anonymousCandidateId,
    anonymousJobId,
    evaluationRubric,
    evaluatorInstructions,
    jobDescription: sanitizedJd,
    pdfText,
    resumeText,
  };

  return payload;
}

/**
 * Verifies that a serialized payload or payload object contains zero forbidden leakage tokens.
 *
 * @param {object|string} payload
 * @returns {{ isIsolated: boolean, leakedKeys: string[] }}
 */
export function verifyBlindIsolation(payload) {
  const jsonString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const normalized = jsonString.toLowerCase().replace(/[^a-z0-9]/g, '');

  const leakedKeys = [];
  for (const token of FORBIDDEN_LEAKAGE_TOKENS) {
    if (normalized.includes(token)) {
      leakedKeys.push(token);
    }
  }

  return {
    isIsolated: leakedKeys.length === 0,
    leakedKeys,
  };
}

/**
 * Computes canonical input hashes for candidate resume, JD, PDF, and extracted text.
 *
 * @param {object} params
 * @param {object|string} params.jobDescription
 * @param {string} params.resumeText
 * @param {Buffer|string|null} [params.pdfBuffer=null]
 * @param {string|null} [params.extractedPdfText=null]
 * @returns {object} Object with 4 canonical hashes
 */
export function computeCanonicalInputHashes(params) {
  const { jobDescription, resumeText, pdfBuffer = null, extractedPdfText = null } = params;

  if (!jobDescription) {
    throw new Error('jobDescription is required');
  }
  if (typeof resumeText !== 'string') {
    throw new Error('resumeText string is required');
  }

  const jdCanonical = typeof jobDescription === 'string'
    ? jobDescription
    : JSON.stringify(canonicalizeJson(jobDescription));

  const inputJobDescriptionSha256 = computeSha256(jdCanonical);
  const inputResumeSha256 = computeSha256(resumeText);
  const inputPdfSha256 = pdfBuffer ? computeSha256(pdfBuffer) : null;
  const extractedTextSha256 = extractedPdfText ? computeSha256(extractedPdfText) : null;

  return {
    inputJobDescriptionSha256,
    inputResumeSha256,
    inputPdfSha256,
    extractedTextSha256,
  };
}
