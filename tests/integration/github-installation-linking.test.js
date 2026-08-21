/**
 * @file GitHub App Installation Linking Integration Tests (Task P3-002)
 *
 * Live integration tests against PostgreSQL:
 * 1. GET /integrations/github/install entrypoint (role checks, state cookie, redirect)
 * 2. GET /integrations/github/install/callback (state verification, GitHub verification, linking)
 * 3. Cross-Tenant collision detection (409 Conflict)
 * 4. Idempotent re-installation / update flow
 * 5. Structured audit logging and credential encryption validation
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { users, tenants, sessions, resourceConnections, auditLogs } from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { GitHubInstallationService } from '../../src/services/github-installation.service.js';
import { GitHubAppAuthManager } from '../../src/connectors/github/index.js';
import { decryptSecret } from '../../src/security/encryption.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../../src/config/env.js';

describe('GitHub App Installation Linking Integration Tests (P3-002)', () => {
  let app;
  let installationService;
  let customAuthManager;
  let testKeyPair;
  let rawPemPrivateKey;

  // Test tenants & users
  const tenantAId = crypto.randomUUID();
  const tenantBId = crypto.randomUUID();
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const readonlyUserId = crypto.randomUUID();

  // Test sessions
  let userASessionCookie;
  let userBSessionCookie;
  let readonlyUserSessionCookie;

  const testAppId = 123456;
  const testInstallationId = 98765432;
  const mockMasterKey = config.ENCRYPTION_MASTER_KEY;

  before(async () => {
    // 1. Generate RSA key pair for testing GitHub App auth
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rawPemPrivateKey = testKeyPair.privateKey;

    // 2. Setup mock GitHub fetcher
    const mockGitHubFetch = async (url, _opts) => {
      if (url.includes(`/app/installations/${testInstallationId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: testInstallationId,
            account: {
              id: 99887766,
              login: 'octocat-enterprise',
              type: 'Organization',
              avatar_url: 'https://avatars.githubusercontent.com/u/99887766?v=4',
              html_url: 'https://github.com/octocat-enterprise',
            },
            repository_selection: 'selected',
            permissions: {
              contents: 'read',
              metadata: 'read',
            },
            suspended_at: null,
          }),
        };
      }

      if (url.includes('/app/installations/404404')) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Installation not found' }),
        };
      }

      if (url.includes('/app/installations/503503')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: 'Service Unavailable' }),
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      };
    };

    customAuthManager = new GitHubAppAuthManager({
      appId: testAppId,
      privateKey: rawPemPrivateKey,
      fetchFn: mockGitHubFetch,
    });

    installationService = new GitHubInstallationService({
      db,
      authManager: customAuthManager,
      masterKey: mockMasterKey,
      keyVersion: config.ENCRYPTION_KEY_VERSION,
      appSlug: 'antigravity-career-hub',
      fetchFn: mockGitHubFetch,
    });

    app = buildApp({
      installationService,
      db,
    });
    await app.ready();

    // 3. Seed test tenants
    await db.insert(tenants).values([
      { id: tenantAId, name: 'Tenant A Workspace', slug: `tenant-a-${Date.now()}` },
      { id: tenantBId, name: 'Tenant B Workspace', slug: `tenant-b-${Date.now()}` },
    ]);

    // 4. Seed test users
    await db.insert(users).values([
      {
        id: userAId,
        tenantId: tenantAId,
        email: `usera-${Date.now()}@example.com`,
        displayName: 'User A',
        role: 'OWNER',
      },
      {
        id: userBId,
        tenantId: tenantBId,
        email: `userb-${Date.now()}@example.com`,
        displayName: 'User B',
        role: 'OWNER',
      },
      {
        id: readonlyUserId,
        tenantId: tenantAId,
        email: `userro-${Date.now()}@example.com`,
        displayName: 'User Readonly',
        role: 'READONLY',
      },
    ]);

    // 5. Seed sessions
    const sessionA = await createSession(db, { userId: userAId, tenantId: tenantAId });
    const sessionB = await createSession(db, { userId: userBId, tenantId: tenantBId });
    const sessionRO = await createSession(db, { userId: readonlyUserId, tenantId: tenantAId });

    const cookieOpts = getSessionCookieOptions(config);
    userASessionCookie = `${cookieOpts.name}=${sessionA.rawToken}`;
    userBSessionCookie = `${cookieOpts.name}=${sessionB.rawToken}`;
    readonlyUserSessionCookie = `${cookieOpts.name}=${sessionRO.rawToken}`;
  });

  after(async () => {
    // Cleanup seeded records
    try {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantAId));
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantBId));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tenantAId));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tenantBId));
      await db.delete(sessions).where(eq(sessions.tenantId, tenantAId));
      await db.delete(sessions).where(eq(sessions.tenantId, tenantBId));
      await db.delete(users).where(eq(users.tenantId, tenantAId));
      await db.delete(users).where(eq(users.tenantId, tenantBId));
      await db.delete(tenants).where(eq(tenants.id, tenantAId));
      await db.delete(tenants).where(eq(tenants.id, tenantBId));
    } catch {
      // Best-effort cleanup
    }

    if (app) await app.close();
    await closeDatabase();
  });

  // -------------------------------------------------------------------------
  // 1. GET /integrations/github/install
  // -------------------------------------------------------------------------
  describe('1. GET /integrations/github/install', () => {
    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/integrations/github/install',
      });

      assert.strictEqual(response.statusCode, 401);
    });

    it('rejects READONLY user with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/integrations/github/install',
        headers: {
          cookie: readonlyUserSessionCookie,
        },
      });

      assert.strictEqual(response.statusCode, 403);
      const body = response.json();
      assert.strictEqual(body.error.code, 'FORBIDDEN_READONLY_ROLE');
    });

    it('redirects authenticated user to GitHub App installation page and sets transit cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/integrations/github/install',
        headers: {
          cookie: userASessionCookie,
        },
      });

      assert.strictEqual(response.statusCode, 302);
      const location = response.headers.location;
      assert.ok(
        location.startsWith(
          'https://github.com/apps/antigravity-career-hub/installations/new?state='
        )
      );

      // Verify transit cookie is set
      const cookies = response.headers['set-cookie'];
      assert.ok(cookies);
      assert.ok(
        cookies.includes('gh_install_state=') || cookies.includes('__Host-gh_install_state=')
      );
      assert.ok(cookies.includes('Path=/integrations/github'));
      assert.ok(cookies.includes('HttpOnly'));
    });
  });

  // -------------------------------------------------------------------------
  // 2. GET /integrations/github/install/callback
  // -------------------------------------------------------------------------
  describe('2. GET /integrations/github/install/callback', () => {
    it('rejects callback when state parameter is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/integrations/github/install/callback?installation_id=${testInstallationId}`,
        headers: {
          cookie: userASessionCookie,
        },
      });

      assert.strictEqual(response.statusCode, 400);
      const body = response.json();
      assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects callback when transit cookie is missing', async () => {
      const { stateToken } = installationService.createInstallationState({
        userId: userAId,
        tenantId: tenantAId,
        role: 'OWNER',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/integrations/github/install/callback?installation_id=${testInstallationId}&state=${encodeURIComponent(stateToken)}`,
        headers: {
          cookie: userASessionCookie, // No transit cookie
        },
      });

      assert.strictEqual(response.statusCode, 401);
      const body = response.json();
      assert.strictEqual(body.error.code, 'INVALID_OAUTH_STATE');
    });

    it('successfully links GitHub App installation and redirects to dashboard', async () => {
      // 1. Generate state
      const { stateToken } = installationService.createInstallationState({
        userId: userAId,
        tenantId: tenantAId,
        role: 'OWNER',
      });

      const cookieName = 'gh_install_state';
      const cookieHeader = `${userASessionCookie}; ${cookieName}=${stateToken}`;

      // 2. Call callback endpoint
      const response = await app.inject({
        method: 'GET',
        url: `/integrations/github/install/callback?installation_id=${testInstallationId}&state=${encodeURIComponent(stateToken)}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.strictEqual(response.statusCode, 302);
      assert.strictEqual(response.headers.location, '/dashboard?connection=linked');

      // 3. Verify record was written to PostgreSQL
      const [connection] = await db
        .select()
        .from(resourceConnections)
        .where(
          and(
            eq(resourceConnections.tenantId, tenantAId),
            eq(resourceConnections.installationId, String(testInstallationId))
          )
        );

      assert.ok(connection);
      assert.strictEqual(connection.provider, 'GITHUB_APP');
      assert.strictEqual(connection.authType, 'APP_INSTALLATION');
      assert.strictEqual(connection.externalAccountId, '99887766');
      assert.strictEqual(connection.externalAccountName, 'octocat-enterprise');
      assert.strictEqual(connection.displayName, 'GitHub (octocat-enterprise)');
      assert.strictEqual(connection.status, 'ACTIVE');
      assert.deepStrictEqual(connection.scopes, ['contents:read', 'metadata:read']);
      assert.strictEqual(connection.metadata.repositorySelection, 'selected');
      assert.strictEqual(connection.metadata.targetType, 'Organization');

      // 4. Verify encrypted_credentials payload
      assert.ok(connection.encryptedCredentials.startsWith('enc:v1:'));
      assert.strictEqual(connection.keyVersion, 'v1');
      const decrypted = JSON.parse(decryptSecret(connection.encryptedCredentials, mockMasterKey));
      assert.strictEqual(decrypted.installationId, String(testInstallationId));
      assert.strictEqual(decrypted.targetType, 'Organization');
      assert.strictEqual(decrypted.linkedByUserId, userAId);

      // Security check: zero token or private key in ciphertext
      assert.strictEqual(decrypted.token, undefined);
      assert.strictEqual(decrypted.privateKey, undefined);

      // 5. Verify audit log record
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantAId),
            eq(auditLogs.eventType, 'github.installation_linked')
          )
        );

      assert.ok(auditLog);
      assert.strictEqual(auditLog.resourceId, connection.id);
      assert.strictEqual(auditLog.details.installationId, String(testInstallationId));
      assert.strictEqual(auditLog.details.externalAccountName, 'octocat-enterprise');
    });

    it('performs idempotent update when same tenant repeats installation callback', async () => {
      const { stateToken } = installationService.createInstallationState({
        userId: userAId,
        tenantId: tenantAId,
        role: 'OWNER',
      });

      const cookieName = 'gh_install_state';
      const cookieHeader = `${userASessionCookie}; ${cookieName}=${stateToken}`;

      const response = await app.inject({
        method: 'GET',
        url: `/integrations/github/install/callback?installation_id=${testInstallationId}&state=${encodeURIComponent(stateToken)}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.strictEqual(response.statusCode, 302);
      assert.strictEqual(response.headers.location, '/dashboard?connection=updated');

      // Verify no duplicate row was created
      const rows = await db
        .select()
        .from(resourceConnections)
        .where(
          and(
            eq(resourceConnections.tenantId, tenantAId),
            eq(resourceConnections.installationId, String(testInstallationId))
          )
        );

      assert.strictEqual(rows.length, 1);
    });

    it('rejects cross-tenant linking with 409 Conflict when Tenant B attempts to claim Tenant A installation', async () => {
      // User B in Tenant B attempts to link the same installationId already owned by Tenant A
      const { stateToken } = installationService.createInstallationState({
        userId: userBId,
        tenantId: tenantBId,
        role: 'OWNER',
      });

      const cookieName = 'gh_install_state';
      const cookieHeader = `${userBSessionCookie}; ${cookieName}=${stateToken}`;

      const response = await app.inject({
        method: 'GET',
        url: `/integrations/github/install/callback?installation_id=${testInstallationId}&state=${encodeURIComponent(stateToken)}`,
        headers: {
          cookie: cookieHeader,
        },
      });

      assert.strictEqual(response.statusCode, 409);
      const body = response.json();
      assert.strictEqual(body.error.code, 'CONFLICT');
      assert.strictEqual(
        body.error.message,
        'GitHub App installation is already linked to another workspace.'
      );

      // Verify rejected audit log recorded under Tenant B
      const [auditLog] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantBId),
            eq(auditLogs.eventType, 'github.installation_rejected')
          )
        );

      assert.ok(auditLog);
      assert.strictEqual(auditLog.details.reason, 'cross_tenant_collision');
      assert.strictEqual(auditLog.details.statusCode, 409);
    });
  });
});
