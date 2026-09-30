import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AtsAnalysisMetadataSchema,
  createAtsAnalysisMetadata,
  PARSER_VERSION,
  TAXONOMY_VERSION,
  SCORING_POLICY_VERSION,
  ROLE_PROFILE_VERSION,
  EVIDENCE_POLICY_VERSION,
  ATS_PROFILE_VERSION,
} from '../../src/domain/career/analysis-metadata.js';

describe('Versioned Reproducibility & Analysis Metadata (Phase 10 / P63)', () => {
  it('validates canonical analysis metadata with all required versions', () => {
    const meta = createAtsAnalysisMetadata();

    assert.equal(meta.parserVersion, PARSER_VERSION);
    assert.equal(meta.taxonomyVersion, TAXONOMY_VERSION);
    assert.equal(meta.scoringPolicyVersion, SCORING_POLICY_VERSION);
    assert.equal(meta.roleProfileVersion, ROLE_PROFILE_VERSION);
    assert.equal(meta.evidencePolicyVersion, EVIDENCE_POLICY_VERSION);
    assert.equal(meta.atsProfileVersion, ATS_PROFILE_VERSION);
    assert.ok(typeof meta.evaluatedAt === 'string');

    // Validates cleanly against schema
    const parsed = AtsAnalysisMetadataSchema.parse(meta);
    assert.ok(parsed);
  });

  it('allows overrides for audit verification while enforcing schema constraints', () => {
    const custom = createAtsAnalysisMetadata({
      scoringPolicyVersion: 'p84.0',
    });
    assert.equal(custom.scoringPolicyVersion, 'p84.0');
    assert.equal(custom.roleProfileVersion, '1.0.0');

    assert.throws(() => {
      AtsAnalysisMetadataSchema.parse({
        ...custom,
        extraUnknownField: 'invalid',
      });
    }, /unrecognized_keys/i);
  });
});
