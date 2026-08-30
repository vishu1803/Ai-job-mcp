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
      return renderStep4Ingestion({ selectedRepos, syncResult });
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
function renderStep4Ingestion({ selectedRepos, syncResult }) {
  return `
    <div>
      <div style="margin-bottom:24px;">
        <span class="badge badge-indigo" style="margin-bottom:6px;">STEP 4 OF 5</span>
        <h2 style="font-size:1.4rem; font-weight:700;">Execute AST Ingestion & Evidence Extraction</h2>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-top:4px;">
          Analyze dependency manifests, syntax import trees, commit history, and technical architecture to generate evidence-backed projects and skills.
        </p>
      </div>

      <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:24px; margin-bottom:28px;">
        <h3 style="font-size:1rem; font-weight:700; margin-bottom:12px;">Ingestion Target Scope:</h3>
        <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px;">
          <strong>${selectedRepos.length}</strong> repository ${selectedRepos.length === 1 ? 'source' : 'sources'} queued for deep AST syntax extraction:
        </p>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
          ${
            selectedRepos.length > 0
              ? selectedRepos
                  .map(
                    (r) =>
                      `<span class="badge badge-indigo">${escapeHtml(r.name || r.displayName)}</span>`
                  )
                  .join('')
              : '<span style="font-size:0.85rem; color:var(--text-dim);">No repositories selected. Ingestion will process existing resources.</span>'
          }
        </div>

        ${
          syncResult
            ? `
          <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.3); border-radius:var(--radius-md); padding:20px; margin-top:20px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
              <span style="font-size:1.2rem;">✨</span>
              <h4 style="font-size:1.05rem; font-weight:700; color:#34D399;">Ingestion Pipeline Completed Successfully</h4>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
              <div class="stat-card" style="padding:14px;">
                <div class="stat-val" style="font-size:1.4rem; color:#34D399;">${syncResult.repositoriesProcessed || 0}</div>
                <div class="stat-label" style="font-size:0.75rem;">Repos Processed</div>
              </div>
              <div class="stat-card" style="padding:14px;">
                <div class="stat-val" style="font-size:1.4rem; color:var(--accent-indigo);">${(syncResult.projectsCreated || 0) + (syncResult.projectsUpdated || 0)}</div>
                <div class="stat-label" style="font-size:0.75rem;">Projects Indexed</div>
              </div>
              <div class="stat-card" style="padding:14px;">
                <div class="stat-val" style="font-size:1.4rem; color:var(--accent-cyan);">${syncResult.evidenceCreated || syncResult.evidenceLinked || 0}</div>
                <div class="stat-label" style="font-size:0.75rem;">Evidence Items</div>
              </div>
              <div class="stat-card" style="padding:14px;">
                <div class="stat-val" style="font-size:1.4rem; color:var(--accent-amber);">${syncResult.verifiedSkillsAdded || (syncResult.verifiedSkills ? syncResult.verifiedSkills.length : 0)}</div>
                <div class="stat-label" style="font-size:0.75rem;">Verified Skills</div>
              </div>
            </div>
          </div>
        `
            : `
          <form action="/onboarding/sync" method="POST" style="margin-top:16px;">
            <button type="submit" class="btn btn-primary" style="padding:12px 24px; font-size:1rem;">
              ⚡ Run Repository Ingestion Pipeline
            </button>
          </form>
        `
        }
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:20px; border-top:1px solid var(--border-subtle);">
        <a href="/onboarding?step=3" class="btn btn-secondary">← Back to Repositories</a>
        <a href="/onboarding?step=5" class="btn btn-primary">${syncResult ? 'Review Profile Summary →' : 'Skip Ingestion & Complete →'}</a>
      </div>
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
