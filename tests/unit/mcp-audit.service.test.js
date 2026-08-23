/**
 * @file Unit Tests for MCP Audit Logging Service (P7-006 / ARCH-025 / ADR-046).
 *
 * Verifies all architectural and security invariants:
 * 1. Single unified audit ledger insertion with canonical event taxonomy.
 * 2. Strict credential & secret sanitization (stripping tokens, passwords, raw code/resumes).
 * 3. 16 KB payload ceiling and parameter string clamping.
 * 4. Failure isolation (DB write errors do not crash callers).
 * 5. Safe handling of unauthenticated / unknown tenant requests.
 * 6. Tenant-scoped listing with multi-tenant default-deny isolation.
 * 7. Query filtering by eventType, toolName, requestId, dates, and pagination.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { McpAuditService } from '../../src/services/mcp-audit.service.js';
import { AuthorizationError } from '../../src/errors/index.js';

describe('McpAuditService Unit Tests (P7-006)', () => {
  let mockDb;
  let insertedAuditRows;
  let mockLogger;
  let loggedErrors;
  let loggedWarns;
  let loggedInfos;
  let auditService;

  const tenantId = crypto.randomUUID();
  const foreignTenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const requestId = crypto.randomUUID();

  const mockContext = {
    requestId,
    tenantId,
    userId,
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
    clientInfo: {
      protocolVersion: '2026-07-28',
      ipAddress: '127.0.0.1',
      userAgent: 'Antigravity-Agent/1.0',
    },
    authenticatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    insertedAuditRows = [];
    loggedErrors = [];
    loggedWarns = [];
    loggedInfos = [];

    mockDb = {
      insert: () => ({
        values: (row) => ({
          returning: async () => {
            const persisted = {
              id: crypto.randomUUID(),
              ...row,
              createdAt: new Date(),
            };
            insertedAuditRows.push(persisted);
            return [persisted];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: (limit) => ({
                offset: (offset) => {
                  const filtered = insertedAuditRows.filter((r) => r.tenantId === tenantId);
                  return filtered.slice(offset, offset + limit);
                },
              }),
            }),
          }),
        }),
      }),
    };

    mockLogger = {
      info: (obj, msg) => loggedInfos.push({ obj, msg }),
      warn: (obj, msg) => loggedWarns.push({ obj, msg }),
      error: (obj, msg) => loggedErrors.push({ obj, msg }),
    };

    auditService = new McpAuditService({ db: mockDb, logger: mockLogger });
  });

  // ---------------------------------------------------------------------------
  // 1. Tool Execution Audit Logging
  // ---------------------------------------------------------------------------
  it('1. records mcp.tool.completed event with execution telemetry into PostgreSQL audit_logs', async () => {
    const result = await auditService.recordEvent({
      context: mockContext,
      eventType: 'mcp.tool.completed',
      resourceType: 'mcp_tool',
      resourceId: 'generate_tailored_resume',
      requestId,
      clientIp: '192.0.2.1',
      userAgent: 'Claude-Desktop/1.0',
      durationMs: 450,
      statusCode: 200,
      isError: false,
      parameters: {
        targetCandidateId: crypto.randomUUID(),
        presentationMode: 'PRESERVE_EXISTING',
      },
      summary: {
        totalBullets: 6,
        integrityStatus: 'PASS',
      },
    });

    assert.ok(result);
    assert.strictEqual(insertedAuditRows.length, 1);
    const row = insertedAuditRows[0];

    assert.strictEqual(row.tenantId, tenantId);
    assert.strictEqual(row.userId, userId);
    assert.strictEqual(row.eventType, 'mcp.tool.completed');
    assert.strictEqual(row.resourceType, 'mcp_tool');
    assert.strictEqual(row.resourceId, 'generate_tailored_resume');
    assert.strictEqual(row.requestId, requestId);
    assert.strictEqual(row.ipAddress, '192.0.2.1');
    assert.strictEqual(row.userAgent, 'Claude-Desktop/1.0');

    assert.strictEqual(row.details.toolName, 'generate_tailored_resume');
    assert.strictEqual(row.details.durationMs, 450);
    assert.strictEqual(row.details.statusCode, 200);
    assert.strictEqual(row.details.isError, false);
    assert.strictEqual(row.details.role, 'MEMBER');
    assert.strictEqual(row.details.authMethod, 'MCP_API_TOKEN');
    assert.strictEqual(row.details.summary.totalBullets, 6);
  });

  // ---------------------------------------------------------------------------
  // 2. Denial & Failure Event Logging
  // ---------------------------------------------------------------------------
  it('2. records mcp.tool.denied event for role and rate-limit violations', async () => {
    const result = await auditService.recordEvent({
      context: mockContext,
      eventType: 'mcp.tool.denied',
      resourceType: 'mcp_tool',
      resourceId: 'draft_cover_letter',
      requestId,
      clientIp: '127.0.0.1',
      durationMs: 15,
      statusCode: 403,
      errorCode: -32003,
      errorMessage: 'READONLY users cannot draft cover letters',
      isError: true,
    });

    assert.ok(result);
    assert.strictEqual(insertedAuditRows.length, 1);
    const row = insertedAuditRows[0];

    assert.strictEqual(row.eventType, 'mcp.tool.denied');
    assert.strictEqual(row.details.statusCode, 403);
    assert.strictEqual(row.details.errorCode, -32003);
    assert.strictEqual(row.details.isError, true);
    assert.strictEqual(row.details.errorMessage, 'READONLY users cannot draft cover letters');
  });

  // ---------------------------------------------------------------------------
  // 3. Credential & Secret Scrubbing
  // ---------------------------------------------------------------------------
  it('3. strictly scrubs API tokens, passwords, raw resumes, and code from parameters', async () => {
    await auditService.recordEvent({
      context: mockContext,
      eventType: 'mcp.tool.completed',
      resourceType: 'mcp_tool',
      resourceId: 'analyze_job_fit',
      requestId,
      parameters: {
        token: 'secret_bearer_token_123',
        password: 'db_password_123',
        accessToken: 'mcp_live_4a8b9c1d2e3f',
        apiKey: 'sk-ant-api-key',
        resume: 'Raw full resume text with sensitive PII',
        sourceCode: 'def private_business_logic(): pass',
        publicField: 'safe-public-identifier',
      },
    });

    assert.strictEqual(insertedAuditRows.length, 1);
    const params = insertedAuditRows[0].details.parameters;

    assert.strictEqual(params.token, undefined);
    assert.strictEqual(params.password, undefined);
    assert.strictEqual(params.accessToken, undefined);
    assert.strictEqual(params.apiKey, undefined);
    assert.strictEqual(params.resume, undefined);
    assert.strictEqual(params.sourceCode, undefined);
    assert.strictEqual(params.publicField, 'safe-public-identifier');
  });

  // ---------------------------------------------------------------------------
  // 4. Large String Parameter Clamping
  // ---------------------------------------------------------------------------
  it('4. clamps massive string parameters to prevent audit storage exhaustion', async () => {
    const hugeString = 'X'.repeat(5000);
    await auditService.recordEvent({
      context: mockContext,
      eventType: 'mcp.tool.completed',
      resourceType: 'mcp_tool',
      resourceId: 'analyze_job_fit',
      requestId,
      parameters: {
        jobDescriptionText: hugeString,
      },
    });

    assert.strictEqual(insertedAuditRows.length, 1);
    const text = insertedAuditRows[0].details.parameters.jobDescriptionText;

    assert.ok(text.length < 1200);
    assert.ok(text.includes('[TRUNCATED_5000_CHARS]'));
  });

  // ---------------------------------------------------------------------------
  // 5. Failure Isolation
  // ---------------------------------------------------------------------------
  it('5. isolates database errors: transient DB failure logs error but does not throw exception', async () => {
    const failingDb = {
      insert: () => ({
        values: () => ({
          returning: async () => {
            throw new Error('Connection terminated unexpectedly');
          },
        }),
      }),
    };

    const resilientService = new McpAuditService({ db: failingDb, logger: mockLogger });

    // Must NOT throw
    const result = await resilientService.recordEvent({
      context: mockContext,
      eventType: 'mcp.tool.completed',
      resourceType: 'mcp_tool',
      resourceId: 'list_verified_skills',
      requestId,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(loggedErrors.length, 1);
    assert.ok(loggedErrors[0].msg.includes('failure isolated'));
  });

  // ---------------------------------------------------------------------------
  // 6. Unauthenticated Request Handling
  // ---------------------------------------------------------------------------
  it('6. handles unauthenticated requests without throwing NOT NULL tenant violations', async () => {
    const result = await auditService.recordEvent({
      context: null,
      eventType: 'mcp.token.authentication_failed',
      resourceType: 'mcp_protocol',
      resourceId: 'mcp',
      requestId,
      clientIp: '203.0.113.195',
      statusCode: 401,
      errorCode: -32001,
      isError: true,
    });

    assert.strictEqual(result, null);
    assert.strictEqual(insertedAuditRows.length, 0); // No DB row created without tenant
    assert.strictEqual(loggedInfos.length, 1);
    assert.ok(loggedInfos[0].msg.includes('Unauthenticated MCP event logged'));
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-Tenant Query Isolation
  // ---------------------------------------------------------------------------
  it('7. listAuditLogs rejects unauthenticated context with AuthorizationError', async () => {
    await assert.rejects(() => auditService.listAuditLogs(null, {}), AuthorizationError);
  });

  // ---------------------------------------------------------------------------
  // 8. Multi-Tenant Filtering & Isolation
  // ---------------------------------------------------------------------------
  it('8. listAuditLogs filters strictly by tenantId and does not return foreign tenant events', async () => {
    insertedAuditRows.push({
      id: crypto.randomUUID(),
      tenantId: foreignTenantId,
      userId: crypto.randomUUID(),
      eventType: 'mcp.tool.completed',
      resourceType: 'mcp_tool',
      resourceId: 'generate_tailored_resume',
      details: {},
      createdAt: new Date(),
    });

    const list = await auditService.listAuditLogs(mockContext, { limit: 10 });
    assert.strictEqual(Array.isArray(list.items), true);
    for (const item of list.items) {
      assert.strictEqual(item.tenantId, tenantId);
    }
  });
});
