/**
 * @file GitHub App Resource Connector Implementation (Task P3-004)
 *
 * Implements the provider-neutral BaseResourceConnector abstraction for GitHub:
 * 1. getAccount: Retrieves installation owner account metadata (NormalizedAccount)
 * 2. listResources: Lists accessible repositories with opaque Base64URL cursor pagination (PaginatedResult<NormalizedResource>)
 * 3. getResource: Fetches single repository by numeric ID or 'owner/repo' (NormalizedResource)
 * 4. validate: Connection health check against GitHub REST API
 * 5. revokeAccess: Upstream token revocation and in-memory cache eviction
 *
 * Security & Design Invariants:
 * - Stateless instance: Holds zero tokens, keys, or tenant state in instance variables
 * - Node.js native fetch with AbortSignal.timeout(10000)
 * - Rate-limit header tracking with proactive logging threshold
 * - Bounded exponential jittered backoff for transient 5xx / timeouts (max 2 retries)
 * - Comprehensive error mapping (401, 403 scope, 403/429 rate limit, 404, 5xx)
 * - Immediate token cache eviction on HTTP 401
 */

import { Buffer } from 'node:buffer';
import { BaseResourceConnector } from '../base/resource-connector.js';
import { CONNECTOR_CAPABILITIES } from '../base/capabilities.js';
import {
  createNormalizedAccount,
  createNormalizedResource,
  createPaginatedResult,
  createPaginationOptions,
} from '../base/models.js';
import {
  ConnectorAuthError,
  InsufficientScopeError,
  ProviderRateLimitError,
  ResourceNotFoundError,
  ProviderUnavailableError,
  ConnectionInactiveError,
} from '../errors/connector-errors.js';
import { ValidationError } from '../../errors/index.js';
import { logger } from '../../utils/logger.js';

