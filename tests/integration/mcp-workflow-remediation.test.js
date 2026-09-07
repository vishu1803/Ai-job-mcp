/**
 * @file Integration Tests for MCP Application Lifecycle Remediation (P14-028).
 *
 * Verifies Scenarios A through J:
 * - Scenario A: Fresh preparation creates exactly one application (lifecycleAction: CREATED)
 * - Scenario B: Existing SAVED application reused (lifecycleAction: REUSED)
 * - Scenario C: Repeated prepare calls are idempotent (0 duplicate rows)
 * - Scenario D: Existing CURRENT package advances version on content change (lifecycleAction: UPDATED)
 * - Scenario E: Submitted application protects submitted packages
 * - Scenario F: validate_job_application returns complete subcategories
 * - Scenario G: create_application_preview returns structured fields and markdown preview
 * - Scenario H: get_job_application handoff inspection returns exact prepared application
 * - Scenario I: Job selection policy multi-job ranking & NO_SUITABLE_JOB gating
 * - Scenario J: Database partial uniqueness indexes prevent duplicate active applications
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
} from '../../src/db/schema.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { rankSuitableJobs } from '../../src/services/job-selection-policy.js';

const PROTOCOL_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('MCP Job Application Workflow Remediation (P14-028)', () => {
  let app;
  let mcpAuthHeader;
  const createdTenantIds = [];

  let tenant;
  let user;
  let candidate;

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

  before(async () => {
    discoveryService = new JobDiscoveryService();
    workflowService = new JobApplicationWorkflowService({ database: db });
    trackingService = new ApplicationTrackingService({ database: db });
    tokenService = new McpApiTokenService({ database: db });

    // Provision Tenant & User
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);
    [tenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'Remediation Test Corp',
        slug: `remediation-${Date.now()}`,
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
        displayName: 'Avery Morgan',
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
        displayName: 'Avery Morgan',
        canonicalEmail: user.email,
        headline: 'Staff Full-Stack Engineer',
        profileMetadata: {
          userCustom: {
            education: [
              {
                institution: 'University of Engineering',
                degree: 'B.S. Computer Science',
                year: '2020',
              },
            ],
            experience: [
              {
                company: 'Tech Solutions Inc',
                title: 'Senior Software Engineer',
                period: '2021 - Present',
              },
            ],
          },
        },
      })
      .returning();

    // Skills
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
        provenanceStatus: 'CLAIMED',
      },
    ]);

    // Build App
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
      name: 'Remediation Test Token',
      scopes: ['career:read', 'career:write'],
    });
    mcpAuthHeader = `Bearer ${mcpTokenResult.rawToken}`;

    // Standard normalized job postings for testing
    vercelJobPosting = {
      id: crypto.randomUUID(),
      canonicalJobId: 'greenhouse:vercel:554433',
      source: 'GREENHOUSE',
      company: 'Vercel',
      title: 'Senior Software Engineer - Infrastructure',
      location: 'Remote',
      workplaceType: 'REMOTE',
      description: 'Build fast cloud infrastructure using Node.js, TypeScript, and Go.',
      responsibilities: ['Architect serverless systems', 'Scale global edge deployment'],
      requirements: ['5+ years with Node.js', 'Experience with distributed systems'],
      skills: ['Node.js', 'TypeScript', 'Cloud'],
      applicationUrl: 'https://boards.greenhouse.io/vercel/jobs/554433?utm_source=linkedin',
      directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/554433',
      retrievedAt: new Date().toISOString(),
    };

    stripeJobPosting = {
      id: crypto.randomUUID(),
      canonicalJobId: 'lever:stripe:667788',
      source: 'LEVER',
      company: 'Stripe',
      title: 'Full Stack Engineer - Billing',
      location: 'Remote',
      workplaceType: 'REMOTE',
      description: 'Scale subscription billing and payments systems.',
      responsibilities: ['Deliver payment billing APIs', 'Ensure 99.999% uptime'],
      requirements: ['Proficiency with Node.js', 'API design experience'],
      skills: ['Node.js', 'TypeScript', 'Payments'],
      applicationUrl: 'https://jobs.lever.co/stripe/667788?lever-source=Indeed',
      directPortalUrl: 'https://jobs.lever.co/stripe/667788',
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
  let preparedVercelPackage;

  // ---------------------------------------------------------------------------
  // SCENARIO A: Fresh preparation creates exactly one application
  // ---------------------------------------------------------------------------
  it('Scenario A: prepare_job_application on fresh job creates exactly one application with CREATED action', async () => {
    // Initial active count
    const initialRows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(initialRows.length, 0, 'Initial active application count must be 0');

    const res = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    preparedVercelPackage = JSON.parse(body.result.content[0].text);
    assert.ok(preparedVercelPackage.applicationId, 'Must return applicationId');
    assert.strictEqual(preparedVercelPackage.lifecycleAction, 'CREATED', 'Must report CREATED action');
    assert.ok(preparedVercelPackage.packageHash, 'Must include packageHash');
    assert.strictEqual(preparedVercelPackage.packageVersion, 1, 'Initial package version must be 1');

    vercelApplicationId = preparedVercelPackage.applicationId;

    // Verify DB state
    const afterRows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(afterRows.length, 1, 'Exactly one application row must exist in DB');
    assert.strictEqual(afterRows[0].id, vercelApplicationId);
    assert.strictEqual(afterRows[0].canonicalJobId, 'greenhouse:vercel:554433');
    assert.strictEqual(
      afterRows[0].normalizedJobUrl,
      'https://boards.greenhouse.io/vercel/jobs/554433'
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO B: Existing SAVED application reuse
  // ---------------------------------------------------------------------------
  let stripeApplicationId;
  it('Scenario B: Existing SAVED application is reused without creating a duplicate', async () => {
    // Pre-track Stripe application in SAVED state via MCP
    const trackRes = await callMcpTool('track_job_application', {
      candidateId: candidate.id,
      companyName: stripeJobPosting.company,
      jobTitle: stripeJobPosting.title,
      jobUrl: stripeJobPosting.applicationUrl,
      canonicalJobId: stripeJobPosting.canonicalJobId,
      status: 'SAVED',
    });

    assert.strictEqual(trackRes.statusCode, 200);
    const trackBody = JSON.parse(trackRes.payload);
    const trackedApp = JSON.parse(trackBody.result.content[0].text);
    stripeApplicationId = trackedApp.application?.id || trackedApp.id;
    assert.ok(stripeApplicationId);

    // Call prepare_job_application for Stripe
    const prepRes = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: stripeJobPosting,
    });

    assert.strictEqual(prepRes.statusCode, 200);
    const prepBody = JSON.parse(prepRes.payload);
    const prepResult = JSON.parse(prepBody.result.content[0].text);

    assert.strictEqual(prepResult.applicationId, stripeApplicationId, 'Must reuse tracked application ID');
    assert.strictEqual(prepResult.lifecycleAction, 'REUSED', 'Must report REUSED action');

    // Verify DB count: only 2 applications (Vercel and Stripe)
    const appRows = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(appRows.length, 2, 'Must have exactly 2 active applications');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO C: Repeated prepare call idempotency
  // ---------------------------------------------------------------------------
  it('Scenario C: Repeated prepare_job_application calls produce 0 duplicate application rows', async () => {
    const call1 = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });
    const call2 = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      jobPosting: vercelJobPosting,
      answers: { workAuth: 'Authorized' },
    });

    const body1 = JSON.parse(JSON.parse(call1.payload).result.content[0].text);
    const body2 = JSON.parse(JSON.parse(call2.payload).result.content[0].text);

    assert.strictEqual(body1.applicationId, vercelApplicationId);
    assert.strictEqual(body2.applicationId, vercelApplicationId);
    assert.strictEqual(body1.packageHash, preparedVercelPackage.packageHash);
    assert.strictEqual(body2.packageHash, preparedVercelPackage.packageHash);
    assert.strictEqual(body1.lifecycleAction, 'REUSED');
    assert.strictEqual(body2.lifecycleAction, 'REUSED');

    // Confirm DB row count is still exactly 2
    const totalApps = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(totalApps.length, 2, 'DB application count must remain exactly 2');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO D: Existing CURRENT package advances version on content change
  // ---------------------------------------------------------------------------
  it('Scenario D: Existing CURRENT package advances version to 2 with UPDATED action on content change', async () => {
    const res = await callMcpTool('prepare_job_application', {
      candidateId: candidate.id,
      applicationId: vercelApplicationId,
      jobPosting: vercelJobPosting,
      answers: {
        workAuth: 'Authorized',
        portfolioHighlights: 'Custom new answers modifying the package hash',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const result = JSON.parse(body.result.content[0].text);

    assert.strictEqual(result.applicationId, vercelApplicationId, 'Application ID must remain the same');
    assert.strictEqual(result.packageVersion, 2, 'Version must increment to 2');
    assert.strictEqual(result.lifecycleAction, 'UPDATED', 'Action must be UPDATED');
    assert.notStrictEqual(result.packageHash, preparedVercelPackage.packageHash, 'Hash must differ');

    // Still exactly 2 application rows in DB
    const totalApps = await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.tenantId, tenant.id),
          eq(jobApplications.candidateId, candidate.id)
        )
      );
    assert.strictEqual(totalApps.length, 2, 'DB application count must remain 2');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO E: Submitted application protects package from mutation
  // ---------------------------------------------------------------------------
  it('Scenario E: Submitted application protects submitted packages and rejects unauthorized overwrites', async () => {
    // Transition Vercel application to APPLIED
    await db
      .update(jobApplications)
      .set({ status: 'APPLIED', appliedAt: new Date() })
      .where(eq(jobApplications.id, vercelApplicationId));

    // Attempting to record a new, different package on a submitted application throws ConflictError
    await assert.rejects(
      async () => {
        await trackingService.recordApplicationPackage(
          { tenantId: tenant.id, userId: user.id, role: 'MEMBER' },
          vercelApplicationId,
          {
            candidateId: candidate.id,
            packageHash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            tailoredResume: { contentHash: '112233' },
          }
        );
      },
      (err) => {
        assert.ok(err.message.includes('already been submitted'));
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // SCENARIO F: validate_job_application returns complete subcategories
  // ---------------------------------------------------------------------------
  it('Scenario F: validate_job_application returns overallStatus, resumeValidation, documentValidation, and jobConsistency', async () => {
    const res = await callMcpTool('validate_job_application', {
      applicationPackage: preparedVercelPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const validation = JSON.parse(body.result.content[0].text);
    assert.ok(validation.status);
    assert.strictEqual(validation.overallStatus, validation.status);
    assert.ok(Array.isArray(validation.errors));
    assert.ok(Array.isArray(validation.warnings));
    assert.ok(Array.isArray(validation.missingFields));

    // Subcategory: resumeValidation
    assert.ok(validation.resumeValidation);
    assert.strictEqual(validation.resumeValidation.hasMarkdown, true);
    assert.strictEqual(typeof validation.resumeValidation.qaPassed, 'boolean');

    // Subcategory: documentValidation
    assert.ok(validation.documentValidation);
    assert.ok(validation.documentValidation.documentsStatus);
    assert.strictEqual(typeof validation.documentValidation.artifactsReady, 'boolean');

    // Subcategory: jobConsistency
    assert.ok(validation.jobConsistency);
    assert.strictEqual(validation.jobConsistency.isConsistent, true);
    assert.strictEqual(validation.jobConsistency.targetCompany, 'Vercel');
    assert.strictEqual(validation.jobConsistency.targetTitle, 'Senior Software Engineer - Infrastructure');

    // Subcategory: provenanceIssues
    assert.ok(validation.provenanceIssues);
    assert.strictEqual(typeof validation.provenanceIssues.unsubstantiatedSkillsCount, 'number');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO G: create_application_preview returns structured fields and markdown preview
  // ---------------------------------------------------------------------------
  it('Scenario G: create_application_preview returns structured preview fields and previewMarkdown', async () => {
    const res = await callMcpTool('create_application_preview', {
      applicationPackage: preparedVercelPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const preview = JSON.parse(body.result.content[0].text);
    assert.strictEqual(preview.applicationId, vercelApplicationId);
    assert.strictEqual(preview.candidateInfo.name, 'Avery Morgan');
    assert.strictEqual(preview.job.company, 'Vercel');
    assert.strictEqual(preview.packageHash, preparedVercelPackage.packageHash);
    assert.ok(preview.previewMarkdown.includes('# Application Package Preview'));
    assert.ok(preview.previewMarkdown.includes('Vercel'));
  });

  // ---------------------------------------------------------------------------
  // SCENARIO H: get_job_application returns prepared application with diagnostic telemetry
  // ---------------------------------------------------------------------------
  it('Scenario H: get_job_application handoff inspection returns exact prepared application details', async () => {
    const res = await callMcpTool('get_job_application', {
      applicationId: vercelApplicationId,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const appDetails = JSON.parse(body.result.content[0].text);
    const app = appDetails.application || appDetails;
    assert.strictEqual(app.id, vercelApplicationId);
    assert.strictEqual(app.companyName, 'Vercel');
    assert.strictEqual(app.canonicalJobId, 'greenhouse:vercel:554433');
    assert.ok(appDetails.currentPackage);
    assert.strictEqual(appDetails.currentPackage.applicationId, vercelApplicationId);
  });

  // ---------------------------------------------------------------------------
  // SCENARIO I: Job Selection Policy evaluation & NO_SUITABLE_JOB gating
  // ---------------------------------------------------------------------------
  it('Scenario I: Job selection policy evaluates 6 dimensions and gates on NO_SUITABLE_JOB', () => {
    const candidatePrefs = {
      desiredRole: 'Software Engineer',
      remoteOnly: true,
      minSalary: 150000,
    };

    // Substandard score test
    const lowFitJobs = [
      {
        id: 'low-1',
        title: 'VP of Data Science',
        company: 'AI Lab',
        location: 'Remote',
        fitScore: 24.9,
      },
    ];
    const lowResult = rankSuitableJobs(lowFitJobs, candidatePrefs);
    assert.strictEqual(lowResult.hasSuitableJob, false);
    assert.strictEqual(lowResult.policyCode, 'NO_SUITABLE_JOB');

    // Location mismatch test
    const onSiteJobs = [
      {
        id: 'onsite-1',
        title: 'Senior Software Engineer',
        company: 'Hardware Corp',
        location: 'Frankfurt, Germany (On-site 5 days)',
        fitScore: 90,
      },
    ];
    const onSiteResult = rankSuitableJobs(onSiteJobs, candidatePrefs);
    assert.strictEqual(onSiteResult.hasSuitableJob, false);
    assert.strictEqual(onSiteResult.policyCode, 'NO_SUITABLE_JOB');

    // Suitable ranking test
    const multiJobs = [
      {
        id: 'job-mid',
        title: 'Software Engineer',
        company: 'Cloud Corp',
        location: 'Remote',
        fitScore: 70,
      },
      {
        id: 'job-high',
        title: 'Senior Software Engineer',
        company: 'Infra Corp',
        location: 'Remote',
        fitScore: 92,
      },
    ];
    const suitableResult = rankSuitableJobs(multiJobs, candidatePrefs);
    assert.strictEqual(suitableResult.hasSuitableJob, true);
    assert.strictEqual(suitableResult.topJob.id, 'job-high');
  });

  // ---------------------------------------------------------------------------
  // SCENARIO J: Database partial uniqueness constraint verification
  // ---------------------------------------------------------------------------
  it('Scenario J: Database partial unique indexes strictly reject duplicate active applications', async () => {
    // 1. Attempt duplicate active insert with same (tenant_id, candidate_id, canonical_job_id)
    await assert.rejects(
      async () => {
        await db.insert(jobApplications).values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          companyName: 'Vercel Clone',
          jobTitle: 'Different Title',
          canonicalJobId: 'greenhouse:vercel:554433', // Duplicate of active Vercel app
          status: 'SAVED',
        });
      },
      (err) => {
        const hasCode = err.code === '23505' || err.cause?.code === '23505';
        const hasMsg =
          err.message?.includes('uq_job_applications_active_canonical_job') ||
          err.message?.includes('duplicate key');
        assert.ok(hasCode || hasMsg, 'Must fail with unique constraint violation');
        return true;
      }
    );

    // 2. Attempt duplicate active insert with same (tenant_id, candidate_id, normalized_job_url)
    await assert.rejects(
      async () => {
        await db.insert(jobApplications).values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          companyName: 'Stripe Clone',
          jobTitle: 'Different Title',
          normalizedJobUrl: 'https://jobs.lever.co/stripe/667788', // Duplicate of active Stripe app
          status: 'SAVED',
        });
      },
      (err) => {
        const hasCode = err.code === '23505' || err.cause?.code === '23505';
        const hasMsg =
          err.message?.includes('uq_job_applications_active_normalized_url') ||
          err.message?.includes('duplicate key');
        assert.ok(hasCode || hasMsg, 'Must fail with unique constraint violation');
        return true;
      }
    );

    // 3. Partial index verification: inactive/archived applications DO NOT conflict
    const [archivedApp] = await db
      .insert(jobApplications)
      .values({
        id: crypto.randomUUID(),
        tenantId: tenant.id,
        candidateId: candidate.id,
        companyName: 'Old Vercel',
        jobTitle: 'Archived Application',
        canonicalJobId: 'greenhouse:vercel:554433',
        status: 'ARCHIVED', // Inactive status excluded from partial index
      })
      .returning();

    assert.ok(archivedApp.id, 'Archived application with same canonicalJobId must succeed');
  });
});
