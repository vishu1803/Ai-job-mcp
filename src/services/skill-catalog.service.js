/**
 * @file Skill Catalog Service
 *
 * Provides CRUD and search operations for the canonical skill catalog.
 * The catalog is the single source of truth for the "Additional Skills" UI.
 *
 * Key responsibilities:
 * - Seed the skill_catalog table from SKILL_CATALOG_SEED on first run
 * - Search skills by name, slug, or alias (case-insensitive)
 * - Filter by category and subcategory
 * - Return paginated results for the UI
 * - Resolve alias to canonical skill
 */

import { eq, and, or, ilike, asc, sql, inArray } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { skillCatalog } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { SKILL_CATALOG_SEED } from './skill-catalog.seed.js';

export class SkillCatalogService {
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
   * Seeds the skill_catalog table from SKILL_CATALOG_SEED if empty.
   * Safe to call multiple times (idempotent via slug upsert).
   *
   * @returns {Promise<{ inserted: number, existing: number }>}
   */
  async seedCatalog() {
    const existingCount = await this._db
      .select({ count: sql`count(*)::int` })
      .from(skillCatalog)
      .then((rows) => Number(rows[0]?.count || 0));

    if (existingCount >= SKILL_CATALOG_SEED.length) {
      return { inserted: 0, existing: existingCount };
    }

    let inserted = 0;
    for (const entry of SKILL_CATALOG_SEED) {
      try {
        const existing = await this._db
          .select({ id: skillCatalog.id })
          .from(skillCatalog)
          .where(eq(skillCatalog.slug, entry.slug))
          .limit(1);

        if (existing.length === 0) {
          await this._db.insert(skillCatalog).values({
            canonicalName: entry.canonicalName,
            slug: entry.slug,
            category: entry.category,
            subcategory: entry.subcategory || null,
            skillType: entry.skillType || 'TECHNOLOGY',
            description: entry.description || null,
            aliases: entry.aliases || [],
            active: true,
            sortOrder: entry.sortOrder || 0,
            metadata: {},
          });
          inserted++;
        }
      } catch (err) {
        logger.warn({ slug: entry.slug, err }, 'Failed to seed skill catalog entry');
      }
    }

    logger.info({ inserted, existing: existingCount }, 'Skill catalog seed completed');
    return { inserted, existing: existingCount };
  }

  /**
   * Searches the skill catalog by query string (matches name, slug, or alias).
   *
   * @param {object} params
   * @param {string} params.query - Search query
   * @param {string} [params.category] - Filter by category
   * @param {string} [params.subcategory] - Filter by subcategory
   * @param {number} [params.page=1] - Page number
   * @param {number} [params.pageSize=20] - Page size
   * @returns {Promise<{ items: Array, total: number, page: number, pageSize: number, totalPages: number }>}
   */
  async searchSkills({ query = '', category = null, subcategory = null, page = 1, pageSize = 20 }) {
    const conditions = [eq(skillCatalog.active, true)];

    if (query && query.trim()) {
      const searchTerm = `%${query.trim()}%`;
      conditions.push(
        or(
          ilike(skillCatalog.canonicalName, searchTerm),
          ilike(skillCatalog.slug, searchTerm),
          sql`${skillCatalog.aliases}::text ILIKE ${searchTerm}`
        )
      );
    }

    if (category) {
      conditions.push(eq(skillCatalog.category, category));
    }

    if (subcategory) {
      conditions.push(eq(skillCatalog.subcategory, subcategory));
    }

    // Total count
    const [{ total }] = await this._db
      .select({ total: sql`count(*)::int` })
      .from(skillCatalog)
      .where(and(...conditions));

    const totalCount = Number(total);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const offset = (page - 1) * pageSize;

    // Fetch paginated results
    const items = await this._db
      .select()
      .from(skillCatalog)
      .where(and(...conditions))
      .orderBy(asc(skillCatalog.sortOrder), asc(skillCatalog.canonicalName))
      .offset(offset)
      .limit(pageSize);

    return {
      items,
      total: totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Resolves a raw skill name/alias to a canonical catalog entry.
   *
   * @param {string} rawInput - Raw skill name or alias
   * @returns {Promise<object|null>} Canonical catalog entry or null
   */
  async resolveSkill(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return null;

    const normalized = rawInput.trim().toLowerCase();
    if (!normalized) return null;

    // Try slug match first
    const bySlug = await this._db
      .select()
      .from(skillCatalog)
      .where(and(eq(skillCatalog.slug, normalized), eq(skillCatalog.active, true)))
      .limit(1);

    if (bySlug.length > 0) return bySlug[0];

    // Try canonical name match (case-insensitive)
    const byName = await this._db
      .select()
      .from(skillCatalog)
      .where(and(ilike(skillCatalog.canonicalName, normalized), eq(skillCatalog.active, true)))
      .limit(1);

    if (byName.length > 0) return byName[0];

    // Try alias match
    const searchTerm = `%${normalized}%`;
    const byAlias = await this._db
      .select()
      .from(skillCatalog)
      .where(and(sql`${skillCatalog.aliases}::text ILIKE ${searchTerm}`, eq(skillCatalog.active, true)))
      .limit(1);

    return byAlias.length > 0 ? byAlias[0] : null;
  }

  /**
   * Returns all unique categories with skill counts.
   *
   * @returns {Promise<Array<{ category: string, count: number }>>}
   */
  async getCategories() {
    return this._db
      .select({
        category: skillCatalog.category,
        count: sql`count(*)::int`,
      })
      .from(skillCatalog)
      .where(eq(skillCatalog.active, true))
      .groupBy(skillCatalog.category)
      .orderBy(asc(skillCatalog.category));
  }

  /**
   * Returns subcategories for a given category.
   *
   * @param {string} category
   * @returns {Promise<Array<{ subcategory: string, count: number }>>}
   */
  async getSubcategories(category) {
    return this._db
      .select({
        subcategory: skillCatalog.subcategory,
        count: sql`count(*)::int`,
      })
      .from(skillCatalog)
      .where(and(eq(skillCatalog.active, true), eq(skillCatalog.category, category)))
      .groupBy(skillCatalog.subcategory)
      .orderBy(asc(skillCatalog.subcategory));
  }

  /**
   * Returns a single skill by ID.
   *
   * @param {string} skillId
   * @returns {Promise<object|null>}
   */
  async getSkillById(skillId) {
    const rows = await this._db
      .select()
      .from(skillCatalog)
      .where(eq(skillCatalog.id, skillId))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Returns multiple skills by their IDs.
   *
   * @param {string[]} skillIds
   * @returns {Promise<object[]>}
   */
  async getSkillsByIds(skillIds) {
    if (!Array.isArray(skillIds) || skillIds.length === 0) return [];
    return this._db
      .select()
      .from(skillCatalog)
      .where(inArray(skillCatalog.id, skillIds));
  }

  /**
   * Returns total catalog count.
   *
   * @returns {Promise<number>}
   */
  async getCount() {
    const [{ total }] = await this._db
      .select({ total: sql`count(*)::int` })
      .from(skillCatalog)
      .where(eq(skillCatalog.active, true));
    return Number(total);
  }
}
