// Real PostgreSQL and Fastify. Only outbound GitHub listing/identity is a fixture.
import { beforeEach, afterEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resources,
  resourceConnections,
  projects,
  projectResources,
} from '../../src/db/schema.js';
import { createSession, getSessionCookieOptions } from '../../src/security/session.service.js';
import { buildApp } from '../../src/app.js';
import { connectorRegistry } from '../../src/connectors/registry/connector-registry.js';
import { BaseResourceConnector } from '../../src/connectors/base/resource-connector.js';
import { CandidateRepositoryIngestionService } from '../../src/services/candidate-repository-ingestion.service.js';
import { githubFixture } from '../helpers/github-installation.fixture.js';
import { GitHubRepositorySelectionService } from '../../src/services/github-repository-selection.service.js';
import {
  sealGeneratedPackage,
  assertCurrentPackage,
} from '../../src/services/evidence/artifact-policy.js';

const target = new URL(process.env.DATABASE_URL);
assert.ok(
  ['localhost', '127.0.0.1'].includes(target.hostname) && /^\/product_audit_/.test(target.pathname)
);
let tenant, user, candidate, connection, history, project, app, priorConnector;
let listing, unavailable;
class ListingConnector extends BaseResourceConnector {
  constructor() {
    super('GITHUB_APP');
  }
  async listResources(_context, _credentials, options = {}) {
    if (unavailable) throw new Error('Fixture GitHub unavailable');
    const page = Number(options.cursor || '0');
    const items = listing.slice(page * 5, page * 5 + 5);
    const hasMore = (page + 1) * 5 < listing.length;
    return {
      items,
      hasMore,
      nextCursor: hasMore ? String(page + 1) : null,
      totalCount: listing.length,
    };
  }
}
beforeEach(async () => {
  [tenant] = await db
    .insert(tenants)
    .values({ name: 'Repository reconnect fixture', slug: crypto.randomUUID() })
    .returning();
  [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: `${tenant.id}@example.test`,
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
      installationId: '9001',
      externalAccountId: '101',
      displayName: 'Fixture',
      encryptedCredentials: 'fixture',
      status: 'ACTIVE',
      metadata: {
        authorityPolicy: 'personal-owner-or-org-owner-v1',
        authorizedGithubUserId: '101',
      },
    })
    .returning();
  listing = Array.from({ length: 10 }, (_, i) => ({
    id: String(50000 + i),
    name: `repo-${i}`,
    fullName: `owner/repo-${i}`,
    url: `https://github.com/owner/repo-${i}`,
    isPrivate: false,
  }));
  history = await db
    .insert(resources)
    .values(
      listing.map((repo) => ({
        tenantId: tenant.id,
        candidateId: candidate.id,
        connectionId: connection.id,
        provider: 'GITHUB_APP',
        externalResourceId: repo.id,
        name: repo.fullName,
        displayName: repo.fullName,
        url: repo.url,
        status: 'DISCONNECTED',
        metadata: { cachedAnalysis: { head: 'a'.repeat(40) } },
      }))
    )
    .returning();
  [project] = await db
    .insert(projects)
    .values({
      tenantId: tenant.id,
      candidateId: candidate.id,
      name: 'Authored original project',
      slug: 'owner-repo-0',
      summary: 'Authoritative user description',
    })
    .returning();
  await db
    .insert(projectResources)
    .values({ tenantId: tenant.id, projectId: project.id, resourceId: history[0].id });
  priorConnector = connectorRegistry.has('GITHUB_APP') ? connectorRegistry.get('GITHUB_APP') : null;
  connectorRegistry.register('GITHUB_APP', new ListingConnector(), { allowOverride: true });
  unavailable = false;
  const session = await createSession(db, {
    userId: user.id,
    tenantId: tenant.id,
    githubUserId: '101',
  });
  const fixture = githubFixture(db);
  app = buildApp({ logger: false, db, installationService: fixture.service });
  app.fixtureCookie = { [getSessionCookieOptions().name]: session.rawToken };
});
afterEach(async () => {
  await app?.close();
  if (priorConnector)
    connectorRegistry.register('GITHUB_APP', priorConnector, { allowOverride: true });
  else connectorRegistry.clear();
  await db.delete(tenants).where(eq(tenants.id, tenant.id));
});
after(() => closeDatabase());
const select = (ids) =>
  app.inject({
    method: 'POST',
    url: '/onboarding/repositories/select',
    cookies: app.fixtureCookie,
    headers: { accept: 'application/json' },
    payload: { from: 'sources', repositories: ids },
  });
