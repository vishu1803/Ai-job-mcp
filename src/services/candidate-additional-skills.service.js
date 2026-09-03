/**
 * @file Candidate Additional Skills Service
 *
 * Manages candidate-declared skills (Additional Skills feature).
 * These are skills the candidate knows or is learning but may not be
 * verifiable from GitHub/resume evidence.
 *
 * Key rules:
 * - SELF_DECLARED != VERIFIED (self-declaration never upgrades provenance)
 * - LEARNING skills do not satisfy current job requirements
 * - Stronger provenance (VERIFIED/CORROBORATED) always wins over SELF_DECLARED
 * - Candidate declarations are stored in the same candidate_skills table
 *   with source = 'CANDIDATE_DECLARED'
 */

import { eq, and, desc } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, candidateSkills, skills, skillCatalog } from '../db/schema.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import { SkillCatalogService } from './skill-catalog.service.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

/**
 * Supported proficiency levels.
 */
export const PROFICIENCY_LEVELS = Object.freeze({
  BASIC: 'BASIC',
  WORKING_KNOWLEDGE: 'WORKING_KNOWLEDGE',
  PROFICIENT: 'PROFICIENT',
  ADVANCED: 'ADVANCED',
  CURRENTLY_LEARNING: 'CURRENTLY_LEARNING',
});

/**
 * Supported usage contexts.
 */
export const USAGE_CONTEXTS = Object.freeze({
  PROFESSIONAL_WORK: 'PROFESSIONAL_WORK',
  INTERNSHIP: 'INTERNSHIP',
  PERSONAL_PROJECT: 'PERSONAL_PROJECT',
  FREELANCE: 'FREELANCE',
  ACADEMIC_PROJECT: 'ACADEMIC_PROJECT',
  CERTIFICATION: 'CERTIFICATION',
  SELF_STUDY: 'SELF_STUDY',
});

/**
 * Allowed source values for candidate skills.
 */
export const SKILL_SOURCES = Object.freeze({
  GITHUB: 'GITHUB',
  RESUME: 'RESUME',
  CERTIFICATION: 'CERTIFICATION',
  PROJECT: 'PROJECT',
  CANDIDATE_DECLARED: 'CANDIDATE_DECLARED',
});

/**
 * Maps skill catalog categories to the DB skillCategoryEnum values.
 */
const CATALOG_TO_DB_CATEGORY = Object.freeze({
  CLOUD: 'CLOUD_DEVOPS', CONTAINERS: 'CLOUD_DEVOPS', CICD: 'CLOUD_DEVOPS',
  DATABASES: 'DATABASE', MESSAGING: 'DATABASE',
  NETWORKING: 'TOOL', OBSERVABILITY: 'TOOL', SECURITY: 'TOOL',
  ARCHITECTURE: 'ARCHITECTURE', DEVELOPMENT: 'TOOL',
  AI_DEVELOPMENT: 'TOOL', GENAI: 'TOOL', AI_AGENTS: 'TOOL',
  MCP: 'TOOL', AI_QUALITY: 'TOOL', MLOPS: 'TOOL',
  DX: 'TOOL', PRACTICES: 'TOOL',
  LANGUAGE: 'LANGUAGE', FRAMEWORK: 'FRAMEWORK',
  TOOL: 'TOOL', CONCEPT: 'CONCEPT',
});

function _mapCatalogCategoryToDbEnum(catalogCategory) {
  if (!catalogCategory) return 'TOOL';
  return CATALOG_TO_DB_CATEGORY[catalogCategory] || 'TOOL';
}

export class CandidateAdditionalSkillsService {
  /**
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase|object} [database]
   */
  constructor(database = null) {
    if (database && typeof database === 'object' && !database.select) {
      this.db = database.db || database.database || defaultDb;
    } else {
      this.db = database || defaultDb;
    }
    this.catalogService = new SkillCatalogService(this.db);
  }

  get _db() {
    return this.db || defaultDb;
  }

  /**
   * Validates context for multi-tenant access.
   * @private
   */
  _validateContext(context) {
    if (!context || !context.tenantId) {
      throw new ValidationError('Valid tenant context is required');
    }
  }

