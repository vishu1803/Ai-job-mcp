/**
 * @file AI Resume Content Generation Service
 *
 * Dedicated AI content-generation engine for resume Professional Summary and
 * Project Bullets. Replaces static template-like reuse with authentic,
 * job-conditioned narrative realization.
 *
 * Core Invariants:
 * 1. ZERO FABRICATION: Every generated claim, metric, and skill must be
 *    traceable to verified candidate evidence.
 * 2. JOB CONDITIONING: Narratives meaningfully prioritize target job requirements
 *    without reverting to mechanical fill-in-the-blank templates.
 * 3. AUTHORITATIVE RANKING PRESERVATION: Project selection comes exclusively
 *    from authoritative ranking (top-N).
 * 4. SOURCE CAPACITY: Thin factual projects never receive invented padding.
 * 5. DUAL-SURFACE PARITY: MCP and Extension invoke the identical generation workflow.
 */

import { composeSourceGroundedSummary } from './source-grounded-summary.service.js';
import { validateClaimEvidenceGrounding } from './resume-claim-validation.service.js';
import { realizeResumeWriting } from './resume-ai-realization.service.js';
import { resumeSourceValue } from '../utils/resume-source-normalizer.js';
import {
  toEvidenceReference,
  sanitizeGroundedAccomplishment,
} from './resume-composition-primitives.js';
import { buildCanonicalFactInventory } from './candidate-fact-inventory.service.js';
import { getDefaultAiProvider } from '../clients/ai/ai-provider-factory.js';
import { enforceEvidenceTrust } from './evidence/verification-policy.js';

// Diagnostics never change the authoritative narrative contract, and cannot
// leak between concurrent tenant requests on the shared generator singleton.
const summaryProviderStatuses = new WeakMap();
const bulletProviderStatuses = new WeakMap();

export class AiResumeContentGeneratorService {
  /**
   * @param {object} [options={}]
   * @param {import('../clients/ai/ai-provider.interface.js').AiProvider} [options.aiProvider]
   */
  constructor(options = {}) {
    this.aiProvider = options.aiProvider !== undefined ? options.aiProvider : undefined;
    this.writingTimeoutMs =
      options.writingTimeoutMs || Number(process.env.RESUME_AI_TIMEOUT_MS) || 120000;
  }

  /**
   * Resolves the active AI provider honoring explicit opt-outs (false).
   *
   * @private
   * @param {*} aiProvider
   * @returns {object|null}
   */
  _resolveActiveProvider(aiProvider) {
    if (aiProvider === false || aiProvider === null) return null;
    if (aiProvider !== undefined) return aiProvider;
    if (this.aiProvider === false || this.aiProvider === null) return null;
    if (this.aiProvider !== undefined) return this.aiProvider;

    const isTestExecution =
      process.env.NODE_ENV === 'test' ||
      process.env.npm_lifecycle_event?.includes('test') ||
      process.argv.some(
        (arg) => typeof arg === 'string' && (arg.includes('--test') || arg.includes('tests/'))
      ) ||
      process.execArgv.some((arg) => typeof arg === 'string' && arg.includes('--test'));

    if (isTestExecution && process.env.TEST_LIVE_AI !== 'true') {
      return null;
    }

    try {
      return getDefaultAiProvider();
    } catch {
      return null;
    }
  }

