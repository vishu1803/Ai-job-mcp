// Actual HTTP/PostgreSQL/storage/Chrome. No live provider or employer requests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq, and, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  jobApplications,
  applicationPackages,
  tailoredDocuments,
  resources,
  applicationApprovalTickets,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import {
  ApplicationPackageSchema,
  TruthCategoryEnum,
} from '../../src/domain/job/job-workflow.schemas.js';
import { computeApplicationPackageHash } from '../../src/domain/job/application-package-identity.js';
import { assertCurrentPackage } from '../../src/services/evidence/artifact-policy.js';
import { profile } from '../fixtures/prd003-resume-profile.js';
import {
  onePageResumeView,
  onePageResumeMarkdown,
} from '../../src/services/one-page-resume.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname)
);
assert.ok(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT);
const workflow = new JobApplicationWorkflowService({ database: db, aiProvider: false });
const compiler = new LatexCompilerService({
  pdflatexPath: 'missing-regeneration-tex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null;
workflow.applicationHandoffService.latexCompiler = compiler;
workflow.applicationHandoffService.resumeOptimizer.latexCompiler = compiler;
const tracking = new ApplicationTrackingService(db);
let app, baseUrl;
const tenantIds = [],
  skillIds = [];
before(async () => {
  app = buildApp({
    db,
    jobApplicationWorkflowService: workflow,
    applicationHandoffService: workflow.applicationHandoffService,
  });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});
after(async () => {
  try {
    if (app) await app.close();
    for (const id of tenantIds) await db.delete(tenants).where(eq(tenants.id, id));
    for (const id of skillIds) await db.delete(skills).where(eq(skills.id, id));
  } finally {
    await closeDatabase();
  }
});
async function fixture({
  historical = 'MISSING',
  historicalHash = '6355a3bca8e1f8daf4f745a2681de702382ba9486e82a271f1cd6e11676a32bf',
  skillStatuses = [],
  scopes = ['*'],
} = {}) {
  const tenantId = crypto.randomUUID(),
    userId = crypto.randomUUID(),
    candidateId = crypto.randomUUID();
  tenantIds.push(tenantId);
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Regeneration recovery fixture',
    slug: `regen-${tenantId}`,
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
  const session = await createSession(db, {
    tenantId,
    userId,
    role: 'MEMBER',
    scopes,
    deviceId: 'regen-fixture',
  });
  const request = (url, body, token = session.rawToken, csrf = true) =>
    fetch(baseUrl + url, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      headers: {
        cookie: `career_hub_session=${token}`,
        origin: baseUrl,
        ...(csrf ? { 'x-csrf-token': generateCsrfToken(session.sessionId) } : {}),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const saved = await request('/profile', {
    ...profile,
    summary: 'I study accessible interfaces.',
  });
  assert.equal(saved.status, 200, await saved.text());
  const skillRows = [];
  for (const [index, provenanceStatus] of skillStatuses.entries()) {
    const [skill] = await db
      .insert(skills)
      .values({
        slug: `regen-${tenantId}-${index}`,
        name: `Recovery Skill ${index}`,
        category: 'TOOL',
      })
      .returning();
    skillIds.push(skill.id);
    const [row] = await db
      .insert(candidateSkills)
      .values({ tenantId, candidateId, skillId: skill.id, category: 'TOOL', provenanceStatus })
      .returning();
    skillRows.push(row);
  }
  const hash = historicalHash;
  const [application] = await db
    .insert(jobApplications)
    .values({
      tenantId,
      candidateId,
      companyName: 'Recovery Lab',
      jobTitle: 'Research Assistant',
      jobUrl: 'https://employer.example.test/recovery',
      rawJobDescription: 'Document accessible interfaces.',
      status: 'SAVED',
      metadata: { currentPackageHash: hash, historicalMarker: 'preserve' },
    })
    .returning();
  let oldPackage = null;
  if (historical === 'QUARANTINED') {
    [oldPackage] = await db
      .insert(applicationPackages)
      .values({
        tenantId,
        candidateId,
        applicationId: application.id,
        version: 7,
        packageHash: hash,
        lifecycleState: 'CURRENT',
        packagePayload: {
          candidateId,
          packageHash: hash,
          tailoredResume: { markdownContent: 'OLD_UNTRUSTED_BYTES' },
          answers: { oldAnswer: 'Do not reuse' },
        },
      })
      .returning();
  }
  return {
    tenantId,
    userId,
    candidateId,
    application,
    oldPackage,
    skillRows,
    request,
    context: { tenantId, userId, candidateId, role: 'MEMBER' },
  };
}
async function persistedSuccess(f, response) {
  assert.equal(response.status, 302, await response.text());
  assert.match(
    response.headers.get('location'),
    /success=Package/,
    'A redirect to an error page is not successful regeneration'
  );
  const current = await tracking.getCurrentApplicationPackage(f.context, f.application.id);
  assert.ok(current?.packagePayload, 'Success requires the actual persisted current package');
  ApplicationPackageSchema.parse(current.packagePayload);
  assert.equal(current.packageHash, computeApplicationPackageHash(current.packagePayload));
  await assertCurrentPackage(db, f.context, current.packagePayload);
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, f.application.id));
  assert.equal(application.status, 'SAVED');
  assert.equal(application.appliedAt, null);
  assert.equal(application.metadata.currentPackageHash, current.packageHash);
  assert.equal(application.metadata.handoffKit.packageHash, current.packageHash);
  assert.equal(application.metadata.historicalMarker, 'preserve');
  assert.equal(
    (
      await db
        .select()
        .from(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.applicationId, f.application.id))
    ).length,
    0
  );
  return current;
}

test('persisted MISSING skills at the reported indices no longer become affirmative application claims', async () => {
  const missing = new Set([47, 48, 49, 54, 57, 59, 76, 78, 79, 105]);
  const f = await fixture({
    skillStatuses: Array.from({ length: 110 }, (_, i) => (missing.has(i) ? 'MISSING' : 'CLAIMED')),
  });
  const result = await workflow.regenerateApplicationPackage({
    ...f.context,
    applicationId: f.application.id,
  });
  const pkg = result.package.packagePayload;
  ApplicationPackageSchema.parse(pkg);
  assert.equal(pkg.skillGaps.length, missing.size);
  assert.ok(pkg.skillGaps.every((gap) => gap.availability === 'MISSING_EVIDENCE'));
  assert.match(
    workflow.createApplicationPreview(pkg),
    /availability gaps, not asserted qualifications/
  );
  for (const index of missing) {
    assert.ok(!pkg.claimedSkills.some((s) => s.name === `Recovery Skill ${index}`));
    assert.ok(!pkg.verifiedSkills.some((s) => s.name === `Recovery Skill ${index}`));
    assert.ok(
      !pkg.structuredResume.skills.categories
        .flatMap((c) => c.skills)
        .some((s) => s.name === `Recovery Skill ${index}`)
    );
  }
  const persistedSkills = await db
    .select()
    .from(candidateSkills)
    .where(
      and(eq(candidateSkills.tenantId, f.tenantId), eq(candidateSkills.candidateId, f.candidateId))
    );
  assert.deepEqual(
    persistedSkills.sort((a, b) => a.id.localeCompare(b.id)),
    [...f.skillRows].sort((a, b) => a.id.localeCompare(b.id))
  );
});

test('HTTP recovery creates an independent current package when the historical hash is missing', async () => {
  const f = await fixture();
  const page = await f.request(`/applications/${f.application.id}/handoff`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Application documents need regeneration/);
  const current = await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH' })
  );
  const preview = await f.request('/api/extension/preview-package', {
    applicationId: f.application.id,
    packageHash: current.packageHash,
  });
  assert.equal(preview.status, 200, await preview.text());
  const downloaded = await f.request(
    `/api/applications/${f.application.id}/artifacts/resume/download`
  );
  assert.equal(downloaded.status, 200);
  assert.equal(
    Buffer.from(await downloaded.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    '%PDF'
  );
});

test('PRD-002 saved full history survives BOTH selection, reload, edit, preview and one-page download', async () => {
  const f = await fixture();
  const persona = resumeQualityProfileByKey['long-history'].profile;
  const saved = await f.request('/profile', {
    ...persona,
    displayName: profile.displayName,
    canonicalEmail: profile.canonicalEmail,
  });
  assert.equal(saved.status, 200, await saved.text());
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  const first = await persistedSuccess(f, response);
  const pkg = first.packagePayload;
  assert.equal(pkg.structuredResume.experience.length, 15);
  assert.equal(pkg.structuredResume.presentation.mode, 'ONE_PAGE');
  assert.ok(pkg.structuredResume.presentation.decisions.length > 0);
  assert.ok(onePageResumeView(pkg.structuredResume).experience.length <= 6);
  assert.equal(pkg.tailoredResume.markdownContent, onePageResumeMarkdown(pkg.structuredResume));
  assert.equal(computeApplicationPackageHash(pkg), pkg.packageHash);
  const originalHash = pkg.packageHash;
  const originalJSON = JSON.stringify(pkg);
  const download = await f.request(
    `/api/applications/${f.application.id}/artifacts/resume/download?packageHash=${pkg.packageHash}`
  );
  assert.equal(download.status, 200);
  assert.equal(
    new PdfGeometryAnalyzer()._detectPageCount(Buffer.from(await download.arrayBuffer())),
    1
  );
  const page = await f.request(`/applications/${f.application.id}/handoff`);
  assert.match(await page.text(), /One-page A4 resume/);
  const edit = await f.request('/profile', {
    ...persona,
    displayName: profile.displayName,
    canonicalEmail: profile.canonicalEmail,
    summary: 'I document API validation and integration test behavior.',
  });
  assert.equal(edit.status, 200, await edit.text());
  await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH' })
  );
  const historical = await db
    .select()
    .from(applicationPackages)
    .where(
      and(
        eq(applicationPackages.applicationId, f.application.id),
        eq(applicationPackages.packageHash, originalHash)
      )
    );
  assert.equal(JSON.stringify(historical[0].packagePayload), originalJSON);
  assert.equal(
    (
      await db
        .select()
        .from(applicationApprovalTickets)
        .where(eq(applicationApprovalTickets.applicationId, f.application.id))
    ).length,
    0
  );
});

