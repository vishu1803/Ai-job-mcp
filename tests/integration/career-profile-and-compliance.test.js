/**
 * @file Integration Tests for Career Profile, MCP Protocol Completeness & Legal Surface (P14-004C).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { buildApp } from '../../src/app.js';

describe('Career Profile, MCP Completeness & Public Compliance (P14-004C)', () => {
  let app;
  const mockTenantId = 'aaaaaaaa-1111-2222-3333-444444444444';
  const mockCandidateId = 'bbbbbbbb-1111-2222-3333-444444444444';
  const mockUserId = 'cccccccc-1111-2222-3333-444444444444';

  const mockContext = {
    tenantId: mockTenantId,
    candidateId: mockCandidateId,
    userId: mockUserId,
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  before(async () => {
    // Instantiate Fastify app instance for route accessibility checks
    app = buildApp({ logger: false });
    await app.ready();
  });

  after(async () => {
    if (app) await app.close();
  });

  it('1. MCP Protocol Completeness: verifies 26 tools, resources, and prompts', () => {
    const server = createCareerMcpServer();

    // 26 registered tools
    const tools = server.getRegisteredTools();
    assert.equal(tools.length, 26);

    // Resources
    const resources = server.getRegisteredResources();
    const uris = resources.map((r) => r.uri);
    assert.ok(uris.includes('career://profile'), 'Must expose career://profile');
    assert.ok(uris.includes('career://skills'), 'Must expose career://skills');
    assert.ok(uris.includes('career://connections'), 'Must expose career://connections');

    // Prompts
    const prompts = server.getRegisteredPrompts();
    const promptNames = prompts.map((p) => p.name);
    assert.ok(promptNames.includes('find_matching_jobs'));
    assert.ok(promptNames.includes('review_resume'));
    assert.ok(promptNames.includes('prepare_application'));
    assert.ok(promptNames.includes('explain_skill_gap'));
  });

  it('2. MCP Resources: reads career://profile resource cleanly', async () => {
    const mockProfileService = {
      getCareerProfile: async (_ctx, candidateId) => ({
        candidateId,
        tenantId: mockTenantId,
        displayName: 'John Doe',
        headline: 'Senior Cloud Engineer',
        currentRole: 'Cloud Engineer',
        jobPreferences: {
          targetRoles: ['Staff Cloud Engineer'],
          remotePreference: 'REMOTE_ONLY',
          salaryFloor: 180000,
          salaryCurrency: 'USD',
          employmentTypes: ['FULL_TIME'],
          workAuthorization: ['United States'],
          visaSponsorshipRequired: false,
          relocationPreference: 'REMOTE_ONLY',
          industries: [],
          companiesToAvoid: [],
          companiesToPrioritize: [],
          preferredTechStack: ['Kubernetes', 'Go'],
          preferredLocations: ['Remote'],
          metadata: {},
        },
        verifiedSkillsSummary: ['Kubernetes', 'Go', 'Docker'],
        portfolioLinks: [],
      }),
      listCandidates: async () => ({ candidates: [{ id: mockCandidateId }] }),
    };

    const server = createCareerMcpServer({
      deps: { profileService: mockProfileService },
    });

    const resourceEntry = server.registeredResources.get('career://profile');
    assert.ok(resourceEntry);

    const result = await resourceEntry.handler(mockContext, 'career://profile');
    assert.ok(result);
    assert.equal(result.displayName, 'John Doe');
    assert.equal(result.jobPreferences.salaryFloor, 180000);
  });

  it('3. MCP Prompts: generates structured prompt messages for find_matching_jobs', async () => {
    const server = createCareerMcpServer();
    const promptEntry = server.registeredPrompts.get('find_matching_jobs');
    assert.ok(promptEntry);

    const result = await promptEntry.handler(mockContext, {
      query: 'Staff Distributed Systems',
      remoteOnly: 'true',
    });

    assert.ok(result.messages);
    assert.equal(result.messages.length, 1);
    assert.ok(result.messages[0].content.text.includes('get_career_profile'));
    assert.ok(result.messages[0].content.text.includes('Staff Distributed Systems'));
  });

  it('4. Search Jobs: merges saved profile preferences when query parameters are omitted', async () => {
    const jobDiscoveryService = new JobDiscoveryService();

    const savedPreferences = {
      targetRoles: ['Staff Cloud'],
      preferredLocations: ['New York'],
      remotePreference: 'REMOTE_ONLY',
      salaryFloor: 200000,
      preferredTechStack: ['Kubernetes'],
    };

    // User calls searchJobs without explicit query
    const results = await jobDiscoveryService.searchJobs({}, savedPreferences);
    assert.ok(results.jobs.length > 0);
    // Should match Datadog Staff Cloud Telemetry role
    const matched = results.jobs.find((j) => j.company === 'Datadog');
    assert.ok(matched, 'Should match Datadog job based on merged preferences');
  });

  it('5. Public Legal Routes: validates 200 OK responses for all compliance endpoints', async () => {
    const routes = [
      '/privacy',
      '/cookies',
      '/terms',
      '/security',
      '/data-deletion',
      '/accessibility',
      '/subprocessors',
    ];

    for (const route of routes) {
      const res = await app.inject({
        method: 'GET',
        url: route,
        headers: { accept: 'text/html' },
      });

      assert.equal(res.statusCode, 200, `Route ${route} must return 200 OK`);
      assert.ok(res.body.includes('AI Careers Hub'), `Route ${route} must include brand header`);
      assert.ok(
        res.body.includes('Privacy & Legal'),
        `Route ${route} must include universal legal footer`
      );
    }
  });

  it('6. Career Profile Route: redirects unauthenticated users to /login?returnTo=/profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/profile',
    });

    assert.equal(res.statusCode, 302);
    assert.equal(res.headers.location, '/login?returnTo=/profile');
  });
});
