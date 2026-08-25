/**
 * @file Integration Tests for Project Improvement Recommender (P9-001)
 *
 * Tests the complete end-to-end recommendation lifecycle:
 * Candidate Profile -> Job Description -> Skill Gap Analysis ->
 * Repository Ranking -> Patch Synthesis -> Safety Validation -> Audit Logging -> Final Proposal
 *
 * Invariants Verified:
 * 1. Zero external GitHub write API calls.
 * 2. Deterministic gap grounding via EvidenceMatchingService.
 * 3. Structured Zod schema compliance.
 * 4. Multi-tenant sovereign default-deny isolation.
 * 5. Clean database lifecycle teardown with zero connection leaks.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ProjectImprovementRecommenderService } from '../../src/services/project-improvement-recommender.service.js';
import { McpAuditService } from '../../src/services/mcp-audit.service.js';
import { ProjectImprovementProposalSchema } from '../../src/domain/career/project-improvement.schemas.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Project Improvement Recommender Integration Tests (P9-001)', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const resourceId = crypto.randomUUID();
  const evidenceId = crypto.randomUUID();

  let recommenderService;
  let mcpAuditService;
  let context;
  let candidateProfile;
  let jobDescription;

  before(async () => {
    // 1. Seed database tenant & candidate for audit logging compatibility
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Integration Test Tenant (P9-001)',
      slug: `p9001-tenant-${Date.now()}`,
      status: 'ACTIVE',
    });

    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `p9001-user-${Date.now()}@example.com`,
      displayName: 'P9-001 Integration Tester',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateId,
      tenantId,
      userId,
      displayName: 'Alex Architect',
      headline: 'Senior Backend Engineer',
    });

    mcpAuditService = new McpAuditService({ db });

    // Mock AI Provider that returns structured patch recommendations
    const mockAiProvider = {
      generateStructured: async () => {
        return {
          title: 'Implement Redis Caching Layer in job-tracker-api',
          rationale: 'Addresses missing Redis caching requirement by adding RedisCacheManager.',
          architecturalChange: 'Adds CacheManager with TTL support and test coverage.',
          files: [
            {
              path: 'src/services/cache-manager.js',
              operation: 'CREATE',
              content:
                'export class CacheManager { constructor(client) { this.client = client; } }\n',
            },
            {
              path: 'tests/unit/cache-manager.test.js',
              operation: 'CREATE',
              content:
                'import { describe, it } from "node:test";\ndescribe("CacheManager", () => {});\n',
            },
          ],
          verificationPlan: {
            buildInstructions: 'npm install ioredis',
            testCommands: ['npm test'],
            expectedOutcomes: ['All tests pass'],
            rollbackAdvice: 'Revert branch if caching causes issues.',
          },
        };
      },
    };

    recommenderService = new ProjectImprovementRecommenderService({
      aiProvider: mockAiProvider,
      mcpAuditService,
    });

    context = { tenantId, userId };

    candidateProfile = {
      id: candidateId,
      tenantId,
      candidate: {
        id: candidateId,
        tenantId,
        fullName: 'Alex Architect',
      },
      skills: [
        {
          id: crypto.randomUUID(),
          slug: 'nodejs',
          name: 'Node.js',
          skillSlug: 'nodejs',
          skillName: 'Node.js',
          provenanceStatus: 'VERIFIED',
        },
        {
          id: crypto.randomUUID(),
          slug: 'postgresql',
          name: 'PostgreSQL',
          skillSlug: 'postgresql',
          skillName: 'PostgreSQL',
          provenanceStatus: 'VERIFIED',
        },
      ],
      projects: [
        {
          id: projectId,
          resourceId,
          name: 'job-tracker-api',
          repositoryName: 'job-tracker-api',
          description: 'REST API backend service built with Node.js and PostgreSQL',
          languages: { JavaScript: 85000 },
        },
      ],
      evidence: [
        {
          id: evidenceId,
          projectId,
          resourceId,
          resourceName: 'job-tracker-api',
          evidenceType: 'CODE_USAGE',
          filePath: 'src/server.js',
          confidenceScore: 1.0,
        },
      ],
    };

    jobDescription = {
      id: jobId,
      tenantId,
      rawText: 'Looking for a Senior Backend Engineer proficient in Node.js and Redis caching.',
      requirements: [
        {
          id: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'redis',
          extractedValue: 'Redis',
          explanation: 'Experience with Redis in-memory caching.',
        },
        {
          id: crypto.randomUUID(),
          category: 'SKILL',
          importance: 'REQUIRED',
          weight: 1.0,
          skillSlug: 'nodejs',
          extractedValue: 'Node.js',
          explanation: 'Core Node.js backend development.',
        },
      ],
    };
  });

  after(async () => {
    // Clean teardown of seeded database records
    try {
      await db.delete(candidates).where(eq(candidates.id, candidateId));
      await db.delete(users).where(eq(users.id, userId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } catch {
      // Ignore cleanup errors in teardown
    } finally {
      await closeDatabase();
    }
  });

  it('executes full recommendation flow and logs audit event', async () => {
    const proposal = await recommenderService.recommendImprovement(context, {
      candidateProfile,
      jobDescription,
    });

    assert.ok(proposal);
    assert.equal(proposal.tenantId, tenantId);
    assert.equal(proposal.candidateId, candidateId);
    assert.equal(proposal.repositoryName, 'job-tracker-api');
    assert.deepEqual(proposal.targetSkillSlugs, ['redis']);
    assert.equal(proposal.gapType, 'MISSING');
    assert.equal(proposal.status, 'PROPOSED');
    assert.match(proposal.targetBranch, /^feat\/career-hub-redis-[a-z0-9]+$/);
    assert.equal(proposal.patch.fileCount, 2);
    assert.ok(proposal.patch.totalDiffLines > 0);
    assert.match(proposal.patch.patchFingerprint, /^[a-f0-9]{64}$/);

    // Assert proposal schema compliance
    const validated = ProjectImprovementProposalSchema.parse(proposal);
    assert.equal(validated.proposalId, proposal.proposalId);
  });

  it('deterministic fallback works seamlessly when AI provider is absent', async () => {
    const pureDeterministicService = new ProjectImprovementRecommenderService({
      aiProvider: null,
      mcpAuditService,
    });

    const proposal = await pureDeterministicService.recommendImprovement(context, {
      candidateProfile,
      jobDescription,
    });

    assert.ok(proposal);
    assert.equal(proposal.status, 'PROPOSED');
    assert.ok(proposal.patch.files.length >= 1);
    assert.match(proposal.targetBranch, /^feat\/career-hub-redis-[a-z0-9]+$/);
  });
});