test('PRD-002 real HTTP overflow is actionable and cannot persist a partial package', async () => {
  const f = await fixture();
  const education = Array.from({ length: 35 }, (_, index) => ({
    id: 'degree-' + index,
    institution: 'Essential Institution ' + index,
    degree: 'BSc',
    startDate: '2018',
    endDate: '2022',
  }));
  assert.equal((await f.request('/profile', { ...profile, education })).status, 200);
  const before = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, f.application.id));
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  assert.equal(response.status, 302);
  assert.match(
    decodeURIComponent(response.headers.get('location')),
    /readable one-page A4 resume could not be produced/
  );
  const after = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, f.application.id));
  assert.deepEqual(after, before);
});

test('authenticated Applications list to handoff, regeneration and preview uses the persisted fresh package', async () => {
  const f = await fixture({ skillStatuses: ['MISSING'] });
  const listing = await f.request('/applications');
  assert.equal(listing.status, 200);
  assert.ok((await listing.text()).includes(f.application.id));
  const handoff = await f.request(`/applications/${f.application.id}/handoff`);
  assert.equal(handoff.status, 200);
  assert.match(await handoff.text(), /Application documents need regeneration/);
  const current = await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH' })
  );
  const preview = await f.request('/api/extension/preview-package', {
    applicationId: f.application.id,
    packageHash: current.packageHash,
  });
  assert.equal(preview.status, 200);
  assert.match(
    (await preview.json()).previewMarkdown,
    /Inventory skills without affirmative support/
  );
});

