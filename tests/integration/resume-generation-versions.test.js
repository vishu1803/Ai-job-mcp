import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, resumes } from '../../src/db/schema.js';
import { resumeGenerations } from '../../src/db/resume-generation.schema.js';
import { ResumeGenerationVersionService } from '../../src/services/resume-generation-version.service.js';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  process.env.NODE_ENV === 'test' &&
    target.hostname === '127.0.0.1' &&
    target.port === '55449' &&
    target.pathname === '/product_audit_unified_resume',
  'Only the dedicated disposable unified-resume database is allowed'
);
assert.ok(!process.env.GOOGLE_CLOUD_PROJECT && !process.env.GEMINI_API_KEY);

test('immutable encrypted generation ledger: ownership, retry, source binding and regeneration', async (t) => {
  const contexts = Array.from({ length: 2 }, () => ({
    tenantId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: 'MEMBER',
    candidateId: crypto.randomUUID(),
    resumeId: crypto.randomUUID(),
  }));
  const service = new ResumeGenerationVersionService({ database: db });
  const sourceHash = 'a'.repeat(64);
  let first;
  const profile = structuredClone(resumeQualityProfileByKey.student.profile);
  const snapshot = buildStructuredResumeSnapshot({
    candidateProfile: profile,
    jobPosting: {
      title: 'Backend Engineer',
      description: 'Node.js and PostgreSQL.',
      requirements: ['Node.js', 'PostgreSQL'],
    },
  });
  const sources = contexts.map((ctx) => ({
    identity: { name: profile.displayName || 'Synthetic candidate', email: 'fixture@example.test' },
    sourceResumeId: ctx.resumeId,
    sourceVersion: 1,
    summary: 'Source facts are preserved.',
  }));
  const request = (ctx, key = 'first') => ({
    candidateId: ctx.candidateId,
    sourceResumeId: ctx.resumeId,
    sourceVersion: 1,
    sourceContentHash: sourceHash,
    origin: 'WEB',
    idempotencyKey: key,
    jobSnapshot: { title: 'Backend Engineer', description: 'Node.js and PostgreSQL.' },
  });
  // Persistence-only fixture descriptors; no document compilation/QA success is asserted here.
  const bundle = (index = 0) => ({
    structuredResume: snapshot.structuredResume,
    sourceSnapshot: sources[index],
    tailoringPlan: snapshot.tailoringPlan,
    evidenceValidationReceipt: snapshot.evidenceValidationReceipt,
    artifacts: {
      pdf: { storageKey: 'fixture-pdf', contentHash: 'b'.repeat(64), fileSizeBytes: 100 },
      docx: { storageKey: 'fixture-docx', contentHash: 'c'.repeat(64), fileSizeBytes: 100 },
    },
  });
  try {
    for (const [index, ctx] of contexts.entries()) {
      await db.insert(tenants).values({
        id: ctx.tenantId,
        name: 'Generation fixture',
        slug: 'generation-' + ctx.tenantId,
      });
      await db.insert(users).values({
        id: ctx.userId,
        tenantId: ctx.tenantId,
        email: ctx.userId + '@example.test',
        displayName: 'Generation fixture',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
      await db.insert(candidates).values({
        id: ctx.candidateId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        displayName: 'Generation fixture',
        profileMetadata: { resumeData: sources[index] },
      });
      await db.insert(resumes).values({
        id: ctx.resumeId,
        tenantId: ctx.tenantId,
        candidateId: ctx.candidateId,
        version: 1,
        fileName: 'fixture.txt',
        fileSizeBytes: 20,
        mimeType: 'text/plain',
        contentHash: sourceHash,
        storageKey: 'fixture-master',
        isBaseResume: true,
        lifecycleState: 'BASE_RESUME',
      });
    }
    await t.test('save/reload preserves exact structure, provenance and job snapshot', async () => {
      first = await service.save(contexts[0], request(contexts[0]), bundle());
      const saved = await service.get(contexts[0], first.id);
      assert.deepEqual(saved.bundle.structuredResume, first.bundle.structuredResume);
      assert.deepEqual(saved.request.jobSnapshot, request(contexts[0]).jobSnapshot);
      const [row] = await db
        .select()
        .from(resumeGenerations)
        .where(eq(resumeGenerations.id, first.id));
      assert.ok(!row.encryptedPayload.includes('Source facts are preserved'));
      assert.ok(!row.encryptedPayload.includes('Backend Engineer'));
      assert.equal(row.sourceResumeId, contexts[0].resumeId);
    });
    await t.test('parallel retries return one stable version', async () => {
      const versions = await Promise.all(
        Array.from({ length: 3 }, () => service.save(contexts[0], request(contexts[0]), bundle()))
      );
      assert.ok(versions.every((v) => v.id === first.id));
      assert.equal((await service.list(contexts[0])).length, 1);
    });
    await t.test('key reuse with a changed job fails without overwriting', async () => {
      await assert.rejects(
        service.save(
          contexts[0],
          { ...request(contexts[0]), jobSnapshot: { title: 'Full-Stack Engineer' } },
          bundle()
        ),
        /different generation request/
      );
      assert.equal((await service.list(contexts[0])).length, 1);
    });
    await t.test(
      'tenant and readonly contexts cannot read or create foreign versions',
      async () => {
        await assert.rejects(service.get(contexts[1], first.id), /not found/i);
        await assert.rejects(
          service.save(contexts[1], request(contexts[0]), bundle()),
          /not found/i
        );
        await assert.rejects(
          service.save(
            { ...contexts[0], role: 'READONLY' },
            request(contexts[0], 'readonly'),
            bundle()
          ),
          /Authorized/
        );
      }
    );
    await t.test(
      'regeneration creates a new immutable child and retains the old version',
      async () => {
        const child = await service.save(
          contexts[0],
          {
            ...request(contexts[0], 'regenerated'),
            origin: 'REGENERATION',
            parentGenerationId: first.id,
          },
          bundle()
        );
        assert.notEqual(child.id, first.id);
        assert.equal(child.parentGenerationId, first.id);
        assert.equal((await service.list(contexts[0])).length, 2);
        assert.deepEqual((await service.get(contexts[0], first.id)).bundle, first.bundle);
        await assert.rejects(
          service.save(
            contexts[1],
            { ...request(contexts[1], 'foreign-parent'), parentGenerationId: first.id },
            bundle(1)
          ),
          /not found/i
        );
      }
    );
    await t.test('stale source and evidence failure do not create completed versions', async () => {
      await assert.rejects(
        service.save(contexts[0], { ...request(contexts[0], 'stale'), sourceVersion: 2 }, bundle()),
        /master changed/i
      );
      const invalid = bundle();
      invalid.evidenceValidationReceipt = {
        ...invalid.evidenceValidationReceipt,
        overallStatus: 'FAIL',
      };
      await assert.rejects(
        service.save(contexts[0], request(contexts[0], 'invalid'), invalid),
        /evidence validation/
      );
      assert.equal((await service.list(contexts[0])).length, 2);
    });
    await t.test(
      'database prevents mutation and forged scope even outside the service',
      async () => {
        await assert.rejects(
          db
            .update(resumeGenerations)
            .set({ contentHash: 'd'.repeat(64) })
            .where(eq(resumeGenerations.id, first.id)),
          (e) => e.cause?.code === '23514'
        );
        const [row] = await db
          .select()
          .from(resumeGenerations)
          .where(eq(resumeGenerations.id, first.id));
        await assert.rejects(
          db.insert(resumeGenerations).values({
            ...row,
            id: crypto.randomUUID(),
            candidateId: contexts[1].candidateId,
            idempotencyKey: 'forged',
          }),
          (e) => e.cause?.code === '23514'
        );
        assert.throws(
          () => service.decode({ ...row, contentHash: 'd'.repeat(64) }),
          /integrity verification/
        );
      }
    );
    await t.test('original candidate/master rows remain unchanged', async () => {
      const [candidate] = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, contexts[0].candidateId),
            eq(candidates.tenantId, contexts[0].tenantId)
          )
        );
      assert.deepEqual(candidate.profileMetadata.resumeData, sources[0]);
      const [master] = await db.select().from(resumes).where(eq(resumes.id, contexts[0].resumeId));
      assert.equal(master.version, 1);
      assert.equal(master.contentHash, sourceHash);
      assert.equal(master.isBaseResume, true);
    });
  } finally {
    for (const ctx of contexts) await db.delete(tenants).where(eq(tenants.id, ctx.tenantId));
    await closeDatabase();
  }
});
