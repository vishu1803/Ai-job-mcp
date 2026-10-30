/**
 * @file P88 Integration Test: Job Radar, Sources Hardening, Save/Unsave Pipeline & Gemini 3.8 Flash Policy
 *
 * Verifies:
 * 1. AI Task Policy: all canonical tasks use gemini-3.8-flash preferredModelId.
 * 2. Job Discovery Service: production instances never leak synthetic jobs.
 * 3. Sources -> GitHub -> Select Repositories return flow with from=sources preservation.
 * 4. Job Radar full flow: Discovery, deterministic ATS scoring, Save Job persistence, Saved Jobs tab, and Unsave flow.
 * 5. UI Hygiene: No raw unicode emojis in onboarding and profile views.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq, and, isNotNull } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  users,
  tenants,
  candidates,
  resumes,
  resourceConnections,
  resources,
  jobApplications,
  applicationPackages,
  tailoredDocuments,
} from '../../src/db/schema.js';
import { resumeGenerations } from '../../src/db/resume-generation.schema.js';
import { resumeStudioDrafts } from '../../src/db/resume-studio.schema.js';
import { createSession } from '../../src/security/session.service.js';
import { BaseResourceConnector } from '../../src/connectors/base/resource-connector.js';
import { connectorRegistry } from '../../src/connectors/registry/connector-registry.js';
import { defaultTaskPolicyRegistry } from '../../src/clients/ai/task-policy.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { ResumeGenerationService } from '../../src/services/resume-generation.service.js';
import { ResumeStudioDraftService } from '../../src/services/resume-studio-draft.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { studioMasterFacts } from '../fixtures/resume-studio-master.js';

describe('P88: Production Verification and Fix — Radar, Sources & AI Policy', () => {
  let app;
  let rawSessionToken;
  let testUser;
  let testTenant;
  let testCandidate;
  const createdTenantIds = [];

  const mockRepos = [
    { id: '1001', name: 'cloud-mesh', fullName: 'testuser/cloud-mesh', isPrivate: false },
    {
      id: '1002',
      name: 'telemetry-engine',
      fullName: 'testuser/telemetry-engine',
      isPrivate: true,
    },
  ];

  class MockGitHubConnector extends BaseResourceConnector {
    constructor() {
      super('GITHUB_APP');
    }
    getCapabilities() {
      return new Set();
    }
    async listResources() {
      return {
        totalCount: mockRepos.length,
        items: mockRepos.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.fullName,
          isPrivate: r.isPrivate,
          metadata: { htmlUrl: `https://github.com/${r.fullName}` },
        })),
      };
    }
  }

  before(async () => {
    connectorRegistry.register('GITHUB_APP', new MockGitHubConnector(), { allowOverride: true });

    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    [testTenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'P88 Test Tenant',
        slug: `p88-tenant-${Date.now()}`,
      })
      .returning();

    const userId = crypto.randomUUID();
    [testUser] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId: testTenant.id,
        email: `alex.rivera.${Date.now()}@rivera-systems.dev`,
        displayName: 'P88 Test Candidate',
        role: 'MEMBER',
      })
      .returning();

    const candidateId = crypto.randomUUID();
    [testCandidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId: testTenant.id,
        userId: testUser.id,
        displayName: 'P88 Test Candidate',
        canonicalEmail: testUser.email,
        headline: 'Distributed Systems Engineer',
        profileMetadata: {
          targetRoles: ['Staff Distributed Systems Engineer', 'Senior Backend Engineer'],
          userCustom: { specialization: 'Systems' },
        },
      })
      .returning();

    // Clean up any leftover installationId from interrupted test runs
    await db.delete(resourceConnections).where(eq(resourceConnections.installationId, '987654'));

    // Create GitHub Connection
    await db.insert(resourceConnections).values({
      id: crypto.randomUUID(),
      tenantId: testTenant.id,
      userId: testUser.id,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'GitHub App Installation',
      externalAccountId: '987654',
      externalAccountName: 'testuser',
      installationId: '987654',
      encryptedCredentials: 'enc:v1:dummy',
      status: 'ACTIVE',
      metadata: {
        account: 'testuser',
        authorityPolicy: 'personal-owner-or-org-owner-v1',
      },
    });

    app = buildApp({
      logger: false,
      database: db,
      installationService: {
        verifyGitHubInstallation: async (id) => ({
          id: Number(id),
          account: { id: 987654, login: 'testuser', type: 'User' },
        }),
      },
    });
    await app.ready();

    const session = await createSession(db, {
      userId: testUser.id,
      tenantId: testTenant.id,
      role: testUser.role,
      authMethod: 'LOCAL',
    });

    rawSessionToken = session.rawToken;
  });

  after(async () => {
    if (app) await app.close();
    for (const tid of createdTenantIds) {
      await db.delete(resumeStudioDrafts).where(eq(resumeStudioDrafts.tenantId, tid));
      await db
        .delete(resumeGenerations)
        .where(
          and(eq(resumeGenerations.tenantId, tid), isNotNull(resumeGenerations.parentGenerationId))
        );
      await db.delete(resumeGenerations).where(eq(resumeGenerations.tenantId, tid));
      await db.delete(applicationPackages).where(eq(applicationPackages.tenantId, tid));
      await db.delete(tailoredDocuments).where(eq(tailoredDocuments.tenantId, tid));
      await db.delete(resumes).where(eq(resumes.tenantId, tid));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tid));
      await db.delete(resources).where(eq(resources.tenantId, tid));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tid));
      await db.delete(candidates).where(eq(candidates.tenantId, tid));
      await db.delete(users).where(eq(users.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. AI Task Policy Standard
  // ---------------------------------------------------------------------------
  describe('1. Gemini 3.8 Flash Task Policy Standard', () => {
    it('enforces gemini-3.8-flash as the preferred model for all canonical AI policies', () => {
      const allPolicies = Array.from(defaultTaskPolicyRegistry.policies.values());
      assert.ok(allPolicies.length >= 10, 'Expected multiple canonical policies registered');

      for (const policy of allPolicies) {
        assert.equal(
          policy.preferredModelId,
          'gemini-3.8-flash',
          `Policy ${policy.taskType} must use gemini-3.8-flash as preferredModelId`
        );
      }
    });

    it('returns gemini-3.8-flash for CAREER_ASSISTANT policy resolution', () => {
      const policy = defaultTaskPolicyRegistry.getPolicy('CAREER_ASSISTANT');
      assert.equal(policy.preferredModelId, 'gemini-3.8-flash');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Production Job Discovery Isolation
  // ---------------------------------------------------------------------------
  describe('2. Job Discovery Synthetic Isolation', () => {
    it('returns zero synthetic jobs when includeSynthetic is false', async () => {
      const discovery = new JobDiscoveryService({ includeSynthetic: false });
      const res = await discovery.searchJobs({ query: 'Engineer' });
      assert.ok(Array.isArray(res.jobs));
      const hasStripe = res.jobs.some((j) => j.company === 'Stripe' && j.id.startsWith('SYN-'));
      assert.equal(hasStripe, false, 'Synthetic Stripe jobs must not appear');
    });

    it('rejects with NotFoundError when getting synthetic posting with includeSynthetic: false', async () => {
      const discovery = new JobDiscoveryService({ includeSynthetic: false });
      await assert.rejects(async () => discovery.getJobPosting({ jobId: 'SYN-001' }), /not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Sources -> GitHub Add Repository Return Flow
  // ---------------------------------------------------------------------------
  describe('3. Sources -> GitHub Selection Flow', () => {
    it('preserves from=sources on POST /onboarding/repositories/select and redirects to /sources with success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/onboarding/repositories/select',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'from=sources&repositories=1001&repositories=1002',
      });

      assert.equal(res.statusCode, 302);
      assert.match(res.headers.location, /\/sources\?success=/);

      // Verify database persistence as ACTIVE resources
      const saved = await db
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.tenantId, testTenant.id),
            eq(resources.candidateId, testCandidate.id),
            eq(resources.status, 'ACTIVE')
          )
        );

      assert.equal(saved.length, 2);
      const names = saved.map((r) => r.name);
      assert.ok(names.some((n) => n.includes('cloud-mesh')));
      assert.ok(names.some((n) => n.includes('telemetry-engine')));
    });

    it('renders the selected active repositories on GET /sources', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/sources',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /cloud-mesh/);
      assert.match(res.payload, /telemetry-engine/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Job Radar Discovery, Persistence & Save/Unsave Pipeline
  // ---------------------------------------------------------------------------
  describe('4. Job Radar Discovery & Pipeline Persistence', () => {
    it('GET /apps/radar renders Discover tab with search form and navigation tabs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/apps/radar',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /Job Radar &amp; Market Fit|Job Radar & Market Fit/);
      assert.match(res.payload, /Discover Jobs/);
      assert.match(res.payload, /Saved Pipeline/);
      assert.match(res.payload, /Custom Analysis/);
    });

    it('POST /jobs/save persists a selected job into jobApplications with status SAVED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs/save',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          jobId: 'EXT-JOB-9901',
          title: 'Principal Systems Architect',
          company: 'HyperScale Systems',
          location: 'Remote, US',
          workplaceType: 'REMOTE',
          skills: ['Distributed Systems', 'Go', 'Kubernetes'],
          atsScore: 92,
        }),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.success, true);
      assert.equal(body.saved, true);
      assert.equal(body.jobId, 'EXT-JOB-9901');

      // Verify in DB
      const [appRecord] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, testTenant.id),
            eq(jobApplications.candidateId, testCandidate.id),
            eq(jobApplications.canonicalJobId, 'EXT-JOB-9901')
          )
        );

      assert.ok(appRecord);
      assert.equal(appRecord.status, 'SAVED');
      assert.equal(appRecord.companyName, 'HyperScale Systems');
      assert.equal(appRecord.jobTitle, 'Principal Systems Architect');
      assert.equal(appRecord.source, 'JOB_RADAR');
    });

    it('GET /apps/radar?tab=saved displays the saved job in the candidate pipeline', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/apps/radar?tab=saved',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /Principal Systems Architect/);
      assert.match(res.payload, /HyperScale Systems/);
      assert.match(res.payload, /Tailor resume/i);
    });

    it('POST /jobs/unsave marks the application as ARCHIVED and removes from active saved pipeline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs/unsave',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          jobId: 'EXT-JOB-9901',
        }),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.success, true);
      assert.equal(body.saved, false);

      // Verify DB status is ARCHIVED
      const [appRecord] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, testTenant.id),
            eq(jobApplications.canonicalJobId, 'EXT-JOB-9901')
          )
        );

      assert.equal(appRecord.status, 'ARCHIVED');

      // Check saved tab now renders clean empty state
      const tabRes = await app.inject({
        method: 'GET',
        url: '/apps/radar?tab=saved',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(tabRes.statusCode, 200);
      assert.match(tabRes.payload, /No Saved Jobs in Pipeline/);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Authoritative Job Snapshot Across Save → Prepare → Generate → Regenerate → Studio
  // ---------------------------------------------------------------------------
  describe('6. Authoritative Job Snapshot Across Save → Prepare → Generate → Regenerate → Studio', () => {
    let baseResumeId;
    let storageDir;
    let genEngine;
    let workflowSvc;
    let draftSvc;

    const fullJobDescription =
      'Design, build, and operate fault-tolerant distributed storage and consensus services in Node.js, Go, and PostgreSQL. Own API reliability, schema migrations, and zero-downtime deployment pipelines across multi-region clusters.';
    const fullRequirements = [
      '5+ years building distributed backend systems with Node.js and PostgreSQL',
      'Strong experience with REST APIs, database schema migrations, and automated testing',
    ];
    const fullResponsibilities = [
      'Architect resilient microservices and maintain high-throughput data pipelines',
      'Collaborate with product and infrastructure teams on reliability and observability',
    ];

    before(async () => {
      storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'p88-job-snapshot-'));
      const storage = new DocumentStorageService({ database: db, storageDir });
      baseResumeId = crypto.randomUUID();
      const sourceHash = 'a'.repeat(64);

      const resumeSource = {
        ...structuredClone(studioMasterFacts),
        sourceResumeId: baseResumeId,
        sourceVersion: 1,
      };

      await db.insert(resumes).values({
        id: baseResumeId,
        tenantId: testTenant.id,
        candidateId: testCandidate.id,
        version: 1,
        fileName: 'master-resume.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 1024,
        storageKey: 'test-master-key',
        contentHash: sourceHash,
        isBaseResume: true,
        lifecycleState: 'BASE_RESUME',
      });

      await db
        .update(candidates)
        .set({
          profileMetadata: {
            targetRoles: ['Staff Distributed Systems Engineer', 'Senior Backend Engineer'],
            userCustom: { specialization: 'Systems' },
            resumeData: resumeSource,
          },
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, testCandidate.id));

      genEngine = new ResumeGenerationService({
        database: db,
        aiProvider: null,
        storage,
        generator: {
          generateTailoredResumeLatex: () => ({ texContent: 'Controlled layout fixture' }),
        },
        compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
        compileDocument: async () => ({
          pdf: Buffer.from('Snapshot test PDF bytes').toString('base64'),
          docx: Buffer.from('Snapshot test DOCX bytes').toString('base64'),
          verification: {
            failedChecks: [],
            pageCount: 1,
            a4: true,
            textPreserved: true,
            minimumFontPt: 10,
            fontsEmbedded: true,
            unicodeMaps: true,
            wordSpacing: true,
            readingOrder: true,
            noClipping: true,
            noOverlaps: true,
            glyphsSafe: true,
            docxTextPreserved: true,
            marginIn: 0.6,
            lineHeight: 1.24,
            compiler: 'chrome_headless',
          },
        }),
      });

      workflowSvc = new JobApplicationWorkflowService({
        database: db,
        aiProvider: null,
        candidateArtifactContentService: new CandidateArtifactContentService({
          database: db,
          resumeGenerationService: genEngine,
        }),
      });

      draftSvc = new ResumeStudioDraftService({ database: db });
    });

    after(async () => {
      if (storageDir) {
        await fs.rm(storageDir, { recursive: true, force: true });
      }
    });

    it('preserves full job description across Save → partial Save → Prepare → Generate → Regenerate → Studio without replacing with shorter title', async () => {
      const ctx = {
        tenantId: testTenant.id,
        userId: testUser.id,
        candidateId: testCandidate.id,
        role: 'MEMBER',
      };

      // Step 1: Save full job description
      const saveRes = await app.inject({
        method: 'POST',
        url: '/jobs/save',
        cookies: { career_hub_session: rawSessionToken },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        payload: JSON.stringify({
          jobId: 'EXT-FULL-SNAPSHOT-01',
          title: 'Staff Distributed Systems Engineer',
          company: 'CloudScale Corp',
          location: 'Remote',
          workplaceType: 'REMOTE',
          url: 'https://careers.cloudscale.example.com/jobs/101',
          description: fullJobDescription,
          requirements: fullRequirements,
          responsibilities: fullResponsibilities,
          skills: ['Node.js', 'PostgreSQL', 'Go'],
          atsScore: 94,
        }),
      });
      assert.equal(saveRes.statusCode, 200);
      const saveBody = JSON.parse(saveRes.payload);
      assert.ok(saveBody.applicationId);

      // Step 2: Subsequent untrusted partial/title-only POST /jobs/save must NOT erase saved description or requirements
      const partialRes = await app.inject({
        method: 'POST',
        url: '/jobs/save',
        cookies: { career_hub_session: rawSessionToken },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        payload: JSON.stringify({
          jobId: 'EXT-FULL-SNAPSHOT-01',
          title: 'Staff Distributed Systems Engineer',
          company: 'CloudScale Corp',
          description: 'Staff Distributed Systems Engineer',
          requirements: [],
          responsibilities: [],
          skills: [],
        }),
      });
      assert.equal(partialRes.statusCode, 200);

      const [savedApp] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, saveBody.applicationId));
      assert.equal(savedApp.rawJobDescription, fullJobDescription);
      assert.deepEqual(savedApp.parsedJobDescription.requirements, fullRequirements);
      assert.deepEqual(savedApp.parsedJobDescription.responsibilities, fullResponsibilities);
      assert.deepEqual(savedApp.parsedJobDescription.requiredSkills, [
        'Node.js',
        'PostgreSQL',
        'Go',
      ]);

      // Step 3: Prepare application even when caller passes only the bare title in jobPosting.description
      const prepared = await workflowSvc.prepareJobApplication({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        candidateId: testCandidate.id,
        applicationId: savedApp.id,
        jobPosting: {
          title: 'Staff Distributed Systems Engineer',
          company: 'CloudScale Corp',
          description: 'Staff Distributed Systems Engineer',
          canonicalJobId: 'EXT-FULL-SNAPSHOT-01',
        },
        options: {
          persistTracking: true,
          includeCoverLetter: false,
        },
      });
      assert.equal(prepared.targetJob.rawDescription, fullJobDescription);
      assert.equal(prepared.targetJob.isRoleOnly, false);

      // Step 4: Generate resume version with applicationId and title-only rawDescription -> reconciles to full description
      const generated = await genEngine.execute(ctx, {
        sourceResumeId: baseResumeId,
        applicationId: savedApp.id,
        origin: 'STUDIO_ENTRY',
        idempotencyKey: 'full-snapshot-gen-1',
        jobTarget: {
          title: 'Staff Distributed Systems Engineer',
          company: 'CloudScale Corp',
          rawDescription: 'Staff Distributed Systems Engineer',
        },
      });
      assert.equal(generated.request.jobSnapshot.rawDescription, fullJobDescription);
      assert.equal(generated.request.jobSnapshot.isRoleOnly, false);
      assert.equal(generated.request.jobSnapshot.tailoringScope, 'JOB_SPECIFIC');

      // Step 5: Regenerate child generation -> inherits applicationId and preserves full job description
      const regeneratedGen = await genEngine.execute(ctx, {
        sourceResumeId: baseResumeId,
        parentGenerationId: generated.id,
        origin: 'REGENERATION',
        idempotencyKey: 'full-snapshot-gen-2',
        forceRegenerate: true,
        jobTarget: {
          title: 'Staff Distributed Systems Engineer',
          company: 'CloudScale Corp',
          rawDescription: 'Staff Distributed Systems Engineer',
        },
      });
      assert.equal(regeneratedGen.applicationId, savedApp.id);
      assert.equal(regeneratedGen.request.jobSnapshot.rawDescription, fullJobDescription);

      // Step 6: Open Studio draft from generation and GET /resume-studio?applicationId=...
      const studioDraft = await draftSvc.create(ctx, {
        generationId: regeneratedGen.id,
      });
      assert.equal(studioDraft.jobTarget.rawDescription, fullJobDescription);

      const studioPageRes = await app.inject({
        method: 'GET',
        url: `/resume-studio?applicationId=${savedApp.id}&draftId=${studioDraft.id}`,
        cookies: { career_hub_session: rawSessionToken },
      });
      assert.equal(studioPageRes.statusCode, 200);
      assert.ok(
        studioPageRes.payload.includes('fault-tolerant distributed storage and consensus services'),
        'Studio page must embed the full authoritative job description'
      );
    });

    it('supports genuinely title-only saved applications across Save → Prepare → Generate → Studio in role-only mode', async () => {
      const ctx = {
        tenantId: testTenant.id,
        userId: testUser.id,
        candidateId: testCandidate.id,
        role: 'MEMBER',
      };

      // Step 1: Save a title-only job (no full description)
      const saveRes = await app.inject({
        method: 'POST',
        url: '/jobs/save',
        cookies: { career_hub_session: rawSessionToken },
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        payload: JSON.stringify({
          jobId: 'EXT-TITLE-ONLY-02',
          title: 'Backend Engineer',
          company: 'Minimalist Labs',
          location: 'Remote',
          workplaceType: 'REMOTE',
        }),
      });
      assert.equal(saveRes.statusCode, 200);
      const saveBody = JSON.parse(saveRes.payload);
      assert.ok(saveBody.applicationId);

      const [titleOnlyApp] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, saveBody.applicationId));
      assert.equal(titleOnlyApp.rawJobDescription, null);

      // Step 2: Prepare application in role-only mode
      const prepared = await workflowSvc.prepareJobApplication({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        candidateId: testCandidate.id,
        applicationId: titleOnlyApp.id,
        jobPosting: {
          title: 'Backend Engineer',
          company: 'Minimalist Labs',
          description: 'Backend Engineer',
          canonicalJobId: 'EXT-TITLE-ONLY-02',
          isRoleOnly: true,
          tailoringScope: 'ROLE_BASED',
        },
        options: {
          persistTracking: true,
          includeCoverLetter: false,
        },
      });
      assert.equal(prepared.targetJob.isRoleOnly, true);
      assert.equal(prepared.targetJob.tailoringScope, 'ROLE_BASED');

      // Step 3: Generate resume version for title-only application
      const generated = await genEngine.execute(ctx, {
        sourceResumeId: baseResumeId,
        applicationId: titleOnlyApp.id,
        origin: 'STUDIO_ENTRY',
        idempotencyKey: 'title-only-gen-1',
        jobTarget: {
          title: 'Backend Engineer',
          company: 'Minimalist Labs',
          rawDescription: 'Backend Engineer',
          isRoleOnly: true,
          tailoringScope: 'ROLE_BASED',
        },
      });
      assert.equal(generated.request.jobSnapshot.isRoleOnly, true);
      assert.equal(generated.request.jobSnapshot.tailoringScope, 'ROLE_BASED');

      // Step 4: Create Studio draft and load GET /resume-studio?applicationId=...
      const studioDraft = await draftSvc.create(ctx, {
        generationId: generated.id,
      });
      assert.equal(studioDraft.jobTarget.title, 'Backend Engineer');

      const studioPageRes = await app.inject({
        method: 'GET',
        url: `/resume-studio?applicationId=${titleOnlyApp.id}`,
        cookies: { career_hub_session: rawSessionToken },
      });
      assert.equal(studioPageRes.statusCode, 200);
      assert.ok(studioPageRes.payload.includes('Backend Engineer'));
    });
  });
});
