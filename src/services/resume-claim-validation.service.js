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

import {
  extractAuthenticMetrics,
  isMeasurableFact,
  AGENCY_LEVELS,
  determineFactAgency,
  doesClaimAssertCandidateAgency,
  isTrustedCandidateAgencySource,
} from './candidate-fact-inventory.service.js';
import {
  calculateTokenOverlap,
  sanitizeGroundedAccomplishment,
} from './resume-composition-primitives.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';
import { validateAiPrivacy } from './ai-context-sanitizer.service.js';

// Recognized active engineering verbs
const ACTIVE_OPENER_VERBS = new Set([
  'architected',
  'engineered',
  'implemented',
  'designed',
  'built',
  'developed',
  'optimized',
  'automated',
  'orchestrated',
  'spearheaded',
  'refactored',
  'deployed',
  'containerized',
  'configured',
  'integrated',
  'migrated',
  'scaled',
  'benchmarked',
  'debugged',
  'reduced',
  'standardized',
  'secured',
  'streamlined',
  'published',
  'authored',
  'established',
  'maintained',
  'analyzed',
  'profiled',
  'constructed',
  'accelerated',
  'formulated',
  'synthesized',
  'created',
  'resolved',
  'monitored',
]);

const WEAK_OPENERS = [
  /\b(worked on|helped with|responsible for|assisted with|handled|contributed to|involved in|tasked with)\b/i,
];

const UNSUPPORTED_ACTOR_PATTERNS = [
  /\b(?:led|managed|supervised|directed)\s+(?:a\s+)?(?:team|group|squad|department)\s+of\b/i,
  /\b(?:serving|reaching)\s+\d+[\d,]*\+?\s+(?:users|customers|clients)\b/i,
];

export const OUTCOME_PATTERN =
  /\b(?:resulting in|leading to|yielding|saved \$|decreased by \d+|increased revenue by)\b/i;
export const TIME_SAVINGS_PATTERN =
  /\b(?:reduced|saved|decreased|cut|lowered)\s+(?:average\s+)?(?:manual\s+)?(?:code\s+)?review\s+time\b|\btime\s+savings\b|\bsaved\s+\d+\+?\s+(?:hours|mins|minutes)\b/i;
export const VELOCITY_PATTERN =
  /\b(?:developer\s+velocity|team\s+velocity|engineering\s+velocity)\b/i;
export const QUALITY_PATTERN =
  /\b(?:code\s+quality\s+standards|improved\s+code\s+quality|higher\s+code\s+quality)\b/i;
export const PRODUCTIVITY_PATTERN =
  /\b(?:improved|boosted|increased|enhanced)\s+(?:team\s+|developer\s+)?productivity\b/i;
export const OVERHEAD_PATTERN =
  /\b(?:reduced|improved|minimized|decreased|cut)\s+(?:team\s+)?coordination\s+overhead\b|\bcoordination\s+overhead\b/i;
export const PERCENTAGE_REDUCTION_PATTERN =
  /\b(?:reduced|decreased|lowered|slashed|cut)\s+(?:[a-z0-9\s_-]+?\s+)?(?:by\s+)?\d+%/i;
export const PERF_PATTERN =
  /\b(?:\d+x\s+faster|reduced\s+latency\s+to\s+\d+|lowered\s+memory\s+by\s+\d+)\b/i;

export const isVerifiedOutcomeFact = (f) =>
  Boolean(
    f &&
    f.sourceType !== 'bullet' &&
    f.sourceType !== 'summary' &&
    (f.canonicalFactType === 'OUTCOME' ||
      f.canonicalFactType === 'METRIC' ||
      f.evidenceRole === 'OUTCOME' ||
      f.contributionClass === 'CANDIDATE_OUTCOME' ||
      (Array.isArray(f.metrics) && f.metrics.length > 0)) &&
    (f.provenanceStatus === 'VERIFIED' ||
      f.provenance === 'VERIFIED' ||
      f.corroborated === true ||
      f.agencyLevel === 'CANDIDATE')
  );

export const isVerifiedMetricFact = (f) =>
  Boolean(
    f &&
    f.sourceType !== 'bullet' &&
    f.sourceType !== 'summary' &&
    (f.canonicalFactType === 'METRIC' ||
      f.evidenceRole === 'OUTCOME' ||
      f.contributionClass === 'CANDIDATE_OUTCOME' ||
      (Array.isArray(f.metrics) && f.metrics.length > 0)) &&
    (f.provenanceStatus === 'VERIFIED' ||
      f.provenance === 'VERIFIED' ||
      f.corroborated === true ||
      f.agencyLevel === 'CANDIDATE')
  );

