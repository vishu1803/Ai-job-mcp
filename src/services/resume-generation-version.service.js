import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq, desc } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, resumes } from '../db/schema.js';
import { resumeGenerations } from '../db/resume-generation.schema.js';
import { resumeStudioDrafts } from '../db/resume-studio.schema.js';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceValidationReceiptSchema,
  isGenerationHealthy,
} from '../domain/career/resume.schemas.js';
import {
  encryptStudioPayload,
  decryptStudioPayload,
  hashStudioContent,
} from './resume-studio-draft-content.js';
import {
  AuthorizationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  ValidationError,
} from '../errors/index.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z
  .object({
    storageKey: z.string().min(1),
    contentHash: hash,
    fileSizeBytes: z.number().int().positive(),
  })
  .passthrough();
const requestSchema = z
  .object({
    candidateId: z.string().uuid(),
    sourceResumeId: z.string().uuid(),
    sourceVersion: z.number().int().positive(),
    sourceContentHash: hash,
    origin: z.enum(['WEB', 'MCP', 'EXTENSION', 'STUDIO_ENTRY', 'REGENERATION']),
    parentGenerationId: z.string().uuid().nullable().default(null),
    applicationId: z.string().uuid().nullable().default(null),
    applicationPackageId: z.string().uuid().nullable().default(null),
    idempotencyKey: z.string().trim().min(1).max(200),
    forceRegenerate: z.boolean().optional(),
    jobSnapshot: z
      .object({ title: z.string().trim().min(1), description: z.string().max(100000).optional() })
      .passthrough(),
  })
  .strict();
