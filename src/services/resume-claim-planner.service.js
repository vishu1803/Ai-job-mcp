/**
 * @file Professional Resume Claim Planner Service (P17 Architecture)
 *
 * Runs BEFORE language realization. Plans structured, complementary narrative
 * claim groups from the canonical fact inventory for projects, experiences,
 * and sections:
 *
 *   Canonical Facts
 *     ↓
 *   Semantic Dimension Clustering
 *     ↓
 *   Information Value & Marginal Utility Evaluation
 *     ↓
 *   Description vs Accomplishment Separation
 *     ↓
 *   Pairwise Redundancy & Fact-Reuse Prevention
 *     ↓
 *   Targeted Candidate Claim Groups (1–3 Complementary Dimensions)
 *
 * Invariants:
 * 1. Zero invention: factIds point strictly to authorized canonical facts.
 * 2. Description-only facts are prevented from consuming accomplishment slots.
 * 3. Complementary semantic dimensions (never 3 bullets saying the same thing).
 * 4. Deterministic: same canonical facts + job -> identical claim plan.
 */

import crypto from 'node:crypto';
import {
  EVIDENCE_ROLES,
  OMISSION_REASONS,
  isAccomplishmentCandidate,
  isProjectDescriptionFact,
} from './candidate-fact-inventory.service.js';
import { calculateFactSemanticOverlap } from './candidate-artifact-content.service.js';

/**
 * Standard semantic dimension clusters for complementary engineering bullets.
 */
export const SEMANTIC_DIMENSION_CLUSTERS = Object.freeze([
  {
    key: 'architecture',
    label: 'Architecture & System Design',
    roles: [EVIDENCE_ROLES.ARCHITECTURE],
    topics: ['architecture', 'distributed', 'consensus', 'microservices', 'pipeline', 'queue', 'sharding'],
  },
  {
    key: 'reliability',
    label: 'Reliability, Telemetry & Resilience',
    roles: [EVIDENCE_ROLES.RELIABILITY, EVIDENCE_ROLES.SECURITY],
    topics: ['reliability', 'telemetry', 'observability', 'resilient', 'fault-tolerant', 'recovery', 'logging', 'monitoring'],
  },
  {
    key: 'performance_outcome',
    label: 'Performance, Optimization & Metrics',
    roles: [EVIDENCE_ROLES.PERFORMANCE, EVIDENCE_ROLES.OUTCOME, EVIDENCE_ROLES.METRIC],
    topics: ['performance', 'outcome', 'latency', 'throughput', 'speed', 'scale', 'benchmark'],
  },
  {
    key: 'integration_api',
    label: 'APIs, Protocols & Integration',
    roles: [EVIDENCE_ROLES.INTEGRATION],
    topics: ['integration', 'api', 'rest', 'grpc', 'graphql', 'websocket', 'oauth', 'webhook'],
  },
  {
    key: 'tooling_automation',
    label: 'Tooling, CI/CD & Infrastructure',
    roles: [EVIDENCE_ROLES.FEATURE],
    topics: ['tooling', 'docker', 'ci/cd', 'containerized', 'kubernetes', 'automated'],
  },
  {
    key: 'implementation',
    label: 'Core Implementation & Systems Engineering',
    roles: [EVIDENCE_ROLES.IMPLEMENTATION, EVIDENCE_ROLES.ACTION],
    topics: ['implementation', 'core', 'engine', 'logic', 'protocol', 'systems', 'engineered'],
  },
]);

