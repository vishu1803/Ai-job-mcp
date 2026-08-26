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
          <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:16px;">Profile Information</h3>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; font-size:0.9rem;">
            <div>
              <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Display Name</span>
              <div style="font-weight:600; margin-top:2px;">${escapeHtml(user.displayName || 'Not specified')}</div>
            </div>
            <div>
              <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Email</span>
              <div style="font-weight:600; margin-top:2px;">${escapeHtml(user.email || 'Not specified')}</div>
            </div>
            <div>
              <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Tenant Tier</span>
              <div style="font-weight:600; margin-top:2px;">${escapeHtml(tenant.tier)}</div>
            </div>
            <div>
              <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Account Status</span>
              <div style="font-weight:600; margin-top:2px; color:var(--accent-emerald);">${escapeHtml(user.status)}</div>
            </div>
          </div>
        </div>

        <!-- Data Sovereignty & GDPR Article 17 Section -->
        <div class="card" style="border:1px solid rgba(244,63,94,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <h3 style="font-size:1.1rem; font-weight:700; color:#FB7185;">Data Sovereignty & GDPR Erasure</h3>
            <span class="badge" style="background:rgba(244,63,94,0.15); color:#FB7185; border:1px solid rgba(244,63,94,0.3);">Article 17</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-bottom:16px;">
            You maintain 100% ownership over your data. Executing hard deletion permanently purges your user profile, tenant records, indexed AST evidence, tailored documents, and OAuth credentials across all 18 database tables in a single atomic operation.
          </p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <form action="/auth/logout" method="POST" style="display:inline;">
              <button type="submit" class="btn btn-secondary btn-sm">Sign Out Session</button>
            </form>
            <form action="/account" method="POST" onsubmit="return confirm('Are you sure you want to permanently delete your account and all associated data under GDPR Article 17? This action is irreversible.');" style="display:inline;">
              <input type="hidden" name="_method" value="DELETE">
              <button type="submit" class="btn btn-sm" style="background:rgba(244,63,94,0.15); color:#FB7185; border:1px solid rgba(244,63,94,0.3);">
                Delete Account (GDPR)
              </button>
            </form>
          </div>
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
