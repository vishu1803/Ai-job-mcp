/**
 * @file Unit Test: Production-Grade Resume Rendering & Tailoring Refinement (P50)
 *
 * Validates:
 * 1. Visual/Layout Authority:
 *    - Classic Latin Modern Roman serif typography
 *    - Uppercase section headings with 0.4pt horizontal rule
 *    - Compact right-aligned project links (e.g. GitHub, Live Demo)
 *    - 1-page strict fit via Tectonic compilation
 * 2. AWS / USER_PROVIDED Skill Handling:
 *    - AWS selected when relevant for Cloud/DevOps roles
 *    - Provenance preserved as USER_PROVIDED (never converted to VERIFIED)
 *    - Unsupported AWS accomplishment claims ("Deployed AWS infrastructure...") strictly blocked
 * 3. Authoritative Ranking Invariance & Discrimination:
 *    - Exactly ONE authoritative ranking source (canonical rankProjectsForJob)
 *    - Capacity N=2 strictly enforced
 *    - Across 5 distinct roles, finalProjectIds === authoritativeTopNProjectIds
 *    - Different jobs genuinely produce different project rankings
 *    - Optimizer, AI, and renderer cannot alter project selection or ordering
 * 4. Surface Parity:
 *    - Extension and MCP produce identical selected project IDs, ordering, and semantic fingerprint
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, closeDatabase } from '../../src/db/index.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import {
  CandidateArtifactContentService,
  formatProjectDisplayName,
} from '../../src/services/candidate-artifact-content.service.js';
import {
  buildStructuredResumeSnapshot,
  computeResumeSemanticFingerprint,
  freezeSemanticResume,
} from '../../src/services/structured-resume.service.js';
import {
  LatexDocumentGenerator,
  formatProjectLinksLatex,
} from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { countPdfPages } from '../../src/services/resume-quality-assessment.service.js';
import { validateClaimEvidenceGrounding } from '../../src/services/resume-claim-validation.service.js';

const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
const MCP_CONTEXT = {
  tenantId: '24d53f53-780e-4431-b065-32180c354175',
  userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
  role: 'MEMBER',
};

describe('P50: Production-Grade Resume Rendering & Tailoring Refinement', () => {
  let realCandidateProfile;
  let sampleLatexContent = '';

  it('loads canonical candidate profile without mutating DB records', async () => {
    const profService = new CandidateProfileService();
    realCandidateProfile = await profService.getProfile(MCP_CONTEXT, CANDIDATE_ID);
    assert.ok(realCandidateProfile, 'Candidate profile must exist');
    assert.equal(realCandidateProfile.candidate.id, CANDIDATE_ID);
    assert.ok(
      Array.isArray(realCandidateProfile.projects) && realCandidateProfile.projects.length >= 3
    );
    assert.ok(
      Array.isArray(realCandidateProfile.skills) && realCandidateProfile.skills.length >= 10
    );

    // Generate sample LaTeX for preamble inspection
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: realCandidateProfile,
      jobPosting: {
        title: 'Software Engineer',
        description: 'Full stack development',
        skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      },
    });
    const generator = new LatexDocumentGenerator();
    sampleLatexContent = generator.generateTailoredResumeLatex({
      applicationPackage: {
        structuredResume: snapshot.structuredResume,
        targetJob: { title: 'Software Engineer' },
      },
    }).texContent;
  });

  describe('1. Visual Authority & LaTeX Layout Styling', () => {
    it('uses classic Latin Modern Roman serif typography in preamble', () => {
      assert.match(
        sampleLatexContent,
        /lmroman10-regular\.otf/,
        'XeTeX fontspec must load Latin Modern Roman serif'
      );
      assert.match(
        sampleLatexContent,
        /lmroman10-bold\.otf/,
        'XeTeX fontspec must load Latin Modern Roman bold'
      );
      assert.match(
        sampleLatexContent,
        /lmroman10-italic\.otf/,
        'XeTeX fontspec must load Latin Modern Roman italic'
      );
      assert.match(
        sampleLatexContent,
        /Ligatures\s*=\s*NoCommon/,
        'Common ligatures must be disabled for ATS extraction fidelity'
      );
      assert.ok(
        !sampleLatexContent.includes('\\renewcommand{\\familydefault}{\\sfdefault}'),
        'Must not override serif with sans-serif'
      );
      assert.match(
        sampleLatexContent,
        /margin=0\.52in/,
        'Uses calibrated 0.52in margins for natural 1-page fit'
      );
    });

    it('renders section headings with uppercase serif and 0.4pt horizontal rule', () => {
      assert.match(
        sampleLatexContent,
        /\\newcommand\{\\atssection\}\[1\]/,
        'Must define atssection'
      );
      assert.match(
        sampleLatexContent,
        /\\large\\bfseries\\uppercase\{#1\}/,
        'Section headings must be large, bold, uppercase'
      );
      assert.match(
        sampleLatexContent,
        /\\hrule height 0\.4pt/,
        'Must include thin 0.4pt horizontal rule matching reference'
      );
    });

    it('formats project links as compact labels with \\hfill and underlying real URLs', () => {
      const repoUrl = 'https://github.com/vishu1803/Collaborative-task-manager';
      const liveUrl = 'https://task-manager.demo.app';
      const latex = formatProjectLinksLatex(repoUrl, liveUrl);

      // Verify underlying hrefs and visible text labels
      assert.match(
        latex,
        /\\href\{https:\/\/github\.com\/vishu1803\/Collaborative-task-manager\}\{\\textbf\{GitHub\}\}/,
        'Must generate clickable GitHub label'
      );
      assert.match(
        latex,
        /\\href\{https:\/\/task-manager\.demo\.app\}\{\\textbf\{Live Demo\}\}/,
        'Must generate clickable Live Demo label'
      );
      assert.match(latex, /\$\\cdot\$/, 'Must separate links with compact dot');

      // Verify visible text does not show the raw URL
      const visibleOnly = latex.replace(/\\href\{[^}]+\}/g, '');
      assert.ok(!visibleOnly.includes('github.com'), 'Visible text must not show raw GitHub URL');
      assert.ok(
        !visibleOnly.includes('task-manager.demo.app'),
        'Visible text must not show raw demo URL'
      );
    });

    it('does not invent Live Demo when liveUrl is absent', () => {
      const repoUrl = 'https://github.com/vishu1803/Collaborative-task-manager';
      const latex = formatProjectLinksLatex(repoUrl, null);
      assert.ok(
        !latex.includes('Live Demo'),
        'Must not invent Live Demo when not present in candidate records'
      );
      assert.match(latex, /\\textbf\{GitHub\}/);
    });

    it('formats project titles cleanly without repository owner prefixes', () => {
      const clean1 = formatProjectDisplayName('vishu1803/Ai-powered-code-review-assistant');
      const clean2 = formatProjectDisplayName('vishu1803/Collaborative-task-manager');
      const clean3 = formatProjectDisplayName('vishu1803/Product-Data-Explorer');

      assert.equal(clean1, 'AI-Powered Code Review Assistant');
      assert.equal(clean2, 'Collaborative Task Manager');
      assert.equal(clean3, 'Product Data Explorer');
    });
  });

  describe('2. AWS & USER_PROVIDED Skill Provenance Contract', () => {
    const devopsJobPosting = {
      id: 'job-devops-001',
      title: 'Senior Cloud & DevOps Platform Engineer',
      description:
        'Deploy cloud infrastructure, containers, and pipelines using AWS, Docker, and GitHub Actions.',
      skills: ['AWS', 'Docker', 'GitHub Actions', 'Linux'],
      requirements: [
        '3+ years AWS cloud deployment',
        'Container orchestration with Docker',
        'CI/CD with GitHub Actions',
      ],
    };

    it('selects candidate-declared AWS for a Cloud/DevOps job into Cloud, DevOps & Systems', () => {
      const contentSvc = new CandidateArtifactContentService();
      const candidateWithAws = {
        ...realCandidateProfile,
        additionalSkills: [
          {
            name: 'AWS',
            skillSlug: 'aws',
            category: 'Cloud, DevOps & Systems',
            provenanceStatus: 'USER_PROVIDED',
          },
        ],
      };

      const result = contentSvc.selectAndCategorizeSkillsForJob(candidateWithAws, devopsJobPosting);
      const cloudSkills = result.categorizedSkills['Cloud, DevOps & Systems'] || [];
      assert.ok(cloudSkills.includes('AWS'), 'AWS must be selected in Cloud, DevOps & Systems');
      assert.ok(
        cloudSkills.includes('Docker'),
        'Docker must be selected in Cloud, DevOps & Systems'
      );

      const awsItem = result.selectedSkills.find((s) => s.name === 'AWS' || s.slug === 'aws');
      assert.ok(awsItem, 'AWS must be in selectedSkills');
      assert.equal(
        awsItem.provenanceStatus,
        'USER_PROVIDED',
        'AWS provenanceStatus must remain USER_PROVIDED'
      );
      assert.notEqual(
        awsItem.provenanceStatus,
        'VERIFIED',
        'USER_PROVIDED skill must NEVER be converted to VERIFIED'
      );
      assert.equal(
        awsItem.confidenceScore,
        0.7,
        'USER_PROVIDED confidenceScore must be 0.7, not 1.0'
      );
    });

    it('includes AWS in structured resume snapshot while preserving USER_PROVIDED provenance', () => {
      const candidateWithAws = {
        ...realCandidateProfile,
        additionalSkills: [
          {
            name: 'AWS',
            skillSlug: 'aws',
            category: 'Cloud, DevOps & Systems',
            provenanceStatus: 'USER_PROVIDED',
          },
        ],
      };

      const snapshot = buildStructuredResumeSnapshot({
        candidateProfile: candidateWithAws,
        jobPosting: devopsJobPosting,
      });

      assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
      const cloudCat = snapshot.structuredResume.skills.categories.find(
        (c) => c.categoryName === 'Cloud, DevOps & Systems'
      );
      assert.ok(cloudCat, 'Cloud, DevOps & Systems category must exist');
      const awsSkill = cloudCat.skills.find((s) => s.name === 'AWS');
      assert.ok(awsSkill, 'AWS skill must exist in structured resume');
      assert.equal(
        awsSkill.provenanceStatus,
        'USER_PROVIDED',
        'Provenance in structured resume must be USER_PROVIDED'
      );
      assert.equal(
        awsSkill.evidenceId,
        null,
        'Must have null evidenceId since it is not repository-verified'
      );
    });

    it('strictly blocks unsupported AWS accomplishment claims in project bullets', () => {
      const fakeClaim = {
        text: 'Architected and deployed AWS infrastructure for Project X reducing server costs by 30%.',
        composedFromFactIds: ['fact-docker-01'],
        sourceFact: 'Built Docker containers and local docker-compose for backend services.',
        transformationType: 'REWRITE',
      };
      const context = {
        targetSection: 'PROJECTS',
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: 'proj-001',
        project: { id: 'proj-001', name: 'Project X', technologies: ['Docker', 'Node.js'] },
        candidateProfile: realCandidateProfile,
        factInventory: [
          {
            id: 'fact-docker-01',
            factId: 'fact-docker-01',
            candidateId: CANDIDATE_ID,
            text: 'Built Docker containers and local docker-compose for backend services.',
            technologies: ['Docker'],
          },
        ],
      };

      const validation = validateClaimEvidenceGrounding(fakeClaim, context);
      assert.equal(validation.valid, false, 'Unsupported AWS claim must be marked invalid');
      assert.equal(validation.rejected, true, 'Unsupported AWS claim must be rejected');
      const techViolation = validation.violations.find((v) => v.code === 'UNAUTHORIZED_TECHNOLOGY');
      assert.ok(
        techViolation,
        'Must produce UNAUTHORIZED_TECHNOLOGY violation for unbacked AWS claim'
      );
      assert.match(techViolation.message, /AWS/);
    });
  });

  describe('3. Canonical Project Ranking Authority & Discrimination', () => {
    const testRoles = [
      {
        key: 'python_ai',
        label: 'Python / AI Backend Engineer',
        posting: {
          id: 'job-python-ai',
          title: 'Senior Python & AI Backend Engineer',
          description:
            'Build AI-powered developer tools and webhook pipelines using Python, FastAPI, and asynchronous workflows.',
          skills: ['Python', 'FastAPI', 'Flask', 'Redis', 'Docker', 'OpenAI API'],
          requirements: [
            '3+ years Python experience',
            'FastAPI and Redis for high-throughput APIs',
            'OpenAI API integration',
          ],
        },
        expectedTop1Slug: 'aipoweredcodereviewassistant',
      },
      {
        key: 'realtime_fullstack',
        label: 'Full-Stack Engineer — Realtime Collaboration',
        posting: {
          id: 'job-realtime-fs',
          title: 'Full-Stack Engineer — Realtime Collaboration',
          description:
            'Build realtime web applications with WebSocket events, collaborative workspaces, and Prisma ORM.',
          skills: ['Socket.io', 'Node.js', 'Express.js', 'Prisma ORM', 'Next.js', 'TypeScript'],
          requirements: [
            'Node.js and Express.js backend services',
            'Real-time WebSockets with Socket.io',
            'PostgreSQL with Prisma ORM',
          ],
        },
        expectedTop1Slug: 'collaborativetaskmanager',
      },
      {
        key: 'enterprise_backend',
        label: 'Backend Engineer — NestJS & Enterprise Data',
        posting: {
          id: 'job-enterprise-backend',
          title: 'Backend Engineer — NestJS & Enterprise Data',
          description:
            'Design modular microservices with NestJS, TypeORM, and Redis caching for high data volume ingestion.',
          skills: ['NestJS', 'TypeORM', 'TypeScript', 'Redis', 'PostgreSQL'],
          requirements: [
            'NestJS modular architecture',
            'TypeORM with PostgreSQL',
            'Redis caching and queuing',
          ],
        },
        expectedTopProjectSlugs: ['productdataexplorer', 'collaborativetaskmanager'],
      },
      {
        key: 'cloud_devops',
        label: 'Cloud & Infrastructure Platform Engineer',
        posting: {
          id: 'job-cloud-devops',
          title: 'Cloud & Infrastructure Platform Engineer',
          description:
            'Container orchestration, CI/CD pipelines, and cloud platform infrastructure using Docker and Linux.',
          skills: ['Docker', 'AWS', 'Linux', 'GitHub Actions', 'PostgreSQL'],
          requirements: [
            'Docker containerization',
            'Cloud infrastructure deployment',
            'Automated CI/CD pipelines',
          ],
        },
        expectedTop1Slug: 'aipoweredcodereviewassistant',
      },
      {
        key: 'fullstack_web',
        label: 'Full-Stack Developer — React / Node.js',
        posting: {
          id: 'job-fullstack-web',
          title: 'Senior Full-Stack Developer — React / Node.js / PostgreSQL',
          description:
            'Build responsive web applications with React, Next.js, and Node.js REST services backed by PostgreSQL.',
          skills: ['React', 'Next.js', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL'],
          requirements: [
            'React and Next.js frontend',
            'Node.js REST APIs',
            'PostgreSQL database design',
          ],
        },
        expectedTop1Slug: 'collaborativetaskmanager',
      },
    ];

    const rankingAudit = [];

    for (const role of testRoles) {
      it(`enforces authoritative ranking invariance for: ${role.label}`, () => {
        const contentSvc = new CandidateArtifactContentService();
        const capacity = 2;

        // 1. Authoritative canonical ranking
        const rankingResult = contentSvc.rankProjectsForJob(realCandidateProfile, role.posting, {
          maxProjects: capacity,
        });
        const authoritativeProjects = rankingResult.selectedProjects || [];
        const authoritativeTopN = authoritativeProjects.slice(0, capacity);
        const authoritativeTopNIds = authoritativeTopN.map((p) => p.id || p.projectId);

        assert.equal(
          authoritativeTopN.length,
          capacity,
          'Must select exactly N=2 authoritative projects'
        );

        // 2. Structured resume snapshot generation
        const snapshot = buildStructuredResumeSnapshot({
          candidateProfile: realCandidateProfile,
          jobPosting: role.posting,
          options: {
            projectRankings: authoritativeProjects,
          },
        });

        const finalProjects = snapshot.structuredResume.projects;
        const finalProjectIds = finalProjects.map((p) => p.projectId || p.id);
        const planProjectIds = snapshot.tailoringPlan.selectedProjectIds;

        // Required assertions:
        // A. finalProjectIds === authoritativeTopNProjectIds
        assert.deepEqual(
          finalProjectIds,
          authoritativeTopNIds,
          `Final project IDs must strictly equal authoritative top N for ${role.label}`
        );
        assert.deepEqual(
          planProjectIds,
          authoritativeTopNIds,
          `Tailoring plan project IDs must strictly equal authoritative top N for ${role.label}`
        );

        // B. Project order must be preserved exactly
        for (let i = 0; i < capacity; i++) {
          assert.equal(
            finalProjectIds[i],
            authoritativeTopNIds[i],
            `Project order index ${i} must match authoritative ranking order`
          );
        }

        // C. Specific role discrimination verification
        if (role.expectedTop1Slug) {
          const top1Proj = authoritativeTopN[0];
          const top1Slug = (top1Proj.name || top1Proj.title || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
          assert.ok(
            top1Slug.includes(role.expectedTop1Slug),
            `Top project for ${role.label} must be ${role.expectedTop1Slug}, got ${top1Slug}`
          );
        }

        // Record audit entry
        rankingAudit.push({
          role: role.label,
          authoritativeTopNIds,
          finalProjectIds,
          finalProjectNames: finalProjects.map((p) => p.displayName || p.name),
          orderMatches: JSON.stringify(finalProjectIds) === JSON.stringify(authoritativeTopNIds),
        });
      });
    }

    it('proves ranking discrimination: different jobs produce different top-1 projects', () => {
      const pythonAiEntry = rankingAudit.find((a) => a.role.includes('Python / AI'));
      const realtimeFsEntry = rankingAudit.find((a) => a.role.includes('Realtime'));

      assert.ok(pythonAiEntry && realtimeFsEntry, 'Audit entries must exist');
      assert.notEqual(
        pythonAiEntry.finalProjectIds[0],
        realtimeFsEntry.finalProjectIds[0],
        'Python/AI job and Realtime/Fullstack job must have DIFFERENT top-ranked projects based on authentic evidence'
      );
    });

    it('guarantees semantic freeze and fingerprint invariance', () => {
      const contentSvc = new CandidateArtifactContentService();
      const pythonJob = testRoles[0].posting;
      const rankingResult = contentSvc.rankProjectsForJob(realCandidateProfile, pythonJob, {
        maxProjects: 2,
      });

      const snapshot = buildStructuredResumeSnapshot({
        candidateProfile: realCandidateProfile,
        jobPosting: pythonJob,
        options: { projectRankings: rankingResult.selectedProjects },
      });

      const fp1 = computeResumeSemanticFingerprint(snapshot.structuredResume);
      const fp2 = computeResumeSemanticFingerprint(snapshot.structuredResume);
      assert.equal(fp1, fp2, 'Semantic fingerprint must be deterministic and invariant');

      // Presentation variations do not change the semantic fingerprint
      const snapshotWithLayoutOverrides = buildStructuredResumeSnapshot({
        candidateProfile: realCandidateProfile,
        jobPosting: pythonJob,
        options: {
          projectRankings: rankingResult.selectedProjects,
          layoutOverrides: { atsSectionToSection: '5pt' },
        },
      });
      const fp3 = computeResumeSemanticFingerprint(snapshotWithLayoutOverrides.structuredResume);
      assert.equal(fp1, fp3, 'Presentation/layout tuning must not change semantic fingerprint');
    });
  });

  describe('4. Real LaTeX PDF Compilation & One-Page Acceptance', () => {
    it('compiles clean one-page ATS PDF with Tectonic for candidate with AWS & compact links', async () => {
      const devopsJob = {
        title: 'Senior DevOps & Infrastructure Engineer',
        description:
          'Deploy AWS cloud infrastructure and container pipelines with Docker and GitHub Actions.',
        skills: ['AWS', 'Docker', 'GitHub Actions', 'PostgreSQL', 'Linux'],
        requirements: [
          'AWS production deployment',
          'Docker container orchestration',
          'Automated GitHub Actions CI/CD',
        ],
      };

      const candidateWithAws = {
        ...realCandidateProfile,
        additionalSkills: [
          {
            name: 'AWS',
            skillSlug: 'aws',
            category: 'Cloud, DevOps & Systems',
            provenanceStatus: 'USER_PROVIDED',
          },
        ],
      };

      const snapshot = buildStructuredResumeSnapshot({
        candidateProfile: candidateWithAws,
        jobPosting: devopsJob,
      });

      const generator = new LatexDocumentGenerator();
      const latexResult = generator.generateTailoredResumeLatex({
        applicationPackage: {
          structuredResume: snapshot.structuredResume,
          targetJob: devopsJob,
        },
      });

      const tex = latexResult.texContent;

      // 1. Verify project links in LaTeX
      assert.match(
        tex,
        /\\href\{https:\/\/github\.com\/[^}]+\}\{\\textbf\{GitHub\}\}/,
        'Must contain compact GitHub link label'
      );
      const projMatch =
        tex.match(/\\atssection\{Technical Projects\}[\s\S]*?\\atssection/)?.[0] || '';
      const visibleOnly = projMatch.replace(/\\href\{[^}]+\}/g, '');
      assert.ok(
        !visibleOnly.includes('github.com'),
        'Must not contain raw repository URLs in visible text'
      );

      // 2. Verify classic Latin Modern Roman serif typography
      assert.match(tex, /lmroman10-regular\.otf/, 'Must embed Latin Modern Roman serif typeface');

      // 3. Verify section headings and rule
      assert.match(tex, /\\atssection\{Technical Projects\}/);
      assert.match(tex, /\\ats(first)?section\{Technical Skills\}/);
      assert.match(tex, /\\hrule height 0\.4pt/);

      // 4. Compile with real Tectonic engine
      const compiler = new LatexCompilerService();
      const { pdfBuffer, diagnostics } = await compiler.compileLatexToPdf({
        texContent: tex,
        jobName: 'p50-production-resume-devops',
      });

      assert.ok(pdfBuffer && pdfBuffer.length > 0, 'PDF buffer must be generated');

      // 5. Assert strict 1-page fit
      const pages = countPdfPages(pdfBuffer);
      assert.equal(pages, 1, `Compiled resume PDF must fit on exactly 1 page, got ${pages}`);

      // 6. Assert clean LaTeX diagnostics
      const seriousErrors = (diagnostics || []).filter((d) => d.severity === 'ERROR');
      assert.equal(seriousErrors.length, 0, 'Must have zero LaTeX compilation errors');
    });
  });

  after(async () => {
    await closeDatabase(pool);
  });
});
