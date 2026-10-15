import fs from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  STUDIO_PROPOSAL_CONTRACT_VERSION,
  StudioGenerateProposalSchema,
  StudioProposalDecisionSchema,
  StudioProposalParamsSchema,
  StudioProposalResponseSchema,
  StudioProposalDecisionResponseSchema,
} from '../src/domain/career/resume-studio-proposal.schemas.js';
const entries = {
  generateRequest: StudioGenerateProposalSchema,
  decisionRequest: StudioProposalDecisionSchema,
  params: StudioProposalParamsSchema,
  proposal: StudioProposalResponseSchema,
  decisionResponse: StudioProposalDecisionResponseSchema,
};
const schemas = Object.fromEntries(
  Object.entries(entries).map(([name, schema]) => [name, zodToJsonSchema(schema, name)])
);
await fs.writeFile(
  new URL('../docs/api/resume-studio-proposals-v1.schema.json', import.meta.url),
  JSON.stringify({ contractVersion: STUDIO_PROPOSAL_CONTRACT_VERSION, ...schemas }, null, 2) + '\n'
);
