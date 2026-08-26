/**
 * @file Public Developer Documentation Page View Template (/docs/mcp).
 *
 * Renders documentation for the MCP endpoint, Streamable HTTP transport,
 * OAuth 2.1 RFC 8414 / RFC 9728 discovery, 16-tool catalog, scopes,
 * two-phase write safety, and client connection guides.
 */

import { renderLayout } from './layout.js';

/**
 * Renders the public MCP documentation page HTML.
 *
 * @param {object} [params={}]
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @returns {string} Full HTML document
 */
export function renderMcpDocsPage({ user = null } = {}) {
  const content = `
    <div class="container" style="max-width:1000px;">
      <!-- Header -->
      <div style="margin-bottom:40px;">
        <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3); border-radius:9999px; padding:4px 12px; margin-bottom:16px;">
          <span style="font-size:0.75rem; font-weight:600; color:var(--accent-indigo); text-transform:uppercase;">Protocol Specification 2026-07-28</span>
        </div>
        <h1 style="font-size:2.2rem; font-weight:800; letter-spacing:-0.02em;">Model Context Protocol (MCP) Documentation</h1>
        <p style="color:var(--text-muted); font-size:1.05rem; margin-top:8px; line-height:1.6;">
          Antigravity Career Hub exposes a remote, provider-neutral Model Context Protocol (MCP) server over Streamable HTTP transport, enabling seamless career intelligence tools inside AI hosts.
        </p>
      </div>

      <!-- Quick Reference Specs Box -->
      <div class="card" style="margin-bottom:40px; padding:24px;">
        <h3 style="font-size:1.05rem; font-weight:700; margin-bottom:16px;">Endpoint & Protocol Reference</h3>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; font-size:0.875rem;">
          <div>
            <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">MCP Endpoint</span>
            <div style="margin-top:2px;"><code>POST /mcp</code> (JSON-RPC)</div>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Transport Type</span>
            <div style="margin-top:2px;">Streamable HTTP / SSE</div>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">OAuth 2.1 Metadata</span>
            <div style="margin-top:2px;"><code>/.well-known/oauth-authorization-server</code></div>
          </div>
          <div>
            <span style="color:var(--text-dim); font-size:0.8rem; text-transform:uppercase;">Protected Resource</span>
            <div style="margin-top:2px;"><code>/.well-known/oauth-protected-resource</code></div>
          </div>
        </div>
      </div>

      <!-- Section 1: Authentication & Scopes -->
      <section style="margin-bottom:48px;">
        <h2 style="font-size:1.4rem; font-weight:700; margin-bottom:16px;">1. Authentication & Scopes</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; line-height:1.6; margin-bottom:16px;">
          Requests to <code style="color:#818CF8;">POST /mcp</code> must include an <code style="color:#818CF8;">Authorization: Bearer &lt;token&gt;</code> header. Tokens can be minted either via OAuth 2.1 Authorization Code Flow with PKCE (for Claude and ChatGPT) or as Personal MCP Tokens (<code style="color:#22D3EE;">mcp_live_*</code>) for custom agents.
        </p>

        <div class="card">
          <table style="width:100%; border-collapse:collapse; font-size:0.875rem; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-subtle); color:var(--text-dim);">
                <th style="padding:10px 12px;">Scope</th>
                <th style="padding:10px 12px;">Role Required</th>
                <th style="padding:10px 12px;">Permissions</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 12px;"><code>career:read</code></td>
                <td style="padding:10px 12px;"><span class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted);">READONLY</span></td>
                <td style="padding:10px 12px; color:var(--text-muted);">Read candidate profile, verified skills, evidence items, and active applications.</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;"><code>career:write</code></td>
                <td style="padding:10px 12px;"><span class="badge badge-indigo">MEMBER</span></td>
                <td style="padding:10px 12px; color:var(--text-muted);">Generate tailored resumes, draft cover letters, track applications, and propose PR improvements.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section 2: Complete 16-Tool Catalog -->
      <section style="margin-bottom:48px;">
        <h2 style="font-size:1.4rem; font-weight:700; margin-bottom:16px;">2. Complete Tool Catalog (16 Tools)</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; line-height:1.6; margin-bottom:16px;">
          All tools enforce strict tenant isolation and server-derived identity context.
        </p>

        <div class="card" style="padding:0; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; font-size:0.875rem; text-align:left;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border-subtle); color:var(--text-dim);">
                <th style="padding:12px 16px;">Category</th>
                <th style="padding:12px 16px;">Tool Name</th>
                <th style="padding:12px 16px;">Scope</th>
                <th style="padding:12px 16px;">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-cyan">Read</span></td>
                <td style="padding:10px 16px;"><code>get_candidate_profile</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Inspect candidate profile, headline, verified skills, and projects.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-cyan">Read</span></td>
                <td style="padding:10px 16px;"><code>list_verified_skills</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">List skills verified by code AST evidence.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-cyan">Read</span></td>
                <td style="padding:10px 16px;"><code>inspect_project_evidence</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Inspect commit-pinned evidence items for a project codebase.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-cyan">Read</span></td>
                <td style="padding:10px 16px;"><code>analyze_job_fit</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Match candidate evidence graph against a target job description.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-indigo">Artifact</span></td>
                <td style="padding:10px 16px;"><code>generate_tailored_resume</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Generate evidence-grounded tailored resume markdown.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-indigo">Artifact</span></td>
                <td style="padding:10px 16px;"><code>draft_cover_letter</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Draft targeted cover letter citing authentic code projects.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-indigo">Artifact</span></td>
                <td style="padding:10px 16px;"><code>recommend_portfolio_projects</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Select top portfolio repositories matching job requirements.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>track_job_application</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Create a new tracked job application entry.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>list_active_applications</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">List active job applications in workspace.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>get_job_application</code></td>
                <td style="padding:10px 16px;"><code>career:read</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Get detailed application record with stages and document snapshots.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>update_application_status</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Transition application lifecycle status (e.g. SAVED -> APPLIED).</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>add_application_stage</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Add interview stage to an active application.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>update_application_stage_outcome</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Record stage outcome (PASSED/REJECTED) and feedback.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-amber">Tracking</span></td>
                <td style="padding:10px 16px;"><code>attach_application_document</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Attach immutable tailored document snapshot to application.</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 16px;"><span class="badge badge-verified">Write Safety</span></td>
                <td style="padding:10px 16px;"><code>propose_project_improvement</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Generate unified diff proposal and Action Approval Ticket.</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;"><span class="badge badge-verified">Write Safety</span></td>
                <td style="padding:10px 16px;"><code>confirm_and_create_pr</code></td>
                <td style="padding:10px 16px;"><code>career:write</code></td>
                <td style="padding:10px 16px; color:var(--text-muted);">Verify approval ticket, check HEAD SHA, and open GitHub PR.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section 3: Two-Phase Write Safety Protocol -->
      <section style="margin-bottom:48px;">
        <h2 style="font-size:1.4rem; font-weight:700; margin-bottom:16px;">3. Two-Phase Write Safety Protocol</h2>
        <div class="card" style="border-left: 3px solid var(--accent-emerald);">
          <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6; margin-bottom:12px;">
            AI assistants are strictly prohibited from modifying code repositories directly. Career Hub enforces a cryptographically signed human-in-the-loop signoff flow:
          </p>
          <ol style="margin-left:20px; color:var(--text-muted); font-size:0.875rem; display:flex; flex-direction:column; gap:8px;">
            <li><strong>AI Proposes Patch:</strong> Calls <code>propose_project_improvement</code>. Server generates a unified diff and an HMAC-signed Action Approval Ticket.</li>
            <li><strong>Human Review:</strong> User inspects the exact diff in chat or UI.</li>
            <li><strong>Explicit Confirmation:</strong> User confirms. AI calls <code>confirm_and_create_pr(ticketId)</code>.</li>
            <li><strong>Isolated Branch PR:</strong> Server verifies ticket validity and remote HEAD SHA, creates branch <code>antigravity/patch-*</code>, and opens a GitHub Pull Request.</li>
          </ol>
        </div>
      </section>

      <!-- Section 4: Future Capabilities (Planned) -->
      <section style="margin-bottom:48px;">
        <h2 style="font-size:1.4rem; font-weight:700; margin-bottom:16px;">4. Roadmap & Future Capabilities</h2>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
          <div class="card" style="opacity:0.85;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 style="font-size:0.95rem; font-weight:600;">MCP Apps Extension</h4>
              <span class="badge badge-amber">Planned (P13.5)</span>
            </div>
            <p style="font-size:0.825rem; color:var(--text-muted);">
              Interactive <code>ui://</code> sandboxed iframes for visual Job-Fit radar charts and PR diff reviews directly inside Claude & ChatGPT.
            </p>
          </div>

          <div class="card" style="opacity:0.85;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 style="font-size:0.95rem; font-weight:600;">Official MCP Registry</h4>
              <span class="badge badge-amber">Planned (P13.5)</span>
            </div>
            <p style="font-size:0.825rem; color:var(--text-muted);">
              Public <code>server.json</code> listing on <code>registry.modelcontextprotocol.io</code> with domain ownership verification.
            </p>
          </div>
        </div>
      </section>
    </div>
  `;

  return renderLayout({
    title: 'Model Context Protocol (MCP) Documentation',
    content,
    activeNav: 'docs',
    user,
  });
}
