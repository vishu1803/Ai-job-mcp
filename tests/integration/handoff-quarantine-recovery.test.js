// Actual loopback HTTP and disposable PostgreSQL; outbound GitHub is a fixture, no employer calls.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  resources,
  resourceConnections,
  tailoredDocuments,
  applicationApprovalTickets,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { computeApplicationPackageHash } from '../../src/domain/job/application-package-identity.js';
import { profile } from '../fixtures/prd003-resume-profile.js';
import { createLogger } from '../../src/utils/logger.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';
import { computeJobContentHash } from '../../src/domain/career/analysis-snapshot.schemas.js';
import { deriveCanonicalJobId } from '../../src/utils/url-normalizer.js';
import { githubFixture } from '../helpers/github-installation.fixture.js';
import { connectorRegistry } from '../../src/connectors/registry/connector-registry.js';
import { BaseResourceConnector } from '../../src/connectors/base/resource-connector.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname)
);
assert.ok(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT);
const tenantId = crypto.randomUUID(),
  userId = crypto.randomUUID(),
  candidateId = crypto.randomUUID();
let app, baseUrl, session, application, originalPackage, workflow;
const workflowQueries = [];
let serverOutput = '';
const serverLogs = () => serverOutput.trim().split('\n').filter(Boolean).map(JSON.parse);
const tracking = new ApplicationTrackingService(db);
const context = { tenantId, userId, candidateId, role: 'MEMBER' };
const request = (suffix = '') =>
  fetch(`${baseUrl}/applications/${application.id}/handoff${suffix}`, {
    headers: { cookie: `career_hub_session=${session.rawToken}` },
    redirect: 'manual',
  });

before(async () => {
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Handoff recovery fixture',
    slug: `handoff-${tenantId}`,
    tier: 'PRO',
  });
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: `${userId}@example.test`,
    displayName: profile.displayName,
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  await db.insert(candidates).values({
    id: candidateId,
    tenantId,
    userId,
    displayName: profile.displayName,
    canonicalEmail: profile.canonicalEmail,
    status: 'ACTIVE',
  });
  session = await createSession(db, {
    tenantId,
    userId,
    role: 'MEMBER',
    scopes: ['*'],
    deviceId: 'recovery-fixture',
  });
  const workflowDb = drizzle(pool, {
    logger: {
      logQuery(query) {
        workflowQueries.push(query);
      },
    },
  });
  workflow = new JobApplicationWorkflowService({ database: workflowDb });
  const compiler = new LatexCompilerService({
    pdflatexPath: 'nonexistent-recovery-pdflatex',
    chromeTimeoutMs: 45000,
  });
  compiler.tectonicPath = null;
  workflow.applicationHandoffService.latexCompiler = compiler;
  workflow.applicationHandoffService.resumeOptimizer.latexCompiler = compiler;
  app = buildApp({
    db,
    installationService: githubFixture(db).service,
    loggerInstance: createLogger(
      { level: 'trace' },
      new Writable({
        write(chunk, _encoding, done) {
          serverOutput += chunk;
          done();
        },
      })
    ),
    jobApplicationWorkflowService: workflow,
    applicationHandoffService: workflow.applicationHandoffService,
  });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const saved = await fetch(`${baseUrl}/profile`, {
    method: 'POST',
    headers: {
      cookie: `career_hub_session=${session.rawToken}`,
      origin: baseUrl,
      'x-csrf-token': generateCsrfToken(session.sessionId),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(profile),
  });
  assert.equal(saved.status, 200, await saved.text());
  const packageHash = 'a'.repeat(64);
  [application] = await db
    .insert(jobApplications)
    .values({
      tenantId,
      candidateId,
      companyName: 'Recovery Fixture',
      jobTitle: 'Engineer',
      jobUrl: 'https://employer.example.test/apply',
      status: 'SAVED',
      metadata: { currentPackageHash: packageHash },
    })
    .returning();
  [originalPackage] = await db
    .insert(applicationPackages)
    .values({
      tenantId,
      candidateId,
      applicationId: application.id,
      version: 1,
      packageHash,
      lifecycleState: 'CURRENT',
      packagePayload: {
        candidateId,
        packageHash,
        tailoredResume: { markdownContent: 'LEGACY_UNTRUSTED_CONTENT' },
        answers: { secret: 'LEGACY_UNTRUSTED_ANSWER' },
      },
    })
    .returning();
});
after(async () => {
  if (app) await app.close();
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await closeDatabase();
});

