/**
 * @file Professional Accomplishment Composition Service (P18 Architecture).
 *
 * Consumes the canonical fact inventory (NEVER raw candidate arrays) and
 * composes professional, evidence-grounded accomplishment bullets:
 *
 *   canonical facts
 *     -> unsupported-claim gate
 *     -> claim planning & PAR model (Action + Object + Method + Purpose/Result)
 *     -> Gemini structured language realization with fail-closed validation
 *     -> deterministic PAR fallback realization
 *     -> semantic redundancy enforcement (pairwise overlap >= 0.50 rejected)
 *     -> capacity-faithful selection (1–3 bullets per project, evidence-driven)
 *     -> dynamic job-adaptive summary composition
 *     -> single unified composition authority
 *
 * Non-negotiable invariants:
 * 1. NEVER invents metrics, users, scale, performance, teams, revenue, outcomes.
 * 2. Presence evidence contributes technology clauses only, never claims.
 * 3. Bullet text is composed exclusively from candidate-supported fact text.
 * 4. Deterministic: same inputs → same bullets, independent of source order.
 * 5. Consecutive bullets for the same project express different semantic dimensions.
 * 6. Experience bullets preserve candidate truth while favoring accomplishment/implementation.
 * 7. ZERO circular dependencies: leaf primitives live in resume-composition-primitives.js.
 */

import { ValidationError } from '../errors/index.js';
import { composeSourceGroundedSummary } from './source-grounded-summary.service.js';
import { defaultResumeClaimPlannerService } from './resume-claim-planner.service.js';
import { defaultResumeClaimValidationService } from './resume-claim-validation.service.js';
import { AiTaskTypeSchema } from '../domain/ai/ai.schemas.js';
import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import {
  OMISSION_REASONS,
  isAccomplishmentCandidate,
  getJobRequirementConcepts,
} from './candidate-fact-inventory.service.js';

// Import and re-export all primitives for local use and 100% backward-compatibility
import {
  calculateFactSemanticOverlap,
  MAX_BULLETS_PER_PROJECT,
  REDUNDANCY_OVERLAP_THRESHOLD,
  EXPERIENCE_BULLET_TYPES,
  MEASURED_CONTEXT_PATTERN,
  normalizeWhitespace,
  sentenceCase,
  lowerFirst,
  stripTrailingPeriod,
  compressProfessionalBullet,
  polishProfessionalSummary,
  isUnsupportedMetricFact,
  isClaimFact,
  determineProjectBulletCapacity,
  classifyExperienceBulletType,
  ensureCandidateSectionIntegrity,
  dedupeSkillsPresentation,
  verifyProtectedSectionsUnchanged,
  synthesizeAccomplishmentNarrative,
  toEvidenceReference,
  assertMetricSafety,
  validateRephrasingSafety,
  calculateTokenOverlap,
  splitSentences,
} from './resume-composition-primitives.js';

export {
  MAX_BULLETS_PER_PROJECT,
  REDUNDANCY_OVERLAP_THRESHOLD,
  EXPERIENCE_BULLET_TYPES,
  MEASURED_CONTEXT_PATTERN,
  normalizeWhitespace,
  sentenceCase,
  lowerFirst,
  stripTrailingPeriod,
  compressProfessionalBullet,
  polishProfessionalSummary,
  isUnsupportedMetricFact,
  isClaimFact,
  determineProjectBulletCapacity,
  classifyExperienceBulletType,
  ensureCandidateSectionIntegrity,
  dedupeSkillsPresentation,
  verifyProtectedSectionsUnchanged,
  synthesizeAccomplishmentNarrative,
  toEvidenceReference,
  assertMetricSafety,
  validateRephrasingSafety,
  calculateTokenOverlap,
  splitSentences,
};

/**
 * Selects the strongest complementary fact set for N bullets.
 *
 * @private
 */
