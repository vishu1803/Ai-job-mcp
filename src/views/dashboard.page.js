/**
 * @file Authenticated Candidate Dashboard View Template.
 *
 * Renders candidate profile summary, verified skills cloud, connected sources,
 * highlighted projects, application pipeline summary, and AI connection status.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the authenticated dashboard HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object|null} [params.candidate=null] Candidate profile if exists
 * @param {Array} [params.skills=[]] Verified candidate skills list
 * @param {Array} [params.projects=[]] Candidate projects list
 * @param {Array} [params.applications=[]] Job applications list
 * @param {number} [params.connectedSourcesCount=0] Count of connected repository resources
 * @param {number} [params.aiTokensCount=0] Count of active personal/OAuth AI tokens
 * @returns {string} Full HTML document
 */
export function renderDashboardPage({
  user,
  tenant,
  candidate = null,
  skills = [],
  projects = [],
  applications = [],
  connectedSourcesCount = 0,
  aiTokensCount = 0,
}) {
  const candidateHeadline = candidate?.headline || 'Candidate Profile Initializing';
  const candidateBio =
    candidate?.bio || 'Connect your GitHub repository to extract verified engineering evidence.';
  const verifiedCount = skills.filter((s) => s.provenanceStatus === 'VERIFIED').length;
  const claimedCount = skills.filter((s) => s.provenanceStatus === 'CLAIMED').length;

  const content = `
    <div class="container">
      <!-- Dashboard Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:32px;">
        <div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
            <h1 style="font-size:1.8rem; font-weight:800; letter-spacing:-0.02em;">
              Welcome back, ${escapeHtml(user.displayName || user.email || 'Engineer')}
            </h1>
            <span class="badge badge-indigo">${escapeHtml(tenant.tier)} TIER</span>
          </div>
          <p style="color:var(--text-muted); font-size:0.95rem;">
            ${escapeHtml(candidateHeadline)} &bull; <span style="color:var(--text-dim);">${escapeHtml(candidateBio)}</span>
          </p>
        </div>

        <div style="display:flex; gap:12px;">
          <a href="/connect" class="btn btn-secondary btn-sm">
            <span>AI Connections (${aiTokensCount})</span>
          </a>
          <a href="/docs/mcp" class="btn btn-primary btn-sm">
            <span>MCP Protocol Explorer</span>
          </a>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:32px;">
        <div class="card" style="padding:18px;">
          <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em;">Verified Skills</span>
          <div style="font-size:1.8rem; font-weight:800; color:var(--accent-emerald); margin-top:4px;">
            ${verifiedCount}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">AST & Commit Provenance</span>
        </div>

        <div class="card" style="padding:18px;">
          <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em;">Connected Sources</span>
          <div style="font-size:1.8rem; font-weight:800; color:var(--accent-cyan); margin-top:4px;">
            ${connectedSourcesCount}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Authorized GitHub Repositories</span>
        </div>

        <div class="card" style="padding:18px;">
          <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em;">Tracked Applications</span>
          <div style="font-size:1.8rem; font-weight:800; color:var(--accent-indigo); margin-top:4px;">
            ${applications.length}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Active Job Pipelines</span>
        </div>

        <div class="card" style="padding:18px;">
          <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em;">Showcase Projects</span>
          <div style="font-size:1.8rem; font-weight:800; color:var(--accent-amber); margin-top:4px;">
            ${projects.length}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Portfolio Codebases</span>
        </div>
      </div>

      <!-- Main 2-Column Grid -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px; margin-bottom:32px;">
        <!-- Left Column: Skills & Projects -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Verified Skills Section -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="font-size:1.15rem; font-weight:700;">Verified Skill Graph</h2>
              <span class="badge badge-verified">${verifiedCount} Verified / ${claimedCount} Claimed</span>
            </div>

            ${
              skills.length === 0
                ? `
              <div style="text-align:center; padding:32px 16px; background:rgba(0,0,0,0.2); border-radius:var(--radius-md);">
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:12px;">No verified skills extracted yet.</p>
                <a href="/onboarding" class="btn btn-secondary btn-sm">Connect GitHub Repositories</a>
              </div>
              `
                : `
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${skills
                  .map(
                    (s) => `
                  <span class="badge ${s.provenanceStatus === 'VERIFIED' ? 'badge-verified' : 'badge-amber'}" title="${escapeHtml(s.provenanceStatus)}">
                    ${escapeHtml(s.name || s.slug)}
                    ${s.evidenceCount ? `<small>(${s.evidenceCount})</small>` : ''}
                  </span>
                `
                  )
                  .join('')}
              </div>
              `
            }
          </div>

          <!-- Highlighted Projects Section -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h2 style="font-size:1.15rem; font-weight:700;">Ingested Code Projects</h2>
              <span style="font-size:0.8rem; color:var(--text-dim);">${projects.length} Total</span>
            </div>

            ${
              projects.length === 0
                ? `
              <div style="text-align:center; padding:32px 16px; background:rgba(0,0,0,0.2); border-radius:var(--radius-md);">
                <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:12px;">No repositories indexed for this workspace.</p>
                <a href="/onboarding" class="btn btn-secondary btn-sm">Run Repository Ingestion</a>
              </div>
              `
                : `
              <div style="display:flex; flex-direction:column; gap:12px;">
                ${projects
                  .map(
                    (p) => `
                  <div style="padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong style="font-size:0.95rem;">${escapeHtml(p.name)}</strong>
                      <span class="badge badge-cyan">AST Indexed</span>
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:4px;">
                      ${escapeHtml(p.description || 'Connected repository')}
                    </p>
                  </div>
                `
                  )
                  .join('')}
              </div>
              `
            }
          </div>
        </div>

        <!-- Right Column: AI Connectors & Applications -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- AI Integration Status -->
          <div class="card">
            <h3 style="font-size:1rem; font-weight:700; margin-bottom:16px;">AI Assistant Status</h3>
            <ul style="list-style:none; display:flex; flex-direction:column; gap:12px; font-size:0.875rem;">
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>Anthropic Claude</span>
                <span class="badge badge-indigo">OAuth 2.1 Ready</span>
              </li>
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>OpenAI ChatGPT</span>
                <span class="badge badge-verified">Custom Action</span>
              </li>
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>Google Gemini</span>
                <span class="badge badge-cyan">Personal Token</span>
              </li>
            </ul>
            <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border-subtle);">
              <a href="/connect" class="btn btn-secondary btn-sm" style="width:100%;">Manage AI Keys & Tokens</a>
            </div>
          </div>

          <!-- Application Tracking Summary -->
          <div class="card">
            <h3 style="font-size:1rem; font-weight:700; margin-bottom:12px;">Active Applications</h3>
            ${
              applications.length === 0
                ? `
              <p style="color:var(--text-dim); font-size:0.85rem;">No active applications tracked.</p>
              `
                : `
              <ul style="list-style:none; display:flex; flex-direction:column; gap:8px; font-size:0.85rem;">
                ${applications.slice(0, 5).map(
                  (a) => `
                  <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div>
                      <strong>${escapeHtml(a.companyName)}</strong>
                      <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(a.jobTitle)}</div>
                    </div>
                    <span class="badge badge-indigo">${escapeHtml(a.status)}</span>
                  </li>
                `
                )}
              </ul>
              `
            }
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Candidate Dashboard',
    content,
    activeNav: 'dashboard',
    user,
  });
}
