import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  projects,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { StudioAnalyzeResponseSchema } from '../../src/domain/career/resume-studio.schemas.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { ResumeStudioAnalysisService } from '../../src/services/resume-studio-analysis.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { AtsFitScoreService } from '../../src/services/ats-fit-score.service.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  process.env.NODE_ENV === 'test' &&
    ['127.0.0.1', 'localhost'].includes(target.hostname) &&
    /^\/product_audit_resume_studio$/.test(target.pathname),
  'Requires disposable Studio DB'
);
const tenantA = crypto.randomUUID(),
  tenantB = crypto.randomUUID();
const people = Array.from({ length: 4 }, (_, index) => ({
  userId: crypto.randomUUID(),
  candidateId: crypto.randomUUID(),
  tenantId: index === 2 ? tenantB : tenantA,
}));
const rawDescription =
  'Requirements:\nPractical React and PostgreSQL experience required. Kubernetes skills required. Build reliable backend APIs and document technical decisions with the engineering team.';
const body = { jobTarget: { title: 'Backend Engineer', company: 'Example', rawDescription } };

describe('Resume Studio real PostgreSQL/session/HTTP analysis', () => {
  let app, baseUrl;
  const sessions = [];
  const request = (payload = body, person = 0, overrides = {}) =>
    fetch(baseUrl + '/api/v1/resume-studio/analyze', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        cookie: `career_hub_session=${sessions[person].rawToken}`,
        origin: baseUrl,
        'x-csrf-token': generateCsrfToken(sessions[person].sessionId),
        ...overrides,
      },
      body: JSON.stringify(payload),
    });
  before(async () => {
    await db.insert(tenants).values([
      { id: tenantA, name: 'Studio fixture A', slug: 'studio-' + tenantA },
      { id: tenantB, name: 'Studio fixture B', slug: 'studio-' + tenantB },
    ]);
    for (const [index, person] of people.entries()) {
      await db.insert(users).values({
        id: person.userId,
        tenantId: person.tenantId,
        email: 'studio-' + person.userId + '@example.test',
        displayName: 'Studio fixture ' + index,
        role: index === 3 ? 'READONLY' : 'MEMBER',
        status: 'ACTIVE',
      });
      await db.insert(candidates).values({
        id: person.candidateId,
        tenantId: person.tenantId,
        userId: person.userId,
        displayName: 'Studio fixture ' + index,
        profileMetadata:
          index === 0
            ? {
                experience: [
                  {
                    title: 'Developer',
                    company: 'Source Company',
                    bullets: ['Implemented React views to support candidate-authored workflows.'],
                  },
                ],
              }
            : {},
      });
      sessions.push(await createSession(db, person));
    }
    for (const [index, slug, name, provenanceStatus] of [
      [0, 'react', 'React.js', 'SELF_DECLARED'],
      [0, 'kubernetes', 'Kubernetes', 'INFERRED'],
      [1, 'rust', 'Rust', 'SELF_DECLARED'],
      [2, 'postgresql', 'PostgreSQL', 'SELF_DECLARED'],
    ]) {
      const [skill] = await db
        .insert(skills)
        .values({ slug, name, category: 'LANGUAGE' })
        .onConflictDoUpdate({ target: skills.slug, set: { name } })
        .returning();
      const person = people[index];
      await db.insert(candidateSkills).values({
        tenantId: person.tenantId,
        candidateId: person.candidateId,
        skillId: skill.id,
        category: 'LANGUAGE',
        provenanceStatus,
        metadata: { isUserClaim: provenanceStatus === 'SELF_DECLARED' },
      });
    }
    await db.insert(projects).values(
      ['API source project', 'Dashboard source project', 'Documentation source project'].map(
        (name, index) => ({
          tenantId: tenantA,
          candidateId: people[0].candidateId,
          name,
          slug: 'studio-project-' + index,
          summary: 'Candidate-reported source project description.',
          metadata: { technologies: ['React'] },
        })
      )
    );
    app = buildApp({ db, logger: false });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });
  after(async () => {
    await app?.close();
    await db.delete(tenants).where(eq(tenants.id, tenantA));
    await db.delete(tenants).where(eq(tenants.id, tenantB));
    await closeDatabase();
  });
  it('returns a valid full contract and explicit unverified artifact state', async () => {
    const response = await request();
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    StudioAnalyzeResponseSchema.parse(result.data);
    assert.equal(result.data.candidateId, people[0].candidateId);
    assert.equal(result.data.parseability.status, 'NOT_VERIFIED');
    assert.equal(result.data.target.extractionMode, 'DETERMINISTIC');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(result.data.writingQuality.status, 'AVAILABLE');
    assert.ok(!('atsParseability' in result.data.writingQuality.report.dimensions));
    assert.ok(!('verifiedMetricCount' in result.data.writingQuality.report.quantification));
    if (process.env.STUDIO_RESPONSE_FIXTURE) {
      await fs.writeFile(
        process.env.STUDIO_RESPONSE_FIXTURE,
        JSON.stringify(result, null, 2) + '\n',
        'utf8'
      );
    }
  });
  it('does not upgrade claims or inferred skills to verified matches', async () => {
    const { data } = await (await request()).json();
    const react = data.keywords.find((item) => item.term.toLowerCase().includes('react'));
    assert.ok(react);
    assert.equal(react.truthState, 'CLAIMED');
    assert.equal(react.satisfiesRequirement, false);
    const kube = data.keywords.find((item) => item.term.toLowerCase().includes('kubernetes'));
    assert.ok(kube);
    assert.equal(kube.satisfiesRequirement, false);
    assert.ok(!['EXACT_VERIFIED', 'EXACT_CLAIMED', 'TAXONOMY_EQUIVALENT'].includes(kube.category));
  });
  it('uses exactly the canonical seven-component fit engine', async () => {
    const { data } = await (await request()).json();
    const person = people[0],
      context = { ...person, role: 'MEMBER' };
    const view = await new CandidateProfileService(db).getProfile(context, person.candidateId);
    const profile = {
      ...view.candidate,
      skills: view.skills,
      projects: view.projects,
      resources: view.resources,
      experience: view.experience,
      education: view.education,
    };
    const parsed = await JobDescriptionParser.parse(
      {
        source: 'PASTE',
        rawText: rawDescription,
        title: body.jobTarget.title,
        company: body.jobTarget.company,
      },
      { tenantId: tenantA }
    );
    const job = { ...parsed.jobDescription, requirements: parsed.requirements };
    const matches = EvidenceMatchingService.matchJobToCandidate(context, job, profile);
    const projectRelevance = ProjectRelevanceService.computeProjectsRelevance(
      context,
      job,
      profile.projects,
      { candidateId: person.candidateId }
    );
    const fit = AtsFitScoreService.calculateCandidateJobFit(
      context,
      job,
      matches,
      projectRelevance,
      profile
    );
    assert.deepEqual(data.candidateFit.scoreBreakdown, fit.scoreBreakdown);
    assert.equal(data.candidateFit.overallScore, fit.overallScore);
    assert.deepEqual(
      data.projectRelevance.projectRankings.map((item) => ({
        projectId: item.projectId,
        rank: item.rank,
        relevanceScore: item.relevanceScore,
        selectionStatus: item.selectionStatus,
      })),
      projectRelevance.projectRankings.map((item) => ({
        projectId: item.projectId,
        rank: item.rank,
        relevanceScore: item.relevanceScore,
        selectionStatus: item.selectionStatus,
      }))
    );
    assert.equal(data.projectRelevance.projectRankings.length, 3);
  });
  it('isolates another user in the same tenant and another tenant', async () => {
    for (const index of [1, 2]) {
      const response = await request(body, index);
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      assert.equal(result.data.candidateId, people[index].candidateId);
      assert.ok(!JSON.stringify(result.data).includes('Source Company'));
      const react = result.data.keywords.find((item) => item.term.toLowerCase().includes('react'));
      assert.equal(react.category, 'MISSING_IN_PROFILE');
    }
  });
  it('fails closed if a profile dependency returns a foreign candidate', async () => {
    const service = new ResumeStudioAnalysisService({
      database: db,
      candidateProfileService: {
        getProfile: async () => ({
          candidate: { id: people[1].candidateId, tenantId: tenantA, userId: people[1].userId },
        }),
      },
    });
    await assert.rejects(service.analyze(people[0], body), { statusCode: 404 });
  });
  it('returns explicit absence instead of empty writing or arbitrary fit scores', async () => {
    const response = await request(
      {
        jobTarget: {
          rawDescription:
            'Our organization welcomes conversations about this role and invites applicants to read the team introduction and culture overview.'.repeat(
              2
            ),
        },
      },
      3
    );
    const { data } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.writingQuality.status, 'NOT_EVALUABLE');
    assert.equal(data.writingQuality.report, null);
    assert.equal(data.fitStatus, 'INSUFFICIENT_REQUIREMENTS');
    assert.equal(data.candidateFit, null);
  });
  it('rejects absent, forged and expired/revoked sessions', async () => {
    for (const cookie of ['', 'career_hub_session=forged'])
      assert.equal((await request(body, 0, { cookie })).status, 401);
    const revoked = await createSession(db, people[0]);
    await db.execute(sql`DELETE FROM sessions WHERE id = ${revoked.sessionId}`);
    assert.equal(
      (await request(body, 0, { cookie: 'career_hub_session=' + revoked.rawToken })).status,
      401
    );
  });
  it('rejects missing/foreign Origin and missing/invalid/cross-session CSRF', async () => {
    for (const headers of [
      { origin: '' },
      { origin: 'https://foreign.test' },
      { 'x-csrf-token': '' },
      { 'x-csrf-token': 'invalid' },
      { 'x-csrf-token': generateCsrfToken(sessions[1].sessionId) },
    ]) {
      const response = await request(body, 0, headers);
      assert.equal(response.status, 403, JSON.stringify(await response.json()));
    }
  });
  it('rejects caller candidate/resume identity, fake scores and malformed bodies', async () => {
    for (const payload of [
      { ...body, candidateId: people[1].candidateId },
      { ...body, sourceResumeId: crypto.randomUUID() },
      { ...body, score: 92 },
      { jobTarget: { rawDescription: 'Too short' } },
      { jobTarget: { ...body.jobTarget, tenantId: tenantB } },
    ]) {
      assert.equal((await request(payload)).status, 400);
    }
  });
  it('warns on safe truncation and never fetches source URLs', async () => {
    const response = await request({
      jobTarget: {
        sourceUrl: 'http://127.0.0.1:1/never-fetch',
        rawDescription: rawDescription + '😀'.repeat(30000),
      },
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.data.warnings[0].code, 'JOB_DESCRIPTION_TRUNCATED');
  });
  it('creates no draft/application/package/approval and never mutates source', async () => {
    const [before] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, people[0].candidateId));
    await request();
    const [after] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, people[0].candidateId));
    assert.deepEqual(after, before);
    const counts =
      await db.execute(sql`SELECT (SELECT count(*) FROM job_applications) AS applications,
      (SELECT count(*) FROM application_packages) AS packages`);
    assert.equal(Number(counts.rows[0].applications), 0);
    assert.equal(Number(counts.rows[0].packages), 0);
  });
  it('unimplemented dependent endpoints remain unavailable', async () => {
    const response = await fetch(
      baseUrl + '/api/v1/resume-studio/drafts/11111111-1111-4111-8111-111111111111/share',
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: '{}',
      }
    );
    assert.equal(response.status, 404);
  });
});
