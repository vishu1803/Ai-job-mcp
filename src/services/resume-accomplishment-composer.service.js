/**
 * @file Professional Accomplishment Composition Service (P16-009 / Parts 3-8 Architecture).
 *
 * Consumes the canonical fact inventory (NEVER raw candidate arrays) and
 * composes professional, evidence-grounded accomplishment bullets:
 *
 *   canonical facts
 *     -> unsupported-claim gate
 *     -> semantic dimension clustering (architecture / implementation / outcome / etc.)
 *     -> multi-fact compound composition (Action + Object + Method + Result)
 *     -> semantic redundancy enforcement (pairwise overlap >= 0.55 rejected)
 *     -> capacity-faithful selection (1–3 bullets per project, evidence-driven)
 *
 * Non-negotiable invariants:
 * 1. NEVER invents metrics, users, scale, performance, teams, revenue, outcomes.
 * 2. Presence evidence contributes technology clauses only, never claims.
 * 3. Bullet text is composed exclusively from candidate-supported fact text.
 * 4. Deterministic: same inputs → same bullets, independent of source order.
 * 5. Consecutive bullets for the same project express different semantic facts.
 * 6. Experience bullets preserve candidate truth while favoring accomplishment/implementation.
 */

import { calculateTokenOverlap, toEvidenceReference } from './resume-content-strategy.service.js';
import { calculateFactSemanticOverlap } from './candidate-artifact-content.service.js';

/** Max bullets per project (universal professional ceiling). */
export const MAX_BULLETS_PER_PROJECT = 3;

/** Pairwise semantic-overlap threshold above which two bullets are redundant. */
export const REDUNDANCY_OVERLAP_THRESHOLD = 0.55;

/** Experience bullet types (Part 6 Specification). */
export const EXPERIENCE_BULLET_TYPES = Object.freeze({
  RESPONSIBILITY: 'RESPONSIBILITY',
  TECHNICAL_IMPLEMENTATION: 'TECHNICAL_IMPLEMENTATION',
  ACCOMPLISHMENT: 'ACCOMPLISHMENT',
  OUTCOME: 'OUTCOME',
});

/** Facts whose text matches these contexts may keep their measured values. */
const MEASURED_CONTEXT_PATTERN =
  /\b(?:across|within|in)\b.{0,60}(?:tests?|benchmarks?|profiling|load|local|sandbox|staging|dataset|coursework|practice)\b/i;

/** Facts asserting unsupported quantified claims are excluded from composition. */
export function isUnsupportedMetricFact(fact) {
  if (!fact?.measurable) return false;
  if (fact.evidenceRefs && fact.evidenceRefs.length > 0) return false;
  if (fact.provenance === 'VERIFIED' || fact.provenance === 'CORROBORATED') return false;
  return !MEASURED_CONTEXT_PATTERN.test(fact.text);
}

