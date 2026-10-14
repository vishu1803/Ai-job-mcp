import { and, eq } from 'drizzle-orm';
import { resumeStudioProposals } from '../resume-studio.schema.js';
import { auditLogs } from '../schema.js';
import { NotFoundError, ConflictError } from '../../errors/index.js';

/** Call only AFTER acquiring the owned draft. All mutations lock draft first,
 * proposal second, so decisions/manual edits have one authoritative order. */
export class ResumeStudioProposalRepository {
  constructor(database) {
    this.db = database;
  }
  async get(draftId, id, lock = false) {
    const query = this.db
      .select()
      .from(resumeStudioProposals)
      .where(and(eq(resumeStudioProposals.id, id), eq(resumeStudioProposals.draftId, draftId)));
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw new NotFoundError('Proposal not found');
    return row;
  }
  async insert(row) {
    const [created] = await this.db.insert(resumeStudioProposals).values(row).returning();
    return created;
  }
  async decide(row, decision, revision) {
    const [updated] = await this.db
      .update(resumeStudioProposals)
      .set({
        status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
        decisionRevision: revision,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(resumeStudioProposals.id, row.id),
          eq(resumeStudioProposals.draftId, row.draftId),
          eq(resumeStudioProposals.status, 'PENDING')
        )
      )
      .returning();
    if (!updated)
      throw new ConflictError('Proposal was already decided', [
        { reason: 'PROPOSAL_ALREADY_DECIDED' },
      ]);
    return updated;
  }
  async audit(context, row, eventType) {
    await this.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      userId: context.userId,
      eventType,
      resourceType: 'resume_studio_proposal',
      resourceId: row.id,
      details: {
        draftId: row.draftId,
        baseRevision: row.baseRevision,
        status: row.status,
        decisionRevision: row.decisionRevision,
        payloadHash: row.payloadHash,
      },
    });
  }
}
