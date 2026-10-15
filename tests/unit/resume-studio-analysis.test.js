import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  StudioAnalyzeRequestSchema,
  StudioAnalyzeResponseSchema,
} from '../../src/domain/career/resume-studio.schemas.js';
import {
  boundStudioJobText,
  projectStudioKeywords,
} from '../../src/services/resume-studio-analysis.service.js';

const input = { jobTarget: { rawDescription: 'Required practical React experience. '.repeat(4) } };
const term = (matchType = 'EXACT') => ({
  term: 'React',
  canonicalSlug: 'react',
  matchType,
  explanation: 'Lexical finding',
  satisfiesRequirement: matchType !== 'MISSING' && matchType !== 'RELATED',
});
const match = (truthCategory, extra = {}) => ({
  category: 'SKILL',
  skillSlug: 'react',
  truthCategory,
  matchStatus: 'MATCHED',
  explanation: 'Evidence finding',
  ...extra,
});
const chip = (type, truth, extra) =>
  projectStudioKeywords(
    { termBreakdown: [term(type)] },
    { requirementMatches: truth ? [match(truth, extra)] : [] }
  )[0];

describe('Resume Studio analysis contracts and evidence projection', () => {
  it('the complete frontend fixture satisfies the canonical response schema', async () => {
    const fixture = JSON.parse(
      await fs.readFile(
        new URL('../fixtures/resume-studio-analysis-response.json', import.meta.url),
        'utf8'
      )
    );
    assert.equal(fixture.success, true);
    StudioAnalyzeResponseSchema.parse(fixture.data);
  });
  it('accepts pasted job text without candidate identity', () =>
    assert.ok(StudioAnalyzeRequestSchema.safeParse(input).success));
  it('rejects short text and unknown caller-controlled identity/score keys', () => {
    for (const body of [
      { jobTarget: { rawDescription: 'React' } },
      { ...input, tenantId: 'foreign' },
      { jobTarget: { ...input.jobTarget, atsScore: 92 } },
    ])
      assert.equal(StudioAnalyzeRequestSchema.safeParse(body).success, false);
  });
  it('rejects URL-only input and credential/non-HTTP URLs', () => {
    for (const sourceUrl of ['file:///etc/passwd', 'https://user:password@example.test'])
      assert.equal(
        StudioAnalyzeRequestSchema.safeParse({ jobTarget: { ...input.jobTarget, sourceUrl } })
          .success,
        false
      );
    assert.equal(
      StudioAnalyzeRequestSchema.safeParse({ jobTarget: { sourceUrl: 'https://example.test' } })
        .success,
      false
    );
  });
  it('keeps text at bounds and warns on character overflow', () => {
    assert.deepEqual(boundStudioJobText('a'.repeat(50000)), {
      text: 'a'.repeat(50000),
      truncated: false,
    });
    const bounded = boundStudioJobText('a'.repeat(50001));
    assert.equal(bounded.text.length, 50000);
    assert.equal(bounded.truncated, true);
  });
  it('bounds UTF-8 without splitting supplementary Unicode', () => {
    const bounded = boundStudioJobText('😀'.repeat(30000));
    assert.equal(Buffer.byteLength(bounded.text), 51200);
    assert.equal(bounded.text.endsWith('😀'), true);
    assert.equal(bounded.text.includes('\uFFFD'), false);
  });
  it('preserves independently verified and claimed as distinct categories', () => {
    assert.equal(chip('EXACT', 'VERIFIED').category, 'EXACT_VERIFIED');
    assert.equal(chip('EXACT', 'VERIFIED').satisfiesRequirement, true);
    assert.equal(chip('EXACT', 'CLAIMED').category, 'EXACT_CLAIMED');
    assert.equal(chip('EXACT', 'CLAIMED').satisfiesRequirement, false);
  });
  it('keeps aliases separate from truth and never promotes claims', () => {
    assert.equal(chip('TAXONOMY_EQUIVALENT', 'CLAIMED').category, 'TAXONOMY_EQUIVALENT');
    assert.equal(chip('TAXONOMY_EQUIVALENT', 'CLAIMED').truthState, 'CLAIMED');
    assert.equal(chip('TAXONOMY_EQUIVALENT', 'CLAIMED').satisfiesRequirement, false);
  });
  it('related technologies never satisfy exact requirements', () => {
    assert.equal(chip('RELATED', 'VERIFIED').category, 'RELATED_INSUFFICIENT');
    assert.equal(chip('RELATED', 'VERIFIED').satisfiesRequirement, false);
  });
  it('inferred skills never display as matched', () => {
    assert.equal(chip('EXACT', 'INFERRED').category, 'UNSUPPORTED_ON_RESUME');
    assert.equal(chip('EXACT', 'INFERRED').satisfiesRequirement, false);
  });
  it('missing and unknown evidence remain explicit', () => {
    assert.equal(chip('MISSING', null).category, 'MISSING_IN_PROFILE');
    assert.equal(chip('EXACT', 'UNKNOWN').truthState, 'MISSING_EVIDENCE');
  });
  it('negated lexical content cannot satisfy a requirement even with verified profile evidence', () => {
    const result = projectStudioKeywords(
      { termBreakdown: [{ ...term(), satisfiesRequirement: false, polarity: 'NEGATED' }] },
      { requirementMatches: [match('VERIFIED')] }
    );
    assert.equal(result[0].satisfiesRequirement, false);
  });
});
