import crypto from 'node:crypto';
import { and, eq, desc, sql } from 'drizzle-orm';
import { ResumeStudioDraftService } from './resume-studio-draft.service.js';
import { ResumeStudioRepository } from '../db/repositories/resume-studio.repository.js';
import { resumeStudioDocuments } from '../db/resume-studio.schema.js';
import { auditLogs, applicationPackages } from '../db/schema.js';
import { compileStudioDocument } from './resume-studio-document-compiler.js';
import {
  encryptStudioPayload,
  decryptStudioPayload,
  hashStudioContent,
} from './resume-studio-draft-content.js';
import {
  StudioRevisionRequestSchema,
  StudioExportRequestSchema,
  StudioDocumentResponseSchema,
  StudioApprovalRequestSchema,
  StudioDocumentParamsSchema,
} from '../domain/career/resume-studio-document.schemas.js';
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  AppError,
} from '../errors/index.js';
import { ApplicationTrackingService } from './application-tracking.service.js';
import { JobApplicationWorkflowService } from './job-application-workflow.service.js';
import { sealGeneratedPackage } from './evidence/artifact-policy.js';

const checksum = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const parse = (schema, input) => {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError('Invalid Studio document request');
  return r.data;
};
const write = (context) => {
  if (!['OWNER', 'MEMBER'].includes(context.role))
    throw new AuthorizationError('Write permission required');
};
const current = (draft, revision) => {
  if (draft.revision !== revision)
    throw new ConflictError('Draft revision changed', [
      {
        reason: 'DRAFT_REVISION_CONFLICT',
        expectedRevision: revision,
        actualRevision: draft.revision,
      },
    ]);
};
const identity = (row) => ({
  id: row.id,
  draftId: row.draftId,
  revision: row.revision,
  contentHash: row.contentHash,
  sourceSnapshotHash: row.sourceSnapshotHash,
});

