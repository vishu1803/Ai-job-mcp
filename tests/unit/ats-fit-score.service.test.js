/**
 * @file Unit Tests for ATS Fit Score Calculator Service (P5-005)
 * Verifies deterministic 100-point composite scoring, 7 additive components,
 * required skill safety caps, decaying top-3 project aggregation, UNKNOWN neutrality,
 * fit bands, explanation narratives, structured strengths, and multi-tenant isolation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  AtsFitScoreService,
  calculateCandidateJobFit,
} from '../../src/services/ats-fit-score.service.js';
import { ValidationError, NotFoundError } from '../../src/errors/index.js';

// ---------------------------------------------------------------------------
// Test Fixtures & Factories
// ---------------------------------------------------------------------------

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_ID = '33333333-3333-4333-8333-333333333333';
const JOB_ID = '44444444-4444-4444-8444-444444444444';
const FIXED_EVAL_DATE = '2026-08-22T12:00:00.000Z';

function createMockJob(overrides = {}) {
  return {
    id: overrides.id || JOB_ID,
    tenantId: overrides.tenantId || TENANT_A,
    title: overrides.title || 'Senior Backend Engineer',
    companyName: 'Tech Corp',
    level: 'SENIOR',
    description:
      'Looking for a Senior Backend Engineer proficient in Python, FastAPI, and PostgreSQL.',
    requirements: overrides.requirements || [],
    createdAt: FIXED_EVAL_DATE,
    updatedAt: FIXED_EVAL_DATE,
  };
}

function createMockProfile(overrides = {}) {
  return {
    id: overrides.id || CANDIDATE_ID,
    tenantId: overrides.tenantId || TENANT_A,
    displayName: 'Alex Rivers',
    headline: 'Senior Full Stack Engineer',
    summary: 'Experienced engineer with 6 years building distributed backend APIs.',
    experience: overrides.experience || [
      {
        id: randomUUID(),
        title: 'Backend Engineer',
        company: 'Cloud Corp',
        startDate: '2020-01-01',
        endDate: '2026-01-01',
        description: 'Built APIs with Python and PostgreSQL',
      },
    ],
    education: overrides.education || [
      {
        id: randomUUID(),
        degree: 'BACHELORS',
        fieldOfStudy: 'Computer Science',
        institution: 'Tech University',
      },
    ],
    location: overrides.location || {
      city: 'San Francisco',
      country: 'US',
      isRemote: true,
    },
    skills: overrides.skills || [],
    projects: overrides.projects || [],
    createdAt: FIXED_EVAL_DATE,
    updatedAt: FIXED_EVAL_DATE,
  };
}

function createMockMatchAnalysis(overrides = {}) {
  return {
    jobDescriptionId: overrides.jobDescriptionId || JOB_ID,
    candidateId: overrides.candidateId || CANDIDATE_ID,
    tenantId: overrides.tenantId || TENANT_A,
    summary: {
      totalRequirements: overrides.totalRequirements ?? 4,
      matchedCount: overrides.matchedCount ?? 4,
      partialCount: overrides.partialCount ?? 0,
      missingCount: overrides.missingCount ?? 0,
      unknownCount: overrides.unknownCount ?? 0,
      criticalGapsCount: overrides.criticalGapsCount ?? 0,
      highGapsCount: overrides.highGapsCount ?? 0,
      mediumGapsCount: overrides.mediumGapsCount ?? 0,
      lowGapsCount: overrides.lowGapsCount ?? 0,
    },
    requirementMatches: overrides.requirementMatches || [
      {
        requirementId: randomUUID(),
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'python',
        extractedValue: 'Python',
        matchStatus: 'MATCHED',
        matchConfidence: 0.95,
        isUserClaim: false,
        relationshipType: 'EXACT',
        primaryEvidence: {
          id: randomUUID(),
          resourceId: randomUUID(),
          resourceName: 'trading-api',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          filePath: 'requirements.txt',
          confidenceScore: 0.95,
        },
        supportingEvidence: [],
        explanation: 'Verified in package manifest',
      },
      {
        requirementId: randomUUID(),
        category: 'SKILL',
        importance: 'REQUIRED',
        weight: 1.0,
        skillSlug: 'fastapi',
        extractedValue: 'FastAPI',
        matchStatus: 'MATCHED',
        matchConfidence: 0.95,
        isUserClaim: false,
        relationshipType: 'EXACT',
        primaryEvidence: {
          id: randomUUID(),
          resourceId: randomUUID(),
          resourceName: 'trading-api',
          evidenceType: 'CODE_IMPORT_USAGE',
          filePath: 'src/main.py',
          confidenceScore: 0.95,
        },
        supportingEvidence: [],
        explanation: 'Verified in source imports',
      },
      {
        requirementId: randomUUID(),
        category: 'SKILL',
        importance: 'PREFERRED',
        weight: 1.0,
        skillSlug: 'docker',
        extractedValue: 'Docker',
        matchStatus: 'MATCHED',
        matchConfidence: 0.9,
        isUserClaim: false,
        relationshipType: 'EXACT',
        primaryEvidence: {
          id: randomUUID(),
          resourceId: randomUUID(),
          resourceName: 'trading-api',
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'Dockerfile',
          confidenceScore: 0.9,
        },
        supportingEvidence: [],
        explanation: 'Verified in Dockerfile',
      },
      {
        requirementId: randomUUID(),
        category: 'EXPERIENCE',
        importance: 'REQUIRED',
        weight: 1.0,
        extractedValue: '5 years backend experience',
        matchStatus: 'MATCHED',
        matchConfidence: 1.0,
        isUserClaim: false,
        relationshipType: 'NONE',
        supportingEvidence: [],
        explanation: 'Candidate has 6 years verified experience',
      },
    ],
    skillGaps: overrides.skillGaps || [],
    explanations: overrides.explanations || [],
    analyzedAt: FIXED_EVAL_DATE,
  };
}

function createMockProject(overrides = {}) {
  const relevanceScore = overrides.relevanceScore ?? 85.0;
  let relevanceBand = 'HIGH';
  if (relevanceScore >= 75.0) relevanceBand = 'HIGH';
  else if (relevanceScore >= 50.0) relevanceBand = 'MEDIUM';
  else if (relevanceScore >= 25.0) relevanceBand = 'LOW';
  else relevanceBand = 'MINIMAL';

  return {
    projectId: overrides.projectId || randomUUID(),
    projectName: overrides.projectName || 'trading-api',
    projectSlug: overrides.projectSlug || 'trading-api',
    projectType: overrides.projectType || 'APPLICATION',
    relevanceScore,
    relevanceBand: overrides.relevanceBand || relevanceBand,
    scoreBreakdown: overrides.scoreBreakdown || {
      requirementCoverageScore: Math.min(50.0, relevanceScore * 0.5),
      architecturalDensityScore: Math.min(25.0, relevanceScore * 0.25),
      evidenceQualityScore: Math.min(15.0, relevanceScore * 0.15),
      projectCompletenessScore: Math.min(5.0, relevanceScore * 0.05),
      recencyScore: Math.min(5.0, relevanceScore * 0.05),
      totalScore: relevanceScore,
    },
    matchedRequirementIds: overrides.matchedRequirementIds || [randomUUID()],
    contributingSkills: overrides.contributingSkills || ['python', 'fastapi', 'postgresql'],
    architecturalSignals: overrides.architecturalSignals || [
      'API_ROUTING',
      'DATA_PERSISTENCE',
      'CLOUD_DEVOPS',
      'AUTOMATED_TESTING',
    ],
    supportingEvidence: overrides.supportingEvidence || [
      {
        id: randomUUID(),
        resourceId: randomUUID(),
        resourceName: 'trading-api',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        filePath: 'requirements.txt',
        confidenceScore: 0.95,
      },
    ],
    explanations: overrides.explanations || [],
    explanation: overrides.explanation || `${relevanceBand} relevance (${relevanceScore}/100)`,
    confidence: overrides.confidence ?? 0.92,
    resourcesCount: overrides.resourcesCount ?? 1,
  };
}

function createMockProjectAnalysis(overrides = {}) {
  const defaultProject = createMockProject();
  const projectRankings = overrides.projectRankings
    ? overrides.projectRankings.map((p) => createMockProject(p))
    : [defaultProject];

  return {
    jobDescriptionId: overrides.jobDescriptionId || JOB_ID,
    candidateId: overrides.candidateId || CANDIDATE_ID,
    tenantId: overrides.tenantId || TENANT_A,
    projectRankings,
    topProject:
      overrides.topProject !== undefined
        ? overrides.topProject
          ? createMockProject(overrides.topProject)
          : null
        : projectRankings[0] || null,
    summary: overrides.summary || {
      totalProjectsEvaluated: projectRankings.length,
      highRelevanceCount: projectRankings.filter((p) => p.relevanceBand === 'HIGH').length,
      mediumRelevanceCount: projectRankings.filter((p) => p.relevanceBand === 'MEDIUM').length,
      lowRelevanceCount: projectRankings.filter((p) => p.relevanceBand === 'LOW').length,
      minimalRelevanceCount: projectRankings.filter((p) => p.relevanceBand === 'MINIMAL').length,
      averageProjectScore:
        projectRankings.length > 0
          ? projectRankings.reduce((acc, p) => acc + p.relevanceScore, 0) / projectRankings.length
          : 0.0,
    },
    analyzedAt: FIXED_EVAL_DATE,
  };
}

// ---------------------------------------------------------------------------
// ATS Fit Score Calculator Unit Tests
// ---------------------------------------------------------------------------

describe('ATS Fit Score Calculator Unit Tests (P5-005)', () => {
  const context = { tenantId: TENANT_A };

  // -------------------------------------------------------------------------
  // 1. Core 100-Point Scoring & Component Decomposition
  // -------------------------------------------------------------------------
  describe('1. Core 100-Point Scoring & Component Decomposition', () => {
    it('exposes calculateCandidateJobFit as both static class method and standalone function', () => {
      assert.strictEqual(AtsFitScoreService.calculateCandidateJobFit, calculateCandidateJobFit);
    });

    it('computes transparent 7-part score breakdown summing up to overallScore', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'python',
            extractedValue: 'Python',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'EXACT',
            primaryEvidence: { id: randomUUID(), resourceId: randomUUID(), resourceName: 'trading-api', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', filePath: 'requirements.txt', confidenceScore: 0.95 },
            supportingEvidence: [],
            explanation: 'Verified',
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'fastapi',
            extractedValue: 'FastAPI',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'EXACT',
            primaryEvidence: { id: randomUUID(), resourceId: randomUUID(), resourceName: 'trading-api', evidenceType: 'CODE_IMPORT_USAGE', filePath: 'src/main.py', confidenceScore: 0.95 },
            supportingEvidence: [],
            explanation: 'Verified',
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            skillSlug: 'docker',
            extractedValue: 'Docker',
            matchStatus: 'MATCHED',
            matchConfidence: 0.9,
            isUserClaim: false,
            relationshipType: 'EXACT',
            primaryEvidence: { id: randomUUID(), resourceId: randomUUID(), resourceName: 'trading-api', evidenceType: 'CONFIG_SYNTAX_DECLARATION', filePath: 'Dockerfile', confidenceScore: 0.9 },
            supportingEvidence: [],
            explanation: 'Verified',
          },
          {
            requirementId: randomUUID(),
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            extractedValue: '5 years backend experience',
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            isUserClaim: false,
            relationshipType: 'NONE',
            supportingEvidence: [],
            explanation: 'Candidate has 6 years verified experience',
          },
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 0.75,
            extractedValue: 'Bachelor degree in CS',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'NONE',
            supportingEvidence: [],
            explanation: 'Candidate has Bachelors in CS',
          },
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            extractedValue: 'Remote',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'NONE',
            supportingEvidence: [],
            explanation: 'Remote role compatible',
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const result = calculateCandidateJobFit(
        context,
        job,
        matchAnalysis,
        projectAnalysis,
        profile,
        { analyzedAt: FIXED_EVAL_DATE }
      );

      assert.ok(result.overallScore >= 90.0, 'Expected high overall score');
      assert.strictEqual(result.fitBand, 'EXCELLENT');
      assert.strictEqual(result.isCapped, false);
      assert.strictEqual(result.criticalGapCount, 0);

      const bd = result.scoreBreakdown;
      assert.strictEqual(bd.requiredSkillsScore, 40.0);
      assert.strictEqual(bd.preferredSkillsScore, 15.0);
      assert.strictEqual(bd.projectRelevanceScore, 17.0); // 20 * (85/100) = 17.0
      assert.strictEqual(bd.experienceFitScore, 10.0);
      assert.strictEqual(bd.educationFitScore, 5.0);
      assert.strictEqual(bd.locationFitScore, 5.0);
      assert.ok(bd.evidenceConfidenceScore > 0 && bd.evidenceConfidenceScore <= 5.0);

      const expectedRaw =
        bd.requiredSkillsScore +
        bd.preferredSkillsScore +
        bd.projectRelevanceScore +
        bd.experienceFitScore +
        bd.educationFitScore +
        bd.locationFitScore +
        bd.evidenceConfidenceScore;

      assert.strictEqual(bd.rawScore, Math.round(expectedRaw * 100) / 100);
      assert.strictEqual(result.overallScore, bd.rawScore);
    });

    it('clamps each component score within its strict architectural boundaries', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis();

      const result = calculateCandidateJobFit(
        context,
        job,
        matchAnalysis,
        projectAnalysis,
        profile
      );
      const bd = result.scoreBreakdown;

      assert.ok(bd.requiredSkillsScore >= 0.0 && bd.requiredSkillsScore <= 40.0);
      assert.ok(bd.preferredSkillsScore >= 0.0 && bd.preferredSkillsScore <= 15.0);
      assert.ok(bd.projectRelevanceScore >= 0.0 && bd.projectRelevanceScore <= 20.0);
      assert.ok(bd.experienceFitScore >= 0.0 && bd.experienceFitScore <= 10.0);
      assert.ok(bd.educationFitScore >= 0.0 && bd.educationFitScore <= 5.0);
      assert.ok(bd.locationFitScore >= 0.0 && bd.locationFitScore <= 5.0);
      assert.ok(bd.evidenceConfidenceScore >= 0.0 && bd.evidenceConfidenceScore <= 5.0);
      assert.ok(result.overallScore >= 0.0 && result.overallScore <= 100.0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Required Skills Coverage & Partial Factors
  // -------------------------------------------------------------------------
  describe('2. Required Skills Coverage & Partial Factors', () => {
    it('awards 40.0 pts for 100% matched required technical skills', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.requiredSkillsScore, 40.0);
    });

    it('applies 0.75 partial factor for BUILT_ON adjacent skills', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            relationshipType: 'BUILT_ON',
            matchConfidence: 0.9,
            supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.requiredSkillsScore, 30.0); // 40 * 0.75 = 30.0
    });

    it('applies 0.25 partial factor for unverified manual claims', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            isUserClaim: true,
            claimLabel: '[Unverified User Claim]',
            matchConfidence: 0.6,
            supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.requiredSkillsScore, 10.0); // 40 * 0.25 = 10.0
    });
  });

  // -------------------------------------------------------------------------
  // 3. Required Skill Safety Gate (Hard Score Ceiling)
  // -------------------------------------------------------------------------
  describe('3. Required Skill Safety Gate (Hard Score Ceiling)', () => {
    it('caps score at 74.9 (MODERATE) when 1 critical required skill is missing', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 0.75,
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            supportingEvidence: [],
          },
        ],
        skillGaps: [
          {
            requirementId: randomUUID(),
            skillName: 'PostgreSQL',
            category: 'SKILL',
            priority: 'CRITICAL',
            severity: 'EXPLICITLY_MISSING',
            status: 'MISSING',
            reason: 'Missing PostgreSQL requirement',
            recommendation: 'Add PostgreSQL evidence',
          },
        ],
      });

      // Give candidate top 100-score project, full experience, education, and location
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [
          { projectId: randomUUID(), relevanceScore: 100.0, supportingEvidence: [] },
        ],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);

      // Raw score = 20 (req) + 15 (pref) + 20 (proj) + 10 (exp) + 5 (edu) + 5 (loc) + 0 = 75.0
      assert.strictEqual(res.criticalGapCount, 1);
      assert.strictEqual(res.scoreBreakdown.scoreCap, 74.9);
      assert.strictEqual(res.isCapped, true);
      assert.strictEqual(res.overallScore, 74.9);
      assert.strictEqual(res.fitBand, 'MODERATE', '1 critical gap cannot exceed MODERATE band');
    });

    it('caps score at 49.9 (WEAK) when 2 critical required skills are missing', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        skillGaps: [
          {
            requirementId: randomUUID(),
            skillName: 'Python',
            category: 'SKILL',
            priority: 'CRITICAL',
            severity: 'EXPLICITLY_MISSING',
            status: 'MISSING',
            reason: 'Missing Python',
            recommendation: 'Learn Python',
          },
          {
            requirementId: randomUUID(),
            skillName: 'PostgreSQL',
            category: 'SKILL',
            priority: 'CRITICAL',
            severity: 'EXPLICITLY_MISSING',
            status: 'MISSING',
            reason: 'Missing PostgreSQL',
            recommendation: 'Learn PostgreSQL',
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.criticalGapCount, 2);
      assert.strictEqual(res.scoreBreakdown.scoreCap, 49.9);
      assert.ok(res.overallScore <= 49.9);
      assert.strictEqual(res.fitBand, 'WEAK');
    });

    it('caps score at 24.9 (LOW) when 3 or more critical required skills are missing', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        skillGaps: [
          {
            requirementId: randomUUID(),
            skillName: 'A',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
          {
            requirementId: randomUUID(),
            skillName: 'B',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
          {
            requirementId: randomUUID(),
            skillName: 'C',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.criticalGapCount, 3);
      assert.strictEqual(res.scoreBreakdown.scoreCap, 24.9);
      assert.ok(res.overallScore <= 24.9);
      assert.strictEqual(res.fitBand, 'LOW');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Decaying Top-3 Project Aggregation
  // -------------------------------------------------------------------------
  describe('4. Decaying Top-3 Project Aggregation', () => {
    it('aggregates top 3 projects using 60% / 30% / 10% weights', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [
          { projectId: randomUUID(), relevanceScore: 100.0, supportingEvidence: [] },
          { projectId: randomUUID(), relevanceScore: 80.0, supportingEvidence: [] },
          { projectId: randomUUID(), relevanceScore: 50.0, supportingEvidence: [] },
          { projectId: randomUUID(), relevanceScore: 20.0, supportingEvidence: [] }, // 4th project ignored
        ],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // Aggregate = 0.60*100 + 0.30*80 + 0.10*50 = 60 + 24 + 5 = 89.0
      // 20 * (89.0 / 100) = 17.80 pts
      assert.strictEqual(res.scoreBreakdown.projectRelevanceScore, 17.8);
      assert.strictEqual(res.topRelevantProjects.length, 3);
    });

    it('handles candidate with exactly 1 project gracefully without penalty', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [
          { projectId: randomUUID(), relevanceScore: 90.0, supportingEvidence: [] },
        ],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // Aggregate = 90.0 -> 20 * (90/100) = 18.0 pts
      assert.strictEqual(res.scoreBreakdown.projectRelevanceScore, 18.0);
    });

    it('handles candidate with 0 projects by assigning 0.0 pts to project relevance', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.projectRelevanceScore, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 5. UNKNOWN != MISSING Neutrality
  // -------------------------------------------------------------------------
  describe('5. UNKNOWN != MISSING Neutrality', () => {
    it('awards neutral baseline credit for UNKNOWN education without penalizing candidate', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'UNKNOWN',
            matchConfidence: 0.5,
            supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(
        res.scoreBreakdown.educationFitScore,
        5.0,
        'UNKNOWN education must yield full 5.0 baseline'
      );
    });

    it('awards neutral baseline credit for UNKNOWN location without penalizing candidate', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'UNKNOWN',
            matchConfidence: 0.5,
            supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(
        res.scoreBreakdown.locationFitScore,
        5.0,
        'UNKNOWN location must yield full 5.0 baseline'
      );
    });

    it('fails closed with INSUFFICIENT_DATA when JD has 0 total requirements', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [], // 0 total requirements
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.analysisStatus, 'INSUFFICIENT_DATA');
      assert.strictEqual(res.fitBand, 'INSUFFICIENT_DATA');
      assert.strictEqual(res.overallScore, null);
      assert.strictEqual(res.scoreBreakdown.educationFitScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.locationFitScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.experienceFitScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.requiredSkillsScore, 0.0);
      assert.strictEqual(res.scoreBreakdown.preferredSkillsScore, 0.0);
      assert.ok(res.zeroRequirementWarning.includes('Insufficient structured requirements'));
    });
  });

  // -------------------------------------------------------------------------
  // 6. Evidence Confidence & Quality Ranking
  // -------------------------------------------------------------------------
  describe('6. Evidence Confidence & Quality Ranking', () => {
    it('scores source code evidence higher than package manifest or documentation evidence', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'repo',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/server.js',
              confidenceScore: 1.0,
            },
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis({ projectRankings: [] });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // CODE_USAGE weight = 1.0, confidence = 1.0, max = 5.0 => 5.0
      assert.strictEqual(res.scoreBreakdown.evidenceConfidenceScore, 5.0);
    });

    it('assigns 0.0 evidence confidence for purely self-asserted DOCUMENT_CLAIM', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            matchConfidence: 0.5,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'repo',
              evidenceType: 'DOCUMENT_CLAIM',
              filePath: 'claims.txt',
              confidenceScore: 1.0,
            },
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis({ projectRankings: [] });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.evidenceConfidenceScore, 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Fit Bands & Boundaries
  // -------------------------------------------------------------------------
  describe('7. Fit Bands & Boundaries', () => {
    it('maps scores >= 90.0 to EXCELLENT', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0,
            matchStatus: 'MATCHED', matchConfidence: 1.0, supportingEvidence: [],
          },
          {
            requirementId: randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0,
            matchStatus: 'MATCHED', matchConfidence: 1.0, supportingEvidence: [],
          },
          {
            requirementId: randomUUID(), category: 'SKILL', importance: 'PREFERRED', weight: 1.0,
            matchStatus: 'MATCHED', matchConfidence: 1.0, supportingEvidence: [],
          },
          {
            requirementId: randomUUID(), category: 'EXPERIENCE', importance: 'REQUIRED', weight: 1.0,
            matchStatus: 'MATCHED', matchConfidence: 1.0, supportingEvidence: [],
          },
          {
            requirementId: randomUUID(), category: 'EDUCATION', importance: 'REQUIRED', weight: 0.75,
            matchStatus: 'MATCHED', matchConfidence: 0.95, supportingEvidence: [],
          },
          {
            requirementId: randomUUID(), category: 'LOCATION', importance: 'REQUIRED', weight: 1.0,
            matchStatus: 'MATCHED', matchConfidence: 0.95, supportingEvidence: [],
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.ok(res.overallScore >= 90.0);
      assert.strictEqual(res.fitBand, 'EXCELLENT');
    });

    it('evaluates lower boundary (0.0 score) into LOW band', () => {
      const job = createMockJob();
      const profile = createMockProfile({ experience: [], education: [] });
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
            supportingEvidence: [],
          },
        ],
        skillGaps: [
          {
            requirementId: randomUUID(),
            skillName: 'A',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
          {
            requirementId: randomUUID(),
            skillName: 'B',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
          {
            requirementId: randomUUID(),
            skillName: 'C',
            category: 'SKILL',
            priority: 'CRITICAL',
            status: 'MISSING',
            severity: 'EXPLICITLY_MISSING',
            reason: 'r',
            recommendation: 'rec',
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis({ projectRankings: [] });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.overallScore, 0.0);
      assert.strictEqual(res.fitBand, 'LOW');
    });

    it('evaluates upper boundary (100.0 score) into EXCELLENT band', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'repo',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              confidenceScore: 1.0,
            },
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'repo',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              filePath: 'package.json',
              confidenceScore: 1.0,
            },
          },
          {
            requirementId: randomUUID(),
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
          },
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
          },
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'MATCHED',
            matchConfidence: 1.0,
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [
          {
            projectId: randomUUID(),
            relevanceScore: 100.0,
            supportingEvidence: [
              {
                id: randomUUID(),
                resourceId: randomUUID(),
                resourceName: 'repo',
                evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
                filePath: 'package.json',
                confidenceScore: 1.0,
              },
            ],
          },
        ],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // 40 (req) + 15 (pref) + 20 (proj) + 10 (exp) + 5 (edu) + 5 (loc) + evidence_confidence
      // evidence_confidence: CODE_IMPORT_USAGE at 0.95 * 1.0 * 5.0 = 4.75, MANIFEST at 0.75 * 1.0 * 5.0 = 3.75
      // avg of cited evidence (2 from req matches): (0.95 + 0.95) / 2 * 5 = 4.75
      // Total: 40 + 15 + 20 + 10 + 5 + 5 + 4.75 = 99.75 but capped at 100
      // With PACKAGE_MANIFEST (0.75 weight): (0.75 + 0.75) / 2 * 5 = 3.75
      // Total: 40 + 15 + 20 + 10 + 5 + 5 + 3.75 = 98.75
      assert.ok(res.overallScore >= 98.0 && res.overallScore <= 100.0,
        `Overall score ${res.overallScore} should be in upper range [98.0, 100.0]`);
      assert.strictEqual(res.fitBand, 'EXCELLENT');
      assert.strictEqual(res.isCapped, false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Preferred Skills & Non-Skill Protocols Detail
  // -------------------------------------------------------------------------
  describe('8. Preferred Skills & Non-Skill Protocols Detail', () => {
    it('evaluates partial and missing preferred skills correctly', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            relationshipType: 'BUILT_ON',
            matchConfidence: 0.9,
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            matchStatus: 'MISSING',
            matchConfidence: 0.0,
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // Total weight = 2. Covered = 0.75 + 0 = 0.75. Ratio = 0.75 / 2 = 0.375. Score = 15 * 0.375 = 5.63 pts.
      assert.strictEqual(res.scoreBreakdown.preferredSkillsScore, 5.63);
    });

    it('evaluates matched vs partial vs missing experience correctly', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'EXPERIENCE',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            matchConfidence: 0.5,
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // Partial factor = 0.5 -> 10.0 * 0.5 = 5.0 pts
      assert.strictEqual(res.scoreBreakdown.experienceFitScore, 5.0);
    });

    it('evaluates partial education (adjacent STEM degree) as 3.0 pts (0.60 factor)', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'EDUCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            matchConfidence: 0.7,
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.educationFitScore, 3.0); // 5.0 * 0.6 = 3.0
    });

    it('evaluates partial location (commutable hybrid/relocation) as 3.75 pts (0.75 factor)', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis({
        requirementMatches: [
          {
            requirementId: randomUUID(),
            category: 'LOCATION',
            importance: 'REQUIRED',
            weight: 1.0,
            matchStatus: 'PARTIAL',
            matchConfidence: 0.75,
          },
        ],
      });
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.strictEqual(res.scoreBreakdown.locationFitScore, 3.75); // 5.0 * 0.75 = 3.75
    });
  });

  // -------------------------------------------------------------------------
  // 9. Safety Invariants & Anti-Inflation Guards
  // -------------------------------------------------------------------------
  describe('9. Safety Invariants & Anti-Inflation Guards', () => {
    it('deduplicates project IDs so the same project is never counted twice', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const duplicateProjectId = randomUUID();
      const projectAnalysis = createMockProjectAnalysis({
        projectRankings: [
          { projectId: duplicateProjectId, relevanceScore: 80.0 },
          { projectId: duplicateProjectId, relevanceScore: 80.0 }, // Duplicate entry
        ],
      });

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      // Deduplicated unique projects = 1 project of score 80.0 -> aggregate = 80.0 -> 20 * (80/100) = 16.0 pts
      assert.strictEqual(res.scoreBreakdown.projectRelevanceScore, 16.0);
    });

    it('strictly prevents scores from exceeding 100.0 or falling below 0.0', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis();

      const res = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile);
      assert.ok(res.overallScore <= 100.0);
      assert.ok(res.overallScore >= 0.0);
      assert.ok(res.scoreBreakdown.rawScore <= 100.0);
      assert.ok(res.scoreBreakdown.rawScore >= 0.0);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Deterministic Output & Invariance
  // -------------------------------------------------------------------------
  describe('10. Deterministic Output & Invariance', () => {
    it('produces bit-for-bit identical outputs across 100 consecutive runs', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis();

      const run1 = calculateCandidateJobFit(context, job, matchAnalysis, projectAnalysis, profile, {
        analyzedAt: FIXED_EVAL_DATE,
      });

      for (let i = 0; i < 100; i++) {
        const runN = calculateCandidateJobFit(
          context,
          job,
          matchAnalysis,
          projectAnalysis,
          profile,
          { analyzedAt: FIXED_EVAL_DATE }
        );
        assert.strictEqual(runN.overallScore, run1.overallScore);
        assert.strictEqual(runN.fitBand, run1.fitBand);
        assert.strictEqual(runN.explanation, run1.explanation);
        assert.strictEqual(runN.confidence, run1.confidence);
        assert.deepStrictEqual(runN.scoreBreakdown, run1.scoreBreakdown);
        assert.deepStrictEqual(runN.keyStrengths, run1.keyStrengths);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11. Multi-Tenant Sovereign Isolation (404 Default-Deny)
  // -------------------------------------------------------------------------
  describe('11. Multi-Tenant Sovereign Isolation (404 Default-Deny)', () => {
    it('throws 404 NotFoundError on cross-tenant job description', () => {
      const job = createMockJob({ tenantId: TENANT_B });
      const profile = createMockProfile({ tenantId: TENANT_A });
      const matchAnalysis = createMockMatchAnalysis({ tenantId: TENANT_A });
      const projectAnalysis = createMockProjectAnalysis({ tenantId: TENANT_A });

      assert.throws(
        () =>
          calculateCandidateJobFit(
            { tenantId: TENANT_A },
            job,
            matchAnalysis,
            projectAnalysis,
            profile
          ),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant candidate profile', () => {
      const job = createMockJob({ tenantId: TENANT_A });
      const profile = createMockProfile({ tenantId: TENANT_B });
      const matchAnalysis = createMockMatchAnalysis({ tenantId: TENANT_A });
      const projectAnalysis = createMockProjectAnalysis({ tenantId: TENANT_A });

      assert.throws(
        () =>
          calculateCandidateJobFit(
            { tenantId: TENANT_A },
            job,
            matchAnalysis,
            projectAnalysis,
            profile
          ),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant match analysis', () => {
      const job = createMockJob({ tenantId: TENANT_A });
      const profile = createMockProfile({ tenantId: TENANT_A });
      const matchAnalysis = createMockMatchAnalysis({ tenantId: TENANT_B });
      const projectAnalysis = createMockProjectAnalysis({ tenantId: TENANT_A });

      assert.throws(
        () =>
          calculateCandidateJobFit(
            { tenantId: TENANT_A },
            job,
            matchAnalysis,
            projectAnalysis,
            profile
          ),
        NotFoundError
      );
    });

    it('throws 404 NotFoundError on cross-tenant project relevance analysis', () => {
      const job = createMockJob({ tenantId: TENANT_A });
      const profile = createMockProfile({ tenantId: TENANT_A });
      const matchAnalysis = createMockMatchAnalysis({ tenantId: TENANT_A });
      const projectAnalysis = createMockProjectAnalysis({ tenantId: TENANT_B });

      assert.throws(
        () =>
          calculateCandidateJobFit(
            { tenantId: TENANT_A },
            job,
            matchAnalysis,
            projectAnalysis,
            profile
          ),
        NotFoundError
      );
    });

    it('throws ValidationError when context.tenantId is missing', () => {
      const job = createMockJob();
      const profile = createMockProfile();
      const matchAnalysis = createMockMatchAnalysis();
      const projectAnalysis = createMockProjectAnalysis();

      assert.throws(
        () => calculateCandidateJobFit({}, job, matchAnalysis, projectAnalysis, profile),
        ValidationError
      );
    });
  });
});
