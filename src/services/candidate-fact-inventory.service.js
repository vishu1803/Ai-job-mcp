/**
 * @file Canonical Candidate Fact Inventory Service (P16-009 / Part 2 Architecture).
 *
 * Builds ONE authoritative canonical fact inventory from raw candidate sources.
 * The inventory is the single source of truth consumed by professional bullet
 * composition, project bullet capacity, section planning and the bounded
 * document optimizer. Downstream layers MUST NOT re-discover facts from raw
 * candidateProfile/project arrays.
 *
 * Fact model — every fact carries:
 *   - id                deterministic fingerprint (sha256 of source-class + normalized text + association)
 *   - factId            backward-compatible alias for id
 *   - ownerType         'PROJECT' | 'EXPERIENCE' | 'EDUCATION' | 'DSA' | 'CERTIFICATION' | 'CANDIDATE'
 *   - ownerId           string identifier of the owning entity
 *   - sourceType        bullet | highlight | feature | feature-description | responsibility | description | summary | evidence | link | education | certification
 *   - sourceRef         object | null
 *   - provenanceStatus  VERIFIED | CORROBORATED | USER_PROVIDED | SELF_DECLARED | CLAIMED
 *   - confidence        [0, 1]
 *   - text              normalized candidate-owned statement (never altered semantically)
 *   - factType          IDENTITY | ROLE | RESPONSIBILITY | IMPLEMENTATION | ARCHITECTURE | FEATURE | INTEGRATION | PERFORMANCE | RELIABILITY | SECURITY | OUTCOME | METRIC | TECHNOLOGY | DSA | EDUCATION | CERTIFICATION | LINK
 *   - projectId         associated project ID or null
 *   - experienceId      associated experience ID or null
 *   - educationId       associated education ID or null
 *   - technologies      canonical technology names associated with the fact
 *   - metrics           extracted authentic quantitative values
 *   - semanticTopics    array of semantic domain topics (architecture, reliability, outcome, etc.)
 *   - jobRelevance      [0, ∞] relevance score assigned by scoreFactsForJob()
 *   - candidateAuthored whether authored by candidate or derived from repo metadata
 *   - corroborated      whether corroborated by verified source evidence
 *   - renderable        whether eligible to anchor or participate in claim prose
 *
 * Invariants:
 * 1. Source-order invariance: the same facts in any input order produce the
 *    same inventory (sorting + clustering are order-insensitive).
 * 2. No fabrication: facts are only extracted, never synthesized; provenance
 *    is preserved verbatim; presence evidence can never become a claim fact.
 * 3. No candidate-owned fact is silently lost: every distinct text surface
 *    appears as a fact (possibly clustered into an existing fact via
 *    mergeSources).
 */

import crypto from 'node:crypto';
import {
  calculateFactSemanticOverlap,
  countDistinctCanonicalFacts,
  classifyEvidenceSemanticType,
  EVIDENCE_SEMANTIC_CLASS,
  toEvidenceReference,
  CONTRIBUTION_CLASSES,
  areContributionClassesCompatible,
  classifyContributionClass,
  AGENCY_LEVELS,
  AGENCY_SOURCES,
  isTrustedCandidateAgencySource,
  extractActionEvidence,
  doesClaimAssertCandidateAgency,
  assertRenderedCandidateAgencyInvariant,
  determineFactAgency,
} from './resume-composition-primitives.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';
import {
  normalizeJobInput,
  getJobRequirementConceptsUnified,
  normalizeRequirementToken,
  GENERIC_REQUIREMENT_TOKENS,
} from './job-normalization.service.js';

export {
  CONTRIBUTION_CLASSES,
  areContributionClassesCompatible,
  classifyContributionClass,
  AGENCY_LEVELS,
  AGENCY_SOURCES,
  isTrustedCandidateAgencySource,
  extractActionEvidence,
  doesClaimAssertCandidateAgency,
  assertRenderedCandidateAgencyInvariant,
  determineFactAgency,
};

/** Canonical Fact Types Taxonomy (Part 2 Specification). */
export const CANONICAL_FACT_TYPES = Object.freeze({
  IDENTITY: 'IDENTITY',
  ROLE: 'ROLE',
  RESPONSIBILITY: 'RESPONSIBILITY',
  IMPLEMENTATION: 'IMPLEMENTATION',
  ARCHITECTURE: 'ARCHITECTURE',
  FEATURE: 'FEATURE',
  INTEGRATION: 'INTEGRATION',
  PERFORMANCE: 'PERFORMANCE',
  RELIABILITY: 'RELIABILITY',
  SECURITY: 'SECURITY',
  OUTCOME: 'OUTCOME',
  METRIC: 'METRIC',
  TECHNOLOGY: 'TECHNOLOGY',
  DSA: 'DSA',
  EDUCATION: 'EDUCATION',
  CERTIFICATION: 'CERTIFICATION',
  LINK: 'LINK',
});

export const FACT_TYPES = CANONICAL_FACT_TYPES;

/** Explicit Evidence Roles Taxonomy (P17 Architecture). */
export const EVIDENCE_ROLES = Object.freeze({
  PROJECT_DESCRIPTION: 'PROJECT_DESCRIPTION',
  CONTEXT: 'CONTEXT',
  RESPONSIBILITY: 'RESPONSIBILITY',
  ACTION: 'ACTION',
  ACCOMPLISHMENT: 'ACTION',
  IMPLEMENTATION: 'IMPLEMENTATION',
  ARCHITECTURE: 'ARCHITECTURE',
  DESIGN_DECISION: 'DESIGN_DECISION',
  FEATURE: 'FEATURE',
  INTEGRATION: 'INTEGRATION',
  RELIABILITY: 'RELIABILITY',
  SECURITY: 'SECURITY',
  PERFORMANCE: 'PERFORMANCE',
  OPTIMIZATION: 'OPTIMIZATION',
  OUTCOME: 'OUTCOME',
  METRIC: 'METRIC',
  TECHNOLOGY: 'TECHNOLOGY',
  DSA: 'DSA',
  EDUCATION: 'EDUCATION',
  LINK: 'LINK',
});

/** Fact-Specific Omission Reasons Taxonomy (P18 Architecture). */
export const OMISSION_REASONS = Object.freeze({
  AGENCY_NOT_AUTHORIZED: 'AGENCY_NOT_AUTHORIZED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UNSUBSTANTIATED: 'UNSUBSTANTIATED',
  UNSUPPORTED_METRIC: 'UNSUPPORTED_METRIC',
  UNSUBSTANTIATED_METRIC: 'UNSUPPORTED_METRIC',
  DESCRIPTION_ONLY: 'DESCRIPTION_ONLY',
  BELOW_RELEVANCE_FLOOR: 'BELOW_RELEVANCE_FLOOR',
  SEMANTIC_DUPLICATE: 'SEMANTIC_DUPLICATE',
  SUPERSEDED_BY_STRONGER_FACT: 'SUPERSEDED_BY_STRONGER_FACT',
  CAPACITY_LIMIT: 'CAPACITY_LIMIT',
  SECTION_NOT_SELECTED: 'SECTION_NOT_SELECTED',
  REDUNDANCY_REMOVAL: 'REDUNDANCY_REMOVAL',
  LOW_INFORMATION_VALUE: 'LOW_INFORMATION_VALUE',
  PROFESSIONAL_QUALITY_REJECTION: 'PROFESSIONAL_QUALITY_REJECTION',
  VALIDATION_REJECTION: 'VALIDATION_REJECTION',
  // Backward-compatible aliases
  DUPLICATE: 'SEMANTIC_DUPLICATE',
  SEMANTIC_REDUNDANCY: 'SEMANTIC_REDUNDANCY',
  LOW_JOB_RELEVANCE: 'LOW_JOB_RELEVANCE',
  LOW_EVIDENCE_CONFIDENCE: 'LOW_EVIDENCE_CONFIDENCE',
  PHYSICAL_CAPACITY: 'PHYSICAL_CAPACITY',
  LOWER_MARGINAL_VALUE: 'SUPERSEDED_BY_STRONGER_FACT',
  INVALID_ASSOCIATION: 'UNAUTHORIZED',
});