export class ResumeStudioDocumentService {
  constructor({ database, compiler = compileStudioDocument }) {
    this.db = database;
    this.compiler = compiler;
    this.drafts = new ResumeStudioDraftService({ database });
  }
  decode(row, draft) {
    try {
      const value = decryptStudioPayload(row.encryptedPayload);
      if (
        hashStudioContent(value) !== row.payloadHash ||
        hashStudioContent(value.binding) !==
          hashStudioContent({
            ...identity(row),
            tenantId: draft.tenantId,
            userId: draft.userId,
            candidateId: draft.candidateId,
          }) ||
        draft.sourceSnapshotHash !== row.sourceSnapshotHash
      )
        throw Error();
      if (value.metadata.pdfHash !== checksum(Buffer.from(value.payload.pdf, 'base64')))
        throw Error();
      return value;
    } catch {
      throw new InternalServerError(
        'Document integrity verification failed',
        'DOCUMENT_INTEGRITY_FAILED'
      );
    }
  }
  async audit(tx, context, row, action) {
    await tx.insert(auditLogs).values({
      tenantId: context.tenantId,
      userId: context.userId,
      eventType: 'resume_studio.' + action,
      resourceType: 'resume_studio_document',
      resourceId: row.id,
      details: { draftId: row.draftId, revision: row.revision, contentHash: row.contentHash },
    });
  }
  async owned(tx, context, draftId, documentId, lock = false) {
    if (!context?.tenantId || !context?.userId)
      throw new AuthorizationError('Trusted session required');
    parse(StudioDocumentParamsSchema, { id: draftId, documentId, format: 'pdf' });
    const draft = await new ResumeStudioRepository(tx).getOwned(context, draftId, lock);
    const [row] = await tx
      .select()
      .from(resumeStudioDocuments)
      .where(
        and(eq(resumeStudioDocuments.id, documentId), eq(resumeStudioDocuments.draftId, draftId))
      );
    if (!row) throw new NotFoundError('Document not found');
    return { draft, row, ...this.decode(row, draft) };
  }
  async preview(context, id, input) {
    write(context);
    const { expectedRevision } = parse(StudioRevisionRequestSchema, input);
    const snapshot = await this.drafts.get(context, id);
    current(snapshot, expectedRevision);
    const [cached] = await this.db
      .select()
      .from(resumeStudioDocuments)
      .where(
        and(
          eq(resumeStudioDocuments.draftId, id),
          eq(resumeStudioDocuments.revision, snapshot.revision)
        )
      )
      .orderBy(desc(resumeStudioDocuments.createdAt))
      .limit(1);
    if (cached)
      return this.db.transaction(async (tx) => {
        const owned = await this.owned(tx, context, id, cached.id, true);
        current(owned.draft, expectedRevision);
        return owned.metadata;
      });
    const payload = await this.compiler(snapshot);
    return this.db.transaction(async (tx) => {
      const draft = await new ResumeStudioRepository(tx).getOwned(context, id, true);
      current(draft, expectedRevision);
      if (
        draft.contentHash !== snapshot.contentHash ||
        draft.sourceSnapshotHash !== snapshot.sourceSnapshotHash
      )
        throw new ConflictError('Draft source changed', [{ reason: 'STALE_DOCUMENT' }]);
      const documentId = crypto.randomUUID(),
        row = {
          id: documentId,
          draftId: draft.id,
          revision: draft.revision,
          contentHash: draft.contentHash,
          sourceSnapshotHash: draft.sourceSnapshotHash,
        };
      const prefix = `/api/v1/resume-studio/drafts/${draft.id}/documents/${documentId}`;
      const metadata = StudioDocumentResponseSchema.parse({
        contractVersion: '1.3.0',
        id: documentId,
        draftId: draft.id,
        revision: draft.revision,
        contentHash: draft.contentHash,
        pdfHash: checksum(Buffer.from(payload.pdf, 'base64')),
        status: payload.verification.failedChecks.length ? 'NEEDS_REVIEW' : 'READY',
        createdAt: new Date().toISOString(),
        verification: payload.verification,
        pageMap: payload.pageMap,
        previewPdfUrl: prefix + '/pdf',
        previewImageUrl: prefix + '/png',
      });
      const value = {
        binding: {
          ...identity(row),
          tenantId: draft.tenantId,
          userId: draft.userId,
          candidateId: draft.candidateId,
        },
        metadata,
        payload,
      };
      row.payloadHash = hashStudioContent(value);
      row.encryptedPayload = encryptStudioPayload(value);
      await tx.insert(resumeStudioDocuments).values(row);
      await this.audit(tx, context, row, 'document_compiled');
      return metadata;
    });
  }
  async latest(context, id) {
    const draft = await this.drafts.get(context, id);
    const [row] = await this.db
      .select()
      .from(resumeStudioDocuments)
      .where(
        and(
          eq(resumeStudioDocuments.draftId, id),
          eq(resumeStudioDocuments.revision, draft.revision)
        )
      )
      .orderBy(desc(resumeStudioDocuments.createdAt))
      .limit(1);
    if (!row) throw new NotFoundError('No compiled document for this revision');
    return (await this.owned(this.db, context, id, row.id)).metadata;
  }
  async previewBytes(context, id, documentId, format) {
    parse(StudioExportRequestSchema, { expectedRevision: 1, documentId, format: 'PDF' });
    if (!['pdf', 'png'].includes(format)) throw new ValidationError('Invalid preview format');
    const { payload } = await this.owned(this.db, context, id, documentId);
    return {
      bytes: Buffer.from(payload[format], 'base64'),
      type: format === 'pdf' ? 'application/pdf' : 'image/png',
    };
  }
  ready(owned, expectedRevision) {
    current(owned.draft, expectedRevision);
    if (
      owned.row.revision !== expectedRevision ||
      owned.row.contentHash !== owned.draft.contentHash
    )
      throw new ConflictError('Recompile the current draft before export', [
        { reason: 'STALE_DOCUMENT' },
      ]);
    const verified = owned.metadata.verification;
    if (
      owned.metadata.status !== 'READY' ||
      verified.failedChecks.length ||
      verified.pageCount !== 1 ||
      !verified.a4 ||
      verified.minimumFontPt < 9.95 ||
      !verified.fontsEmbedded ||
      !verified.unicodeMaps ||
      !verified.wordSpacing ||
      !verified.textPreserved ||
      !verified.readingOrder ||
      !verified.noClipping ||
      !verified.noOverlaps ||
      !verified.glyphsSafe ||
      !verified.docxTextPreserved
    )
      throw new AppError(
        'The selected content does not fit one readable A4 page. Review content selection before exporting.',
        422,
        'DOCUMENT_REVIEW_REQUIRED'
      );
  }
  async export(context, id, input) {
    write(context);
    const body = parse(StudioExportRequestSchema, input);
    return this.db.transaction(async (tx) => {
      const owned = await this.owned(tx, context, id, body.documentId, true);
      this.ready(owned, body.expectedRevision);
      await this.audit(tx, context, owned.row, 'document_exported');
      return {
        bytes: Buffer.from(owned.payload[body.format.toLowerCase()], 'base64'),
        type:
          body.format === 'PDF'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: 'resume.' + body.format.toLowerCase(),
      };
    });
  }
  async approve(context, id, input, client = {}) {
    write(context);
    const body = parse(StudioApprovalRequestSchema, input);
    return this.db.transaction(async (tx) => {
      const owned = await this.owned(tx, context, id, body.documentId, true);
      this.ready(owned, body.expectedRevision);
      const [prior] = await tx
        .select({ hash: applicationPackages.packageHash })
        .from(applicationPackages)
        .where(
          and(
            eq(applicationPackages.tenantId, context.tenantId),
            eq(applicationPackages.candidateId, owned.draft.candidateId),
            sql`${applicationPackages.packagePayload}->'resumeStudio'->>'documentId' = ${owned.row.id}`
          )
        )
        .limit(1);
      if (prior)
        throw new ConflictError(
          'Approval is already recorded for this document. No new package was created.',
          [{ reason: 'PACKAGE_ALREADY_APPROVED' }]
        );
      const draft = this.drafts._response(owned.draft),
        job = draft.jobTarget;
      if (!job.title || !job.company || !job.sourceUrl || !/^https?:\/\//i.test(job.sourceUrl))
        throw new AppError(
          'Add the target job title, company and posting URL when creating an application-bound draft.',
          422,
          'APPROVAL_TARGET_REQUIRED'
        );
      const scope = { ...context, candidateId: owned.draft.candidateId };
      const tracker = new ApplicationTrackingService({ database: tx });
      const application = await tracker.resolveOrCreateApplication(scope, scope.candidateId, {
        title: job.title,
        company: job.company,
        applicationUrl: job.sourceUrl,
        source: 'MANUAL',
      });
      const pkg = await sealGeneratedPackage(tx, scope, {
        candidateId: scope.candidateId,
        targetJob: {
          id: application.id,
          title: job.title,
          company: job.company,
          applicationUrl: job.sourceUrl,
          source: 'MANUAL',
          description: job.rawDescription,
        },
        tailoredResume: {
          title: 'Tailored resume',
          markdownContent: owned.payload.text,
          contentHash: checksum(Buffer.from(owned.payload.text)),
        },
        verifiedSkills: [],
        claimedSkills: owned.payload.selectedResume.skills.map((s) => s.name),
        portfolioLinks: [],
        answers: {},
        resumeStudio: {
          draftId: owned.draft.id,
          revision: draft.revision,
          documentId: owned.row.id,
          sourceSnapshotHash: draft.sourceSnapshotHash,
          contentHash: draft.contentHash,
          pdfHash: owned.metadata.pdfHash,
          docxHash: checksum(Buffer.from(owned.payload.docx, 'base64')),
          truthState: 'CLAIMED',
        },
      });
      const version = await tracker.recordApplicationPackage(scope, application.id, pkg, {
        source: 'RESUME_STUDIO',
      });
      const ticket = await new JobApplicationWorkflowService({
        database: tx,
      }).requestApplicationApproval({
        ...scope,
        applicationId: application.id,
        jobId: application.id,
        destinationUrl: job.sourceUrl,
        packageHash: pkg.packageHash,
        packageVersion: version.version,
        status: 'APPROVED',
      });
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        userId: context.userId,
        eventType: 'resume_studio.package_approved',
        resourceType: 'application_approval_ticket',
        resourceId: ticket.ticketId,
        details: {
          draftId: id,
          revision: draft.revision,
          documentId: owned.row.id,
          packageHash: pkg.packageHash,
          clientIp: client.ip || null,
          userAgent: typeof client.userAgent === 'string' ? client.userAgent.slice(0, 512) : null,
        },
      });
      return {
        contractVersion: '1.3.0',
        applicationId: application.id,
        packageVersion: version.version,
        packageHash: pkg.packageHash,
        approvalTicketId: ticket.ticketId,
        status: ticket.status,
        expiresAt: ticket.expiresAt,
        documentId: owned.row.id,
      };
    });
  }
}
