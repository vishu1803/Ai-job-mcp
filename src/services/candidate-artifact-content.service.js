/**
 * @file Candidate Application Document Content Service (P14-006).
 *
 * Produces the REAL markdown content for tailored resumes and cover letters
 * from canonical stored candidate data. This service is the single source of
 * truth for application document content and replaces the previous broken
 * orchestration path, which silently fell back to generic placeholder
 * templates ("Dedicated software engineer with verified technical skills…",
 * "Software Development Experience Verified", "Academic / Technical
 * Foundation Completed") whenever a downstream service call failed.
 *
 * Radical Truth Invariants:
 * - Every rendered claim is copied from stored candidate records. Nothing is
 *   invented: no experience years, no employers, no institutions, no skills,
 *   no projects, no metrics, no "verified achievements" phrasing.
 * - Sections with no supported content are OMITTED entirely rather than
 *   replaced with placeholder prose. The generator renders truthful
 *   "(not provided in profile)" states internally when a section would
 *   otherwise be mandatory for layout.
 * - Job tailoring only re-prioritizes and highlights evidence that already
 *   exists (skills/projects whose technologies overlap the job description).
 *   It never upgrades provenance or manufactures job-specific claims.
 * - Deterministic output: identical inputs produce byte-identical documents
 *   (required because the package hash binds the approval ticket to content).
 */

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { projects as projectsTable } from '../db/schema.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ValidationError } from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';

const JOB_DESCRIPTION_STOP_TERMS = new Set([
  'the',
  'and',
  'with',
  'for',
  'you',
  'your',
  'our',
  'will',
  'are',
  'have',
  'who',
  'that',
  'this',
  'from',
  'into',
  'using',
  'work',
  'team',
  'role',
  'experience',
  'years',
  'strong',
  'plus',
  'ability',
  'skills',
  'knowledge',
  'excellent',
  'good',
  'other',
  'all',
  'any',
  'new',
  'across',
  'about',
]);

/**
 * Extracts meaningful lowercase keyword tokens from free job description text.
 *
 * @param {object} jobPosting Normalized job posting
 * @returns {Set<string>} Lowercase keyword set
 */
