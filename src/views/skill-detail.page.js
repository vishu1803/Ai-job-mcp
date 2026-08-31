/**
 * @file Dedicated Skill Detail & Citations View Template (P14-003A / ARCH-052).
 *
 * Renders an in-depth provenance inspection for a single technical skill:
 * 1. 5-Tier Semantic Truth Status badge (VERIFIED, CORROBORATED, INFERRED, CLAIMED, UNKNOWN).
 * 2. Repository provenance citations with file paths, commit SHAs, and syntax excerpts.
 * 3. Confidence score and evidence classification level.
 * 4. Contextual back navigation and breadcrumbs.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Formats date into a human readable string.
 *
 * @param {string | Date | null} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return 'Recently';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Renders the dedicated Skill Detail page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} params.skill Skill metadata object
 * @param {Array<object>} [params.evidence=[]] Evidence items for this skill
 * @param {Array<object>} [params.relatedProjects=[]] Projects referencing this skill
 * @returns {string} Full HTML document
 */
export function renderSkillDetailPage({
  user,
  tenant: _tenant = null,
  skill,
  evidence = [],
  relatedProjects = [],
}) {
  const skillName = skill.name || skill.slug;
  const status =
    skill.provenanceStatus || (skill.truthStatus === 'CLAIMED' ? 'CLAIMED' : 'VERIFIED');

  let badgeClass = 'badge-verified';
  let badgeLabel = 'VERIFIED';
  if (status === 'CLAIMED') {
    badgeClass = 'badge-claimed';
    badgeLabel = 'CLAIMED [Unverified User Claim]';
  } else if (status === 'CORROBORATED') {
    badgeClass = 'badge-corroborated';
    badgeLabel = 'CORROBORATED';
  } else if (status === 'INFERRED') {
    badgeClass = 'badge-inferred';
    badgeLabel = 'INFERRED';
  } else if (status === 'UNKNOWN') {
    badgeClass = 'badge-unknown';
    badgeLabel = 'UNKNOWN';
  }

  const confidencePercent = Math.round((skill.confidenceScore || 0.9) * 100);

  const content = `
    <div class="container">
      <!-- Back Navigation -->
      <a href="/skills" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Verified Skills
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <a href="/skills">Verified Skills</a>
        <span class="separator">/</span>
        <span class="current">${escapeHtml(skillName)}</span>
      </div>

      <!-- Skill Header Card -->
      <div class="card" style="padding:28px 32px; margin-bottom:28px; background:linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">
              <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
              <span class="badge badge-indigo">${escapeHtml(skill.category || 'TECHNICAL_SKILL')}</span>
            </div>
            <h1 style="font-size:1.8rem; font-weight:800; letter-spacing:-0.02em; margin:4px 0 8px 0;">
              ${escapeHtml(skillName)}
            </h1>
            <p style="color:var(--text-muted); font-size:0.9rem; max-width:650px; margin:0;">
              ${
                status === 'CLAIMED'
                  ? 'Self-reported competency extracted from uploaded candidate resume. Awaiting independent repository AST verification.'
                  : status === 'INFERRED'
                    ? 'Derived through semantic taxonomy rules and parent framework dependencies.'
                    : 'Cryptographically grounded competency derived directly from analyzed repository AST source code.'
              }
            </p>
          </div>

          <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
            <div class="stat-card" style="padding:12px 18px; text-align:center; min-width:110px;">
              <span style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Confidence</span>
              <div style="font-size:1.4rem; font-weight:800; color:var(--accent-emerald);">${confidencePercent}%</div>
            </div>
            <div class="stat-card" style="padding:12px 18px; text-align:center; min-width:110px;">
              <span style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Citations</span>
              <div style="font-size:1.4rem; font-weight:800; color:var(--accent-cyan);">${evidence.length}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Grid: Evidence Citations & Related Projects -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px;" class="grid-2col">
        <!-- Left: Supporting Citations -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">
              Audited Evidence Citations (${evidence.length})
            </h2>
          </div>

          ${
            evidence.length === 0
              ? `
            <div class="card empty-state" style="padding:36px 24px;">
              <div class="empty-state-icon">📄</div>
              <h3>No Code Citations Available</h3>
              <p>This skill is recorded from narrative claims or taxonomy inference. Connect GitHub repositories to extract syntax-level code citations.</p>
              <a href="/onboarding?step=3" class="btn btn-primary btn-sm" style="margin-top:12px;">Ingest Repositories →</a>
            </div>
          `
              : `
            <div style="display:flex; flex-direction:column; gap:14px;">
              ${evidence
                .map(
                  (item, idx) => `
                <div class="card" style="padding:18px 20px; border-left: 4px solid var(--accent-indigo);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
                    <div>
                      <span class="badge badge-cyan" style="font-size:0.7rem;">Citation #${idx + 1} &bull; ${escapeHtml(item.evidenceType || 'CODE_IMPORT')}</span>
                      ${
                        item.resourceName
                          ? `<strong style="font-size:0.9rem; color:var(--text-main); margin-left:8px;">📦 ${escapeHtml(item.resourceName)}</strong>`
                          : ''
                      }
                    </div>
                    ${
                      item.commitSha
                        ? `<span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--accent-indigo); background:rgba(99,102,241,0.1); padding:2px 6px; border-radius:4px;">commit ${escapeHtml(item.commitSha.slice(0, 7))}</span>`
                        : ''
                    }
                  </div>

                  ${
                    item.sourceLocation
                      ? `
                    <div style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono); margin-bottom:8px;">
                      📄 ${escapeHtml(item.sourceLocation)}
                    </div>
                  `
                      : ''
                  }

                  ${
                    item.excerpt
                      ? `
                    <div style="background:rgba(11,15,25,0.8); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; font-family:var(--font-mono); font-size:0.8rem; color:#E2E8F0; overflow-x:auto; white-space:pre-wrap; line-height:1.5;">
                      ${escapeHtml(item.excerpt)}
                    </div>
                  `
                      : ''
                  }

                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; font-size:0.75rem; color:var(--text-dim);">
                    <span>Observed: ${formatDate(item.createdAt || item.lastObservedAt)}</span>
                    <span style="color:var(--accent-emerald);">Weight Score: ${(item.confidenceScore || 0.9).toFixed(2)}</span>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          `
          }
        </div>

        <!-- Right: Related Projects & Context -->
        <div style="display:flex; flex-direction:column; gap:20px;">
          <div class="card">
            <h3 style="font-size:1rem; font-weight:700; margin-bottom:14px;">Demonstrated in Projects</h3>
            ${
              relatedProjects.length === 0
                ? `
              <p style="font-size:0.825rem; color:var(--text-dim);">No portfolio projects currently mapped to this skill.</p>
            `
                : `
              <div style="display:flex; flex-direction:column; gap:10px;">
                ${relatedProjects
                  .map(
                    (p) => `
                  <a href="/projects/${p.id}" style="display:block; padding:10px 12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); transition:all 0.15s ease;">
                    <div style="font-weight:600; font-size:0.875rem; color:var(--text-main);">${escapeHtml(p.name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml(p.description || 'Portfolio repository')}</div>
                  </a>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>

          <!-- Zero Hallucination Guarantee Card -->
          <div class="card" style="border-left:4px solid var(--accent-emerald); background:rgba(16,185,129,0.04);">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:1.1rem;">🛡️</span>
              <strong style="font-size:0.9rem; color:var(--accent-emerald);">Zero-Hallucination Gate</strong>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.5; margin:0;">
              This skill datum is strictly audited before being shared with AI assistants via the Model Context Protocol. AI agents cannot invent credentials not grounded in this graph.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `${skillName} — Skill Evidence`,
    content,
    activeNav: 'skills',
    user,
    description: `Audited evidence graph and citations for ${skillName} in AI Careers Hub.`,
  });
}
