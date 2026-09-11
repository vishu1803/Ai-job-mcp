/**
 * @file ATS-Oriented LaTeX Document Generator Service
 *
 * Transforms canonical applicationPackage and verified candidate profile data into
 * clean, single-column, recruiter-readable LaTeX (.tex) source documents for:
 * 1. ATS Tailored Resume (single column, selectable text, truth-partitioned skills)
 * 2. Tailored Cover Letter (formal typographic letterhead and alignment)
 *
 * Invariants Enforced:
 * - Radical Truth Provenance: Strictly separates VERIFIED, CORROBORATED, CLAIMED,
 *   USER_PROVIDED, and LEARNING skills. Never promotes uncorroborated skills.
 * - Zero Synthetic/Fabricated Data: Strictly uses authentic stored candidate data.
 *   Never introduces synthetic emails (reserved documentation domains) or fake phone numbers.
 * - Zero Placeholder Sections: Sections without real stored records are OMITTED.
 *   The historical placeholder blocks ("Software Development Experience Verified",
 *   "Independent / Open Source Engineering", "Academic / Technical Foundation
 *   Completed") are removed — the generator now refuses to fabricate content.
 * - Fail-Closed Identity: A real candidate name and authoritative email are
 *   mandatory; missing identity aborts generation instead of rendering "Candidate".
 * - Defensive LaTeX escaping across all dynamic fields to guarantee safe compilation.
 */

import { ValidationError } from '../errors/index.js';
import {
  curateProfessionalSummary,
  curateCandidateHeadline,
  isRealUrl,
  displayUrlForLink,
  cleanResumeFacingTechnologies,
  formatProjectDisplayName,
  groundAndSanitizeProject,
} from './candidate-artifact-content.service.js';
import { ResumeLayoutEngine } from './resume-layout-engine.service.js';
import { LegacyLatexGenerator } from './legacy-latex-generator.service.js';
import { isMeaningfulDsa } from './resume-content-strategy.service.js';

/**
 * Escapes reserved LaTeX characters in dynamic user strings and safely
 * normalizes smart quotes, Unicode dashes, and problematic characters.
 *
 * @param {string} text Raw string
 * @returns {string} LaTeX-escaped string
 */
export function escapeLatex(text) {
  if (text == null) return '';
  let str = String(text);

  // 1. Safely normalize smart quotes, dashes, and unicode symbols before character escaping
  str = str
    .replace(/[\u201C\u201D]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019]/g, "'") // smart single quotes
    .replace(/\u2013/g, '--') // en-dash
    .replace(/\u2014/g, '---') // em-dash
    .replace(/\u2026/g, '...') // horizontal ellipsis
    .replace(/\u00A0/g, ' ') // non-breaking space
    .replace(/\u2022/g, ' '); // bullet symbol

  // 2. Escape reserved LaTeX characters
  const map = {
    '\\': '\\textbackslash{}',
    '{': '\\{',
    '}': '\\}',
    $: '\\$',
    '&': '\\&',
    '#': '\\#',
    '%': '\\%',
    _: '\\_',
    '~': '\\textasciitilde{}',
    '^': '\\textasciicircum{}',
    '<': '$<$',
    '>': '$>$',
  };

  return str.replace(/[\\{}$&#%_~^<>]/g, (ch) => map[ch] || ch);
}

/**
 * Escapes and sanitizes URLs specifically for LaTeX \\href{url}{label} targets.
 * Unlike ordinary text, URLs must preserve standard query syntax (%, #, _, &, ?, =, :, /)
 * while neutralizing delimiter breakout attempts (braces, quotes, backslashes, whitespace).
 *
 * @param {string} url Raw URL string
 * @returns {string} Sanitized LaTeX URL target
 */
export function escapeLatexUrl(url) {
  if (url == null) return '';
  let str = String(url).trim();

  // Strip control chars and line breaks
  str = str.replace(/[\r\n\t]/g, '');

  // Neutralize delimiter breakout and command injection
  str = str
    .replace(/\\/g, '%5C')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/ /g, '%20');

  return str;
}

/**
 * Normalizes multiline markdown bullet content into clean LaTeX itemize entries.
 *
 * @param {string | Array<string>} bullets Raw markdown or array of bullet strings
 * @returns {string} LaTeX \item blocks
 */
