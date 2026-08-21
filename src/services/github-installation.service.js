/**
 * @file GitHub App Installation Service (Task P3-002)
 *
 * Implements:
 * 1. Cryptographic state token generation & validation (anti-CSRF)
 * 2. Server-side GitHub App installation verification via RS256 App JWT
 * 3. Cross-tenant installation collision detection (409 Conflict)
 * 4. Idempotent resource_connections upsert with encrypted metadata payload
 * 5. Structured audit logging (zero credential leakage)
 */

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  CryptoError,
} from '../errors/index.js';
import {
  findConnectionByInstallationId,
  upsertGitHubAppConnection,
  writeAuditRecord,
} from '../db/repositories/connection.repository.js';
import { encryptSecret } from '../security/encryption.js';
import { db as defaultDb } from '../db/index.js';
import { config } from '../config/env.js';
import {
  GitHubAppAuthManager,
  GitHubInstallationNotFoundError,
  GitHubAuthError,
  parseGitHubErrorResponse,
} from '../connectors/github/index.js';

export class GitHubInstallationService {
  /**
   * @param {object} [options]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.db]
   * @param {GitHubAppAuthManager} [options.authManager]
   * @param {string} [options.masterKey]
   * @param {string} [options.keyVersion]
   * @param {string} [options.appSlug]
   * @param {string} [options.appUrl]
   * @param {typeof fetch} [options.fetchFn]
   */
  constructor({
    db,
    authManager,
    masterKey = config.ENCRYPTION_MASTER_KEY,
    keyVersion = config.ENCRYPTION_KEY_VERSION,
    appSlug = config.GITHUB_APP_SLUG || 'antigravity-career-hub',
    appUrl = config.APP_URL || 'http://localhost:3000',
    fetchFn = globalThis.fetch,
  } = {}) {
    this.db = db || defaultDb;
    this.masterKey = masterKey;
    this.keyVersion = keyVersion;
    this.appSlug = appSlug;
    this.appUrl = appUrl;
    this.fetch = fetchFn;

    if (authManager) {
      this.authManager = authManager;
    } else if (
      config.GITHUB_APP_ID &&
      (config.GITHUB_APP_PRIVATE_KEY || config.GITHUB_APP_PRIVATE_KEY_BASE64)
    ) {
      this.authManager = new GitHubAppAuthManager({
        appId: config.GITHUB_APP_ID,
        privateKey: config.GITHUB_APP_PRIVATE_KEY,
        privateKeyBase64: config.GITHUB_APP_PRIVATE_KEY_BASE64,
        fetchFn: this.fetch,
      });
    } else {
      this.authManager = null;
    }
  }

  /**
   * Generates a signed, single-use installation state token binding userId and tenantId.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {string} params.tenantId
   * @param {string} params.role
   * @returns {{ stateToken: string, installUrl: string, expiresAt: Date }}
   */
  createInstallationState({ userId, tenantId, role }) {
    if (!userId || !tenantId) {
      throw new ValidationError('userId and tenantId are required to generate installation state');
    }

    if (role === 'READONLY') {
      throw new AuthorizationError(
        'Read-only members do not have permission to link workspace integrations',
        'FORBIDDEN_READONLY_ROLE'
      );
    }

    const nonce = crypto.randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = issuedAt + 600; // 10-minute TTL

    const stateObj = {
      nonce,
      userId,
      tenantId,
      action: 'github_app_install',
      issuedAt,
      expiresAt: expiresAtSeconds,
    };

    const encodedPayload = Buffer.from(JSON.stringify(stateObj)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.masterKey)
      .update(encodedPayload)
      .digest('base64url');

    const stateToken = `${encodedPayload}.${signature}`;
    const installUrl = `https://github.com/apps/${encodeURIComponent(this.appSlug)}/installations/new?state=${encodeURIComponent(stateToken)}`;

    return {
      stateToken,
      installUrl,
      expiresAt: new Date(expiresAtSeconds * 1000),
    };
  }

