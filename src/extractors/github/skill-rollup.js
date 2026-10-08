/**
 * @file Candidate Skill Rollup & Provenance Scoring (P4-003)
 *
 * Implements the mathematical rollup aggregation formula for candidate skills:
 * RollupScore = min(1.0, max(item.confidenceScore) * (0.8 + 0.05 * min(4, evidenceCount)))
 *
 * Classifies provenanceStatus into:
 * - INFERRED: Repository observations, including source-backed static references.
 * - CLAIMED: Unverified user assertions or manual claims.
 * - MISSING: No detected evidence.
 */

export class SkillRollupCalculator {
  /**
   * Computes aggregated rollup metrics for a candidate skill from its evidence items.
   *
   * @param {Array<{ confidenceScore: number, evidenceType: string, detectedAt?: Date | string }>} evidenceItems
   * @returns {{ confidenceScore: number, provenanceStatus: 'VERIFIED' | 'INFERRED' | 'CLAIMED' | 'MISSING', evidenceCount: number, firstObservedAt: Date | null, lastObservedAt: Date | null }}
   */
  static calculateRollup(evidenceItems) {
    evidenceItems = Array.isArray(evidenceItems)
      ? evidenceItems.filter((item) => item.metadata?.verification?.status !== 'INVALID')
      : [];
    if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) {
      return {
        confidenceScore: 0.0,
        provenanceStatus: 'MISSING',
        evidenceCount: 0,
        firstObservedAt: null,
        lastObservedAt: null,
      };
    }

    const count = evidenceItems.length;
    let maxConfidence = 0.0;
    let hasInferredType = false;
    let earliestTime = Infinity;
    let latestTime = -Infinity;

    for (const item of evidenceItems) {
      const conf = typeof item.confidenceScore === 'number' ? item.confidenceScore : 0.0;
      if (conf > maxConfidence) {
        maxConfidence = conf;
      }

      // Repository observations do not independently establish candidate proficiency.
      if (item.evidenceType !== 'DOCUMENT_CLAIM') {
        hasInferredType = true;
      }

      if (item.detectedAt) {
        const time = new Date(item.detectedAt).getTime();
        if (!Number.isNaN(time)) {
          if (time < earliestTime) earliestTime = time;
          if (time > latestTime) latestTime = time;
        }
      }
    }

    // Mathematical formula: RollupScore = min(1.0, max(conf) * (0.8 + 0.05 * min(4, evidenceCount)))
    const cappedCount = Math.min(4, count);
    const multiplier = 0.8 + 0.05 * cappedCount;
    const rawRollup = maxConfidence * multiplier;
    const boundedRollup = Math.min(1.0, Math.max(0.0, Number(rawRollup.toFixed(2))));

    // Determine provenance status
    const provenanceStatus = hasInferredType ? 'INFERRED' : 'CLAIMED';

    const firstObservedAt = earliestTime !== Infinity ? new Date(earliestTime) : new Date();
    const lastObservedAt = latestTime !== -Infinity ? new Date(latestTime) : new Date();

    return {
      confidenceScore: boundedRollup,
      provenanceStatus,
      evidenceCount: count,
      firstObservedAt,
      lastObservedAt,
    };
  }
}
