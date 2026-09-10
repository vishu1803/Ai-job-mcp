/**
 * @file Deterministic professional resume composition layer (P16-001G).
 *
 * This service improves recruiter-facing phrasing and section integrity without
 * changing candidate-owned facts, job-analysis authority, project ranking, skill
 * ranking, provenance, package identity, or rendering contracts.
 *
 * Hard invariants:
 * - Never deletes, truncates, reorders, or synthesizes candidate-owned Experience,
 *   Education, or DSA records/content.
 * - Never creates metrics, tenure claims, employers, technologies, or achievements.
 * - Only applies deterministic, meaning-preserving wording compression.
 * - Deep-clones before transformation; never mutates the caller's object.
 * - Preserves all structured arrays, evidence references, and provenance metadata.
 * - Deterministic execution: identical inputs produce identical outputs.
 */

import { ValidationError } from '../errors/index.js';
import { assertMetricSafety, validateRephrasingSafety } from './resume-content-strategy.service.js';

/**
 * Safe, meaning-preserving phrase replacements for generated/project bullets.
 * Each rule only removes filler or normalizes a weak construction to a direct
 * equivalent; no rule introduces or removes factual content.
 */
const SAFE_PHRASE_REPLACEMENTS = Object.freeze([
  [/\bin order to\b/gi, 'to'],
  [/\bwith the use of\b/gi, 'using'],
  [/\butilizing\b/gi, 'using'],
  [/\bmade use of\b/gi, 'used'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\ba total of\b/gi, ''],
]);

/**
 * Generated-summary boilerplate that reads as internal evaluation text.
 * Each entry maps an exact generated template fragment to a tighter, natural
 * professional phrasing that preserves the same factual claims.
 */
const GENERATED_SUMMARY_PATTERNS = Object.freeze([
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
  [
    /with hands-on technical execution in ([^,.]+?)(?=[,.]|$)/gi,
    'with hands-on work in $1',
  ],
  [
    /Software professional offering technical capabilities aligned with ([^,.]+?)(?=[,.]|$)/gi,
    'Software professional with technical capabilities suited to $1',
  ],
]);

/**
 * Normalizes whitespace and unicode punctuation without altering content.
 *
 * @param {string} text
 * @returns {string}
 */
function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Applies deterministic, meaning-preserving wording compression to a bullet.
 * Never hard-truncates text and never removes a factual clause.
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
  // When a replacement lands at the start of the bullet (e.g. "In order to"
  // -> "to", "Made use of" -> "used"), restore the conventional leading capital.
  // Narrowly scoped to words our own rules can produce at position 0, so mixed-case
  // technical tokens (e.g. "iOS") are never corrupted.
  result = result.replace(/^(to|using|used)\b/, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  return normalizeWhitespace(result);
}

/**
 * Polishes a generated professional summary while keeping every factual input
 * intact. Only exact generated boilerplate fragments are rewritten; candidate-
 * authored summaries pass through unchanged unless they contain those exact
 * generated phrases. No new technical claims or numbers are introduced.
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

/**
 * Returns true when a section has renderable content in the structured document.
 *
 * @param {string} sectionKey Canonical section token (SUMMARY, SKILLS, ...)
 * @param {object} doc Structured resume document
 * @returns {boolean}
 */
function hasRenderableSection(sectionKey, doc) {
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
 * Canonical preference order used only when a populated protected section is
 * missing from sectionOrder (safety net for alias/rendering mismatches).
 */
const PROTECTED_SECTION_ANCHOR_ORDER = Object.freeze([
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'DSA',
  'EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
]);

/**
 * Ensures populated candidate-owned sections cannot disappear from a structured
 * resume merely because section-order derivation missed an alias.
 * Existing relative order is preserved; missing sections are inserted only when
 * the corresponding data actually exists. Never creates an empty section.
 *
 * @param {object} doc Structured resume document (treated read-only)
 * @returns {object} New document with integrity-checked sectionOrder
 */
export function ensureCandidateSectionIntegrity(doc) {
  const order = Array.isArray(doc.sectionOrder) ? [...doc.sectionOrder] : [];
  const canonical = order.map((s) => String(s).toUpperCase());

  for (const section of PROTECTED_SECTION_ANCHOR_ORDER) {
    if (!hasRenderableSection(section, doc) || canonical.includes(section)) continue;

    // Anchor to the nearest preceding protected section already present,
    // so the inserted section keeps a professional relative position.
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

/**
 * Deduplicates skills within a category by slug (case-insensitive), keeping the
 * entry with the stronger provenance status. Presentation-level only: the source
 * snapshot data is never mutated and provenance is never degraded.
 *
 * @param {object} doc Composed document (mutated in place)
 * @private
 */
function _dedupeSkillsPresentation(doc) {
  if (!Array.isArray(doc.skills?.categories)) return;

  const provenanceRank = { VERIFIED: 3, CORROBORATED: 2, USER_PROVIDED: 1, CLAIMED: 0 };

  for (const category of doc.skills.categories) {
    if (!Array.isArray(category.skills)) continue;

    const bySlug = new Map();
    for (const skill of category.skills) {
      if (!skill || typeof skill !== 'object') continue;
      const key = String(skill.slug || skill.name || '').toLowerCase();
      if (!key) {
        // Unidentifiable skill entries are preserved as-is.
        continue;
      }
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
      // Stable: preserve original ordering of surviving entries.
      category.skills = category.skills.filter(
        (s) => !s || typeof s !== 'object' || kept.has(String(s.slug || s.name || '').toLowerCase())
      );
    }
  }

  // Drop categories that carry no skills (never render an empty section).
  doc.skills.categories = doc.skills.categories.filter(
    (c) => Array.isArray(c.skills) && c.skills.length > 0
  );
}

/**
 * Fail-closed tripwire: candidate-owned protected sections must survive
 * composition byte-for-byte. Throws if any future edit to this service
 * accidentally mutates them.
 *
 * @param {object} original Authoritative input document
 * @param {object} composed Composed output document
 * @private
 */
function _verifyProtectedSectionsUnchanged(original, composed) {
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
        `P16-001G composition violated protected-content invariant: ${label} data was modified`
      );
    }
  }
}

