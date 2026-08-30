/**
 * @file Candidate Career Profile & Job Search Preferences View (P14-004C / ARCH-056).
 *
 * Implements the user-facing Career Profile and Intent Management page:
 * 1. Professional Identity & Seniority display
 * 2. Persistent Job Search Preferences (target roles, locations, remote policy, salary floor)
 * 3. Technology Stack & Industry prioritization
 * 4. User-Provided Work Authorization & Eligibility (never inferred)
 * 5. Full CSRF protection and reset capability
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the Career Profile & Preferences page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} [params.candidate] Authenticated candidate profile
 * @param {object} [params.preferences={}] Saved career preferences
 * @param {Array<string>} [params.verifiedSkills=[]] Verified skills summary
 * @param {string} [params.csrfToken=''] CSRF anti-tamper token
 * @param {string} [params.flashMessage=''] Success flash message
 * @param {string} [params.errorMessage=''] Error flash message
 * @returns {string} Full HTML document
 */
export function renderProfilePage({
  user,
  tenant = null,
  candidate = null,
  preferences = {},
  verifiedSkills = [],
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
}) {
  const targetRoles = (preferences.targetRoles || []).join(', ');
  const preferredLocations = (preferences.preferredLocations || []).join(', ');
  const remotePref = preferences.remotePreference || 'FLEXIBLE';
  const salaryFloor = preferences.salaryFloor != null ? preferences.salaryFloor : '';
  const salaryCurrency = preferences.salaryCurrency || 'USD';
  const preferredTech = (preferences.preferredTechStack || []).join(', ');
  const industries = (preferences.industries || []).join(', ');
  const companiesPrioritize = (preferences.companiesToPrioritize || []).join(', ');
  const companiesAvoid = (preferences.companiesToAvoid || []).join(', ');
  const workAuth = (preferences.workAuthorization || []).join(', ');
  const visaRequired = preferences.visaSponsorshipRequired === true;
  const availability = preferences.availabilityDate || '';
  const relocationPref = preferences.relocationPreference || 'REMOTE_ONLY';

  const content = `
    <div class="container" style="max-width: 1000px; padding: 2rem 1.5rem;">
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb" aria-label="Breadcrumb" style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem;">
        <a href="/dashboard" style="color: #94a3b8; text-decoration: none;">Dashboard</a>
        <span>/</span>
        <span style="color: #f8fafc; font-weight: 500;">Career Profile & Preferences</span>
      </nav>

      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem;">
        <div>
          <h1 style="font-size: 1.75rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
            Career Profile & Search Intent
          </h1>
          <p style="color: #94a3b8; font-size: 0.95rem; max-width: 700px; line-height: 1.5;">
            Configure your target roles, compensation floor, and work preferences. Career Hub uses this saved profile to personalize job discovery and application preparation automatically without repeatedly asking for preferences.
          </p>
        </div>
        <a href="/dashboard" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.5rem;">
          <span>← Back to Dashboard</span>
        </a>
      </div>

      <!-- Flash & Error Messages -->
      ${flashMessage ? `<div class="alert alert-success" style="margin-bottom: 1.5rem;">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom: 1.5rem;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Truth Separation & Sovereign Authority Banner -->
      <div class="card" style="background: linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%); border-left: 4px solid var(--accent-indigo); margin-bottom: 2rem;">
        <div style="display: flex; gap: 1rem; align-items: flex-start;">
          <span style="font-size: 1.75rem;">🎯</span>
          <div>
            <strong style="color: #f8fafc; font-size: 1.05rem;">Sovereign User Intent Model</strong>
            <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.25rem; line-height: 1.5;">
              Preferences configured here represent your <strong>User Intent</strong>. They guide automated searches while remaining strictly separate from <strong>Verified Evidence</strong> (commit AST trees) and <strong>Self-Reported Claims</strong>. AI agents can read this profile to personalize workflows, but cannot permanently overwrite it without your explicit submission.
            </p>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <!-- Identity Summary Card -->
        <div class="card">
          <h2 style="font-size: 1.15rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>👤</span> Professional Identity
          </h2>
          <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.9rem;">
            <div>
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Display Name:</span>
              <strong style="color: #f8fafc;">${escapeHtml(candidate?.displayName || user?.displayName || 'Candidate')}</strong>
            </div>
            <div>
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Professional Headline:</span>
              <span style="color: #cbd5e1;">${escapeHtml(candidate?.headline || 'Not specified')}</span>
            </div>
            <div>
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Canonical Email:</span>
              <span style="color: #cbd5e1;">${escapeHtml(candidate?.canonicalEmail || user?.email || '')}</span>
            </div>
            <div>
              <span style="color: #94a3b8; font-size: 0.8rem; display: block;">Active Workspace:</span>
              <span class="badge badge-indigo">${escapeHtml(tenant?.tier || 'FREE')} TIER</span>
            </div>
          </div>
        </div>

        <!-- Verified Skills Summary Card -->
        <div class="card">
          <h2 style="font-size: 1.15rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>⚡</span> Verified Skills Evidence (${verifiedSkills.length})
          </h2>
          ${
            verifiedSkills.length > 0
              ? `
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
              ${verifiedSkills
                .slice(0, 12)
                .map(
                  (s) =>
                    `<span class="badge badge-verified" style="font-size: 0.75rem;">${escapeHtml(s)}</span>`
                )
                .join('')}
              ${verifiedSkills.length > 12 ? `<span class="badge" style="font-size: 0.75rem; background: rgba(255,255,255,0.06); color: #94a3b8;">+${verifiedSkills.length - 12} more</span>` : ''}
            </div>
            <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.75rem;">
              Backed by AST syntax trees and package manifests from your connected GitHub repositories.
            </p>
          `
              : `
            <p style="font-size: 0.85rem; color: #94a3b8;">
              No verified repository skills detected yet. Connect a GitHub repository in <a href="/sources" style="color: var(--accent-indigo);">Connected Sources</a>.
            </p>
          `
          }
        </div>
      </div>

      <!-- Main Preferences Edit Form -->
      <div class="card">
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>⚙️</span> Edit Job Search Preferences
        </h2>

        <form action="/profile" method="POST" style="display: flex; flex-direction: column; gap: 1.5rem;">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

          <!-- Target Roles -->
          <div>
            <label for="targetRoles" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
              Target Job Titles / Roles <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="targetRoles" name="targetRoles" value="${escapeHtml(targetRoles)}" placeholder="e.g. Staff Backend Engineer, Distributed Systems Architect, Fastify Engineer" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            <span style="font-size: 0.75rem; color: #94a3b8; display: block; margin-top: 0.25rem;">Separate multiple titles with commas.</span>
          </div>

          <!-- Locations & Remote Policy Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div>
              <label for="preferredLocations" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Preferred Locations / Timezones
              </label>
              <input type="text" id="preferredLocations" name="preferredLocations" value="${escapeHtml(preferredLocations)}" placeholder="e.g. Remote, San Francisco, India, UTC-8" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="remotePreference" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Remote Work Policy
              </label>
              <select id="remotePreference" name="remotePreference" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;">
                <option value="REMOTE_ONLY" ${remotePref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                <option value="REMOTE_FIRST" ${remotePref === 'REMOTE_FIRST' ? 'selected' : ''}>Remote First</option>
                <option value="HYBRID" ${remotePref === 'HYBRID' ? 'selected' : ''}>Hybrid</option>
                <option value="ON_SITE" ${remotePref === 'ON_SITE' ? 'selected' : ''}>On-Site</option>
                <option value="FLEXIBLE" ${remotePref === 'FLEXIBLE' ? 'selected' : ''}>Flexible / Any</option>
              </select>
            </div>
          </div>

          <!-- Compensation Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div>
              <label for="salaryFloor" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Minimum Base Salary (Floor)
              </label>
              <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(String(salaryFloor))}" placeholder="e.g. 180000" min="0" step="1000" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="salaryCurrency" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Currency Code
              </label>
              <select id="salaryCurrency" name="salaryCurrency" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;">
                <option value="USD" ${salaryCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="EUR" ${salaryCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                <option value="GBP" ${salaryCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                <option value="INR" ${salaryCurrency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                <option value="CAD" ${salaryCurrency === 'CAD' ? 'selected' : ''}>CAD ($)</option>
                <option value="AUD" ${salaryCurrency === 'AUD' ? 'selected' : ''}>AUD ($)</option>
              </select>
            </div>
          </div>

          <!-- Preferred Tech Stack & Industries -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div>
              <label for="preferredTechStack" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Preferred Technologies & Tools
              </label>
              <input type="text" id="preferredTechStack" name="preferredTechStack" value="${escapeHtml(preferredTech)}" placeholder="e.g. Node.js, Fastify, PostgreSQL, Docker, Redis" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="industries" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Target Industries
              </label>
              <input type="text" id="industries" name="industries" value="${escapeHtml(industries)}" placeholder="e.g. FinTech, Developer Tools, Cloud Infrastructure, AI" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>
          </div>

          <!-- Company Targeting -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
            <div>
              <label for="companiesToPrioritize" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Companies to Prioritize
              </label>
              <input type="text" id="companiesToPrioritize" name="companiesToPrioritize" value="${escapeHtml(companiesPrioritize)}" placeholder="e.g. Stripe, Datadog, Vercel, Figma" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="companiesToAvoid" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Companies to Avoid / Exclude
              </label>
              <input type="text" id="companiesToAvoid" name="companiesToAvoid" value="${escapeHtml(companiesAvoid)}" placeholder="e.g. Company A, Competitor B" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>
          </div>

          <!-- User-Provided Eligibility (Strictly Voluntary & User-Authored) -->
          <div style="background: rgba(15, 23, 42, 0.5); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
            <h3 style="font-size: 0.95rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>🔒</span> User-Provided Eligibility Information
            </h3>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1rem;">
              Career Hub strictly respects candidate privacy. Eligibility information is <strong>never inferred or assumed</strong> by AI models and is only utilized during pre-flight application validation if you choose to provide it.
            </p>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
              <div>
                <label for="workAuthorization" style="display: block; font-size: 0.85rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.3rem;">
                  Authorized Work Countries
                </label>
                <input type="text" id="workAuthorization" name="workAuthorization" value="${escapeHtml(workAuth)}" placeholder="e.g. United States, India, Canada" style="width: 100%; padding: 0.6rem 0.8rem; background: rgba(11, 15, 25, 0.8); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.85rem;" />
              </div>

              <div>
                <label for="availabilityDate" style="display: block; font-size: 0.85rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.3rem;">
                  Availability / Notice Period
                </label>
                <input type="text" id="availabilityDate" name="availabilityDate" value="${escapeHtml(availability)}" placeholder="e.g. Immediate, 2 Weeks, 1 Month" style="width: 100%; padding: 0.6rem 0.8rem; background: rgba(11, 15, 25, 0.8); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.85rem;" />
              </div>
            </div>

            <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap; margin-top: 1rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; color: #cbd5e1; cursor: pointer;">
                <input type="checkbox" name="visaSponsorshipRequired" value="true" ${visaRequired ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent-indigo);" />
                <span>Requires Visa Sponsorship</span>
              </label>

              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.85rem; color: #cbd5e1;">Relocation:</span>
                <select name="relocationPreference" style="padding: 0.4rem 0.6rem; background: rgba(11, 15, 25, 0.8); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.85rem;">
                  <option value="REMOTE_ONLY" ${relocationPref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                  <option value="WILLING_TO_RELOCATE" ${relocationPref === 'WILLING_TO_RELOCATE' ? 'selected' : ''}>Willing to Relocate</option>
                  <option value="NOT_WILLING" ${relocationPref === 'NOT_WILLING' ? 'selected' : ''}>Not Willing</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Form Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 0.5rem;">
            <button type="submit" class="btn btn-primary" style="padding: 0.75rem 1.75rem; font-size: 0.95rem; font-weight: 600;">
              <span>💾 Save Career Preferences</span>
            </button>
          </div>
        </form>

        <form action="/profile/clear-preferences" method="POST" style="margin-top: 1rem; display: inline-block;">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
          <button type="submit" class="btn btn-secondary btn-sm" onclick="return confirm('Are you sure you want to reset all job preferences to default?');" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
            <span>🗑️ Reset Preferences to Defaults</span>
          </button>
        </form>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Career Profile & Preferences | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'profile',
  });
}
