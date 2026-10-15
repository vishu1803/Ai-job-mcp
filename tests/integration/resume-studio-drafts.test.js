import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resumes,
  resumeSections,
  candidateClaims,
  auditLogs,
} from '../../src/db/schema.js';
import { resumeStudioDrafts, resumeStudioRevisions } from '../../src/db/resume-studio.schema.js';
import { ResumeRepository } from '../../src/db/repositories/resume.repository.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import {
  DocumentStorageService,
  ORIGINAL_SOURCE_READ,
} from '../../src/services/document-storage.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { StudioDraftResponseSchema } from '../../src/domain/career/resume-studio-draft.schemas.js';
import { runMigrations } from '../../src/db/migrate.js';
import { studioMasterFacts } from '../fixtures/resume-studio-master.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  process.env.NODE_ENV === 'test' &&
    ['127.0.0.1', 'localhost'].includes(target.hostname) &&
    target.port === '55447' &&
    target.pathname === '/product_audit_resume_studio',
  'Only disposable Studio database allowed'
);
assert.ok(
  !process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT,
  'Use blank provider credentials'
);
const tenantA = crypto.randomUUID(),
  tenantB = crypto.randomUUID();
const people = Array.from({ length: 4 }, (_, index) => ({
  userId: crypto.randomUUID(),
  candidateId: crypto.randomUUID(),
  resumeId: crypto.randomUUID(),
  tenantId: index === 2 ? tenantB : tenantA,
}));
const jobTarget = {
  title: 'Backend Engineer',
  company: 'Fixture employer',
  sourceUrl: 'http://127.0.0.1:1/never-fetch',
  rawDescription:
    'Requirements: React and PostgreSQL experience building reliable backend systems. Document engineering decisions and maintain accessible application interfaces.',
};