const bundleSchema = z
  .object({
    structuredResume: StructuredResumeDocumentSchema,
    sourceSnapshot: z.record(z.unknown()),
    tailoringPlan: ResumeTailoringPlanSchema,
    evidenceValidationReceipt: EvidenceValidationReceiptSchema,
    artifacts: z.object({ pdf: artifact, docx: artifact }).strict(),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
const immutableBinding = (row) =>
  Object.fromEntries(
    [
      'id',
      'tenantId',
      'userId',
      'candidateId',
      'sourceResumeId',
      'sourceVersion',
      'sourceContentHash',
      'parentGenerationId',
      'origin',
      'idempotencyKey',
      'requestHash',
      'contentHash',
    ].map((key) => [key, row[key]])
  );
function trusted(context, write = false) {
  if (
    !context?.tenantId ||
    !context?.userId ||
    (write && !['OWNER', 'MEMBER'].includes(context.role))
  )
    throw new AuthorizationError('Authorized candidate session required');
}
function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ValidationError(
      'Invalid generated resume snapshot',
      result.error.issues.map(({ path, message }) => ({ path, message }))
    );
  return result.data;
}

/** Internal persistence adapter, never a second tailoring engine. Call only after verified compilation. */
export class ResumeGenerationVersionService {
  constructor({ database = defaultDb } = {}) {
    this.db = database;
  }
  decode(row) {
    try {
      const payload = decryptStudioPayload(row.encryptedPayload);
      if (
        hashStudioContent(payload) !== row.payloadHash ||
        hashStudioContent(payload.binding) !== hashStudioContent(immutableBinding(row)) ||
        hashStudioContent(payload.bundle.structuredResume) !== row.contentHash
      )
        throw Error();
      return { ...row, ...payload, encryptedPayload: undefined };
    } catch {
      throw new InternalServerError(
        'Generation integrity verification failed',
        'GENERATION_INTEGRITY_FAILED'
      );
    }
  }
  async owned(database, context, id, lock = false) {
    trusted(context);
    const query = database
      .select({ generation: resumeGenerations })
      .from(resumeGenerations)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, resumeGenerations.candidateId),
          eq(candidates.tenantId, resumeGenerations.tenantId),
          eq(candidates.userId, resumeGenerations.userId)
        )
      )
      .where(
        and(
          eq(resumeGenerations.id, id),
          eq(resumeGenerations.tenantId, context.tenantId),
          eq(resumeGenerations.userId, context.userId),
          eq(candidates.status, 'ACTIVE')
        )
      );
    const [result] = await (lock ? query.for('update', { of: resumeGenerations }) : query);
    if (!result) throw new NotFoundError('Generated resume not found');
    return this.decode(result.generation);
  }
  async get(context, id) {
    parse(z.string().uuid(), id);
    return this.owned(this.db, context, id);
  }
  async list(context, { limit = 20, offset = 0 } = {}) {
    trusted(context);
    const bounds = parse(
      z.object({
        limit: z.number().int().min(1).max(50),
        offset: z.number().int().min(0).max(10000),
      }),
      { limit, offset }
    );
    const rows = await this.db
      .select({ generation: resumeGenerations })
      .from(resumeGenerations)
      .innerJoin(
        candidates,
        and(
          eq(candidates.id, resumeGenerations.candidateId),
          eq(candidates.tenantId, resumeGenerations.tenantId),
          eq(candidates.userId, resumeGenerations.userId)
        )
      )
      .where(
        and(
          eq(resumeGenerations.tenantId, context.tenantId),
          eq(resumeGenerations.userId, context.userId),
          eq(candidates.status, 'ACTIVE')
        )
      )
      .orderBy(desc(resumeGenerations.createdAt), desc(resumeGenerations.id))
      .limit(bounds.limit)
      .offset(bounds.offset);
    return rows.map(({ generation }) => this.decode(generation));
  }
  async findByKey(context, candidateId, idempotencyKey) {
    trusted(context);
    parse(z.string().uuid(), candidateId);
    parse(z.string().trim().min(1).max(200), idempotencyKey);
    const [row] = await this.db
      .select()
      .from(resumeGenerations)
      .where(
        and(
          eq(resumeGenerations.tenantId, context.tenantId),
          eq(resumeGenerations.userId, context.userId),
          eq(resumeGenerations.candidateId, candidateId),
          eq(resumeGenerations.idempotencyKey, idempotencyKey)
        )
      );
    return row ? this.owned(this.db, context, row.id) : null;
  }
  async save(context, input, compiledBundle) {
    trusted(context, true);
    const request = parse(requestSchema, input),
      bundle = parse(bundleSchema, compiledBundle);
    if (
      bundle.evidenceValidationReceipt.overallStatus !== 'PASS' ||
      bundle.evidenceValidationReceipt.documentId !== bundle.structuredResume.documentId
    )
      throw new ValidationError('Generation evidence validation must pass');
    const requestHash = hashStudioContent({ ...request, origin: undefined });
    return this.db.transaction(async (tx) => {
      // Serializes retries and version creation for this exact owner without mutating the candidate.
      const [owner] = await tx
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, request.candidateId),
            eq(candidates.tenantId, context.tenantId),
            eq(candidates.userId, context.userId),
            eq(candidates.status, 'ACTIVE')
          )
        )
        .for('update');
      if (!owner) throw new NotFoundError('Candidate not found');
      const [existing] = await tx
        .select()
        .from(resumeGenerations)
        .where(
          and(
            eq(resumeGenerations.tenantId, context.tenantId),
            eq(resumeGenerations.candidateId, request.candidateId),
            eq(resumeGenerations.idempotencyKey, request.idempotencyKey)
          )
        );
      if (existing) {
        if (!request.forceRegenerate && existing.requestHash !== requestHash) {
          throw new ConflictError('Idempotency key belongs to a different generation request');
        }
        let isHealthy = false;
        try {
          const decoded = this.decode(existing);
          isHealthy = !request.forceRegenerate && isGenerationHealthy(decoded);
          if (isHealthy) {
            return decoded;
          }
        } catch (err) {
          if (err instanceof ConflictError) throw err;
          isHealthy = false;
        }
        const deleteGenerationCascade = async (genId) => {
          const children = await tx
            .select({ id: resumeGenerations.id })
            .from(resumeGenerations)
            .where(eq(resumeGenerations.parentGenerationId, genId));
          for (const child of children) {
            await deleteGenerationCascade(child.id);
          }
          await tx.delete(resumeStudioDrafts).where(eq(resumeStudioDrafts.generationId, genId));
          await tx.delete(resumeGenerations).where(eq(resumeGenerations.id, genId));
        };
        await deleteGenerationCascade(existing.id);
      }
      const [master] = await tx
        .select()
        .from(resumes)
        .where(
          and(
            eq(resumes.id, request.sourceResumeId),
            eq(resumes.tenantId, context.tenantId),
            eq(resumes.candidateId, request.candidateId)
          )
        )
        .for('share');
      const canonical = owner.profileMetadata?.resumeData;
      if (
        !master?.isBaseResume ||
        master.lifecycleState !== 'BASE_RESUME' ||
        master.version !== request.sourceVersion ||
        master.contentHash !== request.sourceContentHash ||
        canonical?.sourceResumeId !== master.id ||
        canonical.sourceVersion !== master.version ||
        hashStudioContent(canonical) !== hashStudioContent(bundle.sourceSnapshot)
      )
        throw new ConflictError('Canonical master changed; review and retry generation');
      if (request.parentGenerationId) await this.owned(tx, context, request.parentGenerationId);
      const row = {
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        userId: context.userId,
        ...Object.fromEntries(
          Object.entries(request).filter(
            ([key]) => key !== 'jobSnapshot' && key !== 'forceRegenerate'
          )
        ),
        requestHash,
        contentHash: hashStudioContent(bundle.structuredResume),
      };
      const payload = { binding: immutableBinding(row), request, bundle };
      row.payloadHash = hashStudioContent(payload);
      row.encryptedPayload = encryptStudioPayload(payload);
      const [created] = await tx.insert(resumeGenerations).values(row).returning();
      return this.decode(created);
    });
  }
}
