/**
 * @file Public Self-Service Data Deletion Guide View Template (P14-004C / ARCH-056).
 *
 * Details how candidates can exercise self-service GDPR/CCPA data deletion.
 */

import { renderLayout } from './layout.js';

export function renderDataDeletionPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Data Deletion & Sovereignty
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Complete Candidate Data Sovereignty and Automated GDPR Hard Deletion
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Candidate Data Sovereignty</h2>
          <p>
            You retain absolute ownership and control over your career data. Career Hub does not sell, broker, or retain your data after account deletion. All data deletion operations are executed via automated server-side cascades that permanently purge records from primary PostgreSQL databases.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Granular Self-Service Deletion Options</h2>
          <p>You can selectively delete specific categories of data without deleting your entire workspace:</p>
          
          <div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">
            <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
              <strong style="color: #f8fafc;">Disconnect GitHub Repositories:</strong>
              <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">
                Navigate to <a href="/sources" style="color: var(--accent-indigo);">Connected Sources</a> and click <em>Disconnect</em>. This immediately purges cached repository metadata, AST syntax trees, and commit-linked evidence items from your workspace.
              </p>
            </div>

            <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
              <strong style="color: #f8fafc;">Revoke AI Provider & MCP Tokens:</strong>
              <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">
                Navigate to <a href="/connect" style="color: var(--accent-indigo);">AI Connect</a>. You can revoke specific OAuth provider grants (Claude, ChatGPT) or revoke Personal MCP API Tokens with immediate effect.
              </p>
            </div>

            <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
              <strong style="color: #f8fafc;">Delete Uploaded Resumes:</strong>
              <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">
                Navigate to <a href="/resumes" style="color: var(--accent-indigo);">Resumes</a> and delete any uploaded PDF or tailored document. The raw text and parsed claim sections are immediately purged.
              </p>
            </div>

            <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
              <strong style="color: #f8fafc;">Clear Job Preferences & Intent:</strong>
              <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 0.25rem;">
                Navigate to <a href="/profile" style="color: var(--accent-indigo);">Career Profile</a> and click <em>Reset Preferences to Defaults</em> to clear all saved search filters and voluntary eligibility inputs.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. Full Workspace & Account Hard Deletion (GDPR Article 17)</h2>
          <p>
            To execute a complete, irreversible hard deletion of your entire account and workspace:
          </p>
          <ol style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <li>Sign in to your account.</li>
            <li>Navigate to <a href="/settings" style="color: var(--accent-indigo);">Settings & Privacy</a>.</li>
            <li>Scroll to the <strong>Danger Zone</strong> and click <em>Permanently Delete My Account & Data</em>.</li>
            <li>Confirm the prompt. Your user record, candidate profile, skills, projects, evidence items, applications, tokens, and sessions will be immediately erased.</li>
          </ol>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Data Deletion & Sovereignty',
    content,
    user,
    tenant,
    activeNav: 'data-deletion',
  });
}
