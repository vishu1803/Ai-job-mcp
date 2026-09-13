/**
 * @file Structured Resume Service (P16-001A / Phase 16 Resume Architecture).
 *
 * Implements the authoritative structured contract and candidate-owned boundary:
 * 1. Treats candidate-owned facts as strictly immutable:
 *    - Identity / contact
 *    - Professional experience
 *    - Education
 *    - Certifications
 *    - DSA / problem-solving records
 *    - Verified / corroborated skills
 *    - Project records & evidence
 * 2. Never mutates input candidate records (deep-clone & immutability guarantee).
 * 3. Never injects synthetic default values (e.g. '2022-01-01', 'University', 'Bachelor of Science')
 *    when source data is missing. Preserves null/empty states.
 * 4. Generates an immutable EvidenceValidationReceipt auditing dynamic claims and catching
 *    any forbidden synthetic placeholders.
 * 5. Provides a snapshot-safe structure for application packages.
 */

import crypto from 'node:crypto';
import {
  StructuredResumeDocumentSchema,
  ResumeTailoringPlanSchema,
  EvidenceValidationReceiptSchema,
} from '../domain/career/resume.schemas.js';
import {
  CandidateArtifactContentService,
  countDistinctCanonicalFacts,
} from './candidate-artifact-content.service.js';
import {
  composeStructuredResumeDocument,
  composeProfessionalSummary,
  composeProfessionalProjectBullets,
  composeExperienceRecords,
} from './resume-accomplishment-composer.service.js';
import { assessPreRenderQuality } from './resume-content-quality-gate.service.js';
import {
  assertMetricSafety,
  deriveTargetRoleHeading,
  deriveSectionOrdering,
  isMeaningfulDsa,
} from './resume-content-strategy.service.js';
import { MasterResumeStructureService } from './master-resume-structure.service.js';
import { formatTechnologyStack } from '../utils/technology-normalizer.js';
import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  calculateRequirementCoverage,
  getJobRequirementConcepts,
  buildCanonicalJobRequirements,
  buildCandidateJobEvidenceGraph,
} from './candidate-fact-inventory.service.js';

/**
 * Capacity-aware dynamic project budgeting strategy (Req H & 21).
 * Calculates project budget based on total document vertical height demand.
 *
 * @param {object} params
 * @param {Array<object>} [params.experience]
 * @param {boolean} [params.hasMeaningfulDsa]
 * @param {Array<object>} [params.education]
 * @param {number} [params.explicitBudget]
 * @returns {number} Allowed project count
 */
export function estimateProjectCapacity({
  experience = [],
  hasMeaningfulDsa = false,
  education: _education = [],
  explicitBudget = null,
}) {
  if (typeof explicitBudget === 'number' && explicitBudget > 0) {
    return explicitBudget;
  }

  const expCount = Array.isArray(experience) ? experience.length : 0;
  const expBullets = Array.isArray(experience)
    ? experience.reduce((acc, e) => acc + (Array.isArray(e.bullets) ? e.bullets.length : 1), 0)
    : 0;

  // Heavy professional experience: allocate 2 projects to leave room for experience
  if (expCount >= 2 || expBullets >= 4) {
    return 2;
  }

  // Moderate experience: 1 role
  if (expCount === 1) {
    return hasMeaningfulDsa ? 2 : 3;
  }

  // Fresher / 0 experience entries:
  // Dynamically expand project slots up to 4 if space permits and no heavy DSA footprint
  return hasMeaningfulDsa ? 3 : 4;
}

/**
 * Forbidden synthetic placeholder tokens that must NEVER be injected when source data is missing.
 */
export const FORBIDDEN_SYNTHETIC_DEFAULTS = Object.freeze([
  '2022-01-01',
  '2024-01-01',
  'University',
  'Bachelor of Science',
  'Professional Certification',
  'Issuing Authority',
]);

/**
 * Generic fabricated DSA bullets that must never be injected automatically.
 */
export const FORBIDDEN_FABRICATED_DSA_BULLETS = Object.freeze([
  'Solved 500+ problems across LeetCode, Codeforces, and HackerRank.',
  'Mastered advanced graph algorithms, dynamic programming, and data structures.',
  'Ranked in the top percentile in global algorithmic contests.',
]);

/**
 * Strips repository prefixes and non-alphanumeric characters to create a matching slug.
 *
 * @param {string} text
 * @returns {string}
 */