  /**
   * Adds a skill to a candidate's additional skills.
   * The skill must exist in the skill_catalog or the global skills table.
   *
   * Rules:
   * - If candidate already has this skill with VERIFIED/CORROBORATED provenance,
   *   we DO NOT downgrade it to SELF_DECLARED. We add the declaration as
   *   additional metadata but preserve the stronger provenance.
   * - If candidate has no existing skill, we create a candidate_skills entry
   *   with source = 'CANDIDATE_DECLARED' and provenanceStatus = 'SELF_DECLARED'.
   * - If proficiency is CURRENTLY_LEARNING, provenanceStatus = 'LEARNING'.
   *
   * @param {object} context - Trusted context with tenantId
   * @param {string} candidateId - Candidate UUID
   * @param {object} params
   * @param {string} params.catalogSkillId - skill_catalog UUID
   * @param {string} [params.proficiency='WORKING_KNOWLEDGE']
   * @param {string} [params.usageContext]
   * @param {number} [params.yearsExperience]
   * @param {string} [params.notes]
   * @returns {Promise<object>} Updated or created candidate skill record
   */
  async addAdditionalSkill(context, candidateId, {
    catalogSkillId,
    proficiency = 'WORKING_KNOWLEDGE',
    usageContext = null,
    yearsExperience = null,
    notes = null,
  }) {
    this._validateContext(context);

    if (!candidateId) throw new ValidationError('candidateId is required');
    if (!catalogSkillId) throw new ValidationError('catalogSkillId is required');

    // Validate proficiency
    if (!Object.values(PROFICIENCY_LEVELS).includes(proficiency)) {
      throw new ValidationError(`Invalid proficiency: ${proficiency}. Must be one of: ${Object.values(PROFICIENCY_LEVELS).join(', ')}`);
    }

    // Validate usageContext if provided
    if (usageContext && !Object.values(USAGE_CONTEXTS).includes(usageContext)) {
      throw new ValidationError(`Invalid usageContext: ${usageContext}. Must be one of: ${Object.values(USAGE_CONTEXTS).join(', ')}`);
    }

    // Verify candidate exists in this tenant
    const [candidate] = await this._db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    // Resolve catalog skill to get the canonical skill info
    const catalogSkill = await this.catalogService.getSkillById(catalogSkillId);
    if (!catalogSkill) {
      throw new NotFoundError(`Skill catalog entry not found: ${catalogSkillId}`);
    }

    // Find or create the global skill record
    const globalSkill = await this._findOrCreateGlobalSkill(catalogSkill);

    // Determine provenance status
    const isLearning = proficiency === 'CURRENTLY_LEARNING';
    const provenanceStatus = isLearning ? 'LEARNING' : 'SELF_DECLARED';

    // Check if candidate already has this skill
    const [existing] = await this._db
      .select()
      .from(candidateSkills)
      .where(
        and(
          eq(candidateSkills.tenantId, context.tenantId),
          eq(candidateSkills.candidateId, candidateId),
          eq(candidateSkills.skillId, globalSkill.id)
        )
      )
      .limit(1);

    if (existing) {
      // CRITICAL: Never downgrade stronger provenance
      const strongerProvenances = ['VERIFIED', 'CORROBORATED'];
      if (strongerProvenances.includes(existing.provenanceStatus)) {
        // Update metadata only — preserve the stronger provenance
        const updatedMetadata = {
          ...(existing.metadata || {}),
          additionalSkillDeclaration: {
            proficiency,
            usageContext,
            yearsExperience,
            notes,
            declaredAt: new Date().toISOString(),
          },
        };

        const [updated] = await this._db
          .update(candidateSkills)
          .set({
            metadata: updatedMetadata,
            updatedAt: new Date(),
          })
          .where(eq(candidateSkills.id, existing.id))
          .returning();

        logger.info({
          candidateId,
          skillId: globalSkill.id,
          skillSlug: globalSkill.slug,
          existingProvenance: existing.provenanceStatus,
          preservedProvenance: true,
        }, 'Additional skill declaration added, preserving stronger existing provenance');

        return { ...updated, skillId: globalSkill.id, catalogSkillId: catalogSkill.id, skill: catalogSkill, preservedProvenance: true };
      }

      // Update existing SELF_DECLARED/CLAIMED/INFERRED record
      const [updated] = await this._db
        .update(candidateSkills)
        .set({
          provenanceStatus,
          proficiency,
          source: 'CANDIDATE_DECLARED',
          usageContext,
          yearsExperience,
          notes,
          updatedAt: new Date(),
        })
        .where(eq(candidateSkills.id, existing.id))
        .returning();

      return { ...updated, skillId: globalSkill.id, catalogSkillId: catalogSkill.id, skill: catalogSkill, preservedProvenance: false };
    }

    // Create new candidate skill record
    const [created] = await this._db
      .insert(candidateSkills)
      .values({
        tenantId: context.tenantId,
        candidateId,
        skillId: globalSkill.id,
        category: _mapCatalogCategoryToDbEnum(catalogSkill.category) || 'TOOL',
        provenanceStatus,
        confidenceScore: 0.0,
        evidenceCount: 0,
        proficiency,
        source: 'CANDIDATE_DECLARED',
        usageContext,
        yearsExperience,
        notes,
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
        metadata: {
          source: 'CANDIDATE_DECLARED',
          isUserClaim: true,
          catalogSkillSlug: catalogSkill.slug,
          catalogSkillName: catalogSkill.canonicalName,
        },
      })
      .returning();

    return { ...created, skillId: globalSkill.id, catalogSkillId: catalogSkill.id, skill: catalogSkill, preservedProvenance: false };
  }

