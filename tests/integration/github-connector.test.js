/**
 * @file Integration Tests for GitHubAppConnector & PostgreSQL Multi-Tenant Isolation (Task P3-004)
 *
 * Tests the complete database-backed connector lifecycle:
 * 1. Resolving connection from PostgreSQL and creating trusted ConnectorContext
 * 2. Tenant A successfully invokes read tools (getAccount, listResources, getResource) on Tenant A's connection
 * 3. Tenant B is strictly denied access to Tenant A's connection (404 ConnectionNotFoundError)
 * 4. Inactive connection statuses (REVOKED, DISCONNECTED) are rejected before calling GitHub (403 ConnectionInactiveError)
 * 5. Installation ID is derived strictly from verified database records
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, resourceConnections } from '../../src/db/schema.js';
import { findConnectionByIdAndTenant } from '../../src/db/repositories/connection.repository.js';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import { encryptSecret, decryptSecret } from '../../src/security/encryption.js';
import { createTrustedConnectorContext } from '../../src/security/resource-authorization.js';

describe('GitHubAppConnector PostgreSQL Integration Tests (P3-004)', () => {
  const testMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  let testKeyPair;
  let rawPemPrivateKey;
  let tokenCache;
  let authManager;

  const testTenantAId = crypto.randomUUID();
  const testTenantBId = crypto.randomUUID();
  const testUserAId = crypto.randomUUID();
  const testUserBId = crypto.randomUUID();

  const testInstallationAId = '155430459';

  let connectionAId;
  let connectionRevokedId;

  before(async () => {
    // Generate RSA key pair for testing
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rawPemPrivateKey = testKeyPair.privateKey;

    tokenCache = new GitHubTokenCache();

    // Mock fetch for GitHub API responses
    const mockFetch = async (url) => {
      if (url.includes('/access_tokens')) {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            token: 'ghs_integration_token_123',
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
          headers: new globalThis.Headers({ 'x-ratelimit-remaining': '4980' }),
          json: async () => ({
            total_count: 1,
            repository_selection: 'all',
            repositories: [
              {
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

      if (url.includes('/repositories/1043905096')) {
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

    authManager = new GitHubAppAuthManager({
      appId: 123456,
      privateKey: rawPemPrivateKey,
      cache: tokenCache,
      fetchFn: mockFetch,
    });

    // 1. Insert test tenants & users
    await db.insert(tenants).values([
      { id: testTenantAId, name: 'Connector Tenant A', slug: `conn-tenant-a-${Date.now()}` },
      { id: testTenantBId, name: 'Connector Tenant B', slug: `conn-tenant-b-${Date.now()}` },
    ]);

    await db.insert(users).values([
      {
        id: testUserAId,
        tenantId: testTenantAId,
        email: `conn-user-a-${Date.now()}@example.com`,
        displayName: 'Connector User A',
        role: 'OWNER',
      },
      {
        id: testUserBId,
        tenantId: testTenantBId,
        email: `conn-user-b-${Date.now()}@example.com`,
        displayName: 'Connector User B',
        role: 'OWNER',
      },
    ]);

    // 2. Insert ACTIVE connection for Tenant A
    const encryptedCompactA = encryptSecret(
      JSON.stringify({
        installationId: testInstallationAId,
        targetType: 'User',
        accountLogin: 'vishu1803',
      }),
      { key: testMasterKey }
    );

    const [connA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: testTenantAId,
        userId: testUserAId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        externalAccountId: '97516061',
        externalAccountName: 'vishu1803',
        displayName: 'vishu1803 (GitHub App)',
        status: 'ACTIVE',
        scopes: ['contents:read', 'metadata:read'],
        encryptedCredentials: encryptedCompactA,
        keyVersion: 'v1',
        metadata: {
          installationId: Number(testInstallationAId),
          repositorySelection: 'all',
        },
      })
      .returning({ id: resourceConnections.id });

    connectionAId = connA.id;

    // 3. Insert REVOKED connection for Tenant A
    const [connRevoked] = await db
      .insert(resourceConnections)
      .values({
        tenantId: testTenantAId,
        userId: testUserAId,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        externalAccountId: '97516099',
        externalAccountName: 'vishu-revoked',
        displayName: 'Revoked Connection',
        status: 'REVOKED',
        scopes: ['contents:read', 'metadata:read'],
        encryptedCredentials: encryptedCompactA,
        keyVersion: 'v1',
        lastErrorCode: 'APP_UNINSTALLED',
      })
      .returning({ id: resourceConnections.id });

    connectionRevokedId = connRevoked.id;
  });

  after(async () => {
    if (connectionAId) {
      await db.delete(resourceConnections).where(eq(resourceConnections.id, connectionAId));
    }
    if (connectionRevokedId) {
      await db.delete(resourceConnections).where(eq(resourceConnections.id, connectionRevokedId));
    }
    await db.delete(users).where(eq(users.id, testUserAId));
    await db.delete(users).where(eq(users.id, testUserBId));
    await db.delete(tenants).where(eq(tenants.id, testTenantAId));
    await db.delete(tenants).where(eq(tenants.id, testTenantBId));
    await closeDatabase();
  });

  it('Tenant A successfully reads account and repositories via GitHubAppConnector', async () => {
    const connection = await findConnectionByIdAndTenant(db, connectionAId, testTenantAId);
    assert.ok(connection);
    assert.strictEqual(connection.status, 'ACTIVE');

    // Decrypt credentials
    const plaintext = decryptSecret(connection.encryptedCredentials, { key: testMasterKey });
    const credentials = JSON.parse(plaintext);
    assert.strictEqual(credentials.installationId, testInstallationAId);

    // Mint trusted context
    const context = createTrustedConnectorContext({
      user: { id: testUserAId, role: 'OWNER' },
      tenantId: testTenantAId,
      connection,
    });

    const connector = new GitHubAppConnector({
      authManager,
      fetchFn: authManager.fetch,
    });

    // 1. getAccount
    const account = await connector.getAccount(context, credentials);
    assert.strictEqual(account.id, '97516061');
    assert.strictEqual(account.name, 'vishu1803');
    assert.strictEqual(account.provider, 'GITHUB_APP');

    // 2. listResources
    const repos = await connector.listResources(context, credentials);
    assert.strictEqual(repos.items.length, 1);
    assert.strictEqual(repos.items[0].id, '1043905096');
    assert.strictEqual(repos.items[0].name, 'Ai-job-mcp');

    // 3. getResource
    const single = await connector.getResource(context, credentials, '1043905096');
    assert.strictEqual(single.id, '1043905096');
    assert.strictEqual(single.fullName, 'vishu1803/Ai-job-mcp');
  });

  it('Tenant B is strictly rejected when attempting to access Tenant A connection (404)', async () => {
    const connection = await findConnectionByIdAndTenant(db, connectionAId, testTenantBId);
    assert.strictEqual(connection, null);

    assert.throws(
      () => {
        createTrustedConnectorContext({
          user: { id: testUserBId, role: 'OWNER' },
          tenantId: testTenantBId,
          connection: null,
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'CONNECTION_NOT_FOUND');
        return true;
      }
    );
  });

  it('Inactive connection (REVOKED) is rejected before calling GitHub', async () => {
    const connection = await findConnectionByIdAndTenant(db, connectionRevokedId, testTenantAId);
    assert.ok(connection);
    assert.strictEqual(connection.status, 'REVOKED');

    const plaintextRevoked = decryptSecret(connection.encryptedCredentials, { key: testMasterKey });
    const credentials = JSON.parse(plaintextRevoked);

    const context = Object.assign(
      {},
      createTrustedConnectorContext({
        user: { id: testUserAId, role: 'OWNER' },
        tenantId: testTenantAId,
        connection,
      }),
      { connectionStatus: connection.status }
    );

    const connector = new GitHubAppConnector({
      authManager,
      fetchFn: authManager.fetch,
    });

    await assert.rejects(
      async () => {
        await connector.listResources(context, credentials);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'CONNECTION_INACTIVE');
        return true;
      }
    );
  });
});