function selectComplementaryFactGroups(facts, n) {
  if (n <= 0 || facts.length === 0) return [];

  // P19-consolidation: Only candidate-authorized accomplishment facts can anchor bullets.
  // This ensures selectComplementaryFactGroups and the claim planner agree on ownership.
  const authorizedFacts = facts.filter((f) =>
    isAccomplishmentCandidate(f.renderable === undefined ? { ...f, renderable: true } : f)
  );
  if (authorizedFacts.length === 0) return [];

  const sorted = [...authorizedFacts].sort(
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
function composeBulletFromGroup(group, project, _allowTechClause, _mentionedTechs) {
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
 * @param {object} params
 * @param {Array<object>} params.facts Canonical scored facts for this project (claim facts)
 * @param {object} params.project Canonical project record (technologies, name)
 * @param {object} [params.jobPosting] Target job
 * @param {number|null} [params.explicitBudget] Optimizer bullet override
 * @param {object} [params.candidateProfile] Candidate profile
 * @param {object} [params.options] Optional configuration
 * @returns {{ bullets: Array<{ text: string, evidenceRefs: Array, matchedRequirementIds: Array, provenanceStatus: string, composedFromFactIds: Array<string> }>, omittedFacts: Array<{ factId: string, text: string, reason: string }>, capacity: object }}
 */
/**
 * Shared claim processing and planning engine for project narrative composition.
 * Ensures identical preprocessing, unsupported-metric filtering, capacity determination,
 * and claim planning between synchronous and asynchronous composition pathways.
 *
 * @private
 */
function prepareProjectNarrativePlan({
  facts,
  project,
  jobPosting = null,
  explicitBudget = null,
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
        reason: OMISSION_REASONS.UNSUPPORTED_METRIC,
      });
    } else {
      supportedFacts.push(f);
    }
  }

  // P19-consolidation: Use ONLY authorized candidate accomplishment facts for capacity.
  // Repository descriptions and passive features must not inflate bullet capacity.
  const authorizedCandidateFacts = supportedFacts.filter((f) =>
    isAccomplishmentCandidate(f.renderable === undefined ? { ...f, renderable: true } : f)
  );

  const evidenceCount =
    project?.evidenceCount ?? (Array.isArray(project?.evidence) ? project.evidence.length : 0);
  const capacity = determineProjectBulletCapacity({
    claimFacts: authorizedCandidateFacts,
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
          reason: om.reason || OMISSION_REASONS.LOW_INFORMATION_VALUE,
          selectedAlternative: om.selectedAlternative || null,
        });
      }
    }
  }

  return {
    allFacts,
    supportedFacts,
    omittedFacts,
    capacity,
    plannedClaims,
  };
}

/**
 * Validates, deduplicates, and assembles a realized claim into the bullets array.
 * Enforces fail-closed validation, semantic redundancy rejection, evidence aggregation,
 * and requirement trace attachment.
 *
 * @private
 */
