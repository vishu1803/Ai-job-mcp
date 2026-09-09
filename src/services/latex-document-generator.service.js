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
 *   Never introduces synthetic emails (zero vishw@example.com) or fake phone numbers.
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
  cleanResumeFacingTechnologies,
  formatProjectDisplayName,
  groundAndSanitizeProject,
} from './candidate-artifact-content.service.js';
import { ResumeLayoutEngine } from './resume-layout-engine.service.js';

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
    return this._generateFromLegacyPackage({
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
    if (/vishw@example\.com|example\.com/i.test(candidateEmail)) {
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
    const contactLine = contactElements.join(' $\\cdot$ ');

    // Profile links directly from snapshot (zero hardcoded fallbacks)
    const profileLinkElements = [];
    const links = Array.isArray(identity.links) ? identity.links : [];
    for (const link of links) {
      if (link && link.url && isRealUrl(link.url)) {
        const label = link.label || link.platform || 'Link';
        profileLinkElements.push(`\\href{${escapeLatexUrl(link.url)}}{${escapeLatex(label)}}`);
      }
    }
    const profileLinksLine = profileLinkElements.join(' $\\cdot$ ');

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
        if (repoUrl && isRealUrl(repoUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(repoUrl)}}{\\small\\textbf{GitHub}}`);
        }
        if (liveUrl && isRealUrl(liveUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(liveUrl)}}{\\small\\textbf{Live Demo}}`);
        }
        const linksStr = linkParts.join(' $\\cdot$ ');

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

    // 5. DSA
    let dsaLatexSection = '';
    const dsa = structuredResume.dsa;
    if (dsa && dsa.hasSection) {
      const dsaBullets = Array.isArray(dsa.bullets) ? dsa.bullets.filter(Boolean) : [];
      const dsaUrl = dsa.profileUrl && isRealUrl(dsa.profileUrl) ? dsa.profileUrl : null;
      const dsaTitle = dsa.title || 'Problem Solving & Algorithmic Practice';
      const dsaSubtitle = dsa.subtitle || 'Candidate-Reported Problem Solving';

      if (dsaBullets.length > 0 || dsaUrl) {
        const cleanLeetcodeDisplay = dsaUrl ? dsaUrl.replace(/^https?:\/\/(www\.)?/, '') : '';
        const headerRight = dsaUrl
          ? `\\href{${escapeLatexUrl(dsaUrl)}}{\\small\\textbf{${escapeLatex(cleanLeetcodeDisplay)}}}`
          : `{\\small\\textit{Candidate-Reported}}`;

        const bulletTex = formatLatexBullets(dsaBullets);

        dsaLatexSection = `\\atssection{Problem Solving \\& Algorithmic Practice}
\\textbf{${escapeLatex(dsaTitle)}} \\hfill ${headerRight}\\par
\\vspace{\\atsRoleToMetadata}
{\\small\\textit{${escapeLatex(dsaSubtitle)}}}\\par
\\vspace{\\atsMetadataToBullets}
${bulletTex}`;
      }
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
            ? `\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.slice(0, 6).join(', '))}}`
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

    const rawOrder = Array.isArray(structuredResume.sectionOrder)
      ? structuredResume.sectionOrder
      : ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'];

    const authoritativeOrder = rawOrder
      .map((s) => String(s).toUpperCase())
      .filter((s) => s !== 'HEADER');

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
    };
  }
  /**
   * Generates resume LaTeX via legacy Markdown and candidate profile parsing.
   * Preserved for backward compatibility with historical application packages.
   *
   * @private
   */
  _generateFromLegacyPackage({ applicationPackage, candidateProfile, layoutProfile }) {
    const targetJob = applicationPackage.targetJob || {};
    const targetRole = targetJob.title || 'Software Engineer';
    const targetCompany = targetJob.company || 'Target Organization';

    // 1. Authoritative Candidate Identity & Contact.
    // Fail-closed: a real name and email are mandatory. Rendering a document for
    // "Candidate" would fabricate an identity, so we refuse instead.
    const candidateName = applicationPackage.candidateName || candidateProfile?.displayName || null;
    const candidateEmail =
      applicationPackage.candidateEmail || candidateProfile?.primaryEmail || null;
    if (!candidateName) {
      throw new ValidationError(
        'Real candidate name is required to generate resume LaTeX; refusing to render placeholder identity'
      );
    }
    if (!candidateEmail) {
      throw new ValidationError(
        'Authoritative candidate email is required to generate resume LaTeX; refusing to render placeholder contact'
      );
    }
    const candidatePhone =
      applicationPackage.candidatePhone ||
      candidateProfile?.candidatePhone ||
      candidateProfile?.phone ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.phone ||
      candidateProfile?.profileMetadata?.userCustom?.phone ||
      candidateProfile?.candidate?.phone ||
      '';
    const candidateLocation =
      candidateProfile?.location ||
      candidateProfile?.profileMetadata?.location ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.location ||
      candidateProfile?.profileMetadata?.userCustom?.location ||
      applicationPackage.candidateLocation ||
      '';

    // Disallow forbidden placeholder tokens
    if (/vishw@example\.com|example\.com/i.test(candidateEmail)) {
      throw new ValidationError(
        `Authoritative candidate email required; detected synthetic email '${candidateEmail}'`
      );
    }

    // Build contact elements array (Tier 3: contact info)
    const contactElements = [];
    if (candidatePhone) {
      contactElements.push(escapeLatex(candidatePhone));
    }
    if (candidateLocation) {
      contactElements.push(escapeLatex(candidateLocation));
    }
    if (candidateEmail) {
      contactElements.push(
        `\\href{mailto:${escapeLatexUrl(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
      );
    }
    const contactLine = contactElements.join(' $\\cdot$ ');

    // Build profile links (Tier 4: LinkedIn, GitHub, Portfolio, LeetCode)
    const profileLinkElements = [];

    // Resolve authoritative portfolio links from candidate profile or package.
    const profileLinksList = (
      Array.isArray(candidateProfile?.portfolioLinks) && candidateProfile.portfolioLinks.length > 0
        ? candidateProfile.portfolioLinks
        : Array.isArray(candidateProfile?.profileMetadata?.portfolioLinks) && candidateProfile.profileMetadata.portfolioLinks.length > 0
          ? candidateProfile.profileMetadata.portfolioLinks
          : Array.isArray(candidateProfile?.candidate?.profileMetadata?.portfolioLinks) && candidateProfile.candidate.profileMetadata.portfolioLinks.length > 0
            ? candidateProfile.candidate.profileMetadata.portfolioLinks
            : Array.isArray(candidateProfile?.profileMetadata?.userCustom?.portfolioLinks) && candidateProfile.profileMetadata.userCustom.portfolioLinks.length > 0
              ? candidateProfile.profileMetadata.userCustom.portfolioLinks
              : Array.isArray(candidateProfile?.candidate?.profileMetadata?.userCustom?.portfolioLinks)
                ? candidateProfile.candidate.profileMetadata.userCustom.portfolioLinks
                : []
    );
    const packageLinksList = Array.isArray(applicationPackage?.portfolioLinks)
      ? applicationPackage.portfolioLinks
      : [];
    const customLinks = profileLinksList.length > 0 ? profileLinksList : packageLinksList;

    const linkedInLink = customLinks.find(
      (l) =>
        /linkedin/i.test(l.label || l.platform || '') || (l.url && /linkedin\.com/i.test(l.url))
    );
    if (linkedInLink?.url) {
      profileLinkElements.push(`\\href{${escapeLatexUrl(linkedInLink.url)}}{LinkedIn}`);
    }

    // Candidate's canonical profile-level GitHub URL (never a project repository URL)
    let profileGithubUrl = null;
    if (candidateProfile?.githubUsername) {
      profileGithubUrl = `https://github.com/${escapeLatex(candidateProfile.githubUsername)}`;
    } else if (candidateProfile?.candidate?.githubUsername) {
      profileGithubUrl = `https://github.com/${escapeLatex(candidateProfile.candidate.githubUsername)}`;
    } else if (Array.isArray(candidateProfile?.identities)) {
      const ghIdentity = candidateProfile.identities.find(
        (id) => (id.provider === 'GITHUB_APP' || id.provider === 'GITHUB') && id.externalUsername
      );
      if (ghIdentity) {
        profileGithubUrl = `https://github.com/${escapeLatex(ghIdentity.externalUsername)}`;
      }
    }
    if (!profileGithubUrl) {
      const ghLink = customLinks.find(
        (l) =>
          /github/i.test(l.label || l.platform || '') ||
          (l.url && /^https?:\/\/github\.com\/[^/]+\/?$/i.test(l.url))
      );
      if (ghLink?.url) {
        const match = ghLink.url.match(/^https?:\/\/github\.com\/([^/]+)\/?$/i);
        if (match) profileGithubUrl = `https://github.com/${match[1]}`;
      }
    }
    if (!profileGithubUrl && applicationPackage.tailoredResume?.markdownContent) {
      const mdGhMatch = applicationPackage.tailoredResume.markdownContent.match(
        /\*\*GitHub:\*\*\s*(https?:\/\/github\.com\/[^/\s\n]+)/i
      );
      if (mdGhMatch?.[1]) profileGithubUrl = mdGhMatch[1];
    }
    if (profileGithubUrl && isRealUrl(profileGithubUrl)) {
      profileLinkElements.push(`\\href{${escapeLatexUrl(profileGithubUrl)}}{GitHub}`);
    }

    const portfolioLink = customLinks.find(
      (l) =>
        /portfolio/i.test(l.label || l.platform || '') ||
        (l.url && /vercel\.app|portfolio/i.test(l.url) && !/task-manager/i.test(l.url))
    );
    if (portfolioLink?.url && isRealUrl(portfolioLink.url)) {
      profileLinkElements.push(`\\href{${escapeLatexUrl(portfolioLink.url)}}{Portfolio}`);
    }

    const leetcodeLink = customLinks.find(
      (l) =>
        /leetcode/i.test(l.label || l.platform || '') || (l.url && /leetcode\.com/i.test(l.url))
    );
    if (leetcodeLink?.url && isRealUrl(leetcodeLink.url)) {
      profileLinkElements.push(`\\href{${escapeLatexUrl(leetcodeLink.url)}}{LeetCode}`);
    }

    const profileLinksLine = profileLinkElements.join(' $\\cdot$ ');

    // Resolve professional headline (curated to strip seniority inflation for freshers)
    const structuredHeadline =
      applicationPackage.structuredResume?.candidateIdentity?.headline ||
      applicationPackage.structuredResume?.targetRole ||
      applicationPackage.tailoringPlan?.targetRoleTitle;

    const rawHeadline =
      structuredHeadline ||
      candidateProfile?.headline ||
      candidateProfile?.candidate?.headline ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.headline ||
      candidateProfile?.profileMetadata?.userCustom?.headline ||
      targetRole ||
      '';
    const candidateHeadline = curateCandidateHeadline(
      rawHeadline,
      candidateProfile || applicationPackage
    );

    // 2. Summary / Objective — real stored summary only; curated for evidence truth; never synthesized or leaking "Tailored for:"
    let summaryText = '';
    const summaryMatch = applicationPackage.tailoredResume?.markdownContent?.match(
      /## Professional Summary\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
    );
    if (summaryMatch?.[1]?.trim()) {
      summaryText = summaryMatch[1].trim();
    } else {
      summaryText =
        candidateProfile?.summary ||
        candidateProfile?.candidate?.summary ||
        candidateProfile?.candidate?.profileMetadata?.userCustom?.summary ||
        candidateProfile?.profileMetadata?.userCustom?.summary ||
        applicationPackage.tailoredResume?.markdownContent
          ?.replace(/^#+.*$/gm, '')
          ?.replace(/\*\*Email:\*\*.*$/gm, '')
          ?.replace(/\*\*Phone:\*\*.*$/gm, '')
          ?.trim() ||
        '';

      // Clean any legacy internal tailoring tags from summary
      summaryText = summaryText
        .replace(/^tailored for:\s*[^\n]+\n*/i, '')
        .replace(/^dedicated professional tailored for\s*[^\n]+\n*/i, '')
        .trim();

      // Curate summary for evidence truth against candidate profile/package
      summaryText = curateProfessionalSummary(
        summaryText,
        candidateProfile || applicationPackage,
        targetJob
      );
    }

    // 3. Technical Skills: Canonical mapping & alias deduplication
    const CANONICAL_SKILL_REPLACEMENTS = {
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
      git: 'Git',
      'github actions': 'GitHub Actions',
      docker: 'Docker',
      linux: 'Linux',
      'model context protocol': 'Model Context Protocol (MCP)',
      mcp: 'Model Context Protocol (MCP)',
      'c/c++': 'C/C++',
      'c++': 'C/C++',
      c: 'C',
    };

    const normalizeAndDeduplicateSkills = (skillsList) => {
      const seen = new Set();
      const deduped = [];
      for (const s of skillsList) {
        if (!s) continue;
        const rawLower = String(s).trim().toLowerCase();
        // Ignore low-value backend noise
        if (
          [
            'eslint',
            'prettier',
            'vite',
            'cypress',
            'jest',
            'tailwind css',
            'npm',
            'socket io',
            'socket.io',
          ].includes(rawLower)
        ) {
          continue;
        }
        const canonicalName = CANONICAL_SKILL_REPLACEMENTS[rawLower] || s;
        const token = canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(token)) continue;
        seen.add(token);
        deduped.push(canonicalName);
      }
      // If Git and GitHub Actions are present, ensure standalone 'github' is omitted
      if (seen.has('git') && seen.has('githubactions')) {
        const idx = deduped.findIndex((name) => name.toLowerCase() === 'github');
        if (idx >= 0) deduped.splice(idx, 1);
      }
      return deduped;
    };

    let skillsLatexSection = '';

    // Primary source: pre-categorized skills from the content service
    const resumeCategorizedSkills = applicationPackage.tailoredResume?.categorizedSkills || null;
    if (resumeCategorizedSkills && Object.keys(resumeCategorizedSkills).length > 0) {
      const formattedLines = [];
      for (const [catName, skillsList] of Object.entries(resumeCategorizedSkills)) {
        if (Array.isArray(skillsList) && skillsList.length > 0) {
          const deduped = normalizeAndDeduplicateSkills(skillsList);
          if (deduped.length > 0) {
            formattedLines.push(
              `\\textbf{${escapeLatex(catName)}:} ${escapeLatex(deduped.join(', '))}`
            );
          }
        }
      }
      if (formattedLines.length > 0) {
        skillsLatexSection = `\\atssection{Technical Skills}\n${formattedLines.join('\\\\\n')}\\par`;
      }
    }

    // Fallback 1: parse from markdown content
    if (!skillsLatexSection) {
      const skillsMatch = applicationPackage.tailoredResume?.markdownContent?.match(
        /## Technical Skills\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
      );
      if (skillsMatch) {
        const categoryLines = skillsMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('- **') || l.startsWith('* **'));
        if (categoryLines.length > 0) {
          const formattedLines = categoryLines.map((line) => {
            const m = line.match(/^[-*]\s*\*\*([^*]+)\*\*\s*(.*)$/);
            if (m) {
              const catName = escapeLatex(m[1].replace(/:$/, ''));
              const rawSkills = m[2]
                .replace(/^:\s*/, '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              const deduped = normalizeAndDeduplicateSkills(rawSkills);
              return `\\textbf{${catName}:} ${escapeLatex(deduped.join(', '))}`;
            }
            return `${escapeLatex(line)}`;
          });
          skillsLatexSection = `\\atssection{Technical Skills}\n${formattedLines.join('\\\\\n')}\\par`;
        }
      }
    }

    // Fallback 2: Core Competencies from provenance-partitioned skill buckets
    const verifiedSkills = (applicationPackage.verifiedSkills || [])
      .filter((s) => s.truthCategory === 'VERIFIED' || s.truthCategory === 'CORROBORATED')
      .map((s) => s.name);

    const claimedSkills = (applicationPackage.claimedSkills || [])
      .filter((s) => s.truthCategory === 'CLAIMED' || s.truthCategory === 'USER_PROVIDED')
      .map((s) => s.name);

    const learningSkills = (applicationPackage.claimedSkills || [])
      .filter((s) => s.truthCategory === 'LEARNING')
      .map((s) => s.name);

    if (
      !skillsLatexSection &&
      (verifiedSkills.length > 0 || claimedSkills.length > 0 || learningSkills.length > 0)
    ) {
      const dedupedVerified = normalizeAndDeduplicateSkills(verifiedSkills);
      const dedupedClaimed = normalizeAndDeduplicateSkills(claimedSkills);
      const dedupedLearning = normalizeAndDeduplicateSkills(learningSkills);
      const capLines = [];
      if (dedupedVerified.length > 0) {
        capLines.push(`\\textbf{Verified Capabilities:} ${escapeLatex(dedupedVerified.join(', '))}`);
      }
      if (dedupedClaimed.length > 0) {
        capLines.push(`\\textbf{Technical Proficiency:} ${escapeLatex(dedupedClaimed.join(', '))}`);
      }
      if (dedupedLearning.length > 0) {
        capLines.push(`\\textbf{Active Learning / Growth:} ${escapeLatex(dedupedLearning.join(', '))}`);
      }
      if (capLines.length > 0) {
        skillsLatexSection = `\\atssection{Core Competencies}\n${capLines.join('\\\\\n')}\\par`;
      }
    }

    // 4. Technical Projects — parse projects with clean engineering bullets & action links
    const selectedProjects =
      applicationPackage.tailoredResume?.selectedProjects ||
      applicationPackage.selectedProjects ||
      null;

    let projectsToRender = [];
    if (Array.isArray(selectedProjects) && selectedProjects.length > 0) {
      projectsToRender = selectedProjects;
    } else if (applicationPackage.tailoredResume?.markdownContent) {
      // Parse ## Technical Projects from markdown
      const md = applicationPackage.tailoredResume.markdownContent;
      const projSectionMatch = md.match(
        /## Technical Projects\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
      );
      if (projSectionMatch) {
        const rawProjText = projSectionMatch[1];
        const projBlocks = rawProjText.split(/\n+(?=###\s+)/);
        for (const block of projBlocks) {
          const lines = block
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length === 0) continue;
          const headerMatch = lines[0].match(/^###\s*(?:\[([^\]]+)\]\(([^)]+)\)|([^(\n]+))/);
          const rawHeaderName = headerMatch
            ? (headerMatch[1] || headerMatch[3]).trim()
            : lines[0].replace(/^###\s*/, '');
          const pName = formatProjectDisplayName(rawHeaderName);
          const repoUrl = headerMatch && headerMatch[2] ? headerMatch[2] : null;

          let techs = [];
          let liveUrl = null;
          const bullets = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const techMatch = line.match(
              /\*Technologies:\s*([^*]+)(?:·\s*Live Demo:\s*([^*]+))?\*/i
            );
            if (techMatch) {
              techs = cleanResumeFacingTechnologies(
                techMatch[1]
                  .split(',')
                  .map((t) => t.trim())
                  .filter(Boolean)
              );
              if (techMatch[2] && isRealUrl(techMatch[2].trim())) {
                liveUrl = techMatch[2].trim();
              }
              continue;
            }
            if (/^[-*]\s+/.test(line)) {
              const bulletText = line.replace(/^[-*]\s+/, '').trim();
              if (
                /^(source code|project link|repository|repo|url|demo):\s*https?:\/\//i.test(
                  bulletText
                ) ||
                /^https?:\/\//i.test(bulletText)
              ) {
                if (!liveUrl && /live|demo|vercel/i.test(bulletText)) {
                  const urlMatch = bulletText.match(/https?:\/\/[^\s]+/);
                  if (urlMatch && isRealUrl(urlMatch[0])) liveUrl = urlMatch[0];
                }
                continue;
              }
              bullets.push(bulletText);
            }
          }

          projectsToRender.push({
            name: pName,
            repositoryUrl: repoUrl,
            liveUrl,
            technologies: techs,
            bullets,
          });
        }
      }
    }

    if (projectsToRender.length === 0) {
      // Fallback: check profile resumeData.projects or portfolioLinks
      const storedProjs =
        candidateProfile?.candidate?.profileMetadata?.resumeData?.projects ||
        candidateProfile?.profileMetadata?.resumeData?.projects ||
        candidateProfile?.projects ||
        [];
      if (Array.isArray(storedProjs) && storedProjs.length > 0) {
        for (const p of storedProjs) {
          const rawBullets = Array.isArray(p.bullets) ? p.bullets : [];
          const cleanBullets = rawBullets.filter(
            (b) =>
              !/^(source code|project link|repository|repo|url):\s*https?:\/\//i.test(b) &&
              !/^https?:\/\//i.test(b)
          );
          projectsToRender.push({
            name: formatProjectDisplayName(p.title || p.name),
            repositoryUrl:
              p.repositoryUrl ||
              p.sourceUrl ||
              p.bullets?.find((b) => b.includes('github.com'))?.match(/https?:\/\/[^\s]+/)?.[0] ||
              null,
            liveUrl:
              p.liveUrl ||
              p.bullets?.find((b) => b.includes('vercel.app'))?.match(/https?:\/\/[^\s]+/)?.[0] ||
              null,
            technologies: p.technologies || [],
            bullets: cleanBullets,
          });
        }
      }
    }

    // Problem Solving & Algorithmic Practice:
    // The rendering layer MUST NOT decide whether optional content exists.
    // Content Strategy is authoritative for DSA selection.
    // LeetCode URL presence is NOT the selection condition.
    // The renderer receives selectedSections + sectionSnapshots and only performs layout/rendering.
    const selectedSections =
      applicationPackage.tailoredResume?.selectedSections ||
      applicationPackage.selectedSections ||
      null;

    const sectionSnapshots =
      applicationPackage.tailoredResume?.sectionSnapshots ||
      applicationPackage.sectionSnapshots ||
      {};

    const hasSelectedSectionsList = Array.isArray(selectedSections) && selectedSections.length > 0;

    const isExplicitlySelected = hasSelectedSectionsList
      ? selectedSections.some((s) =>
          ['PROBLEM_SOLVING', 'DSA', 'LEETCODE', 'ALGORITHMIC_PRACTICE'].includes(String(s).toUpperCase())
        )
      : /## (?:Problem Solving|Algorithmic Practice|LeetCode)/i.test(
          applicationPackage.tailoredResume?.markdownContent || ''
        );

    let projectsLatexSection = '';
    if (projectsToRender.length > 0) {
      // Content Budget: feature top 2 projects when Problem Solving is included to ensure 1-page fit
      const projectsBudget = isExplicitlySelected ? 2 : 3;
      const projectsToFeature = projectsToRender.slice(0, projectsBudget);
      const maxBulletsPerProject = layoutProfile.maxBulletsPerProject;
      const projectEntries = projectsToFeature.map((p, index) => {
        const pSanitized = {
          ...p,
          technologies: Array.isArray(p.technologies) ? [...p.technologies] : [],
          bullets: Array.isArray(p.bullets)
            ? [...p.bullets]
            : Array.isArray(p.highlights)
              ? [...p.highlights]
              : [],
        };
        groundAndSanitizeProject(pSanitized);
        const rawName = pSanitized.name || pSanitized.projectName || pSanitized.title || 'Project';
        const pName = escapeLatex(formatProjectDisplayName(rawName));
        const repoUrl = pSanitized.repositoryUrl || pSanitized.repoUrl || pSanitized.url || '';
        const liveUrl = pSanitized.liveUrl || '';

        // Format technologies inline
        const rawTechs = Array.isArray(pSanitized.technologies) ? pSanitized.technologies : [];
        const cleanTechs = cleanResumeFacingTechnologies(rawTechs);
        const techs = cleanTechs.map((t) => escapeLatex(t)).join(', ');

        // Build clean action links: \href{repoUrl}{GitHub} · \href{liveUrl}{Live Demo}
        const linkParts = [];
        if (repoUrl && isRealUrl(repoUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(repoUrl)}}{\\small\\textbf{GitHub}}`);
        }
        if (liveUrl && isRealUrl(liveUrl)) {
          linkParts.push(`\\href{${escapeLatexUrl(liveUrl)}}{\\small\\textbf{Live Demo}}`);
        }
        const linksStr = linkParts.join(' $\\cdot$ ');

        // Project header: bold title + right-aligned action links on line 1;
        // technologies render on their own compact line beneath
        let headerLine = `\\textbf{${pName}}`;
        if (linksStr) headerLine += ` \\hfill ${linksStr}`;
        const techLine = techs ? `{\\small\\textit{${techs}}}` : '';

        // Clean bullets: filter out raw link bullets, keep top 2-3 meaningful bullets
        const rawBullets = Array.isArray(pSanitized.bullets) ? pSanitized.bullets : [];
        const cleanBullets = rawBullets
          .map((b) => String(b).trim())
          .filter(
            (b) =>
              b.length > 0 &&
              !/^(source code|project link|repository|repo|url):\s*https?:\/\//i.test(b) &&
              !/^https?:\/\//i.test(b)
          )
          .slice(0, maxBulletsPerProject);

        const pBullets = formatLatexBullets(cleanBullets);

        const entryLines = [`${headerLine}\\par`];
        if (techLine) {
          entryLines.push('\\vspace{\\atsProjectTitleToTech}');
          entryLines.push(`${techLine}\\par`);
        }
        entryLines.push('\\vspace{\\atsProjectTechToBullets}');
        if (pBullets) entryLines.push(pBullets);

        // ENTRY_TO_ENTRY separator: ONLY between entries, NEVER after the last entry!
        if (index < projectsToFeature.length - 1) {
          entryLines.push('\\vspace{\\atsEntryToEntry}');
        }
        return entryLines.join('\n');
      });
      projectsLatexSection = `\\atssection{Technical Projects}\n${projectEntries.join('\n')}`;
    }

    let dsaLatexSection = '';
    if (isExplicitlySelected) {
      // Content Strategy is authoritative: DSA is selected. Find candidate-owned DSA content in snapshot.
      let dsaBullets = [];
      let dsaSubtitle = 'Candidate-Reported Problem Solving';
      let dsaTitle = 'Problem Solving & Algorithmic Practice';
      let dsaUrl = null;

      const dsaSnapshot = sectionSnapshots.PROBLEM_SOLVING || sectionSnapshots.DSA || null;
      if (dsaSnapshot) {
        if (Array.isArray(dsaSnapshot.bullets) && dsaSnapshot.bullets.length > 0) {
          dsaBullets = dsaSnapshot.bullets;
        }
        if (dsaSnapshot.title) dsaTitle = dsaSnapshot.title;
        if (dsaSnapshot.subtitle) dsaSubtitle = dsaSnapshot.subtitle;
        if (dsaSnapshot.profileUrl && isRealUrl(dsaSnapshot.profileUrl)) {
          dsaUrl = dsaSnapshot.profileUrl;
        }
      }

      if (dsaBullets.length === 0) {
        const dsaMdMatch = applicationPackage.tailoredResume?.markdownContent?.match(
          /## (?:Problem Solving & Algorithmic Practice|Problem Solving|Algorithmic Practice|LeetCode[^\n]*)\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/i
        );
        if (dsaMdMatch) {
          const rawText = dsaMdMatch[1];
          const subMatch = rawText.match(/###\s*(?:\[([^\]]+)\]\(([^)]+)\)|([^\n]+))/);
          if (subMatch) {
            if (subMatch[2] && isRealUrl(subMatch[2])) {
              dsaUrl = dsaUrl || subMatch[2];
            }
            if (subMatch[1]) {
              dsaTitle = subMatch[1].trim();
            } else if (subMatch[3]) {
              const parts = subMatch[3].split('·').map((p) => p.trim());
              if (parts[0]) dsaTitle = parts[0];
              if (parts[1]) dsaSubtitle = parts[1];
            }
          }
          const parsedBullets = rawText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => /^[-*]\s+/.test(l))
            .map((l) => l.replace(/^[-*]\s+/, '').trim())
            .filter(Boolean);
          if (parsedBullets.length > 0) {
            dsaBullets = parsedBullets;
          }
        }
      }

      if (dsaBullets.length === 0) {
        const profileDsaBullets =
          candidateProfile?.problemSolving?.bullets ||
          candidateProfile?.candidate?.profileMetadata?.problemSolving?.bullets ||
          candidateProfile?.profileMetadata?.problemSolving?.bullets ||
          candidateProfile?.candidate?.profileMetadata?.userCustom?.problemSolving?.bullets ||
          candidateProfile?.profileMetadata?.userCustom?.problemSolving?.bullets ||
          null;
        if (Array.isArray(profileDsaBullets) && profileDsaBullets.length > 0) {
          dsaBullets = profileDsaBullets;
        }
      }

      // If DSA is selected but valid DSA content is missing, fail validation rather than inventing content
      if (dsaBullets.length === 0) {
        throw new ValidationError(
          'DSA section is selected by Content Strategy, but valid candidate-owned DSA content is missing from snapshot; refusing to invent content.'
        );
      }

      // LeetCode URL is optional content inside the selected DSA section
      if (!dsaUrl && leetcodeLink?.url && isRealUrl(leetcodeLink.url)) {
        dsaUrl = leetcodeLink.url;
      }

      const cleanLeetcodeDisplay = dsaUrl ? dsaUrl.replace(/^https?:\/\/(www\.)?/, '') : '';
      const headerRight = dsaUrl
        ? `\\href{${escapeLatexUrl(dsaUrl)}}{\\small\\textbf{${escapeLatex(cleanLeetcodeDisplay)}}}`
        : `{\\small\\textit{Candidate-Reported}}`;

      const bulletTex = formatLatexBullets(dsaBullets);

      dsaLatexSection = `\\atssection{Problem Solving \\& Algorithmic Practice}
\\textbf{${escapeLatex(dsaTitle)}} \\hfill ${headerRight}\\par
\\vspace{\\atsRoleToMetadata}
{\\small\\textit{${escapeLatex(dsaSubtitle)}}}\\par
\\vspace{\\atsMetadataToBullets}
${bulletTex}`;
    }

    // 5. Professional Experience — real stored records only.
    const experienceRecords =
      candidateProfile?.experience ||
      candidateProfile?.profileMetadata?.experience ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.experience ||
      candidateProfile?.candidate?.profileMetadata?.experience ||
      [];

    const expEntries = experienceRecords.map((exp, index) => {
      const title = escapeLatex(exp.title || exp.role || 'Role');
      const company = exp.company || exp.employer ? escapeLatex(exp.company || exp.employer) : '';
      const endDate = exp.isCurrent ? 'Present' : exp.endDate || exp.endYear || '';
      const dates = [exp.startDate || exp.startYear || '', endDate].filter(Boolean).join(' -- ');
      const location = exp.location ? escapeLatex(exp.location) : '';
      const bullets = formatLatexBullets(exp.bullets || exp.highlights || exp.description);

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

    // 6. Education — real stored records only
    const educationRecords =
      candidateProfile?.education ||
      candidateProfile?.profileMetadata?.education ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.education ||
      candidateProfile?.candidate?.profileMetadata?.education ||
      [];

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
          ? `\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.slice(0, 6).join(', '))}}`
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

    // 7. Certifications — candidate-provided / claimed records
    // Content Strategy is authoritative: render ONLY if selectedSections includes CERTIFICATIONS
    const isCertSelected = hasSelectedSectionsList
      ? selectedSections.some((s) =>
          ['CERTIFICATIONS', 'CERTIFICATION'].includes(String(s).toUpperCase())
        )
      : Boolean(
          candidateProfile?.certifications?.length ||
          /## Certifications/i.test(applicationPackage.tailoredResume?.markdownContent || '')
        );

    let certLatexSection = '';
    if (isCertSelected) {
      let certNames = [];
      const certSnapshot = sectionSnapshots.CERTIFICATIONS || null;
      if (certSnapshot && Array.isArray(certSnapshot.records) && certSnapshot.records.length > 0) {
        certNames = certSnapshot.records
          .map((c) => (typeof c === 'string' ? c : c.name || c.title || ''))
          .filter(Boolean);
      }
      if (certNames.length === 0) {
        const certRecords =
          candidateProfile?.certifications ||
          candidateProfile?.profileMetadata?.userCustom?.certifications ||
          candidateProfile?.candidate?.profileMetadata?.userCustom?.certifications ||
          [];
        const mdCertsMatch = applicationPackage.tailoredResume?.markdownContent?.match(
          /## Certifications\n+([\s\S]*?)(?=\n+##(?!#)\s+[^\n]+|$)/
        );
        if (Array.isArray(certRecords) && certRecords.length > 0) {
          certNames = certRecords
            .map((c) => (typeof c === 'string' ? c : c.name || c.title || ''))
            .filter(Boolean);
        } else if (mdCertsMatch) {
          certNames = mdCertsMatch[1]
            .split('\n')
            .map((l) => l.trim().replace(/^[-*]\s*/, ''))
            .filter(Boolean);
        }
      }
      if (certNames.length > 0) {
        certLatexSection = `\\atssection{Certifications}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${certNames.map((c) => `  \\item ${escapeLatex(c)}`).join('\n')}
\\end{itemize}`;
      }
    }

    // 8. Other optional candidate-owned sections (Coursework, Publications, Achievements, Additional Skills, Awards)
    let courseworkLatexSection = '';
    const isCourseworkSelected = hasSelectedSectionsList && selectedSections.some((s) =>
      ['COURSEWORK', 'RELEVANT_COURSEWORK'].includes(String(s).toUpperCase())
    );
    if (isCourseworkSelected) {
      const cwSnapshot = sectionSnapshots.COURSEWORK || null;
      const cwRecords = Array.isArray(cwSnapshot?.records) ? cwSnapshot.records : [];
      if (cwRecords.length > 0) {
        courseworkLatexSection = `\\atssection{Relevant Coursework}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${cwRecords.map((c) => `  \\item ${escapeLatex(typeof c === 'string' ? c : c.name || c.title)}`).join('\n')}
\\end{itemize}`;
      }
    }

    let publicationsLatexSection = '';
    const isPubSelected = hasSelectedSectionsList && selectedSections.some((s) =>
      ['PUBLICATIONS', 'PUBLICATION'].includes(String(s).toUpperCase())
    );
    if (isPubSelected) {
      const pubSnapshot = sectionSnapshots.PUBLICATIONS || null;
      const pubRecords = Array.isArray(pubSnapshot?.records) ? pubSnapshot.records : [];
      if (pubRecords.length > 0) {
        publicationsLatexSection = `\\atssection{Publications}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${pubRecords.map((p) => `  \\item ${escapeLatex(typeof p === 'string' ? p : p.title || p.name)}`).join('\n')}
\\end{itemize}`;
      }
    }

    let achievementsLatexSection = '';
    const isAchievementsSelected = hasSelectedSectionsList && selectedSections.some((s) =>
      ['ACHIEVEMENTS', 'ACHIEVEMENT'].includes(String(s).toUpperCase())
    );
    if (isAchievementsSelected) {
      const achSnapshot = sectionSnapshots.ACHIEVEMENTS || null;
      const achRecords = Array.isArray(achSnapshot?.records) ? achSnapshot.records : [];
      if (achRecords.length > 0) {
        achievementsLatexSection = `\\atssection{Achievements}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${achRecords.map((a) => `  \\item ${escapeLatex(typeof a === 'string' ? a : a.title || a.name)}`).join('\n')}
\\end{itemize}`;
      }
    }

    let additionalSkillsLatexSection = '';
    const isAddSkillsSelected = hasSelectedSectionsList && selectedSections.some((s) =>
      ['ADDITIONAL_SKILLS', 'ADDITIONAL_SKILL'].includes(String(s).toUpperCase())
    );
    if (isAddSkillsSelected) {
      const skSnapshot = sectionSnapshots.ADDITIONAL_SKILLS || null;
      const skRecords = Array.isArray(skSnapshot?.records) ? skSnapshot.records : [];
      if (skRecords.length > 0) {
        additionalSkillsLatexSection = `\\atssection{Additional Skills}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${skRecords.map((s) => `  \\item ${escapeLatex(typeof s === 'string' ? s : s.name || s.skill)}`).join('\n')}
\\end{itemize}`;
      }
    }

    let awardsLatexSection = '';
    const isAwardsSelected = hasSelectedSectionsList && selectedSections.some((s) =>
      ['AWARDS', 'AWARD'].includes(String(s).toUpperCase())
    );
    if (isAwardsSelected) {
      const awSnapshot = sectionSnapshots.AWARDS || null;
      const awRecords = Array.isArray(awSnapshot?.records) ? awSnapshot.records : [];
      if (awRecords.length > 0) {
        awardsLatexSection = `\\atssection{Awards}
\\begin{itemize}
\\setlength{\\itemsep}{\\atsBulletToBullet}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\\setlength{\\topsep}{0pt}\\setlength{\\partopsep}{0pt}
${awRecords.map((a) => `  \\item ${escapeLatex(typeof a === 'string' ? a : a.title || a.name)}`).join('\n')}
\\end{itemize}`;
      }
    }

    const hasRealExperience = experienceRecords.length > 0;
    const hasRealEducation = educationRecords.length > 0;

    const summaryLatexSection = `\\atssection{Professional Summary}\n${summaryText ? escapeLatex(summaryText) : '\\textit{(Professional summary not provided in profile.)}'}\\par`;
    const experienceLatexSection = hasRealExperience && expEntries.length > 0
      ? `\\atssection{Professional Experience}\n${expEntries.join('\n')}`
      : '';
    const educationLatexSection = hasRealEducation && eduEntries.length > 0
      ? `\\atssection{Education}\n${eduEntries.join('\n')}`
      : '';

    const sectionBlocks = {
      SUMMARY: summaryLatexSection,
      SKILLS: skillsLatexSection,
      PROJECTS: projectsLatexSection,
      DSA: dsaLatexSection,
      EXPERIENCE: experienceLatexSection,
      EDUCATION: educationLatexSection,
      CERTIFICATIONS: certLatexSection,
      COURSEWORK: courseworkLatexSection,
      PUBLICATIONS: publicationsLatexSection,
      ACHIEVEMENTS: achievementsLatexSection,
      ADDITIONAL_SKILLS: additionalSkillsLatexSection,
      AWARDS: awardsLatexSection,
    };

    const authoritativeOrder = (
      applicationPackage.structuredResume?.sectionOrder ||
      applicationPackage.tailoringPlan?.sectionOrder ||
      applicationPackage.tailoredResume?.sectionOrder ||
      ['SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION']
    )
      .map((s) => String(s).toUpperCase())
      .filter((s) => s !== 'HEADER');

    if (isExplicitlySelected && !authoritativeOrder.includes('DSA')) {
      const projIdx = authoritativeOrder.indexOf('PROJECTS');
      if (projIdx !== -1) {
        authoritativeOrder.splice(projIdx + 1, 0, 'DSA');
      } else {
        authoritativeOrder.push('DSA');
      }
    }

    const defaultTail = [
      'SUMMARY',
      'SKILLS',
      'PROJECTS',
      'EXPERIENCE',
      'EDUCATION',
      'CERTIFICATIONS',
      'COURSEWORK',
      'PUBLICATIONS',
      'ACHIEVEMENTS',
      'ADDITIONAL_SKILLS',
      'AWARDS',
    ];
    for (const sec of defaultTail) {
      if (!authoritativeOrder.includes(sec)) {
        authoritativeOrder.push(sec);
      }
    }

    const renderedSectionBlocks = [];
    let isFirstSection = true;

    for (const secKey of authoritativeOrder) {
      let block = sectionBlocks[secKey];
      if (block && typeof block === 'string' && block.trim().length > 0) {
        if (isFirstSection) {
          block = block.replace(/^\\atssection\b/, '\\atsfirstsection');
          isFirstSection = false;
        }
        renderedSectionBlocks.push(block.trim());
      }
    }

    const bodyLatex = renderedSectionBlocks.join('\n\n');

    // Assemble LaTeX Document with balanced ATS layout
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
    };
  }

  /**
   * Generates formal typographic LaTeX source for a tailored cover letter.
   *
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
    return `\\documentclass[10pt,letterpaper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[margin=0.5in]{geometry}
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

% Clean, ATS-Compliant Section Dividers
\\newcommand{\\atssection}[1]{%
  \\vspace{\\atsSectionToSection}%
  {\\noindent\\large\\textbf{\\uppercase{#1}}}\\par
  \\vspace{1.5pt}\\hrule\\vspace{\\atsHeadingToContent}%
}
\\newcommand{\\atsfirstsection}[1]{%
  \\vspace{\\atsHeaderToSection}%
  {\\noindent\\large\\textbf{\\uppercase{#1}}}\\par
  \\vspace{1.5pt}\\hrule\\vspace{\\atsHeadingToContent}%
}

\\begin{document}

% ---------------- HEADER (4-tier) ----------------
{\\centering
  {\\Huge \\textbf{${escapeLatex(candidateName)}}}\\par
  \\vspace{2.5pt}
${candidateHeadline ? `  {\\large \\textbf{${escapeLatex(candidateHeadline)}}}\\par\n  \\vspace{2.5pt}\n` : ''}\
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
    if (/vishw@example\.com|example\.com/i.test(candidateEmail)) {
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
    const contactLine = contactElements.join(' $\\cdot$ ');

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
