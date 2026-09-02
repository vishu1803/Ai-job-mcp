/**
 * @file Candidate Career Profile & Job Search Preferences View (P14-004C / ARCH-056 / Refinement).
 *
 * Implements the user-facing Canonical Career Profile and Intent Management page:
 * 1. Actionable Profile Completeness & Readiness status with compact visual indicators
 * 2. Professional Identity & Narrative with guided suggestions (Name, Headline, Current Role, Current Location, Summary)
 * 3. Career Status & Explicit Current Employment (Fresher, Student, Employed, etc.)
 * 4. Multi-Record Work Experience with Add/Edit/Delete, employment types, and derived tenure metrics
 * 5. Multi-Record Education with Degree Types, graduation/enrolled status, and coursework tagging
 * 6. Multi-Record Certifications & Languages
 * 7. Evidence-Locked Qualifications & Categorized Skills (Read-Only / AST & GitHub / Non-Editable)
 * 8. Evidence-Locked Highlighted Projects with AST signals and repository provenance
 * 9. Intelligent Job Search Preferences (Separate from Current Location) with suggestions and multi-select chips
 * 10. Sticky save bar with dirty-state tracking and unsaved changes confirmation
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
  additionalSkills = [],
  skillCatalog = { items: [], categories: [] },
}) {
  const jobPrefs = profile?.jobPreferences || preferences || {};
  const targetRolesList = jobPrefs.targetRoles || [];
  const preferredLocationsList = jobPrefs.preferredLocations || [];
  const remotePref = jobPrefs.remotePreference || 'FLEXIBLE';
  const salaryFloor = jobPrefs.salaryFloor != null ? jobPrefs.salaryFloor : '';
  const salaryCurrency = jobPrefs.salaryCurrency || 'USD';
  const workAuthList = jobPrefs.workAuthorization || [];
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
  const careerStatusVal =
    profile?.careerStatus || candidate?.profileMetadata?.careerStatus || 'FRESHER';
  const currentEmploymentObj =
    profile?.currentEmployment || candidate?.profileMetadata?.currentEmployment || null;
  const experienceList =
    profile?.recentExperience ||
    candidate?.profileMetadata?.userCustom?.experience ||
    candidate?.profileMetadata?.experience ||
    [];
  const educationList =
    profile?.education ||
    candidate?.profileMetadata?.userCustom?.education ||
    candidate?.profileMetadata?.education ||
    [];
  const certsList =
    profile?.certifications ||
    candidate?.profileMetadata?.userCustom?.certifications ||
    candidate?.profileMetadata?.certifications ||
    [];
  const languagesList =
    profile?.languages ||
    candidate?.profileMetadata?.userCustom?.languages ||
    candidate?.profileMetadata?.languages ||
    [];
  const portfolioLinksList =
    profile?.portfolioLinks || candidate?.profileMetadata?.userCustom?.portfolioLinks || [];
  const projectsList = profile?.highlightedProjects || [];
  const topSkillsList = profile?.topSkills || [];
  const primarySkillsList =
    profile?.primarySkills && profile.primarySkills.length > 0
      ? profile.primarySkills
      : topSkillsList.filter((s) => s.tier !== 'SIGNAL');
  const technologySignalsList =
    profile?.technologySignals && profile.technologySignals.length > 0
      ? profile.technologySignals
      : topSkillsList.filter((s) => s.tier === 'SIGNAL');

  const expDuration = profile?.experienceDuration || {
    totalYears: 0,
    totalMonths: 0,
    professionalYears: 0,
    professionalMonths: 0,
    softwareEngineeringYears: 0,
    softwareEngineeringMonths: 0,
  };
  const seniorityLevel = profile?.seniority || 'ENTRY_LEVEL';

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

  const initialProfileState = {
    experiences: experienceList,
    education: educationList,
    certifications: certsList,
    languages: languagesList,
    portfolioLinks: portfolioLinksList,
    currentEmployment: currentEmploymentObj,
    additionalSkills: additionalSkills || [],
    skillCatalogItems: (skillCatalog && skillCatalog.items) || [],
    skillCatalogCategories: (skillCatalog && skillCatalog.categories) || [],
  };

  const content = `
    <style>
      /* Career Profile SaaS Design System */
      .profile-page-container {
        max-width: 1100px;
        margin: 0 auto;
        padding: 1.5rem 1.25rem 6rem 1.25rem;
      }

      .profile-header-card {
        background: var(--bg-surface-elevated);
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
        background: var(--accent-primary, #6366f1);
        height: 100%;
        border-radius: 9999px;
        transition: width 0.4s ease;
      }

      .section-status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 0.5rem;
        margin-top: 0.75rem;
      }

      .section-status-pill {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.65rem;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        text-decoration: none;
        transition: background 0.15s ease;
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
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .form-section-card {
        background: var(--bg-surface-elevated);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.25rem;
        position: relative;
      }

      .section-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 0.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .section-subtitle {
        font-size: 0.8rem;
        color: #94a3b8;
        margin-bottom: 1.25rem;
        line-height: 1.4;
      }

      .form-group {
        margin-bottom: 1rem;
      }

      .form-label {
        display: block;
        font-size: 0.82rem;
        font-weight: 600;
        color: #cbd5e1;
        margin-bottom: 0.35rem;
      }

      .form-input, .form-select, .form-textarea {
        width: 100%;
        background: rgba(11, 15, 25, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 0.55rem 0.75rem;
        font-size: 0.85rem;
        color: #f8fafc;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
        box-sizing: border-box;
      }

      .form-input:focus, .form-select:focus, .form-textarea:focus {
        border-color: #6366f1;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
      }

      .form-helper {
        font-size: 0.72rem;
        color: #64748b;
        margin-top: 0.3rem;
      }

      .chips-input-box {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        background: rgba(11, 15, 25, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 0.4rem 0.6rem;
        min-height: 42px;
        align-items: center;
      }

      .chips-search-input {
        flex: 1;
        min-width: 120px;
        background: transparent;
        border: none;
        outline: none;
        color: #f8fafc;
        font-size: 0.85rem;
        padding: 0.2rem 0;
      }

      .selected-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: rgba(99, 102, 241, 0.2);
        color: #e0e7ff;
        border: 1px solid rgba(99, 102, 241, 0.4);
        padding: 0.2rem 0.55rem;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 500;
      }

      .chip-remove-btn {
        cursor: pointer;
        color: #a5b4fc;
        font-weight: 700;
        font-size: 0.85rem;
        line-height: 1;
      }

      .chip-remove-btn:hover {
        color: #ef4444;
      }

      .suggestion-pills-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.4rem;
      }

      .suggestion-pill {
        background: rgba(255, 255, 255, 0.05);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0.2rem 0.55rem;
        border-radius: 14px;
        font-size: 0.72rem;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .suggestion-pill:hover {
        background: rgba(99, 102, 241, 0.15);
        border-color: rgba(99, 102, 241, 0.4);
        color: #e0e7ff;
      }

      .suggestion-pill.ai-recommended {
        border-color: rgba(99, 102, 241, 0.4);
        color: #c7d2fe;
        background: rgba(99, 102, 241, 0.1);
      }

      /* Evidence Locked Banner & Badges */
      .evidence-lock-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        background: rgba(99, 102, 241, 0.12);
        color: #a5b4fc;
        border: 1px solid rgba(99, 102, 241, 0.3);
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
      }

      .evidence-lock-banner {
        background: rgba(99, 102, 241, 0.05);
        border: 1px dashed rgba(99, 102, 241, 0.25);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin-bottom: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      /* Multi-Record Card Grid */
      .record-card-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .record-item-card {
        background: rgba(11, 15, 25, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 1rem 1.25rem;
        position: relative;
        transition: border-color 0.15s ease;
      }

      .record-item-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
      }

      .record-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.35rem;
      }

      .record-card-actions {
        display: flex;
        gap: 0.4rem;
      }

      .btn-icon-action {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        padding: 0.2rem 0.5rem;
        border-radius: 5px;
        font-size: 0.72rem;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
      }

      .btn-icon-action:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }

      .btn-icon-action.danger:hover {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.4);
        color: #fca5a5;
      }

      /* Derived Metrics Box */
      .derived-metrics-box {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 0.85rem 1rem;
        margin-top: 1rem;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 0.75rem;
      }

      .metric-stat-item {
        display: flex;
        flex-direction: column;
      }

      .metric-stat-label {
        font-size: 0.7rem;
        color: #94a3b8;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.02em;
      }

      .metric-stat-value {
        font-size: 0.95rem;
        font-weight: 700;
        color: #f8fafc;
        margin-top: 0.15rem;
      }

      /* Sticky Save Bar */
      .sticky-save-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(12px);
        border-top: 1px solid rgba(99, 102, 241, 0.3);
        padding: 0.85rem 1.5rem;
        z-index: 100;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.5);
        transform: translateY(100%);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .sticky-save-bar.visible {
        transform: translateY(0);
      }

      /* Modal Dialog Styles */
      .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        z-index: 200;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }

      .modal-backdrop.open {
        display: flex;
      }

      .modal-dialog {
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        width: 100%;
        max-width: 580px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 1.5rem;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .modal-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: #f8fafc;
        margin: 0;
      }

      .modal-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 1.25rem;
        cursor: pointer;
      }

      .modal-close-btn:hover {
        color: #f8fafc;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1.25rem;
        padding-top: 0.75rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }

      /* Skills Grid Categorization */
      .skill-category-block {
        background: rgba(11, 15, 25, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 0.75rem 1rem;
      }

      .skill-category-title {
        font-size: 0.75rem;
        font-weight: 700;
        color: #a5b4fc;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 0.5rem;
      }

      .skill-tag-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 500;
      }

      .badge-verified {
        background: rgba(16, 185, 129, 0.12);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }

      .badge-claimed {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }

      .badge-user-provided {
        background: rgba(99, 102, 241, 0.12);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.3);
      }

      /* Projects Grid */
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 0.85rem;
      }

      .project-card {
        background: rgba(11, 15, 25, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .project-evidence-badge {
        font-size: 0.68rem;
        font-weight: 600;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }

      .project-claimed-badge {
        font-size: 0.68rem;
        font-weight: 600;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }

      /* Modal Grid Layouts */
      .modal-grid-2col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }
      .modal-grid-edu {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 0.75rem;
      }

      /* Responsive: Collapse grids below 480px */
      @media (max-width: 480px) {
        .profile-page-container {
          padding: 1rem 0.75rem 5rem 0.75rem;
        }
        .profile-header-card {
          padding: 1rem;
        }
        .form-section-card {
          padding: 1rem;
        }
        .modal-dialog {
          padding: 1rem;
          max-width: 100%;
        }
        .section-status-grid {
          grid-template-columns: 1fr;
        }
        .projects-grid {
          grid-template-columns: 1fr;
        }
        .derived-metrics-box {
          grid-template-columns: 1fr 1fr;
        }
        .modal-grid-2col,
        .modal-grid-edu {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="profile-page-container">
      <!-- Flash Alert Feedback -->
      ${
        flashMessage
          ? `<div class="card" style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 0.85rem 1.25rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.88rem; font-weight: 500;">✓ ${escapeHtml(flashMessage)}</div>`
          : ''
      }
      ${
        errorMessage
          ? `<div class="card" style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 0.85rem 1.25rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.88rem; font-weight: 500;">⚠️ ${escapeHtml(errorMessage)}</div>`
          : ''
      }

      <!-- Profile Snapshot Header & Readiness Bar -->
      <div class="profile-header-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="display: flex; gap: 1rem; align-items: center;">
            <div style="width: 56px; height: 56px; border-radius: 14px; background: var(--accent-primary, #6366f1); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 800;">
              ${escapeHtml((candidate?.displayName || user?.displayName || 'C').slice(0, 2).toUpperCase())}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h1 style="font-size: 1.35rem; font-weight: 800; color: #f8fafc; margin: 0;">
                  ${escapeHtml(candidate?.displayName || user?.displayName || 'Candidate Profile')}
                </h1>
                <span class="badge badge-verified" style="font-size: 0.72rem; text-transform: uppercase;">
                  STATUS: ${escapeHtml(careerStatusVal)}
                </span>
              </div>
              <p style="font-size: 0.88rem; color: #94a3b8; margin: 0.2rem 0 0 0;">
                ${escapeHtml(candidate?.headline || currentRole || 'Professional Candidate')} • <span style="color: #64748b;">${escapeHtml(userLocation || 'Location not set')}</span>
              </p>
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
            <span class="badge badge-verified" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;">
              Career Profile: ${profileReadiness.score}% Populated
            </span>
            <span class="badge ${completeness.isReadyForJobSearch ? 'badge-verified' : 'badge-claimed'}" style="font-size: 0.75rem; padding: 0.3rem 0.6rem;">
              Job Matching: ${completeness.isReadyForJobSearch ? '✓ Ready' : '○ Needs Preferences'}
            </span>
          </div>
        </div>

        <div class="completion-bar-track">
          <div class="completion-bar-fill" style="width: ${overallPercentage}%;"></div>
        </div>

        <div class="section-status-grid">
          <a href="#section-identity" class="section-status-pill ${candidate?.displayName ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${candidate?.displayName ? '✓' : '!'}</span> 1. Identity & Standing
          </a>
          <a href="#section-experience" class="section-status-pill ${experienceList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${experienceList.length > 0 ? '✓' : '○'}</span> 2. Experience (${experienceList.length})
          </a>
          <a href="#section-education" class="section-status-pill ${educationList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${educationList.length > 0 ? '✓' : '○'}</span> 3. Education (${educationList.length})
          </a>
          <a href="#section-qualifications" class="section-status-pill ${primarySkillsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${primarySkillsList.length > 0 ? '✓' : '!'}</span> 4. Skills & Projects
          </a>
          <a href="#section-preferences" class="section-status-pill ${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? '✓' : '!'}</span> 5. Job Preferences
          </a>
        </div>

        <!-- MCP Data Flow Indicator -->
        <div style="margin-top: 0.75rem; padding: 0.6rem 1rem; background: rgba(99, 102, 241, 0.06); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.85rem;">🔗</span>
          <span style="font-size: 0.78rem; color: #a5b4fc;">This profile feeds AI career tools — MCP clients like Claude, ChatGPT & Gemini use your saved data for job matching & resume tailoring.</span>
        </div>
      </div>

      <!-- Quick AI Suggestions Bar -->
      ${
        targetRolesList.length === 0 || preferredLocationsList.length === 0
          ? `
        <div class="card" style="background: var(--bg-surface-elevated); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.35rem;">✨</span>
            <div>
              <strong style="color: #f8fafc; font-size: 0.88rem; display: block;">Suggested preferences based on your skills</strong>
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
        <input type="hidden" id="experienceHidden" name="experience" value="" />
        <input type="hidden" id="educationHidden" name="education" value="" />
        <input type="hidden" id="certificationsHidden" name="certifications" value="" />
        <input type="hidden" id="languagesHidden" name="languages" value="" />
        <input type="hidden" id="portfolioLinksHidden" name="portfolioLinks" value="" />
        <input type="hidden" id="currentEmploymentHidden" name="currentEmployment" value="" />

        <!-- Top-level Save Button (always visible) -->
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem; padding: 0.5rem 0;">
          <span id="dirtyIndicator" style="font-size: 0.78rem; color: #94a3b8; display: none;">● Unsaved changes</span>
          <span id="saveStatus" style="font-size: 0.78rem; display: none;"></span>
          <button type="submit" class="btn btn-primary" style="padding: 0.5rem 1.5rem; font-weight: 700;">💾 Save Profile</button>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 1: PROFESSIONAL IDENTITY & CURRENT STANDING               -->
        <!-- ================================================================= -->
        <div id="section-identity" class="form-section-card">
          <div class="section-title">
            <span>👤 1. Professional Identity & Standing</span>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 500;">✓ User Editable</span>
          </div>
          <div class="section-subtitle">
            Define your authentic professional persona, candidate status, and current employment state.
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
            <div class="form-group">
              <label class="form-label" for="displayName">
                Display Name <span style="color: #ef4444;">*</span>
              </label>
              <input type="text" id="displayName" name="displayName" value="${escapeHtml(candidate?.displayName || user?.displayName || '')}" required class="form-input" placeholder="e.g. Alex Mercer" oninput="markFormDirty()" />
              <div class="form-helper">Your preferred full name for applications and profile views.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="headline">
                Professional Headline
              </label>
              <input type="text" id="headline" name="headline" value="${escapeHtml(candidate?.headline || '')}" placeholder="e.g. Backend Engineer specializing in distributed systems" class="form-input" oninput="markFormDirty()" />
              <div class="form-helper">Concise one-line summary of what you do.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="currentRole">
                Professional Role / Persona
              </label>
              <input type="text" id="currentRole" name="currentRole" value="${escapeHtml(currentRole)}" placeholder="e.g. Full-Stack & Backend Developer" class="form-input" oninput="markFormDirty()" />
              <div class="form-helper">Your active persona (does not require active employment).</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="careerStatus">
                Career Status <span style="color: #6366f1; font-size: 0.7rem;">(Confirm or Edit)</span>
              </label>
              <select id="careerStatus" name="careerStatus" class="form-select" onchange="handleCareerStatusChange(); markFormDirty();">
                <option value="FRESHER" ${careerStatusVal === 'FRESHER' ? 'selected' : ''}>Fresher (Recent/Upcoming Graduate)</option>
                <option value="STUDENT" ${careerStatusVal === 'STUDENT' ? 'selected' : ''}>Student (Currently Enrolled)</option>
                <option value="EMPLOYED" ${careerStatusVal === 'EMPLOYED' ? 'selected' : ''}>Employed (Currently Working)</option>
                <option value="UNEMPLOYED" ${careerStatusVal === 'UNEMPLOYED' ? 'selected' : ''}>Unemployed / Job Seeking</option>
                <option value="FREELANCER" ${careerStatusVal === 'FREELANCER' ? 'selected' : ''}>Freelancer / Independent</option>
                <option value="CONTRACTOR" ${careerStatusVal === 'CONTRACTOR' ? 'selected' : ''}>Contractor</option>
                <option value="OTHER" ${careerStatusVal === 'OTHER' ? 'selected' : ''}>Other</option>
              </select>
              <div class="form-helper">Detected from your qualifications: <strong>${escapeHtml(careerStatusVal)}</strong></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="location">
                Current Location (Residence)
              </label>
              <input type="text" id="location" name="location" value="${escapeHtml(userLocation)}" placeholder="e.g. Bengaluru, India" class="form-input" oninput="markFormDirty()" />
              <div class="form-helper">Where you currently live (Separate from preferred search locations).</div>
              <div class="suggestion-pills-row">
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Bengaluru, India'; markFormDirty();">Bengaluru</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Hyderabad, India'; markFormDirty();">Hyderabad</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Pune, India'; markFormDirty();">Pune</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Delhi NCR, India'; markFormDirty();">Delhi NCR</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Mumbai, India'; markFormDirty();">Mumbai</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Lucknow, India'; markFormDirty();">Lucknow</span>
              </div>
            </div>

            <!-- Current Active Employment Card -->
            <div class="form-group">
              <label class="form-label">
                Current Active Employment
              </label>
              <div id="currentEmploymentDisplay" style="background: rgba(11, 15, 25, 0.75); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; padding: 0.65rem 0.85rem; font-size: 0.85rem; color: #f8fafc; min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <div id="currentEmploymentText">
                  ${
                    currentEmploymentObj
                      ? `<span>💼 <strong>${escapeHtml(currentEmploymentObj.title)}</strong> at ${escapeHtml(currentEmploymentObj.company)} <span class="badge" style="font-size: 0.68rem; margin-left: 0.3rem;">${escapeHtml(currentEmploymentObj.employmentType || 'FULL_TIME')}</span></span>`
                      : `<span style="color: #94a3b8;">○ Not currently employed (Job Seeking / Student / Independent)</span>`
                  }
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openCurrentEmploymentModal()" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">
                  ${currentEmploymentObj ? 'Edit' : 'Set Employment'}
                </button>
              </div>
              <div class="form-helper">
                Distinguishes declared active employment from past internships or role titles.
              </div>
            </div>
          </div>

          <div class="form-group" style="margin-top: 0.5rem; margin-bottom: 0;">
            <label class="form-label" for="summary">
              Executive Summary
            </label>
            <textarea id="summary" name="summary" rows="3" placeholder="Write a concise professional introduction..." class="form-textarea" style="resize: vertical;" oninput="markFormDirty()">${escapeHtml(summaryText)}</textarea>
            <div class="form-helper">Foundational summary used for AI resume tailoring and MCP profile summaries.</div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 2: WORK EXPERIENCE (MULTI-RECORD CRUD)                    -->
        <!-- ================================================================= -->
        <div id="section-experience" class="form-section-card">
          <div class="section-title">
            <span>💼 2. Work Experience History</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openAddExperienceModal()" style="font-size: 0.78rem; padding: 0.3rem 0.75rem;">
              + Add Experience
            </button>
          </div>
          <div class="section-subtitle">
            Manage your employment history, internships, and contracts. User edits are preserved with <code>USER_PROVIDED</code> provenance.
          </div>

          <div id="experienceListContainer" class="record-card-list">
            <!-- Rendered dynamically by client-side state -->
          </div>

          <!-- Derived Tenure Metrics Box -->
          <div class="derived-metrics-box">
            <div class="metric-stat-item">
              <span class="metric-stat-label">Total Experience</span>
              <span class="metric-stat-value" id="dispTotalExp">${expDuration.totalYears} yr(s) (${expDuration.totalMonths} mo)</span>
            </div>
            <div class="metric-stat-item">
              <span class="metric-stat-label">Full-Time Professional</span>
              <span class="metric-stat-value" id="dispProfExp">${expDuration.professionalYears} yr(s) (${expDuration.professionalMonths} mo)</span>
            </div>
            <div class="metric-stat-item">
              <span class="metric-stat-label">Software Engineering</span>
              <span class="metric-stat-value" id="dispSeExp">${expDuration.softwareEngineeringYears || 0} yr(s) (${expDuration.softwareEngineeringMonths || 0} mo)</span>
            </div>
            <div class="metric-stat-item">
              <span class="metric-stat-label">Derived Level</span>
              <span class="metric-stat-value" id="dispSeniority">${escapeHtml(seniorityLevel)}</span>
            </div>
          </div>
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.4rem;">
            ℹ️ Derived metrics are calculated automatically from your experience records and cannot be directly forged.
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 3: EDUCATION (MULTI-RECORD CRUD)                          -->
        <!-- ================================================================= -->
        <div id="section-education" class="form-section-card">
          <div class="section-title">
            <span>🎓 3. Education & Degrees</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openAddEducationModal()" style="font-size: 0.78rem; padding: 0.3rem 0.75rem;">
              + Add Education
            </button>
          </div>
          <div class="section-subtitle">
            Supports multiple degrees, bootcamps, and diplomas with graduation and currently enrolled tracking.
          </div>

          <div id="educationListContainer" class="record-card-list">
            <!-- Rendered dynamically by client-side state -->
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 4: CERTIFICATIONS, LANGUAGES & LINKS                      -->
        <!-- ================================================================= -->
        <div id="section-credentials" class="form-section-card">
          <div class="section-title">
            <span>📜 4. Certifications, Languages & Links</span>
          </div>
          <div class="section-subtitle">
            Professional credentials, spoken languages, and online portfolio links.
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            <!-- Certifications -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.88rem; font-weight: 700; color: #e2e8f0; margin: 0;">Certifications</h4>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openAddCertModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add</button>
              </div>
              <div id="certificationsListContainer" class="record-card-list">
                <!-- Rendered dynamically -->
              </div>
            </div>

            <!-- Languages -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.88rem; font-weight: 700; color: #e2e8f0; margin: 0;">Languages</h4>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openAddLangModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add</button>
              </div>
              <div id="languagesListContainer" class="record-card-list">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>

          <!-- Portfolio Links -->
          <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="font-size: 0.88rem; font-weight: 700; color: #e2e8f0; margin: 0;">🔗 Professional Portfolio & Social Links</h4>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openAddLinkModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add Link</button>
            </div>
            <div id="portfolioLinksContainer" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 5: CAREER SKILLS (COMBINED GITHUB + RESUME)             -->
        <!-- ================================================================= -->
        <div id="section-qualifications" class="form-section-card">
          <div class="section-title">
            <span>🛡️ 5. Career Skills (${primarySkillsList.length + technologySignalsList.length})</span>
            <span class="evidence-lock-badge">🔒 Evidence-Controlled</span>
          </div>
          <div class="section-subtitle">
            Combined from GitHub repositories (AST code scans) and parsed resumes. GitHub-verified skills are prioritized.
          </div>

          <div class="evidence-lock-banner">
            <div>
              <strong style="color: #c7d2fe; font-size: 0.85rem;">Evidence-Locked Truth Model</strong>
              <p style="color: #94a3b8; font-size: 0.78rem; margin: 0.2rem 0 0 0;">
                Skills are classified as ✓ Verified (GitHub evidence), ✓ Corroborated (both sources), or ○ Claimed (resume only).
              </p>
            </div>
            <a href="/sources" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
              Manage Sources →
            </a>
          </div>

          <!-- Source Summary -->
          <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #34d399;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
              ${primarySkillsList.filter((s) => s.githubEvidence).length + technologySignalsList.filter((s) => s.githubEvidence).length} GitHub Verified
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #fbbf24;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; display: inline-block;"></span>
              ${primarySkillsList.filter((s) => s.source === 'BOTH').length + technologySignalsList.filter((s) => s.source === 'BOTH').length} Corroborated
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #a5b4fc;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #a5b4fc; display: inline-block;"></span>
              ${primarySkillsList.filter((s) => !s.githubEvidence && s.source !== 'BOTH').length + technologySignalsList.filter((s) => !s.githubEvidence && s.source !== 'BOTH').length} Resume Claimed
            </div>
          </div>

          <!-- Categorized Primary Skills -->
          <div style="display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1.25rem;">
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
                      const label = isBoth ? '✓ Corroborated' : isVer ? '✓ Verified' : '○ Claimed';
                      const badgeClass = isBoth || isVer ? 'badge-verified' : 'badge-claimed';

                      return `
                        <span class="skill-tag-badge ${badgeClass}" title="Source: ${escapeHtml(s.source || 'UNKNOWN')} | Category: ${escapeHtml(s.fineCategory || s.category || catName)} | Evidence: ${s.evidenceCount || 0} signal(s)">
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

          <!-- Technology & Implementation Signals (Always visible, not collapsed) -->
          ${
            technologySignalsList.length > 0
              ? `
            <div style="background: rgba(11, 15, 25, 0.45); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.85rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.6rem; display: flex; justify-content: space-between; align-items: center;">
                <span>🔍 Additional Libraries & Tools (${technologySignalsList.length})</span>
                <span style="font-size: 0.72rem; color: #64748b;">Supporting technologies from code analysis</span>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
                ${technologySignalsList
                  .map((s) => {
                    const isVer = s.truthStatus === 'VERIFIED' || s.provenanceStatus === 'VERIFIED';
                    const isBoth = s.source === 'BOTH' || (s.githubEvidence && s.resumeClaim);
                    const badgeStyle =
                      isBoth || isVer
                        ? 'background: rgba(16, 185, 129, 0.08); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.2);'
                        : 'background: rgba(255, 255, 255, 0.03); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.06);';
                    return `
                      <span class="skill-tag-badge" style="font-size: 0.72rem; ${badgeStyle}" title="Category: ${escapeHtml(s.fineCategory || s.category || 'LIBRARY')} | Evidence: ${s.evidenceCount || 1} signal(s) | Source: ${escapeHtml(s.source || 'UNKNOWN')}">
                        ${escapeHtml(s.name || s)} <span style="color: #64748b; font-size: 0.65rem;">(${s.evidenceCount || 1})</span>
                      </span>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          `
              : ''
          }
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 5B: ADDITIONAL SKILLS (CANDIDATE DECLARED)               -->
        <!-- ================================================================= -->
        <div id="section-additional-skills" class="form-section-card">
          <div class="section-title">
            <span>🎯 5B. Additional Skills</span>
            <span style="font-size: 0.72rem; color: #a5b4fc; background: rgba(165, 180, 252, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 500;">YOUR DECLARATION</span>
          </div>
          <div class="section-subtitle">
            Add skills you know or are learning that may not be visible in your connected GitHub repositories or resume.
          </div>

          <div class="evidence-lock-banner" style="background: rgba(165, 180, 252, 0.06); border-color: rgba(165, 180, 252, 0.15);">
            <div>
              <strong style="color: #c7d2fe; font-size: 0.85rem;">Self-Declared Skills</strong>
              <p style="color: #94a3b8; font-size: 0.78rem; margin: 0.2rem 0 0 0;">
                These are your self-declared skills. They help career tools understand your full skillset but are marked as <span style="color: #fbbf24;">SELF_DECLARED</span> until independently verified.
              </p>
            </div>
          </div>

          <!-- Additional Skills List -->
          <div id="additionalSkillsContainer" style="margin-bottom: 1rem;">
            <div style="color: #64748b; font-size: 0.82rem; font-style: italic;">Loading additional skills...</div>
          </div>

          <!-- Add Skill Button -->
          <button
            id="openAddSkillModal"
            class="btn btn-secondary"
            style="font-size: 0.82rem; padding: 0.5rem 1rem; display: flex; align-items: center; gap: 0.4rem;"
            onclick="openSkillCatalogModal()"
          >
            <span style="font-size: 1rem;">+</span> Add Skill
          </button>

          <div style="margin-top: 0.5rem; font-size: 0.72rem; color: #64748b;">
            🔗 These skills feed AI career tools — MCP clients use your saved data for job matching.
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 6: HIGHLIGHTED PROJECTS (EVIDENCE LOCKED)                 -->
        <!-- ================================================================= -->
        <div id="section-projects" class="form-section-card">
          <div class="section-title">
            <span>🚀 6. Highlighted Portfolio Projects</span>
            <span class="evidence-lock-badge">🔒 Evidence-Controlled</span>
          </div>
          <div class="section-subtitle">
            Grounded in AST code scanning, entrypoint verification, and GitHub repository commits.
          </div>

          ${
            projectsList.length > 0
              ? `
            <div class="projects-grid">
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

                  return `
                    <div class="project-card">
                      <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem;">
                          <strong style="color: #f8fafc; font-size: 0.92rem;">${escapeHtml(p.name)}</strong>
                          <span class="${badgeClass}">${badgeText}</span>
                        </div>
                        ${
                          p.headline
                            ? `<p style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 0.5rem; line-height: 1.4;">${escapeHtml(p.headline)}</p>`
                            : `<p style="color: #64748b; font-size: 0.78rem; font-style: italic; margin-bottom: 0.5rem;">Technical portfolio project.</p>`
                        }
                        ${
                          Array.isArray(p.technologies) && p.technologies.length > 0
                            ? `
                          <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.6rem;">
                            ${p.technologies
                              .slice(0, 5)
                              .map(
                                (t) =>
                                  `<span class="badge" style="font-size: 0.68rem; background: rgba(255,255,255,0.05); color: #cbd5e1; padding: 0.15rem 0.4rem;">${escapeHtml(t)}</span>`
                              )
                              .join('')}
                          </div>
                        `
                            : ''
                        }
                      </div>

                      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.75rem;">
                        ${p.id ? `<a href="/projects/${escapeHtml(p.id)}" style="color: #6366f1; font-weight: 500;">View project →</a>` : '<span style="color: #64748b;">Repository Project</span>'}
                        ${p.verifiedSignalCount ? `<span style="color: #64748b; font-size: 0.7rem;">${p.verifiedSignalCount} AST signals</span>` : ''}
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

        <!-- ================================================================= -->
        <!-- SECTION 7: JOB SEARCH PREFERENCES (SOVEREIGN USER INTENT)          -->
        <!-- ================================================================= -->
        <div id="section-preferences" class="form-section-card">
          <div class="section-title">
            <span>🎯 7. Job Search Preferences & Criteria</span>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 500;">✓ User Editable</span>
          </div>
          <div class="section-subtitle">
            Configure matching criteria for ATS and AI agents. (Separate from your Current Location above).
          </div>

          <!-- Target Roles -->
          <div class="form-group">
            <label class="form-label" for="targetRolesInput">
              Target Roles <span style="color: #ef4444;">*</span>
            </label>
            <div class="chips-input-box" id="targetRolesContainer" onclick="document.getElementById('targetRolesInput').focus()">
              <input type="hidden" id="targetRolesHidden" name="targetRoles" value="${escapeHtml(targetRolesList.join(','))}" />
              <input type="text" id="targetRolesInput" class="chips-search-input" placeholder="Type a role and press Enter..." />
            </div>
            <div class="form-helper">Roles you are actively targeting for discovery.</div>

            <!-- Suggestions -->
            <div style="margin-top: 0.4rem;">
              <span style="font-size: 0.72rem; color: #a5b4fc; font-weight: 500;">✨ Quick Suggestions:</span>
              <div class="suggestion-pills-row" id="recommendedRolesRow">
                ${recommendedRoles.map((r) => `<span class="suggestion-pill ai-recommended" onclick="addSuggestedRole('${escapeHtml(r)}')">+ ${escapeHtml(r)}</span>`).join('')}
                <span class="suggestion-pill" onclick="addSuggestedRole('Frontend Engineer')">+ Frontend Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('Platform Engineer')">+ Platform Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('API Engineer')">+ API Engineer</span>
              </div>
            </div>
          </div>

          <!-- Preferred Locations -->
          <div class="form-group">
            <label class="form-label" for="preferredLocationsInput">
              Preferred Job Locations <span style="color: #ef4444;">*</span>
            </label>
            <div class="chips-input-box" id="preferredLocationsContainer" onclick="document.getElementById('preferredLocationsInput').focus()">
              <input type="hidden" id="preferredLocationsHidden" name="preferredLocations" value="${escapeHtml(preferredLocationsList.join(','))}" />
              <input type="text" id="preferredLocationsInput" class="chips-search-input" placeholder="Type a location and press Enter..." />
            </div>
            <div class="form-helper">Locations where you are willing to work (Remote, Hybrid, or On-site cities).</div>

            <div style="margin-top: 0.4rem;">
              <span style="font-size: 0.72rem; color: #a5b4fc; font-weight: 500;">✨ Quick Locations:</span>
              <div class="suggestion-pills-row">
                <span class="suggestion-pill" onclick="addSuggestedLocation('Remote')">+ Remote</span>
                <span class="suggestion-pill" onclick="addSuggestedLocation('Bengaluru')">+ Bengaluru</span>
                <span class="suggestion-pill" onclick="addSuggestedLocation('Hyderabad')">+ Hyderabad</span>
                <span class="suggestion-pill" onclick="addSuggestedLocation('Delhi NCR')">+ Delhi NCR</span>
                <span class="suggestion-pill" onclick="addSuggestedLocation('Pune')">+ Pune</span>
                <span class="suggestion-pill" onclick="addSuggestedLocation('Mumbai')">+ Mumbai</span>
              </div>
            </div>
          </div>

          <!-- Preferences Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="form-group">
              <label class="form-label" for="remotePreference">Remote Work Preference</label>
              <select id="remotePreference" name="remotePreference" class="form-select" onchange="markFormDirty()">
                <option value="REMOTE_ONLY" ${remotePref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                <option value="REMOTE_FIRST" ${remotePref === 'REMOTE_FIRST' ? 'selected' : ''}>Remote First</option>
                <option value="HYBRID" ${remotePref === 'HYBRID' ? 'selected' : ''}>Hybrid</option>
                <option value="ON_SITE" ${remotePref === 'ON_SITE' ? 'selected' : ''}>On-Site</option>
                <option value="FLEXIBLE" ${remotePref === 'FLEXIBLE' ? 'selected' : ''}>Flexible</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Compensation Floor (Annual Minimum)</label>
              <div style="display: flex; gap: 0.5rem;">
                <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(String(salaryFloor))}" placeholder="e.g. 800000" class="form-input" style="flex: 2;" oninput="markFormDirty()" />
                <select id="salaryCurrency" name="salaryCurrency" class="form-select" style="flex: 1;" onchange="markFormDirty()">
                  <option value="INR" ${salaryCurrency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                  <option value="USD" ${salaryCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                  <option value="EUR" ${salaryCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                  <option value="GBP" ${salaryCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                  <option value="CAD" ${salaryCurrency === 'CAD' ? 'selected' : ''}>CAD ($)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="availabilityDate">Availability / Start Timeline</label>
              <input type="text" id="availabilityDate" name="availabilityDate" value="${escapeHtml(availability)}" placeholder="e.g. Immediately / 2 Weeks" class="form-input" oninput="markFormDirty()" />
            </div>

            <div class="form-group">
              <label class="form-label" for="relocationPreference">Relocation Willingness</label>
              <select id="relocationPreference" name="relocationPreference" class="form-select" onchange="markFormDirty()">
                <option value="REMOTE_ONLY" ${relocationPref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                <option value="WILLING_TO_RELOCATE" ${relocationPref === 'WILLING_TO_RELOCATE' ? 'selected' : ''}>Willing to Relocate</option>
                <option value="NOT_WILLING" ${relocationPref === 'NOT_WILLING' ? 'selected' : ''}>Not Willing to Relocate</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Bottom Save Button -->
        <div style="display: flex; justify-content: flex-end; padding: 1rem 0 0.5rem 0; border-top: 1px solid rgba(255,255,255,0.08);">
          <button type="submit" class="btn btn-primary" style="padding: 0.5rem 1.5rem; font-weight: 700;">💾 Save Profile</button>
        </div>

        <!-- Sticky Save Action Bar -->
        <div id="stickySaveBar" class="sticky-save-bar">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span style="font-size: 1.1rem;">💾</span>
            <div>
              <strong style="color: #f8fafc; font-size: 0.88rem;">Unsaved Changes</strong>
              <div style="color: #94a3b8; font-size: 0.75rem;">You have pending profile adjustments.</div>
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="discardChanges()">Discard</button>
            <button type="submit" class="btn btn-primary btn-sm" style="padding: 0.4rem 1.25rem; font-weight: 700;">Save All Changes</button>
          </div>
        </div>
      </form>
    </div>

    <!-- ================================================================= -->
    <!-- INTERACTIVE MODALS                                                -->
    <!-- ================================================================= -->

    <!-- Experience Modal -->
    <div id="experienceModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="expModalTitle">Add Experience</h3>
          <button type="button" class="modal-close-btn" onclick="closeExperienceModal()">×</button>
        </div>
        <form id="expForm" onsubmit="saveExperienceModal(event)">
          <input type="hidden" id="expEditIndex" value="-1" />
          <div class="form-group">
            <label class="form-label" for="expCompany">Company Name <span style="color: #ef4444;">*</span></label>
            <input type="text" id="expCompany" class="form-input" required placeholder="e.g. FTV Saloon" />
          </div>
          <div class="form-group">
            <label class="form-label" for="expTitle">Job Title <span style="color: #ef4444;">*</span></label>
            <input type="text" id="expTitle" class="form-input" required placeholder="e.g. Full Stack Developer Intern" />
          </div>
          <div class="modal-grid-2col">
            <div class="form-group">
              <label class="form-label" for="expType">Employment Type</label>
              <select id="expType" class="form-select">
                <option value="FULL_TIME">Full-time</option>
                <option value="INTERNSHIP">Internship</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="FREELANCE">Freelance</option>
                <option value="CO_OP">Co-op</option>
                <option value="VOLUNTEER">Volunteer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="expLocation">Location</label>
              <input type="text" id="expLocation" class="form-input" placeholder="e.g. Lucknow, India" />
            </div>
          </div>
          <div class="modal-grid-2col">
            <div class="form-group">
              <label class="form-label" for="expStartDate">Start Month/Year</label>
              <input type="text" id="expStartDate" class="form-input" placeholder="e.g. 2024-06 or June 2024" />
            </div>
            <div class="form-group">
              <label class="form-label" for="expEndDate">End Month/Year</label>
              <input type="text" id="expEndDate" class="form-input" placeholder="e.g. 2024-09 or Sept 2024" />
            </div>
          </div>
          <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="expIsCurrent" onchange="document.getElementById('expEndDate').disabled = this.checked;" />
            <label for="expIsCurrent" style="font-size: 0.82rem; color: #cbd5e1; cursor: pointer;">Currently working here</label>
          </div>
          <div class="form-group">
            <label class="form-label" for="expBullets">Key Responsibilities / Accomplishments (One per line)</label>
            <textarea id="expBullets" rows="3" class="form-textarea" placeholder="Built responsive user interfaces with React and REST APIs..."></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeExperienceModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Experience</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Education Modal -->
    <div id="educationModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="eduModalTitle">Add Education</h3>
          <button type="button" class="modal-close-btn" onclick="closeEducationModal()">×</button>
        </div>
        <form id="eduForm" onsubmit="saveEducationModal(event)">
          <input type="hidden" id="eduEditIndex" value="-1" />
          <div class="form-group">
            <label class="form-label" for="eduInstitution">Institution / University <span style="color: #ef4444;">*</span></label>
            <input type="text" id="eduInstitution" class="form-input" required placeholder="e.g. Rajkiya Engineering College" />
          </div>
          <div class="modal-grid-edu">
            <div class="form-group">
              <label class="form-label" for="eduDegree">Degree Name</label>
              <input type="text" id="eduDegree" class="form-input" placeholder="e.g. Bachelor of Technology" />
            </div>
            <div class="form-group">
              <label class="form-label" for="eduType">Degree Type</label>
              <select id="eduType" class="form-select">
                <option value="BACHELOR">Bachelor</option>
                <option value="MASTER">Master</option>
                <option value="DOCTORATE">Doctorate</option>
                <option value="ASSOCIATE">Associate</option>
                <option value="DIPLOMA">Diploma</option>
                <option value="BOOTCAMP">Bootcamp</option>
                <option value="COURSEWORK">Coursework</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div class="modal-grid-2col">
            <div class="form-group">
              <label class="form-label" for="eduField">Field of Study</label>
              <input type="text" id="eduField" class="form-input" placeholder="e.g. Electronics Engineering" />
            </div>
            <div class="form-group">
              <label class="form-label" for="eduLocation">Location</label>
              <input type="text" id="eduLocation" class="form-input" placeholder="e.g. Sonbhadra, India" />
            </div>
          </div>
          <div class="modal-grid-2col">
            <div class="form-group">
              <label class="form-label" for="eduStartDate">Start Date</label>
              <input type="text" id="eduStartDate" class="form-input" placeholder="e.g. 2021-06" />
            </div>
            <div class="form-group">
              <label class="form-label" for="eduEndDate">Graduation Date</label>
              <input type="text" id="eduEndDate" class="form-input" placeholder="e.g. 2025-07" />
            </div>
          </div>
          <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="checkbox" id="eduIsCurrent" onchange="document.getElementById('eduEndDate').disabled = this.checked;" />
            <label for="eduIsCurrent" style="font-size: 0.82rem; color: #cbd5e1; cursor: pointer;">Currently enrolled / pursuing</label>
          </div>
          <div class="form-group">
            <label class="form-label" for="eduCoursework">Key Coursework / Subjects (Comma separated)</label>
            <input type="text" id="eduCoursework" class="form-input" placeholder="e.g. Data Structures & Algorithms, DBMS, Operating Systems" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeEducationModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Education</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Current Employment Modal -->
    <div id="currentEmploymentModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Set Current Active Employment</h3>
          <button type="button" class="modal-close-btn" onclick="closeCurrentEmploymentModal()">×</button>
        </div>
        <form onsubmit="saveCurrentEmploymentModal(event)">
          <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
            <input type="checkbox" id="ceActiveToggle" checked onchange="toggleCurrentEmpFields(this.checked)" />
            <label for="ceActiveToggle" style="font-size: 0.85rem; font-weight: 600; color: #f8fafc; cursor: pointer;">I am currently employed</label>
          </div>
          <div id="ceFieldsGroup">
            <div class="form-group">
              <label class="form-label" for="ceCompany">Employer Company <span style="color: #ef4444;">*</span></label>
              <input type="text" id="ceCompany" class="form-input" placeholder="e.g. Tech Corp" />
            </div>
            <div class="form-group">
              <label class="form-label" for="ceTitle">Role Title <span style="color: #ef4444;">*</span></label>
              <input type="text" id="ceTitle" class="form-input" placeholder="e.g. Backend Engineer" />
            </div>
            <div class="modal-grid-2col">
              <div class="form-group">
                <label class="form-label" for="ceType">Employment Type</label>
                <select id="ceType" class="form-select">
                  <option value="FULL_TIME">Full-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="INTERNSHIP">Internship</option>
                  <option value="FREELANCE">Freelance</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="ceStartDate">Start Date</label>
                <input type="text" id="ceStartDate" class="form-input" placeholder="e.g. 2025-06" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCurrentEmploymentModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Confirm Status</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Certification Modal -->
    <div id="certModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="certModalTitle">Add Certification</h3>
          <button type="button" class="modal-close-btn" onclick="closeCertModal()">×</button>
        </div>
        <form onsubmit="saveCertModal(event)">
          <input type="hidden" id="certEditIndex" value="-1" />
          <div class="form-group">
            <label class="form-label" for="certName">Certificate Name <span style="color: #ef4444;">*</span></label>
            <input type="text" id="certName" class="form-input" required placeholder="e.g. AWS Certified Developer" />
          </div>
          <div class="form-group">
            <label class="form-label" for="certIssuer">Issuing Organization</label>
            <input type="text" id="certIssuer" class="form-input" placeholder="e.g. Amazon Web Services" />
          </div>
          <div class="modal-grid-2col">
            <div class="form-group">
              <label class="form-label" for="certDate">Issue Date</label>
              <input type="text" id="certDate" class="form-input" placeholder="e.g. 2024-05" />
            </div>
            <div class="form-group">
              <label class="form-label" for="certId">Credential ID</label>
              <input type="text" id="certId" class="form-input" placeholder="e.g. AWS-94812" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="certUrl">Credential URL</label>
            <input type="url" id="certUrl" class="form-input" placeholder="https://..." />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCertModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Certificate</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Language Modal -->
    <div id="langModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Add Language</h3>
          <button type="button" class="modal-close-btn" onclick="closeLangModal()">×</button>
        </div>
        <form onsubmit="saveLangModal(event)">
          <div class="form-group">
            <label class="form-label" for="langName">Language <span style="color: #ef4444;">*</span></label>
            <input type="text" id="langName" class="form-input" required placeholder="e.g. English / Hindi" />
          </div>
          <div class="form-group">
            <label class="form-label" for="langProf">Proficiency Level</label>
            <select id="langProf" class="form-select">
              <option value="NATIVE">Native / Bilingual</option>
              <option value="FLUENT">Fluent</option>
              <option value="PROFESSIONAL" selected>Professional Working</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="BASIC">Basic</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeLangModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Language</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Link Modal -->
    <div id="linkModal" class="modal-backdrop">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Add Portfolio Link</h3>
          <button type="button" class="modal-close-btn" onclick="closeLinkModal()">×</button>
        </div>
        <form onsubmit="saveLinkModal(event)">
          <div class="form-group">
            <label class="form-label" for="linkPlatform">Platform / Label</label>
            <input type="text" id="linkPlatform" class="form-input" placeholder="e.g. GitHub / LinkedIn / Portfolio" />
          </div>
          <div class="form-group">
            <label class="form-label" for="linkUrl">Full URL <span style="color: #ef4444;">*</span></label>
            <input type="url" id="linkUrl" class="form-input" required placeholder="https://..." />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeLinkModal()">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Link</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Client-Side State Controller & Interactive Scripts -->
    <script>
      function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      window.__INITIAL_PROFILE__ = ${JSON.stringify(initialProfileState)};
      let profileState = JSON.parse(JSON.stringify(window.__INITIAL_PROFILE__));
      let lastSavedState = JSON.parse(JSON.stringify(window.__INITIAL_PROFILE__));
      let isFormDirty = false;
      let currentVersion = null;
      let saveAbortController = null;

      function markFormDirty() {
        isFormDirty = true;
        document.getElementById('stickySaveBar').classList.add('visible');
        const dirtyEl = document.getElementById('dirtyIndicator');
        if (dirtyEl) dirtyEl.style.display = 'inline';
      }

      function discardChanges() {
        if (confirm('Discard all unsaved profile modifications and reload?')) {
          profileState = JSON.parse(JSON.stringify(lastSavedState));
          isFormDirty = false;
          document.getElementById('stickySaveBar').classList.remove('visible');
          const dirtyEl = document.getElementById('dirtyIndicator');
          if (dirtyEl) dirtyEl.style.display = 'none';
          renderAllSections();
        }
      }

      function renderAllSections() {
        renderExperiences();
        renderEducation();
        renderCertifications();
        renderLanguages();
        renderLinks();
        renderAdditionalSkills();
      }

      window.addEventListener('beforeunload', function(e) {
        if (isFormDirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      function updateSaveStatus(status) {
        const el = document.getElementById('saveStatus');
        if (!el) return;
        if (status === 'saving') {
          el.textContent = 'Saving...';
          el.style.color = '#fbbf24';
          el.style.display = 'inline';
        } else if (status === 'saved') {
          el.textContent = '\u2713 Saved';
          el.style.color = '#34d399';
          el.style.display = 'inline';
          setTimeout(() => { el.style.display = 'none'; }, 2500);
        } else if (status === 'error') {
          el.textContent = '\u26A0 Save failed';
          el.style.color = '#ef4444';
          el.style.display = 'inline';
        } else {
          el.style.display = 'none';
        }
      }

      function buildSavePayload() {
        return {
          sections: {
            identity: {
              displayName: document.getElementById('displayName').value,
              headline: document.getElementById('headline').value,
              summary: document.getElementById('summary').value,
              currentRole: document.getElementById('currentRole').value,
              location: document.getElementById('location').value,
              careerStatus: document.getElementById('careerStatus').value,
            },
            currentEmployment: profileState.currentEmployment,
            experience: profileState.experiences || [],
            education: profileState.education || [],
            certifications: profileState.certifications || [],
            languages: profileState.languages || [],
            portfolioLinks: profileState.portfolioLinks || [],
            preferences: {
              targetRoles: (document.getElementById('targetRolesHidden').value || '').split(',').map(s => s.trim()).filter(Boolean),
              preferredLocations: (document.getElementById('preferredLocationsHidden').value || '').split(',').map(s => s.trim()).filter(Boolean),
              remotePreference: document.getElementById('remotePreference').value,
              salaryFloor: document.getElementById('salaryFloor').value || null,
              salaryCurrency: document.getElementById('salaryCurrency').value,
              availabilityDate: document.getElementById('availabilityDate').value,
              relocationPreference: document.getElementById('relocationPreference').value,
            },
            additionalSkills: additionalSkillsData.map(s => ({
              catalogSkillId: s.catalogSkillId || s.skillId,
              proficiency: s.proficiency,
              usageContext: s.usageContext || null,
              notes: s.notes || null,
            })),
          },
        };
      }

      async function saveProfileAjax() {
        if (saveAbortController) saveAbortController.abort();
        saveAbortController = new AbortController();

        updateSaveStatus('saving');
        const csrfToken = document.querySelector('input[name="_csrf"]').value;

        try {
          const payload = buildSavePayload();
          const response = await fetch('/api/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
            signal: saveAbortController.signal,
          });

          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }

          const result = await response.json();
          if (result.ok) {
            // Sync local state with saved state
            profileState.additionalSkills = JSON.parse(JSON.stringify(additionalSkillsData));
            lastSavedState = JSON.parse(JSON.stringify(profileState));
            currentVersion = result.updatedAt;
            isFormDirty = false;
            document.getElementById('stickySaveBar').classList.remove('visible');
            const dirtyEl = document.getElementById('dirtyIndicator');
            if (dirtyEl) dirtyEl.style.display = 'none';
            updateSaveStatus('saved');
          } else {
            throw new Error('Server reported failure');
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error('Profile save failed:', err);
          updateSaveStatus('error');
          // Preserve local edits on failure — user can retry
        }
      }

      // Debounce timer for autosave
      let autosaveTimer = null;
      function scheduleAutosave() {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(saveProfileAjax, 800);
      }

      // Override markFormDirty to also schedule autosave
      const _originalMarkFormDirty = markFormDirty;
      markFormDirty = function() {
        _originalMarkFormDirty();
        scheduleAutosave();
      };

      // Synchronize hidden state fields and save via AJAX
      document.getElementById('careerProfileForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveProfileAjax();
      });

      function syncHiddenFields() {
        document.getElementById('experienceHidden').value = JSON.stringify(profileState.experiences || []);
        document.getElementById('educationHidden').value = JSON.stringify(profileState.education || []);
        document.getElementById('certificationsHidden').value = JSON.stringify(profileState.certifications || []);
        document.getElementById('languagesHidden').value = JSON.stringify(profileState.languages || []);
        document.getElementById('portfolioLinksHidden').value = JSON.stringify(profileState.portfolioLinks || []);
        document.getElementById('currentEmploymentHidden').value = JSON.stringify(profileState.currentEmployment);
      }

      // --- EXPERIENCE RENDERING & CRUD ---
      function renderExperiences() {
        const container = document.getElementById('experienceListContainer');
        if (!profileState.experiences || profileState.experiences.length === 0) {
          container.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; font-style: italic;">No work experience entries recorded. Click "+ Add Experience" above.</p>';
          return;
        }

        container.innerHTML = profileState.experiences.map((exp, idx) => {
          const provBadge = exp.provenanceStatus === 'USER_PROVIDED'
            ? '<span class="badge badge-user-provided" style="font-size:0.65rem;">✓ User Provided</span>'
            : exp.provenanceStatus === 'VERIFIED' || exp.provenanceStatus === 'CORROBORATED'
              ? '<span class="badge badge-verified" style="font-size:0.65rem;">✓ Verified</span>'
              : '<span class="badge badge-claimed" style="font-size:0.65rem;">○ Claimed (Resume)</span>';

          const datesText = exp.isCurrent
            ? (exp.startDate || '') + ' — Present'
            : (exp.startDate || '') + (exp.endDate ? ' — ' + exp.endDate : '');

          return \`
            <div class="record-item-card">
              <div class="record-card-header">
                <div>
                  <strong style="color: #f8fafc; font-size: 0.95rem;">\${escapeHtml(exp.title || 'Role')}</strong>
                  <span style="color: #94a3b8; font-size: 0.88rem;"> at <strong>\${escapeHtml(exp.company || 'Company')}</strong></span>
                  <span class="badge" style="font-size: 0.68rem; margin-left: 0.3rem;">\${escapeHtml(exp.employmentType || 'FULL_TIME')}</span>
                  \${provBadge}
                </div>
                <div class="record-card-actions">
                  <button type="button" class="btn-icon-action" onclick="openEditExperienceModal(\${idx})">Edit</button>
                  <button type="button" class="btn-icon-action danger" onclick="deleteExperience(\${idx})">Delete</button>
                </div>
              </div>
              <div style="color: #64748b; font-size: 0.78rem; margin-bottom: 0.4rem;">
                \${escapeHtml(datesText)} \${exp.location ? '• ' + escapeHtml(exp.location) : ''}
              </div>
              \${Array.isArray(exp.bullets) && exp.bullets.length > 0
                ? '<ul style="margin: 0; padding-left: 1.2rem; color: #cbd5e1; font-size: 0.8rem; line-height: 1.4;">' +
                  exp.bullets.map(b => '<li>' + escapeHtml(b) + '</li>').join('') +
                  '</ul>'
                : ''}
            </div>
          \`;
        }).join('');
      }

      function openAddExperienceModal() {
        document.getElementById('expModalTitle').innerText = 'Add Experience';
        document.getElementById('expEditIndex').value = '-1';
        document.getElementById('expCompany').value = '';
        document.getElementById('expTitle').value = '';
        document.getElementById('expType').value = 'FULL_TIME';
        document.getElementById('expLocation').value = '';
        document.getElementById('expStartDate').value = '';
        document.getElementById('expEndDate').value = '';
        document.getElementById('expEndDate').disabled = false;
        document.getElementById('expIsCurrent').checked = false;
        document.getElementById('expBullets').value = '';
        document.getElementById('experienceModal').classList.add('open');
      }

      function openEditExperienceModal(idx) {
        const exp = profileState.experiences[idx];
        if (!exp) return;
        document.getElementById('expModalTitle').innerText = 'Edit Experience';
        document.getElementById('expEditIndex').value = String(idx);
        document.getElementById('expCompany').value = exp.company || '';
        document.getElementById('expTitle').value = exp.title || '';
        document.getElementById('expType').value = exp.employmentType || 'FULL_TIME';
        document.getElementById('expLocation').value = exp.location || '';
        document.getElementById('expStartDate').value = exp.startDate || '';
        document.getElementById('expEndDate').value = exp.endDate || '';
        document.getElementById('expIsCurrent').checked = Boolean(exp.isCurrent);
        document.getElementById('expEndDate').disabled = Boolean(exp.isCurrent);
        document.getElementById('expBullets').value = Array.isArray(exp.bullets) ? exp.bullets.join('\\n') : '';
        document.getElementById('experienceModal').classList.add('open');
      }

      function closeExperienceModal() {
        document.getElementById('experienceModal').classList.remove('open');
      }

      function saveExperienceModal(e) {
        e.preventDefault();
        const idx = parseInt(document.getElementById('expEditIndex').value, 10);
        const bulletsText = document.getElementById('expBullets').value;
        const bullets = bulletsText.split('\\n').map(b => b.trim()).filter(Boolean);

        const record = {
          company: document.getElementById('expCompany').value.trim(),
          title: document.getElementById('expTitle').value.trim(),
          employmentType: document.getElementById('expType').value,
          location: document.getElementById('expLocation').value.trim() || null,
          startDate: document.getElementById('expStartDate').value.trim() || null,
          endDate: document.getElementById('expIsCurrent').checked ? null : (document.getElementById('expEndDate').value.trim() || null),
          isCurrent: document.getElementById('expIsCurrent').checked,
          bullets: bullets,
          provenanceStatus: 'USER_PROVIDED',
        };

        if (idx >= 0 && idx < profileState.experiences.length) {
          profileState.experiences[idx] = record;
        } else {
          profileState.experiences.push(record);
        }

        renderExperiences();
        closeExperienceModal();
        markFormDirty();
      }

      function deleteExperience(idx) {
        if (confirm('Are you sure you want to remove this experience record?')) {
          profileState.experiences.splice(idx, 1);
          renderExperiences();
          markFormDirty();
        }
      }

      // --- EDUCATION RENDERING & CRUD ---
      function renderEducation() {
        const container = document.getElementById('educationListContainer');
        if (!profileState.education || profileState.education.length === 0) {
          container.innerHTML = '<p style="color: #94a3b8; font-size: 0.85rem; font-style: italic;">No education records registered. Click "+ Add Education" above.</p>';
          return;
        }

        container.innerHTML = profileState.education.map((edu, idx) => {
          const statusText = edu.isCurrent || edu.currentlyEnrolled
            ? 'Currently Enrolled'
            : edu.endDate ? 'Graduated ' + edu.endDate : 'Completed';

          const provBadge = edu.provenanceStatus === 'USER_PROVIDED'
            ? '<span class="badge badge-user-provided" style="font-size:0.65rem;">✓ User Provided</span>'
            : '<span class="badge badge-claimed" style="font-size:0.65rem;">○ Claimed (Resume)</span>';

          return \`
            <div class="record-item-card">
              <div class="record-card-header">
                <div>
                  <strong style="color: #f8fafc; font-size: 0.95rem;">\${escapeHtml(edu.degree || 'Degree')}</strong>
                  \${edu.fieldOfStudy ? '<span style="color: #cbd5e1; font-size: 0.88rem;"> in ' + escapeHtml(edu.fieldOfStudy) + '</span>' : ''}
                  <span class="badge" style="font-size: 0.68rem; margin-left: 0.3rem;">\${escapeHtml(edu.degreeType || 'DEGREE')}</span>
                  \${provBadge}
                </div>
                <div class="record-card-actions">
                  <button type="button" class="btn-icon-action" onclick="openEditEducationModal(\${idx})">Edit</button>
                  <button type="button" class="btn-icon-action danger" onclick="deleteEducation(\${idx})">Delete</button>
                </div>
              </div>
              <div style="color: #94a3b8; font-size: 0.82rem;">
                <strong>\${escapeHtml(edu.institution || '')}</strong> \${edu.location ? '• ' + escapeHtml(edu.location) : ''}
              </div>
              <div style="color: #64748b; font-size: 0.75rem; margin-top: 0.15rem;">
                \${escapeHtml(statusText)}
              </div>
              \${Array.isArray(edu.coursework) && edu.coursework.length > 0
                ? '<div style="margin-top: 0.4rem; display: flex; flex-wrap: wrap; gap: 0.25rem;">' +
                  edu.coursework.map(c => '<span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.04);">' + escapeHtml(c) + '</span>').join('') +
                  '</div>'
                : ''}
            </div>
          \`;
        }).join('');
      }

      function openAddEducationModal() {
        document.getElementById('eduModalTitle').innerText = 'Add Education';
        document.getElementById('eduEditIndex').value = '-1';
        document.getElementById('eduInstitution').value = '';
        document.getElementById('eduDegree').value = '';
        document.getElementById('eduType').value = 'BACHELOR';
        document.getElementById('eduField').value = '';
        document.getElementById('eduLocation').value = '';
        document.getElementById('eduStartDate').value = '';
        document.getElementById('eduEndDate').value = '';
        document.getElementById('eduIsCurrent').checked = false;
        document.getElementById('eduEndDate').disabled = false;
        document.getElementById('eduCoursework').value = '';
        document.getElementById('educationModal').classList.add('open');
      }

      function openEditEducationModal(idx) {
        const edu = profileState.education[idx];
        if (!edu) return;
        document.getElementById('eduModalTitle').innerText = 'Edit Education';
        document.getElementById('eduEditIndex').value = String(idx);
        document.getElementById('eduInstitution').value = edu.institution || '';
        document.getElementById('eduDegree').value = edu.degree || '';
        document.getElementById('eduType').value = edu.degreeType || 'BACHELOR';
        document.getElementById('eduField').value = edu.fieldOfStudy || '';
        document.getElementById('eduLocation').value = edu.location || '';
        document.getElementById('eduStartDate').value = edu.startDate || '';
        document.getElementById('eduEndDate').value = edu.endDate || '';
        document.getElementById('eduIsCurrent').checked = Boolean(edu.isCurrent || edu.currentlyEnrolled);
        document.getElementById('eduEndDate').disabled = Boolean(edu.isCurrent || edu.currentlyEnrolled);
        document.getElementById('eduCoursework').value = Array.isArray(edu.coursework) ? edu.coursework.join(', ') : '';
        document.getElementById('educationModal').classList.add('open');
      }

      function closeEducationModal() {
        document.getElementById('educationModal').classList.remove('open');
      }

      function saveEducationModal(e) {
        e.preventDefault();
        const idx = parseInt(document.getElementById('eduEditIndex').value, 10);
        const cwText = document.getElementById('eduCoursework').value;
        const coursework = cwText.split(',').map(s => s.trim()).filter(Boolean);

        const record = {
          institution: document.getElementById('eduInstitution').value.trim(),
          degree: document.getElementById('eduDegree').value.trim() || null,
          degreeType: document.getElementById('eduType').value,
          fieldOfStudy: document.getElementById('eduField').value.trim() || null,
          location: document.getElementById('eduLocation').value.trim() || null,
          startDate: document.getElementById('eduStartDate').value.trim() || null,
          endDate: document.getElementById('eduIsCurrent').checked ? null : (document.getElementById('eduEndDate').value.trim() || null),
          isCurrent: document.getElementById('eduIsCurrent').checked,
          currentlyEnrolled: document.getElementById('eduIsCurrent').checked,
          coursework: coursework,
          provenanceStatus: 'USER_PROVIDED',
        };

        if (idx >= 0 && idx < profileState.education.length) {
          profileState.education[idx] = record;
        } else {
          profileState.education.push(record);
        }

        renderEducation();
        closeEducationModal();
        markFormDirty();
      }

      function deleteEducation(idx) {
        if (confirm('Are you sure you want to delete this education record?')) {
          profileState.education.splice(idx, 1);
          renderEducation();
          markFormDirty();
        }
      }

      // --- CURRENT EMPLOYMENT MODAL ---
      function openCurrentEmploymentModal() {
        const ce = profileState.currentEmployment;
        if (ce) {
          document.getElementById('ceActiveToggle').checked = true;
          toggleCurrentEmpFields(true);
          document.getElementById('ceCompany').value = ce.company || '';
          document.getElementById('ceTitle').value = ce.title || '';
          document.getElementById('ceType').value = ce.employmentType || 'FULL_TIME';
          document.getElementById('ceStartDate').value = ce.startDate || '';
        } else {
          document.getElementById('ceActiveToggle').checked = false;
          toggleCurrentEmpFields(false);
          document.getElementById('ceCompany').value = '';
          document.getElementById('ceTitle').value = '';
          document.getElementById('ceStartDate').value = '';
        }
        document.getElementById('currentEmploymentModal').classList.add('open');
      }

      function closeCurrentEmploymentModal() {
        document.getElementById('currentEmploymentModal').classList.remove('open');
      }

      function toggleCurrentEmpFields(active) {
        document.getElementById('ceFieldsGroup').style.display = active ? 'block' : 'none';
      }

      function saveCurrentEmploymentModal(e) {
        e.preventDefault();
        const active = document.getElementById('ceActiveToggle').checked;
        if (!active) {
          profileState.currentEmployment = null;
        } else {
          const comp = document.getElementById('ceCompany').value.trim();
          const title = document.getElementById('ceTitle').value.trim();
          if (!comp || !title) {
            alert('Please specify both company and title, or uncheck "I am currently employed".');
            return;
          }
          profileState.currentEmployment = {
            company: comp,
            title: title,
            employmentType: document.getElementById('ceType').value,
            startDate: document.getElementById('ceStartDate').value.trim() || null,
            isCurrent: true,
          };
        }

        updateCurrentEmploymentDisplay();
        closeCurrentEmploymentModal();
        markFormDirty();
      }

      function updateCurrentEmploymentDisplay() {
        const textElem = document.getElementById('currentEmploymentText');
        const ce = profileState.currentEmployment;
        if (ce) {
          textElem.innerHTML = '<span>💼 <strong>' + escapeHtml(ce.title) + '</strong> at ' + escapeHtml(ce.company) + ' <span class="badge" style="font-size:0.68rem; margin-left:0.3rem;">' + escapeHtml(ce.employmentType || 'FULL_TIME') + '</span></span>';
        } else {
          textElem.innerHTML = '<span style="color: #94a3b8;">○ Not currently employed (Job Seeking / Student / Independent)</span>';
        }
      }

      // --- CERTIFICATIONS CRUD ---
      function renderCertifications() {
        const container = document.getElementById('certificationsListContainer');
        if (!profileState.certifications || profileState.certifications.length === 0) {
          container.innerHTML = '<p style="color: #64748b; font-size: 0.78rem; font-style: italic;">No certifications added.</p>';
          return;
        }

        container.innerHTML = profileState.certifications.map((cert, idx) => {
          const certName = typeof cert === 'object' ? cert.name : cert;
          const certIssuer = typeof cert === 'object' && cert.issuer ? cert.issuer : '';
          const certUrl = typeof cert === 'object' && cert.credentialUrl ? cert.credentialUrl : '';

          return \`
            <div style="background: rgba(11, 15, 25, 0.4); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <div>
                <strong style="color: #f8fafc;">\${escapeHtml(certName)}</strong>
                \${certIssuer ? '<div style="color: #94a3b8; font-size: 0.72rem;">' + escapeHtml(certIssuer) + '</div>' : ''}
              </div>
              <div style="display: flex; gap: 0.3rem;">
                \${certUrl ? '<a href="' + escapeHtml(certUrl) + '" target="_blank" class="btn-icon-action" style="text-decoration:none;">View</a>' : ''}
                <button type="button" class="btn-icon-action danger" onclick="deleteCert(\${idx})">×</button>
              </div>
            </div>
          \`;
        }).join('');
      }

      function openAddCertModal() {
        document.getElementById('certName').value = '';
        document.getElementById('certIssuer').value = '';
        document.getElementById('certDate').value = '';
        document.getElementById('certId').value = '';
        document.getElementById('certUrl').value = '';
        document.getElementById('certModal').classList.add('open');
      }

      function closeCertModal() {
        document.getElementById('certModal').classList.remove('open');
      }

      function saveCertModal(e) {
        e.preventDefault();
        const record = {
          name: document.getElementById('certName').value.trim(),
          issuer: document.getElementById('certIssuer').value.trim() || null,
          issueDate: document.getElementById('certDate').value.trim() || null,
          credentialId: document.getElementById('certId').value.trim() || null,
          credentialUrl: document.getElementById('certUrl').value.trim() || null,
          provenanceStatus: 'USER_PROVIDED',
        };
        profileState.certifications.push(record);
        renderCertifications();
        closeCertModal();
        markFormDirty();
      }

      function deleteCert(idx) {
        profileState.certifications.splice(idx, 1);
        renderCertifications();
        markFormDirty();
      }

      // --- LANGUAGES CRUD ---
      function renderLanguages() {
        const container = document.getElementById('languagesListContainer');
        if (!profileState.languages || profileState.languages.length === 0) {
          container.innerHTML = '<p style="color: #64748b; font-size: 0.78rem; font-style: italic;">No languages added.</p>';
          return;
        }

        container.innerHTML = profileState.languages.map((lang, idx) => {
          const langName = typeof lang === 'object' ? lang.language : lang;
          const langProf = typeof lang === 'object' && lang.proficiency ? lang.proficiency : 'PROFESSIONAL';

          return \`
            <div style="background: rgba(11, 15, 25, 0.4); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
              <div>
                <strong style="color: #f8fafc;">\${escapeHtml(langName)}</strong>
                <span class="badge" style="font-size: 0.65rem; margin-left: 0.3rem;">\${escapeHtml(langProf)}</span>
              </div>
              <button type="button" class="btn-icon-action danger" onclick="deleteLang(\${idx})">×</button>
            </div>
          \`;
        }).join('');
      }

      function openAddLangModal() {
        document.getElementById('langName').value = '';
        document.getElementById('langProf').value = 'PROFESSIONAL';
        document.getElementById('langModal').classList.add('open');
      }

      function closeLangModal() {
        document.getElementById('langModal').classList.remove('open');
      }

      function saveLangModal(e) {
        e.preventDefault();
        const record = {
          language: document.getElementById('langName').value.trim(),
          proficiency: document.getElementById('langProf').value,
          provenanceStatus: 'USER_PROVIDED',
        };
        profileState.languages.push(record);
        renderLanguages();
        closeLangModal();
        markFormDirty();
      }

      function deleteLang(idx) {
        profileState.languages.splice(idx, 1);
        renderLanguages();
        markFormDirty();
      }

      // --- PORTFOLIO LINKS CRUD ---
      function renderLinks() {
        const container = document.getElementById('portfolioLinksContainer');
        if (!profileState.portfolioLinks || profileState.portfolioLinks.length === 0) {
          container.innerHTML = '<span style="color: #64748b; font-size: 0.78rem; font-style: italic;">No portfolio links recorded.</span>';
          return;
        }

        container.innerHTML = profileState.portfolioLinks.map((link, idx) => {
          return \`
            <span class="selected-chip" style="font-size: 0.75rem;">
              <strong>\${escapeHtml(link.label || 'LINK')}:</strong>
              <a href="\${escapeHtml(link.url)}" target="_blank" style="color: #e0e7ff; text-decoration: underline;">\${escapeHtml(link.url.replace(/^https?:\\/\\//, ''))}</a>
              <span class="chip-remove-btn" onclick="deleteLink(\${idx})">×</span>
            </span>
          \`;
        }).join('');
      }

      function openAddLinkModal() {
        document.getElementById('linkPlatform').value = '';
        document.getElementById('linkUrl').value = '';
        document.getElementById('linkModal').classList.add('open');
      }

      function closeLinkModal() {
        document.getElementById('linkModal').classList.remove('open');
      }

      function saveLinkModal(e) {
        e.preventDefault();
        const url = document.getElementById('linkUrl').value.trim();
        let label = document.getElementById('linkPlatform').value.trim().toUpperCase();
        if (!label) {
          if (url.includes('github.com')) label = 'GITHUB';
          else if (url.includes('linkedin.com')) label = 'LINKEDIN';
          else if (url.includes('leetcode.com')) label = 'LEETCODE';
          else label = 'PORTFOLIO';
        }

        profileState.portfolioLinks.push({ label, url });
        renderLinks();
        closeLinkModal();
        markFormDirty();
      }

      function deleteLink(idx) {
        profileState.portfolioLinks.splice(idx, 1);
        renderLinks();
        markFormDirty();
      }

      // --- CHIPS INPUT CONTROLLER (TARGET ROLES & LOCATIONS) ---
      function initChipsInput(containerId, inputId, hiddenId) {
        const container = document.getElementById(containerId);
        const input = document.getElementById(inputId);
        const hidden = document.getElementById(hiddenId);

        function renderChips() {
          const values = hidden.value.split(',').map(s => s.trim()).filter(Boolean);
          const oldChips = container.querySelectorAll('.selected-chip');
          oldChips.forEach(c => c.remove());

          values.forEach(val => {
            const chip = document.createElement('span');
            chip.className = 'selected-chip';
            chip.innerHTML = escapeHtml(val) + '<span class="chip-remove-btn">×</span>';
            chip.querySelector('.chip-remove-btn').addEventListener('click', function(e) {
              e.stopPropagation();
              removeValue(val);
            });
            container.insertBefore(chip, input);
          });
        }

        function addValue(val) {
          val = val.trim();
          if (!val) return;
          const current = hidden.value.split(',').map(s => s.trim()).filter(Boolean);
          if (!current.includes(val)) {
            current.push(val);
            hidden.value = current.join(',');
            renderChips();
            markFormDirty();
          }
          input.value = '';
        }

        function removeValue(val) {
          const current = hidden.value.split(',').map(s => s.trim()).filter(Boolean);
          const filtered = current.filter(v => v !== val);
          hidden.value = filtered.join(',');
          renderChips();
          markFormDirty();
        }

        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addValue(input.value);
          } else if (e.key === 'Backspace' && !input.value) {
            const current = hidden.value.split(',').map(s => s.trim()).filter(Boolean);
            if (current.length > 0) {
              removeValue(current[current.length - 1]);
            }
          }
        });

        renderChips();
        return { addValue, removeValue };
      }

      const rolesController = initChipsInput('targetRolesContainer', 'targetRolesInput', 'targetRolesHidden');
      const locationsController = initChipsInput('preferredLocationsContainer', 'preferredLocationsInput', 'preferredLocationsHidden');

      function addSuggestedRole(role) {
        rolesController.addValue(role);
      }

      function addSuggestedLocation(loc) {
        locationsController.addValue(loc);
      }

      function applyAllAiSuggestions() {
        ${recommendedRoles.map((r) => `rolesController.addValue('${escapeHtml(r)}');`).join('\n')}
        locationsController.addValue('Remote');
        locationsController.addValue('India');
      }

      function handleCareerStatusChange() {
        const val = document.getElementById('careerStatus').value;
        if (val === 'EMPLOYED' && !profileState.currentEmployment) {
          openCurrentEmploymentModal();
        }
      }

      // ================================================================
      // Additional Skills Management — LOCAL STATE (no server calls)
      // ================================================================
      let additionalSkillsData = profileState.additionalSkills || [];
      let allCatalogSkills = profileState.skillCatalogItems || [];
      let catalogCategories = profileState.skillCatalogCategories || [];
      let selectedCatalogSkill = null;
      let _localSkillIdCounter = 10000;

      /* eslint-disable no-useless-escape */
      // --- Additional Skills Rendering (local state only) ---
      function renderAdditionalSkills() {
        const container = document.getElementById('additionalSkillsContainer');
        if (!container) return;

        if (additionalSkillsData.length === 0) {
          container.innerHTML = '<div style="color: #64748b; font-size: 0.82rem; font-style: italic; padding: 0.5rem 0;">No additional skills declared yet. Click "Add Skill" to get started.</div>';
          return;
        }

        const proficiencyColors = {
          BASIC: { bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.2)', text: '#fbbf24' },
          WORKING_KNOWLEDGE: { bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.2)', text: '#60a5fa' },
          PROFICIENT: { bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.2)', text: '#34d399' },
          ADVANCED: { bg: 'rgba(167, 139, 250, 0.1)', border: 'rgba(167, 139, 250, 0.2)', text: '#a78bfa' },
          CURRENTLY_LEARNING: { bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.2)', text: '#fb923c' },
        };

        container.innerHTML = '<div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
          ' + additionalSkillsData.map(s => {
            const pColor = proficiencyColors[s.proficiency] || proficiencyColors.WORKING_KNOWLEDGE;
            const provLabel = s.provenanceStatus === 'LEARNING' ? '📖 Learning' : '○ Self-Declared';
            return '<span class="skill-tag-badge" style="background: ' + pColor.bg + '; color: ' + pColor.text + '; border: 1px solid ' + pColor.border + '; font-size: 0.78rem; padding: 0.35rem 0.6rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.3rem; cursor: default;" title="Proficiency: ' + escapeHtml(s.proficiency) + ' | Status: ' + provLabel + (s.notes ? ' | ' + escapeHtml(s.notes) : '') + '">
              <strong>' + escapeHtml(s.skillName) + '</strong>
              <span style="font-size: 0.68rem; opacity: 0.8;">' + escapeHtml(s.proficiency.replace(/_/g, ' ')) + '</span>
              <button onclick="removeAdditionalSkill(\'' + s.id + '\')" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 0.8rem; padding: 0; margin-left: 0.2rem; opacity: 0.6;" title="Remove">×</button>
            </span>';
          }).join('') + '
        </div>';
      }

      function removeAdditionalSkill(skillId) {
        if (!confirm('Remove this skill from your additional skills?')) return;
        additionalSkillsData = additionalSkillsData.filter(s => s.id !== skillId);
        renderAdditionalSkills();
        markFormDirty();
      }

      // --- Skill Catalog Modal — ENTIRELY CLIENT-SIDE ---
      function openSkillCatalogModal() {
        const modal = document.getElementById('skillCatalogModal');
        if (!modal) return;
        modal.style.display = 'flex';
        document.getElementById('catalogSearchInput').value = '';
        document.getElementById('addSkillForm').style.display = 'none';
        document.getElementById('catalogBrowseArea').style.display = 'block';
        document.getElementById('catalogSkillsList').innerHTML = '';
        renderCatalogCategories();
      }

      function closeSkillCatalogModal() {
        const modal = document.getElementById('skillCatalogModal');
        if (modal) modal.style.display = 'none';
        selectedCatalogSkill = null;
      }

      function renderCatalogCategories() {
        const container = document.getElementById('catalogCategoriesList');
        if (!container) return;

        const categoryLabels = {
          CLOUD: '☁️ Cloud & Infrastructure',
          CONTAINERS: '📦 Containers & IaC',
          CICD: '🔄 CI/CD & GitOps',
          DATABASES: '🗄️ Databases / Cache / Search',
          MESSAGING: '📨 Messaging & Events',
          NETWORKING: '🌐 Networking',
          OBSERVABILITY: '📊 Observability / Reliability',
          SECURITY: '🔐 Security / Identity',
          ARCHITECTURE: '🏗️ Software Architecture',
          DEVELOPMENT: '💻 Development / Testing',
          AI_DEVELOPMENT: '🤖 AI-Assisted Development',
          GENAI: '🧠 Generative AI',
          AI_AGENTS: 'Agent AI',
          MCP: '🔌 MCP / AI Interop',
          AI_QUALITY: '✅ AI Evaluation / Quality',
          MLOPS: '⚙️ MLOps / AI Platform',
          DX: '🚀 Developer Experience',
          PRACTICES: '📋 Engineering Practices',
        };

        container.innerHTML = catalogCategories.map(cat =>
          '<button type="button" class="btn btn-secondary" style="font-size: 0.78rem; padding: 0.4rem 0.8rem; text-align: left; width: 100%;" onclick="loadCatalogByCategory(\'' + escapeHtml(cat.category) + '\')">
            ' + (categoryLabels[cat.category] || escapeHtml(cat.category)) + ' <span style="color: #64748b; font-size: 0.7rem;">(' + cat.count + ')</span>
          </button>'
        ).join('');
      }

      function loadCatalogByCategory(category) {
        // LOCAL filter — no network call
        const existingSlugs = new Set(additionalSkillsData.map(s => s.skillSlug));
        const filtered = allCatalogSkills
          .filter(s => s.category === category && !existingSlugs.has(s.slug))
          .slice(0, 100);
        _showCatalogResults(filtered, category);
      }

      function searchCatalogSkills(query) {
        if (!query || query.length < 2) {
          document.getElementById('catalogSkillsList').innerHTML = '';
          return;
        }
        // LOCAL search — normalize and match
        const q = query.toLowerCase().trim();
        const existingSlugs = new Set(additionalSkillsData.map(s => s.skillSlug));
        const results = allCatalogSkills
          .filter(s => {
            if (existingSlugs.has(s.slug)) return false;
            const name = (s.canonicalName || '').toLowerCase();
            const slug = (s.slug || '').toLowerCase();
            const aliases = Array.isArray(s.aliases) ? s.aliases.map(a => a.toLowerCase()) : [];
            return name.includes(q) || slug.includes(q) || aliases.some(a => a.includes(q));
          })
          .slice(0, 30);
        _showCatalogResults(results, 'Search: ' + query);
      }

      function _showCatalogResults(skills, label) {
        const container = document.getElementById('catalogSkillsList');
        if (!container) return;
        const items = skills.map(skill => {
          const sid = JSON.stringify(skill.id);
          const sname = JSON.stringify(escapeHtml(skill.canonicalName));
          const scat = JSON.stringify(escapeHtml(skill.category));
          return '<button type="button" class="btn btn-secondary" style="font-size: 0.78rem; padding: 0.4rem 0.8rem; text-align: left; width: 100%; display: flex; justify-content: space-between; align-items: center;" onclick="selectCatalogSkill(' + sid + ', ' + sname + ', ' + scat + ')">
              <span><strong>' + escapeHtml(skill.canonicalName) + '</strong> <span style="color: #64748b; font-size: 0.7rem;">' + escapeHtml(skill.category) + '</span></span>
              <span style="color: #34d399; font-size: 0.85rem;">+</span>
            </button>';
        }).join('');
        container.innerHTML = '<div style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 0.5rem;">' + escapeHtml(label) + ' (' + skills.length + ' available)</div>
          <div style="display: flex; flex-direction: column; gap: 0.3rem; max-height: 300px; overflow-y: auto;">
          ' + items + '
        </div>';
      }

      function selectCatalogSkill(skillId, skillName, category) {
        selectedCatalogSkill = { id: skillId, name: skillName, category: category };
        document.getElementById('selectedSkillName').textContent = skillName;
        document.getElementById('addSkillForm').style.display = 'block';
        document.getElementById('catalogBrowseArea').style.display = 'none';
      }

      function confirmAddSkill() {
        if (!selectedCatalogSkill) return;
        const proficiency = document.getElementById('skillProficiency').value;
        const usageContext = document.getElementById('skillUsageContext').value || null;
        const notes = document.getElementById('skillNotes').value || null;
        const isLearning = proficiency === 'CURRENTLY_LEARNING';

        // Add to local state — NO network call
        const newSkill = {
          id: 'local-' + (++_localSkillIdCounter),
          catalogSkillId: selectedCatalogSkill.id,
          skillName: selectedCatalogSkill.name,
          skillSlug: selectedCatalogSkill.name.toLowerCase().replace(/\s+/g, '-'),
          category: selectedCatalogSkill.category,
          proficiency: proficiency,
          provenanceStatus: isLearning ? 'LEARNING' : 'SELF_DECLARED',
          source: 'CANDIDATE_DECLARED',
          usageContext: usageContext,
          notes: notes,
        };
        additionalSkillsData.push(newSkill);
        renderAdditionalSkills();
        closeSkillCatalogModal();
        markFormDirty();
      }

      // Initial page initialization
      renderExperiences();
      renderEducation();
      renderCertifications();
      renderLanguages();
      renderLinks();
      renderAdditionalSkills();
    </script>

    <!-- ================================================================ -->
    <!-- SKILL CATALOG MODAL                                              -->
    <!-- ================================================================ -->
    <div id="skillCatalogModal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); z-index: 1000; justify-content: center; align-items: center; padding: 1rem;">
      <div style="background: #1a1f35; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="color: #f8fafc; font-size: 1.1rem; margin: 0;">Add Skill</h3>
          <button onclick="closeSkillCatalogModal()" style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer;">×</button>
        </div>

        <!-- Search -->
        <div style="margin-bottom: 1rem;">
          <input
            type="text"
            id="catalogSearchInput"
            placeholder="Search skills..."
            style="width: 100%; padding: 0.6rem 0.8rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #f8fafc; font-size: 0.85rem; outline: none;"
            oninput="searchCatalogSkills(this.value)"
          />
        </div>

        <!-- Browse by Category -->
        <div id="catalogBrowseArea">
          <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.5rem;">Browse by Category</div>
          <div id="catalogCategoriesList" style="display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 1rem;"></div>
          <div id="catalogSkillsList"></div>
        </div>

        <!-- Add Skill Form (shown after selection) -->
        <div id="addSkillForm" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="margin-bottom: 0.8rem;">
            <span style="color: #94a3b8; font-size: 0.82rem;">Selected: </span>
            <strong id="selectedSkillName" style="color: #f8fafc; font-size: 0.9rem;"></strong>
            <button onclick="document.getElementById('addSkillForm').style.display='none'; document.getElementById('catalogBrowseArea').style.display='block';" style="background: none; border: none; color: #60a5fa; font-size: 0.78rem; cursor: pointer; margin-left: 0.5rem;">← Change</button>
          </div>

          <div style="margin-bottom: 0.8rem;">
            <label style="display: block; color: #94a3b8; font-size: 0.78rem; margin-bottom: 0.3rem;">Proficiency</label>
            <select id="skillProficiency" style="width: 100%; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #f8fafc; font-size: 0.85rem;">
              <option value="BASIC">Basic</option>
              <option value="WORKING_KNOWLEDGE" selected>Working Knowledge</option>
              <option value="PROFICIENT">Proficient</option>
              <option value="ADVANCED">Advanced</option>
              <option value="CURRENTLY_LEARNING">Currently Learning</option>
            </select>
          </div>

          <div style="margin-bottom: 0.8rem;">
            <label style="display: block; color: #94a3b8; font-size: 0.78rem; margin-bottom: 0.3rem;">Usage Context (optional)</label>
            <select id="skillUsageContext" style="width: 100%; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #f8fafc; font-size: 0.85rem;">
              <option value="">-- Select --</option>
              <option value="PROFESSIONAL_WORK">Professional Work</option>
              <option value="INTERNSHIP">Internship</option>
              <option value="PERSONAL_PROJECT">Personal Project</option>
              <option value="FREELANCE">Freelance</option>
              <option value="ACADEMIC_PROJECT">Academic Project</option>
              <option value="CERTIFICATION">Certification / Training</option>
              <option value="SELF_STUDY">Self-Study</option>
            </select>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; color: #94a3b8; font-size: 0.78rem; margin-bottom: 0.3rem;">Notes (optional)</label>
            <textarea
              id="skillNotes"
              placeholder="How have you used this skill?"
              rows="2"
              style="width: 100%; padding: 0.5rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #f8fafc; font-size: 0.85rem; resize: vertical; outline: none;"
            ></textarea>
          </div>

          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button onclick="closeSkillCatalogModal()" class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.5rem 1rem;">Cancel</button>
            <button onclick="confirmAddSkill()" class="btn btn-primary" style="font-size: 0.82rem; padding: 0.5rem 1rem;">Add Skill</button>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Career Profile & Preferences',
    user,
    tenant,
    currentPath: '/profile',
    content,
  });
}
