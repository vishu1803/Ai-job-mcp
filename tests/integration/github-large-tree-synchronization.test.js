import { test, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { eq } from 'drizzle-orm';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  resources,
  projects,
  projectResources,
  candidateSkills,
  evidenceItems,
} from '../../src/db/schema.js';
import { GitHubAppConnector } from '../../src/connectors/github/github-connector.js';
import { CandidateRepositoryIngestionService } from '../../src/services/candidate-repository-ingestion.service.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { treeFixture, gitObject } from '../fixtures/github-large-tree.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['127.0.0.1', 'localhost'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname),
  'Disposable PostgreSQL required'
);
let tenant,
  user,
  candidate,
  connection,
  history,
  originalProjects,
  context,
  fixtures,
  intercept,
  truncated,
  limits,
  service;
const source = {
  'src/app.js': "import Fastify from 'fastify';\n",
  'package.json': '{"dependencies":{"fastify":"^5.0.0"}}',
};
function build(count) {
  return treeFixture({
    ...Object.fromEntries(
      Array.from({ length: count - 3 }, (_, i) => [`notes-${i}.txt`, 'non-executable fixture'])
    ),
    ...source,
  });
}
function connector() {
  return new GitHubAppConnector({
    limits,
    cache: null,
    rateLimiter: null,
    authManager: { getInstallationToken: async () => ({ token: 'fixture' }) },
    fetchFn: async (url, options) => {
      const path = new URL(url).pathname;
      const id = path.split('/')[2];
      const fixture = fixtures.get(id);
      const changed = await intercept?.(path, options);
      if (changed) return changed;
      if (path === '/installation/repositories')
        return globalThis.Response.json({
          total_count: history.length,
          repositories: history.map((resource) => ({
            id: Number(resource.externalResourceId),
            name: resource.name,
            full_name: `owner/${resource.name}`,
            html_url: `https://github.com/owner/${resource.name}`,
            default_branch: 'main',
          })),
        });
      if (!fixture) return new globalThis.Response('', { status: 404 });
      const commitSha = gitObject(
        'commit',
        `tree ${fixture.root}\nauthor Fixture <fixture@example.test> 1 +0000\ncommitter Fixture <fixture@example.test> 1 +0000\n\nfixture\n`
      );
      if (path === `/repositories/${id}`)
        return globalThis.Response.json({
          id: Number(id),
          full_name: `owner/repo-${id}`,
          name: `repo-${id}`,
          default_branch: 'main',
        });
      if (path.includes('/git/ref/heads/'))
        return globalThis.Response.json({ object: { sha: commitSha }, ref: 'refs/heads/main' });
      if (path.includes('/git/commits/'))
        return globalThis.Response.json({ sha: commitSha, tree: { sha: fixture.root } });
      if (path.includes('/git/trees/')) {
        if (url.includes('recursive=1'))
          return globalThis.Response.json({
            ...fixture.recursive,
            tree: truncated ? fixture.recursive.tree.slice(0, 1) : fixture.recursive.tree,
            truncated,
          });
        return globalThis.Response.json(fixture.trees.get(path.split('/').at(-1)));
      }
      if (path.endsWith('/languages')) return globalThis.Response.json({ JavaScript: 100 });
      if (path.endsWith('/readme')) return new globalThis.Response('', { status: 404 });
      if (path.endsWith('/commits')) return globalThis.Response.json([]);
      if (path.includes('/contents/'))
        return globalThis.Response.json(
          fixture.contents.get(decodeURIComponent(path.split('/contents/')[1]))
        );
      throw new Error(`Unexpected fixture endpoint ${path}`);
    },
  });
}
const rows = (table) => db.select().from(table).where(eq(table.tenantId, tenant.id));
const ids = (records) => records.map((r) => r.id).sort();
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(
      [resources, projects, projectResources, candidateSkills, evidenceItems].map(async (table) => [
        table === resources
          ? 'resources'
          : table === projects
            ? 'projects'
            : table === projectResources
              ? 'links'
              : table === candidateSkills
                ? 'skills'
                : 'evidence',
        ids(await rows(table)),
      ])
    )
  );
}
const sync = (index = 0, options = {}) =>
  service.syncCandidateRepositories({
    context,
    candidateId: candidate.id,
    options: { resourceId: history[index].id, ...options },
  });
