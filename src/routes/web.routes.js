/**
 * @file Web Application View Routes.
 *
 * Implements the human-facing web interface layer:
 * 1. GET / — Public landing page (with JSON content negotiation for API clients)
 * 2. GET /login — Human authentication portal
 * 3. GET /onboarding — Authenticated candidate setup wizard shell
 * 4. GET /dashboard — Authenticated candidate dashboard shell
 * 5. GET /connect — Authenticated AI connection center shell
 * 6. GET /settings — Authenticated account & privacy settings shell
 * 7. GET /docs/mcp — Public developer-facing MCP documentation
 *
 * Strict Invariant: POST /mcp remains purely JSON-RPC and is NEVER touched by web routes.
 */

import { eq } from 'drizzle-orm';
import { validateSession, getSessionCookieOptions } from '../security/session.service.js';
import { db as defaultDb } from '../db/index.js';
import {
  candidates,
  candidateSkills,
  projects,
  jobApplications,
  resources,
  skills,
} from '../db/schema.js';
import { config } from '../config/env.js';
import { renderLandingPage } from '../views/landing.page.js';
import { renderLoginPage } from '../views/login.page.js';
import { renderDashboardPage } from '../views/dashboard.page.js';
import { renderOnboardingPage } from '../views/onboarding.page.js';
import { renderConnectPage } from '../views/connect.page.js';
import { renderSettingsPage } from '../views/settings.page.js';
import { renderMcpDocsPage } from '../views/mcp-docs.page.js';

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
 * Fastify plugin registering web application view routes.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts
 */
export default async function webRoutes(app, opts = {}) {
  const database = opts.db || defaultDb;

  // -------------------------------------------------------------------------
  // 1. GET / — Public Landing Page (with JSON fallback for API clients)
  // -------------------------------------------------------------------------
  app.get('/', async (req, reply) => {
    const accept = req.headers['accept'] || '';

    // If client strictly requests application/json and not text/html, preserve JSON status
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
  // 4. GET /dashboard — Authenticated Candidate Dashboard Shell
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

    if (wantsJson) {
      return {
        message: 'Welcome to Antigravity Career Hub Dashboard',
        user: {
          id: user.id,
          displayName: user.displayName,
          role: user.role,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
      };
    }

    // Fetch candidate profile
    const candidateRows = await database
      .select()
      .from(candidates)
      .where(eq(candidates.userId, user.id))
      .limit(1);
    const candidate = candidateRows[0] || null;

    let candidateSkillList = [];
    let projectList = [];
    let applicationList = [];
    let connectedSourcesCount = 0;

    if (candidate) {
      // Fetch verified skills with skill names
      const skillRows = await database
        .select({
          id: candidateSkills.id,
          name: skills.name,
          slug: skills.slug,
          provenanceStatus: candidateSkills.provenanceStatus,
          evidenceCount: candidateSkills.evidenceCount,
        })
        .from(candidateSkills)
        .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
        .where(eq(candidateSkills.candidateId, candidate.id))
        .limit(30);
      candidateSkillList = skillRows;

      // Fetch projects
      const projectRows = await database
        .select()
        .from(projects)
        .where(eq(projects.candidateId, candidate.id))
        .limit(10);
      projectList = projectRows;

      // Fetch job applications
      const applicationRows = await database
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.candidateId, candidate.id))
        .limit(10);
      applicationList = applicationRows;
    }

    // Count indexed resources
    const resourceRows = await database
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.tenantId, tenant.id));
    connectedSourcesCount = resourceRows.length;

    const html = renderDashboardPage({
      user,
      tenant,
      candidate,
      skills: candidateSkillList,
      projects: projectList,
      applications: applicationList,
      connectedSourcesCount,
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

    const html = renderOnboardingPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 6. GET /connect — Authenticated AI Connection Center
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

    const html = renderConnectPage({
      user: sessionContext.user,
      tenant: sessionContext.tenant,
    });
    reply.type('text/html; charset=utf-8').send(html);
  });

  // -------------------------------------------------------------------------
  // 7. GET /settings — Authenticated Account & Privacy Settings
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
}
