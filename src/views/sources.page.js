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
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-cyan">INTEGRATIONS & SOURCES</span>
            <span class="badge badge-indigo">${escapeHtml(tenant?.name || 'Workspace')}</span>
          </div>
          <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em;">Connected Sources Hub</h1>
          <p style="color:var(--text-muted); font-size:0.95rem; margin-top:4px;">
            Manage authorized code repositories and external platforms supplying verified career evidence.
          </p>
        </div>

        <div style="display:flex; gap:10px;">
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
            <span>+ Select & Sync Repositories</span>
          </a>
        </div>
      </div>

      <!-- Notifications -->
      ${
        error
          ? `
        <div style="background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.3); border-radius:var(--radius-md); padding:14px 18px; margin-bottom:24px; color:#FECDD3; font-size:0.9rem;">
          <strong>Error:</strong> ${escapeHtml(error)}
        </div>
      `
          : ''
      }
      ${
        success
          ? `
        <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:14px 18px; margin-bottom:24px; color:#A7F3D0; font-size:0.9rem;">
          <strong>Success:</strong> ${escapeHtml(success)}
        </div>
      `
          : ''
      }

      <!-- GitHub Connector Card -->
      <div class="card" style="padding:28px; margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px; margin-bottom:20px;">
          <div style="display:flex; gap:16px; align-items:center;">
            <div style="width:52px; height:52px; border-radius:14px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                <h2 style="font-size:1.25rem; font-weight:700;">GitHub App Connector</h2>
                ${
                  isConnected
                    ? '<span class="badge badge-verified">ACTIVE & LINKED</span>'
                    : '<span class="badge badge-amber">DISCONNECTED</span>'
                }
              </div>
              <p style="font-size:0.875rem; color:var(--text-muted);">
                ${
                  isConnected
                    ? `Account: <strong>${escapeHtml(gitHubConnection.externalAccountName || gitHubConnection.displayName)}</strong> &bull; Installation ID: <code>${escapeHtml(gitHubConnection.installationId || 'linked')}</code>`
                    : 'Not connected. Connect GitHub to allow Career Hub to extract verified AST syntax and commit evidence.'
                }
              </p>
            </div>
          </div>

          <div style="display:flex; gap:10px;">
            ${
              isConnected
                ? `
              <a href="/integrations/github/install" class="btn btn-secondary btn-sm">Update Permissions</a>
              <form action="/sources/disconnect" method="POST" style="display:inline;" onsubmit="return confirm('Are you sure you want to disconnect your GitHub App?');">
                <input type="hidden" name="connectionId" value="${escapeHtml(gitHubConnection.id)}" />
                <button type="submit" class="btn btn-secondary btn-sm" style="color:var(--accent-rose);">Disconnect</button>
              </form>
            `
                : `
              <a href="/integrations/github/install" class="btn btn-primary btn-sm">Install GitHub App →</a>
            `
            }
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; padding-top:16px; border-top:1px solid var(--border-subtle); font-size:0.85rem;">
          <div>
            <span style="color:var(--text-dim);">Permissions:</span>
            <strong style="color:var(--text-main); display:block; margin-top:2px;">contents:read, metadata:read</strong>
          </div>
          <div>
            <span style="color:var(--text-dim);">Indexed Repositories:</span>
            <strong style="color:var(--text-main); display:block; margin-top:2px;">${resources.length} repositories</strong>
          </div>
          <div>
            <span style="color:var(--text-dim);">Credential Security:</span>
            <strong style="color:var(--accent-emerald); display:block; margin-top:2px;">Zero Token Exposure</strong>
          </div>
        </div>
      </div>

      <!-- Connected Repositories Section -->
      <div class="card" style="padding:28px; margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700;">Connected Repositories</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">
              Individual codebases synchronized with Career Hub for project genesis and skill provenance.
            </p>
          </div>
          <span style="font-size:0.85rem; color:var(--text-muted);">${resources.length} Active</span>
        </div>

        ${
          resources.length === 0
            ? `
          <div style="text-align:center; padding:40px 20px; background:rgba(0,0,0,0.2); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
            <div style="font-size:2rem; margin-bottom:8px;">📦</div>
            <h3 style="font-size:1.05rem; font-weight:700; margin-bottom:4px;">No Repositories Connected</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); max-width:440px; margin:0 auto 16px;">
              Select showcase repositories from your GitHub installation to start extracting verified evidence.
            </p>
            <a href="/onboarding?step=3" class="btn btn-primary btn-sm">Select Repositories →</a>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Type</th>
                  <th>Visibility</th>
                  <th>Status</th>
                  <th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                ${resources
                  .map(
                    (res) => `
                  <tr>
                    <td>
                      <div style="font-weight:700; color:var(--text-main);">${escapeHtml(res.name || res.displayName)}</div>
                      <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">${escapeHtml(res.externalResourceId || res.name)}</div>
                    </td>
                    <td><code>${escapeHtml(res.resourceType || 'REPOSITORY')}</code></td>
                    <td>
                      ${
                        res.isPrivate
                          ? '<span class="badge badge-amber">PRIVATE</span>'
                          : '<span class="badge badge-cyan">PUBLIC</span>'
                      }
                    </td>
                    <td>
                      <span class="badge badge-verified">INDEXED</span>
                    </td>
                    <td style="font-size:0.8rem; color:var(--text-muted);">
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
        <div style="margin-bottom:18px;">
          <span class="badge badge-indigo" style="margin-bottom:4px;">ROADMAP</span>
          <h2 style="font-size:1.15rem; font-weight:700;">Upcoming Resource Connectors (Phase 15)</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">
            Additional enterprise and cloud connectors designed to continuously synchronize career evidence.
          </p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); opacity:0.8;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:0.95rem;">GitLab.com / Self-Hosted</strong>
              <span class="badge badge-indigo" style="font-size:0.65rem;">PHASE 15</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted);">
              Multi-repository ingestion and AST analysis for GitLab instances.
            </p>
          </div>

          <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); opacity:0.8;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:0.95rem;">Google Drive</strong>
              <span class="badge badge-indigo" style="font-size:0.65rem;">PHASE 15</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted);">
              Continuous synchronization of candidate career documents and portfolios.
            </p>
          </div>

          <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); opacity:0.8;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:0.95rem;">Microsoft OneDrive</strong>
              <span class="badge badge-indigo" style="font-size:0.65rem;">PHASE 15</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted);">
              Enterprise document storage sync for career certification snapshots.
            </p>
          </div>

          <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); opacity:0.8;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:0.95rem;">Notion Workspace</strong>
              <span class="badge badge-indigo" style="font-size:0.65rem;">PHASE 15</span>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted);">
              Career portfolios and project documentation sync from Notion databases.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Connected Sources — Antigravity Career Hub',
    content,
    activeNav: 'sources',
    user,
  });
}