test('HTTP regeneration archives quarantine without rewriting historical content or granting approval', async () => {
  const f = await fixture({
    historical: 'QUARANTINED',
    skillStatuses: [
      'MISSING',
      'INFERRED',
      'CLAIMED',
      'VERIFIED',
      'CORROBORATED',
      'SELF_DECLARED',
      'LEARNING',
    ],
  });
  const oldDownload = await f.request(
    `/api/applications/${f.application.id}/artifacts/resume/download?packageHash=${f.oldPackage.packageHash}`
  );
  assert.equal(oldDownload.status, 409);
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  const current = await persistedSuccess(f, response);
  assert.equal(current.version, 8);
  assert.deepEqual(current.packagePayload.verifiedSkills, []);
  assert.ok(!current.packagePayload.claimedSkills.some((s) => s.name === 'Recovery Skill 0'));
  assert.ok(
    current.packagePayload.claimedSkills.every(
      (s) => !['VERIFIED', 'CORROBORATED'].includes(s.truthCategory)
    )
  );
  assert.equal(current.packagePayload.answers.oldAnswer, undefined);
  const [old] = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.id, f.oldPackage.id));
  assert.equal(old.packageHash, f.oldPackage.packageHash);
  assert.equal(old.version, f.oldPackage.version);
  assert.deepEqual(old.packagePayload, f.oldPackage.packagePayload);
  assert.equal(old.lifecycleState, 'ARCHIVED');
  const stillBlocked = await f.request(
    `/api/applications/${f.application.id}/artifacts/resume/download?version=7`
  );
  assert.equal(stillBlocked.status, 409);
  const page = await f.request(`/applications/${f.application.id}/handoff`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.doesNotMatch(html, /Application documents need regeneration|OLD_UNTRUSTED_BYTES/);
});

