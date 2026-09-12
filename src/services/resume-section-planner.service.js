/**
 * @file Resume Section Planner Service
 *
 * Implements evidence-driven section planning and document composition.
 * Evaluates candidates for:
 * SUMMARY, SKILLS, PROJECTS, DSA, EXPERIENCE, EDUCATION, CERTIFICATIONS, AWARDS, OPEN_SOURCE
 *
 * For each section calculates:
 * - availability
 * - evidence strength
 * - relevance
 * - information density
 * - priority
 * - estimated height
 * - minimum useful representation
 *
 * Chooses the optimal document composition and ordering dynamically,
 * respecting candidate archetype and evidence strength without hardcoding
 * a single rigid ordering.
 */

import { buildCanonicalFactInventory, PROBLEM_SOLVING_PROJECT_KEY } from './candidate-fact-inventory.service.js';
import { TenureCalculator } from '../utils/tenure-calculator.js';
import { CareerStatusDerivation } from '../utils/career-status-derivation.js';

export const SECTION_KEYS = {
  HEADER: 'HEADER',
  SUMMARY: 'SUMMARY',
  SKILLS: 'SKILLS',
  PROJECTS: 'PROJECTS',
  DSA: 'DSA',
  EXPERIENCE: 'EXPERIENCE',
  EDUCATION: 'EDUCATION',
  CERTIFICATIONS: 'CERTIFICATIONS',
  AWARDS: 'AWARDS',
  OPEN_SOURCE: 'OPEN_SOURCE',
};

/**
 * Standard page capacity in points (Letter paper 792pt - 0.75in margins ~ 640pt usable body).
 */
export const USABLE_PAGE_HEIGHT_PT = 640;

/**
 * Plans document sections based on candidate evidence and job requirements.
 *
 * @param {object} params
 * @param {object} params.candidateProfile
 * @param {object} [params.factInventory]
 * @param {object} [params.jobPosting]
 * @param {object} [params.options]
 * @returns {object} Section plan with calculated metrics and recommended ordering
 */
