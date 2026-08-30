/**
 * @file Candidate Profile Service (P4-005)
 *
 * Authoritative lifecycle, aggregation, and claim integrity service for candidate
 * profiles within the Antigravity Career MCP Platform.
 *
 * Core Guarantees:
 * - Clear Separation of Truth: Verified facts vs explicit [Unverified User Claim] labeling
 * - Narrative Sovereignty: Background resource sync NEVER overwrites user-authored narrative
 * - Metadata Partitioning: userCustom vs systemInferred JSONB namespaces
 * - Sovereign Multi-Tenant Isolation: 404 default-deny on cross-tenant requests
 * - RBAC Enforcement: OWNER (full), MEMBER (self-linked only), READONLY (read-only)
 * - Credential Redaction: Strips all tokens, installation IDs, and secrets from profile outputs
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import {
  users,
  candidates,
  candidateIdentities,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
} from '../db/schema.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { EvidenceRefMapper } from './evidence/evidence-ref-mapper.js';
import {
  CareerPreferencesSchema,
  UpdateCareerPreferencesInputSchema,
  CandidateCareerProfileSchema,
} from '../domain/candidate/career-preferences.schemas.js';

export class CandidateProfileService {
  /**
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase|object} [database]
   */
  constructor(database = null) {
    if (database && typeof database === 'object' && !database.select) {
      this.db = database.db || database.database || defaultDb;
    } else {
      this.db = database || defaultDb;
    }
  }

  get _db() {
    return this.db || defaultDb;
  }
  /**
   * Retrieves a full candidate profile view aggregating identities, resources, projects,
   * verified skills, and manual user claims without sensitive credentials.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @returns {Promise<object>} Clean, provider-neutral CandidateProfileView.
   */
  async getProfile(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    // 1. Fetch Candidate Root
    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    // 2. Fetch Candidate Identities (without credentials)
    const rawIdentities = await this._db
      .select()
      .from(candidateIdentities)
      .where(
        and(
          eq(candidateIdentities.tenantId, tenantId),
          eq(candidateIdentities.candidateId, candidateId)
        )
      );

    const identities = rawIdentities.map((idRow) => ({
      id: idRow.id,
      provider: idRow.provider,
      externalAccountId: idRow.externalAccountId,
      externalUsername: idRow.externalUsername,
      externalEmail: idRow.externalEmail,
      profileUrl: idRow.profileUrl,
      avatarUrl: idRow.avatarUrl,
      verified: idRow.verified,
      verifiedAt: idRow.verifiedAt ? new Date(idRow.verifiedAt).toISOString() : null,
      metadata: idRow.metadata || {},
    }));

    // 3. Fetch Connected Resources (scrubbed of encryptedCredentials)
    const rawResources = await this._db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenantId), eq(resources.candidateId, candidateId)));

    const resourceList = rawResources.map((resRow) => ({
      id: resRow.id,
      provider: resRow.provider,
      resourceType: resRow.resourceType,
      externalResourceId: resRow.externalResourceId,
      name: resRow.name,
      displayName: resRow.displayName,
      url: resRow.url,
      isPrivate: resRow.isPrivate,
      status: resRow.status,
      lastSyncedAt: resRow.lastSyncedAt ? new Date(resRow.lastSyncedAt).toISOString() : null,
      metadata: resRow.metadata || {},
    }));

    // 4. Fetch Projects & Linked Evidence
    const rawProjects = await this._db
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.candidateId, candidateId)))
      .orderBy(desc(projects.createdAt));

    const projectList = [];
    for (const proj of rawProjects) {
      // Find linked resources count
      const linkedRes = await this._db
        .select()
        .from(projectResources)
        .where(
          and(eq(projectResources.tenantId, tenantId), eq(projectResources.projectId, proj.id))
        );

      // Find project evidence items
      const projEvidenceRows = await this._db
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
          metadata: evidenceItems.metadata,
          detectedAt: evidenceItems.detectedAt,
          skillSlug: skills.slug,
          skillName: skills.name,
        })
        .from(evidenceItems)
        .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
        .where(
          and(
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId),
            eq(evidenceItems.projectId, proj.id)
          )
        )
        .orderBy(desc(evidenceItems.confidenceScore), desc(evidenceItems.detectedAt));

      projectList.push({
        id: proj.id,
        name: proj.name,
        slug: proj.slug,
        headline: proj.headline,
        summary: proj.summary,
        role: proj.role,
        isHighlighted: proj.isHighlighted,
        startDate: proj.startDate ? String(proj.startDate) : null,
        endDate: proj.endDate ? String(proj.endDate) : null,
        linkedResourceCount: linkedRes.length,
        evidence: projEvidenceRows.map((e) => EvidenceRefMapper.toEvidenceNode(e)),
        metadata: proj.metadata || {},
        createdAt: proj.createdAt ? new Date(proj.createdAt).toISOString() : null,
        updatedAt: proj.updatedAt ? new Date(proj.updatedAt).toISOString() : null,
      });
    }

    // 5. Fetch Skills & Claims
    const rawCandidateSkills = await this._db
      .select({
        cs: candidateSkills,
        skillSlug: skills.slug,
        skillName: skills.name,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(eq(candidateSkills.tenantId, tenantId), eq(candidateSkills.candidateId, candidateId))
      )
      .orderBy(desc(candidateSkills.confidenceScore), desc(candidateSkills.lastObservedAt));

    const skillList = [];
    for (const { cs, skillSlug, skillName } of rawCandidateSkills) {
      let primaryEvidenceRef = null;
      if (cs.primaryEvidenceId) {
        const [primaryRow] = await this._db
          .select()
          .from(evidenceItems)
          .where(
            and(
              eq(evidenceItems.id, cs.primaryEvidenceId),
              eq(evidenceItems.tenantId, tenantId),
              eq(evidenceItems.candidateId, candidateId)
            )
          );
        if (primaryRow) {
          primaryEvidenceRef = EvidenceRefMapper.toEvidenceRef(primaryRow, cs.provenanceStatus);
        }
      }

      const isUserClaim = cs.provenanceStatus === 'CLAIMED' || cs.metadata?.isUserClaim === true;

      skillList.push({
        skillId: cs.skillId,
        slug: skillSlug,
        name: skillName,
        category: cs.category,
        provenanceStatus: cs.provenanceStatus,
        confidenceScore: typeof cs.confidenceScore === 'number' ? cs.confidenceScore : 0.0,
        evidenceCount: cs.evidenceCount,
        primaryEvidence: primaryEvidenceRef,
        isUserClaim,
        claimLabel:
          isUserClaim && cs.provenanceStatus === 'CLAIMED' ? '[Unverified User Claim]' : null,
        firstObservedAt: cs.firstObservedAt ? new Date(cs.firstObservedAt).toISOString() : null,
        lastObservedAt: cs.lastObservedAt ? new Date(cs.lastObservedAt).toISOString() : null,
        metadata: cs.metadata || {},
      });
    }

    return {
      candidate: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        userId: candidate.userId,
        displayName: candidate.displayName,
        headline: candidate.headline,
        summary: candidate.summary,
        canonicalEmail: candidate.canonicalEmail,
        status: candidate.status,
        profileMetadata: candidate.profileMetadata || { userCustom: {}, systemInferred: {} },
        createdAt: candidate.createdAt ? new Date(candidate.createdAt).toISOString() : null,
        updatedAt: candidate.updatedAt ? new Date(candidate.updatedAt).toISOString() : null,
      },
      identities,
      resources: resourceList,
      projects: projectList,
      skills: skillList,
    };
  }

  /**
   * Lists candidate profiles in the authenticated tenant with pagination.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.pageSize=20]
   * @returns {Promise<{ items: Array<object>, pagination: object }>}
   */
  async listCandidates(context, options = {}) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(options.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    const rows = await this._db
      .select()
      .from(candidates)
      .where(eq(candidates.tenantId, tenantId))
      .orderBy(desc(candidates.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [totalRow] = await this._db
      .select({ count: sql`count(*)` })
      .from(candidates)
      .where(eq(candidates.tenantId, tenantId));

    const totalItems = parseInt(totalRow?.count || '0', 10);
    const totalPages = Math.ceil(totalItems / pageSize);

    const items = rows.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      userId: c.userId,
      displayName: c.displayName,
      headline: c.headline,
      summary: c.summary,
      canonicalEmail: c.canonicalEmail,
      status: c.status,
      createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    }));

    return {
      items,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Creates a new candidate persona in the authenticated tenant.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {object} input - Candidate creation payload.
   * @returns {Promise<object>} Created candidate record.
   */
  async createCandidate(context, input) {
    this._validateContext(context);
    const role = context.role || (await this._resolveUserRole(context));
    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY users cannot create candidates');
    }

    if (!input || !input.displayName || typeof input.displayName !== 'string') {
      throw new ValidationError('displayName is required and must be a string');
    }

    const tenantId = context.tenantId;
    const userId = input.userId !== undefined ? input.userId : context.userId || null;

    const initialMetadata = {
      userCustom: input.profileMetadata?.userCustom || input.profileMetadata || {},
      systemInferred: {},
    };

    const [candidate] = await this._db
      .insert(candidates)
      .values({
        tenantId,
        userId,
        displayName: input.displayName.trim(),
        headline: input.headline ? input.headline.trim() : null,
        summary: input.summary ? input.summary.trim() : null,
        canonicalEmail: input.canonicalEmail ? input.canonicalEmail.toLowerCase().trim() : null,
        profileMetadata: initialMetadata,
        status: 'ACTIVE',
      })
      .returning();

    logger.info(
      {
        tenantId,
        candidateId: candidate.id,
        userId,
        operation: 'candidate.created',
      },
      'Candidate profile created successfully'
    );

    return candidate;
  }

  /**
   * Updates user-editable narrative fields on a candidate profile.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @param {object} patch - Mutable fields.
   * @returns {Promise<object>} Updated candidate record.
   */
  async updateProfile(context, candidateId, patch) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    const [existing] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!existing) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, existing);

    const updatePayload = {
      updatedAt: new Date(),
    };

    if (patch.displayName !== undefined) {
      if (!patch.displayName || typeof patch.displayName !== 'string') {
        throw new ValidationError('displayName cannot be empty');
      }
      updatePayload.displayName = patch.displayName.trim();
    }

    if (patch.headline !== undefined) {
      updatePayload.headline = patch.headline ? String(patch.headline).trim() : null;
    }

    if (patch.summary !== undefined) {
      updatePayload.summary = patch.summary ? String(patch.summary).trim() : null;
    }

    if (patch.canonicalEmail !== undefined) {
      updatePayload.canonicalEmail = patch.canonicalEmail
        ? String(patch.canonicalEmail).toLowerCase().trim()
        : null;
    }

    if (patch.profileMetadata !== undefined) {
      const existingMeta = existing.profileMetadata || { userCustom: {}, systemInferred: {} };
      const newCustom = patch.profileMetadata.userCustom || patch.profileMetadata || {};
      updatePayload.profileMetadata = {
        userCustom: { ...existingMeta.userCustom, ...newCustom },
        systemInferred: existingMeta.systemInferred || {},
      };
    }

    const [updated] = await this._db
      .update(candidates)
      .set(updatePayload)
      .where(eq(candidates.id, existing.id))
      .returning();

    logger.info(
      {
        tenantId,
        candidateId: updated.id,
        operation: 'candidate.updated',
      },
      'Candidate profile narrative updated successfully'
    );

    return updated;
  }

  /**
   * Adds an explicit manual user claim for a skill.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @param {object} params
   * @param {string} params.skillSlug - Slug of the skill being claimed.
   * @param {string} [params.claimNote] - Optional personal note.
   * @returns {Promise<object>} Candidate skill view.
   */
  async addSkillClaim(context, candidateId, { skillSlug, claimNote }) {
    this._validateContext(context);
    if (!candidateId || !skillSlug) {
      throw new ValidationError('candidateId and skillSlug are required to claim a skill');
    }

    const tenantId = context.tenantId;

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, candidate);

    const normalizedSlug = skillSlug.toLowerCase().trim();

    return await this._db.transaction(async (tx) => {
      // 1. Resolve or provision canonical skill
      let [skill] = await tx.select().from(skills).where(eq(skills.slug, normalizedSlug));

      if (!skill) {
        [skill] = await tx
          .insert(skills)
          .values({
            slug: normalizedSlug,
            name: normalizedSlug
              .split('-')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' '),
            category: 'CONCEPT',
          })
          .returning();
      }

      // 2. Check existing candidate skill
      const [existing] = await tx
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantId),
            eq(candidateSkills.candidateId, candidateId),
            eq(candidateSkills.skillId, skill.id)
          )
        );

      let saved;
      if (existing) {
        // If skill already exists with verified evidence, DO NOT downgrade confidence or status!
        const updatedMetadata = {
          ...(existing.metadata || {}),
          isUserClaim: true,
          userClaimNote: claimNote
            ? String(claimNote).trim()
            : existing.metadata?.userClaimNote || null,
        };

        [saved] = await tx
          .update(candidateSkills)
          .set({
            metadata: updatedMetadata,
            updatedAt: new Date(),
          })
          .where(eq(candidateSkills.id, existing.id))
          .returning();
      } else {
        // Insert new CLAIMED skill assertion
        [saved] = await tx
          .insert(candidateSkills)
          .values({
            tenantId,
            candidateId,
            skillId: skill.id,
            category: skill.category,
            provenanceStatus: 'CLAIMED',
            confidenceScore: 0.0,
            evidenceCount: 0,
            primaryEvidenceId: null,
            firstObservedAt: new Date(),
            lastObservedAt: new Date(),
            metadata: {
              isUserClaim: true,
              userClaimNote: claimNote ? String(claimNote).trim() : null,
            },
          })
          .returning();
      }

      logger.info(
        {
          tenantId,
          candidateId,
          skillId: skill.id,
          skillSlug: normalizedSlug,
          operation: 'candidate.skill_claimed',
        },
        'Added manual skill claim successfully'
      );

      return {
        skillId: skill.id,
        slug: skill.slug,
        name: skill.name,
        category: saved.category,
        provenanceStatus: saved.provenanceStatus,
        confidenceScore: saved.confidenceScore,
        evidenceCount: saved.evidenceCount,
        isUserClaim: true,
        claimLabel: saved.provenanceStatus === 'CLAIMED' ? '[Unverified User Claim]' : null,
      };
    });
  }

  /**
   * Removes a manual user claim for a skill.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @param {string} skillId - Canonical skill UUID.
   * @returns {Promise<{ success: boolean, removed: boolean, skillId: string }>}
   */
  async removeSkillClaim(context, candidateId, skillId) {
    this._validateContext(context);
    if (!candidateId || !skillId) {
      throw new ValidationError('candidateId and skillId are required to remove a skill claim');
    }

    const tenantId = context.tenantId;

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, candidate);

    return await this._db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, tenantId),
            eq(candidateSkills.candidateId, candidateId),
            eq(candidateSkills.skillId, skillId)
          )
        );

      if (!existing) {
        throw new NotFoundError(`Skill claim not found for candidate: ${skillId}`);
      }

      if (existing.evidenceCount > 0) {
        // Evidence exists! Only remove the user claim flag and note from metadata
        const updatedMetadata = { ...(existing.metadata || {}) };
        delete updatedMetadata.isUserClaim;
        delete updatedMetadata.userClaimNote;

        await tx
          .update(candidateSkills)
          .set({
            metadata: updatedMetadata,
            updatedAt: new Date(),
          })
          .where(eq(candidateSkills.id, existing.id));
      } else {
        // No evidence exists; delete the pure manual claim row
        await tx.delete(candidateSkills).where(eq(candidateSkills.id, existing.id));
      }

      logger.info(
        {
          tenantId,
          candidateId,
          skillId,
          operation: 'candidate.skill_claim_removed',
        },
        'Removed manual skill claim successfully'
      );

      return { success: true, removed: true, skillId };
    });
  }

  /**
   * Archives a candidate profile.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @returns {Promise<object>}
   */
  async archiveCandidate(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, candidate);

    const [updated] = await this._db
      .update(candidates)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))
      .returning();

    logger.info(
      {
        tenantId,
        candidateId: updated.id,
        operation: 'candidate.archived',
      },
      'Candidate archived successfully'
    );

    return updated;
  }

  /**
   * Restores an archived candidate profile.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @returns {Promise<object>}
   */
  async restoreCandidate(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, candidate);

    const [updated] = await this._db
      .update(candidates)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(candidates.id, candidate.id))
      .returning();

    logger.info(
      {
        tenantId,
        candidateId: updated.id,
        operation: 'candidate.restored',
      },
      'Candidate restored successfully'
    );

    return updated;
  }

  /**
   * Synchronizes candidate profile metadata and resource relationships without
   * overwriting protected user narrative fields.
   *
   * @param {import('../connectors/base/context.js').ConnectorContext|object} context - Trusted context.
   * @param {string} candidateId - Candidate UUID.
   * @returns {Promise<object>} Updated candidate profile view.
   */
  async syncProfileFromResources(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    await this._assertCanMutateCandidate(context, candidate);

    // Fetch connected resources for candidate
    const connectedResources = await this._db
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenantId), eq(resources.candidateId, candidateId)));

    const existingMeta = candidate.profileMetadata || { userCustom: {}, systemInferred: {} };
    const updatedSystemInferred = {
      ...(existingMeta.systemInferred || {}),
      lastSyncedAt: new Date().toISOString(),
      syncedResourceCount: connectedResources.length,
    };

    // Update systemInferred metadata ONLY; narrative fields (displayName, headline, summary) remain untouched!
    await this._db
      .update(candidates)
      .set({
        profileMetadata: {
          userCustom: existingMeta.userCustom || {},
          systemInferred: updatedSystemInferred,
        },
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidate.id));

    logger.info(
      {
        tenantId,
        candidateId,
        syncedResources: connectedResources.length,
        operation: 'candidate.synced',
      },
      'Candidate profile synchronized from connected resources'
    );

    return await this.getProfile(context, candidateId);
  }

  /**
   * Role-Based Access Control Guard for mutating candidate profiles.
   *
   * @param {object} context
   * @param {object} candidate
   * @private
   */
  async _assertCanMutateCandidate(context, candidate) {
    const role = context.role || (await this._resolveUserRole(context));
    if (role === 'READONLY') {
      throw new AuthorizationError('READONLY users cannot modify candidate profiles');
    }
    if (role === 'OWNER') {
      return; // OWNER can mutate any candidate in the tenant
    }
    if (role === 'MEMBER') {
      if (candidate.userId && candidate.userId === context.userId) {
        return; // MEMBER can mutate their own self-linked candidate profile
      }
      throw new AuthorizationError('MEMBER can only modify their self-linked candidate profile');
    }
    throw new AuthorizationError('Unauthorized to modify candidate profile');
  }

  /**
   * Resolves user role from users table if not provided on context.
   *
   * @param {object} context
   * @returns {Promise<string>}
   * @private
   */
  async _resolveUserRole(context) {
    if (context.userId && context.tenantId) {
      const [u] = await this._db
        .select({ role: users.role })
        .from(users)
        .where(and(eq(users.id, context.userId), eq(users.tenantId, context.tenantId)));
      if (u) return u.role;
    }
    return 'MEMBER';
  }

  /**
   * Retrieves persistent user job search preferences.
   *
   * @param {object} context - Trusted context with tenantId
   * @param {string} candidateId - Candidate UUID
   * @returns {Promise<object>} Validated CareerPreferences object
   */
  async getCareerPreferences(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) throw new ValidationError('candidateId is required');

    const [candidate] = await this._db
      .select({ profileMetadata: candidates.profileMetadata })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)));

    if (!candidate) throw new NotFoundError(`Candidate not found: ${candidateId}`);

    const rawPreferences = candidate.profileMetadata?.careerPreferences || {};
    return CareerPreferencesSchema.parse(rawPreferences);
  }

  /**
   * Updates persistent user job search preferences with user sovereignty guarantee.
   *
   * @param {object} context - Trusted context with tenantId and role
   * @param {string} candidateId - Candidate UUID
   * @param {object} rawInput - Updated preferences input
   * @returns {Promise<object>} Updated and validated CareerPreferences object
   */
  async updateCareerPreferences(context, candidateId, rawInput) {
    this._validateContext(context);
    if (!candidateId) throw new ValidationError('candidateId is required');

    const [candidate] = await this._db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)));

    if (!candidate) throw new NotFoundError(`Candidate not found: ${candidateId}`);

    await this._assertCanMutateCandidate(context, candidate);

    const parsedInput = UpdateCareerPreferencesInputSchema.parse(rawInput || {});
    const existingPreferences = candidate.profileMetadata?.careerPreferences || {};

    const updatedPreferences = CareerPreferencesSchema.parse({
      ...existingPreferences,
      ...parsedInput,
      lastUpdated: new Date().toISOString(),
    });

    const updatedMetadata = {
      ...(candidate.profileMetadata || {}),
      careerPreferences: updatedPreferences,
    };

    await this._db
      .update(candidates)
      .set({
        profileMetadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)));

    logger.info(
      {
        tenantId: context.tenantId,
        candidateId,
        operation: 'candidate.preferences_updated',
      },
      'Updated candidate career preferences successfully'
    );

    return updatedPreferences;
  }

  /**
   * Retrieves a comprehensive Career Profile view with preferences, portfolio links, verified skills summary, and qualifications.
   *
   * @param {object} context - Trusted context with tenantId
   * @param {string} candidateId - Candidate UUID
   * @returns {Promise<object>} Validated CandidateCareerProfileView
   */
  async getCareerProfile(context, candidateId) {
    this._validateContext(context);
    if (!candidateId) throw new ValidationError('candidateId is required');

    const profileView = await this.getProfile(context, candidateId);
    const candidate = profileView.candidate;

    const jobPreferences = CareerPreferencesSchema.parse(
      candidate.profileMetadata?.careerPreferences || {}
    );

    const verifiedSkillsSummary = (profileView.skills || [])
      .filter((s) => s.provenanceStatus === 'VERIFIED')
      .map((s) => s.name);

    const topSkills = (profileView.skills || []).slice(0, 15).map((s) => ({
      slug: s.slug,
      name: s.name,
      category: s.category,
      confidenceScore: s.confidenceScore,
      evidenceCount: s.evidenceCount,
      provenanceStatus: s.provenanceStatus,
    }));

    const highlightedProjects = (profileView.projects || [])
      .filter((p) => p.metadata?.portfolioStatus !== 'ARCHIVED' && p.metadata?.isArchived !== true)
      .slice(0, 10)
      .map((p) => ({
        id: p.id,
        name: p.name,
        headline: p.headline || null,
        role: p.role || null,
        startDate: p.startDate ? String(p.startDate) : null,
        endDate: p.endDate ? String(p.endDate) : null,
        linkedResourceCount: p.linkedResourceCount || 0,
        verifiedSignalCount: Array.isArray(p.evidence) ? p.evidence.length : 0,
        provenanceStatus: p.evidence && p.evidence.length > 0 ? 'VERIFIED' : 'CLAIMED',
      }));

    const userCustom = candidate.profileMetadata?.userCustom || {};
    const recentExperience = (userCustom.experience || candidate.profileMetadata?.experience || [])
      .slice(0, 10)
      .map((exp) => ({
        company: exp.company || 'Company',
        title: exp.title || 'Role',
        startDate: exp.startDate ? String(exp.startDate) : null,
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        verifiedSkillsUsed: Array.isArray(exp.skills) ? exp.skills : [],
        provenanceStatus: 'CLAIMED',
      }));

    const education = (userCustom.education || candidate.profileMetadata?.education || []).map(
      (edu) => ({
        institution: edu.institution || edu.school || 'Institution',
        degree: edu.degree || null,
        fieldOfStudy: edu.fieldOfStudy || edu.field || null,
        startDate: edu.startDate ? String(edu.startDate) : null,
        endDate: edu.endDate ? String(edu.endDate) : null,
      })
    );

    const certifications = Array.isArray(userCustom.certifications)
      ? userCustom.certifications
      : Array.isArray(candidate.profileMetadata?.certifications)
        ? candidate.profileMetadata.certifications
        : [];

    const languages = Array.isArray(userCustom.languages)
      ? userCustom.languages
      : Array.isArray(candidate.profileMetadata?.languages)
        ? candidate.profileMetadata.languages
        : [];

    const portfolioLinks = (profileView.identities || [])
      .filter((i) => i.profileUrl)
      .map((i) => ({ label: i.provider, url: i.profileUrl }));

    const missingRequired = [];
    const missingOptional = [];
    if (!jobPreferences.targetRoles || jobPreferences.targetRoles.length === 0)
      missingRequired.push('targetRoles');
    if (
      (!jobPreferences.preferredLocations || jobPreferences.preferredLocations.length === 0) &&
      jobPreferences.remotePreference !== 'REMOTE_ONLY'
    ) {
      missingRequired.push('preferredLocations');
    }
    if (jobPreferences.salaryFloor == null) missingOptional.push('salaryFloor');
    if (!jobPreferences.preferredTechStack || jobPreferences.preferredTechStack.length === 0)
      missingOptional.push('preferredTechStack');
    if (!jobPreferences.industries || jobPreferences.industries.length === 0)
      missingOptional.push('industries');
    if (!jobPreferences.workAuthorization || jobPreferences.workAuthorization.length === 0)
      missingOptional.push('workAuthorization');
    if (!jobPreferences.availabilityDate) missingOptional.push('availabilityDate');

    const isReadyForJobSearch = missingRequired.length === 0;

    let score = 20;
    if (candidate.headline) score += 15;
    if (candidate.summary) score += 15;
    if (topSkills.length > 0) score += 15;
    if (highlightedProjects.length > 0) score += 15;
    if (jobPreferences.targetRoles && jobPreferences.targetRoles.length > 0) score += 10;
    if (jobPreferences.preferredLocations && jobPreferences.preferredLocations.length > 0)
      score += 5;
    if (jobPreferences.salaryFloor != null) score += 5;
    score = Math.min(score, 100);

    const completeness = {
      score,
      status: isReadyForJobSearch
        ? 'COMPLETE FOR JOB SEARCH'
        : `NEEDS ATTENTION — ${missingRequired.length} item(s) needed for job matching`,
      isReadyForJobSearch,
      missingRequiredForSearch: missingRequired,
      missingOptional,
      actionableFeedback: isReadyForJobSearch
        ? 'Profile contains all required criteria for automated job matching and discovery.'
        : `Please configure: ${missingRequired.join(', ')} to enable high-confidence job search.`,
    };

    return CandidateCareerProfileSchema.parse({
      candidateId: candidate.id,
      tenantId: candidate.tenantId,
      displayName: candidate.displayName,
      headline: candidate.headline || null,
      summary: candidate.summary || null,
      currentRole: candidate.profileMetadata?.currentRole || candidate.headline || null,
      location: candidate.profileMetadata?.location || null,
      seniority: candidate.profileMetadata?.seniority || null,
      yearsOfExperience: candidate.profileMetadata?.yearsOfExperience || null,
      canonicalEmail: candidate.canonicalEmail || null,
      portfolioLinks,
      jobPreferences,
      verifiedSkillsSummary,
      topSkills,
      highlightedProjects,
      recentExperience,
      education,
      certifications,
      languages,
      completeness,
      updatedAt: candidate.updatedAt ? new Date(candidate.updatedAt).toISOString() : null,
    });
  }

  /**
   * Lists candidate skills with linked provenance, AST evidence references, and confidence scores.
   *
   * @param {object} context - Trusted context with tenantId
   * @param {string} candidateId - Candidate UUID
   * @param {object} [options={}] - Query options (limit, category, provenanceStatus)
   * @returns {Promise<Array<object>>} List of skills with rich evidence and provenance
   */
  async listSkillsWithEvidence(context, candidateId, options = {}) {
    this._validateContext(context);
    if (!candidateId) throw new ValidationError('candidateId is required');

    const tenantId = context.tenantId;
    const limit = Math.min(Math.max(1, Number(options.limit) || 100), 100);

    const conditions = [
      eq(candidateSkills.tenantId, tenantId),
      eq(candidateSkills.candidateId, candidateId),
    ];

    if (options.provenanceStatus) {
      conditions.push(eq(candidateSkills.provenanceStatus, options.provenanceStatus));
    }

    if (options.category) {
      conditions.push(eq(candidateSkills.category, options.category));
    }

    const rawSkills = await this._db
      .select({
        cs: candidateSkills,
        skillSlug: skills.slug,
        skillName: skills.name,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(and(...conditions))
      .orderBy(desc(candidateSkills.confidenceScore), desc(candidateSkills.lastObservedAt))
      .limit(limit);

    const results = [];
    for (const { cs, skillSlug, skillName } of rawSkills) {
      // Query top evidence items for this skill
      const evRows = await this._db
        .select({
          id: evidenceItems.id,
          evidenceType: evidenceItems.evidenceType,
          sourceLocation: evidenceItems.sourceLocation,
          excerpt: evidenceItems.excerpt,
          confidenceScore: evidenceItems.confidenceScore,
          resourceDisplayName: resources.displayName,
          resourceUrl: resources.url,
          resourceProvider: resources.provider,
          detectedAt: evidenceItems.detectedAt,
        })
        .from(evidenceItems)
        .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
        .where(
          and(
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId),
            eq(evidenceItems.skillId, cs.skillId)
          )
        )
        .orderBy(desc(evidenceItems.confidenceScore), desc(evidenceItems.detectedAt))
        .limit(5);

      const evidenceList = evRows.map((e) => ({
        evidenceId: e.id,
        evidenceType: e.evidenceType,
        sourceLocation: e.sourceLocation,
        excerpt: e.excerpt,
        confidenceScore: e.confidenceScore,
        resourceDisplayName: e.resourceDisplayName || null,
        resourceUrl: e.resourceUrl || null,
        resourceProvider: e.resourceProvider || null,
        detectedAt: e.detectedAt ? new Date(e.detectedAt).toISOString() : null,
      }));

      const isUserClaim = cs.provenanceStatus === 'CLAIMED' || cs.metadata?.isUserClaim === true;

      results.push({
        skillId: cs.skillId,
        slug: skillSlug,
        name: skillName,
        category: cs.category,
        provenanceStatus: cs.provenanceStatus,
        confidenceScore: typeof cs.confidenceScore === 'number' ? cs.confidenceScore : 0.0,
        evidenceCount: cs.evidenceCount,
        isUserClaim,
        claimLabel:
          isUserClaim && cs.provenanceStatus === 'CLAIMED' ? '[Unverified User Claim]' : null,
        evidence: evidenceList,
        lastObservedAt: cs.lastObservedAt ? new Date(cs.lastObservedAt).toISOString() : null,
      });
    }

    return results;
  }

  /**
   * Validates that context carries a valid tenantId.
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
