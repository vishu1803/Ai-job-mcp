/**
 * @file Account Routes Zod Validation Schemas (Phase 13 / P13-002)
 */

import { z } from 'zod';

export const DeleteAccountBodySchema = z
  .object({
    confirmPhrase: z
      .string({ required_error: 'confirmPhrase is required' })
      .refine((val) => val === 'DELETE MY ACCOUNT', {
        message: 'confirmPhrase must be exactly "DELETE MY ACCOUNT"',
      }),
  })
  .strict();

export const DeleteAccountResponseSchema = z.object({
  message: z.string(),
  tenantId: z.string().uuid(),
});