function formatLatexBullets(bullets) {
  if (!bullets) return '';
  let lines = [];
  if (Array.isArray(bullets)) {
    lines = bullets;
  } else if (typeof bullets === 'string') {
    lines = bullets
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^[-*•]\s*/, ''));
  }

  // Filter out empty lines and raw URL / link indicator lines
  const cleanLines = lines
    .map((l) => String(l).trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !/^(source code|project link|repository|repo|url):\s*https?:\/\//i.test(l) &&
        !/^https?:\/\//i.test(l)
    );

  if (cleanLines.length === 0) return '';
  return (
    '\\begin{itemize}\n\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}\n' +
    cleanLines.map((l) => `  \\item ${escapeLatex(l)}`).join('\n') +
    '\n\\end{itemize}'
  );
}

export class LatexDocumentGenerator {
  constructor(legacyGenerator = new LegacyLatexGenerator()) {
    this.legacyGenerator = legacyGenerator;
  }

  /**
   * Static content audit: verifies generated LaTeX contains required real-data
   * tokens and none of the historical generic placeholder phrases.
   *
   * @param {string} texContent Generated LaTeX source
   * @param {object} [options]
   * @param {string[]} [options.requiredTokens] Real-data tokens that MUST appear
   * @param {RegExp[]} [options.forbiddenPatterns] Additional forbidden patterns
   * @returns {{ passed: boolean, violations: string[] }}
   */
  static auditLatexContent(texContent, options = {}) {
    const violations = [];
    const text = String(texContent || '');

    const forbidden = options.forbiddenPatterns || [
      /Software Development Experience Verified/i,
      /Independent \/ Open Source Engineering/i,
      /Academic \/ Technical Foundation/i,
      /Accredited Institution/i,
      /Dedicated software engineer with verified technical skills/i,
      /verified achievements/i,
      /Dedicated professional tailored for/i,
      /delivering immediate value/i,
      /Testing dirty state/i,
      /dirty state bar/i,
      /\[updated\]/i,
      /high-performan\b/i,
      /Each of these skills is verified/i,
      /Evidence-backed project referenced in tailored documents/i,
      /Tailored for:/i,
    ];
    for (const pattern of forbidden) {
      if (pattern.test(text))
        violations.push(`Forbidden placeholder content or test remnant: ${pattern}`);
    }

    for (const token of options.requiredTokens || []) {
      if (!token) continue;
      if (!text.includes(String(token))) {
        violations.push(`Required real-data token missing from document: ${token}`);
      }
    }

    return { passed: violations.length === 0, violations };
  }

  /**
   * Generates ATS-oriented single-column LaTeX source for a tailored resume.
   *
   * @param {object} params
   * @param {object} params.applicationPackage Canonical ApplicationPackage
   * @param {object} [params.candidateProfile] Optional verified Candidate Career Profile
   * @param {object} [params.layoutOverrides] Optional layout overrides for calibration
   * @returns {{ texContent: string, candidateName: string, candidateEmail: string, targetRole: string, targetCompany: string }}
   */
  generateTailoredResumeLatex({ applicationPackage, candidateProfile = null, layoutOverrides = {} }) {
    if (!applicationPackage) {
      throw new ValidationError('applicationPackage is required to generate resume LaTeX');
    }

    const structuredResume =
      applicationPackage.tailoredResume?.structuredResume ||
      applicationPackage.structuredResume ||
      null;

    // Compute adaptive layout profile from semantic document model (P14-026)
    const layoutEngine = new ResumeLayoutEngine();
    const { layoutProfile } = layoutEngine.computeLayout({
      applicationPackage,
      candidateProfile: structuredResume ? null : candidateProfile,
      overrides: layoutOverrides,
    });

    if (structuredResume) {
      return this._generateFromStructuredResume({
        applicationPackage,
        structuredResume,
        layoutProfile,
      });
    }

    // -------------------------------------------------------------------------
    // EXPLICIT LEGACY FALLBACK PATH (for historical packages without structuredResume)
    // -------------------------------------------------------------------------
    return this.legacyGenerator.generateFromLegacyPackage({
      applicationPackage,
      candidateProfile,
      layoutProfile,
    });
  }

