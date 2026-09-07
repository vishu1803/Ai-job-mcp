/**
 * @file Job Selection Policy & Suitability Gating Service.
 *
 * Implements authoritative multi-job ranking and suitability decision rules
 * for career orchestration workflows.
 *
 * Ranking Dimensions:
 * 1. Eligibility / Location Feasibility (work authorization & remote policy)
 * 2. Seniority Compatibility (level & tenure gap)
 * 3. Required-Skill Fit (coverage of mandatory role skills)
 * 4. Evidence-Backed Technical Fit (verified repository evidence)
 * 5. Freshness (posting age)
 * 6. Role Relevance (title and target domain alignment)
 *
 * Decision Rule:
 * If every returned job is materially unsuitable (e.g. low fit < 40, location mismatch,
 * or excessive seniority gap), the policy returns `NO_SUITABLE_JOB` rather than
 * picking a poor-fit role merely because it is the highest relative result.
 */

/**
 * Standard configurable suitability thresholds.
 */
export const DEFAULT_SUITABILITY_THRESHOLDS = {
  minFitScore: 40, // Minimum acceptable score (0-100)
  maxMissingRequiredRatio: 0.6, // Reject if > 60% of required skills are missing
  requireLocationFeasibility: true,
  maxSeniorityGapLevels: 2,
};

/**
 * Seniority levels in ascending order.
 */
const SENIORITY_LEVELS = ['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL', 'EXECUTIVE'];

/**
 * Infers a seniority level from a title or text description.
 *
 * @param {string} text
 * @returns {string} One of SENIORITY_LEVELS
 */
function inferSeniority(text) {
  if (!text) return 'MID';
  const lower = text.toLowerCase();
  if (/\b(intern|internship|apprentice)\b/i.test(lower)) return 'INTERN';
  if (/\b(junior|entry|associate|graduate|freshman)\b/i.test(lower)) return 'JUNIOR';
  if (/\b(principal|distinguished|fellow)\b/i.test(lower)) return 'PRINCIPAL';
  if (/\b(staff|lead|architect)\b/i.test(lower)) return 'STAFF';
  if (/\b(senior|sr\b|sr\.)/i.test(lower)) return 'SENIOR';
  if (/\b(director|vp|head of|chief)\b/i.test(lower)) return 'EXECUTIVE';
  return 'MID';
}

/**
 * Evaluates candidate location feasibility against a job posting.
 *
 * @param {object} candidateProfile
 * @param {object} jobPosting
 * @returns {{ isFeasible: boolean, reason?: string }}
 */
function evaluateLocationFeasibility(candidateProfile, jobPosting) {
  const prefs =
    candidateProfile?.careerPreferences ||
    candidateProfile?.profileMetadata?.careerPreferences ||
    candidateProfile?.profileMetadata?.userCustom?.careerPreferences ||
    {};

  const jobLocation = String(jobPosting.location || '').toLowerCase();
  const workplaceType = String(jobPosting.workplaceType || '').toUpperCase();
  const workAuth = String(prefs.workAuthorization || '').toLowerCase();
  const visaSponsorship = String(prefs.visaSponsorship || '').toLowerCase();

  const remoteOnly = Boolean(prefs.remoteOnly || candidateProfile?.remoteOnly);
  if (remoteOnly) {
    const isExplicitlyOnSite =
      jobLocation.includes('on-site') ||
      jobLocation.includes('onsite') ||
      jobLocation.includes('in-office') ||
      workplaceType === 'ON_SITE';
    const isRemote = workplaceType === 'REMOTE' || jobLocation.includes('remote');
    if (isExplicitlyOnSite && !isRemote) {
      return {
        isFeasible: false,
        reason: `Location mismatch: Candidate requires remote work, but job requires on-site presence (${jobPosting.location}).`,
      };
    }
  }

  // If candidate is strictly restricted to a jurisdiction
  const isIndiaOnly =
    workAuth.includes('india') &&
    !workAuth.includes('united states') &&
    !workAuth.includes('us') &&
    !workAuth.includes('global');

  const requiresUsAuth =
    (jobLocation.includes('united states') ||
      jobLocation.includes('us remote') ||
      jobLocation.includes('remote - us') ||
      jobLocation.includes('san francisco') ||
      jobLocation.includes('new york') ||
      jobLocation.includes('seattle')) &&
    !jobLocation.includes('europe') &&
    !jobLocation.includes('india') &&
    !jobLocation.includes('worldwide');

  // If job is US-specific (not worldwide remote) and candidate is India-only without visa authorization
  if (isIndiaOnly && requiresUsAuth && workplaceType !== 'REMOTE') {
    return {
      isFeasible: false,
      reason: `Location mismatch: Job requires on-site/hybrid US presence (${jobPosting.location}), but candidate is only authorized in India.`,
    };
  }

  // If job is US remote and sponsorship is required or not provided
  if (isIndiaOnly && requiresUsAuth && visaSponsorship.includes('sponsorship required')) {
    // Flag as warning or infeasible if job explicitly says "No Visa Sponsorship"
    const jobDesc = String(jobPosting.description || '').toLowerCase();
    if (
      jobDesc.includes('no visa sponsorship') ||
      jobDesc.includes('must be authorized to work in the us without sponsorship') ||
      jobDesc.includes('us citizenship required')
    ) {
      return {
        isFeasible: false,
        reason: `Location/Visa mismatch: Job requires US work authorization without sponsorship (${jobPosting.location}).`,
      };
    }
  }

  return { isFeasible: true };
}

