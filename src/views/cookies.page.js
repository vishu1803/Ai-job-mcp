/**
 * @file Public Cookie Policy View Template (P14-004C / ARCH-056).
 *
 * Truthfully documents strictly necessary session, security, and CSRF cookies (0 marketing/tracking cookies).
 */

import { renderLayout } from './layout.js';

export function renderCookiesPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Cookie Policy
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Last Updated: August 30, 2026 • Effective Date: August 30, 2026
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Zero Third-Party Tracking Statement</h2>
          <p>
            Antigravity Career Hub strictly respects your privacy. We <strong>do not use any third-party tracking, advertising, behavioral analytics, or marketing cookies</strong>. We only use strictly necessary first-party cookies essential for user authentication, session security, and CSRF prevention.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Cookies We Utilize</h2>
          <div style="overflow-x: auto; margin-top: 0.75rem;">
            <table class="table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--border-subtle); color: #f8fafc; text-align: left;">
                  <th style="padding: 0.6rem 0.8rem;">Cookie Name</th>
                  <th style="padding: 0.6rem 0.8rem;">Classification</th>
                  <th style="padding: 0.6rem 0.8rem;">Purpose</th>
                  <th style="padding: 0.6rem 0.8rem;">Lifespan</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-family: var(--font-mono); color: #38bdf8;">career_hub_session</td>
                  <td style="padding: 0.6rem 0.8rem;"><span class="badge badge-indigo">Strictly Necessary</span></td>
                  <td style="padding: 0.6rem 0.8rem;">Secure user session token linking authenticated browser requests to your workspace.</td>
                  <td style="padding: 0.6rem 0.8rem;">7 Days (sliding)</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-family: var(--font-mono); color: #38bdf8;">oauth_transit</td>
                  <td style="padding: 0.6rem 0.8rem;"><span class="badge badge-indigo">Security / Transit</span></td>
                  <td style="padding: 0.6rem 0.8rem;">Encrypted state parameter and PKCE verifier preventing OAuth authorization code interception and CSRF.</td>
                  <td style="padding: 0.6rem 0.8rem;">10 Minutes</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <td style="padding: 0.6rem 0.8rem; font-family: var(--font-mono); color: #38bdf8;">__Host-gh_install_state</td>
                  <td style="padding: 0.6rem 0.8rem;"><span class="badge badge-indigo">Security / Transit</span></td>
                  <td style="padding: 0.6rem 0.8rem;">HMAC-SHA256 anti-tamper token protecting GitHub App installation callbacks against cross-tenant collisions.</td>
                  <td style="padding: 0.6rem 0.8rem;">15 Minutes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. Cookie Security Controls</h2>
          <p>
            All cookies issued by Career Hub are protected by the following security attributes:
          </p>
          <ul style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
            <li><code>HttpOnly</code>: Prevents client-side scripts (and XSS attacks) from reading cookie data.</li>
            <li><code>Secure</code>: Enforced on all HTTPS connections (including Cloudflare Edge TLS).</li>
            <li><code>SameSite=Lax</code> or <code>SameSite=Strict</code>: Protects against Cross-Site Request Forgery (CSRF).</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">4. Managing Cookies in Your Browser</h2>
          <p>
            Because we only use strictly necessary cookies, disabling cookies in your browser settings will prevent you from signing in or authenticating to Career Hub. You can clear existing cookies at any time through your browser's privacy settings.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Cookie Policy | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'cookies',
  });
}
