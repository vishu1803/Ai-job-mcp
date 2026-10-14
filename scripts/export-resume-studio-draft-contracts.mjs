import fs from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  STUDIO_DRAFT_CONTRACT_VERSION,
  StudioCreateDraftRequestSchema,
  StudioUpdateDraftRequestSchema,
  StudioDraftParamsSchema,
  StudioDraftResponseSchema,
} from '../src/domain/career/resume-studio-draft.schemas.js';

const entries = {
  createRequest: StudioCreateDraftRequestSchema,
  updateRequest: StudioUpdateDraftRequestSchema,
  params: StudioDraftParamsSchema,
  responseData: StudioDraftResponseSchema,
};
const schemas = Object.fromEntries(
  Object.entries(entries).map(([name, schema]) => [name, zodToJsonSchema(schema, name)])
);
// Zod refinements are runtime functions. Express their portable equivalents;
// ownership, known node IDs and date-range ordering still require server validation.
const update = schemas.updateRequest.definitions.updateRequest;
update.anyOf = [{ required: ['edits'] }, { required: ['selection'] }];
update.properties.selection.minProperties = 1;
for (const schema of Object.values(update.properties.selection.properties))
  schema.uniqueItems = true;
const responseSelection = schemas.responseData.definitions.responseData.properties.selection;
for (const schema of Object.values(responseSelection.properties)) schema.uniqueItems = true;
await fs.writeFile(
  new URL('../docs/api/resume-studio-drafts-v1.schema.json', import.meta.url),
  JSON.stringify({ contractVersion: STUDIO_DRAFT_CONTRACT_VERSION, ...schemas }, null, 2) + '\n'
);
