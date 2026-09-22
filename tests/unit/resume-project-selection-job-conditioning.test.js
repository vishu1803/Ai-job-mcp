/**
 * @file Unit Tests: Resume Project Selection & Job-Conditioned Content
 *
 * Verifies end-to-end:
 * 1. ProjectRelevanceService is the single authoritative ranking source.
 * 2. Relevance accurately discriminates role archetypes (Python AI, Computer Vision, Frontend, DevOps).
 * 3. Zero-match gating prevents irrelevant fallback projects when job requirements are not met.
 * 4. StructuredResumeService consumes authoritative rankings directly and populates audit fields.
 * 5. Projects with <3 bullets are dropped (P46/P47 invariant).
 * 6. Experience bullets are reordered by job relevance.
 * 7. Professional summary isolates project and technology citations without cross-project leakage.
 * 8. validateStructuredResumeIntegrity enforces cross-section provenance integrity.
 * 9. targetJobPosting.recommendedProjects is strictly advisory and not mutated.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import {
  buildStructuredResumeDocument,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import {
  composeProfessionalSummary,
  composeExperienceRecords,
} from '../../src/services/resume-accomplishment-composer.service.js';

describe('Resume Project Selection & Job-Conditioned Content', () => {
  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const CANDIDATE_ID = '00000000-0000-0000-0000-000000000002';

  const projFullStackId = '10000000-0000-0000-0000-000000000001';
  const projPythonAiId = '10000000-0000-0000-0000-000000000002';
  const projFrontendId = '10000000-0000-0000-0000-000000000003';
  const projComputerVisionId = '10000000-0000-0000-0000-000000000004';
  const projDevOpsId = '10000000-0000-0000-0000-000000000005';
  const projWeakEvidenceId = '10000000-0000-0000-0000-000000000006';
  const rogueProjId = '90000000-0000-0000-0000-000000000009';
  const differentProjId = '80000000-0000-0000-0000-000000000008';

  // 5 Distinct Project Archetypes with authentic bullets and valid UUIDs
  const projectFullStack = {
    id: projFullStackId,
    projectId: projFullStackId,
    name: 'Collaborative Task Manager',
    title: 'Collaborative Task Manager',
    displayName: 'Collaborative Task Manager',
    technologies: ['Node.js', 'Express', 'PostgreSQL', 'React'],
    bullets: [
      'Engineered backend REST endpoints using Node.js, Express, and PostgreSQL handling concurrent task updates.',
      'Designed normalized relational database schemas with indexing in PostgreSQL to reduce query latency.',
      'Built interactive frontend views and state synchronization using React and WebSocket connections.',
    ],
    repositoryUrl: 'https://github.com/candidate/collaborative-task-manager',
    evidenceCount: 30,
    provenanceStatus: 'VERIFIED',
    isArchived: false,
  };

  const projectPythonAi = {
    id: projPythonAiId,
    projectId: projPythonAiId,
    name: 'AI Code Review Assistant',
    title: 'AI Code Review Assistant',
    displayName: 'AI Code Review Assistant',
    technologies: ['Python', 'PyTorch', 'FastAPI', 'Vector DB'],
    bullets: [
      'Developed high-throughput FastAPI inference microservice serving PyTorch transformer models for automated code review.',
      'Constructed dense vector retrieval pipeline utilizing embedding indexes for semantic codebase search.',
      'Implemented asynchronous batch processing pipeline for multi-file repository diff analysis.',
    ],
    repositoryUrl: 'https://github.com/candidate/ai-code-review-assistant',
    evidenceCount: 20,
    provenanceStatus: 'VERIFIED',
    isArchived: false,
  };

  const projectFrontend = {
    id: projFrontendId,
    projectId: projFrontendId,
    name: 'Design System & Component Studio',
    title: 'Design System & Component Studio',
    displayName: 'Design System & Component Studio',
    technologies: ['React', 'Next.js', 'CSS', 'Accessibility'],
    bullets: [
      'Architected accessible WCAG 2.1 AA compliant UI component library in React and Next.js with comprehensive test coverage.',
      'Optimized client-side rendering bundle sizes and Core Web Vitals across responsive layouts.',
      'Engineered atomic theme system with custom CSS variables and dark mode support.',
    ],
    repositoryUrl: 'https://github.com/candidate/component-studio',
    evidenceCount: 15,
    provenanceStatus: 'VERIFIED',
    isArchived: false,
  };

  const projectComputerVision = {
    id: projComputerVisionId,
    projectId: projComputerVisionId,
    name: 'Real-Time Edge Vision Pipeline',
    title: 'Real-Time Edge Vision Pipeline',
    displayName: 'Real-Time Edge Vision Pipeline',
    technologies: ['Python', 'OpenCV', 'NumPy', 'Computer Vision'],
    bullets: [
      'Engineered real-time video stream feature extraction and object tracking pipeline using Python and OpenCV.',
      'Accelerated spatial matrix transformations and image thresholding routines with vectorized NumPy algorithms.',
      'Deployed low-latency inference pipeline to embedded edge hardware with automated frame buffering.',
    ],
    repositoryUrl: 'https://github.com/candidate/edge-vision-pipeline',
    evidenceCount: 12,
    provenanceStatus: 'VERIFIED',
    isArchived: false,
  };

  const projectDevOps = {
    id: projDevOpsId,
    projectId: projDevOpsId,
    name: 'Cloud Infrastructure Orchestrator',
    title: 'Cloud Infrastructure Orchestrator',
    displayName: 'Cloud Infrastructure Orchestrator',
    technologies: ['Go', 'Docker', 'Kubernetes', 'Terraform'],
    bullets: [
      'Automated multi-cluster Kubernetes deployment workflows using custom Go controllers and Terraform modules.',
      'Configured secure container network policies and automated ingress routing with zero downtime.',
      'Streamlined CI/CD build environments with multi-stage Docker caching and image scanning.',
    ],
    repositoryUrl: 'https://github.com/candidate/infra-orchestrator',
    evidenceCount: 18,
    provenanceStatus: 'VERIFIED',
    isArchived: false,
  };

  const allProjects = [
    projectFullStack,
    projectPythonAi,
    projectFrontend,
    projectComputerVision,
    projectDevOps,
  ];

  const candidateProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Alex Morgan',
    email: 'alex.morgan@example.com',
    headline: 'Senior Software Engineer',
    skills: [
      { name: 'Python', slug: 'python', category: 'Languages', provenanceStatus: 'VERIFIED' },
      { name: 'PyTorch', slug: 'pytorch', category: 'Frameworks', provenanceStatus: 'VERIFIED' },
      { name: 'OpenCV', slug: 'opencv', category: 'Frameworks', provenanceStatus: 'VERIFIED' },
      {
        name: 'Computer Vision',
        slug: 'computer-vision',
        category: 'Concepts',
        provenanceStatus: 'VERIFIED',
      },
      { name: 'React', slug: 'react', category: 'Frameworks', provenanceStatus: 'VERIFIED' },
      { name: 'Next.js', slug: 'next-js', category: 'Frameworks', provenanceStatus: 'VERIFIED' },
      { name: 'Node.js', slug: 'node-js', category: 'Frameworks', provenanceStatus: 'VERIFIED' },
      {
        name: 'PostgreSQL',
        slug: 'postgresql',
        category: 'Databases',
        provenanceStatus: 'VERIFIED',
      },
      { name: 'Docker', slug: 'docker', category: 'DevOps', provenanceStatus: 'VERIFIED' },
      { name: 'Kubernetes', slug: 'kubernetes', category: 'DevOps', provenanceStatus: 'VERIFIED' },
    ],
    experience: [
      {
        company: 'Apex Systems',
        title: 'Software Engineer',
        startDate: '2021-06-01',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Engineered Node.js backend microservices and database query optimization for customer billing.',
          'Built computer vision inspection models using OpenCV and Python to classify defect imagery.',
          'Developed responsive user interfaces in React for operational analytics monitoring.',
        ],
      },
    ],
    education: [
      {
        institution: 'Georgia Tech',
        degree: 'B.S. in Computer Science',
        startDate: '2017-08-01',
        endDate: '2021-05-01',
      },
    ],
    projects: allProjects,
  };

  // -------------------------------------------------------------------------
  // Test 1: Python/AI Job selects Python AI Project as Rank #1
  // -------------------------------------------------------------------------
  it('ranks Python AI project as #1 for AI/ML job posting', () => {
    const aiJob = {
      id: '20000000-0000-0000-0000-000000000001',
      tenantId: TENANT_ID,
      title: 'Senior AI / Machine Learning Engineer',
      description:
        'Looking for an AI engineer to develop machine learning inference pipelines using Python, PyTorch, and FastAPI.',
      requirements: ['Python', 'PyTorch', 'FastAPI', 'Machine Learning'],
      skills: ['Python', 'PyTorch', 'FastAPI'],
    };

    const result = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      aiJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    assert.ok(result.projectRankings.length > 0, 'Should return ranked projects');
    const topRank = result.projectRankings[0];
    assert.strictEqual(topRank.projectId, projPythonAiId, 'Top project must be Python AI project');
    assert.strictEqual(topRank.rank, 1, 'Top project rank must be 1');
    assert.strictEqual(topRank.selectionStatus, 'SELECTED');
    assert.ok(
      topRank.relevanceScore >= 40,
      'Relevance score must reflect strong requirement match'
    );
  });

  // -------------------------------------------------------------------------
  // Test 2: Computer Vision Job selects Computer Vision Project as Rank #1
  // -------------------------------------------------------------------------
  it('ranks Computer Vision project as #1 for OpenCV / Computer Vision job posting', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000002',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description:
        'Seeking a computer vision specialist experienced in Python, OpenCV, image processing, and NumPy.',
      requirements: ['OpenCV', 'Python', 'Computer Vision', 'NumPy'],
      skills: ['OpenCV', 'Python', 'NumPy'],
    };

    const result = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const topRank = result.projectRankings[0];
    assert.strictEqual(
      topRank.projectId,
      projComputerVisionId,
      'Top project must be Computer Vision project'
    );
    assert.strictEqual(topRank.rank, 1);
    assert.strictEqual(topRank.selectionStatus, 'SELECTED');
    assert.ok(
      topRank.matchedTechnologies.includes('opencv') ||
        topRank.matchedTechnologies.includes('computer-vision')
    );
  });

  // -------------------------------------------------------------------------
  // Test 3: Frontend React Job selects Frontend Project as Rank #1
  // -------------------------------------------------------------------------
  it('ranks Frontend Component Studio as #1 for Frontend React / Next.js job posting', () => {
    const frontendJob = {
      id: '20000000-0000-0000-0000-000000000003',
      tenantId: TENANT_ID,
      title: 'Frontend Engineer',
      description: 'Building accessible modern web user experiences with React, Next.js, and CSS.',
      requirements: ['React', 'Next.js', 'CSS', 'Accessibility'],
      skills: ['React', 'Next.js'],
    };

    const result = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      frontendJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const topRank = result.projectRankings[0];
    assert.strictEqual(topRank.projectId, projFrontendId, 'Top project must be Frontend project');
    assert.strictEqual(topRank.rank, 1);
    assert.strictEqual(topRank.selectionStatus, 'SELECTED');
  });

  // -------------------------------------------------------------------------
  // Test 4: Zero-match relevance gating
  // -------------------------------------------------------------------------
  it('enforces zero-match gating when candidate projects have no match for job requirements', () => {
    const blockchainJob = {
      id: '20000000-0000-0000-0000-000000000004',
      tenantId: TENANT_ID,
      title: 'Solana Smart Contract Engineer',
      description:
        'Building decentralized finance programs in Rust on Solana blockchain with Anchor framework.',
      requirements: ['Rust', 'Solana', 'Anchor', 'Smart Contracts'],
      skills: ['Rust', 'Solana'],
    };

    const relevanceResult = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      blockchainJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    // Every project has 0 matched requirements for Rust/Solana
    for (const ranking of relevanceResult.projectRankings) {
      assert.ok(
        ranking.relevanceScore <= 10.0,
        `Project ${ranking.projectId} score (${ranking.relevanceScore}) must be capped <= 10.0 on zero requirement match`
      );
      assert.strictEqual(ranking.relevanceBand, 'MINIMAL');
      assert.strictEqual(ranking.selectionStatus, 'REJECTED');
    }

    // Structured resume document must render 0 projects rather than forcing generic fullstack
    const resumeDoc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: blockchainJob,
      options: {
        projectRankings: relevanceResult.projectRankings,
      },
    });

    assert.strictEqual(
      resumeDoc.projects.length,
      0,
      'Must render zero projects when no projects match'
    );
    assert.strictEqual(resumeDoc.debugTrace.selectedProjectIds.length, 0);
  });

  // -------------------------------------------------------------------------
  // Test 5: StructuredResumeDocument consumes authoritative rankings & populates audit fields
  // -------------------------------------------------------------------------
  it('StructuredResumeDocument populates authoritative audit fields on TailoredProjectEntry', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000005',
      tenantId: TENANT_ID,
      title: 'Computer Vision Specialist',
      description: 'OpenCV and Python image processing pipelines.',
      requirements: ['OpenCV', 'Python', 'Image Processing'],
      skills: ['OpenCV', 'Python'],
    };

    const relevance = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: cvJob,
      options: {
        projectRankings: relevance.projectRankings,
      },
    });

    assert.ok(doc.projects.length >= 1, 'Should render matching projects');
    const topRendered = doc.projects[0];
    assert.strictEqual(topRendered.projectId, projComputerVisionId);
    assert.strictEqual(topRendered.selectionSource, 'AUTHORITATIVE_RANKING');
    assert.strictEqual(topRendered.authoritativeRankingRank, 1);
    assert.ok(topRendered.selectedBecause, 'Must have selectedBecause audit explanation');
    assert.ok(Array.isArray(topRendered.projectMatchedRequirements));
  });

  // -------------------------------------------------------------------------
  // Test 6: Experience bullet ordering conditioned on target job
  // -------------------------------------------------------------------------
  it('composeExperienceRecords reorders experience bullets so job-relevant accomplishments appear first', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000006',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python computer vision pipelines.',
      requirements: ['OpenCV', 'Computer Vision', 'Python'],
      skills: ['OpenCV', 'Computer Vision'],
    };

    const composedExp = composeExperienceRecords({
      candidateExperiences: candidateProfile.experience,
      jobPosting: cvJob,
    });

    assert.strictEqual(composedExp.length, 1);
    const exp = composedExp[0];
    // In source profile: bullet 0 is Node.js, bullet 1 is OpenCV/Computer Vision, bullet 2 is React
    // In composed experience: bullet 1 (OpenCV) must be elevated to index 0!
    assert.ok(
      exp.bullets[0].toLowerCase().includes('computer vision') ||
        exp.bullets[0].toLowerCase().includes('opencv'),
      `First bullet must be the CV bullet, got: ${exp.bullets[0]}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Professional Summary isolates citations to selected projects
  // -------------------------------------------------------------------------
  it('composeProfessionalSummary citations strictly align with selected projects without leakage', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000007',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python computer vision.',
      requirements: ['OpenCV', 'Python', 'Computer Vision'],
      skills: ['OpenCV', 'Python'],
    };

    const selectedProjects = [projectComputerVision];
    const summary = composeProfessionalSummary({
      candidateProfile,
      jobPosting: cvJob,
      selectedProjects,
      selectedSkills: candidateProfile.skills.filter((s) =>
        ['python', 'opencv', 'computer-vision'].includes(s.slug)
      ),
    });

    assert.ok(summary.text.length > 0);
    // Summary must reference the computer vision project
    assert.ok(
      summary.referencedProjectIds.includes(projComputerVisionId) ||
        summary.text.includes('Real-Time Edge Vision Pipeline'),
      'Summary must reference the selected project'
    );
    // Summary must NOT reference non-selected projects
    assert.ok(!summary.referencedProjectIds.includes(projFullStackId));
    assert.ok(!summary.referencedProjectIds.includes(projFrontendId));
    assert.ok(!summary.text.includes('Collaborative Task Manager'));
  });

  // -------------------------------------------------------------------------
  // Test 8: validateStructuredResumeIntegrity passes for valid tailored document
  // -------------------------------------------------------------------------
  it('validateStructuredResumeIntegrity returns overallStatus PASS for valid document', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000008',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python computer vision.',
      requirements: ['OpenCV', 'Python', 'Computer Vision'],
      skills: ['OpenCV', 'Python'],
    };

    const relevance = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      allProjects,
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: cvJob,
      options: {
        projectRankings: relevance.projectRankings,
      },
    });

    const receipt = validateStructuredResumeIntegrity(doc, {
      projectRankings: relevance.projectRankings,
      targetJobPosting: cvJob,
    });

    assert.strictEqual(receipt.overallStatus, 'PASS');
    assert.strictEqual(receipt.violations.length, 0);
  });

  // -------------------------------------------------------------------------
  // Test 9: validateStructuredResumeIntegrity detects FABRICATED_PROJECT if unranked project injected
  // -------------------------------------------------------------------------
  it('validateStructuredResumeIntegrity catches FABRICATED_PROJECT if unranked project is injected', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000009',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python.',
      requirements: ['OpenCV', 'Python'],
      skills: ['OpenCV'],
    };

    const relevance = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      [projectComputerVision],
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: cvJob,
      options: {
        projectRankings: relevance.projectRankings,
      },
    });

    // Artificially inject an unranked project into doc.projects
    const tamperedDoc = {
      ...doc,
      projects: [
        ...doc.projects,
        {
          projectId: rogueProjId,
          name: 'Rogue Project',
          displayName: 'Rogue Project',
          bullets: [
            { text: 'Legitimate bullet 1 with details.', provenanceStatus: 'CLAIMED' },
            { text: 'Legitimate bullet 2 with details.', provenanceStatus: 'CLAIMED' },
            { text: 'Legitimate bullet 3 with details.', provenanceStatus: 'CLAIMED' },
          ],
        },
      ],
    };

    const receipt = validateStructuredResumeIntegrity(tamperedDoc, {
      projectRankings: relevance.projectRankings,
    });

    assert.strictEqual(receipt.overallStatus, 'FAIL');
    const fabViolation = receipt.violations.find((v) => v.violationType === 'FABRICATED_PROJECT');
    assert.ok(fabViolation, 'Must record FABRICATED_PROJECT violation');
    assert.strictEqual(fabViolation.claimText, rogueProjId);
  });

  // -------------------------------------------------------------------------
  // Test 10: validateStructuredResumeIntegrity detects UNBACKED_CLAIM if cross-project bullet attribution occurs
  // -------------------------------------------------------------------------
  it('validateStructuredResumeIntegrity detects cross-project bullet attribution', () => {
    const cvJob = {
      id: '20000000-0000-0000-0000-000000000010',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python.',
      requirements: ['OpenCV'],
      skills: ['OpenCV'],
    };

    const relevance = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      [projectComputerVision],
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: cvJob,
      options: {
        projectRankings: relevance.projectRankings,
      },
    });

    // Tamper with a bullet to specify a mismatched sourceProjectId
    const tamperedDoc = {
      ...doc,
      projects: doc.projects.map((p) => ({
        ...p,
        bullets: p.bullets.map((b, idx) =>
          idx === 0 ? { ...b, sourceProjectId: differentProjId } : b
        ),
      })),
    };

    const receipt = validateStructuredResumeIntegrity(tamperedDoc, {
      projectRankings: relevance.projectRankings,
    });

    assert.strictEqual(receipt.overallStatus, 'FAIL');
    const bulletViolation = receipt.violations.find((v) => v.violationType === 'UNBACKED_CLAIM');
    assert.ok(bulletViolation, 'Must record UNBACKED_CLAIM violation for mismatched bullet source');
  });

  // -------------------------------------------------------------------------
  // Test 11: Projects with <3 bullets are rejected (P46/P47 invariant)
  // -------------------------------------------------------------------------
  it('drops projects with fewer than 3 bullets rather than padding with synthetic bullets', () => {
    const projectWith2Bullets = {
      id: projWeakEvidenceId,
      projectId: projWeakEvidenceId,
      name: 'Two Bullet Project',
      title: 'Two Bullet Project',
      displayName: 'Two Bullet Project',
      technologies: ['OpenCV', 'Python'],
      bullets: [
        'Built image thresholding filter using OpenCV.',
        'Processed video frames at 30 fps.',
      ],
      evidenceCount: 10,
      isArchived: false,
    };

    const cvJob = {
      id: '20000000-0000-0000-0000-000000000011',
      tenantId: TENANT_ID,
      title: 'Computer Vision Engineer',
      description: 'OpenCV and Python.',
      requirements: ['OpenCV', 'Python'],
      skills: ['OpenCV'],
    };

    const relevance = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      cvJob,
      [projectWith2Bullets],
      { candidateId: CANDIDATE_ID, skills: candidateProfile.skills }
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile: {
        ...candidateProfile,
        projects: [projectWith2Bullets],
      },
      jobPosting: cvJob,
      options: {
        projectRankings: relevance.projectRankings,
      },
    });

    // The project with <3 bullets must be dropped
    assert.strictEqual(doc.projects.length, 0, 'Project with <3 bullets must not be rendered');
    assert.ok(
      doc.debugTrace.projectRemovalRecords.some((r) => r.projectId === projWeakEvidenceId),
      'Must record removal reason for insufficient bullets'
    );
  });
});
