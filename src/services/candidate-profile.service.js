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
  resumes,
  resumeSections,
} from '../db/schema.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { EvidenceRefMapper } from './evidence/evidence-ref-mapper.js';
import {
  CareerPreferencesSchema,
  UpdateCareerPreferencesInputSchema,
  CandidateCareerProfileSchema,
} from '../domain/candidate/career-preferences.schemas.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';

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

    const tenantId = context.tenantId;
    const profileView = await this.getProfile(context, candidateId);
    const candidate = profileView.candidate;

    // 1. Resolve Resume Data (from profileMetadata or dynamic fallback from latest parsed resume)
    let resumeData = candidate.profileMetadata?.resumeData || null;
    if (!resumeData) {
      try {
        const [latestResume] = await this._db
          .select()
          .from(resumes)
          .where(and(eq(resumes.tenantId, tenantId), eq(resumes.candidateId, candidateId)))
          .orderBy(desc(resumes.isBaseResume), desc(resumes.version))
          .limit(1);

        if (latestResume) {
          const sections = await this._db
            .select()
            .from(resumeSections)
            .where(
              and(
                eq(resumeSections.tenantId, tenantId),
                eq(resumeSections.resumeId, latestResume.id)
              )
            )
            .orderBy(resumeSections.orderIndex);

          if (sections && sections.length > 0) {
            resumeData = this._extractResumeDataFromSections(latestResume, sections);
          }
        }
      } catch (err) {
        logger.debug({ err, candidateId }, 'Fallback resume resolution skipped');
      }
    }

    const userCustom = candidate.profileMetadata?.userCustom || {};

    // 2. Resolve Career Job Preferences
    const jobPreferences = CareerPreferencesSchema.parse(
      candidate.profileMetadata?.careerPreferences || {}
    );

    // 3. Identity Precedence: EXPLICIT_USER_EDIT > RESUME_CLAIM > TRUSTED_IDENTITY
    const headline =
      candidate.headline || userCustom.headline || resumeData?.identity?.headline || null;

    const summary = candidate.summary || userCustom.summary || resumeData?.summary || null;

    const currentRole =
      candidate.profileMetadata?.currentRole ||
      userCustom.currentRole ||
      resumeData?.identity?.currentRole ||
      candidate.headline ||
      null;

    const location =
      candidate.profileMetadata?.location ||
      userCustom.location ||
      resumeData?.identity?.location ||
      null;

    const canonicalEmail = candidate.canonicalEmail || resumeData?.identity?.email || null;

    // 4. Portfolio Links Deduplication
    const portfolioLinksMap = new Map();
    for (const identity of profileView.identities || []) {
      if (identity.profileUrl) {
        portfolioLinksMap.set(identity.profileUrl, {
          label: identity.provider,
          url: identity.profileUrl,
        });
      }
    }

    if (resumeData?.identity) {
      const idObj = resumeData.identity;
      if (idObj.github && !portfolioLinksMap.has(idObj.github)) {
        portfolioLinksMap.set(idObj.github, { label: 'GITHUB', url: idObj.github });
      }
      if (idObj.linkedin && !portfolioLinksMap.has(idObj.linkedin)) {
        portfolioLinksMap.set(idObj.linkedin, { label: 'LINKEDIN', url: idObj.linkedin });
      }
      if (idObj.leetcode && !portfolioLinksMap.has(idObj.leetcode)) {
        portfolioLinksMap.set(idObj.leetcode, { label: 'LEETCODE', url: idObj.leetcode });
      }
      if (Array.isArray(idObj.portfolioUrls)) {
        for (const url of idObj.portfolioUrls) {
          if (url && !portfolioLinksMap.has(url)) {
            portfolioLinksMap.set(url, { label: 'PORTFOLIO', url });
          }
        }
      }
    }

    if (Array.isArray(userCustom.portfolioLinks)) {
      for (const pl of userCustom.portfolioLinks) {
        if (pl?.url && !portfolioLinksMap.has(pl.url)) {
          portfolioLinksMap.set(pl.url, { label: pl.label || 'PORTFOLIO', url: pl.url });
        }
      }
    }

    const portfolioLinks = Array.from(portfolioLinksMap.values());

    // 5. Skills Reconciliation, Canonical Normalization & Truth Calculation
    const resumeSkillNames = new Set(
      (resumeData?.skills || []).map((s) => String(s).toLowerCase().trim())
    );

    const candidateSkillsList = profileView.skills || [];
    const skillMap = new Map(); // canonicalSlug -> merged skill object

    for (const s of candidateSkillsList) {
      const normalized = SkillTaxonomyEngine.normalizeSkill(s.name, {
        categoryHint: s.category || 'TOOL',
      });
      const slug =
        normalized?.canonicalSlug || s.slug || s.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const canonicalName = normalized?.canonicalName || s.name;
      const fineCategory =
        normalized?.fineCategory || SkillTaxonomyEngine.classifyCategory(slug, s.category);
      const tier = normalized?.tier || SkillTaxonomyEngine.classifyTier(slug, fineCategory);

      const hasGithubEvidence =
        s.provenanceStatus === 'VERIFIED' ||
        (Number(s.evidenceCount) > 0 && Number(s.confidenceScore) > 0);

      const hasResumeClaim =
        s.provenanceStatus === 'CLAIMED' ||
        s.metadata?.source === 'RESUME_UPLOAD' ||
        s.metadata?.isUserClaim === true ||
        resumeSkillNames.has(s.name.toLowerCase().trim()) ||
        resumeSkillNames.has(canonicalName.toLowerCase().trim()) ||
        resumeSkillNames.has(slug);

      const incomingEvidenceCount = Number(s.evidenceCount) || 0;
      const incomingConfidence = Number(s.confidenceScore) || 0.5;

      if (skillMap.has(slug)) {
        const existing = skillMap.get(slug);
        existing.evidenceCount += incomingEvidenceCount;
        existing.confidenceScore = Math.max(existing.confidenceScore, incomingConfidence);
        if (hasGithubEvidence) existing.githubEvidence = true;
        if (hasResumeClaim) existing.resumeClaim = true;
        if (existing.githubEvidence) {
          existing.truthStatus = 'VERIFIED';
          existing.provenanceStatus = existing.resumeClaim ? 'CORROBORATED' : 'VERIFIED';
          existing.source = existing.resumeClaim ? 'BOTH' : 'GITHUB';
        }
      } else {
        const truthStatus = hasGithubEvidence ? 'VERIFIED' : 'CLAIMED';
        const provenanceStatus = hasGithubEvidence
          ? hasResumeClaim
            ? 'CORROBORATED'
            : s.provenanceStatus || 'VERIFIED'
          : s.provenanceStatus || 'CLAIMED';

        skillMap.set(slug, {
          slug,
          name: canonicalName,
          category: s.category || 'TOOL',
          fineCategory,
          tier,
          confidenceScore: incomingConfidence,
          evidenceCount: incomingEvidenceCount,
          provenanceStatus,
          resumeClaim: Boolean(hasResumeClaim),
          githubEvidence: Boolean(hasGithubEvidence),
          truthStatus,
          source: hasGithubEvidence ? (hasResumeClaim ? 'BOTH' : 'GITHUB') : 'RESUME',
        });
      }
    }

    // Add any parsed resume skills not yet in skillMap
    if (resumeData?.skills && Array.isArray(resumeData.skills)) {
      for (const rSkill of resumeData.skills) {
        const rawName = String(rSkill).trim();
        if (!rawName) continue;
        const normalized = SkillTaxonomyEngine.normalizeSkill(rawName, {
          categoryHint: 'TOOL',
        });
        const slug = normalized?.canonicalSlug || rawName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const canonicalName = normalized?.canonicalName || rawName;
        const fineCategory =
          normalized?.fineCategory || SkillTaxonomyEngine.classifyCategory(slug, 'TOOL');
        const tier = normalized?.tier || SkillTaxonomyEngine.classifyTier(slug, fineCategory);

        if (skillMap.has(slug)) {
          const existing = skillMap.get(slug);
          existing.resumeClaim = true;
          if (existing.githubEvidence) {
            existing.truthStatus = 'VERIFIED';
            existing.provenanceStatus = 'CORROBORATED';
            existing.source = 'BOTH';
          }
        } else {
          skillMap.set(slug, {
            slug,
            name: canonicalName,
            category: 'TOOL',
            fineCategory,
            tier,
            confidenceScore: 0.5,
            evidenceCount: 0,
            provenanceStatus: 'CLAIMED',
            resumeClaim: true,
            githubEvidence: false,
            truthStatus: 'CLAIMED',
            source: 'RESUME',
          });
        }
      }
    }

    const allSkillsList = Array.from(skillMap.values());

    const primarySkills = allSkillsList
      .filter((s) => s.tier === 'PRIMARY')
      .sort((a, b) => {
        // 1. Domain Category Rank: Languages -> Backend -> Frontend -> DBs -> Protocols -> Platforms -> Cloud -> AI/ML -> Tools
        const rankA = SkillTaxonomyEngine.getPrimarySkillRank(a);
        const rankB = SkillTaxonomyEngine.getPrimarySkillRank(b);
        if (rankA !== rankB) return rankA - rankB;

        // 2. Truth status: Verified/Corroborated first, then Claimed
        const isVerA = a.truthStatus === 'VERIFIED' || a.provenanceStatus === 'CORROBORATED';
        const isVerB = b.truthStatus === 'VERIFIED' || b.provenanceStatus === 'CORROBORATED';
        if (isVerA && !isVerB) return -1;
        if (isVerB && !isVerA) return 1;

        // 3. Confidence score
        if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;

        // 4. Alphabetical
        return a.name.localeCompare(b.name);
      });

    const technologySignals = allSkillsList
      .filter((s) => s.tier === 'SIGNAL')
      .sort((a, b) => {
        if (b.evidenceCount !== a.evidenceCount) return b.evidenceCount - a.evidenceCount;
        return a.name.localeCompare(b.name);
      });

    const topSkills = [...primarySkills, ...technologySignals];

    const verifiedSkillsSummary = topSkills
      .filter(
        (s) =>
          s.truthStatus === 'VERIFIED' ||
          s.provenanceStatus === 'VERIFIED' ||
          s.provenanceStatus === 'CORROBORATED'
      )
      .map((s) => s.name);

    // 6. Highlighted Projects Reconciliation (Multi-factor: name, slug, URL, tech stack overlap)
    const githubProjects = (profileView.projects || []).filter(
      (p) => p.metadata?.portfolioStatus !== 'ARCHIVED' && p.metadata?.isArchived !== true
    );
    const resumeProjects = Array.isArray(resumeData?.projects) ? resumeData.projects : [];
    const matchedResumeProjectIndices = new Set();
    const highlightedProjects = [];

    const normalizeProjectName = (str) =>
      String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    for (const gProj of githubProjects) {
      const gNorm = normalizeProjectName(gProj.name);
      const gSlug = String(gProj.slug || '').toLowerCase();
      let matchedResume = null;

      for (let i = 0; i < resumeProjects.length; i++) {
        if (matchedResumeProjectIndices.has(i)) continue;
        const rProj = resumeProjects[i];
        const rNorm = normalizeProjectName(rProj.name || rProj.title);

        const namesMatch =
          gNorm && rNorm && (gNorm === rNorm || gNorm.includes(rNorm) || rNorm.includes(gNorm));

        const urlMatch =
          Array.isArray(rProj.urls) &&
          rProj.urls.some(
            (u) =>
              u && (u.toLowerCase().includes(gNorm) || (gSlug && u.toLowerCase().includes(gSlug)))
          );

        // Tech stack overlap match (if at least 2 technologies match repo technologies or description)
        const techMatch =
          Array.isArray(rProj.technologies) &&
          rProj.technologies.length >= 2 &&
          rProj.technologies.filter((t) => {
            const tSlug = String(t).toLowerCase();
            return (
              (gProj.headline && gProj.headline.toLowerCase().includes(tSlug)) ||
              (gProj.summary && gProj.summary.toLowerCase().includes(tSlug)) ||
              (gProj.name && gProj.name.toLowerCase().includes(tSlug))
            );
          }).length >= 2;

        if (namesMatch || urlMatch || techMatch) {
          matchedResume = rProj;
          matchedResumeProjectIndices.add(i);
          break;
        }
      }

      const verifiedCount = Array.isArray(gProj.evidence)
        ? gProj.evidence.length
        : gProj.verifiedSignalCount || 0;

      const mergedTechnologies = Array.from(
        new Set([
          ...(matchedResume?.technologies || []),
          ...(Array.isArray(gProj.technologies) ? gProj.technologies : []),
        ])
      );

      const mergedUrls = Array.from(
        new Set([
          ...(matchedResume?.urls || []),
          ...(Array.isArray(gProj.urls) ? gProj.urls : []),
          ...(gProj.metadata?.repoUrl ? [gProj.metadata.repoUrl] : []),
        ])
      );

      highlightedProjects.push({
        id: gProj.id,
        name: gProj.name,
        headline: gProj.headline || matchedResume?.headline || null,
        role: gProj.role || matchedResume?.role || null,
        summary: gProj.summary || matchedResume?.summary || null,
        technologies: mergedTechnologies,
        bullets: matchedResume?.bullets || (gProj.summary ? [gProj.summary] : []),
        urls: mergedUrls,
        startDate: gProj.startDate ? String(gProj.startDate) : matchedResume?.startDate || null,
        endDate: gProj.endDate ? String(gProj.endDate) : matchedResume?.endDate || null,
        linkedResourceCount: gProj.linkedResourceCount || 1,
        verifiedSignalCount: verifiedCount,
        provenanceStatus:
          verifiedCount > 0 ? (matchedResume ? 'CORROBORATED' : 'VERIFIED') : 'CLAIMED',
        source: matchedResume ? (verifiedCount > 0 ? 'BOTH' : 'RESUME') : 'GITHUB',
      });
    }

    // Include remaining unmatched resume projects (Never delete resume projects lacking GitHub repos)
    for (let i = 0; i < resumeProjects.length; i++) {
      if (matchedResumeProjectIndices.has(i)) continue;
      const rProj = resumeProjects[i];
      highlightedProjects.push({
        name: rProj.name || rProj.title || 'Project',
        headline: rProj.headline || null,
        role: rProj.role || null,
        summary: rProj.summary || null,
        technologies: rProj.technologies || [],
        bullets: rProj.bullets || [],
        urls: rProj.urls || [],
        startDate: rProj.startDate || null,
        endDate: rProj.endDate || null,
        linkedResourceCount: 0,
        verifiedSignalCount: 0,
        provenanceStatus: 'CLAIMED',
        source: 'RESUME',
      });
    }

    // 7. Recent Work Experience Reconciliation
    const rawCustomExperience = userCustom.experience || candidate.profileMetadata?.experience;
    let recentExperience = [];

    if (Array.isArray(rawCustomExperience) && rawCustomExperience.length > 0) {
      recentExperience = rawCustomExperience.slice(0, 10).map((exp) => ({
        company: exp.company || 'Company',
        title: exp.title || exp.role || 'Role',
        location: exp.location || null,
        startDate: exp.startDate ? String(exp.startDate) : null,
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        bullets: Array.isArray(exp.bullets) ? exp.bullets : [],
        verifiedSkillsUsed: Array.isArray(exp.skills) ? exp.skills : [],
        provenanceStatus: exp.provenanceStatus || 'USER_PROVIDED',
      }));
    } else if (Array.isArray(resumeData?.experience) && resumeData.experience.length > 0) {
      recentExperience = resumeData.experience.slice(0, 10).map((exp) => ({
        company: exp.company || 'Company',
        title: exp.title || exp.role || 'Role',
        location: exp.location || null,
        startDate: exp.startDate ? String(exp.startDate) : null,
        endDate: exp.endDate ? String(exp.endDate) : null,
        isCurrent: Boolean(exp.isCurrent),
        bullets: Array.isArray(exp.bullets) ? exp.bullets : [],
        verifiedSkillsUsed: Array.isArray(exp.verifiedSkillsUsed) ? exp.verifiedSkillsUsed : [],
        provenanceStatus: 'CLAIMED',
      }));
    }

    // 8. Education Reconciliation
    const rawCustomEducation = userCustom.education || candidate.profileMetadata?.education;
    let education = [];

    if (Array.isArray(rawCustomEducation) && rawCustomEducation.length > 0) {
      education = rawCustomEducation.map((edu) => ({
        institution: edu.institution || edu.school || 'Institution',
        degree: edu.degree || null,
        fieldOfStudy: edu.fieldOfStudy || edu.field || null,
        startDate: edu.startDate ? String(edu.startDate) : null,
        endDate: edu.endDate ? String(edu.endDate) : null,
        provenanceStatus: edu.provenanceStatus || 'USER_PROVIDED',
      }));
    } else if (Array.isArray(resumeData?.education) && resumeData.education.length > 0) {
      education = resumeData.education.map((edu) => ({
        institution: edu.institution || edu.school || 'Institution',
        degree: edu.degree || null,
        fieldOfStudy: edu.fieldOfStudy || edu.field || null,
        startDate: edu.startDate ? String(edu.startDate) : null,
        endDate: edu.endDate ? String(edu.endDate) : null,
        provenanceStatus: 'CLAIMED',
      }));
    }

    // 9. Certifications & Languages
    const certifications =
      Array.isArray(userCustom.certifications) && userCustom.certifications.length > 0
        ? userCustom.certifications
        : Array.isArray(resumeData?.certifications) && resumeData.certifications.length > 0
          ? resumeData.certifications
          : Array.isArray(candidate.profileMetadata?.certifications)
            ? candidate.profileMetadata.certifications
            : [];

    const languages =
      Array.isArray(userCustom.languages) && userCustom.languages.length > 0
        ? userCustom.languages
        : Array.isArray(resumeData?.languages) && resumeData.languages.length > 0
          ? resumeData.languages
          : Array.isArray(candidate.profileMetadata?.languages)
            ? candidate.profileMetadata.languages
            : [];

    // 10. Distinct Career Profile Readiness vs Job Search Intent Readiness
    const missingProfileFields = [];
    let profileScore = 0;
    if (candidate.displayName) profileScore += 15;
    if (headline) profileScore += 15;
    else missingProfileFields.push('headline');

    if (summary) profileScore += 15;
    else missingProfileFields.push('summary');

    if (topSkills.length > 0) profileScore += 20;
    else missingProfileFields.push('skills');

    if (highlightedProjects.length > 0 || recentExperience.length > 0) profileScore += 20;
    else missingProfileFields.push('experienceOrProjects');

    if (education.length > 0) profileScore += 15;
    else missingProfileFields.push('education');

    profileScore = Math.min(profileScore, 100);
    const isProfileComplete = profileScore >= 70;

    const profileReadiness = {
      score: profileScore,
      status: isProfileComplete
        ? 'PROFILE POPULATED'
        : `PROFILE INCOMPLETE (${missingProfileFields.length} field(s) recommended)`,
      isComplete: isProfileComplete,
      missingFields: missingProfileFields,
      actionableFeedback: isProfileComplete
        ? 'Career profile contains comprehensive professional identity and verified qualifications.'
        : `Consider adding: ${missingProfileFields.join(', ')} to strengthen your baseline profile.`,
    };

    // Job Search Readiness (Intent Model)
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

    let score = Math.floor(profileScore * 0.6); // 60% weight from actual professional qualifications
    if (jobPreferences.targetRoles && jobPreferences.targetRoles.length > 0) score += 15;
    if (jobPreferences.preferredLocations && jobPreferences.preferredLocations.length > 0)
      score += 10;
    if (jobPreferences.salaryFloor != null) score += 5;
    if (jobPreferences.preferredTechStack && jobPreferences.preferredTechStack.length > 0)
      score += 5;
    if (jobPreferences.workAuthorization && jobPreferences.workAuthorization.length > 0) score += 5;
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
      headline,
      summary,
      currentRole,
      location,
      seniority: candidate.profileMetadata?.seniority || null,
      yearsOfExperience: candidate.profileMetadata?.yearsOfExperience || null,
      canonicalEmail,
      portfolioLinks,
      jobPreferences,
      verifiedSkillsSummary,
      topSkills,
      primarySkills,
      technologySignals,
      highlightedProjects,
      recentExperience,
      education,
      certifications,
      languages,
      completeness,
      profileReadiness,
      updatedAt: candidate.updatedAt ? new Date(candidate.updatedAt).toISOString() : null,
    });
  }

  /**
   * Helper extracting structured resume data from sections list.
   *
   * @private
   * @param {object} resume
   * @param {Array<object>} sections
   * @returns {object}
   */
  _extractResumeDataFromSections(resume, sections) {
    let contactName = null;
    let contactEmail = null;
    let contactPhone = null;
    let contactGithub = null;
    let contactLinkedin = null;
    let contactLeetcode = null;
    const contactUrls = [];
    let detectedLocation = null;
    let detectedHeadline = null;
    let detectedCurrentRole = null;
    let resumeSummary = null;
    const resumeExperiences = [];
    const resumeEducation = [];
    const resumeProjects = [];
    const resumeCerts = [];
    const resumeSkills = [];

    for (const sec of sections) {
      const sd = sec.structuredData || {};
      if (sec.sectionType === 'CONTACT_INFO' || sec.sectionType === 'SUMMARY') {
        if (sd.name && !contactName) contactName = sd.name;
        if (sd.email && !contactEmail) contactEmail = sd.email;
        if (sd.phone && !contactPhone) contactPhone = sd.phone;
        if (sd.github && !contactGithub) contactGithub = sd.github;
        if (sd.linkedin && !contactLinkedin) contactLinkedin = sd.linkedin;
        if (sd.leetcode && !contactLeetcode) contactLeetcode = sd.leetcode;
        if (Array.isArray(sd.urls)) contactUrls.push(...sd.urls);
      }

      if (sec.sectionType === 'SUMMARY') {
        if (typeof sd.content === 'string' && sd.content.trim()) {
          resumeSummary = sd.content.trim();
        } else if (sec.rawText && sec.rawText.trim()) {
          resumeSummary = sec.rawText.trim();
        }
      }

      if (sec.sectionType === 'WORK_EXPERIENCE' && Array.isArray(sd.experiences)) {
        for (const exp of sd.experiences) {
          const role = (exp.role || '').trim();
          const company = (exp.company || '').trim();
          const loc = (exp.location || '').trim();
          const dates = (exp.dates || '').trim();
          const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];

          if (!detectedCurrentRole && role) detectedCurrentRole = role;
          if (!detectedHeadline && role) detectedHeadline = role;
          if (!detectedLocation && loc) detectedLocation = loc;

          resumeExperiences.push({
            company: company || 'Company',
            title: role || 'Role',
            role: role || 'Role',
            location: loc || null,
            startDate: dates || null,
            endDate: null,
            isCurrent: /present|current|now/i.test(dates),
            bullets,
            verifiedSkillsUsed: [],
            provenanceStatus: 'CLAIMED',
          });
        }
      }

      if (sec.sectionType === 'EDUCATION' && Array.isArray(sd.degrees)) {
        for (const d of sd.degrees) {
          const raw = String(d || '').trim();
          if (!raw) continue;
          const parts = raw
            .split(/[|,]/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length >= 2) {
            resumeEducation.push({
              institution: parts[1],
              degree: parts[0],
              fieldOfStudy: parts[2] || null,
              startDate: null,
              endDate: null,
              text: raw,
              provenanceStatus: 'CLAIMED',
            });
          } else {
            resumeEducation.push({
              institution: raw,
              degree: null,
              fieldOfStudy: null,
              startDate: null,
              endDate: null,
              text: raw,
              provenanceStatus: 'CLAIMED',
            });
          }
        }
      }

      if (sec.sectionType === 'PROJECTS' && Array.isArray(sd.projects)) {
        for (const proj of sd.projects) {
          const title = (proj.title || '').trim();
          if (!title) continue;
          resumeProjects.push({
            name: title,
            title,
            headline: proj.bullets?.[0] || null,
            role: null,
            summary: proj.bullets?.join(' ') || null,
            technologies: Array.isArray(proj.technologies) ? proj.technologies : [],
            bullets: Array.isArray(proj.bullets) ? proj.bullets : [],
            urls: Array.isArray(proj.urls) ? proj.urls : [],
            startDate: null,
            endDate: null,
            linkedResourceCount: 0,
            verifiedSignalCount: 0,
            provenanceStatus: 'CLAIMED',
          });
        }
      }

      if (sec.sectionType === 'CERTIFICATIONS' && Array.isArray(sd.certs)) {
        for (const c of sd.certs) {
          const trimmed = String(c || '').trim();
          if (trimmed) resumeCerts.push(trimmed);
        }
      }

      if (sec.sectionType === 'SKILLS' && Array.isArray(sd.skills)) {
        for (const s of sd.skills) {
          const trimmed = String(s || '').trim();
          if (trimmed && !resumeSkills.includes(trimmed)) resumeSkills.push(trimmed);
        }
      }
    }

    return {
      sourceResumeId: resume.id,
      sourceVersion: resume.version,
      extractedAt: new Date().toISOString(),
      identity: {
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        location: detectedLocation,
        headline: detectedHeadline,
        currentRole: detectedCurrentRole,
        github: contactGithub,
        linkedin: contactLinkedin,
        leetcode: contactLeetcode,
        portfolioUrls: [...new Set(contactUrls)],
      },
      summary: resumeSummary,
      experience: resumeExperiences,
      education: resumeEducation,
      projects: resumeProjects,
      certifications: [...new Set(resumeCerts)],
      skills: resumeSkills,
      provenance: 'RESUME_CLAIM',
    };
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
