import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import Ajv from 'ajv';
import { config } from '../../src/config/env.js';
import {
  StudioCreateDraftRequestSchema,
  StudioUpdateDraftRequestSchema,
  StudioDraftResponseSchema,
} from '../../src/domain/career/resume-studio-draft.schemas.js';
import {
  normalizeStudioMaster,
  createStudioNodes,
  defaultStudioSelection,
  applyStudioEdits,
  encryptStudioPayload,
  decryptStudioPayload,
  hashStudioContent,
  MAX_STUDIO_PAYLOAD_BYTES,
} from '../../src/services/resume-studio-draft-content.js';
import { studioMasterFacts } from '../fixtures/resume-studio-master.js';

config.ENCRYPTION_MASTER_KEY ||= '1'.repeat(64); // Explicit public test-only key.
const id = crypto.randomUUID();
const rawDescription =
  'Requirements: PostgreSQL and React experience building accessible backend interfaces. Maintain reliable APIs and document technical decisions.';
const create = { source: { kind: 'RESUME', resumeId: id }, jobTarget: { rawDescription } };
const content = normalizeStudioMaster(studioMasterFacts, id);
const nodes = createStudioNodes(content);
const payload = {
  structuredResume: content,
  nodes,
  selection: defaultStudioSelection(nodes),
  nodeProvenance: Object.fromEntries(
    nodes.map((node) => [node.nodeId, { truthState: 'CLAIMED', editedAtRevision: null }])
  ),
};

