import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { largeFixture, treeFixture, gitObject } from '../fixtures/github-large-tree.js';
import { GitHubSyncBudget, syncLimits } from '../../src/connectors/github/github-sync-budget.js';

const context = {
  tenantId: 'large-tree-test',
  userId: 'owner',
  connectionId: 'connection',
  provider: 'GITHUB_APP',
  connectionStatus: 'ACTIVE',
};
const credentials = { installationId: '155430459' };

const commitSha = 'c'.repeat(40);
function connectorFor(fixture, { truncated = false, intercept, limits, signal } = {}) {
  const requests = [];
  const connector = new GitHubAppConnector({
    authManager: { getInstallationToken: async () => ({ token: 'fixture' }) },
    cache: null,
    rateLimiter: null,
    limits,
    fetchFn: async (url, options) => {
      requests.push(url);
      const changed = await intercept?.(url, options);
      if (changed) return changed;
      if (url.includes('/git/commits/'))
        return globalThis.Response.json({ sha: commitSha, tree: { sha: fixture.root } });
      if (url.endsWith('recursive=1'))
        return globalThis.Response.json({
          ...fixture.recursive,
          tree: truncated ? fixture.recursive.tree.slice(0, 1) : fixture.recursive.tree,
          truncated,
        });
      const sha = url.split('/').at(-1);
      return fixture.trees.has(sha)
        ? globalThis.Response.json(fixture.trees.get(sha))
        : new globalThis.Response('', { status: 404 });
    },
  });
  return {
    requests,
    tree: () =>
      connector.getRepositoryTree(context, credentials, '1338724502', {
        treeSha: commitSha,
        signal,
      }),
  };
}

for (const count of [999, 1000, 1001, 6000]) {
  test(`exact completeness at ${count} entries`, async () => {
    const result = await connectorFor(largeFixture(count)).tree();
    assert.equal(result.complete, true);
    assert.equal(result.entries.length, count);
  });
}

test('truncation recovers all immutable subtrees with bounded concurrency', async () => {
  const fixture = treeFixture(
    Object.fromEntries(
      Array.from({ length: 2000 }, (_, i) => [`dir-${i % 10}/file-${i}.js`, 'source'])
    )
  );
  let running = 0,
    peak = 0;
  const runner = connectorFor(fixture, {
    truncated: true,
    intercept: async (url) => {
      if (url.includes('/git/trees/') && !url.includes('?')) {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 2));
        running--;
      }
    },
  });
  const result = await runner.tree();
  assert.equal(result.entries.length, 2010);
  assert.equal(result.recoveredTruncation, true);
  assert.ok(peak <= 2 && peak > 1);
  assert.equal(runner.requests.length, 13);
});

test('deep source directories remain supported within configured depth', async () => {
  const fixture = treeFixture({ [`${'dir/'.repeat(20)}index.js`]: 'source' });
  assert.equal((await connectorFor(fixture).tree()).entries.length, 21);
});

for (const [label, limits, fixture] of [
  ['FILE_COUNT_LIMIT', { maxFiles: 3 }, largeFixture(4)],
  ['DIRECTORY_LIMIT', { maxDirectories: 1 }, treeFixture({ 'a/one.js': '', 'b/two.js': '' })],
  ['DEPTH_LIMIT', { maxDepth: 2 }, treeFixture({ 'a/b/file.js': '' })],
  ['REQUEST_LIMIT', { maxRequests: 1 }, largeFixture(1)],
  ['DOWNLOAD_LIMIT', { maxDownloadedBytes: 50 }, largeFixture(1)],
]) {
  test(`${label} fails explicitly without a complete result`, async () => {
    await assert.rejects(
      connectorFor(fixture, { limits }).tree(),
      (e) => e.code === 'GITHUB_SYNC_INCOMPLETE' && e.message.includes(label)
    );
  });
}

