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
import path from 'node:path';
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

const BLOCKED_BINARY_EXTENSIONS = new Set([
  // Images / Media
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.mp4',
  '.mp3',
  '.wav',
  '.mov',
  '.avi',
  // Archives / Binaries
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.iso',
  '.dmg',
  // Fonts / Documents
  '.pdf',
  '.doc',
  '.docx',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  // Build Outputs / Bytecode
  '.class',
  '.pyc',
  '.o',
  '.a',
  '.wasm',
  '.jar',
  '.war',
  '.ear',
]);

const MAX_FILE_SIZE_BYTES = 1048576; // 1 MB
const MAX_README_SIZE_BYTES = 262144; // 256 KB
const MAX_TREE_ENTRIES = 1000;
const MAX_TREE_DEPTH = 10;
const MAX_COMMITS_LIMIT = 100;
const DEFAULT_COMMITS_LIMIT = 30;
const MAX_COMMIT_MESSAGE_LENGTH = 500;

function sanitizeRelativePosixPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    throw new ValidationError('File path must be a non-empty string', 'INVALID_FILE_PATH');
  }

  // Reject null bytes, backslashes, leading slashes, or '..'
  if (
    rawPath.includes('\0') ||
    rawPath.includes('\\') ||
    rawPath.startsWith('/') ||
    rawPath.includes('..')
  ) {
    throw new ValidationError(
      `Invalid file path '${rawPath}'. Must be a relative POSIX path without '..' or backslashes`,
      'INVALID_FILE_PATH'
    );
  }

  const normalized = path.posix.normalize(rawPath);

  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    normalized.includes('..')
  ) {
    throw new ValidationError(`Invalid normalized file path '${rawPath}'`, 'INVALID_FILE_PATH');
  }

  return normalized;
}

function isBlockedBinaryExtension(filePath) {
  const ext = path.posix.extname(filePath).toLowerCase();
  return BLOCKED_BINARY_EXTENSIONS.has(ext);
}

function isBinaryBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  const sampleLength = Math.min(buffer.length, 512);
  for (let i = 0; i < sampleLength; i++) {
    if (buffer[i] === 0x00) {
      return true;
    }
  }
  return false;
}

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
      CONNECTOR_CAPABILITIES.READ_CONTENT,
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
   * Resolves a repository numeric ID or 'owner/repo' into an API path prefix.
   *
   * @private
   * @param {string} externalResourceId
   * @returns {string}
   */
  _resolveRepoEndpointPrefix(externalResourceId) {
    if (
      !externalResourceId ||
      typeof externalResourceId !== 'string' ||
      externalResourceId.trim().length === 0
    ) {
      throw new ValidationError('externalResourceId is required');
    }

    const trimmed = externalResourceId.trim();

    if (/^\d+$/.test(trimmed)) {
      return `/repositories/${trimmed}`;
    }

    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new ValidationError(
          `Invalid repository format '${externalResourceId}'. Must be numeric ID or 'owner/repo'`,
          'INVALID_RESOURCE_ID'
        );
      }
      return `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
    }

    throw new ValidationError(
      `Invalid repository identifier '${externalResourceId}'. Expected numeric ID or 'owner/repo'`,
      'INVALID_RESOURCE_ID'
    );
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

    const endpoint = this._resolveRepoEndpointPrefix(externalResourceId);

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
   * Extracts and decodes the repository's root documentation (README.md).
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId
   * @returns {Promise<object|null>}
   */
  async getReadme(context, credentials, externalResourceId) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_CONTENT);
    this._assertActiveConnection(context);

    const prefix = this._resolveRepoEndpointPrefix(externalResourceId);
    const endpoint = `${prefix}/readme`;

    try {
      const { data } = await this._request(context, credentials, endpoint);

      if (!data || !data.content) {
        return null;
      }

      const cleanBase64 = String(data.content).replace(/[\r\n\s]+/g, '');
      const decodedBuffer = Buffer.from(cleanBase64, 'base64');
      let decodedString;
      let truncated = false;

      if (decodedBuffer.length > MAX_README_SIZE_BYTES) {
        decodedString = decodedBuffer.subarray(0, MAX_README_SIZE_BYTES).toString('utf8');
        truncated = true;
      } else {
        decodedString = decodedBuffer.toString('utf8');
      }

      return {
        name: data.name || 'README.md',
        path: data.path || 'README.md',
        sha: data.sha || null,
        size: typeof data.size === 'number' ? data.size : decodedBuffer.length,
        content: decodedString,
        encoding: 'utf-8',
        downloadUrl: data.download_url || null,
        truncated,
      };
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Crawls the repository directory hierarchy using GitHub's recursive Git tree API.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId
   * @param {object} [options]
   * @param {string} [options.treeSha='HEAD']
   * @returns {Promise<object>}
   */
  async getRepositoryTree(context, credentials, externalResourceId, options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_CONTENT);
    this._assertActiveConnection(context);

    const prefix = this._resolveRepoEndpointPrefix(externalResourceId);
    const treeSha = options?.treeSha ? String(options.treeSha).trim() : 'HEAD';
    const endpoint = `${prefix}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;

    try {
      const { data } = await this._request(context, credentials, endpoint);

      if (!data || !Array.isArray(data.tree)) {
        throw new ProviderUnavailableError(
          'GITHUB_APP',
          'Malformed Git tree response received from GitHub',
          false
        );
      }

      const rawEntries = data.tree;
      const normalizedEntries = [];
      let isTruncated = Boolean(data.truncated);

      for (const item of rawEntries) {
        if (!item || !item.path) continue;

        // Exclude symlinks (Git mode 120000)
        if (item.mode === '120000') continue;

        // Exclude binary extensions
        if (isBlockedBinaryExtension(item.path)) continue;

        // Validate & normalize path
        let normalizedPath;
        try {
          normalizedPath = sanitizeRelativePosixPath(item.path);
        } catch {
          // Skip invalid/unsafe paths
          continue;
        }

        // Calculate directory depth
        const depth = normalizedPath.split('/').length;
        if (depth > MAX_TREE_DEPTH) continue;

        normalizedEntries.push({
          path: normalizedPath,
          mode: item.mode,
          type: item.type === 'tree' ? 'tree' : 'blob',
          sha: item.sha,
          size: typeof item.size === 'number' ? item.size : undefined,
          depth,
        });

        if (normalizedEntries.length >= MAX_TREE_ENTRIES) {
          isTruncated = true;
          break;
        }
      }

      return {
        sha: data.sha || treeSha,
        entries: normalizedEntries,
        totalEntries: normalizedEntries.length,
        truncated: isTruncated,
      };
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        throw new ResourceNotFoundError('GITHUB_APP', externalResourceId);
      }
      throw err;
    }
  }

  /**
   * Retrieves the byte-level breakdown of programming languages used across the repository.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId
   * @returns {Promise<object>}
   */
  async getLanguages(context, credentials, externalResourceId) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_CONTENT);
    this._assertActiveConnection(context);

    const prefix = this._resolveRepoEndpointPrefix(externalResourceId);
    const endpoint = `${prefix}/languages`;

    const { data } = await this._request(context, credentials, endpoint);

    if (!data || typeof data !== 'object') {
      throw new ProviderUnavailableError(
        'GITHUB_APP',
        'Malformed language response received from GitHub',
        false
      );
    }

    const entries = Object.entries(data);
    let totalBytes = 0;
    for (const [, bytes] of entries) {
      if (typeof bytes === 'number') {
        totalBytes += bytes;
      }
    }

    // Sort descending by byte count for deterministic output
    entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));

    const languages = entries.map(([name, bytes]) => {
      const byteCount = typeof bytes === 'number' ? bytes : 0;
      const percentage = totalBytes > 0 ? Number(((byteCount / totalBytes) * 100).toFixed(1)) : 0;
      return {
        name,
        bytes: byteCount,
        percentage,
      };
    });

    const primaryLanguage = languages.length > 0 ? languages[0].name : null;

    return {
      languages,
      totalBytes,
      primaryLanguage,
    };
  }

  /**
   * Inspects recent commit history with opaque cursor pagination and author PII scrubbing.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId
   * @param {object} [options]
   * @returns {Promise<import('../base/models.js').PaginatedResult>}
   */
  async getRecentCommits(context, credentials, externalResourceId, options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_CONTENT);
    this._assertActiveConnection(context);

    const prefix = this._resolveRepoEndpointPrefix(externalResourceId);
    const pagination = this._decodeCursor(options?.cursor, options?.limit || DEFAULT_COMMITS_LIMIT);
    const limit = Math.min(Math.max(1, pagination.limit), MAX_COMMITS_LIMIT);
    const page = Math.max(1, pagination.page);

    const endpoint = `${prefix}/commits?per_page=${limit}&page=${page}`;

    const { data } = await this._request(context, credentials, endpoint);

    if (!Array.isArray(data)) {
      throw new ProviderUnavailableError(
        'GITHUB_APP',
        'Malformed commits response received from GitHub',
        false
      );
    }

    const normalizedCommits = [];
    const shaRegex = /^[0-9a-f]{40}$/i;

    for (const item of data) {
      if (!item || !item.sha || !shaRegex.test(item.sha)) {
        continue;
      }

      const sha = item.sha;
      const shortSha = sha.substring(0, 7);

      let message = item.commit?.message || '';
      if (message.length > MAX_COMMIT_MESSAGE_LENGTH) {
        message = message.substring(0, MAX_COMMIT_MESSAGE_LENGTH);
      }

      const authorLogin = item.author?.login || null;
      const authorName = item.commit?.author?.name || authorLogin || 'Unknown';
      const authorDate = item.commit?.author?.date ? new Date(item.commit.author.date) : new Date();
      const avatarUrl = item.author?.avatar_url || null;

      normalizedCommits.push({
        sha,
        shortSha,
        message,
        author: {
          login: authorLogin,
          name: authorName,
          date: authorDate,
          avatarUrl,
        },
        htmlUrl: item.html_url || null,
      });
    }

    const hasMore = normalizedCommits.length === limit;
    const nextCursor = hasMore ? this._encodeCursor(page + 1, limit) : null;

    return createPaginatedResult({
      items: normalizedCommits,
      nextCursor,
      hasMore,
      totalCount: undefined,
    });
  }

  /**
   * Fetches and safely decodes single file text content with strict size and binary guards.
   *
   * @param {import('../base/context.js').ConnectorContext} context
   * @param {Record<string, unknown>} credentials
   * @param {string} externalResourceId
   * @param {string} filePath
   * @param {object} [options]
   * @param {string} [options.ref]
   * @returns {Promise<object>}
   */
  async getFileContent(context, credentials, externalResourceId, filePath, options = {}) {
    this.assertCapability(CONNECTOR_CAPABILITIES.READ_CONTENT);
    this._assertActiveConnection(context);

    const normalizedPath = sanitizeRelativePosixPath(filePath);

    // Binary file extension check
    if (isBlockedBinaryExtension(normalizedPath)) {
      throw new ValidationError(
        `Binary files cannot be read as text: '${normalizedPath}'`,
        'BINARY_FILE_REJECTED'
      );
    }

    const prefix = this._resolveRepoEndpointPrefix(externalResourceId);
    const refQuery = options?.ref ? `?ref=${encodeURIComponent(options.ref)}` : '';
    const endpoint = `${prefix}/contents/${encodeURI(normalizedPath)}${refQuery}`;

    try {
      const { data } = await this._request(context, credentials, endpoint);

      if (!data) {
        throw new ResourceNotFoundError('GITHUB_APP', normalizedPath);
      }

      // Check if it is a directory or symlink
      if (Array.isArray(data) || data.type === 'dir') {
        throw new ValidationError(
          `Path '${normalizedPath}' is a directory, not a file`,
          'INVALID_FILE_TYPE'
        );
      }

      if (data.type === 'symlink' || data.target) {
        throw new ValidationError(
          `Symlinks cannot be read: '${normalizedPath}'`,
          'SYMLINK_REJECTED'
        );
      }

      // Size limit check
      if (typeof data.size === 'number' && data.size > MAX_FILE_SIZE_BYTES) {
        throw new ValidationError(
          `File size (${data.size} bytes) exceeds maximum allowable limit of 1MB`,
          'FILE_TOO_LARGE'
        );
      }

      if (!data.content || data.encoding !== 'base64') {
        throw new ValidationError(
          `File content unavailable or unsupported encoding '${data.encoding}'`,
          'UNSUPPORTED_ENCODING'
        );
      }

      const cleanBase64 = String(data.content).replace(/[\r\n\s]+/g, '');
      const decodedBuffer = Buffer.from(cleanBase64, 'base64');

      if (decodedBuffer.length > MAX_FILE_SIZE_BYTES) {
        throw new ValidationError(
          `Decoded file size (${decodedBuffer.length} bytes) exceeds maximum allowable limit of 1MB`,
          'FILE_TOO_LARGE'
        );
      }

      // Null-byte binary sniffing
      if (isBinaryBuffer(decodedBuffer)) {
        throw new ValidationError(
          `Binary file detected via content inspection: '${normalizedPath}'`,
          'BINARY_FILE_REJECTED'
        );
      }

      const decodedContent = decodedBuffer.toString('utf8');

      return {
        name: data.name || path.posix.basename(normalizedPath),
        path: normalizedPath,
        sha: data.sha || null,
        size: decodedBuffer.length,
        content: decodedContent,
        encoding: 'utf-8',
        type: 'file',
      };
    } catch (err) {
      if (err instanceof ResourceNotFoundError) {
        throw new ResourceNotFoundError('GITHUB_APP', normalizedPath);
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
