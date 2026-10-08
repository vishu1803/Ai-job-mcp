/**
 * @file GitHub App Integration Routes Validation Schemas (Zod)
 */

import { z } from 'zod';

export const githubInstallCallbackQuerySchema = z.object({
  installation_id: z.coerce
    .number()
    .int()
    .safe()
    .positive({ message: 'installation_id must be a positive integer' }),
  setup_action: z.enum(['install', 'update']).optional().default('install'),
  state: z.string().min(1).max(4096),
});

export const githubAuthorizeCallbackQuerySchema = z.object({
  code: z.string().min(1).max(1024),
  state: z.string().min(1).max(4096),
  installation_id: z.coerce.number().int().safe().positive().optional(),
});