function assembleRealizedClaim({
  planned,
  realizedText,
  realizationSource = 'deterministic',
  allFacts,
  candidateProfile,
  project,
  bullets,
  omittedFacts,
  usedFactIds,
}) {
  const primaryFact = planned.primaryFact;
  const compFact = planned.complementaryFacts?.[0] || null;
  const contributingFacts = [primaryFact, compFact].filter(Boolean);

  const composedFromFactIds =
    Array.isArray(planned.factIds) && planned.factIds.length > 0
      ? planned.factIds
      : [primaryFact?.factId || primaryFact?.id].filter(Boolean);

  // Claim Validation Check across 20 invariants
  const validationResult = defaultResumeClaimValidationService.validateClaim(
    {
      claimId: planned.claimId,
      text: realizedText,
      factIds: composedFromFactIds,
      semanticDimensions: planned.semanticDimensions || [],
      metricsUsed: planned.allowedMetrics || [],
      technologiesUsed: planned.technologies || [],
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
      text: realizedText,
      reason: validationResult.violations?.[0]?.code || OMISSION_REASONS.VALIDATION_REJECTION,
    });
    return false;
  }

  // Check redundancy with accepted bullets
  const isRedundant = bullets.some(
    (kept) => calculateFactSemanticOverlap(kept.text, realizedText) >= REDUNDANCY_OVERLAP_THRESHOLD
  );

  if (isRedundant) {
    omittedFacts.push({
      factId: composedFromFactIds[0] || 'unknown',
      text: realizedText,
      reason: OMISSION_REASONS.REDUNDANCY_REMOVAL,
    });
    return false;
  }

  const evidenceRefs = [];
  for (const f of contributingFacts) {
    if (Array.isArray(f.evidenceRefs)) {
      for (const er of f.evidenceRefs) {
        if (!evidenceRefs.some((x) => (x.evidenceId || x.id) === (er.evidenceId || er.id))) {
          evidenceRefs.push(er);
        }
      }
    }
  }

  const matchedRequirementIds = [];
  for (const f of contributingFacts) {
    if (Array.isArray(f.matchedRequirementIds)) {
      for (const rid of f.matchedRequirementIds) {
        if (!matchedRequirementIds.includes(rid)) matchedRequirementIds.push(rid);
      }
    }
  }

  bullets.push({
    text: realizedText,
    evidenceRefs,
    matchedRequirementIds,
    provenanceStatus: primaryFact?.provenance || 'CLAIMED',
    composedFromFactIds,
    semanticDimensions:
      planned.semanticDimensions || (primaryFact?.semanticTopic ? [primaryFact.semanticTopic] : []),
    realizationSource,
  });

  for (const fid of composedFromFactIds) usedFactIds.add(fid);
  return true;
}

/**
 * Executes fallback groups when planned claims yielded 0 bullets and records capacity omissions.
 *
 * @private
 */
function finalizeProjectBullets({
  bullets,
  supportedFacts,
  capacity,
  project,
  omittedFacts,
  usedFactIds,
  candidateProfile = null,
  allFacts = null,
  plannedClaims = [],
}) {
  // P19-consolidation: Safety fallback — if planner yielded 0 bullets, use
  // selectComplementaryFactGroups which is now filtered through
  // isAccomplishmentCandidate, ensuring planner and fallback agree on ownership.
  // This path ONLY fires when the primary planner realization path produced
  // zero bullets AND authorized candidate accomplishment facts still exist.
  if (bullets.length === 0 && supportedFacts.length > 0) {
    const factGroups = selectComplementaryFactGroups(supportedFacts, capacity.capacity);
    for (const group of factGroups) {
      const primaryFact = group[0];
      const compFact = group[1] || null;
      const narrativeResult = synthesizeAccomplishmentNarrative(
        primaryFact,
        compFact,
        project?.technologies || []
      );
      const text =
        typeof narrativeResult === 'object' ? narrativeResult.text : String(narrativeResult);
      const composedFromFactIds = group.map((f) => f.factId || f.id).filter(Boolean);

      const fallbackPlanned = {
        claimId: `fallback-claim-${primaryFact.factId || primaryFact.id}`,
        primaryFact,
        complementaryFacts: compFact ? [compFact] : [],
        factIds: composedFromFactIds,
        semanticDimensions: group.map((f) => f.semanticTopic).filter(Boolean),
        allowedMetrics: [],
        technologies: project?.technologies || [],
      };

      plannedClaims.push(fallbackPlanned);

      assembleRealizedClaim({
        planned: fallbackPlanned,
        realizedText: text,
        realizationSource: 'deterministic_fallback',
        allFacts: allFacts || supportedFacts,
        candidateProfile,
        project,
        bullets,
        omittedFacts,
        usedFactIds,
      });
    }
  }

  // Record omitted claim facts that were not consumed
  for (const f of supportedFacts) {
    const fid = f.factId || f.id;
    if (!usedFactIds.has(fid) && !omittedFacts.some((o) => o.factId === fid)) {
      omittedFacts.push({
        factId: fid,
        text: f.text,
        reason: OMISSION_REASONS.CAPACITY_LIMIT,
      });
    }
  }

  return {
    bullets,
    omittedFacts,
    capacity,
    plannedClaims,
  };
}

