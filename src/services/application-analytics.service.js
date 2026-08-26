/**
 * @file Application Analytics Service (Phase 12 / P12-004 / ARCH-045)
 *
 * Implements authoritative, descriptive, point-in-time statistical analytics
 * across candidate job applications, interview stages, and skill gaps.
 *
 * Adheres strictly to:
 * - Sovereign Multi-Tenant Isolation: 404 default-deny on any cross-tenant request.
 * - Point-in-Time Integrity: Uses immutable ats_fit_snapshot scores (zero dynamic recalculation).
 * - Descriptive Non-Causal Analytics: Explicit disclaimers, descriptive terminology.
 * - Small-Sample Privacy & Suppression: Suppresses rates when N < 5 with INSUFFICIENT_DATA markers.
 * - Skill Taxonomy Normalization: Deduplicates and normalizes missing skills to canonical slugs.
 */

import { eq, and, gte } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, jobApplications, applicationStages } from '../db/schema.js';
import { NotFoundError } from '../errors/index.js';
import { normalizeSkill } from '../domain/career/skill-taxonomy.js';
import {
  MIN_SAMPLE_SIZE_FOR_RATES,
  NON_CAUSAL_DISCLAIMER,
  AnalyticsFilterOptionsSchema,
  CandidateAnalyticsSummaryOutputSchema,
  ScoreProgressionCorrelationOutputSchema,
  SkillGapFrequencyOutputSchema,
} from '../domain/career/application-analytics.schemas.js';

/**
 * Rounds a number to a specified decimal precision.
 *
 * @param {number} value Number to round
 * @param {number} [precision=2] Decimal places
 * @returns {number} Rounded number
 */
function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Maps time window string to Date threshold or null if ALL_TIME.
 *
 * @param {string} window Time window enum value
 * @returns {Date|null} Cutoff date or null
 */
function getTimeWindowCutoff(window) {
  const now = Date.now();
  switch (window) {
    case 'LAST_30_DAYS':
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
    case 'LAST_90_DAYS':
      return new Date(now - 90 * 24 * 60 * 60 * 1000);
    case 'LAST_180_DAYS':
      return new Date(now - 180 * 24 * 60 * 60 * 1000);
    case 'LAST_365_DAYS':
      return new Date(now - 365 * 24 * 60 * 60 * 1000);
    case 'ALL_TIME':
    default:
      return null;
  }
}

export class ApplicationAnalyticsService {
  /**
   * @param {object} [dependencies={}] Injected dependencies
   * @param {object} [dependencies.database=defaultDb] Drizzle DB instance
   */
  constructor(dependencies = {}) {
    this.db = dependencies.database || dependencies.db || defaultDb;
  }

  /**
   * Asserts candidate existence and tenant ownership.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
   * @param {string} candidateId Candidate UUID
   * @returns {Promise<object>} Candidate record
   * @throws {NotFoundError} If candidate not found in tenant
   */
  async _assertCandidate(context, candidateId) {
    if (!context || !context.tenantId) {
      throw new NotFoundError('Tenant context is required.');
    }

    const [candidate] = await this.db
      .select({ id: candidates.id, tenantId: candidates.tenantId })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    return candidate;
  }

