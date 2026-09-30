/**
 * @file Unit Tests for Multi-Dimensional ATS Intelligence Service (Phase 2)
 *
 * Verifies:
 * 1. Output adheres strictly to MultiDimensionalAtsReportSchema
 * 2. Exposes all 8 distinct dimensions with required metadata:
 *    - ATS_PARSEABILITY_SCORE
 *    - ATS_EXTRACTION_SCORE
 *    - KEYWORD_COVERAGE_SCORE
 *    - CONTENT_QUALITY_SCORE
 *    - JOB_FIT_SCORE
 *    - EVIDENCE_CONFIDENCE_SCORE
 *    - CANDIDATE_QUALITY_SCORE
 *    - APPLICATION_READINESS_SCORE
 * 3. Does NOT collapse everything into one unexplained score
 * 4. Distinguishes high formatting extractability from low job fit
 * 5. Enforces safety gates on Application Readiness
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AtsMultiDimensionalIntelligenceService } from '../../src/services/ats-multi-dimensional-intelligence.service.js';

describe('Multi-Dimensional ATS Intelligence Service (Phase 2)', () => {
  const service = new AtsMultiDimensionalIntelligenceService();

  function createSampleInputs(overrides = {}) {
    const tenantId = overrides.context?.tenantId || overrides.tenantId || randomUUID();
    const candidateId = overrides.candidateProfile?.id || overrides.candidateId || randomUUID();
    const jobId = overrides.jobDescription?.id || overrides.jobId || randomUUID();

    const candidateProfile = {
      id: candidateId,
      tenantId,
      displayName: 'Jane Doe',
      skills: [{ name: 'JavaScript' }, { name: 'Node.js' }],
      projects: [
        {
          id: randomUUID(),
          name: 'cloud-api',
          technologies: ['Node.js', 'PostgreSQL'],
        },
      ],
      experience: [
        {
          id: randomUUID(),
          title: 'Software Engineer',
          company: 'Acme Corp',
          startDate: '2021-01-01',
          endDate: '2026-01-01',
        },
      ],
    };

    const structuredResume = {
      candidateIdentity: {
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555-123-4567',
      },
      summary: 'Senior software engineer with 5 years experience in Node.js and PostgreSQL.',
      skills: ['JavaScript', 'Node.js', 'PostgreSQL'],
      experience: candidateProfile.experience,
      projects: candidateProfile.projects,
      education: [
        {
          degree: 'Bachelor of Science',
          field: 'Computer Science',
          institution: 'State University',
        },
      ],
    };

    const extractedText = `
Jane Doe
jane@example.com | 555-123-4567
Professional Summary
Senior software engineer with 5 years experience in Node.js and PostgreSQL.
Technical Skills
JavaScript, Node.js, PostgreSQL
Professional Experience
Software Engineer at Acme Corp (2021 - 2026)
Built high-throughput backend services using Node.js and PostgreSQL.
Technical Projects
cloud-api: RESTful microservice built with Node.js and PostgreSQL.
Education
Bachelor of Science in Computer Science, State University
    `.trim();

    const jobDescription = {
      id: jobId,
      tenantId,
      title: 'Senior Node.js Backend Engineer',
      requirements: [
        {
          id: randomUUID(),
          name: 'Node.js',
          importance: 'REQUIRED',
          category: 'SKILL',
        },
        {
          id: randomUUID(),
          name: 'PostgreSQL',
          importance: 'REQUIRED',
          category: 'SKILL',
        },
      ],
    };

    const candidateMatchAnalysis = {
      candidateId,
      jobDescriptionId: jobId,
      tenantId,
      summary: {
        totalRequirements: 2,
        matchedCount: 2,
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
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'nodejs',
          extractedValue: 'Node.js',
          matchStatus: 'MATCHED',
          matchConfidence: 0.95,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: randomUUID(),
            resourceId: randomUUID(),
            resourceName: 'cloud-api',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/index.js',
            confidenceScore: 0.95,
          },
          supportingEvidence: [],
          explanation: 'Verified in codebase',
        },
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'postgresql',
          extractedValue: 'PostgreSQL',
          matchStatus: 'MATCHED',
          matchConfidence: 0.95,
          isUserClaim: false,
          relationshipType: 'EXACT',
          primaryEvidence: {
            id: randomUUID(),
            resourceId: randomUUID(),
            resourceName: 'cloud-api',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/db.js',
            confidenceScore: 0.95,
          },
          supportingEvidence: [],
          explanation: 'Verified in codebase',
        },
      ],
      skillGaps: [],
      explanations: [],
      analyzedAt: new Date().toISOString(),
    };

    const mockProject = {
      projectId: randomUUID(),
      projectName: 'cloud-api',
      projectSlug: 'cloud-api',
      projectType: 'APPLICATION',
      relevanceScore: 85.0,
      relevanceBand: 'HIGH',
      scoreBreakdown: {
        requirementCoverageScore: 42.5,
        architecturalDensityScore: 21.25,
        evidenceQualityScore: 12.75,
        projectCompletenessScore: 4.25,
        recencyScore: 4.25,
        totalScore: 85.0,
      },
      matchedRequirementIds: [randomUUID()],
      contributingSkills: ['nodejs', 'postgresql'],
      architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE'],
      supportingEvidence: [
        {
          id: randomUUID(),
          resourceId: randomUUID(),
          resourceName: 'cloud-api',
          evidenceType: 'CODE_USAGE',
          filePath: 'src/index.js',
          confidenceScore: 0.95,
        },
      ],
      explanations: [],
      explanation: 'HIGH relevance (85.0/100)',
      confidence: 0.95,
      resourcesCount: 1,
    };

    const projectRelevanceAnalysis = {
      candidateId,
      jobDescriptionId: jobId,
      tenantId,
      projectRankings: [mockProject],
      topProject: mockProject,
      summary: {
        totalProjectsEvaluated: 1,
        highRelevanceCount: 1,
        mediumRelevanceCount: 0,
        lowRelevanceCount: 0,
        minimalRelevanceCount: 0,
        averageProjectScore: 85.0,
      },
      analyzedAt: new Date().toISOString(),
    };

    return {
      context: { tenantId },
      candidateProfile,
      structuredResume,
      extractedText,
      jobDescription,
      candidateMatchAnalysis,
      projectRelevanceAnalysis,
      ...overrides,
    };
  }

  it('evaluates all 8 distinct dimensions and returns a valid report', () => {
    const inputs = createSampleInputs();
    const report = service.evaluateAllDimensions(inputs);

    assert.ok(report);
    assert.strictEqual(report.reportVersion, '1.0.0');

    // Confirm all 8 dimensions are present and conform to ScoreDimensionSchema
    const dims = report.dimensions;
    assert.ok(dims.atsParseability);
    assert.ok(dims.atsExtraction);
    assert.ok(dims.keywordCoverage);
    assert.ok(dims.contentQuality);
    assert.ok(dims.jobFit);
    assert.ok(dims.evidenceConfidence);
    assert.ok(dims.candidateQuality);
    assert.ok(dims.applicationReadiness);

    for (const [key, dim] of Object.entries(dims)) {
      assert.ok(typeof dim.score === 'number', `${key}.score must be number`);
      assert.ok(dim.score >= 0.0 && dim.score <= 100.0, `${key}.score in [0, 100]`);
      assert.strictEqual(dim.max, 100.0, `${key}.max must be 100.0`);
      assert.ok(dim.confidence >= 0.0 && dim.confidence <= 1.0, `${key}.confidence in [0, 1]`);
      assert.ok(typeof dim.explanation === 'string' && dim.explanation.length > 0);
      assert.ok(Array.isArray(dim.factors), `${key}.factors must be array`);
      assert.ok(Array.isArray(dim.warnings), `${key}.warnings must be array`);
      assert.ok(Array.isArray(dim.evidence), `${key}.evidence must be array`);
      assert.ok(typeof dim.calculation === 'object', `${key}.calculation must be object`);
    }

    assert.ok(dims.atsParseability.score >= 70.0);
    assert.ok(dims.atsExtraction.score >= 70.0);
    assert.ok(dims.jobFit.score >= 70.0);
  });

  it('distinguishes high document parseability from low job fit', () => {
    // Scenario: Well-formatted PDF, but candidate is missing required skills
    const jobId = randomUUID();
    const candidateId = randomUUID();
    const tenantId = randomUUID();
    const req1Id = randomUUID();
    const req2Id = randomUUID();
    const req3Id = randomUUID();

    const inputs = createSampleInputs({
      context: { tenantId },
      candidateId,
      jobId,
      jobDescription: {
        id: jobId,
        tenantId,
        title: 'Machine Learning Research Engineer',
        requirements: [
          {
            id: req1Id,
            name: 'PyTorch',
            importance: 'REQUIRED',
            category: 'SKILL',
          },
          {
            id: req2Id,
            name: 'CUDA',
            importance: 'REQUIRED',
            category: 'SKILL',
          },
          {
            id: req3Id,
            name: 'Node.js',
            importance: 'REQUIRED',
            category: 'SKILL',
          },
          {
            id: randomUUID(),
            name: 'Python',
            importance: 'PREFERRED',
            category: 'SKILL',
          },
          {
            id: randomUUID(),
            name: 'Linux',
            importance: 'PREFERRED',
            category: 'SKILL',
          },
        ],
      },
      candidateMatchAnalysis: {
        candidateId,
        jobDescriptionId: jobId,
        tenantId,
        summary: {
          totalRequirements: 5,
          matchedCount: 3,
          partialCount: 0,
          missingCount: 2,
          unknownCount: 0,
          criticalGapsCount: 2,
          highGapsCount: 0,
          mediumGapsCount: 0,
          lowGapsCount: 0,
        },
        requirementMatches: [
          {
            requirementId: req1Id,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'pytorch',
            extractedValue: 'PyTorch',
            matchStatus: 'MISSING',
            matchConfidence: 0.9,
            isUserClaim: false,
            relationshipType: 'NONE',
            supportingEvidence: [],
            explanation: 'Missing required skill PyTorch',
          },
          {
            requirementId: req2Id,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'cuda',
            extractedValue: 'CUDA',
            matchStatus: 'MISSING',
            matchConfidence: 0.9,
            isUserClaim: false,
            relationshipType: 'NONE',
            supportingEvidence: [],
            explanation: 'Missing required skill CUDA',
          },
          {
            requirementId: req3Id,
            category: 'SKILL',
            importance: 'REQUIRED',
            weight: 1.0,
            skillSlug: 'nodejs',
            extractedValue: 'Node.js',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'EXACT',
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'cloud-api',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/index.js',
              confidenceScore: 0.95,
            },
            supportingEvidence: [],
            explanation: 'Verified in codebase',
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
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
              resourceName: 'cloud-api',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/main.py',
              confidenceScore: 0.95,
            },
            supportingEvidence: [],
            explanation: 'Verified in repository',
          },
          {
            requirementId: randomUUID(),
            category: 'SKILL',
            importance: 'PREFERRED',
            weight: 1.0,
            skillSlug: 'linux',
            extractedValue: 'Linux',
            matchStatus: 'MATCHED',
            matchConfidence: 0.95,
            isUserClaim: false,
            relationshipType: 'EXACT',
            primaryEvidence: {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'cloud-api',
              evidenceType: 'CONFIG_SYNTAX_DECLARATION',
              filePath: 'Dockerfile',
              confidenceScore: 0.95,
            },
            supportingEvidence: [],
            explanation: 'Verified in Dockerfile',
          },
        ],
        skillGaps: [
          {
            requirementId: req1Id,
            skillName: 'PyTorch',
            category: 'SKILL',
            priority: 'CRITICAL',
            severity: 'EXPLICITLY_MISSING',
            status: 'MISSING',
            reason: 'Missing required skill PyTorch',
            recommendation: 'Add production PyTorch project experience',
          },
          {
            requirementId: req2Id,
            skillName: 'CUDA',
            category: 'SKILL',
            priority: 'CRITICAL',
            severity: 'EXPLICITLY_MISSING',
            status: 'MISSING',
            reason: 'Missing required skill CUDA',
            recommendation: 'Add CUDA kernel development experience',
          },
        ],
        explanations: [],
        analyzedAt: new Date().toISOString(),
      },
    });

    const report = service.evaluateAllDimensions(inputs);

    // Parseability is high because document layout and text stream are clean
    assert.ok(
      report.dimensions.atsParseability.score >= 75.0,
      'Parseability score should be solid'
    );

    // Job Fit is capped at 49.9 because 2 critical skills are missing
    assert.ok(
      report.dimensions.jobFit.score <= 49.9,
      'Job fit score must be capped <= 49.9 for 2 critical gaps'
    );
    assert.strictEqual(report.dimensions.jobFit.calculation.isCapped, true);

    // Proves the two scores are strictly decoupled
    assert.notStrictEqual(
      report.dimensions.atsParseability.score,
      report.dimensions.jobFit.score,
      'Parseability and Job Fit must be separate metrics'
    );
  });

  it('enforces safety gate on Application Readiness when critical skills are missing', () => {
    const inputs = createSampleInputs({
      jobFit: {
        score: 49.9,
        max: 100.0,
        confidence: 0.9,
        explanation: 'Capped at 49.9',
        factors: [],
        warnings: [],
        evidence: [],
        calculation: { isCapped: true },
      },
    });

    const report = service.evaluateAllDimensions(inputs);
    const readiness = report.dimensions.applicationReadiness;

    // Readiness cannot exceed 74.9 if jobFit was capped
    assert.ok(readiness.score <= 74.9, 'Readiness score must be clamped <= 74.9');
    assert.strictEqual(readiness.calculation.safetyGateApplied, true);
    assert.ok(
      readiness.warnings.some((w) => w.includes('capped at 74.9')),
      'Should report safety gate warning'
    );
  });
});
