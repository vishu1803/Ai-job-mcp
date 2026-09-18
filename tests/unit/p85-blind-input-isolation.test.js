/**
 * @file Unit Test: P85 Blind Input Isolation Service
 *
 * Verifies:
 * 1. Strict whitelist-based payload construction (dropping all forbidden fields).
 * 2. Physical serialization verification (asserts forbidden tokens cannot cross boundary).
 * 3. Deep nested leakage defense (metadata.engine.score, debug.previousEvaluation, etc.).
 * 4. Payload digest invariance (changing forbidden internal scores does not alter evaluator payload).
 * 5. Canonical input hash calculations.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlindEvaluatorPayload,
  verifyBlindIsolation,
  computeCanonicalInputHashes,
} from '../../src/domain/career/calibration/blind-input-isolation.service.js';
import { computeSha256 } from '../../src/domain/career/calibration/evaluator-provenance.service.js';

describe('P85: Blind Input Isolation Service', () => {
  const contaminatedInternalState = {
    // ── Whitelist Allowed Fields ──────────────────────────────────────────
    jobDescription: {
      id: 'job-p85-001',
      title: 'Full Stack Engineer',
      company: 'ScaleCraft Labs',
      description: 'Full stack development with Python and TypeScript',
      requirements: [{ skill: 'Python', importance: 'REQUIRED' }],
    },
    resumeText: 'Vishwanath Nishad - Full Stack Engineer',
    pdfText: 'Vishwanath Nishad PDF Text Stream',
    evaluationRubric: 'Standard 6-dimension evaluation rubric',
    evaluatorInstructions: 'Evaluate candidate objectively against requirements.',
    anonymousCandidateId: 'cand-001',
    anonymousJobId: 'job-001',

    // ── Strictly Forbidden Internal State (Must Never Leak!) ─────────────
    productionScore: 91,
    scoreVersion: 'p82.0',
    expectedScore: 91,
    threshold: 70,
    weights: { jobMatch: 0.40, atsParseability: 0.20 },
    p82Score: 91,
    p83Score: 88,
    p84Score: 78,
    goldLabels: ['QUALIFIED_HIRE'],
    testAssertions: { mustPass: true },
    engineWeaknesses: ['Degree field mismatch', 'Cloud platform missing'],
    previousModelOutputs: { claude: 70, gemini: 82, grok: 78 },
    calibrationStatistics: { mean: 76.67 },
    internalScore: 92,
    publishableScore: 91,
    metadata: {
      engine: {
        rawScore: 91,
        internalScore: 95,
      },
      calibration: {
        expected: 80,
      },
    },
  };

  it('1. Strict whitelist: Drops all internal scoring, thresholds, weights, and previous evaluations', () => {
    const blindPayload = buildBlindEvaluatorPayload(contaminatedInternalState);

    // Assert only allowed keys exist
    const allowedKeys = new Set([
      'anonymousCandidateId',
      'anonymousJobId',
      'evaluationRubric',
      'evaluatorInstructions',
      'jobDescription',
      'pdfText',
      'resumeText',
    ]);

    for (const key of Object.keys(blindPayload)) {
      assert.ok(allowedKeys.has(key), `Forbidden key "${key}" found in blind payload!`);
    }

    assert.equal(blindPayload.productionScore, undefined);
    assert.equal(blindPayload.scoreVersion, undefined);
    assert.equal(blindPayload.weights, undefined);
    assert.equal(blindPayload.threshold, undefined);
    assert.equal(blindPayload.p82Score, undefined);
    assert.equal(blindPayload.previousModelOutputs, undefined);
    assert.equal(blindPayload.metadata, undefined);
  });

  it('2. Physical serialization verification: Assert zero forbidden tokens exist in serialized JSON', () => {
    const blindPayload = buildBlindEvaluatorPayload(contaminatedInternalState);
    const serialized = JSON.stringify(blindPayload);

    const check = verifyBlindIsolation(serialized);
    assert.equal(check.isIsolated, true);
    assert.deepEqual(check.leakedKeys, []);

    // Also assert directly on forbidden words
    const forbiddenTokens = ['productionscore', 'p82', 'p83', 'p84', 'goldlabels', 'threshold'];
    for (const token of forbiddenTokens) {
      assert.equal(serialized.toLowerCase().includes(token), false, `Token "${token}" leaked into serialized payload!`);
    }
  });

  it('3. Payload digest invariance: Mutating forbidden scores does not change the evaluator payload hash', () => {
    const payload1 = buildBlindEvaluatorPayload(contaminatedInternalState);
    const hash1 = computeSha256(JSON.stringify(payload1));

    // Intentionally mutate forbidden scores in source object
    const mutatedState = {
      ...contaminatedInternalState,
      productionScore: 25, // Drastically changed!
      p82Score: 10,
      expectedScore: 99,
      weights: { jobMatch: 0.99 },
    };

    const payload2 = buildBlindEvaluatorPayload(mutatedState);
    const hash2 = computeSha256(JSON.stringify(payload2));

    assert.equal(hash1, hash2, 'Changing internal forbidden scores must NOT alter blind evaluator payload digest!');
  });

  it('4. Computes canonical input hashes for candidate resume, JD, PDF, and extracted text', () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 sample stream', 'latin1');
    const hashes = computeCanonicalInputHashes({
      jobDescription: contaminatedInternalState.jobDescription,
      resumeText: contaminatedInternalState.resumeText,
      pdfBuffer,
      extractedPdfText: contaminatedInternalState.pdfText,
    });

    assert.equal(hashes.inputResumeSha256.length, 64);
    assert.equal(hashes.inputJobDescriptionSha256.length, 64);
    assert.equal(hashes.inputPdfSha256.length, 64);
    assert.equal(hashes.extractedTextSha256.length, 64);

    // If PDF buffer changes by even 1 byte, inputPdfSha256 MUST change
    const modifiedBuffer = Buffer.from('%PDF-1.4 sample stream changed', 'latin1');
    const modifiedHashes = computeCanonicalInputHashes({
      jobDescription: contaminatedInternalState.jobDescription,
      resumeText: contaminatedInternalState.resumeText,
      pdfBuffer: modifiedBuffer,
      extractedPdfText: contaminatedInternalState.pdfText,
    });

    assert.notEqual(hashes.inputPdfSha256, modifiedHashes.inputPdfSha256);
  });
});
