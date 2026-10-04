/**
 * @file Phase 0 Baseline Reproduction Test Suite
 *
 * GOAL:
 * Establish exactly what is currently broken before changing production code.
 * Documents current behavior and failure modes deterministically against the
 * Baseline Regression Fixture.
 *
 * CONTRACT NOTE:
 * This test records CURRENT BEHAVIOR on main (commit 2208fbe1e8bd7636d6eb427f8944c1faf9773776).
 * It documents the exact flaws and discrepancies between analyze_job_fit and
 * downstream consumers (generate_tailored_resume / normalizeJobInput).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import {
  parseJobDescriptionSections,
  normalizeJobInput,
} from '../../src/services/job-normalization.service.js';
import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { createMcpWorkflowDbFixture } from '../fixtures/mcp-workflow-db.js';

// =============================================================================
// BASELINE REGRESSION FIXTURE (EXACT JD FROM SPECIFICATION)
// =============================================================================
export const BASELINE_JD = `Junior Full Stack Engineer

We are hiring a Junior Full Stack Engineer in India.

Required:
JavaScript, React, Node.js, PostgreSQL, REST APIs, Git.

Preferred:
Next.js, Docker, TypeScript, FastAPI.

Responsibilities include building frontend applications,
designing REST APIs, working with PostgreSQL databases,
writing tests, debugging production issues, and collaborating
with engineers.

Bachelor's degree in Computer Science, Electronics Engineering,
or related field preferred.

Remote or hybrid work in India.
Candidates should be eligible to work in India.`;

// Mock candidate setup matching standard test harness
function createTestCandidateContext() {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const candidateId = randomUUID();
  const mockRepoResourceId = randomUUID();

  const context = {
    tenantId,
    userId,
    candidateId,
    scopes: ['career:read', 'career:write'],
    rateLimits: { tenantLimit: 1000, userLimit: 100 },
  };

  const mockProfileView = {
    candidate: {
      id: candidateId,
      userId,
      tenantId,
      displayName: 'Alex Developer',
      headline: 'Full-Stack Software Engineer',
      summary: 'Experienced web and backend engineer.',
      canonicalEmail: 'alex@example.com',
      location: 'Remote',
      careerPreferences: {
        targetRoles: ['Full Stack Engineer'],
        preferredLocations: ['Remote'],
        workplaceTypes: ['REMOTE'],
      },
      profileMetadata: {
        careerStatus: 'MID_LEVEL',
        experienceYears: 3,
        workHistory: [
          {
            title: 'Full Stack Engineer',
            company: 'Tech Corp',
            employmentType: 'FULL_TIME',
            durationYears: 3,
            isCurrent: true,
          },
        ],
      },
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    skills: [
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'javascript',
        name: 'JavaScript',
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'web-app',
          evidenceType: 'CODE_USAGE',
          filePath: 'src/index.js',
          confidenceScore: 0.95,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'react',
        name: 'React',
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'web-app',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          filePath: 'package.json',
          confidenceScore: 0.95,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'postgresql',
        name: 'PostgreSQL',
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.9,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'web-app',
          evidenceType: 'CONFIG_SYNTAX_DECLARATION',
          filePath: 'docker-compose.yml',
          confidenceScore: 0.9,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'git',
        name: 'Git',
        category: 'TOOL',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.9,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'web-app',
          evidenceType: 'COMMIT_CONTRIBUTION',
          filePath: '.git',
          confidenceScore: 0.9,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'next-js',
        name: 'Next.js',
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.9,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'web-app',
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          filePath: 'package.json',
          confidenceScore: 0.9,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'fastapi',
        name: 'FastAPI',
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        truthCategory: 'VERIFIED',
        confidenceScore: 0.9,
        evidenceCount: 1,
        primaryEvidence: {
          id: randomUUID(),
          resourceId: mockRepoResourceId,
          resourceName: 'api-service',
          evidenceType: 'CODE_IMPORT_USAGE',
          filePath: 'main.py',
          confidenceScore: 0.9,
        },
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'node-js',
        name: 'Node.js',
        category: 'RUNTIME',
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        confidenceScore: 0.9,
        evidenceCount: 0,
        primaryEvidence: null,
      },
      {
        id: randomUUID(),
        skillId: randomUUID(),
        slug: 'docker',
        name: 'Docker',
        category: 'TOOL',
        provenanceStatus: 'SELF_DECLARED',
        truthCategory: 'CLAIMED',
        confidenceScore: 0.85,
        evidenceCount: 0,
        primaryEvidence: null,
      },
    ],
    projects: [
      {
        id: randomUUID(),
        name: 'Enterprise Web Platform',
        slug: 'enterprise-web-platform',
        summary: 'Full stack enterprise web application built with React, FastAPI, and PostgreSQL.',
        relevanceScore: 92.0,
        skills: ['javascript', 'react', 'postgresql', 'git', 'next-js', 'fastapi'],
        evidence: [
          {
            id: randomUUID(),
            resourceId: mockRepoResourceId,
            resourceName: 'web-app',
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            filePath: 'package.json',
            confidenceScore: 0.95,
          },
        ],
        resources: [{ id: mockRepoResourceId, name: 'web-app' }],
      },
    ],
    resources: [{ id: mockRepoResourceId, name: 'web-app' }],
    identities: [],
  };

  const mockCandidateProfileService = {
    getProfile: async () => mockProfileView,
    getCareerProfile: async () => mockProfileView.candidate,
  };

  const mockDbClient = createMcpWorkflowDbFixture({
    candidate: mockProfileView.candidate,
    skills: mockProfileView.skills,
    projects: mockProfileView.projects,
  });

  const mockRateLimiter = {
    checkTenantLimit: () => {},
    checkToolLimit: () => {},
  };

  const commonDeps = {
    candidateProfileService: mockCandidateProfileService,
    db: mockDbClient,
    rateLimiter: mockRateLimiter,
  };

  return { context, mockProfileView, commonDeps };
}

describe('Phase 0 Baseline Reproduction Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Current State in handleAnalyzeJobFit
  // ---------------------------------------------------------------------------
  it('1. Documents current analyze_job_fit baseline execution and flaws', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    assert.ok(fitResult, 'analyze_job_fit must return result');
    assert.equal(fitResult.overallFit.analysisStatus, 'COMPLETE');

    // Document Current ATS Score & Breakdown
    const breakdown = fitResult.overallFit.scoreBreakdown;
    assert.equal(fitResult.overallFit.atsScore, 69.25);
    assert.equal(breakdown.requiredSkillsScore, 35.0);
    assert.equal(breakdown.preferredSkillsScore, 8.44);

    // Current Extracted Requirements count: 11
    assert.equal(fitResult.requirementMatches.length, 11);

    // Map matches
    const matchesMap = new Map();
    for (const m of fitResult.requirementMatches) {
      const key = (m.normalizedRequirement || m.extractedValue || m.skillSlug || '').toLowerCase();
      matchesMap.set(key, m);
    }

    // PHASE 1 VERIFICATION: Education clause spanning multiple lines is now correctly classified as PREFERRED
    // because "or related field preferred." is preserved across linebreaks.
    const eduMatch = Array.from(matchesMap.values()).find((m) => m.category === 'EDUCATION');
    assert.ok(eduMatch, 'Education match must be present');
    assert.equal(
      eduMatch.importance,
      'PREFERRED',
      'PHASE 1 VERIFIED: Education correctly resolves to PREFERRED'
    );
    assert.equal(
      eduMatch.required,
      false,
      'PHASE 1 VERIFIED: Education required flag is correctly false'
    );
  });

  // ---------------------------------------------------------------------------
  // 2. Current State in normalizeJobInput (Used by downstream services)
  // ---------------------------------------------------------------------------
  it('2. Documents current normalizeJobInput inflation and section parsing flaws', () => {
    const normalized = normalizeJobInput({ description: BASELINE_JD });

    // PHASE 2 VERIFICATION: normalizeJobInput prevents requirement inflation from responsibility prose,
    // extracting exactly 11 canonical requirements without rogue fragments.
    assert.equal(
      normalized.normalizedRequirements.length,
      11,
      'PHASE 2 VERIFIED: normalizeJobInput extracts exactly 11 canonical requirements'
    );

    const slugs = normalized.normalizedRequirements.map((r) => r.skillSlug || r.name);

    // Verify rogue requirements are absent:
    assert.ok(
      !slugs.includes('responsibilities-include-building-frontend'),
      'PHASE 2 VERIFIED: Prose fragment not extracted as skill requirement'
    );
    assert.ok(
      !slugs.includes('with-engineers'),
      'PHASE 2 VERIFIED: Prepositional phrase fragment not extracted as skill requirement'
    );
    assert.ok(
      !slugs.includes('database-management'),
      'PHASE 2 VERIFIED: Abstract concept database-management not artificially inflated'
    );
    assert.ok(
      !slugs.includes('writing-tests-debugging-production-issues-and-collaborating'),
      'PHASE 2 VERIFIED: Prose fragment not extracted as skill requirement'
    );

    // FLAW 3: Standalone "Bachelor's degree preferred" in parseJobDescriptionSections
    // PHASE 1 VERIFICATION: Standalone "Bachelor's degree preferred" in parseJobDescriptionSections
    // correctly resolves to PREFERRED.
    const singleLineEdu = parseJobDescriptionSections("Bachelor's degree preferred");
    assert.equal(
      singleLineEdu[0].importance,
      'PREFERRED',
      'PHASE 1 VERIFIED: parseJobDescriptionSections correctly resolves Bachelor degree preferred to PREFERRED'
    );
  });

  // ---------------------------------------------------------------------------
  // 3. Document Upstream vs Downstream Pipeline Discrepancy
  // ---------------------------------------------------------------------------
  it('3. Documents discrepancy between analyze_job_fit and downstream canonical requirements', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const mcpFit = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    const normalized = normalizeJobInput({ description: BASELINE_JD });

    // PIPELINE PARITY (PHASE 2):
    // Both analyze_job_fit and normalizeJobInput now extract exactly 11 canonical requirements
    assert.equal(
      mcpFit.requirementMatches.length,
      normalized.normalizedRequirements.length,
      'PHASE 2 VERIFIED: analyze_job_fit and normalizeJobInput extract identical requirement counts (11)'
    );
    assert.equal(mcpFit.requirementMatches.length, 11);

    // Education Importance Alignment (Phase 1):
    // In both analyze_job_fit and normalizeJobInput, Education is now PREFERRED:
    const mcpEdu = mcpFit.requirementMatches.find((m) => m.category === 'EDUCATION');
    const normEdu = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || r.skillSlug?.includes('bachelor')
    );
    assert.equal(mcpEdu?.importance, 'PREFERRED', 'analyze_job_fit education must be PREFERRED');
    assert.equal(normEdu?.importance, 'PREFERRED', 'normalizeJobInput education must be PREFERRED');
  });

  // ---------------------------------------------------------------------------
  // 4. Document Evidence Resolution Discrepancy
  // ---------------------------------------------------------------------------
  it('4. Documents evidence resolution state for self-declared candidate skills', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    const matchesMap = new Map();
    for (const m of fitResult.requirementMatches) {
      const key = (m.normalizedRequirement || m.extractedValue || m.skillSlug || '').toLowerCase();
      matchesMap.set(key, m);
    }

    // Node.js is SELF_DECLARED in candidate profile, with no repo evidence linked:
    const nodeMatch = matchesMap.get('node.js');
    assert.ok(nodeMatch);
    assert.equal(nodeMatch.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(nodeMatch.candidateProvenance, 'SELF_DECLARED');
    assert.equal(nodeMatch.truthCategory, 'CLAIMED');
    assert.equal(nodeMatch.provenanceTrustClass, 'LOW_TRUST');

    // Docker is SELF_DECLARED in candidate profile, with no repo evidence linked:
    const dockerMatch = matchesMap.get('docker');
    assert.ok(dockerMatch);
    assert.equal(dockerMatch.matchStatus, 'UNVERIFIED_CLAIM');
    assert.equal(dockerMatch.candidateProvenance, 'SELF_DECLARED');
    assert.equal(dockerMatch.truthCategory, 'CLAIMED');
    assert.equal(dockerMatch.provenanceTrustClass, 'LOW_TRUST');
  });
});
