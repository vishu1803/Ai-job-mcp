/** GitHub claiming: durable state -> App user OAuth -> authority -> atomic claim. */
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { and, eq, gt, lt } from 'drizzle-orm';
import { githubInstallationStates } from '../db/schema.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  CryptoError,
} from '../errors/index.js';
import {
  upsertGitHubAppConnection,
  writeAuditRecord,
} from '../db/repositories/connection.repository.js';
import { encryptSecret, decryptSecret } from '../security/encryption.js';
import { db as defaultDb } from '../db/index.js';
import { config } from '../config/env.js';
import { GitHubAppAuthManager } from '../connectors/github/index.js';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const numericId = (value) => Number.isSafeInteger(value) && value > 0;
const deny = () =>
  new AuthorizationError(
    'GitHub installation authority could not be verified',
    'INSTALLATION_ACCESS_DENIED'
  );
const invalidState = () =>
  new AuthenticationError(
    'Invalid, expired, or already used installation state',
    'INVALID_OAUTH_STATE'
  );

export function getInstallationCookieOptions(appConfig = config) {
  const secure = appConfig.NODE_ENV === 'production';
  return {
    name: secure ? '__Host-gh_install_state' : 'gh_install_state',
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: 600,
  };
}

export class GitHubInstallationService {
  constructor({
    db = defaultDb,
    authManager,
    tokenCache,
    masterKey = config.ENCRYPTION_MASTER_KEY,
    keyVersion = config.ENCRYPTION_KEY_VERSION,
    appSlug = config.GITHUB_APP_SLUG || 'antigravity-career-hub',
    appUrl = config.APP_URL,
    clientId = config.GITHUB_APP_CLIENT_ID,
    clientSecret = config.GITHUB_APP_CLIENT_SECRET,
    fetchFn = globalThis.fetch,
  } = {}) {
    this.db = db;
    this.masterKey = masterKey;
    this.keyVersion = keyVersion;
    this.appSlug = appSlug;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = new URL('/integrations/github/authorize/callback', appUrl).href;
    this.fetch = fetchFn;
    this.authManager =
      authManager ||
      (config.GITHUB_APP_ID && config.GITHUB_APP_PRIVATE_KEY
        ? new GitHubAppAuthManager({
            appId: config.GITHUB_APP_ID,
            privateKey: config.GITHUB_APP_PRIVATE_KEY,
            fetchFn,
          })
        : null);
    this.tokenCache = tokenCache || this.authManager?.tokenCache;
  }

