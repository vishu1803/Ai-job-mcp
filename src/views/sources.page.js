/**
 * @file Connected Sources View Template (P90 Sources Consolidation).
 *
 * Consolidates all career document and evidence inputs into a single primary workspace:
 * 1. Active Resume (filename, active status, last uploaded date, View, Replace resume, collapsed version history)
 * 2. GitHub (connection state, external account, selected repo count, selected repositories list, Manage repositories)
 * 3. Other Sources (extensible provider cards for GitLab, Google Drive, OneDrive, LinkedIn, Portfolio labeled "Coming soon")
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';

/**
 * Formats byte count into readable string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Renders the consolidated Sources workspace.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} [params.candidate] Authenticated candidate profile
 * @param {object|null} [params.gitHubConnection=null] Active GitHub connection
 * @param {Array<object>} [params.resources=[]] Connected repository resources
 * @param {object|null} [params.activeResume=null] Active base resume record
 * @param {Array<object>} [params.previousResumes=[]] Previous resume versions
 * @param {Array<object>} [params.resumesList=[]] All candidate resumes
 * @param {string} [params.csrfToken=''] CSRF token
 * @param {string} [params.error=''] Error message
 * @param {string} [params.success=''] Success message
 * @returns {string} Full HTML document
 */
export function renderSourcesPage({
  user,
  tenant,
  candidate = null,
  gitHubConnection = null,
  resources = [],
  activeResume = null,
  previousResumes = [],
  resumeVersions = [],
  resumesList = [],
  csrfToken = '',
  error = '',
  success = '',
}) {
  const isConnected = Boolean(
    gitHubConnection &&
      (gitHubConnection.status === 'ACTIVE' || gitHubConnection.connected === true)
  );
  const repoList =
    Array.isArray(resources) && resources.length > 0
      ? resources
      : Array.isArray(gitHubConnection?.repositories)
        ? gitHubConnection.repositories
        : [];
  const versionsList =
    Array.isArray(previousResumes) && previousResumes.length > 0
      ? previousResumes
      : Array.isArray(resumeVersions) && resumeVersions.length > 0
        ? resumeVersions
        : resumesList.filter((r) => r.status !== 'ACTIVE');
  const activeFileName = activeResume?.fileName || activeResume?.filename || null;
  const connectedAccountName =
    gitHubConnection?.externalAccountName ||
    gitHubConnection?.account ||
    gitHubConnection?.displayName ||
    'Connected';

  const content = `
    <div class="container" style="max-width:1140px; margin:24px auto; padding:0 20px;">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb" style="margin-top:0.5rem; margin-bottom:1.25rem;">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Sources</span>
      </div>

      <!-- Header -->
      <div class="page-header" style="margin-bottom:28px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-indigo">Connected Sources Hub</span>
            <span class="badge badge-cyan">${escapeHtml(tenant?.name || 'Workspace')}</span>
          </div>
          <h1 style="margin:4px 0 6px 0; font-size:1.75rem; font-weight:800; letter-spacing:-0.02em; color:var(--text-main);">Career Sources &amp; Documents</h1>
          <p style="color:var(--text-muted); margin:0; font-size:0.9rem; max-width:680px; line-height:1.5;">
            Manage the authentic documents and codebases that power your candidate profile, verified skills, and job matches.
          </p>
        </div>
      </div>

      <!-- Notifications -->
      ${error ? `<div class="alert alert-error" style="margin-bottom:24px;"><strong>Error:</strong> ${escapeHtml(error)}</div>` : ''}
      ${success ? `<div class="alert alert-success" style="margin-bottom:24px;"><strong>Success:</strong> ${escapeHtml(success)}</div>` : ''}

      <!-- ================================================================= -->
      <!-- 1. ACTIVE RESUME CARD                                             -->
      <!-- ================================================================= -->
      <div class="card" style="padding:28px; margin-bottom:28px; border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--bg-surface);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
          <div style="display:flex; gap:14px; align-items:center;">
            <div style="width:48px; height:48px; border-radius:10px; background:rgba(99,102,241,0.12); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${renderIcon('resumes', { size: 24 })}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">
                  ${activeFileName ? escapeHtml(activeFileName) : 'Resume Document'}
                </h2>
                ${
                  activeResume
                    ? `<span class="badge badge-verified" style="display:inline-flex; align-items:center; gap:4px;">${renderIcon('check', { size: 11 })} <span>ACTIVE BASE RESUME</span></span>`
                    : '<span class="badge badge-amber">NO ACTIVE RESUME</span>'
                }
              </div>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:4px 0 0 0;">
                ${
                  activeResume
                    ? `Uploaded ${new Date(activeResume.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} &bull; ${formatBytes(activeResume.fileSizeBytes)} &bull; ${escapeHtml(activeResume.mimeType || 'Document')}`
                    : 'Upload your baseline resume (PDF, DOCX, TXT) to establish your career history and extract profile claims.'
                }
              </p>
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            ${
              activeResume
                ? `
              <a href="/resumes/${escapeHtml(activeResume.id)}" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                ${renderIcon('docs', { size: 14 })}
                <span>View</span>
              </a>
              <a href="/resumes/${escapeHtml(activeResume.id)}/download" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                ${renderIcon('docs', { size: 14 })}
                <span>Download</span>
              </a>
              <button type="button" class="btn btn-primary btn-sm" onclick="const el = document.getElementById('replaceResumeZone'); el.style.display = el.style.display === 'none' ? 'block' : 'none';" style="display:inline-flex; align-items:center; gap:6px;">
                ${renderIcon('arrowRight', { size: 14 })}
                <span>Replace Resume</span>
              </button>
            `
                : `
              <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('replaceResumeZone').style.display = 'block';">
                Upload Resume &rarr;
              </button>
            `
            }
          </div>
        </div>

        <!-- Inline Resume Upload Zone (Replace or Initial) -->
        <div id="replaceResumeZone" style="display:${activeResume ? 'none' : 'block'}; margin-top:20px; padding:20px; background:rgba(0,0,0,0.2); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
          <form action="/resumes/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
            <label style="display:block; font-size:0.875rem; font-weight:600; color:var(--text-main); margin-bottom:8px;">
              ${activeResume ? 'Upload New Resume Version to Replace Baseline' : 'Select Resume Document'}
            </label>
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
              <input type="file" name="resumeFile" id="resumeFileInput" accept=".pdf,.docx,.txt,.md" required class="form-control" style="flex:1; min-width:240px; background:#0B0F19;">
              <button type="submit" class="btn btn-primary btn-sm">
                ${activeResume ? 'Upload &amp; Replace' : 'Upload &amp; Parse Resume'}
              </button>
            </div>
            <p style="font-size:0.775rem; color:var(--text-dim); margin:8px 0 0 0;">Supported formats: PDF, Microsoft Word (.docx), Plain Text (.txt, .md). Maximum size: 10 MB.</p>
          </form>
        </div>

        <!-- Progressive Disclosure: Previous Versions History -->
        ${
          versionsList.length > 0
            ? `
          <details class="advanced-disclosure" style="margin-top:20px; padding-top:16px; border-top:1px solid var(--border-subtle);">
            <summary style="font-size:0.85rem; font-weight:600; color:var(--text-muted); cursor:pointer;">
              Version History (${versionsList.length} previous)
            </summary>
            <div class="table-responsive" style="margin-top:12px;">
              <table class="data-table" style="font-size:0.85rem;">
                <thead>
                  <tr>
                    <th style="width:70px;">Version</th>
                    <th>Filename</th>
                    <th style="width:90px;">Size</th>
                    <th style="width:140px;">Uploaded</th>
                    <th style="text-align:right; width:130px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${versionsList
                    .map(
                      (r) => `
                    <tr>
                      <td style="font-family:var(--font-mono); color:var(--accent-indigo); font-weight:600;">v${r.version || 1}</td>
                      <td>${escapeHtml(r.fileName || r.filename)}</td>
                      <td style="color:var(--text-muted); font-family:var(--font-mono);">${formatBytes(r.fileSizeBytes)}</td>
                      <td style="color:var(--text-dim); font-size:0.8rem;">${new Date(r.createdAt).toLocaleDateString()}</td>
                      <td style="text-align:right;">
                        <a href="/resumes/${escapeHtml(r.id)}" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.75rem;">View</a>
                        <a href="/resumes/${escapeHtml(r.id)}/download" class="btn btn-ghost btn-sm" style="padding:3px 8px; font-size:0.75rem;">Download</a>
                      </td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </details>
        `
            : ''
        }
      </div>

      <!-- ================================================================= -->
      <!-- 2. GITHUB CONNECTOR CARD & REPOSITORIES                           -->
      <!-- ================================================================= -->
      <div class="card" style="padding:28px; margin-bottom:28px; border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--bg-surface);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px; margin-bottom:20px;">
          <div style="display:flex; gap:16px; align-items:center;">
            <div style="width:48px; height:48px; border-radius:var(--radius-md); background:var(--bg-surface-elevated, #1F2937); border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--text-main);">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; flex-wrap:wrap;">
                <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">GitHub Account</h2>
                <span class="badge badge-indigo" style="font-size:0.7rem;">GitHub App Connector</span>
                ${
                  isConnected
                    ? '<span class="badge badge-verified">CONNECTED</span>'
                    : '<span class="badge badge-amber">NOT CONNECTED</span>'
                }
              </div>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:4px 0 0 0;">
                ${
                  isConnected
                    ? `Connected Account: <strong style="color:var(--text-main);">${escapeHtml(connectedAccountName)}</strong>`
                    : 'Connect your GitHub account to automatically verify your technical skills and showcase projects.'
                }
              </p>
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            ${
              isConnected
                ? `
              <a href="/onboarding?step=3&from=sources" class="btn btn-secondary btn-sm">Manage Repositories</a>
              <form action="/sources/disconnect" method="POST" style="display:inline;" onsubmit="return confirm('Are you sure you want to disconnect GitHub? Your existing evidence will be preserved.');">
                <input type="hidden" name="connectionId" value="${escapeHtml(gitHubConnection.id)}" />
                <button type="submit" class="btn btn-danger btn-sm">Disconnect</button>
              </form>
            `
                : `
              <a href="/integrations/github/install" class="btn btn-primary btn-sm">Connect GitHub App &rarr;</a>
            `
            }
          </div>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:16px; padding-top:18px; border-top:1px solid var(--border-subtle); font-size:0.85rem;">
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Access Scope</span>
            <div style="margin-top:4px; font-size:0.825rem; color:var(--text-main);">Repository Read Only</div>
            <details class="advanced-disclosure" style="margin-top:6px; border:none; background:transparent; padding:0;">
              <summary style="font-size:0.75rem; color:var(--text-dim); cursor:pointer;">Technical permissions</summary>
              <code style="display:block; margin-top:4px; font-size:0.75rem; color:var(--text-muted); background:rgba(0,0,0,0.2); padding:4px 6px; border-radius:4px;">contents:read, metadata:read</code>
            </details>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Selected Repositories</span>
            <strong style="color:var(--text-main); display:block; margin-top:4px;">${repoList.length} ${repoList.length === 1 ? 'repository' : 'repositories'}</strong>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Security</span>
            <strong style="color:var(--accent-emerald); display:block; margin-top:4px;">Secure App Installation</strong>
          </div>
        </div>

        <!-- Repositories List -->
        <div style="margin-top:24px; padding-top:20px; border-top:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0;">Selected Repositories</h3>
            ${
              isConnected
                ? `<a href="/onboarding?step=3&from=sources" class="btn btn-ghost btn-sm" style="font-size:0.8rem;">+ Add or Remove</a>`
                : ''
            }
          </div>

          ${
            repoList.length === 0
              ? `
            <div style="padding:28px 20px; text-align:center; background:rgba(255,255,255,0.02); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
              <div class="empty-state-icon" style="color:var(--text-dim); margin-bottom:8px; display:inline-flex; align-items:center; justify-content:center;">${renderIcon('sources', { size: 36 })}</div>
              <h4 style="margin:0 0 6px 0; font-size:0.95rem; font-weight:600; color:var(--text-main);">No Repositories Connected</h4>
              <p style="font-size:0.825rem; color:var(--text-muted); margin:0 0 14px 0;">
                Connect showcase repositories from your GitHub account to verify your technical capabilities.
              </p>
              ${
                isConnected
                  ? `<a href="/onboarding?step=3&from=sources" class="btn btn-secondary btn-sm">Select Repositories &rarr;</a>`
                  : `<a href="/integrations/github/install" class="btn btn-primary btn-sm">Connect GitHub &rarr;</a>`
              }
            </div>
          `
              : `
            <div class="table-responsive">
              <table class="data-table" style="font-size:0.85rem;">
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th style="width:120px;">Visibility</th>
                    <th style="width:120px;">Status</th>
                    <th style="width:160px;">Last Synced</th>
                  </tr>
                </thead>
                <tbody>
                  ${repoList
                    .map(
                      (res) => `
                    <tr>
                      <td>
                        <div style="font-weight:600; color:var(--text-main);">${escapeHtml(res.name || res.displayName)}</div>
                        <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:2px;">${escapeHtml(res.externalResourceId || res.name)}</div>
                      </td>
                      <td>
                        ${
                          res.isPrivate
                            ? '<span class="badge badge-amber" style="font-size:0.68rem;">Private</span>'
                            : '<span class="badge badge-verified" style="font-size:0.68rem;">Public</span>'
                        }
                      </td>
                      <td>
                        <span class="badge badge-verified" style="font-size:0.68rem;">Active</span>
                      </td>
                      <td style="color:var(--text-dim); font-size:0.8rem;">
                        ${res.updatedAt ? new Date(res.updatedAt).toLocaleDateString() : 'Connected'}
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
      </div>

      <!-- ================================================================= -->
      <!-- 3. OTHER SOURCES (Extensible Future Providers)                    -->
      <!-- ================================================================= -->
      <div class="card" style="padding:28px; border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--bg-surface);">
        <div style="margin-bottom:18px;">
          <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0 0 4px 0;">Additional Career Sources</h2>
          <p style="font-size:0.85rem; color:var(--text-dim); margin:0;">
            Expand your evidence base by linking additional development, document, and portfolio platforms.
          </p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          ${[
            {
              name: 'GitLab',
              desc: 'Continuous synchronization of repositories and project contributions.',
            },
            {
              name: 'Google Drive',
              desc: 'Import career certificates, recommendations, and portfolio PDFs.',
            },
            {
              name: 'Microsoft OneDrive',
              desc: 'Document synchronization for work achievements and certificates.',
            },
            {
              name: 'LinkedIn',
              desc: 'Verified recommendations and career milestone synchronization.',
            },
            {
              name: 'Portfolio / Website',
              desc: 'Live project URLs and portfolio showcase verification.',
            },
          ]
            .map(
              (c) => `
            <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                  <strong style="font-size:0.9rem; color:var(--text-main);">${c.name}</strong>
                  <span class="badge badge-indigo" style="font-size:0.65rem;">Coming soon</span>
                </div>
                <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.45; margin:0;">
                  ${c.desc}
                </p>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Career Sources',
    content,
    activeNav: 'sources',
    user,
    description: 'Manage your active resume, connected GitHub repositories, and career evidence sources.',
  });
}
