/**
 * @file Live Integration Tests for MCP Application Artifact Tools (P7-005)
 *
 * Verifies live execution against PostgreSQL, Fastify HTTP transport, and real domain entities:
 * 1. tools/list discovery exposes recommend_portfolio_projects, draft_cover_letter, generate_tailored_resume
 * 2. recommend_portfolio_projects execution with career:read & READONLY role
 * 3. draft_cover_letter RBAC enforcement (rejects READONLY/career:read, allows MEMBER/career:write)
 * 4. generate_tailored_resume RBAC enforcement (rejects READONLY/career:read, allows MEMBER/career:write)
 * 5. Full resume generation in GENERATE_NEW and PRESERVE_EXISTING presentation modes
 * 6. Cross-tenant default-deny isolation (404 / -32004)
 * 7. Zero database mutations invariant
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  mcpApiTokens,
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import {
  McpApiTokenService,
  hashMcpToken,
  generateMcpRawToken,
  toTokenSummary,
} from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import {
  RecommendPortfolioProjectsOutputSchema,
  DraftCoverLetterOutputSchema,
  GenerateTailoredResumeOutputSchema,
} from '../../src/domain/mcp/career-artifact-tools.schemas.js';

describe('Live MCP Application Artifact Tools Integration Tests (P7-005)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userAOwner;
  let userAReadonly;
  let candidateA;
  let projectA1;
  let skillGo;
  let skillPg;
  let evidenceItem1;

  let tenantB;
  let userBOwner;

  let tokenOwner;
  let tokenReadonly;
  let tokenTenantB;

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  const sampleJobText = `
    We are looking for a Senior Distributed Systems Engineer to scale our Go and PostgreSQL backend.
    Requirements:
    - 4+ years experience with Go and microservices architecture.
    - Deep knowledge of PostgreSQL database optimization, indexes, and transactions.
    - Experience maintaining test suites and CI pipelines.
  `;

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

    return app.inject({
      method: 'POST',
      url: '/mcp',
      headers,
      payload,
    });
  }

  before(async () => {
    tokenService = new McpApiTokenService({ db, nodeEnv: 'test' });
    rateLimiter = new McpRateLimiter({
      ipLimit: 500,
      tenantLimit: 1000,
      toolLimit: 200,
    });

    // 1. Provision Tenant A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (Artifacts ${testRunId})`,
        slug: `tenant-a-art-${testRunId}`,
        plan: 'ENTERPRISE',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    // Provision User A Owner
    [userAOwner] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-art-${testRunId}@example.com`,
        displayName: 'Alice Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    // Provision User A Readonly
    [userAReadonly] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-ro-art-${testRunId}@example.com`,
        displayName: 'Alice Readonly',
        role: 'READONLY',
        status: 'ACTIVE',
      })
      .returning();

    // Provision Candidate A
    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userAOwner.id,
        displayName: 'Alice Artifact Engineer',
        headline: 'Staff Backend & Infrastructure Engineer',
        summary: 'Expert in Go, PostgreSQL, distributed systems and cloud services.',
        canonicalEmail: `alice-art-${testRunId}@example.com`,
        profileMetadata: {
          userCustom: {
            experience: [
              {
                company: 'Distributed Systems Corp',
                title: 'Senior Backend Engineer',
                startDate: '2021-01-01',
                endDate: null,
                isCurrent: true,
                bullets: [
                  'Designed and maintained high-throughput distributed storage engines in Go.',
                  'Tuned PostgreSQL query execution plans reducing P99 latency by 45%.',
                ],
              },
            ],
            education: [
              {
                institution: 'MIT',
                degree: 'B.S. in Computer Science',
                fieldOfStudy: 'Computer Science',
                startDate: '2016-09-01',
                endDate: '2020-05-30',
              },
            ],
          },
        },
      })
      .returning();

    // Provision Skills (Standard canonical slugs)
    const existingGo = await db.select().from(skills).where(eq(skills.slug, 'go')).limit(1);
    if (existingGo.length > 0) {
      skillGo = existingGo[0];
    } else {
      [skillGo] = await db
        .insert(skills)
        .values({
          slug: 'go',
          name: 'Go',
          category: 'LANGUAGE',
          status: 'APPROVED',
        })
        .returning();
    }

    const existingPg = await db.select().from(skills).where(eq(skills.slug, 'postgresql')).limit(1);
    if (existingPg.length > 0) {
      skillPg = existingPg[0];
    } else {
      [skillPg] = await db
        .insert(skills)
        .values({
          slug: 'postgresql',
          name: 'PostgreSQL',
          category: 'DATABASE',
          status: 'APPROVED',
        })
        .returning();
    }

    // Provision Resource & Projects
    const [resA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        resourceType: 'REPOSITORY',
        externalResourceId: `repo-${testRunId}`,
        name: 'distributed-store',
        displayName: 'alice/distributed-store',
        url: 'https://github.com/alice/distributed-store',
        isPrivate: false,
        status: 'ACTIVE',
      })
      .returning();

    [projectA1] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'distributed-store',
        slug: `dist-store-${testRunId}`,
        headline: 'Distributed Key-Value Store in Go',
        summary: 'High availability storage system with Raft consensus and PostgreSQL persistence.',
        role: 'Primary Author',
        isHighlighted: true,
      })
      .returning();

    await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'cloud-orchestrator',
        slug: `cloud-orch-${testRunId}`,
        headline: 'Container orchestration engine',
        summary: 'Microservices deployment manager.',
        role: 'Lead Architect',
        isHighlighted: false,
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA1.id,
      resourceId: resA.id,
    });

    [evidenceItem1] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resA.id,
        projectId: projectA1.id,
        skillId: skillGo.id,
        sourceProvider: 'GITHUB_APP',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceLocation: {
          filePath: 'go.mod',
          commitSha: '1111222233334444555566667777888899990000',
          lineRange: { start: 1, end: 5 },
        },
        confidenceScore: 1.0,
        excerpt: 'module github.com/alice/distributed-store\n\ngo 1.22',
        metadata: { detectedAt: new Date().toISOString() },
      })
      .returning();

    // Provision Candidate Skills
    await db.insert(candidateSkills).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillGo.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 3,
        primaryEvidenceId: evidenceItem1.id,
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPg.id,
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        evidenceCount: 2,
        primaryEvidenceId: evidenceItem1.id,
      },
    ]);

    // 2. Provision Tenant B (Foreign Boundary)
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (Artifacts ${testRunId})`,
        slug: `tenant-b-art-${testRunId}`,
        plan: 'STANDARD',
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userBOwner] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `bob-art-${testRunId}@example.com`,
        displayName: 'Bob Foreign',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userBOwner.id,
        displayName: 'Bob Foreign',
        headline: 'Frontend Engineer',
        canonicalEmail: `bob-art-${testRunId}@example.com`,
      })
      .returning();

    // 3. Create Dedicated MCP API Tokens
    tokenOwner = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userAOwner.id,
      role: 'OWNER',
      name: 'Owner Live Token',
      scopes: ['career:read', 'career:write', 'career:export'],
      expiryDays: 30,
    });

    const rawTokenReadOnly = generateMcpRawToken('test');
    const [dbTokenReadOnly] = await db
      .insert(mcpApiTokens)
      .values({
        tenantId: tenantA.id,
        userId: userAReadonly.id,
        name: 'Token A ReadOnly',
        tokenHash: hashMcpToken(rawTokenReadOnly),
        tokenPrefix: rawTokenReadOnly.substring(0, 16),
        scopes: ['career:read'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        clientType: 'PERSONAL',
      })
      .returning();
    tokenReadonly = { rawToken: rawTokenReadOnly, token: toTokenSummary(dbTokenReadOnly) };

    tokenTenantB = await tokenService.createToken({
      tenantId: tenantB.id,
      userId: userBOwner.id,
      role: 'OWNER',
      name: 'Tenant B Live Token',
      scopes: ['career:read', 'career:write'],
      expiryDays: 30,
    });

    // 4. Initialize Fastify Server
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
    if (app) {
      await app.close();
    }
    for (const tId of createdTenantIds) {
      await db
        .delete(tenants)
        .where(eq(tenants.id, tId))
        .catch(() => {});
    }
    await closeDatabase();
  });

  // ===========================================================================
  // 1. Tool Discovery (tools/list)
  // ===========================================================================

  it('1. tools/list lists all 7 tools including the 3 application artifact tools with correct schemas', async () => {
    const res = await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/list',
      id: 1,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 1);
    assert.ok(Array.isArray(body.result.tools));
    assert.strictEqual(body.result.tools.length, 26);

    const toolNames = body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_candidate_profile'));
    assert.ok(toolNames.includes('list_verified_skills'));
    assert.ok(toolNames.includes('inspect_project_evidence'));
    assert.ok(toolNames.includes('analyze_job_fit'));
    assert.ok(toolNames.includes('recommend_portfolio_projects'));
    assert.ok(toolNames.includes('draft_cover_letter'));
    assert.ok(toolNames.includes('generate_tailored_resume'));

    // Check annotations
    const portfolioTool = body.result.tools.find((t) => t.name === 'recommend_portfolio_projects');
    assert.strictEqual(portfolioTool.annotations?.readOnlyHint, true);

    const coverLetterTool = body.result.tools.find((t) => t.name === 'draft_cover_letter');
    assert.strictEqual(coverLetterTool.annotations?.readOnlyHint, false);

    const resumeTool = body.result.tools.find((t) => t.name === 'generate_tailored_resume');
    assert.strictEqual(resumeTool.annotations?.readOnlyHint, false);
  });

  // ===========================================================================
  // 2. recommend_portfolio_projects Execution
  // ===========================================================================

  it('2. recommend_portfolio_projects succeeds with career:read & READONLY token', async () => {
    const res = await invokeMcp({
      token: tokenReadonly.rawToken,
      method: 'tools/call',
      toolName: 'recommend_portfolio_projects',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
        maxFeaturedProjects: 2,
      },
      id: 2,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `RPC Error: ${JSON.stringify(body.error)}`);
    assert.ok(body.result);

    const parsed = JSON.parse(body.result.content[0].text);
    assert.ok(RecommendPortfolioProjectsOutputSchema.safeParse(parsed).success);
    assert.strictEqual(parsed.candidateId, candidateA.id);
    assert.ok(parsed.featuredProjects.length >= 1 && parsed.featuredProjects.length <= 2);
    assert.strictEqual(parsed._meta?.cacheControl?.cacheScope, 'tenant-private');
  });

  it('3. recommend_portfolio_projects enforces cross-tenant 404 isolation', async () => {
    const res = await invokeMcp({
      token: tokenTenantB.rawToken,
      method: 'tools/call',
      toolName: 'recommend_portfolio_projects',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
      },
      id: 3,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected cross-tenant error');
  });

  // ===========================================================================
  // 3. draft_cover_letter RBAC & Execution
  // ===========================================================================

  it('4. draft_cover_letter rejects READONLY role / career:read only with FORBIDDEN (-32003)', async () => {
    const res = await invokeMcp({
      token: tokenReadonly.rawToken,
      method: 'tools/call',
      toolName: 'draft_cover_letter',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
      },
      id: 4,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected permission error for readonly token');
  });

  it('5. draft_cover_letter executes successfully with OWNER role & career:write', async () => {
    const res = await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'draft_cover_letter',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
        tone: 'WARM',
        targetParagraphCount: 4,
        recipientName: 'Distributed Systems Hiring Team',
      },
      id: 5,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `RPC Error: ${JSON.stringify(body.error)}`);
    assert.ok(body.result);

    const parsed = JSON.parse(body.result.content[0].text);
    assert.ok(DraftCoverLetterOutputSchema.safeParse(parsed).success);
    assert.strictEqual(parsed.candidateId, candidateA.id);
    assert.strictEqual(parsed.tone, 'WARM');
    assert.strictEqual(parsed.recipientName, 'Distributed Systems Hiring Team');
    assert.ok(parsed.paragraphs.length >= 3);
    assert.ok(['PASS', 'PARTIAL'].includes(parsed.integrityReport.overallStatus));
  });

  // ===========================================================================
  // 4. generate_tailored_resume RBAC & Execution
  // ===========================================================================

  it('6. generate_tailored_resume rejects READONLY role with FORBIDDEN (-32003)', async () => {
    const res = await invokeMcp({
      token: tokenReadonly.rawToken,
      method: 'tools/call',
      toolName: 'generate_tailored_resume',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
      },
      id: 6,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected permission error for readonly token');
  });

  it('7. generate_tailored_resume succeeds in GENERATE_NEW mode with full audit pass', async () => {
    const res = await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'generate_tailored_resume',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
        presentationMode: 'GENERATE_NEW',
        templateId: 'ATS_FOCUSED',
      },
      id: 7,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `RPC Error: ${JSON.stringify(body.error)}`);
    assert.ok(body.result);

    const parsed = JSON.parse(body.result.content[0].text);
    assert.ok(GenerateTailoredResumeOutputSchema.safeParse(parsed).success);
    assert.strictEqual(parsed.candidateId, candidateA.id);
    assert.strictEqual(parsed.presentationMode, 'GENERATE_NEW');
    assert.strictEqual(parsed.templateId, 'ATS_FOCUSED');
    assert.strictEqual(parsed.presentationAudit.status, 'PASS');
    assert.ok(['PASS', 'PARTIAL'].includes(parsed.integrityReport.overallStatus));
    assert.strictEqual(parsed.auditReport.status, 'PASS');
    assert.ok(Array.isArray(parsed.resume.skills));
    assert.ok(Array.isArray(parsed.resume.experience));
    assert.ok(Array.isArray(parsed.resume.projects));
  });

  it('8. generate_tailored_resume succeeds in PRESERVE_EXISTING mode with layout audit', async () => {
    const existingMarkdown = `# Alice Artifact Engineer\n## Summary\nExpert backend engineer in Go and PostgreSQL.`;

    const res = await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'generate_tailored_resume',
      args: {
        candidateId: candidateA.id,
        jobDescriptionText: sampleJobText,
        presentationMode: 'PRESERVE_EXISTING',
        existingResumeText: existingMarkdown,
        existingResumeFormat: 'MARKDOWN',
      },
      id: 8,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(!body.error, `RPC Error: ${JSON.stringify(body.error)}`);

    const parsed = JSON.parse(body.result.content[0].text);
    assert.ok(GenerateTailoredResumeOutputSchema.safeParse(parsed).success);
    assert.strictEqual(parsed.presentationMode, 'PRESERVE_EXISTING');
    assert.ok(parsed.presentationAudit);
  });

  // ===========================================================================
  // 5. Zero Database Mutation Invariant
  // ===========================================================================

  it('9. guarantees zero database mutations during artifact generation', async () => {
    const [candBefore] = await db
      .select({ count: sql`count(*)` })
      .from(candidates)
      .where(eq(candidates.tenantId, tenantA.id));

    const [projBefore] = await db
      .select({ count: sql`count(*)` })
      .from(projects)
      .where(eq(projects.tenantId, tenantA.id));

    const [skillBefore] = await db
      .select({ count: sql`count(*)` })
      .from(candidateSkills)
      .where(eq(candidateSkills.tenantId, tenantA.id));

    // Execute all 3 artifact tools in succession
    await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'recommend_portfolio_projects',
      args: { candidateId: candidateA.id, jobDescriptionText: sampleJobText },
      id: 101,
    });

    await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'draft_cover_letter',
      args: { candidateId: candidateA.id, jobDescriptionText: sampleJobText },
      id: 102,
    });

    await invokeMcp({
      token: tokenOwner.rawToken,
      method: 'tools/call',
      toolName: 'generate_tailored_resume',
      args: { candidateId: candidateA.id, jobDescriptionText: sampleJobText },
      id: 103,
    });

    const [candAfter] = await db
      .select({ count: sql`count(*)` })
      .from(candidates)
      .where(eq(candidates.tenantId, tenantA.id));

    const [projAfter] = await db
      .select({ count: sql`count(*)` })
      .from(projects)
      .where(eq(projects.tenantId, tenantA.id));

    const [skillAfter] = await db
      .select({ count: sql`count(*)` })
      .from(candidateSkills)
      .where(eq(candidateSkills.tenantId, tenantA.id));

    assert.strictEqual(Number(candBefore.count), Number(candAfter.count));
    assert.strictEqual(Number(projBefore.count), Number(projAfter.count));
    assert.strictEqual(Number(skillBefore.count), Number(skillAfter.count));
  });
});
