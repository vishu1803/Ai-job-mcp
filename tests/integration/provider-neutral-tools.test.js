/**
 * @file Deterministic Integration Tests for Provider-Neutral Tool Response Parity (P10-003 / ARCH-039).
 *
 * Verifies that the canonical Career Hub domain/tool responses are identical whether reached through:
 * - PATH A: Claude-style Remote MCP Streamable HTTP JSON-RPC path (POST /mcp with OAuth Bearer token)
 * - PATH B: Gemini-style Direct MCP Tool Executor path (executeToolLoop function call dispatch)
 *
 * Core Invariants Verified:
 * 1. Authoritative Structured Response Parity across all 4 core read tools:
 *    - get_candidate_profile
 *    - list_verified_skills
 *    - inspect_project_evidence
 *    - analyze_job_fit
 * 2. Strict Deep Equality (assert.deepStrictEqual) after normalizing only documented transient fields.
 * 3. ATS Missing-Skill Safety Ceiling Parity (3+ missing required skills capped at <= 24.9).
 * 4. Multi-Tenant Sovereign Default-Deny (404) Isolation Parity on cross-tenant queries.
 * 5. Inverse Authority Parity: Neither client can override scores, statuses, or EvidenceIds.
 * 6. Provider-Neutral Prompt Policy Parity (Policy IDs and versions match).
 * 7. Zero live external API calls (100% deterministic, hermetic Fastify + PostgreSQL execution).
 */

import '../../src/config/env.js';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
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
  oauthTokens,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { OAuthAuthorizationService } from '../../src/services/oauth-authorization.service.js';
import { PromptPolicyRegistry } from '../../src/clients/ai/prompt-policies/index.js';
import { defaultTaskPolicyRegistry } from '../../src/clients/ai/task-policy.js';

