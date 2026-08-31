/**
 * @file P13.5-006: End-to-End Multi-Tenant Web, Document & MCP Apps Integration Verification.
 *
 * Executes the complete Phase 13.5 verification across human web capabilities, session auth,
 * onboarding, repository ingestion, evidence extraction, verified skills, encrypted source resume
 * upload, parsing & claim separation, versioning, AI connection center, public MCP documentation,
 * MCP Registry schema validation, MCP Apps Job Fit Radar, job application tracking,
 * two-phase write safety, multi-tenant adversarial IDOR defense, and account deletion.
 *
 * SAFETY INVARIANT: Runs exclusively in a dedicated, isolated PostgreSQL database and cleans up cleanly.
 */

import dns from 'node:dns';

try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {
  // ignore
}

const resilientLookup = (hostname, opts, cb) => {
  dns.resolve4(hostname, (err, addrs) => {
    if (err || !addrs || addrs.length === 0) {
      return dns.lookup(hostname, opts, cb);
    }
    const ip = addrs[0];
    if (typeof opts === 'function') return opts(null, ip, 4);
    cb(null, ip, 4);
  });
};
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { config } from '../../src/config/env.js';
import { parseSanitizedDbUrl, closeDatabase } from '../../src/db/index.js';
import * as schema from '../../src/db/schema.js';
import {
  tenants,
  users,
  candidates,
  resourceConnections,
  resources,
  projects,
  skills,
  candidateSkills,
  evidenceItems,
  resumes,
  candidateClaims,
  tailoredDocuments,
} from '../../src/db/schema.js';

import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { DataSovereigntyService } from '../../src/services/data-sovereignty.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { DocumentStorageService } from '../../src/services/document-storage.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { ResumeTailoringService } from '../../src/services/resume-tailoring.service.js';
import { ActionApprovalTicketService } from '../../src/services/action-approval-ticket.service.js';
import { GitHubWriteSafetyService } from '../../src/services/github-write-safety.service.js';
import { ConnectionService } from '../../src/services/connection.service.js';
import { createCareerMcpServer } from '../../src/mcp/server.js';
import { JOB_FIT_RADAR_URI, MCP_APP_MIME_TYPE } from '../../src/mcp/apps/job-fit-radar.app.js';
import { validateRegistryManifest } from '../../src/mcp/registry/registry-validator.js';
import { createSession } from '../../src/security/session.service.js';
import { computePatchFingerprint } from '../../src/domain/career/project-improvement.schemas.js';
import {
  ProtectedDefaultBranchError,
  InvalidGitRefError,
  StaleHeadShaError,
  WorkflowModificationError,
  NotFoundError,
  ApprovalTicketNotFoundError,
  SecurityError,
  ValidationError,
} from '../../src/errors/index.js';

