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
import { SyncRepositoriesBodySchema } from './candidate.schemas.js';
import { CandidateRepositoryIngestionService } from '../services/candidate-repository-ingestion.service.js';
import { NotFoundError, ValidationError } from '../errors/index.js';

/**
 * Registers candidate-scoped routes under the /candidate prefix.
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} opts
 */
export default async function candidateRoutes(fastify, opts) {
  const database = opts.db || defaultDb;
  const ingestionService =
    opts.ingestionService || new CandidateRepositoryIngestionService({ db: database });

  /**
   * POST /candidate/sync-repositories
   *
   * Triggers repository synchronization for the authenticated user's candidate profile.
   * Executes the full pipeline:
   *   Connected Resource → Deep Extraction → Project Genesis → Evidence Linking → Verified Skill Rollup
   *
   * Authentication: Session cookie required
   * CSRF: Origin header validated on POST
   * Body (optional): { resourceId?: string } to sync a specific resource
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
}
