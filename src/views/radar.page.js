/**
 * @file Job Fit Radar Interactive Web Page View (/apps/radar).
 *
 * Provides:
 * - Discover Jobs live market feed grounded in verified evidence
 * - Saved Jobs pipeline tracking
 * - Standalone custom job description analysis with deterministic ATS fit scoring
 * - Pre-hydrated radar result rendering with 6-axis SVG visualization
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';
import { renderEmptyState } from './components/state-views.js';

/**
 * Unified Job Radar & Opportunities Workspace Page.
 *
 * @param {object} params
 * @param {object|null} params.user Authenticated user
 * @param {object|null} params.tenant Authenticated tenant
 * @param {object|null} params.candidate Candidate identity
 * @param {string} [params.tab='discover'] Active tab: 'discover' | 'saved' | 'analyze'
 * @param {string} [params.query=''] Search query
 * @param {string} [params.location=''] Location query
 * @param {string} [params.workplaceType=''] Workplace filter
 * @param {Array} [params.discoveredJobs=[]] Discovered live jobs
 * @param {Array} [params.savedJobApplications=[]] Saved applications
 * @param {string|null} [params.discoveryError] Error message if live feed unavailable
 * @param {string|null} [params.flashSuccess] Success notification message
 * @param {string|null} [params.flashError] Error notification message
 * @param {string} [params.initialJobTitle=''] Preset job title for custom analysis
 * @param {string} [params.initialCompanyName=''] Preset company name for custom analysis
 * @returns {string} Full HTML page
 */