test('partial recovery fails explicitly if the omitted historical document cannot be trusted', async () => {
  const f = await fixture({ historical: 'QUARANTINED' });
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'RESUME',
  });
  assert.equal(response.status, 302);
  assert.match(decodeURIComponent(response.headers.get('location')), /error=.*Regenerate BOTH/);
  assert.deepEqual(
    await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, f.application.id)),
    [f.oldPackage]
  );
  assert.equal(
    (
      await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.applicationId, f.application.id))
    ).length,
    0
  );
});

test('inactive current source fails closed without replacing quarantine or exposing documents', async () => {
  const f = await fixture({ historical: 'QUARANTINED' });
  await db.insert(resources).values({
    tenantId: f.tenantId,
    candidateId: f.candidateId,
    provider: 'GITHUB_APP',
    externalResourceId: '909090',
    name: 'fixture/inactive',
    displayName: 'fixture/inactive',
    url: 'https://github.com/fixture/inactive',
    status: 'DISCONNECTED',
  });
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  assert.equal(response.status, 302);
  assert.match(
    decodeURIComponent(response.headers.get('location')),
    /error=.*unavailable or deselected/
  );
  assert.deepEqual(
    await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, f.application.id)),
    [f.oldPackage]
  );
  assert.equal(
    (
      await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.applicationId, f.application.id))
    ).length,
    0
  );
});

test('HTTP regeneration enforces authentication, foreign tenant, candidate ownership and read-only permissions', async () => {
  const f = await fixture();
  const foreign = await fixture();
  const denied = await foreign.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  assert.equal(denied.status, 404);
  const anonymous = await f.request(
    `/applications/${f.application.id}/regenerate`,
    { scope: 'BOTH' },
    'invalid-fixture-session'
  );
  assert.ok([401, 403, 302].includes(anonymous.status));
  const otherUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: otherUserId,
    tenantId: f.tenantId,
    email: `${otherUserId}@example.test`,
    displayName: 'Other fixture',
    role: 'MEMBER',
    status: 'ACTIVE',
  });
  const other = await createSession(db, {
    tenantId: f.tenantId,
    userId: otherUserId,
    role: 'MEMBER',
    scopes: ['*'],
    deviceId: 'regen-other',
  });
  const otherResponse = await fetch(baseUrl + `/applications/${f.application.id}/regenerate`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: `career_hub_session=${other.rawToken}`,
      origin: baseUrl,
      'x-csrf-token': generateCsrfToken(other.sessionId),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ scope: 'BOTH' }),
  });
  assert.equal(otherResponse.status, 403);
  assert.match(await otherResponse.text(), /Forbidden/);
  await assert.rejects(
    workflow.regenerateApplicationPackage({
      ...f.context,
      role: 'READONLY',
      applicationId: f.application.id,
    }),
    /READONLY/
  );
  assert.equal(
    (
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, f.application.id))
    ).length,
    0
  );
});

test('invalid saved job and invalid scope produce actionable errors before persistence', async () => {
  const f = await fixture();
  await db
    .update(jobApplications)
    .set({ jobTitle: '' })
    .where(eq(jobApplications.id, f.application.id));
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
  });
  assert.equal(response.status, 302);
  assert.match(
    decodeURIComponent(response.headers.get('location')),
    /error=.*Saved job data is invalid/
  );
  const scope = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'INVALID',
  });
  assert.equal(scope.status, 302);
  assert.match(decodeURIComponent(scope.headers.get('location')), /error=.*Choose BOTH/);
  assert.equal(
    (
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, f.application.id))
    ).length,
    0
  );
});

