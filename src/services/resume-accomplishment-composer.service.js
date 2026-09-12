/**
 * @file Professional Accomplishment Composition Service (Phase 16 Architecture).
 *
 * Consumes the canonical fact inventory (NEVER raw candidate arrays) and
 * composes professional, evidence-grounded accomplishment bullets:
 *
 *   canonical facts
 *     -> unsupported-claim gate
 *     -> semantic dimension clustering (architecture / implementation / outcome / etc.)
 *     -> multi-fact compound narrative synthesis (Action + Object + Method + Result)
 *     -> semantic redundancy enforcement (pairwise overlap >= 0.50 rejected)
 *     -> capacity-faithful selection (1–3 bullets per project, evidence-driven)
 *     -> single unified composition authority
 *
 * Non-negotiable invariants:
 * 1. NEVER invents metrics, users, scale, performance, teams, revenue, outcomes.
 * 2. Presence evidence contributes technology clauses only, never claims.
 * 3. Bullet text is composed exclusively from candidate-supported fact text.
 * 4. Deterministic: same inputs → same bullets, independent of source order.
 * 5. Consecutive bullets for the same project express different semantic dimensions.
 * 6. Experience bullets preserve candidate truth while favoring accomplishment/implementation.
 */

import { calculateTokenOverlap, toEvidenceReference, assertMetricSafety, validateRephrasingSafety } from './resume-content-strategy.service.js';
import { calculateFactSemanticOverlap } from './candidate-artifact-content.service.js';
import { ValidationError } from '../errors/index.js';
import { defaultResumeClaimPlannerService, ResumeClaimPlannerService } from './resume-claim-planner.service.js';
import { defaultResumeClaimValidationService, ResumeClaimValidationService } from './resume-claim-validation.service.js';
import { AiTaskTypeSchema } from '../domain/ai/ai.schemas.js';
import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import { OMISSION_REASONS } from './candidate-fact-inventory.service.js';

/** Max bullets per project (universal professional ceiling). */
export const MAX_BULLETS_PER_PROJECT = 3;

/** Pairwise semantic-overlap threshold above which two bullets are redundant. */
export const REDUNDANCY_OVERLAP_THRESHOLD = 0.50;

/** Experience bullet types. */
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
 * Normalizes whitespace and unicode punctuation without altering content.
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

/**
 * Safe, meaning-preserving phrase replacements for generated/project bullets.
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
 * Generated-summary boilerplate mappings for professional summary polishing.
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
 * Synthesizes a cohesive professional engineering accomplishment from complementary canonical facts.
 * Avoids crude semicolon concatenation and robotic "featuring X stack" tails.
 * Supports both string arguments and canonical fact objects.
 *
 * @param {string|object} primaryArg Primary fact text or fact object
 * @param {string|object|null} [complementaryArg=null] Secondary fact text or fact object
 * @param {Array<string>} [projectTechnologies=[]] Available technologies for natural integration
 * @returns {string|object} Cohesive professional narrative (or narrative object with provenance)
 */
