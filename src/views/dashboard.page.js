/**
 * @file Authenticated Candidate Dashboard Workspace View Template (P86.3 / P86.5).
 *
 * Implements a calm, focused, consumer-grade candidate workspace:
 * 1. What do I need to do? (Priority Action Hero & Canonical Readiness Bar)
 * 2. What can I do? (3 Clean Quick Actions: Radar, Applications, Resumes)
 * 3. What is happening? (Concise Platform Status: Applications, Skills, Sources)
 * 4. Career Copilot (Integrated Context-Aware Assistant with Safe Proposals)
 *
 * Enforces zero raw emojis, zero developer jargon (AST/pipeline banners removed),
 * and zero layout shifts (fixed SVG dimensions).
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';
import { renderEmptyState, renderAIUnavailableCard } from './components/state-views.js';

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

  // Calculate authoritative readiness
  const readinessScore =
    typeof readiness?.readinessScore === 'number'
      ? readiness.readinessScore
      : typeof readiness?.semantics?.overallReadinessScore === 'number'
        ? readiness.semantics.overallReadinessScore
        : 75;

  const missingFields = readiness?.missingFields || [];
  const flaggedItems = readiness?.flaggedItems || [];
  const isReady = readinessScore >= 95 && missingFields.length === 0;

  // Filter verified vs other skills
  const verifiedSkills = skills.filter((s) => s.provenanceStatus === 'VERIFIED');
  const otherSkills = skills.filter((s) => s.provenanceStatus !== 'VERIFIED');

  // Greeting based on time of day
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

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
      <!-- BLOCK 1: WHAT DO I NEED TO DO? (Priority Action Hero)             -->
      <!-- ================================================================= -->
      <section class="card hero-card" style="padding:28px 32px; margin-bottom:28px; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:var(--radius-lg); box-shadow:var(--shadow-md);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:24px;">
          
          <!-- Candidate Identity & Greeting -->
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:14px; margin-bottom:8px;">
              <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan)); color:#FFFFFF; display:flex; align-items:center; justify-content:center; font-size:1.25rem; font-weight:700; flex-shrink:0;">
                ${escapeHtml(candidateName.slice(0, 2).toUpperCase())}
              </div>
              <div>
                <h1 style="font-size:1.4rem; font-weight:700; color:var(--text-main); margin:0; line-height:1.2;">
                  ${timeGreeting}, ${escapeHtml(candidateName)}
                </h1>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:2px;">
                  ${candidateHeadline ? escapeHtml(candidateHeadline) : 'Candidate Profile'} &bull; <span>${escapeHtml(candidateEmail)}</span>
                </div>
              </div>
            </div>

            <!-- Readiness Status Description -->
            <div style="margin-top:16px;">
              ${
                isReady
                  ? `
                <div style="display:flex; align-items:center; gap:8px; color:var(--accent-emerald); font-size:0.9rem; font-weight:600;">
                  ${renderIcon('check', { size: 16 })}
                  <span>Your profile is application-ready. All essential screening fields are verified.</span>
                </div>
              `
                  : `
                <div style="font-size:0.9rem; color:var(--text-main); font-weight:500; margin-bottom:6px;">
                  ${missingFields.length > 0 ? `${missingFields.length} item${missingFields.length === 1 ? '' : 's'} need your attention before applying:` : 'Profile completeness progress:'}
                </div>
                ${
                  missingFields.length > 0
                    ? `
                  <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                    ${missingFields
                      .map((field) => {
                        const meta = FIELD_MAP[field] || { label: field, anchor: '/profile' };
                        return `
                        <a href="${meta.anchor}" class="badge" style="background:rgba(245,158,11,0.12); color:#FBBF24; border:1px solid rgba(245,158,11,0.3); text-decoration:none; padding:4px 10px; font-size:0.8rem; display:inline-flex; align-items:center; gap:4px;">
                          ${renderIcon('alertCircle', { size: 12 })}
                          <span>${escapeHtml(meta.label)}</span>
                        </a>
                      `;
                      })
                      .join('')}
                  </div>
                `
                    : ''
                }
              `
              }
            </div>
          </div>

          <!-- Readiness Gauge & Primary Actions -->
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:14px; min-width:240px;">
            <div style="text-align:right; width:100%;">
              <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                <span style="font-size:0.8rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Profile Readiness</span>
                <span style="font-size:1.25rem; font-weight:700; color:${readinessScore >= 80 ? 'var(--accent-emerald)' : 'var(--accent-amber)'};">
                  ${readinessScore}%
                </span>
              </div>
              <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:var(--radius-full); overflow:hidden;">
                <div style="width:${readinessScore}%; height:100%; background:linear-gradient(90deg, ${readinessScore >= 80 ? 'var(--accent-indigo), var(--accent-emerald)' : 'var(--accent-indigo), var(--accent-amber)'}); border-radius:var(--radius-full); transition:width 0.4s ease;"></div>
              </div>
            </div>

            <div style="display:flex; gap:10px; width:100%; justify-content:flex-end;">
              <a href="/profile" class="btn btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:6px; font-weight:600;">
                ${renderIcon('edit', { size: 14 })}
                <span>Complete Profile</span>
              </a>
              <a href="#copilot" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                ${renderIcon('copilot', { size: 14 })}
                <span>Fix with Copilot</span>
              </a>
            </div>
          </div>

        </div>
      </section>

      <!-- ================================================================= -->
      <!-- BLOCK 2: WHAT CAN I DO? (Quick Actions Strip)                     -->
      <!-- ================================================================= -->
      <section style="margin-bottom:32px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
          
          <!-- Quick Action 1: Find Jobs (Job Fit Radar) -->
          <a href="/apps/radar" class="card quick-action-card" style="text-decoration:none; display:flex; flex-direction:column; justify-content:space-between; padding:22px 24px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); background:var(--bg-surface); transition:transform 0.15s ease, border-color 0.15s ease;">
            <div>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:rgba(99,102,241,0.12); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center;">
                  ${renderIcon('radar', { size: 20 })}
                </div>
                <span class="badge badge-indigo">Deterministic</span>
              </div>
              <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0 0 6px;">Find Jobs (Radar)</h2>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0; line-height:1.45;">
                Explore job postings evaluated deterministically against your verified technical skills and target roles.
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:600; color:var(--accent-indigo); margin-top:16px;">
              <span>Launch Job Radar</span>
              ${renderIcon('arrowRight', { size: 14 })}
            </div>
          </a>

          <!-- Quick Action 2: Track Applications -->
          <a href="/applications" class="card quick-action-card" style="text-decoration:none; display:flex; flex-direction:column; justify-content:space-between; padding:22px 24px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); background:var(--bg-surface); transition:transform 0.15s ease, border-color 0.15s ease;">
            <div>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:rgba(6,182,212,0.12); color:var(--accent-cyan); display:flex; align-items:center; justify-content:center;">
                  ${renderIcon('applications', { size: 20 })}
                </div>
                <span class="badge badge-cyan">${applications.length} Active</span>
              </div>
              <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0 0 6px;">Track Applications</h2>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0; line-height:1.45;">
                Monitor your application pipelines, review tailored submission answers, and export handoff kits.
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:600; color:var(--accent-cyan); margin-top:16px;">
              <span>View Applications</span>
              ${renderIcon('arrowRight', { size: 14 })}
            </div>
          </a>

          <!-- Quick Action 3: Manage Resumes -->
          <a href="/resumes" class="card quick-action-card" style="text-decoration:none; display:flex; flex-direction:column; justify-content:space-between; padding:22px 24px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); background:var(--bg-surface); transition:transform 0.15s ease, border-color 0.15s ease;">
            <div>
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:rgba(16,185,129,0.12); color:var(--accent-emerald); display:flex; align-items:center; justify-content:center;">
                  ${renderIcon('resumes', { size: 20 })}
                </div>
                <span class="badge badge-verified">${resumes.length} Ready</span>
              </div>
              <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0 0 6px;">Manage Resumes</h2>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:0; line-height:1.45;">
                Inspect source resumes, tailor versions for specific job postings, and verify evidence integrity.
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:6px; font-size:0.85rem; font-weight:600; color:var(--accent-emerald); margin-top:16px;">
              <span>Manage Resumes</span>
              ${renderIcon('arrowRight', { size: 14 })}
            </div>
          </a>

        </div>
      </section>

      <!-- ================================================================= -->
      <!-- BLOCK 3: WHAT IS HAPPENING? (Concise Platform Status)             -->
      <!-- ================================================================= -->
      <section style="display:grid; grid-template-columns:1.2fr 1fr; gap:24px; margin-bottom:32px;" class="grid-2col">
        
        <!-- Column A: Active Applications Summary -->
        <div class="card" style="padding:24px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:var(--accent-indigo);">${renderIcon('briefcase', { size: 18 })}</span>
              <h3 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0;">Active Applications</h3>
            </div>
            <a href="/applications" style="font-size:0.8rem; color:var(--accent-indigo); text-decoration:none; font-weight:600;">
              View all (${applications.length}) &rarr;
            </a>
          </div>

          ${
            applications.length === 0
              ? renderEmptyState({
                  title: 'No Applications Tracked Yet',
                  message: 'Start by exploring open roles on Job Fit Radar, or prepare a tailored application.',
                  actionLabel: 'Find Matching Jobs',
                  actionHref: '/apps/radar',
                  icon: 'applications',
                })
              : `
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${applications
                .slice(0, 4)
                .map((app) => {
                  const statusClass =
                    app.status === 'ACCEPTED' || app.status === 'OFFER'
                      ? 'badge-verified'
                      : app.status === 'APPLIED' || app.status === 'SUBMITTED'
                        ? 'badge-indigo'
                        : 'badge-amber';
                  return `
                  <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-sm);">
                    <div style="min-width:0; padding-right:12px;">
                      <a href="/applications/${escapeHtml(app.id)}" style="font-size:0.9rem; font-weight:600; color:var(--text-main); text-decoration:none; display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                        ${escapeHtml(app.companyName || 'Company')}
                      </a>
                      <div style="font-size:0.8rem; color:var(--text-muted); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
                        ${escapeHtml(app.jobTitle || 'Role')}
                      </div>
                    </div>
                    <span class="badge ${statusClass}" style="flex-shrink:0;">
                      ${escapeHtml(app.status || 'SUBMITTED')}
                    </span>
                  </div>
                `;
                })
                .join('')}
            </div>
          `
          }
        </div>

        <!-- Column B: Career & Skills Snapshot -->
        <div class="card" style="padding:24px; background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="color:var(--accent-emerald);">${renderIcon('shield', { size: 18 })}</span>
                <h3 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0;">Verified Skills</h3>
              </div>
              <a href="/profile#skills" style="font-size:0.8rem; color:var(--accent-indigo); text-decoration:none; font-weight:600;">
                All skills (${skills.length}) &rarr;
              </a>
            </div>

            ${
              verifiedSkills.length === 0
                ? `
              <div style="padding:16px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-subtle); border-radius:var(--radius-sm); text-align:center;">
                <p style="font-size:0.85rem; color:var(--text-muted); margin:0 0 10px;">
                  No verified skills indexed yet. Connect your GitHub repository to verify technical skills from codebase evidence.
                </p>
                <a href="/sources" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                  ${renderIcon('sources', { size: 14 })}
                  <span>Connect GitHub</span>
                </a>
              </div>
            `
                : `
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
                ${verifiedSkills
                  .slice(0, 10)
                  .map(
                    (s) => `
                  <span class="badge badge-verified" style="display:inline-flex; align-items:center; gap:4px; padding:4px 9px; font-size:0.75rem;">
                    ${renderIcon('check', { size: 11 })}
                    <span>${escapeHtml(s.name || s.slug)}</span>
                  </span>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>

          <!-- Connected Sources Status -->
          <div style="border-top:1px solid var(--border-subtle); padding-top:14px; margin-top:14px; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
            <div style="display:flex; align-items:center; gap:8px; color:var(--text-muted);">
              ${renderIcon('sources', { size: 16 })}
              <span>${connectedSourcesCount > 0 ? `GitHub connected (${connectedSourcesCount} repos)` : 'GitHub not connected'}</span>
            </div>
            <a href="/sources" style="font-size:0.8rem; color:var(--accent-indigo); text-decoration:none; font-weight:500;">
              Manage &rarr;
            </a>
          </div>
        </div>

      </section>

      <!-- ================================================================= -->
      <!-- BLOCK 4: CAREER COPILOT (Integrated Command Panel)               -->
      <!-- ================================================================= -->
      <section id="copilot" class="card copilot-panel" style="padding:28px 32px; background:var(--bg-surface-elevated); border:1px solid var(--border-highlight); border-radius:var(--radius-lg); margin-bottom:32px;">
        
        <!-- Copilot Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(99,102,241,0.15); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center;">
              ${renderIcon('copilot', { size: 20 })}
            </div>
            <div>
              <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0; display:flex; align-items:center; gap:8px;">
                <span>Career Copilot</span>
                <span class="badge" style="background:rgba(99,102,241,0.15); color:#A5B4FC; font-size:0.7rem; padding:2px 8px; border-radius:var(--radius-full);">
                  Evidence-Grounded
                </span>
              </h2>
              <p style="font-size:0.85rem; color:var(--text-muted); margin:2px 0 0;">
                Context-aware guidance for your career search, profile completeness, and applications.
              </p>
            </div>
          </div>
          <span style="font-size:0.8rem; color:var(--text-dim);">
            AI never mutates your profile without explicit approval.
          </span>
        </div>

        <!-- AI Unavailable State Banner -->
        ${!aiAvailable ? renderAIUnavailableCard({ continueHref: '/profile' }) : ''}

        <!-- Active Safe Proposals (Human-in-the-Loop Confirmation Gate) -->
        ${
          activeProposals.length > 0
            ? `
          <div class="proposals-container" style="margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
              <span style="color:var(--accent-amber);">${renderIcon('alertCircle', { size: 16 })}</span>
              <strong style="font-size:0.9rem; color:var(--text-main);">Proposed Profile Updates (Requires Your Confirmation)</strong>
            </div>
            <div style="display:flex; flex-direction:column; gap:12px;">
              ${activeProposals
                .map(
                  (p) => `
                <div class="card proposal-card" style="background:rgba(17,24,39,0.7); border:1px solid rgba(245,158,11,0.3); border-left:4px solid var(--accent-amber); padding:16px 20px; border-radius:var(--radius-sm);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
                    <div>
                      <span style="font-size:0.75rem; color:var(--accent-amber); font-weight:700; text-transform:uppercase;">
                        ${escapeHtml(p.category || 'PROFILE')}
                      </span>
                      <h4 style="font-size:0.95rem; font-weight:600; color:var(--text-main); margin:2px 0;">
                        ${escapeHtml(p.fieldLabel || p.field)}
                      </h4>
                    </div>
                    <span class="badge" style="background:rgba(99,102,241,0.15); color:#A5B4FC; font-size:0.75rem;">
                      Source: ${escapeHtml(p.evidence?.label || 'User session')}
                    </span>
                  </div>
                  <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px; line-height:1.4;">
                    <div>Current value: <code style="color:var(--text-dim);">${escapeHtml(String(p.currentValue ?? 'Not set'))}</code></div>
                    <div style="margin-top:2px;">Proposed value: <strong style="color:var(--accent-emerald);">${escapeHtml(String(p.proposedValue))}</strong></div>
                    ${p.reason ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(p.reason)}</div>` : ''}
                  </div>
                  <div style="display:flex; gap:10px;">
                    <form method="POST" action="/assistant/proposals/confirm" style="display:inline;">
                      <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                      <input type="hidden" name="confirmedByUser" value="true">
                      <button type="submit" class="btn btn-primary btn-sm" style="font-weight:600;">
                        ${renderIcon('check', { size: 14 })}
                        <span>Confirm & Update Profile</span>
                      </button>
                    </form>
                    <form method="POST" action="/assistant/proposals/reject" style="display:inline;">
                      <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                      <button type="submit" class="btn btn-secondary btn-sm">
                        <span>Dismiss</span>
                      </button>
                    </form>
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

        <!-- Quick Action Prompt Chips -->
        <div style="margin-bottom:16px;">
          <div style="font-size:0.8rem; color:var(--text-dim); margin-bottom:8px; font-weight:500;">
            Suggested prompts:
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button type="button" class="copilot-chip btn btn-secondary btn-sm" data-prompt="What should I do next?" style="font-size:0.8rem; padding:6px 12px; border-radius:var(--radius-full);">
              What should I do next?
            </button>
            <button type="button" class="copilot-chip btn btn-secondary btn-sm" data-prompt="Complete and improve my profile" style="font-size:0.8rem; padding:6px 12px; border-radius:var(--radius-full);">
              Complete / improve my profile
            </button>
            <button type="button" class="copilot-chip btn btn-secondary btn-sm" data-prompt="Check my application readiness" style="font-size:0.8rem; padding:6px 12px; border-radius:var(--radius-full);">
              Check my application readiness
            </button>
            <button type="button" class="copilot-chip btn btn-secondary btn-sm" data-prompt="Find jobs matching my profile" style="font-size:0.8rem; padding:6px 12px; border-radius:var(--radius-full);">
              Find jobs matching my profile
            </button>
          </div>
        </div>

        <!-- Conversation History Thread -->
        <div id="copilot-messages" style="display:${messages.length > 0 ? 'flex' : 'none'}; flex-direction:column; gap:12px; max-height:360px; overflow-y:auto; padding:14px; background:rgba(0,0,0,0.25); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); margin-bottom:16px;">
          ${messages
            .map(
              (m) => `
            <div style="display:flex; gap:10px; align-items:flex-start; ${m.role === 'user' ? 'justify-content:flex-end;' : ''}">
              ${
                m.role !== 'user'
                  ? `
                <div style="width:28px; height:28px; border-radius:8px; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  ${renderIcon('copilot', { size: 14 })}
                </div>
              `
                  : ''
              }
              <div style="max-width:80%; padding:10px 14px; border-radius:var(--radius-sm); font-size:0.875rem; line-height:1.5; ${m.role === 'user' ? 'background:var(--accent-indigo); color:#FFFFFF;' : 'background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-main);'}">
                ${escapeHtml(m.content)}
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <!-- Copilot Query Input Form -->
        <form id="copilot-form" method="POST" action="/assistant/message" style="display:flex; gap:10px; align-items:center;">
          <input
            id="copilot-input"
            type="text"
            name="message"
            class="form-control"
            placeholder="Ask Career Copilot (e.g. 'What should I do next?' or 'Explain my missing fields')..."
            required
            autocomplete="off"
            style="flex:1; height:42px; font-size:0.9rem;"
          />
          <button id="copilot-submit-btn" type="submit" class="btn btn-primary" style="height:42px; padding:0 18px; display:inline-flex; align-items:center; gap:6px; font-weight:600;">
            ${renderIcon('copilot', { size: 16 })}
            <span>Send</span>
          </button>
        </form>

      </section>

    </div>

    <!-- Client-side script for instantaneous Copilot interactions -->
    <script>
      (function() {
        const chips = document.querySelectorAll('.copilot-chip');
        const input = document.getElementById('copilot-input');
        const form = document.getElementById('copilot-form');
        const messagesDiv = document.getElementById('copilot-messages');
        const submitBtn = document.getElementById('copilot-submit-btn');

        // Quick prompt chips click handler
        chips.forEach(chip => {
          chip.addEventListener('click', () => {
            const prompt = chip.getAttribute('data-prompt');
            if (prompt && input) {
              input.value = prompt;
              form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
          });
        });

        // Interactive AJAX submission with fallback to standard HTTP POST
        if (form && input && messagesDiv) {
          form.addEventListener('submit', async function(e) {
            const msg = input.value.trim();
            if (!msg) return;

            e.preventDefault();
            input.value = '';
            submitBtn.disabled = true;

            // Render user bubble
            messagesDiv.style.display = 'flex';
            const userBubble = document.createElement('div');
            userBubble.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:8px;';
            userBubble.innerHTML = '<div style="max-width:80%; padding:10px 14px; border-radius:var(--radius-sm); font-size:0.875rem; line-height:1.5; background:var(--accent-indigo); color:#FFFFFF;">' +
              escapeText(msg) + '</div>';
            messagesDiv.appendChild(userBubble);

            // Render thinking indicator
            const thinkingBubble = document.createElement('div');
            thinkingBubble.style.cssText = 'display:flex; gap:10px; align-items:flex-start; margin-bottom:8px;';
            thinkingBubble.innerHTML = '<div style="width:28px; height:28px; border-radius:8px; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
              '<div style="max-width:80%; padding:10px 14px; border-radius:var(--radius-sm); font-size:0.875rem; background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-muted); font-style:italic;">Analyzing career context...</div>';
            messagesDiv.appendChild(thinkingBubble);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
              const res = await fetch('/assistant/message', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ message: msg })
              });

              thinkingBubble.remove();

              if (!res.ok) {
                throw new Error('Assistant response error: ' + res.status);
              }

              const data = await res.json();
              const responseText = data?.response?.content || 'I processed your request.';

              const botBubble = document.createElement('div');
              botBubble.style.cssText = 'display:flex; gap:10px; align-items:flex-start; margin-bottom:8px;';
              botBubble.innerHTML = '<div style="width:28px; height:28px; border-radius:8px; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>' +
                '<div style="max-width:80%; padding:10px 14px; border-radius:var(--radius-sm); font-size:0.875rem; line-height:1.5; background:var(--bg-surface); border:1px solid var(--border-subtle); color:var(--text-main); white-space:pre-line;">' +
                escapeText(responseText) + '</div>';
              messagesDiv.appendChild(botBubble);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;

              // If a proposal was returned, reload after a brief moment to show proposal card or append proposal
              if (data?.response?.proposals && data.response.proposals.length > 0) {
                window.location.reload();
              }
            } catch (err) {
              thinkingBubble.remove();
              const errBubble = document.createElement('div');
              errBubble.style.cssText = 'display:flex; gap:10px; align-items:flex-start; margin-bottom:8px;';
              errBubble.innerHTML = '<div style="padding:10px 14px; border-radius:var(--radius-sm); font-size:0.875rem; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:var(--accent-amber);">' +
                'Career Copilot is temporarily busy. You can continue updating your profile manually.' + '</div>';
              messagesDiv.appendChild(errBubble);
            } finally {
              submitBtn.disabled = false;
            }
          });
        }

        function escapeText(str) {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        }
      })();
    </script>
  `;

  return renderLayout({
    title: 'Candidate Dashboard',
    content,
    activeNav: 'dashboard',
    user,
  });
}
