import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  resources,
  jobApplications,
  applicationPackages,
  applicationApprovalTickets,
} from '../../src/db/schema.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import {
  JobApplicationWorkflowService,
  computeApplicationPackageHash,
  signApplicationTicket,
} from '../../src/services/job-application-workflow.service.js';
import {
  applicationExecutionPayload,
  APPLICATION_APPROVAL_FORMAT,
} from '../../src/domain/job/application-package-identity.js';
import { createApplicationApprovalTicketRecord } from '../../src/db/repositories/application-approval-ticket.repository.js';
import {
  assertCurrentPackage,
  sealGeneratedPackage,
  packageBodyHash,
  sealHandoffManifest,
  assertHandoffManifest,
} from '../../src/services/evidence/artifact-policy.js';
import { getVerifiedHandoffDocuments } from '../../src/mcp/tools/handoff-artifacts.js';
import { buildApp } from '../../src/app.js';
import { createSession } from '../../src/security/session.service.js';

let tenantId, userId, candidateId, connectionId, resourceId, context, storage, objects, masterKey;
let app;
beforeEach(async () => {
  const identity = await pool.query('SHOW data_directory');
  assert.match(identity.rows[0].data_directory, /ai-job-issue01-pg-20261007/);
  tenantId = crypto.randomUUID();
  userId = crypto.randomUUID();
  candidateId = crypto.randomUUID();
  connectionId = crypto.randomUUID();
  resourceId = crypto.randomUUID();
  context = { tenantId, userId, candidateId, role: 'MEMBER' };
  await db
    .insert(tenants)
    .values({ id: tenantId, name: 'Artifact policy', slug: `artifact-${tenantId}` });
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: `${userId}@example.test`,
    displayName: 'Synthetic',
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  await db
    .insert(candidates)
    .values({ id: candidateId, tenantId, userId, displayName: 'Synthetic' });
  await db.insert(resourceConnections).values({
    id: connectionId,
    tenantId,
    userId,
    provider: 'GITHUB_APP',
    authType: 'APP_INSTALLATION',
    displayName: 'Fixture',
    externalAccountId: resourceId,
    encryptedCredentials: 'synthetic-unused',
    status: 'ACTIVE',
  });
  await db.insert(resources).values({
    id: resourceId,
    tenantId,
    candidateId,
    connectionId,
    provider: 'GITHUB_APP',
    resourceType: 'REPOSITORY',
    externalResourceId: '123',
    name: 'owner/repo',
    displayName: 'Repo',
    url: 'https://github.com/owner/repo',
    status: 'ACTIVE',
    metadata: { evidenceEpoch: crypto.randomUUID() },
  });
  objects = new Map();
  masterKey = crypto.randomBytes(32);
  const s3Provider = {
    putEncryptedObject: async ({ key, buffer }) => objects.set(key, buffer),
    getEncryptedObject: async ({ key }) => objects.get(key),
  };
  storage = new DocumentStorageService({ masterKey, s3Provider, database: db });
});
afterEach(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
});
after(async () => {
  if (app) await app.close();
  await closeDatabase();
});

function rawPackage() {
  return {
    candidateId,
    candidateName: 'Synthetic',
    candidateEmail: 'synthetic@example.test',
    targetJob: {
      id: crypto.randomUUID(),
      title: 'Engineer',
      company: 'Fixture',
      applicationUrl: 'https://employer.example.test/apply',
      source: 'MANUAL',
      description: 'Fixture job',
      retrievedAt: new Date().toISOString(),
    },
    tailoredResume: {
      title: 'Resume',
      markdownContent: 'Candidate reports an interest in React.',
      contentHash: 'a'.repeat(64),
      fitScore: 50,
    },
    coverLetter: {
      title: 'Letter',
      markdownContent: 'I report an interest in this position.',
      contentHash: 'b'.repeat(64),
    },
    verifiedSkills: [],
    claimedSkills: [],
    portfolioLinks: [],
    answers: {},
  };
}
async function packageFixture(current = true) {
  const pkg = current ? await sealGeneratedPackage(db, context, rawPackage()) : rawPackage();
  pkg.packageHash = computeApplicationPackageHash(pkg);
  const [application] = await db
    .insert(jobApplications)
    .values({
      tenantId,
      candidateId,
      companyName: 'Fixture',
      jobTitle: 'Engineer',
      jobUrl: pkg.targetJob.applicationUrl,
      status: 'SAVED',
    })
    .returning();
  const [row] = await db
    .insert(applicationPackages)
    .values({
      tenantId,
      candidateId,
      applicationId: application.id,
      version: 1,
      packageHash: pkg.packageHash,
      packagePayload: pkg,
      lifecycleState: 'CURRENT',
    })
    .returning();
  return { pkg, row, application };
}
function legacyBlob(bytes) {
  const key = crypto.randomUUID(),
    iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  objects.set(key, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]));
  return key;
}
async function generatedDocument(pkg, bytes = Buffer.from('Current generated PDF')) {
  return storage.storeEncryptedDocument({
    tenantId,
    candidateId,
    buffer: bytes,
    generatedPackage: {
      receipt: pkg.evidenceTrustReceipt,
      bodyHash: packageBodyHash(pkg),
      packageHash: pkg.packageHash,
    },
  });
}

