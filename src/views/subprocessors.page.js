/**
 * @file Public Subprocessors List View Template (P14-004C / ARCH-056).
 *
 * Truthfully lists active third-party infrastructure and subprocessor categories.
 */

import { renderLayout } from './layout.js';

export function renderSubprocessorsPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Third-Party Subprocessors
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Authorized Third-Party Service Providers and Infrastructure Partners
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Overview</h2>
          <p>
            Career Hub engages select third-party service providers ("Subprocessors") to provide infrastructure hosting, database storage, and secure proxy connectivity. Each subprocessor is vetted for rigorous security standards and data confidentiality.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Active Subprocessor Registry</h2>
          <div style="overflow-x: auto; margin-top: 0.75rem;">
            <table class="table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); color: #f8fafc; text-align: left;">
                  <th style="padding: 0.6rem 0.8rem;">Subprocessor</th>
                  <th style="padding: 0.6rem 0.8rem;">Service Purpose</th>
                  <th style="padding: 0.6rem 0.8rem;">Data Transferred</th>
                  <th style="padding: 0.6rem 0.8rem;">Location</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #f8fafc;">GitHub Inc. (Microsoft)</td>
                  <td style="padding: 0.6rem 0.8rem;">OAuth 2.0 User Authentication & Repository Resource Connectors</td>
                  <td style="padding: 0.6rem 0.8rem;">User profile, repository metadata, commits</td>
                  <td style="padding: 0.6rem 0.8rem;">United States</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #f8fafc;">Aiven Cloud</td>
                  <td style="padding: 0.6rem 0.8rem;">Managed PostgreSQL 17 Database Storage & Encryption at Rest</td>
                  <td style="padding: 0.6rem 0.8rem;">Candidate profiles, skills, projects, encrypted credentials</td>
                  <td style="padding: 0.6rem 0.8rem;">AWS Cloud (Global)</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #f8fafc;">Cloudflare Inc.</td>
                  <td style="padding: 0.6rem 0.8rem;">Edge TLS Termination, DDoS Mitigation & Named Tunnel Routing</td>
                  <td style="padding: 0.6rem 0.8rem;">Encrypted transit traffic, client IP headers</td>
                  <td style="padding: 0.6rem 0.8rem;">Global Edge Network</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #f8fafc;">Google Cloud Vertex AI / Gemini API</td>
                  <td style="padding: 0.6rem 0.8rem;">Evidence-grounded text synthesis and prompt policy execution (Optional)</td>
                  <td style="padding: 0.6rem 0.8rem;">Sanitized career summary context (zero master secrets)</td>
                  <td style="padding: 0.6rem 0.8rem;">United States</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. Updates to Subprocessors</h2>
          <p>
            We notify registered workspace administrators before onboarding any new subprocessor that processes candidate personal data.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Subprocessors',
    content,
    user,
    tenant,
    activeNav: 'subprocessors',
  });
}