const rows = () =>
  db.select().from(resources).where(eq(resources.tenantId, tenant.id)).orderBy(resources.id);
const ingestion = () => new CandidateRepositoryIngestionService({ db });

test('unavailable installation listing fails closed without reactivating stored rows', async () => {
  unavailable = true;
  const before = await rows();
  const result = await select([history[0].externalResourceId]);
  assert.equal(result.statusCode, 503);
  assert.deepEqual(await rows(), before);
});
test('repository rename preserves the linked project instead of creating another project', async () => {
  const renamed = { ...history[0], name: 'owner/renamed', displayName: 'owner/renamed' };
  const result = await ingestion()._ensureProject({
    tenantId: tenant.id,
    candidateId: candidate.id,
    resource: renamed,
  });
  assert.equal(result.projectId, project.id);
  assert.deepEqual(await db.select().from(projects).where(eq(projects.tenantId, tenant.id)), [
    project,
  ]);
});
test('same name with a different immutable repository ID does not inherit another repository project', async () => {
  const [replacement] = await db
    .insert(resources)
    .values({
      tenantId: tenant.id,
      candidateId: candidate.id,
      connectionId: connection.id,
      provider: 'GITHUB_APP',
      externalResourceId: '999999',
      name: history[0].name,
      displayName: history[0].name,
      status: 'ACTIVE',
    })
    .returning();
  const result = await ingestion()._ensureProject({
    tenantId: tenant.id,
    candidateId: candidate.id,
    resource: replacement,
  });
  assert.notEqual(result.projectId, project.id);
  assert.equal(
    (await db.select().from(projects).where(eq(projects.tenantId, tenant.id))).length,
    2
  );
});
test('concurrent project synchronization creates only one project for the same resource', async () => {
  const parameters = { tenantId: tenant.id, candidateId: candidate.id, resource: history[1] };
  const results = await Promise.all(
    Array.from({ length: 5 }, () => ingestion()._ensureProject(parameters))
  );
  assert.equal(new Set(results.map((r) => r.projectId)).size, 1);
  assert.equal(
    (
      await db
        .select()
        .from(projects)
        .where(and(eq(projects.tenantId, tenant.id), eq(projects.candidateId, candidate.id)))
    ).length,
    2
  );
});

test('all ten accessible historical IDs are relinked across pages, and repeated selection changes nothing', async () => {
  const sources = await app.inject({ url: '/sources', cookies: app.fixtureCookie });
  assert.equal(sources.statusCode, 200);
  assert.match(sources.body, /10 historical repositories remain disconnected/);
  const before = await rows();
  const ids = history.map((resource) => resource.externalResourceId);
  assert.equal((await select(ids)).statusCode, 200);
  const first = await rows();
  assert.deepEqual(
    first.map((row) => row.id),
    before.map((row) => row.id)
  );
  assert.ok(first.every((row) => row.status === 'ACTIVE'));
  first.forEach((row, index) =>
    assert.deepEqual(row.metadata.cachedAnalysis, before[index].metadata.cachedAnalysis)
  );
  assert.equal((await select(ids)).statusCode, 200);
  assert.deepEqual(await rows(), first, 'Repeat selection must not rotate epochs or timestamps');
  const refresh = await app.inject({
    url: '/onboarding?step=3&from=sources',
    cookies: app.fixtureCookie,
  });
  assert.equal(refresh.statusCode, 200);
  assert.match(refresh.body, /owner\/repo-9/);
  assert.deepEqual(await rows(), first, 'Browser refresh must not change lifecycle state');
  const cookies = app.fixtureCookie;
  await app.close();
  app = buildApp({ logger: false, db, installationService: githubFixture(db).service });
  app.fixtureCookie = cookies;
  assert.equal((await select(ids)).statusCode, 200);
  assert.deepEqual(await rows(), first, 'Fresh app instance must reuse persisted associations');
});

