/**
 * @file Ingestion State Machine & Run Tracking Service (Step 1F / P14-005G)
 *
 * Manages the server-side lifecycle of candidate repository AST ingestion runs:
 * - Explicit State Machine: IDLE -> QUEUED -> RUNNING -> COMPLETED | PARTIAL_FAILURE | FAILED | CANCELLED
 * - Per-Repository State: QUEUED -> RUNNING -> COMPLETED | FAILED
 * - Server-side idempotency lock per candidate & tenant
 * - Immutable selection snapshot per active run
 * - Safe status metadata serialization (zero secrets or credentials)
 * - Multi-tenant sovereign default-deny isolation
 */

import crypto from 'node:crypto';
import { ValidationError, ConflictError, NotFoundError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

/**
 * @typedef {'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL_FAILURE' | 'FAILED' | 'CANCELLED'} IngestionRunState
 * @typedef {'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'} IngestionRepositoryState
 */

export class IngestionStateService {
  constructor() {
    /** @type {Map<string, IngestionRun>} candidateKey -> IngestionRun */
    this._activeRunsByCandidate = new Map();
    /** @type {Map<string, IngestionRun>} runId -> IngestionRun */
    this._runsById = new Map();
  }

  /**
   * Generates a composite candidate key for tenant-scoped candidate runs.
   *
   * @private
   * @param {string} tenantId
   * @param {string} candidateId
   * @returns {string}
   */
  _candidateKey(tenantId, candidateId) {
    return `${tenantId}::${candidateId}`;
  }

  /**
   * Starts or registers a new ingestion run for a candidate.
   * Rejects with ConflictError if an ingestion is already active.
   *
   * @param {object} params
   * @param {object} params.context - Trusted request context
   * @param {string} params.candidateId
   * @param {Array<{ id: string, name: string, displayName?: string, fullName?: string }>} params.resources
   * @returns {object} The initialized IngestionRun record
   */
  startRun({ context, candidateId, resources }) {
    if (!context?.tenantId) {
      throw new ValidationError('Trusted context with tenantId is required');
    }
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new ValidationError('At least one repository resource is required for ingestion');
    }

    const tenantId = context.tenantId;
    const key = this._candidateKey(tenantId, candidateId);

    // Idempotency check: Reject duplicate concurrent runs
    const existingRun = this._activeRunsByCandidate.get(key);
    if (existingRun && (existingRun.state === 'QUEUED' || existingRun.state === 'RUNNING')) {
      logger.warn(
        {
          tenantId,
          candidateId,
          activeRunId: existingRun.id,
          state: existingRun.state,
        },
        'Rejected duplicate ingestion run attempt while an active run is in progress'
      );
      throw new ConflictError('INGESTION_ALREADY_RUNNING', {
        runId: existingRun.id,
        state: existingRun.state,
        startedAt: existingRun.startedAt,
      });
    }

    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    const repositorySnapshots = resources.map((r) => ({
      id: String(r.id),
      name: r.name || r.displayName || 'Repository',
      fullName: r.fullName || r.name || 'Repository',
      state: /** @type {IngestionRepositoryState} */ ('QUEUED'),
      phase: 'Queued',
      error: null,
      startedAt: null,
      completedAt: null,
      projectsCreated: 0,
      projectsUpdated: 0,
      evidenceCreated: 0,
      evidenceLinked: 0,
    }));

    const newRun = {
      id: runId,
      tenantId,
      candidateId,
      state: /** @type {IngestionRunState} */ ('RUNNING'),
      startedAt: now,
      completedAt: null,
      totalRepositories: repositorySnapshots.length,
      completedRepositories: 0,
      failedRepositories: 0,
      currentRepositoryId: repositorySnapshots[0]?.id || null,
      currentRepositoryName: repositorySnapshots[0]?.name || null,
      currentPhase: 'Initializing pipeline...',
      repositories: repositorySnapshots,
      summary: null,
      error: null,
    };

    this._activeRunsByCandidate.set(key, newRun);
    this._runsById.set(runId, newRun);

    logger.info(
      {
        ingestionRunId: runId,
        tenantId,
        candidateId,
        repositoryCount: repositorySnapshots.length,
      },
      'Ingestion run initialized and started'
    );

    return this.serializeRun(newRun);
  }

  /**
   * Retrieves the current or most recent ingestion run for a candidate.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {object | null} Serialized safe run metadata or null
   */
  getRunByCandidate({ tenantId, candidateId }) {
    if (!tenantId || !candidateId) return null;
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run) return null;
    return this.serializeRun(run);
  }

  /**
   * Retrieves an ingestion run by its unique ID, enforcing tenant isolation.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.runId
   * @returns {object}
   */
  getRunById({ tenantId, runId }) {
    if (!tenantId || !runId) {
      throw new ValidationError('tenantId and runId are required');
    }
    const run = this._runsById.get(runId);
    if (!run || run.tenantId !== tenantId) {
      throw new NotFoundError(`Ingestion run not found: ${runId}`);
    }
    return this.serializeRun(run);
  }

  /**
   * Updates the active phase of a specific repository in the run.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.resourceId
   * @param {string} params.phase
   */
  updateRepositoryPhase({ tenantId, candidateId, resourceId, phase }) {
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run || run.state !== 'RUNNING') return;

    run.currentPhase = phase;
    const repo = run.repositories.find(
      (r) => r.id === String(resourceId) || r.name === String(resourceId)
    );
    if (repo) {
      repo.phase = phase;
      run.currentRepositoryId = repo.id;
      run.currentRepositoryName = repo.name;
    }
  }

  /**
   * Marks a repository as actively RUNNING.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.resourceId
   * @param {string} [params.phase]
   */
  markRepositoryRunning({
    tenantId,
    candidateId,
    resourceId,
    phase = 'Extracting AST evidence...',
  }) {
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run) return;

    run.state = 'RUNNING';
    const repo = run.repositories.find(
      (r) => r.id === String(resourceId) || r.name === String(resourceId)
    );
    if (repo) {
      repo.state = 'RUNNING';
      repo.phase = phase;
      repo.startedAt = repo.startedAt || new Date().toISOString();
      run.currentRepositoryId = repo.id;
      run.currentRepositoryName = repo.name;
      run.currentPhase = phase;
    }
  }

  /**
   * Marks a repository as COMPLETED in the active run.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.resourceId
   * @param {object} [params.result]
   */
  markRepositoryCompleted({ tenantId, candidateId, resourceId, result = {} }) {
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run) return;

    const repo = run.repositories.find(
      (r) => r.id === String(resourceId) || r.name === String(resourceId)
    );
    if (repo) {
      repo.state = 'COMPLETED';
      repo.phase = 'AST + evidence complete';
      repo.completedAt = new Date().toISOString();
      repo.projectsCreated = result.projectCreated ? 1 : 0;
      repo.projectsUpdated = result.projectUpdated ? 1 : 0;
      repo.evidenceCreated = result.evidenceCreated || 0;
      repo.evidenceLinked = result.evidenceLinked || 0;
      run.completedRepositories++;
    }
  }

  /**
   * Marks a repository as FAILED in the active run.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.resourceId
   * @param {string} params.error
   */
  markRepositoryFailed({ tenantId, candidateId, resourceId, error }) {
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run) return;

    const repo = run.repositories.find(
      (r) => r.id === String(resourceId) || r.name === String(resourceId)
    );
    if (repo) {
      repo.state = 'FAILED';
      repo.phase = 'Ingestion failed';
      repo.error = String(error || 'Unknown error occurred during AST ingestion');
      repo.completedAt = new Date().toISOString();
      run.failedRepositories++;
    }
  }

  /**
   * Concludes the active ingestion run, calculating final composite state.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {object} [params.summary]
   * @param {string | null} [params.error]
   * @returns {object} Serialized final run metadata
   */
  finishRun({ tenantId, candidateId, summary = null, error = null }) {
    const key = this._candidateKey(tenantId, candidateId);
    const run = this._activeRunsByCandidate.get(key);
    if (!run) {
      throw new NotFoundError('No active ingestion run found to complete');
    }

    run.completedAt = new Date().toISOString();
    run.currentRepositoryId = null;
    run.currentRepositoryName = null;

    if (error) {
      run.state = 'FAILED';
      run.error = String(error);
      run.currentPhase = 'Ingestion failed';
    } else if (run.failedRepositories > 0 && run.completedRepositories > 0) {
      run.state = 'PARTIAL_FAILURE';
      run.currentPhase = `Completed with issues: ${run.completedRepositories} succeeded, ${run.failedRepositories} failed`;
    } else if (run.failedRepositories > 0 && run.completedRepositories === 0) {
      run.state = 'FAILED';
      run.currentPhase = 'All repository ingestions failed';
    } else {
      run.state = 'COMPLETED';
      run.currentPhase = 'Ingestion complete';
    }

    if (summary) {
      run.summary = {
        repositoriesProcessed: summary.repositoriesProcessed || run.completedRepositories,
        projectsCreated: summary.projectsCreated || 0,
        projectsUpdated: summary.projectsUpdated || 0,
        evidenceCreated: summary.evidenceCreated || 0,
        evidenceLinked: summary.evidenceLinked || 0,
        verifiedSkillsAdded: summary.verifiedSkillsAdded || 0,
        verifiedSkills: Array.isArray(summary.verifiedSkills) ? summary.verifiedSkills : [],
        warnings: Array.isArray(summary.warnings) ? summary.warnings : [],
        durationMs: summary.durationMs || 0,
      };
    }

    logger.info(
      {
        ingestionRunId: run.id,
        tenantId,
        candidateId,
        finalState: run.state,
        completed: run.completedRepositories,
        failed: run.failedRepositories,
      },
      'Ingestion run finished'
    );

    return this.serializeRun(run);
  }

  /**
   * Resets/clears the candidate's run state back to IDLE.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   */
  resetRun({ tenantId, candidateId }) {
    const key = this._candidateKey(tenantId, candidateId);
    this._activeRunsByCandidate.delete(key);
  }

  /**
   * Serializes an IngestionRun into safe, user-facing JSON metadata (zero secrets).
   *
   * @param {object} run
   * @returns {object}
   */
  serializeRun(run) {
    if (!run) return null;
    return {
      ingestionRunId: run.id,
      tenantId: run.tenantId,
      candidateId: run.candidateId,
      state: run.state,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      totalRepositories: run.totalRepositories,
      completedRepositories: run.completedRepositories,
      failedRepositories: run.failedRepositories,
      currentRepositoryId: run.currentRepositoryId,
      currentRepositoryName: run.currentRepositoryName,
      currentPhase: run.currentPhase,
      repositories: run.repositories.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.fullName,
        state: r.state,
        phase: r.phase,
        error: r.error,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        projectsCreated: r.projectsCreated,
        projectsUpdated: r.projectsUpdated,
        evidenceCreated: r.evidenceCreated,
        evidenceLinked: r.evidenceLinked,
      })),
      summary: run.summary,
      error: run.error,
    };
  }
}

export const defaultIngestionStateService = new IngestionStateService();