  /**
   * Validates state token signature, expiration, and user/tenant binding.
   *
   * @param {object} params
   * @param {string} params.stateToken - Query state parameter
   * @param {string} params.cookieToken - Transit cookie value
   * @param {string} params.userId - Authenticated user UUID
   * @param {string} params.tenantId - Authenticated tenant UUID
   * @returns {object} Decoded state payload
   */
  validateInstallationState({ stateToken, cookieToken, userId, tenantId }) {
    if (!stateToken || typeof stateToken !== 'string') {
      throw new AuthenticationError('Missing installation state parameter', 'INVALID_OAUTH_STATE');
    }
    if (!cookieToken || typeof cookieToken !== 'string') {
      throw new AuthenticationError('Missing installation transit cookie', 'INVALID_OAUTH_STATE');
    }

    // 1. Verify query state matches transit cookie using constant-time comparison
    const stateBuf = Buffer.from(stateToken);
    const cookieBuf = Buffer.from(cookieToken);
    if (stateBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(stateBuf, cookieBuf)) {
      throw new AuthenticationError('Mismatched installation state token', 'INVALID_OAUTH_STATE');
    }

    // 2. Parse 2-part state token (payload.signature)
    const parts = stateToken.split('.');
    if (parts.length !== 2) {
      throw new AuthenticationError('Malformed installation state format', 'INVALID_OAUTH_STATE');
    }

    const [encodedPayload, providedSignature] = parts;

    // 3. Verify HMAC signature
    const expectedSignature = crypto
      .createHmac('sha256', this.masterKey)
      .update(encodedPayload)
      .digest('base64url');

    const sigBuf = Buffer.from(providedSignature);
    const expSigBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) {
      throw new AuthenticationError('Invalid installation state signature', 'INVALID_OAUTH_STATE');
    }

