/**
 * @file Operational Observability & Prometheus Metrics Service (P14-005 / ARCH-055).
 *
 * Implements Prometheus text format metrics exposition for database size,
 * connection pool utilization, backup freshness, document storage footprint,
 * restore drill timing, and WAL archiver health.
 *
 * Adheres strictly to security boundaries:
 * - Zero PII or customer data in labels
 * - Zero raw secrets, tokens, or database credentials exposed
 * - Strict separation between public health checks and internal metrics
 */

import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import fs from 'node:fs/promises';
import path from 'node:path';

class MetricsService {
  constructor() {
    this._metrics = {
      dbSizeBytes: 0,
      dbPoolConnections: 0,
      dbPoolUtilization: 0,
      backupLastSuccessTimestamp: 0,
      backupLastFailureTimestamp: 0,
      backupSizeBytes: 0,
      documentStorageBytes: 0,
      documentFileCount: 0,
      documentBackupLastSuccessTimestamp: 0,
      restoreTestLastSuccessTimestamp: 0,
      restoreTestDurationSeconds: 0,
      walHealth: 1, // 1 = healthy, 0 = degraded/failing
      walArchivedCount: 0,
      walFailedCount: 0,
    };
    this._initialized = false;
  }

  /**
   * Updates database storage and WAL archiver metrics from PostgreSQL engine.
   *
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [targetDb=db]
   * @returns {Promise<void>}
   */
  async collectDatabaseMetrics(targetDb = db) {
    try {
      // 1. Collect database size
      const dbSizeRes = await targetDb.execute(sql`
        SELECT pg_database_size(current_database()) AS db_size_bytes;
      `);
      if (dbSizeRes?.rows?.[0]?.db_size_bytes) {
        this._metrics.dbSizeBytes = Number(dbSizeRes.rows[0].db_size_bytes);
      }

      // 2. Collect WAL archiver stats
      const archiverRes = await targetDb.execute(sql`
        SELECT archived_count, failed_count
        FROM pg_stat_archiver;
      `);
      if (archiverRes?.rows?.[0]) {
        const archived = Number(archiverRes.rows[0].archived_count || 0);
        const failed = Number(archiverRes.rows[0].failed_count || 0);
        this._metrics.walArchivedCount = archived;
        this._metrics.walFailedCount = failed;
        this._metrics.walHealth = failed === 0 ? 1 : 0;
      }
    } catch {
      // Non-fatal: preserve last known metric if transient query failure
    }
  }

