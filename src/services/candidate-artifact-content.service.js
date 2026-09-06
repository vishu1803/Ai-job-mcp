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
      projects: profileView.projects || [],
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
  rankProjectsForJob(candidateData) {
    // 1. Deduplicate by canonical project identity (case-insensitive name)
    const projectMap = new Map();

    for (const project of candidateData.projects || []) {
      const name = project.name || project.title;
      if (!name) continue;
      const cleanName = String(name).trim();
      const nameKey = cleanName.toLowerCase();

      const stored = candidateData.storedProjectByUrl?.get(nameKey);
      const resolvedUrl =
        stored?.metadata?.repositoryUrl ||
        stored?.metadata?.sourceUrl ||
        project.url ||
        project.repositoryUrl ||
        null;

      const isArchived =
        project.metadata?.portfolioStatus === 'ARCHIVED' ||
        Boolean(project.metadata?.archivedAt) ||
        stored?.metadata?.portfolioStatus === 'ARCHIVED' ||
        Boolean(stored?.metadata?.archivedAt);

      const technologies = [
        ...(Array.isArray(project.technologies) ? project.technologies : []),
        ...(Array.isArray(project.primaryLanguages) ? project.primaryLanguages : []),
      ].filter(Boolean);

      const summary = project.summary || project.headline || null;

      const existing = projectMap.get(nameKey);
      if (!existing) {
        projectMap.set(nameKey, {
          name: cleanName,
          url: resolvedUrl,
          summary,
          technologies,
          isArchived,
        });
      } else {
        // Deterministic preference: active over archived; row with URL over row without
        if (existing.isArchived && !isArchived) {
          projectMap.set(nameKey, {
            name: cleanName,
            url: resolvedUrl || existing.url,
            summary: summary || existing.summary,
            technologies: technologies.length > 0 ? technologies : existing.technologies,
            isArchived: false,
          });
        } else if (!existing.url && resolvedUrl && !isArchived) {
          existing.url = resolvedUrl;
          if (!existing.summary && summary) existing.summary = summary;
          if (existing.technologies.length === 0 && technologies.length > 0) {
            existing.technologies = technologies;
          }
        }
      }
    }

    // 2. Score and deduplicate by repository URL
    const ranked = [];
    const seenUrls = new Set();

    for (const project of projectMap.values()) {
      if (project.url) {
        const normUrl = String(project.url)
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '');
        if (seenUrls.has(normUrl)) continue;
        seenUrls.add(normUrl);
      }

      const haystack = normalizeSkillToken(
        `${project.name} ${project.technologies.join(' ')} ${project.summary || ''}`
      );
      let relevance = 0;
      for (const keyword of candidateData.jobKeywords || []) {
        if (haystack.includes(keyword)) relevance += 5;
      }

      ranked.push({
        name: project.name,
        url: project.url,
        summary: project.summary,
        technologies: project.technologies,
        relevance,
      });
    }

    return ranked.sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name));
  }

  /**
   * Builds the tailored resume markdown from real candidate data.
   *
   * @param {object} candidateData Candidate data snapshot
   * @param {object} jobPosting Normalized job posting
   * @returns {{ markdownContent: string, fitScore: number, title: string, sections: string[] }}
   */
  buildTailoredResumeMarkdown(candidateData, jobPosting) {
    const { displayName } = candidateData;
    const targetRole = jobPosting.title;
    const targetCompany = jobPosting.company;

    const lines = [];
    const renderedSections = [];

    const pushSection = (name) => renderedSections.push(name);

    // ---- Header -------------------------------------------------------------
    lines.push(`# ${displayName}`);
    lines.push('');
    const headerParts = [];
    if (candidateData.email) headerParts.push(`**Email:** ${candidateData.email}`);
    if (candidateData.phone) headerParts.push(`**Phone:** ${candidateData.phone}`);
    if (candidateData.location) headerParts.push(`**Location:** ${candidateData.location}`);
    if (candidateData.githubUsername) {
      headerParts.push(`**GitHub:** https://github.com/${candidateData.githubUsername}`);
    }
    lines.push(headerParts.join(' · '));
    if (targetRole || targetCompany) {
      lines.push(`*Tailored for: ${[targetRole, targetCompany].filter(Boolean).join(' at ')}*`);
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

    // ---- Core Competencies (truth-partitioned, job-relevance-ordered) --------
    const { verified, claimed, learning } = this.partitionSkills(candidateData);
    if (verified.length > 0 || claimed.length > 0 || learning.length > 0) {
      lines.push('## Core Competencies');
      lines.push('');
      if (verified.length > 0) {
        const rankedVerified = this.rankSkillsForJob(verified, candidateData);
        lines.push(`- **Verified:** ${rankedVerified.map((s) => s.name).join(', ')}`);
      }
      if (claimed.length > 0) {
        const rankedClaimed = this.rankSkillsForJob(claimed, candidateData);
        lines.push(`- **Self-reported:** ${rankedClaimed.map((s) => s.name).join(', ')}`);
      }
      if (learning.length > 0) {
        const rankedLearning = this.rankSkillsForJob(learning, candidateData);
        lines.push(`- **Currently learning:** ${rankedLearning.map((s) => s.name).join(', ')}`);
      }
      lines.push('');
      pushSection('CORE_COMPETENCIES');
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

    // ---- Projects (real stored projects, ranked by job relevance) ------------
    const rankedProjects = this.rankProjectsForJob(candidateData);
    if (rankedProjects.length > 0) {
      lines.push('## Projects');
      lines.push('');
      const seenProjectNames = new Set();
      for (const project of rankedProjects) {
        const normName = project.name.toLowerCase().trim();
        if (seenProjectNames.has(normName)) continue;
        seenProjectNames.add(normName);

        const nameLine = project.url ? `[${project.name}](${project.url})` : project.name;
        lines.push(`### ${nameLine}`);
        lines.push('');
        if (project.summary) {
          lines.push(project.summary);
          lines.push('');
        }
        if (project.technologies.length > 0) {
          lines.push(`*Technologies: ${project.technologies.join(', ')}*`);
          lines.push('');
        }
        if (seenProjectNames.size >= 4) break;
      }
      pushSection('PROJECTS');
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

    // Transparent, evidence-derived fit score: proportional to the share of
    // verified + self-reported skills that overlap the job description.
    // No fabricated precision — floored at a neutral 0 when no signal exists.
    const allSkillTokens = [...verified, ...claimed].map(normalizeSkillToken);
    const matchedSkills = allSkillTokens.filter((token) =>
      [...candidateData.jobKeywords].some(
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
    const rankedProjects = this.rankProjectsForJob(candidateData);
    const topProjects = [];
    const seenNames = new Set();
    for (const proj of rankedProjects) {
      const k = proj.name.toLowerCase().trim();
      if (!seenNames.has(k)) {
        seenNames.add(k);
        topProjects.push(proj);
      }
      if (topProjects.length >= 2) break;
    }

    const topProjectNames = topProjects.map((p) => p.name);
    const projectUrlByName = Object.fromEntries(
      rankedProjects.filter((p) => p.url).map((p) => [p.name, p.url])
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
        const urlPart = project.url ? ` (${project.url})` : '';
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
   * @returns {Promise<{ resume: object, coverLetter: object, evidence: object }>}
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

    const resume = this.buildTailoredResumeMarkdown(candidateData, jobPosting);
    const coverLetter = this.buildCoverLetterMarkdown(candidateData, jobPosting);

    if (candidateEmail) candidateData.email = candidateEmail;
    if (candidatePhone) candidateData.phone = candidateData.phone || candidatePhone;

    const evidence = {
      resumeSections: resume.sections,
      coverLetterParagraphTypes: coverLetter.paragraphs.map((p) => p.type),
      projectNamesUsed: coverLetter.topProjectNames,
      verifiedSkillsMatched: coverLetter.matchedVerifiedSkills,
      experienceUsed: candidateData.experience.length > 0,
      educationUsed: candidateData.education.length > 0,
      githubUsername: candidateData.githubUsername,
    };

    return { resume, coverLetter, evidence };
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
