/**
 * @file Public Security Architecture View Template (P14-004C / ARCH-056).
 *
 * Explains high-level security architecture, OAuth 2.1, tenant isolation, and two-phase write safety.
 */

import { renderLayout } from './layout.js';

export function renderSecurityPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Security & Architecture
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Enterprise-Grade Defense-in-Depth for Evidence-Grounded AI Career Intelligence
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 2rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🛡️</span> 1. Sovereign Multi-Tenant Isolation
          </h2>
          <p>
            Career Hub enforces strict multi-tenant data isolation at the database, service, and MCP layers. Every query filters strictly by authenticated <code>tenant_id</code>. Cross-tenant access attempts return authoritative <code>404 Not Found</code> default-deny responses, preventing resource existence leakage.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🔑</span> 2. OAuth 2.1 with PKCE S256 & RFC 8414 Discovery
          </h2>
          <p>
            Authentication follows the modern OAuth 2.1 specification with mandatory PKCE (S256 code challenges), exact redirect URI verification, and dynamic RFC 8414 / RFC 9728 discovery endpoints. AI clients (such as Claude and ChatGPT) connect securely without sharing raw passwords or persistent master credentials.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🔒</span> 3. AES-256-GCM Credential Encryption & Token Hashing
          </h2>
          <p>
            Sensitive connection tokens and OAuth credentials are encrypted at rest using AES-256-GCM with authenticated tags and key versioning. Personal MCP API tokens are stored strictly as one-way SHA-256 cryptographic hashes; raw secret tokens are shown once at creation and never logged or persisted in plaintext.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>✍️</span> 4. Two-Phase Write Safety & Consequential Action Gating
          </h2>
          <p>
            Career Hub enforces a strict two-phase protocol for state-modifying actions:
          </p>
          <ul style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <li><strong>Phase 1 (Propose / Prepare):</strong> The AI prepares artifacts (diff previews, application packages) and returns a human review payload with an ephemeral, single-use cryptographic approval ticket.</li>
            <li><strong>Phase 2 (Approve & Execute):</strong> The human explicitly confirms the action. The server verifies ticket expiry (15-minute TTL), bit-for-bit package hash integrity, and single-use state before executing.</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>📜</span> 5. Non-Repudiation Audit Logging
          </h2>
          <p>
            All MCP tool invocations, permission checks, rate limit events, and write operations are recorded in an append-only audit stream. Credentials, passwords, authorization headers, and raw file payloads are scrubbed before logging.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Security Architecture',
    content,
    user,
    tenant,
    activeNav: 'security',
  });
}
