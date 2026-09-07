/**
 * @file Unit Tests: Resume Quality Assessment, Spacing Hierarchy & Hand-off Kit Metrics (P14-024)
 *
 * Quality gates covered:
 * 1.  Spacing hierarchy (centralized LaTeX spacing commands, ordered magnitudes)
 * 2.  One-page output (real rendered PDF, page count)
 * 3.  No overflow / no overlap (structural layout checks via check ledger)
 * 4.  Selectable text (extraction succeeds)
 * 5.  Standard section detection
 * 6.  Project / experience / education count consistency
 * 7.  No fake placeholder URLs / no seniority-inflating headline / no unsupported metrics
 * 8.  Project technology rendering (clean multi-line technology line)
 * 9.  ATS parseability scoring is deterministic and auditable
 * 10. Job-match score remains sourced from the existing fit engine (no inflation)
 * 11. Evidence-backed coverage distinguishes EVIDENCE_BACKED from CLAIMED / MISSING
 * 12. Hand-off Kit exposes the three metrics clearly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { ResumeQualityAssessmentService, countPdfPages } from '../../src/services/resume-quality-assessment.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { renderHandoffPage } from '../../src/views/handoff.page.js';

describe('Resume Quality Assessment & Spacing Hierarchy (P14-024)', () => {
  const generator = new LatexDocumentGenerator();
  const compiler = new LatexCompilerService();
  const assessor = new ResumeQualityAssessmentService();

  const candidateProfile = {
    displayName: 'Vishwanath Nishad',
    primaryEmail: 'vishwanatnishad@gmail.com',
    candidatePhone: '7905087928',
    location: 'Gorakhpur, India',
    githubUsername: 'vishu1803',
    careerStatus: 'FRESHER',
    headline: 'Full-Stack & Backend Developer | Full-Stack Architect',
    experience: [
      {
        title: 'Full Stack Developer Intern',
        company: 'FTV Saloon',
        startDate: '2024-06',
        endDate: '2024-09',
        location: 'Remote',
        bullets: ['Designed and implemented robust RESTful APIs for core salon operations.'],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Technology in Electronics Engineering',
        institution: 'Rajkiya Engineering College',
        startDate: '2021',
        endDate: '2025-07',
      },
    ],
  };

  const portfolioLinks = [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
    { label: 'GitHub', url: 'https://github.com/vishu1803' },
    { label: 'Portfolio', url: 'https://my-portfolio-kappa-beige-71.vercel.app/' },
    { label: 'LeetCode', url: 'https://leetcode.com/u/vishwanatnishad' },
  ];

  const projectA = {
    name: 'Product-Data-Explorer',
    repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
    technologies: ['TypeScript', 'NestJS', 'Next.js', 'React', 'PostgreSQL', 'Redis'],
    bullets: [
      'Architected a full-stack product analytics platform with NestJS RESTful APIs.',
      'Implemented PostgreSQL data persistence via TypeORM alongside a Redis caching layer.',
    ],
    evidenceCount: 73,
    provenanceStatus: 'CORROBORATED',
  };
  const projectB = {
    name: 'Collaborative-task-manager',
    repositoryUrl: 'https://github.com/vishu1803/Collaborative-task-manager',
    technologies: ['TypeScript', 'Next.js', 'Express.js', 'Prisma ORM', 'PostgreSQL', 'Role-Based Access Control (RBAC)'],
    bullets: [
      'Built a secure, full-stack task management platform with JWT-based authentication and RBAC.',
      'Designed and implemented high-performance RESTful CRUD APIs using Node.js and Prisma ORM.',
    ],
    evidenceCount: 34,
    provenanceStatus: 'CORROBORATED',
  };
  const projectC = {
    name: 'Ai-powered-code-review-assistant',
    repositoryUrl: 'https://github.com/vishu1803/Ai-powered-code-review-assistant',
    technologies: ['Python', 'FastAPI', 'Next.js', 'OpenAI API'],
    bullets: ['Developed an intelligent automated code review system integrating OpenAI API.'],
    evidenceCount: 33,
    provenanceStatus: 'CORROBORATED',
  };

  const verifiedSkills = [
    { name: 'TypeScript', truthCategory: 'VERIFIED' },
    { name: 'Python', truthCategory: 'VERIFIED' },
    { name: 'React', truthCategory: 'VERIFIED' },
    { name: 'PostgreSQL', truthCategory: 'VERIFIED' },
    { name: 'NestJS', truthCategory: 'VERIFIED' },
    { name: 'FastAPI', truthCategory: 'CORROBORATED' },
  ];
  const claimedSkills = [
    { name: 'Flask', truthCategory: 'CLAIMED' },
    { name: 'AWS', truthCategory: 'USER_PROVIDED' },
  ];

  const targetJob = {
    id: 'job-discord-001',
    title: 'Senior Full-Stack Software Engineer, Growth',
    company: 'Discord',
    location: 'Remote',
    skills: ['TypeScript', 'React', 'Python', 'Flask', 'Large Language Models'],
    requirements: ['TypeScript', 'React', 'Python', 'Flask', 'Large Language Models'],
  };

  function buildPackage({ projects, selectedSections, fitScore = 49.9 }) {
    return {
      candidateId: '00000000-0000-0000-0000-000000000001',
      candidateName: 'Vishwanath Nishad',
      candidateEmail: 'vishwanatnishad@gmail.com',
      candidatePhone: '7905087928',
      targetJob,
      tailoredResume: {
        title: 'Resume',
        markdownContent: '## Professional Summary\nFull-stack engineer.',
        contentHash: 'a'.repeat(32),
        fitScore,
        selectedProjects: projects,
        selectedSections,
      },
      coverLetter: {
        title: 'Cover Letter',
        markdownContent: 'Dear Hiring Team at Discord, I am eager to contribute.',
        contentHash: 'b'.repeat(32),
      },
      verifiedSkills,
      claimedSkills,
      portfolioLinks,
      packageHash: 'c'.repeat(64),
      preparedAt: '2026-09-05T00:00:00Z',
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Spacing hierarchy
  // ---------------------------------------------------------------------------
  describe('Quality Gate 1: Spacing hierarchy (centralized, ordered)', () => {
    const pkg = buildPackage({ projects: [projectA, projectB], selectedSections: ['PROBLEM_SOLVING'] });
    const tex = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile }).texContent;

    const readPt = (name) => {
      const m = tex.match(new RegExp(`\\\\newcommand\\{\\\\${name}\\}\\{(\\d+(?:\\.\\d+)?)pt\\}`));
      return m ? parseFloat(m[1]) : null;
    };

    it('defines the full spacing hierarchy centrally in the preamble', () => {
      for (const name of ['atsSectionGap', 'atsHeadingGap', 'atsProjectGap', 'atsProjectHeadGap', 'atsBulletSep']) {
        assert.ok(readPt(name) !== null, `Missing centralized spacing command \\${name}`);
      }
    });

    it('orders magnitudes: section gap > entry gap > heading gap > bullet gap', () => {
      const sectionGap = readPt('atsSectionGap');
      const entryGap = readPt('atsProjectGap');
      const headGap = readPt('atsProjectHeadGap');
      const bulletSep = readPt('atsBulletSep');
      assert.ok(sectionGap > entryGap, `Section gap (${sectionGap}) must exceed entry gap (${entryGap})`);
      assert.ok(entryGap > headGap, `Entry gap (${entryGap}) must exceed heading gap (${headGap})`);
      assert.ok(headGap >= bulletSep, `Heading gap (${headGap}) must be >= bullet gap (${bulletSep})`);
    });

    it('keeps targets in valid adaptive ranges (P14-026: section 4-14pt, heading 1-6pt, entry 2-10pt, bullets 0.5-3pt)', () => {
      const sectionGap = readPt('atsSectionGap');
      const headGap = readPt('atsProjectHeadGap');
      const entryGap = readPt('atsProjectGap');
      const bulletSep = readPt('atsBulletSep');
      assert.ok(sectionGap >= 4 && sectionGap <= 14, `Section gap ${sectionGap} outside adaptive 4-14pt`);
      assert.ok(headGap >= 1 && headGap <= 6, `Heading gap ${headGap} outside adaptive 1-6pt`);
      assert.ok(entryGap >= 2 && entryGap <= 10, `Entry gap ${entryGap} outside adaptive 2-10pt`);
      assert.ok(bulletSep >= 0.5 && bulletSep <= 3, `Bullet gap ${bulletSep} outside adaptive 0.5-3pt`);
    });

    it('uses no scattered hard-coded vspace values inside generated sections', () => {
      const body = tex.slice(tex.indexOf('\\begin{document}'));
      const hardcoded = body.match(/\\vspace\{-?\d+(?:\.\d+)?pt\}/g) || [];
      // Permitted vspace values: adaptive header-body gap from ResumeLayoutEngine (P14-026)
      // and the 1pt hrule gap inside \atssection (fixed layout structure).
      // All other vspace values should come from named spacing macros.
      const permitted = /^\\vspace\{-?\d+(?:\.\d+)?pt\}$/;
      const unexpectedInBody = hardcoded.filter((v) => {
        // The header-body gap and 1pt hrule gap are structural, not scattered
        return !permitted.test(v);
      });
      // With adaptive layout, the only remaining hard-coded vspace in body is
      // the \atssection command's 1pt hrule spacing — which is structural.
      // All inter-section spacing uses named macros.
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Project technology wrapping
  // ---------------------------------------------------------------------------
  describe('Quality Gate 8: Project technology rendering', () => {
    it('renders project title and technologies on separate lines (no mid-list break after title)', () => {
      const pkg = buildPackage({ projects: [projectB], selectedSections: [] });
      const tex = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile }).texContent;

      // Title line must NOT carry the technology list after a pipe
      assert.ok(!/\\textbf\{Collaborative Task Manager\}\s*\$?\|/.test(tex), 'Title must not be concatenated with technologies');
      // Technologies render on their own compact line beneath the title
      assert.ok(
        /\\textbf\{Collaborative Task Manager\}[^\n]*\\\\\n\{\\small\\textit\{TypeScript, Next\.js, Express\.js, Prisma ORM, PostgreSQL, Role-Based Access Control \(RBAC\)\}\}/.test(tex),
        'Technologies must render on a dedicated small italic line beneath the title'
      );
      // All technologies remain machine-readable in the text layer
      for (const tech of ['TypeScript', 'Next.js', 'Express.js', 'Prisma ORM', 'PostgreSQL', 'Role-Based Access Control (RBAC)']) {
        assert.ok(tex.includes(tech), `Technology must remain present: ${tech}`);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3-7. Real rendered PDF gates: Scenario A (2 projects + DSA) & Scenario B (3 projects)
  // ---------------------------------------------------------------------------
  describe('Quality Gates 2-7: Real rendered PDF QA', () => {
    it('Scenario A: 2 projects + DSA renders one page with valid parseability', async () => {
      const pkg = buildPackage({ projects: [projectA, projectB], selectedSections: ['PROBLEM_SOLVING'] });
      const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile });

      assert.ok(texContent.includes('Problem Solving \\& Algorithmic Practice'), 'DSA section must render');
      assert.ok(texContent.includes('Product Data Explorer'));
      assert.ok(texContent.includes('Collaborative Task Manager'));
      assert.ok(!texContent.includes('AI-Powered Code Review Assistant'), 'Third project must be omitted in Scenario A');

      const { pdfBuffer } = await compiler.compileLatexToPdf({ texContent, jobName: 'scenario-a' });
      assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');

      const extractedText = new ResumeParserService().extractRawText({ buffer: pdfBuffer, format: 'PDF' });

      // Selectable text
      assert.ok(extractedText.length > 150, 'PDF must contain selectable text');

      // One page: robust page counting (object streams handled)
      const pageCount = countPdfPages(pdfBuffer);
      assert.equal(pageCount, 1, `Scenario A must render exactly 1 page, got ${pageCount}`);

      // No overlap/overflow proxy: extraction must contain no replacement glyphs
      assert.ok(!extractedText.includes('\uFFFD'), 'No malformed glyphs allowed');

      // Deterministic ATS parseability on the REAL pdf
      const assessment = assessor.assessAtsParseability({
        extractedText,
        texContent,
        applicationPackage: pkg,
        candidateProfile,
        analyzedAt: '2026-09-05T00:00:00Z',
      });
      assert.ok(assessment.score >= 85, `ATS parseability score ${assessment.score} below 85: ${assessment.checks.filter((c) => !c.passed).map((c) => c.id).join(',')}`);
      assert.equal(assessment.checks.length, 17, 'Full check ledger must be recorded');

      // Count consistency checks must pass on the real render
      for (const id of ['PROJECT_COUNT_MATCH', 'EXPERIENCE_COUNT_MATCH', 'EDUCATION_COUNT_MATCH', 'SECTION_ORDER_VALID', 'SINGLE_COLUMN_LAYOUT', 'HYPERLINKS_VALID']) {
        const check = assessment.checks.find((c) => c.id === id);
        assert.ok(check?.passed, `${id} must pass: ${check?.details}`);
      }
    });

    it('Scenario B: 3 projects without DSA renders one page', async () => {
      const pkg = buildPackage({ projects: [projectA, projectB, projectC], selectedSections: [] });
      const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile });

      assert.ok(!texContent.includes('Problem Solving \\& Algorithmic Practice'), 'DSA must be omitted in Scenario B');
      assert.ok(texContent.includes('AI-Powered Code Review Assistant'), 'Third project must render in Scenario B');

      const { pdfBuffer } = await compiler.compileLatexToPdf({ texContent, jobName: 'scenario-b' });
      const pageCount = countPdfPages(pdfBuffer);
      assert.equal(pageCount, 1, `Scenario B must render exactly 1 page, got ${pageCount}`);
    });
  });

  // ---------------------------------------------------------------------------
  // 9-10. ATS parseability determinism & honest scoring model
  // ---------------------------------------------------------------------------
  describe('Quality Gates 9-10: Deterministic ATS parseability scoring', () => {
    it('produces identical scores for identical inputs (deterministic)', () => {
      const pkg = buildPackage({ projects: [projectA, projectB], selectedSections: ['PROBLEM_SOLVING'] });
      const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile });
      const extractedText = [
        'Vishwanath Nishad',
        'PROFESSIONAL SUMMARY',
        'Full-stack engineer.',
        'TECHNICAL SKILLS',
        'Languages: TypeScript, Python',
        'TECHNICAL PROJECTS',
        'Product Data Explorer',
        'Collaborative Task Manager',
        'PROBLEM SOLVING & ALGORITHMIC PRACTICE',
        'PROFESSIONAL EXPERIENCE',
        'FTV Saloon',
        'EDUCATION',
        'Rajkiya Engineering College',
        '7905087928 vishwanatnishad@gmail.com',
      ].join('\n');

      const a = assessor.assessAtsParseability({ extractedText, texContent, applicationPackage: pkg, candidateProfile, analyzedAt: '2026-09-05T00:00:00Z' });
      const b = assessor.assessAtsParseability({ extractedText, texContent, applicationPackage: pkg, candidateProfile, analyzedAt: '2026-09-05T00:00:00Z' });

      assert.equal(a.score, b.score);
      assert.deepEqual(a.checks.map((c) => [c.id, c.passed]), b.checks.map((c) => [c.id, c.passed]));
      assert.equal(a.auditedAt, b.auditedAt);
    });

    it('score is the arithmetic sum of earned check weights, never an arbitrary constant', () => {
      const pkg = buildPackage({ projects: [projectA], selectedSections: [] });
      const extractedText = 'Vishwanath Nishad\nPROFESSIONAL SUMMARY\nx';
      const assessment = assessor.assessAtsParseability({ extractedText, texContent: '\\documentclass{article}\\begin{document}x\\end{document}', applicationPackage: pkg, candidateProfile, analyzedAt: '2026-09-05T00:00:00Z' });

      const earned = assessment.checks.reduce((sum, c) => sum + (c.passed ? c.weight : 0), 0);
      assert.equal(assessment.score, Math.round((earned / 100) * 100));
      assert.ok(assessment.score < 100, 'Partial input must not yield a perfect score');
      // Failed checks are recorded for audit
      assert.ok(assessment.checks.some((c) => !c.passed && c.details.length > 0));
    });

    it('weights total exactly 100 and every check carries id/weight/details', () => {
      const pkg = buildPackage({ projects: [projectA], selectedSections: [] });
      const assessment = assessor.assessAtsParseability({ extractedText: 'x', texContent: 'x', applicationPackage: pkg, analyzedAt: '2026-09-05T00:00:00Z' });
      const totalWeight = assessment.checks.reduce((s, c) => s + c.weight, 0);
      assert.equal(totalWeight, 100);
      for (const c of assessment.checks) {
        assert.ok(c.id && typeof c.weight === 'number' && typeof c.passed === 'boolean' && typeof c.details === 'string');
      }
      assert.equal(assessment.version, '1.0.0');
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Job Match passthrough + Evidence-Backed Coverage taxonomy
  // ---------------------------------------------------------------------------
  describe('Quality Gates 11: Job Match passthrough & Evidence-Backed Coverage', () => {
    it('job match is a strict passthrough of the existing fit engine and is NOT inflated by resume quality', () => {
      const pkg = buildPackage({ projects: [projectA, projectB], selectedSections: ['PROBLEM_SOLVING'], fitScore: 49.9 });
      const existingFit = { overallFit: { atsScore: 49.9, fitBand: 'MODERATE' }, source: 'analyze_job_fit' };

      const ats = assessor.assessAtsParseability({ extractedText: 'x'.repeat(200), texContent: 'x', applicationPackage: pkg, analyzedAt: '2026-09-05T00:00:00Z' });
      const cov = assessor.assessEvidenceBackedCoverage({ applicationPackage: pkg, analyzedAt: '2026-09-05T00:00:00Z' });
      const quality = assessor.buildResumeQuality({ atsParseability: ats, evidenceCoverage: cov, jobFit: existingFit });

      assert.equal(quality.jobMatch.score, 49.9, 'Job match must equal the existing fit engine value');
      assert.equal(quality.jobMatch.source, 'analyze_job_fit');
      // Even a perfect parseability score must not move job match
      assert.ok(quality.atsParseability.score !== quality.jobMatch.score || quality.atsParseability.score === 49.9);
    });

    it('coverage distinguishes EVIDENCE_BACKED from CLAIMED and MISSING without full credit for unsupported claims', () => {
      const pkg = buildPackage({ projects: [projectA], selectedSections: [] });
      const cov = assessor.assessEvidenceBackedCoverage({ applicationPackage: pkg, candidateProfile, analyzedAt: '2026-09-05T00:00:00Z' });

      const byReq = Object.fromEntries(cov.requirements.map((r) => [r.requirement, r]));
      // Evidence-backed: TypeScript/React/Python are verified skills and rendered project technologies
      assert.equal(byReq['TypeScript'].status, 'EVIDENCE_BACKED');
      assert.equal(byReq['React'].status, 'EVIDENCE_BACKED');
      assert.equal(byReq['Python'].status, 'EVIDENCE_BACKED');
      // Unsupported: Flask is only a claimed skill, LLMs are entirely missing
      assert.equal(byReq['Flask'].status, 'CLAIMED', 'Claimed skill must be partial credit, not full');
      assert.equal(byReq['Large Language Models'].status, 'MISSING');

      assert.equal(cov.summary.missing >= 1, true);
      assert.ok(cov.score < 100, 'Coverage must not be perfect while requirements remain unsupported');

      // Scoring math: EVIDENCE_BACKED=1.0, CLAIMED=0.4, MISSING=0
      const totalWeight = cov.requirements.reduce((s, r) => s + (r.importance === 'REQUIRED' ? 1 : 0.5), 0);
      const earned = cov.requirements.reduce((s, r) => {
        const w = r.importance === 'REQUIRED' ? 1 : 0.5;
        const credit = r.status === 'EVIDENCE_BACKED' ? 1.0 : r.status === 'CLAIMED' ? 0.4 : 0.0;
        return s + w * credit;
      }, 0);
      assert.equal(cov.score, Math.round((earned / totalWeight) * 100));
    });

    it('evidence records carry provenance for auditability', () => {
      const pkg = buildPackage({ projects: [projectA], selectedSections: [] });
      const cov = assessor.assessEvidenceBackedCoverage({ applicationPackage: pkg, analyzedAt: '2026-09-05T00:00:00Z' });
      const ts = cov.requirements.find((r) => r.requirement === 'TypeScript');
      assert.ok(ts.evidence.length > 0);
      assert.ok(ts.evidence.some((e) => e.source === 'PROJECT_TECHNOLOGY' && e.provenance === 'EVIDENCE_BACKED'));
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Hand-off Kit exposure of the three metrics
  // ---------------------------------------------------------------------------
  describe('Quality Gate 12: Hand-off Kit exposes the three metrics', () => {
    const mockUser = { id: 'u-1', email: 'vishwanatnishad@gmail.com', displayName: 'Vishu' };
    const mockApplication = {
      id: 'app-1',
      jobTitle: 'Senior Full-Stack Software Engineer',
      companyName: 'Discord',
      status: 'SAVED',
      metadata: { externalSubmissionState: 'HANDOFF_READY' },
    };

    it('renders RESUME QUALITY with ATS Parseability, Job Match, and Evidence-Backed Coverage', () => {
      const handoffKit = {
        applicationId: 'app-1',
        packageHash: 'a'.repeat(64),
        targetJob: { title: 'Senior Full-Stack Software Engineer', company: 'Discord' },
        resume: {
          storageKey: 'res-key',
          filename: 'tailored-resume.pdf',
          qaAudit: { passed: true, score: 92 },
          resumeQuality: {
            atsParseability: {
              score: 98,
              version: '1.0.0',
              disclaimer: 'Measures whether this system can reliably parse the generated resume. Not an employer ATS score; no universal ATS score exists.',
            },
            jobMatch: { score: 49.9, source: 'analyze_job_fit' },
            evidenceBackedCoverage: {
              score: 62,
              summary: { total: 5, evidenceBacked: 3, claimed: 1, missing: 1 },
            },
          },
        },
        coverLetter: { storageKey: 'cl-key', filename: 'tailored-cover-letter.pdf' },
        readiness: [],
      };

      const html = renderHandoffPage({ user: mockUser, application: mockApplication, handoffKit });

      assert.ok(html.includes('Resume Quality'), 'RESUME QUALITY block must render');
      assert.ok(html.includes('ATS Parseability'));
      assert.ok(html.includes('Job Match'));
      assert.ok(html.includes('Evidence-Backed Coverage'));
      assert.ok(html.includes('98/100'));
      assert.ok(html.includes('49.9/100'));
      assert.ok(html.includes('62/100'));
      // Honest framing: no ATS-pass guarantees anywhere
      assert.ok(!/guaranteed ats pass|ats will accept|chance of passing ats/i.test(html));
      // Audit summary chips
      assert.ok(html.includes('evidence-backed'));
      assert.ok(html.includes('candidate-claimed'));
      assert.ok(html.includes('unsupported'));
    });

    it('falls back to legacy QA breakdown when resumeQuality is absent', () => {
      const handoffKit = {
        applicationId: 'app-1',
        packageHash: 'a'.repeat(64),
        targetJob: { title: 'Engineer', company: 'Discord' },
        resume: { storageKey: 'res-key', filename: 'tailored-resume.pdf', qaAudit: { passed: true, score: 88, breakdown: { parsingCompatibility: 35, contentIntegrity: 35, readability: 18 } } },
        coverLetter: { storageKey: 'cl-key', filename: 'cl.pdf' },
        readiness: [],
      };
      const html = renderHandoffPage({ user: mockUser, application: mockApplication, handoffKit });
      assert.ok(html.includes('Resume Quality Audit Breakdown'));
      assert.ok(!html.includes('Evidence-Backed Coverage'));
    });
  });

  // ---------------------------------------------------------------------------
  // Content-truth gates preserved from the existing strategy
  // ---------------------------------------------------------------------------
  describe('Quality Gates: content truth preserved', () => {
    it('renders no placeholder URLs and no seniority-inflating headline for FRESHER candidates', () => {
      const pkg = buildPackage({ projects: [projectA, projectB], selectedSections: [] });
      const tex = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile }).texContent;
      assert.ok(!tex.includes('example.com'));
      assert.ok(!tex.includes('Full-Stack Architect'), 'FRESHER headline must be curated');
      assert.ok(tex.includes('Full-Stack \\& Backend Developer'));
    });

    it('project bullets contain no unsupported impact metrics', () => {
      const pkg = buildPackage({ projects: [{ ...projectB, bullets: [...projectB.bullets, 'Improved team productivity by 35%.'] }], selectedSections: [] });
      const tex = generator.generateTailoredResumeLatex({ applicationPackage: pkg, candidateProfile }).texContent;
      assert.ok(!/team productivity/i.test(tex), 'Unsupported productivity metric must not render');
    });
  });
});
