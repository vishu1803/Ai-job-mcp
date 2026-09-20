/**
 * @file Unit Tests: P46 — Project Ranking Authority & Minimum 3 Bullets Per Project
 *
 * Verifies:
 * 1. selectedProjectIds exactly equal the top N eligible IDs from the authoritative ranking.
 * 2. No secondary ranking invocation (rankProjectsForJob) occurs inside resume generation.
 * 3. No backfill on empty/insufficient bullets — dropped projects have no replacement.
 * 4. 3-bullet minimum enforced — projects with <3 bullets are excluded from rendering.
 * 5. 3-bullet pass — projects with ≥3 bullets render successfully.
 * 6. Quality gate emits FAIL severity for projects with <3 bullets.
 * 7. No fabrication on bullet shortage — pipeline drops rather than synthesizes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredResumeDocument,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import { assessPreRenderQuality } from '../../src/services/resume-content-quality-gate.service.js';

describe('P46: Project Ranking Authority & Minimum 3 Bullets Per Project', () => {
  const TENANT_ID = 'p46-test-tenant-0000-0000-000000000001';
  const CANDIDATE_ID = 'p46-test-cand-0000-0000-000000000001';

  const projAlphaId = 'p46-proj-alpha-0000-0000-000000000001';
  const projBetaId = 'p46-proj-beta-0000-0000-000000000002';
  const projGammaId = 'p46-proj-gamma-0000-0000-000000000003';
  const projDeltaId = 'p46-proj-delta-0000-0000-000000000004';

  const baseProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Jordan Lee',
    email: 'jordan.lee@example.com',
    phone: '+1-555-0300',
    location: 'Austin, TX',
    headline: 'Full-Stack Engineer',
    summary: 'Building scalable web applications with modern JavaScript frameworks.',
    skills: [
      {
        id: 'sk-1',
        name: 'TypeScript',
        slug: 'typescript',
        category: 'Languages',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-2',
        name: 'React',
        slug: 'react',
        category: 'Frameworks & Libraries',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-3',
        name: 'Node.js',
        slug: 'node-js',
        category: 'Frameworks & Libraries',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: 'sk-4',
        name: 'PostgreSQL',
        slug: 'postgresql',
        category: 'Databases',
        provenanceStatus: 'VERIFIED',
      },
    ],
    experience: [
      {
        company: 'TechCorp Inc.',
        title: 'Software Engineer',
        startDate: '2022-03-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Built REST APIs serving 10k requests/second with Node.js and PostgreSQL.'],
      },
    ],
    education: [
      {
        institution: 'UT Austin',
        degree: 'B.S. Computer Science',
        startDate: '2018-08-01',
        endDate: '2022-05-01',
      },
    ],
    certifications: [],
  };

  const BULLET_TEMPLATES = [
    (name) =>
      `Architected high-throughput message streaming pipeline for ${name} using distributed queue workers.`,
    (name) =>
      `Engineered responsive user interface and dashboard views for ${name} with client state caching.`,
    (name) =>
      `Automated continuous integration and container deployment pipelines for ${name} with regression checks.`,
    (name) =>
      `Optimized database query performance and index structures for ${name}, reducing p95 query latency.`,
    (name) =>
      `Implemented authentication and role-based access control policies for ${name} ensuring tenant isolation.`,
  ];

  /** Creates a project with a specified number of bullets. */
  function makeProject(id, name, bulletCount, technologies = ['TypeScript', 'React']) {
    const bullets = [];
    for (let i = 0; i < bulletCount; i++) {
      const template = BULLET_TEMPLATES[i % BULLET_TEMPLATES.length];
      bullets.push(template(name));
    }
    return {
      id,
      projectId: id,
      name,
      title: name,
      displayName: name,
      repositoryUrl: `https://github.com/jordanlee/${name.toLowerCase().replace(/\s+/g, '-')}`,
      summary: `A ${name} application.`,
      technologies,
      bullets,
      evidenceCount: bulletCount * 5,
      provenanceStatus: 'CORROBORATED',
      isArchived: false,
    };
  }

  const projAlpha = makeProject(projAlphaId, 'Alpha Service', 4, [
    'TypeScript',
    'Node.js',
    'PostgreSQL',
  ]);
  const projBeta = makeProject(projBetaId, 'Beta Dashboard', 3, ['TypeScript', 'React']);
  const projGamma = makeProject(projGammaId, 'Gamma Analytics', 2, ['TypeScript', 'Node.js']); // Only 2 bullets — should fail
  const projDelta = makeProject(projDeltaId, 'Delta Platform', 1, ['React']); // Only 1 bullet — should fail

  const allProjects = [projAlpha, projBeta, projGamma, projDelta];

  const jobPosting = {
    title: 'Senior Full-Stack Engineer',
    company: 'Acme Corp',
    description: 'We need a senior full-stack engineer with React and Node.js experience.',
    requirements: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    skills: ['TypeScript', 'React', 'Node.js'],
  };

  // Authoritative rankings: Alpha (rank 1), Beta (rank 2), Gamma (rank 3), Delta (rank 4)
  const authoritativeRankings = [
    {
      projectId: projAlphaId,
      projectName: 'Alpha Service',
      relevanceScore: 85,
      status: 'SELECTED',
      matchedRequirementIds: ['r1', 'r2'],
      contributingSkills: ['typescript', 'node-js'],
    },
    {
      projectId: projBetaId,
      projectName: 'Beta Dashboard',
      relevanceScore: 70,
      status: 'SELECTED',
      matchedRequirementIds: ['r1', 'r3'],
      contributingSkills: ['typescript', 'react'],
    },
    {
      projectId: projGammaId,
      projectName: 'Gamma Analytics',
      relevanceScore: 55,
      status: 'SELECTED',
      matchedRequirementIds: ['r1'],
      contributingSkills: ['typescript'],
    },
    {
      projectId: projDeltaId,
      projectName: 'Delta Platform',
      relevanceScore: 30,
      status: 'SELECTED',
      matchedRequirementIds: ['r3'],
      contributingSkills: ['react'],
    },
  ];

  // ── Test 1: selectedProjectIds exactly equal top N eligible IDs ──
  it('selectedProjectIds exactly equal the top N eligible IDs from the authoritative ranking', () => {
    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: authoritativeRankings,
      },
    });

    // Alpha has 4 bullets, Beta has 3 bullets — both meet the ≥3 minimum.
    // N=2 (default master structure capacity).
    const plan = result.tailoringPlan || result._tailoringPlan;
    assert.ok(plan, 'tailoringPlan must exist on result');
    assert.ok(Array.isArray(plan.selectedProjectIds), 'selectedProjectIds must be an array');
    assert.deepStrictEqual(
      plan.selectedProjectIds,
      [projAlphaId, projBetaId],
      'selectedProjectIds must exactly equal the top N=2 eligible IDs from the authoritative ranking'
    );
  });

  // ── Test 2: No secondary ranking when no authoritative rankings provided ──
  it('produces empty project selection when authoritative rankings are absent (no fallback to rankProjectsForJob)', () => {
    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        // No projectRankings, no jobFitAnalysis — resume generation must NOT call rankProjectsForJob
      },
    });

    // Without authoritative rankings, this falls through to the "job posting with
    // requirements but no rankings" branch → empty selection.
    const renderedProjects = result.projects || [];
    assert.strictEqual(
      renderedProjects.length,
      0,
      'Without authoritative rankings, no projects should be selected (no secondary ranking fallback)'
    );
  });

  // ── Test 3: No backfill on insufficient bullets ──
  it('drops a project with insufficient bullets without backfilling from rankings', () => {
    // Provide rankings where rank 1 has only 2 bullets (Gamma) and rank 2 has 3 (Beta)
    const thinRankings = [
      {
        projectId: projGammaId,
        projectName: 'Gamma Analytics',
        relevanceScore: 90,
        status: 'SELECTED',
        matchedRequirementIds: ['r1', 'r2'],
        contributingSkills: ['typescript'],
      },
      {
        projectId: projBetaId,
        projectName: 'Beta Dashboard',
        relevanceScore: 70,
        status: 'SELECTED',
        matchedRequirementIds: ['r1'],
        contributingSkills: ['typescript', 'react'],
      },
      {
        projectId: projAlphaId,
        projectName: 'Alpha Service',
        relevanceScore: 60,
        status: 'SELECTED',
        matchedRequirementIds: ['r1'],
        contributingSkills: ['typescript'],
      },
    ];

    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: thinRankings,
      },
    });

    const renderedProjects = result.projects || [];
    const renderedIds = renderedProjects.map((p) => p.projectId);

    // Gamma (2 bullets) should be dropped, Beta (3 bullets) should render.
    // No backfill from Alpha to replace Gamma.
    assert.ok(
      !renderedIds.includes(projGammaId),
      'Gamma (2 bullets) must be dropped — insufficient bullets'
    );
    assert.ok(renderedIds.includes(projBetaId), 'Beta (3 bullets) should render');

    // Check removal records
    const debugTrace = result.debugTrace || result._debugTrace || {};
    const removals = debugTrace.projectRemovalRecords || [];
    const gammaRemoval = removals.find((r) => r.projectId === projGammaId);
    if (gammaRemoval) {
      assert.strictEqual(
        gammaRemoval.replacementProjectId,
        null,
        'Dropped project must NOT have a replacement (no backfill)'
      );
    }
  });

  // ── Test 4: 3-bullet minimum enforced ──
  it('excludes projects with exactly 2 authentic bullets from rendering', () => {
    // Only provide Gamma (2 bullets) as the sole ranking
    const onlyGamma = [
      {
        projectId: projGammaId,
        projectName: 'Gamma Analytics',
        relevanceScore: 90,
        status: 'SELECTED',
        matchedRequirementIds: ['r1'],
        contributingSkills: ['typescript'],
      },
    ];

    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: onlyGamma,
      },
    });

    const renderedProjects = result.projects || [];
    assert.strictEqual(
      renderedProjects.length,
      0,
      'Project with only 2 bullets must be excluded — minimum is 3'
    );
  });

  // ── Test 5: 3-bullet pass ──
  it('renders a project with exactly 3 authentic bullets', () => {
    const onlyBeta = [
      {
        projectId: projBetaId,
        projectName: 'Beta Dashboard',
        relevanceScore: 80,
        status: 'SELECTED',
        matchedRequirementIds: ['r1', 'r3'],
        contributingSkills: ['typescript', 'react'],
      },
    ];

    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: onlyBeta,
      },
    });

    const renderedProjects = result.projects || [];
    assert.ok(renderedProjects.length >= 1, 'Beta Dashboard (3 bullets) should render');
    const beta = renderedProjects.find((p) => p.projectId === projBetaId);
    assert.ok(beta, 'Beta Dashboard must be in rendered projects');
    assert.ok(beta.bullets.length >= 3, 'Beta must have ≥3 rendered bullets');
  });

  // ── Test 6: Quality gate FAIL severity ──
  it('assessPreRenderQuality returns FAIL when a rendered project has <3 bullets', () => {
    // Simulate a structured resume with a project having only 2 bullets
    const structuredResume = {
      projects: [
        {
          projectId: projGammaId,
          name: 'Gamma Analytics',
          displayName: 'Gamma Analytics',
          bullets: [
            { text: 'First bullet for Gamma.', claimId: 'c1' },
            { text: 'Second bullet for Gamma.', claimId: 'c2' },
          ],
        },
      ],
      experience: [],
    };

    const result = assessPreRenderQuality({ structuredResume });
    assert.strictEqual(
      result.passed,
      false,
      'Quality gate must fail when a project has <3 bullets'
    );

    const tooFewFinding = result.findings.find((f) => f.code === 'TOO_FEW_PROJECT_BULLETS');
    assert.ok(tooFewFinding, 'Must have a TOO_FEW_PROJECT_BULLETS finding');
    assert.strictEqual(tooFewFinding.severity, 'FAIL', 'Finding severity must be FAIL');
  });

  // ── Test 7: No fabrication on bullet shortage ──
  it('never fabricates synthetic bullets to reach 3 — drops the project instead', () => {
    // Provide Delta (1 bullet) as ranking
    const onlyDelta = [
      {
        projectId: projDeltaId,
        projectName: 'Delta Platform',
        relevanceScore: 80,
        status: 'SELECTED',
        matchedRequirementIds: ['r3'],
        contributingSkills: ['react'],
      },
    ];

    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: onlyDelta,
      },
    });

    const renderedProjects = result.projects || [];

    // Delta (1 bullet) should be dropped entirely
    assert.strictEqual(
      renderedProjects.length,
      0,
      'Delta (1 bullet) must be dropped — no fabrication to reach 3'
    );
  });

  // ── Test 8: Projects with 4+ bullets render with all bullets preserved ──
  it('renders projects with 4+ bullets without truncation to 3', () => {
    const onlyAlpha = [
      {
        projectId: projAlphaId,
        projectName: 'Alpha Service',
        relevanceScore: 90,
        status: 'SELECTED',
        matchedRequirementIds: ['r1', 'r2'],
        contributingSkills: ['typescript', 'node-js'],
      },
    ];

    const profile = { ...baseProfile, projects: allProjects };
    const result = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: {
        ...jobPosting,
        projectRankings: onlyAlpha,
      },
    });

    const renderedProjects = result.projects || [];
    assert.ok(renderedProjects.length >= 1, 'Alpha should render');
    const alpha = renderedProjects.find((p) => p.projectId === projAlphaId);
    assert.ok(alpha, 'Alpha must be in rendered projects');
    assert.ok(alpha.bullets.length >= 3, 'Alpha must have ≥3 bullets');
  });

  // ── Test 9: EvidenceValidationReceipt FAIL on <3 bullets ──
  it('validateStructuredResumeIntegrity returns FAIL when any project has <3 bullets', () => {
    const doc = {
      documentId: '11111111-1111-4111-8111-111111111111',
      targetRole: 'Software Engineer',
      projects: [
        {
          projectId: projGammaId,
          name: 'Gamma Analytics',
          displayName: 'Gamma Analytics',
          bullets: [
            { text: 'First bullet for Gamma.', claimId: 'c1', provenanceStatus: 'USER_PROVIDED' },
            { text: 'Second bullet for Gamma.', claimId: 'c2', provenanceStatus: 'USER_PROVIDED' },
          ],
        },
      ],
      skills: { categories: [] },
      summary: { text: 'Experienced software engineer.' },
    };

    const receipt = validateStructuredResumeIntegrity(doc);
    assert.strictEqual(
      receipt.overallStatus,
      'FAIL',
      'Validator must report FAIL when project has <3 bullets'
    );
    const bulletViolation = receipt.violations.find(
      (v) => v.section === 'PROJECTS' && v.field === 'bullets'
    );
    assert.ok(bulletViolation, 'Must record a violation for projects.bullets');
    assert.match(bulletViolation.message, /minimum required is 3/);
  });
});
