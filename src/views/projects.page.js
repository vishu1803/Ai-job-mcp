/**
 * @file Projects & Evidence Inspection View Template (P13.5-002).
 *
 * Renders portfolio project cards, project metadata, and deep evidence inspection
 * with commit SHAs, file paths, and syntax tree provenance.
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
 * @returns {string} Full HTML document
 */
export function renderProjectsPage({ user, tenant, projects = [], selectedProject = null }) {
  const isDetail = Boolean(selectedProject);

  const content = isDetail
    ? renderProjectDetail({ selectedProject, user, tenant })
    : renderProjectsList({ projects, user, tenant });

  return renderLayout({
    title: isDetail
      ? `${selectedProject.name} — Project Inspection`
      : 'Portfolio Projects — Antigravity Career Hub',
    content,
    activeNav: 'projects',
    user,
  });
}

function renderProjectsList({ projects }) {
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

      <div class="page-header">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:6px;">PORTFOLIO & EVIDENCE</span>
          <h1>Projects & Code Evidence</h1>
          <p>
            Evidence-grounded project records constructed from your connected repository AST syntax trees.
          </p>
        </div>

        <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
          + Ingest New Repositories
        </a>
      </div>

      ${
        projects.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">📁</div>
          <h3>No Projects Ingested Yet</h3>
          <p>
            Connect your GitHub repositories in the onboarding wizard to automatically generate verified project artifacts.
          </p>
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">Start Repository Ingestion →</a>
        </div>
      `
          : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:20px;">
          ${projects
            .map(
              (p) => `
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                  <h3 style="font-size:1.1rem; font-weight:700; color:var(--text-main);">
                    ${escapeHtml(p.name)}
                  </h3>
                  <span class="badge badge-cyan">AST INDEXED</span>
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
                <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid var(--border-subtle); font-size:0.8rem; color:var(--text-dim);">
                  <span>Repo: <code>${escapeHtml(p.slug || p.name)}</code></span>
                  <a href="/projects/${escapeHtml(p.id)}" class="btn btn-secondary btn-sm" style="font-size:0.75rem;">
                    Inspect Evidence →
                  </a>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      }
    </div>
  `;
}

function renderProjectDetail({ selectedProject }) {
  const evidenceList = Array.isArray(selectedProject.evidence) ? selectedProject.evidence : [];

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

      <!-- Project Header Card -->
      <div class="card" style="padding:32px; margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">
              <h1 style="font-size:1.75rem; font-weight:800; letter-spacing:-0.02em;">
                ${escapeHtml(selectedProject.name)}
              </h1>
              <span class="badge badge-verified">VERIFIED EVIDENCE</span>
            </div>
            ${
              selectedProject.headline
                ? `<p style="font-size:1rem; font-weight:600; color:var(--accent-indigo); margin-bottom:8px;">${escapeHtml(selectedProject.headline)}</p>`
                : ''
            }
          </div>

          <div>
            <span class="badge badge-cyan" style="font-size:0.8rem;"><code>${escapeHtml(selectedProject.slug || selectedProject.name)}</code></span>
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
    </div>
  `;
}