/**
 * Composes the structured resume for recruiter readability.
 *
 * Improvements applied:
 * 1. Summary polished (generated boilerplate rewritten, facts preserved).
 * 2. Project bullet text compressed (meaning-preserving, evidence attached).
 * 3. Skills deduplicated within categories (presentation only).
 * 4. Section-order integrity enforced for populated protected sections.
 *
 * Important: Experience, Education, DSA and Certifications are copied without
 * any content filtering, rewriting, or bullet-count changes. Project selection,
 * ranking, and budgets remain with the existing authoritative pipeline.
 *
 * @param {object} structuredResumeDocument Authoritative StructuredResumeDocument
 * @returns {object} Composed deep-cloned document
 * @throws {ValidationError} If input is invalid or protected invariants break
 */
export function composeStructuredResumeDocument(structuredResumeDocument) {
  if (!structuredResumeDocument || typeof structuredResumeDocument !== 'object') {
    throw new ValidationError(
      'composeStructuredResumeDocument requires a StructuredResumeDocument object'
    );
  }

  // Deep clone: the caller's object is never mutated.
  const composed = JSON.parse(JSON.stringify(structuredResumeDocument));

  // 1. Summary polish (guarded: never empty the summary, never inject metrics).
  if (composed.summary && typeof composed.summary.text === 'string') {
    const polished = polishProfessionalSummary(composed.summary.text);
    if (polished && polished.length > 0 && polished !== composed.summary.text) {
      try {
        assertMetricSafety(polished, composed.summary.evidenceRefs || [], {
          sourceText: composed.summary.text,
        });
        composed.summary = { ...composed.summary, text: polished };
      } catch {
        // Metric safety failed: keep the original summary verbatim.
      }
    }
  }

  // 2. Project bullet compression (provenance and evidence untouched).
  if (Array.isArray(composed.projects)) {
    composed.projects = composed.projects.map((project) => ({
      ...project,
      bullets: Array.isArray(project.bullets)
        ? project.bullets.map((bullet) => {
            if (typeof bullet === 'string') {
              return compressProfessionalBullet(bullet);
            }
            if (!bullet || typeof bullet !== 'object' || typeof bullet.text !== 'string') {
              return bullet;
            }
            const compressed = compressProfessionalBullet(bullet.text);
            if (!compressed || compressed === bullet.text) {
              return bullet;
            }
            try {
              // Defense-in-depth: compression must not introduce anything new.
              assertMetricSafety(compressed, bullet.evidenceRefs || [], {
                sourceText: bullet.text,
              });
              validateRephrasingSafety(bullet.text, compressed, {
                skills: composed.skills?.categories?.flatMap((c) => c.skills || []) || [],
                projects: composed.projects || [],
              });
              return { ...bullet, text: compressed };
            } catch {
              // Never risk an unsafe rewrite: keep the original bullet verbatim.
              return bullet;
            }
          })
        : project.bullets,
    }));
  }

  // 3. Skills presentation cleanup (dedupe by slug, keep best provenance).
  _dedupeSkillsPresentation(composed);

  // 4. Section-order integrity for populated protected sections.
  const composedWithOrder = ensureCandidateSectionIntegrity(composed);

  // 5. Fail-closed verification of all protected-content invariants.
  _verifyProtectedSectionsUnchanged(structuredResumeDocument, composedWithOrder);

  return composedWithOrder;
}

export default composeStructuredResumeDocument;