  /**
   * Fetches raw applications and stages for candidate filtered by window/options.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context
   * @param {string} candidateId
   * @param {object} options
   * @returns {Promise<{ applications: Array<object>, stagesByAppId: Map<string, Array<object>> }>}
   */
  async _fetchCandidateApplicationsWithStages(context, candidateId, options = {}) {
    await this._assertCandidate(context, candidateId);

    const validatedOptions = AnalyticsFilterOptionsSchema.parse(options);
    const cutoffDate = getTimeWindowCutoff(validatedOptions.timeWindow);

    // Build conditions
    const conditions = [
      eq(jobApplications.tenantId, context.tenantId),
      eq(jobApplications.candidateId, candidateId),
    ];

    if (validatedOptions.source) {
      conditions.push(eq(jobApplications.source, validatedOptions.source));
    }

    if (validatedOptions.workplaceType) {
      conditions.push(eq(jobApplications.workplaceType, validatedOptions.workplaceType));
    }

    if (cutoffDate) {
      conditions.push(gte(jobApplications.createdAt, cutoffDate));
    }

    const apps = await this.db
      .select()
      .from(jobApplications)
      .where(and(...conditions));

    if (apps.length === 0) {
      return { applications: [], stagesByAppId: new Map(), validatedOptions };
    }

    const appIds = apps.map((a) => a.id);

    // Fetch all stages for these applications
    const stages = await this.db
      .select()
      .from(applicationStages)
      .where(and(eq(applicationStages.tenantId, context.tenantId)));

    // Filter stages in memory matching appIds
    const appIdSet = new Set(appIds);
    const relevantStages = stages.filter((s) => appIdSet.has(s.applicationId));

    const stagesByAppId = new Map();
    for (const s of relevantStages) {
      if (!stagesByAppId.has(s.applicationId)) {
        stagesByAppId.set(s.applicationId, []);
      }
      stagesByAppId.get(s.applicationId).push(s);
    }

    return { applications: apps, stagesByAppId, validatedOptions };
  }

  /**
   * Annotates an application record with progression flags.
   *
   * @param {object} app
   * @param {Array<object>} stages
   * @returns {object} Annotated application
   */
  _annotateApplication(app, stages = []) {
    const isSubmitted = app.status !== 'SAVED' || Boolean(app.appliedAt);

    const hasInterviewStage = stages.some((s) =>
      [
        'RECRUITER_SCREEN',
        'TECHNICAL_ASSESSMENT',
        'SYSTEM_DESIGN',
        'BEHAVIORAL',
        'ONSITE_LOOP',
        'OFFER_NEGOTIATION',
        'POST_OFFER',
      ].includes(s.stageType)
    );

    const hasProgressionStatus = [
      'SCREENING',
      'INTERVIEWING',
      'OFFER_RECEIVED',
      'OFFER_ACCEPTED',
    ].includes(app.status);

    const isResponded = hasProgressionStatus || hasInterviewStage;
    const isWithdrawn = app.status === 'WITHDRAWN';
    const isWithdrawnBeforeResponse = isWithdrawn && !isResponded;

    const isInterview =
      ['INTERVIEWING', 'OFFER_RECEIVED', 'OFFER_ACCEPTED'].includes(app.status) ||
      stages.some((s) =>
        [
          'TECHNICAL_ASSESSMENT',
          'SYSTEM_DESIGN',
          'BEHAVIORAL',
          'ONSITE_LOOP',
          'OFFER_NEGOTIATION',
          'POST_OFFER',
        ].includes(s.stageType)
      );

    const isOffer =
      ['OFFER_RECEIVED', 'OFFER_ACCEPTED'].includes(app.status) ||
      stages.some(
        (s) =>
          ['OFFER_NEGOTIATION', 'POST_OFFER'].includes(s.stageType) ||
          (s.stageType === 'ONSITE_LOOP' && s.outcome === 'PASSED')
      );

    const isAccepted = app.status === 'OFFER_ACCEPTED';

    // Extract score
    let overallScore = null;
    if (app.atsFitSnapshot && typeof app.atsFitSnapshot === 'object') {
      const rawScore = app.atsFitSnapshot.overallScore ?? app.atsFitSnapshot.atsScore;
      if (typeof rawScore === 'number' && !isNaN(rawScore)) {
        overallScore = rawScore;
      }
    }

    return {
      ...app,
      isSubmitted,
      isResponded,
      isWithdrawn,
      isWithdrawnBeforeResponse,
      isInterview,
      isOffer,
      isAccepted,
      overallScore,
    };
  }

