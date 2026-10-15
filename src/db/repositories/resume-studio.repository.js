import { and, eq } from 'drizzle-orm';
import { candidates, auditLogs } from '../schema.js';
import { resumeStudioDrafts, resumeStudioRevisions } from '../resume-studio.schema.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';

export class ResumeStudioRepository {
  constructor(database) {
    this.db = database;
  }

  async getOwned(context, id, lock = false) {
    const query = this.db
      .select({ draft: resumeStudioDrafts })
      .from(resumeStudioDrafts)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, resumeStudioDrafts.candidateId),
          eq(candidates.tenantId, resumeStudioDrafts.tenantId),
          eq(candidates.userId, resumeStudioDrafts.userId)
        )
      )
      .where(
        and(
          eq(resumeStudioDrafts.id, id),
          eq(resumeStudioDrafts.tenantId, context.tenantId),
          eq(resumeStudioDrafts.userId, context.userId),
          eq(candidates.status, 'ACTIVE')
        )
      );
    const [row] = await (lock ? query.for('update', { of: resumeStudioDrafts }) : query);
    if (!row) throw new NotFoundError('Draft not found');
    return row.draft;
  }

  async insert(row) {
    const [created] = await this.db.insert(resumeStudioDrafts).values(row).returning();
    return created;
  }

  async compareAndSwap(context, row, updates) {
    const [updated] = await this.db
      .update(resumeStudioDrafts)
      .set(updates)
      .where(
        and(
          eq(resumeStudioDrafts.id, row.id),
          eq(resumeStudioDrafts.tenantId, context.tenantId),
          eq(resumeStudioDrafts.userId, context.userId),
          eq(resumeStudioDrafts.revision, row.revision)
        )
      )
      .returning();
    if (!updated)
      throw new ConflictError('Draft revision no longer current', [
        { reason: 'DRAFT_REVISION_CONFLICT' },
      ]);
    return updated;
  }

  async appendRevision(row, context, action) {
    await this.db.insert(resumeStudioRevisions).values({
      draftId: row.id,
      revision: row.revision,
      contentHash: row.contentHash,
      encryptedContent: row.encryptedContent,
    });
    await this.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      userId: context.userId,
      eventType: 'resume_studio.' + action,
      resourceType: 'resume_studio_draft',
      resourceId: row.id,
      details: {
        revision: row.revision,
        contentHash: row.contentHash,
        sourceSnapshotHash: row.sourceSnapshotHash,
      },
    });
  }
}
