/**
 * @file Authenticated Candidate Dashboard Workspace View Template (P13.5-002).
 *
 * Renders candidate profile summary, verified skills cloud with truth provenance badges,
 * connected repository sources, showcase projects with evidence expanders, and AI connection status.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the authenticated dashboard HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object|null} [params.candidate=null] Candidate profile if exists
 * @param {Array} [params.skills=[]] Verified candidate skills list
 * @param {Array} [params.projects=[]] Candidate projects list
 * @param {Array} [params.applications=[]] Job applications list
 * @param {number} [params.connectedSourcesCount=0] Count of connected repository resources
 * @param {object|null} [params.gitHubConnection=null] Active GitHub connection if exists
 * @param {number} [params.aiTokensCount=0] Count of active personal/OAuth AI tokens
 * @returns {string} Full HTML document
 */
export function renderDashboardPage({
  user,
  tenant,
  candidate = null,
  skills = [],
  projects = [],
  applications = [],
  connectedSourcesCount = 0,
  gitHubConnection = null,
  resumes = [],
  aiTokensCount = 0,
}) {
  const candidateHeadline = candidate?.headline || 'Candidate Profile (Awaiting Career Headline)';
  const candidateSummary =
    candidate?.summary ||
    'Connect your GitHub repository and upload your source resume to construct an evidence-grounded career profile.';
  const candidateEmail = user?.email || candidate?.canonicalEmail || '';

  const verifiedCount = skills.filter((s) => s.provenanceStatus === 'VERIFIED').length;
  const inferredCount = skills.filter((s) => s.provenanceStatus === 'INFERRED').length;
  const claimedCount = skills.filter(
    (s) => s.provenanceStatus === 'CLAIMED' || s.isUserClaim === true
  ).length;

  const hasHeadline = Boolean(candidate?.headline && candidate.headline.trim().length > 0);
  const hasSources = connectedSourcesCount > 0 || Boolean(gitHubConnection);
  const hasResumes = resumes.length > 0;
  const hasSkills = skills.length > 0;
  const hasPreferences = Boolean(
    candidate?.profileMetadata?.careerPreferences?.targetRoles?.length > 0
  );
  const hasAi = aiTokensCount > 0;

  // Calculate completeness percentage (6 steps, 16.6% each -> 100%)
  let stepsCompleted = 1; // Registered account
  if (hasHeadline) stepsCompleted += 1;
  if (hasSources) stepsCompleted += 1;
  if (hasResumes) stepsCompleted += 1;
  if (hasSkills) stepsCompleted += 1;
  if (hasPreferences) stepsCompleted += 1;
  if (hasAi) stepsCompleted += 1;

  const completeness = Math.min(100, Math.round((stepsCompleted / 7) * 100));
  const isSetupMode = completeness < 75 || !hasSources || !hasResumes;

  // Determine dynamic next recommended action
  let nextActionTitle = 'All Systems Operational';
  let nextActionDesc =
    'Your evidence-grounded career profile is active and ready for AI job matching via MCP.';
  let nextActionBtnText = 'Launch Job Fit Radar →';
  let nextActionBtnHref = '/apps/radar';

  if (!hasSources) {
    nextActionTitle = 'Next Step: Connect GitHub Repositories';
    nextActionDesc =
      'Authorize your GitHub account to allow Career Hub to extract AST code evidence, dependencies, and verified skills.';
    nextActionBtnText = 'Connect GitHub →';
    nextActionBtnHref = '/sources';
  } else if (!hasResumes) {
    nextActionTitle = 'Next Step: Upload Source Resume';
    nextActionDesc =
      'Upload your existing PDF, DOCX, or TXT resume to map baseline work history and self-reported claims.';
    nextActionBtnText = 'Upload Resume →';
    nextActionBtnHref = '/resumes';
  } else if (!hasPreferences) {
    nextActionTitle = 'Next Step: Set Career Preferences';
    nextActionDesc =
      'Define your target job roles, preferred locations, and salary floor for intelligent ATS matching.';
    nextActionBtnText = 'Set Preferences →';
    nextActionBtnHref = '/profile';
  } else if (!hasAi) {
    nextActionTitle = 'Next Step: Connect AI Clients';
    nextActionDesc =
      'Mint an MCP API Token to connect Claude Desktop, ChatGPT Custom GPT, or Gemini CLI.';
    nextActionBtnText = 'Connect AI →';
    nextActionBtnHref = '/connect';
  }

  const content = `
    <div class="container">
      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Career Intelligence Knowledge Architecture</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Live Evidence Resolution</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step ${hasSources ? 'active' : ''}"><span>📦</span> 1. Connect Sources</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step ${hasSkills ? 'active' : ''}"><span>🔍</span> 2. AST & Claims Extraction</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step ${verifiedCount > 0 ? 'active' : ''}"><span>⚖️</span> 3. Truth Model (VERIFIED / CLAIMED)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step ${hasPreferences ? 'active' : ''}"><span>★</span> 4. Base Narrative Graph</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step ${hasAi ? 'active' : ''}"><span>🤖</span> 5. Sovereign AI MCP Access</div>
        </div>
      </div>

      <!-- Profile Header Card -->
      <div class="card" style="padding:28px 32px; margin-bottom:28px; background:var(--bg-surface);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:20px;">
          <div style="display:flex; gap:20px; align-items:center;">
            <div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan)); color:#FFF; display:flex; align-items:center; justify-content:center; font-size:1.6rem; font-weight:800; box-shadow:0 8px 24px rgba(99,102,241,0.35);">
              ${escapeHtml((user.displayName || candidate?.displayName || 'Candidate').slice(0, 2).toUpperCase())}
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px; flex-wrap:wrap;">
                <h1 style="font-size:1.6rem; font-weight:800; letter-spacing:-0.02em; margin:0;">
                  ${escapeHtml(user.displayName || candidate?.displayName || 'Candidate Profile')}
                </h1>
                <span class="badge ${isSetupMode ? 'badge-amber' : 'badge-verified'}">
                  ${isSetupMode ? '🟡 SETUP MODE' : '🟢 CAREER INTELLIGENCE MODE'}
                </span>
                <span class="badge badge-indigo">${escapeHtml(tenant.tier)} WORKSPACE</span>
              </div>
              <p style="font-size:0.95rem; color:var(--text-main); font-weight:600; margin-bottom:4px;">
                ${escapeHtml(candidateHeadline)} &bull; <span style="font-size:0.85rem; color:var(--text-dim); font-weight:400;">${escapeHtml(candidateEmail)}</span>
              </p>
              <p style="font-size:0.85rem; color:var(--text-muted); max-width:640px; margin:0;">
                ${escapeHtml(candidateSummary)}
              </p>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:10px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <a href="/profile" class="btn btn-secondary btn-sm">Profile & Preferences</a>
              <a href="/sources" class="btn btn-secondary btn-sm">Manage Sources</a>
              <a href="/connect" class="btn btn-primary btn-sm">AI Connectors (${aiTokensCount})</a>
            </div>
            <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-dim);">
              <span>Readiness Score:</span>
              <div style="width:100px; height:8px; background:rgba(255,255,255,0.1); border-radius:var(--radius-full); overflow:hidden;">
                <div style="width:${completeness}%; height:100%; background:linear-gradient(90deg, var(--accent-indigo), var(--accent-emerald));"></div>
              </div>
              <strong style="color:var(--accent-emerald);">${completeness}%</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Next Recommended Action Banner -->
      <div class="card" style="padding:20px 24px; margin-bottom:28px; border-left:4px solid var(--accent-indigo); background:rgba(99,102,241,0.06); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div style="max-width:720px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span style="font-size:1.1rem;">⚡</span>
            <strong style="color:var(--text-main); font-size:0.95rem;">${escapeHtml(nextActionTitle)}</strong>
          </div>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0; line-height:1.5;">
            ${escapeHtml(nextActionDesc)}
          </p>
        </div>
        <a href="${nextActionBtnHref}" class="btn btn-primary btn-sm">
          ${escapeHtml(nextActionBtnText)}
        </a>
      </div>

      <!-- Guided 6-Step Readiness Checklist (Prominent in Setup Mode) -->
      <div class="card" style="padding:20px 24px; margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div>
            <h3 style="font-size:1rem; font-weight:700; margin:0;">Career Readiness & Setup Checklist</h3>
            <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">Complete these steps to establish your evidence-backed career graph.</p>
          </div>
          <span class="badge ${completeness >= 80 ? 'badge-verified' : 'badge-indigo'}" style="font-size:0.75rem;">
            ${stepsCompleted} of 7 Milestones Completed
          </span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
          <a href="/profile" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasHeadline ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasHeadline ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasHeadline ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasHeadline ? '✓ COMPLETED' : '1. IDENTITY'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Candidate Profile</div>
          </a>
          <a href="/sources" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasSources ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasSources ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasSources ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasSources ? '✓ COMPLETED' : '2. GITHUB APP'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Connect Repositories</div>
          </a>
          <a href="/resumes" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasResumes ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasResumes ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasResumes ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasResumes ? '✓ COMPLETED' : '3. RESUME'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Upload Source Resume</div>
          </a>
          <a href="/skills" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasSkills ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasSkills ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasSkills ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasSkills ? '✓ COMPLETED' : '4. SKILLS & AST'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Review Claims & AST</div>
          </a>
          <a href="/profile" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasPreferences ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasPreferences ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasPreferences ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasPreferences ? '✓ COMPLETED' : '5. PREFERENCES'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Set Target Roles</div>
          </a>
          <a href="/connect" style="text-decoration:none; padding:12px; border-radius:var(--radius-sm); border:1px solid ${hasAi ? 'rgba(16,185,129,0.3)' : 'var(--border-subtle)'}; background:${hasAi ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)'}; display:block;">
            <div style="font-size:0.75rem; color:${hasAi ? 'var(--accent-emerald)' : 'var(--text-dim)'}; font-weight:700; margin-bottom:2px;">${hasAi ? '✓ COMPLETED' : '6. AI MCP'}</div>
            <div style="font-size:0.85rem; font-weight:600; color:var(--text-main);">Connect AI Client</div>
          </a>
        </div>
      </div>

      <!-- Quick Metrics Strip -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px; margin-bottom:28px;">
        <div class="stat-card">
          <span class="stat-label">Verified Skills</span>
          <div class="stat-val" style="color:var(--accent-emerald);">${verifiedCount}</div>
          <span style="font-size:0.75rem; color:var(--text-muted);">AST syntax tree proven</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Claimed / Inferred</span>
          <div class="stat-val" style="color:var(--accent-amber);">${claimedCount + inferredCount}</div>
          <span style="font-size:0.75rem; color:var(--text-muted);">${claimedCount} Claimed / ${inferredCount} Inferred</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Indexed Projects</span>
          <div class="stat-val" style="color:var(--accent-indigo);">${projects.length}</div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Portfolio codebases</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Connected Sources</span>
          <div class="stat-val" style="color:var(--accent-cyan);">${connectedSourcesCount}</div>
          <span style="font-size:0.75rem; color:var(--text-muted);">${connectedSourcesCount} GitHub repos</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Active Applications</span>
          <div class="stat-val" style="color:var(--accent-cyan);">${applications.length}</div>
          <span style="font-size:0.75rem; color:var(--text-muted);">Tracked job pipelines</span>
        </div>

      </div>

      <!-- Main 2-Column Content Grid -->
      <div style="display:grid; grid-template-columns: 2fr 1fr; gap:24px; margin-bottom:32px;" class="grid-2col">
        <!-- Left Column: Skills & Projects -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Verified Skills Section -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
              <div>
                <h2 style="font-size:1.15rem; font-weight:700;">Verified Skill Graph</h2>
                <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
                  Evidence-grounded skills extracted from your connected repository codebases.
                </p>
              </div>
              <a href="/skills" class="btn btn-secondary btn-sm">Explore Taxonomy →</a>
            </div>

            ${
              skills.length === 0
                ? `
              <div style="text-align:center; padding:36px 20px; background:rgba(0,0,0,0.2); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                <div style="font-size:2rem; margin-bottom:8px;">🧬</div>
                <h4 style="font-size:1rem; font-weight:700; margin-bottom:4px;">No Verified Skills Indexed Yet</h4>
                <p style="font-size:0.85rem; color:var(--text-muted); max-width:420px; margin:0 auto 16px;">
                  Connect your GitHub repositories to run AST syntax analysis and extract verified technical evidence.
                </p>
                <a href="/onboarding?step=2" class="btn btn-primary btn-sm">Connect GitHub Repositories →</a>
              </div>
            `
                : `
              <div style="display:flex; flex-wrap:wrap; gap:8px;">
                ${skills
                  .map((s) => {
                    let badgeClass = 'badge-verified';
                    let label = 'VERIFIED';
                    if (s.provenanceStatus === 'CLAIMED' || s.isUserClaim) {
                      badgeClass = 'badge-claimed';
                      label = 'CLAIMED [Unverified User Claim]';
                    } else if (s.provenanceStatus === 'INFERRED') {
                      badgeClass = 'badge-inferred';
                      label = 'INFERRED';
                    }
                    return `
                    <span class="badge ${badgeClass}" title="Status: ${label} | Evidence Count: ${s.evidenceCount || 1}" style="padding:4px 10px; font-size:0.75rem;">
                      ${escapeHtml(s.name || s.slug)}
                      ${s.evidenceCount ? `<small style="opacity:0.75; margin-left:4px;">(${s.evidenceCount})</small>` : ''}
                    </span>
                  `;
                  })
                  .join('')}
              </div>
            `
            }
          </div>

          <!-- Ingested Projects Section -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
              <div>
                <h2 style="font-size:1.15rem; font-weight:700;">Portfolio Projects & Evidence</h2>
                <p style="font-size:0.8rem; color:var(--text-dim); margin-top:2px;">
                  Architectural projects generated from connected repository metadata and code AST.
                </p>
              </div>
              <a href="/projects" class="btn btn-secondary btn-sm">View All (${projects.length}) →</a>
            </div>

            ${
              projects.length === 0
                ? `
              <div style="text-align:center; padding:36px 20px; background:rgba(0,0,0,0.2); border:1px dashed var(--border-subtle); border-radius:var(--radius-md);">
                <div style="font-size:2rem; margin-bottom:8px;">📁</div>
                <h4 style="font-size:1rem; font-weight:700; margin-bottom:4px;">No Ingested Projects</h4>
                <p style="font-size:0.85rem; color:var(--text-muted); max-width:420px; margin:0 auto 16px;">
                  Run repository ingestion in the onboarding wizard to automatically construct verified project artifacts.
                </p>
                <a href="/onboarding?step=3" class="btn btn-primary btn-sm">Run Repository Ingestion →</a>
              </div>
            `
                : `
              <div style="display:flex; flex-direction:column; gap:12px;">
                ${projects
                  .slice(0, 5)
                  .map(
                    (p) => `
                  <div style="padding:16px 20px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); transition:border-color 0.15s ease;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                      <div>
                        <a href="/projects/${escapeHtml(p.id)}" style="font-size:1rem; font-weight:700; color:var(--text-main);">
                          ${escapeHtml(p.name)}
                        </a>
                        ${p.role ? `<span style="font-size:0.8rem; color:var(--text-dim); margin-left:8px;">&bull; ${escapeHtml(p.role)}</span>` : ''}
                      </div>
                      <span class="badge badge-cyan">AST INDEXED</span>
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">
                      ${escapeHtml(p.headline || p.summary || 'Connected repository project')}
                    </p>
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text-dim);">
                      <span>Linked Repository: <code>${escapeHtml(p.slug || p.name)}</code></span>
                      <a href="/projects/${escapeHtml(p.id)}" style="color:var(--accent-indigo); font-weight:600;">Inspect Evidence →</a>
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
            }
          </div>
        </div>

        <!-- Right Column: Connected Sources & AI Connectors -->
        <div style="display:flex; flex-direction:column; gap:24px;">
          <!-- Connected Sources Widget -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <h3 style="font-size:1rem; font-weight:700;">Connected Sources</h3>
              <span class="badge ${gitHubConnection ? 'badge-verified' : 'badge-amber'}">
                ${gitHubConnection ? 'GITHUB ACTIVE' : 'NO SOURCES'}
              </span>
            </div>

            <div style="padding:12px; background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                <strong style="font-size:0.9rem;">GitHub App</strong>
              </div>
              <p style="font-size:0.8rem; color:var(--text-muted);">
                ${
                  gitHubConnection
                    ? `Account: <strong>${escapeHtml(gitHubConnection.externalAccountName || gitHubConnection.displayName)}</strong> (${connectedSourcesCount} repos indexed)`
                    : 'Not connected. Connect GitHub to enable automated portfolio indexing.'
                }
              </p>
            </div>

            <div style="display:flex; gap:8px;">
              <a href="/sources" class="btn btn-secondary btn-sm" style="flex:1;">Source Details</a>
              <a href="/onboarding?step=3" class="btn btn-primary btn-sm" style="flex:1;">Sync Repos</a>
            </div>
          </div>

          <!-- AI Assistant Hub Widget -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
              <h3 style="font-size:1rem; font-weight:700;">AI Connection Status</h3>
              <span class="badge badge-indigo">MCP READY</span>
            </div>

            <ul style="list-style:none; display:flex; flex-direction:column; gap:10px; font-size:0.85rem; margin-bottom:16px;">
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>Anthropic Claude</span>
                <span class="badge badge-verified">OAuth 2.1</span>
              </li>
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>OpenAI ChatGPT</span>
                <span class="badge badge-verified">Custom GPT</span>
              </li>
              <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>Google Gemini</span>
                <span class="badge badge-cyan">API Token</span>
              </li>
            </ul>

            <a href="/connect" class="btn btn-secondary btn-sm" style="width:100%;">
              Configure Personal AI Tokens →
            </a>
          </div>

          <!-- Application Pipeline Widget -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <h3 style="font-size:1rem; font-weight:700;">Tracked Applications</h3>
              <a href="/applications" style="font-size:0.75rem; color:var(--accent-indigo);">View All →</a>
            </div>
            ${
              applications.length === 0
                ? `
              <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:12px;">No active applications tracked in this workspace.</p>
              <div style="font-size:0.8rem; color:var(--text-muted); background:rgba(255,255,255,0.02); padding:10px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-bottom:12px;">
                Track job applications via AI using MCP tool <code>track_job_application</code>.
              </div>
              <a href="/applications" class="btn btn-secondary btn-sm" style="width:100%;">
                Open Applications Tracker →
              </a>
            `
                : `
              <ul style="list-style:none; display:flex; flex-direction:column; gap:8px; font-size:0.85rem; margin-bottom:12px;">
                ${applications
                  .slice(0, 4)
                  .map(
                    (a) => `
                  <li style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04);">
                    <div>
                      <strong>${escapeHtml(a.companyName)}</strong>
                      <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(a.jobTitle)}</div>
                    </div>
                    <span class="badge badge-indigo">${escapeHtml(a.status)}</span>
                  </li>
                `
                  )
                  .join('')}
              </ul>
              <a href="/applications" class="btn btn-secondary btn-sm" style="width:100%;">
                Manage Application Pipeline →
              </a>
            `
            }
          </div>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Candidate Workspace',
    content,
    activeNav: 'dashboard',
    user,
  });
}