  /**
   * Generates resume LaTeX strictly and exclusively from a validated StructuredResumeDocument snapshot.
   * Does NOT query live candidateProfile, does NOT invoke Markdown regex parsers, and does NOT re-rank.
   *
   * @private
   */
  _generateFromStructuredResume({ applicationPackage, structuredResume, layoutProfile }) {
    const targetJob = applicationPackage.targetJob || {};
    const targetRole =
      structuredResume.candidateIdentity?.headline ||
      structuredResume.targetRole ||
      applicationPackage.tailoringPlan?.targetRoleTitle ||
      targetJob.title ||
      'Software Engineer';
    const targetCompany = targetJob.company || 'Target Organization';

    // 1. Authoritative Candidate Identity & Contact from structured snapshot
    const identity = structuredResume.candidateIdentity || {};
    const candidateName =
      identity.displayName || identity.fullName || applicationPackage.candidateName || null;
    const candidateEmail =
      identity.email || applicationPackage.candidateEmail || null;

    if (!candidateName) {
      throw new ValidationError(
        'Real candidate name is required in structured resume; refusing to render placeholder identity'
      );
    }
    if (!candidateEmail) {
      throw new ValidationError(
        'Authoritative candidate email is required in structured resume; refusing to render placeholder contact'
      );
    }
    if (/example\.com/i.test(candidateEmail)) {
      throw new ValidationError(
        `Authoritative candidate email required; detected synthetic email '${candidateEmail}'`
      );
    }

    const candidatePhone = identity.phone || '';
    const candidateLocation = identity.location || '';
    const candidateHeadline = identity.headline || targetRole || '';

    // Contact line
    const contactElements = [];
    if (candidatePhone) contactElements.push(escapeLatex(candidatePhone));
    if (candidateLocation) contactElements.push(escapeLatex(candidateLocation));
    if (candidateEmail) {
      contactElements.push(
        `\\href{mailto:${escapeLatexUrl(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
      );
    }
    const contactLine = contactElements.join(' \\textbullet{} ');

    // Profile links directly from snapshot (zero hardcoded fallbacks)
    const profileLinkElements = [];
    const links = Array.isArray(identity.links) ? identity.links : [];
    for (const link of links) {
      if (link && link.url && isRealUrl(link.url)) {
        const label = link.label || link.platform || 'Link';
        profileLinkElements.push(`\\href{${escapeLatexUrl(link.url)}}{${escapeLatex(label)}}`);
      }
    }
    const profileLinksLine = profileLinkElements.join(' \\textbullet{} ');

    // 2. Summary
    const summaryText = structuredResume.summary?.text || '';
    const summaryLatexSection = `\\atssection{Professional Summary}\n${summaryText ? escapeLatex(summaryText) : '\\textit{(Professional summary not provided in profile.)}'}\\par`;

    // 3. Technical Skills: render categories in exact stored order
    const skillCategories = Array.isArray(structuredResume.skills?.categories)
      ? structuredResume.skills.categories
      : [];
    const formattedSkillLines = [];
    for (const cat of skillCategories) {
      const catName = cat.categoryName || cat.name || cat.category || '';
      const skillItems = Array.isArray(cat.skills) ? cat.skills : [];
      const skillNames = skillItems
        .map((s) => (typeof s === 'string' ? s : s.displayName || s.name || s.slug || ''))
        .filter(Boolean);
      if (skillNames.length > 0) {
        formattedSkillLines.push(
          `\\textbf{${escapeLatex(catName)}:} ${escapeLatex(skillNames.join(', '))}`
        );
      }
    }
    const skillsLatexSection = formattedSkillLines.length > 0
      ? `\\atssection{Technical Skills}\n${formattedSkillLines.join('\\\\\n')}\\par`
      : '';

    // 4. Projects: exact stored ranking and authentic bullets
    const projects = Array.isArray(structuredResume.projects) ? structuredResume.projects : [];
    const maxBulletsPerProject = layoutProfile.maxBulletsPerProject || 3;
    let projectsLatexSection = '';
    if (projects.length > 0) {
      const projectEntries = projects.map((p, index) => {
        const pName = escapeLatex(p.displayName || p.name || 'Project');
        const repoUrl = p.repositoryUrl || null;
        const liveUrl = p.liveUrl || null;

        const rawTechs = Array.isArray(p.technologies) ? p.technologies : [];
        const cleanTechs = cleanResumeFacingTechnologies(rawTechs);
        const techs = cleanTechs.map((t) => escapeLatex(t)).join(', ');

        const linkParts = [];
        // ATS link parity: link text MUST be the real URL (visible, extractable)
        // rather than a bare "GitHub" label so URL identity survives PDF text
        // extraction. Clickable target preserved via \href.
        if (repoUrl && isRealUrl(repoUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(repoUrl)}}{\\small\\textbf{${escapeLatex(displayUrlForLink(repoUrl))}}}`);
        }
        if (liveUrl && isRealUrl(liveUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(liveUrl)}}{\\small\\textbf{${escapeLatex(displayUrlForLink(liveUrl))}}}`);
        }
        const linksStr = linkParts.join(' \\textbullet{} ');

        let headerLine = `\\textbf{${pName}}`;
        if (linksStr) headerLine += ` \\hfill ${linksStr}`;
        const techLine = techs ? `{\\small\\textit{${techs}}}` : '';

        const rawBullets = Array.isArray(p.bullets) ? p.bullets : [];
        const cleanBullets = rawBullets
          .map((b) => (typeof b === 'string' ? b : b?.text || ''))
          .map((b) => String(b).trim())
          .filter(Boolean)
          .slice(0, maxBulletsPerProject);

        const pBullets = formatLatexBullets(cleanBullets);

        const entryLines = [`${headerLine}\\par`];
        if (techLine) {
          entryLines.push('\\vspace{\\atsProjectTitleToTech}');
          entryLines.push(`${techLine}\\par`);
        }
        entryLines.push('\\vspace{\\atsProjectTechToBullets}');
        if (pBullets) entryLines.push(pBullets);

        if (index < projects.length - 1) {
          entryLines.push('\\vspace{\\atsEntryToEntry}');
        }
        return entryLines.join('\n');
      });
      projectsLatexSection = `\\atssection{Technical Projects}\n${projectEntries.join('\n')}`;
    }

    // 5. DSA — included ONLY when meaningful candidate-owned evidence exists (Req G & 14).
    let dsaLatexSection = '';
    const dsa = structuredResume.dsa;
    if (dsa && isMeaningfulDsa(dsa)) {
      const dsaBullets = Array.isArray(dsa.bullets)
        ? dsa.bullets.map((b) => String(b || '').trim()).filter(Boolean)
        : [];
      const dsaUrl = dsa.profileUrl && isRealUrl(dsa.profileUrl) ? dsa.profileUrl : null;
      const dsaTitle = dsa.title || 'Problem Solving & Algorithmic Practice';
      const dsaSubtitle = typeof dsa.subtitle === 'string' ? dsa.subtitle.trim() : '';

      const cleanLeetcodeDisplay = dsaUrl ? dsaUrl.replace(/^https?:\/\/(www\.)?/, '') : '';
      const headerRight = dsaUrl
        ? `\\href{${escapeLatexUrl(dsaUrl)}}{\\small\\textbf{${escapeLatex(cleanLeetcodeDisplay)}}}`
        : '';

      const bulletTex = formatLatexBullets(dsaBullets);

      dsaLatexSection = `\\atssection{Problem Solving \\& Algorithmic Practice}
\\textbf{${escapeLatex(dsaTitle)}}${headerRight ? ` \\hfill ${headerRight}` : ''}\\par
\\vspace{\\atsRoleToMetadata}
${dsaSubtitle ? `{\\small\\textit{${escapeLatex(dsaSubtitle)}}}\\par
\\vspace{\\atsMetadataToBullets}
` : ''}${bulletTex}`;
    }

    // 6. Professional Experience: candidate-owned snapshot records
    const experienceRecords = Array.isArray(structuredResume.experience)
      ? structuredResume.experience
      : [];
    let experienceLatexSection = '';
    if (experienceRecords.length > 0) {
      const expEntries = experienceRecords.map((exp, index) => {
        const title = escapeLatex(exp.title || exp.role || 'Role');
        const company = exp.company ? escapeLatex(exp.company) : '';
        const endDate = exp.isCurrent ? 'Present' : exp.endDate || '';
        const dates = [exp.startDate || '', endDate].filter(Boolean).join(' -- ');
        const location = exp.location ? escapeLatex(exp.location) : '';
        const rawBullets = Array.isArray(exp.bullets) ? exp.bullets : [];
        const bullets = formatLatexBullets(
          rawBullets.map((b) => (typeof b === 'string' ? b : b?.text || ''))
        );

        let headerLine = `\\textbf{${title}${company ? ` — ${company}` : ''}}`;
        if (dates) headerLine += ` \\hfill ${escapeLatex(dates)}`;

        const entryLines = [`${headerLine}\\par`];
        if (location) {
          entryLines.push('\\vspace{\\atsRoleToMetadata}');
          entryLines.push(`{\\small\\textit{${location}}}\\par`);
        }
        entryLines.push('\\vspace{\\atsMetadataToBullets}');
        if (bullets) entryLines.push(bullets);

        if (index < experienceRecords.length - 1) {
          entryLines.push('\\vspace{\\atsEntryToEntry}');
        }
        return entryLines.join('\n');
      });
      experienceLatexSection = `\\atssection{Professional Experience}\n${expEntries.join('\n')}`;
    }

    // 7. Education: candidate-owned snapshot records
    const educationRecords = Array.isArray(structuredResume.education)
      ? structuredResume.education
      : [];
    let educationLatexSection = '';
    if (educationRecords.length > 0) {
      const eduEntries = educationRecords.map((edu, index) => {
        const rawDegree = (edu.degree || '').trim();
        const rawField = (edu.fieldOfStudy || edu.field || '').trim();
        const degree = escapeLatex(rawDegree);
        const fieldAlreadyInDegree =
          rawField && rawDegree.toLowerCase().includes(rawField.toLowerCase());
        const field = rawField && !fieldAlreadyInDegree ? ` in ${escapeLatex(rawField)}` : '';
        const institution = edu.institution ? escapeLatex(edu.institution) : '';
        const endDate = edu.isCurrent ? 'Present' : edu.endDate || '';
        const dates = [edu.startDate || '', endDate].filter(Boolean).join(' -- ');
        const coursework =
          Array.isArray(edu.coursework) && edu.coursework.length > 0
            ? `\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.join(', '))}}`
            : '';

        let headerLine = `\\textbf{${degree}${field}}`;
        if (dates) headerLine += ` \\hfill ${escapeLatex(dates)}`;

        const entryLines = [`${headerLine}\\par`];
        if (institution) {
          entryLines.push('\\vspace{\\atsRoleToMetadata}');
          entryLines.push(`{\\small\\textit{${institution}}}\\par`);
        }
        if (coursework) {
          entryLines.push('\\vspace{\\atsRoleToMetadata}');
          entryLines.push(`{\\small ${coursework}}\\par`);
        }

        if (index < educationRecords.length - 1) {
          entryLines.push('\\vspace{\\atsEntryToEntry}');
        }
        return entryLines.join('\n');
      });
      educationLatexSection = `\\atssection{Education}\n${eduEntries.join('\n')}`;
    }

    // 8. Certifications: candidate-owned snapshot records
    const certRecords = Array.isArray(structuredResume.certifications)
      ? structuredResume.certifications
      : [];
    let certLatexSection = '';
    if (certRecords.length > 0) {
      const certNames = certRecords
        .map((c) => (typeof c === 'string' ? c : c.name || c.title || ''))
        .filter(Boolean);
      if (certNames.length > 0) {
        certLatexSection = `\\atssection{Certifications}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${certNames.map((c) => `  \\item ${escapeLatex(c)}`).join('\n')}