/**
 * Composes professional accomplishment bullets for a project from its canonical facts.
 * Orchestrates claim planning, single-fact realization, complementation, claim validation,
 * metric safety verification, and omission recording.
 *
 * @param {object} params
 * @param {Array<object>} params.facts Canonical fact objects for this project
 * @param {object} params.project Project metadata (name, technologies, etc.)
 * @param {object} [params.jobPosting] Target job posting for relevance scoring
 * @param {number|null} [params.explicitBudget] Exact bullet budget override from section planner
 * @param {object} [params.candidateProfile] Full candidate profile for global deduplication
 * @param {object} [params.options] Composition options
 * @returns {{ bullets: Array<object>, omittedFacts: Array<object>, capacity: object, plannedClaims: Array<object> }}
 */
export function composeProfessionalProjectBullets({
  facts,
  project,
  jobPosting = null,
  explicitBudget = null,
  candidateProfile = null,
  options = {},
}) {
  const { allFacts, supportedFacts, omittedFacts, capacity, plannedClaims } =
    prepareProjectNarrativePlan({ facts, project, jobPosting, explicitBudget, options });

  const bullets = [];
  const usedFactIds = new Set();

  // Step 2: Language Realization per planned claim
  for (const planned of plannedClaims) {
    const primaryFact = planned.primaryFact;
    const compFact = planned.complementaryFacts?.[0] || null;

    const narrativeResult = synthesizeAccomplishmentNarrative(
      primaryFact,
      compFact,
      project?.technologies || []
    );

    const realizedText =
      typeof narrativeResult === 'object' ? narrativeResult.text : String(narrativeResult);

    assembleRealizedClaim({
      planned,
      realizedText,
      realizationSource: 'deterministic',
      allFacts,
      candidateProfile,
      project,
      bullets,
      omittedFacts,
      usedFactIds,
    });
  }

  return finalizeProjectBullets({
    bullets,
    supportedFacts,
    capacity,
    project,
    omittedFacts,
    usedFactIds,
    candidateProfile,
    allFacts,
    plannedClaims,
  });
}

/**
 * Asynchronous project bullet composition with optional Gemini language realization.
 * Follows the identical claim planning, validation, redundancy checking, and omission
 * recording pipeline as composeProfessionalProjectBullets.
 *
 * @param {object} params
 * @param {Array<object>} params.facts
 * @param {object} params.project
 * @param {object} [params.jobPosting]
 * @param {number|null} [params.explicitBudget]
 * @param {object} [params.aiProvider] AI Provider instance supporting generateText / generateStructured
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

  const { allFacts, supportedFacts, omittedFacts, capacity, plannedClaims } =
    prepareProjectNarrativePlan({ facts, project, jobPosting, explicitBudget, options });

  const bullets = [];
  const usedFactIds = new Set();

  for (const planned of plannedClaims) {
    const primaryFact = planned.primaryFact;
    const compFact = planned.complementaryFacts?.[0] || null;
    const contributingFacts = [primaryFact, compFact].filter(Boolean);

    let realizedText = null;
    const realizationSource = 'deterministic';

    try {
      const policy = getPromptPolicy(AiTaskTypeSchema.enum.RESUME_ACCOMPLISHMENT_SYNTHESIS);
      const envelope = policy.buildEnvelope({
        prompt: `Synthesize a single concise professional engineering bullet statement for project "${project?.name || ''}". Adhere to Action + Engineering Object + Technical Method + Purpose/Result. Incorporate authorized technologies where natural.`,
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
            technologiesUsed: aiResponse.technologiesUsed || planned.technologies || [],
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
          // Citations and heuristic grounding cannot authorize a new statement.
          // Keep deterministic realization until a server claim catalogue exists.
          realizedText = null;
        }
      }
    } catch {
      // Fail-closed: graceful fallback to deterministic realization on AI error or timeout
    }

    if (!realizedText) {
      const fallbackResult = synthesizeAccomplishmentNarrative(
        primaryFact,
        compFact,
        project?.technologies || []
      );
      realizedText =
        typeof fallbackResult === 'object' ? fallbackResult.text : String(fallbackResult);
    }

    assembleRealizedClaim({
      planned,
      realizedText,
      realizationSource,
      allFacts,
      candidateProfile,
      project,
      bullets,
      omittedFacts,
      usedFactIds,
    });
  }

  return finalizeProjectBullets({
    bullets,
    supportedFacts,
    capacity,
    project,
    omittedFacts,
    usedFactIds,
    candidateProfile,
    allFacts,
    plannedClaims,
  });
}

/**
 * Composes professional experience records without overwriting candidate truth.
 */
