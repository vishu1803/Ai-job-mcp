/**
 * @file tests/unit/resume-structure-content-conditioning.test.js
 *
 * Comprehensive test suite verifying the Resume Tailoring Model Contract:
 * 1. Master resume structure / information architecture is stable and invariant across jobs.
 * 2. Project count is structural, not semantic (inherited from master structure).
 * 3. Authoritative project ranking is consumed directly without a divergent second ranking algorithm.
 * 4. Technical skills are strictly verified, locked to candidate inventory, and prioritized by job.
 * 5. Professional summary is dynamically conditioned on domain and verified skills with zero role-title branching.
 * 6. Experience preserves candidate truth; bullets reorder based on requirement concepts without fabricating claims.
 * 7. DSA section is preserved authentically from candidate profile without hardcoding counts or ratings.
 * 8. LaTeX generation maintains identical section structure across all jobs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, pool } from '../../src/db/index.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { MasterResumeStructureService } from '../../src/services/master-resume-structure.service.js';

describe('Resume Structure Preservation & Job-Conditioned Content (P43)', () => {
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
      experience: profileView.candidate?.profileMetadata?.experience || profileView.experience || [],
      education: profileView.candidate?.profileMetadata?.education || profileView.education || [],
      dsa: profileView.dsa,
      resumeSections: profileView.resumeSections,
    };

    snapBackend = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: jobBackend,
    });

    snapSystems = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: jobSystems,
    });

    snapFrontend = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: jobFrontend,
    });
  });

  after(async () => {
    await pool.end();
  });

  describe('1. Master Resume Structure Invariance Across Contrasting Jobs', () => {
    it('should preserve identical section ordering across Backend, Systems, and Frontend jobs', () => {
      const orderBackend = snapBackend.structuredResume.sectionOrder;
      const orderSystems = snapSystems.structuredResume.sectionOrder;
      const orderFrontend = snapFrontend.structuredResume.sectionOrder;

      assert.ok(orderBackend);
      assert.ok(orderSystems);
      assert.ok(orderFrontend);

      // Invariant: Exact same section array across all 3 jobs
      assert.deepStrictEqual(orderBackend, orderSystems);
      assert.deepStrictEqual(orderSystems, orderFrontend);

      // Expected canonical order: HEADER, SUMMARY, SKILLS, PROJECTS, DSA, EXPERIENCE, EDUCATION
      assert.deepStrictEqual(orderBackend, [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'PROJECTS',
        'DSA',
        'EXPERIENCE',
        'EDUCATION',
      ]);
    });

    it('should resolve master structure from candidate data and not mutate per job', () => {
      const masterStructure = MasterResumeStructureService.resolveMasterStructure(candidateProfile);
      assert.deepStrictEqual(masterStructure.sectionOrder, [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'PROJECTS',
        'DSA',
        'EXPERIENCE',
        'EDUCATION',
      ]);
      assert.strictEqual(masterStructure.projectSlotCapacity, 2);
    });
  });

  describe('2. Structural Project Slot Capacity & Authoritative Ranking Consumption', () => {
    it('should inherit project slot count structurally from master resume (exactly 2 project slots)', () => {
      assert.strictEqual(snapBackend.structuredResume.projects.length, 2);
      assert.strictEqual(snapSystems.structuredResume.projects.length, 2);
      assert.strictEqual(snapFrontend.structuredResume.projects.length, 2);
    });

    it('should select top eligible projects from authoritative ranking without inventing a second ranking', () => {
      // Backend job has Python/FastAPI/PostgreSQL -> Collaborative Task Manager & AI Code Review Assistant
      const backendProjectNames = snapBackend.structuredResume.projects.map((p) => p.name);
      assert.ok(backendProjectNames.includes('vishu1803/Collaborative-task-manager'));
      assert.ok(backendProjectNames.includes('vishu1803/Ai-powered-code-review-assistant'));

      // Every project slot must have non-empty, authentic candidate-authored bullets
      for (const p of snapBackend.structuredResume.projects) {
        assert.ok(p.bullets.length > 0);
        for (const b of p.bullets) {
          assert.strictEqual(typeof b.text, 'string');
          assert.ok(b.text.length > 20);
        }
      }
    });

    it('should never drop candidate projects when authentic candidate bullets exist', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        assert.strictEqual(snap.structuredResume.projects.length, 2);
      }
    });
  });

  describe('3. Strictly Verified / Locked Skills', () => {
    it('should source skills exclusively from candidate inventory and never fabricate new skills', () => {
      const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const authorizedCandidateSkillNames = new Set([
        ...candidateProfile.skills.map((s) => normalize(s.displayName || s.name || s.slug)),
        ...candidateProfile.projects.flatMap((p) => [
          ...(Array.isArray(p.technologies) ? p.technologies : []),
          ...(Array.isArray(p.metadata?.technologies) ? p.metadata.technologies : []),
          ...(Array.isArray(p.metadata?.skills) ? p.metadata.skills : []),
        ]).map(normalize),
      ]);

      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        const categories = snap.structuredResume.skills?.categories || [];
        assert.ok(categories.length > 0);

        for (const cat of categories) {
          assert.ok(cat.skills.length > 0);
          for (const skill of cat.skills) {
            const skillName = skill.displayName || skill.name;
            assert.ok(
              authorizedCandidateSkillNames.has(normalize(skillName)),
              `Skill ${skillName} must be in candidate authorized inventory`
            );
          }
        }
      }
    });

    it('should adapt skill category presentation and prioritization to the target job', () => {
      const skillsBackend = snapBackend.structuredResume.skills.categories.map((c) => c.categoryName);
      const skillsFrontend = snapFrontend.structuredResume.skills.categories.map((c) => c.categoryName);

      // Backend prioritizes Backend & APIs / Databases, while Frontend prioritizes Frontend & Web
      assert.match(skillsBackend[0], /Backend/i);
      assert.ok(skillsFrontend.includes('Frontend & Web'));
    });
  });

  describe('4. Dynamic Job-Conditioned Professional Summary', () => {
    it('should condition summary on job requirements and verified candidate skills without hardcoding', () => {
      const textBackend = snapBackend.structuredResume.summary?.text;
      const textSystems = snapSystems.structuredResume.summary?.text;
      const textFrontend = snapFrontend.structuredResume.summary?.text;

      assert.ok(textBackend);
      assert.ok(textSystems);
      assert.ok(textFrontend);

      // Summaries must adapt to their respective target domain and verified technologies
      assert.notStrictEqual(textBackend, textSystems);
      assert.notStrictEqual(textSystems, textFrontend);

      // Backend summary highlights backend / api / postgresql / fastapi
      assert.match(textBackend, /backend|api|PostgreSQL|FastAPI/i);

      // Systems summary highlights distributed systems / rust / docker
      assert.match(textSystems, /distributed systems|cloud|Rust|Docker/i);

      // Frontend summary highlights modern web / react / next.js
      assert.match(textFrontend, /web applications|React|Next\.js|Tailwind/i);
    });

    it('should preserve problem-solving mention in summary when authentic DSA practice exists', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        assert.match(snap.structuredResume.summary?.text, /Data Structures and Algorithms/i);
      }
    });
  });

  describe('5. Experience Non-Fabrication & Relevance Reordering', () => {
    it('should preserve authentic employer, title, and dates without hallucinating new records', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        assert.strictEqual(
          snap.structuredResume.experience.length,
          candidateProfile.experience.length
        );
        assert.strictEqual(
          snap.structuredResume.experience[0].title,
          'Full Stack Developer Intern'
        );
      }
    });

    it('should reorder existing candidate bullets according to job relevance while preserving candidate truth', () => {
      const expBackend = snapBackend.structuredResume.experience[0];
      const expFrontend = snapFrontend.structuredResume.experience[0];

      assert.strictEqual(expBackend.bullets.length, 4);
      assert.strictEqual(expFrontend.bullets.length, 4);

      // Backend engineer prioritizes RESTful APIs
      assert.match(expBackend.bullets[0], /RESTful APIs/i);

      // Frontend engineer prioritizes frontend asset loading / page load time optimization
      assert.match(expFrontend.bullets[0], /frontend asset loading|page load time/i);
    });
  });

  describe('6. Authentic DSA / Problem Solving Preservation', () => {
    it('should preserve candidate LeetCode URL across all jobs without hardcoded problem counts', () => {
      for (const snap of [snapBackend, snapSystems, snapFrontend]) {
        const dsa = snap.structuredResume.dsa;
        assert.strictEqual(dsa.hasSection, true);
        assert.strictEqual(dsa.profileUrl, 'https://leetcode.com/u/vishwanatnishad');
        // Must never inject synthetic problem counts ("450+ Solved", "Knight rating", etc.)
        for (const b of dsa.bullets) {
          assert.doesNotMatch(b, /450\+|Knight rating/i);
        }
      }
    });
  });

  describe('7. End-to-End LaTeX Document Generation & Audit', () => {
    it('should generate valid ATS-compliant LaTeX with stable section order across all 3 jobs', () => {
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

        // Audit content for zero placeholders
        const audit = LatexDocumentGenerator.auditLatexContent(result.texContent);
        assert.strictEqual(
          audit.passed,
          true,
          `Audit failed for ${jobName}: ${audit.violations.join(', ')}`
        );

        // Verify sections appear in the exact order: Summary -> Skills -> Projects -> Problem Solving -> Experience -> Education
        const idxSummary = result.texContent.indexOf('section{Professional Summary}');
        const idxSkills = result.texContent.indexOf('\\atssection{Technical Skills}');
        const idxProjects = result.texContent.indexOf('\\atssection{Technical Projects}');
        const idxDsa = result.texContent.indexOf('\\atssection{Problem Solving \\& Algorithmic Practice}');
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