export class ResumeClaimPlannerService {
  /**
   * Plans complementary claim groups for a specific project or experience entity.
   *
   * @param {object} params
   * @param {Array<object>} params.facts Canonical facts associated with the entity
   * @param {string} params.ownerType 'PROJECT' | 'EXPERIENCE' | 'DSA' | 'SUMMARY'
   * @param {string} params.ownerId Entity identifier
   * @param {object} [params.jobPosting] Target job posting for relevance scoring
   * @param {number} [params.targetBullets=3] Maximum desired bullets (1 to 3)
   * @param {Set<string>} [params.globallyUsedFactIds=new Set()] Fact IDs already consumed
   * @returns {{ plannedClaims: Array<object>, omittedFacts: Array<object>, diagnostic: object }}
   */
  planClaims({
    facts = [],
    ownerType = 'PROJECT',
    ownerId = '',
    jobPosting = null,
    targetBullets = 3,
    globallyUsedFactIds = new Set(),
  }) {
    const cleanFacts = (Array.isArray(facts) ? facts : []).filter((f) => f && f.renderable !== false);

    if (cleanFacts.length === 0) {
      return {
        plannedClaims: [],
        omittedFacts: [],
        diagnostic: { reason: 'NO_RENDERABLE_FACTS', candidateGroupCount: 0 },
      };
    }

    // Filter available facts not consumed globally
    const availableFacts = cleanFacts.filter((f) => !globallyUsedFactIds.has(f.factId));

    // 1. Separate accomplishment facts from pure description facts
    const accomplishmentFacts = availableFacts.filter((f) => isAccomplishmentCandidate(f));
    const descriptionFacts = availableFacts.filter((f) => isProjectDescriptionFact(f));
    const otherFacts = availableFacts.filter(
      (f) => !isAccomplishmentCandidate(f) && !isProjectDescriptionFact(f)
    );

    // 2. Generate candidate claim groups across dimension clusters
    const candidateGroups = this._clusterFactsIntoClaimGroups({
      accomplishmentFacts,
      descriptionFacts,
      otherFacts,
      ownerType,
      ownerId,
      jobPosting,
    });

    // 3. Score each candidate claim group
    for (const group of candidateGroups) {
      this._scoreClaimGroup(group, cleanFacts);
    }

    // 4. Sort groups by information value and job relevance (order-invariant tie-breaking)
    candidateGroups.sort((a, b) => {
      // Accomplishments strictly preferred over description-only groups
      if (a.descriptionOnlyRisk !== b.descriptionOnlyRisk) {
        return a.descriptionOnlyRisk ? 1 : -1;
      }
      if (b.informationValue !== a.informationValue) {
        return b.informationValue - a.informationValue;
      }
      if (b.jobRelevance !== a.jobRelevance) {
        return b.jobRelevance - a.jobRelevance;
      }
      return a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0;
    });

    // 5. Select complementary, non-redundant groups up to target budget
    const selectedClaims = [];
    const usedFactIdsInSelection = new Set();
    const usedDimensions = new Set();

    for (const candidate of candidateGroups) {
      if (selectedClaims.length >= targetBullets) break;

      // Check if candidate relies on already-used facts in this selection or globally
      const hasFactOverlap = candidate.factIds.some(
        (fid) => usedFactIdsInSelection.has(fid) || globallyUsedFactIds.has(fid)
      );
      if (hasFactOverlap) {
        continue;
      }

      // Check semantic dimension overlap: avoid two bullets covering the exact same primary dimension
      const primaryDim = candidate.semanticDimensions[0] || 'general';
      if (usedDimensions.has(primaryDim) && candidateGroups.length > selectedClaims.length) {
        // Only accept same dimension if no other diverse dimension exists
        const remainingDiverse = candidateGroups.find(
          (g) =>
            !selectedClaims.includes(g) &&
            !usedDimensions.has(g.semanticDimensions[0] || 'general') &&
            !g.descriptionOnlyRisk &&
            !g.factIds.some((fid) => usedFactIdsInSelection.has(fid) || globallyUsedFactIds.has(fid))
        );
        if (remainingDiverse) continue;
      }

      // If accomplishment claims exist, prevent description-only claim from occupying a slot
      if (candidate.descriptionOnlyRisk && selectedClaims.length > 0) {
        continue;
      }

      // Accept candidate claim group
      candidate.recommendedUse = selectedClaims.length === 0 ? 'PRIMARY' : 'COMPLEMENTARY';
      selectedClaims.push(candidate);
      for (const fid of candidate.factIds) {
        usedFactIdsInSelection.add(fid);
      }
      usedDimensions.add(primaryDim);
    }

    // 6. Map omitted facts with exact fact-specific omission reasons
    const omittedFacts = [];
    for (const f of cleanFacts) {
      if (!usedFactIdsInSelection.has(f.factId)) {
        let reason = OMISSION_REASONS.PHYSICAL_CAPACITY;
        if (globallyUsedFactIds.has(f.factId)) {
          reason = OMISSION_REASONS.DUPLICATE;
        } else if (isProjectDescriptionFact(f) && accomplishmentFacts.length > 0) {
          reason = OMISSION_REASONS.DESCRIPTION_ONLY;
        } else if ((f.jobRelevance ?? 0) < 5) {
          reason = OMISSION_REASONS.LOW_JOB_RELEVANCE;
        } else if (f.confidence < 0.6) {
          reason = OMISSION_REASONS.LOW_EVIDENCE_CONFIDENCE;
        } else if (selectedClaims.some((c) => c.factIds.some((cfid) => cfid === f.factId))) {
          reason = OMISSION_REASONS.DUPLICATE;
        } else if (selectedClaims.length >= targetBullets) {
          reason = OMISSION_REASONS.LOWER_MARGINAL_VALUE;
        }
        omittedFacts.push({
          factId: f.factId,
          ownerId,
          text: f.text,
          omissionReason: reason,
        });
      }
    }

    return {
      plannedClaims: selectedClaims,
      omittedFacts,
      diagnostic: {
        totalFacts: cleanFacts.length,
        accomplishmentFacts: accomplishmentFacts.length,
        descriptionFacts: descriptionFacts.length,
        candidateGroupsGenerated: candidateGroups.length,
        claimsSelected: selectedClaims.length,
        selectedDimensions: Array.from(usedDimensions),
      },
    };
  }

