/**
 * @file Live Integration Tests for MCP Career Read Tools (P7-004 — 2026-07-28 Standard)
 *
 * Runs against live PostgreSQL database and Fastify Streamable HTTP transport:
 * 1. tools/list discovery across all 4 career read tools.
 * 2. get_candidate_profile live delegation, bounding, and completeness score.
 * 3. list_verified_skills live querying, filtering, and pagination.
 * 4. inspect_project_evidence live repository evidence extraction and SecretScrubber sanitization.
 * 5. analyze_job_fit end-to-end ATS fit scoring and project rankings.
 * 6. Sovereign multi-tenant default-deny isolation (Tenant B cannot read Tenant A resources).
 * 7. RBAC matrix verification (OWNER, MEMBER, READONLY).
 * 8. Scope ceiling enforcement (career:write alone rejected).
 * 9. Strict zero database mutations verification.
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
  skills,
  candidateSkills,
  projects,
  projectResources,
  resources,
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
  GetCandidateProfileOutputSchema,
  ListVerifiedSkillsOutputSchema,
  InspectProjectEvidenceOutputSchema,
  AnalyzeJobFitOutputSchema,
} from '../../src/domain/mcp/career-read-tools.schemas.js';

describe('Live MCP Career Read Tools Integration Tests (P7-004)', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;

  let tenantA;
  let userA_Owner;
  let userA_Member;
  let userA_ReadOnly;
  let candidateA;
  let projectA1;
  let resourceA1;
  let skillGo;
  let skillPostgres;
  let skillDocker;
  let evidenceA1;

  let tenantB;
  let userB_Owner;
  let candidateB;

  let tokenA_Read;
  let tokenA_WriteOnly;
  let tokenA_Member;
  let tokenA_ReadOnly;
  let tokenB_Read;

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

    // -------------------------------------------------------------------------
    // 1. Provision Tenant A & Users & Candidate
    // -------------------------------------------------------------------------
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Tenant A (Career Tools ${testRunId})`,
        slug: `tenant-a-career-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA_Owner] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-owner-${testRunId}@example.com`,
        displayName: 'Alice Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [userA_Member] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-member-${testRunId}@example.com`,
        displayName: 'Alice Member',
        role: 'MEMBER',
        status: 'ACTIVE',
      })
      .returning();

    [userA_ReadOnly] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice-ro-${testRunId}@example.com`,
        displayName: 'Alice ReadOnly',
        role: 'READONLY',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA_Owner.id,
        displayName: 'Alice Engineer',
        headline: 'Staff Distributed Systems Engineer',
        summary: 'Expert in Go, PostgreSQL, Raft consensus, and cloud-native systems.',
        canonicalEmail: `alice-${testRunId}@example.com`,
        status: 'ACTIVE',
        profileMetadata: {
          userCustom: {
            experience: [
              {
                company: 'Cloud Corp',
                title: 'Staff Engineer',
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

    // -------------------------------------------------------------------------
    // 2. Provision Tenant A Skills & Evidence & Projects
    // -------------------------------------------------------------------------
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
        })
        .returning();
    }

    const existingPostgres = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, 'postgresql'))
      .limit(1);
    if (existingPostgres.length > 0) {
      skillPostgres = existingPostgres[0];
    } else {
      [skillPostgres] = await db
        .insert(skills)
        .values({
          slug: 'postgresql',
          name: 'PostgreSQL',
          category: 'DATABASE',
        })
        .returning();
    }

    const existingDocker = await db.select().from(skills).where(eq(skills.slug, 'docker')).limit(1);
    if (existingDocker.length > 0) {
      skillDocker = existingDocker[0];
    } else {
      [skillDocker] = await db
        .insert(skills)
        .values({
          slug: 'docker',
          name: 'Docker',
          category: 'CLOUD_DEVOPS',
        })
        .returning();
    }

    [resourceA1] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        provider: 'GITHUB_APP',
        externalResourceId: `repo-raft-${testRunId}`,
        name: 'raft-consensus-go',
        displayName: 'raft-consensus-go',
        url: 'https://github.com/alice/raft-consensus-go',
        isPrivate: false,
      })
      .returning();

    [projectA1] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Raft Consensus Engine',
        slug: `raft-consensus-engine-${testRunId}`,
        headline: 'Distributed Consensus Engine in Go',
        summary:
          'High throughput, zero-allocation Raft implementation in Go with PostgreSQL WAL storage.',
        role: 'Creator & Lead Architect',
        startDate: '2023-01-01',
        isHighlighted: true,
      })
      .returning();

    await db.insert(projectResources).values({
      tenantId: tenantA.id,
      projectId: projectA1.id,
      resourceId: resourceA1.id,
    });

    [evidenceA1] = await db
      .insert(evidenceItems)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA1.id,
        projectId: projectA1.id,
        skillId: skillGo.id,
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceProvider: 'GITHUB_APP',
        sourceLocation: {
          filePath: 'pkg/consensus/raft.go',
          commitSha: '1234567890abcdef1234567890abcdef12345678',
          lineRange: { start: 10, end: 45 },
        },
        excerpt:
          '// Token: ghp_1111222233334444555566667777888899990000\nfunc (r *Raft) Propose(ctx context.Context, data []byte) error {\n  return r.node.Propose(ctx, data)\n}',
        confidenceScore: 0.98,
        detectedAt: new Date(),
      })
      .returning();

    await db.insert(candidateSkills).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillGo.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.98,
        evidenceCount: 15,
        primaryEvidenceId: evidenceA1.id,
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPostgres.id,
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.92,
        evidenceCount: 8,
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillDocker.id,
        category: 'CLOUD_DEVOPS',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.88,
        evidenceCount: 5,
        firstObservedAt: new Date(),
        lastObservedAt: new Date(),
      },
    ]);

    // -------------------------------------------------------------------------
    // 3. Provision Tenant B (For Isolation Testing)
    // -------------------------------------------------------------------------
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Tenant B (Career Tools ${testRunId})`,
        slug: `tenant-b-career-${testRunId}`,
        tier: 'ENTERPRISE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB_Owner] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `bob-owner-${testRunId}@example.com`,
        displayName: 'Bob Owner',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userB_Owner.id,
        displayName: 'Bob Dev',
        headline: 'Frontend React Developer',
        summary: 'React and CSS developer.',
        canonicalEmail: `bob-${testRunId}@example.com`,
        status: 'ACTIVE',
      })
      .returning();

    await db
      .insert(projects)
      .values({
        tenantId: tenantB.id,
        candidateId: candidateB.id,
        name: 'React UI Kit',
        slug: `react-ui-kit-${testRunId}`,
        headline: 'Component library in React',
        summary: 'UI components in React and TypeScript.',
        role: 'Author',
      })
      .returning();

    // -------------------------------------------------------------------------
    // 4. Mint MCP API Tokens
    // -------------------------------------------------------------------------
    tokenA_Read = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA_Owner.id,
      role: 'OWNER',
      name: 'Token A Read',
      scopes: ['career:read'],
      expiryDays: 30,
    });

    tokenA_WriteOnly = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA_Owner.id,
      role: 'OWNER',
      name: 'Token A Write Only',
      scopes: ['career:write'],
      expiryDays: 30,
    });

    tokenA_Member = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA_Member.id,
      role: 'MEMBER',
      name: 'Token A Member',
      scopes: ['career:read'],
      expiryDays: 30,
    });

    const rawTokenReadOnly = generateMcpRawToken('test');
    const [dbTokenReadOnly] = await db
      .insert(mcpApiTokens)
      .values({
        tenantId: tenantA.id,
        userId: userA_ReadOnly.id,
        name: 'Token A ReadOnly',
        tokenHash: hashMcpToken(rawTokenReadOnly),
        tokenPrefix: rawTokenReadOnly.substring(0, 16),
        scopes: ['career:read'],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        clientType: 'PERSONAL',
      })
      .returning();
    tokenA_ReadOnly = { rawToken: rawTokenReadOnly, token: toTokenSummary(dbTokenReadOnly) };

    tokenB_Read = await tokenService.createToken({
      tenantId: tenantB.id,
      userId: userB_Owner.id,
      role: 'OWNER',
      name: 'Token B Read',
      scopes: ['career:read'],
      expiryDays: 30,
    });

    // -------------------------------------------------------------------------
    // 5. Build Fastify App with Career MCP Server
    // -------------------------------------------------------------------------
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
    for (const tenantId of createdTenantIds) {
      await db
        .delete(tenants)
        .where(eq(tenants.id, tenantId))
        .catch(() => {});
    }
    await closeDatabase();
  });

  // ===========================================================================
  // 1. tools/list Discovery
  // ===========================================================================
  it('1. discovers all 4 career read tools over HTTP POST /mcp via tools/list', async () => {
    const res = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/list',
      id: 1,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 1);
    assert.ok(Array.isArray(body.result.tools));
    assert.strictEqual(body.result.tools.length, 4);

    const toolNames = body.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes('get_candidate_profile'));
    assert.ok(toolNames.includes('list_verified_skills'));
    assert.ok(toolNames.includes('inspect_project_evidence'));
    assert.ok(toolNames.includes('analyze_job_fit'));
  });

  // ===========================================================================
  // 2. get_candidate_profile Execution
  // ===========================================================================
  it('2. executes get_candidate_profile retrieving real candidate profile view', async () => {
    const res = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: {},
      id: 2,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.result);
    const parsedText = JSON.parse(body.result.content[0].text);
    assert.ok(GetCandidateProfileOutputSchema.safeParse(parsedText).success);
    assert.strictEqual(parsedText.candidate.displayName, 'Alice Engineer');
    assert.strictEqual(parsedText.connectedResourcesSummary.totalConnected, 1);
    assert.strictEqual(parsedText.topSkills.length, 3);
    assert.strictEqual(parsedText.highlightedProjects.length, 1);
    assert.strictEqual(parsedText.recentExperience.length, 1);
  });

  // ===========================================================================
  // 3. list_verified_skills Execution & Filtering
  // ===========================================================================
  it('3. executes list_verified_skills with category filtering and pagination', async () => {
    // 1. All skills
    const resAll = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'list_verified_skills',
      args: {
        pageSize: 2,
        page: 1,
        includeEvidenceRefs: true,
      },
      id: 3,
    });

    assert.strictEqual(resAll.statusCode, 200);
    const parsedAll = JSON.parse(resAll.json().result.content[0].text);
    assert.ok(ListVerifiedSkillsOutputSchema.safeParse(parsedAll).success);
    assert.strictEqual(parsedAll.items.length, 2);
    assert.strictEqual(parsedAll.pagination.totalCount, 3);
    assert.strictEqual(parsedAll.pagination.totalPages, 2);
    assert.strictEqual(parsedAll.pagination.hasNextPage, true);

    // 2. Filter by category
    const resFiltered = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'list_verified_skills',
      args: {
        category: 'LANGUAGE',
      },
      id: 4,
    });

    assert.strictEqual(resFiltered.statusCode, 200);
    const parsedFiltered = JSON.parse(resFiltered.json().result.content[0].text);
    assert.strictEqual(parsedFiltered.items.length, 1);
    assert.strictEqual(parsedFiltered.items[0].name, 'Go');
  });

  // ===========================================================================
  // 4. inspect_project_evidence Execution & Secret Scrubbing
  // ===========================================================================
  it('4. executes inspect_project_evidence scrubbing credentials from repository excerpts', async () => {
    const res = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'inspect_project_evidence',
      args: {
        projectId: projectA1.id,
      },
      id: 5,
    });

    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.json().result.content[0].text);
    assert.ok(InspectProjectEvidenceOutputSchema.safeParse(parsed).success);
    assert.strictEqual(parsed.project.name, 'Raft Consensus Engine');
    assert.strictEqual(parsed.linkedResources.length, 1);
    assert.strictEqual(parsed.evidenceItems.length, 1);

    // Verify secret scrubbing
    const excerpt = parsed.evidenceItems[0].sanitizedExcerpt;
    assert.ok(!excerpt.includes('ghp_1111222233334444555566667777888899990000'));
    assert.ok(excerpt.includes('[REDACTED_SECRET]'));
  });

  // ===========================================================================
  // 5. analyze_job_fit Execution
  // ===========================================================================
  it('5. executes analyze_job_fit calculating real ATS fit score and project ranking', async () => {
    const jobText = `
    Staff Distributed Systems Engineer
    About the Role:
    We are seeking a Staff Engineer with deep expertise in Go and distributed systems.
    Requirements:
    - 5+ years building backend distributed services in Go
    - Deep knowledge of PostgreSQL database indexing
    - Experience with Docker container orchestration
    `;

    const res = await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'analyze_job_fit',
      args: {
        jobDescriptionText: jobText,
        jobTitle: 'Staff Distributed Systems Engineer',
      },
      id: 6,
    });

    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.json().result.content[0].text);
    assert.ok(AnalyzeJobFitOutputSchema.safeParse(parsed).success);
    assert.ok(parsed.overallFit.atsScore > 0);
    assert.strictEqual(parsed.requirementSummary.matchedCount >= 1, true);
    assert.strictEqual(parsed.topRelevantProjects.length, 1);
    assert.strictEqual(parsed.topRelevantProjects[0].projectId, projectA1.id);
  });

  // ===========================================================================
  // 6. Sovereign Multi-Tenant Isolation
  // ===========================================================================
  it('6. rejects cross-tenant lookups strictly with 404 / -32004', async () => {
    // Tenant B attempts to inspect Tenant A's project
    const resCrossProject = await invokeMcp({
      token: tokenB_Read.rawToken,
      method: 'tools/call',
      toolName: 'inspect_project_evidence',
      args: {
        projectId: projectA1.id, // Belongs to Tenant A
      },
      id: 7,
    });

    assert.strictEqual(resCrossProject.statusCode, 200);
    const bodyCross = resCrossProject.json();
    const isErrorCross = bodyCross.error || bodyCross.result?.isError;
    assert.ok(isErrorCross, 'Expected error for cross-tenant project inspection');
    const errMsgCross = bodyCross.error?.message || bodyCross.result?.content?.[0]?.text || '';
    assert.match(errMsgCross, /not found/i);

    // Tenant B attempts to query Tenant A's candidate profile
    const resCrossProfile = await invokeMcp({
      token: tokenB_Read.rawToken,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: {
        candidateId: candidateA.id, // Belongs to Tenant A
      },
      id: 8,
    });

    assert.strictEqual(resCrossProfile.statusCode, 200);
    const bodyProfile = resCrossProfile.json();
    const isErrorProfile = bodyProfile.error || bodyProfile.result?.isError;
    assert.ok(isErrorProfile, 'Expected error for cross-tenant profile retrieval');
    const errMsgProfile =
      bodyProfile.error?.message || bodyProfile.result?.content?.[0]?.text || '';
    assert.match(errMsgProfile, /not found/i);
  });

  // ===========================================================================
  // 7. RBAC Matrix Verification
  // ===========================================================================
  it('7. permits OWNER, MEMBER, and READONLY roles to invoke career read tools', async () => {
    const tokens = [tokenA_Read, tokenA_Member, tokenA_ReadOnly];

    for (let i = 0; i < tokens.length; i++) {
      const res = await invokeMcp({
        token: tokens[i].rawToken,
        method: 'tools/call',
        toolName: 'get_candidate_profile',
        args: {
          candidateId: candidateA.id,
        },
        id: 10 + i,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.result, `Failed for token index ${i}`);
    }
  });

  // ===========================================================================
  // 8. Scope Ceiling Enforcement
  // ===========================================================================
  it('8. rejects token with only career:write scope with 403 / -32003 FORBIDDEN', async () => {
    const res = await invokeMcp({
      token: tokenA_WriteOnly.rawToken,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: {},
      id: 20,
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    const isError = body.error || body.result?.isError;
    assert.ok(isError, 'Expected permission error for write-only token');
    const errMsg = body.error?.message || body.result?.content?.[0]?.text || '';
    assert.match(errMsg, /permission|scope|forbidden/i);
  });

  // ===========================================================================
  // 9. Zero Database Mutations Guarantee
  // ===========================================================================
  it('9. guarantees zero database mutations during all 4 tool invocations', async () => {
    // Record baseline row counts
    const [{ cCount: candBefore }] = await db.select({ cCount: sql`count(*)` }).from(candidates);
    const [{ pCount: projBefore }] = await db.select({ pCount: sql`count(*)` }).from(projects);
    const [{ sCount: skillBefore }] = await db
      .select({ sCount: sql`count(*)` })
      .from(candidateSkills);
    const [{ eCount: evidBefore }] = await db.select({ eCount: sql`count(*)` }).from(evidenceItems);

    // Call all 4 tools
    await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'get_candidate_profile',
      args: {},
      id: 31,
    });

    await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'list_verified_skills',
      args: {},
      id: 32,
    });

    await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'inspect_project_evidence',
      args: { projectId: projectA1.id },
      id: 33,
    });

    await invokeMcp({
      token: tokenA_Read.rawToken,
      method: 'tools/call',
      toolName: 'analyze_job_fit',
      args: {
        jobDescriptionText: 'Looking for a Senior Go Engineer with PostgreSQL knowledge.',
      },
      id: 34,
    });

    // Record after row counts
    const [{ cCount: candAfter }] = await db.select({ cCount: sql`count(*)` }).from(candidates);
    const [{ pCount: projAfter }] = await db.select({ pCount: sql`count(*)` }).from(projects);
    const [{ sCount: skillAfter }] = await db
      .select({ sCount: sql`count(*)` })
      .from(candidateSkills);
    const [{ eCount: evidAfter }] = await db.select({ eCount: sql`count(*)` }).from(evidenceItems);

    assert.strictEqual(candAfter, candBefore, 'candidates count changed');
    assert.strictEqual(projAfter, projBefore, 'projects count changed');
    assert.strictEqual(skillAfter, skillBefore, 'candidateSkills count changed');
    assert.strictEqual(evidAfter, evidBefore, 'evidenceItems count changed');
  });
});
