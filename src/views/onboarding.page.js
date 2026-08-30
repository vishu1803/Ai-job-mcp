/**
 * @file Candidate Onboarding Wizard View Template (P13.5-002).
 *
 * Implements a 5-step guided candidate onboarding experience:
 * 1. Profile & Career Specialization
 * 2. Connect GitHub App
 * 3. Discover & Select Repositories
 * 4. Execute Repository Ingestion (Sync)
 * 5. Completion & Launch Workspace
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Renders the 5-step candidate onboarding wizard.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object} [params.candidate] Candidate profile row
 * @param {object} [params.connection] Active GitHub App connection row
 * @param {Array<object>} [params.availableRepos=[]] Available repositories from connection
 * @param {Array<object>} [params.selectedRepos=[]] Currently selected repository resources
 * @param {number} [params.currentStep=1] Active step (1-5)
 * @param {object} [params.syncResult] Result from ingestion pipeline
 * @param {string} [params.error] Error message if present
 * @param {string} [params.success] Success message if present
 * @returns {string} Full HTML document
 */
export function renderOnboardingPage({
  user,
  tenant,
  candidate = null,
  connection = null,
  availableRepos = [],
  selectedRepos = [],
  currentStep = 1,
  syncResult = null,
  ingestionRun = null,
  error = '',
  success = '',
}) {
  const step = Number(currentStep) || 1;
  const isGitHubConnected = connection && connection.status === 'ACTIVE';
  const selectedRepoIds = new Set();
  for (const r of selectedRepos) {
    if (r.id) selectedRepoIds.add(String(r.id));
    if (r.externalResourceId) selectedRepoIds.add(String(r.externalResourceId));
    if (r.name) selectedRepoIds.add(r.name);
    if (r.displayName) selectedRepoIds.add(r.displayName);
    if (r.fullName) selectedRepoIds.add(r.fullName);
    if (r.metadata?.fullName) selectedRepoIds.add(r.metadata.fullName);
  }

  const content = `
    <div class="container" style="max-width:860px; margin: 0 auto 60px;">
      <!-- Header Banner -->
      <div style="margin-bottom:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div>
            <span class="badge badge-indigo" style="margin-bottom:6px;">ONBOARDING WORKSPACE</span>
            <h1 style="font-size:1.85rem; font-weight:800; letter-spacing:-0.02em;">Candidate Setup Wizard</h1>
          </div>
          <span style="font-size:0.85rem; color:var(--text-dim);">Workspace: <strong>${escapeHtml(tenant.name || tenant.slug)}</strong></span>
        </div>
        <p style="color:var(--text-muted); font-size:0.95rem; margin-top:6px;">
          Configure your candidate profile, connect your GitHub repositories, and index verified code evidence.
        </p>
      </div>

      <!-- Stepper Navigation -->
      <div class="stepper" style="margin-bottom:36px;">
        <div class="step-item">
          <div class="step-badge ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}">${step > 1 ? '✓' : '1'}</div>
          <span class="step-title ${step === 1 ? 'active' : ''}">1. Profile</span>
        </div>
        <div style="flex:1; height:2px; background:var(--border-subtle); margin: 0 4px; margin-bottom: 22px;"></div>

        <div class="step-item">
          <div class="step-badge ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}">${step > 2 ? '✓' : '2'}</div>
          <span class="step-title ${step === 2 ? 'active' : ''}">2. GitHub App</span>
        </div>
        <div style="flex:1; height:2px; background:var(--border-subtle); margin: 0 4px; margin-bottom: 22px;"></div>

        <div class="step-item">
          <div class="step-badge ${step === 3 ? 'active' : step > 3 ? 'completed' : ''}">${step > 3 ? '✓' : '3'}</div>
          <span class="step-title ${step === 3 ? 'active' : ''}">3. Select Repos</span>
        </div>
        <div style="flex:1; height:2px; background:var(--border-subtle); margin: 0 4px; margin-bottom: 22px;"></div>

        <div class="step-item">
          <div class="step-badge ${step === 4 ? 'active' : step > 4 ? 'completed' : ''}">${step > 4 ? '✓' : '4'}</div>
          <span class="step-title ${step === 4 ? 'active' : ''}">4. AST Ingestion</span>
        </div>
        <div style="flex:1; height:2px; background:var(--border-subtle); margin: 0 4px; margin-bottom: 22px;"></div>

        <div class="step-item">
          <div class="step-badge ${step === 5 ? 'active' : ''}">${step === 5 ? '✓' : '5'}</div>
          <span class="step-title ${step === 5 ? 'active' : ''}">5. Ready</span>
        </div>
      </div>

      <!-- Notifications -->
      ${
        error
          ? `
        <div style="background:rgba(244,63,94,0.12); border:1px solid rgba(244,63,94,0.3); border-radius:var(--radius-md); padding:14px 18px; margin-bottom:24px; color:#FECDD3; font-size:0.9rem;">
          <strong>Error:</strong> ${escapeHtml(error)}
        </div>
      `
          : ''
      }
      ${
        success
          ? `
        <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:14px 18px; margin-bottom:24px; color:#A7F3D0; font-size:0.9rem;">
          <strong>Success:</strong> ${escapeHtml(success)}
        </div>
      `
          : ''
      }

      <!-- Main Step Container Card -->
      <div class="card" style="padding:36px;">
        ${renderStepContent({
          step,
          user,
          tenant,
          candidate,
          connection,
          isGitHubConnected,
          availableRepos,
          selectedRepos,
          selectedRepoIds,
          syncResult,
          ingestionRun,
        })}
      </div>
    </div>
  `;

  return renderLayout({
    title: `Onboarding Step ${step} — Candidate Setup`,
    content,
    user,
    activeNav: 'dashboard',
  });
}

function renderStepContent({
  step,
  user,
  candidate,
  connection,
  isGitHubConnected,
  availableRepos,
  selectedRepos,
  selectedRepoIds,
  syncResult,
  ingestionRun,
}) {
  switch (step) {
    case 1:
      return renderStep1Profile({ user, candidate });
    case 2:
      return renderStep2GitHub({ connection, isGitHubConnected });
    case 3:
      return renderStep3Repositories({
        availableRepos,
        selectedRepos,
        selectedRepoIds,
        isGitHubConnected,
      });
    case 4:
      return renderStep4Ingestion({ selectedRepos, syncResult, ingestionRun });
    case 5:
      return renderStep5Complete({ syncResult, candidate, selectedRepos, user });
    default:
      return renderStep1Profile({ user, candidate });
  }
}

