/**
 * @file Professional Resume Claim Planner Service (P18 Architecture)
 *
 * Runs BEFORE language realization. Plans structured, complementary narrative
 * claim groups from the canonical fact inventory for projects, experiences,
 * and sections:
 *
 *   Canonical Facts
 *     ↓
 *   Job Requirement Normalization & Concept Matching
 *     ↓
 *   Normalized PAR Claim Model (Action + Object + Method + Purpose/Result)
 *     ↓
 *   Deterministic Description vs Accomplishment Classification
 *     ↓
 *   Multi-Attribute Claim Utility Evaluation
 *     ↓
 *   Semantic Coverage Tracking & Diminishing Returns
 *     ↓
 *   Detailed Machine-Readable Omission Trace
 *
 * Invariants:
 * 1. Zero invention: factIds point strictly to authorized canonical facts.
 * 2. Description-only facts are NEVER used as primary bullets when accomplishment evidence exists.
 * 3. Complementary semantic dimensions (architecture, implementation, reliability, performance, outcome).
 * 4. Deterministic: same canonical facts + job -> identical claim plan.
 */

import crypto from 'node:crypto';
import {
  EVIDENCE_ROLES,
  OMISSION_REASONS,
  isAccomplishmentCandidate,
  isProjectDescriptionFact,
} from './candidate-fact-inventory.service.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

/**
 * Standard semantic dimension clusters for complementary engineering bullets.
 */
export const SEMANTIC_DIMENSION_CLUSTERS = Object.freeze([
  {
    key: 'architecture',
    label: 'Architecture & System Design',
    roles: [EVIDENCE_ROLES.ARCHITECTURE],
    topics: [
      'architecture',
      'distributed',
      'consensus',
      'microservices',
      'pipeline',
      'queue',
      'sharding',
      'event-driven',
    ],
  },
  {
    key: 'reliability',
    label: 'Reliability, Telemetry & Resilience',
    roles: [EVIDENCE_ROLES.RELIABILITY, EVIDENCE_ROLES.SECURITY],
    topics: [
      'reliability',
      'telemetry',
      'observability',
      'resilient',
      'fault-tolerant',
      'recovery',
      'logging',
      'monitoring',
      'security',
    ],
  },
  {
    key: 'performance_outcome',
    label: 'Performance, Optimization & Metrics',
    roles: [EVIDENCE_ROLES.PERFORMANCE, EVIDENCE_ROLES.OUTCOME, EVIDENCE_ROLES.METRIC],
    topics: [
      'performance',
      'outcome',
      'latency',
      'throughput',
      'speed',
      'scale',
      'benchmark',
      'optimization',
    ],
  },
  {
    key: 'integration_api',
    label: 'APIs, Protocols & Integration',
    roles: [EVIDENCE_ROLES.INTEGRATION],
    topics: [
      'integration',
      'api',
      'rest',
      'grpc',
      'graphql',
      'websocket',
      'oauth',
      'webhook',
      'endpoints',
    ],
  },
  {
    key: 'tooling_automation',
    label: 'Tooling, CI/CD & Infrastructure',
    roles: [EVIDENCE_ROLES.FEATURE],
    topics: ['tooling', 'docker', 'ci/cd', 'containerized', 'kubernetes', 'automated', 'infra'],
  },
  {
    key: 'implementation',
    label: 'Core Implementation & Systems Engineering',
    roles: [EVIDENCE_ROLES.IMPLEMENTATION, EVIDENCE_ROLES.ACTION],
    topics: [
      'implementation',
      'core',
      'engine',
      'logic',
      'protocol',
      'systems',
      'engineered',
      'algorithm',
    ],
  },
]);

/**
 * Default weights for claim utility evaluation. All weights sum to positive balance.
 */
export const DEFAULT_CLAIM_UTILITY_WEIGHTS = Object.freeze({
  evidenceStrength: 0.25,
  jobRelevance: 0.25,
  technicalSpecificity: 0.15,
  informationValue: 0.15,
  narrativeCompleteness: 0.1,
  semanticUniqueness: 0.1,
  descriptionOnlyRisk: 0.3,
  redundancyRisk: 0.25,
});

