/**
 * @file GitHub Installation Service Unit Tests (Task P3-002)
 *
 * Tests:
 * 1. State Token Generation & Anti-CSRF Signatures
 * 2. State Token Validation & User/Tenant Binding
 * 3. Server-Side Installation Verification via App JWT
 * 4. Cross-Tenant Installation Collision Detection (409 Conflict)
 * 5. Idempotent resource_connections Upsert & Credential Encryption
 * 6. Security & Audit Verification
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GitHubInstallationService } from '../../src/services/github-installation.service.js';
import {
  GitHubAppAuthManager,
  GitHubInstallationNotFoundError,
  GitHubAuthError,
} from '../../src/connectors/github/index.js';
import { decryptSecret } from '../../src/security/encryption.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../../src/errors/index.js';

describe('GitHub Installation Service Unit Tests (P3-002)', () => {
  let testKeyPair;
  let rawPemPrivateKey;
  let authManager;
  let masterKey;
  const keyVersion = 'v1';
  const testAppId = 123456;

  const tenantA = '550e8400-e29b-41d4-a716-446655440000';
  const tenantB = '660e8400-e29b-41d4-a716-446655440001';
  const userA = { id: 'user-001-uuid', role: 'MEMBER' };
  const readonlyUser = { id: 'user-ro-uuid', role: 'READONLY' };
  const installationId = '98765432';

  before(() => {
    testKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    rawPemPrivateKey = testKeyPair.privateKey;
    masterKey = crypto.randomBytes(32).toString('hex');

    authManager = new GitHubAppAuthManager({
      appId: testAppId,
      privateKey: rawPemPrivateKey,
    });
  });

  // -------------------------------------------------------------------------
  // 1. State Token Generation & Anti-CSRF Signatures
  // -------------------------------------------------------------------------
  describe('1. State Token Generation & Anti-CSRF Signatures', () => {
    it('generates a cryptographically signed state token with 10-minute TTL and valid install URL', () => {
      const service = new GitHubInstallationService({
        authManager,
        masterKey,
        keyVersion,
        appSlug: 'antigravity-career-hub',
      });

      const { stateToken, installUrl, expiresAt } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: userA.role,
      });

      assert.ok(typeof stateToken === 'string');
      assert.ok(stateToken.includes('.'));
      assert.ok(
        installUrl.includes('https://github.com/apps/antigravity-career-hub/installations/new')
      );
      assert.ok(installUrl.includes(encodeURIComponent(stateToken)));
      assert.ok(expiresAt instanceof Date);

      // Verify expiration is roughly 10 minutes (600s) from now
      const diffSeconds = Math.round((expiresAt.getTime() - Date.now()) / 1000);
      assert.ok(diffSeconds >= 590 && diffSeconds <= 605);
    });

    it('rejects READONLY users from generating installation state with 403 Forbidden', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });

      assert.throws(
        () =>
          service.createInstallationState({
            userId: readonlyUser.id,
            tenantId: tenantA,
            role: readonlyUser.role,
          }),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'FORBIDDEN_READONLY_ROLE');
          return true;
        }
      );
    });

    it('throws ValidationError when userId or tenantId is missing', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      assert.throws(
        () => service.createInstallationState({ userId: null, tenantId: tenantA, role: 'MEMBER' }),
        ValidationError
      );
      assert.throws(
        () => service.createInstallationState({ userId: userA.id, tenantId: null, role: 'MEMBER' }),
        ValidationError
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. State Token Validation & User/Tenant Binding
  // -------------------------------------------------------------------------
  describe('2. State Token Validation & User/Tenant Binding', () => {
    it('successfully validates matching state and returns decoded payload', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      const { stateToken } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: userA.role,
      });

      const payload = service.validateInstallationState({
        stateToken,
        cookieToken: stateToken,
        userId: userA.id,
        tenantId: tenantA,
      });

      assert.strictEqual(payload.userId, userA.id);
      assert.strictEqual(payload.tenantId, tenantA);
      assert.strictEqual(payload.action, 'github_app_install');
      assert.ok(payload.nonce);
    });

    it('rejects mismatched cookie and query state tokens', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      const { stateToken: token1 } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: 'MEMBER',
      });
      const { stateToken: token2 } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: 'MEMBER',
      });

      assert.throws(
        () =>
          service.validateInstallationState({
            stateToken: token1,
            cookieToken: token2,
            userId: userA.id,
            tenantId: tenantA,
          }),
        (err) => {
          assert.ok(err instanceof AuthenticationError);
          assert.strictEqual(err.code, 'INVALID_OAUTH_STATE');
          return true;
        }
      );
    });

    it('rejects tampered state signature', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      const { stateToken } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: 'MEMBER',
      });

      const [payloadPart] = stateToken.split('.');
      const tamperedToken = `${payloadPart}.invalidsignature123`;

      assert.throws(
        () =>
          service.validateInstallationState({
            stateToken: tamperedToken,
            cookieToken: tamperedToken,
            userId: userA.id,
            tenantId: tenantA,
          }),
        (err) => {
          assert.ok(err instanceof AuthenticationError);
          assert.strictEqual(err.code, 'INVALID_OAUTH_STATE');
          return true;
        }
      );
    });

    it('rejects state token when user session does not match state binding', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      const { stateToken } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: 'MEMBER',
      });

      assert.throws(
        () =>
          service.validateInstallationState({
            stateToken,
            cookieToken: stateToken,
            userId: 'different-user-uuid',
            tenantId: tenantA,
          }),
        (err) => {
          assert.ok(err instanceof AuthenticationError);
          assert.strictEqual(err.code, 'STATE_USER_MISMATCH');
          return true;
        }
      );
    });

    it('rejects state token when active workspace tenant does not match state binding', () => {
      const service = new GitHubInstallationService({ authManager, masterKey });
      const { stateToken } = service.createInstallationState({
        userId: userA.id,
        tenantId: tenantA,
        role: 'MEMBER',
      });

      assert.throws(
        () =>
          service.validateInstallationState({
            stateToken,
            cookieToken: stateToken,
            userId: userA.id,
            tenantId: tenantB,
          }),
        (err) => {
          assert.ok(err instanceof AuthenticationError);
          assert.strictEqual(err.code, 'STATE_TENANT_MISMATCH');
          return true;
        }
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. Server-Side Installation Verification via App JWT
  // -------------------------------------------------------------------------
  describe('3. Server-Side Installation Verification via App JWT', () => {
    it('verifies a valid GitHub App installation and extracts verified identity metadata', async () => {
      const mockFetch = async (url, opts) => {
        assert.ok(url.includes(`/app/installations/${installationId}`));
        assert.ok(opts.headers.Authorization.startsWith('Bearer '));

        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 98765432,
            account: {
              id: 1234567,
              login: 'octocat',
              type: 'User',
              avatar_url: 'https://avatars.githubusercontent.com/u/1234567?v=4',
              html_url: 'https://github.com/octocat',
            },
            repository_selection: 'selected',
            permissions: {
              contents: 'read',
              metadata: 'read',
            },
            suspended_at: null,
          }),
        };
      };

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const service = new GitHubInstallationService({
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      const verified = await service.verifyGitHubInstallation(installationId);
      assert.strictEqual(verified.id, 98765432);
      assert.strictEqual(verified.account.login, 'octocat');
      assert.strictEqual(verified.account.id, 1234567);
      assert.strictEqual(verified.repositorySelection, 'selected');
      assert.deepStrictEqual(verified.permissions, { contents: 'read', metadata: 'read' });
    });

    it('rejects suspended installations with 403 Forbidden', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765432,
          account: { id: 123, login: 'suspended_user' },
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: '2026-08-20T10:00:00Z',
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => service.verifyGitHubInstallation(installationId),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'INSTALLATION_SUSPENDED');
          return true;
        }
      );
    });

    it('rejects installations with insufficient permissions (missing contents:read)', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765432,
          account: { id: 123, login: 'restricted_user' },
          permissions: { metadata: 'read' }, // Missing contents:read
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => service.verifyGitHubInstallation(installationId),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'INSUFFICIENT_PERMISSIONS');
          return true;
        }
      );
    });

    it('throws GitHubInstallationNotFoundError on 404 from GitHub', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => service.verifyGitHubInstallation(installationId),
        GitHubInstallationNotFoundError
      );
    });

    it('throws GitHubAuthError on 401 from GitHub', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Bad credentials' }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(() => service.verifyGitHubInstallation(installationId), GitHubAuthError);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Cross-Tenant Collision & Idempotent Linking
  // -------------------------------------------------------------------------
  describe('4. Cross-Tenant Collision & Idempotent Linking', () => {
    it('creates a new connection record and encrypts durable metadata payload', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [], // No existing connection
            }),
          }),
        }),
        insert: () => ({
          values: (row) => ({
            returning: async () => {
              return [row];
            },
          }),
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765432,
          account: { id: 1234567, login: 'octocat', type: 'User' },
          repository_selection: 'selected',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        keyVersion,
        fetchFn: mockFetch,
      });

      const { connection, isUpdate } = await service.linkInstallation({
        user: userA,
        tenantId: tenantA,
        installationId,
      });

      assert.strictEqual(isUpdate, false);
      assert.strictEqual(connection.tenantId, tenantA);
      assert.strictEqual(connection.userId, userA.id);
      assert.strictEqual(connection.provider, 'GITHUB_APP');
      assert.strictEqual(connection.authType, 'APP_INSTALLATION');
      assert.strictEqual(connection.displayName, 'GitHub (octocat)');
      assert.strictEqual(connection.externalAccountId, '1234567');
      assert.strictEqual(connection.externalAccountName, 'octocat');
      assert.strictEqual(connection.status, 'ACTIVE');

      // Verify encrypted credentials payload
      assert.ok(connection.encryptedCredentials.startsWith('enc:v1:'));
      const decrypted = JSON.parse(decryptSecret(connection.encryptedCredentials, masterKey));
      assert.strictEqual(decrypted.installationId, String(installationId));
      assert.strictEqual(decrypted.targetType, 'User');
      assert.strictEqual(decrypted.linkedByUserId, userA.id);

      // Security check: raw tokens or private key are absent
      assert.strictEqual(decrypted.token, undefined);
      assert.strictEqual(decrypted.privateKey, undefined);
    });

    it('rejects cross-tenant linking with 409 Conflict when installation belongs to another tenant', async () => {
      let auditEventType;
      let auditReason;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'conn-existing', tenantId: tenantB, installationId }], // Owned by Tenant B
            }),
          }),
        }),
        insert: () => ({
          values: async (data) => {
            auditEventType = data.eventType;
            auditReason = data.details?.reason;
          },
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765432,
          account: { id: 1234567, login: 'octocat', type: 'User' },
          repository_selection: 'selected',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        () => service.linkInstallation({ user: userA, tenantId: tenantA, installationId }),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.strictEqual(err.statusCode, 409);
          assert.strictEqual(err.code, 'CONFLICT');
          return true;
        }
      );

      // Verify rejected audit log was recorded
      assert.strictEqual(auditEventType, 'github.installation_rejected');
      assert.strictEqual(auditReason, 'cross_tenant_collision');
    });

    it('updates existing connection idempotently when same tenant repeats installation callback', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: 'conn-existing', tenantId: tenantA, installationId }], // Owned by Tenant A
            }),
          }),
        }),
        update: () => ({
          set: (updates) => ({
            where: () => ({
              returning: async () => {
                return [{ id: 'conn-existing', tenantId: tenantA, ...updates }];
              },
            }),
          }),
        }),
        insert: () => ({
          values: async () => {},
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 98765432,
          account: { id: 1234567, login: 'octocat_updated', type: 'User' },
          repository_selection: 'all',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });
      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      const { connection, isUpdate } = await service.linkInstallation({
        user: userA,
        tenantId: tenantA,
        installationId,
      });

      assert.strictEqual(isUpdate, true);
      assert.strictEqual(connection.id, 'conn-existing');
      assert.strictEqual(connection.externalAccountName, 'octocat_updated');
      assert.strictEqual(connection.displayName, 'GitHub (octocat_updated)');
      assert.strictEqual(connection.status, 'ACTIVE');
      assert.strictEqual(connection.metadata.repositorySelection, 'all');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Update Callback Flow (setup_action=update)
  // -------------------------------------------------------------------------
  describe('5. Update Callback Flow (setup_action=update)', () => {
    it('successfully updates repositorySelection metadata, clears error state, evicts token cache, and writes audit record', async () => {
      let evictedTenant = null;
      let evictedInstall = null;
      let auditedRecord = null;
      let updatedData = null;

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'conn-update-1',
                  tenantId: tenantA,
                  userId: userA.id,
                  installationId,
                  status: 'REVOKED',
                  lastErrorCode: 'APP_SUSPENDED',
                  metadata: { repositorySelection: 'all', targetType: 'User' },
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data) => ({
            where: () => ({
              returning: async () => {
                updatedData = data;
                return [{ id: 'conn-update-1', tenantId: tenantA, ...data }];
              },
            }),
          }),
        }),
        insert: () => ({
          values: async (record) => {
            auditedRecord = record;
            return [];
          },
        }),
      };

      const mockTokenCache = {
        evict: (tId, iId) => {
          evictedTenant = tId;
          evictedInstall = iId;
        },
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: Number(installationId),
          account: {
            id: 1234567,
            login: 'octocat',
            type: 'User',
            avatar_url: 'https://avatar.url',
          },
          repository_selection: 'selected',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        tokenCache: mockTokenCache,
        masterKey,
        fetchFn: mockFetch,
      });

      const result = await service.updateInstallation({
        user: userA,
        tenantId: tenantA,
        installationId,
        reqContext: { requestId: 'req-update-1' },
      });

      assert.strictEqual(result.isUpdate, true);
      assert.strictEqual(updatedData.metadata.repositorySelection, 'selected');
      assert.strictEqual(updatedData.status, 'ACTIVE');
      assert.strictEqual(updatedData.lastErrorCode, null);
      assert.strictEqual(evictedTenant, tenantA);
      assert.strictEqual(evictedInstall, installationId);
      assert.strictEqual(auditedRecord.eventType, 'github.installation_updated');
      assert.strictEqual(auditedRecord.tenantId, tenantA);
      assert.strictEqual(auditedRecord.details.repositorySelection, 'selected');
    });

    it('rejects READONLY user from executing update flow with 403 Forbidden', async () => {
      const service = new GitHubInstallationService({ authManager, masterKey });

      await assert.rejects(
        async () => {
          await service.updateInstallation({
            user: readonlyUser,
            tenantId: tenantA,
            installationId,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.strictEqual(err.code, 'FORBIDDEN_READONLY_ROLE');
          return true;
        }
      );
    });

    it('throws 404 when no existing connection exists in active workspace', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [], // No connection found
            }),
          }),
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: Number(installationId),
          account: { id: 1234567, login: 'octocat', type: 'User' },
          repository_selection: 'all',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await service.updateInstallation({
            user: userA,
            tenantId: tenantA,
            installationId,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('throws 404 when installation belongs to another tenant (multi-tenant boundary)', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'conn-tenant-b',
                  tenantId: tenantB, // Belongs to Tenant B
                  installationId,
                  status: 'ACTIVE',
                },
              ],
            }),
          }),
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: Number(installationId),
          account: { id: 1234567, login: 'octocat', type: 'User' },
          repository_selection: 'all',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      // Tenant A attempts to update Tenant B's installation
      await assert.rejects(
        async () => {
          await service.updateInstallation({
            user: userA,
            tenantId: tenantA,
            installationId,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          return true;
        }
      );
    });

    it('rejects updating a DISCONNECTED connection without silent reactivation', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'conn-disconnected',
                  tenantId: tenantA,
                  installationId,
                  status: 'DISCONNECTED',
                },
              ],
            }),
          }),
        }),
      };

      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: Number(installationId),
          account: { id: 1234567, login: 'octocat', type: 'User' },
          repository_selection: 'all',
          permissions: { contents: 'read', metadata: 'read' },
          suspended_at: null,
        }),
      });

      const customAuthManager = new GitHubAppAuthManager({
        appId: testAppId,
        privateKey: rawPemPrivateKey,
        fetchFn: mockFetch,
      });

      const service = new GitHubInstallationService({
        db: mockDb,
        authManager: customAuthManager,
        masterKey,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => {
          await service.updateInstallation({
            user: userA,
            tenantId: tenantA,
            installationId,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.code, 'CONNECTION_DISCONNECTED');
          return true;
        }
      );
    });
  });
});
