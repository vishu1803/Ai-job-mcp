/**
 * @file Canonical Truth Category Vocabulary and Normalization Layer
 *
 * Source of Truth:
 * - goal.md Section 12 (AI Truthfulness & Evidence Principle)
 * - goal.md Section 5 (Core Principles - Radical Evidence Provenance)
 * - AGENTS.md Section 14 (Evidence-Based AI)
 *
 * The platform recognizes five canonical truth states:
 * 1. VERIFIED: Directly supported by concrete, authenticated repository code, commits,
 *    file paths, AST symbols, test suites, or verified documents.
 * 2. INFERRED: Deduced by career intelligence from verified surrounding technologies
 *    or parent/child taxonomy relationships without direct citations.
 * 3. CLAIMED: Stated by the candidate (resume claim, bio, self-declared skill, user-provided
 *    profile entry) without authenticated code or repository evidence.
 * 4. MISSING_EVIDENCE: Required capability evaluated against candidate profile with
 *    zero supporting evidence or claims.
 * 5. UNKNOWN: Indeterminate or unparseable truth status.
 */

import { z } from 'zod';

export const CANONICAL_TRUTH_CATEGORIES = Object.freeze([
  'VERIFIED',
  'INFERRED',
  'CLAIMED',
  'MISSING_EVIDENCE',
  'UNKNOWN',
]);

export const CanonicalTruthCategoryEnum = z.enum(CANONICAL_TRUTH_CATEGORIES);

/**
 * Normalizes any raw provenance status, truth label, or database value into
 * the authoritative canonical truth category.
 *
 * Semantic Mapping Rationale:
 * - 'VERIFIED' and 'CORROBORATED' both possess authenticated repository/document evidence.
 *   Corroborated claims have verified repository evidence that backs a resume claim.
 *   -> Maps to 'VERIFIED'.
 * - 'INFERRED' represents architectural or ecosystem deductions.
 *   -> Maps to 'INFERRED'.
 * - 'CLAIMED', 'SELF_DECLARED', 'USER_PROVIDED', 'LEARNING', 'CANDIDATE_DECLARED'
 *   represent candidate assertions without verified repository proof (goal.md Section 12).
 *   Self-declaration never upgrades to verified evidence without proof.
 *   -> Maps to 'CLAIMED'.
 * - 'MISSING', 'MISSING_EVIDENCE', 'NO_EVIDENCE', 'UNBACKED'
 *   represent total absence of evidence.
 *   -> Maps to 'MISSING_EVIDENCE'.
 * - Everything else (undefined, null, empty string, unknown token)
 *   -> Maps to 'UNKNOWN'.
 *
 * @param {string | null | undefined} rawCategory Raw category or provenance status
 * @returns {'VERIFIED' | 'INFERRED' | 'CLAIMED' | 'MISSING_EVIDENCE' | 'UNKNOWN'}
 */
export function normalizeTruthCategory(rawCategory) {
  if (!rawCategory || typeof rawCategory !== 'string') {
    return 'UNKNOWN';
  }

  const normalized = rawCategory.trim().toUpperCase();

  switch (normalized) {
    case 'VERIFIED':
    case 'CORROBORATED':
      return 'VERIFIED';

    case 'INFERRED':
      return 'INFERRED';

    case 'CLAIMED':
    case 'SELF_DECLARED':
    case 'USER_PROVIDED':
    case 'LEARNING':
    case 'CANDIDATE_DECLARED':
      return 'CLAIMED';

    case 'MISSING':
    case 'MISSING_EVIDENCE':
    case 'NO_EVIDENCE':
    case 'NONE':
    case 'UNBACKED':
      return 'MISSING_EVIDENCE';

    case 'UNKNOWN':
      return 'UNKNOWN';

    default:
      return 'UNKNOWN';
  }
}

/**
 * Returns true if the truth category signifies verified evidence.
 * @param {string} category
 * @returns {boolean}
 */
export function isVerifiedTruthCategory(category) {
  return normalizeTruthCategory(category) === 'VERIFIED';
}

/**
 * Returns true if the truth category represents an unverified candidate claim.
 * @param {string} category
 * @returns {boolean}
 */
export function isClaimedTruthCategory(category) {
  return normalizeTruthCategory(category) === 'CLAIMED';
}

/**
 * Returns true if the category is one of the 5 canonical categories.
 * @param {string} category
 * @returns {boolean}
 */
export function isCanonicalTruthCategory(category) {
  return CANONICAL_TRUTH_CATEGORIES.includes(category);
}
