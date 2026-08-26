/**
 * @file Candidate Routes (Repository Sync)
 *
 * Exposes authenticated endpoints for candidate repository synchronization.
 * Protected by session authentication and CSRF verification.
 */

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates } from '../db/schema.js';
import { authenticate, verifyCsrf } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  SyncRepositoriesBodySchema,
  CandidateEvidenceQuerySchema,
  CandidateEvidenceItemParamsSchema,
  DeleteCandidateResourceParamsSchema,
} from './candidate.schemas.js';
import { CandidateRepositoryIngestionService } from '../services/candidate-repository-ingestion.service.js';
import { dataSovereigntyService as defaultSovereigntyService } from '../services/data-sovereignty.service.js';
import { NotFoundError, ValidationError } from '../errors/index.js';

/**
 * Registers candidate-scoped routes under the /candidate prefix.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} [opts={}]
 */
export default async function candidateRoutes(fastify, opts = {}) {
  const database = opts.db || defaultDb;
  const ingestionService =
    opts.ingestionService || new CandidateRepositoryIngestionService({ db: database });
  const sovereigntyService = opts.dataSovereigntyService || defaultSovereigntyService;

  /**
   * POST /candidate/sync-repositories
   *
   * Triggers repository synchronization for the authenticated user's candidate profile.
   */
  fastify.post(
    '/sync-repositories',
    {
      preHandler: [authenticate, verifyCsrf],
    },
    async (request, reply) => {
      const tenantId = request.auth.tenantId;
      const userId = request.auth.userId;

      // Validate request body
      const bodyResult = SyncRepositoriesBodySchema.safeParse(request.body || {});
      if (!bodyResult.success) {
        throw new ValidationError(
          `Invalid request body: ${bodyResult.error.issues.map((i) => i.message).join(', ')}`
        );
      }
      const { resourceId } = bodyResult.data;

      // Resolve candidate from authenticated user
      const [candidate] = await database
        .select()
        .from(candidates)
        .where(and(eq(candidates.tenantId, tenantId), eq(candidates.userId, userId)));

      if (!candidate) {
        throw new NotFoundError(
          'No candidate profile found for authenticated user. Please complete GitHub setup first.'
        );
      }

      // Execute sync pipeline
      const result = await ingestionService.syncCandidateRepositories({
        context: { tenantId, userId },
        candidateId: candidate.id,
        options: { resourceId },
      });

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /candidate/evidence — Inspect paginated indexed evidence with provenance citations
   */
  fastify.get(
    '/evidence',
    {
      preHandler: [authenticate, validateRequest({ query: CandidateEvidenceQuerySchema })],
    },
    async (request, reply) => {
      const context = {
        tenantId: request.auth.tenantId,
        userId: request.auth.userId,
      };

      const result = await sovereigntyService.getIndexedEvidence(
        context,
        {
          skillId: request.query.skillId,
          projectId: request.query.projectId,
          resourceId: request.query.resourceId,
          evidenceType: request.query.evidenceType,
        },
        {
          limit: request.query.limit,
          offset: request.query.offset,
        }
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * GET /candidate/evidence/:id — Inspect single evidence provenance item
   */
  fastify.get(
    '/evidence/:id',
    {
      preHandler: [authenticate, validateRequest({ params: CandidateEvidenceItemParamsSchema })],
    },
    async (request, reply) => {
      const context = {
        tenantId: request.auth.tenantId,
        userId: request.auth.userId,
      };

      const result = await sovereigntyService.getEvidenceItem(context, request.params.id);

      return reply.status(200).send(result);
    }
  );

  /**
   * DELETE /candidate/resources/:id — Delete indexed repository resource & cascade evidence
   */
  fastify.delete(
    '/resources/:id',
    {
      preHandler: [
        authenticate,
        verifyCsrf,
        validateRequest({ params: DeleteCandidateResourceParamsSchema }),
      ],
    },
    async (request, reply) => {
      const context = {
        tenantId: request.auth.tenantId,
        userId: request.auth.userId,
      };

      const result = await sovereigntyService.deleteIndexedResource(context, request.params.id, {
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(200).send(result);
    }
  );
}