describe('Resume Studio persistent drafts — real PostgreSQL, sessions and HTTP', () => {
  let app, baseUrl, storage, originalRecords, draft, readonlyDraft;
  const sessions = [],
    rawBuffers = [];
  const body = (person = 0) => ({
    source: { kind: 'RESUME', resumeId: people[person].resumeId },
    jobTarget,
  });
  const request = (method, endpoint, payload, person = 0, headers = {}) =>
    fetch(baseUrl + '/api/v1/resume-studio' + endpoint, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: `career_hub_session=${sessions[person].rawToken}`,
        'x-csrf-token': generateCsrfToken(sessions[person].sessionId),
        ...headers,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  const fresh = async () => {
    const response = await request('POST', '/drafts', body());
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    return result.data;
  };
  const sourceRecords = async () => ({
    candidates: await db.select().from(candidates).orderBy(candidates.id),
    resumes: await db.select().from(resumes).orderBy(resumes.id),
    sections: await db.select().from(resumeSections).orderBy(resumeSections.id),
    claims: await db.select().from(candidateClaims).orderBy(candidateClaims.id),
  });
  const node = (data, kind) => data.nodes.find((item) => item.kind === kind);
  const summaryPatch = (data, text = 'Candidate-authored updated source summary.') => ({
    expectedRevision: data.revision,
    edits: [{ nodeId: node(data, 'SUMMARY').nodeId, text }],
  });
  const fixture = async (filename, value) => {
    if (process.env.EXPORT_STUDIO_DRAFT_FIXTURES === '1')
      await fs.writeFile(
        new URL('../fixtures/' + filename, import.meta.url),
        JSON.stringify(value, null, 2) + '\n'
      );
  };
  before(async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-slice2-originals-'));
    storage = new DocumentStorageService({ database: db, storageDir });
    await db.insert(tenants).values([
      { id: tenantA, name: 'Studio draft fixture A', slug: 'studio2-' + tenantA },
      { id: tenantB, name: 'Studio draft fixture B', slug: 'studio2-' + tenantB },
    ]);
    const repo = new ResumeRepository(db);
    for (const [index, person] of people.entries()) {
      await db.insert(users).values({
        id: person.userId,
        tenantId: person.tenantId,
        email: 'studio2-' + person.userId + '@example.test',
        displayName: 'Source fixture ' + index,
        role: index === 1 ? 'OWNER' : 'MEMBER',
        status: 'ACTIVE',
      });
      await db.insert(candidates).values({
        id: person.candidateId,
        userId: person.userId,
        tenantId: person.tenantId,
        displayName: 'Source fixture ' + index,
        canonicalEmail: 'source-' + index + '@example.test',
        profileMetadata: {
          resumeData: {
            ...structuredClone(studioMasterFacts),
            sourceResumeId: person.resumeId,
            sourceVersion: 1,
          },
        },
      });
      const buffer = Buffer.from(
        'Source master original ' + index + '\nAsha 林\n' + studioMasterFacts.summary
      );
      rawBuffers.push(buffer);
      const stored = await storage.storeEncryptedDocument({
        tenantId: person.tenantId,
        candidateId: person.candidateId,
        buffer,
      });
      await repo.createResume({
        id: person.resumeId,
        tenantId: person.tenantId,
        candidateId: person.candidateId,
        version: 1,
        fileName: 'source-master.txt',
        mimeType: 'text/plain',
        ...stored,
        lifecycleState: 'BASE_RESUME',
        isBaseResume: true,
        reviewedAt: new Date(),
        metadata: { format: 'TXT', uploadedByUserId: person.userId },
      });
      await repo.createResumeSections([
        {
          tenantId: person.tenantId,
          candidateId: person.candidateId,
          resumeId: person.resumeId,
          sectionType: 'SUMMARY',
          orderIndex: 0,
          rawText: studioMasterFacts.summary,
          structuredData: { content: studioMasterFacts.summary },
        },
      ]);
      await repo.createCandidateClaims([
        {
          tenantId: person.tenantId,
          candidateId: person.candidateId,
          resumeId: person.resumeId,
          claimType: 'PROJECT',
          statement: studioMasterFacts.projects[0].description,
          provenanceStatus: 'CLAIMED',
          isCorroborated: false,
        },
      ]);
      sessions.push(await createSession(db, person));
    }
    readonlyDraft = await new ResumeStudioDraftService({ database: db }).create(
      { ...people[3], role: 'MEMBER' },
      body(3)
    );
    await db.update(users).set({ role: 'READONLY' }).where(eq(users.id, people[3].userId));
    originalRecords = await sourceRecords();
    app = buildApp({ db, logger: false });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    await db.execute(sql`CREATE FUNCTION studio_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF current_setting('studio.fixture_fail_audit', true) = '1' AND NEW.event_type LIKE 'resume_studio.%' THEN
        RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
    await db.execute(
      sql`CREATE TRIGGER studio_fixture_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION studio_fixture_audit_failure()`
    );
  });
  after(async () => {
    await app?.close();
    await db.execute(sql`DROP TRIGGER IF EXISTS studio_fixture_audit_failure ON audit_logs`);
    await db.execute(sql`DROP FUNCTION IF EXISTS studio_fixture_audit_failure()`);
    await db.delete(tenants).where(eq(tenants.id, tenantA));
    await db.delete(tenants).where(eq(tenants.id, tenantB));
    await closeDatabase();
  });
  it('creates an independent job-bound full-source draft with canonical contract', async () => {
    const response = await request('POST', '/drafts', body());
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    draft = result.data;
    StudioDraftResponseSchema.parse(draft);
    assert.equal(draft.contractVersion, '1.1.0');
    assert.equal(draft.revision, 1);
    assert.equal(draft.status, 'DRAFT');
    assert.notEqual(draft.id, draft.sourceResumeId);
    assert.equal(draft.sourceResumeId, people[0].resumeId);
    assert.equal(draft.structuredResume.projects.length, 5);
    assert.equal(draft.selection.projectIds.length, 2);
    assert.equal(draft.jobTarget.title, 'Backend Engineer');
    assert.equal(draft.jobDescription.tenantId, tenantA);
    assert.equal(draft.structuredResume.experience[0].id, 'source-exp-1');
    assert.equal(draft.structuredResume.candidateIdentity.headline, null);
    assert.equal(response.headers.get('location'), '/api/v1/resume-studio/drafts/' + draft.id);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await fixture('resume-studio-draft-created.json', result);
    await fixture('resume-studio-draft-create-request.json', body());
  });
  it('persists edits and each include/exclude category with revision increment', async () => {
    const bullet = node(draft, 'BULLET');
    const patch = {
      expectedRevision: 1,
      edits: [
        { nodeId: bullet.nodeId, text: 'Candidate-authored revised React interface wording.' },
      ],
      selection: {
        experienceIds: [],
        projectIds: [],
        bulletIds: draft.selection.bulletIds.filter((id) => id !== bullet.nodeId),
        skillIds: [],
      },
    };
    const response = await request('PATCH', '/drafts/' + draft.id, patch),
      result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    const next = result.data;
    assert.equal(next.revision, 2);
    assert.notEqual(next.contentHash, draft.contentHash);
    assert.equal(next.sourceSnapshotHash, draft.sourceSnapshotHash);
    assert.deepEqual(next.masterSnapshot, draft.masterSnapshot);
    assert.deepEqual(next.nodes, draft.nodes);
    assert.deepEqual(next.selection.projectIds, []);
    assert.equal(next.structuredResume.experience[0].bullets[0], patch.edits[0].text);
    assert.equal(next.structuredResume.projects.length, 5);
    assert.equal(next.structuredResume.skills.length, 3);
    assert.deepEqual(next.nodeProvenance[bullet.nodeId], {
      truthState: 'CLAIMED',
      editedAtRevision: 2,
    });
    await fixture('resume-studio-draft-update-request.json', patch);
    await fixture('resume-studio-draft-updated.json', result);
    draft = next;
    const retrieved = await (await request('GET', '/drafts/' + draft.id)).json();
    assert.deepEqual(retrieved.data, draft);
  });
  it('selection-only and no-op edits still advance authority; parent flags retain bullet flags', async () => {
    const response = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: draft.revision,
      selection: {
        experienceIds: draft.nodes
          .filter((item) => item.kind === 'EXPERIENCE')
          .map((item) => item.nodeId),
      },
    });
    const next = (await response.json()).data;
    assert.equal(response.status, 200);
    assert.equal(next.revision, 3);
    assert.deepEqual(next.selection.bulletIds, draft.selection.bulletIds);
    draft = next;
    const summary = node(draft, 'SUMMARY');
    const noop = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: draft.revision,
      edits: [{ nodeId: summary.nodeId, text: draft.structuredResume.summary.text }],
    });
    draft = (await noop.json()).data;
    assert.equal(draft.revision, 4);
  });
  it('stale updates return409 without overwriting text, selection, hash or history', async () => {
    const count = (
      await db
        .select()
        .from(resumeStudioRevisions)
        .where(eq(resumeStudioRevisions.draftId, draft.id))
    ).length;
    const response = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      selection: { bulletIds: [] },
    });
    const result = await response.json();
    assert.equal(response.status, 409, JSON.stringify(result));
    assert.equal(result.error.code, 'CONFLICT');
    assert.equal(result.error.details[0].reason, 'DRAFT_REVISION_CONFLICT');
    assert.equal(result.error.details[0].actualRevision, draft.revision);
    await fixture('resume-studio-draft-conflict.json', result);
    assert.deepEqual((await (await request('GET', '/drafts/' + draft.id)).json()).data, draft);
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioRevisions)
          .where(eq(resumeStudioRevisions.draftId, draft.id))
      ).length,
      count
    );
  });
  it('ABA text restoration cannot authorize a request from the old revision', async () => {
    const first = await fresh(),
      original = first.structuredResume.summary.text;
    const second = (
      await (await request('PATCH', '/drafts/' + first.id, summaryPatch(first))).json()
    ).data;
    const third = (
      await (await request('PATCH', '/drafts/' + first.id, summaryPatch(second, original))).json()
    ).data;
    assert.equal(third.structuredResume.summary.text, original);
    assert.equal(third.revision, 3);
    assert.equal((await request('PATCH', '/drafts/' + first.id, summaryPatch(first))).status, 409);
  });
  it('competing HTTP requests produce exactly one winner', async () => {
    const first = await fresh();
    const responses = await Promise.all([
      request('PATCH', '/drafts/' + first.id, summaryPatch(first, 'Candidate wording A.')),
      request('PATCH', '/drafts/' + first.id, summaryPatch(first, 'Candidate wording B.')),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const winner = await responses.find((response) => response.status === 200).json();
    assert.equal(winner.data.revision, 2);
    assert.deepEqual(
      (await (await request('GET', '/drafts/' + first.id)).json()).data,
      winner.data
    );
  });
  it('independent SQL clients/service instances share authoritative concurrency control', async () => {
    const first = await fresh(),
      pools = [
        new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
        new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
      ];
    try {
      const services = pools.map(
        (pool) => new ResumeStudioDraftService({ database: drizzle(pool) })
      );
      const results = await Promise.allSettled(
        services.map((service, index) =>
          service.update(
            { ...people[0], role: 'MEMBER' },
            first.id,
            summaryPatch(first, 'Independent process wording ' + index + '.')
          )
        )
      );
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.statusCode, 409);
    } finally {
      await Promise.all(pools.map((pool) => pool.end()));
    }
  });
  it('invalid mixed edit/selection requests roll back entirely', async () => {
    const first = await fresh(),
      revisions = await db
        .select()
        .from(resumeStudioRevisions)
        .where(eq(resumeStudioRevisions.draftId, first.id));
    for (const selection of [
      { skillIds: [node(first, 'PROJECT').nodeId] },
      { projectIds: [crypto.randomUUID()] },
      {
        projectIds: first.nodes
          .filter((item) => item.kind === 'PROJECT')
          .map((item) => item.nodeId),
      },
    ]) {
      const response = await request('PATCH', '/drafts/' + first.id, {
        ...summaryPatch(first),
        selection,
      });
      assert.equal(response.status, 400);
    }
    assert.deepEqual((await (await request('GET', '/drafts/' + first.id)).json()).data, first);
    assert.deepEqual(
      await db
        .select()
        .from(resumeStudioRevisions)
        .where(eq(resumeStudioRevisions.draftId, first.id)),
      revisions
    );
  });
  it('an audit write failure rolls back the draft update and revision append', async () => {
    const first = await fresh();
    const failingDatabase = {
      transaction: (work) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL studio.fixture_fail_audit = '1'`);
          return work(tx);
        }),
    };
    await assert.rejects(
      new ResumeStudioDraftService({ database: failingDatabase }).update(
        { ...people[0], role: 'MEMBER' },
        first.id,
        summaryPatch(first)
      )
    );
    assert.deepEqual((await (await request('GET', '/drafts/' + first.id)).json()).data, first);
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioRevisions)
          .where(eq(resumeStudioRevisions.draftId, first.id))
      ).length,
      1
    );
  });
  it('persists across new service and application instances', async () => {
    assert.deepEqual(
      await new ResumeStudioDraftService({ database: db }).get(people[0], draft.id),
      draft
    );
    await app.close();
    app = buildApp({ db, logger: false });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    assert.deepEqual((await (await request('GET', '/drafts/' + draft.id)).json()).data, draft);
  });
  it('creation audit failure rolls back new draft and revision records', async () => {
    const beforeDrafts = await db.select().from(resumeStudioDrafts).orderBy(resumeStudioDrafts.id);
    const beforeRevisions = await db
      .select()
      .from(resumeStudioRevisions)
      .orderBy(resumeStudioRevisions.draftId, resumeStudioRevisions.revision);
    const failingDatabase = {
      transaction: (work) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL studio.fixture_fail_audit = '1'`);
          return work(tx);
        }),
    };
    await assert.rejects(
      new ResumeStudioDraftService({ database: failingDatabase }).create(
        { ...people[0], role: 'MEMBER' },
        body()
      )
    );
    assert.deepEqual(
      await db.select().from(resumeStudioDrafts).orderBy(resumeStudioDrafts.id),
      beforeDrafts
    );
    assert.deepEqual(
      await db
        .select()
        .from(resumeStudioRevisions)
        .orderBy(resumeStudioRevisions.draftId, resumeStudioRevisions.revision),
      beforeRevisions
    );
  });
  it('independent clones have distinct identities/hashes and accept four selected projects', async () => {
    const first = await fresh(),
      second = await fresh();
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.contentHash, second.contentHash);
    assert.equal(first.sourceSnapshotHash, second.sourceSnapshotHash);
    const projectIds = first.nodes
      .filter((item) => item.kind === 'PROJECT')
      .slice(1, 5)
      .map((item) => item.nodeId);
    const response = await request('PATCH', '/drafts/' + first.id, {
      expectedRevision: 1,
      selection: { projectIds },
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(result.data.selection.projectIds, projectIds);
    assert.equal(result.data.structuredResume.projects.length, 5);
    assert.deepEqual((await (await request('GET', '/drafts/' + second.id)).json()).data, second);
  });
  it('foreign tenants and same-tenant OWNER cannot read, mutate or clone another user', async () => {
    for (const person of [1, 2]) {
      assert.equal((await request('GET', '/drafts/' + draft.id, undefined, person)).status, 404);
      assert.equal(
        (await request('PATCH', '/drafts/' + draft.id, summaryPatch(draft), person)).status,
        404
      );
      assert.equal((await request('POST', '/drafts', body(), person)).status, 404);
    }
    assert.equal((await request('GET', '/drafts/' + crypto.randomUUID())).status, 404);
  });
  it('READONLY can read own draft but cannot create/update even with valid CSRF', async () => {
    assert.equal((await request('GET', '/drafts/' + readonlyDraft.id, undefined, 3)).status, 200);
    assert.equal((await request('POST', '/drafts', body(3), 3)).status, 403);
    assert.equal(
      (await request('PATCH', '/drafts/' + readonlyDraft.id, summaryPatch(readonlyDraft), 3))
        .status,
      403
    );
  });
  it('enforces session/CSRF and strict revision/identity/provenance contracts', async () => {
    assert.equal(
      (await request('GET', '/drafts/' + draft.id, undefined, 0, { cookie: '' })).status,
      401
    );
    for (const headers of [
      { origin: 'https://foreign.test' },
      { origin: '' },
      { 'x-csrf-token': '' },
      { 'x-csrf-token': generateCsrfToken(sessions[1].sessionId) },
    ]) {
      assert.equal((await request('POST', '/drafts', body(), 0, headers)).status, 403);
      assert.equal(
        (await request('PATCH', '/drafts/' + draft.id, summaryPatch(draft), 0, headers)).status,
        403
      );
    }
    for (const patch of [
      { edits: summaryPatch(draft).edits },
      { ...summaryPatch(draft), approved: true },
      { ...summaryPatch(draft), revision: 900 },
      { ...summaryPatch(draft), tenantId: tenantB },
      { ...summaryPatch(draft), nodeProvenance: { truthState: 'VERIFIED' } },
      {
        expectedRevision: draft.revision,
        selection: { skillIds: [draft.selection.skillIds[0], draft.selection.skillIds[0]] },
      },
    ]) {
      assert.equal((await request('PATCH', '/drafts/' + draft.id, patch)).status, 400);
    }
    assert.equal((await request('GET', '/drafts/not-a-uuid')).status, 400);
  });
  it('rejects unreviewed/non-master and stale canonical master versions', async () => {
    const person = people[0],
      master = originalRecords.resumes.find((row) => row.id === person.resumeId);
    await db
      .update(resumes)
      .set({ isBaseResume: false, lifecycleState: 'PARSED' })
      .where(eq(resumes.id, person.resumeId));
    const unreviewed = await request('POST', '/drafts', body());
    assert.equal(unreviewed.status, 409);
    assert.equal((await unreviewed.json()).error.details[0].reason, 'MASTER_NOT_READY');
    await db
      .update(resumes)
      .set({ isBaseResume: master.isBaseResume, lifecycleState: master.lifecycleState, version: 2 })
      .where(eq(resumes.id, person.resumeId));
    const stale = await request('POST', '/drafts', body());
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.details[0].reason, 'MASTER_SNAPSHOT_UNAVAILABLE');
    await db
      .update(resumes)
      .set({ version: master.version })
      .where(eq(resumes.id, person.resumeId));
  });
  it('encrypts source/revisions without plaintext facts and keeps sanitized atomic history', async () => {
    const [row] = await db
      .select()
      .from(resumeStudioDrafts)
      .where(eq(resumeStudioDrafts.id, draft.id));
    for (const encrypted of [row.encryptedSource, row.encryptedContent]) {
      assert.ok(!encrypted.includes('Source Company'));
      assert.ok(!encrypted.includes('Candidate-authored'));
      assert.ok(!encrypted.includes('Asha'));
    }
    const history = await db
      .select()
      .from(resumeStudioRevisions)
      .where(eq(resumeStudioRevisions.draftId, draft.id));
    assert.deepEqual(history.map((item) => item.revision).sort(), [1, 2, 3, 4]);
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, draft.id));
    assert.equal(audits.length, 4);
    assert.ok(!JSON.stringify(audits).includes('Source Company'));
    assert.ok(!JSON.stringify(audits).includes('Candidate-authored revised'));
  });
  it('database guards reject source/owner mutation, revision rollback and history rewriting', async () => {
    await assert.rejects(
      db.execute(
        sql`UPDATE resume_studio_drafts SET user_id=${people[1].userId}, revision=revision+1 WHERE id=${draft.id}`
      )
    );
    await assert.rejects(
      db.execute(
        sql`UPDATE resume_studio_drafts SET encrypted_source='changed', revision=revision+1 WHERE id=${draft.id}`
      )
    );
    await assert.rejects(
      db.execute(sql`UPDATE resume_studio_drafts SET revision=1 WHERE id=${draft.id}`)
    );
    await assert.rejects(
      db.execute(
        sql`UPDATE resume_studio_revisions SET encrypted_content='changed' WHERE draft_id=${draft.id}`
      )
    );
    assert.deepEqual((await (await request('GET', '/drafts/' + draft.id)).json()).data, draft);
  });
  it('rejects ciphertext swapping and replay even if stored hashes are also replaced', async () => {
    const a = await fresh(),
      b = await fresh();
    const [other] = await db
      .select()
      .from(resumeStudioDrafts)
      .where(eq(resumeStudioDrafts.id, b.id));
    await db.execute(
      sql`UPDATE resume_studio_drafts SET encrypted_content=${other.encryptedContent}, content_hash=${other.contentHash}, revision=revision+1 WHERE id=${a.id}`
    );
    const swapped = await request('GET', '/drafts/' + a.id);
    assert.equal(swapped.status, 500);
    assert.equal((await swapped.json()).error.code, 'DRAFT_INTEGRITY_FAILED');
    const replay = await fresh(),
      [old] = await db
        .select()
        .from(resumeStudioDrafts)
        .where(eq(resumeStudioDrafts.id, replay.id));
    assert.equal(
      (await request('PATCH', '/drafts/' + replay.id, summaryPatch(replay))).status,
      200
    );
    await db.execute(
      sql`UPDATE resume_studio_drafts SET encrypted_content=${old.encryptedContent}, content_hash=${old.contentHash}, revision=revision+1 WHERE id=${replay.id}`
    );
    assert.equal((await request('GET', '/drafts/' + replay.id)).status, 500);
  });
  it('master bytes, sections, canonical facts and approval/package state remain unchanged', async () => {
    assert.deepEqual(await sourceRecords(), originalRecords);
    for (const [index, person] of people.entries()) {
      const master = originalRecords.resumes.find((row) => row.id === person.resumeId);
      const bytes = await storage.getDecryptedDocument({
        tenantId: person.tenantId,
        candidateId: person.candidateId,
        storageKey: master.storageKey,
        sourceOriginalAuthority: ORIGINAL_SOURCE_READ,
      });
      assert.deepEqual(bytes, rawBuffers[index]);
    }
    const counts =
      await db.execute(sql`SELECT (SELECT count(*) FROM job_applications) AS applications,
      (SELECT count(*) FROM application_packages) AS packages, (SELECT count(*) FROM application_approval_tickets) AS approvals`);
    for (const value of Object.values(counts.rows[0])) assert.equal(Number(value), 0);
  });
  it('reuses the actual upload/review/master pipeline and preserves original download bytes', async () => {
    const tenantId = crypto.randomUUID(),
      userId = crypto.randomUUID(),
      candidateId = crypto.randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: 'Studio source lifecycle fixture',
      slug: 'studio-source-' + tenantId,
    });
    try {
      await db.insert(users).values({
        id: userId,
        tenantId,
        email: 'source-' + userId + '@example.test',
        displayName: 'Source lifecycle fixture',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
      await db
        .insert(candidates)
        .values({ id: candidateId, userId, tenantId, displayName: 'Source lifecycle fixture' });
      const session = await createSession(db, { tenantId, userId });
      const headers = {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: 'career_hub_session=' + session.rawToken,
        'x-csrf-token': generateCsrfToken(session.sessionId),
      };
      const bytes = Buffer.from(
        'SUMMARY\nI build accessible React user interfaces.\n\nTECHNICAL SKILLS\nReact, PostgreSQL\n'
      );
      const upload = await fetch(baseUrl + '/resumes/upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base64Content: bytes.toString('base64'),
          fileName: 'source-lifecycle.txt',
          mimeType: 'text/plain',
        }),
      });
      const uploaded = await upload.json();
      assert.equal(upload.status, 201, JSON.stringify(uploaded));
      const resumeId = uploaded.data.resume.id;
      const review = await fetch(baseUrl + '/resumes/' + resumeId + '/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ promoteToBase: true, approvedSkillClaims: [] }),
      });
      const reviewed = await review.json();
      assert.equal(review.status, 200, JSON.stringify(reviewed));
      const created = await fetch(baseUrl + '/api/v1/resume-studio/drafts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: { kind: 'RESUME', resumeId }, jobTarget }),
      });
      const result = await created.json();
      assert.equal(created.status, 201, JSON.stringify(result));
      assert.equal(
        result.data.structuredResume.summary.text,
        'I build accessible React user interfaces.'
      );
      assert.equal(result.data.structuredResume.candidateIdentity.headline, null);
      const download = await fetch(baseUrl + '/resumes/' + resumeId + '/download', { headers });
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      const [source] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
      assert.equal(source.isBaseResume, true);
      assert.equal(source.version, 1);
    } finally {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
  });
  it('migration replay preserves existing source and draft data', async () => {
    await runMigrations();
    assert.deepEqual(await sourceRecords(), originalRecords);
    assert.deepEqual((await (await request('GET', '/drafts/' + draft.id)).json()).data, draft);
    const count = await db.execute(sql`SELECT count(*) FROM drizzle.__drizzle_migrations`);
    assert.equal(Number(count.rows[0].count), 25);
  });
  it('deleting the source does not delete its independent draft; tenant deletion cascades drafts', async () => {
    const independent = await new ResumeStudioDraftService({ database: db }).create(
      { ...people[2], role: 'MEMBER' },
      body(2)
    );
    await db.delete(resumes).where(eq(resumes.id, people[2].resumeId));
    assert.deepEqual(
      await new ResumeStudioDraftService({ database: db }).get(people[2], independent.id),
      independent
    );
    await db.delete(tenants).where(eq(tenants.id, tenantB));
    assert.equal(
      (await db.select().from(resumeStudioDrafts).where(eq(resumeStudioDrafts.tenantId, tenantB)))
        .length,
      0
    );
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioRevisions)
          .where(eq(resumeStudioRevisions.draftId, independent.id))
      ).length,
      0
    );
  });
});
