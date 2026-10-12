/** Real loopback HTTP, PostgreSQL JSONB, encrypted storage and Chromium PDF integration.
 * Requires an explicitly isolated product_audit_* database and blank AI credentials. */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, candidates, applicationPackages } from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createSession, generateCsrfToken } from '../../src/security/session.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { JobAnalysisSnapshotService } from '../../src/services/job-analysis-snapshot.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { computeJobContentHash } from '../../src/domain/career/analysis-snapshot.schemas.js';
import { deriveCanonicalJobId } from '../../src/utils/url-normalizer.js';
import { computeApplicationPackageHash } from '../../src/domain/job/application-package-identity.js';
import { normalizeResumeSourceSections } from '../../src/utils/resume-source-normalizer.js';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { profile } from '../fixtures/prd003-resume-profile.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname),
  'Only disposable loopback product_audit DBs are supported'
);
assert.ok(
  !process.env.GEMINI_API_KEY && !process.env.GOOGLE_CLOUD_PROJECT,
  'Use blank provider credentials'
);
const job = {
  sourceUrl: 'https://boards.greenhouse.io/fixture/jobs/991003',
  provider: 'GREENHOUSE',
  title: 'Research Assistant',
  company: 'Fixture Lab',
  location: 'Remote',
  description: 'Document accessible computing interfaces.',
};

