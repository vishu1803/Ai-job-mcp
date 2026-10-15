import { renderLayout } from './layout.js';

import { escapeHtml as e } from '../utils/html-escaper.js';

import { action, pageHeading, draftRows } from './components/workspace.js';

export function renderDashboardPage({
  user,
  candidate = null,
  readiness = null,
  applications = [],
  recommendedJobs = [],
  resumes = [],
  activeProposals = [],
  conflicts = [],
  flashMessage = null,
  flashError = null,
  studioLibrary = null,
  copilotOpen = false,
  initialIntent = null,
}) {
  const drafts = studioLibrary?.drafts || [],
    master = resumes.find((r) => r.isBaseResume),
    missing = readiness?.missingFields || [];

  recommendedJobs = recommendedJobs.filter(
    (j) => !j.applicationId || !applications.some((a) => a.id === j.applicationId)
  );
  const resumeContent = drafts.length
    ? `<div class="ch-list">${draftRows(drafts, 2)}</div>`
    : `<div class="ch-panel"><h2>${master ? 'Make your experience relevant.' : 'Start with your story.'}</h2><p>${master ? 'Choose a role and tailor a copy of your master resume. Your original stays intact.' : 'Import a resume, review your facts and choose a target role when you are ready.'}</p><div class="ch-actions">${action(master ? '/resume-studio' : '/resumes#import-resume', master ? 'Tailor a resume' : 'Import your resume', true)}</div></div>`;

  const rows = applications
    .slice(0, 3)
    .map(
      (a) =>
        `<article class="ch-row"><div class="ch-row-content"><h3>${e(a.jobTitle || 'Application')}</h3><p>${e(a.companyName || '')} &middot; ${e(
          String(a.status || 'Preparing')
            .toLowerCase()
            .replaceAll('_', ' ')
        )}</p></div>${action('/applications/' + e(a.id) + '/apply', 'Review application')}</article>`
    )
    .join('');

  const content = `<div class="ch-page">${pageHeading('Overview', 'Pick up where you left off. Your next opportunity starts with what you have already built.', action('/apps/radar', 'Find a job', true))}

    ${flashMessage ? `<div class="ch-notice" role="status">${e(flashMessage)}</div>` : ''}${flashError ? `<div class="ch-notice" role="alert">${e(flashError)}</div>` : ''}

    <div class="ch-grid"><div><div class="ch-section-header"><h2>${drafts.length ? 'Continue your resume' : 'Your resume workspace'}</h2><a href="/resumes">All resumes</a></div>${studioLibrary === null ? '<p class="ch-note">Saved drafts could not be loaded. Open Resumes to retry.</p>' : ''}${resumeContent}

    <div class="ch-section-header"><h2>Applications</h2><a href="/applications">View all</a></div>${rows ? `<div class="ch-list">${rows}</div>` : '<div class="ch-list ch-empty"><h3>Your application story starts here.</h3><p>Explore a role, prepare your resume and review the application before taking the next step.</p><a href="/apps/radar?tab=saved">View saved jobs</a></div>'}

    ${
      recommendedJobs.length
        ? `<div class="ch-section-header"><h2>Jobs to explore</h2><a href="/apps/radar">Browse jobs</a></div><div class="ch-list">${recommendedJobs
            .slice(0, 3)
            .map(
              (j) =>
                `<article class="ch-row"><div class="ch-row-content"><h3>${e(j.title || j.jobTitle || 'Opportunity')}</h3><p>${e(j.company || j.companyName || '')}</p></div>${action('/apps/radar', 'View jobs')}</article>`
            )
            .join('')}</div>`
        : ''
    }</div>

    <aside><section class="ch-panel"><p class="ch-eyebrow">YOUR FOUNDATION</p><h2 style="margin-top:12px">${e(candidate?.displayName || user.displayName || 'Career profile')}</h2><p>${master ? 'Master resume ready to tailor.' : 'Add a master resume to begin tailoring.'} Candidate-reported facts keep their original truth classification.</p><div class="ch-actions">${action(master ? '/resumes/' + master.id : '/profile', master ? 'Review master' : 'Review profile')}</div></section>

    <section class="ch-panel"><h2>Next step</h2><p>${conflicts.length ? `${conflicts.length} profile differences need your review.` : missing.length ? `${missing.length} screening preferences need attention when you apply.` : 'Review your career profile and preferences before choosing your next role.'}</p><div class="ch-actions">${action('/profile', 'Review profile')}</div>${activeProposals.length ? `<p class="ch-note">${activeProposals.length} profile suggestions await review.</p><button class="ch-button" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(true,this)">Review suggestions</button>` : ''}</section></aside></div>

    ${copilotOpen ? `<script>window.addEventListener('DOMContentLoaded',()=>{window.toggleCopilotDrawer && window.toggleCopilotDrawer(true);});</script>` : ''}${initialIntent ? `<p class="ch-note">Requested assistance: ${e(initialIntent)}</p>` : ''}</div>`;

  return renderLayout({ title: 'Overview', content, activeNav: 'dashboard', user });
}
