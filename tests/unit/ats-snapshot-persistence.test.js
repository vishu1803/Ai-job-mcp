/**
 * @file Unit Tests for ATS Snapshot Persistence Service (Phase 21)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AtsSnapshotPersistenceService } from '../../src/services/ats-snapshot-persistence.service.js';

describe('ATS Snapshot Persistence Service (Phase 21)', () => {
  const service = new AtsSnapshotPersistenceService();
  const mockTenantId = '11111111-1111-1111-1111-111111111111';
  const mockCandidateId = '22222222-2222-2222-2222-222222222222';
  const otherTenantId = '99999999-9999-9999-9999-999999999999';

  it('1. saves a versioned multi-dimensional ATS snapshot successfully', async () => {
    const mockReport = {
      dimensions: {
        jobFit: { score: 78.5 },
        atsParseability: { score: 92.0 },
        keywordCoverage: { score: 85.0 },
        contentQuality: { score: 80.0 },
        applicationReadiness: { score: 81.0 },
      },
    };

    const saved = await service.saveAtsSnapshot({
      tenantId: mockTenantId,
      candidateId: mockCandidateId,
      canonicalJobId: 'job-senior-devops',
      atsReport: mockReport,
      explainabilityReport: {
        lostPointsTotal: 21.5,
        topRemediationActions: ['Add Terraform experience'],
      },
      readinessReport: {
        readinessScore: 81.0,
        readinessBand: 'READY_TO_APPLY',
      },
      resumeText: 'Sample resume text with sufficient length for testing',
    });

    assert.ok(saved.snapshotId);
    assert.equal(saved.version, '1.0.0');
    assert.equal(saved.tenantId, mockTenantId);
    assert.equal(saved.candidateId, mockCandidateId);
    assert.equal(saved.summary.fitScore, 78.5);
    assert.equal(saved.summary.readinessScore, 81.0);
    assert.equal(saved.summary.parseabilityScore, 92.0);
    assert.ok(saved.explainability);
    assert.ok(saved.readiness);
  });

  it('2. tracks historical snapshots and computes score trend deltas', async () => {
    // Save an improved revision
    const improvedReport = {
      dimensions: {
        jobFit: { score: 88.0 },
        atsParseability: { score: 95.0 },
        keywordCoverage: { score: 90.0 },
        contentQuality: { score: 86.0 },
        applicationReadiness: { score: 89.0 },
      },
    };

    await service.saveAtsSnapshot({
      tenantId: mockTenantId,
      candidateId: mockCandidateId,
      canonicalJobId: 'job-senior-devops',
      atsReport: improvedReport,
      readinessReport: {
        readinessScore: 89.0,
        readinessBand: 'READY_TO_APPLY',
      },
    });

    const history = await service.getAtsSnapshotHistory({
      tenantId: mockTenantId,
      candidateId: mockCandidateId,
    });

    assert.equal(history.totalSnapshots, 2);
    assert.equal(history.snapshots.length, 2);
    assert.equal(history.trends.fitScoreDelta, 9.5); // 88.0 - 78.5
    assert.equal(history.trends.readinessScoreDelta, 8.0); // 89.0 - 81.0
    assert.equal(history.trends.parseabilityScoreDelta, 3.0); // 95.0 - 92.0
    assert.equal(history.trends.trendDirection, 'IMPROVING');
  });

  it('3. retrieves latest snapshot by canonical job id', async () => {
    const latest = await service.getLatestAtsSnapshot({
      tenantId: mockTenantId,
      candidateId: mockCandidateId,
      canonicalJobId: 'job-senior-devops',
    });

    assert.ok(latest);
    assert.equal(latest.summary.fitScore, 88.0);
  });

  it('4. strictly enforces tenant isolation', async () => {
    const otherTenantHistory = await service.getAtsSnapshotHistory({
      tenantId: otherTenantId,
      candidateId: mockCandidateId,
    });

    assert.equal(otherTenantHistory.totalSnapshots, 0);
    assert.equal(otherTenantHistory.snapshots.length, 0);
  });
});