/**
 * Canonical Job Requirement Classifications.
 */
export const REQUIREMENT_TYPES = Object.freeze({
  CORE: 'CORE',
  PREFERRED: 'PREFERRED',
  CONTEXT: 'CONTEXT',
  RESPONSIBILITY: 'RESPONSIBILITY',
  TECHNOLOGY: 'TECHNOLOGY',
  DOMAIN: 'DOMAIN',
});

export class ResumeClaimPlannerService {
  constructor(options = {}) {
    this.utilityWeights = {
      ...DEFAULT_CLAIM_UTILITY_WEIGHTS,
      ...(options.utilityWeights || {}),
    };
  }

  /**
   * Normalizes target job requirements into structured canonical concepts.
   *
   * @param {object|Array} jobPosting Or raw requirements array
   * @returns {Array<{ id: string, canonicalConcept: string, synonyms: Array<string>, importance: number, requirementType: string }>}
   */
  normalizeJobRequirements(jobPosting) {
    if (!jobPosting) return [];
    const rawReqs = Array.isArray(jobPosting)
      ? jobPosting
      : Array.isArray(jobPosting.requirements)
        ? jobPosting.requirements
        : Array.isArray(jobPosting.parsedRequirements)
          ? jobPosting.parsedRequirements
          : [];

    return rawReqs.map((req, idx) => {
      if (typeof req === 'string') {
        const isTech =
          /\b(Rust|Go|Python|TypeScript|JavaScript|Node|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|SQL|AWS|Linux)\b/i.test(
            req
          );
        return {
          id: `req-${idx + 1}`,
          canonicalConcept: req.trim(),
          synonyms: [],
          importance: isTech ? 0.85 : 0.7,
          requirementType: isTech ? REQUIREMENT_TYPES.TECHNOLOGY : REQUIREMENT_TYPES.CORE,
        };
      }
      return {
        id: req.id || `req-${idx + 1}`,
        canonicalConcept: String(
          req.name || req.title || req.concept || req.text || `Requirement ${idx + 1}`
        ).trim(),
        synonyms: Array.isArray(req.synonyms) ? req.synonyms : [],
        importance:
          typeof req.importance === 'number'
            ? req.importance
            : req.priority === 'CRITICAL'
              ? 1.0
              : req.priority === 'HIGH'
                ? 0.8
                : 0.6,
        requirementType:
          req.type || (req.isTechnology ? REQUIREMENT_TYPES.TECHNOLOGY : REQUIREMENT_TYPES.CORE),
      };
    });
  }

  /**
   * Computes requirement coverage report between normalized requirements and evidence.
   */
  computeRequirementCoverage(normalizedRequirements, evidenceFacts) {
    const matched = [];
    const partial = [];
    const unmatched = [];
    let weightedMatched = 0;
    let totalWeight = 0;

    const facts = Array.isArray(evidenceFacts) ? evidenceFacts : [];
    const combinedEvidenceText = facts
      .map((f) => String(f.text || ''))
      .join(' ')
      .toLowerCase();

    for (const req of normalizedRequirements) {
      totalWeight += req.importance;
      const concept = req.canonicalConcept.toLowerCase();
      const tokens = concept.split(/\s+/).filter((t) => t.length > 2);

      const exactMatch = combinedEvidenceText.includes(concept);
      const tokenMatches = tokens.filter((t) => combinedEvidenceText.includes(t));
      const matchRatio = tokens.length > 0 ? tokenMatches.length / tokens.length : 0;

      if (exactMatch || matchRatio >= 0.8) {
        matched.push({
          requirementId: req.id,
          concept: req.canonicalConcept,
          importance: req.importance,
        });
        weightedMatched += req.importance;
      } else if (matchRatio >= 0.4) {
        partial.push({
          requirementId: req.id,
          concept: req.canonicalConcept,
          matchRatio,
          importance: req.importance,
        });
        weightedMatched += req.importance * matchRatio;
      } else {
        unmatched.push({
          requirementId: req.id,
          concept: req.canonicalConcept,
          importance: req.importance,
        });
      }
    }

    const totalReqs = normalizedRequirements.length;
    const requirementCoverage =
      totalReqs > 0 ? Math.round((matched.length / totalReqs) * 100) : 100;
    const requirementWeightedCoverage =
      totalWeight > 0 ? Math.round((weightedMatched / totalWeight) * 100) : 100;

    return {
      matchedRequirements: matched,
      partialRequirements: partial,
      unmatchedRequirements: unmatched,
      requirementCoverage,
      requirementWeightedCoverage,
    };
  }

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
    const cleanFacts = (Array.isArray(facts) ? facts : []).filter(
      (f) => f && f.renderable !== false
    );