/** Provenance confidence weights (generic schema semantics, not identity rules). */
const PROVENANCE_CONFIDENCE = Object.freeze({
  VERIFIED: 1.0,
  CORROBORATED: 0.9,
  USER_PROVIDED: 0.8,
  SELF_DECLARED: 0.6,
  CLAIMED: 0.5,
});

/** Generic semantic-topic keyword taxonomy (domain rule, not identity rules). */
const TOPIC_RULES = Object.freeze([
  {
    topic: 'architecture',
    tokens: [
      'architecture',
      'architected',
      'distributed',
      'consensus',
      'raft',
      'microservices',
      'event-driven',
      'queue',
      'streaming',
      'pipeline',
      'sharding',
      'replication',
      'worker pool',
      'system design',
    ],
  },
  {
    topic: 'reliability',
    tokens: [
      'reliability',
      'fault-tolerant',
      'resilient',
      'retry',
      'backoff',
      'idempotent',
      'recovery',
      'observability',
      'monitoring',
      'telemetry',
      'logging',
      'tracing',
      'availability',
    ],
  },
  {
    topic: 'integration',
    tokens: [
      'integrated',
      'integration',
      'api',
      'rest',
      'graphql',
      'websocket',
      'oauth',
      'webhook',
      'sdk',
      'connector',
      'third-party',
    ],
  },
  {
    topic: 'implementation',
    tokens: [
      'implemented',
      'built',
      'engineered',
      'developed',
      'designed',
      'coded',
      'wrote',
      'refactored',
      'migrated',
      'optimized',
      'automated',
    ],
  },
  {
    topic: 'outcome',
    tokens: [
      'reduced',
      'increased',
      'improved',
      'resulting',
      'achieved',
      'delivered',
      'saved',
      'faster',
      'latency',
      'throughput',
    ],
  },
  {
    topic: 'tooling',
    tokens: [
      'docker',
      'containerized',
      'ci/cd',
      'github actions',
      'terraform',
      'kubernetes',
      'tooling',
      'deployed',
    ],
  },
  {
    topic: 'problem-solving',
    tokens: [
      'data structures',
      'algorithms',
      'leetcode',
      'problem solving',
      'competitive programming',
      'dynamic programming',
      'graph theory',
    ],
  },
]);

/**
 * Classifies whether a factual statement represents a passive project description
 * vs an active engineering accomplishment candidate.
 *
 * @param {string} text
 * @param {string} sourceType
 * @param {string} canonicalFactType
 * @returns {string} One of EVIDENCE_ROLES
 */
export function classifyEvidenceRole(
  text,
  sourceType = 'bullet',
  canonicalFactType = 'IMPLEMENTATION'
) {
  const norm = String(text || '').trim();
  const lower = norm.toLowerCase();

  if (sourceType === 'evidence' || canonicalFactType === CANONICAL_FACT_TYPES.TECHNOLOGY) {
    return EVIDENCE_ROLES.TECHNOLOGY;
  }
  if (sourceType === 'link' || canonicalFactType === CANONICAL_FACT_TYPES.LINK) {
    return EVIDENCE_ROLES.LINK;
  }
  if (sourceType === 'education' || canonicalFactType === CANONICAL_FACT_TYPES.EDUCATION) {
    return EVIDENCE_ROLES.EDUCATION;
  }
  if (canonicalFactType === CANONICAL_FACT_TYPES.DSA) {
    return EVIDENCE_ROLES.DSA;
  }

  // 1. Explicit Architectural / Design Decision verb openers
  if (/^(?:architected|designed)\b/i.test(norm)) {
    return EVIDENCE_ROLES.DESIGN_DECISION;
  }

  // 2. Explicit Optimization verb openers
  if (/^(?:optimized|tuned|benchmarked|profiled)\b/i.test(norm)) {
    return EVIDENCE_ROLES.OPTIMIZATION;
  }

  // 3. Explicit Outcome verb openers
  if (
    /^(?:reduced|increased|improved|saved|decreased|accelerated|yielded|achieved)\b/i.test(norm)
  ) {
    return EVIDENCE_ROLES.OUTCOME;
  }

  // 4. Explicit Action / Implementation verb openers
  if (
    /^(?:engineered|implemented|built|developed|created|refactored|automated|scaled|migrated|containerized|deployed|configured|integrated|secured|standardized|established|maintained|analyzed|constructed|authored|wrote|programmed|executed|delivered|spearheaded|led|championed|pioneered|introduced|formulated|devised|accelerated|synthesized|monitored)\b/i.test(
      norm
    ) ||
    /\b(?:designed and implemented|architected and deployed)\b/i.test(lower)
  ) {
    return EVIDENCE_ROLES.ACTION;
  }

  // 5. Passive description patterns & non-action statements
  const isPassiveDescriptionPattern =
    /^(?:a|an|the)\s+(?:[\w-]+\s+){0,3}(?:is\s+(?:an?|the)\s+)?(?:application|app|service|tool|platform|library|framework|cli|manager|dashboard|assistant|system|bot|extension|web dashboard)\b/i.test(
      norm
    ) ||
    /^(?:a|an|the)\s+(?:[\w-]+\s+){1,3}is\b/i.test(norm) ||
    /^(?:features\s+include|capabilities\s+include|supported\s+features)\b/i.test(norm) ||
    sourceType === 'description';

  if (isPassiveDescriptionPattern) {
    return EVIDENCE_ROLES.PROJECT_DESCRIPTION;
  }

  if (canonicalFactType === CANONICAL_FACT_TYPES.ARCHITECTURE) return EVIDENCE_ROLES.ARCHITECTURE;
  if (canonicalFactType === CANONICAL_FACT_TYPES.RELIABILITY) return EVIDENCE_ROLES.RELIABILITY;
  if (canonicalFactType === CANONICAL_FACT_TYPES.PERFORMANCE) return EVIDENCE_ROLES.PERFORMANCE;
  if (canonicalFactType === CANONICAL_FACT_TYPES.INTEGRATION) return EVIDENCE_ROLES.INTEGRATION;
  if (canonicalFactType === CANONICAL_FACT_TYPES.SECURITY) return EVIDENCE_ROLES.SECURITY;
  if (canonicalFactType === CANONICAL_FACT_TYPES.OUTCOME) return EVIDENCE_ROLES.OUTCOME;
  if (canonicalFactType === CANONICAL_FACT_TYPES.RESPONSIBILITY)
    return EVIDENCE_ROLES.RESPONSIBILITY;

  const agency = determineFactAgency(norm, { sourceType, canonicalFactType });
  if (agency.level === AGENCY_LEVELS.CANDIDATE) {
    return EVIDENCE_ROLES.ACTION;
  }

  return EVIDENCE_ROLES.PROJECT_DESCRIPTION;
}

