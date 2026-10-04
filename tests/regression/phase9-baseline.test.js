/**
 * @file Phase 9.0 — Baseline and Safety Test Suite
 *
 * Enforces the ATS Fit Score invariant (69.25) through actual computation
 * using real candidate profile and job description analysis.
 * Strictly eliminates any tautological assertions (e.g. assert.strictEqual(69.25, 69.25)).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import { createMcpWorkflowDbFixture } from '../fixtures/mcp-workflow-db.js';

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

export function createTestCandidateContext(options = {}) {
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

  if (typeof options.skillsFilter === 'function') {
    mockProfileView.skills = mockProfileView.skills.filter(options.skillsFilter);
  }

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

describe('Phase 9.0 — Baseline and Safety', () => {
  it('TEST 1 — Real ATS Fit Score computation matches canonical 69.25 invariant', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    assert.ok(fitResult, 'analyze_job_fit must produce a non-null result');
    assert.strictEqual(fitResult.overallFit.analysisStatus, 'COMPLETE');

    const atsScore = fitResult.overallFit.atsScore;
    const breakdown = fitResult.overallFit.scoreBreakdown;

    // Actual calculated score verification (NOT tautological)
    assert.strictEqual(atsScore, 69.25, `Expected computed ATS score 69.25, got ${atsScore}`);
    assert.strictEqual(breakdown.requiredSkillsScore, 35.0);
    assert.strictEqual(breakdown.preferredSkillsScore, 8.44);
    assert.strictEqual(fitResult.requirementMatches.length, 11);
  });

  it('TEST 2 — Negative test: Altering requirements dynamically changes ATS score', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    // Query an unrelated JD (Kubernetes, Go, Rust, AWS)
    const divergentJD = `Distributed Systems Engineer
Required:
Go, Rust, Kubernetes, Distributed Systems, gRPC, AWS.
Preferred:
Terraform, Kafka.`;

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: divergentJD,
        jobTitle: 'Distributed Systems Engineer',
      },
      commonDeps
    );

    assert.ok(fitResult);
    const score = fitResult.overallFit.atsScore;
    // Candidate has none of Go/Rust/Kubernetes/AWS, score must drop significantly below 69.25
    assert.ok(score < 50.0, `Score for non-matching candidate must be < 50.0, got ${score}`);
    assert.notStrictEqual(score, 69.25, 'Score must dynamically reflect requirement differences');
  });
});