    if (cleanFacts.length === 0) {
      return {
        plannedClaims: [],
        omittedFacts: [],
        diagnostic: { reason: 'NO_RENDERABLE_FACTS', candidateGroupCount: 0 },
      };
    }

    // Filter available facts not consumed globally
    const availableFacts = cleanFacts.filter((f) => !globallyUsedFactIds.has(f.factId));

    // 1. Deterministic classification: accomplishments vs descriptions
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

    // 3. Score each candidate claim group using multi-attribute utility
    for (const group of candidateGroups) {
      this._scoreClaimGroup(group, cleanFacts);
    }

    // 4. Sort groups by ClaimUtility (order-invariant tie-breaking via claimId)
    candidateGroups.sort((a, b) => {
      // Accomplishments strictly preferred over description-only groups
      if (a.descriptionOnlyRisk !== b.descriptionOnlyRisk) {
        return a.descriptionOnlyRisk ? 1 : -1;
      }
      if (b.claimUtility !== a.claimUtility) {
        return b.claimUtility - a.claimUtility;
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
    const semanticCoverage = {
      architecture: 0,
      implementation: 0,
      integration: 0,
      reliability: 0,
      security: 0,
      performance: 0,
      outcome: 0,
    };

    for (const candidate of candidateGroups) {
      if (selectedClaims.length >= targetBullets) break;

      // Check fact overlap
      const hasFactOverlap = candidate.factIds.some(
        (fid) => usedFactIdsInSelection.has(fid) || globallyUsedFactIds.has(fid)
      );
      if (hasFactOverlap) {
        continue;
      }

      // Semantic Coverage: apply diminishing returns if primary dimension is already covered
      const primaryDim = candidate.semanticDimensions[0] || 'implementation';
      const coverageKey = primaryDim.toLowerCase().replace(/[^a-z]/g, '');
      const existingDimCoverage = semanticCoverage[coverageKey] || 0;

      if (existingDimCoverage >= 1 && candidateGroups.length > selectedClaims.length) {
        // Prefer an alternate dimension if one exists
        const alternativeDiverse = candidateGroups.find(
          (g) =>
            !selectedClaims.includes(g) &&
            (semanticCoverage[(g.semanticDimensions[0] || '').toLowerCase()] || 0) === 0 &&
            !g.descriptionOnlyRisk &&
            !g.factIds.some(
              (fid) => usedFactIdsInSelection.has(fid) || globallyUsedFactIds.has(fid)
            )
        );
        if (alternativeDiverse) {
          continue; // Prioritize semantic diversity
        }
      }

      // Hard Invariant: Never spend a primary project bullet on description-only fact if accomplishments exist
      if (candidate.descriptionOnlyRisk && accomplishmentFacts.length > 0) {
        continue;
      }

      // Accept candidate claim group
      candidate.recommendedUse = selectedClaims.length === 0 ? 'PRIMARY' : 'COMPLEMENTARY';
      selectedClaims.push(candidate);
      for (const fid of candidate.factIds) {
        usedFactIdsInSelection.add(fid);
      }
      if (coverageKey in semanticCoverage) {
        semanticCoverage[coverageKey] += 1;
      }
    }

    // 6. Map omitted facts with exact fact-specific omission reasons
    const omittedFacts = [];
    for (const f of cleanFacts) {
      if (!usedFactIdsInSelection.has(f.factId)) {
        let reason = OMISSION_REASONS.CAPACITY_LIMIT;
        const selectedAlternative = selectedClaims[0]?.claimId || null;

        if (globallyUsedFactIds.has(f.factId)) {
          reason = OMISSION_REASONS.SEMANTIC_DUPLICATE;
        } else if (isProjectDescriptionFact(f) && accomplishmentFacts.length > 0) {
          reason = OMISSION_REASONS.DESCRIPTION_ONLY;
        } else if ((f.jobRelevance ?? 0) < 5) {
          reason = OMISSION_REASONS.BELOW_RELEVANCE_FLOOR;
        } else if (f.confidence < 0.6) {
          reason = OMISSION_REASONS.UNSUBSTANTIATED;
        } else if (selectedClaims.some((c) => c.factIds.some((cfid) => cfid === f.factId))) {
          reason = OMISSION_REASONS.SEMANTIC_DUPLICATE;
        } else if (selectedClaims.length >= targetBullets) {
          reason = OMISSION_REASONS.SUPERSEDED_BY_STRONGER_FACT;
        }

        omittedFacts.push({
          factId: f.factId,
          omitted: true,
          reason,
          utilityRank: omittedFacts.length + selectedClaims.length + 1,
          relevanceScore: f.jobRelevance ?? 0,
          evidenceStrength: f.confidence ?? 0.8,
          competingFactIds: selectedClaims.flatMap((c) => c.factIds),
          eliminatedAtStage: 'CLAIM_SELECTION',
          section: ownerType,
          selectedAlternative,
          text: f.text,
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
        semanticCoverage,
      },
    };
  }

  /**
   * Clusters entity facts into logical candidate claim groups conforming to the PAR claim model.
   *
   * @private
   */
  _clusterFactsIntoClaimGroups({
    accomplishmentFacts,
    descriptionFacts,
    otherFacts: _otherFacts,
    ownerType,
    ownerId,
    jobPosting: _jobPosting,
  }) {
    const groups = [];
    const assignedFactIds = new Set();

    // Strategy A: Multi-fact clustering across standard semantic dimension clusters
    for (const cluster of SEMANTIC_DIMENSION_CLUSTERS) {
      const matchingFacts = accomplishmentFacts.filter((f) => {
        if (assignedFactIds.has(f.factId)) return false;
        const topicMatch = cluster.topics.some((t) =>
          (f.semanticTopic || '').toLowerCase().includes(t)
        );
        const roleMatch = cluster.roles.includes(f.evidenceRole);
        return topicMatch || roleMatch;
      });

      if (matchingFacts.length > 0) {
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

        // Extract PAR components
        const action = this._extractActionVerb(primaryFact.text);
        const engineeringObject = this._extractEngineeringObject(primaryFact.text);
        const technicalMethods = this._extractTechnicalMethods(groupFacts);
        const technologies = Array.from(
          new Set(
            groupFacts.flatMap((f) => (f.technologies || []).map((t) => normalizeTechnologyName(t)))
          )
        );
        const result = supportingFact ? supportingFact.text : null;
        const purpose = this._extractPurpose(primaryFact.text);

        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds,
          facts: groupFacts,
          primaryFact: groupFacts[0],
          complementaryFacts: groupFacts.slice(1),
          semanticDimensions: [cluster.key, ...(primaryFact.semanticDimensions || [])],
          evidenceRole: primaryFact.evidenceRole || EVIDENCE_ROLES.IMPLEMENTATION,
          action,
          engineeringObject,
          technicalMethods,
          technologies,
          result,
          purpose,
          jobRelevance: 0,
          evidenceStrength: 0,
          informationValue: 0,
          technicalSpecificity: 0,
          narrativeCompleteness: 0,
          semanticUniqueness: 0,
          redundancyRisk: 0,
          descriptionOnlyRisk: false,
          spaceCost: supportingFact ? 130 : 90,
          estimatedCharacters: supportingFact ? 140 : 95,
          recommendedUse: 'PRIMARY',
          claimUtility: 0,
        });

        for (const fid of factIds) assignedFactIds.add(fid);
      }
    }

    // Strategy B: Any remaining unassigned accomplishment facts form standalone claim groups
    for (const f of accomplishmentFacts) {
      if (!assignedFactIds.has(f.factId)) {
        const claimId = `claim-${ownerId}-indiv-${this._hashIds([f.factId])}`;
        const primaryDim =
          f.semanticTopic || (f.evidenceRole ? f.evidenceRole.toLowerCase() : 'implementation');
        const technologies = Array.from(
          new Set((f.technologies || []).map((t) => normalizeTechnologyName(t)))
        );

        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds: [f.factId],
          facts: [f],
          primaryFact: f,
          complementaryFacts: [],
          semanticDimensions: [primaryDim, ...(f.semanticDimensions || [])],
          evidenceRole: f.evidenceRole || EVIDENCE_ROLES.IMPLEMENTATION,
          action: this._extractActionVerb(f.text),
          engineeringObject: this._extractEngineeringObject(f.text),
          technicalMethods: this._extractTechnicalMethods([f]),
          technologies,
          result: null,
          purpose: this._extractPurpose(f.text),
          jobRelevance: f.jobRelevance ?? 0,
          evidenceStrength: f.confidence ?? 0.8,
          informationValue: 0,
          technicalSpecificity: 0,
          narrativeCompleteness: 0,
          semanticUniqueness: 0,
          redundancyRisk: 0,
          descriptionOnlyRisk: false,
          spaceCost: 85,
          estimatedCharacters: 90,
          recommendedUse: 'COMPLEMENTARY',
          claimUtility: 0,
        });
        assignedFactIds.add(f.factId);
      }
    }

    // Strategy C: If no accomplishment facts exist at all, include description facts as fallback
    if (accomplishmentFacts.length === 0 && descriptionFacts.length > 0) {
      for (const d of descriptionFacts) {
        const claimId = `claim-${ownerId}-desc-${this._hashIds([d.factId])}`;
        const technologies = Array.from(
          new Set((d.technologies || []).map((t) => normalizeTechnologyName(t)))
        );

        groups.push({
          claimId,
          ownerType,
          ownerId,
          factIds: [d.factId],
          facts: [d],
          primaryFact: d,
          complementaryFacts: [],
          semanticDimensions: ['description'],
          evidenceRole: EVIDENCE_ROLES.PROJECT_DESCRIPTION,
          action: 'Built',
          engineeringObject: this._extractEngineeringObject(d.text),
          technicalMethods: [],
          technologies,
          result: null,
          purpose: null,
          jobRelevance: d.jobRelevance ?? 0,
          evidenceStrength: d.confidence ?? 0.7,
          informationValue: 20,
          technicalSpecificity: 30,
          narrativeCompleteness: 30,
          semanticUniqueness: 50,
          redundancyRisk: 0,
          descriptionOnlyRisk: true,
          spaceCost: 80,
          estimatedCharacters: 85,
          recommendedUse: 'FALLBACK',
          claimUtility: 0,
        });
      }
    }

    return groups;
  }

