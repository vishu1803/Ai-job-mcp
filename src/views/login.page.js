/**
 * @file Login / Authentication Page View Template.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the login page HTML.
 *
 * @param {object} [params={}]
 * @param {string} [params.returnTo=''] Optional returnTo redirect target
 * @param {string} [params.error=''] Optional error message
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @returns {string} Full HTML document
 */
export function renderLoginPage({ returnTo = '', error = '', user = null } = {}) {
  const safeError = escapeHtml(error);
  const authUrl = returnTo
    ? `/auth/github?returnTo=${encodeURIComponent(returnTo)}`
    : '/auth/github';

  const content = `
    <div class="container" style="max-width:680px; margin: 40px auto 60px;">
      <div class="card" style="padding: 36px 32px; text-align:center;">
        <div class="brand-icon" style="width:48px; height:48px; margin:0 auto 20px; font-size:1.3rem;">AG</div>
        
        <h1 style="font-size:1.6rem; font-weight:700; margin-bottom:8px;">Sign in to Career Hub</h1>
        <p style="color:var(--text-muted); font-size:0.925rem; margin-bottom:28px; line-height:1.6;">
          Authenticate with your GitHub account to access your evidence-backed career workspace.
        </p>

        ${
          safeError
            ? `
          <div class="alert alert-error" style="margin-bottom:20px; font-size:0.875rem;">
            ${safeError}
          </div>
          `
            : ''
        }

        <a href="${authUrl}" class="btn btn-primary" style="width:100%; padding:14px; font-size:1rem; margin-bottom:12px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          <span>Continue with GitHub</span>
        </a>

        <div style="margin-bottom:20px;">
          <a href="/auth/dev-login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}" class="btn btn-secondary btn-sm" id="devLoginBtn" style="width:100%; border:1px dashed var(--border-subtle); color:var(--text-muted); font-size:0.825rem; padding:8px 12px; justify-content:center;">
            ⚡ Local Dev Fast Sign-In
          </a>
        </div>

        <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:20px; line-height:1.5;">
          You will be redirected to GitHub for secure OAuth authentication.<br>
          No API keys or passwords are stored — only an encrypted session token.
        </p>

        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; text-align:left;">
          <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-dim); margin-bottom:10px;">Security Guarantees</h4>
          <ul style="list-style:none; font-size:0.825rem; color:var(--text-muted); display:flex; flex-direction:column; gap:8px;">
            <li style="display:flex; align-items:flex-start; gap:8px;">🔒 <span><strong>Least Privilege:</strong> You choose exactly which repositories to connect.</span></li>
            <li style="display:flex; align-items:flex-start; gap:8px;">🛡️ <span><strong>Zero Plaintext Storage:</strong> Credentials encrypted with AES-256-GCM at rest.</span></li>
            <li style="display:flex; align-items:flex-start; gap:8px;">🔑 <span><strong>OAuth PKCE:</strong> Industry-standard S256 proof key — no client secrets in browser.</span></li>
            <li style="display:flex; align-items:flex-start; gap:8px;">🗑️ <span><strong>Data Sovereignty:</strong> Disconnect or hard-delete your account anytime under GDPR Article 17.</span></li>
          </ul>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Sign In',
    content,
    user,
  });
}
