/**
 * @file Unit Tests for MCP Career Profile Tools (P14-004C).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerMcpServer } from '../../src/mcp/server.js';

describe('MCP Career Profile Tools (P14-004C)', () => {
  const mockTenantId = '11111111-1111-1111-1111-111111111111';
  const mockCandidateId = '22222222-2222-2222-2222-222222222222';
  const mockUserId = '33333333-3333-3333-3333-333333333333';

  const mockContext = {
    tenantId: mockTenantId,
    candidateId: mockCandidateId,
    userId: mockUserId,
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  it('1. registers get_career_profile and update_career_preferences on createCareerMcpServer', () => {
    const server = createCareerMcpServer();
    const tools = server.getRegisteredTools();

    assert.equal(tools.length, 26);
    const getProfileTool = tools.find((t) => t.name === 'get_career_profile');
    const updatePrefTool = tools.find((t) => t.name === 'update_career_preferences');

    assert.ok(getProfileTool);
    assert.equal(getProfileTool.requiredRole, 'READONLY');
    assert.deepEqual(getProfileTool.requiredScopes, ['career:read']);

    assert.ok(updatePrefTool);
    assert.equal(updatePrefTool.requiredRole, 'MEMBER');
    assert.deepEqual(updatePrefTool.requiredScopes, ['career:write']);
  });

  it('2. executes get_career_profile with mock service dependency', async () => {
    const mockProfileService = {
      getCareerProfile: async (_ctx, candidateId) => ({
        candidateId,
        tenantId: mockTenantId,
        displayName: 'Test Candidate',
        headline: 'Software Engineer',
        currentRole: 'Backend Engineer',
        jobPreferences: {
          targetRoles: ['Backend Engineer'],
          remotePreference: 'REMOTE_ONLY',
          salaryFloor: 150000,
          salaryCurrency: 'USD',
          employmentTypes: ['FULL_TIME'],
          workAuthorization: ['United States'],
          visaSponsorshipRequired: false,
          relocationPreference: 'REMOTE_ONLY',
          industries: [],
          companiesToAvoid: [],
          companiesToPrioritize: [],
          preferredTechStack: ['Node.js', 'PostgreSQL'],
          preferredLocations: ['Remote'],
          metadata: {},
        },
        verifiedSkillsSummary: ['Node.js', 'PostgreSQL'],
        portfolioLinks: [],
      }),
      listCandidates: async () => ({ candidates: [{ id: mockCandidateId }] }),
    };

    const server = createCareerMcpServer({
      deps: { profileService: mockProfileService },
    });

    const handler = server.registeredTools.get('get_career_profile').handler;
    const result = await handler(mockContext, {});

    assert.ok(result.profile);
    assert.equal(result.profile.displayName, 'Test Candidate');
    assert.equal(result.profile.jobPreferences.salaryFloor, 150000);
    assert.deepEqual(result.profile.verifiedSkillsSummary, ['Node.js', 'PostgreSQL']);
  });

  it('3. executes update_career_preferences with validated payload', async () => {
    let capturedUpdate = null;
    const mockProfileService = {
      updateCareerPreferences: async (_ctx, _candidateId, update) => {
        capturedUpdate = update;
        return {
          ...update,
          salaryCurrency: 'USD',
          employmentTypes: ['FULL_TIME'],
          visaSponsorshipRequired: false,
          relocationPreference: 'REMOTE_ONLY',
          industries: [],
          companiesToAvoid: [],
          companiesToPrioritize: [],
          preferredLocations: [],
          workAuthorization: [],
          metadata: {},
        };
      },
      listCandidates: async () => ({ candidates: [{ id: mockCandidateId }] }),
    };

    const server = createCareerMcpServer({
      deps: { profileService: mockProfileService },
    });

    const handler = server.registeredTools.get('update_career_preferences').handler;
    const result = await handler(mockContext, {
      targetRoles: ['Staff Engineer'],
      remotePreference: 'REMOTE_ONLY',
      salaryFloor: 200000,
      preferredTechStack: ['Node.js', 'Fastify'],
    });

    assert.ok(result.preferences);
    assert.equal(result.message, 'Career preferences updated successfully.');
    assert.equal(capturedUpdate.salaryFloor, 200000);
    assert.deepEqual(capturedUpdate.targetRoles, ['Staff Engineer']);
  });
});
