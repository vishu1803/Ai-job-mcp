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
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px;">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:6px;">PORTFOLIO & EVIDENCE</span>
          <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em;">Projects & Code Evidence</h1>
          <p style="color:var(--text-muted); font-size:0.95rem; margin-top:4px;">
            Evidence-grounded project records constructed from your connected repository AST syntax trees.
          </p>
        </div>

        <div style="display:flex; gap:10px;">
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
            <span>+ Ingest New Repositories</span>
          </a>
        </div>
      </div>

      ${
        projects.length === 0
          ? `
        <div class="card" style="text-align:center; padding:48px 24px;">
          <div style="font-size:2.5rem; margin-bottom:12px;">📁</div>
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:6px;">No Projects Ingested Yet</h2>
          <p style="font-size:0.9rem; color:var(--text-muted); max-width:460px; margin:0 auto 20px;">
            Connect your GitHub repositories in the onboarding wizard to automatically generate verified project artifacts.
          </p>
          <a href="/onboarding?step=3" class="btn btn-primary">Start Repository Ingestion →</a>
        </div>
      `
          : `
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:20px;">
          ${projects
            .map(
              (p) => `
            <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s ease, border-color 0.2s ease;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                  <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-main);">
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
                  <span>Linked Repo: <code>${escapeHtml(p.slug || p.name)}</code></span>
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
      <!-- Breadcrumb & Nav -->
      <div style="margin-bottom:20px;">
        <a href="/projects" style="font-size:0.85rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:6px;">
          ← Back to All Projects
        </a>
      </div>

      <!-- Project Header Card -->
      <div class="card" style="padding:32px; margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
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
            <span style="color:var(--text-dim);">Role / Contribution:</span>
            <strong style="color:var(--text-main); display:block; margin-top:2px;">${escapeHtml(selectedProject.role || 'Author / Core Contributor')}</strong>
          </div>
          <div>
            <span style="color:var(--text-dim);">Evidence Citations:</span>
            <strong style="color:var(--accent-cyan); display:block; margin-top:2px;">${evidenceList.length} items</strong>
          </div>
          <div>
            <span style="color:var(--text-dim);">Provenance Model:</span>
            <strong style="color:var(--accent-emerald); display:block; margin-top:2px;">Deterministic AST Proof</strong>
          </div>
        </div>
      </div>

      <!-- Evidence Citations Table -->
      <div class="card" style="padding:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700;">Code Evidence & AST Citations</h2>
            <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
              Individual proof nodes extracted from dependencies, commit history, and source architecture.
            </p>
          </div>
          <span style="font-size:0.85rem; color:var(--text-muted);">${evidenceList.length} Total</span>
        </div>

        ${
          evidenceList.length === 0
            ? `
          <div style="text-align:center; padding:32px 16px; background:rgba(0,0,0,0.2); border-radius:var(--radius-md);">
            <p style="color:var(--text-muted); font-size:0.875rem;">No detailed evidence items recorded for this project.</p>
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
                    const locStr =
                      typeof e.sourceLocation === 'object' && e.sourceLocation !== null
                        ? e.sourceLocation.filePath ||
                          e.sourceLocation.path ||
                          JSON.stringify(e.sourceLocation)
                        : String(e.sourceLocation || 'Repository Root');
                    return `
                  <tr>
                    <td>
                      <span class="badge badge-indigo" style="font-size:0.7rem;">${escapeHtml(e.evidenceType || 'CODE_EVIDENCE')}</span>
                    </td>
                    <td>
                      <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-main);">${escapeHtml(locStr)}</div>
                      ${e.excerpt ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; font-style:italic;">"${escapeHtml(e.excerpt.slice(0, 80))}${e.excerpt.length > 80 ? '...' : ''}"</div>` : ''}
                    </td>
                    <td>
                      <span class="badge badge-verified">${escapeHtml(e.skillName || e.skillSlug || 'General')}</span>
                    </td>
                    <td>
                      <strong style="color:var(--accent-emerald); font-size:0.85rem;">
                        ${Math.round((e.confidenceScore || 0.9) * 100)}%
                      </strong>
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
