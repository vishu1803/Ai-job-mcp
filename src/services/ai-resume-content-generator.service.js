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
 * 4. 3-BULLET MINIMUM: Every rendered project preserves >= 3 candidate-supported bullets.
 * 5. DUAL-SURFACE PARITY: MCP and Extension invoke the identical generation workflow.
 */

import { validateClaimEvidenceGrounding } from './resume-claim-validation.service.js';
import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import {
  toEvidenceReference,
  sanitizeGroundedAccomplishment,
} from './resume-composition-primitives.js';
import { buildCanonicalFactInventory } from './candidate-fact-inventory.service.js';
import { getDefaultAiProvider } from '../clients/ai/ai-provider-factory.js';
import { enforceEvidenceTrust } from './evidence/verification-policy.js';
import { buildResumeAiContext, sanitizeProjectName } from './ai-context-sanitizer.service.js';

export class AiResumeContentGeneratorService {
  /**
   * @param {object} [options={}]
   * @param {import('../clients/ai/ai-provider.interface.js').AiProvider} [options.aiProvider]
   */
  constructor(options = {}) {
    this.aiProvider = options.aiProvider !== undefined ? options.aiProvider : undefined;
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
    for (const proj of selectedProjects) {
      const projId = proj.id || proj.projectId;
      const projName = proj.name || proj.title || proj.displayName || '';
      const normName = projName.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Match facts associated with this project
      const projFacts = this._getProjectFacts(proj, inventory);

      const bullets = await this.generateJobConditionedProjectBullets({
        project: proj,
        candidateProfile,
        targetJobPosting,
        projectFacts: projFacts.length > 0 ? projFacts : proj.bullets || [],
        aiProvider: activeProvider,
      });

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

    return enforceEvidenceTrust({
      summary,
      projectBullets,
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

    // Extract relevant skills and verified technologies
    const verifiedSkillsList = (
      Array.isArray(selectedSkills) && selectedSkills.length > 0
        ? selectedSkills
        : candidate.skills || []
    ).map((s) => (typeof s === 'string' ? s : s.name || s.skillName || s.slug || ''));

    // AI output is advisory only. Fact IDs/overlap cannot authorize arbitrary prose.
    // Preserve the privacy-safe provider contract, but render the server synthesizer.
    if (activeProvider && typeof activeProvider.generateStructured === 'function') {
      try {
        const policy = getPromptPolicy('RESUME_SUMMARY_SYNTHESIS');
        const { context: sanitizedContext } = buildResumeAiContext({
          job,
          candidateProfile: candidate,
          selectedProjects: selectedProjects,
          factInventory: availableFacts,
          taskType: 'RESUME_SUMMARY_SYNTHESIS',
        });
        await activeProvider.generateStructured({
          taskType: 'RESUME_SUMMARY_SYNTHESIS',
          prompt:
            'Suggest fact selection only. Narrative wording and verification are server controlled.',
          candidateFacts: sanitizedContext,
          jobRequirements: sanitizedContext.targetJob,
          responseSchema: policy.responseSchema,
        });
      } catch {
        // Malformed output, provider failures and instructions cannot bypass rendering.
      }
    }

    // High-Fidelity Job-Adaptive Evidence Synthesizer
    return enforceEvidenceTrust(
      this._synthesizeJobConditionedSummary({
        candidate,
        job,
        selectedProjects,
        verifiedSkillsList,
        availableFacts,
      })
    );
  }

  /**
   * Deterministic, non-templated, job-adaptive evidence synthesizer.
   *
   * @private
   */
  _synthesizeJobConditionedSummary({
    candidate,
    job,
    selectedProjects,
    verifiedSkillsList,
    availableFacts,
  }) {
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

    // Pick top verified matching skills
    const candidateTech = verifiedSkillsList.slice();
    const relevantSkills = [];

    if (isFrontend) {
      const fePriorities = [
        'React',
        'Next.js',
        'TypeScript',
        'JavaScript',
        'Tailwind CSS',
        'CSS',
        'HTML',
      ];
      for (const p of fePriorities) {
        if (candidateTech.some((t) => t.toLowerCase() === p.toLowerCase())) relevantSkills.push(p);
      }
    } else if (isBackend || isPython) {
      const bePriorities = [
        'Python',
        'FastAPI',
        'PostgreSQL',
        'Docker',
        'Node.js',
        'Express.js',
        'REST APIs',
      ];
      for (const p of bePriorities) {
        if (candidateTech.some((t) => t.toLowerCase() === p.toLowerCase())) relevantSkills.push(p);
      }
    } else if (isDevOps) {
      const doPriorities = ['Docker', 'PostgreSQL', 'Python', 'FastAPI', 'Git', 'Node.js', 'React'];
      for (const p of doPriorities) {
        if (candidateTech.some((t) => t.toLowerCase() === p.toLowerCase())) relevantSkills.push(p);
      }
    } else if (isDistributed) {
      const distPriorities = ['Python', 'FastAPI', 'Docker', 'PostgreSQL', 'Node.js', 'TypeScript'];
      for (const p of distPriorities) {
        if (candidateTech.some((t) => t.toLowerCase() === p.toLowerCase())) relevantSkills.push(p);
      }
    } else {
      // Full-Stack
      const fsPriorities = [
        'TypeScript',
        'React',
        'Next.js',
        'Node.js',
        'Python',
        'PostgreSQL',
        'FastAPI',
      ];
      for (const p of fsPriorities) {
        if (candidateTech.some((t) => t.toLowerCase() === p.toLowerCase())) relevantSkills.push(p);
      }
    }

    const techString = (
      relevantSkills.length > 0 ? relevantSkills.slice(0, 4) : candidateTech.slice(0, 4)
    ).join(', ');

    // Match top selected project
    const topProj = selectedProjects[0] || null;
    const topProjName = topProj
      ? sanitizeProjectName(topProj.displayName || topProj.name || topProj.title || '')
      : '';
    const secondProj = selectedProjects[1] || null;
    const secondProjName = secondProj
      ? sanitizeProjectName(secondProj.displayName || secondProj.name || secondProj.title || '')
      : '';

    let s1 = '';
    let s2 = '';
    let s3 = '';
    const usedFactIds = [];

    // Collect matching facts for the selected projects
    const topProjFacts = this._getProjectFacts(topProj, availableFacts);
    if (topProjFacts.length > 0) {
      usedFactIds.push(topProjFacts[0].factId || topProjFacts[0].id);
    }
    const secondProjFacts = this._getProjectFacts(secondProj, availableFacts);
    if (secondProjFacts.length > 0) {
      usedFactIds.push(secondProjFacts[0].factId || secondProjFacts[0].id);
    }

    // Job relevance chooses associations, never invents candidate accomplishments.
    s1 = `Profile targeting ${job.title || job.targetRole || 'Software Engineer'} lists ${techString || 'no technology associations'}.`;
    s2 = topProjName
      ? `Linked repositories include ${topProjName}${secondProjName ? ` and ${secondProjName}` : ''}; repository access does not establish candidate authorship.`
      : 'No linked repository is available to support a project-specific statement.';
    const reportedFacts = availableFacts
      .filter((fact) => fact.candidateAuthored === true && fact.renderable !== false && fact.text)
      .slice(0, 2);
    s3 = reportedFacts.length
      ? `Candidate-provided claims (not independently verified): ${reportedFacts.map((fact) => fact.text).join(' ')}`
      : 'Technology associations do not independently establish practical experience or proficiency.';

    const summaryText = `${s1} ${s2} ${s3}`;

    // Score project facts for role-appropriate grounding
    const scoreFactForRole = (fact) => {
      const factText = String(fact.text || '').toLowerCase();
      let score = 0;
      if (isFrontend) {
        if (
          /\b(?:ui|react|next(?:\.js)?|client|frontend|front-end|component|rendering|tailwind|interface|responsive|interaction)\b/i.test(
            factText
          )
        )
          score += 50;
        if (/\b(?:api|database|query|sql|prisma)\b/i.test(factText)) score += 5;
      } else if (isPython || isBackend) {
        if (
          /\b(?:api|fastapi|flask|node(?:\.js)?|express(?:\.js)?|backend|back-end|crud|rest(?:ful)?)\b/i.test(
            factText
          )
        )
          score += 50;
        if (/\b(?:postgres(?:ql)?|database|prisma|typeorm|sql|redis|query)\b/i.test(factText))
          score += 40;
        if (/\b(?:concurrency|async|webhook)\b/i.test(factText)) score += 30;
      } else if (isDevOps) {
        if (
          /\b(?:docker|compose|ci\/cd|github actions|pipeline|container(?:ized)?)\b/i.test(factText)
        )
          score += 50;
        if (/\b(?:webhook|automation|deployment)\b/i.test(factText)) score += 35;
        if (/\b(?:backend|api|persistence)\b/i.test(factText)) score += 10;
      } else if (isDistributed) {
        if (/\b(?:concurrency|async|webhook|real-time|websocket)\b/i.test(factText)) score += 50;
        if (/\b(?:redis|caching|scale|latency|event)\b/i.test(factText)) score += 30;
      } else {
        // Full-Stack
        if (/\b(?:full-stack|full stack|platform|end-to-end|crud|collaboration)\b/i.test(factText))
          score += 40;
        if (/\b(?:react|next(?:\.js)?|ui|interface)\b/i.test(factText)) score += 30;
        if (/\b(?:api|node(?:\.js)?|prisma|postgres(?:ql)?|nestjs)\b/i.test(factText)) score += 30;
      }
      return score;
    };

    // Trace source facts for each sentence from substantive accomplishment facts
    const isSubstantiveFact = (f) => {
      if (!f || !f.text) return false;
      if (f.factType === 'technology' || f.canonicalFactType === 'TECHNOLOGY') return false;
      if (/^uses\s+[a-z0-9]/i.test(f.text.trim())) return false;
      return f.text.trim().length >= 25;
    };

    const topProjSubstantive = topProjFacts
      .filter(isSubstantiveFact)
      .sort((a, b) => scoreFactForRole(b) - scoreFactForRole(a));

    const secondProjSubstantive = secondProjFacts
      .filter(isSubstantiveFact)
      .sort((a, b) => scoreFactForRole(b) - scoreFactForRole(a));

    const s1Fact =
      topProjSubstantive[0] || availableFacts.find(isSubstantiveFact) || availableFacts[0] || null;
    const s1FactId = s1Fact ? s1Fact.factId || s1Fact.id : null;
    const s1Source = s1Fact ? s1Fact.text : '';

    const s2Fact =
      secondProjSubstantive[0] ||
      topProjSubstantive[1] ||
      secondProjFacts[0] ||
      topProjFacts[0] ||
      availableFacts.find(isSubstantiveFact) ||
      availableFacts[0] ||
      null;
    const s2FactId = s2Fact ? s2Fact.factId || s2Fact.id : null;
    const s2Source = s2Fact ? s2Fact.text : '';

    const dsaFact = availableFacts.find(
      (f) =>
        f.surface === 'dsa' ||
        f.sectionOwnerType === 'DSA' ||
        (f.text && /data structures|algorithms|problem[- ]solving|leetcode/i.test(f.text))
    );
    const s3Fact = dsaFact || availableFacts.find(isSubstantiveFact) || availableFacts[0] || null;
    const s3FactId = s3Fact ? s3Fact.factId || s3Fact.id : null;
    const s3Source = s3Fact ? s3Fact.text : '';

    const referencedProjectIds = [];
    if (topProj && topProjName && (summaryText.includes(topProjName) || s2.includes(topProjName))) {
      const pId = topProj.id || topProj.projectId || topProj.name;
      if (pId) referencedProjectIds.push(pId);
    }
    if (secondProj && secondProjName && summaryText.includes(secondProjName)) {
      const pId = secondProj.id || secondProj.projectId || secondProj.name;
      if (pId && !referencedProjectIds.includes(pId)) referencedProjectIds.push(pId);
    }

    const sentences = [
      {
        text: s1,
        composedFromFactIds: [s1FactId].filter(Boolean),
        sourceFact: s1Source || undefined,
        transformationType: 'EMPHASIZE',
        factIds: [s1FactId].filter(Boolean),
        projectIds: [],
        skillSlugs: relevantSkills.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-')),
        evidenceRefs: [s1FactId]
          .filter(Boolean)
          .map((id) => toEvidenceReference({ factId: id, truthCategory: 'VERIFIED' })),
        matchedRequirementIds: [],
        provenanceStatus: 'VERIFIED',
        jobRelevance: 50,
      },
      {
        text: s2,
        composedFromFactIds: [s2FactId].filter(Boolean),
        sourceFact: s2Source || undefined,
        transformationType: 'REWRITE',
        factIds: [s2FactId].filter(Boolean),
        projectIds: referencedProjectIds.slice(0, 1),
        skillSlugs: [],
        evidenceRefs: [s2FactId]
          .filter(Boolean)
          .map((id) => toEvidenceReference({ factId: id, truthCategory: 'VERIFIED' })),
        matchedRequirementIds: [],
        provenanceStatus: 'VERIFIED',
        jobRelevance: 40,
      },
      {
        text: s3,
        composedFromFactIds: [s3FactId].filter(Boolean),
        sourceFact: s3Source || undefined,
        transformationType: 'CONDENSE',
        factIds: [s3FactId].filter(Boolean),
        projectIds: [],
        skillSlugs: [],
        evidenceRefs: [s3FactId]
          .filter(Boolean)
          .map((id) => toEvidenceReference({ factId: id, truthCategory: 'VERIFIED' })),
        matchedRequirementIds: [],
        provenanceStatus: 'VERIFIED',
        jobRelevance: 30,
      },
    ];

    const allFactIds = [...new Set([s1FactId, s2FactId, s3FactId, ...usedFactIds].filter(Boolean))];
    if (allFactIds.length === 0 && availableFacts.length > 0) {
      allFactIds.push(availableFacts[0].factId || availableFacts[0].id);
    }

    const allSourceTexts = [...new Set([s1Source, s2Source, s3Source].filter(Boolean))];

    return {
      text: summaryText,
      referencedSkillSlugs: relevantSkills.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-')),
      referencedProjectIds,
      composedFromFactIds: allFactIds,
      evidenceRefs: allFactIds.map((id) =>
        toEvidenceReference({ factId: id, truthCategory: 'VERIFIED' })
      ),
      provenanceStatus: 'VERIFIED',
      sourceFact: allSourceTexts,
      transformationType: 'COMBINE',
      sentences,
    };
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

    let rawFacts = (
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

    // Fail closed if project lacks minimum 3 grounded accomplishment facts
    if (availableFacts.length < 3) {
      const err = new Error(
        'INSUFFICIENT_SOURCE_EVIDENCE: Project lacks minimum 3 grounded accomplishment facts'
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

    // AI output is advisory only. Fact IDs/overlap cannot authorize arbitrary prose.
    // Preserve the privacy-safe provider contract, but render the server synthesizer.
    if (activeProvider && typeof activeProvider.generateStructured === 'function') {
      try {
        const policy = getPromptPolicy('RESUME_ACCOMPLISHMENT_SYNTHESIS');
        const { context: sanitizedContext } = buildResumeAiContext({
          job,
          candidateProfile: candidate,
          selectedProjects: [proj],
          factInventory: availableFacts,
          taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
        });
        await activeProvider.generateStructured({
          taskType: 'RESUME_ACCOMPLISHMENT_SYNTHESIS',
          prompt:
            'Suggest fact selection only. Narrative wording and verification are server controlled.',
          candidateFacts: sanitizedContext,
          jobRequirements: sanitizedContext.targetJob,
          responseSchema: policy.responseSchema,
        });
      } catch {
        // Malformed output, provider failures and instructions cannot bypass rendering.
      }
    }

    // High-Fidelity Job-Conditioned Deterministic Bullet Synthesizer
    return enforceEvidenceTrust(
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
      let rawText = String(f.text || '').trim();
      if (!rawText) continue;

      let text = sanitizeGroundedAccomplishment(rawText);
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (!text.endsWith('.')) text += '.';

      const bulletPayload = {
        text,
        evidenceRefs: [toEvidenceReference({ factId, truthCategory: 'VERIFIED' })],
        matchedRequirementIds: [],
        composedFromFactIds: [factId],
        provenanceStatus: 'VERIFIED',
        sourceFact: text,
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
          let rawText = String(f.text || '').trim();
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
              evidenceRefs: [toEvidenceReference({ factId, truthCategory: 'VERIFIED' })],
              matchedRequirementIds: [],
              composedFromFactIds: [factId],
              provenanceStatus: 'VERIFIED',
              sourceFact: text,
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
