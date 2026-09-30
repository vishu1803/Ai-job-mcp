/**
 * @file Analysis Metadata & Versioned Reproducibility Specification
 *
 * Implements unified analysis metadata tracking ensuring 100% reproducible evaluations:
 * - parserVersion: Canonical document & PDF parser version
 * - taxonomyVersion: Canonical skill taxonomy engine version
 * - scoringPolicyVersion: Deterministic candidate-job fit scoring policy version
 * - roleProfileVersion: Role-specific scoring profile version
 * - evidencePolicyVersion: Evidence provenance & verification firewall version
 * - atsProfileVersion: ATS compatibility profiles version
 */

import { z } from 'zod';
import { ATS_EXTRACTION_MODEL_VERSION } from './ats-extraction-model.schemas.js';
import { SKILL_TAXONOMY_VERSION } from './skill-taxonomy.js';
import { ROLE_PROFILE_VERSION } from './role-scoring-profiles.js';
import { ATS_PROFILE_SCHEMA_VERSION } from './ats-compatibility-profiles.schemas.js';
import { DEFAULT_SCORE_VERSION } from './scoring-policy.js';

export const EVIDENCE_POLICY_VERSION = '1.0.0';
export const SCORING_POLICY_VERSION = DEFAULT_SCORE_VERSION;
export const PARSER_VERSION = ATS_EXTRACTION_MODEL_VERSION;
export const TAXONOMY_VERSION = SKILL_TAXONOMY_VERSION;
export const ATS_PROFILE_VERSION = ATS_PROFILE_SCHEMA_VERSION;
export { ROLE_PROFILE_VERSION };

export const AtsAnalysisMetadataSchema = z
  .object({
    parserVersion: z.string().trim().min(1).default(PARSER_VERSION),
    taxonomyVersion: z.string().trim().min(1).default(TAXONOMY_VERSION),
    scoringPolicyVersion: z.string().trim().min(1).default(SCORING_POLICY_VERSION),
    roleProfileVersion: z.string().trim().min(1).default(ROLE_PROFILE_VERSION),
    evidencePolicyVersion: z.string().trim().min(1).default(EVIDENCE_POLICY_VERSION),
    atsProfileVersion: z.string().trim().min(1).default(ATS_PROFILE_VERSION),
    evaluatedAt: z.string().datetime().optional(),
  })
  .strict();

/**
 * Creates a validated analysis metadata block for reproducible career intelligence audits.
 *
 * @param {object} [overrides={}]
 * @returns {object} Validated AtsAnalysisMetadata
 */
export function createAtsAnalysisMetadata(overrides = {}) {
  return AtsAnalysisMetadataSchema.parse({
    parserVersion: PARSER_VERSION,
    taxonomyVersion: TAXONOMY_VERSION,
    scoringPolicyVersion: SCORING_POLICY_VERSION,
    roleProfileVersion: ROLE_PROFILE_VERSION,
    evidencePolicyVersion: EVIDENCE_POLICY_VERSION,
    atsProfileVersion: ATS_PROFILE_VERSION,
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  });
}
