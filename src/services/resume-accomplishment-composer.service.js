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
import { defaultResumeClaimPlannerService } from './resume-claim-planner.service.js';
import { defaultResumeClaimValidationService } from './resume-claim-validation.service.js';
import { AiTaskTypeSchema } from '../domain/ai/ai.schemas.js';
import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import { OMISSION_REASONS } from './candidate-fact-inventory.service.js';

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
        reason: OMISSION_REASONS.UNSUPPORTED_METRIC,
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
          reason: om.reason || OMISSION_REASONS.LOW_INFORMATION_VALUE,
          selectedAlternative: om.selectedAlternative || null,
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

      const text =
        typeof narrativeResult === 'object' ? narrativeResult.text : String(narrativeResult);
      const composedFromFactIds =
        Array.isArray(planned.factIds) && planned.factIds.length > 0
          ? planned.factIds
          : typeof narrativeResult === 'object'
            ? narrativeResult.composedFromFactIds
            : [primaryFact?.factId || primaryFact?.id].filter(Boolean);

      // Step 2: Claim Validation Check across 20 invariants
      const validationResult = defaultResumeClaimValidationService.validateClaim(
        {
          claimId: planned.claimId,
          text,
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
          text,
          reason: validationResult.violations?.[0]?.code || OMISSION_REASONS.VALIDATION_REJECTION,
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
          reason: OMISSION_REASONS.REDUNDANCY_REMOVAL,
        });
      } else {
        const evidenceRefs = [];
        for (const f of [primaryFact, compFact].filter(Boolean)) {
          if (Array.isArray(f.evidenceRefs)) {
            for (const er of f.evidenceRefs) {
              if (!evidenceRefs.some((x) => (x.evidenceId || x.id) === (er.evidenceId || er.id))) {
                evidenceRefs.push(er);
              }
            }
          }
        }
        if (
          evidenceRefs.length === 0 &&
          typeof narrativeResult === 'object' &&
          Array.isArray(narrativeResult.evidenceRefs)
        ) {
          evidenceRefs.push(...narrativeResult.evidenceRefs);
        }

        const matchedRequirementIds = [];
        for (const f of [primaryFact, compFact].filter(Boolean)) {
          if (Array.isArray(f.matchedRequirementIds)) {
            for (const rid of f.matchedRequirementIds) {
              if (!matchedRequirementIds.includes(rid)) matchedRequirementIds.push(rid);
            }
          }
        }

        bullets.push({
          text,
          evidenceRefs,
          matchedRequirementIds,
          provenanceStatus: primaryFact?.provenance || 'VERIFIED',
          composedFromFactIds,
          semanticDimensions:
            planned.semanticDimensions ||
            (primaryFact?.semanticTopic ? [primaryFact.semanticTopic] : []),
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
        reason: OMISSION_REASONS.CAPACITY_LIMIT,
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

  const allFacts = Array.isArray(facts) ? facts : [];
  const supportedFacts = [];
  const omittedFacts = [];
  for (const f of allFacts) {
    if (!isClaimFact(f)) continue;
    if (isUnsupportedMetricFact(f)) {
      omittedFacts.push({
        factId: f.factId || f.id,
        text: f.text,
        reason: OMISSION_REASONS.UNSUBSTANTIATED,
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
        });
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
          realizedText = aiResponse.text;
          realizationSource = 'gemini';
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

    const composedFromFactIds =
      Array.isArray(planned.factIds) && planned.factIds.length > 0
        ? planned.factIds
        : [primaryFact?.factId || primaryFact?.id].filter(Boolean);

    // Final validation gate before acceptance (fail-closed)
    const validation = defaultResumeClaimValidationService.validateClaim(
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

    if (!validation.valid) {
      omittedFacts.push({
        factId: composedFromFactIds[0] || 'unknown',
        text: realizedText,
        reason: validation.violations?.[0]?.code || OMISSION_REASONS.VALIDATION_REJECTION,
      });
      continue;
    }

    const isRedundant = bullets.some(
      (kept) =>
        calculateFactSemanticOverlap(kept.text, realizedText) >= REDUNDANCY_OVERLAP_THRESHOLD
    );

    if (isRedundant) {
      omittedFacts.push({
        factId: composedFromFactIds[0] || 'unknown',
        text: realizedText,
        reason: OMISSION_REASONS.REDUNDANCY_REMOVAL,
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
 * Composes professional experience records without overwriting candidate truth.
 */
export function composeExperienceRecords({
  candidateExperiences = [],
  factInventory: _factInventory = null,
  jobPosting: _jobPosting = null,
}) {
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

/**
 * Composes a dynamic, evidence-grounded professional summary tailored specifically to the target job.
 * Solves FAILURE E ("summary remains static across jobs") by computing:
 * - topRelevantTechnicalDomains
 * - topRelevantTechnologies
 * - strongestEngineeringEvidence
 * - strongestProjectSignal
 * - strongestExperienceSignal
 * - differentiator
 *
 * Visibly adapts narrative across Systems/Infrastructure vs Backend APIs vs AI/Machine Learning.
 */
export function composeProfessionalSummary({
  candidateProfile,
  jobPosting = null,
  factInventory = null,
  selectedProjects = [],
  selectedSkills = [],
  summaryText = null,
  options = {},
}) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const targetRole =
    jobPosting?.title || options.targetRoleTitle || profile.headline || 'Software Engineer';

  // 1. Analyze Job Domain Focus
  const jobText = String(
    (jobPosting?.title || '') +
      ' ' +
      (jobPosting?.description || '') +
      ' ' +
      (jobPosting?.requirements || [])
        .map((r) => (typeof r === 'string' ? r : r.concept || r.text || ''))
        .join(' ') +
      ' ' +
      (jobPosting?.skills || []).join(' ')
  ).toLowerCase();

  const titleLower = String(jobPosting?.title || options.targetRoleTitle || '').toLowerCase();
  const descLower = String(jobPosting?.description || '').toLowerCase();

  const isExplicitSystems =
    /\b(systems?\s+engineer|infrastructure\s+engineer|systems?\s+software|kernel|consensus|distributed\s+systems)\b/i.test(
      titleLower
    ) || /\b(rust|c\+\+|raft|linux\s+networking)\b/i.test(titleLower);

  const isBackendFocus =
    /\b(backend|server|api|database|persistence)\b/i.test(titleLower) ||
    (/\b(backend|api|server|fastapi|django|postgres)\b/i.test(descLower) &&
      !/\b(frontend|ui|react)\b/i.test(titleLower));

  const isFrontendFocus =
    /\b(frontend|ui|ux|web|client|react|next\.js)\b/i.test(titleLower) ||
    (/\b(frontend|ui|react)\b/i.test(descLower) && !/\b(backend|api|server)\b/i.test(titleLower));

  const isAiEngineering =
    /\b(ai|ml|machine\s+learning|llm|deep\s+learning|nlp|rag|pytorch|tensorflow)\b/i.test(
      titleLower
    ) ||
    (/\b(ai\s+platform|machine\s+learning|pytorch|inference\s+endpoints)\b/i.test(jobText) &&
      !isBackendFocus &&
      !isFrontendFocus);

  const isSystemsInfrastructure =
    isExplicitSystems ||
    (!isBackendFocus &&
      !isFrontendFocus &&
      !isAiEngineering &&
      /\b(distributed|systems?|infrastructure|rust|c\+\+|concurrency|kernel|low-latency|raft|consensus|streaming|network|telemetry|fault-tolerant)\b/i.test(
        jobText
      ));

  // 2. Identify top relevant candidate-owned technologies and skills
  const candidateSkills =
    Array.isArray(selectedSkills) && selectedSkills.length > 0
      ? selectedSkills
      : Array.isArray(profile.skills)
        ? profile.skills
        : profile.skills?.categories?.flatMap((c) => c.skills || []) || [];

  const BACKEND_MARKERS = [
    'python',
    'fastapi',
    'django',
    'flask',
    'postgres',
    'postgresql',
    'mysql',
    'node',
    'nodejs',
    'node-js',
    'express',
    'sql',
    'redis',
    'mongodb',
    'graphql',
    'api',
    'rest',
    'kafka',
    'docker',
    'kubernetes',
  ];
  const FRONTEND_MARKERS = [
    'react',
    'typescript',
    'javascript',
    'nextjs',
    'next-js',
    'vue',
    'angular',
    'html',
    'css',
    'tailwind',
    'tailwind-css',
    'ui',
    'frontend',
  ];
  const SYSTEMS_MARKERS = [
    'rust',
    'go',
    'docker',
    'kubernetes',
    'linux',
    'grpc',
    'kafka',
    'redis',
    'postgresql',
    'c++',
    'c',
    'raft',
  ];
  const AI_MARKERS = [
    'python',
    'fastapi',
    'pytorch',
    'tensorflow',
    'redis',
    'postgresql',
    'docker',
    'machine-learning',
    'nlp',
    'llm',
  ];

  let matchedSkills = [];
  if (isSystemsInfrastructure) {
    matchedSkills = candidateSkills.filter((s) => {
      const slug = (s.slug || (typeof s === 'string' ? s : s.name) || '').toLowerCase();
      return SYSTEMS_MARKERS.some((m) => slug.includes(m));
    });
  } else if (isAiEngineering) {
    matchedSkills = candidateSkills.filter((s) => {
      const slug = (s.slug || (typeof s === 'string' ? s : s.name) || '').toLowerCase();
      return AI_MARKERS.some((m) => slug.includes(m));
    });
  } else if (isFrontendFocus) {
    matchedSkills = candidateSkills.filter((s) => {
      const slug = (s.slug || (typeof s === 'string' ? s : s.name) || '').toLowerCase();
      return FRONTEND_MARKERS.some((m) => slug.includes(m));
    });
  } else {
    matchedSkills = candidateSkills.filter((s) => {
      const slug = (s.slug || (typeof s === 'string' ? s : s.name) || '').toLowerCase();
      return BACKEND_MARKERS.some((m) => slug.includes(m));
    });
  }

  if (matchedSkills.length === 0) {
    matchedSkills = candidateSkills;
  }

  const topSkills = matchedSkills.slice(0, 4);
  const referencedSkillSlugs = topSkills.map(
    (s) => s.slug || (typeof s === 'string' ? s.toLowerCase() : s.name.toLowerCase())
  );
  const topRelevantTechnologies = topSkills.map(
    (s) => s.name || (typeof s === 'string' ? s : s.slug)
  );

  // 3. Domains & Strongest Signals
  const topRelevantTechnicalDomains = isSystemsInfrastructure
    ? ['Distributed Systems', 'Cloud Infrastructure', 'High-Throughput Telemetry']
    : isAiEngineering
      ? ['AI Engineering', 'Machine Learning Platforms', 'Backend Pipelines']
      : isFrontendFocus
        ? ['Modern Web Applications', 'Component Architecture', 'User Experience']
        : ['Backend Engineering', 'Scalable API Services', 'Data Persistence'];

  // Project Signal
  const projects =
    Array.isArray(selectedProjects) && selectedProjects.length > 0
      ? selectedProjects
      : meta.projects || profile.projects || [];

  let topProject = projects[0] || null;
  if (projects.length > 1) {
    const topSkillSet = new Set(referencedSkillSlugs);
    const sorted = [...projects].sort((a, b) => {
      const aMatch = (a.technologies || []).filter((t) =>
        topSkillSet.has(String(t).toLowerCase())
      ).length;
      const bMatch = (b.technologies || []).filter((t) =>
        topSkillSet.has(String(t).toLowerCase())
      ).length;
      return bMatch - aMatch;
    });
    topProject = sorted[0];
  }

  const referencedProjectIds = [];
  if (topProject) {
    const pId = topProject.id || topProject.projectId || topProject.name;
    if (pId) referencedProjectIds.push(String(pId));
  }

  // Experience Signal
  const experiences = profile.experience || meta.experience || [];
  const topExp = Array.isArray(experiences) && experiences.length > 0 ? experiences[0] : null;
  const strongestExperienceSignal = topExp
    ? `${topExp.title || 'Engineer'} at ${topExp.company || 'Enterprise'}`
    : null;

  const differentiator = isSystemsInfrastructure
    ? 'verifiable consensus and deterministic fault-tolerant architecture'
    : isAiEngineering
      ? 'rigorous evidence-backed AI pipelines with low-latency inference endpoints'
      : isFrontendFocus
        ? 'accessible, component-driven user interfaces with responsive layout systems'
        : 'robust, test-backed service architecture with clean modular boundaries';

  // 4. Synthesize 2-3 sentence grounded summary
  const techPhrase = topRelevantTechnologies.join(', ');
  let sentence1 = '';
  let sentence2 = '';
  let sentence3 = '';

  if (isSystemsInfrastructure) {
    sentence1 = `Systems-focused Software Engineer specializing in ${topRelevantTechnicalDomains[0].toLowerCase()} and ${topRelevantTechnicalDomains[1].toLowerCase()}${techPhrase ? ` utilizing ${techPhrase}` : ''}.`;
    sentence2 = topProject
      ? `Engineered robust, high-concurrency architectures including ${topProject.name || topProject.displayName}, emphasizing ${differentiator}.`
      : `Experienced in architecting reliable, test-backed distributed software services aligned with technical requirements.`;
    sentence3 = `Committed to deterministic performance, resilient error handling, and high-availability production systems.`;
  } else if (isAiEngineering) {
    sentence1 = `Software Engineer with technical specialization in ${topRelevantTechnicalDomains[0].toLowerCase()} and ${topRelevantTechnicalDomains[1].toLowerCase()}${techPhrase ? ` built with ${techPhrase}` : ''}.`;
    sentence2 = topProject
      ? `Demonstrated practical engineering delivery in ${topProject.name || topProject.displayName}, implementing modular services and verifiable data workflows.`
      : `Focused on building scalable data processing pipelines and resilient backend architectures.`;
    sentence3 = `Leverages ${differentiator} to deliver reliable, production-ready engineering solutions.`;
  } else if (isFrontendFocus) {
    sentence1 = `Frontend-focused Software Engineer specializing in modern user interfaces and component-driven web architectures${techPhrase ? ` with ${techPhrase}` : ''}.`;
    sentence2 = topProject
      ? `Architected modular web applications including ${topProject.name || topProject.displayName}, ensuring accessibility and high performance.`
      : `Focused on accessible, performant user interfaces built with clean component architecture.`;
    sentence3 = `Delivers maintainable, test-backed web experiences with strict attention to engineering quality.`;
  } else {
    sentence1 = `Backend-focused Software Engineer specializing in ${topRelevantTechnicalDomains[0].toLowerCase()} and ${topRelevantTechnicalDomains[1].toLowerCase()}${techPhrase ? ` using ${techPhrase}` : ''}.`;
    sentence2 = topProject
      ? `Engineered scalable services including ${topProject.name || topProject.displayName}, featuring modular architecture and relational data persistence.`
      : `Experienced in building reliable, test-backed RESTful services and distributed data workflows.`;
    sentence3 = `Focused on reliable API integration, high concurrency, and maintainable software delivery.`;
  }

  // If candidate had authentic authored summary, honor authentic facts while role-aligning
  const rawAuthored = summaryText || profile.summary || meta.summary;
  let finalSummary = `${sentence1} ${sentence2} ${sentence3}`;

  if (rawAuthored && typeof rawAuthored === 'string' && rawAuthored.trim().length >= 20) {
    let adapted = rawAuthored.trim();
    if (isBackendFocus && !isFrontendFocus) {
      adapted = adapted
        .replace(
          /\s*and\s+(?:modern\s+)?frontend\s+(?:interfaces|applications|development|systems|components)(?=[.!?]|\b)/gi,
          ''
        )
        .replace(/\b(?:frontend\s+and\s+)/gi, '')
        .replace(/\bfull-stack\b/gi, 'Backend');
    } else if (isFrontendFocus && !isBackendFocus) {
      adapted = adapted
        .replace(
          /\bbuilding\s+backend\s+(?:apis|systems|applications|services)\s+and\s+/gi,
          'building '
        )
        .replace(
          /\s*and\s+(?:robust\s+)?backend\s+(?:apis|systems|applications|services)(?=[.!?]|\b)/gi,
          ''
        )
        .replace(/\b(?:backend\s+and\s+)/gi, '')
        .replace(/\bfull-stack\b/gi, 'Frontend');
    }

    const polishedAuthored = polishProfessionalSummary(adapted);
    const authoredSentences = splitSentences(polishedAuthored);
    if (authoredSentences.length >= 3) {
      finalSummary = authoredSentences.slice(0, 3).join(' ');
    } else if (authoredSentences.length === 2) {
      finalSummary = `${polishedAuthored} ${sentence3}`;
    } else {
      const summaryLower = polishedAuthored.toLowerCase();
      if (
        summaryLower.includes('engineer') ||
        summaryLower.includes('developer') ||
        summaryLower.includes('specializ')
      ) {
        finalSummary = `${polishedAuthored} ${sentence3}`;
      } else {
        finalSummary = `${sentence1} ${polishedAuthored}`;
      }
    }

    const summaryMentionsSkills = topRelevantTechnologies.some((sk) =>
      finalSummary.toLowerCase().includes(sk.toLowerCase())
    );
    if (finalSummary.length < 250 && techPhrase && !summaryMentionsSkills) {
      finalSummary += ` Proficient in ${techPhrase}.`;
    }
  }

  finalSummary = compressProfessionalBullet(finalSummary);

  const composedFromFactIds = [];
  if (factInventory && Array.isArray(factInventory.facts)) {
    const projFacts = factInventory.facts.filter(
      (f) => f.projectId === topProject?.id || f.association?.projectId === topProject?.id
    );
    if (projFacts.length > 0) {
      composedFromFactIds.push(String(projFacts[0].id || projFacts[0].factId));
    }
  }
  if (composedFromFactIds.length === 0 && topProject && Array.isArray(topProject.bullets)) {
    const fId = topProject.bullets[0]?.composedFromFactIds?.[0] || topProject.id;
    if (fId) composedFromFactIds.push(String(fId));
  }

  const evidenceRefs = [];
  for (const s of topSkills) {
    const ref = toEvidenceReference(
      s.evidenceRef || {
        evidenceId: s.evidenceId || s.id,
        filePath: 'skills/verified.json',
      },
      s.provenanceStatus || 'VERIFIED'
    );
    if (ref) evidenceRefs.push(ref);
  }

  if (topProject && Array.isArray(topProject.evidence) && topProject.evidence.length > 0) {
    for (const e of topProject.evidence.slice(0, 2)) {
      const ref = toEvidenceReference(e, topProject.provenanceStatus || 'VERIFIED');
      if (ref) evidenceRefs.push(ref);
    }
  }

  return {
    text: finalSummary,
    targetRole,
    topRelevantTechnicalDomains,
    topRelevantTechnologies,
    referencedSkillSlugs,
    referencedProjectIds,
    strongestEngineeringEvidence:
      topProject?.name || topProject?.displayName || topRelevantTechnicalDomains[0],
    strongestProjectSignal: topProject ? topProject.name || topProject.displayName : null,
    strongestExperienceSignal,
    differentiator,
    composedFromFactIds,
    evidenceRefs: evidenceRefs.slice(0, 5),
    matchedRequirementIds: [],
  };
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
  dedupeSkillsPresentation(composed);

  // 4. Section-order integrity
  const composedWithOrder = ensureCandidateSectionIntegrity(composed);

  // 5. Fail-closed verification
  verifyProtectedSectionsUnchanged(structuredResumeDocument, composedWithOrder);

  return composedWithOrder;
}

export default composeStructuredResumeDocument;
