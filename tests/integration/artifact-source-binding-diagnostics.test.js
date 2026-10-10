// Real PostgreSQL receipts and source-state transitions; no provider/employer calls.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, resourceConnections, resources } from '../../src/db/schema.js';
import {
  sealGeneratedPackage,
  assertCurrentPackage,
} from '../../src/services/evidence/artifact-policy.js';
import { computeApplicationPackageHash } from '../../src/domain/job/application-package-identity.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname)
);
const tenantId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  otherUserId = crypto.randomUUID();
const candidateId = crypto.randomUUID(),
  otherCandidateId = crypto.randomUUID();
const connectionId = crypto.randomUUID(),
  resourceId = crypto.randomUUID();
const context = { tenantId, candidateId };
const seal = () =>
  sealGeneratedPackage(db, context, {
    candidateId,
    tailoredResume: { title: 'Fixture', markdownContent: 'Candidate-authored text.' },
    coverLetter: { title: 'Fixture', markdownContent: 'Candidate-authored letter.' },
    answers: {},
  });
const reject = async (pkg) => {
  const before = JSON.stringify(pkg);
  const error = await assertCurrentPackage(db, context, pkg).then(
    () => assert.fail('Invalid source binding must still be rejected'),
    (error) => error
  );
  assert.equal(error.code, 'ARTIFACT_REVALIDATION_REQUIRED');
  assert.equal(error.statusCode, 400);
  assert.equal(error.details, null, 'Diagnostic metadata must not change the API error contract');
  assert.equal(JSON.stringify(pkg), before, 'Rejection must not mutate signed content');
  assert.ok(error.evidenceDiagnostics, 'Source rejection must identify its blocking state');
  const serialized = JSON.stringify(error.evidenceDiagnostics);
  for (const hidden of [
    'synthetic-credential',
    'synthetic-private-url',
    'synthetic-private-external',
    'privateEpoch',
    userId,
    otherUserId,
  ])
    assert.ok(
      !serialized.includes(hidden),
      'Diagnostics must not include credentials, raw bindings or owner IDs'
    );
  return error.evidenceDiagnostics;
};

before(async () => {
  await db
    .insert(tenants)
    .values({ id: tenantId, name: 'Source diagnostics fixture', slug: `binding-${tenantId}` });
  await db.insert(users).values(
    [userId, otherUserId].map((id) => ({
      id,
      tenantId,
      email: `${id}@example.test`,
      displayName: 'Fixture',
      role: 'MEMBER',
      status: 'ACTIVE',
    }))
  );
  await db.insert(candidates).values([
    { id: candidateId, tenantId, userId, displayName: 'Fixture' },
    { id: otherCandidateId, tenantId, userId: otherUserId, displayName: 'Other fixture' },
  ]);
  await db.insert(resourceConnections).values({
    id: connectionId,
    tenantId,
    userId,
    provider: 'MANUAL',
    authType: 'API_KEY',
    displayName: 'Fixture',
    externalAccountId: connectionId,
    encryptedCredentials: 'synthetic-credential',
    status: 'ACTIVE',
  });
  await db.insert(resources).values({
    id: resourceId,
    tenantId,
    candidateId,
    connectionId,
    provider: 'MANUAL',
    name: 'Fixture',
    displayName: 'Fixture',
    externalResourceId: 'synthetic-private-external',
    url: 'https://example.test/synthetic-private-url',
    status: 'ACTIVE',
    metadata: { evidenceEpoch: 'privateEpoch' },
  });
  // An unavailable resource owned by another candidate must not block or appear.
  await db.insert(resources).values({
    tenantId,
    candidateId: otherCandidateId,
    provider: 'MANUAL',
    name: 'Other',
    displayName: 'Other',
    externalResourceId: otherCandidateId,
    status: 'DISCONNECTED',
  });
});
beforeEach(async () => {
  await db
    .update(resourceConnections)
    .set({ userId, status: 'ACTIVE' })
    .where(eq(resourceConnections.id, connectionId));
  await db
    .update(resources)
    .set({
      candidateId,
      connectionId,
      status: 'ACTIVE',
      metadata: { evidenceEpoch: 'privateEpoch' },
    })
    .where(eq(resources.id, resourceId));
});
after(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await closeDatabase();
});