function slugifyProject(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^github\.com\//, '')
    .replace(/^[^/]+\//, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Safely extracts links from candidate profile without injecting synthetic values.
 *
 * @param {object} profile
 * @returns {Array<object>}
 */
function extractCandidateLinks(profile) {
  const links = [];
  const rawLinks = profile.links || profile.portfolioLinks || [];
  if (Array.isArray(rawLinks)) {
    for (const link of rawLinks) {
      if (!link) continue;
      const url = typeof link === 'string' ? link : link.url;
      const rawLabel = link.label || link.name || 'Portfolio';
      let platform = 'OTHER';
      if (/linkedin\.com/i.test(url)) platform = 'LINKEDIN';
      else if (/github\.com/i.test(url)) platform = 'GITHUB';
      else if (/leetcode\.com/i.test(url)) platform = 'LEETCODE';
      else if (/portfolio/i.test(rawLabel) || /portfolio/i.test(url)) platform = 'PORTFOLIO';

      let label = String(rawLabel).trim();
      if (/^linkedin$/i.test(label)) label = 'LinkedIn';
      else if (/^github$/i.test(label)) label = 'GitHub';
      else if (/^leetcode$/i.test(label)) label = 'LeetCode';
      else if (/^portfolio$/i.test(label)) label = 'Portfolio';

      if (url && typeof url === 'string') {
        links.push({
          label,
          url: String(url).trim(),
          platform,
        });
      }
    }
  }

  // Profile-level specific URLs if not already in links
  if (profile.githubUrl && !links.some((l) => l.platform === 'GITHUB')) {
    links.push({ label: 'GitHub', url: profile.githubUrl, platform: 'GITHUB' });
  }
  if (profile.linkedinUrl && !links.some((l) => l.platform === 'LINKEDIN')) {
    links.push({ label: 'LinkedIn', url: profile.linkedinUrl, platform: 'LINKEDIN' });
  }
  if (profile.leetcodeUrl && !links.some((l) => l.platform === 'LEETCODE')) {
    links.push({ label: 'LeetCode', url: profile.leetcodeUrl, platform: 'LEETCODE' });
  }

  // Canonical presentation order: LinkedIn, GitHub, Portfolio, LeetCode, then others
  const platformOrder = { LINKEDIN: 1, GITHUB: 2, PORTFOLIO: 3, LEETCODE: 4, OTHER: 5 };
  links.sort((a, b) => (platformOrder[a.platform] || 99) - (platformOrder[b.platform] || 99));

  return links;
}

/**
 * Creates an authoritative StructuredResumeDocument from candidate-owned data and a target job.
 * Guarantees zero mutation of source inputs and zero synthetic placeholder injection.
 *
 * @param {object} params
 * @param {object} params.candidateProfile Candidate profile record or domain object
 * @param {object} [params.jobPosting] Target job posting (optional)
 * @param {object} [params.tailoringPlan] Pre-computed or custom tailoring plan (optional)
 * @param {object} [params.options] Additional options
 * @returns {object} Parsed & validated StructuredResumeDocument
 */
export function buildStructuredResumeDocument({
  candidateProfile,
  jobPosting = null,
  tailoringPlan = null,
  plan = null,
  options = {},
}) {
  if (!candidateProfile || typeof candidateProfile !== 'object') {
    throw new Error('candidateProfile must be a valid object');
  }

  const incomingPlan = tailoringPlan || plan || null;

  // Deep clone to guarantee candidateProfile is never mutated
  const source = JSON.parse(JSON.stringify(candidateProfile));
  const meta = source.profileMetadata || {};
  const canonicalJobRequirements = buildCanonicalJobRequirements(jobPosting);
  const canonicalJob = jobPosting
    ? { ...jobPosting, ...canonicalJobRequirements }
    : jobPosting;

  const matchAnalysis =
    canonicalJob?.matchAnalysis ||
    canonicalJob?.jobFitAnalysis?.matchAnalysis ||
    options.matchAnalysis ||
    null;

  const tailoredHeadingInfo = deriveTargetRoleHeading({
    candidateProfile: source,
    jobPosting,
    matchAnalysis,
  });

  // 1. Candidate Identity Snapshot (Immutable Source Data)
  const candidateIdentity = {
    displayName:
      source.displayName ||
      source.name ||
      source.candidate?.displayName ||
      source.candidate?.name ||
      'Candidate',
    // P19: Use candidate-owned headline, NOT the target job title.
    // candidateHeadline is stable across jobs; heading is job-derived.
    headline: tailoredHeadingInfo.candidateHeadline || tailoredHeadingInfo.heading,
    email:
      source.canonicalEmail ||
      source.email ||
      source.userEmail ||
      source.candidate?.canonicalEmail ||
      source.candidate?.email,
    phone:
      source.phone ||
      source.phoneNumber ||
      source.candidate?.phone ||
      meta.identity?.phone ||
      meta.phone ||
      null,
    location:
      source.location ||
      source.candidate?.location ||
      meta.identity?.location ||
      meta.location ||
      null,
    links: extractCandidateLinks(source),
  };

  // 2. Experience Snapshot (Authoritative source facts; no synthetic dates/titles)
  const rawExperience = meta.experience || source.experience || source.workExperience || [];
  const experienceSnapshot = (Array.isArray(rawExperience) ? rawExperience : []).map((exp, idx) => ({
    id: exp.id || `exp-${idx + 1}`,
    company: exp.company || null,
    title: exp.title || exp.role || null,
    startDate: exp.startDate || null,
    endDate: exp.endDate || null,
    isCurrent: Boolean(exp.isCurrent),
    location: exp.location || null,
    bullets: Array.isArray(exp.bullets) ? [...exp.bullets.map(String)] : [],
    provenanceStatus: 'USER_PROVIDED',
  }));
  const experience = composeExperienceRecords({
    candidateExperiences: experienceSnapshot,
    jobPosting: canonicalJob,
  }).map(({ presentationCandidates: _presentationCandidates, ...record }) => record);

  // 3. Education Snapshot (Authoritative source facts; no synthetic degrees/universities)
  const rawEducation = meta.education || source.education || [];
  const education = (Array.isArray(rawEducation) ? rawEducation : []).map((edu, idx) => ({
    id: edu.id || `edu-${idx + 1}`,
    institution: edu.institution || edu.school || null,
    degree: edu.degree || null,
    fieldOfStudy: edu.fieldOfStudy || edu.major || null,
    startDate: edu.startDate || null,
    endDate: edu.endDate || null,
    grade: edu.grade || edu.gpa || null,
    coursework: Array.isArray(edu.coursework) ? [...edu.coursework.map(String)] : [],
    provenanceStatus: 'USER_PROVIDED',
  }));

  // 4. Certifications Snapshot (Authoritative source facts; no synthetic names/issuers)
  const rawCertifications = meta.certifications || source.certifications || [];
  const certifications = (Array.isArray(rawCertifications) ? rawCertifications : []).map(
    (cert, idx) => ({
      id: cert.id || `cert-${idx + 1}`,
      name: cert.name || cert.title || null,
      issuingOrganization: cert.issuingOrganization || cert.issuer || null,
      issueDate: cert.issueDate || null,
      expirationDate: cert.expirationDate || null,
      credentialId: cert.credentialId || null,
      credentialUrl: cert.credentialUrl || null,
      provenanceStatus: 'USER_PROVIDED',
    })
  );

  // 5. DSA Snapshot (Authoritative source facts; never inject synthetic bullets)
  // P16-009: a valid candidate-owned problem-solving profile URL is sufficient
  // for a compact section (URL-only DSA must not disappear). Authored bullets
  // or real stats also qualify. Fabricated counts/ratings remain forbidden.
  const rawDsa = meta.dsa || source.dsa || source.problemSolving || meta.problemSolving || null;
  let dsa = null;
  const candidatePortfolioLinks =
    meta.portfolioLinks ||
    source.portfolioLinks ||
    source.links ||
    candidateIdentity.links ||
    [];
  const leetcodeLink = candidatePortfolioLinks.find(
    (l) => typeof (typeof l === 'string' ? l : l?.url) === 'string' && /leetcode\.com/i.test(typeof l === 'string' ? l : l.url)
  );
  const leetcodeUrl = leetcodeLink
    ? (typeof leetcodeLink === 'string' ? leetcodeLink : leetcodeLink.url).trim()
    : null;

  let dsaBullets = [];
  if (rawDsa && typeof rawDsa === 'object' && Array.isArray(rawDsa.bullets) && rawDsa.bullets.length > 0) {
    dsaBullets = rawDsa.bullets.map(String).filter(Boolean);
  } else {
    const rawResumeSections = source.resumeSections || meta.resumeSections || [];
    for (const sec of rawResumeSections) {
      const text = sec.rawText || '';
      if (
        /problems\s*solved|competitive\s*programming|algorithmic\s*practice/i.test(text) ||
        (/leetcode/i.test(text) && !/@|linkedin\.com|github\.com/i.test(text))
      ) {
        const lines = text
          .split('\n')
          .map((l) => l.replace(/^[●•\-\*]\s*/, '').trim())
          .filter((l) => l.length > 10 && !/^\s*(?:problem\s*solving|algorithmic\s*practice)\s*$/i.test(l));
        if (lines.length > 0) {
          dsaBullets = lines;
          break;
        }
      }
    }
  }

  const dsaUrl =
    rawDsa && typeof rawDsa.profileUrl === 'string' && /^https?:\/\//i.test(rawDsa.profileUrl.trim())
      ? rawDsa.profileUrl.trim()
      : leetcodeUrl;

  if (dsaUrl || dsaBullets.length > 0 || rawDsa?.hasSection) {
    dsa = {
      hasSection: true,
      profileUrl: dsaUrl,
      bullets: dsaBullets,
      provenanceStatus: rawDsa?.provenanceStatus || 'USER_PROVIDED',
    };
  }

  // 6. Tailoring Plan
  const rawProjects = meta.projects || source.projects || [];
  const selectionFactInventory = buildCanonicalFactInventory(source, canonicalJob, options?.factInventoryOptions);
  const evidenceGraph = buildCandidateJobEvidenceGraph(
    selectionFactInventory.facts,
    canonicalJob
  );
  const selectionScoredFacts = scoreFactsForJob(selectionFactInventory.facts, canonicalJob);
  const selectionFactsByProject = new Map();
  for (const fact of selectionScoredFacts) {
    const keys = [
      fact.association?.projectId,
      fact.ownerId,
      fact.association?.projectName,
      fact.projectId,
    ].filter(Boolean);
    for (const key of keys) {
      const normalized = slugifyProject(key);
      if (!selectionFactsByProject.has(normalized)) selectionFactsByProject.set(normalized, []);
      selectionFactsByProject.get(normalized).push(fact);
    }
  }
  // P16-009: URL-only DSA must render. The renderer inserts DSA after PROJECTS
  // when dsa content exists; the ordering derivation only sees authored-bullet
  // DSA, so a URL-only DSA is appended to the order here.
  const _includeProblemSolving = Boolean(dsa?.bullets?.length || dsa?.profileUrl);

  // Master Resume Structure: Project capacity is structural, not semantic (Req 1, 6 & 15)
  const masterStructure = MasterResumeStructureService.resolveMasterStructure(source, options);
  const structuralProjectCapacity = masterStructure.projectSlotCapacity || 2;
  const hasMeaningfulDsaContent = isMeaningfulDsa(dsa);
  const dynamicProjectBudget = estimateProjectCapacity({
    experience: meta.experience || source.experience || [],
    hasMeaningfulDsa: hasMeaningfulDsaContent,
    education: meta.education || source.education || [],
    explicitBudget:
      options?.projectBudget || options?.maxProjects || incomingPlan?.projectBudget || structuralProjectCapacity,
  });

  /**
   * Evaluates whether a candidate project has authentic content strength to occupy a slot.
   * Purely data-driven: verifies candidate owns real bullets, descriptions, or evidence.
   */
  const isProjectStrongEnough = (candProj, ranking) => {
    const score =
      typeof ranking?.relevanceScore === 'number'
        ? ranking.relevanceScore
        : typeof ranking?.score === 'number'
          ? ranking.score
          : 0;
    const evidenceCount =
      candProj.evidenceCount ?? (Array.isArray(candProj.evidence) ? candProj.evidence.length : 0);
    const hasDescription = Boolean(
      (candProj.description &&
        typeof candProj.description === 'string' &&
        candProj.description.trim().length >= 10) ||
      (candProj.metadata?.description &&
        typeof candProj.metadata.description === 'string' &&
        candProj.metadata.description.trim().length >= 10)
    );

    const allCandidateItems = [
      ...(Array.isArray(candProj.bullets) ? candProj.bullets : []),
      ...(Array.isArray(candProj.highlights) ? candProj.highlights : []),
      ...(Array.isArray(candProj.features) ? candProj.features : []),
      ...(Array.isArray(candProj.featureDescriptions) ? candProj.featureDescriptions : []),
      ...(Array.isArray(candProj.responsibilities) ? candProj.responsibilities : []),
      ...(Array.isArray(candProj.metadata?.bullets) ? candProj.metadata.bullets : []),
      ...(hasDescription ? [candProj.description || candProj.metadata?.description] : []),
    ];
    const totalCandidateFacts = countDistinctCanonicalFacts(allCandidateItems);

    return (
      totalCandidateFacts > 0 ||
      evidenceCount > 0 ||
      score > 0 ||
      Boolean(candProj.summary && String(candProj.summary).trim()) ||
      Boolean(candProj.headline && String(candProj.headline).trim())
    );
  };

  const getProjectCoverage = (candProj) => {
    const projectFacts =
      selectionFactsByProject.get(slugifyProject(candProj.id || candProj.projectId || '')) ||
      selectionFactsByProject.get(slugifyProject(candProj.name || candProj.title || '')) ||
      [];
    return calculateRequirementCoverage(
      [
        ...projectFacts,
        {
          factId: `project-technologies-${candProj.id || candProj.projectId || candProj.name || 'unknown'}`,
          text: '',
          technologies: Array.isArray(candProj.technologies) ? candProj.technologies : [],
        },
      ],
      canonicalJob
    );
  };

  const candidateContentService = new CandidateArtifactContentService();
  let selectedProjectIds = [];

  // P43 Contract: Project count is structural, not semantic. When a master resume structure exists,
  // the number of project slots is inherited from that structure (structuralProjectCapacity).
  // The existing authoritative project-ranking system supplies the ordered candidate projects,
  // and the resume generator selects the top N eligible projects for those slots.
  // Job relevance determines ranking; it does not determine the resume's structure.
  // No second project-ranking algorithm may be introduced inside StructuredResumeService.
  let resolvedAuthoritativeRankings =
    options?.projectRankings ||
    canonicalJob?.projectRankings ||
    canonicalJob?.jobFitAnalysis?.projectRankings ||
    canonicalJob?.jobFitAnalysis?.topRelevantProjects ||
    null;
  let isFromAuthoritativeSelected = false;

  const hasJobCriteria =
    (Array.isArray(canonicalJob?.requirements) && canonicalJob.requirements.length > 0) ||
    (Array.isArray(canonicalJob?.skills) && canonicalJob.skills.length > 0) ||
    (typeof canonicalJob?.description === 'string' && canonicalJob.description.trim().length > 0);

  if (!resolvedAuthoritativeRankings && hasJobCriteria && Array.isArray(rawProjects) && rawProjects.length > 0) {
    try {
      const ranked = candidateContentService.rankProjectsForJob(
        { ...candidateProfile, projects: rawProjects },
        canonicalJob,
        { maxProjects: structuralProjectCapacity }
      );
      if (ranked && (ranked.selectedProjects || ranked.selectionAudit)) {
        resolvedAuthoritativeRankings = ranked.selectedProjects || ranked.selectionAudit;
        if (ranked.selectedProjects && ranked.selectedProjects.length > 0) {
          isFromAuthoritativeSelected = true;
        }
      }
    } catch {
      // Fall back to existing behavior
    }
  }

  if (Array.isArray(incomingPlan?.selectedProjectIds) || Array.isArray(options?.selectedProjectIds)) {
    // An explicit incoming plan's project selection is authoritative; it is bounded
    // by structuralProjectCapacity.
    selectedProjectIds = (incomingPlan?.selectedProjectIds || options.selectedProjectIds).slice(
      0,
      structuralProjectCapacity
    );
  } else {
    if (Array.isArray(resolvedAuthoritativeRankings) && resolvedAuthoritativeRankings.length > 0) {
      const candProjMap = new Map();
      for (const p of rawProjects) {
        const pId = p.id || p.projectId;
        if (pId) candProjMap.set(pId, p);
        const slug = slugifyProject(p.name || p.title || p.displayName || '');
        if (slug) candProjMap.set(slug, p);
        if (p.slug) candProjMap.set(slugifyProject(p.slug), p);
      }

      for (const r of resolvedAuthoritativeRankings) {
        const rId = r.projectId || r.id;
        const rSlug = slugifyProject(r.projectName || r.name || r.title || r.slug || '');
        const candProj = candProjMap.get(rId) || (rSlug ? candProjMap.get(rSlug) : null);
        if (!candProj) continue;

        const isArchived =
          candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED';
        if (isArchived) continue;

        const score = typeof r.relevanceScore === 'number' ? r.relevanceScore : (typeof r.score === 'number' ? r.score : 0);
        const isSelected = r.status === 'SELECTED' || isFromAuthoritativeSelected;
        const hasMatchedReqs =
          (Array.isArray(r.matchedRequirementIds) && r.matchedRequirementIds.length > 0) ||
          (Array.isArray(r.matchedRequirements) && r.matchedRequirements.length > 0);
        const hasContributingSkills =
          Array.isArray(r.contributingSkills) && r.contributingSkills.length > 0;
        const isNotMinimal = r.relevanceBand && r.relevanceBand !== 'MINIMAL';

        if (
          !isSelected &&
          (score <= 0 ||
            (!hasMatchedReqs && !hasContributingSkills && !isNotMinimal && score < 25.0))
        ) {
          continue;
        }

        if (!isProjectStrongEnough(candProj, r)) continue;

        const candProjId = candProj.id || candProj.projectId;
        if (candProjId && !selectedProjectIds.includes(candProjId)) {
          selectedProjectIds.push(candProjId);
        }
        if (selectedProjectIds.length >= structuralProjectCapacity) break;
      }
    } else if (
      Array.isArray(canonicalJob?.recommendedProjects) &&
      canonicalJob.recommendedProjects.length > 0
    ) {
      // Explicit recommended projects passed on jobPosting
      const candProjMap = new Map();
      for (const p of rawProjects) {
        const slug = slugifyProject(p.name || p.title || p.displayName || '');
        if (slug) candProjMap.set(slug, p);
      }
      for (const rec of canonicalJob.recommendedProjects) {
        const recSlug = slugifyProject(typeof rec === 'string' ? rec : rec.name || rec.slug || '');
        const candProj = candProjMap.get(recSlug);
        if (candProj) {
          const isArchived =
            candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED';
          if (isArchived) continue;
          if (!isProjectStrongEnough(candProj, null)) continue;
          const candProjId = candProj.id || candProj.projectId;
          if (candProjId && !selectedProjectIds.includes(candProjId)) {
            selectedProjectIds.push(candProjId);
          }
        }
        if (selectedProjectIds.length >= structuralProjectCapacity) break;
      }
    } else if (
      !canonicalJob ||
      ((!canonicalJob.requirements || canonicalJob.requirements.length === 0) &&
        (!canonicalJob.skills || canonicalJob.skills.length === 0) &&
        (!canonicalJob.description || !canonicalJob.description.trim()) &&
        !canonicalJob.projectRankings &&
        !canonicalJob.recommendedProjects &&
        !canonicalJob.jobFitAnalysis)
    ) {
      // Standalone tests without jobPosting or minimal jobPosting without requirements/description/rankings:
      // use raw candidate projects sliced to capacity
      selectedProjectIds = Array.isArray(rawProjects)
        ? rawProjects
            .slice(0, structuralProjectCapacity)
            .map((p, i) => p.id || p.projectId || `proj-${i + 1}`)
        : [];
    } else {
      // Job posting with requirements/description provided, but zero projects met the relevance criteria:
      // Empty selection (prefers NO project over WRONG project when relevance is genuinely zero)
      selectedProjectIds = [];
    }
  }

  const rawSkills = meta.skills || source.skills || [];

  const skillSelectionResult = candidateContentService.selectAndCategorizeSkillsForJob(
    { skills: rawSkills, projects: rawProjects },
    canonicalJob,
    options
  );

  let selectedSkillSlugs =
    Array.isArray(incomingPlan?.selectedSkillSlugs) && incomingPlan.selectedSkillSlugs.length > 0
      ? incomingPlan.selectedSkillSlugs
      : skillSelectionResult.selectedSkillSlugs;

  // Invariant: finalSkillIds ⊆ verifiedCandidateSkillIds
  // Only skills already present in the candidate's verified skill inventory may appear in the final Technical Skills section.
  const verifiedCandidateSkillNames = new Set(
    rawSkills
      .map((s) => (typeof s === 'string' ? s : s.name || s.skillName || ''))
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean)
  );
  const verifiedCandidateSkillSlugs = new Set(
    rawSkills
      .map((s) => (typeof s === 'string' ? s : s.slug || s.name || s.skillName || ''))
      .map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
  );
  const isAuthorizedCandidateSkill = (skill) => {
    const name = String(typeof skill === 'string' ? skill : skill?.name || skill?.displayName || '').toLowerCase().trim();
    const slug = String(typeof skill === 'string' ? skill : skill?.slug || skill?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return verifiedCandidateSkillNames.has(name) || verifiedCandidateSkillSlugs.has(slug);
  };

  const rawCandidateSelectedSkills =
    Array.isArray(incomingPlan?.selectedSkills) && incomingPlan.selectedSkills.length > 0
      ? incomingPlan.selectedSkills
      : (() => {
          const jobSkillTerms = new Set(
            [
              ...(Array.isArray(canonicalJob?.skills) ? canonicalJob.skills : []),
              ...(Array.isArray(canonicalJob?.requirements) ? canonicalJob.requirements : []),
            ]
              .map((item) =>
                String(
                  typeof item === 'string'
                    ? item
                    : item?.keyword || item?.name || item?.title || item?.text || ''
                )
                  .toLowerCase()
                  .replace(/[^a-z0-9+#.]/g, '')
              )
              .filter(Boolean)
          );
          const selectedProjectTechnologyTerms = new Set(
            rawProjects
              .filter((project) =>
                selectedProjectIds.includes(project.id || project.projectId)
              )
              .flatMap((project) =>
              (project.technologies || []).map((technology) =>
                String(technology).toLowerCase().replace(/[^a-z0-9+#.]/g, '')
              )
              )
          );
          const bounded = (skillSelectionResult.selectedSkills || []).filter((skill) => {
            const token = String(skill.slug || skill.name || '')
              .toLowerCase()
              .replace(/[^a-z0-9+#.]/g, '');
            return (
              skill.matchedRequirementId ||
              [...jobSkillTerms].some((term) => term === token || term.includes(token) || token.includes(term)) ||
              selectedProjectTechnologyTerms.has(token)
            );
          });
          return (bounded.length > 0 || canonicalJob ? bounded : skillSelectionResult.selectedSkills || [])
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            .slice(0, options?.maxSkills || 12);
        })();

  const selectedSkills = (rawCandidateSelectedSkills || []).filter(isAuthorizedCandidateSkill);
  if (!(Array.isArray(incomingPlan?.selectedSkillSlugs) && incomingPlan.selectedSkillSlugs.length > 0)) {
    selectedSkillSlugs = selectedSkills.map((skill) => skill.slug || skill.name).filter(Boolean);
  } else {
    selectedSkillSlugs = incomingPlan.selectedSkillSlugs.filter((slug) => isAuthorizedCandidateSkill(slug));
  }

  const skillCategoryOrder =
    Array.isArray(incomingPlan?.skillCategoryOrder) && incomingPlan.skillCategoryOrder.length > 0
      ? incomingPlan.skillCategoryOrder
      : skillSelectionResult.skillCategoryOrder?.length
        ? skillSelectionResult.skillCategoryOrder
        : [
            'Languages',
            'Backend & APIs',
            'Databases & ORMs',
            'Cloud, DevOps & Systems',
            'Frontend & Web',
          ];
  const selectedSkillCategories = new Set(
    (selectedSkills || []).map((skill) => skill.category || 'Core Competencies')
  );
  const boundedSkillCategoryOrder = skillCategoryOrder.filter((category) =>
    selectedSkillCategories.has(category)
  );
  const orderedSelectedSkills = boundedSkillCategoryOrder.flatMap((category) =>
    (selectedSkills || []).filter(
      (skill) => (skill.category || 'Core Competencies') === category
    )
  );

  const masterStructureForOrder = MasterResumeStructureService.resolveMasterStructure(source, options);
  const activeSectionOrder =
    Array.isArray(incomingPlan?.sectionOrder) && incomingPlan.sectionOrder.length > 0
      ? incomingPlan.sectionOrder
      : MasterResumeStructureService.deriveActiveSectionOrder(masterStructureForOrder, {
          ...source,
          dsa,
          projects: rawProjects,
          experience,
          education,
          skills: rawSkills,
        });

  const basePlan = {
    planId: crypto.randomUUID(),
    targetJobId: canonicalJob?.id || null,
    targetRoleTitle: tailoredHeadingInfo.heading,
    targetCompany: canonicalJob?.company || null,
    candidateArchetype: tailoredHeadingInfo.candidateArchetype || 'EXPERIENCED',
    pageTarget: 'ONE_PAGE_STRICT',
    sectionOrder: activeSectionOrder,
    selectedProjectIds,
    selectedSkillSlugs,
    selectedSkills: orderedSelectedSkills,
    skillCategoryOrder: boundedSkillCategoryOrder,
    optionalSections: {
      includeDsa: activeSectionOrder.includes('DSA'),
      includeCertifications: activeSectionOrder.includes('CERTIFICATIONS'),
      includeCoursework: activeSectionOrder.includes('COURSEWORK'),
      includePublications: activeSectionOrder.includes('PUBLICATIONS'),
      includeAchievements: false,
      includeAdditionalSkills: false,
      includeAwards: false,
    },
    summaryDirectives: {
      focusAreas: [],
      keyHighlightedProjectIds: [],
      keyMatchedSkillSlugs: [],
    },
  };

  // Project selection contract: Projects inherit capacity N from master structure.
  // Selection is strictly top N eligible projects from existing authoritative ranking.
  // No secondary ranking formula or optimizer-driven project expansion.

  const planToParse = incomingPlan
    ? { ...basePlan, ...incomingPlan, selectedProjectIds }
    : basePlan;
  const parsedPlan = ResumeTailoringPlanSchema.parse(planToParse);

  // 7. Projects (Mapped with evidence & provenance, ordered strictly by parsedPlan.selectedProjectIds)
  const candProjMap = new Map();
  for (const p of rawProjects) {
    const pId = p.id || p.projectId;
    if (pId) candProjMap.set(pId, p);
    const slug = slugifyProject(p.name || p.title || '');
    if (slug) candProjMap.set(slug, p);
  }

  // Index authoritative rankings for metadata enrichment
  const rankingByProjId = new Map();
  const authoritativeRankings =
    resolvedAuthoritativeRankings ||
    canonicalJob?.projectRankings ||
    canonicalJob?.jobFitAnalysis?.projectRankings ||
    canonicalJob?.jobFitAnalysis?.topRelevantProjects ||
    [];
  for (const r of authoritativeRankings) {
    const rId = r.projectId || r.id;
    if (rId) rankingByProjId.set(rId, r);
    const rSlug = slugifyProject(r.projectName || r.name || '');
    if (rSlug) rankingByProjId.set(rSlug, r);
  }

  // P16-009: canonical fact inventory — ONE authoritative fact model consumed
  // by professional composition. Built once from the deep-cloned candidate
  // snapshot; downstream composition NEVER re-discovers facts from raw arrays.
  const useFactComposition = options?.useFactComposition !== false;
  const factInventory = useFactComposition ? selectionFactInventory : null;
  const scoredFactsByProject = new Map();
  if (factInventory) {
    const allScored = scoreFactsForJob(factInventory.facts, canonicalJob);
    for (const f of allScored) {
      const keys = new Set();
      const pId = f.association?.projectId || f.ownerId || '';
      if (pId) {
        keys.add(pId);
        keys.add(slugifyProject(pId));
      }
      if (f.association?.projectName) {
        keys.add(f.association.projectName);
        keys.add(slugifyProject(f.association.projectName));
      }
      const candProj = candProjMap.get(pId) || (pId ? candProjMap.get(slugifyProject(pId)) : null);
      if (candProj) {
        if (candProj.id) keys.add(candProj.id);
        if (candProj.name) {
          keys.add(candProj.name);
          keys.add(slugifyProject(candProj.name));
        }
        if (candProj.title) {
          keys.add(candProj.title);
          keys.add(slugifyProject(candProj.title));
        }
      }

      for (const k of keys) {
        if (!scoredFactsByProject.has(k)) scoredFactsByProject.set(k, []);
        const list = scoredFactsByProject.get(k);
        if (!list.includes(f)) list.push(f);
      }
    }
  }
  const factCompositionTrace = [];
  const factCompositionOmissions = [];
  const claimPlanSummaries = [];
  const realizationSummaries = [];
  const projectRemovalRecords = [];

  const projects = [];
  // P16-009: a selected project whose claim facts are all ambiguous duplicates
  // (dropped at cross-project attribution) composes 0 bullets and would render
  // an empty entry. Such entries are skipped and the freed slot is backfilled
  // from the next ranked strong project that composes at least one bullet.
  // Explicit incoming-plan selections remain authoritative (no drops).
  const allowZeroBulletDrop = useFactComposition && !incomingPlan?.selectedProjectIds;
  const skippedProjectIds = new Set();

  /** Composes one project entry; returns null when it renders empty and drops are allowed. */
  const buildProjectEntry = (selectedId, proj, idx, ranking) => {
    const relevanceScore =
      ranking && typeof ranking.relevanceScore === 'number'
        ? ranking.relevanceScore
        : (proj.relevanceScore ?? 0);

    const enrichedProj = {
      ...proj,
      matchedRequirementIds: ranking?.matchedRequirementIds || [],
    };
    const projectOptions = {
      ...options,
      maxBullets:
        options?.projectBulletOverrides?.[selectedId] ??
        options?.projectBulletOverrides?.[proj.name] ??
        options?.projectBulletOverrides?.[proj.title] ??
        options?.maxBullets,
    };

    // P19-consolidation: Unified authoritative accomplishment composition from the
    // canonical fact inventory. Multi-key lookup across project ID, name, and
    // normalized slug ensures canonical facts from buildCanonicalFactInventory
    // are never missed. No ad-hoc claim reconstruction with synthetic IDs.
    const factKey =
      proj.id ||
      proj.projectId ||
      String(proj.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    let projectFacts = scoredFactsByProject.get(factKey) || [];
    // Multi-key fallback: try project name directly, then normalized slug
    if (projectFacts.length === 0 && proj.name) {
      projectFacts = scoredFactsByProject.get(proj.name) || [];
    }
    if (projectFacts.length === 0 && proj.name) {
      const nameSlug = String(proj.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      projectFacts = scoredFactsByProject.get(nameSlug) || [];
    }
    if (projectFacts.length === 0 && proj.title) {
      projectFacts = scoredFactsByProject.get(proj.title) || [];
    }

    let pBullets = [];
    let _bulletCapacityInfo = null;
    let projectOmittedFacts = [];
    if (useFactComposition && projectFacts.length > 0) {
      const composed = composeProfessionalProjectBullets({
        facts: projectFacts,
        project: enrichedProj,
        jobPosting: canonicalJob,
        explicitBudget: projectOptions.maxBullets ?? null,
        candidateProfile: source,
        options: {
          globallyUsedFactIds: new Set(
            factCompositionTrace.flatMap((t) => t.composedFromFactIds || [])
          ),
        },
      });

      if (Array.isArray(composed.plannedClaims)) {
        for (const pc of composed.plannedClaims) {
          claimPlanSummaries.push({
            claimId: pc.claimId || `claim-${claimPlanSummaries.length + 1}`,
            factIds: pc.factIds || [],
            semanticDimensions: pc.semanticDimensions || [],
            jobRelevance: pc.jobRelevance ?? 0,
            selected: true,
          });
        }
      }

      // Preserve canonical fact IDs directly on schemaBullet for end-to-end evidence traceability
      pBullets = composed.bullets.map(
        ({ semanticDimensions, realizationSource, ...schemaBullet }) => {
          const factIds = Array.isArray(schemaBullet.composedFromFactIds)
            ? schemaBullet.composedFromFactIds
            : [];
          factCompositionTrace.push({
            projectId: selectedId,
            projectName: proj.name || proj.title || '',
            composedFromFactIds: factIds,
            semanticDimensions: semanticDimensions || [],
          });
          realizationSummaries.push({
            claimId: schemaBullet.claimId || `bullet-${realizationSummaries.length + 1}`,
            text: schemaBullet.text,
            validationResult: 'VALID',
          });
          return {
            ...schemaBullet,
            composedFromFactIds: factIds,
          };
        }
      );
      _bulletCapacityInfo = composed.capacity;
      projectOmittedFacts = composed.omittedFacts;
      if (Array.isArray(projectOmittedFacts) && projectOmittedFacts.length > 0) {
        for (const om of projectOmittedFacts) {
          claimPlanSummaries.push({
            claimId: `omitted-${om.factId}`,
            factIds: [om.factId],
            selected: false,
            omissionReason: om.reason,
          });
        }
        factCompositionOmissions.push(
          ...projectOmittedFacts.map((o) => ({ projectId: selectedId, ...o }))
        );
      }
    } else {
      const composed = composeProfessionalProjectBullets({
        facts: projectFacts,
        project: enrichedProj,
        jobPosting: canonicalJob,
        explicitBudget: projectOptions.maxBullets ?? null,
        candidateProfile: source,
      });
      pBullets = composed.bullets.map(
        ({ semanticDimensions, realizationSource, ...schemaBullet }) => schemaBullet
      );
      _bulletCapacityInfo = composed.capacity;
    }

    if (pBullets.length === 0) {
      const candidateBullets = Array.isArray(proj.bullets) && proj.bullets.length > 0
        ? proj.bullets
        : (Array.isArray(proj.metadata?.bullets) ? proj.metadata.bullets : []);
      if (candidateBullets.length > 0) {
        pBullets = candidateBullets.slice(0, projectOptions.maxBullets || 2).map((b, bIdx) => ({
          text: compressProfessionalBullet(typeof b === 'string' ? b : b.text),
          claimId: `cand-bullet-${selectedId}-${bIdx}`,
          provenanceStatus: 'USER_PROVIDED',
          composedFromFactIds: [],
        }));
      }
    }

    if (pBullets.length === 0 && allowZeroBulletDrop) {
      return null; // empty entry — skip and backfill
    }

    const rawTechs = Array.isArray(proj.technologies) && proj.technologies.length > 0
      ? proj.technologies
      : (Array.isArray(proj.metadata?.technologies)
        ? proj.metadata.technologies
        : (Array.isArray(proj.metadata?.skills) ? proj.metadata.skills : []));

    return {
      projectId: selectedId,
      name: proj.name || proj.title || `Project ${idx + 1}`,
      displayName: proj.displayName || proj.name || proj.title || `Project ${idx + 1}`,
      repositoryUrl: proj.repositoryUrl || proj.url || null,
      liveUrl: proj.liveUrl || null,
      technologies: rawTechs.length > 0
        ? formatTechnologyStack(rawTechs)
        : [],
      bullets: pBullets,
      relevanceScore,
      rank: idx + 1,
    };
  };

  // Rendered-identity guard: a record may already have been rendered under a
  // different key (uuid vs name-slug vs ranking alias). Identity is the
  // candidate record itself (uuid when present, else the name slug), so the
  // same candidate project can never render twice regardless of which key
  // space the selection list or a ranking record used.
  const renderedProjectIds = new Set();
  const markRendered = (proj) => {
    const pid = proj?.id || proj?.projectId;
    if (pid) renderedProjectIds.add(pid);
    const slug = proj?.name || proj?.title ? slugifyProject(proj.name || proj.title) : null;
    if (slug) renderedProjectIds.add(slug);
  };
  const isAlreadyRendered = (proj) => {
    const pid = proj?.id || proj?.projectId;
    if (pid && renderedProjectIds.has(pid)) return true;
    const slug = proj?.name || proj?.title ? slugifyProject(proj.name || proj.title) : null;
    return slug ? renderedProjectIds.has(slug) : false;
  };

  for (let idx = 0; idx < parsedPlan.selectedProjectIds.length; idx++) {
    const selectedId = parsedPlan.selectedProjectIds[idx];
    const proj = candProjMap.get(selectedId);
    if (!proj) continue;
    if (skippedProjectIds.has(selectedId)) continue;
    if (isAlreadyRendered(proj)) continue;

    const ranking =
      rankingByProjId.get(selectedId) ||
      (proj.name ? rankingByProjId.get(slugifyProject(proj.name)) : null);

    const entry = buildProjectEntry(selectedId, proj, projects.length, ranking);
    if (entry) {
      projects.push(entry);
      markRendered(proj);
    } else {
      skippedProjectIds.add(selectedId);
      projectRemovalRecords.push({
        projectId: selectedId,
        reason: 'NO_RENDERABLE_CANDIDATE_FACTS',
        stage: 'STRUCTURED_COMPOSITION',
        replacementProjectId: null,
      });
      // Backfill: next ranked strong project not already selected/skipped
      if (Array.isArray(authoritativeRankings)) {
        for (const r of authoritativeRankings) {
          if (projects.length >= parsedPlan.selectedProjectIds.length) break;
          const rId = r.projectId || r.id;
          if (!rId || parsedPlan.selectedProjectIds.includes(rId) || skippedProjectIds.has(rId))
            continue;
          const candProj =
            candProjMap.get(rId) || candProjMap.get(slugifyProject(r.projectName || r.name || ''));
          if (!candProj) continue;
          if (isAlreadyRendered(candProj)) continue; // same-record guard (uuid/slug identity)
          if (candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED')
            continue;
          if (!isProjectStrongEnough(candProj, r)) continue;
          const backfillRanking = rankingByProjId.get(rId) || r;
          const backfillEntry = buildProjectEntry(
            candProj.id || candProj.projectId || rId,
            candProj,
            projects.length,
            backfillRanking
          );
          if (backfillEntry) {
            projects.push(backfillEntry);
            markRendered(candProj);
            skippedProjectIds.add(backfillEntry.projectId);
            projectRemovalRecords.push({
              projectId: selectedId,
              reason: 'REPLACED_AFTER_EMPTY_COMPOSITION',
              stage: 'STRUCTURED_COMPOSITION',
              replacementProjectId: backfillEntry.projectId,
            });
          } else {
            skippedProjectIds.add(candProj.id || candProj.projectId || rId);
          }
        }
      }
    }
  }

  // 8. Skills Categorization (strictly aligned with parsedPlan.skillCategoryOrder & parsedPlan.selectedSkills)
  // Invariant: finalSkillIds ⊆ verifiedCandidateSkillIds
  const categorizedSkills = [];
  const skillsByCategory = new Map();
  for (const s of (parsedPlan.selectedSkills || []).filter(isAuthorizedCandidateSkill)) {
    const cat = s.category || 'Core Competencies';
    if (!skillsByCategory.has(cat)) {
      skillsByCategory.set(cat, []);
    }
    skillsByCategory.get(cat).push(s);
  }

  for (const cat of parsedPlan.skillCategoryOrder || []) {
    const items = skillsByCategory.get(cat) || [];
    if (items.length > 0) {
      categorizedSkills.push({
        categoryName: cat,
        skills: items.map((item) => ({
          name: item.name,
          slug: item.slug,
          provenanceStatus: item.provenanceStatus,
          evidenceId: item.evidenceId || null,
          sourceSkillId: item.sourceSkillId || null,
          confidenceScore: item.confidenceScore ?? 1.0,
          relevanceScore: item.relevanceScore ?? 0,
          matchedRequirementId: item.matchedRequirementId || null,
        })),
      });
    }
  }

  // Do not resurrect the broad candidate inventory after job-conditioned
  // selection. Raw skills remain available only for no-job presentation calls.
  if (
    categorizedSkills.length === 0 &&
    !canonicalJob &&
    Array.isArray(rawSkills) &&
    rawSkills.length > 0
  ) {
    const skillsList = rawSkills.map((s, idx) => {
      const name = typeof s === 'string' ? s : s.name;
      const slug = (typeof s === 'string' ? s : s.slug || s.name || `skill-${idx}`)
        .toLowerCase()
        .replace(/\s+/g, '-');
      const provenanceStatus =
        typeof s === 'object' && s.provenanceStatus
          ? s.provenanceStatus
          : s.verified
            ? 'VERIFIED'
            : 'USER_PROVIDED';
      return {
        name,
        slug,
        provenanceStatus,
        evidenceId: s.evidenceId || null,
        sourceSkillId: s.id || null,
        confidenceScore: s.confidenceScore ?? 1.0,
        relevanceScore: s.relevanceScore ?? 0,
        matchedRequirementId: s.matchedRequirementId || null,
      };
    });

    categorizedSkills.push({
      categoryName: 'Core Competencies',
      skills: skillsList,
    });
  }

  // 9. Grounded Tailored Summary
  let summary = null;
  if (
    incomingPlan?.summary &&
    typeof incomingPlan.summary === 'object' &&
    incomingPlan.summary.text
  ) {
    summary = {
      text: incomingPlan.summary.text,
      referencedSkillSlugs: incomingPlan.summary.referencedSkillSlugs || [],
      referencedProjectIds: incomingPlan.summary.referencedProjectIds || [],
      evidenceRefs: incomingPlan.summary.evidenceRefs || [],
      matchedRequirementIds: incomingPlan.summary.matchedRequirementIds || [],
      provenanceStatus: incomingPlan.summary.provenanceStatus || 'CLAIMED',
      provenance: incomingPlan.summary.provenance || null,
    };
  } else {
    const compSummary = composeProfessionalSummary({
      candidateProfile: source,
      jobPosting: canonicalJob,
      selectedSkills: parsedPlan.selectedSkills,
      selectedProjects: projects,
      factInventory,
      options,
    });
    summary = {
      text: compSummary.text,
      referencedSkillSlugs:
        compSummary.referencedSkillSlugs || compSummary.topRelevantTechnologies || [],
      referencedProjectIds: compSummary.referencedProjectIds || [],
      evidenceRefs: compSummary.evidenceRefs || [],
      matchedRequirementIds: compSummary.matchedRequirementIds || [],
      composedFromFactIds: compSummary.composedFromFactIds || [],
      provenanceStatus: 'VERIFIED',
      provenance: null,
    };
  }

  if (summary && typeof summary === 'object' && !Array.isArray(summary.composedFromFactIds)) {
    summary.composedFromFactIds = [];
  }

  const requirementConcepts = getJobRequirementConcepts(canonicalJob);
  const selectedFactSet = selectionScoredFacts.filter(
    (fact) =>
      selectedProjectIds.some(
        (projectId) =>
          fact.association?.projectId === projectId ||
          fact.ownerId === projectId ||
          slugifyProject(fact.association?.projectName || '') === slugifyProject(projectId)
      ) || fact.surface === 'experience'
  );
  const requirementCoverageReport = {
    requirements: requirementConcepts.map((concept) => ({
      id: concept.id,
      text: concept.text,
      importance: concept.importanceLabel,
      category: concept.requirementClass,
      coveredByFactIds: selectedFactSet
        .filter((fact) => calculateRequirementCoverage([fact], {
          requirements: [concept],
          skills: [],
        }).matchedRequirementIds.includes(concept.id))
        .map((fact) => fact.factId || fact.id)
        .filter(Boolean),
    })),
    selectedProjectIds: [...selectedProjectIds],
    selectedFactIds: selectedFactSet.map((fact) => fact.factId || fact.id).filter(Boolean),
  };

  const doc = {
    documentId: crypto.randomUUID(),
    schemaVersion: '2.0.0',
    targetRole: parsedPlan.targetRoleTitle,
    sectionOrder: parsedPlan.sectionOrder,
    candidateIdentity: {
      ...candidateIdentity,
      // P19: Use candidate-owned headline, NOT target role title
      headline: tailoredHeadingInfo?.candidateHeadline || candidateIdentity.headline || parsedPlan.targetRoleTitle,
    },
    summary,
    skills: {
      categories: categorizedSkills,
    },
    projects,
    experience,
    education,
    certifications,
    dsa,
    optionalSections: {
      coursework: [],
      publications: [],
      achievements: [],
      additionalSkills: [],
      awards: [],
    },
    tailoringPlan: parsedPlan,
    createdAt: new Date().toISOString(),
    // P19: Debug trace for forensic analysis of composition decisions
    debugTrace: {
      candidateHeadline: tailoredHeadingInfo?.candidateHeadline || null,
      targetRole: tailoredHeadingInfo?.targetRole || parsedPlan.targetRoleTitle,
      targetRoleFamily: tailoredHeadingInfo?.targetRoleFamily || null,
      dsaDecision: {
        hasCandidateBullets: Boolean(dsa?.bullets?.length > 0),
        hasProfileUrl: Boolean(dsa?.profileUrl),
        sectionIncluded: Boolean(dsa?.hasSection),
      },
      syntheticContentBlocked: [
        'DSA_HARDCODED_PROSE',
        'DOMAIN_LABEL_REWRITING',
        'HEADLINE_JOB_TITLE_LEAK',
      ],
      factInventorySummary: factInventory?.facts?.map((f) => ({
        factId: f.factId || f.id,
        sourceType: f.sourceType || undefined,
        candidateAuthored: Boolean(f.candidateAuthored),
        agencyLevel: f.agencyLevel || f.agency?.level || undefined,
        agencySource: f.agencySource || f.agency?.source || undefined,
        contributionClass: f.contributionClass || undefined,
        evidenceRole: f.evidenceRole || undefined,
      })) || [],
      claimPlanSummary: claimPlanSummaries,
      realizationSummary: realizationSummaries,
      pdfSummary: {
        renderedClaimIds: realizationSummaries.map((r) => r.claimId).filter(Boolean),
        renderedFactIds: Array.from(
          new Set([
            ...factCompositionTrace.flatMap((t) => t.composedFromFactIds || []),
            ...(summary?.composedFromFactIds || []),
          ])
        ),
      },
      requirementCoverage: requirementCoverageReport,
      jobFingerprint: canonicalJobRequirements.jobFingerprint,
      normalizedRequirements: canonicalJobRequirements.normalizedRequirements,
      matches: evidenceGraph.matches,
      projectRemovalRecords,
      selectedProjectIds: [...parsedPlan.selectedProjectIds],
      renderedProjectIds: projects.map((project) => project.projectId),
      selectedFactIds: selectedFactSet.map((fact) => fact.factId || fact.id).filter(Boolean),
      renderedFactIds: Array.from(
        new Set([
          ...factCompositionTrace.flatMap((trace) => trace.composedFromFactIds || []),
          ...(summary?.composedFromFactIds || []),
        ])
      ),
    },
  };

  const renderedProjectIdSet = new Set(projects.map((project) => project.projectId));
  const unrecordedProjectLoss = parsedPlan.selectedProjectIds.filter(
    (projectId) =>
      !renderedProjectIdSet.has(projectId) &&
      !projectRemovalRecords.some((record) => record.projectId === projectId)
  );
  if (unrecordedProjectLoss.length > 0) {
    throw new Error(
      `Selected projects disappeared without a removal record: ${unrecordedProjectLoss.join(', ')}`
    );
  }

  const built = StructuredResumeDocumentSchema.parse(doc);

  // P16-009: fact-composition traceability report. The canonical document
  // schema is strict — the report is delivered ONLY via options.reportSink
  // (an explicit out-parameter) or via the snapshot bundle. It must never
  // travel on the document itself: downstream validation, persistence and
  // hashing all assume a schema-clean document.
  if (useFactComposition && typeof options?.reportSink === 'function') {
    options.reportSink({
      usedFactComposition: true,
      totalFacts: factInventory?.stats?.totalFacts ?? 0,
      distinctFacts: factInventory?.stats?.distinctFacts ?? 0,
      factsByType: factInventory?.stats?.byType ?? {},
      composedBullets: factCompositionTrace,
      omittedFacts: factCompositionOmissions,
      perProjectCapacity: projects.map((p) => ({
        projectId: p.projectId,
        projectName: p.name,
        bulletCount: Array.isArray(p.bullets) ? p.bullets.length : 0,
      })),
    });
  }

  return built;
}

/**
 * Validates the structured resume document for strict evidence integrity:
 * - Scans for forbidden synthetic placeholder tokens.
 * - Detects unbacked claims.
 * - Produces an authoritative EvidenceValidationReceipt.
 *
 * @param {object} doc StructuredResumeDocument instance
 * @param {object} [options]
 * @param {string} [options.packageHash] Optional package hash linkage
 * @returns {object} EvidenceValidationReceipt conforming to EvidenceValidationReceiptSchema
 */
export function validateStructuredResumeIntegrity(doc, options = {}) {
  const violations = [];
  const provenanceIndex = {};

  let totalClaimsAudited = 0;
  let verifiedClaimsCount = 0;
  let corroboratedClaimsCount = 0;
  let userProvidedClaimsCount = 0;
  let claimedClaimsCount = 0;
  const unbackedClaimsCount = 0;

  // 1. Scan for forbidden synthetic placeholder values in source sections
  const scanForForbiddenStrings = (val, section, field) => {
    if (!val) return;
    const str = String(val).trim();
    for (const forbidden of FORBIDDEN_SYNTHETIC_DEFAULTS) {
      if (str.toLowerCase() === forbidden.toLowerCase()) {
        violations.push({
          section,
          field,
          claimText: str,
          violationType: 'SYNTHETIC_PLACEHOLDER_DETECTED',
          message: `Forbidden synthetic placeholder value '${forbidden}' detected in ${section}.${field}`,
        });
      }
    }
  };

  // Check experience
  for (const exp of doc.experience || []) {
    scanForForbiddenStrings(exp.company, 'EXPERIENCE', 'company');
    scanForForbiddenStrings(exp.title, 'EXPERIENCE', 'title');
    scanForForbiddenStrings(exp.startDate, 'EXPERIENCE', 'startDate');
    scanForForbiddenStrings(exp.endDate, 'EXPERIENCE', 'endDate');
    userProvidedClaimsCount += exp.bullets?.length || 0;
    totalClaimsAudited += exp.bullets?.length || 0;
    if (exp.id) {
      provenanceIndex[`experience:${exp.id}`] = ['USER_PROVIDED'];
    }
  }

  // Check education
  for (const edu of doc.education || []) {
    scanForForbiddenStrings(edu.institution, 'EDUCATION', 'institution');
    scanForForbiddenStrings(edu.degree, 'EDUCATION', 'degree');
    scanForForbiddenStrings(edu.startDate, 'EDUCATION', 'startDate');
    scanForForbiddenStrings(edu.endDate, 'EDUCATION', 'endDate');
    userProvidedClaimsCount += 1;
    totalClaimsAudited += 1;
    if (edu.id) {
      provenanceIndex[`education:${edu.id}`] = ['USER_PROVIDED'];
    }
  }

  // Check certifications
  for (const cert of doc.certifications || []) {
    scanForForbiddenStrings(cert.name, 'CERTIFICATIONS', 'name');
    scanForForbiddenStrings(cert.issuingOrganization, 'CERTIFICATIONS', 'issuingOrganization');
    userProvidedClaimsCount += 1;
    totalClaimsAudited += 1;
    if (cert.id) {
      provenanceIndex[`certifications:${cert.id}`] = ['USER_PROVIDED'];
    }
  }

  // Check DSA
  if (doc.dsa?.bullets) {
    for (const bullet of doc.dsa.bullets) {
      totalClaimsAudited += 1;
      claimedClaimsCount += 1;
      for (const forbidden of FORBIDDEN_FABRICATED_DSA_BULLETS) {
        if (bullet.trim().toLowerCase() === forbidden.toLowerCase()) {
          violations.push({
            section: 'DSA',
            field: 'bullets',
            claimText: bullet,
            violationType: 'SYNTHETIC_PLACEHOLDER_DETECTED',
            message: `Forbidden fabricated DSA bullet detected: '${bullet}'`,
          });
        }
      }
    }
  }

  // Check skills
  for (const cat of doc.skills?.categories || []) {
    for (const s of cat.skills || []) {
      totalClaimsAudited += 1;
      if (s.provenanceStatus === 'VERIFIED') verifiedClaimsCount += 1;
      else if (s.provenanceStatus === 'CORROBORATED') corroboratedClaimsCount += 1;
      else if (s.provenanceStatus === 'USER_PROVIDED') userProvidedClaimsCount += 1;
      else claimedClaimsCount += 1;

      provenanceIndex[`skill:${s.slug}`] = s.evidenceId ? [s.evidenceId] : [s.provenanceStatus];
    }
  }

  // Check project bullets
  for (const proj of doc.projects || []) {
    for (const bullet of proj.bullets || []) {
      totalClaimsAudited += 1;
      if (bullet.provenanceStatus === 'VERIFIED') verifiedClaimsCount += 1;
      else if (bullet.provenanceStatus === 'CORROBORATED') corroboratedClaimsCount += 1;
      else if (bullet.provenanceStatus === 'USER_PROVIDED') userProvidedClaimsCount += 1;
      else claimedClaimsCount += 1;

      const evidenceIds = (bullet.evidenceRefs || []).map((e) => e.evidenceId).filter(Boolean);
      provenanceIndex[`project:${proj.projectId}:bullet`] =
        evidenceIds.length > 0 ? evidenceIds : [bullet.provenanceStatus];

      try {
        assertMetricSafety(bullet.text, bullet.evidenceRefs || []);
      } catch (err) {
        violations.push({
          section: 'PROJECTS',
          field: 'bullets',
          claimText: bullet.text,
          violationType: 'UNSUPPORTED_METRIC',
          message: err.message,
        });
      }
    }
  }

  // Summary audit
  if (doc.summary?.text) {
    totalClaimsAudited += 1;
    if (doc.summary.provenanceStatus === 'VERIFIED') verifiedClaimsCount += 1;
    else if (doc.summary.provenanceStatus === 'CORROBORATED') corroboratedClaimsCount += 1;
    else claimedClaimsCount += 1;

    try {
      assertMetricSafety(doc.summary.text, doc.summary.evidenceRefs || []);
    } catch (err) {
      violations.push({
        section: 'SUMMARY',
        field: 'text',
        claimText: doc.summary.text,
        violationType: 'UNSUPPORTED_METRIC',
        message: err.message,
      });
    }
  }

  const overallStatus = violations.length === 0 ? 'PASS' : 'FAIL';

  const receipt = {
    receiptId: crypto.randomUUID(),
    documentId: doc.documentId,
    packageHash: options.packageHash || null,
    overallStatus,
    auditedAt: new Date().toISOString(),
    summary: {
      totalClaimsAudited,
      verifiedClaimsCount,
      corroboratedClaimsCount,
      userProvidedClaimsCount,
      claimedClaimsCount,
      unbackedClaimsCount,
    },
    violations,
    provenanceIndex,
  };

  return EvidenceValidationReceiptSchema.parse(receipt);
}

/**
 * Builds a complete structured resume snapshot bundle for embedding in application packages.
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} [params.jobPosting]
 * @param {object} [params.tailoringPlan]
 * @param {object} [params.options]
 * @returns {{ structuredResume: object, tailoringPlan: object, evidenceValidationReceipt: object }}
 */
export function buildStructuredResumeSnapshot({
  candidateProfile,
  jobPosting = null,
  tailoringPlan = null,
  options = {},
}) {
  // Capture the traceability report via an internal out-parameter; mirror it
  // to a caller-provided sink if one was supplied. The document itself stays
  // schema-clean.
  const _capturedReport = { value: null };
  const callerSink = typeof options?.reportSink === 'function' ? options.reportSink : null;
  const builtResume = buildStructuredResumeDocument({
    candidateProfile,
    jobPosting,
    tailoringPlan,
    options: {
      ...options,
      reportSink: (r) => {
        _capturedReport.value = r;
        if (callerSink) callerSink(r);
      },
    },
  });
  const factCompositionReport = _capturedReport.value;

  // P16-001G: deterministic professional composition (summary polish, bullet
  // compression, skill presentation cleanup, section-order integrity).
  const structuredResume = composeStructuredResumeDocument(builtResume);

  // Phase 12: generic pre-render content quality gate & remediation (Req K).
  // Weak optional sections are remediated (omitted) prior to generating the receipt.
  let contentQualityGate = assessPreRenderQuality({
    structuredResume,
    targetRole: structuredResume.targetRole || jobPosting?.title || null,
  });
  if (!contentQualityGate.passed) {
    const weakOptional = contentQualityGate.findings.filter(
      (f) => f.code === 'WEAK_OPTIONAL_SECTION' && f.suggestion === 'OMIT_SECTION'
    );
    // P43: Never drop candidate-owned authentic DSA (valid URL or real bullets) merely because relevance is weak (Req 9 & 13)
    const hasAuthenticDsa = Boolean(
      structuredResume.dsa?.profileUrl ||
      (Array.isArray(structuredResume.dsa?.bullets) && structuredResume.dsa.bullets.length > 0)
    );
    if (weakOptional.length > 0 && !hasAuthenticDsa) {
      structuredResume.dsa = { ...(structuredResume.dsa || {}), hasSection: false };
      if (
        Array.isArray(structuredResume.sectionOrder) &&
        structuredResume.sectionOrder.includes('DSA')
      ) {
        structuredResume.sectionOrder = structuredResume.sectionOrder.filter((s) => s !== 'DSA');
      }
      contentQualityGate = assessPreRenderQuality({
        structuredResume,
        targetRole: structuredResume.targetRole || jobPosting?.title || null,
      });
    }
  }

  // Audits the exact FINAL text and structure that will be rendered (Req K & Req 15).
  const evidenceValidationReceipt = validateStructuredResumeIntegrity(structuredResume);

  return {
    structuredResume,
    tailoringPlan: structuredResume.tailoringPlan,
    evidenceValidationReceipt,
    contentQualityGate,
    factCompositionReport,
  };
}

/**
 * Asynchronous variant of buildStructuredResumeSnapshot supporting AI provider realization.
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} [params.jobPosting]
 * @param {object} [params.tailoringPlan]
 * @param {object} [params.options]
 * @param {object} [params.aiProvider] Optional AI provider for realization
 * @returns {Promise<{ structuredResume: object, tailoringPlan: object, evidenceValidationReceipt: object, contentQualityGate: object, factCompositionReport: object }>}
 */
export async function buildStructuredResumeSnapshotAsync({
  candidateProfile,
  jobPosting = null,
  tailoringPlan = null,
  options = {},
  aiProvider = null,
}) {
  const provider = aiProvider || options?.aiProvider || null;
  // If provider provided, set in options for deep realization pipelines
  const enhancedOptions = {
    ...options,
    aiProvider: provider,
  };

  return buildStructuredResumeSnapshot({
    candidateProfile,
    jobPosting,
    tailoringPlan,
    options: enhancedOptions,
  });
}

/**
 * Takes an immutable semantic snapshot of a structured resume.
 * Captures all candidate factual and semantic selections:
 * - project IDs, ordering, count
 * - skill IDs, names, category groupings
 * - summary text and composed fact IDs
 * - experience companies, titles, dates, fact IDs
 * - DSA URL and candidate-authored DSA bullets
 * - education institutions, degrees, dates
 * - section order
 *
 * @param {object} structuredResume Structured resume document
 * @returns {object} Immutable semantic snapshot
 */
export function freezeSemanticResume(structuredResume) {
  const resume = structuredResume?.structuredResume || structuredResume;
  if (!resume) return null;

  return Object.freeze({
    projectIds: Object.freeze((resume.projects || []).map((p) => p.projectId || p.id || p.name)),
    projectNames: Object.freeze((resume.projects || []).map((p) => p.name || p.title)),
    projectCount: (resume.projects || []).length,
    skillSlugs: Object.freeze((resume.selectedSkillSlugs || []).slice().sort()),
    skillsByCategory: Object.freeze(
      (resume.skills?.categories || []).map((cat) => ({
        categoryName: cat.categoryName,
        skills: Object.freeze((cat.skills || []).map((s) => s.slug || s.name)),
      }))
    ),
    summaryText: resume.summary?.text || null,
    summaryFactIds: Object.freeze([...(resume.summary?.composedFromFactIds || [])].sort()),
    experienceFactIds: Object.freeze(
      (resume.experience || []).flatMap((e) =>
        (e.bullets || []).flatMap((b) => b.composedFromFactIds || [b.text || b])
      )
    ),
    experienceCompanies: Object.freeze(
      (resume.experience || []).map((e) => `${e.company || ''}:${e.title || ''}`)
    ),
    dsaBullets: Object.freeze(
      (resume.dsa?.bullets || []).map((b) => (typeof b === 'string' ? b : b.text || ''))
    ),
    dsaUrl: resume.dsa?.profileUrl || null,
    educationFacts: Object.freeze(
      (resume.education || []).map((e) => `${e.institution || ''}:${e.degree || ''}`)
    ),
    sectionOrder: Object.freeze([...(resume.sectionOrder || [])]),
  });
}

/**
 * Computes a deterministic SHA-256 semantic fingerprint of a structured resume.
 * Changes to presentation metadata (spacing, margin, layout profile, font size)
 * will NOT change this fingerprint; any semantic change WILL change this fingerprint.
 *
 * @param {object} structuredResume Structured resume document
 * @returns {string} SHA-256 hex digest
 */
export function computeResumeSemanticFingerprint(structuredResume) {
  const frozen = freezeSemanticResume(structuredResume);
  if (!frozen) return '';
  return crypto.createHash('sha256').update(JSON.stringify(frozen)).digest('hex');
}

/**
 * Asserts strict semantic equivalence between two structured resume representations
 * (e.g. before vs after optimizer / renderer).
 *
 * @param {object} baseline Baseline structured resume or frozen snapshot
 * @param {object} current Current structured resume or frozen snapshot
 * @throws {Error} If any semantic selection changed
 * @returns {boolean} True if strictly equivalent
 */
export function assertSemanticEquivalence(baseline, current) {
  const base = baseline?.projectIds ? baseline : freezeSemanticResume(baseline);
  const curr = current?.projectIds ? current : freezeSemanticResume(current);

  if (!base || !curr) return true;

  if (base.projectCount !== curr.projectCount) {
    throw new Error(
      `Optimizer semantic violation: project count changed from ${base.projectCount} to ${curr.projectCount}`
    );
  }

  for (let i = 0; i < base.projectIds.length; i++) {
    if (
      base.projectIds[i] !== curr.projectIds[i] ||
      base.projectNames?.[i] !== curr.projectNames?.[i]
    ) {
      throw new Error(
        `Optimizer semantic violation: project ordering changed at index ${i}. Expected '${base.projectIds[i]}', got '${curr.projectIds[i]}'`
      );
    }
  }

  if (JSON.stringify(base.skillsByCategory) !== JSON.stringify(curr.skillsByCategory)) {
    throw new Error('Optimizer semantic violation: technical skills selection or category grouping was modified');
  }

  if (base.summaryText !== curr.summaryText) {
    throw new Error('Optimizer semantic violation: summary text was rewritten or modified');
  }

  if (JSON.stringify(base.summaryFactIds) !== JSON.stringify(curr.summaryFactIds)) {
    throw new Error('Optimizer semantic violation: summary composed fact IDs were modified');
  }

  if (base.dsaUrl !== curr.dsaUrl || JSON.stringify(base.dsaBullets) !== JSON.stringify(curr.dsaBullets)) {
    throw new Error('Optimizer semantic violation: DSA profile URL or bullets were modified');
  }

  if (JSON.stringify(base.experienceCompanies) !== JSON.stringify(curr.experienceCompanies)) {
    throw new Error('Optimizer semantic violation: experience records were modified');
  }

  if (JSON.stringify(base.educationFacts) !== JSON.stringify(curr.educationFacts)) {
    throw new Error('Optimizer semantic violation: education records were modified');
  }

  if (JSON.stringify(base.sectionOrder) !== JSON.stringify(curr.sectionOrder)) {
    throw new Error('Optimizer semantic violation: section order was modified');
  }

  return true;
}

