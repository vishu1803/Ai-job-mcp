/**
 * @file Projects & Evidence Inspection View Template (P13.5-002 & Step 1C).
 *
 * Renders portfolio project cards, project metadata, deep evidence inspection
 * with commit SHAs, file paths, syntax tree provenance, and user-facing
 * Career Portfolio removal / restoration lifecycle actions.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the Projects listing or Project detail inspection page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {Array<object>} [params.projects=[]] Project list
 * @param {object|null} [params.selectedProject=null] Specific project to inspect in detail
 * @param {string} [params.currentTab='active'] Current filter tab ('active' or 'archived')
 * @param {string|null} [params.error=null] Error message if any
 * @param {string|null} [params.success=null] Success message if any
 * @returns {string} Full HTML document
 */
export function renderProjectsPage({
  user,
  tenant,
  projects = [],
  selectedProject = null,
  currentTab = 'active',
  error = null,
  success = null,
}) {
  const isDetail = Boolean(selectedProject);

  const content = isDetail
    ? renderProjectDetail({ selectedProject, user, tenant, error, success })
    : renderProjectsList({ projects, user, tenant, currentTab, error, success });

  return renderLayout({
    title: isDetail ? `${selectedProject.name} — Project Inspection` : 'Portfolio Projects',
    content,
    activeNav: 'projects',
    user,
  });
}

function isProjectArchived(p) {
  return p.metadata?.portfolioStatus === 'ARCHIVED' || p.metadata?.isArchived === true;
}

