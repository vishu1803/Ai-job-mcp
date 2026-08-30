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

import { eq, and, desc } from 'drizzle-orm';
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
import { renderSourcesPage } from '../views/sources.page.js';
import { renderResumesPage, renderResumeDetailPage } from '../views/resumes.page.js';
import { renderConnectPage } from '../views/connect.page.js';
import { renderSettingsPage } from '../views/settings.page.js';
import { renderMcpDocsPage } from '../views/mcp-docs.page.js';
import { sourceResumeIngestionService as defaultSourceResumeIngestionService } from '../services/source-resume-ingestion.service.js';
import { defaultMcpApiTokenService } from '../services/mcp-api-token.service.js';
import { AiConnectionStatusService } from '../services/ai-connection-status.service.js';
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
  const connectionService = opts.connectionService || defaultConnectionService;
  const resumeService = opts.resumeService || defaultSourceResumeIngestionService;
  const tokenService = opts.tokenService || defaultMcpApiTokenService;

  // -------------------------------------------------------------------------
  // 1. GET / — Public Landing Page (with JSON fallback for API clients)
  // -------------------------------------------------------------------------
  app.get('/', async (req, reply) => {
    const accept = req.headers['accept'] || '';

    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return {
        name: 'Antigravity Career Hub API',
        version: '0.1.0',
        status: 'operational',
        mcpEndpoint: '/mcp',
      };
    }

    const sessionContext = await getOptionalSession(req, database);
    const html = renderLandingPage({ user: sessionContext?.user || null });
    reply.type('text/html; charset=utf-8').send(html);
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

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    // Fetch candidate skills with skill details
    const candidateSkillList = await database
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
    const projectList = await database
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenant.id), eq(projects.candidateId, candidate.id)))
      .orderBy(desc(projects.createdAt))
      .limit(10);

    // Fetch candidate applications
    const applicationList = await database
      .select()
      .from(jobApplications)
      .where(
        and(eq(jobApplications.tenantId, tenant.id), eq(jobApplications.candidateId, candidate.id))
      )
      .orderBy(desc(jobApplications.updatedAt))
      .limit(10);

    // Fetch connected GitHub connection
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

    // Count indexed repository resources
    const resourceRows = await database
      .select({ id: resources.id })
      .from(resources)
      .where(and(eq(resources.tenantId, tenant.id), eq(resources.candidateId, candidate.id)));

    if (wantsJson) {
      return {
        message: 'Welcome to Antigravity Career Hub Dashboard',
        user: { id: user.id, displayName: user.displayName, role: user.role },
        tenant: { id: tenant.id, name: tenant.name },
        candidate: {
          id: candidate.id,
          displayName: candidate.displayName,
          headline: candidate.headline,
        },
        skillsCount: candidateSkillList.length,
        projectsCount: projectList.length,
        sourcesCount: resourceRows.length,
      };
    }

    const html = renderDashboardPage({
      user,
      tenant,
      candidate,
      skills: candidateSkillList,
      projects: projectList,
      applications: applicationList,
      connectedSourcesCount: resourceRows.length,
      gitHubConnection: gitHubConnection || null,
      aiTokensCount: 3,
    });

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
      )
      .limit(1);

    // Fetch existing selected resources
    const selectedResources = await database
      .select()
      .from(resources)
      .where(and(eq(resources.tenantId, tenant.id), eq(resources.candidateId, candidate.id)));

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
          { limit: 20 }
        );
        if (listRes && Array.isArray(listRes.items) && listRes.items.length > 0) {
          availableRepos = listRes.items.map((item) => ({
            id: item.id,
            name: item.name,
            displayName: item.displayName || item.name,
            externalResourceId: item.id,
            isPrivate: item.isPrivate || false,
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

    const html = renderOnboardingPage({
      user,
      tenant,
      candidate,
      connection: gitHubConnection || null,
      availableRepos,
      selectedRepos: selectedResources,
      currentStep: stepParam,
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

    // Upsert selected repositories as resources
    for (const key of repoKeys) {
      if (!key) continue;
      const repoName = key.includes('/') ? key : `${user.displayName || 'user'}/${key}`;
      const [existing] = await database
        .select()
        .from(resources)
        .where(
          and(
            eq(resources.tenantId, tenant.id),
            eq(resources.provider, 'GITHUB_APP'),
            eq(resources.externalResourceId, String(key))
          )
        )
        .limit(1);

      if (existing) {
        await database
          .update(resources)
          .set({ candidateId: candidate.id, status: 'ACTIVE', updatedAt: new Date() })
          .where(eq(resources.id, existing.id));
      } else {
        await database.insert(resources).values({
          tenantId: tenant.id,
          candidateId: candidate.id,
          connectionId: gitHubConnection?.id || null,
          provider: 'GITHUB_APP',
          resourceType: 'REPOSITORY',
          externalResourceId: String(key),
          name: repoName,
          displayName: repoName,
          url: `https://github.com/${repoName}`,
          isPrivate: false,
          status: 'ACTIVE',
        });
      }
    }

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, count: repoKeys.length });
    }

    return reply.redirect('/onboarding?step=4&success=Repositories+selected+for+ingestion');
  });

  // -------------------------------------------------------------------------
  // 8. POST /onboarding/sync — Execute Ingestion Pipeline
  // -------------------------------------------------------------------------
  app.post('/onboarding/sync', async (req, reply) => {
    const sessionContext = await getOptionalSession(req, database);
    if (!sessionContext) {
      return reply.redirect('/login?returnTo=/onboarding');
    }

    const { user, tenant } = sessionContext;
    const candidate = await getOrCreateCandidate(database, tenant.id, user);

    let syncResult;
    try {
      syncResult = await ingestionService.syncCandidateRepositories({
        context: { tenantId: tenant.id, userId: user.id },
        candidateId: candidate.id,
      });
    } catch (err) {
      req.log.error({ err }, 'Onboarding repository sync failed');
      const accept = req.headers['accept'] || '';
      if (accept.includes('application/json') && !accept.includes('text/html')) {
        return reply.status(500).send({ error: { message: err.message || 'Sync failed' } });
      }
      return reply.redirect(
        `/onboarding?step=4&error=${encodeURIComponent(err.message || 'Ingestion failed')}`
      );
    }

    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') && !accept.includes('text/html')) {
      return reply.send({ success: true, syncResult });
    }

    return reply.redirect('/onboarding?step=5&success=Ingestion+completed+successfully');
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
    });

    reply.type('text/html; charset=utf-8').send(html);
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
        }
      }
    }

    const html = renderSkillsPage({
      user,
      tenant,
      skills: skillRows,
    });

    reply.type('text/html; charset=utf-8').send(html);
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
}
