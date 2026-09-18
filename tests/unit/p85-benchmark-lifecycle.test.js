/**
 * @file Unit Test: P85 Benchmark Lifecycle & Contamination Governance
 *
 * Verifies:
 * 1. State machine progression: DRAFT -> FROZEN -> COMPLETE.
 * 2. Immutable freeze: Modifying or adding samples to a FROZEN benchmark is strictly prohibited.
 * 3. Contamination gating: Contaminated samples cannot enter blind HOLDOUT datasets.
 * 4. Dataset hash sensitivity: Changing any sample changes the frozen datasetHash.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBenchmarkDataset,
  freezeBenchmarkDataset,
  addSampleToBenchmark,
} from '../../src/domain/career/calibration/benchmark-governance.service.js';

describe('P85: Benchmark Lifecycle & Contamination Governance', () => {
  const sampleClean = {
    id: 'sample-001',
    candidateName: 'Candidate A',
    contaminationStatus: 'CLEAN',
    role: 'Distributed Systems Engineer',
  };

  const sampleContaminated = {
    id: 'sample-002',
    candidateName: 'Candidate B (Used in Prompt Engineering)',
    contaminationStatus: 'CONTAMINATED',
    role: 'Frontend Engineer',
  };

  it('1. Creates benchmark in DRAFT state and allows adding clean samples', () => {
    const bm = createBenchmarkDataset({
      benchmarkId: 'bm-test-001',
      datasetVersion: 'v1.0.0',
      datasetRole: 'CALIBRATION',
    });

    assert.equal(bm.state, 'DRAFT');
    assert.equal(bm.datasetHash, null);

    addSampleToBenchmark(bm, sampleClean);
    assert.equal(bm.samples.length, 1);
  });

  it('2. Freezes benchmark dataset and computes immutable datasetHash', () => {
    const bm = createBenchmarkDataset({
      benchmarkId: 'bm-test-002',
      datasetVersion: 'v1.0.0',
      datasetRole: 'CALIBRATION',
      samples: [sampleClean],
    });

    const frozen = freezeBenchmarkDataset(bm);

    assert.equal(frozen.state, 'FROZEN');
    assert.ok(frozen.datasetHash);
    assert.equal(frozen.datasetHash.length, 64);
    assert.ok(Object.isFrozen(frozen));
  });

  it('3. Throws error when attempting to add samples to a FROZEN benchmark', () => {
    const bm = createBenchmarkDataset({
      benchmarkId: 'bm-test-003',
      datasetVersion: 'v1.0.0',
      datasetRole: 'CALIBRATION',
      samples: [sampleClean],
    });

    const frozen = freezeBenchmarkDataset(bm);

    assert.throws(
      () => addSampleToBenchmark(frozen, sampleClean),
      /Cannot add samples to a benchmark in state "FROZEN"/
    );
  });

  it('4. Gating: Rejects adding CONTAMINATED samples to a blind HOLDOUT dataset', () => {
    const holdoutBm = createBenchmarkDataset({
      benchmarkId: 'bm-holdout-001',
      datasetVersion: 'v1.0.0',
      datasetRole: 'HOLDOUT', // Blind holdout role
    });

    assert.throws(
      () => addSampleToBenchmark(holdoutBm, sampleContaminated),
      /marked as CONTAMINATED and cannot enter a blind HOLDOUT dataset/
    );

    // Clean sample is permitted
    addSampleToBenchmark(holdoutBm, sampleClean);
    assert.equal(holdoutBm.samples.length, 1);
  });

  it('5. Dataset hash is sensitive to sample content changes', () => {
    const bm1 = createBenchmarkDataset({
      benchmarkId: 'bm-test-004',
      datasetVersion: 'v1.0.0',
      samples: [{ id: 's1', text: 'Original text' }],
    });
    const frozen1 = freezeBenchmarkDataset(bm1);

    const bm2 = createBenchmarkDataset({
      benchmarkId: 'bm-test-005',
      datasetVersion: 'v1.0.0',
      samples: [{ id: 's1', text: 'Modified text' }],
    });
    const frozen2 = freezeBenchmarkDataset(bm2);

    assert.notEqual(frozen1.datasetHash, frozen2.datasetHash);
  });
});
