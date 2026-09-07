/**
 * @file Application Tracking Service (Phase 12 / P12-002 / ARCH-043 / ADR-064)
 *
 * Authoritative lifecycle, stage progression, artifact snapshotting, and audit service
 * for candidate job applications within the Antigravity Career MCP Platform.
 *
 * Core Guarantees:
 * - Sovereign Multi-Tenant Isolation: 404 default-deny on cross-tenant requests
 * - Strict Candidate Ownership: Binds all applications and documents to authenticated candidate
 * - Deterministic State Machine: Enforces valid status transitions; rejects illegal shortcuts
 * - Chronological Stage Event Log: Server-controlled monotonic orderIndex
 * - Immutable Tailored Artifacts: Server-computed SHA-256 contentHash and monotonic versioning
 * - Atomic Audit Enforcement: Mutations and audit records commit in the same transaction
 * - Sensitive Data Redaction: Salary, private notes, and raw feedback never leak into audit logs
 */

import { eq, and, or, ne, desc, asc, count, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  candidates,
  jobApplications,
  applicationStages,
  tailoredDocuments,
  applicationPackages,
  auditLogs,
} from '../db/schema.js';
import {
  assertValidStatusTransition,
  isTerminalStatus,
  computeDocumentContentHash,
} from '../domain/career/application-state-machine.js';
import {
  CreateJobApplicationInputSchema,
  CreateApplicationStageInputSchema,
  UpdateApplicationStageInputSchema,
  CreateTailoredDocumentInputSchema,
} from '../domain/career/job-application.schemas.js';
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
  ConflictError,
} from '../errors/index.js';
import { DocumentStorageService } from './document-storage.service.js';
import { logger } from '../utils/logger.js';
import { normalizeJobUrl, deriveCanonicalJobId } from '../utils/url-normalizer.js';

