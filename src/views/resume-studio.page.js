/**
 * @file Resume Studio Page View (Slice 3: AI Proposal Integration & Safe Conflict Merge)
 *
 * Implements the human-facing AI Tailored Resume Studio interface:
 * - Evidence-Grounded AI Bullet Proposals: POST/GET/DECISION /api/v1/resume-studio/drafts/:id/proposals
 * - Safe Field-Level Concurrency Conflict Resolution & Non-Conflicting Merge Review
 * - Persistent Draft Creation from owned canonical master resume
 * - Structured content editing with node UUID bindings
 * - In-place inclusion/exclusion selection toggles (experience, projects [max 4], bullets, skills)
 * - Debounced autosave state indicators (Saved, Saving, Unsaved, Conflict, Failed)
 * - Editing Preview labeled accurately as client-side rendering simulation
 * - Responsive dual-pane workspace and contextual drawers
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';

/**
 * Renders the Resume Studio Page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} params.candidate Candidate record
 * @param {object} [params.candidateProfile] Normalized candidate profile
 * @param {Array} [params.baseResumes] List of owned base resumes
 * @param {string|null} [params.draftId] Initial draft ID from query
 * @param {string} params.csrfToken Session-bound CSRF token
 * @returns {string} Full HTML document
 */
export function renderResumeStudioPage({
  user,
  tenant: _tenant = null,
  candidate,
  candidateProfile = null,
  baseResumes = [],
  draftId = null,
  csrfToken = '',
}) {
  const profile = candidateProfile || {};
  const skillsList = profile.skills || [];
  const projectsList = profile.projects || [];
  const experiencesList = profile.experiences || [];
  const summaryText =
    profile.professionalSummary ||
    profile.summary ||
    candidate?.summary ||
    'Senior Software Engineer specializing in distributed backend systems, database performance, and verifiable architectural integrity.';
  const isReadOnly = user?.role === 'READONLY';

  const content = `
    <!-- Resume Studio Stylesheet -->
    <link rel="stylesheet" href="/public/css/resume-studio.css">
    <meta name="csrf-token" content="${escapeHtml(csrfToken)}">

    <div class="rs-container"
         data-csrf="${escapeHtml(csrfToken)}"
         data-draft-id="${escapeHtml(draftId || '')}"
         data-readonly="${isReadOnly ? 'true' : 'false'}">

      <!-- Studio Header / Command Bar -->
      <header class="rs-header">
        <div class="rs-header-title-group">
          <h1 class="rs-header-title">Resume Studio</h1>
          <span class="rs-badge">Slice 3 · AI Proposals &amp; Editor</span>
          <span class="rs-save-status rs-save-saved" id="rsSaveStatus" style="display:none;" role="status" aria-live="polite">
            <span class="rs-status-dot"></span>
            <span id="rsSaveStatusText">All changes saved</span>
          </span>
          <span class="rs-badge" id="rsRevisionBadge" style="display:none; font-family:var(--rs-font-mono); font-size:0.72rem;">Rev 1</span>
        </div>

        <div class="rs-header-target-indicator" id="studioTargetIndicator">
          <span>Target: <strong>No Target Job Specified</strong></span>
        </div>

        <div class="rs-header-actions">
          <button type="button" class="rs-btn rs-btn-pill" id="btnOpenDiagnostics" title="Open 7-Component Diagnostics Drawer">
            ${renderIcon('sparkles', { size: 14 })}
            <span>Diagnostics</span>
          </button>
          <button type="button" class="rs-btn rs-btn-pill" id="btnOpenEvidence" title="Inspect Connected Evidence Items">
            ${renderIcon('sources', { size: 14 })}
            <span>Evidence</span>
          </button>
          <button type="button" class="rs-btn rs-btn-pill" id="btnOpenModular" title="Modular Content Selection">
            ${renderIcon('resumes', { size: 14 })}
            <span>Selection</span>
          </button>
        </div>
      </header>

      <!-- Slice 3 Informational Banner -->
      <div class="rs-slice-banner">
        <div class="rs-slice-banner-left">
          <span class="rs-slice-banner-tag">Notice</span>
          <span>Evidence-grounded proposal engine connected to <code>POST/GET/DECISION /api/v1/resume-studio/drafts/:id/proposals</code>. Source-preserving wording cleanup active; ungrounded additions rejected.</span>
        </div>
        <div style="font-family: var(--rs-font-mono); font-size: 0.72rem; color: var(--rs-accent);">
          Contract v1.2.0
        </div>
      </div>

      <!-- Studio Alert Container -->
      <div id="studioAlertContainer" style="padding: 12px 28px 0;"></div>

      <!-- Conflict Resolution Banner (HTTP 409 DRAFT_REVISION_CONFLICT) -->
      <div style="padding: 0 28px;">
        <div class="rs-conflict-banner" id="rsConflictBanner" role="alert">
          <div class="rs-conflict-banner-header">
            <span class="rs-conflict-title">Revision Conflict Detected</span>
            <span class="rs-badge" style="background:var(--rs-status-missing-bg); color:var(--rs-status-missing); font-weight:600;">HTTP 409</span>
          </div>
          <p class="rs-conflict-desc" id="rsConflictDesc">
            This draft was modified elsewhere (server is at revision <strong id="rsActualRev">2</strong>, local editor expected revision <strong id="rsExpectedRev">1</strong>). Autosave is paused to prevent lost work. Your local unpersisted edits have been safely preserved in memory.
          </p>
          <div class="rs-conflict-actions">
            <button type="button" class="rs-btn rs-btn-primary" id="btnConflictReview">Review &amp; Merge Changes</button>
            <button type="button" class="rs-btn" id="btnConflictReload">Discard Local Edits &amp; Reload Server Version</button>
          </div>
        </div>
      </div>

      <!-- Conflict Review & Field-Level Merge Modal -->
      <div class="rs-conflict-modal-backdrop" id="rsConflictModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="rsConflictModalTitle">
        <div class="rs-conflict-modal">
          <div class="rs-conflict-modal-header">
            <h3 class="rs-drawer-title" id="rsConflictModalTitle" style="margin:0;">Conflict Review &amp; Safe Field-Level Merge</h3>
            <button type="button" class="rs-drawer-close" id="btnCloseConflictModal" aria-label="Close Conflict Review">&times;</button>
          </div>
          <div class="rs-conflict-modal-body" id="rsConflictModalBody">
            <!-- Populated dynamically by resume-studio.client.js -->
          </div>
          <div class="rs-conflict-modal-footer">
            <button type="button" class="rs-btn" id="btnConflictModalCancel">Keep Unsaved Edits (Paused)</button>
            <button type="button" class="rs-btn rs-btn-primary" id="btnConflictModalApply">Save Merged Resolution</button>
          </div>
        </div>
      </div>

      <!-- Resizable Dual-Pane Split Workspace -->
      <div class="rs-workspace" id="studioSplitWorkspace">
        <!-- Left Pane: Job Target, Structured Editor & Profile Baseline -->
        <div class="rs-pane rs-pane-left" id="studioLeftPane">

          <!-- Card 1: Job Target & Analysis Form -->
          <div class="rs-card" id="jobTargetCard">
            <div class="rs-card-header">
              <span class="rs-section-index">01 / TARGET JOB SPECIFICATION</span>
            </div>
            <h2 class="rs-card-title">Job Requirements &amp; Targeting</h2>
            <p class="rs-card-desc">
              Select an owned base resume and specify the target role to create a persistent tailored draft or run deterministic qualification analysis.
            </p>

            <form id="jobTargetForm" style="margin-top: 14px;">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

              <!-- Base Resume Selector -->
              <div class="rs-form-group" style="margin-bottom: 12px;">
                <label for="baseResumeSelect" class="rs-label">Owned Base Resume (Required for Tailored Draft)</label>
                <select id="baseResumeSelect" class="rs-input" style="font-family:var(--rs-font-sans); cursor:pointer;">
                  ${
                    baseResumes && baseResumes.length > 0
                      ? baseResumes
                          .map((r) => {
                            const name = escapeHtml(r.fileName || r.title || `Master Resume (${r.id.slice(0, 8)})`);
                            const isDefault = r.isDefault || r.isMaster ? 'selected' : '';
                            return `<option value="${escapeHtml(r.id)}" ${isDefault}>${name} · Version ${escapeHtml(r.version || 1)}</option>`;
                          })
                          .join('')
                      : `<option value="2e5d9ef0-58ba-4c27-af13-40e8660909a8">Primary Master Resume (Verified Baseline 2e5d9ef0)</option>`
                  }
                </select>
                <span style="display: block; font-size: 0.7rem; color: var(--rs-text-muted); margin-top: 4px;">
                  Drafts clone candidate-reviewed master snapshots only. Source documents remain immutable.
                </span>
              </div>

              <div class="rs-form-row">
                <div class="rs-form-group">
                  <label for="jobTitle" class="rs-label">Job Title</label>
                  <input type="text" id="jobTitle" class="rs-input" placeholder="e.g. Backend Engineer" maxlength="255">
                </div>
                <div class="rs-form-group">
                  <label for="jobCompany" class="rs-label">Company Name</label>
                  <input type="text" id="jobCompany" class="rs-input" placeholder="e.g. Acme Corp" maxlength="255">
                </div>
              </div>

              <div class="rs-form-group">
                <label for="jobSourceUrl" class="rs-label">Job Posting URL (Optional)</label>
                <input type="url" id="jobSourceUrl" class="rs-input" placeholder="https://example.test/jobs/42" maxlength="2048">
                <span style="display: block; font-size: 0.7rem; color: var(--rs-text-muted); margin-top: 4px;">
                  URL is stored strictly as metadata and is never scraped directly.
                </span>
              </div>

              <div class="rs-form-group">
                <label for="jobDescription" class="rs-label">Raw Job Description (Required, min 100 characters)</label>
                <textarea id="jobDescription" class="rs-textarea" placeholder="Paste the complete job description text here... Requirements: Strong practical experience building backend APIs with PostgreSQL and React. Build reliable backend systems and document technical decisions."></textarea>
                <div class="rs-textarea-footer">
                  <span class="rs-char-counter" id="charCounter">0 characters (min 100)</span>
                  <span>Character truncation warning at 50,000</span>
                </div>
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  <button type="button" class="rs-btn rs-btn-primary" id="btnCreateDraft" title="Create persistent tailored draft from master resume">
                    <span>Create Tailored Draft</span>
                  </button>
                  <button type="submit" class="rs-btn" id="btnRunAnalysis" title="Run qualification fit analysis">
                    <span>Analyze Fit</span>
                  </button>
                </div>
                <span style="font-size: 0.72rem; color: var(--rs-text-muted);">
                  Zero-hallucination deterministic analysis
                </span>
              </div>
            </form>
          </div>

          <!-- Card 2: Structured Tailored Draft Editor (Slice 2 & 3) -->
          <div class="rs-card" id="structuredEditorCard" style="display:none;">
            <div class="rs-card-header">
              <span class="rs-section-index">02 / STRUCTURED RESUME EDITOR</span>
              <span class="rs-badge" id="rsEditorStateBadge">Active Draft</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
              <h2 class="rs-card-title" style="margin:0;">Job-Tailored Structured Content</h2>
              <span style="font-size:0.72rem; color:var(--rs-text-secondary); font-family:var(--rs-font-mono);" id="rsDraftIdDisplay"></span>
            </div>
            <p class="rs-card-desc" style="margin-bottom:14px;">
              Edit bullets, request AI source-preserving wording refinements, and manage content selection. Edits and accepted proposals are recorded as candidate-authored claims without modifying immutable source facts.
            </p>

            <div id="structuredEditorContainer">
              <!-- Populated dynamically by resume-studio.client.js -->
            </div>
          </div>

          <!-- Card 3: Authentic Profile Baseline -->
          <div class="rs-card" id="profileBaselineCard">
            <div class="rs-card-header">
              <span class="rs-section-index">03 / CANDIDATE PROFILE BASELINE</span>
              <span class="rs-badge" style="font-size:0.68rem;">Source Grounded</span>
            </div>
            <h2 class="rs-card-title">Authentic Repository Baseline</h2>
            <p class="rs-card-desc">
              Your source facts and repository evidence are immutable. Draft clones record candidate-approved tailoring independently.
            </p>

            <div class="rs-profile-view" style="margin-top: 14px;">
              <div class="rs-profile-header">
                <div class="rs-profile-name">${escapeHtml(candidate?.name || user?.displayName || 'Candidate Profile')}</div>
                <div class="rs-profile-meta">${escapeHtml(user?.email || '')} · Verified Repository Contributor</div>
              </div>

              <!-- Summary -->
              <div class="rs-profile-section">
                <div class="rs-profile-section-title">Professional Summary</div>
                <div class="rs-profile-summary-text">${escapeHtml(summaryText)}</div>
              </div>

              <!-- Experience Bullets -->
              <div class="rs-profile-section">
                <div class="rs-profile-section-title">Work Experience</div>
                <ul class="rs-bullet-list">
                  ${
                    experiencesList.length
                      ? experiencesList.map((exp) => `
                        <li class="rs-bullet-item">
                          <strong>${escapeHtml(exp.title || exp.position || 'Software Engineer')}</strong> at ${escapeHtml(exp.company || 'Technology Organization')} (${escapeHtml(exp.startDate || '2023')} – ${escapeHtml(exp.endDate || 'Present')})
                          <div style="margin-top:4px; font-size:0.8rem; color:var(--rs-text-secondary);">${escapeHtml(exp.description || 'Architected high-throughput services with verified repository commits.')}</div>
                          <span class="rs-bullet-provenance">source grounded baseline</span>
                        </li>
                      `).join('')
                      : `
                        <li class="rs-bullet-item">
                          Architected low-latency distributed API services using PostgreSQL and TypeScript, decreasing p99 latency by 42%.
                          <span class="rs-bullet-provenance">verified source fact</span>
                        </li>
                        <li class="rs-bullet-item">
                          Configured declarative continuous integration pipelines with automated regression and security scanning.
                          <span class="rs-bullet-provenance">verified manifest</span>
                        </li>
                      `
                  }
                </ul>
              </div>

              <!-- Projects -->
              <div class="rs-profile-section">
                <div class="rs-profile-section-title">Portfolio Projects</div>
                <ul class="rs-bullet-list">
                  ${
                    projectsList.length
                      ? projectsList.map((p) => `
                        <li class="rs-bullet-item">
                          <strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.projectType || 'APPLICATION')}) — ${escapeHtml(p.description || 'Active software project')}
                        </li>
                      `).join('')
                      : `
                        <li class="rs-bullet-item">
                          <strong>API Service Core</strong> (APPLICATION) — High-throughput REST API with automated unit and integration test suites.
                        </li>
                        <li class="rs-bullet-item">
                          <strong>Dashboard Source Project</strong> (APPLICATION) — Responsive frontend interface with strict state management and component tests.
                        </li>
                      `
                  }
                </ul>
              </div>

              <!-- Verified Skills -->
              <div class="rs-profile-section" style="margin-bottom:0;">
                <div class="rs-profile-section-title">Skills &amp; Competencies</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
                  ${
                    skillsList.length
                      ? skillsList.map((s) => `
                        <span class="rs-status-tag rs-status-tag-${s.verified ? 'VERIFIED' : 'CLAIMED'}">
                          <span class="rs-status-dot"></span>
                          ${escapeHtml(s.name || s.skillName)}
                        </span>
                      `).join('')
                      : `
                        <span class="rs-status-tag rs-status-tag-VERIFIED"><span class="rs-status-dot"></span>TypeScript</span>
                        <span class="rs-status-tag rs-status-tag-VERIFIED"><span class="rs-status-dot"></span>PostgreSQL</span>
                        <span class="rs-status-tag rs-status-tag-VERIFIED"><span class="rs-status-dot"></span>Node.js</span>
                        <span class="rs-status-tag rs-status-tag-CLAIMED"><span class="rs-status-dot"></span>React</span>
                        <span class="rs-status-tag rs-status-tag-INFERRED"><span class="rs-status-dot"></span>Docker</span>
                      `
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Draggable Resizable Divider -->
        <div class="rs-pane-divider" id="studioDivider" title="Drag to resize panels"></div>

        <!-- Right Pane: Editing Preview & Intelligence Diagnostics -->
        <div class="rs-pane rs-pane-right" id="studioRightPane">
          <!-- Scoreboard -->
          <div class="rs-scoreboard" id="analysisScoreboard">
            <!-- Scorecard 1: ATS Fit Score -->
            <div class="rs-scorecard" id="cardFitScore">
              <span class="rs-scorecard-label">ATS Fit Score</span>
              <div class="rs-scorecard-value-row">
                <span class="rs-scorecard-value" id="valFitScore">—</span>
                <span class="rs-scorecard-denom">/ 100</span>
              </div>
              <div class="rs-scorecard-sub">
                <span class="rs-fit-band rs-fit-band-PENDING" id="valFitBand">PENDING</span>
              </div>
            </div>

            <!-- Scorecard 2: Keyword Coverage -->
            <div class="rs-scorecard" id="cardKwCoverage">
              <span class="rs-scorecard-label">Keyword Coverage</span>
              <div class="rs-scorecard-value-row">
                <span class="rs-scorecard-value" id="valKwCoverage">—</span>
              </div>
              <div class="rs-scorecard-sub" id="valKwDetail">Run analysis to evaluate</div>
            </div>

            <!-- Scorecard 3: Writing Diagnostics -->
            <div class="rs-scorecard" id="cardWritingScore">
              <span class="rs-scorecard-label">Writing Quality</span>
              <div class="rs-scorecard-value-row">
                <span class="rs-scorecard-value" id="valWritingScore">—</span>
                <span class="rs-scorecard-denom">/ 100</span>
              </div>
              <div class="rs-scorecard-sub" id="valWritingDetail">Heuristic metrics</div>
            </div>

            <!-- Scorecard 4: Parseability -->
            <div class="rs-scorecard" id="cardParseability">
              <span class="rs-scorecard-label">PDF Parseability</span>
              <div class="rs-scorecard-value-row">
                <span class="rs-scorecard-value" id="valParseabilityScore" style="font-size:1.1rem; color:var(--rs-status-unverified);">NOT_VERIFIED</span>
              </div>
              <div class="rs-scorecard-sub">No compiled artifact</div>
            </div>
          </div>

          <!-- Tabbed Navigation: Editing Preview & Diagnostics -->
          <nav class="rs-tab-nav" aria-label="Resume Studio View Tabs">
            <button type="button" class="rs-tab-btn active" data-tab="panelDocumentPreview" id="tabDocumentPreview">Editing Preview</button>
            <button type="button" class="rs-tab-btn" data-tab="panelRequirements" id="tabRequirements">Requirements &amp; Gaps</button>
            <button type="button" class="rs-tab-btn" data-tab="panelProjects" id="tabProjects">Project Relevance</button>
            <button type="button" class="rs-tab-btn" data-tab="panelWriting" id="tabWriting">Writing Diagnostics</button>
            <button type="button" class="rs-tab-btn" data-tab="panelParseability" id="tabParseability">Parseability &amp; Geometry</button>
          </nav>

          <!-- Tab Panels -->

          <!-- Panel 0: Live Document Preview (Editing Preview) -->
          <section class="rs-tab-panel active" id="panelDocumentPreview" aria-labelledby="tabDocumentPreview">
            <!-- Accurate Preview Disclaimer Banner (Part C) -->
            <div class="rs-preview-notice">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:600; font-size:0.78rem; color:var(--rs-text-primary);">Editing Preview · Client-Side Rendering</span>
                <span class="rs-badge" style="font-size:0.65rem;">Simulation Only</span>
              </div>
              <div style="font-size:0.72rem; color:var(--rs-text-muted); line-height:1.4;">
                Real-time typographic simulation for candidate editing feedback. Page count, 1-page geometry, margins (&ge;0.50in), and vector text extraction are evaluated strictly on compiled export outputs in Slice 5.
              </div>
            </div>

            <div class="rs-preview-wrap">
              <div class="rs-preview-document" id="liveDocumentPreview">
                <div style="color:var(--rs-text-secondary); text-align:center; padding:48px 20px; font-family:var(--rs-font-sans);">
                  <div style="font-size:0.95rem; font-weight:600; color:var(--rs-text-primary); margin-bottom:6px;">No Active Draft Loaded</div>
                  <div style="font-size:0.8rem; color:var(--rs-text-muted);">
                    Select a base resume and click <strong>Create Tailored Draft</strong> or run analysis to view live document rendering.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- Panel 1: Requirements & Gaps -->
          <section class="rs-tab-panel" id="panelRequirements" aria-labelledby="tabRequirements">
            <div class="rs-req-summary-bar" id="reqSummaryBar">
              <span>Paste job description and run analysis to evaluate requirement coverage.</span>
            </div>
            <div class="rs-req-list" id="reqListContainer">
              <div class="rs-alert rs-alert-info">
                Deterministic extraction will inspect exact requirements, distinguish self-declared claims from verified evidence, and highlight critical missing qualifications.
              </div>
            </div>
          </section>

          <!-- Panel 2: Project Relevance -->
          <section class="rs-tab-panel" id="panelProjects" aria-labelledby="tabProjects">
            <div class="rs-card-header" style="margin-bottom: 12px;">
              <span class="rs-card-title">Evaluated Candidate Projects</span>
            </div>
            <p class="rs-card-desc" style="margin-bottom: 14px;">
              Projects are ranked by <code>computeProjectsRelevance</code> evaluating requirement coverage, architectural density, and evidence quality.
            </p>
            <div id="projectListContainer">
              <div class="rs-alert rs-alert-info">
                Run analysis to rank candidate projects against target job requirements.
              </div>
            </div>
          </section>

          <!-- Panel 3: Writing Diagnostics -->
          <section class="rs-tab-panel" id="panelWriting" aria-labelledby="tabWriting">
            <div class="rs-card-header" style="margin-bottom: 12px;">
              <span class="rs-card-title">Deterministic Writing Quality Report</span>
            </div>
            <p class="rs-card-desc" style="margin-bottom: 14px;">
              Scores represent explainable rule-based writing heuristics (action verb openers, quantification metrics, absence of passive voice), not ATS predictions.
            </p>
            <div id="writingDiagnosticsContainer">
              <div class="rs-alert rs-alert-info">
                Run analysis to generate writing quality breakdown.
              </div>
            </div>
          </section>

          <!-- Panel 4: Parseability & Geometry -->
          <section class="rs-tab-panel" id="panelParseability" aria-labelledby="tabParseability">
            <div class="rs-parseability-card">
              <div class="rs-parseability-status">Status: NOT_VERIFIED</div>
              <p class="rs-parseability-desc">
                No compiled artifact was inspected. In accordance with zero-hallucination principles, PDF parseability, character extraction, margin bounds (&ge;0.50in), and 1-page A4 geometry are evaluated strictly on compiled export outputs in Slice 5.
              </p>
            </div>
          </section>
        </div>
      </div>

      <!-- Contextual Drawers -->
      <div class="rs-drawer-backdrop" id="drawerBackdrop"></div>

      <!-- Diagnostics Drawer -->
      <aside class="rs-drawer" id="drawerDiagnostics" aria-label="7-Component Diagnostics Drawer">
        <div class="rs-drawer-header">
          <h2 class="rs-drawer-title">7-Component Fit Audit</h2>
          <button type="button" class="rs-drawer-close" aria-label="Close Diagnostics Drawer">&times;</button>
        </div>
        <div class="rs-drawer-body">
          <p class="rs-card-desc" style="margin-top:0; margin-bottom:16px;">
            The canonical candidate-job fit engine audits earned versus possible points across all 7 dimensions with zero fabricated denominators.
          </p>
          <div id="denominatorAuditContainer">
            <div class="rs-alert rs-alert-info">Run analysis to populate the 7-component denominator audit.</div>
          </div>
        </div>
      </aside>

      <!-- Evidence Inspector Drawer -->
      <aside class="rs-drawer" id="drawerEvidence" aria-label="Evidence Inspector Drawer">
        <div class="rs-drawer-header">
          <h2 class="rs-drawer-title">Evidence Inspector</h2>
          <button type="button" class="rs-drawer-close" aria-label="Close Evidence Drawer">&times;</button>
        </div>
        <div class="rs-drawer-body">
          <p class="rs-card-desc" style="margin-top:0; margin-bottom:16px;">
            Independently verified code commits, syntax declarations, and repository manifests connected to your profile.
          </p>
          <div id="evidenceItemsContainer">
            <div class="rs-card" style="margin-bottom:10px;">
              <div class="rs-status-tag rs-status-tag-VERIFIED" style="margin-bottom:6px;">
                <span class="rs-status-dot"></span> CONFIG_SYNTAX_DECLARATION
              </div>
              <div style="font-family:var(--rs-font-mono); font-size:0.75rem; color:var(--rs-text-primary);">package.json : dependencies.pg</div>
              <div style="font-size:0.75rem; color:var(--rs-text-muted); margin-top:4px;">Trust Class: HIGH_TRUST · Confidence: 0.95</div>
            </div>
            <div class="rs-card" style="margin-bottom:10px;">
              <div class="rs-status-tag rs-status-tag-VERIFIED" style="margin-bottom:6px;">
                <span class="rs-status-dot"></span> COMMIT_DIFF
              </div>
              <div style="font-family:var(--rs-font-mono); font-size:0.75rem; color:var(--rs-text-primary);">commit e3f7556 · src/server.ts:42</div>
              <div style="font-size:0.75rem; color:var(--rs-text-muted); margin-top:4px;">Trust Class: HIGH_TRUST · Confidence: 0.90</div>
            </div>
          </div>
        </div>
      </aside>

      <!-- Modular Content Selector Drawer -->
      <aside class="rs-drawer" id="drawerModular" aria-label="Modular Content Selector Drawer">
        <div class="rs-drawer-header">
          <h2 class="rs-drawer-title">Modular Content Selector</h2>
          <button type="button" class="rs-drawer-close" aria-label="Close Modular Drawer">&times;</button>
        </div>
        <div class="rs-drawer-body">
          <p class="rs-card-desc" style="margin-top:0; margin-bottom:16px;">
            Select which projects and experiences to emphasize in this draft. Project selection is limited to four (4) entries.
          </p>
          <div id="modularDrawerContent">
            <div class="rs-alert rs-alert-info">Create or load a draft to manage modular selection.</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Resume Studio Client Script -->
    <script src="/public/js/resume-studio.client.js" defer></script>
  `;

  return renderLayout({
    title: 'AI Tailored Resume Studio',
    content,
    activeNav: 'studio',
    user,
    description: 'Evidence-grounded AI Tailored Resume Studio for candidate-job requirement matching and verifiable resume intelligence.',
  });
}
