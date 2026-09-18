/**
 * @file Unit Test: P85 Consensus Governance & Truth Separation
 *
 * Verifies:
 * 1. Semantic consensus calculation preserving conflicting positions as CONFLICTING + NO_AUTO_ACTION.
 * 2. Separation of consensus from truth (Rule 44): candidate evidence outranks model consensus.
 * 3. 3/3 model consensus requesting unevidenced AWS is strictly blocked as UNSAFE_FABRICATION.
 * 4. Safe optimization mappings: pruning unevidenced NestJS -> SAFE_FIX, 40% metric -> CONDITIONAL.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEvaluatorFindings,
  calculateSemanticConsensus,
  auditFindingAgainstEvidence,
} from '../../src/domain/career/calibration/semantic-finding-normalizer.js';

describe('P85: Consensus Governance & Truth Separation', () => {
  it('1. Conflicting stances on Redis vs. NoSQL produce CONFLICTING with NO_AUTO_ACTION', () => {
    const rawFindings = [
      'Redis does not satisfy the NoSQL requirement.', // Claude: REJECT
      'Candidate demonstrates NoSQL experience via Redis.', // Gemini: SUPPORT
      'Redis is related to NoSQL concepts but not equivalent.', // Grok: PARTIAL
    ];

    const normalized = [
      ...normalizeEvaluatorFindings([rawFindings[0]], 'claude'),
      ...normalizeEvaluatorFindings([rawFindings[1]], 'gemini'),
      ...normalizeEvaluatorFindings([rawFindings[2]], 'grok'),
    ];

    const consensusList = calculateSemanticConsensus(normalized);
    const nosqlFinding = consensusList.find((c) => c.subject === 'NOSQL_DATABASE');

    assert.ok(nosqlFinding, 'NOSQL_DATABASE finding must exist');
    assert.equal(nosqlFinding.classification, 'CONFLICTING');
    assert.equal(nosqlFinding.action, 'NO_AUTO_ACTION');
    assert.equal(nosqlFinding.positions.length, 3);

    const stances = nosqlFinding.positions.map((p) => p.stance);
    assert.ok(stances.includes('REJECT'));
    assert.ok(stances.includes('SUPPORT'));
    assert.ok(stances.includes('PARTIAL'));
  });

  it('2. Unanimous model consensus requesting AWS is BLOCKED as UNSAFE_FABRICATION when candidate has no AWS facts', () => {
    // All 3 models agree that cloud platform is missing
    const rawFindings = [
      'No cloud platform experience.', // Claude
      'Missing AWS/GCP/Azure experience.', // Gemini
      'No hyperscaler cloud exposure.', // Grok
    ];

    const normalized = [
      ...normalizeEvaluatorFindings([rawFindings[0]], 'claude'),
      ...normalizeEvaluatorFindings([rawFindings[1]], 'gemini'),
      ...normalizeEvaluatorFindings([rawFindings[2]], 'grok'),
    ];

    const consensusList = calculateSemanticConsensus(normalized);
    const cloudConsensus = consensusList.find((c) => c.subject === 'CLOUD_PLATFORM');

    assert.ok(cloudConsensus);
    assert.equal(cloudConsensus.classification, 'CONSENSUS');

    // Candidate has ZERO cloud facts in canonical profile
    const candidateWithoutCloud = {
      facts: [
        { statement: 'Built microservices using Go and PostgreSQL.' },
        { statement: 'Developed frontend with React and Next.js.' },
      ],
      projects: [{ name: 'Task Manager', technologies: ['Node.js', 'PostgreSQL'] }],
    };

    // Audit against candidate truth
    const audited = auditFindingAgainstEvidence(cloudConsensus, candidateWithoutCloud);

    assert.equal(audited.evidenceStatus, 'UNSUPPORTED');
    assert.equal(audited.action, 'UNSAFE_FABRICATION');
    assert.match(audited.rationale, /Hallucination blocked/);
  });

  it('3. Evidence recovery: When candidate facts contain verified cloud evidence, action is SAFE_FIX', () => {
    const rawFindings = [
      'No cloud platform experience.',
      'Missing AWS/GCP/Azure experience.',
      'No hyperscaler cloud exposure.',
    ];

    const normalized = [
      ...normalizeEvaluatorFindings([rawFindings[0]], 'claude'),
      ...normalizeEvaluatorFindings([rawFindings[1]], 'gemini'),
      ...normalizeEvaluatorFindings([rawFindings[2]], 'grok'),
    ];

    const cloudConsensus = calculateSemanticConsensus(normalized).find((c) => c.subject === 'CLOUD_PLATFORM');

    // Candidate actually has verified AWS experience in canonical facts
    const candidateWithCloud = {
      facts: [{ statement: 'Deployed production microservices to AWS ECS and S3.' }],
      projects: [{ name: 'Cloud Migration', technologies: ['AWS', 'Docker'] }],
    };

    const audited = auditFindingAgainstEvidence(cloudConsensus, candidateWithCloud);

    assert.equal(audited.evidenceStatus, 'VERIFIED');
    assert.equal(audited.action, 'SAFE_FIX');
    assert.match(audited.rationale, /Safe to restore/);
  });

  it('4. Pruning unevidenced NestJS is mapped to SAFE_FIX', () => {
    const rawFindings = [
      'NestJS claimed in summary without backing evidence.',
      'NestJS unsupported claim in professional summary.',
      'Summary claims NestJS but absent from projects.',
    ];

    const normalized = [
      ...normalizeEvaluatorFindings([rawFindings[0]], 'claude'),
      ...normalizeEvaluatorFindings([rawFindings[1]], 'gemini'),
      ...normalizeEvaluatorFindings([rawFindings[2]], 'grok'),
    ];

    const nestConsensus = calculateSemanticConsensus(normalized).find((c) => c.subject === 'NESTJS_EXPERIENCE');
    assert.ok(nestConsensus);

    const candidateWithoutNest = { facts: [], projects: [] };
    const audited = auditFindingAgainstEvidence(nestConsensus, candidateWithoutNest);

    assert.equal(audited.evidenceStatus, 'UNSUPPORTED');
    assert.equal(audited.action, 'SAFE_FIX');
    assert.match(audited.rationale, /Prune unevidenced NestJS/);
  });

  it('5. Unanchored 40% metric precision is mapped to CONDITIONAL_USER_CONFIRMATION', () => {
    const rawFindings = [
      '40% reduction in page load time lacks baseline measurement context.',
      'Page load 40% metric has insufficient evidence.',
    ];

    const normalized = [
      ...normalizeEvaluatorFindings([rawFindings[0]], 'claude'),
      ...normalizeEvaluatorFindings([rawFindings[1]], 'gemini'),
    ];

    const metricConsensus = calculateSemanticConsensus(normalized).find(
      (c) => c.subject === 'METRIC_PRECISION_40_PERCENT'
    );
    assert.ok(metricConsensus);

    const audited = auditFindingAgainstEvidence(metricConsensus, { facts: [] });

    assert.equal(audited.evidenceStatus, 'PARTIALLY_SUPPORTED');
    assert.equal(audited.action, 'CONDITIONAL_USER_CONFIRMATION');
  });
});
