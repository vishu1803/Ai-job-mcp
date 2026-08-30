/**
 * @file Candidate Career Profile & Job Search Preferences View (P14-004C / ARCH-056).
 *
 * Implements the user-facing Canonical Career Profile and Intent Management page:
 * 1. Actionable Profile Completeness & Search Readiness status
 * 2. Professional Identity & Narrative (Name, Headline, Current Role, Location, Summary)
 * 3. Qualifications & Truth-Separated Evidence (Experience, Education, Projects, Skills)
 * 4. Persistent Job Search Preferences (Target roles, Locations, Work model, Salary floor, Tech stack, Companies)
 * 5. User-Provided Work Authorization & Eligibility (never inferred)
 * 6. Full CSRF protection and reset capability
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
 * @param {object} [params.profile] Canonical candidate career profile view
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
  profile = null,
  preferences = {},
  verifiedSkills = [],
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
}) {
  const jobPrefs = profile?.jobPreferences || preferences || {};
  const targetRoles = (jobPrefs.targetRoles || []).join(', ');
  const preferredLocations = (jobPrefs.preferredLocations || []).join(', ');
  const remotePref = jobPrefs.remotePreference || 'FLEXIBLE';
  const salaryFloor = jobPrefs.salaryFloor != null ? jobPrefs.salaryFloor : '';
  const salaryCurrency = jobPrefs.salaryCurrency || 'USD';
  const preferredTech = (jobPrefs.preferredTechStack || []).join(', ');
  const industries = (jobPrefs.industries || []).join(', ');
  const companiesPrioritize = (jobPrefs.companiesToPrioritize || []).join(', ');
  const companiesAvoid = (jobPrefs.companiesToAvoid || []).join(', ');
  const workAuth = (jobPrefs.workAuthorization || []).join(', ');
  const visaRequired = jobPrefs.visaSponsorshipRequired === true;
  const availability = jobPrefs.availabilityDate || '';
  const relocationPref = jobPrefs.relocationPreference || 'REMOTE_ONLY';

  // Completeness & Readiness Data
  const completeness = profile?.completeness || {
    score: 50,
    status: 'INCOMPLETE',
    isReadyForJobSearch: false,
    missingRequiredForSearch: [],
    missingOptional: [],
    actionableFeedback:
      'Complete your target roles and preferred locations to enable job matching.',
  };

  const currentRole =
    profile?.currentRole || candidate?.profileMetadata?.currentRole || candidate?.headline || '';
  const userLocation = profile?.location || candidate?.profileMetadata?.location || '';
  const summaryText = profile?.summary || candidate?.summary || '';
  const experienceList = profile?.recentExperience || [];
  const projectsList = profile?.highlightedProjects || [];
  const educationList = profile?.education || [];
  const topSkillsList = profile?.topSkills || [];
  const certsList = profile?.certifications || [];

  const content = `
    <div class="container" style="max-width: 1050px; padding: 2rem 1.5rem;">
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb" aria-label="Breadcrumb" style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.5rem;">
        <a href="/dashboard" style="color: #94a3b8; text-decoration: none;">Dashboard</a>
        <span>/</span>
        <span style="color: #f8fafc; font-weight: 500;">Career Profile</span>
      </nav>

      <!-- Page Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h1 style="font-size: 1.75rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
            Canonical Career Profile & Intent
          </h1>
          <p style="color: #94a3b8; font-size: 0.95rem; max-width: 750px; line-height: 1.5;">
            Your unified career identity across the Web UI, MCP tools, and AI connectors. Combines verified GitHub AST evidence, resume qualifications, and your sovereign job search intent.
          </p>
        </div>
        <div style="display: flex; gap: 0.75rem; align-items: center;">
          <a href="/resumes" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
            <span>📄 Manage Resumes</span>
          </a>
          <a href="/dashboard" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.4rem;">
            <span>← Dashboard</span>
          </a>
        </div>
      </div>

      <!-- Flash & Error Messages -->
      ${flashMessage ? `<div class="alert alert-success" style="margin-bottom: 1.5rem;">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom: 1.5rem;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Actionable Profile Completeness & Readiness Banner -->
      <div class="card" style="background: ${completeness.isReadyForJobSearch ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)' : 'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)'}; border-left: 4px solid ${completeness.isReadyForJobSearch ? '#10b981' : '#f59e0b'}; margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; gap: 1rem; align-items: flex-start;">
            <span style="font-size: 1.75rem;">${completeness.isReadyForJobSearch ? '✅' : '⚡'}</span>
            <div>
              <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <strong style="color: #f8fafc; font-size: 1.1rem;">
                  ${escapeHtml(completeness.status)}
                </strong>
                <span class="badge ${completeness.isReadyForJobSearch ? 'badge-verified' : 'badge-warning'}" style="font-size: 0.8rem;">
                  ${completeness.score}% Complete
                </span>
              </div>
              <p style="color: #cbd5e1; font-size: 0.875rem; margin-top: 0.35rem; line-height: 1.5;">
                ${escapeHtml(completeness.actionableFeedback)}
              </p>
            </div>
          </div>
          ${
            !completeness.isReadyForJobSearch && completeness.missingRequiredForSearch.length > 0
              ? `
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${completeness.missingRequiredForSearch
                .map(
                  (f) =>
                    `<a href="#${escapeHtml(f)}" class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; text-decoration: none; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 0.8rem;">+ Add ${escapeHtml(f)}</a>`
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      </div>

      <!-- Main Profile Form -->
      <form action="/profile" method="POST" style="display: flex; flex-direction: column; gap: 2rem;">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

        <!-- SECTION 1: ABOUT YOU (IDENTITY & NARRATIVE) -->
        <div class="card">
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <span>👤</span> Section 1: Professional Identity
          </h2>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
            <div>
              <label for="displayName" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Display Name <span style="color: #ef4444;">*</span>
              </label>
              <input type="text" id="displayName" name="displayName" value="${escapeHtml(candidate?.displayName || user?.displayName || '')}" required style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="headline" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Professional Headline
              </label>
              <input type="text" id="headline" name="headline" value="${escapeHtml(candidate?.headline || '')}" placeholder="e.g. Staff Backend Engineer | Distributed Systems & Node.js" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="currentRole" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Current Role / Title
              </label>
              <input type="text" id="currentRole" name="currentRole" value="${escapeHtml(currentRole)}" placeholder="e.g. Senior Software Engineer" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="location" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Current Location
              </label>
              <input type="text" id="location" name="location" value="${escapeHtml(userLocation)}" placeholder="e.g. San Francisco, CA or Bangalore, India" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>
          </div>

          <div style="margin-top: 1.25rem;">
            <label for="summary" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
              Executive Bio / Summary
            </label>
            <textarea id="summary" name="summary" rows="3" placeholder="Brief summary of your professional background and core strengths..." style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem; resize: vertical;">${escapeHtml(summaryText)}</textarea>
          </div>
        </div>

        <!-- SECTION 2: QUALIFICATIONS (EXPERIENCE, PROJECTS, SKILLS) -->
        <div class="card">
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <span>🎓</span> Section 2: Qualifications & Truth-Separated Evidence
          </h2>
          <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.25rem;">
            Seeded from your parsed resumes and corroborated against AST syntax trees from connected repositories.
          </p>

          <!-- Skills Summary -->
          <div style="margin-bottom: 1.5rem;">
            <h3 style="font-size: 1rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>⚡</span> Skills Profile (${topSkillsList.length + verifiedSkills.length})
            </h3>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              ${
                verifiedSkills.length > 0 || topSkillsList.length > 0
                  ? (topSkillsList.length > 0
                      ? topSkillsList
                      : verifiedSkills.map((s) => ({ name: s, provenanceStatus: 'VERIFIED' }))
                    )
                      .map((s) => {
                        const isVer = s.provenanceStatus === 'VERIFIED';
                        return `<span class="badge ${isVer ? 'badge-verified' : 'badge-claimed'}" style="font-size: 0.8rem; padding: 0.35rem 0.65rem;">
                          ${escapeHtml(s.name || s)} ${isVer ? '✓ [Verified]' : '[Claimed]'}
                        </span>`;
                      })
                      .join('')
                  : `<p style="font-size: 0.85rem; color: #94a3b8;">No skills registered. Upload a resume or connect a GitHub repository.</p>`
              }
            </div>
          </div>

          <!-- Highlighted Projects Grid -->
          <div style="margin-bottom: 1.5rem;">
            <h3 style="font-size: 1rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>📂</span> Highlighted Projects (${projectsList.length})
            </h3>
            ${
              projectsList.length > 0
                ? `
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                ${projectsList
                  .map(
                    (p) => `
                  <div style="background: rgba(15, 23, 42, 0.6); padding: 1rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                      <strong style="color: #f8fafc; font-size: 0.95rem;">${escapeHtml(p.name)}</strong>
                      <span class="badge ${p.provenanceStatus === 'VERIFIED' || p.verifiedSignalCount > 0 ? 'badge-verified' : 'badge-claimed'}" style="font-size: 0.7rem;">
                        ${p.provenanceStatus === 'VERIFIED' || p.verifiedSignalCount > 0 ? '✓ Verified' : 'Claimed'}
                      </span>
                    </div>
                    ${p.headline ? `<p style="color: #cbd5e1; font-size: 0.8rem; margin: 0.35rem 0;">${escapeHtml(p.headline)}</p>` : ''}
                    <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; display: flex; gap: 0.75rem;">
                      ${p.role ? `<span>Role: ${escapeHtml(p.role)}</span>` : ''}
                      ${p.verifiedSignalCount ? `<span>Signals: ${p.verifiedSignalCount}</span>` : ''}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : `<p style="font-size: 0.85rem; color: #94a3b8;">No projects registered. Upload a resume with a Projects section or connect GitHub.</p>`
            }
          </div>

          <!-- Work Experience Summary -->
          ${
            experienceList.length > 0
              ? `
            <div style="margin-bottom: 1.5rem;">
              <h3 style="font-size: 1rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                <span>💼</span> Work History (${experienceList.length})
              </h3>
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                ${experienceList
                  .map(
                    (exp) => `
                  <div style="background: rgba(15, 23, 42, 0.6); padding: 0.85rem 1rem; border-radius: 6px; border: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                    <div>
                      <strong style="color: #f8fafc; font-size: 0.9rem;">${escapeHtml(exp.title)}</strong>
                      <span style="color: #94a3b8; font-size: 0.85rem;"> at ${escapeHtml(exp.company)}</span>
                    </div>
                    <span style="color: #64748b; font-size: 0.8rem;">
                      ${escapeHtml(exp.startDate || '')} — ${exp.isCurrent ? 'Present' : escapeHtml(exp.endDate || '')}
                    </span>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }

          <!-- Education & Certifications -->
          ${
            educationList.length > 0 || certsList.length > 0
              ? `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
              ${
                educationList.length > 0
                  ? `
                <div>
                  <h4 style="font-size: 0.9rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">Education</h4>
                  ${educationList
                    .map(
                      (edu) => `
                    <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.35rem;">
                      <strong>${escapeHtml(edu.degree || 'Degree')}</strong>, ${escapeHtml(edu.institution)}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
                  : ''
              }
              ${
                certsList.length > 0
                  ? `
                <div>
                  <h4 style="font-size: 0.9rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">Certifications</h4>
                  <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
                    ${certsList.map((c) => `<span class="badge" style="font-size: 0.75rem; background: rgba(255,255,255,0.06); color: #cbd5e1;">${escapeHtml(c)}</span>`).join('')}
                  </div>
                </div>
              `
                  : ''
              }
            </div>
          `
              : ''
          }
        </div>

        <!-- SECTION 3: JOB SEARCH PREFERENCES (SOVEREIGN USER INTENT) -->
        <div class="card">
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.75rem;">
            <span>🎯</span> Section 3: Job Search Preferences (User Intent)
          </h2>
          <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.25rem;">
            Set your target positions, compensation requirements, and work preferences. AI agents read these preferences automatically for tailored matching.
          </p>

          <!-- Target Roles -->
          <div style="margin-bottom: 1.25rem;">
            <label for="targetRoles" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
              Target Job Titles / Roles <span style="color: #ef4444;">*</span>
            </label>
            <input type="text" id="targetRoles" name="targetRoles" value="${escapeHtml(targetRoles)}" placeholder="e.g. Staff Backend Engineer, Distributed Systems Architect, Node.js Specialist" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            <span style="font-size: 0.75rem; color: #94a3b8; display: block; margin-top: 0.25rem;">Separate multiple job titles with commas.</span>
          </div>

          <!-- Locations & Remote Policy -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
            <div>
              <label for="preferredLocations" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Preferred Locations / Timezones <span style="color: #ef4444;">*</span>
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

          <!-- Compensation & Currency -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
            <div>
              <label for="salaryFloor" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Minimum Base Salary (Floor)
              </label>
              <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(String(salaryFloor))}" placeholder="e.g. 180000" min="0" step="1000" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="salaryCurrency" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Salary Currency
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
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
            <div>
              <label for="preferredTechStack" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Preferred Technologies & Frameworks
              </label>
              <input type="text" id="preferredTechStack" name="preferredTechStack" value="${escapeHtml(preferredTech)}" placeholder="e.g. Node.js, Fastify, PostgreSQL, Docker, Redis" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>

            <div>
              <label for="industries" style="display: block; font-size: 0.875rem; font-weight: 500; color: #f8fafc; margin-bottom: 0.4rem;">
                Target Industries
              </label>
              <input type="text" id="industries" name="industries" value="${escapeHtml(industries)}" placeholder="e.g. Developer Tools, FinTech, Cloud Infrastructure, AI" style="width: 100%; padding: 0.65rem 0.85rem; background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border-subtle); border-radius: 6px; color: #f8fafc; font-size: 0.9rem;" />
            </div>
          </div>

          <!-- Company Targeting -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
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
        </div>

        <!-- SECTION 4: USER-PROVIDED ELIGIBILITY (VOLUNTARY & PRIVACY-PRESERVING) -->
        <div class="card" style="background: rgba(15, 23, 42, 0.5); border: 1px solid var(--border-subtle);">
          <h2 style="font-size: 1.15rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span>🔒</span> Section 4: Eligibility Information (Voluntary)
          </h2>
          <p style="font-size: 0.8rem; color: #94a3b8; margin-bottom: 1.25rem;">
            Strictly user-provided and <strong>never inferred by AI models</strong>. Used solely to match relevant visa sponsorship and notice requirements.
          </p>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
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

          <div style="display: flex; gap: 2rem; align-items: center; flex-wrap: wrap; margin-top: 1.25rem;">
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
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding-top: 0.5rem;">
          <button type="submit" class="btn btn-primary" style="padding: 0.75rem 2rem; font-size: 1rem; font-weight: 600;">
            <span>💾 Save Career Profile</span>
          </button>
        </div>
      </form>

      <form action="/profile/clear-preferences" method="POST" style="margin-top: 1.5rem; display: inline-block;">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <button type="submit" class="btn btn-secondary btn-sm" onclick="return confirm('Are you sure you want to reset all job preferences to default?');" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
          <span>🗑️ Reset Preferences to Defaults</span>
        </button>
      </form>
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
