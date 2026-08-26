/**
 * @file User Data Sovereignty & GDPR Lifecycle Service (Phase 13 / P13-002)
 *
 * Implements authoritative data sovereignty, evidence inspection, resource disconnection,
 * indexed resource deletion with skill rollup recalculation, and hard account erasure (GDPR).
 *
 * Invariants:
 * - Multi-Tenant Sovereign Isolation: Strict 404 default-deny on cross-tenant operations.
 * - Context Authority: Trusted tenantId, userId, candidateId derived from session.
 * - Cascade Safety: Hard delete purges the tenant ecosystem atomically in one transaction.
 * - Historical Application Preservation: Disconnecting or unindexing resources never deletes
 *   historical job applications or tailored documents.
 * - Zero Credential Leakage: Redacts secrets, tokens, and private keys from all outputs.
 */

import { eq, and, desc, count } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import {
  tenants,
  candidates,
  resources,
  evidenceItems,
  skills,
  projects,
  projectResources,
  candidateSkills,
  resourceConnections,
  auditLogs,
} from '../db/schema.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { SkillRollupCalculator } from '../extractors/github/skill-rollup.js';
import { connectionService as defaultConnectionService } from './connection.service.js';
import { sanitizeAuditDetails } from '../utils/audit-sanitizer.js';

export class DataSovereigntyService {
  /**
   * @param {object} [opts={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [opts.db]
   * @param {import('./connection.service.js').ConnectionService} [opts.connectionService]
   */
  constructor(opts = {}) {
    this.db = opts.db || defaultDb;
    this.connectionService = opts.connectionService || defaultConnectionService;
  }

  /**
   * Resolves the canonical candidate profile for the request context.
   *
   * @private
   * @param {object} context
   * @returns {Promise<object>} Candidate record
   */
  async _resolveCandidate(context) {
    if (context.candidateId) {
      const [candidate] = await this.db
        .select()
        .from(candidates)
        .where(
          and(eq(candidates.id, context.candidateId), eq(candidates.tenantId, context.tenantId))
        );
      if (candidate) return candidate;
    }

    if (context.userId) {
      const [candidate] = await this.db
        .select()
        .from(candidates)
        .where(
          and(eq(candidates.tenantId, context.tenantId), eq(candidates.userId, context.userId))
        );
      if (candidate) return candidate;
    }

    throw new NotFoundError(
      'Candidate profile not found for authenticated context',
      'CANDIDATE_NOT_FOUND'
    );
  }

