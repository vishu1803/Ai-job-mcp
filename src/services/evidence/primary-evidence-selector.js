/**
 * @file Primary Evidence Selector (P4-004)
 *
 * Implements deterministic ranking and selection of the anchor primary evidence
 * node for a candidate skill claim.
 *
 * Ranking criteria (highest priority first):
 * 1. Confidence Score (higher score wins)
 * 2. Evidence Type Quality Tier:
 *    - Tier 4 (Highest): PACKAGE_MANIFEST_DEPENDENCY, CODE_IMPORT_USAGE, FILE_PATTERN_MATCH
 *    - Tier 3: README_SPECIFICATION
 *    - Tier 2: COMMIT_CONTRIBUTION
 *    - Tier 1: DIRECTORY_STRUCTURE
 * 3. Freshness / Recency (more recent detectedAt timestamp wins)
 * 4. Deterministic Tie-Breaker (lexical comparison of UUID)
 */

export class PrimaryEvidenceSelector {
  static EVIDENCE_TYPE_TIERS = {
    PACKAGE_MANIFEST_DEPENDENCY: 4,
    CODE_IMPORT_USAGE: 4,
    FILE_PATTERN_MATCH: 4,
    README_SPECIFICATION: 3,
    COMMIT_CONTRIBUTION: 2,
    DIRECTORY_STRUCTURE: 1,
  };

  /**
   * Returns the numeric tier rank for an evidence type.
   *
   * @param {string} evidenceType
   * @returns {number}
   */
  static getTier(evidenceType) {
    return PrimaryEvidenceSelector.EVIDENCE_TYPE_TIERS[evidenceType] || 0;
  }

  /**
   * Compares two evidence items to determine deterministic ordering.
   *
   * @param {object} a - First evidence item.
   * @param {object} b - Second evidence item.
   * @returns {number} Negative if a > b (a ranks higher), positive if b > a, 0 if identical.
   */
  static compare(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    // 1. Confidence Score comparison (higher is better)
    const confA = typeof a.confidenceScore === 'number' ? a.confidenceScore : 0;
    const confB = typeof b.confidenceScore === 'number' ? b.confidenceScore : 0;
    if (confA !== confB) {
      return confB - confA; // descending
    }

    // 2. Evidence Type Tier comparison (higher tier is better)
    const tierA = PrimaryEvidenceSelector.getTier(a.evidenceType);
    const tierB = PrimaryEvidenceSelector.getTier(b.evidenceType);
    if (tierA !== tierB) {
      return tierB - tierA; // descending
    }

    // 3. Recency comparison (newer detectedAt is better)
    const timeA = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
    const timeB = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
    if (timeA !== timeB) {
      return timeB - timeA; // descending
    }

    // 4. Deterministic UUID tie-breaker
    const idA = a.id || '';
    const idB = b.id || '';
    return idA.localeCompare(idB);
  }

  /**
   * Evaluates if a new evidence candidate is strictly stronger than an existing primary evidence node.
   *
   * @param {object} newEvidence
   * @param {object|null} currentPrimary
   * @returns {boolean}
   */
  static isStrongerPrimary(newEvidence, currentPrimary) {
    if (!newEvidence) return false;
    if (!currentPrimary) return true;
    return PrimaryEvidenceSelector.compare(newEvidence, currentPrimary) < 0;
  }

  /**
   * Selects the single strongest primary evidence item from an array of evidence nodes.
   *
   * @param {Array<object>} evidenceItems
   * @returns {object|null}
   */
  static selectBestPrimary(evidenceItems) {
    if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
      return null;
    }

    const sorted = [...evidenceItems].sort(PrimaryEvidenceSelector.compare);
    return sorted[0] || null;
  }
}
