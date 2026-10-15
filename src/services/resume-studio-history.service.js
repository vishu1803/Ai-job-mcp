import { and, eq, desc } from 'drizzle-orm';
import { ResumeStudioDraftService } from './resume-studio-draft.service.js';
import { ResumeStudioRepository } from '../db/repositories/resume-studio.repository.js';
import { resumeStudioRevisions } from '../db/resume-studio.schema.js';
import { StudioRestoreRequestSchema } from '../domain/career/resume-studio-document.schemas.js';
import { StudioDraftParamsSchema } from '../domain/career/resume-studio-draft.schemas.js';
import {
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
} from '../errors/index.js';
import { hashStudioContent, encryptStudioPayload } from './resume-studio-draft-content.js';

export class ResumeStudioHistoryService {
  constructor({ database }) {
    this.db = database;
    this.drafts = new ResumeStudioDraftService({ database });
  }
  async list(context, id) {
    if (!StudioDraftParamsSchema.safeParse({ id }).success)
      throw new ValidationError('Invalid draft ID');
    return this.db.transaction(async (tx) => {
      const row = await new ResumeStudioRepository(tx).getOwned(context, id, true);
      const draft = this.drafts._response(row);
      const revisions = await tx
        .select({
          revision: resumeStudioRevisions.revision,
          contentHash: resumeStudioRevisions.contentHash,
          createdAt: resumeStudioRevisions.createdAt,
        })
        .from(resumeStudioRevisions)
        .where(eq(resumeStudioRevisions.draftId, id))
        .orderBy(desc(resumeStudioRevisions.revision))
        .limit(200);
      return {
        contractVersion: '1.3.0',
        draftId: draft.id,
        currentRevision: draft.revision,
        revisions: revisions.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      };
    });
  }
  async get(context, id, revision) {
    await this.drafts.get(context, id);
    if (!Number.isInteger(revision) || revision < 1 || revision > 2147483646)
      throw new ValidationError('Invalid history revision');
    const row = await new ResumeStudioRepository(this.db).getOwned(context, id);
    const [past] = await this.db
      .select()
      .from(resumeStudioRevisions)
      .where(
        and(eq(resumeStudioRevisions.draftId, id), eq(resumeStudioRevisions.revision, revision))
      );
    if (!past) throw new NotFoundError('Draft revision not found');
    return this.drafts._response({
      ...row,
      revision: past.revision,
      contentHash: past.contentHash,
      encryptedContent: past.encryptedContent,
      updatedAt: past.createdAt,
    });
  }
  async restore(context, id, input) {
    if (!['OWNER', 'MEMBER'].includes(context.role))
      throw new AuthorizationError('Write permission required');
    const parsed = StudioRestoreRequestSchema.safeParse(input);
    if (!parsed.success || !StudioDraftParamsSchema.safeParse({ id }).success)
      throw new ValidationError('Invalid restore request');
    return this.db.transaction(async (tx) => {
      const repo = new ResumeStudioRepository(tx),
        row = await repo.getOwned(context, id, true);
      if (row.revision !== parsed.data.expectedRevision)
        throw new ConflictError('Draft changed', [
          {
            reason: 'DRAFT_REVISION_CONFLICT',
            expectedRevision: parsed.data.expectedRevision,
            actualRevision: row.revision,
          },
        ]);
      const [past] = await tx
        .select()
        .from(resumeStudioRevisions)
        .where(
          and(
            eq(resumeStudioRevisions.draftId, id),
            eq(resumeStudioRevisions.revision, parsed.data.restoreRevision)
          )
        );
      if (!past) throw new NotFoundError('Draft revision not found');
      const payload = this.drafts._decode({
        ...row,
        revision: past.revision,
        contentHash: past.contentHash,
        encryptedContent: past.encryptedContent,
      }).payload;
      const next = row.revision + 1;
      for (const provenance of Object.values(payload.nodeProvenance))
        if (provenance.editedAtRevision !== null) provenance.editedAtRevision = next;
      const updated = await repo.compareAndSwap(context, row, {
        revision: next,
        contentHash: hashStudioContent(payload),
        updatedAt: new Date(),
        encryptedContent: encryptStudioPayload({
          binding: {
            id: row.id,
            tenantId: row.tenantId,
            userId: row.userId,
            candidateId: row.candidateId,
            revision: next,
            sourceSnapshotHash: row.sourceSnapshotHash,
          },
          payload,
        }),
      });
      await repo.appendRevision(updated, context, 'draft_restored');
      return this.drafts._response(updated);
    });
  }
}
