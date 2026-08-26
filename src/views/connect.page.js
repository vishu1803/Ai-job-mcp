/**
 * @file AI Connection Center View Template.
 */

import { renderLayout } from './layout.js';

/**
 * Renders the AI Connection Center HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params._tenant] Authenticated tenant
 * @param {Array} [params._mcpTokens=[]] Personal MCP tokens list
 * @param {Array} [params._oauthClients=[]] Connected OAuth clients list
 * @returns {string} Full HTML document
 */
export function renderConnectPage({ user, _tenant, _mcpTokens = [], _oauthClients = [] }) {
  const content = `
    <div class="container" style="max-width:960px; margin: 20px auto 60px;">
      <div style="margin-bottom:32px;">
        <span class="badge badge-indigo" style="margin-bottom:8px;">AI CLIENT INTEGRATION</span>
        <h1 style="font-size:1.8rem; font-weight:800;">AI Connection Center</h1>
        <p style="color:var(--text-muted); font-size:0.95rem; margin-top:4px;">
          Manage third-party AI assistant connectivity across Anthropic Claude, OpenAI ChatGPT, and Google Gemini.
        </p>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:24px; margin-bottom:36px;">
        <!-- Claude Connector Card -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:12px; height:12px; border-radius:50%; background:var(--accent-indigo);"></div>
              <h3 style="font-size:1.1rem; font-weight:700;">Anthropic Claude</h3>
            </div>
            <span class="badge badge-indigo">OAuth 2.1</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
            Connect via Claude Desktop or Claude Web Custom Connectors using RFC 8414 OAuth 2.1 PKCE authorization code flow.
          </p>
          <div style="background:rgba(0,0,0,0.25); padding:10px; border-radius:var(--radius-sm); font-size:0.8rem; margin-bottom:16px;">
            <code>URL: https://staging.careerhub.ai/mcp</code>
          </div>
          <a href="/docs/mcp#claude" class="btn btn-secondary btn-sm" style="width:100%;">View Claude Guide</a>
        </div>

        <!-- ChatGPT Connector Card -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:12px; height:12px; border-radius:50%; background:var(--accent-emerald);"></div>
              <h3 style="font-size:1.1rem; font-weight:700;">OpenAI ChatGPT</h3>
            </div>
            <span class="badge badge-verified">Custom Action</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
            Import OpenAPI Action manifest into your Custom GPT with RFC 9728 Protected Resource discovery.
          </p>
          <div style="background:rgba(0,0,0,0.25); padding:10px; border-radius:var(--radius-sm); font-size:0.8rem; margin-bottom:16px;">
            <code>Manifest: /api/openapi.json</code>
          </div>
          <a href="/docs/mcp#chatgpt" class="btn btn-secondary btn-sm" style="width:100%;">View ChatGPT Guide</a>
        </div>

        <!-- Gemini Connector Card -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:12px; height:12px; border-radius:50%; background:var(--accent-cyan);"></div>
              <h3 style="font-size:1.1rem; font-weight:700;">Google Gemini</h3>
            </div>
            <span class="badge badge-cyan">Personal Token</span>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">
            Use high-entropy personal API tokens (<code style="color:#22D3EE;">mcp_live_*</code>) for custom agents and IDE plugins.
          </p>
          <div style="background:rgba(0,0,0,0.25); padding:10px; border-radius:var(--radius-sm); font-size:0.8rem; margin-bottom:16px;">
            <code>Auth: Bearer mcp_live_...</code>
          </div>
          <a href="/docs/mcp#gemini" class="btn btn-secondary btn-sm" style="width:100%;">View Gemini Guide</a>
        </div>
      </div>

      <!-- Security Notice -->
      <div class="card" style="border-left: 3px solid var(--accent-indigo);">
        <h4 style="font-size:0.95rem; font-weight:600; margin-bottom:6px;">Zero Secret Exposure Guarantee</h4>
        <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">
          Career Hub stores OAuth refresh tokens and API credentials encrypted at rest. Tokens can be revoked immediately from your settings console. Write tools (<code style="color:#818CF8;">propose_project_improvement</code>) strictly require explicit human ticket confirmation before any code changes or PRs can be opened on GitHub.
        </p>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'AI Connection Center',
    content,
    activeNav: 'connect',
    user,
  });
}