  /**
   * Computes Match Score vs. Response Rate correlation across 5 deterministic bands.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
   * @param {string} candidateId Candidate UUID
   * @param {object} [options={}] Filter options
   * @returns {Promise<object>} ScoreProgressionCorrelationOutputSchema validated output
   */
  async getScoreProgressionCorrelation(context, candidateId, options = {}) {
    const { applications, stagesByAppId, validatedOptions } =
      await this._fetchCandidateApplicationsWithStages(context, candidateId, options);

    const annotatedApps = applications.map((a) =>
      this._annotateApplication(a, stagesByAppId.get(a.id) || [])
    );

    // Only submitted applications participate in response rate correlation
    const submittedApps = annotatedApps.filter((a) => a.isSubmitted);

    const bandDefinitions = [
      {
        scoreBand: '85.0-100.0',
        bandLabel: 'EXCELLENT',
        minScore: 85.0,
        maxScore: 100.0,
        filter: (score) => score !== null && score >= 85.0 && score <= 100.0,
      },
      {
        scoreBand: '70.0-84.9',
        bandLabel: 'STRONG',
        minScore: 70.0,
        maxScore: 84.9,
        filter: (score) => score !== null && score >= 70.0 && score < 85.0,
      },
      {
        scoreBand: '50.0-69.9',
        bandLabel: 'MODERATE',
        minScore: 50.0,
        maxScore: 69.9,
        filter: (score) => score !== null && score >= 50.0 && score < 70.0,
      },
      {
        scoreBand: '0.0-49.9',
        bandLabel: 'LOW',
        minScore: 0.0,
        maxScore: 49.9,
        filter: (score) => score !== null && score >= 0.0 && score < 50.0,
      },
      {
        scoreBand: 'UNSCORED',
        bandLabel: 'UNSCORED',
        minScore: null,
        maxScore: null,
        filter: (score) => score === null,
      },
    ];

    let totalScoredCount = 0;
    let totalUnscoredCount = 0;

    const scoreBands = bandDefinitions.map((def) => {
      const cohort = submittedApps.filter((a) => def.filter(a.overallScore));
      if (def.bandLabel !== 'UNSCORED') {
        totalScoredCount += cohort.length;
      } else {
        totalUnscoredCount += cohort.length;
      }

      const totalApplications = cohort.length;
      const respondedCount = cohort.filter((a) => a.isResponded).length;
      const withdrawnBeforeResponse = cohort.filter((a) => a.isWithdrawnBeforeResponse).length;
      const effectiveDenominator = totalApplications - withdrawnBeforeResponse;
      const interviewCount = cohort.filter((a) => a.isInterview).length;
      const offerCount = cohort.filter((a) => a.isOffer).length;

      let observedResponseRate = null;
      let sampleSizeAdequate = false;
      let statisticalWarning = 'INSUFFICIENT_DATA';

      if (effectiveDenominator >= MIN_SAMPLE_SIZE_FOR_RATES) {
        observedResponseRate = round((respondedCount / effectiveDenominator) * 100, 2);
        sampleSizeAdequate = true;
        statisticalWarning = null;
      }

      return {
        scoreBand: def.scoreBand,
        bandLabel: def.bandLabel,
        minScore: def.minScore,
        maxScore: def.maxScore,
        totalApplications,
        respondedCount,
        observedResponseRate,
        interviewCount,
        offerCount,
        sampleSizeAdequate,
        statisticalWarning,
      };
    });

    const output = {
      candidateId,
      timeWindow: validatedOptions.timeWindow,
      filters: {
        source: validatedOptions.source || null,
        workplaceType: validatedOptions.workplaceType || null,
      },
      scoreBands,
      totalScoredApplications: totalScoredCount,
      totalUnscoredApplications: totalUnscoredCount,
      disclaimer: NON_CAUSAL_DISCLAIMER,
    };

    return ScoreProgressionCorrelationOutputSchema.parse(output);
  }

