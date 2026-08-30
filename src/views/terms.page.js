/**
 * @file Public Terms of Service View Template (P14-004C / ARCH-056).
 *
 * Implements standard acceptable use, AI disclaimers, human-in-the-loop approval, and liability limits.
 */

import { renderLayout } from './layout.js';

export function renderTermsPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Terms of Service
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Last Updated: August 30, 2026 • Effective Date: August 30, 2026
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Antigravity Career Hub ("Career Hub", "the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Acceptable Use Policy</h2>
          <p>You agree to use Career Hub solely for lawful career management and technical portfolio presentation. You must not:</p>
          <ul style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <li>Attempt to bypass multi-tenant isolation boundaries or access another user's candidate resources.</li>
            <li>Connect repositories or upload documents for which you do not possess authorized ownership or license.</li>
            <li>Inject malicious payloads, prompt injections, or automated scrapers that degrade platform availability.</li>
            <li>Use the Model Context Protocol (MCP) server to execute denial-of-service or credential brute-forcing attacks.</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. AI-Assisted Output & Accuracy Disclaimer</h2>
          <p>
            Career Hub utilizes artificial intelligence and deterministic AST analysis to assist with resume tailoring, cover letter drafting, and job fit analysis. While our platform enforces a strict <strong>Zero-Hallucination Evidence Gate</strong>, you acknowledge that AI models may produce suggestions requiring review. You remain solely responsible for verifying the accuracy of any resume, cover letter, or application material submitted to employers.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">4. Mandatory Human Approval for Consequential Actions</h2>
          <p>
            Career Hub strictly enforces a <strong>Human-in-the-Loop Approval Gate</strong>. External actions (including creating GitHub pull requests or submitting job applications) require your explicit cryptographic approval. Career Hub and connected AI agents will never silently submit external applications on your behalf.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">5. Third-Party Job Listings & External Portals</h2>
          <p>
            Job search results and portal links are aggregated from public feeds and ATS platforms. Career Hub does not guarantee the availability, compensation accuracy, or active status of third-party job postings.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Career Hub and its contributors shall not be liable for any indirect, incidental, special, or consequential damages resulting from employment hiring decisions, external ATS application outcomes, or service interruptions.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Terms of Service | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'terms',
  });
}
