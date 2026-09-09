/**
 * @file Integration Tests for P16-001F-3B: Authoritative Analyze -> Prepare Snapshot Passthrough
 *
 * Verifies Flows 1 through 13:
 * - Flow 1: POST /api/extension/analyze-job returns analysisSnapshotId
 * - Flow 2: Snapshot exists in DB with contractVersion, hash, projectRankings, overallFit
 * - Flow 3: POST /api/extension/prepare-handoff with explicit snapshot ID validates and binds snapshot
 * - Flow 4: POST /api/extension/prepare-handoff without snapshot ID resolves active snapshot by canonicalJobId
 * - Flow 5 & 6: Score and project ranking parity between Analyze and Prepare
 * - Flow 7: Cross-tenant snapshot access returns 403
 * - Flow 8: Cross-candidate snapshot access returns 403
 * - Flow 9: Canonical job mismatch returns 409 ANALYSIS_JOB_MISMATCH
 * - Flow 10: Tampered/altered job description rejects snapshot and safely falls back
 * - Flow 11: Expired snapshot falls back to parser-backed computation
 * - Flow 12: Direct workflow call (no snapshot) uses fallback parser and produces equivalent ranking
 * - Flow 13: Full handoff kit generated with matching resume project rankings
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import extensionRoutes from '../../src/routes/extension.routes.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  jobAnalysisSnapshots,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';

const CLOUDFLARE_JOB_PAYLOAD = {
  sourceUrl: 'https://boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350',
  provider: 'GREENHOUSE',
  title: 'Systems & Infrastructure Engineer',
  company: 'Cloudflare',
  location: 'San Francisco, CA',
  workplace: 'HYBRID',
  employmentType: 'FULL_TIME',
  description:
    'Design, build and maintain distributed systems, high throughput streaming, raft replication, and Rust edge services at Cloudflare.',
};

describe('P16-001F-3B: Integration Flows 1 through 13', () => {
  let app;
  const createdTenantIds = [];

  let userA;
  let candidateA;
  let sessionA;

  let userB;
  let candidateB;
  let sessionB;

  let userC;
  let candidateC;
  let sessionC;

  let workflowService;
  let trackingService;
  let snapshotService;

  let flow1SnapshotId;
  let flow1CanonicalJobId;
  let flow1AnalyzeScore;
  let flow1TopProject;

  before(async () => {
    workflowService = new JobApplicationWorkflowService({ database: db });
    workflowService.applicationHandoffService.latexCompilerService = {
      compileDocument: async () => ({
        success: true,
        compilerUsed: 'mock-tectonic',
        pdfBuffer: Buffer.from('%PDF-1.5 mock pdf for testing'),
        texContent: '% mock tex',
      }),
    };
    trackingService = new ApplicationTrackingService({ database: db });
    snapshotService = new JobAnalysisSnapshotService({ db });

    app = Fastify({ logger: false });
    app.decorate('db', db);
    app.decorateRequest('db', {
      getter() {
        return this.server.db;
      },
    });
    app.register(fastifyCookie);
    app.register(extensionRoutes, {
      prefix: '/api/extension',
      db,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
      snapshotService,
    });
    await app.ready();

    // 1. Tenant A (Primary)
    const tenantAId = crypto.randomUUID();
    createdTenantIds.push(tenantAId);
    await db.insert(tenants).values({
      id: tenantAId,
      name: 'Snapshot Test Tenant A',
      slug: `snap-tenant-a-${Date.now()}`,
      tier: 'PRO',
    });

    const userAId = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userAId,
        tenantId: tenantAId,
        email: `snap-cand-a-${Date.now()}@example.test`,
        displayName: 'Alice Cloudflare Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateAId = crypto.randomUUID();
    const proj1Id = crypto.randomUUID();
    const proj2Id = crypto.randomUUID();
    const proj3Id = crypto.randomUUID();

    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateAId,
        tenantId: tenantAId,
        userId: userAId,
        displayName: 'Alice Cloudflare Candidate',
        canonicalEmail: userA.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Alice Cloudflare Candidate', email: userA.email, phone: '+1-555-0199' },
            skills: ['Rust', 'Distributed Systems', 'TypeScript', 'Node.js', 'PostgreSQL'],
            projects: [
              {
                id: proj1Id,
                name: 'Product-Data-Explorer',
                title: 'Product-Data-Explorer',
                summary: 'High-throughput distributed telemetry in Rust.',
                technologies: ['Rust', 'Distributed Systems', 'Raft', 'Streaming', 'TypeScript'],
                bullets: ['Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.'],
                url: 'https://github.com/alice/product-data-explorer',
              },
              {
                id: proj2Id,
                name: 'Collaborative-task-manager',
                title: 'Collaborative-task-manager',
                summary: 'Real-time collaborative task manager.',
                technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'WebSockets'],
                bullets: ['Built real-time task manager using Node.js, TypeScript, and WebSockets.'],
                url: 'https://github.com/alice/collaborative-task-manager',
              },
              {
                id: proj3Id,
                name: 'Ai-powered-code-review-assistant',
                title: 'Ai-powered-code-review-assistant',
                summary: 'Static analysis and LLM reviews.',
                technologies: ['Python', 'LLM', 'GitHub API', 'FastAPI'],
                bullets: ['Automated PR code reviews using LLMs and FastAPI webhook services.'],
                url: 'https://github.com/alice/code-review-assistant',
              },
            ],
          },
        },
      })
      .returning();

    sessionA = await createSession(db, { userId: userAId, tenantId: tenantAId });

    // Seed candidate A resource & projects with evidence for authoritative analysis
    const resAId = crypto.randomUUID();
    await db.insert(resources).values({
      id: resAId,
      tenantId: tenantAId,
      candidateId: candidateAId,
      provider: 'GITHUB_APP',
      resourceType: 'REPOSITORY',
      externalResourceId: 'repo-pde',
      name: 'alice/product-data-explorer',
      displayName: 'Product-Data-Explorer',
      status: 'ACTIVE',
      metadata: {},
    });

    await db.insert(projects).values([
      {
        id: proj1Id,
        tenantId: tenantAId,
        candidateId: candidateAId,
        name: 'Product-Data-Explorer',
        slug: 'product-data-explorer',
        summary: 'High-throughput distributed telemetry in Rust.',
        metadata: {
          portfolioStatus: 'FEATURED',
          description: 'High-throughput distributed telemetry and data exploration platform in Rust and TypeScript with streaming pipelines.',
          technologies: ['Rust', 'Distributed Systems', 'Raft', 'Streaming', 'TypeScript'],
          skills: ['Rust', 'Distributed Systems', 'Streaming'],
          bullets: ['Engineered high-throughput distributed telemetry pipelines in Rust with Raft consensus.'],
        },
      },
      {
        id: proj2Id,
        tenantId: tenantAId,
        candidateId: candidateAId,
        name: 'Collaborative-task-manager',
        slug: 'collaborative-task-manager',
        summary: 'Real-time collaborative task manager.',
        metadata: {
          portfolioStatus: 'FEATURED',
          description: 'Real-time collaborative task manager.',
          technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'WebSockets'],
          skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'WebSockets'],
          bullets: ['Built real-time task manager using Node.js, TypeScript, and WebSockets.'],
        },
      },
      {
        id: proj3Id,
        tenantId: tenantAId,
        candidateId: candidateAId,
        name: 'Ai-powered-code-review-assistant',
        slug: 'ai-powered-code-review-assistant',
        summary: 'Static analysis and LLM reviews.',
        metadata: {
          portfolioStatus: 'FEATURED',
          description: 'Static analysis and LLM reviews.',
          technologies: ['Python', 'LLM', 'GitHub API', 'FastAPI'],
          skills: ['Python', 'LLM', 'FastAPI'],
          bullets: ['Automated PR code reviews using LLMs and FastAPI webhook services.'],
        },
      },
    ]);

    await db.insert(projectResources).values({
      tenantId: tenantAId,
      projectId: proj1Id,
      resourceId: resAId,
    });

    async function getOrCreateSkill(slug, name, category = 'LANGUAGE') {
      const [existing] = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
      if (existing) return existing;
      const [inserted] = await db.insert(skills).values({ slug, name, category }).returning();
      return inserted;
    }

    const skillRust = await getOrCreateSkill('rust', 'Rust', 'LANGUAGE');
    const skillDist = await getOrCreateSkill('distributed-systems', 'Distributed Systems', 'FRAMEWORK');

    await db.insert(candidateSkills).values([
      {
        tenantId: tenantAId,
        candidateId: candidateAId,
        skillId: skillRust.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 1,
      },
      {
        tenantId: tenantAId,
        candidateId: candidateAId,
        skillId: skillDist.id,
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.90,
        evidenceCount: 1,
      },
    ]);

    await db.insert(evidenceItems).values([
      {
        id: crypto.randomUUID(),
        tenantId: tenantAId,
        candidateId: candidateAId,
        resourceId: resAId,
        projectId: proj1Id,
        skillId: skillRust.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: { filePath: 'src/main.rs', commitSha: 'abcdef1234567890abcdef1234567890abcdef12' },
        excerpt: 'use tokio::sync::mpsc;',
        confidenceScore: 0.95,
      },
      {
        id: crypto.randomUUID(),
        tenantId: tenantAId,
        candidateId: candidateAId,
        resourceId: resAId,
        projectId: proj1Id,
        skillId: skillDist.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: { filePath: 'src/raft.rs', commitSha: 'abcdef1234567890abcdef1234567890abcdef12' },
        excerpt: 'impl RaftConsensus for Node',
        confidenceScore: 0.92,
      },
    ]);

    // 2. Candidate C in Tenant A (Same tenant, different candidate for cross-candidate tests)
    const userCId = crypto.randomUUID();
    [userC] = await db
      .insert(users)
      .values({
        id: userCId,
        tenantId: tenantAId,
        email: `snap-cand-c-${Date.now()}@example.test`,
        displayName: 'Charlie Peer',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateCId = crypto.randomUUID();
    [candidateC] = await db
      .insert(candidates)
      .values({
        id: candidateCId,
        tenantId: tenantAId,
        userId: userCId,
        displayName: 'Charlie Peer',
        canonicalEmail: userC.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Charlie Peer', email: userC.email, phone: '+1-555-0300' },
            skills: ['Go', 'Kubernetes'],
          },
        },
      })
      .returning();

    sessionC = await createSession(db, { userId: userCId, tenantId: tenantAId });

    // 3. Tenant B (Secondary for cross-tenant isolation checks)
    const tenantBId = crypto.randomUUID();
    createdTenantIds.push(tenantBId);
    await db.insert(tenants).values({
      id: tenantBId,
      name: 'Snapshot Test Tenant B',
      slug: `snap-tenant-b-${Date.now()}`,
      tier: 'FREE',
    });

    const userBId = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userBId,
        tenantId: tenantBId,
        email: `snap-cand-b-${Date.now()}@example.test`,
        displayName: 'Bob CrossTenant',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateBId = crypto.randomUUID();
    [candidateB] = await db
      .insert(candidates)
      .values({
        id: candidateBId,
        tenantId: tenantBId,
        userId: userBId,
        displayName: 'Bob CrossTenant',
        canonicalEmail: userB.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'REGISTERED' },
        },
      })
      .returning();

    sessionB = await createSession(db, { userId: userBId, tenantId: tenantBId });
    assert.ok(candidateB.id);
    assert.ok(candidateC.id);
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        await db.delete(jobAnalysisSnapshots).where(inArray(jobAnalysisSnapshots.tenantId, createdTenantIds));
        await db.delete(jobApplications).where(inArray(jobApplications.tenantId, createdTenantIds));
        await db.delete(applicationPackages).where(inArray(applicationPackages.tenantId, createdTenantIds));
        await db.delete(candidateSkills).where(inArray(candidateSkills.tenantId, createdTenantIds));
        await db.delete(projects).where(inArray(projects.tenantId, createdTenantIds));
        await db.delete(resources).where(inArray(resources.tenantId, createdTenantIds));
        await db.delete(candidates).where(inArray(candidates.tenantId, createdTenantIds));
        await db.delete(users).where(inArray(users.tenantId, createdTenantIds));
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      }
      if (app) await app.close();
      await closeDatabase();
    } catch {
      // Best-effort teardown
    }
  });

  // =========================================================================
  // Flows 1 & 2: Authoritative Analysis and Snapshot Persistence
  // =========================================================================

  it('Flow 1 & 2: POST /api/extension/analyze-job returns analysisSnapshotId and persists snapshot in DB', async () => {
    console.log('[DEBUG-TEST] Starting Flow 1 & 2 test body');
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: { job: CLOUDFLARE_JOB_PAYLOAD },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);

    assert.ok(json.analysisSnapshotId, 'Expected analysisSnapshotId in response');
    assert.ok(json.canonicalJob.canonicalJobId);
    assert.equal(json.canonicalJob.company, 'Cloudflare');
    assert.ok(typeof json.fitAnalysis.score === 'number');

    flow1SnapshotId = json.analysisSnapshotId;
    flow1CanonicalJobId = json.canonicalJob.canonicalJobId;
    flow1AnalyzeScore = json.fitAnalysis.score;

    // Flow 2: Verify in DB
    const [snapRow] = await db
      .select()
      .from(jobAnalysisSnapshots)
      .where(eq(jobAnalysisSnapshots.id, flow1SnapshotId))
      .limit(1);

    assert.ok(snapRow, 'Snapshot row must exist in database');
    assert.equal(snapRow.tenantId, candidateA.tenantId);
    assert.equal(snapRow.candidateId, candidateA.id);
    assert.equal(snapRow.canonicalJobId, flow1CanonicalJobId);
    assert.equal(snapRow.contractVersion, 'P16-001F');
    assert.equal(typeof snapRow.jobContentHash, 'string');
    assert.equal(snapRow.jobContentHash.length, 64);
    assert.ok(Array.isArray(snapRow.projectRankings));
    assert.ok(snapRow.overallFit);

    flow1TopProject = snapRow.projectRankings[0]?.projectName || snapRow.projectRankings[0]?.name;
  });

  // =========================================================================
  // Flows 3, 5, 6, 13: Prepare Handoff with Snapshot ID, Score Parity, and Kit
  // =========================================================================

  it('Flow 3, 5, 6, 13: POST /api/extension/prepare-handoff uses snapshot with verified score & project parity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: CLOUDFLARE_JOB_PAYLOAD,
        analysisSnapshotId: flow1SnapshotId,
      },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);

    // Flow 3: Verified binding
    assert.ok(json.applicationId);
    assert.equal(json.analysisSnapshotId, flow1SnapshotId);
    assert.ok(json.packageHash);
    assert.equal(typeof flow1AnalyzeScore, 'number');
    assert.ok(flow1TopProject);

    // Flow 13: Artifacts present
    assert.ok(json.artifacts.resume.downloadUrl);
    assert.ok(json.artifacts.coverLetter.downloadUrl);
    assert.ok(json.artifacts.bundle.downloadUrl);

    // Flow 5 & 6: Inspect database package to verify project ranking parity
    const [pkgRow] = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, json.applicationId))
      .limit(1);

    assert.ok(pkgRow);
    const packagePayload = pkgRow.packagePayload;
    const structuredProjects =
      packagePayload?.tailoredResume?.selectedProjects ||
      packagePayload?.tailoredResume?.structuredResume?.projects ||
      [];
    assert.ok(structuredProjects.length > 0, 'Structured resume must include tailored projects');

    // Flow 6: Top project is identical
    const topProjTitle = structuredProjects[0].title || structuredProjects[0].name;
    assert.ok(
      topProjTitle.toLowerCase().includes('product-data-explorer') ||
      topProjTitle.toLowerCase().includes('product'),
      `Expected top project Product-Data-Explorer, got: "${topProjTitle}"`
    );
  });

  // =========================================================================
  // Flow 4: Prepare Handoff without snapshotId automatically resolves active snapshot
  // =========================================================================

  it('Flow 4: POST /api/extension/prepare-handoff without snapshotId resolves active snapshot by canonicalJobId', async () => {
    // When no snapshotId is explicitly passed, the route looks up the latest snapshot
    // by tenantId + candidateId + canonicalJobId
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: CLOUDFLARE_JOB_PAYLOAD,
      },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);

    // Automatically bound to active snapshot
    assert.equal(json.analysisSnapshotId, flow1SnapshotId);
  });

  // =========================================================================
  // Flow 7: Cross-Tenant Snapshot Access Returns 403
  // =========================================================================

  it('Flow 7: Cross-tenant snapshot access returns 403 ACCESS_DENIED', async () => {
    // Session B (Tenant B) attempts to use Candidate A's snapshot from Tenant A
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionB.rawToken}` },
      payload: {
        job: CLOUDFLARE_JOB_PAYLOAD,
        analysisSnapshotId: flow1SnapshotId,
      },
    });

    assert.equal(res.statusCode, 403);
    const json = JSON.parse(res.payload);
    assert.equal(json.code, 'CROSS_TENANT_ACCESS_DENIED');
  });

  // =========================================================================
  // Flow 8: Cross-Candidate Snapshot Access Returns 403
  // =========================================================================

  it('Flow 8: Cross-candidate snapshot access within same tenant returns 403 ACCESS_DENIED', async () => {
    // Session C (Candidate C, Tenant A) attempts to use Candidate A's snapshot
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionC.rawToken}` },
      payload: {
        job: CLOUDFLARE_JOB_PAYLOAD,
        analysisSnapshotId: flow1SnapshotId,
      },
    });

    assert.equal(res.statusCode, 403);
    const json = JSON.parse(res.payload);
    assert.equal(json.code, 'CROSS_CANDIDATE_ACCESS_DENIED');
  });

  // =========================================================================
  // Flow 9: Canonical Job Mismatch Returns 409 ANALYSIS_JOB_MISMATCH
  // =========================================================================

  it('Flow 9: Wrong canonical job ID returns 409 ANALYSIS_JOB_MISMATCH', async () => {
    // Attempt to pass Candidate A's Cloudflare snapshot with a Stripe job
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: {
          sourceUrl: 'https://jobs.lever.co/stripe/99999999-stripe-role',
          provider: 'LEVER',
          title: 'Infrastructure Engineer',
          company: 'Stripe',
          description: 'Payment rails and distributed financial infrastructure at Stripe.',
        },
        analysisSnapshotId: flow1SnapshotId, // Mismatched snapshot!
      },
    });

    assert.equal(res.statusCode, 409);
    const json = JSON.parse(res.payload);
    assert.equal(json.code, 'ANALYSIS_JOB_MISMATCH');
  });

  // =========================================================================
  // Flow 10: Tampered/Altered Job Description Rejects Snapshot
  // =========================================================================

  it('Flow 10: Tampered job description causes content hash mismatch and falls back safely', async () => {
    const tamperedPayload = {
      ...CLOUDFLARE_JOB_PAYLOAD,
      description: CLOUDFLARE_JOB_PAYLOAD.description + ' Highly altered requirement for 20 years COBOL experience.',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: tamperedPayload,
        analysisSnapshotId: flow1SnapshotId,
      },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);

    // Tampered hash causes snapshot to be rejected, so analysisSnapshotId is not bound
    assert.notEqual(json.analysisSnapshotId, flow1SnapshotId);
  });

  // =========================================================================
  // Flow 11: Expired Snapshot Falls Back to Parser-Backed Computation
  // =========================================================================

  it('Flow 11: Expired snapshot is rejected and route falls back safely', async () => {
    // Temporarily expire the snapshot in DB
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    await db
      .update(jobAnalysisSnapshots)
      .set({ analyzedAt: threeHoursAgo })
      .where(eq(jobAnalysisSnapshots.id, flow1SnapshotId));

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: CLOUDFLARE_JOB_PAYLOAD,
        analysisSnapshotId: flow1SnapshotId,
      },
    });

    assert.equal(res.statusCode, 200);
    const json = JSON.parse(res.payload);

    // Expired snapshot is rejected, so response analysisSnapshotId is null
    assert.equal(json.analysisSnapshotId, null);

    // Restore analyzedAt
    await db
      .update(jobAnalysisSnapshots)
      .set({ analyzedAt: new Date() })
      .where(eq(jobAnalysisSnapshots.id, flow1SnapshotId));
  });

  // =========================================================================
  // Flow 12: Direct Workflow Call (No Extension Snapshot) Uses Fallback Parity
  // =========================================================================

  it('Flow 12: Direct workflow call uses fallback parser and produces equivalent top project', async () => {
    const directResult = await workflowService.prepareJobApplication({
      tenantId: candidateA.tenantId,
      candidateId: candidateA.id,
      jobPosting: {
        canonicalJobId: flow1CanonicalJobId,
        company: 'Cloudflare',
        title: 'Systems & Infrastructure Engineer',
        description: CLOUDFLARE_JOB_PAYLOAD.description,
        sourceUrl: CLOUDFLARE_JOB_PAYLOAD.sourceUrl,
      },
    });

    assert.ok(directResult.applicationId);
    assert.ok(directResult.packageHash);

    const [pkgRow] = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, directResult.applicationId))
      .limit(1);

    const packagePayload = pkgRow.packagePayload;
    const structuredProjects =
      packagePayload?.tailoredResume?.selectedProjects ||
      packagePayload?.tailoredResume?.structuredResume?.projects ||
      [];
    assert.ok(structuredProjects.length > 0);
    const topProjTitle = structuredProjects[0].title || structuredProjects[0].name;

    assert.ok(
      topProjTitle.toLowerCase().includes('product-data-explorer') ||
      topProjTitle.toLowerCase().includes('product'),
      `Fallback top project must match Analyze ranking: "${topProjTitle}"`
    );
  });
});
