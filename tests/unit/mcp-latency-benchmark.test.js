/**
 * @file Unit Tests for MCP Latency Benchmark Statistics & Regression Logic (P8-006)
 *
 * Verifies:
 * 1. computeMean with various arrays (empty, single, uniform, normal).
 * 2. computeStdDev sample standard deviation.
 * 3. computePercentile (p50, p95, p99) against known mathematical reference distributions.
 * 4. computeMin and computeMax handling edge cases.
 * 5. computeErrorRate precision.
 * 6. summarizeDistribution aggregation.
 * 7. evaluateRegression enforcing SLA ceilings (<1500ms), baseline degradation (>25%), error-rate gates, and tool-specific targets.
 *
 * Fast, deterministic, 100% in-memory, 0 database calls.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  computeMean,
  computeStdDev,
  computePercentile,
  computeMin,
  computeMax,
  computeErrorRate,
  summarizeDistribution,
  evaluateRegression,
  TOOL_P95_TARGETS,
  GLOBAL_P95_SLA_CEILING_MS,
  MAX_BASELINE_REGRESSION_FACTOR,
} from '../../src/utils/benchmark-stats.js';

describe('MCP Latency Benchmark Statistics Unit Tests (P8-006)', () => {
  describe('computeMean', () => {
    it('returns 0 for empty or invalid array', () => {
      assert.strictEqual(computeMean([]), 0);
      assert.strictEqual(computeMean(null), 0);
      assert.strictEqual(computeMean(undefined), 0);
    });

    it('computes exact mean for single and multiple elements', () => {
      assert.strictEqual(computeMean([42]), 42);
      assert.strictEqual(computeMean([10, 20, 30]), 20);
      assert.strictEqual(computeMean([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 5.5);
    });

    it('ignores non-numeric values safely', () => {
      assert.strictEqual(computeMean([10, 'invalid', 20]), 10);
    });
  });

  describe('computeStdDev', () => {
    it('returns 0 for empty, single-element, or invalid array', () => {
      assert.strictEqual(computeStdDev([]), 0);
      assert.strictEqual(computeStdDev([100]), 0);
      assert.strictEqual(computeStdDev(null), 0);
    });

    it('computes sample standard deviation accurately', () => {
      // For [2, 4, 4, 4, 5, 5, 7, 9]: mean=5, sample variance=4.5714..., stddev≈2.138
      const samples = [2, 4, 4, 4, 5, 5, 7, 9];
      const stddev = computeStdDev(samples);
      assert.strictEqual(Number(stddev.toFixed(3)), 2.138);
    });
  });

  describe('computePercentile', () => {
    it('returns 0 for empty array', () => {
      assert.strictEqual(computePercentile([], 50), 0);
      assert.strictEqual(computePercentile([], 95), 0);
    });

    it('returns the single element for 1-element array', () => {
      assert.strictEqual(computePercentile([100], 50), 100);
      assert.strictEqual(computePercentile([100], 95), 100);
      assert.strictEqual(computePercentile([100], 99), 100);
    });

    it('returns min and max for 0 and 100 percentiles', () => {
      const data = [10, 20, 30, 40, 50];
      assert.strictEqual(computePercentile(data, 0), 10);
      assert.strictEqual(computePercentile(data, 100), 50);
    });

    it('computes exact median / p50 for odd and even length arrays', () => {
      assert.strictEqual(computePercentile([10, 20, 30], 50), 20);
      assert.strictEqual(computePercentile([10, 20, 30, 40], 50), 25);
    });

    it('computes standard p95 and p99 percentiles across 100 sequential numbers (1..100)', () => {
      const data100 = Array.from({ length: 100 }, (_, i) => i + 1); // 1 to 100
      // For 100 items indexed 0 to 99:
      // p50 index = 0.50 * 99 = 49.5 -> (50 + 51)/2 = 50.5
      // p95 index = 0.95 * 99 = 94.05 -> 95 + 0.05*(96-95) = 95.05
      // p99 index = 0.99 * 99 = 98.01 -> 99 + 0.01*(100-99) = 99.01
      const p50 = computePercentile(data100, 50);
      const p95 = computePercentile(data100, 95);
      const p99 = computePercentile(data100, 99);

      assert.strictEqual(p50, 50.5);
      assert.strictEqual(Number(p95.toFixed(2)), 95.05);
      assert.strictEqual(Number(p99.toFixed(2)), 99.01);
    });

    it('handles unsorted input arrays deterministically', () => {
      const unsorted = [50, 10, 40, 20, 30];
      assert.strictEqual(computePercentile(unsorted, 50), 30);
    });
  });

  describe('computeMin and computeMax', () => {
    it('returns min and max accurately', () => {
      const values = [45, 12, 89, 3, 72];
      assert.strictEqual(computeMin(values), 3);
      assert.strictEqual(computeMax(values), 89);
    });

    it('handles empty arrays safely', () => {
      assert.strictEqual(computeMin([]), 0);
      assert.strictEqual(computeMax([]), 0);
    });
  });

  describe('computeErrorRate', () => {
    it('computes 0% error rate when 0 errors', () => {
      assert.strictEqual(computeErrorRate(0, 100), 0);
    });

    it('computes exact error rate percentage', () => {
      assert.strictEqual(computeErrorRate(5, 100), 5.0);
      assert.strictEqual(computeErrorRate(1, 3), 33.33);
      assert.strictEqual(computeErrorRate(0, 0), 0);
    });
  });

  describe('summarizeDistribution', () => {
    it('generates a complete formatted statistical summary', () => {
      const latencies = [100, 150, 200, 250, 300];
      const summary = summarizeDistribution(latencies, 0);

      assert.strictEqual(summary.count, 5);
      assert.strictEqual(summary.totalRequests, 5);
      assert.strictEqual(summary.minMs, 100);
      assert.strictEqual(summary.maxMs, 300);
      assert.strictEqual(summary.meanMs, 200);
      assert.strictEqual(summary.p50Ms, 200);
      assert.strictEqual(summary.p95Ms, 290);
      assert.strictEqual(summary.p99Ms, 298);
      assert.strictEqual(summary.errorRate, 0);
    });
  });

  describe('evaluateRegression', () => {
    it('PASSES when p95 is below SLA and tool target with 0% errors', () => {
      const result = evaluateRegression({
        tool: 'get_candidate_profile',
        p95Ms: 250,
        errorRate: 0.0,
      });

      assert.strictEqual(result.status, 'PASS');
      assert.strictEqual(result.reasons.length, 0);
      assert.strictEqual(result.targetMs, 350);
    });

    it('FAILS when errorRate > 0%', () => {
      const result = evaluateRegression({
        tool: 'get_candidate_profile',
        p95Ms: 200,
        errorRate: 1.5,
      });

      assert.strictEqual(result.status, 'FAIL');
      assert.match(result.reasons[0], /Error rate 1.5% exceeds 0.0% tolerance/);
    });

    it('FAILS when p95 exceeds 1500ms global SLA ceiling', () => {
      const result = evaluateRegression({
        tool: 'generate_tailored_resume',
        p95Ms: 1620,
        errorRate: 0.0,
      });

      assert.strictEqual(result.status, 'FAIL');
      assert.match(result.reasons[0], /exceeds the 1500ms global MCP_HTTP SLA ceiling/);
    });

    it('FAILS when p95 degrades by >25% against baseline', () => {
      const result = evaluateRegression({
        tool: 'analyze_job_fit',
        p95Ms: 550,
        errorRate: 0.0,
        baseline: { p95Ms: 400 }, // Max allowed: 400 * 1.25 = 500
      });

      assert.strictEqual(result.status, 'FAIL');
      assert.match(result.reasons[0], /degraded by >25% against baseline/);
    });

    it('WARNS when p95 exceeds tool-specific target but is under 1500ms', () => {
      const result = evaluateRegression({
        tool: 'get_candidate_profile',
        p95Ms: 420, // Tool target is 350ms, global SLA is 1500ms
        errorRate: 0.0,
      });

      assert.strictEqual(result.status, 'WARN');
      assert.match(result.reasons[0], /exceeds tool-specific target \(350ms\) by 70.0ms/);
    });
  });

  describe('Constants Verification', () => {
    it('verifies all 7 tools are present in TOOL_P95_TARGETS', () => {
      const expectedTools = [
        'get_candidate_profile',
        'list_verified_skills',
        'inspect_project_evidence',
        'analyze_job_fit',
        'recommend_portfolio_projects',
        'generate_tailored_resume',
        'draft_cover_letter',
      ];

      for (const tool of expectedTools) {
        assert.ok(TOOL_P95_TARGETS[tool] > 0, `Missing target for tool: ${tool}`);
      }
      assert.strictEqual(GLOBAL_P95_SLA_CEILING_MS, 1500);
      assert.strictEqual(MAX_BASELINE_REGRESSION_FACTOR, 1.25);
    });
  });
});