export function renderRadarPage({
  user = null,
  tenant: _tenant = null,
  candidate: _candidate = null,
  tab = 'discover',
  query = '',
  location = '',
  workplaceType = '',
  discoveredJobs = [],
  savedJobApplications = [],
  discoveryError = null,
  flashSuccess = null,
  flashError = null,
  initialJobTitle = '',
  initialCompanyName = '',
}) {
  const activeTab = ['discover', 'saved', 'analyze'].includes(tab) ? tab : 'discover';

  const content = `
    <div class="container" style="max-width: 1120px; margin: 0 auto 60px; padding: 0 20px;">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link" style="display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); text-decoration:none; font-size:0.875rem; margin-bottom:12px;">
        <span aria-hidden="true">&larr;</span> Back to Dashboard
      </a>

      <!-- Breadcrumbs -->
      <div class="breadcrumb" style="display:flex; align-items:center; gap:8px; font-size:0.825rem; color:var(--text-dim); margin-bottom:24px;">
        <a href="/dashboard" style="color:var(--text-muted); text-decoration:none;">Overview</a>
        <span>/</span>
        <a href="/apps/radar" style="color:var(--text-muted); text-decoration:none;">Jobs</a>
        <span>/</span>
        <span style="color:var(--text-main); font-weight:600;">Market Radar</span>
      </div>

      <!-- Page Header -->
      <div class="page-header" style="margin-bottom:28px; display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:8px;">CAREER INTELLIGENCE</span>
          <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em; margin:4px 0 8px 0; color:var(--text-main);">Job Radar &amp; Market Fit</h1>
          <p style="color:var(--text-muted); font-size:0.95rem; margin:0; max-width:680px; line-height:1.5;">
            Discover authentic opportunities matching your verified skills, track your target pipeline, and evaluate job descriptions with deterministic ATS scoring.
          </p>
        </div>
      </div>

      <!-- Alerts -->
      ${flashSuccess ? `<div class="alert alert-success" style="margin-bottom:24px; padding:12px 18px; border-radius:var(--radius-md); background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); color:#A7F3D0; font-size:0.875rem;">${escapeHtml(flashSuccess)}</div>` : ''}
      ${flashError ? `<div class="alert alert-error" style="margin-bottom:24px; padding:12px 18px; border-radius:var(--radius-md); background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#FCA5A5; font-size:0.875rem;">${escapeHtml(flashError)}</div>` : ''}

      <!-- Tab Navigation -->
      <div class="tab-bar" style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); margin-bottom:28px; padding-bottom:2px;">
        <a href="/apps/radar?tab=discover${query ? `&q=${encodeURIComponent(query)}` : ''}"
           class="tab-item ${activeTab === 'discover' ? 'active' : ''}"
           style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; text-decoration:none; font-size:0.9rem; font-weight:600; border-radius:var(--radius-md) var(--radius-md) 0 0; color:${activeTab === 'discover' ? 'var(--text-main)' : 'var(--text-muted)'}; background:${activeTab === 'discover' ? 'rgba(99,102,241,0.12)' : 'transparent'}; border-bottom:2px solid ${activeTab === 'discover' ? 'var(--accent-indigo)' : 'transparent'};">
          ${renderIcon('radar', { size: 16 })}
          <span>Discover Jobs</span>
        </a>
        <a href="/apps/radar?tab=saved"
           class="tab-item ${activeTab === 'saved' ? 'active' : ''}"
           style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; text-decoration:none; font-size:0.9rem; font-weight:600; border-radius:var(--radius-md) var(--radius-md) 0 0; color:${activeTab === 'saved' ? 'var(--text-main)' : 'var(--text-muted)'}; background:${activeTab === 'saved' ? 'rgba(99,102,241,0.12)' : 'transparent'}; border-bottom:2px solid ${activeTab === 'saved' ? 'var(--accent-indigo)' : 'transparent'};">
          ${renderIcon('briefcase', { size: 16 })}
          <span>Saved Pipeline</span>
          <span class="badge ${savedJobApplications.length > 0 ? 'badge-indigo' : 'badge-subtle'}" style="font-size:0.75rem; padding:1px 6px;">${savedJobApplications.length}</span>
        </a>
        <a href="/apps/radar?tab=analyze"
           class="tab-item ${activeTab === 'analyze' ? 'active' : ''}"
           style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; text-decoration:none; font-size:0.9rem; font-weight:600; border-radius:var(--radius-md) var(--radius-md) 0 0; color:${activeTab === 'analyze' ? 'var(--text-main)' : 'var(--text-muted)'}; background:${activeTab === 'analyze' ? 'rgba(99,102,241,0.12)' : 'transparent'}; border-bottom:2px solid ${activeTab === 'analyze' ? 'var(--accent-indigo)' : 'transparent'};">
          ${renderIcon('clipboard', { size: 16 })}
          <span>Custom Analysis</span>
        </a>
      </div>

      <!-- ================================================================= -->
      <!-- TAB 1: DISCOVER JOBS                                              -->
      <!-- ================================================================= -->
      ${
        activeTab === 'discover'
          ? `
        <!-- Filter Bar -->
        <div class="card" style="padding:18px 22px; margin-bottom:24px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <form method="GET" action="/apps/radar" style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
            <input type="hidden" name="tab" value="discover">
            <div style="flex:2; min-width:240px;">
              <input type="text" name="q" value="${escapeHtml(query)}" placeholder="Role title, skills, keywords (e.g. Distributed Systems, Node.js)..." class="form-control" style="width:100%; font-size:0.875rem;">
            </div>
            <div style="flex:1; min-width:180px;">
              <input type="text" name="location" value="${escapeHtml(location)}" placeholder="Location (e.g. Remote, San Francisco)..." class="form-control" style="width:100%; font-size:0.875rem;">
            </div>
            <div style="min-width:140px;">
              <select name="workplaceType" class="form-select" style="width:100%; font-size:0.875rem;">
                <option value="">All Workplaces</option>
                <option value="REMOTE" ${workplaceType === 'REMOTE' ? 'selected' : ''}>Remote</option>
                <option value="HYBRID" ${workplaceType === 'HYBRID' ? 'selected' : ''}>Hybrid</option>
                <option value="ONSITE" ${workplaceType === 'ONSITE' ? 'selected' : ''}>Onsite</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px; padding:8px 18px;">
              ${renderIcon('search', { size: 14 })}
              <span>Search</span>
            </button>
          </form>
        </div>

        ${
          discoveryError
            ? `
          <div class="alert alert-warning" style="margin-bottom:24px; padding:12px 18px; border-radius:var(--radius-md); background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); color:#FDE68A; font-size:0.875rem;">
            ${escapeHtml(discoveryError)}
          </div>
        `
            : ''
        }

        <!-- Results Counter -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; font-size:0.85rem; color:var(--text-dim);">
          <span>Showing <strong>${discoveredJobs.length}</strong> live opportunit${discoveredJobs.length === 1 ? 'y' : 'ies'}</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Grounded in verified candidate skills</span>
        </div>

        ${
          discoveredJobs.length === 0
            ? renderEmptyState({
                title: 'No Live Opportunities Found',
                message: 'No live job board postings matched your current search parameters. Broaden your search or evaluate a custom role in Custom Analysis.',
                actionLabel: 'Analyze a Job Posting',
                actionHref: '/apps/radar?tab=analyze',
                icon: 'radar',
              })
            : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:18px;">
            ${discoveredJobs
              .map((job) => {
                const isSaved = Boolean(job.isSaved);
                const score = Number.isFinite(job.atsScore) ? job.atsScore : 75;
                const matchBadgeClass =
                  score >= 80 ? 'badge-verified' : score >= 60 ? 'badge-indigo' : 'badge-amber';

                return `
              <div class="card" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); transition:border-color 0.15s ease;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:10px;">
                    <div>
                      <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0 0 3px 0; line-height:1.3;">
                        ${escapeHtml(job.title)}
                      </h3>
                      <div style="font-size:0.875rem; font-weight:600; color:var(--text-dim);">
                        ${escapeHtml(job.company)}
                      </div>
                    </div>
                    <span class="badge ${matchBadgeClass}" style="flex-shrink:0;">
                      ${score}% Match
                    </span>
                  </div>

                  <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-dim); margin-bottom:14px; flex-wrap:wrap;">
                    <span style="display:inline-flex; align-items:center; gap:4px;">
                      ${renderIcon('mapPin', { size: 12 })}
                      <span>${escapeHtml(job.location || 'Remote')}</span>
                    </span>
                    <span>&bull;</span>
                    <span>${escapeHtml(job.workplaceType || 'Full-Time')}</span>
                    ${job.source ? `<span>&bull;</span> <span style="font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(job.source)}</span>` : ''}
                  </div>

                  ${
                    Array.isArray(job.matchedSkills) && job.matchedSkills.length > 0
                      ? `
                    <div style="margin-bottom:8px;">
                      <div style="font-size:0.725rem; font-weight:600; color:#10B981; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">
                        Verified Matches
                      </div>
                      <div style="display:flex; flex-wrap:wrap; gap:4px;">
                        ${job.matchedSkills
                          .slice(0, 4)
                          .map(
                            (s) =>
                              `<span class="tag" style="font-size:0.725rem; padding:2px 7px; background:rgba(16,185,129,0.1); color:#6EE7B7; border:1px solid rgba(16,185,129,0.25); border-radius:4px;">${escapeHtml(s)}</span>`
                          )
                          .join('')}
                      </div>
                    </div>
                  `
                      : ''
                  }

                  ${
                    Array.isArray(job.missingSkills) && job.missingSkills.length > 0
                      ? `
                    <div style="margin-bottom:16px;">
                      <div style="font-size:0.725rem; font-weight:600; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">
                        Additional Requirements
                      </div>
                      <div style="display:flex; flex-wrap:wrap; gap:4px;">
                        ${job.missingSkills
                          .slice(0, 3)
                          .map(
                            (s) =>
                              `<span class="tag" style="font-size:0.725rem; padding:2px 7px; background:rgba(255,255,255,0.04); color:var(--text-muted); border:1px solid var(--border-subtle); border-radius:4px;">${escapeHtml(s)}</span>`
                          )
                          .join('')}
                      </div>
                    </div>
                  `
                      : ''
                  }
                </div>

                <!-- Action Controls -->
                <div style="display:flex; gap:10px; align-items:center; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-subtle);">
                  ${
                    isSaved
                      ? `
                    <form action="/jobs/unsave" method="POST" style="margin:0; flex:1;">
                      <input type="hidden" name="jobId" value="${escapeHtml(job.id)}">
                      <button type="submit" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center; display:inline-flex; align-items:center; gap:6px; color:#10B981;">
                        ${renderIcon('check', { size: 13 })}
                        <span>Saved</span>
                      </button>
                    </form>
                  `
                      : `
                    <form action="/jobs/save" method="POST" style="margin:0; flex:1;">
                      <input type="hidden" name="jobId" value="${escapeHtml(job.id)}">
                      <input type="hidden" name="title" value="${escapeHtml(job.title)}">
                      <input type="hidden" name="company" value="${escapeHtml(job.company)}">
                      <input type="hidden" name="location" value="${escapeHtml(job.location || '')}">
                      <input type="hidden" name="workplaceType" value="${escapeHtml(job.workplaceType || '')}">
                      <input type="hidden" name="url" value="${escapeHtml(job.url || '')}">
                      <input type="hidden" name="skills" value="${escapeHtml((job.skills || []).join(','))}">
                      <input type="hidden" name="atsScore" value="${score}">
                      <button type="submit" class="btn btn-primary btn-sm" style="width:100%; justify-content:center; display:inline-flex; align-items:center; gap:6px;">
                        ${renderIcon('plus', { size: 13 })}
                        <span>Save Job</span>
                      </button>
                    </form>
                  `
                  }
                  <a href="/apps/radar?tab=analyze&jobTitle=${encodeURIComponent(job.title)}&companyName=${encodeURIComponent(job.company)}" class="btn btn-secondary btn-sm" style="flex:1; justify-content:center; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                    ${renderIcon('clipboard', { size: 13 })}
                    <span>Analyze</span>
                  </a>
                </div>
              </div>
            `;
              })
              .join('')}
          </div>
        `
        }
      `
          : ''
      }

      <!-- ================================================================= -->
      <!-- TAB 2: SAVED PIPELINE                                             -->
      <!-- ================================================================= -->
      ${
        activeTab === 'saved'
          ? `
        ${
          savedJobApplications.length === 0
            ? renderEmptyState({
                title: 'No Saved Jobs in Pipeline',
                message: 'You have not saved any opportunities yet. Save roles from the Discover feed to prepare tailored application kits.',
                actionLabel: 'Discover Matching Jobs',
                actionHref: '/apps/radar?tab=discover',
                icon: 'briefcase',
              })
            : `
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(330px, 1fr)); gap:18px;">
            ${savedJobApplications
              .map((app) => {
                const atsScore =
                  app.atsFitSnapshot?.overallScore || app.atsFitSnapshot?.atsScore || 75;
                const badgeClass =
                  atsScore >= 80 ? 'badge-verified' : atsScore >= 60 ? 'badge-indigo' : 'badge-amber';
                const savedDate = app.createdAt
                  ? new Date(app.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Recently';

                return `
              <div class="card" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px;">
                    <div>
                      <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0 0 3px 0;">
                        ${escapeHtml(app.jobTitle || 'Role')}
                      </h3>
                      <div style="font-size:0.875rem; font-weight:600; color:var(--text-dim);">
                        ${escapeHtml(app.companyName || 'Company')}
                      </div>
                    </div>
                    <span class="badge ${badgeClass}" style="flex-shrink:0;">
                      ${atsScore}% Fit
                    </span>
                  </div>

                  <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-dim); margin-bottom:12px;">
                    <span>${escapeHtml(app.location || 'Remote')}</span>
                    <span>&bull;</span>
                    <span>Saved ${savedDate}</span>
                  </div>
                </div>

                <div style="display:flex; gap:10px; align-items:center; margin-top:16px; padding-top:14px; border-top:1px solid var(--border-subtle);">
                  <a href="/applications" class="btn btn-primary btn-sm" style="flex:1; justify-content:center; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                    ${renderIcon('arrowRight', { size: 13 })}
                    <span>Prepare Application</span>
                  </a>
                  <form action="/jobs/unsave" method="POST" style="margin:0;">
                    <input type="hidden" name="applicationId" value="${escapeHtml(app.id)}">
                    <input type="hidden" name="jobId" value="${escapeHtml(app.canonicalJobId || '')}">
                    <button type="submit" class="btn btn-secondary btn-sm" style="padding:6px 10px; color:var(--text-dim);" title="Remove from saved">
                      ${renderIcon('trash', { size: 14 })}
                    </button>
                  </form>
                </div>
              </div>
            `;
              })
              .join('')}
          </div>
        `
        }
      `
          : ''
      }

      <!-- ================================================================= -->
      <!-- TAB 3: CUSTOM JOB DESCRIPTION ANALYSIS                            -->
      <!-- ================================================================= -->
      ${
        activeTab === 'analyze'
          ? `
        <div class="card" style="padding:28px; margin-bottom:28px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <div class="section-header" style="margin-bottom:20px;">
            <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Job Description Analysis</h2>
            <p style="font-size:0.85rem; color:var(--text-muted); margin:4px 0 0 0;">
              Paste any job description to evaluate requirements against your verified code repository evidence.
            </p>
          </div>

          <form method="POST" action="/apps/radar">
            <div class="form-group" style="margin-bottom:20px;">
              <label for="jobDescriptionText" class="form-label" style="font-weight:600; font-size:0.875rem; color:var(--text-main);">Job Description *</label>
              <textarea
                id="jobDescriptionText"
                name="jobDescriptionText"
                class="form-textarea"
                rows="10"
                placeholder="Paste the full job description here...&#10;&#10;Include responsibilities, required skills, preferred qualifications, and any other relevant details."
                required
                minlength="50"
                style="width:100%; font-size:0.875rem; line-height:1.6; background:rgba(0,0,0,0.2); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); color:var(--text-main); padding:12px;"
              ></textarea>
              <div class="form-hint" style="font-size:0.8rem; color:var(--text-dim); margin-top:6px;">Paste the complete job posting for best results. Minimum 50 characters.</div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom:16px;" class="grid-2col">
              <div class="form-group">
                <label for="jobTitle" class="form-label" style="font-weight:600; font-size:0.875rem; color:var(--text-main);">Job Title</label>
                <input type="text" id="jobTitle" name="jobTitle" value="${escapeHtml(initialJobTitle)}" class="form-control" placeholder="e.g. Senior Software Engineer" />
              </div>
              <div class="form-group">
                <label for="companyName" class="form-label" style="font-weight:600; font-size:0.875rem; color:var(--text-main);">Company Name</label>
                <input type="text" id="companyName" name="companyName" value="${escapeHtml(initialCompanyName)}" class="form-control" placeholder="e.g. Acme Corp" />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom:24px;" class="grid-2col">
              <div class="form-group">
                <label for="targetRoleLevel" class="form-label" style="font-weight:600; font-size:0.875rem; color:var(--text-main);">Level</label>
                <select id="targetRoleLevel" name="targetRoleLevel" class="form-select">
                  <option value="">Auto-detect</option>
                  <option value="INTERN">Intern</option>
                  <option value="JUNIOR">Junior</option>
                  <option value="MID">Mid-Level</option>
                  <option value="SENIOR">Senior</option>
                  <option value="LEAD">Lead</option>
                  <option value="PRINCIPAL">Principal</option>
                  <option value="DIRECTOR">Director</option>
                </select>
              </div>
              <div class="form-group">
                <label for="maxSkillGaps" class="form-label" style="font-weight:600; font-size:0.875rem; color:var(--text-main);">Max Skill Gaps Shown</label>
                <select id="maxSkillGaps" name="maxSkillGaps" class="form-select">
                  <option value="3">3</option>
                  <option value="5" selected>5</option>
                  <option value="8">8</option>
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 12px; align-items:center;">
              <button type="submit" id="submitRadarBtn" class="btn btn-primary" data-loading-text="Analyzing Requirements &amp; Evidence..." style="padding:10px 22px;">
                Analyze Job Fit &rarr;
              </button>
              <a href="/apps/radar?tab=discover" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>

        <div class="card" style="padding:28px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <div class="section-header" style="margin-bottom:20px;">
            <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">How It Works</h2>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div style="display: flex; flex-direction: column; gap: 8px; padding:16px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-family:var(--font-mono); font-size:0.8rem; font-weight:700; color:var(--accent-indigo);">01</div>
              <div style="font-weight: 600; color: var(--text-main); font-size:0.9rem;">Paste Job Description</div>
              <div style="font-size: 0.825rem; color: var(--text-muted); line-height:1.5;">Enter any job posting &mdash; requirements are extracted deterministically.</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; padding:16px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-family:var(--font-mono); font-size:0.8rem; font-weight:700; color:var(--accent-indigo);">02</div>
              <div style="font-weight: 600; color: var(--text-main); font-size:0.9rem;">Evidence Matching</div>
              <div style="font-size: 0.825rem; color: var(--text-muted); line-height:1.5;">Your verified GitHub evidence is matched against job requirements.</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; padding:16px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-family:var(--font-mono); font-size:0.8rem; font-weight:700; color:var(--accent-indigo);">03</div>
              <div style="font-weight: 600; color: var(--text-main); font-size:0.9rem;">Radar Analysis</div>
              <div style="font-size: 0.825rem; color: var(--text-muted); line-height:1.5;">6-axis visualization: skills, projects, experience, education, confidence.</div>
            </div>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;

  return renderLayout({
    title: 'Job Fit Radar',
    content,
    activeNav: 'radar',
    user,
  });
}

/**
 * Backward-compatible radar analysis input form page wrapper.
 *
 * @param {object} params
 * @param {object|null} params.user Authenticated user
 * @param {object|null} params.tenant Authenticated tenant
 * @param {string} [params.error] Optional error message
 * @returns {string} Full HTML page
 */
export function renderRadarFormPage({ user = null, tenant = null, error = null }) {
  return renderRadarPage({
    user,
    tenant,
    tab: 'analyze',
    flashError: error,
  });
}

/**
 * Renders the radar result page with pre-hydrated analysis data.
 *
 * @param {object} params
 * @param {object|null} params.user Authenticated user
 * @param {object|null} params.tenant Authenticated tenant
 * @param {object|null} params.analysisData The analyze_job_fit output
 * @param {string} [params.error] Optional error message
 * @returns {string} Full HTML page
 */
export function renderRadarResultPage({
  user = null,
  tenant: _tenant = null,
  analysisData = null,
  error = null,
}) {
  const content = `
    <div class="container" style="max-width: 900px; margin: 0 auto 60px; padding: 0 20px;">
      <a href="/apps/radar?tab=analyze" class="back-nav-link" style="display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); text-decoration:none; font-size:0.875rem; margin-bottom:12px;">
        &larr; New Analysis
      </a>
      <div class="breadcrumb" style="display:flex; align-items:center; gap:8px; font-size:0.825rem; color:var(--text-dim); margin-bottom:24px;">
        <a href="/dashboard" style="color:var(--text-muted); text-decoration:none;">Overview</a>
        <span>/</span>
        <a href="/apps/radar" style="color:var(--text-muted); text-decoration:none;">Jobs</a>
        <span>/</span>
        <span style="color:var(--text-main); font-weight:600;">Result</span>
      </div>

      ${error ? `<div class="alert alert-error" style="margin-bottom:24px; padding:12px 18px; border-radius:var(--radius-md); background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#FCA5A5; font-size:0.875rem;">${escapeHtml(error)}</div>` : ''}

      ${
        analysisData
          ? `
      <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:28px;">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:8px;">FIT EVALUATION</span>
          <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em; margin:4px 0 8px 0; color:var(--text-main);">Job Fit Analysis Result</h1>
          <p style="color:var(--text-muted); font-size:0.95rem; margin:0; max-width:640px;">${escapeHtml(analysisData.overallFit?.fitSummary || 'Evidence-grounded fit analysis')}</p>
        </div>
        <a href="/apps/radar?tab=analyze" class="btn btn-secondary btn-sm">Analyze Another Job</a>
      </div>
      `
          : ''
      }

      <div id="radar-widget-container" style="
        background: #0B0F19;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        padding: 24px;
        min-height: 400px;
      ">
        ${
          analysisData
            ? renderEmbeddedRadarWidget(analysisData)
            : `
          <div class="loading-overlay" style="padding:40px 20px; text-align:center;">
            <div class="loading-spinner"></div>
            <div style="margin-top:12px; color:var(--text-muted);">No analysis data available.</div>
            <a href="/apps/radar?tab=analyze" class="btn btn-primary btn-sm" style="margin-top: 16px;">Start New Analysis</a>
          </div>
        `
        }
      </div>
    </div>
  `;

  return renderLayout({
    title: analysisData
      ? `Fit: ${analysisData.overallFit?.matchGrade || 'Analysis'}`
      : 'Job Fit Radar — Result',
    content,
    activeNav: 'radar',
    user,
  });
}

/**
 * Renders the radar widget HTML inline (within the design system layout).
 * Uses the same rendering logic as the MCP App but integrated into the page.
 *
 * @param {object} data The analyze_job_fit output
 * @returns {string} HTML for the radar widget
 */
function renderEmbeddedRadarWidget(data) {
  if (!data) return '';

  const jobContext = data.jobContext || {};
  const overallFit = data.overallFit || {};
  const score = typeof overallFit.atsScore === 'number' ? Math.round(overallFit.atsScore) : 0;
  const band = overallFit.matchGrade || 'MODERATE_FIT';
  const bandClass = score >= 75 ? 'badge-verified' : score >= 50 ? 'badge-indigo' : 'badge-amber';
  const bandLabel = band.replace(/_/g, ' ');
  const breakdown = overallFit.scoreBreakdown || {};

  // Calculate radar points (6 axes)
  const values = [
    Math.min(100, Math.max(0, breakdown.requiredSkillsScore || 0)),
    Math.min(100, Math.max(0, breakdown.preferredSkillsScore || 0)),
    Math.min(100, Math.max(0, breakdown.projectRelevanceScore || 0)),
    Math.min(100, Math.max(0, breakdown.experienceFitScore || 0)),
    Math.min(100, Math.max(0, breakdown.educationFitScore || 0)),
    Math.min(100, Math.max(0, breakdown.evidenceConfidenceScore || 0)),
  ];

  const radius = 100;
  const points = values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const r = (v / 100) * radius;
    return {
      x: Number((r * Math.cos(angle)).toFixed(2)),
      y: Number((r * Math.sin(angle)).toFixed(2)),
      val: v,
    };
  });
  const polyString = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Requirement matches
  const reqSummary = data.requirementSummary || {};
  const matched = reqSummary.matchedCount || 0;
  const total =
    reqSummary.totalRequirements ||
    matched +
      (reqSummary.missingCount || 0) +
      (reqSummary.partialCount || 0) +
      (reqSummary.unknownCount || 0) ||
    1;
  const keyMatched = reqSummary.keyMatchedSkills || [];
  const keyMissing = reqSummary.keyMissingSkills || [];

  // Projects
  const projects = data.topRelevantProjects || [];

  // Skill gaps
  const gaps = data.prioritizedSkillGaps || [];

  // Evidence backing
  const evidence = data.evidenceBacking || {};

  return `
    <div style="display: flex; flex-direction: column; gap: 20px; font-family: var(--font-sans);">
      <!-- Header Card -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 18px 22px; background: #111827; border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        <div>
          <div style="font-size: 1.15rem; font-weight: 700; color: var(--text-main);">${escapeHtml(jobContext.extractedTitle || 'Target Role')}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
            ${escapeHtml(jobContext.extractedLevel ? jobContext.extractedLevel + ' Level' : '')}
            ${jobContext.extractedLevel && overallFit.fitSummary ? ' · ' : ''}
            ${escapeHtml(overallFit.fitSummary || '')}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="position: relative; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;">
            <svg width="56" height="56" viewBox="0 0 64 64" style="transform: rotate(-90deg);">
              <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.08)" stroke-width="5" fill="none"/>
              <circle cx="32" cy="32" r="26"
                stroke="${score >= 75 ? '#10b981' : score >= 50 ? '#6366f1' : '#f59e0b'}"
                stroke-width="5" fill="none"
                stroke-dasharray="${2 * Math.PI * 26}"
                stroke-dashoffset="${2 * Math.PI * 26 - (score / 100) * 2 * Math.PI * 26}"
                stroke-linecap="round"/>
            </svg>
            <span style="position: absolute; font-size: 15px; font-weight: 800; font-family: var(--font-mono); color: var(--text-main);">${score}</span>
          </div>
          <span class="badge ${bandClass}">${escapeHtml(bandLabel)}</span>
        </div>
      </div>

      <!-- Radar Chart + Breakdown Grid -->
      <div style="display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: center;" class="radar-grid">
        <!-- SVG Radar Chart -->
        <div style="display: flex; justify-content: center; align-items: center; padding: 10px;">
          <svg viewBox="-140 -140 280 280" width="240" height="240">
            <!-- Background Rings -->
            <polygon points="0,-100 86.6,-50 86.6,50 0,100 -86.6,50 -86.6,-50" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <polygon points="0,-75 64.95,-37.5 64.95,37.5 0,75 -64.95,37.5 -64.95,-37.5" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <polygon points="0,-50 43.3,-25 43.3,25 0,50 -43.3,25 -43.3,-25" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <polygon points="0,-25 21.65,-12.5 21.65,12.5 0,25 -21.65,12.5 -21.65,-12.5" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

            <!-- Axes -->
            <line x1="0" y1="0" x2="0" y2="-100" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <line x1="0" y1="0" x2="86.6" y2="-50" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <line x1="0" y1="0" x2="86.6" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <line x1="0" y1="0" x2="0" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <line x1="0" y1="0" x2="-86.6" y2="50" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            <line x1="0" y1="0" x2="-86.6" y2="-50" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>

            <!-- Data Polygon -->
            <polygon points="${polyString}" fill="rgba(99, 102, 241, 0.25)" stroke="#6366f1" stroke-width="2"/>

            <!-- Data Points -->
            ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#818cf8"/>`).join('')}

            <!-- Axis Labels -->
            <text x="0" y="-110" text-anchor="middle" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Required</text>
            <text x="96" y="-55" text-anchor="start" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Preferred</text>
            <text x="96" y="55" text-anchor="start" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Projects</text>
            <text x="0" y="118" text-anchor="middle" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Experience</text>
            <text x="-96" y="55" text-anchor="end" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Education</text>
            <text x="-96" y="-55" text-anchor="end" fill="var(--text-dim)" font-size="9" font-family="var(--font-sans)">Confidence</text>
          </svg>
        </div>

        <!-- 6-Axis Breakdown Bars -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${[
            { label: 'Required Skills Match', val: breakdown.requiredSkillsScore, weight: '40%' },
            { label: 'Project Relevance', val: breakdown.projectRelevanceScore, weight: '20%' },
            { label: 'Preferred Skills Match', val: breakdown.preferredSkillsScore, weight: '15%' },
            { label: 'Experience Alignment', val: breakdown.experienceFitScore, weight: '10%' },
            { label: 'Evidence Confidence', val: breakdown.evidenceConfidenceScore, weight: '5%' },
            { label: 'Education & Certifications', val: breakdown.educationFitScore, weight: '5%' },
          ]
            .map((item) => {
              const v = Math.round(Math.min(100, Math.max(0, item.val || 0)));
              const barColor = v >= 75 ? '#10b981' : v >= 50 ? '#6366f1' : '#f59e0b';
              return `
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.775rem; margin-bottom: 2px;">
                  <span style="color: var(--text-muted);">${escapeHtml(item.label)} <span style="font-size:0.7rem; color:var(--text-dim);">(${item.weight})</span></span>
                  <span style="font-family: var(--font-mono); font-weight: 600; color: var(--text-main);">${v}%</span>
                </div>
                <div style="height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden;">
                  <div style="height: 100%; width: ${v}%; background: ${barColor}; border-radius: 3px;"></div>
                </div>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>

      <!-- Requirements & Gap Analysis Columns -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;" class="grid-2col">
        <!-- Matched Skills -->
        <div style="background: #111827; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #34d399; text-transform: uppercase; letter-spacing: 0.05em;">Matched Requirements</span>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dim);">${matched} of ${total}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${
              keyMatched.length > 0
                ? keyMatched
                    .map(
                      (s) =>
                        `<span class="badge badge-verified" style="font-size: 0.75rem;">✓ ${escapeHtml(s)}</span>`
                    )
                    .join('')
                : '<div style="font-size: 0.8rem; color: var(--text-dim);">No specific skills matched.</div>'
            }
          </div>
        </div>

        <!-- Missing Skills -->
        <div style="background: #111827; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #f87171; text-transform: uppercase; letter-spacing: 0.05em;">Missing Requirements</span>
            <span style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-dim);">${keyMissing.length} Gaps</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${
              keyMissing.length > 0
                ? keyMissing
                    .map(
                      (s) =>
                        `<span class="badge badge-missing" style="font-size: 0.75rem;">✗ ${escapeHtml(s)}</span>`
                    )
                    .join('')
                : '<div style="font-size: 0.8rem; color: #34d399;">No critical skills missing!</div>'
            }
          </div>
        </div>
      </div>

      <!-- Ranked Projects + Skill Gap Advice -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;" class="grid-2col">
        <!-- Top Ranked Projects -->
        <div style="background: #111827; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Most Relevant Projects</span>
            <span style="font-size: 0.7rem; color: var(--text-dim); font-family:var(--font-mono);">Ranked by Code Evidence</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              projects.length > 0
                ? projects
                    .map((p) => {
                      const relPct = Math.round(Math.min(100, Math.max(0, p.relevanceScore || 0)));
                      return `
                    <div style="display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; background: #0B0F19; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: var(--text-main); font-size: 0.825rem;">#${escapeHtml(String(p.relevanceRank))} ${escapeHtml(p.projectName)}</span>
                        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-indigo); font-weight:600;">${relPct}% Match</span>
                      </div>
                      <div style="height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
                        <div style="height: 100%; background: var(--accent-indigo); border-radius: 2px; width: ${relPct}%;"></div>
                      </div>
                    </div>
                  `;
                    })
                    .join('')
                : '<div style="font-size: 0.8rem; color: var(--text-dim);">No projects ranked yet.</div>'
            }
          </div>
        </div>

        <!-- Skill Gaps -->
        <div style="background: #111827; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Prioritized Remediation Gaps</span>
            <span style="font-size: 0.7rem; color: var(--text-dim); font-family:var(--font-mono);">Actionable Advice</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              gaps.length > 0
                ? gaps
                    .map((g) => {
                      const prio = (g.priority || 'IMPORTANT').toLowerCase();
                      const prioClass =
                        prio === 'critical'
                          ? 'badge-missing'
                          : prio === 'important'
                            ? 'badge-amber'
                            : 'badge-unknown';
                      return `
                    <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; background: rgba(245, 158, 11, 0.04); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--radius-sm);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: #fde68a; font-size: 0.825rem;">${escapeHtml(g.skillName || g.skillSlug)}</span>
                        <span class="badge ${prioClass}" style="font-size: 0.65rem;">${escapeHtml(g.priority)}</span>
                      </div>
                      <div style="font-size: 0.775rem; color: var(--text-muted); line-height:1.4;">${escapeHtml(g.remediationAdvice || 'Build a repository project demonstrating this technology.')}</div>
                    </div>
                  `;
                    })
                    .join('')
                : '<div style="font-size: 0.8rem; color: var(--text-dim);">No skill gaps identified.</div>'
            }
          </div>
        </div>
      </div>

      <!-- Apply CTA Banner -->
      <div class="card" style="margin-top: 24px; padding: 20px 24px; background: linear-gradient(180deg, #111827 0%, #0B0F19 100%); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div>
          <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0;">Ready to apply for this position?</h3>
          <p style="font-size: 0.825rem; color: var(--text-muted); margin: 0;">Launch the application readiness and tailored submission workflow with this job.</p>
        </div>
        <form action="/applications/start" method="POST" style="margin: 0;">
          <input type="hidden" name="companyName" value="${escapeHtml(jobContext.companyName || 'Target Company')}">
          <input type="hidden" name="jobTitle" value="${escapeHtml(jobContext.jobTitle || 'Software Engineer')}">
          <button type="submit" class="btn btn-primary" style="padding: 9px 18px; font-weight: 700;">
            Apply for this Role &rarr;
          </button>
        </form>
      </div>

      <!-- Evidence Footer -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 4px 0 4px; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-dim); margin-top: 16px;">
        <span>Antigravity Career Hub &bull; Job Fit Radar</span>
        <span style="font-family:var(--font-mono);">${evidence.verifiedSkillsCount || 0} Verified Skills &bull; ${evidence.totalEvidenceItemsCited || 0} Evidence Citations</span>
      </div>
    </div>
  `;
}

/**
 * Standalone MCP App HTML view.
 */
export function renderJobFitRadarAppHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Job Fit Radar</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#0B0F19; color:#F9FAFB; padding:16px; }
  </style>
</head>
<body>
  <div id="app">Loading Job Fit Radar...</div>
</body>
</html>`;
}
