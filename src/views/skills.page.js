/**
 * @file Verified Skills Taxonomy Explorer View Template (P13.5-002).
 *
 * Renders categorized skill graphs with strict truth provenance:
 * VERIFIED (green), INFERRED (cyan), and CLAIMED ([Unverified User Claim] amber).
 * Includes source/provenance information for GitHub-derived skills.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the Verified Skills taxonomy explorer page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {Array<object>} [params.skills=[]] Verified candidate skills list
 * @returns {string} Full HTML document
 */
export function renderSkillsPage({ user, _tenant, skills = [] }) {
  const verifiedList = skills.filter((s) => s.provenanceStatus === 'VERIFIED');
  const inferredList = skills.filter((s) => s.provenanceStatus === 'INFERRED');
  const claimedList = skills.filter(
    (s) => s.provenanceStatus === 'CLAIMED' || s.isUserClaim === true
  );

  // Group skills by category
  const categories = {
    'Languages & Runtimes': [],
    'Frameworks & Libraries': [],
    'Cloud, DevOps & Databases': [],
    'Architecture & Protocols': [],
    'Other Technical Skills': [],
  };

  for (const s of skills) {
    const cat = s.category || '';
    const name = (s.name || s.slug || '').toLowerCase();

    if (
      cat === 'LANGUAGE' ||
      name.includes('javascript') ||
      name.includes('typescript') ||
      name.includes('python') ||
      name.includes('go') ||
      name.includes('rust') ||
      name.includes('sql')
    ) {
      categories['Languages & Runtimes'].push(s);
    } else if (
      cat === 'FRAMEWORK' ||
      name.includes('fastify') ||
      name.includes('react') ||
      name.includes('node') ||
      name.includes('next') ||
      name.includes('drizzle') ||
      name.includes('express')
    ) {
      categories['Frameworks & Libraries'].push(s);
    } else if (
      cat === 'INFRASTRUCTURE' ||
      cat === 'DATABASE' ||
      name.includes('postgres') ||
      name.includes('docker') ||
      name.includes('cloud') ||
      name.includes('github')
    ) {
      categories['Cloud, DevOps & Databases'].push(s);
    } else if (
      cat === 'ARCHITECTURE' ||
      name.includes('mcp') ||
      name.includes('oauth') ||
      name.includes('rest') ||
      name.includes('ast') ||
      name.includes('api')
    ) {
      categories['Architecture & Protocols'].push(s);
    } else {
      categories['Other Technical Skills'].push(s);
    }
  }

  /**
   * Renders source/provenance information for a skill card.
   *
   * @param {object} s Skill row with optional evidence/resource fields
   * @returns {string} HTML source info block
   */
  function renderSourceInfo(s) {
    const hasResource = s.resourceDisplayName || s.resourceUrl;
    const hasEvidence = s.evidenceType || s.sourceLocation;

    if (!hasResource && !hasEvidence) {
      if (s.provenanceStatus === 'CLAIMED' || s.isUserClaim) {
        return `<div style="font-size:0.72rem; color:var(--accent-amber); margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
          📝 Candidate self-reported claim from resume [Unverified User Claim]
        </div>`;
      }
      return `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
        🔍 Provenance established via repository taxonomy analysis
      </div>`;
    }

    const parts = [];

    if (s.resourceDisplayName) {
      const repoName = escapeHtml(s.resourceDisplayName);
      if (s.resourceUrl) {
        parts.push(
          `<span>📦 <a href="${escapeHtml(s.resourceUrl)}" target="_blank" rel="noopener" style="color:var(--accent-cyan); text-decoration:none; font-weight:500;">${repoName}</a></span>`
        );
      } else {
        parts.push(`<span>📦 ${repoName}</span>`);
      }
    }

    if (s.resourceProvider) {
      parts.push(
        `<span class="tag" style="font-size:0.65rem;">${escapeHtml(String(s.resourceProvider))}</span>`
      );
    }

    if (s.evidenceType) {
      const evidenceTypeLabels = {
        PACKAGE_MANIFEST_DEPENDENCY: 'Package manifest',
        CODE_IMPORT_USAGE: 'Code import',
        FILE_PATTERN_MATCH: 'File pattern',
        COMMIT_CONTRIBUTION: 'Commit evidence',
        README_SPECIFICATION: 'README spec',
        DIRECTORY_STRUCTURE: 'Directory structure',
        DOCUMENT_CLAIM: 'Document claim',
      };
      parts.push(
        `<span style="font-size:0.7rem; color:var(--text-dim);">📎 ${escapeHtml(evidenceTypeLabels[s.evidenceType] || s.evidenceType)}</span>`
      );
    }

    if (s.sourceLocation) {
      parts.push(
        `<span style="font-size:0.65rem; color:var(--text-muted); font-family:var(--font-mono);">📄 ${escapeHtml(s.sourceLocation)}</span>`
      );
    }

    if (s.excerpt) {
      const truncatedExcerpt = s.excerpt.length > 80 ? s.excerpt.slice(0, 80) + '…' : s.excerpt;
      parts.push(
        `<span style="font-size:0.65rem; color:var(--text-dim); font-family:var(--font-mono); font-style:italic;">"${escapeHtml(truncatedExcerpt)}"</span>`
      );
    }

    if (s.lastObservedAt) {
      const date = new Date(s.lastObservedAt);
      if (!isNaN(date.getTime())) {
        parts.push(
          `<span style="font-size:0.65rem; color:var(--text-dim);">Indexed ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>`
        );
      }
    }

    return `<div style="display:flex; flex-wrap:wrap; gap:0.4rem; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
      ${parts.join(' ')}
    </div>`;
  }

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
        <span class="current">Skills</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Career Intelligence Knowledge Graph Pipeline</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Live Evidence Resolution</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step"><span>📦</span> Connected Sources (GitHub)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🔍</span> AST & File Inspection</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active"><span>⚡</span> Verified Skills & Taxonomy</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>⚖️</span> Truth Model (VERIFIED / CLAIMED)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🤖</span> Remote MCP Server & AI Clients</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <span class="badge badge-verified" style="margin-bottom:6px;">PROVENANCE & TAXONOMY</span>
          <h1>Verified Skills Graph</h1>
          <p>
            Audited engineering skill graph strictly classified into Verified Facts, Inferences, and Unverified Claims.
          </p>
        </div>

        <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
          + Ingest Repositories for More Skills
        </a>
      </div>

      <!-- Provenance Legend Cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:32px;">
        <div class="stat-card" style="border-left: 4px solid var(--accent-emerald);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-verified">VERIFIED</span>
            <span class="stat-val" style="color:var(--accent-emerald); font-size:1.4rem;">${verifiedList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            Backed by deterministic AST syntax analysis, dependency manifests, or commit proof.
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-cyan);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-inferred">INFERRED</span>
            <span class="stat-val" style="color:var(--accent-cyan); font-size:1.4rem;">${inferredList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            Derived logically through taxonomy hierarchy (e.g. Next.js implies React).
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-amber);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-claimed">CLAIMED</span>
            <span class="stat-val" style="color:var(--accent-amber); font-size:1.4rem;">${claimedList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            User-asserted narrative claims marked with explicit <code>[Unverified User Claim]</code>.
          </p>
        </div>
      </div>

      <!-- Categorized Skills Sections -->
      ${
        skills.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">🧬</div>
          <h3>No Skills Extracted Yet</h3>
          <p>
            Connect your GitHub repositories in the onboarding wizard to extract verified technical skills.
          </p>
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">Start Repository Ingestion →</a>
        </div>
      `
          : Object.entries(categories)
              .filter(([, catSkills]) => catSkills.length > 0)
              .map(
                ([catTitle, catSkills]) => `
          <div class="card" style="padding:28px; margin-bottom:24px;">
            <div class="section-header">
              <h2>${escapeHtml(catTitle)}</h2>
              <span class="section-count">${catSkills.length} Skills</span>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:14px;">
              ${catSkills
                .map((s) => {
                  let badgeClass = 'badge-verified';
                  if (s.provenanceStatus === 'CLAIMED' || s.isUserClaim) {
                    badgeClass = 'badge-claimed';
                  } else if (s.provenanceStatus === 'INFERRED') {
                    badgeClass = 'badge-inferred';
                  }
                  const confidencePercent = Math.round((s.confidenceScore || 0.9) * 100);

                  return `
                  <div style="padding:14px 16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between; gap:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                      <strong style="font-size:0.95rem; color:var(--text-main);">${escapeHtml(s.name || s.slug)}</strong>
                      <span class="badge ${badgeClass}" style="font-size:0.65rem; flex-shrink:0;">${escapeHtml(s.provenanceStatus || 'VERIFIED')}</span>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-dim);">
                      <span>Evidence: <strong>${s.evidenceCount || 1} citation${(s.evidenceCount || 1) === 1 ? '' : 's'}</strong></span>
                      <span style="color:var(--accent-emerald);">Confidence: <strong>${confidencePercent}%</strong></span>
                    </div>

                    ${renderSourceInfo(s)}
                  </div>
                `;
                })
                .join('')}
            </div>
          </div>
        `
              )
              .join('')
      }
    </div>
  `;

  return renderLayout({
    title: 'Verified Skills Graph — Antigravity Career Hub',
    content,
    activeNav: 'skills',
    user,
  });
}
