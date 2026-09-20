/**
 * @file tests/unit/ai-content-generation-quality.test.js
 *
 * Dedicated test suite verifying AI Resume Content Generation Quality:
 * 1. Professional Summary Anti-Template & Job-Conditioning Quality:
 *    - Genuinely job-conditioned for contrasting job profiles.
 *    - Jaccard similarity < 0.60 across contrasting summaries (no fill-in-the-blank templates).
 *    - Evidence-grounded with valid composedFromFactIds and zero fabrication.
 * 2. Project Accomplishment Bullets Quality:
 *    - Meaningful re-weighting and reframing per target role (Frontend vs Backend vs DevOps).
 *    - Strict adherence to minimum 3 bullets per project.
 *    - Every bullet backed by candidate-supported facts and valid evidence refs.
 * 3. Optimizer Semantic Freeze Invariance:
 *    - AI-generated summary and bullets are frozen without mutation by optimizer.
 * 4. Dual-Surface Parity (MCP and Extension):
 *    - 100% bit-for-bit identical summary and project bullets across MCP and Extension.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, pool } from '../../src/db/index.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { handleGenerateTailoredResume } from '../../src/mcp/tools/career-artifact-tools.js';
import { ResumeContentOptimizer } from '../../src/services/resume-content-optimizer.service.js';
import {
  freezeSemanticResume,
  assertSemanticEquivalence,
} from '../../src/services/structured-resume.service.js';
import { validateClaimEvidenceGrounding } from '../../src/services/resume-claim-validation.service.js';
import { buildCanonicalFactInventory } from '../../src/services/candidate-fact-inventory.service.js';

/**
 * Computes Jaccard word similarity between two text strings.
 *
 * @param {string} textA
 * @param {string} textB
 * @returns {number} Value between 0.0 and 1.0
 */