  /**
   * Clusters entity facts into logical candidate claim groups.
   *
   * @private
   */
  _clusterFactsIntoClaimGroups({
    accomplishmentFacts,
    descriptionFacts,
    otherFacts,
    ownerType,
    ownerId,
    jobPosting,
  }) {
    const groups = [];
    const assignedFactIds = new Set();

    // Strategy A: Multi-fact clustering by complementary dimension
    for (const cluster of SEMANTIC_DIMENSION_CLUSTERS) {
      const matchingFacts = accomplishmentFacts.filter((f) => {
        if (assignedFactIds.has(f.factId)) return false;
        const topicMatch = cluster.topics.some((t) => (f.semanticTopic || '').toLowerCase().includes(t));
        const roleMatch = cluster.roles.includes(f.evidenceRole);
        return topicMatch || roleMatch;
      });

      if (matchingFacts.length > 0) {
        // Group primary fact with an optional complementary outcome/metric fact if available
        const primaryFact = matchingFacts[0];
        const supportingFact = accomplishmentFacts.find(
          (f) =>
            !assignedFactIds.has(f.factId) &&
            f.factId !== primaryFact.factId &&
            (f.evidenceRole === EVIDENCE_ROLES.METRIC ||
             f.evidenceRole === EVIDENCE_ROLES.OUTCOME ||
             f.evidenceRole === EVIDENCE_ROLES.PERFORMANCE)
        );

        const groupFacts = supportingFact ? [primaryFact, supportingFact] : [primaryFact];
        const factIds = groupFacts.map((f) => f.factId);
        const claimId = `claim-${ownerId}-${cluster.key}-${this._hashIds(factIds)}`;

        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds,
          facts: groupFacts,
          primaryFact: groupFacts[0],
          complementaryFacts: groupFacts.slice(1),
          semanticDimensions: [cluster.key, ...(primaryFact.semanticDimensions || [])],
          jobRelevance: 0,
          informationValue: 0,
          evidenceStrength: 0,
          sourceCoverage: 0,
          descriptionOnlyRisk: false,
          redundancyRisk: 0,
          spaceEstimate: supportingFact ? 130 : 90,
          recommendedUse: 'PRIMARY',
        });

        for (const fid of factIds) assignedFactIds.add(fid);
      }
    }

    // Strategy B: Any remaining unassigned accomplishment facts form standalone claim groups
    for (const f of accomplishmentFacts) {
      if (!assignedFactIds.has(f.factId)) {
        const claimId = `claim-${ownerId}-indiv-${this._hashIds([f.factId])}`;
        const primaryDim = f.semanticTopic || (f.evidenceRole ? f.evidenceRole.toLowerCase() : 'implementation');
        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds: [f.factId],
          facts: [f],
          primaryFact: f,
          complementaryFacts: [],
          semanticDimensions: [primaryDim, ...(f.semanticDimensions || [])],
          jobRelevance: f.jobRelevance ?? 0,
          informationValue: 0,
          evidenceStrength: f.confidence ?? 0.8,
          sourceCoverage: 0,
          descriptionOnlyRisk: false,
          redundancyRisk: 0,
          spaceEstimate: 85,
          recommendedUse: 'COMPLEMENTARY',
        });
        assignedFactIds.add(f.factId);
      }
    }

    // Strategy C: If no accomplishment facts exist at all, include description facts as fallback
    if (accomplishmentFacts.length === 0 && descriptionFacts.length > 0) {
      for (const d of descriptionFacts) {
        const claimId = `claim-${ownerId}-desc-${this._hashIds([d.factId])}`;
        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds: [d.factId],
          facts: [d],
          primaryFact: d,
          complementaryFacts: [],
          semanticDimensions: ['description'],
          jobRelevance: d.jobRelevance ?? 0,
          informationValue: 20, // Low information value
          evidenceStrength: d.confidence ?? 0.7,
          sourceCoverage: 0,
          descriptionOnlyRisk: true,
          redundancyRisk: 0,
          spaceEstimate: 80,
          recommendedUse: 'FALLBACK',
        });
      }
    }

    return groups;
  }

  /**
   * Scores an individual claim group for information value, relevance, and redundancy.
   *
   * @private
   */
  _scoreClaimGroup(group, allFacts) {
    const facts = group.facts;
    const avgConfidence = facts.reduce((acc, f) => acc + (f.confidence ?? 0.8), 0) / facts.length;
    const maxRelevance = Math.max(...facts.map((f) => f.jobRelevance ?? 0), 0);
    const hasMetrics = facts.some((f) => Array.isArray(f.metrics) && f.metrics.length > 0);
    const hasCorroboration = facts.some((f) => f.corroborated || f.provenanceStatus === 'VERIFIED');
    const isAccomplishment = facts.some((f) => isAccomplishmentCandidate(f));

    // Information value formula:
    // Rewards substantive action, technical methods, authentic metrics, and verified provenance
    let infoVal = 30;
    if (isAccomplishment) infoVal += 35;
    if (hasMetrics) infoVal += 20;
    if (hasCorroboration) infoVal += 15;
    if (facts.length > 1) infoVal += 10; // compound evidence synergy
    infoVal += Math.min(25, maxRelevance);

    if (group.descriptionOnlyRisk) {
      infoVal = Math.min(25, infoVal * 0.3); // heavily discount description-only
    }

    group.informationValue = Math.round(infoVal);
    group.jobRelevance = Math.round(maxRelevance * 100) / 100;
    group.evidenceStrength = Math.round(avgConfidence * 100) / 100;
    group.sourceCoverage = allFacts.length > 0 ? Math.round((group.factIds.length / allFacts.length) * 100) / 100 : 1;
  }

  /**
   * Generates deterministic fingerprint from fact ID array.
   *
   * @private
   */
  _hashIds(factIds) {
    const sorted = [...factIds].sort().join('::');
    return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 10);
  }
}

export const defaultResumeClaimPlanner = new ResumeClaimPlannerService();
export const defaultResumeClaimPlannerService = defaultResumeClaimPlanner;
export default ResumeClaimPlannerService;
