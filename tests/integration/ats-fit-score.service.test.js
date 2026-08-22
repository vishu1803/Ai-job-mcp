/**
 * @file Live Integration Tests for ATS Fit Score Calculator Service (P5-005)
 *
 * Runs against the active PostgreSQL database to verify:
 * 1. End-to-end candidate-job fit analysis calculation with real candidate records
 * 2. Multi-tenant sovereign default-deny isolation (Tenant A cannot score Candidate B against Job A)
 * 3. Complete schema validation and contract compliance
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { calculateCandidateJobFit } from '../../src/services/ats-fit-score.service.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('Live ATS Fit Score Service Integration Tests (P5-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let tenantA;
  let userA;
  let candidateA;

  let tenantB;
  let userB;
  let candidateB;

  let jobA;
  let matchAnalysisA;
  let projectAnalysisA;

  let jobB;
  let matchAnalysisB;
  let projectAnalysisB;

  before(async () => {
    // 1. Provision Tenant A & Candidate A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (ATS Fit ${testRunId})`,
        slug: `tenant-a-fit-${testRunId}`,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-${testRunId}@example.com`,
        displayName: 'Alice Engineer',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        displayName: 'Alice Engineer',
        headline: 'Staff Distributed Systems Engineer',
        summary: 'Experienced backend engineer with deep Go and Kubernetes expertise.',
        canonicalEmail: `alice-${testRunId}@example.com`,
      })
      .returning();

    // 2. Provision Tenant B & Candidate B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (ATS Fit ${testRunId})`,
        slug: `tenant-b-fit-${testRunId}`,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `bob-${testRunId}@example.com`,
        displayName: 'Bob Engineer',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        displayName: 'Bob Engineer',
        headline: 'Frontend Engineer',
        summary: 'Experienced React and TypeScript engineer.',
        canonicalEmail: `bob-${testRunId}@example.com`,
      })
      .returning();

    // 3. Domain Model Fixtures for Tenant A
    const jobIdA = crypto.randomUUID();
    jobA = {
      id: jobIdA,
      tenantId: tenantA.id,
      title: 'Principal Backend Engineer',
      companyName: 'Cloud Native Corp',
      level: 'PRINCIPAL',
      description: 'Looking for a Principal Backend Engineer proficient in Go and Kubernetes.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    matchAnalysisA = {
      jobDescriptionId: jobIdA,
      candidateId: candidateA.id,
      tenantId: tenantA.id,
      summary: {
        totalRequirements: 3,
        matchedCount: 3,
        partialCount: 0,
        missingCount: 0,
        unknownCount: 0,
        criticalGapsCount: 0,
        highGapsCount: 0,
        mediumGapsCount: 0,
        lowGapsCount: 0,
      },
      requirementMatches: [
        {
          requirementId: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'go',
          extractedValue: 'Go',
          matchStatus: 'MATCHED',
          matchConfidence: 0.98,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: crypto.randomUUID(),
            resourceId: crypto.randomUUID(),
            resourceName: 'go-microservices',
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'go.mod',
            confidenceScore: 1.0,
          },
          supportingEvidence: [],
          explanation: 'Verified in go.mod dependency manifest',
        },
        {
          requirementId: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'kubernetes',
          extractedValue: 'Kubernetes',
          matchStatus: 'MATCHED',
          matchConfidence: 0.95,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: crypto.randomUUID(),
            resourceId: crypto.randomUUID(),
            resourceName: 'go-microservices',
            evidenceType: 'CONFIG_SYNTAX_DECLARATION',
            filePath: 'k8s/deployment.yaml',
            confidenceScore: 0.95,
          },
          supportingEvidence: [],
          explanation: 'Verified in Kubernetes deployment manifest',
        },
        {
          requirementId: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'PREFERRED',
          weight: 1.0,
          skillSlug: 'grpc',
          extractedValue: 'gRPC',
          matchStatus: 'MATCHED',
          matchConfidence: 0.9,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: crypto.randomUUID(),
            resourceId: crypto.randomUUID(),
            resourceName: 'go-microservices',
            evidenceType: 'CODE_IMPORT_USAGE',
            filePath: 'proto/service.proto',
            confidenceScore: 0.9,
          },
          supportingEvidence: [],
          explanation: 'Verified in protobuf service definitions',
        },
      ],
      skillGaps: [],
      explanations: [],
      analyzedAt: new Date().toISOString(),
    };

    projectAnalysisA = {
      jobDescriptionId: jobIdA,
      candidateId: candidateA.id,
      tenantId: tenantA.id,
      projectRankings: [
        {
          projectId: crypto.randomUUID(),
          projectName: 'go-microservices',
          projectSlug: 'go-microservices',
          projectType: 'APPLICATION',
          relevanceScore: 92.0,
          relevanceBand: 'HIGH',
          scoreBreakdown: {
            requirementCoverageScore: 48.0,
            architecturalDensityScore: 23.0,
            evidenceQualityScore: 14.0,
            projectCompletenessScore: 4.0,
            recencyScore: 3.0,
            totalScore: 92.0,
          },
          matchedRequirementIds: [crypto.randomUUID()],
          contributingSkills: ['go', 'kubernetes', 'grpc'],
          architecturalSignals: [
            'API_ROUTING',
            'DATA_PERSISTENCE',
            'CLOUD_DEVOPS',
            'AUTOMATED_TESTING',
          ],
          supportingEvidence: [
            {
              id: crypto.randomUUID(),
              resourceId: crypto.randomUUID(),
              resourceName: 'go-microservices',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'go.mod',
              confidenceScore: 1.0,
            },
          ],
          explanations: [],
          explanation: 'HIGH relevance (92.0/100)',
          confidence: 0.95,
          resourcesCount: 1,
        },
      ],
      topProject: null,
      summary: {
        totalProjectsEvaluated: 1,
        highRelevanceCount: 1,
        mediumRelevanceCount: 0,
        lowRelevanceCount: 0,
        minimalRelevanceCount: 0,
        averageProjectScore: 92.0,
      },
      analyzedAt: new Date().toISOString(),
    };

    // 4. Domain Model Fixtures for Tenant B
    const jobIdB = crypto.randomUUID();
    jobB = {
      id: jobIdB,
      tenantId: tenantB.id,
      title: 'Frontend Engineer',
      companyName: 'UI Corp',
      level: 'MID',
      description: 'Looking for a Frontend Engineer with React and TypeScript.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    matchAnalysisB = {
      jobDescriptionId: jobIdB,
      candidateId: candidateB.id,
      tenantId: tenantB.id,
      summary: {
        totalRequirements: 1,
        matchedCount: 1,
        partialCount: 0,
        missingCount: 0,
        unknownCount: 0,
        criticalGapsCount: 0,
        highGapsCount: 0,
        mediumGapsCount: 0,
        lowGapsCount: 0,
      },
      requirementMatches: [
        {
          requirementId: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'react',
          extractedValue: 'React',
          matchStatus: 'MATCHED',
          matchConfidence: 0.95,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: crypto.randomUUID(),
            resourceId: crypto.randomUUID(),
            resourceName: 'react-app',
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'package.json',
            confidenceScore: 1.0,
          },
          supportingEvidence: [],
          explanation: 'Verified in package.json',
        },
      ],
      skillGaps: [],
      explanations: [],
      analyzedAt: new Date().toISOString(),
    };

    projectAnalysisB = {
      jobDescriptionId: jobIdB,
      candidateId: candidateB.id,
      tenantId: tenantB.id,
      projectRankings: [],
      topProject: null,
      summary: {
        totalProjectsEvaluated: 0,
        highRelevanceCount: 0,
        mediumRelevanceCount: 0,
        lowRelevanceCount: 0,
        minimalRelevanceCount: 0,
        averageProjectScore: 0.0,
      },
      analyzedAt: new Date().toISOString(),
    };
  });

  after(async () => {
    for (const tid of createdTenantIds) {
      await db.delete(candidates).where(eq(candidates.tenantId, tid));
      await db.delete(users).where(eq(users.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // 1. End-to-End Live ATS Fit Score Calculation
  // -------------------------------------------------------------------------
  it('1. computes live candidate-job fit analysis under trusted Tenant A context', () => {
    const context = { tenantId: tenantA.id, userId: userA.id };

    const result = calculateCandidateJobFit(
      context,
      jobA,
      matchAnalysisA,
      projectAnalysisA,
      candidateA
    );

    assert.ok(result);
    assert.strictEqual(result.tenantId, tenantA.id);
    assert.strictEqual(result.candidateId, candidateA.id);
    assert.strictEqual(result.jobDescriptionId, jobA.id);
    assert.strictEqual(result.fitBand, 'EXCELLENT');
    assert.ok(result.overallScore >= 90.0);
    assert.strictEqual(result.criticalGapCount, 0);
    assert.strictEqual(result.isCapped, false);
    assert.strictEqual(result.topRelevantProjects.length, 1);
    assert.ok(result.explanation.includes('EXCELLENT fit'));
  });

  // -------------------------------------------------------------------------
  // 2. Multi-Tenant Default-Deny Security Barrier
  // -------------------------------------------------------------------------
  it('2. strictly denies cross-tenant scoring with 404 NotFoundError', () => {
    const contextA = { tenantId: tenantA.id, userId: userA.id };

    // Tenant A attempts to score Candidate B against Job A
    assert.throws(
      () => calculateCandidateJobFit(contextA, jobA, matchAnalysisA, projectAnalysisA, candidateB),
      NotFoundError
    );

    // Tenant A attempts to score Candidate A against Job B
    assert.throws(
      () => calculateCandidateJobFit(contextA, jobB, matchAnalysisA, projectAnalysisA, candidateA),
      NotFoundError
    );

    // Tenant B attempts to score Candidate A against Job B
    const contextB = { tenantId: tenantB.id, userId: userB.id };
    assert.throws(
      () => calculateCandidateJobFit(contextB, jobB, matchAnalysisB, projectAnalysisB, candidateA),
      NotFoundError
    );
  });
});
