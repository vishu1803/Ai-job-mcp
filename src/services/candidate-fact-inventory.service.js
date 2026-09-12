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
import { calculateFactSemanticOverlap, countDistinctCanonicalFacts } from './candidate-artifact-content.service.js';
import { classifyEvidenceSemanticType, EVIDENCE_SEMANTIC_CLASS, toEvidenceReference } from './resume-content-strategy.service.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

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
  { topic: 'architecture', tokens: ['architecture', 'architected', 'distributed', 'consensus', 'raft', 'microservices', 'event-driven', 'queue', 'streaming', 'pipeline', 'sharding', 'replication', 'worker pool', 'system design'] },
  { topic: 'reliability', tokens: ['reliability', 'fault-tolerant', 'resilient', 'retry', 'backoff', 'idempotent', 'recovery', 'observability', 'monitoring', 'telemetry', 'logging', 'tracing', 'availability'] },
  { topic: 'integration', tokens: ['integrated', 'integration', 'api', 'rest', 'graphql', 'websocket', 'oauth', 'webhook', 'sdk', 'connector', 'third-party'] },
  { topic: 'implementation', tokens: ['implemented', 'built', 'engineered', 'developed', 'designed', 'coded', 'wrote', 'refactored', 'migrated', 'optimized', 'automated'] },
  { topic: 'outcome', tokens: ['reduced', 'increased', 'improved', 'resulting', 'achieved', 'delivered', 'saved', 'faster', 'latency', 'throughput'] },
  { topic: 'tooling', tokens: ['docker', 'containerized', 'ci/cd', 'github actions', 'terraform', 'kubernetes', 'tooling', 'deployed'] },
  { topic: 'problem-solving', tokens: ['data structures', 'algorithms', 'leetcode', 'problem solving', 'competitive programming', 'dynamic programming', 'graph theory'] },
]);

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
  if (/(?:reduced|increased|improved|resulting|achieved|saved|by \d+)/i.test(lower)) return CANONICAL_FACT_TYPES.OUTCOME;
  if (/(?:distributed|microservices|architecture|consensus|raft|sharding|pipeline|system design)/i.test(lower)) return CANONICAL_FACT_TYPES.ARCHITECTURE;
  if (/(?:latency|throughput|rps|qps|speed|benchmark|memory allocation|cpu utilization)/i.test(lower)) return CANONICAL_FACT_TYPES.PERFORMANCE;
  if (/(?:fault-tolerant|resilient|retry|backoff|idempotent|recovery|monitoring|telemetry)/i.test(lower)) return CANONICAL_FACT_TYPES.RELIABILITY;
  if (/(?:oauth|rbac|security|auth|jwt|encryption|permission)/i.test(lower)) return CANONICAL_FACT_TYPES.SECURITY;
  if (/(?:integrated|integration|api|rest|graphql|websocket|connector|webhook)/i.test(lower)) return CANONICAL_FACT_TYPES.INTEGRATION;
  if (/(?:implemented|built|engineered|developed|coded|designed)/i.test(lower)) return CANONICAL_FACT_TYPES.IMPLEMENTATION;
  if (/(?:feature|component|module|dashboard|portal)/i.test(lower)) return CANONICAL_FACT_TYPES.FEATURE;
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
  const matches = String(text).match(/(?:\b\d+(?:\.\d+)?%|\b\d+\s*(?:million|billion)|\b\d{2,}\+?\s*(?:users|requests|rps|qps|customers|problems)|\$\s?\d|\bteam\s+of\s+\d+|\b\d+\s*(?:ms|s)\s+(?:latency|p\d))/gi) || [];
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
  const norm = String(normalizedText || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(`${associationKey}::${norm}`).digest('hex').slice(0, 24);
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
      candidate.factType === 'technology' ||
      candidate.factType === CANONICAL_FACT_TYPES.TECHNOLOGY;
    const minLen = isTechFact ? 4 : 15;
    if (!text || text.length < minLen) return;

    const assocKey =
      candidate.association?.projectId ||
      (candidate.association?.projectName ? String(candidate.association.projectName).toLowerCase().replace(/[^a-z0-9]/g, '') : '') ||
      candidate.association?.experienceId ||
      candidate.association?.educationId ||
      '';

    const factId = factFingerprint(text, assocKey);

    // Exact-text dedup across surfaces (e.g. same sentence in bullets + features)
    if (seenFingerprints.has(factId)) {
      const existing = facts.find((f) => f.factId === factId);
      if (existing) mergeSources(existing, candidate);
      return;
    }
    seenFingerprints.add(factId);

    // Semantic near-duplicate merge (redundant descriptions across surfaces)
    const assocFacts = facts.filter((f) => (f.association?.projectId || '') === (candidate.association?.projectId || ''));
    const dup = assocFacts.find((f) => calculateFactSemanticOverlap(text, f.text) >= clusterThreshold);
    if (dup) {
      mergeSources(dup, candidate);
      return;
    }

    const rawFactType = candidate.factType || 'candidate-authored';
    const canonicalFactType = isTechFact
      ? CANONICAL_FACT_TYPES.TECHNOLOGY
      : candidate.canonicalFactType || classifyCanonicalFactType(text, CANONICAL_FACT_TYPES.IMPLEMENTATION);

    const topic = candidate.semanticTopic || classifyFactTopic(text);
    const provenance = candidate.provenance || 'USER_PROVIDED';
    const confidence =
      typeof candidate.confidence === 'number'
        ? candidate.confidence
        : PROVENANCE_CONFIDENCE[provenance] ?? 0.8;

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
      text,
      factType: rawFactType,
      canonicalFactType,
      projectId: candidate.association?.projectId || null,
      experienceId: candidate.association?.experienceId || null,
      educationId: candidate.association?.educationId || null,
      association: candidate.association || {},
      technologies: Array.isArray(candidate.technologies)
        ? candidate.technologies.map(normalizeTechnologyName).filter(Boolean)
        : [],
      metrics: candidate.metrics || extractAuthenticMetrics(text),
      semanticTopics: [topic],
      semanticTopic: topic,
      jobRelevance: candidate.jobRelevance ?? 0,
      candidateAuthored: candidate.candidateAuthored ?? (candidate.sourceType !== 'evidence'),
      corroborated: candidate.corroborated ?? (provenance === 'VERIFIED' || provenance === 'CORROBORATED'),
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
      { items: p.bullets, sourceType: 'bullet', factType: 'candidate-authored', canonicalFactType: CANONICAL_FACT_TYPES.IMPLEMENTATION },
      { items: p.highlights, sourceType: 'highlight', factType: 'candidate-authored', canonicalFactType: CANONICAL_FACT_TYPES.FEATURE },
      { items: p.features, sourceType: 'feature', factType: 'feature', canonicalFactType: CANONICAL_FACT_TYPES.FEATURE },
      { items: p.featureDescriptions, sourceType: 'feature-description', factType: 'feature', canonicalFactType: CANONICAL_FACT_TYPES.FEATURE },
      { items: p.responsibilities, sourceType: 'responsibility', factType: 'responsibility', canonicalFactType: CANONICAL_FACT_TYPES.RESPONSIBILITY },
      { items: p.implementationDescriptions, sourceType: 'responsibility', factType: 'implementation', canonicalFactType: CANONICAL_FACT_TYPES.IMPLEMENTATION },
    ];
    for (const surf of surfaces) {
      for (const item of Array.isArray(surf.items) ? surf.items : []) {
        const rawText = typeof item === 'object' && item !== null ? item.text || item.description : item;
        const provenance =
          typeof item === 'object' && item !== null && item.provenanceStatus
            ? item.provenanceStatus
            : projectLevelProvenance;
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
          candidateAuthored: true,
          evidenceRefs: typeof item === 'object' && item !== null && Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [],
        });
      }
    }

    // Project description as a lower-priority description fact
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
        candidateAuthored: true,
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
          factType: semClass === EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE ? 'outcome' : 'implementation',
          canonicalFactType: semClass === EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE ? CANONICAL_FACT_TYPES.OUTCOME : CANONICAL_FACT_TYPES.IMPLEMENTATION,
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
  const dsa = profile.problemSolving || profile.dsa || meta.dsa || meta.problemSolving || meta.resumeData?.problemSolving || null;
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
      const linkFactId = factFingerprint(`problem-solving-profile: ${url}`, PROBLEM_SOLVING_PROJECT_KEY);
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
    const key = p.id || p.projectId || (p.name ? String(p.name).toLowerCase().replace(/[^a-z0-9]/g, '') : '');
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
      if (!owner || evc > ownerEvc || (evc === ownerEvc && pid < (owner.association?.projectId || ''))) {
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
      byProject.set(key, list.filter((f) => !dropFactIds.has(f.factId)));
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
 */
export function scoreFactsForJob(facts, jobPosting) {
  const jp = jobPosting || {};
  const jobText = String(
    `${jp.title || ''} ${(Array.isArray(jp.requirements) ? jp.requirements : []).join(' ')} ` +
      `${(Array.isArray(jp.skills) ? jp.skills : []).map((s) => (typeof s === 'string' ? s : s?.name || '')).join(' ')} ${jp.description || ''}`
  ).toLowerCase();

  const jobTerms = new Set();
  for (const w of jobText.split(/[^a-z0-9+#.]+/)) {
    if (w.length >= 3) jobTerms.add(w);
  }
  const keyTerms = new Set(
    String(`${jp.title || ''} ${(Array.isArray(jp.requirements) ? jp.requirements : []).join(' ')} ${(Array.isArray(jp.skills) ? jp.skills : []).map((s) => (typeof s === 'string' ? s : s?.name || '')).join(' ')}`)
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length >= 3)
  );

  return (Array.isArray(facts) ? facts : []).map((f) => {
    const lower = f.text.toLowerCase();
    let relevance = 0;
    for (const term of jobTerms) {
      if (lower.includes(term)) relevance += keyTerms.has(term) ? 12 : 5;
    }
    // Evidence-backed facts get a trust bonus
    if (f.evidenceRefs?.length || f.sourceType === 'evidence') relevance += 5;
    // Topic alignment: implementation/architecture/outcome facts are
    // intrinsically more bullet-worthy than tooling-only facts.
    const topicBonus = { architecture: 6, implementation: 5, outcome: 6, reliability: 4, integration: 3, capability: 2, tooling: 1, 'problem-solving': 2 };
    relevance += topicBonus[f.semanticTopic] ?? 0;
    relevance *= f.confidence ?? 0.8;
    return { ...f, jobRelevance: Math.round(relevance * 100) / 100 };
  });
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
  const priority = ['bullet', 'highlight', 'feature', 'feature-description', 'responsibility', 'description', 'evidence', 'summary', 'link'];
  const a = priority.indexOf(existing.sourceType);
  const b = priority.indexOf(candidate.sourceType || '');
  if (b !== -1 && (a === -1 || b < a)) existing.sourceType = candidate.sourceType;
  if (existing.factType === 'project-description' && candidate.factType && candidate.factType !== 'project-description') {
    existing.factType = candidate.factType;
  }
  const techs = new Set([...(existing.technologies || []), ...(candidate.technologies || [])]);
  existing.technologies = [...techs];
  const refs = new Map();
  for (const r of [...(existing.evidenceRefs || []), ...(candidate.evidenceRefs || [])]) {
    if (r?.evidenceId) refs.set(r.evidenceId, r);
  }
  existing.evidenceRefs = [...refs.values()];
  if (candidate.provenance && existing.provenance !== 'VERIFIED' && candidate.provenance === 'VERIFIED') {
    existing.provenance = 'VERIFIED';
  }
}
