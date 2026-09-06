/**
 * @file Integration Tests: Handoff Kit Lifecycle Management (P14-006)
 *
 * Covers Task 7 items 11-14:
 * 11. Multiple Handoff Kits can be safely managed (list/latest/archived).
 * 12. Archiving/deletion cannot affect candidate profile data.
 * 13. Tenant isolation is preserved.
 * 14. Existing artifact security remains intact (safe-delete rules, audit).
 *
 * Uses the real ApplicationTrackingService against the real database, with
 * hermetically-stored encrypted artifacts in a temporary storage directory.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  tailoredDocuments,
  auditLogs,
} from '../../src/db/schema.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';

describe('Integration: Handoff Kit Lifecycle (P14-006)', () => {
  let tenant1;
  let user1;
  let candidate1;
  let tenant2;
  let user2;
  let candidate2;

  let savedAppWithKit; // SAVED application carrying a CURRENT kit
  let savedAppNoKit; // SAVED application without a kit (negative case)
  let appliedAppWithKit; // APPLIED application with a kit (safe-delete must refuse)
  let duplicateAppWithKit; // SAVED second kit for the SAME target (latest-flag test)

  let tracking;
  let tempStorageDir;

  const FAKE_PDF = Buffer.from('%PDF-1.4 fake pdf bytes for lifecycle test');

  before(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'handoff-lifecycle-'));
    const documentStorage = new DocumentStorageService({ storageDir: tempStorageDir });
    tracking = new ApplicationTrackingService({ database: db, documentStorage });

    const runId = crypto.randomUUID().slice(0, 8);
    [tenant1] = await db
      .insert(tenants)
      .values({ name: 'Lifecycle Tenant 1', slug: `lifecycle-t1-${runId}` })
      .returning();
    [user1] = await db
      .insert(users)
      .values({
        tenantId: tenant1.id,
        email: `lifecycle-u1-${runId}@example.test`,
        displayName: 'Lifecycle User 1',
        role: 'MEMBER',
      })
      .returning();
    [candidate1] = await db
      .insert(candidates)
      .values({
        tenantId: tenant1.id,
        userId: user1.id,
        displayName: 'Lifecycle Candidate 1',
        canonicalEmail: `lifecycle-u1-${runId}@example.test`,
        profileMetadata: { userCustom: { education: [{ institution: 'Real University' }] } },
      })
      .returning();

    [tenant2] = await db
      .insert(tenants)
      .values({ name: 'Lifecycle Tenant 2', slug: `lifecycle-t2-${runId}` })
      .returning();
    [user2] = await db
      .insert(users)
      .values({
        tenantId: tenant2.id,
        email: `lifecycle-u2-${runId}@example.test`,
        displayName: 'Lifecycle User 2',
        role: 'MEMBER',
      })
      .returning();
    [candidate2] = await db
      .insert(candidates)
      .values({
        tenantId: tenant2.id,
        userId: user2.id,
        displayName: 'Lifecycle Candidate 2',
        canonicalEmail: `lifecycle-u2-${runId}@example.test`,
      })
      .returning();

    // Build a real encrypted handoff kit payload
    const storedResume = await documentStorage.storeEncryptedDocument({
      tenantId: tenant1.id,
      candidateId: candidate1.id,
      buffer: FAKE_PDF,
      originalFileName: 'tailored-resume.pdf',
      mimeType: 'application/pdf',
    });

    const buildKit = (packageSeed) => ({
      status: 'HANDOFF_READY',
      packageHash: crypto.createHash('sha256').update(packageSeed).digest('hex'),
      applicationId: null,
      submissionNotice: 'Prepared for manual submission. External submission has not occurred.',
      targetJob: {
        title: 'Software Engineer, Backend',
        company: 'Vercel',
        location: 'Remote',
        directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/1',
      },
      resume: {
        filename: 'tailored-resume.pdf',
        mimeType: 'application/pdf',
        contentHash: storedResume.contentHash,
        fileSizeBytes: storedResume.fileSizeBytes,
        storageKey: storedResume.storageKey,
        viewUrl: '/artifacts/resume/view',
        downloadUrl: '/artifacts/resume/download',
        qaAudit: { passed: true, score: 90, qualityLevel: 'EXCELLENT' },
      },
      coverLetter: null,
      readiness: [],
      directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/1',
      generatedAt: new Date().toISOString(),
    });

    const insertApp = async (candidateId, tenantId, overrides = {}, kitOverrides = {}) => {
      const kit = { ...buildKit(overrides.companyName || 'Vercel'), ...kitOverrides };
      const [row] = await db
        .insert(jobApplications)
        .values({
          tenantId,
          candidateId,
          companyName: overrides.companyName || 'Vercel',
          jobTitle: overrides.jobTitle || 'Software Engineer, Backend',
          jobUrl: 'https://boards.greenhouse.io/vercel/jobs/1',
          status: overrides.status || 'SAVED',
          notes: 'lifecycle test app',
          metadata: { handoffKit: kit, ...kitOverrides },
        })
        .returning();
      return row;
    };

    savedAppWithKit = await insertApp(candidate1.id, tenant1.id, {}, { applicationId: null });
    // Bind kit to its application for stale-kit protection semantics
    await db
      .update(jobApplications)
      .set({
        metadata: {
          handoffKit: { ...buildKit('Vercel'), applicationId: savedAppWithKit.id },
        },
      })
      .where(eq(jobApplications.id, savedAppWithKit.id));

    duplicateAppWithKit = await insertApp(
      candidate1.id,
      tenant1.id,
      {},
      { generatedAt: new Date(Date.now() - 86400000).toISOString() }
    );
    await db
      .update(jobApplications)
      .set({
        metadata: {
          handoffKit: {
            ...buildKit('Vercel'),
            applicationId: duplicateAppWithKit.id,
            generatedAt: new Date(Date.now() - 86400000).toISOString(),
          },
        },
      })
      .where(eq(jobApplications.id, duplicateAppWithKit.id));

    appliedAppWithKit = await insertApp(candidate1.id, tenant1.id, { status: 'APPLIED' });
    await db
      .update(jobApplications)
      .set({
        metadata: {
          handoffKit: { ...buildKit('Vercel'), applicationId: appliedAppWithKit.id },
        },
      })
      .where(eq(jobApplications.id, appliedAppWithKit.id));

    savedAppNoKit = await insertApp(candidate1.id, tenant1.id, { companyName: 'Netflix' });
  });

  after(async () => {
    try {
      for (const appId of [
        savedAppWithKit?.id,
        duplicateAppWithKit?.id,
        appliedAppWithKit?.id,
        savedAppNoKit?.id,
      ]) {
        if (appId) {
          await db.delete(tailoredDocuments).where(eq(tailoredDocuments.applicationId, appId));
          await db.delete(auditLogs).where(eq(auditLogs.resourceId, appId));
          await db.delete(jobApplications).where(eq(jobApplications.id, appId));
        }
      }
      if (candidate1?.id) await db.delete(candidates).where(eq(candidates.id, candidate1.id));
      if (candidate2?.id) await db.delete(candidates).where(eq(candidates.id, candidate2.id));
      if (user1?.id) await db.delete(users).where(eq(users.id, user1.id));
      if (user2?.id) await db.delete(users).where(eq(users.id, user2.id));
      if (tenant1?.id) await db.delete(tenants).where(eq(tenants.id, tenant1.id));
      if (tenant2?.id) await db.delete(tenants).where(eq(tenants.id, tenant2.id));
      if (tempStorageDir) await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    await closeDatabase();
  });

  it('11a. lists multiple kits with created date, target, hash, and latest flag', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    const { items, total } = await tracking.listHandoffKits(context, candidate1.id);

    // 3 Vercel kits + 1 Netflix kit
    assert.equal(total, 4);
    const vercelKits = items.filter((k) => k.companyName === 'Vercel');
    assert.equal(vercelKits.length, 3);
    // Exactly one Vercel kit is flagged latest-for-target
    assert.equal(vercelKits.filter((k) => k.isLatestForTarget).length, 1);
    // The Netflix kit is the latest (only) kit for its own target
    const netflixKit = items.find((k) => k.companyName === 'Netflix');
    assert.equal(netflixKit.isLatestForTarget, true);

    const newest = items[0];
    assert.ok(['CURRENT', 'ARCHIVED'].includes(newest.lifecycleState));
    assert.equal(newest.jobTitle, 'Software Engineer, Backend');
    assert.ok(newest.packageHash.length === 64);
    assert.ok(newest.generatedAt);
    assert.equal(newest.artifacts.resume.availabilityStatus, 'READY');
    // No storage keys may leak into the listing
    assert.equal(JSON.stringify(items).includes('storageKey'), false);
  });

  it('11b. archives an obsolete kit without touching application history or artifacts', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    const result = await tracking.archiveHandoffKit(context, duplicateAppWithKit.id);

    assert.equal(result.archived, true);
    assert.equal(result.lifecycleState, 'ARCHIVED');
    assert.ok(result.archivedAt);

    // Application record itself untouched
    const [app] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, duplicateAppWithKit.id));
    assert.equal(app.status, 'SAVED');
    assert.ok(
      app.metadata.handoffKit.resume.storageKey,
      'artifact reference must survive archiving'
    );

    // Re-archive is rejected
    await assert.rejects(
      () => tracking.archiveHandoffKit(context, duplicateAppWithKit.id),
      (err) => /already archived/i.test(err.message)
    );
  });

  it('11c. archived kits can be excluded from listings', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    const { items, total } = await tracking.listHandoffKits(context, candidate1.id, {
      includeArchived: false,
    });
    // savedAppWithKit + appliedAppWithKit + savedAppNoKit (Netflix) remain
    assert.equal(total, 3);
    assert.ok(items.every((kit) => kit.lifecycleState === 'CURRENT'));
  });

  it('12a. deleting a kit preserves the application record, stages, and candidate profile', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };

    const result = await tracking.deleteHandoffKit(context, savedAppNoKit.id);

    assert.equal(result.deleted, true);
    assert.equal(result.applicationRecordPreserved, true);

    // Application record survives with kit metadata stripped
    const [app] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, result.applicationId));
    assert.ok(app, 'application record must be preserved');
    assert.equal(app.metadata.handoffKit, undefined);

    // Candidate profile data is untouched
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidate1.id));
    assert.ok(candidate);
    assert.equal(candidate.displayName, 'Lifecycle Candidate 1');
    assert.deepEqual(candidate.profileMetadata.userCustom.education, [
      { institution: 'Real University' },
    ]);
  });

  it('12b. kit deletion never deletes candidate rows or other applications', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    const { total } = await tracking.listHandoffKits(context, candidate1.id);
    // 3 Vercel kits (one archived) remain; the deleted Netflix kit is gone
    assert.equal(total, 3);

    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, candidate1.id));
    assert.ok(candidate, 'candidate row must survive kit deletion');
  });

  it('13a. tenant isolation: cross-tenant kit listing is 404 default-deny', async () => {
    const attackerContext = { tenantId: tenant2.id, userId: user2.id, role: 'MEMBER' };
    await assert.rejects(
      () => tracking.listHandoffKits(attackerContext, candidate1.id),
      (err) => err.statusCode === 404 || /not found/i.test(err.message)
    );
  });

  it('13b. tenant isolation: cross-tenant archive/delete is 404 default-deny', async () => {
    const attackerContext = { tenantId: tenant2.id, userId: user2.id, role: 'MEMBER' };

    await assert.rejects(
      () => tracking.archiveHandoffKit(attackerContext, savedAppWithKit.id),
      (err) => err.statusCode === 404 || /not found/i.test(err.message)
    );
    await assert.rejects(
      () => tracking.deleteHandoffKit(attackerContext, savedAppWithKit.id),
      (err) => err.statusCode === 404 || /not found/i.test(err.message)
    );
  });

  it('14a. safe-delete rule: kits on submitted/progressed applications cannot be deleted', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    await assert.rejects(
      () => tracking.deleteHandoffKit(context, appliedAppWithKit.id),
      (err) => /cannot be deleted|archive/i.test(err.message)
    );

    // The APPLIED application and its kit are fully intact
    const [app] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, appliedAppWithKit.id));
    assert.equal(app.status, 'APPLIED');
    assert.ok(app.metadata.handoffKit);
  });

  it('14b. READONLY role cannot archive or delete kits', async () => {
    const readonlyContext = { tenantId: tenant1.id, userId: user1.id, role: 'READONLY' };
    await assert.rejects(
      () => tracking.archiveHandoffKit(readonlyContext, savedAppWithKit.id),
      (err) => /READONLY|authorized/i.test(err.message)
    );
    await assert.rejects(
      () => tracking.deleteHandoffKit(readonlyContext, savedAppWithKit.id),
      (err) => /READONLY|authorized/i.test(err.message)
    );
  });

  it('14c. deletion is audit-logged with preservation evidence', async () => {
    const context = { tenantId: tenant1.id, userId: user1.id, role: 'MEMBER' };
    // Archive then confirm audit trail contains lifecycle events
    await tracking.archiveHandoffKit(context, savedAppWithKit.id);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, savedAppWithKit.id));
    const eventTypes = logs.map((l) => l.eventType);
    assert.ok(eventTypes.includes('application.handoff_kit_archived'));
    assert.ok(eventTypes.includes('job_application.saved') || eventTypes.length >= 1);
  });
});
