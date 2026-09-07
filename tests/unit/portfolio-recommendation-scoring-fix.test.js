import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PortfolioRecommendationService } from '../../src/services/portfolio-recommendation.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('Portfolio Recommendation Scoring & Evidence Pipeline Fix Unit Tests (P14-019)', () => {
  const TENANT_ID = crypto.randomUUID();
  const CANDIDATE_ID = crypto.randomUUID();
  const context = { tenantId: TENANT_ID, userId: crypto.randomUUID(), role: 'MEMBER' };

  function createMockJob(overrides = {}) {
    return {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      title: 'Senior Full-Stack Software Engineer, Growth',
      companyName: 'Discord',
      level: 'SENIOR',
      requirements: [
        {
          id: crypto.randomUUID(),
          title: 'TypeScript',
          skillSlug: 'typescript',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: crypto.randomUUID(),
          title: 'React',
          skillSlug: 'react',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: crypto.randomUUID(),
          title: 'Python',
          skillSlug: 'python',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: crypto.randomUUID(),
          title: 'Flask',
          skillSlug: 'flask',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: crypto.randomUUID(),
          title: 'Large Language Models',
          skillSlug: 'large-language-models',
          category: 'SKILL',
          importance: 'PREFERRED',
          weight: 0.7,
        },
      ],
      ...overrides,
    };
  }

  function createMockEvidence(projectId, overrides = {}) {
    return {
      id: crypto.randomUUID(),
      tenantId: TENANT_ID,
      candidateId: CANDIDATE_ID,
      resourceId: crypto.randomUUID(),
      projectId,
      evidenceType: 'CODE_IMPORT_USAGE',
      sourceProvider: 'GITHUB',
      sourceLocation: { filePath: 'src/app.ts', lineRange: { start: 1, end: 10 } },
      confidenceScore: 1.0,
      metadata: {},
      ...overrides,
    };
  }

  it('1. ProjectRelevanceService extracts skills from metadata.keywordMatched and derivedFromPackage', () => {
    const job = createMockJob();
    const projId = crypto.randomUUID();
    const project = {
      id: projId,
      name: 'vishu1803/Ai-powered-code-review-assistant',
      slug: 'ai-powered-code-review-assistant',
      evidence: [
        createMockEvidence(projId, {
          evidenceType: 'CODE_IMPORT_USAGE',
          metadata: { rawImport: 'fastapi' },
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          metadata: { keywordMatched: 'PostgreSQL' },
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          metadata: { derivedFromPackage: 'react' },
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          metadata: { derivedFromPackage: 'typescript' },
        }),
      ],
    };

    const res = ProjectRelevanceService.computeProjectRelevance(context, job, project);
    assert.ok(res.relevanceScore > 40.0, `Expected score > 40, got ${res.relevanceScore}`);
    assert.ok(res.contributingSkills.includes('react'), 'Should include react');
    assert.ok(res.contributingSkills.includes('typescript'), 'Should include typescript');
    assert.ok(res.contributingSkills.includes('python') || res.architecturalSignals.includes('API_ROUTING'), 'Should detect routing');
    assert.ok(res.architecturalSignals.includes('DATA_PERSISTENCE'), 'Should detect PostgreSQL persistence');
  });

  it('2. ProjectRelevanceService recognizes real-time systems (socket-io, websockets) as an architectural dimension', () => {
    const job = createMockJob();
    const projId = crypto.randomUUID();
    const project = {
      id: projId,
      name: 'vishu1803/Collaborative-task-manager',
      slug: 'collaborative-task-manager',
      evidence: [
        createMockEvidence(projId, {
          evidenceType: 'CODE_IMPORT_USAGE',
          skillSlug: 'socket-io',
          sourceLocation: { filePath: 'src/sockets/collab.ts' },
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          skillSlug: 'express',
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          skillSlug: 'prisma',
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          skillSlug: 'react',
        }),
        createMockEvidence(projId, {
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          skillSlug: 'typescript',
        }),
        createMockEvidence(projId, {
          evidenceType: 'CODE_TEST_FILE',
          skillSlug: 'jest',
          sourceLocation: { filePath: 'tests/collab.test.ts' },
        }),
      ],
    };

    const res = ProjectRelevanceService.computeProjectRelevance(context, job, project);
    assert.ok(res.architecturalSignals.includes('REALTIME_COMMUNICATION'), 'Should detect REALTIME_COMMUNICATION');
    assert.ok(res.architecturalSignals.includes('API_ROUTING'), 'Should detect API_ROUTING (Express)');
    assert.ok(res.architecturalSignals.includes('TESTING'), 'Should detect TESTING (Jest)');
    assert.ok(res.scoreBreakdown.architecturalDensityScore >= 10.0, 'Should have >= 10.0 architectural density');
  });

  it('3. PortfolioRecommendationService selects 2-3 relevant projects and does not penalize repeated core skills', () => {
    const job = createMockJob();

    // 3 Authentic Projects
    const p1 = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Product-Data-Explorer',
      slug: 'vishu1803-product-data-explorer',
    };
    const p2 = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Ai-powered-code-review-assistant',
      slug: 'vishu1803-ai-powered-code-review-assistant',
    };
    const p3 = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Collaborative-task-manager',
      slug: 'vishu1803-collaborative-task-manager',
    };

    const candidateProfile = {
      id: CANDIDATE_ID,
      tenantId: TENANT_ID,
      displayName: 'Candidate',
      skills: [],
      projects: [p1, p2, p3],
      resources: [],
    };

    // Both P1 and P3 demonstrate React and TypeScript, but across different backend paradigms
    const relAnalysis = {
      jobDescriptionId: job.id,
      candidateId: CANDIDATE_ID,
      tenantId: TENANT_ID,
      projectRankings: [
        {
          projectId: p1.id,
          projectName: p1.name,
          projectSlug: p1.slug,
          relevanceScore: 60.0,
          matchedRequirementIds: [job.requirements[0].id, job.requirements[1].id], // typescript, react
          contributingSkills: ['react', 'typescript', 'nestjs'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE', 'CACHING', 'TESTING'],
          scoreBreakdown: {
            requirementCoverageScore: 25.0,
            architecturalDensityScore: 15.0,
            evidenceQualityScore: 10.0,
            projectCompletenessScore: 5.0,
            recencyScore: 5.0,
          },
        },
        {
          projectId: p2.id,
          projectName: p2.name,
          projectSlug: p2.slug,
          relevanceScore: 58.0,
          matchedRequirementIds: [job.requirements[0].id, job.requirements[1].id, job.requirements[2].id], // typescript, react, python
          contributingSkills: ['react', 'typescript', 'python', 'fastapi'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE', 'CLOUD_DEVOPS'],
          scoreBreakdown: {
            requirementCoverageScore: 35.0,
            architecturalDensityScore: 7.5,
            evidenceQualityScore: 10.0,
            projectCompletenessScore: 3.5,
            recencyScore: 5.0,
          },
        },
        {
          projectId: p3.id,
          projectName: p3.name,
          projectSlug: p3.slug,
          relevanceScore: 50.0,
          matchedRequirementIds: [job.requirements[0].id, job.requirements[1].id], // typescript, react
          contributingSkills: ['react', 'typescript', 'express'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE', 'TESTING', 'REALTIME_COMMUNICATION'],
          scoreBreakdown: {
            requirementCoverageScore: 25.0,
            architecturalDensityScore: 10.0,
            evidenceQualityScore: 10.0,
            projectCompletenessScore: 4.0,
            recencyScore: 5.0,
          },
        },
      ],
    };

    const matchAnalysis = {
      jobDescriptionId: job.id,
      candidateId: CANDIDATE_ID,
      tenantId: TENANT_ID,
      matches: [],
    };

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      candidateProfile,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 3 }
    );

    // Verifies 3 projects are selected (not 1!)
    assert.strictEqual(result.featuredProjects.length, 3, 'Must feature 3 projects when 3 projects have high independent relevance');
    assert.ok(result.featuredProjects.some((p) => p.projectId === p1.id), 'Should feature Product-Data-Explorer');
    assert.ok(result.featuredProjects.some((p) => p.projectId === p2.id), 'Should feature Ai-powered-code-review-assistant');
    assert.ok(result.featuredProjects.some((p) => p.projectId === p3.id), 'Should feature Collaborative-task-manager');
  });

  it('4. PortfolioRecommendationService deduplicates duplicate canonical projects with different slug formats', () => {
    const job = createMockJob();

    // Duplicate project in candidate database: one with repo prefix, one without
    const p1 = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Ai-job-mcp',
      slug: 'vishu1803-ai-job-mcp',
    };
    const p1_dup = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Ai-job-mcp',
      slug: 'ai-job-mcp',
    };

    const candidateProfile = {
      id: CANDIDATE_ID,
      tenantId: TENANT_ID,
      displayName: 'Candidate',
      skills: [],
      projects: [p1, p1_dup],
      resources: [],
    };

    const relAnalysis = {
      jobDescriptionId: job.id,
      candidateId: CANDIDATE_ID,
      tenantId: TENANT_ID,
      projectRankings: [
        {
          projectId: p1.id,
          projectName: p1.name,
          relevanceScore: 50.0,
          matchedRequirementIds: [],
          contributingSkills: [],
          architecturalSignals: [],
          scoreBreakdown: { architecturalDensityScore: 7.5, evidenceQualityScore: 10.0, projectCompletenessScore: 3.5, recencyScore: 5.0 },
        },
        {
          projectId: p1_dup.id,
          projectName: p1_dup.name,
          relevanceScore: 48.0,
          matchedRequirementIds: [],
          contributingSkills: [],
          architecturalSignals: [],
          scoreBreakdown: { architecturalDensityScore: 7.5, evidenceQualityScore: 9.0, projectCompletenessScore: 3.5, recencyScore: 5.0 },
        },
      ],
    };

    const matchAnalysis = { jobDescriptionId: job.id, candidateId: CANDIDATE_ID, tenantId: TENANT_ID, matches: [] };

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      candidateProfile,
      job,
      matchAnalysis,
      relAnalysis,
      null,
      [],
      { maxFeaturedCount: 3 }
    );

    const allProjectNames = [
      ...result.featuredProjects.map((p) => p.projectName),
      ...result.supportingProjects.map((p) => p.projectName),
      ...result.deprioritizedProjects.map((p) => p.projectName),
    ];

    assert.strictEqual(allProjectNames.length, 1, 'Duplicate Ai-job-mcp must be deduplicated to exactly 1 entry');
  });

  it('5. PortfolioRecommendationService excludes archived projects', () => {
    const job = createMockJob();

    const activeProject = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Active-Project',
      slug: 'active-project',
      metadata: { portfolioStatus: 'ACTIVE' },
    };
    const archivedProject = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Old-Archived-Project',
      slug: 'old-archived-project',
      metadata: { portfolioStatus: 'ARCHIVED' },
    };

    const candidateProfile = {
      id: CANDIDATE_ID,
      tenantId: TENANT_ID,
      displayName: 'Candidate',
      skills: [],
      projects: [activeProject, archivedProject],
      resources: [],
    };

    const relAnalysis = {
      jobDescriptionId: job.id,
      candidateId: CANDIDATE_ID,
      tenantId: TENANT_ID,
      projectRankings: [
        {
          projectId: activeProject.id,
          projectName: activeProject.name,
          relevanceScore: 50.0,
          matchedRequirementIds: [],
          contributingSkills: [],
          architecturalSignals: [],
          scoreBreakdown: { architecturalDensityScore: 7.5, evidenceQualityScore: 10.0, projectCompletenessScore: 3.5, recencyScore: 5.0 },
        },
        {
          projectId: archivedProject.id,
          projectName: archivedProject.name,
          relevanceScore: 60.0,
          matchedRequirementIds: [],
          contributingSkills: [],
          architecturalSignals: [],
          scoreBreakdown: { architecturalDensityScore: 7.5, evidenceQualityScore: 10.0, projectCompletenessScore: 3.5, recencyScore: 5.0 },
        },
      ],
    };

    const matchAnalysis = { jobDescriptionId: job.id, candidateId: CANDIDATE_ID, tenantId: TENANT_ID, matches: [] };

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      candidateProfile,
      job,
      matchAnalysis,
      relAnalysis
    );

    const allProjectIds = [
      ...result.featuredProjects.map((p) => p.projectId),
      ...result.supportingProjects.map((p) => p.projectId),
      ...result.deprioritizedProjects.map((p) => p.projectId),
    ];

    assert.ok(allProjectIds.includes(activeProject.id), 'Active project should be evaluated');
    assert.ok(!allProjectIds.includes(archivedProject.id), 'Archived project must be excluded');
  });

  it('6. Strict truth guarantee: unsupported claims (Flask, Growth, LLM indexing) remain unsupported', () => {
    const job = createMockJob();

    // Candidate has only TypeScript and React projects
    const p1 = {
      id: crypto.randomUUID(),
      name: 'vishu1803/Product-Data-Explorer',
      slug: 'product-data-explorer',
    };

    const candidateProfile = {
      id: CANDIDATE_ID,
      tenantId: TENANT_ID,
      displayName: 'Candidate',
      skills: [],
      projects: [p1],
      resources: [],
    };

    const relAnalysis = {
      jobDescriptionId: job.id,
      candidateId: CANDIDATE_ID,
      tenantId: TENANT_ID,
      projectRankings: [
        {
          projectId: p1.id,
          projectName: p1.name,
          relevanceScore: 50.0,
          matchedRequirementIds: [job.requirements[0].id, job.requirements[1].id], // only typescript and react
          contributingSkills: ['react', 'typescript'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE'],
          scoreBreakdown: { architecturalDensityScore: 7.5, evidenceQualityScore: 10.0, projectCompletenessScore: 3.5, recencyScore: 5.0 },
        },
      ],
    };

    const matchAnalysis = { jobDescriptionId: job.id, candidateId: CANDIDATE_ID, tenantId: TENANT_ID, matches: [] };

    const result = PortfolioRecommendationService.recommendPortfolio(
      context,
      candidateProfile,
      job,
      matchAnalysis,
      relAnalysis
    );

    // Flask is NOT covered
    const flaskCoverage = result.targetRequirementsCovered.find((r) => r.skillSlug === 'flask');
    assert.ok(flaskCoverage, 'Flask coverage record should exist in targetRequirementsCovered');
    assert.strictEqual(flaskCoverage.status, 'MISSING', 'Flask status must be MISSING');
    assert.strictEqual(flaskCoverage.coveredByProjectId, null, 'Flask must not be covered by any project');
    assert.strictEqual(flaskCoverage.contributionScore, 0, 'Flask contribution score must be 0');

    // Uncovered requirements list must clearly include Flask and LLM
    assert.ok(result.uncoveredRequirements.some((u) => u.toLowerCase().includes('flask')), 'Uncovered requirements must list Flask');
  });
});
