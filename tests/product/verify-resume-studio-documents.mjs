import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { studioPersonas } from '../fixtures/resume-studio-personas.js';
import {
  normalizeStudioMaster,
  createStudioNodes,
  defaultStudioSelection,
} from '../../src/services/resume-studio-draft-content.js';
import { compileStudioDocument } from '../../src/services/resume-studio-document-compiler.js';

process.env.NODE_ENV = 'test';
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_CLOUD_PROJECT;
assert.equal(process.env.NODE_ENV, 'test');
assert.ok(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT);
const output = process.argv[2]
  ? pathToFileURL(path.resolve(process.argv[2]) + path.sep)
  : new URL('../../output/resume-studio/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const personas = studioPersonas(),
  senior = personas.experienced;
for (const [name, source] of Object.entries(personas)) {
  const structuredResume = normalizeStudioMaster(source, crypto.randomUUID()),
    nodes = createStudioNodes(structuredResume);
  const result = await compileStudioDocument({
    structuredResume,
    nodes,
    selection: defaultStudioSelection(nodes),
  });
  await fs.writeFile(
    new URL(name + '.verification.json', output),
    JSON.stringify(result.verification, null, 2)
  );
  for (const format of ['pdf', 'docx', 'png'])
    await fs.writeFile(new URL(name + '.' + format, output), Buffer.from(result[format], 'base64'));
  assert.deepEqual(
    result.verification.failedChecks,
    [],
    JSON.stringify({ name, ...result.verification })
  );
  console.log(JSON.stringify({ persona: name, ...result.verification }));
}
const dense = structuredClone(senior);
dense.summary =
  'Developer maintaining candidate-reported application interfaces and database systems.';
dense.experience.push({
  ...structuredClone(senior.experience[2]),
  id: 'earlier-role',
  company: 'Earlier Systems',
  startDate: '2008',
  endDate: '2011',
});
const denseContent = normalizeStudioMaster(dense, crypto.randomUUID()),
  denseNodes = createStudioNodes(denseContent);
const denseResult = await compileStudioDocument({
  structuredResume: denseContent,
  nodes: denseNodes,
  selection: defaultStudioSelection(denseNodes),
});
for (const format of ['pdf', 'png'])
  await fs.writeFile(
    new URL('dense-spacing-diagnostic.' + format, output),
    Buffer.from(denseResult[format], 'base64')
  );
await fs.writeFile(
  new URL('dense-spacing-diagnostic.verification.json', output),
  JSON.stringify(denseResult.verification, null, 2)
);
assert.deepEqual(denseResult.verification.failedChecks, []);
assert.equal(denseResult.selectedResume.experience.length, 4);
assert.ok(denseResult.verification.marginIn < 0.6);
console.log(JSON.stringify({ persona: 'bounded-spacing-proof', ...denseResult.verification }));
const overflow = structuredClone(senior);
overflow.experience = Array.from({ length: 12 }, (_, index) => ({
  ...structuredClone(senior.experience[index % 3]),
  id: 'long-role-' + index,
  company: 'Long history employer ' + index,
}));
const structuredResume = normalizeStudioMaster(overflow, crypto.randomUUID()),
  nodes = createStudioNodes(structuredResume);
const result = await compileStudioDocument({
  structuredResume,
  nodes,
  selection: defaultStudioSelection(nodes),
});
assert.ok(result.verification.failedChecks.includes('ONE_PAGE'));
assert.ok(result.verification.textPreserved);
assert.equal(result.selectedResume.experience.length, 12);
assert.equal(result.verification.marginIn, 0.5);
console.log('Overflow retained all selected content and requires review.');
