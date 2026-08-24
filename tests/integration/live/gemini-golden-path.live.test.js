/**
 * @file Live External Integration Tests for Gemini End-to-End Golden Path (P8-003 / ARCH-027)
 *
 * Runs ONLY under `npm run test:live` against live Google Gemini API (`ai.google.dev`).
 *
 * Requirements:
 * 1. Safe Skip if GEMINI_API_KEY is not configured.
 * 2. Real Google Gemini API calls using `gemini-3.7-flash` (or fallback).
 * 3. Synthetic candidate fixtures in PostgreSQL + real Fastify MCP server.
 * 4. Zero real candidate data, zero real EvidenceIds, zero production tenant records.
 * 5. Bounded API consumption (1-3 live requests total).
 * 6. Evidence Grounding & Integrity Verification on live returned model outputs.
 * 7. Compliant database lifecycle teardown with `closeDatabase()`.
 */

import '../../../src/config/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, closeDatabase } from '../../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  skills,
  candidateSkills,
  projects,
  projectResources,
  resources,
  resourceConnections,
  evidenceItems,
} from '../../../src/db/schema.js';
import { buildApp } from '../../../src/app.js';
import { createCareerMcpServer } from '../../../src/mcp/server.js';
import { McpApiTokenService } from '../../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../../src/security/mcp-rate-limiter.js';
import { GeminiProviderAdapter } from '../../../src/clients/gemini/gemini-adapter.js';
import { AnalyzeJobFitOutputSchema } from '../../../src/domain/mcp/career-read-tools.schemas.js';

const HAS_API_KEY = Boolean(process.env.GEMINI_API_KEY);

