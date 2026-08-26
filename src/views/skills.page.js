/**
 * @file Verified Skills Taxonomy Explorer View Template (P13.5-002).
 *
 * Renders categorized skill graphs with strict truth provenance:
 * VERIFIED (green), INFERRED (cyan), and CLAIMED ([Unverified User Claim] amber).
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

  const content = `
    <div class="container">
      <!-- Header -->
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px;">
        <div>
          <span class="badge badge-verified" style="margin-bottom:6px;">PROVENANCE & TAXONOMY</span>
          <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em;">Verified Skills Graph</h1>
          <p style="color:var(--text-muted); font-size:0.95rem; margin-top:4px;">
            Audited engineering skill graph strictly classified into Verified Facts, Inferences, and Unverified Claims.
          </p>
        </div>

        <div style="display:flex; gap:10px;">
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
            <span>+ Ingest Repositories for More Skills</span>
          </a>
        </div>
      </div>

      <!-- Provenance Legend Cards -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:32px;">
        <div class="stat-card" style="border-left: 4px solid var(--accent-emerald);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-verified">VERIFIED</span>
            <span class="stat-val" style="color:var(--accent-emerald); font-size:1.4rem;">${verifiedList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
            Backed by deterministic AST syntax analysis, dependency manifests, or commit proof.
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-cyan);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-inferred">INFERRED</span>
            <span class="stat-val" style="color:var(--accent-cyan); font-size:1.4rem;">${inferredList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
            Derived logically through taxonomy hierarchy (e.g. Next.js implies React).
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-amber);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-claimed">CLAIMED</span>
            <span class="stat-val" style="color:var(--accent-amber); font-size:1.4rem;">${claimedList.length}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">
            User-asserted narrative claims marked with explicit <code>[Unverified User Claim]</code>.
          </p>
        </div>
      </div>

      <!-- Categorized Skills Sections -->
      ${
        skills.length === 0
          ? `
        <div class="card" style="text-align:center; padding:48px 24px;">
          <div style="font-size:2.5rem; margin-bottom:12px;">🧬</div>
          <h2 style="font-size:1.25rem; font-weight:700; margin-bottom:6px;">No Skills Extracted Yet</h2>
          <p style="font-size:0.9rem; color:var(--text-muted); max-width:460px; margin:0 auto 20px;">
            Connect your GitHub repositories in the onboarding wizard to extract verified technical skills.
          </p>
          <a href="/onboarding?step=3" class="btn btn-primary">Start Repository Ingestion →</a>
        </div>
      `
          : Object.entries(categories)
              .filter(([_, catSkills]) => catSkills.length > 0)
              .map(
                ([catTitle, catSkills]) => `
            <div class="card" style="padding:28px; margin-bottom:24px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
                <h2 style="font-size:1.15rem; font-weight:700;">${escapeHtml(catTitle)}</h2>
                <span style="font-size:0.8rem; color:var(--text-dim);">${catSkills.length} Skills</span>
              </div>

              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:14px;">
                ${catSkills
                  .map((s) => {
                    let badgeClass = 'badge-verified';
                    let label = 'VERIFIED';
                    if (s.provenanceStatus === 'CLAIMED' || s.isUserClaim) {
                      badgeClass = 'badge-claimed';
                      label = 'CLAIMED [Unverified User Claim]';
                    } else if (s.provenanceStatus === 'INFERRED') {
                      badgeClass = 'badge-inferred';
                      label = 'INFERRED';
                    }
                    const confidencePercent = Math.round((s.confidenceScore || 0.9) * 100);

                    return `
                    <div style="padding:14px 16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
                      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <strong style="font-size:0.95rem; color:var(--text-main);">${escapeHtml(s.name || s.slug)}</strong>
                        <span class="badge ${badgeClass}" style="font-size:0.65rem;" title="${escapeHtml(label)}">${escapeHtml(s.provenanceStatus || 'VERIFIED')}</span>
                      </div>

                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-dim);">
                        <span>Evidence: <strong>${s.evidenceCount || 1} citations</strong></span>
                        <span style="color:var(--accent-emerald);">Confidence: <strong>${confidencePercent}%</strong></span>
                      </div>
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
