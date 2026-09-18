/**
 * @file Public Landing / Product Overview View Template.
 *
 * Renders a clean, product-oriented overview of AI Careers Hub:
 * - What the product does
 * - How candidates use it (3-step workflow)
 * - What candidates accomplish
 * - Direct access to candidate workspace & documentation
 */

import { renderLayout } from './layout.js';
import { renderIcon } from './components/icons.js';

/**
 * Renders the product overview / landing page HTML.
 *
 * @param {object} [params={}]
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @returns {string} Full HTML document
 */
export function renderLandingPage({ user = null } = {}) {
  const content = `
    <div class="container" style="max-width: 1080px; margin: 0 auto;">
      <!-- Hero Section -->
      <section style="text-align: center; padding: 56px 0 48px;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: var(--radius-full); padding: 5px 16px; margin-bottom: 24px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-emerald);"></span>
          <span style="font-size: 0.825rem; font-weight: 600; color: var(--text-main); letter-spacing: 0.02em;">Evidence-Grounded Job Application Workspace</span>
        </div>
        
        <h1 style="font-size: clamp(2.2rem, 5vw, 3.2rem); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; max-width: 820px; margin: 0 auto 20px; color: var(--text-main);">
          Your Career Hub for Modern Tech Roles
        </h1>
        
        <p style="font-size: 1.1rem; color: var(--text-muted); max-width: 650px; margin: 0 auto 36px; line-height: 1.6;">
          Organize your career profile, connect your real project experience, discover relevant roles, and track applications with integrated AI assistance.
        </p>

        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;">
          ${
            user
              ? `
            <a href="/dashboard" class="btn btn-primary" style="padding: 11px 26px; font-size: 0.95rem;">
              <span>Go to Dashboard</span>
              ${renderIcon('arrowRight', { size: 16 })}
            </a>
            `
              : `
            <a href="/login" class="btn btn-primary" style="padding: 11px 26px; font-size: 0.95rem; display: inline-flex; align-items: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span>Sign in with GitHub</span>
            </a>
            `
          }
          <a href="/docs/mcp" class="btn btn-secondary" style="padding: 11px 22px; font-size: 0.95rem;">
            <span>Developer Docs</span>
          </a>
        </div>
      </section>

      <!-- Main 3-Step Candidate Workflow -->
      <section style="margin-bottom: 56px;">
        <div style="text-align: center; margin-bottom: 36px;">
          <h2 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-main);">How It Works</h2>
          <p style="color: var(--text-muted); font-size: 0.925rem; margin-top: 6px; max-width: 580px; margin-left: auto; margin-right: auto;">
            A unified workflow designed to keep your job search organized and backed by your actual experience.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
          <div class="card" style="padding: 28px 22px; text-align: left;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <div style="width: 38px; height: 38px; border-radius: var(--radius-sm); background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.25); display: flex; align-items: center; justify-content: center; color: var(--accent-indigo);">
                ${renderIcon('sources', { size: 18 })}
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); font-family: var(--font-mono);">01</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">Connect Career Sources</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; line-height: 1.55; margin: 0;">
              Upload your base resume and connect your GitHub repositories. The platform extracts your authentic skills, projects, and work experience into a single profile.
            </p>
          </div>

          <div class="card" style="padding: 28px 22px; text-align: left;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <div style="width: 38px; height: 38px; border-radius: var(--radius-sm); background: rgba(6,182,212,0.12); border: 1px solid rgba(6,182,212,0.25); display: flex; align-items: center; justify-content: center; color: var(--accent-cyan);">
                ${renderIcon('jobs', { size: 18 })}
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); font-family: var(--font-mono);">02</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">Discover &amp; Evaluate Roles</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; line-height: 1.55; margin: 0;">
              Browse curated engineering opportunities and evaluate how your verified background compares to role requirements, highlighting your strongest qualifications.
            </p>
          </div>

          <div class="card" style="padding: 28px 22px; text-align: left;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <div style="width: 38px; height: 38px; border-radius: var(--radius-sm); background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); display: flex; align-items: center; justify-content: center; color: var(--accent-emerald);">
                ${renderIcon('applications', { size: 18 })}
              </div>
              <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-dim); font-family: var(--font-mono);">03</span>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; color: var(--text-main);">Apply &amp; Track Pipeline</h3>
            <p style="color: var(--text-muted); font-size: 0.875rem; line-height: 1.55; margin: 0;">
              Prepare tailored application packages, complete screening answers, and track your active pipeline from initial submission to final offer.
            </p>
          </div>
        </div>
      </section>

      <!-- Key Capabilities Overview -->
      <section style="margin-bottom: 56px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h2 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-main);">Everything You Need for Your Job Search</h2>
          <p style="color: var(--text-muted); font-size: 0.925rem; margin-top: 6px;">
            A complete, focused set of tools built for candidates.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px;">
          <div class="card" style="padding: 22px;">
            <h4 style="font-size: 0.975rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Career Profile</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin: 0;">
              Maintain your target roles, salary expectations, work authorization, and contact details with reliable save integrity.
            </p>
          </div>

          <div class="card" style="padding: 22px;">
            <h4 style="font-size: 0.975rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Sources Hub</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin: 0;">
              Manage your active resume document and connected GitHub repositories in one dedicated workspace.
            </p>
          </div>

          <div class="card" style="padding: 22px;">
            <h4 style="font-size: 0.975rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Pipeline Tracker</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin: 0;">
              Organize opportunities across Saved, Applied, Interviewing, and Offer stages with clean notes and status updates.
            </p>
          </div>

          <div class="card" style="padding: 22px;">
            <h4 style="font-size: 0.975rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Contextual AI Copilot</h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin: 0;">
              An integrated assistant on your dashboard providing guidance on profile completeness, job fit, and interview prep.
            </p>
          </div>
        </div>
      </section>

      <!-- Bottom CTA Section -->
      <section class="card" style="text-align: center; padding: 40px 24px; margin-bottom: 48px; border: 1px solid var(--border-highlight);">
        <h2 style="font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 8px; color: var(--text-main);">
          Start Your Streamlined Job Search
        </h2>
        <p style="color: var(--text-muted); font-size: 0.925rem; margin-bottom: 24px; max-width: 500px; margin-left: auto; margin-right: auto;">
          Connect your sources and take control of your career applications with verified experience.
        </p>
        <div style="display: flex; justify-content: center; gap: 12px; flex-wrap: wrap;">
          ${
            user
              ? `
            <a href="/dashboard" class="btn btn-primary" style="padding: 10px 24px;">
              <span>Open Dashboard</span>
            </a>
            `
              : `
            <a href="/login" class="btn btn-primary" style="padding: 10px 24px;">
              <span>Sign in with GitHub</span>
            </a>
            `
          }
          <a href="/docs/mcp" class="btn btn-secondary" style="padding: 10px 20px;">
            <span>Model Context Protocol Docs</span>
          </a>
        </div>
      </section>
    </div>
  `;

  return renderLayout({
    title: 'Universal AI Career Intelligence Platform',
    content,
    activeNav: 'home',
    user,
  });
}
