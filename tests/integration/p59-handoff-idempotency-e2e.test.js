/**
 * @file P59: Handoff Idempotency & Session Verification Integration Tests.
 *
 * Verifies with real database fixtures and live Fastify app:
 * 1. Canonical /api/extension/session strictly reflects unauthenticated vs authenticated states.
 * 2. Calling /api/extension/prepare-handoff creates an initial canonical application package.
 * 3. Subsequent calls to /api/extension/prepare-handoff with the same applicationId reuse the
 *    existing application package (IDEMPOTENCY PROVEN — zero duplicate applications created).
 * 4. Expired/revoked session via /auth/logout immediately transitions session to NOT_AUTHENTICATED.
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
  projects,
  jobApplications,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('P59: Handoff Idempotency & Session Verification Integration Suite', () => {
  let app;
  const createdTenantIds = [];
  let tenant;
  let user;
  let candidate;
  let session;
  let sessionCookie;
  let project1;

  const testJob = {
    sourceUrl: 'https://www.linkedin.com/jobs/view/1122334455/',
    title: 'Staff Distributed Systems Engineer',
    company: 'Nexus Cloud Platforms',
    location: 'Remote, US',
    employmentType: 'FULL_TIME',
    workplace: 'REMOTE',
    provider: 'LINKEDIN',
    externalJobId: '1122334455',
    description: `Nexus Cloud Platforms is hiring a Staff Distributed Systems Engineer.
Requirements:
- 5+ years of experience with Node.js, TypeScript, and Docker
- Deep expertise in Redis and distributed queuing architecture
- Experience with PostgreSQL and high-throughput microservices`,
    requirements: [
      '5+ years of experience with Node.js, TypeScript, and Docker',
      'Deep expertise in Redis and distributed queuing architecture',
      'Experience with PostgreSQL and high-throughput microservices',
    ],
  };

  before(async () => {
    app = buildApp({ db });
    await app.ready();

    // 1. Seed tenant, user, candidate
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    [tenant] = await db.insert(tenants).values({
      id: tenantId,
      name: 'P59 Idempotency Org',
      slug: `p59-org-${Date.now()}`,
    }).returning();

    const userId = crypto.randomUUID();
    [user] = await db.insert(users).values({
      id: userId,
      tenantId: tenant.id,
      email: `p59-user-${Date.now()}@example.test`,
      displayName: 'Morgan Systems Architect',
      role: 'MEMBER',
      status: 'ACTIVE',
    }).returning();

    const candidateId = crypto.randomUUID();
    [candidate] = await db.insert(candidates).values({
      id: candidateId,
      tenantId: tenant.id,
      userId: user.id,
      displayName: 'Morgan Systems Architect',
      canonicalEmail: user.email,
      status: 'ACTIVE',
      profileMetadata: {
        userCustom: {},
        systemInferred: { onboardingState: 'COMPLETED' },
        resumeData: {
          identity: { fullName: 'Morgan Systems Architect', email: user.email },
          skills: ['Node.js', 'Docker', 'Redis', 'PostgreSQL', 'TypeScript'],
          projects: [
            {
              title: 'High-Throughput-Message-Broker',
              slug: 'message-broker',
              description: 'Distributed streaming message broker handling millions of events/sec',
              skills: ['Node.js', 'Redis', 'Docker'],
              bullets: [
                'Designed streaming message broker architecture using Node.js and Redis clustering',
                'Orchestrated multi-region container deployments with Docker',
              ],
            },
          ],
        },
      },
    }).returning();

    // 2. Seed verified portfolio project
    [project1] = await db.insert(projects).values({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      candidateId: candidate.id,
      name: 'High-Throughput-Message-Broker',
      slug: 'message-broker',
      projectType: 'SERVICE',
      provenanceStatus: 'VERIFIED',
      verificationStatus: 'VERIFIED',
      metadata: {
        skills: ['Node.js', 'Redis', 'Docker', 'PostgreSQL'],
        languages: ['TypeScript', 'JavaScript'],
        frameworks: ['Node.js'],
        databases: ['Redis', 'PostgreSQL'],
      },
    }).returning();

    // 3. Create active session
    session = await createSession(db, {
      userId: user.id,
      tenantId: tenant.id,
      userAgent: 'P59-Integration-Test-Agent',
      ipAddress: '127.0.0.1',
    });
    sessionCookie = `career_hub_session=${session.rawToken}`;
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(jobApplications).where(inArray(jobApplications.tenantId, createdTenantIds));
      await db.delete(projects).where(inArray(projects.tenantId, createdTenantIds));
      await db.delete(candidates).where(inArray(candidates.tenantId, createdTenantIds));
      await db.delete(users).where(inArray(users.tenantId, createdTenantIds));
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    await app.close();
    await closeDatabase();
  });

  it('1. GET /api/extension/session strictly reflects unauthenticated vs authenticated states', async () => {
    // Unauthenticated request
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
    });
    assert.strictEqual(unauthRes.statusCode, 200);
    const unauthData = JSON.parse(unauthRes.payload);
    assert.strictEqual(unauthData.authenticated, false);
    assert.strictEqual(unauthData.status, 'NOT_AUTHENTICATED');

    // Authenticated request
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
      headers: { cookie: sessionCookie },
    });
    assert.strictEqual(authRes.statusCode, 200);
    const authData = JSON.parse(authRes.payload);
    assert.strictEqual(authData.authenticated, true);
    assert.strictEqual(authData.status, 'AUTHENTICATED');
    assert.strictEqual(authData.candidate.displayName, 'Morgan Systems Architect');
  });

  it('2. POST /api/extension/prepare-handoff creates an initial canonical application package', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: {
        cookie: sessionCookie,
        'Content-Type': 'application/json',
      },
      payload: {
        job: testJob,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const data = JSON.parse(res.payload);
    assert.ok(data.applicationId, 'Application ID must be generated');
    assert.ok(data.packageHash, 'Package hash must be generated');
    assert.strictEqual(data.packageStatus, 'SAVED');
    assert.ok(data.artifacts.resume.downloadUrl.includes(data.applicationId));
    assert.ok(data.artifacts.coverLetter.downloadUrl.includes(data.applicationId));
    assert.ok(data.artifacts.bundle.downloadUrl.includes(data.applicationId));

    // Verify exactly 1 application exists in the database
    const dbApps = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.tenantId, tenant.id));
    assert.strictEqual(dbApps.length, 1);
    assert.strictEqual(dbApps[0].id, data.applicationId);
  });

  it('3. Repeated calls to prepare-handoff with existing applicationId reuse application and create ZERO duplicates (IDEMPOTENCY PROVEN)', async () => {
    // Get current application from database
    const initialApps = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.tenantId, tenant.id));
    assert.strictEqual(initialApps.length, 1);
    const existingAppId = initialApps[0].id;

    // Call prepare-handoff again with the existing applicationId
    const secondRes = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: {
        cookie: sessionCookie,
        'Content-Type': 'application/json',
      },
      payload: {
        job: testJob,
        applicationId: existingAppId,
      },
    });

    assert.strictEqual(secondRes.statusCode, 200);
    const secondData = JSON.parse(secondRes.payload);
    assert.strictEqual(secondData.applicationId, existingAppId, 'Must reuse the exact same application ID!');

    // Call prepare-handoff a third time (e.g. sidebar reload or second user click)
    const thirdRes = await app.inject({
      method: 'POST',
      url: '/api/extension/prepare-handoff',
      headers: {
        cookie: sessionCookie,
        'Content-Type': 'application/json',
      },
      payload: {
        job: testJob,
        applicationId: existingAppId,
      },
    });

    assert.strictEqual(thirdRes.statusCode, 200);
    const thirdData = JSON.parse(thirdRes.payload);
    assert.strictEqual(thirdData.applicationId, existingAppId);

    // Verify STILL exactly 1 application exists in the database!
    const finalApps = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.tenantId, tenant.id));
    assert.strictEqual(finalApps.length, 1, 'Idempotency invariant: zero duplicate applications created');
  });

  it('4. POST /auth/logout revokes session, causing session endpoint to report NOT_AUTHENTICATED', async () => {
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: sessionCookie },
    });
    assert.strictEqual(logoutRes.statusCode, 200);

    // Verification that the session is now invalid
    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/extension/session',
      headers: { cookie: sessionCookie },
    });
    const checkData = JSON.parse(checkRes.payload);
    assert.strictEqual(checkData.authenticated, false);
    assert.strictEqual(checkData.status, 'NOT_AUTHENTICATED');
  });
});