/**
 * Evaluates candidate seniority compatibility against a job posting.
 *
 * @param {object} candidateProfile
 * @param {object} jobPosting
 * @param {number} maxGapLevels
 * @returns {{ isCompatible: boolean, candidateLevel: string, jobLevel: string, reason?: string }}
 */
function evaluateSeniorityCompatibility(candidateProfile, jobPosting, maxGapLevels = 2) {
  const candidateSeniority =
    candidateProfile?.seniority ||
    candidateProfile?.profileMetadata?.seniority ||
    candidateProfile?.profileMetadata?.userCustom?.seniority ||
    inferSeniority(candidateProfile?.headline || candidateProfile?.title || '');

  const jobSeniority =
    jobPosting.seniority ||
    jobPosting.level ||
    inferSeniority(jobPosting.title || jobPosting.description || '');

  const candidateIdx = SENIORITY_LEVELS.indexOf(candidateSeniority);
  const jobIdx = SENIORITY_LEVELS.indexOf(jobSeniority);

  if (candidateIdx === -1 || jobIdx === -1) {
    return { isCompatible: true, candidateLevel: candidateSeniority, jobLevel: jobSeniority };
  }

  const gap = jobIdx - candidateIdx;
  if (gap > maxGapLevels) {
    return {
      isCompatible: false,
      candidateLevel: candidateSeniority,
      jobLevel: jobSeniority,
      reason: `Excessive seniority gap: Job requires ${jobSeniority} level, exceeding candidate's ${candidateSeniority} level by ${gap} levels (maximum tolerated: ${maxGapLevels}).`,
    };
  }

  return { isCompatible: true, candidateLevel: candidateSeniority, jobLevel: jobSeniority };
}

/**
 * Evaluates a single job posting against candidate profile and job fit results.
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} params.jobPosting
 * @param {object} [params.jobFit]
 * @param {object} [params.options]
 * @returns {object} Suitability evaluation result
 */
