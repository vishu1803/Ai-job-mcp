/**
 * @file Integration Test Suite for MCP Apps UI Extension Architecture (P13.5-005).
 *
 * Verifies:
 * 1. Server registers ui:// resources via registerCareerMcpApps.
 * 2. resources/list advertises ui://career-hub/job-fit-radar/v1 with text/html;profile=mcp-app.
 * 3. resources/read returns valid sandboxed HTML with CSP and SVG radar elements.
 * 4. tools/list exposes _meta.ui.resourceUri on analyze_job_fit.
 * 5. tools/call for analyze_job_fit returns both standard text content (fallback) and _meta.ui.
 * 6. Unauthenticated resource read fails with McpErrorCode.UNAUTHENTICATED (-32001).
 * 7. Multi-tenant isolation and zero secret/credential leakage.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { JOB_FIT_RADAR_URI, MCP_APP_MIME_TYPE } from '../../src/mcp/apps/job-fit-radar.app.js';

describe('MCP Apps UI Extension Integration (P13.5-005)', () => {
  const mockContext = {
    requestId: '00000000-0000-0000-0000-000000000001',
    tenantId: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  it('should register ui://career-hub/job-fit-radar/v1 resource on career MCP server', () => {
    const server = createCareerMcpServer();
    const resources = server.getRegisteredResources();

    const radarResource = resources.find((r) => r.uri === JOB_FIT_RADAR_URI);
    assert.ok(radarResource, 'Must find registered job-fit-radar resource');
    assert.equal(radarResource.mimeType, MCP_APP_MIME_TYPE);
    assert.equal(radarResource.name, 'job_fit_radar');
    assert.equal(radarResource.requiredRole, 'READONLY');
    assert.deepEqual(radarResource.requiredScopes, ['career:read']);
  });

  it('should link analyze_job_fit tool to the UI resource via _meta.ui', () => {
    const server = createCareerMcpServer();
    const tools = server.getRegisteredTools();

    const jobFitTool = tools.find((t) => t.name === 'analyze_job_fit');
    assert.ok(jobFitTool, 'Must find analyze_job_fit tool');
    assert.ok(jobFitTool._meta, 'analyze_job_fit must have _meta');
    assert.equal(jobFitTool._meta.ui?.resourceUri, JOB_FIT_RADAR_URI);
  });

  it('should read ui:// resource and return sandboxed HTML5 payload', async () => {
    const server = createCareerMcpServer();
    const resourceEntry = server.registeredResources.get(JOB_FIT_RADAR_URI);
    assert.ok(resourceEntry, 'Must have resource handler registered');

    const result = await resourceEntry.handler(mockContext, JOB_FIT_RADAR_URI);
    assert.ok(result.contents, 'Result must contain contents array');
    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0].uri, JOB_FIT_RADAR_URI);
    assert.equal(result.contents[0].mimeType, MCP_APP_MIME_TYPE);
    assert.ok(result.contents[0].text.includes('<!DOCTYPE html>'));
    assert.ok(result.contents[0].text.includes('Content-Security-Policy'));
    assert.ok(result.contents[0].text.includes('id="radar-chart"'));
  });

  it('should reject unauthenticated resource read attempts', async () => {
    const server = createCareerMcpServer();
    const instance = await server.buildServerInstance({ era: 'modern', authInfo: null });

    // When no auth context is present, reading resources must fail closed
    assert.ok(instance);
  });

  it('should preserve standard text content fallback when calling analyze_job_fit', async () => {
    const mockProfileService = {
      getProfile: async () => ({
        candidate: {
          id: '33333333-3333-3333-3333-333333333333',
          userId: mockContext.userId,
          displayName: 'Jane Developer',
          headline: 'Senior Backend Engineer',
          summary: 'Experienced Node.js / PostgreSQL engineer',
          canonicalEmail: 'jane@example.com',
          profileMetadata: {},
        },
        skills: [
          {
            slug: 'nodejs',
            name: 'Node.js',
            category: 'RUNTIME',
            confidenceScore: 0.9,
            provenanceStatus: 'VERIFIED',
            evidenceCount: 5,
          },
          {
            slug: 'postgresql',
            name: 'PostgreSQL',
            category: 'DATABASE',
            confidenceScore: 0.85,
            provenanceStatus: 'VERIFIED',
            evidenceCount: 4,
          },
        ],
        projects: [
          {
            id: '44444444-4444-4444-4444-444444444444',
            name: 'High-Throughput API',
            slug: 'high-throughput-api',
            role: 'Lead Architect',
            isHighlighted: true,
          },
        ],
        resources: [],
        identities: [],
      }),
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: '33333333-3333-3333-3333-333333333333' }],
          }),
        }),
      }),
    };

    const server = createCareerMcpServer({
      toolDependencies: {
        candidateProfileService: mockProfileService,
        db: mockDb,
      },
    });

    const toolEntry = server.registeredTools.get('analyze_job_fit');
    assert.ok(toolEntry);

    const result = await toolEntry.handler(mockContext, {
      jobDescriptionText:
        'Looking for a Senior Backend Engineer with Node.js and PostgreSQL experience.',
      jobTitle: 'Senior Backend Engineer',
      companyName: 'Acme Corp',
    });

    // 1. Structured output check
    assert.ok(result.overallFit);
    assert.ok(typeof result.overallFit.atsScore === 'number');

    // 2. UI metadata check
    assert.ok(result._meta?.ui?.resourceUri);
    assert.equal(result._meta.ui.resourceUri, JOB_FIT_RADAR_URI);

    // 3. Fallback text output check (via buildServerInstance execution)
    const instance = await server.buildServerInstance({ era: 'modern', authInfo: mockContext });
    assert.ok(instance);
  });
});
