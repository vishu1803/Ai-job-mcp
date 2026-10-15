import { ResumeStudioHistoryService } from '../../src/services/resume-studio-history.service.js';
import Ajv from 'ajv';
import fs from 'node:fs/promises';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { studioDocumentContent } from '../../src/services/resume-studio-document-content.js';
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
    options: {
      projectRankings: profile.projects.map((project, index) => ({
        projectId: project.id,
        projectName: project.name,
        status: 'SELECTED',
        relevanceScore: 100 - index,
        rank: index + 1,
      })),
    },
  });
  const sources = contexts.map((ctx) =>
    JSON.parse(
      JSON.stringify({
        identity: {
          name: profile.displayName || 'Synthetic candidate',
          email: 'fixture@example.test',
        },
        sourceResumeId: ctx.resumeId,
        sourceVersion: 1,
        summary: 'Source facts are preserved.',
        projects: profile.projects,
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
      })
    )
  );
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
    await t.test(
      'exact generated content opens once in Studio, persists edits and retains older versions',
      async () => {
        const drafts = new ResumeStudioDraftService({ database: db });
        const draft = await drafts.create(contexts[0], { generationId: first.id });
        assert.equal(draft.generation.id, first.id);
        assert.equal(
          draft.structuredResume.summary.text,
          first.bundle.structuredResume.summary.text
        );
        assert.notEqual(draft.structuredResume.summary.text, sources[0].summary);
        assert.ok(draft.structuredResume.projects.length > 0);
        assert.deepEqual(
          draft.structuredResume.projects.map((p) => p.bullets),
          first.bundle.structuredResume.projects.map((p) => p.bullets.map((b) => b.text))
        );
        const projection = studioDocumentContent(draft);
        assert.equal(projection.render.targetRole, first.bundle.structuredResume.targetRole);
        assert.deepEqual(
          projection.render.sectionOrder,
          first.bundle.structuredResume.sectionOrder
        );
        assert.deepEqual(
          projection.render.skills.categories.map((c) => [
            c.categoryName,
            c.skills.map((v) => v.name),
          ]),
          first.bundle.structuredResume.skills.categories.map((c) => [
            c.categoryName,
            c.skills.map((v) => v.name),
          ])
        );
        const headings = projection.blocks.filter((b) => b.style === 'Heading1').map((b) => b.text);
        assert.ok(headings.indexOf('Technical Skills') < headings.indexOf('Technical Projects'));
        const summaryNode = draft.nodes.find((n) => n.kind === 'SUMMARY');
        const edited = await drafts.update(contexts[0], draft.id, {
          expectedRevision: 1,
          edits: [{ nodeId: summaryNode.nodeId, text: 'Candidate-authored refined summary.' }],
        });
        const reopened = await drafts.create(contexts[0], { generationId: first.id });
        assert.equal(reopened.id, draft.id);
        assert.equal(reopened.revision, 2);
        assert.equal(reopened.structuredResume.summary.text, edited.structuredResume.summary.text);
        await assert.rejects(
          drafts.update(contexts[0], draft.id, {
            expectedRevision: 1,
            edits: [{ nodeId: summaryNode.nodeId, text: 'Stale edit.' }],
          }),
          /revision/
        );
        await assert.rejects(drafts.create(contexts[1], { generationId: first.id }), /not found/i);
        assert.deepEqual((await service.get(contexts[0], first.id)).bundle, first.bundle);
      }
    );
    await t.test(
      'authenticated HTTP opening requires CSRF and returns the persisted generated draft',
      async () => {
        const app = await buildApp({ logger: false });
        try {
          await app.listen({ host: '127.0.0.1', port: 0 });
          const base = 'http://127.0.0.1:' + app.server.address().port;
          const session = await createSession(db, contexts[0]);
          const headers = {
            'content-type': 'application/json',
            accept: 'application/json',
            origin: base,
            cookie: 'career_hub_session=' + session.rawToken,
          };
          const url = base + '/api/v1/resume-studio/drafts';
          const rejected = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ generationId: first.id }),
          });
          assert.equal(rejected.status, 403);
          headers['x-csrf-token'] = generateCsrfToken(session.sessionId);
          const opened = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ generationId: first.id }),
          });
          const body = await opened.json();
          assert.equal(opened.status, 201, JSON.stringify(body));
          assert.equal(body.data.generation.id, first.id);
          const portable = JSON.parse(
            await fs.readFile(
              new URL('../../docs/api/resume-studio-drafts-v1.schema.json', import.meta.url),
              'utf8'
            )
          );
          const validate = new Ajv({ strict: false, validateFormats: false }).compile(
            portable.responseData
          );
          assert.equal(validate(body.data), true, JSON.stringify(validate.errors));
          assert.equal(body.data.revision, 2);
          assert.equal(
            body.data.structuredResume.summary.text,
            'Candidate-authored refined summary.'
          );
          const loaded = await fetch(url + '/' + body.data.id, { headers });
          assert.equal(loaded.status, 200);
          assert.equal((await loaded.json()).data.contentHash, body.data.contentHash);
        } finally {
          await app.close();
        }
      }
    );
    await t.test(
      'generated drafts retain revision history and restore through existing CAS workflow',
      async () => {
        const drafts = new ResumeStudioDraftService({ database: db });
        const draft = await drafts.create(contexts[0], { generationId: first.id });
        const history = new ResumeStudioHistoryService({ database: db });
        const restored = await history.restore(contexts[0], draft.id, {
          expectedRevision: 2,
          restoreRevision: 1,
        });
        assert.equal(restored.revision, 3);
        assert.equal(restored.generation.id, first.id);
        assert.equal(
          restored.structuredResume.summary.text,
          first.bundle.structuredResume.summary.text
        );
        assert.equal(
          (await history.get(contexts[0], draft.id, 2)).structuredResume.summary.text,
          'Candidate-authored refined summary.'
        );
        await assert.rejects(
          history.restore(contexts[0], draft.id, { expectedRevision: 2, restoreRevision: 1 }),
          /Draft changed/
        );
      }
    );
    await t.test(
      'historical generation opens after its master is superseded without cloning the new master',
      async () => {
        const historical = await service.save(
          contexts[0],
          request(contexts[0], 'historical'),
          bundle()
        );
        await db
          .update(resumes)
          .set({ isBaseResume: false, lifecycleState: 'ARCHIVED', updatedAt: new Date() })
          .where(eq(resumes.id, contexts[0].resumeId));
        await db
          .update(candidates)
          .set({
            profileMetadata: { resumeData: { summary: 'A different current master.' } },
            updatedAt: new Date(),
          })
          .where(eq(candidates.id, contexts[0].candidateId));
        const draft = await new ResumeStudioDraftService({ database: db }).create(contexts[0], {
          generationId: historical.id,
        });
        assert.equal(
          draft.structuredResume.summary.text,
          historical.bundle.structuredResume.summary.text
        );
        assert.equal(draft.sourceVersion, 1);
      }
    );
  } finally {
    for (const ctx of contexts) await db.delete(tenants).where(eq(tenants.id, ctx.tenantId));
    await closeDatabase();
  }
});
