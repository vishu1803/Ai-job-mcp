import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resumes,
  resumeSections,
  candidateClaims,
  applicationPackages,
  applicationApprovalTickets,
  jobApplications,
  auditLogs,
} from '../../src/db/schema.js';
import {
  resumeStudioDrafts,
  resumeStudioRevisions,
  resumeStudioProposals,
} from '../../src/db/resume-studio.schema.js';
import { ResumeRepository } from '../../src/db/repositories/resume.repository.js';
import {
  DocumentStorageService,
  ORIGINAL_SOURCE_READ,
} from '../../src/services/document-storage.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { ResumeStudioProposalService } from '../../src/services/resume-studio-proposal.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { sealGeneratedPackage } from '../../src/services/evidence/artifact-policy.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { buildApp } from '../../src/app.js';
import {
  StudioProposalResponseSchema,
  StudioProposalDecisionResponseSchema,
} from '../../src/domain/career/resume-studio-proposal.schemas.js';
import { studioMasterFacts } from '../fixtures/resume-studio-master.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  process.env.NODE_ENV === 'test' &&
    target.hostname === '127.0.0.1' &&
    target.port === '55447' &&
    target.pathname === '/product_audit_resume_studio',
  'Only isolated Studio test database permitted'
);
assert.ok(
  !process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT,
  'Use synthetic AI only'
);
const tenantA = crypto.randomUUID(),
  tenantB = crypto.randomUUID();
const people = Array.from({ length: 4 }, (_, index) => ({
  tenantId: index === 2 ? tenantB : tenantA,
  userId: crypto.randomUUID(),
  candidateId: crypto.randomUUID(),
  resumeId: crypto.randomUUID(),
}));
const original =
  'Implemented React views with the use of component interfaces in order to support internal workflows.';
const jobTarget = {
  title: 'Frontend Engineer',
  rawDescription:
    'Requirements: React experience building accessible frontend systems. Kubernetes experience is required. Maintain readable interfaces and document engineering decisions.',
};
const context = (index = 0) => ({ ...people[index], role: 'MEMBER' });