  /**
   * Helper to retrieve all canonical facts associated with a project.
   *
   * @private
   * @param {object} proj
   * @param {Array<object>} availableFacts
   * @returns {Array<object>}
   */
  _getProjectFacts(proj, availableFacts) {
    if (!proj) return [];
    const pid = proj.id || proj.projectId;
    const rawName = proj.displayName || proj.name || proj.title || '';
    const normName = rawName
      .toLowerCase()
      .replace(/^vishu1803\//i, '')
      .replace(/[^a-z0-9]/g, '');

    return (Array.isArray(availableFacts) ? availableFacts : []).filter((f) => {
      const owner = f.sectionOwnerId || f.ownerId || f.association?.projectId;
      if (pid && owner === pid) return true;
      const assocName = (f.association?.projectName || f.association?.name || '')
        .toLowerCase()
        .replace(/^vishu1803\//i, '')
        .replace(/[^a-z0-9]/g, '');
      if (
        normName &&
        assocName &&
        (assocName === normName || assocName.includes(normName) || normName.includes(assocName))
      )
        return true;
      if (
        normName &&
        f.text &&
        f.text
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .includes(normName)
      )
        return true;
      return false;
    });
  }

  /**
   * Orchestrates the complete AI content-generation stage for a resume:
   * 1. Job-conditioned Professional Summary
   * 2. Job-conditioned Project Bullets for each authoritative selected project
   *
   * @param {object} params
   * @returns {Promise<{ summary: object, projectBullets: Record<string, Array<object>> }>}
   */
  async generateResumeAiContent({
    candidateProfile,
    targetJobPosting,
    selectedProjects = [],
    selectedSkills = [],
    factInventory = [],
    aiProvider = undefined,
  }) {
    const activeProvider = this._resolveActiveProvider(aiProvider);

    const inventory =
      Array.isArray(factInventory) && factInventory.length > 0
        ? factInventory
        : candidateProfile
          ? buildCanonicalFactInventory(candidateProfile, targetJobPosting)?.facts || []
          : [];

    // 1. Generate job-conditioned summary
    const summary = await this.generateJobConditionedSummary({
      candidateProfile,
      targetJobPosting,
      selectedProjects,
      selectedSkills,
      factInventory: inventory,
      aiProvider: activeProvider,
    });

    // 2. Generate job-conditioned project bullets for each selected project
    const projectBullets = {};
    const projectWriting = [];
    for (const proj of selectedProjects) {
      const projId = proj.id || proj.projectId;
      const projName = proj.name || proj.title || proj.displayName || '';
      const normName = projName.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Match facts associated with this project
      const projFacts = this._getProjectFacts(proj, inventory);

      let bullets = [];
      try {
        bullets = await this.generateJobConditionedProjectBullets({
          project: proj,
          candidateProfile,
          targetJobPosting,
          projectFacts: projFacts.length > 0 ? projFacts : proj.bullets || [],
          aiProvider: activeProvider,
        });
      } catch (err) {
        if (err.code === 'INSUFFICIENT_SOURCE_EVIDENCE') {
          bullets = [];
        } else {
          throw err;
        }
      }

      projectWriting.push(bulletProviderStatuses.get(bullets) || { status: 'UNAVAILABLE' });
      const slugName = projName
        .toLowerCase()
        .replace(/^https?:\/\/[^/]+\//, '')
        .replace(/^github\.com\//, '')
        .replace(/^[^/]+\//, '')
        .replace(/[^a-z0-9]/g, '');

      if (projId) projectBullets[projId] = bullets;
      if (proj.name) projectBullets[proj.name] = bullets;
      if (proj.title) projectBullets[proj.title] = bullets;
      if (normName) projectBullets[normName] = bullets;
      if (slugName) projectBullets[slugName] = bullets;
    }

    const experienceBullets = {};
    for (const experience of resumeSourceValue(candidateProfile, 'experience', [
      'workExperience',
    ]) || []) {
      const experienceFacts = inventory.filter(
        (f) =>
          (f.ownerId || f.sectionOwnerId || f.association?.experienceId) === experience.id &&
          (f.ownerType === 'EXPERIENCE' || f.surface === 'experience')
      );
      if (!experienceFacts.length) continue;
      const realized = await realizeResumeWriting({
        provider: activeProvider,
        taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
        candidateProfile,
        job: targetJobPosting,
        selectedProjects: [
          {
            id: experience.id,
            name: 'Professional contribution',
            technologies: experience.technologies || [],
          },
        ],
        facts: experienceFacts,
        timeoutMs: this.writingTimeoutMs,
        sectionOwnerType: 'EXPERIENCE',
      });
      projectWriting.push(realized);
      if (realized.status === 'ACCEPTED') experienceBullets[experience.id] = realized.claims;
    }
    const summaryWriting = summaryProviderStatuses.get(summary) || { status: 'UNAVAILABLE' };
    const attempts = [summaryWriting, ...projectWriting];
    const accepted = attempts.filter((entry) => entry.status === 'ACCEPTED');
    const providerStatus = accepted.length
      ? 'ACCEPTED'
      : attempts.some((entry) => entry.status === 'REJECTED')
        ? 'REJECTED'
        : attempts.some((entry) => entry.status === 'FAILED')
          ? 'FAILED'
          : 'UNAVAILABLE';
    return enforceEvidenceTrust({
      summary,
      projectBullets,
      experienceBullets,
      writing: {
        method: accepted.length ? 'AI_FACT_BOUND' : 'SOURCE_GROUNDED_DETERMINISTIC',
        providerUsed: accepted.length > 0,
        providerStatus,
        summaryStatus: summaryWriting.status,
        ...(accepted[0]?.provider ? { provider: accepted[0].provider } : {}),
        ...(accepted[0]?.modelId ? { modelId: accepted[0].modelId } : {}),
        sections: attempts.map(({ status, reason }) => ({ status, ...(reason ? { reason } : {}) })),
        missingDataGuidance: summary.text
          ? []
          : ['Add documented responsibilities, education or a factual authored summary.'],
      },
    });
  }

  /**
   * Generates a genuinely job-conditioned Professional Summary.
   *
   * @param {object} params
   * @param {object} params.candidateProfile
   * @param {object} params.targetJobPosting
   * @param {Array<object>} params.selectedProjects
   * @param {Array<object>} [params.selectedSkills]
   * @param {Array<object>} [params.factInventory]
   * @param {object} [params.aiProvider]
   * @returns {Promise<{ text: string, referencedSkillSlugs: Array<string>, referencedProjectIds: Array<string>, composedFromFactIds: Array<string>, evidenceRefs: Array<object>, provenanceStatus: string }>}
   */
  async generateJobConditionedSummary({
    candidateProfile,
    targetJobPosting,
    selectedProjects = [],
    selectedSkills = [],
    factInventory = [],
    aiProvider = undefined,
  }) {
    const activeProvider = this._resolveActiveProvider(aiProvider);
    const candidate = candidateProfile || {};
    const job = targetJobPosting || {};

    const availableFacts =
      Array.isArray(factInventory) && factInventory.length > 0
        ? factInventory
        : candidateProfile
          ? buildCanonicalFactInventory(candidateProfile, targetJobPosting)?.facts || []
          : [];

    const realized = await realizeResumeWriting({
      provider: activeProvider,
      taskType: 'RESUME_SUMMARY_SYNTHESIS',
      candidateProfile: candidate,
      job,
      selectedProjects,
      selectedSkills,
      facts: availableFacts,
      timeoutMs: this.writingTimeoutMs,
    });
    const proposed = realized.claims[0];
    const summary = enforceEvidenceTrust(
      proposed
        ? {
            ...proposed,
            referencedProjectIds: [
              ...new Set(
                availableFacts
                  .filter((f) => proposed.composedFromFactIds.includes(f.factId || f.id))
                  .map(
                    (f) =>
                      f.association?.projectId || (f.ownerType === 'PROJECT' ? f.ownerId : null)
                  )
                  .filter(Boolean)
              ),
            ],
            referencedSkillSlugs: [],
            sentences: [
              {
                ...proposed,
                factIds: proposed.composedFromFactIds,
                projectIds: [],
                skillSlugs: [],
                jobRelevance: 1,
              },
            ],
          }
        : composeSourceGroundedSummary({
            candidateProfile: candidate,
            jobPosting: job,
            selectedProjects,
            selectedSkills,
            factInventory: availableFacts,
            options: { preserveAuthoredSummary: !job?.title },
          })
    );
    summaryProviderStatuses.set(summary, realized);
    return summary;
  }

  /**
   * Generates or rewrites project bullets specifically toward the target job.
   *
   * @param {object} params
   * @param {object} params.project
   * @param {object} params.candidateProfile
   * @param {object} params.targetJobPosting
   * @param {Array<object>} params.projectFacts
   * @param {object} [params.aiProvider]
   * @returns {Promise<Array<object>>} Array of conditioned bullets
   */
  async generateJobConditionedProjectBullets({
    project,
    candidateProfile,
    targetJobPosting,
    projectFacts = [],
    aiProvider = undefined,
  }) {
    const activeProvider = this._resolveActiveProvider(aiProvider);
    const candidate = candidateProfile || {};
    const job = targetJobPosting || {};
    const proj = project || {};

    const isFragmentOrDescription = (text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) return true;
      if (/^uses\s+[a-z0-9]/i.test(trimmed)) return true;
      if (
        /^(?:intelligent\s+automated|real-time\s+collaborative|full-stack\s+[a-z]+(?:\s+platform|\s+application|\s+manager|\s+system)?\s+built|a\s+[a-z]+|an\s+[a-z]+|the\s+[a-z]+)\b/i.test(
          trimmed
        )
      ) {
        return true;
      }
      return false;
    };

    const rawFacts = (
      Array.isArray(projectFacts) && projectFacts.length > 0
        ? projectFacts
        : proj.bullets || proj.metadata?.bullets || []
    ).filter((f) => {
      if (
        typeof f === 'object' &&
        f &&
        (f.factType === 'technology' ||
          f.factType === 'external-corroboration' ||
          f.factType === 'feature-description' ||
          f.sourceType === 'feature-description')
      ) {
        return false;
      }
      const text = typeof f === 'string' ? f : f?.text || f?.claim || '';
      return !isFragmentOrDescription(text);
    });

    // If filtered facts are fewer than 3, backfill strictly from candidate-authored project accomplishment bullets
    if (rawFacts.length < 3) {
      const candProjBullets =
        Array.isArray(proj.metadata?.bullets) && proj.metadata.bullets.length > 0
          ? proj.metadata.bullets
          : Array.isArray(proj.bullets)
            ? proj.bullets
            : [];
      for (const cb of candProjBullets) {
        const text = typeof cb === 'string' ? cb : cb?.text || cb?.claim || '';
        if (
          text &&
          !isFragmentOrDescription(text) &&
          !rawFacts.some((rf) => (typeof rf === 'string' ? rf : rf.text || rf.claim) === text)
        ) {
          rawFacts.push(cb);
        }
      }
    }

    const candId = candidate.id || candidate.candidate?.id;
    const projectOwnerId = proj.id || proj.projectId || 'p';

    const availableFacts = rawFacts
      .map((f, idx) => {
        if (typeof f === 'string') {
          return {
            factId: `fact-${projectOwnerId}-${idx + 1}`,
            text: f,
            technologies: proj.technologies || [],
            metrics: [],
            candidateAuthored: true,
            agencyLevel: 'CANDIDATE',
            agencySource: 'CANDIDATE_AUTHORED',
            ownership: 'CANDIDATE',
            ownerType: 'PROJECT',
            ownerId: projectOwnerId,
            sectionOwnerId: projectOwnerId,
            candidateId: candId,
            provenanceStatus: 'CLAIMED',
            provenance: 'CLAIMED',
          };
        }
        return {
          ...f,
          factId: f.factId || f.id || `fact-${projectOwnerId}-${idx + 1}`,
          text: f.text || f.claim || '',
          technologies: f.technologies || proj.technologies || [],
          metrics: f.metrics || [],
          candidateAuthored: f.candidateAuthored ?? true,
          agencyLevel: f.agencyLevel || 'CANDIDATE',
          agencySource: f.agencySource || 'CANDIDATE_AUTHORED',
          ownership: f.ownership || 'CANDIDATE',
          ownerType: f.ownerType || 'PROJECT',
          ownerId: f.ownerId || projectOwnerId,
          sectionOwnerId: f.sectionOwnerId || projectOwnerId,
          candidateId: f.candidateId || candId,
          provenanceStatus: enforceEvidenceTrust(f).provenanceStatus || 'CLAIMED',
          provenance: enforceEvidenceTrust(f).provenance || 'CLAIMED',
        };
      })
      .filter((f) => String(f.text || '').trim().length > 0 && !isFragmentOrDescription(f.text));

    // Minimum 3 grounded facts required; fail closed with INSUFFICIENT_SOURCE_EVIDENCE
    if (availableFacts.length < 3) {
      const err = new Error(
        `INSUFFICIENT_SOURCE_EVIDENCE: Project "${proj.name || projectOwnerId}" lacks minimum 3 grounded accomplishment facts (found ${availableFacts.length})`
      );
      err.code = 'INSUFFICIENT_SOURCE_EVIDENCE';
      throw err;
    }

    // Target job context
    const title = String(job.title || job.targetRole || '').toLowerCase();
    const desc = String(job.description || '').toLowerCase();
    const jobText = `${title} ${desc}`;

    const isFullStack = /\bfull[- ]?stack\b/i.test(jobText);
    const isFrontend = /\bfront[- ]?end\b/i.test(jobText) && !isFullStack;
    const isPython = /\bpython\b/i.test(jobText);
    const isBackend = (/\bback[- ]?end\b/i.test(jobText) || isPython) && !isFullStack;
    const isDevOps = /\b(?:devops|platform|infrastructure|sre|cloud|ci\/cd|docker)\b/i.test(
      jobText
    );
    const isDistributed = /\b(?:distributed|concurrency|systems|telemetry|microservices)\b/i.test(
      jobText
    );

    const realized = await realizeResumeWriting({
      provider: activeProvider,
      taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
      candidateProfile: candidate,
      job,
      selectedProjects: [proj],
      facts: availableFacts,
      timeoutMs: this.writingTimeoutMs,
    });
    if (realized.status === 'ACCEPTED') {
      const accepted = enforceEvidenceTrust(realized.claims);
      bulletProviderStatuses.set(accepted, realized);
      return accepted;
    }

    // High-Fidelity Job-Conditioned Deterministic Bullet Synthesizer
    const fallback = enforceEvidenceTrust(
      this._synthesizeJobConditionedProjectBullets({
        proj,
        jobText,
        isFullStack,
        isFrontend,
        isBackend,
        isPython,
        isDevOps,
        isDistributed,
        availableFacts,
        candidate,
      })
    );
    bulletProviderStatuses.set(fallback, realized);
    return fallback;
  }

  /**
   * Deterministic evidence-grounded project bullet synthesizer.
   * Prioritizes and reframes supported facts to address the target job's architectural priorities.
   *
   * @private
   */
  _synthesizeJobConditionedProjectBullets({
    proj,
    jobText,
    isFullStack,
    isFrontend,
    isBackend,
    isPython,
    isDevOps,
    isDistributed,
    availableFacts,
    candidate,
  }) {
    const projName = String(proj.name || proj.title || '').toLowerCase();
    const isTaskManager = projName.includes('task-manager') || projName.includes('collaborative');
    const isCodeReview = projName.includes('code-review') || projName.includes('assistant');
    const isDataExplorer = projName.includes('data-explorer') || projName.includes('product');

    // Score available source facts for job alignment
    const scoredFacts = availableFacts.map((fact, idx) => {
      const factText = String(fact.text || '').toLowerCase();
      let score = 10 - idx; // preserve original authored order as base

      if (isFrontend) {
        if (
          /\b(?:ui|react|next(?:\.js)?|client|frontend|front-end|component|rendering|tailwind|interface|responsive|interaction)\b/i.test(
            factText
          )
        )
          score += 35;
        if (/\b(?:api|database|query|sql|prisma)\b/i.test(factText)) score += 5;
      } else if (isPython || isBackend) {
        if (
          /\b(?:api|fastapi|flask|node(?:\.js)?|express(?:\.js)?|backend|back-end|crud|rest(?:ful)?)\b/i.test(
            factText
          )
        )
          score += 30;
        if (/\b(?:postgres(?:ql)?|database|prisma|typeorm|sql|redis|query)\b/i.test(factText))
          score += 25;
        if (/\b(?:concurrency|async|webhook)\b/i.test(factText)) score += 20;
      } else if (isDevOps) {
        if (
          /\b(?:docker|compose|ci\/cd|github actions|pipeline|container(?:ized)?)\b/i.test(factText)
        )
          score += 35;
        if (/\b(?:webhook|automation|deployment)\b/i.test(factText)) score += 25;
        if (/\b(?:backend|api|persistence)\b/i.test(factText)) score += 10;
      } else if (isDistributed) {
        if (/\b(?:concurrency|async|webhook|real-time|websocket)\b/i.test(factText)) score += 35;
        if (/\b(?:redis|caching|scale|latency|event)\b/i.test(factText)) score += 25;
      } else {
        // Full-Stack
        if (/\b(?:full-stack|full stack|platform|end-to-end|crud|collaboration)\b/i.test(factText))
          score += 25;
        if (/\b(?:react|next(?:\.js)?|ui|interface)\b/i.test(factText)) score += 20;
        if (/\b(?:api|node(?:\.js)?|prisma|postgres(?:ql)?)\b/i.test(factText)) score += 20;
      }

      return { fact, score, originalIndex: idx };
    });

    // Sort facts by relevance score descending
    scoredFacts.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    // Format top facts into crisp active-voice engineering bullets
    const bullets = [];
    for (const item of scoredFacts) {
      const f = item.fact;
      const factId = f.factId || f.id || `f-${bullets.length + 1}`;
      const rawText = String(f.text || '').trim();
      if (!rawText) continue;

      let text = sanitizeGroundedAccomplishment(rawText);
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (!text.endsWith('.')) text += '.';

      const bulletPayload = {
        text,
        evidenceRefs: [toEvidenceReference({ factId }, f.provenanceStatus || 'CLAIMED')],
        matchedRequirementIds: [],
        composedFromFactIds: [factId],
        provenanceStatus: f.provenanceStatus || 'CLAIMED',
        sourceFact: rawText,
        transformationType: 'EMPHASIZE',
      };

      const validation = validateClaimEvidenceGrounding(
        {
          text,
          factIds: [factId],
          composedFromFactIds: [factId],
          sourceFact: text,
          transformationType: 'EMPHASIZE',
        },
        {
          factInventory: availableFacts,
          candidateProfile: candidate,
          sectionOwnerType: 'PROJECT',
          sectionOwnerId: proj.id || proj.projectId,
        }
      );

      if (validation.valid) {
        bullets.push(bulletPayload);
      }
    }

    // Ensure we return at least 3 bullets if source facts exist
    if (bullets.length < 3 && availableFacts.length > 0) {
      // If candidate facts were fewer than 3, backfill from availableFacts
      for (const f of availableFacts) {
        if (bullets.length >= 3) break;
        const factId = f.factId || f.id;
        if (!bullets.some((b) => b.composedFromFactIds.includes(factId))) {
          const rawText = String(f.text || '').trim();
          if (!rawText) continue;
          let text = sanitizeGroundedAccomplishment(rawText);
          text = text.charAt(0).toUpperCase() + text.slice(1);
          if (!text.endsWith('.')) text += '.';

          const val = validateClaimEvidenceGrounding(
            {
              text,
              factIds: [factId],
              composedFromFactIds: [factId],
              sourceFact: text,
              transformationType: 'VERBATIM',
            },
            {
              factInventory: availableFacts,
              candidateProfile: candidate,
              sectionOwnerType: 'PROJECT',
              sectionOwnerId: proj.id || proj.projectId,
            }
          );

          if (val.valid) {
            bullets.push({
              text,
              evidenceRefs: [toEvidenceReference({ factId }, f.provenanceStatus || 'CLAIMED')],
              matchedRequirementIds: [],
              composedFromFactIds: [factId],
              provenanceStatus: f.provenanceStatus || 'CLAIMED',
              sourceFact: rawText,
              transformationType: 'VERBATIM',
            });
          }
        }
      }
    }

    // Return the top 3 job-conditioned bullets
    return bullets.slice(0, 3);
  }
}

export const defaultAiResumeContentGenerator = new AiResumeContentGeneratorService();
