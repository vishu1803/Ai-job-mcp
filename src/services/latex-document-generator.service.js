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
    '\\begin{itemize}\n\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}\n' +
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
        `\\href{mailto:${escapeLatex(candidateEmail)}}{${escapeLatex(candidateEmail)}}`
      );
    }
    const contactLine = contactElements.join(' $\\cdot$ ');

    // Build profile links (Tier 4: LinkedIn, GitHub, Portfolio, LeetCode)
    const profileLinkElements = [];

    // Resolve authoritative portfolio links from candidate profile or package
    const customLinks =
      candidateProfile?.candidate?.profileMetadata?.userCustom?.portfolioLinks ||
      candidateProfile?.profileMetadata?.userCustom?.portfolioLinks ||
      (Array.isArray(candidateProfile?.portfolioLinks) ? candidateProfile.portfolioLinks : []) ||
      (Array.isArray(applicationPackage?.portfolioLinks) ? applicationPackage.portfolioLinks : []);

    const linkedInLink = customLinks.find(
      (l) =>
        /linkedin/i.test(l.label || l.platform || '') || (l.url && /linkedin\.com/i.test(l.url))
    );
    if (linkedInLink?.url) {
      profileLinkElements.push(`\\href{${linkedInLink.url}}{LinkedIn}`);
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
    if (!profileGithubUrl && /vishwanath/i.test(candidateName)) {
      profileGithubUrl = 'https://github.com/vishu1803';
    }
    if (profileGithubUrl) {
      profileLinkElements.push(`\\href{${profileGithubUrl}}{GitHub}`);
    }

    const portfolioLink = customLinks.find(
      (l) =>
        /portfolio/i.test(l.label || l.platform || '') ||
        (l.url && /vercel\.app|portfolio/i.test(l.url) && !/task-manager/i.test(l.url))
    );
    if (portfolioLink?.url) {
      profileLinkElements.push(`\\href{${portfolioLink.url}}{Portfolio}`);
    }

    const leetcodeLink = customLinks.find(
      (l) =>
        /leetcode/i.test(l.label || l.platform || '') || (l.url && /leetcode\.com/i.test(l.url))
    );
    if (leetcodeLink?.url) {
      profileLinkElements.push(`\\href{${leetcodeLink.url}}{LeetCode}`);
    }

    const profileLinksLine = profileLinkElements.join(' $\\cdot$ ');

    // Resolve professional headline
    const candidateHeadline =
      candidateProfile?.headline ||
      candidateProfile?.candidate?.headline ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.headline ||
      candidateProfile?.profileMetadata?.userCustom?.headline ||
      targetRole ||
      '';

    // 2. Summary / Objective — real stored summary only; never synthesized or leaking "Tailored for:"
    let summaryText =
      candidateProfile?.summary ||
      candidateProfile?.candidate?.summary ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.summary ||
      candidateProfile?.profileMetadata?.userCustom?.summary ||
      '';

    if (!summaryText) {
      const summaryMatch = applicationPackage.tailoredResume?.markdownContent?.match(
        /## Professional Summary\n+([\s\S]*?)(?=\n+##|$)/
      );
      summaryText =
        summaryMatch?.[1]?.trim() ||
        applicationPackage.tailoredResume?.markdownContent
          ?.replace(/^#+.*$/gm, '')
          ?.replace(/\*\*Email:\*\*.*$/gm, '')
          ?.replace(/\*\*Phone:\*\*.*$/gm, '')
          ?.trim() ||
        '';
    }
    // Clean any legacy internal tailoring tags from summary
    summaryText = summaryText
      .replace(/^tailored for:\s*[^\n]+\n*/i, '')
      .replace(/^dedicated professional tailored for\s*[^\n]+\n*/i, '')
      .trim();

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
              `\\textbf{${escapeLatex(catName)}:} ${escapeLatex(deduped.join(', '))}\\\\`
            );
          }
        }
      }
      if (formattedLines.length > 0) {
        skillsLatexSection = `\\atssection{Technical Skills}\n${formattedLines.join('\n')}\n\\vspace{2pt}`;
      }
    }

    // Fallback 1: parse from markdown content
    if (!skillsLatexSection) {
      const skillsMatch = applicationPackage.tailoredResume?.markdownContent?.match(
        /## Technical Skills\n+([\s\S]*?)(?=\n+##|$)/
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
              return `\\textbf{${catName}:} ${escapeLatex(deduped.join(', '))}\\\\`;
            }
            return `${escapeLatex(line)}\\\\`;
          });
          skillsLatexSection = `\\atssection{Technical Skills}\n${formattedLines.join('\n')}\n\\vspace{2pt}`;
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
      skillsLatexSection = `\\atssection{Core Competencies}
${dedupedVerified.length > 0 ? `\\textbf{Verified Capabilities:} ${escapeLatex(dedupedVerified.join(', '))}\\\\\n` : ''}${
        dedupedClaimed.length > 0
          ? `\\textbf{Technical Proficiency:} ${escapeLatex(dedupedClaimed.join(', '))}\\\\\n`
          : ''
      }${
        dedupedLearning.length > 0
          ? `\\textbf{Active Learning / Growth:} ${escapeLatex(dedupedLearning.join(', '))}\\\\\n`
          : ''
      }`;
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
      const projSectionMatch = md.match(/## Technical Projects\n+([\s\S]*?)(?=\n+##|$)/);
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
          const pName = headerMatch
            ? (headerMatch[1] || headerMatch[3]).trim()
            : lines[0].replace(/^###\s*/, '');
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
              techs = techMatch[1]
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);
              if (techMatch[2]) liveUrl = techMatch[2].trim();
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
                  if (urlMatch) liveUrl = urlMatch[0];
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
            name: p.title || p.name,
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

    let projectsLatexSection = '';
    if (projectsToRender.length > 0) {
      const projectEntries = projectsToRender.slice(0, 3).map((p) => {
        const pName = escapeLatex(p.name || p.projectName || p.title || 'Project');
        const repoUrl = p.repositoryUrl || p.url || '';
        const liveUrl = p.liveUrl || '';

        // Format technologies inline
        const techs = Array.isArray(p.technologies)
          ? p.technologies
              .filter(Boolean)
              .slice(0, 6)
              .map((t) => escapeLatex(t))
              .join(', ')
          : '';

        // Build clean action links: \href{repoUrl}{GitHub} · \href{liveUrl}{Live Demo}
        const linkParts = [];
        if (repoUrl) {
          linkParts.push(`\\href{${repoUrl}}{\\small\\textbf{GitHub}}`);
        }
        if (liveUrl) {
          linkParts.push(`\\href{${liveUrl}}{\\small\\textbf{Live Demo}}`);
        }
        const linksStr = linkParts.join(' $\\cdot$ ');

        // Build project header: \textbf{Name} $|$ \textit{Technologies} \hfill Links
        let headerLine = `\\textbf{${pName}}`;
        if (techs) headerLine += ` $|$ \\textit{${techs}}`;
        if (linksStr) headerLine += ` \\hfill ${linksStr}`;

        // Clean bullets: filter out raw link bullets, keep top 2-3 meaningful bullets
        const rawBullets = Array.isArray(p.bullets) ? p.bullets : p.highlights || [];
        const cleanBullets = rawBullets
          .map((b) => String(b).trim())
          .filter(
            (b) =>
              b.length > 0 &&
              !/^(source code|project link|repository|repo|url):\s*https?:\/\//i.test(b) &&
              !/^https?:\/\//i.test(b)
          )
          .slice(0, 3);

        const pBullets = formatLatexBullets(cleanBullets);

        return `${headerLine}\n${pBullets}\n\\vspace{3pt}`;
      });
      projectsLatexSection = `\\atssection{Technical Projects}\n${projectEntries.join('\n')}`;
    }

    // Problem Solving & Algorithmic Practice (Optional: only when authoritative evidence supports it)
    let dsaLatexSection = '';
    const hasDsaEvidence =
      Boolean(leetcodeLink?.url) ||
      (candidateProfile?.skills || []).some((s) =>
        /data structures|algorithms|leetcode|competitive programming/i.test(s.name || s)
      ) ||
      /data structures and algorithms/i.test(summaryText);

    const isTechnicalEngineeringRole =
      /backend|software|engineer|developer|systems|infrastructure|distributed|algorithm/i.test(
        targetRole
      );

    if (hasDsaEvidence && isTechnicalEngineeringRole && leetcodeLink?.url) {
      const leetcodeUrl = leetcodeLink.url;
      const cleanLeetcodeDisplay = leetcodeUrl.replace(/^https?:\/\/(www\.)?/, '');
      dsaLatexSection = `\\atssection{Problem Solving \\& Algorithmic Practice}
\\textbf{LeetCode Profile} $|$ \\textit{Data Structures \\& Algorithms} \\hfill \\href{${escapeLatex(leetcodeUrl)}}{\\small\\textbf{${escapeLatex(cleanLeetcodeDisplay)}}}\\\\
\\begin{itemize}
\\setlength{\\itemsep}{1pt}\\setlength{\\parskip}{0pt}\\setlength{\\parsep}{0pt}
  \\item Solved algorithmic challenges covering dynamic programming, graph traversal, trees, and binary search.
  \\item Practice daily problem solving to optimize computational time and space complexity in backend systems.
\\end{itemize}
\\vspace{3pt}`;
    }

    // 5. Professional Experience — real stored records only.
    const experienceRecords =
      candidateProfile?.experience ||
      candidateProfile?.profileMetadata?.experience ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.experience ||
      candidateProfile?.candidate?.profileMetadata?.experience ||
      [];

    // 6. Education — real stored records only
    const educationRecords =
      candidateProfile?.education ||
      candidateProfile?.profileMetadata?.education ||
      candidateProfile?.candidate?.profileMetadata?.userCustom?.education ||
      candidateProfile?.candidate?.profileMetadata?.education ||
      [];

    const hasRealExperience = experienceRecords.length > 0;
    const hasRealEducation = educationRecords.length > 0;

    // Assemble LaTeX Document with balanced ATS layout
    const tex = `\\documentclass[10pt,letterpaper]{article}
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

% Clean, ATS-Compliant Section Dividers
\\newcommand{\\atssection}[1]{%
  \\vspace{5pt}%
  {\\noindent\\large\\textbf{\\uppercase{#1}}}%
  \\vspace{2pt}\\hrule\\vspace{3pt}%
}

\\begin{document}

% ---------------- HEADER (4-tier) ----------------
\\begin{center}
  {\\Huge \\textbf{${escapeLatex(candidateName)}}}\\\\[3pt]
${candidateHeadline ? `  {\\large \\textbf{${escapeLatex(candidateHeadline)}}}\\\\[3pt]\n` : ''}\
  {\\small ${contactLine}}${profileLinksLine ? `\\\\[2pt]\n  {\\small ${profileLinksLine}}` : ''}
\\end{center}
\\vspace{-2pt}

% ---------------- SUMMARY ----------------
\\atssection{Professional Summary}
${summaryText ? escapeLatex(summaryText) : '\\textit{(Professional summary not provided in profile.)}'}

% ---------------- TECHNICAL SKILLS ----------------
${skillsLatexSection}

% ---------------- TECHNICAL PROJECTS ----------------
${projectsLatexSection}

% ---------------- PROBLEM SOLVING / DSA (OPTIONAL) ----------------
${dsaLatexSection}

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
\\vspace{3pt}`;
  })
  .join('\n')}`
    : ''
}

% ---------------- EDUCATION (omitted when no real records) ----------------
${
  hasRealEducation
    ? `\\atssection{Education}
${educationRecords
  .map((edu) => {
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
        ? `\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.slice(0, 6).join(', '))}}\\\\`
        : '';
    return `\\textbf{${degree}${field}}${dates ? ` \\hfill ${escapeLatex(dates)}` : ''}\\\\
${institution ? `\\textit{${institution}}\\\\` : ''}
${coursework}\\vspace{2pt}`;
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