\\end{itemize}`;
      }
    }

    // 9. Other optional sections
    const optional = structuredResume.optionalSections || {};
    let courseworkLatexSection = '';
    if (Array.isArray(optional.coursework) && optional.coursework.length > 0) {
      courseworkLatexSection = `\\atssection{Relevant Coursework}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${optional.coursework.map((c) => `  \\item ${escapeLatex(typeof c === 'string' ? c : c.name || c.title)}`).join('\n')}
\\end{itemize}`;
    }

    let publicationsLatexSection = '';
    if (Array.isArray(optional.publications) && optional.publications.length > 0) {
      publicationsLatexSection = `\\atssection{Publications}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${optional.publications.map((p) => `  \\item ${escapeLatex(typeof p === 'string' ? p : p.title || p.name)}`).join('\n')}
\\end{itemize}`;
    }

    let achievementsLatexSection = '';
    if (Array.isArray(optional.achievements) && optional.achievements.length > 0) {
      achievementsLatexSection = `\\atssection{Achievements}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${optional.achievements.map((a) => `  \\item ${escapeLatex(typeof a === 'string' ? a : a.title || a.name)}`).join('\n')}
\\end{itemize}`;
    }

    let additionalSkillsLatexSection = '';
    if (Array.isArray(optional.additionalSkills) && optional.additionalSkills.length > 0) {
      additionalSkillsLatexSection = `\\atssection{Additional Skills}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${optional.additionalSkills.map((s) => `  \\item ${escapeLatex(typeof s === 'string' ? s : s.name || s.skill)}`).join('\n')}
