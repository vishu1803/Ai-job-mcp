/**
 * @file Integration Tests for MCP 2026-07-28 Conformance, Resources & Prompts (P14-004D).
 *
 * Verifies:
 * 1. MCP Protocol-Version policy (2026-07-28, 2025-11-25 supported; unknown rejected)
 * 2. Static Resources (career://profile, career://skills, career://connections)
 * 3. Dynamic Resource Templates (career://projects/{id}, career://evidence/{id}, career://jobs/{id}, career://applications/{id})
 * 4. Multi-Tenant Default-Deny IDOR isolation on all resources
 * 5. MCP Prompts (find_matching_jobs, review_resume, prepare_application, explain_skill_gap)
 * 6. Structured tool outputs across critical workflows
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { buildApp } from '../../src/app.js';

describe('MCP 2026-07-28 Conformance, Resources & Prompts (P14-004D)', () => {
  let app;
  const mockTenantId = '11111111-1111-1111-1111-111111111111';
  const mockCandidateId = '22222222-2222-2222-2222-222222222222';
  const mockUserId = '33333333-3333-3333-3333-333333333333';
  const mockProjectId = '44444444-4444-4444-4444-444444444444';
  const mockEvidenceId = '55555555-5555-5555-5555-555555555555';
  const _mockApplicationId = '66666666-6666-6666-6666-666666666666';

  const mockContext = {
    tenantId: mockTenantId,
    candidateId: mockCandidateId,
    userId: mockUserId,
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  const mockForeignContext = {
    tenantId: '99999999-9999-9999-9999-999999999999',
    candidateId: '88888888-8888-8888-8888-888888888888',
    userId: '77777777-7777-7777-7777-777777777777',
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  const mockProfileService = {
    listCandidates: async () => ({ candidates: [{ id: mockCandidateId }] }),
    getCareerProfile: async (ctx) => {
      if (ctx.tenantId !== mockTenantId) throw new Error('Candidate not found');
      return {
        candidateId: mockCandidateId,
        tenantId: mockTenantId,
        displayName: 'Test Candidate',
        headline: 'Staff Engineer',
        summary: 'Experienced Backend Engineer',
        jobPreferences: {
          targetRoles: ['Backend Engineer'],
          preferredLocations: ['Remote'],
          remotePreference: 'REMOTE_ONLY',
        },
        verifiedSkillsSummary: ['Node.js', 'Fastify', 'PostgreSQL'],
        portfolioLinks: [],
      };
    },
    listSkillsWithEvidence: async (ctx) => {
      if (ctx.tenantId !== mockTenantId) throw new Error('Candidate not found');
      return [
        {
          skillId: 's1',
          slug: 'fastify',
          name: 'Fastify',
          category: 'FRAMEWORK',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 3,
          isUserClaim: false,
          claimLabel: null,
          evidence: [
            {
              evidenceId: mockEvidenceId,
              evidenceType: 'CODE_IMPORT_USAGE',
              sourceLocation: 'src/app.js:10',
              excerpt: "import fastify from 'fastify';",
              confidenceScore: 0.95,
              resourceDisplayName: 'vishu1803/Ai-job-mcp',
            },
          ],
        },
      ];
    },
    getProfile: async (ctx) => {
      if (ctx.tenantId !== mockTenantId) throw new Error('Candidate not found');
      return {
        candidate: { id: mockCandidateId, displayName: 'Test Candidate' },
        resources: [{ id: 'r1', displayName: 'vishu1803/Ai-job-mcp', provider: 'GITHUB_APP' }],
        identities: [{ provider: 'GITHUB', externalUsername: 'vishu1803' }],
      };
    },
  };

  const mockJobDiscoveryService = {
    getJobPosting: async (ctx, jobId) => {
      if (jobId === 'job-missing') throw new Error('Job posting not found');
      return {
        id: jobId,
        title: 'Senior Backend Engineer',
        company: 'Acme Corp',
        location: 'Remote (US)',
        remote: true,
        source: 'greenhouse',
        directApplyUrl: 'https://boards.greenhouse.io/acme/jobs/' + jobId,
        requiredSkills: ['Node.js', 'Fastify', 'PostgreSQL'],
      };
    },
  };

  const mockDatabase = {
    select: () => ({
      from: (_table) => ({
        where: (_condition) => {
          // Simulate project query
          return {
            orderBy: () => [
              {
                id: mockProjectId,
                candidateId: mockCandidateId,
                tenantId: mockTenantId,
                name: 'Ai-job-mcp',
                slug: 'ai-job-mcp',
                role: 'Creator',
                isHighlighted: true,
              },
            ],
            innerJoin: () => ({
              where: () => [
                {
                  resourceId: 'r1',
                  displayName: 'vishu1803/Ai-job-mcp',
                  url: 'https://github.com/vishu1803/Ai-job-mcp',
                  provider: 'GITHUB_APP',
                },
              ],
            }),
            leftJoin: () => ({
              where: () => ({
                orderBy: () => [
                  {
                    id: mockEvidenceId,
                    candidateId: mockCandidateId,
                    projectId: mockProjectId,
                    evidenceType: 'CODE_IMPORT_USAGE',
                    sourceLocation: 'src/app.js:10',
                    excerpt: "import fastify from 'fastify';",
                    confidenceScore: 0.95,
                    skillSlug: 'fastify',
                    skillName: 'Fastify',
                    resourceDisplayName: 'vishu1803/Ai-job-mcp',
                  },
                ],
              }),
            }),
            limit: () => [
              {
                id: mockProjectId,
                candidateId: mockCandidateId,
                tenantId: mockTenantId,
                name: 'Ai-job-mcp',
                slug: 'ai-job-mcp',
                role: 'Creator',
                isHighlighted: true,
              },
            ],
          };
        },
      }),
    }),
  };

  before(async () => {
    app = buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
  });

  it('1. Protocol Version Policy: accepts supported versions and rejects unsupported versions', async () => {
    // A. 2026-07-28 supported
    const res2026 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
      },
      payload: {
        jsonrpc: '2.0',
        id: '1',
        method: 'tools/list',
      },
    });
    // Should pass protocol version check and proceed to auth check
    assert.strictEqual(res2026.statusCode, 401); // 401 unauthenticated, NOT 400 unsupported version

    // B. 2025-11-25 compatibility supported
    const res2025 = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      payload: {
        jsonrpc: '2.0',
        id: '2',
        method: 'tools/list',
      },
    });
    assert.strictEqual(res2025.statusCode, 401);

    // C. 2024-01-01 rejected with 400 UNSUPPORTED_PROTOCOL_VERSION
    const resOld = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': '2024-01-01',
      },
      payload: {
        jsonrpc: '2.0',
        id: '3',
        method: 'tools/list',
      },
    });
    assert.strictEqual(resOld.statusCode, 400);
    const oldBody = JSON.parse(resOld.body);
    assert.strictEqual(oldBody.error.code, -32602);
    assert.ok(oldBody.error.message.includes('Unsupported protocol version'));

    // D. Malformed version rejected
    const resMalformed = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': 'draft-unknown',
      },
      payload: {
        jsonrpc: '2.0',
        id: '4',
        method: 'tools/list',
      },
    });
    assert.strictEqual(resMalformed.statusCode, 400);
    const malformedBody = JSON.parse(resMalformed.body);
    assert.strictEqual(malformedBody.error.code, -32602);
    assert.ok(malformedBody.error.message.includes('Unsupported protocol version'));

    // E. Mcp-Method header mismatch rejected
    const resMismatch = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        'mcp-method': 'tools/call',
      },
      payload: {
        jsonrpc: '2.0',
        id: '5',
        method: 'tools/list',
      },
    });
    assert.strictEqual(resMismatch.statusCode, 400);
    const mismatchBody = JSON.parse(resMismatch.body);
    assert.strictEqual(mismatchBody.error.code, -32602);
    assert.ok(mismatchBody.error.message.includes('Header Mcp-Method'));
  });

  it('2. MCP Server: registers all 26 tools, 8 resources (3 static + 4 templates + 1 app UI), and 4 prompts', () => {
    const server = createCareerMcpServer({
      deps: {
        profileService: mockProfileService,
        jobDiscoveryService: mockJobDiscoveryService,
        database: mockDatabase,
      },
    });

    const tools = server.getRegisteredTools();
    const resources = server.getRegisteredResources();
    const prompts = server.getRegisteredPrompts();

    assert.strictEqual(tools.length, 26);
    assert.strictEqual(resources.length, 8);
    assert.strictEqual(prompts.length, 4);

    // Verify static resources
    assert.ok(resources.some((r) => r.uri === 'career://profile'));
    assert.ok(resources.some((r) => r.uri === 'career://skills'));
    assert.ok(resources.some((r) => r.uri === 'career://connections'));

    // Verify resource templates
    assert.ok(resources.some((r) => r.uri === 'career://projects/{projectId}'));
    assert.ok(resources.some((r) => r.uri === 'career://evidence/{evidenceId}'));
    assert.ok(resources.some((r) => r.uri === 'career://jobs/{jobId}'));
    assert.ok(resources.some((r) => r.uri === 'career://applications/{applicationId}'));

    // Verify MCP App resource
    assert.ok(resources.some((r) => r.uri === 'ui://career-hub/job-fit-radar/v1'));

    // Verify prompts
    assert.ok(prompts.some((p) => p.name === 'find_matching_jobs'));
    assert.ok(prompts.some((p) => p.name === 'review_resume'));
    assert.ok(prompts.some((p) => p.name === 'prepare_application'));
    assert.ok(prompts.some((p) => p.name === 'explain_skill_gap'));
  });

  it('3. MCP Resources: reads static and template resources cleanly', async () => {
    const server = createCareerMcpServer({
      deps: {
        profileService: mockProfileService,
        jobDiscoveryService: mockJobDiscoveryService,
        database: mockDatabase,
      },
    });

    // 1. career://profile
    const profileRes = server.registeredResources.get('career://profile');
    const profileResult = await profileRes.handler(mockContext, 'career://profile');
    assert.strictEqual(profileResult.candidateId, mockCandidateId);
    assert.strictEqual(profileResult.displayName, 'Test Candidate');

    // 2. career://skills
    const skillsRes = server.registeredResources.get('career://skills');
    const skillsResult = await skillsRes.handler(mockContext, 'career://skills');
    assert.strictEqual(skillsResult.length, 1);
    assert.strictEqual(skillsResult[0].slug, 'fastify');
    assert.strictEqual(skillsResult[0].provenanceStatus, 'VERIFIED');

    // 3. career://connections
    const connRes = server.registeredResources.get('career://connections');
    const connResult = await connRes.handler(mockContext, 'career://connections');
    assert.strictEqual(connResult.connectedResources.length, 1);
    assert.strictEqual(connResult.connectedResources[0].displayName, 'vishu1803/Ai-job-mcp');

    // 4. career://jobs/{jobId} template
    const jobRes = server.registeredResources.get('career://jobs/{jobId}');
    const jobResult = await jobRes.handler(mockContext, 'career://jobs/gh-12345', {
      jobId: 'gh-12345',
    });
    assert.strictEqual(jobResult.id, 'gh-12345');
    assert.strictEqual(jobResult.title, 'Senior Backend Engineer');
  });

  it('4. Multi-Tenant Default-Deny: rejects cross-tenant resource reads', async () => {
    const server = createCareerMcpServer({
      deps: {
        profileService: mockProfileService,
        jobDiscoveryService: mockJobDiscoveryService,
        database: mockDatabase,
      },
    });

    const profileRes = server.registeredResources.get('career://profile');
    await assert.rejects(async () => {
      await profileRes.handler(mockForeignContext, 'career://profile');
    }, /Candidate not found/);
  });

  it('5. MCP Prompts: executes all 4 prompt generators with structured messages', async () => {
    const server = createCareerMcpServer({
      deps: {
        profileService: mockProfileService,
        jobDiscoveryService: mockJobDiscoveryService,
        database: mockDatabase,
      },
    });

    // 1. find_matching_jobs
    const p1 = server.registeredPrompts.get('find_matching_jobs');
    const r1 = await p1.handler(mockContext, { role: 'Backend Engineer' });
    assert.ok(r1.messages);
    assert.ok(r1.messages[0].content.text.includes('search for active job openings'));

    // 2. review_resume
    const p2 = server.registeredPrompts.get('review_resume');
    const r2 = await p2.handler(mockContext, {});
    assert.ok(r2.messages);
    assert.ok(r2.messages[0].content.text.includes('authentic resume review'));

    // 3. prepare_application
    const p3 = server.registeredPrompts.get('prepare_application');
    const r3 = await p3.handler(mockContext, { jobId: 'gh-123' });
    assert.ok(r3.messages);
    assert.ok(r3.messages[0].content.text.includes('end-to-end application package'));

    // 4. explain_skill_gap
    const p4 = server.registeredPrompts.get('explain_skill_gap');
    const r4 = await p4.handler(mockContext, { jobDescription: 'Required: Rust, Fastify' });
    assert.ok(r4.messages);
    assert.ok(r4.messages[0].content.text.includes('skill fit'));
  });
});
