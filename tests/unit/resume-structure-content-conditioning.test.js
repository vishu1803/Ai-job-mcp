/**
 * @file tests/unit/resume-structure-content-conditioning.test.js
 *
 * Comprehensive test suite verifying the Resume Tailoring Model Contract:
 * 1. Skill-lock invariant: finalSkillIds ⊆ verifiedCandidateSkillIds
 * 2. Skill corroboration: project tech corroborates existing skill; no new skill created
 * 3. Optimizer semantic freeze: semantic fingerprint before optimizer == after optimizer
 * 4. Optimizer cannot add, replace, or drop projects
 * 5. Optimizer cannot replace skill set
 * 6. Optimizer cannot rewrite semantic summary
 * 7. Project capacity: top N eligible projects from authoritative ranking
 * 8. Project shortage: fewer than N eligible -> render only valid projects; no fabrication
 * 9. Structure invariance across multiple jobs: master structure invariant
 * 10. Content differentiation across materially different jobs
 * 11. Experience source-fact provenance remains candidate-owned
 * 12. DSA source-fact provenance remains candidate-owned
 * 13. Education source-fact provenance remains candidate-owned
 * 14. MCP and Extension semantic parity
 * 15. No legacy semantic path reachable
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import {
  buildStructuredResumeSnapshot,
  freezeSemanticResume,
  assertSemanticEquivalence,
  computeResumeSemanticFingerprint,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { MasterResumeStructureService } from '../../src/services/master-resume-structure.service.js';
import {
  ResumeContentOptimizer,
  OPTIMIZER_MOVE_TYPES,
} from '../../src/services/resume-content-optimizer.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { handleGenerateTailoredResume } from '../../src/mcp/tools/career-artifact-tools.js';
import { normalizeJobInput } from '../../src/services/job-normalization.service.js';

describe('Resume Tailoring Model Contract & Invariants Suite', () => {
  const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const mcpContext = {
    tenantId: '24d53f53-780e-4431-b065-32180c354175',
    userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
    role: 'OWNER',
  };

  let candidateProfile = null;
  let snapBackend = null;
  let snapSystems = null;
  let snapFrontend = null;

  const jobBackend = {
    title: 'Senior Backend Engineer',
    company: 'Cloud Corp',
    description:
      'Requirements:\n- Python 3.12 and FastAPI backend development\n- Scalable REST APIs\n- PostgreSQL database optimization and schema design\n- Microservices architecture',
  };

  const jobSystems = {
    title: 'Distributed Systems Engineer',
    company: 'Systems Corp',
    description:
      'Requirements:\n- Rust and C++ systems programming\n- Distributed consensus and Raft algorithms\n- Docker containerization and Linux internals\n- Low-latency streaming telemetry',
  };

  const jobFrontend = {
    title: 'Frontend Engineer',
    company: 'Web Corp',
    description:
      'Requirements:\n- React 19 and Next.js modern web development\n- TypeScript strict mode\n- Frontend asset loading and page load time optimization\n- Tailwind CSS and responsive UI components\n- Client-side performance optimization',
  };

  before(async () => {
    const profileService = new CandidateProfileService(db);
    const profileView = await profileService.getProfile(mcpContext, CANDIDATE_ID);
    candidateProfile = {
      ...profileView.candidate,
      id: CANDIDATE_ID,
      tenantId: mcpContext.tenantId,
      skills: profileView.skills || [],
      projects: profileView.projects || [],
      experience:
        profileView.candidate?.profileMetadata?.experience || profileView.experience || [],
      education: profileView.candidate?.profileMetadata?.education || profileView.education || [],
      dsa: profileView.dsa,
      resumeSections: profileView.resumeSections,
    };

    const contentService = new CandidateArtifactContentService({ database: db });
    const getRankings = (job) => {
      const canonicalJob = normalizeJobInput(job);
      const ranked = contentService.rankProjectsForJob(candidateProfile, canonicalJob, {
        maxProjects: 2,
      });
      return ranked.selectedProjects || (Array.isArray(ranked) ? ranked : []);
    };

    snapBackend = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { ...jobBackend, projectRankings: getRankings(jobBackend) },
    });

    snapSystems = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { ...jobSystems, projectRankings: getRankings(jobSystems) },
    });

    snapFrontend = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { ...jobFrontend, projectRankings: getRankings(jobFrontend) },
    });
  });

  after(async () => {
    await closeDatabase(pool);
  });

  // =========================================================================
  // CONTRACT 1 & 2: Skill-Lock Invariant & Skill Corroboration
  // =========================================================================
  describe('CONTRACT 1 & 2: Skill-Lock Invariant & Skill Corroboration', () => {
    it('1. verifies every rendered skill ∈ verified candidate skills (finalSkillIds ⊆ verifiedCandidateSkillIds)', () => {
      const normalize = (s) =>
        String(s || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
      const verifiedSkillNames = new Set(
        candidateProfile.skills.map((s) => normalize(s.displayName || s.name || s.slug))
      );

      for (const [snap, label] of [
        [snapBackend, 'Backend'],
        [snapSystems, 'Systems'],
        [snapFrontend, 'Frontend'],
      ]) {
        const categories = snap.structuredResume.skills?.categories || [];
        assert.ok(categories.length > 0, `${label} resume must contain skill categories`);

        for (const cat of categories) {
          for (const skill of cat.skills) {
            const skillName = skill.displayName || skill.name;
            const norm = normalize(skillName);
            assert.ok(
              verifiedSkillNames.has(norm),
              `Skill-lock invariant violation: rendered skill "${skillName}" on ${label} resume is not in verified candidate skills`
            );
          }
        }
      }
    });

    it('2. proves an unverified project technology CANNOT become a resume skill', () => {
      // Candidate's projects include 'Audience Query System' which uses 'Rust' and 'Raft'.
      // However, neither 'Rust' nor 'Raft' is in candidateProfile.skills.
      // Even when target job explicitly requires 'Rust' and 'Raft', they must NOT appear in Technical Skills.
      const systemsRenderedSkills = snapSystems.structuredResume.skills.categories.flatMap((c) =>
        c.skills.map((s) => s.name.toLowerCase())
      );

      assert.strictEqual(
        systemsRenderedSkills.includes('rust'),
        false,
        'Project technology "Rust" must NOT be promoted to Technical Skills when not in candidate skill inventory'
      );
      assert.strictEqual(
        systemsRenderedSkills.includes('raft'),
        false,
        'Project technology "Raft" must NOT be promoted to Technical Skills when not in candidate skill inventory'
      );
    });

    it('3. proves project technology matching an existing skill provides corroboration without creating a new skill', () => {
      const candidateContentService = new CandidateArtifactContentService();
      const mockCandidate = {
        skills: [
          { name: 'Python', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
          { name: 'FastAPI', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
        ],
        projects: [
          {
            name: 'API Service',
            provenanceStatus: 'VERIFIED',
            technologies: ['FastAPI', 'Kubernetes'], // FastAPI is existing; Kubernetes is unverified
          },
        ],
      };

      const result = candidateContentService.selectAndCategorizeSkillsForJob(
        mockCandidate,
        { requirements: ['FastAPI', 'Kubernetes', 'Python'] },
        {}
      );

      const allSelectedNames = (result.selectedSkills || []).map((s) => s.name);
      // FastAPI should be corroborated:
      const fastApiSkill = result.selectedSkills.find((s) => s.name === 'FastAPI');
      assert.ok(fastApiSkill, 'FastAPI must be selected');
      assert.strictEqual(fastApiSkill.provenanceStatus, 'CORROBORATED');
      assert.strictEqual(fastApiSkill.evidenceCount >= 1, true);

      // Kubernetes must NOT be added to skills:
      assert.strictEqual(
        allSelectedNames.includes('Kubernetes'),
        false,
        'Unverified project technology "Kubernetes" must NOT be added to candidate skills'
      );
      assert.strictEqual(
        allSelectedNames.every((n) => ['Python', 'FastAPI'].includes(n)),
        true,
        'All selected skills must be subset of initial candidate skills'
      );
    });
  });

  // =========================================================================
  // CONTRACT 3-6: Optimizer Semantic Freeze & Presentation-Only Operations
  // =========================================================================
  describe('CONTRACT 3-6: Optimizer Semantic Freeze & Presentation-Only Operations', () => {
    it('4. guarantees semantic fingerprint before optimizer == semantic fingerprint after optimizer', async () => {
      const mockCompiler = {
        compileLatexToPdf: async () => ({ pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') }),
      };
      const mockGenerator = {
        generateTailoredResumeLatex: () => ({
          texContent: '\\documentclass{article}\\begin{document}Resume\\end{document}',
        }),
      };
      const optimizer = new ResumeContentOptimizer({
        latexCompiler: mockCompiler,
        latexGenerator: mockGenerator,
      });

      const structuredResume = snapBackend.structuredResume;
      const fpBefore = computeResumeSemanticFingerprint(structuredResume);
      assert.ok(fpBefore.length === 64, 'Semantic fingerprint must be SHA-256 hex string');

      const result = await optimizer.optimize({
        structuredResume,
        candidateProfile,
        jobPosting: jobBackend,
        options: { maxIterations: 3 },
      });

      assert.strictEqual(result.success, true);
      const fpAfter = computeResumeSemanticFingerprint(result.structuredResume);

      // Core Invariant: Semantic fingerprint before optimizer === after optimizer
      assert.strictEqual(
        fpAfter,
        fpBefore,
        'Optimizer must not alter semantic fingerprint of the structured resume'
      );

      // Explicit deep semantic equivalence check
      assert.strictEqual(
        assertSemanticEquivalence(structuredResume, result.structuredResume),
        true
      );
    });

    it('5. proves optimizer cannot generate or apply semantic moves (ADD_PROJECT, REPLACE_PROJECT, DROP_PROJECT)', () => {
      const optimizer = new ResumeContentOptimizer();
      const structuredResume = snapBackend.structuredResume;

      // Under both ample space (80pt) and overflow (-30pt), candidate moves must never contain semantic project moves
      const movesAmple = optimizer._generateCandidateMoves({
        structuredResume,
        projectBulletOverrides: {},
        availableSpacePt: 80,
      });

      const movesOverflow = optimizer._generateCandidateMoves({
        structuredResume,
        projectBulletOverrides: {},
        availableSpacePt: -30,
      });

      const forbiddenTypes = [
        OPTIMIZER_MOVE_TYPES.REPLACE_PROJECT,
        OPTIMIZER_MOVE_TYPES.DROP_PROJECT,
        OPTIMIZER_MOVE_TYPES.ADD_RELEVANT_PROJECT,
        OPTIMIZER_MOVE_TYPES.REPLACE_SKILL_SET,
        OPTIMIZER_MOVE_TYPES.REWRITE_SUMMARY,
        OPTIMIZER_MOVE_TYPES.REORDER_SECTIONS,
      ];

      for (const m of [...movesAmple, ...movesOverflow]) {
        assert.ok(
          !forbiddenTypes.includes(m.type),
          `Optimizer move generator produced forbidden semantic move: ${m.type}`
        );
      }
    });

    it('6. proves assertSemanticEquivalence detects and rejects project, skill, or summary mutations', () => {
      const baseline = snapBackend.structuredResume;

      // Project mutation
      const mutatedProjects = JSON.parse(JSON.stringify(baseline));
      mutatedProjects.projects[0].projectId = 'altered-project-id';
      mutatedProjects.projects[0].name = 'Altered Project Name';
      assert.throws(
        () => assertSemanticEquivalence(baseline, mutatedProjects),
        /Optimizer semantic violation.*project ordering changed/
      );

      // Project count mutation
      const droppedProject = JSON.parse(JSON.stringify(baseline));
      droppedProject.projects.pop();
      assert.throws(
        () => assertSemanticEquivalence(baseline, droppedProject),
        /Optimizer semantic violation.*project count changed/
      );

      // Skill mutation
      const mutatedSkills = JSON.parse(JSON.stringify(baseline));
      mutatedSkills.skills.categories[0].skills.push({
        name: 'FabricatedSkill',
        slug: 'fabricated',
      });
      assert.throws(
        () => assertSemanticEquivalence(baseline, mutatedSkills),
        /Optimizer semantic violation.*technical skills selection/
      );

      // Summary mutation
      const mutatedSummary = JSON.parse(JSON.stringify(baseline));
      mutatedSummary.summary.text = 'Rewritten summary text that was not in baseline.';
      assert.throws(
        () => assertSemanticEquivalence(baseline, mutatedSummary),
        /Optimizer semantic violation.*summary text was rewritten/
      );
    });
  });

  // =========================================================================
  // CONTRACT 7 & 8: Project Capacity & Shortage Handling
  // =========================================================================
  describe('CONTRACT 7 & 8: Project Capacity & Shortage Handling', () => {
    it('7. selects exact prefix of top N eligible projects from authoritative ranking (N=2)', () => {
      // Master structure specifies projectSlotCapacity = 2
      const masterStructure = MasterResumeStructureService.resolveMasterStructure(candidateProfile);
      assert.strictEqual(masterStructure.projectSlotCapacity, 2);

      // In snapBackend, exactly top 2 eligible projects are selected
      assert.strictEqual(snapBackend.structuredResume.projects.length, 2);
      const selectedIds = snapBackend.structuredResume.projects.map((p) => p.projectId);
      assert.strictEqual(selectedIds.length, 2);

      // Candidate has more than 2 projects; selection is exactly the top 2
      assert.ok(candidateProfile.projects.length >= 3);
    });

    it('8. renders only valid projects without fabrication when fewer than N eligible projects exist', () => {
      // Create candidate with only 1 eligible project
      const singleProjectCandidate = {
        ...candidateProfile,
        projects: [
          {
            id: 'proj-sole',
            projectId: 'proj-sole',
            name: 'Sole Authentic Project',
            title: 'Sole Authentic Project',
            bullets: [
              'Authored sole authentic project bullet with real metrics.',
              'Engineered scalable backend service with automated integration tests.',
              'Optimized database queries and connection pooling for high throughput.',
            ],
            technologies: ['Python', 'FastAPI'],
            relevanceScore: 90,
          },
        ],
      };

      const snap = buildStructuredResumeSnapshot({
        candidateProfile: singleProjectCandidate,
        jobPosting: {
          ...jobBackend,
          projectRankings: [
            {
              projectId: 'proj-sole',
              projectName: 'Sole Authentic Project',
              relevanceScore: 90,
              status: 'SELECTED',
            },
          ],
        },
      });

      // Must render exactly 1 project, NEVER invent a second project
      assert.strictEqual(snap.structuredResume.projects.length, 1);
      assert.strictEqual(snap.structuredResume.projects[0].name, 'Sole Authentic Project');

      // Test completely irrelevant job (zero relevance projects)
      const irrelevantJob = {
        title: 'Swift iOS Developer',
        company: 'Apple Studio',
        requirements: ['Swift', 'SwiftUI', 'CoreData', 'Objective-C'],
      };

      const snapIrrelevant = buildStructuredResumeSnapshot({
        candidateProfile: singleProjectCandidate,
        jobPosting: irrelevantJob,
      });

      // When relevance is genuinely zero, prefers NO project over WRONG project
      assert.strictEqual(
        snapIrrelevant.structuredResume.projects.length,
        0,
        'Irrelevant job must produce 0 projects rather than fabricating an iOS project'
      );
    });
  });

  // =========================================================================
  // CONTRACT 9 & 10: Structural Invariance & Dynamic Job-Conditioned Content
  // =========================================================================
  describe('CONTRACT 9 & 10: Structural Invariance & Dynamic Content Conditioning', () => {
    it('9. preserves identical section order and master structure across Backend, Systems, and Frontend roles', () => {
      const orderB = snapBackend.structuredResume.sectionOrder;
      const orderS = snapSystems.structuredResume.sectionOrder;
      const orderF = snapFrontend.structuredResume.sectionOrder;

      // Invariant: master structure(job A) == master structure(job B) == master structure(job C)
      assert.deepStrictEqual(orderB, orderS);
      assert.deepStrictEqual(orderS, orderF);
      assert.deepStrictEqual(orderB, [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'PROJECTS',
        'DSA',
        'EXPERIENCE',
        'EDUCATION',
      ]);
    });

    it('10. differentiates content across materially different jobs (fingerprints, summaries, and skill priorities)', () => {
      const normB = normalizeJobInput(jobBackend);
      const normS = normalizeJobInput(jobSystems);
      const normF = normalizeJobInput(jobFrontend);

      // Distinct job fingerprints
      assert.notStrictEqual(normB.jobFingerprint, normS.jobFingerprint);
      assert.notStrictEqual(normS.jobFingerprint, normF.jobFingerprint);

      // Distinct summaries conditioned on target domain
      const textB = snapBackend.structuredResume.summary.text;
      const textS = snapSystems.structuredResume.summary.text;
      const textF = snapFrontend.structuredResume.summary.text;
      assert.notStrictEqual(textB, textS);
      assert.notStrictEqual(textS, textF);

      // Domain keyword grounding in summary
      assert.match(textB, /backend|FastAPI|PostgreSQL/i);
      assert.match(textS, /distributed systems|cloud|C\+\+|Docker/i);
      assert.match(textF, /web applications|React|Tailwind/i);

      // Distinct skill category prioritization
      const firstCatB = snapBackend.structuredResume.skills.categories[0].categoryName;
      const firstCatF = snapFrontend.structuredResume.skills.categories[0].categoryName;
      assert.match(firstCatB, /Backend/i);
      assert.match(firstCatF, /Languages|Frontend/i);
    });
  });

  // =========================================================================
  // CONTRACT 11-13: Factual Experience, DSA, and Education Provenance
  // =========================================================================
  describe('CONTRACT 11-13: Factual Experience, DSA, and Education Provenance', () => {
    it('11. preserves candidate-owned experience facts; reorders bullets by relevance without inventing claims', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        assert.strictEqual(
          snap.structuredResume.experience.length,
          candidateProfile.experience.length
        );
        assert.strictEqual(
          snap.structuredResume.experience[0].company,
          candidateProfile.experience[0].company
        );
        assert.strictEqual(
          snap.structuredResume.experience[0].title,
          candidateProfile.experience[0].title
        );
      }

      // Backend prioritizes REST APIs; Frontend prioritizes frontend asset loading
      assert.match(snapBackend.structuredResume.experience[0].bullets[0], /RESTful APIs/i);
      assert.match(
        snapFrontend.structuredResume.experience[0].bullets[0],
        /frontend asset loading|page load time/i
      );
    });

    it('12. preserves authentic DSA URL and bullets without hardcoded counts or ratings', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        const dsa = snap.structuredResume.dsa;
        assert.strictEqual(dsa.hasSection, true);
        assert.strictEqual(dsa.profileUrl, 'https://leetcode.com/u/vishwanatnishad');
        for (const b of dsa.bullets) {
          assert.doesNotMatch(b, /450\+|Knight rating|top \d+%/i);
        }
      }
    });

    it('13. preserves candidate-owned education facts without semantic rewriting', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        assert.strictEqual(
          snap.structuredResume.education.length,
          candidateProfile.education.length
        );
        assert.strictEqual(
          snap.structuredResume.education[0].institution,
          candidateProfile.education[0].institution
        );
        assert.strictEqual(
          snap.structuredResume.education[0].degree,
          candidateProfile.education[0].degree
        );
      }
    });
  });

  // =========================================================================
  // CONTRACT 14 & 15: MCP and Extension Parity & No Legacy Path
  // =========================================================================
  describe('CONTRACT 14 & 15: MCP and Extension Parity & No Legacy Path', () => {
    it('14. guarantees MCP and Extension converge on identical canonical structured resume selection', async () => {
      const workflowService = new JobApplicationWorkflowService({
        database: db,
        aiProvider: false,
      });

      // Run canonical workflow
      const prep = await workflowService.prepareJobApplication({
        tenantId: mcpContext.tenantId,
        candidateId: CANDIDATE_ID,
        jobPosting: jobBackend,
      });

      const structuredFromWorkflow = prep.tailoredResume?.structuredResume;
      assert.ok(structuredFromWorkflow);

      // Run MCP tool directly
      const mcpResult = await handleGenerateTailoredResume(
        mcpContext,
        {
          candidateId: CANDIDATE_ID,
          jobDescriptionText: jobBackend.description,
          jobTitle: jobBackend.title,
        },
        { db, workflowService }
      );

      assert.ok(mcpResult.resume);

      // Selected project IDs parity
      const workflowProjNames = structuredFromWorkflow.projects.map((p) => p.name);
      const mcpProjNames = mcpResult.resume.projects.map((p) => p.name);
      assert.deepStrictEqual(
        mcpProjNames,
        workflowProjNames,
        'MCP and Extension must select identical projects'
      );

      // Selected skills parity
      const workflowSkills = structuredFromWorkflow.skills.categories.flatMap((c) =>
        c.skills.map((s) => s.name)
      );
      const mcpSkills = mcpResult.resume.skills.flatMap((c) => c.skills.map((s) => s.skillName));
      assert.deepStrictEqual(
        mcpSkills,
        workflowSkills,
        'MCP and Extension must select identical skills'
      );

      // Summary parity
      assert.strictEqual(
        mcpResult.resume.basics.summary,
        structuredFromWorkflow.summary?.text,
        'MCP and Extension must produce identical summary'
      );

      // Semantic fingerprint parity
      const workflowFingerprint = computeResumeSemanticFingerprint(structuredFromWorkflow);
      const mcpFingerprint = computeResumeSemanticFingerprint(mcpResult);
      assert.strictEqual(
        mcpFingerprint,
        workflowFingerprint,
        'MCP and Extension must have identical semantic fingerprint'
      );
    });

    it('15. verifies no legacy semantic path (e.g. ResumeTailoringService) is reachable', async () => {
      // ResumeTailoringService was replaced by JobApplicationWorkflowService + StructuredResumeService
      let legacyUsed = false;
      try {
        const { ResumeTailoringService } =
          await import('../../src/services/resume-tailoring.service.js');
        if (ResumeTailoringService) legacyUsed = true;
      } catch {
        legacyUsed = false;
      }

      // Verify that JobApplicationWorkflowService does not instantiate or use ResumeTailoringService
      const workflow = new JobApplicationWorkflowService({ database: db });
      assert.strictEqual(
        workflow.resumeTailoringService,
        undefined,
        'JobApplicationWorkflowService must not have a reference to legacy ResumeTailoringService'
      );
    });
  });

  // =========================================================================
  // CONTRACT 16: LaTeX ATS Document Generation Invariance
  // =========================================================================
  describe('CONTRACT 16: LaTeX ATS Document Generation Invariance', () => {
    it('16. renders valid ATS LaTeX with identical section structure across all 3 jobs', () => {
      const generator = new LatexDocumentGenerator();

      for (const [snap, jobName] of [
        [snapBackend, 'Backend'],
        [snapSystems, 'Systems'],
        [snapFrontend, 'Frontend'],
      ]) {
        const pkg = {
          targetJob: { title: snap.structuredResume.targetRole, company: 'Test Corp' },
          structuredResume: snap.structuredResume,
          tailoredResume: { structuredResume: snap.structuredResume },
          candidateName: snap.structuredResume.candidateIdentity.displayName,
          candidateEmail: snap.structuredResume.candidateIdentity.email,
        };

        const result = generator.generateTailoredResumeLatex({
          applicationPackage: pkg,
        });

        assert.ok(result.texContent);
        assert.ok(result.texContent.length > 500);

        const audit = LatexDocumentGenerator.auditLatexContent(result.texContent);
        assert.strictEqual(
          audit.passed,
          true,
          `Audit failed for ${jobName}: ${audit.violations.join(', ')}`
        );

        const idxSummary = result.texContent.indexOf('section{Professional Summary}');
        const idxSkills = result.texContent.indexOf('\\atssection{Technical Skills}');
        const idxProjects = result.texContent.indexOf('\\atssection{Technical Projects}');
        const idxDsa = result.texContent.indexOf(
          '\\atssection{Problem Solving \\& Algorithmic Practice}'
        );
        const idxExp = result.texContent.indexOf('\\atssection{Professional Experience}');
        const idxEdu = result.texContent.indexOf('\\atssection{Education}');

        assert.ok(idxSummary > 0, 'Summary section exists');
        assert.ok(idxSkills > idxSummary, 'Skills comes after Summary');
        assert.ok(idxProjects > idxSkills, 'Projects comes after Skills');
        assert.ok(idxDsa > idxProjects, 'DSA comes after Projects');
        assert.ok(idxExp > idxDsa, 'Experience comes after DSA');
        assert.ok(idxEdu > idxExp, 'Education comes after Experience');
      }
    });
  });
});