describe('Studio draft source preservation, patch and encryption contracts', () => {
  it('explicit end-date edits are rendered as candidate dates without an old current-role flag masking them', () => {
    const current = structuredClone(payload);
    current.structuredResume.experience[0].isCurrent = true;
    current.structuredResume.experience[0].endDate = null;
    const node = current.nodes.find((n) => n.path[0] === 'experience' && n.path[2] === 'endDate');
    const ended = applyStudioEdits(
      current,
      { edits: [{ nodeId: node.nodeId, text: '2024-06' }] },
      2
    );
    assert.equal(ended.structuredResume.experience[0].isCurrent, false);
    assert.equal(current.structuredResume.experience[0].isCurrent, true);
    const ongoing = applyStudioEdits(
      ended,
      { edits: [{ nodeId: node.nodeId, text: 'Present' }] },
      3
    );
    assert.equal(ongoing.structuredResume.experience[0].isCurrent, true);
    const cleared = applyStudioEdits(ended, { edits: [{ nodeId: node.nodeId, text: null }] }, 4);
    assert.equal(cleared.structuredResume.experience[0].isCurrent, false);
  });
  it('clones all projects/facts and preserves authored fields without generation', () => {
    assert.equal(content.projects.length, 5);
    assert.equal(content.experience[0].id, 'source-exp-1');
    assert.equal(content.experience[0].bullets[0], studioMasterFacts.experience[0].bullets[0]);
    assert.equal(content.candidateIdentity.headline, null);
    assert.equal(content.candidateIdentity.displayName, 'Asha 林');
    assert.equal(content.certifications[0].credentialId, 'SOURCE-CRED');
    assert.equal(content.optionalSections.publications[0].title, 'Accessible Systems');
    assert.deepEqual(
      content.projects[0].sourceFields.evidenceLinks,
      studioMasterFacts.projects[0].evidenceLinks
    );
  });
  it('default selection preserves all content and includes three source-order projects', () => {
    assert.equal(payload.selection.projectIds.length, 3);
    assert.equal(payload.selection.bulletIds.length, 7);
    assert.equal(payload.selection.skillIds.length, 3);
  });
  it('edits by opaque node IDs without mutating input or original source', () => {
    const node = nodes.find((item) => item.kind === 'BULLET');
    const next = applyStudioEdits(
      payload,
      { edits: [{ nodeId: node.nodeId, text: 'Candidate-authored revised wording.' }] },
      2
    );
    assert.equal(
      next.structuredResume.experience[0].bullets[0],
      'Candidate-authored revised wording.'
    );
    assert.equal(content.experience[0].bullets[0], studioMasterFacts.experience[0].bullets[0]);
    assert.deepEqual(next.nodes, nodes);
    assert.deepEqual(next.nodeProvenance[node.nodeId], {
      truthState: 'CLAIMED',
      editedAtRevision: 2,
    });
  });
  it('excluded content remains stored and partial selection retains other categories', () => {
    const next = applyStudioEdits(payload, { selection: { experienceIds: [], skillIds: [] } }, 2);
    assert.deepEqual(next.selection.experienceIds, []);
    assert.equal(next.structuredResume.experience.length, 1);
    assert.deepEqual(next.selection.bulletIds, payload.selection.bulletIds);
    assert.deepEqual(next.selection.projectIds, payload.selection.projectIds);
  });
  it('invalid mixed patches cannot mutate any input content', () => {
    const original = structuredClone(payload),
      node = nodes.find((item) => item.kind === 'SUMMARY');
    assert.throws(() =>
      applyStudioEdits(
        payload,
        {
          edits: [{ nodeId: node.nodeId, text: 'Candidate authored.' }],
          selection: { projectIds: [crypto.randomUUID()] },
        },
        2
      )
    );
    assert.deepEqual(payload, original);
  });
  it('rejects unknown/noneditable/duplicate IDs and wrong-kind selections', () => {
    const project = nodes.find((item) => item.kind === 'PROJECT'),
      bullet = nodes.find((item) => item.kind === 'BULLET');
    for (const edits of [
      [{ nodeId: crypto.randomUUID(), text: 'X' }],
      [{ nodeId: project.nodeId, text: 'X' }],
      [
        { nodeId: bullet.nodeId, text: 'X' },
        { nodeId: bullet.nodeId, text: 'Y' },
      ],
    ])
      assert.throws(() => applyStudioEdits(payload, { edits }, 2));
    assert.throws(() =>
      applyStudioEdits(payload, { selection: { skillIds: [project.nodeId] } }, 2)
    );
  });
  it('enforces bullet/date/email schema and max-four project selection', () => {
    const bullet = nodes.find((item) => item.kind === 'BULLET');
    assert.throws(() =>
      applyStudioEdits(payload, { edits: [{ nodeId: bullet.nodeId, text: '' }] }, 2)
    );
    const email = nodes.find((item) => item.path.at(-1) === 'email');
    const endDate = nodes.find(
      (item) => item.path[0] === 'experience' && item.path.at(-1) === 'endDate'
    );
    assert.throws(() =>
      applyStudioEdits(payload, { edits: [{ nodeId: endDate.nodeId, text: '2020' }] }, 2)
    );
    assert.throws(() =>
      applyStudioEdits(payload, { edits: [{ nodeId: email.nodeId, text: 'invalid' }] }, 2)
    );
    assert.throws(() =>
      applyStudioEdits(
        payload,
        {
          selection: {
            projectIds: nodes.filter((node) => node.kind === 'PROJECT').map((node) => node.nodeId),
          },
        },
        2
      )
    );
  });
  it('requires authoritative revision and rejects identity/provenance/approval overrides', () => {
    const summary = nodes.find((item) => item.kind === 'SUMMARY');
    const update = {
      expectedRevision: 1,
      edits: [{ nodeId: summary.nodeId, text: 'Source text.' }],
    };
    assert.ok(StudioCreateDraftRequestSchema.safeParse(create).success);
    assert.ok(StudioUpdateDraftRequestSchema.safeParse(update).success);
    for (const input of [
      { edits: update.edits },
      { ...update, expectedRevision: 0 },
      { ...update, approved: true },
      { ...update, nodeProvenance: {} },
      { ...update, tenantId: id },
      { expectedRevision: 1 },
    ])
      assert.equal(StudioUpdateDraftRequestSchema.safeParse(input).success, false);
    assert.equal(
      StudioCreateDraftRequestSchema.safeParse({ ...create, source: { kind: 'PROFILE' } }).success,
      false
    );
  });
  it('encrypts chunked Unicode source above the existing 64KiB secret limit', () => {
    const value = { identity: 'Asha 林', text: '😀'.repeat(20000) };
    const encrypted = encryptStudioPayload(value);
    assert.ok(!encrypted.includes('Asha'));
    assert.deepEqual(decryptStudioPayload(encrypted), value);
    assert.notEqual(encryptStudioPayload(value), encrypted);
  });
  it('detects corrupt chunks and rejects excessive payload without truncation', () => {
    const encrypted = encryptStudioPayload({ text: 'Source fact' });
    const envelope = JSON.parse(encrypted);
    envelope.chunks[0] = envelope.chunks[0].slice(0, -3) + 'xyz';
    assert.throws(() => decryptStudioPayload(JSON.stringify(envelope)), {
      code: 'DRAFT_INTEGRITY_FAILED',
    });
    assert.throws(() => encryptStudioPayload({ text: 'a'.repeat(MAX_STUDIO_PAYLOAD_BYTES) }), {
      statusCode: 413,
    });
  });
  it('hashes JSON deterministically independent of key ordering', () =>
    assert.equal(hashStudioContent({ a: 1, b: 2 }), hashStudioContent({ b: 2, a: 1 })));
  it('frontend fixtures satisfy response contracts', async () => {
    for (const filename of [
      'resume-studio-draft-created.json',
      'resume-studio-draft-updated.json',
    ]) {
      const fixture = JSON.parse(
        await fs.readFile(new URL('../fixtures/' + filename, import.meta.url), 'utf8')
      );
      assert.equal(fixture.success, true);
      StudioDraftResponseSchema.parse(fixture.data);
    }
  });
  it('portable frontend JSON Schemas validate actual request and response fixtures', async () => {
    const schemas = JSON.parse(
      await fs.readFile(
        new URL('../../docs/api/resume-studio-drafts-v1.schema.json', import.meta.url),
        'utf8'
      )
    );
    const ajv = new Ajv({ strict: false });
    for (const [filename, schema, envelope] of [
      ['resume-studio-draft-create-request.json', schemas.createRequest, false],
      ['resume-studio-draft-update-request.json', schemas.updateRequest, false],
      ['resume-studio-draft-created.json', schemas.responseData, true],
      ['resume-studio-draft-updated.json', schemas.responseData, true],
    ]) {
      const fixture = JSON.parse(
        await fs.readFile(new URL('../fixtures/' + filename, import.meta.url), 'utf8')
      );
      const validate = ajv.compile(schema);
      assert.ok(validate(envelope ? fixture.data : fixture), JSON.stringify(validate.errors));
    }
  });
  it('portable PATCH schema rejects empty changes and duplicate selection IDs', async () => {
    const schemas = JSON.parse(
      await fs.readFile(
        new URL('../../docs/api/resume-studio-drafts-v1.schema.json', import.meta.url),
        'utf8'
      )
    );
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(schemas.updateRequest);
    for (const input of [
      { expectedRevision: 1 },
      { expectedRevision: 1, selection: {} },
      { expectedRevision: 1, selection: { skillIds: [id, id] } },
    ])
      assert.equal(validate(input), false);
    assert.equal(validate({ expectedRevision: 1, selection: { skillIds: [] } }), true);
  });
});