test('oversized selected content is rejected', () => {
  assert.throws(() => new GitHubSyncBudget({ maxFileBytes: 5 }).checkFile(6), /FILE_SIZE_LIMIT/);
});
test('invalid or unlimited operational configuration is rejected', () => {
  for (const limits of [
    { maxFiles: 0 },
    { concurrency: 100 },
    { maxRequests: Infinity },
    { maxDepth: -1 },
  ])
    assert.throws(() => syncLimits(limits), /operational limit/);
});

for (const mode of [
  'missing',
  'changed',
  'incomplete',
  'malformed',
  'duplicate',
  'unsafe',
  'direct-truncated',
]) {
  test(`${mode} subtree cannot return verified completeness`, async () => {
    const fixture = treeFixture({ 'src/index.js': 'source', 'root.js': 'root' });
    const subtree = fixture.recursive.tree.find((e) => e.type === 'tree').sha;
    const runner = connectorFor(fixture, {
      truncated: mode === 'missing' || mode === 'changed' || mode === 'direct-truncated',
      intercept: (url) => {
        if (url.endsWith(subtree)) {
          if (mode === 'missing') return new globalThis.Response('', { status: 404 });
          if (mode === 'changed')
            return globalThis.Response.json({ ...fixture.trees.get(subtree), sha: 'd'.repeat(40) });
          if (mode === 'direct-truncated')
            return globalThis.Response.json({ ...fixture.trees.get(subtree), truncated: true });
        }
        if (url.endsWith('recursive=1')) {
          const tree = [...fixture.recursive.tree];
          if (mode === 'incomplete') tree.pop();
          else if (mode === 'duplicate') tree.push(tree[0]);
          else if (mode === 'unsafe') tree[0] = { ...tree[0], path: '../escape' };
          else if (mode === 'malformed') return globalThis.Response.json({ tree: {} });
          else return;
          return globalThis.Response.json({ ...fixture.recursive, tree });
        }
      },
    });
    await assert.rejects(runner.tree());
  });
}

test('symlinks and submodules are explicit exclusions rather than source blobs', async () => {
  const raw = [
    { path: 'link', mode: '120000', type: 'blob', sha: gitObject('blob', 'outside') },
    { path: 'module', mode: '160000', type: 'commit', sha: 'b'.repeat(40) },
  ];
  const root = gitObject(
    'tree',
    Buffer.concat(
      raw.flatMap((e) => [Buffer.from(`${e.mode} ${e.path}\0`), Buffer.from(e.sha, 'hex')])
    )
  );
  const fixture = { root, recursive: { sha: root, tree: raw, truncated: false }, trees: new Map() };
  const result = await connectorFor(fixture).tree();
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.excludedPaths, ['link', 'module']);
});

test('vendor/generated directories are excluded before fallback subtree requests', async () => {
  const fixture = treeFixture({
    'src/index.js': 'source',
    'node_modules/library/index.js': 'generated',
    'dist/bundle.js': 'generated',
  });
  const runner = connectorFor(fixture, { truncated: true });
  const result = await runner.tree();
  assert.deepEqual(
    result.entries.map((e) => e.path),
    ['src', 'src/index.js']
  );
  assert.deepEqual(result.excludedPaths, ['dist', 'node_modules']);
  assert.equal(runner.requests.length, 4);
});

test('aborted traversal fails before any GitHub request', async () => {
  const signal = AbortSignal.abort();
  const runner = connectorFor(largeFixture(1), { signal });
  await assert.rejects(runner.tree(), /INTERRUPTED/);
  assert.equal(runner.requests.length, 0);
});
test('duration deadline aborts pending HTTP rather than returning completeness', async () => {
  const runner = connectorFor(largeFixture(1), {
    limits: { maxDurationMs: 25 },
    intercept: (_url, options) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        options.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(options.signal.reason);
          },
          { once: true }
        );
      }),
  });
  await assert.rejects(runner.tree(), /DURATION_LIMIT/);
});

