import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { atsBenchmarkRunner } from '../../evaluation/benchmark/ats-benchmark-runner.js';
import { computeRetrievalMetrics, computeNdcg } from '../../evaluation/benchmark/metrics.js';

describe('ATS Benchmark & Scoring Stability Framework (Phases 17 & 18)', () => {
  describe('Phase 17: Retrieval & Ranking Metrics', () => {
    it('calculates precision, recall, and F1 accurately', () => {
      const retrieved = ['Go', 'Kubernetes', 'Docker', 'Ruby'];
      const groundTruth = ['Go', 'Kubernetes', 'Docker', 'PostgreSQL'];

      const metrics = computeRetrievalMetrics(retrieved, groundTruth);
      assert.equal(metrics.precision, 0.75); // 3 out of 4 retrieved are true
      assert.equal(metrics.recall, 0.75); // 3 out of 4 ground truth found
      assert.equal(metrics.f1, 0.75);
    });

    it('calculates NDCG ranking correlation correctly', () => {
      const ideal = [3, 2, 1, 0];
      const perfect = [3, 2, 1, 0];
      assert.equal(computeNdcg(perfect, ideal), 1.0);

      const imperfect = [2, 3, 1, 0];
      const score = computeNdcg(imperfect, ideal);
      assert.ok(score >= 0.8 && score < 1.0);
    });
  });

  describe('Phases 17 & 18: Full Benchmark Suite Execution', () => {
    it('executes the full benchmark harness and verifies stability & anti-gaming', async () => {
      const benchmark = await atsBenchmarkRunner.runSuite();

      assert.equal(benchmark.evaluatedCandidatesCount, 4);
      assert.ok(benchmark.metrics.retrieval.f1 >= 0.9);
      assert.ok(benchmark.metrics.ndcg >= 0.85);

      // Verify zero variance (100% deterministic stability)
      assert.equal(benchmark.metrics.variance, 0.0);
      assert.equal(benchmark.metrics.stabilityPassed, true);

      // Verify anti-gaming: spam candidate ranked lower than authentic senior candidate
      assert.equal(benchmark.metrics.antiGamingPassed, true);

      // Verify statistical calibration integration (P82)
      assert.ok(benchmark.metrics.calibration);
      assert.equal(typeof benchmark.metrics.calibration.spearmanRho, 'number');
      assert.equal(typeof benchmark.metrics.calibration.pearsonR, 'number');
      assert.ok(benchmark.metrics.calibration.mae >= 0);
      assert.ok(benchmark.metrics.calibration.rmse >= 0);
      assert.ok(benchmark.metrics.calibration.classificationMetrics);

      // Senior backend engineer is top ranked
      assert.equal(benchmark.results[0].candidateId, 'cand-senior-backend');
      assert.ok(benchmark.results[0].fitScore >= 75.0);
    });
  });
});
