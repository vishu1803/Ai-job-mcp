import { sealGeneratedPackage } from '../../src/services/evidence/artifact-policy.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ResumeStudioDocumentService } from '../../src/services/resume-studio-document.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';
import { ResumeGenerationService } from '../../src/services/resume-generation.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { fixtureProvider } from '../fixtures/resume-writing-provider.js';
import os from 'node:os';
import path from 'node:path';
import { ResumeStudioHistoryService } from '../../src/services/resume-studio-history.service.js';
import Ajv from 'ajv';
import fs from 'node:fs/promises';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { studioDocumentContent } from '../../src/services/resume-studio-document-content.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';

after(async () => {
  await closeDatabase();
});
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
          phone: profile.phone,
          location: profile.location,
          headline: profile.headline,
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
      'authorized operation uses shared writer, real source selection and encrypted persistence',
      async (sub) => {
        let compileCalls = 0,
          failCompilation = false;
        const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unified-generation-contract-'));
        const storage = new DocumentStorageService({ database: db, storageDir });
        const engine = new ResumeGenerationService({
          database: db,
          aiProvider: fixtureProvider(),
          storage,
          generator: {
            generateTailoredResumeLatex: () => ({ texContent: 'Controlled layout fixture' }),
          },
          compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
          compileDocument: async (draft) => {
            compileCalls++;
            if (failCompilation) throw Error('Controlled compiler failure');
            assert.equal(
              draft.structuredResume.summary.text,
              'Developed book search and lending endpoints in Node.js.'
            );
            assert.ok(draft.structuredResume.projects.length > 0);
            return {
              pdf: Buffer.from('Persistence fixture PDF bytes').toString('base64'),
              docx: Buffer.from('Persistence fixture DOCX bytes').toString('base64'),
              verification: {
                failedChecks: [],
                pageCount: 1,
                a4: true,
                textPreserved: true,
                minimumFontPt: 10,
                fontsEmbedded: true,
                unicodeMaps: true,
                wordSpacing: true,
                readingOrder: true,
                noClipping: true,
                noOverlaps: true,
                glyphsSafe: true,
                docxTextPreserved: true,
                marginIn: 0.6,
                lineHeight: 1.24,
                compiler: 'chrome_headless',
              },
            };
          },
        });
        try {
          const input = {
            sourceResumeId: contexts[0].resumeId,
            origin: 'STUDIO_ENTRY',
            idempotencyKey: 'operation',
            jobTarget: {
              title: 'Backend Engineer',
              company: 'Synthetic Engineering',
              sourceUrl: 'https://jobs.example.test/backend-engineer',
              rawDescription:
                'Requirements: Node.js API development and PostgreSQL database migrations. Implement supported API endpoints and write integration tests for validation and error responses.',
            },
          };
          const generated = await engine.execute(contexts[0], input);
          assert.equal(generated.bundle.structuredResume.writing.providerUsed, true);
          assert.equal(generated.bundle.structuredResume.candidateIdentity.phone, profile.phone);
          assert.equal(
            generated.bundle.structuredResume.candidateIdentity.location,
            profile.location
          );
          assert.equal(
            generated.bundle.structuredResume.candidateIdentity.email,
            'fixture@example.test'
          );
          assert.equal(generated.bundle.metadata.writing.provider, 'gemini-vertex');
          const retried = await engine.execute(contexts[0], input);
          assert.equal(retried.id, generated.id);
          assert.equal(compileCalls, 1);
          const throughMcp = await engine.execute(contexts[0], { ...input, origin: 'MCP' });
          assert.equal(throughMcp.id, generated.id);
          assert.equal(compileCalls, 1);
          const uneditedPackage = await sealGeneratedPackage(db, contexts[0], {
            candidateId: contexts[0].candidateId,
            structuredResume: generated.bundle.structuredResume,
            resumeGeneration: {
              id: generated.id,
              contentHash: generated.contentHash,
              sourceResumeId: generated.sourceResumeId,
              sourceVersion: generated.sourceVersion,
            },
          });
          const generationHandoff = new ApplicationHandoffService({
            applicationTrackingService: new ApplicationTrackingService({ database: db }),
            documentStorage: storage,
          });
          const sourceBytes = await generationHandoff.resolveBoundResume({
            ...contexts[0],
            applicationPackage: uneditedPackage,
          });
          assert.equal(sourceBytes.pdfBuffer.toString(), 'Persistence fixture PDF bytes');
          const forged = await sealGeneratedPackage(db, contexts[0], {
            ...uneditedPackage,
            resumeGeneration: { ...uneditedPackage.resumeGeneration, contentHash: '0'.repeat(64) },
          });
          await assert.rejects(
            generationHandoff.resolveBoundResume({ ...contexts[0], applicationPackage: forged }),
            /binding changed/i
          );
          const draftService = new ResumeStudioDraftService({
            database: db,
            generationService: engine,
          });
          const fromMaster = await draftService.create(contexts[0], {
            source: { kind: 'RESUME', resumeId: contexts[0].resumeId },
            jobTarget: input.jobTarget,
          });
          assert.notEqual(fromMaster.structuredResume.summary.text, sources[0].summary);
          const retryMaster = await draftService.create(contexts[0], {
            source: { kind: 'RESUME', resumeId: contexts[0].resumeId },
            jobTarget: input.jobTarget,
          });
          assert.equal(retryMaster.id, fromMaster.id);
          await sub.test(
            'regeneration preserves approved package and exact historical Studio bytes',
            async () => {
              const documents = new ResumeStudioDocumentService({
                database: db,
                compiler: async (snapshot) => {
                  const model = studioDocumentContent(snapshot);
                  return {
                    ...(await engine.compileDocument(snapshot)),
                    pageMap: [],
                    png: '',
                    text: model.expected.join('\n'),
                    selectedResume: model.content,
                  };
                },
              });
              const original = await draftService.create(contexts[0], {
                generationId: generated.id,
              });
              const preview = await documents.preview(contexts[0], original.id, {
                expectedRevision: 1,
              });
              const approval = await documents.approve(contexts[0], original.id, {
                expectedRevision: 1,
                documentId: preview.id,
                reviewed: true,
              });
              const tracker = new ApplicationTrackingService({ database: db });
              const before = await tracker.getApplicationDetails(
                contexts[0],
                approval.applicationId
              );
              assert.equal(before.currentPackage.packageHash, approval.packageHash);
              assert.equal(
                before.currentPackage.packagePayload.resumeStudio.generationId,
                generated.id
              );
              const summary = original.nodes.find((n) => n.kind === 'SUMMARY');
              await draftService.update(contexts[0], original.id, {
                expectedRevision: 1,
                edits: [
                  {
                    nodeId: summary.nodeId,
                    text: 'Candidate edit retained in the older generation.',
                  },
                ],
              });
              const approvedBytes = await documents.approvedArtifact(
                contexts[0],
                before.currentPackage.packagePayload
              );
              assert.equal(
                crypto.createHash('sha256').update(approvedBytes.pdfBuffer).digest('hex'),
                preview.pdfHash
              );
              await assert.rejects(
                documents.export(contexts[0], original.id, {
                  expectedRevision: 1,
                  documentId: preview.id,
                  format: 'PDF',
                }),
                /revision/i
              );
              const workflow = new JobApplicationWorkflowService({
                database: db,
                resumeGenerationService: engine,
              });
              workflow.applicationHandoffService.buildApplicationHandoffKit = async () => {
                throw Error('Regeneration must not mutate or regenerate a handoff');
              };
              const request = { ...contexts[0], applicationId: approval.applicationId };
              const alternative = await workflow.regenerateApplicationPackage(request);
              assert.equal(alternative.reviewRequired, true);
              assert.equal(alternative.parentGenerationId, generated.id);
              assert.notEqual(alternative.generationId, generated.id);
              assert.equal(
                (await workflow.regenerateApplicationPackage(request)).generationId,
                alternative.generationId
              );
              const after = await tracker.getApplicationDetails(
                contexts[0],
                approval.applicationId
              );
              assert.equal(after.currentPackage.packageHash, approval.packageHash);
              assert.deepEqual(
                after.currentPackage.packagePayload,
                before.currentPackage.packagePayload
              );
              assert.equal(
                (await draftService.get(contexts[0], original.id)).structuredResume.summary.text,
                'Candidate edit retained in the older generation.'
              );
              const alternativeDraft = await draftService.create(contexts[0], {
                generationId: alternative.generationId,
              });
              assert.equal(
                alternativeDraft.structuredResume.summary.text,
                generated.bundle.structuredResume.summary.text
              );
              const bound = await new ApplicationHandoffService({
                applicationTrackingService: tracker,
              }).resolveBoundResume({
                ...contexts[0],
                applicationPackage: before.currentPackage.packagePayload,
              });
              assert.deepEqual(bound.pdfBuffer, approvedBytes.pdfBuffer);
              let compilerCalls = 0;
              const realStorageHandoff = new ApplicationHandoffService({
                applicationTrackingService: tracker,
                documentStorage: storage,
                latexGenerator: {
                  generateTailoredResumeLatex: () => {
                    throw Error('Approved resume must never be re-rendered');
                  },
                  generateTailoredCoverLetterLatex: () => ({
                    texContent: 'Controlled cover letter compilation fixture',
                  }),
                },
                latexCompiler: {
                  compileLatexToPdf: async ({ jobName }) => {
                    assert.equal(jobName, 'tailored-cover-letter');
                    compilerCalls++;
                    return { pdfBuffer: Buffer.from('Controlled cover letter bytes') };
                  },
                },
                qaValidator: {
                  validatePdf: async ({ pdfBuffer, documentType }) => {
                    if (documentType === 'RESUME')
                      assert.deepEqual(pdfBuffer, approvedBytes.pdfBuffer);
                    return { passed: true, score: 100, findings: [] };
                  },
                },
                resumeParser: { extractRawText: () => 'Controlled QA text fixture' },
                geometryAnalyzer: { analyze: () => ({ layoutDiagnostics: null }) },
                resumeQualityAssessment: { assessResumeQuality: () => null },
              });
              const kit = await realStorageHandoff.buildApplicationHandoffKit({
                ...contexts[0],
                applicationId: approval.applicationId,
                applicationPackage: before.currentPackage.packagePayload,
                persist: false,
              });
              assert.equal(compilerCalls, 1);
              assert.equal(kit.resume.contentHash, preview.pdfHash);
              assert.equal(kit.resume.texStorageKey, undefined);
              assert.deepEqual(
                await storage.getDecryptedDocument({
                  tenantId: contexts[0].tenantId,
                  candidateId: contexts[0].candidateId,
                  storageKey: kit.resume.storageKey,
                  expectedPackageHash: approval.packageHash,
                }),
                approvedBytes.pdfBuffer
              );

              const newPreview = await documents.preview(contexts[0], alternativeDraft.id, {
                expectedRevision: 1,
              });
              const selected = await documents.approve(contexts[0], alternativeDraft.id, {
                expectedRevision: 1,
                documentId: newPreview.id,
                reviewed: true,
              });
              assert.equal(selected.applicationId, approval.applicationId);
              assert.equal(selected.packageVersion, approval.packageVersion + 1);
              const selectedApp = await tracker.getApplicationDetails(
                contexts[0],
                approval.applicationId
              );
              assert.equal(selectedApp.currentPackage.packageHash, selected.packageHash);
              assert.equal(
                selectedApp.currentPackage.packagePayload.resumeStudio.generationId,
                alternative.generationId
              );
              assert.deepEqual(
                (
                  await documents.approvedArtifact(
                    contexts[0],
                    before.currentPackage.packagePayload
                  )
                ).pdfBuffer,
                approvedBytes.pdfBuffer
              );
              await assert.rejects(
                documents.approve(contexts[0], original.id, {
                  expectedRevision: 1,
                  documentId: preview.id,
                  reviewed: true,
                }),
                /revision/i
              );

              await assert.rejects(
                documents.approvedArtifact(contexts[1], before.currentPackage.packagePayload)
              );
            }
          );
          await db
            .update(candidates)
            .set({
              profileMetadata: {
                resumeData: sources[0],
                userCustom: { phone: null, location: null, links: [] },
              },
              updatedAt: new Date(),
            })
            .where(eq(candidates.id, contexts[0].candidateId));
          const cleared = await engine.execute(contexts[0], {
            ...input,
            idempotencyKey: 'cleared-contacts',
            origin: 'REGENERATION',
            parentGenerationId: generated.id,
          });
          assert.equal(cleared.bundle.structuredResume.candidateIdentity.phone, null);
          assert.equal(cleared.bundle.structuredResume.candidateIdentity.location, null);
          assert.deepEqual(cleared.bundle.structuredResume.candidateIdentity.links, []);
          assert.equal(
            (await service.get(contexts[0], generated.id)).bundle.structuredResume.candidateIdentity
              .phone,
            profile.phone
          );
          const callsBeforeFailure = compileCalls;
          failCompilation = true;
          await assert.rejects(
            engine.execute(contexts[0], { ...input, idempotencyKey: 'compiler-failed' }),
            /Controlled compiler failure/
          );
          assert.equal(compileCalls, callsBeforeFailure + 1);
          assert.equal(
            await service.findByKey(contexts[0], contexts[0].candidateId, 'compiler-failed'),
            null
          );
          failCompilation = false;
          const downloaded = await storage.getDecryptedDocument({
            tenantId: contexts[0].tenantId,
            candidateId: contexts[0].candidateId,
            storageKey: generated.bundle.artifacts.pdf.storageKey,
            expectedPackageHash: generated.bundle.metadata.artifactPackageHash,
          });
          assert.equal(downloaded.toString(), 'Persistence fixture PDF bytes');
          const draft = await new ResumeStudioDraftService({ database: db }).create(contexts[0], {
            generationId: generated.id,
          });
          assert.equal(
            draft.structuredResume.summary.text,
            'Candidate edit retained in the older generation.'
          );
          await assert.rejects(engine.execute(contexts[1], input), /master/i);
        } finally {
          await fs.rm(storageDir, { recursive: true, force: true });
        }
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