  /**
   * Computes normalized skill-gap frequencies across target applications.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
   * @param {string} candidateId Candidate UUID
   * @param {object} [options={}] Filter options
   * @returns {Promise<object>} SkillGapFrequencyOutputSchema validated output
   */
  async getSkillGapFrequency(context, candidateId, options = {}) {
    const { applications, validatedOptions } = await this._fetchCandidateApplicationsWithStages(
      context,
      candidateId,
      options
    );

    // Extract applications with parsed JD or ATS snapshot
    const analyzedApps = applications.filter(
      (a) =>
        (a.atsFitSnapshot && typeof a.atsFitSnapshot === 'object') ||
        (a.parsedJobDescription && typeof a.parsedJobDescription === 'object')
    );

    const totalAnalyzedApplications = analyzedApps.length;

    if (totalAnalyzedApplications === 0) {
      return SkillGapFrequencyOutputSchema.parse({
        candidateId,
        timeWindow: validatedOptions.timeWindow,
        totalAnalyzedApplications: 0,
        items: [],
        disclaimer: NON_CAUSAL_DISCLAIMER,
      });
    }

    // Map: canonicalSlug -> { skillSlug, skillName, category, demandedCount, gapCount }
    const skillStatsMap = new Map();

    for (const app of analyzedApps) {
      const appDemandedSlugs = new Set();
      const appGapSlugs = new Set();

      // 1. Extract demanded skills
      const requirements = app.parsedJobDescription?.requirements || [];
      for (const req of requirements) {
        const rawName = req.extractedValue || req.name || req.skillSlug || '';
        if (rawName) {
          const normalized = normalizeSkill(rawName, req.category);
          appDemandedSlugs.add(normalized.canonicalSlug);
          if (!skillStatsMap.has(normalized.canonicalSlug)) {
            skillStatsMap.set(normalized.canonicalSlug, {
              skillSlug: normalized.canonicalSlug,
              skillName: normalized.canonicalName,
              category: normalized.category,
              demandedInJobsCount: 0,
              gapInJobsCount: 0,
            });
          }
        }
      }

      // Also check atsFitSnapshot requirement matches
      const reqMatches = app.atsFitSnapshot?.requirementMatches || [];
      for (const m of reqMatches) {
        const rawName = m.skillSlug || m.extractedValue || '';
        if (rawName) {
          const normalized = normalizeSkill(rawName, m.category);
          appDemandedSlugs.add(normalized.canonicalSlug);
          if (!skillStatsMap.has(normalized.canonicalSlug)) {
            skillStatsMap.set(normalized.canonicalSlug, {
              skillSlug: normalized.canonicalSlug,
              skillName: normalized.canonicalName,
              category: normalized.category,
              demandedInJobsCount: 0,
              gapInJobsCount: 0,
            });
          }
        }
      }

      // 2. Extract missing skills / gaps
      const missingSkills =
        app.atsFitSnapshot?.missingSkills || app.atsFitSnapshot?.skillGaps || [];

      for (const gap of missingSkills) {
        const rawName = typeof gap === 'string' ? gap : gap.skillSlug || gap.skillName || '';
        if (rawName) {
          const normalized = normalizeSkill(
            rawName,
            typeof gap === 'object' ? gap.category : undefined
          );
          appGapSlugs.add(normalized.canonicalSlug);
          // Gaps also count as demanded in that job
          appDemandedSlugs.add(normalized.canonicalSlug);

          if (!skillStatsMap.has(normalized.canonicalSlug)) {
            skillStatsMap.set(normalized.canonicalSlug, {
              skillSlug: normalized.canonicalSlug,
              skillName: normalized.canonicalName,
              category: normalized.category,
              demandedInJobsCount: 0,
              gapInJobsCount: 0,
            });
          }
        }
      }

      // Record per-application increments
      for (const slug of appDemandedSlugs) {
        const stat = skillStatsMap.get(slug);
        if (stat) stat.demandedInJobsCount += 1;
      }

      for (const slug of appGapSlugs) {
        const stat = skillStatsMap.get(slug);
        if (stat) stat.gapInJobsCount += 1;
      }
    }

    // Compute frequencies and format items
    const items = Array.from(skillStatsMap.values())
      .filter((stat) => stat.gapInJobsCount > 0) // Focus on identified skill gaps
      .map((stat) => {
        const targetDemandFrequency = round(
          (stat.demandedInJobsCount / totalAnalyzedApplications) * 100,
          2
        );
        const overallGapRate = round((stat.gapInJobsCount / totalAnalyzedApplications) * 100, 2);

        let conditionalGapRate = null;
        let sampleSizeAdequate = false;
        let statisticalWarning = 'INSUFFICIENT_DATA';

        if (stat.demandedInJobsCount >= MIN_SAMPLE_SIZE_FOR_RATES) {
          conditionalGapRate = round((stat.gapInJobsCount / stat.demandedInJobsCount) * 100, 2);
          sampleSizeAdequate = true;
          statisticalWarning = null;
        }

        return {
          skillSlug: stat.skillSlug,
          skillName: stat.skillName,
          category: stat.category,
          demandedInJobsCount: stat.demandedInJobsCount,
          gapInJobsCount: stat.gapInJobsCount,
          totalAnalyzedJobsCount: totalAnalyzedApplications,
          targetDemandFrequency,
          overallGapRate,
          conditionalGapRate,
          sampleSizeAdequate,
          statisticalWarning,
        };
      })
      .sort((a, b) => {
        // Sort by gap count DESC, then demand frequency DESC
        if (b.gapInJobsCount !== a.gapInJobsCount) {
          return b.gapInJobsCount - a.gapInJobsCount;
        }
        return (b.targetDemandFrequency || 0) - (a.targetDemandFrequency || 0);
      });

    const output = {
      candidateId,
      timeWindow: validatedOptions.timeWindow,
      totalAnalyzedApplications,
      items,
      disclaimer: NON_CAUSAL_DISCLAIMER,
    };

    return SkillGapFrequencyOutputSchema.parse(output);
  }

