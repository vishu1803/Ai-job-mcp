import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumeContentOptimizer,
  OPTIMIZER_MOVE_TYPES,
  OPTIMIZER_MAX_ITERATIONS,
} from '../../src/services/resume-content-optimizer.service.js';

describe('P17: Document-Level Content-Utilization Optimizer', () => {
  it('exports all 8 optimizer move types and bounds iterations to 5', () => {
    assert.equal(OPTIMIZER_MAX_ITERATIONS, 5);
    assert.ok(OPTIMIZER_MOVE_TYPES);
    assert.equal(OPTIMIZER_MOVE_TYPES.ADD_PROJECT_CLAIM, 'ADD_PROJECT_CLAIM');
    assert.equal(OPTIMIZER_MOVE_TYPES.REMOVE_PROJECT_CLAIM, 'REMOVE_PROJECT_CLAIM');
    assert.equal(OPTIMIZER_MOVE_TYPES.REPLACE_PROJECT_CLAIM, 'REPLACE_PROJECT_CLAIM');
    assert.equal(OPTIMIZER_MOVE_TYPES.ADD_EXPERIENCE_CLAIM, 'ADD_EXPERIENCE_CLAIM');
    assert.equal(OPTIMIZER_MOVE_TYPES.ADD_DSA_REPRESENTATION, 'ADD_DSA_REPRESENTATION');
    assert.equal(OPTIMIZER_MOVE_TYPES.REWRITE_SUMMARY, 'REWRITE_SUMMARY');
    assert.equal(OPTIMIZER_MOVE_TYPES.REORDER_SECTIONS, 'REORDER_SECTIONS');
    assert.equal(OPTIMIZER_MOVE_TYPES.COMPRESS_LAYOUT, 'COMPRESS_LAYOUT');
  });

  it('evaluates and ranks candidate moves by expected value when vertical space is available', () => {
    const optimizer = new ResumeContentOptimizer();
    const structuredResume = {
      projects: [
        {
          projectId: 'proj-kv',
          name: 'Key-Value Store',
          bullets: [{ text: 'Architected distributed KV store in Go.' }],
          relevanceScore: 90,
        },
      ],
      experience: [
        {
          id: 'exp-1',
          company: 'TechCorp',
          bullets: [{ text: 'Built backend microservices.' }],
        },
      ],
      summary: {
        text: 'Backend engineer specializing in distributed systems.',
      },
    };

    const factCountMap = new Map([
      ['proj-kv', 3], // 3 facts exist, only 1 rendered
    ]);

    const moves = optimizer._generateCandidateMoves({
      structuredResume,
      projectBulletOverrides: {},
      additionalProjectIds: [],
      inventoryFactCountByProject: factCountMap,
      availableSpacePt: 80, // plenty of space
    });

    assert.ok(Array.isArray(moves));
    assert.ok(moves.length >= 1, 'Should generate at least 1 candidate move');

    // Each move must have spaceCost and expectedValue
    for (const m of moves) {
      assert.ok(typeof m.spaceCost === 'number');
      assert.ok(typeof m.expectedValue === 'number');
      assert.ok(m.description);
    }

    // Moves must be sorted descending by expectedValue
    for (let i = 0; i < moves.length - 1; i++) {
      assert.ok(
        moves[i].expectedValue >= moves[i + 1].expectedValue,
        'Moves must be ranked descending by expected value'
      );
    }
  });

  it('generates prune and layout compression moves when page overflow occurs', () => {
    const optimizer = new ResumeContentOptimizer();
    const structuredResume = {
      projects: [
        {
          projectId: 'proj-1',
          name: 'Project One',
          bullets: [
            { text: 'Bullet one.' },
            { text: 'Bullet two.' },
          ],
        },
      ],
    };

    const moves = optimizer._generateCandidateMoves({
      structuredResume,
      projectBulletOverrides: {},
      additionalProjectIds: [],
      inventoryFactCountByProject: new Map(),
      availableSpacePt: -25, // negative space -> overflow!
    });

    assert.ok(moves.some((m) => m.type === OPTIMIZER_MOVE_TYPES.REMOVE_PROJECT_CLAIM));
    assert.ok(moves.some((m) => m.type === OPTIMIZER_MOVE_TYPES.COMPRESS_LAYOUT));
  });
});
