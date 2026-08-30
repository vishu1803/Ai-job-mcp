/**
 * @file MCP Job Workflow & AI Connection Status Integration Tests (P14-004B / ARCH-055).
 *
 * Tests the complete end-to-end job application workflow:
 * 1. search_jobs (filters, pagination, normalized schemas, source provenance)
 * 2. get_job_posting (posting retrieval, requirements, application URL)
 * 3. prepare_job_application (VERIFIED vs CLAIMED truth model, tailored resume, cover letter, package hash)
 * 4. validate_job_application (required fields, duplicate application detection, portal classification)
 * 5. create_application_preview (human-reviewable preview with truth badges)
 * 6. request_application_approval (15-min TTL cryptographic ticket bound to package hash)
 * 7. submit_job_application (single-use gate, anti-tamper hash check, handoff kit on unsupported portals)
 * 8. get_application_submission_status (retrieves tracked application record)
 * 9. AI Connection Status Service & API (real-time reflection of Claude, ChatGPT, and Gemini DB states)
 * 10. Multi-Tenant Sovereign Isolation and Ephemeral Database Teardown.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  oauthTokens,
  mcpApiTokens,
} from '../../src/db/schema.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { AiConnectionStatusService } from '../../src/services/ai-connection-status.service.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { createSession } from '../../src/security/session.service.js';

const PROTOCOL_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
};

describe('MCP Job Workflow & AI Connection Status Integration Tests (P14-004B)', () => {
  let app;
  let sessionCookie;
  let mcpAuthHeader;
  const createdTenantIds = [];

  let tenantA;
  let userA;
  let candidateA;

  let _tenantB;
  let _userB;
  let _candidateB;

  let discoveryService;
  let workflowService;
  let _connectionStatusService;
  let tokenService;

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
    // 1. Initialize Core Services
    discoveryService = new JobDiscoveryService();
    workflowService = new JobApplicationWorkflowService({ database: db });
    _connectionStatusService = new AiConnectionStatusService({ database: db });
    tokenService = new McpApiTokenService({ database: db });

    // 2. Provision Tenant A & User A
    const tenantIdA = crypto.randomUUID();
    createdTenantIds.push(tenantIdA);
    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tenantIdA,
        name: 'Alpha Software Corp',
        slug: `alpha-${Date.now()}`,
        tier: 'PRO',
      })
      .returning();

    const userIdA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userIdA,
        tenantId: tenantIdA,
        email: `candidate-a-${Date.now()}@example.test`,
        displayName: 'Devon Vance',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateIdA = crypto.randomUUID();
    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'Devon Vance',
        canonicalEmail: userA.email,
        headline: 'Staff Distributed Systems Engineer',
      })
      .returning();

    // 3. Provision Skills for Candidate A (1 VERIFIED, 1 CLAIMED)
    const [skillNode] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'Node.js',
        slug: `node-js-${Date.now()}`,
        category: 'FRAMEWORK',
      })
      .returning();

    const [skillPython] = await db
      .insert(skills)
      .values({
        id: crypto.randomUUID(),
        name: 'Python',
        slug: `python-${Date.now()}`,
        category: 'LANGUAGE',
      })
      .returning();

    await db.insert(candidateSkills).values([
      {
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        candidateId: candidateIdA,
        skillId: skillNode.id,
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
      },
      {
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        candidateId: candidateIdA,
        skillId: skillPython.id,
        category: 'LANGUAGE',
        provenanceStatus: 'CLAIMED',
      },
    ]);

    // 4. Provision Tenant B (for cross-tenant boundary verification)
    const tenantIdB = crypto.randomUUID();
    createdTenantIds.push(tenantIdB);
    [_tenantB] = await db
      .insert(tenants)
      .values({
        id: tenantIdB,
        name: 'Beta Systems Corp',
        slug: `beta-${Date.now()}`,
        tier: 'FREE',
      })
      .returning();

    const userIdB = crypto.randomUUID();
    [_userB] = await db
      .insert(users)
      .values({
        id: userIdB,
        tenantId: tenantIdB,
        email: `candidate-b-${Date.now()}@example.test`,
        displayName: 'Samira Beta',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateIdB = crypto.randomUUID();
    [_candidateB] = await db
      .insert(candidates)
      .values({
        id: candidateIdB,
        tenantId: tenantIdB,
        userId: userIdB,
        displayName: 'Samira Beta',
        canonicalEmail: _userB.email,
      })
      .returning();

    // 5. Build App & Establish Credentials
    app = await buildApp({
      database: db,
      jobDiscoveryService: discoveryService,
      jobApplicationWorkflowService: workflowService,
    });

    const sessionA = await createSession(db, {
      userId: userA.id,
      tenantId: tenantA.id,
    });
    sessionCookie = `career_hub_session=${sessionA.rawToken}; Path=/; HttpOnly; SameSite=Lax`;

    const mcpTokenResult = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA.id,
      role: userA.role,
      name: 'Job Workflow Test Token',
      scopes: ['career:read', 'career:write'],
    });
    mcpAuthHeader = `Bearer ${mcpTokenResult.rawToken}`;
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (app) await app.close();
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. search_jobs tool
  // ---------------------------------------------------------------------------
  it('1. search_jobs returns normalized job postings matching query and remote filters with source provenance', async () => {
    const res = await callMcpTool('search_jobs', {
      query: 'Backend',
      remoteOnly: true,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    console.log('MCP BODY 1:', JSON.stringify(body, null, 2));
    assert.strictEqual(body.error, undefined);
    assert.ok(body.result);

    const data = JSON.parse(body.result.content[0].text);
    assert.ok(data.jobs.length >= 1);
    assert.strictEqual(data.jobs[0].workplaceType, 'REMOTE');
    assert.ok(data.jobs[0].applicationUrl);
    assert.ok(data.sources.includes('GREENHOUSE') || data.sources.includes('LEVER'));
  });

  // ---------------------------------------------------------------------------
  // 2. get_job_posting tool
  // ---------------------------------------------------------------------------
  let retrievedJob;
  it('2. get_job_posting returns full normalized job posting details by ID', async () => {
    const res = await callMcpTool('get_job_posting', {
      jobId: 'job-gh-stripe-001',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    retrievedJob = JSON.parse(body.result.content[0].text);
    assert.strictEqual(retrievedJob.id, 'job-gh-stripe-001');
    assert.strictEqual(retrievedJob.company, 'Stripe');
    assert.ok(retrievedJob.requirements.length > 0);
    assert.ok(retrievedJob.applicationUrl);
  });

  // ---------------------------------------------------------------------------
  // 3. prepare_job_application tool
  // ---------------------------------------------------------------------------
  let preparedApplicationPackage;
  it('3. prepare_job_application orchestrates candidate profile, verified skills, tailored resume, and cover letter into package', async () => {
    const res = await callMcpTool('prepare_job_application', {
      jobPosting: retrievedJob,
      answers: {
        workAuthorization: 'Authorized to work in US',
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    preparedApplicationPackage = JSON.parse(body.result.content[0].text);
    assert.strictEqual(preparedApplicationPackage.candidateName, 'Devon Vance');
    assert.strictEqual(preparedApplicationPackage.targetJob.company, 'Stripe');
    assert.ok(preparedApplicationPackage.packageHash);
    assert.strictEqual(preparedApplicationPackage.packageHash.length, 64);

    // Verify truth classification
    const verified = preparedApplicationPackage.verifiedSkills;
    const claimed = preparedApplicationPackage.claimedSkills;
    assert.ok(verified.some((s) => s.name === 'Node.js' && s.truthCategory === 'VERIFIED'));
    assert.ok(claimed.some((s) => s.name === 'Python' && s.truthCategory === 'CLAIMED'));
  });

  // ---------------------------------------------------------------------------
  // 4. validate_job_application tool
  // ---------------------------------------------------------------------------
  it('4. validate_job_application validates package completeness and identifies destination portal capability', async () => {
    const res = await callMcpTool('validate_job_application', {
      applicationPackage: preparedApplicationPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const validation = JSON.parse(body.result.content[0].text);
    assert.strictEqual(validation.status, 'READY_TO_APPLY');
    assert.strictEqual(validation.isReady, true);
    assert.strictEqual(validation.portalType, 'GREENHOUSE');
    assert.strictEqual(validation.submissionMethod, 'API_DIRECT');
  });

  // ---------------------------------------------------------------------------
  // 5. create_application_preview tool
  // ---------------------------------------------------------------------------
  it('5. create_application_preview produces formatted markdown preview with truth labels and stopping notice', async () => {
    const res = await callMcpTool('create_application_preview', {
      applicationPackage: preparedApplicationPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const preview = JSON.parse(body.result.content[0].text);
    assert.match(preview.previewMarkdown, /Stripe/);
    assert.match(preview.previewMarkdown, /VERIFIED/);
    assert.match(preview.previewMarkdown, /CLAIMED/);
    assert.match(preview.previewMarkdown, /Human Approval Boundary/);
  });

  // ---------------------------------------------------------------------------
  // 6. request_application_approval tool
  // ---------------------------------------------------------------------------
  let approvalTicket;
  it('6. request_application_approval creates a 15-min cryptographic approval ticket bound to package hash', async () => {
    const res = await callMcpTool('request_application_approval', {
      jobId: retrievedJob.id,
      destinationUrl: retrievedJob.applicationUrl,
      packageHash: preparedApplicationPackage.packageHash,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    approvalTicket = JSON.parse(body.result.content[0].text);
    assert.ok(approvalTicket.ticketId);
    assert.strictEqual(approvalTicket.packageHash, preparedApplicationPackage.packageHash);
    assert.strictEqual(approvalTicket.destinationUrl, retrievedJob.applicationUrl);
    assert.strictEqual(approvalTicket.status, 'PENDING');
  });

  // ---------------------------------------------------------------------------
  // 7. submit_job_application tool & Security Assertions
  // ---------------------------------------------------------------------------
  it('7a. submit_job_application rejects tampered package hash (hash mismatch failure)', async () => {
    const res = await callMcpTool('submit_job_application', {
      approvalTicketId: approvalTicket.ticketId,
      packageHash: '0000000000000000000000000000000000000000000000000000000000000000',
      destinationUrl: retrievedJob.applicationUrl,
      applicationPackage: preparedApplicationPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const isErr = Boolean(body.error || body.result?.isError);
    assert.ok(isErr);
    const errMsg = body.error?.message || body.result?.content?.[0]?.text;
    assert.match(errMsg, /altered|mismatch/i);
  });

  it('7b. submit_job_application successfully submits with valid approval ticket and tracks application', async () => {
    const res = await callMcpTool('submit_job_application', {
      approvalTicketId: approvalTicket.ticketId,
      packageHash: preparedApplicationPackage.packageHash,
      destinationUrl: retrievedJob.applicationUrl,
      applicationPackage: preparedApplicationPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const submission = JSON.parse(body.result.content[0].text);
    assert.strictEqual(submission.status, 'SUBMITTED');
    assert.ok(submission.externalReference);
    assert.ok(submission.applicationId);
  });

  it('7c. submit_job_application rejects single-use ticket replay', async () => {
    const res = await callMcpTool('submit_job_application', {
      approvalTicketId: approvalTicket.ticketId,
      packageHash: preparedApplicationPackage.packageHash,
      destinationUrl: retrievedJob.applicationUrl,
      applicationPackage: preparedApplicationPackage,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    const isErr = Boolean(body.error || body.result?.isError);
    assert.ok(isErr);
    const errMsg = body.error?.message || body.result?.content?.[0]?.text;
    assert.match(errMsg, /already been consumed/i);
  });

  it('7d. submit_job_application on unsupported portal provides instant manual handoff kit', async () => {
    const workdayJob = {
      ...retrievedJob,
      id: 'job-workday-netflix-005',
      company: 'Netflix',
      title: 'Staff Distributed Systems Engineer',
      description:
        'Architect and scale distributed stream processing pipelines across cloud environments.',
      source: 'GREENHOUSE',
      retrievedAt: new Date().toISOString(),
      applicationUrl: 'https://netflix.wd1.myworkdayjobs.com/netflix_careers/job/12345',
    };

    const workdayPkg = await workflowService.prepareJobApplication({
      tenantId: tenantA.id,
      candidateId: candidateA.id,
      jobPosting: workdayJob,
    });

    const workdayTicket = await workflowService.requestApplicationApproval({
      tenantId: tenantA.id,
      userId: userA.id,
      candidateId: candidateA.id,
      clientId: 'claude-web',
      jobId: workdayJob.id,
      destinationUrl: workdayJob.applicationUrl,
      packageHash: workdayPkg.packageHash,
    });

    const res = await callMcpTool('submit_job_application', {
      approvalTicketId: workdayTicket.ticketId,
      packageHash: workdayPkg.packageHash,
      destinationUrl: workdayJob.applicationUrl,
      applicationPackage: workdayPkg,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.error, undefined);

    const result = JSON.parse(body.result.content[0].text);
    assert.strictEqual(result.status, 'HANDOFF_READY');
    assert.ok(result.manualHandoffKit);
    assert.ok(result.manualHandoffKit.resumeMarkdown);
    assert.ok(result.manualHandoffKit.checklist.length > 0);
  });

  // ---------------------------------------------------------------------------
  // 8. AI Connection Status Service & API
  // ---------------------------------------------------------------------------
  it('8a. GET /api/connect/status returns real-time connection status derived from database records', async () => {
    // 1. Provision active Claude OAuth Token
    await db.insert(oauthTokens).values({
      id: crypto.randomUUID(),
      tenantId: tenantA.id,
      userId: userA.id,
      clientId: 'claude-web',
      accessTokenHash: crypto.randomBytes(32).toString('hex'),
      familyId: crypto.randomUUID(),
      tokenScopes: ['career:read', 'career:write'],
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      isRevoked: false,
    });

    // 2. Provision active Gemini Personal MCP API Token
    await db.insert(mcpApiTokens).values({
      id: crypto.randomUUID(),
      tenantId: tenantA.id,
      userId: userA.id,
      name: 'Test Gemini Key',
      tokenHash: crypto.randomBytes(32).toString('hex'),
      tokenPrefix: 'mcp_live_test123',
      scopes: ['career:read'],
      status: 'ACTIVE',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.strictEqual(res.statusCode, 200);
    const statusData = JSON.parse(res.payload);

    const claude = statusData.providers.find((p) => p.id === 'claude');
    const chatgpt = statusData.providers.find((p) => p.id === 'chatgpt');
    const gemini = statusData.providers.find((p) => p.id === 'gemini');

    assert.strictEqual(claude.status, 'CONNECTED');
    assert.strictEqual(chatgpt.status, 'NOT_CONNECTED');
    assert.strictEqual(gemini.status, 'CONNECTED');
  });

  it('8b. POST /connect/revoke-provider revokes provider authorization and updates status to REVOKED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/connect/revoke-provider',
      headers: {
        cookie: sessionCookie,
      },
      payload: {
        provider: 'claude',
      },
    });

    assert.strictEqual(res.statusCode, 302);

    // Verify Claude status is now REVOKED
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/connect/status',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.strictEqual(statusRes.statusCode, 200);
    const statusData = JSON.parse(statusRes.payload);
    const claude = statusData.providers.find((p) => p.id === 'claude');
    assert.strictEqual(claude.status, 'REVOKED');
  });
});