  /**
   * Retrieves paginated indexed evidence items with full provenance citations.
   *
   * @param {object} context - Trusted context ({ tenantId, userId, candidateId? })
   * @param {object} [filters={}] - Optional filters ({ skillId, projectId, resourceId, evidenceType })
   * @param {object} [pagination={}] - Pagination parameters ({ limit, cursor, offset })
   * @returns {Promise<{ items: Array<object>, pagination: object }>}
   */
  async getIndexedEvidence(context, filters = {}, pagination = {}) {
    if (!context?.tenantId) {
      throw new ValidationError('tenantId is required in context');
    }

    const candidate = await this._resolveCandidate(context);
    const limit = Math.min(Math.max(1, parseInt(pagination.limit, 10) || 20), 50);
    const offset = Math.max(0, parseInt(pagination.offset, 10) || 0);

    const conditions = [
      eq(evidenceItems.tenantId, context.tenantId),
      eq(evidenceItems.candidateId, candidate.id),
    ];

    if (filters.skillId) {
      conditions.push(eq(evidenceItems.skillId, filters.skillId));
    }
    if (filters.projectId) {
      conditions.push(eq(evidenceItems.projectId, filters.projectId));
    }
    if (filters.resourceId) {
      conditions.push(eq(evidenceItems.resourceId, filters.resourceId));
    }
    if (filters.evidenceType) {
      conditions.push(eq(evidenceItems.evidenceType, filters.evidenceType));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await this.db
      .select({ total: count() })
      .from(evidenceItems)
      .where(whereClause);
    const totalCount = Number(countResult?.total || 0);

    // Fetch items with joined metadata
    const rows = await this.db
      .select({
        id: evidenceItems.id,
        tenantId: evidenceItems.tenantId,
        candidateId: evidenceItems.candidateId,
        resourceId: evidenceItems.resourceId,
        projectId: evidenceItems.projectId,
        skillId: evidenceItems.skillId,
        evidenceType: evidenceItems.evidenceType,
        sourceProvider: evidenceItems.sourceProvider,
        sourceLocation: evidenceItems.sourceLocation,
        excerpt: evidenceItems.excerpt,
        confidenceScore: evidenceItems.confidenceScore,
        detectedAt: evidenceItems.detectedAt,
        metadata: evidenceItems.metadata,
        resourceName: resources.name,
        resourceDisplayName: resources.displayName,
        resourceUrl: resources.url,
        projectName: projects.name,
        projectSlug: projects.slug,
        skillSlug: skills.slug,
        skillName: skills.name,
        skillCategory: skills.category,
      })
      .from(evidenceItems)
      .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
      .leftJoin(projects, eq(evidenceItems.projectId, projects.id))
      .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
      .where(whereClause)
      .orderBy(desc(evidenceItems.confidenceScore), desc(evidenceItems.detectedAt))
      .limit(limit)
      .offset(offset);

    const items = rows.map((row) => ({
      id: row.id,
      evidenceType: row.evidenceType,
      sourceProvider: row.sourceProvider,
      resource: row.resourceId
        ? {
            id: row.resourceId,
            name: row.resourceName,
            displayName: row.resourceDisplayName,
            url: row.resourceUrl,
          }
        : null,
      project: row.projectId
        ? {
            id: row.projectId,
            name: row.projectName,
            slug: row.projectSlug,
          }
        : null,
      skill: row.skillId
        ? {
            id: row.skillId,
            slug: row.skillSlug,
            name: row.skillName,
            category: row.skillCategory,
          }
        : null,
      sourceLocation: {
        commitSha: row.sourceLocation?.commitSha || null,
        filePath: row.sourceLocation?.filePath || null,
        startLine: row.sourceLocation?.startLine || row.sourceLocation?.lineStart || null,
        endLine: row.sourceLocation?.endLine || row.sourceLocation?.lineEnd || null,
        ref: row.sourceLocation?.ref || null,
      },
      excerpt: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 1000) : null,
      confidenceScore: row.confidenceScore,
      detectedAt: row.detectedAt ? new Date(row.detectedAt).toISOString() : null,
      metadata: row.metadata || {},
    }));

    return {
      items,
      pagination: {
        totalCount,
        limit,
        offset,
        hasMore: offset + items.length < totalCount,
      },
    };
  }

  /**
   * Retrieves a single evidence provenance item.
   *
   * @param {object} context - Trusted context
   * @param {string} evidenceId - Target evidence UUID
   * @returns {Promise<object>} Provenance item view
   */
  async getEvidenceItem(context, evidenceId) {
    if (!context?.tenantId) {
      throw new ValidationError('tenantId is required in context');
    }
    if (!evidenceId) {
      throw new ValidationError('evidenceId is required');
    }

    const candidate = await this._resolveCandidate(context);

    const [row] = await this.db
      .select({
        id: evidenceItems.id,
        tenantId: evidenceItems.tenantId,
        candidateId: evidenceItems.candidateId,
        resourceId: evidenceItems.resourceId,
        projectId: evidenceItems.projectId,
        skillId: evidenceItems.skillId,
        evidenceType: evidenceItems.evidenceType,
        sourceProvider: evidenceItems.sourceProvider,
        sourceLocation: evidenceItems.sourceLocation,
        excerpt: evidenceItems.excerpt,
        confidenceScore: evidenceItems.confidenceScore,
        detectedAt: evidenceItems.detectedAt,
        metadata: evidenceItems.metadata,
        resourceName: resources.name,
        resourceDisplayName: resources.displayName,
        resourceUrl: resources.url,
        projectName: projects.name,
        projectSlug: projects.slug,
        skillSlug: skills.slug,
        skillName: skills.name,
        skillCategory: skills.category,
      })
      .from(evidenceItems)
      .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
      .leftJoin(projects, eq(evidenceItems.projectId, projects.id))
      .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
      .where(
        and(
          eq(evidenceItems.id, evidenceId),
          eq(evidenceItems.tenantId, context.tenantId),
          eq(evidenceItems.candidateId, candidate.id)
        )
      );

    if (!row) {
      throw new NotFoundError(`Evidence item ${evidenceId} not found`, 'EVIDENCE_NOT_FOUND');
    }

    return {
      id: row.id,
      evidenceType: row.evidenceType,
      sourceProvider: row.sourceProvider,
      resource: row.resourceId
        ? {
            id: row.resourceId,
            name: row.resourceName,
            displayName: row.resourceDisplayName,
            url: row.resourceUrl,
          }
        : null,
      project: row.projectId
        ? {
            id: row.projectId,
            name: row.projectName,
            slug: row.projectSlug,
          }
        : null,
      skill: row.skillId
        ? {
            id: row.skillId,
            slug: row.skillSlug,
            name: row.skillName,
            category: row.skillCategory,
          }
        : null,
      sourceLocation: {
        commitSha: row.sourceLocation?.commitSha || null,
        filePath: row.sourceLocation?.filePath || null,
        startLine: row.sourceLocation?.startLine || row.sourceLocation?.lineStart || null,
        endLine: row.sourceLocation?.endLine || row.sourceLocation?.lineEnd || null,
        ref: row.sourceLocation?.ref || null,
      },
      excerpt: typeof row.excerpt === 'string' ? row.excerpt.slice(0, 1000) : null,
      confidenceScore: row.confidenceScore,
      detectedAt: row.detectedAt ? new Date(row.detectedAt).toISOString() : null,
      metadata: row.metadata || {},
    };
  }

