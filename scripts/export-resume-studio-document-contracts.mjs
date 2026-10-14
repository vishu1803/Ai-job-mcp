import fs from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as schemas from '../src/domain/career/resume-studio-document.schemas.js';
const entries = {
  previewRequest: schemas.StudioRevisionRequestSchema,
  restoreRequest: schemas.StudioRestoreRequestSchema,
  exportRequest: schemas.StudioExportRequestSchema,
  approvalRequest: schemas.StudioApprovalRequestSchema,
  document: schemas.StudioDocumentResponseSchema,
  history: schemas.StudioHistoryResponseSchema,
  diagnostics: schemas.StudioDiagnosticsResponseSchema,
  approval: schemas.StudioApprovalResponseSchema,
  proposalList: schemas.StudioProposalListResponseSchema,
};
await fs.writeFile(
  new URL('../docs/api/resume-studio-documents-v1.schema.json', import.meta.url),
  JSON.stringify(
    {
      contractVersion: '1.3.0',
      ...Object.fromEntries(
        Object.entries(entries).map(([key, schema]) => [key, zodToJsonSchema(schema, key)])
      ),
    },
    null,
    2
  ) + '\n'
);
const document = JSON.parse(
  await fs.readFile(
    new URL('../tests/fixtures/resume-studio-document.json', import.meta.url),
    'utf8'
  )
).data;
const documentMarkdown = new URL('../docs/api/resume-studio-documents-v1.md', import.meta.url);
await fs.writeFile(
  documentMarkdown,
  (await fs.readFile(documentMarkdown, 'utf8')).replace(
    /"documentId":"[a-f0-9-]+"/g,
    '"documentId":"' + document.id + '"'
  )
);
for (const [name, payload] of Object.entries({
  preview: { expectedRevision: document.revision },
  restore: { expectedRevision: document.revision, restoreRevision: 1 },
  export: { expectedRevision: document.revision, documentId: document.id, format: 'PDF' },
  approval: { expectedRevision: document.revision, documentId: document.id, reviewed: true },
}))
  await fs.writeFile(
    new URL('../tests/fixtures/resume-studio-document-' + name + '-request.json', import.meta.url),
    JSON.stringify(payload, null, 2) + '\n'
  );
