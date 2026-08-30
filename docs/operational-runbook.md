# Operational Observability, Metrics & Alerting Runbook

**Document ID**: `ARCH-057` / `OPS-RUNBOOK-001`  
**Phase**: Phase 14 (Security Hardening & Production Readiness)  
**Standard**: Prometheus OpenMetrics Standard & Defense-in-Depth Observability  
**Classification**: Technical Operations Runbook  

---

## 1. Observability Architecture & Boundaries

Antigravity Career Hub strictly separates **public liveness/readiness probes** from **internal operational metrics** to prevent information disclosure:

```
+----------------------------------------------------------------------------------------------------+
|                                    OBSERVABILITY BOUNDARIES                                        |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  [PUBLIC HEALTH PROBES (Unauthenticated / Public Ingress)]                                         |
|  - GET /livez   : Fast zero-dependency liveness check (200 OK + uptime)                           |
|  - GET /healthz : Dependency readiness check (DB connectivity + sanitized pool stats)              |
|  - Security     : Zero DB hostnames, zero backup URLs, zero storage keys, zero credentials         |
|                                                                                                    |
|  [INTERNAL METRICS PROBE (Authorized / Prometheus Scraper)]                                        |
|  - GET /metrics : Prometheus text format metrics exposition                                        |
|  - Metrics      : Storage utilization, pool checkouts, backup freshness, WAL archiver status      |
|  - Security     : Bound to internal network or authorized scraping proxy                           |
+----------------------------------------------------------------------------------------------------+
```

---

## 2. Prometheus Metrics Reference

| Metric Name | Type | Description | Alerting Threshold |
| :--- | :--- | :--- | :--- |
| `careerhub_db_size_bytes` | Gauge | Total PostgreSQL database disk footprint in bytes | Warning > 768 MB (75%), Critical > 921.6 MB (90%) |
| `careerhub_db_pool_connections` | Gauge | Active checked-out connection count | Alert if >= 5 (100% pool saturation) |
| `careerhub_db_pool_utilization` | Gauge | Connection pool utilization ratio ($0.0 - 1.0$) | Warning > 0.80 for > 5 min |
| `careerhub_backup_last_success_timestamp` | Gauge | Unix timestamp of latest successful backup export | — |
| `careerhub_backup_last_failure_timestamp` | Gauge | Unix timestamp of latest backup failure event | Alert if failure timestamp > success timestamp |
| `careerhub_backup_age_seconds` | Gauge | Elapsed time since last successful backup | Warning > 90,000s (25h), Critical > 172,800s (48h) |
| `careerhub_backup_size_bytes` | Gauge | Size in bytes of latest backup package | Alert if size drops by > 50% unexpectedly |
| `careerhub_document_storage_bytes` | Gauge | Total bytes of encrypted resume documents on disk | Warning > 500 MB |
| `careerhub_document_file_count` | Gauge | Count of encrypted source document files | — |
| `careerhub_restore_test_duration_seconds` | Gauge | Execution time of latest DR restore drill | Warning > 60s |
| `careerhub_wal_health` | Gauge | WAL archiver health (1 = healthy, 0 = failing) | Critical if == 0 |
| `careerhub_wal_archived_count` | Counter | Total count of archived WAL segments | — |
| `careerhub_wal_failed_count` | Counter | Total count of failed WAL archiving attempts | Critical if > 0 |

---

## 3. Storage Monitoring: Multi-Tier Breakdown

To avoid misinterpreting storage metrics, operators must track each storage dimension independently:

```
+----------------------------------------------------------------------------------------------------+
|  1. DATABASE DISK (1 GB NVMe Quota)                                                                |
|     - Target: PostgreSQL tables, indexes, toast (defaultdb)                                       |
|     - Current: ~14.24 MB (1.39% of 1 GB)                                                           |
|     - Max Headroom: 1,001.51 MB free                                                               |
+----------------------------------------------------------------------------------------------------+
|  2. AIVEN MANAGED BACKUPS (Object Storage - Separate Quota)                                        |
|     - Target: Continuous WAL segments + 10-day base snapshots                                      |
|     - Current: ~406 MB                                                                             |
|     - Impact: Does NOT consume the 1 GB database disk quota                                       |
+----------------------------------------------------------------------------------------------------+
|  3. DOCUMENT BLOB STORAGE (Local Filesystem / S3 Bucket)                                           |
|     - Target: storage/documents/<tenantId>/<storageKey>.enc (AES-256-GCM ciphertext)               |
|     - Current: ~111 KB across 37 tenant folders                                                    |
+----------------------------------------------------------------------------------------------------+
|  4. INDEPENDENT BACKUP PACKAGES (Offsite Object Store / S3 / R2)                                   |
|     - Target: storage/backups/ (14 retained packages max)                                          |
|     - Current: ~3.5 MB per package (~49 MB total)                                                  |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Alert Response & Incident Runbooks

### 4.1 Alert: `BackupStale` (`careerhub_backup_age_seconds > 90000`)
1. **Diagnosis**: Check application logs for backup export failure errors.
2. **Manual Remediation**:
   ```bash
   node scripts/backup-export.js --out storage/backups/
   ```
3. **Verification**: Confirm `careerhub_backup_last_success_timestamp` updates on `GET /metrics`.

### 4.2 Alert: `DatabaseStorageWarning` (`careerhub_db_size_bytes > 768 MB`)
1. **Diagnosis**: Identify largest growing tables:
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) 
   FROM pg_stat_user_tables 
   ORDER BY pg_total_relation_size(relid) DESC LIMIT 5;
   ```
2. **Remediation**:
   - If `audit_logs` is dominant: Execute partition archive or prune logs older than 90 days.
   - If user data is legitimately scaling: Upgrade Aiven service plan to Startup-4 / Business-4 via console.

### 4.3 Alert: `WalArchiverFailing` (`careerhub_wal_health == 0`)
1. **Diagnosis**: Query `pg_stat_archiver` to inspect `last_failed_wal` and `last_failed_time`.
2. **Remediation**: Check Aiven service health and open a support ticket if cloud-side object storage is unreachable.

---

## 5. Division of Responsibility: Agent vs. Human

| Operational Task | Automation Status | Responsible Actor |
| :--- | :--- | :--- |
| **Daily Logical Backup Export** | Automated via scheduled job | Application Worker / CLI |
| **Document Storage Snapshot** | Automated within backup bundle | Application Worker / CLI |
| **Weekly DR Restore Drill** | Automated with ephemeral DB lifecycle | CI / Scheduled Script (`scripts/test-dr-restore.js`) |
| **Prometheus Metrics Collection** | Automated on `GET /metrics` | Fastify Monitoring Service |
| **Aiven Console PITR / Forking** | **Manual Operator Action** | Human Platform Engineer |
| **Secrets Manager Master Key Retrieval** | **Manual / IAM Controlled** | Human Security Custodian |
| **Production Cloudflare Tunnel Deployment** | **Manual Token Injection** | Human Operations Engineer |
| **GitHub App Secret Rotation** | **Manual Configuration** | Human GitHub App Admin |
