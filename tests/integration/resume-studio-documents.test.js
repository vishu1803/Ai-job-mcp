import { before, after, test } from 'node:test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { eq, sql, inArray } from 'drizzle-orm';
import { startStudioHarness } from '../helpers/resume-studio-harness.js';
import {
  resumes,
  candidates,
  applicationPackages,
  applicationApprovalTickets,
  jobApplications,
} from '../../src/db/schema.js';
import { resumeStudioDocuments } from '../../src/db/resume-studio.schema.js';
import { ResumeStudioDocumentService } from '../../src/services/resume-studio-document.service.js';

let h, draft, document, baseline;
const scopedRows = (table) =>
  h.db
    .select()
    .from(table)
    .where(inArray(table.tenantId, [...new Set(h.people.map((person) => person.tenantId))]));
const read = async (suffix) => (await (await h.request('GET', suffix)).json()).data;
const fixture = async (name, data) => {
  if (process.env.STUDIO_WRITE_FIXTURES === '1')
    await fs.writeFile(
      new URL('../fixtures/resume-studio-' + name + '.json', import.meta.url),
      JSON.stringify({ success: true, data }, null, 2) + '\n'
    );
};
before(async () => {
  h = await startStudioHarness();
  draft = await h.create();
  baseline = {
    resumes: await scopedRows(resumes).orderBy(resumes.id),
    candidates: await scopedRows(candidates).orderBy(candidates.id),
  };
});
after(async () => {
  await h?.db.execute(
    sql`DROP TRIGGER IF EXISTS studio_document_test_fail ON audit_logs; DROP FUNCTION IF EXISTS studio_document_test_fail();`
  );
  await h?.close();
});
test('actual authenticated web route supplies only owned master and session CSRF', async () => {
  const response = await fetch(h.baseUrl + '/resume-studio', {
    headers: { cookie: h.headers().cookie },
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.ok(html.includes(h.people[0].resumeId));
  assert.ok(!html.includes(h.people[1].resumeId));
  assert.ok(html.includes('csrf-token'));
  assert.ok(!html.includes('decreasing p99 latency by 42%'));
  assert.ok(!html.includes('Verified Repository Contributor'));
});
test('history is immutable and restore creates an authoritative new revision', async () => {
  const node = draft.nodes.find((n) => n.kind === 'BULLET');
  const patch = await h.request('PATCH', '/drafts/' + draft.id, {
    expectedRevision: 1,
    edits: [{ nodeId: node.nodeId, text: 'Candidate manual wording.' }],
  });
  assert.equal(patch.status, 200);
  draft = (await patch.json()).data;
  const history = await read('/drafts/' + draft.id + '/history');
  assert.deepEqual(
    history.revisions.map((r) => r.revision),
    [2, 1]
  );
  await fixture('history', history);
  const old = await read('/drafts/' + draft.id + '/history/1');
  assert.notEqual(old.structuredResume.experience[0].bullets[0], 'Candidate manual wording.');
  const restore = await h.request('POST', '/drafts/' + draft.id + '/restore', {
    expectedRevision: 2,
    restoreRevision: 1,
  });
  assert.equal(restore.status, 200);
  draft = (await restore.json()).data;
  assert.equal(draft.revision, 3);
  assert.deepEqual(draft.structuredResume, old.structuredResume);
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draft.id + '/restore', {
        expectedRevision: 2,
        restoreRevision: 1,
      })
    ).status,
    409
  );
});
test('current draft diagnostics reuse canonical analysis and respect selected content', async () => {
  const response = await h.request('GET', '/drafts/' + draft.id + '/diagnostics');
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  assert.equal(value.data.revision, draft.revision);
  assert.equal(value.data.analysis.contractVersion, '1.0.0');
  await fixture('diagnostics', value.data);
  assert.ok(value.data.analysis.keywords.every((k) => k.truthState !== 'VERIFIED'));
  assert.equal(
    (await h.request('GET', '/drafts/' + draft.id + '/diagnostics', undefined, 1)).status,
    404
  );
});
test('proposal index restores persisted review cards with exact ownership', async () => {
  const node = draft.nodes.find((n) => n.kind === 'BULLET' && n.path[0] === 'experience');
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draft.id.toUpperCase() + '/proposals', {
        expectedRevision: draft.revision,
        nodeId: node.nodeId,
      })
    ).status,
    201
  );
  const value = await read('/drafts/' + draft.id + '/proposals');
  assert.equal(value.revision, draft.revision);
  assert.equal(value.proposals[0].status, 'PENDING');
  await fixture('proposal-list', value);
  assert.equal(
    (await h.request('GET', '/drafts/' + draft.id + '/proposals', undefined, 1)).status,
    404
  );
});
test('real compilation persists an encrypted measured one-page PDF and native DOCX', async () => {
  const response = await h.request('POST', '/drafts/' + draft.id.toUpperCase() + '/preview', {
    expectedRevision: draft.revision,
  });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  document = value.data;
  assert.equal(document.draftId, draft.id);
  assert.equal(document.status, 'READY');
  assert.equal(document.verification.pageCount, 1);
  assert.ok(document.verification.minimumFontPt >= 9.95);
  assert.deepEqual(document.verification.failedChecks, []);
  await fixture('document', document);
  const [row] = await h.db
    .select()
    .from(resumeStudioDocuments)
    .where(eq(resumeStudioDocuments.id, document.id));
  assert.ok(!row.encryptedPayload.includes('React views'));
  const image = await fetch(h.baseUrl + document.previewImageUrl, { headers: h.headers() });
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.ok(document.pageMap.length > 0);
  for (const format of ['PDF', 'DOCX']) {
    const exported = await h.request('POST', '/drafts/' + draft.id + '/export', {
      expectedRevision: draft.revision,
      documentId: document.id,
      format,
    });
    assert.equal(exported.status, 200);
    const bytes = Buffer.from(await exported.arrayBuffer());
    assert.ok(bytes.length > 100);
    assert.equal(
      bytes.subarray(0, format === 'PDF' ? 4 : 2).toString(),
      format === 'PDF' ? '%PDF' : 'PK'
    );
  }
  const replay = await h.request('POST', '/drafts/' + draft.id + '/preview', {
    expectedRevision: draft.revision,
  });
  assert.equal((await replay.json()).data.id, document.id);
});
test('foreign tenant, same-tenant owner, read-only, missing CSRF and caller metadata are denied', async () => {
  for (const person of [1, 2]) {
    assert.equal(
      (await h.request('GET', '/drafts/' + draft.id + '/history', undefined, person)).status,
      404
    );
    assert.equal(
      (
        await h.request(
          'GET',
          '/drafts/' + draft.id + '/documents/' + document.id + '/pdf',
          undefined,
          person
        )
      ).status,
      404
    );
  }
  assert.equal(
    (
      await h.request(
        'POST',
        '/drafts/' + h.readonlyDraft.id + '/preview',
        { expectedRevision: 1 },
        3
      )
    ).status,
    403
  );
  assert.equal(
    (
      await h.request(
        'POST',
        '/drafts/' + draft.id + '/preview',
        { expectedRevision: draft.revision },
        0,
        { 'x-csrf-token': '' }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draft.id + '/export', {
        expectedRevision: draft.revision,
        documentId: document.id,
        format: 'PDF',
        verified: true,
      })
    ).status,
    400
  );
  assert.equal(
    (await h.request('GET', '/drafts/' + draft.id + '/documents/' + document.id + '/docx')).status,
    400
  );
});
test('compilation during a manual edit returns conflict and persists no obsolete artifact', async () => {
  let enter, release;
  const started = new Promise((r) => {
    enter = r;
  });
  const existing = new ResumeStudioDocumentService({ database: h.db });
  const compiled = (await existing.owned(h.db, h.people[0], draft.id, document.id)).payload;
  const service = new ResumeStudioDocumentService({
    database: h.db,
    compiler: async () => {
      enter();
      await new Promise((r) => {
        release = r;
      });
      return structuredClone(compiled);
    },
  });
  // The measured artifact is reused only as a deterministic compiler response;
  // the authoritative commit must reject it after the concurrent manual edit.
  const newer = await h.create();
  const failed = service.preview(h.people[0], newer.id, { expectedRevision: 1 });
  await started;
  const node = newer.nodes.find((n) => n.kind === 'BULLET');
  const patch = await h.request('PATCH', '/drafts/' + newer.id, {
    expectedRevision: 1,
    edits: [{ nodeId: node.nodeId, text: 'Concurrent manual edit.' }],
  });
  assert.equal(patch.status, 200);
  release();
  await assert.rejects(failed, (error) => error.statusCode === 409);
  assert.equal(
    (
      await h.db
        .select()
        .from(resumeStudioDocuments)
        .where(eq(resumeStudioDocuments.draftId, newer.id))
    ).length,
    0
  );
});
test('overfull content is preserved and both final export and approval fail closed', async () => {
  const long = await h.create(2),
    edits = long.nodes
      .filter((n) => n.kind === 'BULLET' && n.path[0] === 'experience')
      .map((n) => ({
        nodeId: n.nodeId,
        text: 'Maintained candidate-reported application responsibilities and documented technical decisions. '
          .repeat(10)
          .trim(),
      }));
  const patch = await h.request('PATCH', '/drafts/' + long.id, { expectedRevision: 1, edits }, 2);
  assert.equal(patch.status, 200);
  const response = await h.request(
      'POST',
      '/drafts/' + long.id + '/preview',
      { expectedRevision: 2 },
      2
    ),
    value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  assert.equal(value.data.status, 'NEEDS_REVIEW');
  assert.ok(value.data.verification.pageCount > 1);
  assert.equal(value.data.verification.textPreserved, true);
  for (const format of ['PDF', 'DOCX'])
    assert.equal(
      (
        await h.request(
          'POST',
          '/drafts/' + long.id + '/export',
          { expectedRevision: 2, documentId: value.data.id, format },
          2
        )
      ).status,
      422
    );
  assert.equal(
    (
      await h.request(
        'POST',
        '/drafts/' + long.id + '/approval',
        { expectedRevision: 2, documentId: value.data.id, reviewed: true },
        2
      )
    ).status,
    422
  );
  const retained = (await (await h.request('GET', '/drafts/' + long.id, undefined, 2)).json()).data;
  assert.equal(retained.structuredResume.experience.length, 3);
  assert.equal(retained.structuredResume.experience.flatMap((e) => e.bullets).length, 9);
});
test('approval audit failure rolls back application/package/ticket, then recovery succeeds', async () => {
  await h.db.execute(
    sql`CREATE FUNCTION studio_document_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='resume_studio.package_approved' THEN RAISE EXCEPTION 'synthetic rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER studio_document_test_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION studio_document_test_fail();`
  );
  const body = { expectedRevision: draft.revision, documentId: document.id, reviewed: true };
  const failure = await h.request('POST', '/drafts/' + draft.id + '/approval', body);
  assert.equal(failure.status, 500);
  assert.equal((await scopedRows(applicationPackages)).length, 0);
  assert.equal((await scopedRows(applicationApprovalTickets)).length, 0);
  assert.equal((await scopedRows(jobApplications)).length, 0);
  await h.db.execute(
    sql`DROP TRIGGER studio_document_test_fail ON audit_logs; DROP FUNCTION studio_document_test_fail();`
  );
  const response = await h.request('POST', '/drafts/' + draft.id + '/approval', body);
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  assert.equal(value.data.status, 'APPROVED');
  await fixture('approval', value.data);
  const [pkg] = await scopedRows(applicationPackages);
  const [ticket] = await scopedRows(applicationApprovalTickets);
  assert.equal(pkg.packageHash, ticket.packageHash);
  assert.equal(pkg.packagePayload.resumeStudio.pdfHash, document.pdfHash);
  assert.deepEqual(await scopedRows(resumes).orderBy(resumes.id), baseline.resumes);
  assert.deepEqual(await scopedRows(candidates).orderBy(candidates.id), baseline.candidates);
  assert.equal((await h.request('POST', '/drafts/' + draft.id + '/approval', body)).status, 409);
  assert.equal((await scopedRows(applicationPackages)).length, 1);
});
test('subsequent manual edits invalidate export while preserving old approved package and ticket', async () => {
  const beforePackages = await scopedRows(applicationPackages);
  const beforeTickets = await scopedRows(applicationApprovalTickets);
  const node = draft.nodes.find((n) => n.kind === 'BULLET');
  assert.equal(
    (
      await h.request('PATCH', '/drafts/' + draft.id, {
        expectedRevision: draft.revision,
        edits: [{ nodeId: node.nodeId, text: 'Manual wording after approval.' }],
      })
    ).status,
    200
  );
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draft.id + '/export', {
        expectedRevision: draft.revision,
        documentId: document.id,
        format: 'PDF',
      })
    ).status,
    409
  );
  assert.equal(
    (
      await h.request('POST', '/drafts/' + draft.id + '/export', {
        expectedRevision: draft.revision + 1,
        documentId: document.id,
        format: 'PDF',
      })
    ).status,
    409
  );
  assert.deepEqual(await scopedRows(applicationPackages), beforePackages);
  assert.deepEqual(await scopedRows(applicationApprovalTickets), beforeTickets);
  await assert.rejects(
    h.db
      .update(resumeStudioDocuments)
      .set({ contentHash: '0'.repeat(64) })
      .where(eq(resumeStudioDocuments.id, document.id))
  );
});
