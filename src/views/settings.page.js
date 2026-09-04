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
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'U';

  const content = `
    <div class="container" style="max-width:760px; margin: 28px auto 72px; padding: 0 16px;">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb" style="margin-bottom:12px;">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Settings</span>
      </div>

      <!-- Header -->
      <div style="margin-bottom:32px;">
        <span class="badge badge-indigo" style="margin-bottom:8px; font-size:0.7rem; letter-spacing:0.04em;">WORKSPACE SETTINGS</span>
        <h1 style="font-size:1.65rem; font-weight:700; letter-spacing:-0.02em; color:var(--text-main); margin-bottom:6px;">Account & Privacy Settings</h1>
        <p style="color:var(--text-muted); font-size:0.9rem; margin-top:2px; line-height:1.5;">
          Manage your candidate profile identity, active browser sessions, connected integrations, data portability, and GDPR Article 17 data sovereignty.
        </p>
      </div>

      <div style="display:flex; flex-direction:column; gap:24px;">
        <!-- Section 1: Candidate Identity & Workspace -->
        <div class="card">
          <div class="section-header" style="margin-bottom:18px; padding-bottom:12px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <h2 style="font-size:1.05rem; font-weight:600; color:var(--text-main); margin:0;">Candidate Identity & Workspace</h2>
              <p style="font-size:0.8rem; color:var(--text-muted); margin:2px 0 0;">Authenticated user credentials and multi-tenant workspace context.</p>
            </div>
            <a href="/profile" class="btn btn-secondary btn-sm">Edit Full Profile →</a>
          </div>

          <!-- User Identity Strip -->
          <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px; padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
            <div style="width:48px; height:48px; border-radius:50%; background:#1F2937; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1rem; color:var(--text-main); flex-shrink:0;">
              ${escapeHtml(initials)}
            </div>
            <div style="flex:1; min-width:0;">
              <div style="font-size:1rem; font-weight:600; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(displayName)}
              </div>
              <div style="font-size:0.825rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(user.email || 'Not specified')}
              </div>
            </div>
            <span class="badge" style="background:rgba(99,102,241,0.12); color:#818CF8; border:1px solid rgba(99,102,241,0.25); font-size:0.7rem;">
              TIER: ${escapeHtml(tenant.tier)}
            </span>
          </div>

          <!-- Metadata Grid -->
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:16px;">
            <div style="padding:10px 12px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:600;">Display Name</div>
              <div style="font-size:0.875rem; font-weight:600; color:var(--text-main); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(user.displayName || 'Not specified')}</div>
            </div>
            <div style="padding:10px 12px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:600;">Canonical Email</div>
              <div style="font-size:0.875rem; font-weight:600; color:var(--text-main); overflow:hidden; text-overflow:ellipsis;">${escapeHtml(user.email || 'Not specified')}</div>
            </div>
            <div style="padding:10px 12px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:600;">Tenant Workspace</div>
              <div style="font-size:0.875rem; font-weight:600; color:var(--text-main);">${escapeHtml(tenant.tier)}</div>
            </div>
            <div style="padding:10px 12px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
              <div style="font-size:0.7rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; font-weight:600;">Account Status</div>
              <div style="font-size:0.875rem; font-weight:600; color:var(--accent-emerald);">● ${escapeHtml(user.status)}</div>
            </div>
          </div>
        </div>

        <!-- Section 2: Security & Active Session -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <h2 style="font-size:1.05rem; font-weight:600; color:var(--text-main); margin:0;">Security & Active Browser Session</h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:2px 0 0;">Authentication tokens and session lifecycle on this device.</p>
          </div>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
            Your session is secured with an HTTP-only partitioned cookie and isolated within your tenant boundary. Sign out to terminate your active browser session on this device. You can sign in again via GitHub OAuth at any time.
          </p>
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:12px 16px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
            <div>
              <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Current Session: Active</div>
              <div style="font-size:0.775rem; color:var(--text-dim);">Authenticated via GitHub OAuth (AES-256-GCM token storage)</div>
            </div>
            <form action="/auth/logout" method="POST" style="margin:0;">
              <button type="submit" class="btn btn-secondary btn-sm">Sign Out Session</button>
            </form>
          </div>
        </div>

        <!-- Section 3: Connected Integrations & AI Connectors -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <h2 style="font-size:1.05rem; font-weight:600; color:var(--text-main); margin:0;">Connected Integrations & AI Clients</h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:2px 0 0;">Manage code sources, repository synchronization, and external AI provider tokens.</p>
          </div>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
            Inspect connected code repositories, synchronization pipelines, external AI client configurations, and developer documentation.
          </p>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">Code Sources</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">GitHub App installation, repository selections, and AST indexing triggers.</div>
              </div>
              <div>
                <a href="/sources" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">Manage Sources →</a>
              </div>
            </div>
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">AI Connect Center</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">Claude, ChatGPT, Gemini connections and Personal MCP API Tokens.</div>
              </div>
              <div>
                <a href="/connect" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">AI Connectors →</a>
              </div>
            </div>
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">Developer MCP Docs</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">26-tool catalog, 8 resources, 4 prompts, parameters, and JSON-RPC specs.</div>
              </div>
              <div>
                <a href="/docs/mcp" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">MCP Documentation →</a>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 4: Data Portability & Sovereignty -->
        <div class="card">
          <div class="section-header" style="margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--border-subtle);">
            <h2 style="font-size:1.05rem; font-weight:600; color:var(--text-main); margin:0;">Data Portability & Inspection</h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:2px 0 0;">Inspect, verify, and manage your sovereign career records and evidence graphs.</p>
          </div>
          <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
            You maintain 100% sovereign ownership over your career data. Career Hub operates with zero-hallucination truth verification, and all claims remain strictly tied to verified AST code evidence or self-declared provenance. You can directly inspect or export your indexed career records:
          </p>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">Resumes & Documents</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">Uploaded PDF/DOCX resumes, parsed claim sections, and tailored documents.</div>
              </div>
              <div>
                <a href="/resumes" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">Inspect Resumes →</a>
              </div>
            </div>
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">Verified Skills Graph</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">5-tier evidence classifications, confidence scores, and AST code citations.</div>
              </div>
              <div>
                <a href="/skills" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">Explore Skills →</a>
              </div>
            </div>
            <div style="padding:12px 14px; background:rgba(255,255,255,0.015); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); display:flex; flex-direction:column; justify-content:space-between; gap:10px;">
              <div>
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main); margin-bottom:2px;">Self-Service Data Deletion</div>
                <div style="font-size:0.775rem; color:var(--text-muted); line-height:1.4;">Detailed guide on selective data purging, unlinking sources, and GDPR rights.</div>
              </div>
              <div>
                <a href="/data-deletion" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center;">Deletion Guide →</a>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 5: Data Sovereignty & GDPR Article 17 Hard Deletion -->
        <div class="card" style="border:1px solid rgba(239,68,68,0.25); background:rgba(239,68,68,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
              <span class="badge" style="background:rgba(239,68,68,0.12); color:#FCA5A5; border:1px solid rgba(239,68,68,0.25); margin-bottom:8px; font-size:0.7rem; font-weight:600; letter-spacing:0.04em;">GDPR ARTICLE 17</span>
              <h2 style="font-size:1.15rem; font-weight:700; color:#FCA5A5; margin-top:4px; margin-bottom:0;">Data Sovereignty & Account Erasure</h2>
            </div>
          </div>

          <div class="alert alert-warning" style="margin-bottom:16px; font-size:0.85rem; line-height:1.5;">
            <strong>Irreversible Action:</strong> Deleting your account permanently purges your profile, tenant records, indexed AST evidence, tailored documents, OAuth credentials, and MCP tokens across all database tables in a single atomic operation.
          </div>

          <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5; margin-bottom:14px;">
            You maintain 100% sovereign ownership of your data under GDPR Article 17 (Right to Erasure). This erasure cascades across all 18+ database tables and cannot be undone.
          </p>

          <div style="margin-bottom:18px; padding:12px 14px; background:rgba(0,0,0,0.2); border:1px solid rgba(239,68,68,0.15); border-radius:var(--radius-sm); font-size:0.8rem; color:var(--text-muted);">
            <div style="font-weight:600; color:#FCA5A5; margin-bottom:6px;">Data permanently erased during hard deletion:</div>
            <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; line-height:1.4;">
              <li>Candidate profile, headline, career status, and job search preferences</li>
              <li>Verified skills, AST syntax extracts, confidence scores, and code evidence items</li>
              <li>GitHub App installation links, webhook subscriptions, and repository sync caches</li>
              <li>AI provider OAuth tokens (Claude, ChatGPT) and Personal MCP API Tokens</li>
              <li>Job application tracking pipeline records, tailored resumes, and cover letters</li>
            </ul>
          </div>

          <form action="/account" method="POST" onsubmit="return confirm('Are you sure you want to permanently delete your account and ALL associated data? This includes:\\n\\n• Candidate profile & resume data\\n• Verified skills & project evidence\\n• GitHub integration & repository sync\\n• AI provider tokens\\n• Application tracking history\\n\\nThis action is irreversible. Type DELETE in the next prompt to confirm.');">
            <input type="hidden" name="_method" value="DELETE">
            <button type="submit" class="btn btn-danger">
              Delete Account & All Data
            </button>
          </form>
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
