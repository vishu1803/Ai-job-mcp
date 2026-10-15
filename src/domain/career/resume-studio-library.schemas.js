import { z } from 'zod';
export const StudioLibraryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export const StudioLibraryResponseSchema = z
  .object({
    contractVersion: z.literal('1.4.0'),
    drafts: z.array(
      z
        .object({
          id: z.string().uuid(),
          revision: z.number().int().positive(),
          sourceResumeId: z.string().uuid(),
          sourceVersion: z.number().int().positive(),
          title: z.string(),
          company: z.string(),
          updatedAt: z.string().datetime(),
          href: z.string(),
        })
        .strict()
    ),
    nextOffset: z.number().int().nonnegative().nullable(),
  })
  .strict();
