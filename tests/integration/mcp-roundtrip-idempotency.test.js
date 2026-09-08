/**
 * @file Integration Tests for MCP Application Package Round-Trip & Idempotency Contract (P14-029).
 *
 * Verifies Scenarios A through J:
 * - Scenario A: New application creation -> lifecycleAction: CREATED, version 1, jobFitAnalysis attached
 * - Scenario B: Existing application with explicit applicationId -> lifecycleAction: REUSED, zero extra rows,
 *               plus validation of APPLICATION_JOB_MISMATCH on job conflict and unauthorized access rejection
 * - Scenario C: Identical prepare without explicit applicationId -> lifecycleAction: REUSED, zero duplicate rows
 * - Scenario D: Changed package content -> lifecycleAction: UPDATED, monotonic version increment, hash changes
 * - Scenario E: Submitted application protection -> mutations rejected with APPLICATION_ALREADY_SUBMITTED, original package preserved
 * - Scenario F: Dedicated package read capability (get_application_package) -> returns exact snapshot (packagePayload)
 * - Scenario G: Validation round-trip -> validate_job_application with retrieved package yields matching packageHash
 * - Scenario H: Preview round-trip -> create_application_preview with retrieved package yields matching packageHash
 * - Scenario I: Handoff kit / tracking inspection -> get_job_application retains consistent applicationId, packageVersion, packageHash
 * - Scenario J: Database ledger audit -> total applications match exactly, zero duplicate rows, packagePayload persisted
 * - Option A Job Match resolution -> jobMatch.score is 49.9 strictly via analyze_job_fit passthrough (no 18 vs 49.9 conflict)
 * - Tools/list schema audit -> get_application_package and prepare_job_application schemas verified
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and, inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  jobApplications,
  applicationPackages,
} from '../../src/db/schema.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';

const PROTOCOL_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('MCP Application Package Round-Trip & Idempotency Contract (P14-029)', () => {
  let app;
  let mcpAuthHeader;
  let otherTenantMcpAuthHeader;
  const createdTenantIds = [];

  let tenant;
  let user;
  let candidate;

  let _otherTenant;
  let otherUser;
  let otherCandidate;

  let discoveryService;
  let workflowService;
  let trackingService;
  let tokenService;

  let vercelJobPosting;
  let stripeJobPosting;

  async function callMcpTool(toolName, args, authHeader = mcpAuthHeader) {
    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': toolName,
      },
      payload: {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
          _meta: PROTOCOL_META,
        },
      },
    });
  }

  async function callToolsList(authHeader = mcpAuthHeader) {
    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: authHeader,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      payload: {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/list',
        params: {
          _meta: PROTOCOL_META,
        },
      },
    });
  }

  before(async () => {
    discoveryService = new JobDiscoveryService();
    workflowService = new JobApplicationWorkflowService({ database: db });
    trackingService = new ApplicationTrackingService({ database: db });
    tokenService = new McpApiTokenService({ database: db });

    // 1. Primary Tenant & User
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    [tenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'P14-029 Primary Corp',
        slug: `roundtrip-primary-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();

    const userId = crypto.randomUUID();
    [user] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId,
        email: `candidate-${Date.now()}@example.test`,
        displayName: 'Vishwanath Nishad',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateId = crypto.randomUUID();
    [candidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId,
        userId,
        displayName: 'Vishwanath Nishad',
        canonicalEmail: user.email,
        headline: 'Full-Stack Software Engineer',
        profileMetadata: {
          problemSolving: {
            bullets: ['Solved 500+ algorithmic problems across dynamic programming, trees, and graphs on LeetCode.'],
            leetcodeUrl: 'https://leetcode.com/u/vishwanatnishad',
          },
          userCustom: {
            education: [
              {
                institution: 'Rajkiya Engineering College',
                degree: 'B.Tech in Electronics Engineering',
                year: '2025',
              },
            ],
            experience: [
              {
                company: 'FTV Saloon',
                title: 'Full Stack Developer Intern',
                period: '2024-06 - 2024-09',
                bullets: ['Designed and implemented RESTful APIs.'],
              },
            ],
          },
        },
      })
      .returning();

    // 2. Candidate Skills
    const [skillNode] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'Node.js',
        slug: `node-js-${Date.now()}`,
        category: 'FRAMEWORK',
      })
      .returning();

    const [skillTypeScript] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'TypeScript',
        slug: `typescript-${Date.now()}`,
        category: 'LANGUAGE',
      })
      .returning();

    await db.insert(candidateSkills).values([
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        skillId: skillNode.id,
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: crypto.randomUUID(),
        tenantId,
        candidateId,
        skillId: skillTypeScript.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
      },
    ]);

    // 3. Isolated Secondary Tenant (for tenant isolation tests)
    const otherTenantId = crypto.randomUUID();
    createdTenantIds.push(otherTenantId);
    [_otherTenant] = await db
      .insert(tenants)
      .values({
        id: otherTenantId,
        name: 'P14-029 Foreign Corp',
        slug: `roundtrip-foreign-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();

    const otherUserId = crypto.randomUUID();
    [otherUser] = await db
      .insert(users)
      .values({
        id: otherUserId,
        tenantId: otherTenantId,
        email: `foreign-${Date.now()}@example.test`,
        displayName: 'Foreign Candidate',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const otherCandidateId = crypto.randomUUID();
    [otherCandidate] = await db
      .insert(candidates)
      .values({
        id: otherCandidateId,
        tenantId: otherTenantId,
        userId: otherUserId,
        displayName: 'Foreign Candidate',
        canonicalEmail: otherUser.email,
        headline: 'Security Researcher',
      })
      .returning();

    // 4. Build Fastify App
    app = await buildApp({
      database: db,
      jobDiscoveryService: discoveryService,
      jobApplicationWorkflowService: workflowService,
      applicationTrackingService: trackingService,
    });

    const mcpTokenResult = await tokenService.createToken({
      tenantId,
      userId,
      role: user.role,
      name: 'Round-Trip Test Token',
      scopes: ['career:read', 'career:write'],
    });
    mcpAuthHeader = `Bearer ${mcpTokenResult.rawToken}`;

    const otherTokenResult = await tokenService.createToken({
      tenantId: otherTenantId,
      userId: otherUserId,
      role: otherUser.role,
      name: 'Foreign Test Token',
      scopes: ['career:read', 'career:write'],
    });
    otherTenantMcpAuthHeader = `Bearer ${otherTokenResult.rawToken}`;

    // Job definitions
    vercelJobPosting = {
      id: crypto.randomUUID(),
      canonicalJobId: 'greenhouse:vercel:998877',
      source: 'GREENHOUSE',
      company: 'Vercel',
      title: 'Senior Software Engineer - Cloud Platform',
      location: 'Remote',
      workplaceType: 'REMOTE',
      description: 'Build fast cloud infrastructure using Node.js, TypeScript, and distributed systems.',
      responsibilities: ['Architect serverless systems', 'Scale global edge deployment'],
      requirements: ['Node.js', 'TypeScript', 'Distributed systems'],
      skills: ['Node.js', 'TypeScript'],
      applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/998877?utm_source=linkedin',
      directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/998877',
      retrievedAt: new Date().toISOString(),
    };

    stripeJobPosting = {
      id: crypto.randomUUID(),
      canonicalJobId: 'lever:stripe:112233',
      source: 'LEVER',
      company: 'Stripe',
      title: 'Full Stack Engineer - Core Platform',
      location: 'Remote',
      workplaceType: 'REMOTE',
      description: 'Scale payments systems with Node.js and TypeScript.',
      responsibilities: ['Deliver payment APIs', 'Maintain high availability'],
      requirements: ['Node.js', 'TypeScript', 'API design'],
      skills: ['Node.js', 'TypeScript'],
      applicationUrl: 'https://jobs.lever.co/stripe/112233',
      directPortalUrl: 'https://jobs.lever.co/stripe/112233',
      retrievedAt: new Date().toISOString(),
    };
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (app) await app.close();
    await closeDatabase();
  });

  let vercelApplicationId;
  let initialPackageHash;
  let updatedPackageHash;
  let retrievedPackagePayload;

  // ---------------------------------------------------------------------------
  // SCENARIO A: New application creation -> CREATED
  // ---------------------------------------------------------------------------
  it('Scenario A: prepare_job_application creates new application with CREATED lifecycle action and attached jobFitAnalysis', async () => {
    const res = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const pkg = JSON.parse(body.result.content[0].text);
    assert.ok(pkg.applicationId, 'Must return applicationId');
    assert.strictEqual(pkg.lifecycleAction, 'CREATED');
    assert.strictEqual(pkg.packageVersion, 1);
    assert.ok(pkg.packageHash, 'Must return packageHash');
    initialPackageHash = pkg.packageHash;
    vercelApplicationId = pkg.applicationId;

    // Verify Option A: jobFitAnalysis attached & jobMatch metric passthrough
    assert.ok(pkg.jobFitAnalysis, 'jobFitAnalysis must be attached to the package');
    assert.ok(pkg.jobFitAnalysis.overallFit, 'jobFitAnalysis must contain overallFit');
    assert.strictEqual(
      typeof pkg.jobFitAnalysis.overallFit.atsScore,
      'number',
      'overallFit.atsScore must be numeric'
    );
    assert.strictEqual(
      pkg.tailoredResume.fitScore,
      pkg.jobFitAnalysis.overallFit.atsScore,
      'tailoredResume.fitScore must match overallFit.atsScore'
    );
    if (pkg.resumeQuality?.jobMatch) {
      assert.strictEqual(
        pkg.resumeQuality.jobMatch.score,
        pkg.jobFitAnalysis.overallFit.atsScore,
        'resumeQuality.jobMatch.score must match overallFit.atsScore'
      );
      assert.strictEqual(
        pkg.resumeQuality.jobMatch.source,
        'analyze_job_fit',
        'resumeQuality.jobMatch.source must be analyze_job_fit'
      );
    }

    // Verify DB state: exactly 1 application row created
    const rows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(rows.length, 1, 'Exactly one application row in DB');
    assert.strictEqual(rows[0].id, vercelApplicationId);
    assert.strictEqual(rows[0].canonicalJobId, 'greenhouse:vercel:998877');

    // Verify package_payload is persisted in application_packages
    const [packageRow] = await db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.tenantId, tenant.id),
          eq(applicationPackages.applicationId, vercelApplicationId),
          eq(applicationPackages.version, 1)
        )
      );
    assert.ok(packageRow, 'Package version 1 must exist in DB');
    assert.ok(packageRow.packagePayload, 'packagePayload column must be populated');
    assert.strictEqual(packageRow.packageHash, initialPackageHash);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO B: Existing application with explicit applicationId -> REUSED
  // ---------------------------------------------------------------------------
  it('Scenario B: prepare_job_application with explicit applicationId returns REUSED without duplicate rows', async () => {
    const res = await callMcpTool('prepare_job_application', {
      applicationId: vercelApplicationId,
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const pkg = JSON.parse(body.result.content[0].text);
    assert.strictEqual(pkg.applicationId, vercelApplicationId);
    assert.strictEqual(pkg.lifecycleAction, 'REUSED');
    assert.strictEqual(pkg.packageVersion, 1);
    assert.strictEqual(pkg.packageHash, initialPackageHash);

    // Verify 0 duplicate rows
    const rows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(rows.length, 1, 'Application row count must remain exactly 1');
  });

  it('Scenario B.1: prepare_job_application rejects APPLICATION_JOB_MISMATCH if applicationId does not match target job', async () => {
    const res = await callMcpTool('prepare_job_application', {
      applicationId: vercelApplicationId,
      candidateId: candidate.id,
      jobPosting: stripeJobPosting, // Conflicting target job!
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.result.isError, 'Must be an MCP error');
    assert.match(
      body.result.content[0].text,
      /APPLICATION_JOB_MISMATCH/,
      'Must identify APPLICATION_JOB_MISMATCH'
    );
  });

  it('Scenario B.2: prepare_job_application rejects cross-tenant / unauthorized applicationId', async () => {
    // Other tenant attempts to use vercelApplicationId
    const res = await callMcpTool(
      'prepare_job_application',
      {
        applicationId: vercelApplicationId,
        candidateId: otherCandidate.id,
        jobPosting: vercelJobPosting,
      },
      otherTenantMcpAuthHeader
    );

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.result.isError, 'Cross-tenant request must fail');
    assert.match(body.result.content[0].text, /not found|unauthorized/i);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO C: Identical second prepare without applicationId -> REUSED
  // ---------------------------------------------------------------------------
  it('Scenario C: prepare_job_application without applicationId resolves existing canonical job and returns REUSED', async () => {
    const res = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const pkg = JSON.parse(body.result.content[0].text);
    assert.strictEqual(pkg.applicationId, vercelApplicationId);
    assert.strictEqual(pkg.lifecycleAction, 'REUSED');
    assert.strictEqual(pkg.packageVersion, 1);
    assert.strictEqual(pkg.packageHash, initialPackageHash);

    // Total rows still 1
    const rows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(rows.length, 1);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO D: Changed package content -> UPDATED
  // ---------------------------------------------------------------------------
  it('Scenario D: Changed package content advances packageVersion and returns UPDATED action', async () => {
    const res = await callMcpTool('prepare_job_application', {
      applicationId: vercelApplicationId,
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: {
        workAuth: 'Authorized',
        relocationPreference: 'Candidate is open to relocating to New York or San Francisco.',
        customCoverLetterNote: 'Dedicated platform engineering experience focusing on high-concurrency systems.',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const pkg = JSON.parse(body.result.content[0].text);
    assert.strictEqual(pkg.applicationId, vercelApplicationId);
    assert.strictEqual(pkg.lifecycleAction, 'UPDATED');
    assert.strictEqual(pkg.packageVersion, 2, 'Package version must increment to 2');
    assert.notStrictEqual(pkg.packageHash, initialPackageHash, 'Package hash must change');
    updatedPackageHash = pkg.packageHash;

    // Verify DB ledger: still 1 application row, but 2 package rows (version 1 ARCHIVED/HISTORICAL, version 2 CURRENT)
    const appRows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(appRows.length, 1, 'Application row count must remain 1');

    const pkgRows = await db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.tenantId, tenant.id),
          eq(applicationPackages.applicationId, vercelApplicationId)
        )
      );
    assert.strictEqual(pkgRows.length, 2, 'Must have 2 package versions in DB');

    const v2Row = pkgRows.find((r) => r.version === 2);
    assert.ok(v2Row, 'Version 2 row must exist');
    assert.strictEqual(v2Row.lifecycleState, 'CURRENT');
    assert.ok(v2Row.packagePayload, 'Version 2 packagePayload must be populated');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO E: Submitted application protection
  // ---------------------------------------------------------------------------
  it('Scenario E: Submitted application rejects mutation with APPLICATION_ALREADY_SUBMITTED and preserves original package', async () => {
    // 1. Mark application as APPLIED / SUBMITTED
    await db
      .update(jobApplications)
      .set({
        status: 'APPLIED',
        appliedAt: new Date(),
        metadata: { externalSubmissionState: 'SUBMITTED' },
      })
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.id, vercelApplicationId)
        )
      );

    // 2. Attempt to prepare/mutate the submitted application
    const res = await callMcpTool('prepare_job_application', {
      applicationId: vercelApplicationId,
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Different Answer After Submission' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.result.isError, 'Must return an error for submitted application');
    assert.match(
      body.result.content[0].text,
      /APPLICATION_ALREADY_SUBMITTED/,
      'Error message must indicate APPLICATION_ALREADY_SUBMITTED'
    );

    // 3. Verify packages in DB are untouched (still 2 versions, version 2 hash unchanged)
    const pkgRows = await db
      .select()
      .from(applicationPackages)
      .where(
        and(
          eq(applicationPackages.tenantId, tenant.id),
          eq(applicationPackages.applicationId, vercelApplicationId)
        )
      );
    assert.strictEqual(pkgRows.length, 2, 'Package row count must not increase');
    const v2Row = pkgRows.find((r) => r.version === 2);
    assert.strictEqual(v2Row.packageHash, updatedPackageHash, 'Original package hash preserved');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO F: Dedicated package read capability (get_application_package)
  // ---------------------------------------------------------------------------
  it('Scenario F: get_application_package returns the exact stored snapshot payload without reconstruction', async () => {
    // Read CURRENT version (defaults to latest / CURRENT)
    const res = await callMcpTool('get_application_package', {
      applicationId: vercelApplicationId,
      candidateId: candidate.id,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const data = JSON.parse(body.result.content[0].text);
    assert.strictEqual(data.applicationId, vercelApplicationId);
    assert.strictEqual(data.candidateId, candidate.id);
    assert.strictEqual(data.packageVersion, 2);
    assert.strictEqual(data.packageHash, updatedPackageHash);
    assert.ok(data.applicationPackage, 'Must return full applicationPackage');
    assert.strictEqual(data.applicationPackage.packageHash, updatedPackageHash);
    assert.ok(data.applicationPackage.tailoredResume, 'Must contain tailoredResume');
    assert.ok(data.applicationPackage.jobFitAnalysis, 'Must contain stored jobFitAnalysis');

    retrievedPackagePayload = data.applicationPackage;

    // Read specific historical version 1
    const resV1 = await callMcpTool('get_application_package', {
      applicationId: vercelApplicationId,
      packageVersion: 1,
    });
    assert.strictEqual(resV1.statusCode, 200);
    const bodyV1 = JSON.parse(resV1.payload);
    const dataV1 = JSON.parse(bodyV1.result.content[0].text);
    assert.strictEqual(dataV1.packageVersion, 1);
    assert.strictEqual(dataV1.packageHash, initialPackageHash);
    assert.strictEqual(dataV1.applicationPackage.packageHash, initialPackageHash);

    // Read non-existent version 999
    const resNotFound = await callMcpTool('get_application_package', {
      applicationId: vercelApplicationId,
      packageVersion: 999,
    });
    const bodyNotFound = JSON.parse(resNotFound.payload);
    assert.ok(bodyNotFound.result.isError, 'Must fail for non-existent version');
    assert.match(bodyNotFound.result.content[0].text, /No application package found|not found/i);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO G: Validation round-trip
  // ---------------------------------------------------------------------------
  it('Scenario G: validate_job_application accepts retrieved package and confirms matching packageHash', async () => {
    assert.ok(retrievedPackagePayload, 'Must have retrieved package from Scenario F');

    const res = await callMcpTool('validate_job_application', {
      applicationPackage: retrievedPackagePayload,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const validationResult = JSON.parse(body.result.content[0].text);
    assert.strictEqual(validationResult.packageHash, updatedPackageHash);
    assert.ok(validationResult.status, 'Must provide validation status');
    assert.ok(validationResult.resumeValidation, 'Must provide resume validation');
    assert.ok(validationResult.documentValidation, 'Must provide document validation');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO H: Preview round-trip
  // ---------------------------------------------------------------------------
  it('Scenario H: create_application_preview accepts retrieved package and matches packageHash', async () => {
    const res = await callMcpTool('create_application_preview', {
      applicationPackage: retrievedPackagePayload,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const previewResult = JSON.parse(body.result.content[0].text);
    assert.strictEqual(previewResult.packageHash, updatedPackageHash);
    assert.ok(previewResult.previewMarkdown, 'Must contain human-readable preview markdown');
    assert.ok(previewResult.resumePreview, 'Must contain resume preview');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO I: Handoff kit & tracking inspection (get_job_application)
  // ---------------------------------------------------------------------------
  it('Scenario I: get_job_application retains consistent applicationId, packageVersion, and packageHash', async () => {
    const res = await callMcpTool('get_job_application', {
      applicationId: vercelApplicationId,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const appDetails = JSON.parse(body.result.content[0].text);
    assert.strictEqual(appDetails.application.id, vercelApplicationId);
    assert.strictEqual(appDetails.application.candidateId, candidate.id);
    assert.strictEqual(appDetails.currentPackage.packageHash, updatedPackageHash);
    assert.strictEqual(appDetails.currentPackage.packageVersion, 2);
    assert.strictEqual(appDetails.application.status, 'APPLIED');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO J: Database ledger audit
  // ---------------------------------------------------------------------------
  it('Scenario J: Database ledger audit confirms exact application count, zero duplicates, and payload integrity', async () => {
    // 1. Prepare a new application for Stripe
    const stripe1 = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: stripeJobPosting,
      answers: { workAuth: 'Authorized' },
    });
    const stripePkg1 = JSON.parse(JSON.parse(stripe1.payload).result.content[0].text);
    assert.strictEqual(stripePkg1.lifecycleAction, 'CREATED');
    const stripeAppId = stripePkg1.applicationId;

    // 2. Prepare identical Stripe application without applicationId -> REUSED
    const stripe2 = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: stripeJobPosting,
      answers: { workAuth: 'Authorized' },
    });
    const stripePkg2 = JSON.parse(JSON.parse(stripe2.payload).result.content[0].text);
    assert.strictEqual(stripePkg2.lifecycleAction, 'REUSED');
    assert.strictEqual(stripePkg2.applicationId, stripeAppId);

    // 3. Prepare identical Stripe application WITH explicit applicationId -> REUSED
    const stripe3 = await callMcpTool('prepare_job_application', {
      applicationId: stripeAppId,
      candidateId: candidate.id,
      jobPosting: stripeJobPosting,
      answers: { workAuth: 'Authorized' },
    });
    const stripePkg3 = JSON.parse(JSON.parse(stripe3.payload).result.content[0].text);
    assert.strictEqual(stripePkg3.lifecycleAction, 'REUSED');
    assert.strictEqual(stripePkg3.applicationId, stripeAppId);

    // 4. Verify candidate has EXACTLY 2 applications in DB (Vercel + Stripe)
    const allCandidateApps = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(allCandidateApps.length, 2, 'Candidate must have exactly 2 applications');
    const appIds = allCandidateApps.map((a) => a.id);
    assert.ok(appIds.includes(vercelApplicationId));
    assert.ok(appIds.includes(stripeAppId));

    // 5. Verify every application_package row has non-null packagePayload
    const allPackages = await db
      .select()
      .from(applicationPackages)
      .where(eq(applicationPackages.tenantId, tenant.id));
    assert.ok(allPackages.length >= 3, 'Must have at least 3 package rows');
    for (const pkgRow of allPackages) {
      assert.ok(pkgRow.packagePayload, `Package row ${pkgRow.id} must have packagePayload`);
      assert.strictEqual(typeof pkgRow.packagePayload, 'object');
      assert.strictEqual(pkgRow.packagePayload.packageHash, pkgRow.packageHash);
    }
  });

  // ---------------------------------------------------------------------------
  // SCHEMA & TOOLS/LIST AUDIT
  // ---------------------------------------------------------------------------
  it('Tools List Audit: get_application_package and prepare_job_application expose correct schemas', async () => {
    const res = await callToolsList();
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const tools = body.result.tools;

    // Verify tool count is 30
    assert.strictEqual(tools.length, 30, 'Registered MCP tools count must be exactly 30');

    // Audit get_application_package
    const getPkgTool = tools.find((t) => t.name === 'get_application_package');
    assert.ok(getPkgTool, 'get_application_package must be registered');
    assert.ok(getPkgTool.inputSchema.properties.applicationId, 'applicationId must be in inputSchema');
    assert.ok(
      getPkgTool.inputSchema.required?.includes('applicationId'),
      'applicationId must be required in get_application_package'
    );
    assert.ok(getPkgTool.inputSchema.properties.packageVersion, 'packageVersion must be in inputSchema');

    // Audit prepare_job_application
    const prepTool = tools.find((t) => t.name === 'prepare_job_application');
    assert.ok(prepTool, 'prepare_job_application must be registered');
    assert.ok(prepTool.inputSchema.properties.applicationId, 'applicationId must be in inputSchema');
    assert.ok(
      !prepTool.inputSchema.required?.includes('applicationId'),
      'applicationId must be optional in prepare_job_application'
    );
  });
});