    // 4. Decode payload
    let payload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new AuthenticationError('Invalid state payload JSON', 'INVALID_OAUTH_STATE');
    }

    // 5. Verify action & expiration
    if (payload.action !== 'github_app_install') {
      throw new AuthenticationError('Invalid state action type', 'INVALID_OAUTH_STATE');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds >= payload.expiresAt) {
      throw new AuthenticationError('Installation state token has expired', 'STATE_EXPIRED');
    }

    // 6. Verify user and tenant binding
    if (payload.userId !== userId) {
      throw new AuthenticationError(
        'Installation state user does not match authenticated user session',
        'STATE_USER_MISMATCH'
      );
    }
    if (payload.tenantId !== tenantId) {
      throw new AuthenticationError(
        'Installation state tenant does not match active workspace tenant',
        'STATE_TENANT_MISMATCH'
      );
    }

    return payload;
  }

  /**
   * Directly verifies the GitHub App installation against GitHub REST API using App JWT.
   *
   * @param {string|number} installationId
   * @returns {Promise<{ id: number, account: { id: number, login: string, type: string, avatarUrl: string, htmlUrl: string }, repositorySelection: string, permissions: object }>}
   */
  async verifyGitHubInstallation(installationId) {
    if (!this.authManager) {
      throw new CryptoError(
        'GitHub App authentication manager is not configured',
        'MISSING_GITHUB_APP_CONFIG'
      );
    }

    const appJwt = this.authManager.getAppJwt();
    const url = `${this.authManager.baseUrl}/app/installations/${encodeURIComponent(String(installationId))}`;

    const res = await this.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Antigravity-Career-Hub/0.1.0',
      },
    });

    if (!res.ok) {
      let errorBody;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text().catch(() => '');
      }

      if (res.status === 404) {
        throw new GitHubInstallationNotFoundError(installationId);
      }
      if (res.status === 401) {
        throw new GitHubAuthError('GitHub App authentication failed while verifying installation');
      }

      throw parseGitHubErrorResponse(res.status, errorBody, res.headers);
    }

    const data = await res.json();

    if (!data || !data.id || !data.account) {
      throw new GitHubInstallationNotFoundError(installationId);
    }

    // 1. Verify installation is not suspended
    if (data.suspended_at) {
      throw new AuthorizationError(
        'GitHub App installation is suspended on GitHub',
        'INSTALLATION_SUSPENDED',
        { installationId: String(installationId), suspendedAt: data.suspended_at }
      );
    }

    // 2. Verify minimum required permissions (contents:read, metadata:read)
    const permissions = data.permissions || {};
    const hasContentsRead = permissions.contents === 'read' || permissions.contents === 'write';
    const hasMetadataRead = permissions.metadata === 'read' || permissions.metadata === 'write';

    if (!hasContentsRead || !hasMetadataRead) {
      throw new AuthorizationError(
        'GitHub App installation lacks mandatory permissions (contents:read, metadata:read)',
        'INSUFFICIENT_PERMISSIONS',
        { installationId: String(installationId), permissions }
      );
    }

    return {
      id: data.id,
      account: {
        id: data.account.id,
        login: data.account.login,
        type: data.account.type || 'User',
        avatarUrl: data.account.avatar_url || '',
        htmlUrl: data.account.html_url || '',
      },
      repositorySelection: data.repository_selection || 'all',
      permissions: data.permissions,
    };
  }

  /**
   * Completes the user-to-server linking flow:
   * 1. Checks cross-tenant collision
   * 2. Upserts resource_connections record
   * 3. Writes sanitized audit log
   *
   * @param {object} params
   * @param {object} params.user - Authenticated user context
   * @param {string} params.tenantId - Trusted tenant UUID
   * @param {string|number} params.installationId - GitHub installation ID
   * @param {object} [params.reqContext] - Request metadata (ip, userAgent, reqId)
   * @returns {Promise<{ connection: object, isUpdate: boolean }>}
   */
  async linkInstallation({ user, tenantId, installationId, reqContext = {} }) {
    if (!tenantId || !user?.id) {
      throw new ValidationError('tenantId and user are mandatory to link installation');
    }

    if (user.role === 'READONLY') {
      throw new AuthorizationError(
        'Read-only members do not have permission to link workspace integrations',
        'FORBIDDEN_READONLY_ROLE'
      );
    }

    // 1. Verify installation directly against GitHub
    const verified = await this.verifyGitHubInstallation(installationId);

    // 2. Check cross-tenant installation collision
    const existing = await findConnectionByInstallationId(this.db, installationId);

    if (existing && existing.tenantId !== tenantId) {
      // Record rejected audit event
      await writeAuditRecord(this.db, {
        tenantId,
        userId: user.id,
        eventType: 'github.installation_rejected',
        resourceId: null,
        requestId: reqContext.requestId,
        ipAddress: reqContext.ipAddress,
        userAgent: reqContext.userAgent,
        details: {
          installationId: String(installationId),
          externalAccountId: String(verified.account.id),
          reason: 'cross_tenant_collision',
          statusCode: 409,
        },
      });

      throw new ConflictError(
        'GitHub App installation is already linked to another workspace.',
        'INSTALLATION_ALREADY_LINKED',
        { installationId: String(installationId) }
      );
    }

    // 3. Construct encrypted metadata payload (satisfying NOT NULL and key rotation invariants)
    const credentialsPayload = {
      installationId: String(installationId),
      targetType: verified.account.type,
      linkedAt: new Date().toISOString(),
      linkedByUserId: user.id,
    };

    const encryptedCredentials = encryptSecret(
      JSON.stringify(credentialsPayload),
      this.masterKey,
      this.keyVersion
    );

    // 4. Upsert connection record into resource_connections table
    const connection = await upsertGitHubAppConnection(this.db, {
      tenantId,
      userId: user.id,
      installationId: String(installationId),
      externalAccountId: String(verified.account.id),
      externalAccountName: verified.account.login,
      displayName: `GitHub (${verified.account.login})`,
      encryptedCredentials,
      keyVersion: this.keyVersion,
      scopes: ['contents:read', 'metadata:read'],
      status: 'ACTIVE',
      metadata: {
        repositorySelection: verified.repositorySelection,
        targetType: verified.account.type,
        accountAvatarUrl: verified.account.avatarUrl,
        accountHtmlUrl: verified.account.htmlUrl,
      },
    });

    // 5. Write structured audit log
    await writeAuditRecord(this.db, {
      tenantId,
      userId: user.id,
      eventType: 'github.installation_linked',
      resourceId: connection.id,
      requestId: reqContext.requestId,
      ipAddress: reqContext.ipAddress,
      userAgent: reqContext.userAgent,
      details: {
        installationId: String(installationId),
        externalAccountId: String(verified.account.id),
        externalAccountName: verified.account.login,
        repositorySelection: verified.repositorySelection,
        targetType: verified.account.type,
        isUpdate: !!existing,
      },
    });

    return {
      connection,
      isUpdate: !!existing,
    };
  }
}
