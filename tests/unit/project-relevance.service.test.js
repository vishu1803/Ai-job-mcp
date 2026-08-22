/**
 * @file Unit Tests for Project Relevance Scoring Service (P5-004)
 *
 * Validates deterministic scoring, 5-part additive formula, taxonomy multipliers,
 * architectural density across 10 dimensions, evidence quality weighting,
 * anti-inflation deduplication, multi-repository aggregation, and multi-tenant default-deny isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  ProjectRelevanceService,
  computeProjectRelevance,
  computeProjectsRelevance,
} from '../../src/services/project-relevance.service.js';
import { ValidationError, NotFoundError } from '../../src/errors/index.js';

describe('Project Relevance Scoring Service Unit Tests (P5-004)', () => {
  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();
  const CANDIDATE_ID = randomUUID();
  const FIXED_EVAL_DATE = new Date('2026-08-20T00:00:00.000Z');

  // Helper to build mock JobDescription
  function createMockJobDescription(overrides = {}) {
    return {
      id: overrides.id || randomUUID(),
      tenantId: overrides.tenantId || TENANT_A,
      title: overrides.title || 'Senior Full-Stack Engineer',
      domain: overrides.domain || 'Fintech',
      experienceLevel: overrides.experienceLevel || 'SENIOR',
      requirements: overrides.requirements || [
        {
          id: randomUUID(),
          name: 'FastAPI',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: randomUUID(),
          name: 'PostgreSQL',
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
        },
        {
          id: randomUUID(),
          name: 'Docker',
          category: 'SKILL',
          importance: 'PREFERRED',
          weight: 0.8,
        },
        {
          id: randomUUID(),
          name: 'Redis',
          category: 'SKILL',
          importance: 'OPTIONAL',
          weight: 0.25,
        },
      ],
    };
  }

  // Helper to build mock Project
  function createMockProject(overrides = {}) {
    const projectId = overrides.id || randomUUID();
    const resourceId = randomUUID();

    return {
      id: projectId,
      tenantId: overrides.tenantId || TENANT_A,
      candidateId: overrides.candidateId || CANDIDATE_ID,
      name: overrides.name || 'Financial Trading Platform',
      slug: overrides.slug || 'financial-trading-platform',
      headline: overrides.headline || 'High-frequency distributed trading system',
      summary:
        overrides.summary ||
        'A production-ready microservices architecture built with FastAPI, PostgreSQL, Docker, Redis, and automated CI/CD workflows spanning extensive unit and integration test suites.',
      isHighlighted: overrides.isHighlighted ?? true,
      startDate: overrides.startDate || '2024-01-01',
      endDate: overrides.endDate || '2026-07-01',
      updatedAt: overrides.updatedAt || '2026-07-01T00:00:00.000Z',
      resources: overrides.resources || [
        {
          id: resourceId,
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          provider: 'GITHUB_APP',
          name: 'trading-api',
          displayName: 'trading-api',
          externalResourceId: '987654321',
          url: 'https://github.com/candidate/trading-api',
        },
      ],
      evidence: overrides.evidence || [
        {
          id: randomUUID(),
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          resourceId,
          projectId,
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'requirements.txt',
            commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            lineRange: { start: 1, end: 5 },
          },
          excerpt: 'fastapi==0.110.0\nuvicorn==0.28.0',
          confidenceScore: 0.98,
          metadata: { technology: 'FastAPI' },
        },
        {
          id: randomUUID(),
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          resourceId,
          projectId,
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'src/db/connection.py',
            commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            lineRange: { start: 10, end: 20 },
          },
          excerpt: 'import psycopg2\nfrom sqlalchemy import create_engine',
          confidenceScore: 0.95,
          metadata: { technology: 'PostgreSQL' },
        },
        {
          id: randomUUID(),
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          resourceId,
          projectId,
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'Dockerfile',
            commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            lineRange: { start: 1, end: 15 },
          },
          excerpt: 'FROM python:3.12-slim\nWORKDIR /app',
          confidenceScore: 0.9,
          metadata: { technology: 'Docker' },
        },
        {
          id: randomUUID(),
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          resourceId,
          projectId,
          evidenceType: 'CODE_USAGE',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'src/cache/redis_client.py',
            commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            lineRange: { start: 5, end: 15 },
          },
          excerpt: 'redis = Redis(host="localhost", port=6379)',
          confidenceScore: 0.92,
          metadata: { technology: 'Redis' },
        },
        {
          id: randomUUID(),
          tenantId: overrides.tenantId || TENANT_A,
          candidateId: overrides.candidateId || CANDIDATE_ID,
          resourceId,
          projectId,
          evidenceType: 'CODE_USAGE',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: 'tests/unit/test_api.py',
            commitSha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            lineRange: { start: 1, end: 25 },
          },
          excerpt: 'def test_trade_execution():\n    assert response.status_code == 200',
          confidenceScore: 0.95,
          metadata: { technology: 'pytest' },
        },
      ],
    };
  }

  // -------------------------------------------------------------------------
  // 1. Core Relevance Scoring & Additive Decomposition
  // -------------------------------------------------------------------------
  describe('1. Core Relevance Scoring & Additive Decomposition', () => {
    it('computes transparent 5-part score breakdown and classifies as HIGH relevance', () => {
      const job = createMockJobDescription();
      const project = createMockProject();

      const result = ProjectRelevanceService.computeProjectRelevance(
        { tenantId: TENANT_A },
        job,
        project,
        { evaluationDate: FIXED_EVAL_DATE }
      );

      assert.strictEqual(result.projectId, project.id);
      assert.strictEqual(result.relevanceBand, 'HIGH');
      assert.ok(result.relevanceScore >= 75.0, `Score was ${result.relevanceScore}`);
      assert.strictEqual(result.scoreBreakdown.totalScore, result.relevanceScore);

      // Verify bounds of all 5 additive components
      assert.ok(result.scoreBreakdown.requirementCoverageScore <= 50.0);
      assert.ok(result.scoreBreakdown.requirementCoverageScore > 40.0);
      assert.ok(result.scoreBreakdown.architecturalDensityScore <= 25.0);
      assert.ok(result.scoreBreakdown.evidenceQualityScore <= 15.0);
      assert.ok(result.scoreBreakdown.projectCompletenessScore <= 5.0);
      assert.ok(result.scoreBreakdown.recencyScore <= 5.0);

      assert.strictEqual(result.matchedRequirementIds.length, 4);
      assert.ok(result.contributingSkills.includes('fastapi'));
      assert.ok(result.contributingSkills.includes('postgresql'));
      assert.ok(result.contributingSkills.includes('docker'));
      assert.ok(result.contributingSkills.includes('redis'));
      assert.ok(result.confidence > 0.85);
    });

    it('clamps final composite score between 0.0 and 100.0', () => {
      const job = createMockJobDescription();
      const project = createMockProject();

      const result = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.ok(result.relevanceScore >= 0.0 && result.relevanceScore <= 100.0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Direct Requirement Coverage & Tier Weights
  // -------------------------------------------------------------------------
  describe('2. Direct Requirement Coverage & Tier Weights', () => {
    it('scores higher for REQUIRED skills than OPTIONAL skills', () => {
      const reqId1 = randomUUID();
      const reqId2 = randomUUID();

      const job = createMockJobDescription({
        requirements: [
          { id: reqId1, name: 'FastAPI', category: 'SKILL', importance: 'REQUIRED', weight: 1.0 },
          { id: reqId2, name: 'Redis', category: 'SKILL', importance: 'OPTIONAL', weight: 0.25 },
        ],
      });

      // Project A covers only REQUIRED FastAPI
      const projectA = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'requirements.txt' },
            confidenceScore: 1.0,
            metadata: { technology: 'FastAPI' },
          },
        ],
      });

      // Project B covers only OPTIONAL Redis
      const projectB = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'requirements.txt' },
            confidenceScore: 1.0,
            metadata: { technology: 'Redis' },
          },
        ],
      });

      const resA = computeProjectRelevance({ tenantId: TENANT_A }, job, projectA, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      const resB = computeProjectRelevance({ tenantId: TENANT_A }, job, projectB, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.ok(
        resA.scoreBreakdown.requirementCoverageScore > resB.scoreBreakdown.requirementCoverageScore,
        `Req coverage for Required (${resA.scoreBreakdown.requirementCoverageScore}) should exceed Optional (${resB.scoreBreakdown.requirementCoverageScore})`
      );
    });

    it('matches DOMAIN requirements against project text and file structure', () => {
      const domainReqId = randomUUID();
      const job = createMockJobDescription({
        requirements: [
          {
            id: domainReqId,
            name: 'Fintech',
            category: 'DOMAIN',
            importance: 'REQUIRED',
            weight: 1.0,
          },
        ],
      });

      const project = createMockProject({
        headline: 'Decentralized Fintech Settlement Network',
        summary: 'Fintech distributed ledger with ISO20022 compliance',
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.ok(res.matchedRequirementIds.includes(domainReqId));
      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 50.0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Deduplication & Anti-Inflation Guard
  // -------------------------------------------------------------------------
  describe('3. Deduplication & Anti-Inflation Guard', () => {
    it('counts single skill at most once even if present in 50 files', () => {
      const reqId = randomUUID();
      const job = createMockJobDescription({
        requirements: [
          { id: reqId, name: 'PostgreSQL', category: 'SKILL', importance: 'REQUIRED', weight: 1.0 },
        ],
      });

      // Project with 10 duplicate evidence items for PostgreSQL
      const duplicateEvidence = Array.from({ length: 10 }, (_, i) => ({
        id: randomUUID(),
        tenantId: TENANT_A,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: { filePath: `src/models/model_${i}.py` },
        confidenceScore: 0.95,
        metadata: { technology: 'PostgreSQL' },
      }));

      const project = createMockProject({ evidence: duplicateEvidence });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.matchedRequirementIds.length, 1);
      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 50.0);
    });

    it('deduplicates skills across multiple linked repositories in the same project', () => {
      const reqId = randomUUID();
      const job = createMockJobDescription({
        requirements: [
          { id: reqId, name: 'TypeScript', category: 'SKILL', importance: 'REQUIRED', weight: 1.0 },
        ],
      });

      const resId1 = randomUUID();
      const resId2 = randomUUID();

      const project = createMockProject({
        resources: [
          {
            id: resId1,
            name: 'frontend',
            displayName: 'frontend',
            provider: 'GITHUB_APP',
            externalResourceId: '1',
          },
          {
            id: resId2,
            name: 'backend',
            displayName: 'backend',
            provider: 'GITHUB_APP',
            externalResourceId: '2',
          },
        ],
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            resourceId: resId1,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'TypeScript' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            resourceId: resId2,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'TypeScript' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.matchedRequirementIds.length, 1);
      assert.strictEqual(res.resourcesCount, 2);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Taxonomy Relationship Multipliers
  // -------------------------------------------------------------------------
  describe('4. Taxonomy Relationship Multipliers', () => {
    it('applies BUILT_ON multiplier (0.90) when project uses Next.js for React requirement', () => {
      const job = createMockJobDescription({
        requirements: [
          {
            id: randomUUID(),
            name: 'React',
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
          },
        ],
      });

      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'Next.js' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 45.0); // 50 * 0.90 = 45.0
      assert.strictEqual(res.explanations[0].relationshipType, 'BUILT_ON');
    });

    it('applies ECOSYSTEM_OF multiplier (0.75) when project uses Drizzle ORM for PostgreSQL requirement', () => {
      const job = createMockJobDescription({
        requirements: [
          {
            id: randomUUID(),
            name: 'PostgreSQL',
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
          },
        ],
      });

      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'Drizzle ORM' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 37.5); // 50 * 0.75 = 37.5
      assert.strictEqual(res.explanations[0].relationshipType, 'ECOSYSTEM_OF');
    });

    it('applies IMPLEMENTS multiplier (0.50) when project uses PostgreSQL for SQL requirement', () => {
      const job = createMockJobDescription({
        requirements: [
          { id: randomUUID(), name: 'SQL', category: 'SKILL', importance: 'REQUIRED', weight: 1.0 },
        ],
      });

      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'PostgreSQL' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 25.0); // 50 * 0.50 = 25.0
      assert.strictEqual(res.explanations[0].relationshipType, 'IMPLEMENTS');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Architectural Density Dimensions
  // -------------------------------------------------------------------------
  describe('5. Architectural Density Dimensions', () => {
    it('scores maximum 25.0 for project exhibiting full-stack architectural depth', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/routes/api.js' },
            metadata: { technology: 'Express' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/db/schema.sql' },
            metadata: { technology: 'PostgreSQL' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/auth/jwt.js' },
            metadata: { technology: 'JWT' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/workers/queue.js' },
            metadata: { technology: 'BullMQ' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CONFIG_SYNTAX_DECLARATION',
            sourceLocation: { filePath: 'Dockerfile' },
            metadata: { technology: 'Docker' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'tests/unit.test.js' },
            metadata: { technology: 'Vitest' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/utils/logger.js' },
            metadata: { technology: 'Pino' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/cache/redis.js' },
            metadata: { technology: 'Redis' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/clients/stripe.js' },
            metadata: { technology: 'Stripe' },
          },
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'DIRECTORY_STRUCTURE',
            sourceLocation: { filePath: 'src/domain/career/index.js' },
            metadata: { technology: 'Clean Architecture' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.scoreBreakdown.architecturalDensityScore, 25.0);
      assert.strictEqual(res.architecturalSignals.length, 10);
    });

    it('scores low architectural density for a single standalone utility file', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'script.py' },
            metadata: { technology: 'Python' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.scoreBreakdown.architecturalDensityScore, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Evidence Quality & Provenance Ranking
  // -------------------------------------------------------------------------
  describe('6. Evidence Quality & Provenance Ranking', () => {
    it('scores PACKAGE_MANIFEST evidence higher than README evidence', () => {
      const job = createMockJobDescription();

      const projectManifest = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'package.json' },
            confidenceScore: 1.0,
            metadata: { technology: 'FastAPI' },
          },
        ],
      });

      const projectReadme = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'README_SPECIFICATION',
            sourceLocation: { filePath: 'README.md' },
            confidenceScore: 1.0,
            metadata: { technology: 'FastAPI' },
          },
        ],
      });

      const resManifest = computeProjectRelevance({ tenantId: TENANT_A }, job, projectManifest, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      const resReadme = computeProjectRelevance({ tenantId: TENANT_A }, job, projectReadme, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(resManifest.scoreBreakdown.evidenceQualityScore, 15.0); // 15 * 1.0 = 15.0
      assert.strictEqual(resReadme.scoreBreakdown.evidenceQualityScore, 4.5); // 15 * 0.3 = 4.5
    });

    it('ignores DOCUMENT_CLAIM for requirement matching and assigns 0 evidence quality', () => {
      const job = createMockJobDescription();
      const projectClaim = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'DOCUMENT_CLAIM',
            sourceLocation: { filePath: 'resume.pdf' },
            confidenceScore: 1.0,
            metadata: { technology: 'FastAPI' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, projectClaim, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res.matchedRequirementIds.length, 0);
      assert.strictEqual(res.scoreBreakdown.evidenceQualityScore, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Activity Recency & Bounded Multipliers
  // -------------------------------------------------------------------------
  describe('7. Activity Recency & Bounded Multipliers', () => {
    it('awards +5.0 pts for activity within 6 months, +3.0 for 6-18 months, +1.5 for 18-36 months, 0 for older', () => {
      const job = createMockJobDescription();

      const proj6Mo = createMockProject({ updatedAt: '2026-06-01T00:00:00.000Z' }); // ~2.5 months prior to FIXED_EVAL_DATE
      const proj12Mo = createMockProject({ updatedAt: '2025-08-01T00:00:00.000Z' }); // ~12 months prior
      const proj24Mo = createMockProject({ updatedAt: '2024-08-01T00:00:00.000Z' }); // ~24 months prior
      const projOld = createMockProject({ updatedAt: '2020-01-01T00:00:00.000Z' }); // > 6 years prior

      const res6 = computeProjectRelevance({ tenantId: TENANT_A }, job, proj6Mo, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      const res12 = computeProjectRelevance({ tenantId: TENANT_A }, job, proj12Mo, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      const res24 = computeProjectRelevance({ tenantId: TENANT_A }, job, proj24Mo, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      const resOld = computeProjectRelevance({ tenantId: TENANT_A }, job, projOld, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(res6.scoreBreakdown.recencyScore, 5.0);
      assert.strictEqual(res12.scoreBreakdown.recencyScore, 3.0);
      assert.strictEqual(res24.scoreBreakdown.recencyScore, 1.5);
      assert.strictEqual(resOld.scoreBreakdown.recencyScore, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Relevance Bands & Bounded Evidence Selection
  // -------------------------------------------------------------------------
  describe('8. Relevance Bands & Bounded Evidence Selection', () => {
    it('categorizes scores into exact relevance bands (HIGH, MEDIUM, LOW, MINIMAL)', () => {
      const job = createMockJobDescription();

      // High relevance project
      const projHigh = createMockProject();
      const resHigh = computeProjectRelevance({ tenantId: TENANT_A }, job, projHigh, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(resHigh.relevanceBand, 'HIGH');

      // Minimal relevance project
      const projMinimal = createMockProject({
        summary: 'Minimal script',
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'FILE_PATTERN_MATCH',
            sourceLocation: { filePath: 'script.sh' },
            confidenceScore: 0.5,
            metadata: { technology: 'Bash' },
          },
        ],
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      const resMinimal = computeProjectRelevance({ tenantId: TENANT_A }, job, projMinimal, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(resMinimal.relevanceBand, 'MINIMAL');
      assert.ok(resMinimal.relevanceScore < 25.0);
    });

    it('returns at most 5 EvidenceRef objects prioritized by rank', () => {
      const job = createMockJobDescription();
      const project = createMockProject();

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.ok(res.supportingEvidence.length <= 5);
      assert.ok(res.supportingEvidence.length > 0);
      assert.ok(res.supportingEvidence[0].filePath);
      assert.ok(res.supportingEvidence[0].lineRange);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Batch Evaluation & Ranking
  // -------------------------------------------------------------------------
  describe('9. Batch Evaluation & Ranking', () => {
    it('ranks projects by relevanceScore descending in computeProjectsRelevance', () => {
      const job = createMockJobDescription();

      const projA = createMockProject({
        name: 'Project Low Relevance',
        evidence: [],
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      const projB = createMockProject({ name: 'Project High Relevance' });

      const batch = computeProjectsRelevance({ tenantId: TENANT_A }, job, [projA, projB], {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(batch.projectRankings.length, 2);
      assert.strictEqual(batch.projectRankings[0].projectName, 'Project High Relevance');
      assert.strictEqual(batch.projectRankings[1].projectName, 'Project Low Relevance');
      assert.strictEqual(batch.topProject.projectName, 'Project High Relevance');
      assert.strictEqual(batch.summary.totalProjectsEvaluated, 2);
      assert.strictEqual(batch.summary.highRelevanceCount, 1);
      assert.strictEqual(batch.summary.minimalRelevanceCount, 1);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Multi-Tenant Sovereign Isolation (404 Default-Deny)
  // -------------------------------------------------------------------------
  describe('10. Multi-Tenant Sovereign Isolation (404 Default-Deny)', () => {
    it('throws 404 NotFoundError on cross-tenant job description', () => {
      const job = createMockJobDescription({ tenantId: TENANT_B });
      const project = createMockProject({ tenantId: TENANT_A });

      assert.throws(
        () => computeProjectRelevance({ tenantId: TENANT_A }, job, project),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant project', () => {
      const job = createMockJobDescription({ tenantId: TENANT_A });
      const project = createMockProject({ tenantId: TENANT_B });

      assert.throws(
        () => computeProjectRelevance({ tenantId: TENANT_A }, job, project),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant child resource', () => {
      const job = createMockJobDescription({ tenantId: TENANT_A });
      const project = createMockProject({
        tenantId: TENANT_A,
        resources: [
          {
            id: randomUUID(),
            tenantId: TENANT_B,
            name: 'foreign-repo',
            displayName: 'foreign-repo',
            provider: 'GITHUB_APP',
            externalResourceId: '1',
          },
        ],
      });

      assert.throws(
        () => computeProjectRelevance({ tenantId: TENANT_A }, job, project),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant evidence node', () => {
      const job = createMockJobDescription({ tenantId: TENANT_A });
      const project = createMockProject({
        tenantId: TENANT_A,
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_B,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'src/main.py' },
          },
        ],
      });

      assert.throws(
        () => computeProjectRelevance({ tenantId: TENANT_A }, job, project),
        NotFoundError
      );
    });

    it('throws ValidationError (400) when context.tenantId is missing', () => {
      const job = createMockJobDescription();
      const project = createMockProject();

      assert.throws(() => computeProjectRelevance({}, job, project), ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // 11. Determinism & Stability
  // -------------------------------------------------------------------------
  describe('11. Determinism & Stability', () => {
    it('produces bit-for-bit identical scores and explanations across 100 consecutive runs', () => {
      const job = createMockJobDescription();
      const project = createMockProject();

      const run1 = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });

      for (let i = 0; i < 100; i++) {
        const runN = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
          evaluationDate: FIXED_EVAL_DATE,
        });
        assert.strictEqual(runN.relevanceScore, run1.relevanceScore);
        assert.strictEqual(runN.confidence, run1.confidence);
        assert.strictEqual(runN.relevanceBand, run1.relevanceBand);
        assert.strictEqual(runN.explanation, run1.explanation);
        assert.deepStrictEqual(runN.scoreBreakdown, run1.scoreBreakdown);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 12. Project Type Classification & Edge Cases
  // -------------------------------------------------------------------------
  describe('12. Project Type Classification & Edge Cases', () => {
    it('infers MONOREPO when pnpm-workspace.yaml or packages/ is present', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CONFIG_SYNTAX_DECLARATION',
            sourceLocation: { filePath: 'pnpm-workspace.yaml' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.projectType, 'MONOREPO');
    });

    it('infers CLI when commander or bin/ is present', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CODE_USAGE',
            sourceLocation: { filePath: 'bin/cli.js' },
            metadata: { technology: 'commander' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.projectType, 'CLI');
    });

    it('infers INFRASTRUCTURE when terraform is present without web frameworks', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'CONFIG_SYNTAX_DECLARATION',
            sourceLocation: { filePath: 'terraform/main.tf' },
            metadata: { technology: 'Terraform' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.projectType, 'INFRASTRUCTURE');
    });

    it('infers DATA_PROJECT when pytorch or pandas is present', () => {
      const job = createMockJobDescription();
      const project = createMockProject({
        evidence: [
          {
            id: randomUUID(),
            tenantId: TENANT_A,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceLocation: { filePath: 'requirements.txt' },
            metadata: { technology: 'pytorch' },
          },
        ],
      });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.projectType, 'DATA_PROJECT');
    });

    it('handles job description with 0 technical requirements by defaulting req coverage to 25.0', () => {
      const job = createMockJobDescription({ requirements: [] });
      const project = createMockProject();

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 25.0);
    });

    it('handles project with 0 evidence gracefully', () => {
      const job = createMockJobDescription();
      const project = createMockProject({ evidence: [], resources: [], summary: '' });

      const res = computeProjectRelevance({ tenantId: TENANT_A }, job, project, {
        evaluationDate: FIXED_EVAL_DATE,
      });
      assert.strictEqual(res.scoreBreakdown.requirementCoverageScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.architecturalDensityScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.evidenceQualityScore, 0.0);
      assert.strictEqual(res.relevanceBand, 'MINIMAL');
      assert.strictEqual(res.supportingEvidence.length, 0);
    });

    it('stably tie-breaks projects with identical scores by projectId ascending in batch evaluation', () => {
      const job = createMockJobDescription();

      const id1 = '11111111-1111-1111-1111-111111111111';
      const id2 = '22222222-2222-2222-2222-222222222222';

      const projA = createMockProject({
        id: id2,
        name: 'Project 2',
        evidence: [],
        updatedAt: '2020-01-01T00:00:00.000Z',
      });
      const projB = createMockProject({
        id: id1,
        name: 'Project 1',
        evidence: [],
        updatedAt: '2020-01-01T00:00:00.000Z',
      });

      const batch = computeProjectsRelevance({ tenantId: TENANT_A }, job, [projA, projB], {
        evaluationDate: FIXED_EVAL_DATE,
      });

      assert.strictEqual(batch.projectRankings[0].projectId, id1);
      assert.strictEqual(batch.projectRankings[1].projectId, id2);
    });
  });
});
