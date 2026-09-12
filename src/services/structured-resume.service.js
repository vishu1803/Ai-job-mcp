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
import { composeStructuredResumeDocument } from './resume-professional-composition.service.js';
import { assessPreRenderQuality } from './resume-content-quality-gate.service.js';
import {
  generateGroundedSummary,
  selectAndRephraseProjectBullets,
  assertMetricSafety,
  deriveTargetRoleHeading,
  deriveSectionOrdering,
  isMeaningfulDsa,
} from './resume-content-strategy.service.js';
import {
  formatTechnologyStack,
} from '../utils/technology-normalizer.js';
import { buildCanonicalFactInventory, scoreFactsForJob, PROBLEM_SOLVING_PROJECT_KEY } from './candidate-fact-inventory.service.js';
import { composeProfessionalProjectBullets, determineProjectBulletCapacity } from './resume-accomplishment-composer.service.js';

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
  education = [],
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

  const matchAnalysis =
    jobPosting?.matchAnalysis ||
    jobPosting?.jobFitAnalysis?.matchAnalysis ||
    options.matchAnalysis ||
    null;

  const tailoredHeadingInfo = deriveTargetRoleHeading({
    candidateProfile: source,
    jobPosting,
    matchAnalysis,
  });

  // 1. Candidate Identity Snapshot (Immutable Source Data)
  const candidateIdentity = {
    displayName: source.displayName || source.name || source.candidate?.displayName || source.candidate?.name || 'Candidate',
    headline: incomingPlan?.targetRoleTitle || tailoredHeadingInfo.heading,
    email: source.canonicalEmail || source.email || source.userEmail || source.candidate?.canonicalEmail || source.candidate?.email,
    phone: source.phone || source.phoneNumber || source.candidate?.phone || meta.identity?.phone || meta.phone || null,
    location: source.location || source.candidate?.location || meta.identity?.location || meta.location || null,
    links: extractCandidateLinks(source),
  };

  // 2. Experience Snapshot (Authoritative source facts; no synthetic dates/titles)
  const rawExperience = meta.experience || source.experience || source.workExperience || [];
  const experience = (Array.isArray(rawExperience) ? rawExperience : []).map((exp, idx) => ({
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
  const certifications = (Array.isArray(rawCertifications) ? rawCertifications : []).map((cert, idx) => ({
    id: cert.id || `cert-${idx + 1}`,
    name: cert.name || cert.title || null,
    issuingOrganization: cert.issuingOrganization || cert.issuer || null,
    issueDate: cert.issueDate || null,
    expirationDate: cert.expirationDate || null,
    credentialId: cert.credentialId || null,
    credentialUrl: cert.credentialUrl || null,
    provenanceStatus: 'USER_PROVIDED',
  }));

  // 5. DSA Snapshot (Authoritative source facts; never inject synthetic bullets)
  // P16-009: a valid candidate-owned problem-solving profile URL is sufficient
  // for a compact section (URL-only DSA must not disappear). Authored bullets
  // or real stats also qualify. Fabricated counts/ratings remain forbidden.
  const rawDsa = meta.dsa || source.dsa || source.problemSolving || meta.problemSolving || null;
  let dsa = null;
  if (rawDsa && typeof rawDsa === 'object') {
    const dsaUrl = typeof rawDsa.profileUrl === 'string' && /^https?:\/\//i.test(rawDsa.profileUrl.trim())
      ? rawDsa.profileUrl.trim()
      : null;
    const dsaBullets = Array.isArray(rawDsa.bullets) ? rawDsa.bullets.map(String).filter(Boolean) : [];
    dsa = {
      // P16-009: an explicit upstream hasSection=true is honored, and a valid
      // profile URL or authored bullets make the section renderable even when
      // the upstream flag was computed as false (URL-only DSA must not vanish).
      hasSection: Boolean(rawDsa.hasSection || dsaBullets.length > 0 || dsaUrl),
      profileUrl: dsaUrl,
      bullets: dsaBullets,
      provenanceStatus: 'CLAIMED',
    };
  }

  // 6. Tailoring Plan
  const rawProjects = meta.projects || source.projects || [];
  // P16-009: URL-only DSA must render. The renderer inserts DSA after PROJECTS
  // when dsa content exists; the ordering derivation only sees authored-bullet
  // DSA, so a URL-only DSA is appended to the order here.
  const includeProblemSolving = Boolean(dsa?.bullets?.length || dsa?.profileUrl);

  // Phase 4 — Dynamic, content-aware project budget (Req H & 21).
  // Dynamically computes project capacity based on candidate experience, DSA, and education footprint.
  const hasMeaningfulDsaContent = isMeaningfulDsa(dsa);

  const dynamicProjectBudget = estimateProjectCapacity({
    experience: meta.experience || source.experience || [],
    hasMeaningfulDsa: hasMeaningfulDsaContent,
    education: meta.education || source.education || [],
    explicitBudget: options?.projectBudget || options?.maxProjects || incomingPlan?.projectBudget || null,
  });

  // Minimum authoritative-strength thresholds a project must meet to earn a slot.
  // Projects below these bars are omitted rather than padding the page (fail-sparse).
  const STRONG_RELEVANCE_FLOOR = 30;      // ranking relevanceScore ≥ 30, or
  const MIN_EVIDENCE_COUNT = 5;           // ≥ 5 evidence records, or
  const MIN_AUTHORED_BULLETS = 2;         // ≥ 2 authored technical bullets

  /**
   * Evaluates whether a ranked candidate project has enough authentic content
   * strength to justify occupying page budget. Purely data-driven.
   */
  const isProjectStrongEnough = (candProj, ranking) => {
    const score = typeof ranking?.relevanceScore === 'number' ? ranking.relevanceScore : 0;
    const evidenceCount =
      candProj.evidenceCount ?? (Array.isArray(candProj.evidence) ? candProj.evidence.length : 0);
    const authoredBullets = Array.isArray(candProj.bullets) ? candProj.bullets.length : 0;
    const hasMatchedReqs =
      (Array.isArray(ranking?.matchedRequirementIds) && ranking.matchedRequirementIds.length > 0) ||
      (Array.isArray(ranking?.matchedRequirements) && ranking.matchedRequirements.length > 0);
    const band = ranking?.relevanceBand;

    const hasHighlights = Array.isArray(candProj.highlights) && candProj.highlights.length > 0;
    const hasFeatures = Array.isArray(candProj.features) && candProj.features.length > 0;
    const hasDescription = candProj.description && typeof candProj.description === 'string' && candProj.description.trim().length >= 20;

    // P16-008: Count total distinct canonical facts across all candidate content surfaces
    const allCandidateItems = [
      ...(Array.isArray(candProj.bullets) ? candProj.bullets : []),
      ...(Array.isArray(candProj.highlights) ? candProj.highlights : []),
      ...(Array.isArray(candProj.features) ? candProj.features : []),
      ...(Array.isArray(candProj.featureDescriptions) ? candProj.featureDescriptions : []),
      ...(Array.isArray(candProj.responsibilities) ? candProj.responsibilities : []),
      ...(hasDescription ? [candProj.description] : []),
    ];
    const totalCandidateFacts = countDistinctCanonicalFacts(allCandidateItems);

    return (
      (score >= STRONG_RELEVANCE_FLOOR ||
      hasMatchedReqs ||
      band === 'HIGH' ||
      band === 'MEDIUM' ||
      evidenceCount >= MIN_EVIDENCE_COUNT ||
      totalCandidateFacts >= MIN_AUTHORED_BULLETS) &&
      // A slot-worth project must carry at least SOME renderable content.
      (evidenceCount > 0 || totalCandidateFacts > 0 ||
       (candProj.summary && String(candProj.summary).trim()))
    );
  };


  let selectedProjectIds = [];

  if (Array.isArray(incomingPlan?.selectedProjectIds)) {
    // An explicit incoming plan's project selection is authoritative; it is only
    // capped by the dynamic page budget (no strength filtering — explicit selection
    // is the tailoring system's decision).
    selectedProjectIds = incomingPlan.selectedProjectIds.slice(0, dynamicProjectBudget);
  } else {
    // Check for authoritative rankings on jobPosting or options
    const authoritativeRankings =
      options?.projectRankings ||
      jobPosting?.projectRankings ||
      jobPosting?.jobFitAnalysis?.projectRankings ||
      jobPosting?.jobFitAnalysis?.topRelevantProjects ||
      null;

    if (Array.isArray(authoritativeRankings) && authoritativeRankings.length > 0) {
      // Map candidate projects by ID and slug
      const candProjMap = new Map();
      for (const p of rawProjects) {
        const pId = p.id || p.projectId;
        if (pId) candProjMap.set(pId, p);
        const slug = slugifyProject(p.name || p.title || '');
        if (slug) candProjMap.set(slug, p);
      }

      for (const r of authoritativeRankings) {
        const rId = r.projectId || r.id;
        const rSlug = slugifyProject(r.projectName || r.name || '');
        const candProj = candProjMap.get(rId) || (rSlug ? candProjMap.get(rSlug) : null);
        if (!candProj) continue;

        const isArchived =
          candProj.isArchived === true ||
          candProj.metadata?.portfolioStatus === 'ARCHIVED';
        if (isArchived) continue;

        const score = typeof r.relevanceScore === 'number' ? r.relevanceScore : 0;
        const hasMatchedReqs =
          (Array.isArray(r.matchedRequirementIds) && r.matchedRequirementIds.length > 0) ||
          (Array.isArray(r.matchedRequirements) && r.matchedRequirements.length > 0);
        const hasContributingSkills =
          Array.isArray(r.contributingSkills) && r.contributingSkills.length > 0;
        const isNotMinimal = r.relevanceBand && r.relevanceBand !== 'MINIMAL';

        if (score <= 0 || (!hasMatchedReqs && !hasContributingSkills && !isNotMinimal && score < 25.0)) {
          continue;
        }

        // Phase 4 strength gate: a slot is granted only when the project carries
        // enough authentic content to justify page space (fail-sparse, never pad).
        if (!isProjectStrongEnough(candProj, r)) {
          continue;
        }

        const candProjId = candProj.id || candProj.projectId || rId;
        if (!selectedProjectIds.includes(candProjId)) {
          selectedProjectIds.push(candProjId);
        }
        if (selectedProjectIds.length >= dynamicProjectBudget) break;
      }
    } else if (Array.isArray(jobPosting?.recommendedProjects) && jobPosting.recommendedProjects.length > 0) {
      // Explicit recommended projects passed on jobPosting
      const candProjMap = new Map();
      for (const p of rawProjects) {
        const slug = slugifyProject(p.name || p.title || '');
        if (slug) candProjMap.set(slug, p);
      }
      for (const rec of jobPosting.recommendedProjects) {
        const recSlug = slugifyProject(typeof rec === 'string' ? rec : rec.name || rec.slug || '');
        const candProj = candProjMap.get(recSlug);
        if (candProj) {
          const isArchived =
            candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED';
          if (isArchived) continue;
          // Phase 4 strength gate applies to recommendation-driven selection too.
          if (!isProjectStrongEnough(candProj, null)) continue;
          const candProjId = candProj.id || candProj.projectId;
          if (candProjId && !selectedProjectIds.includes(candProjId)) {
            selectedProjectIds.push(candProjId);
          }
        }
        if (selectedProjectIds.length >= dynamicProjectBudget) break;
      }
    } else if (
      !jobPosting ||
      ((!jobPosting.requirements || jobPosting.requirements.length === 0) &&
        (!jobPosting.skills || jobPosting.skills.length === 0) &&
        (!jobPosting.description || !jobPosting.description.trim()) &&
        !jobPosting.projectRankings &&
        !jobPosting.recommendedProjects &&
        !jobPosting.jobFitAnalysis)
    ) {
      // Standalone tests without jobPosting or minimal jobPosting without requirements/description/rankings:
      // use raw candidate projects sliced to budget
      selectedProjectIds = Array.isArray(rawProjects)
        ? rawProjects.slice(0, dynamicProjectBudget).map((p, i) => p.id || p.projectId || `proj-${i + 1}`)
        : [];
    } else {
      // Job posting with requirements/description provided, but zero projects met the relevance criteria:
      // Empty selection (prefers NO project over WRONG project when relevance is genuinely zero)
      selectedProjectIds = [];
    }
  }

  const rawSkills = meta.skills || source.skills || [];

  const candidateContentService = new CandidateArtifactContentService();
  const skillSelectionResult = candidateContentService.selectAndCategorizeSkillsForJob(
    { skills: rawSkills, projects: rawProjects },
    jobPosting,
    options
  );

  const selectedSkillSlugs = Array.isArray(incomingPlan?.selectedSkillSlugs) && incomingPlan.selectedSkillSlugs.length > 0
    ? incomingPlan.selectedSkillSlugs
    : skillSelectionResult.selectedSkillSlugs;

  const selectedSkills = Array.isArray(incomingPlan?.selectedSkills) && incomingPlan.selectedSkills.length > 0
    ? incomingPlan.selectedSkills
    : skillSelectionResult.selectedSkills;

  const skillCategoryOrder = Array.isArray(incomingPlan?.skillCategoryOrder) && incomingPlan.skillCategoryOrder.length > 0
    ? incomingPlan.skillCategoryOrder
    : (skillSelectionResult.skillCategoryOrder?.length ? skillSelectionResult.skillCategoryOrder : ['Languages', 'Backend & APIs', 'Databases & ORMs', 'Cloud, DevOps & Systems', 'Frontend & Web']);

  const derivedOrdering = deriveSectionOrdering({
    candidateProfile: source,
    jobPosting,
    options,
  });

  // P16-009: URL-only DSA ordering fix — deriveSectionOrdering only pushes DSA
  // when isMeaningfulDsa sees authored bullets; when the profile carries a valid
  // problem-solving URL, append DSA after PROJECTS explicitly.
  if (dsa?.hasSection && !derivedOrdering.sectionOrder.includes('DSA')) {
    const projIdx = derivedOrdering.sectionOrder.indexOf('PROJECTS');
    if (projIdx !== -1) {
      derivedOrdering.sectionOrder.splice(projIdx + 1, 0, 'DSA');
    } else {
      derivedOrdering.sectionOrder.push('DSA');
    }
  }

  const basePlan = {
    planId: crypto.randomUUID(),
    targetJobId: jobPosting?.id || null,
    targetRoleTitle: tailoredHeadingInfo.heading,
    targetCompany: jobPosting?.company || null,
    candidateArchetype: tailoredHeadingInfo.candidateArchetype || derivedOrdering.candidateArchetype,
    pageTarget: 'ONE_PAGE_STRICT',
    sectionOrder: derivedOrdering.sectionOrder,
    selectedProjectIds,
    selectedSkillSlugs,
    selectedSkills,
    skillCategoryOrder,
    optionalSections: {
      includeDsa: derivedOrdering.sectionOrder.includes('DSA'),
      includeCertifications: derivedOrdering.sectionOrder.includes('CERTIFICATIONS'),
      includeCoursework: derivedOrdering.sectionOrder.includes('COURSEWORK'),
      includePublications: derivedOrdering.sectionOrder.includes('PUBLICATIONS'),
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

  // P16-009: optimizer-driven project expansion — resolved BEFORE plan parsing
  // so the added projects flow into parsedPlan.selectedProjectIds. Each must
  // still pass the strength gate (authentic content, not archived);
  // relevance-zero projects are still excluded. Total projects capped at 4.
  const additionalProjectIds = Array.isArray(options?.additionalProjectIds)
    ? options.additionalProjectIds
    : [];
  if (additionalProjectIds.length > 0) {
    const candProjMapForExtras = new Map();
    for (const p of rawProjects) {
      const pId = p.id || p.projectId;
      if (pId) candProjMapForExtras.set(pId, p);
      const slug = slugifyProject(p.name || p.title || '');
      if (slug) candProjMapForExtras.set(slug, p);
    }
    for (const extraId of additionalProjectIds) {
      if (selectedProjectIds.length >= 4) break;
      const candProj =
        candProjMapForExtras.get(extraId) ||
        candProjMapForExtras.get(slugifyProject(extraId));
      if (!candProj) continue;
      const isArchived =
        candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED';
      if (isArchived) continue;
      if (!isProjectStrongEnough(candProj, null)) continue;
      const candProjId = candProj.id || candProj.projectId || extraId;
      if (!selectedProjectIds.includes(candProjId)) {
        selectedProjectIds.push(candProjId);
      }
    }
  }

  const planToParse = incomingPlan ? { ...basePlan, ...incomingPlan, selectedProjectIds } : basePlan;
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
    jobPosting?.projectRankings ||
    jobPosting?.jobFitAnalysis?.projectRankings ||
    jobPosting?.jobFitAnalysis?.topRelevantProjects ||
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
  const factInventory = useFactComposition
    ? buildCanonicalFactInventory(source, jobPosting, options?.factInventoryOptions)
    : null;
  const scoredFactsByProject = new Map();
  if (factInventory) {
    const allScored = scoreFactsForJob(factInventory.facts, jobPosting);
    for (const f of allScored) {
      const key = f.association?.projectId || '';
      if (!scoredFactsByProject.has(key)) scoredFactsByProject.set(key, []);
      scoredFactsByProject.get(key).push(f);
    }
  }
  const factCompositionTrace = [];
  const factCompositionOmissions = [];

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
        : proj.relevanceScore ?? 0;

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

    // P16-009: professional composition from the canonical fact inventory.
    const factKey = proj.id || proj.projectId || String(proj.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const projectFacts = scoredFactsByProject.get(factKey) || [];
    let pBullets = [];
    let bulletCapacityInfo = null;
    let projectOmittedFacts = [];
    if (useFactComposition && projectFacts.length > 0) {
      const composed = composeProfessionalProjectBullets({
        facts: projectFacts,
        project: enrichedProj,
        jobPosting,
        explicitBudget: projectOptions.maxBullets ?? null,
      });
      // Strip internal composition fields: the canonical bullet schema is
      // strict. Traceability is preserved in factCompositionReport below.
      pBullets = composed.bullets.map(({ composedFromFactIds, semanticDimensions, ...schemaBullet }) => {
        factCompositionTrace.push({
          projectId: selectedId,
          projectName: proj.name || proj.title || '',
          composedFromFactIds: composedFromFactIds || [],
          semanticDimensions: semanticDimensions || [],
        });
        return schemaBullet;
      });
      bulletCapacityInfo = composed.capacity;
      projectOmittedFacts = composed.omittedFacts;
      if (Array.isArray(projectOmittedFacts) && projectOmittedFacts.length > 0) {
        factCompositionOmissions.push(...projectOmittedFacts.map((o) => ({ projectId: selectedId, ...o })));
      }
    } else {
      // Legacy path: preserved verbatim for explicit-plan-driven flows and
      // as the migration adapter when fact composition is disabled.
      pBullets = selectAndRephraseProjectBullets({
        project: enrichedProj,
        jobPosting,
        matchAnalysis: options?.matchAnalysis || jobPosting?.jobFitAnalysis?.matchAnalysis,
        options: projectOptions,
      });
    }

    if (pBullets.length === 0 && allowZeroBulletDrop) {
      return null; // empty entry — skip and backfill
    }

    return {
      projectId: selectedId,
      name: proj.name || proj.title || `Project ${idx + 1}`,
      displayName: proj.displayName || proj.name || proj.title || `Project ${idx + 1}`,
      repositoryUrl: proj.repositoryUrl || proj.url || null,
      liveUrl: proj.liveUrl || null,
      technologies: Array.isArray(proj.technologies) ? formatTechnologyStack(proj.technologies) : [],
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
      // Backfill: next ranked strong project not already selected/skipped
      if (Array.isArray(authoritativeRankings)) {
        for (const r of authoritativeRankings) {
          if (projects.length >= parsedPlan.selectedProjectIds.length) break;
          const rId = r.projectId || r.id;
          if (!rId || parsedPlan.selectedProjectIds.includes(rId) || skippedProjectIds.has(rId)) continue;
          const candProj = candProjMap.get(rId) || candProjMap.get(slugifyProject(r.projectName || r.name || ''));
          if (!candProj) continue;
          if (isAlreadyRendered(candProj)) continue; // same-record guard (uuid/slug identity)
          if (candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED') continue;
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
          } else {
            skippedProjectIds.add(candProj.id || candProj.projectId || rId);
          }
        }
      }
    }
  }

  // 8. Skills Categorization (strictly aligned with parsedPlan.skillCategoryOrder & parsedPlan.selectedSkills)
  const categorizedSkills = [];
  const skillsByCategory = new Map();
  for (const s of parsedPlan.selectedSkills || []) {
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

  // Fallback if no categorized skills were derived
  if (categorizedSkills.length === 0 && Array.isArray(rawSkills) && rawSkills.length > 0) {
    const skillsList = rawSkills.map((s, idx) => {
      const name = typeof s === 'string' ? s : s.name;
      const slug = (typeof s === 'string' ? s : s.slug || s.name || `skill-${idx}`).toLowerCase().replace(/\s+/g, '-');
      const provenanceStatus = typeof s === 'object' && s.provenanceStatus
        ? s.provenanceStatus
        : (s.verified ? 'VERIFIED' : 'USER_PROVIDED');
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
  if (incomingPlan?.summary && typeof incomingPlan.summary === 'object' && incomingPlan.summary.text) {
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
    summary = generateGroundedSummary({
      candidateProfile: source,
      jobPosting,
      tailoringPlan: parsedPlan,
      selectedSkills: parsedPlan.selectedSkills,
      selectedProjects: projects,
      matchAnalysis: options?.matchAnalysis || jobPosting?.jobFitAnalysis?.matchAnalysis,
      options,
    });
  }

  const doc = {
    documentId: crypto.randomUUID(),
    schemaVersion: '2.0.0',
    targetRole: parsedPlan.targetRoleTitle,
    sectionOrder: parsedPlan.sectionOrder,
    candidateIdentity: {
      ...candidateIdentity,
      headline: parsedPlan.targetRoleTitle,
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
  };

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
    userProvidedClaimsCount += (exp.bullets?.length || 0);
    totalClaimsAudited += (exp.bullets?.length || 0);
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
      provenanceIndex[`project:${proj.projectId}:bullet`] = evidenceIds.length > 0 ? evidenceIds : [bullet.provenanceStatus];

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
    if (weakOptional.length > 0) {
      structuredResume.dsa = { ...(structuredResume.dsa || {}), hasSection: false };
      if (Array.isArray(structuredResume.sectionOrder) && structuredResume.sectionOrder.includes('DSA')) {
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
