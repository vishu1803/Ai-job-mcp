/**
 * @file Unit Tests for P16-001F-3B: Authoritative Analyze -> Prepare Snapshot & Score Parity
 *
 * Verifies:
 * - Tests A-D: Snapshot persistence, retrieval, and idempotency
 * - Tests E-G: Multi-tenant, cross-candidate, and canonical job security boundaries (403/409)
 * - Tests H-J: Contract version, TTL (2h), and job content hash integrity validation
 * - Tests K-M: Canonical content hash determinism and field isolation
 * - Tests N: Workflow authoritative passthrough guard (Step 0)
 * - Tests O-R: Workflow fallback parity via JobDescriptionParser & ProjectRelevanceService
 * - Test S: toWorkflowJobFit contract mapping
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
  ANALYSIS_SNAPSHOT_TTL_MS,
  computeJobContentHash,
  JobAnalysisSnapshotSchema,
} from '../../src/domain/career/analysis-snapshot.schemas.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { AuthorizationError, ConflictError } from '../../src/errors/index.js';

// ---------------------------------------------------------------------------
// Mock Fixtures & In-Memory DB Helper
// ---------------------------------------------------------------------------

const TENANT_1 = '11111111-1111-4111-8111-111111111111';
const TENANT_2 = '22222222-2222-4222-8222-222222222222';
const CANDIDATE_1 = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_2 = '44444444-4444-4333-8333-444444444444';
const CANONICAL_JOB_ID = 'JOB-GREENHOUSE-CLOUDFLARE-8102350';
const OTHER_JOB_ID = 'JOB-LEVER-STRIPE-9999999';

const CLOUDFLARE_JOB = {
  company: 'Cloudflare',
  title: 'Systems & Infrastructure Engineer',
  description:
    'Design, build and maintain distributed systems, high throughput streaming, raft replication, and Rust services at Cloudflare edge.',
  location: 'San Francisco, CA',
  workplace: 'HYBRID',
  employmentType: 'FULL_TIME',
  sourceUrl: 'https://boards.greenhouse.io/cloudflare/jobs/8102350',
};

const SAMPLE_PROJECTS = [
  {
    id: '55555555-5555-4555-8555-555555555555',
    title: 'Product-Data-Explorer',
    name: 'Product-Data-Explorer',
    description:
      'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
    technologies: ['Rust', 'Distributed Systems', 'Raft', 'Streaming', 'TypeScript'],
    skills: ['Rust', 'Distributed Systems', 'Streaming'],
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    title: 'Collaborative-task-manager',
    name: 'Collaborative-task-manager',
    description: 'Real-time collaborative task management system with WebSockets and PostgreSQL.',
    technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'WebSockets'],
    skills: ['Node.js', 'PostgreSQL', 'WebSockets'],
  },
  {
    id: '77777777-7777-4777-8777-777777777777',
    title: 'Ai-powered-code-review-assistant',
    name: 'Ai-powered-code-review-assistant',
    description: 'LLM-powered code review and static analysis tool for GitHub PRs.',
    technologies: ['Python', 'LLM', 'GitHub API', 'FastAPI'],
    skills: ['Python', 'FastAPI', 'LLM'],
  },
];

/**
 * Creates an in-memory mock db mimicking Drizzle fluent queries for job_analysis_snapshots.
 */
