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
