/**
 * @file Skill Catalog & Additional Skills Routes
 *
 * Exposes authenticated endpoints for:
 * - Skill catalog search/browse (public read)
 * - Candidate additional skills CRUD (authenticated write)
 */

import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates } from '../db/schema.js';
import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { SkillCatalogService } from '../services/skill-catalog.service.js';
import { CandidateAdditionalSkillsService } from '../services/candidate-additional-skills.service.js';
import { ValidationError, NotFoundError } from '../errors/index.js';

/**
 * Registers skill catalog and additional skills routes.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} [opts={}]
 */
export default async function skillRoutes(fastify, opts = {}) {
  const database = opts.db || defaultDb;
  const catalogService = opts.catalogService || new SkillCatalogService(database);
  const additionalSkillsService =
    opts.additionalSkillsService || new CandidateAdditionalSkillsService(database);

  // =========================================================================
  // Public: Skill Catalog (read-only)
  // =========================================================================

  /**
   * GET /skills/catalog
   * Search the skill catalog by query, category, subcategory.
   */
  fastify.get('/catalog', async (request, reply) => {
    const { q, category, subcategory, page, pageSize } = request.query || {};

    const result = await catalogService.searchSkills({
      query: q || '',
      category: category || null,
      subcategory: subcategory || null,
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
    });

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  /**
   * GET /skills/catalog/categories
   * Returns all skill categories with counts.
   */
  fastify.get('/catalog/categories', async (_request, reply) => {
    const categories = await catalogService.getCategories();
    return reply.status(200).send({
      success: true,
      data: categories,
    });
  });

  /**
   * GET /skills/catalog/subcategories/:category
   * Returns subcategories for a given category.
   */
  fastify.get('/catalog/subcategories/:category', async (request, reply) => {
    const { category } = request.params;
    if (!category) throw new ValidationError('category is required');

    const subcategories = await catalogService.getSubcategories(category);
    return reply.status(200).send({
      success: true,
      data: subcategories,
    });
  });

  /**
   * GET /skills/catalog/resolve/:name
   * Resolves a raw skill name/alias to a canonical catalog entry.
   */
  fastify.get('/catalog/resolve/:name', async (request, reply) => {
    const { name } = request.params;
    if (!name) throw new ValidationError('name is required');

    const resolved = await catalogService.resolveSkill(name);
    if (!resolved) {
      throw new NotFoundError(`No catalog entry found for: ${name}`);
    }

    return reply.status(200).send({
      success: true,
      data: resolved,
    });
  });

  // =========================================================================
  // Authenticated: Candidate Additional Skills
  // =========================================================================

  /**
   * GET /skills/additional
   * Lists the authenticated candidate's additional (self-declared) skills.
   */
  fastify.get(
    '/additional',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;

      const candidateId = await _resolveCandidateId(database, tenantId, userId);

      const skills = await additionalSkillsService.listAdditionalSkills(
        { tenantId },
        candidateId
      );

      return reply.status(200).send({
        success: true,
        data: skills,
      });
    }
  );

  /**
   * GET /skills/combined
   * Returns the combined skill view: evidence-backed + additional + learning.
   */
  fastify.get(
    '/combined',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;

      const candidateId = await _resolveCandidateId(database, tenantId, userId);

      const view = await additionalSkillsService.getCombinedSkillView(
        { tenantId },
        candidateId
      );

      return reply.status(200).send({
        success: true,
        data: view,
      });
    }
  );

  /**
   * POST /skills/additional
   * Adds a skill to the candidate's additional skills.
   */
  fastify.post(
    '/additional',
    { preHandler: [verifyCsrf, authenticate] },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;

      const candidateId = await _resolveCandidateId(database, tenantId, userId);

      const body = request.body || {};
      if (!body.catalogSkillId) {
        throw new ValidationError('catalogSkillId is required');
      }

      const result = await additionalSkillsService.addAdditionalSkill(
        { tenantId },
        candidateId,
        {
          catalogSkillId: body.catalogSkillId,
          proficiency: body.proficiency || 'WORKING_KNOWLEDGE',
          usageContext: body.usageContext || null,
          yearsExperience: body.yearsExperience || null,
          notes: body.notes || null,
        }
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * PATCH /skills/additional/:skillId
   * Updates a candidate's additional skill (proficiency, usageContext, notes).
   */
  fastify.patch(
    '/additional/:skillId',
    { preHandler: [verifyCsrf, authenticate] },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;
      const { skillId } = request.params;

      const candidateId = await _resolveCandidateId(database, tenantId, userId);

      const result = await additionalSkillsService.updateAdditionalSkill(
        { tenantId },
        candidateId,
        skillId,
        request.body || {}
      );

      return reply.status(200).send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * DELETE /skills/additional/:skillId
   * Removes a candidate's additional skill.
   */
  fastify.delete(
    '/additional/:skillId',
    { preHandler: [verifyCsrf, authenticate] },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;
      const { skillId } = request.params;

      const candidateId = await _resolveCandidateId(database, tenantId, userId);

      await additionalSkillsService.removeAdditionalSkill(
        { tenantId },
        candidateId,
        skillId
      );

      return reply.status(200).send({
        success: true,
        data: { removed: true },
      });
    }
  );
}

/**
 * Resolves candidate ID from authenticated user, with caching in request context.
 * @private
 */
async function _resolveCandidateId(database, tenantId, userId) {
  const [candidate] = await database
    .select({ id: candidates.id })
    .from(candidates)
    .where(and(eq(candidates.tenantId, tenantId), eq(candidates.userId, userId)))
    .limit(1);

  if (!candidate) {
    throw new NotFoundError('No candidate profile found. Please complete onboarding first.');
  }

  return candidate.id;
}
