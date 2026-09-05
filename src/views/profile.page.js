/**
 * @file Candidate Career Profile & Application Workspace View (P14-004C / ARCH-056 / Redesign).
 *
 * Implements the unified Canonical Career Profile and Application Readiness workspace:
 * 1. Profile Header & Readiness: Candidate identity, status, seniority, readiness metrics, section jump bar
 * 2. Professional Summary & Narrative: Executive summary, persona headline, current role, current employment
 * 3. Contact & Professional Links: Authoritative email, phone, location, LinkedIn, GitHub, portfolio
 * 4. Application Readiness & Compliance: Work authorization, visa sponsorship, working model, availability, reusable Q&A
 * 5. Work Experience History: Multi-record CRUD with employment types and derived tenure metrics
 * 6. Education & Degrees: Multi-record CRUD with degree types, enrollment tracking, and coursework
 * 7. Career Skills: Evidence-locked primary categorized skills (8 domains), signals, and self-declared catalog modal
 * 8. Highlighted Projects: Grounded in AST code scanning and GitHub repository evidence
 * 9. Languages & Certifications: Multi-record certifications, spoken languages, and custom portfolio links
 * 10. Job Search Intent & Matching Criteria: Target roles, preferred locations, compensation floor, suggestions
 * Sticky save bar with dirty-state tracking, AJAX autosave, and unsaved changes confirmation
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
 * @param {Array<object>} [params.additionalSkills=[]] Self-declared additional skills
 * @param {object} [params.skillCatalog={ items: [], categories: [] }] Canonical skill catalog
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

  // Authoritative identity values
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

  // Authoritative contact information resolution (never synthetic)
  const authenticEmail = profile?.canonicalEmail || candidate?.canonicalEmail || user?.email || '';

  const candidatePhone =
    candidate?.profileMetadata?.phone ||
    candidate?.profileMetadata?.resumeData?.identity?.phone ||
    candidate?.profileMetadata?.userCustom?.phone ||
    '';

  // Professional links extraction from authoritative map
  const linkedInLink = portfolioLinksList.find(
    (l) => l.label === 'LINKEDIN' || (l.url && l.url.toLowerCase().includes('linkedin.com'))
  );
  const gitHubLink = portfolioLinksList.find(
    (l) => l.label === 'GITHUB' || (l.url && l.url.toLowerCase().includes('github.com'))
  );
  const portfolioSiteLink = portfolioLinksList.find(
    (l) =>
      l.label === 'PORTFOLIO' ||
      (l.url &&
        !l.url.toLowerCase().includes('github.com') &&
        !l.url.toLowerCase().includes('linkedin.com') &&
        !l.url.toLowerCase().includes('leetcode.com'))
  );

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

  const candidateInitials =
    (candidate?.displayName || user?.displayName || 'C')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || 'CP';

  const content = `
    <style>
      /* Career Profile SaaS Design System - Ashby / Linear / GitHub Grade */
      .profile-page-container {
        max-width: 1080px;
        margin: 0 auto;
        padding: 1.5rem 1rem 6rem 1rem;
      }

      .profile-header-card {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
      }

      .completion-bar-track {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 9999px;
        height: 6px;
        width: 100%;
        overflow: hidden;
        margin: 0.85rem 0 1rem 0;
      }

      .completion-bar-fill {
        background: linear-gradient(90deg, #6366f1, #10b981);
        height: 100%;
        border-radius: 9999px;
        transition: width 0.4s ease;
      }

      .section-status-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }

      .section-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.6rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        text-decoration: none;
        transition: all 0.15s ease;
      }

      .status-pill-complete {
        background: rgba(16, 185, 129, 0.1);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .status-pill-attention {
        background: rgba(245, 158, 11, 0.1);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.25);
      }

      .status-pill-neutral {
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .section-status-pill:hover {
        border-color: rgba(99, 102, 241, 0.4);
      }

      .form-section-card {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 1.5rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        scroll-margin-top: 2rem;
      }

      .section-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: #f8fafc;
        margin-bottom: 0.35rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .section-subtitle {
        font-size: 0.8rem;
        color: #94a3b8;
        margin-bottom: 1.25rem;
        line-height: 1.4;
      }

      /* Readiness Status Pills */
      .readiness-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        line-height: 1.2;
        white-space: nowrap;
      }

      .readiness-pill.ready {
        background: rgba(16, 185, 129, 0.12);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .readiness-pill.missing {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.25);
      }

      .readiness-pill.needs-confirmation {
        background: rgba(99, 102, 241, 0.12);
        color: #a5b4fc;
        border: 1px solid rgba(99, 102, 241, 0.25);
      }

      .readiness-pill.optional {
        background: rgba(255, 255, 255, 0.04);
        color: #94a3b8;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      /* Contact & Professional Links Grid */
      .contact-links-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 0.85rem;
      }

      .contact-channel-card {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 0.85rem 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 0.4rem;
        transition: border-color 0.15s ease;
      }

      .contact-channel-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
      }

      .channel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
      }

      .channel-label {
        font-size: 0.72rem;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .channel-value {
        font-size: 0.9rem;
        font-weight: 600;
        color: #f8fafc;
        word-break: break-all;
      }

      .channel-note {
        font-size: 0.7rem;
        color: #64748b;
      }

      /* Application Readiness Subcards Grid */
      .readiness-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1rem;
      }

      .readiness-subcard {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 1.15rem;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .readiness-subcard-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding-bottom: 0.5rem;
      }

      .qa-bank-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }

      .qa-bank-item {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 5px;
        padding: 0.65rem 0.8rem;
      }

      .qa-question {
        font-size: 0.75rem;
        font-weight: 600;
        color: #a5b4fc;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
      }

      .qa-answer {
        font-size: 0.84rem;
        color: #f8fafc;
        font-weight: 500;
      }

      /* Form Fields */
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }

      .form-label {
        font-size: 0.82rem;
        font-weight: 600;
        color: #cbd5e1;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .form-input, .form-textarea, .form-select {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        color: #f8fafc;
        padding: 0.55rem 0.75rem;
        font-size: 0.88rem;
        font-family: inherit;
        transition: all 0.15s ease;
      }

      .form-input:focus, .form-textarea:focus, .form-select:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
      }

      .form-helper {
        font-size: 0.72rem;
        color: #64748b;
        line-height: 1.35;
      }

      /* Chips Input Box */
      .chips-input-box {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 0.35rem 0.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: center;
        min-height: 42px;
        cursor: text;
      }

      .selected-chip {
        background: rgba(99, 102, 241, 0.15);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.3);
        border-radius: 4px;
        padding: 0.2rem 0.5rem;
        font-size: 0.78rem;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .chip-remove-btn {
        cursor: pointer;
        font-size: 0.85rem;
        line-height: 1;
        color: #a5b4fc;
      }

      .chip-remove-btn:hover {
        color: #f8fafc;
      }

      .chips-search-input {
        background: transparent;
        border: none;
        color: #f8fafc;
        font-size: 0.85rem;
        padding: 0.2rem;
        outline: none;
        flex: 1;
        min-width: 140px;
      }

      .suggestion-pills-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-top: 0.4rem;
      }

      .suggestion-pill {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.72rem;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .suggestion-pill:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.18);
      }

      .suggestion-pill.ai-recommended {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.25);
        color: #a5b4fc;
      }

      .suggestion-pill.ai-recommended:hover {
        background: rgba(99, 102, 241, 0.15);
        color: #e0e7ff;
      }

      /* Evidence Lock Banner */
      .evidence-lock-banner {
        background: rgba(99, 102, 241, 0.05);
        border: 1px solid rgba(99, 102, 241, 0.18);
        border-radius: 6px;
        padding: 0.75rem 1rem;
        margin-bottom: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .evidence-lock-badge {
        font-size: 0.7rem;
        font-weight: 600;
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        border: 1px solid rgba(99, 102, 241, 0.3);
      }

      /* Multi-record item list */
      .record-card-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .record-item-card {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 1rem 1.25rem;
        position: relative;
        transition: border-color 0.15s ease;
      }

      .record-item-card:hover {
        border-color: rgba(255, 255, 255, 0.14);
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
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.09);
        color: #cbd5e1;
        padding: 0.25rem 0.55rem;
        border-radius: 4px;
        font-size: 0.72rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .btn-icon-action:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.18);
      }

      .btn-icon-action.danger:hover {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.35);
        color: #fca5a5;
      }

      /* Derived Metrics Box */
      .derived-metrics-box {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
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
        font-size: 0.68rem;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .metric-stat-value {
        font-size: 0.95rem;
        font-weight: 700;
        color: #f8fafc;
        margin-top: 0.2rem;
      }

      /* Section-Level Save Action Bar */
      .section-action-bar {
        margin-top: 1.25rem;
        padding: 0.75rem 1rem;
        background: #0B0F19;
        border: 1px solid rgba(251, 191, 36, 0.35);
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        animation: fadeInBar 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes fadeInBar {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .section-action-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .section-dirty-indicator {
        font-size: 0.8rem;
        font-weight: 600;
        color: #fbbf24;
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .section-save-status {
        font-size: 0.78rem;
        font-weight: 500;
      }

      .section-action-buttons {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .section-header-status {
        font-size: 0.72rem;
        font-weight: 600;
        color: #34d399;
        margin-left: 0.5rem;
        transition: opacity 0.3s ease;
      }

      .spinner-sm {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        vertical-align: middle;
        margin-right: 4px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
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
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        width: 100%;
        max-width: 560px;
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
        font-size: 1.05rem;
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
        padding: 0 4px;
        line-height: 1;
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

      /* Enhanced Additional Skills Catalog Modal */
      .modal-catalog-dialog {
        max-width: 620px;
        width: 100%;
        height: 620px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #111827;
        border-radius: 8px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
      }

      .modal-catalog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.15rem 1.4rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: #111827;
        flex-shrink: 0;
      }

      .modal-catalog-body {
        padding: 1.25rem 1.4rem;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }

      .modal-catalog-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 0.5rem;
        padding: 0.85rem 1.4rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        background: #0B0F19;
        flex-shrink: 0;
      }

      .catalog-search-box {
        position: relative;
        margin-bottom: 0.85rem;
      }

      .catalog-search-box input {
        width: 100%;
        padding: 0.6rem 0.85rem 0.6rem 2.2rem;
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        color: #f8fafc;
        font-size: 0.85rem;
      }

      .catalog-categories-bar {
        display: flex;
        gap: 0.35rem;
        overflow-x: auto;
        padding-bottom: 0.5rem;
        margin-bottom: 0.85rem;
        scrollbar-width: thin;
      }

      .catalog-cat-pill {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        padding: 0.2rem 0.55rem;
        border-radius: 4px;
        font-size: 0.72rem;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .catalog-cat-pill.active {
        background: rgba(99, 102, 241, 0.15);
        border-color: #6366f1;
        color: #c7d2fe;
        font-weight: 600;
      }

      .catalog-skills-container {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        max-height: 310px;
        overflow-y: auto;
        padding: 0.25rem 0;
      }

      .catalog-skill-item {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        padding: 0.3rem 0.6rem;
        font-size: 0.78rem;
        color: #e2e8f0;
        cursor: pointer;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
      }

      .catalog-skill-item:hover {
        background: rgba(99, 102, 241, 0.12);
        border-color: rgba(99, 102, 241, 0.3);
        color: #f8fafc;
      }

      .catalog-selected-card {
        background: #0B0F19;
        border: 1px solid rgba(99, 102, 241, 0.25);
        border-radius: 6px;
        padding: 0.85rem 1rem;
        margin-bottom: 1.15rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .status-pill-toggle {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        margin-bottom: 0.85rem;
      }

      .status-toggle-btn {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 0.5rem;
        color: #94a3b8;
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: all 0.15s ease;
      }

      .status-toggle-btn.active {
        background: rgba(99, 102, 241, 0.15);
        border-color: #6366f1;
        color: #f8fafc;
        font-weight: 600;
      }

      /* Skills Grid Categorization */
      .skill-category-block {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        padding: 0.75rem 1rem;
      }

      .skill-category-title {
        font-size: 0.72rem;
        font-weight: 600;
        color: #a5b4fc;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 0.5rem;
      }

      .skill-tag-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.25rem 0.55rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .badge-verified {
        background: rgba(16, 185, 129, 0.1);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .badge-claimed {
        background: rgba(245, 158, 11, 0.1);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.25);
      }

      .badge-user-provided {
        background: rgba(99, 102, 241, 0.1);
        color: #c7d2fe;
        border: 1px solid rgba(99, 102, 241, 0.25);
      }

      /* Projects Grid */
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
        gap: 0.85rem;
      }

      .project-card {
        background: #0B0F19;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: border-color 0.15s ease;
      }

      .project-card:hover {
        border-color: rgba(255, 255, 255, 0.14);
      }

      .project-evidence-badge {
        font-size: 0.68rem;
        font-weight: 500;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: rgba(16, 185, 129, 0.12);
        color: #34d399;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .project-claimed-badge {
        font-size: 0.68rem;
        font-weight: 500;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
        border: 1px solid rgba(245, 158, 11, 0.25);
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

      /* Responsive adjustments */
      @media (max-width: 640px) {
        .profile-page-container {
          padding: 1rem 0.75rem 5.5rem 0.75rem;
        }
        .profile-header-card, .form-section-card {
          padding: 1.15rem;
        }
        .modal-dialog {
          padding: 1.15rem;
          max-width: 100%;
        }
        .contact-links-grid, .readiness-grid, .projects-grid, .section-status-grid {
          grid-template-columns: 1fr;
        }
        .derived-metrics-box {
          grid-template-columns: 1fr 1fr;
        }
        .modal-grid-2col, .modal-grid-edu {
          grid-template-columns: 1fr;
        }
        .modal-catalog-dialog {
          max-width: 100%;
          height: 90vh;
          max-height: 90vh;
          border-radius: 8px;
        }
        .modal-catalog-header, .modal-catalog-body, .modal-catalog-footer {
          padding-left: 1rem;
          padding-right: 1rem;
        }
        .status-pill-toggle {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="profile-page-container">
      <!-- Flash Alert Feedback -->
      ${
        flashMessage
          ? `<div class="card" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #34d399; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.85rem; font-weight: 500;">✓ ${escapeHtml(flashMessage)}</div>`
          : ''
      }
      ${
        errorMessage
          ? `<div class="card" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); color: #fca5a5; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.25rem; font-size: 0.85rem; font-weight: 500;">${escapeHtml(errorMessage)}</div>`
          : ''
      }

      <!-- ================================================================= -->
      <!-- SECTION 1: PROFILE HEADER & READINESS (HERO SNAPSHOT)             -->
      <!-- ================================================================= -->
      <div id="section-header" class="profile-header-card">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.75rem;">
          <div style="display: flex; gap: 1rem; align-items: center;">
            <div style="width: 52px; height: 52px; border-radius: 8px; background: #1f2937; border: 1px solid rgba(99, 102, 241, 0.4); color: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; font-weight: 700; letter-spacing: 0.05em;">
              ${escapeHtml(candidateInitials)}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <h1 style="font-size: 1.3rem; font-weight: 700; color: #f8fafc; margin: 0; line-height: 1.2;">
                  ${escapeHtml(candidate?.displayName || user?.displayName || 'Candidate Profile')}
                </h1>
                <span class="badge badge-verified" style="font-size: 0.7rem; text-transform: uppercase;">
                  STATUS: ${escapeHtml(careerStatusVal)}
                </span>
              </div>
              <p style="font-size: 0.85rem; color: #94a3b8; margin: 0.25rem 0 0 0;">
                ${escapeHtml(candidate?.headline || currentRole || 'Professional Candidate')} • <span style="color: #64748b;">${escapeHtml(userLocation || 'Location not set')}</span>
              </p>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
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

        <!-- 10-Section Navigation Jump Bar -->
        <div class="section-status-grid">
          <a href="#section-summary" class="section-status-pill ${summaryText ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${summaryText ? '✓' : '!'}</span> 2. Summary
          </a>
          <a href="#section-contact" class="section-status-pill ${authenticEmail && candidatePhone ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${authenticEmail ? '✓' : '!'}</span> 3. Contact & Links
          </a>
          <a href="#section-readiness" class="section-status-pill ${workAuthList.length > 0 && availability ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${availability ? '✓' : '!'}</span> 4. Application Readiness
          </a>
          <a href="#section-experience" class="section-status-pill ${experienceList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${experienceList.length > 0 ? '✓' : '○'}</span> 5. Experience (${experienceList.length})
          </a>
          <a href="#section-education" class="section-status-pill ${educationList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${educationList.length > 0 ? '✓' : '○'}</span> 6. Education (${educationList.length})
          </a>
          <a href="#section-skills" class="section-status-pill ${primarySkillsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${primarySkillsList.length > 0 ? '✓' : '!'}</span> 7. Skills (${primarySkillsList.length})
          </a>
          <a href="#section-projects" class="section-status-pill ${projectsList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${projectsList.length > 0 ? '✓' : '○'}</span> 8. Projects (${projectsList.length})
          </a>
          <a href="#section-credentials" class="section-status-pill ${certsList.length > 0 || languagesList.length > 0 ? 'status-pill-complete' : 'status-pill-neutral'}">
            <span>${languagesList.length > 0 ? '✓' : '○'}</span> 9. Languages & Certs
          </a>
          <a href="#section-search-intent" class="section-status-pill ${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? 'status-pill-complete' : 'status-pill-attention'}">
            <span>${targetRolesList.length > 0 && preferredLocationsList.length > 0 ? '✓' : '!'}</span> 10. Search Intent
          </a>
        </div>

        <!-- MCP Data Flow Callout -->
        <div style="margin-top: 0.85rem; padding: 0.6rem 0.9rem; background: rgba(99, 102, 241, 0.04); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 6px; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 0.75rem; color: #a5b4fc;">This candidate workspace feeds AI career agents — MCP clients (Claude, ChatGPT, Gemini) consume your verified portfolio and application readiness data.</span>
        </div>
      </div>

      <!-- Quick AI Suggestions Bar (if search criteria empty) -->
      ${
        targetRolesList.length === 0 || preferredLocationsList.length === 0
          ? `
        <div class="card" style="background: #111827; border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div>
              <strong style="color: #f8fafc; font-size: 0.85rem; display: block;">Suggested preferences based on your skills</strong>
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
          <button type="button" class="btn btn-secondary btn-sm" onclick="applyAllAiSuggestions()" style="font-size: 0.75rem; padding: 0.35rem 0.75rem; border-color: rgba(99, 102, 241, 0.3); color: #c7d2fe;">
            Apply suggestions
          </button>
        </div>
      `
          : ''
      }

      <!-- Main Profile & Application Workspace Form -->
      <form id="careerProfileForm" action="/profile" method="POST" style="display: flex; flex-direction: column; gap: 1.25rem;">
        <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />
        <input type="hidden" id="experienceHidden" name="experience" value="" />
        <input type="hidden" id="educationHidden" name="education" value="" />
        <input type="hidden" id="certificationsHidden" name="certifications" value="" />
        <input type="hidden" id="languagesHidden" name="languages" value="" />
        <input type="hidden" id="portfolioLinksHidden" name="portfolioLinks" value="" />
        <input type="hidden" id="currentEmploymentHidden" name="currentEmployment" value="" />

        <!-- ================================================================= -->
        <!-- SECTION 2: PROFESSIONAL SUMMARY & NARRATIVE                       -->
        <!-- ================================================================= -->
        <div id="section-summary" class="form-section-card">
          <div class="section-title">
            <span>2. Professional Summary & Narrative</span>
            <span class="section-header-status" id="header-status-summary" style="display: none;"></span>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 500;">✓ User Editable</span>
          </div>
          <div class="section-subtitle">
            Define your authentic professional persona, candidate standing, and executive narrative.
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
            <div class="form-group">
              <label class="form-label" for="displayName">
                Display Name <span style="color: #ef4444;">*</span>
              </label>
              <input type="text" id="displayName" name="displayName" value="${escapeHtml(candidate?.displayName || user?.displayName || '')}" required class="form-input" placeholder="e.g. Alex Mercer" oninput="checkSectionDirty('summary')" />
              <div class="form-helper">Your preferred full name for applications and profile views.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="headline">
                Professional Headline
              </label>
              <input type="text" id="headline" name="headline" value="${escapeHtml(candidate?.headline || '')}" placeholder="e.g. Backend Engineer specializing in distributed systems" class="form-input" oninput="checkSectionDirty('summary')" />
              <div class="form-helper">Concise one-line summary of your technical focus.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="currentRole">
                Professional Role / Persona
              </label>
              <input type="text" id="currentRole" name="currentRole" value="${escapeHtml(currentRole)}" placeholder="e.g. Full-Stack & Backend Developer" class="form-input" oninput="checkSectionDirty('summary')" />
              <div class="form-helper">Active role persona (does not require active employment).</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="careerStatus">
                Career Standing <span style="color: #6366f1; font-size: 0.7rem;">(Detected & Selectable)</span>
              </label>
              <select id="careerStatus" name="careerStatus" class="form-select" onchange="handleCareerStatusChange(); checkSectionDirty('summary');">
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
              <input type="text" id="location" name="location" value="${escapeHtml(userLocation)}" placeholder="e.g. Gorakhpur, India" class="form-input" oninput="checkSectionDirty('summary')" />
              <div class="form-helper">Where you currently live (Separate from preferred search locations).</div>
              <div class="suggestion-pills-row">
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Bengaluru, India'; checkSectionDirty('summary');">Bengaluru</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Hyderabad, India'; checkSectionDirty('summary');">Hyderabad</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Pune, India'; checkSectionDirty('summary');">Pune</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Delhi NCR, India'; checkSectionDirty('summary');">Delhi NCR</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Gorakhpur, India'; checkSectionDirty('summary');">Gorakhpur</span>
                <span class="suggestion-pill" onclick="document.getElementById('location').value = 'Remote'; checkSectionDirty('summary');">Remote</span>
              </div>
            </div>

            <!-- Current Active Employment Display -->
            <div class="form-group">
              <label class="form-label">
                Current Active Employment
              </label>
              <div id="currentEmploymentDisplay" style="background: #0B0F19; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 0.65rem 0.85rem; font-size: 0.85rem; color: #f8fafc; min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <div id="currentEmploymentText">
                  ${
                    currentEmploymentObj
                      ? `<span><strong>${escapeHtml(currentEmploymentObj.title)}</strong> at ${escapeHtml(currentEmploymentObj.company)} <span class="badge" style="font-size: 0.68rem; margin-left: 0.3rem;">${escapeHtml(currentEmploymentObj.employmentType || 'FULL_TIME')}</span></span>`
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

          <div class="form-group" style="margin-top: 0.75rem; margin-bottom: 0;">
            <label class="form-label" for="summary">
              Executive Summary Narrative
            </label>
            <textarea id="summary" name="summary" rows="3" placeholder="Write a concise professional introduction..." class="form-textarea" style="resize: vertical;" oninput="checkSectionDirty('summary')">${escapeHtml(summaryText)}</textarea>
            <div class="form-helper">Foundational summary used for AI resume tailoring and MCP profile summaries.</div>
          </div>

          <!-- Section 2 Local Save/Discard Action Bar -->
          <div class="section-action-bar" id="actions-summary" style="display: none;">
            <div class="section-action-info">
              <span class="section-dirty-indicator">● Unsaved changes</span>
              <span class="section-save-status" id="status-summary"></span>
            </div>
            <div class="section-action-buttons">
              <button type="button" class="btn btn-secondary btn-sm" onclick="discardSection('summary')">Discard</button>
              <button type="button" class="btn btn-primary btn-sm btn-save-section" id="btn-save-summary" onclick="saveSectionAjax('summary')">Save changes</button>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 3: CONTACT & PROFESSIONAL LINKS                           -->
        <!-- ================================================================= -->
        <div id="section-contact" class="form-section-card">
          <div class="section-title">
            <span>3. Contact & Professional Links</span>
            <span class="section-header-status" id="header-status-contact" style="display: none;"></span>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 500;">✓ Application Essential</span>
          </div>
          <div class="section-subtitle">
            Authoritative contact details and verified developer profiles used when submitting or handing off job applications.
          </div>

          <div class="contact-links-grid">
            <!-- Email (Authoritative Source of Truth) -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">Primary Email</span>
                <span class="readiness-pill ready">✓ Ready</span>
              </div>
              <div class="channel-value" title="Authentic resolved candidate email">
                ${escapeHtml(authenticEmail || 'Not configured')}
              </div>
              <div class="channel-note">Authoritative verified account email (never synthetic).</div>
            </div>

            <!-- Phone Number -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">Phone Number</span>
                <span id="phoneReadinessPill" class="readiness-pill ${candidatePhone ? 'ready' : 'missing'}">
                  ${candidatePhone ? '✓ Ready' : '⚠ Missing'}
                </span>
              </div>
              <div style="margin-top: 0.25rem;">
                <input
                  type="tel"
                  id="contactPhoneInput"
                  name="contactPhone"
                  value="${escapeHtml(candidatePhone)}"
                  placeholder="e.g. +1 555-0199 or 7905087928"
                  class="form-input"
                  style="font-size: 0.85rem; padding: 0.35rem 0.6rem;"
                  oninput="checkSectionDirty('contact'); updateContactReadinessPills();"
                />
              </div>
              <div class="channel-note">Direct recruiter reachout phone used in job applications.</div>
            </div>

            <!-- Residence Location -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">Residence Location</span>
                ${
                  userLocation
                    ? `<span class="readiness-pill ready">✓ Ready</span>`
                    : `<span class="readiness-pill missing">⚠ Missing</span>`
                }
              </div>
              <div class="channel-value">
                ${userLocation ? escapeHtml(userLocation) : '<span style="color: #64748b; font-style: italic; font-weight: 400;">Location not set</span>'}
              </div>
              <div class="channel-note">Current residence for tax eligibility (configured in Section 2).</div>
            </div>

            <!-- LinkedIn Profile -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">LinkedIn Profile</span>
                <span id="linkedinReadinessPill" class="readiness-pill ${linkedInLink ? 'ready' : 'missing'}">
                  ${linkedInLink ? '✓ Ready' : '⚠ Missing'}
                </span>
              </div>
              <div style="margin-top: 0.25rem;">
                <input
                  type="url"
                  id="contactLinkedinInput"
                  name="contactLinkedin"
                  value="${escapeHtml(linkedInLink ? linkedInLink.url : '')}"
                  placeholder="https://linkedin.com/in/username"
                  class="form-input"
                  style="font-size: 0.85rem; padding: 0.35rem 0.6rem;"
                  oninput="checkSectionDirty('contact'); updateContactReadinessPills();"
                />
              </div>
              <div class="channel-note">Professional career identity and network.</div>
            </div>

            <!-- GitHub Profile -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">GitHub Profile</span>
                <span id="githubReadinessPill" class="readiness-pill ${gitHubLink ? 'ready' : 'missing'}">
                  ${gitHubLink ? '✓ Ready' : '⚠ Missing'}
                </span>
              </div>
              <div style="margin-top: 0.25rem;">
                <input
                  type="url"
                  id="contactGithubInput"
                  name="contactGithub"
                  value="${escapeHtml(gitHubLink ? gitHubLink.url : '')}"
                  placeholder="https://github.com/username"
                  class="form-input"
                  style="font-size: 0.85rem; padding: 0.35rem 0.6rem;"
                  oninput="checkSectionDirty('contact'); updateContactReadinessPills();"
                />
              </div>
              <div class="channel-note">Source code provenance and verified commits.</div>
            </div>

            <!-- Portfolio Website -->
            <div class="contact-channel-card">
              <div class="channel-header">
                <span class="channel-label">Portfolio Website</span>
                <span id="portfolioReadinessPill" class="readiness-pill ${portfolioSiteLink ? 'ready' : 'optional'}">
                  ${portfolioSiteLink ? '✓ Ready' : '○ Optional'}
                </span>
              </div>
              <div style="margin-top: 0.25rem;">
                <input
                  type="url"
                  id="contactPortfolioInput"
                  name="contactPortfolio"
                  value="${escapeHtml(portfolioSiteLink ? portfolioSiteLink.url : '')}"
                  placeholder="https://yourportfolio.dev"
                  class="form-input"
                  style="font-size: 0.85rem; padding: 0.35rem 0.6rem;"
                  oninput="checkSectionDirty('contact'); updateContactReadinessPills();"
                />
              </div>
              <div class="channel-note">Personal engineering website or showcase link.</div>
            </div>
          </div>

          <!-- Section 3 Local Save/Discard Action Bar -->
          <div class="section-action-bar" id="actions-contact" style="display: none;">
            <div class="section-action-info">
              <span class="section-dirty-indicator">● Unsaved changes</span>
              <span class="section-save-status" id="status-contact"></span>
            </div>
            <div class="section-action-buttons">
              <button type="button" class="btn btn-secondary btn-sm" onclick="discardSection('contact')">Discard</button>
              <button type="button" class="btn btn-primary btn-sm btn-save-section" id="btn-save-contact" onclick="saveSectionAjax('contact')">Save changes</button>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 4: APPLICATION READINESS & COMPLIANCE                     -->
        <!-- ================================================================= -->
        <div id="section-readiness" class="form-section-card">
          <div class="section-title">
            <span>4. Application Readiness & Compliance</span>
            <span class="section-header-status" id="header-status-readiness" style="display: none;"></span>
            <span class="evidence-lock-badge" style="background: rgba(16, 185, 129, 0.12); color: #34d399; border-color: rgba(16, 185, 129, 0.25);">⚡ ATS Handoff Kit</span>
          </div>
          <div class="section-subtitle">
            Critical compliance screening answers and working model preferences required by employer job portals.
          </div>

          <div class="readiness-grid">
            <!-- Subcard A: Legal Work Authorization & Sponsorship (Canonical Editable Owner) -->
            <div class="readiness-subcard">
              <div class="readiness-subcard-title">
                <span>Work Authorization & Sponsorship</span>
                <span id="workAuthReadinessPill" class="readiness-pill ${workAuthList.length > 0 ? 'ready' : 'needs-confirmation'}">
                  ${workAuthList.length > 0 ? '✓ Ready' : '⚠ Needs confirmation'}
                </span>
              </div>

              <div class="form-group">
                <label class="form-label" for="workAuthInput">
                  <span>Work Authorization Status</span>
                </label>
                <input
                  type="text"
                  id="workAuthInput"
                  name="workAuthorization"
                  value="${escapeHtml(workAuthList.join(', '))}"
                  placeholder="e.g. Authorized to work in India / US Citizen / OPT"
                  class="form-input"
                  oninput="checkSectionDirty('readiness'); updateWorkAuthReadinessPill();"
                />
                <div class="form-helper">Legal right to work in your targeted job countries (comma-separated).</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="visaSponsorshipRequired">
                  <span>Visa Sponsorship Requirement</span>
                  <span class="readiness-pill ready" style="font-size: 0.65rem;">✓ Declared</span>
                </label>
                <select id="visaSponsorshipRequired" name="visaSponsorshipRequired" class="form-select" onchange="checkSectionDirty('readiness')">
                  <option value="false" ${jobPrefs.visaSponsorshipRequired === false ? 'selected' : ''}>No — I do not require sponsorship to work</option>
                  <option value="true" ${jobPrefs.visaSponsorshipRequired === true ? 'selected' : ''}>Yes — I will require employer visa sponsorship</option>
                </select>
                <div class="form-helper">Informs automated ATS screening whether immigration sponsorship is requested.</div>
              </div>
            </div>

            <!-- Subcard B: Working Model & Availability Summary (Read-Only Summary / Synchronized) -->
            <div class="readiness-subcard">
              <div class="readiness-subcard-title">
                <span>Working Model & Availability Summary</span>
                <span class="readiness-pill ready">✓ Synced with Intent</span>
              </div>
              <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 0.75rem;">
                Canonical preferences configured in <a href="#section-search-intent" style="color: #818cf8; text-decoration: none;">Section 10 (Job Search Intent) &darr;</a>
              </div>

              <div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.82rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.65rem; background: #0B0F19; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">
                  <span style="color: #94a3b8;">Remote Model:</span>
                  <strong id="summaryRemoteModel" style="color: #f8fafc;">${escapeHtml(remotePref)}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.65rem; background: #0B0F19; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">
                  <span style="color: #94a3b8;">Notice / Availability:</span>
                  <strong id="summaryAvailability" style="color: #f8fafc;">${escapeHtml(availability || 'Immediately')}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.65rem; background: #0B0F19; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px;">
                  <span style="color: #94a3b8;">Relocation Willingness:</span>
                  <strong id="summaryRelocation" style="color: #f8fafc;">${escapeHtml(relocationPref)}</strong>
                </div>
              </div>
            </div>

            <!-- Subcard C: Reusable Application Screening Q&A Bank -->
            <div class="readiness-subcard" style="grid-column: 1 / -1;">
              <div class="readiness-subcard-title">
                <span>Reusable Application Answers (Screening Bank)</span>
                <span class="readiness-pill ready">✓ 5 Answers Active</span>
              </div>
              <div style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 0.25rem;">
                Standard answers supplied automatically to employer portals and browser handoff kits during application submission.
              </div>

              <div class="qa-bank-list">
                <div class="qa-bank-item">
                  <div class="qa-question">
                    <span>What is your notice period / earliest start timeline?</span>
                    <span id="qaPillAvailability" class="readiness-pill ${availability ? 'ready' : 'needs-confirmation'}">
                      ${availability ? '✓ User Confirmed' : '○ Inferred'}
                    </span>
                  </div>
                  <div id="qaAnswerAvailability" class="qa-answer">${escapeHtml(availability || 'Immediately available upon offer')}</div>
                </div>

                <div class="qa-bank-item">
                  <div class="qa-question">
                    <span>Are you legally authorized to work in the country of this job?</span>
                    <span id="qaPillWorkAuth" class="readiness-pill ${workAuthList.length > 0 ? 'ready' : 'needs-confirmation'}">
                      ${workAuthList.length > 0 ? '✓ User Confirmed' : '○ Inferred from Residence'}
                    </span>
                  </div>
                  <div id="qaAnswerWorkAuth" class="qa-answer">
                    ${escapeHtml(workAuthList.length > 0 ? workAuthList.join(', ') : `Authorized to work in ${userLocation || 'country of residence'}`)}
                  </div>
                </div>

                <div class="qa-bank-item">
                  <div class="qa-question">
                    <span>Will you now or in the future require visa sponsorship?</span>
                    <span id="qaPillSponsorship" class="readiness-pill ready">✓ User Confirmed</span>
                  </div>
                  <div id="qaAnswerSponsorship" class="qa-answer">
                    ${jobPrefs.visaSponsorshipRequired ? 'Yes, I require employer visa sponsorship' : 'No, I do not require sponsorship'}
                  </div>
                </div>

                <div class="qa-bank-item">
                  <div class="qa-question">
                    <span>How many years of professional software experience do you have?</span>
                    <span class="readiness-pill ready">✓ Derived from History</span>
                  </div>
                  <div class="qa-answer">
                    ${expDuration.totalYears > 0 ? `${expDuration.totalYears} year(s) (${expDuration.totalMonths} months)` : 'Fresher / Early Career Engineer'}
                  </div>
                </div>

                <div class="qa-bank-item">
                  <div class="qa-question">
                    <span>What is your core technical stack and verified competencies?</span>
                    <span class="readiness-pill ready">✓ Code AST Verified</span>
                  </div>
                  <div class="qa-answer">
                    ${escapeHtml(
                      primarySkillsList
                        .slice(0, 5)
                        .map((s) => s.name || s)
                        .join(', ') || 'Full Stack & Backend Development'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4 Local Save/Discard Action Bar -->
          <div class="section-action-bar" id="actions-readiness" style="display: none;">
            <div class="section-action-info">
              <span class="section-dirty-indicator">● Unsaved changes</span>
              <span class="section-save-status" id="status-readiness"></span>
            </div>
            <div class="section-action-buttons">
              <button type="button" class="btn btn-secondary btn-sm" onclick="discardSection('readiness')">Discard</button>
              <button type="button" class="btn btn-primary btn-sm btn-save-section" id="btn-save-readiness" onclick="saveSectionAjax('readiness')">Save changes</button>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 5: WORK EXPERIENCE (MULTI-RECORD CRUD)                    -->
        <!-- ================================================================= -->
        <div id="section-experience" class="form-section-card">
          <div class="section-title">
            <span>5. Work Experience History</span>
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
            Derived metrics are calculated automatically from your experience records and cannot be directly forged.
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 6: EDUCATION & DEGREES (MULTI-RECORD CRUD)                -->
        <!-- ================================================================= -->
        <div id="section-education" class="form-section-card">
          <div class="section-title">
            <span>6. Education & Degrees</span>
            <button type="button" class="btn btn-primary btn-sm" onclick="openAddEducationModal()" style="font-size: 0.78rem; padding: 0.3rem 0.75rem;">
              + Add Education
            </button>
          </div>
          <div class="section-subtitle">
            Supports multiple degrees, bootcamps, and diplomas with graduation and enrolled status tracking.
          </div>

          <div id="educationListContainer" class="record-card-list">
            <!-- Rendered dynamically by client-side state -->
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 7: CAREER SKILLS (EVIDENCE-LOCKED & SELF-DECLARED)        -->
        <!-- ================================================================= -->
        <div id="section-skills" class="form-section-card">
          <div class="section-title">
            <span>7. Career Skills (${primarySkillsList.length + technologySignalsList.length})</span>
            <span class="evidence-lock-badge">🔒 Evidence-Controlled</span>
          </div>
          <div class="section-subtitle">
            Combined from GitHub repositories (AST code scans) and parsed resumes. GitHub-verified skills are prioritized.
          </div>

          <div class="evidence-lock-banner">
            <div>
              <strong style="color: #c7d2fe; font-size: 0.82rem;">Evidence-Locked Truth Model</strong>
              <p style="color: #94a3b8; font-size: 0.75rem; margin: 0.2rem 0 0 0;">
                Skills are classified as ✓ Verified (GitHub evidence), ✓ Corroborated (both sources), or ○ Claimed (resume only).
              </p>
            </div>
            <a href="/sources" class="btn btn-secondary btn-sm" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
              Manage Sources →
            </a>
          </div>

          <!-- Source Summary -->
          <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #34d399;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #34d399; display: inline-block;"></span>
              ${primarySkillsList.filter((s) => s.githubEvidence).length + technologySignalsList.filter((s) => s.githubEvidence).length} GitHub Verified
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #fbbf24;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; display: inline-block;"></span>
              ${primarySkillsList.filter((s) => s.source === 'BOTH').length + technologySignalsList.filter((s) => s.source === 'BOTH').length} Corroborated
            </div>
            <div style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: #a5b4fc;">
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

          <!-- Technology & Implementation Signals -->
          ${
            technologySignalsList.length > 0
              ? `
            <div style="background: #0B0F19; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 0.85rem 1rem;">
              <div style="font-size: 0.82rem; font-weight: 500; color: #94a3b8; margin-bottom: 0.6rem; display: flex; justify-content: space-between; align-items: center;">
                <span>Additional Libraries & Tools (${technologySignalsList.length})</span>
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
        <!-- SECTION 7B: ADDITIONAL SKILLS (CANDIDATE DECLARED)                -->
        <!-- ================================================================= -->
        <div id="section-additional-skills" class="form-section-card">
          <div class="section-title">
            <span>7B. Additional Skills</span>
            <span style="font-size: 0.7rem; color: #a5b4fc; background: rgba(165, 180, 252, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 500;">YOUR DECLARATION</span>
          </div>
          <div class="section-subtitle">
            Add skills you know or are learning that may not be visible in your connected GitHub repositories or resume.
          </div>

          <div class="evidence-lock-banner" style="background: rgba(165, 180, 252, 0.04); border-color: rgba(165, 180, 252, 0.15);">
            <div>
              <strong style="color: #c7d2fe; font-size: 0.82rem;">Self-Declared Skills</strong>
              <p style="color: #94a3b8; font-size: 0.75rem; margin: 0.2rem 0 0 0;">
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
            type="button"
            id="openAddSkillModal"
            class="btn btn-secondary"
            style="font-size: 0.82rem; padding: 0.45rem 0.9rem; display: flex; align-items: center; gap: 0.4rem;"
            onclick="openSkillCatalogModal()"
          >
            <span>+ Add Skill</span>
          </button>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 8: HIGHLIGHTED PROJECTS (EVIDENCE LOCKED)                 -->
        <!-- ================================================================= -->
        <div id="section-projects" class="form-section-card">
          <div class="section-title">
            <span>8. Highlighted Portfolio Projects</span>
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
        <!-- SECTION 9: LANGUAGES & CERTIFICATIONS                             -->
        <!-- ================================================================= -->
        <div id="section-credentials" class="form-section-card">
          <div class="section-title">
            <span>9. Languages & Certifications</span>
          </div>
          <div class="section-subtitle">
            Professional credentials, spoken languages, and custom portfolio links.
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
            <!-- Certifications -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin: 0;">Certifications</h4>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openAddCertModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add</button>
              </div>
              <div id="certificationsListContainer" class="record-card-list">
                <!-- Rendered dynamically -->
              </div>
            </div>

            <!-- Languages -->
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <h4 style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin: 0;">Languages</h4>
                <button type="button" class="btn btn-secondary btn-sm" onclick="openAddLangModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add</button>
              </div>
              <div id="languagesListContainer" class="record-card-list">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>

          <!-- Custom Portfolio Links -->
          <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="font-size: 0.85rem; font-weight: 600; color: #e2e8f0; margin: 0;">Additional Custom Links</h4>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openAddLinkModal()" style="font-size: 0.72rem; padding: 0.2rem 0.5rem;">+ Add Link</button>
            </div>
            <div id="portfolioLinksContainer" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- SECTION 10: JOB SEARCH INTENT & MATCHING CRITERIA                 -->
        <!-- ================================================================= -->
        <div id="section-search-intent" class="form-section-card">
          <div class="section-title">
            <span>10. Job Search Intent & Matching Criteria</span>
            <span class="section-header-status" id="header-status-preferences" style="display: none;"></span>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 500;">✓ User Editable</span>
          </div>
          <div class="section-subtitle">
            Configure target titles, preferred job discovery locations, working model, and compensation threshold for automated matching.
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
              <span style="font-size: 0.72rem; color: #a5b4fc; font-weight: 500;">Quick Suggestions:</span>
              <div class="suggestion-pills-row" id="recommendedRolesRow">
                ${recommendedRoles.map((r) => `<span class="suggestion-pill ai-recommended" onclick="addSuggestedRole('${escapeHtml(r)}')">+ ${escapeHtml(r)}</span>`).join('')}
                <span class="suggestion-pill" onclick="addSuggestedRole('Frontend Engineer')">+ Frontend Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('Platform Engineer')">+ Platform Engineer</span>
                <span class="suggestion-pill" onclick="addSuggestedRole('API Engineer')">+ API Engineer</span>
              </div>
            </div>
          </div>

          <!-- Preferred Locations -->
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label" for="preferredLocationsInput">
              Preferred Job Locations <span style="color: #ef4444;">*</span>
            </label>
            <div class="chips-input-box" id="preferredLocationsContainer" onclick="document.getElementById('preferredLocationsInput').focus()">
              <input type="hidden" id="preferredLocationsHidden" name="preferredLocations" value="${escapeHtml(preferredLocationsList.join(','))}" />
              <input type="text" id="preferredLocationsInput" class="chips-search-input" placeholder="Type a location and press Enter..." />
            </div>
            <div class="form-helper">Locations where you are willing to work (Remote, Hybrid, or On-site cities).</div>

            <div style="margin-top: 0.4rem;">
              <span style="font-size: 0.72rem; color: #a5b4fc; font-weight: 500;">Quick Locations:</span>
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

          <!-- Working Model & Relocation Preferences (Canonical Editable Owner) -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-top: 1rem;">
            <div class="form-group">
              <label class="form-label" for="remotePreference">
                Remote Work Model
              </label>
              <select id="remotePreference" name="remotePreference" class="form-select" onchange="checkSectionDirty('preferences')">
                <option value="REMOTE_ONLY" ${remotePref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                <option value="REMOTE_FIRST" ${remotePref === 'REMOTE_FIRST' ? 'selected' : ''}>Remote First</option>
                <option value="HYBRID" ${remotePref === 'HYBRID' ? 'selected' : ''}>Hybrid (Office + Remote)</option>
                <option value="ON_SITE" ${remotePref === 'ON_SITE' ? 'selected' : ''}>On-Site Only</option>
                <option value="FLEXIBLE" ${remotePref === 'FLEXIBLE' ? 'selected' : ''}>Flexible (Any Arrangement)</option>
              </select>
              <div class="form-helper">Your preferred working flexibility arrangement.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="availabilityDate">
                Notice Period / Earliest Start
              </label>
              <input
                type="text"
                id="availabilityDate"
                name="availabilityDate"
                value="${escapeHtml(availability)}"
                placeholder="e.g. Immediately / 2 Weeks Notice"
                class="form-input"
                oninput="checkSectionDirty('preferences')"
              />
              <div class="form-helper">Earliest start date or required notice period timeline.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="relocationPreference">
                Relocation Willingness
              </label>
              <select id="relocationPreference" name="relocationPreference" class="form-select" onchange="checkSectionDirty('preferences')">
                <option value="REMOTE_ONLY" ${relocationPref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only (No Relocation)</option>
                <option value="WILLING_TO_RELOCATE" ${relocationPref === 'WILLING_TO_RELOCATE' ? 'selected' : ''}>Willing to Relocate</option>
                <option value="NOT_WILLING" ${relocationPref === 'NOT_WILLING' ? 'selected' : ''}>Not Willing to Relocate</option>
              </select>
              <div class="form-helper">Whether you are open to relocating for on-site roles.</div>
            </div>
          </div>

          <!-- Compensation Floor -->
          <div class="form-group" style="margin-top: 1rem;">
            <label class="form-label">Compensation Floor (Annual Minimum)</label>
            <div style="display: flex; gap: 0.5rem; max-width: 420px;">
              <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(String(salaryFloor))}" placeholder="e.g. 800000" class="form-input" style="flex: 2;" oninput="checkSectionDirty('preferences')" />
              <select id="salaryCurrency" name="salaryCurrency" class="form-select" style="flex: 1;" onchange="checkSectionDirty('preferences')">
                <option value="INR" ${salaryCurrency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                <option value="USD" ${salaryCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="EUR" ${salaryCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                <option value="GBP" ${salaryCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                <option value="CAD" ${salaryCurrency === 'CAD' ? 'selected' : ''}>CAD ($)</option>
              </select>
            </div>
            <div class="form-helper">Minimum acceptable compensation threshold for job radar matching.</div>
          </div>

          <!-- Section 10 Local Save/Discard Action Bar -->
          <div class="section-action-bar" id="actions-preferences" style="display: none;">
            <div class="section-action-info">
              <span class="section-dirty-indicator">● Unsaved changes</span>
              <span class="section-save-status" id="status-preferences"></span>
            </div>
            <div class="section-action-buttons">
              <button type="button" class="btn btn-secondary btn-sm" onclick="discardSection('preferences')">Discard</button>
              <button type="button" class="btn btn-primary btn-sm btn-save-section" id="btn-save-preferences" onclick="saveSectionAjax('preferences')">Save changes</button>
            </div>
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

    <!-- Enhanced Additional Skills Modal Dialog (620px Canonical Catalog) -->
    <div id="skillCatalogModal" class="modal-backdrop" style="display: none;">
      <div class="modal-catalog-dialog">
        <!-- Modal Header -->
        <div class="modal-catalog-header">
          <div>
            <h3 class="modal-title" id="catalogModalTitle">Add Skill to Profile</h3>
            <p style="font-size: 0.75rem; color: #94a3b8; margin: 0.15rem 0 0 0;" id="catalogModalSubtitle">
              Browse canonical skill catalog or search by keyword
            </p>
          </div>
          <button type="button" class="modal-close-btn" onclick="closeSkillCatalogModal()">×</button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div class="modal-catalog-body">
          <!-- STAGE 1: BROWSE & SEARCH -->
          <div id="catalogBrowseArea">
            <!-- Search Bar -->
            <div class="catalog-search-box">
              <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #64748b; font-size: 0.85rem;">🔍</span>
              <input
                type="text"
                id="catalogSearchInput"
                placeholder="Search by skill name, alias, or keyword..."
                autocomplete="off"
                oninput="searchCatalogSkills(this.value)"
              />
            </div>

            <!-- Categories Horizontal Filter Bar -->
            <div class="catalog-categories-bar" id="catalogCategoriesBar">
              <!-- Dynamically populated -->
            </div>

            <!-- Skills Results List -->
            <div>
              <div style="font-size: 0.72rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.45rem;">Available Skills</div>
              <div id="catalogSkillsList" class="catalog-skills-container"></div>
            </div>
          </div>

          <!-- STAGE 2: CONFIGURE SKILL -->
          <div id="addSkillForm" style="display: none;">
            <!-- Selected Skill Glass Card -->
            <div class="catalog-selected-card">
              <div>
                <div style="font-size: 0.7rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Selected Skill</div>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem;">
                  <strong id="selectedSkillName" style="color: #f8fafc; font-size: 1.05rem;"></strong>
                  <span id="selectedSkillCategoryBadge" class="badge" style="background: rgba(99, 102, 241, 0.15); color: #c7d2fe; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.7rem;"></span>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="backToCatalogBrowse()" style="font-size: 0.75rem; padding: 0.3rem 0.65rem;">
                ← Change Skill
              </button>
            </div>

            <!-- Skill Provenance Status Selector -->
            <div style="margin-bottom: 1.1rem;">
              <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.4rem;">Skill Status</label>
              <div class="status-pill-toggle">
                <button type="button" id="btnStatusSelfDeclared" class="status-toggle-btn active" onclick="setSkillStatusMode('SELF_DECLARED')">
                  ○ Self-Declared Skill
                </button>
                <button type="button" id="btnStatusLearning" class="status-toggle-btn" onclick="setSkillStatusMode('LEARNING')">
                  📖 Currently Learning
                </button>
              </div>
              <div id="skillStatusDesc" style="font-size: 0.72rem; color: #64748b; margin-top: -0.2rem;">
                You actively use or have practical experience with this skill.
              </div>
            </div>

            <!-- Hidden input maintaining exact contract with backend / tests -->
            <input type="hidden" id="skillProficiency" value="WORKING_KNOWLEDGE" />

            <!-- Proficiency Tier Selector (shown when Self-Declared) -->
            <div id="proficiencyTierGroup" class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label" for="selectedProficiencyTier" style="font-size: 0.8rem; margin-bottom: 0.4rem;">
                Proficiency Level
              </label>
              <select id="selectedProficiencyTier" class="form-select" onchange="handleProficiencyTierChange(this.value)">
                <option value="BASIC">Basic — Conceptual understanding or introductory experience</option>
                <option value="WORKING_KNOWLEDGE" selected>Working Knowledge — Practical hands-on project experience</option>
                <option value="PROFICIENT">Proficient — Confident independent implementation</option>
                <option value="ADVANCED">Advanced — Deep architectural and production expertise</option>
              </select>
            </div>

            <!-- Usage Context Selector -->
            <div class="form-group" style="margin-bottom: 1rem;">
              <label class="form-label" for="skillUsageContext" style="font-size: 0.8rem; margin-bottom: 0.4rem;">
                Usage Context <span style="font-weight: 400; color: #64748b;">(Optional)</span>
              </label>
              <select id="skillUsageContext" class="form-select">
                <option value="">-- How have you used this skill? --</option>
                <option value="PROFESSIONAL_WORK">Professional Production Work</option>
                <option value="INTERNSHIP">Internship Experience</option>
                <option value="PERSONAL_PROJECT">Personal Project / Open Source</option>
                <option value="FREELANCE">Freelance / Client Engagement</option>
                <option value="ACADEMIC_PROJECT">Academic Coursework / Capstone</option>
                <option value="CERTIFICATION">Certification / Structured Course</option>
                <option value="SELF_STUDY">Self-Directed Study & Labs</option>
              </select>
            </div>

            <!-- Context Notes -->
            <div class="form-group" style="margin-bottom: 0.5rem;">
              <label class="form-label" for="skillNotes" style="font-size: 0.8rem; margin-bottom: 0.4rem;">
                Practical Notes <span style="font-weight: 400; color: #64748b;">(Optional)</span>
              </label>
              <textarea
                id="skillNotes"
                class="form-textarea"
                placeholder="Briefly describe what you built or learned with this skill..."
                rows="2"
                style="resize: vertical; font-size: 0.82rem; min-height: 60px;"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Fixed Modal Footer -->
        <div id="catalogModalFooter" class="modal-catalog-footer">
          <button type="button" class="btn btn-secondary btn-sm" onclick="closeSkillCatalogModal()" style="padding: 0.5rem 1rem;">
            Cancel
          </button>
          <button type="button" id="btnConfirmAddSkill" class="btn btn-primary btn-sm" onclick="confirmAddSkill()" style="padding: 0.5rem 1.25rem; display: none;">
            Add Skill
          </button>
        </div>
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

      // Independent dirty tracking and baseline state per section
      const sectionDirtyStates = {
        summary: false,
        contact: false,
        readiness: false,
        preferences: false,
      };

      const lastSavedState = {
        summary: {},
        contact: {},
        readiness: {},
        preferences: {},
      };

      const sectionSaveControllers = {};

      function captureSectionState(sectionId) {
        if (sectionId === 'summary') {
          return {
            displayName: (document.getElementById('displayName')?.value || '').trim(),
            headline: (document.getElementById('headline')?.value || '').trim(),
            currentRole: (document.getElementById('currentRole')?.value || '').trim(),
            careerStatus: document.getElementById('careerStatus')?.value || 'FRESHER',
            location: (document.getElementById('location')?.value || '').trim(),
            summary: (document.getElementById('summary')?.value || '').trim(),
            currentEmployment: profileState.currentEmployment ? JSON.parse(JSON.stringify(profileState.currentEmployment)) : null,
          };
        }
        if (sectionId === 'contact') {
          return {
            phone: (document.getElementById('contactPhoneInput')?.value || '').trim(),
            linkedin: (document.getElementById('contactLinkedinInput')?.value || '').trim(),
            github: (document.getElementById('contactGithubInput')?.value || '').trim(),
            portfolio: (document.getElementById('contactPortfolioInput')?.value || '').trim(),
          };
        }
        if (sectionId === 'readiness') {
          return {
            workAuthorization: (document.getElementById('workAuthInput')?.value || '').trim(),
            visaSponsorshipRequired: document.getElementById('visaSponsorshipRequired')?.value || 'false',
          };
        }
        if (sectionId === 'preferences') {
          return {
            targetRoles: (document.getElementById('targetRolesHidden')?.value || '').trim(),
            preferredLocations: (document.getElementById('preferredLocationsHidden')?.value || '').trim(),
            remotePreference: document.getElementById('remotePreference')?.value || 'FLEXIBLE',
            salaryFloor: (document.getElementById('salaryFloor')?.value || '').trim(),
            salaryCurrency: document.getElementById('salaryCurrency')?.value || 'USD',
            availabilityDate: (document.getElementById('availabilityDate')?.value || '').trim(),
            relocationPreference: document.getElementById('relocationPreference')?.value || 'REMOTE_ONLY',
          };
        }
        return {};
      }

      function initSectionStates() {
        ['summary', 'contact', 'readiness', 'preferences'].forEach(sec => {
          lastSavedState[sec] = captureSectionState(sec);
          sectionDirtyStates[sec] = false;
          updateSectionUI(sec);
        });
      }

      function checkSectionDirty(sectionId) {
        const current = captureSectionState(sectionId);
        const baseline = lastSavedState[sectionId] || {};
        let isDirty = false;

        if (sectionId === 'summary') {
          isDirty =
            current.displayName !== baseline.displayName ||
            current.headline !== baseline.headline ||
            current.currentRole !== baseline.currentRole ||
            current.careerStatus !== baseline.careerStatus ||
            current.location !== baseline.location ||
            current.summary !== baseline.summary ||
            JSON.stringify(current.currentEmployment) !== JSON.stringify(baseline.currentEmployment);
        } else if (sectionId === 'contact') {
          isDirty =
            current.phone !== baseline.phone ||
            current.linkedin !== baseline.linkedin ||
            current.github !== baseline.github ||
            current.portfolio !== baseline.portfolio;
        } else if (sectionId === 'readiness') {
          isDirty =
            current.workAuthorization !== baseline.workAuthorization ||
            current.visaSponsorshipRequired !== baseline.visaSponsorshipRequired;
        } else if (sectionId === 'preferences') {
          isDirty =
            current.targetRoles !== baseline.targetRoles ||
            current.preferredLocations !== baseline.preferredLocations ||
            current.remotePreference !== baseline.remotePreference ||
            current.salaryFloor !== baseline.salaryFloor ||
            current.salaryCurrency !== baseline.salaryCurrency ||
            current.availabilityDate !== baseline.availabilityDate ||
            current.relocationPreference !== baseline.relocationPreference;
        }

        sectionDirtyStates[sectionId] = isDirty;
        updateSectionUI(sectionId);
        if (sectionId === 'preferences') {
          syncReadinessWorkingModelSummary();
        }
        return isDirty;
      }

      function updateSectionUI(sectionId) {
        const isDirty = Boolean(sectionDirtyStates[sectionId]);
        const bar = document.getElementById('actions-' + sectionId);
        if (bar) {
          bar.style.display = isDirty ? 'flex' : 'none';
        }
      }

      function discardSection(sectionId) {
        const baseline = lastSavedState[sectionId];
        if (!baseline) return;

        if (sectionId === 'summary') {
          document.getElementById('displayName').value = baseline.displayName || '';
          document.getElementById('headline').value = baseline.headline || '';
          document.getElementById('currentRole').value = baseline.currentRole || '';
          document.getElementById('careerStatus').value = baseline.careerStatus || 'FRESHER';
          document.getElementById('location').value = baseline.location || '';
          document.getElementById('summary').value = baseline.summary || '';
          profileState.currentEmployment = baseline.currentEmployment ? JSON.parse(JSON.stringify(baseline.currentEmployment)) : null;
          updateCurrentEmploymentDisplay();
        } else if (sectionId === 'contact') {
          document.getElementById('contactPhoneInput').value = baseline.phone || '';
          document.getElementById('contactLinkedinInput').value = baseline.linkedin || '';
          document.getElementById('contactGithubInput').value = baseline.github || '';
          document.getElementById('contactPortfolioInput').value = baseline.portfolio || '';
          updateContactReadinessPills();
        } else if (sectionId === 'readiness') {
          document.getElementById('workAuthInput').value = baseline.workAuthorization || '';
          document.getElementById('visaSponsorshipRequired').value = baseline.visaSponsorshipRequired || 'false';
          updateWorkAuthReadinessPill();
        } else if (sectionId === 'preferences') {
          document.getElementById('targetRolesHidden').value = baseline.targetRoles || '';
          document.getElementById('preferredLocationsHidden').value = baseline.preferredLocations || '';
          document.getElementById('remotePreference').value = baseline.remotePreference || 'FLEXIBLE';
          document.getElementById('salaryFloor').value = baseline.salaryFloor || '';
          document.getElementById('salaryCurrency').value = baseline.salaryCurrency || 'USD';
          document.getElementById('availabilityDate').value = baseline.availabilityDate || '';
          document.getElementById('relocationPreference').value = baseline.relocationPreference || 'REMOTE_ONLY';
          if (rolesController && rolesController.renderChips) rolesController.renderChips();
          if (locationsController && locationsController.renderChips) locationsController.renderChips();
          syncReadinessWorkingModelSummary();
        }

        sectionDirtyStates[sectionId] = false;
        updateSectionUI(sectionId);
      }

      function buildContactPortfolioLinks() {
        const linkedinUrl = (document.getElementById('contactLinkedinInput')?.value || '').trim();
        const githubUrl = (document.getElementById('contactGithubInput')?.value || '').trim();
        const portfolioUrl = (document.getElementById('contactPortfolioInput')?.value || '').trim();

        // Preserve custom portfolio links that are not linkedin, github, or primary portfolio
        const remaining = (profileState.portfolioLinks || []).filter(l => {
          const lbl = (l.label || '').toUpperCase();
          const url = (l.url || '').toLowerCase();
          if (lbl === 'LINKEDIN' || url.includes('linkedin.com')) return false;
          if (lbl === 'GITHUB' || url.includes('github.com')) return false;
          if (lbl === 'PORTFOLIO' || lbl === 'WEBSITE') return false;
          return true;
        });

        if (linkedinUrl) remaining.push({ label: 'LINKEDIN', url: linkedinUrl });
        if (githubUrl) remaining.push({ label: 'GITHUB', url: githubUrl });
        if (portfolioUrl) remaining.push({ label: 'PORTFOLIO', url: portfolioUrl });

        return remaining;
      }

      function syncReadinessWorkingModelSummary() {
        const remoteVal = document.getElementById('remotePreference')?.value || 'FLEXIBLE';
        const availVal = (document.getElementById('availabilityDate')?.value || '').trim() || 'Immediately';
        const relocVal = document.getElementById('relocationPreference')?.value || 'REMOTE_ONLY';

        const remoteEl = document.getElementById('summaryRemoteModel');
        const availEl = document.getElementById('summaryAvailability');
        const relocEl = document.getElementById('summaryRelocation');
        if (remoteEl) remoteEl.textContent = remoteVal;
        if (availEl) availEl.textContent = availVal;
        if (relocEl) relocEl.textContent = relocVal;

        const qaAvailEl = document.getElementById('qaAnswerAvailability');
        if (qaAvailEl) qaAvailEl.textContent = availVal;
      }

      function updateContactReadinessPills() {
        const phone = (document.getElementById('contactPhoneInput')?.value || '').trim();
        const linkedin = (document.getElementById('contactLinkedinInput')?.value || '').trim();
        const github = (document.getElementById('contactGithubInput')?.value || '').trim();
        const portfolio = (document.getElementById('contactPortfolioInput')?.value || '').trim();

        const phonePill = document.getElementById('phoneReadinessPill');
        if (phonePill) {
          phonePill.className = 'readiness-pill ' + (phone ? 'ready' : 'missing');
          phonePill.textContent = phone ? '✓ Ready' : '⚠ Missing';
        }

        const linkedinPill = document.getElementById('linkedinReadinessPill');
        if (linkedinPill) {
          linkedinPill.className = 'readiness-pill ' + (linkedin ? 'ready' : 'missing');
          linkedinPill.textContent = linkedin ? '✓ Ready' : '⚠ Missing';
        }

        const githubPill = document.getElementById('githubReadinessPill');
        if (githubPill) {
          githubPill.className = 'readiness-pill ' + (github ? 'ready' : 'missing');
          githubPill.textContent = github ? '✓ Ready' : '⚠ Missing';
        }

        const portfolioPill = document.getElementById('portfolioReadinessPill');
        if (portfolioPill) {
          portfolioPill.className = 'readiness-pill ' + (portfolio ? 'ready' : 'optional');
          portfolioPill.textContent = portfolio ? '✓ Ready' : '○ Optional';
        }
      }

      function updateWorkAuthReadinessPill() {
        const auth = (document.getElementById('workAuthInput')?.value || '').trim();
        const pill = document.getElementById('workAuthReadinessPill');
        if (pill) {
          pill.className = 'readiness-pill ' + (auth ? 'ready' : 'needs-confirmation');
          pill.textContent = auth ? '✓ Ready' : '⚠ Needs confirmation';
        }
        const qaAuth = document.getElementById('qaAnswerWorkAuth');
        if (qaAuth) {
          qaAuth.textContent = auth || 'Authorized to work in country of residence';
        }
        const visaVal = document.getElementById('visaSponsorshipRequired')?.value === 'true';
        const qaSpons = document.getElementById('qaAnswerSponsorship');
        if (qaSpons) {
          qaSpons.textContent = visaVal ? 'Yes, I require employer visa sponsorship' : 'No, I do not require sponsorship';
        }
      }

      function showSavedFeedback(sectionId) {
        const headerStatusEl = document.getElementById('header-status-' + sectionId);
        if (headerStatusEl) {
          headerStatusEl.textContent = '✓ Saved';
          headerStatusEl.style.display = 'inline';
          headerStatusEl.style.color = '#34d399';
          headerStatusEl.style.opacity = '1';
          setTimeout(() => {
            headerStatusEl.style.opacity = '0';
            setTimeout(() => {
              headerStatusEl.style.display = 'none';
            }, 300);
          }, 2200);
        }
      }

      async function saveSectionAjax(sectionId) {
        if (sectionSaveControllers[sectionId]) {
          sectionSaveControllers[sectionId].abort();
        }
        sectionSaveControllers[sectionId] = new AbortController();

        const saveBtn = document.getElementById('btn-save-' + sectionId);
        const statusEl = document.getElementById('status-' + sectionId);

        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<span class="spinner-sm"></span> Saving...';
        }
        if (statusEl) statusEl.textContent = '';

        const csrfToken = document.querySelector('input[name="_csrf"]')?.value || '';
        const payload = { sections: {} };

        if (sectionId === 'summary') {
          payload.sections.identity = {
            displayName: document.getElementById('displayName').value.trim(),
            headline: document.getElementById('headline').value.trim(),
            summary: document.getElementById('summary').value.trim(),
            currentRole: document.getElementById('currentRole').value.trim(),
            location: document.getElementById('location').value.trim(),
            careerStatus: document.getElementById('careerStatus').value,
          };
          payload.sections.currentEmployment = profileState.currentEmployment;
        } else if (sectionId === 'contact') {
          payload.sections.contact = {
            phone: (document.getElementById('contactPhoneInput')?.value || '').trim(),
          };
          payload.sections.portfolioLinks = buildContactPortfolioLinks();
        } else if (sectionId === 'readiness') {
          payload.sections.preferences = {
            workAuthorization: (document.getElementById('workAuthInput')?.value || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            visaSponsorshipRequired: document.getElementById('visaSponsorshipRequired')?.value === 'true',
          };
        } else if (sectionId === 'preferences') {
          payload.sections.preferences = {
            targetRoles: (document.getElementById('targetRolesHidden')?.value || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            preferredLocations: (document.getElementById('preferredLocationsHidden')?.value || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean),
            remotePreference: document.getElementById('remotePreference')?.value,
            salaryFloor: document.getElementById('salaryFloor')?.value ? Number(document.getElementById('salaryFloor').value) : null,
            salaryCurrency: document.getElementById('salaryCurrency')?.value,
            availabilityDate: (document.getElementById('availabilityDate')?.value || '').trim(),
            relocationPreference: document.getElementById('relocationPreference')?.value,
          };
        }

        try {
          const response = await fetch('/api/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
            signal: sectionSaveControllers[sectionId].signal,
          });

          if (!response.ok) {
            let errorMsg = 'HTTP ' + response.status;
            try {
              const errData = await response.json();
              if (errData.error) errorMsg = errData.error;
            } catch {}
            throw new Error(errorMsg);
          }

          const result = await response.json();
          if (result.ok) {
            // Update baseline snapshot for this section only
            lastSavedState[sectionId] = captureSectionState(sectionId);
            sectionDirtyStates[sectionId] = false;

            // Reflect cross-section summary values
            if (sectionId === 'preferences') {
              syncReadinessWorkingModelSummary();
            } else if (sectionId === 'contact') {
              profileState.portfolioLinks = buildContactPortfolioLinks();
              renderLinks();
            } else if (sectionId === 'readiness') {
              updateWorkAuthReadinessPill();
            }

            // Hide save controls for this section
            updateSectionUI(sectionId);

            // Show brief saved feedback
            showSavedFeedback(sectionId);
          } else {
            throw new Error('Server reported failure');
          }
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error('Section save failed (' + sectionId + '):', err);
          if (statusEl) {
            statusEl.textContent = '⚠️ Save failed';
            statusEl.style.color = '#ef4444';
          }
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Save changes';
          }
        }
      }

      // Persist modal-based CRUD immediately without section dirty bars
      async function persistModalCollection(sectionKey, data, headerStatusId) {
        const csrfToken = document.querySelector('input[name="_csrf"]')?.value || '';
        const payload = { sections: { [sectionKey]: data } };
        try {
          const res = await fetch('/api/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            showSavedFeedback(headerStatusId);
          }
        } catch (err) {
          console.error('Modal collection save error (' + sectionKey + '):', err);
        }
      }

      function formatAdditionalSkillsForPayload() {
        return additionalSkillsData.map((s, idx) => {
          if (!s.catalogSkillId) {
            throw new Error('Additional skill at position ' + (idx + 1) + ' (' + (s.skillName || 'Unknown') + ') is missing required catalogSkillId');
          }
          return {
            catalogSkillId: s.catalogSkillId,
            proficiency: s.proficiency || 'WORKING_KNOWLEDGE',
            usageContext: s.usageContext || null,
            notes: s.notes || null,
          };
        });
      }

      // Intercept form submission so native form submit never happens
      document.getElementById('careerProfileForm').addEventListener('submit', function(e) {
        e.preventDefault();
      });

      window.addEventListener('beforeunload', function(e) {
        const hasUnsaved = Object.values(sectionDirtyStates).some(Boolean);
        if (hasUnsaved) {
          e.preventDefault();
          e.returnValue = '';
        }
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

      async function saveExperienceModal(e) {
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
        await persistModalCollection('experience', profileState.experiences, 'experience');
      }

      async function deleteExperience(idx) {
        if (confirm('Are you sure you want to remove this experience record?')) {
          profileState.experiences.splice(idx, 1);
          renderExperiences();
          await persistModalCollection('experience', profileState.experiences, 'experience');
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

      async function saveEducationModal(e) {
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
        await persistModalCollection('education', profileState.education, 'education');
      }

      async function deleteEducation(idx) {
        if (confirm('Are you sure you want to delete this education record?')) {
          profileState.education.splice(idx, 1);
          renderEducation();
          await persistModalCollection('education', profileState.education, 'education');
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
        checkSectionDirty('summary');
      }

      function updateCurrentEmploymentDisplay() {
        const textElem = document.getElementById('currentEmploymentText');
        const ce = profileState.currentEmployment;
        if (ce) {
          textElem.innerHTML = '<span><strong>' + escapeHtml(ce.title) + '</strong> at ' + escapeHtml(ce.company) + ' <span class="badge" style="font-size:0.68rem; margin-left:0.3rem;">' + escapeHtml(ce.employmentType || 'FULL_TIME') + '</span></span>';
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
            <div style="background: #0B0F19; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
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

      async function saveCertModal(e) {
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
        await persistModalCollection('certifications', profileState.certifications, 'credentials');
      }

      async function deleteCert(idx) {
        profileState.certifications.splice(idx, 1);
        renderCertifications();
        await persistModalCollection('certifications', profileState.certifications, 'credentials');
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
            <div style="background: #0B0F19; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
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

      async function saveLangModal(e) {
        e.preventDefault();
        const record = {
          language: document.getElementById('langName').value.trim(),
          proficiency: document.getElementById('langProf').value,
          provenanceStatus: 'USER_PROVIDED',
        };
        profileState.languages.push(record);
        renderLanguages();
        closeLangModal();
        await persistModalCollection('languages', profileState.languages, 'credentials');
      }

      async function deleteLang(idx) {
        profileState.languages.splice(idx, 1);
        renderLanguages();
        await persistModalCollection('languages', profileState.languages, 'credentials');
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

      async function saveLinkModal(e) {
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
        await persistModalCollection('portfolioLinks', profileState.portfolioLinks, 'contact');
      }

      async function deleteLink(idx) {
        profileState.portfolioLinks.splice(idx, 1);
        renderLinks();
        await persistModalCollection('portfolioLinks', profileState.portfolioLinks, 'contact');
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
            checkSectionDirty('preferences');
          }
          input.value = '';
        }

        function removeValue(val) {
          const current = hidden.value.split(',').map(s => s.trim()).filter(Boolean);
          const filtered = current.filter(v => v !== val);
          hidden.value = filtered.join(',');
          renderChips();
          checkSectionDirty('preferences');
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
        return { addValue, removeValue, renderChips };
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

      // --- Additional Skills Rendering (local state only) ---
      function renderAdditionalSkills() {
        const container = document.getElementById('additionalSkillsContainer');
        if (!container) return;

        if (additionalSkillsData.length === 0) {
          container.innerHTML = '<div style="color: #64748b; font-size: 0.82rem; font-style: italic; padding: 0.5rem 0;">No additional skills declared yet. Click "+ Add Skill" to get started.</div>';
          return;
        }

        const proficiencyColors = {
          BASIC: { bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.25)', text: '#fbbf24' },
          WORKING_KNOWLEDGE: { bg: 'rgba(96, 165, 250, 0.1)', border: 'rgba(96, 165, 250, 0.25)', text: '#60a5fa' },
          PROFICIENT: { bg: 'rgba(52, 211, 153, 0.1)', border: 'rgba(52, 211, 153, 0.25)', text: '#34d399' },
          ADVANCED: { bg: 'rgba(167, 139, 250, 0.1)', border: 'rgba(167, 139, 250, 0.25)', text: '#a78bfa' },
          CURRENTLY_LEARNING: { bg: 'rgba(251, 146, 60, 0.1)', border: 'rgba(251, 146, 60, 0.25)', text: '#fb923c' },
        };

        container.innerHTML = '<div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">' +
          additionalSkillsData.map(s => {
            const pColor = proficiencyColors[s.proficiency] || proficiencyColors.WORKING_KNOWLEDGE;
            const provLabel = s.provenanceStatus === 'LEARNING' ? 'Learning' : 'Self-Declared';
            return '<span class="skill-tag-badge" style="background: ' + pColor.bg + '; color: ' + pColor.text + '; border: 1px solid ' + pColor.border + '; font-size: 0.75rem; padding: 0.3rem 0.55rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.3rem; cursor: default;" title="Proficiency: ' + escapeHtml(s.proficiency) + ' | Status: ' + provLabel + (s.notes ? ' | ' + escapeHtml(s.notes) : '') + '">' +
              '<strong>' + escapeHtml(s.skillName) + '</strong> ' +
              '<span style="font-size: 0.68rem; opacity: 0.85;">' + escapeHtml(s.proficiency.replace(/_/g, ' ')) + '</span>' +
              '<button type="button" data-remove-id="' + escapeHtml(s.id) + '" onclick="removeAdditionalSkill(this.dataset.removeId)" style="background: none; border: none; color: inherit; cursor: pointer; font-size: 0.8rem; padding: 0 2px; margin-left: 0.2rem; opacity: 0.7;" title="Remove">×</button>' +
            '</span>';
          }).join('') +
        '</div>';
      }

      async function removeAdditionalSkill(skillId) {
        if (!confirm('Remove this skill from your additional skills?')) return;
        additionalSkillsData = additionalSkillsData.filter(s => s.id !== skillId);
        renderAdditionalSkills();
        await persistModalCollection('additionalSkills', formatAdditionalSkillsForPayload(), 'skills');
      }

      // --- Skill Catalog Modal — ENTIRELY CLIENT-SIDE ---
      const categoryLabels = {
        CLOUD: 'Cloud & Infrastructure',
        CONTAINERS: 'Containers & IaC',
        CICD: 'CI/CD & GitOps',
        DATABASES: 'Databases / Cache / Search',
        MESSAGING: 'Messaging & Events',
        NETWORKING: 'Networking',
        OBSERVABILITY: 'Observability & Reliability',
        SECURITY: 'Security & Identity',
        ARCHITECTURE: 'Software Architecture',
        DEVELOPMENT: 'Development & Testing',
        AI_DEVELOPMENT: 'AI-Assisted Development',
        GENAI: 'Generative AI',
        AI_AGENTS: 'AI Agents',
        MCP: 'MCP & AI Interop',
        AI_QUALITY: 'AI Evaluation & Quality',
        MLOPS: 'MLOps & AI Platform',
        DX: 'Developer Experience',
        PRACTICES: 'Engineering Practices',
      };
      let currentActiveCategory = 'ALL';

      function openSkillCatalogModal() {
        const modal = document.getElementById('skillCatalogModal');
        if (!modal) return;
        modal.classList.add('open');
        modal.style.display = 'flex';
        document.getElementById('catalogSearchInput').value = '';
        document.getElementById('addSkillForm').style.display = 'none';
        document.getElementById('catalogBrowseArea').style.display = 'block';
        const confirmBtn = document.getElementById('btnConfirmAddSkill');
        if (confirmBtn) confirmBtn.style.display = 'none';
        const titleEl = document.getElementById('catalogModalTitle');
        if (titleEl) titleEl.textContent = 'Add Skill to Profile';
        const subtitleEl = document.getElementById('catalogModalSubtitle');
        if (subtitleEl) subtitleEl.textContent = 'Browse canonical skill catalog or search by keyword';
        currentActiveCategory = 'ALL';
        renderCatalogCategories('ALL');
        loadCatalogByCategory('ALL');
      }

      function closeSkillCatalogModal() {
        const modal = document.getElementById('skillCatalogModal');
        if (modal) {
          modal.classList.remove('open');
          modal.style.display = 'none';
        }
        selectedCatalogSkill = null;
      }

      function renderCatalogCategories(activeCat) {
        const container = document.getElementById('catalogCategoriesList');
        if (!container) return;
        const active = activeCat || currentActiveCategory || 'ALL';
        const totalCount = allCatalogSkills.length;

        const allPill = '<button type="button" class="catalog-cat-pill ' + (active === 'ALL' ? 'active' : '') + '" data-cat="ALL" onclick="loadCatalogByCategory(this.dataset.cat)">' +
          'All <span class="pill-count">(' + totalCount + ')</span>' +
        '</button>';

        const catPills = catalogCategories.map(cat => {
          const isAct = active === cat.category;
          const label = categoryLabels[cat.category] || escapeHtml(cat.category);
          return '<button type="button" class="catalog-cat-pill ' + (isAct ? 'active' : '') + '" data-cat="' + escapeHtml(cat.category) + '" onclick="loadCatalogByCategory(this.dataset.cat)">' +
            label + ' <span class="pill-count">(' + cat.count + ')</span>' +
          '</button>';
        }).join('');

        container.innerHTML = allPill + catPills;
      }

      function loadCatalogByCategory(category) {
        currentActiveCategory = category || 'ALL';
        renderCatalogCategories(currentActiveCategory);
        const summaryEl = document.getElementById('catalogCategorySummary');

        let filtered;
        let label;
        if (!category || category === 'ALL') {
          filtered = allCatalogSkills.slice(0, 80);
          label = 'All Skills';
          if (summaryEl) summaryEl.textContent = 'Showing all (' + filtered.length + ' shown)';
        } else {
          filtered = allCatalogSkills.filter(s => s.category === category).slice(0, 100);
          label = categoryLabels[category] || category;
          if (summaryEl) summaryEl.textContent = label + ' (' + filtered.length + ')';
        }
        _showCatalogResults(filtered, label);
      }

      function searchCatalogSkills(query) {
        const q = (query || '').toLowerCase().trim();

        if (!q || q.length < 1) {
          loadCatalogByCategory(currentActiveCategory || 'ALL');
          return;
        }

        const results = allCatalogSkills.filter(s => {
          const name = (s.canonicalName || '').toLowerCase();
          const slug = (s.slug || '').toLowerCase();
          const aliases = Array.isArray(s.aliases) ? s.aliases.map(a => a.toLowerCase()) : [];
          return name.includes(q) || slug.includes(q) || aliases.some(a => a.includes(q));
        }).slice(0, 40);

        _showCatalogResults(results, 'Results for "' + escapeHtml(query) + '"');
      }

      function _showCatalogResults(skills, label) {
        const container = document.getElementById('catalogSkillsList');
        if (!container) return;

        if (!skills || skills.length === 0) {
          container.innerHTML = '<div style="text-align: center; padding: 2.5rem 1rem; color: #64748b; font-size: 0.85rem;">' +
            '<div style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.6;">🔍</div>' +
            'No matching skills found in catalog.' +
          '</div>';
          return;
        }

        const existingSlugs = new Set(additionalSkillsData.map(s => (s.skillSlug || '').toLowerCase()));
        const existingIds = new Set(additionalSkillsData.map(s => s.catalogSkillId).filter(Boolean));
        const existingNames = new Set(additionalSkillsData.map(s => (s.skillName || '').toLowerCase()));

        const items = skills.map(skill => {
          const sid = escapeHtml(skill.id);
          const sname = escapeHtml(skill.canonicalName);
          const scat = escapeHtml(skill.category);
          const catDisplay = categoryLabels[skill.category] || scat;
          const isAdded = existingIds.has(skill.id) ||
                          existingSlugs.has((skill.slug || '').toLowerCase()) ||
                          existingNames.has((skill.canonicalName || '').toLowerCase());

          return '<div class="catalog-skill-card">' +
            '<div class="catalog-skill-info">' +
              '<span class="catalog-skill-name">' + sname + '</span>' +
              '<span class="catalog-skill-cat-tag">' + catDisplay + '</span>' +
            '</div>' +
            (isAdded ?
              '<span class="badge" style="background: rgba(255, 255, 255, 0.05); color: #94a3b8; font-size: 0.72rem; padding: 0.25rem 0.6rem; border: 1px solid rgba(255, 255, 255, 0.09);">✓ Added</span>' :
              '<button type="button" class="catalog-skill-item-btn btn btn-secondary btn-sm" ' +
                'data-skill-id="' + sid + '" ' +
                'data-skill-name="' + sname + '" ' +
                'data-skill-category="' + scat + '" ' +
                'onclick="handleCatalogSkillClick(this)" ' +
                'style="padding: 0.3rem 0.75rem; font-size: 0.78rem;">' +
                '+ Add' +
              '</button>'
            ) +
          '</div>';
        }).join('');

        container.innerHTML = items;
      }

      function handleCatalogSkillClick(btn) {
        if (!btn) return;
        const target = btn.closest ? btn.closest('[data-skill-id]') : btn;
        if (!target) return;
        const skillId = target.getAttribute('data-skill-id');
        const skillName = target.getAttribute('data-skill-name');
        const category = target.getAttribute('data-skill-category');
        selectCatalogSkill(skillId, skillName, category);
      }

      function selectCatalogSkill(skillId, skillName, category) {
        selectedCatalogSkill = { id: skillId, name: skillName, category: category };
        document.getElementById('selectedSkillName').textContent = skillName;
        const catBadge = document.getElementById('selectedSkillCategoryBadge');
        if (catBadge) catBadge.textContent = categoryLabels[category] || category;

        document.getElementById('addSkillForm').style.display = 'block';
        document.getElementById('catalogBrowseArea').style.display = 'none';
        const confirmBtn = document.getElementById('btnConfirmAddSkill');
        if (confirmBtn) confirmBtn.style.display = 'inline-flex';
        const titleEl = document.getElementById('catalogModalTitle');
        if (titleEl) titleEl.textContent = 'Configure Skill';
        const subtitleEl = document.getElementById('catalogModalSubtitle');
        if (subtitleEl) subtitleEl.textContent = 'Set proficiency level and optional usage context';

        // Default to Self-Declared mode
        setSkillStatusMode('SELF_DECLARED');
      }

      function backToCatalogBrowse() {
        document.getElementById('addSkillForm').style.display = 'none';
        document.getElementById('catalogBrowseArea').style.display = 'block';
        const confirmBtn = document.getElementById('btnConfirmAddSkill');
        if (confirmBtn) confirmBtn.style.display = 'none';
        const titleEl = document.getElementById('catalogModalTitle');
        if (titleEl) titleEl.textContent = 'Add Skill to Profile';
        const subtitleEl = document.getElementById('catalogModalSubtitle');
        if (subtitleEl) subtitleEl.textContent = 'Browse canonical skill catalog or search by keyword';
      }

      function setSkillStatusMode(mode) {
        const btnSelf = document.getElementById('btnStatusSelfDeclared');
        const btnLearn = document.getElementById('btnStatusLearning');
        const tierGroup = document.getElementById('proficiencyTierGroup');
        const desc = document.getElementById('skillStatusDesc');
        const profInput = document.getElementById('skillProficiency');

        if (mode === 'LEARNING') {
          if (btnSelf) btnSelf.classList.remove('active');
          if (btnLearn) btnLearn.classList.add('active');
          if (tierGroup) tierGroup.style.display = 'none';
          if (desc) desc.textContent = 'This skill will be marked as an active learning goal in your career profile.';
          if (profInput) profInput.value = 'CURRENTLY_LEARNING';
        } else {
          if (btnSelf) btnSelf.classList.add('active');
          if (btnLearn) btnLearn.classList.remove('active');
          if (tierGroup) tierGroup.style.display = 'block';
          if (desc) desc.textContent = 'You actively use or have practical experience with this skill.';
          const tierSelect = document.getElementById('selectedProficiencyTier');
          if (profInput) profInput.value = tierSelect ? tierSelect.value : 'WORKING_KNOWLEDGE';
        }
      }

      function handleProficiencyTierChange(val) {
        const btnSelf = document.getElementById('btnStatusSelfDeclared');
        if (btnSelf && btnSelf.classList.contains('active')) {
          const profInput = document.getElementById('skillProficiency');
          if (profInput) profInput.value = val;
        }
      }

      async function confirmAddSkill() {
        if (!selectedCatalogSkill) return;
        const proficiency = document.getElementById('skillProficiency').value;
        const usageContext = document.getElementById('skillUsageContext').value || null;
        const notes = document.getElementById('skillNotes').value || null;
        const isLearning = proficiency === 'CURRENTLY_LEARNING';

        // Add to local state and persist collection
        const newSkill = {
          id: 'local-' + (++_localSkillIdCounter),
          catalogSkillId: selectedCatalogSkill.id,
          skillName: selectedCatalogSkill.name,
          skillSlug: selectedCatalogSkill.name.toLowerCase().replace(/ +/g, '-'),
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
        await persistModalCollection('additionalSkills', formatAdditionalSkillsForPayload(), 'skills');
      }

      // Initial page initialization
      renderExperiences();
      renderEducation();
      renderCertifications();
      renderLanguages();
      renderLinks();
      renderAdditionalSkills();
      initSectionStates();
    </script>
  `;

  return renderLayout({
    title: 'Candidate Career Profile & Workspace',
    user,
    tenant,
    currentPath: '/profile',
    content,
  });
}
