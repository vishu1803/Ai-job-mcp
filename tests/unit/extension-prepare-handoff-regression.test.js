/**
 * @file Regression Test: Extension Prepare-Handoff (Defect 2 Regression)
 *
 * Verifies that POST /api/extension/prepare-handoff:
 * 1. Authenticated candidate can call prepare-handoff
 * 2. Authoritative snapshot remains bound
 * 3. Canonical job remains bound
 * 4. Profile data is available
 * 5. No ReferenceError / profileView is not defined
 * 6. Response is not HTTP 500 (returns HTTP 200)
 * 7. Existing handoff schema remains valid
 * 8. Candidate source-of-truth remains unchanged
 * 9. Unauthorized candidate cannot access another candidate's handoff data (403 ACCESS_DENIED)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  skills,
  candidateSkills,
  jobAnalysisSnapshots,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';
import { computeJobContentHash } from '../../src/domain/career/analysis-snapshot.schemas.js';
import { deriveCanonicalJobId } from '../../src/utils/url-normalizer.js';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';

const TEST_JOB = {
  sourceUrl: 'https://boards.greenhouse.io/crunchyroll/jobs/9999999',
  provider: 'GREENHOUSE',
  title: 'Software Engineer, Service Monetization',
  company: 'Crunchyroll',
  location: 'Remote',
  workplace: 'REMOTE',
  employmentType: 'FULL_TIME',
  description:
    'Build scalable services with Python, Node.js, TypeScript, PostgreSQL, and AWS. Design REST APIs and distributed systems with operational excellence.',
};

describe('Extension Prepare-Handoff Regression & Scope Verification (Defect 2)', () => {
  let app;
  const createdTenantIds = [];

  let tenantAId;
  let userA;
  let candidateA;
  let sessionA;

  let userB;
  let candidateB;
  let sessionB;

  let workflowService;
  let trackingService;
  let snapshotService;

  let boundSnapshotId;
  let initialCandidateProfileMetadata;

  before(async () => {
    workflowService = new JobApplicationWorkflowService({ database: db });
    // Fast mock for LaTeX compiler
    workflowService.applicationHandoffService.latexCompilerService = {
      compileDocument: async () => ({
        success: true,
        compilerUsed: 'mock-tectonic',
        pdfBuffer: Buffer.from('%PDF-1.5 mock pdf for testing'),
        texContent: '% mock tex',
      }),
    };
    defaultAiResumeContentGenerator.generateResumeAiContent = async () => ({
      success: true,
      summary: 'Experienced software engineer specializing in Python, AWS, and distributed systems.',
      projectBullets: {
        all: [
          'Engineered resilient task processing workers using Python and AWS.',
          'Integrated PostgreSQL persistence with transactional outbox pattern.',
          'Reduced message dispatch latency by 45% under high concurrency.',
        ],
      },
    });
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

    // 1. Create Tenant A
    tenantAId = crypto.randomUUID();
    createdTenantIds.push(tenantAId);
    await db.insert(tenants).values({
      id: tenantAId,
      name: 'Handoff Regression Tenant',
      slug: `handoff-reg-${Date.now()}`,
      tier: 'PRO',
    });

    // 2. Candidate A (Owner)
    const userAId = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userAId,
        tenantId: tenantAId,
        email: `cand-a-${Date.now()}@example.test`,
        displayName: 'Alice Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateAId = crypto.randomUUID();
    const projA1 = crypto.randomUUID();

    initialCandidateProfileMetadata = {
      phone: '+91 7905087928',
      countryCode: '+91',
      phoneNumber: '7905087928',
      userCustom: {
        phone: '+91 7905087928',
        countryCode: '+91',
        phoneNumber: '7905087928',
      },
      headline: 'Software Engineer',
      projects: [
        {
          id: projA1,
          name: 'Distributed Task Queue',
          description: 'Distributed streaming and background processing engine in Python.',
          technologies: ['Python', 'AWS', 'PostgreSQL'],
          highlights: [
            'Engineered resilient task processing workers using Python and AWS.',
            'Integrated PostgreSQL persistence with transactional outbox pattern.',
            'Reduced message dispatch latency by 45% under high concurrency.',
          ],
        },
      ],
      experience: [
        {
          company: 'Acme Corp',
          role: 'Backend Engineer',
          startDate: '2023-01',
          highlights: ['Built distributed backend services with Python and AWS.'],
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'Bachelor of Science in Computer Science',
          year: '2023',
        },
      ],
    };

    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateAId,
        tenantId: tenantAId,
        userId: userAId,
        displayName: 'Alice Candidate',
        canonicalEmail: userA.email,
        status: 'ACTIVE',
        profileMetadata: initialCandidateProfileMetadata,
      })
      .returning();

    // Add skills & projects for Candidate A
    let [skillRow] = await db.select().from(skills).where(eq(skills.slug, 'python')).limit(1);
    if (!skillRow) {
      const skillId = crypto.randomUUID();
      [skillRow] = await db
        .insert(skills)
        .values({
          id: skillId,
          name: 'Python',
          slug: 'python',
          category: 'LANGUAGE',
        })
        .returning();
    }
    const skillA1 = skillRow.id;
    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: tenantAId,
      candidateId: candidateAId,
      skillId: skillA1,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      firstObservedAt: new Date(),
      lastObservedAt: new Date(),
    });

    await db.insert(projects).values({
      id: projA1,
      tenantId: tenantAId,
      candidateId: candidateAId,
      name: 'Distributed Task Queue',
      slug: 'distributed-task-queue',
      description: 'Distributed streaming and background processing engine in Python.',
      technologies: ['Python', 'AWS', 'PostgreSQL'],
      pinned: true,
      metadata: {
        highlights: [
          'Engineered resilient task processing workers using Python and AWS.',
          'Integrated PostgreSQL persistence with transactional outbox pattern.',
          'Reduced message dispatch latency by 45% under high concurrency.',
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    sessionA = await createSession(db, {
      tenantId: tenantAId,
      userId: userAId,
      role: 'MEMBER',
      scopes: ['*'],
      deviceId: 'ext-device-a',
    });

    // 3. Candidate B (Unauthorized Third Party in same tenant)
    const userBId = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userBId,
        tenantId: tenantAId,
        email: `cand-b-${Date.now()}@example.test`,
        displayName: 'Bob Unauthorized',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateBId = crypto.randomUUID();
    [candidateB] = await db
      .insert(candidates)
      .values({
        id: candidateBId,
        tenantId: tenantAId,
        userId: userBId,
        displayName: 'Bob Unauthorized',
        canonicalEmail: userB.email,
        status: 'ACTIVE',
        profileMetadata: {},
      })
      .returning();

    sessionB = await createSession(db, {
      tenantId: tenantAId,
      userId: userBId,
      role: 'MEMBER',
      scopes: ['*'],
      deviceId: 'ext-device-b',
    });

    // 4. Create an authoritative analysis snapshot for Candidate A
    const jobContentHash = computeJobContentHash(TEST_JOB);
    const canonicalJobId = deriveCanonicalJobId({
      jobUrl: TEST_JOB.sourceUrl,
      provider: TEST_JOB.provider,
      company: TEST_JOB.company,
      title: TEST_JOB.title,
    });
    const snap = await snapshotService.saveSnapshot({
      tenantId: tenantAId,
      candidateId: candidateAId,
      canonicalJobId,
      jobContentHash,
      overallFit: {
        score: 88,
        confidence: 0.9,
        classification: 'STRONG_MATCH',
      },
      projectRankings: [
        {
          projectId: projA1,
          projectName: 'Distributed Task Queue',
          score: 92,
          rank: 1,
        },
      ],
      matchAnalysis: {
        skillGaps: [],
      },
      parsedJobDescription: {
        title: TEST_JOB.title,
        company: TEST_JOB.company,
      },
    });
    boundSnapshotId = snap.id;
  });

  after(async () => {
    if (app) await app.close();
    if (createdTenantIds.length > 0) {
      await db.delete(jobAnalysisSnapshots).where(eq(jobAnalysisSnapshots.tenantId, tenantAId));
      await db.delete(applicationPackages).where(eq(applicationPackages.tenantId, tenantAId));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tenantAId));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tenantAId));
      await db.delete(projects).where(eq(projects.tenantId, tenantAId));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantAId));
      await db.delete(users).where(eq(users.tenantId, tenantAId));
      await db.delete(tenants).where(eq(tenants.id, tenantAId));
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // Test 1: Authenticated Candidate Prepare-Handoff Success & Scope Verification
  // ---------------------------------------------------------------------------
  it('1-7. Authenticated candidate calls prepare-handoff: binds snapshot, resolves profile without ReferenceError, returns HTTP 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionA.rawToken}` },
      payload: {
        job: TEST_JOB,
        analysisSnapshotId: boundSnapshotId,
      },
    });

    // Verify no HTTP 500
    assert.equal(res.statusCode, 200, `Expected HTTP 200, got ${res.statusCode}: ${res.payload}`);
    const json = JSON.parse(res.payload);

    // 1. Authoritative snapshot remains bound
    assert.equal(json.analysisSnapshotId, boundSnapshotId, 'Snapshot ID must remain bound');

    // 2. Canonical job remains bound
    assert.ok(json.canonicalJobId, 'Canonical job ID must be present');

    // 3. Application ID & Package Hash generated
    assert.ok(json.applicationId, 'Application ID must be generated');
    assert.ok(json.packageHash, 'Package hash must be generated');

    // 4. Existing handoff schema remains valid
    assert.equal(json.packageStatus, 'SAVED');
    assert.equal(json.artifactStatus, 'READY');
    assert.ok(json.artifacts?.resume?.downloadUrl, 'Resume download URL must exist');
    assert.ok(json.artifacts?.coverLetter?.downloadUrl, 'Cover letter download URL must exist');
    assert.ok(json.artifacts?.bundle?.downloadUrl, 'Bundle download URL must exist');

    // 5. Inspect database package: profile data (phone, email, name) is correctly bound
    const [pkgRow] = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, json.applicationId))
      .limit(1);

    assert.ok(pkgRow, 'Application package row must exist in DB');
    const pkgPayload = pkgRow.packagePayload;
    assert.equal(pkgPayload.candidateId, candidateA.id);
    assert.equal(pkgPayload.candidateEmail, userA.email);
    assert.equal(pkgPayload.candidatePhone, '+91 7905087928', 'Candidate phone from profile must be preserved');
  });

  // ---------------------------------------------------------------------------
  // Test 8: Candidate Source-of-Truth Immutability
  // ---------------------------------------------------------------------------
  it('8. Candidate source-of-truth remains completely unchanged in database', async () => {
    const [candRow] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateA.id))
      .limit(1);

    assert.ok(candRow, 'Candidate row must exist');
    assert.deepEqual(
      candRow.profileMetadata,
      initialCandidateProfileMetadata,
      'Candidate profileMetadata must NOT be mutated by prepare-handoff'
    );
  });

  // ---------------------------------------------------------------------------
  // Test 9: Candidate Isolation Check (Unauthorized Cross-Candidate Access)
  // ---------------------------------------------------------------------------
  it('9. Unauthorized candidate cannot access another candidate snapshot (returns 403)', async () => {
    // Session B (Bob) attempts to call prepare-handoff referencing Alice's snapshot
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: { authorization: `Bearer ${sessionB.rawToken}` },
      payload: {
        job: TEST_JOB,
        analysisSnapshotId: boundSnapshotId,
      },
    });

    assert.equal(res.statusCode, 403, 'Cross-candidate access must return HTTP 403');
    const json = JSON.parse(res.payload);
    assert.equal(json.code, 'CROSS_CANDIDATE_ACCESS_DENIED');
  });
});