test('repeated regeneration preserves approved snapshots and consumed tickets; new content needs a new ticket', async () => {
  const f = await fixture();
  const first = await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, {
      scope: 'BOTH',
      reason: 'First explicit generation',
    })
  );
  const approve = await f.request(`/applications/${f.application.id}/apply/request-approval`, {
    packageHash: first.packageHash,
    packageVersion: first.version,
    destinationUrl: f.application.jobUrl,
  });
  const approvalJson = await approve.json();
  assert.equal(approve.status, 200, JSON.stringify(approvalJson));
  assert.equal(approvalJson.success, true);
  const ticketId = approvalJson.ticket.ticketId;
  await db
    .update(applicationApprovalTickets)
    .set({ status: 'CONSUMED', consumedAt: new Date() })
    .where(eq(applicationApprovalTickets.id, ticketId));
  const [ticketBefore] = await db
    .select()
    .from(applicationApprovalTickets)
    .where(eq(applicationApprovalTickets.id, ticketId));
  const oldDocuments = await db
    .select()
    .from(tailoredDocuments)
    .where(eq(tailoredDocuments.applicationId, f.application.id));
  const regenerated = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'BOTH',
    reason: 'Second explicit generation',
  });
  assert.match(regenerated.headers.get('location'), /success=Package/);
  const second = await tracking.getCurrentApplicationPackage(f.context, f.application.id);
  assert.equal(second.version, first.version + 1);
  assert.notEqual(second.packageHash, first.packageHash);
  const [old] = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.id, first.id));
  assert.deepEqual(old.packagePayload, first.packagePayload);
  assert.equal(old.packageHash, first.packageHash);
  const [ticketAfter] = await db
    .select()
    .from(applicationApprovalTickets)
    .where(eq(applicationApprovalTickets.id, ticketId));
  assert.deepEqual(ticketAfter, ticketBefore);
  assert.deepEqual(
    (
      await db
        .select()
        .from(tailoredDocuments)
        .where(eq(tailoredDocuments.applicationId, f.application.id))
    ).filter((row) => oldDocuments.some((old) => old.id === row.id)),
    oldDocuments
  );
  const fresh = await f.request(`/applications/${f.application.id}/apply/request-approval`, {
    packageHash: second.packageHash,
    packageVersion: second.version,
    destinationUrl: f.application.jobUrl,
  });
  const freshJson = await fresh.json();
  assert.equal(fresh.status, 200, JSON.stringify(freshJson));
  assert.notEqual(freshJson.ticket.ticketId, ticketId);
  const [freshTicket] = await db
    .select()
    .from(applicationApprovalTickets)
    .where(eq(applicationApprovalTickets.id, freshJson.ticket.ticketId));
  assert.equal(freshTicket.packageHash, second.packageHash);
  assert.equal(freshTicket.status, 'ISSUED');
  assert.equal(freshTicket.consumedAt, null);
});

test('concurrent HTTP regeneration serializes versions and exact artifact associations', async () => {
  const f = await fixture();
  const results = await Promise.all(
    ['A', 'B'].map((reason) =>
      f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH', reason })
    )
  );
  for (const response of results) assert.match(response.headers.get('location'), /success=Package/);
  const rows = await db
    .select()
    .from(applicationPackages)
    .where(eq(applicationPackages.applicationId, f.application.id))
    .orderBy(applicationPackages.version);
  assert.deepEqual(
    rows.map((row) => row.version),
    [1, 2]
  );
  assert.equal(rows.filter((row) => row.lifecycleState === 'CURRENT').length, 1);
  assert.equal(new Set(rows.map((row) => row.packageHash)).size, 2);
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, f.application.id));
  assert.equal(
    application.metadata.handoffKit.packageHash,
    application.metadata.currentPackageHash
  );
  const documents = await db
    .select()
    .from(tailoredDocuments)
    .where(eq(tailoredDocuments.applicationId, f.application.id));
  for (const row of rows) {
    await assertCurrentPackage(db, f.context, row.packagePayload);
    const bound = documents.filter((doc) => doc.metadata.packageHash === row.packageHash);
    assert.equal(bound.length, 2);
    assert.ok(bound.every((doc) => doc.metadata.artifact.packageHash === row.packageHash));
  }
});

test('selective regeneration cannot silently replace a trusted counterpart with newly generated bytes', async () => {
  const f = await fixture();
  const current = await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH' })
  );
  const response = await f.request(`/applications/${f.application.id}/regenerate`, {
    scope: 'COVER_LETTER',
  });
  assert.match(decodeURIComponent(response.headers.get('location')), /error=.*Choose BOTH/);
  const unchanged = await tracking.getCurrentApplicationPackage(f.context, f.application.id);
  assert.deepEqual(unchanged, current);
  assert.equal(
    (
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, f.application.id))
    ).length,
    1
  );
});

