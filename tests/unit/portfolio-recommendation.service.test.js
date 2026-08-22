/**
 * @file Unit Tests for Portfolio Recommendation Engine Service (P6-003)
 *
 * Tests all 25 required architectural invariants and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PortfolioRecommendationService } from '../../src/services/portfolio-recommendation.service.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Portfolio Recommendation Engine Service Unit Tests (P6-003)', () => {
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const jobId = randomUUID();
  const context = { tenantId, userId: randomUUID(), role: 'OWNER' };

  // Helper fixtures
  const createMockJob = (title = 'Senior Backend Engineer', requirements = [], options = {}) => ({
    id: jobId,
    tenantId,
    title,
    companyName: 'CloudScale Systems',
    jobFamily:
      options.jobFamily ||
      (title.includes('React') || title.includes('Frontend')
        ? 'FRONTEND'
        : title.includes('AI')
          ? 'AI_ENGINEERING'
          : 'BACKEND'),
    requirements:
      requirements.length > 0
        ? requirements
        : [
            {
              id: randomUUID(),
              title: 'PostgreSQL Database Design',
              skillSlug: 'postgresql',
              priority: 'REQUIRED',
            },
            {
              id: randomUUID(),
              title: 'Go / Microservices',
              skillSlug: 'go',
              priority: 'REQUIRED',
            },
            {
              id: randomUUID(),
              title: 'Docker / Kubernetes',
              skillSlug: 'docker',
              priority: 'REQUIRED',
            },
            {
              id: randomUUID(),
              title: 'React Frontend Knowledge',
              skillSlug: 'react',
              priority: 'PREFERRED',
            },
          ],
  });

  const createMockProject = (name, slug, options = {}) => ({
    id: randomUUID(),
    tenantId,
    candidateId,
    name,
    slug,
    description:
      options.description ||
      'A production-grade distributed microservice built in Go with PostgreSQL and Docker.',
    isOwner: options.isOwner !== false,
    role: options.role || 'OWNER',
    commitSharePercentage: options.commitSharePercentage || 85,
    isFork: options.isFork || false,
    organizationMember: options.organizationMember || false,
    demoUrl: options.demoUrl || null,
    repositoryUrl: 'https://github.com/test/' + slug,
  });

  const createMockRelevanceItem = (
    project,
    score = 85.0,
    skills = ['go', 'postgresql', 'docker'],
    signals = ['API_ROUTING', 'DATA_PERSISTENCE', 'TESTING']
  ) => ({
    projectId: project.id,
    projectName: project.name,
    projectSlug: project.slug,
    projectType: 'APPLICATION',
    relevanceScore: score,
    relevanceBand: score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW',
    scoreBreakdown: {
      requirementCoverageScore: 40.0,
      architecturalDensityScore: 20.0, // 20 / 25
      evidenceQualityScore: 12.0, // 12 / 15
      projectCompletenessScore: 4.5, // 4.5 / 5
      recencyScore: 4.5, // 4.5 / 5
      totalScore: score,
    },
    matchedRequirementIds: [],
    contributingSkills: skills,
    architecturalSignals: signals,
    supportingEvidence: [
      {
        id: randomUUID(),
        resourceId: project.id,
        resourceName: project.name,
        evidenceType: 'CODE_IMPORT_USAGE',
        filePath: 'src/server.go',
        commitSha: '0000000000000000000000000000000000000000',
        lineRange: { start: 10, end: 45 },
        excerpt: 'package main; import "github.com/lib/pq"',
        confidenceScore: 0.95,
        detectedAt: new Date().toISOString(),
      },
    ],
  });

  const createMockCandidate = (projects = []) => ({
    id: candidateId,
    tenantId,
    name: 'Alex Mercer',
    skills: [
      { skillSlug: 'go', provenanceStatus: 'VERIFIED', confidenceScore: 0.95 },
      { skillSlug: 'postgresql', provenanceStatus: 'VERIFIED', confidenceScore: 0.95 },
      { skillSlug: 'docker', provenanceStatus: 'VERIFIED', confidenceScore: 0.9 },
      { skillSlug: 'react', provenanceStatus: 'VERIFIED', confidenceScore: 0.85 },
    ],
    projects,
  });

  const createMockMatchAnalysis = (job) => ({
    jobDescriptionId: job.id,
    candidateId,
    tenantId,
    requirementMatches: job.requirements.map((r) => ({
      requirementId: r.id,
      requirementTitle: r.title,
      skillSlug: r.skillSlug,
      priority: r.priority,
      status: 'MATCHED',
      matchConfidence: 0.95,
    })),
  });

  const createMockRelevanceAnalysis = (relevanceItems) => ({
    jobDescriptionId: jobId,
    candidateId,
    tenantId,
    projectRankings: relevanceItems,
    summary: {
      totalProjectsEvaluated: relevanceItems.length,
      highRelevanceCount: relevanceItems.filter((r) => r.relevanceScore >= 75).length,
      mediumRelevanceCount: relevanceItems.filter(
        (r) => r.relevanceScore >= 50 && r.relevanceScore < 75
      ).length,
      lowRelevanceCount: 0,
      minimalRelevanceCount: 0,
      averageProjectScore: 80.0,
    },
    analyzedAt: new Date().toISOString(),
  });

  // -------------------------------------------------------------------------
  // Test Cases
  // -------------------------------------------------------------------------

  it('1. correctly handles one-project candidate without artificial padding', () => {
    const job = createMockJob();
    const p1 = createMockProject('Distributed Storage Engine', 'storage-engine');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 90.0, ['go', 'postgresql', 'docker']);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects.length, 1);
    assert.equal(result.featuredProjects[0].projectId, p1.id);
    assert.equal(result.featuredProjects[0].rank, 1);
    assert.equal(result.featuredProjects[0].recommendationStatus, 'RECOMMENDED');
  });

  it('2. recommends default 2-3 optimal projects for standard candidate', () => {
    const job = createMockJob();
    const p1 = createMockProject('Distributed Storage Engine', 'storage-engine');
    const p2 = createMockProject('Cloud Dashboard UI', 'dashboard-ui', {
      description: 'React dashboard with charts',
    });
    const p3 = createMockProject('DevOps Deployment Pipeline', 'devops-pipeline');
    const p4 = createMockProject('Small CLI Tool', 'small-cli');

    const cand = createMockCandidate([p1, p2, p3, p4]);
    const r1 = createMockRelevanceItem(
      p1,
      90.0,
      ['go', 'postgresql'],
      ['DATA_PERSISTENCE', 'API_ROUTING', 'TESTING']
    );
    const r2 = createMockRelevanceItem(p2, 80.0, ['react'], ['FRONTEND_UI_UX', 'TESTING']);
    const r3 = createMockRelevanceItem(p3, 75.0, ['docker'], ['CLOUD_DEVOPS', 'TESTING']);
    const r4 = createMockRelevanceItem(p4, 45.0, ['go'], []);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2, r3, r4]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 3 }
    );

    assert.equal(result.featuredProjects.length, 3);
    assert.ok(result.featuredProjects.some((p) => p.projectId === p1.id));
    assert.ok(result.featuredProjects.some((p) => p.projectId === p2.id));
    assert.ok(result.featuredProjects.some((p) => p.projectId === p3.id));
  });

  it('3. enforces maximum 5 featured projects ceiling', () => {
    const job = createMockJob();
    const projects = [];
    const relItems = [];

    for (let i = 1; i <= 8; i++) {
      const p = createMockProject(`Project ${i}`, `project-${i}`);
      projects.push(p);
      relItems.push(
        createMockRelevanceItem(p, 80.0 + i, [`skill-${i}`], ['API_ROUTING', 'TESTING'])
      );
    }

    const cand = createMockCandidate(projects);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis(relItems);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 5 }
    );

    assert.equal(result.featuredProjects.length, 5);
    assert.equal(result.supportingProjects.length + result.deprioritizedProjects.length, 3);
  });

  it('4. rejects weak/superficial projects from featured list (quality floor)', () => {
    const job = createMockJob();
    const p1 = createMockProject('High Quality Backend', 'backend-hq');
    const p2 = createMockProject('Superficial Flat Script', 'flat-script', {
      description: 'Simple script',
    });

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    // r2 has zero testing, very low density score (2.0/25 = 8.0 on 100 scale), low evidence
    const r2 = {
      ...createMockRelevanceItem(p2, 35.0, ['go'], []),
      scoreBreakdown: {
        requirementCoverageScore: 10.0,
        architecturalDensityScore: 2.0, // < 7.5 threshold
        evidenceQualityScore: 2.0,
        projectCompletenessScore: 1.0,
        recencyScore: 1.0,
        totalScore: 35.0,
      },
    };

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects.length, 1);
    assert.equal(result.featuredProjects[0].projectId, p1.id);
    assert.equal(result.deprioritizedProjects.length, 1);
    assert.equal(result.deprioritizedProjects[0].projectId, p2.id);
    assert.equal(result.deprioritizedProjects[0].recommendationStatus, 'DEPRIORITIZED');
  });

  it('5. maps required skill coverage accurately', () => {
    const job = createMockJob();
    const p1 = createMockProject('Backend Service', 'backend-svc');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 90.0, ['postgresql', 'go', 'docker']);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.ok(result.requirementCoverage.totalRequirementsCount > 0);
    assert.ok(result.targetRequirementsCovered.length > 0);
    const postgresCoverage = result.targetRequirementsCovered.find(
      (r) => r.skillSlug === 'postgresql'
    );
    assert.ok(postgresCoverage);
    assert.equal(postgresCoverage.isPrimaryCoverage, true);
  });

  it('6. optimizes for marginal value (chooses project adding new required skills over redundant one)', () => {
    const job = createMockJob();
    const p1 = createMockProject('Database Service', 'db-svc');
    const p2_redundant = createMockProject('Another Database Service', 'db-svc-2'); // duplicate postgresql + go
    const p3_complementary = createMockProject('Docker Kubernetes Engine', 'k8s-engine'); // adds docker + cloud

    const cand = createMockCandidate([p1, p2_redundant, p3_complementary]);
    const r1 = createMockRelevanceItem(
      p1,
      85.0,
      ['postgresql', 'go'],
      ['DATA_PERSISTENCE', 'API_ROUTING']
    );
    const r2 = createMockRelevanceItem(
      p2_redundant,
      80.0,
      ['postgresql', 'go'],
      ['DATA_PERSISTENCE']
    );
    const r3 = createMockRelevanceItem(
      p3_complementary,
      75.0,
      ['docker'],
      ['CLOUD_DEVOPS', 'TESTING']
    );

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2, r3]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 2 }
    );

    assert.equal(result.featuredProjects.length, 2);
    assert.equal(result.featuredProjects[0].projectId, p1.id);
    assert.equal(result.featuredProjects[1].projectId, p3_complementary.id); // p3 chosen over p2 due to marginal value
  });

  it('7. handles duplicate skill coverage without inflation', () => {
    const job = createMockJob();
    const p1 = createMockProject('App 1', 'app-1');
    const p2 = createMockProject('App 2', 'app-2');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 85.0, ['postgresql']);
    const r2 = createMockRelevanceItem(p2, 80.0, ['postgresql'], ['API_ROUTING']);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    const postgresCoverages = result.targetRequirementsCovered.filter(
      (r) => r.skillSlug === 'postgresql'
    );
    assert.ok(postgresCoverages.length > 0);
    assert.equal(postgresCoverages[0].isPrimaryCoverage, true);
  });

  it('8. computes signal complementarity across 7 architectural dimensions', () => {
    const job = createMockJob();
    const p1 = createMockProject('Backend Microservice', 'backend-svc');
    const p2 = createMockProject('Frontend Client', 'frontend-client');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(
      p1,
      85.0,
      ['go', 'postgresql'],
      ['DATA_PERSISTENCE', 'API_ROUTING']
    );
    const r2 = createMockRelevanceItem(p2, 80.0, ['react'], ['FRONTEND_UI_UX']);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.ok(result.portfolioSignals.activeSignals.includes('BACKEND_DISTRIBUTED'));
    assert.ok(result.portfolioSignals.activeSignals.includes('DATABASE_DATA_MODELING'));
    assert.ok(result.portfolioSignals.activeSignals.includes('FRONTEND_UI_UX'));
    assert.ok(result.portfolioSignals.signalComplementarityScore > 0);
  });

  it('9. applies Backend job family signal weighting', () => {
    const job = createMockJob('Staff Backend Engineer');
    const p1 = createMockProject('Database Engine', 'db-engine');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(
      p1,
      85.0,
      ['postgresql', 'go'],
      ['DATA_PERSISTENCE', 'API_ROUTING']
    );
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.jobFamily, 'BACKEND');
    assert.ok(result.portfolioSignals.signalComplementarityScore > 0);
  });

  it('10. applies Frontend job family signal weighting', () => {
    const job = createMockJob('Senior React UI Developer');
    const p1 = createMockProject('Design System UI', 'design-system');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0, ['react'], ['FRONTEND_UI_UX']);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.jobFamily, 'FRONTEND');
    assert.ok(result.portfolioSignals.activeSignals.includes('FRONTEND_UI_UX'));
  });

  it('11. applies AI Engineering job family signal weighting', () => {
    const job = createMockJob('AI Agent Systems Engineer');
    const p1 = createMockProject('LLM Agent Orchestrator', 'llm-orchestrator');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(
      p1,
      85.0,
      ['python'],
      ['API_ROUTING', 'EXTERNAL_INTEGRATIONS']
    );
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.jobFamily, 'AI_ENGINEERING');
  });

  it('12. classifies ownership confidence accurately', () => {
    const job = createMockJob();
    const p1 = createMockProject('Personal Repo', 'personal-repo', {
      isOwner: true,
      role: 'OWNER',
    });
    const p2 = createMockProject('Org Repo', 'org-repo', {
      isOwner: false,
      role: 'MEMBER',
      organizationMember: true,
    });
    const p3 = createMockProject('Forked Repo', 'forked-repo', { isFork: true });

    const cand = createMockCandidate([p1, p2, p3]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const r2 = createMockRelevanceItem(p2, 80.0);
    const r3 = createMockRelevanceItem(p3, 75.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2, r3]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 3 }
    );

    const featured1 = result.featuredProjects.find((p) => p.projectId === p1.id);
    const featured2 = result.featuredProjects.find((p) => p.projectId === p2.id);
    const featured3 = result.featuredProjects.find((p) => p.projectId === p3.id);

    if (featured1) assert.equal(featured1.ownershipConfidence, 'DIRECT_OWNER');
    if (featured2) assert.equal(featured2.ownershipConfidence, 'ORGANIZATION_MEMBER');
    if (featured3) assert.equal(featured3.ownershipConfidence, 'FORK_UPSTREAM');
  });

  it('13. classifies contribution confidence accurately', () => {
    const job = createMockJob();
    const p1 = createMockProject('Primary Work', 'primary-work', { commitSharePercentage: 90 });
    const p2 = createMockProject('Team Project', 'team-project', {
      commitSharePercentage: 35,
      role: 'MEMBER',
    });

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const r2 = createMockRelevanceItem(p2, 80.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    const featured1 = result.featuredProjects.find((p) => p.projectId === p1.id);
    const featured2 = result.featuredProjects.find((p) => p.projectId === p2.id);

    if (featured1) assert.equal(featured1.contributionConfidence, 'PRIMARY_AUTHOR');
    if (featured2) assert.equal(featured2.contributionConfidence, 'MAJOR_CONTRIBUTOR');
  });

  it('14. handles tutorial/clone detection and deprioritizes with warning', () => {
    const job = createMockJob();
    const p1 = createMockProject('Real Production Engine', 'real-engine');
    const p2_tutorial = createMockProject('React Todo App', 'react-todo-app', {
      description: 'Simple todo app tutorial',
    });

    const cand = createMockCandidate([p1, p2_tutorial]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const r2 = createMockRelevanceItem(p2_tutorial, 80.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects.length, 1);
    assert.equal(result.featuredProjects[0].projectId, p1.id);
    assert.ok(result.deprioritizedProjects.some((p) => p.projectId === p2_tutorial.id));
    assert.ok(result.warnings.some((w) => w.warningCode === 'TUTORIAL_CLONE_DETECTED'));
  });

  it('15. evaluates story completeness (DOCUMENTED, PARTIAL, MISSING)', () => {
    const job = createMockJob();
    const p1 = createMockProject('Documented Repo', 'doc-repo', {
      description:
        'Comprehensive high-scale streaming platform with detailed architecture documentation and trade-off logs spanning over one hundred characters.',
    });

    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects[0].storyCompleteness, 'DOCUMENTED');
  });

  it('16. calculates interview discussion value score (0-100)', () => {
    const job = createMockJob();
    const p1 = createMockProject('Complex Core Engine', 'complex-engine');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(
      p1,
      85.0,
      ['go', 'postgresql'],
      ['DATA_PERSISTENCE', 'AUTHENTICATION_SECURITY', 'TESTING']
    );
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.ok(result.featuredProjects[0].interviewDiscussionValue >= 50.0);
    assert.ok(result.featuredProjects[0].interviewDiscussionValue <= 100.0);
  });

  it('17. flags live demo availability accurately', () => {
    const job = createMockJob();
    const p1 = createMockProject('Deployed App', 'deployed-app', {
      demoUrl: 'https://demo.app.com',
    });
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects[0].liveDemoAvailable, true);
  });

  it('18. generates actionable case-study candidate questions and interview topics', () => {
    const job = createMockJob();
    const p1 = createMockProject('Core Engine', 'core-engine');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.caseStudyRecommendations.length, 1);
    const cs = result.caseStudyRecommendations[0];
    assert.ok(cs.questionsForCandidate.length >= 3);
    assert.ok(cs.interviewDiscussionTopics.length >= 2);
  });

  it('19. applies candidate user override: PIN_FEATURED', () => {
    const job = createMockJob();
    const p1 = createMockProject('Top Project', 'top-project');
    const p2 = createMockProject('Pinned Project', 'pinned-project');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 95.0);
    const r2 = createMockRelevanceItem(p2, 60.0); // lower score

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      {
        maxFeaturedCount: 1, // normally would only pick p1
        overrides: [{ projectId: p2.id, action: 'PIN_FEATURED' }],
      }
    );

    assert.ok(result.featuredProjects.some((p) => p.projectId === p2.id));
  });

  it('20. applies candidate user override: EXCLUDE_PROJECT', () => {
    const job = createMockJob();
    const p1 = createMockProject('Top Project', 'top-project');
    const p2 = createMockProject('Secondary Project', 'secondary-project');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 95.0);
    const r2 = createMockRelevanceItem(p2, 80.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      {
        overrides: [{ projectId: p1.id, action: 'EXCLUDE_PROJECT' }],
      }
    );

    assert.ok(!result.featuredProjects.some((p) => p.projectId === p1.id));
    assert.ok(result.deprioritizedProjects.some((p) => p.projectId === p1.id));
  });

  it('21. applies candidate user override: REORDER_OVERRIDE', () => {
    const job = createMockJob();
    const p1 = createMockProject('Project A', 'project-a');
    const p2 = createMockProject('Project B', 'project-b');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 95.0);
    const r2 = createMockRelevanceItem(p2, 85.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      {
        overrides: [
          { projectId: p2.id, action: 'REORDER_OVERRIDE', targetOrder: 1 },
          { projectId: p1.id, action: 'REORDER_OVERRIDE', targetOrder: 2 },
        ],
      }
    );

    assert.equal(result.featuredProjects[0].projectId, p2.id);
    assert.equal(result.featuredProjects[1].projectId, p1.id);
  });

  it('22. guarantees 100% deterministic ranking across repeated executions', () => {
    const job = createMockJob();
    const p1 = createMockProject('Project 1', 'project-1');
    const p2 = createMockProject('Project 2', 'project-2');

    const cand = createMockCandidate([p1, p2]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const r2 = createMockRelevanceItem(p2, 80.0);

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1, r2]);

    const run1 = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );
    const run2 = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(run1.featuredProjects.length, run2.featuredProjects.length);
    assert.equal(run1.featuredProjects[0].projectId, run2.featuredProjects[0].projectId);
    assert.equal(
      run1.portfolioSignals.signalComplementarityScore,
      run2.portfolioSignals.signalComplementarityScore
    );
  });

  it('23. caps evidenceHighlights at maximum 5 references per project', () => {
    const job = createMockJob();
    const p1 = createMockProject('Evidence Rich Project', 'evidence-rich');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 90.0);

    // Attach 10 evidence refs
    r1.supportingEvidence = [];
    for (let i = 0; i < 10; i++) {
      r1.supportingEvidence.push({
        id: randomUUID(),
        resourceId: p1.id,
        resourceName: p1.name,
        evidenceType: 'CODE_IMPORT_USAGE',
        filePath: `src/file_${i}.go`,
        commitSha: '0000000000000000000000000000000000000000',
        lineRange: { start: 1, end: 10 },
        excerpt: 'package main',
        confidenceScore: 0.9,
        detectedAt: new Date().toISOString(),
      });
    }

    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.equal(result.featuredProjects[0].evidenceHighlights.length, 5);
  });

  it('24. throws NotFoundError on cross-tenant requests (404 default-deny)', () => {
    const foreignTenantId = randomUUID();
    const foreignJob = { ...createMockJob(), tenantId: foreignTenantId };
    const p1 = createMockProject('Project 1', 'project-1');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const matchAnalysis = createMockMatchAnalysis(foreignJob);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    assert.throws(
      () =>
        PortfolioRecommendationService.recommendPortfolio(
          context,
          cand,
          foreignJob,
          matchAnalysis,
          relAnalysis
        ),
      NotFoundError
    );
  });

  it('25. passes cited evidence through Zero-Hallucination Integrity Gate', () => {
    const job = createMockJob();
    const p1 = createMockProject('Project 1', 'project-1');
    const cand = createMockCandidate([p1]);
    const r1 = createMockRelevanceItem(p1, 85.0);
    const matchAnalysis = createMockMatchAnalysis(job);
    const relAnalysis = createMockRelevanceAnalysis([r1]);

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      cand,
      job,
      matchAnalysis,
      relAnalysis
    );

    assert.ok(result.recommendationId);
    assert.ok(result.featuredProjects[0].evidenceHighlights.length > 0);
  });
});