  /**
   * Scores an individual claim group for multi-attribute utility.
   *
   * @private
   */
  _scoreClaimGroup(group, _allFacts) {
    const facts = group.facts;
    const avgConfidence = facts.reduce((acc, f) => acc + (f.confidence ?? 0.8), 0) / facts.length;
    const maxRelevance = Math.max(...facts.map((f) => f.jobRelevance ?? 0), 0);
    const hasMetrics = facts.some((f) => Array.isArray(f.metrics) && f.metrics.length > 0);
    const hasCorroboration = facts.some((f) => f.corroborated || f.provenanceStatus === 'VERIFIED');
    const isAccomplishment = facts.some((f) => isAccomplishmentCandidate(f));

    // 1. EvidenceStrength [0, 100]
    const evidenceStrength = Math.round(avgConfidence * 100);

    // 2. JobRelevance [0, 100]
    const jobRelevance = Math.round(Math.min(100, maxRelevance * 2.5));

    // 3. TechnicalSpecificity [0, 100]
    const techCount = group.technologies.length;
    const technicalSpecificity = Math.min(
      100,
      techCount * 25 + (group.technicalMethods.length > 0 ? 30 : 0)
    );

    // 4. InformationValue [0, 100]
    let infoVal = 30;
    if (isAccomplishment) infoVal += 35;
    if (hasMetrics) infoVal += 20;
    if (hasCorroboration) infoVal += 15;
    if (facts.length > 1) infoVal += 10;
    infoVal = Math.min(100, infoVal);

    // 5. NarrativeCompleteness [0, 100]
    let completeness = 40;
    if (group.action && group.action !== 'Built') completeness += 20;
    if (group.engineeringObject) completeness += 20;
    if (group.purpose || group.result) completeness += 20;
    const narrativeCompleteness = Math.min(100, completeness);

    // 6. SemanticUniqueness [0, 100]
    const semanticUniqueness = group.descriptionOnlyRisk ? 30 : 85;

    // 7. RedundancyRisk & DescriptionOnlyRisk
    const redundancyRisk = group.redundancyRisk || 0;
    const descriptionOnlyRisk = group.descriptionOnlyRisk ? 100 : 0;

    // Multi-attribute utility formula
    const w = this.utilityWeights;
    const rawUtility =
      w.evidenceStrength * evidenceStrength +
      w.jobRelevance * jobRelevance +
      w.technicalSpecificity * technicalSpecificity +
      w.informationValue * infoVal +
      w.narrativeCompleteness * narrativeCompleteness +
      w.semanticUniqueness * semanticUniqueness -
      w.descriptionOnlyRisk * descriptionOnlyRisk -
      w.redundancyRisk * redundancyRisk;

    group.evidenceStrength = evidenceStrength;
    group.jobRelevance = jobRelevance;
    group.technicalSpecificity = technicalSpecificity;
    group.informationValue = infoVal;
    group.narrativeCompleteness = narrativeCompleteness;
    group.semanticUniqueness = semanticUniqueness;
    group.claimUtility = Math.max(0, Math.min(100, Math.round(rawUtility)));
  }

