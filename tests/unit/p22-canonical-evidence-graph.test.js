import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonicalJobRequirements,
  buildCandidateJobEvidenceGraph,
  calculateRequirementCoverage,
  scoreFactsForJob,
} from '../../src/services/candidate-fact-inventory.service.js';

describe('P22 canonical candidate/job evidence graph', () => {
  const facts = [
    {
      factId: 'fact-python',
      text: 'Implemented REST API services in Python with FastAPI.',
      technologies: ['Python', 'FastAPI'],
      confidence: 0.95,
      semanticTopic: 'implementation',
    },
    {
      factId: 'fact-generic',
      text: 'Software engineer with application development experience.',
      technologies: [],
      confidence: 1,
    },
  ];

  const backendJob = {
    title: 'Software Engineer',
    requirements: [
      { id: 'python', text: 'Python', category: 'SKILL', importance: 'REQUIRED' },
      { id: 'fastapi', text: 'FastAPI', category: 'SKILL', importance: 'REQUIRED' },
      { id: 'postgresql', text: 'PostgreSQL', category: 'SKILL', importance: 'PREFERRED' },
    ],
  };

  it('creates deterministic normalized requirements and edges', () => {
    const first = buildCanonicalJobRequirements(backendJob);
    const second = buildCanonicalJobRequirements(backendJob);
    const graph = buildCandidateJobEvidenceGraph(facts, backendJob);

    assert.equal(first.jobFingerprint, second.jobFingerprint);
    assert.deepEqual(
      first.normalizedRequirements.map((requirement) => requirement.id),
      ['python', 'fastapi', 'postgresql']
    );
    assert.ok(graph.matches.some((match) => match.factId === 'fact-python'));
    assert.ok(!graph.matches.some((match) => match.factId === 'fact-generic'));
  });

  it('uses the same graph semantics for coverage and fact scoring', () => {
    const graph = buildCandidateJobEvidenceGraph(facts, backendJob);
    const coverage = calculateRequirementCoverage(facts, backendJob);
    const scored = scoreFactsForJob(facts, backendJob);
    const scoredPython = scored.find((fact) => fact.factId === 'fact-python');

    assert.deepEqual(
      [...new Set(graph.matches.map((match) => match.requirementId))].sort(),
      coverage.matchedRequirementIds.sort()
    );
    assert.deepEqual(
      scoredPython.matchedRequirementIds.sort(),
      [
        ...new Set(
          graph.matches
            .filter((match) => match.factId === 'fact-python')
            .map((match) => match.requirementId)
        ),
      ].sort()
    );
    assert.equal(
      scored.find((fact) => fact.factId === 'fact-generic').matchedRequirementIds.length,
      0
    );
  });

  it('normalizes equivalent structured and raw line-based job inputs identically', () => {
    const structured = buildCanonicalJobRequirements({
      title: 'Software Engineer',
      requirements: ['Python', 'FastAPI', 'PostgreSQL'],
    });
    const raw = buildCanonicalJobRequirements({
      title: 'Software Engineer',
      description: 'Python\nFastAPI\nPostgreSQL',
    });

    assert.equal(raw.jobFingerprint, structured.jobFingerprint);
  });
});