describe('Provider-Neutral Tool Response Parity Tests (P10-003)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let mcpServer;
  let tokenService;
  let rateLimiter;
  let oauthService;

  // Tenant A Fixtures
  let tenantA;
  let userA;
  let candidateA;
  let resourceA;
  let projectA;
  let skillGo;
  let skillPostgres;
  let skillDocker;
  let evidenceGo;
  let evidencePostgres;
  let evidenceDocker;

  // Authentication Fixtures
  let claudeOAuthAccessToken;
  let geminiMcpContext;

  // Tenant B Fixtures (for isolation tests)
  let tenantB;
  let userB;
  let candidateB;
  let claudeOAuthAccessTokenB;
  let geminiMcpContextB;

  // Target Job Description Fixtures
  const standardJobDescriptionText = `
    Job Title: Senior Distributed Systems & Cloud Backend Engineer
    Role Level: SENIOR
    
    Required Technical Skills:
    - Go / Golang high-concurrency microservices
    - PostgreSQL relational database architecture and query optimization
    - Docker containerization and multi-stage builds
    
    Preferred Technical Skills:
    - Kubernetes cluster deployment and orchestration
    - Kafka event streaming and distributed pipelines
    
    Responsibilities:
    - Design, build, and maintain low-latency backend APIs in Go.
    - Model relational schemas and optimize transaction throughput on PostgreSQL.
    - Containerize services with Docker for production deployments.
  `;

  const missingSkillsJobDescriptionText = `
    Job Title: Principal Cloud Infrastructure & Data Architect
    Role Level: PRINCIPAL
    
    Required Technical Skills:
    - Kubernetes operator development and service meshes
    - Apache Kafka distributed stream processing and partition management
    - Amazon Web Services (AWS) infrastructure and IAM policies
    - GraphQL federation and Apollo router architecture
    
    Preferred Skills:
    - Rust systems programming
    
    Responsibilities:
    - Architect multi-region cloud topology on AWS.
  `;

  /**
   * Helper: Normalizes only documented transient nondeterministic fields.
   * Preserves all domain fields: IDs, scores, statuses, counts, SHAs, paths, line ranges.
   */
  function normalizeTransientFields(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(normalizeTransientFields);
    }

    const transientKeys = new Set([
      'requestId',
      'timestamp',
      'executedAt',
      'detectedAt',
      'durationMs',
      'latencyMs',
      'traceId',
      'spanId',
    ]);

    const normalized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (transientKeys.has(key)) {
        normalized[key] = '[TRANSIENT_NORMALIZED]';
      } else if (key === 'keyMissingSkills' && Array.isArray(value)) {
        normalized[key] = [...value].sort();
      } else if (key === 'keyMatchedSkills' && Array.isArray(value)) {
        normalized[key] = [...value].sort();
      } else if (key === 'prioritizedSkillGaps' && Array.isArray(value)) {
        normalized[key] = [...value]
          .map(normalizeTransientFields)
          .sort((a, b) => (a.skillSlug || '').localeCompare(b.skillSlug || ''));
      } else if (key === 'topSkills' && Array.isArray(value)) {
        normalized[key] = [...value]
          .map(normalizeTransientFields)
          .sort((a, b) => (a.slug || '').localeCompare(b.slug || ''));
      } else if (key === 'items' && Array.isArray(value)) {
        normalized[key] = [...value]
          .map(normalizeTransientFields)
          .sort((a, b) => (a.slug || a.id || '').localeCompare(b.slug || b.id || ''));
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = normalizeTransientFields(value);
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  /**
   * Path A: Claude-Style MCP Streamable HTTP JSON-RPC Invocator.
   * Executes tools/call via HTTP POST /mcp with OAuth Bearer Token.
   */
  async function invokeClaudeMcpTool(toolName, args, token = claudeOAuthAccessToken) {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': toolName,
      },
      payload: {
        jsonrpc: '2.0',
        id: crypto.randomUUID(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      },
    });

    const parsed = JSON.parse(res.payload);

    if (parsed.error) {
      return { isError: true, error: parsed.error, statusCode: res.statusCode };
    }

    if (parsed.result?.isError) {
      const errorText = parsed.result?.content?.[0]?.text || 'MCP Tool Execution Failed';
      return {
        isError: true,
        error: {
          code: parsed.result.errorCode || -32603,
          message: errorText,
        },
        statusCode: res.statusCode,
      };
    }

    let rawData;
    if (parsed.result?.structuredData) {
      rawData = parsed.result.structuredData;
    } else if (parsed.result?.content?.[0]?.text) {
      try {
        rawData = JSON.parse(parsed.result.content[0].text);
      } catch {
        rawData = parsed.result.content[0].text;
      }
    } else {
      rawData = parsed.result;
    }

    return { isError: false, data: rawData, statusCode: res.statusCode };
  }

  /**
   * Path B: Gemini-Style Direct MCP Tool Executor Invocator.
   * Emulates how GeminiProviderAdapter / GeminiVertexAdapter invokes toolExecutor(name, args, context).
   */
  async function invokeGeminiMcpTool(toolName, args, context = geminiMcpContext) {
    const tool = mcpServer.registeredTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not registered in MCP server.`);
    }

    try {
      const rawData = await tool.handler(context, args);
      return { isError: false, data: rawData };
    } catch (err) {
      return {
        isError: true,
        error: {
          code: err.statusCode || 500,
          name: err.name,
          message: err.message,
        },
      };
    }
  }

  /**
   * Helper ensuring canonical skills exist in database.
   */
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
    tokenService = new McpApiTokenService({ db, nodeEnv: 'test' });
    rateLimiter = new McpRateLimiter({
      ipLimit: 1000,
      tenantLimit: 2000,
      toolLimit: 500,
    });
    oauthService = new OAuthAuthorizationService({ db });

    // 1. Provision Tenant A & User A
    const tenantIdA = crypto.randomUUID();
    createdTenantIds.push(tenantIdA);

    [tenantA] = await db
      .insert(tenants)
      .values({
        id: tenantIdA,
        name: `Tenant A Parity ${testRunId}`,
        slug: `tenant-a-parity-${testRunId}`,
        status: 'ACTIVE',
      })
      .returning();

    const userIdA = crypto.randomUUID();
    [userA] = await db
      .insert(users)
      .values({
        id: userIdA,
        tenantId: tenantIdA,
        email: `alice-parity-${testRunId}@example.com`,
        displayName: 'Alice Gopher',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateIdA = crypto.randomUUID();
    [candidateA] = await db
      .insert(candidates)
      .values({
        id: candidateIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        displayName: 'Alice Gopher',
        headline: 'Senior Cloud & Distributed Systems Engineer',
        summary:
          'Specialist in high-throughput Go microservices, PostgreSQL query tuning, and Docker orchestration.',
        canonicalEmail: `alice-parity-${testRunId}@example.com`,
        profileMetadata: {
          userCustom: {
            experience: [
              {
                company: 'Cloud Corp',
                title: 'Senior Backend Engineer',
                startDate: '2022-01-01',
                endDate: null,
                isCurrent: true,
                skills: ['go', 'postgresql', 'docker'],
              },
            ],
          },
        },
      })
      .returning();

    // 2. Provision Resource Connection & Repository Resource
    const connectionIdA = crypto.randomUUID();
    await db
      .insert(resourceConnections)
      .values({
        id: connectionIdA,
        tenantId: tenantIdA,
        userId: userIdA,
        provider: 'GITHUB_APP',
        authType: 'APP_INSTALLATION',
        displayName: 'GitHub App Installation',
        externalAccountId: `inst-parity-${testRunId}`,
        encryptedCredentials: 'enc:mock-token',
        status: 'ACTIVE',
      })
      .returning();

    const resourceIdA = crypto.randomUUID();
    [resourceA] = await db
      .insert(resources)
      .values({
        id: resourceIdA,
        tenantId: tenantIdA,
        candidateId: candidateIdA,
        connectionId: connectionIdA,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-orders-${testRunId}`,
        name: 'cloud-orders-engine',
        displayName: 'cloud-orders-engine',
        url: `https://github.com/alice-gopher/cloud-orders-engine-${testRunId}`,
        isPrivate: false,
        status: 'ACTIVE',
        metadata: {
          defaultBranch: 'main',
          stars: 85,
          languages: ['Go', 'SQL'],
        },
      })
      .returning();

    // 3. Provision Project & Link to Resource
    const projectIdA = crypto.randomUUID();
    [projectA] = await db
      .insert(projects)
      .values({
        id: projectIdA,
        tenantId: tenantIdA,
        candidateId: candidateIdA,
        name: 'cloud-orders-engine',
        slug: 'cloud-orders-engine',
        headline: 'High-throughput transactional order processing engine',
        summary:
          'Distributed Go service processing 50k transactions/sec with PostgreSQL persistence and Dockerized deployment.',
        role: 'Lead Architect & Core Contributor',
        startDate: '2023-01-01',
        isHighlighted: true,
        projectMetadata: {
          architecturalDensity: {
            concurrency: true,
            database: true,
            containerization: true,
          },
        },
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA.id,
      resourceId: resourceA.id,
      roleInProject: 'Primary Backend Repository',
    });

    // 4. Provision Canonical Skills & Candidate Skills (Go, PostgreSQL, Docker)
    skillGo = await getOrCreateSkill('go', 'Go', 'LANGUAGE');
    skillPostgres = await getOrCreateSkill('postgresql', 'PostgreSQL', 'DATABASE');
    skillDocker = await getOrCreateSkill('docker', 'Docker', 'TOOL');

    await db.insert(candidateSkills).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillGo.id,
        category: 'LANGUAGE',
        proficiency: 'ADVANCED',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 1,
        skillMetadata: { verifiedFrom: 'static_code_extraction' },
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPostgres.id,
        category: 'DATABASE',
        proficiency: 'ADVANCED',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 1,
        skillMetadata: { verifiedFrom: 'static_code_extraction' },
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillDocker.id,
        category: 'TOOL',
        proficiency: 'INTERMEDIATE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 1,
        skillMetadata: { verifiedFrom: 'static_code_extraction' },
      },
    ]);

    // 5. Provision Evidence Items pinned to Project & Candidate
    [evidenceGo] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        projectId: projectA.id,
        resourceId: resourceA.id,
        skillId: skillGo.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        confidenceScore: 0.95,
        sourceLocation: {
          filePath: 'cmd/server/main.go',
          commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
          lineRange: '10-45',
        },
        excerpt: 'func main() { router := gin.Default(); router.Run(":8080") }',
        metadata: {
          rawSnippet: 'func main() { router := gin.Default(); router.Run(":8080") }',
        },
      })
      .returning();

    [evidencePostgres] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        projectId: projectA.id,
        resourceId: resourceA.id,
        skillId: skillPostgres.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        confidenceScore: 0.92,
        sourceLocation: {
          filePath: 'internal/db/postgres.go',
          commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
          lineRange: '25-70',
        },
        excerpt: 'db, err := sql.Open("postgres", connStr)',
        metadata: {
          rawSnippet: 'db, err := sql.Open("postgres", connStr)',
        },
      })
      .returning();

    [evidenceDocker] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        projectId: projectA.id,
        resourceId: resourceA.id,
        skillId: skillDocker.id,
        evidenceType: 'FILE_PATTERN_MATCH',
        sourceProvider: 'GITHUB_APP',
        confidenceScore: 0.9,
        sourceLocation: {
          filePath: 'Dockerfile',
          commitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
          lineRange: '1-18',
        },
        excerpt: 'FROM golang:1.24-alpine AS builder\nCOPY . .',
        metadata: {
          rawSnippet: 'FROM golang:1.24-alpine AS builder\nCOPY . .',
        },
      })
      .returning();

    // 6. Provision Claude OAuth Token for Tenant A (requires 64-hex char suffix and expected resource)
    const expectedResource = oauthService.getExpectedResourceUrl();
    claudeOAuthAccessToken = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHashA = crypto.createHash('sha256').update(claudeOAuthAccessToken).digest('hex');

    await db.insert(oauthTokens).values({
      tenantId: tenantA.id,
      userId: userA.id,
      clientId: 'claude-web',
      accessTokenHash: tokenHashA,
      familyId: crypto.randomUUID(),
      resource: expectedResource,
      tokenScopes: ['career:read', 'career:write'],
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    // 7. Provision Gemini McpRequestContext for Tenant A
    geminiMcpContext = Object.freeze({
      tenantId: tenantA.id,
      userId: userA.id,
      candidateId: candidateA.id,
      role: 'OWNER',
      tokenScopes: ['career:read', 'career:write'],
      authMethod: 'GEMINI_DIRECT_EXECUTOR',
    });

    // 8. Provision Tenant B (for Cross-Tenant Negative Tests)
    const tenantIdB = crypto.randomUUID();
    createdTenantIds.push(tenantIdB);

    [tenantB] = await db
      .insert(tenants)
      .values({
        id: tenantIdB,
        name: `Tenant B Parity ${testRunId}`,
        slug: `tenant-b-parity-${testRunId}`,
        status: 'ACTIVE',
      })
      .returning();

    const userIdB = crypto.randomUUID();
    [userB] = await db
      .insert(users)
      .values({
        id: userIdB,
        tenantId: tenantIdB,
        email: `bob-parity-${testRunId}@example.com`,
        displayName: 'Bob Tenant B',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    const candidateIdB = crypto.randomUUID();
    [candidateB] = await db
      .insert(candidates)
      .values({
        id: candidateIdB,
        tenantId: tenantIdB,
        userId: userIdB,
        displayName: 'Bob Candidate B',
        headline: 'Frontend Engineer',
        canonicalEmail: `bob-parity-${testRunId}@example.com`,
      })
      .returning();

    claudeOAuthAccessTokenB = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;
    const tokenHashB = crypto.createHash('sha256').update(claudeOAuthAccessTokenB).digest('hex');

    await db.insert(oauthTokens).values({
      tenantId: tenantB.id,
      userId: userB.id,
      clientId: 'claude-web',
      accessTokenHash: tokenHashB,
      familyId: crypto.randomUUID(),
      resource: expectedResource,
      tokenScopes: ['career:read'],
      accessTokenExpiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    geminiMcpContextB = Object.freeze({
      tenantId: tenantB.id,
      userId: userB.id,
      candidateId: candidateB.id,
      role: 'OWNER',
      tokenScopes: ['career:read'],
      authMethod: 'GEMINI_DIRECT_EXECUTOR',
    });

    // 9. Build and Initialize Fastify MCP Server
    mcpServer = createCareerMcpServer({ deps: { db } });
    app = await buildApp({
      mcpServer,
      db,
      rateLimiter,
      tokenService,
      oauthService,
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
            try {
              h.unref();
            } catch {
              // Ignore unref failures on teardown
            }
          }
        }
      }
    }
  });

  // ===========================================================================
  // SECTION 1: CORE READ TOOLS PARITY
  // ===========================================================================

  it('1. get_candidate_profile: Claude MCP and Gemini direct dispatch produce identical structured responses', async () => {
    const args = {
      candidateId: candidateA.id,
      includeExperience: true,
      includeProjects: true,
      includeSkillsSummary: true,
    };

    // Path A: Claude-style MCP Streamable HTTP
    const claudeResult = await invokeClaudeMcpTool('get_candidate_profile', args);
    assert.strictEqual(claudeResult.isError, false, 'Claude MCP invocation should succeed');
    assert.strictEqual(claudeResult.statusCode, 200);

    // Path B: Gemini-style direct tool executor
    const geminiResult = await invokeGeminiMcpTool('get_candidate_profile', args);
    assert.strictEqual(geminiResult.isError, false, 'Gemini direct invocation should succeed');

    // Normalize only documented transient fields
    const claudeNormalized = normalizeTransientFields(claudeResult.data);
    const geminiNormalized = normalizeTransientFields(geminiResult.data);

    // Assert Deep Strict Equality
    assert.deepStrictEqual(
      claudeNormalized,
      geminiNormalized,
      'get_candidate_profile structured response must be identical across Claude and Gemini'
    );

    // Explicit domain property assertions
    assert.strictEqual(claudeNormalized.candidate.id, candidateA.id);
    assert.strictEqual(claudeNormalized.candidate.headline, candidateA.headline);
    assert.strictEqual(claudeNormalized.recentExperience?.length, 1);
    assert.strictEqual(claudeNormalized.highlightedProjects?.length, 1);
    assert.strictEqual(claudeNormalized.topSkills?.length, 3);
  });

  it('2. list_verified_skills: Claude MCP and Gemini direct dispatch produce identical verified skill lists', async () => {
    const args = {
      candidateId: candidateA.id,
      page: 1,
      pageSize: 10,
    };

    const claudeResult = await invokeClaudeMcpTool('list_verified_skills', args);
    assert.strictEqual(
      claudeResult.isError,
      false,
      'Claude MCP list_verified_skills should succeed'
    );

    const geminiResult = await invokeGeminiMcpTool('list_verified_skills', args);
    assert.strictEqual(
      geminiResult.isError,
      false,
      'Gemini direct list_verified_skills should succeed'
    );

    const claudeNormalized = normalizeTransientFields(claudeResult.data);
    const geminiNormalized = normalizeTransientFields(geminiResult.data);

    assert.deepStrictEqual(
      claudeNormalized,
      geminiNormalized,
      'list_verified_skills structured response must be identical across Claude and Gemini'
    );

    // Assert skill contents
    const skillSlugs = claudeNormalized.items.map((s) => s.slug);
    assert.deepStrictEqual(skillSlugs.sort(), ['docker', 'go', 'postgresql']);
    assert.strictEqual(claudeNormalized.pagination.totalCount, 3);
  });

  it('3. inspect_project_evidence: Claude MCP and Gemini direct dispatch produce identical evidence nodes', async () => {
    const args = {
      projectId: projectA.id,
      candidateId: candidateA.id,
      page: 1,
      pageSize: 10,
    };

    const claudeResult = await invokeClaudeMcpTool('inspect_project_evidence', args);
    assert.strictEqual(
      claudeResult.isError,
      false,
      'Claude inspect_project_evidence should succeed'
    );

    const geminiResult = await invokeGeminiMcpTool('inspect_project_evidence', args);
    assert.strictEqual(
      geminiResult.isError,
      false,
      'Gemini inspect_project_evidence should succeed'
    );

    const claudeNormalized = normalizeTransientFields(claudeResult.data);
    const geminiNormalized = normalizeTransientFields(geminiResult.data);

    assert.deepStrictEqual(
      claudeNormalized,
      geminiNormalized,
      'inspect_project_evidence structured response must be identical across Claude and Gemini'
    );

    // Assert evidence contents
    assert.strictEqual(claudeNormalized.project.slug, 'cloud-orders-engine');
    assert.strictEqual(claudeNormalized.evidenceItems.length, 3);

    const evidenceIds = claudeNormalized.evidenceItems.map((e) => e.evidenceId);
    assert.ok(evidenceIds.includes(evidenceGo.id));
    assert.ok(evidenceIds.includes(evidencePostgres.id));
    assert.ok(evidenceIds.includes(evidenceDocker.id));
  });

  it('4. analyze_job_fit: Claude MCP and Gemini direct dispatch produce identical ATS scores & requirement matches', async () => {
    const args = {
      candidateId: candidateA.id,
      jobTitle: 'Senior Distributed Systems & Cloud Backend Engineer',
      jobDescriptionText: standardJobDescriptionText,
      maxSkillGaps: 10,
    };

    const claudeResult = await invokeClaudeMcpTool('analyze_job_fit', args);
    assert.strictEqual(claudeResult.isError, false, 'Claude analyze_job_fit should succeed');

    const geminiResult = await invokeGeminiMcpTool('analyze_job_fit', args);
    assert.strictEqual(geminiResult.isError, false, 'Gemini analyze_job_fit should succeed');

    const claudeNormalized = normalizeTransientFields(claudeResult.data);
    const geminiNormalized = normalizeTransientFields(geminiResult.data);

    assert.deepStrictEqual(
      claudeNormalized,
      geminiNormalized,
      'analyze_job_fit structured response must be identical across Claude and Gemini'
    );

    // Assert domain calculations
    assert.strictEqual(
      claudeNormalized.jobContext.extractedTitle,
      'Senior Distributed Systems & Cloud Backend Engineer'
    );
    assert.strictEqual(typeof claudeNormalized.overallFit.atsScore, 'number');
    assert.strictEqual(claudeNormalized.overallFit.atsScore, geminiNormalized.overallFit.atsScore);
    assert.strictEqual(
      claudeNormalized.overallFit.matchGrade,
      geminiNormalized.overallFit.matchGrade
    );

    // Assert requirement breakdown matches
    assert.strictEqual(
      claudeNormalized.requirementSummary.matchedCount,
      geminiNormalized.requirementSummary.matchedCount
    );
    assert.strictEqual(
      claudeNormalized.requirementSummary.missingCount,
      geminiNormalized.requirementSummary.missingCount
    );
  });

  // ===========================================================================
  // SECTION 2: SAFETY GATES & INVERSE AUTHORITY PARITY
  // ===========================================================================

  it('5. Missing-Skill Safety Ceiling Parity: both paths clamp score to <= 24.9 when 3+ required skills are missing', async () => {
    const args = {
      candidateId: candidateA.id,
      jobDescriptionText: missingSkillsJobDescriptionText,
      maxSkillGaps: 10,
    };

    const claudeResult = await invokeClaudeMcpTool('analyze_job_fit', args);
    const geminiResult = await invokeGeminiMcpTool('analyze_job_fit', args);

    const claudeNormalized = normalizeTransientFields(claudeResult.data);
    const geminiNormalized = normalizeTransientFields(geminiResult.data);

    assert.deepStrictEqual(
      claudeNormalized,
      geminiNormalized,
      'Safety ceiling clamping must be identical across Claude and Gemini'
    );

    // Assert safety ceiling enforcement: 4 missing required skills (Kubernetes, Kafka, AWS, GraphQL) -> cap at 24.9
    assert.ok(
      claudeNormalized.overallFit.atsScore <= 24.9,
      `ATS score ${claudeNormalized.overallFit.atsScore} must be capped at 24.9`
    );
    assert.strictEqual(claudeNormalized.overallFit.matchGrade, 'LOW');
    assert.ok(claudeNormalized.requirementSummary.missingCount >= 3);
  });

  it('6. Inverse Authority Invariant: client payload cannot override ATS score, requirement status, or candidate claims', async () => {
    const tamperedArgs = {
      candidateId: candidateA.id,
      jobDescriptionText: standardJobDescriptionText,
      atsScore: 99.9, // Injected spoof score
      matchGrade: 'EXCELLENT', // Injected spoof grade
      matchedCount: 100, // Injected spoof count
      verifiedSkills: ['rust', 'ai-engineering', 'quantum-computing'], // Injected fake skills
    };

    const claudeResult = await invokeClaudeMcpTool('analyze_job_fit', tamperedArgs);
    const geminiResult = await invokeGeminiMcpTool('analyze_job_fit', tamperedArgs);

    // Server-side Zod validation rejects unrecognized extra fields or computes authentic scores
    if (claudeResult.isError || geminiResult.isError) {
      assert.strictEqual(claudeResult.isError, true);
      assert.strictEqual(geminiResult.isError, true);
    } else {
      const claudeNormalized = normalizeTransientFields(claudeResult.data);
      const geminiNormalized = normalizeTransientFields(geminiResult.data);
      assert.notStrictEqual(claudeNormalized.overallFit.atsScore, 99.9);
      assert.notStrictEqual(geminiNormalized.overallFit.atsScore, 99.9);
    }
  });

  // ===========================================================================
  // SECTION 3: MULTI-TENANT ISOLATION & PROMPT POLICY PARITY
  // ===========================================================================

  it('7. Multi-Tenant 404 Isolation Parity: Tenant B context cannot access Tenant A candidate across either path', async () => {
    const crossTenantArgs = {
      candidateId: candidateA.id, // Candidate belonging to Tenant A
    };

    // Path A: Claude using Tenant B OAuth token
    const claudeResult = await invokeClaudeMcpTool(
      'get_candidate_profile',
      crossTenantArgs,
      claudeOAuthAccessTokenB
    );
    assert.strictEqual(claudeResult.isError, true, 'Claude cross-tenant request must fail');

    // Path B: Gemini using Tenant B McpRequestContext
    const geminiResult = await invokeGeminiMcpTool(
      'get_candidate_profile',
      crossTenantArgs,
      geminiMcpContextB
    );
    assert.strictEqual(geminiResult.isError, true, 'Gemini cross-tenant request must fail');

    // Assert both paths fail closed with 404 / NotFoundError semantics
    assert.ok(
      claudeResult.error.message.includes('not found') ||
        claudeResult.error.message.includes('NotFound') ||
        claudeResult.statusCode === 404,
      'Claude must receive 404 / NotFoundError'
    );

    assert.ok(
      geminiResult.error.name === 'NotFoundError' ||
        geminiResult.error.code === 404 ||
        geminiResult.error.message.includes('not found'),
      'Gemini must receive NotFoundError (404)'
    );
  });

  it('8. Prompt Policy Registry Parity: Task policies resolve to identical policy ID and version across providers', () => {
    const promptRegistry = new PromptPolicyRegistry();
    const jobExplanationPolicy = promptRegistry.getPolicy('JOB_EXPLANATION');
    const resumeWordingPolicy = promptRegistry.getPolicy('RESUME_WORDING');
    const coverLetterPolicy = promptRegistry.getPolicy('COVER_LETTER');
    const careerCoachingPolicy = promptRegistry.getPolicy('CAREER_COACHING');

    assert.strictEqual(jobExplanationPolicy.policyId, 'JOB_EXPLANATION');
    assert.strictEqual(jobExplanationPolicy.policyVersion, '1.0.0');

    assert.strictEqual(resumeWordingPolicy.policyId, 'RESUME_WORDING');
    assert.strictEqual(resumeWordingPolicy.policyVersion, '1.0.0');

    assert.strictEqual(coverLetterPolicy.policyId, 'COVER_LETTER');
    assert.strictEqual(coverLetterPolicy.policyVersion, '1.0.0');

    assert.strictEqual(careerCoachingPolicy.policyId, 'CAREER_COACHING');
    assert.strictEqual(careerCoachingPolicy.policyVersion, '1.0.0');

    // Also assert task execution policy registry consistency
    const taskPolicy = defaultTaskPolicyRegistry.getPolicy('JOB_EXPLANATION');
    assert.strictEqual(taskPolicy.taskType, 'JOB_EXPLANATION');
    assert.strictEqual(taskPolicy.costTier, 'LOW');
  });

  it('9. Application Tracking Tools Parity: get_job_application yields identical structured data across Claude and Gemini paths', async () => {
    // 1. Create a job application via Gemini tool path
    const trackRes = await invokeGeminiMcpTool('track_job_application', {
      companyName: 'Stripe',
      jobTitle: 'Staff Backend Architect',
      source: 'COMPANY_CAREERS',
      workplaceType: 'REMOTE',
      employmentType: 'FULL_TIME',
      status: 'SAVED',
    });
    assert.strictEqual(trackRes.isError, false);
    const appId = trackRes.data.application.id;

    // 2. Fetch via Claude HTTP RPC path
    const claudeResult = await invokeClaudeMcpTool('get_job_application', {
      applicationId: appId,
    });
    assert.strictEqual(claudeResult.isError, false, 'Claude get_job_application failed');

    // 3. Fetch via Gemini Direct Tool dispatch path
    const geminiResult = await invokeGeminiMcpTool('get_job_application', {
      applicationId: appId,
    });
    assert.strictEqual(geminiResult.isError, false, 'Gemini get_job_application failed');

    // 4. Assert bit-for-bit structured response parity
    assert.strictEqual(claudeResult.data.application.id, geminiResult.data.application.id);
    assert.strictEqual(
      claudeResult.data.application.companyName,
      geminiResult.data.application.companyName
    );
    assert.strictEqual(
      claudeResult.data.application.jobTitle,
      geminiResult.data.application.jobTitle
    );
    assert.strictEqual(claudeResult.data.application.status, geminiResult.data.application.status);
    assert.strictEqual(claudeResult.data.application.source, geminiResult.data.application.source);
    assert.deepStrictEqual(claudeResult.data.stages, geminiResult.data.stages);
    assert.deepStrictEqual(
      claudeResult.data.tailoredDocuments,
      geminiResult.data.tailoredDocuments
    );
  });
});
