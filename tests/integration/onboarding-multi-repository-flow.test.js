/**
 * @file Integration Test for Onboarding Multi-Repository Selection & Queue Flow (Step 1D)
 *
 * Verifies end-to-end HTTP request processing:
 * 1. Form POST with multiple `repositories` checkboxes
 * 2. URL-encoded body parser preserving all 4 values in `req.body.repositories`
 * 3. Database persistence of all 4 selected repositories with `status: ACTIVE`
 * 4. Step 4 HTTP GET rendering all 4 queued repository sources
 * 5. Deselection flow correctly updating omitted repositories to `DISCONNECTED`
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray, eq, and } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { users, tenants, candidates, resourceConnections, resources } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { BaseResourceConnector } from '../../src/connectors/base/resource-connector.js';
import { connectorRegistry } from '../../src/connectors/registry/connector-registry.js';

describe('Step 1D: End-to-End Multi-Repository Selection HTTP Flow', () => {
  let app;
  let sessionCookie;
  const createdTenantIds = [];
  let testUser;
  let testTenant;
  let testCandidate;
  let _testConnection;

  const mockRepos = [
    { id: 1338724502, name: 'Ai-job-mcp', full_name: 'vishu1803/Ai-job-mcp', private: false },
    { id: 808279506, name: 'Spotify-clone', full_name: 'vishu1803/Spotify-clone', private: true },
    {
      id: 841836553,
      name: 'FTVsalon-Academy',
      full_name: 'vishu1803/FTVsalon-Academy',
      private: true,
    },
    {
      id: 1263837407,
      name: 'construction-webpage',
      full_name: 'vishu1803/construction-webpage',
      private: true,
    },
  ];

  class MockGitHubConnector extends BaseResourceConnector {
    constructor() {
      super('GITHUB_APP');
    }

    getCapabilities() {
      return new Set();
    }

    async listResources() {
      return {
        totalCount: mockRepos.length,
        items: mockRepos.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          isPrivate: r.private,
          metadata: { htmlUrl: `https://github.com/${r.full_name}` },
        })),
      };
    }
  }

  before(async () => {
    // Register mock GitHub App connector
    connectorRegistry.register('GITHUB_APP', new MockGitHubConnector(), { allowOverride: true });

    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    [testTenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'Step 1D Test Org',
        slug: `step1d-test-org-${Date.now()}`,
      })
      .returning();

    const userId = crypto.randomUUID();
    [testUser] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId: testTenant.id,
        email: `vishw.step1d.${Date.now()}@example.com`,
        displayName: 'Vishw Tester',
        role: 'MEMBER',
      })
      .returning();

    const candidateId = crypto.randomUUID();
    [testCandidate] = await db
      .insert(candidates)
      .values({
        id: candidateId,
        tenantId: testTenant.id,
        userId: testUser.id,
        displayName: 'Vishw Tester',
        canonicalEmail: testUser.email,
      })
      .returning();

    [_testConnection] = await db
      .insert(resourceConnections)
      .values({
        id: crypto.randomUUID(),
        tenantId: testTenant.id,
        userId: testUser.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'GitHub App Installation',
        externalAccountId: '155430459',
        externalAccountName: 'vishu1803',
        installationId: '155430459',
        encryptedCredentials: 'enc:v1:dummy',
        status: 'ACTIVE',
      })
      .returning();

    app = buildApp({
      logger: false,
      database: db,
    });
    await app.ready();

    const session = await createSession(db, {
      userId: testUser.id,
      tenantId: testTenant.id,
    });
    sessionCookie = `career_hub_session=${session.rawToken}; Path=/; HttpOnly; SameSite=Lax`;
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (app) await app.close();
    await closeDatabase();
  });

  it('1. submits 4 checked repositories via application/x-www-form-urlencoded and persists all 4 as ACTIVE resources', async () => {
    const formBody =
      'repositories=1338724502&repositories=808279506&repositories=841836553&repositories=1263837407';

    const postRes = await app.inject({
      method: 'POST',
      url: '/onboarding/repositories/select',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: sessionCookie,
      },
      payload: formBody,
    });

    assert.strictEqual(postRes.statusCode, 302);
    assert.ok(postRes.headers.location.includes('/onboarding?step=4'));

    // Check database state directly
    const persisted = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, testTenant.id),
          eq(resources.candidateId, testCandidate.id),
          eq(resources.status, 'ACTIVE')
        )
      );

    assert.strictEqual(persisted.length, 4);
    const persistedExtIds = new Set(persisted.map((r) => r.externalResourceId));
    assert.ok(persistedExtIds.has('1338724502'));
    assert.ok(persistedExtIds.has('808279506'));
    assert.ok(persistedExtIds.has('841836553'));
    assert.ok(persistedExtIds.has('1263837407'));
  });

  it('2. GET /onboarding?step=4 renders all 4 queued repository sources', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/onboarding?step=4',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.strictEqual(getRes.statusCode, 200);
    const html = getRes.body;

    assert.ok(html.includes('4</strong> repository sources queued'));
    assert.ok(html.includes('Ai-job-mcp'));
    assert.ok(html.includes('Spotify-clone'));
    assert.ok(html.includes('FTVsalon-Academy'));
    assert.ok(html.includes('construction-webpage'));
  });

  it('3. updates omitted repositories to DISCONNECTED when saving a reduced selection of 2 repositories', async () => {
    // Select only Ai-job-mcp and Spotify-clone
    const formBody = 'repositories=1338724502&repositories=808279506';

    const postRes = await app.inject({
      method: 'POST',
      url: '/onboarding/repositories/select',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: sessionCookie,
      },
      payload: formBody,
    });

    assert.strictEqual(postRes.statusCode, 302);

    const activeResources = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, testTenant.id),
          eq(resources.candidateId, testCandidate.id),
          eq(resources.status, 'ACTIVE')
        )
      );

    const disconnectedResources = await db
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, testTenant.id),
          eq(resources.candidateId, testCandidate.id),
          eq(resources.status, 'DISCONNECTED')
        )
      );

    assert.strictEqual(activeResources.length, 2);
    assert.strictEqual(disconnectedResources.length, 2);

    // Step 4 query verification
    const getRes = await app.inject({
      method: 'GET',
      url: '/onboarding?step=4',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.strictEqual(getRes.statusCode, 200);
    assert.ok(getRes.body.includes('2</strong> repository sources queued'));
  });
});
