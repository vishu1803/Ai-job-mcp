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
  candidate: _candidate,
  candidateProfile: _candidateProfile = null,
  baseResumes = [],
  draftId = null,
  csrfToken = '',
  initialJobTarget = null,
  sourceResumeId = null,
  returnContext = { href: '/resumes', label: 'Back to Resumes', origin: 'Resumes' },
}) {
  const isReadOnly = user?.role === 'READONLY';

  const content = `
    <!-- Resume Studio Stylesheet -->
    <link rel="stylesheet" href="/public/css/resume-studio.css">
    <meta name="csrf-token" content="${escapeHtml(csrfToken)}">

    <div class="rs-container"
         data-csrf="${escapeHtml(csrfToken)}"
         data-draft-id="${escapeHtml(draftId || '')}"
         data-readonly="${isReadOnly ? 'true' : 'false'}">

      <div class="ch-studio-context"><nav aria-label="Breadcrumb"><a href="${escapeHtml(returnContext.href)}">${escapeHtml(returnContext.origin)}</a><span>/</span><span>Resume Studio</span></nav><a id="studioReturnLink" href="${escapeHtml(returnContext.href)}">&larr; ${escapeHtml(returnContext.label)}</a></div>
      <!-- Studio Header / Command Bar -->
      <header class="rs-header">
        <div class="rs-header-title-group">
          <h1 class="rs-header-title">Resume Studio</h1>
          <span class="rs-save-status rs-save-saved" id="rsSaveStatus" style="display:none;" role="status" aria-live="polite">
            <span class="rs-status-dot"></span>
            <span id="rsSaveStatusText">All changes saved</span>
          </span>
          <button type="button" class="rs-btn" id="btnRetrySave" hidden>Retry save</button>
        </div>

        <div class="rs-header-target-indicator" id="studioTargetIndicator">
          <span>Target: <strong>No Target Job Specified</strong></span>
        </div>

        <div class="rs-header-actions">
          <button type="button" class="rs-btn rs-btn-pill" id="btnOpenDiagnostics" title="Inspect requirement diagnostics">
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

      <!-- Studio Alert Container -->
      <div id="studioAlertContainer" style="padding: 12px 28px 0;"></div>

      <!-- Conflict Resolution Banner (HTTP 409 DRAFT_REVISION_CONFLICT) -->
      <div style="padding: 0 28px;">
        <div class="rs-conflict-banner" id="rsConflictBanner" role="alert">
          <div class="rs-conflict-banner-header">
            <span class="rs-conflict-title">Changes need review</span>
          </div>
          <p class="rs-conflict-desc" id="rsConflictDesc">
            Another tab saved changes. Your unsaved wording is retained in this tab. Compare before saving, or choose the saved version. <span hidden>Server <strong id="rsActualRev">2</strong>; previous <strong id="rsExpectedRev">1</strong>.</span>
          </p>
          <div class="rs-conflict-actions">
            <button type="button" class="rs-btn rs-btn-primary" id="btnConflictReview">Compare changes</button>
            <button type="button" class="rs-btn" id="btnConflictReload">Use saved version</button>
          </div>
        </div>
      </div>

      <!-- Conflict Review & Field-Level Merge Modal -->
      <div class="rs-conflict-modal-backdrop" id="rsConflictModalBackdrop" role="dialog" aria-modal="true" aria-labelledby="rsConflictModalTitle">
        <div class="rs-conflict-modal">
          <div class="rs-conflict-modal-header">
            <h3 class="rs-drawer-title" id="rsConflictModalTitle" style="margin:0;">Review changes</h3>
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
              Choose your master resume and paste a job description. Review the requirements, then create your tailored draft.
            </p>

            <details id="rsJobDetails" open><summary>Job target</summary>
            <form id="jobTargetForm" style="margin-top: 14px;">
              <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

              <!-- Base Resume Selector -->
              <div class="rs-form-group" style="margin-bottom: 12px;">
                <label for="baseResumeSelect" class="rs-label">Master resume</label>
                <select id="baseResumeSelect" class="rs-input" style="font-family:var(--rs-font-sans); cursor:pointer;">
                  ${
                    baseResumes && baseResumes.length > 0
                      ? baseResumes
                          .map((r) => {
                            const name = escapeHtml(
                              r.fileName || r.title || `Master Resume (${r.id.slice(0, 8)})`
                            );
                            const isDefault =
                              r.id === sourceResumeId || r.isDefault || r.isMaster
                                ? 'selected'
                                : '';
                            return `<option value="${escapeHtml(r.id)}" ${isDefault}>${name} · Version ${escapeHtml(r.version || 1)}</option>`;
                          })
                          .join('')
                      : `<option value="">No reviewed master resume available</option>`
                  }
                </select>
                <span style="display: block; font-size: 0.7rem; color: var(--rs-text-muted); margin-top: 4px;">
                  Your master resume stays unchanged.
                </span>
              </div>

              <div class="rs-form-row">
                <div class="rs-form-group">
                  <label for="jobTitle" class="rs-label">Job Title</label>
                  <input type="text" id="jobTitle" value="${escapeHtml(initialJobTarget?.title || '')}" class="rs-input" placeholder="e.g. Backend Engineer" maxlength="255">
                </div>
                <div class="rs-form-group">
                  <label for="jobCompany" class="rs-label">Company Name</label>
                  <input type="text" id="jobCompany" value="${escapeHtml(initialJobTarget?.company || '')}" class="rs-input" placeholder="e.g. Acme Corp" maxlength="255">
                </div>
              </div>

              <div class="rs-form-group">
                <label for="jobSourceUrl" class="rs-label">Job Posting URL (Optional)</label>
                <input type="url" id="jobSourceUrl" value="${escapeHtml(initialJobTarget?.sourceUrl || '')}" class="rs-input" placeholder="https://example.test/jobs/42" maxlength="2048">
                <span style="display: block; font-size: 0.7rem; color: var(--rs-text-muted); margin-top: 4px;">
                  Paste the description below. A posting URL is needed to approve an application package.
                </span>
              </div>

              <div class="rs-form-group">
                <label for="jobDescription" class="rs-label">Job description</label>
                <textarea id="jobDescription" class="rs-textarea" placeholder="Paste the complete job description text here... Requirements: Strong practical experience building backend APIs with PostgreSQL and React. Build reliable backend systems and document technical decisions.">${escapeHtml(initialJobTarget?.rawDescription || '')}</textarea>
                <div class="rs-textarea-footer">
                  <span class="rs-char-counter" id="charCounter">0 characters (min 100)</span>
                  <span>Character truncation warning at 50,000</span>
                </div>
              </div>

              <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  <button type="button" class="rs-btn rs-btn-primary" id="btnCreateDraft" ${isReadOnly || !baseResumes.length ? 'disabled' : ''} title="Create persistent tailored draft from master resume">
                    <span>Create Tailored Draft</span>
                  </button>
                  <button type="submit" class="rs-btn" id="btnRunAnalysis" title="Run qualification fit analysis">
                    <span>Analyze Fit</span>
                  </button>
                </div>
                <span style="font-size: 0.72rem; color: var(--rs-text-muted);">
                  
                </span>
              </div>
            </form></details>
          </div>

          <!-- Card 2: Structured Tailored Draft Editor (Slice 2 & 3) -->
          <div class="rs-card" id="structuredEditorCard" style="display:none;">
            <div class="rs-card-header">
              <span class="rs-section-index">02 / STRUCTURED RESUME EDITOR</span>
              <span class="rs-badge" id="rsEditorStateBadge">Active Draft</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
              <h2 class="rs-card-title" style="margin:0;">Your resume</h2>

            </div>
            <p class="rs-card-desc" style="margin-bottom:14px;">
              Select relevant content and edit your wording. AI suggestions preserve your facts; you decide whether to use them. Candidate-reported claims remain distinct from verified evidence.
            </p>

            <details id="rsHistory"><summary>Version history</summary><div id="rsHistoryList"></div><div id="rsHistoryReview"></div></details>
            <div id="structuredEditorContainer">
              <!-- Populated dynamically by resume-studio.client.js -->
            </div>
          </div>

        </div>

        <!-- Draggable Resizable Divider -->
        <div class="rs-pane-divider" id="studioDivider" role="separator" tabindex="0" aria-label="Resize editor and preview" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" title="Drag to resize panels"></div>

        <!-- Right Pane: Editing Preview & Intelligence Diagnostics -->
        <div class="rs-pane rs-pane-right" id="studioRightPane">
          <!-- Scoreboard -->
          <div class="rs-scoreboard" id="analysisScoreboard">
            <!-- Scorecard 1: Candidate?job fit -->
            <div class="rs-scorecard" id="cardFitScore">
              <span class="rs-scorecard-label">Candidate–job fit</span>
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

          </div>

          <!-- Tabbed Navigation: Editing Preview & Diagnostics -->
          <nav class="rs-tab-nav" aria-label="Resume Studio View Tabs">
            <button type="button" class="rs-tab-btn active" data-tab="panelDocumentPreview" id="tabDocumentPreview">Document</button>
            <button type="button" class="rs-tab-btn" data-tab="panelRequirements" id="tabRequirements">Requirements &amp; Gaps</button>
            <button type="button" class="rs-tab-btn" data-tab="panelProjects" id="tabProjects">Project Relevance</button>
            <button type="button" class="rs-tab-btn" data-tab="panelWriting" id="tabWriting">Writing Diagnostics</button>
          </nav>

          <!-- Tab Panels -->

          <!-- Panel 0: Live Document Preview (Editing Preview) -->
          <section class="rs-tab-panel active" id="panelDocumentPreview" aria-labelledby="tabDocumentPreview">
            <div class="rs-document-toolbar">
              <button type="button" class="rs-btn" id="btnCompilePreview" ${isReadOnly ? 'disabled' : ''}>Refresh document</button>
              <label class="rs-label">Zoom <select id="rsDocumentZoom" class="rs-input"><option value="FIT">Fit to width</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option></select></label>
              <span id="rsDocumentStatus" role="status" aria-live="polite">Create a draft to preview the final document.</span>
            </div>
            <div id="rsDocumentPreview" class="rs-actual-preview"></div>
            <div class="rs-document-actions">
              <button type="button" class="rs-btn" id="btnExportPdf" disabled>Download PDF</button>
              <button type="button" class="rs-btn" id="btnExportDocx" disabled>Download Word</button>
              <label><input type="checkbox" id="rsApprovalReviewed" disabled> I reviewed this document.</label>
              <button type="button" class="rs-btn rs-btn-primary" id="btnApprovePackage" disabled>Approve package</button>
              <p class="rs-card-desc">Approval records your review and does not submit an application.</p>
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
              Review project alignment with the role. A relevance score is a local recommendation, not proof of a qualification.
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

        </div>
      </div>

      <!-- Contextual Drawers -->
      <div class="rs-drawer-backdrop" id="drawerBackdrop"></div>

      <!-- Diagnostics Drawer -->
      <aside class="rs-drawer" id="drawerDiagnostics" aria-label="7-Component Diagnostics Drawer">
        <div class="rs-drawer-header">
          <h2 class="rs-drawer-title">Requirement diagnostics</h2>
          <button type="button" class="rs-drawer-close" aria-label="Close Diagnostics Drawer">&times;</button>
        </div>
        <div class="rs-drawer-body">
          <p class="rs-card-desc" style="margin-top:0; margin-bottom:16px;">
            The canonical candidate-job fit engine audits earned versus possible points across all 7 dimensions with explainable weights.
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
            Inspect source observations and candidate-reported claims. A repository observation does not independently prove personal proficiency.
          </p>
          <div id="evidenceItemsContainer"><p class="rs-card-desc">Run analysis or inspect a wording proposal to see its supporting sources. Candidate-authored claims are unverified.</p></div>
        </div>
      </aside>

      <!-- Modular Content Selector Drawer -->
      <aside class="rs-drawer" id="drawerModular" aria-label="Modular Content Selector Drawer">
        <div class="rs-drawer-header">
          <h2 class="rs-drawer-title">Included content</h2>
          <button type="button" class="rs-drawer-close" aria-label="Close Modular Drawer">&times;</button>
        </div>
        <div class="rs-drawer-body">
          <p class="rs-card-desc" style="margin-top:0; margin-bottom:16px;">
            Review your selection and jump to an item in the editor to change it. Include up to four projects.
          </p>
          <div id="modularDrawerContent">
            <div class="rs-alert rs-alert-info">Create or load a draft to manage modular selection.</div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Resume Studio Client Script -->
    <script type="module" src="/public/js/resume-studio.client.js" defer></script>
  `;

  return renderLayout({
    title: 'AI Tailored Resume Studio',
    content,
    activeNav: 'studio',
    user,
    description:
      'Evidence-grounded AI Tailored Resume Studio for candidate-job requirement matching and verifiable resume intelligence.',
  });
}
