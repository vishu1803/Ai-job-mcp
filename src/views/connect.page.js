/**
 * @file AI Connection Center View Template (P13.5-004 / ARCH-051).
 *
 * Implements the human-facing AI connection management interface:
 * 1. AI Provider status cards (Claude, ChatGPT, Gemini).
 * 2. Copyable MCP endpoint with local development & staging warnings.
 * 3. Dedicated Personal MCP API token generator & revocation table.
 * 4. Two-phase write safety & human-in-the-loop approval architecture.
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
  if (!date) return 'Never';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats token scope badges.
 *
 * @param {string[]} scopes
 * @returns {string}
 */
function renderScopeBadges(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return `<span class="badge" style="background:rgba(255,255,255,0.06); color:#94a3b8;">career:read</span>`;
  }
  return scopes
    .map((s) => {
      if (s === 'career:write') {
        return `<span class="badge badge-indigo" style="font-size:0.75rem;">career:write</span>`;
      }
      return `<span class="badge" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3); font-size:0.75rem;">career:read</span>`;
    })
    .join(' ');
}

/**
 * Renders the AI Connection Center HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} [params.candidate] Authenticated candidate profile
 * @param {Array<object>} [params.mcpTokens=[]] Personal MCP tokens list
 * @param {string} [params.newRawToken=''] Newly generated raw secret token (shown ONCE)
 * @param {string} [params.newTokenName=''] Newly generated token name
 * @param {string} [params.csrfToken=''] CSRF anti-tamper token
 * @param {string} [params.flashMessage=''] Success flash message
 * @param {string} [params.errorMessage=''] Error flash message
 * @param {string} [params.baseUrl='http://localhost:3000'] Server base URL
 * @returns {string} Full HTML document
 */