export function composeExperienceRecords({
  candidateExperiences = [],
  factInventory: _factInventory = null,
  jobPosting = null,
}) {
  if (!Array.isArray(candidateExperiences)) return [];

  const requirementConcepts = jobPosting ? getJobRequirementConcepts(jobPosting) : [];

  return candidateExperiences.map((exp) => {
    const sourceBullets = Array.isArray(exp.bullets) ? exp.bullets : [];
    const presentationCandidates = sourceBullets.map((bullet, originalIndex) => {
      const rawText = typeof bullet === 'string' ? bullet : bullet?.text || '';
      const polished = compressProfessionalBullet(rawText);
      const bulletType = classifyExperienceBulletType(rawText);
      const lower = rawText.toLowerCase();

      // Score against canonical requirement concepts
      const matchedRequirementIds = [];
      let score = 0;

      for (const concept of requirementConcepts) {
        const conceptName = String(concept.normalizedName || '').toLowerCase();
        let matched = false;
        if (conceptName && conceptName.length >= 3 && lower.includes(conceptName)) {
          matched = true;
        } else if (concept.tokens && concept.tokens.size > 0) {
          let tokenMatches = 0;
          for (const token of concept.tokens) {
            if (token.length >= 3 && lower.includes(token)) {
              tokenMatches++;
            }
          }
          if (tokenMatches > 0 && tokenMatches >= Math.min(2, concept.tokens.size)) {
            matched = true;
          }
        }
        if (matched) {
          matchedRequirementIds.push(concept.id);
          score += concept.importance || 1.0;
        }
      }

      return {
        text: polished,
        bulletType,
        evidenceRefs: bullet?.evidenceRefs || [],
        matchedRequirementIds: bullet?.matchedRequirementIds || matchedRequirementIds,
        provenanceStatus: bullet?.provenanceStatus || exp.provenanceStatus || 'USER_PROVIDED',
        jobRelevance: score > 0 ? score : matchedRequirementIds.length,
        originalIndex,
      };
    });

    // P43: Reorder by job relevance descending; break ties using candidate's original authored order
    presentationCandidates.sort(
      (a, b) => b.jobRelevance - a.jobRelevance || a.originalIndex - b.originalIndex
    );

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
export function composeDsaSection({
  dsaData = null,
  factInventory: _factInventory = null,
  jobPosting: _jobPosting = null,
}) {
  if (!dsaData) return null;

  const profileUrl = dsaData.profileUrl || dsaData.url || null;
  const sourceBullets = Array.isArray(dsaData.bullets) ? dsaData.bullets : [];
  const polishedBullets = sourceBullets.map((b) =>
    compressProfessionalBullet(typeof b === 'string' ? b : b.text)
  );

  return {
    hasSection: Boolean(profileUrl || polishedBullets.length > 0),
    profileUrl,
    bullets: polishedBullets,
    provenanceStatus: 'CLAIMED',
  };
}

/** PRD-002 delegates summary writing to the shared source-grounded authority. */
export function composeProfessionalSummary(params) {
  return composeSourceGroundedSummary(params);
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
  if (
    !composed.writing?.providerUsed &&
    composed.summary &&
    typeof composed.summary.text === 'string'
  ) {
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
  if (!composed.writing?.providerUsed && Array.isArray(composed.projects)) {
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
  dedupeSkillsPresentation(composed);

  // 4. Section-order integrity
  const composedWithOrder = ensureCandidateSectionIntegrity(composed);

  // 5. Fail-closed verification
  verifyProtectedSectionsUnchanged(structuredResumeDocument, composedWithOrder);

  return composedWithOrder;
}

export default composeStructuredResumeDocument;
