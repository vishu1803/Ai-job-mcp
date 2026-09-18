/**
 * @file Simplified Job Application Web View (/applications/:id/apply)
 *
 * Implements the calm, linear application journey:
 * Job -> Apply -> Check readiness -> Fix only missing/conflicting -> Review application -> Submit/handoff
 *
 * Distinct UX Highlights:
 * 1. "Ready to apply" checklist with green ticks (Resume, Email, Phone, Education, Experience, Skills, Links).
 * 2. "Needs your attention" panel with clear separation between Missing vs Conflict:
 *    - Missing: "We need your {field}" with [Add] / [Answer] action.
 *    - Conflict: "Your profile says X, but this application says Y" with [Keep X], [Use Y], [Edit profile].
 * 3. Profile Data Reuse: Valid profile data is inherited and never re-asked.
 * 4. Application-specific questions isolated from permanent candidate profile.
 * 5. Review Screen displaying Job, Company, Candidate Identity, Resume, Answers, and Declarations
 *    with ZERO internal resolver or AST implementation details.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';

/**
 * Renders the simplified Job Application page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} params.application Job application database record
 * @param {object} params.flowState Standardized flow state from JobApplicationFlowService
 * @param {object} params.reviewSnapshot Review screen view model
 * @param {string} [params.activeStep='readiness'] Active step: 'readiness' | 'questions' | 'review'
 * @param {string} [params.flashMessage=''] Flash success message
 * @param {string} [params.errorMessage=''] Error message
 * @returns {string} Full HTML document
 */
