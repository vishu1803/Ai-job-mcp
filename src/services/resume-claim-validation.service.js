/**
 * @file Resume Claim Validation Service (P17 Architecture)
 *
 * Dedicated post-generation validation service enforcing 13 non-negotiable checks
 * on every AI-generated claim before it is permitted to enter the resume:
 *
 *  1. Every factId exists in canonical fact inventory.
 *  2. Every factId belongs to this candidate.
 *  3. Every factId is authorized for the target section / project.
 *  4. Every metric in text exists in authorized evidence.
 *  5. Every technology in text is authorized for candidate.
 *  6. No unsupported actor/team/user/customer claim exists.
 *  7. No unsupported outcome exists.
 *  8. No unsupported performance statement exists.
 *  9. No employer/title/date changes.
 * 10. Semantic dimensions match the fact set.
 * 11. Claim meaning remains within evidence scope.
 * 12. Claim does not duplicate another rendered claim.
 * 13. Claim is professionally grammatical and active-voice.
 *
 * Invariant:
 * If validation fails: REJECT the claim (never silently repair with string replacement).
 */

import { extractAuthenticMetrics, isMeasurableFact } from './candidate-fact-inventory.service.js';
import { calculateTokenOverlap } from './resume-content-strategy.service.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

// Recognized active engineering verbs
const ACTIVE_OPENER_VERBS = new Set([
  'architected', 'engineered', 'implemented', 'designed', 'built', 'developed',
  'optimized', 'automated', 'orchestrated', 'spearheaded', 'refactored', 'deployed',
  'containerized', 'configured', 'integrated', 'migrated', 'scaled', 'benchmarked',
  'debugged', 'reduced', 'standardized', 'secured', 'streamlined', 'published',
  'authored', 'established', 'maintained', 'analyzed', 'profiled', 'constructed',
  'accelerated', 'formulated', 'synthesized', 'created', 'resolved', 'monitored',
]);

const WEAK_OPENERS = [
  /\b(worked on|helped with|responsible for|assisted with|handled|contributed to|involved in|tasked with)\b/i,
];

const UNSUPPORTED_ACTOR_PATTERNS = [
  /\b(?:led|managed|supervised|directed)\s+(?:a\s+)?(?:team|group|squad|department)\s+of\b/i,
  /\b(?:serving|reaching)\s+\d+[\d,]*\+?\s+(?:users|customers|clients)\b/i,
];

