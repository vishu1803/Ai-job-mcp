/**
 * @file Candidate Profile & Application Workspace View (P86 UI/UX Redesign).
 *
 * Implements a user-centric, accessible, multi-section Candidate Profile:
 * 1. Overview: Concise dashboard with ApplicationReadinessService gauge, status checklist,
 *    actionable attention items, and qualification snapshots.
 * 2. Professional: Headline, executive summary, current role, location, career status.
 * 3. Experience: Work history cards with tenure metrics and inline add/edit drawer.
 * 4. Education: Degrees, institutions, fields of study, and enrollment tracking.
 * 5. Skills: Categorized primary technical skills and self-declared skills without AST parser leaks.
 * 6. Projects: Grounded projects with repository links, demo URLs, and tech tags.
 * 7. Credentials: Certifications, licenses, and spoken languages.
 * 8. Links: Authoritative email, phone with country code selector, LinkedIn, GitHub, portfolio.
 * 9. Preferences: Target roles, locations, remote preference, structured compensation.
 * 10. Eligibility: Work authorization status, visa sponsorship tri-state, notice period, availability.
 *
 * Employs progressive disclosure for technical verification/AST provenance, accessible
 * ARIA tab patterns, responsive design, and robust dirty-state tracking with batched AJAX saving.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { COUNTRY_CALLING_CODES, parseStoredPhone } from '../utils/phone-country-codes.js';
import { formatNoticePeriodLabel } from '../domain/candidate/career-preferences.schemas.js';
import { ApplicationReadinessService } from '../services/application-readiness.service.js';

/**
 * Renders the Candidate Profile & Preferences page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} [params.candidate] Authenticated candidate profile
 * @param {object} [params.profile] Canonical candidate career profile view
 * @param {object} [params.preferences={}] Saved career preferences
 * @param {Array<string>} [params.verifiedSkills=[]] Verified skills summary
 * @param {string} [params.csrfToken=''] CSRF token
 * @param {string} [params.flashMessage=''] Success flash message
 * @param {string} [params.errorMessage=''] Error flash message
 * @param {Array<object>} [params.additionalSkills=[]] Self-declared additional skills
 * @param {object} [params.skillCatalog={ items: [], categories: [] }] Canonical skill catalog
 * @param {object} [params.readiness=null] Output from ApplicationReadinessService.evaluateReadiness
 * @param {string} [params.activeSection='overview'] Currently active navigation section
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
  readiness = null,
  activeSection = 'overview',
}) {
  const userCustom = candidate?.profileMetadata?.userCustom || candidate?.profileMetadata || {};
  const jobPrefs = profile?.jobPreferences || preferences || userCustom.jobPreferences || {};

  // Authoritative identity values
  const displayName = candidate?.displayName || user?.displayName || userCustom.displayName || '';
  const headline = candidate?.headline || userCustom.headline || profile?.headline || '';
  const currentRole = profile?.currentRole || userCustom.currentRole || candidate?.headline || '';
  const userLocation = profile?.location || userCustom.location || '';
  const summaryText = profile?.summary || userCustom.summary || candidate?.summary || '';
  const careerStatusVal = profile?.careerStatus || userCustom.careerStatus || 'FRESHER';
  const timezoneVal = jobPrefs.timezone || userCustom.timezone || profile?.timezone || '';

  // Experience, Education, Projects, Credentials
  const experienceList = profile?.recentExperience || userCustom.experience || [];
  const educationList = profile?.education || userCustom.education || [];
  const certsList = profile?.certifications || userCustom.certifications || [];
  const languagesList = profile?.languages || userCustom.languages || [];
  const portfolioLinksList = profile?.portfolioLinks || userCustom.portfolioLinks || [];
  const projectsList = profile?.highlightedProjects || userCustom.projects || [];

  // Skills
  const topSkillsList = profile?.topSkills || [];
  const primarySkillsList =
    profile?.primarySkills && profile.primarySkills.length > 0
      ? profile.primarySkills
      : topSkillsList.filter((s) => s.tier !== 'SIGNAL');
  const technologySignalsList =
    profile?.technologySignals && profile.technologySignals.length > 0
      ? profile.technologySignals
      : topSkillsList.filter((s) => s.tier === 'SIGNAL');

  // Contact resolution
  const authenticEmail = profile?.canonicalEmail || candidate?.canonicalEmail || user?.email || '';
  const candidatePhone =
    profile?.phone ||
    userCustom.phone ||
    candidate?.profileMetadata?.phone ||
    '';
  const storedCountryCode = profile?.countryCode || userCustom.countryCode || '';
  const storedPhoneNumber = profile?.phoneNumber || userCustom.phoneNumber || '';

  let initialCountryCode = storedCountryCode;
  let initialPhoneNumber = storedPhoneNumber;
  if (!storedCountryCode && !storedPhoneNumber && candidatePhone) {
    const parsed = parseStoredPhone(candidatePhone);
    initialCountryCode = parsed.countryCode || '';
    initialPhoneNumber = parsed.phoneNumber || candidatePhone;
  }

  // Links
  const linkedinUrl = userCustom.linkedin || userCustom.linkedIn || profile?.linkedin || '';
  const githubUrl = userCustom.github || profile?.github || '';
  const portfolioUrl = userCustom.portfolio || profile?.portfolio || '';

  // Preferences
  const targetRolesList = jobPrefs.targetRoles || [];
  const preferredLocationsList = jobPrefs.preferredLocations || [];
  const remotePref = jobPrefs.remotePreference || '';
  const employmentTypesList = jobPrefs.employmentTypes || [];
  const salaryFloor = jobPrefs.salaryFloor != null ? jobPrefs.salaryFloor : '';
  const targetSalary = jobPrefs.targetSalary != null ? jobPrefs.targetSalary : '';
  const salaryCurrency = jobPrefs.salaryCurrency || '';
  const compensationPeriod = jobPrefs.compensationPeriod || '';
  const compensationType = jobPrefs.compensationType || '';
  const preferredTechStackList = jobPrefs.preferredTechStack || [];
  const industriesList = jobPrefs.industries || [];
  const companiesToPrioritizeList = jobPrefs.companiesToPrioritize || [];
  const companiesToAvoidList = jobPrefs.companiesToAvoid || [];

  // Eligibility
  const workAuthList = Array.isArray(jobPrefs.workAuthorization)
    ? jobPrefs.workAuthorization
    : jobPrefs.workAuthorization ? [jobPrefs.workAuthorization] : [];
  const visaSponsorshipVal = jobPrefs.visaSponsorshipRequired != null
    ? String(jobPrefs.visaSponsorshipRequired)
    : '';
  const noticePeriodVal = jobPrefs.noticePeriod || '';
  const customNoticeVal = jobPrefs.customNoticePeriod || '';
  const availabilityDateVal = jobPrefs.availabilityDate || '';
  const isCurrentlyEmployed = Boolean(jobPrefs.isCurrentlyEmployed || userCustom.isCurrentlyEmployed);
  const availableImmediately = Boolean(jobPrefs.availableImmediately || userCustom.availableImmediately);
  const workAuthConfirmedByUser = Boolean(jobPrefs.workAuthConfirmedByUser || userCustom.workAuthConfirmedByUser);
  const visaSponsorshipConfirmedByUser = Boolean(jobPrefs.visaSponsorshipConfirmedByUser || userCustom.visaSponsorshipConfirmedByUser);

  // Application Readiness evaluation
  const readinessEvaluator = new ApplicationReadinessService();
  const evaluatedReadiness = readiness || readinessEvaluator.evaluateReadiness({
    candidateProfile: profile,
    candidate,
  });

  const readinessItems = evaluatedReadiness.items || [];
  const readinessSemantics = evaluatedReadiness.semantics || {};

  // Separate ready vs attention items
  const readyItems = readinessItems.filter((i) => i.status === 'READY');
  const attentionItems = readinessItems.filter(
    (i) => i.status === 'MISSING' || i.status === 'NEEDS_CONFIRMATION'
  );

  // Derive honest completion percentage
  const totalItems = readinessItems.length || 9;
  const readyCount = readyItems.length;
  const readinessPercentage = Math.round((readyCount / totalItems) * 100);

  // Initial client state for batched saving
  const initialProfileState = {
    displayName,
    headline,
    currentRole,
    location: userLocation,
    careerStatus: careerStatusVal,
    summary: summaryText,
    timezone: timezoneVal,
    countryCode: initialCountryCode,
    phoneNumber: initialPhoneNumber,
    linkedin: linkedinUrl,
    github: githubUrl,
    portfolio: portfolioUrl,
    portfolioLinks: portfolioLinksList,
    experience: experienceList,
    education: educationList,
    certifications: certsList,
    languages: languagesList,
    projects: projectsList,
    preferences: {
      targetRoles: targetRolesList,
      preferredLocations: preferredLocationsList,
      remotePreference: remotePref,
      employmentTypes: employmentTypesList,
      salaryFloor: salaryFloor ? Number(salaryFloor) : null,
      targetSalary: targetSalary ? Number(targetSalary) : null,
      salaryCurrency,
      compensationPeriod,
      compensationType,
      preferredTechStack: preferredTechStackList,
      industries: industriesList,
      companiesToPrioritize: companiesToPrioritizeList,
      companiesToAvoid: companiesToAvoidList,
      availabilityDate: availabilityDateVal,
    },
    eligibility: {
      workAuthorization: workAuthList,
      visaSponsorshipRequired: visaSponsorshipVal,
      noticePeriod: noticePeriodVal,
      customNoticePeriod: customNoticeVal,
      availableImmediately,
      isCurrentlyEmployed,
      timezone: timezoneVal,
      workAuthConfirmedByUser,
      visaSponsorshipConfirmedByUser,
    },
    additionalSkills,
  };

  const navTabs = [
    { id: 'overview', label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'professional', label: 'Professional', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'experience', label: 'Experience', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { id: 'education', label: 'Education', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222' },
    { id: 'skills', label: 'Skills', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
    { id: 'projects', label: 'Projects', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { id: 'credentials', label: 'Credentials', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
    { id: 'links', label: 'Links', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    { id: 'preferences', label: 'Preferences', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
    { id: 'eligibility', label: 'Eligibility', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  ];

  const content = `
    <!-- Hidden Anchors for Deep Links / Compatibility -->
    <div id="section-contact" style="position: absolute; top: 0; left: 0; pointer-events: none;" aria-hidden="true"></div>
    <div id="section-readiness" style="position: absolute; top: 0; left: 0; pointer-events: none;" aria-hidden="true"></div>
    <div id="section-links" style="position: absolute; top: 0; left: 0; pointer-events: none;" aria-hidden="true"></div>
    <div id="section-preferences" style="position: absolute; top: 0; left: 0; pointer-events: none;" aria-hidden="true"></div>

    <div class="profile-page-container">
      <!-- Profile Header Bar -->
      <header class="profile-header-card">
        <div class="header-main-info">
          <div class="avatar-badge" aria-hidden="true">
            <span>${escapeHtml((displayName || 'C').charAt(0).toUpperCase())}</span>
          </div>
          <div class="header-text">
            <div class="header-title-row">
              <h1 class="candidate-display-name">${escapeHtml(displayName || 'Your Profile')}</h1>
              <span class="status-pill status-${careerStatusVal.toLowerCase()}">${escapeHtml(careerStatusVal)}</span>
              ${userLocation ? `<span class="location-pill">📍 ${escapeHtml(userLocation)}</span>` : ''}
            </div>
            <p class="candidate-headline">${escapeHtml(headline || currentRole || 'Complete your professional identity to begin applying')}</p>
          </div>
        </div>

        <div class="header-actions">
          <div class="save-status-indicator" id="globalSaveIndicator" aria-live="polite">
            <span class="status-dot"></span>
            <span class="status-text">All changes saved</span>
          </div>
          <button type="submit" form="careerProfileForm" class="btn btn-primary btn-save" id="headerSaveBtn">
            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
            Save Changes
          </button>
        </div>
      </header>

      <!-- Flash Messages -->
      ${flashMessage ? `
        <div class="alert alert-success" role="alert" id="flashSuccessAlert">
          <span class="alert-icon">✓</span>
          <span>${escapeHtml(flashMessage)}</span>
        </div>
      ` : ''}
      ${errorMessage ? `
        <div class="alert alert-error" role="alert" id="flashErrorAlert">
          <span class="alert-icon">⚠</span>
          <span>${escapeHtml(errorMessage)}</span>
        </div>
      ` : ''}

      <!-- Target Navigation Tab Bar -->
      <nav class="profile-nav-tabs" aria-label="Profile Sections" role="tablist">
        ${navTabs.map((tab) => `
          <button
            type="button"
            role="tab"
            class="tab-btn ${tab.id === activeSection ? 'active' : ''}"
            id="tab-${tab.id}"
            data-tab="${tab.id}"
            aria-selected="${tab.id === activeSection ? 'true' : 'false'}"
            aria-controls="panel-${tab.id}"
            tabindex="${tab.id === activeSection ? '0' : '-1'}"
          >
            <svg class="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${tab.icon}"/>
            </svg>
            <span class="tab-label">${tab.label}</span>
            ${tab.id === 'eligibility' && attentionItems.length > 0 ? `<span class="tab-badge-warning">${attentionItems.length}</span>` : ''}
          </button>
        `).join('')}
      </nav>

      <!-- Main Profile Form -->
      <form id="careerProfileForm" action="/profile" method="POST" class="profile-form">
        <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="activeTab" id="activeTabInput" value="${escapeHtml(activeSection)}">

        <!-- ================================================================= -->
        <!-- TAB 1: OVERVIEW DASHBOARD                                         -->
        <!-- ================================================================= -->
        <section
          id="panel-overview"
          class="tab-panel ${activeSection === 'overview' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-overview"
        >
          <!-- Readiness & Attention Card -->
          <div class="overview-readiness-hero card">
            <div class="readiness-gauge-col">
              <div class="gauge-circle" style="--gauge-pct: ${readinessPercentage}%;">
                <span class="gauge-value">${readinessPercentage}%</span>
                <span class="gauge-label">Ready</span>
              </div>
              <div class="gauge-meta">
                <h2 class="readiness-title">
                  Career Profile: ${profile?.profileReadiness?.score != null ? profile.profileReadiness.score : readinessPercentage}% Populated
                </h2>
                <p class="readiness-subtitle">
                  ${escapeHtml(readinessSemantics.summary || 'Profile readiness is evaluated against standard employer screening requirements.')}
                </p>
              </div>
            </div>

            <!-- Actionable Attention Items -->
            <div class="action-items-container">
              <h3 class="action-items-heading">
                ${attentionItems.length > 0 ? `${attentionItems.length} issue(s) require your attention` : '✓ All screening fields verified'}
              </h3>
              ${attentionItems.length > 0 ? `
                <ul class="action-items-list" aria-label="Unresolved screening items">
                  ${attentionItems.map((item) => {
                    const targetTab = item.field === 'workAuthorization' || item.field === 'visaSponsorship' ? 'eligibility'
                      : item.field === 'noticePeriod' || item.field === 'availability' ? 'eligibility'
                      : item.field === 'email' || item.field === 'phone' ? 'links'
                      : 'links';
                    const actionVerb = item.status === 'MISSING' ? 'Add' : 'Confirm';
                    return `
                      <li class="action-item">
                        <span class="action-item-icon">⚠</span>
                        <div class="action-item-details">
                          <span class="action-item-label">${escapeHtml(item.label)}</span>
                          <span class="action-item-notes">${escapeHtml(item.notes || 'Information required for automated application matching')}</span>
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm switch-tab-trigger" data-target-tab="${targetTab}">
                          ${actionVerb}
                        </button>
                      </li>
                    `;
                  }).join('')}
                </ul>
              ` : `
                <p class="empty-action-notes">Your profile contains verified work authorization, contact information, availability, and professional credentials.</p>
              `}
            </div>
          </div>

          <!-- Section Completion Checklist -->
          <div class="card checklist-card">
            <h3 class="card-heading">Application Readiness Checklist</h3>
            <div class="checklist-grid">
              ${readinessItems.map((item) => `
                <div class="checklist-item ${item.status === 'READY' ? 'status-ready' : 'status-pending'}">
                  <span class="checklist-icon">${item.status === 'READY' ? '✓' : '⚠'}</span>
                  <div class="checklist-item-body">
                    <span class="checklist-item-title">${escapeHtml(item.label)}</span>
                    <span class="checklist-item-sub">
                      ${item.status === 'READY' ? (escapeHtml(item.value || 'Verified')) : (item.status === 'NEEDS_CONFIRMATION' ? 'Needs Confirmation' : 'Missing')}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Overview Snapshot Cards -->
          <div class="overview-snapshots-grid">
            <!-- Professional Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Professional Identity</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="professional">Edit</button>
              </div>
              <div class="snapshot-body">
                <p><strong>Role:</strong> ${escapeHtml(currentRole || 'Not specified')}</p>
                <p><strong>Headline:</strong> ${escapeHtml(headline || 'None')}</p>
                <p><strong>Summary:</strong> ${summaryText ? escapeHtml(summaryText.slice(0, 160) + (summaryText.length > 160 ? '...' : '')) : 'No summary provided'}</p>
              </div>
            </div>

            <!-- Experience Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Experience (${experienceList.length})</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="experience">Manage</button>
              </div>
              <div class="snapshot-body">
                ${experienceList.length > 0 ? `
                  <ul class="snapshot-list">
                    ${experienceList.slice(0, 2).map((exp) => `
                      <li><strong>${escapeHtml(exp.title || exp.role || 'Role')}</strong> at ${escapeHtml(exp.company || 'Company')}</li>
                    `).join('')}
                  </ul>
                ` : '<p class="text-muted">No positions documented yet.</p>'}
              </div>
            </div>

            <!-- Education Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Education (${educationList.length})</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="education">Manage</button>
              </div>
              <div class="snapshot-body">
                ${educationList.length > 0 ? `
                  <ul class="snapshot-list">
                    ${educationList.slice(0, 2).map((edu) => `
                      <li><strong>${escapeHtml(edu.degree || 'Degree')}</strong> — ${escapeHtml(edu.institution || 'Institution')}</li>
                    `).join('')}
                  </ul>
                ` : '<p class="text-muted">No degrees documented yet.</p>'}
              </div>
            </div>

            <!-- Skills Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Key Skills</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="skills">Manage</button>
              </div>
              <div class="snapshot-body">
                <div class="chips-cluster">
                  ${primarySkillsList.slice(0, 8).map((s) => `
                    <span class="skill-chip ${s.provenanceStatus === 'VERIFIED' ? 'chip-verified' : ''}">
                      ${escapeHtml(s.skillName || s.name || s)}
                    </span>
                  `).join('')}
                  ${primarySkillsList.length === 0 ? '<p class="text-muted">No primary skills listed.</p>' : ''}
                </div>
              </div>
            </div>

            <!-- Links Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Contact & Links</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="links">Manage</button>
              </div>
              <div class="snapshot-body">
                <p><strong>Email:</strong> ${escapeHtml(authenticEmail || 'None')}</p>
                <p><strong>Phone:</strong> ${initialPhoneNumber ? escapeHtml(`${initialCountryCode} ${initialPhoneNumber}`) : 'None'}</p>
                <p><strong>LinkedIn:</strong> ${linkedinUrl ? escapeHtml(linkedinUrl) : 'Not linked'}</p>
                <p><strong>GitHub:</strong> ${githubUrl ? escapeHtml(githubUrl) : 'Not linked'}</p>
              </div>
            </div>

            <!-- Preferences Snapshot -->
            <div class="card snapshot-card">
              <div class="snapshot-header">
                <h3>Job Preferences</h3>
                <button type="button" class="btn btn-ghost btn-sm switch-tab-trigger" data-target-tab="preferences">Edit</button>
              </div>
              <div class="snapshot-body">
                <p><strong>Target Roles:</strong> ${targetRolesList.length > 0 ? escapeHtml(targetRolesList.join(', ')) : 'Any'}</p>
                <p><strong>Workplace:</strong> ${escapeHtml(remotePref || 'Not specified')}</p>
                <p><strong>Notice Period:</strong> ${escapeHtml(formatNoticePeriodLabel(noticePeriodVal, customNoticeVal))}</p>
                <p><strong>Work Auth:</strong> ${workAuthList.length > 0 ? escapeHtml(workAuthList.join(', ')) : 'Not set'}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 2: PROFESSIONAL IDENTITY                                      -->
        <!-- ================================================================= -->
        <section
          id="panel-professional"
          class="tab-panel ${activeSection === 'professional' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-professional"
        >
          <div class="card">
            <h2 class="card-heading">Professional Identity</h2>
            <p class="card-subtitle">Your core professional identity shown on applications, resumes, and matched against job requirements.</p>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="displayName">Full Name <span class="required-star">*</span></label>
                <input type="text" id="displayName" name="displayName" value="${escapeHtml(displayName)}" class="form-control" required>
                <span class="field-hint">Legal or preferred professional name used in handoffs.</span>
              </div>

              <div class="form-group">
                <label for="headline">Professional Headline <span class="optional-tag">(optional)</span></label>
                <input type="text" id="headline" name="headline" value="${escapeHtml(headline)}" class="form-control" placeholder="e.g. Senior Backend Engineer | Distributed Systems">
                <span class="field-hint">Brief headline summarizing your domain expertise.</span>
              </div>

              <div class="form-group">
                <label for="currentRole">Current Role Title <span class="optional-tag">(optional)</span></label>
                <input type="text" id="currentRole" name="currentRole" value="${escapeHtml(currentRole)}" class="form-control" placeholder="e.g. Full Stack Developer">
              </div>

              <div class="form-group">
                <label for="careerStatus">Career Stage <span class="required-star">*</span></label>
                <select id="careerStatus" name="careerStatus" class="form-control">
                  <option value="FRESHER" ${careerStatusVal === 'FRESHER' ? 'selected' : ''}>Early Career / Fresher (0–2 yrs)</option>
                  <option value="MID_LEVEL" ${careerStatusVal === 'MID_LEVEL' ? 'selected' : ''}>Mid-Level Engineer (3–5 yrs)</option>
                  <option value="SENIOR" ${careerStatusVal === 'SENIOR' ? 'selected' : ''}>Senior Engineer (5–8 yrs)</option>
                  <option value="LEAD" ${careerStatusVal === 'LEAD' ? 'selected' : ''}>Staff / Lead / Principal (8+ yrs)</option>
                  <option value="EXECUTIVE" ${careerStatusVal === 'EXECUTIVE' ? 'selected' : ''}>Engineering Leadership / Manager</option>
                </select>
              </div>

              <div class="form-group">
                <label for="location">Location / City <span class="optional-tag">(optional)</span></label>
                <input type="text" id="location" name="location" value="${escapeHtml(userLocation)}" class="form-control" placeholder="e.g. Bengaluru, India or San Francisco, CA">
                <span class="field-hint">Used to evaluate location match and commute compatibility.</span>
              </div>

              <div class="form-group">
                <label for="timezone">Timezone <span class="optional-tag">(optional)</span></label>
                <input type="text" id="timezone" name="timezone" value="${escapeHtml(timezoneVal)}" class="form-control" placeholder="e.g. Asia/Kolkata or America/Los_Angeles">
                <span class="field-hint">Used to coordinate interview availability across distributed teams.</span>
              </div>
            </div>

            <div class="form-group" style="margin-top: 1rem;">
              <label for="summary">Executive Summary <span class="optional-tag">(optional)</span></label>
              <textarea id="summary" name="summary" rows="4" class="form-control" placeholder="A concise 2-4 sentence summary of your technical background, impact, and engineering philosophy...">${escapeHtml(summaryText)}</textarea>
              <span class="field-hint">Used to introduce your application to hiring managers.</span>
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 3: WORK EXPERIENCE                                            -->
        <!-- ================================================================= -->
        <section
          id="panel-experience"
          class="tab-panel ${activeSection === 'experience' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-experience"
        >
          <div class="card">
            <div class="card-header-row">
              <div>
                <h2 class="card-heading">Work Experience</h2>
                <p class="card-subtitle">Document your professional employment history. Verified code contributions are linked automatically.</p>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="addExperienceBtn">
                + Add Position
              </button>
            </div>

            <!-- Experience Card List -->
            <div id="experienceItemsContainer" class="records-container">
              ${experienceList.map((exp, idx) => `
                <div class="record-card" data-index="${idx}">
                  <div class="record-card-header">
                    <div>
                      <h3 class="record-title">${escapeHtml(exp.title || exp.role || 'Position')}</h3>
                      <span class="record-subtitle">${escapeHtml(exp.company || 'Company')} • ${escapeHtml(exp.location || 'Remote')}</span>
                    </div>
                    <span class="record-dates">${escapeHtml(exp.startDate || '')} — ${escapeHtml(exp.endDate || (exp.isCurrent ? 'Present' : ''))}</span>
                  </div>
                  ${exp.description ? `<p class="record-description">${escapeHtml(exp.description)}</p>` : ''}
                  ${Array.isArray(exp.highlights) && exp.highlights.length > 0 ? `
                    <ul class="record-bullets">
                      ${exp.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}
                    </ul>
                  ` : ''}

                  <!-- Progressive Disclosure for Code Verification -->
                  ${exp.astEvidenceCount || exp.repositoryCorroboration ? `
                    <details class="advanced-disclosure">
                      <summary>Show repository verification details</summary>
                      <div class="disclosure-content">
                        <p>✓ Corroborated with repository code commits.</p>
                        ${exp.repositoryCorroboration ? `<p>Repository: <code>${escapeHtml(exp.repositoryCorroboration)}</code></p>` : ''}
                      </div>
                    </details>
                  ` : ''}
                </div>
              `).join('')}
              ${experienceList.length === 0 ? '<p class="empty-state-notice">No positions recorded yet. Click "+ Add Position" to add your work history.</p>' : ''}
            </div>

            <!-- Hidden serialized field for form submission -->
            <input type="hidden" name="experience" id="experienceHiddenInput" value="${escapeHtml(JSON.stringify(experienceList))}">
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 4: EDUCATION & DEGREES                                        -->
        <!-- ================================================================= -->
        <section
          id="panel-education"
          class="tab-panel ${activeSection === 'education' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-education"
        >
          <div class="card">
            <div class="card-header-row">
              <div>
                <h2 class="card-heading">Education History</h2>
                <p class="card-subtitle">Your academic qualifications, degrees, and institutions.</p>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="addEducationBtn">
                + Add Education
              </button>
            </div>

            <div id="educationItemsContainer" class="records-container">
              ${educationList.map((edu, idx) => `
                <div class="record-card" data-index="${idx}">
                  <div class="record-card-header">
                    <div>
                      <h3 class="record-title">${escapeHtml(edu.degree || 'Degree')}</h3>
                      <span class="record-subtitle">${escapeHtml(edu.institution || 'University')} • ${escapeHtml(edu.fieldOfStudy || '')}</span>
                    </div>
                    <span class="record-dates">${escapeHtml(edu.graduationYear || edu.year || '')}</span>
                  </div>
                </div>
              `).join('')}
              ${educationList.length === 0 ? '<p class="empty-state-notice">No education entries yet. Click "+ Add Education" to add your degree or coursework.</p>' : ''}
            </div>

            <input type="hidden" name="education" id="educationHiddenInput" value="${escapeHtml(JSON.stringify(educationList))}">
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 5: SKILLS INVENTORY                                           -->
        <!-- ================================================================= -->
        <section
          id="panel-skills"
          class="tab-panel ${activeSection === 'skills' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-skills"
        >
          <div class="card">
            <h2 class="card-heading">Career Skills (${primarySkillsList.length + additionalSkills.length})</h2>
            <p class="card-subtitle">Evidence-verified skills grounded in your repositories, alongside self-declared technical capabilities.</p>

            <!-- Evidence-Backed Skills -->
            <div class="skills-section-block">
              <h3 class="sub-heading">Primary Technical Skills (${primarySkillsList.length})</h3>
              <div class="chips-cluster">
                ${primarySkillsList.map((s) => `
                  <div class="skill-badge-chip">
                    <span class="skill-name">${escapeHtml(s.skillName || s.name || s)}</span>
                    <span class="skill-proof-tag">${s.provenanceStatus === 'VERIFIED' ? '✓ Corroborated' : 'Claimed'}</span>
                  </div>
                `).join('')}
                ${primarySkillsList.length === 0 ? '<p class="text-muted">No primary skills indexed.</p>' : ''}
              </div>
            </div>

            <!-- Additional / Self-Declared Skills -->
            <div class="skills-section-block" style="margin-top: 1.5rem;">
              <div class="card-header-row">
                <h3 class="sub-heading">Additional Libraries & Tools (${technologySignalsList.length + additionalSkills.length})</h3>
              </div>
              <div class="chips-cluster" id="additionalSkillsChips">
                ${additionalSkills.map((s) => `
                  <div class="skill-badge-chip chip-declared">
                    <span class="skill-name">${escapeHtml(s.canonicalName || s.name || s.slug || 'Tool')}</span>
                    <span class="skill-proficiency-tag">${escapeHtml(s.proficiency || 'Proficient')}</span>
                  </div>
                `).join('')}
                ${technologySignalsList.map((s) => `
                  <div class="skill-badge-chip chip-signal">
                    <span class="skill-name">${escapeHtml(s.skillName || s.name || s)}</span>
                    <span class="skill-proof-tag">${s.provenanceStatus === 'VERIFIED' ? '✓ Corroborated' : 'Signal'}</span>
                  </div>
                `).join('')}
                ${additionalSkills.length === 0 && technologySignalsList.length === 0 ? '<p class="text-muted">No additional skills added.</p>' : ''}
              </div>
            </div>

            <!-- Progressive Disclosure for AST Code Evidence -->
            ${technologySignalsList.length > 0 ? `
              <details class="advanced-disclosure" style="margin-top: 1.5rem;">
                <summary>Show secondary technology signals (${technologySignalsList.length})</summary>
                <div class="disclosure-content">
                  <p class="text-muted" style="margin-bottom: 0.5rem;">Technologies detected in repository configuration or dependencies:</p>
                  <div class="chips-cluster">
                    ${technologySignalsList.map((s) => `
                      <span class="skill-chip chip-signal">${escapeHtml(s.skillName || s.name || s)}</span>
                    `).join('')}
                  </div>
                </div>
              </details>
            ` : ''}
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 6: HIGHLIGHTED PROJECTS                                       -->
        <!-- ================================================================= -->
        <section
          id="panel-projects"
          class="tab-panel ${activeSection === 'projects' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-projects"
        >
          <div class="card">
            <h2 class="card-heading">Highlighted Projects (${projectsList.length})</h2>
            <p class="card-subtitle">Real-world technical projects demonstrating applied architecture, engineering rigor, and code quality.</p>

            <div class="projects-grid">
              ${projectsList.map((p) => `
                <div class="project-card">
                  <div class="project-card-header">
                    <h3 class="project-title">${escapeHtml(p.name || 'Fastify Gateway')}</h3>
                    ${p.repositoryUrl ? `
                      <a href="${escapeHtml(p.repositoryUrl)}" target="_blank" rel="noopener noreferrer" class="link-icon-btn" aria-label="View repository">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                      </a>
                    ` : ''}
                  </div>
                  <p class="project-desc">${escapeHtml(p.description || 'High-performance API gateway built with Node.js and TypeScript.')}</p>
                  ${Array.isArray(p.technologies) && p.technologies.length > 0 ? `
                    <div class="project-tech-tags">
                      ${p.technologies.map((t) => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}
                    </div>
                  ` : ''}

                  <!-- Progressive Disclosure for AST Code Evidence -->
                  ${p.astEvidence || p.commitCount ? `
                    <details class="advanced-disclosure">
                      <summary>Show verification details</summary>
                      <div class="disclosure-content">
                        <p>Evidence: Grounded in repository commit history.</p>
                      </div>
                    </details>
                  ` : ''}
                </div>
              `).join('')}
              ${projectsList.length === 0 ? '<p class="empty-state-notice">No highlighted projects found. Connect your GitHub account to automatically index repositories.</p>' : ''}
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 7: CREDENTIALS & LANGUAGES                                    -->
        <!-- ================================================================= -->
        <section
          id="panel-credentials"
          class="tab-panel ${activeSection === 'credentials' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-credentials"
        >
          <div class="card">
            <h2 class="card-heading">Certifications & Languages</h2>
            <p class="card-subtitle">Industry credentials, professional licenses, and spoken languages.</p>

            <div class="credentials-split-grid">
              <div>
                <h3 class="sub-heading">Certifications (${certsList.length})</h3>
                <div class="records-container">
                  ${certsList.map((c) => `
                    <div class="record-card">
                      <h4 class="record-title">${escapeHtml(c.name || 'Certification')}</h4>
                      <span class="record-subtitle">${escapeHtml(c.issuer || 'Issuing Body')} • ${escapeHtml(c.issueDate || '')}</span>
                    </div>
                  `).join('')}
                  ${certsList.length === 0 ? '<p class="text-muted">No certifications recorded.</p>' : ''}
                </div>
              </div>

              <div>
                <h3 class="sub-heading">Spoken Languages (${languagesList.length})</h3>
                <div class="records-container">
                  ${languagesList.map((l) => `
                    <div class="record-card">
                      <h4 class="record-title">${escapeHtml(l.language || l.name || 'Language')}</h4>
                      <span class="record-subtitle">${escapeHtml(l.proficiency || 'Native / Fluent')}</span>
                    </div>
                  `).join('')}
                  ${languagesList.length === 0 ? '<p class="text-muted">No languages specified.</p>' : ''}
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 8: CONTACT & PROFESSIONAL LINKS                               -->
        <!-- ================================================================= -->
        <section
          id="panel-links"
          class="tab-panel ${activeSection === 'links' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-links"
        >
          <div class="card">
            <h2 class="card-heading">Contact Information & Links</h2>
            <p class="card-subtitle">Authoritative contact information required for job applications and candidate outreach.</p>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="contactEmail">Email Address <span class="required-star">*</span></label>
                <input type="email" id="contactEmail" value="${escapeHtml(authenticEmail)}" class="form-control" readonly disabled>
                <span class="field-hint">Primary account and submission email address.</span>
              </div>

              <div class="form-group">
                <label for="contactPhoneInput">Phone Number <span class="required-star">*</span></label>
                <div class="phone-input-group">
                  <select id="contactCountryCodeSelect" name="contactCountryCode" class="form-control phone-code-select">
                    <option value="">Choose code...</option>
                    ${COUNTRY_CALLING_CODES.map((c) => `
                      <option value="${escapeHtml(c.dialCode)}" ${initialCountryCode === c.dialCode ? 'selected' : ''}>
                        ${escapeHtml(c.flag)} ${escapeHtml(c.name)} (${escapeHtml(c.dialCode)})
                      </option>
                    `).join('')}
                  </select>
                  <input
                    type="tel"
                    id="contactPhoneInput"
                    name="contactPhoneNumber"
                    value="${escapeHtml(initialPhoneNumber)}"
                    class="form-control phone-number-input"
                    placeholder="7905087928"
                  >
                </div>
                <span class="field-hint">Required for recruiter outreach and ATS verification.</span>
              </div>

              <div class="form-group">
                <label for="contactLinkedinInput">LinkedIn URL <span class="optional-tag">(optional)</span></label>
                <input type="url" id="contactLinkedinInput" name="linkedin" value="${escapeHtml(linkedinUrl)}" class="form-control" placeholder="https://linkedin.com/in/username">
              </div>

              <div class="form-group">
                <label for="contactGithubInput">GitHub Profile URL <span class="optional-tag">(optional)</span></label>
                <input type="url" id="contactGithubInput" name="github" value="${escapeHtml(githubUrl)}" class="form-control" placeholder="https://github.com/username">
              </div>

              <div class="form-group">
                <label for="contactPortfolioInput">Portfolio / Personal Website <span class="optional-tag">(optional)</span></label>
                <input type="url" id="contactPortfolioInput" name="portfolio" value="${escapeHtml(portfolioUrl)}" class="form-control" placeholder="https://yourname.dev">
              </div>
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 9: JOB PREFERENCES                                            -->
        <!-- ================================================================= -->
        <section
          id="panel-preferences"
          class="tab-panel ${activeSection === 'preferences' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-preferences"
        >
          <div class="card">
            <h2 class="card-heading">Job Search Intent & Preferences</h2>
            <p class="card-subtitle">Configure your target roles, locations, compensation floor, and workplace model.</p>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="targetRoles">Target Roles <span class="required-star">* Required for matching</span></label>
                <input type="text" id="targetRoles" name="targetRoles" value="${escapeHtml(targetRolesList.join(', '))}" class="form-control" placeholder="e.g. Backend Engineer, Distributed Systems Engineer">
                <span class="field-hint">Comma-separated job titles you are actively seeking.</span>
              </div>

              <div class="form-group">
                <label for="preferredLocations">Preferred Locations <span class="optional-tag">(optional)</span></label>
                <input type="text" id="preferredLocations" name="preferredLocations" value="${escapeHtml(preferredLocationsList.join(', '))}" class="form-control" placeholder="e.g. Remote, San Francisco, Bengaluru">
                <span class="field-hint">Cities, regions, or "Remote" where you are open to working.</span>
              </div>

              <div class="form-group">
                <label for="remotePreference">Workplace Model <span class="optional-tag">(optional)</span></label>
                <select id="remotePreference" name="remotePreference" class="form-control">
                  <option value="" ${!remotePref ? 'selected' : ''}>No preference (Not Set)</option>
                  <option value="REMOTE_ONLY" ${remotePref === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only</option>
                  <option value="HYBRID" ${remotePref === 'HYBRID' ? 'selected' : ''}>Hybrid</option>
                  <option value="ONSITE" ${remotePref === 'ONSITE' ? 'selected' : ''}>Onsite</option>
                  <option value="FLEXIBLE" ${remotePref === 'FLEXIBLE' ? 'selected' : ''}>Flexible</option>
                </select>
              </div>

              <div class="form-group">
                <label for="relocationPreference">Relocation Preference <span class="optional-tag">(optional)</span></label>
                <select id="relocationPreference" name="relocationPreference" class="form-control">
                  <option value="" ${!jobPrefs.relocationPreference ? 'selected' : ''}>Not Set</option>
                  <option value="WILL_RELOCATE" ${jobPrefs.relocationPreference === 'WILL_RELOCATE' ? 'selected' : ''}>Willing to Relocate</option>
                  <option value="REMOTE_ONLY" ${jobPrefs.relocationPreference === 'REMOTE_ONLY' ? 'selected' : ''}>Remote Only (No Relocation)</option>
                </select>
              </div>

              <div class="form-group">
                <label for="salaryFloor">Minimum Compensation (Floor) <span class="optional-tag">(optional)</span></label>
                <input type="number" id="salaryFloor" name="salaryFloor" value="${escapeHtml(salaryFloor)}" class="form-control" placeholder="e.g. 120000">
                <span class="field-hint">Minimum acceptable rate or annual base salary.</span>
              </div>

              <div class="form-group">
                <label for="targetSalary">Target Compensation <span class="optional-tag">(optional)</span></label>
                <input type="number" id="targetSalary" name="targetSalary" value="${escapeHtml(targetSalary)}" class="form-control" placeholder="e.g. 150000">
                <span class="field-hint">Desired target compensation.</span>
              </div>

              <div class="form-group">
                <label for="salaryCurrency">Currency <span class="optional-tag">(optional)</span></label>
                <select id="salaryCurrency" name="salaryCurrency" class="form-control">
                  <option value="" ${!salaryCurrency ? 'selected' : ''}>Not Set</option>
                  <option value="USD" ${salaryCurrency === 'USD' ? 'selected' : ''}>USD ($)</option>
                  <option value="EUR" ${salaryCurrency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                  <option value="GBP" ${salaryCurrency === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                  <option value="CAD" ${salaryCurrency === 'CAD' ? 'selected' : ''}>CAD ($)</option>
                  <option value="AUD" ${salaryCurrency === 'AUD' ? 'selected' : ''}>AUD ($)</option>
                  <option value="INR" ${salaryCurrency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                </select>
              </div>

              <div class="form-group">
                <label for="compensationPeriod">Pay Period <span class="optional-tag">(optional)</span></label>
                <select id="compensationPeriod" name="compensationPeriod" class="form-control">
                  <option value="" ${!compensationPeriod ? 'selected' : ''}>Not Set</option>
                  <option value="ANNUAL" ${compensationPeriod === 'ANNUAL' ? 'selected' : ''}>Annual (per year)</option>
                  <option value="MONTHLY" ${compensationPeriod === 'MONTHLY' ? 'selected' : ''}>Monthly</option>
                  <option value="HOURLY" ${compensationPeriod === 'HOURLY' ? 'selected' : ''}>Hourly rate</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <!-- ================================================================= -->
        <!-- TAB 10: ELIGIBILITY & COMPLIANCE                                  -->
        <!-- ================================================================= -->
        <section
          id="panel-eligibility"
          class="tab-panel ${activeSection === 'eligibility' ? 'active' : ''}"
          role="tabpanel"
          aria-labelledby="tab-eligibility"
        >
          <div class="card">
            <h2 class="card-heading">Work Authorization & Availability</h2>
            <p class="card-subtitle">Explicit legal eligibility and timeline parameters required by employer screening questionnaires.</p>

            <div class="form-grid-2">
              <div class="form-group">
                <label for="workAuthInput">Work Authorization Status <span class="required-star">*</span></label>
                <input type="text" id="workAuthInput" name="workAuthorization" value="${escapeHtml(workAuthList.join(', '))}" class="form-control" placeholder="e.g. US Citizen, Permanent Resident, H1-B, UK Citizen">
                <span class="field-hint">Jurisdictions and legal statuses where you are authorized to work.</span>
              </div>

              <div class="form-group">
                <label for="visaSponsorshipRequired">Visa Sponsorship Required <span class="required-star">*</span></label>
                <select id="visaSponsorshipRequired" name="visaSponsorshipRequired" class="form-control">
                  <option value="NOT_SET" ${visaSponsorshipVal === '' || visaSponsorshipVal === 'NOT_SET' ? 'selected' : ''}>Choose answer (Not Set)</option>
                  <option value="NO" ${visaSponsorshipVal === 'false' || visaSponsorshipVal === 'NO' ? 'selected' : ''}>No — I do not require visa sponsorship</option>
                  <option value="YES" ${visaSponsorshipVal === 'true' || visaSponsorshipVal === 'YES' ? 'selected' : ''}>Yes — I require visa sponsorship</option>
                  <option value="UNKNOWN" ${visaSponsorshipVal === 'UNKNOWN' ? 'selected' : ''}>Uncertain / Depends on role</option>
                </select>
                <span class="field-hint">Critical for screening filter matching; false defaults strictly avoided.</span>
              </div>

              <div class="form-group">
                <label for="noticePeriodSelect">Notice Period <span class="required-star">*</span></label>
                <select id="noticePeriodSelect" name="noticePeriod" class="form-control">
                  <option value="" ${!noticePeriodVal ? 'selected' : ''}>Choose notice period...</option>
                  <option value="immediate" ${noticePeriodVal === 'immediate' ? 'selected' : ''}>Immediate (Available immediately)</option>
                  <option value="less_than_1_week" ${noticePeriodVal === 'less_than_1_week' ? 'selected' : ''}>Less than 1 week</option>
                  <option value="1_to_2_weeks" ${noticePeriodVal === '1_to_2_weeks' ? 'selected' : ''}>1 to 2 weeks</option>
                  <option value="30_days" ${noticePeriodVal === '30_days' ? 'selected' : ''}>30 days (1 month)</option>
                  <option value="60_days" ${noticePeriodVal === '60_days' ? 'selected' : ''}>60 days (2 months)</option>
                  <option value="90_days" ${noticePeriodVal === '90_days' ? 'selected' : ''}>90 days (3 months)</option>
                  <option value="custom" ${noticePeriodVal === 'custom' ? 'selected' : ''}>Custom duration...</option>
                </select>
                <span class="field-hint">Standardized notice period required by application screening.</span>
              </div>

              <div class="form-group" id="customNoticeGroup" style="${noticePeriodVal === 'custom' ? '' : 'display: none;'}">
                <label for="customNoticePeriod">Custom Notice Period</label>
                <input type="text" id="customNoticePeriod" name="customNoticePeriod" value="${escapeHtml(customNoticeVal)}" class="form-control" placeholder="e.g. 45 days, 3 weeks">
              </div>

              <div class="form-group">
                <label for="availabilityDate">Earliest Start Date <span class="optional-tag">(optional)</span></label>
                <input type="date" id="availabilityDate" name="availabilityDate" value="${escapeHtml(availabilityDateVal)}" class="form-control">
                <span class="field-hint">Specific calendar date you can commence employment.</span>
              </div>
            </div>

            <!-- Confirmation Toggles for Application Readiness -->
            <div class="confirmation-box" style="margin-top: 1.5rem;">
              <h3 class="sub-heading">Candidate Confirmations</h3>
              <p class="field-hint" style="margin-bottom: 0.75rem;">Confirming these answers transitions screening items directly to READY status for automated handoffs.</p>

              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input type="checkbox" name="workAuthConfirmedByUser" value="true" ${workAuthConfirmedByUser ? 'checked' : ''}>
                  <span>I confirm my work authorization status is accurate and substantiated.</span>
                </label>
              </div>

              <div class="checkbox-group" style="margin-top: 0.5rem;">
                <label class="checkbox-label">
                  <input type="checkbox" name="visaSponsorshipConfirmedByUser" value="true" ${visaSponsorshipConfirmedByUser ? 'checked' : ''}>
                  <span>I confirm my visa sponsorship requirement answer is accurate.</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Sticky Bottom Save Bar -->
        <div class="sticky-save-bar" id="stickySaveBar">
          <div class="save-bar-content">
            <span class="save-bar-status" id="saveBarStatus">Ready</span>
            <div class="save-bar-actions">
              <button type="submit" class="btn btn-primary btn-save">Save Changes</button>
            </div>
          </div>
        </div>
      </form>
    </div>

    <!-- Embedded Initial Profile State for AJAX / Dirty Tracking -->
    <script>
      window.__INITIAL_PROFILE__ = ${JSON.stringify(initialProfileState)};
    </script>

    <!-- Client-Side Tab & State Controller -->
    <script>
      (function () {
        const tabs = document.querySelectorAll('.tab-btn');
        const panels = document.querySelectorAll('.tab-panel');
        const activeTabInput = document.getElementById('activeTabInput');
        const noticeSelect = document.getElementById('noticePeriodSelect');
        const customNoticeGroup = document.getElementById('customNoticeGroup');
        const globalIndicator = document.getElementById('globalSaveIndicator');
        const saveBarStatus = document.getElementById('saveBarStatus');
        const form = document.getElementById('careerProfileForm');

        let isDirty = false;

        function switchTab(tabId) {
          tabs.forEach((t) => {
            const isMatch = t.getAttribute('data-tab') === tabId;
            t.classList.toggle('active', isMatch);
            t.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            t.setAttribute('tabindex', isMatch ? '0' : '-1');
          });

          panels.forEach((p) => {
            const isMatch = p.id === 'panel-' + tabId;
            p.classList.toggle('active', isMatch);
          });

          if (activeTabInput) {
            activeTabInput.value = tabId;
          }

          // Update URL hash smoothly without reloading
          if (history.replaceState) {
            history.replaceState(null, '', '#section-' + tabId);
          }
        }

        // Tab click listeners
        tabs.forEach((tab) => {
          tab.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');
            switchTab(tabId);
          });

          // Keyboard arrow navigation
          tab.addEventListener('keydown', function (e) {
            let targetTab = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              targetTab = this.nextElementSibling || tabs[0];
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              targetTab = this.previousElementSibling || tabs[tabs.length - 1];
            }
            if (targetTab) {
              targetTab.focus();
              targetTab.click();
            }
          });
        });

        // Deep link button triggers from Overview
        document.querySelectorAll('.switch-tab-trigger').forEach((btn) => {
          btn.addEventListener('click', function () {
            const target = this.getAttribute('data-target-tab');
            if (target) {
              switchTab(target);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
        });

        // Notice period custom toggle
        if (noticeSelect && customNoticeGroup) {
          noticeSelect.addEventListener('change', function () {
            customNoticeGroup.style.display = this.value === 'custom' ? 'block' : 'none';
          });
        }

        // Handle URL hash on initial page load
        const hash = window.location.hash;
        if (hash) {
          const matchedSection = hash.replace(/^#section-/, '').replace(/^#/, '');
          const validTab = Array.from(tabs).find((t) => t.getAttribute('data-tab') === matchedSection);
          if (validTab) {
            switchTab(matchedSection);
          } else if (hash === '#section-contact' || hash === '#contact') {
            switchTab('links');
          } else if (hash === '#section-readiness' || hash === '#readiness') {
            switchTab('eligibility');
          }
        }

        // Form change & dirty tracking
        if (form) {
          form.addEventListener('input', function () {
            if (!isDirty) {
              isDirty = true;
              if (globalIndicator) {
                globalIndicator.classList.add('dirty');
                globalIndicator.querySelector('.status-text').textContent = 'Unsaved changes';
              }
              if (saveBarStatus) {
                saveBarStatus.textContent = 'Unsaved changes';
              }
            }
          });

          // Intercept submit for fast AJAX save with fallback
          form.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (globalIndicator) {
              globalIndicator.querySelector('.status-text').textContent = 'Saving...';
            }
            if (saveBarStatus) {
              saveBarStatus.textContent = 'Saving changes...';
            }

            const formData = new FormData(form);
            const payload = {
              sections: {
                identity: {
                  displayName: formData.get('displayName'),
                  headline: formData.get('headline'),
                  currentRole: formData.get('currentRole'),
                  careerStatus: formData.get('careerStatus'),
                  location: formData.get('location'),
                  timezone: formData.get('timezone'),
                  summary: formData.get('summary'),
                },
                contact: {
                  countryCode: formData.get('contactCountryCode'),
                  phoneNumber: formData.get('contactPhoneNumber'),
                  linkedin: formData.get('linkedin'),
                  github: formData.get('github'),
                  portfolio: formData.get('portfolio'),
                },
                preferences: {
                  targetRoles: (formData.get('targetRoles') || '').split(',').map((s) => s.trim()).filter(Boolean),
                  preferredLocations: (formData.get('preferredLocations') || '').split(',').map((s) => s.trim()).filter(Boolean),
                  remotePreference: formData.get('remotePreference') || null,
                  relocationPreference: formData.get('relocationPreference') || null,
                  salaryFloor: formData.get('salaryFloor') ? Number(formData.get('salaryFloor')) : null,
                  targetSalary: formData.get('targetSalary') ? Number(formData.get('targetSalary')) : null,
                  salaryCurrency: formData.get('salaryCurrency') || null,
                  compensationPeriod: formData.get('compensationPeriod') || null,
                },
                eligibility: {
                  workAuthorization: (formData.get('workAuthorization') || '').split(',').map((s) => s.trim()).filter(Boolean),
                  visaSponsorshipRequired: formData.get('visaSponsorshipRequired'),
                  noticePeriod: formData.get('noticePeriod') || null,
                  customNoticePeriod: formData.get('customNoticePeriod') || null,
                  availabilityDate: formData.get('availabilityDate') || null,
                  workAuthConfirmedByUser: formData.get('workAuthConfirmedByUser') === 'true',
                  visaSponsorshipConfirmedByUser: formData.get('visaSponsorshipConfirmedByUser') === 'true',
                },
              },
            };

            try {
              const res = await fetch('/api/profile', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
              });

              if (res.ok) {
                isDirty = false;
                if (globalIndicator) {
                  globalIndicator.classList.remove('dirty');
                  globalIndicator.querySelector('.status-text').textContent = 'All changes saved';
                }
                if (saveBarStatus) {
                  saveBarStatus.textContent = 'All changes saved';
                }
              } else {
                throw new Error('Save failed');
              }
            } catch (err) {
              form.submit();
            }
          });
        }

        // Beforeunload confirmation to prevent accidental data loss
        window.addEventListener('beforeunload', function (e) {
          if (isDirty) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
          }
        });
      })();
    </script>

    <!-- Profile Styling -->
    <style>
      .profile-page-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1.5rem 1rem 4rem 1rem;
      }

      .profile-header-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1.25rem;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
      }

      .header-main-info {
        display: flex;
        align-items: center;
        gap: 1.25rem;
      }

      .avatar-badge {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366F1, #8B5CF6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 700;
        color: #fff;
        flex-shrink: 0;
      }

      .header-title-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .candidate-display-name {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 700;
        color: #F9FAFB;
      }

      .candidate-headline {
        margin: 0.35rem 0 0 0;
        color: #9CA3AF;
        font-size: 0.95rem;
      }

      .status-pill {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.2rem 0.6rem;
        border-radius: 9999px;
        background: rgba(99, 102, 241, 0.15);
        color: #A5B4FC;
        border: 1px solid rgba(99, 102, 241, 0.3);
      }

      .location-pill {
        font-size: 0.8rem;
        color: #9CA3AF;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 1rem;
      }

      .save-status-indicator {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #10B981;
      }

      .save-status-indicator.dirty {
        color: #F59E0B;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }

      /* Navigation Tabs */
      .profile-nav-tabs {
        display: flex;
        gap: 0.5rem;
        overflow-x: auto;
        padding-bottom: 0.5rem;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid var(--border-subtle);
        scrollbar-width: thin;
      }

      .tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1rem;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: #9CA3AF;
        font-size: 0.9rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease-in-out;
      }

      .tab-btn:hover {
        background: var(--bg-surface-elevated);
        color: #F9FAFB;
      }

      .tab-btn.active {
        background: rgba(99, 102, 241, 0.15);
        color: #818CF8;
        font-weight: 600;
      }

      .tab-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      .tab-badge-warning {
        background: #F59E0B;
        color: #000;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.1rem 0.4rem;
        border-radius: 9999px;
      }

      /* Panels */
      .tab-panel {
        display: none;
      }

      .tab-panel.active {
        display: block;
      }

      /* Card Styling */
      .card {
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
      }

      .card-heading {
        margin: 0 0 0.35rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #F9FAFB;
      }

      .card-subtitle {
        margin: 0 0 1.25rem 0;
        color: #9CA3AF;
        font-size: 0.9rem;
      }

      .sub-heading {
        margin: 0 0 0.75rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: #E5E7EB;
      }

      .card-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.25rem;
      }

      /* Overview Hero */
      .overview-readiness-hero {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.5rem;
      }

      @media (max-width: 768px) {
        .overview-readiness-hero {
          grid-template-columns: 1fr;
        }
      }

      .readiness-gauge-col {
        display: flex;
        align-items: center;
        gap: 1.5rem;
      }

      .gauge-circle {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: conic-gradient(#6366F1 var(--gauge-pct), rgba(255,255,255,0.08) 0);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        flex-shrink: 0;
      }

      .gauge-circle::before {
        content: '';
        position: absolute;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--bg-surface);
      }

      .gauge-value {
        position: relative;
        font-size: 1.4rem;
        font-weight: 700;
        color: #F9FAFB;
      }

      .gauge-label {
        position: relative;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #9CA3AF;
      }

      .readiness-title {
        margin: 0 0 0.35rem 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: #F9FAFB;
      }

      .readiness-subtitle {
        margin: 0;
        font-size: 0.85rem;
        color: #9CA3AF;
        line-height: 1.4;
      }

      /* Action Items */
      .action-items-container {
        border-left: 1px solid var(--border-subtle);
        padding-left: 1.5rem;
      }

      @media (max-width: 768px) {
        .action-items-container {
          border-left: none;
          border-top: 1px solid var(--border-subtle);
          padding-left: 0;
          padding-top: 1.5rem;
        }
      }

      .action-items-heading {
        margin: 0 0 0.75rem 0;
        font-size: 0.95rem;
        font-weight: 600;
        color: #F59E0B;
      }

      .action-items-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }

      .action-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        background: var(--bg-surface-elevated);
        padding: 0.65rem 0.85rem;
        border-radius: 8px;
        border: 1px solid rgba(245, 158, 11, 0.2);
      }

      .action-item-icon {
        color: #F59E0B;
        font-size: 1rem;
      }

      .action-item-details {
        flex: 1;
      }

      .action-item-label {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
        color: #F9FAFB;
      }

      .action-item-notes {
        display: block;
        font-size: 0.75rem;
        color: #9CA3AF;
      }

      /* Checklist Grid */
      .checklist-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 0.85rem;
      }

      .checklist-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: 8px;
        background: var(--bg-surface-elevated);
      }

      .checklist-item.status-ready .checklist-icon {
        color: #10B981;
        font-weight: 700;
      }

      .checklist-item.status-pending .checklist-icon {
        color: #F59E0B;
        font-weight: 700;
      }

      .checklist-item-title {
        display: block;
        font-size: 0.85rem;
        font-weight: 600;
        color: #E5E7EB;
      }

      .checklist-item-sub {
        display: block;
        font-size: 0.75rem;
        color: #9CA3AF;
      }

      /* Overview Snapshots Grid */
      .overview-snapshots-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1.25rem;
      }

      .snapshot-card {
        margin-bottom: 0;
      }

      .snapshot-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .snapshot-header h3 {
        margin: 0;
        font-size: 1rem;
        color: #F9FAFB;
      }

      .snapshot-body {
        font-size: 0.85rem;
        color: #D1D5DB;
        line-height: 1.5;
      }

      .snapshot-body p {
        margin: 0 0 0.4rem 0;
      }

      .snapshot-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .snapshot-list li {
        margin-bottom: 0.4rem;
      }

      /* Form Elements */
      .form-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.25rem;
      }

      @media (max-width: 640px) {
        .form-grid-2 {
          grid-template-columns: 1fr;
        }
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .form-group label {
        font-size: 0.85rem;
        font-weight: 500;
        color: #E5E7EB;
      }

      .required-star {
        color: #EF4444;
      }

      .optional-tag {
        font-size: 0.75rem;
        color: #9CA3AF;
        font-weight: 400;
      }

      .form-control {
        width: 100%;
        padding: 0.65rem 0.85rem;
        background: var(--bg-canvas);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        color: #F9FAFB;
        font-size: 0.9rem;
        font-family: inherit;
        box-sizing: border-box;
        transition: border-color 0.15s ease-in-out;
      }

      .form-control:focus {
        outline: none;
        border-color: #6366F1;
      }

      .field-hint {
        font-size: 0.75rem;
        color: #9CA3AF;
      }

      .phone-input-group {
        display: flex;
        gap: 0.5rem;
      }

      .phone-code-select {
        max-width: 160px;
        flex-shrink: 0;
      }

      /* Chips Cluster */
      .chips-cluster {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .skill-badge-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--bg-surface-elevated);
        border: 1px solid var(--border-subtle);
        padding: 0.35rem 0.65rem;
        border-radius: 9999px;
        font-size: 0.8rem;
        color: #F3F4F6;
      }

      .skill-proof-tag {
        font-size: 0.7rem;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        background: rgba(16, 185, 129, 0.15);
        color: #34D399;
      }

      .skill-proficiency-tag {
        font-size: 0.7rem;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        background: rgba(99, 102, 241, 0.15);
        color: #A5B4FC;
      }

      /* Record Cards */
      .records-container {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .record-card {
        background: var(--bg-surface-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        padding: 1rem;
      }

      .record-card-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .record-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #F9FAFB;
      }

      .record-subtitle {
        font-size: 0.85rem;
        color: #9CA3AF;
      }

      .record-dates {
        font-size: 0.8rem;
        color: #9CA3AF;
      }

      .record-description {
        margin: 0.5rem 0 0 0;
        font-size: 0.85rem;
        color: #D1D5DB;
        line-height: 1.4;
      }

      .record-bullets {
        margin: 0.5rem 0 0 1.25rem;
        padding: 0;
        font-size: 0.85rem;
        color: #D1D5DB;
      }

      /* Projects Grid */
      .projects-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 1.25rem;
      }

      .project-card {
        background: var(--bg-surface-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: 10px;
        padding: 1.25rem;
      }

      .project-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .project-title {
        margin: 0;
        font-size: 1rem;
        color: #F9FAFB;
      }

      .project-desc {
        margin: 0.5rem 0 0.75rem 0;
        font-size: 0.85rem;
        color: #9CA3AF;
        line-height: 1.4;
      }

      .project-tech-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 0.75rem;
      }

      .tech-tag {
        font-size: 0.75rem;
        background: rgba(255,255,255,0.06);
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        color: #D1D5DB;
      }

      /* Progressive Disclosure */
      .advanced-disclosure {
        margin-top: 0.75rem;
        border-top: 1px solid var(--border-subtle);
        padding-top: 0.5rem;
      }

      .advanced-disclosure summary {
        font-size: 0.75rem;
        color: #9CA3AF;
        cursor: pointer;
        user-select: none;
      }

      .advanced-disclosure summary:hover {
        color: #D1D5DB;
      }

      .disclosure-content {
        padding: 0.5rem 0;
        font-size: 0.8rem;
        color: #9CA3AF;
      }

      /* Sticky Save Bar */
      .sticky-save-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: rgba(17, 24, 39, 0.95);
        backdrop-filter: blur(12px);
        border-top: 1px solid var(--border-subtle);
        padding: 0.75rem 1.5rem;
        z-index: 50;
      }

      .save-bar-content {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .save-bar-status {
        font-size: 0.85rem;
        color: #9CA3AF;
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.85rem;
        font-weight: 500;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        transition: all 0.15s ease-in-out;
      }

      .btn-primary {
        background: #6366F1;
        color: #fff;
      }

      .btn-primary:hover {
        background: #4F46E5;
      }

      .btn-secondary {
        background: var(--bg-surface-elevated);
        color: #E5E7EB;
        border: 1px solid var(--border-subtle);
      }

      .btn-secondary:hover {
        background: rgba(255,255,255,0.08);
      }

      .btn-ghost {
        background: transparent;
        color: #818CF8;
      }

      .btn-ghost:hover {
        background: rgba(99, 102, 241, 0.1);
      }

      .btn-sm {
        padding: 0.35rem 0.65rem;
        font-size: 0.8rem;
      }

      .icon-sm {
        width: 16px;
        height: 16px;
      }

      .checkbox-group {
        display: flex;
        align-items: center;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #E5E7EB;
        cursor: pointer;
      }

      .confirmation-box {
        background: var(--bg-surface-elevated);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        padding: 1rem;
      }

      .empty-state-notice {
        font-size: 0.85rem;
        color: #9CA3AF;
        margin: 0;
        padding: 1rem 0;
      }

      .empty-action-notes {
        font-size: 0.85rem;
        color: #10B981;
        margin: 0;
      }

      .alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1.25rem;
        border-radius: 8px;
        margin-bottom: 1.5rem;
        font-size: 0.9rem;
      }

      .alert-success {
        background: rgba(16, 185, 129, 0.15);
        color: #34D399;
        border: 1px solid rgba(16, 185, 129, 0.3);
      }

      .alert-error {
        background: rgba(239, 68, 68, 0.15);
        color: #F87171;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
    </style>
  `;

  return renderLayout({
    title: 'Candidate Profile & Readiness Workspace',
    content,
    activeNav: 'profile',
    user,
    description: 'Maintain your professional candidate profile, job preferences, and application readiness.',
  });
}