  /**
   * Generates comprehensive aggregate analytics for a candidate.
   *
   * @param {import('../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
   * @param {string} candidateId Candidate UUID
   * @param {object} [options={}] Filter options
   * @returns {Promise<object>} CandidateAnalyticsSummaryOutputSchema validated output
   */
  async getCandidateAnalytics(context, candidateId, options = {}) {
    const { applications, stagesByAppId, validatedOptions } =
      await this._fetchCandidateApplicationsWithStages(context, candidateId, options);

    const annotatedApps = applications.map((a) =>
      this._annotateApplication(a, stagesByAppId.get(a.id) || [])
    );

    const trackedPortfolioTotal = annotatedApps.length;
    const submittedApps = annotatedApps.filter((a) => a.isSubmitted);
    const submittedCount = submittedApps.length;
    const respondedCount = submittedApps.filter((a) => a.isResponded).length;
    const withdrawnCount = submittedApps.filter((a) => a.isWithdrawn).length;
    const withdrawnBeforeResponseCount = submittedApps.filter(
      (a) => a.isWithdrawnBeforeResponse
    ).length;
    const interviewCount = submittedApps.filter((a) => a.isInterview).length;
    const offerCount = submittedApps.filter((a) => a.isOffer).length;
    const acceptedCount = submittedApps.filter((a) => a.isAccepted).length;

    const effectiveDenominator = submittedCount - withdrawnBeforeResponseCount;

    let observedResponseRate = null;
    let sampleSizeAdequate = false;
    let statisticalWarning = 'INSUFFICIENT_DATA';

    if (effectiveDenominator >= MIN_SAMPLE_SIZE_FOR_RATES) {
      observedResponseRate = round((respondedCount / effectiveDenominator) * 100, 2);
      sampleSizeAdequate = true;
      statisticalWarning = null;
    }

    const funnel = {
      trackedPortfolioTotal,
      submittedCount,
      respondedCount,
      withdrawnBeforeResponseCount,
      withdrawnCount,
      interviewCount,
      offerCount,
      acceptedCount,
      observedResponseRate,
      sampleSizeAdequate,
      statisticalWarning,
    };

    // Sub-aggregations
    const scoreCorrelation = await this.getScoreProgressionCorrelation(
      context,
      candidateId,
      options
    );
    const skillGapResult = await this.getSkillGapFrequency(context, candidateId, options);

    const output = {
      candidateId,
      timeWindow: validatedOptions.timeWindow,
      filters: {
        source: validatedOptions.source || null,
        workplaceType: validatedOptions.workplaceType || null,
      },
      funnel,
      scoreCorrelation,
      topSkillGaps: skillGapResult.items.slice(0, 10),
      disclaimer: NON_CAUSAL_DISCLAIMER,
    };

    return CandidateAnalyticsSummaryOutputSchema.parse(output);
  }
}
