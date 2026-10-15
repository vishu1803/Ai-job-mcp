import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import Ajv from 'ajv';
import * as schemas from '../../src/domain/career/resume-studio-document.schemas.js';
import { ResumeStudioDocumentService } from '../../src/services/resume-studio-document.service.js';
test('portable additive document/history/diagnostic/approval contracts validate real HTTP fixtures', async () => {
  const portable = JSON.parse(
    await fs.readFile(
      new URL('../../docs/api/resume-studio-documents-v1.schema.json', import.meta.url),
      'utf8'
    )
  );
  for (const [name, schema] of Object.entries({
    document: schemas.StudioDocumentResponseSchema,
    history: schemas.StudioHistoryResponseSchema,
    diagnostics: schemas.StudioDiagnosticsResponseSchema,
    approval: schemas.StudioApprovalResponseSchema,
    'proposal-list': schemas.StudioProposalListResponseSchema,
  })) {
    const value = JSON.parse(
      await fs.readFile(
        new URL('../fixtures/resume-studio-' + name + '.json', import.meta.url),
        'utf8'
      )
    ).data;
    schema.parse(value);
    const validate = new Ajv({ strict: false }).compile(
      portable[name === 'proposal-list' ? 'proposalList' : name]
    );
    assert.ok(validate(value), JSON.stringify(validate.errors));
  }
  for (const name of ['preview', 'restore', 'export', 'approval']) {
    const input = JSON.parse(
      await fs.readFile(
        new URL('../fixtures/resume-studio-document-' + name + '-request.json', import.meta.url),
        'utf8'
      )
    );
    const validate = new Ajv({ strict: false }).compile(portable[name + 'Request']);
    assert.ok(validate(input), JSON.stringify(validate.errors));
  }
});
test('export and approval cannot receive caller-controlled claims, owner IDs or verification flags', () => {
  const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  assert.equal(
    schemas.StudioExportRequestSchema.safeParse({
      expectedRevision: 1,
      documentId,
      format: 'PDF',
      verified: true,
    }).success,
    false
  );
  assert.equal(
    schemas.StudioApprovalRequestSchema.safeParse({
      expectedRevision: 1,
      documentId,
      reviewed: false,
    }).success,
    false
  );
  assert.equal(
    schemas.StudioApprovalRequestSchema.safeParse({
      expectedRevision: 1,
      documentId,
      reviewed: true,
      userId: documentId,
    }).success,
    false
  );
});
test('a ready badge cannot authorize an unmeasured or overfull final artifact', () => {
  const service = new ResumeStudioDocumentService({ database: {} }),
    verification = {
      failedChecks: [],
      pageCount: 1,
      a4: true,
      minimumFontPt: 10,
      fontsEmbedded: true,
      unicodeMaps: true,
      wordSpacing: true,
      textPreserved: true,
      readingOrder: true,
      noClipping: true,
      noOverlaps: true,
      glyphsSafe: true,
      docxTextPreserved: true,
    };
  const owned = {
    draft: { revision: 1, contentHash: 'same' },
    row: { revision: 1, contentHash: 'same' },
    metadata: { status: 'READY', verification },
  };
  assert.doesNotThrow(() => service.ready(owned, 1));
  for (const invalid of [
    { pageCount: 2 },
    { minimumFontPt: 8 },
    { textPreserved: false },
    { fontsEmbedded: false },
    { unicodeMaps: false },
    { wordSpacing: false },
  ])
    assert.throws(
      () =>
        service.ready(
          {
            ...owned,
            metadata: { status: 'READY', verification: { ...verification, ...invalid } },
          },
          1
        ),
      (error) => error.statusCode === 422
    );
});