beforeEach(async () => {
  const identity = await pool.query('SHOW data_directory');
  assert.match(
    identity.rows[0].data_directory.replaceAll('\\', '/'),
    /\/Temp\/(?:career-large-tree-20261010|career-regeneration-20261014)\/pgdata$/
  );
  if (
    identity.rows[0].data_directory
      .replaceAll('\\', '/')
      .endsWith('/career-regeneration-20261014/pgdata')
  ) {
    assert.equal(target.port, '55444');
    assert.equal(target.pathname, '/product_audit_regeneration');
  }
  [tenant] = await db
    .insert(tenants)
    .values({ name: 'Large tree fixture', slug: randomUUID() })
    .returning();
  [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: `${randomUUID()}@example.test`,
      displayName: 'Fixture',
      role: 'OWNER',
    })
    .returning();
  [candidate] = await db
    .insert(candidates)
    .values({ tenantId: tenant.id, userId: user.id, displayName: 'Fixture' })
    .returning();
  [connection] = await db
    .insert(resourceConnections)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'Fixture',
      externalAccountId: randomUUID(),
      installationId: String(Math.floor(Math.random() * 1000000000) + 1000000000),
      encryptedCredentials: encryptSecret(JSON.stringify({ installationId: 'fixture' })),
      status: 'ACTIVE',
    })
    .returning();
  await db
    .update(resourceConnections)
    .set({
      encryptedCredentials: encryptSecret(
        JSON.stringify({ installationId: connection.installationId })
      ),
    })
    .where(eq(resourceConnections.id, connection.id));
  history = await db
    .insert(resources)
    .values(
      Array.from({ length: 10 }, (_, i) => ({
        tenantId: tenant.id,
        candidateId: candidate.id,
        connectionId: connection.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: String(10001 + i),
        name: `repo-${10001 + i}`,
        displayName: `owner/repo-${10001 + i}`,
        status: 'ACTIVE',
      }))
    )
    .returning();
  originalProjects = await db
    .insert(projects)
    .values(
      Array.from({ length: 11 }, (_, i) => ({
        tenantId: tenant.id,
        candidateId: candidate.id,
        name: `Historical project ${i}`,
        slug: `history-${i}`,
        summary: 'Candidate authored history',
      }))
    )
    .returning();
  await db.insert(projectResources).values(
    history.map((r, i) => ({
      tenantId: tenant.id,
      projectId: originalProjects[i].id,
      resourceId: r.id,
    }))
  );
  context = { tenantId: tenant.id, userId: user.id };
  fixtures = new Map(history.map((r) => [r.externalResourceId, treeFixture(source)]));
  intercept = null;
  truncated = false;
  limits = undefined;
  service = new CandidateRepositoryIngestionService({ db, registry: { get: () => connector() } });
  assert.equal((await sync()).repositoriesProcessed, 1);
});
afterEach(async () => {
  if (tenant) await db.delete(tenants).where(eq(tenants.id, tenant.id));
});
after(() => closeDatabase());

for (const [label, count, index] of [
  ['Ai-job-mcp', 1231, 0],
  ['Ai-job-search-board', 4179, 1],
]) {
  test(`${label}: real connector to PostgreSQL preserves historical IDs and repeats idempotently`, async () => {
    const before = await snapshot();
    fixtures.set(history[index].externalResourceId, build(count));
    const result = await sync(index);
    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.projectsCreated, 0);
    const first = await snapshot();
    assert.deepEqual(first.resources, before.resources);
    assert.deepEqual(first.projects, before.projects);
    assert.deepEqual(first.links, before.links);
    for (const key of ['skills', 'evidence'])
      assert.ok(before[key].every((id) => first[key].includes(id)));
    assert.equal((await sync(index)).status, 'COMPLETE');
    assert.deepEqual(await snapshot(), first);
    const row = (await rows(resources)).find((r) => r.id === history[index].id);
    assert.equal(row.metadata.ingestionAttempt.status, 'COMPLETE');
    assert.ok(
      (await rows(evidenceItems)).some((e) => e.metadata.verification?.status === 'VERIFIED')
    );
    assert.deepEqual(await rows(projects), originalProjects);
  });
}
test('truncated large-tree fallback completes before any trusted evidence writes', async () => {
  fixtures.set(history[0].externalResourceId, build(4179));
  truncated = true;
  assert.equal((await sync()).status, 'COMPLETE');
});

