/**
 * @file Evidence Linking & Provenance Integrity Service (P4-004)
 *
 * Provider-neutral domain service for linking immutable evidence nodes to
 * candidate skill assertions and project initiatives.
 *
 * Core Guarantees:
 * - Canonical EvidenceId: Uses existing evidence_items.id (UUIDv4)
 * - Strict Multi-Tenant Default-Deny: 404 on any cross-tenant or mismatched entity
 * - Immutable Provenance: Prohibits mutating sourceLocation, excerpts, providers, or fingerprints
 * - Monotonic Confidence: Weaker evidence never downgrades stronger assertions
 * - Deterministic Primary Evidence Selection: Highest confidence, quality tier, and recency
 * - Atomic Transactions: Zero partial linkage or inconsistent rollup states
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  candidates,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
} from '../db/schema.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { PrimaryEvidenceSelector } from './evidence/primary-evidence-selector.js';
import { EvidenceRefMapper } from './evidence/evidence-ref-mapper.js';
import { SkillRollupCalculator } from '../extractors/github/skill-rollup.js';

export class EvidenceLinkingService {
  /**
   * Retrieves a single evidence node by ID within the trusted tenant and candidate scope.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted request context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {string} params.evidenceId - Evidence UUID.
   * @returns {Promise<object>} Detailed EvidenceNode representation.
   */
  async getEvidenceById({ context, candidateId, evidenceId }) {
    this._validateContext(context);
    if (!candidateId || !evidenceId) {
      throw new ValidationError('candidateId and evidenceId are required');
    }

    const tenantId = context.tenantId;

    const [item] = await db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.id, evidenceId),
          eq(evidenceItems.tenantId, tenantId),
          eq(evidenceItems.candidateId, candidateId)
        )
      );

    if (!item) {
      throw new NotFoundError(`Evidence node not found: ${evidenceId}`);
    }

    return EvidenceRefMapper.toEvidenceNode(item);
  }

  /**
   * Links an evidence node to a candidate skill claim and recalculates skill rollup.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {string} params.evidenceId - Evidence UUID.
   * @param {string} [params.skillId] - Canonical skill UUID.
   * @param {string} [params.skillSlug] - Canonical skill slug.
   * @param {number} [params.requestedConfidence] - Optional requested confidence update.
   * @returns {Promise<{ candidateSkill: object, linkedEvidence: object }>}
   */
  async linkEvidenceToSkill({
    context,
    candidateId,
    evidenceId,
    skillId,
    skillSlug,
    requestedConfidence,
    tx: externalTx,
  }) {
    this._validateContext(context);
    if (!candidateId || !evidenceId) {
      throw new ValidationError('candidateId and evidenceId are required for skill linking');
    }
    if (!skillId && !skillSlug) {
      throw new ValidationError('Either skillId or skillSlug must be provided for skill linking');
    }

    const tenantId = context.tenantId;

    const execute = async (tx) => {
      // 1. Verify Candidate belongs to Tenant
      const [candidate] = await tx
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

      if (!candidate) {
        throw new NotFoundError(`Candidate not found: ${candidateId}`);
      }

      // 2. Verify Evidence belongs to Tenant and Candidate
      const [evidence] = await tx
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.id, evidenceId),
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId)
          )
        );

      if (!evidence) {
        throw new NotFoundError(`Evidence node not found: ${evidenceId}`);
      }

      // 3. Verify Resource belongs to Tenant
      const [resource] = await tx
        .select()
        .from(resources)
        .where(and(eq(resources.id, evidence.resourceId), eq(resources.tenantId, tenantId)));

      if (!resource) {
        throw new NotFoundError(`Resource not found: ${evidence.resourceId}`);
      }

      // 4. Resolve Canonical Skill
      let targetSkill;
      if (skillId) {
        [targetSkill] = await tx.select().from(skills).where(eq(skills.id, skillId));
      } else {
        [targetSkill] = await tx
          .select()
          .from(skills)
          .where(eq(skills.slug, skillSlug.toLowerCase().trim()));
      }

      if (!targetSkill) {
        throw new NotFoundError(`Skill not found: ${skillId || skillSlug}`);
      }

      // 5. Monotonic Confidence Update on Evidence Item
      const currentConfidence =
        typeof evidence.confidenceScore === 'number' ? evidence.confidenceScore : 1.0;
      const newConfidence =
        typeof requestedConfidence === 'number'
          ? Math.max(currentConfidence, Math.min(1.0, Math.max(0.0, requestedConfidence)))
          : currentConfidence;

      // Update Evidence Item with linked skillId
      const [updatedEvidence] = await tx
        .update(evidenceItems)
        .set({
          skillId: targetSkill.id,
          confidenceScore: newConfidence,
          detectedAt: new Date(),
        })
        .where(eq(evidenceItems.id, evidence.id))
        .returning();

      // 6. Recalculate CandidateSkill Rollup
      const allSkillEvidence = await tx
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId),
            eq(evidenceItems.skillId, targetSkill.id)
          )
        );

      const rollup = SkillRollupCalculator.calculateRollup(allSkillEvidence);
      const bestPrimary = PrimaryEvidenceSelector.selectBestPrimary(allSkillEvidence);

      const [existingCandidateSkill] = await tx
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantId),
            eq(candidateSkills.candidateId, candidateId),
            eq(candidateSkills.skillId, targetSkill.id)
          )
        );

      let savedCandidateSkill;
      if (existingCandidateSkill) {
        [savedCandidateSkill] = await tx
          .update(candidateSkills)
          .set({
            category: targetSkill.category,
            provenanceStatus: rollup.provenanceStatus,
            confidenceScore: Math.max(
              existingCandidateSkill.confidenceScore,
              rollup.confidenceScore
            ),
            evidenceCount: rollup.evidenceCount,
            primaryEvidenceId: bestPrimary
              ? bestPrimary.id
              : existingCandidateSkill.primaryEvidenceId,
            firstObservedAt: rollup.firstObservedAt || existingCandidateSkill.firstObservedAt,
            lastObservedAt: rollup.lastObservedAt || new Date(),
            updatedAt: new Date(),
          })
          .where(eq(candidateSkills.id, existingCandidateSkill.id))
          .returning();
      } else {
        [savedCandidateSkill] = await tx
          .insert(candidateSkills)
          .values({
            tenantId,
            candidateId,
            skillId: targetSkill.id,
            category: targetSkill.category,
            provenanceStatus: rollup.provenanceStatus,
            confidenceScore: rollup.confidenceScore,
            evidenceCount: rollup.evidenceCount,
            primaryEvidenceId: bestPrimary ? bestPrimary.id : null,
            firstObservedAt: rollup.firstObservedAt || new Date(),
            lastObservedAt: rollup.lastObservedAt || new Date(),
          })
          .returning();
      }

      logger.info(
        {
          tenantId,
          candidateId,
          evidenceId,
          skillId: targetSkill.id,
          provenanceStatus: savedCandidateSkill.provenanceStatus,
          confidenceScore: savedCandidateSkill.confidenceScore,
        },
        'Linked evidence to candidate skill claim successfully'
      );

      return {
        candidateSkill: savedCandidateSkill,
        linkedEvidence: EvidenceRefMapper.toEvidenceRef(
          updatedEvidence,
          savedCandidateSkill.provenanceStatus
        ),
      };
    };

    if (externalTx) {
      return await execute(externalTx);
    }
    return await db.transaction(execute);
  }

  /**
   * Links an evidence node to a domain project initiative.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {string} params.evidenceId - Evidence UUID.
   * @param {string} params.projectId - Project UUID.
   * @param {object} [params.tx] - Optional outer transaction.
   * @returns {Promise<{ projectId: string, evidenceId: string, linkedEvidence: object }>}
   */
  async linkEvidenceToProject({ context, candidateId, evidenceId, projectId, tx: externalTx }) {
    this._validateContext(context);
    if (!candidateId || !evidenceId || !projectId) {
      throw new ValidationError(
        'candidateId, evidenceId, and projectId are required for project linking'
      );
    }

    const tenantId = context.tenantId;

    const execute = async (tx) => {
      // 1. Verify Candidate belongs to Tenant
      const [candidate] = await tx
        .select()
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

      if (!candidate) {
        throw new NotFoundError(`Candidate not found: ${candidateId}`);
      }

      // 2. Verify Project belongs to Tenant and Candidate
      const [project] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenantId, tenantId),
            eq(projects.candidateId, candidateId)
          )
        );

      if (!project) {
        throw new NotFoundError(`Project not found: ${projectId}`);
      }

      // 3. Verify Evidence belongs to Tenant and Candidate
      const [evidence] = await tx
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.id, evidenceId),
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId)
          )
        );

      if (!evidence) {
        throw new NotFoundError(`Evidence node not found: ${evidenceId}`);
      }

      // 4. Verify Resource belongs to Tenant
      const [resource] = await tx
        .select()
        .from(resources)
        .where(and(eq(resources.id, evidence.resourceId), eq(resources.tenantId, tenantId)));

      if (!resource) {
        throw new NotFoundError(`Resource not found: ${evidence.resourceId}`);
      }

      // 5. Update Evidence Item projectId
      const [updatedEvidence] = await tx
        .update(evidenceItems)
        .set({
          projectId: project.id,
          detectedAt: new Date(),
        })
        .where(eq(evidenceItems.id, evidence.id))
        .returning();

      // 6. Ensure project_resources relationship exists
      const [existingProjectResource] = await tx
        .select()
        .from(projectResources)
        .where(
          and(
            eq(projectResources.tenantId, tenantId),
            eq(projectResources.projectId, project.id),
            eq(projectResources.resourceId, resource.id)
          )
        );

      if (!existingProjectResource) {
        await tx.insert(projectResources).values({
          tenantId,
          projectId: project.id,
          resourceId: resource.id,
          roleInProject: 'Primary Repository',
        });
      }

      logger.info(
        {
          tenantId,
          candidateId,
          evidenceId,
          projectId,
          resourceId: resource.id,
        },
        'Linked evidence to project initiative successfully'
      );

      return {
        projectId: project.id,
        evidenceId: evidence.id,
        linkedEvidence: EvidenceRefMapper.toEvidenceRef(updatedEvidence),
      };
    };

    if (externalTx) {
      return await execute(externalTx);
    }
    return await db.transaction(execute);
  }

  /**
   * Batch links multiple evidence items to skills and/or projects in a single atomic transaction.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {Array<{ evidenceId: string, skillId?: string, skillSlug?: string, projectId?: string, requestedConfidence?: number }>} params.links
   * @returns {Promise<{ linkedCount: number, results: Array<object> }>}
   */
  async batchLinkEvidence({ context, candidateId, links }) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required for batch linking');
    }
    if (!Array.isArray(links) || links.length === 0) {
      throw new ValidationError('links array must contain at least 1 link item');
    }

    return await db.transaction(async (tx) => {
      const results = [];
      for (const link of links) {
        if (link.skillId || link.skillSlug) {
          const skillRes = await this.linkEvidenceToSkill({
            context,
            candidateId,
            evidenceId: link.evidenceId,
            skillId: link.skillId,
            skillSlug: link.skillSlug,
            requestedConfidence: link.requestedConfidence,
            tx,
          });
          results.push({ type: 'SKILL_LINK', ...skillRes });
        }
        if (link.projectId) {
          const projRes = await this.linkEvidenceToProject({
            context,
            candidateId,
            evidenceId: link.evidenceId,
            projectId: link.projectId,
            tx,
          });
          results.push({ type: 'PROJECT_LINK', ...projRes });
        }
      }

      return {
        linkedCount: results.length,
        results,
      };
    });
  }

  /**
   * Lists all evidence items supporting a candidate skill claim.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {string} params.skillId - Skill UUID.
   * @returns {Promise<Array<object>>} List of lightweight EvidenceRef representations.
   */
  async listEvidenceForCandidateSkill({ context, candidateId, skillId }) {
    this._validateContext(context);
    if (!candidateId || !skillId) {
      throw new ValidationError('candidateId and skillId are required');
    }

    const tenantId = context.tenantId;

    const items = await db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.tenantId, tenantId),
          eq(evidenceItems.candidateId, candidateId),
          eq(evidenceItems.skillId, skillId)
        )
      )
      .orderBy(desc(evidenceItems.confidenceScore), desc(evidenceItems.detectedAt));

    return items.map((item) => EvidenceRefMapper.toEvidenceRef(item, 'VERIFIED'));
  }

  /**
   * Lists all evidence items linked to a domain project initiative.
   *
   * @param {object} params
   * @param {import('../connectors/base/context.js').ConnectorContext|object} params.context - Trusted context.
   * @param {string} params.candidateId - Candidate UUID.
   * @param {string} params.projectId - Project UUID.
   * @returns {Promise<Array<object>>} List of lightweight EvidenceRef representations.
   */
  async listEvidenceForProject({ context, candidateId, projectId }) {
    this._validateContext(context);
    if (!candidateId || !projectId) {
      throw new ValidationError('candidateId and projectId are required');
    }

    const tenantId = context.tenantId;

    const items = await db
      .select()
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.tenantId, tenantId),
          eq(evidenceItems.candidateId, candidateId),
          eq(evidenceItems.projectId, projectId)
        )
      )
      .orderBy(desc(evidenceItems.confidenceScore), desc(evidenceItems.detectedAt));

    return items.map((item) => EvidenceRefMapper.toEvidenceRef(item));
  }

  /**
   * Validates that caller is not attempting to mutate immutable provenance fields.
   *
   * @param {object} mutations
   * @throws {ValidationError} If any immutable provenance field is present.
   */
  static validateImmutability(mutations) {
    if (!mutations || typeof mutations !== 'object') return;

    const IMMUTABLE_FIELDS = [
      'id',
      'tenantId',
      'tenant_id',
      'candidateId',
      'candidate_id',
      'resourceId',
      'resource_id',
      'sourceProvider',
      'source_provider',
      'evidenceType',
      'evidence_type',
      'sourceLocation',
      'source_location',
      'excerpt',
      'fingerprint',
    ];

    for (const field of IMMUTABLE_FIELDS) {
      if (field in mutations) {
        throw new ValidationError(`Immutable provenance field cannot be mutated: ${field}`);
      }
    }
  }

  /**
   * Helper to ensure trusted context carries a valid tenantId.
   *
   * @param {object} context
   * @private
   */
  _validateContext(context) {
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted connector context with tenantId is required');
    }
  }
}
