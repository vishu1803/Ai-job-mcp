/**
 * @file Unit Tests: P51 Follow-up — Summary Grounding & Production Verification Matrix.
 *
 * Verifies across a deterministic 6-role matrix:
 * 1. Backend Engineer
 * 2. Frontend Engineer
 * 3. Full-Stack Engineer
 * 4. AI / Machine Learning Engineer
 * 5. Computer Vision Engineer
 * 6. Generic Software Engineer
 *
 * Checks:
 * - Deterministic job-conditioned project selection (ProjectRelevanceService authority)
 * - Fact-grounded summary generation with sentence-by-sentence provenance:
 *   { text, factIds, projectIds, skillSlugs, evidenceRefs, matchedRequirementIds, provenanceStatus, jobRelevance }
 * - Zero cross-project leakage in summary & bullet attribution
 * - Rejection of unbacked buzzwords (scalable, production-ready, low-latency, etc.)
 * - Rejection of unselected project mentions
 * - 100% PASS on validateStructuredResumeIntegrity across all 6 archetypes
 * - Strict schema conformance with TailoredResumeDocumentSchema
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
  validateStructuredResumeIntegrity,
} from '../../src/services/structured-resume.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { StructuredResumeDocumentSchema } from '../../src/domain/career/resume.schemas.js';

describe('P51 Follow-up: Summary Grounding & Production Verification Matrix', () => {
  const TENANT_ID = '24d53f53-780e-4431-b065-32180c354175';
  const CANDIDATE_ID = '10a2b51b-09bf-4090-8040-1f60ebeb89c9';

  const projFullStackId = '10000000-0000-0000-0000-000000000001';
  const projPythonAiId = '10000000-0000-0000-0000-000000000002';
  const projFrontendId = '10000000-0000-0000-0000-000000000003';
  const projComputerVisionId = '10000000-0000-0000-0000-000000000004';
  const projDevOpsId = '10000000-0000-0000-0000-000000000005';

  const multiDomainCandidate = {
    id: CANDIDATE_ID,
    candidateId: CANDIDATE_ID,
    tenantId: TENANT_ID,
    fullName: 'Alex Chen',
    name: 'Alex Chen',
    displayName: 'Alex Chen',
    email: 'alex.chen@example.com',
    canonicalEmail: 'alex.chen@example.com',
    phoneNumber: '+1-555-0199',
    location: 'San Francisco, CA',
    headline: 'Senior Software Engineer',
    summary:
      'Multi-disciplinary software engineer with verified experience across backend services, distributed systems, machine learning, and modern web applications.',
    skills: [
      {
        name: 'Python',
        slug: 'python',
        category: 'Languages',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 35,
      },
      {
        name: 'FastAPI',
        slug: 'fastapi',
        category: 'Frameworks',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 22,
      },
      {
        name: 'PyTorch',
        slug: 'pytorch',
        category: 'Machine Learning',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 18,
      },
      {
        name: 'OpenCV',
        slug: 'opencv',
        category: 'Computer Vision',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 15,
      },
      {
        name: 'NumPy',
        slug: 'numpy',
        category: 'Data Science',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 20,
      },
      {
        name: 'Node.js',
        slug: 'node-js',
        category: 'Backend',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 30,
      },
      {
        name: 'Express',
        slug: 'express',
        category: 'Backend',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 25,
      },
      {
        name: 'PostgreSQL',
        slug: 'postgresql',
        category: 'Databases',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 28,
      },
      {
        name: 'React',
        slug: 'react',
        category: 'Frontend',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 32,
      },
      {
        name: 'TypeScript',
        slug: 'typescript',
        category: 'Languages',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 26,
      },
      {
        name: 'Next.js',
        slug: 'next-js',
        category: 'Frontend',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 19,
      },
      {
        name: 'Tailwind CSS',
        slug: 'tailwind-css',
        category: 'Frontend',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 16,
      },
      {
        name: 'Docker',
        slug: 'docker',
        category: 'DevOps',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 24,
      },
      {
        name: 'Kubernetes',
        slug: 'kubernetes',
        category: 'DevOps',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 14,
      },
      {
        name: 'Go',
        slug: 'go',
        category: 'Languages',
        provenanceStatus: 'VERIFIED',
        evidenceCount: 17,
      },
    ],
    experience: [
      {
        id: 'exp-senior-swe',
        company: 'Apex Systems Corp',
        title: 'Senior Software Engineer',
        startDate: '2022-03-01',
        endDate: 'Present',
        location: 'San Francisco, CA',
        bullets: [
          'Engineered event-driven microservices handling asynchronous workload dispatch and reliable data persistence.',
          'Built responsive front-end dashboard views using React and TypeScript for operational metric telemetry.',
          'Implemented PyTorch deep learning inference pipeline for document classification with automated data validation.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-bs-cs',
        institution: 'University of California, Berkeley',
        degree: 'Bachelor of Science in Computer Science',
        startDate: '2016-08-01',
        endDate: '2020-05-01',
      },
    ],
    projects: [
      {
        id: projFullStackId,
        projectId: projFullStackId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'Collaborative Task Manager',
        displayName: 'Collaborative Task Manager',
        technologies: ['Node.js', 'Express', 'PostgreSQL', 'React'],
        bullets: [
          'Engineered backend REST endpoints using Node.js, Express, and PostgreSQL handling concurrent task updates.',
          'Designed normalized relational database schemas with indexing in PostgreSQL to optimize query execution.',
          'Built interactive frontend views and state synchronization using React and WebSocket connections.',
        ],
        repositoryUrl: 'https://github.com/candidate/collaborative-task-manager',
        evidenceCount: 30,
        provenanceStatus: 'VERIFIED',
      },
      {
        id: projPythonAiId,
        projectId: projPythonAiId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'AI Code Review Assistant',
        displayName: 'AI Code Review Assistant',
        technologies: ['Python', 'PyTorch', 'FastAPI', 'PostgreSQL'],
        bullets: [
          'Developed FastAPI inference microservice serving PyTorch transformer models for automated code review.',
          'Constructed dense vector retrieval pipeline utilizing embedding indexes for semantic codebase search.',
          'Implemented asynchronous batch processing pipeline for multi-file repository diff analysis.',
        ],
        repositoryUrl: 'https://github.com/candidate/ai-code-review-assistant',
        evidenceCount: 25,
        provenanceStatus: 'VERIFIED',
      },
      {
        id: projFrontendId,
        projectId: projFrontendId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'Design System & Component Studio',
        displayName: 'Design System & Component Studio',
        technologies: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
        bullets: [
          'Architected accessible WCAG 2.1 AA compliant UI component library in React and Next.js with test coverage.',
          'Optimized client-side rendering bundle sizes and Core Web Vitals across responsive layouts.',
          'Engineered atomic theme system with custom CSS variables and dark mode support.',
        ],
        repositoryUrl: 'https://github.com/candidate/component-studio',
        evidenceCount: 20,
        provenanceStatus: 'VERIFIED',
      },
      {
        id: projComputerVisionId,
        projectId: projComputerVisionId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'Real-Time Edge Vision Pipeline',
        displayName: 'Real-Time Edge Vision Pipeline',
        technologies: ['Python', 'OpenCV', 'NumPy', 'FastAPI'],
        bullets: [
          'Engineered real-time video stream feature extraction and object tracking pipeline using Python and OpenCV.',
          'Accelerated spatial matrix transformations and image thresholding routines with vectorized NumPy algorithms.',
          'Deployed inference pipeline to edge environments with automated frame buffering and error handling.',
        ],
        repositoryUrl: 'https://github.com/candidate/edge-vision-pipeline',
        evidenceCount: 18,
        provenanceStatus: 'VERIFIED',
      },
      {
        id: projDevOpsId,
        projectId: projDevOpsId,
        tenantId: TENANT_ID,
        candidateId: CANDIDATE_ID,
        name: 'Cloud Infrastructure Orchestrator',
        displayName: 'Cloud Infrastructure Orchestrator',
        technologies: ['Go', 'Docker', 'Kubernetes', 'PostgreSQL'],
        bullets: [
          'Built Go-based Kubernetes controller managing declarative ephemeral test environments across clusters.',
          'Engineered automated container build and deployment pipelines using Docker and Helm charts.',
          'Implemented cluster telemetry monitoring and health check reconciliation loops with zero downtime.',
        ],
        repositoryUrl: 'https://github.com/candidate/cloud-orchestrator',
        evidenceCount: 16,
        provenanceStatus: 'VERIFIED',
      },
    ],
  };

  // 6 Target Job Archetypes
  const matrixJobs = [
    {
      archetype: 'Backend',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000001',
        tenantId: TENANT_ID,
        title: 'Senior Backend Engineer',
        company: 'Stripe',
        description:
          'Design and operate reliable backend APIs, data persistence architectures, and service infrastructure using Node.js, Express, PostgreSQL, and Go.',
        requirements: [
          'Strong proficiency in Node.js and Express REST API architecture',
          'Deep experience in PostgreSQL schema design, indexing, and transactional isolation',
          'Experience building distributed backend services with Go and containerized deployments',
        ],
        skills: ['Node.js', 'Express', 'PostgreSQL', 'Go'],
      },
      expectedPrimaryProject: 'Collaborative Task Manager',
    },
    {
      archetype: 'Frontend',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000002',
        tenantId: TENANT_ID,
        title: 'Staff Frontend Engineer',
        company: 'Vercel',
        description:
          'Lead frontend architecture, design system component libraries, and modern web application development using React, Next.js, TypeScript, and Tailwind CSS.',
        requirements: [
          'Expertise in React, Next.js server components, and responsive design',
          'Building accessible component libraries with TypeScript and Tailwind CSS',
          'Core Web Vitals optimization and client-side performance engineering',
        ],
        skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
      },
      expectedPrimaryProject: 'Design System & Component Studio',
    },
    {
      archetype: 'Full-Stack',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000003',
        tenantId: TENANT_ID,
        title: 'Full-Stack Software Engineer',
        company: 'Linear',
        description:
          'Build end-to-end web applications bridging React frontends with Node.js and PostgreSQL backend microservices.',
        requirements: [
          'Full-stack development across modern React and Node.js ecosystems',
          'Relational database modeling and transactional consistency with PostgreSQL',
          'Component-driven UI development with TypeScript',
        ],
        skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
      },
      expectedPrimaryProject: 'Collaborative Task Manager',
    },
    {
      archetype: 'AI',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000004',
        tenantId: TENANT_ID,
        title: 'AI Systems Engineer',
        company: 'Anthropic',
        description:
          'Build inference microservices, vector search pipelines, and transformer model deployment services using Python, PyTorch, and FastAPI.',
        requirements: [
          'Experience with PyTorch deep learning models and inference optimization',
          'FastAPI microservice development for asynchronous model serving',
          'Vector embeddings and semantic retrieval architectures',
        ],
        skills: ['Python', 'PyTorch', 'FastAPI'],
      },
      expectedPrimaryProject: 'AI Code Review Assistant',
    },
    {
      archetype: 'Computer Vision',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000005',
        tenantId: TENANT_ID,
        title: 'Computer Vision & Edge Engineer',
        company: 'Scale AI',
        description:
          'Develop video stream processing pipelines, spatial matrix transformations, and embedded vision systems with Python, OpenCV, and NumPy.',
        requirements: [
          'Computer vision feature extraction, object tracking, and image processing with OpenCV',
          'Vectorized matrix computations with NumPy and Python',
          'Edge video stream buffering and real-time inference execution',
        ],
        skills: ['Python', 'OpenCV', 'NumPy'],
      },
      expectedPrimaryProject: 'Real-Time Edge Vision Pipeline',
    },
    {
      archetype: 'Generic SWE',
      jobPosting: {
        id: '20000000-0000-0000-0000-000000000006',
        tenantId: TENANT_ID,
        title: 'Software Engineer',
        company: 'Datadog',
        description:
          'Contribute across core services, web applications, and backend persistence systems using modern engineering practices.',
        requirements: [
          'Backend service development and REST APIs using Python or Node.js',
          'Relational database schema modeling and query optimization with PostgreSQL',
          'Modern web application development with React or TypeScript',
        ],
        skills: ['Python', 'Node.js', 'PostgreSQL', 'React'],
      },
      expectedPrimaryProject: null, // Any evidence-backed project is valid
    },
  ];

  for (const { archetype, jobPosting, expectedPrimaryProject } of matrixJobs) {
    it(`Matrix [${archetype}]: generates valid, grounded structured resume conforming to schemas`, () => {
      const relevance = ProjectRelevanceService.computeProjectsRelevance(
        { tenantId: TENANT_ID },
        jobPosting,
        multiDomainCandidate.projects,
        { candidateId: CANDIDATE_ID, skills: multiDomainCandidate.skills }
      );

      const doc = buildStructuredResumeDocument({
        candidateProfile: multiDomainCandidate,
        jobPosting,
        options: {
          projectRankings: relevance.projectRankings,
        },
      });

      // 1. Schema conformance
      const parsed = StructuredResumeDocumentSchema.safeParse(doc);
      assert.ok(
        parsed.success,
        `Schema validation failed for ${archetype}: ${parsed.error?.message}`
      );

      // 2. Candidate identity
      assert.equal(doc.candidateIdentity.displayName, 'Alex Chen');
      assert.equal(doc.candidateIdentity.email, 'alex.chen@example.com');

      // 3. Document integrity audit
      const receipt = validateStructuredResumeIntegrity(doc, {
        projectRankings: relevance.projectRankings,
        targetJobPosting: jobPosting,
      });
      assert.equal(
        receipt.overallStatus,
        'PASS',
        `Integrity audit failed for ${archetype}: ${JSON.stringify(receipt.violations)}`
      );
      assert.equal(receipt.violations.length, 0, `Expected 0 violations for ${archetype}`);

      // 4. Professional summary non-empty and grounded
      assert.ok(doc.summary, 'Summary object must exist');
      assert.ok(typeof doc.summary.text === 'string' && doc.summary.text.length > 50);

      // 5. Sentence-by-sentence provenance check
      assert.ok(Array.isArray(doc.summary.sentences), 'summary.sentences must be an array');
      assert.ok(doc.summary.sentences.length >= 2, 'Must have at least 2 structured sentences');

      for (const sent of doc.summary.sentences) {
        assert.ok(
          typeof sent.text === 'string' && sent.text.length > 10,
          'Sentence text must be non-empty'
        );
        assert.ok(Array.isArray(sent.factIds), 'sent.factIds must be array');
        assert.ok(Array.isArray(sent.projectIds), 'sent.projectIds must be array');
        assert.ok(Array.isArray(sent.skillSlugs), 'sent.skillSlugs must be array');
        assert.ok(Array.isArray(sent.evidenceRefs), 'sent.evidenceRefs must be array');
        assert.ok(
          Array.isArray(sent.matchedRequirementIds),
          'sent.matchedRequirementIds must be array'
        );
        assert.equal(sent.provenanceStatus, 'VERIFIED');
        assert.ok(typeof sent.jobRelevance === 'number' && sent.jobRelevance >= 0);
      }

      // 6. Zero cross-project leakage in summary
      const renderedProjectIds = new Set(doc.projects.map((p) => p.projectId));
      for (const sent of doc.summary.sentences) {
        for (const pId of sent.projectIds) {
          assert.ok(
            renderedProjectIds.has(pId),
            `Summary sentence referenced project '${pId}' not present in rendered projects`
          );
        }
      }
      for (const pId of doc.summary.referencedProjectIds || []) {
        assert.ok(
          renderedProjectIds.has(pId),
          `summary.referencedProjectIds includes '${pId}' not present in rendered projects`
        );
      }

      // 7. Project selection relevance
      assert.ok(doc.projects.length >= 1, 'Must render at least 1 project');
      if (expectedPrimaryProject) {
        const primary = doc.projects[0];
        assert.equal(
          primary.displayName || primary.name,
          expectedPrimaryProject,
          `Expected primary project for ${archetype} to be '${expectedPrimaryProject}', got '${primary.displayName || primary.name}'`
        );
      }

      // 8. Each project has at least 3 bullets and proper audit fields
      for (const proj of doc.projects) {
        assert.ok(proj.bullets.length >= 3, `Project ${proj.projectId} has fewer than 3 bullets`);
        assert.ok(proj.selectionSource, 'Must have selectionSource audit field');
        assert.ok(
          typeof proj.authoritativeRankingRank === 'number',
          'Must have authoritativeRankingRank'
        );
      }
    });
  }

  it('Matrix Integrity: snapshot generation produces valid EvidenceValidationReceipt with zero unbacked buzzwords', () => {
    for (const { archetype, jobPosting } of matrixJobs) {
      const snapshot = buildStructuredResumeSnapshot({
        candidateProfile: multiDomainCandidate,
        jobPosting,
      });

      assert.equal(
        snapshot.evidenceValidationReceipt.overallStatus,
        'PASS',
        `Snapshot validation receipt must PASS for ${archetype}`
      );
      assert.equal(snapshot.evidenceValidationReceipt.violations.length, 0);
      assert.ok(snapshot.structuredResume.summary.text);
      assert.ok(snapshot.structuredResume.summary.sentences.length > 0);
    }
  });

  it('Summary Grounding Security: detects and rejects unsupported buzzwords (fail closed)', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: multiDomainCandidate,
      jobPosting: matrixJobs[0].jobPosting,
    });

    // Tamper with summary to insert ungrounded buzzwords
    const tampered = {
      ...doc,
      summary: {
        ...doc.summary,
        text:
          doc.summary.text +
          ' Proven architect of scalable, low-latency, high-concurrency systems.',
      },
    };

    const receipt = validateStructuredResumeIntegrity(tampered);
    assert.equal(receipt.overallStatus, 'FAIL');
    assert.ok(receipt.violations.length > 0);
    const hasBuzzwordViolation = receipt.violations.some(
      (v) => v.section === 'SUMMARY' && v.violationType === 'UNBACKED_CLAIM'
    );
    assert.ok(hasBuzzwordViolation, 'Must emit UNBACKED_CLAIM violation for ungrounded buzzwords');
  });

  it('Summary Grounding Security: detects and rejects unselected project mentions in summary', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile: multiDomainCandidate,
      jobPosting: matrixJobs[1].jobPosting, // Frontend job selects Design System Studio
    });

    const renderedProjectNames = doc.projects.map((p) => p.displayName || p.name);
    assert.ok(
      !renderedProjectNames.includes('Real-Time Edge Vision Pipeline'),
      'Edge vision project should not be selected for pure frontend job'
    );

    // Tamper with summary to reference unselected project
    const tampered = {
      ...doc,
      summary: {
        ...doc.summary,
        text: doc.summary.text + ' Also developed Real-Time Edge Vision Pipeline.',
      },
    };

    const receipt = validateStructuredResumeIntegrity(tampered, {
      candidateProfile: multiDomainCandidate,
    });
    assert.equal(receipt.overallStatus, 'FAIL');
    const unselectedViolation = receipt.violations.some(
      (v) =>
        v.section === 'SUMMARY' &&
        v.violationType === 'UNBACKED_CLAIM' &&
        v.message.includes('unselected project')
    );
    assert.ok(unselectedViolation, 'Must detect unselected project reference in summary');
  });
});