function computeWordJaccardSimilarity(textA, textB) {
  const wordsA = new Set(
    String(textA || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    String(textB || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersectionCount++;
  }

  const unionCount = wordsA.size + wordsB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

describe('AI Resume Content Generation Quality Suite', () => {
  const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';
  const mcpContext = {
    tenantId: '24d53f53-780e-4431-b065-32180c354175',
    userId: '9dd8e4fb-456b-4104-9cb1-c839a544b721',
    role: 'OWNER',
  };

  let candidateProfile = null;
  let workflowService = null;

  // 4 Contrasting Target Jobs
  const jobFullStack = {
    title: 'Senior Full-Stack Engineer',
    company: 'Nexus Innovations',
    description:
      'We are looking for a Senior Full-Stack Engineer to build scalable web applications.\n' +
      'Requirements:\n' +
      '- Full-stack web application development using React, Next.js, and Node.js\n' +
      '- TypeScript end-to-end development\n' +
      '- PostgreSQL database modeling and Prisma ORM\n' +
      '- REST API design, user interface component state management, and full product lifecycle ownership',
  };

  const jobPythonBackend = {
    title: 'Python Backend Engineer',
    company: 'DataStream Core',
    description:
      'We are seeking a Python Backend Engineer to scale our distributed core services.\n' +
      'Requirements:\n' +
      '- High-performance backend development in Python and FastAPI\n' +
      '- Relational database schema architecture, SQL optimization, and PostgreSQL persistence\n' +
      '- Asynchronous programming, concurrency, and event-driven architectures\n' +
      '- RESTful microservices and secure authentication pipelines',
  };

  const jobFrontend = {
    title: 'Senior Frontend Engineer',
    company: 'PixelCraft Studio',
    description:
      'Seeking a passionate Frontend Engineer dedicated to high-fidelity user experiences.\n' +
      'Requirements:\n' +
      '- Modern frontend engineering with React, Next.js, and TypeScript\n' +
      '- Responsive design, component library design, and Tailwind CSS styling\n' +
      '- Client-side state synchronization, UI performance tuning, and accessibility\n' +
      '- Clean design execution and fluid browser interaction design',
  };

  const jobDevOps = {
    title: 'DevOps & Platform Engineer',
    company: 'InfraScale Systems',
    description:
      'Looking for a DevOps & Platform Engineer to automate delivery and harden cloud operations.\n' +
      'Requirements:\n' +
      '- Container orchestration and Docker containerization\n' +
      '- CI/CD automation using GitHub Actions\n' +
      '- Infrastructure reliability, automated testing pipelines, and deployment automation\n' +
      '- Database operations, environment parity, and telemetry monitoring',
  };

  const results = {};

  before(async () => {
    const profileService = new CandidateProfileService();
    candidateProfile = await profileService.getProfile(mcpContext, CANDIDATE_ID);
    workflowService = new JobApplicationWorkflowService({ database: db, aiProvider: false });

    // Prepare packages for all 4 jobs
    results.fullStack = await workflowService.prepareJobApplication({
      tenantId: mcpContext.tenantId,
      candidateId: CANDIDATE_ID,
      jobPosting: jobFullStack,
    });

    results.pythonBackend = await workflowService.prepareJobApplication({
      tenantId: mcpContext.tenantId,
      candidateId: CANDIDATE_ID,
      jobPosting: jobPythonBackend,
    });

    results.frontend = await workflowService.prepareJobApplication({
      tenantId: mcpContext.tenantId,
      candidateId: CANDIDATE_ID,
      jobPosting: jobFrontend,
    });

    results.devOps = await workflowService.prepareJobApplication({
      tenantId: mcpContext.tenantId,
      candidateId: CANDIDATE_ID,
      jobPosting: jobDevOps,
    });
  });

  after(async () => {
    await pool.end();
  });

  // =========================================================================
  // 1. Professional Summary Anti-Template & Job-Conditioning Quality
  // =========================================================================
  describe('1. Professional Summary Quality & Anti-Template Validation', () => {
    it('generates non-empty, substantive summaries (>60 chars) for all 4 jobs', () => {
      for (const [key, pkg] of Object.entries(results)) {
        const summaryText = pkg.tailoredResume?.structuredResume?.summary?.text;
        assert.ok(summaryText, `Job ${key} must have a summary text`);
        assert.ok(
          summaryText.length >= 60,
          `Job ${key} summary must be at least 60 chars (got ${summaryText.length})`
        );
      }
    });

    it('demonstrates distinct job conditioning with pairwise Jaccard similarity < 0.60', () => {
      const summaries = {
        FullStack: results.fullStack.tailoredResume.structuredResume.summary.text,
        PythonBackend: results.pythonBackend.tailoredResume.structuredResume.summary.text,
        Frontend: results.frontend.tailoredResume.structuredResume.summary.text,
        DevOps: results.devOps.tailoredResume.structuredResume.summary.text,
      };

      const pairs = [
        ['FullStack', 'PythonBackend'],
        ['FullStack', 'Frontend'],
        ['FullStack', 'DevOps'],
        ['PythonBackend', 'Frontend'],
        ['PythonBackend', 'DevOps'],
        ['Frontend', 'DevOps'],
      ];

      for (const [a, b] of pairs) {
        const similarity = computeWordJaccardSimilarity(summaries[a], summaries[b]);
        assert.ok(
          similarity < 0.6,
          `Pairwise word similarity between ${a} and ${b} must be < 0.60 (got ${similarity.toFixed(3)}). Summaries must not be static fill-in-the-blank templates.`
        );
      }
    });

    it('adapts role emphasis appropriately across target jobs', () => {
      const feSummary = results.frontend.tailoredResume.structuredResume.summary.text.toLowerCase();
      const beSummary =
        results.pythonBackend.tailoredResume.structuredResume.summary.text.toLowerCase();
      const fsSummary =
        results.fullStack.tailoredResume.structuredResume.summary.text.toLowerCase();
      const doSummary = results.devOps.tailoredResume.structuredResume.summary.text.toLowerCase();

      // Frontend emphasizes UI, frontend, responsive, or client
      assert.ok(
        feSummary.includes('front-end') ||
          feSummary.includes('frontend') ||
          feSummary.includes('ui') ||
          feSummary.includes('interface') ||
          feSummary.includes('client'),
        'Frontend summary must emphasize frontend / UI / interfaces'
      );

      // Backend emphasizes backend, APIs, data, or services
      assert.ok(
        beSummary.includes('backend') ||
          beSummary.includes('back-end') ||
          beSummary.includes('api') ||
          beSummary.includes('data') ||
          beSummary.includes('service') ||
          beSummary.includes('persistence'),
        'Backend summary must emphasize backend / APIs / data persistence'
      );

      // DevOps emphasizes automation, docker, deployment, or infrastructure
      assert.ok(
        doSummary.includes('devops') ||
          doSummary.includes('docker') ||
          doSummary.includes('container') ||
          doSummary.includes('automation') ||
          doSummary.includes('pipeline') ||
          doSummary.includes('reliability'),
        'DevOps summary must emphasize DevOps / automation / containerization'
      );

      // Full-Stack emphasizes end-to-end or full-stack delivery
      assert.ok(
        fsSummary.includes('full-stack') ||
          fsSummary.includes('full stack') ||
          fsSummary.includes('end-to-end') ||
          fsSummary.includes('web application'),
        'Full-Stack summary must emphasize full-stack / end-to-end delivery'
      );
    });

    it('ensures all summaries preserve valid composedFromFactIds, evidenceRefs, sourceFact, and transformationType', () => {
      for (const [key, pkg] of Object.entries(results)) {
        const summary = pkg.tailoredResume?.structuredResume?.summary;
        assert.ok(
          Array.isArray(summary.composedFromFactIds),
          `${key} must have composedFromFactIds array`
        );
        assert.ok(
          summary.composedFromFactIds.length > 0,
          `${key} summary must be composed from candidate facts`
        );
        assert.ok(
          Array.isArray(summary.evidenceRefs),
          `${key} summary must have evidenceRefs array`
        );
        assert.ok(summary.evidenceRefs.length > 0, `${key} summary must have evidence refs`);
        assert.strictEqual(
          summary.provenanceStatus,
          'VERIFIED',
          `${key} summary provenanceStatus must be VERIFIED`
        );
        assert.ok(summary.sourceFact, `${key} summary must have sourceFact`);
        assert.ok(
          ['REWRITE', 'CONDENSE', 'COMBINE', 'EMPHASIZE', 'VERBATIM'].includes(
            summary.transformationType
          ),
          `${key} summary must have valid transformationType`
        );
        if (Array.isArray(summary.sentences) && summary.sentences.length > 0) {
          for (const s of summary.sentences) {
            assert.ok(s.text, `${key} summary sentence must have text`);
            assert.ok(
              s.composedFromFactIds?.length > 0,
              `${key} summary sentence must have composedFromFactIds`
            );
            assert.ok(s.sourceFact, `${key} summary sentence must have sourceFact`);
            assert.ok(
              ['REWRITE', 'CONDENSE', 'COMBINE', 'EMPHASIZE', 'VERBATIM'].includes(
                s.transformationType
              ),
              `${key} summary sentence must have valid transformationType`
            );
          }
        }
      }
    });
  });

  // =========================================================================
  // 2. Project Accomplishment Bullets Quality & Invariants
  // =========================================================================
  describe('2. Project Accomplishment Bullets Quality & Invariants', () => {
    it('strictly preserves the minimum 3 candidate-supported bullets per project across all jobs', () => {
      for (const [key, pkg] of Object.entries(results)) {
        const projects = pkg.tailoredResume?.structuredResume?.projects || [];
        assert.ok(projects.length >= 1, `${key} must render at least 1 project`);
        for (const proj of projects) {
          assert.ok(
            Array.isArray(proj.bullets) && proj.bullets.length >= 3,
            `Project "${proj.name}" in ${key} must have at least 3 bullets (got ${proj.bullets?.length})`
          );
        }
      }
    });

    it('ensures project bullets emphasize role-appropriate mechanisms for the same project', () => {
      // Find a project present in both Frontend and Backend
      const feProjects = results.frontend.tailoredResume.structuredResume.projects;
      const beProjects = results.pythonBackend.tailoredResume.structuredResume.projects;

      const feShared = feProjects.find((p) => beProjects.some((bp) => bp.name === p.name));
      const beShared = beProjects.find((p) => p.name === feShared?.name);

      if (feShared && beShared) {
        const feBulletTexts = feShared.bullets.map((b) => b.text.toLowerCase()).join(' ');
        const beBulletTexts = beShared.bullets.map((b) => b.text.toLowerCase()).join(' ');

        // Check that bullet order or text differs reflecting job conditioning
        const feFirstBullet = feShared.bullets[0].text;
        const beFirstBullet = beShared.bullets[0].text;
        assert.ok(
          feFirstBullet !== beFirstBullet || feBulletTexts !== beBulletTexts,
          'Project bullets must meaningfully reflect contrasting job conditioning'
        );
      }
    });

    it('ensures every project bullet is strictly candidate-supported with valid fact IDs, sourceFact, and transformationType', () => {
      for (const [key, pkg] of Object.entries(results)) {
        const projects = pkg.tailoredResume?.structuredResume?.projects || [];
        for (const proj of projects) {
          for (const bullet of proj.bullets) {
            assert.strictEqual(
              bullet.provenanceStatus,
              'VERIFIED',
              `Bullet in ${proj.name} must be VERIFIED`
            );
            assert.ok(
              Array.isArray(bullet.composedFromFactIds) && bullet.composedFromFactIds.length > 0,
              `Bullet in ${proj.name} must have valid composedFromFactIds`
            );
            assert.ok(
              Array.isArray(bullet.evidenceRefs) && bullet.evidenceRefs.length > 0,
              `Bullet in ${proj.name} must have valid evidenceRefs`
            );
            assert.ok(bullet.sourceFact, `Bullet in ${proj.name} must have sourceFact`);
            assert.ok(
              ['REWRITE', 'CONDENSE', 'COMBINE', 'EMPHASIZE', 'VERBATIM'].includes(
                bullet.transformationType
              ),
              `Bullet in ${proj.name} must have valid transformationType (got ${bullet.transformationType})`
            );
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. Optimizer Semantic Freeze Invariance
  // =========================================================================
  describe('3. Optimizer Semantic Freeze Invariance', () => {
    it('preserves bit-for-bit summary and project bullets across optimizer iterations', async () => {
      const optimizer = new ResumeContentOptimizer();
      const resume = results.pythonBackend.tailoredResume.structuredResume;
      const baselineSemantic = freezeSemanticResume(resume);

      const optResult = await optimizer.optimize({
        candidateProfile,
        jobPosting: jobPythonBackend,
        structuredResume: resume,
        applicationPackage: results.pythonBackend,
      });

      assert.ok(optResult.structuredResume, 'Optimizer must produce a structured resume');
      // Assert that semantic equivalence holds
      assertSemanticEquivalence(baselineSemantic, optResult.structuredResume);

      // Verify exact summary text identity
      assert.strictEqual(
        optResult.structuredResume.summary.text,
        resume.summary.text,
        'Optimizer must never mutate AI-generated summary text'
      );

      // Verify exact bullet text identity
      for (let i = 0; i < resume.projects.length; i++) {
        const origBullets = resume.projects[i].bullets.map((b) => b.text);
        const optBullets = optResult.structuredResume.projects[i].bullets.map((b) => b.text);
        assert.deepStrictEqual(
          optBullets,
          origBullets,
          `Optimizer must never mutate project bullets for ${resume.projects[i].name}`
        );
      }
    });
  });

  // =========================================================================
  // 4. Dual-Surface Parity (MCP and Extension)
  // =========================================================================
  describe('4. Dual-Surface Parity (MCP and Extension)', () => {
    it('produces bit-for-bit identical summary and project bullets between MCP tool and workflow service', async () => {
      // Execute MCP Tool directly for Python Backend
      const mcpResult = await handleGenerateTailoredResume(
        mcpContext,
        {
          candidateId: CANDIDATE_ID,
          jobDescriptionText: jobPythonBackend.description,
          jobTitle: jobPythonBackend.title,
        },
        { db, workflowService }
      );

      const workflowStructured = results.pythonBackend.tailoredResume.structuredResume;

      // Summary text identity
      assert.strictEqual(
        mcpResult.resume.basics.summary,
        workflowStructured.summary.text,
        'MCP and Extension must produce bit-for-bit identical summary text'
      );

      // Projects selection identity
      const workflowProjNames = workflowStructured.projects.map((p) => p.name);
      const mcpProjNames = mcpResult.resume.projects.map((p) => p.name);
      assert.deepStrictEqual(
        mcpProjNames,
        workflowProjNames,
        'MCP and Extension must select identical projects in identical order'
      );

      // Project bullets identity
      for (let i = 0; i < workflowStructured.projects.length; i++) {
        const workflowBullets = workflowStructured.projects[i].bullets.map((b) => b.text);
        const mcpBullets = mcpResult.resume.projects[i].bullets.map((b) =>
          typeof b === 'string' ? b : b.text
        );
        assert.deepStrictEqual(
          mcpBullets,
          workflowBullets,
          `MCP and Extension must produce identical bullets for project ${workflowProjNames[i]}`
        );
      }
    });
  });

  // =========================================================================
  // 5. Strict Evidence-Grounding and Anti-Fabrication Hard Regression Tests
  // =========================================================================
  describe('5. Strict Evidence-Grounding and Anti-Fabrication Hard Regression Tests', () => {
    let factInventory = null;
    let authenticFact = null;
    let validationContext = null;

    before(() => {
      factInventory = buildCanonicalFactInventory(candidateProfile, jobFullStack).facts;
      // Pick an authentic candidate-authored bullet fact for Vishwanath Nishad
      authenticFact =
        factInventory.find(
          (f) =>
            f.text &&
            f.text.includes('OpenAI API') &&
            f.agencyLevel === 'CANDIDATE' &&
            f.candidateAuthored
        ) || factInventory[0];
      validationContext = {
        factInventory,
        candidateProfile,
        sectionOwnerType: 'PROJECT',
        sectionOwnerId: authenticFact.association?.projectId || authenticFact.projectId || 'proj',
        project: {
          id: authenticFact.association?.projectId || authenticFact.projectId || 'proj',
          name: 'AI-Powered Code Review Assistant',
          technologies: ['Python', 'FastAPI', 'Flask', 'OpenAI', 'Git'],
        },
      };
    });

    it('rejects claims with unauthorized technologies (Raft, Kubernetes, Kafka, Prometheus)', () => {
      const claim = {
        text: 'Architected distributed consensus engine using Raft and Apache Kafka for event streaming.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text,
        transformationType: 'REWRITE',
      };

      const result = validateClaimEvidenceGrounding(claim, validationContext);
      assert.strictEqual(result.valid, false, 'Claim with Raft and Kafka must be rejected');
      assert.ok(
        result.violations.some(
          (v) => v.code === 'UNAUTHORIZED_TECHNOLOGY' || v.code === 'UNSUPPORTED_ARCHITECTURE_CLAIM'
        ),
        'Must report UNAUTHORIZED_TECHNOLOGY or UNSUPPORTED_ARCHITECTURE_CLAIM violation'
      );
    });

    it('rejects claims with unbacked metrics or percentages (65% latency reduction, 10,000 items)', () => {
      const claim = {
        text: 'Optimized PostgreSQL database queries resulting in a 65% latency reduction across 10,000 items.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text,
        transformationType: 'REWRITE',
      };

      const result = validateClaimEvidenceGrounding(claim, validationContext);
      assert.strictEqual(
        result.valid,
        false,
        'Claim with unbacked 65% latency and 10,000 items must be rejected'
      );
      assert.ok(
        result.violations.some((v) => v.code === 'UNSUPPORTED_METRIC'),
        'Must report UNSUPPORTED_METRIC violation'
      );
    });

    it('rejects technology substitution (substituting Gemini API when candidate used OpenAI API)', () => {
      const claim = {
        text: 'Developed automated code review assistant integrating Gemini API to analyze GitHub Pull Requests.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text, // authenticFact explicitly uses OpenAI API
        transformationType: 'REWRITE',
      };

      const result = validateClaimEvidenceGrounding(claim, validationContext);
      assert.strictEqual(
        result.valid,
        false,
        'Substituting Gemini API for OpenAI API must be rejected'
      );
      assert.ok(
        result.violations.some(
          (v) => v.code === 'TECHNOLOGY_SUBSTITUTION' || v.code === 'UNAUTHORIZED_TECHNOLOGY'
        ),
        'Must report TECHNOLOGY_SUBSTITUTION or UNAUTHORIZED_TECHNOLOGY violation'
      );
    });

    it('rejects unbacked architecture mechanisms (AST parsing)', () => {
      const claim = {
        text: 'Built code review scanner using AST parsing to analyze Python pull requests for syntax errors.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text,
        transformationType: 'REWRITE',
      };

      const result = validateClaimEvidenceGrounding(claim, validationContext);
      assert.strictEqual(result.valid, false, 'Unbacked AST parsing architecture must be rejected');
      assert.ok(
        result.violations.some((v) => v.code === 'UNSUPPORTED_ARCHITECTURE_CLAIM'),
        'Must report UNSUPPORTED_ARCHITECTURE_CLAIM violation'
      );
    });

    it('rejects empty fact IDs, missing source facts, and invalid transformation types', () => {
      // 1. Empty fact IDs
      const emptyFactsClaim = {
        text: 'Engineered high performance backend services with Python.',
        composedFromFactIds: [],
        sourceFact: authenticFact.text,
        transformationType: 'EMPHASIZE',
      };
      const res1 = validateClaimEvidenceGrounding(emptyFactsClaim, validationContext);
      assert.strictEqual(res1.valid, false);
      assert.ok(res1.violations.some((v) => v.code === 'EMPTY_FACT_IDS'));

      // 2. Unknown fact ID
      const unknownFactClaim = {
        text: 'Engineered high performance backend services with Python.',
        composedFromFactIds: ['non-existent-fact-id-99999'],
        sourceFact: authenticFact.text,
        transformationType: 'EMPHASIZE',
      };
      const res2 = validateClaimEvidenceGrounding(unknownFactClaim, validationContext);
      assert.strictEqual(res2.valid, false);
      assert.ok(res2.violations.some((v) => v.code === 'UNKNOWN_FACT_ID'));

      // 3. Missing sourceFact
      const missingSourceClaim = {
        text: 'Engineered high performance backend services with Python.',
        composedFromFactIds: [authenticFact.factId],
        transformationType: 'EMPHASIZE',
      };
      const res3 = validateClaimEvidenceGrounding(missingSourceClaim, validationContext);
      assert.strictEqual(res3.valid, false);
      assert.ok(res3.violations.some((v) => v.code === 'MISSING_SOURCE_FACT'));

      // 4. Invalid transformationType
      const invalidTransformClaim = {
        text: 'Engineered high performance backend services with Python.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text,
        transformationType: 'HALLUCINATE',
      };
      const res4 = validateClaimEvidenceGrounding(invalidTransformClaim, validationContext);
      assert.strictEqual(res4.valid, false);
      assert.ok(res4.violations.some((v) => v.code === 'INVALID_TRANSFORMATION_TYPE'));
    });

    it('rejects claims referencing foreign candidate fact IDs', () => {
      const foreignFact = {
        factId: 'foreign-fact-123',
        candidateId: 'different-candidate-uuid-8888',
        text: 'Engineered distributed caching layer in Redis.',
        technologies: ['Redis'],
      };
      const contextWithForeignFact = {
        ...validationContext,
        factInventory: [...factInventory, foreignFact],
      };

      const claim = {
        text: 'Engineered distributed caching layer in Redis.',
        composedFromFactIds: ['foreign-fact-123'],
        sourceFact: foreignFact.text,
        transformationType: 'VERBATIM',
      };

      const result = validateClaimEvidenceGrounding(claim, contextWithForeignFact);
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.violations.some((v) => v.code === 'FOREIGN_CANDIDATE_FACT'),
        'Must reject facts from foreign candidate IDs'
      );
    });

    it('accepts genuine candidate claims supported by authentic candidate evidence', () => {
      const genuineClaim = {
        text: 'Developed an intelligent automated code review system by integrating OpenAI API to analyze GitHub Pull Requests, identifying style issues and suggesting bug fixes.',
        composedFromFactIds: [authenticFact.factId],
        sourceFact: authenticFact.text,
        transformationType: 'EMPHASIZE',
      };

      const result = validateClaimEvidenceGrounding(genuineClaim, validationContext);
      assert.strictEqual(
        result.valid,
        true,
        `Genuine claim must be valid, got violations: ${JSON.stringify(result.violations)}`
      );
      assert.strictEqual(result.violations.length, 0);
    });
  });
});
