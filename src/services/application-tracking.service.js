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

import { eq, and, desc, asc, count, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  candidates,
  jobApplications,
  applicationStages,
  tailoredDocuments,
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
import { NotFoundError, ValidationError, AuthorizationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

export class ApplicationTrackingService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=db]
   */
  constructor(options = {}) {
    this.db = options.database || db;
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

      // 2. Active Application Duplicate Check
      const existingActive = await tx
        .select({ id: jobApplications.id, status: jobApplications.status })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, tenantId),
            eq(jobApplications.candidateId, candidateId),
            eq(jobApplications.companyName, validatedInput.companyName),
            eq(jobApplications.jobTitle, validatedInput.jobTitle),
            sql`${jobApplications.status} NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED')`
          )
        );

      if (existingActive.length > 0) {
        logger.info(
          {
            tenantId,
            candidateId,
            companyName: validatedInput.companyName,
            jobTitle: validatedInput.jobTitle,
          },
          'Duplicate active job application detected for candidate'
        );
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
          tenantId,
          candidateId,
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
          metadata: validatedInput.metadata || {},
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

    return {
      application,
      stages,
      tailoredDocuments: documents,
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
  async deleteApplication(context, applicationId) {
    this._validateContext(context, true);

    if (!applicationId) {
      throw new ValidationError('applicationId is required');
    }

    const tenantId = context.tenantId;

    return await this.db.transaction(async (tx) => {
      // 1. Verify existence and load metadata for audit
      const [application] = await tx
        .select()
        .from(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)))
        .for('update');

      if (!application) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      // 2. Count child stages and documents for audit record
      const [stageCountRes] = await tx
        .select({ total: count() })
        .from(applicationStages)
        .where(eq(applicationStages.applicationId, applicationId));

      const [docCountRes] = await tx
        .select({ total: count() })
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.applicationId, applicationId));

      // 3. Delete Application (Foreign key CASCADE removes stages and documents)
      await tx
        .delete(jobApplications)
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, tenantId)));

      // 4. Emit Audit Event
      await tx.insert(auditLogs).values({
        tenantId,
        userId: context.userId || null,
        eventType: 'job_application.deleted',
        resourceType: 'job_application',
        resourceId: applicationId,
        details: {
          companyName: application.companyName,
          jobTitle: application.jobTitle,
          deletedStagesCount: Number(stageCountRes?.total ?? 0),
          deletedDocsCount: Number(docCountRes?.total ?? 0),
        },
      });

      return {
        deleted: true,
        applicationId,
      };
    });
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