for (const condition of [
  'missing subtree',
  'download limit',
  'oversized file',
  'abort',
  'deselected',
  'changed installation',
  'changed owner',
  'resource disconnected',
  'public repository deselected',
  'missing file content',
  'mismatched file blob',
]) {
  test(`${condition}: historical evidence survives and failed attempt cannot publish VERIFIED evidence`, async () => {
    const before = await snapshot();
    const previous = (await rows(resources)).find((r) => r.id === history[0].id).lastSyncedAt;
    fixtures.set(history[0].externalResourceId, build(1231));
    let repositoryReads = 0;
    const controller = new AbortController();
    if (condition === 'download limit') limits = { maxDownloadedBytes: 500 };
    if (condition === 'oversized file') limits = { maxFileBytes: 5 };
    if (condition === 'missing subtree') truncated = true;
    intercept = async (path) => {
      if (
        condition === 'missing subtree' &&
        path.endsWith(
          fixtures.get(history[0].externalResourceId).recursive.tree.find((e) => e.type === 'tree')
            .sha
        )
      )
        return new globalThis.Response('', { status: 404 });
      if (path === '/installation/repositories' && condition === 'public repository deselected')
        return globalThis.Response.json({ total_count: 0, repositories: [] });
      if (path.includes('/contents/') && condition === 'missing file content')
        return globalThis.Response.json({ sha: 'a'.repeat(40), encoding: 'base64' });
      if (path.includes('/contents/') && condition === 'mismatched file blob')
        return globalThis.Response.json({
          sha: 'a'.repeat(40),
          content: Buffer.from('wrong blob').toString('base64'),
          encoding: 'base64',
          size: 10,
          type: 'file',
        });
      if (path === `/repositories/${history[0].externalResourceId}`) {
        repositoryReads++;
        if (condition === 'deselected' && repositoryReads === 2)
          return new globalThis.Response('', { status: 404 });
        if (condition === 'changed installation' && repositoryReads === 2)
          await db
            .update(resourceConnections)
            .set({ installationId: String(Number(connection.installationId) + 1) })
            .where(eq(resourceConnections.id, connection.id));
        if (condition === 'changed owner' && repositoryReads === 2)
          await db
            .update(resourceConnections)
            .set({ externalAccountId: randomUUID() })
            .where(eq(resourceConnections.id, connection.id));
        if (condition === 'resource disconnected' && repositoryReads === 2)
          await db
            .update(resources)
            .set({ status: 'DISCONNECTED' })
            .where(eq(resources.id, history[0].id));
        if (condition === 'abort') controller.abort();
      }
    };
    const result = await sync(0, { signal: controller.signal });
    assert.equal(result.status, 'INCOMPLETE');
    assert.equal(result.repositoriesProcessed, 0);
    assert.deepEqual(await snapshot(), before);
    const row = (await rows(resources)).find((r) => r.id === history[0].id);
    assert.equal(row.metadata.ingestionAttempt.status, 'INCOMPLETE');
    assert.deepEqual(row.lastSyncedAt, previous);
    const evidence = await rows(evidenceItems);
    assert.ok(evidence.every((e) => e.metadata.verification?.epoch !== row.metadata.evidenceEpoch));
  });
}

test('concurrent large-tree synchronization preserves IDs and deduplicates source facts', async () => {
  fixtures.set(history[0].externalResourceId, build(1231));
  const results = await Promise.all([sync(), sync(), sync()]);
  assert.ok(results.some((r) => r.status === 'COMPLETE'));
  const first = await snapshot();
  assert.equal(first.resources.length, 10);
  assert.equal(first.projects.length, 11);
  assert.equal((await sync()).status, 'COMPLETE');
  assert.deepEqual(await snapshot(), first);
});
test('rename keeps numeric repository and project identities while a different numeric ID fails', async () => {
  const before = await snapshot();
  intercept = (path) =>
    path === `/repositories/${history[0].externalResourceId}`
      ? globalThis.Response.json({
          id: Number(history[0].externalResourceId),
          name: 'renamed',
          full_name: 'owner/renamed',
          default_branch: 'main',
        })
      : undefined;
  assert.equal((await sync()).status, 'COMPLETE');
  assert.deepEqual(await snapshot(), before);
  intercept = (path) =>
    path === `/repositories/${history[0].externalResourceId}`
      ? globalThis.Response.json({
          id: 999999,
          name: history[0].name,
          full_name: `owner/${history[0].name}`,
          default_branch: 'main',
        })
      : undefined;
  assert.equal((await sync()).status, 'INCOMPLETE');
  assert.deepEqual(await snapshot(), before);
});
test('foreign tenant cannot access or change the candidate', async () => {
  const before = await snapshot();
  await assert.rejects(
    service.syncCandidateRepositories({
      context: { tenantId: randomUUID(), userId: user.id },
      candidateId: candidate.id,
    }),
    /not found/
  );
  assert.deepEqual(await snapshot(), before);
});
test('process termination leaves durable pending epoch without corrupting historical records', async () => {
  const before = await snapshot();
  const child = fork(
    new URL('../fixtures/github-interrupted-ingestion.js', import.meta.url),
    [
      JSON.stringify({
        context: { ...context, connectionId: connection.id },
        candidateId: candidate.id,
        resourceId: history[0].id,
        installationId: connection.installationId,
      }),
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] }
  );
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    const [message] = await once(child, 'message');
    assert.equal(message, 'epoch-reserved');
    child.kill();
    await once(child, 'exit');
    assert.deepEqual(await snapshot(), before);
    const row = (await rows(resources)).find((r) => r.id === history[0].id);
    assert.equal(row.metadata.ingestionAttempt.status, 'IN_PROGRESS');
    assert.ok(
      (await rows(evidenceItems)).every(
        (e) => e.metadata.verification?.epoch !== row.metadata.evidenceEpoch
      )
    );
    assert.equal((await sync()).status, 'COMPLETE');
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
});
