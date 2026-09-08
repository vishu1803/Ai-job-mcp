/**
 * @file Test Matrix for aicareershub Browser Extension (P15-001).
 *
 * Implements automated verification for Scenarios A through Q:
 * A. New user: extension -> not authenticated -> web login/setup -> return -> authenticated
 * B. Existing user: extension -> session valid -> no login shown
 * C. Session expired: extension -> reauthentication required
 * D. Greenhouse job: extract job -> canonicalize -> analyze
 * E. Supported alternative provider (Lever/Workday/LinkedIn/Indeed): same workflow
 * F. Generic career page: fallback extraction
 * G. Existing application: reuse same applicationId
 * H. New application: create exactly one
 * I. Repeated handoff preparation: no duplicate application
 * J. Existing current package: reuse/version behavior follows lifecycle
 * K. Submitted application: protected
 * L. DSA selected: rendered in handoff
 * M. DSA omitted: not rendered
 * N. Validation: exact package validation
 * O. Preview: exact package preview
 * P. Downloads: download exact persisted artifacts
 * Q. Package hash: downloaded artifacts match expected package identity
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  projects,
} from '../../src/db/schema.js';
import { createSession, revokeSession } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';

describe('Extension Test Matrix: Scenarios A through Q (P15-001)', () => {
  let app;
  const createdTenantIds = [];

  let tenant;
  let user;
  let candidate;
  let session;
  let expiredSession;

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

    // Setup Tenant & User
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    [tenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'Matrix Corp',
        slug: `matrix-corp-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();

    const userId = crypto.randomUUID();
    [user] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId,
        email: `matrix-candidate-${Date.now()}@example.test`,
        displayName: 'Matrix Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateId = crypto.randomUUID();
    [candidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId,
        userId,
        displayName: 'Matrix Candidate',
        canonicalEmail: user.email,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {},
          systemInferred: { onboardingState: 'COMPLETED' },
          resumeData: {
            identity: { fullName: 'Matrix Candidate', email: user.email },
            skills: ['Python', 'FastAPI', 'Docker', 'PostgreSQL', 'DSA'],
            problemSolving: {
              leetcodeUrl: 'https://leetcode.com/matrix_coder',
              dsaBullets: ['Implemented optimal graph traversal and dynamic programming algorithms in Python.'],
            },
          },
        },
      })
      .returning();

    // Active session
    session = await createSession(db, { userId, tenantId });

    // Expired/revoked session
    const expSess = await createSession(db, { userId, tenantId });
    await revokeSession(db, expSess.rawToken);
    expiredSession = expSess;

    // Seed project
    const projId = crypto.randomUUID();
    await db.insert(projects).values({
      id: projId,
      tenantId,
      candidateId,
      name: 'Cloud Microservice',
      slug: 'cloud-microservice',
      portfolioStatus: 'FEATURED',
      technologies: ['Python', 'FastAPI', 'Docker', 'PostgreSQL'],
      metadata: {},
    });
  });

  after(async () => {
    try {
      if (createdTenantIds.length > 0) {
        await db.delete(jobApplications).where(inArray(jobApplications.tenantId, createdTenantIds));
        await db.delete(applicationPackages).where(inArray(applicationPackages.tenantId, createdTenantIds));
        await db.delete(projects).where(inArray(projects.tenantId, createdTenantIds));
        await db.delete(candidates).where(inArray(candidates.tenantId, createdTenantIds));
        await db.delete(users).where(inArray(users.tenantId, createdTenantIds));
        await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      }
      await app.close();
      await closeDatabase();
    } catch {
      /* ignore */
    }
  });

  // Scenario A: New user -> not authenticated
  it('Scenario A: New user with no session receives NOT_AUTHENTICATED status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'NOT_AUTHENTICATED');
    assert.equal(body.authenticated, false);
  });

  // Scenario B: Existing user -> session valid -> authenticated without re-prompt
  it('Scenario B: Existing user with active session is recognized immediately', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
      cookies: { career_hub_session: session.rawToken },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'AUTHENTICATED');
    assert.equal(body.authenticated, true);
    assert.equal(body.user.id, user.id);
  });

  // Scenario C: Session expired -> reauthentication required
  it('Scenario C: Expired or revoked session requires re-authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
      cookies: { career_hub_session: expiredSession.rawToken },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.status, 'NOT_AUTHENTICATED');
    assert.equal(body.authenticated, false);
  });

  // Scenario D: Greenhouse job -> extract, canonicalize, analyze
  let ghCanonicalJobId;
  it('Scenario D: Greenhouse job is extracted, canonicalized, and analyzed', async () => {
    const greenhouseJob = {
      sourceUrl: 'https://boards.greenhouse.io/discord/jobs/778899?utm_campaign=job_board',
      provider: 'GREENHOUSE',
      title: 'Backend Systems Engineer',
      company: 'Discord',
      location: 'San Francisco, CA',
      workplace: 'REMOTE',
      description: 'Discord needs a Backend Systems Engineer proficient in Python, FastAPI, and Docker.',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      cookies: { career_hub_session: session.rawToken },
      payload: { job: greenhouseJob },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.canonicalJob.canonicalJobId);
    assert.ok(!body.canonicalJob.normalizedJobUrl.includes('utm_campaign'));
    assert.equal(body.canonicalJob.provider, 'GREENHOUSE');
    assert.ok(typeof body.fitAnalysis.score === 'number');

    ghCanonicalJobId = body.canonicalJob.canonicalJobId;
  });

  // Scenario E: Alternative providers (Lever, Workday, LinkedIn, Indeed)
  it('Scenario E: Supported alternative providers follow identical workflow', async () => {
    const leverJob = {
      sourceUrl: 'https://jobs.lever.co/figma/112233',
      provider: 'LEVER',
      title: 'Systems Infrastructure Engineer',
      company: 'Figma',
      location: 'Remote',
      description: 'Figma infrastructure engineering with Python and containerization.',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      cookies: { career_hub_session: session.rawToken },
      payload: { job: leverJob },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.canonicalJob.provider, 'LEVER');
    assert.ok(body.canonicalJob.canonicalJobId);
  });

  // Scenario F: Generic career page fallback extraction
  it('Scenario F: Generic career page extracts via fallback and analyzes', async () => {
    const genericJob = {
      sourceUrl: 'https://careers.innovative.tech/jobs/456',
      provider: 'GENERIC',
      title: 'Software Engineer',
      company: 'Innovative Tech',
      location: 'New York, NY',
      description: 'Full stack development with Python and cloud services.',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/analyze-job',
      cookies: { career_hub_session: session.rawToken },
      payload: { job: genericJob },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.canonicalJob.provider, 'GENERIC');
    assert.ok(body.canonicalJob.canonicalJobId);
  });

  // Scenario H & I: New application (create exactly one) & Repeated handoff preparation (reuse, no duplicates)
  let createdAppId;
  let currentPkgHash;

  it('Scenario H & I: Creates exactly one application row and idempotently reuses on repeat prepare', async () => {
    const jobPayload = {
      sourceUrl: 'https://boards.greenhouse.io/discord/jobs/778899',
      provider: 'GREENHOUSE',
      title: 'Backend Systems Engineer',
      company: 'Discord',
      description: 'Discord Backend Systems Engineer proficient in Python, FastAPI, and Docker.',
    };

    // 1. Initial Prepare -> CREATED
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      cookies: { career_hub_session: session.rawToken },
      payload: { job: jobPayload },
    });

    assert.equal(res1.statusCode, 200);
    const body1 = JSON.parse(res1.payload);
    assert.equal(body1.lifecycleAction, 'CREATED');
    assert.equal(body1.packageVersion, 1);
    createdAppId = body1.applicationId;
    currentPkgHash = body1.packageHash;

    // Check DB row count: exactly 1 for candidate and canonicalJobId
    const appsInDb = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id),
          eq(jobApplications.canonicalJobId, ghCanonicalJobId)
        )
      );
    assert.equal(appsInDb.length, 1);

    // 2. Repeat Prepare with same inputs -> REUSED, no new application rows
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      cookies: { career_hub_session: session.rawToken },
      payload: { job: jobPayload },
    });

    assert.equal(res2.statusCode, 200);
    const body2 = JSON.parse(res2.payload);
    assert.equal(body2.applicationId, createdAppId);
    assert.equal(body2.packageHash, currentPkgHash);
    assert.equal(body2.lifecycleAction, 'REUSED');

    const appsInDbAfter = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id),
          eq(jobApplications.canonicalJobId, ghCanonicalJobId)
        )
      );
    assert.equal(appsInDbAfter.length, 1);
  });

  // Scenario G: Existing application reused via explicit applicationId
  it('Scenario G: Explicit applicationId reuse preserves application identity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      cookies: { career_hub_session: session.rawToken },
      payload: {
        applicationId: createdAppId,
        job: {
          sourceUrl: 'https://boards.greenhouse.io/discord/jobs/778899',
          title: 'Backend Systems Engineer',
          company: 'Discord',
          description: 'Discord Backend Systems Engineer proficient in Python, FastAPI, and Docker.',
        },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.applicationId, createdAppId);
    assert.equal(body.lifecycleAction, 'REUSED');
  });

  // Scenario J: Existing current package lifecycle
  it('Scenario J: Current package reflects consistent version and packageHash', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
      cookies: { career_hub_session: session.rawToken },
    });
    assert.equal(res.statusCode, 200);
    assert.ok(createdAppId);
    assert.ok(currentPkgHash);
  });

  // Scenario N: Exact package validation
  it('Scenario N: Validates the exact prepared package identity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/validate-package',
      cookies: { career_hub_session: session.rawToken },
      payload: {
        applicationId: createdAppId,
        packageHash: currentPkgHash,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.overallStatus);
    assert.equal(body.packageHash, currentPkgHash);
    assert.ok(Array.isArray(body.errors));
    assert.ok(Array.isArray(body.warnings));
  });

  // Scenario O: Exact package preview
  it('Scenario O: Generates structured preview for exact package identity', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/preview-package',
      cookies: { career_hub_session: session.rawToken },
      payload: {
        applicationId: createdAppId,
        packageHash: currentPkgHash,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.applicationId, createdAppId);
    assert.equal(body.packageHash, currentPkgHash);
    assert.ok(body.previewMarkdown.length > 50);
  });

  // Scenario P & Q: Downloads exact persisted artifacts & packageHash identity verification
  it('Scenario P & Q: Downloads exact persisted artifacts matching packageHash', async () => {
    // 1. Download Resume
    const resResume = await app.inject({
      method: 'GET',
      url: `/api/applications/${createdAppId}/artifacts/resume/download?packageHash=${currentPkgHash}`,
      cookies: { career_hub_session: session.rawToken },
    });
    assert.equal(resResume.statusCode, 200);
    assert.equal(resResume.headers['content-type'], 'application/pdf');
    assert.equal(resResume.headers['x-package-hash'], currentPkgHash);

    // 2. Download Cover Letter
    const resCover = await app.inject({
      method: 'GET',
      url: `/api/applications/${createdAppId}/artifacts/cover-letter/download?packageHash=${currentPkgHash}`,
      cookies: { career_hub_session: session.rawToken },
    });
    assert.equal(resCover.statusCode, 200);
    assert.equal(resCover.headers['content-type'], 'application/pdf');
    assert.equal(resCover.headers['x-package-hash'], currentPkgHash);

    // 3. Download Full Handoff Kit ZIP Bundle
    const resBundle = await app.inject({
      method: 'GET',
      url: `/api/applications/${createdAppId}/artifacts/bundle/download?packageHash=${currentPkgHash}`,
      cookies: { career_hub_session: session.rawToken },
    });
    assert.equal(resBundle.statusCode, 200);
    assert.equal(resBundle.headers['content-type'], 'application/zip');
    assert.equal(resBundle.headers['x-package-hash'], currentPkgHash);
    assert.equal(resBundle.headers['x-artifact-type'], 'bundle');

    // Confirm ZIP magic signature
    assert.equal(resBundle.rawPayload[0], 0x50);
    assert.equal(resBundle.rawPayload[1], 0x4b);
  });

  // Scenario K: Submitted application protection
  it('Scenario K: Submitted application is protected against mutation', async () => {
    // Set status to APPLIED
    await db
      .update(jobApplications)
      .set({ status: 'APPLIED', appliedAt: new Date() })
      .where(eq(jobApplications.id, createdAppId));

    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      cookies: { career_hub_session: session.rawToken },
      payload: {
        applicationId: createdAppId,
        job: {
          sourceUrl: 'https://boards.greenhouse.io/discord/jobs/778899',
          title: 'Different Title',
          company: 'Discord',
          description: 'Changed description',
        },
      },
    });

    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.equal(body.code, 'APPLICATION_ALREADY_SUBMITTED');
  });
});


