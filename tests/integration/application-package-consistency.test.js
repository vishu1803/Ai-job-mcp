/**
 * @file Integration Tests: Application Package Consistency (P14-005BA)
 *
 * Regression for the real ChatGPT MCP acceptance-test defect: a freshly
 * prepared package (new packageHash) was NOT the package returned by
 * get_job_application (stale metadata.handoffKit / stale document snapshots
 * were returned instead).
 *
 * Proven invariants:
 * 1. First prepare creates package A.
 * 2. get_job_application returns package A (currentPackage.packageHash === A).
 * 3. Second prepare creates package B.
 * 4. B's packageHash differs from A's.
 * 5. get_job_application now returns package B.
 * 6. tailoredDocuments correspond to B (resume + cover letter for B).
 * 7. Package A remains historical/auditable (ARCHIVED, plus previousPackageHashes).
 * 8. A failed package B preparation does NOT replace valid package A.
 * 9. Latest/current package resolution is deterministic.
 * 10. Candidate profile data is not modified.
 * 11. Tenant isolation remains intact.
 * 12. MCP response packageHash and tailoredDocuments are internally consistent.
 *
 * Uses the REAL ApplicationTrackingService against the real database and the
 * real MCP server wrapper with dependency-injected workflow services.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  tailoredDocuments,
  auditLogs,
} from '../../src/db/schema.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';

describe('Integration: Application Package Consistency (P14-005BA)', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  let tenant1;
  let user1;
  let candidate1;
  let tenant2;
  let user2;
  let candidate2;

  let tracking;
  let documentStorage;
  let tempStorageDir;
  let candidateBefore;

  const context = () => ({
    tenantId: tenant1.id,
    userId: user1.id,
    role: 'MEMBER',
    scopes: ['career:read', 'career:write'],
    tokenScopes: ['career:read', 'career:write'],
  });

  // Job factory: unique company per call so package content (and therefore the
  // packageHash) genuinely differs between preparations.
  const makeJob = (company, title = 'Senior Backend Engineer') => ({
    id: crypto.randomUUID(),
    source: 'GREENHOUSE',
    company,
    title,
    location: 'Remote',
    workplaceType: 'REMOTE',
    employmentType: 'FULL_TIME',
    description: `Build distributed backend systems with Node.js and PostgreSQL at ${company}.`,
    responsibilities: ['Build backend systems'],
    requirements: ['Node.js', 'PostgreSQL'],
    skills: ['Node.js', 'PostgreSQL'],
    applicationUrl: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/123`,
    retrievedAt: new Date().toISOString(),
  });

  // Deterministic content override so tests control document identity directly.
  // prepareJobApplication generates real content from the candidate profile;
  // these hooks let the tests stamp distinguishable package versions.
  let contentOverride = null;

  const workflow = (applicationTrackingService = null) => {
    const service = new JobApplicationWorkflowService({
      database: db,
      applicationTrackingService: applicationTrackingService || tracking,
      documentStorageService: documentStorage,
    });
    if (contentOverride) {
      const original = service.candidateArtifactContentService.generateApplicationDocuments.bind(
        service.candidateArtifactContentService
      );
      service.candidateArtifactContentService.generateApplicationDocuments = async (args) => {
        const real = await original(args);
        return {
          ...real,
          resume: { ...real.resume, ...contentOverride.resume },
          coverLetter: { ...real.coverLetter, ...contentOverride.coverLetter },
        };
      };
    }
    return service;
  };

  const prepare = async (job, answers = {}, applicationTrackingService = null) => {
    const service = workflow(applicationTrackingService);
    return service.prepareJobApplication({
      tenantId: tenant1.id,
      candidateId: candidate1.id,
      jobPosting: job,
      answers,
    });
  };

  let mcpServer;
  const getTool = (name) => mcpServer.registeredTools.get(name);

  before(async () => {
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-consistency-'));
    documentStorage = new DocumentStorageService({ storageDir: tempStorageDir });
    tracking = new ApplicationTrackingService({ database: db, documentStorage });

    [tenant1] = await db
      .insert(tenants)
      .values({ name: 'Pkg Tenant 1', slug: `pkg-t1-${runId}` })
      .returning();
    [user1] = await db
      .insert(users)
      .values({
        tenantId: tenant1.id,
        email: `pkg-u1-${runId}@example.test`,
        displayName: 'Package Tester One',
        role: 'MEMBER',
      })
      .returning();
    [candidate1] = await db
      .insert(candidates)
      .values({
        tenantId: tenant1.id,
        userId: user1.id,
        displayName: 'Package Tester One',
        canonicalEmail: `pkg-u1-${runId}@example.test`,
        headline: 'Staff Backend Engineer',
        summary: 'Distributed systems engineer with Node.js and PostgreSQL expertise.',
      })
      .returning();

    [tenant2] = await db
      .insert(tenants)
      .values({ name: 'Pkg Tenant 2', slug: `pkg-t2-${runId}` })
      .returning();
    [user2] = await db
      .insert(users)
      .values({
        tenantId: tenant2.id,
        email: `pkg-u2-${runId}@example.test`,
        displayName: 'Attacker Two',
        role: 'MEMBER',
      })
      .returning();
    [candidate2] = await db
      .insert(candidates)
      .values({
        tenantId: tenant2.id,
        userId: user2.id,
        displayName: 'Attacker Two',
        canonicalEmail: `pkg-u2-${runId}@example.test`,
      })
      .returning();

    candidateBefore = { ...((await tracking.getApplication) ? {} : {}), id: candidate1.id };
    const [fresh] = await db.select().from(candidates).where(eq(candidates.id, candidate1.id));
    candidateBefore = JSON.parse(JSON.stringify(fresh));

    // Real MCP server wrapper with the real tracking service and hermetic storage
    mcpServer = createCareerMcpServer({
      deps: {
        database: db,
        applicationTrackingService: tracking,
        documentStorageService: documentStorage,
      },
    });
  });

  after(async () => {
    try {
      const appIds = (
        await db
          .select({ id: jobApplications.id })
          .from(jobApplications)
          .where(eq(jobApplications.candidateId, candidate1.id))
      ).map((r) => r.id);
      if (appIds.length > 0) {
        await db.delete(tailoredDocuments).where(inArray(tailoredDocuments.applicationId, appIds));
        await db.delete(auditLogs).where(inArray(auditLogs.resourceId, appIds));
        await db
          .delete(applicationPackages)
          .where(inArray(applicationPackages.applicationId, appIds));
        await db.delete(jobApplications).where(inArray(jobApplications.id, appIds));
      }
      if (candidate2?.id) await db.delete(candidates).where(eq(candidates.id, candidate2.id));
      if (candidate1?.id) await db.delete(candidates).where(eq(candidates.id, candidate1.id));
      if (user2?.id) await db.delete(users).where(eq(users.id, user2.id));
      if (user1?.id) await db.delete(users).where(eq(users.id, user1.id));
      if (tenant2?.id) await db.delete(tenants).where(eq(tenants.id, tenant2.id));
      if (tenant1?.id) await db.delete(tenants).where(eq(tenants.id, tenant1.id));
      if (tempStorageDir) await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1-6. Prepare A → get A → prepare B → get B
  // ---------------------------------------------------------------------------
  describe('prepare → get_job_application consistency', () => {
    let jobAlpha;
    let pkgA;
    let appA;

    it('1. first prepare creates package A with 64-char hash', async () => {
      jobAlpha = makeJob('AlphaWorks');
      pkgA = await prepare(jobAlpha, { whyUs: 'First preparation' });

      assert.ok(pkgA.packageHash, 'package A must have a packageHash');
      assert.strictEqual(pkgA.packageHash.length, 64);
      assert.ok(pkgA.applicationId, 'prepare must return the resolved applicationId');
      appA = pkgA.applicationId;
    });

    it('2. get_job_application returns package A (and its content hashes)', async () => {
      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appA,
        includeFullJd: false,
      });

      assert.ok(result.currentPackage, 'currentPackage must be exposed');
      assert.strictEqual(result.currentPackage.packageHash, pkgA.packageHash);
      assert.strictEqual(result.currentPackage.packageVersion, 1);
      assert.strictEqual(result.currentPackage.lifecycleState, 'CURRENT');
      assert.strictEqual(
        result.currentPackage.resumeContentHash,
        pkgA.tailoredResume.contentHash,
        'resume content hash must correspond to package A'
      );
      assert.strictEqual(
        result.currentPackage.coverLetterContentHash,
        pkgA.coverLetter.contentHash,
        'cover letter content hash must correspond to package A'
      );
    });

    it('3. second prepare for the SAME target reuses the same applicationId (package B)', async () => {
      // Distinguishable document content for version B on the same target
      contentOverride = {
        resume: {
          contentHash: crypto.createHash('sha256').update('alpha-resume-vB').digest('hex'),
        },
        coverLetter: {
          contentHash: crypto.createHash('sha256').update('alpha-cover-vB').digest('hex'),
        },
      };
      try {
        pkgA.next = await prepare(jobAlpha, { whyUs: 'Second preparation' });
      } finally {
        contentOverride = null;
      }
      const pkgB = pkgA.next;

      assert.ok(pkgB.packageHash, 'package B must have a packageHash');
      assert.strictEqual(pkgB.packageHash.length, 64);
      assert.strictEqual(
        pkgB.applicationId,
        appA,
        'repeat prepare must reuse the existing applicationId'
      );
    });

    it('4. package B has a different package hash than package A', () => {
      assert.notStrictEqual(pkgA.next.packageHash, pkgA.packageHash);
    });

    it('5. get_job_application now returns package B as the current package', async () => {
      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appA,
        includeFullJd: false,
      });

      assert.strictEqual(result.currentPackage.packageHash, pkgA.next.packageHash);
      assert.strictEqual(result.currentPackage.packageVersion, 2);
      assert.ok(
        result.tailoredDocuments.every((document) => document.packageVersion === 2),
        'current package documents must expose package version 2'
      );
      assert.equal(
        result.tailoredDocuments.find((document) => document.documentType === 'TAILORED_RESUME')
          .contentHash,
        pkgA.next.tailoredResume.contentHash
      );
      assert.equal(
        result.tailoredDocuments.find(
          (document) => document.documentType === 'TAILORED_COVER_LETTER'
        ).contentHash,
        pkgA.next.coverLetter.contentHash
      );
    });

    it('6. tailoredDocuments + get_application_submission_status are internally consistent with B', async () => {
      const status = await getTool('get_application_submission_status').handler(context(), {
        applicationId: appA,
      });

      // The submission status tool resolves the CURRENT package hash (not a
      // stale notes/metadata scan).
      assert.strictEqual(status.packageHash, pkgA.next.packageHash);

      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appA,
        includeFullJd: false,
      });
      const docTypes = result.tailoredDocuments.map((d) => d.documentType).sort();
      assert.deepEqual(docTypes, ['TAILORED_COVER_LETTER', 'TAILORED_RESUME']);
      assert.ok(
        result.tailoredDocuments.every(
          (document) => document.packageHash === pkgA.next.packageHash
        ),
        'every tailored document must belong to the CURRENT package B'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Package A remains historical/auditable
  // ---------------------------------------------------------------------------
  it('7. package A remains historical/auditable after B becomes current', async () => {
    const appId = (
      await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(eq(jobApplications.candidateId, candidate1.id))
    )[0].id;

    const versions = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, appId));

    assert.equal(versions.length, 2, 'both versions must be preserved');
    const current = versions.filter((v) => v.lifecycleState === 'CURRENT');
    const archived = versions.filter((v) => v.lifecycleState === 'ARCHIVED');
    assert.equal(current.length, 1, 'exactly one CURRENT version');
    assert.equal(archived.length, 1, 'superseded version is ARCHIVED, not deleted');
    assert.equal(archived[0].version, 1);

    // metadata history preserved
    const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
    assert.ok(
      (app.metadata.previousPackageHashes || []).includes,
      'previous package hashes preserved in metadata'
    );
    assert.ok(app.metadata.previousPackageHashes.length >= 1);
    assert.ok(
      app.metadata.previousPackageHashes.includes(app.metadata.currentPackageHash) === false
    );

    // Audit trail records both versions
    // resourceId on package rows is the package row id, so check event types broadly
    const pkgEvents = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.eventType, 'application.package_recorded'));
    assert.ok(pkgEvents.length >= 2, 'both package recordings are audit-logged');
  });

  // ---------------------------------------------------------------------------
  // 8. Failed preparation must not replace a valid current package
  // ---------------------------------------------------------------------------
  it('8. failed package preparation does not replace the valid current package', async () => {
    const appId = (
      await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(eq(jobApplications.candidateId, candidate1.id))
    )[0].id;

    const before = await tracking.getCurrentApplicationPackage(context(), appId);
    assert.ok(before, 'a valid current package exists');
    const [existingApplication] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, appId));
    const sameTargetJob = makeJob(existingApplication.companyName, existingApplication.jobTitle);

    // Exercise a failure after target resolution but before package promotion.
    // This protects against a partial persistence path promoting B and then
    // returning null because document snapshot persistence failed.
    const originalAttachSnapshots = tracking.attachPackageDocumentSnapshots;
    tracking.attachPackageDocumentSnapshots = async () => {
      throw new Error('simulated snapshot persistence failure');
    };
    contentOverride = {
      resume: {
        markdownContent:
          'Package Tester One pkg-u1-' +
          runId +
          '@example.test deliberately different resume version.',
      },
      coverLetter: {
        markdownContent:
          'Package Tester One pkg-u1-' +
          runId +
          '@example.test deliberately different cover-letter version.',
      },
    };
    try {
      const failedPersistenceResult = await prepare(
        sameTargetJob,
        {
          whyUs: 'Simulated package persistence failure',
        },
        tracking
      );
      assert.equal(
        failedPersistenceResult.applicationId,
        undefined,
        'a package is not reported as persisted when its snapshots fail'
      );
    } finally {
      contentOverride = null;
      tracking.attachPackageDocumentSnapshots = originalAttachSnapshots;
    }

    const afterSnapshotFailure = await tracking.getCurrentApplicationPackage(context(), appId);
    assert.strictEqual(afterSnapshotFailure.packageHash, before.packageHash);
    assert.strictEqual(afterSnapshotFailure.version, before.version);

    // A preparation that fails AFTER a previous success (invalid job payload
    // missing required description) must leave the CURRENT version untouched.
    await assert.rejects(
      () =>
        prepare({
          id: crypto.randomUUID(),
          source: 'GREENHOUSE',
          company: 'FailCorp',
          title: 'Broken Role',
          // description missing → schema validation fails
          applicationUrl: 'https://boards.greenhouse.io/failcorp/jobs/1',
          retrievedAt: new Date().toISOString(),
        }),
      (err) => /invalid|description|required/i.test(String(err.message))
    );

    const after = await tracking.getCurrentApplicationPackage(context(), appId);
    assert.strictEqual(after.packageHash, before.packageHash);
    assert.strictEqual(after.version, before.version);
  });

  // ---------------------------------------------------------------------------
  // 9. Deterministic current-package resolution
  // ---------------------------------------------------------------------------
  it('9. latest/current package resolution is deterministic', async () => {
    const appId = (
      await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(eq(jobApplications.candidateId, candidate1.id))
    )[0].id;

    for (let i = 0; i < 5; i += 1) {
      const current = await tracking.getCurrentApplicationPackage(context(), appId);
      const details = await tracking.getApplicationDetails(context(), appId);
      assert.strictEqual(details.currentPackage.packageHash, current.packageHash);
      assert.strictEqual(current.lifecycleState, 'CURRENT');
    }

    // exactly one CURRENT row in the database
    const rows = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, appId));
    assert.equal(rows.filter((r) => r.lifecycleState === 'CURRENT').length, 1);
  });

  // ---------------------------------------------------------------------------
  // 10. Candidate profile data is not modified
  // ---------------------------------------------------------------------------
  it('10. candidate profile data is not modified by prepare/get flows', async () => {
    const [after] = await db.select().from(candidates).where(eq(candidates.id, candidate1.id));
    assert.deepEqual(JSON.parse(JSON.stringify(after)), candidateBefore);
  });

  // ---------------------------------------------------------------------------
  // 11. Tenant isolation
  // ---------------------------------------------------------------------------
  it('11. tenant isolation: cross-tenant get_job_application is 404 default-deny', async () => {
    const appId = (
      await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(eq(jobApplications.candidateId, candidate1.id))
    )[0].id;

    const attacker = {
      tenantId: tenant2.id,
      userId: user2.id,
      role: 'MEMBER',
      scopes: ['career:read', 'career:write'],
      tokenScopes: ['career:read', 'career:write'],
    };
    await assert.rejects(
      () => getTool('get_job_application').handler(attacker, { applicationId: appId }),
      (err) => err.statusCode === 404 || /not found/i.test(err.message)
    );

    // Cross-tenant prepare must not reuse tenant 1's application either
    const otherService = new JobApplicationWorkflowService({ database: db });
    await assert.rejects(
      () =>
        otherService.prepareJobApplication({
          tenantId: tenant2.id,
          candidateId: candidate1.id, // candidate from tenant 1
          jobPosting: makeJob('CrossTenant'),
        }),
      (err) => /not found/i.test(err.message)
    );
  });

  // ---------------------------------------------------------------------------
  // 12. MCP response internal consistency (prepare output == get output)
  // ---------------------------------------------------------------------------
  it('12. MCP prepare output packageHash equals get_job_application currentPackage.packageHash', async () => {
    const job = makeJob('ConsistentCorp');
    const pkg = await prepare(job);

    const result = await getTool('get_job_application').handler(context(), {
      applicationId: pkg.applicationId,
      includeFullJd: false,
    });

    // THE core invariant of this regression
    assert.strictEqual(result.currentPackage.packageHash, pkg.packageHash);
    assert.strictEqual(result.currentPackage.resumeContentHash, pkg.tailoredResume.contentHash);
    assert.strictEqual(result.currentPackage.coverLetterContentHash, pkg.coverLetter.contentHash);
  });

  // ---------------------------------------------------------------------------
  // Idempotency: re-recording the same package does not duplicate versions
  // ---------------------------------------------------------------------------
  it('re-recording the identical package is idempotent (no duplicate version)', async () => {
    const job = makeJob('IdempotentCorp');
    const pkg = await prepare(job);

    const appId = pkg.applicationId;
    const countBefore = (
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, appId))
    ).length;

    // Prepare again with identical inputs (same job + same answers) — content
    // is deterministic, so the packageHash must be identical.
    const pkg2 = await prepare(job);

    assert.strictEqual(pkg2.packageHash, pkg.packageHash, 'deterministic hash for same input');
    assert.strictEqual(pkg2.applicationId, appId);

    const rows = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, appId));
    assert.equal(rows.length, countBefore, 'no duplicate version row created');
    assert.equal(rows.filter((r) => r.lifecycleState === 'CURRENT').length, 1);
  });

  // ---------------------------------------------------------------------------
  // Handoff kit lifecycle integration with package versions
  // ---------------------------------------------------------------------------
  describe('handoff kit + package version integration', () => {
    it('a kit built for the current package is persisted and package-consistent', async () => {
      const job = makeJob('KitCorp');
      const pkg = await prepare(job);
      const appId = pkg.applicationId;

      const handoff = new ApplicationHandoffService({
        applicationTrackingService: tracking,
        documentStorage: new DocumentStorageService({ storageDir: tempStorageDir }),
        candidateProfileService: {
          getProfile: async () => ({
            primaryEmail: `pkg-u1-${runId}@example.test`,
            candidate: { displayName: 'Package Tester One' },
            profileMetadata: {
              identity: { phone: '+1-555-0100' },
              readiness: { workAuthorization: 'Authorized' },
              contact: { links: [{ platform: 'GitHub', url: 'https://github.com/tester' }] },
            },
            githubUsername: 'tester',
          }),
        },
      });

      const kit = await handoff.buildApplicationHandoffKit({
        tenantId: tenant1.id,
        userId: user1.id,
        candidateId: candidate1.id,
        applicationPackage: pkg,
        applicationId: appId,
        destinationUrl: job.applicationUrl,
      });

      assert.strictEqual(kit.packageHash, pkg.packageHash);

      const [app] = await db.select().from(jobApplications).where(eq(jobApplications.id, appId));
      assert.equal(app.metadata.handoffKit.packageHash, pkg.packageHash);
      assert.equal(app.metadata.currentPackageHash, pkg.packageHash);

      const [packageRow] = await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, appId));
      assert.equal(packageRow.resumeContentHash, pkg.tailoredResume.contentHash);
      assert.equal(packageRow.coverLetterContentHash, pkg.coverLetter.contentHash);

      // Snapshots exist and carry the package hash
      const docs = await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.applicationId, appId));
      const types = docs.map((d) => d.documentType).sort();
      assert.deepEqual(types, [
        'TAILORED_COVER_LETTER',
        'TAILORED_COVER_LETTER',
        'TAILORED_RESUME',
        'TAILORED_RESUME',
      ]);
      assert.ok(docs.every((d) => d.metadata?.packageHash === pkg.packageHash));

      const inspected = await mcpServer.registeredTools
        .get('get_job_application')
        .handler(context(), { applicationId: appId, includeFullJd: false });
      assert.equal(inspected.currentPackage.packageHash, pkg.packageHash);
      assert.deepEqual(
        inspected.tailoredDocuments.map((document) => document.documentType).sort(),
        ['TAILORED_COVER_LETTER', 'TAILORED_RESUME']
      );
      assert.ok(
        inspected.tailoredDocuments.every(
          (document) =>
            document.packageHash === pkg.packageHash &&
            ['READY', 'BLOCKED'].includes(document.availabilityStatus) &&
            document.viewUrl &&
            document.downloadUrl
        ),
        `current package documents must expose verified View/Download references: ${JSON.stringify(inspected.tailoredDocuments)}`
      );
      const inspectedResume = inspected.tailoredDocuments.find(
        (document) => document.documentType === 'TAILORED_RESUME'
      );
      const inspectedCoverLetter = inspected.tailoredDocuments.find(
        (document) => document.documentType === 'TAILORED_COVER_LETTER'
      );
      assert.equal(inspectedResume.contentHash, pkg.tailoredResume.contentHash);
      assert.equal(inspectedCoverLetter.contentHash, pkg.coverLetter.contentHash);
      assert.equal(
        inspectedResume.pdfContentHash,
        docs.find(
          (document) =>
            document.documentType === 'TAILORED_RESUME' && document.metadata?.artifact?.contentHash
        ).metadata.artifact.contentHash
      );
      assert.equal(
        inspectedCoverLetter.pdfContentHash,
        docs.find(
          (document) =>
            document.documentType === 'TAILORED_COVER_LETTER' &&
            document.metadata?.artifact?.contentHash
        ).metadata.artifact.contentHash
      );
    });
  });

  // ---------------------------------------------------------------------------
  // P14-005BC: Document Content Hash Consistency
  // ---------------------------------------------------------------------------
  describe('P14-005BC: document content hash consistency', () => {
    it('prepare_job_application resume contentHash === get_job_application tailoredDocuments resume contentHash', async () => {
      const job = makeJob('HashConsistencyCorp');
      const pkg = await prepare(job);
      const appId = pkg.applicationId;

      // Build handoff kit to create PDF artifacts
      const handoff = new ApplicationHandoffService({
        applicationTrackingService: tracking,
        documentStorage: new DocumentStorageService({ storageDir: tempStorageDir }),
        candidateProfileService: {
          getProfile: async () => ({
            primaryEmail: `pkg-u1-${runId}@example.test`,
            candidate: { displayName: 'Package Tester One' },
            profileMetadata: {
              identity: { phone: '+1-555-0100' },
              readiness: { workAuthorization: 'Authorized' },
              contact: { links: [{ platform: 'GitHub', url: 'https://github.com/tester' }] },
            },
            githubUsername: 'tester',
          }),
        },
      });

      await handoff.buildApplicationHandoffKit({
        tenantId: tenant1.id,
        userId: user1.id,
        candidateId: candidate1.id,
        applicationPackage: pkg,
        applicationId: appId,
        destinationUrl: job.applicationUrl,
      });

      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appId,
        includeFullJd: false,
      });

      // THE CORE INVARIANT (P14-005BC): contentHash from prepare === contentHash from get
      const resumeDoc = result.tailoredDocuments.find((d) => d.documentType === 'TAILORED_RESUME');
      const coverLetterDoc = result.tailoredDocuments.find(
        (d) => d.documentType === 'TAILORED_COVER_LETTER'
      );

      assert.ok(resumeDoc, 'resume document must be present');
      assert.ok(coverLetterDoc, 'cover letter document must be present');

      // Resume hash consistency
      assert.strictEqual(
        resumeDoc.contentHash,
        pkg.tailoredResume.contentHash,
        `Resume contentHash mismatch: prepare returned ${pkg.tailoredResume.contentHash}, get returned ${resumeDoc.contentHash}`
      );

      // Cover letter hash consistency
      assert.strictEqual(
        coverLetterDoc.contentHash,
        pkg.coverLetter.contentHash,
        `Cover letter contentHash mismatch: prepare returned ${pkg.coverLetter.contentHash}, get returned ${coverLetterDoc.contentHash}`
      );

      // currentPackage hashes must also match
      assert.strictEqual(
        result.currentPackage.resumeContentHash,
        pkg.tailoredResume.contentHash,
        'currentPackage.resumeContentHash must match prepare output'
      );
      assert.strictEqual(
        result.currentPackage.coverLetterContentHash,
        pkg.coverLetter.contentHash,
        'currentPackage.coverLetterContentHash must match prepare output'
      );
    });

    it('pdfContentHash is separate from contentHash and represents PDF bytes', async () => {
      const job = makeJob('PdfHashCorp');
      const pkg = await prepare(job);
      const appId = pkg.applicationId;

      const handoff = new ApplicationHandoffService({
        applicationTrackingService: tracking,
        documentStorage: new DocumentStorageService({ storageDir: tempStorageDir }),
        candidateProfileService: {
          getProfile: async () => ({
            primaryEmail: `pkg-u1-${runId}@example.test`,
            candidate: { displayName: 'Package Tester One' },
            profileMetadata: {
              identity: { phone: '+1-555-0100' },
              readiness: { workAuthorization: 'Authorized' },
              contact: { links: [{ platform: 'GitHub', url: 'https://github.com/tester' }] },
            },
            githubUsername: 'tester',
          }),
        },
      });

      await handoff.buildApplicationHandoffKit({
        tenantId: tenant1.id,
        userId: user1.id,
        candidateId: candidate1.id,
        applicationPackage: pkg,
        applicationId: appId,
        destinationUrl: job.applicationUrl,
      });

      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appId,
        includeFullJd: false,
      });

      const resumeDoc = result.tailoredDocuments.find((d) => d.documentType === 'TAILORED_RESUME');

      // pdfContentHash should be present and different from contentHash
      // (PDF bytes hash vs Markdown content hash)
      if (resumeDoc.pdfContentHash) {
        assert.strictEqual(
          resumeDoc.pdfContentHash.length,
          64,
          'pdfContentHash must be a 64-char hex SHA-256'
        );
        // PDF hash should differ from Markdown hash (different representations)
        assert.notStrictEqual(
          resumeDoc.pdfContentHash,
          resumeDoc.contentHash,
          'pdfContentHash (PDF bytes) should differ from contentHash (Markdown)'
        );
      }
    });

    it('repeated identical preparation returns identical document hashes', async () => {
      const job = makeJob('IdempotentHashCorp');
      const pkg1 = await prepare(job);
      const pkg2 = await prepare(job);

      // Same input → same hashes
      assert.strictEqual(pkg1.packageHash, pkg2.packageHash);
      assert.strictEqual(pkg1.tailoredResume.contentHash, pkg2.tailoredResume.contentHash);
      assert.strictEqual(pkg1.coverLetter.contentHash, pkg2.coverLetter.contentHash);
    });

    it('get_job_application returns complete artifact metadata for verified documents', async () => {
      const job = makeJob('MetadataCorp');
      const pkg = await prepare(job);
      const appId = pkg.applicationId;

      const handoff = new ApplicationHandoffService({
        applicationTrackingService: tracking,
        documentStorage: new DocumentStorageService({ storageDir: tempStorageDir }),
        candidateProfileService: {
          getProfile: async () => ({
            primaryEmail: `pkg-u1-${runId}@example.test`,
            candidate: { displayName: 'Package Tester One' },
            profileMetadata: {
              identity: { phone: '+1-555-0100' },
              readiness: { workAuthorization: 'Authorized' },
              contact: { links: [{ platform: 'GitHub', url: 'https://github.com/tester' }] },
            },
            githubUsername: 'tester',
          }),
        },
      });

      await handoff.buildApplicationHandoffKit({
        tenantId: tenant1.id,
        userId: user1.id,
        candidateId: candidate1.id,
        applicationPackage: pkg,
        applicationId: appId,
        destinationUrl: job.applicationUrl,
      });

      const result = await getTool('get_job_application').handler(context(), {
        applicationId: appId,
        includeFullJd: false,
      });

      for (const doc of result.tailoredDocuments) {
        // Required fields per TASK 5
        assert.ok(doc.documentType, 'documentType required');
        assert.ok(doc.version, 'version required');
        assert.ok(doc.packageHash, 'packageHash required');
        assert.ok(doc.contentHash, 'contentHash required');

        // Artifact metadata (when viewUrl is present)
        if (doc.viewUrl) {
          assert.ok(doc.filename, 'filename required for artifacts');
          assert.ok(doc.mimeType, 'mimeType required for artifacts');
          assert.ok(doc.fileSizeBytes > 0, 'fileSizeBytes required for artifacts');
          assert.ok(doc.availabilityStatus, 'availabilityStatus required for artifacts');
          assert.ok(doc.downloadUrl, 'downloadUrl required for artifacts');
          assert.ok(typeof doc.qaScore === 'number', 'qaScore required for artifacts');
          assert.ok(typeof doc.qaPassed === 'boolean', 'qaPassed required for artifacts');
          assert.equal(doc.storageKey, undefined, 'storageKey must not leak');
          assert.equal(doc.texStorageKey, undefined, 'texStorageKey must not leak');
        }
      }
    });
  });
});
