/**
 * @file Public Privacy Notice View Template (P14-004C / ARCH-056).
 *
 * Truthfully describes data processing, storage, retention, user rights, and AI boundaries.
 */

import { renderLayout } from './layout.js';

export function renderPrivacyPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Privacy Notice
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Last Updated: August 30, 2026 • Effective Date: August 30, 2026
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Overview & Data Controller</h2>
          <p>
            Antigravity Career Hub ("Career Hub", "we", "our") provides an evidence-based career intelligence platform and Model Context Protocol (MCP) server. We are committed to transparency, data sovereignty, and candidate privacy. This Privacy Notice describes the types of personal data we process, why we process it, and how you can exercise control over your information.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Categories of Information Processed</h2>
          <ul style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <li><strong>Account & Identity:</strong> Name, email address, GitHub username, and account profile identifiers obtained during authentication.</li>
            <li><strong>Repository Evidence:</strong> Source code AST metadata, package manifests (e.g. <code>package.json</code>, <code>Cargo.toml</code>), commit contributions, and file directory structures from repositories you explicitly connect.</li>
            <li><strong>Resume & Application Documents:</strong> Resumes and cover letters uploaded or generated within the platform.</li>
            <li><strong>Career Preferences & Intent:</strong> Target job titles, salary floors, preferred work locations, and voluntary work authorization entries you save.</li>
            <li><strong>AI & MCP Connection Data:</strong> Scoped authorization tokens, client metadata, and invocation timestamps from external AI clients (Claude, ChatGPT, Gemini).</li>
            <li><strong>Security & Audit Logs:</strong> IP address, browser user-agent, correlation request IDs, and security event records stored to protect against unauthorized access.</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. Evidence-First Sovereign Truth Model</h2>
          <p>
            Career Hub strictly distinguishes between <strong>Verified Evidence</strong> (cryptographically linked to repository commits), <strong>Self-Reported Claims</strong> (candidate resume assertions tagged as <code>[Unverified User Claim]</code>), and <strong>User Intent</strong>. AI models are strictly prohibited from converting unverified assertions into verified facts or inferring sensitive personal characteristics.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">4. Artificial Intelligence & Third-Party AI Hosts</h2>
          <p>
            When you connect an AI client (such as Anthropic Claude or OpenAI ChatGPT) to your Career Hub MCP endpoint:
          </p>
          <ul style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <li>Data is transferred only over encrypted TLS channels using OAuth 2.1 authentication with PKCE.</li>
            <li>AI clients only receive career context requested by explicit MCP tool calls (e.g., <code>get_candidate_profile</code>).</li>
            <li>Private credentials, master encryption keys, and raw tokens are <strong>never</strong> shared with AI models.</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">5. Data Retention & Deletion Rights</h2>
          <p>
            We retain your data only for as long as your workspace remains active. You maintain absolute sovereignty over your data and may permanently delete your account, disconnected repositories, uploaded documents, and audit history at any time via <a href="/data-deletion" style="color: var(--accent-indigo);">Self-Service Data Deletion</a> or <a href="/settings" style="color: var(--accent-indigo);">Settings & Privacy</a>.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">6. Contact & Data Protection</h2>
          <p>
            For privacy inquiries, rights requests, or data protection questions, contact us via GitHub issues at <a href="https://github.com/vishu1803/Ai-job-mcp" target="_blank" rel="noopener" style="color: var(--accent-indigo);">github.com/vishu1803/Ai-job-mcp</a>.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Privacy Notice | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'privacy',
  });
}
