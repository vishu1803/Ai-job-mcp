/**
 * @file Professional Accomplishment Composition Service (P16-009).
 *
 * Consumes the canonical fact inventory (NEVER raw candidate arrays) and
 * composes professional, evidence-grounded accomplishment bullets:
 *
 *   canonical facts
 *     -> unsupported-claim gate
 *     -> complementary-dimension selection (ownership / system / implementation /
 *        complexity / reliability / integration / outcome)
 *     -> professional composition (multi-fact bullets, technology clauses)
 *     -> semantic redundancy enforcement (pairwise overlap >= 0.55 rejected)
 *     -> capacity-faithful selection (1–3 bullets per project)
 *
 * Non-negotiable invariants:
 * 1. NEVER invents metrics, users, scale, performance, teams, revenue, outcomes.
 * 2. Presence evidence contributes technology clauses only, never claims.
 * 3. Bullet text is composed exclusively from candidate-supported fact text.
 * 4. Deterministic: same inputs → same bullets, independent of source order.
 * 5. Consecutive bullets for the same project express different semantic facts.
 */

import { calculateTokenOverlap, toEvidenceReference } from './resume-content-strategy.service.js';
import { calculateFactSemanticOverlap } from './candidate-artifact-content.service.js';

/** Max bullets per project (universal professional ceiling). */
export const MAX_BULLETS_PER_PROJECT = 3;

/** Pairwise semantic-overlap threshold above which two bullets are redundant. */
export const REDUNDANCY_OVERLAP_THRESHOLD = 0.55;

/** Facts whose text matches these contexts may keep their measured values. */
const MEASURED_CONTEXT_PATTERN =
  /\b(?:across|within|in)\b.{0,60}(?:tests?|benchmarks?|profiling|load|local|sandbox|staging|dataset|dataset|coursework|practice)\b/i;

/** Facts asserting unsupported quantified claims are excluded from composition. */
function isUnsupportedMetricFact(fact) {
  if (!fact.measurable) return false;
  if (fact.evidenceRefs && fact.evidenceRefs.length > 0) return false;
  if (fact.provenance === 'VERIFIED' || fact.provenance === 'CORROBORATED') return false;
  return !MEASURED_CONTEXT_PATTERN.test(fact.text);
}

/** Claim facts can carry a bullet; technology facts cannot. */
function isClaimFact(fact) {
  return fact.factType !== 'technology' && fact.factType !== 'external-corroboration';
}

/**
 * Removes trailing punctuation artifacts when merging fact sentences.
 * @private
 */