export function renderApplyPage({
  user,
  tenant: _tenant = null,
  application,
  flowState,
  reviewSnapshot,
  activeStep = 'readiness',
  flashMessage = '',
  errorMessage = '',
}) {
  const job = flowState.targetJob || {};
  const readyToApply = flowState.readyToApply || [];
  const needsAttention = flowState.needsAttention || [];
  const applicationQuestions = flowState.applicationQuestions || [];
  const canSubmit = flowState.semantics?.canSubmit && reviewSnapshot.canSubmit;
  const isSubmitted = application.status === 'APPLIED' || Boolean(application.appliedAt);

  const missingItems = needsAttention.filter((i) => i.type === 'MISSING');
  const conflictItems = needsAttention.filter((i) => i.type === 'CONFLICT');
  const confirmItems = needsAttention.filter((i) => i.type === 'CONFIRMATION');

  const content = `
    <style>
      .apply-workflow-container {
        max-width: 960px;
        margin: 0 auto 60px;
      }
      .workflow-stepper {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 28px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border-subtle);
        overflow-x: auto;
      }
      .step-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--text-dim);
        text-decoration: none;
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        white-space: nowrap;
      }
      .step-item.active {
        color: var(--text-main);
        background: rgba(99, 102, 241, 0.12);
        border: 1px solid rgba(99, 102, 241, 0.3);
      }
      .step-item.complete {
        color: #10B981;
      }
      .step-num {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.75rem;
        background: var(--surface-card);
      }
      .step-item.active .step-num {
        background: var(--accent-indigo);
        color: #fff;
      }
      .step-item.complete .step-num {
        background: #10B981;
        color: #0B0F19;
      }
      .step-divider {
        color: var(--border-subtle);
      }

      .readiness-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        margin-bottom: 32px;
      }
      @media (max-width: 860px) {
        .readiness-grid {
          grid-template-columns: 1fr;
        }
      }

      .ready-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ready-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.04);
        border-radius: 6px;
        font-size: 0.85rem;
      }
      .ready-item-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .check-circle {
        color: #10B981;
        font-weight: 800;
        font-size: 0.95rem;
      }
      .ready-label {
        font-weight: 600;
        color: var(--text-main);
      }
      .ready-val {
        color: var(--text-dim);
        font-size: 0.775rem;
        text-align: right;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .attention-stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .attention-card {
        padding: 16px 18px;
        border-radius: var(--radius-md);
        background: #0B0F19;
        border: 1px solid var(--border-subtle);
      }
      .attention-card.missing {
        border-color: rgba(245, 158, 11, 0.4);
        background: rgba(245, 158, 11, 0.03);
      }
      .attention-card.conflict {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.04);
      }
      .attention-card.confirm {
        border-color: rgba(99, 102, 241, 0.4);
        background: rgba(99, 102, 241, 0.03);
      }

      .conflict-banner {
        font-size: 0.875rem;
        color: #FCA5A5;
        margin: 6px 0 12px;
        line-height: 1.4;
      }
      .conflict-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .review-panel {
        background: #111827;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 24px 28px;
        margin-bottom: 24px;
      }
      .review-grid-2col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      @media (max-width: 680px) {
        .review-grid-2col {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="container apply-workflow-container">
      <!-- Top Navigation Breadcrumbs -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin: 24px 0 16px;">
        <a href="/applications" class="back-nav-link" style="text-decoration:none; color:var(--text-muted); font-size:0.875rem;">
          &larr; Back to Applications
        </a>
        <div style="font-size:0.8rem; color:var(--text-dim);">
          Application ID: <span style="font-family:var(--font-mono);">${escapeHtml(application.id.slice(0, 8))}</span>
        </div>
      </div>

      <!-- Flash & Error Messages -->
      ${flashMessage ? `<div class="alert alert-success" style="margin-bottom:20px;">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom:20px;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Page Header -->
      <div class="card" style="margin-bottom:24px; padding:24px 28px; background:linear-gradient(180deg, #111827 0%, #0B0F19 100%);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span class="badge badge-indigo">JOB APPLICATION</span>
              <span class="badge ${isSubmitted ? 'badge-verified' : 'badge-neutral'}">
                ${isSubmitted ? 'SUBMITTED / APPLIED' : 'APPLICATION WORKFLOW'}
              </span>
            </div>
            <h1 style="font-size:1.65rem; font-weight:800; color:var(--text-main); margin:0 0 6px 0;">
              ${escapeHtml(job.title)}
            </h1>
            <div style="display:flex; align-items:center; gap:10px; color:var(--text-muted); font-size:0.875rem;">
              <span style="font-weight:600; color:var(--text-main);">${escapeHtml(job.company)}</span>
              <span>&bull;</span>
              <span>${escapeHtml(job.location)}</span>
              ${job.url ? `<span>&bull;</span> <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener" style="color:var(--accent-indigo); text-decoration:none;">Job Posting &nearr;</a>` : ''}
            </div>
          </div>

          ${
            isSubmitted
              ? `
            <a href="/applications/${application.id}/handoff" class="btn btn-primary" style="text-decoration:none;">
              Open Handoff Kit &nearr;
            </a>
          `
              : ''
          }
        </div>
      </div>

      <!-- Linear Workflow Stepper -->
      <div class="workflow-stepper">
        <a href="?step=readiness" class="step-item ${activeStep === 'readiness' ? 'active' : ''} ${needsAttention.length === 0 ? 'complete' : ''}">
          <span class="step-num">${needsAttention.length === 0 ? renderIcon('check', { size: 12 }) : '1'}</span>
          <span>1. Application Readiness</span>
          ${needsAttention.length > 0 ? `<span class="badge badge-missing" style="font-size:0.65rem; padding:1px 5px;">${needsAttention.length} to fix</span>` : ''}
        </a>

        ${
          applicationQuestions.length > 0
            ? `
          <span class="step-divider">&rarr;</span>
          <a href="?step=questions" class="step-item ${activeStep === 'questions' ? 'active' : ''} ${flowState.semantics?.unansweredCustomCount === 0 ? 'complete' : ''}">
            <span class="step-num">${flowState.semantics?.unansweredCustomCount === 0 ? renderIcon('check', { size: 12 }) : '2'}</span>
            <span>2. Role Declarations</span>
          </a>
        `
            : ''
        }

        <span class="step-divider">&rarr;</span>
        <a href="?step=review" class="step-item ${activeStep === 'review' ? 'active' : ''}">
          <span class="step-num">${applicationQuestions.length > 0 ? '3' : '2'}</span>
          <span>Review &amp; Submit</span>
        </a>
      </div>

      <!-- STEP 1: READINESS CHECK -->
      ${
        activeStep === 'readiness'
          ? `
        <div class="readiness-grid">
          <!-- Left Column: Ready to Apply -->
          <div class="card" style="padding:22px 24px; background:#111827;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <div>
                <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0;">Ready to apply</h2>
                <div style="font-size:0.775rem; color:var(--text-dim); margin-top:2px;">Inherited from canonical candidate profile</div>
              </div>
              <span class="badge badge-verified">${readyToApply.length} Ready</span>
            </div>

            <div class="ready-list">
              ${readyToApply
                .map(
                  (item) => `
                <div class="ready-item">
                  <div class="ready-item-left">
                    <span class="check-circle">&check;</span>
                    <span class="ready-label">${escapeHtml(item.label)}</span>
                  </div>
                  <span class="ready-val" title="${escapeHtml(item.value || '')}">${escapeHtml(item.value || 'Verified')}</span>
                </div>
              `
                )
                .join('')}
            </div>
          </div>

          <!-- Right Column: Needs your attention -->
          <div class="card" style="padding:22px 24px; background:#111827;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
              <div>
                <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0;">Needs your attention</h2>
                <div style="font-size:0.775rem; color:var(--text-dim); margin-top:2px;">Resolve missing or conflicting information</div>
              </div>
              <span class="badge ${needsAttention.length === 0 ? 'badge-verified' : 'badge-amber'}">
                ${needsAttention.length === 0 ? 'All Clear' : `${needsAttention.length} Actionable`}
              </span>
            </div>

            ${
              needsAttention.length === 0
                ? `
              <div style="text-align:center; padding:36px 16px; background:#0B0F19; border:1px solid rgba(16, 185, 129, 0.2); border-radius:var(--radius-md);">
                <div style="color:#10B981; font-size:1.8rem; margin-bottom:8px;">&check;</div>
                <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0 0 6px 0;">All Requirements Ready</h3>
                <p style="color:var(--text-muted); font-size:0.825rem; max-width:320px; margin:0 auto 18px;">
                  Your profile and application answers are completely aligned. Proceed to review and finalize your submission.
                </p>
                <a href="?step=review" class="btn btn-primary btn-sm" style="text-decoration:none;">
                  Continue to Review &rarr;
                </a>
              </div>
            `
                : `
              <div class="attention-stack">
                <!-- 1. Conflicts -->
                ${conflictItems
                  .map(
                    (item) => `
                  <div class="attention-card conflict">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <span class="badge badge-missing" style="font-size:0.7rem; font-weight:700;">&#9889; CONFLICT</span>
                      <span style="font-weight:700; font-size:0.85rem; color:var(--text-main);">${escapeHtml(item.label)}</span>
                    </div>
                    <div class="conflict-banner">
                      ${escapeHtml(item.prompt)}
                    </div>
                    <div class="conflict-actions">
                      <form action="/applications/${application.id}/apply/resolve" method="POST" style="display:inline; margin:0;">
                        <input type="hidden" name="field" value="${escapeHtml(item.field)}">
                        <input type="hidden" name="choice" value="KEEP_PROFILE">
                        <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.75rem; font-weight:600;">
                          ${escapeHtml(item.choices[0].label)}
                        </button>
                      </form>
                      <form action="/applications/${application.id}/apply/resolve" method="POST" style="display:inline; margin:0;">
                        <input type="hidden" name="field" value="${escapeHtml(item.field)}">
                        <input type="hidden" name="choice" value="USE_APPLICATION">
                        <button type="submit" class="btn btn-secondary btn-sm" style="font-size:0.75rem; font-weight:600;">
                          ${escapeHtml(item.choices[1].label)}
                        </button>
                      </form>
                      <a href="${escapeHtml(item.profileAnchor || '/profile')}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="font-size:0.75rem; text-decoration:none;">
                        Edit profile &nearr;
                      </a>
                    </div>
                  </div>
                `
                  )
                  .join('')}

                <!-- 2. Missing Items -->
                ${missingItems
                  .map(
                    (item) => `
                  <div class="attention-card missing">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                      <span class="badge badge-amber" style="font-size:0.7rem; font-weight:700;">&#9888; MISSING</span>
                      <span style="font-weight:700; font-size:0.85rem; color:var(--text-main);">${escapeHtml(item.label)}</span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-main); margin-bottom:10px;">
                      ${escapeHtml(item.prompt)}
                    </div>

                    <!-- Inline Quick Answer Form -->
                    <form action="/applications/${application.id}/apply/resolve" method="POST" style="margin:0;">
                      <input type="hidden" name="field" value="${escapeHtml(item.field)}">
                      ${
                        item.field === 'noticePeriod'
                          ? `
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                          <select name="value" class="form-select" style="font-size:0.8rem; padding:5px 8px; flex:1;" required>
                            <option value="">Select notice period...</option>
                            <option value="immediate">Immediate</option>
                            <option value="less_than_1_week">Less than 1 week</option>
                            <option value="1_to_2_weeks">1 to 2 weeks</option>
                            <option value="30_days">30 days (1 month)</option>
                            <option value="60_days">60 days (2 months)</option>
                            <option value="90_days">90 days (3 months)</option>
                          </select>
                          <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.775rem;">Save &amp; Add</button>
                        </div>
                      `
                          : item.field === 'workAuthorization'
                            ? `
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                          <select name="value" class="form-select" style="font-size:0.8rem; padding:5px 8px; flex:1;" required>
                            <option value="">Select work authorization...</option>
                            <option value="Authorized to work in United States (Citizen)">Citizen</option>
                            <option value="Permanent Resident (Green Card)">Permanent Resident</option>
                            <option value="Authorized to work with Visa">Work Visa (H1B / L1 / TN / O1)</option>
                            <option value="Student Visa (F1 OPT / CPT)">Student Visa (OPT / CPT)</option>
                            <option value="Need Visa Sponsorship">Need Visa Sponsorship</option>
                            <option value="Authorized in India">Authorized in India</option>
                          </select>
                          <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.775rem;">Answer</button>
                        </div>
                      `
                            : item.field === 'visaSponsorship'
                              ? `
                        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
                          <label style="font-size:0.8rem; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="radio" name="value" value="NO" required> No sponsorship needed
                          </label>
                          <label style="font-size:0.8rem; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="radio" name="value" value="YES" required> Will require sponsorship
                          </label>
                          <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.775rem; margin-left:auto;">Answer</button>
                        </div>
                      `
                              : `
                        <div style="display:flex; gap:8px; align-items:center;">
                          <input type="text" name="value" class="form-control" placeholder="Enter ${escapeHtml(item.label.toLowerCase())}..." style="font-size:0.8rem; padding:5px 8px; flex:1;" required>
                          <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.775rem;">Save</button>
                        </div>
                      `
                      }
                      <div style="margin-top:6px;">
                        <label style="font-size:0.725rem; color:var(--text-dim); display:inline-flex; align-items:center; gap:5px; cursor:pointer;">
                          <input type="checkbox" name="saveToProfile" value="true" checked>
                          Save this answer as my default career preference in profile
                        </label>
                      </div>
                    </form>
                  </div>
                `
                  )
                  .join('')}

                <!-- 3. Confirmations -->
                ${confirmItems
                  .map(
                    (item) => `
                  <div class="attention-card confirm">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <span class="badge badge-indigo" style="font-size:0.7rem; font-weight:700;">&#8505; CONFIRMATION</span>
                      <span style="font-weight:700; font-size:0.85rem; color:var(--text-main);">${escapeHtml(item.label)}</span>
                    </div>
                    <div style="font-size:0.85rem; color:var(--text-main); margin-bottom:8px;">
                      ${escapeHtml(item.prompt)}
                    </div>
                    ${item.value ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:10px; font-family:var(--font-mono);">${escapeHtml(item.value)}</div>` : ''}
                    <form action="/applications/${application.id}/apply/resolve" method="POST" style="margin:0;">
                      <input type="hidden" name="field" value="${escapeHtml(item.field)}">
                      <input type="hidden" name="value" value="${escapeHtml(item.value || 'CONFIRMED')}">
                      <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.75rem; font-weight:600;">
                        Confirm &bull; Matches My Status
                      </button>
                    </form>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>
        </div>
      `
          : ''
      }

      <!-- STEP 2: APPLICATION QUESTIONS -->
      ${
        activeStep === 'questions' && applicationQuestions.length > 0
          ? `
        <div class="card review-panel">
          <div style="margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px;">
            <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0 0 4px 0;">Role-Specific Declarations</h2>
            <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">
              These questions are specific to <strong>${escapeHtml(job.company)}</strong> and will remain isolated to this application.
            </p>
          </div>

          <form action="/applications/${application.id}/apply/resolve" method="POST">
            <input type="hidden" name="isCustomQuestionBatch" value="true">
            <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
              ${applicationQuestions
                .map(
                  (q) => `
                <div class="form-group" style="background:#0B0F19; border:1px solid var(--border-subtle); border-radius:6px; padding:16px;">
                  <label class="form-label" style="font-weight:600; font-size:0.875rem; margin-bottom:6px; display:block;">
                    ${escapeHtml(q.prompt)} ${q.required ? '<span style="color:#EF4444;">*</span>' : '(optional)'}
                  </label>
                  ${q.helpText ? `<div style="font-size:0.775rem; color:var(--text-dim); margin-bottom:8px;">${escapeHtml(q.helpText)}</div>` : ''}
                  <input type="text" name="custom_${escapeHtml(q.id)}" class="form-control" value="${escapeHtml(q.answer || '')}" placeholder="Your answer..." ${q.required ? 'required' : ''} style="font-size:0.875rem;">
                </div>
              `
                )
                .join('')}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="?step=readiness" class="btn btn-secondary btn-sm">&larr; Back to Readiness</a>
              <button type="submit" class="btn btn-primary btn-sm">Save &amp; Continue to Review &rarr;</button>
            </div>
          </form>
        </div>
      `
          : ''
      }

      <!-- STEP 3: REVIEW & SUBMIT -->
      ${
        activeStep === 'review'
          ? `
        <div class="review-panel">
          <div style="margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0 0 4px 0;">Review Your Application</h2>
              <div style="font-size:0.85rem; color:var(--text-muted);">
                Verify your submission package before generating your handoff kit.
              </div>
            </div>
            ${
              reviewSnapshot.canSubmit
                ? `<span class="badge badge-verified" style="padding:5px 10px; font-weight:700;">&#10003; Ready for Submission</span>`
                : `<span class="badge badge-missing" style="padding:5px 10px; font-weight:700;">&#9888; Action Items Required</span>`
            }
          </div>

          <!-- Target Job & Candidate Summary -->
          <div class="review-grid-2col" style="margin-bottom:20px;">
            <div class="card" style="padding:16px 18px; background:#0B0F19; border:1px solid var(--border-subtle);">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">
                Target Role &amp; Employer
              </div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">${escapeHtml(reviewSnapshot.job.title)}</div>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                ${escapeHtml(reviewSnapshot.job.company)} &bull; ${escapeHtml(reviewSnapshot.job.location)}
              </div>
            </div>

            <div class="card" style="padding:16px 18px; background:#0B0F19; border:1px solid var(--border-subtle);">
              <div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; margin-bottom:8px;">
                Candidate Identity
              </div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">${escapeHtml(reviewSnapshot.candidateIdentity.name)}</div>
              <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                ${escapeHtml(reviewSnapshot.candidateIdentity.email)} &bull; ${escapeHtml(reviewSnapshot.candidateIdentity.phone)}
              </div>
            </div>
          </div>

          <!-- Attached Tailored Resume -->
          <div class="card" style="padding:16px 18px; background:#0B0F19; border:1px solid var(--border-subtle); margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="background:rgba(99, 102, 241, 0.12); color:var(--accent-indigo); width:36px; height:36px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                PDF
              </div>
              <div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">${escapeHtml(reviewSnapshot.resume.title)}</div>
                <div style="font-size:0.775rem; color:var(--text-dim); font-family:var(--font-mono);">
                  ATS Alignment: ${reviewSnapshot.resume.atsScore}/100 &bull; Verified Claims Grounded
                </div>
              </div>
            </div>
            <div style="display:inline-flex; gap:8px;">
              <a href="${escapeHtml(reviewSnapshot.resume.viewUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="text-decoration:none;">View PDF &nearr;</a>
              <a href="${escapeHtml(reviewSnapshot.resume.downloadUrl)}" class="btn btn-secondary btn-sm" style="text-decoration:none;" download>Download</a>
            </div>
          </div>

          <!-- Important Answers Table -->
          <div style="margin-bottom:24px;">
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:10px;">
              Screening Answers &amp; Preferences
            </div>
            <div style="border:1px solid var(--border-subtle); border-radius:6px; overflow:hidden;">
              <table style="width:100%; border-collapse:collapse; font-size:0.825rem;">
                <tbody>
                  ${reviewSnapshot.importantAnswers
                    .map(
                      (ans, idx) => `
                    <tr style="background:${idx % 2 === 0 ? '#0B0F19' : '#111827'}; border-bottom:1px solid rgba(255,255,255,0.04);">
                      <td style="padding:10px 14px; font-weight:600; color:var(--text-muted); width:200px;">${escapeHtml(ans.label)}</td>
                      <td style="padding:10px 14px; color:var(--text-main);">${escapeHtml(ans.value)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Unresolved Issues Warning (if any) -->
          ${
            reviewSnapshot.unresolvedIssues.length > 0
              ? `
            <div class="alert alert-error" style="margin-bottom:24px; padding:16px;">
              <div style="font-weight:700; margin-bottom:4px;">Cannot submit: unresolved readiness issues remain</div>
              <ul style="margin:4px 0 0 18px; padding:0; font-size:0.825rem;">
                ${reviewSnapshot.unresolvedIssues.map((issue) => `<li><strong>${escapeHtml(issue.label)}</strong>: ${escapeHtml(issue.prompt)}</li>`).join('')}
              </ul>
              <div style="margin-top:10px;">
                <a href="?step=readiness" class="btn btn-secondary btn-sm" style="color:#fff; background:rgba(239, 68, 68, 0.2); border-color:#EF4444; text-decoration:none;">
                  &larr; Fix Issues in Step 1
                </a>
              </div>
            </div>
          `
              : ''
          }

          <!-- Submission Gateway Form -->
          <form action="/applications/${application.id}/apply/submit" method="POST">
            <div style="background:#0B0F19; border:1px solid var(--border-subtle); border-radius:6px; padding:18px; margin-bottom:24px;">
              <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">
                Applicant Declarations
              </div>
              <div style="display:flex; flex-direction:column; gap:12px;">
                ${reviewSnapshot.declarations
                  .map(
                    (decl) => `
                  <label style="display:flex; align-items:flex-start; gap:10px; font-size:0.825rem; color:var(--text-muted); cursor:pointer;">
                    <input type="checkbox" name="declarations_${escapeHtml(decl.id)}" value="true" ${decl.confirmed || decl.required ? 'checked' : ''} ${decl.required ? 'required' : ''} style="margin-top:2px;">
                    <span>
                      <strong style="color:var(--text-main);">${escapeHtml(decl.label)}:</strong>
                      ${escapeHtml(decl.text)}
                    </span>
                  </label>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <a href="?step=readiness" class="btn btn-secondary btn-sm">&larr; Back to Readiness</a>

              ${
                canSubmit
                  ? `
                <button type="submit" class="btn btn-primary" data-loading-text="Submitting Application..." style="padding:10px 22px; font-weight:700; font-size:0.925rem;">
                  Submit Application &bull; Handoff Kit &rarr;
                </button>
              `
                  : `
                <button type="button" disabled class="btn btn-secondary disabled" style="opacity:0.5; cursor:not-allowed;" title="Resolve all items in Needs your attention before submitting">
                  Submit Application (Resolve Needs Attention First)
                </button>
              `
              }
            </div>
          </form>
        </div>
      `
          : ''
      }
    </div>
  `;

  return renderLayout({
    title: `Apply: ${job.title} at ${job.company}`,
    content,
    user,
    currentPath: '/applications',
  });
}
