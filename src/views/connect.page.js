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
    return `<span class="badge" style="background:rgba(255,255,255,0.06); color:#94a3b8; font-size:0.75rem;">career:read</span>`;
  }
  return scopes
    .map((s) => {
      if (s === 'career:write') {
        return `<span class="badge badge-indigo" style="font-size:0.75rem;">career:write</span>`;
      }
      return `<span class="badge" style="background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); font-size:0.75rem;">career:read</span>`;
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
 * @param {object} [params.aiStatus=null] Real-time AI provider connection status
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
  aiStatus = null,
}) {
  const candidateName = user?.displayName || candidate?.displayName || 'Authenticated Candidate';
  const candidateEmail = user?.email || candidate?.canonicalEmail || '';
  const mcpEndpointUrl = `${baseUrl.replace(/\/$/, '')}/mcp`;

  const claudeStatus = aiStatus?.providers?.find((p) => p.id === 'claude') || {
    status: 'NOT_CONNECTED',
    scopes: ['career:read', 'career:write'],
    authMethod: 'OAuth 2.1 + PKCE (S256)',
    connectedAt: null,
    environment: baseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
  };

  const chatgptStatus = aiStatus?.providers?.find((p) => p.id === 'chatgpt') || {
    status: 'NOT_CONNECTED',
    scopes: ['career:read'],
    authMethod: 'OAuth 2.1 + PKCE (S256)',
    connectedAt: null,
    environment: baseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
  };

  const geminiStatus = aiStatus?.providers?.find((p) => p.id === 'gemini') || {
    status: mcpTokens.length > 0 ? 'CONNECTED' : 'NOT_CONNECTED',
    scopes: ['career:read'],
    authMethod: 'Personal MCP API Token (SHA-256)',
    connectedAt: mcpTokens[0]?.createdAt || null,
    environment: baseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'CONNECTED':
        return `<span class="badge" style="background:rgba(34,197,94,0.12); color:#4ade80; border:1px solid rgba(34,197,94,0.25); font-weight:600;">CONNECTED</span>`;
      case 'REFRESHABLE':
        return `<span class="badge" style="background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); font-weight:600;">REFRESHABLE</span>`;
      case 'REVOKED':
        return `<span class="badge" style="background:rgba(239,68,68,0.12); color:#f87171; border:1px solid rgba(239,68,68,0.25); font-weight:600;">REVOKED</span>`;
      case 'TOKEN_EXPIRED':
        return `<span class="badge" style="background:rgba(245,158,11,0.12); color:#fbbf24; border:1px solid rgba(245,158,11,0.25); font-weight:600;">EXPIRED</span>`;
      case 'NOT_CONNECTED':
      default:
        return `<span class="badge" style="background:rgba(148,163,184,0.1); color:#94a3b8; border:1px solid rgba(148,163,184,0.2); font-weight:500;">NOT CONNECTED</span>`;
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
        <span class="current">AI Connect</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Model Context Protocol (MCP) Remote Architecture</span>
          <span style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">JSON-RPC 2.0 • Protocol 2026-07-28</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step">Verified Knowledge Graph</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">OAuth 2.1 PKCE / Bearer Token</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active">Remote MCP Server (/mcp)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Claude / ChatGPT / Gemini</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Two-Phase Safe Approval</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
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
              ${escapeHtml(candidateEmail)} • Role: <strong style="color:var(--text-main); font-family:var(--font-mono);">${escapeHtml(user.role || 'OWNER')}</strong>
            </div>
          </div>
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted); font-family:var(--font-mono);">
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
        <div class="alert alert-success" style="padding: 1.25rem; margin-bottom: 2rem;">
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="badge badge-emerald" style="font-weight: 700;">SECRET TOKEN ISSUED</span>
              <strong style="color: #4ade80; font-size: 0.95rem;">"${escapeHtml(newTokenName || 'Token')}"</strong>
            </div>
            <p style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.5; margin: 0;">
              Copy your token now. <strong>For security, it will NEVER be displayed again.</strong> If lost, you must revoke this token and generate a new one.
            </p>
            <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              <input type="text" readonly value="${escapeHtml(newRawToken)}" id="rawTokenInput" style="flex: 1; min-width: 300px; font-family: var(--font-mono); font-size: 0.85rem; padding: 0.6rem 0.85rem; background: var(--bg-surface-elevated); border: 1px solid rgba(34, 197, 94, 0.4); border-radius: 6px; color: #4ade80;">
              <button type="button" onclick="copyToClipboard('rawTokenInput', 'copyTokenBtn')" id="copyTokenBtn" class="btn btn-primary btn-sm" style="background: #16a34a; border-color: #22c55e;">
                Copy Token
              </button>
            </div>
          </div>
        </div>
      `
          : ''
      }

      <!-- Remote MCP Endpoint Box -->
      <div class="card" style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <h2 style="font-size: 1.15rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">Universal Remote MCP Endpoint</h2>
            <p style="color: var(--text-dim); font-size: 0.875rem;">
              Provide this Streamable HTTP URL when adding Career Hub to Claude, ChatGPT, or custom MCP clients.
            </p>
          </div>
          <span class="badge badge-indigo">Streamable HTTP (POST /mcp)</span>
        </div>

        <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem;">
          <div style="flex: 1; min-width: 280px; position: relative;">
            <input type="text" readonly value="${escapeHtml(mcpEndpointUrl)}" id="mcpEndpointInput" style="width: 100%; font-family: var(--font-mono); font-size: 0.9rem; padding: 0.65rem 0.9rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; color: #38bdf8;">
          </div>
          <button type="button" onclick="copyToClipboard('mcpEndpointInput', 'copyEndpointBtn')" id="copyEndpointBtn" class="btn btn-secondary btn-sm" style="padding: 0.65rem 1.25rem;">
            Copy Endpoint
          </button>
        </div>

        <!-- Localhost / Cloudflare Warning -->
        <div style="background: rgba(245, 158, 11, 0.06); border-left: 3px solid #d97706; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.825rem; color: var(--text-dim); line-height: 1.5;">
          <strong style="color: #fbbf24;">Local Development vs Cloud AI Hosts:</strong>
          Career Hub simultaneously supports local development (<code>http://localhost:3000/mcp</code>) and public Cloudflare staging (<code>https://dev.aicareershub.tech/mcp</code>). Cloud AI hosts (Claude.ai, ChatGPT Web) require the public HTTPS endpoint.
        </div>
      </div>

      <!-- Provider Status & Connection Cards -->
      <div style="margin-bottom: 2.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; flex-wrap:wrap; gap:0.5rem;">
          <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--text-main); margin:0;">Real-Time AI Provider Status</h2>
          <button type="button" onclick="refreshAiStatus()" id="refreshStatusBtn" class="btn btn-secondary btn-sm" style="font-size:0.8rem; padding:0.4rem 0.8rem;">
            Refresh Live Status
          </button>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
          <!-- 1. Anthropic Claude Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(99, 102, 241, 0.25);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 6px; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #818cf8; font-family: var(--font-mono);">
                    CL
                  </div>
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-main);">Anthropic Claude</h3>
                    <span style="font-size: 0.75rem; color: var(--text-dim);">Claude.ai • Desktop • Code CLI</span>
                  </div>
                </div>
                ${renderStatusBadge(claudeStatus.status)}
              </div>

              <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.5; margin-bottom: 1rem;">
                Connect seamlessly via OAuth 2.1 with PKCE S256 and CIMD Hosted Metadata. Claude discovers scopes and authenticates interactively without sharing API secrets.
              </p>

              <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Auth Method:</span>
                  <span style="color:var(--text-main); font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(claudeStatus.authMethod)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Last Connected:</span>
                  <span style="color:var(--text-dim);">${formatDate(claudeStatus.connectedAt)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:var(--text-muted);">Authorized Scopes:</span>
                  <div>${renderScopeBadges(claudeStatus.scopes)}</div>
                </div>
              </div>

              <details style="font-size: 0.825rem; color: var(--text-dim); margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #818cf8; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup & Connection Guide
                </summary>
                <div style="padding: 0.5rem; background: var(--bg-surface-elevated); border-radius: 6px; line-height: 1.5; border: 1px solid var(--border-subtle);">
                  <ol style="margin-left: 1.2rem; padding: 0;">
                    <li>Open <strong>Claude.ai</strong> → Settings → Connectors, or Claude Desktop.</li>
                    <li>Add Custom MCP Server: <code>${escapeHtml(mcpEndpointUrl)}</code></li>
                    <li>Under OAuth Client: choose <strong>"Use Anthropic's hosted client metadata"</strong>.</li>
                    <li>Authorize Career Hub permissions interactively.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              ${
                claudeStatus.status === 'CONNECTED' || claudeStatus.status === 'REFRESHABLE'
                  ? `
                <form action="/connect/revoke-provider" method="POST" style="width:100%; margin:0;" onsubmit="return confirm('Revoke all active authorizations for Anthropic Claude?');">
                  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                  <input type="hidden" name="provider" value="claude">
                  <button type="submit" class="btn btn-secondary btn-sm" style="width:100%; color:#f87171; border-color:rgba(239,68,68,0.25);">
                    Disconnect Claude
                  </button>
                </form>
              `
                  : `
                <a href="/docs/mcp#claude" class="btn btn-primary btn-sm" style="width: 100%;">
                  Connect Claude →
                </a>
              `
              }
            </div>
          </div>

          <!-- 2. OpenAI ChatGPT Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(16, 185, 129, 0.25);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 6px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #34d399; font-family: var(--font-mono);">
                    GPT
                  </div>
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-main);">OpenAI ChatGPT</h3>
                    <span style="font-size: 0.75rem; color: var(--text-dim);">ChatGPT Web • Desktop • Custom GPTs</span>
                  </div>
                </div>
                ${renderStatusBadge(chatgptStatus.status)}
              </div>

              <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.5; margin-bottom: 1rem;">
                Connect Custom GPT or Developer Mode actions with RFC 9728 Protected Resource metadata and automatic OAuth 2.1 token exchange.
              </p>

              <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Auth Method:</span>
                  <span style="color:var(--text-main); font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(chatgptStatus.authMethod)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Last Connected:</span>
                  <span style="color:var(--text-dim);">${formatDate(chatgptStatus.connectedAt)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:var(--text-muted);">Authorized Scopes:</span>
                  <div>${renderScopeBadges(chatgptStatus.scopes)}</div>
                </div>
              </div>

              <details style="font-size: 0.825rem; color: var(--text-dim); margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #34d399; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup Instructions (Custom GPT Actions)
                </summary>
                <div style="padding: 0.5rem; background: var(--bg-surface-elevated); border-radius: 6px; line-height: 1.5; border: 1px solid var(--border-subtle);">
                  <ol style="margin-left: 1.2rem; padding: 0;">
                    <li>Open <strong>Explore GPTs</strong> → Create/Edit Custom GPT.</li>
                    <li>Add Action with endpoint <code>${escapeHtml(mcpEndpointUrl)}</code>.</li>
                    <li>Set Authentication to <strong>OAuth</strong> with Client ID <code>chatgpt-web</code>.</li>
                    <li>Authorize Career Hub permissions interactively.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              ${
                chatgptStatus.status === 'CONNECTED' || chatgptStatus.status === 'REFRESHABLE'
                  ? `
                <form action="/connect/revoke-provider" method="POST" style="width:100%; margin:0;" onsubmit="return confirm('Revoke all active authorizations for OpenAI ChatGPT?');">
                  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                  <input type="hidden" name="provider" value="chatgpt">
                  <button type="submit" class="btn btn-secondary btn-sm" style="width:100%; color:#f87171; border-color:rgba(239,68,68,0.25);">
                    Disconnect ChatGPT
                  </button>
                </form>
              `
                  : `
                <a href="/docs/mcp#chatgpt" class="btn btn-primary btn-sm" style="width: 100%;">
                  Connect ChatGPT →
                </a>
              `
              }
            </div>
          </div>

          <!-- 3. Google Gemini Card -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(6, 182, 212, 0.25);">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <div style="width: 32px; height: 32px; border-radius: 6px; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3); display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; color: #22d3ee; font-family: var(--font-mono);">
                    GEM
                  </div>
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--text-main);">Google Gemini</h3>
                    <span style="font-size: 0.75rem; color: var(--text-dim);">AI Careers Hub SDK • IDE Agents • CLI</span>
                  </div>
                </div>
                ${renderStatusBadge(geminiStatus.status)}
              </div>

              <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.5; margin-bottom: 1rem;">
                Integrate with Gemini-powered agent pipelines, IDE extensions, and command-line assistants using high-entropy Personal MCP API Tokens.
              </p>

              <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; margin-bottom: 1rem; border: 1px solid var(--border-subtle);">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Auth Method:</span>
                  <span style="color:var(--text-main); font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(geminiStatus.authMethod)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <span style="color:var(--text-muted);">Active Tokens:</span>
                  <span style="color:var(--text-dim); font-family:var(--font-mono);">${mcpTokens.length} active</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:var(--text-muted);">Authorized Scopes:</span>
                  <div>${renderScopeBadges(geminiStatus.scopes)}</div>
                </div>
              </div>

              <details style="font-size: 0.825rem; color: var(--text-dim); margin-bottom: 1rem;">
                <summary style="cursor: pointer; color: #22d3ee; font-weight: 500; margin-bottom: 0.5rem;">
                  Setup Instructions (Gemini SDK & Agents)
                </summary>
                <div style="padding: 0.5rem; background: var(--bg-surface-elevated); border-radius: 6px; line-height: 1.5; border: 1px solid var(--border-subtle);">
                  <ol style="margin-left: 1.2rem; padding: 0;">
                    <li>Generate a personal token below with required scopes.</li>
                    <li>Set header: <code>Authorization: Bearer mcp_live_...</code></li>
                    <li>Send JSON-RPC payloads to <code>${escapeHtml(mcpEndpointUrl)}</code>.</li>
                  </ol>
                </div>
              </details>
            </div>

            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: auto;">
              <a href="#tokenGenerationSection" class="btn btn-secondary btn-sm" style="width: 100%;">
                Manage Gemini Tokens ↓
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Personal MCP Token Generator & Management Table -->
      <div class="card" id="tokenGenerationSection" style="margin-bottom:2.5rem;">
        <div class="section-header" style="margin-bottom:1.5rem;">
          <div>
            <h2>Personal MCP API Tokens</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px;">
              Generate dedicated API tokens for programmatic agents, IDE sidecars, or custom MCP clients. Maximum 10 active tokens per user.
            </p>
          </div>
        </div>

        <!-- Token Creation Form -->
        <form action="/connect/tokens" method="POST" style="background: var(--bg-surface-elevated); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle); margin-bottom: 2rem;">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div class="form-group">
              <label class="form-label" for="tokenNameInput" style="font-size: 0.85rem;">Token Name / Label</label>
              <input type="text" id="tokenNameInput" name="name" required placeholder="e.g. Gemini Agent, Cursor IDE" class="form-control" style="font-size: 0.875rem;">
            </div>

            <div class="form-group">
              <label class="form-label" for="expirySelect" style="font-size: 0.85rem;">Expiration Period</label>
              <select id="expirySelect" name="expiryDays" class="form-control" style="font-size: 0.875rem;">
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
              <label style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-dim); cursor: pointer;">
                <input type="checkbox" name="scopes" value="career:read" checked style="accent-color: #6366f1;">
                <span><code>career:read</code> (Inspect profile, skills, evidence, applications)</span>
              </label>
              ${
                user.role !== 'READONLY'
                  ? `
                <label style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: var(--text-dim); cursor: pointer;">
                  <input type="checkbox" name="scopes" value="career:write" checked style="accent-color: #6366f1;">
                  <span><code>career:write</code> (Generate tailored resumes, cover letters, propose PR improvements)</span>
                </label>
              `
                  : ''
              }
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-sm" style="padding: 0.6rem 1.25rem;">
            Generate Personal Token
          </button>
        </form>

        <!-- Active Tokens List -->
        <div class="section-header" style="margin-bottom:0.75rem;">
          <h3 style="font-size:1rem; font-weight:600; color:var(--text-main);">Active Tokens (${mcpTokens.length})</h3>
        </div>
        ${
          mcpTokens.length === 0
            ? `
          <div class="empty-state" style="padding:2rem;">
            <div class="empty-state-icon" style="font-family:var(--font-mono); font-weight:700; color:var(--text-muted);">KEY</div>
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
                      <div style="font-weight: 500; color: var(--text-main);">${escapeHtml(t.name)}</div>
                    </td>
                    <td>
                      <code style="font-size: 0.8rem; color: #38bdf8;">${escapeHtml(t.tokenPrefix)}...</code>
                    </td>
                    <td>${renderScopeBadges(t.scopes)}</td>
                    <td style="color: var(--text-muted); font-size: 0.825rem;">${formatDate(t.createdAt)}</td>
                    <td style="color: var(--text-muted); font-size: 0.825rem;">${formatDate(t.expiresAt)}</td>
                    <td style="color: var(--text-muted); font-size: 0.825rem;">${formatDate(t.lastUsedAt)}</td>
                    <td style="text-align: right;">
                      <form action="/connect/tokens/${escapeHtml(t.id)}/revoke" method="POST" onsubmit="return confirm('Revoke token &quot;${escapeHtml(t.name)}&quot;? Any client using it will lose access.');" style="display:inline;">
                        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                        <button type="submit" class="btn btn-secondary btn-sm" style="color: #f87171; font-size: 0.75rem; padding: 0.3rem 0.6rem; border-color: rgba(239,68,68,0.25);">
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
      <div class="card" style="border-left: 4px solid var(--accent-emerald); background: rgba(16, 185, 129, 0.03);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom: 0.5rem;">
          <span class="badge badge-emerald" style="font-weight:700;">SAFETY KERNEL</span>
          <h3 style="font-size: 1.05rem; font-weight: 600; color: #34d399; margin: 0;">
            Two-Phase Write Safety & Stopping Protocol
          </h3>
        </div>
        <p style="font-size: 0.875rem; color: var(--text-dim); line-height: 1.6; margin-bottom: 0.75rem;">
          AI assistants are strictly prohibited from making direct modifications to your GitHub repositories or publishing unauthorized artifacts. Career Hub enforces a cryptographically signed two-phase approval protocol:
        </p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; font-size: 0.8rem; color: var(--text-dim);">
          <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8; display:block; margin-bottom:2px;">1. Proposal Generation</strong>
            <p style="color: var(--text-dim); margin: 0;">AI calls <code>propose_project_improvement</code>. Server generates a validated diff and signed Action Approval Ticket.</p>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8; display:block; margin-bottom:2px;">2. Human Diff Review</strong>
            <p style="color: var(--text-dim); margin: 0;">You inspect the exact file modifications in your chat interface or web workspace.</p>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8; display:block; margin-bottom:2px;">3. Explicit Confirmation</strong>
            <p style="color: var(--text-dim); margin: 0;">Only after your explicit confirmation, AI calls <code>confirm_and_create_pr</code> with your ticket ID.</p>
          </div>
          <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
            <strong style="color: #38bdf8; display:block; margin-bottom:2px;">4. Isolated Draft PR</strong>
            <p style="color: var(--text-dim); margin: 0;">Server validates HEAD SHA, creates branch <code>feat/career-hub-*</code>, and opens a Draft Pull Request.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Interactive Copy & Status Refresh Script -->
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

      async function refreshAiStatus() {
        const btn = document.getElementById('refreshStatusBtn');
        if (btn) btn.innerHTML = '<span>Checking...</span>';
        try {
          const res = await fetch('/api/connect/status');
          if (res.ok) {
            window.location.reload();
          }
        } catch (_err) {
          window.location.reload();
        } finally {
          if (btn) btn.innerHTML = '<span>Refresh Live Status</span>';
        }
      }
    </script>
  `;

  return renderLayout({
    title: 'AI Connection Center',
    content,
    activeNav: 'connect',
    user,
  });
}

