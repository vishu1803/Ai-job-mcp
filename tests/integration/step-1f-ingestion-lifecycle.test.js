/**
 * @file Integration Tests for Step 1F: AST Ingestion Lifecycle, Idempotency, Polling & Reload
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import { users, tenants, candidates, resourceConnections, resources } from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { IngestionStateService } from '../../src/services/ingestion-state.service.js';

describe('Step 1F: End-to-End Ingestion Lifecycle & Idempotency Integration Tests', () => {
  let app;
  let sessionCookie;
  let foreignSessionCookie;
  const createdTenantIds = [];
  let testUser;
  let testTenant;
  let testCandidate;
  let ingestionStateService;
  let mockIngestionService;

  before(async () => {
    ingestionStateService = new IngestionStateService();

    let syncGateResolve;
    const syncGate = new Promise((resolve) => {
      syncGateResolve = resolve;
    });

    // Mock Ingestion Service that simulates asynchronous processing with progress callbacks
    mockIngestionService = {
      syncCandidateRepositories: async ({ onProgress }) => {
        // Emit progress events
        if (typeof onProgress === 'function') {
          onProgress({
            type: 'REPOSITORY_STARTED',
            resource: { id: '1338724502', name: 'Ai-job-mcp' },
            phase: 'Analyzing AST syntax...',
          });
        }

        // Wait on gate so we can test active RUNNING state and concurrent rejection
        await syncGate;

        if (typeof onProgress === 'function') {
          onProgress({
            type: 'REPOSITORY_COMPLETED',
            resource: { id: '1338724502', name: 'Ai-job-mcp' },
            result: { projectCreated: true, evidenceCreated: 12 },
          });
        }
        return {
          repositoriesProcessed: 1,
          projectsCreated: 1,
          projectsUpdated: 0,
          evidenceCreated: 12,
          evidenceLinked: 12,
          verifiedSkillsAdded: 3,
          verifiedSkills: ['Node.js', 'Fastify', 'PostgreSQL'],
        };
      },
      resolveSync: () => {
        if (syncGateResolve) syncGateResolve();
      },
    };

    app = await buildApp({
      db,
      ingestionService: mockIngestionService,
      ingestionStateService,
    });
    await app.ready();

    // 1. Provision Primary Test Tenant & Candidate
    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    const [t] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'Step 1F Test Tenant',
        slug: `step-1f-${Date.now()}`,
      })
      .returning();
    testTenant = t;

    const [u] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        tenantId: testTenant.id,
        email: `step1f-${Date.now()}@example.com`,
        passwordHash: 'argon2id$mock',
        displayName: 'Step 1F User',
      })
      .returning();
    testUser = u;

    const [cand] = await db
      .insert(candidates)
      .values({
        id: crypto.randomUUID(),
        tenantId: testTenant.id,
        userId: testUser.id,
        displayName: 'Step 1F Candidate',
        canonicalEmail: testUser.email,
        headline: 'Full-Stack Engineer',
      })
      .returning();
    testCandidate = cand;

    // Active connection
    const [conn] = await db
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
        status: 'ACTIVE',
        encryptedCredentials: 'mock',
        metadata: { installationId: 155430459 },
      })
      .returning();

    // Active Resource
    await db.insert(resources).values({
      id: crypto.randomUUID(),
      tenantId: testTenant.id,
      candidateId: testCandidate.id,
      connectionId: conn.id,
      provider: 'GITHUB_APP',
      externalResourceId: '1338724502',
      name: 'vishu1803/Ai-job-mcp',
      displayName: 'Ai-job-mcp',
      status: 'ACTIVE',
    });

    const session = await createSession(db, {
      userId: testUser.id,
      tenantId: testTenant.id,
    });
    sessionCookie = `career_hub_session=${session.rawToken}; Path=/; HttpOnly; SameSite=Lax`;

    // 2. Provision Foreign Tenant for Isolation Tests
    const foreignTenantId = crypto.randomUUID();
    createdTenantIds.push(foreignTenantId);

    const [ft] = await db
      .insert(tenants)
      .values({
        id: foreignTenantId,
        name: 'Foreign Tenant',
        slug: `foreign-${Date.now()}`,
      })
      .returning();

    const [fu] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        tenantId: ft.id,
        email: `foreign-${Date.now()}@example.com`,
        passwordHash: 'argon2id$mock',
        displayName: 'Foreign User',
      })
      .returning();

    const foreignSession = await createSession(db, {
      userId: fu.id,
      tenantId: ft.id,
    });
    foreignSessionCookie = `career_hub_session=${foreignSession.rawToken}; Path=/; HttpOnly; SameSite=Lax`;
  });

  after(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
    if (app) {
      await app.close();
    }
    await closeDatabase();
  });

  it('1. POST /onboarding/sync starts ingestion and returns 202 Accepted with IngestionRun', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/sync',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 202);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.state, 'RUNNING');
    assert.ok(body.ingestionRunId);
    assert.equal(body.run.totalRepositories, 1);
  });

  it('2. Concurrent POST /onboarding/sync is rejected with 409 Conflict (INGESTION_ALREADY_RUNNING)', async () => {
    // Attempt duplicate start while running
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/sync',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INGESTION_ALREADY_RUNNING');
    assert.ok(body.run);

    // Release sync gate so the active run can conclude
    mockIngestionService.resolveSync();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('3. GET /onboarding/ingestion/status returns live status metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/onboarding/ingestion/status',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.ingestionRunId);
    assert.ok(['RUNNING', 'COMPLETED'].includes(body.state));
    assert.equal(body.totalRepositories, 1);
    assert.ok(Array.isArray(body.repositories));
  });

  it('4. Multi-Tenant isolation: Foreign tenant receives IDLE status for own workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/onboarding/ingestion/status',
      headers: {
        cookie: foreignSessionCookie,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.state, 'IDLE');
    assert.equal(body.ingestionRunId, null);
  });

  it('5. GET /onboarding?step=4 renders state accurately (Reload / Multi-Tab persistence)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/onboarding?step=4',
      headers: {
        cookie: sessionCookie,
      },
    });

    assert.equal(res.statusCode, 200);
    const html = res.body;
    assert.ok(
      html.includes('RUNNING') || html.includes('COMPLETED'),
      'HTML must reflect active server state'
    );
    assert.ok(html.includes('vishu1803/Ai-job-mcp'), 'HTML must include repository name');
  });

  it('6. POST /onboarding/ingestion/retry resets candidate run state', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/onboarding/ingestion/retry',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);

    // Verify status is now IDLE
    const statusRes = await app.inject({
      method: 'GET',
      url: '/onboarding/ingestion/status',
      headers: {
        cookie: sessionCookie,
        accept: 'application/json',
      },
    });

    const statusBody = JSON.parse(statusRes.body);
    assert.equal(statusBody.state, 'IDLE');
  });
});
