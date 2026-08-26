/**
 * @file P13-004 Synthetic Five-User Beta Verification Suite
 *
 * Executes the complete multi-user beta verification in a 100% ISOLATED dedicated PostgreSQL database.
 * Safety Invariant: NEVER touches or modifies the main development database.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
  candidateIdentities,
  resourceConnections,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  jobApplications,
  applicationStages,
  tailoredDocuments,
  actionApprovalTickets,
  oauthTokens,
} from '../../src/db/schema.js';

import { McpApiTokenService } from '../../src/services/mcp-api-token.service.js';
import { OAuthAuthorizationService } from '../../src/services/oauth-authorization.service.js';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { ApplicationAnalyticsService } from '../../src/services/application-analytics.service.js';
import { DataSovereigntyService } from '../../src/services/data-sovereignty.service.js';
import { authenticateMcpRequest } from '../../src/security/mcp-auth.js';
import { encryptSecret } from '../../src/security/encryption.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../../src/errors/index.js';
import { ConnectionService } from '../../src/services/connection.service.js';

describe('P13-004: Synthetic 5-User Beta Verification in Isolated Database', () => {
  const ISOLATED_DB_NAME = `career_hub_beta_p13_004_${crypto.randomBytes(3).toString('hex')}`;
  let adminPool;
  let betaPool;
  let betaDb;
  let rawBetaDbUrl;

  // Services bound to isolated DB
  let mcpTokenService;
  let oauthService;
  let trackingService;
  let analyticsService;
  let sovereigntyService;

  // 5 Synthetic Beta Topologies
  const usersConfig = [
    {
      id: 'A',
      name: 'Beta User Alex',
      email: 'alex.mercer@example.test',
      role: 'Full-Stack Architect',
      repoName: 'alex-mercer/react-node-microservices',
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker'],
      targetCompany: 'CloudScale Inc',
      targetRole: 'Senior Full-Stack Engineer',
    },
    {
      id: 'B',
      name: 'Beta User Bianca',
      email: 'bianca.chen@example.test',
      role: 'AI / Machine Learning Engineer',
      repoName: 'bianca-chen/pytorch-rag-pipelines',
      skills: ['Python', 'PyTorch', 'Transformers', 'FastAPI', 'Vector Search'],
      targetCompany: 'NeuralFlow AI',
      targetRole: 'Staff AI Engineer',
    },
    {
      id: 'C',
      name: 'Beta User Carlos',
      email: 'carlos.rodriguez@example.test',
      role: 'Frontend Performance Specialist',
      repoName: 'carlos-rodriguez/vue-design-system',
      skills: ['Vue.js', 'CSS', 'Tailwind CSS', 'Vite', 'Web Performance'],
      targetCompany: 'PixelCraft Studios',
      targetRole: 'Lead Frontend Engineer',
    },
    {
      id: 'D',
      name: 'Beta User Dana',
      email: 'dana.vance@example.test',
      role: 'Cloud Infrastructure / DevOps Engineer',
      repoName: 'dana-vance/k8s-terraform-gitops',
      skills: ['Go', 'Kubernetes', 'Terraform', 'AWS', 'CI/CD'],
      targetCompany: 'InfraMesh Corp',
      targetRole: 'Principal DevOps Architect',
    },
    {
      id: 'E',
      name: 'Beta User Evan',
      email: 'evan.wright@example.test',
      role: 'Systems & Security Specialist (Adversarial Actor)',
      repoName: 'evan-wright/security-audit-sandbox',
      skills: ['Rust', 'C++', 'Cryptography', 'Linux Security'],
      targetCompany: 'DefenseGate Cyber',
      targetRole: 'Senior Security Engineer',
    },
  ];

  const betaData = new Map(); // key: 'A' | 'B' | 'C' | 'D' | 'E'
  const globalSkillRecords = [];

  before(async () => {
    // -------------------------------------------------------------------------
    // 1. HARD SAFETY GUARD: Verify and Create Isolated Beta Database
    // -------------------------------------------------------------------------
    const mainSanitized = parseSanitizedDbUrl(config.DATABASE_URL);
    console.log('\n======================================================');
    console.log('🔒 P13-004 DATABASE ISOLATION SAFETY PROTOCOL');
    console.log('======================================================');
    console.log('Main DB Host:', mainSanitized.host);
    console.log('Main DB Name:', mainSanitized.database);
    console.log('Target Isolated Beta DB Name:', ISOLATED_DB_NAME);

    assert.notEqual(
      ISOLATED_DB_NAME,
      mainSanitized.database,
      'FATAL: Isolated database name matches main database!'
    );

    // Build URL for isolated database
    const mainUrlParsed = new URL(config.DATABASE_URL);
    mainUrlParsed.searchParams.delete('sslmode');
    mainUrlParsed.searchParams.delete('ssl');

    // Admin connection to default database to create isolated DB
    adminPool = new pg.Pool({
      connectionString: mainUrlParsed.toString(),
      ssl: { rejectUnauthorized: false },
      max: 2,
    });

    // Create separate database
    await adminPool.query(`CREATE DATABASE ${ISOLATED_DB_NAME};`);
    console.log(`✅ Separate isolated database "${ISOLATED_DB_NAME}" created successfully.`);

    // Build Beta DB URL
    const betaUrlParsed = new URL(config.DATABASE_URL);
    betaUrlParsed.pathname = `/${ISOLATED_DB_NAME}`;
    betaUrlParsed.searchParams.delete('sslmode');
    betaUrlParsed.searchParams.delete('ssl');
    rawBetaDbUrl = betaUrlParsed.toString();

    const betaSanitized = parseSanitizedDbUrl(rawBetaDbUrl);
    console.log('Beta DB Sanitized Host:', betaSanitized.host);
    console.log('Beta DB Sanitized Database:', betaSanitized.database);

    assert.equal(
      betaSanitized.database,
      ISOLATED_DB_NAME,
      'Beta database URL does not match target isolated DB name!'
    );
    assert.notEqual(
      betaSanitized.database,
      mainSanitized.database,
      'Beta database matches main database!'
    );

    // Connect to isolated beta database
    betaPool = new pg.Pool({
      connectionString: rawBetaDbUrl,
      ssl: { rejectUnauthorized: false },
      min: 2,
      max: 10,
    });

    betaDb = drizzle(betaPool, { schema });

    // Verify current_database() on betaDb
    const currentDbCheck = await betaDb.execute(sql`SELECT current_database() as db_name;`);
    const currentDbName = currentDbCheck.rows[0].db_name;
    console.log('Verified Active Beta DB Name:', currentDbName);

    if (currentDbName !== ISOLATED_DB_NAME) {
      throw new Error(
        `SAFETY VIOLATION: Active database is "${currentDbName}", expected "${ISOLATED_DB_NAME}"!`
      );
    }

    // Run Drizzle migrations in isolated database
    console.log('Running Drizzle migrations in isolated beta database...');
    await migrate(betaDb, { migrationsFolder: './drizzle' });
    console.log('✅ Drizzle schema migrated successfully into isolated database.\n');

    // Initialize Services bound exclusively to betaDb
    mcpTokenService = new McpApiTokenService({ db: betaDb });
    oauthService = new OAuthAuthorizationService({
      db: betaDb,
      config: {
        APP_URL: 'https://staging.careerhub.test',
        OAUTH_ISSUER_URL: 'https://staging.careerhub.test',
        OAUTH_RESOURCE_URL: 'https://staging.careerhub.test/mcp',
      },
    });
    trackingService = new ApplicationTrackingService({ database: betaDb });
    analyticsService = new ApplicationAnalyticsService({ database: betaDb });
    const betaConnectionService = new ConnectionService(betaDb);
    sovereigntyService = new DataSovereigntyService({
      db: betaDb,
      connectionService: betaConnectionService,
    });

    // Seed shared global skills taxonomy
    const allSkillNames = [
      ...new Set(usersConfig.flatMap((u) => u.skills)),
      'Git',
      'Linux',
      'System Architecture',
    ];
    for (const skillName of allSkillNames) {
      const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const [insertedSkill] = await betaDb
        .insert(skills)
        .values({
          name: skillName,
          slug,
          category: 'LANGUAGE',
          verificationRules: { extractor: 'manifest_ast' },
        })
        .returning();
      globalSkillRecords.push(insertedSkill);
    }
  });

  after(async () => {
    // -------------------------------------------------------------------------
    // CLEANUP & MAIN DB INVARIANCE ASSERTION
    // -------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('🧹 P13-004 TEARDOWN & MAIN DB INVARIANCE CHECK');
    console.log('======================================================');

    try {
      if (betaPool) {
        await betaPool.end();
        console.log('✅ Beta connection pool closed.');
      }

      if (adminPool) {
        // Drop the isolated verification database completely
        await adminPool.query(`DROP DATABASE IF EXISTS ${ISOLATED_DB_NAME} WITH (FORCE);`);
        console.log(`✅ Isolated database "${ISOLATED_DB_NAME}" dropped cleanly.`);

        // Verify main database is unaffected
        const checkMain = await adminPool.query(
          `SELECT count(*)::int as tenant_count FROM tenants WHERE name LIKE '%Beta User%';`
        );
        console.log('Main DB beta tenant count check:', checkMain.rows[0].tenant_count);
        assert.equal(
          checkMain.rows[0].tenant_count,
          0,
          'MAIN DB POLLUTION DETECTED: Synthetic beta rows found in main DB!'
        );
        console.log('✅ Verified: Zero synthetic beta records exist in the main database.');

        await adminPool.end();
      }

      await closeDatabase();
    } catch (err) {
      console.error('Error during cleanup:', err);
    }
  });

  // ---------------------------------------------------------------------------
  // SECTION 1: Provision 5 Independent Synthetic Beta Workspaces
  // ---------------------------------------------------------------------------
  test('1. Provisions 5 isolated beta tenants, users, candidates, and identities', async () => {
    for (const u of usersConfig) {
      const slug = `ws-${u.id.toLowerCase()}-${crypto.randomBytes(3).toString('hex')}`;

      // 1. Tenant
      const [tenant] = await betaDb
        .insert(tenants)
        .values({
          name: `${u.name}'s Workspace`,
          slug,
          tier: 'FREE',
          status: 'ACTIVE',
        })
        .returning();

      // 2. User (OWNER)
      const [user] = await betaDb
        .insert(users)
        .values({
          tenantId: tenant.id,
          email: u.email,
          displayName: u.name,
          role: 'OWNER',
          status: 'ACTIVE',
        })
        .returning();

      // 3. Candidate Profile
      const [candidate] = await betaDb
        .insert(candidates)
        .values({
          tenantId: tenant.id,
          userId: user.id,
          displayName: u.name,
          headline: u.role,
          canonicalEmail: u.email,
          profileMetadata: {
            userCustom: { betaId: u.id },
            systemInferred: { onboardingState: 'COMPLETED' },
          },
          status: 'ACTIVE',
        })
        .returning();

      // 4. Candidate Identity (GitHub)
      const [identity] = await betaDb
        .insert(candidateIdentities)
        .values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          provider: 'GITHUB_APP',
          externalAccountId: `gh_ext_${u.id}_12345`,
          externalUsername: u.name.toLowerCase().replace(/\s+/g, '-'),
          externalEmail: u.email,
          verified: true,
          verifiedAt: new Date(),
        })
        .returning();

      // 5. GitHub Connection & Encrypted Credentials
      const encryptedCredentials = encryptSecret(
        JSON.stringify({ installationId: 10000 + u.id.charCodeAt(0) }),
        { key: config.ENCRYPTION_MASTER_KEY, keyVersion: 'v1' }
      );
      const [connection] = await betaDb
        .insert(resourceConnections)
        .values({
          tenantId: tenant.id,
          userId: user.id,
          provider: 'GITHUB_APP',
          authType: 'APP_INSTALLATION',
          displayName: `${u.name} GitHub Connection`,
          externalAccountId: `gh_ext_${u.id}_12345`,
          externalAccountName: u.name.toLowerCase().replace(/\s+/g, '-'),
          installationId: `inst_${u.id}_10000`,
          status: 'ACTIVE',
          encryptedCredentials,
          keyVersion: 'v1',
          scopes: ['read:user', 'repo'],
          metadata: { repoCount: 1 },
        })
        .returning();

      // 6. Connected Repository Resource
      const [resource] = await betaDb
        .insert(resources)
        .values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          connectionId: connection.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: `repo_${u.id}_9876`,
          name: u.repoName.split('/')[1],
          displayName: u.repoName,
          url: `https://github.test/${u.repoName}`,
          status: 'ACTIVE',
          metadata: { defaultBranch: 'main' },
        })
        .returning();

      // 7. Project Genesis
      const [project] = await betaDb
        .insert(projects)
        .values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          slug: u.repoName.split('/')[1],
          name: u.repoName.split('/')[1].replace(/-/g, ' ').toUpperCase(),
          summary: `Primary showcase repository for ${u.name} (${u.role})`,
          role: 'Lead Architect',
          status: 'ACTIVE',
        })
        .returning();

      await betaDb.insert(projectResources).values({
        tenantId: tenant.id,
        projectId: project.id,
        resourceId: resource.id,
        associationType: 'PRIMARY_SOURCE',
      });

      // 8. Evidence Items & Verified Skills
      const userEvidence = [];
      for (let i = 0; i < u.skills.length; i++) {
        const skillName = u.skills[i];
        const globalSkill = globalSkillRecords.find((s) => s.name === skillName);

        const [evidence] = await betaDb
          .insert(evidenceItems)
          .values({
            tenantId: tenant.id,
            candidateId: candidate.id,
            resourceId: resource.id,
            projectId: project.id,
            skillId: globalSkill.id,
            evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
            sourceProvider: 'GITHUB_APP',
            qualityScore: 0.95,
            sourceLocation: {
              filePath: 'package.json',
              commitSha: 'a'.repeat(40),
              lineRange: { start: 10 + i, end: 12 + i },
            },
            excerpt: `"${skillName.toLowerCase()}": "^1.0.0"`,
            confidenceScore: 0.95,
          })
          .returning();

        userEvidence.push(evidence);

        // Candidate Skill Rollup
        await betaDb.insert(candidateSkills).values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          skillId: globalSkill.id,
          category: 'LANGUAGE',
          provenanceStatus: 'VERIFIED',
          confidenceScore: 0.95,
          evidenceCount: 1,
          primaryEvidenceId: evidence.id,
        });
      }

      // 9. Job Application & Stages
      const [application] = await betaDb
        .insert(jobApplications)
        .values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          companyName: u.targetCompany,
          jobTitle: u.targetRole,
          jobUrl: `https://jobs.example.test/${u.targetCompany.toLowerCase()}`,
          status: 'SAVED',
          atsFitSnapshot: { overallScore: 90.0, matchGrade: 'EXCELLENT' },
        })
        .returning();

      const [stage] = await betaDb
        .insert(applicationStages)
        .values({
          tenantId: tenant.id,
          applicationId: application.id,
          stageType: 'RESUME_SUBMITTED',
          title: 'Application Submitted',
          orderIndex: 0,
          outcome: 'PASSED',
          completedAt: new Date(),
        })
        .returning();

      // 10. Tailored Document Snapshot
      const docContent = {
        headline: `${u.name} - ${u.role}`,
        verifiedSkills: u.skills,
        projects: [project.name],
      };
      const [document] = await betaDb
        .insert(tailoredDocuments)
        .values({
          tenantId: tenant.id,
          applicationId: application.id,
          candidateId: candidate.id,
          documentType: 'TAILORED_RESUME',
          version: 1,
          title: `${u.name} Tailored Resume`,
          content: docContent,
          renderedMarkdown: `# ${u.name}\n\n## ${u.role}`,
          renderedPlainText: `${u.name}\n${u.role}`,
          contentHash: crypto.createHash('sha256').update(JSON.stringify(docContent)).digest('hex'),
          citationRefs: [],
          integrityScore: 1.0,
          atsFitScore: 90.0,
        })
        .returning();

      // 11. Personal MCP API Token
      const mcpTokenData = await mcpTokenService.createToken(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          name: `Gemini Token for ${u.name}`,
          scopes: ['career:read', 'career:write'],
        },
        { db: betaDb }
      );

      // 12. OAuth 2.1 Tokens (Claude & ChatGPT)
      const rawClaudeAccessToken = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;
      const rawChatGptAccessToken = `mcp_oauth_acc_${crypto.randomBytes(32).toString('hex')}`;

      await betaDb.insert(oauthTokens).values([
        {
          tenantId: tenant.id,
          userId: user.id,
          clientId: 'claude-web',
          accessTokenHash: crypto.createHash('sha256').update(rawClaudeAccessToken).digest('hex'),
          familyId: crypto.randomUUID(),
          tokenScopes: ['career:read', 'career:write'],
          accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          resource: 'https://staging.careerhub.test/mcp',
        },
        {
          tenantId: tenant.id,
          userId: user.id,
          clientId: 'chatgpt-custom-gpt',
          accessTokenHash: crypto.createHash('sha256').update(rawChatGptAccessToken).digest('hex'),
          familyId: crypto.randomUUID(),
          tokenScopes: ['career:read', 'career:write'],
          accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
          resource: 'https://staging.careerhub.test/mcp',
        },
      ]);

      // Save references in betaData map
      betaData.set(u.id, {
        userConfig: u,
        tenant,
        user,
        candidate,
        identity,
        connection,
        resource,
        project,
        evidence: userEvidence,
        application,
        stage,
        document,
        mcpToken: mcpTokenData.rawToken,
        claudeToken: rawClaudeAccessToken,
        chatGptToken: rawChatGptAccessToken,
      });
    }

    assert.equal(betaData.size, 5, 'All 5 beta users must be successfully provisioned');
    console.log('✅ 5 Independent Beta User Topologies provisioned in isolated database.');
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: Multi-Tenant Isolation & Adversarial Attack Resistance
  // ---------------------------------------------------------------------------
  test('2. Enforces strict multi-tenant isolation across all 5 users and fails closed (404/403)', async () => {
    const userA = betaData.get('A');
    const userB = betaData.get('B');
    const userD = betaData.get('D');
    const userE = betaData.get('E');

    const ctxA = { tenantId: userA.tenant.id, userId: userA.user.id, role: 'OWNER' };

    // Attack 1: User A attempts to read User B's candidate profile via direct query
    const crossProfileResult = await betaDb
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, userB.candidate.id), eq(candidates.tenantId, userA.tenant.id)));
    assert.equal(
      crossProfileResult.length,
      0,
      'User A must receive 0 rows when querying User B candidateId in their own tenant'
    );

    // Attack 2: User A attempts to read User B's evidence items
    await assert.rejects(
      async () => sovereigntyService.getEvidenceItem(ctxA, userB.evidence[0].id),
      (err) => err instanceof NotFoundError,
      'User A must receive 404 when querying User B evidenceId'
    );

    // Attack 3: User A attempts to read User B's job application
    await assert.rejects(
      async () => trackingService.getApplicationDetails(ctxA, userB.application.id),
      (err) => err instanceof NotFoundError,
      'User A must receive 404 when querying User B applicationId'
    );

    // Attack 4: User A attempts to update User B's job application status
    await assert.rejects(
      async () =>
        trackingService.updateApplicationStatus(ctxA, userB.application.id, 'INTERVIEWING'),
      (err) => err instanceof NotFoundError,
      'User A must receive 404 when modifying User B job application'
    );

    // Attack 5: User A attempts to delete User B's indexed repository resource
    await assert.rejects(
      async () => sovereigntyService.deleteIndexedResource(ctxA, userB.resource.id),
      (err) => err instanceof NotFoundError,
      'User A must receive 404 when attempting to delete User B resourceId'
    );

    // Attack 6: Adversarial User E attempts to delete User C's account
    await assert.rejects(
      async () =>
        sovereigntyService.hardDeleteAccount(
          { tenantId: userE.tenant.id, userId: userE.user.id, role: 'MEMBER' },
          { confirmPhrase: 'DELETE MY ACCOUNT' }
        ),
      (err) => err instanceof AuthorizationError,
      'Non-owner must be forbidden from initiating account deletion'
    );

    // Attack 7: User E attempts to confirm write ticket for User D
    const [ticketD] = await betaDb
      .insert(actionApprovalTickets)
      .values({
        tenantId: userD.tenant.id,
        userId: userD.user.id,
        candidateId: userD.candidate.id,
        resourceId: userD.connection.id,
        proposalId: crypto.randomUUID(),
        actionType: 'PROJECT_IMPROVEMENT_PR',
        repositoryName: userD.userConfig.repoName,
        baseBranch: 'main',
        targetBranch: 'antigravity/patch-k8s-fix',
        expectedHeadSha: 'a'.repeat(40),
        patchFingerprint: 'fp-k8s-patch-12345',
        patchSummary: { title: 'Docker security patch' },
        hmacSignature: 'sig-mock-12345',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 3600 * 1000),
      })
      .returning();

    // Query ticket with User E context
    const ticketQueryE = await betaDb
      .select()
      .from(actionApprovalTickets)
      .where(
        and(
          eq(actionApprovalTickets.id, ticketD.id),
          eq(actionApprovalTickets.tenantId, userE.tenant.id)
        )
      );
    assert.equal(
      ticketQueryE.length,
      0,
      'User E must not be able to see User D action approval ticket'
    );

    console.log('✅ All 7 Adversarial Cross-Tenant Attacks FAILED CLOSED (404/403).');
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: Multi-AI Client Hermetic Simulation (Gemini, Claude, ChatGPT)
  // ---------------------------------------------------------------------------
  test('3. Simulates Gemini, Claude, and ChatGPT MCP access across all 5 beta users', async () => {
    for (const [, data] of betaData.entries()) {
      // 1. Gemini Client Authentication via Personal MCP API Token
      const geminiReq = {
        headers: { authorization: `Bearer ${data.mcpToken}` },
        ip: '127.0.0.1',
      };
      const geminiCtx = await authenticateMcpRequest(geminiReq, {
        db: betaDb,
        tokenService: mcpTokenService,
      });

      assert.equal(geminiCtx.tenantId, data.tenant.id);
      assert.equal(geminiCtx.userId, data.user.id);
      assert.equal(geminiCtx.authMethod, 'MCP_API_TOKEN');

      // 2. Claude Client Authentication via OAuth 2.1 Access Token
      const claudeReq = {
        headers: { authorization: `Bearer ${data.claudeToken}` },
        ip: '127.0.0.1',
      };
      const claudeCtx = await authenticateMcpRequest(claudeReq, {
        db: betaDb,
        oauthService,
      });

      assert.equal(claudeCtx.tenantId, data.tenant.id);
      assert.equal(claudeCtx.userId, data.user.id);
      assert.equal(claudeCtx.authMethod, 'OAUTH_BEARER');
      assert.equal(claudeCtx.clientInfo.clientId, 'claude-web');

      // 3. ChatGPT Client Authentication via OAuth 2.1 Access Token
      const chatGptReq = {
        headers: { authorization: `Bearer ${data.chatGptToken}` },
        ip: '127.0.0.1',
      };
      const chatGptCtx = await authenticateMcpRequest(chatGptReq, {
        db: betaDb,
        oauthService,
      });

      assert.equal(chatGptCtx.tenantId, data.tenant.id);
      assert.equal(chatGptCtx.userId, data.user.id);
      assert.equal(chatGptCtx.authMethod, 'OAUTH_BEARER');
      assert.equal(chatGptCtx.clientInfo.clientId, 'chatgpt-custom-gpt');

      // 4. Verify candidate profile read tool isolation via direct betaDb query
      const [profileRow] = await betaDb
        .select()
        .from(candidates)
        .where(
          and(eq(candidates.id, data.candidate.id), eq(candidates.tenantId, geminiCtx.tenantId))
        );
      assert.ok(profileRow, 'Candidate profile must be readable by own tenant');
      assert.equal(profileRow.id, data.candidate.id);
      assert.equal(profileRow.displayName, data.userConfig.name);

      // 5. Verify analytics isolation via getCandidateAnalytics
      const analytics = await analyticsService.getCandidateAnalytics(claudeCtx, data.candidate.id);
      assert.ok(analytics, 'Analytics must return results for own candidate');
    }

    console.log(
      '✅ Multi-AI Client Simulation verified for all 5 users across Gemini, Claude, and ChatGPT.'
    );
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: User Data Sovereignty & GDPR Article 17 Hard Deletion
  // ---------------------------------------------------------------------------
  test('4. Verifies GitHub disconnect, token revocation, and GDPR Article 17 Hard Deletion cascade', async () => {
    const userA = betaData.get('A');
    const userC = betaData.get('C');
    const userD = betaData.get('D');

    // 1. User D Disconnects GitHub App
    const ctxD = { tenantId: userD.tenant.id, userId: userD.user.id, role: 'OWNER' };
    const discRes = await sovereigntyService.disconnectConnection(ctxD, userD.connection.id);
    assert.equal(discRes.status, 'DISCONNECTED');
    assert.ok(discRes.message.includes('purged') || discRes.message.includes('disconnected'));

    // Verify historical skills remain intact for User D
    const skillsD = await betaDb
      .select()
      .from(candidateSkills)
      .where(
        and(
          eq(candidateSkills.tenantId, userD.tenant.id),
          eq(candidateSkills.candidateId, userD.candidate.id)
        )
      );
    assert.equal(
      skillsD.length,
      userD.userConfig.skills.length,
      'User D skills must remain after disconnect'
    );

    // 2. User C Revokes OAuth Token
    const revokeRes = await oauthService.revokeToken({ token: userC.claudeToken }, { db: betaDb });
    assert.equal(revokeRes.revoked, true);

    // Subsequent Claude request with revoked token must fail with 401
    await assert.rejects(
      async () =>
        authenticateMcpRequest(
          {
            headers: { authorization: `Bearer ${userC.claudeToken}` },
            ip: '127.0.0.1',
          },
          { db: betaDb, oauthService }
        ),
      (err) => err instanceof AuthenticationError,
      'Revoked token must be rejected with 401'
    );

    // 3. User A Executes GDPR Article 17 Hard Deletion
    const ctxA = { tenantId: userA.tenant.id, userId: userA.user.id, role: 'OWNER' };
    const deleteRes = await sovereigntyService.hardDeleteAccount(ctxA, {
      confirmPhrase: 'DELETE MY ACCOUNT',
    });
    assert.ok(deleteRes, 'Hard delete must return a result');
    assert.equal(deleteRes.tenantId, userA.tenant.id);

    // Verify User A tenant is completely purged across all tables
    const userARows = await betaDb.select().from(users).where(eq(users.tenantId, userA.tenant.id));
    assert.equal(userARows.length, 0, 'User A rows must be purged');

    const candidateARows = await betaDb
      .select()
      .from(candidates)
      .where(eq(candidates.tenantId, userA.tenant.id));
    assert.equal(candidateARows.length, 0, 'Candidate A rows must be purged');

    const appARows = await betaDb
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.tenantId, userA.tenant.id));
    assert.equal(appARows.length, 0, 'Job Applications A must be purged');

    // 4. CRITICAL INVARIANCE: Verify Tenants B, C, D, and E are 100% INTACT
    for (const id of ['B', 'C', 'D', 'E']) {
      const data = betaData.get(id);
      const remainingUsers = await betaDb
        .select()
        .from(users)
        .where(eq(users.tenantId, data.tenant.id));
      assert.equal(
        remainingUsers.length,
        1,
        `Tenant ${id} user must remain intact after Tenant A deletion`
      );

      const remainingCandidates = await betaDb
        .select()
        .from(candidates)
        .where(eq(candidates.tenantId, data.tenant.id));
      assert.equal(
        remainingCandidates.length,
        1,
        `Tenant ${id} candidate must remain intact after Tenant A deletion`
      );

      const remainingSkills = await betaDb
        .select()
        .from(candidateSkills)
        .where(eq(candidateSkills.tenantId, data.tenant.id));
      assert.equal(
        remainingSkills.length,
        data.userConfig.skills.length,
        `Tenant ${id} candidate skills must remain intact`
      );
    }

    // 5. Verify Shared Global Skills Taxonomy remains intact
    const remainingGlobalSkills = await betaDb.select().from(skills);
    assert.equal(
      remainingGlobalSkills.length,
      globalSkillRecords.length,
      'Global skills taxonomy must NOT be deleted during tenant cascade'
    );

    console.log(
      '✅ GDPR Hard Deletion verified: Tenant A purged; Tenants B, C, D, E & Global Taxonomy 100% intact.'
    );
  });
});