export function renderConnectPage({
  user,
  tenant: _tenant = null,
  candidate = null,
  mcpTokens = [],
  newRawToken = '',
  newTokenName = '',
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
  baseUrl = 'http://localhost:3000',
}) {
  const candidateName = user?.displayName || candidate?.displayName || 'Authenticated Candidate';
  const candidateEmail = user?.email || candidate?.canonicalEmail || '';
  const mcpEndpointUrl = `${baseUrl.replace(/\/$/, '')}/mcp`;

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
        <span class="current">AI Connect</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Model Context Protocol (MCP) Remote Architecture</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">JSON-RPC 2.0 • Protocol Version 2026-07-28</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step"><span>📦</span> Verified Knowledge Graph</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🔑</span> Auth (OAuth 2.1 PKCE / Bearer Token)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active"><span>🌐</span> Remote MCP Server (/mcp)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>🤖</span> Claude / ChatGPT / Gemini</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step"><span>⚖️</span> Two-Phase Safe Approval</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
            <span class="badge badge-indigo">AI INTEGRATION HUB</span>
            <span class="badge badge-verified">PROTOCOL 2026-07-28</span>
          </div>
          <h1>AI Connection Center</h1>
          <p>
            Connect your trusted AI assistants (Anthropic Claude, OpenAI ChatGPT, Google Gemini) to your sovereign Career Hub knowledge graph over the remote Model Context Protocol (MCP).
          </p>
        </div>
      </div>

      <!-- Authenticated Candidate Context Banner -->
      <div class="context-banner">
        <div class="context-banner-inner">
          <div class="context-banner-avatar">
            ${escapeHtml(candidateName.charAt(0).toUpperCase())}
          </div>
          <div>
            <div class="context-banner-meta">
              <span>${escapeHtml(candidateName)}</span>
              <span class="badge badge-indigo" style="font-size:0.7rem;">ACTIVE WORKSPACE</span>
            </div>
            <div class="context-banner-sub">
              ${escapeHtml(candidateEmail)} • Role: <strong style="color:#CBD5E1;">${escapeHtml(user.role || 'OWNER')}</strong>
            </div>
          </div>
        </div>
        <div style="font-size:0.8rem; color:#64748B;">
          ${mcpTokens.length} active personal ${mcpTokens.length === 1 ? 'token' : 'tokens'}
        </div>
      </div>

      <!-- Flash & Error Messages -->
      ${flashMessage ? `<div class="alert alert-success">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- One-Time Raw Token Banner (if newly created) -->
      ${
        newRawToken
          ? `
        <div class="alert" style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.4); border-left: 5px solid #22c55e; padding: 1.25rem; border-radius: 8px; margin-bottom: 2rem;">
          <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
            <span style="font-size: 1.5rem;">🔑</span>
            <div style="flex: 1;">
              <strong style="color: #4ade80; font-size: 1rem;">Personal MCP API Token Generated: "${escapeHtml(newTokenName || 'Token')}"</strong>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem; line-height: 1.5;">
                Copy your token now. <strong>For security, it will NEVER be displayed again.</strong> If lost, you must revoke this token and generate a new one.
              </p>
              <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                <input type="text" readonly value="${escapeHtml(newRawToken)}" id="rawTokenInput" style="flex: 1; min-width: 320px; font-family: var(--font-mono); font-size: 0.85rem; padding: 0.6rem 0.8rem; background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; color: #4ade80;">
                <button type="button" onclick="copyToClipboard('rawTokenInput', 'copyTokenBtn')" id="copyTokenBtn" class="btn btn-primary btn-sm" style="background: #16a34a; border-color: #22c55e;">
                  <span>📋 Copy Token</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `
          : ''
      }

      <!-- Remote MCP Endpoint Box -->
      <div class="card" style="margin-bottom: 2rem; background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <h2 style="font-size: 1.2rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.25rem;">Universal Remote MCP Endpoint</h2>
            <p style="color: #94a3b8; font-size: 0.875rem;">
              Provide this Streamable HTTP URL when adding Career Hub to Claude, ChatGPT, or custom MCP clients.
            </p>
          </div>
          <span class="badge badge-indigo">Streamable HTTP (POST /mcp)</span>
        </div>

        <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem;">
          <div style="flex: 1; min-width: 280px; position: relative;">
            <input type="text" readonly value="${escapeHtml(mcpEndpointUrl)}" id="mcpEndpointInput" style="width: 100%; font-family: var(--font-mono); font-size: 0.9rem; padding: 0.65rem 0.9rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #38bdf8;">
          </div>
          <button type="button" onclick="copyToClipboard('mcpEndpointInput', 'copyEndpointBtn')" id="copyEndpointBtn" class="btn btn-secondary btn-sm" style="padding: 0.65rem 1.25rem;">
            <span>📋 Copy Endpoint</span>
          </button>
        </div>

        <!-- Localhost / Cloudflare Warning -->
        <div style="background: rgba(245, 158, 11, 0.08); border-left: 3px solid #f59e0b; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.825rem; color: #cbd5e1; line-height: 1.5;">
          <strong style="color: #fbbf24;">Local Development vs Cloud AI Hosts:</strong>
          Localhost (<code>http://localhost:3000/mcp</code>) is strictly accessible from local processes (e.g. Claude Desktop, local scripts). Hosted cloud AI platforms (Claude.ai SaaS, ChatGPT Web) require a public HTTPS URL (e.g. running <code>cloudflared tunnel --url http://localhost:3000</code> or deploying on a staging domain).
        </div>
      </div>

      <!-- Provider Status & Connection Cards -->
      <div style="margin-bottom: 2.5rem;">
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem;">Supported AI Providers</h2>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
          <!-- 1. Anthropic Claude Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(99, 102, 241, 0.3);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                    🟣
                  </div>
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 600; color: #f8fafc;">Anthropic Claude</h3>
                    <span style="font-size: 0.75rem; color: #94a3b8;">Claude.ai • Desktop • Code CLI</span>
                  </div>
                </div>
                <span class="badge badge-indigo">OAuth 2.1 + PKCE</span>
              </div>

              <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">
                Connect seamlessly via OAuth 2.1 with PKCE S256 and RFC 8707 resource targeting. Claude discovers scopes and authenticates interactively without sharing API secrets.
              </p>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Connection Status</div>
                <div style="color: #4ade80; font-weight: 500; margin-top: 2px;">
                  ● Ready for Connection (Client-Managed OAuth)
                </div>
                <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 4px;">
                  Discovery: <code>/.well-known/oauth-authorization-server</code>
                </div>
              </div>

              <details style="font-size: 0.825rem; color: #cbd5e1; margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #818cf8; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup Instructions (Claude.ai & Desktop)
                </summary>
                <div style="padding: 0.5rem; background: rgba(15, 23, 42, 0.4); border-radius: 6px; line-height: 1.5;">
                  <ol style="margin-left: 1.2rem;">
                    <li>Open <strong>Claude.ai</strong> -> Settings -> Connectors, or Claude Desktop.</li>
                    <li>Add Custom MCP Server: <code>${escapeHtml(mcpEndpointUrl)}</code></li>
                    <li>Click <strong>Connect</strong>. Complete interactive login & authorize permissions.</li>
                    <li>Scopes requested: <code>career:read</code>, <code>career:write</code>.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              <a href="/docs/mcp#claude" class="btn btn-secondary btn-sm" style="width: 100%;">
                <span>View Claude Guide →</span>
              </a>
            </div>
          </div>

          <!-- 2. OpenAI ChatGPT Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(16, 185, 129, 0.3);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                    🟢
                  </div>
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 600; color: #f8fafc;">OpenAI ChatGPT</h3>
                    <span style="font-size: 0.75rem; color: #94a3b8;">ChatGPT Web • Desktop • Custom GPTs</span>
                  </div>
                </div>
                <span class="badge badge-verified">OAuth 2.1</span>
              </div>

              <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">
                Connect your Custom GPT or Developer Mode actions with RFC 9728 Protected Resource metadata and automatic OAuth 2.1 token exchange.
              </p>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Connection Status</div>
                <div style="color: #4ade80; font-weight: 500; margin-top: 2px;">
                  ● Ready for Connection (Client-Managed OAuth)
                </div>
                <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 4px;">
                  Clients: <code>chatgpt-web</code>, <code>chatgpt-desktop</code>
                </div>
              </div>

              <details style="font-size: 0.825rem; color: #cbd5e1; margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #34d399; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup Instructions (Custom GPT Actions)
                </summary>
                <div style="padding: 0.5rem; background: rgba(15, 23, 42, 0.4); border-radius: 6px; line-height: 1.5;">
                  <ol style="margin-left: 1.2rem;">
                    <li>Open <strong>Explore GPTs</strong> -> Create/Edit Custom GPT.</li>
                    <li>Add Action / MCP server with endpoint <code>${escapeHtml(mcpEndpointUrl)}</code>.</li>
                    <li>Set Authentication to <strong>OAuth</strong> with Client ID <code>chatgpt-web</code>.</li>
                    <li>OAuth Callback URL: <code>https://chatgpt.com/api/mcp/oauth_callback</code>.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              <a href="/docs/mcp#chatgpt" class="btn btn-secondary btn-sm" style="width: 100%;">
                <span>View ChatGPT Guide →</span>
              </a>
            </div>
          </div>

          <!-- 3. Google Gemini Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(6, 182, 212, 0.3);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(6, 182, 212, 0.2); border: 1px solid rgba(6, 182, 212, 0.4); display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">
                    🔵
                  </div>
                  <div>
                    <h3 style="font-size: 1.1rem; font-weight: 600; color: #f8fafc;">Google Gemini</h3>
                    <span style="font-size: 0.75rem; color: #94a3b8;">Antigravity SDK • IDE Agents • Scripts</span>
                  </div>
                </div>
                <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: #22d3ee; border: 1px solid rgba(6, 182, 212, 0.3);">Personal Token</span>
              </div>

              <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">
                Integrate with Gemini-powered agent pipelines, the Google Antigravity SDK, and command-line assistants using high-entropy Personal MCP API Tokens.
              </p>

              <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="color: #64748b; font-size: 0.75rem; text-transform: uppercase;">Authentication Method</div>
                <div style="color: #38bdf8; font-weight: 500; margin-top: 2px;">
                  Bearer Token (<code style="color:#22d3ee;">mcp_live_*</code>)
                </div>
                <div style="color: #94a3b8; font-size: 0.75rem; margin-top: 4px;">
                  Generate a personal token below to connect.
                </div>
              </div>

              <details style="font-size: 0.825rem; color: #cbd5e1; margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #22d3ee; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup Instructions (Gemini SDK & Agents)
                </summary>
                <div style="padding: 0.5rem; background: rgba(15, 23, 42, 0.4); border-radius: 6px; line-height: 1.5;">
                  <ol style="margin-left: 1.2rem;">
                    <li>Generate a personal token below with required scopes.</li>
                    <li>Set header: <code>Authorization: Bearer mcp_live_...</code></li>
                    <li>Send JSON-RPC payloads to <code>${escapeHtml(mcpEndpointUrl)}</code>.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              <a href="/docs/mcp#gemini" class="btn btn-secondary btn-sm" style="width: 100%;">
                <span>View Gemini Guide →</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Personal MCP Token Generator & Management Table -->
      <div class="card" style="margin-bottom:2.5rem;">
        <div class="section-header" style="margin-bottom:1.5rem;">
          <div>
            <h2>Personal MCP API Tokens</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">
              Generate dedicated API tokens for programmatic agents, IDE sidecars, or custom MCP clients. Maximum 10 active tokens per user.
            </p>
          </div>
        </div>

        <!-- Token Creation Form -->
        <form action="/connect/tokens" method="POST" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 2rem;">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group">
              <label class="form-label" for="tokenNameInput" style="font-size: 0.85rem;">Token Name / Label</label>
              <input type="text" id="tokenNameInput" name="name" required placeholder="e.g. Gemini Antigravity Agent, Cursor IDE" class="form-control" style="font-size: 0.875rem;">
            </div>

            <div class="form-group">
              <label class="form-label" for="expirySelect" style="font-size: 0.85rem;">Expiration Period</label>
              <select id="expirySelect" name="expiryDays" class="form-control" style="font-size: 0.875rem; background: rgba(15, 23, 42, 0.9);">
                <option value="30">30 Days (Recommended)</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days</option>
                <option value="0">No Expiration</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 1.25rem;">
            <label class="form-label" style="font-size: 0.85rem; margin-bottom: 0.5rem; display: block;">Authorized Scopes</label>
            <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
              <label style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" name="scopes" value="career:read" checked style="accent-color: #6366f1;">
                <span><code>career:read</code> (Inspect profile, skills, evidence, applications)</span>
              </label>
              ${
                user.role !== 'READONLY'
                  ? `
                <label style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #cbd5e1; cursor: pointer;">
                  <input type="checkbox" name="scopes" value="career:write" checked style="accent-color: #6366f1;">
                  <span><code>career:write</code> (Generate tailored resumes, cover letters, propose PR improvements)</span>
                </label>
              `
                  : ''
              }
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-sm" style="padding: 0.6rem 1.25rem;">
            <span>✨ Generate Personal MCP Token</span>
          </button>
        </form>

        <!-- Active Tokens List -->
        <div class="section-header" style="margin-bottom:0.75rem;">
          <h3 style="font-size:1rem; font-weight:600;">Active Tokens (${mcpTokens.length})</h3>
        </div>
        ${
          mcpTokens.length === 0
            ? `
          <div class="empty-state" style="padding:2rem;">
            <div class="empty-state-icon">🔑</div>
            <h3>No Personal MCP Tokens Yet</h3>
            <p>Generate a token above to connect external tools like Gemini, Cursor, or custom scripts.</p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Token Name</th>
                  <th>Prefix</th>
                  <th>Scopes</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Last Used</th>
                  <th style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${mcpTokens
                  .map(
                    (t) => `
                  <tr>
                    <td>
                      <div style="font-weight: 500; color: #f1f5f9;">${escapeHtml(t.name)}</div>
                    </td>
                    <td>
                      <code style="font-size: 0.8rem; color: #38bdf8;">${escapeHtml(t.tokenPrefix)}...</code>
                    </td>
                    <td>${renderScopeBadges(t.scopes)}</td>
                    <td style="color: #94a3b8; font-size: 0.825rem;">${formatDate(t.createdAt)}</td>
                    <td style="color: #94a3b8; font-size: 0.825rem;">${formatDate(t.expiresAt)}</td>
                    <td style="color: #94a3b8; font-size: 0.825rem;">${formatDate(t.lastUsedAt)}</td>
                    <td style="text-align: right;">
                      <form action="/connect/tokens/${escapeHtml(t.id)}/revoke" method="POST" onsubmit="return confirm('Revoke token &quot;${escapeHtml(t.name)}&quot;? Any client using it will lose access.');" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                        <button type="submit" class="btn btn-secondary btn-sm" style="color: #f87171; font-size: 0.75rem; padding: 0.3rem 0.6rem;">
                          Revoke
                        </button>
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
      </div>

      <!-- Human-in-the-Loop Write Safety Architecture Banner -->
      <div class="card" style="border-left: 4px solid var(--accent-emerald); background: rgba(16, 185, 129, 0.04);">
        <h3 style="font-size: 1.05rem; font-weight: 600; color: #34d399; margin-bottom: 0.5rem;">
          🛡️ Two-Phase Write Safety & Stopping Protocol
        </h3>
        <p style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6; margin-bottom: 0.75rem;">
          AI assistants are strictly prohibited from making direct modifications to your GitHub repositories or publishing unauthorized artifacts. Career Hub enforces a cryptographically signed two-phase approval protocol:
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; font-size: 0.8rem; color: #cbd5e1;">
          <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8;">1. Proposal Generation</strong>
            <p style="color: #94a3b8; margin-top: 2px;">AI calls <code>propose_project_improvement</code>. Server generates a validated diff and signed Action Approval Ticket.</p>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8;">2. Human Diff Review</strong>
            <p style="color: #94a3b8; margin-top: 2px;">You inspect the exact file modifications in your chat interface or web workspace.</p>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8;">3. Explicit Confirmation</strong>
            <p style="color: #94a3b8; margin-top: 2px;">Only after your explicit confirmation, AI calls <code>confirm_and_create_pr</code> with your ticket ID.</p>
          </div>
          <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8;">4. Isolated Draft PR</strong>
            <p style="color: #94a3b8; margin-top: 2px;">Server validates HEAD SHA, creates branch <code>feat/career-hub-*</code>, and opens a Draft Pull Request.</p>
          </div>
        </div>
      </div>
    </div>
    </div>

    <!-- Interactive Copy Script -->
    <script>
      function copyToClipboard(inputId, buttonId) {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(buttonId);
        if (!input) return;

        navigator.clipboard.writeText(input.value).then(() => {
          if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span>✓ Copied!</span>';
            setTimeout(() => {
              btn.innerHTML = originalText;
            }, 2000);
          }
        }).catch(() => {
          input.select();
          document.execCommand('copy');
        });
      }
    </script>
  `;

  return renderLayout({
    title: 'AI Connection Center — Antigravity Career Hub',
    content,
    activeNav: 'connect',
    user,
  });
}
