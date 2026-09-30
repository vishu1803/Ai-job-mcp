/**
 * @file Open Source Contribution Intelligence Service (Phase 7)
 *
 * Implements first-class Open Source Contribution scoring and provenance tracking.
 * STRICT INVARIANT:
 * - Distinguishes personal repositories from external open-source contributions.
 * - Vanity metrics (e.g. stars on cloned/forked repos) are strictly capped or discounted.
 * - External merged pull requests and maintainer roles receive highest confidence.
 */

import crypto from 'node:crypto';
import { OpenSourceIntelligenceReportSchema } from '../domain/career/open-source-intelligence.schemas.js';

export class OpenSourceIntelligenceService {
  /**
   * Evaluates open source contributions from candidate profile and GitHub activity.
   *
   * @param {object} params
   * @param {object} [params.canonicalProfile] Canonical profile from Phase 3 parser
   * @param {Array<object>} [params.githubActivities] Ingested GitHub activity items
   * @param {Array<object>} [params.resources] Connected GitHub resources
   * @returns {object} Validated OpenSourceIntelligenceReport
   */
  evaluateOpenSourceContributions({
    canonicalProfile = null,
    githubActivities = [],
    resources = [],
  } = {}) {
    const activities = [];
    const warnings = [];
    const keyAchievements = [];

    // 1. Process explicit open source contributions from canonical profile
    const profileContributions = canonicalProfile?.openSourceContributions || [];
    for (const c of profileContributions) {
      const isExternal = c.role === 'EXTERNAL_CONTRIBUTOR' || c.role === 'ORGANIZATION_MEMBER';
      activities.push({
        id: crypto.randomUUID(),
        repository: c.repository,
        organization: c.organization || null,
        isFork: false,
        isExternal,
        role: isExternal ? 'EXTERNAL_OPEN_SOURCE_CONTRIBUTION' : 'MAINTAINER',
        mergedPullRequestsCount: c.mergedPrCount || (isExternal ? 1 : 0),
        openPullRequestsCount: 0,
        acceptedCommitsCount: isExternal ? 5 : 20,
        codeReviewsCount: 0,
        issuesResolvedCount: 0,
        repositoryStars: c.starsCount || 0,
        technologies: c.technologies || [],
        evidenceUrl: c.prUrl || null,
        provenanceConfidence: 0.9,
        contributionSummary: c.description || `Contribution to ${c.repository}`,
      });
    }

    // 2. Process connected GitHub activities/resources
    for (const act of githubActivities) {
      const isExternal = Boolean(act.isExternal);
      activities.push({
        id: crypto.randomUUID(),
        repository: act.repository || 'unknown/repo',
        organization: act.organization || null,
        isFork: Boolean(act.isFork),
        isExternal,
        role: isExternal
          ? 'EXTERNAL_OPEN_SOURCE_CONTRIBUTION'
          : act.isMaintainer
            ? 'MAINTAINER'
            : 'PERSONAL_PROJECT',
        mergedPullRequestsCount: act.mergedPrs || 0,
        openPullRequestsCount: act.openPrs || 0,
        acceptedCommitsCount: act.commits || 0,
        codeReviewsCount: act.reviews || 0,
        issuesResolvedCount: act.issuesResolved || 0,
        repositoryStars: act.stars || 0,
        technologies: act.technologies || [],
        evidenceUrl: act.url || null,
        provenanceConfidence: 0.95,
        contributionSummary: act.summary || `Activity on ${act.repository}`,
      });
    }

    // 3. Compute Component Scores
    let totalExternalPrs = 0;
    let totalReviews = 0;
    let totalAcceptedCommits = 0;
    let maintainerCount = 0;
    let maxRepoStars = 0;

    let personalCount = 0;
    let externalCount = 0;

    for (const a of activities) {
      if (a.isExternal) {
        externalCount++;
        totalExternalPrs += a.mergedPullRequestsCount;
        totalReviews += a.codeReviewsCount;
        totalAcceptedCommits += a.acceptedCommitsCount;
      } else {
        personalCount++;
        if (a.role === 'MAINTAINER') maintainerCount++;
        if (!a.isFork && a.repositoryStars > maxRepoStars) {
          maxRepoStars = a.repositoryStars;
        }
      }
    }

    // Scoring formula:
    // externalMergedPrsScore (0-35)
    const externalMergedPrsScore = Math.min(
      35.0,
      totalExternalPrs * 10.0 + (externalCount > 0 ? 5.0 : 0.0)
    );

    // codeQualityAndReviewsScore (0-25)
    const codeQualityAndReviewsScore = Math.min(
      25.0,
      totalReviews * 5.0 + Math.min(15.0, totalAcceptedCommits * 1.5)
    );

    // maintainerLeadershipScore (0-20)
    const maintainerLeadershipScore = Math.min(20.0, maintainerCount * 10.0);

    // contributionConsistencyScore (0-10)
    const contributionConsistencyScore =
      activities.length > 0 ? Math.min(10.0, activities.length * 2.5) : 0.0;

    // repositoryAdoptionScore (0-10)
    const repositoryAdoptionScore = Math.min(10.0, Math.floor(maxRepoStars / 10));

    let rawScore =
      externalMergedPrsScore +
      codeQualityAndReviewsScore +
      maintainerLeadershipScore +
      contributionConsistencyScore +
      repositoryAdoptionScore;

    // Hard ceiling for personal projects only (cannot exceed 30.0 if zero external contributions)
    if (externalCount === 0 && rawScore > 30.0) {
      rawScore = 30.0;
      warnings.push(
        'Open source score capped at 30.0: candidate has personal repositories but no verified external open-source contributions.'
      );
    }

    const finalScore = Math.round(Math.min(100.0, Math.max(0.0, rawScore)) * 100) / 100;

    // Tier Resolution
    let contributionTier = 'NO_EVIDENCE';
    if (externalCount === 0) {
      contributionTier = activities.length > 0 ? 'PERSONAL_ONLY' : 'NO_EVIDENCE';
    } else if (finalScore >= 80.0) {
      contributionTier = 'PROLIFIC_CONTRIBUTOR';
    } else if (finalScore >= 40.0) {
      contributionTier = 'ACTIVE_CONTRIBUTOR';
    } else if (finalScore >= 20.0) {
      contributionTier = 'OCCASIONAL_CONTRIBUTOR';
    } else {
      contributionTier = 'NO_EVIDENCE';
    }

    if (totalExternalPrs > 0) {
      keyAchievements.push(
        `Merged ${totalExternalPrs} pull requests to external open-source repositories.`
      );
    }
    if (maintainerCount > 0) {
      keyAchievements.push(`Active maintainer of ${maintainerCount} public code repositories.`);
    }

    return OpenSourceIntelligenceReportSchema.parse({
      score: finalScore,
      confidence: activities.length > 0 ? 0.92 : 0.5,
      contributionTier,
      scoreBreakdown: {
        externalMergedPrsScore: Math.round(externalMergedPrsScore * 100) / 100,
        codeQualityAndReviewsScore: Math.round(codeQualityAndReviewsScore * 100) / 100,
        maintainerLeadershipScore: Math.round(maintainerLeadershipScore * 100) / 100,
        contributionConsistencyScore: Math.round(contributionConsistencyScore * 100) / 100,
        repositoryAdoptionScore: Math.round(repositoryAdoptionScore * 100) / 100,
        rawScore: Math.round(rawScore * 100) / 100,
        finalScore,
      },
      totalExternalContributionsCount: externalCount,
      totalPersonalReposCount: personalCount,
      activities,
      keyAchievements,
      warnings,
    });
  }
}

export const openSourceIntelligenceService = new OpenSourceIntelligenceService();
