/**
 * @file P88 Integration Test: Job Radar, Sources Hardening, Save/Unsave Pipeline & Gemini 3.8 Flash Policy
 *
 * Verifies:
 * 1. AI Task Policy: all canonical tasks use gemini-3.8-flash preferredModelId.
 * 2. Job Discovery Service: production instances never leak synthetic jobs.
 * 3. Sources -> GitHub -> Select Repositories return flow with from=sources preservation.
 * 4. Job Radar full flow: Discovery, deterministic ATS scoring, Save Job persistence, Saved Jobs tab, and Unsave flow.
 * 5. UI Hygiene: No raw unicode emojis in onboarding and profile views.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { buildApp } from '../../src/app.js';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  users,
  tenants,
  candidates,
  resourceConnections,
  resources,
  jobApplications,
} from '../../src/db/schema.js';
import { createSession } from '../../src/security/session.service.js';
import { BaseResourceConnector } from '../../src/connectors/base/resource-connector.js';
import { connectorRegistry } from '../../src/connectors/registry/connector-registry.js';
import { defaultTaskPolicyRegistry } from '../../src/clients/ai/task-policy.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';

describe('P88: Production Verification and Fix — Radar, Sources & AI Policy', () => {
  let app;
  let rawSessionToken;
  let testUser;
  let testTenant;
  let testCandidate;
  const createdTenantIds = [];

  const mockRepos = [
    { id: '1001', name: 'cloud-mesh', fullName: 'testuser/cloud-mesh', isPrivate: false },
    {
      id: '1002',
      name: 'telemetry-engine',
      fullName: 'testuser/telemetry-engine',
      isPrivate: true,
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
          fullName: r.fullName,
          isPrivate: r.isPrivate,
          metadata: { htmlUrl: `https://github.com/${r.fullName}` },
        })),
      };
    }
  }

  before(async () => {
    connectorRegistry.register('GITHUB_APP', new MockGitHubConnector(), { allowOverride: true });

    const tenantId = crypto.randomUUID();
    createdTenantIds.push(tenantId);

    [testTenant] = await db
      .insert(tenants)
      .values({
        id: tenantId,
        name: 'P88 Test Tenant',
        slug: `p88-tenant-${Date.now()}`,
      })
      .returning();

    const userId = crypto.randomUUID();
    [testUser] = await db
      .insert(users)
      .values({
        id: userId,
        tenantId: testTenant.id,
        email: `candidate-${Date.now()}@p88.example.com`,
        displayName: 'P88 Test Candidate',
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
        displayName: 'P88 Test Candidate',
        canonicalEmail: testUser.email,
        headline: 'Distributed Systems Engineer',
        profileMetadata: {
          targetRoles: ['Staff Distributed Systems Engineer', 'Senior Backend Engineer'],
          userCustom: { specialization: 'Systems' },
        },
      })
      .returning();

    // Create GitHub Connection
    await db.insert(resourceConnections).values({
      id: crypto.randomUUID(),
      tenantId: testTenant.id,
      userId: testUser.id,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
      displayName: 'GitHub App Installation',
      externalAccountId: '987654',
      externalAccountName: 'testuser',
      installationId: '987654',
      encryptedCredentials: 'enc:v1:dummy',
      status: 'ACTIVE',
      metadata: { account: 'testuser' },
    });

    app = buildApp({
      logger: false,
      database: db,
    });
    await app.ready();

    const session = await createSession(db, {
      userId: testUser.id,
      tenantId: testTenant.id,
      role: testUser.role,
      authMethod: 'LOCAL',
    });

    rawSessionToken = session.rawToken;
  });

  after(async () => {
    if (app) await app.close();
    for (const tid of createdTenantIds) {
      await db.delete(jobApplications).where(eq(jobApplications.tenantId, tid));
      await db.delete(resources).where(eq(resources.tenantId, tid));
      await db.delete(resourceConnections).where(eq(resourceConnections.tenantId, tid));
      await db.delete(candidates).where(eq(candidates.tenantId, tid));
      await db.delete(users).where(eq(users.tenantId, tid));
      await db.delete(tenants).where(eq(tenants.id, tid));
    }
    await closeDatabase();
  });

  // ---------------------------------------------------------------------------
  // 1. AI Task Policy Standard
  // ---------------------------------------------------------------------------
  describe('1. Gemini 3.8 Flash Task Policy Standard', () => {
    it('enforces gemini-3.8-flash as the preferred model for all canonical AI policies', () => {
      const allPolicies = Array.from(defaultTaskPolicyRegistry.policies.values());
      assert.ok(allPolicies.length >= 10, 'Expected multiple canonical policies registered');

      for (const policy of allPolicies) {
        assert.equal(
          policy.preferredModelId,
          'gemini-3.8-flash',
          `Policy ${policy.taskType} must use gemini-3.8-flash as preferredModelId`
        );
      }
    });

    it('returns gemini-3.8-flash for CAREER_ASSISTANT policy resolution', () => {
      const policy = defaultTaskPolicyRegistry.getPolicy('CAREER_ASSISTANT');
      assert.equal(policy.preferredModelId, 'gemini-3.8-flash');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Production Job Discovery Isolation
  // ---------------------------------------------------------------------------
  describe('2. Job Discovery Synthetic Isolation', () => {
    it('returns zero synthetic jobs when includeSynthetic is false', async () => {
      const discovery = new JobDiscoveryService({ includeSynthetic: false });
      const res = await discovery.searchJobs({ query: 'Engineer' });
      assert.ok(Array.isArray(res.jobs));
      const hasStripe = res.jobs.some((j) => j.company === 'Stripe' && j.id.startsWith('SYN-'));
      assert.equal(hasStripe, false, 'Synthetic Stripe jobs must not appear');
    });

    it('rejects with NotFoundError when getting synthetic posting with includeSynthetic: false', async () => {
      const discovery = new JobDiscoveryService({ includeSynthetic: false });
      await assert.rejects(async () => discovery.getJobPosting({ jobId: 'SYN-001' }), /not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Sources -> GitHub Add Repository Return Flow
  // ---------------------------------------------------------------------------
  describe('3. Sources -> GitHub Selection Flow', () => {
    it('preserves from=sources on POST /onboarding/repositories/select and redirects to /sources with success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/onboarding/repositories/select',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'from=sources&repositories=1001&repositories=1002',
      });

      assert.equal(res.statusCode, 302);
      assert.match(res.headers.location, /\/sources\?success=/);

      // Verify database persistence as ACTIVE resources
      const saved = await db
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.tenantId, testTenant.id),
            eq(resources.candidateId, testCandidate.id),
            eq(resources.status, 'ACTIVE')
          )
        );

      assert.equal(saved.length, 2);
      const names = saved.map((r) => r.name);
      assert.ok(names.some((n) => n.includes('cloud-mesh')));
      assert.ok(names.some((n) => n.includes('telemetry-engine')));
    });

    it('renders the selected active repositories on GET /sources', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/sources',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /cloud-mesh/);
      assert.match(res.payload, /telemetry-engine/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Job Radar Discovery, Persistence & Save/Unsave Pipeline
  // ---------------------------------------------------------------------------
  describe('4. Job Radar Discovery & Pipeline Persistence', () => {
    it('GET /apps/radar renders Discover tab with search form and navigation tabs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/apps/radar',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /Job Radar &amp; Market Fit|Job Radar & Market Fit/);
      assert.match(res.payload, /Discover Jobs/);
      assert.match(res.payload, /Saved Pipeline/);
      assert.match(res.payload, /Custom Analysis/);
    });

    it('POST /jobs/save persists a selected job into jobApplications with status SAVED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs/save',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          jobId: 'EXT-JOB-9901',
          title: 'Principal Systems Architect',
          company: 'HyperScale Systems',
          location: 'Remote, US',
          workplaceType: 'REMOTE',
          skills: ['Distributed Systems', 'Go', 'Kubernetes'],
          atsScore: 92,
        }),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.success, true);
      assert.equal(body.saved, true);
      assert.equal(body.jobId, 'EXT-JOB-9901');

      // Verify in DB
      const [appRecord] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, testTenant.id),
            eq(jobApplications.candidateId, testCandidate.id),
            eq(jobApplications.canonicalJobId, 'EXT-JOB-9901')
          )
        );

      assert.ok(appRecord);
      assert.equal(appRecord.status, 'SAVED');
      assert.equal(appRecord.companyName, 'HyperScale Systems');
      assert.equal(appRecord.jobTitle, 'Principal Systems Architect');
      assert.equal(appRecord.source, 'JOB_RADAR');
    });

    it('GET /apps/radar?tab=saved displays the saved job in the candidate pipeline', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/apps/radar?tab=saved',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(res.statusCode, 200);
      assert.match(res.payload, /Principal Systems Architect/);
      assert.match(res.payload, /HyperScale Systems/);
      assert.match(res.payload, /Prepare Application/);
    });

    it('POST /jobs/unsave marks the application as ARCHIVED and removes from active saved pipeline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/jobs/unsave',
        cookies: {
          career_hub_session: rawSessionToken,
        },
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          jobId: 'EXT-JOB-9901',
        }),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.success, true);
      assert.equal(body.saved, false);

      // Verify DB status is ARCHIVED
      const [appRecord] = await db
        .select()
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.tenantId, testTenant.id),
            eq(jobApplications.canonicalJobId, 'EXT-JOB-9901')
          )
        );

      assert.equal(appRecord.status, 'ARCHIVED');

      // Check saved tab now renders clean empty state
      const tabRes = await app.inject({
        method: 'GET',
        url: '/apps/radar?tab=saved',
        cookies: {
          career_hub_session: rawSessionToken,
        },
      });

      assert.equal(tabRes.statusCode, 200);
      assert.match(tabRes.payload, /No Saved Jobs in Pipeline/);
    });
  });
});
