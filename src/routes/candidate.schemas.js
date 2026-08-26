/**
 * @file Candidate Route Zod Schemas
 *
 * Request/response validation schemas for candidate sync operations.
 */

import { z } from 'zod';

/**
 * POST /candidate/sync-repositories request body schema.
 * Optional resourceId to sync a specific repository; omit to sync all.
 */
export const SyncRepositoriesBodySchema = z
  .object({
    resourceId: z.string().uuid('resourceId must be a valid UUID').optional(),
  })
  .strict()
  .optional()
  .default({});

/**
 * Sync repositories response schema.
 */
export const SyncRepositoriesResponseSchema = z.object({
  repositoriesProcessed: z.number().int().min(0),
  projectsCreated: z.number().int().min(0),
  projectsUpdated: z.number().int().min(0),
  evidenceCreated: z.number().int().min(0),
  evidenceLinked: z.number().int().min(0),
  verifiedSkillsAdded: z.number().int().min(0),
  verifiedSkills: z.array(z.string()),
  warnings: z.array(z.string()),
  durationMs: z.number().int().min(0),
});

/**
 * GET /candidate/evidence query parameters schema.
 */
export const CandidateEvidenceQuerySchema = z
  .object({
    skillId: z.string().uuid('skillId must be a valid UUID').optional(),
    projectId: z.string().uuid('projectId must be a valid UUID').optional(),
    resourceId: z.string().uuid('resourceId must be a valid UUID').optional(),
    evidenceType: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20).optional(),
    offset: z.coerce.number().int().min(0).default(0).optional(),
  })
  .strict();

/**
 * GET /candidate/evidence/:id URL params schema.
 */
export const CandidateEvidenceItemParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();

/**
 * DELETE /candidate/resources/:id URL params schema.
 */
export const DeleteCandidateResourceParamsSchema = z
  .object({
    id: z.string().uuid('id must be a valid UUID'),
  })
  .strict();
