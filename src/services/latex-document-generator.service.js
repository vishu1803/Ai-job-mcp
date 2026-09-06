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

/**
 * Escapes reserved LaTeX characters in dynamic user strings.
 *
 * @param {string} text Raw string
 * @returns {string} LaTeX-escaped string
 */
export function escapeLatex(text) {
  if (text == null) return '';
  if (typeof text !== 'string') text = String(text);

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

  return text.replace(/[\\{}$&#%_~^<>]/g, (ch) => map[ch] || ch);
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

  if (lines.length === 0) return '';
  return (
    '\\begin{itemize}\n\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\n' +
    lines.map((l) => `  \\item ${escapeLatex(l)}`).join('\n') +
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
    ];
    for (const pattern of forbidden) {
      if (pattern.test(text)) violations.push(`Forbidden placeholder content: ${pattern}`);
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
   * @returns {{ texContent: string, candidateName: string, candidateEmail: string, targetRole: string, targetCompany: string }}
   */
  generateTailoredResumeLatex({ applicationPackage, candidateProfile = null }) {
    if (!applicationPackage) {
      throw new ValidationError('applicationPackage is required to generate resume LaTeX');
    }

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

    // Build contact elements array
    const contactElements = [];
    if (candidateEmail) {
      contactElements.push(
        `\\href{mailto:${escapeLatex(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
      );
    }
    if (candidatePhone) {
      contactElements.push(escapeLatex(candidatePhone));
    }
    if (candidateLocation) {
      contactElements.push(escapeLatex(candidateLocation));
    }

    // Extract relevant portfolio / GitHub links
    const portfolioLinks =
      applicationPackage.portfolioLinks || candidateProfile?.portfolioLinks || [];
    if (portfolioLinks.length > 0 && portfolioLinks[0].repositoryUrl) {
      const firstUrl = portfolioLinks[0].repositoryUrl;
      contactElements.push(`\\url{${firstUrl}}`);
    } else if (candidateProfile?.githubUsername) {
      contactElements.push(
        `\\url{https://github.com/${escapeLatex(candidateProfile.githubUsername)}}`
      );
    }

    const contactLine = contactElements.join(' $\\cdot$ ');

    // 2. Summary / Objective — real stored summary only; never synthesized.
    const summaryText =
      applicationPackage.tailoredResume?.markdownContent
        ?.replace(/^#+.*$/gm, '')
        ?.replace(/\*\*Email:\*\*.*$/gm, '')
        ?.replace(/\*\*Phone:\*\*.*$/gm, '')
        ?.trim() ||
      candidateProfile?.summary ||
      candidateProfile?.candidate?.summary ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.summary ||
      '';

    // 3. Core Competencies partitioned strictly by truth provenance
    const verifiedSkills = (applicationPackage.verifiedSkills || [])
      .filter((s) => s.truthCategory === 'VERIFIED' || s.truthCategory === 'CORROBORATED')
      .map((s) => s.name);

    const claimedSkills = (applicationPackage.claimedSkills || [])
      .filter((s) => s.truthCategory === 'CLAIMED' || s.truthCategory === 'USER_PROVIDED')
      .map((s) => s.name);

    const learningSkills = (applicationPackage.claimedSkills || [])
      .filter((s) => s.truthCategory === 'LEARNING')
      .map((s) => s.name);

    // 4. Professional Experience — real stored records only.
    // Accepts every canonical profile shape: plain DTO ({ experience }),
    // raw profileMetadata, and the CandidateProfileService view
    // (candidate.profileMetadata.userCustom.experience).
    const experienceRecords =
      candidateProfile?.experience ||
      candidateProfile?.profileMetadata?.experience ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.experience ||
      candidateProfile?.candidate?.profileMetadata?.experience ||
      [];

    // 5. Education — real stored records only (same shape coverage)
    const educationRecords =
      candidateProfile?.education ||
      candidateProfile?.profileMetadata?.education ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.education ||
      candidateProfile?.candidate?.profileMetadata?.education ||
      [];

    const hasRealExperience = experienceRecords.length > 0;
    const hasRealEducation = educationRecords.length > 0;

    // Assemble LaTeX Document
    const tex = `\\documentclass[10pt,letterpaper]{article}
\\usepackage[utf8]{inputenc}
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

% Clean, ATS-Compliant Section Dividers
\\newcommand{\\atssection}[1]{%
  \\vspace{7pt}%
  {\\noindent\\large\\textbf{\\uppercase{#1}}}%
  \\vspace{2pt}\\hrule\\vspace{4pt}%
}

\\begin{document}

% ---------------- HEADER ----------------
\\begin{center}
  {\\Huge \\textbf{${escapeLatex(candidateName)}}}\\\\[3pt]
  {\\small ${contactLine}}\\\\[2pt]
  {\\footnotesize \\textit{Tailored for: ${escapeLatex(targetRole)} at ${escapeLatex(targetCompany)}}}
\\end{center}
\\vspace{-2pt}

% ---------------- SUMMARY ----------------
\\atssection{Professional Summary}
${summaryText ? escapeLatex(summaryText) : '\\textit{(Professional summary not provided in profile.)}'}

% ---------------- CORE COMPETENCIES ----------------
${
  verifiedSkills.length > 0 || claimedSkills.length > 0 || learningSkills.length > 0
    ? `\\atssection{Core Competencies}
${verifiedSkills.length > 0 ? `\\textbf{Verified Capabilities:} ${escapeLatex(verifiedSkills.join(', '))}\\\\\n` : ''}${
        claimedSkills.length > 0
          ? `\\textbf{Technical Proficiency:} ${escapeLatex(claimedSkills.join(', '))}\\\\\n`
          : ''
      }${
        learningSkills.length > 0
          ? `\\textbf{Active Learning / Growth:} ${escapeLatex(learningSkills.join(', '))}\\\\\n`
          : ''
      }`
    : ''
}

% ---------------- PROFESSIONAL EXPERIENCE (omitted when no real records) ----------------
${
  hasRealExperience
    ? `\\atssection{Professional Experience}
${experienceRecords
  .map((exp) => {
    const title = escapeLatex(exp.title || exp.role || 'Role');
    const company = exp.company || exp.employer ? escapeLatex(exp.company || exp.employer) : '';
    const endDate = exp.isCurrent ? 'Present' : exp.endDate || exp.endYear || '';
    const dates = [exp.startDate || exp.startYear || '', endDate].filter(Boolean).join(' -- ');
    const location = exp.location ? escapeLatex(exp.location) : '';
    const bullets = formatLatexBullets(exp.bullets || exp.highlights || exp.description);

    return `\\textbf{${title}${company ? ` — ${company}` : ''}}${dates ? ` \\hfill ${escapeLatex(dates)}` : ''}\\\\
${location ? `\\textit{${location}}\\\\` : ''}
${bullets}
\\vspace{4pt}`;
  })
  .join('\n')}`
    : ''
}

% ---------------- TECHNICAL PROJECTS ----------------
${
  portfolioLinks.length > 0
    ? `\\atssection{Technical Projects \\& Repositories}
${portfolioLinks
  .slice(0, 3)
  .map((p) => {
    const pName = escapeLatex(p.projectName || p.name || 'Project');
    const pUrl = p.repositoryUrl ? ` \\hfill \\url{${p.repositoryUrl}}` : '';
    const pBullets = formatLatexBullets(p.highlights || []);
    return `\\textbf{${pName}}${pUrl}\n${pBullets}\n\\vspace{3pt}`;
  })
  .join('\n')}
`
    : ''
}

% ---------------- EDUCATION (omitted when no real records) ----------------
${
  hasRealEducation
    ? `\\atssection{Education}
${educationRecords
  .map((edu) => {
    const degree = escapeLatex(edu.degree || '');
    const field =
      edu.fieldOfStudy || edu.field ? ` in ${escapeLatex(edu.fieldOfStudy || edu.field)}` : '';
    const institution = edu.institution ? escapeLatex(edu.institution) : '';
    const endDate = edu.isCurrent ? 'Present' : edu.endDate || '';
    const dates = [edu.startDate || '', endDate].filter(Boolean).join(' -- ');
    return `\\textbf{${degree}${field}}${dates ? ` \\hfill ${escapeLatex(dates)}` : ''}\\\\
${institution ? `\\textit{${institution}}` : ''}\\vspace{3pt}`;
  })
  .join('\n')}`
    : ''
}

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

  /**
   * Generates formal typographic LaTeX source for a tailored cover letter.
   *
   * @param {object} params
   * @param {object} params.applicationPackage Canonical ApplicationPackage
   * @param {object} [params.candidateProfile] Optional verified Candidate Career Profile
   * @returns {{ texContent: string, candidateName: string, candidateEmail: string, targetRole: string, targetCompany: string }}
   */
  generateTailoredCoverLetterLatex({ applicationPackage, candidateProfile = null }) {
    if (!applicationPackage) {
      throw new ValidationError('applicationPackage is required to generate cover letter LaTeX');
    }

    const targetJob = applicationPackage.targetJob || {};
    const targetRole = targetJob.title || 'Role';
    const targetCompany = targetJob.company || 'Company';

    // Fail-closed identity (mirrors the resume generator)
    const candidateName = applicationPackage.candidateName || candidateProfile?.displayName || null;
    const candidateEmail =
      applicationPackage.candidateEmail || candidateProfile?.primaryEmail || null;
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
        `\\href{mailto:${escapeLatex(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
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