test('active owned sources validate across JSON persistence with stable hashes', async () => {
  const pkg = await seal();
  const roundTrip = JSON.parse(JSON.stringify(pkg));
  assert.equal(roundTrip.packageHash, computeApplicationPackageHash(roundTrip));
  assert.deepEqual(await assertCurrentPackage(db, context, roundTrip), pkg.evidenceTrustReceipt);
  assert.equal(pkg.evidenceTrustReceipt.sources.length, 1);
});

for (const status of ['DISCONNECTED', 'DELETED', 'ERROR']) {
  test(`inactive resource ${status} identifies the exact blocker without changing policy`, async () => {
    await db.update(resources).set({ status }).where(eq(resources.id, resourceId));
    const details = await reject(await seal());
    assert.equal(details.bindingsChanged, false);
    assert.deepEqual(details.blockedSources, [
      {
        resourceId,
        connectionId,
        resourceStatus: status,
        connectionStatus: 'ACTIVE',
        issues: ['RESOURCE_INACTIVE'],
      },
    ]);
    assert.deepEqual(details.changedResourceIds, []);
  });
}

for (const status of ['PENDING', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED']) {
  test(`inactive connection ${status} identifies its blocking state`, async () => {
    await db
      .update(resourceConnections)
      .set({ status })
      .where(eq(resourceConnections.id, connectionId));
    const details = await reject(await seal());
    assert.equal(details.bindingsChanged, false);
    assert.deepEqual(details.blockedSources, [
      {
        resourceId,
        connectionId,
        resourceStatus: 'ACTIVE',
        connectionStatus: status,
        issues: ['CONNECTION_INACTIVE'],
      },
    ]);
  });
}

test('wrong connection ownership reports mismatch without exposing either owner', async () => {
  await db
    .update(resourceConnections)
    .set({ userId: otherUserId })
    .where(eq(resourceConnections.id, connectionId));
  const details = await reject(await seal());
  assert.deepEqual(details.blockedSources[0].issues, ['CONNECTION_OWNER_MISMATCH']);
});

test('resource changes after sealing are distinguished from inactive sources', async () => {
  const pkg = await seal();
  await db
    .update(resources)
    .set({ metadata: { evidenceEpoch: 'new-privateEpoch' } })
    .where(eq(resources.id, resourceId));
  const details = await reject(pkg);
  assert.equal(details.bindingsChanged, true);
  assert.deepEqual(details.changedResourceIds, [resourceId]);
  assert.deepEqual(details.blockedSources, []);
});

test('restoring a resource requires a fresh receipt; historical receipts stay rejected', async () => {
  await db.update(resources).set({ status: 'DISCONNECTED' }).where(eq(resources.id, resourceId));
  const old = await seal();
  await db.update(resources).set({ status: 'ACTIVE' }).where(eq(resources.id, resourceId));
  const details = await reject(old);
  assert.equal(details.bindingsChanged, true);
  assert.deepEqual(details.blockedSources, []);
  const fresh = await seal();
  await assertCurrentPackage(db, context, fresh);
  assert.notEqual(fresh.packageHash, old.packageHash);
});

test('foreign context and invalid signatures disclose no source diagnostics', async () => {
  const pkg = await seal();
  const tampered = {
    ...pkg,
    evidenceTrustReceipt: { ...pkg.evidenceTrustReceipt, signature: '0'.repeat(64) },
  };
  tampered.packageHash = computeApplicationPackageHash(tampered);
  for (const [scope, content] of [
    [{ ...context, candidateId: otherCandidateId }, pkg],
    [context, tampered],
  ]) {
    await assert.rejects(assertCurrentPackage(db, scope, content), (error) => {
      assert.equal(error.code, 'ARTIFACT_REVALIDATION_REQUIRED');
      assert.equal(error.evidenceDiagnostics, undefined);
      return true;
    });
  }
});