\\end{itemize}`;
    }

    let awardsLatexSection = '';
    if (Array.isArray(optional.awards) && optional.awards.length > 0) {
      awardsLatexSection = `\\atssection{Awards}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${optional.awards.map((a) => `  \\item ${escapeLatex(typeof a === 'string' ? a : a.title || a.name)}`).join('\n')}
\\end{itemize}`;
    }

    // 10. Map sections to keys
    const sectionBlocks = {
      SUMMARY: summaryLatexSection,
      SKILLS: skillsLatexSection,
      TECHNICAL_SKILLS: skillsLatexSection,
      PROJECTS: projectsLatexSection,
      TECHNICAL_PROJECTS: projectsLatexSection,
      DSA: dsaLatexSection,
      PROBLEM_SOLVING: dsaLatexSection,
      ALGORITHMIC_PRACTICE: dsaLatexSection,
      EXPERIENCE: experienceLatexSection,
      PROFESSIONAL_EXPERIENCE: experienceLatexSection,
      EDUCATION: educationLatexSection,
      CERTIFICATIONS: certLatexSection,
      COURSEWORK: courseworkLatexSection,
      PUBLICATIONS: publicationsLatexSection,
      ACHIEVEMENTS: achievementsLatexSection,
      ADDITIONAL_SKILLS: additionalSkillsLatexSection,
      AWARDS: awardsLatexSection,
    };

    // Generic content-aware fallback (used only when the canonical snapshot lacks
    // an explicit sectionOrder — the snapshot builder normally derives one via
    // deriveSectionOrdering). Candidates with real professional experience get
    // experience-first reading order; project-first remains for profiles where
    // experience is absent. Decision is based on document content, never identity.
    const hasRealExperience =
      experienceLatexSection && typeof experienceLatexSection === 'string' && experienceLatexSection.trim().length > 0;
    const rawOrder = Array.isArray(structuredResume.sectionOrder)
      ? structuredResume.sectionOrder
      : hasRealExperience
        ? ['SUMMARY', 'SKILLS', 'EXPERIENCE', 'PROJECTS', 'EDUCATION']
        : ['SUMMARY', 'SKILLS', 'PROJECTS', 'EDUCATION'];

    const authoritativeOrder = rawOrder
      .map((s) => String(s).toUpperCase())
      .filter((s) => s !== 'HEADER');

    // DSA safety net (mirrors the legacy renderer's explicit-selection rule):
    // if the structured snapshot carries real candidate-owned DSA content, DSA must
    // reach the PDF even if the ordering derivation missed it. The page-budget logic
    // governs PROJECTS, not whether candidate-owned DSA survives. No content is
    // synthesized here: dsaLatexSection is empty unless structuredResume.dsa has
    // candidate-owned bullets/URL, so an empty DSA block adds nothing.
    if (!authoritativeOrder.includes('DSA')) {
      const dsaHasRealContent = Boolean(
        dsaLatexSection && typeof dsaLatexSection === 'string' && dsaLatexSection.trim().length > 0
      );
      if (dsaHasRealContent) {
        const projIdx = authoritativeOrder.indexOf('PROJECTS');
        if (projIdx !== -1) {
          authoritativeOrder.splice(projIdx + 1, 0, 'DSA');
        } else {
          authoritativeOrder.push('DSA');
        }
      }
    }

    const renderedSectionBlocks = [];
    let isFirstSection = true;
    const addedCanonical = new Set();

    for (const secKey of authoritativeOrder) {
      const canonicalKey = (
        secKey === 'TECHNICAL_SKILLS' ? 'SKILLS' :
        secKey === 'TECHNICAL_PROJECTS' ? 'PROJECTS' :
        secKey === 'PROBLEM_SOLVING' || secKey === 'ALGORITHMIC_PRACTICE' ? 'DSA' :
        secKey === 'PROFESSIONAL_EXPERIENCE' ? 'EXPERIENCE' :
        secKey
      );
      if (addedCanonical.has(canonicalKey)) continue;

      let block = sectionBlocks[secKey];
      if (block && typeof block === 'string' && block.trim().length > 0) {
        if (isFirstSection) {
          block = block.replace(/^\\atssection\b/, '\\atsfirstsection');
          isFirstSection = false;
        }
        renderedSectionBlocks.push(block.trim());
        addedCanonical.add(canonicalKey);
      }
    }

    const bodyLatex = renderedSectionBlocks.join('\n\n');

    const tex = this._assembleLatexDocument({
      candidateName,
      candidateHeadline,
      contactLine,
      profileLinksLine,
      bodyLatex,
      layoutProfile,
    });

    return {
      texContent: tex,
      candidateName,
      candidateEmail,
      targetRole,
      targetCompany,
      // Render contract: the per-project bullet cap actually applied by this
      // renderer run. Snapshot/QA layers (e.g. the Phase 11 traceability
      // expectation builder) must mirror this cap so expected-vs-extracted
      // comparisons describe the same document contract.
      appliedMaxBulletsPerProject: maxBulletsPerProject,
    };
  }

  /**
   * @param {object} params
   * @param {object} params.applicationPackage Canonical ApplicationPackage
   * @param {object} [params.candidateProfile] Optional verified Candidate Career Profile
   * @returns {{ texContent: string, candidateName: string, candidateEmail: string, targetRole: string, targetCompany: string }}
   */

  /**
   * Assembles the complete LaTeX document structure with preamble and vertical spacing macros.
   *
   * @private
   */
  _assembleLatexDocument({
    candidateName,
    candidateHeadline,
    contactLine,
    profileLinksLine,
    bodyLatex,
    layoutProfile,
  }) {
    // Phase 8/9 — Canonical ATS template configuration (single source of truth):
    // - single column, linear order, no tables/textboxes/icons (unchanged)
    // - margins 0.6in (within the 0.55–0.65in spec window; parser-safe)
    // - candidate name ≈17pt (\LARGE ≈ 17.28pt), section headings ≈12pt via
    //   \large (≈12pt at 10pt base), body 10pt
    // - Unicode-safe font path: XeTeX/fontspec renders TeX Gyre Heros (Arial
    //   metrics, matching the ATS_FOCUSED template metadata) with common
    //   ligatures DISABLED so "fi"/"fl" extract as real letters (Cloudflare,
    //   workflows), and fontspec's OpenType font writes correct ToUnicode CMaps
    //   for full-text extraction fidelity
    // - pdfLaTeX fallback keeps T1 + glyphtounicode so ligatures still map
    //   to correct Unicode codepoints when the fallback engine is used
    return `\\documentclass[10pt,letterpaper]{article}