function createMockSnapshotDb(initialRows = []) {
  const store = new Map();
  for (const row of initialRows) {
    store.set(row.id, { ...row });
  }

  return {
    _store: store,
    insert: () => ({
      values: (row) => ({
        returning: async () => {
          const inserted = {
            id: row.id || crypto.randomUUID(),
            createdAt: row.createdAt || new Date(),
            updatedAt: row.updatedAt || new Date(),
            ...row,
          };
          store.set(inserted.id, inserted);
          return [inserted];
        },
      }),
    }),
    update: () => ({
      set: (updates) => ({
        where: () => ({
          returning: async () => {
            const first = Array.from(store.values())[0];
            if (first) {
              const updated = { ...first, ...updates, updatedAt: new Date() };
              store.set(first.id, updated);
              return [updated];
            }
            return [];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (lim) => {
              return Array.from(store.values()).slice(0, lim);
            },
          }),
          limit: async (lim) => {
            return Array.from(store.values()).slice(0, lim);
          },
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('P16-001F-3B: Unit Tests A through S', () => {
  // =========================================================================
  // Tests K, L, M: computeJobContentHash Determinism and Sensitivity
  // =========================================================================

  describe('Tests K-M: Content Hash Canonicalization', () => {
    it('Test K: computeJobContentHash produces identical hash for identical job content', () => {
      const hash1 = computeJobContentHash(CLOUDFLARE_JOB);
      const hash2 = computeJobContentHash({ ...CLOUDFLARE_JOB });
      assert.equal(typeof hash1, 'string');
      assert.equal(hash1.length, 64);
      assert.equal(hash1, hash2);
    });

    it('Test L: computeJobContentHash produces different hash when description or title changes', () => {
      const baseHash = computeJobContentHash(CLOUDFLARE_JOB);
      const modifiedDescJob = {
        ...CLOUDFLARE_JOB,
        description: CLOUDFLARE_JOB.description + ' Added required security clearance.',
      };
      const modifiedTitleJob = {
        ...CLOUDFLARE_JOB,
        title: 'Senior Systems & Infrastructure Engineer',
      };

      assert.notEqual(computeJobContentHash(modifiedDescJob), baseHash);
      assert.notEqual(computeJobContentHash(modifiedTitleJob), baseHash);
    });

    it('Test M: computeJobContentHash ignores irrelevant transient fields', () => {
      const baseHash = computeJobContentHash(CLOUDFLARE_JOB);
      const jobWithTransientFields = {
        ...CLOUDFLARE_JOB,
        tabId: 99123,
        sessionId: 'sess-abc-123',
        scrapedAt: '2026-09-09T12:00:00Z',
        applicationId: 'app-xyz-456',
        randomToken: 'secret-123',
      };

      assert.equal(computeJobContentHash(jobWithTransientFields), baseHash);
    });
  });

  // =========================================================================
  // Tests A-D: JobAnalysisSnapshotService Persistence and Idempotency
  // =========================================================================

  describe('Tests A-D: Snapshot Service Persistence, Retrieval & Idempotency', () => {
    it('Test A: saves snapshot with all required authoritative fields', async () => {
      const mockDb = createMockSnapshotDb();
      const service = new JobAnalysisSnapshotService({ db: mockDb });

      const contentHash = computeJobContentHash(CLOUDFLARE_JOB);
      const snapshot = await service.saveSnapshot({
        tenantId: TENANT_1,
        candidateId: CANDIDATE_1,
        canonicalJobId: CANONICAL_JOB_ID,
        normalizedJobUrl: CLOUDFLARE_JOB.sourceUrl,
        jobContentHash: contentHash,
        contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
        overallFit: { atsScore: 64.83, fitBand: 'B', recommendation: 'MODERATE_FIT' },
        matchAnalysis: { requirementMatches: [{ requirement: 'Rust' }] },
        projectRankings: [
          { project: { name: 'Product-Data-Explorer' }, score: 64.83, rank: 1 },
          { project: { name: 'Collaborative-task-manager' }, score: 51.89, rank: 2 },
          { project: { name: 'Ai-powered-code-review-assistant' }, score: 47.84, rank: 3 },
        ],
        parsedJobDescription: { requirements: [{ text: 'Rust experience' }] },
      });

      assert.ok(snapshot.id);
      assert.equal(snapshot.tenantId, TENANT_1);
      assert.equal(snapshot.candidateId, CANDIDATE_1);
      assert.equal(snapshot.canonicalJobId, CANONICAL_JOB_ID);
      assert.equal(snapshot.jobContentHash, contentHash);
      assert.equal(snapshot.contractVersion, 'P16-001F');
      assert.equal(snapshot.overallFit.atsScore, 64.83);
      assert.equal(snapshot.projectRankings.length, 3);
      assert.equal(snapshot.projectRankings[0].project.name, 'Product-Data-Explorer');
      assert.equal(snapshot.projectRankings[0].score, 64.83);
      assert.equal(ANALYSIS_SNAPSHOT_TTL_MS, 7200000);
      assert.doesNotThrow(() => JobAnalysisSnapshotSchema.parse(snapshot));
    });

    it('Test B: retrieves snapshot by ID', async () => {
      const existingId = crypto.randomUUID();
      const contentHash = computeJobContentHash(CLOUDFLARE_JOB);
      const mockDb = createMockSnapshotDb([
        {
          id: existingId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: contentHash,
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: { atsScore: 64.83 },
          matchAnalysis: {},
          projectRankings: [{ project: { name: 'Product-Data-Explorer' }, score: 64.83 }],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const retrieved = await service.getSnapshotById(existingId, { tenantId: TENANT_1 });
      assert.ok(retrieved);
      assert.equal(retrieved.id, existingId);
      assert.equal(retrieved.projectRankings[0].project.name, 'Product-Data-Explorer');
    });

    it('Test C: retrieves latest snapshot by canonicalJobId', async () => {
      const mockDb = createMockSnapshotDb([
        {
          id: crypto.randomUUID(),
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(Date.now() - 60000),
          overallFit: { atsScore: 64.83 },
          matchAnalysis: {},
          projectRankings: [{ project: { name: 'Product-Data-Explorer' }, score: 64.83 }],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const latest = await service.getLatestSnapshot({
        tenantId: TENANT_1,
        candidateId: CANDIDATE_1,
        canonicalJobId: CANONICAL_JOB_ID,
      });

      assert.ok(latest);
      assert.equal(latest.canonicalJobId, CANONICAL_JOB_ID);
    });

    it('Test D: idempotently updates within TTL when snapshot for same job already exists', async () => {
      const existingId = crypto.randomUUID();
      const contentHash = computeJobContentHash(CLOUDFLARE_JOB);
      const mockDb = createMockSnapshotDb([
        {
          id: existingId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: contentHash,
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: { atsScore: 60.0 },
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const updated = await service.saveSnapshot({
        tenantId: TENANT_1,
        candidateId: CANDIDATE_1,
        canonicalJobId: CANONICAL_JOB_ID,
        jobContentHash: contentHash,
        contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
        overallFit: { atsScore: 64.83 },
        matchAnalysis: {},
        projectRankings: [{ project: { name: 'Product-Data-Explorer' }, score: 64.83 }],
        parsedJobDescription: {},
      });

      assert.equal(updated.id, existingId);
      assert.equal(updated.overallFit.atsScore, 64.83);
    });
  });

  // =========================================================================
  // Tests E-G: Security & Isolation Gates (403 / 409)
  // =========================================================================

  describe('Tests E-G: Multi-Tenant & Job Security Gates', () => {
    it('Test E: enforces tenant boundary — throws AuthorizationError (403) on cross-tenant access', async () => {
      const snapId = crypto.randomUUID();
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });

      await assert.rejects(
        async () => {
          await service.getValidatedSnapshot({
            context: { tenantId: TENANT_2, candidateId: CANDIDATE_1 },
            snapshotId: snapId,
            canonicalJobId: CANONICAL_JOB_ID,
            jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          });
        },
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    it('Test F: enforces candidate boundary — throws AuthorizationError (403) on cross-candidate access', async () => {
      const snapId = crypto.randomUUID();
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });

      await assert.rejects(
        async () => {
          await service.getValidatedSnapshot({
            context: { tenantId: TENANT_1, candidateId: CANDIDATE_2 },
            snapshotId: snapId,
            canonicalJobId: CANONICAL_JOB_ID,
            jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          });
        },
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });

    it('Test G: enforces canonical job ID match — throws ConflictError ANALYSIS_JOB_MISMATCH (409) on wrong job', async () => {
      const snapId = crypto.randomUUID();
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });

      await assert.rejects(
        async () => {
          await service.getValidatedSnapshot({
            context: { tenantId: TENANT_1, candidateId: CANDIDATE_1 },
            snapshotId: snapId,
            canonicalJobId: OTHER_JOB_ID,
            jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          });
        },
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.code, 'ANALYSIS_JOB_MISMATCH');
          assert.equal(err.statusCode, 409);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // Tests H-J: Version, TTL, and Content Hash Invalidation Gates
  // =========================================================================

  describe('Tests H-J: Contract Version, TTL, and Content Hash Gates', () => {
    it('Test H: rejects mismatched contract version with valid: false', async () => {
      const snapId = crypto.randomUUID();
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: 'P15-001F',
          analyzedAt: new Date(),
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const result = await service.getValidatedSnapshot({
        context: { tenantId: TENANT_1, candidateId: CANDIDATE_1 },
        snapshotId: snapId,
        canonicalJobId: CANONICAL_JOB_ID,
        jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
      });

      assert.equal(result.valid, false);
      assert.equal(result.reason, 'CONTRACT_VERSION_MISMATCH');
    });

    it('Test I: rejects snapshot older than TTL (2 hours) with valid: false', async () => {
      const snapId = crypto.randomUUID();
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: threeHoursAgo,
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const result = await service.getValidatedSnapshot({
        context: { tenantId: TENANT_1, candidateId: CANDIDATE_1 },
        snapshotId: snapId,
        canonicalJobId: CANONICAL_JOB_ID,
        jobContentHash: computeJobContentHash(CLOUDFLARE_JOB),
      });

      assert.equal(result.valid, false);
      assert.equal(result.reason, 'SNAPSHOT_EXPIRED');
    });

    it('Test J: rejects altered job description with valid: false when content hash differs', async () => {
      const snapId = crypto.randomUUID();
      const originalHash = computeJobContentHash(CLOUDFLARE_JOB);
      const mockDb = createMockSnapshotDb([
        {
          id: snapId,
          tenantId: TENANT_1,
          candidateId: CANDIDATE_1,
          canonicalJobId: CANONICAL_JOB_ID,
          jobContentHash: originalHash,
          contractVersion: ANALYSIS_SNAPSHOT_CONTRACT_VERSION,
          analyzedAt: new Date(),
          overallFit: {},
          matchAnalysis: {},
          projectRankings: [],
          parsedJobDescription: {},
        },
      ]);

      const service = new JobAnalysisSnapshotService({ db: mockDb });
      const tamperedJob = {
        ...CLOUDFLARE_JOB,
        description: CLOUDFLARE_JOB.description + ' Requires 15 years Rust experience.',
      };
      const alteredHash = computeJobContentHash(tamperedJob);

      const result = await service.getValidatedSnapshot({
        context: { tenantId: TENANT_1, candidateId: CANDIDATE_1 },
        snapshotId: snapId,
        canonicalJobId: CANONICAL_JOB_ID,
        jobContentHash: alteredHash,
      });

      assert.equal(result.valid, false);
      assert.equal(result.reason, 'JOB_CONTENT_HASH_MISMATCH');
    });
  });

  // =========================================================================
  // Tests N, S: Authoritative Workflow Passthrough & Contract Mapping
  // =========================================================================

  describe('Tests N & S: Authoritative Passthrough Guard & Contract Mapping', () => {
    it('Test S: toWorkflowJobFit produces valid structure for workflow service', () => {
      const service = new JobAnalysisSnapshotService({ db: {} });
      const rawSnapshot = {
        id: crypto.randomUUID(),
        tenantId: TENANT_1,
        candidateId: CANDIDATE_1,
        canonicalJobId: CANONICAL_JOB_ID,
        jobContentHash: 'hash123',
        contractVersion: 'P16-001F',
        analyzedAt: new Date().toISOString(),
        overallFit: { atsScore: 64.83, fitBand: 'B', recommendation: 'MODERATE_FIT' },
        matchAnalysis: { requirementMatches: [] },
        projectRankings: [
          { project: { name: 'Product-Data-Explorer' }, score: 64.83, rank: 1 },
          { project: { name: 'Collaborative-task-manager' }, score: 51.89, rank: 2 },
          { project: { name: 'Ai-powered-code-review-assistant' }, score: 47.84, rank: 3 },
        ],
        topRelevantProjects: [{ name: 'Product-Data-Explorer', score: 64.83 }],
        parsedJobDescription: { requirements: [] },
      };

      const wfFit = service.toWorkflowJobFit(rawSnapshot);
      assert.ok(wfFit.isAuthoritative);
      assert.equal(wfFit.snapshotId, rawSnapshot.id);
      assert.equal(wfFit.source, 'EXTENSION_AUTHORITATIVE_SNAPSHOT');
      assert.equal(wfFit.authoritativeRankings.length, 3);
      assert.equal(wfFit.authoritativeRankings[0].score, 64.83);
      assert.equal(wfFit.overallFit.atsScore, 64.83);
    });

    it('Test N: _resolveOrComputeJobFit uses authoritative snapshot without recomputation', async () => {
      const workflowService = new JobApplicationWorkflowService({ database: {} });

      const authoritativeRankings = [
        { project: { name: 'Product-Data-Explorer' }, score: 64.83, rank: 1 },
        { project: { name: 'Collaborative-task-manager' }, score: 51.89, rank: 2 },
        { project: { name: 'Ai-powered-code-review-assistant' }, score: 47.84, rank: 3 },
      ];

      const jobPostingWithSnapshot = {
        id: CANONICAL_JOB_ID,
        company: 'Cloudflare',
        title: 'Systems & Infrastructure Engineer',
        description: CLOUDFLARE_JOB.description,
        jobFitAnalysis: {
          isAuthoritative: true,
          snapshotId: 'snap-auth-123',
          source: 'EXTENSION_AUTHORITATIVE_SNAPSHOT',
          authoritativeRankings,
          projectRankings: authoritativeRankings,
          overallFit: { atsScore: 64.83 },
          matchAnalysis: {},
          topRelevantProjects: [{ name: 'Product-Data-Explorer', score: 64.83 }],
        },
      };

      const context = { tenantId: TENANT_1, userId: 'user-1' };
      const candidateProfile = { id: CANDIDATE_1, projects: SAMPLE_PROJECTS };

      const resolvedFit = await workflowService._resolveOrComputeJobFit({
        context,
        targetJobPosting: jobPostingWithSnapshot,
        candidateProfile,
      });

      assert.ok(resolvedFit);
      assert.equal(resolvedFit.isAuthoritative, true);
      assert.equal(resolvedFit.snapshotId, 'snap-auth-123');
      assert.equal(resolvedFit.authoritativeRankings[0].project.name, 'Product-Data-Explorer');
      assert.equal(resolvedFit.authoritativeRankings[0].score, 64.83);
    });
  });

  // =========================================================================
  // Tests O-R: Workflow Fallback Parity via JobDescriptionParser
  // =========================================================================

  describe('Tests O-R: Workflow Fallback Parity via JobDescriptionParser & ProjectRelevanceService', () => {
    it('Test O: JobDescriptionParser.parse produces identical atomic requirements for Cloudflare job', async () => {
      const parsed1 = await JobDescriptionParser.parse(
        {
          rawText: CLOUDFLARE_JOB.description,
          title: CLOUDFLARE_JOB.title,
          company: CLOUDFLARE_JOB.company,
          source: 'API',
        },
        { tenantId: TENANT_1, userId: 'user-1' }
      );

      const parsed2 = await JobDescriptionParser.parse(
        {
          rawText: CLOUDFLARE_JOB.description,
          title: CLOUDFLARE_JOB.title,
          company: CLOUDFLARE_JOB.company,
          source: 'MANUAL',
        },
        { tenantId: TENANT_1, userId: 'user-1' }
      );

      assert.ok(parsed1.requirements.length > 0);
      assert.equal(parsed1.requirements.length, parsed2.requirements.length);
      for (let i = 0; i < parsed1.requirements.length; i++) {
        assert.equal(parsed1.requirements[i].text, parsed2.requirements[i].text);
        assert.equal(parsed1.requirements[i].category, parsed2.requirements[i].category);
      }
    });

    it('Test P & Q & R: Fallback project relevance produces identical score and ranking order to Analyze', async () => {
      // 1. Simulate Analyze Job path:
      const parsed = await JobDescriptionParser.parse(
        {
          rawText: CLOUDFLARE_JOB.description,
          title: CLOUDFLARE_JOB.title,
          company: CLOUDFLARE_JOB.company,
          source: 'API',
        },
        { tenantId: TENANT_1, userId: 'user-1' }
      );

      const jobDesc1 = {
        id: crypto.randomUUID(),
        tenantId: TENANT_1,
        title: CLOUDFLARE_JOB.title,
        companyName: CLOUDFLARE_JOB.company,
        level: 'MID',
        requirements: parsed.requirements,
        skills: [],
        description: CLOUDFLARE_JOB.description,
      };

      const analyzeResult = ProjectRelevanceService.computeProjectsRelevance(
        { tenantId: TENANT_1, userId: 'user-1' },
        jobDesc1,
        SAMPLE_PROJECTS,
        { candidateId: CANDIDATE_1 }
      );
      const analyzeRankings = analyzeResult.projectRankings;

      // 2. Simulate Workflow Fallback Step 4 path (when no snapshot is present):
      const fallbackParsed = await JobDescriptionParser.parse(
        {
          rawText: CLOUDFLARE_JOB.description,
          title: CLOUDFLARE_JOB.title,
          company: CLOUDFLARE_JOB.company,
          source: 'MANUAL',
        },
        { tenantId: TENANT_1, userId: 'user-1' }
      );

      const jobDesc2 = {
        id: crypto.randomUUID(),
        tenantId: TENANT_1,
        title: CLOUDFLARE_JOB.title,
        companyName: CLOUDFLARE_JOB.company,
        level: 'MID',
        requirements: fallbackParsed.requirements,
        skills: [],
        description: CLOUDFLARE_JOB.description,
      };

      const fallbackResult = ProjectRelevanceService.computeProjectsRelevance(
        { tenantId: TENANT_1, userId: 'user-1' },
        jobDesc2,
        SAMPLE_PROJECTS,
        { candidateId: CANDIDATE_1 }
      );
      const fallbackRankings = fallbackResult.projectRankings;

      // Assertions for Test P (same projects ranked)
      assert.equal(fallbackRankings.length, analyzeRankings.length);
      for (let i = 0; i < analyzeRankings.length; i++) {
        assert.equal(fallbackRankings[i].projectName, analyzeRankings[i].projectName);
      }

      // Assertions for Test Q (score parity within 0.01 tolerance for top project)
      const topAnalyzeScore = analyzeRankings[0].relevanceScore;
      const topFallbackScore = fallbackRankings[0].relevanceScore;
      assert.ok(
        Math.abs(topAnalyzeScore - topFallbackScore) < 0.01,
        `Score discrepancy detected: Analyze=${topAnalyzeScore}, Fallback=${topFallbackScore}`
      );

      // Assertions for Test R (Top 3 ranking order identical)
      const analyzeOrder = analyzeRankings
        .slice(0, 3)
        .map((r) => r.projectName);
      const fallbackOrder = fallbackRankings
        .slice(0, 3)
        .map((r) => r.projectName);

      assert.deepEqual(
        fallbackOrder,
        analyzeOrder,
        `Project ranking order must be identical: Fallback=${JSON.stringify(fallbackOrder)}, Analyze=${JSON.stringify(analyzeOrder)}`
      );

      // Verify Product-Data-Explorer is #1 in both
      assert.equal(fallbackOrder[0], 'Product-Data-Explorer');
    });
  });
});
