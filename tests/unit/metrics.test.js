/**
 * @file Unit Tests for Prometheus Operational Metrics Service (P14-005 / ARCH-055).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { metricsService } from '../../src/monitoring/metrics.service.js';

describe('P14-005: Operational Metrics & Prometheus Service', () => {
  const tempDocRoot = path.resolve(process.cwd(), 'storage', 'unit-test-metrics-docs');

  before(async () => {
    await fs.mkdir(path.join(tempDocRoot, 'tenant-alpha'), { recursive: true });
    await fs.mkdir(path.join(tempDocRoot, 'tenant-beta'), { recursive: true });

    await fs.writeFile(
      path.join(tempDocRoot, 'tenant-alpha', 'doc-1.enc'),
      Buffer.alloc(1024, 0xaa)
    );
    await fs.writeFile(
      path.join(tempDocRoot, 'tenant-beta', 'doc-2.enc'),
      Buffer.alloc(2048, 0xbb)
    );
  });

  after(async () => {
    try {
      await fs.rm(tempDocRoot, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should accurately collect document storage metrics from disk', async () => {
    const res = await metricsService.collectDocumentMetrics(tempDocRoot);
    assert.equal(res.fileCount, 2);
    assert.equal(res.totalBytes, 3072);

    const snapshot = metricsService.getSnapshot();
    assert.equal(snapshot.documentFileCount, 2);
    assert.equal(snapshot.documentStorageBytes, 3072);
  });

  it('should record pool statistics correctly', () => {
    metricsService.recordPoolStats({
      totalCount: 5,
      idleCount: 3,
      checkedOutCount: 2,
      waitingCount: 0,
      utilization: 0.4,
    });

    const snapshot = metricsService.getSnapshot();
    assert.equal(snapshot.dbPoolConnections, 2);
    assert.equal(snapshot.dbPoolUtilization, 0.4);
  });

  it('should record backup success and failure events', () => {
    const successTime = Date.now() - 5000;
    metricsService.recordBackupSuccess({ sizeBytes: 1048576, timestamp: successTime });

    let snapshot = metricsService.getSnapshot();
    assert.equal(snapshot.backupSizeBytes, 1048576);
    assert.equal(snapshot.backupLastSuccessTimestamp, Math.floor(successTime / 1000));
    assert.ok(snapshot.backupAgeSeconds >= 5);

    const failTime = Date.now();
    metricsService.recordBackupFailure(failTime);

    snapshot = metricsService.getSnapshot();
    assert.equal(snapshot.backupLastFailureTimestamp, Math.floor(failTime / 1000));
  });

  it('should record restore drill duration and timestamp', () => {
    metricsService.recordRestoreTest({ durationSeconds: 12.345 });

    const snapshot = metricsService.getSnapshot();
    assert.equal(snapshot.restoreTestDurationSeconds, 12.345);
    assert.ok(snapshot.restoreTestLastSuccessTimestamp > 0);
  });

  it('should export valid Prometheus format without sensitive hostnames or credentials', () => {
    const prometheusText = metricsService.toPrometheusFormat();

    assert.ok(prometheusText.includes('# HELP careerhub_db_size_bytes'));
    assert.ok(prometheusText.includes('# TYPE careerhub_db_size_bytes gauge'));
    assert.ok(prometheusText.includes('careerhub_db_pool_connections'));
    assert.ok(prometheusText.includes('careerhub_db_pool_utilization'));
    assert.ok(prometheusText.includes('careerhub_backup_last_success_timestamp'));
    assert.ok(prometheusText.includes('careerhub_backup_age_seconds'));
    assert.ok(prometheusText.includes('careerhub_document_storage_bytes'));
    assert.ok(prometheusText.includes('careerhub_wal_health'));

    // Verify zero credentials or URLs present
    assert.ok(!prometheusText.includes('password'));
    assert.ok(!prometheusText.includes('postgres://'));
    assert.ok(!prometheusText.includes('aivencloud.com'));
  });
});