function renderProjectsList({ projects, currentTab, error, success }) {
  const activeProjects = projects.filter((p) => !isProjectArchived(p));
  const archivedProjects = projects.filter((p) => isProjectArchived(p));
  const displayedProjects = currentTab === 'archived' ? archivedProjects : activeProjects;

  return `
    <div class="container">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Projects</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Project & Portfolio Knowledge Pipeline</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Deterministic AST Extraction</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step"><span>📦</span> Repository Resources</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🔍</span> Code Trees & Manifests</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active"><span>💼</span> Verified Projects</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>📎</span> AST Evidence Citations</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🤖</span> AI Context Integration</div>
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

      <div class="page-header">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:6px;">PORTFOLIO & EVIDENCE</span>
          <h1>Projects & Code Evidence</h1>
          <p>
            Evidence-grounded project records constructed from your connected repository AST syntax trees.
          </p>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
            + Ingest New Repositories
          </a>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div style="display:flex; gap:10px; margin-bottom:24px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
        <a
          href="/projects?tab=active"
          style="padding:6px 14px; border-radius:var(--radius-sm); font-size:0.875rem; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:6px; background:${currentTab !== 'archived' ? 'rgba(99,102,241,0.15)' : 'transparent'}; color:${currentTab !== 'archived' ? '#C7D2FE' : 'var(--text-muted)'}; border:1px solid ${currentTab !== 'archived' ? 'rgba(99,102,241,0.3)' : 'transparent'};"
        >
          <span>Active Portfolio Projects</span>
          <span class="badge ${currentTab !== 'archived' ? 'badge-indigo' : ''}" style="font-size:0.7rem;">${activeProjects.length}</span>
        </a>
        <a
          href="/projects?tab=archived"
          style="padding:6px 14px; border-radius:var(--radius-sm); font-size:0.875rem; font-weight:600; text-decoration:none; display:flex; align-items:center; gap:6px; background:${currentTab === 'archived' ? 'rgba(251,191,36,0.15)' : 'transparent'}; color:${currentTab === 'archived' ? '#FDE68A' : 'var(--text-muted)'}; border:1px solid ${currentTab === 'archived' ? 'rgba(251,191,36,0.3)' : 'transparent'};"
        >
          <span>Archived / Hidden</span>
          <span class="badge ${currentTab === 'archived' ? 'badge-amber' : ''}" style="font-size:0.7rem;">${archivedProjects.length}</span>
        </a>
      </div>

      ${
        displayedProjects.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">${currentTab === 'archived' ? '📦' : '📁'}</div>
          <h3>${currentTab === 'archived' ? 'No Archived Projects' : 'No Active Projects Ingested Yet'}</h3>
          <p>
            ${
              currentTab === 'archived'
                ? 'Projects removed from your Career Portfolio appear here and can be restored at any time.'
                : 'Connect your GitHub repositories in the onboarding wizard to automatically generate verified project artifacts.'
            }
          </p>
          ${
            currentTab === 'archived'
              ? '<a href="/projects?tab=active" class="btn btn-secondary btn-sm">View Active Projects →</a>'
              : '<a href="/onboarding?step=3" class="btn btn-primary btn-sm">Start Repository Ingestion →</a>'
          }
        </div>
      `
          : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:20px;">
          ${displayedProjects
            .map((p) => {
              const archived = isProjectArchived(p);
              return `
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; ${archived ? 'opacity:0.85; border-color:rgba(251,191,36,0.3);' : ''}">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                  <h3 style="font-size:1.1rem; font-weight:700; color:var(--text-main);">
                    ${escapeHtml(p.name)}
                  </h3>
                  ${
                    archived
                      ? '<span class="badge badge-amber">ARCHIVED</span>'
                      : '<span class="badge badge-cyan">AST INDEXED</span>'
                  }
                </div>

                ${
                  p.headline
                    ? `<p style="font-size:0.875rem; font-weight:600; color:var(--accent-indigo); margin-bottom:8px;">${escapeHtml(p.headline)}</p>`
                    : ''
                }

                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6; margin-bottom:16px;">
                  ${escapeHtml(p.summary || 'Repository project generated from codebase analysis.')}
                </p>
              </div>

              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid var(--border-subtle); font-size:0.8rem; color:var(--text-dim); flex-wrap:wrap; gap:8px;">
                  <span>Repo: <code>${escapeHtml(p.slug || p.name)}</code></span>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <a href="/projects/${escapeHtml(p.id)}" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:4px 8px;">
                      Inspect Evidence →
                    </a>
                    ${
                      archived
                        ? `
                      <form action="/projects/${escapeHtml(p.id)}/restore" method="POST" style="display:inline;">
                        <button type="submit" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:4px 8px; color:#34D399; border-color:rgba(52,211,153,0.3);">
                          Restore
                        </button>
                      </form>
                    `
                        : `
                      <button
                        type="button"
                        onclick="openRemoveProjectModal('${escapeHtml(p.id)}', '${escapeHtml(p.name)}')"
                        class="btn btn-secondary btn-sm"
                        style="font-size:0.75rem; padding:4px 8px; color:#F87171; border-color:rgba(248,113,113,0.3);"
                      >
                        Remove
                      </button>
                    `
                    }
                  </div>
                </div>
              </div>
            </div>
          `;
            })
            .join('')}
        </div>
      `
      }

      <!-- Safe Removal Confirmation Modal -->
      <div id="removeProjectModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:#0F172A; border:1px solid var(--border-subtle); border-radius:var(--radius-lg); max-width:480px; width:90%; padding:28px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <span style="font-size:1.4rem;">⚠️</span>
            <h3 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Remove project from Career Portfolio?</h3>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px; margin-bottom:16px;">
            <div style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Project</div>
            <div style="font-size:1.1rem; font-weight:700; color:#E0E7FF; margin-top:2px;" id="modalProjectName">Project Name</div>
          </div>

          <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.6; margin-bottom:24px;">
            This removes it from your active career portfolio and matching results.
            The original GitHub repository will <strong>NOT</strong> be deleted.
          </p>

          <form id="removeProjectForm" method="POST" action="">
            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button type="button" onclick="closeRemoveProjectModal()" class="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" class="btn btn-danger" style="background:#EF4444; border-color:#DC2626; color:#FFF;">
                Remove
              </button>
            </div>
          </form>
        </div>
      </div>

      <script>
        function openRemoveProjectModal(projectId, projectName) {
          const modal = document.getElementById('removeProjectModal');
          const nameElem = document.getElementById('modalProjectName');
          const form = document.getElementById('removeProjectForm');
          if (modal && nameElem && form) {
            nameElem.textContent = projectName;
            form.action = '/projects/' + projectId + '/remove';
            modal.style.display = 'flex';
          }
        }

        function closeRemoveProjectModal() {
          const modal = document.getElementById('removeProjectModal');
          if (modal) {
            modal.style.display = 'none';
          }
        }
      </script>
    </div>
  `;
}

