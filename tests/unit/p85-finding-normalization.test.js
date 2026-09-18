/**
 * @file Unit Test: P85 Semantic Finding Normalizer
 *
 * Verifies:
 * 1. Synonymous cloud platform phrasings converge to canonical MISSING_PREFERRED_SKILL / CLOUD_PLATFORM.
 * 2. Distinct technical findings map to their respective taxonomy categories and subjects.
 * 3. Redis vs. NoSQL debate preserves distinct semantic stances (SUPPORT vs REJECT vs PARTIAL).
 * 4. Deterministic normalization reproducibility (zero LLM in consensus path).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSingleFinding,
  normalizeEvaluatorFindings,
} from '../../src/domain/career/calibration/semantic-finding-normalizer.js';

describe('P85: Semantic Finding Normalizer', () => {
  it('1. Converges divergent cloud platform phrasings into canonical CLOUD_PLATFORM', () => {
    const claudeRaw = 'No cloud platform experience (AWS/GCP/Azure) despite this being an explicit good-to-have item.';
    const geminiRaw = 'Missing AWS/GCP/Azure experience across projects.';
    const grokRaw = 'No hyperscaler cloud exposure in technical skills.';

    const normClaude = normalizeSingleFinding(claudeRaw, 'claude');
    const normGemini = normalizeSingleFinding(geminiRaw, 'gemini');
    const normGrok = normalizeSingleFinding(grokRaw, 'grok');

    // All three should map to the exact same category and subject with SUPPORT stance
    assert.equal(normClaude.category, 'MISSING_PREFERRED_SKILL');
    assert.equal(normGemini.category, 'MISSING_PREFERRED_SKILL');
    assert.equal(normGrok.category, 'MISSING_PREFERRED_SKILL');

    assert.equal(normClaude.subject, 'CLOUD_PLATFORM');
    assert.equal(normGemini.subject, 'CLOUD_PLATFORM');
    assert.equal(normGrok.subject, 'CLOUD_PLATFORM');

    assert.equal(normClaude.stance, 'SUPPORT');
    assert.equal(normGemini.stance, 'SUPPORT');
    assert.equal(normGrok.stance, 'SUPPORT');
  });

  it('2. Maps varied candidate issues to their distinct canonical categories', () => {
    const findings = [
      {
        raw: 'Degree is B.Tech in Electronics Engineering, not Computer Science/IT as the JD specifies.',
        expectedCat: 'DEGREE_REQUIREMENT_MISMATCH',
        expectedSubject: 'COMPUTER_SCIENCE_DEGREE',
      },
      {
        raw: 'NestJS is claimed in the professional summary but does not appear in Technical Skills or projects — unsupported claim.',
        expectedCat: 'UNSUPPORTED_CLAIM',
        expectedSubject: 'NESTJS_EXPERIENCE',
      },
      {
        raw: '40% reduction in page load time during a short internship has no supporting context or baseline measurement.',
        expectedCat: 'METRIC_EVIDENCE_GAP',
        expectedSubject: 'METRIC_PRECISION_40_PERCENT',
      },
      {
        raw: 'Contact links lack visible fallback URLs for ATS text extraction.',
        expectedCat: 'LINK_EXTRACTION_RISK',
        expectedSubject: 'CONTACT_VISIBLE_URLS',
      },
      {
        raw: 'Employment date intervals use inconsistent date dash formatting.',
        expectedCat: 'DATE_FORMAT_RISK',
        expectedSubject: 'DATE_RANGE_EN_DASH',
      },
      {
        raw: 'Missing AI coding tools (Copilot, Cursor) mentioned in JD preferred requirements.',
        expectedCat: 'MISSING_PREFERRED_SKILL',
        expectedSubject: 'AI_CODING_TOOLS',
      },
    ];

    for (const f of findings) {
      const norm = normalizeSingleFinding(f.raw, 'test-evaluator');
      assert.equal(norm.category, f.expectedCat, `Expected ${f.expectedCat} for "${f.raw}"`);
      assert.equal(norm.subject, f.expectedSubject, `Expected ${f.expectedSubject} for "${f.raw}"`);
      assert.ok(norm.findingId);
    }
  });

  it('3. Preserves distinct stances on the Redis vs. NoSQL requirement (SUPPORT vs REJECT vs PARTIAL)', () => {
    const claudeRaw = 'Redis is a cache and does not satisfy the NoSQL database requirement; candidate has a gap here.';
    const geminiRaw = 'Candidate demonstrates NoSQL experience via Redis caching clusters.';
    const grokRaw = 'Redis is related to NoSQL but is not equivalent to document databases.';

    const normClaude = normalizeSingleFinding(claudeRaw, 'claude');
    const normGemini = normalizeSingleFinding(geminiRaw, 'gemini');
    const normGrok = normalizeSingleFinding(grokRaw, 'grok');

    assert.equal(normClaude.subject, 'NOSQL_DATABASE');
    assert.equal(normGemini.subject, 'NOSQL_DATABASE');
    assert.equal(normGrok.subject, 'NOSQL_DATABASE');

    // Critical assertion: Stances MUST remain distinct!
    assert.equal(normClaude.stance, 'REJECT', 'Claude must reject Redis as satisfying NoSQL');
    assert.equal(normGemini.stance, 'SUPPORT', 'Gemini must support Redis as satisfying NoSQL');
    assert.equal(normGrok.stance, 'PARTIAL', 'Grok must classify Redis as partial/related');
  });

  it('4. Normalization is strictly deterministic', () => {
    const raw = 'Missing AWS/GCP/Azure cloud platform experience.';
    const first = normalizeSingleFinding(raw, 'eval-1');

    for (let i = 0; i < 10; i++) {
      const next = normalizeSingleFinding(raw, 'eval-1');
      assert.deepEqual(first, next, 'Repeated normalization must produce identical output');
    }
  });
});
