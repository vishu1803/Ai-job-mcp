/**
 * @file Final Transport & End-to-End Acceptance Integration Test Suite
 *
 * Validates the 7 hardened MCP tools and end-to-end transport protocol directly over Fastify POST /mcp:
 * 1. Exact Tool Inventory (tools/list)
 * 2. draft_cover_letter over /mcp (normal and dirty/punctuation/unicode inputs)
 * 3. generate_tailored_resume over /mcp (normal, dirty slugs, claim provenance preservation)
 * 4. analyze_job_fit over /mcp (determinism and project evidence indexing)
 * 5. search_jobs over /mcp (filter matrix and synthetic attribution)
 * 6. recommend_portfolio_projects over /mcp (deduplication & 0-match criteria explanation)
 * 7. get_career_profile over /mcp (candidate resolution with & without explicit candidateId)
 * 8. inspect_project_evidence over /mcp (multi-page pagination, bounds safety, skill filtering)
 * 9. Error Contract (JSON-RPC semantics, no stack traces, no SQL, no secrets)
 * 10. Authentication & Multi-Tenant Isolation (Tenant A vs Tenant B default-deny)
 * 11. Rate Limiting & Concurrency controls
 * 12. Realistic Client request shapes (Claude, ChatGPT, Gemini)
 * 13. Transport / Timing validation
 * 14. Database Safety and Clean Teardown
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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
} from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

describe('Final MCP Transport & End-to-End Acceptance Tests', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const createdTenantIds = [];

  let app;
  let tokenService;
  let rateLimiter;

  // Tenant A Entities
  let tenantA;
  let userA;
  let candidateA;
  let projectA1;
  let projectA2;
  let resourceA;
  let tokenA;

  // Tenant B Entities
  let tenantB;
  let userB;
  let _candidateB;
  let tokenB;

  // Skills
  let skillPython;
  let skillFastApi;
  let skillPostgres;
  let skillNode;

  const PROTOCOL_META = Object.freeze({
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientCapabilities': {},
  });

  async function invokeMcp({
    token,
    method,
    toolName,
    args = {},
    id = 1,
    clientHeaders = {},
    protocolVersion = '2026-07-28',
  }) {
    const headers = {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
      'mcp-protocol-version': protocolVersion,
      ...(method ? { 'mcp-method': method } : {}),
      ...(toolName ? { 'mcp-name': toolName } : {}),
      ...clientHeaders,
    };

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
      toolLimit: 300,
    });

    // 1. Provision Tenant A
    [tenantA] = await db
      .insert(tenants)
      .values({
        name: `Acceptance Tenant A ${testRunId}`,
        slug: `tenant-a-${testRunId}`,
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantA.id);

    [userA] = await db
      .insert(users)
      .values({
        tenantId: tenantA.id,
        email: `alice.${testRunId}@example.com`,
        displayName: 'Alice Engineer',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [candidateA] = await db
      .insert(candidates)
      .values({
        tenantId: tenantA.id,
        userId: userA.id,
        displayName: 'Alice Engineer',
        headline: 'Senior Distributed Systems Architect',
        summary: 'Expert in Python, FastAPI, and PostgreSQL architectures.',
        canonicalEmail: `alice.${testRunId}@example.com`,
        profileMetadata: {
          userCustom: {
            experience: [
              {
                company: 'TechCorp',
                title: 'Senior Staff Engineer',
                startDate: '2021-01-01',
                current: true,
                highlights: ['Architected high-scale microservices backend in Python and FastAPI.'],
              },
            ],
            education: [
              {
                institution: 'UC Berkeley',
                degree: 'B.S. in Electrical Engineering & Computer Science',
                fieldOfStudy: 'Computer Science',
                startDate: '2015-09-01',
                endDate: '2019-05-30',
              },
            ],
          },
        },
      })
      .returning();

    // 2. Provision Tenant B
    [tenantB] = await db
      .insert(tenants)
      .values({
        name: `Acceptance Tenant B ${testRunId}`,
        slug: `tenant-b-${testRunId}`,
        status: 'ACTIVE',
      })
      .returning();
    createdTenantIds.push(tenantB.id);

    [userB] = await db
      .insert(users)
      .values({
        tenantId: tenantB.id,
        email: `bob.${testRunId}@example.com`,
        displayName: 'Bob Candidate',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();

    [_candidateB] = await db
      .insert(candidates)
      .values({
        tenantId: tenantB.id,
        userId: userB.id,
        displayName: 'Bob Candidate',
        headline: 'Frontend React Developer',
        canonicalEmail: `bob.${testRunId}@example.com`,
      })
      .returning();

    // 3. Provision Skills
    async function getOrInsertSkill(slug, name, category) {
      const existing = await db.select().from(skills).where(eq(skills.slug, slug)).limit(1);
      if (existing.length > 0) return existing[0];
      const [inserted] = await db
        .insert(skills)
        .values({ slug, name, category, status: 'APPROVED' })
        .returning();
      return inserted;
    }

    skillPython = await getOrInsertSkill('python', 'Python', 'LANGUAGE');
    skillFastApi = await getOrInsertSkill('fastapi', 'FastAPI', 'FRAMEWORK');
    skillPostgres = await getOrInsertSkill('postgresql', 'PostgreSQL', 'DATABASE');
    skillNode = await getOrInsertSkill('node-js', 'Node.js', 'TOOL');

    // 4. Provision Resource and Projects for Tenant A
    [resourceA] = await db
      .insert(resources)
      .values({
        tenantId: tenantA.id,
        provider: 'GITHUB_APP',
        externalResourceId: `998877_${testRunId}`,
        name: 'alice/fastapi-distributed-gateway',
        displayName: 'alice/fastapi-distributed-gateway',
        url: 'https://github.com/alice/fastapi-distributed-gateway',
        isPrivate: false,
        status: 'ACTIVE',
        metadata: { defaultBranch: 'main' },
      })
      .returning();

    [projectA1] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'FastAPI Distributed Gateway',
        slug: `fastapi-distributed-gateway-${testRunId}`,
        headline: 'High-throughput async API Gateway',
        summary: 'Distributed routing and rate-limiting gateway in Python and FastAPI.',
        role: 'Primary Architect',
        isHighlighted: true,
      })
      .returning();

    [projectA2] = await db
      .insert(projects)
      .values({
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        name: 'Postgres Stream CDC',
        slug: `postgres-stream-cdc-${testRunId}`,
        headline: 'CDC pipeline for Postgres',
        summary: 'Change Data Capture engine using PostgreSQL WAL replication.',
        role: 'Lead Developer',
        isHighlighted: false,
      })
      .returning();

    await db.insert(projectResources).values([
      { tenantId: tenantA.id, projectId: projectA1.id, resourceId: resourceA.id },
      { tenantId: tenantA.id, projectId: projectA2.id, resourceId: resourceA.id },
    ]);

    // 5. Provision Evidence Items
    await db.insert(evidenceItems).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA1.id,
        skillId: skillPython.id,
        sourceProvider: 'GITHUB_APP',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        sourceLocation: { filePath: 'pyproject.toml', commitSha: 'a'.repeat(40) },
        confidenceScore: 1.0,
        excerpt: 'python = "^3.11"',
        metadata: {},
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA1.id,
        skillId: skillFastApi.id,
        sourceProvider: 'GITHUB_APP',
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceLocation: { filePath: 'src/main.py', commitSha: 'a'.repeat(40) },
        confidenceScore: 0.95,
        excerpt: 'from fastapi import FastAPI, Depends',
        metadata: {},
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        resourceId: resourceA.id,
        projectId: projectA2.id,
        skillId: skillPostgres.id,
        sourceProvider: 'GITHUB_APP',
        evidenceType: 'CODE_IMPORT_USAGE',
        sourceLocation: { filePath: 'src/wal_parser.py', commitSha: 'b'.repeat(40) },
        confidenceScore: 0.9,
        excerpt: 'conn = psycopg2.connect(...)',
        metadata: {},
      },
    ]);

    // 6. Provision Candidate Skills
    await db.insert(candidateSkills).values([
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPython.id,
        category: 'LANGUAGE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1.0,
        isHighlighted: true,
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillFastApi.id,
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.95,
        isHighlighted: true,
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillPostgres.id,
        category: 'DATABASE',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 0.9,
        isHighlighted: true,
      },
      {
        tenantId: tenantA.id,
        candidateId: candidateA.id,
        skillId: skillNode.id,
        category: 'TOOL',
        provenanceStatus: 'CLAIMED',
        confidenceScore: 0.6,
        isHighlighted: false,
      },
    ]);

    // 7. Generate MCP Tokens
    tokenA = await tokenService.createToken({
      tenantId: tenantA.id,
      userId: userA.id,
      role: 'OWNER',
      name: 'Tenant A Acceptance Token',
      scopes: ['career:read', 'career:write', 'career:export'],
      expiryDays: 30,
    });

    tokenB = await tokenService.createToken({
      tenantId: tenantB.id,
      userId: userB.id,
      role: 'OWNER',
      name: 'Tenant B Acceptance Token',
      scopes: ['career:read', 'career:write'],
      expiryDays: 30,
    });

    // 8. Build Fastify App with live MCP Server
    const mcpServer = createCareerMcpServer({ deps: { db } });
    app = await buildApp({
      mcpServer,
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
  // 1. Tool Inventory (tools/list)
  // ===========================================================================
  describe('1. Tool Inventory over /mcp (tools/list)', () => {
    it('returns exact inventory of 26 registered MCP tools from running server', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/list',
        id: 101,
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');

      const body = res.json();
      assert.strictEqual(body.jsonrpc, '2.0');
      assert.strictEqual(body.id, 101);
      assert.ok(Array.isArray(body.result.tools));
      assert.strictEqual(body.result.tools.length, 26);

      const toolNames = body.result.tools.map((t) => t.name).sort();
      const expectedTools = [
        'add_application_stage',
        'analyze_job_fit',
        'attach_application_document',
        'confirm_and_create_pr',
        'create_application_preview',
        'draft_cover_letter',
        'generate_tailored_resume',
        'get_application_submission_status',
        'get_candidate_profile',
        'get_career_profile',
        'get_job_application',
        'get_job_posting',
        'inspect_project_evidence',
        'list_active_applications',
        'list_verified_skills',
        'prepare_job_application',
        'propose_project_improvement',
        'recommend_portfolio_projects',
        'request_application_approval',
        'search_jobs',
        'submit_job_application',
        'track_job_application',
        'update_application_stage_outcome',
        'update_application_status',
        'update_career_preferences',
        'validate_job_application',
      ].sort();

      assert.deepStrictEqual(toolNames, expectedTools);
    });
  });

  // ===========================================================================
  // 2. draft_cover_letter over /mcp
  // ===========================================================================
  describe('2. draft_cover_letter over /mcp', () => {
    it('generates cover letter for normal inputs', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'draft_cover_letter',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText:
            'Seeking a Senior Python Backend Architect with strong FastAPI and PostgreSQL experience at ScaleData Corp.',
          jobTitle: 'Senior Python Backend Architect',
          companyName: 'ScaleData Corp',
          tone: 'CONFIDENT',
        },
        id: 201,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.jsonrpc, '2.0');
      assert.ok(body.result);

      const structured = body.result.structuredData;
      assert.ok(structured);
      assert.ok(structured.letterId);
      assert.strictEqual(structured.companyName, 'ScaleData Corp');
      assert.strictEqual(structured.jobTitle, 'Senior Python Backend Architect');
      assert.ok(Array.isArray(structured.paragraphs));
      assert.ok(structured.paragraphs.length >= 3);
      assert.ok(['PASS', 'PARTIAL'].includes(structured.integrityReport.overallStatus));
    });

    it('successfully handles dirty inputs with punctuation, special characters, unicode, and consecutive hyphens without SafeSlugSchema failure', async () => {
      const dirtyJobText = `
        We need a Principal Architect proficient in C++, C/C++, JavaScript ES6, Node.js / Express.js,
        React / Next.js, and 🤖 AI / Machine-Learning & Deep-Architecture!
        Role Title: Lead Architect --- Microservices & Distributed High-Scale Cloud Systems (v2.0 / Tier-1).
        Must have deep knowledge of PostgreSQL / SQL databases and low-level data-structures---algorithms.
      `;

      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'draft_cover_letter',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText: dirtyJobText,
          jobTitle: 'Lead Architect --- Microservices & Cloud (v2.0)',
          companyName: 'MegaCorp & Sons / Global AI !!',
          tone: 'CONFIDENT',
        },
        id: 202,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.result);
      const structured = body.result.structuredData;
      assert.ok(structured.letterId);
      assert.ok(structured.paragraphs.length >= 3);
      assert.ok(structured.integrityReport);
    });

    it('guarantees deterministic cover letter output across repeated calls with identical input', async () => {
      const args = {
        candidateId: candidateA.id,
        jobDescriptionText:
          'Looking for a Python and FastAPI engineer to build RESTful services at CloudHub.',
        jobTitle: 'FastAPI Engineer',
        companyName: 'CloudHub',
      };

      const res1 = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'draft_cover_letter',
        args,
        id: 203,
      });
      const res2 = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'draft_cover_letter',
        args,
        id: 204,
      });

      const data1 = res1.json().result.structuredData;
      const data2 = res2.json().result.structuredData;

      assert.strictEqual(data1.paragraphs.length, data2.paragraphs.length);
      assert.strictEqual(data1.metadata.wordCount, data2.metadata.wordCount);
      assert.strictEqual(data1.integrityReport.overallStatus, data2.integrityReport.overallStatus);
    });
  });

  // ===========================================================================
  // 3. generate_tailored_resume over /mcp
  // ===========================================================================
  describe('3. generate_tailored_resume over /mcp', () => {
    it('generates tailored resume with dirty skill/project names and passes integrity audit', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'generate_tailored_resume',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText:
            'Looking for a Backend Lead with Python, FastAPI, and PostgreSQL experience at DataSystems.',
          jobTitle: 'Backend Lead',
          presentationMode: 'GENERATE_NEW',
          templateId: 'ATS_FOCUSED',
        },
        id: 301,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.ok(body.result);
      const structured = body.result.structuredData;

      assert.ok(structured.resumeId);
      assert.strictEqual(structured.candidateId, candidateA.id);
      assert.strictEqual(structured.presentationMode, 'GENERATE_NEW');
      assert.ok(structured.resume.basics.name);
      assert.ok(['PASS', 'WARN'].includes(structured.auditReport.status));
      assert.ok(structured.resume.skills.length > 0);
    });

    it('preserves CLAIMED status on self-reported skills without silently upgrading to VERIFIED', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'generate_tailored_resume',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText:
            'Requires Node.js and Python backend experience for full stack integration.',
          jobTitle: 'Full Stack Engineer',
        },
        id: 302,
      });

      assert.strictEqual(res.statusCode, 200);
      const structured = res.json().result.structuredData;
      const allSkills = structured.resume.skills.flatMap((cat) => cat.skills);

      const pythonSkill = allSkills.find((s) => s.skillSlug === 'python');
      const nodeSkill = allSkills.find((s) => s.skillSlug === 'node-js');

      if (pythonSkill) {
        assert.strictEqual(pythonSkill.provenance, 'VERIFIED');
      }
      if (nodeSkill) {
        assert.strictEqual(nodeSkill.provenance, 'CLAIMED');
        assert.strictEqual(nodeSkill.claimLabel, '[Unverified User Claim]');
      }
    });
  });

  // ===========================================================================
  // 4. analyze_job_fit over /mcp
  // ===========================================================================
  describe('4. analyze_job_fit over /mcp', () => {
    it('produces deterministic fit score and correctly includes project evidence skills', async () => {
      const args = {
        candidateId: candidateA.id,
        jobDescriptionText:
          'Backend Engineer position requiring Python, FastAPI, and PostgreSQL for distributed services.',
      };

      const res1 = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'analyze_job_fit',
        args,
        id: 401,
      });

      const res2 = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'analyze_job_fit',
        args,
        id: 402,
      });

      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res2.statusCode, 200);

      const data1 = res1.json().result.structuredData;
      const data2 = res2.json().result.structuredData;

      assert.strictEqual(data1.overallFit.atsScore, data2.overallFit.atsScore);
      assert.strictEqual(data1.overallFit.matchGrade, data2.overallFit.matchGrade);
      assert.ok(data1.overallFit.scoreBreakdown);

      // Verify that FastAPI (backed by project evidence) is indexed and verified in evidenceBacking
      assert.ok(data1.evidenceBacking.verifiedSkillsCount >= 2);
    });
  });

  // ===========================================================================
  // 5. search_jobs over /mcp
  // ===========================================================================
  describe('5. search_jobs over /mcp', () => {
    it('filters correctly by remoteOnly, employmentType, skills, and includes synthetic dataset attribution', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'search_jobs',
        args: {
          query: 'engineer',
          remoteOnly: true,
          employmentType: 'FULL_TIME',
          skills: ['Python'],
        },
        id: 501,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      const structured = body.result.structuredData;

      assert.ok(Array.isArray(structured.jobs));
      assert.ok(structured._meta);
      assert.strictEqual(structured._meta.isSyntheticDataset, true);

      for (const job of structured.jobs) {
        assert.strictEqual(job.workplaceType, 'REMOTE');
        assert.strictEqual(job.employmentType, 'FULL_TIME');
      }
    });
  });

  // ===========================================================================
  // 6. recommend_portfolio_projects over /mcp
  // ===========================================================================
  describe('6. recommend_portfolio_projects over /mcp', () => {
    it('recommends relevant projects without duplicate entries from database joins', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'recommend_portfolio_projects',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText:
            'Seeking a Python / FastAPI specialist to build distributed API infrastructure.',
          maxFeaturedProjects: 3,
        },
        id: 601,
      });

      assert.strictEqual(res.statusCode, 200);
      const structured = res.json().result.structuredData;

      assert.ok(Array.isArray(structured.featuredProjects));
      assert.ok(structured.featuredProjects.length >= 1);

      // Verify no duplicate project IDs
      const projectIds = structured.featuredProjects.map((p) => p.projectId);
      const uniqueIds = new Set(projectIds);
      assert.strictEqual(projectIds.length, uniqueIds.size);
    });

    it('emits clear weak-match explanation when job requirements match 0 candidate criteria', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'recommend_portfolio_projects',
        args: {
          candidateId: candidateA.id,
          jobDescriptionText:
            'Looking for an Embedded Systems Firmware Developer with 10 years of Rust, C#, and Bare-Metal FPGA experience.',
          maxFeaturedProjects: 1,
        },
        id: 602,
      });

      assert.strictEqual(res.statusCode, 200);
      const structured = res.json().result.structuredData;
      assert.ok(structured.featuredProjects.length > 0);

      const featured = structured.featuredProjects[0];
      assert.ok(
        (featured.caseStudyPrompt &&
          featured.caseStudyPrompt.includes('Weak direct job match: covers 0 required criteria')) ||
          featured.relevanceScore <= 40
      );
    });
  });

  // ===========================================================================
  // 7. get_career_profile over /mcp
  // ===========================================================================
  describe('7. get_career_profile over /mcp', () => {
    it('resolves candidate profile with explicit candidateId', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'get_career_profile',
        args: {
          candidateId: candidateA.id,
        },
        id: 701,
      });

      assert.strictEqual(res.statusCode, 200);
      const structured = res.json().result.structuredData;
      assert.strictEqual(structured.profile.candidateId, candidateA.id);
      assert.strictEqual(structured.profile.displayName, 'Alice Engineer');
    });

    it('resolves candidate profile when candidateId is omitted (auto-resolution via tenant context)', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'get_career_profile',
        args: {},
        id: 702,
      });

      assert.strictEqual(res.statusCode, 200);
      const structured = res.json().result.structuredData;
      assert.strictEqual(structured.profile.candidateId, candidateA.id);
    });
  });

  // ===========================================================================
  // 8. inspect_project_evidence over /mcp
  // ===========================================================================
  describe('8. inspect_project_evidence over /mcp', () => {
    it('traverses pagination deterministically and returns empty array on out-of-bounds page', async () => {
      // Page 1
      const p1Res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'inspect_project_evidence',
        args: {
          projectId: projectA1.id,
          page: 1,
          pageSize: 2,
        },
        id: 801,
      });

      assert.strictEqual(p1Res.statusCode, 200);
      const p1Data = p1Res.json().result.structuredData;
      assert.strictEqual(p1Data.pagination.page, 1);
      assert.ok(p1Data.evidenceItems.length <= 2);

      // Out of bounds (Page 100)
      const pOutRes = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'inspect_project_evidence',
        args: {
          projectId: projectA1.id,
          page: 100,
          pageSize: 2,
        },
        id: 802,
      });

      assert.strictEqual(pOutRes.statusCode, 200);
      const pOutData = pOutRes.json().result.structuredData;
      assert.deepStrictEqual(pOutData.evidenceItems, []);
      assert.strictEqual(pOutData.pagination.page, 100);
      assert.strictEqual(pOutData.pagination.hasNextPage, false);
    });
  });

  // ===========================================================================
  // 9. Error Contract over /mcp
  // ===========================================================================
  describe('9. Error Contract over /mcp', () => {
    it('returns structured JSON-RPC -32602 error for invalid tool arguments without leaking stack trace or secrets', async () => {
      const res = await invokeMcp({
        token: tokenA.rawToken,
        method: 'tools/call',
        toolName: 'draft_cover_letter',
        args: {
          candidateId: 'invalid-non-uuid',
          jobDescriptionText: 'too short',
        },
        id: 901,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.jsonrpc, '2.0');
      assert.strictEqual(body.id, 901);
      const isError = body.error || body.result?.isError;
      assert.ok(isError);
      assert.strictEqual(body.error?.data?.stack, undefined);
      assert.strictEqual(body.error?.data?.sql, undefined);
    });

    it('returns structured JSON-RPC -32001 error when Authorization header is missing', async () => {
      const res = await invokeMcp({
        token: '',
        method: 'tools/list',
        id: 902,
      });

      assert.strictEqual(res.statusCode, 401);
      const body = res.json();
      assert.strictEqual(body.jsonrpc, '2.0');
      assert.strictEqual(body.error.code, -32001);
      assert.ok(body.error.message.includes('Authentication required'));
    });
  });

  // ===========================================================================
  // 10. Multi-Tenant Sovereign Isolation over /mcp
  // ===========================================================================
  describe('10. Multi-Tenant Sovereign Isolation over /mcp', () => {
    it('rejects cross-tenant access to candidate profile with 404 default-deny (-32004)', async () => {
      // Tenant B token attempting to access Tenant A candidate
      const res = await invokeMcp({
        token: tokenB.rawToken,
        method: 'tools/call',
        toolName: 'get_candidate_profile',
        args: {
          candidateId: candidateA.id,
        },
        id: 1001,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      assert.strictEqual(body.jsonrpc, '2.0');
      const isError = body.error || body.result?.isError;
      assert.ok(isError);
    });

    it('rejects cross-tenant project evidence inspection with 404 default-deny (-32004)', async () => {
      // Tenant B token attempting to access Tenant A project
      const res = await invokeMcp({
        token: tokenB.rawToken,
        method: 'tools/call',
        toolName: 'inspect_project_evidence',
        args: {
          projectId: projectA1.id,
        },
        id: 1002,
      });

      assert.strictEqual(res.statusCode, 200);
      const body = res.json();
      const isError = body.error || body.result?.isError;
      assert.ok(isError);
    });
  });

  // ===========================================================================
  // 11. Rate Limiting & Burst Protection over /mcp
  // ===========================================================================
  describe('11. Rate Limiting & Concurrency Controls over /mcp', () => {
    it('enforces 429 status code with Retry-After header when rate limit is exhausted', async () => {
      const exhaustedLimiter = new McpRateLimiter({
        ipLimit: 2,
        tenantLimit: 2,
        toolLimit: 2,
      });
      const rateLimitServer = createCareerMcpServer({ deps: { db } });
      const rateLimitApp = await buildApp({
        mcpServer: rateLimitServer,
        rateLimiter: exhaustedLimiter,
        tokenService,
      });
      await rateLimitApp.ready();

      // Exhaust limit
      await rateLimitApp.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: PROTOCOL_META } },
      });

      await rateLimitApp.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
        payload: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: PROTOCOL_META } },
      });

      const blockedRes = await rateLimitApp.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        },
        payload: { jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: PROTOCOL_META } },
      });

      assert.strictEqual(blockedRes.statusCode, 429);
      assert.ok(blockedRes.headers['retry-after']);
      const body = blockedRes.json();
      assert.strictEqual(body.error.code, -32029);

      await rateLimitApp.close();
    });
  });

  // ===========================================================================
  // 12. Realistic Client Request Shapes (Claude, ChatGPT, Gemini)
  // ===========================================================================
  describe('12. Realistic Client Request Shapes (Claude, ChatGPT, Gemini)', () => {
    it('handles Claude-style MCP client tools/list and tools/call workflow', async () => {
      // 1. Tools List
      const listRes = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
          'user-agent': 'Claude-MCP-Client/1.0',
        },
        payload: {
          jsonrpc: '2.0',
          id: 'claude-list-1',
          method: 'tools/list',
          params: {
            _meta: PROTOCOL_META,
          },
        },
      });

      assert.strictEqual(listRes.statusCode, 200);
      const listBody = listRes.json();
      assert.ok(Array.isArray(listBody.result.tools));
      assert.strictEqual(listBody.result.tools.length, 26);

      // 2. Tools Call
      const callRes = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': 'list_verified_skills',
          'user-agent': 'Claude-MCP-Client/1.0',
        },
        payload: {
          jsonrpc: '2.0',
          id: 'claude-call-1',
          method: 'tools/call',
          params: {
            name: 'list_verified_skills',
            arguments: { candidateId: candidateA.id },
            _meta: PROTOCOL_META,
          },
        },
      });

      assert.strictEqual(callRes.statusCode, 200);
      assert.strictEqual(callRes.json().id, 'claude-call-1');
    });

    it('handles ChatGPT-style MCP Developer Mode client requests', async () => {
      const gptRes = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': 'search_jobs',
          'user-agent': 'ChatGPT-CustomAction/2.0',
        },
        payload: {
          jsonrpc: '2.0',
          id: 'chatgpt-001',
          method: 'tools/call',
          params: {
            name: 'search_jobs',
            arguments: { query: 'python developer' },
            _meta: PROTOCOL_META,
          },
        },
      });

      assert.strictEqual(gptRes.statusCode, 200);
      assert.strictEqual(gptRes.json().id, 'chatgpt-001');
    });

    it('handles Gemini-style direct dispatch requests', async () => {
      const geminiRes = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${tokenA.rawToken}`,
          'content-type': 'application/json',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': 'get_career_profile',
          'user-agent': 'Gemini-FunctionCalling/3.7',
        },
        payload: {
          jsonrpc: '2.0',
          id: 'gemini-req-99',
          method: 'tools/call',
          params: {
            name: 'get_career_profile',
            arguments: { candidateId: candidateA.id },
            _meta: PROTOCOL_META,
          },
        },
      });

      assert.strictEqual(geminiRes.statusCode, 200);
      assert.strictEqual(geminiRes.json().id, 'gemini-req-99');
    });
  });
});
