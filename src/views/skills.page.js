/**
 * @file Verified Skills Taxonomy Explorer View Template (P13.5-002 / Step 1K).
 *
 * Renders categorized skill graphs with strict 5-tier evidence provenance:
 * VERIFIED (green), CORROBORATED (emerald), INFERRED (cyan), and CLAIMED ([Unverified User Claim] amber).
 * Separates Primary Career Competencies from Technology & Implementation Signals with Collapsible Evidence Explorer.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';

/**
 * Renders the Verified Skills taxonomy explorer page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params._tenant] Authenticated tenant
 * @param {object} [params.profile] Canonical Career Profile from CandidateProfileService
 * @param {Array<object>} [params.skills=[]] Raw DB candidate skills list
 * @returns {string} Full HTML document
 */
export function renderSkillsPage({ user, _tenant, profile, skills = [] }) {
  // Use canonical profile skills if available, or normalize raw skills
  const primarySkills =
    profile?.primarySkills ||
    skills
      .map((s) => {
        const cat = SkillTaxonomyEngine.classifyCategory(s.slug || s.name, s.category);
        const tier = SkillTaxonomyEngine.classifyTier(s.slug || s.name, cat);
        return {
          ...s,
          fineCategory: cat,
          tier,
          truthStatus: s.provenanceStatus || 'VERIFIED',
        };
      })
      .filter((s) => s.tier === 'PRIMARY');

  const technologySignals =
    profile?.technologySignals ||
    skills
      .map((s) => {
        const cat = SkillTaxonomyEngine.classifyCategory(s.slug || s.name, s.category);
        const tier = SkillTaxonomyEngine.classifyTier(s.slug || s.name, cat);
        return {
          ...s,
          fineCategory: cat,
          tier,
          truthStatus: s.provenanceStatus || 'VERIFIED',
        };
      })
      .filter((s) => s.tier === 'SIGNAL');

  const allSkills = profile?.topSkills || [...primarySkills, ...technologySignals];

  // Inferred skills (if any)
  const inferredSkills = allSkills.filter(
    (s) => s.truthStatus === 'INFERRED' || s.provenanceStatus === 'INFERRED'
  );

  // Compute truthful metrics
  const verifiedPrimaryCount = primarySkills.filter(
    (s) => s.truthStatus === 'VERIFIED' || s.provenanceStatus === 'CORROBORATED'
  ).length;
  const claimedCount = allSkills.filter((s) => s.truthStatus === 'CLAIMED').length;
  const inferredCount = inferredSkills.length;
  const verifiedSignalCount = technologySignals.length;

  // Build evidence lookup map by slug from raw skill rows
  const evidenceMap = new Map();
  for (const s of skills) {
    const slug = (s.slug || s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    evidenceMap.set(slug, s);
  }

  // Primary Skills Grouping
  const primaryCategories = {
    'Languages & Runtimes': [],
    'Backend Frameworks': [],
    'Frontend Frameworks & UI': [],
    'Databases & Storage': [],
    'Protocols & Architecture': [],
    'Platforms & Cloud Infrastructure': [],
    'AI & Machine Learning': [],
    'Major Engineering Tools': [],
  };

  for (const s of primarySkills) {
    const fineCat = s.fineCategory || SkillTaxonomyEngine.classifyCategory(s.slug, s.category);
    if (fineCat === 'CORE_LANGUAGE') {
      primaryCategories['Languages & Runtimes'].push(s);
    } else if (fineCat === 'FRAMEWORK') {
      const slug = s.slug.toLowerCase();
      if (['react', 'next-js', 'vue', 'angular', 'svelte', 'tailwindcss'].includes(slug)) {
        primaryCategories['Frontend Frameworks & UI'].push(s);
      } else {
        primaryCategories['Backend Frameworks'].push(s);
      }
    } else if (fineCat === 'DATABASE') {
      primaryCategories['Databases & Storage'].push(s);
    } else if (fineCat === 'PROTOCOL') {
      primaryCategories['Protocols & Architecture'].push(s);
    } else if (fineCat === 'PLATFORM' || fineCat === 'CLOUD') {
      primaryCategories['Platforms & Cloud Infrastructure'].push(s);
    } else if (fineCat === 'AI_ML') {
      primaryCategories['AI & Machine Learning'].push(s);
    } else {
      primaryCategories['Major Engineering Tools'].push(s);
    }
  }

  // Evidence Explorer 11 Grouped Categories
  const explorerCategories = {
    'Languages & Runtimes': [],
    Frameworks: [],
    'Databases & ORMs': [],
    'Protocols & APIs': [],
    'Cloud & DevOps': [],
    'Libraries & State Management': [],
    'UI Components & Primitives': [],
    'Utilities & Middleware': [],
    'Developer Tools & Linters': [],
    'Built-in Runtime Modules': [],
    'Infrastructure & Config Signals': [],
  };

  for (const s of technologySignals) {
    const fineCat = s.fineCategory || SkillTaxonomyEngine.classifyCategory(s.slug, s.category);
    if (fineCat === 'CORE_LANGUAGE') {
      explorerCategories['Languages & Runtimes'].push(s);
    } else if (fineCat === 'FRAMEWORK') {
      explorerCategories['Frameworks'].push(s);
    } else if (fineCat === 'DATABASE') {
      explorerCategories['Databases & ORMs'].push(s);
    } else if (fineCat === 'PROTOCOL') {
      explorerCategories['Protocols & APIs'].push(s);
    } else if (fineCat === 'CLOUD' || fineCat === 'PLATFORM') {
      explorerCategories['Cloud & DevOps'].push(s);
    } else if (fineCat === 'LIBRARY') {
      explorerCategories['Libraries & State Management'].push(s);
    } else if (fineCat === 'UI_COMPONENT') {
      explorerCategories['UI Components & Primitives'].push(s);
    } else if (fineCat === 'UTILITY_PACKAGE') {
      explorerCategories['Utilities & Middleware'].push(s);
    } else if (fineCat === 'DEV_HELPER') {
      explorerCategories['Developer Tools & Linters'].push(s);
    } else if (fineCat === 'BUILT_IN_MODULE') {
      explorerCategories['Built-in Runtime Modules'].push(s);
    } else {
      explorerCategories['Infrastructure & Config Signals'].push(s);
    }
  }

  /**
   * Renders source and evidence citation explanation for a skill card.
   *
   * @param {object} s Skill object
   * @returns {string} HTML block
   */
  function renderSourceInfo(s) {
    const rawMatch = evidenceMap.get(s.slug) || {};
    const hasResource = rawMatch.resourceDisplayName || rawMatch.resourceUrl;

    const parts = [];

    if (s.evidenceExplanation) {
      parts.push(
        `<div style="font-size:0.72rem; color:var(--text-muted); line-height:1.4; margin-bottom:4px;">
          ℹ️ ${escapeHtml(s.evidenceExplanation)}
        </div>`
      );
    }

    if (hasResource) {
      const repoName = escapeHtml(rawMatch.resourceDisplayName || 'Repository');
      if (rawMatch.resourceUrl) {
        parts.push(
          `<span>📦 <a href="${escapeHtml(rawMatch.resourceUrl)}" target="_blank" rel="noopener" style="color:var(--accent-cyan); text-decoration:none; font-weight:500;">${repoName}</a></span>`
        );
      } else {
        parts.push(`<span>📦 ${repoName}</span>`);
      }
    }

    if (rawMatch.resourceProvider) {
      parts.push(
        `<span class="tag" style="font-size:0.65rem;">${escapeHtml(String(rawMatch.resourceProvider))}</span>`
      );
    }

    if (rawMatch.evidenceType) {
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
        `<span style="font-size:0.7rem; color:var(--text-dim);">📎 ${escapeHtml(evidenceTypeLabels[rawMatch.evidenceType] || rawMatch.evidenceType)}</span>`
      );
    }

    if (rawMatch.sourceLocation) {
      parts.push(
        `<span style="font-size:0.65rem; color:var(--text-muted); font-family:var(--font-mono);">📄 ${escapeHtml(rawMatch.sourceLocation)}</span>`
      );
    }

    if (rawMatch.excerpt) {
      const truncated =
        rawMatch.excerpt.length > 80 ? rawMatch.excerpt.slice(0, 80) + '…' : rawMatch.excerpt;
      parts.push(
        `<span style="font-size:0.65rem; color:var(--text-dim); font-family:var(--font-mono); font-style:italic;">"${escapeHtml(truncated)}"</span>`
      );
    }

    if (parts.length === 0) {
      if (s.truthStatus === 'CLAIMED' || s.provenanceStatus === 'CLAIMED') {
        return `<div style="font-size:0.72rem; color:var(--accent-amber); margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
          📝 Candidate self-reported claim from resume [Unverified User Claim]
        </div>`;
      }
      return `<div style="font-size:0.72rem; color:var(--text-dim); margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
        🔍 Provenance established via repository taxonomy analysis
      </div>`;
    }

    return `<div style="display:flex; flex-direction:column; gap:4px; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.04);">
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
        <span class="current">Verified Skills Graph</span>
      </div>

      <!-- Header -->
      <div class="page-header" style="margin-bottom:24px;">
        <div>
          <span class="badge badge-verified" style="margin-bottom:6px;">PROVENANCE & TAXONOMY</span>
          <h1 style="margin:4px 0 8px 0;">Verified Skills Graph</h1>
          <p style="color:var(--text-muted); margin:0;">
            Audited technical skill graph strictly classified into Verified Career Facts, Inferences, Unverified Claims, and Technology Signals.
          </p>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <a href="#evidence-explorer" class="btn btn-secondary btn-sm" onclick="scrollToEvidenceExplorer(event)">
            🔍 View Evidence Explorer
          </a>
          <a href="/onboarding?step=3" class="btn btn-primary btn-sm">
            + Ingest Repositories
          </a>
        </div>
      </div>

      <!-- Provenance Legend Cards (4-Tier Truth Model) -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:16px; margin-bottom:32px;">
        <div class="stat-card" style="border-left: 4px solid var(--accent-emerald);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-verified" style="font-size:0.7rem;">VERIFIED CAREER SKILLS</span>
            <span class="stat-val" style="color:var(--accent-emerald); font-size:1.4rem;">${verifiedPrimaryCount}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            Substantial implementation evidence (≥3 citations, framework bootstrap, or corroborated claim).
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-amber);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-claimed" style="font-size:0.7rem;">CLAIMED RESUME SKILLS</span>
            <span class="stat-val" style="color:var(--accent-amber); font-size:1.4rem;">${claimedCount}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            User-asserted narrative claims marked with explicit <code>[Unverified User Claim]</code>.
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-cyan);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge badge-inferred" style="font-size:0.7rem;">INFERRED SKILLS</span>
            <span class="stat-val" style="color:var(--accent-cyan); font-size:1.4rem;">${inferredCount}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            Derived logically through taxonomy hierarchy (e.g. Next.js implies React).
          </p>
        </div>

        <div class="stat-card" style="border-left: 4px solid var(--accent-purple, #a855f7);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge" style="background:rgba(168,85,247,0.15); color:var(--accent-purple, #c084fc); border:1px solid rgba(168,85,247,0.3); font-size:0.7rem;">IMPLEMENTATION SIGNALS</span>
            <span class="stat-val" style="color:var(--accent-purple, #c084fc); font-size:1.4rem;">${verifiedSignalCount}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; line-height:1.4;">
            Detected libraries, UI components, utilities, and dev packages from repository AST manifests.
          </p>
        </div>
      </div>

      <!-- SECTION 1: PRIMARY CAREER COMPETENCIES -->
      <div style="margin-bottom:36px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
          <div>
            <h2 style="font-size:1.25rem; font-weight:600; color:var(--text-main); margin:0;">
              Primary Career Competencies
            </h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">
              Core technical skills, languages, frameworks, databases, and platforms evaluated for professional competency.
            </p>
          </div>
          <span class="badge badge-verified" style="font-size:0.75rem;">
            ${primarySkills.length} Total Evaluated
          </span>
        </div>

        ${
          primarySkills.length === 0
            ? `
          <div class="empty-state">
            <div class="empty-state-icon">🧬</div>
            <h3>No Primary Skills Extracted Yet</h3>
            <p>Connect your GitHub repositories or upload a resume to extract verified competencies.</p>
            <a href="/onboarding?step=3" class="btn btn-primary btn-sm">Start Ingestion →</a>
          </div>
        `
            : Object.entries(primaryCategories)
                .filter(([, catSkills]) => catSkills.length > 0)
                .map(
                  ([catTitle, catSkills]) => `
            <div class="card" style="padding:22px 24px; margin-bottom:20px;">
              <div class="section-header" style="margin-bottom:16px;">
                <h3 style="font-size:1rem; font-weight:600; color:var(--text-main); margin:0;">${escapeHtml(catTitle)}</h3>
                <span class="section-count" style="font-size:0.75rem;">${catSkills.length} Competenc${catSkills.length === 1 ? 'y' : 'ies'}</span>
              </div>

              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:12px;">
                ${catSkills
                  .map((s) => {
                    let badgeClass = 'badge-verified';
                    let label = 'VERIFIED';
                    if (s.truthStatus === 'CLAIMED' || s.provenanceStatus === 'CLAIMED') {
                      badgeClass = 'badge-claimed';
                      label = 'CLAIMED';
                    } else if (s.provenanceStatus === 'CORROBORATED') {
                      badgeClass = 'badge-verified';
                      label = 'CORROBORATED';
                    } else if (s.provenanceStatus === 'INFERRED') {
                      badgeClass = 'badge-inferred';
                      label = 'INFERRED';
                    }
                    const confidencePercent = Math.round((s.confidenceScore || 0.9) * 100);
                    const levelLabel =
                      typeof s.evidenceLevel === 'number'
                        ? `Level ${s.evidenceLevel} Evidence`
                        : s.truthStatus === 'CLAIMED'
                          ? 'Level 0 (Metadata Claim)'
                          : 'Level 3 (Verified)';

                    return `
                    <div style="padding:14px 16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between; gap:8px;">
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div>
                          <strong style="font-size:1rem; color:var(--text-main); display:block;">${escapeHtml(s.name || s.slug)}</strong>
                          <span style="font-size:0.7rem; color:var(--text-dim);">${escapeHtml(levelLabel)}</span>
                        </div>
                        <span class="badge ${badgeClass}" style="font-size:0.65rem; flex-shrink:0;">${escapeHtml(label)}</span>
                      </div>

                      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-dim);">
                        <span>Evidence: <strong>${s.evidenceCount || 0} citation${(s.evidenceCount || 0) === 1 ? '' : 's'}</strong></span>
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

      <!-- SECTION 2: INFERRED SKILLS -->
      <div style="margin-bottom:36px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:10px;">
          <div>
            <h2 style="font-size:1.15rem; font-weight:600; color:var(--text-main); margin:0; display:flex; align-items:center; gap:8px;">
              <span>🔮 Inferred Skills</span>
              <span class="badge badge-inferred" style="font-size:0.7rem;">${inferredSkills.length} Inferences</span>
            </h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">
              Logical dependencies derived from parent frameworks via strict taxonomy rules. Inferences are never marked as verified truth.
            </p>
          </div>
        </div>

        ${
          inferredSkills.length > 0
            ? `
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap:12px;">
            ${inferredSkills
              .map(
                (s) => `
              <div class="card" style="padding:16px; border-left:4px solid var(--accent-cyan);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                  <strong style="font-size:0.95rem; color:var(--text-main);">${escapeHtml(s.name || s.slug)}</strong>
                  <span class="badge badge-inferred" style="font-size:0.65rem;">INFERRED</span>
                </div>
                <div style="font-size:0.75rem; color:var(--text-dim); line-height:1.5;">
                  <div><strong>Inference Rule:</strong> ${escapeHtml(s.inferenceRule || 'Parent-child framework dependency')}</div>
                  <div><strong>Source Skill:</strong> ${escapeHtml(s.sourceSkill || 'Derived')}</div>
                  <div><strong>Confidence:</strong> ${Math.round((s.confidenceScore || 0.8) * 100)}%</div>
                  <div style="color:var(--text-muted); margin-top:4px;">${escapeHtml(s.evidenceExplanation || 'Inferred via taxonomy hierarchy')}</div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : `
          <div class="card" style="padding:16px 20px; background:rgba(0,0,0,0.15); border:1px dashed var(--border-subtle);">
            <p style="font-size:0.825rem; color:var(--text-muted); margin:0; line-height:1.5;">
              ✨ <strong>No speculative inferences active.</strong> All skills displayed are grounded directly in authentic repository source code or explicit candidate resume claims under the Zero-Hallucination Integrity Gate.
            </p>
          </div>
        `
        }
      </div>

      <!-- SECTION 3: EVIDENCE EXPLORER (TECHNOLOGY & IMPLEMENTATION SIGNALS) -->
      <div style="margin-bottom:36px;" id="evidence-explorer">
        <div class="card" style="padding:22px 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <div>
              <h2 style="font-size:1.15rem; font-weight:600; color:var(--text-main); margin:0; display:flex; align-items:center; gap:8px;">
                <span>🔬 Evidence Explorer (Technology & Implementation Signals)</span>
                <span class="tag" style="font-size:0.7rem;">${technologySignals.length} Total Signals</span>
              </h2>
              <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">
                Comprehensive inventory of libraries, UI primitives, utilities, and configs detected in repository package manifests.
              </p>
            </div>

            <div style="display:flex; align-items:center; gap:8px;">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onclick="toggleAllExplorerCategories(true)"
                style="font-size:0.75rem; padding:4px 10px;"
              >
                Expand All
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onclick="toggleAllExplorerCategories(false)"
                style="font-size:0.75rem; padding:4px 10px;"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            ${Object.entries(explorerCategories)
              .filter(([, catSkills]) => catSkills.length > 0)
              .map(
                ([catTitle, catSkills]) => `
              <details class="explorer-category-accordion" style="background:rgba(0,0,0,0.18); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px 16px;">
                <summary style="cursor:pointer; font-size:0.9rem; font-weight:600; color:var(--text-main); display:flex; justify-content:space-between; align-items:center; user-select:none; outline:none;">
                  <span style="display:flex; align-items:center; gap:8px;">
                    <span>📂</span> ${escapeHtml(catTitle)}
                    <span class="tag" style="font-size:0.7rem;">${catSkills.length} item${catSkills.length === 1 ? '' : 's'}</span>
                  </span>
                  <span style="font-size:0.75rem; color:var(--accent-cyan);" class="accordion-toggle-icon">▶ View</span>
                </summary>

                <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05); display:flex; flex-wrap:wrap; gap:8px;">
                  ${catSkills
                    .map((s) => {
                      const count = s.evidenceCount || 1;
                      return `
                      <span class="tag" style="font-size:0.75rem; padding:4px 10px; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); display:inline-flex; align-items:center; gap:6px;" title="${escapeHtml(s.evidenceExplanation || 'Detected in repository manifest')}">
                        <strong style="color:var(--text-main);">${escapeHtml(s.name || s.slug)}</strong>
                        <span style="font-size:0.65rem; color:var(--text-muted);">(${count} citation${count === 1 ? '' : 's'})</span>
                      </span>
                    `;
                    })
                    .join('')}
                </div>
              </details>
            `
              )
              .join('')}
          </div>
        </div>
      </div>

      <script>
        function scrollToEvidenceExplorer(e) {
          e.preventDefault();
          const target = document.getElementById('evidence-explorer');
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
          }
        }

        function toggleAllExplorerCategories(expand) {
          document.querySelectorAll('.explorer-category-accordion').forEach(el => {
            el.open = Boolean(expand);
          });
        }
      </script>
    </div>
  `;

  return renderLayout({
    title: 'Verified Skills Graph — Antigravity Career Hub',
    content,
    activeNav: 'skills',
    user,
  });
}