  /**
   * Removes a skill from a candidate's additional skills.
   * Only removes skills with source = 'CANDIDATE_DECLARED'.
   * Does NOT remove GitHub/resume-verified skills.
   *
   * @param {object} context - Trusted context
   * @param {string} candidateId
   * @param {string} skillId - candidate_skills UUID
   * @returns {Promise<boolean>}
   */
  async removeAdditionalSkill(context, candidateId, skillId) {
    this._validateContext(context);

    if (!candidateId) throw new ValidationError('candidateId is required');
    if (!skillId) throw new ValidationError('skillId is required');

    // Find the candidate skill
    const [existing] = await this._db
      .select()
      .from(candidateSkills)
      .where(
        and(
          eq(candidateSkills.id, skillId),
          eq(candidateSkills.tenantId, context.tenantId),
          eq(candidateSkills.candidateId, candidateId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Candidate skill not found: ${skillId}`);
    }

    // Only allow removal of candidate-declared skills
    if (existing.source !== 'CANDIDATE_DECLARED') {
      throw new ValidationError(
        'Cannot remove evidence-backed skills. Only candidate-declared skills can be removed.'
      );
    }

    await this._db
      .delete(candidateSkills)
      .where(eq(candidateSkills.id, skillId));

    return true;
  }

  /**
   * Lists all additional (candidate-declared) skills for a candidate.
   *
   * @param {object} context
   * @param {string} candidateId
   * @returns {Promise<Array>}
   */
  async listAdditionalSkills(context, candidateId) {
    this._validateContext(context);

    const rows = await this._db
      .select({
        cs: candidateSkills,
        skillSlug: skills.slug,
        skillName: skills.name,
        catalogSkillId: skillCatalog.id,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .leftJoin(skillCatalog, eq(skills.slug, skillCatalog.slug))
      .where(
        and(
          eq(candidateSkills.tenantId, context.tenantId),
          eq(candidateSkills.candidateId, candidateId),
          eq(candidateSkills.source, 'CANDIDATE_DECLARED')
        )
      )
      .orderBy(desc(candidateSkills.updatedAt));

    return rows.map(({ cs, skillSlug, skillName, catalogSkillId }) => ({
      id: cs.id,
      skillId: cs.skillId,
      catalogSkillId: catalogSkillId || null,
      skillSlug,
      skillName,
      category: cs.category,
      provenanceStatus: cs.provenanceStatus,
      proficiency: cs.proficiency,
      source: cs.source,
      usageContext: cs.usageContext,
      yearsExperience: cs.yearsExperience,
      lastUsedAt: cs.lastUsedAt ? new Date(cs.lastUsedAt).toISOString() : null,
      notes: cs.notes,
      metadata: cs.metadata || {},
      createdAt: cs.createdAt ? new Date(cs.createdAt).toISOString() : null,
      updatedAt: cs.updatedAt ? new Date(cs.updatedAt).toISOString() : null,
    }));
  }

  /**
   * Atomically replaces the candidate's additional skills list.
   * Ensures pre-validation of all skills before any deletion occurs.
   * If any skill validation fails, no changes are committed to the database.
   *
   * @param {object} context - Trusted context
   * @param {string} candidateId - Candidate UUID
   * @param {Array<object>} skillsList - Array of { catalogSkillId, proficiency, usageContext, yearsExperience, notes }
   * @returns {Promise<Array<object>>} Updated list of additional skills
   */
  async setAdditionalSkills(context, candidateId, skillsList) {
    this._validateContext(context);

    if (!candidateId) throw new ValidationError('candidateId is required');
    if (!Array.isArray(skillsList)) throw new ValidationError('skillsList must be an array');

    // 1. Verify candidate exists in this tenant
    const [candidate] = await this._db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    // 2. Pre-validate all items BEFORE touching the database
    const validatedEntries = [];
    const seenCatalogIds = new Set();

    for (let i = 0; i < skillsList.length; i++) {
      const item = skillsList[i];
      if (!item || typeof item !== 'object') {
        throw new ValidationError(`Skill at index ${i} is invalid`);
      }

      const {
        catalogSkillId,
        proficiency = 'WORKING_KNOWLEDGE',
        usageContext = null,
        yearsExperience = null,
        notes = null,
      } = item;

      if (!catalogSkillId) {
        throw new ValidationError(`Skill at index ${i} is missing required catalogSkillId`);
      }

      if (seenCatalogIds.has(catalogSkillId)) {
        continue;
      }
      seenCatalogIds.add(catalogSkillId);

      // Validate proficiency
      if (!Object.values(PROFICIENCY_LEVELS).includes(proficiency)) {
        throw new ValidationError(`Invalid proficiency: ${proficiency} at index ${i}. Must be one of: ${Object.values(PROFICIENCY_LEVELS).join(', ')}`);
      }

      // Validate usageContext if provided
      if (usageContext && !Object.values(USAGE_CONTEXTS).includes(usageContext)) {
        throw new ValidationError(`Invalid usageContext: ${usageContext} at index ${i}. Must be one of: ${Object.values(USAGE_CONTEXTS).join(', ')}`);
      }

      // Resolve from catalogService
      const catalogSkill = await this.catalogService.getSkillById(catalogSkillId);
      if (!catalogSkill) {
        throw new NotFoundError(`Skill catalog entry not found: ${catalogSkillId}`);
      }

      // Find or create global skill
      const globalSkill = await this._findOrCreateGlobalSkill(catalogSkill);

      const isLearning = proficiency === 'CURRENTLY_LEARNING';
      const provenanceStatus = isLearning ? 'LEARNING' : 'SELF_DECLARED';

      validatedEntries.push({
        catalogSkill,
        globalSkill,
        provenanceStatus,
        proficiency,
        usageContext,
        yearsExperience,
        notes,
      });
    }

    // 3. Execute atomic transaction
    await this._db.transaction(async (tx) => {
      // Find existing skills for this candidate
      const existingCandidateSkills = await tx
        .select()
        .from(candidateSkills)
        .where(
          and(
            eq(candidateSkills.tenantId, context.tenantId),
            eq(candidateSkills.candidateId, candidateId),
            eq(candidateSkills.source, 'CANDIDATE_DECLARED')
          )
        );

      // Remove or strip metadata for skills not in the new set
      for (const existing of existingCandidateSkills) {
        const strongerProvenances = ['VERIFIED', 'CORROBORATED'];
        if (strongerProvenances.includes(existing.provenanceStatus)) {
          const stillPresent = validatedEntries.some(v => v.globalSkill.id === existing.skillId);
          if (!stillPresent) {
            const cleanMeta = { ...(existing.metadata || {}) };
            delete cleanMeta.additionalSkillDeclaration;
            await tx
              .update(candidateSkills)
              .set({ metadata: cleanMeta, updatedAt: new Date() })
              .where(eq(candidateSkills.id, existing.id));
          }
        } else {
          await tx
            .delete(candidateSkills)
            .where(eq(candidateSkills.id, existing.id));
        }
      }

      // Insert or update validated items
      for (const entry of validatedEntries) {
        const [existing] = await tx
          .select()
          .from(candidateSkills)
          .where(
            and(
              eq(candidateSkills.tenantId, context.tenantId),
              eq(candidateSkills.candidateId, candidateId),
              eq(candidateSkills.skillId, entry.globalSkill.id)
            )
          )
          .limit(1);

        if (existing) {
          const strongerProvenances = ['VERIFIED', 'CORROBORATED'];
          if (strongerProvenances.includes(existing.provenanceStatus)) {
            const updatedMetadata = {
              ...(existing.metadata || {}),
              additionalSkillDeclaration: {
                proficiency: entry.proficiency,
                usageContext: entry.usageContext,
                yearsExperience: entry.yearsExperience,
                notes: entry.notes,
                declaredAt: new Date().toISOString(),
              },
            };
            await tx
              .update(candidateSkills)
              .set({ metadata: updatedMetadata, updatedAt: new Date() })
              .where(eq(candidateSkills.id, existing.id));
          } else {
            await tx
              .update(candidateSkills)
              .set({
                provenanceStatus: entry.provenanceStatus,
                proficiency: entry.proficiency,
                source: 'CANDIDATE_DECLARED',
                usageContext: entry.usageContext,
                yearsExperience: entry.yearsExperience,
                notes: entry.notes,
                updatedAt: new Date(),
              })
              .where(eq(candidateSkills.id, existing.id));
          }
        } else {
          await tx
            .insert(candidateSkills)
            .values({
              tenantId: context.tenantId,
              candidateId,
              skillId: entry.globalSkill.id,
              category: _mapCatalogCategoryToDbEnum(entry.catalogSkill.category) || 'TOOL',
              provenanceStatus: entry.provenanceStatus,
              confidenceScore: 0.0,
              evidenceCount: 0,
              proficiency: entry.proficiency,
              source: 'CANDIDATE_DECLARED',
              usageContext: entry.usageContext,
              yearsExperience: entry.yearsExperience,
              notes: entry.notes,
              firstObservedAt: new Date(),
              lastObservedAt: new Date(),
              metadata: {
                source: 'CANDIDATE_DECLARED',
                isUserClaim: true,
                catalogSkillSlug: entry.catalogSkill.slug,
                catalogSkillName: entry.catalogSkill.canonicalName,
              },
            });
        }
      }
    });

    return await this.listAdditionalSkills(context, candidateId);
  }

  /**
   * Gets a combined view of all candidate skills (evidence-backed + additional).
   * Evidence-backed skills are prioritized, additional skills fill gaps.
   *
   * @param {object} context
   * @param {string} candidateId
   * @returns {Promise<{ evidenceBackedSkills: Array, additionalSkills: Array, learningSkills: Array }>}
   */
  async getCombinedSkillView(context, candidateId) {
    this._validateContext(context);

    const allRows = await this._db
      .select({
        cs: candidateSkills,
        skillSlug: skills.slug,
        skillName: skills.name,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(
          eq(candidateSkills.tenantId, context.tenantId),
          eq(candidateSkills.candidateId, candidateId)
        )
      )
      .orderBy(desc(candidateSkills.confidenceScore), desc(candidateSkills.lastObservedAt));

    const evidenceBackedSkills = [];
    const additionalSkills = [];
    const learningSkills = [];

    for (const { cs, skillSlug, skillName } of allRows) {
      const skillData = {
        id: cs.id,
        skillId: cs.skillId,
        skillSlug,
        skillName,
        category: cs.category,
        provenanceStatus: cs.provenanceStatus,
        confidenceScore: cs.confidenceScore,
        evidenceCount: cs.evidenceCount,
        proficiency: cs.proficiency,
        source: cs.source,
        usageContext: cs.usageContext,
        yearsExperience: cs.yearsExperience,
        notes: cs.notes,
        metadata: cs.metadata || {},
      };

      if (cs.provenanceStatus === 'LEARNING') {
        learningSkills.push(skillData);
      } else if (cs.source === 'CANDIDATE_DECLARED' || cs.provenanceStatus === 'SELF_DECLARED') {
        additionalSkills.push(skillData);
      } else {
        evidenceBackedSkills.push(skillData);
      }
    }

    return { evidenceBackedSkills, additionalSkills, learningSkills };
  }

  /**
   * Updates proficiency or metadata for an existing additional skill.
   *
   * @param {object} context
   * @param {string} candidateId
   * @param {string} skillId - candidate_skills UUID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>}
   */
  async updateAdditionalSkill(context, candidateId, skillId, updates) {
    this._validateContext(context);

    if (!candidateId) throw new ValidationError('candidateId is required');
    if (!skillId) throw new ValidationError('skillId is required');

    const [existing] = await this._db
      .select()
      .from(candidateSkills)
      .where(
        and(
          eq(candidateSkills.id, skillId),
          eq(candidateSkills.tenantId, context.tenantId),
          eq(candidateSkills.candidateId, candidateId)
        )
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError(`Candidate skill not found: ${skillId}`);
    }

    if (existing.source !== 'CANDIDATE_DECLARED') {
      throw new ValidationError('Only candidate-declared skills can be updated');
    }

    const setFields = { updatedAt: new Date() };

    if (updates.proficiency !== undefined) {
      if (!Object.values(PROFICIENCY_LEVELS).includes(updates.proficiency)) {
        throw new ValidationError(`Invalid proficiency: ${updates.proficiency}`);
      }
      setFields.proficiency = updates.proficiency;
      // If changed to CURRENTLY_LEARNING, update provenance
      if (updates.proficiency === 'CURRENTLY_LEARNING') {
        setFields.provenanceStatus = 'LEARNING';
      } else if (existing.provenanceStatus === 'LEARNING') {
        setFields.provenanceStatus = 'SELF_DECLARED';
      }
    }

    if (updates.usageContext !== undefined) {
      setFields.usageContext = updates.usageContext;
    }

    if (updates.yearsExperience !== undefined) {
      setFields.yearsExperience = updates.yearsExperience;
    }

    if (updates.notes !== undefined) {
      setFields.notes = updates.notes;
    }

    const [updated] = await this._db
      .update(candidateSkills)
      .set(setFields)
      .where(eq(candidateSkills.id, skillId))
      .returning();

    return updated;
  }

  /**
   * Finds or creates a global skill record from a catalog entry.
   * @private
   */
  async _findOrCreateGlobalSkill(catalogSkill, tx = null) {
    const db = tx || this._db;
    // Check if global skill already exists
    const existing = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, catalogSkill.slug))
      .limit(1);

    if (existing.length > 0) return existing[0];

    // Map fine-grained category to DB enum value
    const fineCategory = SkillTaxonomyEngine.classifyCategory(catalogSkill.slug, 'TOOL');
    const DB_CATEGORY_MAP = {
      CORE_LANGUAGE: 'LANGUAGE', LANGUAGE: 'LANGUAGE',
      FRAMEWORK: 'FRAMEWORK',
      DATABASE: 'DATABASE',
      CLOUD: 'CLOUD_DEVOPS', CLOUD_DEVOPS: 'CLOUD_DEVOPS',
      PROTOCOL: 'TOOL', PLATFORM: 'TOOL', AI_ML: 'TOOL', TOOL: 'TOOL',
      LIBRARY: 'TOOL', UI_COMPONENT: 'TOOL', UTILITY_PACKAGE: 'TOOL',
      DEV_HELPER: 'TOOL', BUILT_IN_MODULE: 'TOOL',
      ARCHITECTURE: 'ARCHITECTURE', CONCEPT: 'CONCEPT',
      OTHER: 'TOOL',
    };
    const dbCategory = DB_CATEGORY_MAP[fineCategory] || 'TOOL';

    // Create global skill record
    const [created] = await db
      .insert(skills)
      .values({
        slug: catalogSkill.slug,
        name: catalogSkill.canonicalName,
        category: dbCategory,
        aliases: catalogSkill.aliases || [],
        description: catalogSkill.description,
      })
      .returning();

    return created;
  }
}
