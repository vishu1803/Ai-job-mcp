/**
 * @file Unit Test: P85 Evaluator Provenance Service
 *
 * Verifies:
 * 1. Deterministic hashing of input package components.
 * 2. Canonical evaluator input package hashing (evaluatorInputDigest).
 * 3. Specific model identity enforcement (rejects bare "Claude", "Gemini", "Grok").
 * 4. Raw response hashing (outputDigest, responseSha256).
 * 5. Honest nullability for unexposed generation parameters (temperature, seed).
 * 6. Protection against mislabeling LLMs as human recruiters.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSha256,
  canonicalizeJson,
  buildCanonicalEvaluatorPackage,
  createEvaluatorProvenanceRecord,
} from '../../src/domain/career/calibration/evaluator-provenance.service.js';

describe('P85: Evaluator Provenance Service', () => {
  it('1. Computes deterministic SHA-256 digests for string and buffer inputs', () => {
    const text = 'ScaleCraft Labs Full Stack Software Engineer';
    const hash1 = computeSha256(text);
    const hash2 = computeSha256(Buffer.from(text, 'utf8'));

    assert.equal(hash1.length, 64);
    assert.equal(hash1, hash2);
    assert.equal(hash1, computeSha256(text)); // Pure deterministic
  });

  it('2. Canonicalizes JSON keys recursively for key-order invariance', () => {
    const objA = { z: 1, a: { y: 2, b: 3 } };
    const objB = { a: { b: 3, y: 2 }, z: 1 };

    const canonicalA = canonicalizeJson(objA);
    const canonicalB = canonicalizeJson(objB);

    assert.equal(JSON.stringify(canonicalA), JSON.stringify(canonicalB));
    assert.equal(computeSha256(JSON.stringify(canonicalA)), computeSha256(JSON.stringify(canonicalB)));
  });

  it('3. Builds canonical evaluator package and calculates reproducible evaluatorInputDigest', () => {
    const params = {
      inputPdfSha256: 'a'.repeat(64),
      extractedTextSha256: 'b'.repeat(64),
      inputJobDescriptionSha256: 'c'.repeat(64),
      promptDigest: 'd'.repeat(64),
      schemaVersion: 'p85.0',
      evaluatorProvider: 'claude',
      modelId: 'claude-3-7-sonnet-20250219',
      modelVersion: '2025-02-19',
      temperature: null,
      generationParameters: { maxTokens: 4096 },
      evaluationTimestamp: '2026-09-18T00:00:00.000Z',
    };

    const pkg1 = buildCanonicalEvaluatorPackage(params);
    const pkg2 = buildCanonicalEvaluatorPackage(params);

    assert.equal(pkg1.evaluatorInputDigest.length, 64);
    assert.equal(pkg1.evaluatorInputDigest, pkg2.evaluatorInputDigest);

    // If PDF changes by even one byte, the digest MUST change
    const pkgChanged = buildCanonicalEvaluatorPackage({
      ...params,
      inputPdfSha256: 'f'.repeat(64),
    });
    assert.notEqual(pkg1.evaluatorInputDigest, pkgChanged.evaluatorInputDigest);
  });

  it('4. Rejects bare provider names as model identifiers', () => {
    const invalidModels = ['claude', 'Claude', 'gemini', 'GEMINI', 'grok', 'Grok'];

    for (const model of invalidModels) {
      assert.throws(
        () =>
          buildCanonicalEvaluatorPackage({
            inputPdfSha256: 'a'.repeat(64),
            extractedTextSha256: 'b'.repeat(64),
            inputJobDescriptionSha256: 'c'.repeat(64),
            promptDigest: 'd'.repeat(64),
            evaluatorProvider: 'claude',
            modelId: model,
            evaluationTimestamp: '2026-09-18T00:00:00.000Z',
          }),
        /not a reproducible evaluator identity/
      );
    }
  });

  it('5. Creates full EvaluatorProvenance record with raw response hashing and honest nulls', () => {
    const rawResponse = { scores: { overall: 70 }, recommendation: 'MODERATE_MATCH' };

    const record = createEvaluatorProvenanceRecord({
      evaluationId: 'eval-p85-test-001',
      evaluatorType: 'LLM_EXTERNAL',
      provider: 'claude',
      model: 'claude-3-7-sonnet-20250219',
      promptVersion: 'p85-evaluator-v1',
      promptDigest: 'e'.repeat(64),
      evaluationTimestamp: '2026-09-18T00:00:00.000Z',
      inputResumeSha256: '1'.repeat(64),
      inputJobDescriptionSha256: '2'.repeat(64),
      rawResponse,
      temperature: null, // Honest nullability
      seed: null,
    });

    assert.equal(record.evaluatorType, 'LLM_EXTERNAL');
    assert.equal(record.temperature, null);
    assert.equal(record.seed, null);
    assert.equal(record.outputDigest.length, 64);
    assert.equal(record.responseSha256, record.outputDigest);
    assert.equal(record.sourceType, 'SYNTHETIC_LLM_EVALUATOR');
  });

  it('6. Forbids mislabeling external LLMs as human recruiters', () => {
    assert.throws(
      () =>
        createEvaluatorProvenanceRecord({
          evaluationId: 'eval-mislabel-001',
          evaluatorType: 'HUMAN_RECRUITER', // FORBIDDEN for Claude
          provider: 'claude',
          model: 'claude-3-7-sonnet-20250219',
          promptVersion: 'p85-evaluator-v1',
          evaluationTimestamp: '2026-09-18T00:00:00.000Z',
          inputResumeSha256: '1'.repeat(64),
          inputJobDescriptionSha256: '2'.repeat(64),
          rawResponse: { ok: true },
        }),
      /cannot be labeled as "HUMAN_RECRUITER"/
    );
  });
});