  _extractActionVerb(text) {
    const firstWord =
      String(text || '')
        .trim()
        .split(/\s+/)[0] || 'Engineered';
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }

  _extractEngineeringObject(text) {
    const clean = String(text || '').replace(/^[A-Z][a-z]+ed\s+/i, '');
    const objMatch = clean.match(
      /^((?:a|an|the)\s+)?([a-z0-9\s-]+?)(?:\s+(?:using|with|via|for|to|enabling|supporting)|$)/i
    );
    return objMatch ? objMatch[0].trim() : 'core architecture';
  }

  _extractTechnicalMethods(facts) {
    const methods = [];
    for (const f of facts) {
      const match = String(f.text || '').match(
        /\b(?:using|via|leveraging|incorporating|through)\s+([a-zA-Z0-9\s-]+?)(?=[,.;]|$)/i
      );
      if (match) methods.push(match[1].trim());
    }
    return methods;
  }

  _extractPurpose(text) {
    const match = String(text || '').match(
      /\b(?:to|for|enabling|ensuring|supporting)\s+([a-zA-Z0-9\s-]+?)(?=[.;]|$)/i
    );
    return match ? match[0].trim() : null;
  }

  _hashIds(factIds) {
    const sorted = [...factIds].sort().join('::');
    return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 10);
  }
}

export const defaultResumeClaimPlanner = new ResumeClaimPlannerService();
export const defaultResumeClaimPlannerService = defaultResumeClaimPlanner;
export default ResumeClaimPlannerService;