  #context({ user, tenantId, session }) {
    if (
      !user?.id ||
      user.tenantId !== tenantId ||
      session?.userId !== user.id ||
      session?.tenantId !== tenantId ||
      !session.id ||
      !/^[1-9]\d*$/.test(session.githubUserId || '') ||
      !Number.isSafeInteger(Number(session.githubUserId))
    ) {
      throw new AuthenticationError(
        'A fresh GitHub login is required to connect an installation',
        'GITHUB_LOGIN_REQUIRED'
      );
    }
    if (!['OWNER', 'MEMBER'].includes(user.role)) {
      throw new AuthorizationError(
        'Read-only members cannot link integrations',
        'FORBIDDEN_READONLY_ROLE'
      );
    }
    return { userId: user.id, tenantId, sessionId: session.id, githubUserId: session.githubUserId };
  }

  #configured() {
    if (
      !this.authManager ||
      !this.clientId ||
      !this.clientSecret ||
      !/^[a-f\d]{64}$/i.test(this.masterKey || '')
    ) {
      throw new CryptoError(
        'GitHub App user authorization is not configured',
        'MISSING_GITHUB_APP_CONFIG'
      );
    }
    if (config.NODE_ENV === 'production' && !this.callbackUrl.startsWith('https://')) {
      throw new CryptoError('GitHub App callback must use HTTPS', 'INVALID_GITHUB_CALLBACK');
    }
  }

  async #issueState(db, context, phase, installationId = null) {
    const expiresAt = new Date(Date.now() + 600000);
    const payload = {
      ...context,
      phase,
      installationId,
      callbackUrl: this.callbackUrl,
      nonce: crypto.randomBytes(32).toString('base64url'),
      expiresAt: expiresAt.getTime(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.masterKey)
      .update(encoded)
      .digest('base64url');
    const stateToken = `${encoded}.${signature}`;
    const codeVerifier =
      phase === 'authorize' ? crypto.randomBytes(32).toString('base64url') : null;
    await db.insert(githubInstallationStates).values({
      stateHash: hash(stateToken),
      sessionId: context.sessionId,
      userId: context.userId,
      tenantId: context.tenantId,
      phase,
      installationId,
      expiresAt,
      encryptedCodeVerifier: codeVerifier
        ? encryptSecret(codeVerifier, this.masterKey, this.keyVersion)
        : null,
    });
    return { stateToken, expiresAt, codeVerifier };
  }

  async createInstallationState(params) {
    const context = this.#context(params);
    this.#configured();
    await this.db
      .delete(githubInstallationStates)
      .where(lt(githubInstallationStates.expiresAt, new Date()));
    const state = await this.#issueState(this.db, context, 'install');
    return {
      ...state,
      installUrl: `https://github.com/apps/${encodeURIComponent(this.appSlug)}/installations/new?state=${encodeURIComponent(state.stateToken)}`,
    };
  }

  validateInstallationState({ stateToken, cookieToken, phase, ...params }) {
    const context = this.#context(params);
    if (!stateToken || stateToken.length > 4096 || !equal(stateToken, cookieToken))
      throw invalidState();
    const [encoded, signature, extra] = stateToken.split('.');
    const expected = crypto
      .createHmac('sha256', this.masterKey)
      .update(encoded)
      .digest('base64url');
    if (extra !== undefined || !equal(signature, expected)) throw invalidState();
    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    } catch {
      throw invalidState();
    }
    if (
      !payload ||
      payload.phase !== phase ||
      payload.callbackUrl !== this.callbackUrl ||
      !Number.isSafeInteger(payload.expiresAt) ||
      Date.now() >= payload.expiresAt ||
      Object.entries(context).some(([key, value]) => payload[key] !== value)
    )
      throw invalidState();
    return payload;
  }

  async #consumeState(db, params, phase) {
    const payload = this.validateInstallationState({ ...params, phase });
    const [state] = await db
      .delete(githubInstallationStates)
      .where(
        and(
          eq(githubInstallationStates.stateHash, hash(params.stateToken)),
          eq(githubInstallationStates.sessionId, payload.sessionId),
          eq(githubInstallationStates.userId, payload.userId),
          eq(githubInstallationStates.tenantId, payload.tenantId),
          eq(githubInstallationStates.phase, phase),
          gt(githubInstallationStates.expiresAt, new Date())
        )
      )
      .returning();
    if (!state || state.installationId !== payload.installationId) throw invalidState();
    return { payload, state };
  }

  async beginUserAuthorization(params) {
    this.#configured();
    if (!numericId(params.installationId)) throw new ValidationError('Invalid installation ID');
    return this.db.transaction(async (tx) => {
      const { payload } = await this.#consumeState(tx, params, 'install');
      const state = await this.#issueState(
        tx,
        this.#context(params),
        'authorize',
        String(params.installationId)
      );
      const url = new URL('https://github.com/login/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: payload.callbackUrl,
        state: state.stateToken,
        code_challenge: crypto.createHash('sha256').update(state.codeVerifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      return { stateToken: state.stateToken, authorizationUrl: url.href };
    });
  }

  async #json(url, options = {}) {
    try {
      const response = await this.fetch(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw deny();
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw deny();
      return data;
    } catch {
      throw deny();
    } // Never expose token bodies or fall back to App-level visibility.
  }

  #headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Antigravity-Career-Hub/0.1.0',
    };
  }

  async verifyGitHubInstallation(installationId) {
    this.#configured();
    const data = await this.#json(
      `${this.authManager.baseUrl}/app/installations/${installationId}`,
      {
        headers: this.#headers(this.authManager.getAppJwt()),
      }
    );
    this.#validateInstallation(data, installationId);
    if (
      !['read', 'write'].includes(data.permissions?.contents) ||
      !['read', 'write'].includes(data.permissions?.metadata)
    )
      throw deny();
    return data;
  }

  #validateInstallation(data, installationId) {
    if (
      !numericId(data.id) ||
      String(data.id) !== String(installationId) ||
      String(data.app_id) !== String(this.authManager.appId) ||
      !numericId(data.account?.id) ||
      typeof data.account.login !== 'string' ||
      !data.account.login ||
      !['User', 'Organization'].includes(data.account.type) ||
      data.suspended_at !== null ||
      !['all', 'selected'].includes(data.repository_selection)
    )
      throw deny();
  }

  async #verifyUserAuthority(code, state, payload) {
    const token = await this.#json('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: payload.callbackUrl,
        code_verifier: decryptSecret(state.encryptedCodeVerifier, this.masterKey),
      }).toString(),
    });
    if (
      token.error ||
      typeof token.access_token !== 'string' ||
      !token.access_token.startsWith('ghu_') ||
      token.token_type !== 'bearer'
    )
      throw deny();
    const headers = this.#headers(token.access_token);
    const base = this.authManager.baseUrl;
    const profile = await this.#json(`${base}/user`, { headers });
    if (
      !numericId(profile.id) ||
      String(profile.id) !== payload.githubUserId ||
      profile.type !== 'User'
    )
      throw deny();
    let accessible;
    // Never follow arbitrary Link URLs with credentials. Overflow fails closed.
    for (let page = 1; page <= 10; page++) {
      const list = await this.#json(`${base}/user/installations?per_page=100&page=${page}`, {
        headers,
      });
      if (
        !Array.isArray(list.installations) ||
        !Number.isSafeInteger(list.total_count) ||
        list.total_count < 0 ||
        list.installations.length > 100
      )
        throw deny();
      accessible = list.installations.find(
        (item) => item && String(item.id) === payload.installationId
      );
      if (accessible) break;
      if (list.installations.length < 100) throw deny();
    }
    if (!accessible) throw deny();
    this.#validateInstallation(accessible, payload.installationId);
    if (accessible.account.type === 'User') {
      if (String(accessible.account.id) !== payload.githubUserId) throw deny();
    } else {
      // Installation tokens cover more than a repository collaborator's accessible subset.
      // Therefore org installations require an active organization owner (role=admin).
      const membership = await this.#json(
        `${base}/user/memberships/orgs/${encodeURIComponent(accessible.account.login)}`,
        { headers }
      );
      if (
        membership.state !== 'active' ||
        membership.role !== 'admin' ||
        membership.organization?.id !== accessible.account.id
      )
        throw deny();
    }
    const verified = await this.verifyGitHubInstallation(payload.installationId);
    if (
      verified.account.id !== accessible.account.id ||
      verified.account.type !== accessible.account.type
    )
      throw deny();
    return verified;
  }

  // Legacy callers also need complete user authorization. There is no App-JWT-only linking path.
  async linkInstallation(params) {
    this.#configured();
    this.#context(params);
    if (typeof params.code !== 'string' || !params.code || params.code.length > 1024)
      throw invalidState();
    const payload = this.validateInstallationState({ ...params, phase: 'authorize' });
    if (
      params.installationId !== undefined &&
      String(params.installationId) !== payload.installationId
    )
      throw invalidState();
    // Burn state BEFORE network verification: every failed attempt requires a fresh flow.
    const consumed = await this.#consumeState(this.db, params, 'authorize');
    const verified = await this.#verifyUserAuthority(params.code, consumed.state, consumed.payload);
    const result = await this.db.transaction(async (tx) => {
      const claimed = await upsertGitHubAppConnection(tx, {
        tenantId: params.tenantId,
        userId: params.user.id,
        installationId: payload.installationId,
        externalAccountId: String(verified.account.id),
        externalAccountName: verified.account.login,
        displayName: `GitHub (${verified.account.login})`,
        keyVersion: this.keyVersion,
        encryptedCredentials: encryptSecret(
          JSON.stringify({
            installationId: payload.installationId,
            targetType: verified.account.type,
            linkedByUserId: params.user.id,
            linkedAt: new Date().toISOString(),
          }),
          this.masterKey,
          this.keyVersion
        ),
        scopes: ['contents:read', 'metadata:read'],
        status: 'ACTIVE',
        metadata: {
          repositorySelection: verified.repository_selection,
          targetType: verified.account.type,
          accountAvatarUrl: verified.account.avatar_url || '',
          accountHtmlUrl: verified.account.html_url || '',
          authorizedGithubUserId: payload.githubUserId,
          authorityPolicy: 'personal-owner-or-org-owner-v1',
        },
      });
      await writeAuditRecord(tx, {
        ...params.reqContext,
        tenantId: params.tenantId,
        userId: params.user.id,
        eventType: claimed.isUpdate ? 'github.installation_updated' : 'github.installation_linked',
        resourceId: claimed.connection.id,
        details: {
          installationId: payload.installationId,
          githubUserId: payload.githubUserId,
          authorityPolicy: 'personal-owner-or-org-owner-v1',
          isUpdate: claimed.isUpdate,
        },
      });
      return claimed;
    });
    this.tokenCache?.evict(params.tenantId, payload.installationId);
    return result;
  }

  async updateInstallation(params) {
    return this.linkInstallation(params);
  }
}
