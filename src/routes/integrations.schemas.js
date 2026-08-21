/**
 * @file GitHub App Integration Routes Validation Schemas (Zod)
 */

import { z } from 'zod';

export const githubInstallCallbackQuerySchema = z.object({
  installation_id: z.coerce
    .number()
    .int()
    .positive({ message: 'installation_id must be a positive integer' }),
  setup_action: z.enum(['install', 'update', 'request']).optional().default('install'),
  state: z.string().optional(),
});