describe('Studio proposal lifecycle — real PostgreSQL/HTTP, synthetic AI only', () => {
  let app, baseUrl, storage, baseline, approved, createdFixture, pendingFixture;
  let mode = 'supported',
    entered,
    release;
  const sessions = [],
    buffers = [],
    calls = [];
  const provider = {
    async generateStructured(request) {
      calls.push(request);
      if (mode === 'failure') throw new Error('PRIVATE PROVIDER ERROR DO NOT EXPOSE');
      if (mode === 'paused') {
        entered();
        await new Promise((resolve) => {
          release = resolve;
        });
      }
      const supported = request.candidateFacts.variants.at(-1);
      let data = { proposedText: supported, factIds: ['fact-1'], truthState: 'CLAIMED' };
      if (mode === 'metric')
        data.proposedText = supported.replace('.', ' delivering 90% faster performance.');
      if (mode === 'keyword') data.proposedText = supported.replace('React', 'Kubernetes');
      if (mode === 'verified') data.truthState = 'VERIFIED';
      if (mode === 'foreignFact') data.factIds = ['fact-99'];
      return { data, provider: 'mock', modelId: 'synthetic-studio' };
    },
  };
  const request = (method, suffix, payload, person = 0, headers = {}) =>
    fetch(baseUrl + '/api/v1/resume-studio' + suffix, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: baseUrl,
        cookie: 'career_hub_session=' + sessions[person].rawToken,
        'x-csrf-token': generateCsrfToken(sessions[person].sessionId),
        ...headers,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
  const create = async (person = 0) => {
    const response = await request(
      'POST',
      '/drafts',
      { source: { kind: 'RESUME', resumeId: people[person].resumeId }, jobTarget },
      person
    );
    const value = await response.json();
    assert.equal(response.status, 201, JSON.stringify(value));
    return value.data;
  };
  const bullet = (draft) =>
    draft.nodes.find((node) => node.kind === 'BULLET' && node.path[0] === 'experience');
  const generateBody = (draft, extras = {}) => ({
    expectedRevision: draft.revision,
    nodeId: bullet(draft).nodeId,
    ...extras,
  });
  const generate = async (draft, extras = {}) => {
    const response = await request(
      'POST',
      '/drafts/' + draft.id + '/proposals',
      generateBody(draft, extras)
    );
    const value = await response.json();
    assert.equal(response.status, 201, JSON.stringify(value));
    return value.data;
  };
  const decide = (draft, proposal, decision = 'ACCEPT', revision = draft.revision) =>
    request('POST', '/drafts/' + draft.id + '/proposals/' + proposal.id + '/decision', {
      expectedRevision: revision,
      decision,
    });
  const get = async (draft) => (await (await request('GET', '/drafts/' + draft.id)).json()).data;
  const proposePath = (draft, proposal) => '/drafts/' + draft.id + '/proposals/' + proposal.id;
  const dump = async (filename, value) => {
    if (process.env.EXPORT_STUDIO_PROPOSAL_FIXTURES === '1')
      await fs.writeFile(
        new URL('../fixtures/' + filename, import.meta.url),
        JSON.stringify(value, null, 2) + '\n'
      );
  };
  const preserved = async () => ({
    candidates: await db.select().from(candidates).orderBy(candidates.id),
    resumes: await db.select().from(resumes).orderBy(resumes.id),
    sections: await db.select().from(resumeSections).orderBy(resumeSections.id),
    claims: await db.select().from(candidateClaims).orderBy(candidateClaims.id),
    packages: await db.select().from(applicationPackages).orderBy(applicationPackages.id),
    tickets: await db
      .select()
      .from(applicationApprovalTickets)
      .orderBy(applicationApprovalTickets.id),
    applications: await db.select().from(jobApplications).orderBy(jobApplications.id),
  });
  before(async () => {
    storage = new DocumentStorageService({
      database: db,
      storageDir: await fs.mkdtemp(path.join(os.tmpdir(), 'studio-proposal-originals-')),
    });
    await db.insert(tenants).values([
      { id: tenantA, name: 'Proposal fixture A', slug: 'proposal-' + tenantA },
      { id: tenantB, name: 'Proposal fixture B', slug: 'proposal-' + tenantB },
    ]);
    const repo = new ResumeRepository(db);
    for (const [index, person] of people.entries()) {
      await db.insert(users).values({
        id: person.userId,
        tenantId: person.tenantId,
        email: 'proposal-' + person.userId + '@example.test',
        displayName: 'Synthetic proposal owner',
        role: index === 1 ? 'OWNER' : 'MEMBER',
        status: 'ACTIVE',
      });
      const master = structuredClone(studioMasterFacts);
      master.experience[0].bullets[0] = original;
      await db.insert(candidates).values({
        id: person.candidateId,
        userId: person.userId,
        tenantId: person.tenantId,
        displayName: 'Synthetic proposal owner',
        profileMetadata: {
          resumeData: { ...master, sourceResumeId: person.resumeId, sourceVersion: 1 },
        },
      });
      const buffer = Buffer.from('Immutable master source\n' + original);
      buffers.push(buffer);
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
        fileName: 'proposal-master.txt',
        mimeType: 'text/plain',
        ...stored,
        lifecycleState: 'BASE_RESUME',
        isBaseResume: true,
      });
      await repo.createResumeSections([
        {
          tenantId: person.tenantId,
          candidateId: person.candidateId,
          resumeId: person.resumeId,
          sectionType: 'WORK_EXPERIENCE',
          rawText: original,
          structuredData: { source: 'candidate-authored' },
          orderIndex: 0,
        },
      ]);
      await repo.createCandidateClaims([
        {
          tenantId: person.tenantId,
          candidateId: person.candidateId,
          resumeId: person.resumeId,
          claimType: 'EXPERIENCE',
          statement: original,
          provenanceStatus: 'CLAIMED',
        },
      ]);
      sessions.push(await createSession(db, person));
    }
    const appId = crypto.randomUUID(),
      destinationUrl = 'https://portal.example.test/approved';
    const pkg = await sealGeneratedPackage(db, context(), {
      candidateId: people[0].candidateId,
      targetJob: {
        id: appId,
        title: 'Engineer',
        company: 'Fixture employer',
        applicationUrl: destinationUrl,
        source: 'MANUAL',
        description: 'Reviewed synthetic job',
      },
      tailoredResume: {
        title: 'Resume',
        markdownContent: 'Immutable approved resume',
        contentHash: 'a'.repeat(64),
      },
      coverLetter: {
        title: 'Letter',
        markdownContent: 'Immutable approved letter',
        contentHash: 'b'.repeat(64),
      },
      verifiedSkills: [],
      claimedSkills: [],
      portfolioLinks: [],
      answers: {},
    });
    await db.insert(jobApplications).values({
      id: appId,
      tenantId: tenantA,
      candidateId: people[0].candidateId,
      companyName: 'Fixture employer',
      jobTitle: 'Engineer',
      jobUrl: destinationUrl,
      status: 'APPROVED',
    });
    await db.insert(applicationPackages).values({
      tenantId: tenantA,
      candidateId: people[0].candidateId,
      applicationId: appId,
      version: 1,
      packageHash: pkg.packageHash,
      packagePayload: pkg,
    });
    await new JobApplicationWorkflowService({ database: db }).requestApplicationApproval({
      ...context(),
      applicationId: appId,
      jobId: appId,
      destinationUrl,
      packageHash: pkg.packageHash,
      packageVersion: 1,
    });
    approved = pkg;
    app = buildApp({ db, logger: false, resumeStudioAiProvider: provider });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    baseline = await preserved();
    await db.execute(sql`CREATE FUNCTION studio_proposal_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('studio.proposal_fail',true)='1' AND NEW.event_type LIKE 'resume_studio.proposal_%' THEN
        RAISE EXCEPTION 'synthetic proposal audit failure'; END IF; RETURN NEW; END $$`);
    await db.execute(
      sql`CREATE TRIGGER studio_proposal_fixture_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION studio_proposal_fixture_failure()`
    );
  });
  after(async () => {
    release?.();
    await app?.close();
    await db.execute(sql`DROP TRIGGER IF EXISTS studio_proposal_fixture_failure ON audit_logs`);
    await db.execute(sql`DROP FUNCTION IF EXISTS studio_proposal_fixture_failure()`);
    await db.delete(tenants).where(eq(tenants.id, tenantA));
    await db.delete(tenants).where(eq(tenants.id, tenantB));
    await closeDatabase();
  });
  it('generates a pending source-grounded proposal without applying it', async () => {
    const draft = await create(),
      response = await request('POST', '/drafts/' + draft.id + '/proposals', generateBody(draft));
    const value = await response.json();
    assert.equal(response.status, 201, JSON.stringify(value));
    StudioProposalResponseSchema.parse(value.data);
    assert.equal(value.data.status, 'PENDING');
    assert.equal(value.data.originalText, original);
    assert.equal(
      value.data.proposedText,
      'Implemented React views using component interfaces to support internal workflows.'
    );
    assert.equal(value.data.truthState, 'CLAIMED');
    assert.equal(value.data.claimLabel, '[Unverified User Claim]');
    assert.equal(value.data.evidenceLinks[0].type, 'CANDIDATE_CLAIM');
    assert.equal(value.data.evidenceLinks[0].sourceKind, 'MASTER_SNAPSHOT');
    assert.ok(value.data.jobRequirement);
    assert.equal(value.data.jobRequirement.sourceCovered, true);
    assert.deepEqual(await get(draft), draft);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    createdFixture = draft;
    pendingFixture = value.data;
    await dump('resume-studio-proposal-created.json', value);
    await dump('resume-studio-proposal-generate-request.json', generateBody(draft));
  });
  it('accepts exactly once and atomically writes one revision, decision and provenance', async () => {
    const response = await decide(createdFixture, pendingFixture);
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    StudioProposalDecisionResponseSchema.parse(value.data);
    assert.equal(value.data.proposal.status, 'ACCEPTED');
    assert.equal(value.data.draft.revision, createdFixture.revision + 1);
    assert.equal(
      value.data.draft.structuredResume.experience[0].bullets[0],
      pendingFixture.proposedText
    );
    assert.deepEqual(value.data.draft.masterSnapshot, createdFixture.masterSnapshot);
    assert.equal(value.data.draft.nodeProvenance[pendingFixture.nodeId].truthState, 'CLAIMED');
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioRevisions)
          .where(eq(resumeStudioRevisions.draftId, createdFixture.id))
      ).length,
      2
    );
    await dump('resume-studio-proposal-accepted.json', value);
    await dump('resume-studio-proposal-decision-request.json', {
      expectedRevision: 1,
      decision: 'ACCEPT',
    });
    const replay = await decide(
      createdFixture,
      pendingFixture,
      'ACCEPT',
      value.data.draft.revision
    );
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).error.details[0].reason, 'PROPOSAL_ALREADY_DECIDED');
  });
  it('rejects without editing the draft or changing its revision; replay is refused', async () => {
    const draft = await create(),
      proposal = await generate(draft),
      response = await decide(draft, proposal, 'REJECT');
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    assert.equal(value.data.proposal.status, 'REJECTED');
    assert.deepEqual(value.data.draft, draft);
    assert.deepEqual(await get(draft), draft);
    assert.equal((await decide(draft, proposal, 'ACCEPT')).status, 409);
    await dump('resume-studio-proposal-rejected.json', value);
  });
  it('preserves explicit candidate-reported metrics and manual wording authority', async () => {
    const draft = await create(),
      text = 'Implemented React views with the use of components in order to support 25 users.';
    const edit = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      edits: [{ nodeId: bullet(draft).nodeId, text }],
    });
    const updated = (await edit.json()).data;
    assert.equal(edit.status, 200);
    const proposal = await generate(updated);
    assert.ok(proposal.proposedText.includes('25 users'));
    assert.equal(proposal.evidenceLinks[0].sourceKind, 'DRAFT_EDIT');
    assert.equal(proposal.truthState, 'CLAIMED');
    assert.equal((await decide(updated, proposal)).status, 200);
  });
  it('rejects invented metrics, unsupported keywords, truth upgrades and fake facts', async () => {
    const draft = await create();
    for (const selected of ['metric', 'keyword', 'verified', 'foreignFact']) {
      mode = selected;
      const response = await request(
        'POST',
        '/drafts/' + draft.id + '/proposals',
        generateBody(draft)
      );
      assert.equal(response.status, 422, JSON.stringify(await response.json()));
    }
    mode = 'supported';
    assert.deepEqual(await get(draft), draft);
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioProposals)
          .where(eq(resumeStudioProposals.draftId, draft.id))
      ).length,
      0
    );
  });
  it('unsupported target requirements remain gaps, never new candidate facts', async () => {
    const draft = await create(),
      requirement = draft.jobDescription.requirements.find((item) =>
        /kubernetes/i.test(item.extractedValue)
      );
    assert.ok(requirement);
    const proposal = await generate(draft, { requirementId: requirement.id });
    assert.equal(proposal.jobRequirement.sourceCovered, false);
    assert.ok(!proposal.proposedText.includes('Kubernetes'));
    const prompt = calls.at(-1);
    assert.ok(!JSON.stringify(prompt.candidateFacts).includes('Kubernetes'));
    assert.ok(JSON.stringify(prompt.untrustedContent).includes('Kubernetes'));
  });
  it('provider failure leaks no private error and leaves the draft retryable', async () => {
    const draft = await create();
    mode = 'failure';
    const response = await request(
        'POST',
        '/drafts/' + draft.id + '/proposals',
        generateBody(draft)
      ),
      value = await response.json();
    assert.equal(response.status, 503);
    assert.equal(value.error.code, 'PROPOSAL_PROVIDER_UNAVAILABLE');
    assert.ok(!JSON.stringify(value).includes('PRIVATE PROVIDER ERROR'));
    mode = 'supported';
    assert.ok(await generate(draft));
  });
  it('concurrent manual edit during generation rejects late output without persisting a proposal', async () => {
    const draft = await create();
    mode = 'paused';
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    const pending = request('POST', '/drafts/' + draft.id + '/proposals', generateBody(draft));
    await ready;
    const edit = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      edits: [
        {
          nodeId: bullet(draft).nodeId,
          text: 'Candidate-authored manual wording remains authoritative.',
        },
      ],
    });
    assert.equal(edit.status, 200);
    release();
    mode = 'supported';
    const response = await pending;
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.details[0].reason, 'DRAFT_REVISION_CONFLICT');
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioProposals)
          .where(eq(resumeStudioProposals.draftId, draft.id))
      ).length,
      0
    );
    assert.equal(
      (await get(draft)).structuredResume.experience[0].bullets[0],
      'Candidate-authored manual wording remains authoritative.'
    );
  });
  it('manual edits, selection-only edits and ABA restoration make proposals stale', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    const edit = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      edits: [
        {
          nodeId: bullet(draft).nodeId,
          text: 'Candidate-authored changed wording for React views.',
        },
      ],
    });
    const changed = (await edit.json()).data;
    const restore = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: changed.revision,
      edits: [{ nodeId: bullet(draft).nodeId, text: original }],
    });
    const restored = (await restore.json()).data;
    assert.equal(restored.revision, 3);
    const status = await request('GET', proposePath(draft, proposal));
    assert.equal((await status.json()).data.status, 'STALE');
    const stale = await decide(restored, proposal);
    const error = await stale.json();
    assert.equal(stale.status, 409);
    assert.equal(error.error.details[0].reason, 'STALE_PROPOSAL');
    await dump('resume-studio-proposal-stale.json', error);
    assert.deepEqual(await get(draft), restored);
    const another = await create(),
      selected = await generate(another);
    const selection = await request('PATCH', '/drafts/' + another.id, {
      expectedRevision: 1,
      selection: { bulletIds: [] },
    });
    const selectedDraft = (await selection.json()).data;
    assert.equal((await decide(selectedDraft, selected, 'REJECT')).status, 409);
  });
  it('two-tab acceptance and duplicate concurrent acceptance produce one winner', async () => {
    const draft = await create(),
      first = await generate(draft),
      second = await generate(draft);
    const decisions = await Promise.all([decide(draft, first), decide(draft, second)]);
    assert.deepEqual(decisions.map((value) => value.status).sort(), [200, 409]);
    const current = await get(draft);
    assert.equal(current.revision, 2);
    const duplicateDraft = await create(),
      one = await generate(duplicateDraft);
    const duplicates = await Promise.all([
      decide(duplicateDraft, one),
      decide(duplicateDraft, one),
    ]);
    assert.deepEqual(duplicates.map((value) => value.status).sort(), [200, 409]);
    assert.equal((await get(duplicateDraft)).revision, 2);
  });
  it('generation/accept/reject deny foreign tenants, same-tenant OWNER and foreign draft bindings', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    for (const person of [1, 2]) {
      assert.equal(
        (await request('POST', '/drafts/' + draft.id + '/proposals', generateBody(draft), person))
          .status,
        404
      );
      assert.equal(
        (await request('GET', proposePath(draft, proposal), undefined, person)).status,
        404
      );
      assert.equal(
        (
          await request(
            'POST',
            proposePath(draft, proposal) + '/decision',
            { expectedRevision: 1, decision: 'ACCEPT' },
            person
          )
        ).status,
        404
      );
    }
    const ownOther = await create();
    assert.equal((await request('GET', proposePath(ownOther, proposal))).status, 404);
  });
  it('READONLY can inspect own proposal but cannot generate or decide it', async () => {
    const draft = await create(3),
      service = new ResumeStudioProposalService({ database: db, aiProvider: provider });
    const proposal = await service.generate(context(3), draft.id, generateBody(draft));
    await db.update(users).set({ role: 'READONLY' }).where(eq(users.id, people[3].userId));
    assert.equal((await request('GET', proposePath(draft, proposal), undefined, 3)).status, 200);
    assert.equal(
      (await request('POST', '/drafts/' + draft.id + '/proposals', generateBody(draft), 3)).status,
      403
    );
    assert.equal(
      (
        await request(
          'POST',
          proposePath(draft, proposal) + '/decision',
          { expectedRevision: 1, decision: 'REJECT' },
          3
        )
      ).status,
      403
    );
  });
  it('enforces CSRF, sessions, exact current node and strict mutation contracts', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    assert.equal(
      (
        await request('POST', '/drafts/' + draft.id + '/proposals', generateBody(draft), 0, {
          cookie: '',
        })
      ).status,
      401
    );
    for (const headers of [
      { origin: 'https://foreign.test' },
      { 'x-csrf-token': '' },
      { 'x-csrf-token': generateCsrfToken(sessions[1].sessionId) },
    ]) {
      assert.equal(
        (
          await request(
            'POST',
            '/drafts/' + draft.id + '/proposals',
            generateBody(draft),
            0,
            headers
          )
        ).status,
        403
      );
      assert.equal(
        (
          await request(
            'POST',
            proposePath(draft, proposal) + '/decision',
            { expectedRevision: 1, decision: 'ACCEPT' },
            0,
            headers
          )
        ).status,
        403
      );
    }
    for (const payload of [
      { nodeId: bullet(draft).nodeId },
      generateBody(draft, { nodeId: crypto.randomUUID() }),
      generateBody(draft, { nodeId: draft.nodes.find((node) => node.kind === 'SUMMARY').nodeId }),
      generateBody(draft, { proposedText: 'Client-authored fake AI text.' }),
      generateBody(draft, { requirementId: crypto.randomUUID() }),
    ]) {
      assert.equal(
        (await request('POST', '/drafts/' + draft.id + '/proposals', payload)).status,
        400
      );
    }
    assert.equal(
      (
        await request('POST', proposePath(draft, proposal) + '/decision', {
          decision: 'ACCEPT',
          expectedRevision: 1,
          tenantId: tenantB,
        })
      ).status,
      400
    );
    assert.equal(
      (
        await request(
          'POST',
          '/drafts/' + draft.id + '/proposals',
          generateBody(draft, { expectedRevision: 999 })
        )
      ).status,
      409
    );
  });
  it('generation audit failure rolls back; acceptance failure recovers without a partial decision', async () => {
    const draft = await create();
    const database = {
      select: (...args) => db.select(...args),
      transaction: (work) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL studio.proposal_fail='1'`);
          return work(tx);
        }),
    };
    const failing = new ResumeStudioProposalService({ database, aiProvider: provider });
    await assert.rejects(failing.generate(context(), draft.id, generateBody(draft)));
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioProposals)
          .where(eq(resumeStudioProposals.draftId, draft.id))
      ).length,
      0
    );
    const proposal = await generate(draft);
    await assert.rejects(
      failing.decide(context(), draft.id, proposal.id, { expectedRevision: 1, decision: 'ACCEPT' })
    );
    assert.deepEqual(await get(draft), draft);
    const pending = await request('GET', proposePath(draft, proposal));
    assert.equal((await pending.json()).data.status, 'PENDING');
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioRevisions)
          .where(eq(resumeStudioRevisions.draftId, draft.id))
      ).length,
      1
    );
    assert.equal((await decide(draft, proposal)).status, 200);
  });
  it('proposal body/decisions are encrypted, immutable and recover across service instances', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    const [row] = await db
      .select()
      .from(resumeStudioProposals)
      .where(eq(resumeStudioProposals.id, proposal.id));
    assert.ok(!row.encryptedPayload.includes(original));
    assert.ok(!row.encryptedPayload.includes('React'));
    await assert.rejects(
      db.execute(
        sql`UPDATE resume_studio_proposals SET encrypted_payload='changed' WHERE id=${proposal.id}`
      )
    );
    const another = new ResumeStudioProposalService({ database: db, aiProvider: provider });
    assert.deepEqual(await another.get(context(), draft.id, proposal.id), proposal);
    const otherDraft = await create(),
      otherProposal = await generate(otherDraft);
    const [other] = await db
      .select()
      .from(resumeStudioProposals)
      .where(eq(resumeStudioProposals.id, otherProposal.id));
    const [draftRow] = await db
      .select()
      .from(resumeStudioDrafts)
      .where(eq(resumeStudioDrafts.id, draft.id));
    assert.throws(
      () =>
        another._payload(draftRow, {
          ...row,
          encryptedPayload: other.encryptedPayload,
          payloadHash: other.payloadHash,
        }),
      { code: 'PROPOSAL_INTEGRITY_FAILED' }
    );
    assert.equal((await decide(draft, proposal, 'REJECT')).status, 200);
    await assert.rejects(
      db.execute(
        sql`UPDATE resume_studio_proposals SET status='PENDING',decided_at=NULL,decision_revision=NULL WHERE id=${proposal.id}`
      )
    );
  });
  it('master records, original bytes, approved package hashes and approval tickets stay immutable', async () => {
    assert.deepEqual(await preserved(), baseline);
    assert.equal(baseline.packages[0].packageHash, approved.packageHash);
    for (const [index, person] of people.entries()) {
      const master = baseline.resumes.find((row) => row.id === person.resumeId);
      assert.deepEqual(
        await storage.getDecryptedDocument({
          tenantId: person.tenantId,
          candidateId: person.candidateId,
          storageKey: master.storageKey,
          sourceOriginalAuthority: ORIGINAL_SOURCE_READ,
        }),
        buffers[index]
      );
    }
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceType, 'resume_studio_proposal'));
    assert.ok(!JSON.stringify(audits).includes(original));
    assert.ok(!JSON.stringify(audits).includes('PRIVATE PROVIDER ERROR'));
    assert.ok(calls.every((call) => !JSON.stringify(call).includes(people[0].candidateId)));
  });
  it('rejection audit failure leaves a pending proposal that can be rejected after recovery', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    const database = {
      transaction: (work) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL studio.proposal_fail='1'`);
          return work(tx);
        }),
    };
    await assert.rejects(
      new ResumeStudioProposalService({ database, aiProvider: provider }).decide(
        context(),
        draft.id,
        proposal.id,
        { expectedRevision: 1, decision: 'REJECT' }
      )
    );
    assert.deepEqual(await get(draft), draft);
    assert.equal(
      (await (await request('GET', proposePath(draft, proposal))).json()).data.status,
      'PENDING'
    );
    assert.equal((await decide(draft, proposal, 'REJECT')).status, 200);
  });
  it('no-op revision changes still invalidate a proposal even with byte-identical bullet text', async () => {
    const draft = await create(),
      proposal = await generate(draft);
    const response = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      edits: [{ nodeId: bullet(draft).nodeId, text: original }],
    });
    const next = (await response.json()).data;
    assert.equal(response.status, 200);
    const stale = await decide(next, proposal);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.details[0].reason, 'STALE_PROPOSAL');
  });
  it('source PII is not sent to the provider; manual editing remains available', async () => {
    const draft = await create();
    const response = await request('PATCH', '/drafts/' + draft.id, {
      expectedRevision: 1,
      edits: [
        {
          nodeId: bullet(draft).nodeId,
          text: 'Implemented React views with the use of components for Asha 林.',
        },
      ],
    });
    const next = (await response.json()).data;
    assert.equal(response.status, 200);
    const before = calls.length;
    const refused = await request('POST', '/drafts/' + draft.id + '/proposals', generateBody(next));
    assert.equal(refused.status, 422);
    assert.equal((await refused.json()).error.code, 'SOURCE_PRIVACY_UNSAFE');
    assert.equal(calls.length, before);
    assert.deepEqual(await get(next), next);
  });
  it('disabled provider returns truthful unavailable state without a fallback proposal', async () => {
    const draft = await create();
    await assert.rejects(
      new ResumeStudioProposalService({ database: db, aiProvider: false }).generate(
        context(),
        draft.id,
        generateBody(draft)
      ),
      { statusCode: 503, code: 'PROPOSAL_PROVIDER_UNAVAILABLE' }
    );
    assert.equal(
      (
        await db
          .select()
          .from(resumeStudioProposals)
          .where(eq(resumeStudioProposals.draftId, draft.id))
      ).length,
      0
    );
  });
});
