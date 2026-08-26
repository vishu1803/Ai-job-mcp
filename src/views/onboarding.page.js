/**
 * @file Onboarding Wizard Shell View Template.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the candidate onboarding wizard shell.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @returns {string} Full HTML document
 */
export function renderOnboardingPage({ user, tenant }) {
  const content = `
    <div class="container" style="max-width:760px; margin: 20px auto 60px;">
      <div class="card" style="padding:36px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <span class="badge badge-indigo" style="margin-bottom:8px;">WORKSPACE SETUP</span>
            <h1 style="font-size:1.6rem; font-weight:800;">Candidate Onboarding Wizard</h1>
          </div>
          <span style="font-size:0.85rem; color:var(--text-dim);">Tenant: ${escapeHtml(tenant.name || tenant.slug)}</span>
        </div>

        <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:32px;">
          Welcome to Antigravity Career Hub. Complete the 3-step setup to connect your GitHub codebases and initialize your verified candidate profile.
        </p>

        <!-- Steps Timeline -->
        <div style="display:flex; flex-direction:column; gap:20px; margin-bottom:36px;">
          <!-- Step 1 -->
          <div style="display:flex; gap:16px; padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-indigo); color:#FFF; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; flex-shrink:0;">1</div>
            <div>
              <h3 style="font-size:1rem; font-weight:600; margin-bottom:4px;">Candidate Profile</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Configure headline, target roles, and engineering specialization.</p>
            </div>
          </div>

          <!-- Step 2 -->
          <div style="display:flex; gap:16px; padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
            <div style="width:32px; height:32px; border-radius:50%; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; flex-shrink:0;">2</div>
            <div>
              <h3 style="font-size:1rem; font-weight:600; margin-bottom:4px;">Install GitHub App</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Grant least-privilege read access to selected showcase repositories.</p>
              <div style="margin-top:10px;">
                <a href="/integrations/github/install" class="btn btn-secondary btn-sm">Install GitHub App</a>
              </div>
            </div>
          </div>

          <!-- Step 3 -->
          <div style="display:flex; gap:16px; padding:16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
            <div style="width:32px; height:32px; border-radius:50%; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.9rem; flex-shrink:0;">3</div>
            <div>
              <h3 style="font-size:1rem; font-weight:600; margin-bottom:4px;">Execute AST Ingestion</h3>
              <p style="font-size:0.85rem; color:var(--text-muted);">Extract dependencies, language syntax trees, and commit evidence items.</p>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:20px; border-top:1px solid var(--border-subtle);">
          <a href="/dashboard" class="btn btn-secondary">Skip to Dashboard</a>
          <a href="/dashboard" class="btn btn-primary">Complete Setup</a>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Onboarding Setup',
    content,
    user,
  });
}