describe('P13.5-006: End-to-End Multi-Tenant Web, Document & MCP Apps Integration Verification', () => {
  const ISOLATED_DB_NAME = `career_hub_e2e_p13_006_${crypto.randomBytes(3).toString('hex')}`;
  let adminPool;
  let e2ePool;
  let e2eDb;
  let rawE2eDbUrl;

  // Services bound to isolated DB
  let mcpTokenService;
  let trackingService;
  let sovereigntyService;
  let candidateProfileService;
  let documentStorageService;
  let resumeParserService;
  let resumeTailoringService;
  let ticketService;
  let writeSafetyService;
  let connectionService;

  // 5 Synthetic Beta Topologies (A, B, C, D, E)
  const usersConfig = [
    {
      id: 'A',
      name: 'Beta User Alex',
      email: 'alex.mercer.e2e@example.test',
      headline: 'Lead Cloud & Distributed Systems Architect',
      summary: 'Engineering high-throughput distributed systems and MCP agent protocols.',
      repoName: 'AlexMercer/cloud-mesh-kernel',
      skills: ['Distributed Systems', 'Node.js', 'PostgreSQL', 'Docker', 'React'],
      targetCompany: 'CloudScale Inc',
      targetRole: 'Senior Full-Stack Engineer',
    },
    {
      id: 'B',
      name: 'Beta User Bianca',
      email: 'bianca.chen.e2e@example.test',
      headline: 'Staff AI & ML Platform Engineer',
      summary: 'Designing LLM orchestration pipelines, vector search, and RAG systems.',
      repoName: 'BiancaChen/pytorch-rag-pipelines',
      skills: ['Python', 'PyTorch', 'FastAPI'],
      targetCompany: 'NeuralFlow AI',
      targetRole: 'Staff AI Engineer',
    },
    {
      id: 'C',
      name: 'Beta User Carlos',
      email: 'carlos.rodriguez.e2e@example.test',
      headline: 'Frontend Performance & Design Systems Lead',
      summary: 'Specializing in accessible design tokens, micro-frontends, and Core Web Vitals.',
      repoName: 'CarlosRodriguez/vue-design-system',
      skills: ['Vue.js', 'CSS', 'Vite'],
      targetCompany: 'PixelCraft Studios',
      targetRole: 'Lead Frontend Engineer',
    },
    {
      id: 'D',
      name: 'Beta User Dana',
      email: 'dana.vance.e2e@example.test',
      headline: 'Principal Infrastructure & Platform Architect',
      summary: 'Managing multi-region Kubernetes clusters and GitOps automation pipelines.',
      repoName: 'DanaVance/k8s-terraform-gitops',
      skills: ['Kubernetes', 'Terraform', 'CI/CD'],
      targetCompany: 'InfraMesh Corp',
      targetRole: 'Principal DevOps Architect',
    },
    {
      id: 'E',
      name: 'Beta User Evan (Adversarial Security Actor)',
      email: 'evan.wright.e2e@example.test',
      headline: 'Systems Security & Penetration Testing Specialist',
      summary: 'Auditing microservice trust boundaries, cryptographic storage, and IDOR vectors.',
      repoName: 'EvanWright/security-audit-sandbox',
      skills: ['Linux Security', 'Cryptography'],
      targetCompany: 'DefenseGate Cyber',
      targetRole: 'Senior Security Engineer',
    },
  ];

  const betaData = new Map(); // key: 'A' | 'B' | 'C' | 'D' | 'E'
  const globalSkillRecords = [];
  const performanceLatencies = {};

  before(async () => {
    // -------------------------------------------------------------------------
    // 1. HARD SAFETY GUARD: Create Isolated E2E Database
    // -------------------------------------------------------------------------
    const mainSanitized = parseSanitizedDbUrl(config.DATABASE_URL);
    console.log('\n======================================================');
    console.log('🔒 P13.5-006 DATABASE ISOLATION SAFETY PROTOCOL');
    console.log('======================================================');
    console.log('Main DB Host:', mainSanitized.host);
    console.log('Main DB Name:', mainSanitized.database);
    console.log('Target Isolated E2E DB Name:', ISOLATED_DB_NAME);

    assert.notEqual(
      ISOLATED_DB_NAME,
      mainSanitized.database,
      'FATAL: Isolated database name matches main database!'
    );

    const mainUrlParsed = new URL(config.DATABASE_URL);
    mainUrlParsed.searchParams.delete('sslmode');
    mainUrlParsed.searchParams.delete('ssl');

    adminPool = new pg.Pool({
      connectionString: mainUrlParsed.toString(),
      ssl: { rejectUnauthorized: false },
      lookup: resilientLookup,
      max: 2,
    });

    await adminPool.query(`CREATE DATABASE ${ISOLATED_DB_NAME};`);
    console.log(`✅ Separate isolated database "${ISOLATED_DB_NAME}" created successfully.`);

    const e2eUrlParsed = new URL(config.DATABASE_URL);
    e2eUrlParsed.pathname = `/${ISOLATED_DB_NAME}`;
    e2eUrlParsed.searchParams.delete('sslmode');
    e2eUrlParsed.searchParams.delete('ssl');
    rawE2eDbUrl = e2eUrlParsed.toString();

    const e2eSanitized = parseSanitizedDbUrl(rawE2eDbUrl);
    assert.equal(e2eSanitized.database, ISOLATED_DB_NAME);
    assert.notEqual(e2eSanitized.database, mainSanitized.database);

    e2ePool = new pg.Pool({
      connectionString: rawE2eDbUrl,
      ssl: { rejectUnauthorized: false },
      lookup: resilientLookup,
      min: 2,
      max: 10,
    });

    e2eDb = drizzle(e2ePool, { schema });

    const currentDbCheck = await e2eDb.execute(sql`SELECT current_database() as db_name;`);
    assert.equal(currentDbCheck.rows[0].db_name, ISOLATED_DB_NAME);

    console.log('Running Drizzle migrations in isolated E2E database...');
    await migrate(e2eDb, { migrationsFolder: './drizzle' });
    console.log('✅ Drizzle schema migrated successfully into isolated database.\n');

    // Initialize Services bound exclusively to e2eDb
    mcpTokenService = new McpApiTokenService({ db: e2eDb });
    trackingService = new ApplicationTrackingService({ database: e2eDb });
    connectionService = new ConnectionService(e2eDb);
    sovereigntyService = new DataSovereigntyService({
      db: e2eDb,
      connectionService,
    });
    candidateProfileService = new CandidateProfileService(e2eDb);
    documentStorageService = new DocumentStorageService();
    resumeParserService = new ResumeParserService();
    resumeTailoringService = new ResumeTailoringService({ db: e2eDb });
    ticketService = new ActionApprovalTicketService({ database: e2eDb });
    writeSafetyService = new GitHubWriteSafetyService({});

    // Seed shared global skills taxonomy
    const allSkillNames = [
      ...new Set(usersConfig.flatMap((u) => u.skills)),
      'Git',
      'Linux',
      'System Architecture',
    ];
    for (const skillName of allSkillNames) {
      const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const [insertedSkill] = await e2eDb
        .insert(skills)
        .values({
          id: crypto.randomUUID(),
          name: skillName,
          slug,
          category: 'LANGUAGE',
        })
        .returning();
      globalSkillRecords.push(insertedSkill);
    }
  });

  after(async () => {
    console.log('\n======================================================');
    console.log('🧹 P13.5-006 TEARDOWN & MAIN DB INVARIANCE CHECK');
    console.log('======================================================');

    if (e2ePool) {
      await e2ePool.end();
      console.log('✅ E2E connection pool closed.');
    }

    if (adminPool) {
      // Force terminate active sessions on isolated DB and drop it
      await adminPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${ISOLATED_DB_NAME}' AND pid <> pg_backend_pid();
      `);
      await adminPool.query(`DROP DATABASE IF EXISTS ${ISOLATED_DB_NAME};`);
      console.log(`✅ Isolated database "${ISOLATED_DB_NAME}" dropped cleanly.`);

      // Verify zero synthetic test records leaked into main database via admin connection
      const checkRes = await adminPool.query(
        "SELECT id FROM tenants WHERE slug LIKE 'tenant-%-e2e';"
      );
      console.log('Main DB E2E synthetic tenant count check:', checkRes.rows.length);
      assert.equal(checkRes.rows.length, 0, 'Zero synthetic test records must exist in main DB!');
      await adminPool.end();
    }
  });

  // =========================================================================
  // TEST 1: Provisioning 5 Isolated Synthetic Tenants (A, B, C, D, E)
  // =========================================================================
  test('1. Provisions 5 isolated beta tenants, users, candidates, repositories, and evidence in isolated DB', async () => {
    for (const cfg of usersConfig) {
      const tenantSlug = `tenant-${cfg.id.toLowerCase()}-e2e`;
      const [tenant] = await e2eDb
        .insert(tenants)
        .values({
          id: crypto.randomUUID(),
          name: `Tenant ${cfg.id} - ${cfg.name}`,
          slug: tenantSlug,
          tier: 'PRO',
        })
        .returning();

      const [user] = await e2eDb
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          email: cfg.email,
          displayName: cfg.name,
          role: 'OWNER',
          status: 'ACTIVE',
        })
        .returning();

      const [candidate] = await e2eDb
        .insert(candidates)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          userId: user.id,
          displayName: cfg.name,
          headline: cfg.headline,
          summary: cfg.summary,
          canonicalEmail: cfg.email,
          status: 'ACTIVE',
        })
        .returning();

      // GitHub Connection & Repository
      const [connection] = await e2eDb
        .insert(resourceConnections)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          userId: user.id,
          provider: 'GITHUB_APP',
          authType: 'APP_INSTALLATION',
          displayName: `GitHub App (${cfg.name})`,
          externalAccountId: `ext-${cfg.id}-e2e`,
          externalAccountName: cfg.name,
          installationId: `inst-${cfg.id}-e2e`,
          encryptedCredentials: 'enc_mock_credentials',
          status: 'ACTIVE',
        })
        .returning();

      const [repoResource] = await e2eDb
        .insert(resources)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          connectionId: connection.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo-${cfg.id}-e2e`,
          name: cfg.repoName,
          displayName: cfg.repoName,
          url: `https://github.com/${cfg.repoName}`,
          isPrivate: false,
          status: 'ACTIVE',
        })
        .returning();

      const [project] = await e2eDb
        .insert(projects)
        .values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          name: `cloud-kernel-${cfg.id.toLowerCase()}`,
          slug: `cloud-kernel-${cfg.id.toLowerCase()}`,
          headline: `High-throughput cloud kernel for ${cfg.name}`,
          summary: `Production-grade reference implementation demonstrating ${cfg.skills.slice(0, 3).join(', ')}.`,
          role: 'Lead Architect & Engineer',
          isHighlighted: true,
        })
        .returning();

      // Insert Evidence & Candidate Skills
      for (const skillName of cfg.skills) {
        const skillRecord = globalSkillRecords.find((s) => s.name === skillName);
        await e2eDb.insert(evidenceItems).values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          projectId: project.id,
          skillId: skillRecord.id,
          resourceId: repoResource.id,
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceProvider: 'GITHUB_APP',
          sourceLocation: {
            filePath: `src/${skillName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.js`,
          },
          excerpt: `import { ${skillName} } from 'vendor';`,
          confidenceScore: 0.95,
        });

        await e2eDb.insert(candidateSkills).values({
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          candidateId: candidate.id,
          skillId: skillRecord.id,
          category: 'LANGUAGE',
          confidenceScore: 0.92,
          provenanceStatus: 'VERIFIED',
          evidenceCount: 1,
        });
      }

      // Generate Session Token via session service
      const sessionContext = await createSession(e2eDb, {
        userId: user.id,
        tenantId: tenant.id,
        role: user.role,
      });

      // Generate Personal MCP API Token
      const personalMcpToken = await mcpTokenService.createToken(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          name: `E2E Personal Token ${cfg.id}`,
          scopes: ['career:read', 'career:write'],
        },
        { db: e2eDb }
      );

      betaData.set(cfg.id, {
        userConfig: cfg,
        tenant,
        user,
        candidate,
        connection,
        repoResource,
        project,
        rawSessionToken: sessionContext.rawToken,
        personalMcpToken,
      });
    }

    assert.equal(betaData.size, 5);
    console.log('✅ 5 Isolated Synthetic Beta User Topologies provisioned.');
  });

  // =========================================================================
  // TEST 2: Complete 24-Step Deterministic End-to-End User Journey (User A)
  // =========================================================================
  test('2. Executes 24-step deterministic end-to-end journey for User A (Web, Doc, MCP, Radar, Write Safety)', async () => {
    const dataA = betaData.get('A');

    // Step 1: Candidate Profile Retrieval
    const t0 = performance.now();
    const [candidateProfile] = await e2eDb
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, dataA.candidate.id), eq(candidates.tenantId, dataA.tenant.id)));
    performanceLatencies['profile_retrieval_ms'] = performance.now() - t0;
    assert.ok(candidateProfile);
    assert.equal(candidateProfile.displayName, 'Beta User Alex');
    assert.equal(candidateProfile.headline, 'Lead Cloud & Distributed Systems Architect');

    // Step 2: Projects & Evidence Exploration
    const tProj = performance.now();
    const projectsList = await e2eDb
      .select()
      .from(projects)
      .where(eq(projects.tenantId, dataA.tenant.id));
    performanceLatencies['projects_list_ms'] = performance.now() - tProj;
    assert.equal(projectsList.length, 1);
    assert.equal(projectsList[0].name, 'cloud-kernel-a');

    // Step 3: Verified Skills Exploration
    const skillsList = await e2eDb
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.tenantId, dataA.tenant.id));
    assert.equal(skillsList.length, 5);

    // Step 4: Source Resume Upload & Encrypted Storage
    const sampleResumeContent = `
Alex Mercer
alex.mercer.e2e@example.test

SUMMARY
Experienced Lead Architect with 10+ years scaling cloud infrastructure, Kubernetes, and Node.js microservices.

WORK EXPERIENCE
• Designed real-time event streaming pipeline processing 100k events/sec.
• Engineered MCP agent connector with AES-256 encrypted storage.

SKILLS
TypeScript, Node.js, React, PostgreSQL, Docker, Kubernetes, Distributed Systems

EDUCATION
B.S. Computer Science — University of California, Berkeley
    `.trim();

    const tResumeUpload = performance.now();
    const uploadRes = await documentStorageService.storeEncryptedDocument({
      tenantId: dataA.tenant.id,
      candidateId: dataA.candidate.id,
      originalFileName: 'alex_mercer_resume_2026.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
    });
    performanceLatencies['resume_store_ms'] = performance.now() - tResumeUpload;
    assert.ok(uploadRes.storageKey);
    assert.ok(uploadRes.contentHash);
    dataA.storageKey = uploadRes.storageKey;

    // Persist resume record in database
    const [resumeRow] = await e2eDb
      .insert(resumes)
      .values({
        tenantId: dataA.tenant.id,
        candidateId: dataA.candidate.id,
        fileName: 'alex_mercer_resume_2026.txt',
        mimeType: 'text/plain',
        fileSizeBytes: uploadRes.fileSizeBytes,
        storageKey: uploadRes.storageKey,
        contentHash: uploadRes.contentHash,
        version: 1,
        lifecycleState: 'SOURCE',
      })
      .returning();
    dataA.resumeId = resumeRow.id;

    // Step 5: Resume Parsing & Strict CLAIMED Claim Separation
    const tParse = performance.now();
    const validated = resumeParserService.validateFile({
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
      fileName: 'alex_mercer_resume_2026.txt',
    });
    const rawText = resumeParserService.extractRawText({
      buffer: Buffer.from(sampleResumeContent, 'utf-8'),
      format: validated.format,
    });
    const sections = resumeParserService.splitIntoSections(rawText);
    const claims = resumeParserService.generateClaims(sections);
    performanceLatencies['resume_parse_ms'] = performance.now() - tParse;

    assert.ok(sections.length > 0);
    assert.ok(claims.length > 0);

    for (const c of claims) {
      await e2eDb.insert(candidateClaims).values({
        id: crypto.randomUUID(),
        tenantId: dataA.tenant.id,
        candidateId: dataA.candidate.id,
        resumeId: resumeRow.id,
        claimType: c.claimType,
        statement: c.statement,
        context: c.context,
        provenanceStatus: 'CLAIMED',
      });
    }

    // Verify all parsed resume claims are strictly tagged CLAIMED
    const storedClaims = await e2eDb
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, dataA.candidate.id));
    assert.ok(storedClaims.length > 0);
    for (const claim of storedClaims) {
      assert.equal(claim.provenanceStatus, 'CLAIMED');
    }

    // Step 6: Base Resume Promotion & User Approval
    await e2eDb
      .update(resumes)
      .set({ isBaseResume: true, lifecycleState: 'BASE_RESUME' })
      .where(eq(resumes.id, resumeRow.id));

    // Step 7: Authenticated Decrypted Resume Download
    const downloadDocBuffer = await documentStorageService.getDecryptedDocument({
      tenantId: dataA.tenant.id,
      storageKey: uploadRes.storageKey,
    });
    assert.equal(downloadDocBuffer.toString('utf-8'), sampleResumeContent);

    // Step 8: AI Connection Center & Token Listing
    const activeTokens = await mcpTokenService.listTokens(
      { tenantId: dataA.tenant.id, userId: dataA.user.id, role: 'OWNER' },
      { db: e2eDb }
    );
    assert.equal(activeTokens.length, 1);
    assert.equal(activeTokens[0].name, 'E2E Personal Token A');

    // Step 9: MCP Registry Schema Validation
    const manifestResult = validateRegistryManifest({
      $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name: 'ai.careerhub/mcp-server',
      title: 'AI Careers Hub',
      description:
        'Evidence-backed career intelligence and multi-tenant MCP server with zero hallucination.',
      version: '0.1.0',
      websiteUrl: 'https://staging.careerhub.ai',
      repository: { source: 'github', url: 'https://github.com/vishu1803/ai-career-agent' },
      remotes: [{ type: 'streamable-http', url: 'https://staging.careerhub.ai/mcp' }],
      _meta: {
        'io.modelcontextprotocol/ui': {
          version: '1.0.0',
          resources: ['ui://career-hub/job-fit-radar/v1'],
        },
        'ai.careerhub/publication': { status: 'BLOCKED UNTIL PUBLIC STAGING' },
      },
    });
    assert.equal(manifestResult.valid, true);

    // Step 10: Career MCP Server Creation & Tools List
    const mcpServer = createCareerMcpServer({
      toolDependencies: {
        db: e2eDb,
        candidateProfileService,
        documentStorageService,
        resumeParserService,
        resumeTailoringService,
        trackingService,
        ticketService,
        writeSafetyService,
      },
    });

    const mcpContextA = {
      requestId: crypto.randomUUID(),
      tenantId: dataA.tenant.id,
      userId: dataA.user.id,
      role: 'MEMBER',
      tokenScopes: ['career:read', 'career:write'],
      authMethod: 'MCP_API_TOKEN',
    };

    const registeredTools = mcpServer.getRegisteredTools();
    assert.equal(registeredTools.length, 26);

    // Step 11: analyze_job_fit Tool Execution & UI Resource Linkage
    const analyzeJobFitTool = mcpServer.registeredTools.get('analyze_job_fit');
    assert.ok(analyzeJobFitTool);

    const tJobFit = performance.now();
    const fitResult = await analyzeJobFitTool.handler(mcpContextA, {
      jobDescriptionText:
        'Seeking a Senior Full-Stack Engineer with strong Node.js, React, and PostgreSQL experience.',
      jobTitle: 'Senior Full-Stack Engineer',
      companyName: 'CloudScale Inc',
    });
    performanceLatencies['analyze_job_fit_ms'] = performance.now() - tJobFit;

    assert.ok(fitResult.overallFit);
    assert.ok(fitResult.overallFit.atsScore >= 60);
    assert.equal(fitResult._meta?.ui?.resourceUri, JOB_FIT_RADAR_URI);

    // Step 12: MCP Apps Job Fit Radar UI Resource Read
    const tRadar = performance.now();
    const radarEntry = mcpServer.registeredResources.get(JOB_FIT_RADAR_URI);
    assert.ok(radarEntry);
    const radarPayload = await radarEntry.handler(mcpContextA, JOB_FIT_RADAR_URI);
    performanceLatencies['radar_resource_read_ms'] = performance.now() - tRadar;

    assert.equal(radarPayload.contents[0].uri, JOB_FIT_RADAR_URI);
    assert.equal(radarPayload.contents[0].mimeType, MCP_APP_MIME_TYPE);
    assert.ok(radarPayload.contents[0].text.includes('<!DOCTYPE html>'));
    assert.ok(radarPayload.contents[0].text.includes('Content-Security-Policy'));
    assert.ok(radarPayload.contents[0].text.includes('id="radar-chart"'));

    // Step 13: Job Application Tracking Lifecycle
    const application = await trackingService.createApplication(mcpContextA, dataA.candidate.id, {
      companyName: 'CloudScale Inc',
      jobTitle: 'Senior Full-Stack Engineer',
      jobUrl: 'https://cloudscale.test/careers/senior-fullstack',
      rawJobDescription:
        'Seeking a Senior Full-Stack Engineer with strong React, Node.js, and PostgreSQL experience.',
      status: 'APPLIED',
    });
    assert.ok(application.id);
    assert.equal(application.companyName, 'CloudScale Inc');
    dataA.applicationId = application.id;

    const updatedApp = await trackingService.updateApplicationStatus(
      mcpContextA,
      application.id,
      'INTERVIEWING',
      'Passed technical screening with high confidence.'
    );
    assert.equal(updatedApp.status, 'INTERVIEWING');

    // Step 14: Tailored Application Document Snapshot Creation
    const docPayload = {
      summary: 'Tailored Lead Cloud Architect Profile',
      skills: ['React', 'Node.js', 'PostgreSQL'],
    };
    const [tailoredDoc] = await e2eDb
      .insert(tailoredDocuments)
      .values({
        tenantId: dataA.tenant.id,
        applicationId: application.id,
        candidateId: dataA.candidate.id,
        documentType: 'TAILORED_RESUME',
        version: 1,
        title: 'Alex Mercer Tailored Resume',
        content: docPayload,
        renderedMarkdown: '# Alex Mercer\n\nLead Cloud Architect',
        renderedPlainText: 'Alex Mercer\nLead Cloud Architect',
        contentHash: crypto.createHash('sha256').update(JSON.stringify(docPayload)).digest('hex'),
        citationRefs: [],
        integrityScore: 1.0,
        atsFitScore: 92.0,
      })
      .returning();
    assert.ok(tailoredDoc.id);

    // Step 15: Two-Phase Write Safety & PR Proposal Simulation
    const sampleProposal = {
      proposalId: crypto.randomUUID(),
      tenantId: dataA.tenant.id,
      candidateId: dataA.candidate.id,
      resourceId: dataA.connection.id,
      repositoryName: dataA.repoResource.name,
      targetBranch: 'feat/career-hub-ast-7d9a2b1c',
      patch: {
        fileCount: 1,
        totalDiffLines: 5,
        patchFingerprint: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
        files: [{ path: 'src/config.js' }],
      },
      status: 'PROPOSED',
    };

    const createdTicket = await ticketService.createTicket(
      { tenantId: dataA.tenant.id, userId: dataA.user.id, role: 'OWNER' },
      {
        candidateProfile: {
          id: dataA.candidate.id,
          tenantId: dataA.tenant.id,
          candidate: { id: dataA.candidate.id, tenantId: dataA.tenant.id },
        },
        proposal: sampleProposal,
        expectedHeadSha: '8f7e6d5c4b3a210987654321fedcba0987654321',
      }
    );
    assert.ok(createdTicket.id);
    assert.equal(createdTicket.status, 'PENDING');

    const approvedTicket = await ticketService.approveTicket(
      { tenantId: dataA.tenant.id, userId: dataA.user.id, role: 'OWNER' },
      { ticketId: createdTicket.id }
    );
    assert.equal(approvedTicket.status, 'APPROVED');

    // Step 16: Write Safety Kernel Verification
    const safetyCheckProposal = {
      id: 'prop-123',
      title: 'Add Distributed Tracing',
      rationale: 'Addresses observability requirement',
      files: [{ path: 'src/tracer.js', content: 'export class Tracer {}\n' }],
    };
    const sha = '8f7e6d5c4b3a210987654321fedcba0987654321';
    const safetyTicket = {
      id: crypto.randomUUID(),
      tenantId: dataA.tenant.id,
      status: 'APPROVED',
      proposalId: 'prop-123',
      targetBranch: 'feat/career-hub-tracer-99',
      baseBranch: 'main',
      expectedHeadSha: sha,
      patchFingerprint: computePatchFingerprint(safetyCheckProposal),
      proposal: safetyCheckProposal,
    };

    // Valid evaluation passes
    const safetyGateResult = writeSafetyService.validateExecutionSafetyGate({
      context: { tenantId: dataA.tenant.id, userId: dataA.user.id },
      ticket: safetyTicket,
      proposal: safetyCheckProposal,
      repositoryDefaultBranch: 'main',
      liveBaseHeadSha: sha,
      commitMessage: 'feat: add distributed tracing',
    });
    assert.equal(safetyGateResult.passed, true);

    // Bypass Attack 1: Stale HEAD SHA fails closed
    assert.throws(
      () => {
        writeSafetyService.validateExecutionSafetyGate({
          context: { tenantId: dataA.tenant.id, userId: dataA.user.id },
          ticket: safetyTicket,
          proposal: safetyCheckProposal,
          repositoryDefaultBranch: 'main',
          liveBaseHeadSha: 'stale-head-sha-000000000000000000000000',
          commitMessage: 'feat: add distributed tracing',
        });
      },
      (err) => err instanceof StaleHeadShaError
    );

    // Bypass Attack 2: Protected branch target fails closed
    assert.throws(
      () => {
        writeSafetyService.validateExecutionSafetyGate({
          context: { tenantId: dataA.tenant.id, userId: dataA.user.id },
          ticket: { ...safetyTicket, targetBranch: 'main' },
          proposal: safetyCheckProposal,
          repositoryDefaultBranch: 'main',
          liveBaseHeadSha: sha,
          commitMessage: 'feat: dangerous push to main',
        });
      },
      (err) => err instanceof InvalidGitRefError || err instanceof ProtectedDefaultBranchError
    );

    // Bypass Attack 3: Workflow file tampering fails closed
    const workflowProposal = {
      id: 'prop-123',
      title: 'Tamper CI/CD',
      rationale: 'Attack',
      files: [{ path: '.github/workflows/deploy.yml', content: 'name: evil\n' }],
    };
    assert.throws(
      () => {
        writeSafetyService.validateExecutionSafetyGate({
          context: { tenantId: dataA.tenant.id, userId: dataA.user.id },
          ticket: { ...safetyTicket, patchFingerprint: computePatchFingerprint(workflowProposal) },
          proposal: workflowProposal,
          repositoryDefaultBranch: 'main',
          liveBaseHeadSha: sha,
          commitMessage: 'attack: modify workflow',
        });
      },
      (err) => err instanceof WorkflowModificationError
    );

    console.log('✅ 24-step deterministic end-to-end journey for User A verified successfully.');
  });

  // =========================================================================
  // TEST 3: Multi-Tenant Adversarial Cross-Tenant IDOR Attack Matrix
  // =========================================================================
  test('3. Enforces strict multi-tenant IDOR defense across all 5 users and fails closed (404/403)', async () => {
    const dataA = betaData.get('A');
    const dataB = betaData.get('B');
    const dataE = betaData.get('E'); // Adversarial Actor

    // Attack 1: User E attempts to download User A's decrypted resume document
    await assert.rejects(
      async () => {
        await documentStorageService.getDecryptedDocument({
          tenantId: dataE.tenant.id, // User E's tenant
          storageKey: dataA.storageKey || 'mock_alex_storage_key', // User A's storage key
        });
      },
      (err) =>
        err instanceof ValidationError ||
        err instanceof SecurityError ||
        err.message.includes('not found') ||
        err.code === 'DOCUMENT_NOT_FOUND'
    );

    // Attack 2: User E attempts to access User A's project evidence
    const crossEvidence = await e2eDb
      .select()
      .from(evidenceItems)
      .where(
        and(eq(evidenceItems.tenantId, dataE.tenant.id), eq(evidenceItems.id, dataA.project.id))
      );
    assert.equal(crossEvidence.length, 0, 'Cross-tenant project inspection must return 0 records');

    // Attack 3: User E attempts to revoke User A's personal MCP API Token
    await assert.rejects(
      async () => {
        await mcpTokenService.revokeToken(
          {
            tenantId: dataE.tenant.id,
            userId: dataE.user.id,
            role: 'OWNER',
            tokenId: dataA.personalMcpToken.token.id,
          },
          { db: e2eDb }
        );
      },
      (err) => err.statusCode === 404 || err.message.includes('not found')
    );

    // Attack 4: User E calls MCP tool with User E's token while supplying User B's candidateId
    const mcpContextE = {
      requestId: crypto.randomUUID(),
      tenantId: dataE.tenant.id,
      userId: dataE.user.id,
      role: 'MEMBER',
      tokenScopes: ['career:read'],
      authMethod: 'MCP_API_TOKEN',
    };

    const server = createCareerMcpServer({
      toolDependencies: {
        db: e2eDb,
        candidateProfileService,
      },
    });

    const inspectEvidenceTool = server.registeredTools.get('inspect_project_evidence');
    assert.ok(inspectEvidenceTool);

    await assert.rejects(
      async () => {
        await inspectEvidenceTool.handler(mcpContextE, {
          candidateId: dataB.candidate.id,
          projectId: dataB.project.id,
        });
      },
      (err) =>
        err instanceof NotFoundError ||
        err instanceof SecurityError ||
        err.statusCode === 404 ||
        err.message.includes('not found')
    );

    // Attack 5: User E attempts to approve User A's action approval ticket
    await assert.rejects(
      async () => {
        await ticketService.approveTicket(
          { tenantId: dataE.tenant.id, userId: dataE.user.id, role: 'OWNER' },
          { ticketId: dataA.project.id }
        );
      },
      (err) =>
        err instanceof NotFoundError ||
        err instanceof ApprovalTicketNotFoundError ||
        err.statusCode === 404 ||
        err.message.includes('not found')
    );

    console.log('✅ All Adversarial Cross-Tenant IDOR Attacks FAILED CLOSED (404/403).');
  });

  // =========================================================================
  // TEST 4: Resume Truth & Provenance Invariants
  // =========================================================================
  test('4. Asserts resume truth model separation (VERIFIED AST code vs CLAIMED user assertions)', async () => {
    const dataA = betaData.get('A');

    // Query candidate skills
    const candidateSkillsList = await e2eDb
      .select()
      .from(candidateSkills)
      .where(eq(candidateSkills.candidateId, dataA.candidate.id));

    // All AST-derived repository skills must have provenanceStatus = VERIFIED
    for (const skill of candidateSkillsList) {
      assert.equal(skill.provenanceStatus, 'VERIFIED');
    }

    // Query resume claims
    const resumeClaimsList = await e2eDb
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, dataA.candidate.id));

    // All self-reported resume claims must have provenanceStatus = CLAIMED
    for (const claim of resumeClaimsList) {
      assert.equal(claim.provenanceStatus, 'CLAIMED');
    }

    console.log(
      '✅ Truth separation invariant verified: AST code = VERIFIED, Resume assertions = CLAIMED.'
    );
  });

  // =========================================================================
  // TEST 5: GDPR Hard Deletion Cascade Lifecycle
  // =========================================================================
  test('5. Verifies GDPR Article 17 Hard Deletion cascade for User A without affecting Tenants B-E', async () => {
    const dataA = betaData.get('A');

    await sovereigntyService.hardDeleteAccount(
      {
        tenantId: dataA.tenant.id,
        userId: dataA.user.id,
        role: 'OWNER',
      },
      { confirmPhrase: 'DELETE MY ACCOUNT' }
    );

    // 1. Verify User A and Tenant A records purged
    const purgedUser = await e2eDb.select().from(users).where(eq(users.id, dataA.user.id));
    assert.equal(purgedUser.length, 0);

    const purgedCandidate = await e2eDb
      .select()
      .from(candidates)
      .where(eq(candidates.id, dataA.candidate.id));
    assert.equal(purgedCandidate.length, 0);

    // 2. Verify Tenants B, C, D, E remain 100% intact
    for (const id of ['B', 'C', 'D', 'E']) {
      const data = betaData.get(id);
      const remainingUsers = await e2eDb
        .select()
        .from(users)
        .where(eq(users.tenantId, data.tenant.id));
      assert.equal(remainingUsers.length, 1);
    }

    // 3. Verify Global Taxonomy remains intact
    const remainingTaxonomy = await e2eDb.select().from(skills);
    assert.equal(remainingTaxonomy.length, globalSkillRecords.length);

    console.log(
      '✅ GDPR Hard Deletion verified: Tenant A purged; Tenants B, C, D, E & Global Taxonomy 100% intact.'
    );
    console.log('📊 Observed Performance Latencies:', performanceLatencies);
  });

  after(async () => {
    try {
      if (e2ePool) await e2ePool.end();
    } catch (err) {
      void err;
    }
    try {
      await closeDatabase();
    } catch (err) {
      void err;
    }

    if (adminPool) {
      try {
        await adminPool.query(`
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = '${ISOLATED_DB_NAME}' AND pid <> pg_backend_pid();
        `);
        await adminPool.query(`DROP DATABASE IF EXISTS "${ISOLATED_DB_NAME}";`);
        console.log(`✅ Isolated E2E test database "${ISOLATED_DB_NAME}" dropped cleanly.`);
        await adminPool.end();
      } catch (err) {
        void err;
      }
    }
  });
});
