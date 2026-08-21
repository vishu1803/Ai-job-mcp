/**
 * @file Unit Tests for GitHub Deep Repository Inspection (Task P3-005)
 *
 * Tests:
 * 1. getReadme (Base64 decoding, 256KB truncation, missing 404 safety)
 * 2. getRepositoryTree (10-level depth, 1000-entry cap, symlink & binary filtering, upstream truncated flag)
 * 3. getLanguages (byte-to-percentage conversion, deterministic sort, empty map handling)
 * 4. getRecentCommits (pagination, 500-char message pruning, author PII removal, SHA validation)
 * 5. getFileContent (1MB limit, binary extension blocklist, null-byte sniffing, symlink/dir rejection, path traversal)
 * 6. Error normalization (401, 403, 404, 429, 5xx, timeouts, inactive connection)
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../src/connectors/github/token-cache.js';
import { CONNECTOR_CAPABILITIES } from '../../src/connectors/base/capabilities.js';
import { createConnectorContext } from '../../src/connectors/base/context.js';
import {
  ConnectorAuthError,
  InsufficientScopeError,
  ProviderRateLimitError,
  ConnectionInactiveError,
} from '../../src/connectors/errors/connector-errors.js';
import { ValidationError } from '../../src/errors/index.js';

describe('GitHub Deep Repository Inspection Unit Tests (P3-005)', () => {
  let testKeyPair;
  let rawPemPrivateKey;
  let authManager;
  let tokenCache;

  const testAppId = 123456;
  const tenantId = crypto.randomUUID();
  const installationId = '155430459';
  const connectionId = crypto.randomUUID();
  const userId = crypto.randomUUID();

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

  const revokedContext = Object.assign(
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
      fetchFn: async () => ({
        ok: true,
        status: 201,
        json: async () => ({
          token: 'ghs_mock_token_123',
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          permissions: { contents: 'read', metadata: 'read' },
          repository_selection: 'all',
        }),
      }),
    });
  });

  // -------------------------------------------------------------------------
  // 1. Capability Verification
  // -------------------------------------------------------------------------
  describe('1. Capabilities', () => {
    it('declares READ_CONTENT capability', () => {
      const connector = new GitHubAppConnector({ authManager });
      const capabilities = connector.getCapabilities();

      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_CONTENT));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_ACCOUNT));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.LIST_RESOURCES));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.READ_RESOURCE));
      assert.ok(capabilities.has(CONNECTOR_CAPABILITIES.REVOKE_ACCESS));
    });
  });

  // -------------------------------------------------------------------------
  // 2. getReadme() Tests
  // -------------------------------------------------------------------------
  describe('2. getReadme()', () => {
    it('extracts and decodes valid base64 README content', async () => {
      const readmeMarkdown = '# Antigravity Career Agent\n\nAI career intelligence MCP server.';
      const base64Content = Buffer.from(readmeMarkdown).toString('base64');

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

        if (url.includes('/repositories/1338724502/readme')) {
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              name: 'README.md',
              path: 'README.md',
              sha: '95b9c0f992202d46e38ee1523dd022f36d4b4a1b',
              size: Buffer.byteLength(readmeMarkdown),
              content: base64Content + '\n',
              encoding: 'base64',
              download_url: 'https://raw.githubusercontent.com/vishu1803/Ai-job-mcp/main/README.md',
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

      const result = await connector.getReadme(activeContext, mockCredentials, '1338724502');

      assert.strictEqual(result.name, 'README.md');
      assert.strictEqual(result.path, 'README.md');
      assert.strictEqual(result.sha, '95b9c0f992202d46e38ee1523dd022f36d4b4a1b');
      assert.strictEqual(result.content, readmeMarkdown);
      assert.strictEqual(result.encoding, 'utf-8');
      assert.strictEqual(result.truncated, false);
      assert.ok(result.downloadUrl.includes('README.md'));
    });

    it('truncates oversized README exceeding 256 KB', async () => {
      const hugeMarkdown = 'A'.repeat(300 * 1024); // 300 KB
      const base64Content = Buffer.from(hugeMarkdown).toString('base64');

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            name: 'README.md',
            path: 'README.md',
            size: hugeMarkdown.length,
            content: base64Content,
            encoding: 'base64',
          }),
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

      const result = await connector.getReadme(activeContext, mockCredentials, '1338724502');

      assert.strictEqual(result.truncated, true);
      assert.strictEqual(result.content.length, 262144); // 256 KB
    });

    it('returns null when repository lacks a README (404)', async () => {
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

        return {
          ok: false,
          status: 404,
          headers: new globalThis.Headers(),
          json: async () => ({ message: 'Not Found' }),
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

      const result = await connector.getReadme(activeContext, mockCredentials, '1338724502');
      assert.strictEqual(result, null);
    });
  });

  // -------------------------------------------------------------------------
  // 3. getRepositoryTree() Tests
  // -------------------------------------------------------------------------
  describe('3. getRepositoryTree()', () => {
    it('normalizes tree, excludes symlinks and binaries, and calculates depth', async () => {
      const mockTree = [
        { path: 'package.json', mode: '100644', type: 'blob', sha: 'sha-pkg', size: 500 },
        { path: 'src', mode: '040000', type: 'tree', sha: 'sha-src' },
        { path: 'src/index.js', mode: '100644', type: 'blob', sha: 'sha-idx', size: 1200 },
        { path: 'src/components', mode: '040000', type: 'tree', sha: 'sha-cmp' },
        { path: 'src/components/App.js', mode: '100644', type: 'blob', sha: 'sha-app', size: 800 },
        { path: 'assets/logo.png', mode: '100644', type: 'blob', sha: 'sha-png', size: 4000 }, // binary -> exclude
        { path: 'bundle.wasm', mode: '100644', type: 'blob', sha: 'sha-wasm', size: 50000 }, // binary -> exclude
        { path: 'link_to_src', mode: '120000', type: 'blob', sha: 'sha-sym' }, // symlink -> exclude
        {
          path: 'a/b/c/d/e/f/g/h/i/j/k/deep.js',
          mode: '100644',
          type: 'blob',
          sha: 'sha-deep',
          size: 100,
        }, // depth 12 > 10 -> exclude
      ];

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            sha: 'root-tree-sha-123',
            tree: mockTree,
            truncated: false,
          }),
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

      const result = await connector.getRepositoryTree(
        activeContext,
        mockCredentials,
        'vishu1803/Ai-job-mcp'
      );

      assert.strictEqual(result.sha, 'root-tree-sha-123');
      assert.strictEqual(result.truncated, false);
      assert.strictEqual(result.totalEntries, 5);
      assert.strictEqual(result.entries.length, 5);

      const paths = result.entries.map((e) => e.path);
      assert.ok(paths.includes('package.json'));
      assert.ok(paths.includes('src/index.js'));
      assert.ok(paths.includes('src/components/App.js'));
      assert.ok(!paths.includes('assets/logo.png')); // binary excluded
      assert.ok(!paths.includes('bundle.wasm')); // binary excluded
      assert.ok(!paths.includes('link_to_src')); // symlink excluded
      assert.ok(!paths.includes('a/b/c/d/e/f/g/h/i/j/k/deep.js')); // depth > 10 excluded

      const appEntry = result.entries.find((e) => e.path === 'src/components/App.js');
      assert.strictEqual(appEntry.depth, 3);
    });

    it('caps tree at 1,000 entries and marks truncated: true', async () => {
      const mockHugeTree = [];
      for (let i = 1; i <= 1200; i++) {
        mockHugeTree.push({
          path: `file_${i}.js`,
          mode: '100644',
          type: 'blob',
          sha: `sha-${i}`,
          size: 100,
        });
      }

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            sha: 'huge-tree-sha',
            tree: mockHugeTree,
            truncated: false,
          }),
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

      const result = await connector.getRepositoryTree(
        activeContext,
        mockCredentials,
        '1338724502'
      );

      assert.strictEqual(result.totalEntries, 1000);
      assert.strictEqual(result.entries.length, 1000);
      assert.strictEqual(result.truncated, true);
    });

    it('propagates upstream GitHub truncated flag', async () => {
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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            sha: 'tree-truncated-sha',
            tree: [{ path: 'index.js', mode: '100644', type: 'blob', sha: 'sha-1' }],
            truncated: true,
          }),
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

      const result = await connector.getRepositoryTree(
        activeContext,
        mockCredentials,
        '1338724502'
      );
      assert.strictEqual(result.truncated, true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. getLanguages() Tests
  // -------------------------------------------------------------------------
  describe('4. getLanguages()', () => {
    it('calculates byte percentages and returns deterministic sorted languages', async () => {
      const mockLanguages = {
        JavaScript: 70000,
        HTML: 20000,
        CSS: 10000,
      };

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => mockLanguages,
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

      const result = await connector.getLanguages(activeContext, mockCredentials, '1338724502');

      assert.strictEqual(result.totalBytes, 100000);
      assert.strictEqual(result.primaryLanguage, 'JavaScript');
      assert.strictEqual(result.languages.length, 3);

      assert.deepStrictEqual(result.languages[0], {
        name: 'JavaScript',
        bytes: 70000,
        percentage: 70.0,
      });
      assert.deepStrictEqual(result.languages[1], {
        name: 'HTML',
        bytes: 20000,
        percentage: 20.0,
      });
      assert.deepStrictEqual(result.languages[2], {
        name: 'CSS',
        bytes: 10000,
        percentage: 10.0,
      });
    });

    it('handles empty repository language breakdown cleanly', async () => {
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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({}),
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

      const result = await connector.getLanguages(activeContext, mockCredentials, '1338724502');

      assert.strictEqual(result.totalBytes, 0);
      assert.strictEqual(result.primaryLanguage, null);
      assert.deepStrictEqual(result.languages, []);
    });
  });

  // -------------------------------------------------------------------------
  // 5. getRecentCommits() Tests
  // -------------------------------------------------------------------------
  describe('5. getRecentCommits()', () => {
    it('normalizes commits, removes author email, and prunes message', async () => {
      const longMessage = 'feat(core): ' + 'X'.repeat(600); // > 500 chars

      const mockCommits = [
        {
          sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
          commit: {
            message: longMessage,
            author: {
              name: 'Vishwanath Nishad',
              email: 'private_email@example.com', // MUST be removed
              date: '2026-08-21T18:00:00Z',
            },
          },
          author: {
            login: 'vishu1803',
            avatar_url: 'https://avatars.githubusercontent.com/u/97516061?v=4',
          },
          html_url:
            'https://github.com/vishu1803/Ai-job-mcp/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        },
      ];

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => mockCommits,
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

      const result = await connector.getRecentCommits(
        activeContext,
        mockCredentials,
        '1338724502',
        {
          limit: 10,
        }
      );

      assert.strictEqual(result.items.length, 1);
      const commit = result.items[0];

      assert.strictEqual(commit.sha, 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
      assert.strictEqual(commit.shortSha, 'a1b2c3d');
      assert.strictEqual(commit.message.length, 500); // pruned
      assert.strictEqual(commit.author.login, 'vishu1803');
      assert.strictEqual(commit.author.name, 'Vishwanath Nishad');
      assert.strictEqual(commit.author.email, undefined); // email removed!
      assert.ok(commit.author.date instanceof Date);
    });

    it('supports opaque cursor pagination for commits', async () => {
      let requestedPage = null;

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

        const parsedUrl = new URL(url);
        requestedPage = parsedUrl.searchParams.get('page');

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => [
            {
              sha: '1111111111111111111111111111111111111111',
              commit: { message: 'Commit 1', author: { name: 'Dev', date: '2026-08-20' } },
            },
            {
              sha: '2222222222222222222222222222222222222222',
              commit: { message: 'Commit 2', author: { name: 'Dev', date: '2026-08-21' } },
            },
          ],
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

      // Page 1
      const page1 = await connector.getRecentCommits(activeContext, mockCredentials, '1338724502', {
        limit: 2,
      });

      assert.strictEqual(requestedPage, '1');
      assert.strictEqual(page1.hasMore, true);
      assert.ok(page1.nextCursor);

      // Page 2 using nextCursor
      await connector.getRecentCommits(activeContext, mockCredentials, '1338724502', {
        cursor: page1.nextCursor,
      });

      assert.strictEqual(requestedPage, '2');
    });
  });

  // -------------------------------------------------------------------------
  // 6. getFileContent() Tests & Security Invariants
  // -------------------------------------------------------------------------
  describe('6. getFileContent()', () => {
    it('fetches and decodes valid text file content (e.g. package.json)', async () => {
      const packageJson = JSON.stringify({ name: 'ai-job-mcp', version: '0.1.0' }, null, 2);
      const base64Content = Buffer.from(packageJson).toString('base64');

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

        if (url.includes('/contents/package.json')) {
          return {
            ok: true,
            status: 200,
            headers: new globalThis.Headers(),
            json: async () => ({
              name: 'package.json',
              path: 'package.json',
              sha: 'pkg-sha-123',
              size: Buffer.byteLength(packageJson),
              content: base64Content,
              encoding: 'base64',
              type: 'file',
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

      const result = await connector.getFileContent(
        activeContext,
        mockCredentials,
        '1338724502',
        'package.json'
      );

      assert.strictEqual(result.name, 'package.json');
      assert.strictEqual(result.path, 'package.json');
      assert.strictEqual(result.content, packageJson);
      assert.strictEqual(result.encoding, 'utf-8');
      assert.strictEqual(result.type, 'file');
    });

    it('rejects path traversal attempts (.., leading /, backslashes, null bytes)', async () => {
      const connector = new GitHubAppConnector({ authManager });

      const invalidPaths = [
        '../package.json',
        '../../etc/passwd',
        '/etc/passwd',
        'src/../../secret.txt',
        'src\\index.js',
        'package.json\0.png',
        '',
      ];

      for (const badPath of invalidPaths) {
        await assert.rejects(
          async () =>
            connector.getFileContent(activeContext, mockCredentials, '1338724502', badPath),
          (err) => err instanceof ValidationError && err.code === 'INVALID_FILE_PATH'
        );
      }
    });

    it('rejects blocked binary file extensions immediately without HTTP request', async () => {
      const connector = new GitHubAppConnector({ authManager });

      const blockedFiles = [
        'images/hero.png',
        'avatar.jpg',
        'archive.zip',
        'app.exe',
        'lib.so',
        'font.woff2',
        'report.pdf',
        'module.wasm',
      ];

      for (const binaryPath of blockedFiles) {
        await assert.rejects(
          async () =>
            connector.getFileContent(activeContext, mockCredentials, '1338724502', binaryPath),
          (err) => err instanceof ValidationError && err.code === 'BINARY_FILE_REJECTED'
        );
      }
    });

    it('rejects binary file detected via null-byte content inspection', async () => {
      // Buffer containing binary null byte
      const binaryBuf = Buffer.from([0x68, 0x65, 0x6c, 0x00, 0x6f]);
      const base64Content = binaryBuf.toString('base64');

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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            name: 'custom_data.dat',
            path: 'custom_data.dat',
            size: binaryBuf.length,
            content: base64Content,
            encoding: 'base64',
            type: 'file',
          }),
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
        async () =>
          connector.getFileContent(activeContext, mockCredentials, '1338724502', 'custom_data.dat'),
        (err) => err instanceof ValidationError && err.code === 'BINARY_FILE_REJECTED'
      );
    });

    it('rejects files exceeding 1 MB limit (FILE_TOO_LARGE)', async () => {
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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            name: 'large_dump.sql',
            path: 'large_dump.sql',
            size: 2 * 1024 * 1024, // 2 MB
            content: Buffer.from('select 1;').toString('base64'),
            encoding: 'base64',
            type: 'file',
          }),
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
        async () =>
          connector.getFileContent(activeContext, mockCredentials, '1338724502', 'large_dump.sql'),
        (err) => err instanceof ValidationError && err.code === 'FILE_TOO_LARGE'
      );
    });

    it('rejects symlinks and directory requests', async () => {
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

        return {
          ok: true,
          status: 200,
          headers: new globalThis.Headers(),
          json: async () => ({
            name: 'src_link',
            path: 'src_link',
            type: 'symlink',
            target: 'src',
          }),
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
        async () =>
          connector.getFileContent(activeContext, mockCredentials, '1338724502', 'src_link'),
        (err) => err instanceof ValidationError && err.code === 'SYMLINK_REJECTED'
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. Hermetic HTTP Error Mappings & Inactive Status Guards
  // -------------------------------------------------------------------------
  describe('7. Error Handling & Inactive Connection Guards', () => {
    it('rejects revoked or disconnected connection before issuing HTTP requests', async () => {
      const connector = new GitHubAppConnector({ authManager });

      await assert.rejects(
        async () => connector.getReadme(revokedContext, mockCredentials, '1338724502'),
        (err) => err instanceof ConnectionInactiveError
      );

      await assert.rejects(
        async () => connector.getRepositoryTree(revokedContext, mockCredentials, '1338724502'),
        (err) => err instanceof ConnectionInactiveError
      );

      await assert.rejects(
        async () => connector.getLanguages(revokedContext, mockCredentials, '1338724502'),
        (err) => err instanceof ConnectionInactiveError
      );

      await assert.rejects(
        async () => connector.getRecentCommits(revokedContext, mockCredentials, '1338724502'),
        (err) => err instanceof ConnectionInactiveError
      );

      await assert.rejects(
        async () =>
          connector.getFileContent(
            revokedContext,
            mockCredentials,
            '1338724502',
            'src/package.json'
          ),
        (err) => err instanceof ConnectionInactiveError
      );
    });

    it('maps 401 Unauthorized to ConnectorAuthError and invalidates token cache', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_cached_token',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }),
          };
        }

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

      const connector = new GitHubAppConnector({
        authManager: customAuth,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        async () => connector.getLanguages(activeContext, mockCredentials, '1338724502'),
        (err) => err instanceof ConnectorAuthError
      );

      // Cache must be evicted
      assert.strictEqual(tokenCache.get(tenantId, installationId), null);
    });

    it('maps 403 Insufficient Scope to InsufficientScopeError', async () => {
      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token',
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
        async () => connector.getRepositoryTree(activeContext, mockCredentials, '1338724502'),
        (err) => err instanceof InsufficientScopeError
      );
    });

    it('maps 429 Rate Limit to ProviderRateLimitError', async () => {
      const resetEpoch = Math.floor(Date.now() / 1000) + 120;

      const mockFetch = async (url) => {
        if (url.includes('/access_tokens')) {
          return {
            ok: true,
            status: 201,
            json: async () => ({
              token: 'ghs_token',
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
          json: async () => ({ message: 'API rate limit exceeded' }),
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
        async () => connector.getLanguages(activeContext, mockCredentials, '1338724502'),
        (err) => err instanceof ProviderRateLimitError
      );
    });
  });
});
