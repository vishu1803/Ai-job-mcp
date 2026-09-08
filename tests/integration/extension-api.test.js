/**
 * @file Integration Tests for Extension Backend API Routes (P15-001).
 *
 * Verifies the authoritative backend API contract for the aicareershub browser extension:
 * 1. Session verification & Bearer token support
 * 2. Job analysis, canonicalization & ATS scoring
 * 3. Handoff kit preparation & idempotency
 * 4. Exact package validation & preview
 * 5. Resume, cover letter, and full ZIP bundle downloads with identity verification
 * 6. Submitted application protection & multi-tenant isolation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  resources,
  projects,
  candidateSkills,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';

describe('Extension Backend API Routes (P15-001)', () => {
  let app;
  const createdTenantIds = [];

  let userA;
  let candidateA;
  let sessionA;
  let sessionB;

  let workflowService;
  let trackingService;

  before(async () => {
    workflowService = new JobApplicationWorkflowService({ database: db });
    trackingService = new ApplicationTrackingService({ database: db });

    app = buildApp({
      db,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
    });
    await app.ready();

    // 1. Tenant A (Primary)
    const tenantAId = crypto.randomUUID();
    createdTenantIds.push(tenantAId);
    await db.insert(tenants).values({
      id: tenantAId,
      name: 'Extension Test Tenant A',
      slug: `ext-tenant-a-${Date.now()}`,
      tier: 'PRO',
    });

    const userAId = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userAId,
        tenantId: tenantAId,
        email: `ext-candidate-a-${Date.now()}@example.test`,
        displayName: 'Alice Engineer',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateAId = crypto.randomUUID();
    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateAId,
        tenantId: tenantAId,
        userId: userAId,
        displayName: 'Alice Engineer',
        canonicalEmail: userA.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Alice Engineer', email: userA.email, phone: '+1-555-0100' },
            skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Docker'],
          },
        },
      })
      .returning();

    sessionA = await createSession(db, { userId: userAId, tenantId: tenantAId });

    // Seed a verified project for Tenant A
    const resAId = crypto.randomUUID();
    await db.insert(resources).values({
      id: resAId,
      tenantId: tenantAId,
      provider: 'GITHUB_APP',
      resourceType: 'REPOSITORY',
      externalResourceId: 'ext-res-1',
      name: 'alice/task-runner',
      displayName: 'alice/task-runner',
      status: 'ACTIVE',
      metadata: {},
    });

    const projAId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projAId,
      tenantId: tenantAId,
      candidateId: candidateAId,
      name: 'Task Runner Service',
      slug: 'task-runner-service',
      portfolioStatus: 'FEATURED',
      technologies: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
      metadata: {},
    });

    // 2. Tenant B (Secondary for isolation checks)
    const tenantBId = crypto.randomUUID();
    createdTenantIds.push(tenantBId);
    await db.insert(tenants).values({
      id: tenantBId,
      name: 'Extension Test Tenant B',
      slug: `ext-tenant-b-${Date.now()}`,
      tier: 'FREE',
    });

    const userBId = crypto.randomUUID();
    const userBEmail = `ext-candidate-b-${Date.now()}@example.test`;
    await db.insert(users).values({
      id: userBId,
      tenantId: tenantBId,
      email: userBEmail,
      displayName: 'Bob Intruder',
      role: 'MEMBER',
      status: 'ACTIVE',
    });

    const candidateBId = crypto.randomUUID();
    await db.insert(candidates).values({
      id: candidateBId,
      tenantId: tenantBId,
      userId: userBId,
      displayName: 'Bob Intruder',
      canonicalEmail: userBEmail,
      status: 'ACTIVE',
      profileMetadata: {
        userCustom: {},
        systemInferred: { onboardingState: 'REGISTERED' },
      },
    });

    sessionB = await createSession(db, { userId: userBId, tenantId: tenantBId });
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
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
      /* ignore teardown error */
    }
  });

  describe('Session & Auth Endpoints', () => {
    it('1. returns NOT_AUTHENTICATED when no session is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/extension/session',
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.status, 'NOT_AUTHENTICATED');
      assert.equal(json.authenticated, false);
    });

    it('2. returns AUTHENTICATED when session cookie is present', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/extension/session',
        cookies: {
          career_hub_session: sessionA.rawToken,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.status, 'AUTHENTICATED');
      assert.equal(json.authenticated, true);
      assert.equal(json.user.id, userA.id);
      assert.equal(json.candidate.id, candidateA.id);
      assert.equal(json.candidate.isConnected, true);
    });

    it('3. returns AUTHENTICATED when Authorization Bearer token is used', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/extension/session',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.status, 'AUTHENTICATED');
      assert.equal(json.user.email, userA.email);
    });
  });

  describe('Job Analysis & Canonical Identity', () => {
    it('4. rejects unauthenticated job analysis with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/analyze-job',
        payload: {
          job: {
            title: 'Backend Engineer',
            company: 'Acme',
            description: 'TypeScript and Node.js developer needed.',
          },
        },
      });

      assert.equal(res.statusCode, 401);
    });

    it('5. analyzes job with canonical ID derivation and ATS fit evaluation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/analyze-job',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/acme/jobs/54321?gh_jid=54321&utm_source=linkedin',
            provider: 'GREENHOUSE',
            title: 'Senior Backend Engineer',
            company: 'Acme',
            location: 'San Francisco, CA',
            workplace: 'REMOTE',
            description:
              'Acme is looking for a Senior Backend Engineer. Requirements include 5+ years with Node.js, PostgreSQL, and Docker. Experience building REST APIs and microservices.',
          },
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);

      assert.ok(json.canonicalJob.canonicalJobId);
      assert.ok(json.canonicalJob.normalizedJobUrl);
      assert.ok(!json.canonicalJob.normalizedJobUrl.includes('utm_source'));
      assert.equal(json.canonicalJob.title, 'Senior Backend Engineer');
      assert.equal(json.canonicalJob.company, 'Acme');
      assert.equal(json.existingApplication, null);

      assert.ok(typeof json.fitAnalysis.score === 'number');
      assert.ok(json.fitAnalysis.grade);
      assert.ok(Array.isArray(json.fitAnalysis.matches));
    });
  });

  describe('Handoff Preparation, Validation, Preview & Downloads', () => {
    let preparedAppId;
    let preparedPackageHash;

    it('6. prepares handoff kit and returns complete telemetry and artifact links', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/acme/jobs/54321',
            provider: 'GREENHOUSE',
            title: 'Senior Backend Engineer',
            company: 'Acme',
            location: 'San Francisco, CA',
            workplace: 'REMOTE',
            description:
              'Acme is looking for a Senior Backend Engineer with Node.js, TypeScript, PostgreSQL, and Docker experience.',
          },
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);

      assert.ok(json.applicationId);
      assert.ok(json.packageHash);
      assert.equal(json.lifecycleAction, 'CREATED');
      assert.equal(json.packageVersion, 1);
      assert.ok(json.artifacts.resume.downloadUrl);
      assert.ok(json.artifacts.coverLetter.downloadUrl);
      assert.ok(json.artifacts.bundle.downloadUrl);

      preparedAppId = json.applicationId;
      preparedPackageHash = json.packageHash;
    });

    it('7. re-preparing the same job reuses the application idempotently (lifecycleAction: REUSED)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          job: {
            sourceUrl: 'https://boards.greenhouse.io/acme/jobs/54321',
            provider: 'GREENHOUSE',
            title: 'Senior Backend Engineer',
            company: 'Acme',
            description:
              'Acme is looking for a Senior Backend Engineer with Node.js, TypeScript, PostgreSQL, and Docker experience.',
          },
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);

      assert.equal(json.applicationId, preparedAppId);
      assert.equal(json.packageHash, preparedPackageHash);
      assert.equal(json.lifecycleAction, 'REUSED');
    });

    it('8. validates the exact prepared package', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/validate-package',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          applicationId: preparedAppId,
          packageHash: preparedPackageHash,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);

      assert.ok(json.overallStatus);
      assert.equal(json.packageHash, preparedPackageHash);
      assert.ok(Array.isArray(json.errors));
    });

    it('9. generates structured preview for the prepared package', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/preview-package',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          applicationId: preparedAppId,
          packageHash: preparedPackageHash,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);

      assert.equal(json.applicationId, preparedAppId);
      assert.ok(json.previewMarkdown);
    });

    it('10. downloads full Handoff Kit ZIP bundle with verified identity headers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${preparedAppId}/artifacts/bundle/download?packageHash=${preparedPackageHash}`,
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'application/zip');
      assert.equal(res.headers['x-package-hash'], preparedPackageHash);
      assert.equal(res.headers['x-application-id'], preparedAppId);
      assert.equal(res.headers['x-artifact-type'], 'bundle');

      // Verify ZIP magic header
      assert.equal(res.rawPayload[0], 0x50);
      assert.equal(res.rawPayload[1], 0x4b);
      assert.equal(res.rawPayload[2], 0x03);
      assert.equal(res.rawPayload[3], 0x04);
    });

    it('11. prevents Tenant B from downloading Tenant A artifacts (cross-tenant 404)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/applications/${preparedAppId}/artifacts/bundle/download?packageHash=${preparedPackageHash}`,
        headers: {
          authorization: `Bearer ${sessionB.rawToken}`,
        },
      });

      assert.equal(res.statusCode, 404);
    });

    it('12. protects submitted application against destructive mutations', async () => {
      // Transition application to APPLIED
      await db
        .update(jobApplications)
        .set({ status: 'APPLIED', appliedAt: new Date() })
        .where(eq(jobApplications.id, preparedAppId));

      // Attempt prepare on submitted application
      const res = await app.inject({
        method: 'POST',
        url: '/api/extension/prepare-handoff',
        headers: {
          authorization: `Bearer ${sessionA.rawToken}`,
        },
        payload: {
          applicationId: preparedAppId,
          job: {
            sourceUrl: 'https://boards.greenhouse.io/acme/jobs/54321',
            title: 'Senior Backend Engineer',
            company: 'Acme',
            description: 'New different description to force change',
          },
        },
      });

      assert.equal(res.statusCode, 409);
      const json = JSON.parse(res.payload);
      assert.equal(json.code, 'APPLICATION_ALREADY_SUBMITTED');
    });
  });

  after(async () => {
    if (app) await app.close();
    await closeDatabase();
  });
});