function renderProjectDetail({ selectedProject, error, success }) {
  const evidenceList = Array.isArray(selectedProject.evidence) ? selectedProject.evidence : [];
  const archived = isProjectArchived(selectedProject);

  return `
    <div class="container" style="max-width:960px;">
      <!-- Back Navigation -->
      <a href="/projects" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Projects
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <a href="/projects">Projects</a>
        <span class="separator">/</span>
        <span class="current">${escapeHtml(selectedProject.name)}</span>
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

      <!-- Project Header Card -->
      <div class="card" style="padding:32px; margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">
              <h1 style="font-size:1.75rem; font-weight:800; letter-spacing:-0.02em;">
                ${escapeHtml(selectedProject.name)}
              </h1>
              ${
                archived
                  ? '<span class="badge badge-amber">ARCHIVED / HIDDEN</span>'
                  : '<span class="badge badge-verified">VERIFIED EVIDENCE</span>'
              }
            </div>
            ${
              selectedProject.headline
                ? `<p style="font-size:1rem; font-weight:600; color:var(--accent-indigo); margin-bottom:8px;">${escapeHtml(selectedProject.headline)}</p>`
                : ''
            }
          </div>

          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <span class="badge badge-cyan" style="font-size:0.8rem;"><code>${escapeHtml(selectedProject.slug || selectedProject.name)}</code></span>
            ${
              archived
                ? `
              <form action="/projects/${escapeHtml(selectedProject.id)}/restore" method="POST" style="display:inline;">
                <button type="submit" class="btn btn-secondary btn-sm" style="color:#34D399; border-color:rgba(52,211,153,0.3);">
                  Restore to Career Portfolio
                </button>
              </form>
            `
                : `
              <button
                type="button"
                onclick="openRemoveProjectModal('${escapeHtml(selectedProject.id)}', '${escapeHtml(selectedProject.name)}')"
                class="btn btn-secondary btn-sm"
                style="color:#F87171; border-color:rgba(248,113,113,0.3);"
              >
                Remove from Career Portfolio
              </button>
            `
            }
          </div>
        </div>

        <p style="font-size:0.95rem; color:var(--text-main); line-height:1.7; margin-bottom:24px;">
          ${escapeHtml(selectedProject.summary || 'Repository project generated from codebase analysis.')}
        </p>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; padding-top:20px; border-top:1px solid var(--border-subtle); font-size:0.85rem;">
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Role / Contribution</span>
            <strong style="color:var(--text-main); display:block; margin-top:4px;">${escapeHtml(selectedProject.role || 'Author / Core Contributor')}</strong>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Evidence Citations</span>
            <strong style="color:var(--accent-cyan); display:block; margin-top:4px;">${evidenceList.length} items</strong>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Provenance Model</span>
            <strong style="color:var(--accent-emerald); display:block; margin-top:4px;">Deterministic AST Proof</strong>
          </div>
        </div>
      </div>

      <!-- Evidence Citations Table -->
      <div class="card" style="padding:28px;">
        <div class="section-header">
          <div>
            <h2>Code Evidence & AST Citations</h2>
            <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
              Individual proof nodes extracted from dependencies, commit history, and source architecture.
            </p>
          </div>
          <span class="section-count">${evidenceList.length} Total</span>
        </div>

        ${
          evidenceList.length === 0
            ? `
          <div class="empty-state" style="padding:32px 16px;">
            <p style="color:var(--text-muted); font-size:0.875rem; margin:0;">No detailed evidence items recorded for this project.</p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Evidence Type</th>
                  <th>Source Location</th>
                  <th>Linked Skill</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                ${evidenceList
                  .map((e) => {
                    const filePath =
                      e.sourceLocation?.filePath ||
                      e.sourceLocation?.path ||
                      e.sourceFilePath ||
                      '';
                    const lineStart = e.sourceLocation?.lineStart || e.lineStart;
                    const locStr = filePath
                      ? `${filePath}${lineStart ? `:${lineStart}` : ''}`
                      : 'Unknown';
                    const skillName = e.linkedSkillName || e.skillName || '—';
                    const conf = Math.round((e.confidenceScore || 0) * 100);
                    return `
                    <tr>
                      <td>
                        <span class="badge ${e.evidenceType === 'AST_SYNTAX' ? 'badge-verified' : e.evidenceType === 'DEPENDENCY' ? 'badge-cyan' : 'badge-inferred'}" style="font-size:0.7rem;">
                          ${escapeHtml(e.evidenceType || 'UNKNOWN')}
                        </span>
                      </td>
                      <td>
                        <code style="font-size:0.8rem; color:#E0E7FF;">${escapeHtml(locStr)}</code>
                        ${e.commitSha ? `<div style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">SHA: ${escapeHtml(e.commitSha.slice(0, 8))}</div>` : ''}
                      </td>
                      <td style="font-size:0.875rem;">${escapeHtml(skillName)}</td>
                      <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                          <div style="width:60px; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; overflow:hidden;">
                            <div style="width:${conf}%; height:100%; background:${conf >= 80 ? 'var(--accent-emerald)' : conf >= 50 ? 'var(--accent-amber)' : 'var(--accent-rose)'}; border-radius:3px;"></div>
                          </div>
                          <span style="font-size:0.8rem; color:var(--text-muted);">${conf}%</span>
                        </div>
                      </td>
                    </tr>
                  `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        `
        }
      </div>

      <!-- Safe Removal Confirmation Modal -->
      <div id="removeProjectModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:#0F172A; border:1px solid var(--border-subtle); border-radius:var(--radius-lg); max-width:480px; width:90%; padding:28px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <span style="font-size:1.4rem;">⚠️</span>
            <h3 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Remove project from Career Portfolio?</h3>
          </div>

          <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px; margin-bottom:16px;">
            <div style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Project</div>
            <div style="font-size:1.1rem; font-weight:700; color:#E0E7FF; margin-top:2px;" id="modalProjectName">${escapeHtml(selectedProject.name)}</div>
          </div>

          <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.6; margin-bottom:24px;">
            This removes it from your active career portfolio and matching results.
            The original GitHub repository will <strong>NOT</strong> be deleted.
          </p>

          <form id="removeProjectForm" method="POST" action="/projects/${escapeHtml(selectedProject.id)}/remove">
            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button type="button" onclick="closeRemoveProjectModal()" class="btn btn-secondary">
                Cancel
              </button>
              <button type="submit" class="btn btn-danger" style="background:#EF4444; border-color:#DC2626; color:#FFF;">
                Remove
              </button>
            </div>
          </form>
        </div>
      </div>

      <script>
        function openRemoveProjectModal(projectId, projectName) {
          const modal = document.getElementById('removeProjectModal');
          const nameElem = document.getElementById('modalProjectName');
          const form = document.getElementById('removeProjectForm');
          if (modal) {
            if (nameElem && projectName) nameElem.textContent = projectName;
            if (form && projectId) form.action = '/projects/' + projectId + '/remove';
            modal.style.display = 'flex';
          }
        }

        function closeRemoveProjectModal() {
          const modal = document.getElementById('removeProjectModal');
          if (modal) {
            modal.style.display = 'none';
          }
        }
      </script>
    </div>
  `;
}