  /**
   * Updates document storage metrics by scanning the local storage directory.
   *
   * @param {string} [storageDir] Root document directory
   * @returns {Promise<{ totalBytes: number, fileCount: number }>}
   */
  async collectDocumentMetrics(storageDir) {
    const root = storageDir || path.resolve(process.cwd(), 'storage', 'documents');
    let totalBytes = 0;
    let fileCount = 0;

    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const tenantPath = path.join(root, entry.name);
          const files = await fs.readdir(tenantPath, { withFileTypes: true });
          for (const file of files) {
            if (file.isFile() && file.name.endsWith('.enc')) {
              fileCount++;
              const stat = await fs.stat(path.join(tenantPath, file.name));
              totalBytes += stat.size;
            }
          }
        }
      }
      this._metrics.documentStorageBytes = totalBytes;
      this._metrics.documentFileCount = fileCount;
    } catch {
      // Directory may be empty or not yet initialized
      this._metrics.documentStorageBytes = 0;
      this._metrics.documentFileCount = 0;
    }

    return { totalBytes, fileCount };
  }

  /**
   * Updates pool utilization metrics from the DbPoolGuard or Pool instance.
   *
   * @param {object} poolStats
   * @param {number} poolStats.totalCount
   * @param {number} poolStats.checkedOutCount
   * @param {number} poolStats.utilization
   */
  recordPoolStats(poolStats) {
    if (!poolStats) return;
    this._metrics.dbPoolConnections = poolStats.checkedOutCount || 0;
    this._metrics.dbPoolUtilization = poolStats.utilization || 0;
  }

  /**
   * Records a successful backup export event.
   *
   * @param {object} params
   * @param {number} params.sizeBytes Total encrypted package size in bytes
   * @param {number} [params.timestamp=Date.now()]
   */
  recordBackupSuccess({ sizeBytes, timestamp = Date.now() }) {
    this._metrics.backupLastSuccessTimestamp = Math.floor(timestamp / 1000);
    this._metrics.backupSizeBytes = sizeBytes || 0;
    this._metrics.documentBackupLastSuccessTimestamp = Math.floor(timestamp / 1000);
  }

  /**
   * Records a backup failure event.
   *
   * @param {number} [timestamp=Date.now()]
   */
  recordBackupFailure(timestamp = Date.now()) {
    this._metrics.backupLastFailureTimestamp = Math.floor(timestamp / 1000);
  }

  /**
   * Records a disaster recovery restore test event.
   *
   * @param {object} params
   * @param {number} params.durationSeconds Total drill duration in seconds
   * @param {number} [params.timestamp=Date.now()]
   */
  recordRestoreTest({ durationSeconds, timestamp = Date.now() }) {
    this._metrics.restoreTestLastSuccessTimestamp = Math.floor(timestamp / 1000);
    this._metrics.restoreTestDurationSeconds = durationSeconds || 0;
  }

  /**
   * Calculates the current backup age in seconds.
   *
   * @returns {number} Age in seconds, or -1 if no backup recorded
   */
  getBackupAgeSeconds() {
    if (this._metrics.backupLastSuccessTimestamp === 0) {
      return -1;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return Math.max(0, nowSec - this._metrics.backupLastSuccessTimestamp);
  }

  /**
   * Returns a snapshot copy of all current metric values.
   *
   * @returns {object}
   */
  getSnapshot() {
    return {
      ...this._metrics,
      backupAgeSeconds: this.getBackupAgeSeconds(),
    };
  }

  /**
   * Formats all metrics into standard Prometheus text representation.
   *
   * @returns {string} Prometheus formatted metrics string
   */
  toPrometheusFormat() {
    const snapshot = this.getSnapshot();
    const lines = [
      '# HELP careerhub_db_size_bytes Total PostgreSQL database storage size in bytes',
      '# TYPE careerhub_db_size_bytes gauge',
      `careerhub_db_size_bytes ${snapshot.dbSizeBytes}`,
      '',
      '# HELP careerhub_db_pool_connections Currently active PostgreSQL connection pool checkouts',
      '# TYPE careerhub_db_pool_connections gauge',
      `careerhub_db_pool_connections ${snapshot.dbPoolConnections}`,
      '',
      '# HELP careerhub_db_pool_utilization PostgreSQL connection pool utilization ratio (0.0 to 1.0)',
      '# TYPE careerhub_db_pool_utilization gauge',
      `careerhub_db_pool_utilization ${snapshot.dbPoolUtilization.toFixed(4)}`,
      '',
      '# HELP careerhub_backup_last_success_timestamp Unix timestamp (seconds) of the last successful backup',
      '# TYPE careerhub_backup_last_success_timestamp gauge',
      `careerhub_backup_last_success_timestamp ${snapshot.backupLastSuccessTimestamp}`,
      '',
      '# HELP careerhub_backup_last_failure_timestamp Unix timestamp (seconds) of the last failed backup attempt',
      '# TYPE careerhub_backup_last_failure_timestamp gauge',
      `careerhub_backup_last_failure_timestamp ${snapshot.backupLastFailureTimestamp}`,
      '',
      '# HELP careerhub_backup_age_seconds Time in seconds since the last successful backup',
      '# TYPE careerhub_backup_age_seconds gauge',
      `careerhub_backup_age_seconds ${snapshot.backupAgeSeconds}`,
      '',
      '# HELP careerhub_backup_size_bytes Size in bytes of the latest encrypted backup package',
      '# TYPE careerhub_backup_size_bytes gauge',
      `careerhub_backup_size_bytes ${snapshot.backupSizeBytes}`,
      '',
      '# HELP careerhub_document_storage_bytes Total size in bytes of encrypted source document files on disk',
      '# TYPE careerhub_document_storage_bytes gauge',
      `careerhub_document_storage_bytes ${snapshot.documentStorageBytes}`,
      '',
      '# HELP careerhub_document_file_count Total count of encrypted resume and document files stored',
      '# TYPE careerhub_document_file_count gauge',
      `careerhub_document_file_count ${snapshot.documentFileCount}`,
      '',
      '# HELP careerhub_document_backup_last_success_timestamp Unix timestamp of last document storage backup',
      '# TYPE careerhub_document_backup_last_success_timestamp gauge',
      `careerhub_document_backup_last_success_timestamp ${snapshot.documentBackupLastSuccessTimestamp}`,
      '',
      '# HELP careerhub_restore_test_last_success_timestamp Unix timestamp of last successful DR restore drill',
      '# TYPE careerhub_restore_test_last_success_timestamp gauge',
      `careerhub_restore_test_last_success_timestamp ${snapshot.restoreTestLastSuccessTimestamp}`,
      '',
      '# HELP careerhub_restore_test_duration_seconds Execution duration in seconds of the last DR restore drill',
      '# TYPE careerhub_restore_test_duration_seconds gauge',
      `careerhub_restore_test_duration_seconds ${snapshot.restoreTestDurationSeconds.toFixed(3)}`,
      '',
      '# HELP careerhub_wal_health WAL archiver health status (1 = healthy, 0 = archiver failures detected)',
      '# TYPE careerhub_wal_health gauge',
      `careerhub_wal_health ${snapshot.walHealth}`,
      '',
      '# HELP careerhub_wal_archived_count Total count of successfully archived WAL segments',
      '# TYPE careerhub_wal_archived_count counter',
      `careerhub_wal_archived_count ${snapshot.walArchivedCount}`,
      '',
      '# HELP careerhub_wal_failed_count Total count of failed WAL archive attempts',
      '# TYPE careerhub_wal_failed_count counter',
      `careerhub_wal_failed_count ${snapshot.walFailedCount}`,
      '',
    ];

    return lines.join('\n');
  }
}

export const metricsService = new MetricsService();