for (const suffix of [
  '',
  '?history=true',
  '?version=1',
  '?generate=true',
  '?success=Previous+operation',
]) {
  test(`quarantined package renders recovery over HTTP ${suffix || '(current)'}`, async () => {
    const response = await request(suffix);
    const html = await response.text();
    assert.equal(response.status, 200, html);
    assert.match(html, /Application documents need regeneration/);
    assert.match(html, /fresh review and approval/i);
    assert.match(html, new RegExp(`/applications/${application.id}/regenerate`));
    assert.doesNotMatch(html, /LEGACY_UNTRUSTED|HANDOFF_READY|download\/resume/);
    const rows = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, application.id));
    assert.deepEqual(
      rows,
      [originalPackage],
      'GET must not rewrite, bless or generate a new package'
    );
    await assert.rejects(tracking.getCurrentApplicationPackage(context, application.id), {
      code: 'ARTIFACT_REVALIDATION_REQUIRED',
    });
    await assert.rejects(tracking.getApplicationPackageByVersion(context, application.id, 1), {
      code: 'ARTIFACT_REVALIDATION_REQUIRED',
    });
  });
}

test('legacy cached manifest cannot be displayed or make recovery ready', async () => {
  await db
    .update(jobApplications)
    .set({
      metadata: {
        handoffKit: {
          packageHash: originalPackage.packageHash,
          resume: { storageKey: 'UNTRUSTED_STORAGE_KEY' },
        },
      },
    })
    .where(eq(jobApplications.id, application.id));
  const response = await request();
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert.match(html, /Application documents need regeneration/);
  assert.doesNotMatch(html, /UNTRUSTED_STORAGE_KEY|HANDOFF_READY/);
});