export function synthesizeAccomplishmentNarrative(
  primaryArg,
  complementaryArg = null,
  projectTechnologies = []
) {
  const isObjectCall = typeof primaryArg === 'object' && primaryArg !== null;
  const primaryText = isObjectCall ? (primaryArg.text || '') : String(primaryArg || '');
  const complementaryText =
    typeof complementaryArg === 'object' && complementaryArg !== null
      ? (complementaryArg.text || '')
      : (complementaryArg ? String(complementaryArg) : null);

  let primary = normalizeWhitespace(stripTrailingPeriod(primaryText));
  primary = compressProfessionalBullet(primary);

  let synthesized = '';
  if (!complementaryText) {
    synthesized = `${sentenceCase(primary)}.`;
  } else {
    let comp = normalizeWhitespace(stripTrailingPeriod(complementaryText));
    comp = compressProfessionalBullet(comp);

    // If complementary fact is already mostly covered in primary, avoid stutter
    if (calculateFactSemanticOverlap(primary, comp) >= 0.50) {
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
        else if (/^(?:raft|kafka|grpc|redis|postgresql|docker|kubernetes|jwt|oauth|real-time|zero-downtime|distributed|high-throughput)\b/i.test(comp)) {
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
        evidenceRefs.push({ factId: f.id || f.factId, sourceRef: f.id || f.factId, sourceType: 'USER_PROVIDED' });
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

/**
 * Determines the maximum defensible bullet capacity for a project from its canonical facts.
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
 * Selects the strongest complementary fact set for N bullets.
 *
 * @private
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

  // Pass 2: fill remaining slots with any unused fact
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
 * Composes one professional bullet from a fact group (1–2 facts) via narrative synthesis.
 *
 * @private
 */
function composeBulletFromGroup(group, project, allowTechClause, mentionedTechs) {
  const primary = group[0];
  const complementary = group[1];

  const narrative = synthesizeAccomplishmentNarrative(
    primary.text,
    complementary ? complementary.text : null,
    project?.technologies || []
  );

  return narrative;
}

/**
 * Composes professional accomplishment bullets for a project from its canonical facts.
 *
/**
 * Composes professional accomplishment bullets for a project from its canonical facts.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Canonical scored facts for this project (claim facts)
 * @param {object} params.project Canonical project record (technologies, name)
 * @param {object} [params.jobPosting] Target job
 * @param {number|null} [params.explicitBudget] Optimizer bullet override
 * @param {object} [params.candidateProfile] Candidate profile
 * @param {object} [params.options] Optional configuration
 * @returns {{ bullets: Array<{ text: string, evidenceRefs: Array, matchedRequirementIds: Array, provenanceStatus: string, composedFromFactIds: Array<string> }>, omittedFacts: Array<{ factId: string, text: string, reason: string }>, capacity: object }}
 */
export function composeProfessionalProjectBullets({
  facts,
  project,
  jobPosting = null,
  explicitBudget = null,
  candidateProfile = null,
  options = {},
}) {
  const allFacts = Array.isArray(facts) ? facts : [];

  // Unsupported-metric gate
  const supportedFacts = [];
  const omittedFacts = [];
  for (const f of allFacts) {
    if (!isClaimFact(f)) continue;
    if (isUnsupportedMetricFact(f)) {
      omittedFacts.push({
        factId: f.factId || f.id,
        text: f.text,
        reason: 'UNSUPPORTED_METRIC',
      });
    } else {
      supportedFacts.push(f);
    }
  }

  const evidenceCount =
    project?.evidenceCount ?? (Array.isArray(project?.evidence) ? project.evidence.length : 0);
  const capacity = determineProjectBulletCapacity({
    claimFacts: supportedFacts,
    evidenceCount,
    explicitBudget,
  });

  // Step 1: Structured Claim Planning before language realization
  const planResult = defaultResumeClaimPlannerService.planClaims({
    facts: supportedFacts,
    ownerType: 'PROJECT',
    ownerId: project?.id || project?.projectId || project?.name || 'unknown-project',
    jobPosting,
    targetBullets: capacity.capacity,
    globallyUsedFactIds: options?.globallyUsedFactIds || new Set(),
  });

  const plannedClaims = planResult.plannedClaims || [];
  if (Array.isArray(planResult.omittedFacts)) {
    for (const om of planResult.omittedFacts) {
      if (!omittedFacts.some((o) => o.factId === om.factId)) {
        omittedFacts.push({
          factId: om.factId,
          text: om.text,
          reason: om.reason || 'LOW_INFORMATION_VALUE',
        });
      }
    }
  }

  const bullets = [];
  const usedFactIds = new Set();

  if (plannedClaims.length > 0) {
    for (const planned of plannedClaims) {
      const primaryFact = planned.primaryFact;
      const compFact = planned.complementaryFacts?.[0] || null;

      const narrativeResult = synthesizeAccomplishmentNarrative(
        primaryFact,
        compFact,
        project?.technologies || []
      );

      const text = typeof narrativeResult === 'object' ? narrativeResult.text : String(narrativeResult);
      const composedFromFactIds = Array.isArray(planned.factIds) && planned.factIds.length > 0
        ? planned.factIds
        : (typeof narrativeResult === 'object' ? narrativeResult.composedFromFactIds : [primaryFact?.factId || primaryFact?.id].filter(Boolean));

      // Step 2: Claim Validation Check
      const validationResult = defaultResumeClaimValidationService.validateClaim(
        {
          claimId: planned.claimId,
          text,
          factIds: composedFromFactIds,
          semanticDimensions: planned.semanticDimensions || [],
          metricsUsed: planned.allowedMetrics || [],
          technologiesUsed: planned.requiredTechnologies || [],
        },
        {
          factInventory: allFacts,
          candidateProfile,
          sectionOwnerType: 'PROJECT',
          sectionOwnerId: project?.id || project?.projectId || project?.name,
          alreadyRenderedClaims: bullets,
          project,
        }
      );

      if (!validationResult.valid) {
        omittedFacts.push({
          factId: composedFromFactIds[0] || 'unknown',
          text,
          reason: validationResult.violations?.[0]?.code || 'FAILED_CLAIM_VALIDATION',
        });
        continue;
      }

      // Check redundancy with accepted bullets
      const isRedundant = bullets.some(
        (kept) => calculateFactSemanticOverlap(kept.text, text) >= REDUNDANCY_OVERLAP_THRESHOLD
      );

      if (isRedundant) {
        omittedFacts.push({
          factId: composedFromFactIds[0] || 'unknown',
          text,
          reason: 'SEMANTICALLY_REDUNDANT_WITH_PRIOR_BULLET',
        });
      } else {
        const evidenceRefs = typeof narrativeResult === 'object' && Array.isArray(narrativeResult.evidenceRefs)
          ? narrativeResult.evidenceRefs
          : (primaryFact?.evidenceRefs || []);

        const matchedRequirementIds = [];
        if (Array.isArray(primaryFact?.matchedRequirementIds)) {
          matchedRequirementIds.push(...primaryFact.matchedRequirementIds);
        }
        if (Array.isArray(compFact?.matchedRequirementIds)) {
          for (const rid of compFact.matchedRequirementIds) {
            if (!matchedRequirementIds.includes(rid)) matchedRequirementIds.push(rid);
          }
        }

        bullets.push({
          text,
          evidenceRefs,
          matchedRequirementIds,
          provenanceStatus: primaryFact?.provenance || 'VERIFIED',
          composedFromFactIds,
          semanticDimensions: planned.semanticDimensions || (primaryFact?.semanticTopic ? [primaryFact.semanticTopic] : []),
        });

        for (const fid of composedFromFactIds) usedFactIds.add(fid);
      }
    }
  }

  // Safety fallback if planner yielded 0 bullets from available supported facts
  if (bullets.length === 0 && supportedFacts.length > 0) {
    const factGroups = selectComplementaryFactGroups(supportedFacts, capacity.capacity);
    const mentionedTechs = new Set();
    for (const group of factGroups) {
      const text = composeBulletFromGroup(group, project, true, mentionedTechs);
      const composedFromFactIds = group.map((f) => f.factId || f.id).filter(Boolean);

      const isRedundant = bullets.some(
        (kept) => calculateFactSemanticOverlap(kept.text, text) >= REDUNDANCY_OVERLAP_THRESHOLD
      );

      if (!isRedundant) {
        const evidenceRefs = [];
        const matchedRequirementIds = [];
        let provenanceStatus = 'VERIFIED';

        for (const f of group) {
          if (Array.isArray(f.evidenceRefs)) {
            for (const er of f.evidenceRefs) {
              if (!evidenceRefs.some((x) => x.evidenceId === er.evidenceId)) evidenceRefs.push(er);
            }
          }
          if (Array.isArray(f.matchedRequirementIds)) {
            for (const rid of f.matchedRequirementIds) {
              if (!matchedRequirementIds.includes(rid)) matchedRequirementIds.push(rid);
            }
          }
          if (f.provenance === 'CLAIMED' || f.provenance === 'USER_PROVIDED') {
            provenanceStatus = f.provenance;
          }
        }

        bullets.push({
          text,
          evidenceRefs,
          matchedRequirementIds,
          provenanceStatus,
          composedFromFactIds,
          semanticDimensions: group.map((f) => f.semanticTopic).filter(Boolean),
        });
        for (const fid of composedFromFactIds) usedFactIds.add(fid);
      }
    }
  }

  // Record omitted claim facts that were not consumed
  for (const f of supportedFacts) {
    const fid = f.factId || f.id;
    if (!usedFactIds.has(fid) && !omittedFacts.some((o) => o.factId === fid)) {
      omittedFacts.push({
        factId: fid,
        text: f.text,
        reason: 'CAPACITY_BUDGET_EXCEEDED_BY_HIGHER_RELEVANCE_FACTS',
      });
    }
  }

  return {
    bullets,
    omittedFacts,
    capacity,
  };
}

/**
 * Asynchronous project bullet composition with optional Gemini language realization.
 *
 * @param {object} params
 * @param {Array<object>} params.facts
 * @param {object} params.project
 * @param {object} [params.jobPosting]
 * @param {number|null} [params.explicitBudget]
 * @param {object} [params.aiProvider] AI Provider instance supporting generateText
 * @param {object} [params.candidateProfile]
 * @param {object} [params.options]
 * @returns {Promise<{ bullets: Array<object>, omittedFacts: Array<object>, capacity: object }>}
 */
export async function composeProfessionalProjectBulletsAsync({
  facts,
  project,
  jobPosting = null,
  explicitBudget = null,
  aiProvider = null,
  candidateProfile = null,
  options = {},
}) {
  if (!aiProvider || typeof aiProvider.generateText !== 'function') {
    return composeProfessionalProjectBullets({
      facts,
      project,
      jobPosting,
      explicitBudget,
      candidateProfile,
      options,
    });
  }

  const allFacts = Array.isArray(facts) ? facts : [];
  const supportedFacts = [];
  const omittedFacts = [];
  for (const f of allFacts) {
    if (!isClaimFact(f)) continue;
    if (isUnsupportedMetricFact(f)) {
      omittedFacts.push({ factId: f.factId || f.id, text: f.text, reason: 'UNSUPPORTED_METRIC' });
    } else {
      supportedFacts.push(f);
    }
  }

  const evidenceCount = project?.evidenceCount ?? (Array.isArray(project?.evidence) ? project.evidence.length : 0);
  const capacity = determineProjectBulletCapacity({
    claimFacts: supportedFacts,
    evidenceCount,
    explicitBudget,
  });

  const planResult = defaultResumeClaimPlannerService.planClaims({
    facts: supportedFacts,
    ownerType: 'PROJECT',
    ownerId: project?.id || project?.projectId || project?.name || 'unknown-project',
    jobPosting,
    targetBullets: capacity.capacity,
    globallyUsedFactIds: options?.globallyUsedFactIds || new Set(),
  });

  const plannedClaims = planResult.plannedClaims || [];
  if (Array.isArray(planResult.omittedFacts)) {
    for (const om of planResult.omittedFacts) {
      if (!omittedFacts.some((o) => o.factId === om.factId)) {
        omittedFacts.push({ factId: om.factId, text: om.text, reason: om.reason || 'LOW_INFORMATION_VALUE' });
      }
    }
  }

  const bullets = [];
  const usedFactIds = new Set();

  for (const planned of plannedClaims) {
    const primaryFact = planned.primaryFact;
    const compFact = planned.complementaryFacts?.[0] || null;
    const contributingFacts = [primaryFact, compFact].filter(Boolean);

    let realizedText = null;
    let realizationSource = 'deterministic';

    try {
      const policy = getPromptPolicy(AiTaskTypeSchema.enum.RESUME_ACCOMPLISHMENT_SYNTHESIS);
      const envelope = policy.buildEnvelope({
        prompt: `Synthesize a single concise professional engineering bullet statement for project "${project?.name || ''}". Incorporate authorized technologies where natural.`,
        candidateFacts: {
          facts: contributingFacts.map((f) => ({
            factId: f.factId || f.id,
            text: f.text,
            semanticTopic: f.semanticTopic,
            technologies: f.technologies || [],
            metrics: f.metrics || [],
          })),
        },
        jobRequirements: jobPosting?.requirements || [],
      });

      const aiResponse = await aiProvider.generateText({
        taskType: AiTaskTypeSchema.enum.RESUME_ACCOMPLISHMENT_SYNTHESIS,
        systemPrompt: envelope.systemInstruction,
        userPrompt: envelope.contents,
        responseSchema: policy.responseSchema,
      });

      if (aiResponse && aiResponse.text) {
        const candidateValidation = defaultResumeClaimValidationService.validateClaim(
          {
            claimId: planned.claimId,
            text: aiResponse.text,
            factIds: planned.factIds,
            semanticDimensions: planned.semanticDimensions || [],
            metricsUsed: aiResponse.metricsUsed || planned.allowedMetrics || [],
            technologiesUsed: aiResponse.technologiesUsed || planned.requiredTechnologies || [],
          },
          {
            factInventory: allFacts,
            candidateProfile,
            sectionOwnerType: 'PROJECT',
            sectionOwnerId: project?.id || project?.projectId || project?.name,
            alreadyRenderedClaims: bullets,
            project,
          }
        );

        if (candidateValidation.valid) {
          realizedText = aiResponse.text;
          realizationSource = 'gemini';
        }
      }
    } catch {
      // Graceful fallback to deterministic realization on AI failure or timeout
    }

    if (!realizedText) {
      const fallbackResult = synthesizeAccomplishmentNarrative(
        primaryFact,
        compFact,
        project?.technologies || []
      );
      realizedText = typeof fallbackResult === 'object' ? fallbackResult.text : String(fallbackResult);
    }

    const composedFromFactIds = Array.isArray(planned.factIds) && planned.factIds.length > 0
      ? planned.factIds
      : [primaryFact?.factId || primaryFact?.id].filter(Boolean);

    // Final validation gate before acceptance
    const validation = defaultResumeClaimValidationService.validateClaim(
      {
        claimId: planned.claimId,
        text: realizedText,
        factIds: composedFromFactIds,
        semanticDimensions: planned.semanticDimensions || [],
        metricsUsed: planned.allowedMetrics || [],
        technologiesUsed: planned.requiredTechnologies || [],
      },
      {
        factInventory: allFacts,
        candidateProfile,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: project?.id || project?.projectId || project?.name,
        alreadyRenderedClaims: bullets,
        project,
      }
    );

    if (!validation.valid) {
      omittedFacts.push({
        factId: composedFromFactIds[0] || 'unknown',
        text: realizedText,
        reason: validation.violations?.[0]?.code || 'FAILED_CLAIM_VALIDATION',
      });
      continue;
    }

    const isRedundant = bullets.some(
      (kept) => calculateFactSemanticOverlap(kept.text, realizedText) >= REDUNDANCY_OVERLAP_THRESHOLD
    );

    if (isRedundant) {
      omittedFacts.push({
        factId: composedFromFactIds[0] || 'unknown',
        text: realizedText,
        reason: 'SEMANTICALLY_REDUNDANT_WITH_PRIOR_BULLET',
      });
    } else {
      const evidenceRefs = [];
      for (const f of contributingFacts) {
        if (Array.isArray(f.evidenceRefs)) {
          for (const er of f.evidenceRefs) {
            if (!evidenceRefs.some((x) => x.evidenceId === er.evidenceId)) evidenceRefs.push(er);
          }
        }
      }

      bullets.push({
        text: realizedText,
        evidenceRefs,
        matchedRequirementIds: primaryFact?.matchedRequirementIds || [],
        provenanceStatus: primaryFact?.provenance || 'VERIFIED',
        composedFromFactIds,
        semanticDimensions: planned.semanticDimensions || [],
        realizationSource,
      });

      for (const fid of composedFromFactIds) usedFactIds.add(fid);
    }
  }

  return {
    bullets,
    omittedFacts,
    capacity,
  };
}

/**
 * Classifies an experience bullet into one of the 4 standard types.
 */
export function classifyExperienceBulletType(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(reduced|increased|improved|decreased|accelerated|saved|scaled|achieved|yielding|resulting in)\b/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.OUTCOME;
  }
  if (/\b(architected|designed|spearheaded|engineered|built|refactored|pioneered)\b/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.ACCOMPLISHMENT;
  }
  if (/\b(implemented|configured|automated|containerized|deployed|migrated|integrated|tested|debugged)\b/i.test(t)) {
    return EXPERIENCE_BULLET_TYPES.TECHNICAL_IMPLEMENTATION;
  }
  return EXPERIENCE_BULLET_TYPES.RESPONSIBILITY;
}

/**
 * Composes professional experience records without overwriting candidate truth.
 */
export function composeExperienceRecords({ candidateExperiences = [], factInventory = null, jobPosting = null }) {
  if (!Array.isArray(candidateExperiences)) return [];

  return candidateExperiences.map((exp) => {
    const sourceBullets = Array.isArray(exp.bullets) ? exp.bullets : [];
    const presentationCandidates = sourceBullets.map((bullet) => {
      const rawText = typeof bullet === 'string' ? bullet : bullet?.text || '';
      const polished = compressProfessionalBullet(rawText);
      const bulletType = classifyExperienceBulletType(rawText);
      return {
        text: polished,
        bulletType,
        evidenceRefs: bullet?.evidenceRefs || [],
        matchedRequirementIds: bullet?.matchedRequirementIds || [],
        provenanceStatus: bullet?.provenanceStatus || exp.provenanceStatus || 'USER_PROVIDED',
      };
    });

    return {
      ...exp,
      bullets: presentationCandidates.map((c) => c.text),
      presentationCandidates,
    };
  });
}

/**
 * Composes the DSA / problem-solving section.
 */
export function composeDsaSection({ dsaData = null, factInventory = null, jobPosting = null }) {
  if (!dsaData) return null;

  const profileUrl = dsaData.profileUrl || dsaData.url || null;
  const sourceBullets = Array.isArray(dsaData.bullets) ? dsaData.bullets : [];
  const polishedBullets = sourceBullets.map((b) => compressProfessionalBullet(typeof b === 'string' ? b : b.text));

  return {
    hasSection: Boolean(profileUrl || polishedBullets.length > 0),
    profileUrl,
    bullets: polishedBullets,
    provenanceStatus: 'CLAIMED',
  };
}

/**
 * Composes a grounded professional summary targeting 2–3 concise sentences.
 */
export function composeProfessionalSummary({ summaryText, candidateIdentity = {}, primarySkills = [], jobPosting = null }) {
  const polished = polishProfessionalSummary(summaryText);
  return {
    text: polished,
    targetRole: jobPosting?.title || 'Software Engineer',
    evidenceRefs: [],
  };
}

/**
 * Canonical preference order used when a populated protected section is missing from sectionOrder.
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

function _dedupeSkillsPresentation(doc) {
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
        `Composition violated protected-content invariant: ${label} data was modified`
      );
    }
  }
}

/**
 * Single authoritative composition entry point for structured resume documents.
 *
 * @param {object} structuredResumeDocument
 * @returns {object}
 */
export function composeStructuredResumeDocument(structuredResumeDocument) {
  if (!structuredResumeDocument || typeof structuredResumeDocument !== 'object') {
    throw new ValidationError(
      'composeStructuredResumeDocument requires a StructuredResumeDocument object'
    );
  }

  const composed = JSON.parse(JSON.stringify(structuredResumeDocument));

  // 1. Summary polish
  if (composed.summary && typeof composed.summary.text === 'string') {
    const polished = polishProfessionalSummary(composed.summary.text);
    if (polished && polished.length > 0 && polished !== composed.summary.text) {
      try {
        assertMetricSafety(polished, composed.summary.evidenceRefs || [], {
          sourceText: composed.summary.text,
        });
        composed.summary = { ...composed.summary, text: polished };
      } catch {
        // Metric safety fallback: keep original
      }
    }
  }

  // 2. Project bullet compression
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
              assertMetricSafety(compressed, bullet.evidenceRefs || [], {
                sourceText: bullet.text,
              });
              validateRephrasingSafety(bullet.text, compressed, {
                skills: composed.skills?.categories?.flatMap((c) => c.skills || []) || [],
                projects: composed.projects || [],
              });
              return { ...bullet, text: compressed };
            } catch {
              return bullet;
            }
          })
        : project.bullets,
    }));
  }

  // 3. Skills presentation cleanup
  _dedupeSkillsPresentation(composed);

  // 4. Section-order integrity
  const composedWithOrder = ensureCandidateSectionIntegrity(composed);

  // 5. Fail-closed verification
  _verifyProtectedSectionsUnchanged(structuredResumeDocument, composedWithOrder);

  return composedWithOrder;
}

export default composeStructuredResumeDocument;
