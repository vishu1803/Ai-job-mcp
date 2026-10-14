/** Opt-in real provider check; only fixed synthetic facts leave this machine. */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createAiProvider } from '../../src/clients/ai/ai-provider-factory.js';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
if (!process.argv.includes('--live'))
  throw new Error('Explicit --live required; never load private candidates.');
const config = {};
for (const file of ['.env', '.env.local']) {
  try {
    Object.assign(config, dotenv.parse(await fs.readFile(file)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const selected = config.AI_PROVIDER || 'gemini-vertex';
const vertex = /vertex/i.test(selected);
const configured = vertex ? Boolean(config.GOOGLE_CLOUD_PROJECT) : Boolean(config.GEMINI_API_KEY);
const record = {
  syntheticOnly: true,
  provider: selected,
  configured,
  attempted: false,
  providerResponseReceived: false,
  acceptedWritingMethod: 'SOURCE_GROUNDED_DETERMINISTIC',
  providerProseUsed: false,
};
if (configured) {
  const provider = createAiProvider({
    provider: selected,
    adapterOptions: vertex
      ? { project: config.GOOGLE_CLOUD_PROJECT, location: config.GOOGLE_CLOUD_LOCATION || 'global' }
      : { apiKey: config.GEMINI_API_KEY },
  });
  const controlledProvider = {
    generateStructured: async (request) => {
      record.attempted = true;
      try {
        const response = await provider.generateStructured({ ...request, timeoutMs: 45000 });
        record.providerResponseReceived = true;
        return response;
      } catch (error) {
        record.failureCode = error.code || error.name || 'PROVIDER_UNAVAILABLE';
        throw error;
      }
    },
  };
  const result = await new AiResumeContentGeneratorService({
    aiProvider: controlledProvider,
  }).generateResumeAiContent({
    candidateProfile: { id: '00000000-0000-4000-8000-000000000001' },
    targetJobPosting: { title: 'Backend Developer', description: 'Document API validation.' },
    factInventory: [
      {
        factId: 'synthetic-api',
        text: 'Documented API validation and integration test behavior.',
        candidateAuthored: true,
        provenanceStatus: 'CLAIMED',
      },
    ],
    selectedProjects: [],
    selectedSkills: [],
  });
  if (result.summary.text !== 'Documented API validation and integration test behavior.')
    throw new Error('Untrusted live wording displaced synthetic authority');
  record.acceptedSummary = result.summary.text;
}
const output = path.resolve(process.argv[2]);
await fs.writeFile(output, JSON.stringify(record, null, 2));
console.log(JSON.stringify(record));