/**
 * Checks if a fact is an accomplishment candidate eligible to anchor a bullet.
 *
 * @param {object} fact
 * @returns {boolean}
 */
export function isAccomplishmentCandidate(fact) {
  if (!fact || !fact.renderable) return false;
  const agency = fact.agency || determineFactAgency(fact.text, fact);
  const agencyLevel = fact.agencyLevel || agency.level;
  const agencySource = fact.agencySource || agency.source;
  if (agencyLevel !== AGENCY_LEVELS.CANDIDATE || !isTrustedCandidateAgencySource(agencySource, fact)) {
    return false;
  }
  const role =
    fact.evidenceRole || classifyEvidenceRole(fact.text, fact.sourceType, fact.canonicalFactType);
  const contribution =
    fact.contributionClass ||
    classifyContributionClass(fact.text, fact.sourceType, fact.canonicalFactType, fact);
  if (
    role === EVIDENCE_ROLES.PROJECT_DESCRIPTION ||
    role === EVIDENCE_ROLES.CONTEXT ||
    role === EVIDENCE_ROLES.TECHNOLOGY ||
    role === EVIDENCE_ROLES.LINK
  ) {
    return false;
  }
  return (
    contribution !== CONTRIBUTION_CLASSES.DESCRIPTION &&
    contribution !== CONTRIBUTION_CLASSES.CONTEXT
  );
}

/**
 * Checks if a fact is a pure project description.
 *
 * @param {object} fact
 * @returns {boolean}
 */
export function isProjectDescriptionFact(fact) {
  if (!fact) return false;
  const agency = fact.agency || determineFactAgency(fact.text, fact);
  const agencyLevel = fact.agencyLevel || agency.level;
  const agencySource = fact.agencySource || agency.source;
  if (agencyLevel !== AGENCY_LEVELS.CANDIDATE || !isTrustedCandidateAgencySource(agencySource, fact)) {
    return true;
  }
  const role =
    fact.evidenceRole || classifyEvidenceRole(fact.text, fact.sourceType, fact.canonicalFactType);
  const contribution =
    fact.contributionClass ||
    classifyContributionClass(fact.text, fact.sourceType, fact.canonicalFactType, fact);
  return (
    role === EVIDENCE_ROLES.PROJECT_DESCRIPTION ||
    role === EVIDENCE_ROLES.CONTEXT ||
    contribution === CONTRIBUTION_CLASSES.DESCRIPTION ||
    contribution === CONTRIBUTION_CLASSES.CONTEXT
  );
}

/** Internal name for the profile-level problem-solving fact surface. */
export const PROBLEM_SOLVING_PROJECT_KEY = '__problem_solving__';

/**
 * Normalizes a raw candidate text surface into a fact-ready string.
 * Strips bullets/numbering, collapses whitespace, drops pure-URL lines.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeFactText(raw) {
  const t = String(raw || '')
    .replace(/^[-*•]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^https?:\/\//i.test(t)) return '';
  return t;
}

/**
 * Classifies a normalized fact text into the generic semantic-topic taxonomy.
 *
 * @param {string} text
 * @returns {string} one of the TOPIC_RULES topics or 'capability'
 */
export function classifyFactTopic(text) {
  const lower = String(text || '').toLowerCase();
  let best = { topic: 'capability', hits: 0 };
  for (const rule of TOPIC_RULES) {
    let hits = 0;
    for (const tok of rule.tokens) {
      if (lower.includes(tok)) hits += 1;
    }
    if (hits > best.hits) best = { topic: rule.topic, hits };
  }
  return best.topic;
}

/**
 * Classifies a text statement into its canonical fact type.
 *
 * @param {string} text
 * @param {string} defaultType
 * @returns {string}
 */
export function classifyCanonicalFactType(text, defaultType = 'IMPLEMENTATION') {
  const lower = String(text || '').toLowerCase();
  if (/(?:reduced|increased|improved|resulting|achieved|saved|by \d+)/i.test(lower))
    return CANONICAL_FACT_TYPES.OUTCOME;
  if (
    /(?:distributed|microservices|architecture|consensus|raft|sharding|pipeline|system design)/i.test(
      lower
    )
  )
    return CANONICAL_FACT_TYPES.ARCHITECTURE;
  if (
    /(?:latency|throughput|rps|qps|speed|benchmark|memory allocation|cpu utilization)/i.test(lower)
  )
    return CANONICAL_FACT_TYPES.PERFORMANCE;
  if (
    /(?:fault-tolerant|resilient|retry|backoff|idempotent|recovery|monitoring|telemetry)/i.test(
      lower
    )
  )
    return CANONICAL_FACT_TYPES.RELIABILITY;
  if (/(?:oauth|rbac|security|auth|jwt|encryption|permission)/i.test(lower))
    return CANONICAL_FACT_TYPES.SECURITY;
  if (/(?:integrated|integration|api|rest|graphql|websocket|connector|webhook)/i.test(lower))
    return CANONICAL_FACT_TYPES.INTEGRATION;
  if (/(?:implemented|built|engineered|developed|coded|designed)/i.test(lower))
    return CANONICAL_FACT_TYPES.IMPLEMENTATION;
  if (/(?:feature|component|module|dashboard|portal)/i.test(lower))
    return CANONICAL_FACT_TYPES.FEATURE;
  return defaultType;
}

/**
 * Detects whether a fact text asserts a quantified value (metric-like).
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isMeasurableFact(text) {
  return /(?:\b\d+(?:\.\d+)?%|\b\d+\s*(?:million|billion)|\b\d{2,}\+?\s*(?:users|requests|rps|qps|customers|problems)|\$\s?\d|\bteam\s+of\s+\d+|\b\d+\s*(?:ms|s)\s+(?:latency|p\d))/i.test(
    String(text || '')
  );
}

/**
 * Extracts authentic metric descriptors from factual text.
 *
 * @param {string} text
 * @returns {Array<object>}
 */
export function extractAuthenticMetrics(text) {
  if (!isMeasurableFact(text)) return [];
  const matches =
    String(text).match(
      /(?:\b\d+(?:\.\d+)?%|\b\d+\s*(?:million|billion)|\b\d{2,}\+?\s*(?:users|requests|rps|qps|customers|problems)|\$\s?\d|\bteam\s+of\s+\d+|\b\d+\s*(?:ms|s)\s+(?:latency|p\d))/gi
    ) || [];
  return matches.map((m) => ({ raw: m, context: text.slice(0, 100) }));
}

