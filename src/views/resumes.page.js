/**
 * @file Human-Facing Resumes & Document Lifecycle View (P13.5-003 / ARCH-052).
 *
 * Implements:
 * 1. Resumes Index (/resumes): Multi-format upload zone (PDF, DOCX, TXT), version history table, truth model banner.
 * 2. Resume Detail & Claim Review (/resumes/:id): Parsed sections inspector, claim truth status verification, base resume promotion.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Formats byte count into a readable string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Returns HTML badge for resume lifecycle status.
 *
 * @param {string} status
 * @param {boolean} [isBase=false]
 * @returns {string}
 */
function renderResumeStatusBadge(status, isBase = false) {
  if (isBase) {
    return `<span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4);">★ BASE RESUME</span>`;
  }
  switch (status) {
    case 'USER_APPROVED':
      return `<span class="badge badge-verified">APPROVED</span>`;
    case 'PARSED':
      return `<span class="badge badge-inferred">PARSED (AWAITING REVIEW)</span>`;
    case 'SOURCE':
      return `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);">SOURCE UPLOAD</span>`;
    case 'ARCHIVED':
      return `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">ARCHIVED</span>`;
    default:
      return `<span class="badge badge-claimed">${escapeHtml(status)}</span>`;
  }
}

/**
 * Renders the Resumes Index and Upload View.
 *
 * @param {object} params
 * @param {object} params.candidate
 * @param {Array<object>} params.resumesList
 * @param {string} [params.csrfToken]
 * @param {string} [params.flashMessage]
 * @param {string} [params.errorMessage]
 * @returns {string}
 */
