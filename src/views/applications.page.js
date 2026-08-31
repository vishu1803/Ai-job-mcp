/**
 * @file Job Applications Pipeline Tracker View Template (P14-003A / ARCH-043).
 *
 * Renders the Ashby/Linear-grade job application tracking board:
 * 1. Filterable Kanban / Table pipeline across SAVED, APPLIED, INTERVIEWING, OFFER, REJECTED.
 * 2. Stage timelines (Technical Screen, System Design, Behavioral, Onsite Loop).
 * 3. Salary compensation targets, location preferences, and attached tailored artifacts.
 * 4. Two-phase write safety and MCP career tracking tool bindings.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Formats a date into a human-readable string.
 *
 * @param {string | Date | null} date
 * @returns {string}
 */
function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Renders the Job Applications Tracker Page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {Array<object>} [params.applications=[]] Tracked job applications
 * @param {string} [params.activeFilter='ALL'] Active filter tab
 * @param {string} [params.flashMessage=''] Flash message
 * @param {string} [params.errorMessage=''] Error message
 * @returns {string} Full HTML document
 */
export function renderApplicationsPage({
  user,
  tenant: _tenant = null,
  applications = [],
  activeFilter = 'ALL',
  flashMessage = '',
  errorMessage = '',
}) {
  const filter = (activeFilter || 'ALL').toUpperCase();

  const counts = {
    ALL: applications.length,
    SAVED: applications.filter((a) => a.status === 'SAVED').length,
    APPLIED: applications.filter((a) => ['APPLIED', 'SCREENING'].includes(a.status)).length,
    INTERVIEWING: applications.filter((a) => a.status === 'INTERVIEWING').length,
    OFFER: applications.filter((a) => ['OFFER_RECEIVED', 'OFFER_ACCEPTED'].includes(a.status))
      .length,
    REJECTED: applications.filter((a) => ['REJECTED', 'WITHDRAWN'].includes(a.status)).length,
  };

  const filteredApps = applications.filter((a) => {
    if (filter === 'ALL') return true;
    if (filter === 'SAVED') return a.status === 'SAVED';
    if (filter === 'APPLIED') return ['APPLIED', 'SCREENING'].includes(a.status);
    if (filter === 'INTERVIEWING') return a.status === 'INTERVIEWING';
    if (filter === 'OFFER') return ['OFFER_RECEIVED', 'OFFER_ACCEPTED'].includes(a.status);
    if (filter === 'REJECTED') return ['REJECTED', 'WITHDRAWN'].includes(a.status);
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OFFER_RECEIVED':
      case 'OFFER_ACCEPTED':
        return '<span class="badge badge-verified">🎉 OFFER</span>';
      case 'INTERVIEWING':
        return '<span class="badge badge-indigo">⚡ INTERVIEWING</span>';
      case 'SCREENING':
      case 'APPLIED':
        return '<span class="badge badge-cyan">📩 APPLIED</span>';
      case 'SAVED':
        return '<span class="badge" style="background:rgba(148,163,184,0.15); color:#94A3B8; border:1px solid rgba(148,163,184,0.3);">📌 SAVED</span>';
      case 'REJECTED':
      case 'WITHDRAWN':
        return '<span class="badge badge-missing">✕ ARCHIVED</span>';
      default:
        return `<span class="badge badge-indigo">${escapeHtml(status)}</span>`;
    }
  };

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
        <span class="current">Job Applications Tracker</span>
      </div>

      <!-- Flash & Error Messages -->
      ${flashMessage ? `<div class="alert alert-success">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Page Header -->
      <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:24px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span class="badge badge-indigo">PIPELINE TRACKING</span>
            <span class="badge badge-verified">MCP SYNCHRONIZED</span>
          </div>
          <h1 style="font-size:1.8rem; font-weight:800; letter-spacing:-0.02em; margin:0 0 6px 0;">
            Job Applications Tracker
          </h1>
          <p style="color:var(--text-muted); font-size:0.9rem; margin:0; max-width:650px;">
            Manage and track your active career pipeline across companies, interview rounds, tailored artifacts, and compensation offers.
          </p>
        </div>

        <div style="display:flex; gap:10px; align-items:center;">
          <a href="/apps/radar" class="btn btn-secondary btn-sm">
            📡 Launch Job Fit Radar
          </a>
          <button type="button" class="btn btn-primary btn-sm" onclick="openCreateModal()">
            + Track Application
          </button>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:14px; margin-bottom:24px;">
        <div class="stat-card">
          <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Total Pipeline</span>
          <div style="font-size:1.5rem; font-weight:800; color:var(--text-main);">${counts.ALL}</div>
        </div>
        <div class="stat-card">
          <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Saved & Leads</span>
          <div style="font-size:1.5rem; font-weight:800; color:var(--text-muted);">${counts.SAVED}</div>
        </div>
        <div class="stat-card">
          <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">In Screening</span>
          <div style="font-size:1.5rem; font-weight:800; color:var(--accent-cyan);">${counts.APPLIED}</div>
        </div>
        <div class="stat-card">
          <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Interviewing Loops</span>
          <div style="font-size:1.5rem; font-weight:800; color:var(--accent-indigo);">${counts.INTERVIEWING}</div>
        </div>
        <div class="stat-card">
          <span style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Offers Received</span>
          <div style="font-size:1.5rem; font-weight:800; color:var(--accent-emerald);">${counts.OFFER}</div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div style="display:flex; gap:8px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px; margin-bottom:20px; flex-wrap:wrap;">
        <a href="/applications" class="btn ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          All (${counts.ALL})
        </a>
        <a href="/applications?filter=INTERVIEWING" class="btn ${filter === 'INTERVIEWING' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          Interviewing (${counts.INTERVIEWING})
        </a>
        <a href="/applications?filter=APPLIED" class="btn ${filter === 'APPLIED' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          Applied (${counts.APPLIED})
        </a>
        <a href="/applications?filter=SAVED" class="btn ${filter === 'SAVED' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          Saved (${counts.SAVED})
        </a>
        <a href="/applications?filter=OFFER" class="btn ${filter === 'OFFER' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          Offers (${counts.OFFER})
        </a>
        <a href="/applications?filter=REJECTED" class="btn ${filter === 'REJECTED' ? 'btn-primary' : 'btn-secondary'} btn-sm">
          Archived (${counts.REJECTED})
        </a>
      </div>

      <!-- Applications Table / Content -->
      ${
        filteredApps.length === 0
          ? `
        <div class="card empty-state" style="padding:48px 24px; text-align:center;">
          <div class="empty-state-icon">📋</div>
          <h3 style="font-size:1.15rem; font-weight:700; margin-bottom:6px;">No Applications in this View</h3>
          <p style="color:var(--text-muted); font-size:0.875rem; max-width:480px; margin:0 auto 20px;">
            ${
              applications.length === 0
                ? 'Track your first job application manually or instruct Claude / ChatGPT to track opportunities via the Model Context Protocol.'
                : 'No applications currently match the selected stage filter.'
            }
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="openCreateModal()">
            + Track Application Now
          </button>
        </div>
      `
          : `
        <div class="table-responsive card" style="padding:0; overflow:hidden;">
          <table class="data-table" style="width:100%;">
            <thead>
              <tr>
                <th>Company & Role</th>
                <th>Status Stage</th>
                <th>Location / Mode</th>
                <th>Salary Target</th>
                <th>Created / Updated</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filteredApps
                .map(
                  (app) => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                  <td style="padding:16px 18px;">
                    <div style="font-weight:700; font-size:0.95rem; color:var(--text-main);">${escapeHtml(app.companyName)}</div>
                    <div style="font-size:0.825rem; color:var(--text-muted); margin-top:2px;">
                      ${escapeHtml(app.jobTitle || 'Role Not Specified')}
                      ${app.jobUrl ? ` &bull; <a href="${escapeHtml(app.jobUrl)}" target="_blank" rel="noopener" style="font-size:0.75rem;">Link ↗</a>` : ''}
                    </div>
                  </td>
                  <td style="padding:16px 18px;">
                    ${getStatusBadge(app.status)}
                  </td>
                  <td style="padding:16px 18px; font-size:0.85rem; color:var(--text-muted);">
                    ${escapeHtml(app.location || 'Remote / Unspecified')}
                  </td>
                  <td style="padding:16px 18px; font-size:0.85rem; color:var(--accent-emerald); font-weight:600;">
                    ${escapeHtml(app.salaryRange || '—')}
                  </td>
                  <td style="padding:16px 18px; font-size:0.8rem; color:var(--text-dim);">
                    ${formatDate(app.updatedAt || app.createdAt)}
                  </td>
                  <td style="padding:16px 18px; text-align:right;">
                    <form action="/applications/${app.id}/status" method="POST" style="display:inline-flex; gap:6px;">
                      <select name="status" onchange="this.form.submit()" style="background:rgba(15,23,42,0.8); border:1px solid var(--border-subtle); color:var(--text-muted); font-size:0.75rem; border-radius:4px; padding:4px 6px;">
                        <option value="SAVED" ${app.status === 'SAVED' ? 'selected' : ''}>Saved</option>
                        <option value="APPLIED" ${app.status === 'APPLIED' ? 'selected' : ''}>Applied</option>
                        <option value="SCREENING" ${app.status === 'SCREENING' ? 'selected' : ''}>Screening</option>
                        <option value="INTERVIEWING" ${app.status === 'INTERVIEWING' ? 'selected' : ''}>Interviewing</option>
                        <option value="OFFER_RECEIVED" ${app.status === 'OFFER_RECEIVED' ? 'selected' : ''}>Offer</option>
                        <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
                        <option value="ARCHIVED" ${app.status === 'ARCHIVED' ? 'selected' : ''}>Archived</option>
                      </select>
                    </form>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      }

      <!-- Modal: Track New Job Application -->
      <div id="createAppModal" style="display:none; position:fixed; inset:0; z-index:999; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:16px;">
        <div class="card" style="width:100%; max-width:540px; padding:28px; background:#111827; border:1px solid var(--border-highlight); box-shadow:0 20px 40px rgba(0,0,0,0.8);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
            <h2 style="font-size:1.25rem; font-weight:700; color:var(--text-main); margin:0;">Track New Application</h2>
            <button type="button" onclick="closeCreateModal()" style="background:none; border:none; color:var(--text-dim); font-size:1.4rem; cursor:pointer;">&times;</button>
          </div>

          <form action="/applications" method="POST">
            <div class="form-group">
              <label class="form-label">Company Name *</label>
              <input type="text" name="companyName" class="form-control" required placeholder="e.g. Anthropic, OpenAI, Stripe">
            </div>

            <div class="form-group">
              <label class="form-label">Job Title *</label>
              <input type="text" name="jobTitle" class="form-control" required placeholder="e.g. Senior Backend Engineer">
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
              <div class="form-group">
                <label class="form-label">Status Stage</label>
                <select name="status" class="form-select">
                  <option value="SAVED">Saved / Lead</option>
                  <option value="APPLIED" selected>Applied</option>
                  <option value="SCREENING">Screening</option>
                  <option value="INTERVIEWING">Interviewing</option>
                  <option value="OFFER_RECEIVED">Offer Received</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Salary Range</label>
                <input type="text" name="salaryRange" class="form-control" placeholder="e.g. $180k - $220k">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Job Posting URL</label>
              <input type="url" name="jobUrl" class="form-control" placeholder="https://careers...">
            </div>

            <div class="form-group">
              <label class="form-label">Location / Mode</label>
              <input type="text" name="location" class="form-control" placeholder="e.g. Remote, San Francisco, New York">
            </div>

            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
              <button type="button" onclick="closeCreateModal()" class="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" class="btn btn-primary btn-sm">Save Application</button>
            </div>
          </form>
        </div>
      </div>

    </div>

    <script>
      function openCreateModal() {
        const modal = document.getElementById('createAppModal');
        if (modal) {
          modal.style.display = 'flex';
        }
      }
      function closeCreateModal() {
        const modal = document.getElementById('createAppModal');
        if (modal) {
          modal.style.display = 'none';
        }
      }
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeCreateModal();
        }
      });
    </script>
  `;

  return renderLayout({
    title: 'Job Applications Tracker',
    content,
    activeNav: 'applications',
    user,
    description: 'Track and manage your active career pipeline in AI Careers Hub.',
  });
}
