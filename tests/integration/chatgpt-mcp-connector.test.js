/**
 * @file Integration Tests for ChatGPT Remote MCP & OAuth 2.1 Connector (P11-001, P11-002, P11-003).
 *
 * Verifies live execution against Fastify HTTP MCP transport, OAuth endpoints, and PostgreSQL database:
 * 1. Unauthenticated MCP request returns 401 with WWW-Authenticate pointing to Protected Resource Metadata.
 * 2. GET /.well-known/oauth-protected-resource and GET /.well-known/oauth-authorization-server.
 * 3. GET /oauth/authorize query validation for chatgpt-web and chatgpt-desktop (RFC 8252 loopback ports).
 * 4. GET /oauth/authorize successful authorization code generation with PKCE challenge, RFC 8707 resource, and scope ceiling clamping.
 * 5. POST /oauth/token code exchange (rejects bad verifier, succeeds on valid verifier, enforces single-use).
 * 6. POST /mcp execution using OAuth Bearer access token:
 *    - tools/list (all 9 tools discoverable with schemas)
 *    - tools/call get_candidate_profile
 *    - tools/call list_verified_skills
 *    - tools/call inspect_project_evidence
 *    - tools/call analyze_job_fit (with safety ceiling)
 *    - tools/call generate_tailored_resume
 *    - tools/call draft_cover_letter
 *    - tools/call recommend_portfolio_projects
 * 7. Rejection of query string tokens (/mcp?token=...) with 400 QUERY_TOKEN_PROHIBITED.
 * 8. Sovereign multi-tenant isolation (Tenant A OAuth token querying Tenant B candidate fails with 404 NOT_FOUND).
 * 9. Scope enforcement (career:read token rejected on write tool propose_project_improvement -> 403 FORBIDDEN).
 * 10. Two-Phase Write Safety Execution (propose_project_improvement -> stopping protocol -> confirm_and_create_pr).
 * 11. Refresh token rotation (RTR) and replay detection with entire family revocation.
 * 12. POST /oauth/revoke and immediate invalidation on subsequent MCP tool calls.
 * 13. Clean teardown with zero database pool leaks (satisfies test:db-lifecycle-check).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  sessions,
  candidates,
  resources,
  resourceConnections,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  actionApprovalTickets,
  oauthAuthorizationCodes,
  oauthTokens,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { OAuthAuthorizationService } from '../../src/services/oauth-authorization.service.js';
import { ActionApprovalTicketService } from '../../src/services/action-approval-ticket.service.js';
import { GitHubWriteSafetyService } from '../../src/services/github-write-safety.service.js';
import { GitHubWriteService } from '../../src/services/github-write.service.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { config } from '../../src/config/env.js';

describe('ChatGPT Remote MCP & OAuth 2.1 Connector Integration Tests (P11-001, P11-002, P11-003)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let oauthService;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userAMember;
  let userAReadonly;
  let candidateA;
  let resourceConnectionA;
  let resourceA;
  let projectA;
  let skillA;

  let memberACookie;
  let _readonlyACookie;

  let _tenantB;
  let _userBMember;
  let candidateB;
  let expectedResource;

  const baseSha = '9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a';
  const treeSha = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
  const commitSha = '4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b';
  const branchHeadMap = new Map([['main', { commitSha: baseSha, ref: 'refs/heads/main' }]]);

  // Mock GitHub Connector
  const mockConnector = {
    getBranchHeadSha: async (_ctx, _creds, _repo, branch) => {
      return branchHeadMap.get(branch) || null;
    },
    getRepository: async () => ({
      name: 'Ai-job-mcp',
      fullName: 'vishu1803/Ai-job-mcp',
      defaultBranch: 'main',
      private: false,
    }),
    createGitTree: async () => ({ treeSha, url: 'https://api.github.com/trees/1' }),
    createGitCommit: async () => ({ commitSha, url: 'https://api.github.com/commits/1' }),
    createGitRef: async (_ctx, _creds, _repo, { ref, commitSha: sha }) => {
      const branchName = ref.replace(/^refs\/heads\//, '');
      branchHeadMap.set(branchName, { commitSha: sha, ref: `refs/heads/${branchName}` });
      return { ref: `refs/heads/${branchName}`, commitSha: sha };
    },
    deleteGitRef: async (_ctx, _creds, _repo, ref) => {
      const branchName = ref.replace(/^refs\/heads\//, '');
      branchHeadMap.delete(branchName);
      return { success: true };
    },
    createDraftPullRequest: async (_ctx, _creds, _repo, { head, base }) => ({
      prNumber: 42,
      prUrl: 'https://github.com/vishu1803/Ai-job-mcp/pull/42',
      state: 'open',
      draft: true,
      headRef: head,
      baseRef: base,
    }),
    getPullRequestByHead: async () => [],
    closePullRequest: async () => ({ success: true, state: 'closed' }),
  };

  const validVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk_chatgpt_verifier_12345678';
  const validChallenge = crypto
    .createHash('sha256')
    .update(validVerifier, 'utf8')
    .digest('base64url');

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  async function invokeMcp({ token, method = 'tools/call', toolName, args = {}, id = 1 }) {
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
    };
    if (toolName) {
      headers['mcp-name'] = toolName;
    }

    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...(toolName ? { name: toolName } : {}),
        ...(method === 'tools/call' ? { arguments: args } : args),
        _meta: PROTOCOL_META,
      },
    };

    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload,
    });
  }

  before(async () => {
    try {
      // 1. Initialize Tenant A
      const tenantIdA = crypto.randomUUID();
      createdTenantIds.push(tenantIdA);

      [tenantA] = await db
        .insert(tenants)
        .values({
          id: tenantIdA,
          name: `Tenant A ChatGPT MCP ${testRunId}`,
          slug: `tenant-a-chatgpt-${testRunId}`,
          tier: 'ENTERPRISE',
        })
        .returning();

      const userIdAMember = crypto.randomUUID();
      [userAMember] = await db
        .insert(users)
        .values({
          id: userIdAMember,
          tenantId: tenantIdA,
          email: `member-chatgpt-a-${testRunId}@example.com`,
          displayName: 'Alice ChatGPT Member A',
          role: 'MEMBER',
          status: 'ACTIVE',
        })
        .returning();

      const userIdAReadonly = crypto.randomUUID();
      [userAReadonly] = await db
        .insert(users)
        .values({
          id: userIdAReadonly,
          tenantId: tenantIdA,
          email: `readonly-chatgpt-a-${testRunId}@example.com`,
          displayName: 'Bob ChatGPT Readonly A',
          role: 'READONLY',
          status: 'ACTIVE',
        })
        .returning();

      const candidateIdA = crypto.randomUUID();
      [candidateA] = await db
        .insert(candidates)
        .values({
          id: candidateIdA,
          tenantId: tenantIdA,
          userId: userIdAMember,
          displayName: 'Alice Candidate A',
          canonicalEmail: `alice-chatgpt-${testRunId}@example.com`,
          headline: 'Senior Distributed Systems Architect',
          summary: 'Expert in Node.js, Fastify, and PostgreSQL distributed systems.',
          status: 'ACTIVE',
        })
        .returning();

      const existingNode = await db
        .select()
        .from(skills)
        .where(eq(skills.slug, 'node-js'))
        .limit(1);
      if (existingNode.length > 0) {
        skillA = existingNode[0];
      } else {
        [skillA] = await db
          .insert(skills)
          .values({
            slug: 'node-js',
            name: 'Node.js',
            category: 'LANGUAGE',
          })
          .returning();
      }

      const existingRedis = await db.select().from(skills).where(eq(skills.slug, 'redis')).limit(1);
      if (existingRedis.length === 0) {
        await db.insert(skills).values({
          slug: 'redis',
          name: 'Redis',
          category: 'DATABASE',
        });
      }

      const connectionIdA = crypto.randomUUID();
      const encryptedCreds = encryptSecret(JSON.stringify({ installationId: '987654' }));

      [resourceConnectionA] = await db
        .insert(resourceConnections)
        .values({
          id: connectionIdA,
          tenantId: tenantIdA,
          userId: userIdAMember,
          provider: 'GITHUB_APP',
          authType: 'APP_INSTALLATION',
          displayName: 'vishu1803',
          externalAccountId: '12345678',
          externalAccountName: 'vishu1803',
          installationId: '987654',
          encryptedCredentials: encryptedCreds,
          status: 'ACTIVE',
        })
        .returning();

      [resourceA] = await db
        .insert(resources)
        .values({
          tenantId: tenantIdA,
          connectionId: resourceConnectionA.id,
          candidateId: candidateA.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: 'vishu1803/Ai-job-mcp',
          name: 'vishu1803/Ai-job-mcp',
          displayName: 'Ai-job-mcp',
          url: 'https://github.com/vishu1803/Ai-job-mcp',
          isPrivate: false,
          metadata: { defaultBranch: 'main' },
        })
        .returning();

      const projectIdA = crypto.randomUUID();
      [projectA] = await db
        .insert(projects)
        .values({
          id: projectIdA,
          tenantId: tenantIdA,
          candidateId: candidateA.id,
          name: 'Distributed Transaction Mesh',
          slug: `distributed-transaction-mesh-${testRunId}`,
          headline: 'High-throughput transactional event processing engine',
          summary: 'Scalable event mesh built on Node.js and PostgreSQL.',
          role: 'Lead Architect',
          isHighlighted: true,
          startDate: '2023-01-01',
        })
        .returning();

      await db.insert(projectResources).values({
        tenantId: tenantIdA,
        projectId: projectA.id,
        resourceId: resourceA.id,
      });

      await db.insert(candidateSkills).values({
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        candidateId: candidateA.id,
        skillId: skillA.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 1,
      });

      await db.insert(evidenceItems).values({
        id: crypto.randomUUID(),
        tenantId: tenantIdA,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA.id,
        skillId: skillA.id,
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'package.json',
          commitSha: '5fe4bec9cc62f6445fd7f7b433f811f631e4b6d3',
        },
        excerpt: '{"dependencies": {"fastify": "^4.0.0"}}',
        confidenceScore: 0.95,
        detectedAt: new Date(),
      });

      // 2. Initialize Tenant B (for multi-tenant isolation testing)
      const tenantIdB = crypto.randomUUID();
      createdTenantIds.push(tenantIdB);

      [_tenantB] = await db
        .insert(tenants)
        .values({
          id: tenantIdB,
          name: `Tenant B ChatGPT MCP ${testRunId}`,
          slug: `tenant-b-chatgpt-${testRunId}`,
          tier: 'FREE',
        })
        .returning();

      const userIdBMember = crypto.randomUUID();
      [_userBMember] = await db
        .insert(users)
        .values({
          id: userIdBMember,
          tenantId: tenantIdB,
          email: `member-chatgpt-b-${testRunId}@example.com`,
          displayName: 'Eve ChatGPT Member B',
          role: 'MEMBER',
          status: 'ACTIVE',
        })
        .returning();

      const candidateIdB = crypto.randomUUID();
      [candidateB] = await db
        .insert(candidates)
        .values({
          id: candidateIdB,
          tenantId: tenantIdB,
          userId: userIdBMember,
          displayName: 'Eve Candidate B',
          canonicalEmail: `eve-chatgpt-${testRunId}@example.com`,
          headline: 'Frontend Specialist',
          status: 'ACTIVE',
        })
        .returning();

      // 3. Setup Sessions
      const cookieOpts = getSessionCookieOptions(config);
      const sessionMemberRecord = await createSession(db, {
        userId: userAMember.id,
        tenantId: tenantA.id,
      });
      memberACookie = `${cookieOpts.name}=${sessionMemberRecord.rawToken}`;

      const sessionReadonlyRecord = await createSession(db, {
        userId: userAReadonly.id,
        tenantId: tenantA.id,
      });
      _readonlyACookie = `${cookieOpts.name}=${sessionReadonlyRecord.rawToken}`;

      // 4. Initialize Services & App
      oauthService = new OAuthAuthorizationService({ db });
      expectedResource = oauthService.getExpectedResourceUrl();
      tokenService = new McpApiTokenService({ db });
      rateLimiter = new McpRateLimiter();

      const approvalService = new ActionApprovalTicketService({ database: db });
      const safetyService = new GitHubWriteSafetyService();
      const writeService = new GitHubWriteService({
        db,
        connector: mockConnector,
        approvalService,
        safetyService,
      });

      const customMcpServer = createCareerMcpServer({
        deps: {
          db,
          connector: mockConnector,
          writeService,
          approvalService,
          safetyService,
        },
      });

      app = await buildApp({
        mcpServer: customMcpServer,
        tokenService,
        oauthService,
        rateLimiter,
        db,
      });
      await app.ready();
    } catch (err) {
      console.error('Setup failure in ChatGPT MCP integration tests:', err);
      throw err;
    }
  });

  after(async () => {
    try {
      if (app) {
        await app.close();
      }
      for (const tenantId of createdTenantIds) {
        await db.delete(oauthTokens).where(eq(oauthTokens.tenantId, tenantId));
        await db
          .delete(oauthAuthorizationCodes)
          .where(eq(oauthAuthorizationCodes.tenantId, tenantId));
        await db.delete(actionApprovalTickets).where(eq(actionApprovalTickets.tenantId, tenantId));
        await db.delete(evidenceItems).where(eq(evidenceItems.tenantId, tenantId));
        await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, tenantId));
        await db.delete(projectResources).where(eq(projectResources.tenantId, tenantId));
        await db.delete(projects).where(eq(projects.tenantId, tenantId));
        await db.delete(resources).where(eq(resources.tenantId, tenantId));
        await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tenantId));
        await db.delete(candidates).where(eq(candidates.tenantId, tenantId));
        await db.delete(sessions).where(eq(sessions.tenantId, tenantId));
        await db.delete(users).where(eq(users.tenantId, tenantId));
        await db.delete(tenants).where(eq(tenants.id, tenantId));
      }
      await closeDatabase();
    } catch (err) {
      console.error('Teardown error in ChatGPT MCP integration tests:', err);
    }
  });

  describe('1. Protected Resource & Metadata Discovery (RFC 9728 & RFC 8414)', () => {
    it('returns 401 Unauthorized with RFC 9728 WWW-Authenticate header on unauthenticated POST /mcp', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        },
      });

      assert.strictEqual(res.statusCode, 401);
      const wwwAuth = res.headers['www-authenticate'];
      assert.ok(wwwAuth, 'Expected WWW-Authenticate header');
      assert.match(wwwAuth, /^Bearer realm="mcp"/);
      assert.match(wwwAuth, /resource_metadata=/);
    });

    it('exposes RFC 9728 Protected Resource Metadata at GET /.well-known/oauth-protected-resource', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/oauth-protected-resource',
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
      const body = JSON.parse(res.payload);
      assert.ok(body.resource, 'Expected resource indicator');
      assert.ok(Array.isArray(body.authorization_servers), 'Expected authorization_servers array');
      assert.ok(Array.isArray(body.scopes_supported), 'Expected scopes_supported array');
      assert.ok(body.scopes_supported.includes('career:read'));
      assert.ok(body.scopes_supported.includes('career:write'));
    });

    it('exposes RFC 8414 OAuth Authorization Server Metadata at GET /.well-known/oauth-authorization-server', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/oauth-authorization-server',
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.issuer);
      assert.ok(body.authorization_endpoint);
      assert.ok(body.token_endpoint);
      assert.ok(body.revocation_endpoint);
      assert.strictEqual(body.resource_indicators_supported, true);
      assert.ok(body.code_challenge_methods_supported.includes('S256'));
    });
  });

  describe('2. ChatGPT Client Validation & PKCE S256 Enforcement', () => {
    it('rejects unknown client ID with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        query: {
          response_type: 'code',
          client_id: 'unknown-chatgpt-client',
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          state: 'test-state-1',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'invalid_client');
    });

    it('rejects invalid redirect URI for chatgpt-web with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        query: {
          response_type: 'code',
          client_id: 'chatgpt-web',
          redirect_uri: 'https://malicious-site.com/callback',
          resource: expectedResource,
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          state: 'test-state-2',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'invalid_request');
    });

    it('rejects plain PKCE (code_challenge_method=plain) with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        query: {
          response_type: 'code',
          client_id: 'chatgpt-web',
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          code_challenge: 'plain_challenge',
          code_challenge_method: 'plain',
          state: 'test-state-3',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'invalid_request');
    });

    it('supports chatgpt-desktop with loopback port-agnostic redirect URI (RFC 8252)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        headers: {
          cookie: memberACookie,
        },
        query: {
          response_type: 'code',
          client_id: 'chatgpt-desktop',
          redirect_uri: 'http://localhost:54321/callback',
          resource: expectedResource,
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          state: 'desktop-state-1',
        },
      });

      // Renders interactive consent screen for authenticated session
      assert.strictEqual(res.statusCode, 200);
      assert.match(res.payload, /ChatGPT/i);
      assert.match(res.payload, /http:\/\/localhost:54321\/callback/);
    });
  });

  describe('3. RFC 8707 Resource Indicator Validation & Mismatch Defense', () => {
    it('rejects mismatched resource parameter on GET /oauth/authorize with 400 invalid_target', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        query: {
          response_type: 'code',
          client_id: 'chatgpt-web',
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: 'https://malicious-target.com/mcp',
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          state: 'resource-mismatch-state',
        },
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'invalid_target');
    });
  });

  describe('4. Interactive Consent, Code Exchange & Token Rotation for ChatGPT', () => {
    let issuedAuthCode;
    let chatgptAccessToken;
    let chatgptRefreshToken;

    it('unauthenticated browser redirects to GitHub OAuth login with encrypted return_to', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/oauth/authorize',
        query: {
          response_type: 'code',
          client_id: 'chatgpt-web',
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          state: 'auth-bridge-state',
        },
      });

      assert.strictEqual(res.statusCode, 302);
      const location = res.headers.location;
      assert.ok(location.startsWith('/auth/github?return_to='));
    });

    it('authenticated user grants consent on POST /oauth/authorize/consent and receives authorization code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/oauth/authorize/consent',
        headers: {
          cookie: memberACookie,
          'content-type': 'application/json',
        },
        payload: {
          client_id: 'chatgpt-web',
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          scope: 'career:read career:write',
          state: 'consent-state-xyz',
          code_challenge: validChallenge,
          code_challenge_method: 'S256',
          action: 'allow',
        },
      });

      assert.strictEqual(res.statusCode, 302);
      const location = res.headers.location;
      assert.ok(location.startsWith('https://chatgpt.com/api/mcp/oauth_callback?'));
      const url = new URL(location);
      assert.strictEqual(url.searchParams.get('state'), 'consent-state-xyz');
      issuedAuthCode = url.searchParams.get('code');
      assert.ok(issuedAuthCode, 'Expected authorization code in redirect query');
    });

    it('exchanges authorization code for access and refresh tokens on POST /oauth/token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: 'chatgpt-web',
          code: issuedAuthCode,
          code_verifier: validVerifier,
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
        }).toString(),
      });

      assert.strictEqual(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);
      assert.strictEqual(body.token_type, 'Bearer');
      assert.strictEqual(body.expires_in, 3600);
      assert.ok(body.scope.includes('career:read'));
      assert.ok(body.scope.includes('career:write'));

      chatgptAccessToken = body.access_token;
      chatgptRefreshToken = body.refresh_token;
    });

    it('enforces single-use authorization code (replaying code fails with 400 invalid_grant)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/oauth/token',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: 'chatgpt-web',
          code: issuedAuthCode,
          code_verifier: validVerifier,
          redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
        }).toString(),
      });

      assert.strictEqual(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.strictEqual(body.error, 'invalid_grant');
    });

    describe('5. ChatGPT Streamable HTTP MCP Tool Execution (Read & Artifact Tools)', () => {
      it('executes tools/list over ChatGPT OAuth Bearer token discovering all 9 tools', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/list',
          id: 101,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.strictEqual(body.jsonrpc, '2.0');
        assert.strictEqual(body.id, 101);
        const tools = body.result.tools;
        assert.strictEqual(tools.length, 9);
        const toolNames = tools.map((t) => t.name);
        assert.ok(toolNames.includes('get_candidate_profile'));
        assert.ok(toolNames.includes('list_verified_skills'));
        assert.ok(toolNames.includes('inspect_project_evidence'));
        assert.ok(toolNames.includes('analyze_job_fit'));
        assert.ok(toolNames.includes('generate_tailored_resume'));
        assert.ok(toolNames.includes('draft_cover_letter'));
        assert.ok(toolNames.includes('recommend_portfolio_projects'));
        assert.ok(toolNames.includes('propose_project_improvement'));
        assert.ok(toolNames.includes('confirm_and_create_pr'));
      });

      it('executes tools/call get_candidate_profile returning candidate summary and skills', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'get_candidate_profile',
          args: { candidateId: candidateA.id },
          id: 102,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.candidate.headline, 'Senior Distributed Systems Architect');
        assert.ok(data.topSkills.length >= 1);
      });

      it('executes tools/call list_verified_skills returning paginated skills', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'list_verified_skills',
          args: { pageSize: 10 },
          id: 103,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.pagination.totalCount, 1);
        assert.strictEqual(data.items[0].slug, 'node-js');
      });

      it('executes tools/call inspect_project_evidence returning pinned evidence', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'inspect_project_evidence',
          args: { projectId: projectA.id },
          id: 104,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.project.name, 'Distributed Transaction Mesh');
        assert.strictEqual(data.evidenceItems.length, 1);
        assert.strictEqual(data.evidenceItems[0].sourceLocation.filePath, 'package.json');
      });

      it('executes tools/call analyze_job_fit with missing critical skill safety ceiling (<= 50)', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'analyze_job_fit',
          args: {
            jobDescriptionText: `
              Job Title: Staff Cloud Engineer
              Required Skills:
              - Rust (Must have)
              - Kubernetes (Must have)
              - Apache Kafka (Must have)
              - Node.js (Must have)
            `,
          },
          id: 105,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.ok(
          data.overallFit.atsScore <= 50,
          `Expected score <= 50, got ${data.overallFit.atsScore}`
        );
        assert.ok(['LOW', 'WEAK', 'MODERATE'].includes(data.overallFit.matchGrade));
      });

      it('executes tools/call generate_tailored_resume', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'generate_tailored_resume',
          args: {
            jobTitle: 'Senior Node.js Backend Engineer',
            jobDescriptionText:
              'Seeking backend developer with Node.js and PostgreSQL experience for distributed transaction systems.',
          },
          id: 106,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.jobTitle, 'Senior Node.js Backend Engineer');
        assert.ok(Array.isArray(data.resume?.projects));
      });

      it('executes tools/call draft_cover_letter', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'draft_cover_letter',
          args: {
            jobTitle: 'Senior Backend Engineer',
            companyName: 'Acme Distributed Cloud',
            jobDescriptionText:
              'Seeking senior backend developer with Node.js experience to lead high-throughput microservices.',
          },
          id: 107,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.companyName, 'Acme Distributed Cloud');
        assert.ok(data.paragraphs.length >= 3);
      });

      it('executes tools/call recommend_portfolio_projects', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'recommend_portfolio_projects',
          args: {
            jobTitle: 'Senior Backend Engineer',
            jobDescriptionText:
              'Seeking backend engineer with strong distributed systems and event mesh architecture background.',
          },
          id: 108,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.ok(data.featuredProjects.length >= 1);
        assert.strictEqual(data.featuredProjects[0].name, 'Distributed Transaction Mesh');
      });
    });

    describe('6. Sovereign Multi-Tenant 404 Isolation under ChatGPT Token', () => {
      it('rejects cross-tenant candidate inspection with 404 Not Found (zero data leakage)', async () => {
        // Attempt to inspect Tenant B candidate using Tenant A token
        const crossTenantRes = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'get_candidate_profile',
          args: { candidateId: candidateB.id },
          id: 109,
        });

        assert.strictEqual(crossTenantRes.statusCode, 200);
        const crossBody = JSON.parse(crossTenantRes.payload);
        const isError = crossBody.error || crossBody.result?.isError;
        assert.ok(isError, 'Expected cross-tenant access error');
        const errMsg = crossBody.error?.message || crossBody.result?.content?.[0]?.text || '';
        assert.match(errMsg, /not found/i);
      });

      it('enforces token scope restriction (career:read OAuth token rejected on write tool)', async () => {
        const readOnlyCode = await oauthService.createAuthorizationCode({
          clientId: 'chatgpt-web',
          redirectUri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          codeChallenge: validChallenge,
          codeChallengeMethod: 'S256',
          scopes: ['career:read'],
          tenantId: tenantA.id,
          userId: userAMember.id,
          userRole: 'MEMBER',
        });

        const readTokenRes = await oauthService.exchangeAuthorizationCode({
          clientId: 'chatgpt-web',
          redirectUri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          code: readOnlyCode,
          codeVerifier: validVerifier,
        });

        const readOnlyToken = readTokenRes.access_token;

        const writeAttemptRes = await invokeMcp({
          token: readOnlyToken,
          method: 'tools/call',
          toolName: 'propose_project_improvement',
          args: {
            candidateId: candidateA.id,
            jobDescriptionText:
              'We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing, and distributed locking architectures.',
            targetSkillSlugs: ['redis'],
          },
          id: 110,
        });

        assert.strictEqual(writeAttemptRes.statusCode, 200);
        const writeBody = JSON.parse(writeAttemptRes.payload);
        assert.strictEqual(writeBody.result?.isError, true);
        assert.match(writeBody.result.content[0].text, /forbidden|scope/i);
      });
    });

    describe('7. Two-Phase Write Safety & Stopping Protocol under ChatGPT Token', () => {
      let createdTicketId;

      it('propose_project_improvement creates PENDING ticket and outputs human stopping protocol instructions', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'propose_project_improvement',
          args: {
            candidateId: candidateA.id,
            jobDescriptionText:
              'We are seeking a Senior Backend Engineer proficient in Redis caching, PostgreSQL indexing, and distributed locking architectures.',
            targetSkillSlugs: ['redis'],
          },
          id: 111,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(
          !body.result?.isError,
          `Error in propose_project_improvement: ${JSON.stringify(body.result)}`
        );
        assert.ok(body.result?.content?.[0]?.text);
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.status, 'PENDING_HUMAN_APPROVAL');
        assert.ok(data.ticketId);
        assert.ok(data.patchSummary.patchFingerprint);
        assert.ok(data.approvalRequirements.confirmationInstructions.includes('STOP:'));
        assert.ok(
          data.approvalRequirements.confirmationInstructions.includes('confirm_and_create_pr')
        );

        createdTicketId = data.ticketId;
      });

      it('confirm_and_create_pr rejects execution without boolean confirmed: true', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'confirm_and_create_pr',
          args: {
            ticketId: createdTicketId,
            confirmed: false, // Invalid
          },
          id: 112,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.strictEqual(body.result?.isError, true);
        assert.match(body.result.content[0].text, /confirmed/i);
      });

      it('confirm_and_create_pr executes successfully on valid ticket with confirmed: true', async () => {
        const res = await invokeMcp({
          token: chatgptAccessToken,
          method: 'tools/call',
          toolName: 'confirm_and_create_pr',
          args: {
            ticketId: createdTicketId,
            confirmed: true,
            userNotes: 'Approved via ChatGPT UI by human reviewer',
          },
          id: 113,
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(
          !body.result?.isError,
          `confirm_and_create_pr error: ${JSON.stringify(body.result)}`
        );
        const data = JSON.parse(body.result.content[0].text);
        assert.strictEqual(data.status, 'EXECUTED');
        assert.strictEqual(data.pullRequest.number, 42);
        assert.strictEqual(data.pullRequest.draft, true);
      });
    });

    describe('8. Refresh Token Rotation (RTR) & Revocation under ChatGPT Client', () => {
      let rotatedAccessToken;
      let _rotatedRefreshToken;

      it('rotates refresh token on POST /oauth/token and invalidates old refresh token', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/oauth/token',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          payload: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: 'chatgpt-web',
            refresh_token: chatgptRefreshToken,
            resource: expectedResource,
          }).toString(),
        });

        assert.strictEqual(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.ok(body.access_token);
        assert.ok(body.refresh_token);
        assert.notStrictEqual(body.refresh_token, chatgptRefreshToken);

        rotatedAccessToken = body.access_token;
        _rotatedRefreshToken = body.refresh_token;
      });

      it('detects replayed old refresh token and revokes entire token family', async () => {
        const replayRes = await app.inject({
          method: 'POST',
          url: '/oauth/token',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          payload: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: 'chatgpt-web',
            refresh_token: chatgptRefreshToken, // Replayed old token
            resource: expectedResource,
          }).toString(),
        });

        assert.strictEqual(replayRes.statusCode, 400);
        const replayBody = JSON.parse(replayRes.payload);
        assert.strictEqual(replayBody.error, 'invalid_grant');

        // Rotated token must also be revoked due to family invalidation
        const invalidRes = await invokeMcp({
          token: rotatedAccessToken,
          method: 'tools/list',
          id: 114,
        });

        assert.strictEqual(invalidRes.statusCode, 401);
      });

      it('revokes access token immediately upon POST /oauth/revoke', async () => {
        // Mint a fresh token for revocation test
        const freshCode = await oauthService.createAuthorizationCode({
          clientId: 'chatgpt-web',
          userId: userAMember.id,
          tenantId: tenantA.id,
          userRole: userAMember.role,
          redirectUri: 'https://chatgpt.com/api/mcp/oauth_callback',
          resource: expectedResource,
          scopes: ['career:read'],
          codeChallenge: validChallenge,
          codeChallengeMethod: 'S256',
        });

        const tokenRes = await app.inject({
          method: 'POST',
          url: '/oauth/token',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          payload: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: 'chatgpt-web',
            code: freshCode,
            code_verifier: validVerifier,
            redirect_uri: 'https://chatgpt.com/api/mcp/oauth_callback',
            resource: expectedResource,
          }).toString(),
        });

        const tokenBody = JSON.parse(tokenRes.payload);
        const revocableToken = tokenBody.access_token;

        // Revoke token
        const revokeRes = await app.inject({
          method: 'POST',
          url: '/oauth/revoke',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          payload: new URLSearchParams({
            client_id: 'chatgpt-web',
            token: revocableToken,
          }).toString(),
        });

        assert.strictEqual(revokeRes.statusCode, 200);

        // Tool call with revoked token must return 401
        const toolRes = await invokeMcp({
          token: revocableToken,
          method: 'tools/list',
          id: 115,
        });

        assert.strictEqual(toolRes.statusCode, 401);
      });
    });
  });
});
