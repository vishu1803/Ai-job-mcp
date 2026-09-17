/**
 * @file Shared Employment-Type Classification for Job Adapters (P15-002 / P76).
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
 * P76 Precision Hardening:
 * - "contract" / "contractor" / "contracting" -> matches (CONTRACT)
 * - "pre-contractual", "contractual obligations" in GDPR/legal notices -> does NOT match
 * - Structured employment-type normalizer `normalizeEmploymentType` for DOM criteria/JSON-LD.
 *
 * Product semantics preserved from P15-001: text is classified INTERN first,
 * then CONTRACT, defaulting to FULL_TIME. Detection order and default are
 * unchanged — only the matching precision is fixed.
 */

const INTERN_REGEX = /(?<![\w-])intern(?:ship)?\b/i;
const CONTRACT_REGEX = /(?<![\w-])contract(?:or|ing)?\b|\bcontractual\s+basis\b|\bcontract\s+(?:role|position|basis|engagement)\b/i;

/**
 * Normalizes an explicit employment-type string (e.g. from DOM criteria or JSON-LD).
 *
 * @param {unknown} value
 * @returns {'FULL_TIME'|'PART_TIME'|'CONTRACT'|'INTERN'|null}
 */
export function normalizeEmploymentType(value) {
  if (!value || typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  if (!clean) return null;

  if (clean.includes('intern')) return 'INTERN';
  if (clean.includes('part') && clean.includes('time')) return 'PART_TIME';
  if (clean.includes('contract') || clean.includes('temporary') || clean.includes('freelance')) return 'CONTRACT';
  if (clean.includes('full') && clean.includes('time')) return 'FULL_TIME';

  return null;
}

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