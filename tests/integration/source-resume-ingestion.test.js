/**
 * @file Integration Tests for Source Resume Ingestion & Lifecycle Pipeline (P13.5-003 / ARCH-052).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  candidates,
  skills,
  candidateSkills,
  resumes,
  resumeSections,
  candidateClaims,
  auditLogs,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';

describe('Source Resume Ingestion & Lifecycle Pipeline (P13.5-003)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantIdA = crypto.randomUUID();
  const userIdA = crypto.randomUUID();
  const candidateIdA = crypto.randomUUID();
  const skillIdA = crypto.randomUUID();

  const tenantIdB = crypto.randomUUID();
  const userIdB = crypto.randomUUID();
  const candidateIdB = crypto.randomUUID();

  let app;
  let rawSessionTokenA;
  let rawSessionTokenB;

  before(async () => {
    app = buildApp({ db });
    await app.ready();

    // 1. Setup Tenant A & User A
    await db.insert(tenants).values({
      id: tenantIdA,
      name: `Tenant A ${testRunId}`,
      slug: `tenant-a-${testRunId}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userIdA,
      tenantId: tenantIdA,
      email: `user-a-${testRunId}@example.test`,
      displayName: `Alice Developer ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateIdA,
      tenantId: tenantIdA,
      userId: userIdA,
      displayName: `Alice Developer ${testRunId}`,
      canonicalEmail: `user-a-${testRunId}@example.test`,
      headline: 'Original Software Engineer',
      status: 'ACTIVE',
    });

    const sessionContextA = await createSession(db, {
      userId: userIdA,
      tenantId: tenantIdA,
      role: 'OWNER',
    });
    rawSessionTokenA = sessionContextA.rawToken;

    // 2. Setup Tenant B & User B (for Multi-Tenant IDOR testing)
    await db.insert(tenants).values({
      id: tenantIdB,
      name: `Tenant B ${testRunId}`,
      slug: `tenant-b-${testRunId}`,
      tier: 'PRO',
    });

    await db.insert(users).values({
      id: userIdB,
      tenantId: tenantIdB,
      email: `user-b-${testRunId}@example.test`,
      displayName: `Bob Builder ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateIdB,
      tenantId: tenantIdB,
      userId: userIdB,
      displayName: `Bob Builder ${testRunId}`,
      canonicalEmail: `user-b-${testRunId}@example.test`,
      status: 'ACTIVE',
    });

    const sessionContextB = await createSession(db, {
      userId: userIdB,
      tenantId: tenantIdB,
      role: 'OWNER',
    });
    rawSessionTokenB = sessionContextB.rawToken;

    // Seed a global skill verified for candidate A
    await db
      .insert(skills)
      .values({
        id: skillIdA,
        name: `TypeScript_${testRunId}`,
        slug: `typescript-${testRunId}`,
        category: 'LANGUAGE',
      })
      .onConflictDoNothing();

    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      skillId: skillIdA,
      category: 'LANGUAGE',
      provenanceStatus: 'VERIFIED',
      confidenceScore: 0.95,
      evidenceCount: 3,
    });
  });

  after(async () => {
    try {
      await db.delete(candidateClaims).where(eq(candidateClaims.tenantId, tenantIdA));
      await db.delete(candidateClaims).where(eq(candidateClaims.tenantId, tenantIdB));
      await db.delete(resumeSections).where(eq(resumeSections.tenantId, tenantIdA));
      await db.delete(resumeSections).where(eq(resumeSections.tenantId, tenantIdB));
      await db.delete(resumes).where(eq(resumes.tenantId, tenantIdA));
      await db.delete(resumes).where(eq(resumes.tenantId, tenantIdB));
      await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tenantIdA));
      await db.delete(skills).where(eq(skills.id, skillIdA));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantIdA));
      await db.delete(candidates).where(eq(candidates.tenantId, tenantIdB));
      await db.delete(sessions).where(eq(sessions.userId, userIdA));
      await db.delete(sessions).where(eq(sessions.userId, userIdB));
      await db.delete(users).where(eq(users.tenantId, tenantIdA));
      await db.delete(users).where(eq(users.tenantId, tenantIdB));
      await db.delete(tenants).where(eq(tenants.id, tenantIdA));
      await db.delete(tenants).where(eq(tenants.id, tenantIdB));
    } catch {
      // Best-effort cleanup
    }
    if (app) {
      await app.close();
    }
    await closeDatabase();
  });

  it('1. POST /resumes/upload uploads, encrypts, parses, and creates structured sections & claims', async () => {
    const resumeText = `
SUMMARY
Senior Backend Engineer with expertise in building scalable cloud microservices.

TECHNICAL SKILLS
TypeScript_${testRunId}, PostgreSQL, Redis, Docker, Kubernetes, GraphQL

WORK EXPERIENCE
• Principal Architect at ScaleFlow: Led transition to event-driven architectures.
• Senior Engineer at DataMesh: Built low-latency ETL ingestion pipelines.

EDUCATION
• Master of Science in Computer Science, MIT
    `;

    const base64Content = Buffer.from(resumeText, 'utf-8').toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/resumes/upload',
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      payload: {
        base64Content,
        fileName: 'alpha_resume_v1.txt',
        mimeType: 'text/plain',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.resume.id);
    assert.equal(body.data.resume.version, 1);
    assert.equal(body.data.resume.lifecycleState, 'PARSED');
    assert.equal(body.data.resume.fileName, 'alpha_resume_v1.txt');
    assert.ok(body.data.resume.contentHash);

    // Verify sections created
    assert.ok(body.data.sections.length >= 4);
    const sectionTypes = body.data.sections.map((s) => s.sectionType);
    assert.ok(sectionTypes.includes('SUMMARY'));
    assert.ok(sectionTypes.includes('SKILLS'));
    assert.ok(sectionTypes.includes('WORK_EXPERIENCE'));

    // Verify claims created strictly with CLAIMED truth status
    assert.ok(body.data.claims.length >= 5);
    for (const claim of body.data.claims) {
      assert.equal(claim.provenanceStatus, 'CLAIMED');
      assert.ok(claim.context.includes('[Unverified User Claim]'));
    }
  });

  it('2. POST /resumes/upload with a second resume creates Version 2 preserving Version 1', async () => {
    const resumeV2Text = `
SUMMARY
Staff Distributed Systems Engineer specializing in consensus protocols.

TECHNICAL SKILLS
Go, Rust, PostgreSQL, Raft, Kubernetes
    `;

    const base64Content = Buffer.from(resumeV2Text, 'utf-8').toString('base64');

    const res = await app.inject({
      method: 'POST',
      url: '/resumes/upload',
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      payload: {
        base64Content,
        fileName: 'alpha_resume_v2.txt',
        mimeType: 'text/plain',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.data.resume.version, 2);

    // Verify both versions exist in database
    const dbResumes = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.candidateId, candidateIdA)));
    assert.equal(dbResumes.length, 2);
  });

  it('3. GET /resumes lists all resume versions for the candidate (JSON & HTML)', async () => {
    // 3a. JSON API format
    const resJson = await app.inject({
      method: 'GET',
      url: '/resumes',
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
      },
    });

    assert.equal(resJson.statusCode, 200);
    const body = resJson.json();
    assert.equal(body.success, true);
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].version, 2); // Ordered descending
    assert.equal(body.data[1].version, 1);

    // 3b. HTML View format with Candidate Context & Grouped Navigation
    const resHtml = await app.inject({
      method: 'GET',
      url: '/resumes',
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'text/html',
      },
    });

    assert.equal(resHtml.statusCode, 200);
    assert.match(resHtml.headers['content-type'], /text\/html/);
    assert.ok(resHtml.body.includes(`Alice Developer ${testRunId}`));
    assert.ok(resHtml.body.includes(`user-a-${testRunId}@example.test`));
    assert.ok(resHtml.body.includes('alpha_resume_v1.txt'));
    assert.ok(resHtml.body.includes('alpha_resume_v2.txt'));
    assert.ok(resHtml.body.includes('Career'));
    assert.ok(resHtml.body.includes('Sources'));
    assert.ok(resHtml.body.includes('AI Connect'));
    assert.ok(resHtml.body.includes('Sign Out'));

    // 3c. Empty State HTML for User B (Recognizes authenticated Candidate B, not missing session)
    const resHtmlEmpty = await app.inject({
      method: 'GET',
      url: '/resumes',
      headers: {
        cookie: `career_hub_session=${rawSessionTokenB}`,
        accept: 'text/html',
      },
    });

    assert.equal(resHtmlEmpty.statusCode, 200);
    assert.ok(resHtmlEmpty.body.includes(`Bob Builder ${testRunId}`));
    assert.ok(resHtmlEmpty.body.includes('No Source Resumes Uploaded Yet'));
    assert.ok(resHtmlEmpty.body.includes('Upload your existing resume'));
    assert.ok(resHtmlEmpty.body.includes('Sign Out'));
  });

  it('4. GET /resumes/:id returns full detail, parsed sections, and claims (JSON & HTML)', async () => {
    const [resumeV1] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.version, 1)));

    // 4a. JSON API format
    const resJson = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeV1.id}`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
      },
    });

    assert.equal(resJson.statusCode, 200);
    const body = resJson.json();
    assert.equal(body.success, true);
    assert.equal(body.data.resume.id, resumeV1.id);
    assert.ok(body.data.sections.length > 0);
    assert.ok(body.data.claims.length > 0);

    // 4b. HTML View format
    const resHtml = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeV1.id}`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'text/html',
      },
    });

    assert.equal(resHtml.statusCode, 200);
    assert.match(resHtml.headers['content-type'], /text\/html/);
    assert.ok(resHtml.body.includes(`Alice Developer ${testRunId}`));
    assert.ok(resHtml.body.includes('alpha_resume_v1.txt'));
    assert.ok(resHtml.body.includes('CLAIMED [Unverified User Claim]'));
    assert.ok(resHtml.body.includes('Sign Out'));
  });

  it('5. POST /resumes/:id/approve approves claims, promotes to Base Resume, and adds CLAIMED skills without downgrading VERIFIED skills', async () => {
    const [resumeV1] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.version, 1)));

    const res = await app.inject({
      method: 'POST',
      url: `/resumes/${resumeV1.id}/approve`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      payload: {
        promoteToBase: true,
        headline: 'Staff Cloud Infrastructure Architect',
        bio: 'Leading distributed systems and data pipelines across global platforms.',
        approvedSkillClaims: [`TypeScript_${testRunId}`, 'Redis', 'GraphQL'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.resume.isBaseResume, true);
    assert.equal(body.data.resume.lifecycleState, 'BASE_RESUME');
    assert.equal(body.data.candidate.headline, 'Staff Cloud Infrastructure Architect');

    // Verify candidate skills:
    // 1. TypeScript was already VERIFIED -> MUST REMAIN VERIFIED!
    const [tsSkill] = await db
      .select()
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(eq(candidateSkills.tenantId, tenantIdA), eq(skills.name, `TypeScript_${testRunId}`))
      );
    assert.equal(tsSkill.candidate_skills.provenanceStatus, 'VERIFIED');

    // 2. Redis and GraphQL were added -> MUST BE CLAIMED!
    const [redisSkill] = await db
      .select()
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(and(eq(candidateSkills.tenantId, tenantIdA), eq(skills.name, 'Redis')));
    assert.equal(redisSkill.candidate_skills.provenanceStatus, 'CLAIMED');
  });

  it('6. GET /resumes/:id/download decrypts and downloads original source file exactly', async () => {
    const [resumeV1] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.version, 1)));

    const res = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeV1.id}/download`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/plain');
    assert.ok(res.headers['content-disposition'].includes('alpha_resume_v1.txt'));
    assert.ok(res.body.includes('Senior Backend Engineer with expertise'));
  });

  it('7. Multi-Tenant IDOR Defense: Tenant B cannot access or mutate Tenant A resumes', async () => {
    const [resumeA] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.version, 1)));

    // Read attempt by User B
    const readRes = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeA.id}`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenB}`,
        accept: 'application/json',
      },
    });
    assert.equal(readRes.statusCode, 404);

    // Download attempt by User B
    const downloadRes = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeA.id}/download`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenB}`,
      },
    });
    assert.equal(downloadRes.statusCode, 404);

    // Approve attempt by User B
    const approveRes = await app.inject({
      method: 'POST',
      url: `/resumes/${resumeA.id}/approve`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenB}`,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      payload: {
        promoteToBase: true,
      },
    });
    assert.equal(approveRes.statusCode, 404);

    // Delete attempt by User B
    const deleteRes = await app.inject({
      method: 'POST',
      url: `/resumes/${resumeA.id}/delete`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenB}`,
        accept: 'application/json',
      },
    });
    assert.equal(deleteRes.statusCode, 404);
  });

  it('8. POST /resumes/:id/delete permanently removes resume version from DB and encrypted storage', async () => {
    const [resumeV2] = await db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantIdA), eq(resumes.version, 2)));

    const res = await app.inject({
      method: 'POST',
      url: `/resumes/${resumeV2.id}/delete`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 200);

    // Verify deleted in DB
    const [found] = await db.select().from(resumes).where(eq(resumes.id, resumeV2.id));
    assert.equal(found, undefined);

    // Verify download now returns 404
    const downloadRes = await app.inject({
      method: 'GET',
      url: `/resumes/${resumeV2.id}/download`,
      headers: {
        cookie: `career_hub_session=${rawSessionTokenA}`,
      },
    });
    assert.equal(downloadRes.statusCode, 404);
  });

  it('9. Audit logs record resume operations without leaking secrets or full raw content', async () => {
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantIdA), eq(auditLogs.resourceType, 'resume')));

    assert.ok(logs.length >= 3);
    const actions = logs.map((l) => l.eventType);
    assert.ok(actions.includes('resume.uploaded'));
    assert.ok(actions.includes('resume.reviewed'));
    assert.ok(actions.includes('resume.deleted'));

    for (const log of logs) {
      assert.equal(typeof log.details, 'object');
      const metaStr = JSON.stringify(log.details);
      // Ensure no raw resume text or tokens are stored in audit metadata
      assert.ok(!metaStr.includes('Senior Backend Engineer with expertise'));
      assert.ok(!metaStr.includes('password'));
    }
  });

  it('10. Unauthenticated requests to /resumes redirect to /login', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/resumes',
    });

    assert.equal(res.statusCode, 302);
    assert.ok(res.headers.location.includes('/login?returnTo=/resumes'));
  });
});