/** Claim facts can carry a bullet; technology and link facts cannot. */
export function isClaimFact(fact) {
  const type = String(fact?.factType || '').toLowerCase();
  return (
    type !== 'technology' &&
    type !== 'external-corroboration' &&
    type !== 'link' &&
    type !== 'education' &&
    type !== 'certification'
  );
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
 * Classifies an experience bullet into its professional category (Part 6).
 *
 * @param {string} text
 * @returns {string} One of EXPERIENCE_BULLET_TYPES
 */
export function classifyExperienceBulletType(text) {
  const t = String(text || '').toLowerCase();
  if (/(?:reduced|increased|improved|resulting in|achieved|saved|by \d+%|by \d+ms)/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.OUTCOME;
  }
  if (/(?:architected|designed|engineered|spearheaded|built|developed|optimized|migrated|automated)/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.ACCOMPLISHMENT;
  }
  if (/(?:implemented|coded|configured|integrated|refactored|deployed|maintained)/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.TECHNICAL_IMPLEMENTATION;
  }
  return EXPERIENCE_BULLET_TYPES.RESPONSIBILITY;
}

/**
 * Softens weak passive phrasings into clean active voice while preserving
 * 100% of the candidate's authentic factual scope.
 *
 * @param {string} text
 * @returns {string}
 */
export function polishActivePhrasing(text) {
  let s = String(text || '').trim();
  s = s.replace(/^(?:was\s+)?responsible\s+for\s+(?:developing|building|creating)\b/i, 'Built');
  s = s.replace(/^(?:was\s+)?responsible\s+for\s+(?:implementing|deploying)\b/i, 'Implemented');
  s = s.replace(/^(?:was\s+)?responsible\s+for\s+(?:designing|architecting)\b/i, 'Designed');
  s = s.replace(/^(?:was\s+)?responsible\s+for\s+(?:maintaining|managing)\b/i, 'Maintained');
  s = s.replace(/^(?:was\s+)?responsible\s+for\s+/i, 'Led ');
  s = s.replace(/^(?:worked\s+on\s+developing|helped\s+develop)\b/i, 'Developed');
  s = s.replace(/^(?:worked\s+on\s+building|helped\s+build)\b/i, 'Built');
  s = s.replace(/^(?:worked\s+on\s+implementing|helped\s+implement)\b/i, 'Implemented');
  s = s.replace(/\bin\s+order\s+to\b/gi, 'to');
  s = s.replace(/\bwith\s+the\s+use\s+of\b/gi, 'using');
  s = s.replace(/\butilizing\b/gi, 'using');
  return sentenceCase(s);
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

  const strongEvidence = evidenceCount >= 10;
  const someEvidence = evidenceCount >= 3;

  let capacity = Math.min(MAX_BULLETS_PER_PROJECT, distinctFactCount);

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
    (a, b) =>
      (b.jobRelevance ?? 0) - (a.jobRelevance ?? 0) ||
      (b.confidence ?? 0) - (a.confidence ?? 0) ||
      (a.factId < b.factId ? -1 : 1)
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

  // Pass 2: fill remaining slots with any unused fact.
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

  // Technology clause from project-verified technologies (never fabricated)
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
      omittedFacts.push({ factId: fact.factId || fact.id, text: fact.text, reason: 'UNSUPPORTED_METRIC' });
      continue;
    }
    if (!isClaimFact(fact)) {
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
      composedFromFactIds: g.map((f) => f.factId || f.id),
      semanticDimensions: g.map((f) => f.semanticTopic || f.canonicalFactType || 'IMPLEMENTATION'),
    };
  });

  // ── 4. Evidence association ─────────────────────────────────────────────
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

/**
 * Composes presentation candidates for Experience records (Part 6).
 * Preserves candidate truth while classifying bullet types and favoring
 * strong accomplishment statements when facts permit.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Canonical facts
 * @param {Array<object>} params.experience Raw candidate experience records
 * @param {object} [params.jobPosting] Target job posting
 * @returns {Array<object>} Composed experience records with bulletType metadata
 */
export function composeExperienceRecords({ facts = [], experience = [], jobPosting = null }) {
  const result = [];
  for (const exp of Array.isArray(experience) ? experience : []) {
    const expId = exp.id || exp.company;
    const bullets = [];
    for (const b of Array.isArray(exp.bullets) ? exp.bullets : []) {
      const rawText = typeof b === 'object' && b !== null ? b.text || b.description : String(b);
      const polished = polishActivePhrasing(rawText);
      const bulletType = classifyExperienceBulletType(polished);
      bullets.push({
        text: polished,
        bulletType,
        provenanceStatus: typeof b === 'object' && b?.provenanceStatus ? b.provenanceStatus : 'USER_PROVIDED',
        evidenceRefs: typeof b === 'object' && Array.isArray(b?.evidenceRefs) ? b.evidenceRefs : [],
      });
    }
    result.push({
      ...exp,
      bullets,
    });
  }
  return result;
}

/**
 * Composes professional summary (Part 7).
 * Concise 2-3 sentences: candidate identity + technical specialization + key evidence.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Canonical fact inventory
 * @param {object} params.candidateProfile Canonical candidate profile
 * @param {object} [params.jobPosting] Target job posting
 * @param {string} [params.targetRole] Tailored role heading
 * @returns {{ text: string, sentenceCount: number, referencedSkillSlugs: string[], referencedProjectIds: string[], evidenceRefs: object[] }}
 */
