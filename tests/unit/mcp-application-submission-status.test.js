/**
 * @file Unit & Regression Tests: MCP get_application_submission_status tool (P14-005AY)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import { jobApplications } from '../../src/db/schema.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { NotFoundError } from '../../src/errors/index.js';

describe('MCP get_application_submission_status Tool Regression Suite (P14-005AY)', () => {
  const existingAppId = '0fe0cce0-dd5f-43e8-91fb-e8e8b2b4158a';
  const tenantId = '24d53f53-780e-4431-b065-32180c354175';
  const otherTenantId = '00000000-0000-4000-a000-000000000000';
  const userId = '9dd8e4fb-456b-4104-9cb1-c839a544b721';

  const server = createCareerMcpServer({ deps: { database: db } });
  const tool = server.registeredTools.get('get_application_submission_status');

  assert.ok(tool, 'get_application_submission_status tool must be registered');

  const authContext = {
    tenantId,
    userId,
    tokenScopes: ['career:read'],
    role: 'READONLY',
  };

  it('1. lookup by applicationId succeeds for the existing real application', async () => {
    const result = await tool.handler(authContext, { applicationId: existingAppId });

    assert.ok(result, 'Result must be returned');
    assert.strictEqual(result.applicationId, existingAppId);
    assert.strictEqual(result.candidateId, '10a2b51b-09bf-4090-8040-1f60ebeb89c9');
    assert.strictEqual(result.companyName, 'Vercel');
    assert.strictEqual(result.jobTitle, 'Software Engineer, Backend');
    assert.strictEqual(
      result.packageHash,
      '9ac027780d032859fdcf2097e0d3b57240f4fe8d993bcd1ee3901efff99ef191'
    );
    assert.ok(result.appliedAt, 'appliedAt timestamp must exist');
    assert.ok(Array.isArray(result.stages), 'stages array must exist');
    assert.ok(Array.isArray(result.tailoredDocuments), 'tailoredDocuments array must exist');
  });

  it('2. returned status is SUBMITTED for the existing applied application', async () => {
    const result = await tool.handler(authContext, { applicationId: existingAppId });

    assert.strictEqual(result.status, 'SUBMITTED', 'status must be SUBMITTED for APPLIED jobs');
    assert.strictEqual(
      result.trackingStatus,
      'APPLIED',
      'trackingStatus must expose internal APPLIED state'
    );
  });

  it('3. external reference is preserved when present in metadata or notes', async () => {
    // Mock application with externalReference in metadata
    const mockTrackingService = {
      getApplicationDetails: async () => ({
        application: {
          id: 'test-app-id',
          candidateId: 'test-cand-id',
          companyName: 'Stripe',
          jobTitle: 'Backend Engineer',
          jobUrl: 'https://stripe.com/jobs/1',
          status: 'APPLIED',
          metadata: { externalReference: 'SUB-21D3FF22' },
          notes:
            'Application prepared via Career Hub. Package Hash: 9ac027780d032859fdcf2097e0d3b57240f4fe8d993bcd1ee3901efff99ef191',
          appliedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        stages: [],
        tailoredDocuments: [],
      }),
    };

    const mockServer = createCareerMcpServer({
      deps: {
        database: db,
        applicationTrackingService: mockTrackingService,
      },
    });
    const mockTool = mockServer.registeredTools.get('get_application_submission_status');

    const result = await mockTool.handler(authContext, { applicationId: 'test-app-id' });
    assert.strictEqual(result.externalReference, 'SUB-21D3FF22');
    assert.strictEqual(result.status, 'SUBMITTED');
  });

  it('4. nonexistent application returns NotFoundError', async () => {
    const nonexistentId = crypto.randomUUID();

    await assert.rejects(
      async () => {
        await tool.handler(authContext, { applicationId: nonexistentId });
      },
      (err) => {
        assert.ok(
          err instanceof NotFoundError || err.name === 'NotFoundError' || err.statusCode === 404
        );
        assert.match(err.message, new RegExp(nonexistentId));
        return true;
      }
    );
  });

  it('5. unauthorized / cross-tenant lookup is rejected with NotFoundError', async () => {
    const crossTenantContext = {
      tenantId: otherTenantId,
      userId: crypto.randomUUID(),
      tokenScopes: ['career:read'],
      role: 'READONLY',
    };

    await assert.rejects(
      async () => {
        await tool.handler(crossTenantContext, { applicationId: existingAppId });
      },
      (err) => {
        assert.ok(
          err instanceof NotFoundError || err.name === 'NotFoundError' || err.statusCode === 404
        );
        return true;
      }
    );
  });

  it('6. verifies no database mutations occur during status lookup', async () => {
    const [appRecord] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, existingAppId))
      .limit(1);

    assert.ok(appRecord, 'Application must exist');
    assert.strictEqual(appRecord.status, 'APPLIED');
    assert.strictEqual(appRecord.companyName, 'Vercel');
    assert.strictEqual(appRecord.jobTitle, 'Software Engineer, Backend');
    assert.strictEqual(
      appRecord.notes,
      'Application prepared via Career Hub. Package Hash: 9ac027780d032859fdcf2097e0d3b57240f4fe8d993bcd1ee3901efff99ef191'
    );
  });

  after(async () => {
    await closeDatabase();
  });
});