\\usepackage{iftex}    \\ifxetex
  \\usepackage{fontspec}
  % File-based loading: resolves via the TeX bundle regardless of system
  % fontconfig availability (Tectonic on CI/minimal hosts).
  \\setmainfont{texgyreheros-regular.otf}[
    BoldFont=texgyreheros-bold.otf,
    Ligatures=NoCommon
  ]
  \\setsansfont{texgyreheros-regular.otf}[
    BoldFont=texgyreheros-bold.otf,
    Ligatures=NoCommon
  ]
  \\renewcommand{\\familydefault}{\\sfdefault}
\\else
  \\usepackage[utf8]{inputenc}
  \\usepackage[T1]{fontenc}
  \\usepackage{lmodern}
  \\renewcommand{\\familydefault}{\\sfdefault}
  \\input{glyphtounicode.tex}
  \\pdfgentounicode=1
\\fi
\\usepackage[margin=0.6in]{geometry}
\\usepackage{hyperref}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}

\\hypersetup{
  colorlinks=true,
  linkcolor=black,
  urlcolor=black,
  citecolor=black
}

% --- Adaptive vertical spacing system (computed by ResumeLayoutEngine P14-026) ---
% Hierarchy: SECTION_TO_SECTION > ENTRY_TO_ENTRY > HEADING_TO_CONTENT > BULLET_TO_BULLET
\\newcommand{\\atsHeaderToSection}{${layoutProfile.texMacros.atsHeaderToSection}}
\\newcommand{\\atsSectionToSection}{${layoutProfile.texMacros.atsSectionToSection}}
\\newcommand{\\atsHeadingToContent}{${layoutProfile.texMacros.atsHeadingToContent}}
\\newcommand{\\atsEntryToEntry}{${layoutProfile.texMacros.atsEntryToEntry}}
\\newcommand{\\atsProjectTitleToTech}{${layoutProfile.texMacros.atsProjectTitleToTech}}
\\newcommand{\\atsProjectTechToBullets}{${layoutProfile.texMacros.atsProjectTechToBullets}}
\\newcommand{\\atsRoleToMetadata}{${layoutProfile.texMacros.atsRoleToMetadata}}
\\newcommand{\\atsMetadataToBullets}{${layoutProfile.texMacros.atsMetadataToBullets}}
\\newcommand{\\atsBulletToBullet}{${layoutProfile.texMacros.atsBulletToBullet}}

