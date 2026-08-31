/**
 * @file Candidate Career Profile & Job Search Preferences View (P14-004C / ARCH-056 / Redesign).
 *
 * Implements the user-facing Canonical Career Profile and Intent Management page:
 * 1. Actionable Profile Completeness & Readiness status with compact visual indicators
 * 2. Professional Identity & Narrative with guided suggestions (Name, Headline, Current Role, Location, Summary)
 * 3. Qualifications & Categorized Skills (Core, Backend, Frontend, DBs, Cloud, AI/ML, Tools)
 * 4. Human-readable Highlighted Projects with evidence badges and interactive filters
 * 5. Intelligent Job Search Preferences with searchable multi-select chips and AI suggestions
 * 6. Work Eligibility & Availability controls (never inferred)
 * 7. Sticky save action bar and real-time toast feedback
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
  _verifiedSkills = [],
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
}) {
  const jobPrefs = profile?.jobPreferences || preferences || {};
  const targetRolesList = jobPrefs.targetRoles || [];
  const preferredLocationsList = jobPrefs.preferredLocations || [];
  const remotePref = jobPrefs.remotePreference || 'FLEXIBLE';
  const salaryFloor = jobPrefs.salaryFloor != null ? jobPrefs.salaryFloor : '';
  const salaryCurrency = jobPrefs.salaryCurrency || 'USD';
  const preferredTechList = jobPrefs.preferredTechStack || [];
  const industriesList = jobPrefs.industries || [];
  const companiesPrioritizeList = jobPrefs.companiesToPrioritize || [];
  const companiesAvoidList = jobPrefs.companiesToAvoid || [];
  const workAuthList = jobPrefs.workAuthorization || [];
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

  const profileReadiness = profile?.profileReadiness || {
    score: 100,
    status: 'PROFILE POPULATED',
    isComplete: true,
    actionableFeedback:
      'Career profile contains comprehensive professional identity and verified qualifications.',
  };

  const currentRole =
    profile?.currentRole || candidate?.profileMetadata?.currentRole || candidate?.headline || '';
  const userLocation = profile?.location || candidate?.profileMetadata?.location || '';
  const summaryText = profile?.summary || candidate?.summary || '';
  const experienceList = profile?.recentExperience || [];
  const projectsList = profile?.highlightedProjects || [];
  const educationList = profile?.education || [];
  const topSkillsList = profile?.topSkills || [];
  const primarySkillsList =
    profile?.primarySkills && profile.primarySkills.length > 0
      ? profile.primarySkills
      : topSkillsList.filter((s) => s.tier !== 'SIGNAL');
  const technologySignalsList =
    profile?.technologySignals && profile.technologySignals.length > 0
      ? profile.technologySignals
      : topSkillsList.filter((s) => s.tier === 'SIGNAL');
  const certsList = profile?.certifications || [];

  // Calculate Overall Profile Completion Percentage (Weighted)
  let calculatedCompleteness = 0;
  if (candidate?.displayName) calculatedCompleteness += 15;
  if (candidate?.headline || currentRole) calculatedCompleteness += 15;
  if (primarySkillsList.length > 0) calculatedCompleteness += 20;
  if (projectsList.length > 0) calculatedCompleteness += 15;
  if (targetRolesList.length > 0) calculatedCompleteness += 15;
  if (preferredLocationsList.length > 0) calculatedCompleteness += 10;
  if (workAuthList.length > 0 || availability) calculatedCompleteness += 10;
  const overallPercentage = Math.min(
    100,
    Math.max(calculatedCompleteness, completeness.score || 70)
  );

  // Categorize Primary Skills
  const categorizedSkills = {
    'Core Languages': [],
    'Backend & APIs': [],
    Frontend: [],
    Databases: [],
    'Cloud & DevOps': [],
    'AI / ML': [],
    'Tools & Platforms': [],
    Other: [],
  };

  for (const s of primarySkillsList) {
    const cat = s.category || s.fineCategory || 'OTHER';
    if (cat === 'CORE_LANGUAGE' || cat === 'LANGUAGE') {
      categorizedSkills['Core Languages'].push(s);
    } else if (cat === 'FRAMEWORK' || cat === 'PROTOCOL') {
      if (
        s.name?.toLowerCase().includes('react') ||
        s.name?.toLowerCase().includes('vue') ||
        s.name?.toLowerCase().includes('svelte')
      ) {
        categorizedSkills['Frontend'].push(s);
      } else {
        categorizedSkills['Backend & APIs'].push(s);
      }
    } else if (cat === 'UI_COMPONENT' || cat === 'FRONTEND') {
      categorizedSkills['Frontend'].push(s);
    } else if (cat === 'DATABASE') {
      categorizedSkills['Databases'].push(s);
    } else if (cat === 'CLOUD' || cat === 'PLATFORM') {
      categorizedSkills['Cloud & DevOps'].push(s);
    } else if (cat === 'AI_ML') {
      categorizedSkills['AI / ML'].push(s);
    } else if (cat === 'TOOL') {
      categorizedSkills['Tools & Platforms'].push(s);
    } else {
      categorizedSkills['Other'].push(s);
    }
  }

  // Pre-seed Smart Role Recommendations based on skills
  const skillNamesLower = primarySkillsList.map((s) => (s.name || s).toLowerCase());
  const hasPython = skillNamesLower.some((s) => s.includes('python'));
  const hasNodeOrJs = skillNamesLower.some(
    (s) => s.includes('node') || s.includes('javascript') || s.includes('typescript')
  );
  const hasBackend = skillNamesLower.some(
    (s) =>
      s.includes('fastapi') ||
      s.includes('express') ||
      s.includes('fastify') ||
      s.includes('postgres')
  );

  const recommendedRoles = [];
  if (hasBackend || hasPython || hasNodeOrJs) recommendedRoles.push('Backend Engineer');
  if (hasNodeOrJs && (hasBackend || skillNamesLower.some((s) => s.includes('react'))))
    recommendedRoles.push('Full Stack Engineer');
  recommendedRoles.push('Software Engineer');
  if (hasPython) recommendedRoles.push('Python Developer');
  if (skillNamesLower.some((s) => s.includes('ai') || s.includes('gemini') || s.includes('openai')))
    recommendedRoles.push('AI Engineer');

  const content = `
    <style>
      /* Career Profile SaaS Design System */
      .profile-page-container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.5rem 1.25rem 5rem 1.25rem;
      }

      .profile-header-card {
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4);
      }

      .completion-bar-track {
        background: rgba(255, 255, 255, 0.08);
        border-radius: 9999px;
        height: 7px;
        width: 100%;
        overflow: hidden;
        margin: 0.75rem 0;
      }

      .completion-bar-fill {
        background: linear-gradient(90deg, #10b981 0%, #6366f1 100%);
        height: 100%;
        border-radius: 9999px;
        transition: width 0.4s ease;
      }

      .section-status-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.85rem;
      }

      .section-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.3rem 0.65rem;
        border-radius: 9999px;
        font-size: 0.78rem;
        font-weight: 500;
        text-decoration: none;
        transition: all 0.15s ease;
      }

      .status-pill-complete {
        background: rgba(16, 185, 129, 0.12);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .status-pill-attention {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.25);
      }

      .status-pill-neutral {
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .form-section-card {
        background: rgba(17, 24, 39, 0.65);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        transition: border-color 0.2s ease;
      }

      .form-section-card:hover {
        border-color: rgba(255, 255, 255, 0.12);
      }

      .section-title {
        font-size: 1.15rem;
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
      }

      .section-subtitle {
        font-size: 0.85rem;
        color: #94a3b8;
        margin-bottom: 1.25rem;
      }

      .form-group {
        margin-bottom: 1.1rem;
      }

      .form-label {
        display: block;
        font-size: 0.85rem;
        font-weight: 500;
        color: #e2e8f0;
        margin-bottom: 0.35rem;
      }

      .form-helper {
        font-size: 0.76rem;
        color: #94a3b8;
        margin-top: 0.3rem;
        line-height: 1.4;
      }

      .form-input, .form-textarea, .form-select {
        width: 100%;
        padding: 0.65rem 0.85rem;
        background: rgba(11, 15, 25, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        color: #f8fafc;
        font-size: 0.875rem;
        font-family: inherit;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .form-input:focus, .form-textarea:focus, .form-select:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
        background: rgba(11, 15, 25, 0.95);
      }

      /* Searchable Chips Multi-Select Container */
      .chips-input-box {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.6rem;
        background: rgba(11, 15, 25, 0.75);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        min-height: 42px;
        cursor: text;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .chips-input-box:focus-within {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
        background: rgba(11, 15, 25, 0.95);
      }

      .chip-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: rgba(99, 102, 241, 0.15);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 6px;
        padding: 0.2rem 0.5rem;
        font-size: 0.8rem;
        font-weight: 500;
        user-select: none;
      }

      .chip-tag.recommendation-chip {
        background: rgba(16, 185, 129, 0.15);
        color: #a7f3d0;
        border-color: rgba(16, 185, 129, 0.3);
      }

      .chip-remove-btn {
        background: none;
        border: none;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
        font-size: 0.9rem;
        padding: 0;
        line-height: 1;
      }

      .chip-remove-btn:hover {
        opacity: 1;
      }

      .chips-search-input {
        flex: 1;
        min-width: 140px;
        background: transparent;
        border: none;
        outline: none;
        color: #f8fafc;
        font-size: 0.85rem;
        padding: 0.2rem 0.3rem;
      }

      .suggestion-pills-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.5rem;
      }

      .suggestion-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        border-radius: 6px;
        padding: 0.22rem 0.55rem;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }

      .suggestion-pill:hover {
        background: rgba(99, 102, 241, 0.18);
        border-color: rgba(99, 102, 241, 0.35);
        color: #e0e7ff;
      }

      .suggestion-pill.ai-recommended {
        background: rgba(99, 102, 241, 0.1);
        border-color: rgba(99, 102, 241, 0.25);
        color: #a5b4fc;
      }

      .suggestion-pill.ai-recommended:hover {
        background: rgba(99, 102, 241, 0.25);
        border-color: rgba(99, 102, 241, 0.45);
      }

      .suggestion-pill.selected {
        background: rgba(99, 102, 241, 0.25);
        border-color: #6366f1;
        color: #ffffff;
      }

      /* Segmented Controls */
      .segmented-control {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        background: rgba(11, 15, 25, 0.6);
        padding: 0.3rem;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .segmented-btn {
        flex: 1;
        min-width: 100px;
        text-align: center;
        padding: 0.5rem 0.75rem;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 500;
        color: #94a3b8;
        cursor: pointer;
        border: 1px solid transparent;
        background: transparent;
        transition: all 0.15s ease;
      }

      .segmented-btn:hover {
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.05);
      }

      .segmented-btn.active {
        background: rgba(99, 102, 241, 0.2);
        color: #e0e7ff;
        border-color: rgba(99, 102, 241, 0.4);
      }

      /* Skills Category Group */
      .skill-category-block {
        margin-bottom: 1.1rem;
      }

      .skill-category-title {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #94a3b8;
        margin-bottom: 0.45rem;
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }

      .skill-tag-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
      }

      .skill-tag-badge.badge-verified {
        background: rgba(16, 185, 129, 0.1);
        border-color: rgba(16, 185, 129, 0.25);
        color: #a7f3d0;
      }

      .skill-tag-badge.badge-claimed {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.2);
        color: #cbd5e1;
      }

      /* Project Cards Grid */
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1rem;
      }

      .project-card {
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 1.15rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: all 0.2s ease;
      }

      .project-card:hover {
        border-color: rgba(99, 102, 241, 0.3);
        transform: translateY(-1px);
        box-shadow: 0 6px 20px -4px rgba(0, 0, 0, 0.5);
      }

      .project-evidence-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.72rem;
        font-weight: 500;
        color: #34d399;
        background: rgba(16, 185, 129, 0.1);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        border: 1px solid rgba(16, 185, 129, 0.2);
      }

      .project-claimed-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.72rem;
        font-weight: 500;
        color: #94a3b8;
        background: rgba(255, 255, 255, 0.05);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      /* Sticky Bottom Save Action Bar */
      .sticky-save-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(16px);
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        padding: 0.85rem 1.5rem;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 999;
        box-shadow: 0 -4px 25px rgba(0, 0, 0, 0.6);
        transition: transform 0.25s ease, opacity 0.25s ease;
      }

      .sticky-save-content {
        width: 100%;
        max-width: 1100px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      }

      /* Toast Notification */
      .toast-notification {
        position: fixed;
        top: 1.5rem;
        right: 1.5rem;
        background: rgba(16, 185, 129, 0.95);
        color: #ffffff;
        padding: 0.75rem 1.25rem;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 500;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        animation: slideInToast 0.3s ease forwards;
      }

      @keyframes slideInToast {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    </style>

    <div class="profile-page-container">
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb" aria-label="Breadcrumb" style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.82rem; color: #94a3b8; margin-bottom: 1.25rem;">
        <a href="/dashboard" style="color: #94a3b8; text-decoration: none;">Dashboard</a>
        <span>/</span>
        <span style="color: #f8fafc; font-weight: 500;">Career Profile</span>
      </nav>

      <!-- Toast Notification for Saved Success -->
      ${
        flashMessage
          ? `
        <div id="saveToast" class="toast-notification">
          <span>✓</span>
          <span>${escapeHtml(flashMessage)}</span>
        </div>
        <script>
          setTimeout(() => {
            const toast = document.getElementById('saveToast');
            if (toast) {
              toast.style.transition = 'opacity 0.4s ease';
              toast.style.opacity = '0';
              setTimeout(() => toast.remove(), 400);
            }
          }, 3500);
        </script>
      `
          : ''
      }

      <!-- Error Alert Message -->
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom: 1.25rem;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Page Header & Title -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
        <div>
          <h1 style="font-size: 1.65rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.35rem; letter-spacing: -0.01em;">
            Career Profile
          </h1>
          <p style="color: #94a3b8; font-size: 0.9rem; max-width: 780px; line-height: 1.5;">
            Build your professional profile once. AI agents use this structured profile to personalize job discovery, recommendations, and career assistance.
          </p>
        </div>
        <div style="display: flex; gap: 0.6rem; align-items: center;">
          <a href="/resumes" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; padding: 0.45rem 0.8rem;">
            <span>📄 Manage Resumes</span>
          </a>
          <a href="/skills" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; padding: 0.45rem 0.8rem;">
            <span>⚡ Skills Graph</span>
          </a>
        </div>
      </div>

      <!-- Compact Profile Completeness & Readiness Card -->
      <div class="profile-header-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.1rem; font-weight: 600; color: #f8fafc;">
              Profile completeness: ${overallPercentage}%
            </span>
            <span class="badge badge-verified" style="font-size: 0.72rem; padding: 0.15rem 0.5rem;">
              Career Profile: ${profileReadiness.score}% Populated
            </span>
          </div>
          <span style="font-size: 0.8rem; color: #94a3b8;">
            ${escapeHtml(completeness.actionableFeedback || profileReadiness.actionableFeedback)}
          </span>
        </div>

        <div class="completion-bar-track">
          <div class="completion-bar-fill" style="width: ${overallPercentage}%;"></div>
        </div>

        <div class="section-status-grid">
          <a href="#section-identity" class="section-status-pill ${candidate?.displayName ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${candidate?.displayName ? '✓' : '!'}</span> Professional Identity
          </a>
          <a href="#section-qualifications" class="section-status-pill ${primarySkillsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${primarySkillsList.length > 0 ? '✓' : '!'}</span> Skills & Evidence
          </a>
          <a href="#section-preferences" class="section-status-pill ${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? '✓' : '!'}</span> Job Preferences
          </a>
          <a href="#section-eligibility" class="section-status-pill ${workAuthList.length > 0 || availability ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${workAuthList.length > 0 || availability ? '✓' : '○'}</span> Eligibility
          </a>
        </div>
      </div>

      <!-- Quick AI Profile Suggestions Bar (1-Click Fill) -->
      ${
        targetRolesList.length === 0 || preferredLocationsList.length === 0
          ? `
        <div class="card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.7) 100%); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.35rem;">✨</span>
            <div>
              <strong style="color: #f8fafc; font-size: 0.88rem; display: block;">AI suggestions based on your verified skills</strong>
              <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.3rem;">
                ${recommendedRoles
                  .slice(0, 3)
                  .map(
                    (r) =>
                      `<span class="suggestion-pill ai-recommended" onclick="addSuggestedRole('${escapeHtml(r)}')">+ ${escapeHtml(r)}</span>`
                  )
                  .join('')}
                <span class="suggestion-pill ai-recommended" onclick="addSuggestedLocation('Remote')">+ Remote</span>
                <span class="suggestion-pill ai-recommended" onclick="addSuggestedLocation('India')">+ India</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="applyAllAiSuggestions()" style="font-size: 0.78rem; padding: 0.35rem 0.75rem; border-color: rgba(99, 102, 241, 0.4); color: #c7d2fe;">
            Apply suggestions
          </button>
        </div>
      `
          : ''
      }

      <!-- Main Profile Form -->
      <form id="careerProfileForm" action="/profile" method="POST" style="display: flex; flex-direction: column; gap: 1.25rem;">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

        <!-- ================================================================= -->
        <!-- SECTION 1: PROFESSIONAL IDENTITY                                  -->
        <!-- ================================================================= -->
        <div id="section-identity" class="form-section-card">
          <div class="section-title">
            <span>👤</span> Professional Identity
          </div>
          <div class="section-subtitle">
            Your public professional introduction and current standing.
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
            <div class="form-group">
              <label class="form-label" for="displayName">
                Display Name <span style="color: #ef4444;">*</span>
              </label>
              <input type="text" id="displayName" name="displayName" value="${escapeHtml(candidate?.displayName || user?.displayName || '')}" required class="form-input" placeholder="e.g. Alex Mercer" />
              <div class="form-helper">Your preferred full name for applications and profiles.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="headline">
                Professional Headline
              </label>
              <input type="text" id="headline" name="headline" value="${escapeHtml(candidate?.headline || '')}" placeholder="e.g. Backend Engineer specializing in distributed systems" class="form-input" />
              <div class="form-helper">A concise description of what you do.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="currentRole">
                Current Role
              </label>
              <input type="text" id="currentRole" name="currentRole" value="${escapeHtml(currentRole)}" placeholder="e.g. Senior Software Engineer" class="form-input" />
              <div class="form-helper">Your most recent or current professional position.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="location">
                Current Location
              </label>
              <input type="text" id="location" name="location" value="${escapeHtml(userLocation)}" placeholder="e.g. Bangalore, India or Remote" class="form-input" />
              <div class="form-helper">City, country, or Remote.</div>
              <div class="suggestion-pills-row">
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Remote'; markFormDirty();">Remote</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Bangalore, India'; markFormDirty();">Bangalore, India</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'New Delhi, India'; markFormDirty();">New Delhi, India</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Mumbai, India'; markFormDirty();">Mumbai, India</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Hyderabad, India'; markFormDirty();">Hyderabad, India</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'San Francisco, CA'; markFormDirty();">San Francisco, CA</span>
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top: 0.5rem; margin-bottom: 0;">
            <label class="form-label" for="summary">
              Executive Summary
            </label>
            <textarea id="summary" name="summary" rows="3" placeholder="Write a short professional introduction. This will help AI agents understand your experience and career background..." class="form-textarea" style="resize: vertical;">${escapeHtml(summaryText)}</textarea>
            <div class="form-helper">High-level narrative used when tailoring resumes and cover letters.</div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 2: QUALIFICATIONS & EVIDENCE                              -->
        <!-- ================================================================= -->
        <div id="section-qualifications" class="form-section-card">
          <div class="section-title">
            <span>🎓</span> Qualifications & Evidence
          </div>
          <div class="section-subtitle">
            Skills extracted from your connected sources and profile. Evidence strength is shown based on available signals.
          </div>

          <!-- Professional Skills Categorized Display -->
          <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
              <h3 style="font-size: 0.95rem; font-weight: 600; color: #f8fafc; margin: 0;">
                Primary Career Skills (${primarySkillsList.length})
              </h3>
              <span style="font-size: 0.75rem; color: #94a3b8;" title="Evidence strength reflects signals found across connected repositories, resumes, and other sources. It does not represent a formal certification.">
                ℹ️ Hover over skills for evidence provenance
              </span>
            </div>

            ${
              primarySkillsList.length > 0
                ? `
              <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                ${Object.entries(categorizedSkills)
                  .filter(([, skills]) => skills.length > 0)
                  .map(
                    ([catName, skills]) => `
                  <div class="skill-category-block">
                    <div class="skill-category-title">${escapeHtml(catName)} (${skills.length})</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
                      ${skills
                        .map((s) => {
                          const isVer =
                            s.truthStatus === 'VERIFIED' || s.provenanceStatus === 'VERIFIED';
                          const isBoth = s.source === 'BOTH' || (s.githubEvidence && s.resumeClaim);
                          const label = isBoth
                            ? '✓ Corroborated'
                            : isVer
                              ? '✓ Verified'
                              : '○ Self-reported';
                          const badgeClass = isBoth || isVer ? 'badge-verified' : 'badge-claimed';

                          return `
                            <span class="skill-tag-badge ${badgeClass}" title="Source: ${escapeHtml(s.source || 'UNKNOWN')} | Category: ${escapeHtml(s.fineCategory || s.category || catName)}">
                              <strong>${escapeHtml(s.name || s)}</strong>
                              <span style="font-size: 0.68rem; opacity: 0.9;">${label}</span>
                            </span>
                          `;
                        })
                        .join('')}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
                : `<p style="font-size: 0.85rem; color: #94a3b8;">No skills registered. Upload a resume or connect a GitHub repository.</p>`
            }
          </div>

          <!-- Technology & Implementation Signals (Collapsible) -->
          ${
            technologySignalsList.length > 0
              ? `
            <div style="background: rgba(11, 15, 25, 0.45); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.5rem;">
              <details>
                <summary style="font-size: 0.85rem; font-weight: 500; color: #94a3b8; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                  <span>🔍 Technology & Implementation Signals (${technologySignalsList.length})</span>
                  <span style="font-size: 0.72rem; color: #64748b;">Click to view underlying packages & dependencies</span>
                </summary>
                <p style="font-size: 0.75rem; color: #64748b; margin: 0.4rem 0 0.6rem 0;">
                  Utility packages, middleware, UI helpers, and build plugins detected via AST package manifests and entrypoint imports.
                </p>
                <div style="display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem;">
                  ${technologySignalsList
                    .map(
                      (s) => `
                    <span class="skill-tag-badge" style="font-size: 0.72rem; background: rgba(255, 255, 255, 0.03); color: #94a3b8;" title="Category: ${escapeHtml(s.fineCategory || s.category || 'LIBRARY')} | Evidence: ${s.evidenceCount || 1} signal(s)">
                      ${escapeHtml(s.name || s)} <span style="color: #64748b; font-size: 0.65rem;">(${s.evidenceCount || 1})</span>
                    </span>
                  `
                    )
                    .join('')}
                </div>
              </details>
            </div>
          `
              : ''
          }

          <!-- Highlighted Projects with Filter Tabs -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.85rem;">
              <h3 style="font-size: 0.95rem; font-weight: 600; color: #f8fafc; margin: 0;">
                Highlighted Projects (${projectsList.length})
              </h3>
              <div style="display: flex; gap: 0.3rem;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="filterProjects('all', this)" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.4); color: #e0e7ff;">All</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="filterProjects('verified', this)" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">Verified</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="filterProjects('github', this)" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">GitHub</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="filterProjects('resume', this)" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">Resume</button>
              </div>
            </div>

            ${
              projectsList.length > 0
                ? `
              <div class="projects-grid" id="projectsGrid">
                ${projectsList
                  .map((p) => {
                    const isCorroborated = p.provenanceStatus === 'CORROBORATED';
                    const isVerified = p.provenanceStatus === 'VERIFIED';
                    const badgeText = isCorroborated
                      ? '✓ Corroborated'
                      : isVerified
                        ? '✓ Verified GitHub'
                        : '○ Resume Claim';
                    const badgeClass =
                      isCorroborated || isVerified
                        ? 'project-evidence-badge'
                        : 'project-claimed-badge';
                    const projectType = isCorroborated
                      ? 'verified github'
                      : isVerified
                        ? 'verified github'
                        : 'resume';

                    return `
                      <div class="project-card" data-project-type="${projectType}">
                        <div>
                          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem;">
                            <strong style="color: #f8fafc; font-size: 0.92rem; line-height: 1.3;">${escapeHtml(p.name)}</strong>
                            <span class="${badgeClass}">${badgeText}</span>
                          </div>
                          ${
                            p.headline
                              ? `<p style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 0.6rem; line-height: 1.4;">${escapeHtml(p.headline)}</p>`
                              : `<p style="color: #64748b; font-size: 0.78rem; font-style: italic; margin-bottom: 0.6rem;">Technical portfolio project.</p>`
                          }
                          ${
                            Array.isArray(p.technologies) && p.technologies.length > 0
                              ? `
                            <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.6rem;">
                              ${p.technologies
                                .slice(0, 4)
                                .map(
                                  (t) =>
                                    `<span class="badge" style="font-size: 0.68rem; background: rgba(255,255,255,0.05); color: #cbd5e1; padding: 0.15rem 0.4rem;">${escapeHtml(t)}</span>`
                                )
                                .join('')}
                              ${p.technologies.length > 4 ? `<span style="font-size: 0.65rem; color: #64748b; align-self: center;">+${p.technologies.length - 4} more</span>` : ''}
                            </div>
                          `
                              : ''
                          }
                        </div>

                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.75rem;">
                          ${p.id ? `<a href="/projects/${escapeHtml(p.id)}" style="color: #6366f1; font-weight: 500;">View project →</a>` : '<span style="color: #64748b;">Fastify Gateway</span>'}
                          ${
                            p.verifiedSignalCount
                              ? `
                            <details style="display: inline-block;">
                              <summary style="color: #64748b; cursor: pointer; font-size: 0.7rem;">Evidence details ▾</summary>
                              <div style="position: absolute; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 0.5rem; font-size: 0.7rem; color: #cbd5e1; z-index: 10; margin-top: 0.2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                                <div>Signals: ${p.verifiedSignalCount} AST matches</div>
                                ${p.role ? `<div>Role: ${escapeHtml(p.role)}</div>` : ''}
                              </div>
                            </details>
                          `
                              : ''
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
                : `<p style="font-size: 0.85rem; color: #94a3b8;">No projects registered. Upload a resume with a Projects section or connect GitHub.</p>`
            }
          </div>

          <!-- Work History & Education Quick Overview -->
          ${
            experienceList.length > 0 || educationList.length > 0
              ? `
            <div style="margin-top: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
              ${
                experienceList.length > 0
                  ? `
                <div>
                  <h4 style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.5rem;">💼 Work Experience</h4>
                  <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                    ${experienceList
                      .slice(0, 3)
                      .map(
                        (exp) => `
                      <div style="background: rgba(11, 15, 25, 0.5); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.78rem;">
                        <strong style="color: #f8fafc;">${escapeHtml(exp.title)}</strong>
                        <span style="color: #94a3b8;"> at ${escapeHtml(exp.company)}</span>
                        <div style="color: #64748b; font-size: 0.7rem; margin-top: 0.15rem;">
                          ${escapeHtml(exp.startDate || '')} — ${exp.isCurrent ? 'Present' : escapeHtml(exp.endDate || '')}
                        </div>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                </div>
              `
                  : ''
              }
              ${
                educationList.length > 0
                  ? `
                <div>
                  <h4 style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.5rem;">🎓 Education</h4>
                  <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                    ${educationList
                      .map(
                        (edu) => `
                      <div style="background: rgba(11, 15, 25, 0.5); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.78rem;">
                        <strong style="color: #f8fafc;">${escapeHtml(edu.degree || 'Degree')}</strong>
                        <div style="color: #94a3b8; font-size: 0.72rem; margin-top: 0.15rem;">${escapeHtml(edu.institution)}</div>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                  ${
                    certsList.length > 0
                      ? `
                    <div style="margin-top: 0.75rem;">
                      <h5 style="font-size: 0.8rem; font-weight: 600; color: #cbd5e1; margin-bottom: 0.35rem;">📜 Certifications</h5>
                      <div style="display: flex; flex-wrap: wrap; gap: 0.3rem;">
                        ${certsList.map((c) => `<span class="badge" style="font-size: 0.7rem; background: rgba(255,255,255,0.05); color: #cbd5e1;">${escapeHtml(c)}</span>`).join('')}
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
          `
              : ''
          }
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 3: JOB SEARCH PREFERENCES (SOVEREIGN USER INTENT)          -->
        <!-- ================================================================= -->
        <div id="section-preferences" class="form-section-card">
          <div class="section-title">
            <span>🎯</span> Job Search Preferences
          </div>
          <div class="section-subtitle">
            Configure your target roles, locations, and expectations. AI agents read these preferences automatically for tailored matching.
          </div>

          <!-- Target Roles (Searchable Multi-Select Chips) -->
          <div class="form-group">
            <label class="form-label" for="targetRolesInput">
              Target Roles <span style="color: #ef4444;">*</span>
            </label>
            <div class="chips-input-box" id="targetRolesContainer" onclick="document.getElementById('targetRolesInput').focus()">
              <input type="hidden" id="targetRolesHidden" name="targetRoles" value="${escapeHtml(targetRolesList.join(','))}" />
              <input type="text" id="targetRolesInput" class="chips-search-input" placeholder="Type a role and press Enter..." />
            </div>
            <div class="form-helper">Select or type the roles you want to be matched with.</div>

            <!-- Recommended Roles Suggestions -->
            <div style="margin-top: 0.5rem;">
              <span style="font-size: 0.72rem; color: #a5b4fc; font-weight: 500;">✨ Recommended for you:</span>
              <div class="suggestion-pills-row" id="recommendedRolesRow">
                ${recommendedRoles.map((r) => `<span class="suggestion-pill ai-recommended" onclick="addSuggestedRole('${escapeHtml(r)}')">+ ${escapeHtml(r)}</span>`).join('')}
                <span class="suggestion-pill" onclick="addSuggestedRole('Frontend Engineer')">+ Frontend Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('Platform Engineer')">+ Platform Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('API Engineer')">+ API Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('DevOps Engineer')">+ DevOps Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('Cloud Engineer')">+ Cloud Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('Solutions Engineer')">+ Solutions Engineer</span>
              </div>
            </div>
          </div>

          <!-- Preferred Locations (Searchable Multi-Select Chips) -->
          <div class="form-group">
            <label class="form-label" for="preferredLocationsInput">
              Preferred Work Locations <span style="color: #ef4444;">*</span>
            </label>
            <div class="chips-input-box" id="preferredLocationsContainer" onclick="document.getElementById('preferredLocationsInput').focus()">
              <input type="hidden" id="preferredLocationsHidden" name="preferredLocations" value="${escapeHtml(preferredLocationsList.join(','))}" />
              <input type="text" id="preferredLocationsInput" class="chips-search-input" placeholder="Type a location or country and press Enter..." />
            </div>
            <div class="form-helper">Remote, country, or specific cities.</div>

            <!-- Location Suggestions -->
            <div class="suggestion-pills-row">
              <span class="suggestion-pill" onclick="addSuggestedLocation('Remote')">+ Remote</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('India')">+ India</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Bangalore, India')">+ Bangalore, India</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Hyderabad, India')">+ Hyderabad, India</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Pune, India')">+ Pune, India</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Mumbai, India')">+ Mumbai, India</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Delhi NCR')">+ Delhi NCR</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('United States')">+ United States</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Europe')">+ Europe</span>
              <span class="suggestion-pill" onclick="addSuggestedLocation('Singapore')">+ Singapore</span>
            </div>
          </div>

          <!-- Remote Work Policy (Segmented Control) -->
          <div class="form-group">
            <label class="form-label">
              Remote Work Policy
            </label>
            <input type="hidden" id="remotePreferenceHidden" name="remotePreference" value="${escapeHtml(remotePref)}" />
            <div class="segmented-control">
              <button type="button" class="segmented-btn ${remotePref === 'REMOTE_ONLY' ? 'active' : ''}" onclick="setRemotePref('REMOTE_ONLY', this)">Remote Only</button>
              <button type="button" class="segmented-btn ${remotePref === 'REMOTE_FIRST' ? 'active' : ''}" onclick="setRemotePref('REMOTE_FIRST', this)">Remote First</button>
              <button type="button" class="segmented-btn ${remotePref === 'HYBRID' ? 'active' : ''}" onclick="setRemotePref('HYBRID', this)">Hybrid</button>
              <button type="button" class="segmented-btn ${remotePref === 'ON_SITE' ? 'active' : ''}" onclick="setRemotePref('ON_SITE', this)">On-Site</button>
              <button type="button" class="segmented-btn ${remotePref === 'FLEXIBLE' ? 'active' : ''}" onclick="setRemotePref('FLEXIBLE', this)">Flexible</button>
            </div>
          </div>

          <!-- Compensation / Expected Salary -->
          <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1rem;" class="form-group">
            <div>
              <label class="form-label" for="salaryFloor">
                Minimum Expected Salary
              </label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(String(salaryFloor))}" placeholder="Leave blank if not specified" min="0" step="1000" class="form-input" />
              </div>
              <div class="form-helper">Annual compensation floor. Leave blank if you prefer not to specify.</div>
            </div>

            <div>
              <label class="form-label" for="salaryCurrency">
                Currency
              </label>
              <select id="salaryCurrency" name="salaryCurrency" class="form-select">
                <option value="USD" ${salaryCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="INR" ${salaryCurrency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                <option value="EUR" ${salaryCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                <option value="GBP" ${salaryCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                <option value="CAD" ${salaryCurrency === 'CAD' ? 'selected' : ''}>CAD ($)</option>
                <option value="AUD" ${salaryCurrency === 'AUD' ? 'selected' : ''}>AUD ($)</option>
              </select>
            </div>
          </div>

          <!-- Preferred Technologies (Searchable Multi-Select Chips) -->
          <div class="form-group">
            <label class="form-label" for="preferredTechStackInput">
              Preferred Technologies & Frameworks
            </label>
            <div class="chips-input-box" id="preferredTechStackContainer" onclick="document.getElementById('preferredTechStackInput').focus()">
              <input type="hidden" id="preferredTechStackHidden" name="preferredTechStack" value="${escapeHtml(preferredTechList.join(','))}" />
              <input type="text" id="preferredTechStackInput" class="chips-search-input" placeholder="Type a technology and press Enter..." />
            </div>
            <div class="form-helper">Technologies you enjoy working with most.</div>

            <!-- Tech Suggestions -->
            <div class="suggestion-pills-row">
              <span class="suggestion-pill" onclick="addSuggestedTech('Python')">+ Python</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('FastAPI')">+ FastAPI</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('Node.js')">+ Node.js</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('TypeScript')">+ TypeScript</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('PostgreSQL')">+ PostgreSQL</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('Docker')">+ Docker</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('React')">+ React</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('AWS')">+ AWS</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('Kubernetes')">+ Kubernetes</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('Redis')">+ Redis</span>
              <span class="suggestion-pill" onclick="addSuggestedTech('GraphQL')">+ GraphQL</span>
            </div>
          </div>

          <!-- Target Industries (Selectable Chips) -->
          <div class="form-group">
            <label class="form-label">
              Target Industries
            </label>
            <input type="hidden" id="industriesHidden" name="industries" value="${escapeHtml(industriesList.join(','))}" />
            <div class="suggestion-pills-row" id="industriesPillsRow" style="margin-top: 0.2rem;">
              ${[
                'AI & Machine Learning',
                'Developer Tools',
                'FinTech',
                'SaaS',
                'Cloud Infrastructure',
                'Cybersecurity',
                'Healthcare',
                'E-commerce',
                'Education Technology',
              ]
                .map((ind) => {
                  const isSel = industriesList.includes(ind);
                  return `<span class="suggestion-pill ${isSel ? 'selected' : ''}" onclick="toggleIndustry('${escapeHtml(ind)}', this)">${isSel ? '✓ ' : '+ '}${escapeHtml(ind)}</span>`;
                })
                .join('')}
            </div>
            <div class="form-helper">Click to select industries that interest you.</div>
          </div>

          <!-- Companies to Prioritize & Avoid (Optional) -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;" class="form-group">
            <div>
              <label class="form-label" for="companiesToPrioritize">
                Preferred Companies <span style="font-size: 0.72rem; color: #94a3b8; font-weight: normal;">(Optional)</span>
              </label>
              <input type="text" id="companiesToPrioritize" name="companiesToPrioritize" value="${escapeHtml(companiesPrioritizeList.join(', '))}" placeholder="e.g. Stripe, Datadog, Vercel, Figma" class="form-input" />
              <div class="form-helper">Separate multiple company names with commas.</div>
            </div>

            <div>
              <label class="form-label" for="companiesToAvoid">
                Companies to Avoid <span style="font-size: 0.72rem; color: #94a3b8; font-weight: normal;">(Optional)</span>
              </label>
              <input type="text" id="companiesToAvoid" name="companiesToAvoid" value="${escapeHtml(companiesAvoidList.join(', '))}" placeholder="e.g. Competitor A, Unfavorable Co" class="form-input" />
              <div class="form-helper">Companies you do not want to be matched with.</div>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 4: WORK ELIGIBILITY & AVAILABILITY                         -->
        <!-- ================================================================= -->
        <div id="section-eligibility" class="form-section-card">
          <div class="section-title">
            <span>🔒</span> Work Eligibility & Availability
          </div>
          <div class="section-subtitle">
            Used only to improve job matching. This information is never inferred automatically.
          </div>

          <!-- Work Authorization (Searchable Multi-Select Chips) -->
          <div class="form-group">
            <label class="form-label" for="workAuthInput">
              Where are you currently authorized to work?
            </label>
            <div class="chips-input-box" id="workAuthContainer" onclick="document.getElementById('workAuthInput').focus()">
              <input type="hidden" id="workAuthHidden" name="workAuthorization" value="${escapeHtml(workAuthList.join(','))}" />
              <input type="text" id="workAuthInput" class="chips-search-input" placeholder="Type countries where you hold work authorization..." />
            </div>
            <div class="form-helper">Used to filter jobs that require citizenship or pre-existing permits.</div>

            <!-- Country Suggestions -->
            <div class="suggestion-pills-row">
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('India')">+ India</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('United States')">+ United States</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('Canada')">+ Canada</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('United Kingdom')">+ United Kingdom</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('European Union')">+ European Union</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('Singapore')">+ Singapore</span>
              <span class="suggestion-pill" onclick="addSuggestedWorkAuth('Australia')">+ Australia</span>
            </div>
          </div>

          <!-- Visa Sponsorship & Relocation -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;" class="form-group">
            <div>
              <label class="form-label">
                Do you require visa sponsorship?
              </label>
              <div style="display: flex; gap: 1rem; align-items: center; margin-top: 0.35rem;">
                <label style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: #cbd5e1; cursor: pointer;">
                  <input type="radio" name="visaSponsorshipRequired" value="false" ${!visaRequired ? 'checked' : ''} style="accent-color: #6366f1;" onchange="markFormDirty();" />
                  <span>No</span>
                </label>
                <label style="display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: #cbd5e1; cursor: pointer;">
                  <input type="radio" name="visaSponsorshipRequired" value="true" ${visaRequired ? 'checked' : ''} style="accent-color: #6366f1;" onchange="markFormDirty();" />
                  <span>Yes</span>
                </label>
              </div>
            </div>

            <div>
              <label class="form-label" for="relocationPreference">
                Relocation Preference
              </label>
              <select id="relocationPreference" name="relocationPreference" class="form-select" onchange="markFormDirty();">
                <option value="REMOTE_ONLY" ${relocationPref === 'REMOTE_ONLY' ? 'selected' : ''}>Not open to relocation (Remote only)</option>
                <option value="WILLING_TO_RELOCATE" ${relocationPref === 'WILLING_TO_RELOCATE' ? 'selected' : ''}>Open to relocation</option>
                <option value="NOT_WILLING" ${relocationPref === 'NOT_WILLING' ? 'selected' : ''}>Open for the right opportunity</option>
              </select>
            </div>
          </div>

          <!-- Availability & Notice Period -->
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="availabilityDate">
              Availability / Notice Period
            </label>
            <input type="text" id="availabilityDate" name="availabilityDate" value="${escapeHtml(availability)}" placeholder="e.g. Immediately, 2 weeks, 1 month" class="form-input" />
            <div class="suggestion-pills-row">
              <span class="suggestion-pill" onclick="document.getElementById('availabilityDate').value = 'Immediately'; markFormDirty();">Immediately</span>
              <span class="suggestion-pill" onclick="document.getElementById('availabilityDate').value = 'Within 2 weeks'; markFormDirty();">Within 2 weeks</span>
              <span class="suggestion-pill" onclick="document.getElementById('availabilityDate').value = 'Within 1 month'; markFormDirty();">Within 1 month</span>
              <span class="suggestion-pill" onclick="document.getElementById('availabilityDate').value = '1–3 months'; markFormDirty();">1–3 months</span>
              <span class="suggestion-pill" onclick="document.getElementById('availabilityDate').value = 'Just exploring'; markFormDirty();">Just exploring</span>
            </div>
          </div>
        </div>

        <!-- Sticky Bottom Action Bar -->
        <div class="sticky-save-bar" id="stickySaveBar">
          <div class="sticky-save-content">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span id="saveStatusIndicator" style="font-size: 0.82rem; color: #94a3b8;">
                Ready to save your profile updates.
              </span>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items: center;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="location.reload()" style="font-size: 0.82rem;">
                Discard changes
              </button>
              <button type="submit" id="saveProfileBtn" class="btn btn-primary btn-sm" style="padding: 0.5rem 1.5rem; font-size: 0.88rem; font-weight: 600; background: #6366f1; border-color: #6366f1;">
                <span>💾 Save Profile</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      <!-- Clear Preferences Option -->
      <form action="/profile/clear-preferences" method="POST" style="margin-top: 1.5rem; display: inline-block;">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <button type="submit" class="btn btn-secondary btn-sm" onclick="return confirm('Are you sure you want to reset all job search preferences to defaults?');" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.25); font-size: 0.75rem;">
          <span>🗑️ Reset Preferences to Defaults</span>
        </button>
      </form>
    </div>

    <!-- Client-Side Multi-Select & Interaction Engine -->
    <script>
      let isFormDirty = false;
      function markFormDirty() {
        isFormDirty = true;
        const status = document.getElementById('saveStatusIndicator');
        if (status) {
          status.innerHTML = '<span style="color: #fbbf24;">● You have unsaved changes</span>';
        }
      }

      // Chip Selector Helper
      class ChipsSelector {
        constructor(containerId, inputId, hiddenId) {
          this.container = document.getElementById(containerId);
          this.input = document.getElementById(inputId);
          this.hidden = document.getElementById(hiddenId);
          this.chips = [];

          if (this.hidden && this.hidden.value) {
            this.chips = this.hidden.value.split(',').map(s => s.trim()).filter(Boolean);
          }

          this.render();
          this.bindEvents();
        }

        render() {
          const existingChips = this.container.querySelectorAll('.chip-tag');
          existingChips.forEach(el => el.remove());

          this.chips.forEach((chipText, idx) => {
            const tag = document.createElement('span');
            tag.className = 'chip-tag';
            tag.innerHTML = \`\${escapeHtmlText(chipText)} <button type="button" class="chip-remove-btn" onclick="window.chipSelectors['\${this.container.id}'].remove(\${idx})">×</button>\`;
            this.container.insertBefore(tag, this.input);
          });

          this.hidden.value = this.chips.join(',');
        }

        add(val) {
          const clean = val.trim();
          if (!clean) return;
          if (!this.chips.includes(clean)) {
            this.chips.push(clean);
            this.render();
            markFormDirty();
          }
          this.input.value = '';
        }

        remove(idx) {
          this.chips.splice(idx, 1);
          this.render();
          markFormDirty();
        }

        bindEvents() {
          this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              this.add(this.input.value);
            } else if (e.key === 'Backspace' && !this.input.value && this.chips.length > 0) {
              this.remove(this.chips.length - 1);
            }
          });

          this.input.addEventListener('blur', () => {
            if (this.input.value) {
              this.add(this.input.value);
            }
          });
        }
      }

      function escapeHtmlText(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      window.chipSelectors = {};
      document.addEventListener('DOMContentLoaded', () => {
        window.chipSelectors['targetRolesContainer'] = new ChipsSelector('targetRolesContainer', 'targetRolesInput', 'targetRolesHidden');
        window.chipSelectors['preferredLocationsContainer'] = new ChipsSelector('preferredLocationsContainer', 'preferredLocationsInput', 'preferredLocationsHidden');
        window.chipSelectors['preferredTechStackContainer'] = new ChipsSelector('preferredTechStackContainer', 'preferredTechStackInput', 'preferredTechStackHidden');
        window.chipSelectors['workAuthContainer'] = new ChipsSelector('workAuthContainer', 'workAuthInput', 'workAuthHidden');

        // Form change listener
        const form = document.getElementById('careerProfileForm');
        if (form) {
          form.addEventListener('input', () => markFormDirty());
        }
      });

      function addSuggestedRole(role) {
        if (window.chipSelectors['targetRolesContainer']) {
          window.chipSelectors['targetRolesContainer'].add(role);
        }
      }

      function addSuggestedLocation(loc) {
        if (window.chipSelectors['preferredLocationsContainer']) {
          window.chipSelectors['preferredLocationsContainer'].add(loc);
        }
      }

      function addSuggestedTech(tech) {
        if (window.chipSelectors['preferredTechStackContainer']) {
          window.chipSelectors['preferredTechStackContainer'].add(tech);
        }
      }

      function addSuggestedWorkAuth(country) {
        if (window.chipSelectors['workAuthContainer']) {
          window.chipSelectors['workAuthContainer'].add(country);
        }
      }

      function setRemotePref(val, btn) {
        document.getElementById('remotePreferenceHidden').value = val;
        const parent = btn.parentElement;
        parent.querySelectorAll('.segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        markFormDirty();
      }

      function toggleIndustry(ind, el) {
        const hidden = document.getElementById('industriesHidden');
        let current = hidden.value ? hidden.value.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (current.includes(ind)) {
          current = current.filter(item => item !== ind);
          el.classList.remove('selected');
          el.innerText = '+ ' + ind;
        } else {
          current.push(ind);
          el.classList.add('selected');
          el.innerText = '✓ ' + ind;
        }
        hidden.value = current.join(',');
        markFormDirty();
      }

      function applyAllAiSuggestions() {
        const roles = ${JSON.stringify(recommendedRoles.slice(0, 3))};
        roles.forEach(r => addSuggestedRole(r));
        addSuggestedLocation('Remote');
        addSuggestedLocation('India');
        markFormDirty();
      }

      function filterProjects(filter, btn) {
        const grid = document.getElementById('projectsGrid');
        if (!grid) return;

        btn.parentElement.querySelectorAll('button').forEach((b) => {
          b.style.background = '';
          b.style.borderColor = '';
          b.style.color = '';
        });
        btn.style.background = 'rgba(99, 102, 241, 0.2)';
        btn.style.borderColor = 'rgba(99, 102, 241, 0.4)';
        btn.style.color = '#e0e7ff';

        const cards = grid.querySelectorAll('.project-card');
        cards.forEach(card => {
          const type = card.getAttribute('data-project-type') || '';
          if (filter === 'all') {
            card.style.display = 'flex';
          } else if (filter === 'verified' && type.includes('verified')) {
            card.style.display = 'flex';
          } else if (filter === 'github' && type.includes('github')) {
            card.style.display = 'flex';
          } else if (filter === 'resume' && type.includes('resume')) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      }
    </script>
  `;

  return renderLayout({
    title: 'Career Profile & Preferences | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'profile',
  });
}
