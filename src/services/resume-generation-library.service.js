import crypto from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ResumeGenerationVersionService } from './resume-generation-version.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import { resumeStudioDrafts } from '../db/resume-studio.schema.js';
import { applicationPackages } from '../db/schema.js';
import { ValidationError } from '../errors/index.js';
import { buildApplicationArtifactFilename } from '../utils/artifact-filename-builder.js';

export const GenerationLibraryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(49).default(20),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();

/** Owned presentation/read adapter over the immutable ledger, never a generator. */
export class ResumeGenerationLibraryService {
  constructor({ database, storage = null }) {
    this.db = database;
    this.versions = new ResumeGenerationVersionService({ database });
    this.storage = storage || new DocumentStorageService({ database });
  }
  async list(context, query = {}) {
    const parsed = GenerationLibraryQuerySchema.safeParse(query);
    if (!parsed.success) throw new ValidationError('Invalid generated resume pagination');
    const { limit, offset } = parsed.data;
    const rows = await this.versions.list(context, { limit: limit + 1, offset });
    const selected = rows.slice(0, limit);
    return {
      generations: selected.length ? await this.summaries(context, selected) : [],
      nextOffset: rows.length > limit && offset + limit <= 10000 ? offset + limit : null,
    };
  }
  async summaries(context, versions) {
    const ids = versions.map((v) => v.id);
    const drafts = await this.db
      .select()
      .from(resumeStudioDrafts)
      .where(
        and(
          eq(resumeStudioDrafts.tenantId, context.tenantId),
          eq(resumeStudioDrafts.userId, context.userId),
          inArray(resumeStudioDrafts.generationId, ids)
        )
      );
    // A Studio package is only recorded atomically with explicit document approval.
    // An ordinary generated application package does not establish that approval.
    const approved = await this.db
      .select({
        applicationId: applicationPackages.applicationId,
        lifecycleState: applicationPackages.lifecycleState,
        reference: sql`${applicationPackages.packagePayload}->'resumeStudio'`,
      })
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.tenantId, context.tenantId),
          inArray(applicationPackages.candidateId, [
            ...new Set(versions.map((v) => v.candidateId)),
          ]),
          eq(applicationPackages.source, 'RESUME_STUDIO'),
          sql`${applicationPackages.packagePayload}->'resumeStudio'->>'generationId' IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      );
    const lineage = await this.db.execute(sql`WITH RECURSIVE lineage AS (
      SELECT id, parent_generation_id, id AS root, 1 AS depth FROM resume_generations
      WHERE tenant_id = ${context.tenantId} AND user_id = ${context.userId}
        AND id IN (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `
        )})
      UNION ALL
      SELECT p.id, p.parent_generation_id, l.root, l.depth + 1
      FROM resume_generations p JOIN lineage l ON p.id = l.parent_generation_id
      WHERE p.tenant_id = ${context.tenantId} AND p.user_id = ${context.userId} AND l.depth < 256
    ) SELECT root, MAX(depth)::int AS version FROM lineage GROUP BY root`);
    return versions.map((version) => {
      const draft = drafts.find((d) => d.generationId === version.id);
      const approvals = approved
        .filter((a) => a.reference?.generationId === version.id)
        .map((a) => ({
          applicationId: a.applicationId,
          documentId: a.reference.documentId,
          revision: a.reference.revision,
          selected: a.lifecycleState === 'CURRENT',
        }));
      return {
        id: version.id,
        title: version.request.jobSnapshot.title,
        company: version.request.jobSnapshot.company || '',
        createdAt: new Date(version.createdAt).toISOString(),
        sourceResumeId: version.sourceResumeId,
        sourceVersion: version.sourceVersion,
        version: lineage.rows.find((l) => l.root === version.id)?.version || 1,
        parentGenerationId: version.parentGenerationId,
        status: approvals.length ? 'APPROVED' : draft ? 'DRAFT' : 'GENERATED',
        draft: draft
          ? {
              id: draft.id,
              revision: draft.revision,
              updatedAt: new Date(draft.updatedAt).toISOString(),
            }
          : null,
        approvals,
        links: {
          studio: '/resume-studio?generationId=' + version.id,
          preview: '/api/v1/resume-generations/' + version.id + '/pdf?disposition=inline',
          pdf: '/api/v1/resume-generations/' + version.id + '/pdf',
          docx: '/api/v1/resume-generations/' + version.id + '/docx',
        },
      };
    });
  }
  async get(context, id) {
    const version = await this.versions.get(context, id);
    return {
      ...(await this.summaries(context, [version]))[0],
      contentHash: version.contentHash,
      structuredResume: version.bundle.structuredResume,
      tailoringPlan: version.bundle.tailoringPlan,
      jobSnapshot: version.request.jobSnapshot,
      writing: version.bundle.metadata.writing || null,
      verification: version.bundle.metadata.verification || null,
    };
  }
  async document(context, id, format) {
    if (!['pdf', 'docx'].includes(format)) throw new ValidationError('Choose PDF or DOCX');
    const version = await this.versions.get(context, id);
    const artifact = version.bundle.artifacts[format];
    if (!version.bundle.metadata.artifactPackageHash)
      throw new ValidationError('Document requires revalidation', 'ARTIFACT_REVALIDATION_REQUIRED');
    const bytes = await this.storage.getDecryptedDocument({
      tenantId: context.tenantId,
      candidateId: version.candidateId,
      storageKey: artifact.storageKey,
      expectedPackageHash: version.bundle.metadata.artifactPackageHash,
    });
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== artifact.contentHash)
      throw new ValidationError('Saved artifact hash changed', 'ARTIFACT_REVALIDATION_REQUIRED');
    return {
      bytes,
      contentHash: artifact.contentHash,
      filename: buildApplicationArtifactFilename({
        candidateName: version.bundle.structuredResume.candidateIdentity.displayName,
        jobTitle: version.request.jobSnapshot.title,
        extension: format,
      }),
      type:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
}
