/**
 * @file Integration Tests: Application Handoff Kit Routes & Artifact Security
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  users,
  tenants,
  candidates,
  jobApplications,
  tailoredDocuments,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { eq } from 'drizzle-orm';

describe('Integration: Application Handoff Kit Web & API Routes', () => {
  let app;
  let tenant1;
  let user1;
  let candidate1;
  let tenant2;
  let user2;
  let candidate2;
  let testApp1;
  let sessionCookie1;
  let sessionCookie2;

  before(async () => {
    app = await buildApp();

    // 1. Create Tenant 1 + User 1 + Candidate 1
    const runId = crypto.randomUUID().slice(0, 8);
    [tenant1] = await db
      .insert(tenants)
      .values({ name: 'Handoff Test Tenant 1', slug: `handoff-t1-${runId}` })
      .returning();

    [user1] = await db
      .insert(users)
      .values({
        tenantId: tenant1.id,
        email: 'vishwanatnishad@gmail.com',
        displayName: 'Vishwanath Nishad',
        role: 'MEMBER',
      })
      .returning();

    [candidate1] = await db
      .insert(candidates)
      .values({
        tenantId: tenant1.id,
        userId: user1.id,
        displayName: 'Vishwanath Nishad',
        canonicalEmail: 'vishwanatnishad@gmail.com',
        profileMetadata: {
          identity: { phone: '+1-415-555-0199' },
          contact: { phone: '+1-415-555-0199', links: [] },
          readiness: { workAuthorization: 'Authorized in US', visaSponsorshipRequired: false },
        },
      })
      .returning();

    // 2. Create Tenant 2 + User 2 + Candidate 2 (for tenant isolation test)
    [tenant2] = await db
      .insert(tenants)
      .values({ name: 'Handoff Test Tenant 2', slug: `handoff-t2-${runId}` })
      .returning();

    [user2] = await db
      .insert(users)
      .values({
        tenantId: tenant2.id,
        email: 'attacker@tenant2.com',
        displayName: 'Attacker User',
        role: 'MEMBER',
      })
      .returning();

    [candidate2] = await db
      .insert(candidates)
      .values({
        tenantId: tenant2.id,
        userId: user2.id,
        displayName: 'Attacker Candidate',
        canonicalEmail: 'attacker@tenant2.com',
      })
      .returning();

    // 3. Create a test job application for Tenant 1
    [testApp1] = await db
      .insert(jobApplications)
      .values({
        tenantId: tenant1.id,
        candidateId: candidate1.id,
        companyName: 'Vercel',
        jobTitle: 'Staff Infrastructure Engineer',
        jobUrl: 'https://boards.greenhouse.io/vercel/jobs/5450849004',
        status: 'SAVED',
        notes: 'Integration test application',
        metadata: {
          externalSubmissionState: 'HANDOFF_READY',
          destinationUrl: 'https://boards.greenhouse.io/vercel/jobs/5450849004',
        },
      })
      .returning();

    // 4. Session cookies
    const session1 = await createSession(db, { userId: user1.id, tenantId: tenant1.id });
    sessionCookie1 = `career_hub_session=${session1.rawToken}; Path=/; HttpOnly`;

    const session2 = await createSession(db, { userId: user2.id, tenantId: tenant2.id });
    sessionCookie2 = `career_hub_session=${session2.rawToken}; Path=/; HttpOnly`;
  });

  after(async () => {
    // Cleanup created records
    try {
      if (testApp1?.id) {
        await db.delete(tailoredDocuments).where(eq(tailoredDocuments.applicationId, testApp1.id));
        await db.delete(jobApplications).where(eq(jobApplications.id, testApp1.id));
      }
      if (candidate1?.id) await db.delete(candidates).where(eq(candidates.id, candidate1.id));
      if (candidate2?.id) await db.delete(candidates).where(eq(candidates.id, candidate2.id));
      if (user1?.id) await db.delete(users).where(eq(users.id, user1.id));
      if (user2?.id) await db.delete(users).where(eq(users.id, user2.id));
      if (tenant1?.id) await db.delete(tenants).where(eq(tenants.id, tenant1.id));
      if (tenant2?.id) await db.delete(tenants).where(eq(tenants.id, tenant2.id));
    } catch {
      // Ignore cleanup error
    }
    if (app) {
      await app.close();
    }
    await closeDatabase();
  });

  it('1. GET /applications/:id/handoff requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/applications/${testApp1.id}/handoff`,
    });

    assert.equal(res.statusCode, 302);
    assert.ok(res.headers.location.includes('/login'));
  });

  it('2. GET /applications/:id/handoff renders handoff workspace with Quality Audit and readiness items', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/applications/${testApp1.id}/handoff`,
      headers: { cookie: sessionCookie1 },
    });

    assert.equal(res.statusCode, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));

    const body = res.payload;
    assert.ok(body.includes('Vercel'));
    assert.ok(body.includes('Staff Infrastructure Engineer'));
    assert.ok(body.includes('HANDOFF_READY'));
    assert.ok(body.includes('Resume Quality Audit'));
    assert.ok(body.includes('Prepared for Manual Submission'));
    assert.ok(body.includes('Application Readiness Matrix'));
    assert.ok(body.includes('Open Employer Portal'));
    assert.ok(body.includes('View PDF'));
    assert.ok(body.includes('Download PDF'));

    const docs = await db
      .select()
      .from(tailoredDocuments)
      .where(eq(tailoredDocuments.applicationId, testApp1.id));
    assert.deepEqual(docs.map((doc) => doc.documentType).sort(), [
      'TAILORED_COVER_LETTER',
      'TAILORED_RESUME',
    ]);
    assert.ok(docs.every((doc) => doc.metadata?.artifact?.storageKey));
  });

  it('3. GET /api/applications/:id/artifacts/resume/view streams PDF inline with secure headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/applications/${testApp1.id}/artifacts/resume/view`,
      headers: { cookie: sessionCookie1 },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('inline'));
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy'].includes("default-src 'none'"));

    const magic = res.rawPayload.subarray(0, 5).toString('ascii');
    assert.equal(magic, '%PDF-');
  });

  it('4. GET /api/applications/:id/artifacts/cover-letter/download serves attachment disposition', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/applications/${testApp1.id}/artifacts/cover-letter/download`,
      headers: { cookie: sessionCookie1 },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    assert.ok(res.headers['content-disposition'].includes('tailored-cover-letter.pdf'));
  });

  it('5. Tenant Isolation: prevents Tenant 2 from viewing Tenant 1 artifacts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/applications/${testApp1.id}/artifacts/resume/view`,
      headers: { cookie: sessionCookie2 },
    });

    assert.equal(res.statusCode, 404);
  });
});