test('bounded existing-only reconciliation supports rollback dry-run and refuses creation', async () => {
  const before = await rows();
  const serviceOptions = { installationService: githubFixture(db).service };
  const parameters = {
    context: { tenantId: tenant.id, userId: user.id },
    candidateId: candidate.id,
    connectionId: connection.id,
    repositoryIds: history.map((row) => row.externalResourceId),
    existingOnly: true,
  };
  const rollback = new Error('Reviewed reconciliation dry-run rollback');
  await assert.rejects(
    db.transaction(async (tx) => {
      const service = new GitHubRepositorySelectionService({ db: tx, ...serviceOptions });
      const result = await service.select(parameters);
      assert.equal(result.changes.length, 10);
      assert.deepEqual(
        result.changes.map((change) => change.resourceId).sort(),
        history.map((row) => row.id).sort()
      );
      assert.ok(
        result.changes.every(
          (change) => change.before === 'DISCONNECTED' && change.after === 'ACTIVE'
        )
      );
      throw rollback;
    }),
    (error) => error === rollback
  );
  assert.deepEqual(await rows(), before, 'Outer rollback preserves all original resource rows');
  listing.push({ ...listing[0], id: '999999', fullName: 'owner/new-repo' });
  await assert.rejects(
    new GitHubRepositorySelectionService({ db, ...serviceOptions }).select({
      ...parameters,
      repositoryIds: [...parameters.repositoryIds, '999999'],
    }),
    (error) => error.statusCode === 409
  );
  assert.deepEqual(await rows(), before, 'New-resource refusal rolls back earlier planned updates');
});
test('selection changes disconnect omitted repositories while inaccessible IDs fail atomically', async () => {
  assert.equal((await select(history.map((row) => row.externalResourceId))).statusCode, 200);
  listing = listing.slice(0, 5);
  const before = await rows();
  assert.equal(
    (await select([history[0].externalResourceId, history[9].externalResourceId])).statusCode,
    400
  );
  assert.deepEqual(await rows(), before);
  assert.equal((await select([history[0].externalResourceId])).statusCode, 200);
  const current = await rows();
  assert.equal(current.filter((row) => row.status === 'ACTIVE').length, 1);
  assert.equal(current.filter((row) => row.status === 'DISCONNECTED').length, 9);
  assert.equal(current.length, 10);
});
test('empty current GitHub access never falls back to stored repositories', async () => {
  listing = [];
  const before = await rows();
  assert.equal((await select([history[0].externalResourceId])).statusCode, 400);
  assert.deepEqual(await rows(), before);
});
test('numeric identity survives a rename; a replacement with the same name does not reactivate old history', async () => {
  listing[0] = {
    ...listing[0],
    name: 'renamed',
    fullName: 'owner/renamed',
    url: 'https://github.com/owner/renamed',
  };
  assert.equal((await select([listing[0].id])).statusCode, 200);
  let current = await rows();
  assert.equal(current.find((row) => row.id === history[0].id).name, 'owner/renamed');
  const id = listing[0].id;
  listing[0] = { ...listing[0], id: '999999' };
  assert.equal((await select([id])).statusCode, 400);
  assert.equal((await select(['999999'])).statusCode, 200);
  current = await rows();
  assert.equal(current.find((row) => row.id === history[0].id).status, 'DISCONNECTED');
  assert.equal(
    current.length,
    11,
    'An explicitly selected new immutable ID is a different resource'
  );
});
test('legacy name identity needs stored numeric provenance, never a name-only guess', async () => {
  await db
    .update(resources)
    .set({ externalResourceId: listing[0].fullName })
    .where(eq(resources.id, history[0].id));
  const before = await rows();
  assert.equal((await select([listing[0].id])).statusCode, 409);
  assert.deepEqual(await rows(), before);
  await db
    .update(resources)
    .set({ metadata: { ...history[0].metadata, numericId: Number(listing[0].id) } })
    .where(eq(resources.id, history[0].id));
  assert.equal((await select([listing[0].id])).statusCode, 200);
  assert.equal(
    (await rows()).find((row) => row.id === history[0].id).externalResourceId,
    listing[0].id
  );
  assert.equal((await rows()).length, 10);
});
test('concurrent selections are atomic and do not duplicate resources or project associations', async () => {
  const ids = history.map((row) => row.externalResourceId);
  const result = await Promise.all(Array.from({ length: 5 }, () => select(ids)));
  assert.ok(result.every((response) => response.statusCode === 200));
  assert.equal((await rows()).length, 10);
  assert.deepEqual(await db.select().from(projects).where(eq(projects.tenantId, tenant.id)), [
    project,
  ]);
  assert.equal(
    (await db.select().from(projectResources).where(eq(projectResources.tenantId, tenant.id)))
      .length,
    1
  );
});
test('another user or tenant cannot reconcile this historical connection', async () => {
  const before = await rows();
  const service = new GitHubRepositorySelectionService({
    db,
    installationService: githubFixture(db).service,
  });
  for (const context of [
    { tenantId: crypto.randomUUID(), userId: user.id },
    { tenantId: tenant.id, userId: crypto.randomUUID() },
  ]) {
    await assert.rejects(
      service.select({
        context,
        candidateId: candidate.id,
        connectionId: connection.id,
        repositoryIds: [history[0].externalResourceId],
        existingOnly: true,
      }),
      (error) => error.statusCode === 403
    );
  }
  assert.deepEqual(await rows(), before);
});

