import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import Ajv from 'ajv';
import {
  normalizeStudioMaster,
  createStudioNodes,
} from '../../src/services/resume-studio-draft-content.js';
import {
  buildStudioProposalScope,
  admitStudioRewrite,
} from '../../src/services/resume-studio-proposal-grounding.js';
import {
  StudioGenerateProposalSchema,
  StudioProposalDecisionSchema,
  StudioProposalResponseSchema,
  StudioProposalDecisionResponseSchema,
} from '../../src/domain/career/resume-studio-proposal.schemas.js';
import { studioMasterFacts } from '../fixtures/resume-studio-master.js';

const original =
  'Implemented React views with the use of component interfaces in order to support internal workflows.';
function scope(text = original, section = 'experience') {
  const content = normalizeStudioMaster(studioMasterFacts, crypto.randomUUID());
  content[section][0].bullets[0] = text;
  const nodes = createStudioNodes(content),
    node = nodes.find((item) => item.kind === 'BULLET' && item.path[0] === section);
  const row = {
    candidateId: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
  };
  const payload = {
    structuredResume: content,
    nodes,
    nodeProvenance: { [node.nodeId]: { truthState: 'CLAIMED', editedAtRevision: null } },
    jobDescription: { requirements: [] },
    jobTarget: { title: 'Frontend Engineer', rawDescription: 'Build React interfaces.' },
  };
  return buildStudioProposalScope(row, payload, { nodeId: node.nodeId });
}
const output = (s, text = s.variants[0]) => ({
  proposedText: text,
  factIds: ['fact-1'],
  truthState: 'CLAIMED',
});