  /**
   * Disconnects a resource connection, scrubbing stored credentials and halting synchronization
   * while preserving historical evidence, candidate skills, and job applications.
   *
   * @param {object} context - Trusted context
   * @param {string} connectionId - Connection UUID
   * @param {object} [requestContext={}]
   * @returns {Promise<object>}
   */
  async disconnectConnection(context, connectionId, requestContext = {}) {
    const user = context.user || { id: context.userId, role: context.role || 'OWNER' };
    return this.connectionService.disconnectConnection(
      user,
      context.tenantId,
      connectionId,
      requestContext
    );
  }

  /**
   * Deletes an indexed resource (repository), cascading to delete its evidence items and
   * recalculating candidate skill rollups while preserving job applications and tailored documents.
   *
   * @param {object} context - Trusted context
   * @param {string} resourceId - Resource UUID
   * @param {object} [requestContext={}]
   * @returns {Promise<{ message: string, resourceId: string }>}
   */
  async deleteIndexedResource(context, resourceId, requestContext = {}) {
    if (!context?.tenantId) {
      throw new ValidationError('tenantId is required in context');
    }
    if (!resourceId) {
      throw new ValidationError('resourceId is required');
    }

    const candidate = await this._resolveCandidate(context);

    // Verify resource exists in tenant and candidate boundary
    const [existingResource] = await this.db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.id, resourceId),
          eq(resources.tenantId, context.tenantId),
          eq(resources.candidateId, candidate.id)
        )
      );

    if (!existingResource) {
      throw new NotFoundError(
        `Resource ${resourceId} not found in candidate workspace`,
        'RESOURCE_NOT_FOUND'
      );
    }

    try {
      // Execute deletion and skill rollup recalculation in a transaction
      await this.db.transaction(async (tx) => {
        // 1. Delete associated project_resources and evidence_items for this resource
        await tx
          .delete(projectResources)
          .where(
            and(
              eq(projectResources.tenantId, context.tenantId),
              eq(projectResources.resourceId, resourceId)
            )
          );

        await tx
          .delete(evidenceItems)
          .where(
            and(
              eq(evidenceItems.tenantId, context.tenantId),
              eq(evidenceItems.resourceId, resourceId)
            )
          );

        // 2. Delete the resource record
        await tx
          .delete(resources)
          .where(and(eq(resources.id, resourceId), eq(resources.tenantId, context.tenantId)));

        // 3. Fetch all candidate skills for this candidate to recalculate rollups
        const cSkills = await tx
          .select()
          .from(candidateSkills)
          .where(
            and(
              eq(candidateSkills.tenantId, context.tenantId),
              eq(candidateSkills.candidateId, candidate.id)
            )
          );

        for (const cs of cSkills) {
          // Query remaining evidence items for this skill
          const remainingEvidence = await tx
            .select({
              confidenceScore: evidenceItems.confidenceScore,
              evidenceType: evidenceItems.evidenceType,
              detectedAt: evidenceItems.detectedAt,
            })
            .from(evidenceItems)
            .where(
              and(
                eq(evidenceItems.tenantId, context.tenantId),
                eq(evidenceItems.candidateId, candidate.id),
                eq(evidenceItems.skillId, cs.skillId)
              )
            );

          if (remainingEvidence.length === 0) {
            // If no evidence remains, update rollup to reflect 0 evidence or remove if purely inferred
            if (cs.provenanceStatus === 'CLAIMED') {
              await tx
                .update(candidateSkills)
                .set({
                  evidenceCount: 0,
                  confidenceScore: 0.0,
                  primaryEvidenceId: null,
                  updatedAt: new Date(),
                })
                .where(eq(candidateSkills.id, cs.id));
            } else {
              await tx.delete(candidateSkills).where(eq(candidateSkills.id, cs.id));
            }
          } else {
            // Recalculate rollup from remaining evidence
            const rollup = SkillRollupCalculator.calculateRollup(remainingEvidence);
            await tx
              .update(candidateSkills)
              .set({
                confidenceScore: rollup.confidenceScore,
                provenanceStatus: rollup.provenanceStatus,
                evidenceCount: rollup.evidenceCount,
                firstObservedAt: rollup.firstObservedAt,
                lastObservedAt: rollup.lastObservedAt,
                updatedAt: new Date(),
              })
              .where(eq(candidateSkills.id, cs.id));
          }
        }

        // 3. Emit sanitized audit log
        try {
          const sanitizedDetails = sanitizeAuditDetails({
            resourceId,
            resourceName: existingResource.name,
            provider: existingResource.provider,
            deletedAt: new Date().toISOString(),
          });
          await tx.insert(auditLogs).values({
            tenantId: context.tenantId,
            userId: context.userId,
            eventType: 'resource.deleted',
            resourceType: 'RESOURCE',
            resourceId: String(resourceId),
            requestId: requestContext.requestId,
            ipAddress: requestContext.ipAddress,
            userAgent: requestContext.userAgent,
            details: sanitizedDetails,
          });
        } catch {
          // Non-blocking audit error
        }
      });
    } catch (err) {
      logger.error(
        { err, resourceId, tenantId: context.tenantId },
        'Error deleting indexed resource'
      );
      throw err;
    }

    logger.info(
      {
        tenantId: context.tenantId,
        candidateId: candidate.id,
        resourceId,
      },
      'Indexed resource deleted and candidate skill rollups recalculated'
    );

    return {
      message: 'Resource and associated evidence deleted successfully',
      resourceId,
    };
  }

  /**
   * Hard-deletes a user workspace, permanently removing all tenant-owned entities
   * across users, candidates, evidence, applications, and sessions (GDPR Article 17).
   *
   * @param {object} context - Trusted context
   * @param {object} confirmation - Confirmation payload ({ confirmPhrase: "DELETE MY ACCOUNT" })
   * @param {object} [requestContext={}]
   * @returns {Promise<{ message: string, tenantId: string }>}
   */
  async hardDeleteAccount(context, confirmation = {}, requestContext = {}) {
    if (!context?.tenantId) {
      throw new ValidationError('tenantId is required in context');
    }

    const role = context.role || context.user?.role;
    if (role !== 'OWNER') {
      throw new AuthorizationError(
        'Only workspace owners can permanently delete the account and workspace',
        'FORBIDDEN'
      );
    }

    if (confirmation.confirmPhrase !== 'DELETE MY ACCOUNT') {
      throw new ValidationError(
        'Invalid confirmation phrase. Confirmation must be exactly "DELETE MY ACCOUNT"',
        'CONFIRMATION_REQUIRED'
      );
    }

    // Verify tenant exists
    const [existingTenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, context.tenantId));

    if (!existingTenant) {
      throw new NotFoundError(`Workspace ${context.tenantId} not found`, 'TENANT_NOT_FOUND');
    }

    // Best-effort upstream disconnect for active connections
    try {
      const activeConnections = await this.db
        .select()
        .from(resourceConnections)
        .where(
          and(
            eq(resourceConnections.tenantId, context.tenantId),
            eq(resourceConnections.status, 'ACTIVE')
          )
        );

      for (const conn of activeConnections) {
        try {
          await this.connectionService.disconnectConnection(
            { id: context.userId, role: 'OWNER' },
            context.tenantId,
            conn.id,
            requestContext
          );
        } catch {
          // Best-effort
        }
      }
    } catch {
      // Best-effort
    }

    // Atomic cascade deletion of tenant root in PostgreSQL
    await this.db.transaction(async (tx) => {
      await tx.delete(tenants).where(eq(tenants.id, context.tenantId));
    });

    logger.info(
      {
        tenantId: context.tenantId,
        userId: context.userId,
      },
      'User account and tenant workspace permanently erased (GDPR Hard Delete)'
    );

    return {
      message: 'Account and all associated workspace data permanently deleted',
      tenantId: context.tenantId,
    };
  }
}

export const dataSovereigntyService = new DataSovereigntyService();