for (const status of [403, 404, 429, 503]) {
  test(`GitHub ${status} cannot produce a completed tree`, async () => {
    const runner = connectorFor(largeFixture(1), {
      intercept: () => new globalThis.Response('', { status, headers: { 'retry-after': '60' } }),
    });
    await assert.rejects(runner.tree());
  });
}
test('short GitHub rate limit retry retains request accounting', async () => {
  let attempts = 0;
  const runner = connectorFor(largeFixture(1), {
    intercept: () =>
      ++attempts === 1
        ? new globalThis.Response('', { status: 429, headers: { 'retry-after': '0.001' } })
        : undefined,
  });
  assert.equal((await runner.tree()).complete, true);
  assert.equal(runner.requests.length, 3);
});

test('GitHub secondary 403 rate limit honors retry-after with remaining primary quota', async () => {
  let attempts = 0;
  const runner = connectorFor(largeFixture(1), {
    intercept: () =>
      ++attempts === 1
        ? new globalThis.Response('', {
            status: 403,
            headers: { 'retry-after': '0.001', 'x-ratelimit-remaining': '100' },
          })
        : undefined,
  });
  assert.equal((await runner.tree()).complete, true);
  assert.equal(runner.requests.length, 3);
});

test('pending streamed response cannot exceed the shared download budget', async () => {
  const budget = new GitHubSyncBudget({ maxDownloadedBytes: 10 });
  const response = new globalThis.Response(
    new globalThis.ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(20));
        controller.close();
      },
    })
  );
  await assert.rejects(
    budget.fetch(async () => response, 'fixture', {}),
    /DOWNLOAD_LIMIT/
  );
  assert.equal(budget.running, 0);
});

test('several simultaneous callers respect the same concurrency and request budget', async () => {
  const budget = new GitHubSyncBudget({ concurrency: 1, maxRequests: 3 });
  let running = 0,
    peak = 0;
  const fetchFn = async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return globalThis.Response.json({});
  };
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => budget.fetch(fetchFn, 'fixture', {}))
  );
  assert.equal(peak, 1);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 3);
});
test('repeated complete traversal is deterministic and rechecks access', async () => {
  const runner = connectorFor(treeFixture({ 'src/index.js': 'source', 'package.json': '{}' }));
  assert.deepEqual(await runner.tree(), await runner.tree());
  assert.equal(runner.requests.length, 4);
});

test('installation selection must contain the numeric repository ID even when metadata is public', async () => {
  let repositories = [];
  const connector = new GitHubAppConnector({
    authManager: { getInstallationToken: async () => ({ token: 'fixture' }) },
    cache: null,
    rateLimiter: null,
    fetchFn: async () =>
      globalThis.Response.json({ total_count: repositories.length, repositories }),
  });
  await assert.rejects(
    connector.assertRepositorySelected(context, credentials, '1338724502'),
    /no longer selected/
  );
  repositories = [{ id: 1338724502, name: 'repo', full_name: 'owner/renamed' }];
  await connector.assertRepositorySelected(context, credentials, '1338724502');
  await assert.rejects(
    connector.assertRepositorySelected(context, credentials, '957786589'),
    /no longer selected/
  );
});

for (const [name, count] of [
  ['Ai-job-mcp', 1231],
  ['Ai-job-search-board', 4179],
]) {
  test(`${name}: complete ${count}-entry source tree is not cut off`, async () => {
    const fixture = largeFixture(count);
    const connector = new GitHubAppConnector({
      authManager: { getInstallationToken: async () => ({ token: 'fixture' }) },
      cache: null,
      rateLimiter: null,
      fetchFn: async () => new globalThis.Response(JSON.stringify(fixture.recursive)),
    });
    const result = await connector.getRepositoryTree(context, credentials, '1338724502');
    assert.equal(result.truncated, false);
    assert.equal(result.entries.length, count);
  });
}