export function renderResumesPage({
  user = null,
  tenant: _tenant = null,
  candidate = null,
  resumesList = [],
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
}) {
  const candidateName = candidate?.displayName || user?.displayName || 'Authenticated Candidate';
  const candidateEmail = candidate?.canonicalEmail || user?.email || '';
  const candidateHeadline = candidate?.headline || 'Candidate Profile';

  const content = `
    <div style="margin-bottom: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem;">
        <div>
          <h1 style="font-size: 1.875rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">Source Resumes & Career Documents</h1>
          <p style="color: #94a3b8; font-size: 0.95rem; max-width: 700px;">
            Upload your source resume (PDF, DOCX, TXT) to establish your baseline narrative. Documents are stored with AES-256-GCM encryption and parsed with strict truth separation.
          </p>
        </div>
      </div>

      <!-- Authenticated Candidate Context Banner -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; background: rgba(30, 41, 59, 0.45); border: 1px solid var(--border-subtle); padding: 0.85rem 1.25rem; border-radius: var(--radius-md); margin-bottom: 1.75rem;">
        <div style="display: flex; align-items: center; gap: 0.85rem;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan)); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.95rem; color: #FFF; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);">
            ${escapeHtml(candidateName.charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="font-weight: 600; color: #F8FAFC; font-size: 0.95rem; display: flex; align-items: center; gap: 0.5rem;">
              <span>${escapeHtml(candidateName)}</span>
              <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 0.7rem;">CANDIDATE</span>
            </div>
            <div style="font-size: 0.8rem; color: #94A3B8;">
              ${escapeHtml(candidateHeadline)} • ${escapeHtml(candidateEmail)}
            </div>
          </div>
        </div>
        <div style="font-size: 0.8rem; color: #64748B;">
          ${resumesList.length} ${resumesList.length === 1 ? 'version' : 'versions'} indexed
        </div>
      </div>

      <!-- Truth in AI Alert -->
      <div class="alert" style="background: rgba(59, 130, 246, 0.08); border-left: 4px solid #3b82f6; padding: 1.25rem; border-radius: 8px; margin-bottom: 2rem;">
        <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
          <span style="font-size: 1.25rem;">⚖️</span>
          <div>
            <strong style="color: #60a5fa; font-size: 0.95rem;">Evidence vs. Self-Reported Claim Separation</strong>
            <p style="color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; line-height: 1.5;">
              Uploaded resume statements, skills, and dates are treated as <strong>candidate-provided claims</strong> and are tagged with the explicit <span class="badge badge-claimed" style="font-size: 0.7rem;">CLAIMED [Unverified User Claim]</span> truth classification. They are <em>never</em> automatically marked as repository-verified without authentic code evidence.
            </p>
          </div>
        </div>
      </div>

      ${flashMessage ? `<div class="alert alert-success" style="margin-bottom: 1.5rem;">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom: 1.5rem;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Upload Zone -->
      <div class="card" style="margin-bottom: 2.5rem; background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);">
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">Upload Source Resume Version</h2>
        <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem;">
          Supported formats: <strong>PDF (.pdf)</strong>, <strong>Microsoft Word (.docx)</strong>, <strong>Plain Text (.txt, .md)</strong>. Maximum file size: <strong>10 MB</strong>.
        </p>

        <form action="/resumes/upload" method="POST" enctype="multipart/form-data">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
          
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 280px;">
              <input type="file" name="resumeFile" id="resumeFileInput" accept=".pdf,.docx,.txt,.md" required class="form-control" style="background: rgba(15, 23, 42, 0.6); padding: 0.6rem 0.8rem; border-color: rgba(148, 163, 184, 0.2);">
            </div>
            <button type="submit" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem;">
              <span>⬆ Upload & Parse Resume</span>
            </button>
          </div>

          <div style="margin-top: 0.75rem; display: flex; gap: 1.5rem; color: #64748b; font-size: 0.75rem;">
            <span>🔒 AES-256-GCM Encrypted Blob</span>
            <span>🛡️ Sandboxed AST Extraction</span>
            <span>🔑 Secret Scrubber Protected</span>
          </div>
        </form>
      </div>

      <!-- Resumes Version History -->
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem;">Resume Version History</h2>

        ${
          resumesList.length === 0
            ? `
          <div class="card" style="text-align: center; padding: 3.5rem 1.5rem; color: #94a3b8; border: 1px dashed rgba(148, 163, 184, 0.2);">
            <div style="font-size: 2.75rem; margin-bottom: 1rem;">📄</div>
            <h3 style="color: #f8fafc; font-size: 1.2rem; font-weight: 600; margin-bottom: 0.5rem;">No Source Resumes Uploaded Yet</h3>
            <p style="font-size: 0.9rem; max-width: 520px; margin: 0 auto 1.5rem auto; line-height: 1.6; color: #94a3b8;">
              Upload your existing resume (PDF, DOCX, TXT) above to seed your baseline candidate narrative, extract structured claims, and establish your active Base Resume for <strong>${escapeHtml(candidateName)}</strong>.
            </p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 100px;">Version</th>
                  <th>Original Filename</th>
                  <th>Size</th>
                  <th>Content Hash (SHA-256)</th>
                  <th>Lifecycle State</th>
                  <th>Uploaded</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${resumesList
                  .map(
                    (r) => `
                  <tr>
                    <td>
                      <span style="font-weight: 600; color: #38bdf8; font-family: monospace; font-size: 0.95rem;">
                        v${r.version}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 500; color: #f1f5f9;">${escapeHtml(r.fileName)}</div>
                      <div style="font-size: 0.75rem; color: #64748b;">${escapeHtml(r.mimeType)}</div>
                    </td>
                    <td style="color: #94a3b8; font-size: 0.875rem;">${formatBytes(r.fileSizeBytes)}</td>
                    <td>
                      <code style="font-size: 0.75rem; background: rgba(15, 23, 42, 0.6); padding: 0.2rem 0.4rem; border-radius: 4px; color: #cbd5e1;" title="${escapeHtml(r.contentHash)}">
                        ${escapeHtml(r.contentHash.slice(0, 12))}...
                      </code>
                    </td>
                    <td>
                      ${renderResumeStatusBadge(r.lifecycleState, r.isBaseResume)}
                    </td>
                    <td style="color: #94a3b8; font-size: 0.85rem;">
                      ${new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 0.5rem; align-items: center;">
                        <a href="/resumes/${escapeHtml(r.id)}" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem;">
                          Review Claims
                        </a>
                        <a href="/resumes/${escapeHtml(r.id)}/download" class="btn btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;" title="Download Decrypted Source">
                          ⬇
                        </a>
                        <form action="/resumes/${escapeHtml(r.id)}/delete" method="POST" onsubmit="return confirm('Are you sure you want to delete this resume version and its encrypted storage?');" style="display: inline;">
                          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                          <button type="submit" class="btn btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.8rem; color: #f87171;" title="Delete Version">
                            🗑
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `
        }
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Source Resumes & Document Lifecycle — Antigravity Career Hub',
    activeNav: 'resumes',
    content,
    user,
  });
}

/**
 * Renders the Resume Detail, Parsed Sections, and Claim Review Inspector.
 *
 * @param {object} params
 * @param {object} [params.user=null]
 * @param {object} [params.tenant=null]
 * @param {object} params.candidate
 * @param {object} params.resume
 * @param {Array<object>} params.sections
 * @param {Array<object>} params.claims
 * @param {string} [params.csrfToken]
 * @param {string} [params.flashMessage]
 * @param {string} [params.errorMessage]
 * @returns {string}
 */
export function renderResumeDetailPage({
  user = null,
  tenant: _tenant = null,
  candidate = null,
  resume,
  sections = [],
  claims = [],
  csrfToken = '',
  flashMessage = '',
  errorMessage = '',
}) {
  const skillClaims = claims.filter((c) => c.claimType === 'SKILL');

  const content = `
    <div style="margin-bottom: 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
            <a href="/resumes" style="color: #38bdf8; text-decoration: none; font-size: 0.875rem;">← Back to Resumes</a>
            <span style="color: #64748b;">/</span>
            <span style="color: #94a3b8; font-size: 0.875rem;">Resume Version ${resume.version}</span>
          </div>
          <h1 style="font-size: 1.75rem; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <span>${escapeHtml(resume.fileName)}</span>
            <span style="font-size: 0.9rem; font-weight: 400;">(v${resume.version})</span>
            ${renderResumeStatusBadge(resume.lifecycleState, resume.isBaseResume)}
          </h1>
        </div>

        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <a href="/resumes/${escapeHtml(resume.id)}/download" class="btn btn-secondary" style="display: inline-flex; align-items: center; gap: 0.5rem;">
            <span>⬇ Download Decrypted Source</span>
          </a>
        </div>
      </div>

      ${flashMessage ? `<div class="alert alert-success" style="margin-bottom: 1.5rem;">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error" style="margin-bottom: 1.5rem;">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Metadata summary bar -->
      <div class="card" style="margin-bottom: 2rem; background: rgba(15, 23, 42, 0.6); padding: 1.25rem;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem;">
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">File Size</div>
            <div style="font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-top: 0.25rem;">${formatBytes(resume.fileSizeBytes)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">MIME Format</div>
            <div style="font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-top: 0.25rem;">${escapeHtml(resume.mimeType)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Parsed Sections</div>
            <div style="font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-top: 0.25rem;">${sections.length} sections</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Extracted Claims</div>
            <div style="font-size: 1rem; font-weight: 600; color: #f1f5f9; margin-top: 0.25rem;">${claims.length} assertions</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">SHA-256 Hash</div>
            <div style="font-size: 0.8rem; font-family: monospace; color: #38bdf8; margin-top: 0.25rem;" title="${escapeHtml(resume.contentHash)}">
              ${escapeHtml(resume.contentHash.slice(0, 16))}...
            </div>
          </div>
        </div>
      </div>

      <!-- Review & Promotion Form -->
      <div class="card" style="margin-bottom: 2rem; border-color: rgba(56, 189, 248, 0.3);">
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">Review & Promote Candidate Claims</h2>
        <p style="color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem;">
          Approve parsed claims to integrate them into your candidate profile. Approved skills will be marked with the <span class="badge badge-claimed">CLAIMED</span> truth classification and can serve as your active Base Resume narrative.
        </p>

        <form action="/resumes/${escapeHtml(resume.id)}/approve" method="POST">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

          <div style="margin-bottom: 1.5rem;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; color: #f8fafc; font-weight: 500;">
              <input type="checkbox" name="promoteToBase" value="true" ${resume.isBaseResume ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #38bdf8;">
              <span>Set this resume version as my active <strong>Base Resume</strong></span>
            </label>
            <div style="color: #64748b; font-size: 0.8rem; margin-left: 2rem; margin-top: 0.25rem;">
              Your Base Resume serves as the foundational source narrative for ATS job tailoring.
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="form-group">
              <label class="form-label" for="headlineInput">Candidate Professional Headline</label>
              <input type="text" id="headlineInput" name="headline" class="form-control" value="${escapeHtml(candidate?.headline || '')}" placeholder="e.g. Senior Distributed Systems Engineer">
            </div>
            <div class="form-group">
              <label class="form-label" for="bioInput">Candidate Bio Narrative Summary</label>
              <textarea id="bioInput" name="bio" class="form-control form-textarea" rows="2" placeholder="Brief career narrative...">${escapeHtml(candidate?.bio || '')}</textarea>
            </div>
          </div>

          ${
            skillClaims.length > 0
              ? `
            <div style="margin-bottom: 1.5rem;">
              <label class="form-label" style="margin-bottom: 0.75rem; display: block;">
                Extracted Skills from Resume (${skillClaims.length} found)
              </label>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 200px; overflow-y: auto; padding: 0.75rem; background: rgba(15, 23, 42, 0.6); border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.1);">
                ${skillClaims
                  .map(
                    (sc) => `
                  <label style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(30, 41, 59, 0.8); padding: 0.35rem 0.7rem; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.2); cursor: pointer; font-size: 0.85rem; color: #f1f5f9;">
                    <input type="checkbox" name="approvedSkillClaims" value="${escapeHtml(sc.statement)}" checked style="accent-color: #38bdf8;">
                    <span>${escapeHtml(sc.statement)}</span>
                  </label>
                `
                  )
                  .join('')}
              </div>
            </div>
          `
              : ''
          }

          <button type="submit" class="btn btn-primary" style="padding: 0.75rem 1.75rem;">
            <span>✓ Save & Confirm Claims</span>
          </button>
        </form>
      </div>

      <!-- Parsed Sections Breakdown -->
      <div style="margin-bottom: 2.5rem;">
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem;">Parsed Resume Sections</h2>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${sections
            .map(
              (sec) => `
            <div class="card" style="background: rgba(15, 23, 42, 0.5);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1); padding-bottom: 0.5rem;">
                <h3 style="font-size: 1rem; font-weight: 600; color: #38bdf8; text-transform: uppercase;">${escapeHtml(sec.sectionType)}</h3>
                <span style="color: #64748b; font-size: 0.75rem;">Order #${sec.orderIndex}</span>
              </div>
              <div style="color: #cbd5e1; font-size: 0.875rem; white-space: pre-wrap; line-height: 1.6; font-family: inherit;">${escapeHtml(sec.rawText)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Extracted Claims Table -->
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 1rem;">Extracted Self-Reported Claims</h2>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 120px;">Claim Type</th>
                <th>Statement</th>
                <th>Context / Origin</th>
                <th>Truth Classification</th>
              </tr>
            </thead>
            <tbody>
              ${claims
                .map(
                  (c) => `
                <tr>
                  <td>
                    <span style="font-weight: 600; color: #94a3b8; font-size: 0.8rem;">
                      ${escapeHtml(c.claimType)}
                    </span>
                  </td>
                  <td style="color: #f1f5f9; font-size: 0.875rem; font-weight: 500;">
                    ${escapeHtml(c.statement)}
                  </td>
                  <td style="color: #64748b; font-size: 0.8rem;">
                    ${escapeHtml(c.context || 'Resume extraction')}
                  </td>
                  <td>
                    <span class="badge badge-claimed">
                      CLAIMED [Unverified User Claim]
                    </span>
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  return renderLayout({
    title: `Resume v${resume.version} Review — Antigravity Career Hub`,
    activeNav: 'resumes',
    content,
    user,
  });
}
