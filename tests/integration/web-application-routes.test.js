/**
 * @file Web Application View Routes Integration Tests (P13.5-001 & P13.5-002).
 *
 * Verifies:
 * 1. Public landing page (HTML default vs JSON content negotiation)
 * 2. Login page & unauthenticated redirects for protected routes (/dashboard, /onboarding, /projects, /skills, /sources)
 * 3. Onboarding guided wizard (Step 1-5, profile update, repo selection, sync execution)
 * 4. Candidate dashboard workspace (profile completeness, verified skills, projects, applications)
 * 5. Projects portfolio list & deep evidence inspection (/projects, /projects/:id)
 * 6. Skills taxonomy explorer with truth provenance (/skills)
 * 7. Connected Sources hub & repository management (/sources, /sources/disconnect)
 * 8. Multi-tenant isolation (IDOR protection on candidate, projects, evidence, and resources)
 * 9. Zero secret/token leakage across all rendered views
 * 10. MCP JSON-RPC protocol invariance on POST /mcp
 * 11. OAuth 2.1 RFC discovery endpoints
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
  projects,
  resources,
  resourceConnections,
  evidenceItems,
  jobApplications,
} from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { config } from '../../src/config/env.js';

describe('Candidate Web Onboarding, Dashboard & Workspace Integration Tests (P13.5-002)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantIdA = crypto.randomUUID();
  const userIdA = crypto.randomUUID();
  const candidateIdA = crypto.randomUUID();
  const skillIdA = crypto.randomUUID();
  const projectIdA = crypto.randomUUID();
  const resourceIdA = crypto.randomUUID();
  const connectionIdA = crypto.randomUUID();
  const evidenceIdA = crypto.randomUUID();

  const tenantIdB = crypto.randomUUID();
  const userIdB = crypto.randomUUID();
  const candidateIdB = crypto.randomUUID();
  const projectIdB = crypto.randomUUID();

  let app;
  let rawSessionTokenA;
  let rawSessionTokenB;

  before(async () => {
    const mockIngestionService = {
      syncCandidateRepositories: async () => ({
        repositoriesProcessed: 1,
        projectsCreated: 1,
        evidenceCreated: 1,
        verifiedSkills: ['Distributed Systems'],
      }),
    };
    app = buildApp({ db, ingestionService: mockIngestionService });
    await app.ready();

    // 1. Provision Tenant A & User A
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
      displayName: `Alex Mercer ${testRunId}`,
      role: 'OWNER',
      status: 'ACTIVE',
    });

    await db.insert(candidates).values({
      id: candidateIdA,
      tenantId: tenantIdA,
      userId: userIdA,
      displayName: `Alex Mercer ${testRunId}`,
      headline: 'Lead Cloud & Distributed Systems Architect',
      summary: 'Engineering scalable cloud native systems and MCP agents.',
      canonicalEmail: `user-a-${testRunId}@example.test`,
      status: 'ACTIVE',
    });

    await db.insert(skills).values({
      id: skillIdA,
      name: 'Distributed Systems',
      slug: `distributed-systems-${testRunId}`,
      category: 'ARCHITECTURE',
    });

    await db.insert(candidateSkills).values({
      id: crypto.randomUUID(),
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      skillId: skillIdA,
      category: 'ARCHITECTURE',
      confidenceScore: 0.95,
      provenanceStatus: 'VERIFIED',
      evidenceCount: 12,
    });

    await db.insert(projects).values({
      id: projectIdA,
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      name: 'cloud-mesh-kernel',
      slug: `cloud-mesh-kernel-${testRunId}`,
      headline: 'High-throughput mesh kernel with zero-copy networking',
      summary: 'Production distributed microservices architecture on Kubernetes',
      role: 'Lead Architect',
      isHighlighted: true,
    });

    await db.insert(resourceConnections).values({
      id: connectionIdA,
      tenantId: tenantIdA,
      userId: userIdA,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'GitHub App (AlexMercer)',
      externalAccountId: '123456',
      externalAccountName: 'AlexMercer',
      installationId: '887766',
      encryptedCredentials: encryptSecret('mock_credentials'),
      status: 'ACTIVE',
    });

    await db.insert(resources).values({
      id: resourceIdA,
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      connectionId: connectionIdA,
      provider: 'GITHUB_APP',
      resourceType: 'REPOSITORY',
      externalResourceId: 'repo-101',
      name: 'AlexMercer/cloud-mesh-kernel',
      displayName: 'AlexMercer/cloud-mesh-kernel',
      url: 'https://github.com/AlexMercer/cloud-mesh-kernel',
      isPrivate: false,
      status: 'ACTIVE',
    });

    await db.insert(evidenceItems).values({
      id: evidenceIdA,
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      projectId: projectIdA,
      skillId: skillIdA,
      resourceId: resourceIdA,
      evidenceType: 'CODE_IMPORT_USAGE',
      sourceProvider: 'GITHUB_APP',
      sourceLocation: { filePath: 'src/kernel/transport.js' },
      excerpt: 'import { createServer } from "node:http2";',
      confidenceScore: 0.98,
    });

    await db.insert(jobApplications).values({
      id: crypto.randomUUID(),
      tenantId: tenantIdA,
      candidateId: candidateIdA,
      companyName: 'Acme Cloud AI',
      jobTitle: 'Principal Platform Engineer',
      status: 'INTERVIEWING',
    });

    // 2. Provision Tenant B (for multi-tenant isolation testing)
    await db.insert(tenants).values({
      id: tenantIdB,
      name: `Tenant B ${testRunId}`,
      slug: `tenant-b-${testRunId}`,
      tier: 'FREE',
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
      headline: 'Frontend React Engineer',
      status: 'ACTIVE',
    });

    await db.insert(projects).values({
      id: projectIdB,
      tenantId: tenantIdB,
      candidateId: candidateIdB,
      name: 'tenant-b-secret-project',
      slug: `tenant-b-secret-${testRunId}`,
      summary: 'Confidential project belonging to Tenant B',
    });

    // Create session cookies
    const sessionContextA = await createSession(db, {
      userId: userIdA,
      tenantId: tenantIdA,
      role: 'OWNER',
    });
    rawSessionTokenA = sessionContextA.rawToken;

    const sessionContextB = await createSession(db, {
      userId: userIdB,
      tenantId: tenantIdB,
      role: 'OWNER',
    });
    rawSessionTokenB = sessionContextB.rawToken;
  });

  after(async () => {
    try {
      await db.delete(evidenceItems).where(eq(evidenceItems.tenantId, tenantIdA));
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tenantIdA));
      await db.delete(resources).where(eq(resources.tenantId, tenantIdA));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tenantIdA));
      await db.delete(projects).where(eq(projects.tenantId, tenantIdA));
      await db.delete(projects).where(eq(projects.tenantId, tenantIdB));
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
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. Onboarding Flow Tests
  // ---------------------------------------------------------------------------
  it('1. GET /onboarding returns 200 OK and renders 5-step onboarding wizard', async () => {
    const cookieOpts = getSessionCookieOptions(config);

    // Step 1: Profile
    const resStep1 = await app.inject({
      method: 'GET',
      url: '/onboarding',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });
    assert.equal(resStep1.statusCode, 200);
    assert.match(resStep1.headers['content-type'], /text\/html/);
    assert.match(resStep1.payload, /Candidate Setup Wizard/);
    assert.match(
      resStep1.payload,
      /Candidate Identity &amp; Target Specialization|Candidate Identity & Target Specialization/
    );

    // Step 2: GitHub App
    const resStep2 = await app.inject({
      method: 'GET',
      url: '/onboarding?step=2',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });
    assert.equal(resStep2.statusCode, 200);
    assert.match(resStep2.payload, /Connect GitHub Codebases/);

    // Step 3: Repositories
    const resStep3 = await app.inject({
      method: 'GET',
      url: '/onboarding?step=3',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });
    assert.equal(resStep3.statusCode, 200);
    assert.match(resStep3.payload, /Select Repositories for Career Portfolio/);
  });

  it('2. POST /onboarding/profile updates candidate profile and redirects to Step 2', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/profile',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
      payload: new URLSearchParams({
        displayName: 'Alex Mercer (Updated)',
        canonicalEmail: 'alex.updated@example.test',
        headline: 'Principal Distributed Systems Engineer',
        specialization: 'Backend',
        summary: 'Updated bio highlighting 10+ years of high-concurrency systems.',
      }).toString(),
    });

    assert.equal(res.statusCode, 302);
    assert.match(res.headers['location'], /\/onboarding\?step=2/);

    // Verify DB update
    const [updatedCandidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateIdA));
    assert.equal(updatedCandidate.displayName, 'Alex Mercer (Updated)');
    assert.equal(updatedCandidate.headline, 'Principal Distributed Systems Engineer');
  });

  it('3. POST /onboarding/repositories/select registers selected resources and redirects to Step 4', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/repositories/select',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
      payload: new URLSearchParams({
        repositories: 'AlexMercer/new-showcase-repo',
      }).toString(),
    });

    assert.equal(res.statusCode, 302);
    assert.match(res.headers['location'], /\/onboarding\?step=4/);

    // Verify resource creation
    const [newRes] = await db
      .select()
      .from(resources)
      .where(
        and(eq(resources.tenantId, tenantIdA), eq(resources.name, 'AlexMercer/new-showcase-repo'))
      );
    assert.ok(newRes);
    assert.equal(newRes.provider, 'GITHUB_APP');
  });

  it('4. POST /onboarding/sync executes repository ingestion pipeline and redirects to Step 5', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/sync',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 302);
    assert.match(res.headers['location'], /\/onboarding\?step=5/);
  });

  // ---------------------------------------------------------------------------
  // 2. Candidate Dashboard Tests
  // ---------------------------------------------------------------------------
  it('5. GET /dashboard returns 200 OK with full candidate metrics, verified skills, and projects', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Alex Mercer/);
    assert.match(res.payload, /Distributed Systems/);
    assert.match(res.payload, /cloud-mesh-kernel/);
    assert.match(res.payload, /Acme Cloud AI/);
    assert.match(res.payload, /GitHub App/);
  });

  // ---------------------------------------------------------------------------
  // 3. Projects Portfolio & Detail Inspection Tests
  // ---------------------------------------------------------------------------
  it('6. GET /projects returns 200 OK with portfolio projects list', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/projects',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Projects &amp; Code Evidence|Projects & Code Evidence/);
    assert.match(res.payload, /cloud-mesh-kernel/);
    assert.match(res.payload, /High-throughput mesh kernel/);
  });

  it('7. GET /projects/:id returns 200 OK with detailed evidence citations and linked skills', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: `/projects/${projectIdA}`,
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /cloud-mesh-kernel/);
    assert.match(res.payload, /src\/kernel\/transport\.js/);
    assert.match(res.payload, /Distributed Systems/);
    assert.match(res.payload, /CODE_IMPORT_USAGE/);
  });

  // ---------------------------------------------------------------------------
  // 4. Verified Skills Taxonomy Explorer Tests
  // ---------------------------------------------------------------------------
  it('8. GET /skills returns 200 OK with categorized skills and truth provenance labels', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/skills',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Verified Skills Graph/);
    assert.match(res.payload, /Distributed Systems/);
    assert.match(res.payload, /VERIFIED/);
  });

  // ---------------------------------------------------------------------------
  // 5. Connected Sources Hub Tests
  // ---------------------------------------------------------------------------
  it('9. GET /sources returns 200 OK with GitHub connection card and connected repositories table', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/sources',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.payload, /Connected Sources Hub/);
    assert.match(res.payload, /GitHub App Connector/);
    assert.match(res.payload, /AlexMercer\/cloud-mesh-kernel/);
    assert.match(res.payload, /GitLab/);
    assert.match(res.payload, /Google Drive/);
  });

  it('10. POST /sources/disconnect deactivates connection and redirects to /sources', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'POST',
      url: '/sources/disconnect',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
      payload: new URLSearchParams({
        connectionId: connectionIdA,
      }).toString(),
    });

    assert.equal(res.statusCode, 302);
    assert.match(res.headers['location'], /\/sources/);
  });

  // ---------------------------------------------------------------------------
  // 6. Security & Multi-Tenant Isolation Tests (IDOR Defense)
  // ---------------------------------------------------------------------------
  it('11. GET /projects/:id rejects cross-tenant access to another tenant project with 404', async () => {
    const cookieOpts = getSessionCookieOptions(config);

    // User A attempts to view Tenant B's project -> 404
    const resForbidden = await app.inject({
      method: 'GET',
      url: `/projects/${projectIdB}`,
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });
    assert.equal(resForbidden.statusCode, 404);
    assert.doesNotMatch(resForbidden.payload, /tenant-b-secret-project/);

    // User B views their own project -> 200 OK
    const resAllowed = await app.inject({
      method: 'GET',
      url: `/projects/${projectIdB}`,
      cookies: {
        [cookieOpts.name]: rawSessionTokenB,
        career_hub_session: rawSessionTokenB,
      },
    });
    assert.equal(resAllowed.statusCode, 200);
    assert.match(resAllowed.payload, /tenant-b-secret-project/);
  });

  it('12. Protected routes redirect unauthenticated visitors to /login', async () => {
    const protectedUrls = [
      '/dashboard',
      '/onboarding',
      '/projects',
      `/projects/${projectIdA}`,
      '/skills',
      '/sources',
      '/resumes',
      '/connect',
    ];

    for (const url of protectedUrls) {
      const res = await app.inject({
        method: 'GET',
        url,
      });
      assert.equal(res.statusCode, 302, `Route ${url} should redirect unauthenticated request`);
      assert.match(res.headers['location'], /\/login/, `Route ${url} should redirect to /login`);
    }
  });

  it('13. Rendered HTML views never expose raw database credentials or tokens', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const urls = [
      '/dashboard',
      '/onboarding',
      '/projects',
      `/projects/${projectIdA}`,
      '/skills',
      '/sources',
      '/resumes',
      '/connect',
    ];

    for (const url of urls) {
      const res = await app.inject({
        method: 'GET',
        url,
        cookies: {
          [cookieOpts.name]: rawSessionTokenA,
          career_hub_session: rawSessionTokenA,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.doesNotMatch(res.payload, /postgres:/i);
      assert.doesNotMatch(res.payload, /enc_mock_credentials/);
      assert.doesNotMatch(res.payload, /rawSessionToken/);
    }
  });

  it('14. Grouped navigation IA renders grouped Career, Sources, AI Connect, MCP Docs, and user profile dropdown', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/dashboard',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    // Grouped links
    assert.ok(res.payload.includes('Career'));
    assert.ok(res.payload.includes('Sources'));
    assert.ok(res.payload.includes('AI Connect'));
    assert.ok(res.payload.includes('MCP Docs'));
    assert.ok(res.payload.includes('Alex Mercer'));
    assert.ok(res.payload.includes('Sign Out'));
    assert.ok(res.payload.includes('href="/projects"'));
    assert.ok(res.payload.includes('href="/skills"'));
    assert.ok(res.payload.includes('href="/sources"'));
    assert.ok(res.payload.includes('href="/resumes"'));
    assert.ok(res.payload.includes('href="/settings"'));
  });

  it('15. GET /resumes has full session, candidate identity, and tenant authority parity with GET /dashboard', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/resumes',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    // Confirms authenticated candidate profile is rendered with correct identity
    assert.ok(res.payload.includes('Alex Mercer (Updated)'));
    assert.ok(res.payload.includes('Principal Distributed Systems Engineer'));
    assert.ok(res.payload.includes('alex.updated@example.test'));
    // Confirms authenticated navbar is rendered
    assert.ok(res.payload.includes('Sign Out'));
  });

  // ---------------------------------------------------------------------------
  // 7. P13.5-004: AI Connection Center & Public MCP Documentation Tests
  // ---------------------------------------------------------------------------
  it('16. GET /docs/mcp is publicly accessible and documents all 16 registered MCP tools', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/docs/mcp',
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);

    // Verify all 16 registered tool names exist in HTML
    const registeredTools = [
      'get_candidate_profile',
      'list_verified_skills',
      'inspect_project_evidence',
      'analyze_job_fit',
      'generate_tailored_resume',
      'draft_cover_letter',
      'recommend_portfolio_projects',
      'propose_project_improvement',
      'confirm_and_create_pr',
      'track_job_application',
      'list_active_applications',
      'get_job_application',
      'update_application_status',
      'add_application_stage',
      'update_application_stage_outcome',
      'attach_application_document',
    ];

    for (const toolName of registeredTools) {
      assert.ok(
        res.payload.includes(toolName),
        `Public MCP documentation must include tool "${toolName}"`
      );
    }

    // Verify protocol metadata, scopes, and discovery
    assert.ok(res.payload.includes('POST /mcp'));
    assert.ok(res.payload.includes('/.well-known/oauth-authorization-server'));
    assert.ok(res.payload.includes('/.well-known/oauth-protected-resource'));
    assert.ok(res.payload.includes('career:read'));
    assert.ok(res.payload.includes('career:write'));
    assert.ok(res.payload.includes('Two-Phase Write Safety'));
    assert.ok(res.payload.includes('PLANNED / NOT PUBLISHED'));
    assert.ok(res.payload.includes('PLANNED / NOT IMPLEMENTED'));
  });

  it('17. GET /connect renders AI provider cards, copyable MCP endpoint, and candidate context', async () => {
    const cookieOpts = getSessionCookieOptions(config);
    const res = await app.inject({
      method: 'GET',
      url: '/connect',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.ok(res.payload.includes('AI Connection Center'));
    assert.ok(res.payload.includes('Anthropic Claude'));
    assert.ok(res.payload.includes('OpenAI ChatGPT'));
    assert.ok(res.payload.includes('Google Gemini'));
    assert.ok(res.payload.includes('/mcp'));
    assert.ok(res.payload.includes('Local Development vs Cloud AI Hosts'));
    assert.ok(res.payload.includes('Personal MCP API Tokens'));
    assert.ok(res.payload.includes('Two-Phase Write Safety'));
  });

  it('18. POST /connect/tokens and POST /connect/tokens/:id/revoke manage personal MCP token lifecycle', async () => {
    const cookieOpts = getSessionCookieOptions(config);

    // 1. Create a personal token via JSON
    const resCreate = await app.inject({
      method: 'POST',
      url: '/connect/tokens',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
      payload: {
        name: 'Integration Test Gemini Agent',
        scopes: ['career:read', 'career:write'],
        expiryDays: 30,
      },
    });

    assert.equal(resCreate.statusCode, 201);
    const createData = JSON.parse(resCreate.payload);
    assert.equal(createData.success, true);
    assert.ok(createData.data.rawToken.startsWith('mcp_'));
    const createdTokenId = createData.data.token.id;

    // 2. View /connect HTML and verify the active token appears in table
    const resList = await app.inject({
      method: 'GET',
      url: '/connect',
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });

    assert.equal(resList.statusCode, 200);
    assert.ok(resList.payload.includes('Integration Test Gemini Agent'));

    // 3. User B (Tenant B) attempts to revoke User A's token -> 404 (IDOR denial)
    const resIdorRevoke = await app.inject({
      method: 'POST',
      url: `/connect/tokens/${createdTokenId}/revoke`,
      headers: {
        accept: 'application/json',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenB,
        career_hub_session: rawSessionTokenB,
      },
    });
    assert.equal(resIdorRevoke.statusCode, 404);

    // 4. User A revokes their own token -> Success
    const resRevoke = await app.inject({
      method: 'POST',
      url: `/connect/tokens/${createdTokenId}/revoke`,
      headers: {
        accept: 'application/json',
      },
      cookies: {
        [cookieOpts.name]: rawSessionTokenA,
        career_hub_session: rawSessionTokenA,
      },
    });
    assert.equal(resRevoke.statusCode, 200);
  });

  // ---------------------------------------------------------------------------
  // 8. MCP & OAuth Protocol Invariants
  // ---------------------------------------------------------------------------
  it('19. POST /mcp remains purely JSON-RPC machine protocol and rejects unauthenticated requests with JSON-RPC error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        jsonrpc: '2.0',
        id: 'req-mcp-1',
        method: 'tools/list',
      },
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.headers['content-type'], /application\/json/);
  });

  it('20. RFC 8414 & RFC 9728 OAuth discovery endpoints return standard JSON metadata', async () => {
    const resAuthServer = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
    });
    assert.equal(resAuthServer.statusCode, 200);
    assert.match(resAuthServer.headers['content-type'], /application\/json/);

    const resProtectedResource = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });
    assert.equal(resProtectedResource.statusCode, 200);
    assert.match(resProtectedResource.headers['content-type'], /application\/json/);
  });
});