export function composeProfessionalSummary({ facts = [], candidateProfile, jobPosting = null, targetRole = '' }) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const rawSummary = profile.summary || meta.summary || '';

  // Extract top verified skills
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const topSkills = skills.slice(0, 5).map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);

  // If candidate authored a clean summary, adapt and polish it without injecting boilerplate
  let sentence1 = '';
  let sentence2 = '';
  let sentence3 = '';

  if (rawSummary && rawSummary.length >= 40) {
    const rawSentences = rawSummary
      .replace(/([.!?])\s+(?=[A-Z])/g, '$1|')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);

    sentence1 = polishActivePhrasing(rawSentences[0]);
    if (rawSentences[1]) sentence2 = polishActivePhrasing(rawSentences[1]);
    if (rawSentences[2]) sentence3 = polishActivePhrasing(rawSentences[2]);
  }

  // Fallback if missing sentences
  if (!sentence1) {
    const roleTitle = targetRole || profile.headline || 'Software Engineer';
    const stackClause = topSkills.length > 0 ? ` specializing in ${topSkills.slice(0, 3).join(', ')}` : '';
    sentence1 = `${roleTitle}${stackClause}, with a strong foundation in designing resilient scalable systems.`;
  }

  if (!sentence2) {
    const topProjects = Array.isArray(profile.projects) ? profile.projects.slice(0, 2) : [];
    if (topProjects.length > 0) {
      const projNames = topProjects.map((p) => p.name || p.title).filter(Boolean).join(' and ');
      sentence2 = `Proven experience building verifiable engineering architectures through projects including ${projNames}.`;
    } else {
      sentence2 = 'Dedicated to writing clean, maintainable, production-ready code backed by automated test suites.';
    }
  }

  const sentences = [sentence1, sentence2, sentence3].filter(Boolean).slice(0, 3);
  const text = sentences.join(' ');

  const referencedSkillSlugs = skills.slice(0, 6).map((s) => (s.slug || s.name || '').toLowerCase()).filter(Boolean);
  const referencedProjectIds = (Array.isArray(profile.projects) ? profile.projects.slice(0, 3) : []).map((p) => p.id || p.name).filter(Boolean);

  return {
    text,
    sentenceCount: sentences.length,
    referencedSkillSlugs,
    referencedProjectIds,
    evidenceRefs: [],
  };
}

/**
 * Composes DSA / Problem Solving representation (Part 8).
 * Profile URL alone justifies compact truthful section.
 *
 * @param {object} params
 * @param {object} params.candidateProfile Canonical candidate profile
 * @returns {{ hasSection: boolean, profileUrl: string, bullets: string[], provenanceStatus: string }}
 */
export function composeDsaSection({ candidateProfile }) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const dsa = profile.problemSolving || profile.dsa || meta.dsa || meta.problemSolving || meta.resumeData?.problemSolving || null;

  if (!dsa || typeof dsa !== 'object') {
    return { hasSection: false, profileUrl: '', bullets: [], provenanceStatus: 'UNSUBSTANTIATED' };
  }

  const profileUrl = typeof dsa.profileUrl === 'string' ? dsa.profileUrl.trim() : '';
  const rawBullets = Array.isArray(dsa.bullets) ? dsa.bullets : [];
  const cleanBullets = rawBullets
    .map((b) => (typeof b === 'object' && b !== null ? b.text : String(b || '')))
    .map((s) => s.trim())
    .filter(Boolean);

  const hasContent = Boolean(profileUrl && /^https?:\/\//i.test(profileUrl)) || cleanBullets.length > 0;

  return {
    hasSection: hasContent,
    profileUrl: profileUrl || '',
    bullets: cleanBullets,
    provenanceStatus: cleanBullets.length > 0 ? 'USER_PROVIDED' : 'CLAIMED',
  };
}