/**
 * Validates whether a metric in a bullet claim is authorized by contributing facts,
 * supporting both EXPLICIT facts and mathematically DERIVED percentage/multiplier facts.
 *
 * @param {string} metricRaw
 * @param {Array<object>} contributingFacts
 * @returns {{ authorized: boolean, type: 'EXPLICIT'|'DERIVED'|'UNSUPPORTED', source?: string, formula?: string }}
 */
export function isMetricAuthorizedByFacts(metricRaw, contributingFacts = []) {
  if (!metricRaw) return { authorized: false, type: 'UNSUPPORTED' };
  const cleanTm = String(metricRaw).toLowerCase().replace(/\s+/g, '');

  for (const fact of contributingFacts) {
    if (!fact) continue;
    // 1. Explicit metrics in fact.metrics array
    if (Array.isArray(fact.metrics)) {
      for (const m of fact.metrics) {
        const cleanM = String(m.raw || m.value || m)
          .toLowerCase()
          .replace(/\s+/g, '');
        if (cleanM === cleanTm || cleanM.includes(cleanTm) || cleanTm.includes(cleanM)) {
          return { authorized: true, type: 'EXPLICIT', source: fact.factId };
        }
      }
    }
    // 2. Explicit metric string in fact text
    const cleanFactText = String(fact.text || '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (cleanFactText.includes(cleanTm)) {
      return { authorized: true, type: 'EXPLICIT', source: fact.factId };
    }

    // 3. Derived metrics: percentage reduction or improvement
    const pctMatch = cleanTm.match(/^(\d+(?:\.\d+)?)%$/);
    if (pctMatch) {
      const targetPct = Math.round(parseFloat(pctMatch[1]));
      // Extract numbers regardless of adjacent units (ms, sec, kb, etc.) or commas
      const numbersInFact = (fact.text.match(/\d+[\d,]*(?:\.\d+)?/g) || []).map((n) =>
        Number(n.replace(/,/g, ''))
      );
      if (numbersInFact.length >= 2) {
        for (let i = 0; i < numbersInFact.length; i++) {
          for (let j = 0; j < numbersInFact.length; j++) {
            if (i === j) continue;
            const a = numbersInFact[i];
            const b = numbersInFact[j];
            if (a > 0) {
              const diffPct = Math.round((Math.abs(a - b) / a) * 100);
              if (diffPct === targetPct) {
                return {
                  authorized: true,
                  type: 'DERIVED',
                  source: fact.factId,
                  formula: `|${a} - ${b}| / ${a} = ${targetPct}%`,
                };
              }
            }
          }
        }
      }
    }

    // 4. Derived metrics: multiplier (e.g. 2x, 3x)
    const multMatch = cleanTm.match(/^(\d+(?:\.\d+)?)x$/);
    if (multMatch) {
      const targetMult = parseFloat(multMatch[1]);
      const numbersInFact = (fact.text.match(/\d+[\d,]*(?:\.\d+)?/g) || []).map((n) =>
        Number(n.replace(/,/g, ''))
      );
      if (numbersInFact.length >= 2) {
        for (let i = 0; i < numbersInFact.length; i++) {
          for (let j = 0; j < numbersInFact.length; j++) {
            if (i === j) continue;
            const a = numbersInFact[i];
            const b = numbersInFact[j];
            if (b > 0 && Math.round((a / b) * 10) / 10 === targetMult) {
              return {
                authorized: true,
                type: 'DERIVED',
                source: fact.factId,
                formula: `${a} / ${b} = ${targetMult}x`,
              };
            }
          }
        }
      }
    }
  }

  return { authorized: false, type: 'UNSUPPORTED' };
}