test('persisted receipt/hash and preview survive a new process plus server restart/reload', async () => {
  const f = await fixture();
  const current = await persistedSuccess(
    f,
    await f.request(`/applications/${f.application.id}/regenerate`, { scope: 'BOTH' })
  );
  const script = `import { db, closeDatabase } from './src/db/index.js'; import { ApplicationTrackingService } from './src/services/application-tracking.service.js'; const row = await new ApplicationTrackingService({ database: db }).getCurrentApplicationPackage(${JSON.stringify(f.context)}, '${f.application.id}'); console.log(JSON.stringify({ hash: row.packageHash, version: row.version })); await closeDatabase();`;
  const output = await promisify(execFile)(
    process.execPath,
    ['--import', './tests/setup/approval-signing-env.js', '--input-type=module', '-e', script],
    { timeout: 30000, env: process.env }
  );
  assert.deepEqual(JSON.parse(output.stdout.trim().split('\n').at(-1)), {
    hash: current.packageHash,
    version: current.version,
  });
  await app.close();
  const reloadedWorkflow = new JobApplicationWorkflowService({ database: db, aiProvider: false });
  app = buildApp({
    db,
    jobApplicationWorkflowService: reloadedWorkflow,
    applicationHandoffService: reloadedWorkflow.applicationHandoffService,
  });
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const preview = await f.request('/api/extension/preview-package', {
    applicationId: f.application.id,
    packageHash: current.packageHash,
  });
  assert.equal(preview.status, 200, await preview.text());
  assert.equal(
    (await tracking.getCurrentApplicationPackage(f.context, f.application.id)).packageHash,
    current.packageHash
  );
  assert.equal(
    (
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, f.application.id))
    ).length,
    1
  );
});

test('all five existing affirmative truth categories remain readable without accepting missing evidence', () => {
  for (const value of ['VERIFIED', 'CORROBORATED', 'CLAIMED', 'USER_PROVIDED', 'INFERRED'])
    assert.equal(TruthCategoryEnum.parse(value), value);
  assert.equal(TruthCategoryEnum.safeParse('MISSING_EVIDENCE').success, false);
});

test('a digits-only SHA-256 is looked up as a hash and remains quarantined rather than treated as a version', async () => {
  const f = await fixture({ historical: 'QUARANTINED', historicalHash: '6'.repeat(64) });
  await assert.rejects(
    tracking.getApplicationPackageByVersion(f.context, f.application.id, f.oldPackage.packageHash),
    (error) => error.code === 'ARTIFACT_REVALIDATION_REQUIRED'
  );
  await assert.rejects(
    tracking.getApplicationPackageByVersion(f.context, f.application.id, 7),
    (error) => error.code === 'ARTIFACT_REVALIDATION_REQUIRED'
  );
  const response = await f.request(
    `/api/applications/${f.application.id}/artifacts/resume/download?packageHash=${f.oldPackage.packageHash}`
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ARTIFACT_REVALIDATION_REQUIRED');
});

test('a real PostgreSQL package insert failure preserves the application and historical snapshots atomically', async () => {
  const f = await fixture({ historical: 'QUARANTINED' });
  const name = `regen_fault_${f.application.id.replaceAll('-', '')}`;
  await db.execute(
    sql.raw(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.application_id = '${f.application.id}'::uuid THEN RAISE EXCEPTION 'disposable regeneration insert failure'; END IF; RETURN NEW; END $$`
    )
  );
  await db.execute(
    sql.raw(
      `CREATE TRIGGER ${name} BEFORE INSERT ON application_packages FOR EACH ROW EXECUTE FUNCTION ${name}()`
    )
  );
  try {
    await assert.rejects(
      workflow.regenerateApplicationPackage({ ...f.context, applicationId: f.application.id }),
      (error) =>
        /disposable regeneration insert failure/.test(error.cause?.message || error.message)
    );
    const failedHttp = await f.request(`/applications/${f.application.id}/regenerate`, {
      scope: 'BOTH',
    });
    assert.equal(failedHttp.status, 302);
    assert.match(failedHttp.headers.get('location'), /error=/);
    assert.doesNotMatch(failedHttp.headers.get('location'), /success=/);
    const [unchanged] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, f.application.id));
    assert.deepEqual(unchanged, f.application);
    assert.deepEqual(
      await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.applicationId, f.application.id)),
      [f.oldPackage]
    );
    assert.equal(
      (
        await db
          .select()
          .from(tailoredDocuments)
          .where(eq(tailoredDocuments.applicationId, f.application.id))
      ).length,
      0
    );
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER ${name} ON application_packages`));
    await db.execute(sql.raw(`DROP FUNCTION ${name}()`));
  }
});
