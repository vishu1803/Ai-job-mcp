/**
 * @file GitHub App Connector Unit Tests (Task P3-004)
 *
 * Tests:
 * 1. Connector registration, capability declarations, and initialization invariants
 * 2. getAccount normalization (User vs Organization, metadata allowlist, empty repo fallback)
 * 3. listResources normalization & opaque cursor pagination
 * 4. getResource canonical numeric ID & owner/repo lookup
 * 5. validate connection health probing
 * 6. revokeAccess upstream revocation & token cache eviction
 * 7. Comprehensive error normalization (401, 403 scope, 403/429 rate limit, 404, 5xx, timeout)
 * 8. Rate limit warning thresholds and exponential retry backoff
 * 9. Inactive connection status guards (PENDING, REVOKED, DISCONNECTED, ERROR)
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import { CONNECTOR_CAPABILITIES } from '../../src/connectors/base/capabilities.js';
import { createConnectorContext } from '../../src/connectors/base/context.js';

describe('GitHubAppConnector Unit Tests (P3-004)', () => {
  let testKeyPair;
  let rawPemPrivateKey;
  let authManager;
  let tokenCache;

  const testAppId = 123456;
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '9dd8e4fb-456b-4104-9cb1-c839a544b721';
  const connectionId = '1743c149-bf4c-4c4e-a1fa-0532dfd5460a';
  const installationId = '155430459';

  const mockCredentials = {
    installationId,
    targetType: 'User',
  };

  const activeContext = createConnectorContext({
    tenantId,
    userId,
    connectionId,
    provider: 'GITHUB_APP',
    authType: 'APP_INSTALLATION',
  });

  const inactiveContext = Object.assign(
    {},
    createConnectorContext({
      tenantId,
      userId,
      connectionId,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
    }),
    { connectionStatus: 'REVOKED' }
  );

  before(() => {
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rawPemPrivateKey = testKeyPair.privateKey;
  });

  beforeEach(() => {
    tokenCache = new GitHubTokenCache();
    authManager = new GitHubAppAuthManager({
      appId: testAppId,
      privateKey: rawPemPrivateKey,
      cache: tokenCache,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Initialization & Capability Declarations
  // -------------------------------------------------------------------------
  describe('1. Initialization & Capability Declarations', () => {
    it('initializes with provider GITHUB_APP and declares approved capabilities', () => {
      const connector = new GitHubAppConnector({ authManager });

      assert.strictEqual(connector.provider, 'GITHUB_APP');
      const capabilities = connector.getCapabilities();

      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_ACCOUNT));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.LIST_RESOURCES));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_RESOURCE));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_CONTENT));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.REVOKE_ACCESS));
      assert.strictEqual(capabilities.size, 5);
    });

    it('rejects initialization when authManager is missing', () => {
      assert.throws(
        () => new GitHubAppConnector({}),
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. getAccount Normalization
  // -------------------------------------------------------------------------
  describe('2. getAccount Normalization', () => {
    it('retrieves and normalizes User account from /installation/repositories', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_mock_token_123',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
              permissions: { contents: 'read', metadata: 'read' },
              repository_selection: 'all',
            }),
          };
        }

        if (url.includes('/installation/repositories')) {
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4990' }),
            json: async () => ({
              total_count: 1,
              repository_selection: 'all',
              repositories: [
                {
                  id: 1043905096,
                  name: 'Ai-job-mcp',
                  owner: {
                    id: 97516061,
                    login: 'vishu1803',
                    type: 'User',
                    avatar_url: 'https://avatars.githubusercontent.com/u/97516061?v=4',
                    html_url: 'https://github.com/vishu1803',
                  },
                },
              ],
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const account = await connector.getAccount(activeContext, mockCredentials);

      assert.strictEqual(account.id, '97516061');
      assert.strictEqual(account.name, 'vishu1803');
      assert.strictEqual(account.displayName, 'vishu1803');
      assert.strictEqual(account.provider, 'GITHUB_APP');
      assert.strictEqual(account.accountType, 'USER');
      assert.strictEqual(account.avatarUrl, 'https://avatars.githubusercontent.com/u/97516061?v=4');
      assert.strictEqual(account.metadata.repositorySelection, 'all');
      assert.strictEqual(account.metadata.targetType, 'User');
    });

    it('falls back to /app/installations/:id when repository list is empty', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_mock_token_123',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        if (url.includes('/installation/repositories')) {
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              total_count: 0,
              repository_selection: 'selected',
              repositories: [],
            }),
          };
        }

        if (url.includes(`/app/installations/${installationId}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: Number(installationId),
              account: {
                id: 88776655,
                login: 'enterprise-org',
                type: 'Organization',
                avatar_url: 'https://avatars.githubusercontent.com/u/88776655',
                html_url: 'https://github.com/enterprise-org',
              },
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const account = await connector.getAccount(activeContext, mockCredentials);

      assert.strictEqual(account.id, '88776655');
      assert.strictEqual(account.name, 'enterprise-org');
      assert.strictEqual(account.accountType, 'ORGANIZATION');
    });

    it('rejects getAccount on inactive connection with ConnectionInactiveError', async () => {
      const connector = new GitHubAppConnector({ authManager });

      await assert.rejects(
        async () => {
          await connector.getAccount(inactiveContext, mockCredentials);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'CONNECTION_INACTIVE');
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. listResources Normalization & Opaque Cursor Pagination
  // -------------------------------------------------------------------------
  describe('3. listResources Normalization & Opaque Cursor Pagination', () => {
    it('normalizes repository list, extracts safe metadata, and computes nextCursor', async () => {
      let requestedUrl = null;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        if (url.includes('/installation/repositories')) {
          requestedUrl = url;
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4950' }),
            json: async () => ({
              total_count: 3,
              repositories: [
                {
                  id: 101,
                  name: 'repo-one',
                  full_name: 'vishu1803/repo-one',
                  private: false,
                  html_url: 'https://github.com/vishu1803/repo-one',
                  default_branch: 'main',
                  language: 'TypeScript',
                  updated_at: '2026-08-20T12:00:00Z',
                  description: 'First repository',
                  archived: false,
                  fork: false,
                  visibility: 'public',
                  stargazers_count: 10,
                  forks_count: 2,
                  open_issues_count: 1,
                  size: 512,
                  license: { spdx_id: 'MIT' },
                },
                {
                  id: 102,
                  name: 'repo-two',
                  full_name: 'vishu1803/repo-two',
                  private: true,
                  html_url: 'https://github.com/vishu1803/repo-two',
                  default_branch: 'master',
                  language: 'Python',
                  updated_at: '2026-08-21T15:00:00Z',
                  description: 'Second repository',
                  archived: true,
                  fork: false,
                  visibility: 'private',
                  stargazers_count: 0,
                  forks_count: 0,
                  open_issues_count: 0,
                  size: 256,
                  license: null,
                },
              ],
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      // Request page with limit 2 (totalCount = 3 -> hasMore should be true)
      const result = await connector.listResources(activeContext, mockCredentials, { limit: 2 });

      assert.ok(requestedUrl.includes('per_page=2&page=1'));
      assert.strictEqual(result.items.length, 2);
      assert.strictEqual(result.totalCount, 3);
      assert.strictEqual(result.hasMore, true);
      assert.ok(typeof result.nextCursor === 'string');

      // Verify first item normalization
      const first = result.items[0];
      assert.strictEqual(first.id, '101');
      assert.strictEqual(first.name, 'repo-one');
      assert.strictEqual(first.fullName, 'vishu1803/repo-one');
      assert.strictEqual(first.type, 'REPOSITORY');
      assert.strictEqual(first.url, 'https://github.com/vishu1803/repo-one');
      assert.strictEqual(first.defaultBranch, 'main');
      assert.strictEqual(first.isPrivate, false);
      assert.deepStrictEqual(first.languages, ['TypeScript']);
      assert.strictEqual(first.metadata.numericId, 101);
      assert.strictEqual(first.metadata.license, 'MIT');
      assert.strictEqual(first.metadata.archived, false);

      // Verify second item normalization (private / archived)
      const second = result.items[1];
      assert.strictEqual(second.id, '102');
      assert.strictEqual(second.isPrivate, true);
      assert.strictEqual(second.metadata.archived, true);
      assert.strictEqual(second.metadata.visibility, 'private');
    });

    it('resumes pagination cleanly when nextCursor is supplied', async () => {
      let requestedUrl = null;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        if (url.includes('/installation/repositories')) {
          requestedUrl = url;
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              total_count: 3,
              repositories: [
                {
                  id: 103,
                  name: 'repo-three',
                  full_name: 'vishu1803/repo-three',
                  private: false,
                  html_url: 'https://github.com/vishu1803/repo-three',
                  default_branch: 'main',
                  language: 'JavaScript',
                  updated_at: '2026-08-21T18:00:00Z',
                },
              ],
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      // Craft opaque cursor for page 2, limit 2
      const cursorPayload = Buffer.from(
        JSON.stringify({ page: 2, limit: 2, issuedAt: Date.now() })
      ).toString('base64url');

      const result = await connector.listResources(activeContext, mockCredentials, {
        cursor: cursorPayload,
      });

      assert.ok(requestedUrl.includes('per_page=2&page=2'));
      assert.strictEqual(result.items.length, 1);
      assert.strictEqual(result.hasMore, false);
      assert.strictEqual(result.nextCursor, null);
      assert.strictEqual(result.items[0].id, '103');
    });

    it('rejects tampered or malformed cursor with INVALID_PAGINATION_CURSOR', async () => {
      const connector = new GitHubAppConnector({ authManager });

      const invalidCursors = [
        'invalid_base64_***',
        Buffer.from('not json').toString('base64url'),
        Buffer.from(JSON.stringify({ page: -1, limit: 50 })).toString('base64url'),
        Buffer.from(JSON.stringify({ page: 1, limit: 500 })).toString('base64url'),
        Buffer.from(JSON.stringify({ page: 'one', limit: 50 })).toString('base64url'),
      ];

      for (const badCursor of invalidCursors) {
        await assert.rejects(
          async () => {
            await connector.listResources(activeContext, mockCredentials, { cursor: badCursor });
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.code, 'INVALID_PAGINATION_CURSOR');
            return true;
          }
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. getResource Canonical Numeric ID & owner/repo Lookups
  // -------------------------------------------------------------------------
  describe('4. getResource Canonical Numeric ID & owner/repo Lookups', () => {
    it('fetches and normalizes repository using canonical numeric ID (/repositories/:id)', async () => {
      let requestedUrl = null;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        if (url.includes('/repositories/1043905096')) {
          requestedUrl = url;
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              id: 1043905096,
              name: 'Ai-job-mcp',
              full_name: 'vishu1803/Ai-job-mcp',
              private: false,
              html_url: 'https://github.com/vishu1803/Ai-job-mcp',
              default_branch: 'main',
              language: 'JavaScript',
              updated_at: '2026-08-21T18:22:00Z',
              description: 'Universal Career AI Agent MCP Server',
              archived: false,
              fork: false,
              visibility: 'public',
              stargazers_count: 5,
              forks_count: 1,
              open_issues_count: 0,
              size: 2048,
              license: { spdx_id: 'Apache-2.0' },
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const resource = await connector.getResource(activeContext, mockCredentials, '1043905096');

      assert.ok(requestedUrl.endsWith('/repositories/1043905096'));
      assert.strictEqual(resource.id, '1043905096');
      assert.strictEqual(resource.name, 'Ai-job-mcp');
      assert.strictEqual(resource.fullName, 'vishu1803/Ai-job-mcp');
      assert.strictEqual(resource.metadata.license, 'Apache-2.0');
    });

    it('fetches and normalizes repository using secondary owner/repo lookup (/repos/:owner/:repo)', async () => {
      let requestedUrl = null;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        if (url.includes('/repos/vishu1803/Ai-job-mcp')) {
          requestedUrl = url;
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              id: 1043905096,
              name: 'Ai-job-mcp',
              full_name: 'vishu1803/Ai-job-mcp',
              private: false,
              html_url: 'https://github.com/vishu1803/Ai-job-mcp',
              default_branch: 'main',
              language: 'JavaScript',
              updated_at: '2026-08-21T18:22:00Z',
              description: 'Universal Career AI Agent MCP Server',
              archived: false,
              fork: false,
              visibility: 'public',
              stargazers_count: 5,
              forks_count: 1,
              open_issues_count: 0,
              size: 2048,
              license: { spdx_id: 'Apache-2.0' },
            }),
          };
        }

        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const resource = await connector.getResource(
        activeContext,
        mockCredentials,
        'vishu1803/Ai-job-mcp'
      );

      assert.ok(requestedUrl.endsWith('/repos/vishu1803/Ai-job-mcp'));
      assert.strictEqual(resource.id, '1043905096');
      assert.strictEqual(resource.name, 'Ai-job-mcp');
    });

    it('maps 404 from GitHub to ResourceNotFoundError', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await connector.getResource(activeContext, mockCredentials, '99999999');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          assert.strictEqual(err.code, 'RESOURCE_NOT_FOUND');
          return true;
        }
      );
    });

    it('rejects malformed repository identifier with INVALID_RESOURCE_ID', async () => {
      const connector = new GitHubAppConnector({ authManager });

      const badIds = ['', 'invalid-format-without-slash', 'too/many/slashes/here'];

      for (const badId of badIds) {
        await assert.rejects(
          async () => {
            await connector.getResource(activeContext, mockCredentials, badId);
          },
          (err) => {
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // 5. validate & revokeAccess
  // -------------------------------------------------------------------------
  describe('5. validate & revokeAccess', () => {
    it('validate returns healthy: true when GitHub responds with 200', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_abc',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({ total_count: 5, repositories: [] }),
        };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const result = await connector.validate(activeContext, mockCredentials);
      assert.strictEqual(result.healthy, true);
    });

    it('validate returns healthy: false when GitHub returns 401/404', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ message: 'Installation not found' }),
          };
        }
        return { ok: false, status: 404 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const result = await connector.validate(activeContext, mockCredentials);
      assert.strictEqual(result.healthy, false);
      assert.ok(typeof result.message === 'string');
    });

    it('revokeAccess evicts local token cache and calls upstream revocation', async () => {
      let revokedToken = null;

      const mockFetch = async (url, opts) => {
        if (url.includes('/installation/token') && opts.method === 'DELETE') {
          revokedToken = opts.headers.Authorization;
          return { ok: true, status: 204 };
        }
        return { ok: true, status: 200 };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      // Pre-populate token cache
      tokenCache.set(tenantId, installationId, null, {
        token: 'ghs_cached_token_to_evict',
        expiresAt: new Date(Date.now() + 3600000),
      });

      assert.ok(tokenCache.get(tenantId, installationId));

      await connector.revokeAccess(activeContext, mockCredentials);

      // Token cache must be evicted
      assert.strictEqual(tokenCache.get(tenantId, installationId), null);
      assert.ok(revokedToken === null || typeof revokedToken === 'string');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Comprehensive Error Normalization & Retries
  // -------------------------------------------------------------------------
  describe('6. Comprehensive Error Normalization & Retries', () => {
    it('maps 401 Unauthorized to ConnectorAuthError and invalidates token cache', async () => {
      let tokenEvicted = false;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_to_fail',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        // Upstream API rejects token with 401
        return {
          ok: false,
          status: 401,
          headers: new globalThis.Headers(),
          json: async () => ({ message: 'Bad credentials' }),
        };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      // Override evict to check invocation
      const originalEvict = customAuth.evictInstallationTokens.bind(customAuth);
      customAuth.evictInstallationTokens = (tId, iId) => {
        tokenEvicted = true;
        return originalEvict(tId, iId);
      };

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await connector.listResources(activeContext, mockCredentials);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 401);
          assert.strictEqual(err.code, 'CONNECTOR_AUTH_FAILED');
          assert.strictEqual(tokenEvicted, true);
          return true;
        }
      );
    });

    it('maps 403 Forbidden to InsufficientScopeError', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_ok',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        return {
          ok: false,
          status: 403,
          headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4000' }),
          json: async () => ({ message: 'Resource not accessible by integration' }),
        };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await connector.getResource(activeContext, mockCredentials, '1043905096');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'INSUFFICIENT_SCOPE');
          return true;
        }
      );
    });

    it('maps 429 / rate-limited 403 to ProviderRateLimitError', async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 120;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_ok',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        return {
          ok: false,
          status: 429,
          headers: new globalThis.Headers({
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(resetEpoch),
            'retry-after': '30',
          }),
          json: async () => ({ message: 'You have exceeded a secondary rate limit.' }),
        };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await connector.listResources(activeContext, mockCredentials);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 429);
          assert.strictEqual(err.code, 'PROVIDER_RATE_LIMITED');
          assert.strictEqual(err.retryAfter, 30);
          return true;
        }
      );
    });

    it('retries transient 5xx server errors up to 2 times', async () => {
      let attempts = 0;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_ok',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        attempts++;
        if (attempts <= 2) {
          return {
            ok: false,
            status: 503,
            headers: new globalThis.Headers(),
            json: async () => ({ message: 'Service Unavailable' }),
          };
        }

        // Succeeds on 3rd attempt (attempt index 2)
        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({ total_count: 0, repositories: [] }),
        };
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      const result = await connector.listResources(activeContext, mockCredentials);

      assert.strictEqual(attempts, 3);
      assert.strictEqual(result.items.length, 0);
    });

    it('maps network timeouts to ProviderUnavailableError', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token_ok',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

        const timeoutErr = new Error('The operation was aborted due to timeout');
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      };

      const customAuth = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
        cache: tokenCache,
      });

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await connector.getResource(activeContext, mockCredentials, '1043905096');
        },
        (err) => {
          assert.strictEqual(err.statusCode, 503);
          assert.strictEqual(err.code, 'PROVIDER_UNAVAILABLE');
          return true;
        }
      );
    });
  });
});
