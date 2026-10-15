import { ResumeGenerationService } from './resume-generation.service.js';
import { resumeStudioDrafts } from '../db/resume-studio.schema.js';
import { ResumeGenerationVersionService } from './resume-generation-version.service.js';
import { generatedResumeStudioContent } from './resume-studio-generation-content.js';
import {
  StudioLibraryQuerySchema,
  StudioLibraryResponseSchema,
} from '../domain/career/resume-studio-library.schemas.js';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { ResumeStudioRepository } from '../db/repositories/resume-studio.repository.js';
import { JobDescriptionParser } from '../domain/career/job-parser.js';
import { boundStudioJobText } from './resume-studio-analysis.service.js';
import {
  AuthorizationError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from '../errors/index.js';
import {
  STUDIO_DRAFT_CONTRACT_VERSION,
  StudioCreateDraftRequestSchema,
  StudioUpdateDraftRequestSchema,
  StudioDraftParamsSchema,
  StudioDraftResponseSchema,
} from '../domain/career/resume-studio-draft.schemas.js';
import {
  normalizeStudioMaster,
  createStudioNodes,
  defaultStudioSelection,
  applyStudioEdits,
  hashStudioContent,
  encryptStudioPayload,
  decryptStudioPayload,
} from './resume-studio-draft-content.js';

function parseInput(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ValidationError(
      'Invalid Studio draft request',
      result.error.issues.map(({ path, message }) => ({ path, message }))
    );
  return result.data;
}

function requireContext(context, mutate = false) {
  if (!context?.tenantId || !context?.userId)
    throw new AuthorizationError('Trusted session context required');
  if (mutate && !['OWNER', 'MEMBER'].includes(context.role))
    throw new AuthorizationError('Draft mutation requires write permission', 'FORBIDDEN');
}

function binding(row) {
  return { id: row.id, tenantId: row.tenantId, userId: row.userId, candidateId: row.candidateId };
}

export class ResumeStudioDraftService {
  constructor({ database = defaultDb, generationService = null } = {}) {
    this.db = database;
    this.generationService = generationService;
  }

  _decode(row) {
    try {
      const source = decryptStudioPayload(row.encryptedSource);
      const content = decryptStudioPayload(row.encryptedContent);
      const identity = binding(row);
      if (
        hashStudioContent(source.binding) !== hashStudioContent(identity) ||
        hashStudioContent(content.binding) !==
          hashStudioContent({
            ...identity,
            revision: row.revision,
            sourceSnapshotHash: row.sourceSnapshotHash,
          }) ||
        hashStudioContent(source.snapshot) !== row.sourceSnapshotHash ||
        hashStudioContent(content.payload) !== row.contentHash ||
        (row.generationId && source.snapshot.generationId !== row.generationId) ||
        source.snapshot.sourceResumeId !== row.sourceResumeId ||
        source.snapshot.sourceVersion !== row.sourceVersion ||
        source.snapshot.sourceContentHash !== row.sourceContentHash
      ) {
        throw new Error();
      }
      return { source: source.snapshot, payload: content.payload };
    } catch {
      throw new InternalServerError(
        'Draft integrity verification failed',
        'DRAFT_INTEGRITY_FAILED'
      );
    }
  }

  _response(row) {
    const { source, payload } = this._decode(row);
    const response = StudioDraftResponseSchema.safeParse({
      contractVersion: STUDIO_DRAFT_CONTRACT_VERSION,
      id: row.id,
      candidateId: row.candidateId,
      revision: row.revision,
      status: 'DRAFT',
      sourceResumeId: row.sourceResumeId,
      sourceVersion: row.sourceVersion,
      sourceContentHash: row.sourceContentHash,
      sourceSnapshotHash: row.sourceSnapshotHash,
      contentHash: row.contentHash,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      masterSnapshot: source.masterSnapshot,
      ...payload,
    });
    if (!response.success) throw new InternalServerError('Response contract validation failed');
    return response.data;
  }

  async list(context, query = {}) {
    requireContext(context);
    const options = parseInput(StudioLibraryQuerySchema, query);
    const rows = await new ResumeStudioRepository(this.db).listOwned(context, options);
    return StudioLibraryResponseSchema.parse({
      contractVersion: '1.4.0',
      drafts: rows.slice(0, options.limit).map(({ draft: row }) => {
        const { payload } = this._decode(row);
        return {
          id: row.id,
          revision: row.revision,
          sourceResumeId: row.sourceResumeId,
          sourceVersion: row.sourceVersion,
          title: payload.jobTarget.title || 'Tailored resume',
          company: payload.jobTarget.company || '',
          updatedAt: new Date(row.updatedAt).toISOString(),
          href: '/resume-studio?draftId=' + row.id,
        };
      }),
      nextOffset: rows.length > options.limit ? options.offset + options.limit : null,
    });
  }

  async create(context, input) {
    requireContext(context, true);
    const body = parseInput(StudioCreateDraftRequestSchema, input);
    if (body.generationId) return this.createFromGeneration(context, body.generationId);
    this.generationService ||= new ResumeGenerationService({ database: this.db });
    const generation = await this.generationService.execute(context, {
      sourceResumeId: body.source.resumeId,
      jobTarget: body.jobTarget,
      origin: 'STUDIO_ENTRY',
    });
    return this.createFromGeneration(context, generation.id);
  }

  async createFromGeneration(context, generationId) {
    requireContext(context, true);
    parseInput(StudioDraftParamsSchema, { id: generationId });
    return this.db.transaction(async (tx) => {
      const versions = new ResumeGenerationVersionService({ database: tx });
      const generation = await versions.owned(tx, context, generationId, true);
      const [existing] = await tx
        .select()
        .from(resumeStudioDrafts)
        .where(
          and(
            eq(resumeStudioDrafts.generationId, generationId),
            eq(resumeStudioDrafts.tenantId, context.tenantId),
            eq(resumeStudioDrafts.userId, context.userId)
          )
        );
      if (existing) return this._response(existing);
      const request = generation.request;
      const job = request.jobSnapshot;
      const bounded = boundStudioJobText(job.rawDescription || job.description || '');
      const parsed = await JobDescriptionParser.parse(
        {
          source: 'PASTE',
          rawText: bounded.text,
          title: job.title,
          ...(job.company ? { company: job.company } : {}),
        },
        { tenantId: context.tenantId }
      );
      const id = crypto.randomUUID();
      const masterSnapshot = normalizeStudioMaster(
        generation.bundle.sourceSnapshot,
        generation.sourceResumeId
      );
      const structuredResume = generatedResumeStudioContent(generation.bundle.structuredResume, id);
      const nodes = createStudioNodes(structuredResume);
      const snapshot = {
        generationId,
        generationContentHash: generation.contentHash,
        sourceResumeId: generation.sourceResumeId,
        sourceVersion: generation.sourceVersion,
        sourceContentHash: generation.sourceContentHash,
        rawCanonical: generation.bundle.sourceSnapshot,
        masterSnapshot,
        generatedSnapshot: generation.bundle.structuredResume,
      };
      const sourceSnapshotHash = hashStudioContent(snapshot);
      const payload = {
        generation: {
          id: generationId,
          contentHash: generation.contentHash,
          parentGenerationId: generation.parentGenerationId,
          origin: generation.origin,
        },
        jobTarget: {
          title: job.title,
          ...(job.sourceUrl ? { sourceUrl: job.sourceUrl } : {}),
          ...(job.company ? { company: job.company } : {}),
          rawDescription: bounded.text,
        },
        jobDescription: generation.bundle.metadata.jobDescription || {
          ...parsed.jobDescription,
          requirements: parsed.requirements,
        },
        warnings: bounded.truncated
          ? [
              {
                code: 'JOB_DESCRIPTION_TRUNCATED',
                message: 'Job description was truncated to the parser budget. Review requirements.',
              },
            ]
          : [],
        structuredResume,
        nodes,
        selection: {
          ...defaultStudioSelection(nodes),
          projectIds: nodes.filter((n) => n.kind === 'PROJECT').map((n) => n.nodeId),
        },
        nodeProvenance: Object.fromEntries(
          nodes.map((node) => [node.nodeId, { truthState: 'CLAIMED', editedAtRevision: null }])
        ),
      };
      const row = {
        id,
        tenantId: context.tenantId,
        userId: context.userId,
        candidateId: generation.candidateId,
        generationId,
        sourceResumeId: generation.sourceResumeId,
        sourceVersion: generation.sourceVersion,
        sourceContentHash: generation.sourceContentHash,
        sourceSnapshotHash,
        revision: 1,
        contentHash: hashStudioContent(payload),
      };
      row.encryptedSource = encryptStudioPayload({ binding: binding(row), snapshot });
      row.encryptedContent = encryptStudioPayload({
        binding: { ...binding(row), revision: 1, sourceSnapshotHash },
        payload,
      });
      const repo = new ResumeStudioRepository(tx);
      const created = await repo.insert(row);
      const response = this._response(created);
      await repo.appendRevision(created, context, 'draft_created');
      return response;
    });
  }

  async get(context, id) {
    requireContext(context);
    parseInput(StudioDraftParamsSchema, { id });
    const row = await new ResumeStudioRepository(this.db).getOwned(context, id);
    return this._response(row);
  }

  async update(context, id, input) {
    requireContext(context, true);
    parseInput(StudioDraftParamsSchema, { id });
    const patch = parseInput(StudioUpdateDraftRequestSchema, input);
    return this.db.transaction(async (tx) => {
      const repo = new ResumeStudioRepository(tx);
      const row = await repo.getOwned(context, id, true);
      if (patch.expectedRevision !== row.revision)
        throw new ConflictError('Draft revision no longer current', [
          {
            reason: 'DRAFT_REVISION_CONFLICT',
            expectedRevision: patch.expectedRevision,
            actualRevision: row.revision,
          },
        ]);
      const nextRevision = row.revision + 1;
      const { payload } = this._decode(row);
      const next = applyStudioEdits(payload, patch, nextRevision);
      const updated = await repo.compareAndSwap(context, row, {
        revision: nextRevision,
        contentHash: hashStudioContent(next),
        updatedAt: new Date(),
        encryptedContent: encryptStudioPayload({
          binding: {
            ...binding(row),
            revision: nextRevision,
            sourceSnapshotHash: row.sourceSnapshotHash,
          },
          payload: next,
        }),
      });
      const response = this._response(updated);
      await repo.appendRevision(updated, context, 'draft_updated');
      return response;
    });
  }
}
