/**
 * @file End-to-End MCP Workflows Regression Suite
 *
 * Verifies live execution of the core MCP tools:
 * 1. get_candidate_profile
 * 2. list_verified_skills
 * 3. analyze_job_fit (against the exact Junior Full Stack Engineer fixture)
 * 4. recommend_portfolio_projects
 * 5. draft_cover_letter (with SELF_DECLARED candidate skill, validating Bug 1 fix)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import {
  handleGetCandidateProfile,
  handleListVerifiedSkills,
  handleAnalyzeJobFit,
} from '../../src/mcp/tools/career-read-tools.js';

import {
  handleRecommendPortfolioProjects,
  handleDraftCoverLetter,
} from '../../src/mcp/tools/career-artifact-tools.js';

describe('End-to-End MCP Tool Workflows Regression Suite', () => {
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

  // Mock candidate profile containing:
  // - Verified skills: JavaScript, React, PostgreSQL, Git, Next.js, FastAPI
  // - Self-declared skills: Node.js, Docker (testing Bug 1 & Bug 2)
  // - Missing skill: TypeScript
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
      // Node.js: Candidate self-declared skill (no repository evidence)
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
      // Docker: Candidate self-declared skill (no repository evidence)
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

  const mockDbClient = {
    select: (fields) => {
      const isCount = fields && fields.total;
      return {
        from: () => {
          const queryObj = {
            leftJoin: () => queryObj,
            innerJoin: () => queryObj,
            where: () => {
              if (isCount) {
                return Promise.resolve([{ total: 2 }]);
              }
              const chainable = {
                orderBy: () => chainable,
                offset: () => chainable,
                limit: async () => [
                  {
                    cs: {
                      id: randomUUID(),
                      skillId: randomUUID(),
                      category: 'LANGUAGE',
                      confidenceScore: 0.95,
                      provenanceStatus: 'VERIFIED',
                      evidenceCount: 1,
                    },
                    skillSlug: 'javascript',
                    skillName: 'JavaScript',
                  },
                  {
                    cs: {
                      id: randomUUID(),
                      skillId: randomUUID(),
                      category: 'FRAMEWORK',
                      confidenceScore: 0.95,
                      provenanceStatus: 'VERIFIED',
                      evidenceCount: 1,
                    },
                    skillSlug: 'react',
                    skillName: 'React',
                  },
                ],
              };
              return chainable;
            },
          };
          return queryObj;
        },
      };
    },
  };

  const mockRateLimiter = {
    checkTenantLimit: () => {},
    checkToolLimit: () => {},
  };

  const commonDeps = {
    candidateProfileService: mockCandidateProfileService,
    db: mockDbClient,
    rateLimiter: mockRateLimiter,
  };

  const fixtureJobDescription = `
Junior Full Stack Engineer

Required:
JavaScript
React
Node.js
PostgreSQL
REST APIs
Git

Preferred:
Next.js
Docker
TypeScript
FastAPI
`;

  // ---------------------------------------------------------------------------
  // 1. get_candidate_profile
  // ---------------------------------------------------------------------------
  it('1. executes get_candidate_profile MCP workflow successfully', async () => {
    const result = await handleGetCandidateProfile(context, {}, commonDeps);
    assert.ok(result);
    assert.equal(result.candidate.id, candidateId);
    assert.equal(result.candidate.displayName, 'Alex Developer');
    assert.ok(Array.isArray(result.topSkills));
    assert.ok(result.topSkills.length > 0);
  });

  // ---------------------------------------------------------------------------
  // 2. list_verified_skills
  // ---------------------------------------------------------------------------
  it('2. executes list_verified_skills MCP workflow successfully', async () => {
    const result = await handleListVerifiedSkills(context, {}, commonDeps);
    assert.ok(result);
    assert.ok(Array.isArray(result.items));
    // Verified skills list should include JavaScript, React, PostgreSQL, etc.
    const slugs = result.items.map((s) => s.slug);
    assert.ok(slugs.includes('javascript'));
    assert.ok(slugs.includes('react'));
  });

  // ---------------------------------------------------------------------------
  // 3. analyze_job_fit (Bug 2 & Bug 3 Regression Test)
  // ---------------------------------------------------------------------------
  it('3. executes analyze_job_fit MCP workflow on the exact fixture and satisfies all contract invariants', async () => {
    const result = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: fixtureJobDescription,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    assert.ok(result);
    assert.equal(result.overallFit.analysisStatus, 'COMPLETE');

    // 1. Required vs Preferred Distinction Survives
    const matches = result.requirementMatches;
    assert.ok(matches.length >= 10, `Expected at least 10 requirements, got ${matches.length}`);

    const matchesByReq = new Map();
    for (const m of matches) {
      if (m.normalizedRequirement) {
        matchesByReq.set(m.normalizedRequirement.toLowerCase(), m);
      }
      if (m.originalRequirement) {
        matchesByReq.set(m.originalRequirement.toLowerCase(), m);
      }
      if (m.skillSlug) {
        matchesByReq.set(m.skillSlug.toLowerCase(), m);
      }
    }

    // Required skills must have required: true
    const requiredSkills = ['javascript', 'react', 'node.js', 'postgresql', 'rest apis', 'git'];
    for (const skill of requiredSkills) {
      const match = matchesByReq.get(skill);
      assert.ok(match, `Expected required match for '${skill}'`);
      assert.equal(match.required, true, `Skill '${skill}' must have required: true`);
    }

    // Preferred skills must have required: false
    const preferredSkills = ['next.js', 'docker', 'typescript', 'fastapi'];
    for (const skill of preferredSkills) {
      const match = matchesByReq.get(skill);
      assert.ok(match, `Expected preferred match for '${skill}'`);
      assert.equal(match.required, false, `Skill '${skill}' must have required: false`);
    }

    // 2. Evidence States & Match Status
    // JavaScript: MATCHED
    assert.equal(matchesByReq.get('javascript')?.matchStatus, 'MATCHED');
    // React: MATCHED
    assert.equal(matchesByReq.get('react')?.matchStatus, 'MATCHED');
    // PostgreSQL: MATCHED
    assert.equal(matchesByReq.get('postgresql')?.matchStatus, 'MATCHED');
    // Git: MATCHED
    assert.equal(matchesByReq.get('git')?.matchStatus, 'MATCHED');
    // REST APIs: MATCHED via taxonomy (FastAPI implements)
    assert.equal(matchesByReq.get('rest apis')?.matchStatus, 'MATCHED');
    // Node.js: UNVERIFIED_CLAIM (NOT MATCHED)
    assert.equal(matchesByReq.get('node.js')?.matchStatus, 'UNVERIFIED_CLAIM');
    assert.notEqual(matchesByReq.get('node.js')?.matchStatus, 'MATCHED');

    // Next.js: MATCHED
    assert.equal(matchesByReq.get('next.js')?.matchStatus, 'MATCHED');
    // FastAPI: MATCHED
    assert.equal(matchesByReq.get('fastapi')?.matchStatus, 'MATCHED');
    // Docker: UNVERIFIED_CLAIM
    assert.equal(matchesByReq.get('docker')?.matchStatus, 'UNVERIFIED_CLAIM');
    // TypeScript: MISSING
    assert.equal(matchesByReq.get('typescript')?.matchStatus, 'MISSING');

    // 3. Match Counts and Summary Aggregation
    const summary = result.requirementSummary;
    assert.equal(summary.matchedCount, 7);
    assert.equal(summary.partialCount, 0);
    assert.equal(summary.missingCount, 1);
    assert.equal(summary.unverifiedClaimCount, 2);

    // 4. Score Components
    const breakdown = result.overallFit.scoreBreakdown;
    assert.ok(
      breakdown.requiredSkillsScore > 0,
      `Expected requiredSkillsScore > 0, got ${breakdown.requiredSkillsScore}`
    );
    assert.equal(breakdown.requiredSkillsScore, 35.0);

    assert.ok(
      breakdown.preferredSkillsScore > 0,
      `Expected preferredSkillsScore > 0, got ${breakdown.preferredSkillsScore}`
    );
    assert.equal(breakdown.preferredSkillsScore, 8.44);

    // 5. Final ATS score is deterministic and bounded
    assert.ok(result.overallFit.atsScore >= 0 && result.overallFit.atsScore <= 100);
  });

  // ---------------------------------------------------------------------------
  // 4. recommend_portfolio_projects
  // ---------------------------------------------------------------------------
  it('4. executes recommend_portfolio_projects MCP workflow successfully', async () => {
    const result = await handleRecommendPortfolioProjects(
      context,
      {
        jobDescriptionText: fixtureJobDescription,
        jobTitle: 'Junior Full Stack Engineer',
        maxFeaturedProjects: 3,
      },
      commonDeps
    );

    assert.ok(result);
    assert.equal(result.candidateId, candidateId);
    assert.ok(Array.isArray(result.featuredProjects));
    assert.ok(result.featuredProjects.length > 0);
  });

  // ---------------------------------------------------------------------------
  // 5. draft_cover_letter (Bug 1 Regression Test)
  // ---------------------------------------------------------------------------
  it('5. executes draft_cover_letter MCP workflow with SELF_DECLARED candidate skill without contract crash', async () => {
    // This test specifically exercises the Bug 1 condition: candidate has skills with
    // provenanceStatus: 'SELF_DECLARED'. Previously, buildCandidateAssertions passed
    // 'SELF_DECLARED' directly to CareerAssertionSchema, throwing:
    // "Invalid enum value. Expected: VERIFIED, INFERRED, CLAIMED, MISSING_EVIDENCE, UNKNOWN. Received: SELF_DECLARED"
    const result = await handleDraftCoverLetter(
      context,
      {
        jobDescriptionText: fixtureJobDescription,
        jobTitle: 'Junior Full Stack Engineer',
        companyName: 'Tech Innovators',
        tone: 'PROFESSIONAL',
        targetParagraphCount: 3,
      },
      commonDeps
    );

    assert.ok(result, 'draft_cover_letter output should be produced');
    assert.equal(result.candidateId, candidateId);
    assert.equal(result.companyName, 'Tech Innovators');
    assert.ok(Array.isArray(result.paragraphs));
    assert.ok(result.paragraphs.length > 0);

    // Verify all paragraph statuses use canonical truth categories
    const validStatuses = ['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING_EVIDENCE', 'UNKNOWN'];
    for (const p of result.paragraphs) {
      assert.ok(
        validStatuses.includes(p.status),
        `Paragraph status '${p.status}' is not a valid canonical truth category`
      );
      assert.notEqual(p.status, 'SELF_DECLARED', 'Must not emit legacy SELF_DECLARED');
    }
  });
});
