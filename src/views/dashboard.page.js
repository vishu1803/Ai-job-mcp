import { renderLayout } from './layout.js';

import { escapeHtml as e } from '../utils/html-escaper.js';

import { action, pageHeading, draftRows } from './components/workspace.js';

export function renderDashboardPage({
  user,
  candidate = null,
  tenant = null,
  readiness = null,
  applications = [],
  recommendedJobs = [],
  resumes = [],
  skills = [],
  projects = [],
  gitHubConnection = null,
  activeProposals = [],
  conflicts = [],
  flashMessage = null,
  flashError = null,
  studioLibrary = null,
  copilotOpen = false,
  initialIntent = null,
}) {
  const FIELD_MAP = {
    phone: 'Phone number',
    location: 'Location',
    headline: 'Professional headline',
    targetRoles: 'Target job roles',
    skills: 'Technical skills',
    experience: 'Work history',
    education: 'Education details',
  };

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

  const nextStepDescription = conflicts.length
    ? `${conflicts.length} profile differences need your review.`
    : missing.length
      ? `Add ${FIELD_MAP[missing[0]] || missing[0]}. ${missing.length} screening preference${missing.length > 1 ? 's need' : ' needs'} attention when you apply.`
      : 'Review your career profile and preferences before choosing your next role.';

  const verifiedProjectsHtml =
    projects && projects.length > 0
      ? `<div class="ch-projects-preview" style="margin-top:14px;border-top:1px solid var(--border-subtle);padding-top:10px;"><p class="ch-eyebrow" style="font-size:0.75rem;margin-bottom:6px;">VERIFIED PROJECTS</p><div style="display:flex;flex-direction:column;gap:4px;">${projects
          .slice(0, 3)
          .map(
            (p) =>
              `<a href="/projects/${e(p.id || '')}" style="font-size:0.85rem;color:var(--accent-indigo);text-decoration:none;font-weight:500;">${e(p.name || p.displayName || 'Project')}</a>`
          )
          .join('')}</div></div>`
      : '';

  const verifiedSkillsHtml =
    skills && skills.length > 0
      ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${skills
          .slice(0, 4)
          .map(
            (s) =>
              `<span class="ch-badge" style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-muted);border:1px solid var(--border-subtle);">${e(
                s.name || s.skillName || s
              )}</span>`
          )
          .join('')}</div>`
      : '';

  const connectionHtml = gitHubConnection
    ? `<p class="ch-note" style="margin-top:10px;font-size:0.75rem;color:var(--text-dim);">Connected: ${e(
        gitHubConnection.displayName || 'GitHub App'
      )}</p>`
    : '';

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

    <aside><section class="ch-panel"><p class="ch-eyebrow">YOUR FOUNDATION${tenant?.name ? ` &middot; ${e(tenant.name)}` : ''}</p><h2 style="margin-top:12px">${e(candidate?.displayName || user.displayName || 'Career profile')}</h2>${candidate?.headline ? `<p style="font-size:0.85rem;color:var(--text-dim);margin:4px 0 8px;">${e(candidate.headline)}</p>` : ''}<p>${master ? 'Master resume ready to tailor.' : 'Add a master resume to begin tailoring.'} Candidate-reported facts keep their original truth classification.</p>${verifiedSkillsHtml}${verifiedProjectsHtml}${connectionHtml}<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:10px;font-size:0.8rem;"><a href="/projects">Projects</a><a href="/skills">Skills</a><a href="/sources">Sources</a><a href="/connect">AI Connect</a><a href="/docs/mcp">MCP Docs</a></div><div class="ch-actions" style="margin-top:14px;">${action(master ? '/resumes/' + master.id : '/profile', master ? 'Review master' : 'Review profile')}</div></section>

    <section class="ch-panel"><h2>Next step</h2><p>${nextStepDescription}</p><div class="ch-actions">${action('/profile', 'Review profile')}</div>${activeProposals.length ? `<p class="ch-note">${activeProposals.length} profile suggestions await review.</p><button class="ch-button" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(true,this)">Review suggestions</button>` : ''}</section></aside></div>

    ${copilotOpen ? `<script>window.addEventListener('DOMContentLoaded',()=>{window.toggleCopilotDrawer && window.toggleCopilotDrawer(true);});</script>` : ''}${initialIntent ? `<p class="ch-note">Requested assistance: ${e(initialIntent)}</p>` : ''}</div>`;

  return renderLayout({ title: 'Overview', content, activeNav: 'dashboard', user });
}