% Backward-compatibility aliases
\\newcommand{\\atsSectionGap}{\\atsSectionToSection}
\\newcommand{\\atsHeadingGap}{\\atsHeadingToContent}
\\newcommand{\\atsProjectGap}{\\atsEntryToEntry}
\\newcommand{\\atsProjectHeadGap}{\\atsProjectTechToBullets}
\\newcommand{\\atsBulletSep}{\\atsBulletToBullet}
\\newcommand{\\atsentrygap}{\\vspace{\\atsEntryToEntry}}
\\newcommand{\\atsentryheadgap}{\\vspace{\\atsProjectTechToBullets}}

% Clean, ATS-Compliant Section Dividers (heading size \u224812pt via \large at 10pt base)
\\newcommand{\\atssection}[1]{%
  \\vspace{\\atsSectionToSection}%
  {\\noindent\\large\\bfseries\\uppercase{#1}}\\par
  \\vspace{1pt}\\hrule height 0.6pt\\vspace{\\atsHeadingToContent}%
}
\\newcommand{\\atsfirstsection}[1]{%
  \\vspace{\\atsHeaderToSection}%
  {\\noindent\\large\\bfseries\\uppercase{#1}}\\par
  \\vspace{1pt}\\hrule height 0.6pt\\vspace{\\atsHeadingToContent}%
}

\\begin{document}

% ---------------- HEADER (4-tier) ----------------
{\\centering
  {\\LARGE \\textbf{${escapeLatex(candidateName)}}}\\par
  \\vspace{2.5pt}
${candidateHeadline ? `  {\\normalsize \\textbf{${escapeLatex(candidateHeadline)}}}\\par\n  \\vspace{2.5pt}\n` : ''}\
  {\\small ${contactLine}}\\par
${profileLinksLine ? `  \\vspace{2pt}\n  {\\small ${profileLinksLine}}\\par\n` : ''}\
}

% ---------------- BODY SECTIONS ----------------
${bodyLatex}

\\end{document}
`;
  }

  generateTailoredCoverLetterLatex({ applicationPackage, candidateProfile = null }) {
    if (!applicationPackage) {
      throw new ValidationError('applicationPackage is required to generate cover letter LaTeX');
    }

    const targetJob = applicationPackage.targetJob || {};
    const targetRole = targetJob.title || 'Role';
    const targetCompany = targetJob.company || 'Company';

    // Fail-closed identity (mirrors the resume generator)
    const structuredResume =
      applicationPackage.structuredResume ||
      applicationPackage.tailoredResume?.structuredResume ||
      null;

    const candidateName =
      structuredResume?.candidateIdentity?.displayName ||
      applicationPackage.candidateName ||
      candidateProfile?.displayName ||
      null;
    const candidateEmail =
      structuredResume?.candidateIdentity?.email ||
      applicationPackage.candidateEmail ||
      candidateProfile?.primaryEmail ||
      null;
    if (!candidateName) {
      throw new ValidationError(
        'Real candidate name is required to generate cover letter LaTeX; refusing to render placeholder identity'
      );
    }
    if (!candidateEmail) {
      throw new ValidationError(
        'Authoritative candidate email is required to generate cover letter LaTeX; refusing to render placeholder contact'
      );
    }
    const candidatePhone =
      applicationPackage.candidatePhone ||
      candidateProfile?.candidatePhone ||
      candidateProfile?.phone ||
      '';
    const candidateLocation =
      candidateProfile?.location ||
      candidateProfile?.profileMetadata?.location ||
      applicationPackage.candidateLocation ||
      '';

    // Disallow forbidden placeholder tokens
    if (/example\.com/i.test(candidateEmail)) {
      throw new ValidationError(
        `Authoritative candidate email required; detected synthetic email '${candidateEmail}'`
      );
    }

    const contactElements = [];
    if (candidateEmail) {
      contactElements.push(
        `\\href{mailto:${escapeLatexUrl(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
      );
    }
    if (candidatePhone) {
      contactElements.push(escapeLatex(candidatePhone));
    }
    if (candidateLocation) {
      contactElements.push(escapeLatex(candidateLocation));
    }
    const contactLine = contactElements.join(' \\textbullet{} ');

    // Extract cover letter body paragraphs from the REAL package content.
    // The historical generic fallback letter ("verified technical achievements…
    // delivering immediate value") is removed: without real content we fail.
    const rawCoverLetter = applicationPackage.coverLetter?.markdownContent;
    if (!rawCoverLetter || rawCoverLetter.trim().length === 0) {
      throw new ValidationError(
        'Real tailored cover letter content is required; refusing to render a generic template letter'
      );
    }

    // Clean markdown headings, salutations, or sign-offs to format cleanly as LaTeX paragraphs
    const paragraphs = rawCoverLetter
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(
        (p) => p.length > 0 && !p.startsWith('#') && !p.toLowerCase().startsWith('sincerely')
      );

    if (paragraphs.length === 0) {
      throw new ValidationError(
        'Tailored cover letter content produced no renderable paragraphs; refusing to fabricate body text'
      );
    }

    const tex = `\\documentclass[11pt,letterpaper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=1.0in]{geometry}
\\usepackage{hyperref}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{8pt}

\\hypersetup{
  colorlinks=true,
  linkcolor=black,
  urlcolor=black
}

\\begin{document}

% Letterhead
{\\LARGE \\textbf{${escapeLatex(candidateName)}}}\\\\[4pt]
{\\small ${contactLine}}
\\vspace{4pt}\\hrule\\vspace{16pt}

\\textbf{Hiring Team}\\\\
${escapeLatex(targetCompany)}\\\\[14pt]

\\textbf{Subject: Application for ${escapeLatex(targetRole)}}\\\\[6pt]

${paragraphs.map((p) => escapeLatex(p)).join('\n\n')}

\\vspace{14pt}
Sincerely,\\\\
\\textbf{${escapeLatex(candidateName)}}

\\end{document}
`;

    return {
      texContent: tex,
      candidateName,
      candidateEmail,
      targetRole,
      targetCompany,
    };
  }
}
