/**
 * @file Web Application View Routes (P13.5-002).
 *
 * Implements the human-facing web interface layer:
 * 1. GET / — Public landing page (with JSON content negotiation for API clients)
 * 2. GET /login — Human authentication portal
 * 3. GET /onboarding — Authenticated candidate setup wizard
 * 4. POST /onboarding/profile — Save candidate identity & specialization
 * 5. POST /onboarding/repositories/select — Save selected repositories
 * 6. POST /onboarding/sync — Trigger repository ingestion pipeline
 * 7. GET /dashboard — Authenticated candidate dashboard workspace
 * 8. GET /projects — Authenticated projects portfolio list
 * 9. GET /projects/:id — Authenticated project evidence deep inspection
 * 10. GET /skills — Authenticated verified skills taxonomy explorer
 * 11. GET /sources — Authenticated connected sources hub
 * 12. POST /sources/disconnect — Disconnect GitHub App integration
 * 13. GET /connect — Authenticated AI connection center shell
 * 14. GET /settings — Authenticated account & privacy settings shell
 * 15. GET /docs/mcp — Public developer-facing MCP documentation
 *
 * Strict Invariant: POST /mcp remains purely JSON-RPC and is NEVER touched by web routes.
 */

import { eq, and, or, desc } from 'drizzle-orm';
import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { db as defaultDb } from '../db/index.js';
import {
  candidates,
  candidateSkills,
  projects,
  jobApplications,
  resources,
  skills,
  resourceConnections,
  evidenceItems,
  projectResources,
  resumes,
} from '../db/schema.js';
import { config } from '../config/env.js';
import { CandidateRepositoryIngestionService } from '../services/candidate-repository-ingestion.service.js';
import { connectionService as defaultConnectionService } from '../services/connection.service.js';
import { connectorRegistry } from '../connectors/registry/connector-registry.js';
import { renderLandingPage } from '../views/landing.page.js';
import { renderLoginPage } from '../views/login.page.js';
import { renderDashboardPage } from '../views/dashboard.page.js';
import { renderOnboardingPage } from '../views/onboarding.page.js';
import { renderProjectsPage } from '../views/projects.page.js';
import { renderSkillsPage } from '../views/skills.page.js';
import { renderSkillDetailPage } from '../views/skill-detail.page.js';
import { renderApplicationsPage } from '../views/applications.page.js';
import { renderSourcesPage } from '../views/sources.page.js';
import { renderResumesPage, renderResumeDetailPage } from '../views/resumes.page.js';
import { renderConnectPage } from '../views/connect.page.js';
import { renderSettingsPage } from '../views/settings.page.js';
import { renderMcpDocsPage } from '../views/mcp-docs.page.js';
import { renderProfilePage } from '../views/profile.page.js';
import { renderPrivacyPage } from '../views/privacy.page.js';
import { renderCookiesPage } from '../views/cookies.page.js';
import { renderTermsPage } from '../views/terms.page.js';
import { renderSecurityPage } from '../views/security.page.js';
import { renderDataDeletionPage } from '../views/data-deletion.page.js';
import { renderAccessibilityPage } from '../views/accessibility.page.js';
import { renderSubprocessorsPage } from '../views/subprocessors.page.js';
import { renderJobFitRadarAppHtml } from '../mcp/apps/job-fit-radar.app.js';
import { renderRadarFormPage, renderRadarResultPage } from '../views/radar.page.js';
import { CandidateProfileService } from '../services/candidate-profile.service.js';
import { SkillCatalogService } from '../services/skill-catalog.service.js';
import { CandidateAdditionalSkillsService } from '../services/candidate-additional-skills.service.js';
import { logger } from '../utils/logger.js';
import { sourceResumeIngestionService as defaultSourceResumeIngestionService } from '../services/source-resume-ingestion.service.js';
import { defaultMcpApiTokenService } from '../services/mcp-api-token.service.js';
import { AiConnectionStatusService } from '../services/ai-connection-status.service.js';
import { defaultIngestionStateService } from '../services/ingestion-state.service.js';
import { NotFoundError } from '../errors/index.js';

/**
 * Extracts authenticated session context from request cookies if present.
 *
 * @param {import('fastify').FastifyRequest} req
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} db
 * @returns {Promise<{ user: object, tenant: object, session: object } | null>}
 */
async function getOptionalSession(req, db) {
  const cookieOpts = getSessionCookieOptions(config);
  let rawToken = req.cookies?.[cookieOpts.name] || req.cookies?.['career_hub_session'];

  if (!rawToken && req.headers?.cookie) {
    // Fallback header parsing
    const header = req.headers.cookie;
    const match =
      header.match(new RegExp(`(?:^|; )${cookieOpts.name}=([^;]*)`)) ||
      header.match(/(?:^|; )career_hub_session=([^;]*)/);
    if (match) {
      rawToken = decodeURIComponent(match[1]);
    }
  }

  if (!rawToken) {
    return null;
  }
  try {
    return await validateSession(db, rawToken);
  } catch {
    return null;
  }
}

/**
 * Helper to ensure a candidate record exists for the authenticated user.
 *
 * @param {import('drizzle-orm/node-postgres').NodePgDatabase} database
 * @param {string} tenantId
 * @param {object} user
 * @returns {Promise<object>} Candidate record
 */
async function getOrCreateCandidate(database, tenantId, user) {
  const [candidate] = await database
    .select()
    .from(candidates)
    .where(and(eq(candidates.tenantId, tenantId), eq(candidates.userId, user.id)))
    .limit(1);

  if (candidate) {
    return candidate;
  }

  const [newCandidate] = await database
    .insert(candidates)
    .values({
      tenantId,
      userId: user.id,
      displayName: user.displayName || user.email.split('@')[0],
      canonicalEmail: user.email,
      status: 'ACTIVE',
      profileMetadata: { userCustom: {}, systemInferred: { onboardingState: 'REGISTERED' } },
    })
    .returning();

  return newCandidate;
}