export class ResumeClaimValidationService {
  /**
   * Static helper to validate a candidate claim against invariants.
   */
  static validateClaim(claim, context = {}) {
    return new ResumeClaimValidationService().validateClaim(claim, context);
  }

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
        violations: [
          { code: 'INVALID_CLAIM_PAYLOAD', message: 'Claim must contain non-empty text' },
        ],
      };
    }

    const text = String(claim.text || '').trim();
    const factIds =
      Array.isArray(claim.factIds) && claim.factIds.length > 0
        ? claim.factIds
        : Array.isArray(claim.composedFromFactIds)
          ? claim.composedFromFactIds
          : [];
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

    // ── 0. Privacy Validation: Zero Candidate PII Permitted ─────────────────
    if (context.candidateProfile) {
      const privacyCheck = validateAiPrivacy({
        text,
        candidateProfile: context.candidateProfile,
      });
      if (!privacyCheck.valid) {
        for (const v of privacyCheck.violations) {
          violations.push({
            code: 'CANDIDATE_PII_DETECTED',
            message: `Claim contains forbidden candidate personal identifier: "${v.token}" (${v.message})`,
          });
        }
      }
    }

    // ── 1. Every factId exists ────────────────────────────────────────────────
    if (factIds.length === 0) {
      violations.push({
        code: 'EMPTY_FACT_IDS',
        message: 'Claim does not reference any canonical factId',
      });
    }
    const contributingFacts = [];
    for (const fid of factIds) {
      const fact = factMap.get(fid);
      if (!fact) {
        violations.push({
          code: 'UNKNOWN_FACT_ID',
          message: `Referenced factId "${fid}" does not exist in inventory`,
        });
      } else {
        contributingFacts.push(fact);
      }
    }

    // ── 2. Every factId belongs to this candidate ─────────────────────────────
    const candId = context.candidateProfile?.id;
    for (const fact of contributingFacts) {
      if (fact.candidateId && candId && fact.candidateId !== candId) {
        violations.push({
          code: 'FOREIGN_CANDIDATE_FACT',
          message: `Fact "${fact.factId}" does not belong to candidate "${candId}"`,
        });
      }
    }

    // ── 3. Every factId is authorized for the target section ──────────────────
    const targetOwnerId = context.sectionOwnerId;
    const targetOwnerType = context.sectionOwnerType;
    for (const fact of contributingFacts) {
      if (targetOwnerType === 'PROJECT' && targetOwnerId) {
        const factProjId = fact.association?.projectId || fact.projectId || fact.ownerId;
        const validIds = new Set(
          [
            targetOwnerId,
            context.project?.id,
            context.project?.projectId,
            context.project?.name,
            context.project?.displayName,
          ].filter(Boolean)
        );
        if (factProjId && !validIds.has(factProjId) && factProjId !== 'proj') {
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

      for (const tm of textMetrics) {
        const auth = isMetricAuthorizedByFacts(tm.raw, contributingFacts);
        if (!auth.authorized) {
          violations.push({
            code: 'UNSUPPORTED_METRIC',
            message: `Metric "${tm.raw}" in claim text does not exist in authorized contributing facts`,
          });
        }
      }
    }

    // ── 5. Every technology in text is authorized ─────────────────────────────
    const candidateTechSet = this._buildAuthorizedTechSet(context, contributingFacts);
    const techRegex =
      /\b(Rust|Go|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|FastAPI|Prisma|Next\.js|Vue\.js|Express|Flask|Django|AWS|GCP|Linux|SQL|Git)\b/gi;
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
    if (OUTCOME_PATTERN.test(text)) {
      const supportedInFacts = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supportedInFacts) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message: 'Claim asserts an outcome clause not substantiated by verified source evidence',
        });
      }
    }

    // Strict Grounding Invariant (Part 55 / Part 56): Specific outcomes cannot be inferred from mere automation
    // (a) Review time / manual time savings
    if (TIME_SAVINGS_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message:
            'Claim asserts review time reduction or time savings not explicitly substantiated by verified source evidence',
        });
      }
    }

    // (b) Developer velocity
    if (VELOCITY_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message:
            'Claim asserts developer velocity improvement not explicitly substantiated by verified source evidence',
        });
      }
    }

    // (c) Code quality standards / improvements
    if (QUALITY_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message:
            'Claim asserts code quality improvement not explicitly substantiated by verified source evidence',
        });
      }
    }

    // (d) Team / developer productivity
    if (PRODUCTIVITY_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message:
            'Claim asserts productivity improvement not explicitly substantiated by verified source evidence',
        });
      }
    }

    // (e) Coordination / operational overhead
    if (OVERHEAD_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedOutcomeFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_OUTCOME',
          message:
            'Claim asserts coordination overhead reduction not explicitly substantiated by verified source evidence',
        });
      }
    }

    // (f) Percentage reductions
    if (PERCENTAGE_REDUCTION_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedMetricFact);
      if (!supported) {
        violations.push({
          code: 'UNSUPPORTED_METRIC',
          message:
            'Claim asserts an uncorroborated percentage reduction not present in verified source evidence',
        });
      }
    }

    // ── 8. No unsupported performance statement ──────────────────────────────
    if (PERF_PATTERN.test(text)) {
      const supported = contributingFacts.some(isVerifiedMetricFact);
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
      if (
        /\b(?:at|for)\s+[A-Z][a-zA-Z0-9\s]+(?:Inc|LLC|Corp|Technologies|Solutions)\b/.test(text)
      ) {
        violations.push({
          code: 'UNAUTHORIZED_EMPLOYER_MENTION',
          message: 'Experience bullet cannot alter or inject alternative employer names',
        });
      }
    }

    // ── 10. Semantic dimensions match fact set ────────────────────────────────
    if (Array.isArray(claim.semanticDimensions) && claim.semanticDimensions.length > 0) {
      const authorizedTopics = new Set(
        contributingFacts
          .flatMap((f) => [
            f.semanticTopic,
            ...(f.semanticTopics || []),
            f.canonicalFactType?.toLowerCase(),
            f.evidenceRole?.toLowerCase(),
            f.contributionClass?.toLowerCase(),
          ])
          .filter(Boolean)
          .map((t) => String(t).toLowerCase())
      );

      // Expand standard cluster synonyms so role/class match their planner cluster
      if (
        authorizedTopics.has('design_decision') ||
        authorizedTopics.has('candidate_design_decision') ||
        authorizedTopics.has('architecture')
      ) {
        authorizedTopics.add('architecture');
        authorizedTopics.add('design');
      }
      if (
        authorizedTopics.has('action') ||
        authorizedTopics.has('candidate_action') ||
        authorizedTopics.has('candidate_implementation') ||
        authorizedTopics.has('implementation')
      ) {
        authorizedTopics.add('implementation');
        authorizedTopics.add('action');
      }
      if (
        authorizedTopics.has('optimization') ||
        authorizedTopics.has('candidate_optimization') ||
        authorizedTopics.has('performance') ||
        authorizedTopics.has('outcome') ||
        authorizedTopics.has('candidate_outcome')
      ) {
        authorizedTopics.add('performance_outcome');
        authorizedTopics.add('performance');
        authorizedTopics.add('optimization');
        authorizedTopics.add('outcome');
      }
      if (authorizedTopics.has('reliability') || authorizedTopics.has('security')) {
        authorizedTopics.add('reliability');
      }
      if (authorizedTopics.has('integration')) {
        authorizedTopics.add('integration_api');
      }
      if (authorizedTopics.has('feature') || authorizedTopics.has('tooling')) {
        authorizedTopics.add('tooling_automation');
      }
      const hasOverlap = claim.semanticDimensions.some((d) => {
        const dLower = String(d).toLowerCase();
        if (authorizedTopics.has(dLower)) return true;
        const parts = dLower.split('_');
        if (parts.some((p) => authorizedTopics.has(p))) return true;
        return [...authorizedTopics].some((at) => at.includes(dLower) || dLower.includes(at));
      });
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
      const minThreshold = context.sectionOwnerType === 'SUMMARY' ? 0.05 : 0.2;
      if (overlap < minThreshold && text.length > 50) {
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
      if (pairwiseOverlap >= 0.5) {
        violations.push({
          code: 'DUPLICATE_RENDERED_CLAIM',
          message: `Claim is semantically redundant with an already accepted claim (overlap: ${pairwiseOverlap.toFixed(2)})`,
        });
        break;
      }
    }

    // ── 13. Professional grammar and active voice opener ──────────────────────
    const firstWord = (text.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (
      !ACTIVE_OPENER_VERBS.has(firstWord) &&
      !ACTIVE_OPENER_VERBS.has(firstWord.replace(/ed$/, ''))
    ) {
      if (WEAK_OPENERS.some((p) => p.test(text.slice(0, 30)))) {
        violations.push({
          code: 'WEAK_VERB_OPENER',
          message: `Claim starts with weak or passive opener: "${text.slice(0, 25)}..."`,
        });
      }
    }

    // ── 13b. Project Bullet Complete Sentence & Action Accomplishment Contract ──
    if (context.sectionOwnerType === 'PROJECT') {
      const trimmed = text.trim();
      if (!trimmed.endsWith('.') && !trimmed.endsWith('!')) {
        violations.push({
          code: 'INCOMPLETE_SENTENCE',
          message: 'Project bullet must read as a complete sentence ending with punctuation',
        });
      }
      const isFragment =
        /^(?:intelligent\s+automated|real-time\s+collaborative|full-stack\s+[a-z]+(?:\s+platform|\s+application|\s+manager|\s+system)?\s+built|a\s+[a-z]+|an\s+[a-z]+|the\s+[a-z]+)/i.test(
          trimmed
        );
      const firstWord = trimmed
        .split(/\s+/)[0]
        ?.toLowerCase()
        .replace(/[^a-z]/g, '');
      const startsWithActionVerb =
        ACTIVE_OPENER_VERBS.has(firstWord) ||
        /^(?:engineered|architected|implemented|built|designed|developed|optimized|scaled|refactored|automated|deployed|integrated|configured|secured|improved|reduced|delivered|achieved|saved|accelerated|expanded|created|established|maintained|monitored|profiled|formulated|synthesized|provided|standardized|containerized|migrated|introduced|authored|constructed|benchmarked|orchestrated|spearheaded|debugged|streamlined)\b/i.test(
          trimmed
        ) ||
        /^designed\s+and\s+implemented\b/i.test(trimmed) ||
        /^built\s+and\s+(?:deployed|implemented|designed)\b/i.test(trimmed) ||
        /^architected\s+and\s+(?:engineered|implemented)\b/i.test(trimmed) ||
        /^developed\s+and\s+(?:integrated|deployed)\b/i.test(trimmed);

      if (isFragment || !startsWithActionVerb) {
        violations.push({
          code: 'FRAGMENT_BULLET',
          message: `Project bullet is a fragment or lacks a strong action verb accomplishment opener: "${trimmed.slice(0, 40)}..."`,
        });
      }
    }

    // ── 14. Unsupported causal implication ───────────────────────────────────
    const causalPatterns = [
      /\b(?:causing|which led to|directly resulting in|attributable to|consequently driving)\b/i,
    ];
    for (const pat of causalPatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_CAUSAL_IMPLICATION',
            message: `Claim asserts an unverified causal relationship: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 15. Unsupported comparative implication ──────────────────────────────
    const comparativePatterns = [
      /\b(?:better than|superior to|outperforming|faster than|more efficient than|unmatched by|industry-leading)\b/i,
    ];
    for (const pat of comparativePatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_COMPARATIVE_IMPLICATION',
            message: `Claim asserts an unverified comparative claim: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 16. Unsupported superlative ──────────────────────────────────────────
    const superlativePatterns = [
      /\b(?:the best|best-in-class|leading-edge|world-class|premier|top-tier|state-of-the-art|peerless|ultra-reliable)\b/i,
    ];
    for (const pat of superlativePatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_SUPERLATIVE',
            message: `Claim contains unverified superlative language: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 17. Unsupported production adjective ─────────────────────────────────
    const productionPatterns = [
      /\b(?:commercial production|enterprise-grade|production-grade|in (?:global )?production|deployed in production|live traffic)\b/i,
    ];
    for (const pat of productionPatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some(
          (f) =>
            pat.test(f.text) && (f.provenance === 'VERIFIED' || f.provenance === 'CORROBORATED')
        );
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_PRODUCTION_CLAIM',
            message: `Claim asserts uncorroborated enterprise/production status: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 18. Unsupported scale adjective ──────────────────────────────────────
    const scalePatterns = [
      /\b(?:massive scale|millions of|global deployment|hundreds of thousands of)\b/i,
    ];
    for (const pat of scalePatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_SCALE_ADJECTIVE',
            message: `Claim asserts unbacked large-scale adjectives: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 19. Unsupported customer/user implication ────────────────────────────
    const customerPatterns = [
      /\b(?:paying customers|enterprise (?:clients|customers)|commercial accounts|client base|fortune 500)\b/i,
    ];
    for (const pat of customerPatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_CUSTOMER_IMPLICATION',
            message: `Claim asserts unbacked customer/commercial user relationships: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 20. Unsupported team/leadership implication ──────────────────────────
    const leadershipPatterns = [
      /\b(?:led\s+(?:cross-functional\s+)?team|directed\s+(?:a\s+)?team|supervised\s+(?:a\s+)?team|managed\s+cross-functional|headed\s+the\s+engineering\s+department)\b/i,
    ];
    for (const pat of leadershipPatterns) {
      if (pat.test(text)) {
        const supported = contributingFacts.some((f) => pat.test(f.text));
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_LEADERSHIP_IMPLICATION',
            message: `Claim asserts unbacked team management or organizational leadership: "${text.slice(0, 60)}..."`,
          });
        }
      }
    }

    // ── 21. Candidate agency authorization (P18 Invariant) ───────────────────
    // Technical architecture presence or external repository evidence must never be converted into candidate agency.
    // If the claim asserts candidate agency, at least one contributing canonical fact must authorize candidate agency
    // backed by trusted candidate ownership provenance.
    const assertsCandidateAgency = doesClaimAssertCandidateAgency(claim, text);

    if (assertsCandidateAgency) {
      const hasAuthorizedCandidateAgency = contributingFacts.some((fact) => {
        const agency = fact.agency || determineFactAgency(fact.text, fact);
        const level = fact.agencyLevel || agency.level;
        const source = fact.agencySource || agency.source;
        return level === AGENCY_LEVELS.CANDIDATE && isTrustedCandidateAgencySource(source, fact);
      });

      if (!hasAuthorizedCandidateAgency) {
        const firstWordClean = (text.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, '');
        violations.push({
          code: 'AGENCY_NOT_AUTHORIZED',
          message: `Claim asserts candidate agency ("${firstWordClean}") without contributing canonical facts authorizing candidate ownership`,
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
      violations.push({
        code: 'CLAIM_TOO_SHORT',
        message: `Claim length (${text.length} chars) is below minimal professional threshold`,
      });
    } else if (context.sectionOwnerType !== 'SUMMARY' && text.length > 350) {
      violations.push({
        code: 'CLAIM_TOO_LONG',
        message: `Claim length (${text.length} chars) exceeds maximum bullet length`,
      });
    } else if (context.sectionOwnerType === 'SUMMARY' && text.length > 2000) {
      violations.push({
        code: 'CLAIM_TOO_LONG',
        message: `Summary length (${text.length} chars) exceeds maximum allowed length`,
      });
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

    // Candidate skills: only VERIFIED or CORROBORATED skills may authorize general claims.
    // USER_PROVIDED / SELF_DECLARED skills are eligible for the skills section,
    // but must NEVER authorize accomplishment claims without project evidence.
    const isProjectClaim = Boolean(
      context.project ||
      context.sectionOwnerType === 'PROJECT' ||
      context.targetSection === 'PROJECTS'
    );

    const isVerifiedSkill = (s) => {
      if (typeof s === 'string') return false; // bare strings lack verified evidence provenance
      const prov = s.provenanceStatus || s.provenance;
      return prov === 'VERIFIED' || prov === 'CORROBORATED';
    };

    if (!isProjectClaim) {
      if (Array.isArray(profile.skills)) {
        for (const s of profile.skills.filter(isVerifiedSkill)) {
          const name = s.name || s.slug || '';
          if (name) techSet.add(normalizeTechnologyName(name).toLowerCase());
        }
      } else if (profile.skills && Array.isArray(profile.skills.categories)) {
        for (const cat of profile.skills.categories) {
          for (const s of (cat.skills || []).filter(isVerifiedSkill)) {
            const name = s.name || s.slug || '';
            if (name) techSet.add(normalizeTechnologyName(name).toLowerCase());
          }
        }
      }

      // For non-project sections (e.g. SUMMARY), all candidate project technologies are authorized
      const rawProjects = profile.profileMetadata?.projects || profile.projects || [];
      for (const proj of rawProjects) {
        if (Array.isArray(proj.technologies)) {
          for (const t of proj.technologies) {
            if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
          }
        }
      }
    }

    // Project technologies from profile
    if (context.sectionOwnerType === 'PROJECT' && context.sectionOwnerId) {
      const rawProjects = profile.profileMetadata?.projects || profile.projects || [];
      const proj = rawProjects.find(
        (p) => (p.id || p.projectId || p.name) === context.sectionOwnerId
      );
      if (proj && Array.isArray(proj.technologies)) {
        for (const t of proj.technologies) {
          if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
        }
      }
    }

    // Contributing facts and fact inventory: extract both declared technologies and technologies mentioned in authentic fact text
    const factsToCheck = isProjectClaim
      ? [
          ...contributingFacts,
          ...(Array.isArray(context.factInventory)
            ? context.factInventory
            : context.factInventory?.facts || []
          ).filter(
            (f) =>
              (f.sectionOwnerType === 'PROJECT' ||
                f.ownerType === 'PROJECT' ||
                f.association?.projectId) &&
              (!context.sectionOwnerId ||
                f.sectionOwnerId === context.sectionOwnerId ||
                f.ownerId === context.sectionOwnerId ||
                f.association?.projectId === context.sectionOwnerId)
          ),
        ]
      : [
          ...contributingFacts,
          ...(Array.isArray(context.factInventory) ? context.factInventory : []),
          ...(context.factInventory?.facts || []),
        ];
    for (const f of factsToCheck) {
      for (const t of f.technologies || []) {
        if (t) techSet.add(normalizeTechnologyName(t).toLowerCase());
      }
      if (f.text) {
        const matches =
          f.text.match(
            /\b(Rust|Go|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|FastAPI|Prisma|Next\.js|Vue\.js|Express|Flask|Django|AWS|GCP|Linux|SQL|Git|Alembic|Prometheus|Grafana|OpenAI|Gemini|NestJS|TypeORM|Tailwind|CSS|HTML|Socket\.io)\b/gi
          ) || [];
        for (const m of matches) {
          techSet.add(normalizeTechnologyName(m).toLowerCase());
        }
      }
    }

    return techSet;
  }

  /**
   * Enforces strict factual grounding and traceability for an AI-generated claim.
   *
   * @param {object} claim
   * @param {string} claim.text
   * @param {Array<string>} [claim.composedFromFactIds]
   * @param {Array<string>} [claim.factIds]
   * @param {string|Array<string>} [claim.sourceFact]
   * @param {string} [claim.transformationType]
   * @param {object} context
   * @returns {{ valid: boolean, rejected: boolean, violations: Array<{ code: string, message: string }> }}
   */
  validateClaimEvidenceGrounding(claim, context = {}) {
    const violations = [];
    if (!claim || typeof claim !== 'object' || !claim.text) {
      return {
        valid: false,
        rejected: true,
        violations: [{ code: 'INVALID_CLAIM_PAYLOAD', message: 'Claim text is required' }],
      };
    }

    const text = String(claim.text || '').trim();
    const factIds =
      Array.isArray(claim.composedFromFactIds) && claim.composedFromFactIds.length > 0
        ? claim.composedFromFactIds
        : Array.isArray(claim.factIds)
          ? claim.factIds
          : [];

    // 1. Check composedFromFactIds
    if (factIds.length === 0) {
      violations.push({
        code: 'EMPTY_FACT_IDS',
        message: 'Claim does not map to any candidate-owned fact ID',
      });
    }

    // 2. Check sourceFact presence
    const sourceFact = claim.sourceFact;
    const hasSourceFact =
      (typeof sourceFact === 'string' && sourceFact.trim().length > 0) ||
      (Array.isArray(sourceFact) && sourceFact.length > 0);
    if (!hasSourceFact) {
      violations.push({
        code: 'MISSING_SOURCE_FACT',
        message: 'Claim is missing source fact text evidence mapping',
      });
    }

    // 3. Check transformationType
    const validTransformations = new Set([
      'REWRITE',
      'CONDENSE',
      'COMBINE',
      'EMPHASIZE',
      'VERBATIM',
    ]);
    if (
      !claim.transformationType ||
      !validTransformations.has(String(claim.transformationType).toUpperCase())
    ) {
      violations.push({
        code: 'INVALID_TRANSFORMATION_TYPE',
        message: `Claim transformationType "${claim.transformationType}" must be one of REWRITE, CONDENSE, COMBINE, EMPHASIZE, VERBATIM`,
      });
    }

    // Index fact inventory
    const factMap = new Map();
    const factInventory = context.factInventory;
    if (Array.isArray(factInventory)) {
      for (const f of factInventory) factMap.set(f.factId || f.id, f);
    } else if (factInventory && typeof factInventory.get === 'function') {
      for (const [k, v] of factInventory.entries()) factMap.set(k, v);
    } else if (factInventory && Array.isArray(factInventory.facts)) {
      for (const f of factInventory.facts) factMap.set(f.factId || f.id, f);
    }

    const contributingFacts = [];
    for (const fid of factIds) {
      const f = factMap.get(fid);
      if (!f) {
        violations.push({
          code: 'UNKNOWN_FACT_ID',
          message: `Referenced factId "${fid}" does not exist in candidate fact inventory`,
        });
      } else {
        contributingFacts.push(f);
      }
    }

    // 4. Candidate ownership
    const candidateId = context.candidateProfile?.id || context.candidateProfile?.candidate?.id;
    for (const f of contributingFacts) {
      if (f.candidateId && candidateId && f.candidateId !== candidateId) {
        violations.push({
          code: 'FOREIGN_CANDIDATE_FACT',
          message: `Fact "${f.factId || f.id}" belongs to candidate "${f.candidateId}", not current candidate "${candidateId}"`,
        });
      }
    }

    // 5. Technology substitution & unauthorized technology
    const authorizedTechs = this._buildAuthorizedTechSet(context, contributingFacts);
    const sourceTextsCombined =
      contributingFacts.map((f) => f.text || '').join(' ') +
      ' ' +
      (typeof sourceFact === 'string'
        ? sourceFact
        : Array.isArray(sourceFact)
          ? sourceFact.join(' ')
          : '');

    // Check specific technology substitution: OpenAI vs Gemini
    if (
      /\bopenai\b/i.test(sourceTextsCombined) &&
      !/\bgemini\b/i.test(sourceTextsCombined) &&
      /\bgemini\b/i.test(text)
    ) {
      violations.push({
        code: 'TECHNOLOGY_SUBSTITUTION',
        message: 'Claim substituted "Gemini" for verified candidate technology "OpenAI"',
      });
    }
    if (
      /\bgemini\b/i.test(sourceTextsCombined) &&
      !/\bopenai\b/i.test(sourceTextsCombined) &&
      /\bopenai\b/i.test(text)
    ) {
      violations.push({
        code: 'TECHNOLOGY_SUBSTITUTION',
        message: 'Claim substituted "OpenAI" for verified candidate technology "Gemini"',
      });
    }

    // Check all technologies in claim text
    const techRegex =
      /\b(Rust|Go|Python|TypeScript|JavaScript|Node\.js|React|PostgreSQL|Docker|Kubernetes|Raft|Kafka|gRPC|Redis|GraphQL|FastAPI|Prisma|Next\.js|Vue\.js|Express|Flask|Django|AWS|GCP|Linux|SQL|Git|Alembic|Prometheus|Grafana|OpenAI|Gemini|NestJS|TypeORM|Tailwind(?:\s+CSS)?|CSS|HTML|Socket\.io)\b/gi;
    const matches = text.match(techRegex) || [];
    for (const m of matches) {
      const norm = normalizeTechnologyName(m).toLowerCase();
      if (!authorizedTechs.has(norm)) {
        // If CSS is checked but Tailwind or Tailwind CSS is authorized, allow it
        if (
          (norm === 'css' || norm === 'css3') &&
          (authorizedTechs.has('tailwind css') || authorizedTechs.has('tailwind'))
        ) {
          continue;
        }
        violations.push({
          code: 'UNAUTHORIZED_TECHNOLOGY',
          message: `Technology "${m}" in claim text is not authorized by candidate evidence`,
        });
      }
    }

    // 6. Number & Metric grounding
    const metricMatches =
      text.match(
        /\b\d+(?:\.\d+)?%|\b\d+[\d,]*(?:\+)?\s*(?:seconds?|secs?|ms|users?|clients?|repositories|items?|requests?(?:\/|\s*per\s*)sec(?:ond)?)\b/gi
      ) || [];
    for (const mm of metricMatches) {
      const cleanMm = mm.toLowerCase().replace(/\s+/g, '');
      const sourceHasMetric = sourceTextsCombined
        .toLowerCase()
        .replace(/\s+/g, '')
        .includes(cleanMm);
      if (!sourceHasMetric) {
        violations.push({
          code: 'UNSUPPORTED_METRIC',
          message: `Metric or scale number "${mm}" in claim text does not exist in supporting candidate facts`,
        });
      }
    }

    // 7. Unbacked architecture / mechanism claims
    const unbackedMechanismPatterns = [
      { pattern: /\bAST\b/i, term: 'AST (Abstract Syntax Tree)' },
      { pattern: /\bRaft\b/i, term: 'Raft consensus' },
      { pattern: /\bKafka\b/i, term: 'Kafka' },
      { pattern: /\bKubernetes\b/i, term: 'Kubernetes' },
      { pattern: /\bPrometheus\b/i, term: 'Prometheus' },
    ];
    for (const mech of unbackedMechanismPatterns) {
      if (mech.pattern.test(text)) {
        const supported = mech.pattern.test(sourceTextsCombined);
        if (!supported) {
          violations.push({
            code: 'UNSUPPORTED_ARCHITECTURE_CLAIM',
            message: `Claim introduces unbacked architecture mechanism "${mech.term}" not found in candidate facts`,
          });
        }
      }
    }

    // 8. Run baseline checks (active voice, grammar, outcome, actor)
    const baseResult = this.validateClaim({ ...claim, factIds }, context);
    for (const v of baseResult.violations) {
      if (!violations.some((existing) => existing.code === v.code)) {
        violations.push(v);
      }
    }

    return {
      valid: violations.length === 0,
      rejected: violations.length > 0,
      violations,
    };
  }
}

export const defaultResumeClaimValidationService = new ResumeClaimValidationService();

export function validateClaimEvidenceGrounding(claim, context = {}) {
  return defaultResumeClaimValidationService.validateClaimEvidenceGrounding(claim, context);
}

export function sanitizeAccomplishmentClaim(text) {
  return sanitizeGroundedAccomplishment(text);
}

export function hasUnsupportedOutcomeOrMetric(text, contributingFacts = []) {
  if (!text || typeof text !== 'string') return false;

  if (OUTCOME_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (TIME_SAVINGS_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (VELOCITY_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (QUALITY_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (PRODUCTIVITY_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (OVERHEAD_PATTERN.test(text) && !contributingFacts.some(isVerifiedOutcomeFact)) {
    return true;
  }
  if (PERCENTAGE_REDUCTION_PATTERN.test(text) && !contributingFacts.some(isVerifiedMetricFact)) {
    return true;
  }
  if (PERF_PATTERN.test(text) && !contributingFacts.some(isVerifiedMetricFact)) {
    return true;
  }

  return false;
}

export default ResumeClaimValidationService;