test('recovery preserves authentication and candidate ownership', async () => {
  const anonymous = await fetch(`${baseUrl}/applications/${application.id}/handoff`, {
    redirect: 'manual',
  });
  assert.equal(anonymous.status, 302);
  assert.match(anonymous.headers.get('location'), /^\/login/);
  const otherId = crypto.randomUUID();
  await db.insert(users).values({
    id: otherId,
    tenantId,
    email: `${otherId}@example.test`,
    displayName: 'Other',
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  const other = await createSession(db, {
    tenantId,
    userId: otherId,
    role: 'MEMBER',
    scopes: ['*'],
    deviceId: 'other-recovery-fixture',
  });
  const denied = await fetch(`${baseUrl}/applications/${application.id}/handoff`, {
    headers: { cookie: `career_hub_session=${other.rawToken}` },
  });
  assert.equal(denied.status, 404);
});

test('an incomplete profile does not trigger generation while its package is quarantined', async () => {
  await db.update(candidates).set({ profileMetadata: {} }).where(eq(candidates.id, candidateId));
  const response = await request('?generate=true');
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert.match(html, /Application documents need regeneration/);
  const rows = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  assert.deepEqual(rows, [originalPackage]);
});

test('submission history disables regeneration without changing the persisted package', async () => {
  await db
    .update(jobApplications)
    .set({ appliedAt: new Date(), status: 'APPLIED' })
    .where(eq(jobApplications.id, application.id));
  const response = await request();
  const html = await response.text();
  assert.equal(response.status, 200, html);
  assert.match(html, /Applications with submission history cannot be regenerated/);
  assert.doesNotMatch(html, /<form[^>]+\/regenerate/);
  const rows = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  assert.deepEqual(rows, [originalPackage]);
});

test('missing application regeneration remains 404 and logs its actual exception', async () => {
  const missingId = crypto.randomUUID();
  const response = await fetch(`${baseUrl}/applications/${missingId}/regenerate`, {
    method: 'POST',
    headers: {
      cookie: `career_hub_session=${session.rawToken}`,
      origin: baseUrl,
      'x-csrf-token': generateCsrfToken(session.sessionId),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ scope: 'BOTH' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Application not found');
  const failure = serverLogs().find((entry) => entry.appId === missingId && entry.err);
  assert.ok(failure, 'Operational not-found exceptions must be visible in terminal logs');
  assert.equal(failure.reqId, response.headers.get('x-request-id'));
  assert.equal(failure.err.type, 'NotFoundError');
  assert.match(failure.err.stack, /getApplicationDetails/);
});

for (const scenario of [
  {
    label: 'disconnected resource',
    resourceStatus: 'DISCONNECTED',
    connectionStatus: null,
    issues: ['RESOURCE_INACTIVE'],
    guidance: /resource is unavailable or deselected.*Manage Repositories/,
  },
  {
    label: 'expired connection',
    resourceStatus: 'ACTIVE',
    connectionStatus: 'EXPIRED',
    issues: ['CONNECTION_INACTIVE'],
    guidance: /connection is inactive.*Reconnect it on Sources/,
  },
  {
    label: 'wrong connection owner',
    resourceStatus: 'ACTIVE',
    connectionStatus: 'ACTIVE',
    wrongOwner: true,
    issues: ['CONNECTION_OWNER_MISMATCH'],
    guidance: /does not belong to this candidate.*correct account/,
  },
  {
    label: 'source change during generation',
    resourceStatus: 'ACTIVE',
    connectionStatus: null,
    changeDuringGeneration: true,
    issues: [],
    guidance: /resources changed during generation.*synchronization/,
  },
]) {
  test(`rejected fresh generation identifies ${scenario.label} over HTTP`, async () => {
    await db
      .update(jobApplications)
      .set({ appliedAt: null, status: 'SAVED' })
      .where(eq(jobApplications.id, application.id));
    const saved = await fetch(`${baseUrl}/profile`, {
      method: 'POST',
      headers: {
        cookie: `career_hub_session=${session.rawToken}`,
        origin: baseUrl,
        'x-csrf-token': generateCsrfToken(session.sessionId),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(profile),
    });
    assert.equal(saved.status, 200, await saved.text());
    const resourceId = crypto.randomUUID();
    const connectionId = scenario.connectionStatus ? crypto.randomUUID() : null;
    const connectionOwnerId = scenario.wrongOwner ? crypto.randomUUID() : userId;
    if (scenario.wrongOwner) {
      await db.insert(users).values({
        id: connectionOwnerId,
        tenantId,
        email: `${connectionOwnerId}@example.test`,
        displayName: 'Other fixture owner',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
    }
    if (connectionId) {
      await db.insert(resourceConnections).values({
        id: connectionId,
        tenantId,
        userId: connectionOwnerId,
        provider: 'MANUAL',
        authType: 'API_KEY',
        displayName: 'Connection fixture',
        externalAccountId: connectionId,
        encryptedCredentials: 'synthetic-private-diagnostic-credentials',
        status: scenario.connectionStatus,
      });
    }
    await db.insert(resources).values({
      id: resourceId,
      tenantId,
      candidateId,
      connectionId,
      provider: 'MANUAL',
      externalResourceId: resourceId,
      name: 'Disconnected fixture',
      displayName: 'Disconnected fixture',
      status: scenario.resourceStatus,
    });
    const handoff = workflow.applicationHandoffService;
    const originalBuild = handoff.buildApplicationHandoffKit;
    if (scenario.changeDuringGeneration) {
      // Controlled real DB transition between sealing and validation, as during sync.
      handoff.buildApplicationHandoffKit = async function (params) {
        await db
          .update(resources)
          .set({ metadata: { evidenceEpoch: 'changed-fixture-epoch' } })
          .where(eq(resources.id, resourceId));
        return originalBuild.call(this, params);
      };
    }
    try {
      const response = await fetch(`${baseUrl}/applications/${application.id}/regenerate`, {
        method: 'POST',
        headers: {
          cookie: `career_hub_session=${session.rawToken}`,
          origin: baseUrl,
          'x-csrf-token': generateCsrfToken(session.sessionId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ scope: 'BOTH' }),
        redirect: 'manual',
      });
      const rows = await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, application.id));
      assert.deepEqual(
        rows,
        [originalPackage],
        'Rejected generation must preserve immutable history'
      );
      assert.equal(response.status, 302, 'Policy rejection must remain on the recovery journey');
      assert.match(response.headers.get('location'), /handoff\?error=/);
      const failure = serverLogs().find(
        (entry) => entry.reqId === response.headers.get('x-request-id') && entry.err
      );
      assert.equal(failure?.err?.code, 'ARTIFACT_REVALIDATION_REQUIRED');
      assert.equal(
        failure.err.evidenceDiagnostics.bindingsChanged,
        Boolean(scenario.changeDuringGeneration)
      );
      assert.deepEqual(
        failure.err.evidenceDiagnostics.changedResourceIds,
        scenario.changeDuringGeneration ? [resourceId] : []
      );
      assert.deepEqual(
        failure.err.evidenceDiagnostics.blockedSources,
        scenario.changeDuringGeneration
          ? []
          : [
              {
                resourceId,
                connectionId,
                resourceStatus: scenario.resourceStatus,
                connectionStatus: scenario.connectionStatus,
                issues: scenario.issues,
              },
            ]
      );
      assert.match(failure.err.stack, /assertArtifactReceipt/);
      assert.match(failure.err.stack, /Application package not found for hash/);
      assert.match(decodeURIComponent(response.headers.get('location')), scenario.guidance);
      assert.match(
        decodeURIComponent(response.headers.get('location')),
        /Fresh review and approval/
      );
      assert.ok(
        !response.headers.get('location').includes(resourceId),
        'Internal diagnostics must not be copied into flash URLs'
      );
      assert.ok(!serverOutput.includes('synthetic-private-diagnostic-credentials'));
      assert.ok(!response.headers.get('location').includes('NotFoundError'));
    } finally {
      handoff.buildApplicationHandoffKit = originalBuild;
      await db.delete(resources).where(eq(resources.id, resourceId));
      if (connectionId)
        await db.delete(resourceConnections).where(eq(resourceConnections.id, connectionId));
      if (scenario.wrongOwner) await db.delete(users).where(eq(users.id, connectionOwnerId));
    }
  });
}

test('extension preparation rejects ten disconnected sources before writes and recovers with a fresh package', async () => {
  const connectionId = crypto.randomUUID();
  const sourceIds = Array.from({ length: 10 }, () => crypto.randomUUID());
  await db.insert(resourceConnections).values({
    id: connectionId,
    tenantId,
    userId,
    provider: 'MANUAL',
    authType: 'API_KEY',
    displayName: 'Disconnected connection fixture',
    externalAccountId: connectionId,
    encryptedCredentials: 'synthetic-private-preparation-credentials',
    status: 'DISCONNECTED',
  });
  await db.insert(resources).values(
    sourceIds.map((id) => ({
      id,
      tenantId,
      candidateId,
      connectionId,
      provider: 'MANUAL',
      name: 'Source fixture',
      displayName: 'Source fixture',
      externalResourceId: id,
      status: 'DISCONNECTED',
    }))
  );
  const job = {
    sourceUrl: 'https://boards.greenhouse.io/preparationfixture/jobs/991004',
    provider: 'GREENHOUSE',
    company: 'Preparation Fixture',
    title: 'Research Assistant',
    description: 'Document accessible computing interfaces.',
    location: 'Remote',
  };
  const snapshots = new JobAnalysisSnapshotService({ db });
  const snapshot = await snapshots.saveSnapshot({
    tenantId,
    candidateId,
    canonicalJobId: deriveCanonicalJobId({
      jobUrl: job.sourceUrl,
      provider: job.provider,
      company: job.company,
      title: job.title,
    }),
    jobContentHash: computeJobContentHash(job),
    overallFit: { grade: 'A', score: 80 },
    projectRankings: [],
    requirementMatches: [],
    matchAnalysis: {},
    parsedJobDescription: { title: job.title, company: job.company },
  });
  const savedState = async () => ({
    applications: await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.tenantId, tenantId)),
    packages: await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.tenantId, tenantId)),
    documents: await db
      .select()
      .from(tailoredDocuments)
      .where(eq(tailoredDocuments.tenantId, tenantId)),
    approvals: await db
      .select()
      .from(applicationApprovalTickets)
      .where(eq(applicationApprovalTickets.tenantId, tenantId)),
  });
  const initialState = await savedState();
  const prepare = () =>
    fetch(`${baseUrl}/api/extension/prepare-handoff`, {
      method: 'POST',
      headers: { authorization: `Bearer ${session.rawToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ job, analysisSnapshotId: snapshot.id }),
    });
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await prepare();
      const result = await response.json();
      assert.equal(
        response.status,
        400,
        'Policy rejection must not be reported as HTTP 200 success'
      );
      assert.equal(result.code, 'ARTIFACT_REVALIDATION_REQUIRED');
      assert.match(result.message, /Sources/);
      assert.equal(result.recoveryAction.href, '/sources');
      for (const field of [
        'applicationId',
        'packageHash',
        'packageVersion',
        'packageStatus',
        'artifacts',
        'evidenceDiagnostics',
      ])
        assert.equal(
          result[field],
          undefined,
          'Blocked response must not advertise saved metadata or internal diagnostics'
        );
      assert.deepEqual(
        await savedState(),
        initialState,
        'Known invalid evidence must be rejected before creating applications or snapshots'
      );
      const failure = serverLogs().find(
        (entry) => entry.reqId === response.headers.get('x-request-id') && entry.err
      );
      assert.equal(failure.err.evidenceDiagnostics.blockedSources.length, 10);
      assert.equal(failure.err.evidenceDiagnostics.bindingsChanged, false);
      assert.ok(!serverOutput.includes('synthetic-private-preparation-credentials'));
    }
    // Simulate a completed legitimate recovery in this disposable fixture only.
    await db
      .update(resourceConnections)
      .set({ status: 'ACTIVE' })
      .where(eq(resourceConnections.id, connectionId));
    for (const id of sourceIds)
      await db.update(resources).set({ status: 'ACTIVE' }).where(eq(resources.id, id));
    const recovered = await prepare();
    const result = await recovered.json();
    assert.equal(recovered.status, 200, JSON.stringify(result));
    assert.equal(result.artifactStatus, 'READY', JSON.stringify(result));
    assert.equal(result.packageStatus, 'SAVED');
    const current = await tracking.getCurrentApplicationPackage(context, result.applicationId);
    assert.equal(current.packageHash, result.packageHash);
    assert.equal(current.version, result.packageVersion);
    assert.equal(computeApplicationPackageHash(current.packagePayload), result.packageHash);
    assert.deepEqual(
      current.packagePayload.evidenceTrustReceipt.sources.map((source) => source.id).sort(),
      [...sourceIds].sort()
    );
    assert.deepEqual((await savedState()).approvals, initialState.approvals);
    const handoff = workflow.applicationHandoffService;
    const originalBuild = handoff.buildApplicationHandoffKit;
    try {
      // Real source revocation after persistence must also prevent a success response.
      handoff.buildApplicationHandoffKit = async function (...args) {
        await db
          .update(resourceConnections)
          .set({ status: 'DISCONNECTED' })
          .where(eq(resourceConnections.id, connectionId));
        return originalBuild.apply(this, args);
      };
      const newJob = {
        ...job,
        sourceUrl: 'https://boards.greenhouse.io/preparationfixture/jobs/991005',
      };
      const newSnapshot = await snapshots.saveSnapshot({
        tenantId,
        candidateId,
        canonicalJobId: deriveCanonicalJobId({
          jobUrl: newJob.sourceUrl,
          provider: newJob.provider,
          company: newJob.company,
          title: newJob.title,
        }),
        jobContentHash: computeJobContentHash(newJob),
        overallFit: { grade: 'A', score: 80 },
        projectRankings: [],
        requirementMatches: [],
        matchAnalysis: {},
        parsedJobDescription: { title: newJob.title, company: newJob.company },
      });
      const revoked = await fetch(`${baseUrl}/api/extension/prepare-handoff`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${session.rawToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ job: newJob, analysisSnapshotId: newSnapshot.id }),
      });
      const blocked = await revoked.json();
      assert.equal(revoked.status, 400, JSON.stringify(blocked));
      assert.equal(blocked.code, 'ARTIFACT_REVALIDATION_REQUIRED');
      assert.equal(blocked.artifactStatus, undefined);
      assert.equal(blocked.packageStatus, undefined);
      const stateAfterRevocation = await savedState();
      const historical = stateAfterRevocation.packages.find(
        (row) => row.packageHash === result.packageHash
      );
      assert.deepEqual(historical.packagePayload, current.packagePayload);
      assert.deepEqual(stateAfterRevocation.approvals, initialState.approvals);
    } finally {
      handoff.buildApplicationHandoffKit = originalBuild;
    }
  } finally {
    for (const id of sourceIds) await db.delete(resources).where(eq(resources.id, id));
    await db.delete(resourceConnections).where(eq(resourceConnections.id, connectionId));
  }
});

test('explicit HTTP regeneration preserves authored claims and produces a fresh unapproved package', async () => {
  const [connection] = await db
    .insert(resourceConnections)
    .values({
      tenantId,
      userId,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      installationId: '9001',
      externalAccountId: '101',
      displayName: 'Recovery fixture',
      encryptedCredentials: 'fixture',
      status: 'ACTIVE',
      metadata: {
        authorityPolicy: 'personal-owner-or-org-owner-v1',
        authorizedGithubUserId: '101',
      },
    })
    .returning();
  const repositories = Array.from({ length: 10 }, (_, i) => ({
    id: String(50000 + i),
    name: `repo-${i}`,
    fullName: `owner/repo-${i}`,
    url: `https://github.com/owner/repo-${i}`,
    isPrivate: false,
  }));
  const historicalResources = await db
    .insert(resources)
    .values(
      repositories.map((repo) => ({
        tenantId,
        candidateId,
        connectionId: connection.id,
        provider: 'GITHUB_APP',
        externalResourceId: repo.id,
        name: repo.fullName,
        displayName: repo.fullName,
        url: repo.url,
        status: 'DISCONNECTED',
        metadata: { historicalMarker: repo.id },
      }))
    )
    .returning();
  const authoredSummary = 'I build production-ready and scalable interfaces.';
  await db
    .update(jobApplications)
    .set({
      appliedAt: null,
      status: 'SAVED',
      metadata: { currentPackageHash: originalPackage.packageHash },
    })
    .where(eq(jobApplications.id, application.id));
  const saved = await fetch(`${baseUrl}/profile`, {
    method: 'POST',
    headers: {
      cookie: `career_hub_session=${session.rawToken}`,
      origin: baseUrl,
      'x-csrf-token': generateCsrfToken(session.sessionId),
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ ...profile, summary: authoredSummary }),
  });
  assert.equal(saved.status, 200, await saved.text());
  const previousConnector = connectorRegistry.has('GITHUB_APP')
    ? connectorRegistry.get('GITHUB_APP')
    : null;
  class ReconnectionConnector extends BaseResourceConnector {
    constructor() {
      super('GITHUB_APP');
    }
    async listResources() {
      return { items: repositories, totalCount: 10, hasMore: false, nextCursor: null };
    }
  }
  connectorRegistry.register('GITHUB_APP', new ReconnectionConnector(), { allowOverride: true });
  try {
    const selected = await fetch(`${baseUrl}/onboarding/repositories/select`, {
      method: 'POST',
      headers: {
        cookie: `career_hub_session=${session.rawToken}`,
        origin: baseUrl,
        'x-csrf-token': generateCsrfToken(session.sessionId),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ from: 'sources', repositories: repositories.map((repo) => repo.id) }),
    });
    assert.equal(selected.status, 200, await selected.text());
  } finally {
    if (previousConnector)
      connectorRegistry.register('GITHUB_APP', previousConnector, { allowOverride: true });
    else connectorRegistry.clear();
  }
  const reconciled = await db
    .select()
    .from(resources)
    .where(eq(resources.connectionId, connection.id));
  assert.deepEqual(
    reconciled.map((row) => row.id).sort(),
    historicalResources.map((row) => row.id).sort()
  );
  assert.ok(reconciled.every((row) => row.status === 'ACTIVE'));
  for (const row of reconciled) assert.equal(row.metadata.historicalMarker, row.externalResourceId);
  workflowQueries.length = 0;
  const response = await fetch(`${baseUrl}/applications/${application.id}/regenerate`, {
    method: 'POST',
    headers: {
      cookie: `career_hub_session=${session.rawToken}`,
      origin: baseUrl,
      'x-csrf-token': generateCsrfToken(session.sessionId),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ scope: 'BOTH', reason: 'Synthetic recovery acceptance' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get('location'), /success=Package/);
  assert.ok(
    !workflowQueries.some(
      (query) =>
        /select .*"content".*from "tailored_documents"/.test(query) &&
        !query.includes("->>'packageHash' =")
    ),
    'BOTH regeneration must not read complete document history'
  );
  const current = await tracking.getCurrentApplicationPackage(context, application.id);
  assert.equal(current.version, 2);
  assert.equal(current.packagePayload.structuredResume.summary.text, authoredSummary);
  assert.equal(current.packagePayload.structuredResume.summary.provenanceStatus, 'CLAIMED');
  assert.equal(current.packageHash, computeApplicationPackageHash(current.packagePayload));
  assert.deepEqual(
    current.packagePayload.evidenceTrustReceipt.sources.map((source) => source.id).sort(),
    historicalResources.map((row) => row.id).sort()
  );
  const rows = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, application.id));
  const old = rows.find((row) => row.version === 1);
  assert.deepEqual(old.packagePayload, originalPackage.packagePayload);
  assert.equal(old.packageHash, originalPackage.packageHash);
  assert.equal(old.lifecycleState, 'ARCHIVED');
  const { applicationApprovalTickets } = await import('../../src/db/schema.js');
  assert.equal(
    (
      await db
        .select()
        .from(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.applicationId, application.id))
    ).length,
    0
  );
  const view = await request();
  const html = await view.text();
  assert.equal(view.status, 200, html);
  assert.doesNotMatch(html, /Application documents need regeneration|LEGACY_UNTRUSTED/);
  const [persisted] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, application.id));
  assert.equal(persisted.status, 'SAVED');
  assert.equal(persisted.appliedAt, null);
});

test('UI enrichment still resolves the exact persisted authoritative handoff package', async () => {
  const current = await tracking.getCurrentApplicationPackage(context, application.id);
  const kit = await workflow.applicationHandoffService.buildApplicationHandoffKit({
    tenantId,
    userId,
    candidateId,
    applicationId: application.id,
    applicationPackage: { ...current.packagePayload, uiOnlyFixture: 'presentation' },
  });
  assert.equal(kit.packageHash, current.packageHash);
  assert.equal(kit.resume.qaAudit.passed, true);
  const reloaded = await tracking.getCurrentApplicationPackage(context, application.id);
  assert.deepEqual(reloaded, current);
});