describe('Live Google Gemini End-to-End Golden Path Suite (P8-003)', { skip: !HAS_API_KEY }, () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;
  let tenantA;
  let userA;
  let candidateA;
  let projectA;
  let resourceA;
  let connectionA;
  let skillGo;
  let skillPostgres;
  let evidenceGo;
  let evidencePostgres;
  let tokenA_Raw;

  // Live Golden Path Result Schema
  const LiveGoldenPathSchema = z.object({
    tenantId: z.string().uuid(),
    candidateId: z.string().uuid(),
    jobTitle: z.string(),
    fitScore: z.number().min(0).max(100),
    fitBand: z.string(),
    verifiedSkills: z.array(z.string()),
    claimedSkills: z.array(z.string()),
    missingSkills: z.array(z.string()),
    explanation: z.string().min(10),
    citedEvidenceIds: z.array(z.string().uuid()),
    integrityStatus: z.enum(['PASS', 'PARTIAL', 'BLOCKED']),
  });

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  async function invokeMcp({ token, method, toolName, args = {}, id = 1 }) {
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': method,
    };
    if (toolName) {
      headers['mcp-name'] = toolName;
    }

    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...(toolName ? { name: toolName } : {}),
        ...(method === 'tools/call' ? { arguments: args } : args),
        _meta: PROTOCOL_META,
      },
    };

    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload,
    });

    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.payload),
    };
  }

  async function getOrCreateSkill(slug, name, category) {
    const existing = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
    const [inserted] = await db
      .insert(skills)
      .values({
        slug,
        name,
        category,
      })
      .returning();
    return inserted;
  }

  before(async () => {
    if (!HAS_API_KEY) return;

    tokenService = new McpApiTokenService({ db, nodeEnv: 'test' });
    rateLimiter = new McpRateLimiter({
      ipLimit: 500,
      tenantLimit: 1000,
      toolLimit: 200,
    });

    // 1. Provision Synthetic Tenant & Candidate Fixtures
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Live GoldenPath Tenant ${testRunId}`,
        slug: `live-gp-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `live-candidate-${testRunId}@example.com`,
        displayName: 'Live Synthetic Candidate',
        role: 'OWNER',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Live Synthetic Candidate',
        headline: 'Senior Cloud Engineer',
        canonicalEmail: `live-candidate-${testRunId}@example.com`,
      })
      .returning();

    [connectionA] = await db
      .insert(resourceConnections)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'Live GitHub App Installation',
        externalAccountId: `live-inst-${testRunId}`,
        encryptedCredentials: 'enc:mock-token',
        status: 'ACTIVE',
      })
      .returning();

    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        connectionId: connectionA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `live-repo-${testRunId}`,
        name: 'synthetic-api-service',
        displayName: 'synthetic-api-service',
        url: `https://github.com/synthetic/api-service-${testRunId}`,
        status: 'ACTIVE',
      })
      .returning();

    [projectA] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Synthetic API Service',
        slug: `synthetic-api-${testRunId}`,
        headline: 'Go & PostgreSQL API Backend',
        role: 'Backend Architect',
        isHighlighted: true,
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA.id,
      resourceId: resourceA.id,
    });

    skillGo = await getOrCreateSkill('go', 'Go', 'LANGUAGE');
    skillPostgres = await getOrCreateSkill('postgresql', 'PostgreSQL', 'DATABASE');

    [evidenceGo] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA.id,
        skillId: skillGo.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'cmd/server/main.go',
          commitSha: '111122223333444455556666777788889999aaaa',
          lineRange: { start: 1, end: 30 },
        },
        excerpt: 'package main\n\nimport "net/http"\n\nfunc main() {}',
        confidenceScore: 0.95,
      })
      .returning();

    [evidencePostgres] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA.id,
        skillId: skillPostgres.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'internal/db/postgres.go',
          commitSha: '22223333444455556666777788889999aaaabbbb',
          lineRange: { start: 1, end: 20 },
        },
        excerpt: 'func connect() (*sql.DB, error) {}',
        confidenceScore: 0.9,
      })
      .returning();

    await db.insert(candidateSkills).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillGo.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        evidenceCount: 1,
        primaryEvidenceId: evidenceGo.id,
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPostgres.id,
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.9,
        evidenceCount: 1,
        primaryEvidenceId: evidencePostgres.id,
      },
    ]);

    const tokenResult = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'OWNER',
      name: 'Live Golden Path Token',
      scopes: ['career:read'],
      expiryDays: 30,
    });
    tokenA_Raw = tokenResult.rawToken;

    const mcpServer = createCareerMcpServer({ deps: { db } });
    app = await buildApp({
      mcpServer,
      db,
      rateLimiter,
      tokenService,
    });
    await app.ready();
  });

  after(async () => {
    try {
      if (app) await app.close();
      for (const tId of createdTenantIds) {
        await db
          .delete(tenants)
          .where(eq(tenants.id, tId))
          .catch(() => {});
      }
    } finally {
      await closeDatabase();

      if (typeof process._getActiveHandles === 'function') {
        const handles = process._getActiveHandles();
        for (const h of handles) {
          if (
            h &&
            typeof h.unref === 'function' &&
            h !== process.stdout &&
            h !== process.stderr &&
            h !== process.stdin
          ) {
            h.unref();
          }
        }
      }
    }
  });

  // ===========================================================================
  // Live Golden Path: Remote MCP -> Live Gemini Structured Output
  // ===========================================================================
  it('1. Live Golden Path: Dispatches MCP analyze_job_fit and generates live Gemini fit explanation', async () => {
    const jobDescriptionText = `
      Title: Senior Backend Go Engineer
      Company: Nexus Cloud Labs

      Requirements:
      - 5+ years of experience with Go (Golang) backend services
      - Proficiency with PostgreSQL relational database schema design
      - Nice to have: Apache Kafka event streaming
    `;

    // 1. Dispatch Real MCP analyze_job_fit
    const mcpRes = await invokeMcp({
      token: tokenA_Raw,
      method: 'tools/call',
      toolName: 'analyze_job_fit',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText,
        jobTitle: 'Senior Backend Go Engineer',
        companyName: 'Nexus Cloud Labs',
      },
    });

    assert.strictEqual(mcpRes.statusCode, 200);
    const fitOutput = JSON.parse(mcpRes.body.result.content[0].text);
    const validatedFit = AnalyzeJobFitOutputSchema.parse(fitOutput);

    const fitScore = validatedFit.overallFit.atsScore;
    assert.ok(typeof fitScore === 'number' && fitScore > 0);

    // 2. Invoke Live Google Gemini API with JOB_EXPLANATION Policy
    const adapter = new GeminiProviderAdapter();

    const liveResult = await adapter.generateStructured({
      taskType: 'JOB_EXPLANATION',
      prompt:
        'Explain the candidate fit for Senior Backend Go Engineer based on the provided facts and evidence.',
      candidateFacts: {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        displayName: 'Live Synthetic Candidate',
        verifiedSkills: ['Go', 'PostgreSQL'],
      },
      approvedAssertions: {
        fitScore,
        matchedSkills: ['Go', 'PostgreSQL'],
        missingSkills: ['Kafka'],
      },
      verifiedEvidence: [
        { evidenceId: evidenceGo.id, skill: 'Go', file: 'cmd/server/main.go' },
        { evidenceId: evidencePostgres.id, skill: 'PostgreSQL', file: 'internal/db/postgres.go' },
      ],
      responseSchema: LiveGoldenPathSchema,
    });

    assert.strictEqual(liveResult.provider, 'gemini');
    assert.strictEqual(liveResult.data.tenantId, tenantA.id);
    assert.strictEqual(liveResult.data.candidateId, candidateA.id);
    assert.strictEqual(liveResult.data.fitScore, fitScore);
    assert.ok(liveResult.data.explanation.length >= 10);

    // 3. Grounding Verification: All cited evidence must exist in Tenant A
    const validIds = [evidenceGo.id, evidencePostgres.id];
    for (const citedId of liveResult.data.citedEvidenceIds) {
      assert.ok(validIds.includes(citedId), `Live model cited unrecognized EvidenceId: ${citedId}`);
    }
  });
});