export function planDocumentSections({
  candidateProfile = {},
  factInventory = null,
  jobPosting = null,
  options = {},
}) {
  const profile = candidateProfile || {};
  const meta = profile.profileMetadata || {};
  const inv = factInventory || buildCanonicalFactInventory(profile, jobPosting);

  const experiences = meta.experience || profile.experience || profile.workExperience || [];
  const education = meta.education || profile.education || [];
  const certifications = meta.certifications || profile.certifications || [];
  const awards = meta.awards || profile.awards || profile.honors || [];
  const openSource = meta.openSource || profile.openSource || [];
  const dsa =
    meta.dsa ||
    profile.dsa ||
    profile.problemSolving ||
    meta.problemSolving ||
    meta.resumeData?.problemSolving ||
    null;

  // Derive candidate archetype and tenure
  const tenureMetrics = TenureCalculator.calculateTenure(experiences);
  const candidateSeniority = CareerStatusDerivation.deriveSeniority({
    experiences,
    education,
    professionalTenureYears: tenureMetrics.professionalTenureYears,
    declaredSeniority: profile.seniority || meta.seniority || meta.userCustom?.seniority,
  });
  const careerStatus = CareerStatusDerivation.deriveCareerStatus({
    experiences,
    education,
    professionalTenureMonths: tenureMetrics.professionalTenureMonths,
    declaredStatus: profile.careerStatus || meta.careerStatus || meta.userCustom?.careerStatus,
  });

  const hasSeniorWorkHistory = experiences.some((e) =>
    /\b(senior|sr\.?|principal|lead|staff|architect|director|manager)\b/i.test(e.title || e.role || '')
  );
  const hasSeniorHeadline = /\b(senior|sr\.?|principal|lead|staff|architect|director)\b/i.test(
    profile.headline || meta.headline || ''
  );

  let isFresher =
    !hasSeniorWorkHistory &&
    !hasSeniorHeadline &&
    (careerStatus === 'FRESHER' ||
      profile.careerStatus === 'FRESHER' ||
      meta.careerStatus === 'FRESHER' ||
      candidateSeniority === 'ENTRY_LEVEL' ||
      candidateSeniority === 'INTERN' ||
      (tenureMetrics.professionalTenureYears < 1.0 && experiences.length === 0));

  if (jobPosting?.title && !hasSeniorWorkHistory) {
    const jobTitle = String(jobPosting.title).toLowerCase();
    if (/\b(intern|internship|graduate|junior|entry|associate)\b/i.test(jobTitle)) {
      isFresher = true;
    }
  }

  const candidateArchetype =
    options.candidateArchetype ||
    (profile.careerStatus === 'CAREER_CHANGER' || meta.careerStatus === 'CAREER_CHANGER'
      ? 'CAREER_CHANGER'
      : isFresher
        ? 'FRESHER'
        : 'EXPERIENCED');

  // Evaluate section metrics
  const sectionMetrics = {};

  // 1. SUMMARY
  const summaryFacts = inv.facts.filter((f) => f.factType === 'identity' || f.factType === 'experience');
  sectionMetrics.SUMMARY = {
    key: SECTION_KEYS.SUMMARY,
    available: true,
    evidenceStrength: Math.min(100, summaryFacts.length * 15 + 40),
    relevance: 90,
    informationDensity: 85,
    priority: 2,
    estimatedHeight: 42, // ~2-3 sentences + heading
    minimumUsefulRepresentation: { sentenceCount: 2 },
    inclusionStatus: 'INCLUDE',
    omissionReason: null,
  };

  // 2. SKILLS
  const skillFacts = inv.facts.filter((f) => f.factType === 'technology');
  const skillCount = skillFacts.length || (profile.skills || []).length;
  sectionMetrics.SKILLS = {
    key: SECTION_KEYS.SKILLS,
    available: skillCount > 0,
    evidenceStrength: Math.min(100, skillCount * 8 + 20),
    relevance: 95,
    informationDensity: 90,
    priority: 3,
    estimatedHeight: Math.min(65, Math.max(35, 20 + Math.ceil(skillCount / 6) * 12)),
    minimumUsefulRepresentation: { minCategories: 1, minSkills: 4 },
    inclusionStatus: skillCount > 0 ? 'INCLUDE' : 'OMIT',
    omissionReason: skillCount === 0 ? 'No corroborated or authored skills available' : null,
  };

  // 3. PROJECTS
  const projectEntries = profile.projects || [];
  const projectFacts = inv.facts.filter((f) => f.ownerType === 'project');
  const availableProjects = projectEntries.length > 0 || projectFacts.length > 0;
  const projectRelevanceScore = 85;
  sectionMetrics.PROJECTS = {
    key: SECTION_KEYS.PROJECTS,
    available: availableProjects,
    evidenceStrength: Math.min(100, projectFacts.length * 10 + 30),
    relevance: projectRelevanceScore,
    informationDensity: 88,
    priority: candidateArchetype === 'EXPERIENCED' ? 5 : 4,
    estimatedHeight: availableProjects ? Math.min(260, 30 + Math.min(3, projectEntries.length) * 65) : 0,
    minimumUsefulRepresentation: { minProjects: 1, bulletsPerProject: 1 },
    inclusionStatus: availableProjects ? 'INCLUDE' : 'OMIT',
    omissionReason: availableProjects ? null : 'No project evidence in candidate record',
  };

  // 4. DSA / PROBLEM SOLVING
  const dsaFacts = inv.facts.filter(
    (f) => f.ownerType === 'dsa' || f.projectId === PROBLEM_SOLVING_PROJECT_KEY
  );
  const hasDsaUrl = Boolean(dsa?.profileUrl || dsa?.url || dsaFacts.some((f) => f.factType === 'profile_link'));
  const hasDsaAuthored = Boolean(
    (Array.isArray(dsa?.bullets) && dsa.bullets.length > 0) ||
    dsaFacts.some((f) => f.factType === 'dsa_authored' || f.candidateAuthored)
  );
  const hasDsaMetrics = Boolean(dsa?.metrics || dsaFacts.some((f) => f.metrics && Object.keys(f.metrics).length > 0));
  const hasMeaningfulDsa = hasDsaUrl || hasDsaAuthored || hasDsaMetrics || dsaFacts.length > 0;

  sectionMetrics.DSA = {
    key: SECTION_KEYS.DSA,
    available: hasMeaningfulDsa,
    evidenceStrength: hasDsaMetrics ? 85 : hasDsaAuthored ? 75 : hasDsaUrl ? 65 : 40,
    relevance: 70,
    informationDensity: 75,
    priority: 6,
    estimatedHeight: hasMeaningfulDsa ? (hasDsaAuthored ? 40 : 25) : 0,
    minimumUsefulRepresentation: { compact: !hasDsaAuthored },
    inclusionStatus: hasMeaningfulDsa ? 'INCLUDE' : 'OMIT',
    omissionReason: hasMeaningfulDsa ? null : 'No DSA profile link or problem-solving evidence',
  };

  // 5. EXPERIENCE
  const expFacts = inv.facts.filter((f) => f.ownerType === 'experience');
  const hasExp = experiences.length > 0 || expFacts.length > 0;
  sectionMetrics.EXPERIENCE = {
    key: SECTION_KEYS.EXPERIENCE,
    available: hasExp,
    evidenceStrength: Math.min(100, expFacts.length * 12 + 40),
    relevance: 90,
    informationDensity: 88,
    priority: candidateArchetype === 'EXPERIENCED' ? 4 : 5,
    estimatedHeight: hasExp ? Math.min(220, 25 + experiences.length * 55) : 0,
    minimumUsefulRepresentation: { minRoles: 1, bulletsPerRole: 1 },
    inclusionStatus: hasExp ? 'INCLUDE' : 'OMIT',
    omissionReason: hasExp ? null : 'No professional experience entries provided',
  };

  // 6. EDUCATION
  const eduFacts = inv.facts.filter((f) => f.ownerType === 'education');
  const hasEdu = education.length > 0 || eduFacts.length > 0;
  sectionMetrics.EDUCATION = {
    key: SECTION_KEYS.EDUCATION,
    available: hasEdu,
    evidenceStrength: Math.min(100, eduFacts.length * 20 + 50),
    relevance: 75,
    informationDensity: 80,
    priority: 7,
    estimatedHeight: hasEdu ? Math.min(80, 25 + education.length * 25) : 0,
    minimumUsefulRepresentation: { minDegrees: 1 },
    inclusionStatus: hasEdu ? 'INCLUDE' : 'OMIT',
    omissionReason: hasEdu ? null : 'No education records available',
  };

  // 7. CERTIFICATIONS
  const certFacts = inv.facts.filter((f) => f.factType === 'certification');
  const hasCerts = certifications.length > 0 || certFacts.length > 0;
  sectionMetrics.CERTIFICATIONS = {
    key: SECTION_KEYS.CERTIFICATIONS,
    available: hasCerts,
    evidenceStrength: Math.min(100, certFacts.length * 25 + 50),
    relevance: 65,
    informationDensity: 75,
    priority: 8,
    estimatedHeight: hasCerts ? Math.min(50, 20 + certifications.length * 15) : 0,
    minimumUsefulRepresentation: { minCerts: 1 },
    inclusionStatus: hasCerts ? 'INCLUDE' : 'OMIT',
    omissionReason: hasCerts ? null : 'No certifications available',
  };

  // 8. AWARDS
  const hasAwards = awards.length > 0;
  sectionMetrics.AWARDS = {
    key: SECTION_KEYS.AWARDS,
    available: hasAwards,
    evidenceStrength: hasAwards ? 70 : 0,
    relevance: 60,
    informationDensity: 70,
    priority: 9,
    estimatedHeight: hasAwards ? Math.min(45, 20 + awards.length * 15) : 0,
    minimumUsefulRepresentation: { minAwards: 1 },
    inclusionStatus: hasAwards ? 'INCLUDE' : 'OMIT',
    omissionReason: hasAwards ? null : 'No awards or honors recorded',
  };

  // 9. OPEN SOURCE
  const hasOS = openSource.length > 0;
  sectionMetrics.OPEN_SOURCE = {
    key: SECTION_KEYS.OPEN_SOURCE,
    available: hasOS,
    evidenceStrength: hasOS ? 75 : 0,
    relevance: 70,
    informationDensity: 75,
    priority: 9,
    estimatedHeight: hasOS ? Math.min(50, 20 + openSource.length * 18) : 0,
    minimumUsefulRepresentation: { minContributions: 1 },
    inclusionStatus: hasOS ? 'INCLUDE' : 'OMIT',
    omissionReason: hasOS ? null : 'No open-source contributions recorded',
  };

  // Ordering logic: sensible defaults driven by candidate archetype & evidence
  const orderedKeys = ['HEADER', SECTION_KEYS.SUMMARY, SECTION_KEYS.SKILLS];

  if (candidateArchetype === 'EXPERIENCED') {
    if (sectionMetrics.EXPERIENCE.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.EXPERIENCE);
    if (sectionMetrics.PROJECTS.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.PROJECTS);
    if (sectionMetrics.DSA.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.DSA);
    if (sectionMetrics.EDUCATION.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.EDUCATION);
  } else {
    // Fresher / Career Changer / Project-focused
    if (sectionMetrics.PROJECTS.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.PROJECTS);
    if (sectionMetrics.DSA.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.DSA);
    if (sectionMetrics.EXPERIENCE.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.EXPERIENCE);
    if (sectionMetrics.EDUCATION.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.EDUCATION);
  }

  if (sectionMetrics.CERTIFICATIONS.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.CERTIFICATIONS);
  if (sectionMetrics.AWARDS.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.AWARDS);
  if (sectionMetrics.OPEN_SOURCE.inclusionStatus === 'INCLUDE') orderedKeys.push(SECTION_KEYS.OPEN_SOURCE);

  // Total estimated height
  const totalEstimatedHeight = orderedKeys.reduce((acc, key) => {
    if (key === 'HEADER') return acc + 65; // header name, contact, links
    return acc + (sectionMetrics[key]?.estimatedHeight || 0);
  }, 0);

  const capacitySurplusOrDeficit = USABLE_PAGE_HEIGHT_PT - totalEstimatedHeight;

  return {
    candidateArchetype,
    sectionMetrics,
    sectionOrder: orderedKeys,
    totalEstimatedHeight,
    usablePageHeight: USABLE_PAGE_HEIGHT_PT,
    capacitySurplusOrDeficit,
    isOverCapacity: capacitySurplusOrDeficit < -30,
    isSparse: capacitySurplusOrDeficit > 120,
  };
}