function sentenceCase(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function lowerFirst(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function stripTrailingPeriod(text) {
  return String(text || '').trim().replace(/[.!?]+$/, '');
}

/**
 * Builds a technology clause from project-verified technologies not already
 * present in the bullet text. Uses ONLY the project's structured technology
 * list (schema-driven); unknown technologies render unchanged.
 *
 * @private
 * @param {string} text Composed bullet text
 * @param {Array<string>} technologies Canonical technology names
 * @param {number} maxTechs
 * @returns {string} e.g. ", using Rust and Redis" or ''
 */
function buildTechClause(text, technologies, maxTechs = 2) {
  const lower = text.toLowerCase();
  const missing = (Array.isArray(technologies) ? technologies : [])
    .filter(Boolean)
    .filter((t) => !lower.includes(String(t).toLowerCase()))
    .slice(0, maxTechs);
  if (missing.length === 0) return '';
  const joined =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
  return `, using ${joined}`;
}

/**
 * Determines the maximum defensible bullet capacity for a project from its
 * canonical facts. A project with six strong distinct facts can produce three
 * bullets; a project with only two distinct facts never manufactures three.
 *
 * @param {object} params
 * @param {Array<object>} params.claimFacts Canonical claim facts for the project
 * @param {number} [params.evidenceCount] Total evidence records backing the project
 * @param {number} [params.explicitBudget] Optimizer override (hard ceiling of 3)
 * @returns {{ capacity: number, distinctFactCount: number, rationale: string }}
 */
export function determineProjectBulletCapacity({ claimFacts, evidenceCount = 0, explicitBudget = null }) {
  const facts = Array.isArray(claimFacts) ? claimFacts : [];
  const distinctFactCount = facts.length;

  if (distinctFactCount === 0) {
    return { capacity: 0, distinctFactCount: 0, rationale: 'NO_CLAIM_FACTS' };
  }

  // Evidence strength: strong corroboration removes any doubt about depth.
  const strongEvidence = evidenceCount >= 10;
  const someEvidence = evidenceCount >= 3;

  // Base capacity: each distinct candidate-authored fact can anchor one bullet,
  // up to the universal professional ceiling of 3.
  let capacity = Math.min(MAX_BULLETS_PER_PROJECT, distinctFactCount);

  // Low-trust depth gate: 3+ facts justify 3 bullets only when the facts are
  // candidate-authored (USER_PROVIDED+) or evidence supports the project.
  // Weak-provenance-only facts with zero evidence cap at 2 distinct bullets.
  const allLowTrust = facts.every((f) => f.provenance === 'CLAIMED' || f.provenance === 'SELF_DECLARED');
  if (distinctFactCount >= 3 && allLowTrust && !strongEvidence && !someEvidence) {
    capacity = Math.min(capacity, 2);
  }

  if (typeof explicitBudget === 'number' && explicitBudget >= 0) {
    capacity = Math.min(capacity, explicitBudget);
  }

  const rationale =
    capacity >= 3
      ? `RICH_FACTS(${distinctFactCount})`
      : capacity === 2
        ? `MODERATE_FACTS(${distinctFactCount})`
        : `SPARSE_FACTS(${distinctFactCount})`;

  return { capacity, distinctFactCount, rationale };
}

/**
 * Selects the strongest complementary fact set for N bullets: each bullet is
 * anchored by a distinct semantic topic where possible (architecture +
 * implementation + reliability + outcome …), never the same fact twice.
 *
 * @private
 * @param {Array<object>} facts Scored claim facts (one project)
 * @param {number} n Bullet count
 * @returns {Array<Array<object>>} n fact groups (each group composes one bullet)
 */
function selectComplementaryFactGroups(facts, n) {
  if (n <= 0 || facts.length === 0) return [];

  const sorted = [...facts].sort(
    (a, b) => (b.jobRelevance ?? 0) - (a.jobRelevance ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0) || (a.factId < b.factId ? -1 : 1)
  );

  const groups = [];
  const usedTopics = new Set();
  const usedFactIds = new Set();

  // Pass 1: strongest fact per distinct topic
  for (const fact of sorted) {
    if (groups.length >= n) break;
    if (usedFactIds.has(fact.factId)) continue;
    if (usedTopics.has(fact.semanticTopic)) continue;
    groups.push([fact]);
    usedTopics.add(fact.semanticTopic);
    usedFactIds.add(fact.factId);
  }

  // Pass 2: fill remaining slots with any unused fact. Topic repetition is
  // acceptable when the underlying facts are distinct; true redundancy is
  // pruned by the final pairwise overlap check (0.55/0.6 thresholds).
  for (const fact of sorted) {
    if (groups.length >= n) break;
    if (usedFactIds.has(fact.factId)) continue;
    groups.push([fact]);
    usedFactIds.add(fact.factId);
  }

  // Pass 3: enrich existing bullets with complementary short facts (max 1 extra)
  const enrichable = sorted.filter((f) => !usedFactIds.has(f.factId) && f.text.length <= 90);
  for (const fact of enrichable) {
    if (groups.length === 0) break;
    const targetGroup = groups.find(
      (g) =>
        g.length === 1 &&
        g[0].semanticTopic !== fact.semanticTopic &&
        calculateFactSemanticOverlap(g[0].text, fact.text) < 0.35
    );
    if (targetGroup) {
      targetGroup.push(fact);
      usedFactIds.add(fact.factId);
    }
  }

  return groups.slice(0, n);
}

/**
 * Composes one professional bullet from a fact group (1–2 facts).
 *
 * @private
 * @param {Array<object>} group Fact group [primary, complementary?]
 * @param {object} project Canonical project record (for technologies)
 * @param {boolean} allowTechClause Whether a technology clause may be appended
 * @param {Set<string>} mentionedTechs Project technologies already rendered (mutated)
 * @returns {string}
 */
function composeBulletFromGroup(group, project, allowTechClause, mentionedTechs) {
  const primary = group[0];
  let text = stripTrailingPeriod(primary.text);

  // Multi-fact composition: merge a complementary fact into a compound bullet
  const complementary = group[1];
  if (complementary) {
    const comp = lowerFirst(stripTrailingPeriod(complementary.text));
    if (comp) {
      text = `${text}; ${comp}`;
    }
  }

  // Technology clause from project-verified technologies (never fabricated),
  // limited to multi-fact composed bullets and to technologies not mentioned
  // yet. A single candidate-authored fact passes through VERBATIM — weaving a
  // clause into authored content would mutate candidate-owned text. Generic
  // rule: a clause is only appended when the composed text does not already
  // name any project technology, otherwise the bullet already carries the
  // stack context and a clause would add redundant wording.
  if (allowTechClause && group.length > 1) {
    const lower = text.toLowerCase();
    const projectTechs = Array.isArray(project.technologies) ? project.technologies : [];
    const alreadyNamesTech = projectTechs.some((t) => t && lower.includes(String(t).toLowerCase()));
    const available = alreadyNamesTech
      ? []
      : projectTechs.filter(
          (t) => t && !lower.includes(String(t).toLowerCase()) && !mentionedTechs.has(String(t).toLowerCase())
        );
    if (available.length > 0) {
      const clause = buildTechClause(text, available);
      for (const t of available) mentionedTechs.add(String(t).toLowerCase());
      text += clause;
    }
  }
  return `${sentenceCase(text)}.`;
}

/**
 * Composes professional accomplishment bullets for a project from its
 * canonical facts.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Canonical scored facts for this project (claim facts)
 * @param {object} params.project Canonical project record (technologies, name)
 * @param {object} [params.jobPosting] Target job (facts must be pre-scored)
 * @param {number|null} [params.explicitBudget] Optimizer bullet override
 * @returns {{ bullets: Array<{ text: string, evidenceRefs: Array, matchedRequirementIds: Array, provenanceStatus: string, composedFromFactIds: Array<string> }>, omittedFacts: Array<{ factId: string, text: string, reason: string }>, capacity: object }}
 */
export function composeProfessionalProjectBullets({ facts, project, jobPosting = null, explicitBudget = null }) {
  const allFacts = Array.isArray(facts) ? facts : [];
  const project_ = project || {};

  // ── 1. Unsupported-claim gate ────────────────────────────────────────────
  const eligible = [];
  const omittedFacts = [];
  for (const fact of allFacts) {
    if (isUnsupportedMetricFact(fact)) {
      omittedFacts.push({ factId: fact.factId, text: fact.text, reason: 'UNSUPPORTED_METRIC' });
      continue;
    }
    if (!isClaimFact(fact)) {
      // Technology facts enrich clauses; they never occupy bullet slots.
      continue;
    }
    eligible.push(fact);
  }

  // ── 2. Capacity from distinct canonical facts ────────────────────────────
  const evidenceCount = Array.isArray(project_?.evidence) ? project_.evidence.length : 0;
  const capacityInfo = determineProjectBulletCapacity({
    claimFacts: eligible,
    evidenceCount,
    explicitBudget,
  });

  if (eligible.length === 0 || capacityInfo.capacity === 0) {
    return { bullets: [], omittedFacts, capacity: capacityInfo };
  }

  // ── 3. Complementary-dimension composition ───────────────────────────────
  const groups = selectComplementaryFactGroups(eligible, capacityInfo.capacity);

  // Technology clauses are distributed per-project, not per-bullet: only the
  // first bullet receives the project's unmentioned technologies, so the same
  // technology is never repeated across consecutive bullets.
  const projectTechsMentioned = new Set();

  const composed = groups.map((g, groupIdx) => {
    const text = composeBulletFromGroup(g, project_, groupIdx === 0, projectTechsMentioned);
    const evidenceRefs = [];
    const seenRefs = new Set();
    for (const f of g) {
      for (const r of f.evidenceRefs || []) {
        const key = r?.evidenceId || JSON.stringify(r);
        if (!seenRefs.has(key)) {
          seenRefs.add(key);
          evidenceRefs.push(r);
        }
      }
    }
    const matchedRequirementIds = [...new Set(g.flatMap((f) => f.matchedRequirementIds || []))];
    const provenanceStatus = g.some((f) => f.provenance === 'VERIFIED')
      ? 'VERIFIED'
      : g[0].provenance || 'USER_PROVIDED';
    return {
      text,
      evidenceRefs,
      matchedRequirementIds,
      provenanceStatus,
      composedFromFactIds: g.map((f) => f.factId),
    };
  });

  // ── 4. Evidence association ─────────────────────────────────────────────
  // Authored facts rarely carry their own evidence refs; the project's
  // evidence graph is authoritative. Associate evidence records with bullets
  // whose text names the evidenced skill (slug/display-name match), mirroring
  // the canonical selection layer's association rule.
  const projectEvidence = Array.isArray(project_?.evidence) ? project_.evidence : [];
  for (const bullet of composed) {
    if (bullet.evidenceRefs.length === 0 && projectEvidence.length > 0) {
      const lower = bullet.text.toLowerCase();
      const associated = [];
      for (const ev of projectEvidence) {
        const slug = String(ev.skillSlug || '').toLowerCase();
        const name = String(ev.skillName || '').toLowerCase();
        const needle = slug && lower.includes(slug.replace(/-/g, ' ')) ? slug.replace(/-/g, ' ') : name;
        if (needle && lower.includes(needle)) associated.push(ev);
        if (associated.length >= 5) break;
      }
      bullet.evidenceRefs = associated
        .map((ev) => toEvidenceReference(ev, 'VERIFIED'))
        .filter(Boolean);
    }
  }

  // ── 5. Semantic redundancy enforcement (final safety net) ───────────────
  const deduped = [];
  const rejectedRedundant = [];
  for (const bullet of composed) {
    const isRedundant = deduped.some(
      (d) =>
        calculateTokenOverlap(d.text, bullet.text) >= REDUNDANCY_OVERLAP_THRESHOLD ||
        calculateFactSemanticOverlap(d.text, bullet.text) >= 0.6
    );
    if (isRedundant) {
      rejectedRedundant.push(bullet);
      for (const fid of bullet.composedFromFactIds) {
        omittedFacts.push({ factId: fid, text: bullet.text, reason: 'SEMANTIC_REDUNDANCY' });
      }
    } else {
      deduped.push(bullet);
    }
  }

  return { bullets: deduped, omittedFacts, capacity: capacityInfo };
}
