import { z } from 'zod';
import { StudioAnalyzeResponseSchema } from './resume-studio.schemas.js';
import { StudioProposalResponseSchema } from './resume-studio-proposal.schemas.js';
const revision = z.number().int().min(1).max(2147483646);
export const StudioRevisionRequestSchema = z.object({ expectedRevision: revision }).strict();
export const StudioRestoreRequestSchema = StudioRevisionRequestSchema.extend({
  restoreRevision: revision,
}).strict();
export const StudioExportRequestSchema = StudioRevisionRequestSchema.extend({
  documentId: z.string().uuid(),
  format: z.enum(['PDF', 'DOCX']),
}).strict();
export const StudioApprovalRequestSchema = StudioRevisionRequestSchema.extend({
  documentId: z.string().uuid(),
  reviewed: z.literal(true),
}).strict();
export const StudioDocumentParamsSchema = z
  .object({ id: z.string().uuid(), documentId: z.string().uuid(), format: z.enum(['pdf', 'png']) })
  .strict();
export const StudioDocumentResponseSchema = z
  .object({
    contractVersion: z.literal('1.3.0'),
    id: z.string().uuid(),
    draftId: z.string().uuid(),
    revision,
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    pdfHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['READY', 'NEEDS_REVIEW']),
    createdAt: z.string().datetime(),
    verification: z
      .object({
        pageCount: z.number().int().positive(),
        a4: z.boolean(),
        minimumFontPt: z.number().positive(),
        fontsEmbedded: z.boolean(),
        unicodeMaps: z.boolean(),
        wordSpacing: z.boolean(),
        textPreserved: z.boolean(),
        readingOrder: z.boolean(),
        noClipping: z.boolean(),
        noOverlaps: z.boolean(),
        glyphsSafe: z.boolean(),
        docxTextPreserved: z.boolean(),
        marginIn: z.number().min(0.5).max(0.6),
        lineHeight: z.number().min(1.1).max(1.25),
        compiler: z.literal('chrome_headless'),
        failedChecks: z.array(z.string()),
      })
      .strict(),
    pageMap: z.array(
      z
        .object({
          nodeId: z.string().uuid(),
          pageIndex: z.number().int().nonnegative(),
          bounds: z
            .object({
              top: z.number(),
              left: z.number(),
              width: z.number().positive(),
              height: z.number().positive(),
            })
            .strict(),
        })
        .strict()
    ),
    previewPdfUrl: z.string(),
    previewImageUrl: z.string(),
  })
  .strict();
export const StudioHistoryResponseSchema = z
  .object({
    contractVersion: z.literal('1.3.0'),
    draftId: z.string().uuid(),
    currentRevision: revision,
    revisions: z
      .array(
        z
          .object({
            revision,
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            createdAt: z.string().datetime(),
          })
          .strict()
      )
      .max(200),
  })
  .strict();
export const StudioDiagnosticsResponseSchema = z
  .object({
    contractVersion: z.literal('1.3.0'),
    draftId: z.string().uuid(),
    revision,
    analysis: StudioAnalyzeResponseSchema,
  })
  .strict();
export const StudioProposalListResponseSchema = z
  .object({
    contractVersion: z.literal('1.2.0'),
    draftId: z.string().uuid(),
    revision,
    proposals: z.array(StudioProposalResponseSchema).max(50),
  })
  .strict();
export const StudioApprovalResponseSchema = z
  .object({
    contractVersion: z.literal('1.3.0'),
    applicationId: z.string().uuid(),
    packageVersion: revision,
    packageHash: z.string().regex(/^[a-f0-9]{64}$/),
    approvalTicketId: z.string().uuid(),
    status: z.literal('APPROVED'),
    expiresAt: z.string().datetime(),
    documentId: z.string().uuid(),
  })
  .strict();