export class GitHubAppConnector extends BaseResourceConnector {
  /**
   * @param {object} options
   * @param {import('./auth.js').GitHubAppAuthManager} options.authManager - GitHub App authentication manager
   * @param {typeof fetch} [options.fetchFn=globalThis.fetch] - HTTP fetch client
   * @param {string} [options.baseUrl='https://api.github.com'] - GitHub REST API base URL
   * @param {number} [options.timeoutMs=10000] - Request timeout in milliseconds (10s)
   */
  constructor({
    authManager,
    fetchFn = globalThis.fetch,
    baseUrl = 'https://api.github.com',
    timeoutMs = 10000,
  } = {}) {
    super('GITHUB_APP');
    if (!authManager) {
      throw new ValidationError('authManager is mandatory to instantiate GitHubAppConnector');
    }
    this.authManager = authManager;
    this.fetch = fetchFn;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Declares the supported capability set for GitHubAppConnector.
   *
   * @returns {ReadonlySet<string>}
   */
  getCapabilities() {
    return new Set([
      CONNECTOR_CAPABILITIES.READ_ACCOUNT,
      CONNECTOR_CAPABILITIES.LIST_RESOURCES,
      CONNECTOR_CAPABILITIES.READ_RESOURCE,
      CONNECTOR_CAPABILITIES.REVOKE_ACCESS,
    ]);
  }

  /**
   * Asserts that the connection is in an active, callable state.
   *
   * @private
   * @param {import('../base/context.js').ConnectorContext} context
   */
  _assertActiveConnection(context) {
    if (!context || !context.connectionId) {
      throw new ValidationError('ConnectorContext is required');
    }
    const status = context.connectionStatus || 'ACTIVE';
    if (status !== 'ACTIVE') {
      throw new ConnectionInactiveError(context.connectionId, status);
    }
  }

  /**
   * Encodes pagination parameters into an opaque Base64URL cursor token.
   *
   * @private
   * @param {number} page
   * @param {number} limit
   * @returns {string}
   */
  _encodeCursor(page, limit) {
    const payload = {
      page: Number(page),
      limit: Number(limit),
      issuedAt: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  /**
   * Decodes and validates an opaque Base64URL cursor token.
   *
   * @private
   * @param {string|null} cursor
   * @param {number} defaultLimit
   * @returns {{ page: number, limit: number }}
   */
  _decodeCursor(cursor, defaultLimit = 50) {
    if (!cursor) {
      return { page: 1, limit: defaultLimit };
    }

    try {
      const decodedStr = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decodedStr);

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.page !== 'number' ||
        !Number.isInteger(parsed.page) ||
        parsed.page < 1 ||
        typeof parsed.limit !== 'number' ||
        !Number.isInteger(parsed.limit) ||
        parsed.limit < 1 ||
        parsed.limit > 100
      ) {
        throw new ValidationError(
          'Invalid pagination cursor structure',
          'INVALID_PAGINATION_CURSOR'
        );
      }

      return { page: parsed.page, limit: parsed.limit };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError(
        'Malformed or unreadable pagination cursor',
        'INVALID_PAGINATION_CURSOR'
      );
    }
  }

  /**
   * Executes an authenticated GitHub REST API request with header management,
   * rate-limit tracking, timeouts, and bounded retry backoff.
   *
   * @private
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} endpoint - Path relative to baseUrl
   * @param {object} [options]
   * @param {string} [options.method='GET']
   * @param {object} [options.body]
   * @returns {Promise<{ data: any, headers: Headers, status: number }>}
   */
  async _request(context, credentials, endpoint, options = {}) {
    this._assertActiveConnection(context);

    const installationId = credentials?.installationId;
    if (!installationId) {
      throw new ValidationError('installationId is missing from connection credentials');
    }

    const method = options.method || 'GET';
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    // Get short-lived installation access token (in-memory cached)
    const tokenInfo = await this.authManager.getInstallationToken({
      tenantId: context.tenantId,
      installationId,
    });

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      const startTime = Date.now();
      try {
        const res = await this.fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${tokenInfo.token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Antigravity-Career-Hub/0.1.0',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: globalThis.AbortSignal.timeout(this.timeoutMs),
        });

        const latencyMs = Date.now() - startTime;
        const rateLimitRemaining = res.headers?.get?.('x-ratelimit-remaining') ?? null;
        const rateLimitReset = res.headers?.get?.('x-ratelimit-reset') ?? null;
        const retryAfter = res.headers?.get?.('retry-after') ?? null;

        if (rateLimitRemaining !== null && Number(rateLimitRemaining) <= 5) {
          logger.warn({
            provider: 'GITHUB_APP',
            operation: endpoint,
            tenantId: context.tenantId,
            installationId: String(installationId),
            rateLimitRemaining: Number(rateLimitRemaining),
            rateLimitReset,
            latencyMs,
            msg: 'GitHub API rate limit remaining quota is critically low (<= 5)',
          });
        }

        if (res.ok) {
          let data = null;
          if (res.status !== 204) {
            data = await res.json();
          }
          return { data, headers: res.headers, status: res.status };
        }

        // 401 Unauthorized -> Evict token cache immediately and throw ConnectorAuthError
        if (res.status === 401) {
          this.authManager.evictInstallationTokens(context.tenantId, installationId);
          throw new ConnectorAuthError(
            'GITHUB_APP',
            'GitHub App installation token is invalid or expired',
            { statusCode: 401, installationId: String(installationId) }
          );
        }

        // 403 Rate Limit / 429 Too Many Requests
        if (res.status === 429 || (res.status === 403 && rateLimitRemaining === '0')) {
          const resetTimestamp = rateLimitReset ? Number(rateLimitReset) : undefined;
          const retryAfterSec = retryAfter
            ? Number(retryAfter)
            : resetTimestamp
              ? Math.max(1, Math.ceil(resetTimestamp - Date.now() / 1000))
              : 60;

          if (retryAfterSec <= 2 && attempt < maxRetries) {
            attempt++;
            await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
            continue;
          }

          throw new ProviderRateLimitError('GITHUB_APP', retryAfterSec, resetTimestamp);
        }

        // 403 Forbidden (Insufficient permissions / scope)
        if (res.status === 403) {
          throw new InsufficientScopeError('GITHUB_APP', ['metadata:read'], []);
        }

        // 404 Not Found
        if (res.status === 404) {
          throw new ResourceNotFoundError('GITHUB_APP', endpoint);
        }

        // 5xx Server Errors (Transient)
        if (res.status >= 500 && attempt < maxRetries) {
          attempt++;
          const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 100, 3000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new ProviderUnavailableError(
          'GITHUB_APP',
          `GitHub API responded with error status ${res.status}`,
          res.status >= 500
        );
      } catch (err) {
        if (
          err instanceof ConnectorAuthError ||
          err instanceof InsufficientScopeError ||
          err instanceof ProviderRateLimitError ||
          err instanceof ResourceNotFoundError ||
          err instanceof ConnectionInactiveError ||
          err instanceof ValidationError
        ) {
          throw err;
        }

        // Handle timeouts or network aborts
        const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
        if (
          (isTimeout || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') &&
          attempt < maxRetries
        ) {
          attempt++;
          const backoffMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 100, 3000);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        if (err instanceof ProviderUnavailableError) {
          throw err;
        }

        throw new ProviderUnavailableError(
          'GITHUB_APP',
          isTimeout
            ? 'Request to GitHub API timed out after 10 seconds'
            : `Network error connecting to GitHub: ${err.message}`,
          true
        );
      }
    }

    throw new ProviderUnavailableError(
      'GITHUB_APP',
      'Exceeded maximum request retries to GitHub API',
      true
    );
  }

  /**
   * Retrieves normalized profile metadata for the installation target account.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @returns {Promise<import('../base/models.js').NormalizedAccount>}
   */
  async getAccount(context, credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_ACCOUNT);
    this._assertActiveConnection(context);

    // Prefer getting installation metadata from /installation/repositories
    const { data } = await this._request(
      context,
      credentials,
      '/installation/repositories?per_page=1'
    );

    if (!data || typeof data !== 'object') {
      throw new ProviderUnavailableError(
        'GITHUB_APP',
        'Malformed response received for account query',
        false
      );
    }

    let account = null;
    if (
      Array.isArray(data.repositories) &&
      data.repositories.length > 0 &&
      data.repositories[0].owner
    ) {
      account = data.repositories[0].owner;
    }

    // Fallback if repository array is empty: fetch installation directly via App JWT
    if (!account) {
      const verified = await this.fetch(
        `${this.baseUrl}/app/installations/${credentials.installationId}`,
        {
          headers: {
            Authorization: `Bearer ${this.authManager.getAppJwt()}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'Antigravity-Career-Hub/0.1.0',
          },
          signal: globalThis.AbortSignal.timeout(this.timeoutMs),
        }
      );

      if (verified.ok) {
        const installData = await verified.json();
        account = installData.account;
      }
    }

    if (!account || !account.id || !account.login) {
      throw new ProviderUnavailableError(
        'GITHUB_APP',
        'Unable to resolve GitHub installation account metadata',
        false
      );
    }

    return createNormalizedAccount({
      id: String(account.id),
      name: account.login,
      displayName: account.login,
      avatarUrl: account.avatar_url || null,
      provider: 'GITHUB_APP',
      accountType: account.type === 'Organization' ? 'ORGANIZATION' : 'USER',
      metadata: {
        repositorySelection: data.repository_selection || 'all',
        targetType: account.type || 'User',
        htmlUrl: account.html_url || null,
      },
    });
  }

  /**
   * Lists repositories accessible to the GitHub App installation with opaque cursor pagination.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {import('../base/models.js').PaginationOptions} [options={}]
   * @returns {Promise<import('../base/models.js').PaginatedResult<import('../base/models.js').NormalizedResource>>}
   */
  async listResources(context, credentials, options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.LIST_RESOURCES);
    this._assertActiveConnection(context);

    const pagination = createPaginationOptions(options);
    const { page, limit } = this._decodeCursor(pagination.cursor, pagination.limit);

    const { data } = await this._request(
      context,
      credentials,
      `/installation/repositories?per_page=${limit}&page=${page}`
    );

    if (!data || !Array.isArray(data.repositories)) {
      throw new ProviderUnavailableError(
        'GITHUB_APP',
        'Malformed repositories list response received from GitHub',
        false
      );
    }

    const items = data.repositories.map((repo) => this._normalizeRepository(repo));
    const totalCount = typeof data.total_count === 'number' ? data.total_count : items.length;

    const hasMore = items.length === limit && page * limit < totalCount;
    const nextCursor = hasMore ? this._encodeCursor(page + 1, limit) : null;

    return createPaginatedResult({
      items,
      nextCursor,
      hasMore,
      totalCount,
    });
  }

  /**
   * Fetches detailed metadata for a single repository by numeric ID or 'owner/repo'.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId - Numeric repository ID or 'owner/repo'
   * @returns {Promise<import('../base/models.js').NormalizedResource>}
   */
  async getResource(context, credentials, externalResourceId) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_RESOURCE);
    this._assertActiveConnection(context);

    if (
      !externalResourceId ||
      typeof externalResourceId !== 'string' ||
      externalResourceId.trim().length === 0
    ) {
      throw new ValidationError('externalResourceId is required');
    }

    const trimmedId = externalResourceId.trim();
    let endpoint;

    if (/^\d+$/.test(trimmedId)) {
      // Canonical Numeric ID lookup
      endpoint = `/repositories/${trimmedId}`;
    } else if (trimmedId.includes('/')) {
      // Secondary owner/repo lookup
      const parts = trimmedId.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new ValidationError(
          `Invalid repository format '${externalResourceId}'. Must be numeric ID or 'owner/repo'`,
          'INVALID_RESOURCE_ID'
        );
      }
      endpoint = `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
    } else {
      throw new ValidationError(
        `Invalid repository identifier '${externalResourceId}'. Expected numeric ID or 'owner/repo'`,
        'INVALID_RESOURCE_ID'
      );
    }

    try {
      const { data } = await this._request(context, credentials, endpoint);
      if (!data || !data.id || !data.name) {
        throw new ProviderUnavailableError(
          'GITHUB_APP',
          'Malformed repository response received from GitHub',
          false
        );
      }
      return this._normalizeRepository(data);
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        throw new ResourceNotFoundError('GITHUB_APP', externalResourceId);
      }
      throw err;
    }
  }

  /**
   * Normalizes a raw GitHub repository API object into a NormalizedResource.
   *
   * @private
   * @param {object} repo - Raw GitHub repository object
   * @returns {import('../base/models.js').NormalizedResource}
   */
  _normalizeRepository(repo) {
    if (!repo || !repo.id || !repo.name) {
      throw new ValidationError('Invalid repository payload missing required fields');
    }

    const languages = repo.language ? [repo.language] : [];

    return createNormalizedResource({
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name || repo.name,
      type: 'REPOSITORY',
      url: repo.html_url || null,
      defaultBranch: repo.default_branch || 'main',
      isPrivate: Boolean(repo.private),
      languages,
      updatedAt: repo.updated_at ? new Date(repo.updated_at) : null,
      metadata: {
        numericId: Number(repo.id),
        description: repo.description || null,
        archived: Boolean(repo.archived),
        fork: Boolean(repo.fork),
        visibility: repo.visibility || (repo.private ? 'private' : 'public'),
        stargazersCount: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : 0,
        forksCount: typeof repo.forks_count === 'number' ? repo.forks_count : 0,
        openIssuesCount: typeof repo.open_issues_count === 'number' ? repo.open_issues_count : 0,
        size: typeof repo.size === 'number' ? repo.size : 0,
        license: repo.license?.spdx_id || repo.license?.name || null,
      },
    });
  }

  /**
   * Probes connection health and token access against GitHub REST API.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @returns {Promise<{ healthy: boolean, message?: string }>}
   */
  async validate(context, credentials) {
    try {
      this._assertActiveConnection(context);
      await this._request(context, credentials, '/installation/repositories?per_page=1');
      return {
        healthy: true,
        message: 'GitHub App connection is healthy and authorized',
      };
    } catch (err) {
      return {
        healthy: false,
        message: err.message || 'GitHub connection validation failed',
      };
    }
  }

  /**
   * Revokes upstream installation access token and clears local token cache.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @returns {Promise<void>}
   */
  async revokeAccess(context, credentials) {
    this.assertCapability(CONNECTOR_CAPABILITIES.REVOKE_ACCESS);
    const installationId = credentials?.installationId;

    if (installationId && context?.tenantId) {
      await this.authManager.revokeInstallationToken({
        tenantId: context.tenantId,
        installationId,
      });
    }
  }
}