/**
 * Step 1: Candidate Identity & Profile
 */
function renderStep1Profile({ user, candidate }) {
  const displayName = user.displayName || candidate?.displayName || '';
  const canonicalEmail = candidate?.canonicalEmail || user.email || '';
  const headline = candidate?.headline || '';
  const summary = candidate?.summary || '';
  const specialization = candidate?.profileMetadata?.userCustom?.specialization || 'Full-Stack';

  return `
    <div>
      <div style="margin-bottom:24px;">
        <span class="badge badge-indigo" style="margin-bottom:6px;">STEP 1 OF 5</span>
        <h2 style="font-size:1.4rem; font-weight:700;">Candidate Identity & Target Specialization</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
          Set up your primary professional persona. This information forms the canonical headline for AI career analysis.
        </p>
      </div>

      <form action="/onboarding/profile" method="POST">
        <div class="form-group">
          <label class="form-label" for="displayName">Full Name / Professional Display Name</label>
          <input type="text" id="displayName" name="displayName" class="form-control" value="${escapeHtml(displayName)}" required placeholder="e.g. Alex Morgan" />
        </div>

        <div class="form-group">
          <label class="form-label" for="canonicalEmail">Canonical Email Address</label>
          <input type="email" id="canonicalEmail" name="canonicalEmail" class="form-control" value="${escapeHtml(canonicalEmail)}" required placeholder="alex@example.com" />
          <div class="form-hint">Used for job application tracking and recruiter correspondence.</div>
        </div>

        <div class="form-group">
          <label class="form-label" for="headline">Professional Headline</label>
          <input type="text" id="headline" name="headline" class="form-control" value="${escapeHtml(headline)}" placeholder="e.g. Staff Backend Engineer | Distributed Systems & Node.js" />
          <div class="form-hint">Summarize your seniority and primary technical domain.</div>
        </div>

        <div class="form-group">
          <label class="form-label" for="specialization">Primary Engineering Domain</label>
          <select id="specialization" name="specialization" class="form-select">
            <option value="Full-Stack" ${specialization === 'Full-Stack' ? 'selected' : ''}>Full-Stack Engineering</option>
            <option value="Backend" ${specialization === 'Backend' ? 'selected' : ''}>Backend & Distributed Systems</option>
            <option value="Frontend" ${specialization === 'Frontend' ? 'selected' : ''}>Frontend & UI/UX Systems</option>
            <option value="AI-ML" ${specialization === 'AI-ML' ? 'selected' : ''}>AI / Machine Learning & LLM Systems</option>
            <option value="Cloud-DevOps" ${specialization === 'Cloud-DevOps' ? 'selected' : ''}>Cloud Architecture, DevOps & SRE</option>
            <option value="Security" ${specialization === 'Security' ? 'selected' : ''}>Security Engineering & Cryptography</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="summary">Professional Bio & Narrative Summary</label>
          <textarea id="summary" name="summary" class="form-textarea" rows="4" placeholder="Describe your technical journey, leadership style, and key engineering accomplishments...">${escapeHtml(summary)}</textarea>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:20px; border-top:1px solid var(--border-subtle); margin-top:28px;">
          <a href="/dashboard" class="btn btn-secondary">Skip to Dashboard</a>
          <button type="submit" class="btn btn-primary">Save & Continue to GitHub Setup →</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Step 2: GitHub App Installation & Connection
 */
function renderStep2GitHub({ connection, isGitHubConnected }) {
  return `
    <div>
      <div style="margin-bottom:24px;">
        <span class="badge badge-indigo" style="margin-bottom:6px;">STEP 2 OF 5</span>
        <h2 style="font-size:1.4rem; font-weight:700;">Connect GitHub Codebases</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
          Career Hub uses GitHub App authentication with <strong>least-privilege read-only permissions</strong> (<code>contents:read</code>, <code>metadata:read</code>).
        </p>
      </div>

      <!-- Status Card -->
      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:24px; margin-bottom:28px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <h3 style="font-size:1.1rem; font-weight:700;">GitHub App Connector</h3>
                ${
                  isGitHubConnected
                    ? '<span class="badge badge-verified">ACTIVE & LINKED</span>'
                    : '<span class="badge badge-amber">NOT CONNECTED</span>'
                }
              </div>
              <p style="font-size:0.85rem; color:var(--text-muted);">
                ${
                  isGitHubConnected
                    ? `Connected Account: <strong>${escapeHtml(connection.externalAccountName || connection.displayName)}</strong> (Installation ID: <code>${escapeHtml(connection.installationId || 'linked')}</code>)`
                    : 'Install the official Antigravity Career Hub GitHub App on your account or organization.'
                }
              </p>
            </div>
          </div>
          <div>
            ${
              isGitHubConnected
                ? '<a href="/integrations/github/install" class="btn btn-secondary btn-sm">Update Installation</a>'
                : '<a href="/integrations/github/install" class="btn btn-primary">Install GitHub App →</a>'
            }
          </div>
        </div>
      </div>

      <!-- Security Guarantee Box -->
      <div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.2); border-radius:var(--radius-md); padding:18px; margin-bottom:28px;">
        <h4 style="font-size:0.9rem; font-weight:700; color:var(--accent-indigo); margin-bottom:6px;">Security & Least-Privilege Architecture:</h4>
        <ul style="font-size:0.85rem; color:var(--text-muted); padding-left:20px; line-height:1.7;">
          <li>We only request <strong>read access</strong> to repositories you explicitly grant.</li>
          <li>Code is analyzed locally in-memory for syntax tree extraction and evidence rollup.</li>
          <li>Raw repository source code and installation credentials are never exposed to LLM context or third parties.</li>
        </ul>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:20px; border-top:1px solid var(--border-subtle);">
        <a href="/onboarding?step=1" class="btn btn-secondary">← Back to Profile</a>
        ${
          isGitHubConnected
            ? '<a href="/onboarding?step=3" class="btn btn-primary">Proceed to Repository Selection →</a>'
            : '<a href="/onboarding?step=3" class="btn btn-secondary">Continue Without GitHub (Manual Mode) →</a>'
        }
      </div>
    </div>
  `;
}

/**
 * Step 3: Discover & Select Repositories
 */
function renderStep3Repositories({
  availableRepos,
  selectedRepos,
  selectedRepoIds,
  isGitHubConnected,
}) {
  const hasRepos = availableRepos.length > 0 || selectedRepos.length > 0;
  const reposToDisplay = availableRepos.length > 0 ? availableRepos : selectedRepos;

  const isRepoIndexed = (repo) => {
    const key = repo.externalResourceId || repo.id;
    const name = repo.name;
    const fullName = repo.fullName || repo.displayName;
    return (
      (key && selectedRepoIds.has(String(key))) ||
      (name && selectedRepoIds.has(name)) ||
      (fullName && selectedRepoIds.has(fullName)) ||
      (repo.metadata?.fullName && selectedRepoIds.has(repo.metadata.fullName))
    );
  };

  const totalCount = reposToDisplay.length;
  const publicCount = reposToDisplay.filter((r) => !r.isPrivate).length;
  const privateCount = reposToDisplay.filter((r) => r.isPrivate).length;
  const indexedCount = reposToDisplay.filter(isRepoIndexed).length;
  const availableCount = totalCount - indexedCount;

  return `
    <div>
      <div style="margin-bottom:24px;">
        <span class="badge badge-indigo" style="margin-bottom:6px;">STEP 3 OF 5</span>
        <h2 style="font-size:1.4rem; font-weight:700;">Select Repositories for Career Portfolio</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
          Choose which repositories Career Hub should index for project creation, syntax tree evidence extraction, and skill rollups.
        </p>
      </div>

      <!-- Summary Metrics Bar -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px; margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px 14px; text-align:center;">
          <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Discovered</div>
          <div style="font-size:1.3rem; font-weight:800; color:var(--text-main); margin-top:2px;" id="statTotal">${totalCount}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px 14px; text-align:center;">
          <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Public</div>
          <div style="font-size:1.3rem; font-weight:800; color:#38BDF8; margin-top:2px;">${publicCount}</div>
        </div>
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px 14px; text-align:center;">
          <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600;">Private</div>
          <div style="font-size:1.3rem; font-weight:800; color:#FBBF24; margin-top:2px;">${privateCount}</div>
        </div>
        <div style="background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-md); padding:12px 14px; text-align:center;">
          <div style="font-size:0.75rem; color:#A7F3D0; text-transform:uppercase; font-weight:600;">Indexed</div>
          <div style="font-size:1.3rem; font-weight:800; color:#34D399; margin-top:2px;">${indexedCount}</div>
        </div>
        <div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.25); border-radius:var(--radius-md); padding:12px 14px; text-align:center;">
          <div style="font-size:0.75rem; color:#C7D2FE; text-transform:uppercase; font-weight:600;">Available</div>
          <div style="font-size:1.3rem; font-weight:800; color:#818CF8; margin-top:2px;">${availableCount}</div>
        </div>
      </div>

      <form action="/onboarding/repositories/select" method="POST" id="repoSelectionForm">
        ${
          hasRepos
            ? `
          <!-- Instant Search & Filter Toolbar -->
          <div style="margin-bottom:16px; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <div style="flex:1; min-width:220px; position:relative;">
                <input
                  type="text"
                  id="repoSearchInput"
                  placeholder="Search repositories by name, owner, or description..."
                  class="form-control"
                  style="padding-left:36px; font-size:0.875rem;"
                />
                <span style="position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:0.9rem; color:var(--text-dim); pointer-events:none;">🔍</span>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <button type="button" id="selectAllAvailableBtn" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:6px 10px;">
                  + Select All Available
                </button>
                <button type="button" id="deselectAllBtn" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding:6px 10px;">
                  Deselect All
                </button>
              </div>
            </div>

            <!-- Filter Tabs -->
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <button type="button" class="filter-pill active" data-filter="all" style="background:rgba(99,102,241,0.2); border:1px solid rgba(99,102,241,0.4); color:#C7D2FE; padding:4px 10px; border-radius:14px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                All (${totalCount})
              </button>
              <button type="button" class="filter-pill" data-filter="available" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-muted); padding:4px 10px; border-radius:14px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                Available (${availableCount})
              </button>
              <button type="button" class="filter-pill" data-filter="indexed" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-muted); padding:4px 10px; border-radius:14px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                Indexed (${indexedCount})
              </button>
              <button type="button" class="filter-pill" data-filter="public" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-muted); padding:4px 10px; border-radius:14px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                Public (${publicCount})
              </button>
              <button type="button" class="filter-pill" data-filter="private" style="background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-muted); padding:4px 10px; border-radius:14px; font-size:0.75rem; font-weight:600; cursor:pointer;">
                Private (${privateCount})
              </button>
            </div>
          </div>

          <!-- Selection Live Counter -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:0.8rem; color:var(--text-muted);">
            <span>
              Selected for Ingestion: <strong id="selectedCounter" style="color:var(--text-main);">${indexedCount}</strong> of <span id="visibleCount">${totalCount}</span> visible
            </span>
            <span id="filterLabel" style="color:var(--text-dim);">Showing all ${totalCount} repositories</span>
          </div>

          <!-- Repositories List Container -->
          <div id="repoListContainer" style="display:flex; flex-direction:column; gap:10px; margin-bottom:28px; max-height:480px; overflow-y:auto; padding-right:4px;">
            ${reposToDisplay
              .map((repo) => {
                const repoKey = repo.externalResourceId || repo.id || repo.name;
                const isSelected = isRepoIndexed(repo);
                const isPrivate = Boolean(repo.isPrivate);
                const fullName = repo.fullName || repo.displayName || repo.name;
                const desc =
                  repo.metadata?.description || `Default branch: ${repo.defaultBranch || 'main'}`;

                return `
              <div
                class="repo-item-card"
                data-name="${escapeHtml((repo.name || '').toLowerCase())}"
                data-fullname="${escapeHtml(fullName.toLowerCase())}"
                data-desc="${escapeHtml(desc.toLowerCase())}"
                data-visibility="${isPrivate ? 'private' : 'public'}"
                data-status="${isSelected ? 'indexed' : 'available'}"
                style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:rgba(11,15,25,0.5); border:1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'var(--border-subtle)'}; border-radius:var(--radius-md); transition:all 0.15s ease;"
              >
                <div style="display:flex; align-items:flex-start; gap:14px; flex:1; min-width:0;">
                  <input
                    type="checkbox"
                    id="repo_${escapeHtml(String(repoKey))}"
                    name="repositories"
                    value="${escapeHtml(String(repoKey))}"
                    ${isSelected ? 'checked' : ''}
                    class="repo-checkbox"
                    style="width:18px; height:18px; accent-color:var(--accent-indigo); cursor:pointer; margin-top:2px; flex-shrink:0;"
                  />
                  <div style="min-width:0; flex:1;">
                    <label for="repo_${escapeHtml(String(repoKey))}" style="font-size:0.95rem; font-weight:700; color:var(--text-main); cursor:pointer; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                      <span>${escapeHtml(repo.name || repo.displayName)}</span>
                      <span style="font-size:0.75rem; color:var(--text-dim); font-weight:400; font-family:var(--font-mono, monospace);">${escapeHtml(fullName)}</span>
                      ${isPrivate ? '<span class="badge badge-amber" style="font-size:0.65rem; padding:2px 6px;">🔒 PRIVATE</span>' : '<span class="badge badge-cyan" style="font-size:0.65rem; padding:2px 6px;">🌐 PUBLIC</span>'}
                    </label>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:90%;">
                      ${escapeHtml(desc)}
                    </p>
                  </div>
                </div>
                <div style="flex-shrink:0; margin-left:12px;">
                  ${
                    isSelected
                      ? '<span class="badge badge-verified" style="font-size:0.75rem; padding:4px 8px;">✓ INDEXED</span>'
                      : '<span class="badge badge-indigo" style="font-size:0.75rem; padding:4px 8px;">AVAILABLE</span>'
                  }
                </div>
              </div>
            `;
              })
              .join('')}
          </div>

          <!-- Vanilla JS Real-Time Search, Filter & Quick Action Script -->
          <script>
            (function() {
              const searchInput = document.getElementById('repoSearchInput');
              const filterPills = document.querySelectorAll('.filter-pill');
              const repoCards = document.querySelectorAll('.repo-item-card');
              const checkboxes = document.querySelectorAll('.repo-checkbox');
              const selectAllAvailableBtn = document.getElementById('selectAllAvailableBtn');
              const deselectAllBtn = document.getElementById('deselectAllBtn');
              const selectedCounter = document.getElementById('selectedCounter');
              const visibleCount = document.getElementById('visibleCount');
              const filterLabel = document.getElementById('filterLabel');

              let currentFilter = 'all';
              let currentSearch = '';

              function updateCounters() {
                const checkedCount = document.querySelectorAll('.repo-checkbox:checked').length;
                if (selectedCounter) selectedCounter.textContent = checkedCount;
              }

              function filterRepos() {
                let count = 0;
                repoCards.forEach(card => {
                  const name = card.getAttribute('data-name') || '';
                  const fullName = card.getAttribute('data-fullname') || '';
                  const desc = card.getAttribute('data-desc') || '';
                  const vis = card.getAttribute('data-visibility') || '';
                  const status = card.getAttribute('data-status') || '';

                  const matchesSearch = !currentSearch || name.includes(currentSearch) || fullName.includes(currentSearch) || desc.includes(currentSearch);
                  let matchesFilter = true;

                  if (currentFilter === 'available') matchesFilter = (status === 'available');
                  else if (currentFilter === 'indexed') matchesFilter = (status === 'indexed');
                  else if (currentFilter === 'public') matchesFilter = (vis === 'public');
                  else if (currentFilter === 'private') matchesFilter = (vis === 'private');

                  if (matchesSearch && matchesFilter) {
                    card.style.display = 'flex';
                    count++;
                  } else {
                    card.style.display = 'none';
                  }
                });

                if (visibleCount) visibleCount.textContent = count;
                if (filterLabel) {
                  filterLabel.textContent = 'Showing ' + count + ' ' + (currentFilter === 'all' ? '' : currentFilter + ' ') + 'repositories';
                }
              }

              if (searchInput) {
                searchInput.addEventListener('input', function(e) {
                  currentSearch = e.target.value.trim().toLowerCase();
                  filterRepos();
                });
              }

              filterPills.forEach(pill => {
                pill.addEventListener('click', function() {
                  filterPills.forEach(p => {
                    p.classList.remove('active');
                    p.style.background = 'rgba(255,255,255,0.04)';
                    p.style.borderColor = 'var(--border-subtle)';
                    p.style.color = 'var(--text-muted)';
                  });
                  this.classList.add('active');
                  this.style.background = 'rgba(99,102,241,0.2)';
                  this.style.borderColor = 'rgba(99,102,241,0.4)';
                  this.style.color = '#C7D2FE';

                  currentFilter = this.getAttribute('data-filter') || 'all';
                  filterRepos();
                });
              });

              if (selectAllAvailableBtn) {
                selectAllAvailableBtn.addEventListener('click', function() {
                  repoCards.forEach(card => {
                    if (card.style.display !== 'none') {
                      const cb = card.querySelector('.repo-checkbox');
                      if (cb) cb.checked = true;
                    }
                  });
                  updateCounters();
                });
              }

              if (deselectAllBtn) {
                deselectAllBtn.addEventListener('click', function() {
                  repoCards.forEach(card => {
                    if (card.style.display !== 'none') {
                      const cb = card.querySelector('.repo-checkbox');
                      if (cb) cb.checked = false;
                    }
                  });
                  updateCounters();
                });
              }

              checkboxes.forEach(cb => {
                cb.addEventListener('change', updateCounters);
              });
            })();
          </script>
        `
            : `
          <div style="text-align:center; padding:40px 20px; background:rgba(255,255,255,0.02); border:1px dashed var(--border-subtle); border-radius:var(--radius-md); margin-bottom:28px;">
            <div style="font-size:2rem; margin-bottom:12px;">📦</div>
            <h3 style="font-size:1.1rem; font-weight:700; margin-bottom:6px;">No Repositories Discovered Yet</h3>
            <p style="font-size:0.875rem; color:var(--text-muted); max-width:460px; margin:0 auto 20px;">
              ${
                isGitHubConnected
                  ? 'Your GitHub App installation is connected. Configure showcase repositories on GitHub or proceed to manual project creation.'
                  : 'Install the GitHub App to automatically discover your public and private repositories.'
              }
            </p>
            ${
              isGitHubConnected
                ? '<a href="/integrations/github/install" class="btn btn-secondary btn-sm">Configure Repositories on GitHub</a>'
                : '<a href="/integrations/github/install" class="btn btn-primary btn-sm">Connect GitHub App →</a>'
            }
          </div>
        `
        }

        <div style="display:flex; justify-content:space-between; align-items:center; padding-top:20px; border-top:1px solid var(--border-subtle);">
          <a href="/onboarding?step=2" class="btn btn-secondary">← Back to GitHub</a>
          <button type="submit" class="btn btn-primary">Save Selection & Run Ingestion →</button>
        </div>
      </form>
    </div>
  `;
}

/**
 * Step 4: Repository Ingestion (Sync) Pipeline
 */
function renderStep4Ingestion({ selectedRepos, syncResult, ingestionRun = null }) {
  const isLiveRunning = ingestionRun?.state === 'RUNNING' || ingestionRun?.state === 'QUEUED';
  const isCompleted =
    ingestionRun?.state === 'COMPLETED' || (syncResult !== null && !isLiveRunning);
  const isPartialFailure = ingestionRun?.state === 'PARTIAL_FAILURE';
  const isFailed = ingestionRun?.state === 'FAILED';

  const completedCount =
    ingestionRun?.completedRepositories ??
    syncResult?.repositoriesProcessed ??
    (isCompleted ? selectedRepos.length : 0);
  const totalCount = ingestionRun?.totalRepositories ?? selectedRepos.length;
  const failedCount = ingestionRun?.failedRepositories ?? 0;

  const currentSummary = ingestionRun?.summary || syncResult;

  const repoList =
    ingestionRun?.repositories && ingestionRun.repositories.length > 0
      ? ingestionRun.repositories
      : selectedRepos.map((r) => ({
          id: String(r.id || r.externalResourceId || r.name),
          name: r.name || r.displayName || 'Repository',
          fullName: r.fullName || r.name || 'Repository',
          state: isCompleted ? 'COMPLETED' : 'QUEUED',
          phase: isCompleted ? 'AST + evidence complete' : 'Queued',
          error: null,
          projectsCreated: 0,
          projectsUpdated: 0,
          evidenceCreated: 0,
          evidenceLinked: 0,
        }));

  return `
    <div id="step4Root">
      <style>
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 0.85s linear infinite;
        }
        .pulse-subtle {
          animation: pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulseSubtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.65; }
        }
      </style>

      <div style="margin-bottom:24px;">
        <span class="badge badge-indigo" style="margin-bottom:6px;">STEP 4 OF 5</span>
        <h2 style="font-size:1.4rem; font-weight:700;">Execute AST Ingestion & Evidence Extraction</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
          Analyze dependency manifests, syntax import trees, commit history, and technical architecture to generate evidence-backed projects and skills.
        </p>
      </div>

      <!-- Main Ingestion Panel -->
      <div id="ingestionMainPanel" style="background:rgba(255,255,255,0.02); border:1px solid ${isLiveRunning ? 'rgba(59,130,246,0.35)' : isCompleted ? 'rgba(16,185,129,0.35)' : isPartialFailure ? 'rgba(245,158,11,0.35)' : isFailed ? 'rgba(239,68,68,0.35)' : 'var(--border-subtle)'}; border-radius:var(--radius-md); padding:24px; margin-bottom:28px; transition:all 0.3s ease;">

        <!-- Ingestion Target Scope Summary -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:20px; border-bottom:1px solid var(--border-subtle); padding-bottom:16px;">
          <div>
            <h3 style="font-size:1rem; font-weight:700; margin:0 0 4px;">Target Repositories</h3>
            <p style="font-size:0.825rem; color:var(--text-muted); margin:0;" id="scopeSubtitle">
              <strong>${totalCount}</strong> repository ${totalCount === 1 ? 'source' : 'sources'} queued for deep AST syntax extraction:
            </p>
          </div>
          <div>
            <span class="badge ${isLiveRunning ? 'badge-cyan pulse-subtle' : isCompleted ? 'badge-success' : isPartialFailure ? 'badge-warning' : isFailed ? 'badge-danger' : 'badge-indigo'}" id="overallStatusBadge" style="font-size:0.85rem; font-weight:700; padding:6px 14px;">
              ${isLiveRunning ? 'RUNNING' : isCompleted ? 'COMPLETED' : isPartialFailure ? 'PARTIAL FAILURE' : isFailed ? 'FAILED' : 'QUEUED'}
            </span>
          </div>
        </div>

        <!-- Progress Counter Bar -->
        <div id="progressStatusBar" style="display:${isLiveRunning || isCompleted || isPartialFailure ? 'flex' : 'none'}; justify-content:space-between; align-items:center; margin-bottom:16px; background:rgba(255,255,255,0.03); padding:10px 16px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);" role="status" aria-live="polite">
          <div style="display:flex; align-items:center; gap:10px;">
            ${isLiveRunning ? '<span class="inline-spinner animate-spin" style="width:16px; height:16px; border:2px solid rgba(59,130,246,0.25); border-top-color:#3B82F6; border-radius:50%; display:inline-block;"></span>' : ''}
            <span style="font-size:0.875rem; font-weight:600; color:var(--text-main);" id="currentPhaseText">
              ${escapeHtml(ingestionRun?.currentPhase || (isCompleted ? 'Ingestion complete' : 'Ready to start'))}
            </span>
          </div>
          <span style="font-size:0.85rem; font-weight:700; color:var(--accent-indigo);" id="progressFractionText">
            ${completedCount} / ${totalCount} Repositories Complete
          </span>
        </div>

        <!-- Repository Status Item Cards -->
        <div id="repoProgressList" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
          ${repoList
            .map((repo) => {
              const repoState = repo.state || (isCompleted ? 'COMPLETED' : 'QUEUED');
              const isRepoRunning = repoState === 'RUNNING';
              const isRepoCompleted = repoState === 'COMPLETED';
              const isRepoFailed = repoState === 'FAILED';

              let iconHtml = '<span style="color:var(--text-dim); font-size:1.1rem;">○</span>';
              let badgeClass = 'badge-neutral';
              if (isRepoCompleted) {
                iconHtml =
                  '<span style="color:#34D399; font-weight:bold; font-size:1.1rem;">✓</span>';
                badgeClass = 'badge-success';
              } else if (isRepoRunning) {
                iconHtml =
                  '<span class="inline-spinner animate-spin" style="width:16px; height:16px; border:2px solid rgba(59,130,246,0.25); border-top-color:#3B82F6; border-radius:50%; display:inline-block;"></span>';
                badgeClass = 'badge-cyan';
              } else if (isRepoFailed) {
                iconHtml =
                  '<span style="color:#EF4444; font-weight:bold; font-size:1.1rem;">✕</span>';
                badgeClass = 'badge-danger';
              }

              return `
                <div class="repo-card-row" id="repo_row_${escapeHtml(String(repo.id))}" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid ${isRepoRunning ? 'rgba(59,130,246,0.4)' : isRepoCompleted ? 'rgba(16,185,129,0.3)' : isRepoFailed ? 'rgba(239,68,68,0.3)' : 'var(--border-subtle)'}; border-radius:var(--radius-sm); transition:border-color 0.2s ease;">
                  <div style="display:flex; align-items:center; gap:12px;">
                    <div id="repo_icon_${escapeHtml(String(repo.id))}" style="display:flex; align-items:center; justify-content:center; width:20px;">
                      ${iconHtml}
                    </div>
                    <div>
                      <span style="font-weight:600; font-size:0.92rem; color:var(--text-main);">${escapeHtml(repo.name || repo.fullName)}</span>
                      <div id="repo_phase_${escapeHtml(String(repo.id))}" style="font-size:0.775rem; color:var(--text-muted); margin-top:2px;">
                        ${escapeHtml(repo.phase || repoState)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <span id="repo_badge_${escapeHtml(String(repo.id))}" class="badge ${badgeClass}" style="font-size:0.725rem; text-transform:uppercase; letter-spacing:0.04em;">
                      ${repoState}
                    </span>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Completion Stats Card (Rendered if completed) -->
        <div id="completionStatsCard" style="display:${isCompleted && currentSummary ? 'block' : 'none'}; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:20px; margin-top:20px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
            <span style="font-size:1.2rem;">✨</span>
            <h4 style="font-size:1.05rem; font-weight:700; color:#34D399; margin:0;">Ingestion Pipeline Completed Successfully</h4>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:12px;">
            <div class="stat-card" style="padding:14px;">
              <div class="stat-val" id="statReposVal" style="font-size:1.4rem; color:#34D399;">${currentSummary?.repositoriesProcessed || completedCount}</div>
              <div class="stat-label" style="font-size:0.75rem;">Repos Processed</div>
            </div>
            <div class="stat-card" style="padding:14px;">
              <div class="stat-val" id="statProjectsVal" style="font-size:1.4rem; color:var(--accent-indigo);">${(currentSummary?.projectsCreated || 0) + (currentSummary?.projectsUpdated || 0)}</div>
              <div class="stat-label" style="font-size:0.75rem;">Projects Indexed</div>
            </div>
            <div class="stat-card" style="padding:14px;">
              <div class="stat-val" id="statEvidenceVal" style="font-size:1.4rem; color:var(--accent-cyan);">${currentSummary?.evidenceCreated || currentSummary?.evidenceLinked || 0}</div>
              <div class="stat-label" style="font-size:0.75rem;">Evidence Items</div>
            </div>
            <div class="stat-card" style="padding:14px;">
              <div class="stat-val" id="statSkillsVal" style="font-size:1.4rem; color:var(--accent-amber);">${currentSummary?.verifiedSkillsAdded || (currentSummary?.verifiedSkills ? currentSummary.verifiedSkills.length : 0)}</div>
              <div class="stat-label" style="font-size:0.75rem;">Verified Skills</div>
            </div>
          </div>
        </div>

        <!-- Partial Failure Alert (Rendered if partial failure) -->
        <div id="partialFailureAlert" style="display:${isPartialFailure ? 'block' : 'none'}; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-md); padding:16px; margin-top:20px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.1rem;">⚠️</span>
            <h4 style="font-size:0.95rem; font-weight:700; color:#FBBF24; margin:0;" id="partialFailureTitle">
              ${completedCount} of ${totalCount} repositories completed, ${failedCount} failed
            </h4>
          </div>
          <p style="font-size:0.825rem; color:var(--text-muted); margin:6px 0 0 28px;">
            Successful repositories are indexed and evidence is saved. You can retry the failed repositories or continue with partial results.
          </p>
        </div>

        <!-- Fatal Failure Alert (Rendered if failed) -->
        <div id="fatalFailureAlert" style="display:${isFailed ? 'block' : 'none'}; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:var(--radius-md); padding:16px; margin-top:20px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.1rem;">❌</span>
            <h4 style="font-size:0.95rem; font-weight:700; color:#F87171; margin:0;">
              Ingestion Pipeline Encountered an Error
            </h4>
          </div>
          <p style="font-size:0.825rem; color:var(--text-muted); margin:6px 0 0 28px;" id="fatalFailureMsg">
            ${escapeHtml(ingestionRun?.error || 'Failed to complete repository ingestion. Please check connection and retry.')}
          </p>
        </div>
      </div>

      <!-- Action Navigation Footer -->
      <div id="step4ActionFooter" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:20px; border-top:1px solid var(--border-subtle);">
        <a href="/onboarding?step=3" id="backToReposBtn" class="btn btn-secondary ${isLiveRunning ? 'disabled' : ''}" style="${isLiveRunning ? 'opacity:0.4; pointer-events:none; cursor:not-allowed;' : ''}" ${isLiveRunning ? 'aria-disabled="true" tabindex="-1"' : ''}>
          ← Back to Repositories
        </a>

        <div id="actionButtonGroup" style="display:flex; align-items:center; gap:10px;">
          ${
            isLiveRunning
              ? `
            <button type="button" id="runningIndicatorBtn" class="btn btn-primary disabled" disabled style="opacity:0.65; cursor:not-allowed; display:inline-flex; align-items:center; gap:8px;">
              <span class="inline-spinner animate-spin" style="width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; display:inline-block;"></span>
              <span>Ingestion Running...</span>
            </button>
          `
              : isCompleted
                ? `
            <a href="/onboarding?step=5" id="continueToSummaryBtn" class="btn btn-primary" style="padding:10px 22px;">
              Review Profile Summary →
            </a>
          `
                : isPartialFailure || isFailed
                  ? `
            <form action="/onboarding/ingestion/retry" method="POST" style="margin:0; display:inline;">
              <button type="submit" id="retryFailedBtn" class="btn btn-secondary">
                🔄 Retry Failed
              </button>
            </form>
            <a href="/onboarding?step=5" id="continueAnywayBtn" class="btn btn-primary" style="padding:10px 22px;">
              Continue to Summary →
            </a>
          `
                  : `
            <a href="/onboarding?step=5" id="skipIngestionBtn" class="btn btn-secondary">
              Skip Ingestion & Complete →
            </a>
            <button type="button" id="startIngestionBtn" class="btn btn-primary" style="padding:12px 24px; font-size:1rem;">
              ⚡ Run Repository Ingestion Pipeline
            </button>
          `
          }
        </div>
      </div>

      <!-- Real-Time State Controller Script -->
      <script>
        (function() {
          var isRunning = ${isLiveRunning ? 'true' : 'false'};
          var pollInterval = null;

          function setRunningState(running) {
            isRunning = running;
            window._isIngestionRunning = running;

            var backBtn = document.getElementById('backToReposBtn');
            var skipBtn = document.getElementById('skipIngestionBtn');
            var startBtn = document.getElementById('startIngestionBtn');
            var actionGroup = document.getElementById('actionButtonGroup');
            var panel = document.getElementById('ingestionMainPanel');
            var statusBadge = document.getElementById('overallStatusBadge');
            var statusBar = document.getElementById('progressStatusBar');

            if (running) {
              if (backBtn) {
                backBtn.classList.add('disabled');
                backBtn.style.opacity = '0.4';
                backBtn.style.pointerEvents = 'none';
                backBtn.setAttribute('aria-disabled', 'true');
              }
              if (panel) {
                panel.style.borderColor = 'rgba(59,130,246,0.35)';
              }
              if (statusBadge) {
                statusBadge.className = 'badge badge-cyan pulse-subtle';
                statusBadge.innerText = 'RUNNING';
              }
              if (statusBar) {
                statusBar.style.display = 'flex';
              }
              if (actionGroup) {
                actionGroup.innerHTML = '<button type="button" class="btn btn-primary disabled" disabled style="opacity:0.65; cursor:not-allowed; display:inline-flex; align-items:center; gap:8px;"><span class="inline-spinner animate-spin" style="width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; display:inline-block;"></span><span>Ingestion Running...</span></button>';
              }
            }
          }

          function updateUiFromStatus(data) {
            if (!data) return;

            var phaseText = document.getElementById('currentPhaseText');
            var fractionText = document.getElementById('progressFractionText');
            var statusBadge = document.getElementById('overallStatusBadge');
            var panel = document.getElementById('ingestionMainPanel');
            var actionGroup = document.getElementById('actionButtonGroup');
            var backBtn = document.getElementById('backToReposBtn');

            if (phaseText && data.currentPhase) {
              phaseText.innerText = data.currentPhase;
            }
            if (fractionText) {
              fractionText.innerText = (data.completedRepositories || 0) + ' / ' + (data.totalRepositories || 0) + ' Repositories Complete';
            }

            // Update individual repository cards
            if (Array.isArray(data.repositories)) {
              data.repositories.forEach(function(repo) {
                var row = document.getElementById('repo_row_' + repo.id);
                var icon = document.getElementById('repo_icon_' + repo.id);
                var phase = document.getElementById('repo_phase_' + repo.id);
                var badge = document.getElementById('repo_badge_' + repo.id);

                if (phase) phase.innerText = repo.phase || repo.state;
                if (badge) {
                  badge.innerText = repo.state;
                  if (repo.state === 'COMPLETED') {
                    badge.className = 'badge badge-success';
                    if (icon) icon.innerHTML = '<span style="color:#34D399; font-weight:bold; font-size:1.1rem;">✓</span>';
                    if (row) row.style.borderColor = 'rgba(16,185,129,0.3)';
                  } else if (repo.state === 'RUNNING') {
                    badge.className = 'badge badge-cyan';
                    if (icon) icon.innerHTML = '<span class="inline-spinner animate-spin" style="width:16px; height:16px; border:2px solid rgba(59,130,246,0.25); border-top-color:#3B82F6; border-radius:50%; display:inline-block;"></span>';
                    if (row) row.style.borderColor = 'rgba(59,130,246,0.4)';
                  } else if (repo.state === 'FAILED') {
                    badge.className = 'badge badge-danger';
                    if (icon) icon.innerHTML = '<span style="color:#EF4444; font-weight:bold; font-size:1.1rem;">✕</span>';
                    if (row) row.style.borderColor = 'rgba(239,68,68,0.3)';
                  }
                }
              });
            }

            // Handle terminal states
            if (data.state === 'COMPLETED') {
              setRunningState(false);
              if (pollInterval) clearInterval(pollInterval);
              if (statusBadge) {
                statusBadge.className = 'badge badge-success';
                statusBadge.innerText = 'COMPLETED';
              }
              if (panel) panel.style.borderColor = 'rgba(16,185,129,0.35)';
              if (backBtn) {
                backBtn.classList.remove('disabled');
                backBtn.style.opacity = '1';
                backBtn.style.pointerEvents = 'auto';
                backBtn.removeAttribute('aria-disabled');
              }

              // Show completion stats card
              var statsCard = document.getElementById('completionStatsCard');
              if (statsCard) {
                statsCard.style.display = 'block';
                var sum = data.summary;
                if (sum) {
                  var statRepos = document.getElementById('statReposVal');
                  var statProjects = document.getElementById('statProjectsVal');
                  var statEvidence = document.getElementById('statEvidenceVal');
                  var statSkills = document.getElementById('statSkillsVal');
                  if (statRepos) statRepos.innerText = sum.repositoriesProcessed || data.completedRepositories || 0;
                  if (statProjects) statProjects.innerText = (sum.projectsCreated || 0) + (sum.projectsUpdated || 0);
                  if (statEvidence) statEvidence.innerText = sum.evidenceCreated || sum.evidenceLinked || 0;
                  if (statSkills) statSkills.innerText = sum.verifiedSkillsAdded || (sum.verifiedSkills ? sum.verifiedSkills.length : 0);
                }
              }

              if (actionGroup) {
                actionGroup.innerHTML = '<a href="/onboarding?step=5" id="continueToSummaryBtn" class="btn btn-primary" style="padding:10px 22px;">Review Profile Summary →</a>';
              }
            } else if (data.state === 'PARTIAL_FAILURE') {
              setRunningState(false);
              if (pollInterval) clearInterval(pollInterval);
              if (statusBadge) {
                statusBadge.className = 'badge badge-warning';
                statusBadge.innerText = 'PARTIAL FAILURE';
              }
              if (panel) panel.style.borderColor = 'rgba(245,158,11,0.35)';
              if (backBtn) {
                backBtn.classList.remove('disabled');
                backBtn.style.opacity = '1';
                backBtn.style.pointerEvents = 'auto';
                backBtn.removeAttribute('aria-disabled');
              }
              var partialAlert = document.getElementById('partialFailureAlert');
              if (partialAlert) partialAlert.style.display = 'block';
              if (actionGroup) {
                actionGroup.innerHTML = '<form action="/onboarding/ingestion/retry" method="POST" style="margin:0; display:inline;"><button type="submit" class="btn btn-secondary">🔄 Retry Failed</button></form><a href="/onboarding?step=5" class="btn btn-primary" style="padding:10px 22px;">Continue to Summary →</a>';
              }
            } else if (data.state === 'FAILED') {
              setRunningState(false);
              if (pollInterval) clearInterval(pollInterval);
              if (statusBadge) {
                statusBadge.className = 'badge badge-danger';
                statusBadge.innerText = 'FAILED';
              }
              if (panel) panel.style.borderColor = 'rgba(239,68,68,0.35)';
              if (backBtn) {
                backBtn.classList.remove('disabled');
                backBtn.style.opacity = '1';
                backBtn.style.pointerEvents = 'auto';
                backBtn.removeAttribute('aria-disabled');
              }
              var fatalAlert = document.getElementById('fatalFailureAlert');
              if (fatalAlert) {
                fatalAlert.style.display = 'block';
                var fatalMsg = document.getElementById('fatalFailureMsg');
                if (fatalMsg && data.error) fatalMsg.innerText = data.error;
              }
              if (actionGroup) {
                actionGroup.innerHTML = '<form action="/onboarding/ingestion/retry" method="POST" style="margin:0; display:inline;"><button type="submit" class="btn btn-secondary">🔄 Retry Ingestion</button></form>';
              }
            }
          }

          function startPolling() {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(function() {
              fetch('/onboarding/ingestion/status', {
                headers: { 'Accept': 'application/json' }
              })
                .then(function(res) { return res.json(); })
                .then(function(data) {
                  updateUiFromStatus(data);
                })
                .catch(function(err) {
                  console.warn('Polling error:', err);
                });
            }, 1500);
          }

          // Initial poll if page loaded while already running
          if (isRunning) {
            setRunningState(true);
            startPolling();
          }

          // Handle click on start ingestion button
          var startBtn = document.getElementById('startIngestionBtn');
          if (startBtn) {
            startBtn.addEventListener('click', function(e) {
              e.preventDefault();
              setRunningState(true);

              fetch('/onboarding/sync', {
                method: 'POST',
                headers: {
                  'Accept': 'application/json'
                }
              })
                .then(function(res) {
                  if (res.status === 202 || res.status === 200) {
                    return res.json();
                  } else if (res.status === 409) {
                    // Already running in another tab/request
                    return res.json();
                  } else {
                    return res.json().then(function(errData) {
                      throw new Error(errData.error ? errData.error.message : 'Failed to start ingestion');
                    });
                  }
                })
                .then(function(data) {
                  startPolling();
                })
                .catch(function(err) {
                  setRunningState(false);
                  alert('Could not start ingestion: ' + err.message);
                });
            });
          }

          // Safe unload navigation warning
          window.addEventListener('beforeunload', function(e) {
            if (window._isIngestionRunning) {
              e.preventDefault();
              e.returnValue = 'Ingestion is running. Leaving this page will not stop the background process.';
              return e.returnValue;
            }
          });
        })();
      </script>
    </div>
  `;
}

/**
 * Step 5: Onboarding Completion
 */
function renderStep5Complete({ candidate, selectedRepos, user = null }) {
  return `
    <div style="text-align:center; padding:20px 0;">
      <div style="width:64px; height:64px; border-radius:50%; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34D399; display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 20px;">
        ✓
      </div>
      <h2 style="font-size:1.75rem; font-weight:800; letter-spacing:-0.02em; margin-bottom:8px;">
        Onboarding Completed!
      </h2>
      <p style="font-size:1rem; color:var(--text-muted); max-width:520px; margin:0 auto 32px;">
        Your candidate profile is active, repositories are linked, and evidence citations are indexed for AI career intelligence.
      </p>

      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:24px; max-width:560px; margin:0 auto 36px; text-align:left;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:14px;">Active Workspace Profile:</h3>
        <div style="display:flex; flex-direction:column; gap:10px; font-size:0.875rem;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:8px;">
            <span style="color:var(--text-muted);">Candidate Persona:</span>
            <strong>${escapeHtml(user.displayName || candidate?.displayName || 'Active Candidate')}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:8px;">
            <span style="color:var(--text-muted);">Headline:</span>
            <span>${escapeHtml(candidate?.headline || 'Configured')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:8px;">
            <span style="color:var(--text-muted);">Connected Repositories:</span>
            <span>${selectedRepos.length} Repositories</span>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">MCP Endpoint:</span>
            <code>POST /mcp</code>
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:center; gap:16px;">
        <a href="/dashboard" class="btn btn-primary" style="padding:12px 28px; font-size:1rem;">
          Launch Candidate Workspace →
        </a>
        <a href="/connect" class="btn btn-secondary" style="padding:12px 20px;">
          Connect Claude / ChatGPT / Gemini
        </a>
      </div>
    </div>
  `;
}