export class ApplicationTrackingService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=db]
   */
  constructor(options = {}) {
    this.db = options.database || db;
    this._documentStorageOverride = options.documentStorage || null;
    this._documentStorageInstance = null;
  }

  /**
   * Lazily instantiates DocumentStorageService for tenant-scoped artifact cleanup
   * (injected override wins; used by tests to isolate storage directories).
   *
   * @private
   * @returns {object} DocumentStorageService instance
   */
  get documentStorage() {
    return this._getDocumentStorage();
  }

  _getDocumentStorage() {
    if (this._documentStorageOverride) return this._documentStorageOverride;
    if (!this._documentStorageInstance) {
      this._documentStorageInstance = new DocumentStorageService();
    }
    return this._documentStorageInstance;
  }

  // ---------------------------------------------------------------------------
  // 1. Create Job Application
  // ---------------------------------------------------------------------------

  /**
   * Creates a new job application aggregate for a candidate.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} candidateId Candidate UUID
   * @param {object} rawInput Application payload
   * @returns {Promise<object>} Created application record
   */
  async createApplication(context, candidateId, rawInput) {
    this._validateContext(context, true);

    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;
    const validatedInput = CreateJobApplicationInputSchema.parse({
      ...rawInput,
      candidateId,
    });

    return await this.db.transaction(async (tx) => {
      // 1. Verify candidate exists within authenticated tenant
      const [candidate] = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

      if (!candidate) {
        throw new NotFoundError(`Candidate not found: ${candidateId}`);
      }

      // 2. Active Application Duplicate Check & Reuse
      const canonicalJobId =
        validatedInput.canonicalJobId ||
        validatedInput.metadata?.canonicalJobId ||
        validatedInput.metadata?.jobId ||
        deriveCanonicalJobId(validatedInput) ||
        null;
      const normalizedJobUrl = normalizeJobUrl(validatedInput.jobUrl);

      // Find all active applications for this candidate in this tenant
      const activeRows = await tx
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
          )
        )
        .orderBy(desc(jobApplications.updatedAt));

      let matchedExisting = null;

      // Priority 1: Match by canonicalJobId
      if (canonicalJobId) {
        matchedExisting = activeRows.find(
          (row) =>
            row.canonicalJobId === canonicalJobId ||
            row.metadata?.canonicalJobId === canonicalJobId ||
            row.metadata?.jobId === canonicalJobId ||
            row.id === canonicalJobId
        );
      }

      // Priority 2: Match by normalizedJobUrl
      if (!matchedExisting && normalizedJobUrl) {
        matchedExisting = activeRows.find((row) => {
          if (row.normalizedJobUrl && row.normalizedJobUrl === normalizedJobUrl) return true;
          if (row.jobUrl && normalizeJobUrl(row.jobUrl) === normalizedJobUrl) return true;
          return false;
        });
      }

      // Priority 3: Guarded legacy fallback by (company, title)
      if (!matchedExisting) {
        const companyMatches = activeRows.filter(
          (row) =>
            row.companyName.trim().toLowerCase() === validatedInput.companyName.trim().toLowerCase() &&
            row.jobTitle.trim().toLowerCase() === validatedInput.jobTitle.trim().toLowerCase()
        );

        // Guard: Do not merge distinct roles with conflicting canonical job identities or URLs
        matchedExisting = companyMatches.find((row) => {
          const rowCanonical =
            row.canonicalJobId || row.metadata?.canonicalJobId || row.metadata?.jobId;
          if (rowCanonical && canonicalJobId && rowCanonical !== canonicalJobId) {
            return false; // Conflicting canonical IDs -> distinct roles!
          }
          const rowNormUrl = row.normalizedJobUrl || normalizeJobUrl(row.jobUrl);
          if (rowNormUrl && normalizedJobUrl && rowNormUrl !== normalizedJobUrl) {
            return false; // Conflicting URLs -> distinct roles!
          }
          return true;
        });
      }

      if (matchedExisting) {
        logger.info(
          {
            tenantId,
            candidateId,
            applicationId: matchedExisting.id,
            companyName: validatedInput.companyName,
            jobTitle: validatedInput.jobTitle,
            canonicalJobId,
          },
          'Duplicate active job application detected for candidate; reusing existing application ID'
        );

        // Backfill missing canonical fields on the existing record if available
        const updates = {};
        if (!matchedExisting.canonicalJobId && canonicalJobId) {
          updates.canonicalJobId = canonicalJobId;
        }
        if (!matchedExisting.normalizedJobUrl && normalizedJobUrl) {
          updates.normalizedJobUrl = normalizedJobUrl;
        }
        if (Object.keys(updates).length > 0) {
          const [updated] = await tx
            .update(jobApplications)
            .set(updates)
            .where(eq(jobApplications.id, matchedExisting.id))
            .returning();
          return { ...updated, isReused: true };
        }

        return { ...matchedExisting, isReused: true };
      }

      // 3. Status and Timestamp Initializations
      const status = validatedInput.status || 'SAVED';
      let appliedAt = validatedInput.appliedAt || null;
      if (status === 'APPLIED' && !appliedAt) {
        appliedAt = new Date();
      }

      // 4. Insert Job Application Record
      const [application] = await tx
        .insert(jobApplications)
        .values({
          ...(validatedInput.id ? { id: validatedInput.id } : {}),
          tenantId,
          candidateId,
          canonicalJobId,
          normalizedJobUrl,
          companyName: validatedInput.companyName,
          jobTitle: validatedInput.jobTitle,
          jobUrl: validatedInput.jobUrl || null,
          source: validatedInput.source || 'MANUAL',
          location: validatedInput.location || null,
          workplaceType: validatedInput.workplaceType || null,
          employmentType: validatedInput.employmentType || null,
          rawJobDescription: validatedInput.rawJobDescription || null,
          parsedJobDescription: validatedInput.parsedJobDescription || null,
          atsFitSnapshot: validatedInput.atsFitSnapshot || null,
          status,
          appliedAt,
          closedAt: isTerminalStatus(status) ? new Date() : null,
          compensation: validatedInput.compensation || {},
          notes: validatedInput.notes || null,
          metadata: {
            ...(canonicalJobId ? { canonicalJobId, jobId: canonicalJobId } : {}),
            ...(validatedInput.metadata || {}),
          },
        })
        .returning();

      // 5. Emit Audit Event Atomically
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.created',
        resourceType: 'job_application',
        resourceId: application.id,
        details: {
          companyName: application.companyName,
          jobTitle: application.jobTitle,
          source: application.source,
          status: application.status,
          hasAtsFitSnapshot: Boolean(application.atsFitSnapshot),
          hasParsedJd: Boolean(application.parsedJobDescription),
        },
      });

      return application;
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Update Application Status
  // ---------------------------------------------------------------------------

  /**
   * Updates an application status with strict state machine validation.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {string} newStatus Target status
   * @param {string} [reason] Optional transition reason
   * @returns {Promise<object>} Updated application record
   */
  async updateApplicationStatus(context, applicationId, newStatus, reason = null) {
    this._validateContext(context, true);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (!newStatus) {
      throw new ValidationError('newStatus is required');
    }

    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      // 1. Load application with row lock for update
      const [existing] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!existing) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // 2. Validate Transition via State Machine
      assertValidStatusTransition(existing.status, newStatus);

      // 3. Calculate Timestamp Mutations
      const now = new Date();
      let appliedAt = existing.appliedAt;
      let closedAt = existing.closedAt;

      if (newStatus === 'APPLIED' && !appliedAt) {
        appliedAt = now;
      }

      if (isTerminalStatus(newStatus)) {
        closedAt = now;
      } else if (isTerminalStatus(existing.status) && !isTerminalStatus(newStatus)) {
        // Reopened from terminal state
        closedAt = null;
      }

      // 4. Update Application Record
      const [updated] = await tx
        .update(jobApplications)
        .set({
          status: newStatus,
          appliedAt,
          closedAt,
          updatedAt: now,
        })
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .returning();

      // 5. Determine Audit Event Type
      let eventType = 'job_application.status_changed';
      if (newStatus === 'ARCHIVED') {
        eventType = 'job_application.archived';
      } else if (isTerminalStatus(existing.status) && !isTerminalStatus(newStatus)) {
        eventType = 'job_application.reopened';
      }

      // 6. Emit Audit Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType,
        resourceType: 'job_application',
        resourceId: applicationId,
        details: {
          previousStatus: existing.status,
          newStatus,
          reason: reason || null,
          companyName: existing.companyName,
          jobTitle: existing.jobTitle,
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Add Application Stage
  // ---------------------------------------------------------------------------

  /**
   * Appends an interview / screening stage event to a job application.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} rawStageInput Stage input payload
   * @returns {Promise<object>} Created stage record
   */
  async addApplicationStage(context, applicationId, rawStageInput) {
    this._validateContext(context, true);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }

    const tenantId = context.tenantId;
    const validated = CreateApplicationStageInputSchema.parse(rawStageInput);

    return await this.db.transaction(async (tx) => {
      // 1. Verify parent application exists and belongs to tenant
      const [application] = await tx
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // 2. Deterministic Monotonic Order Index Calculation
      const [maxOrder] = await tx
        .select({
          maxIndex: sql`COALESCE(MAX(${applicationStages.orderIndex}), -1)`.as('max_index'),
        })
        .from(applicationStages)
        .where(
          and(
            eq(applicationStages.applicationId, applicationId),
            eq(applicationStages.tenantId, tenantId)
          )
        );

      const nextOrderIndex = Number(maxOrder?.maxIndex ?? -1) + 1;

      // 3. Insert Stage Event
      const [stage] = await tx
        .insert(applicationStages)
        .values({
          tenantId,
          applicationId,
          stageType: validated.stageType,
          title: validated.title,
          scheduledAt: validated.scheduledAt || null,
          completedAt: validated.completedAt || null,
          outcome: validated.outcome || 'PENDING',
          interviewerNames: validated.interviewerNames || [],
          feedback: validated.feedback || null,
          orderIndex: nextOrderIndex,
          metadata: validated.metadata || {},
        })
        .returning();

      // 4. Emit Audit Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.stage_added',
        resourceType: 'application_stage',
        resourceId: stage.id,
        details: {
          applicationId,
          stageType: stage.stageType,
          title: stage.title,
          orderIndex: stage.orderIndex,
          outcome: stage.outcome,
        },
      });

      return stage;
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Update Stage Outcome
  // ---------------------------------------------------------------------------

  /**
   * Updates an application stage outcome and feedback.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} stageId Stage UUID
   * @param {string} outcome Stage outcome enum value
   * @param {string} [feedback] Candidate interview reflection / feedback notes
   * @param {object} [options={}] Optional scheduling parameters
   * @returns {Promise<object>} Updated stage record
   */
  async updateStageOutcome(context, stageId, outcome, feedback = null, options = {}) {
    this._validateContext(context, true);

    if (!stageId) {
      throw new ValidationError('stageId is required');
    }

    const validated = UpdateApplicationStageInputSchema.parse({
      outcome,
      feedback: feedback !== null ? feedback : undefined,
      scheduledAt: options.scheduledAt,
    });

    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      // 1. Load stage with row lock
      const [stage] = await tx
        .select()
        .from(applicationStages)
        .where(and(eq(applicationStages.id, stageId), eq(applicationStages.tenantId, tenantId)))
        .for('update');

      if (!stage) {
        throw new NotFoundError(`Application stage not found: ${stageId}`);
      }

      const now = new Date();
      let completedAt = stage.completedAt;
      let scheduledAt = stage.scheduledAt;

      if (validated.outcome === 'PASSED' || validated.outcome === 'FAILED') {
        completedAt = completedAt || now;
      } else if (validated.outcome === 'RESCHEDULED') {
        completedAt = null;
        if (validated.scheduledAt) {
          scheduledAt = validated.scheduledAt;
        }
      }

      // 3. Update Stage Record
      const [updated] = await tx
        .update(applicationStages)
        .set({
          outcome: validated.outcome || stage.outcome,
          feedback: validated.feedback !== undefined ? validated.feedback : stage.feedback,
          scheduledAt,
          completedAt,
          updatedAt: now,
        })
        .where(and(eq(applicationStages.id, stageId), eq(applicationStages.tenantId, tenantId)))
        .returning();

      // 4. Emit Audit Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.stage_outcome_updated',
        resourceType: 'application_stage',
        resourceId: stageId,
        details: {
          applicationId: stage.applicationId,
          stageType: stage.stageType,
          previousOutcome: stage.outcome,
          newOutcome: updated.outcome,
          hasFeedback: Boolean(updated.feedback),
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Attach Tailored Document Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Attaches an immutable tailored artifact snapshot to a job application.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} rawDocInput Tailored document snapshot payload
   * @returns {Promise<object>} Created immutable document record
   */
  async attachTailoredDocument(context, applicationId, rawDocInput) {
    this._validateContext(context, true);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }

    const tenantId = context.tenantId;
    const validated = CreateTailoredDocumentInputSchema.parse(rawDocInput);

    return await this.db.transaction(async (tx) => {
      // 1. Verify parent application exists and matches candidate
      const [application] = await tx
        .select({ id: jobApplications.id, candidateId: jobApplications.candidateId })
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      if (application.candidateId !== validated.candidateId) {
        throw new ValidationError('Document candidateId does not match application candidateId', {
          applicationCandidateId: application.candidateId,
          documentCandidateId: validated.candidateId,
        });
      }

      // 2. Authoritative Server-Computed Content Hash (Client hash is ignored/overridden)
      const contentHash = computeDocumentContentHash(validated.content);

      // 3. Monotonic Version Calculation per (applicationId, documentType)
      const [maxVersion] = await tx
        .select({
          maxVer: sql`COALESCE(MAX(${tailoredDocuments.version}), 0)`.as('max_ver'),
        })
        .from(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.applicationId, applicationId),
            eq(tailoredDocuments.documentType, validated.documentType),
            eq(tailoredDocuments.tenantId, tenantId)
          )
        );

      const nextVersion = Number(maxVersion?.maxVer ?? 0) + 1;

      // 4. Insert Immutable Document Record
      const [document] = await tx
        .insert(tailoredDocuments)
        .values({
          tenantId,
          applicationId,
          candidateId: validated.candidateId,
          documentType: validated.documentType,
          version: nextVersion,
          title: validated.title,
          content: validated.content,
          renderedMarkdown: validated.renderedMarkdown || null,
          renderedPlainText: validated.renderedPlainText || null,
          contentHash,
          citationRefs: validated.citationRefs || [],
          integrityScore: validated.integrityScore || null,
          atsFitScore: validated.atsFitScore || null,
          metadata: validated.metadata || {},
        })
        .returning();

      // 5. Emit Audit Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.document_attached',
        resourceType: 'tailored_document',
        resourceId: document.id,
        details: {
          applicationId,
          candidateId: document.candidateId,
          documentType: document.documentType,
          version: document.version,
          contentHash: document.contentHash,
          citationRefsCount: document.citationRefs.length,
          integrityScore: document.integrityScore,
          atsFitScore: document.atsFitScore,
        },
      });

      return document;
    });
  }

  // ---------------------------------------------------------------------------
  // 5b. Application Package Version Ledger (P14-005BA)
  // ---------------------------------------------------------------------------

  /**
   * Resolves or creates the single tracked application for a candidate + job
   * target, reusing an existing active application when one matches. This is
   * the authoritative applicationId↔(candidate, job) relationship: repeated
   * preparations for the same target reuse the SAME applicationId and simply
   * add package versions to it.
   *
   * Selection order among multiple active matches (deterministic):
   * 1. Application whose metadata.currentPackageHash equals packageHash (exact
   *    version continuation), then by latest updated.
   * 2. Most recently updated non-terminal application.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} candidateId Candidate UUID
   * @param {object} target { company, title, jobUrl, source, metadata, notes }
   * @returns {Promise<object>} application row (existing or newly created)
   */
  async resolveOrCreateApplication(context, candidateId, target) {
    this._validateContext(context, true);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }
    const tenantId = context.tenantId;

    // Accept both { company, title } and { companyName, jobTitle } target shapes
    const companyName = String(target.company ?? target.companyName ?? '').trim();
    const jobTitle = String(target.title ?? target.jobTitle ?? '').trim();
    const rawJobUrl = target.jobUrl || target.applicationUrl || target.directPortalUrl || null;
    const normalizedJobUrl = normalizeJobUrl(rawJobUrl);
    const canonicalJobId =
      target.canonicalJobId ||
      target.jobId ||
      target.metadata?.canonicalJobId ||
      deriveCanonicalJobId(target) ||
      null;
    const explicitApplicationId = target.applicationId || target.id || null;

    if (!companyName || !jobTitle) {
      throw new ValidationError('target.company and target.title are required');
    }

    // 1. Candidate must exist within the tenant
    const [candidate] = await this.db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));
    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    // 2. Priority 0: Explicit applicationId lookup
    if (explicitApplicationId) {
      const [app] = await this.db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            eq(jobApplications.id, explicitApplicationId),
            sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
          )
        );
      if (app) {
        const updates = {};
        if (!app.canonicalJobId && canonicalJobId) updates.canonicalJobId = canonicalJobId;
        if (!app.normalizedJobUrl && normalizedJobUrl) updates.normalizedJobUrl = normalizedJobUrl;
        if (Object.keys(updates).length > 0) {
          const [updated] = await this.db
            .update(jobApplications)
            .set(updates)
            .where(eq(jobApplications.id, app.id))
            .returning();
          return { ...updated, isReused: true };
        }
        return { ...app, isReused: true };
      }
    }

    // 3. Query all active applications for this candidate in this tenant
    const activeRows = await this.db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenantId),
          eq(jobApplications.candidateId, candidateId),
          sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
        )
      )
      .orderBy(desc(jobApplications.updatedAt));

    let matched = null;

    // Priority 1: Match by canonicalJobId
    if (canonicalJobId) {
      matched = activeRows.find(
        (row) =>
          row.canonicalJobId === canonicalJobId ||
          row.metadata?.canonicalJobId === canonicalJobId ||
          row.metadata?.jobId === canonicalJobId ||
          row.id === canonicalJobId
      );
    }

    // Priority 2: Match by normalizedJobUrl
    if (!matched && normalizedJobUrl) {
      matched = activeRows.find((row) => {
        if (row.normalizedJobUrl && row.normalizedJobUrl === normalizedJobUrl) return true;
        if (row.jobUrl && normalizeJobUrl(row.jobUrl) === normalizedJobUrl) return true;
        return false;
      });
    }

    // Priority 3: Guarded legacy fallback by (company, title)
    if (!matched) {
      const companyMatches = activeRows.filter(
        (row) =>
          row.companyName.trim().toLowerCase() === companyName.toLowerCase() &&
          row.jobTitle.trim().toLowerCase() === jobTitle.toLowerCase()
      );

      // Guard: Do not merge distinct roles with conflicting canonical job identities or URLs
      matched = companyMatches.find((row) => {
        const rowCanonical =
          row.canonicalJobId || row.metadata?.canonicalJobId || row.metadata?.jobId;
        if (rowCanonical && canonicalJobId && rowCanonical !== canonicalJobId) {
          return false; // Conflicting canonical IDs -> distinct roles!
        }
        const rowNormUrl = row.normalizedJobUrl || normalizeJobUrl(row.jobUrl);
        if (rowNormUrl && normalizedJobUrl && rowNormUrl !== normalizedJobUrl) {
          return false; // Conflicting URLs -> distinct roles!
        }
        return true;
      });
    }

    if (matched) {
      if (target.packageHash && matched.metadata?.currentPackageHash === target.packageHash) {
        return { ...matched, isReused: true, packageReused: true };
      }
      const updates = {};
      if (!matched.canonicalJobId && canonicalJobId) updates.canonicalJobId = canonicalJobId;
      if (!matched.normalizedJobUrl && normalizedJobUrl) updates.normalizedJobUrl = normalizedJobUrl;
      if (Object.keys(updates).length > 0) {
        const [updated] = await this.db
          .update(jobApplications)
          .set(updates)
          .where(eq(jobApplications.id, matched.id))
          .returning();
        return { ...updated, isReused: true };
      }
      return { ...matched, isReused: true };
    }

    // 4. No active application for this target: create one.
    const validAppSources = [
      'LINKEDIN',
      'INDEED',
      'COMPANY_CAREERS',
      'REFERRAL',
      'RECRUITER',
      'MANUAL',
      'OTHER',
    ];
    const normalizedSource = validAppSources.includes(String(target.source || '').toUpperCase())
      ? String(target.source).toUpperCase()
      : 'COMPANY_CAREERS';

    return this.createApplication(context, candidateId, {
      companyName,
      jobTitle,
      jobUrl: rawJobUrl,
      canonicalJobId,
      normalizedJobUrl,
      source: normalizedSource,
      status: 'SAVED',
      notes: target.notes || null,
      metadata: {
        ...(canonicalJobId ? { canonicalJobId, jobId: canonicalJobId } : {}),
        ...(target.metadata || {}),
      },
    });
  }

  /**
   * Records an application package version as the authoritative CURRENT
   * package for an application, atomically demoting the previous CURRENT
   * version. The operation is idempotent: recording the same packageHash
   * again re-promotes the existing row without creating a duplicate.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} pkg Application package payload
   * @param {object} [options={}]
   * @param {string} [options.source='PREPARE_JOB_APPLICATION'] Persistence source
   * @returns {Promise<object>} The CURRENT package version row
   */
  async recordApplicationPackage(context, applicationId, pkg, options = {}) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (!pkg || !pkg.packageHash) {
      throw new ValidationError('pkg.packageHash is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      // 1. Lock application row for serialized version transitions
      const [application] = await tx
        .select({
          id: jobApplications.id,
          candidateId: jobApplications.candidateId,
          status: jobApplications.status,
          appliedAt: jobApplications.appliedAt,
          metadata: jobApplications.metadata,
        })
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // 1b. SAFE PRESERVE INVARIANT: If application was submitted, do not overwrite with a different package
      const isSubmitted =
        application.status !== 'SAVED' ||
        Boolean(application.appliedAt) ||
        application.metadata?.externalSubmissionState === 'SUBMITTED';

      // 2. Idempotent re-promotion of an existing identical version
      const [existingVersion] = await tx
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.tenantId, tenantId),
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.packageHash, pkg.packageHash)
          )
        )
        .for('update');

      if (isSubmitted && !existingVersion) {
        throw new ConflictError(
          `Cannot create or modify packages for application ${applicationId}: application has already been submitted (status: ${application.status}). Submitted packages are protected.`,
          'APPLICATION_ALREADY_SUBMITTED'
        );
      }

      const source = options.source || 'PREPARE_JOB_APPLICATION';
      let current;

      if (existingVersion) {
        // Re-point CURRENT at the existing row (covers re-preparation after
        // switching back to an older package content).
        const [promoted] = await tx
          .update(applicationPackages)
          .set({ lifecycleState: 'CURRENT', preparedAt: new Date() })
          .where(eq(applicationPackages.id, existingVersion.id))
          .returning();
        current = promoted;
      } else {
        // 3. Monotonic version number per application
        const [maxVersion] = await tx
          .select({
            maxVer: sql`COALESCE(MAX(${applicationPackages.version}), 0)`.as('max_ver'),
          })
          .from(applicationPackages)
          .where(eq(applicationPackages.applicationId, applicationId));
        const nextVersion = Number(maxVersion?.maxVer ?? 0) + 1;

        const [inserted] = await tx
          .insert(applicationPackages)
          .values({
            tenantId,
            applicationId,
            candidateId: pkg.candidateId || application.candidateId,
            version: nextVersion,
            packageHash: pkg.packageHash,
            resumeContentHash: pkg.tailoredResume?.contentHash || null,
            coverLetterContentHash: pkg.coverLetter?.contentHash || null,
            fitScore: pkg.tailoredResume?.fitScore ?? null,
            answers: pkg.answers || {},
            source,
            lifecycleState: 'CURRENT',
          })
          .returning();
        current = inserted;
        // 4. Demote every other version (history preserved, never deleted)
        await tx
          .update(applicationPackages)
          .set({ lifecycleState: 'ARCHIVED' })
          .where(
            and(
              eq(applicationPackages.applicationId, applicationId),
              ne(applicationPackages.id, current.id)
            )
          );
      }

      // 5. Demote all other versions when re-promoting an existing row too
      await tx
        .update(applicationPackages)
        .set({ lifecycleState: 'ARCHIVED' })
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            ne(applicationPackages.id, current.id)
          )
        );

      // 6. Sync application notes/metadata so every surface (notes scan in
      //    get_application_submission_status, web UI, audit) agrees on the
      //    authoritative package hash. Preserve prior hashes in metadata
      //    history for auditability.
      const [freshApp] = await tx
        .select({ notes: jobApplications.notes, metadata: jobApplications.metadata })
        .from(jobApplications)
        .where(eq(jobApplications.id, applicationId))
        .for('update');

      const metadata = { ...(freshApp.metadata || {}) };
      if (metadata.currentPackageHash && metadata.currentPackageHash !== pkg.packageHash) {
        metadata.previousPackageHashes = [
          ...new Set([...(metadata.previousPackageHashes || []), metadata.currentPackageHash]),
        ].slice(-10);
      }
      metadata.currentPackageHash = pkg.packageHash;
      metadata.currentPackageVersion = current.version;

      const notesLine = `Current Package Hash: ${pkg.packageHash}`;
      let notes = freshApp.notes || '';
      if (notes.includes('Current Package Hash:')) {
        notes = notes.replace(/Current Package Hash: [a-f0-9]{64}/, notesLine);
      } else {
        notes = notes ? `${notes}\n${notesLine}` : notesLine;
      }

      await tx
        .update(jobApplications)
        .set({ notes, metadata, updatedAt: new Date() })
        .where(eq(jobApplications.id, applicationId));

      // 7. Atomic audit event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.package_recorded',
        resourceType: 'application_package',
        resourceId: current.id,
        details: {
          applicationId,
          packageVersion: current.version,
          packageHash: current.packageHash,
          lifecycleState: current.lifecycleState,
          source,
        },
      });

      return {
        ...current,
        isReused: Boolean(existingVersion),
      };
    });
  }

  /**
   * Idempotently attaches TAILORED_RESUME / TAILORED_COVER_LETTER snapshot
   * rows for a specific package version (P14-005BA).
   *
   * A bare prepare_job_application must leave get_job_application's
   * tailoredDocuments consistent with the CURRENT package even before any
   * handoff kit is built. Snapshot rows are tagged with metadata.packageHash;
   * rows for the same package are never duplicated, and rows belonging to
   * earlier package versions are preserved for auditability.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} pkg Application package payload (tailoredResume, coverLetter, packageHash)
   * @returns {Promise<object>} Summary of attached and skipped document types
   */
  async attachPackageDocumentSnapshots(context, applicationId, pkg) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (!pkg || !pkg.packageHash) {
      throw new ValidationError('pkg.packageHash is required');
    }

    const details = await this.getApplicationDetails(context, applicationId);
    const packageHash = pkg.packageHash;
    const rows = details.tailoredDocuments || [];

    const hasSnapshotForPackage = (documentType) =>
      rows.some(
        (document) =>
          document.documentType === documentType &&
          (document.metadata?.packageHash === packageHash ||
            document.metadata?.artifact?.packageHash === packageHash)
      );

    const documents = [
      ['TAILORED_RESUME', pkg.tailoredResume],
      ['TAILORED_COVER_LETTER', pkg.coverLetter],
    ];

    const attached = [];
    const skipped = [];
    for (const [documentType, source] of documents) {
      if (!source?.markdownContent) {
        skipped.push(documentType);
        continue;
      }
      if (hasSnapshotForPackage(documentType)) {
        skipped.push(documentType);
        continue;
      }
      await this.attachTailoredDocument(context, applicationId, {
        candidateId: pkg.candidateId || details.application.candidateId,
        documentType,
        title: source.title,
        content: {
          markdownContent: source.markdownContent,
          packageHash,
        },
        renderedMarkdown: source.markdownContent,
        metadata: {
          source: 'PREPARE_JOB_APPLICATION',
          packageHash,
          // P14-005BC: Store the authoritative Markdown-only content hash from
          // prepare_job_application so legacy fallback paths can use it.
          // This is DIFFERENT from tailored_documents.contentHash which hashes
          // the entire content object {markdownContent, packageHash}.
          markdownContentHash: source.contentHash,
        },
        atsFitScore: documentType === 'TAILORED_RESUME' ? (source.fitScore ?? null) : null,
      });
      attached.push(documentType);
    }

    return { attached, skipped };
  }

  /**
   * Resolves the authoritative CURRENT package version for an application.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object|null>} CURRENT package row, or null when none exists
   */
  async getCurrentApplicationPackage(context, applicationId) {
    this._validateContext(context, false);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    const [current] = await this.db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.applicationId, applicationId),
          eq(applicationPackages.tenantId, tenantId),
          eq(applicationPackages.lifecycleState, 'CURRENT')
        )
      )
      .orderBy(desc(applicationPackages.version))
      .limit(1);

    return current || null;
  }

  /**
   * Lists all package versions for an application ordered by version descending.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @returns {Promise<Array<object>>} List of application packages
   */
  async listApplicationPackages(context, applicationId) {
    this._validateContext(context, false);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    const [application] = await this.db
      .select({ id: jobApplications.id })
      .from(jobApplications)
      .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

    if (!application) {
      throw new NotFoundError(`Job application not found: ${applicationId}`);
    }

    const packages = await this.db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.applicationId, applicationId),
          eq(applicationPackages.tenantId, tenantId)
        )
      )
      .orderBy(desc(applicationPackages.version));

    return packages;
  }

  /**
   * Retrieves a specific package version for an application along with its document snapshots.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {number|string} versionOrHash Version number or SHA-256 package hash
   * @returns {Promise<{ package: object, documentSnapshots: Array<object> }>}
   */
  async getApplicationPackageByVersion(context, applicationId, versionOrHash) {
    this._validateContext(context, false);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (versionOrHash === undefined || versionOrHash === null || versionOrHash === '') {
      throw new ValidationError('version or packageHash is required');
    }
    const tenantId = context.tenantId;

    const isVersionNumber =
      !isNaN(Number(versionOrHash)) && Number.isInteger(Number(versionOrHash));

    const condition = isVersionNumber
      ? eq(applicationPackages.version, Number(versionOrHash))
      : eq(applicationPackages.packageHash, String(versionOrHash));

    const [pkg] = await this.db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.applicationId, applicationId),
          eq(applicationPackages.tenantId, tenantId),
          condition
        )
      )
      .limit(1);

    if (!pkg) {
      throw new NotFoundError(
        `Application package not found for ${isVersionNumber ? 'version' : 'hash'}: ${versionOrHash}`
      );
    }

    const snapshots = await this.db
      .select()
      .from(tailoredDocuments)
      .where(
        and(
          eq(tailoredDocuments.applicationId, applicationId),
          eq(tailoredDocuments.tenantId, tenantId)
        )
      )
      .orderBy(desc(tailoredDocuments.createdAt));

    const packageSnapshots = snapshots.filter(
      (doc) =>
        doc.metadata?.packageHash === pkg.packageHash ||
        doc.metadata?.artifact?.packageHash === pkg.packageHash
    );

    return {
      package: pkg,
      documentSnapshots: packageSnapshots,
    };
  }

  /**
   * Restores an archived package version as the authoritative CURRENT version.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {number|string} packageVersion Version number to restore
   * @returns {Promise<object>} Promoted package record
   */
  async restoreApplicationPackage(context, applicationId, packageVersion) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const versionNum = Number(packageVersion);
    if (isNaN(versionNum) || !Number.isInteger(versionNum) || versionNum <= 0) {
      throw new ValidationError('Valid positive integer packageVersion is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      const [targetPackage] = await tx
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId),
            eq(applicationPackages.version, versionNum)
          )
        )
        .for('update');

      if (!targetPackage) {
        throw new NotFoundError(`Application package version ${versionNum} not found`);
      }

      // Promote target package to CURRENT
      const [promoted] = await tx
        .update(applicationPackages)
        .set({ lifecycleState: 'CURRENT' })
        .where(eq(applicationPackages.id, targetPackage.id))
        .returning();

      // Archive all other versions
      await tx
        .update(applicationPackages)
        .set({ lifecycleState: 'ARCHIVED' })
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            ne(applicationPackages.id, targetPackage.id)
          )
        );

      // Sync application metadata and notes
      const metadata = { ...(application.metadata || {}) };
      if (
        metadata.currentPackageHash &&
        metadata.currentPackageHash !== targetPackage.packageHash
      ) {
        metadata.previousPackageHashes = [
          ...new Set([...(metadata.previousPackageHashes || []), metadata.currentPackageHash]),
        ].slice(-10);
      }
      metadata.currentPackageHash = targetPackage.packageHash;
      metadata.currentPackageVersion = targetPackage.version;

      const notesLine = `Current Package Hash: ${targetPackage.packageHash}`;
      let notes = application.notes || '';
      if (notes.includes('Current Package Hash:')) {
        notes = notes.replace(/Current Package Hash: [a-f0-9]{64}/, notesLine);
      } else {
        notes = notes ? `${notes}\n${notesLine}` : notesLine;
      }

      await tx
        .update(jobApplications)
        .set({ notes, metadata, updatedAt: new Date() })
        .where(eq(jobApplications.id, applicationId));

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.package_restored',
        resourceType: 'application_package',
        resourceId: targetPackage.id,
        details: {
          applicationId,
          restoredVersion: targetPackage.version,
          packageHash: targetPackage.packageHash,
        },
      });

      return promoted;
    });
  }

  /**
   * Manually archives an application package version.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {number|string} packageVersion Version number to archive
   * @returns {Promise<object>} Archived package record
   */
  async archiveApplicationPackage(context, applicationId, packageVersion) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const versionNum = Number(packageVersion);
    if (isNaN(versionNum) || !Number.isInteger(versionNum) || versionNum <= 0) {
      throw new ValidationError('Valid positive integer packageVersion is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      const [targetPackage] = await tx
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId),
            eq(applicationPackages.version, versionNum)
          )
        )
        .for('update');

      if (!targetPackage) {
        throw new NotFoundError(`Application package version ${versionNum} not found`);
      }

      const [archived] = await tx
        .update(applicationPackages)
        .set({ lifecycleState: 'ARCHIVED' })
        .where(eq(applicationPackages.id, targetPackage.id))
        .returning();

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.package_archived',
        resourceType: 'application_package',
        resourceId: targetPackage.id,
        details: {
          applicationId,
          packageVersion: targetPackage.version,
          packageHash: targetPackage.packageHash,
        },
      });

      return archived;
    });
  }

  /**
   * Safely deletes an archived package version and its snapshots if permitted.
   * Rejects deletion if application is submitted/progressed, or if it is the sole package,
   * or if it is currently active.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {number|string} packageVersion Version number to delete
   * @returns {Promise<object>} Deletion outcome
   */
  async safeDeleteApplicationPackage(context, applicationId, packageVersion) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const versionNum = Number(packageVersion);
    if (isNaN(versionNum) || !Number.isInteger(versionNum) || versionNum <= 0) {
      throw new ValidationError('Valid positive integer packageVersion is required');
    }
    const tenantId = context.tenantId;

    const result = await this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // SAFE DELETE RULE 1: Never delete packages for submitted or progressed applications
      if (
        application.status !== 'SAVED' ||
        application.appliedAt ||
        application.metadata?.externalSubmissionState === 'SUBMITTED'
      ) {
        throw new ConflictError(
          `Cannot delete package: application ${applicationId} has submission history or status ${application.status}. Packages cannot be deleted once an application is submitted.`,
          'PACKAGE_DELETE_NOT_PERMITTED'
        );
      }

      const allPackages = await tx
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId)
          )
        )
        .for('update');

      // SAFE DELETE RULE 2: Cannot delete sole package
      if (allPackages.length <= 1) {
        throw new ConflictError(
          `Cannot delete package: this is the sole package for application ${applicationId}. Applications must have at least one package.`,
          'CANNOT_DELETE_SOLE_PACKAGE'
        );
      }

      const targetPackage = allPackages.find((p) => p.version === versionNum);
      if (!targetPackage) {
        throw new NotFoundError(`Application package version ${versionNum} not found`);
      }

      // SAFE DELETE RULE 3: Cannot delete CURRENT package
      if (targetPackage.lifecycleState === 'CURRENT') {
        throw new ConflictError(
          `Cannot delete the CURRENT active package (version ${versionNum}). Restore another package version first before deleting this one.`,
          'CANNOT_DELETE_CURRENT_PACKAGE'
        );
      }

      // Delete document snapshots
      const matchingDocs = await tx
        .select()
        .from(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.applicationId, applicationId),
            eq(tailoredDocuments.tenantId, tenantId)
          )
        );

      const docsToDelete = matchingDocs.filter(
        (d) =>
          d.metadata?.packageHash === targetPackage.packageHash ||
          d.metadata?.artifact?.packageHash === targetPackage.packageHash
      );

      const candidateStorageKeys = docsToDelete
        .map((d) => d.metadata?.artifact?.storageKey)
        .filter(Boolean);

      // SAFE ARTIFACT CLEANUP: Only delete physical storage files if no other document,
      // no other package, and no current handoff kit references the storageKey.
      const safeStorageKeysToDelete = [];
      for (const storageKey of candidateStorageKeys) {
        const referencedInOtherDocs = matchingDocs.some(
          (d) =>
            !docsToDelete.some((delDoc) => delDoc.id === d.id) &&
            (d.metadata?.artifact?.storageKey === storageKey || d.storageKey === storageKey)
        );
        const referencedInCurrentHandoffKit =
          application.metadata?.handoffKit?.tailoredResume?.artifact?.storageKey === storageKey ||
          application.metadata?.handoffKit?.tailoredCoverLetter?.artifact?.storageKey ===
            storageKey;

        const referencedInOtherPackages = allPackages.some(
          (p) =>
            p.id !== targetPackage.id &&
            (p.metadata?.resumeStorageKey === storageKey ||
              p.metadata?.coverLetterStorageKey === storageKey ||
              p.answers?.resumeStorageKey === storageKey)
        );

        if (
          !referencedInOtherDocs &&
          !referencedInCurrentHandoffKit &&
          !referencedInOtherPackages
        ) {
          safeStorageKeysToDelete.push(storageKey);
        }
      }

      if (docsToDelete.length > 0) {
        const docIds = docsToDelete.map((d) => d.id);
        await tx.delete(tailoredDocuments).where(inArray(tailoredDocuments.id, docIds));
      }

      await tx.delete(applicationPackages).where(eq(applicationPackages.id, targetPackage.id));

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.package_deleted',
        resourceType: 'application_package',
        resourceId: targetPackage.id,
        details: {
          applicationId,
          packageVersion: versionNum,
          packageHash: targetPackage.packageHash,
          deletedSnapshots: docsToDelete.length,
          deletedArtifacts: safeStorageKeysToDelete.length,
        },
      });

      return {
        deleted: true,
        applicationId,
        packageVersion: versionNum,
        packageHash: targetPackage.packageHash,
        storageKeys: safeStorageKeysToDelete,
      };
    });

    // Best-effort cleanup of encrypted storage files
    for (const storageKey of result.storageKeys) {
      try {
        await this._getDocumentStorage().deleteEncryptedDocument({
          tenantId,
          storageKey,
        });
      } catch (err) {
        logger.warn(
          { err: err.message, applicationId, storageKey },
          'Failed to clean up storage file for deleted package'
        );
      }
    }

    return result;
  }

  /**
   * Sets the application's handoff kit metadata atomically. A kit generated
   * for a historical package is retained for auditability but cannot move the
   * application's authoritative current-package pointer backwards.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} handoffKit Complete handoff kit payload
   * @returns {Promise<object>} Updated application row
   */
  async setApplicationHandoffKit(context, applicationId, handoffKit) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    if (!handoffKit || !handoffKit.packageHash) {
      throw new ValidationError('handoffKit.packageHash is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      const [currentPackage] = await tx
        .select({ packageHash: applicationPackages.packageHash })
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId),
            eq(applicationPackages.lifecycleState, 'CURRENT')
          )
        )
        .orderBy(desc(applicationPackages.version))
        .limit(1);

      // A handoff kit may be generated for a historical package version. It
      // must remain auditable, but it must never move the application's
      // authoritative CURRENT pointer backwards. Legacy applications without
      // a package ledger may still initialize the pointer from their first kit.
      const packageIsCurrent =
        !currentPackage || currentPackage.packageHash === handoffKit.packageHash;

      const metadata = {
        ...(application.metadata || {}),
        handoffKit,
        ...(packageIsCurrent
          ? {
              currentPackageHash: handoffKit.packageHash,
              externalSubmissionState: 'HANDOFF_READY',
            }
          : {}),
      };

      const [updated] = await tx
        .update(jobApplications)
        .set({ metadata, updatedAt: new Date() })
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .returning();

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.handoff_kit_persisted',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: { packageHash: handoffKit.packageHash },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Get Application Details
  // ---------------------------------------------------------------------------

  /**
   * Retrieves full details for an application including chronological stages and tailored artifacts.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object>} Complete application details
   */
  async getApplicationDetails(context, applicationId) {
    this._validateContext(context, false);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }

    const tenantId = context.tenantId;

    // 1. Fetch Root Application
    const [application] = await this.db
      .select()
      .from(jobApplications)
      .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

    if (!application) {
      throw new NotFoundError(`Job application not found: ${applicationId}`);
    }

    // 2. Fetch Chronological Stages
    const stages = await this.db
      .select()
      .from(applicationStages)
      .where(
        and(
          eq(applicationStages.applicationId, applicationId),
          eq(applicationStages.tenantId, tenantId)
        )
      )
      .orderBy(asc(applicationStages.orderIndex), asc(applicationStages.createdAt));

    // 3. Fetch Tailored Document Snapshots
    const documents = await this.db
      .select()
      .from(tailoredDocuments)
      .where(
        and(
          eq(tailoredDocuments.applicationId, applicationId),
          eq(tailoredDocuments.tenantId, tenantId)
        )
      )
      .orderBy(desc(tailoredDocuments.createdAt));

    // 4. Resolve the authoritative CURRENT application package version
    // (P14-005BA). Exactly one package version per application is CURRENT;
    // get_job_application and get_application_submission_status must both
    // resolve this version so a freshly prepared package is never shadowed
    // by stale metadata or historical document snapshots.
    const [currentPackage] = await this.db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.applicationId, applicationId),
          eq(applicationPackages.tenantId, tenantId),
          eq(applicationPackages.lifecycleState, 'CURRENT')
        )
      )
      .orderBy(desc(applicationPackages.version))
      .limit(1);

    return {
      application,
      stages,
      tailoredDocuments: documents,
      currentPackage: currentPackage || null,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. List Applications
  // ---------------------------------------------------------------------------

  /**
   * Lists job applications for a candidate with bounded pagination and filtering.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} candidateId Candidate UUID
   * @param {object} [filter={}] Filter parameters
   * @param {object} [pagination={}] Pagination parameters { limit, offset }
   * @returns {Promise<object>} Bounded paginated list
   */
  async listApplications(context, candidateId, filter = {}, pagination = {}) {
    this._validateContext(context, false);

    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    // 1. Verify candidate belongs to tenant
    const [candidate] = await this.db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    // 2. Construct Filter Conditions
    const conditions = [
      eq(jobApplications.tenantId, tenantId),
      eq(jobApplications.candidateId, candidateId),
    ];

    if (filter.status) {
      if (Array.isArray(filter.status) && filter.status.length > 0) {
        conditions.push(inArray(jobApplications.status, filter.status));
      } else if (typeof filter.status === 'string') {
        conditions.push(eq(jobApplications.status, filter.status));
      }
    }

    if (filter.companyName) {
      conditions.push(ilike(jobApplications.companyName, `%${filter.companyName}%`));
    }

    if (filter.source) {
      conditions.push(eq(jobApplications.source, filter.source));
    }

    if (filter.workplaceType) {
      conditions.push(eq(jobApplications.workplaceType, filter.workplaceType));
    }

    const whereClause = and(...conditions);

    // 3. Bounded Pagination Settings
    const limit = Math.min(Math.max(Number(pagination.limit) || 20, 1), 100);
    const offset = Math.max(Number(pagination.offset) || 0, 0);

    // 4. Query Total Count and Page Records in Parallel
    const [countResult, items] = await Promise.all([
      this.db.select({ total: count() }).from(jobApplications).where(whereClause),
      this.db
        .select()
        .from(jobApplications)
        .where(whereClause)
        .orderBy(desc(jobApplications.appliedAt), desc(jobApplications.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Fetches a single application row (tenant-scoped).
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object>} Application row
   * @throws {NotFoundError} When the application does not exist in the tenant
   */
  async getApplication(context, applicationId) {
    this._validateContext(context, false);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    const [application] = await this.db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenantId),
          or(
            eq(jobApplications.id, applicationId),
            sql`${jobApplications.metadata}->>'jobId' = ${applicationId}`,
            sql`${jobApplications.metadata}->>'canonicalJobId' = ${applicationId}`
          )
        )
      );

    if (!application) {
      throw new NotFoundError(`Job application not found: ${applicationId}`);
    }
    return application;
  }

  /**
   * Patch-updates an application record (tenant-scoped, audit-logged).
   * Only the provided fields are changed; omitted fields are preserved.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @param {object} patch Partial application payload { notes?, metadata?, status?, jobUrl?, compensation?, appliedAt? }
   * @returns {Promise<object>} Updated application row
   */
  async updateApplication(context, applicationId, patch = {}) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!existing) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      const updates = {};
      if (patch.notes !== undefined) updates.notes = patch.notes;
      if (patch.metadata !== undefined) updates.metadata = patch.metadata;
      if (patch.jobUrl !== undefined) updates.jobUrl = patch.jobUrl;
      if (patch.compensation !== undefined) updates.compensation = patch.compensation;
      if (patch.appliedAt !== undefined) updates.appliedAt = patch.appliedAt;
      if (patch.status !== undefined) {
        assertValidStatusTransition(existing.status, patch.status);
        updates.status = patch.status;
        updates.closedAt = isTerminalStatus(patch.status) ? new Date() : null;
      }
      updates.updatedAt = new Date();

      const [updated] = await tx
        .update(jobApplications)
        .set(updates)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .returning();

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.updated',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: {
          updatedFields: Object.keys(updates).filter((f) => f !== 'updatedAt'),
          packageHash: updated.metadata?.currentPackageHash || null,
        },
      });

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // 8. Delete Application
  // ---------------------------------------------------------------------------

  /**
   * Deletes a job application and cascades child records with audit logging.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object>} Deletion confirmation
   */
  /**
   * Deletes a tracked job application (delegates to safeDeleteApplication).
   *
   * @param {object} context Authenticated context { tenantId, userId, role, candidateId }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object>} Deletion confirmation
   */
  async deleteApplication(context, applicationId) {
    return this.safeDeleteApplication(context, applicationId);
  }

  /**
   * Safely deletes an application, verifying it has no submission history,
   * performing multi-tenant and candidate authorization, cascading child entities,
   * reference-counting physical encrypted artifacts, and writing an audit event.
   *
   * @param {object} context Authenticated context { tenantId, userId, role, candidateId }
   * @param {string} applicationId Application UUID
   * @returns {Promise<object>} Deletion result
   */
  async safeDeleteApplication(context, applicationId) {
    this._validateContext(context, true);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }

    const tenantId = context.tenantId;

    const result = await this.db.transaction(async (tx) => {
      // 1. Verify existence and load application for audit
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // 2. Strict Candidate Authorization
      if (context.candidateId && application.candidateId !== context.candidateId) {
        throw new AuthorizationError(
          `Candidate not authorized to delete application: ${applicationId}`
        );
      }

      // 3. SAFE DELETE INVARIANT: Block deletion if application was submitted
      if (
        application.status === 'APPLIED' ||
        application.appliedAt ||
        application.metadata?.externalSubmissionState === 'SUBMITTED'
      ) {
        throw new ConflictError(
          `Cannot delete application: application ${applicationId} has submission history or status ${application.status}. Submitted applications cannot be deleted.`,
          'APPLICATION_DELETE_NOT_PERMITTED'
        );
      }

      // 4. Load child entities to count and reference-count artifacts
      const appPackages = await tx
        .select()
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId)
          )
        );

      const appDocs = await tx
        .select()
        .from(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.applicationId, applicationId),
            eq(tailoredDocuments.tenantId, tenantId)
          )
        );

      const [stageCountRes] = await tx
        .select({ total: count() })
        .from(applicationStages)
        .where(eq(applicationStages.applicationId, applicationId));

      // 5. Gather candidate storage keys for this application
      const candidateStorageKeys = new Set();
      for (const doc of appDocs) {
        if (doc.metadata?.artifact?.storageKey)
          candidateStorageKeys.add(doc.metadata.artifact.storageKey);
        if (doc.metadata?.storageKey) candidateStorageKeys.add(doc.metadata.storageKey);
      }
      for (const pkg of appPackages) {
        if (pkg.answers?.resumeStorageKey) candidateStorageKeys.add(pkg.answers.resumeStorageKey);
        if (pkg.answers?.coverLetterStorageKey)
          candidateStorageKeys.add(pkg.answers.coverLetterStorageKey);
      }
      const hkResumeKey =
        application.metadata?.handoffKit?.resume?.storageKey ||
        application.metadata?.handoffKit?.tailoredResume?.artifact?.storageKey;
      const hkCoverKey =
        application.metadata?.handoffKit?.coverLetter?.storageKey ||
        application.metadata?.handoffKit?.tailoredCoverLetter?.artifact?.storageKey;
      if (hkResumeKey) candidateStorageKeys.add(hkResumeKey);
      if (hkCoverKey) candidateStorageKeys.add(hkCoverKey);

      // 6. Reference-count against all other applications, packages, and documents in tenant
      const allOtherDocs = await tx
        .select({
          metadata: tailoredDocuments.metadata,
        })
        .from(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.tenantId, tenantId),
            ne(tailoredDocuments.applicationId, applicationId)
          )
        );

      const allOtherApps = await tx
        .select({
          id: jobApplications.id,
          metadata: jobApplications.metadata,
        })
        .from(jobApplications)
        .where(and(eq(jobApplications.tenantId, tenantId), ne(jobApplications.id, applicationId)));

      const allOtherPackages = await tx
        .select({
          answers: applicationPackages.answers,
        })
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.tenantId, tenantId),
            ne(applicationPackages.applicationId, applicationId)
          )
        );

      const otherUsedKeys = new Set();
      for (const d of allOtherDocs) {
        if (d.metadata?.artifact?.storageKey) otherUsedKeys.add(d.metadata.artifact.storageKey);
        if (d.metadata?.storageKey) otherUsedKeys.add(d.metadata.storageKey);
      }
      for (const oa of allOtherApps) {
        const rKey =
          oa.metadata?.handoffKit?.resume?.storageKey ||
          oa.metadata?.handoffKit?.tailoredResume?.artifact?.storageKey;
        const cKey =
          oa.metadata?.handoffKit?.coverLetter?.storageKey ||
          oa.metadata?.handoffKit?.tailoredCoverLetter?.artifact?.storageKey;
        if (rKey) otherUsedKeys.add(rKey);
        if (cKey) otherUsedKeys.add(cKey);
      }
      for (const p of allOtherPackages) {
        if (p.answers?.resumeStorageKey) otherUsedKeys.add(p.answers.resumeStorageKey);
        if (p.answers?.coverLetterStorageKey) otherUsedKeys.add(p.answers.coverLetterStorageKey);
      }

      const safeStorageKeysToDelete = [];
      for (const sk of candidateStorageKeys) {
        if (!otherUsedKeys.has(sk)) {
          safeStorageKeysToDelete.push(sk);
        }
      }

      // 7. Cascade delete child rows
      await tx
        .delete(applicationPackages)
        .where(
          and(
            eq(applicationPackages.applicationId, applicationId),
            eq(applicationPackages.tenantId, tenantId)
          )
        );

      await tx
        .delete(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.applicationId, applicationId),
            eq(tailoredDocuments.tenantId, tenantId)
          )
        );

      await tx
        .delete(applicationStages)
        .where(
          and(
            eq(applicationStages.applicationId, applicationId),
            eq(applicationStages.tenantId, tenantId)
          )
        );

      // 8. Delete the job_applications row
      await tx
        .delete(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

      // 9. Emit Audit Log Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.deleted',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: {
          applicationId,
          candidateId: application.candidateId,
          jobId:
            application.metadata?.jobId || application.metadata?.handoffKit?.targetJob?.id || null,
          companyName: application.companyName,
          jobTitle: application.jobTitle,
          deletedPackagesCount: appPackages.length,
          deletedSnapshotsCount: appDocs.length,
          deletedStagesCount: Number(stageCountRes?.total ?? 0),
          deletedArtifactsCount: safeStorageKeysToDelete.length,
        },
      });

      return {
        deleted: true,
        applicationId,
        storageKeys: safeStorageKeysToDelete,
      };
    });

    // 10. Physical storage deletion for unreferenced encrypted files
    for (const storageKey of result.storageKeys) {
      try {
        await this._getDocumentStorage().deleteEncryptedDocument({
          tenantId,
          storageKey,
        });
      } catch (storageErr) {
        this.logger?.warn?.(
          { err: storageErr.message, storageKey },
          'Physical encrypted artifact deletion failed non-fatally'
        );
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // 9. Handoff Kit Lifecycle (P14-006)
  // ---------------------------------------------------------------------------

  /**
   * Lists all generated Handoff Kits for a candidate with lifecycle metadata.
   *
   * A kit lives on a tracked application's `metadata.handoffKit`. Multiple kits
   * may exist for the same target (company + title); the most recent non-archived
   * kit per target is flagged `isLatestForTarget`. Archiving and deletion never
   * touch shared candidate profile data.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} candidateId Candidate UUID
   * @param {object} [options={}]
   * @param {boolean} [options.includeArchived=true] Include ARCHIVED kits
   * @returns {Promise<{ items: Array<object>, total: number }>}
   */
  async listHandoffKits(context, candidateId, options = {}) {
    this._validateContext(context, false);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }
    const tenantId = context.tenantId;

    const [candidate] = await this.db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));
    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    const rows = await this.db
      .select()
      .from(jobApplications)
      .where(
        and(eq(jobApplications.tenantId, tenantId), eq(jobApplications.candidateId, candidateId))
      );

    const includeArchived = options.includeArchived !== false;
    const kits = [];
    for (const row of rows) {
      const kit = row.metadata?.handoffKit;
      if (!kit || !kit.packageHash) continue;
      const lifecycleState = kit.lifecycleState === 'ARCHIVED' ? 'ARCHIVED' : 'CURRENT';
      if (lifecycleState === 'ARCHIVED' && !includeArchived) continue;
      kits.push({
        applicationId: row.id,
        candidateId: row.candidateId,
        companyName: row.companyName,
        jobTitle: row.jobTitle,
        applicationStatus: row.status,
        packageHash: kit.packageHash,
        generatedAt:
          kit.generatedAt || (row.updatedAt ? new Date(row.updatedAt).toISOString() : null),
        archivedAt: kit.archivedAt || null,
        lifecycleState,
        destinationUrl: kit.directPortalUrl || row.jobUrl || null,
        artifacts: {
          resume: kit.resume
            ? {
                filename: kit.resume.filename,
                mimeType: kit.resume.mimeType,
                fileSizeBytes: kit.resume.fileSizeBytes,
                availabilityStatus: kit.resume.qaAudit?.passed ? 'READY' : 'BLOCKED',
              }
            : null,
          coverLetter: kit.coverLetter
            ? {
                filename: kit.coverLetter.filename,
                mimeType: kit.coverLetter.mimeType,
                fileSizeBytes: kit.coverLetter.fileSizeBytes,
                availabilityStatus: kit.coverLetter.qaAudit?.passed ? 'READY' : 'BLOCKED',
              }
            : null,
        },
      });
    }

    // Flag the latest CURRENT kit per target (company + title); if every kit for
    // a target is archived, the newest archived kit is flagged instead.
    const groups = new Map();
    for (const kit of kits) {
      const key = `${kit.companyName}::${kit.jobTitle}`.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(kit);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
      const latest = group.find((k) => k.lifecycleState === 'CURRENT') || group[0];
      if (latest) latest.isLatestForTarget = true;
    }

    kits.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));
    return { items: kits, total: kits.length };
  }

  /**
   * Archives an obsolete Handoff Kit without touching the application history.
   * The application record, its stages, document snapshots, and encrypted
   * artifacts are all preserved; only the kit lifecycle state changes.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID owning the kit
   * @returns {Promise<object>} Archive confirmation
   */
  async archiveHandoffKit(context, applicationId) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }
      const kit = application.metadata?.handoffKit;
      if (!kit || !kit.packageHash) {
        throw new NotFoundError(`No handoff kit found on application: ${applicationId}`);
      }
      if (kit.lifecycleState === 'ARCHIVED') {
        throw new ConflictError(`Handoff kit on application ${applicationId} is already archived`);
      }

      const archivedAt = new Date().toISOString();
      await tx
        .update(jobApplications)
        .set({
          metadata: {
            ...(application.metadata || {}),
            handoffKit: { ...kit, lifecycleState: 'ARCHIVED', archivedAt },
          },
          updatedAt: new Date(),
        })
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.handoff_kit_archived',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: { packageHash: kit.packageHash, archivedAt },
      });

      return {
        archived: true,
        applicationId,
        lifecycleState: 'ARCHIVED',
        archivedAt,
        packageHash: kit.packageHash,
      };
    });
  }

  /**
   * Safely deletes a Handoff Kit: removes kit metadata, generated document
   * snapshots, and tenant-scoped encrypted artifacts. The application record
   * and all application history are preserved.
   *
   * Safety rules:
   * - Deletion is only permitted while the application status is SAVED (never
   *   submitted). Anything further along the funnel must be archived instead.
   * - Candidate profile data is never touched (candidate rows, skills,
   *   projects, evidence are unrelated to kit artifacts).
   * - Encrypted artifact cleanup is tenant-scoped via DocumentStorageService.
   * - The whole operation is audit-logged transactionally.
   *
   * @param {object} context Authenticated context { tenantId, userId, role }
   * @param {string} applicationId Application UUID owning the kit
   * @returns {Promise<object>} Deletion confirmation
   */
  async deleteHandoffKit(context, applicationId) {
    this._validateContext(context, true);
    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }
    const tenantId = context.tenantId;

    const result = await this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }
      const kit = application.metadata?.handoffKit;
      if (!kit || !kit.packageHash) {
        throw new NotFoundError(`No handoff kit found on application: ${applicationId}`);
      }

      // SAFE DELETE RULE: never delete kit artifacts for applications that have
      // been submitted or progressed. Archive is the only lifecycle option there.
      if (application.status !== 'SAVED') {
        throw new ConflictError(
          `Handoff kit on application ${applicationId} cannot be deleted because its status is ${application.status} (submission history exists). Archive the kit instead.`,
          'HANDOFF_KIT_DELETE_NOT_PERMITTED'
        );
      }

      // Collect tenant-scoped encrypted artifact references before stripping metadata
      const storageKeys = [
        kit.resume?.storageKey,
        kit.resume?.texStorageKey,
        kit.coverLetter?.storageKey,
      ].filter(Boolean);

      // Delete generated document snapshots (FK would otherwise be orphaned)
      const deletedDocs = await tx
        .delete(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.applicationId, applicationId),
            inArray(tailoredDocuments.documentType, ['TAILORED_RESUME', 'TAILORED_COVER_LETTER'])
          )
        )
        .returning({ id: tailoredDocuments.id });

      // Strip kit metadata; preserve all other application metadata & history
      const { handoffKit: _removedKit, ...remainingMetadata } = application.metadata || {};
      await tx
        .update(jobApplications)
        .set({ metadata: remainingMetadata, updatedAt: new Date() })
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'application.handoff_kit_deleted',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: {
          packageHash: kit.packageHash,
          deletedDocumentSnapshots: deletedDocs.length,
          deletedArtifacts: storageKeys.length,
          applicationRecordPreserved: true,
        },
      });

      return {
        deleted: true,
        applicationId,
        packageHash: kit.packageHash,
        deletedDocumentSnapshots: deletedDocs.length,
        storageKeys,
        applicationRecordPreserved: true,
      };
    });

    // Post-commit tenant-scoped encrypted artifact cleanup (best-effort, audited)
    let deletedArtifacts = 0;
    for (const storageKey of result.storageKeys) {
      try {
        const removed = await this._getDocumentStorage().deleteEncryptedDocument({
          tenantId,
          storageKey,
        });
        if (removed) deletedArtifacts += 1;
      } catch (err) {
        logger.warn(
          { err: err.message, applicationId, storageKeyPrefix: String(storageKey).slice(0, 8) },
          'Failed to delete encrypted handoff artifact; application metadata already scrubbed'
        );
      }
    }

    return {
      deleted: true,
      applicationId: result.applicationId,
      packageHash: result.packageHash,
      deletedDocumentSnapshots: result.deletedDocumentSnapshots,
      deletedArtifacts,
      applicationRecordPreserved: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Helper Methods
  // ---------------------------------------------------------------------------

  /**
   * Validates context presence, tenant isolation, and RBAC write permissions.
   *
   * @private
   * @param {object} context
   * @param {boolean} [requireWrite=false]
   */
  _validateContext(context, requireWrite = false) {
    if (!context || typeof context !== 'object') {
      throw new ValidationError('Authentication context is required');
    }
    if (!context.tenantId) {
      throw new ValidationError('tenantId is required in context');
    }
    if (requireWrite && context.role === 'READONLY') {
      throw new AuthorizationError('READONLY role is not authorized to perform write operations');
    }
  }
}