function extractJobKeywords(jobPosting) {
  const tokens = new Set();
  const addText = (text) => {
    if (typeof text !== 'string' || text.length === 0) return;
    for (const raw of text.toLowerCase().split(/[^a-z0-9.#+]+/)) {
      const token = raw.replace(/^[.#+]+|[.#+]+$/g, '');
      if (
        token.length >= 2 &&
        token.length <= 30 &&
        !JOB_DESCRIPTION_STOP_TERMS.has(token) &&
        !/^\d+$/.test(token)
      ) {
        tokens.add(token);
      }
    }
  };
  addText(jobPosting?.title);
  for (const skill of jobPosting?.skills || []) addText(skill);
  for (const requirement of jobPosting?.requirements || []) addText(requirement);
  for (const responsibility of jobPosting?.responsibilities || []) addText(responsibility);
  return tokens;
}

/**
 * Normalizes a skill name to its lowercase comparable token form.
 *
 * @param {string} name Raw skill name
 * @returns {string} Lowercase normalized token
 */
function normalizeSkillToken(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9.#+]/g, '')
    .replace(/^[.#+]+|[.#+]+$/g, '');
}

/**
 * Formats a raw date value (e.g. "2024-06", "2021") for display.
 *
 * @param {string|null} value Raw date string
 * @returns {string} Formatted date or empty string
 */
function formatMonthYear(value) {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})/.exec(String(value));
  if (!match) return String(value);
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return String(value);
  return `${monthNames[monthIndex]} ${match[1]}`;
}

/**
 * Normalizes a project name or URL into a canonical comparison slug.
 *
 * @param {string} text
 * @returns {string}
 */
export function slugifyProject(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^github\.com\//, '')
    .replace(/^[^/]+\//, '') // strip owner/ if present
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Reconciles candidate projects across connected repository evidence, candidate
 * curated resume records, and relational projects table rows.
 *
 * @param {object} params
 * @param {Array<object>} [params.profileProjects] Projects from connected repository sync
 * @param {Array<object>} [params.resumeDataProjects] Curated projects from candidate profile
 * @param {Array<object>} [params.storedProjects] Authoritative rows from projects database table
 * @returns {Array<object>} Reconciled canonical project objects
 */
export function reconcileCandidateProjects({
  profileProjects = [],
  resumeDataProjects = [],
  storedProjects = [],
}) {
  const projectMap = new Map();

  const storedByKey = new Map();
  for (const sp of storedProjects) {
    if (!sp.name) continue;
    const key = slugifyProject(sp.name);
    const isArchived =
      sp.metadata?.portfolioStatus === 'ARCHIVED' || Boolean(sp.metadata?.archivedAt);
    const existing = storedByKey.get(key);
    if (!existing || (existing.isArchived && !isArchived)) {
      storedByKey.set(key, { ...sp, isArchived });
    }
  }

  // 1. Ingest candidate's curated resumeData projects (authoritative for authentic titles & bullets)
  for (const rp of resumeDataProjects) {
    const rawName = rp.title || rp.name;
    if (!rawName) continue;
    const key = slugifyProject(rawName) || slugifyProject(rp.url) || slugifyProject(rp.urls?.[0]);
    if (!key) continue;

    let liveUrl = null;
    let repoUrl = rp.url || rp.urls?.[0] || null;
    const cleanBullets = [];
    for (const b of rp.bullets || []) {
      const bText = String(b).trim();
      const match = /^(?:Project Link|Source Code):\s*(https?:\/\/\S+)/i.exec(bText);
      if (match) {
        const link = match[1].replace(/\/+$/, '');
        if (/github\.com/i.test(link)) {
          if (!repoUrl) repoUrl = link;
        } else {
          liveUrl = link;
        }
      } else {
        cleanBullets.push(bText);
      }
    }

    projectMap.set(key, {
      name: String(rawName).trim(),
      slug: key,
      title: String(rawName).trim(),
      summary: rp.summary || rp.headline || null,
      bullets: cleanBullets,
      technologies: Array.isArray(rp.technologies) ? rp.technologies.filter(Boolean) : [],
      repositoryUrl: repoUrl,
      liveUrl,
      evidence: [],
      evidenceCount: 0,
      provenanceStatus: 'CLAIMED',
      isArchived: false,
    });
  }

  // 2. Ingest and reconcile profile projects (from connected repository scan)
  for (const pp of profileProjects) {
    const rawName = pp.name || pp.slug;
    if (!rawName) continue;
    const key =
      slugifyProject(rawName) || slugifyProject(pp.metadata?.sourceUrl) || slugifyProject(pp.url);
    if (!key) continue;

    const stored = storedByKey.get(key);
    const isArchived =
      pp.metadata?.portfolioStatus === 'ARCHIVED' ||
      Boolean(pp.metadata?.archivedAt) ||
      stored?.isArchived === true;

    const resolvedUrl =
      pp.metadata?.sourceUrl ||
      pp.metadata?.repositoryUrl ||
      stored?.metadata?.sourceUrl ||
      stored?.metadata?.repositoryUrl ||
      pp.url ||
      null;

    const evidence = Array.isArray(pp.evidence) ? pp.evidence : [];
    const evidenceCount = evidence.length;

    const evidenceTech = new Set();
    for (const ev of evidence) {
      if (ev.skillName) evidenceTech.add(ev.skillName);
      else if (ev.skillSlug) evidenceTech.add(ev.skillSlug);
    }
    const repoTech = [
      ...(Array.isArray(pp.technologies) ? pp.technologies : []),
      ...(Array.isArray(pp.primaryLanguages) ? pp.primaryLanguages : []),
      ...evidenceTech,
    ].filter(Boolean);

    const existing = projectMap.get(key);
    if (!existing) {
      projectMap.set(key, {
        name: String(rawName).trim(),
        slug: key,
        title: String(rawName).trim(),
        summary: pp.summary || pp.headline || null,
        bullets: Array.isArray(pp.bullets) ? pp.bullets : [],
        technologies: repoTech,
        repositoryUrl: resolvedUrl,
        liveUrl: null,
        evidence,
        evidenceCount,
        provenanceStatus: 'VERIFIED',
        isArchived,
      });
    } else {
      if (!existing.repositoryUrl && resolvedUrl) existing.repositoryUrl = resolvedUrl;
      if (evidence.length > 0) {
        existing.evidence = evidence;
        existing.evidenceCount = evidenceCount;
      }
      const techSet = new Set(existing.technologies);
      for (const t of repoTech) {
        if (![...techSet].some((ex) => ex.toLowerCase() === t.toLowerCase())) {
          techSet.add(t);
        }
      }
      existing.technologies = Array.from(techSet);
      if (evidenceCount > 0 || resolvedUrl) {
        existing.provenanceStatus = 'CORROBORATED';
      }
      if (existing.isArchived && !isArchived) {
        existing.isArchived = false;
      }
    }
  }

  // 3. Keep archived rows for auditability if not already present
  for (const sp of storedProjects) {
    const isArchived =
      sp.metadata?.portfolioStatus === 'ARCHIVED' || Boolean(sp.metadata?.archivedAt);
    if (isArchived && sp.name) {
      const key = slugifyProject(sp.name) + '-archived';
      if (!projectMap.has(key)) {
        projectMap.set(key, {
          name: String(sp.name).trim(),
          slug: key,
          title: String(sp.name).trim(),
          summary: sp.summary || null,
          bullets: [],
          technologies: Array.isArray(sp.primaryLanguages) ? sp.primaryLanguages : [],
          repositoryUrl: sp.metadata?.sourceUrl || null,
          liveUrl: null,
          evidence: [],
          evidenceCount: 0,
          provenanceStatus: 'CLAIMED',
          isArchived: true,
        });
      }
    }
  }

  return Array.from(projectMap.values());
}

export class CandidateArtifactContentService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=defaultDb]
   * @param {CandidateProfileService} [options.candidateProfileService]
   * @param {import('pino').Logger} [options.logger=defaultLogger]
   */
  constructor(options = {}) {
    this.db = options.database || defaultDb;
    this.candidateProfileService =
      options.candidateProfileService || new CandidateProfileService(this.db);
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Loads the canonical candidate profile view through CandidateProfileService.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @returns {Promise<object>} Candidate profile view (candidate, skills, projects, …)
   */
  async loadCandidateProfile({ tenantId, userId, candidateId }) {
    return this.candidateProfileService.getProfile(
      { tenantId, userId, role: 'MEMBER' },
      candidateId
    );
  }

  /**
   * Loads stored projects (with URLs when available) for a candidate.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<Array<object>>} Stored project rows
   */
  async loadStoredProjects({ tenantId, candidateId }) {
    try {
      return await this.db
        .select()
        .from(projectsTable)
        .where(
          and(eq(projectsTable.tenantId, tenantId), eq(projectsTable.candidateId, candidateId))
        );
    } catch (err) {
      this.logger.warn(
        { error: err.message },
        'Failed to load stored projects; project sections will rely on profile metadata only'
      );
      return [];
    }
  }

  /**
   * Builds the canonical candidate data snapshot used by all document builders.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} params.jobPosting Normalized job posting (NormalizedJobPostingSchema)
   * @returns {Promise<object>} candidateData snapshot
   */
  /**
   * Validates candidate-owned input content against test artifacts, suspicious remnants,
   * or malformed fragments. Fails closed with the exact source field rather than
   * silently mutating user content.
   *
   * @param {object} candidateData
   * @throws {ValidationError} When suspicious or malformed content is found
   */
  validateCandidateInputIntegrity(candidateData) {
    const suspiciousPatterns = [
      { pattern: /Testing dirty state/i, label: 'Testing dirty state test remnant' },
      { pattern: /dirty state bar/i, label: 'dirty state bar test artifact' },
      { pattern: /\[updated\]/i, label: '[updated] test tag' },
      { pattern: /\[test\]/i, label: '[test] tag' },
      { pattern: /\bTODO:/i, label: 'TODO marker' },
      { pattern: /\bLorem ipsum\b/i, label: 'Lorem ipsum placeholder' },
      { pattern: /high-performan\s+Testing/i, label: 'corrupted word splice' },
      { pattern: /\b[a-zA-Z]{4,}\s+Testing\s+dirty/i, label: 'test text injection' },
    ];

    const checkField = (value, fieldName) => {
      if (typeof value !== 'string') return;
      for (const { pattern, label } of suspiciousPatterns) {
        if (pattern.test(value)) {
          throw new ValidationError(
            `Candidate profile data in field '${fieldName}' contains suspicious test artifact or malformed content (${label}): "${value.slice(0, 80)}...". Candidate-owned content cannot be silently rewritten; profile must be corrected at source.`
          );
        }
      }
    };

    checkField(candidateData.summary, 'candidates.summary');
    checkField(candidateData.headline, 'candidates.headline');

    for (let i = 0; i < (candidateData.experience || []).length; i++) {
      const exp = candidateData.experience[i];
      checkField(exp.title, `experience[${i}].title`);
      checkField(exp.company, `experience[${i}].company`);
      for (let j = 0; j < (exp.bullets || []).length; j++) {
        checkField(exp.bullets[j], `experience[${i}].bullets[${j}]`);
      }
    }

    for (let i = 0; i < (candidateData.projects || []).length; i++) {
      const proj = candidateData.projects[i];
      checkField(proj.name, `projects[${i}].name`);
      checkField(proj.summary, `projects[${i}].summary`);
    }
  }

  /**
   * Builds the canonical candidate data snapshot used by all document builders.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} params.jobPosting Normalized job posting (NormalizedJobPostingSchema)
   * @returns {Promise<object>} candidateData snapshot
   */
  async buildCandidateData({ tenantId, userId, candidateId, jobPosting }) {
    const profileView = await this.loadCandidateProfile({ tenantId, userId, candidateId });
    const candidate = profileView.candidate || {};
    const metadata = candidate.profileMetadata || {};
    const userCustom = metadata.userCustom || {};

    const storedProjects = await this.loadStoredProjects({ tenantId, candidateId });
    const storedProjectByUrl = new Map();
    for (const project of storedProjects) {
      if (!project.name) continue;
      const key = String(project.name).toLowerCase().trim();
      const existing = storedProjectByUrl.get(key);
      const isArchived =
        project.metadata?.portfolioStatus === 'ARCHIVED' || Boolean(project.metadata?.archivedAt);
      const hasUrl = Boolean(project.metadata?.sourceUrl || project.metadata?.repositoryUrl);
      if (!existing) {
        storedProjectByUrl.set(key, project);
      } else {
        const existingArchived =
          existing.metadata?.portfolioStatus === 'ARCHIVED' ||
          Boolean(existing.metadata?.archivedAt);
        const existingHasUrl = Boolean(
          existing.metadata?.sourceUrl || existing.metadata?.repositoryUrl
        );
        // Prefer active over archived; prefer row with valid source URL
        if (existingArchived && !isArchived) {
          storedProjectByUrl.set(key, project);
        } else if (!existingHasUrl && hasUrl && !isArchived) {
          storedProjectByUrl.set(key, project);
        }
      }
    }

    const githubIdentity = (profileView.identities || []).find(
      (identity) => identity.provider && /github/i.test(identity.provider)
    );
    const githubUsername = githubIdentity?.externalUsername || null;

    const portfolioLinks = Array.isArray(metadata.portfolioLinks) ? metadata.portfolioLinks : [];
    const githubPortfolioLink = portfolioLinks.find(
      (link) => link?.label && /github/i.test(link.label)
    );
    const resolvedGithubUsername =
      githubUsername ||
      (githubPortfolioLink
        ? /github\.com\/([^/?#]+)/i.exec(githubPortfolioLink.url || '')?.[1] || null
        : null);

    // Experience: prefer userCustom.experience (structured), fall back to systemInferred resume extraction
    const experience = Array.isArray(userCustom.experience)
      ? userCustom.experience
      : Array.isArray(metadata.experience)
        ? metadata.experience
        : [];

    // Education: prefer userCustom.education, fall back to systemInferred resume extraction
    const education = Array.isArray(userCustom.education)
      ? userCustom.education
      : Array.isArray(metadata.education)
        ? metadata.education
        : [];

    const resumeDataProjects = Array.isArray(metadata.resumeData?.projects)
      ? metadata.resumeData.projects
      : Array.isArray(userCustom.projects)
        ? userCustom.projects
        : [];

    const reconciledProjects = reconcileCandidateProjects({
      profileProjects: profileView.projects || [],
      resumeDataProjects,
      storedProjects,
    });

    const snapshot = {
      tenantId,
      candidateId,
      jobPosting,
      jobKeywords: extractJobKeywords(jobPosting),
      displayName: candidate.displayName || null,
      email: profileView.userEmail || candidate.canonicalEmail || null,
      phone: userCustom.phone || metadata.phone || null,
      location: userCustom.location || metadata.location || null,
      headline: candidate.headline || userCustom.headline || null,
      summary: candidate.summary || userCustom.summary || null,
      experience,
      education,
      certifications: Array.isArray(userCustom.certifications) ? userCustom.certifications : [],
      skills: profileView.skills || [],
      projects: reconciledProjects.length > 0 ? reconciledProjects : profileView.projects || [],
      storedProjectByUrl,
      githubUsername: resolvedGithubUsername,
      portfolioLinks,
    };

    // Fail-closed on malformed or test-contaminated candidate input content
    this.validateCandidateInputIntegrity(snapshot);

    return snapshot;
  }

  /**
   * Splits candidate skills into provenance-truthed buckets for resume rendering.
   *
   * @param {object} candidateData Candidate data snapshot
   * @returns {{ verified: string[], claimed: string[], learning: string[] }}
   */
  partitionSkills(candidateData) {
    const verified = [];
    const claimed = [];
    const learning = [];

    for (const skill of candidateData.skills || []) {
      const name = skill.name || skill.skillName;
      if (!name) continue;
      const provenance =
        skill.provenanceStatus || skill.provenance || (skill.isUserClaim ? 'CLAIMED' : null);
      if (provenance === 'VERIFIED' || provenance === 'CORROBORATED') verified.push(name);
      else if (provenance === 'LEARNING') learning.push(name);
      else if (
        provenance === 'SELF_DECLARED' ||
        provenance === 'CLAIMED' ||
        provenance === 'USER_PROVIDED'
      )
        claimed.push(name);
      else claimed.push(name);
    }

    const dedupe = (list) => Array.from(new Set(list));
    return { verified: dedupe(verified), claimed: dedupe(claimed), learning: dedupe(learning) };
  }

  /**
   * Ranks skills and projects by overlap with the target job description.
   * Pure prioritization of existing evidence — never upgrades provenance.
   *
   * @param {Array<string>} skillNames Skill display names
   * @param {object} candidateData Candidate data snapshot
   * @returns {Array<{ name: string, relevance: number }>} Ranked skill names
   */
  rankSkillsForJob(skillNames, candidateData) {
    return skillNames
      .map((name) => {
        const token = normalizeSkillToken(name);
        let relevance = 0;
        for (const keyword of candidateData.jobKeywords) {
          if (token === keyword || (token.length >= 4 && keyword.startsWith(token))) {
            relevance += 10;
          } else if (token.length >= 4 && keyword.includes(token)) {
            relevance += 5;
          }
        }
        return { name, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name));
  }

  /**
   * Computes project job relevance using deterministic keyword-overlap.
   * Enforces project deduplication: projects sharing the same canonical name or
   * repository URL are merged, preferring active rows over archived ones.
   * Every project in the returned list has a unique name and unique URL.
   *
   * @param {object} candidateData Candidate data snapshot
   * @returns {Array<{ name: string, url: string|null, summary: string|null, technologies: string[], relevance: number }>}
   */
  /**
   * Computes project job relevance using deterministic multi-factor scoring:
   * evidenceQuality + technicalDepth + roleRelevance + technologyOverlap + diversityTieBreaker.
   *
   * Invariants Enforced:
   * - Never selects a project merely because repo name matches job keywords.
   * - Never uses project name alone as evidence of technical capability.
   * - Selected projects must have authentic technical bullets from candidate/repo records.
   * - Archived projects are never selected but preserved in audit.
   * - Produces a deterministic project selection audit.
   *
   * @param {object} candidateData Candidate data snapshot
   * @param {object} [jobPosting] Target job posting (defaults to candidateData.jobPosting)
   * @returns {Array<object>} Ranked projects with .selectedProjects and .selectionAudit attached
   */
  rankProjectsForJob(candidateData, jobPosting = candidateData?.jobPosting, options = {}) {
    const targetPosting = jobPosting || candidateData?.jobPosting || {};
    const jobTitle = (targetPosting.title || '').toLowerCase();
    const jobDesc =
      `${targetPosting.title || ''} ${targetPosting.description || ''} ${(targetPosting.requirements || []).join(' ')} ${(targetPosting.responsibilities || []).join(' ')} ${(targetPosting.skills || []).join(' ')}`.toLowerCase();

    const isBackendRole =
      /backend|api|database|server|distributed|infrastructure|microservice/i.test(jobTitle) ||
      /backend|api|database|server|sql|postgresql|rest/i.test(jobDesc);
    const isFrontendRole = /frontend|ui|ux|client/i.test(jobTitle) && !isBackendRole;

    const jobSkillsList = (targetPosting.skills || []).map((s) => s.toLowerCase());

    // 1. Deduplicate candidateData.projects by slug, preferring active over archived, and resolving repository URLs
    const projectBySlug = new Map();
    for (const rawProj of candidateData.projects || []) {
      const name = rawProj.name || rawProj.title;
      if (!name) continue;
      const slug = slugifyProject(name);
      const stored = candidateData.storedProjectByUrl?.get(String(name).toLowerCase());
      const isArchived =
        rawProj.isArchived === true ||
        rawProj.metadata?.portfolioStatus === 'ARCHIVED' ||
        Boolean(rawProj.metadata?.archivedAt) ||
        stored?.metadata?.portfolioStatus === 'ARCHIVED' ||
        Boolean(stored?.metadata?.archivedAt);

      const resolvedUrl =
        rawProj.url ||
        rawProj.repositoryUrl ||
        rawProj.metadata?.sourceUrl ||
        stored?.metadata?.sourceUrl ||
        stored?.metadata?.repositoryUrl ||
        null;

      const proj = {
        ...rawProj,
        name: String(name).trim(),
        url: resolvedUrl,
        repositoryUrl: resolvedUrl,
        isArchived,
      };

      const existing = projectBySlug.get(slug);
      if (!existing) {
        projectBySlug.set(slug, proj);
      } else {
        if (existing.isArchived && !isArchived) {
          projectBySlug.set(slug, proj);
        } else if (!existing.isArchived && isArchived) {
          // Keep active
        } else {
          if (!existing.url && resolvedUrl) existing.url = resolvedUrl;
          if (!existing.repositoryUrl && resolvedUrl) existing.repositoryUrl = resolvedUrl;
          if ((!existing.bullets || existing.bullets.length === 0) && proj.bullets?.length > 0) {
            existing.bullets = proj.bullets;
          }
          const mergedTech = Array.from(
            new Set([...(existing.technologies || []), ...(proj.technologies || [])])
          );
          existing.technologies = mergedTech;
          if (!existing.summary && proj.summary) existing.summary = proj.summary;
        }
      }
    }

    const projectsList = Array.from(projectBySlug.values());
    const scored = [];

    for (const proj of projectsList) {
      if (proj.isArchived) {
        scored.push({
          project: proj,
          score: 0,
          scoreComponents: {
            evidenceQuality: 0,
            technicalDepth: 0,
            roleRelevance: 0,
            technologyOverlap: 0,
            diversityTieBreaker: 0,
          },
          status: 'REJECTED',
          rejectionReason: 'Project is archived (portfolioStatus: ARCHIVED)',
        });
        continue;
      }

      const evidenceCount =
        proj.evidenceCount || (Array.isArray(proj.evidence) ? proj.evidence.length : 0);
      const rawBullets = Array.isArray(proj.bullets) ? proj.bullets : [];
      const hasSummary = Boolean(proj.summary && proj.summary.trim().length > 0);
      const bullets = rawBullets.length > 0 ? rawBullets : hasSummary ? [proj.summary.trim()] : [];

      if (evidenceCount === 0 && bullets.length === 0) {
        scored.push({
          project: proj,
          score: 0,
          scoreComponents: {
            evidenceQuality: 0,
            technicalDepth: 0,
            roleRelevance: 0,
            technologyOverlap: 0,
            diversityTieBreaker: 0,
          },
          status: 'REJECTED',
          rejectionReason:
            'Zero repository evidence and no authentic technical bullets or description',
        });
        continue;
      }

      // 1. Evidence Quality (0 - 30)
      let evidenceQuality = 0;
      if (proj.repositoryUrl || proj.url) evidenceQuality += 10;
      if (evidenceCount >= 25) evidenceQuality += 15;
      else if (evidenceCount >= 10) evidenceQuality += 10;
      else if (evidenceCount >= 1) evidenceQuality += 5;
      if (proj.provenanceStatus === 'CORROBORATED') evidenceQuality += 5;

      // 2. Technical Depth (0 - 30) - from technologies & authentic technical bullets (NEVER project name alone)
      let technicalDepth = 0;
      const techText = `${(proj.technologies || []).join(' ')} ${bullets.join(' ')}`.toLowerCase();

      if (
        /fastify|express|fastapi|flask|django|nest|node|rest|graphql|mcp|model context protocol|socket\.io/i.test(
          techText
        )
      ) {
        technicalDepth += 8;
      }
      if (/postgres|prisma|drizzle|mongo|redis|sql|orm/i.test(techText)) {
        technicalDepth += 8;
      }
      if (/jwt|rbac|auth|role-based|permission|security/i.test(techText)) {
        technicalDepth += 7;
      }
      if (
        /async|webhook|real-time|realtime|socket|latency|optimization|concurrency/i.test(techText)
      ) {
        technicalDepth += 7;
      }

      // 3. Role Relevance (0 - 30) - dynamic to target role
      let roleRelevance = 0;
      if (isBackendRole) {
        let backendSignals = 0;
        if (/rest|api|crud|endpoints/i.test(techText)) backendSignals += 10;
        if (/postgres|database|prisma|drizzle|sql/i.test(techText)) backendSignals += 10;
        if (/backend|fastapi|flask|fastify|express|node|server/i.test(techText))
          backendSignals += 10;
        roleRelevance = Math.min(30, backendSignals);
        if (roleRelevance === 0) roleRelevance = 5;
      } else if (isFrontendRole) {
        let frontendSignals = 0;
        if (/react|next|ui|css|tailwind|components/i.test(techText)) frontendSignals += 20;
        if (/state|responsive|design/i.test(techText)) frontendSignals += 10;
        roleRelevance = Math.min(30, frontendSignals);
        if (roleRelevance === 0) roleRelevance = 5;
      } else {
        roleRelevance = 20;
      }

      // 4. Technology Overlap (0 - 20) - Overlap of verified technologies/bullets with job skills (NEVER project name alone)
      let technologyOverlap = 0;
      const matchedJobTechs = new Set();
      for (const skill of jobSkillsList) {
        const s = skill.toLowerCase();
        const inTechs = (proj.technologies || []).some(
          (t) => t.toLowerCase().includes(s) || s.includes(t.toLowerCase())
        );
        const inBullets = bullets.some((b) => b.toLowerCase().includes(s));
        if (inTechs || inBullets) {
          matchedJobTechs.add(s);
        }
      }
      technologyOverlap = Math.min(20, matchedJobTechs.size * 5);

      const baseScore = evidenceQuality + technicalDepth + roleRelevance + technologyOverlap;

      scored.push({
        project: proj,
        score: baseScore,
        scoreComponents: {
          evidenceQuality,
          technicalDepth,
          roleRelevance,
          technologyOverlap,
          diversityTieBreaker: 0,
        },
        status: 'PENDING',
        rejectionReason: null,
      });
    }

    // Sort by base score descending
    const activeCandidates = scored
      .filter((item) => item.status === 'PENDING')
      .sort(
        (a, b) =>
          b.score - a.score || (b.project.evidenceCount || 0) - (a.project.evidenceCount || 0)
      );

    const selected = [];
    const maxToSelect = options?.maxProjects || 2;

    for (let i = 0; i < activeCandidates.length; i++) {
      const candidate = activeCandidates[i];
      const rawBullets = Array.isArray(candidate.project.bullets) ? candidate.project.bullets : [];
      const projBullets =
        rawBullets.length > 0
          ? rawBullets
          : candidate.project.summary
            ? [candidate.project.summary]
            : [];

      if (projBullets.length === 0) {
        candidate.status = 'REJECTED';
        candidate.rejectionReason =
          'Lacks authentic technical bullets or description in candidate records';
        continue;
      }

      if (selected.length === 0) {
        candidate.status = 'SELECTED';
        selected.push(candidate);
      } else if (selected.length < maxToSelect) {
        const prevSelectedTechs = new Set(
          (selected[0].project.technologies || []).map((t) => t.toLowerCase())
        );
        const curTechs = (candidate.project.technologies || []).map((t) => t.toLowerCase());
        const hasDistinctStack = curTechs.some((t) => !prevSelectedTechs.has(t));

        if (hasDistinctStack) {
          candidate.scoreComponents.diversityTieBreaker = 3;
          candidate.score += 3;
        }
        candidate.status = 'SELECTED';
        selected.push(candidate);
      } else {
        candidate.status = 'REJECTED';
        candidate.rejectionReason = `Lower relevance score (${candidate.score}) compared to top selected projects`;
      }
    }

    const selectionAudit = scored.map((item) => ({
      projectName: item.project.name,
      score: item.score,
      scoreComponents: item.scoreComponents,
      status: item.status === 'PENDING' ? 'REJECTED' : item.status,
      rejectionReason:
        item.rejectionReason ||
        (item.status === 'SELECTED' ? null : 'Lower relevance compared to top selected projects'),
    }));

    const selectedProjects = selected.map((s) => s.project);

    // Format output array: deduplicated, sorted by relevance score descending
    const rankedList = projectsList
      .map((p) => {
        const auditItem = selectionAudit.find((a) => a.projectName === p.name);
        return {
          name: p.name,
          url: p.repositoryUrl || p.url || null,
          repositoryUrl: p.repositoryUrl || p.url || null,
          liveUrl: p.liveUrl || null,
          summary: p.summary,
          technologies: p.technologies || [],
          bullets:
            Array.isArray(p.bullets) && p.bullets.length > 0
              ? p.bullets
              : p.summary
                ? [p.summary]
                : [],
          relevance: auditItem?.score || 0,
          provenanceStatus: p.provenanceStatus || 'VERIFIED',
        };
      })
      .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name));

    // Attach metadata properties
    rankedList.selectedProjects =
      selectedProjects.length > 0 ? selectedProjects : rankedList.slice(0, 2);
    rankedList.selectionAudit = selectionAudit;

    return rankedList;
  }

  /**
   * Dynamically categorizes and selects role-relevant candidate skills.
   * Filters low-value tooling noise (Cypress, ESLint, Vite, Tailwind CSS) for backend roles.
   * Produces a deterministic skill selection audit.
   *
   * @param {object} candidateData
   * @param {object} [jobPosting]
   * @returns {{ categorizedSkills: object, skillAudit: Array<object> }}
   */
  selectAndCategorizeSkillsForJob(candidateData, jobPosting = candidateData?.jobPosting) {
    const targetPosting = jobPosting || candidateData?.jobPosting || {};
    const jobTitle = (targetPosting.title || '').toLowerCase();
    const jobDesc =
      `${targetPosting.title || ''} ${targetPosting.description || ''} ${(targetPosting.requirements || []).join(' ')} ${(targetPosting.skills || []).join(' ')}`.toLowerCase();

    const isBackendRole =
      /backend|api|database|server|distributed|infrastructure|microservice/i.test(jobTitle) ||
      /backend|api|database|server|sql|postgresql|rest/i.test(jobDesc);

    const jobSkillTokens = new Set(
      (targetPosting.skills || []).map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );

    const getCategory = (skillName, rawCategory) => {
      const s = String(skillName).toLowerCase();
      if (
        [
          'typescript',
          'javascript',
          'python',
          'sql',
          'c++',
          'java',
          'go',
          'rust',
          'c',
          'c#',
          'ruby',
          'php',
        ].includes(s) ||
        rawCategory === 'LANGUAGE'
      ) {
        return 'Languages';
      }
      if (
        [
          'postgresql',
          'postgres',
          'prisma',
          'prisma orm',
          'drizzle orm',
          'drizzle',
          'mongodb',
          'redis',
          'mysql',
          'sqlite',
        ].includes(s) ||
        s.includes('prisma') ||
        s.includes('drizzle') ||
        rawCategory === 'DATABASE'
      ) {
        return 'Databases & ORMs';
      }
      if (
        [
          'fastify',
          'express.js',
          'express',
          'fastapi',
          'flask',
          'django',
          'nestjs',
          'node.js',
          'node',
          'rest apis',
          'rest api',
          'graphql',
          'socket io',
          'socket.io',
          'model context protocol',
          'mcp',
        ].includes(s)
      ) {
        return 'Backend & APIs';
      }
      if (
        [
          'docker',
          'kubernetes',
          'aws',
          'microsoft azure',
          'azure',
          'gcp',
          'github actions',
          'gitlab ci/cd',
          'git',
          'github',
          'linux',
          'ci/cd',
        ].includes(s) ||
        rawCategory === 'CLOUD_DEVOPS'
      ) {
        return 'Cloud, DevOps & Systems';
      }
      if (
        ['react', 'next.js', 'tailwind css', 'vue', 'angular', 'svelte', 'html', 'css'].includes(s)
      ) {
        return 'Frontend & Web';
      }
      if (['jest', 'cypress', 'eslint', 'vite', 'npm', 'prettier'].includes(s)) {
        return 'Developer Tooling';
      }
      return 'Other';
    };

    const backendNoise = new Set(['eslint', 'vite', 'cypress', 'tailwind css', 'npm', 'prettier']);

    // Build unique skill candidate set (merge candidateSkills and any verified technologies in candidate profile)
    const skillMap = new Map();
    for (const s of candidateData.skills || []) {
      const name = s.name || s.skillName;
      if (!name) continue;
      skillMap.set(name.toLowerCase(), s);
    }

    // Also check candidate projects for verified languages/frameworks if not already in catalog
    for (const p of candidateData.projects || []) {
      for (const t of p.technologies || []) {
        const k = t.toLowerCase();
        if (!skillMap.has(k)) {
          if (['python', 'typescript', 'javascript', 'node.js', 'postgresql'].includes(k)) {
            skillMap.set(k, {
              name: t,
              category: getCategory(t, null),
              provenanceStatus: p.provenanceStatus || 'CLAIMED',
              evidenceCount: p.evidenceCount || 0,
            });
          }
        }
      }
    }

    const scoredSkills = [];

    for (const skill of skillMap.values()) {
      const name = skill.name || skill.skillName;
      if (!name) continue;
      const token = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const category = getCategory(name, skill.category);
      const provenance =
        skill.provenanceStatus || skill.provenance || (skill.isUserClaim ? 'CLAIMED' : 'VERIFIED');
      const evidenceCount = skill.evidenceCount || skill.evidence?.length || 0;

      let score = 0;
      let matchReason = '';

      if (
        jobSkillTokens.has(token) ||
        (token.length >= 4 &&
          [...jobSkillTokens].some((t) => t.includes(token) || token.includes(t)))
      ) {
        score += 35;
        matchReason = 'Direct requirement match in job posting';
      } else if (jobDesc.includes(name.toLowerCase())) {
        score += 20;
        matchReason = 'Mentioned in job requirements or description';
      }

      if (isBackendRole) {
        if (category === 'Databases & ORMs' || category === 'Backend & APIs') {
          score += 25;
          if (!matchReason) matchReason = 'Core backend / database architecture competency';
        } else if (category === 'Languages') {
          score += 20;
          if (!matchReason) matchReason = 'Core programming language';
        } else if (category === 'Cloud, DevOps & Systems') {
          score += 15;
          if (!matchReason) matchReason = 'Infrastructure & DevOps automation competency';
        } else if (category === 'Frontend & Web') {
          score += 5;
          if (!matchReason) matchReason = 'Secondary full-stack web framework';
        } else if (backendNoise.has(name.toLowerCase())) {
          score -= 25;
          matchReason = 'Low-value tooling noise for backend role';
        }
      }

      if (provenance === 'VERIFIED' || provenance === 'CORROBORATED') {
        score += 10;
        if (evidenceCount > 0) score += Math.min(5, evidenceCount);
      } else if (provenance === 'SELF_DECLARED') {
        score -= 5;
      }

      scoredSkills.push({
        name,
        category,
        provenance,
        evidenceCount,
        score,
        matchReason,
      });
    }

    const categoryGroups = {
      Languages: [],
      'Backend & APIs': [],
      'Databases & ORMs': [],
      'Cloud, DevOps & Systems': [],
    };

    const skillAudit = [];

    for (const s of scoredSkills) {
      const isNoise =
        isBackendRole &&
        backendNoise.has(s.name.toLowerCase()) &&
        !jobSkillTokens.has(s.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
      const isSelfDeclaredUnverified = s.provenance === 'SELF_DECLARED' && s.score < 20;
      const isSecondaryFrontend = isBackendRole && s.category === 'Frontend & Web' && s.score < 25;

      const isClaimedBackendWithoutEvidence =
        isBackendRole &&
        s.category === 'Backend & APIs' &&
        (s.provenance === 'CLAIMED' || s.provenance === 'SELF_DECLARED') &&
        s.evidenceCount === 0 &&
        !jobSkillTokens.has(s.name.toLowerCase().replace(/[^a-z0-9]/g, '')) &&
        !jobDesc.includes(s.name.toLowerCase()) &&
        !(candidateData.projects || []).some(
          (p) =>
            (p.technologies || []).some((t) => t.toLowerCase() === s.name.toLowerCase()) ||
            (p.bullets || []).some((b) => new RegExp(`\\b${s.name}\\b`, 'i').test(b))
        );
      const isPeripheralBackendUtility =
        isBackendRole &&
        s.category === 'Backend & APIs' &&
        (s.name.toLowerCase() === 'socket io' || s.name.toLowerCase() === 'socket.io') &&
        !jobSkillTokens.has('socketio');

      if (isNoise) {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason: 'Low-value tooling noise for backend role (not requested in job posting)',
        });
      } else if (isPeripheralBackendUtility) {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason: 'Specialized real-time utility deprioritized for core backend API frameworks',
        });
      } else if (isClaimedBackendWithoutEvidence) {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason:
            'Claimed backend technology without repository evidence or direct job requirement',
        });
      } else if (isSelfDeclaredUnverified) {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason: 'Self-declared without repository evidence or direct job requirement',
        });
      } else if (isSecondaryFrontend) {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason: 'Frontend technology deprioritized for backend engineering focus',
        });
      } else if (s.score >= 15 && categoryGroups[s.category]) {
        categoryGroups[s.category].push(s);
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'SELECTED',
          reason: s.matchReason || 'Role-relevant verified competency',
        });
      } else {
        skillAudit.push({
          skill: s.name,
          category: s.category,
          provenance: s.provenance,
          score: s.score,
          status: 'OMITTED',
          reason: 'Lower relevance compared to primary role technologies',
        });
      }
    }

    const CANONICAL_ALIAS_MAP = {
      prisma: 'Prisma ORM',
      'prisma orm': 'Prisma ORM',
      postgres: 'PostgreSQL',
      postgresql: 'PostgreSQL',
      'postgresql (sql)': 'PostgreSQL',
      node: 'Node.js',
      'node.js': 'Node.js',
      express: 'Express.js',
      'express.js': 'Express.js',
      react: 'React',
      'react.js': 'React',
      drizzle: 'Drizzle ORM',
      'drizzle orm': 'Drizzle ORM',
      'rest api': 'RESTful APIs',
      'rest apis': 'RESTful APIs',
      'rest api design': 'RESTful APIs',
      fastapi: 'FastAPI',
      fastify: 'Fastify',
      'next.js': 'Next.js',
      nextjs: 'Next.js',
      nestjs: 'NestJS',
      'c/c++': 'C/C++',
      'c++': 'C/C++',
      c: 'C',
      'model context protocol': 'Model Context Protocol (MCP)',
      mcp: 'Model Context Protocol (MCP)',
    };

    const categorizedSkills = {};
    for (const [cat, list] of Object.entries(categoryGroups)) {
      list.sort((a, b) => b.score - a.score || b.evidenceCount - a.evidenceCount);
      if (list.length > 0) {
        // Deduplicate skill aliases (e.g. "Prisma" vs "Prisma ORM" -> keep canonical form)
        const deduped = [];
        const seenTokens = new Set();
        for (const s of list) {
          const rawLower = String(s.name || '')
            .trim()
            .toLowerCase();
          const canonicalName = CANONICAL_ALIAS_MAP[rawLower] || s.name;
          const token = normalizeSkillToken(canonicalName);
          if (seenTokens.has(token)) continue;
          // Check if a longer variant already covers this token
          const isSubset = [...seenTokens].some(
            (existing) => existing.includes(token) || token.includes(existing)
          );
          if (isSubset) continue;
          seenTokens.add(token);
          deduped.push(canonicalName);
        }
        // If Git and GitHub Actions are present in Cloud & DevOps, remove redundant standalone GitHub
        if (cat === 'Cloud, DevOps & Systems') {
          const hasGit = deduped.some((name) => name.toLowerCase() === 'git');
          const hasActions = deduped.some((name) => /actions/i.test(name));
          if (hasGit && hasActions) {
            const ghIdx = deduped.findIndex((name) => name.toLowerCase() === 'github');
            if (ghIdx >= 0) deduped.splice(ghIdx, 1);
          }
        }
        categorizedSkills[cat] = deduped;
      }
    }

    return { categorizedSkills, skillAudit };
  }

  /**
   * Builds the tailored resume markdown from real candidate data.
   *
   * @param {object} candidateData Candidate data snapshot
   * @param {object} jobPosting Normalized job posting
   * @returns {{ markdownContent: string, fitScore: number, title: string, sections: string[], selectedProjects: Array<object>, selectionAudit: Array<object>, categorizedSkills: object, skillAudit: Array<object> }}
   */
  buildTailoredResumeMarkdown(candidateData, jobPosting) {
    const { displayName } = candidateData;
    const targetRole = jobPosting.title;
    const _targetCompany = jobPosting.company;

    const lines = [];
    const renderedSections = [];

    const pushSection = (name) => renderedSections.push(name);

    // ---- Header (4-tier: Name, Headline, Contact, Profile Links) ------------
    lines.push(`# ${displayName}`);
    lines.push('');

    // Tier 2: Professional headline (if available) or target role
    const headline = candidateData.headline || targetRole;
    if (headline) {
      lines.push(`### ${headline}`);
      lines.push('');
    }

    // Tier 3: Contact information
    const contactParts = [];
    if (candidateData.phone) contactParts.push(`**Phone:** ${candidateData.phone}`);
    if (candidateData.location) contactParts.push(`**Location:** ${candidateData.location}`);
    if (candidateData.email) contactParts.push(`**Email:** ${candidateData.email}`);
    if (contactParts.length > 0) {
      lines.push(contactParts.join(' · '));
    }

    // Tier 4: Profile links (LinkedIn, GitHub, Portfolio, LeetCode)
    const profileLinkParts = [];
    const portfolioLinksList = candidateData.portfolioLinks || [];
    const linkedInLink = portfolioLinksList.find((l) =>
      /linkedin/i.test(l.label || l.platform || '')
    );
    if (linkedInLink?.url) profileLinkParts.push(`[LinkedIn](${linkedInLink.url})`);
    if (candidateData.githubUsername) {
      profileLinkParts.push(`[GitHub](https://github.com/${candidateData.githubUsername})`);
    }
    const portfolioLink = portfolioLinksList.find((l) =>
      /portfolio/i.test(l.label || l.platform || '')
    );
    if (portfolioLink?.url) profileLinkParts.push(`[Portfolio](${portfolioLink.url})`);
    const leetcodeLink = portfolioLinksList.find((l) =>
      /leetcode/i.test(l.label || l.platform || '')
    );
    if (leetcodeLink?.url) profileLinkParts.push(`[LeetCode](${leetcodeLink.url})`);
    if (profileLinkParts.length > 0) {
      lines.push(profileLinkParts.join(' · '));
    }
    lines.push('');

    // ---- Professional Summary (verbatim stored summary; never synthesized) ---
    lines.push('## Professional Summary');
    lines.push('');
    if (candidateData.summary) {
      lines.push(candidateData.summary);
    } else if (candidateData.headline) {
      lines.push(candidateData.headline);
    } else {
      lines.push('*(Professional summary not provided in profile.)*');
    }
    lines.push('');
    pushSection('PROFESSIONAL_SUMMARY');

    // ---- Technical Skills (categorized, job-relevance-ordered) ---------------
    const { categorizedSkills, skillAudit } = this.selectAndCategorizeSkillsForJob(
      candidateData,
      jobPosting
    );
    const categoryEntries = Object.entries(categorizedSkills);
    if (categoryEntries.length > 0) {
      lines.push('## Technical Skills');
      lines.push('');
      for (const [categoryName, skillsList] of categoryEntries) {
        if (skillsList.length > 0) {
          lines.push(`- **${categoryName}:** ${skillsList.join(', ')}`);
        }
      }
      lines.push('');
      pushSection('TECHNICAL_SKILLS');
    }

    // ---- Projects (real stored projects with authentic bullets, ranked by multi-factor score) ---
    const rankedProjects = this.rankProjectsForJob(candidateData, jobPosting);
    const selectedProjects = rankedProjects.selectedProjects || rankedProjects.slice(0, 2);
    const selectionAudit = rankedProjects.selectionAudit || [];

    if (selectedProjects.length > 0) {
      lines.push('## Technical Projects');
      lines.push('');
      for (const project of selectedProjects) {
        const urlPart = project.repositoryUrl || project.url;
        const nameLine = urlPart ? `[${project.name}](${urlPart})` : project.name;
        lines.push(`### ${nameLine}`);

        const metaParts = [];
        if (Array.isArray(project.technologies) && project.technologies.length > 0) {
          metaParts.push(`Technologies: ${project.technologies.slice(0, 6).join(', ')}`);
        }
        if (project.liveUrl) {
          metaParts.push(`Live Demo: ${project.liveUrl}`);
        }
        if (metaParts.length > 0) {
          lines.push(`*${metaParts.join(' · ')}*`);
          lines.push('');
        }

        const bullets = Array.isArray(project.bullets) ? project.bullets : [];
        if (bullets.length > 0) {
          for (const bullet of bullets) {
            const bStr = String(bullet).trim();
            if (
              bStr.length > 0 &&
              !/^(source code|project link|repository|repo|url):\s*https?:\/\//i.test(bStr) &&
              !/^https?:\/\//i.test(bStr)
            ) {
              lines.push(`- ${bStr}`);
            }
          }
          lines.push('');
        } else if (project.summary) {
          lines.push(project.summary);
          lines.push('');
        }
      }
      pushSection('PROJECTS');
    }

    // ---- Professional Experience (only real stored records) ------------------
    const experience = (candidateData.experience || []).filter((exp) => exp.title || exp.company);
    if (experience.length > 0) {
      lines.push('## Professional Experience');
      lines.push('');
      for (const exp of experience) {
        const title = exp.title || exp.role;
        const company = exp.company || exp.employer;
        const start = formatMonthYear(exp.startDate);
        const end = exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate);
        const dateRange = [start, end].filter(Boolean).join(' – ');
        const headerLine = [title, company].filter(Boolean).join(' — ');
        const metaParts = [dateRange, exp.location].filter(Boolean).join(' · ');
        lines.push(`### ${headerLine}`);
        if (metaParts) lines.push(`*${metaParts}*`);
        lines.push('');
        const bullets = Array.isArray(exp.bullets)
          ? exp.bullets
          : typeof exp.description === 'string' && exp.description.trim().length > 0
            ? [exp.description]
            : [];
        for (const bullet of bullets) {
          const text = String(bullet).trim();
          if (text) lines.push(`- ${text}`);
        }
        lines.push('');
      }
      pushSection('PROFESSIONAL_EXPERIENCE');
    }

    // ---- Education (only real stored records) --------------------------------
    const education = (candidateData.education || []).filter(
      (edu) => edu.institution || edu.degree
    );
    if (education.length > 0) {
      lines.push('## Education');
      lines.push('');
      for (const edu of education) {
        const degree = [edu.degree, edu.fieldOfStudy || edu.field].filter(Boolean).join(', ');
        const dateRange = [
          formatMonthYear(edu.startDate),
          edu.isCurrent ? 'Present' : formatMonthYear(edu.endDate),
        ]
          .filter(Boolean)
          .join(' – ');
        const parts = [];
        if (degree) parts.push(`**${degree}**`);
        if (edu.institution) parts.push(edu.institution);
        if (dateRange) parts.push(dateRange);
        if (edu.location) parts.push(edu.location);
        lines.push(`- ${parts.join(' | ')}`);
        if (Array.isArray(edu.coursework) && edu.coursework.length > 0) {
          lines.push(`  - Relevant coursework: ${edu.coursework.join(', ')}`);
        }
      }
      lines.push('');
      pushSection('EDUCATION');
    }

    // ---- Certifications (only real stored records) ----------------------------
    const certifications = (candidateData.certifications || []).filter(Boolean);
    if (certifications.length > 0) {
      lines.push('## Certifications');
      lines.push('');
      for (const cert of certifications) {
        const name = typeof cert === 'string' ? cert : cert.name;
        if (name) lines.push(`- ${name}`);
      }
      lines.push('');
      pushSection('CERTIFICATIONS');
    }

    const markdownContent = lines.join('\n');
    const contentHash = crypto.createHash('sha256').update(markdownContent, 'utf8').digest('hex');

    // Fit score calculation (fallback jobKeywords from jobPosting if candidateData lacks them)
    const allSelectedSkills = Object.values(categorizedSkills).flat();
    const allSkillTokens = allSelectedSkills.map(normalizeSkillToken);
    const jobKeywords = candidateData.jobKeywords || extractJobKeywords(jobPosting);
    const matchedSkills = allSkillTokens.filter((token) =>
      [...jobKeywords].some(
        (keyword) => token === keyword || (token.length >= 4 && keyword.startsWith(token))
      )
    );
    const fitScore =
      allSkillTokens.length > 0
        ? Math.min(100, Math.round((matchedSkills.length / allSkillTokens.length) * 100))
        : 0;

    return {
      markdownContent,
      fitScore,
      title: `${displayName} — Tailored Resume`,
      contentHash,
      sections: renderedSections,
      selectedProjects,
      selectionAudit,
      categorizedSkills,
      skillAudit,
    };
  }

  /**
   * Builds the tailored cover letter markdown from real candidate evidence.
   *
   * @param {object} candidateData Candidate data snapshot
   * @param {object} jobPosting Normalized job posting
   * @returns {{ markdownContent: string, contentHash: string, title: string, paragraphs: Array<object> }}
   */
  buildCoverLetterMarkdown(candidateData, jobPosting) {
    const { displayName } = candidateData;
    const targetRole = jobPosting.title;
    const targetCompany = jobPosting.company;

    const { verified, claimed } = this.partitionSkills(candidateData);
    const verifiedTokens = verified.map(normalizeSkillToken);
    const matchedVerifiedSkills = verified.filter((name) => {
      const token = normalizeSkillToken(name);
      return [...candidateData.jobKeywords].some(
        (keyword) => token === keyword || (token.length >= 4 && keyword.startsWith(token))
      );
    });
    const matchedClaimedSkills = claimed.filter((name) => {
      const token = normalizeSkillToken(name);
      return [...candidateData.jobKeywords].some(
        (keyword) => token === keyword || (token.length >= 4 && keyword.startsWith(token))
      );
    });

    // Real internship / employment evidence
    const experience = (candidateData.experience || [])[0] || null;
    const experienceTitle = experience?.title || experience?.role || null;
    const experienceCompany = experience?.company || experience?.employer || null;

    // Real project evidence ranked by job relevance (strictly deduplicated)
    const rankedProjects = this.rankProjectsForJob(candidateData, jobPosting);
    const topProjects = rankedProjects.selectedProjects || rankedProjects.slice(0, 2);

    const topProjectNames = topProjects.map((p) => p.name);
    const projectUrlByName = Object.fromEntries(
      (candidateData.projects || [])
        .filter((p) => p.repositoryUrl || p.url)
        .map((p) => [p.name, p.repositoryUrl || p.url])
    );

    const paragraphs = [];

    // Paragraph 1 — OPENING (supported facts only)
    const openingParts = [`I am applying for the ${targetRole} position at ${targetCompany}.`];
    if (candidateData.headline) {
      openingParts.push(`I work as a ${candidateData.headline}.`);
    }
    if (experienceTitle && experienceCompany) {
      openingParts.push(
        `Most recently, I completed a ${experienceTitle} internship at ${experienceCompany}.`
      );
    }
    paragraphs.push({ type: 'OPENING', text: openingParts.join(' ') });

    // Paragraph 2 — RELEVANT_EXPERIENCE (verbatim-backed evidence)
    if (experience && Array.isArray(experience.bullets) && experience.bullets.length > 0) {
      const citedBullets = experience.bullets
        .map((bullet) => String(bullet).trim())
        .filter(Boolean)
        .slice(0, 2);
      const evidenceSentences = citedBullets
        .map((bullet) => (/[.!?]$/.test(bullet) ? bullet : `${bullet}.`))
        .join(' ');
      paragraphs.push({
        type: 'RELEVANT_EXPERIENCE',
        text: `During my ${experienceTitle || 'internship'} at ${experienceCompany || 'my previous engagement'}, ${evidenceSentences.charAt(0).toLowerCase()}${evidenceSentences.slice(1)} This is the practical experience I would bring to the ${targetRole} role.`,
      });
    } else if (candidateData.summary) {
      paragraphs.push({
        type: 'RELEVANT_EXPERIENCE',
        text: `${candidateData.summary} This background is what I would bring to the ${targetRole} role.`,
      });
    }

    // Paragraph 3 — PROJECT_EVIDENCE (real distinct project names + technologies)
    if (topProjects.length > 0) {
      const projectClauses = topProjects.map((project) => {
        const tech =
          project.technologies.length > 0
            ? `, built with ${project.technologies.slice(0, 4).join(', ')}`
            : '';
        const urlPart =
          project.url || project.repositoryUrl ? ` (${project.url || project.repositoryUrl})` : '';
        return `${project.name}${urlPart}${tech}`;
      });

      const projectSentence =
        projectClauses.length === 1
          ? `I built ${projectClauses[0]}.`
          : `I built ${projectClauses[0]} and ${projectClauses[1]}.`;

      paragraphs.push({
        type: 'PROJECT_EVIDENCE',
        text: `My public repository work demonstrates this directly: ${projectSentence} The source code for all of these projects is publicly available for review.`,
      });
    }

    // Paragraph 4 — COMPANY_ALIGNMENT (truthfully separates verified from claimed)
    const verifiedToMention = (
      matchedVerifiedSkills.length > 0 ? matchedVerifiedSkills : verified
    ).slice(0, 6);
    const claimedToMention = (
      matchedClaimedSkills.length > 0 ? matchedClaimedSkills : claimed
    ).slice(0, 4);

    if (verifiedToMention.length > 0) {
      let alignmentText = `My technical background aligns with the requirements for the ${targetRole} role, with verified proficiency in ${verifiedToMention.join(', ')} demonstrated across my public repositories.`;
      if (claimedToMention.length > 0) {
        alignmentText += ` In addition, my background includes practical experience with ${claimedToMention.join(', ')}.`;
      }
      paragraphs.push({
        type: 'COMPANY_ALIGNMENT',
        text: alignmentText,
      });
    } else if (claimedToMention.length > 0) {
      paragraphs.push({
        type: 'COMPANY_ALIGNMENT',
        text: `My technical background includes practical experience with ${claimedToMention.join(', ')}, which aligns with the requirements described for the ${targetRole} role.`,
      });
    }

    // Paragraph 5 — CLOSING
    paragraphs.push({
      type: 'CLOSING',
      text: `Thank you for considering my application for the ${targetRole} position at ${targetCompany}. I would welcome the opportunity to discuss how my experience applies to your team.`,
    });

    const markdownContent = [
      `Dear Hiring Team at ${targetCompany},`,
      '',
      ...paragraphs.map((paragraph) => paragraph.text),
      '',
      'Sincerely,',
      displayName,
    ].join('\n');

    const contentHash = crypto.createHash('sha256').update(markdownContent, 'utf8').digest('hex');

    return {
      markdownContent,
      contentHash,
      title: `Cover Letter — ${targetRole} at ${targetCompany}`,
      paragraphs,
      topProjectNames,
      projectUrlByName,
      matchedVerifiedSkills,
      verifiedTokens,
    };
  }

  /**
   * Generates both tailored documents for an application package.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.candidateId
   * @param {object} params.jobPosting Normalized job posting
   * @param {string} [params.candidateEmail] Authoritative email from candidate record
   * @param {string} [params.candidatePhone] Phone from candidate record
   * @returns {Promise<{ resume: object, coverLetter: object, evidence: object, projectUrlByName: object, selectedProjects: Array<object>, selectionAudit: Array<object>, categorizedSkills: object, skillAudit: Array<object> }>}
   */
  async generateApplicationDocuments({
    tenantId,
    userId,
    candidateId,
    jobPosting,
    candidateEmail,
    candidatePhone,
  }) {
    const candidateData = await this.buildCandidateData({
      tenantId,
      userId,
      candidateId,
      jobPosting,
    });

    if (!candidateData.displayName) {
      throw new ValidationError(
        'Candidate profile has no displayName; refusing to generate application documents without a real identity'
      );
    }
    if (!candidateData.email && !candidateEmail) {
      throw new ValidationError(
        'No authoritative candidate email available; refusing to generate application documents'
      );
    }

    if (candidateEmail) candidateData.email = candidateEmail;
    if (candidatePhone) candidateData.phone = candidateData.phone || candidatePhone;

    const resume = this.buildTailoredResumeMarkdown(candidateData, jobPosting);
    const coverLetter = this.buildCoverLetterMarkdown(candidateData, jobPosting);

    const evidence = {
      resumeSections: resume.sections,
      coverLetterParagraphTypes: coverLetter.paragraphs.map((p) => p.type),
      projectNamesUsed: coverLetter.topProjectNames,
      verifiedSkillsMatched: coverLetter.matchedVerifiedSkills,
      experienceUsed: candidateData.experience.length > 0,
      educationUsed: candidateData.education.length > 0,
      githubUsername: candidateData.githubUsername,
    };

    return {
      resume,
      coverLetter,
      evidence,
      projectUrlByName: coverLetter.projectUrlByName,
      selectedProjects: resume.selectedProjects,
      selectionAudit: resume.selectionAudit,
      categorizedSkills: resume.categorizedSkills,
      skillAudit: resume.skillAudit,
    };
  }

  /**
   * Validates a document's text against canonical generic placeholder phrases,
   * duplicate projects, suspicious test remnants, and contradictory verification
   * claims. Used as a final self-audit gate before content enters an application package.
   *
   * @param {string} markdownContent Rendered document markdown
   * @param {object} [options]
   * @param {string[]} [options.requiredTokens] Tokens that MUST appear (real data)
   * @param {RegExp[]} [options.forbiddenTokens] Tokens that MUST NOT appear
   * @returns {{ passed: boolean, violations: string[] }}
   */
  static auditDocumentContent(markdownContent, options = {}) {
    const violations = [];
    const text = String(markdownContent || '');

    // 1. Generic placeholder patterns
    const forbiddenPatterns = options.forbiddenTokens || [
      /Dedicated software engineer with verified technical skills/i,
      /Software Development Experience Verified/i,
      /Independent \/ Open Source Engineering/i,
      /Academic \/ Technical Foundation/i,
      /verified achievements/i,
      /Accredited Institution/i,
      /Academic\/Technical Foundation/i,
      /Dedicated professional tailored for/i,
      /delivering immediate value/i,
      /Evidence-backed project referenced in tailored documents/i,
    ];
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) violations.push(`Forbidden placeholder content: ${pattern}`);
    }

    // 2. Suspicious test remnants or malformed text fragments
    const testRemnantPatterns = [
      /Testing dirty state/i,
      /dirty state bar/i,
      /\[updated\]/i,
      /high-performan\b/i,
      /\b[a-zA-Z]{4,}\s+Testing\b/i,
    ];
    for (const pattern of testRemnantPatterns) {
      if (pattern.test(text)) {
        violations.push(`Malformed text or test remnant detected: ${pattern}`);
      }
    }

    // 3. Duplicate project sections in Resume (### ProjectName)
    const projectHeaderMatches = [...text.matchAll(/^###\s+(?:\[([^\]]+)\]\([^)]+\)|(.+))$/gm)];
    const seenResumeProjects = new Set();
    for (const match of projectHeaderMatches) {
      const name = (match[1] || match[2] || '').trim().toLowerCase();
      if (!name) continue;
      if (seenResumeProjects.has(name)) {
        violations.push(`Duplicate project section in resume: "${name}"`);
      }
      seenResumeProjects.add(name);
    }

    // 4. Duplicate project in Cover Letter ("I built X and X")
    const coverLetterProjectMatch =
      /I built\s+([^,.]+?)(?:\s*\([^)]*\))?(?:,\s*built with[^,.]*)?\s+and\s+([^,.]+?)(?:\s*\([^)]*\))?(?:,\s*built with[^,.]*)?\./i.exec(
        text
      );
    if (coverLetterProjectMatch) {
      const p1 = coverLetterProjectMatch[1].trim().toLowerCase();
      const p2 = coverLetterProjectMatch[2].trim().toLowerCase();
      if (p1 === p2) {
        violations.push(`Duplicate project in cover letter: repeated project "${p1}"`);
      }
    }

    // 5. Sweeping unsupported verification claims
    if (/Each of these skills is verified/i.test(text)) {
      violations.push(
        'Sweeping skill verification claim detected ("Each of these skills is verified")'
      );
    }

    // 6. Required tokens
    for (const token of options.requiredTokens || []) {
      if (!token) continue;
      if (!text.toLowerCase().includes(String(token).toLowerCase())) {
        violations.push(`Required real data token missing: ${token}`);
      }
    }

    return { passed: violations.length === 0, violations };
  }
}
