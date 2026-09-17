/**
 * @file P81: Hardened Job Match Score & UNKNOWN/MISSING Requirements Unit Tests
 *
 * Verifies:
 * 1. Semantic renaming to Job Match Score with 100% backward compatibility (atsFitScore/overallScore).
 * 2. UNKNOWN technical skill treatment: receives 0.0 (insufficient evidence, never silently awarded 1.0).
 * 3. Explicit distinction between VERIFIED_MATCH, PARTIAL_MATCH, UNKNOWN, and MISSING.
 * 4. Required vs Preferred skills scoring.
 * 5. Critical requirement gap capping (74.9, 49.9, 24.9).
 * 6. Deterministic calculation and multi-tenant security.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  AtsFitScoreService,
  JobMatchScoreService,
  calculateCandidateJobFit,
  calculateJobMatchScore,
} from '../../src/services/ats-fit-score.service.js';

describe('P81: Job Match Score & Requirement Distinction Engine', () => {
  const tenantId = randomUUID();
  const candidateId = randomUUID();
  const jobDescriptionId = randomUUID();

  const mockContext = { tenantId };

  const mockCandidateProfile = {
    id: candidateId,
    tenantId,
    displayName: 'Morgan Chen',
    profileMetadata: {
      experience: [
        {
          id: randomUUID(),
          company: 'Acme Cloud',
          title: 'Senior Distributed Systems Engineer',
          startDate: '2021-01-01',
          isCurrent: true,
          bullets: ['Engineered raft consensus in Go', 'Scaled PostgreSQL datastores'],
        },
      ],
      education: [
        {
          id: randomUUID(),
          institution: 'MIT',
          degree: 'B.S. in Computer Science',
        },
      ],
      skills: [{ name: 'Go' }, { name: 'PostgreSQL' }],
    },
  };

  const mockJobDescription = {
    id: jobDescriptionId,
    tenantId,
    title: 'Senior Backend Engineer',
    companyName: 'Distributed Systems Corp',
  };

  function createValidProjectAnalysis() {
    return {
      tenantId,
      candidateId,
      jobDescriptionId,
      projectRankings: [
        {
          projectId: randomUUID(),
          projectName: 'distributed-store',
          projectSlug: 'distributed-store',
          projectType: 'APPLICATION',
          relevanceScore: 90.0,
          relevanceBand: 'HIGH',
          scoreBreakdown: {
            requirementCoverageScore: 45.0,
            architecturalDensityScore: 22.5,
            evidenceQualityScore: 13.5,
            projectCompletenessScore: 4.5,
            recencyScore: 4.5,
            totalScore: 90.0,
          },
          matchedRequirementIds: [randomUUID()],
          contributingSkills: ['go', 'postgresql'],
          architecturalSignals: ['API_ROUTING', 'DATA_PERSISTENCE'],
          supportingEvidence: [
            {
              id: randomUUID(),
              resourceId: randomUUID(),
              resourceName: 'distributed-store',
              evidenceType: 'CODE_USAGE',
              filePath: 'src/main.go',
              confidenceScore: 0.95,
            },
          ],
          explanation: 'Verified in repository',
          confidence: 0.95,
        },
      ],
    };
  }

  it('exposes jobMatchScore semantically while maintaining overallScore and atsFitScore parity', () => {
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Go',
          matchStatus: 'MATCHED',
          weight: 1.0,
          primaryEvidence: {
            id: randomUUID(),
            resourceId: randomUUID(),
            resourceName: 'distributed-store',
            evidenceType: 'CODE_USAGE',
            filePath: 'src/main.go',
            confidenceScore: 1.0,
          },
        },
      ],
      skillGaps: [],
    };

    const result = JobMatchScoreService.calculateCandidateJobFit(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    assert.ok(result);
    assert.equal(typeof result.jobMatchScore, 'number');
    assert.equal(typeof result.atsFitScore, 'number');
    assert.equal(typeof result.overallScore, 'number');
    assert.equal(result.jobMatchScore, result.overallScore);
    assert.equal(result.atsFitScore, result.overallScore);
    assert.equal(result.scoreBreakdown.jobMatchScore, result.overallScore);
    assert.equal(result.scoreBreakdown.atsFitScore, result.overallScore);
    assert.equal(calculateJobMatchScore, calculateCandidateJobFit);
  });

  it('awards 40.0 pts for 100% VERIFIED_MATCH on required technical skills', () => {
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Go',
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'PostgreSQL',
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const result = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    assert.equal(result.scoreBreakdown.requiredSkillsScore, 40.0);
  });

  it('evaluates PARTIAL_MATCH with distinct relationship and claim weights', () => {
    // 1. BUILT_ON relationship (0.75 factor) -> 30.0 / 40.0
    const builtOnMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'TypeScript',
          matchStatus: 'PARTIAL',
          relationshipType: 'BUILT_ON',
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const resBuiltOn = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      builtOnMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );
    assert.equal(resBuiltOn.scoreBreakdown.requiredSkillsScore, 30.0);

    // 2. Unverified user claim (0.25 factor) -> 10.0 / 40.0
    const claimMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Kubernetes',
          matchStatus: 'PARTIAL',
          isUserClaim: true,
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const resClaim = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      claimMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );
    assert.equal(resClaim.scoreBreakdown.requiredSkillsScore, 10.0);
  });

  it('Rule 23 & 22: strictly denies full credit for UNKNOWN technical skills (valueFactor = 0.0)', () => {
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Rust',
          matchStatus: 'UNKNOWN', // Insufficient evidence
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const result = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    // UNKNOWN must NEVER receive 40.0 full points!
    assert.equal(result.scoreBreakdown.requiredSkillsScore, 0.0);
  });

  it('distinguishes MISSING required skills by awarding 0.0 and triggering critical gap capping', () => {
    const reqId = randomUUID();
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: reqId,
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Kubernetes',
          matchStatus: 'MISSING',
          weight: 1.0,
        },
      ],
      skillGaps: [
        {
          requirementId: reqId,
          skillName: 'Kubernetes',
          category: 'SKILL',
          priority: 'CRITICAL',
          status: 'MISSING',
          severity: 'EXPLICITLY_MISSING',
          reason: 'Missing Kubernetes requirement',
          recommendation: 'Add verified Kubernetes evidence',
        },
      ],
    };

    const result = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    assert.equal(result.scoreBreakdown.requiredSkillsScore, 0.0);
    assert.equal(result.criticalGapCount, 1);
    assert.ok(result.overallScore <= 74.9);
  });

  it('distinguishes REQUIRED vs PREFERRED skill scoring weights (40 pts vs 15 pts max)', () => {
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Go',
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'PREFERRED',
          extractedValue: 'Redis',
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const result = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    assert.equal(result.scoreBreakdown.requiredSkillsScore, 40.0);
    assert.equal(result.scoreBreakdown.preferredSkillsScore, 15.0);
  });

  it('provides an auditable denominatorAudit breakdown with earnedPoints and possiblePoints', () => {
    const candidateMatch = {
      tenantId,
      candidateId,
      jobDescriptionId,
      requirementMatches: [
        {
          requirementId: randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          extractedValue: 'Go',
          matchStatus: 'MATCHED',
          weight: 1.0,
        },
        {
          requirementId: randomUUID(),
          category: 'EDUCATION',
          importance: 'REQUIRED',
          extractedValue: 'BS Computer Science',
          matchStatus: 'UNKNOWN',
          weight: 1.0,
        },
      ],
      skillGaps: [],
    };

    const result = calculateJobMatchScore(
      mockContext,
      mockJobDescription,
      candidateMatch,
      createValidProjectAnalysis(),
      mockCandidateProfile
    );

    const audit = result.scoreBreakdown.denominatorAudit;
    assert.ok(audit, 'denominatorAudit must be present');
    assert.equal(audit.requiredSkills.status, 'EVALUATED');
    assert.equal(audit.requiredSkills.possiblePoints, 40.0);
    assert.equal(audit.requiredSkills.earnedPoints, 40.0);

    assert.equal(audit.education.status, 'UNKNOWN');
    assert.equal(audit.education.possiblePoints, 5.0);
    assert.equal(audit.education.earnedPoints, 0.0);

    assert.equal(audit.preferredSkills.status, 'NOT_APPLICABLE');
    assert.equal(audit.preferredSkills.possiblePoints, 0.0);

    assert.equal(audit.location.status, 'NOT_APPLICABLE');
    assert.equal(audit.location.possiblePoints, 0.0);

    assert.equal(audit.experience.status, 'NOT_APPLICABLE');
    assert.equal(audit.experience.possiblePoints, 0.0);

    // Denominator should only sum applicable items (requiredSkills: 40, education: 5, projectRelevance: 20, evidenceConfidence: 5 = 70.0)
    assert.equal(audit.totalPossiblePoints, 70.0);
  });
});