export class ResumeClaimValidationService {
  /**
   * Validates a candidate claim against the 13 strict invariants.
   *
   * @param {object} claim The synthesized claim object
   * @param {string} claim.claimId
   * @param {string} claim.text
   * @param {Array<string>} claim.factIds
   * @param {Array<string>} [claim.semanticDimensions]
   * @param {Array<string>} [claim.metricsUsed]
   * @param {Array<string>} [claim.technologiesUsed]
   * @param {object} context Validation context
   * @param {Array<object>|Map<string, object>} context.factInventory Canonical facts
   * @param {object} context.candidateProfile Candidate profile
   * @param {string} context.sectionOwnerType 'PROJECT' | 'EXPERIENCE' | 'DSA' | 'SUMMARY'
   * @param {string} context.sectionOwnerId ID of owning project/experience
   * @param {Array<object>} [context.alreadyRenderedClaims=[]] Previously accepted claims in the document
   * @returns {{ valid: boolean, rejected: boolean, violations: Array<{ code: string, message: string }> }}
   */
  validateClaim(claim, context = {}) {
    const violations = [];

    if (!claim || typeof claim !== 'object' || !claim.text) {
      return {
        valid: false,
        rejected: true,
        violations: [{ code: 'INVALID_CLAIM_PAYLOAD', message: 'Claim must contain non-empty text' }],
      };
    }

    const text = String(claim.text || '').trim();
    const factIds = Array.isArray(claim.factIds) ? claim.factIds : [];
    const factInventory = context.factInventory;

    // Index facts for rapid lookup
    const factMap = new Map();
    if (Array.isArray(factInventory)) {
      for (const f of factInventory) factMap.set(f.factId || f.id, f);
    } else if (factInventory && typeof factInventory.get === 'function') {
      // Map instance
      for (const [k, v] of factInventory.entries()) factMap.set(k, v);
    } else if (factInventory && Array.isArray(factInventory.facts)) {
      for (const f of factInventory.facts) factMap.set(f.factId || f.id, f);
    }

    // ── 1. Every factId exists ────────────────────────────────────────────────
    if (factIds.length === 0) {
      violations.push({ code: 'EMPTY_FACT_IDS', message: 'Claim does not reference any canonical factId' });
    }
    const contributingFacts = [];
    for (const fid of factIds) {
      const fact = factMap.get(fid);
      if (!fact) {
        violations.push({ code: 'UNKNOWN_FACT_ID', message: `Referenced factId "${fid}" does not exist in inventory` });
      } else {
        contributingFacts.push(fact);
      }
    }

    // ── 2. Every factId belongs to this candidate ─────────────────────────────
    const candId = context.candidateProfile?.id;
    for (const fact of contributingFacts) {
      if (fact.candidateId && candId && fact.candidateId !== candId) {
        violations.push({ code: 'FOREIGN_CANDIDATE_FACT', message: `Fact "${fact.factId}" does not belong to candidate "${candId}"` });
      }
    }

    // ── 3. Every factId is authorized for the target section ──────────────────
    const targetOwnerId = context.sectionOwnerId;
    const targetOwnerType = context.sectionOwnerType;
    for (const fact of contributingFacts) {
      if (targetOwnerType === 'PROJECT' && targetOwnerId) {
        const factProjId = fact.association?.projectId || fact.projectId || fact.ownerId;
        if (factProjId && factProjId !== targetOwnerId) {
          violations.push({
            code: 'CROSS_SECTION_CONTAMINATION',
            message: `Fact "${fact.factId}" from project "${factProjId}" is unauthorized for project "${targetOwnerId}"`,
          });
        }
      }
    }

    // ── 4. Every metric in text exists in authorized evidence ─────────────────
    if (isMeasurableFact(text)) {
      const textMetrics = extractAuthenticMetrics(text);
      const authorizedMetrics = new Set();

      for (const fact of contributingFacts) {
        if (Array.isArray(fact.metrics)) {
          for (const m of fact.metrics) {
            authorizedMetrics.add(String(m.raw || m.value || m).toLowerCase().replace(/\s+/g, ''));
          }
        }
        // Check raw fact text for the metric tokens
        for (const tm of textMetrics) {
          const cleanTm = tm.raw.toLowerCase().replace(/\s+/g, '');
          if (fact.text.toLowerCase().replace(/\s+/g, '').includes(cleanTm)) {
            authorizedMetrics.add(cleanTm);
          }
        }
      }

      for (const tm of textMetrics) {
        const cleanTm = tm.raw.toLowerCase().replace(/\s+/g, '');
        if (!authorizedMetrics.has(cleanTm)) {
          violations.push({
            code: 'UNSUPPORTED_METRIC',
            message: `Metric "${tm.raw}" in claim text does not exist in authorized contributing facts`,
          });
        }
      }
    }

    // ── 5. Every technology in text is authorized ─────────────────────────────
    const candidateTechSet = this._buildAuthorizedTechSet(context, contributingFacts);
    const techRegex = /\b(Rust|Go|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|FastAPI|Prisma|Next\.js|Vue\.js|Express|Flask|Django|AWS|GCP|Linux|SQL|Git)\b/gi;
    const techMatches = text.match(techRegex) || [];
    for (const t of techMatches) {
      const normT = normalizeTechnologyName(t);
      if (!candidateTechSet.has(normT.toLowerCase())) {
        violations.push({
          code: 'UNAUTHORIZED_TECHNOLOGY',
          message: `Technology "${t}" in claim text is not authorized for this candidate or project`,
        });
      }
    }

    // ── 6. No unsupported actor/team/user/customer claim ──────────────────────
    for (const pat of UNSUPPORTED_ACTOR_PATTERNS) {
      if (pat.test(text)) {
        const supportedInFacts = contributingFacts.some((f) => pat.test(f.text));
        if (!supportedInFacts) {
          violations.push({
            code: 'UNSUPPORTED_ACTOR_CLAIM',
            message: `Claim asserts unbacked leadership, team size, or user scale: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 7. No unsupported outcome claims ──────────────────────────────────────
    const outcomePattern = /\b(?:resulting in|yielding|saved \$|decreased by \d+|increased revenue by)\b/i;
    if (outcomePattern.test(text)) {
      const supportedInFacts = contributingFacts.some(
        (f) => f.canonicalFactType === 'OUTCOME' || outcomePattern.test(f.text)
      );
      if (!supportedInFacts) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message: 'Claim asserts an outcome clause not substantiated by contributing canonical facts',
        });
      }
    }

    // ── 8. No unsupported performance statement ──────────────────────────────
    const perfPattern = /\b(?:\d+x\s+faster|reduced\s+latency\s+to\s+\d+|lowered\s+memory\s+by\s+\d+)\b/i;
    if (perfPattern.test(text)) {
      const supported = contributingFacts.some((f) => perfPattern.test(f.text));
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_PERFORMANCE_CLAIM',
          message: 'Claim asserts an uncorroborated performance multiplier',
        });
      }
    }

    // ── 9. No employer/title/date modifications ──────────────────────────────
    if (context.sectionOwnerType === 'EXPERIENCE' && context.sectionOwnerId) {
      // Experience bullets cannot redefine company or role title
      if (/\b(?:at|for)\s+[A-Z][a-zA-Z0-9\s]+(?:Inc|LLC|Corp|Technologies|Solutions)\b/.test(text)) {
        violations.push({
          code: 'UNAUTHORIZED_EMPLOYER_MENTION',
          message: 'Experience bullet cannot alter or inject alternative employer names',
        });
      }
    }

    // ── 10. Semantic dimensions match fact set ────────────────────────────────
    if (Array.isArray(claim.semanticDimensions) && claim.semanticDimensions.length > 0) {
      const authorizedTopics = new Set(
        contributingFacts.flatMap((f) => [
          f.semanticTopic,
          ...(f.semanticTopics || []),
          f.canonicalFactType?.toLowerCase(),
          f.evidenceRole?.toLowerCase(),
        ]).filter(Boolean)
      );
      const hasOverlap = claim.semanticDimensions.some((d) => authorizedTopics.has(d.toLowerCase()));
      if (!hasOverlap && contributingFacts.length > 0) {
        violations.push({
          code: 'SEMANTIC_DIMENSION_MISMATCH',
          message: 'Claim semantic dimensions do not match contributing fact topics',
        });
      }
    }

    // ── 11. Claim meaning remains within evidence scope ───────────────────────
    if (contributingFacts.length > 0) {
      const combinedFactText = contributingFacts.map((f) => f.text).join(' ');
      const overlap = calculateTokenOverlap(text, combinedFactText);
      if (overlap < 0.20 && text.length > 50) {
        violations.push({
          code: 'EVIDENCE_SCOPE_EXCEEDED',
          message: `Claim text deviates substantially from underlying source facts (overlap: ${overlap})`,
        });
      }
    }

    // ── 12. Claim does not duplicate another rendered claim ───────────────────
    const renderedClaims = context.alreadyRenderedClaims || [];
    for (const rendered of renderedClaims) {
      const renderedText = typeof rendered === 'string' ? rendered : rendered.text || '';
      if (!renderedText) continue;
      const pairwiseOverlap = calculateTokenOverlap(text, renderedText);
      if (pairwiseOverlap >= 0.50) {
        violations.push({
          code: 'DUPLICATE_RENDERED_CLAIM',
          message: `Claim is semantically redundant with an already accepted claim (overlap: ${pairwiseOverlap.toFixed(2)})`,
        });
        break;
      }
    }

    // ── 13. Professional grammar and active voice opener ──────────────────────
    const firstWord = (text.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!ACTIVE_OPENER_VERBS.has(firstWord) && !ACTIVE_OPENER_VERBS.has(firstWord.replace(/ed$/, ''))) {
      if (WEAK_OPENERS.some((p) => p.test(text.slice(0, 30)))) {
        violations.push({
          code: 'WEAK_VERB_OPENER',
          message: `Claim starts with weak or passive opener: "${text.slice(0, 25)}..."`,
        });
      }
    }

    // LaTeX leakage and formatting artifacts
    if (/\\(?:textbf|textit|item|href|begin|end|hline)/.test(text) || /\$\$.*\$\$/.test(text)) {
      violations.push({
        code: 'LATEX_LEAKAGE',
        message: 'Claim contains raw LaTeX markup tags',
      });
    }

    if (text.length < 25) {
      violations.push({ code: 'CLAIM_TOO_SHORT', message: `Claim length (${text.length} chars) is below minimal professional threshold` });
    } else if (text.length > 350) {
      violations.push({ code: 'CLAIM_TOO_LONG', message: `Claim length (${text.length} chars) exceeds maximum bullet length` });
    }

    return {
      valid: violations.length === 0,
      rejected: violations.length > 0,
      violations,
    };
  }

  /**
   * Helper extracting authorized technologies for the candidate and project.
   *
   * @private
   */
  _buildAuthorizedTechSet(context, contributingFacts) {
    const techSet = new Set();
    const profile = context.candidateProfile || {};

    // Direct project context if provided
    if (context.project && Array.isArray(context.project.technologies)) {
      for (const t of context.project.technologies) {
        if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
      }
    }

    // Candidate skills (array of strings or objects)
    if (Array.isArray(profile.skills)) {
      for (const s of profile.skills) {
        const name = typeof s === 'string' ? s : s.name || s.slug || '';
        if (name) techSet.add(normalizeTechnologyName(name).toLowerCase());
      }
    } else if (profile.skills && Array.isArray(profile.skills.categories)) {
      for (const cat of profile.skills.categories) {
        for (const s of (cat.skills || [])) {
          const name = typeof s === 'string' ? s : s.name || s.slug || '';
          if (name) techSet.add(normalizeTechnologyName(name).toLowerCase());
        }
      }
    }

    if (Array.isArray(profile.canonicalSkills)) {
      for (const s of profile.canonicalSkills) {
        const name = typeof s === 'string' ? s : s.name || s.slug || '';
        if (name) techSet.add(normalizeTechnologyName(name).toLowerCase());
      }
    }

    // Project technologies from profile
    if (context.sectionOwnerType === 'PROJECT' && context.sectionOwnerId) {
      const rawProjects = profile.profileMetadata?.projects || profile.projects || [];
      const proj = rawProjects.find((p) => (p.id || p.projectId || p.name) === context.sectionOwnerId);
      if (proj && Array.isArray(proj.technologies)) {
        for (const t of proj.technologies) {
          if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
        }
      }
    }

    // Contributing facts and fact inventory: extract both declared technologies and technologies mentioned in authentic fact text
    const factsToCheck = [
      ...contributingFacts,
      ...(Array.isArray(context.factInventory) ? context.factInventory : []),
      ...(context.factInventory?.facts || []),
    ];
    for (const f of factsToCheck) {
      for (const t of (f.technologies || [])) {
        if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
      }
      if (f.text) {
        const matches = f.text.match(/\b(Rust|Go|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|FastAPI|Prisma|Next\.js|Vue\.js|Express|Flask|Django|AWS|GCP|Linux|SQL|Git|Alembic|Prometheus|Grafana)\b/gi) || [];
        for (const m of matches) {
          techSet.add(normalizeTechnologyName(m).toLowerCase());
        }
      }
    }

    return techSet;
  }
}

export const defaultResumeClaimValidationService = new ResumeClaimValidationService();
export default ResumeClaimValidationService;
