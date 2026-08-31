/**
 * @file Job Fit Radar Interactive Web Page View (/apps/radar).
 *
 * Provides:
 * - Form-based job description input for standalone web analysis
 * - Pre-hydrated radar result rendering with real analysis data
 * - Uses shared renderLayout for consistent design system
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the radar analysis input form page.
 *
 * @param {object} params
 * @param {object|null} params.user Authenticated user
 * @param {object|null} params.tenant Authenticated tenant
 * @param {string} [params.error] Optional error message
 * @returns {string} Full HTML page
 */
export function renderRadarFormPage({ user = null, tenant: _tenant = null, error = null }) {
  const content = `
    <div class="container" style="max-width: 800px;">
      <a href="/dashboard" class="back-nav-link">← Back to Dashboard</a>
      <div class="breadcrumb">
        <a href="/">Overview</a>
        <span class="separator">/</span>
        <span class="current">Job Fit Radar</span>
      </div>

      <div class="page-header">
        <div>
          <h1>📡 Job Fit Radar</h1>
          <p>Analyze your career profile against any job description. Get an ATS-compatible fit score, requirement matches, skill gap analysis, and project relevance ranking — all grounded in verified repository evidence.</p>
        </div>
      </div>

      ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}

      <div class="card">
        <div class="section-header">
          <h2>Job Description Analysis</h2>
        </div>

        <form method="POST" action="/apps/radar">
          <div class="form-group">
            <label for="jobDescriptionText" class="form-label">Job Description *</label>
            <textarea
              id="jobDescriptionText"
              name="jobDescriptionText"
              class="form-textarea"
              rows="10"
              placeholder="Paste the full job description here...&#10;&#10;Include responsibilities, required skills, preferred qualifications, and any other relevant details."
              required
              minlength="50"
            ></textarea>
            <div class="form-hint">Paste the complete job posting for best results. Minimum 50 characters.</div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group">
              <label for="jobTitle" class="form-label">Job Title</label>
              <input type="text" id="jobTitle" name="jobTitle" class="form-control" placeholder="e.g. Senior Software Engineer" />
            </div>
            <div class="form-group">
              <label for="companyName" class="form-label">Company Name</label>
              <input type="text" id="companyName" name="companyName" class="form-control" placeholder="e.g. Acme Corp" />
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group">
              <label for="targetRoleLevel" class="form-label">Level</label>
              <select id="targetRoleLevel" name="targetRoleLevel" class="form-select">
                <option value="">Auto-detect</option>
                <option value="INTERN">Intern</option>
                <option value="JUNIOR">Junior</option>
                <option value="MID">Mid-Level</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Lead</option>
                <option value="PRINCIPAL">Principal</option>
                <option value="DIRECTOR">Director</option>
              </select>
            </div>
            <div class="form-group">
              <label for="maxSkillGaps" class="form-label">Max Skill Gaps Shown</label>
              <select id="maxSkillGaps" name="maxSkillGaps" class="form-select">
                <option value="3">3</option>
                <option value="5" selected>5</option>
                <option value="8">8</option>
              </select>
            </div>
          </div>

          <div style="display: flex; gap: 12px; margin-top: 8px;">
            <button type="submit" class="btn btn-primary">
              <span>📡</span> Analyze Job Fit
            </button>
            <a href="/dashboard" class="btn btn-secondary">Cancel</a>
          </div>
        </form>
      </div>

      <div class="card" style="margin-top: 24px;">
        <div class="section-header">
          <h2>How It Works</h2>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 1.5rem;">📋</div>
            <div style="font-weight: 600; color: var(--text-main);">1. Paste Job Description</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Enter any job posting — we parse requirements deterministically.</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 1.5rem;">🔗</div>
            <div style="font-weight: 600; color: var(--text-main);">2. Evidence Matching</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Your verified GitHub evidence is matched against job requirements.</div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 1.5rem;">📡</div>
            <div style="font-weight: 600; color: var(--text-main);">3. Radar Analysis</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">6-axis visualization: skills, projects, experience, education, confidence.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Job Fit Radar',
    content,
    activeNav: 'radar',
    user,
  });
}

/**
 * Renders the radar result page with pre-hydrated analysis data.
 *
 * @param {object} params
 * @param {object|null} params.user Authenticated user
 * @param {object|null} params.tenant Authenticated tenant
 * @param {object|null} params.analysisData The analyze_job_fit output
 * @param {string} [params.error] Optional error message
 * @returns {string} Full HTML page
 */
export function renderRadarResultPage({
  user = null,
  tenant: _tenant = null,
  analysisData = null,
  error = null,
}) {
  const content = `
    <div class="container" style="max-width: 900px;">
      <a href="/apps/radar" class="back-nav-link">← New Analysis</a>
      <div class="breadcrumb">
        <a href="/">Overview</a>
        <span class="separator">/</span>
        <a href="/apps/radar">Job Fit Radar</a>
        <span class="separator">/</span>
        <span class="current">Result</span>
      </div>

      ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ''}

      ${
        analysisData
          ? `
      <div class="page-header">
        <div>
          <h1>📡 Job Fit Analysis Result</h1>
          <p>${escapeHtml(analysisData.overallFit?.fitSummary || 'Evidence-grounded fit analysis')}</p>
        </div>
        <a href="/apps/radar" class="btn btn-secondary btn-sm">Analyze Another Job</a>
      </div>
      `
          : ''
      }

      <div id="radar-widget-container" style="
        background: #090d16;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 24px;
        min-height: 400px;
      ">
        ${
          analysisData
            ? renderEmbeddedRadarWidget(analysisData)
            : `
          <div class="loading-overlay">
            <div class="loading-spinner"></div>
            <div>No analysis data available.</div>
            <a href="/apps/radar" class="btn btn-primary btn-sm" style="margin-top: 12px;">Start New Analysis</a>
          </div>
        `
        }
      </div>
    </div>
  `;

  return renderLayout({
    title: analysisData
      ? `Fit: ${analysisData.overallFit?.matchGrade || 'Analysis'}`
      : 'Job Fit Radar — Result',
    content,
    activeNav: 'radar',
    user,
  });
}

/**
 * Renders the radar widget HTML inline (within the design system layout).
 * Uses the same rendering logic as the MCP App but integrated into the page.
 *
 * @param {object} data The analyze_job_fit output
 * @returns {string} HTML for the radar widget
 */
function renderEmbeddedRadarWidget(data) {
  if (!data) return '';

  const jobContext = data.jobContext || {};
  const overallFit = data.overallFit || {};
  const score = typeof overallFit.atsScore === 'number' ? Math.round(overallFit.atsScore) : 0;
  const band = overallFit.matchGrade || 'MODERATE_FIT';
  const bandClass = score >= 75 ? 'badge-verified' : score >= 50 ? 'badge-indigo' : 'badge-amber';
  const bandLabel = band.replace(/_/g, ' ');
  const breakdown = overallFit.scoreBreakdown || {};

  // Calculate radar points (6 axes)
  const values = [
    Math.min(100, Math.max(0, breakdown.requiredSkillsScore || 0)),
    Math.min(100, Math.max(0, breakdown.preferredSkillsScore || 0)),
    Math.min(100, Math.max(0, breakdown.projectRelevanceScore || 0)),
    Math.min(100, Math.max(0, breakdown.experienceFitScore || 0)),
    Math.min(100, Math.max(0, breakdown.educationFitScore || 0)),
    Math.min(100, Math.max(0, breakdown.evidenceConfidenceScore || 0)),
  ];

  const radius = 100;
  const points = values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const r = (v / 100) * radius;
    return {
      x: Number((r * Math.cos(angle)).toFixed(2)),
      y: Number((r * Math.sin(angle)).toFixed(2)),
      val: v,
    };
  });
  const polyString = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Requirement matches
  const reqSummary = data.requirementSummary || {};
  const matched = reqSummary.matchedCount || 0;
  const total = matched + (reqSummary.missingCount || 0) + (reqSummary.partialCount || 0) || 1;
  const keyMatched = reqSummary.keyMatchedSkills || [];
  const keyMissing = reqSummary.keyMissingSkills || [];

  // Projects
  const projects = data.topRelevantProjects || [];

  // Skill gaps
  const gaps = data.prioritizedSkillGaps || [];

  // Evidence backing
  const evidence = data.evidenceBacking || {};

  return `
    <div style="display: flex; flex-direction: column; gap: 20px; font-family: var(--font-sans);">
      <!-- Header Card -->
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 16px; background: rgba(17, 24, 39, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);">
        <div>
          <div style="font-size: 1.15rem; font-weight: 700; color: #f1f5f9;">${escapeHtml(jobContext.extractedTitle || 'Target Role')}</div>
          <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">
            ${escapeHtml(jobContext.extractedLevel ? jobContext.extractedLevel + ' Level' : '')}
            ${jobContext.extractedLevel && overallFit.fitSummary ? ' · ' : ''}
            ${escapeHtml(overallFit.fitSummary || '')}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="position: relative; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;">
            <svg width="64" height="64" viewBox="0 0 64 64" style="transform: rotate(-90deg);">
              <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.1)" stroke-width="5" fill="none"/>
              <circle cx="32" cy="32" r="26"
                stroke="${score >= 75 ? '#10b981' : score >= 50 ? '#3b82f6' : '#f59e0b'}"
                stroke-width="5" fill="none"
                stroke-dasharray="${2 * Math.PI * 26}"
                stroke-dashoffset="${2 * Math.PI * 26 - (score / 100) * 2 * Math.PI * 26}"
                stroke-linecap="round"/>
            </svg>
            <span style="position: absolute; font-size: 16px; font-weight: 800; font-family: var(--font-mono); color: #f1f5f9;">${score}</span>
          </div>
          <span class="badge ${bandClass}">${escapeHtml(bandLabel)}</span>
        </div>
      </div>

      <!-- Radar + Requirements Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- 6-Axis Radar Chart -->
        <div style="background: rgba(17, 24, 39, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">6-Axis Evidence Radar</span>
            <span style="font-size: 0.7rem; color: #64748b;">0–100 Scale</span>
          </div>
          <div style="display: flex; justify-content: center;">
            <svg viewBox="-140 -140 280 280" style="width: 100%; max-width: 300px; overflow: visible;">
              <!-- Grid rings -->
              <polygon fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" points="0,-25 21.65,-12.5 21.65,12.5 0,25 -21.65,12.5 -21.65,-12.5"/>
              <polygon fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" points="0,-50 43.3,-25 43.3,25 0,50 -43.3,25 -43.3,-25"/>
              <polygon fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" points="0,-75 64.95,-37.5 64.95,37.5 0,75 -64.95,37.5 -64.95,-37.5"/>
              <polygon fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" points="0,-100 86.6,-50 86.6,50 0,100 -86.6,50 -86.6,-50"/>
              <!-- Axes -->
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="0" y2="-100"/>
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="86.6" y2="-50"/>
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="86.6" y2="50"/>
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="0" y2="100"/>
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="-86.6" y2="50"/>
              <line stroke="rgba(255,255,255,0.12)" stroke-width="1" stroke-dasharray="2 2" x1="0" y1="0" x2="-86.6" y2="-50"/>
              <!-- Labels -->
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="0" y="-115">Req Skills</text>
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="105" y="-55">Pref Skills</text>
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="105" y="55">Relevance</text>
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="0" y="115">Experience</text>
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="-105" y="55">Education</text>
              <text font-size="10" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" x="-105" y="-55">Confidence</text>
              <!-- Data polygon -->
              <polygon fill="rgba(99, 102, 241, 0.35)" stroke="#6366F1" stroke-width="2" points="${polyString}"/>
              <!-- Data points -->
              ${points.map((p) => `<circle fill="#6366F1" stroke="#fff" stroke-width="1.5" cx="${p.x}" cy="${p.y}" r="3"/>`).join('\n              ')}
            </svg>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; font-size: 0.75rem; color: #64748b;">
            <div>Req: <span style="color: #f1f5f9; font-weight: 600;">${values[0]}</span></div>
            <div>Pref: <span style="color: #f1f5f9; font-weight: 600;">${values[1]}</span></div>
            <div>Relevance: <span style="color: #f1f5f9; font-weight: 600;">${values[2]}</span></div>
            <div>Experience: <span style="color: #f1f5f9; font-weight: 600;">${values[3]}</span></div>
            <div>Education: <span style="color: #f1f5f9; font-weight: 600;">${values[4]}</span></div>
            <div>Confidence: <span style="color: #f1f5f9; font-weight: 600;">${values[5]}</span></div>
          </div>
        </div>

        <!-- Requirement Matches -->
        <div style="background: rgba(17, 24, 39, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Requirement Matches</span>
            <span style="font-size: 0.8rem; font-weight: 700; color: #f1f5f9;">${matched} / ${total} Matched</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div>
              <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 6px;">Verified Matched Skills:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${
                  keyMatched.length > 0
                    ? keyMatched
                        .map(
                          (s) =>
                            `<span style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.12); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25);">✓ ${escapeHtml(s)}</span>`
                        )
                        .join('')
                    : '<span style="font-size: 0.75rem; color: #64748b;">None cited</span>'
                }
              </div>
            </div>
            <div>
              <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 6px;">Missing Requirements / Skill Gaps:</div>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${
                  keyMissing.length > 0
                    ? keyMissing
                        .map(
                          (s) =>
                            `<span style="font-size: 0.75rem; padding: 3px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.12); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.25);">✕ ${escapeHtml(s)}</span>`
                        )
                        .join('')
                    : '<span style="font-size: 0.75rem; color: #64748b;">Zero gaps detected</span>'
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Projects + Skill Gaps Grid -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <!-- Top Relevant Projects -->
        <div style="background: rgba(17, 24, 39, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Top Relevant Projects</span>
            <span style="font-size: 0.7rem; color: #64748b;">AST Evidence Grounded</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              projects.length > 0
                ? projects
                    .map((p) => {
                      const relPct = Math.round((p.relevanceScore || 0) * 100);
                      return `
                    <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: #f1f5f9; font-size: 0.8rem;">#${escapeHtml(String(p.relevanceRank))} ${escapeHtml(p.projectName)}</span>
                        <span style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--accent-indigo);">${relPct}% Match</span>
                      </div>
                      <div style="height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                        <div style="height: 100%; background: var(--accent-indigo); border-radius: 2px; width: ${relPct}%;"></div>
                      </div>
                    </div>
                  `;
                    })
                    .join('')
                : '<div style="font-size: 0.8rem; color: #64748b;">No projects ranked yet.</div>'
            }
          </div>
        </div>

        <!-- Skill Gaps -->
        <div style="background: rgba(17, 24, 39, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">Prioritized Remediation Gaps</span>
            <span style="font-size: 0.7rem; color: #64748b;">Actionable Advice</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${
              gaps.length > 0
                ? gaps
                    .map((g) => {
                      const prio = (g.priority || 'IMPORTANT').toLowerCase();
                      const prioClass =
                        prio === 'critical'
                          ? 'badge-missing'
                          : prio === 'important'
                            ? 'badge-amber'
                            : 'badge-unknown';
                      return `
                    <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px; background: rgba(245, 158, 11, 0.06); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: var(--radius-md);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; color: #fde68a; font-size: 0.8rem;">${escapeHtml(g.skillName || g.skillSlug)}</span>
                        <span class="badge ${prioClass}" style="font-size: 0.65rem;">${escapeHtml(g.priority)}</span>
                      </div>
                      <div style="font-size: 0.75rem; color: #94a3b8;">${escapeHtml(g.remediationAdvice || 'Build a repository project demonstrating this technology.')}</div>
                    </div>
                  `;
                    })
                    .join('')
                : '<div style="font-size: 0.8rem; color: #64748b;">No skill gaps identified.</div>'
            }
          </div>
        </div>
      </div>

      <!-- Evidence Footer -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: #64748b;">
        <span>Antigravity Career Hub · Job Fit Radar</span>
        <span>${evidence.verifiedSkillsCount || 0} Verified Skills · ${evidence.totalEvidenceItemsCited || 0} Evidence Citations</span>
      </div>
    </div>
  `;
}