for (const kind of ['PDF', 'TeX', 'cover letter', 'portfolio']) {
  test(`unmarked historical ${kind} bytes cannot be retrieved by storage key`, async () => {
    const storageKey = legacyBlob(Buffer.from(`Old ${kind}: Independently verified React expert`));
    await assert.rejects(storage.getDecryptedDocument({ tenantId, candidateId, storageKey }), {
      code: 'ARTIFACT_REVALIDATION_REQUIRED',
    });
    assert.ok(objects.has(storageKey), 'Preserve history, do not delete artifacts');
  });
}
test('current-policy generated bytes survive restart without changing content', async () => {
  const { pkg } = await packageFixture();
  const document = await generatedDocument(pkg);
  const restarted = new DocumentStorageService({
    masterKey,
    database: db,
    s3Provider: { getEncryptedObject: async ({ key }) => objects.get(key) },
  });
  assert.equal(
    (
      await restarted.getDecryptedDocument({
        tenantId,
        candidateId,
        storageKey: document.storageKey,
      })
    ).toString(),
    'Current generated PDF'
  );
});

test('transaction rollback cannot publish a new CURRENT package or alter historical content', async () => {
  const { application } = await packageFixture(false);
  const [original] = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  const current = await sealGeneratedPackage(db, context, rawPackage());
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.insert(applicationPackages).values({
        tenantId,
        candidateId,
        applicationId: application.id,
        version: 2,
        packageHash: current.packageHash,
        packagePayload: current,
        lifecycleState: 'ARCHIVED',
      });
      throw new Error('synthetic transaction failure');
    }),
    /synthetic transaction failure/
  );
  const persisted = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0], original);
  await assert.rejects(
    new ApplicationTrackingService({ database: db }).getCurrentApplicationPackage(
      context,
      application.id
    ),
    { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
  );
});
for (const change of [
  'tenant',
  'candidate',
  'content',
  'signature',
  'epoch',
  'revoked connection',
  'deleted source',
  'source identity',
]) {
  test(`current artifact receipt rejects substitution/invalidation: ${change}`, async () => {
    const { pkg } = await packageFixture();
    const document = await generatedDocument(pkg);
    const mutated = structuredClone(pkg);
    if (change === 'tenant') context.tenantId = crypto.randomUUID();
    if (change === 'candidate') context.candidateId = crypto.randomUUID();
    if (change === 'content')
      mutated.tailoredResume.markdownContent = 'Independently verified expert';
    if (change === 'signature') mutated.evidenceTrustReceipt.signature = '0'.repeat(64);
    if (change === 'epoch')
      await db
        .update(resources)
        .set({ metadata: { evidenceEpoch: crypto.randomUUID() } })
        .where(eq(resources.id, resourceId));
    if (change === 'revoked connection')
      await db
        .update(resourceConnections)
        .set({ status: 'REVOKED' })
        .where(eq(resourceConnections.id, connectionId));
    if (change === 'deleted source') await db.delete(resources).where(eq(resources.id, resourceId));
    if (change === 'source identity')
      await db
        .update(resources)
        .set({ externalResourceId: '999' })
        .where(eq(resources.id, resourceId));
    mutated.packageHash = computeApplicationPackageHash(mutated);
    await assert.rejects(assertCurrentPackage(db, context, mutated), {
      code: 'ARTIFACT_REVALIDATION_REQUIRED',
    });
    if (['epoch', 'revoked connection', 'deleted source', 'source identity'].includes(change))
      await assert.rejects(
        storage.getDecryptedDocument({ tenantId, candidateId, storageKey: document.storageKey }),
        { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
      );
  });
}
test('well-formed client policy metadata cannot authorize legacy package content', async () => {
  const { pkg } = await packageFixture(false);
  pkg.evidenceTrustReceipt = {
    policy: 'source-backed-narrative/v1',
    tenantId,
    candidateId,
    bodyHash: packageBodyHash(pkg),
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    sources: [],
    signature: '0'.repeat(64),
  };
  pkg.packageHash = computeApplicationPackageHash(pkg);
  await assert.rejects(assertCurrentPackage(db, context, pkg), {
    code: 'ARTIFACT_REVALIDATION_REQUIRED',
  });
});
test('legacy CURRENT, direct package version and restore cannot bypass quarantine', async () => {
  const { row, application } = await packageFixture(false);
  const tracking = new ApplicationTrackingService({ database: db });
  for (const call of [
    () => tracking.getCurrentApplicationPackage(context, application.id),
    () => tracking.getApplicationPackage(context, application.id),
    () => tracking.getApplicationPackageByVersion(context, application.id, row.version),
    () => tracking.restoreApplicationPackage(context, application.id, row.version),
  ]) {
    await assert.rejects(call(), { code: 'ARTIFACT_REVALIDATION_REQUIRED' });
  }
  const details = await tracking.getApplicationDetails(context, application.id);
  assert.equal(details.currentPackage.packagePayload, null);
  const versions = await tracking.listApplicationPackages(context, application.id);
  assert.equal(versions[0].quarantineStatus, 'REVALIDATION_REQUIRED');
  assert.equal(
    (await db.select().from(applicationPackages).where(eq(applicationPackages.id, row.id)))[0]
      .packagePayload.candidateName,
    'Synthetic'
  );
});
test('legacy package cannot obtain new approval, including after restart', async () => {
  const { pkg, application } = await packageFixture(false);
  for (let i = 0; i < 2; i++) {
    const workflow = new JobApplicationWorkflowService({ database: db });
    await assert.rejects(
      workflow.requestApplicationApproval({
        ...context,
        applicationId: application.id,
        packageHash: pkg.packageHash,
        destinationUrl: pkg.targetJob.applicationUrl,
      }),
      { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
    );
  }
  assert.equal(
    (
      await db
        .select()
        .from(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.tenantId, tenantId))
    ).length,
    0
  );
});

test('a correctly signed historical approval cannot execute a snapshot without current artifact provenance', async () => {
  const { pkg, application } = await packageFixture(false);
  const [row] = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  const ticket = {
    ticketId: crypto.randomUUID(),
    tenantId,
    userId,
    candidateId,
    applicationId: application.id,
    clientId: 'career-hub-client',
    jobId: String(pkg.targetJob.id),
    destinationUrl: pkg.targetJob.applicationUrl,
    packageHash: pkg.packageHash,
    packageVersion: row.version,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    status: 'ISSUED',
    metadata: {
      approvalTarget: {
        format: APPLICATION_APPROVAL_FORMAT,
        packageId: row.id,
        applicationPackage: applicationExecutionPayload(pkg),
      },
    },
  };
  ticket.signature = signApplicationTicket(ticket);
  await createApplicationApprovalTicketRecord(db, ticket);
  let adapterCalls = 0;
  const workflow = new JobApplicationWorkflowService({
    database: db,
    portalAdapterRegistry: {
      resolve: () => ({
        submitOrHandoff: async () => {
          adapterCalls++;
        },
      }),
    },
  });
  await assert.rejects(
    workflow.submitJobApplication({
      ...context,
      applicationId: application.id,
      packageHash: pkg.packageHash,
      destinationUrl: pkg.targetJob.applicationUrl,
      approvalTicketId: ticket.ticketId,
    }),
    { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
  );
  assert.equal(adapterCalls, 0);
  const stored = await workflow.getApprovalTicket({ tenantId, ticketId: ticket.ticketId });
  assert.equal(stored.status, 'ISSUED');
  assert.deepEqual(stored.metadata.approvalTarget, ticket.metadata.approvalTarget);
});

test('application lists and direct reads cannot expose unsigned historical narrative caches', async () => {
  const { application } = await packageFixture(false);
  const metadata = {
    applicationPackage: {
      tailoredResume: { markdownContent: 'Independently verified React expert' },
    },
    handoffPackage: { summary: 'Verified expert' },
    handoffKit: { summary: 'Verified expert' },
  };
  await db.update(jobApplications).set({ metadata }).where(eq(jobApplications.id, application.id));
  const tracking = new ApplicationTrackingService({ database: db });
  for (const output of [
    await tracking.getApplication(context, application.id),
    ...(await tracking.listApplications(context, candidateId)).items,
  ]) {
    assert.equal(output.metadata.applicationPackage, undefined);
    assert.equal(output.metadata.handoffPackage, undefined);
    assert.equal(output.metadata.handoffKit, undefined);
    assert.equal(output.metadata.artifactStatus, 'REVALIDATION_REQUIRED');
  }
  assert.deepEqual(
    (await db.select().from(jobApplications).where(eq(jobApplications.id, application.id)))[0]
      .metadata,
    metadata
  );
});
test('regenerated version needs fresh approval and does not mutate an existing approved snapshot', async () => {
  const { pkg, application } = await packageFixture();
  const workflow = new JobApplicationWorkflowService({ database: db });
  const args = {
    ...context,
    applicationId: application.id,
    destinationUrl: pkg.targetJob.applicationUrl,
  };
  const ticket = await workflow.requestApplicationApproval({
    ...args,
    packageHash: pkg.packageHash,
  });
  const snapshot = (await workflow.getApprovalTicket({ tenantId, ticketId: ticket.ticketId }))
    .metadata.approvalTarget;
  const regenerated = await sealGeneratedPackage(db, context, {
    ...pkg,
    answers: { answer: 'Changed' },
  });
  const newVersion = await workflow.applicationTrackingService.recordApplicationPackage(
    context,
    application.id,
    regenerated
  );
  assert.equal(newVersion.version, 2);
  await assert.rejects(
    workflow.submitJobApplication({
      ...args,
      packageHash: regenerated.packageHash,
      approvalTicketId: ticket.ticketId,
    })
  );
  const stored = await workflow.getApprovalTicket({ tenantId, ticketId: ticket.ticketId });
  assert.deepEqual(stored.metadata.approvalTarget, snapshot);
  assert.equal(stored.status, 'ISSUED');
});
test('database unavailable cannot establish generation or retrieval trust', async () => {
  const unavailable = {
    select() {
      throw new Error('DB unavailable');
    },
  };
  await assert.rejects(sealGeneratedPackage(unavailable, context, rawPackage()), /DB unavailable/);
  const { pkg } = await packageFixture();
  await assert.rejects(assertCurrentPackage(unavailable, context, pkg), /DB unavailable/);
});
test('MCP artifact enrichment cannot expose legacy download bytes', async () => {
  const { application } = await packageFixture(false);
  const bytes = Buffer.from('Old verified narrative'),
    storageKey = legacyBlob(bytes);
  application.metadata = {
    handoffKit: {
      applicationId: application.id,
      packageHash: 'a'.repeat(64),
      resume: {
        storageKey,
        fileSizeBytes: bytes.length,
        contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
        filename: 'old.pdf',
        qaAudit: { passed: true },
      },
    },
  };
  const docs = await getVerifiedHandoffDocuments(application, [], storage);
  assert.equal(docs.length, 0);
});
test('handoff cache signature cannot be forged or copied onto different content', async () => {
  const { pkg } = await packageFixture();
  const kit = sealHandoffManifest(
    { packageHash: pkg.packageHash, summary: 'Candidate-reported associations' },
    { tenantId, candidateId },
    pkg
  );
  await assertHandoffManifest(db, context, JSON.parse(JSON.stringify(kit)));
  kit.summary = 'Independent verification establishes mastery';
  await assert.rejects(assertHandoffManifest(db, context, kit), {
    code: 'ARTIFACT_REVALIDATION_REQUIRED',
  });
});
test('extension cannot preview a legacy package selected by valid ID/hash', async () => {
  const { pkg, application } = await packageFixture(false);
  app ||= await buildApp();
  const session = await createSession(db, { tenantId, userId });
  const response = await app.inject({
    method: 'POST',
    url: '/api/extension/preview-package',
    headers: { authorization: `Bearer ${session.rawToken}` },
    payload: { applicationId: application.id, packageHash: pkg.packageHash },
  });
  assert.notEqual(response.statusCode, 200);
  assert.doesNotMatch(response.body, /Candidate reports an interest in React/);
});

test('prepare cannot reuse an unsafe historical CURRENT package', async () => {
  const { pkg, application } = await packageFixture(false);
  const workflow = new JobApplicationWorkflowService({ database: db });
  await assert.rejects(
    workflow.prepareJobApplication({
      ...context,
      applicationId: application.id,
      jobPosting: pkg.targetJob,
      answers: {},
    }),
    { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
  );
});
test('direct storage ID cannot cross candidate/tenant or requested package identity', async () => {
  const { pkg } = await packageFixture();
  const doc = await generatedDocument(pkg);
  for (const override of [
    { candidateId: crypto.randomUUID() },
    { tenantId: crypto.randomUUID() },
    { expectedPackageHash: 'f'.repeat(64) },
  ]) {
    await assert.rejects(
      storage.getDecryptedDocument({
        tenantId,
        candidateId,
        storageKey: doc.storageKey,
        ...override,
      }),
      { code: 'FORBIDDEN' }
    );
  }
});
test('a client boolean cannot enable legacy-source capability', async () => {
  const storageKey = legacyBlob(Buffer.from('Old verified artifact'));
  await assert.rejects(
    storage.getDecryptedDocument({ tenantId, candidateId, storageKey, allowLegacySource: true }),
    { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
  );
});
test('uploaded original cannot substitute for generated application bytes', async () => {
  const doc = await storage.storeEncryptedDocument({
    tenantId,
    candidateId,
    buffer: Buffer.from('Client content'),
  });
  await assert.rejects(
    storage.getDecryptedDocument({
      tenantId,
      candidateId,
      storageKey: doc.storageKey,
      expectedPackageHash: 'a'.repeat(64),
    }),
    { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
  );
});
test('stale receipt cannot be replayed after policy freshness window', async () => {
  const { pkg } = await packageFixture();
  const now = Date.now;
  try {
    const later = now() + 25 * 60 * 60 * 1000;
    Date.now = () => later;
    await assert.rejects(assertCurrentPackage(db, context, pkg), {
      code: 'ARTIFACT_REVALIDATION_REQUIRED',
    });
  } finally {
    Date.now = now;
  }
});
test('consumed approval remains permanently spent when source is revoked', async () => {
  const { pkg, application } = await packageFixture();
  let adapterCalls = 0;
  const workflow = new JobApplicationWorkflowService({
    database: db,
    portalAdapterRegistry: {
      resolve: () => ({
        submitOrHandoff: async () => {
          adapterCalls++;
          return { status: 'HANDOFF_READY', portalType: 'TEST', finalSubmitBlocked: true };
        },
      }),
    },
  });
  const args = {
    ...context,
    applicationId: application.id,
    destinationUrl: pkg.targetJob.applicationUrl,
    packageHash: pkg.packageHash,
  };
  const ticket = await workflow.requestApplicationApproval(args);
  await workflow.submitJobApplication({ ...args, approvalTicketId: ticket.ticketId });
  await db
    .update(resourceConnections)
    .set({ status: 'REVOKED' })
    .where(eq(resourceConnections.id, connectionId));
  await assert.rejects(
    workflow.submitJobApplication({ ...args, approvalTicketId: ticket.ticketId })
  );
  assert.equal(
    (await workflow.getApprovalTicket({ tenantId, ticketId: ticket.ticketId })).status,
    'CONSUMED'
  );
  assert.equal(adapterCalls, 1);
});
test('web artifact download and view cannot bypass historical package quarantine', async () => {
  const { application } = await packageFixture(false);
  app ||= await buildApp();
  const session = await createSession(db, { tenantId, userId });
  for (const suffix of [
    'resume/download',
    'resume/view',
    'resume-tex/download',
    'cover-letter/download',
    'bundle/download',
  ]) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/applications/${application.id}/artifacts/${suffix}`,
      headers: { cookie: `career_hub_session=${session.rawToken}` },
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().code, 'ARTIFACT_REVALIDATION_REQUIRED');
  }
});