describe('Studio proposal grounding and review contracts', () => {
  it('accepts a supported wording-only rewrite mapped to the canonical fact', () => {
    const s = scope();
    assert.equal(
      admitStudioRewrite(s, output(s)),
      'Implemented React views using component interfaces to support internal workflows.'
    );
    assert.equal(s.facts.length, 1);
    assert.equal(s.facts[0].text, original);
  });
  it('candidate-authored claims remain CLAIMED, without synthetic verification', () => {
    const s = scope();
    assert.equal(s.facts[0].provenanceStatus, 'CLAIMED');
    assert.equal(s.modelContext.truthState, 'CLAIMED');
    assert.throws(() => admitStudioRewrite(s, { ...output(s), truthState: 'VERIFIED' }), {
      statusCode: 422,
    });
  });
  it('works for source project bullets without crossing project boundaries', () => {
    const s = scope(original, 'projects');
    assert.equal(s.sectionOwnerType, 'PROJECT');
    assert.equal(s.facts[0].projectId, 'source-project-0');
    assert.ok(admitStudioRewrite(s, output(s)));
  });
  it('does not invent missing metrics or quantify unrelated source material', () => {
    const s = scope();
    for (const text of [
      'Implemented React views to reduce costs by 35%.',
      'Implemented React views generating $50000.',
      'Implemented React views for one million users.',
    ])
      assert.throws(() => admitStudioRewrite(s, output(s, text)), { code: 'UNSUPPORTED_REWRITE' });
  });
  it('retains a candidate-reported metric literally without elevating its truth', () => {
    const s = scope(
      'Implemented React views with the use of components in order to support 25 users.'
    );
    assert.ok(admitStudioRewrite(s, output(s)).includes('25 users'));
    assert.throws(
      () => admitStudioRewrite(s, output(s, s.variants[0].replace('25 users', '250 users'))),
      { statusCode: 422 }
    );
    assert.equal(s.facts[0].provenanceStatus, 'CLAIMED');
  });
  it('unsupported target technologies/qualifications cannot enter text', () => {
    const s = scope();
    for (const text of [
      s.variants[0].replace('React', 'Kubernetes'),
      'Verified Kubernetes expert implementing React views.',
      'Implemented React views after earning a professional certification.',
    ])
      assert.throws(() => admitStudioRewrite(s, output(s, text)), { statusCode: 422 });
  });
  it('rejects employer, title, dates, seniority, ownership and negation changes', () => {
    const s = scope();
    for (const text of [
      'Led an engineering team implementing React views.',
      'Implemented React views as Staff Engineer at New Employer in 2018.',
      'Did not implement React views using component interfaces.',
      'Implemented verified production-scale React interfaces.',
    ])
      assert.throws(() => admitStudioRewrite(s, output(s, text)), { statusCode: 422 });
  });
  it('protects quoted identifiers even where a composer replacement matches them', () => {
    const s = scope('Implemented React views named "In Order To" with the use of components.');
    assert.throws(() => admitStudioRewrite(s, output(s)), { statusCode: 422 });
  });
  it('rejects fabricated facts, citations and truth fields from the model', () => {
    const s = scope();
    for (const value of [
      { ...output(s), factIds: ['fact-99'] },
      { ...output(s), evidenceLinks: [{ url: 'https://github.com/fake' }] },
      { ...output(s), explanation: 'Verified skills' },
      { ...output(s), factIds: [] },
    ])
      assert.throws(() => admitStudioRewrite(s, value), { statusCode: 422 });
  });
  it('sends transient references and no candidate or storage identifiers', () => {
    const s = scope();
    const prompt = JSON.stringify(s.modelContext);
    assert.ok(prompt.includes('fact-1'));
    assert.ok(!prompt.includes(s.profile.id));
    assert.ok(!prompt.includes('Asha'));
    assert.ok(!prompt.includes('asha@example.test'));
    assert.ok(!prompt.includes(s.facts[0].factId));
  });
  it('requires useful source facts and does not manufacture a change for concise text', () => {
    assert.throws(() => scope('Built React views.'), { code: 'NO_WORDING_CHANGE' });
    assert.throws(() => scope('Tiny.'), { code: 'SOURCE_FACT_UNAVAILABLE' });
  });
  it('preserves existing integrity rejection rather than granting arbitrary source claims', () => {
    const s = scope('React views with the use of components for internal workflows.', 'projects');
    assert.throws(() => admitStudioRewrite(s, output(s)), { statusCode: 422 });
  });
  it('generation/decisions reject identity, client text and approval overrides', () => {
    const nodeId = crypto.randomUUID();
    assert.ok(StudioGenerateProposalSchema.safeParse({ expectedRevision: 1, nodeId }).success);
    for (const value of [
      { nodeId },
      { expectedRevision: 1, nodeId, proposedText: 'Untrusted client text' },
      { expectedRevision: 1, nodeId, tenantId: crypto.randomUUID() },
    ])
      assert.equal(StudioGenerateProposalSchema.safeParse(value).success, false);
    assert.ok(
      StudioProposalDecisionSchema.safeParse({ expectedRevision: 1, decision: 'ACCEPT' }).success
    );
    assert.equal(
      StudioProposalDecisionSchema.safeParse({
        expectedRevision: 1,
        decision: 'ACCEPT',
        approved: true,
      }).success,
      false
    );
  });
  it('validates full frontend fixtures with canonical and portable schemas', async () => {
    const schemas = JSON.parse(
      await fs.readFile(
        new URL('../../docs/api/resume-studio-proposals-v1.schema.json', import.meta.url),
        'utf8'
      )
    );
    const ajv = new Ajv();
    for (const [file, schema, zod] of [
      ['resume-studio-proposal-created.json', schemas.proposal, StudioProposalResponseSchema],
      [
        'resume-studio-proposal-accepted.json',
        schemas.decisionResponse,
        StudioProposalDecisionResponseSchema,
      ],
      [
        'resume-studio-proposal-rejected.json',
        schemas.decisionResponse,
        StudioProposalDecisionResponseSchema,
      ],
    ]) {
      const fixture = JSON.parse(
        await fs.readFile(new URL('../fixtures/' + file, import.meta.url), 'utf8')
      );
      zod.parse(fixture.data);
      const validate = ajv.compile(schema);
      assert.ok(validate(fixture.data), JSON.stringify(validate.errors));
    }
  });
});