test('changed installation account ownership rejects reconciliation without writes', async () => {
  const before = await rows();
  const verifier = githubFixture(db, {
    appResponse: {
      id: 9001,
      app_id: 123456,
      account: { id: 102, login: 'other', type: 'User' },
      suspended_at: null,
      repository_selection: 'all',
      permissions: { contents: 'read', metadata: 'read' },
    },
  }).service;
  const service = new GitHubRepositorySelectionService({ db, installationService: verifier });
  await assert.rejects(
    service.select({
      context: { tenantId: tenant.id, userId: user.id },
      candidateId: candidate.id,
      connectionId: connection.id,
      repositoryIds: [listing[0].id],
      existingOnly: true,
    }),
    (error) => error.statusCode === 403
  );
  assert.deepEqual(await rows(), before);
});

test('incomplete or looping installation pagination fails without partial updates', async () => {
  const before = await rows();
  connectorRegistry.get('GITHUB_APP').listResources = async () => ({
    items: [listing[0]],
    hasMore: true,
    nextCursor: 'loop',
    totalCount: 10,
  });
  assert.equal((await select([listing[0].id])).statusCode, 503);
  assert.deepEqual(await rows(), before);
});
test('fresh receipts become usable only after all source eligibility checks pass; historical signed content stays invalid', async () => {
  const context = { tenantId: tenant.id, candidateId: candidate.id };
  const old = await sealGeneratedPackage(db, context, {
    candidateId: candidate.id,
    tailoredResume: { markdownContent: 'Authoritative fixture text' },
    answers: {},
  });
  const snapshot = JSON.stringify(old);
  await assert.rejects(
    assertCurrentPackage(db, context, old),
    (error) => error.code === 'ARTIFACT_REVALIDATION_REQUIRED'
  );
  assert.equal((await select(history.map((row) => row.externalResourceId))).statusCode, 200);
  await assert.rejects(
    assertCurrentPackage(db, context, old),
    (error) => error.code === 'ARTIFACT_REVALIDATION_REQUIRED'
  );
  const fresh = await sealGeneratedPackage(db, context, {
    candidateId: candidate.id,
    tailoredResume: { markdownContent: 'Authoritative fixture text' },
    answers: {},
  });
  await assertCurrentPackage(db, context, fresh);
  assert.notEqual(fresh.packageHash, old.packageHash);
  assert.equal(JSON.stringify(old), snapshot);
});