/**
 * Fastify plugin registering web application view routes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export default async function webRoutes(app, opts = {}) {
  const database = opts.db || defaultDb;
  const ingestionService =
    opts.ingestionService || new CandidateRepositoryIngestionService({ db: database });
  const ingestionStateService = opts.ingestionStateService || defaultIngestionStateService;
  const connectionService = opts.connectionService || defaultConnectionService;
  const resumeService = opts.resumeService || defaultSourceResumeIngestionService;
  const tokenService = opts.tokenService || defaultMcpApiTokenService;

  // Helper to load complete authenticated overview data
  async function loadDashboardData(sessionContext, dbInstance) {
    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(dbInstance, tenant.id, user);

    // Fetch candidate skills with skill details
    const candidateSkillList = await dbInstance
      .select({
        id: candidateSkills.id,
        name: skills.name,
        slug: skills.slug,
        category: candidateSkills.category,
        provenanceStatus: candidateSkills.provenanceStatus,
        confidenceScore: candidateSkills.confidenceScore,
        evidenceCount: candidateSkills.evidenceCount,
        primaryEvidenceId: candidateSkills.primaryEvidenceId,
        resourceDisplayName: resources.displayName,
        resourceUrl: resources.url,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .leftJoin(evidenceItems, eq(candidateSkills.primaryEvidenceId, evidenceItems.id))
      .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
      .where(
        and(eq(candidateSkills.tenantId, tenant.id), eq(candidateSkills.candidateId, candidate.id))
      )
      .orderBy(desc(candidateSkills.confidenceScore))
      .limit(30);

    // Fetch candidate projects
    const projectList = await dbInstance
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenant.id), eq(projects.candidateId, candidate.id)))
      .orderBy(desc(projects.createdAt))
      .limit(10);

    // Fetch candidate applications
    const applicationList = await dbInstance
      .select()
      .from(jobApplications)
      .where(
        and(eq(jobApplications.tenantId, tenant.id), eq(jobApplications.candidateId, candidate.id))
      )
      .orderBy(desc(jobApplications.updatedAt))
      .limit(10);

    // Fetch connected GitHub connection
    const [gitHubConnection] = await dbInstance
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.tenantId, tenant.id),
          eq(resourceConnections.provider, 'GITHUB_APP'),
          eq(resourceConnections.status, 'ACTIVE')
        )
      )
      .limit(1);

    // Count indexed repository resources
    const resourceRows = await dbInstance
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.tenantId, tenant.id), eq(resources.candidateId, candidate.id)));

    // Fetch candidate resumes
    const resumeRows = await dbInstance
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenant.id), eq(resumes.candidateId, candidate.id)))
      .orderBy(desc(resumes.createdAt))
      .limit(5);

    let aiTokensCount = 0;
    try {
      const tokenList = await tokenService.listTokens(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
        },
        { db: dbInstance }
      );
      aiTokensCount = tokenList?.length || 0;
    } catch {
      aiTokensCount = 0;
    }

    return {
      user,
      tenant,
      candidate,
      skills: candidateSkillList,
      projects: projectList,
      applications: applicationList,
      connectedSourcesCount: resourceRows.length,
      gitHubConnection: gitHubConnection || null,
      resumes: resumeRows,
      aiTokensCount,
    };
  }

  // -------------------------------------------------------------------------
  // 1. GET / — Root Overview Route (Public Landing vs Authenticated Overview)
  // -------------------------------------------------------------------------
  app.get('/', async (req, reply) => {
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (wantsJson) {
      return {
        name: 'AI Careers Hub API',
        version: '0.1.0',
        status: 'operational',
        mcpEndpoint: '/mcp',
      };
    }

    const sessionContext = await getOptionalSession(req, database);

    // Always render the landing page (public marketing & proof page).
    // Authenticated users also see this — the dashboard is at /dashboard.
    const html = renderLandingPage({
      user: sessionContext?.user || null,
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 2. GET /login — Human Authentication Portal
  // -------------------------------------------------------------------------
  app.get('/login', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const returnTo = typeof req.query?.returnTo === 'string' ? req.query.returnTo : '';
    const error = typeof req.query?.error === 'string' ? req.query.error : '';

    if (sessionContext) {
      return reply.redirect(returnTo || '/dashboard');
    }

    const html = renderLoginPage({ returnTo, error });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 3. GET /docs/mcp — Public Developer MCP Documentation
  // -------------------------------------------------------------------------
  app.get('/docs/mcp', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderMcpDocsPage({ user: sessionContext?.user || null });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 4. GET /dashboard — Authenticated Candidate Dashboard Workspace
  // -------------------------------------------------------------------------
  app.get('/dashboard', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/dashboard');
    }

    const data = await loadDashboardData(sessionContext, database);

    if (wantsJson) {
      return {
        message: 'Welcome to AI Careers Hub Dashboard',
        user: { id: data.user.id, displayName: data.user.displayName, role: data.user.role },
        tenant: { id: data.tenant.id, name: data.tenant.name },
        candidate: {
          id: data.candidate.id,
          displayName: data.candidate.displayName,
          headline: data.candidate.headline,
        },
        skillsCount: data.skills.length,
        projectsCount: data.projects.length,
        sourcesCount: data.connectedSourcesCount,
        resumesCount: data.resumes.length,
        applicationsCount: data.applications.length,
      };
    }

    const html = renderDashboardPage(data);
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 5. GET /onboarding — Authenticated Candidate Onboarding Wizard
  // -------------------------------------------------------------------------
  app.get('/onboarding', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const stepParam = parseInt(req.query?.step, 10) || 1;
    const errorMsg = req.query?.error || '';
    const successMsg = req.query?.success || '';

    // Fetch active GitHub App connection
    const [gitHubConnection] = await database
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.tenantId, tenant.id),
          eq(resourceConnections.provider, 'GITHUB_APP'),
          eq(resourceConnections.status, 'ACTIVE')
        )
      );

    // Fetch candidate's active resource selections (deduplicated by externalResourceId)
    const rawSelectedResources = await database
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, tenant.id),
          eq(resources.candidateId, candidate.id),
          eq(resources.status, 'ACTIVE')
        )
      );

    const seenResourceKeys = new Set();
    const selectedResources = [];
    for (const res of rawSelectedResources) {
      const canonicalKey = res.externalResourceId || res.name;
      if (!seenResourceKeys.has(canonicalKey)) {
        seenResourceKeys.add(canonicalKey);
        selectedResources.push(res);
      }
    }

    // Available repositories: derive from connector or selected resources
    let availableRepos = [...selectedResources];
    if (gitHubConnection && connectorRegistry.has('GITHUB_APP')) {
      try {
        const connector = connectorRegistry.get('GITHUB_APP');
        const listRes = await connector.listResources(
          {
            tenantId: tenant.id,
            userId: user.id,
            connectionId: gitHubConnection.id,
            installationId: gitHubConnection.installationId,
            connectionStatus: gitHubConnection.status,
          },
          {
            installationId: gitHubConnection.installationId,
          },
          { limit: 100 }
        );
        if (listRes && Array.isArray(listRes.items) && listRes.items.length > 0) {
          availableRepos = listRes.items.map((item) => ({
            id: String(item.id),
            externalResourceId: String(item.id),
            name: item.name,
            displayName: item.fullName || item.name,
            fullName: item.fullName || item.metadata?.fullName || item.name,
            url:
              item.url ||
              item.metadata?.htmlUrl ||
              `https://github.com/${item.fullName || item.name}`,
            isPrivate: Boolean(item.isPrivate),
            defaultBranch: item.defaultBranch || 'main',
            metadata: item.metadata || {},
          }));
        }
      } catch (err) {
        req.log.warn(
          { err },
          'Could not list external repositories from connector; using existing resources'
        );
      }
    }

    const activeIngestionRun = ingestionStateService.getRunByCandidate({
      tenantId: tenant.id,
      candidateId: candidate.id,
    });

    const html = renderOnboardingPage({
      user,
      tenant,
      candidate,
      connection: gitHubConnection || null,
      availableRepos,
      selectedRepos: selectedResources,
      currentStep: stepParam,
      ingestionRun: activeIngestionRun,
      error: errorMsg,
      success: successMsg,
    });

    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 6. POST /onboarding/profile — Save Candidate Identity & Specialization
  // -------------------------------------------------------------------------
  app.post('/onboarding/profile', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const body = req.body || {};
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const displayName = body.displayName?.trim() || candidate.displayName;
    const canonicalEmail = body.canonicalEmail?.trim() || candidate.canonicalEmail;
    const headline = body.headline?.trim() || candidate.headline;
    const summary = body.summary?.trim() || candidate.summary;
    const specialization = body.specialization || 'Full-Stack';

    const existingMetadata = candidate.profileMetadata || { userCustom: {}, systemInferred: {} };
    const updatedMetadata = {
      ...existingMetadata,
      userCustom: {
        ...(existingMetadata.userCustom || {}),
        specialization,
      },
      systemInferred: {
        ...(existingMetadata.systemInferred || {}),
        onboardingState: 'PROFILE_COMPLETED',
      },
    };

    await database
      .update(candidates)
      .set({
        displayName,
        canonicalEmail,
        headline,
        summary,
        profileMetadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(candidates.id, candidate.id), eq(candidates.tenantId, tenant.id)));

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, message: 'Profile updated successfully' });
    }

    return reply.redirect('/onboarding?step=2&success=Profile+updated+successfully');
  });

  // -------------------------------------------------------------------------
  // 7. POST /onboarding/repositories/select — Save Selected Repositories
  // -------------------------------------------------------------------------
  app.post('/onboarding/repositories/select', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const body = req.body || {};

    let repoKeys = body.repositories;
    if (typeof repoKeys === 'string') {
      repoKeys = [repoKeys];
    } else if (!Array.isArray(repoKeys)) {
      repoKeys = [];
    }
    repoKeys = repoKeys.map((k) => String(k).trim()).filter(Boolean);

    const [gitHubConnection] = await database
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.tenantId, tenant.id),
          eq(resourceConnections.provider, 'GITHUB_APP'),
          eq(resourceConnections.status, 'ACTIVE')
        )
      )
      .limit(1);

    if (!gitHubConnection) {
      return reply.redirect('/onboarding?step=2&error=GitHub+App+is+not+connected');
    }

    // Authoritative server-side validation against GitHub App installation
    let authorizedRepos = [];
    if (connectorRegistry.has('GITHUB_APP')) {
      try {
        const connector = connectorRegistry.get('GITHUB_APP');
        const listRes = await connector.listResources(
          {
            tenantId: tenant.id,
            userId: user.id,
            connectionId: gitHubConnection.id,
            installationId: gitHubConnection.installationId,
            connectionStatus: gitHubConnection.status,
          },
          {
            installationId: gitHubConnection.installationId,
          },
          { limit: 100 }
        );
        if (listRes && Array.isArray(listRes.items)) {
          authorizedRepos = listRes.items;
        }
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch authorized repositories for selection validation');
        return reply.redirect('/onboarding?step=3&error=Failed+to+validate+repository+access');
      }
    }

    // Build authorization lookup map (id, fullName, name)
    const authMap = new Map();
    for (const r of authorizedRepos) {
      authMap.set(String(r.id), r);
      if (r.fullName) authMap.set(r.fullName, r);
      if (r.name) authMap.set(r.name, r);
    }

    // Validate, deduplicate, and resolve each selected key (fail closed on unauthorized repo IDs)
    const validReposToIngest = [];
    const seenValidIds = new Set();
    for (const key of repoKeys) {
      const matched = authMap.get(key);
      if (matched && !seenValidIds.has(String(matched.id))) {
        seenValidIds.add(String(matched.id));
        validReposToIngest.push(matched);
      } else if (!matched) {
        req.log.warn(
          { key, tenantId: tenant.id },
          'Rejected unauthorized or unknown repository selection'
        );
      }
    }

    // Upsert validated repositories into resources table with canonical numeric externalResourceId
    const activeExternalIds = new Set();
    for (const repo of validReposToIngest) {
      const externalId = String(repo.id);
      activeExternalIds.add(externalId);
      const repoName = repo.fullName || repo.name;
      const repoUrl = repo.url || repo.metadata?.htmlUrl || `https://github.com/${repoName}`;

      const [existing] = await database
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.tenantId, tenant.id),
            eq(resources.provider, 'GITHUB_APP'),
            or(
              eq(resources.externalResourceId, externalId),
              eq(resources.externalResourceId, repoName),
              eq(resources.externalResourceId, repo.fullName || repoName)
            )
          )
        )
        .limit(1);

      if (existing) {
        await database
          .update(resources)
          .set({
            candidateId: candidate.id,
            connectionId: gitHubConnection.id,
            externalResourceId: externalId,
            name: repoName,
            displayName: repoName,
            url: repoUrl,
            isPrivate: Boolean(repo.isPrivate),
            status: 'ACTIVE',
            updatedAt: new Date(),
          })
          .where(eq(resources.id, existing.id));
      } else {
        await database.insert(resources).values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          connectionId: gitHubConnection.id,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: externalId,
          name: repoName,
          displayName: repoName,
          url: repoUrl,
          isPrivate: Boolean(repo.isPrivate),
          status: 'ACTIVE',
        });
      }
    }

    // Deselection: Update any previously ACTIVE resources for this candidate/connection not in activeExternalIds
    const existingActiveResources = await database
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, tenant.id),
          eq(resources.candidateId, candidate.id),
          eq(resources.provider, 'GITHUB_APP'),
          eq(resources.status, 'ACTIVE')
        )
      );

    for (const res of existingActiveResources) {
      if (!activeExternalIds.has(res.externalResourceId)) {
        await database
          .update(resources)
          .set({
            status: 'DISCONNECTED',
            updatedAt: new Date(),
          })
          .where(eq(resources.id, res.id));
      }
    }

    req.log.info(
      {
        tenantId: tenant.id,
        candidateId: candidate.id,
        receivedCount: repoKeys.length,
        validatedCount: validReposToIngest.length,
        persistedCount: activeExternalIds.size,
      },
      'Onboarding repository selection processed successfully'
    );

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, count: validReposToIngest.length });
    }

    return reply.redirect('/onboarding?step=4&success=Repositories+selected+for+ingestion');
  });

  // -------------------------------------------------------------------------
  // 8. POST /onboarding/sync — Execute Ingestion Pipeline with State Machine
  // -------------------------------------------------------------------------
  app.post('/onboarding/sync', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      const accept = req.headers['accept'] || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return reply
          .status(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    // 1. Check for active ingestion run (Server-side Idempotency & Duplicate Start Guard)
    const existingRun = ingestionStateService.getRunByCandidate({
      tenantId: tenant.id,
      candidateId: candidate.id,
    });

    if (existingRun && (existingRun.state === 'QUEUED' || existingRun.state === 'RUNNING')) {
      req.log.warn(
        {
          requestId: req.id,
          ingestionRunId: existingRun.ingestionRunId,
          tenantId: tenant.id,
          candidateId: candidate.id,
          state: existingRun.state,
        },
        'ingestion.rejected_duplicate'
      );

      const accept = req.headers['accept'] || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return reply.status(409).send({
          error: {
            code: 'INGESTION_ALREADY_RUNNING',
            message: 'An ingestion run is already actively running for this candidate',
          },
          run: existingRun,
        });
      }
      return reply.redirect('/onboarding?step=4&error=Ingestion+is+already+running');
    }

    // 2. Fetch candidate's active resource selections (Deduplicated snapshot)
    const rawSelectedResources = await database
      .select()
      .from(resources)
      .where(
        and(
          eq(resources.tenantId, tenant.id),
          eq(resources.candidateId, candidate.id),
          eq(resources.provider, 'GITHUB_APP'),
          eq(resources.status, 'ACTIVE')
        )
      );

    const seenResourceKeys = new Set();
    const activeResources = [];
    for (const res of rawSelectedResources) {
      const canonicalKey = res.externalResourceId || res.name;
      if (!seenResourceKeys.has(canonicalKey)) {
        seenResourceKeys.add(canonicalKey);
        activeResources.push(res);
      }
    }

    if (activeResources.length === 0) {
      const accept = req.headers['accept'] || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return reply.status(400).send({
          error: {
            code: 'NO_REPOSITORIES_SELECTED',
            message: 'No active repositories selected for ingestion',
          },
        });
      }
      return reply.redirect('/onboarding?step=3&error=Please+select+at+least+one+repository');
    }

    // 3. Initialize Ingestion Run with state machine & immutable snapshot
    let run;
    try {
      run = ingestionStateService.startRun({
        context: { tenantId: tenant.id, userId: user.id },
        candidateId: candidate.id,
        resources: activeResources,
      });
    } catch (err) {
      if (err.name === 'ConflictError' || err.message === 'INGESTION_ALREADY_RUNNING') {
        const accept = req.headers['accept'] || '';
        if (accept.includes('application/json') && !accept.includes('text/html')) {
          return reply.status(409).send({
            error: {
              code: 'INGESTION_ALREADY_RUNNING',
              message: 'An ingestion run is already actively running for this candidate',
            },
          });
        }
        return reply.redirect('/onboarding?step=4&error=Ingestion+is+already+running');
      }
      throw err;
    }

    // 4. Audit Log: ingestion.started
    req.log.info(
      {
        requestId: req.id,
        ingestionRunId: run.ingestionRunId,
        tenantId: tenant.id,
        candidateId: candidate.id,
        repositoryCount: activeResources.length,
      },
      'ingestion.started'
    );

    // 5. Execute AST pipeline asynchronously (server owns the lifecycle)
    const runId = run.ingestionRunId;
    const executeSync = async () => {
      try {
        const syncResult = await ingestionService.syncCandidateRepositories({
          context: { tenantId: tenant.id, userId: user.id, requestId: req.id },
          candidateId: candidate.id,
          onProgress: (event) => {
            if (event.type === 'REPOSITORY_STARTED') {
              ingestionStateService.markRepositoryRunning({
                tenantId: tenant.id,
                candidateId: candidate.id,
                resourceId: event.resource.id,
                phase: event.phase,
              });
              req.log.info(
                {
                  requestId: req.id,
                  ingestionRunId: runId,
                  tenantId: tenant.id,
                  candidateId: candidate.id,
                  repositoryId: event.resource.id,
                  repositoryName: event.resource.name,
                },
                'ingestion.repository_started'
              );
            } else if (event.type === 'PHASE_CHANGED') {
              if (event.resource) {
                ingestionStateService.updateRepositoryPhase({
                  tenantId: tenant.id,
                  candidateId: candidate.id,
                  resourceId: event.resource.id,
                  phase: event.phase,
                });
              } else {
                const current = ingestionStateService.getRunByCandidate({
                  tenantId: tenant.id,
                  candidateId: candidate.id,
                });
                if (current) current.currentPhase = event.phase;
              }
            } else if (event.type === 'REPOSITORY_COMPLETED') {
              ingestionStateService.markRepositoryCompleted({
                tenantId: tenant.id,
                candidateId: candidate.id,
                resourceId: event.resource.id,
                result: event.result,
              });
              req.log.info(
                {
                  requestId: req.id,
                  ingestionRunId: runId,
                  tenantId: tenant.id,
                  candidateId: candidate.id,
                  repositoryId: event.resource.id,
                  repositoryName: event.resource.name,
                },
                'ingestion.repository_completed'
              );
            } else if (event.type === 'REPOSITORY_FAILED') {
              ingestionStateService.markRepositoryFailed({
                tenantId: tenant.id,
                candidateId: candidate.id,
                resourceId: event.resource.id,
                error: event.error,
              });
              req.log.warn(
                {
                  requestId: req.id,
                  ingestionRunId: runId,
                  tenantId: tenant.id,
                  candidateId: candidate.id,
                  repositoryId: event.resource.id,
                  repositoryName: event.resource.name,
                  error: event.error,
                },
                'ingestion.repository_failed'
              );
            }
          },
        });

        const finalRun = ingestionStateService.finishRun({
          tenantId: tenant.id,
          candidateId: candidate.id,
          summary: syncResult,
        });

        if (finalRun.state === 'PARTIAL_FAILURE') {
          req.log.warn(
            {
              requestId: req.id,
              ingestionRunId: runId,
              tenantId: tenant.id,
              candidateId: candidate.id,
              completed: finalRun.completedRepositories,
              failed: finalRun.failedRepositories,
            },
            'ingestion.partial_failure'
          );
        } else {
          req.log.info(
            {
              requestId: req.id,
              ingestionRunId: runId,
              tenantId: tenant.id,
              candidateId: candidate.id,
              summary: syncResult,
            },
            'ingestion.completed'
          );
        }
      } catch (err) {
        req.log.error(
          {
            err,
            requestId: req.id,
            ingestionRunId: runId,
            tenantId: tenant.id,
            candidateId: candidate.id,
          },
          'ingestion.failed'
        );
        ingestionStateService.finishRun({
          tenantId: tenant.id,
          candidateId: candidate.id,
          error: err.message || 'Ingestion pipeline execution failed',
        });
      }
    };

    // Execute asynchronously in background
    executeSync().catch((err) => req.log.error({ err }, 'Background sync unhandled error'));

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.status(202).send({
        success: true,
        ingestionRunId: run.ingestionRunId,
        state: 'RUNNING',
        run,
      });
    }

    return reply.redirect('/onboarding?step=4');
  });

  // -------------------------------------------------------------------------
  // 8a. GET /onboarding/ingestion/status — Poll Ingestion Status
  // -------------------------------------------------------------------------
  app.get('/onboarding/ingestion/status', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply
        .status(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const run = ingestionStateService.getRunByCandidate({
      tenantId: tenant.id,
      candidateId: candidate.id,
    });

    if (!run) {
      return reply.send({
        ingestionRunId: null,
        state: 'IDLE',
        totalRepositories: 0,
        completedRepositories: 0,
        failedRepositories: 0,
        currentRepository: null,
        currentPhase: 'Idle',
        repositories: [],
        startedAt: null,
        completedAt: null,
        summary: null,
      });
    }

    return reply.send(run);
  });

  // -------------------------------------------------------------------------
  // 8b. POST /onboarding/ingestion/retry — Reset Ingestion Run for Retry
  // -------------------------------------------------------------------------
  app.post('/onboarding/ingestion/retry', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    ingestionStateService.resetRun({
      tenantId: tenant.id,
      candidateId: candidate.id,
    });

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, message: 'Ingestion run reset for retry' });
    }

    return reply.redirect('/onboarding?step=4');
  });

  // -------------------------------------------------------------------------
  // 9. GET /projects — Authenticated Projects Portfolio Explorer
  // -------------------------------------------------------------------------
  app.get('/projects', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/projects');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const errorMsg = req.query?.error || null;
    const successMsg = req.query?.success || null;
    const currentTab = req.query?.tab || 'active';

    const projectRows = await database
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenant.id), eq(projects.candidateId, candidate.id)))
      .orderBy(desc(projects.createdAt));

    const html = renderProjectsPage({
      user,
      tenant,
      projects: projectRows,
      selectedProject: null,
      currentTab,
      error: errorMsg,
      success: successMsg,
    });

    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 10. GET /projects/:id — Authenticated Project Detail & Evidence Inspection
  // -------------------------------------------------------------------------
  app.get('/projects/:id', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/projects');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const projectId = req.params?.id;
    const errorMsg = req.query?.error || null;
    const successMsg = req.query?.success || null;

    const [proj] = await database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenantId, tenant.id),
          eq(projects.candidateId, candidate.id)
        )
      )
      .limit(1);

    if (!proj) {
      throw new NotFoundError(`Project not found in this workspace: ${projectId}`);
    }

    // Fetch linked evidence items with skill names
    const projEvidenceRows = await database
      .select({
        id: evidenceItems.id,
        evidenceType: evidenceItems.evidenceType,
        sourceLocation: evidenceItems.sourceLocation,
        excerpt: evidenceItems.excerpt,
        confidenceScore: evidenceItems.confidenceScore,
        skillSlug: skills.slug,
        skillName: skills.name,
      })
      .from(evidenceItems)
      .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
      .where(
        and(
          eq(evidenceItems.tenantId, tenant.id),
          eq(evidenceItems.candidateId, candidate.id),
          eq(evidenceItems.projectId, proj.id)
        )
      )
      .orderBy(desc(evidenceItems.confidenceScore));

    const selectedProject = {
      ...proj,
      evidence: projEvidenceRows,
    };

    const html = renderProjectsPage({
      user,
      tenant,
      projects: [selectedProject],
      selectedProject,
      error: errorMsg,
      success: successMsg,
    });

    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 10A. POST /projects/:id/remove & POST /projects/:id/archive — Remove Project from Portfolio
  // -------------------------------------------------------------------------
  const handleRemoveProject = async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/projects');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const projectId = req.params?.id;

    const [proj] = await database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenantId, tenant.id),
          eq(projects.candidateId, candidate.id)
        )
      )
      .limit(1);

    if (!proj) {
      throw new NotFoundError(`Project not found in this workspace: ${projectId}`);
    }

    const existingMetadata = proj.metadata || {};
    const updatedMetadata = {
      ...existingMetadata,
      portfolioStatus: 'ARCHIVED',
      archivedAt: new Date().toISOString(),
    };

    await database
      .update(projects)
      .set({
        isHighlighted: false,
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, proj.id), eq(projects.tenantId, tenant.id)));

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({
        success: true,
        message: 'Project removed from Career Portfolio',
        projectId: proj.id,
      });
    }

    return reply.redirect('/projects?success=Project+removed+from+Career+Portfolio');
  };

  app.post('/projects/:id/remove', handleRemoveProject);
  app.post('/projects/:id/archive', handleRemoveProject);

  // -------------------------------------------------------------------------
  // 10B. POST /projects/:id/restore — Restore Project to Career Portfolio
  // -------------------------------------------------------------------------
  app.post('/projects/:id/restore', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/projects');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const projectId = req.params?.id;

    const [proj] = await database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenantId, tenant.id),
          eq(projects.candidateId, candidate.id)
        )
      )
      .limit(1);

    if (!proj) {
      throw new NotFoundError(`Project not found in this workspace: ${projectId}`);
    }

    const existingMetadata = proj.metadata || {};
    const updatedMetadata = {
      ...existingMetadata,
      portfolioStatus: 'ACTIVE',
      archivedAt: null,
    };

    await database
      .update(projects)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, proj.id), eq(projects.tenantId, tenant.id)));

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({
        success: true,
        message: 'Project restored to Career Portfolio',
        projectId: proj.id,
      });
    }

    return reply.redirect(`/projects/${proj.id}?success=Project+restored+to+Career+Portfolio`);
  });

  // -------------------------------------------------------------------------
  // 11. GET /skills — Authenticated Verified Skills Taxonomy Explorer
  // -------------------------------------------------------------------------
  app.get('/skills', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/skills');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const skillRows = await database
      .select({
        id: candidateSkills.id,
        skillId: candidateSkills.skillId,
        name: skills.name,
        slug: skills.slug,
        category: candidateSkills.category,
        provenanceStatus: candidateSkills.provenanceStatus,
        confidenceScore: candidateSkills.confidenceScore,
        evidenceCount: candidateSkills.evidenceCount,
        primaryEvidenceId: candidateSkills.primaryEvidenceId,
        evidenceType: evidenceItems.evidenceType,
        sourceLocation: evidenceItems.sourceLocation,
        excerpt: evidenceItems.excerpt,
        resourceDisplayName: resources.displayName,
        resourceUrl: resources.url,
        resourceName: resources.name,
        resourceProvider: resources.provider,
        lastObservedAt: candidateSkills.lastObservedAt,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .leftJoin(evidenceItems, eq(candidateSkills.primaryEvidenceId, evidenceItems.id))
      .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
      .where(
        and(eq(candidateSkills.tenantId, tenant.id), eq(candidateSkills.candidateId, candidate.id))
      )
      .orderBy(desc(candidateSkills.confidenceScore));

    // Resolve provenance fallback for any skill where primaryEvidenceId was unlinked
    for (const row of skillRows) {
      if (!row.resourceDisplayName && !row.evidenceType && row.skillId) {
        const [topEvidence] = await database
          .select({
            id: evidenceItems.id,
            evidenceType: evidenceItems.evidenceType,
            sourceLocation: evidenceItems.sourceLocation,
            excerpt: evidenceItems.excerpt,
            projectId: evidenceItems.projectId,
            resourceDisplayName: resources.displayName,
            resourceUrl: resources.url,
            resourceName: resources.name,
            resourceProvider: resources.provider,
          })
          .from(evidenceItems)
          .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
          .where(
            and(
              eq(evidenceItems.tenantId, tenant.id),
              eq(evidenceItems.candidateId, candidate.id),
              eq(evidenceItems.skillId, row.skillId)
            )
          )
          .orderBy(desc(evidenceItems.confidenceScore))
          .limit(1);

        if (topEvidence) {
          row.evidenceType = topEvidence.evidenceType;
          row.sourceLocation = topEvidence.sourceLocation;
          row.excerpt = topEvidence.excerpt;
          row.resourceDisplayName = topEvidence.resourceDisplayName;
          row.resourceUrl = topEvidence.resourceUrl;
          row.resourceName = topEvidence.resourceName;
          row.resourceProvider = topEvidence.resourceProvider;

          // If resourceId was null on evidence, resolve via projectResources
          if (!row.resourceDisplayName && topEvidence.projectId) {
            const [projRes] = await database
              .select({
                displayName: resources.displayName,
                url: resources.url,
                name: resources.name,
                provider: resources.provider,
              })
              .from(projectResources)
              .innerJoin(resources, eq(projectResources.resourceId, resources.id))
              .where(
                and(
                  eq(projectResources.tenantId, tenant.id),
                  eq(projectResources.projectId, topEvidence.projectId)
                )
              )
              .limit(1);

            if (projRes) {
              row.resourceDisplayName = projRes.displayName;
              row.resourceUrl = projRes.url;
              row.resourceName = projRes.name;
              row.resourceProvider = projRes.provider;
            }
          }
        }
      }
    }

    const context = {
      tenantId: tenant.id,
      userId: user.id,
      role: user.role,
    };

    const profile = await candidateProfileService.getCareerProfile(context, candidate.id);

    const html = renderSkillsPage({
      user,
      tenant,
      profile,
      skills: skillRows,
    });

    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 11b. GET /skills/:slug — Authenticated Skill Detail & Citations
  // -------------------------------------------------------------------------
  app.get('/skills/:slug', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect(`/login?returnTo=/skills/${encodeURIComponent(req.params.slug)}`);
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const slug = String(req.params.slug || '')
      .toLowerCase()
      .trim();

    // 1. Find the skill by slug
    const [skillRow] = await database
      .select({
        id: candidateSkills.id,
        skillId: candidateSkills.skillId,
        name: skills.name,
        slug: skills.slug,
        category: candidateSkills.category,
        provenanceStatus: candidateSkills.provenanceStatus,
        confidenceScore: candidateSkills.confidenceScore,
        evidenceCount: candidateSkills.evidenceCount,
        lastObservedAt: candidateSkills.lastObservedAt,
      })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(
        and(
          eq(candidateSkills.tenantId, tenant.id),
          eq(candidateSkills.candidateId, candidate.id),
          eq(skills.slug, slug)
        )
      )
      .limit(1);

    if (!skillRow) {
      return reply.redirect('/skills');
    }

    // 2. Fetch evidence citations for this skill
    const evidenceList = await database
      .select({
        id: evidenceItems.id,
        evidenceType: evidenceItems.evidenceType,
        sourceLocation: evidenceItems.sourceLocation,
        excerpt: evidenceItems.excerpt,
        confidenceScore: evidenceItems.confidenceScore,
        metadata: evidenceItems.metadata,
        createdAt: evidenceItems.createdAt,
        resourceName: resources.name,
        resourceDisplayName: resources.displayName,
        resourceUrl: resources.url,
      })
      .from(evidenceItems)
      .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
      .where(
        and(
          eq(evidenceItems.tenantId, tenant.id),
          eq(evidenceItems.candidateId, candidate.id),
          eq(evidenceItems.skillId, skillRow.skillId)
        )
      )
      .orderBy(desc(evidenceItems.confidenceScore))
      .limit(20);

    // 3. Fetch candidate projects
    const relatedProjects = await database
      .select({
        id: projects.id,
        name: projects.name,
        summary: projects.summary,
        headline: projects.headline,
      })
      .from(projects)
      .where(and(eq(projects.tenantId, tenant.id), eq(projects.candidateId, candidate.id)))
      .limit(5);

    const html = renderSkillDetailPage({
      user,
      tenant,
      skill: skillRow,
      evidence: evidenceList,
      relatedProjects,
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 12. GET /sources — Authenticated Connected Sources Hub
  // -------------------------------------------------------------------------
  app.get('/sources', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/sources');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const [gitHubConnection] = await database
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.tenantId, tenant.id),
          eq(resourceConnections.provider, 'GITHUB_APP'),
          eq(resourceConnections.status, 'ACTIVE')
        )
      )
      .limit(1);

    const resourceList = await database
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenant.id), eq(resources.candidateId, candidate.id)))
      .orderBy(desc(resources.createdAt));

    const html = renderSourcesPage({
      user,
      tenant,
      gitHubConnection: gitHubConnection || null,
      resources: resourceList,
      error: req.query?.error || '',
      success: req.query?.success || '',
    });

    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 13. POST /sources/disconnect — Disconnect GitHub App Integration
  // -------------------------------------------------------------------------
  app.post('/sources/disconnect', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/sources');
    }

    const { user, tenant } = sessionContext;
    const connectionId = req.body?.connectionId;

    if (connectionId) {
      try {
        await connectionService.disconnectConnection(user, tenant.id, connectionId, {
          requestId: req.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });
      } catch (err) {
        req.log.warn({ err }, 'Error disconnecting connection');
      }
    }

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, message: 'Source disconnected successfully' });
    }

    return reply.redirect('/sources?success=GitHub+App+disconnected+successfully');
  });

  // -------------------------------------------------------------------------
  // 14. GET /connect — Authenticated AI Connection Center & Token Management
  // -------------------------------------------------------------------------
  app.get('/connect', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/connect');
    }

    const { user, tenant, session } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    // List active personal tokens
    const mcpTokens = await tokenService.listTokens(
      {
        tenantId: tenant.id,
        userId: user.id,
        role: user.role,
      },
      { db: database }
    );

    // Filter only ACTIVE unexpired tokens for standard view
    const now = new Date();
    const activeTokens = mcpTokens.filter(
      (t) => t.status === 'ACTIVE' && (!t.expiresAt || new Date(t.expiresAt) > now)
    );

    const query = req.query || {};
    const newRawToken = query.rawToken ? String(query.rawToken) : '';
    const newTokenName = query.tokenName ? String(query.tokenName) : '';
    let flashMessage = '';
    if (query.revoked === 'true') {
      flashMessage = 'Personal MCP API token successfully revoked.';
    } else if (query.created === 'true') {
      flashMessage = 'New Personal MCP API token generated successfully.';
    }
    const errorMessage = query.error ? String(query.error) : '';

    const protocol = req.protocol || 'http';
    const host = req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    const aiConnectionStatusService = new AiConnectionStatusService({ database });
    const aiStatus = await aiConnectionStatusService.getConnectionStatus({
      tenantId: tenant.id,
      userId: user.id,
      baseUrl,
    });

    const html = renderConnectPage({
      user,
      tenant,
      candidate,
      mcpTokens: activeTokens,
      newRawToken,
      newTokenName,
      csrfToken: session.token,
      flashMessage,
      errorMessage,
      baseUrl,
      aiStatus,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 14a-ii. GET /api/connect/status — Safe Real-Time Connection Status API
  // -------------------------------------------------------------------------
  app.get('/api/connect/status', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Missing session cookie.',
        },
      });
    }

    const { user, tenant } = sessionContext;
    const protocol = req.protocol || 'http';
    const host = req.headers.host || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    const aiConnectionStatusService = new AiConnectionStatusService({ database });
    const status = await aiConnectionStatusService.getConnectionStatus({
      tenantId: tenant.id,
      userId: user.id,
      baseUrl,
    });

    return reply.send(status);
  });

  // -------------------------------------------------------------------------
  // 14a-iii. POST /connect/revoke-provider — Revoke Provider Authorizations
  // -------------------------------------------------------------------------
  app.post('/connect/revoke-provider', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/connect');
    }

    const { user, tenant } = sessionContext;
    const body = req.body || {};
    const provider = String(body.provider || '').trim();

    const aiConnectionStatusService = new AiConnectionStatusService({ database });
    await aiConnectionStatusService.revokeProviderConnection({
      tenantId: tenant.id,
      userId: user.id,
      provider,
    });

    return reply.redirect('/connect?revoked=true');
  });

  // -------------------------------------------------------------------------
  // 14b. POST /connect/tokens — Generate Personal MCP API Token
  // -------------------------------------------------------------------------
  app.post('/connect/tokens', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/connect');
    }

    const { user, tenant } = sessionContext;
    const body = req.body || {};

    const name = String(body.name || 'Personal Agent Token').trim();
    let scopes = ['career:read'];
    if (Array.isArray(body.scopes)) {
      scopes = body.scopes.map(String);
    } else if (typeof body.scopes === 'string') {
      scopes = [body.scopes];
    }

    let expiryDays = 30;
    if (body.expiryDays !== undefined && body.expiryDays !== '') {
      expiryDays = Number(body.expiryDays);
      if (isNaN(expiryDays)) expiryDays = 30;
    }

    try {
      const tokenResult = await tokenService.createToken(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          name,
          scopes,
          expiryDays,
          clientType: 'PERSONAL',
        },
        { db: database }
      );

      if (wantsJson) {
        return reply.status(201).send({
          success: true,
          data: {
            rawToken: tokenResult.rawToken,
            token: tokenResult.token,
          },
        });
      }

      return reply.redirect(
        `/connect?created=true&rawToken=${encodeURIComponent(tokenResult.rawToken)}&tokenName=${encodeURIComponent(tokenResult.token.name)}`
      );
    } catch (err) {
      if (wantsJson) {
        return reply.status(err.statusCode || 400).send({
          error: {
            code: err.code || 'VALIDATION_ERROR',
            message: err.message || 'Failed to generate token.',
          },
        });
      }
      return reply.redirect(
        `/connect?error=${encodeURIComponent(err.message || 'Failed to generate token.')}`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 14c. POST /connect/tokens/:id/revoke — Revoke Personal MCP API Token
  // -------------------------------------------------------------------------
  app.post('/connect/tokens/:id/revoke', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/connect');
    }

    const { user, tenant } = sessionContext;
    const tokenId = req.params?.id;

    try {
      await tokenService.revokeToken(
        {
          tenantId: tenant.id,
          userId: user.id,
          role: user.role,
          tokenId,
        },
        { db: database }
      );

      if (wantsJson) {
        return reply.send({
          success: true,
          message: 'Personal MCP API token revoked successfully.',
        });
      }

      return reply.redirect('/connect?revoked=true');
    } catch (err) {
      if (wantsJson) {
        return reply.status(err.statusCode || 404).send({
          error: {
            code: err.code || 'NOT_FOUND',
            message: err.message || 'Token not found or already revoked.',
          },
        });
      }
      return reply.redirect(
        `/connect?error=${encodeURIComponent(err.message || 'Failed to revoke token.')}`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 15. GET /settings — Authenticated Account & Privacy Settings
  // -------------------------------------------------------------------------
  app.get('/settings', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/settings');
    }

    const html = renderSettingsPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 16. GET /resumes — Source Resumes & Document Lifecycle Hub
  // -------------------------------------------------------------------------
  app.get('/resumes', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/resumes');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );
    const resumesList = await resumeService.listResumes({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      candidateId: candidate.id,
    });

    if (wantsJson) {
      return {
        success: true,
        data: resumesList,
      };
    }

    const flashMessage = req.query?.deleted
      ? 'Resume version permanently deleted from storage.'
      : '';
    const errorMessage = req.query?.error ? String(req.query.error) : '';

    const html = renderResumesPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
      candidate,
      resumesList,
      csrfToken: sessionContext.session.token,
      flashMessage,
      errorMessage,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 17. POST /resumes/upload — Multi-Format Resume Upload & Parsing
  // -------------------------------------------------------------------------
  app.post('/resumes/upload', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/resumes');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    let fileBuffer;
    let fileName = 'resume';
    let declaredMimeType = '';

    if (req.isMultipart && req.isMultipart()) {
      const part = await req.file();
      if (!part) {
        if (wantsJson) {
          return reply.status(400).send({
            error: {
              code: 'EMPTY_FILE',
              message: 'No file was provided in multipart upload',
            },
          });
        }
        return reply.redirect('/resumes?error=No+file+selected');
      }
      fileBuffer = await part.toBuffer();
      fileName = part.filename;
      declaredMimeType = part.mimetype;
    } else if (req.body && (req.body.base64Content || req.body.fileContent)) {
      // Direct JSON base64 payload
      const rawContent = req.body.base64Content || req.body.fileContent;
      fileBuffer = Buffer.from(rawContent, 'base64');
      fileName = req.body.fileName || 'resume.txt';
      declaredMimeType = req.body.mimeType || 'text/plain';
    } else {
      if (wantsJson) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Expected multipart form upload or base64 JSON payload',
          },
        });
      }
      return reply.redirect('/resumes?error=Invalid+upload+payload');
    }

    const result = await resumeService.uploadSourceResume({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      candidateId: candidate.id,
      fileBuffer,
      fileName,
      declaredMimeType,
    });

    if (wantsJson) {
      return reply.status(201).send({
        success: true,
        data: result,
      });
    }

    return reply.redirect(`/resumes/${result.resume.id}?uploaded=true`);
  });

  // -------------------------------------------------------------------------
  // 18. GET /resumes/:id — Resume Detail & Claims Review
  // -------------------------------------------------------------------------
  app.get('/resumes/:id', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect(`/login?returnTo=/resumes/${req.params.id}`);
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const details = await resumeService.getResumeDetails({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      resumeId: req.params.id,
      candidateId: candidate.id,
    });

    if (wantsJson) {
      return {
        success: true,
        data: details,
      };
    }

    const flashMessage = req.query?.uploaded
      ? 'Source resume uploaded and parsed successfully! Please review extracted claims.'
      : req.query?.approved
        ? 'Resume claims and profile narrative saved successfully.'
        : '';

    const html = renderResumeDetailPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
      candidate,
      resume: details.resume,
      sections: details.sections,
      claims: details.claims,
      csrfToken: sessionContext.session.token,
      flashMessage,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 19. POST /resumes/:id/approve — Approve Claims & Promote to Base Resume
  // -------------------------------------------------------------------------
  app.post('/resumes/:id/approve', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/resumes');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );
    const body = req.body || {};

    const rawSkills = body.approvedSkillClaims;
    const approvedSkillClaims = Array.isArray(rawSkills) ? rawSkills : rawSkills ? [rawSkills] : [];
    const promoteToBase = body.promoteToBase === 'true' || body.promoteToBase === true;

    const result = await resumeService.reviewAndApproveResume({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      resumeId: req.params.id,
      candidateId: candidate.id,
      approvedSkillClaims,
      promoteToBase,
      headline: body.headline,
      bio: body.bio,
    });

    if (wantsJson) {
      return {
        success: true,
        data: result,
      };
    }

    return reply.redirect(`/resumes/${req.params.id}?approved=true`);
  });

  // -------------------------------------------------------------------------
  // 20. GET /resumes/:id/download — Download Decrypted Source Resume
  // -------------------------------------------------------------------------
  app.get('/resumes/:id/download', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/resumes');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const { buffer, fileName, mimeType, fileSizeBytes } = await resumeService.downloadSourceResume({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      resumeId: req.params.id,
      candidateId: candidate.id,
    });

    reply
      .header('Content-Type', mimeType || 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${fileName}"`)
      .header('Content-Length', fileSizeBytes)
      .send(buffer);
  });

  // -------------------------------------------------------------------------
  // 21. POST /resumes/:id/delete — Delete Resume Version
  // -------------------------------------------------------------------------
  app.post('/resumes/:id/delete', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const accept = req.headers['accept'] || '';
    const wantsJson = accept.includes('application/json') && !accept.includes('text/html');

    if (!sessionContext) {
      if (wantsJson) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required. Missing session cookie.',
          },
        });
      }
      return reply.redirect('/login?returnTo=/resumes');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    await resumeService.deleteResumeVersion({
      context: {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: sessionContext.user.role,
      },
      resumeId: req.params.id,
      candidateId: candidate.id,
    });

    if (wantsJson) {
      return {
        success: true,
        data: { deleted: true },
      };
    }

    return reply.redirect('/resumes?deleted=true');
  });

  // -------------------------------------------------------------------------
  // 22. Career Profile & Search Intent Routes (P14-004C)
  // -------------------------------------------------------------------------
  const candidateProfileService = new CandidateProfileService(database);

  app.get('/profile', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/profile');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const context = {
      tenantId: sessionContext.tenant.id,
      userId: sessionContext.user.id,
      role: sessionContext.user.role,
    };

    const profile = await candidateProfileService.getCareerProfile(context, candidate.id);
    const flashMessage =
      req.query.saved === 'true' ? 'Career Profile and preferences saved successfully.' : '';

    // Load additional skills and catalog for inline bootstrap
    let additionalSkills = [];
    let skillCatalog = { items: [], categories: [] };
    try {
      additionalSkills = await additionalSkillsService.listAdditionalSkills(context, candidate.id);
    } catch { /* additional skills load skipped */ }
    try {
      skillCatalog = await skillCatalogService.searchSkills({ query: '', pageSize: 500 });
      skillCatalog.categories = await skillCatalogService.getCategories();
    } catch { /* skill catalog load skipped */ }

    const html = renderProfilePage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
      candidate,
      profile,
      preferences: profile.jobPreferences,
      verifiedSkills: profile.verifiedSkillsSummary,
      csrfToken: 'csrf-profile-token-2026',
      flashMessage,
      additionalSkills,
      skillCatalog,
    });

    reply.type('text/html').send(html);
  });

  app.post('/profile', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      if (req.headers.accept?.includes('application/json')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      return reply.redirect('/login?returnTo=/profile');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const context = {
      tenantId: sessionContext.tenant.id,
      userId: sessionContext.user.id,
      role: sessionContext.user.role,
    };

    const body = req.body || {};
    const parseList = (val) =>
      typeof val === 'string'
        ? val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(val)
          ? val
          : [];

    const parseJsonField = (val, fallback = null) => {
      if (typeof val === 'string' && val.trim()) {
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      }
      return val !== undefined ? val : fallback;
    };

    // Parse user profile updates
    const sectionUpdates = {
      displayName: body.displayName,
      headline: body.headline,
      summary: body.summary,
      currentRole: body.currentRole,
      location: body.location,
      careerStatus: body.careerStatus,
      currentEmployment: parseJsonField(body.currentEmployment, undefined),
      experience: parseJsonField(body.experience, undefined),
      education: parseJsonField(body.education, undefined),
      certifications: parseJsonField(body.certifications, undefined),
      languages: parseJsonField(body.languages, undefined),
      portfolioLinks: parseJsonField(body.portfolioLinks, undefined),
      jobPreferences: {
        targetRoles: parseList(body.targetRoles),
        preferredLocations: parseList(body.preferredLocations),
        remotePreference: body.remotePreference || 'FLEXIBLE',
        employmentTypes: body.employmentTypes ? parseList(body.employmentTypes) : ['FULL_TIME'],
        salaryFloor: body.salaryFloor ? Number(body.salaryFloor) : null,
        salaryCurrency: body.salaryCurrency || 'USD',
        preferredTechStack: parseList(body.preferredTechStack),
        industries: parseList(body.industries),
        companiesToPrioritize: parseList(body.companiesToPrioritize),
        companiesToAvoid: parseList(body.companiesToAvoid),
        workAuthorization: parseList(body.workAuthorization),
        visaSponsorshipRequired:
          body.visaSponsorshipRequired === 'true' || body.visaSponsorshipRequired === true,
        availabilityDate: body.availabilityDate ? String(body.availabilityDate).trim() : null,
        relocationPreference: body.relocationPreference || 'REMOTE_ONLY',
      },
    };

    const isJsonRequest =
      req.headers['accept']?.includes('application/json') ||
      req.headers['content-type']?.includes('application/json');

    // For JSON/AJAX saves: use minimal response mode to skip expensive getCareerProfile rebuild
    const updatedProfile = await candidateProfileService.updateUserProfileSections(
      context,
      candidate.id,
      sectionUpdates,
      isJsonRequest ? { minimalResponse: true } : null
    );

    if (isJsonRequest) {
      return reply.status(200).send({
        ok: true,
        saved: true,
        updatedAt: updatedProfile.updatedAt,
        displayName: updatedProfile.displayName,
        candidateId: updatedProfile.candidateId,
      });
    }

    // Legacy HTML form submission: full profile rebuild + redirect
    return reply.redirect('/profile?saved=true');
  });

  app.post('/profile/clear-preferences', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/profile');
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const context = {
      tenantId: sessionContext.tenant.id,
      userId: sessionContext.user.id,
      role: sessionContext.user.role,
    };

    await candidateProfileService.updateCareerPreferences(context, candidate.id, {
      targetRoles: [],
      preferredLocations: [],
      remotePreference: 'FLEXIBLE',
      employmentTypes: ['FULL_TIME'],
      salaryFloor: null,
      salaryCurrency: 'USD',
      preferredTechStack: [],
      industries: [],
      companiesToPrioritize: [],
      companiesToAvoid: [],
      workAuthorization: [],
      visaSponsorshipRequired: false,
      availabilityDate: null,
      relocationPreference: 'REMOTE_ONLY',
    });

    return reply.redirect('/profile?saved=true');
  });

  // -------------------------------------------------------------------------
  // 22a-i. Profile Bootstrap API (single request for all profile data)
  // -------------------------------------------------------------------------
  const skillCatalogService = new SkillCatalogService(database);
  const additionalSkillsService = new CandidateAdditionalSkillsService(database);

  app.get('/api/profile/bootstrap', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const context = {
      tenantId: sessionContext.tenant.id,
      userId: sessionContext.user.id,
      role: sessionContext.user.role,
    };

    // Get full career profile (includes education, experience, preferences, skills, etc.)
    const profile = await candidateProfileService.getCareerProfile(context, candidate.id);

    // Get additional skills (self-declared)
    let additionalSkills = [];
    try {
      additionalSkills = await additionalSkillsService.listAdditionalSkills(context, candidate.id);
    } catch (err) {
      logger.debug({ err, candidateId: candidate.id }, 'Additional skills load skipped during bootstrap');
    }

    // Get full skill catalog for client-side search
    let skillCatalog = { items: [], categories: [] };
    try {
      skillCatalog = await skillCatalogService.searchSkills({ query: '', pageSize: 500 });
      const categories = await skillCatalogService.getCategories();
      skillCatalog.categories = categories;
    } catch (err) {
      logger.debug({ err }, 'Skill catalog load skipped during bootstrap');
    }

    const userCustom = candidate.profileMetadata?.userCustom || {};
    const jobPrefs = profile.jobPreferences || {};

    // Build the canonical bootstrap DTO
    const bootstrap = {
      profile: {
        candidateId: candidate.id,
        displayName: candidate.displayName || sessionContext.user.displayName || '',
        headline: candidate.headline || userCustom.headline || '',
        summary: candidate.summary || userCustom.summary || '',
        currentRole: profile.currentRole || userCustom.currentRole || '',
        location: profile.location || userCustom.location || '',
        careerStatus: profile.careerStatus || userCustom.careerStatus || 'FRESHER',
        currentEmployment: userCustom.currentEmployment || null,
        experience: userCustom.experience || [],
        education: userCustom.education || [],
        certifications: userCustom.certifications || [],
        languages: userCustom.languages || [],
        portfolioLinks: userCustom.portfolioLinks || [],
      },
      preferences: {
        targetRoles: jobPrefs.targetRoles || [],
        preferredLocations: jobPrefs.preferredLocations || [],
        remotePreference: jobPrefs.remotePreference || 'FLEXIBLE',
        employmentTypes: jobPrefs.employmentTypes || ['FULL_TIME'],
        salaryFloor: jobPrefs.salaryFloor || null,
        salaryCurrency: jobPrefs.salaryCurrency || 'USD',
        preferredTechStack: jobPrefs.preferredTechStack || [],
        industries: jobPrefs.industries || [],
        companiesToPrioritize: jobPrefs.companiesToPrioritize || [],
        companiesToAvoid: jobPrefs.companiesToAvoid || [],
        workAuthorization: jobPrefs.workAuthorization || [],
        visaSponsorshipRequired: jobPrefs.visaSponsorshipRequired || false,
        availabilityDate: jobPrefs.availabilityDate || null,
        relocationPreference: jobPrefs.relocationPreference || 'REMOTE_ONLY',
      },
      skills: {
        evidenceBacked: (profile.primarySkills || []).concat(profile.technologySignals || []),
        additional: additionalSkills,
      },
      skillCatalog: {
        items: skillCatalog.items || [],
        categories: skillCatalog.categories || [],
      },
      meta: {
        updatedAt: candidate.updatedAt ? new Date(candidate.updatedAt).toISOString() : new Date().toISOString(),
      },
    };

    return reply.status(200).send(bootstrap);
  });

  // -------------------------------------------------------------------------
  // 22a-ii. Profile PATCH (batched save — JSON only, no redirect)
  // -------------------------------------------------------------------------
  app.patch('/api/profile', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const candidate = await getOrCreateCandidate(
      database,
      sessionContext.tenant.id,
      sessionContext.user
    );

    const context = {
      tenantId: sessionContext.tenant.id,
      userId: sessionContext.user.id,
      role: sessionContext.user.role,
    };

    const body = req.body || {};
    const sections = body.sections || {};

    // Build sectionUpdates from only the sections provided
    const sectionUpdates = {};

    if (sections.identity) {
      Object.assign(sectionUpdates, {
        displayName: sections.identity.displayName,
        headline: sections.identity.headline,
        summary: sections.identity.summary,
        currentRole: sections.identity.currentRole,
        location: sections.identity.location,
        careerStatus: sections.identity.careerStatus,
      });
    }

    if (sections.currentEmployment !== undefined) {
      sectionUpdates.currentEmployment = sections.currentEmployment;
    }

    if (sections.experience !== undefined) {
      sectionUpdates.experience = sections.experience;
    }

    if (sections.education !== undefined) {
      sectionUpdates.education = sections.education;
    }

    if (sections.certifications !== undefined) {
      sectionUpdates.certifications = sections.certifications;
    }

    if (sections.languages !== undefined) {
      sectionUpdates.languages = sections.languages;
    }

    if (sections.portfolioLinks !== undefined) {
      sectionUpdates.portfolioLinks = sections.portfolioLinks;
    }

    if (sections.preferences) {
      const prefs = sections.preferences;
      sectionUpdates.jobPreferences = {
        targetRoles: prefs.targetRoles || [],
        preferredLocations: prefs.preferredLocations || [],
        remotePreference: prefs.remotePreference || 'FLEXIBLE',
        employmentTypes: prefs.employmentTypes || ['FULL_TIME'],
        salaryFloor: prefs.salaryFloor != null ? Number(prefs.salaryFloor) : null,
        salaryCurrency: prefs.salaryCurrency || 'USD',
        preferredTechStack: prefs.preferredTechStack || [],
        industries: prefs.industries || [],
        companiesToPrioritize: prefs.companiesToPrioritize || [],
        companiesToAvoid: prefs.companiesToAvoid || [],
        workAuthorization: prefs.workAuthorization || [],
        visaSponsorshipRequired: prefs.visaSponsorshipRequired || false,
        availabilityDate: prefs.availabilityDate || null,
        relocationPreference: prefs.relocationPreference || 'REMOTE_ONLY',
      };
    }

    // Handle additional skills separately via domain service
    let additionalSkillsResult = null;
    if (sections.additionalSkills) {
      try {
        await additionalSkillsService.setAdditionalSkills(
          context,
          candidate.id,
          sections.additionalSkills
        );
        additionalSkillsResult = 'ok';
      } catch (err) {
        logger.error({ err, candidateId: candidate.id }, 'Additional skills update failed');
        return reply.status(err.statusCode || 400).send({
          ok: false,
          error: err.message || 'Failed to update additional skills',
          section: 'additionalSkills',
        });
      }
    }

    // Save profile sections via existing service
    const updatedProfile = await candidateProfileService.updateUserProfileSections(
      context,
      candidate.id,
      sectionUpdates,
      { minimalResponse: true }
    );

    return reply.status(200).send({
      ok: true,
      saved: true,
      updatedAt: updatedProfile.updatedAt ? new Date(updatedProfile.updatedAt).toISOString() : new Date().toISOString(),
      displayName: updatedProfile.displayName,
      candidateId: updatedProfile.candidateId,
      additionalSkills: additionalSkillsResult,
    });
  });

  // -------------------------------------------------------------------------
  // 22b. Job Applications Tracker Routes (P14-003A / ARCH-043)
  // -------------------------------------------------------------------------
  app.get('/applications', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/applications');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const filter = String(req.query.filter || 'ALL').toUpperCase();

    const applicationList = await database
      .select()
      .from(jobApplications)
      .where(
        and(eq(jobApplications.tenantId, tenant.id), eq(jobApplications.candidateId, candidate.id))
      )
      .orderBy(desc(jobApplications.updatedAt));

    const html = renderApplicationsPage({
      user,
      tenant,
      applications: applicationList,
      activeFilter: filter,
      flashMessage: req.query.success || '',
      errorMessage: req.query.error || '',
    });

    return reply.type('text/html; charset=utf-8').send(html);
  });

  app.post('/applications', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/applications');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    const body = req.body || {};
    const companyName = body.companyName ? String(body.companyName).trim() : '';
    const jobTitle = body.jobTitle ? String(body.jobTitle).trim() : '';

    if (!companyName || !jobTitle) {
      return reply.redirect('/applications?error=Company+name+and+job+title+are+required');
    }

    await database.insert(jobApplications).values({
      tenantId: tenant.id,
      candidateId: candidate.id,
      companyName,
      jobTitle,
      status: body.status || 'APPLIED',
      salaryRange: body.salaryRange ? String(body.salaryRange).trim() : null,
      jobUrl: body.jobUrl ? String(body.jobUrl).trim() : null,
      location: body.location ? String(body.location).trim() : null,
      metadata: {},
    });

    return reply.redirect('/applications?success=Application+successfully+tracked');
  });

  app.post('/applications/:id/status', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/applications');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);
    const appId = req.params.id;
    const newStatus = req.body?.status;

    if (newStatus) {
      await database
        .update(jobApplications)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(jobApplications.id, appId),
            eq(jobApplications.tenantId, tenant.id),
            eq(jobApplications.candidateId, candidate.id)
          )
        );
    }

    return reply.redirect('/applications?success=Application+status+updated');
  });

  // -------------------------------------------------------------------------
  // 22c. GET /apps/radar — Job Fit Radar Form Page
  // -------------------------------------------------------------------------
  app.get('/apps/radar', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/apps/radar');
    }

    const html = renderRadarFormPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
      error: req.query.error || null,
    });
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // 22d. POST /apps/radar — Run Job Fit Analysis
  app.post('/apps/radar', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/apps/radar');
    }

    const { jobDescriptionText, jobTitle, companyName, targetRoleLevel, maxSkillGaps } =
      req.body || {};

    if (!jobDescriptionText || jobDescriptionText.trim().length < 50) {
      const html = renderRadarFormPage({
        user: sessionContext.user,
        tenant: sessionContext.tenant,
        error: 'Job description must be at least 50 characters. Please paste the full job posting.',
      });
      return reply.type('text/html; charset=utf-8').send(html);
    }

    try {
      // Build a fake MCP context for the analysis service
      const context = {
        tenantId: sessionContext.tenant.id,
        userId: sessionContext.user.id,
        role: 'OWNER',
        scopes: ['career:read'],
      };

      // Import analysis services
      const { handleAnalyzeJobFit } = await import('../mcp/tools/career-read-tools.js');

      const analysisResult = await handleAnalyzeJobFit(context, {
        jobDescriptionText: jobDescriptionText.trim(),
        jobTitle: jobTitle || undefined,
        companyName: companyName || undefined,
        targetRoleLevel: targetRoleLevel || undefined,
        maxSkillGaps: maxSkillGaps ? parseInt(maxSkillGaps, 10) : undefined,
      });

      // Extract the structured data from MCP response format
      const analysisData = analysisResult?.structuredData || analysisResult;

      const html = renderRadarResultPage({
        user: sessionContext.user,
        tenant: sessionContext.tenant,
        analysisData,
      });
      return reply.type('text/html; charset=utf-8').send(html);
    } catch (err) {
      const errorMessage = err?.message || 'An unexpected error occurred during analysis.';
      const html = renderRadarResultPage({
        user: sessionContext.user,
        tenant: sessionContext.tenant,
        analysisData: null,
        error: `Analysis failed: ${errorMessage}`,
      });
      return reply.type('text/html; charset=utf-8').send(html);
    }
  });

  // 22e. GET /apps/radar/mcp — MCP App HTML Widget (standalone iframe for AI clients)
  app.get('/apps/radar/mcp', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/apps/radar/mcp');
    }

    const html = renderJobFitRadarAppHtml();
    return reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 23. Public Legal & Compliance Routes (P14-004C)
  // -------------------------------------------------------------------------
  app.get('/privacy', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderPrivacyPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/cookies', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderCookiesPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/terms', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderTermsPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/security', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderSecurityPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/data-deletion', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderDataDeletionPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/accessibility', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderAccessibilityPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });

  app.get('/subprocessors', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    const html = renderSubprocessorsPage({
      user: sessionContext?.user || null,
      tenant: sessionContext?.tenant || null,
    });
    reply.type('text/html').send(html);
  });
}
