/**
 * @file Shared Employment-Type Classification for Job Adapters (P15-002).
 *
 * Replaces the per-adapter substring heuristic
 * (`combinedText.includes('intern')`) which mis-classified any text merely
 * containing "intern" (e.g. "internet", "internal", "International") as
 * `INTERN`.
 *
 * Word-boundary semantics:
 * - "intern"      -> matches (INTERN)
 * - "internship"  -> matches (INTERN) — preserves the pre-existing product
 *                    semantics where internship postings map to the INTERN
 *                    employment type (see `EmploymentTypeEnum`:
 *                    FULL_TIME | PART_TIME | CONTRACT | INTERNSHIP).
 * - "Internal"    -> does NOT match
 * - "International" -> does NOT match
 * - "internet", "internist", etc. -> do NOT match
 *
 * Product semantics preserved from P15-001: text is classified INTERN first,
 * then CONTRACT, defaulting to FULL_TIME. Detection order and default are
 * unchanged — only the matching precision is fixed.
 */

const INTERN_REGEX = /\bintern(?:ship)?\b/i;
const CONTRACT_REGEX = /\bcontract(?:or|ing|ual)?\b/i;

/**
 * Classifies employment type from free text using word boundaries.
 *
 * @param {string} text Combined title/location/description text
 * @returns {'INTERN'|'CONTRACT'|'FULL_TIME'} Normalized employment type
 */
export function classifyEmploymentType(text) {
  if (!text || typeof text !== 'string') return 'FULL_TIME';

  if (INTERN_REGEX.test(text)) return 'INTERN';
  if (CONTRACT_REGEX.test(text)) return 'CONTRACT';
  return 'FULL_TIME';
}