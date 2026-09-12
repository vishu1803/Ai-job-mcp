import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeProfessionalProjectBulletsAsync,
} from '../../src/services/resume-accomplishment-composer.service.js';

describe('P17: Gemini / AI Language Realization Engine', () => {
  const sampleProject = {
    id: 'proj-dist-kv',
    name: 'Distributed Key-Value Store',
    technologies: ['Go', 'Raft', 'Docker'],
    bullets: [
      'Architected distributed key-value store using Raft consensus protocol in Go.',
      'Implemented write-ahead logging (WAL) and memory-mapped SSTables for state recovery.',
    ],
  };

  const sampleCandidate = {
    id: 'cand-123',
    skills: ['Go', 'Raft', 'Docker', 'PostgreSQL'],
    projects: [sampleProject],
  };

  const sampleFacts = [
    {
      factId: 'f-raft-1',
      candidateId: 'cand-123',
      ownerId: 'proj-dist-kv',
      projectId: 'proj-dist-kv',
      text: 'Architected distributed key-value store using Raft consensus protocol in Go.',
      canonicalFactType: 'ARCHITECTURE',
      evidenceRole: 'ARCHITECTURE',
      semanticTopic: 'architecture',
      technologies: ['Go', 'Raft'],
      metrics: [],
      renderable: true,
      provenance: 'VERIFIED',
    },
    {
      factId: 'f-wal-2',
      candidateId: 'cand-123',
      ownerId: 'proj-dist-kv',
      projectId: 'proj-dist-kv',
      text: 'Implemented write-ahead logging (WAL) and memory-mapped SSTables for state recovery.',
      canonicalFactType: 'IMPLEMENTATION',
      evidenceRole: 'IMPLEMENTATION',
      semanticTopic: 'reliability',
      technologies: ['Go'],
      metrics: [],
      renderable: true,
      provenance: 'VERIFIED',
    },
  ];

  it('falls back to deterministic realization when aiProvider is null', async () => {
    const res = await composeProfessionalProjectBulletsAsync({
      facts: sampleFacts,
      project: sampleProject,
      candidateProfile: sampleCandidate,
      aiProvider: null,
      explicitBudget: 2,
    });

    assert.ok(res);
    assert.ok(Array.isArray(res.bullets));
    assert.equal(res.bullets.length, 2);
    for (const b of res.bullets) {
      assert.ok(b.text);
      assert.ok(b.composedFromFactIds.length > 0);
    }
  });

  it('accepts AI realization when output satisfies all 13 validation rules', async () => {
    const mockAiProvider = {
      generateText: async () => ({
        text: 'Architected distributed key-value store in Go utilizing Raft consensus protocol.',
        raw: {
          accomplishmentText: 'Architected distributed key-value store in Go utilizing Raft consensus protocol.',
          primaryAction: 'architected',
          technologiesMentioned: ['Go', 'Raft'],
          authenticMetricsMentioned: [],
          factIdsUsed: ['f-raft-1'],
        },
      }),
    };

    const res = await composeProfessionalProjectBulletsAsync({
      facts: sampleFacts,
      project: sampleProject,
      candidateProfile: sampleCandidate,
      aiProvider: mockAiProvider,
      explicitBudget: 1,
    });

    assert.ok(res);
    assert.equal(res.bullets.length, 1);
    assert.equal(
      res.bullets[0].text,
      'Architected distributed key-value store in Go utilizing Raft consensus protocol.'
    );
    assert.deepEqual(res.bullets[0].composedFromFactIds, ['f-raft-1']);
  });

  it('falls back to deterministic realization if AI output hallucinates unsupported metric', async () => {
    let callCount = 0;
    const mockAiProvider = {
      generateText: async () => {
        callCount++;
        return {
          // Hallucinated metric "99.999% availability" not in facts
          text: 'Architected distributed key-value store in Go achieving 99.999% availability across 10 regions.',
          raw: {},
        };
      },
    };

    const res = await composeProfessionalProjectBulletsAsync({
      facts: sampleFacts,
      project: sampleProject,
      candidateProfile: sampleCandidate,
      aiProvider: mockAiProvider,
      explicitBudget: 1,
    });

    assert.ok(callCount > 0, 'AI provider should have been called');
    assert.ok(res.bullets.length > 0, 'Must not drop bullet on validation failure');
    // Fallback bullet must NOT contain the hallucinated metric
    assert.ok(!res.bullets[0].text.includes('99.999%'));
    assert.ok(res.bullets[0].text.includes('Raft'));
  });

  it('falls back to deterministic realization if AI provider throws', async () => {
    const failingAiProvider = {
      generateText: async () => {
        throw new Error('Gemini API quota exceeded or network disconnect');
      },
    };

    const res = await composeProfessionalProjectBulletsAsync({
      facts: sampleFacts,
      project: sampleProject,
      candidateProfile: sampleCandidate,
      aiProvider: failingAiProvider,
      explicitBudget: 2,
    });

    assert.ok(res);
    assert.equal(res.bullets.length, 2);
    assert.ok(res.bullets[0].text.length > 0);
  });
});
