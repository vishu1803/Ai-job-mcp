/**
 * @file P15-002 Batch 2 unit tests: Backend URL pinning.
 *
 * Covers:
 * 1. validateBackendUrl semantics per environment (scheme, origin-only,
 *    loopback rules, production pinning).
 * 2. BackendClient.getBaseUrl: stored URLs are validated before use, invalid
 *    stored URLs are discarded (never used for credentialed requests), and
 *    the default is used as fallback.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBackendUrl,
  isLoopbackUrl,
  PROD_BACKEND_URL,
} from '../../extension/config.js';
import { BackendClient } from '../../extension/api/backend-client.js';

describe('P15-002 Batch 2: Backend URL pinning (validateBackendUrl)', () => {
  it('accepts http loopback origins in development', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:8080', 'http://localhost']) {
      const result = validateBackendUrl(url, { isProduction: false });
      assert.equal(result.valid, true, `${url} should be valid in dev`);
      assert.equal(result.url, url.replace(/\/+$/, ''));
    }
  });

  it('accepts https origins in development', () => {
    const result = validateBackendUrl('https://staging.aicareershub.tech', { isProduction: false });
    assert.equal(result.valid, true);
  });

  it('rejects plain http to non-loopback hosts even in development', () => {
    const result = validateBackendUrl('http://api.example.com', { isProduction: false });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'BACKEND_URL_INSECURE_PLAINTEXT');
  });

  it('rejects malformed URLs and non-http(s) schemes', () => {
    assert.equal(validateBackendUrl('not a url', { isProduction: false }).reason, 'BACKEND_URL_MALFORMED');
    assert.equal(validateBackendUrl('ftp://localhost:3000', { isProduction: false }).reason, 'BACKEND_URL_BAD_SCHEME');
    assert.equal(validateBackendUrl('chrome-extension://abc', { isProduction: false }).reason, 'BACKEND_URL_BAD_SCHEME');
  });

  it('rejects URLs that are not bare origins (path/query/hash)', () => {
    assert.equal(validateBackendUrl('http://localhost:3000/api', { isProduction: false }).reason, 'BACKEND_URL_NOT_ORIGIN');
    assert.equal(validateBackendUrl('http://localhost:3000?x=1', { isProduction: false }).reason, 'BACKEND_URL_NOT_ORIGIN');
    assert.equal(validateBackendUrl('http://localhost:3000#frag', { isProduction: false }).reason, 'BACKEND_URL_NOT_ORIGIN');
  });

  it('production requires the pinned https origin', () => {
    assert.equal(PROD_BACKEND_URL, 'https://aicareershub.tech');

    const ok = validateBackendUrl('https://aicareershub.tech', { isProduction: true });
    assert.equal(ok.valid, true);

    const insecure = validateBackendUrl('http://aicareershub.tech', { isProduction: true });
    assert.equal(insecure.valid, false);
    assert.equal(insecure.reason, 'BACKEND_URL_INSECURE_FOR_PRODUCTION');

    const unpinned = validateBackendUrl('https://evil.example.com', { isProduction: true });
    assert.equal(unpinned.valid, false);
    assert.equal(unpinned.reason, 'BACKEND_URL_NOT_PINNED');

    const loopback = validateBackendUrl('http://localhost:3000', { isProduction: true });
    assert.equal(loopback.valid, false);
    assert.ok(['BACKEND_URL_INSECURE_FOR_PRODUCTION', 'BACKEND_URL_NOT_PINNED'].includes(loopback.reason));
  });

  it('production rejects private/loopback https hosts (SSRF-style credential exfil)', () => {
    const privateHost = validateBackendUrl('https://192.168.1.10:8443', { isProduction: true });
    assert.equal(privateHost.valid, false);
    assert.equal(privateHost.reason, 'BACKEND_URL_PRIVATE_HOST_FOR_PRODUCTION');
  });

  it('isLoopbackUrl detects loopback origins only', () => {
    assert.equal(isLoopbackUrl('http://localhost:3000'), true);
    assert.equal(isLoopbackUrl('http://127.0.0.1:9333'), true);
    assert.equal(isLoopbackUrl('https://aicareershub.tech'), false);
    assert.equal(isLoopbackUrl('http://localhost.evil.com:3000'), false);
  });
});

describe('P15-002 Batch 2: BackendClient stored-URL validation', () => {
  /** @type {Record<string, any>} */
  let storage;

  function installChrome(initialBackendUrl) {
    storage = initialBackendUrl === undefined ? {} : { backendUrl: initialBackendUrl };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (key) => (key === 'backendUrl' ? { ...storage } : { ...storage }),
          remove: async (key) => {
            delete storage[key];
          },
        },
      },
    };
  }

  it('uses a valid stored backendUrl', async () => {
    installChrome('http://localhost:4000/');
    const client = new BackendClient('http://localhost:3000');
    assert.equal(await client.getBaseUrl(), 'http://localhost:4000');
    assert.equal(client._lastValidationError, null);
  });

  it('discards an invalid stored backendUrl and falls back to the default', async () => {
    // Plain http to a public host is invalid in EVERY environment.
    installChrome('http://evil.example.com');
    const client = new BackendClient('http://localhost:3000');
    const url = await client.getBaseUrl();
    assert.equal(url, 'http://localhost:3000');
    assert.equal(client._lastValidationError, 'BACKEND_URL_INSECURE_PLAINTEXT');
    assert.equal(storage.backendUrl, undefined, 'invalid stored URL must be removed from storage');
  });

  it('accepts an https staging host in development (pinning is production-only)', async () => {
    installChrome('https://staging.aicareershub.tech');
    const client = new BackendClient('http://localhost:3000');
    assert.equal(await client.getBaseUrl(), 'https://staging.aicareershub.tech');
  });

  it('falls back to the default when nothing is stored', async () => {
    installChrome(undefined);
    const client = new BackendClient('http://localhost:3000');
    assert.equal(await client.getBaseUrl(), 'http://localhost:3000');
  });

  it('never applies a stored URL with a path (origin-only rule)', async () => {
    installChrome('http://localhost:3000/api');
    const client = new BackendClient('http://localhost:3000');
    assert.equal(await client.getBaseUrl(), 'http://localhost:3000');
    assert.equal(client._lastValidationError, 'BACKEND_URL_NOT_ORIGIN');
  });
});