describe('PRD-003 complete resume source pipeline', () => {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  const otherCandidateId = crypto.randomUUID();
  const context = { tenantId, userId, role: 'MEMBER' };
  const profileService = new CandidateProfileService(db);
  const contentService = new CandidateArtifactContentService({
    database: db,
    candidateProfileService: profileService,
  });
  const snapshotService = new JobAnalysisSnapshotService({ db });
  const workflow = new JobApplicationWorkflowService({ database: db });
  const compiler = new LatexCompilerService({
    pdflatexPath: 'nonexistent-prd003-pdflatex',
    chromeTimeoutMs: 45000,
  });
  compiler.tectonicPath = null; // Test the genuine supported Chrome fallback without TeX network bootstrap.
  workflow.applicationHandoffService.latexCompiler = compiler;
  workflow.applicationHandoffService.resumeOptimizer.latexCompiler = compiler;
  let app, baseUrl, session, otherSession, output, sourceModel, prepared, firstPackage;
  const request = (url, body, token = session.rawToken) =>
    fetch(baseUrl + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        cookie: `career_hub_session=${token}`,
        origin: baseUrl,
        'x-csrf-token': generateCsrfToken(
          token === session.rawToken ? session.sessionId : otherSession.sessionId
        ),
        accept: 'application/json',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  before(async () => {
    output = await fs.mkdtemp(path.join(os.tmpdir(), 'career-prd003-artifacts-'));
    console.log('PRD-003 artifacts: ' + output);
    await db.insert(tenants).values({
      id: tenantId,
      name: 'PRD003 disposable tenant',
      slug: 'prd003-' + tenantId,
      tier: 'PRO',
    });
    await db.insert(users).values([
      {
        id: userId,
        tenantId,
        email: 'source-' + userId + '@example.test',
        displayName: profile.displayName,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
      {
        id: otherUserId,
        tenantId,
        email: 'other-' + otherUserId + '@example.test',
        displayName: 'Other Fixture Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(candidates).values([
      {
        id: candidateId,
        tenantId,
        userId,
        displayName: profile.displayName,
        canonicalEmail: profile.canonicalEmail,
        status: 'ACTIVE',
        profileMetadata: {},
      },
      {
        id: otherCandidateId,
        tenantId,
        userId: otherUserId,
        displayName: 'Other Fixture Candidate',
        canonicalEmail: 'other@example.test',
        status: 'ACTIVE',
        profileMetadata: {},
      },
    ]);
    session = await createSession(db, { ...context, scopes: ['*'], deviceId: 'prd003-primary' });
    otherSession = await createSession(db, {
      tenantId,
      userId: otherUserId,
      role: 'MEMBER',
      scopes: ['*'],
      deviceId: 'prd003-other',
    });
    app = buildApp({
      db,
      jobApplicationWorkflowService: workflow,
      snapshotService,
      candidateProfileService: profileService,
    });
    baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  });
  after(async () => {
    if (app) await app.close();
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await closeDatabase();
  });

  it('fresh owned candidate saves multiple degrees, credentials and optional fields through HTTP and reloads accurately', async () => {
    const authored = {
      ...profile,
      phone: '+91 9000000000',
      location: 'Pune',
      portfolioLinks: [
        { label: 'Research', url: 'https://fixture.github.io/research' },
        { label: 'Teaching', url: 'https://fixture.github.io/teaching' },
      ],
      experience: [
        {
          ...profile.experience[0],
          summary: 'Supported accessible research.',
          description: 'Maintained participant documentation.',
        },
      ],
      education: [
        ...profile.education,
        { id: 'edu-2', institution: 'Second University', degree: 'BSc', endDate: '2022' },
      ],
      certifications: [
        ...profile.certifications,
        { id: 'cert-2', name: 'Second Credential', issuer: 'Second Board', issueDate: '2022' },
      ],
    };
    const res = await request('/profile', authored);
    assert.equal(res.status, 200, await res.clone().text());
    sourceModel = normalizeResumeSourceSections(authored);
    for (let reload = 0; reload < 3; reload++) {
      const [row] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
      assert.deepEqual(normalizeResumeSourceSections(row), sourceModel);
      const career = await profileService.getCareerProfile(context, candidateId);
      for (const [index, entry] of sourceModel.education.entries())
        for (const [key, value] of Object.entries(entry))
          assert.deepEqual(career.education[index][key], value, key);
      assert.deepEqual(career.certifications, sourceModel.certifications);
      assert.deepEqual(career.publications, sourceModel.optionalSections.publications);
    }
    const candidate = await contentService.buildCandidateData({
      ...context,
      candidateId,
      jobPosting: job,
    });
    assert.deepEqual(candidate.education, sourceModel.education);
    assert.deepEqual(candidate.certifications, sourceModel.certifications);
    assert.deepEqual(candidate.customSections, sourceModel.optionalSections.customSections);
    const view = await fetch(baseUrl + '/profile', {
      headers: { cookie: `career_hub_session=${session.rawToken}`, accept: 'text/html' },
    });
    assert.equal(view.status, 200);
    const html = await view.text();
    for (const expected of [
      'Fixture Board',
      '2023-09',
      'Present',
      'Documented accessible interfaces.',
    ])
      assert.ok(html.includes(expected), 'profile view missing ' + expected);
  });

  it('persisted analysis prepares a real package/PDF, preserves source in preview and downloads authorized bytes', async () => {
    const snapshot = await snapshotService.saveSnapshot({
      tenantId,
      candidateId,
      canonicalJobId: deriveCanonicalJobId({
        jobUrl: job.sourceUrl,
        provider: job.provider,
        company: job.company,
        title: job.title,
      }),
      jobContentHash: computeJobContentHash(job),
      overallFit: {
        score: 70,
        confidence: 0.8,
        classification: 'STRONG_MATCH',
        analyzedAt: new Date('2026-10-10T08:15:30.125Z'),
      },
      projectRankings: [],
      matchAnalysis: {},
      parsedJobDescription: { title: job.title, company: job.company },
    });
    const res = await fetch(baseUrl + '/api/extension/prepare-handoff', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + session.rawToken, 'content-type': 'application/json' },
      body: JSON.stringify({ job, analysisSnapshotId: snapshot.id }),
    });
    const text = await res.text();
    assert.equal(res.status, 200, text);
    prepared = JSON.parse(text);
    assert.equal(prepared.artifactStatus, 'READY', JSON.stringify(prepared));
    const handoffPage = await request(`/applications/${prepared.applicationId}/handoff`);
    const handoffHtml = await handoffPage.text();
    assert.equal(handoffPage.status, 200, handoffHtml);
    assert.ok(handoffHtml.includes('Prepared for Manual Submission'));
    const historyPage = await request(
      `/applications/${prepared.applicationId}/handoff?history=true&version=${prepared.packageVersion}`
    );
    assert.equal(historyPage.status, 200, await historyPage.text());
    const unauthorizedPage = await fetch(
      baseUrl + `/applications/${prepared.applicationId}/handoff`,
      {
        redirect: 'manual',
      }
    );
    assert.equal(unauthorizedPage.status, 302);
    const foreignPage = await request(
      `/applications/${prepared.applicationId}/handoff`,
      undefined,
      otherSession.rawToken
    );
    assert.equal(foreignPage.status, 404);
    const [row] = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, prepared.applicationId));
    firstPackage = structuredClone(row.packagePayload);
    const doc = firstPackage.structuredResume;
    assert.deepEqual(doc.education, sourceModel.education);
    assert.deepEqual(doc.certifications, sourceModel.certifications);
    assert.deepEqual(doc.optionalSections, sourceModel.optionalSections);
    assert.equal(doc.candidateIdentity.location, 'Pune');
    assert.ok(
      doc.candidateIdentity.links.some((link) => link.url === 'https://fixture.github.io/research')
    );
    assert.ok(
      doc.candidateIdentity.links.some((link) => link.url === 'https://fixture.github.io/teaching')
    );
    assert.equal(doc.experience[0].summary, 'Supported accessible research.');
    assert.equal(doc.experience[0].description, 'Maintained participant documentation.');
    for (const expected of [
      'Second University',
      'Fixture Board',
      'CRED-1',
      'Fixture Journal',
      'Workshop Facilitator',
      'Reviewed accessibility guidelines.',
      'Supported accessible research.',
      'Maintained participant documentation.',
    ])
      assert.ok(
        firstPackage.tailoredResume.markdownContent.includes(expected),
        'preview missing ' + expected
      );
    assert.equal(computeApplicationPackageHash(firstPackage), prepared.packageHash);
    for (let reload = 0; reload < 3; reload++) {
      const [saved] = await db
        .select()
        .from(applicationPackages)
        .where(eq(applicationPackages.id, row.id));
      assert.equal(computeApplicationPackageHash(saved.packagePayload), prepared.packageHash);
    }
    const download = await request(prepared.artifacts.resume.downloadUrl);
    assert.equal(download.status, 200, await download.clone().text());
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.ok(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.ok(download.headers.get('content-disposition').includes("filename*=UTF-8''"));
    await fs.writeFile(path.join(output, 'complete-resume.pdf'), bytes);
    await fs.writeFile(path.join(output, 'complete-resume.json'), JSON.stringify(doc, null, 2));
    const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
      applicationPackage: firstPackage,
    }).texContent;
    await fs.writeFile(path.join(output, 'complete-resume.tex'), tex);
    const foreign = await request(
      prepared.artifacts.resume.downloadUrl,
      undefined,
      otherSession.rawToken
    );
    assert.ok([403, 404].includes(foreign.status));
    const bundle = await request(prepared.artifacts.bundle.downloadUrl);
    assert.equal(bundle.status, 200, await bundle.clone().text());
    const zip = Buffer.from(await bundle.arrayBuffer());
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    await fs.writeFile(path.join(output, 'handoff-kit.zip'), zip);
  });

  it('edits/save/reload/regenerate preserve IDs and leave prior package/hash immutable; malformed input does not persist', async () => {
    const changed = structuredClone(sourceModel.education);
    changed[0].grade = 'Candidate corrected grade';
    const saved = await request('/profile', { education: changed });
    assert.equal(saved.status, 200, await saved.clone().text());
    const candidate = await contentService.buildCandidateData({
      ...context,
      candidateId,
      jobPosting: job,
    });
    const doc = buildStructuredResumeDocument({ candidateProfile: candidate, jobPosting: job });
    assert.equal(doc.education[0].id, 'edu-1');
    assert.equal(doc.education[0].grade, changed[0].grade);
    const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
      applicationPackage: { structuredResume: doc },
    }).texContent;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'edited-resume' });
    assert.equal(result.compilerUsed, 'chrome_headless');
    await fs.writeFile(path.join(output, 'edited-resume.pdf'), result.pdfBuffer);
    const [old] = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.applicationId, prepared.applicationId));
    assert.deepEqual(old.packagePayload, firstPackage);
    assert.equal(computeApplicationPackageHash(old.packagePayload), prepared.packageHash);
    const invalid = await request('/profile', {
      education: [{ institution: 'University', endDate: '2024-99' }],
    });
    assert.ok([400, 422].includes(invalid.status));
    const [after] = await db.select().from(candidates).where(eq(candidates.id, candidateId));
    assert.deepEqual(after.profileMetadata.userCustom.education, changed);
    const malformed = await request('/profile', { education: '{broken json' });
    assert.equal(malformed.status, 400);
    const clear = await request('/profile', { certifications: null });
    assert.equal(clear.status, 200);
    assert.deepEqual(
      (await profileService.getCareerProfile(context, candidateId)).certifications,
      []
    );
  });

  it('uploads TXT, promotes full parsed records/optional sections, renders and downloads the unchanged original', async () => {
    const uploadText =
      'SUMMARY\nI study accessible interfaces.\n\nPROJECTS\nAccessible Interface | JavaScript\n- Implemented keyboard navigation for the interface.\n- Documented accessible user interaction requirements.\n- Reviewed interface tests for input validation.\nSource Code: https://github.com/fixture/interface\nProject Link: https://fixture.github.io/interface\n\nEDUCATION\nMSc in Computing, Fixture University | Sep 2023 - Present\n\nCERTIFICATIONS\nFixture License | Issuer: Fixture Board | Issued: 2024-06 | Expires: 2027-06 | ID: CRED-UPLOAD | URL: https://issuer.example.test/upload\n\nPUBLICATIONS\nAccessible Systems published in Fixture Journal, 2024\n\nLANGUAGES\nHindi\n\n## Professional Activities\nReviewed accessibility guidelines.';
    const upload = await request(
      '/resumes/upload',
      {
        fileName: 'prd003-resume.txt',
        mimeType: 'text/plain',
        base64Content: Buffer.from(uploadText).toString('base64'),
      },
      otherSession.rawToken
    );
    const uploadBody = await upload.json();
    assert.equal(upload.status, 201, JSON.stringify(uploadBody));
    const id = uploadBody.data.resume.id;
    const approve = await request(
      `/resumes/${id}/approve`,
      { promoteToBase: true },
      otherSession.rawToken
    );
    assert.equal(approve.status, 200, await approve.clone().text());
    const candidate = await contentService.buildCandidateData({
      tenantId,
      userId: otherUserId,
      candidateId: otherCandidateId,
      jobPosting: job,
    });
    assert.equal(candidate.education[0].startDate, '2023-09');
    assert.equal(candidate.education[0].degree, 'MSc in Computing');
    assert.equal(candidate.education[0].institution, 'Fixture University');
    assert.equal(candidate.education[0].isCurrent, true);
    assert.equal(candidate.certifications[0].credentialId, 'CRED-UPLOAD');
    assert.equal(candidate.certifications[0].issuingOrganization, 'Fixture Board');
    assert.equal(candidate.publications.length, 1);
    assert.equal(candidate.languages[0].language, 'Hindi');
    assert.equal(candidate.customSections[0].items[0], 'Reviewed accessibility guidelines.');
    assert.equal(candidate.projects.length, 1);
    assert.equal(candidate.projects[0].repositoryUrl, 'https://github.com/fixture/interface');
    assert.equal(candidate.projects[0].liveUrl, 'https://fixture.github.io/interface');
    assert.deepEqual(candidate.projects[0].technologies, ['JavaScript']);
    assert.equal(candidate.projects[0].description, null);
    // Generate the master resume here; tailored selection requires an authoritative
    // job ranking and must not be fabricated by a persistence test.
    const doc = buildStructuredResumeDocument({ candidateProfile: candidate });
    assert.equal(doc.projects.length, 1);
    assert.ok(doc.projects[0].projectId);
    const reloadedCandidate = await contentService.buildCandidateData({
      tenantId,
      userId: otherUserId,
      candidateId: otherCandidateId,
      jobPosting: job,
    });
    assert.deepEqual(reloadedCandidate.projects, candidate.projects);
    assert.equal(
      buildStructuredResumeDocument({ candidateProfile: reloadedCandidate }).projects[0].projectId,
      doc.projects[0].projectId
    );
    const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
      applicationPackage: { structuredResume: doc },
    }).texContent;
    const rendered = await compiler.compileLatexToPdf({
      texContent: tex,
      jobName: 'uploaded-resume',
    });
    await fs.writeFile(path.join(output, 'uploaded-resume.pdf'), rendered.pdfBuffer);
    await fs.writeFile(path.join(output, 'uploaded-resume.json'), JSON.stringify(doc, null, 2));
    await fs.writeFile(path.join(output, 'uploaded-resume.tex'), tex);
    const download = await request(`/resumes/${id}/download`, undefined, otherSession.rawToken);
    assert.equal(download.status, 200);
    assert.equal(Buffer.from(await download.arrayBuffer()).toString(), uploadText);
    const denied = await request(`/resumes/${id}/download`);
    assert.ok([403, 404].includes(denied.status));
  });

  it('invalid uploaded credential dates fail before promotion and retain the parsed original', async () => {
    const upload = await request(
      '/resumes/upload',
      {
        fileName: 'invalid-dates.txt',
        mimeType: 'text/plain',
        base64Content: Buffer.from('CERTIFICATIONS\nCredential | Issued: 2024-99').toString(
          'base64'
        ),
      },
      otherSession.rawToken
    );
    assert.equal(upload.status, 201);
    const id = (await upload.json()).data.resume.id;
    const approve = await request(
      `/resumes/${id}/approve`,
      { promoteToBase: true },
      otherSession.rawToken
    );
    assert.equal(approve.status, 400, await approve.clone().text());
    const { resumes } = await import('../../src/db/schema.js');
    const [row] = await db.select().from(resumes).where(eq(resumes.id, id));
    assert.equal(row.lifecycleState, 'PARSED');
    assert.equal(row.isBaseResume, false);
    const download = await request(`/resumes/${id}/download`, undefined, otherSession.rawToken);
    assert.equal(download.status, 200);
    assert.equal(
      Buffer.from(await download.arrayBuffer()).toString(),
      'CERTIFICATIONS\nCredential | Issued: 2024-99'
    );
  });
});
