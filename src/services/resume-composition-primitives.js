/**
 * @file Reusable, Dependency-Neutral Resume Composition Primitives
 *
 * Provides pure, leaf-level composition utilities without upstream dependencies
 * on the accomplishment composer orchestrator or legacy strategy services.
 *
 * Invariant: This module must have ZERO circular dependencies.
 */

import { ValidationError } from '../errors/index.js';

export const FACT_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'using',
  'used',
  'built',
  'created',
  'developed',
  'implemented',
  'designed',
  'worked',
]);

/**
 * Extracts substantive lowercase token set from candidate factual text for deduplication.
 *
 * @param {string} text Text to tokenize
 * @returns {Set<string>} Substantive tokens
 */
export function extractSubstantiveFactTokens(text) {
  if (!text || typeof text !== 'string') return new Set();
  const tokens = new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/);
  for (const w of words) {
    const clean = w.replace(/^[.#+]+|[.#+]+$/g, '');
    if (clean.length >= 2 && !FACT_STOP_WORDS.has(clean) && !/^\d+$/.test(clean)) {
      tokens.add(clean);
    }
  }
  return tokens;
}

/**
 * Computes semantic token overlap (Jaccard similarity) between two candidate factual descriptions.
 *
 * @param {string} textA Description A
 * @param {string} textB Description B
 * @returns {number} Jaccard similarity in [0, 1]
 */
export function calculateFactSemanticOverlap(textA, textB) {
  const tokensA = extractSubstantiveFactTokens(textA);
  const tokensB = extractSubstantiveFactTokens(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Counts distinct canonical facts across candidate text items (bullets, highlights,
 * features, descriptions). Semantically duplicate descriptions (token overlap >= 0.60)
 * count as 1 distinct fact.
 *
 * @param {Array<string|object>} items Candidate text items
 * @param {number} [overlapThreshold=0.60] Jaccard threshold for duplicate clustering
 * @returns {number} Number of distinct canonical facts
 */
export function countDistinctCanonicalFacts(items = [], overlapThreshold = 0.6) {
  const flatStrings = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const text =
      typeof item === 'object' && item !== null
        ? item.text || item.description || ''
        : String(item);
    const trimmed = String(text || '').trim();
    if (trimmed.length > 0) {
      flatStrings.push(trimmed);
    }
  }

  if (flatStrings.length === 0) return 0;

  const clusters = [];
  for (const text of flatStrings) {
    let matched = false;
    for (const cluster of clusters) {
      const overlap = calculateFactSemanticOverlap(text, cluster.representative);
      if (overlap >= overlapThreshold) {
        cluster.items.push(text);
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ representative: text, items: [text] });
    }
  }

  return clusters.length;
}

/** Max bullets per project (universal professional ceiling). */
export const MAX_BULLETS_PER_PROJECT = 3;

/** Pairwise semantic-overlap threshold above which two bullets are redundant. */
export const REDUNDANCY_OVERLAP_THRESHOLD = 0.5;

/** Experience bullet presentation types. */
export const EXPERIENCE_BULLET_TYPES = Object.freeze({
  RESPONSIBILITY: 'RESPONSIBILITY',
  TECHNICAL_IMPLEMENTATION: 'TECHNICAL_IMPLEMENTATION',
  ACCOMPLISHMENT: 'ACCOMPLISHMENT',
  OUTCOME: 'OUTCOME',
});

/**
 * Explicit semantic classification for evidence records.
 * Distinguishes presence evidence from authentic candidate claims.
 */
export const EVIDENCE_SEMANTIC_CLASS = Object.freeze({
  PRESENCE_EVIDENCE: 'PRESENCE_EVIDENCE',
  IMPLEMENTATION_EVIDENCE: 'IMPLEMENTATION_EVIDENCE',
  FEATURE_EVIDENCE: 'FEATURE_EVIDENCE',
  OUTCOME_EVIDENCE: 'OUTCOME_EVIDENCE',
  CANDIDATE_AUTHORED_CLAIM: 'CANDIDATE_AUTHORED_CLAIM',
});

/**
 * Classifies an evidence record into its semantic category.
 *
 * Hard Rule: PRESENCE_EVIDENCE alone can NEVER generate accomplishment prose.
 *
 * @param {object} ev Evidence record
 * @returns {string} One of EVIDENCE_SEMANTIC_CLASS values
 */
export function classifyEvidenceSemanticType(ev) {
  if (!ev || typeof ev !== 'object') return EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE;

  const type = String(ev.evidenceType || ev.type || '').toUpperCase();
  const hasAuthoredText = Boolean(
    ev.candidateAuthored || ev.claimText || ev.sourceType === 'CANDIDATE_PROFILE'
  );

  if (hasAuthoredText) {
    return EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM;
  }

  if (['OUTCOME', 'BENCHMARK', 'METRIC'].includes(type)) {
    return EVIDENCE_SEMANTIC_CLASS.OUTCOME_EVIDENCE;
  }

  if (
    ['FEATURE_SPEC', 'FEATURE_IMPLEMENTATION', 'FEATURE'].includes(type) &&
    (ev.description || ev.featureSummary)
  ) {
    return EVIDENCE_SEMANTIC_CLASS.FEATURE_EVIDENCE;
  }

  if (['COMMIT_MESSAGE', 'PULL_REQUEST_BODY'].includes(type) && (ev.message || ev.body)) {
    return EVIDENCE_SEMANTIC_CLASS.IMPLEMENTATION_EVIDENCE;
  }

  // All dependencies, packages, imports, file paths, and syntax usages are PRESENCE_EVIDENCE
  return EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE;
}

/**
 * Reusable helper determining whether a claim is safe to render as resume prose.
 *
 * @param {string} claimText
 * @param {string} [semanticClass=EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM]
 * @returns {boolean}
 */
export function isClaimSafeToRender(
  claimText,
  semanticClass = EVIDENCE_SEMANTIC_CLASS.CANDIDATE_AUTHORED_CLAIM
) {
  if (!claimText || typeof claimText !== 'string') return false;
  const trimmed = claimText.trim();
  if (trimmed.length < 15) return false;

  // PRESENCE_EVIDENCE alone can NEVER generate accomplishment prose
  if (semanticClass === EVIDENCE_SEMANTIC_CLASS.PRESENCE_EVIDENCE) return false;

  // File path leakage detection:
  if (
    /(?:^|\s)(?:src\/|lib\/|app\/|components\/|controllers\/|routes\/|services\/|utils\/|models\/|dockerfile|\S+\.(?:js|ts|jsx|tsx|py|go|rs|json|yaml|yml|sql|html|css|dockerfile))\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  // Generic template prose & synthetic leakage detection:
  if (
    /\b(?:verified by repository evidence|applied .* in verified project implementation|developed .* functionality|implemented feature across|defined in repository|engineered .* system with tested reliability and maintainable code)\b/i.test(
      trimmed
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Canonical helper for determining whether DSA content is meaningful and authentic.
 *
 * @param {object} dsa
 * @returns {boolean}
 */
export function isMeaningfulDsa(dsa) {
  if (!dsa || typeof dsa !== 'object') return false;
  if (dsa.hasSection === false) return false;

  const validUrl =
    typeof dsa.profileUrl === 'string' && /^https?:\/\//i.test(dsa.profileUrl.trim());
  const rawBullets = Array.isArray(dsa.bullets) ? dsa.bullets : [];
  const cleanBullets = rawBullets
    .map((b) => (typeof b === 'string' ? b.trim() : String(b?.text || '').trim()))
    .filter(Boolean);

  const nonFillerBullets = cleanBullets.filter((b) => {
    if (b.length < 25) return false;
    if (
      /^(?:engaged in problem solving|built foundational analytical complexity|practiced coding problems|solved questions online|daily problem solving practice|problem solving enthusiast|built analytical foundation)\b/i.test(
        b
      )
    ) {
      return false;
    }
    return true;
  });

  const hasStats = Boolean(
    (typeof dsa.problemsSolved === 'number' && dsa.problemsSolved > 0) ||
    (typeof dsa.rating === 'number' && dsa.rating > 0) ||
    (typeof dsa.contests === 'number' && dsa.contests > 0) ||
    (Array.isArray(dsa.topics) && dsa.topics.length > 0) ||
    (Array.isArray(dsa.topicCoverage) && dsa.topicCoverage.length > 0) ||
    (typeof dsa.score === 'number' && dsa.score > 0)
  );

  return validUrl || nonFillerBullets.length > 0 || hasStats;
}

/** Facts whose text matches these contexts may keep their measured values. */
export const MEASURED_CONTEXT_PATTERN =
  /\b(?:across|within|in)\b.{0,60}(?:tests?|benchmarks?|profiling|load|local|sandbox|staging|dataset|coursework|practice)\b/i;

/**
 * Normalizes whitespace and unicode punctuation without altering semantic content.
 */
export function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sentenceCase(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function lowerFirst(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.charAt(0).toLowerCase() + t.slice(1);
}

export function stripTrailingPeriod(text) {
  return String(text || '')
    .trim()
    .replace(/[.!?]+$/, '');
}

/**
 * Safe, meaning-preserving phrase replacements for generated/project bullets.
 */
export const SAFE_PHRASE_REPLACEMENTS = Object.freeze([
  [/\bin order to\b/gi, 'to'],
  [/\bwith the use of\b/gi, 'using'],
  [/\butilizing\b/gi, 'using'],
  [/\bmade use of\b/gi, 'used'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\ba total of\b/gi, ''],
]);

/**
 * Generated-summary boilerplate mappings for professional summary polishing.
 */
export const GENERATED_SUMMARY_PATTERNS = Object.freeze([
  [
    /Demonstrated practical execution in ([^,.]+?) alongside evidence-backed database and modular service implementation/gi,
    'Built $1, including database and modular service implementation',
  ],
  [
    /Proven track record of architecting reliable, test-backed software services aligned with technical requirements/gi,
    'Experienced in architecting reliable, test-backed software services',
  ],
  [
    /Demonstrated practical delivery in ([^,.]+?) with a commitment to clean code and robust user experiences/gi,
    'Delivered $1, emphasizing clean code and robust user experiences',
  ],
  [
    /Committed to architecting accessible, performant user interfaces with verified component architecture/gi,
    'Focused on accessible, performant user interfaces built with a component-based architecture',
  ],
  [
    /Focused on delivering reliable, maintainable code aligned with modern engineering standards/gi,
    'Focused on reliable, maintainable software delivery',
  ],
  [/with hands-on technical execution in ([^,.]+?)(?=[,.]|$)/gi, 'with hands-on work in $1'],
  [
    /Software professional offering technical capabilities aligned with ([^,.]+?)(?=[,.]|$)/gi,
    'Software professional with technical capabilities suited to $1',
  ],
]);

/**
 * Applies deterministic, meaning-preserving wording compression to a bullet.
 *
 * @param {string} text Original bullet text
 * @returns {string} Compressed bullet text
 */
export function compressProfessionalBullet(text) {
  if (!text || typeof text !== 'string') return text;
  let result = normalizeWhitespace(text);
  for (const [pattern, replacement] of SAFE_PHRASE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/^(to|using|used)\b/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  return normalizeWhitespace(result);
}

/**
 * Polishes a generated professional summary while keeping every factual claim intact.
 *
 * @param {string} text Raw summary text
 * @returns {string} Polished summary text
 */
export function polishProfessionalSummary(text) {
  if (!text || typeof text !== 'string') return text;
  let result = normalizeWhitespace(text);
  for (const [pattern, replacement] of GENERATED_SUMMARY_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return normalizeWhitespace(result);
}

/** Facts asserting unsupported quantified claims are excluded from composition. */
export function isUnsupportedMetricFact(fact) {
  if (!fact?.measurable) return false;
  if (fact.evidenceRefs && fact.evidenceRefs.length > 0) return false;
  if (fact.provenance === 'VERIFIED' || fact.provenance === 'CORROBORATED') return false;
  return !MEASURED_CONTEXT_PATTERN.test(fact.text);
}

/** Claim facts can carry a bullet; technology, link, and meta facts cannot. */
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
 * Determines the maximum defensible bullet capacity for a project from its canonical facts.
 *
 * @param {object} params
 * @param {Array<object>} params.claimFacts Canonical claim facts for the project
 * @param {number} [params.evidenceCount] Total evidence records backing the project
 * @param {number} [params.explicitBudget] Optimizer override (hard ceiling of 3)
 * @returns {{ capacity: number, distinctFactCount: number, rationale: string }}
 */
export function determineProjectBulletCapacity({
  claimFacts,
  evidenceCount = 0,
  explicitBudget = null,
}) {
  const facts = Array.isArray(claimFacts) ? claimFacts : [];
  const distinctFactCount = facts.length;

  if (distinctFactCount === 0) {
    return { capacity: 0, distinctFactCount: 0, rationale: 'NO_CLAIM_FACTS' };
  }

  const strongEvidence = evidenceCount >= 10;
  const someEvidence = evidenceCount >= 3;

  let capacity = Math.min(MAX_BULLETS_PER_PROJECT, distinctFactCount);

  const allLowTrust = facts.every(
    (f) => f.provenance === 'CLAIMED' || f.provenance === 'SELF_DECLARED'
  );
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
 * Classifies an experience bullet into one of the 4 standard types.
 */
export function classifyExperienceBulletType(text) {
  const t = String(text || '').toLowerCase();
  if (
    /\b(reduced|increased|improved|decreased|accelerated|saved|scaled|achieved|yielding|resulting in)\b/i.test(
      t
    )
  ) {
    return EXPERIENCE_BULLET_TYPES.OUTCOME;
  }
  if (/\b(architected|designed|spearheaded|engineered|built|refactored|pioneered)\b/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.ACCOMPLISHMENT;
  }
  if (
    /\b(implemented|configured|automated|containerized|deployed|migrated|integrated|tested|debugged)\b/i.test(
      t
    )
  ) {
    return EXPERIENCE_BULLET_TYPES.TECHNICAL_IMPLEMENTATION;
  }
  return EXPERIENCE_BULLET_TYPES.RESPONSIBILITY;
}

/**
 * Canonical preference order used when a populated protected section is missing from sectionOrder.
 */
export const PROTECTED_SECTION_ANCHOR_ORDER = Object.freeze([
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'DSA',
  'EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
]);

export function hasRenderableSection(sectionKey, doc) {
  switch (sectionKey) {
    case 'SUMMARY':
      return Boolean(doc.summary?.text);
    case 'SKILLS':
      return Boolean(doc.skills?.categories?.some((c) => c?.skills?.length));
    case 'PROJECTS':
      return Array.isArray(doc.projects) && doc.projects.length > 0;
    case 'DSA':
      return Boolean(doc.dsa?.hasSection || doc.dsa?.bullets?.length || doc.dsa?.profileUrl);
    case 'EXPERIENCE':
      return Array.isArray(doc.experience) && doc.experience.length > 0;
    case 'EDUCATION':
      return Array.isArray(doc.education) && doc.education.length > 0;
    case 'CERTIFICATIONS':
      return Array.isArray(doc.certifications) && doc.certifications.length > 0;
    default:
      return false;
  }
}

/**
 * Ensures populated candidate-owned sections cannot disappear from a structured resume.
 */
export function ensureCandidateSectionIntegrity(doc) {
  const order = Array.isArray(doc.sectionOrder) ? [...doc.sectionOrder] : [];
  const canonical = order.map((s) => String(s).toUpperCase());

  for (const section of PROTECTED_SECTION_ANCHOR_ORDER) {
    if (!hasRenderableSection(section, doc) || canonical.includes(section)) continue;

    let insertAt = canonical.length;
    for (let i = PROTECTED_SECTION_ANCHOR_ORDER.indexOf(section) - 1; i >= 0; i--) {
      const anchorIdx = canonical.indexOf(PROTECTED_SECTION_ANCHOR_ORDER[i]);
      if (anchorIdx !== -1) {
        insertAt = anchorIdx + 1;
        break;
      }
    }
    canonical.splice(insertAt, 0, section);
  }

  const result = { ...doc, sectionOrder: canonical };
  if (result.tailoringPlan && typeof result.tailoringPlan === 'object') {
    result.tailoringPlan = {
      ...result.tailoringPlan,
      sectionOrder: [...canonical],
    };
  }
  return result;
}

export function dedupeSkillsPresentation(doc) {
  if (!Array.isArray(doc.skills?.categories)) return;
  const provenanceRank = { VERIFIED: 3, CORROBORATED: 2, USER_PROVIDED: 1, CLAIMED: 0 };

  for (const category of doc.skills.categories) {
    if (!Array.isArray(category.skills)) continue;

    const bySlug = new Map();
    for (const skill of category.skills) {
      if (!skill || typeof skill !== 'object') continue;
      const key = String(skill.slug || skill.name || '').toLowerCase();
      if (!key) continue;
      const existing = bySlug.get(key);
      if (!existing) {
        bySlug.set(key, skill);
        continue;
      }
      const existingRank = provenanceRank[existing.provenanceStatus] ?? 0;
      const nextRank = provenanceRank[skill.provenanceStatus] ?? 0;
      if (nextRank > existingRank) {
        bySlug.set(key, skill);
      }
    }

    if (bySlug.size > 0) {
      const kept = new Set(
        [...bySlug.values()].map((s) => String(s.slug || s.name || '').toLowerCase())
      );
      category.skills = category.skills.filter(
        (s) => !s || typeof s !== 'object' || kept.has(String(s.slug || s.name || '').toLowerCase())
      );
    }
  }

  doc.skills.categories = doc.skills.categories.filter(
    (c) => Array.isArray(c.skills) && c.skills.length > 0
  );
}

export function verifyProtectedSectionsUnchanged(original, composed) {
  const protectedPairs = [
    ['experience', 'Experience'],
    ['education', 'Education'],
    ['certifications', 'Certifications'],
    ['dsa', 'DSA'],
  ];

  for (const [key, label] of protectedPairs) {
    const originalJson = JSON.stringify(original[key] ?? null);
    const composedJson = JSON.stringify(composed[key] ?? null);
    if (originalJson !== composedJson) {
      throw new ValidationError(
        `Composition violated protected-content invariant: ${label} data was modified`
      );
    }
  }
}

/**
 * Synthesizes a cohesive professional engineering accomplishment from complementary canonical facts.
 * Adheres strictly to the PAR standard:
 *   ACTION + WHAT WAS ENGINEERED + HOW IT WAS DONE + WHY / PURPOSE / RESULT
 *
 * Completely eliminates:
 * - Crude semicolon concatenations ("fact A; fact B")
 * - Formulaic ", using X" appending
 * - Repetitive product descriptions
 *
 * @param {string|object} primaryArg Primary fact text or fact object
 * @param {string|object|null} [complementaryArg=null] Secondary fact text or fact object
 * @param {Array<string>} [projectTechnologies=[]] Available technologies for natural integration
 * @returns {string|object} Cohesive professional narrative (or narrative object with provenance)
 */
export function synthesizeAccomplishmentNarrative(
  primaryArg,
  complementaryArg = null,
  _projectTechnologies = []
) {
  const isObjectCall = typeof primaryArg === 'object' && primaryArg !== null;
  const primaryText = isObjectCall ? primaryArg.text || '' : String(primaryArg || '');
  const complementaryText =
    typeof complementaryArg === 'object' && complementaryArg !== null
      ? complementaryArg.text || ''
      : complementaryArg
        ? String(complementaryArg)
        : null;

  let primary = normalizeWhitespace(stripTrailingPeriod(primaryText));
  primary = compressProfessionalBullet(primary);

  let synthesized = '';
  if (!complementaryText) {
    synthesized = `${sentenceCase(primary)}.`;
  } else {
    let comp = normalizeWhitespace(stripTrailingPeriod(complementaryText));
    comp = compressProfessionalBullet(comp);

    // If complementary fact is already mostly covered in primary, avoid stutter
    if (calculateFactSemanticOverlap(primary, comp) >= 0.5) {
      synthesized = `${sentenceCase(primary)}.`;
    } else {
      // Active verb to present participle mapping for fluid grammatical linkage
      const verbToParticiple = [
        [/^Implemented\b/i, 'implementing'],
        [/^Engineered\b/i, 'engineering'],
        [/^Architected\b/i, 'architecting'],
        [/^Designed\b/i, 'designing'],
        [/^Built\b/i, 'building'],
        [/^Developed\b/i, 'developing'],
        [/^Integrated\b/i, 'integrating'],
        [/^Automated\b/i, 'automating'],
        [/^Refactored\b/i, 'refactoring'],
        [/^Deployed\b/i, 'deploying'],
        [/^Configured\b/i, 'configuring'],
        [/^Secured\b/i, 'securing'],
        [/^Optimized\b/i, 'optimizing'],
        [/^Scaled\b/i, 'scaling'],
        [/^Standardized\b/i, 'standardizing'],
        [/^Established\b/i, 'establishing'],
      ];

      let matched = false;
      for (const [vPat, participle] of verbToParticiple) {
        if (vPat.test(comp)) {
          const rest = comp.replace(vPat, '').trim();
          synthesized = `${primary}, ${participle} ${rest}`;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Starts with preposition or purpose marker
        if (/^(?:to|for|by|with|using|via|leveraging|incorporating)\b/i.test(comp)) {
          synthesized = `${primary}, ${lowerFirst(comp)}`;
        }
        // Starts with technical mechanism/component
        else if (
          /^(?:raft|kafka|grpc|redis|postgresql|docker|kubernetes|jwt|oauth|real-time|zero-downtime|distributed|high-throughput)\b/i.test(
            comp
          )
        ) {
          synthesized = `${primary} utilizing ${comp}`;
        }
        // Natural coordinating conjunction
        else {
          synthesized = `${primary}, and ${lowerFirst(comp)}`;
        }
      }

      // Clean up punctuation artifacts
      synthesized = synthesized
        .replace(/,\s*,+/g, ',')
        .replace(/;\s*,+/g, ';')
        .replace(/\s+/g, ' ')
        .trim();

      synthesized = `${sentenceCase(synthesized)}.`;
    }
  }

  if (isObjectCall) {
    const composedFromFactIds = [
      primaryArg.id || primaryArg.factId,
      complementaryArg?.id || complementaryArg?.factId,
    ].filter(Boolean);

    const evidenceRefs = [];
    const addRefs = (f) => {
      if (!f) return;
      if (Array.isArray(f.evidenceRefs) && f.evidenceRefs.length > 0) {
        for (const ref of f.evidenceRefs) evidenceRefs.push(ref);
      } else if (f.id || f.factId) {
        evidenceRefs.push({
          factId: f.id || f.factId,
          sourceRef: f.id || f.factId,
          sourceType: 'USER_PROVIDED',
        });
      }
    };
    addRefs(primaryArg);
    if (typeof complementaryArg === 'object' && complementaryArg !== null) {
      addRefs(complementaryArg);
    }

    return {
      text: synthesized,
      composedFromFactIds,
      evidenceRefs,
      toString() {
        return this.text;
      },
    };
  }

  return synthesized;
}

export function slugifyTerm(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

export const QUANTITATIVE_METRIC_REGEX =
  /(?:\b\d+(?:\.\d+)?%\s*(?:reduction|increase|improvement|availability|uptime|latency|cost|performance|throughput|load|memory|time)?|\b\d+\s*(?:million|m|k|billion)\s+(?:users|requests|events|queries|rps|calls)|\b\d+\+?\s*(?:users|requests|events|queries|clients|customers)|\b\d+-person\s+team|\bteam\s+of\s+\d+|\$\d+[\d,.]*(?:k|m|b|kilo|million)?)/i;

export const TENURE_CLAIM_PATTERN =
  /\b(\d+|\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\b)\+?\s*years?\s+(?:of\s+)?(?:experience|working|tenure|employment|professional|industry)\b/i;

export function toEvidenceReference(rawRef, defaultSourceType = 'VERIFIED') {
  if (!rawRef || typeof rawRef !== 'object') return null;
  const isUuid = (str) =>
    typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const evidenceId = isUuid(rawRef.evidenceId)
    ? rawRef.evidenceId
    : isUuid(rawRef.id)
      ? rawRef.id
      : null;

  const filePath = rawRef.filePath || rawRef.sourceLocation?.filePath || null;

  return {
    sourceType: rawRef.sourceType || defaultSourceType,
    evidenceId,
    resourceId: rawRef.resourceId || null,
    resourceName: rawRef.resourceName || null,
    filePath,
    commitSha: rawRef.commitSha || null,
    evidenceType: rawRef.evidenceType || null,
    matchedRequirementId: rawRef.matchedRequirementId || null,
    confidenceScore: typeof rawRef.confidenceScore === 'number' ? rawRef.confidenceScore : 1.0,
    provenanceTrustClass: rawRef.provenanceTrustClass || null,
    notes: rawRef.notes || null,
  };
}

export function assertMetricSafety(text, evidenceRefs = [], options = {}) {
  if (!text || typeof text !== 'string') return;

  if (QUANTITATIVE_METRIC_REGEX.test(text)) {
    const sourceHasMetric =
      options.sourceText && QUANTITATIVE_METRIC_REGEX.test(options.sourceText);
    const evidenceHasMetric =
      Array.isArray(evidenceRefs) &&
      evidenceRefs.some((ref) => {
        const snippet = ref.contextSnippet || ref.snippet || ref.sourceLocation?.snippet || '';
        return QUANTITATIVE_METRIC_REGEX.test(snippet);
      });

    if (
      !sourceHasMetric &&
      !evidenceHasMetric &&
      (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0)
    ) {
      throw new ValidationError(
        `Ungrounded quantitative claim detected in tailored resume text without corroborating evidence: "${text}". Claims containing metrics, performance gains, team sizes, or scale require explicit source evidence.`
      );
    }
  }

  if (TENURE_CLAIM_PATTERN.test(text)) {
    const sourceHasTenure = options.sourceText && TENURE_CLAIM_PATTERN.test(options.sourceText);
    const hasWorkHistoryTenure = Boolean(options.hasWorkHistoryTenure);
    if (!sourceHasTenure && !hasWorkHistoryTenure) {
      throw new ValidationError(
        `Unsupported employment tenure claim detected in tailored resume text: "${text}". Tenure claims must be derived strictly from verified work history.`
      );
    }
  }
}

export function validateRephrasingSafety(sourceText, rephrasedText, candidateContext = {}) {
  if (!sourceText || !rephrasedText) return;

  if (
    QUANTITATIVE_METRIC_REGEX.test(rephrasedText) &&
    !QUANTITATIVE_METRIC_REGEX.test(sourceText)
  ) {
    throw new ValidationError(
      `Rephrased bullet injected ungrounded quantitative metric not present in source bullet: "${rephrasedText}". Source: "${sourceText}".`
    );
  }

  if (TENURE_CLAIM_PATTERN.test(rephrasedText) && !TENURE_CLAIM_PATTERN.test(sourceText)) {
    throw new ValidationError(
      `Rephrased bullet injected unbacked employment tenure claim: "${rephrasedText}".`
    );
  }

  const scalePatterns = [
    /\bmillions of users\b/i,
    /\bscale to millions\b/i,
    /\bhigh-scale production cluster\b/i,
    /\benterprise-wide governance\b/i,
  ];
  for (const pattern of scalePatterns) {
    if (pattern.test(rephrasedText) && !pattern.test(sourceText)) {
      throw new ValidationError(
        `Rephrased bullet injected unbacked production scale claim: "${rephrasedText}".`
      );
    }
  }

  const knownTechSlugs = new Set();
  const rawCandidateSkills = candidateContext.skills || candidateContext.technologies || [];
  for (const s of rawCandidateSkills) {
    const slug =
      typeof s === 'string' ? slugifyTerm(s) : s.slug || slugifyTerm(s.name || s.skillName);
    if (slug) knownTechSlugs.add(slug);
  }
  if (Array.isArray(candidateContext.projects)) {
    for (const p of candidateContext.projects) {
      for (const t of p.technologies || []) {
        knownTechSlugs.add(slugifyTerm(t));
      }
    }
  }

  const KNOWN_TECHNOLOGY_TERMS = [
    'kubernetes',
    'docker',
    'aws',
    'gcp',
    'azure',
    'rust',
    'golang',
    'go',
    'kafka',
    'graphql',
    'redis',
    'spark',
    'hadoop',
    'terraform',
    'elasticsearch',
    'solr',
    'rabbitmq',
    'microservices',
    'serverless',
    'lambda',
  ];

  const sourceLower = sourceText.toLowerCase();
  const rephrasedLower = rephrasedText.toLowerCase();

  for (const term of KNOWN_TECHNOLOGY_TERMS) {
    const termRegex = new RegExp(`\\b${term}\\b`, 'i');
    if (termRegex.test(rephrasedLower) && !termRegex.test(sourceLower)) {
      const slug = slugifyTerm(term);
      if (!knownTechSlugs.has(slug)) {
        throw new ValidationError(
          `Rephrased bullet injected unbacked technology '${term}' not present in candidate records or source bullet.`
        );
      }
    }
  }
}

export function calculateTokenOverlap(textA, textB) {
  const getTokens = (t) =>
    new Set(
      String(t || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length > 2 &&
            ![
              'and',
              'the',
              'with',
              'for',
              'from',
              'using',
              'into',
              'that',
              'this',
              'built',
              'developed',
            ].includes(w)
        )
    );
  const setA = getTokens(textA);
  const setB = getTokens(textB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Splits text into sentences while protecting technology names (Node.js, Next.js, etc.)
 * and abbreviations with embedded periods from false sentence breaks.
 *
 * @param {string} text
 * @returns {Array<string>} Clean sentences
 */
export function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const protectedText = text
    .replace(/\b([Nn]ode|[Nn]ext|[Vv]ue|[Ee]xpress)\.js\b/g, '$1__DOT__js')
    .replace(/\b(e\.g\.|i\.e\.|etc\.|vs\.|dept\.|dr\.|mr\.|ms\.)/gi, (m) =>
      m.replace(/\./g, '__DOT__')
    );

  const rawMatches = protectedText.match(/[^.!?]+[.!?]+/g) || [protectedText];
  return rawMatches.map((s) => s.replace(/__DOT__/g, '.').trim()).filter(Boolean);
}
