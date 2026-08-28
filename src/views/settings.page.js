/**
 * @file Account Settings & Data Sovereignty View Template.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the settings and data sovereignty HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @returns {string} Full HTML document
 */
export function renderSettingsPage({ user, tenant }) {
  const content = `
    <div class="container" style="max-width:760px; margin: 20px auto 60px;">
      <!-- Back Navigation -->
      <a href="/dashboard" style="display:inline-flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--text-muted); text-decoration:none; margin-bottom:16px; transition:color 0.15s;" onmouseover="this.style.color='var(--text-main)'" onmouseout="this.style.color='var(--text-muted)'">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb" style="margin-bottom:4px;">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Settings</span>
      </div>

      <div style="margin-bottom:32px;">
        <span class="badge badge-indigo" style="margin-bottom:8px;">WORKSPACE CONTROLS</span>
        <h1 style="font-size:1.8rem; font-weight:800;">Account & Privacy Settings</h1>
        <p style="color:var(--text-muted); font-size:0.95rem; margin-top:4px;">
          Manage your account profile, connected GitHub identity, and GDPR data sovereignty.
        </p>
      </div>

      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- Profile Info Card -->
        <div class="card">
          <div class="section-header" style="margin-bottom:20px;">
            <h2>Profile Information</h2>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Display Name</div>
              <div style="font-size:0.95rem; font-weight:600;">${escapeHtml(user.displayName || 'Not specified')}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Email</div>
              <div style="font-size:0.95rem; font-weight:600;">${escapeHtml(user.email || 'Not specified')}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Tenant Tier</div>
              <div style="font-size:0.95rem; font-weight:600;">${escapeHtml(tenant.tier)}</div>
            </div>
            <div>
              <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">Account Status</div>
              <div style="font-size:0.95rem; font-weight:600; color:var(--accent-emerald);">● ${escapeHtml(user.status)}</div>
            </div>
          </div>
        </div>

        <!-- Session Management Card -->
        <div class="card">
          <div class="section-header" style="margin-bottom:20px;">
            <h2>Session</h2>
          </div>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
            Sign out of your current session on this device. You can sign in again at any time.
          </p>
          <form action="/auth/logout" method="POST">
            <button type="submit" class="btn btn-secondary btn-sm">Sign Out Session</button>
          </form>
        </div>

        <!-- Integrations Summary Card -->
        <div class="card">
          <div class="section-header" style="margin-bottom:20px;">
            <h2>Integrations</h2>
          </div>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
            Manage your connected GitHub integration and AI provider tokens.
          </p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <a href="/sources" class="btn btn-secondary btn-sm">Manage Sources →</a>
            <a href="/connect" class="btn btn-secondary btn-sm">AI Connectors →</a>
          </div>
        </div>

        <!-- Data Sovereignty & GDPR Section -->
        <div class="card" style="border:1px solid rgba(244,63,94,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div>
              <div class="badge" style="background:rgba(244,63,94,0.15); color:#FB7185; border:1px solid rgba(244,63,94,0.3); margin-bottom:8px;">GDPR ARTICLE 17</div>
              <h2 style="font-size:1.15rem; font-weight:700; color:#FB7185;">Data Sovereignty & Account Deletion</h2>
            </div>
          </div>

          <div class="alert alert-warning" style="margin-bottom:16px;">
            <strong>⚠️ This action is irreversible.</strong> Deleting your account permanently purges your profile, tenant records, indexed AST evidence, tailored documents, OAuth credentials, and MCP tokens across all database tables in a single atomic operation.
          </div>

          <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5; margin-bottom:20px;">
            You maintain 100% ownership of your data under GDPR. This erasure applies to all 18+ database tables and cannot be undone.
          </p>

          <form action="/account" method="POST" onsubmit="return confirm('Are you sure you want to permanently delete your account and ALL associated data? This includes:\\n\\n• Candidate profile & resume data\\n• Verified skills & project evidence\\n• GitHub integration & repository sync\\n• AI provider tokens\\n• Application tracking history\\n\\nThis action is irreversible. Type DELETE in the next prompt to confirm.');">
            <input type="hidden" name="_method" value="DELETE">
            <button type="submit" class="btn btn-danger">
              Delete Account & All Data
            </button>
          </form>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Account Settings',
    content,
    activeNav: 'settings',
    user,
  });
}
