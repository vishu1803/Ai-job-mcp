/**
 * @file Authenticated Candidate Dashboard Workspace View Template (P85 / P89).
 *
 * Implements a calm, focused, consumer-grade candidate workspace:
 * 1. Section 1: What should I do next? (Priority Action Hero, Readiness Bar, Max 3 Action Items)
 * 2. Section 2: Which jobs should I consider? (Top 3 Matching Job Opportunities with Fit Signals)
 * 3. Section 3: Which applications need attention? (Active Pipeline Status & Next Stage Actions)
 * 4. Contextual Copilot integration (Triggers universal drawer from layout)
 *
 * Enforces zero raw emojis, zero developer jargon (no AST/pipeline banners or "deterministic" tags),
 * zero layout shifts (fixed SVG dimensions), and zero duplicate drawer markup.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';
import { renderEmptyState } from './components/state-views.js';

/**
 * Human-friendly field labels and profile anchor mappings.
 */
const FIELD_MAP = {
  phone: { label: 'Phone number', anchor: '/profile#basics' },
  location: { label: 'Location', anchor: '/profile#basics' },
  headline: { label: 'Professional headline', anchor: '/profile#basics' },
  targetRoles: { label: 'Target job roles', anchor: '/profile#roles' },
  remotePreference: { label: 'Workplace preference', anchor: '/profile#roles' },
  workAuthorization: { label: 'Work authorization', anchor: '/profile#eligibility' },
  visaSponsorshipRequired: { label: 'Visa sponsorship status', anchor: '/profile#eligibility' },
  noticePeriod: { label: 'Notice period', anchor: '/profile#compensation' },
  salaryFloor: { label: 'Salary expectations', anchor: '/profile#compensation' },
  skills: { label: 'Technical skills', anchor: '/profile#skills' },
  experience: { label: 'Work history', anchor: '/profile#experience' },
  education: { label: 'Education details', anchor: '/profile#education' },
};

/**
 * Renders the candidate dashboard page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object|null} [params.candidate=null] Candidate record
 * @param {object|null} [params.candidateProfile=null] Canonical profile
 * @param {object|null} [params.readiness=null] Canonical readiness summary
 * @param {Array} [params.skills=[]] Verified skills list
 * @param {Array} [params.projects=[]] Projects list
 * @param {Array} [params.applications=[]] Applications list
 * @param {Array} [params.recommendedJobs=[]] Matching recommended jobs
 * @param {number} [params.connectedSourcesCount=0] Connected repository count
 * @param {object|null} [params.gitHubConnection=null] Active GitHub connection
 * @param {Array} [params.resumes=[]] Resumes list
 * @param {number} [params.aiTokensCount=0] Personal AI tokens count
 * @param {Array} [params.activeProposals=[]] Pending safe AI proposals
 * @param {Array} [params.conflicts=[]] Detected profile conflicts
 * @param {Array} [params.messages=[]] Copilot conversation messages
 * @param {string|null} [params.flashMessage=null] Success alert
 * @param {string|null} [params.flashError=null] Error alert
 * @param {boolean} [params.aiAvailable=true] Whether AI assistant is online
 * @param {boolean} [params.copilotOpen=false] Whether copilot panel is expanded
 * @param {string|null} [params.initialIntent=null] Pre-filled copilot intent
 * @returns {string} Full HTML document
 */