/**
 * Builds a deterministic fact fingerprint.
 *
 * @param {string} normalizedText
 * @param {string} associationKey project/experience key or '' for profile-level
 * @returns {string} factId (sha256, hex, 24 chars)
 */
export function factFingerprint(normalizedText, associationKey = '') {
  const norm = String(normalizedText || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto
    .createHash('sha256')
    .update(`${associationKey}::${norm}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Builds the canonical fact inventory from a canonical candidate data snapshot
 * (the shape returned by CandidateArtifactContentService.buildCandidateData).
 *
 * @param {object} candidateProfile Canonical candidate data snapshot
 * @param {object|null} [jobPosting] Target job (optional; relevance scored separately)
 * @param {object} [options] { factClusterThreshold }
 * @returns {{ facts: Array<object>, byProject: Map<string, Array<object>>, crossProjectDuplicateFacts: Array<object>, stats: object }}
 */
export function buildCanonicalFactInventory(candidateProfile, jobPosting = null, options = {}) {
  const clusterThreshold = options.factClusterThreshold ?? 0.55;
  const facts = [];
  const seenFingerprints = new Set();

  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const rawProjects = meta.projects || profile.projects || [];

  const addFact = (candidate) => {
    if (!candidate) return;
    const text = normalizeFactText(candidate.text);
    // Technology facts are short by construction ("Uses Redis") and are kept:
    // they feed stats/traceability and are structurally barred from becoming
    // claim bullets. All other facts require substantive length.
    const isTechFact =
      candidate.factType === 'technology' || candidate.factType === CANONICAL_FACT_TYPES.TECHNOLOGY;
    const minLen = isTechFact ? 4 : 15;
    if (!text || text.length < minLen) return;

    const assocKey =
      candidate.association?.projectId ||
      (candidate.association?.projectName
        ? String(candidate.association.projectName)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
        : '') ||
      candidate.association?.experienceId ||
      candidate.association?.educationId ||
      '';

    const rawFactType = candidate.factType || 'candidate-authored';
    const canonicalFactType = isTechFact
      ? CANONICAL_FACT_TYPES.TECHNOLOGY
      : candidate.canonicalFactType ||
        classifyCanonicalFactType(text, CANONICAL_FACT_TYPES.IMPLEMENTATION);

    const provenance = candidate.provenance || 'USER_PROVIDED';
    const confidence =
      typeof candidate.confidence === 'number'
        ? candidate.confidence
        : (PROVENANCE_CONFIDENCE[provenance] ?? 0.8);

    const agency =
      candidate.agency ||
      determineFactAgency(text, {
        sourceType: candidate.sourceType || null,
        factType: candidate.factType,
        canonicalFactType,
        provenance,
        confidence,
        candidateAuthored: candidate.candidateAuthored,
        ...candidate,
      });

    let contributionClass = candidate.contributionClass;
    if (!contributionClass || agency.level !== AGENCY_LEVELS.CANDIDATE) {
      contributionClass = classifyContributionClass(
        text,
        candidate.sourceType || null,
        canonicalFactType,
        { agency, provenance, ...candidate }
      );
    }

    const factId = factFingerprint(text, assocKey);

    // Exact-text dedup across surfaces (e.g. same sentence in bullets + features)
    if (seenFingerprints.has(factId)) {
      const existing = facts.find((f) => f.factId === factId);
      if (existing) mergeSources(existing, candidate);
      return;
    }
    seenFingerprints.add(factId);

    // Role-aware semantic near-duplicate merge (Findings 2 & 3)
    const assocFacts = facts.filter(
      (f) => (f.association?.projectId || '') === (candidate.association?.projectId || '')
    );
    const dup = assocFacts.find((f) => {
      const overlap = calculateFactSemanticOverlap(text, f.text);
      if (overlap < clusterThreshold) return false;
      const fContributionClass =
        f.contributionClass ||
        classifyContributionClass(f.text, f.sourceType || 'bullet', f.canonicalFactType, f);
      return areContributionClassesCompatible(fContributionClass, contributionClass);
    });
    if (dup) {
      mergeSources(dup, candidate);
      return;
    }

    const topic = candidate.semanticTopic || classifyFactTopic(text);

    const ownerType =
      candidate.ownerType ||
      (candidate.association?.projectId
        ? 'PROJECT'
        : candidate.association?.experienceId
          ? 'EXPERIENCE'
          : candidate.association?.educationId
            ? 'EDUCATION'
            : 'CANDIDATE');

    const ownerId =
      candidate.ownerId ||
      candidate.association?.projectId ||
      candidate.association?.experienceId ||
      candidate.association?.educationId ||
      profile.id ||
      '';

    const isRenderable =
      candidate.renderable ??
      (!isTechFact &&
        candidate.factType !== 'external-corroboration' &&
        candidate.factType !== CANONICAL_FACT_TYPES.LINK);

    const evidenceRole =
      candidate.evidenceRole ||
      classifyEvidenceRole(text, candidate.sourceType || 'bullet', canonicalFactType);
    const semanticDimensions = candidate.semanticDimensions || [topic];

    facts.push({
      id: factId,
      factId,
      ownerType,
      ownerId,
      sourceType: candidate.sourceType || 'bullet',
      sourceRef: candidate.sourceRef || null,
      provenanceStatus: provenance,
      provenance,
      confidence,
      agency,
      agencyLevel: agency.level,
      agencySource: agency.source,
      text,
      factType: rawFactType,
      canonicalFactType,
      evidenceRole,
      contributionClass,
      semanticDimensions,
      projectId: candidate.association?.projectId || null,
      experienceId: candidate.association?.experienceId || null,
      educationId: candidate.association?.educationId || null,
      dsaAssociation: candidate.association?.dsaAssociation || (ownerType === 'DSA' ? true : null),
      association: candidate.association || {},
      technologies: Array.isArray(candidate.technologies)
        ? candidate.technologies.map(normalizeTechnologyName).filter(Boolean)
        : [],
      metrics: candidate.metrics || extractAuthenticMetrics(text),
      semanticTopics: [topic],
      semanticTopic: topic,
      jobRelevance: candidate.jobRelevance ?? 0,
      importance: candidate.importance ?? 0,
      omissionReason: candidate.omissionReason || null,
      usedByClaimIds: candidate.usedByClaimIds || [],
      candidateAuthored: candidate.candidateAuthored === true,
      corroborated:
        candidate.corroborated ?? (provenance === 'VERIFIED' || provenance === 'CORROBORATED'),
      renderable: isRenderable,
      measurable: candidate.measurable ?? isMeasurableFact(text),
      evidenceRefs: Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs : [],
    });
  };

  // ── 1. Project facts ──────────────────────────────────────────────────────
  for (const p of Array.isArray(rawProjects) ? rawProjects : []) {
    const projKey = p.id || p.projectId || p.name;
    const association = { projectId: projKey, projectName: p.name || p.title || '' };
    const projTech = Array.isArray(p.technologies) ? p.technologies : [];

    const projectLevelProvenance = p.provenanceStatus || 'USER_PROVIDED';
    const surfaces = [
      {
        items: p.bullets,
        sourceType: 'bullet',
        factType: 'candidate-authored',
        canonicalFactType: CANONICAL_FACT_TYPES.IMPLEMENTATION,
        candidateAuthored: true,
      },
      {
        items: p.highlights,
        sourceType: 'highlight',
        factType: 'candidate-authored',
        canonicalFactType: CANONICAL_FACT_TYPES.FEATURE,
        candidateAuthored: true,
      },
      {
        items: p.features,
        sourceType: 'feature',
        factType: 'feature',
        canonicalFactType: CANONICAL_FACT_TYPES.FEATURE,
        candidateAuthored: false,
      },
      {
        items: p.featureDescriptions,
        sourceType: 'feature-description',
        factType: 'feature',
        canonicalFactType: CANONICAL_FACT_TYPES.FEATURE,
        candidateAuthored: false,
      },
      {
        items: p.responsibilities,
        sourceType: 'responsibility',
        factType: 'responsibility',
        canonicalFactType: CANONICAL_FACT_TYPES.RESPONSIBILITY,
        candidateAuthored: true,
      },
      {
        items: p.implementationDescriptions,
        sourceType: 'responsibility',
        factType: 'implementation',
        canonicalFactType: CANONICAL_FACT_TYPES.IMPLEMENTATION,
        candidateAuthored: true,
      },
    ];
    for (const surf of surfaces) {
      for (const item of Array.isArray(surf.items) ? surf.items : []) {
        const rawText =
          typeof item === 'object' && item !== null ? item.text || item.description : item;
        const provenance =
          typeof item === 'object' && item !== null && item.provenanceStatus
            ? item.provenanceStatus
            : projectLevelProvenance;
        const candidateAuthored =
          typeof item === 'object' && item !== null && typeof item.candidateAuthored === 'boolean'
            ? item.candidateAuthored
            : surf.candidateAuthored;
        addFact({
          text: rawText,
          association,
          sourceType: surf.sourceType,
          factType: surf.factType,
          canonicalFactType: surf.canonicalFactType,
          provenance,
          technologies: projTech,
          ownerType: 'PROJECT',
          ownerId: projKey,
          candidateAuthored,
          evidenceRefs:
            typeof item === 'object' && item !== null && Array.isArray(item.evidenceRefs)
              ? item.evidenceRefs
              : [],
        });
      }
    }

    // Project description as a lower-priority description fact (never candidate agency)
    if (p.description && typeof p.description === 'string') {
      addFact({
        text: p.description,
        association,
        sourceType: 'description',
        factType: 'project-description',
        canonicalFactType: CANONICAL_FACT_TYPES.FEATURE,
        provenance: projectLevelProvenance,
        technologies: projTech,
        ownerType: 'PROJECT',
        ownerId: projKey,
        candidateAuthored: false,
      });
    }

    // Evidence-derived facts: presence evidence contributes technology facts
    // only (HARD INVARIANT: presence evidence can never become accomplishment prose)
    for (const ev of Array.isArray(p.evidence) ? p.evidence : []) {
      const semClass = classifyEvidenceSemanticType(ev);
      if (semClass === EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE) {
        const techName = ev.skillName || ev.skillSlug;
        if (techName) {
          addFact({
            text: `Uses ${normalizeTechnologyName(techName)}`,
            association,
            sourceType: 'evidence',
            factType: 'technology',
            canonicalFactType: CANONICAL_FACT_TYPES.TECHNOLOGY,
            provenance: 'VERIFIED',
            confidence: typeof ev.confidenceScore === 'number' ? ev.confidenceScore : 1,
            technologies: [normalizeTechnologyName(techName)],
            measurable: false,
            ownerType: 'PROJECT',
            ownerId: projKey,
            candidateAuthored: false,
            corroborated: true,
            renderable: false,
            evidenceRefs: [],
            _evidenceRefPayload: ev,
          });
        }
        continue;
      }

      const claimText = ev.description || ev.featureSummary || ev.claimText || ev.message || null;
      if (claimText) {
        addFact({
          text: claimText,
          association,
          sourceType: 'evidence',
          factType:
            semClass === EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE ? 'outcome' : 'implementation',
          canonicalFactType:
            semClass === EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE
              ? CANONICAL_FACT_TYPES.OUTCOME
              : CANONICAL_FACT_TYPES.IMPLEMENTATION,
          provenance: 'VERIFIED',
          confidence: typeof ev.confidenceScore === 'number' ? ev.confidenceScore : 0.9,
          technologies: ev.skillName ? [normalizeTechnologyName(ev.skillName)] : projTech,
          ownerType: 'PROJECT',
          ownerId: projKey,
          candidateAuthored: false,
          corroborated: true,
          renderable: true,
          evidenceRefs: [],
          _evidenceRefPayload: ev,
        });
      }
    }
  }

  // ── 2. Experience facts ───────────────────────────────────────────────────
  const rawExperience = meta.experience || profile.experience || profile.workExperience || [];
  for (const [idx, exp] of (Array.isArray(rawExperience) ? rawExperience : []).entries()) {
    const expId = exp.id || `exp-${idx + 1}`;
    const association = { experienceId: expId, company: exp.company || '' };
    for (const b of Array.isArray(exp.bullets) ? exp.bullets : []) {
      const rawText = typeof b === 'object' && b !== null ? b.text || b.description : b;
      addFact({
        text: rawText,
        association,
        sourceType: 'bullet',
        factType: 'candidate-authored',
        canonicalFactType: CANONICAL_FACT_TYPES.RESPONSIBILITY,
        provenance: 'USER_PROVIDED',
        ownerType: 'EXPERIENCE',
        ownerId: expId,
        candidateAuthored: true,
      });
    }
  }

  // ── 3. Education facts ────────────────────────────────────────────────────
  const rawEducation = meta.education || profile.education || [];
  for (const [idx, edu] of (Array.isArray(rawEducation) ? rawEducation : []).entries()) {
    const eduId = edu.id || `edu-${idx + 1}`;
    const association = { educationId: eduId, institution: edu.institution || '' };
    const degreeText = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
    const institutionText = edu.institution || '';
    const fullEduText = [degreeText, institutionText].filter(Boolean).join(', ');
    if (fullEduText) {
      addFact({
        text: fullEduText,
        association,
        sourceType: 'education',
        factType: 'education',
        canonicalFactType: CANONICAL_FACT_TYPES.EDUCATION,
        ownerType: 'EDUCATION',
        ownerId: eduId,
        provenance: 'USER_PROVIDED',
        candidateAuthored: true,
        renderable: true,
      });
    }
    for (const c of Array.isArray(edu.coursework) ? edu.coursework : []) {
      addFact({
        text: `Completed coursework in ${c}`,
        association,
        sourceType: 'coursework',
        factType: 'education',
        canonicalFactType: CANONICAL_FACT_TYPES.EDUCATION,
        ownerType: 'EDUCATION',
        ownerId: eduId,
        provenance: 'USER_PROVIDED',
        candidateAuthored: true,
        renderable: true,
      });
    }
  }

  // ── 4. Certification facts ────────────────────────────────────────────────
  const rawCerts = meta.certifications || profile.certifications || [];
  for (const [idx, cert] of (Array.isArray(rawCerts) ? rawCerts : []).entries()) {
    const certId = cert.id || `cert-${idx + 1}`;
    const certName = typeof cert === 'string' ? cert : cert.name || cert.title;
    if (certName) {
      addFact({
        text: certName,
        association: { certificationId: certId },
        sourceType: 'certification',
        factType: 'certification',
        canonicalFactType: CANONICAL_FACT_TYPES.CERTIFICATION,
        ownerType: 'CERTIFICATION',
        ownerId: certId,
        provenance: 'USER_PROVIDED',
        candidateAuthored: true,
        renderable: true,
      });
    }
  }

  // ── 5. Profile-level problem-solving facts (DSA) ──────────────────────────
  const dsa =
    profile.problemSolving ||
    profile.dsa ||
    meta.dsa ||
    meta.problemSolving ||
    meta.resumeData?.problemSolving ||
    null;
  if (dsa && typeof dsa === 'object') {
    const association = { projectId: PROBLEM_SOLVING_PROJECT_KEY, projectName: 'Problem Solving' };
    for (const b of Array.isArray(dsa.bullets) ? dsa.bullets : []) {
      const rawText = typeof b === 'object' && b !== null ? b.text || b.description : b;
      addFact({
        text: rawText,
        association,
        sourceType: 'summary',
        factType: 'candidate-authored',
        canonicalFactType: CANONICAL_FACT_TYPES.DSA,
        provenance: 'CLAIMED',
        ownerType: 'DSA',
        ownerId: PROBLEM_SOLVING_PROJECT_KEY,
        candidateAuthored: true,
        renderable: true,
      });
    }
    const url = typeof dsa.profileUrl === 'string' ? dsa.profileUrl.trim() : '';
    if (url && /^https?:\/\//i.test(url)) {
      const linkFactId = factFingerprint(
        `problem-solving-profile: ${url}`,
        PROBLEM_SOLVING_PROJECT_KEY
      );
      if (!seenFingerprints.has(linkFactId)) {
        seenFingerprints.add(linkFactId);
        facts.push({
          id: linkFactId,
          factId: linkFactId,
          ownerType: 'DSA',
          ownerId: PROBLEM_SOLVING_PROJECT_KEY,
          text: `Problem-solving profile: ${url}`,
          factType: 'external-corroboration',
          canonicalFactType: CANONICAL_FACT_TYPES.LINK,
          sourceType: 'link',
          sourceRef: { url },
          provenanceStatus: 'CLAIMED',
          provenance: 'CLAIMED',
          confidence: 0.7,
          semanticTopics: ['problem-solving'],
          semanticTopic: 'problem-solving',
          association,
          technologies: [],
          metrics: [],
          measurable: false,
          candidateAuthored: true,
          corroborated: false,
          renderable: true,
          evidenceRefs: [],
          jobRelevance: 0,
        });
      }
    }
  }

  // ── 6. Evidence-ref normalization (schema-clean boundary) ─────────────────
  for (const f of facts) {
    if (Array.isArray(f.evidenceRefs) && f.evidenceRefs.length > 0) {
      f.evidenceRefs = f.evidenceRefs
        .map((r) => toEvidenceReference(r, 'VERIFIED'))
        .filter(Boolean);
    }
  }

  // ── 7. Order-invariant final ordering (by factId) ─────────────────────────
  facts.sort((a, b) => (a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0));

  // ── 8. Index by project ───────────────────────────────────────────────────
  const byProject = new Map();
  for (const f of facts) {
    const key = f.association?.projectId || '';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(f);
  }

  // ── 9. Cross-project duplicate attribution (P16-009) ──────────────────────
  const evidenceCountByProject = new Map();
  for (const p of Array.isArray(rawProjects) ? rawProjects : []) {
    const key =
      p.id ||
      p.projectId ||
      (p.name
        ? String(p.name)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
        : '');
    if (!key) continue;
    const count = p.evidenceCount ?? (Array.isArray(p.evidence) ? p.evidence.length : 0);
    evidenceCountByProject.set(key, count);
  }

  const claimGroups = new Map();
  for (const f of facts) {
    if (f.factType === 'technology' || f.factType === 'external-corroboration') continue;
    const textKey = f.text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!textKey) continue;
    if (!claimGroups.has(textKey)) claimGroups.set(textKey, []);
    claimGroups.get(textKey).push(f);
  }

  const crossProjectDuplicateFacts = [];
  const dropFactIds = new Set();
  for (const group of claimGroups.values()) {
    const projectIds = new Set(group.map((f) => f.association?.projectId || ''));
    if (projectIds.size <= 1) continue;
    let owner = null;
    for (const f of group) {
      const pid = f.association?.projectId || '';
      const evc = evidenceCountByProject.get(pid) ?? 0;
      const ownerEvc = evidenceCountByProject.get(owner?.association?.projectId || '') ?? 0;
      if (
        !owner ||
        evc > ownerEvc ||
        (evc === ownerEvc && pid < (owner.association?.projectId || ''))
      ) {
        owner = f;
      }
    }
    for (const f of group) {
      if (f === owner || f.factId === owner.factId) continue;
      dropFactIds.add(f.factId);
      crossProjectDuplicateFacts.push({
        factId: f.factId,
        projectId: f.association?.projectId || '',
        text: f.text,
        reason: 'AMBIGUOUS_ATTRIBUTION',
        attributedTo: owner.association?.projectId || '',
      });
    }
  }
  if (dropFactIds.size > 0) {
    const kept = facts.filter((f) => !dropFactIds.has(f.factId));
    facts.length = 0;
    facts.push(...kept);
    for (const [key, list] of byProject) {
      byProject.set(
        key,
        list.filter((f) => !dropFactIds.has(f.factId))
      );
    }
  }

  // Pre-score facts if jobPosting was passed
  if (jobPosting) {
    const scored = scoreFactsForJob(facts, jobPosting);
    facts.length = 0;
    facts.push(...scored);
  }

  return {
    facts,
    byProject,
    crossProjectDuplicateFacts,
    stats: {
      totalFacts: facts.length,
      distinctFacts: countDistinctCanonicalFacts(facts.map((f) => f.text)),
      byType: facts.reduce((acc, f) => {
        acc[f.factType] = (acc[f.factType] || 0) + 1;
        return acc;
      }, {}),
      measurableFacts: facts.filter((f) => f.measurable).length,
    },
  };
}

/**
 * Scores facts for a target job, mutating nothing: returns NEW fact objects
 * with jobRelevance assigned. Relevance is computed from structured job text
 * (requirements/skills/description) with generic normalization only.
 *
 * @param {Array<object>} facts Canonical facts
 * @param {object|null} jobPosting
 * @returns {Array<object>} New fact array with jobRelevance
import {
  normalizeJobInput,
  getJobRequirementConceptsUnified,
  normalizeJobRequirementString,
  normalizeRequirementToken,
  classifyRequirement,
  resolveRequirementImportance,
  createDeterministicRequirementId,
  GENERIC_REQUIREMENT_TOKENS,
  REQUIREMENT_ALIASES,
  REQUIREMENT_CLASS_BY_CATEGORY,
} from './job-normalization.service.js';

export {
  normalizeJobRequirementString,
  normalizeRequirementToken,
  classifyRequirement,
  resolveRequirementImportance,
  createDeterministicRequirementId,
  GENERIC_REQUIREMENT_TOKENS,
  REQUIREMENT_ALIASES,
  REQUIREMENT_CLASS_BY_CATEGORY,
};

/**
 * Returns specific, structured job concepts used consistently by ranking and
 * selection. Generic role vocabulary is intentionally excluded.
 *
 * @param {object|null} jobPosting
 * @returns {Array<{id:string,text:string,importance:number,importanceLabel:string,requirementClass:string,normalizedName:string,tokens:Set<string>}>}
 */
export function getJobRequirementConcepts(jobPosting) {
  return getJobRequirementConceptsUnified(jobPosting);
}

/**
 * Builds the single normalized job contract consumed by all tailoring stages.
 *
 * @param {object|null} jobPosting
 * @returns {{jobFingerprint:string, role:object, normalizedRequirements:Array<object>}}
 */
export function buildCanonicalJobRequirements(jobPosting) {
  return normalizeJobInput(jobPosting);
}

function normalizedFactTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeRequirementToken)
      .filter((token) => token && !GENERIC_REQUIREMENT_TOKENS.has(token))
  );
}

function matchesRequirementConcept(fact, concept) {
  const factTokens = normalizedFactTokens(fact?.text);
  const technologyTokens = new Set(
    (Array.isArray(fact?.technologies) ? fact.technologies : [])
      .flatMap((technology) => [...normalizedFactTokens(technology)])
  );
  const available = new Set([...factTokens, ...technologyTokens]);
  const conceptTokens = [...concept.tokens];
  const matchedTokens = conceptTokens.filter((token) => available.has(token));
  const normalizedText = String(fact?.text || '').toLowerCase();
  const normalizedConcept = String(concept.normalizedName || '').replace(/\./g, '.');
  const phraseMatch =
    normalizedConcept.length > 0 &&
    new RegExp(
      `(^|[^a-z0-9+#.])${normalizedConcept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9+#.])`,
      'i'
    ).test(normalizedText);
  if (phraseMatch) return { matchType: 'EXACT_CONCEPT', strength: 1 };
  if (conceptTokens.length === 1 && matchedTokens.length === 1) {
    return { matchType: 'NORMALIZED_ALIAS', strength: 0.9 };
  }
  if (conceptTokens.length > 1 && matchedTokens.length / conceptTokens.length >= 0.6) {
    return { matchType: 'TOKEN_BOUNDARY', strength: 0.7 };
  }
  return null;
}

/**
 * Creates the authoritative candidate-fact to job-requirement evidence graph.
 * All section selectors should consume its edges rather than matching job text.
 *
 * @param {Array<object>} facts
 * @param {object|null} jobPosting
 * @returns {{job: object, facts: Array<object>, matches: Array<object>}}
 */
export function buildCandidateJobEvidenceGraph(facts, jobPosting) {
  const job = buildCanonicalJobRequirements(jobPosting);
  const concepts = getJobRequirementConcepts({ ...jobPosting, ...job });
  const matches = [];
  for (const fact of Array.isArray(facts) ? facts : []) {
    for (const requirement of concepts) {
      const relation = matchesRequirementConcept(fact, requirement);
      if (!relation) continue;
      matches.push({
        requirementId: requirement.id,
        factId: fact.factId || fact.id || null,
        matchType: relation.matchType,
        matchStrength: relation.strength,
        requirementImportance: requirement.importanceLabel,
        evidenceStrength: fact.confidence ?? 0.8,
        confidence: Math.min(1, relation.strength * (fact.confidence ?? 0.8)),
        explanation: `${relation.matchType} matched '${requirement.text}' to candidate fact`,
      });
    }
  }
  return { job, facts: Array.isArray(facts) ? facts : [], matches };
}

  /**
   * Computes specific requirement coverage for a fact set.
   *
   * @param {Array<object>} facts
   * @param {object|null} jobPosting
   * @returns {{matchedRequirementIds:string[], coveredCount:number, totalCount:number, coverage:number}}
   */
export function calculateRequirementCoverage(facts, jobPosting) {
    const graph = buildCandidateJobEvidenceGraph(facts, jobPosting);
    const concepts = getJobRequirementConcepts({ ...jobPosting, ...graph.job });
    if (concepts.length === 0) {
      return {
        matchedRequirementIds: [],
        coveredCount: 0,
        totalCount: 0,
        coverage: 1,
        meaningfulCoverage: 1,
        tier: 'C',
        matches: [],
      };
    }
    const matched = new Set(graph.matches.map((match) => match.requirementId));
    const matches = graph.matches.map((match) => {
      const concept = concepts.find((item) => item.id === match.requirementId);
      return {
        ...match,
        requirement: concept?.text,
        importance: concept?.importanceLabel,
        requirementClass: concept?.requirementClass,
        signal: match.matchType,
      };
    });
    const totalWeight = concepts.reduce((sum, concept) => sum + concept.importance, 0);
    const coveredWeight = concepts
      .filter((concept) => matched.has(concept.id))
      .reduce((sum, concept) => sum + concept.importance, 0);
    const meaningfulCoverage = totalWeight > 0 ? coveredWeight / totalWeight : 0;
    const requiredConcepts = concepts.filter((concept) => concept.importanceLabel === 'REQUIRED');
    const requiredCovered = requiredConcepts.filter((concept) => matched.has(concept.id)).length;
    const requiredCoverage =
      requiredConcepts.length > 0 ? requiredCovered / requiredConcepts.length : meaningfulCoverage;
    const tier =
      requiredCoverage >= 0.75 || meaningfulCoverage >= 0.7
        ? 'A'
        : requiredCoverage > 0 || meaningfulCoverage >= 0.35
          ? 'B'
          : matched.size > 0
            ? 'C'
            : 'D';
    return {
      matchedRequirementIds: [...matched],
      coveredCount: matched.size,
      totalCount: concepts.length,
      coverage: matched.size / concepts.length,
      meaningfulCoverage,
      requiredCoverage,
      tier,
      matches,
    };
}

/**
 * Scores facts for a target job, mutating nothing: returns NEW fact objects
 * with jobRelevance and importance assigned. Relevance is computed from structured job text
 * (requirements/skills/description) with generic normalization accepting both strings and objects.
 *
 * @param {Array<object>} facts Canonical facts
 * @param {object|null} jobPosting
 * @returns {Array<object>} New fact array with jobRelevance and importance
 */
export function scoreFactsForJob(facts, jobPosting) {
  const graph = buildCandidateJobEvidenceGraph(facts, jobPosting);
  const matchesByFact = new Map();
  for (const match of graph.matches) {
    if (!matchesByFact.has(match.factId)) matchesByFact.set(match.factId, []);
    matchesByFact.get(match.factId).push(match);
  }

  return (Array.isArray(facts) ? facts : []).map((f) => {
    const factMatches = matchesByFact.get(f.factId || f.id) || [];
    let relevance = 0;
    const matchedRequirementIds = factMatches.map((match) => match.requirementId);
    for (const match of factMatches) {
      const requirement = graph.job.normalizedRequirements.find(
        (item) => item.id === match.requirementId
      );
      relevance += (requirement?.weight ?? 0.7) * 30 * match.matchStrength;
    }

    // Evidence-backed facts get a trust bonus
    if (f.evidenceRefs?.length || f.sourceType === 'evidence') relevance += 5;

    // Topic alignment: implementation/architecture/outcome facts are
    // intrinsically more bullet-worthy than tooling-only facts.
    const topicBonus = {
      architecture: 6,
      implementation: 5,
      outcome: 6,
      reliability: 4,
      integration: 3,
      capability: 2,
      tooling: 1,
      'problem-solving': 2,
    };
    relevance += topicBonus[f.semanticTopic] ?? 0;
    relevance *= f.confidence ?? 0.8;
    const scoredRelevance = Math.round(relevance * 100) / 100;

    const isAccomplishment = isAccomplishmentCandidate(f);
    const hasMetrics = Array.isArray(f.metrics) && f.metrics.length > 0;
    const importance =
      Math.round(
        ((f.confidence ?? 0.8) * 0.3 +
          Math.min(1.0, scoredRelevance / 30) * 0.4 +
          (isAccomplishment ? 0.2 : 0.05) +
          (hasMetrics ? 0.1 : 0)) *
          100
      ) / 100;

    return {
      ...f,
      jobRelevance: scoredRelevance,
      importance,
      matchedRequirementIds: Array.from(
        new Set([...(f.matchedRequirementIds || []), ...matchedRequirementIds])
      ),
    };
  });
}

/**
 * Computes deterministic fact utilization statistics and explains fact-specific omission reasons.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Available canonical facts
 * @param {Set<string>|Array<string>} params.renderedFactIds Fact IDs actually rendered
 * @returns {object} Fact utilization report
 */
export function computeFactUtilizationStats(inventoryOrParams, renderedFactIdsArg = null) {
  let facts = [];
  let renderedFactIds = new Set();

  if (renderedFactIdsArg !== null) {
    facts = Array.isArray(inventoryOrParams) ? inventoryOrParams : inventoryOrParams?.facts || [];
    renderedFactIds = renderedFactIdsArg;
  } else if (inventoryOrParams && typeof inventoryOrParams === 'object') {
    facts = Array.isArray(inventoryOrParams.facts) ? inventoryOrParams.facts : [];
    renderedFactIds = inventoryOrParams.renderedFactIds || new Set();
  }

  const renderedSet = renderedFactIds instanceof Set ? renderedFactIds : new Set(renderedFactIds);
  const totalAvailable = facts.length;
  const highValueFacts = facts.filter(
    (f) => f.renderable && (f.importance >= 0.5 || isAccomplishmentCandidate(f))
  );
  const totalHighValue = highValueFacts.length;

  const usedFacts = facts.filter((f) => renderedSet.has(f.factId) || renderedSet.has(f.id));
  const highValueUsed = usedFacts.filter(
    (f) => f.renderable && (f.importance >= 0.5 || isAccomplishmentCandidate(f))
  );

  const omittedFacts = facts.filter((f) => !renderedSet.has(f.factId) && !renderedSet.has(f.id));
  const omissionReasons = {};

  for (const f of omittedFacts) {
    if (f.omissionReason) {
      omissionReasons[f.factId] = f.omissionReason;
    } else if (isProjectDescriptionFact(f)) {
      omissionReasons[f.factId] = OMISSION_REASONS.DESCRIPTION_ONLY;
    } else if (f.confidence < 0.6) {
      omissionReasons[f.factId] = OMISSION_REASONS.LOW_EVIDENCE_CONFIDENCE;
    } else if ((f.jobRelevance ?? 0) < 10) {
      omissionReasons[f.factId] = OMISSION_REASONS.LOW_JOB_RELEVANCE;
    } else {
      omissionReasons[f.factId] = OMISSION_REASONS.PHYSICAL_CAPACITY;
    }
  }

  const detailedOmissionRecords = omittedFacts.map((f, idx) => ({
    factId: f.factId || f.id,
    reason: omissionReasons[f.factId] || OMISSION_REASONS.CAPACITY_LIMIT,
    utilityRank: idx + 1,
    relevanceScore: f.jobRelevance ?? 0,
    evidenceStrength: f.confidence ?? 0.8,
    competingFactIds: usedFacts.map((u) => u.factId || u.id),
    eliminatedAtStage: f.eliminatedAtStage || 'CLAIM_SELECTION',
    selectedAlternative: f.selectedAlternative || usedFacts[0]?.factId || null,
    text: f.text,
  }));

  return {
    factsAvailable: totalAvailable,
    highValueFactsAvailable: totalHighValue,
    factsUsed: usedFacts.length,
    highValueFactsUsed: highValueUsed.length,
    factsOmitted: omittedFacts.length,
    factsReused: Math.max(0, renderedSet.size - usedFacts.length),
    redundantFactUse: 0,
    canonicalFacts: totalAvailable,
    authorizedFacts: facts.filter((f) => f.provenanceStatus !== 'UNAUTHORIZED').length,
    renderableFacts: facts.filter((f) => f.renderable).length,
    eligibleFacts: totalHighValue,
    renderedFacts: usedFacts.length,
    detailedOmissionRecords,
    utilizationRate:
      totalAvailable > 0 ? parseFloat((usedFacts.length / totalAvailable).toFixed(2)) : 0,
    highValueUtilizationRate:
      totalHighValue > 0 ? parseFloat((highValueUsed.length / totalHighValue).toFixed(2)) : 0,
    omissionReasons,
  };
}

/**
 * Merges a duplicate candidate surface into an existing fact without losing
 * provenance: widens sourceType to the highest-priority surface seen and
 * unions evidence refs / technologies.
 *
 * @private
 * @param {object} existing
 * @param {object} candidate
 */
function mergeSources(existing, candidate) {
  const priority = [
    'bullet',
    'highlight',
    'feature',
    'feature-description',
    'responsibility',
    'description',
    'evidence',
    'summary',
    'link',
  ];
  const a = priority.indexOf(existing.sourceType);
  const b = priority.indexOf(candidate.sourceType || '');
  if (b !== -1 && (a === -1 || b < a)) existing.sourceType = candidate.sourceType;
  if (
    existing.factType === 'project-description' &&
    candidate.factType &&
    candidate.factType !== 'project-description'
  ) {
    existing.factType = candidate.factType;
  }
  const techs = new Set([...(existing.technologies || []), ...(candidate.technologies || [])]);
  existing.technologies = [...techs];
  const refs = new Map();
  for (const r of [...(existing.evidenceRefs || []), ...(candidate.evidenceRefs || [])]) {
    if (r?.evidenceId) refs.set(r.evidenceId, r);
  }
  existing.evidenceRefs = [...refs.values()];
  if (
    candidate.provenance &&
    existing.provenance !== 'VERIFIED' &&
    candidate.provenance === 'VERIFIED'
  ) {
    existing.provenance = 'VERIFIED';
  }
}
