import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDrafts, sameIds } from '../../public/js/resume-studio-state.js';

test('current employment status changes require review against a concurrent explicit end date', () => {
  const before = {
    structuredResume: { experience: [{ endDate: null, isCurrent: false }] },
    nodes: [{ nodeId: 'end', editable: true, path: ['experience', 0, 'endDate'] }],
    selection: { experienceIds: [], projectIds: [], bulletIds: [], skillIds: [] },
  };
  const server = structuredClone(before);
  server.structuredResume.experience[0].isCurrent = true;
  const result = compareDrafts(
    before,
    server,
    new Map([['end', { text: '2025-01' }]]),
    before.selection
  );
  assert.equal(result.fieldConflicts.length, 1);
  assert.equal(result.fieldConflicts[0].serverText, 'Present');
  assert.equal(result.fieldConflicts[0].selectedChoice, null);
});

const base = {
  structuredResume: { experience: [{ bullets: ['First source', 'Second source'] }] },
  nodes: [0, 1].map((i) => ({
    nodeId: `b${i}`,
    editable: true,
    path: ['experience', 0, 'bullets', i],
  })),
  selection: {
    experienceIds: ['role'],
    projectIds: ['p1'],
    bulletIds: ['b0', 'b1'],
    skillIds: ['s1'],
  },
};
test('selection equality detects equal-size replacement and ignores order', () => {
  assert.equal(sameIds(['a'], ['b']), false);
  assert.equal(sameIds(['a', 'b'], ['b', 'a']), true);
});
test('different field edits retain server content and merge only local deltas', () => {
  const server = structuredClone(base);
  server.structuredResume.experience[0].bullets[1] = 'Server second';
  server.selection.projectIds.push('p2');
  const local = structuredClone(base.selection);
  local.skillIds.push('s2');
  const result = compareDrafts(base, server, new Map([['b0', { text: 'Local first' }]]), local);
  assert.equal(result.fieldConflicts.length, 0);
  assert.equal(result.safeMerges[0].serverText, 'Server second');
  assert.deepEqual(result.selection.projectIds, ['p1', 'p2']);
  assert.deepEqual(result.selection.skillIds, ['s1', 's2']);
});
test('colliding wording requires an explicit choice and preserves all three texts', () => {
  const server = structuredClone(base);
  server.structuredResume.experience[0].bullets[0] = 'Server first';
  const [conflict] = compareDrafts(
    base,
    server,
    new Map([['b0', { text: 'Local first' }]]),
    base.selection
  ).fieldConflicts;
  assert.equal(conflict.selectedChoice, null);
  assert.deepEqual(
    [conflict.baseText, conflict.serverText, conflict.localText],
    ['First source', 'Server first', 'Local first']
  );
});
test('deleted or repointed nodes cannot silently receive local edits', () => {
  const server = structuredClone(base);
  server.nodes.shift();
  const result = compareDrafts(base, server, new Map([['b0', { text: 'Local' }]]), base.selection);
  assert.equal(result.fieldConflicts[0].missing, true);
});
test('matching edits and per-item selection removals combine without reverting unrelated changes', () => {
  const server = structuredClone(base);
  server.structuredResume.experience[0].bullets[0] = 'Same';
  server.selection.skillIds.push('s2');
  const local = structuredClone(base.selection);
  local.skillIds = [];
  const result = compareDrafts(base, server, new Map([['b0', { text: 'Same' }]]), local);
  assert.equal(result.fieldConflicts.length, 0);
  assert.deepEqual(result.selection.skillIds, ['s2']);
  assert.deepEqual(base.selection.skillIds, ['s1']);
});