export function renderDashboardPage({
  user,
  tenant,
  candidate = null,
  candidateProfile = null,
  readiness = null,
  skills = [],
  projects = [],
  applications = [],
  recommendedJobs = [],
  connectedSourcesCount = 0,
  gitHubConnection = null,
  resumes = [],
  aiTokensCount = 0,
  activeProposals = [],
  conflicts = [],
  messages = [],
  flashMessage = null,
  flashError = null,
  aiAvailable = true,
  copilotOpen = false,
  initialIntent = null,
}) {
  const candidateName = user?.displayName || candidate?.displayName || 'Candidate';
  const candidateHeadline = candidate?.headline || candidateProfile?.headline || '';
  const candidateEmail = user?.email || candidate?.canonicalEmail || '';

  // Authoritative profile readiness
  const readinessScore =
    typeof readiness?.readinessScore === 'number'
      ? readiness.readinessScore
      : typeof readiness?.semantics?.overallReadinessScore === 'number'
        ? readiness.semantics.overallReadinessScore
        : 75;

  const missingFields = readiness?.missingFields || [];
  const isReady = readinessScore >= 95 && missingFields.length === 0;

  // Greeting based on time of day
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Build top 3 priority action items
  const priorityActions = [];

  if (missingFields.length > 0) {
    const firstMissing = missingFields[0];
    const meta = FIELD_MAP[firstMissing] || { label: firstMissing, anchor: '/profile' };
    priorityActions.push({
      id: 'complete-profile',
      title: `Add ${meta.label}`,
      description: `${missingFields.length} screening field${missingFields.length > 1 ? 's are' : ' is'} missing for automated employer evaluations.`,
      icon: 'alertCircle',
      ctaLabel: 'Update Profile',
      ctaHref: meta.anchor,
      badge: 'Required',
      badgeClass: 'badge-amber',
    });
  }

  if (activeProposals.length > 0) {
    priorityActions.push({
      id: 'review-proposals',
      title: 'Review Copilot Proposals',
      description: `${activeProposals.length} suggested profile improvement${activeProposals.length > 1 ? 's require' : ' requires'} your confirmation.`,
      icon: 'sparkles',
      ctaLabel: 'Review in Copilot',
      ctaOnClick: 'window.toggleCopilotDrawer && window.toggleCopilotDrawer(true, this)',
      badge: `${activeProposals.length} Pending`,
      badgeClass: 'badge-cyan',
    });
  }

  const incompleteApp = applications.find((a) => a.status === 'SAVED' || a.status === 'DRAFT');
  if (incompleteApp && priorityActions.length < 3) {
    priorityActions.push({
      id: 'prepare-app',
      title: `Prepare ${incompleteApp.companyName || 'Application'}`,
      description: `Complete tailored answers and review resume alignment for ${incompleteApp.jobTitle || 'your role'}.`,
      icon: 'clipboard',
      ctaLabel: 'Continue Application',
      ctaHref: `/applications/${escapeHtml(incompleteApp.id)}`,
      badge: 'In Progress',
      badgeClass: 'badge-indigo',
    });
  }

  if (priorityActions.length < 3) {
    priorityActions.push({
      id: 'evaluate-radar',
      title: 'Discover Matching Roles',
      description:
        'Run Job Fit Radar to match your verified technical skills against real market job descriptions.',
      icon: 'radar',
      ctaLabel: 'Launch Job Radar',
      ctaHref: '/apps/radar',
      badge: 'Recommended',
      badgeClass: 'badge-verified',
    });
  }

  const content = `
    <div class="container" style="max-width:1140px; margin:28px auto; padding:0 20px;">
      
      <!-- Flash Message Alerts -->
      ${
        flashMessage
          ? `
        <div class="card" style="border-left:4px solid var(--accent-emerald); background:rgba(16,185,129,0.08); padding:14px 20px; margin-bottom:24px; display:flex; align-items:center; gap:12px;">
          <span style="color:var(--accent-emerald); flex-shrink:0;">${renderIcon('check', { size: 18 })}</span>
          <span style="color:var(--text-main); font-size:0.9rem; font-weight:500;">${escapeHtml(flashMessage)}</span>
        </div>
      `
          : ''
      }
      ${
        flashError
          ? `
        <div class="card" style="border-left:4px solid var(--accent-amber); background:rgba(245,158,11,0.08); padding:14px 20px; margin-bottom:24px; display:flex; align-items:center; gap:12px;">
          <span style="color:var(--accent-amber); flex-shrink:0;">${renderIcon('alertTriangle', { size: 18 })}</span>
          <span style="color:var(--text-main); font-size:0.9rem; font-weight:500;">${escapeHtml(flashError)}</span>
        </div>
      `
          : ''
      }

      <!-- ================================================================= -->
      <!-- SECTION 1: WHAT SHOULD I DO NEXT? (Priority Action Hero)          -->
      <!-- ================================================================= -->
      <section class="card hero-card" style="padding:28px 32px; margin-bottom:32px; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:var(--radius-lg); box-shadow:var(--shadow-card);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:24px; margin-bottom:24px;">
          
          <!-- Candidate Identity & Greeting -->
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:14px;">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan)); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-size:1.25rem; font-weight:700; flex-shrink:0;">
                ${escapeHtml(candidateName.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <h1 style="font-size:1.35rem; font-weight:700; color:var(--text-main); margin:0; line-height:1.2;">
                  ${timeGreeting}, ${escapeHtml(candidateName)}
                </h1>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                  ${candidateHeadline ? escapeHtml(candidateHeadline) : 'Candidate Workspace'} &bull; <span>${escapeHtml(candidateEmail)}</span>${tenant?.name ? ` &bull; <span>${escapeHtml(tenant.name)}</span>` : ''}${gitHubConnection ? ` &bull; <span>GitHub App</span>` : ''}
                </div>
                ${
                  projects && projects.length > 0
                    ? `
                <div style="margin-top:6px; font-size:0.775rem; color:var(--text-dim); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span style="color:var(--accent-cyan); display:inline-flex; align-items:center; gap:4px;">
                    ${renderIcon('code', { size: 12 })}
                    <span>Verified Projects:</span>
                  </span>
                  ${projects
                    .slice(0, 3)
                    .map(
                      (p) =>
                        `<a href="/projects/${escapeHtml(p.id)}" style="color:var(--text-muted); text-decoration:none; background:rgba(255,255,255,0.04); padding:2px 8px; border-radius:4px; border:1px solid var(--border-subtle); font-family:var(--font-mono); font-size:0.75rem;">${escapeHtml(p.name)}</a>`
                    )
                    .join('')}
                  ${projects.length > 3 ? `<span style="font-size:0.75rem; color:var(--text-dim);">+${projects.length - 3} more</span>` : ''}
                </div>
                `
                    : ''
                }
              </div>
            </div>
          </div>

          <!-- Authoritative Profile Readiness Bar -->
          <div style="min-width:260px; flex:0 0 auto;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
              <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Application Readiness</span>
              <span style="font-size:1.2rem; font-weight:700; color:${readinessScore >= 85 ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">
                ${readinessScore}%
              </span>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:var(--radius-full); overflow:hidden;">
              <div style="width:${readinessScore}%; height:100%; background:linear-gradient(90deg, ${readinessScore >= 85 ? 'var(--accent-indigo), var(--accent-emerald)' : 'var(--accent-indigo), var(--accent-amber)'}); border-radius:var(--radius-full); transition:width 0.4s ease;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; font-size:0.75rem; color:var(--text-dim);">
              <span>${isReady ? 'All key screening fields verified' : `${missingFields.length} item${missingFields.length === 1 ? '' : 's'} need attention`}</span>
              <a href="/profile" style="color:var(--accent-indigo); text-decoration:none; font-weight:500;">Edit Profile &rarr;</a>
            </div>
          </div>

        </div>

        <!-- Priority Action Cards (Max 3) -->
        <div>
          <div style="font-size:0.775rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
            What should I do next?
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px;">
            ${priorityActions
              .slice(0, 3)
              .map(
                (act) => `
              <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px 18px; display:flex; flex-direction:column; justify-content:space-between; gap:12px;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <div style="display:inline-flex; align-items:center; gap:6px; color:var(--accent-indigo);">
                      ${renderIcon(act.icon, { size: 16 })}
                      <span style="font-size:0.875rem; font-weight:600; color:var(--text-main);">${escapeHtml(act.title)}</span>
                    </div>
                    <span class="badge ${act.badgeClass}">${escapeHtml(act.badge)}</span>
                  </div>
                  <p style="font-size:0.8rem; color:var(--text-muted); margin:0; line-height:1.45;">
                    ${escapeHtml(act.description)}
                  </p>
                </div>
                <div>
                  ${
                    act.ctaOnClick
                      ? `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="${act.ctaOnClick}" style="width:100%; justify-content:center; padding:6px 12px; font-size:0.8rem;">
                      <span>${escapeHtml(act.ctaLabel)}</span>
                      ${renderIcon('arrowRight', { size: 12 })}
                    </button>
                  `
                      : `
                    <a href="${act.ctaHref}" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center; padding:6px 12px; font-size:0.8rem; text-decoration:none;">
                      <span>${escapeHtml(act.ctaLabel)}</span>
                      ${renderIcon('arrowRight', { size: 12 })}
                    </a>
                  `
                  }
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </section>

      <!-- ================================================================= -->
      <!-- SECTION 2: WHICH JOBS SHOULD I CONSIDER? (Target Matching Roles)  -->
      <!-- ================================================================= -->
      <section style="margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; border-radius:8px; background:rgba(99,102,241,0.12); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center;">
              ${renderIcon('radar', { size: 18 })}
            </div>
            <div>
              <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Which jobs should I consider?</h2>
              <span style="font-size:0.775rem; color:var(--text-dim);">Opportunities matching your verified skills & target roles</span>
            </div>
          </div>
          <a href="/apps/radar" style="font-size:0.85rem; color:var(--accent-indigo); text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
            <span>Explore All in Job Radar</span>
            ${renderIcon('arrowRight', { size: 14 })}
          </a>
        </div>

        ${
          recommendedJobs.length === 0
            ? `
          <div class="card" style="padding:32px 24px; text-align:center; background:var(--bg-surface); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
            <div style="color:var(--text-dim); margin-bottom:10px; display:inline-flex; align-items:center; justify-content:center;">${renderIcon('jobs', { size: 32 })}</div>
            <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0 0 6px;">No matching jobs yet</h3>
            <p style="font-size:0.85rem; color:var(--text-muted); max-width:480px; margin:0 auto 16px; line-height:1.5;">
              Explore open positions or evaluate job descriptions against your verified skills using Job Radar.
            </p>
            <a href="/apps/radar" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px; text-decoration:none;">
              ${renderIcon('radar', { size: 14 })}
              <span>Browse jobs</span>
            </a>
          </div>
        `
            : `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:18px;">
            ${recommendedJobs
              .slice(0, 3)
              .map(
                (job) => `
              <div class="card" style="padding:20px 22px; display:flex; flex-direction:column; justify-content:space-between; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); transition:transform 0.15s ease, border-color 0.15s ease;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom:8px;">
                    <div>
                      <h3 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0 0 2px;">
                        ${escapeHtml(job.title || job.jobTitle || 'Opportunity')}
                      </h3>
                      <div style="font-size:0.85rem; font-weight:600; color:var(--text-dim);">
                        ${escapeHtml(job.company || job.companyName || 'Company')}
                      </div>
                    </div>
                    ${
                      job.matchScore != null
                        ? `
                      <span class="badge ${job.matchScore >= 85 ? 'badge-verified' : 'badge-indigo'}" style="flex-shrink:0;">
                        ${job.matchScore}% Match
                      </span>
                    `
                        : `
                      <span class="badge badge-indigo" style="flex-shrink:0;">
                        ${escapeHtml(job.status || 'Saved Lead')}
                      </span>
                    `
                    }
                  </div>

                  <div style="display:flex; align-items:center; gap:6px; font-size:0.775rem; color:var(--text-dim); margin-bottom:12px;">
                    ${renderIcon('mapPin', { size: 12 })}
                    <span>${escapeHtml(job.location || 'Remote')}</span>
                    <span>&bull;</span>
                    <span>${escapeHtml(job.workplaceType || 'Full-time')}</span>
                  </div>

                  <!-- Matched Skill Chips -->
                  <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:18px;">
                    ${(job.skills || [])
                      .slice(0, 3)
                      .map(
                        (sk) => `
                      <span class="tag" style="font-size:0.725rem; padding:2px 8px; background:rgba(255,255,255,0.04); color:var(--text-muted); border-radius:4px;">
                        ${escapeHtml(sk)}
                      </span>
                    `
                      )
                      .join('')}
                  </div>
                </div>

                <!-- Action Link -->
                <div>
                  <a href="/apps/radar" class="btn btn-secondary btn-sm" style="width:100%; justify-content:center; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                    ${renderIcon('radar', { size: 13 })}
                    <span>Evaluate Fit with Radar</span>
                  </a>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
        }
      </section>

      <!-- ================================================================= -->
      <!-- SECTION 3: WHICH APPLICATIONS NEED ATTENTION?                     -->
      <!-- ================================================================= -->
      <section style="margin-bottom:32px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; border-radius:8px; background:rgba(6,182,212,0.12); color:var(--accent-cyan); display:flex; align-items:center; justify-content:center;">
              ${renderIcon('briefcase', { size: 18 })}
            </div>
            <div>
              <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Which applications need attention?</h2>
              <span style="font-size:0.775rem; color:var(--text-dim);">Active pipeline tracking and interview preparation</span>
            </div>
          </div>
          <a href="/applications" style="font-size:0.85rem; color:var(--accent-cyan); text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px;">
            <span>View All Applications (${applications.length})</span>
            ${renderIcon('arrowRight', { size: 14 })}
          </a>
        </div>

        <div class="card" style="padding:0; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); overflow:hidden;">
          ${
            applications.length === 0
              ? `
            <div style="padding:32px 24px;">
              ${renderEmptyState({
                title: 'No Applications Tracked Yet',
                message:
                  'You have not submitted or saved any applications. Evaluate a role in Job Radar to prepare your first tailored submission package.',
                actionLabel: 'Discover Matching Jobs',
                actionHref: '/apps/radar',
                icon: 'applications',
              })}
            </div>
          `
              : `
            <div class="table-responsive" style="border:none; background:transparent;">
              <table class="data-table" style="width:100%;">
                <thead>
                  <tr>
                    <th>Company &amp; Role</th>
                    <th>Status</th>
                    <th>Last Updated</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${applications
                    .slice(0, 4)
                    .map((app) => {
                      const statusBadge =
                        app.status === 'ACCEPTED' || app.status === 'OFFER'
                          ? 'badge-verified'
                          : app.status === 'APPLIED' || app.status === 'SUBMITTED'
                            ? 'badge-indigo'
                            : app.status === 'INTERVIEWING'
                              ? 'badge-cyan'
                              : 'badge-amber';
                      const updatedDate = app.updatedAt
                        ? new Date(app.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Recently';
                      return `
                      <tr>
                        <td>
                          <div style="font-weight:600; color:var(--text-main);">
                            ${escapeHtml(app.companyName || 'Company')}
                          </div>
                          <div style="font-size:0.775rem; color:var(--text-dim);">
                            ${escapeHtml(app.jobTitle || 'Role')}
                          </div>
                        </td>
                        <td>
                          <span class="badge ${statusBadge}">
                            ${escapeHtml(app.status || 'SAVED')}
                          </span>
                        </td>
                        <td style="font-size:0.8rem; color:var(--text-dim);">
                          ${escapeHtml(updatedDate)}
                        </td>
                        <td style="text-align:right;">
                          <a href="/applications/${escapeHtml(app.id)}" class="btn btn-secondary btn-sm" style="text-decoration:none; padding:4px 10px; font-size:0.775rem;">
                            <span>Review</span>
                            ${renderIcon('arrowRight', { size: 11 })}
                          </a>
                        </td>
                      </tr>
                    `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          }
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Candidate Dashboard',
    content,
    activeNav: 'dashboard',
    user,
  });
}
