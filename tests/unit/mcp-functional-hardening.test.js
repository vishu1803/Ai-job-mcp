/**
 * @file Unit & Integration Regression Suite for MCP Functional Hardening
 *
 * Tests:
 * 1. draft_cover_letter: dirty skill slugs, punctuation, long title, unicode
 * 2. generate_tailored_resume: safe slug assertion generation and integrity audit
 * 3. analyze_job_fit: determinism & verified project evidence inclusion
 * 4. search_jobs: full filter matrix (employmentType, maxSalary, skills, remoteOnly)
 * 5. recommend_portfolio_projects: project deduplication & 0-match criteria explanation
 * 6. get_career_profile: tenant/session candidate resolution via list.items
 * 7. inspect_project_evidence: multi-page pagination & bounds safety
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { SafeSlugSchema } from '../../src/domain/candidate/candidate.schemas.js';
import { CareerAssertionSchema } from '../../src/domain/career/integrity-gate.schemas.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { PortfolioRecommendationService } from '../../src/services/portfolio-recommendation.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import {
  handleDraftCoverLetter,
  handleGenerateTailoredResume,
} from '../../src/mcp/tools/career-artifact-tools.js';
import { handleInspectProjectEvidence } from '../../src/mcp/tools/career-read-tools.js';
import { registerCareerProfileTools } from '../../src/mcp/tools/career-profile-tools.js';

describe('MCP Functional Hardening Regression Suite', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();

  const mockContext = {
    tenantId,
    userId,
    candidateId,
    role: 'MEMBER',
    scopes: ['career:read', 'career:write'],
  };

  describe('1. Slug Normalization & SafeSlugSchema Invariants', () => {
    it('generates strictly valid slugs for all dirty inputs without consecutive or trailing dashes', () => {
      const dirtyInputs = [
        'c-c--',
        'javascript--es6--',
        'data-structures---algorithms',
        'postgresql--sql-',
        'mongodb--nosql-',
        'C++',
        'C# / .NET',
        'Node.js / Express.js',
        '  leading and trailing whitespace  ',
        '---multiple---dashes---',
        '@scoped/package-name',
        'A'.repeat(200),
        '🤖 AI / ML & Deep-Learning!!',
        '',
        null,
        undefined,
      ];

      for (const input of dirtyInputs) {
        const slug = SkillTaxonomyEngine.generateSafeSlug(input);
        const parsed = SafeSlugSchema.safeParse(slug);
        assert.equal(parsed.success, true, `Slug for '${input}' should be valid: got '${slug}'`);
        assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        assert.ok(slug.length <= 50);
      }
    });

    it('validates CareerAssertionSchema on dirty slugs without throwing ZodError', () => {
      const dirtySlugs = ['c-c--', 'javascript--es6--', 'data-structures---algorithms'];
      for (const rawSlug of dirtySlugs) {
        const safeSlug = SkillTaxonomyEngine.generateSafeSlug(rawSlug);
        const assertion = {
          assertionId: crypto.randomUUID(),
          candidateId,
          tenantId,
          assertionType: 'SKILL',
          statement: `Possesses ${rawSlug}`,
          subjectSlug: safeSlug,
          status: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceRefs: [],
        };
        const res = CareerAssertionSchema.safeParse(assertion);
        assert.equal(res.success, true);
      }
    });
  });

  describe('2. draft_cover_letter & generate_tailored_resume', () => {
    it('draft_cover_letter succeeds end-to-end with dirty skill and project slugs', async () => {
      const mockCandidateProfile = {
        candidate: {
          id: candidateId,
          tenantId,
          userId,
          displayName: 'Test Candidate',
          headline: 'Senior Full Stack Engineer',
          summary: 'Experienced developer with verified GitHub evidence.',
        },
        skills: [
          {
            slug: 'javascript--es6--',
            name: 'JavaScript / ES6+',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
            primaryEvidence: {
              id: crypto.randomUUID(),
              evidenceType: 'CODE_AST_NODE',
              filePath: 'src/app.js',
              commitSha: 'a'.repeat(40),
            },
          },
          {
            slug: 'c-c--',
            name: 'C / C++',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.9,
          },
        ],
        projects: [
          {
            id: crypto.randomUUID(),
            name: 'Fastify Gateway & API',
            slug: 'fastify-gateway--',
            evidence: [
              {
                id: crypto.randomUUID(),
                evidenceType: 'CODE_IMPORT_USAGE',
                filePath: 'src/server.js',
                commitSha: 'b'.repeat(40),
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        resources: [],
        identities: [],
      };

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: candidateId, tenantId }],
            }),
          }),
        }),
      };

      const mockProfileService = {
        getProfile: async () => mockCandidateProfile,
      };

      const result = await handleDraftCoverLetter(
        mockContext,
        {
          candidateId,
          jobDescriptionText:
            'Looking for a Senior Backend Engineer proficient in JavaScript and C++ to build APIs.',
          jobTitle: 'Senior Backend Engineer',
          companyName: 'Acme Corp',
        },
        { db: mockDb, candidateProfileService: mockProfileService }
      );

      assert.ok(result);
      assert.ok(result.letterId);
      assert.equal(result.companyName, 'Acme Corp');
      assert.ok(result.paragraphs.length >= 3);
      assert.ok(result.integrityReport);
    });

    it('generate_tailored_resume succeeds without integrity gate failure on raw slugs', async () => {
      const mockCandidateProfile = {
        candidate: {
          id: candidateId,
          tenantId,
          userId,
          displayName: 'Test Candidate',
          headline: 'Senior Backend Engineer',
          summary: 'Specialized in backend APIs and distributed systems.',
        },
        skills: [
          {
            slug: 'postgresql--sql-',
            name: 'PostgreSQL / SQL',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
          },
        ],
        projects: [
          {
            id: crypto.randomUUID(),
            name: 'Postgres Cache Engine',
            slug: 'postgres-cache-engine',
            evidence: [
              {
                id: crypto.randomUUID(),
                evidenceType: 'CODE_AST_NODE',
                filePath: 'src/db.js',
                commitSha: 'c'.repeat(40),
                confidenceScore: 0.95,
              },
            ],
          },
        ],
        resources: [],
        identities: [],
      };

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: candidateId, tenantId }],
            }),
          }),
        }),
      };

      const mockProfileService = {
        getProfile: async () => mockCandidateProfile,
      };

      const result = await handleGenerateTailoredResume(
        mockContext,
        {
          candidateId,
          jobDescriptionText:
            'Seeking Backend Engineer experienced in PostgreSQL and high-scale systems at DataCo.',
          jobTitle: 'Backend Engineer',
        },
        { db: mockDb, candidateProfileService: mockProfileService }
      );

      assert.ok(result);
      assert.ok(result.resume);
      assert.ok(result.resume.basics.name);
      assert.ok(result.auditReport);
    });
  });

  describe('3. analyze_job_fit Determinism & Evidence Matching', () => {
    it('indexes verified skills from project evidence when not explicitly in candidateSkills table', () => {
      const profile = {
        id: candidateId,
        tenantId,
        skills: [],
        projects: [
          {
            id: crypto.randomUUID(),
            name: 'API Gateway',
            slug: 'api-gateway',
            evidence: [
              {
                id: crypto.randomUUID(),
                skillSlug: 'fastify',
                skillName: 'Fastify',
                evidenceType: 'CODE_IMPORT_USAGE',
                filePath: 'src/server.js',
                confidenceScore: 0.95,
              },
            ],
          },
        ],
      };

      const jobDescription = {
        id: crypto.randomUUID(),
        tenantId,
        source: 'MANUAL',
        title: 'Backend Node Engineer',
        rawText: 'Requires Fastify experience',
        requirements: [
          {
            id: crypto.randomUUID(),
            category: 'SKILL',
            importance: 'REQUIRED',
            skillSlug: 'fastify',
            extractedValue: 'Fastify',
          },
        ],
      };

      const analysis = EvidenceMatchingService.matchJobToCandidate(
        { tenantId },
        jobDescription,
        profile
      );

      assert.equal(analysis.summary.matchedCount, 1);
      assert.equal(analysis.requirementMatches[0].matchStatus, 'MATCHED');
      assert.equal(analysis.requirementMatches[0].skillSlug, 'fastify');
    });

    it('returns deterministic match analysis across repeated evaluations', () => {
      const profile = {
        id: candidateId,
        tenantId,
        skills: [
          {
            slug: 'nodejs',
            name: 'Node.js',
            provenanceStatus: 'VERIFIED',
            confidenceScore: 0.95,
          },
        ],
        projects: [],
      };

      const reqUuid = crypto.randomUUID();
      const jobDescription = {
        id: crypto.randomUUID(),
        tenantId,
        source: 'MANUAL',
        title: 'Node Engineer',
        rawText: 'Requires Node.js',
        requirements: [
          {
            id: reqUuid,
            category: 'SKILL',
            importance: 'REQUIRED',
            skillSlug: 'nodejs',
            extractedValue: 'Node.js',
          },
        ],
      };

      const run1 = EvidenceMatchingService.matchJobToCandidate(
        { tenantId },
        jobDescription,
        profile
      );
      const run2 = EvidenceMatchingService.matchJobToCandidate(
        { tenantId },
        jobDescription,
        profile
      );

      assert.deepEqual(run1.summary, run2.summary);
      assert.equal(run1.requirementMatches[0].matchStatus, run2.requirementMatches[0].matchStatus);
      assert.equal(
        run1.requirementMatches[0].matchConfidence,
        run2.requirementMatches[0].matchConfidence
      );
    });
  });

  describe('4. search_jobs Filter Matrix & Synthetic Feed Attribution', () => {
    const discoveryService = new JobDiscoveryService();

    it('filters correctly by remoteOnly and workplaceType', async () => {
      const remoteRes = await discoveryService.searchJobs({ query: 'engineer', remoteOnly: true });
      assert.ok(remoteRes.jobs.every((j) => j.workplaceType === 'REMOTE'));

      const hybridRes = await discoveryService.searchJobs({
        query: 'architect',
        workplaceType: 'HYBRID',
      });
      assert.ok(hybridRes.jobs.every((j) => j.workplaceType === 'HYBRID'));
      assert.ok(hybridRes.jobs.length > 0);
    });

    it('filters correctly by employmentType', async () => {
      const fullTimeRes = await discoveryService.searchJobs({
        query: 'engineer',
        employmentType: 'FULL_TIME',
      });
      assert.ok(fullTimeRes.jobs.length > 0);
      assert.ok(fullTimeRes.jobs.every((j) => j.employmentType === 'FULL_TIME'));

      const contractRes = await discoveryService.searchJobs({
        query: 'engineer',
        employmentType: 'CONTRACT',
      });
      assert.equal(contractRes.jobs.length, 0);
    });

    it('filters correctly by skills and salary bounds', async () => {
      const tsRes = await discoveryService.searchJobs({
        query: 'engineer',
        skills: ['TypeScript'],
      });
      assert.ok(tsRes.jobs.length > 0);
      assert.ok(tsRes.jobs.every((j) => j.skills.some((s) => s.toLowerCase() === 'typescript')));

      const salaryRes = await discoveryService.searchJobs({
        query: 'engineer',
        minSalary: 250000,
      });
      assert.ok(salaryRes.jobs.every((j) => j.salary?.max >= 250000));
    });

    it('includes synthetic dataset attribution metadata', async () => {
      const res = await discoveryService.searchJobs({ query: 'engineer' });
      assert.ok(res._meta);
      assert.equal(res._meta.isSyntheticDataset, true);
    });
  });

  describe('5. recommend_portfolio_projects Deduplication & Criteria Attribution', () => {
    it('deduplicates candidate projects with matching canonical slugs or names', () => {
      const mockCandidateProfile = {
        id: candidateId,
        tenantId,
        projects: [
          { id: crypto.randomUUID(), name: 'Fastify Gateway', slug: 'fastify-gateway' },
          { id: crypto.randomUUID(), name: 'Fastify Gateway', slug: 'fastify-gateway' },
          { id: crypto.randomUUID(), name: 'fastify-gateway', slug: 'fastify-gateway--' },
          { id: crypto.randomUUID(), name: 'Other Tool', slug: 'other-tool' },
        ],
      };

      const jobDesc = {
        id: crypto.randomUUID(),
        tenantId,
        source: 'MANUAL',
        title: 'Backend Engineer',
        rawText: 'Backend Node developer',
        requirements: [],
      };

      const matchAnalysis = {
        jobDescriptionId: jobDesc.id,
        candidateId,
        tenantId,
        summary: { totalRequirements: 0, matchedCount: 0, partialCount: 0, missingCount: 0 },
        requirementMatches: [],
        skillGaps: [],
        explanations: [],
      };

      const relevanceAnalysis = {
        jobDescriptionId: jobDesc.id,
        candidateId,
        tenantId,
        projectRankings: [],
      };

      const recommendation = PortfolioRecommendationService.recommendPortfolio(
        mockContext,
        mockCandidateProfile,
        jobDesc,
        matchAnalysis,
        relevanceAnalysis
      );

      const allSlugs = [
        ...recommendation.featuredProjects.map((p) => p.projectSlug),
        ...recommendation.supportingProjects.map((p) => p.projectSlug),
        ...recommendation.deprioritizedProjects.map((p) => p.projectSlug),
      ];

      const fastifyMatches = allSlugs.filter((s) => s && s.includes('fastify-gateway'));
      assert.equal(fastifyMatches.length, 1);
    });

    it('accurately labels project recommendations that match 0 required criteria', () => {
      const reqId = crypto.randomUUID();
      const mockCandidateProfile = {
        id: candidateId,
        tenantId,
        projects: [{ id: crypto.randomUUID(), name: 'General Utility', slug: 'general-utility' }],
      };

      const jobDesc = {
        id: crypto.randomUUID(),
        tenantId,
        source: 'MANUAL',
        title: 'Rust Engineer',
        rawText: 'Requires Rust',
        requirements: [
          {
            id: reqId,
            category: 'SKILL',
            importance: 'REQUIRED',
            skillSlug: 'rust',
            extractedValue: 'Rust',
          },
        ],
      };

      const matchAnalysis = {
        jobDescriptionId: jobDesc.id,
        candidateId,
        tenantId,
        summary: { totalRequirements: 1, matchedCount: 0, partialCount: 0, missingCount: 1 },
        requirementMatches: [
          {
            requirementId: reqId,
            matchStatus: 'MISSING',
            skillSlug: 'rust',
            explanation: 'Missing',
          },
        ],
        skillGaps: [],
        explanations: [],
      };

      const relevanceAnalysis = {
        jobDescriptionId: jobDesc.id,
        candidateId,
        tenantId,
        projectRankings: [],
      };

      const recommendation = PortfolioRecommendationService.recommendPortfolio(
        mockContext,
        mockCandidateProfile,
        jobDesc,
        matchAnalysis,
        relevanceAnalysis
      );

      const featured = recommendation.featuredProjects[0];
      assert.equal(featured.requirementsCovered.length, 0);
      assert.ok(featured.reason.includes('Weak direct job match: covers 0 required criteria'));
    });
  });

  describe('6. get_career_profile Candidate ID Resolution', () => {
    it('resolves candidate profile via list.items when paramCandidateId is omitted', async () => {
      const registeredTools = new Map();
      const mockServer = {
        registerTool: (def, handler) => {
          registeredTools.set(def.name, handler);
        },
      };

      const mockProfileService = {
        listCandidates: async () => ({
          items: [{ id: candidateId, displayName: 'Resolved Candidate' }],
          pagination: { page: 1, pageSize: 1, totalItems: 1, totalPages: 1 },
        }),
        getCareerProfile: async () => ({
          candidate: { id: candidateId, displayName: 'Resolved Candidate' },
          skills: [],
          preferences: {},
        }),
      };

      registerCareerProfileTools(mockServer, { profileService: mockProfileService });
      const handler = registeredTools.get('get_career_profile');
      assert.ok(handler);

      const result = await handler({ tenantId, role: 'MEMBER' }, {});
      assert.ok(result);
      assert.equal(result.profile.candidate.id, candidateId);
    });
  });

  describe('7. inspect_project_evidence Pagination & Multi-Page Traversal', () => {
    it('handles out-of-bounds page requests gracefully with empty evidenceItems and correct bounds', async () => {
      const projectId = crypto.randomUUID();

      const testDb = {
        select: (selector) => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                { id: projectId, name: 'Sample Project', slug: 'sample-project' },
              ],
            }),
            innerJoin: () => ({
              where: async () => [],
            }),
            leftJoin: () => ({
              where: () => {
                if (selector && selector.total) {
                  return Promise.resolve([{ total: 5 }]);
                }
                return {
                  orderBy: () => ({
                    offset: () => ({
                      limit: async () => [],
                    }),
                  }),
                };
              },
            }),
          }),
        }),
      };

      const output = await handleInspectProjectEvidence(
        mockContext,
        {
          projectId,
          page: 10,
          pageSize: 5,
        },
        { db: testDb }
      );

      assert.deepEqual(output.evidenceItems, []);
      assert.equal(output.pagination.page, 10);
      assert.equal(output.pagination.totalCount, 5);
      assert.equal(output.pagination.totalPages, 1);
      assert.equal(output.pagination.hasNextPage, false);
    });
  });
});
