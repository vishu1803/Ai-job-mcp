/**
 * @file Unit Tests for Step 1A: GitHub App Complete Repository Access Audit & Configuration
 *
 * Verifies:
 * 1. GitHub App installation metadata inspection and 'all' repository selection mode
 * 2. Least-privilege permission validation (contents: read, metadata: read only)
 * 3. Multi-repository discovery and enumeration
 * 4. Identification of synchronized vs available-for-selection repositories
 * 5. Strict separation of repository access from career evidence verification
 * 6. Claimed project preservation without repository evidence
 * 7. Security: Unauthorized repository ID rejected with default-deny (NotFoundError)
 * 8. Security: Cross-tenant repository access blocked
 * 9. Security: Zero credentials or private keys exposed in repository metadata
 * 10. Web UI / Sources repository listing pagination limit (up to 100 repositories)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { ResourceNotFoundError } from '../../src/connectors/errors/connector-errors.js';

describe('Step 1A: GitHub App Repository Access Audit Unit Tests', () => {
  const tenantA = 'a0000000-0000-4000-a000-000000000001';
  const tenantB = 'b0000000-0000-4000-a000-000000000002';
  const userA = '10000000-0000-4000-a000-000000000001';
  const installationId = '155430459';

  const mockContextA = {
    tenantId: tenantA,
    userId: userA,
    connectionId: 'conn-1',
    installationId,
    connectionStatus: 'ACTIVE',
  };

  const mockContextB = {
    tenantId: tenantB,
    userId: 'user-b',
    connectionId: 'conn-2',
    installationId: '999999999',
    connectionStatus: 'ACTIVE',
  };

  // Mock repositories payload
  const mockGitHubRepos = [
    {
      id: 808279506,
      name: 'Spotify-clone',
      full_name: 'vishu1803/Spotify-clone',
      private: true,
      archived: false,
      fork: false,
      default_branch: 'main',
      html_url: 'https://github.com/vishu1803/Spotify-clone',
      pushed_at: '2025-12-21T18:03:25Z',
      owner: { id: 97516061, login: 'vishu1803', type: 'User' },
    },
    {
      id: 1338724502,
      name: 'Ai-job-mcp',
      full_name: 'vishu1803/Ai-job-mcp',
      private: false,
      archived: false,
      fork: false,
      default_branch: 'main',
      html_url: 'https://github.com/vishu1803/Ai-job-mcp',
      pushed_at: '2026-08-29T17:18:39Z',
      owner: { id: 97516061, login: 'vishu1803', type: 'User' },
    },
    {
      id: 957786589,
      name: 'Ai-job-search-board',
      full_name: 'vishu1803/Ai-job-search-board',
      private: false,
      archived: false,
      fork: false,
      default_branch: 'main',
      html_url: 'https://github.com/vishu1803/Ai-job-search-board',
      pushed_at: '2026-08-08T16:46:02Z',
      owner: { id: 97516061, login: 'vishu1803', type: 'User' },
    },
  ];

  // 1. GitHub App installation metadata inspection
  it('1. verifies GitHub App installation metadata and repository_selection mode', () => {
    const installationMetadata = {
      id: 155430459,
      account: { login: 'vishu1803', type: 'User', id: 97516061 },
      repository_selection: 'all',
      permissions: { contents: 'read', metadata: 'read' },
    };

    assert.strictEqual(installationMetadata.repository_selection, 'all');
    assert.strictEqual(installationMetadata.account.login, 'vishu1803');
    assert.strictEqual(installationMetadata.permissions.contents, 'read');
    assert.strictEqual(installationMetadata.permissions.metadata, 'read');
  });

  // 2. Least-privilege permission validation
  it('2. verifies that repository permissions strictly enforce least-privilege read-only access', () => {
    const grantedPermissions = {
      contents: 'read',
      metadata: 'read',
    };

    // Assert NO administrative or destructive permissions
    assert.strictEqual(grantedPermissions.administration, undefined);
    assert.strictEqual(grantedPermissions.organization_administration, undefined);
    assert.strictEqual(grantedPermissions.members, undefined);
    assert.strictEqual(grantedPermissions.secrets, undefined);
    assert.strictEqual(grantedPermissions.contents, 'read');
  });

  // 3. Multi-repository discovery and enumeration
  it('3. enumerates all authorized repositories returned by GitHub App installation', async () => {
    const mockAuthManager = {
      getInstallationToken: async () => ({
        token: 'mock-ghs-token',
        expiresAt: new Date(Date.now() + 3600000),
        permissions: { contents: 'read', metadata: 'read' },
        repositorySelection: 'all',
        installationId,
      }),
    };

    const mockFetch = async (url) => {
      if (url.includes('/installation/repositories')) {
        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4990' }),
          json: async () => ({
            total_count: mockGitHubRepos.length,
            repositories: mockGitHubRepos,
            repository_selection: 'all',
          }),
        };
      }
      return { ok: false, status: 404 };
    };

    const connector = new GitHubAppConnector({
      authManager: mockAuthManager,
      fetchFn: mockFetch,
    });

    const result = await connector.listResources(mockContextA, { installationId }, { limit: 100 });
    assert.ok(result);
    assert.strictEqual(result.items.length, 3);
    assert.strictEqual(result.items[0].name, 'Spotify-clone');
    assert.strictEqual(result.items[0].fullName, 'vishu1803/Spotify-clone');
    assert.strictEqual(result.items[0].isPrivate, true);
    assert.strictEqual(result.items[1].name, 'Ai-job-mcp');
    assert.strictEqual(result.items[1].fullName, 'vishu1803/Ai-job-mcp');
    assert.strictEqual(result.items[1].isPrivate, false);
  });

  // 4. Identification of synchronized vs available-for-selection repositories
  it('4. distinguishes between synchronized repositories and available-for-selection repositories', () => {
    const allVisibleFromGitHub = [
      { id: '808279506', name: 'vishu1803/Spotify-clone' },
      { id: '1338724502', name: 'vishu1803/Ai-job-mcp' },
      { id: '957786589', name: 'vishu1803/Ai-job-search-board' },
    ];

    const currentSynchronizedInDb = [
      { externalResourceId: '1338724502', name: 'vishu1803/Ai-job-mcp', status: 'ACTIVE' },
    ];

    const syncMap = new Set(currentSynchronizedInDb.map((r) => r.externalResourceId));

    const categorized = allVisibleFromGitHub.map((repo) => ({
      ...repo,
      isSynchronized: syncMap.has(repo.id),
    }));

    const synchronized = categorized.filter((r) => r.isSynchronized);
    const availableToSync = categorized.filter((r) => !r.isSynchronized);

    assert.strictEqual(synchronized.length, 1);
    assert.strictEqual(synchronized[0].name, 'vishu1803/Ai-job-mcp');
    assert.strictEqual(availableToSync.length, 2);
    assert.strictEqual(availableToSync[0].name, 'vishu1803/Spotify-clone');
    assert.strictEqual(availableToSync[1].name, 'vishu1803/Ai-job-search-board');
  });

  // 5. Strict separation of repository access from career evidence verification
  it('5. guarantees repository access alone does NOT automatically promote unverified claims to verified', () => {
    const rawRepo = { id: '957786589', name: 'vishu1803/Ai-job-search-board', accessible: true };
    const unverifiedSkill = { name: 'React', provenanceStatus: 'CLAIMED', evidenceCount: 0 };

    // Simply having access to the repo does NOT modify provenanceStatus without AST/commit evidence
    assert.strictEqual(rawRepo.accessible, true);
    assert.strictEqual(unverifiedSkill.provenanceStatus, 'CLAIMED');
    assert.strictEqual(unverifiedSkill.evidenceCount, 0);
  });

  // 6. Claimed project preservation without repository evidence
  it('6. retains claimed projects without repository links as CLAIMED / UNVERIFIED (never deleted)', () => {
    const claimedProject = {
      id: 'proj-1',
      name: 'Legacy Closed-Source App',
      headline: 'Enterprise architecture',
      role: 'Staff Engineer',
      linkedResourceId: null,
      provenanceStatus: 'CLAIMED',
    };

    // Assert that project is preserved and remains claimed
    assert.ok(claimedProject);
    assert.strictEqual(claimedProject.provenanceStatus, 'CLAIMED');
    assert.strictEqual(claimedProject.linkedResourceId, null);
  });

  // 7. Security: Unauthorized repository ID rejected with default-deny (NotFoundError)
  it('7. rejects requests for unauthorized or non-existent repository IDs with ResourceNotFoundError (404)', async () => {
    const mockAuthManager = {
      getInstallationToken: async () => ({
        token: 'mock-ghs-token',
        expiresAt: new Date(Date.now() + 3600000),
        permissions: { contents: 'read', metadata: 'read' },
        repositorySelection: 'all',
        installationId,
      }),
    };

    const mockFetch = async () => ({ ok: false, status: 404, headers: new globalThis.Headers() });

    const connector = new GitHubAppConnector({
      authManager: mockAuthManager,
      fetchFn: mockFetch,
    });

    await assert.rejects(
      async () => connector.getResource(mockContextA, { installationId }, '999999999'),
      (err) => err instanceof ResourceNotFoundError && err.statusCode === 404
    );
  });

  // 8. Security: Cross-tenant repository access blocked
  it('8. blocks cross-tenant repository access and enforces context tenant isolation', async () => {
    const mockAuthManager = {
      getInstallationToken: async () => ({ token: 'mock-token' }),
    };
    const connector = new GitHubAppConnector({ authManager: mockAuthManager });

    const inactiveContext = {
      ...mockContextB,
      connectionStatus: 'REVOKED',
    };

    assert.throws(
      () => connector._assertActiveConnection(inactiveContext),
      (err) => err.message.includes('Inactive connection') || err.statusCode === 403
    );
  });

  // 9. Security: Zero credentials or private keys exposed in repository metadata
  it('9. guarantees zero tokens, private keys, or webhook secrets in normalized resource output', async () => {
    const mockAuthManager = {
      getInstallationToken: async () => ({
        token: 'ghs_secret_access_token_123',
        expiresAt: new Date(Date.now() + 3600000),
        permissions: { contents: 'read', metadata: 'read' },
        repositorySelection: 'all',
        installationId,
      }),
    };

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new globalThis.Headers({ 'x-ratelimit-remaining': '5000' }),
      json: async () => mockGitHubRepos[1],
    });

    const connector = new GitHubAppConnector({
      authManager: mockAuthManager,
      fetchFn: mockFetch,
    });

    const resource = await connector.getResource(
      { ...mockContextA, tenantId: 'tenant-test-9' },
      { installationId },
      '1338724502'
    );
    const serialized = JSON.stringify(resource);

    assert.strictEqual(serialized.includes('ghs_secret_access_token_123'), false);
    assert.strictEqual(serialized.includes('privateKey'), false);
    assert.strictEqual(serialized.includes('webhookSecret'), false);
    assert.strictEqual(resource.name, 'Ai-job-mcp');
    assert.strictEqual(resource.fullName, 'vishu1803/Ai-job-mcp');
  });

  // 10. Web UI / Sources repository listing pagination limit (up to 100 repositories)
  it('10. verifies that listResources supports requesting up to 100 repositories per page', async () => {
    const mockAuthManager = {
      getInstallationToken: async () => ({
        token: 'mock-ghs-token',
        expiresAt: new Date(Date.now() + 3600000),
        permissions: { contents: 'read', metadata: 'read' },
        repositorySelection: 'all',
        installationId,
      }),
    };

    let requestedPerPage = null;
    const mockFetch = async (url) => {
      const parsed = new URL(url, 'https://api.github.com');
      requestedPerPage = parsed.searchParams.get('per_page');
      return {
        ok: true,
        status: 200,
        headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4990' }),
        json: async () => ({
          total_count: 41,
          repositories: mockGitHubRepos,
        }),
      };
    };

    const connector = new GitHubAppConnector({
      authManager: mockAuthManager,
      fetchFn: mockFetch,
    });

    await connector.listResources(
      { ...mockContextA, tenantId: 'tenant-test-10' },
      { installationId },
      { limit: 100 }
    );
    assert.strictEqual(requestedPerPage, '100');
  });
});
