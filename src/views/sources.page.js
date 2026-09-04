/**
 * @file Connected Sources View Template (P13.5-002).
 *
 * Displays connected third-party providers (GitHub App), connected repositories,
 * repository management/unlinking, and future provider previews (Phase 15).
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the Connected Sources management center.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object|null} [params.gitHubConnection=null] Active GitHub connection
 * @param {Array<object>} [params.resources=[]] Connected repository resources
 * @param {string} [params.error] Error message
 * @param {string} [params.success] Success message
 * @returns {string} Full HTML document
 */
export function renderSourcesPage({
  user,
  tenant,
  gitHubConnection = null,
  resources = [],
  error = '',
  success = '',
}) {
  const isConnected = gitHubConnection && gitHubConnection.status === 'ACTIVE';

  const content = `
    <div class="container">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Sources</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Connected Sources &amp; Ingestion Pipeline</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Multi-Provider Sovereign Ingestion</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step active">Connected Sources (GitHub App)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Authorized Repositories</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Zero Code Execution AST Scanner</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Verified Skills &amp; Projects</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Sovereign AI MCP Interface</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span class="badge badge-cyan">INTEGRATIONS &amp; SOURCES</span>
            <span class="badge badge-indigo">${escapeHtml(tenant?.name || 'Workspace')}</span>
          </div>
          <h1 style="margin:4px 0 8px 0; font-size:1.75rem; font-weight:800; letter-spacing:-0.02em;">Connected Sources Hub</h1>
          <p style="color:var(--text-muted); margin:0; font-size:0.875rem;">
            Manage authorized code repositories and external platforms supplying verified career evidence.
          </p>
        </div>

        <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
          + Select &amp; Sync Repositories
        </a>
      </div>

      <!-- Notifications -->
      ${error ? `<div class="alert alert-error"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}
      ${success ? `<div class="alert alert-success"><strong>Success:</strong> ${escapeHtml(success)}</div>` : ''}

      <!-- GitHub Connector Card -->
      <div class="card" style="padding:28px; margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px; margin-bottom:20px;">
          <div style="display:flex; gap:16px; align-items:center;">
            <div style="width:48px; height:48px; border-radius:var(--radius-md); background:var(--bg-surface-elevated, #1F2937); border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-main);">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; flex-wrap:wrap;">
                <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">GitHub App Connector</h2>
                ${
                  isConnected
                    ? '<span class="badge badge-verified">ACTIVE &amp; LINKED</span>'
                    : '<span class="badge badge-amber">DISCONNECTED</span>'
                }
              </div>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:4px 0 0 0;">
                ${
                  isConnected
                    ? `Account: <strong style="color:var(--text-main);">${escapeHtml(gitHubConnection.externalAccountName || gitHubConnection.displayName)}</strong> &bull; Installation ID: <code style="font-size:0.8rem; color:var(--accent-indigo);">${escapeHtml(gitHubConnection.installationId || 'linked')}</code>`
                    : 'Not connected. Connect GitHub to allow Career Hub to extract verified AST syntax and commit evidence.'
                }
              </p>
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            ${
              isConnected
                ? `
              <a href="/integrations/github/install" class="btn btn-secondary btn-sm">Update Permissions</a>
              <form action="/sources/disconnect" method="POST" style="display:inline;" onsubmit="return confirm('Are you sure you want to disconnect your GitHub App? This will stop syncing repositories but your existing data will be preserved.');">
                <input type="hidden" name="connectionId" value="${escapeHtml(gitHubConnection.id)}" />
                <button type="submit" class="btn btn-danger btn-sm">Disconnect</button>
              </form>
            `
                : `
              <a href="/integrations/github/install" class="btn btn-primary btn-sm">Install GitHub App →</a>
            `
            }
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; padding-top:18px; border-top:1px solid var(--border-subtle); font-size:0.85rem;">
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Permissions</span>
            <code style="display:block; margin-top:4px; font-size:0.8rem; color:var(--text-main);">contents:read, metadata:read</code>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Indexed Repositories</span>
            <strong style="color:var(--text-main); display:block; margin-top:4px;">${resources.length} ${resources.length === 1 ? 'repository' : 'repositories'}</strong>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Credential Security</span>
            <strong style="color:var(--accent-emerald); display:block; margin-top:4px;">Zero Token Exposure</strong>
          </div>
        </div>
      </div>

      <!-- Connected Repositories Section -->
      <div class="card" style="padding:28px; margin-bottom:32px;">
        <div class="section-header" style="margin-bottom:20px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Connected Repositories</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:4px; margin-bottom:0;">
              Individual codebases synchronized with Career Hub for project and skill evidence.
            </p>
          </div>
          <span class="badge badge-cyan" style="font-size:0.75rem;">${resources.length} Active</span>
        </div>

        ${
          resources.length === 0
            ? `
          <div class="empty-state">
            <div class="empty-state-icon" style="font-size:1.5rem; opacity:0.6;">∅</div>
            <h3 style="margin-top:8px;">No Repositories Connected</h3>
            <p>
              Select showcase repositories from your GitHub installation to start extracting verified evidence.
            </p>
            <a href="/onboarding?step=3" class="btn btn-primary btn-sm" style="margin-top:12px;">Select Repositories →</a>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th style="width:140px;">Type</th>
                  <th style="width:110px;">Visibility</th>
                  <th style="width:110px;">Status</th>
                  <th style="width:180px;">Last Synced</th>
                </tr>
              </thead>
              <tbody>
                ${resources
                  .map(
                    (res) => `
                  <tr>
                    <td>
                      <div style="font-weight:600; color:var(--text-main); font-size:0.875rem;">${escapeHtml(res.name || res.displayName)}</div>
                      <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:2px;">${escapeHtml(res.externalResourceId || res.name)}</div>
                    </td>
                    <td><code style="font-size:0.78rem; color:var(--text-main);">${escapeHtml(res.resourceType || 'REPOSITORY')}</code></td>
                    <td>
                      ${
                        res.isPrivate
                          ? '<span class="badge badge-amber" style="font-size:0.68rem;">PRIVATE</span>'
                          : '<span class="badge badge-cyan" style="font-size:0.68rem;">PUBLIC</span>'
                      }
                    </td>
                    <td>
                      <span class="badge badge-verified" style="font-size:0.68rem;">INDEXED</span>
                    </td>
                    <td style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono);">
                      ${res.lastSyncedAt ? new Date(res.lastSyncedAt).toLocaleString() : 'Recently'}
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
        }
      </div>

      <!-- Future Connectors Showcase (Phase 15) -->
      <div class="card" style="padding:28px;">
        <div style="margin-bottom:20px;">
          <span class="badge badge-indigo" style="margin-bottom:6px;">ROADMAP</span>
          <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Upcoming Resource Connectors (Phase 15)</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-top:4px; margin-bottom:0;">
            Additional connectors designed to continuously synchronize career evidence from external platforms.
          </p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          ${[
            {
              name: 'GitLab.com / Self-Hosted',
              desc: 'Multi-repository ingestion and AST analysis for GitLab instances.',
            },
            {
              name: 'Google Drive',
              desc: 'Continuous synchronization of candidate career documents and portfolios.',
            },
            {
              name: 'Microsoft OneDrive',
              desc: 'Enterprise document storage sync for career certification snapshots.',
            },
            {
              name: 'Notion Workspace',
              desc: 'Career portfolios and project documentation sync from Notion databases.',
            },
          ]
            .map(
              (c) => `
            <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong style="font-size:0.9rem; color:var(--text-main);">${c.name}</strong>
                <span class="badge badge-indigo" style="font-size:0.65rem;">PHASE 15</span>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.5; margin:0;">
                ${c.desc}
              </p>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Connected Sources',
    content,
    activeNav: 'sources',
    user,
  });
}