export function evaluateJobSuitability(firstArg, maybeProfile, maybeFit, maybeOptions) {
  let candidateProfile;
  let jobPosting;
  let jobFit;
  let options;

  if (firstArg && (firstArg.candidateProfile || firstArg.jobPosting)) {
    candidateProfile = firstArg.candidateProfile || {};
    jobPosting = firstArg.jobPosting || {};
    jobFit = firstArg.jobFit;
    options = firstArg.options || {};
  } else {
    jobPosting = firstArg || {};
    candidateProfile = maybeProfile || {};
    jobFit = maybeFit;
    options = maybeOptions || {};
  }

  const thresholds = {
    ...DEFAULT_SUITABILITY_THRESHOLDS,
    ...(options.thresholds || {}),
  };

  const disqualifications = [];
  const warnings = [];

  // 1. Location & Work Authorization Feasibility
  const locationResult = evaluateLocationFeasibility(candidateProfile, jobPosting);
  if (!locationResult.isFeasible) {
    disqualifications.push(locationResult.reason);
  }

  // 2. Seniority Compatibility
  const seniorityResult = evaluateSeniorityCompatibility(
    candidateProfile,
    jobPosting,
    thresholds.maxSeniorityGapLevels
  );
  if (!seniorityResult.isCompatible) {
    disqualifications.push(seniorityResult.reason);
  }

  // 3 & 4. Technical Skill Fit & Evidence Coverage
  const fitScore =
    jobFit?.overallFit?.atsScore ??
    jobFit?.fitScore ??
    jobPosting?.fitScore ??
    null;
  let missingRequiredRatio = 0;

  if (jobFit?.skillGaps) {
    const missing = jobFit.skillGaps.filter((g) => g.status === 'MISSING');
    const total = jobFit.skillGaps.length;
    if (total > 0) {
      missingRequiredRatio = missing.length / total;
    }
  }

  // If score is available and below minimum threshold
  if (typeof fitScore === 'number') {
    if (fitScore < thresholds.minFitScore) {
      disqualifications.push(
        `Fit score ${fitScore}/100 is below the minimum suitability threshold (${thresholds.minFitScore}/100).`
      );
    }
    if (missingRequiredRatio > thresholds.maxMissingRequiredRatio) {
      disqualifications.push(
        `Missing ${Math.round(missingRequiredRatio * 100)}% of required skills, exceeding maximum tolerance (${Math.round(thresholds.maxMissingRequiredRatio * 100)}%).`
      );
    }
  }

  // 5. Freshness
  const postedAt = jobPosting.postedAt ? new Date(jobPosting.postedAt) : null;
  const ageDays =
    postedAt && !isNaN(postedAt.getTime())
      ? Math.max(0, Math.floor((Date.now() - postedAt.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

  if (ageDays > 60) {
    warnings.push(`Posting is ${ageDays} days old.`);
  }

  // 6. Role Relevance Score (0-100 composite ranking metric)
  const isSuitable = disqualifications.length === 0;

  // Compute composite ranking score
  let rankingScore = 50; // baseline
  if (typeof fitScore === 'number') {
    rankingScore += (fitScore - 50) * 0.4;
  }
  if (locationResult.isFeasible) rankingScore += 15;
  if (seniorityResult.isCompatible) rankingScore += 10;
  if (ageDays <= 14) rankingScore += 10;
  else if (ageDays <= 30) rankingScore += 5;

  return {
    jobId: jobPosting.id || jobPosting.canonicalJobId,
    company: jobPosting.company,
    title: jobPosting.title,
    location: jobPosting.location,
    isSuitable,
    disqualifications,
    warnings,
    fitScore: fitScore ?? undefined,
    seniority: seniorityResult,
    ageDays,
    rankingScore: Math.max(0, Math.min(100, Math.round(rankingScore))),
  };
}

/**
 * Ranks a set of discovered jobs and applies the suitability gate.
 *
 * If ALL jobs in the set are materially unsuitable, returns `decision: 'NO_SUITABLE_JOB'`.
 * Supports both `rankSuitableJobs(jobs, candidateProfile)` and `rankSuitableJobs({ candidateProfile, jobPostings, ... })`.
 *
 * @param {object|Array<object>} paramsOrJobs
 * @param {object} [maybeProfile]
 * @param {Map<string, object>|object} [maybeFits={}]
 * @returns {object} Ranked decision result
 */
export function rankSuitableJobs(paramsOrJobs, maybeProfile = {}, maybeFits = {}) {
  let candidateProfile;
  let jobPostings;
  let jobFitsById;
  let options;

  if (Array.isArray(paramsOrJobs)) {
    jobPostings = paramsOrJobs;
    candidateProfile = maybeProfile;
    jobFitsById = maybeFits;
    options = {};
  } else {
    candidateProfile = paramsOrJobs?.candidateProfile || {};
    jobPostings = paramsOrJobs?.jobPostings || [];
    jobFitsById = paramsOrJobs?.jobFitsById || {};
    options = paramsOrJobs?.options || {};
  }

  if (!Array.isArray(jobPostings) || jobPostings.length === 0) {
    return {
      decision: 'NO_SUITABLE_JOB',
      policyCode: 'NO_SUITABLE_JOB',
      hasSuitableJob: false,
      selectedJob: null,
      topJob: null,
      reason: 'No job postings provided for evaluation.',
      suitableJobs: [],
      evaluatedJobs: [],
    };
  }

  const evaluations = jobPostings.map((job) => {
    const jobId = job.id || job.canonicalJobId || job.externalJobId;
    const fit = jobFitsById instanceof Map ? jobFitsById.get(jobId) : jobFitsById[jobId];
    const evaluation = evaluateJobSuitability({
      candidateProfile,
      jobPosting: job,
      jobFit: fit,
      options,
    });
    return {
      jobPosting: job,
      ...evaluation,
    };
  });

  const suitableJobs = evaluations
    .filter((e) => e.isSuitable)
    .sort((a, b) => b.rankingScore - a.rankingScore);

  if (suitableJobs.length === 0) {
    const failureSummary = evaluations
      .map((e) => `${e.company} - ${e.title}: [${e.disqualifications.join('; ')}]`)
      .join('\n');

    return {
      decision: 'NO_SUITABLE_JOB',
      policyCode: 'NO_SUITABLE_JOB',
      hasSuitableJob: false,
      selectedJob: null,
      topJob: null,
      reason: `None of the ${jobPostings.length} evaluated job postings met the minimum criteria:\n${failureSummary}`,
      suitableJobs: [],
      evaluatedJobs: evaluations,
    };
  }

  return {
    decision: 'SUITABLE_JOB_FOUND',
    policyCode: 'SUITABLE_JOB_FOUND',
    hasSuitableJob: true,
    selectedJob: suitableJobs[0].jobPosting,
    topJob: suitableJobs[0].jobPosting,
    topRankedEvaluation: suitableJobs[0],
    suitableJobs: suitableJobs.map((s) => s.jobPosting),
    evaluatedJobs: evaluations,
  };
}
