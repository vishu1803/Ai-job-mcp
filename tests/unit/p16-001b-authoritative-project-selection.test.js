/**
 * @file Unit Tests: P16-001B Authoritative Analyzer -> Project Selection
 *
 * Verifies:
 * 1. Hardcoded project fallback list is never used.
 * 2. Authoritative ProjectRelevanceService / analyze_job_fit rankings drive project selection.
 * 3. Analyzer ordering is strictly preserved without secondary re-sorting.
 * 4. Project budget truncates rankings without changing the relative order.
 * 5. Contrasting job profiles (Python backend vs React frontend) dynamically select distinct projects.
 * 6. Genuinely irrelevant jobs yield empty project selection (prefers NO project over WRONG project).
 * 7. Relevance scores, ranks, and matched criteria are preserved in StructuredResumeDocument.
 * 8. ResumeTailoringPlan.selectedProjectIds matches StructuredResumeDocument.projects.
 * 9. Deterministic output across repeated executions.
 * 10. Candidate-owned bullets and provenance are strictly immutable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';

describe('P16-001B: Authoritative Analyzer -> Project Selection', () => {
  const TENANT_ID = 'eb8b9599-c5bd-496c-b553-0f4575e346b8';
  const CANDIDATE_ID = '930c6a51-e137-4d92-911e-b830418c9912';

  const projPythonBackendId = 'a1111111-1111-4111-8111-111111111111';
  const projPythonCacheId = 'a2222222-2222-4222-8222-222222222222';
  const projReactFrontendId = 'b2222222-2222-4222-8222-222222222222';
  const projRustSystemsId = 'c3333333-3333-4333-8333-333333333333';

  const candidateProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Alex Rivers',
    email: 'alex.rivers@example.com',
    phone: '+1-555-0199',
    location: 'Seattle, WA',
    headline: 'Senior Systems & Cloud Engineer',
    summary: 'Experienced engineer building high-scale distributed systems and responsive user interfaces.',
    skills: [
      { id: '10000000-0000-0000-0000-000000000001', name: 'Python', slug: 'python', category: 'Languages', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000002', name: 'FastAPI', slug: 'fastapi', category: 'Frameworks & Libraries', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000003', name: 'PostgreSQL', slug: 'postgresql', category: 'Databases', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000004', name: 'TypeScript', slug: 'typescript', category: 'Languages', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000005', name: 'React', slug: 'react', category: 'Frameworks & Libraries', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000006', name: 'Next.js', slug: 'next-js', category: 'Frameworks & Libraries', provenanceStatus: 'VERIFIED' },
      { id: '10000000-0000-0000-0000-000000000007', name: 'Rust', slug: 'rust', category: 'Languages', provenanceStatus: 'VERIFIED' },
    ],
    experience: [
      {
        company: 'Apex Cloud Systems',
        title: 'Senior Software Engineer',
        startDate: '2022-01-01',
        endDate: null,
        isCurrent: true,
        bullets: ['Designed fault-tolerant distributed services handling 20k RPS.'],
      },
    ],
    education: [
      {
        institution: 'University of Washington',
        degree: 'B.S. in Computer Science',
        startDate: '2018-09-01',
        endDate: '2022-06-01',
      },
    ],
    certifications: [],
    projects: [
      {
        id: projPythonBackendId,
        projectId: projPythonBackendId,
        name: 'FastAPI High-Throughput Microservice',
        title: 'FastAPI High-Throughput Microservice',
        repositoryUrl: 'https://github.com/alexrivers/fastapi-microservice',
        summary: 'Asynchronous event-driven microservice using FastAPI and PostgreSQL.',
        technologies: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
        bullets: [
          'Engineered asynchronous REST APIs using FastAPI and PostgreSQL handling 15,000 req/sec.',
          'Built streaming pub/sub pipelines with distributed worker pools.',
        ],
        evidenceCount: 28,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
        evidence: [
          {
            id: 'e1111111-1111-4111-8111-111111111111',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'python',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'app/main.py' },
          },
          {
            id: 'e1111111-1111-4111-8111-111111111112',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'fastapi',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'app/api/router.py' },
          },
          {
            id: 'e1111111-1111-4111-8111-111111111113',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'postgresql',
            confidenceScore: 0.90,
            sourceLocation: { filePath: 'app/db/session.py' },
          },
        ],
      },
      {
        id: projPythonCacheId,
        projectId: projPythonCacheId,
        name: 'Distributed Cache and Rate Limiter',
        title: 'Distributed Cache and Rate Limiter',
        repositoryUrl: 'https://github.com/alexrivers/distributed-cache',
        summary: 'Distributed in-memory caching and token bucket rate limiter in Python and FastAPI.',
        technologies: ['Python', 'FastAPI', 'PostgreSQL'],
        bullets: [
          'Implemented token bucket rate limiter middleware for FastAPI backend services.',
          'Designed high-performance caching layer backed by PostgreSQL persistent storage.',
        ],
        evidenceCount: 20,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
        evidence: [
          {
            id: 'e1111111-1111-4111-8111-111111111121',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'python',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'cache/limiter.py' },
          },
          {
            id: 'e1111111-1111-4111-8111-111111111122',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'fastapi',
            confidenceScore: 0.90,
            sourceLocation: { filePath: 'cache/middleware.py' },
          },
          {
            id: 'e1111111-1111-4111-8111-111111111123',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'postgresql',
            confidenceScore: 0.85,
            sourceLocation: { filePath: 'cache/store.py' },
          },
        ],
      },
      {
        id: projReactFrontendId,
        projectId: projReactFrontendId,
        name: 'Interactive Design Canvas',
        title: 'Interactive Design Canvas',
        repositoryUrl: 'https://github.com/alexrivers/interactive-canvas',
        summary: 'Web-based vector drawing and collaboration canvas in React and TypeScript.',
        technologies: ['TypeScript', 'React', 'Next.js', 'Canvas API'],
        bullets: [
          'Architected responsive UI components and real-time state synchronization using Next.js and React.',
          'Optimized 60fps canvas rendering pipeline with Web Workers and dynamic frame scheduling.',
        ],
        evidenceCount: 32,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
        evidence: [
          {
            id: 'e2222222-2222-4222-8222-222222222221',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'react',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'src/components/Canvas.tsx' },
          },
          {
            id: 'e2222222-2222-4222-8222-222222222222',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'next-js',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'pages/index.tsx' },
          },
          {
            id: 'e2222222-2222-4222-8222-222222222223',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'typescript',
            confidenceScore: 0.90,
            sourceLocation: { filePath: 'src/types/canvas.ts' },
          },
        ],
      },
      {
        id: projRustSystemsId,
        projectId: projRustSystemsId,
        name: 'Async Network Tunnel in Rust',
        title: 'Async Network Tunnel in Rust',
        repositoryUrl: 'https://github.com/alexrivers/rust-tunnel',
        summary: 'Userspace TCP/UDP multiplexing tunnel written in Rust with zero-copy I/O.',
        technologies: ['Rust', 'Tokio', 'Linux Systems'],
        bullets: [
          'Developed userspace tunnel with async Tokio runtimes handling packet multiplexing.',
        ],
        evidenceCount: 18,
        provenanceStatus: 'CORROBORATED',
        isArchived: false,
        evidence: [
          {
            id: 'e3333333-3333-4333-8333-333333333331',
            evidenceType: 'CODE_USAGE',
            skillSlug: 'rust',
            confidenceScore: 0.95,
            sourceLocation: { filePath: 'src/tunnel.rs' },
          },
        ],
      },
    ],
  };

  const jobPythonBackend = {
    id: '71111111-1111-4111-8111-111111111111',
    tenantId: TENANT_ID,
    title: 'Python Backend Engineer',
    company: 'DataStream Inc.',
    description: 'Looking for a Python Backend Engineer to build robust services with FastAPI and PostgreSQL.',
    requirements: [
      {
        id: 'd1111111-1111-4111-8111-111111111111',
        category: 'SKILL',
        skillSlug: 'fastapi',
        importance: 'REQUIRED',
        weight: 1.0,
      },
      {
        id: 'd1111111-1111-4111-8111-111111111112',
        category: 'SKILL',
        skillSlug: 'postgresql',
        importance: 'REQUIRED',
        weight: 1.0,
      },
      {
        id: 'd1111111-1111-4111-8111-111111111113',
        category: 'SKILL',
        skillSlug: 'python',
        importance: 'REQUIRED',
        weight: 1.0,
      },
    ],
    skills: ['fastapi', 'postgresql', 'python'],
  };

  const jobReactFrontend = {
    id: '72222222-2222-4222-8222-222222222222',
    tenantId: TENANT_ID,
    title: 'Frontend UI Architect',
    company: 'Modern Web Labs',
    description: 'Looking for a Senior Frontend Engineer proficient in React, Next.js, and TypeScript.',
    requirements: [
      {
        id: 'd2222222-2222-4222-8222-222222222221',
        category: 'SKILL',
        skillSlug: 'react',
        importance: 'REQUIRED',
        weight: 1.0,
      },
      {
        id: 'd2222222-2222-4222-8222-222222222222',
        category: 'SKILL',
        skillSlug: 'next-js',
        importance: 'REQUIRED',
        weight: 1.0,
      },
      {
        id: 'd2222222-2222-4222-8222-222222222223',
        category: 'SKILL',
        skillSlug: 'typescript',
        importance: 'REQUIRED',
        weight: 1.0,
      },
    ],
    skills: ['react', 'next-js', 'typescript'],
  };

  const jobSwiftMobile = {
    id: '73333333-3333-4333-8333-333333333333',
    tenantId: TENANT_ID,
    title: 'iOS Swift Mobile Developer',
    company: 'Cupertino Apps',
    description: 'Develop native iOS applications using Swift, SwiftUI, and CoreData.',
    requirements: [
      {
        id: 'd3333333-3333-4333-8333-333333333331',
        category: 'SKILL',
        skillSlug: 'swift',
        importance: 'REQUIRED',
        weight: 1.0,
      },
      {
        id: 'd3333333-3333-4333-8333-333333333332',
        category: 'SKILL',
        skillSlug: 'swiftui',
        importance: 'REQUIRED',
        weight: 1.0,
      },
    ],
    skills: ['swift', 'swiftui', 'core-data'],
  };

  it('Test A: Hardcoded project fallback list is never used', () => {
    const FORBIDDEN_HARDCODED_SLUGS = [
      'product-data-explorer',
      'collaborative-task-manager',
      'ai-powered-code-review-assistant',
    ];

    // Compute backend rankings
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    for (const proj of doc.projects) {
      const slug = proj.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      assert.ok(
        !FORBIDDEN_HARDCODED_SLUGS.includes(slug),
        `Document contained forbidden hardcoded fallback project: ${proj.displayName}`
      );
    }
  });

  it('Test B: Authoritative analyzer top project is selected', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    assert.ok(analysis.projectRankings.length > 0);
    const topRanked = analysis.projectRankings[0];

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    assert.ok(doc.projects.length >= 1);
    assert.equal(doc.projects[0].projectId, topRanked.projectId);
  });

  it('Test C: Authoritative analyzer ordering is preserved without re-sorting', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const relevantIds = analysis.projectRankings
      .filter((r) => r.relevanceScore >= 25)
      .map((r) => r.projectId);

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    const docProjectIds = doc.projects.map((p) => p.projectId);
    assert.deepEqual(docProjectIds, relevantIds.slice(0, docProjectIds.length));
  });

  it('Test D: Project budget truncates authoritative ranking without re-sorting', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    // Both Python projects match the backend job requirements
    assert.ok(analysis.projectRankings.length >= 2);
    const top2 = analysis.projectRankings.slice(0, 2);

    const docBudget2 = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
      plan: {
        selectedProjectIds: top2.map((r) => r.projectId),
      },
    });

    assert.equal(docBudget2.projects.length, 2);
    assert.equal(docBudget2.projects[0].projectId, top2[0].projectId);
    assert.equal(docBudget2.projects[1].projectId, top2[1].projectId);

    // Now test budget of 1: must be exact top 1 without reordering
    const docBudget1 = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
      plan: {
        selectedProjectIds: [top2[0].projectId],
      },
    });

    assert.equal(docBudget1.projects.length, 1);
    assert.equal(docBudget1.projects[0].projectId, top2[0].projectId);
  });

  it('Test E: Contrasting job profiles select distinct projects based on real evidence', () => {
    // 1. Python Backend Job
    const analysisA = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );
    const docBackend = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysisA.projectRankings,
      },
    });

    // 2. React Frontend Job
    const analysisB = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobReactFrontend,
      candidateProfile.projects
    );
    const docFrontend = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobReactFrontend,
        projectRankings: analysisB.projectRankings,
      },
    });

    assert.equal(docBackend.projects[0].projectId, analysisA.projectRankings[0].projectId);
    assert.equal(docFrontend.projects[0].projectId, analysisB.projectRankings[0].projectId);
    assert.notEqual(docBackend.projects[0].projectId, docFrontend.projects[0].projectId);
  });

  it('Test F: Genuinely irrelevant job produces empty project selection (prefers NO project over WRONG project)', () => {
    const analysisSwift = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobSwiftMobile,
      candidateProfile.projects
    );

    // No candidate projects match the Swift requirements
    for (const r of analysisSwift.projectRankings) {
      assert.equal(r.relevanceBand, 'MINIMAL');
      assert.deepEqual(r.matchedRequirementIds, []);
    }

    const docSwift = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobSwiftMobile,
        projectRankings: analysisSwift.projectRankings,
      },
    });

    assert.equal(docSwift.projects.length, 0, 'Irrelevant projects were fabricated in resume');
    assert.equal(docSwift.tailoringPlan.selectedProjectIds.length, 0);
  });

  it('Test G: Analyzer relevanceScore and rank are preserved into structured representation', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    const firstProj = doc.projects[0];
    assert.ok(typeof firstProj.relevanceScore === 'number');
    assert.ok(firstProj.relevanceScore > 0);
    assert.equal(firstProj.relevanceScore, analysis.projectRankings[0].relevanceScore);
    assert.equal(firstProj.rank, 1);
  });

  it('Test H: Selected project IDs are placed into ResumeTailoringPlan', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    assert.ok(doc.tailoringPlan);
    assert.ok(Array.isArray(doc.tailoringPlan.selectedProjectIds));
    assert.ok(doc.tailoringPlan.selectedProjectIds.includes(analysis.projectRankings[0].projectId));
    assert.equal(doc.tailoringPlan.selectedProjectIds[0], analysis.projectRankings[0].projectId);
  });

  it('Test I: StructuredResumeDocument project order matches ResumeTailoringPlan', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    const planIds = doc.tailoringPlan.selectedProjectIds;
    const docIds = doc.projects.map((p) => p.projectId);
    assert.deepEqual(planIds, docIds);
  });

  it('Test J: Same inputs are 100% deterministic', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc1 = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    const doc2 = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    assert.equal(doc1.projects.length, doc2.projects.length);
    assert.deepEqual(
      doc1.projects.map((p) => p.projectId),
      doc2.projects.map((p) => p.projectId)
    );
    assert.deepEqual(
      doc1.projects.map((p) => p.relevanceScore),
      doc2.projects.map((p) => p.relevanceScore)
    );
  });

  it('Test K: Candidate-owned bullets and provenance remain intact', () => {
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobPythonBackend,
      candidateProfile.projects
    );

    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: {
        ...jobPythonBackend,
        projectRankings: analysis.projectRankings,
      },
    });

    const selectedProj = doc.projects.find((p) => p.projectId === projPythonBackendId);
    assert.ok(selectedProj);
    assert.equal(selectedProj.bullets.length, 2);
    assert.equal(
      selectedProj.bullets[0].text,
      'Engineered asynchronous REST APIs using FastAPI and PostgreSQL handling 15,000 req/sec.'
    );
    assert.equal(selectedProj.bullets[0].provenanceStatus, 'CORROBORATED');
  });

  it('Test L: CandidateArtifactContentService consumes authoritative rankings directly', () => {
    const service = new CandidateArtifactContentService();
    const analysis = ProjectRelevanceService.computeProjectsRelevance(
      { tenantId: TENANT_ID },
      jobReactFrontend,
      candidateProfile.projects
    );

    const resume = service.buildTailoredResumeMarkdown(candidateProfile, {
      ...jobReactFrontend,
      projectRankings: analysis.projectRankings,
    });

    assert.ok(resume.selectedProjects.length >= 1);
    assert.equal(resume.selectedProjects[0].projectId, projReactFrontendId);
    assert.ok(resume.markdownContent.includes('Interactive Design Canvas'));
    assert.ok(resume.markdownContent.includes('Architected responsive UI components'));
  });
});
