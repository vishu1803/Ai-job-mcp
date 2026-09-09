import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db as defaultDb } from '../db/index.js';
import { jobAnalysisSnapshots } from '../db/schema.js';
import {
  ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
  ANALYSIS_SNAPSHOT_TTL_MS,
  computeJobContentHash,
} from '../domain/career/analysis-snapshot.schemas.js';
import { AuthorizationError, ConflictError, ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

/**
 * Service managing authoritative Analyze-to-Prepare job analysis snapshots (P16-001F-3B).
 * Enforces:
 * - Server authority (snapshots are written by server during analyze-job, never trusted from client).
 * - Multi-tenant and candidate isolation (cross-tenant/cross-candidate rejected with 403).
 * - Exact canonical job binding (mismatches rejected with 409 ANALYSIS_JOB_MISMATCH).
 * - TTL (2 hours) and content hash validation (tampered/altered job descriptions rejected).
 * - Idempotent reuse without premature application creation.
 */
export class JobAnalysisSnapshotService {
  /**
   * @param {object} [dependencies]
   * @param {object} [dependencies.db]
   * @param {number} [dependencies.ttlMs]
   */
  constructor(dependencies = {}) {
    this.db = dependencies.db || defaultDb;
    this.ttlMs = dependencies.ttlMs || ANALYSIS_SNAPSHOT_TTL_MS;
    this._tableEnsured = false;
  }

  /**
   * Lazily ensures table existence in ephemeral test environments.
   * @private
   */
  async _ensureTable() {
    if (this._tableEnsured) return;
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS "job_analysis_snapshots" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "contract_version" text NOT NULL DEFAULT 'P16-001F',
          "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
          "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
          "canonical_job_id" text NOT NULL,
          "normalized_job_url" text,
          "job_content_hash" text NOT NULL,
          "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
          "overall_fit" jsonb DEFAULT '{}' NOT NULL,
          "match_analysis" jsonb DEFAULT '{}' NOT NULL,
          "project_rankings" jsonb DEFAULT '[]' NOT NULL,
          "parsed_job_description" jsonb DEFAULT '{}' NOT NULL,
          "metadata" jsonb DEFAULT '{}' NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `);
      this._tableEnsured = true;
    } catch {
      this._tableEnsured = true;
    }
  }

  /**
   * Saves or idempotently updates an authoritative analysis snapshot.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.canonicalJobId
   * @param {string} [params.normalizedJobUrl]
   * @param {string} params.jobContentHash
   * @param {string} [params.contractVersion]
   * @param {object} params.overallFit
   * @param {object} params.matchAnalysis
   * @param {Array} params.projectRankings
   * @param {Array} [params.topRelevantProjects]
   * @param {object} params.parsedJobDescription
   * @param {object} [params.metadata]
   * @returns {Promise<object>} Persisted snapshot
   */
  async saveSnapshot({
    tenantId,
    candidateId,
    canonicalJobId,
    normalizedJobUrl = null,
    jobContentHash,
    contractVersion = ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
    overallFit = {},
    matchAnalysis = {},
    projectRankings = [],
    topRelevantProjects = [],
    parsedJobDescription = {},
    metadata = {},
  }) {
    if (!tenantId) throw new ValidationError('tenantId is required for snapshot persistence');
    if (!candidateId) throw new ValidationError('candidateId is required for snapshot persistence');
    if (!canonicalJobId) throw new ValidationError('canonicalJobId is required for snapshot persistence');
    if (!jobContentHash) throw new ValidationError('jobContentHash is required for snapshot persistence');

    await this._ensureTable();

    const mergedMetadata = {
      ...metadata,
      topRelevantProjects: topRelevantProjects.length > 0 ? topRelevantProjects : projectRankings,
    };

    // Check for an existing fresh snapshot with identical identity and hash
    const [existing] = await this.db
      .select()
      .from(jobAnalysisSnapshots)
      .where(
        and(
          eq(jobAnalysisSnapshots.tenantId, tenantId),
          eq(jobAnalysisSnapshots.candidateId, candidateId),
          eq(jobAnalysisSnapshots.canonicalJobId, canonicalJobId),
          eq(jobAnalysisSnapshots.jobContentHash, jobContentHash),
          eq(jobAnalysisSnapshots.contractVersion, contractVersion)
        )
      )
      .orderBy(desc(jobAnalysisSnapshots.analyzedAt))
      .limit(1);

    if (existing) {
      const elapsedMs = Date.now() - new Date(existing.analyzedAt).getTime();
      if (elapsedMs < this.ttlMs) {
        // Idempotent refresh: update timestamp and payload
        const [updated] = await this.db
          .update(jobAnalysisSnapshots)
          .set({
            normalizedJobUrl: normalizedJobUrl || existing.normalizedJobUrl,
            analyzedAt: new Date(),
            updatedAt: new Date(),
            overallFit,
            matchAnalysis,
            projectRankings,
            parsedJobDescription,
            metadata: mergedMetadata,
          })
          .where(eq(jobAnalysisSnapshots.id, existing.id))
          .returning();

        return {
          ...updated,
          topRelevantProjects: mergedMetadata.topRelevantProjects,
        };
      }
    }

    // Insert fresh snapshot
    const [inserted] = await this.db
      .insert(jobAnalysisSnapshots)
      .values({
        id: crypto.randomUUID(),
        contractVersion,
        tenantId,
        candidateId,
        canonicalJobId,
        normalizedJobUrl,
        jobContentHash,
        analyzedAt: new Date(),
        overallFit,
        matchAnalysis,
        projectRankings,
        parsedJobDescription,
        metadata: mergedMetadata,
      })
      .returning();

    return {
      ...inserted,
      topRelevantProjects: mergedMetadata.topRelevantProjects,
    };
  }

  /**
   * Loads a snapshot by its primary ID.
   *
   * @param {string} snapshotId
   * @returns {Promise<object|null>}
   */
  async getSnapshotById(snapshotId) {
    if (!snapshotId) return null;
    await this._ensureTable();

    const [row] = await this.db
      .select()
      .from(jobAnalysisSnapshots)
      .where(eq(jobAnalysisSnapshots.id, snapshotId))
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      topRelevantProjects: row.metadata?.topRelevantProjects || row.projectRankings || [],
    };
  }

  /**
   * Loads the latest active snapshot for a tenant, candidate, and canonical job.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.canonicalJobId
   * @returns {Promise<object|null>}
   */
  async getLatestSnapshot({ tenantId, candidateId, canonicalJobId }) {
    if (!tenantId || !candidateId || !canonicalJobId) return null;
    await this._ensureTable();

    const [row] = await this.db
      .select()
      .from(jobAnalysisSnapshots)
      .where(
        and(
          eq(jobAnalysisSnapshots.tenantId, tenantId),
          eq(jobAnalysisSnapshots.candidateId, candidateId),
          eq(jobAnalysisSnapshots.canonicalJobId, canonicalJobId)
        )
      )
      .orderBy(desc(jobAnalysisSnapshots.analyzedAt))
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      topRelevantProjects: row.metadata?.topRelevantProjects || row.projectRankings || [],
    };
  }

  /**
   * Validates a snapshot against incoming request parameters and security boundaries.
   *
   * Enforces:
   * - Cross-tenant isolation (403 AuthorizationError)
   * - Cross-candidate isolation (403 AuthorizationError)
   * - Canonical job mismatch (409 ConflictError with code ANALYSIS_JOB_MISMATCH)
   * - Contract version match ('P16-001F')
   * - TTL staleness (2 hours)
   * - Job content hash match (job description alteration)
   *
   * @param {object} params
   * @param {object} params.context Authenticated request context ({ tenantId, candidateId })
   * @param {string} [params.snapshotId] Requested snapshot ID
   * @param {string} [params.canonicalJobId] Target canonical job ID
   * @param {string} [params.jobContentHash] Hash of incoming job posting
   * @param {object} [params.expectedJob] Raw incoming job object to hash if jobContentHash is not passed
   * @returns {Promise<{ valid: boolean, reason?: string, snapshot: object|null }>}
   */
  async getValidatedSnapshot({
    context,
    snapshotId = null,
    canonicalJobId = null,
    jobContentHash = null,
    expectedJob = null,
  }) {
    if (!context?.tenantId) {
      throw new AuthorizationError('Tenant context is required', 'UNAUTHENTICATED');
    }
    if (!context?.candidateId) {
      throw new AuthorizationError('Candidate context is required', 'UNAUTHENTICATED');
    }

    let snapshot = null;
    if (snapshotId) {
      snapshot = await this.getSnapshotById(snapshotId);
      if (!snapshot) {
        return { valid: false, reason: 'SNAPSHOT_NOT_FOUND', snapshot: null };
      }
    } else if (canonicalJobId) {
      snapshot = await this.getLatestSnapshot({
        tenantId: context.tenantId,
        candidateId: context.candidateId,
        canonicalJobId,
      });
      if (!snapshot) {
        return { valid: false, reason: 'SNAPSHOT_NOT_FOUND', snapshot: null };
      }
    } else {
      return { valid: false, reason: 'NO_IDENTIFIER_PROVIDED', snapshot: null };
    }

    // 1. Tenancy Boundary (Fail-Closed: 403)
    if (snapshot.tenantId !== context.tenantId) {
      logger.warn(
        { snapshotTenant: snapshot.tenantId, contextTenant: context.tenantId },
        'Cross-tenant snapshot access attempt rejected'
      );
      throw new AuthorizationError(
        'Access denied: snapshot belongs to a different tenant',
        'CROSS_TENANT_ACCESS_DENIED'
      );
    }

    // 2. Candidate Boundary (Fail-Closed: 403)
    if (snapshot.candidateId !== context.candidateId) {
      logger.warn(
        { snapshotCandidate: snapshot.candidateId, contextCandidate: context.candidateId },
        'Cross-candidate snapshot access attempt rejected'
      );
      throw new AuthorizationError(
        'Access denied: snapshot belongs to a different candidate',
        'CROSS_CANDIDATE_ACCESS_DENIED'
      );
    }

    // 3. Canonical Job Boundary (Fail-Closed: 409 ANALYSIS_JOB_MISMATCH)
    if (canonicalJobId && snapshot.canonicalJobId !== canonicalJobId) {
      logger.warn(
        { snapshotJobId: snapshot.canonicalJobId, requestedJobId: canonicalJobId },
        'Snapshot canonical job mismatch'
      );
      const conflictErr = new ConflictError(
        `Snapshot job mismatch: snapshot was generated for canonical job ${snapshot.canonicalJobId}, requested ${canonicalJobId}`,
        { code: 'ANALYSIS_JOB_MISMATCH' }
      );
      conflictErr.code = 'ANALYSIS_JOB_MISMATCH';
      throw conflictErr;
    }

    // 4. Contract Version Gate ('P16-001F')
    if (snapshot.contractVersion !== ANALYSIS_SNAPSHOT_CONTRACT_VERSION) {
      logger.warn(
        { snapshotVersion: snapshot.contractVersion, expectedVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION },
        'Snapshot contract version mismatch — rejecting stale snapshot'
      );
      return { valid: false, reason: 'CONTRACT_VERSION_MISMATCH', snapshot };
    }

    // 5. TTL Staleness Gate (2 hours)
    const elapsedMs = Date.now() - new Date(snapshot.analyzedAt).getTime();
    if (elapsedMs > this.ttlMs) {
      logger.info(
        { snapshotId: snapshot.id, elapsedMs, ttlMs: this.ttlMs },
        'Snapshot expired — rejecting stale snapshot'
      );
      return { valid: false, reason: 'SNAPSHOT_EXPIRED', snapshot };
    }

    // 6. Job Content Hash Gate (description alteration detection)
    const targetHash = jobContentHash || (expectedJob ? computeJobContentHash(expectedJob) : null);
    if (targetHash && snapshot.jobContentHash !== targetHash) {
      logger.warn(
        { snapshotHash: snapshot.jobContentHash, targetHash },
        'Job content hash mismatch: job description altered — rejecting snapshot'
      );
      return { valid: false, reason: 'JOB_CONTENT_HASH_MISMATCH', snapshot };
    }

    return { valid: true, snapshot };
  }

  /**
   * Formats a validated snapshot into the jobFitAnalysis structure expected by workflow services.
   *
   * @param {object} snapshot
   * @returns {object|null}
   */
  toWorkflowJobFit(snapshot) {
    if (!snapshot) return null;

    const rankings = Array.isArray(snapshot.projectRankings) ? snapshot.projectRankings : [];
    const topProjects = Array.isArray(snapshot.topRelevantProjects) && snapshot.topRelevantProjects.length > 0
      ? snapshot.topRelevantProjects
      : rankings;

    return {
      snapshotId: snapshot.id,
      isAuthoritative: true,
      contractVersion: snapshot.contractVersion || ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
      source: 'EXTENSION_AUTHORITATIVE_SNAPSHOT',
      authoritativeRankings: rankings,
      overallFit: snapshot.overallFit || {},
      matchAnalysis: snapshot.matchAnalysis || {},
      projectRankings: rankings,
      topRelevantProjects: topProjects,
      parsedJobDescription: snapshot.parsedJobDescription || {},
      jobContentHash: snapshot.jobContentHash,
      analyzedAt: snapshot.analyzedAt,
    };
  }
}
