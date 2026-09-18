/**
 * @file Unit Test: P85 Human Label Integrity & Recruiter Grounding
 *
 * Verifies:
 * 1. Rule 48: No human claims without human data (LLMs cannot be mislabeled as human recruiters).
 * 2. Governance reports record humanRecruiterClaimStatus as SYNTHETIC_PROXY_ONLY when using LLMs.
 * 3. Regression test ensuring marketing phrases ("recruiter validated", "human agreement") are rejected.
 * 4. Genuine human evaluator records are permitted to use HUMAN_RECRUITER.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createEvaluatorProvenanceRecord,
} from '../../src/domain/career/calibration/evaluator-provenance.service.js';

import {
  buildBenchmarkGovernanceReport,
} from '../../src/domain/career/calibration/benchmark-governance.service.js';

import {
  P84_TARGET_JOB,
  P84_RESUME_TEXT,
  P84_EVALUATIONS,
  P85_PROVENANCE_RECORDS,
} from '../../src/domain/career/calibration/fixtures/p84-multimodel-fixtures.js';

import { buildBlindEvaluatorPayload } from '../../src/domain/career/calibration/blind-input-isolation.service.js';

describe('P85: Human Label Integrity & Recruiter Grounding', () => {
  const mockEngineReport = Object.freeze({
    scoreVersion: 'p82.0',
    publishableScore: 78,
    headlineScore: 78,
    dimensions: {
      atsParseability: { score: 85 },
      jobMatch: { score: 75 },
      keywordCoverage: { score: 70 },
      contentQuality: { score: 72 },
    },
  });

  it('1. Rejects labeling external LLMs (Claude, Gemini, Grok) as HUMAN_RECRUITER', () => {
    const providers = ['claude', 'gemini', 'grok'];

    for (const provider of providers) {
      assert.throws(
        () =>
          createEvaluatorProvenanceRecord({
            evaluationId: `eval-${provider}-001`,
            evaluatorType: 'HUMAN_RECRUITER', // FORBIDDEN FOR LLMs
            provider,
            model: `${provider}-test-model`,
            promptVersion: 'p85-v1',
            evaluationTimestamp: '2026-09-18T00:00:00.000Z',
            inputResumeSha256: 'a'.repeat(64),
            inputJobDescriptionSha256: 'b'.repeat(64),
            rawResponse: { ok: true },
          }),
        /cannot be labeled as "HUMAN_RECRUITER"/
      );
    }
  });

  it('2. Benchmark governance report records SYNTHETIC_PROXY_ONLY when all evaluators are LLMs', () => {
    const blindPayload = buildBlindEvaluatorPayload({
      jobDescription: P84_TARGET_JOB,
      resumeText: P84_RESUME_TEXT,
    });

    const report = buildBenchmarkGovernanceReport({
      engineReport: mockEngineReport,
      evaluations: P84_EVALUATIONS,
      provenanceRecords: P85_PROVENANCE_RECORDS,
      blindPayload,
      inputHashes: {
        inputResumeSha256: 'a'.repeat(64),
        inputJobDescriptionSha256: 'b'.repeat(64),
        inputPdfSha256: null,
        extractedTextSha256: null,
      },
    });

    assert.equal(report.evaluatorReliability.humanRecruiterClaimStatus, 'SYNTHETIC_PROXY_ONLY');
    assert.equal(report.governanceVerdict.humanValidation, 'NOT_ESTABLISHED');
    assert.match(report.limitations[0], /synthetic LLM proxies, NOT verified human technical recruiters/);
  });

  it('3. Allows genuine human reviewers to use HUMAN_RECRUITER evaluatorType', () => {
    const humanProvenance = createEvaluatorProvenanceRecord({
      evaluationId: 'eval-human-recruiter-001',
      evaluatorType: 'HUMAN_RECRUITER',
      provider: 'human_review_panel',
      model: 'human-recruiter-verified',
      modelVersion: 'staff-recruiter-tier1',
      promptVersion: 'p85-human-rubric-v1',
      evaluationTimestamp: '2026-09-18T00:00:00.000Z',
      inputResumeSha256: 'a'.repeat(64),
      inputJobDescriptionSha256: 'b'.repeat(64),
      rawResponse: { rubricScores: { jobMatch: 85 } },
    });

    assert.equal(humanProvenance.evaluatorType, 'HUMAN_RECRUITER');
    assert.equal(humanProvenance.sourceType, 'VERIFIED_HUMAN_EVALUATOR');
  });
});
