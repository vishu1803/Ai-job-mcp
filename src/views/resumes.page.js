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
    return `<span class="badge badge-verified">★ BASE RESUME</span>`;
  }
  switch (status) {
    case 'USER_APPROVED':
      return `<span class="badge badge-verified">APPROVED</span>`;
    case 'PARSED':
      return `<span class="badge badge-inferred">PARSED (AWAITING REVIEW)</span>`;
    case 'SOURCE':
      return `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3);">SOURCE UPLOAD</span>`;
    case 'ARCHIVED':
      return `<span class="badge badge-missing">ARCHIVED</span>`;
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
    <div class="container">
      <!-- Back Navigation -->
      <a href="/dashboard" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Dashboard
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <span class="current">Resumes</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Resume &amp; Career Document Ingestion Pipeline</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">AES-256-GCM Encrypted Storage</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step active">Source Resume (PDF/DOCX/TXT)</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Sandboxed Parser</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Structured Sections</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Self-Reported Claims [CLAIMED]</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Base Resume &amp; AI Profile</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <span class="badge badge-indigo" style="margin-bottom:8px;">RESUME MANAGEMENT</span>
          <h1 style="margin:4px 0 8px 0; font-size:1.75rem; font-weight:800; letter-spacing:-0.02em;">Source Resumes &amp; Career Documents</h1>
          <p style="color:var(--text-muted); margin:0; font-size:0.875rem;">
            Upload your source resume (PDF, DOCX, TXT) to establish your baseline narrative. Documents are stored with AES-256-GCM encryption and parsed with strict truth separation.
          </p>
        </div>
      </div>

      <!-- Authenticated Candidate Context Banner -->
      <div class="context-banner">
        <div class="context-banner-inner">
          <div class="context-banner-avatar">
            ${escapeHtml(candidateName.charAt(0).toUpperCase())}
          </div>
          <div>
            <div class="context-banner-meta">
              <span>${escapeHtml(candidateName)}</span>
              <span class="badge badge-indigo" style="font-size:0.7rem;">CANDIDATE</span>
            </div>
            <div class="context-banner-sub">
              ${escapeHtml(candidateHeadline)} &bull; ${escapeHtml(candidateEmail)}
            </div>
          </div>
        </div>
        <div style="font-size:0.8rem; color:var(--text-dim); font-family:var(--font-mono);">
          ${resumesList.length} ${resumesList.length === 1 ? 'version' : 'versions'} indexed
        </div>
      </div>

      ${flashMessage ? `<div class="alert alert-success">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Truth in AI Alert -->
      <div class="card" style="margin-bottom:2rem; padding:20px; background:#111827; border:1px solid var(--border-subtle);">
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <span class="badge badge-indigo" style="font-size:0.7rem; flex-shrink:0; margin-top:2px;">TRUTH BOUNDARY</span>
          <div>
            <strong style="color:var(--text-main); font-size:0.925rem;">Evidence vs. Self-Reported Claim Separation</strong>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:6px 0 0 0; line-height:1.5;">
              Uploaded resume statements, skills, and dates are treated as <strong>candidate-provided claims</strong> and are tagged with the explicit <span class="badge badge-claimed" style="font-size:0.7rem;">CLAIMED [Unverified User Claim]</span> truth classification. They are <em>never</em> automatically marked as repository-verified without authentic code evidence.
            </p>
          </div>
        </div>
      </div>

      <!-- Upload Zone -->
      <div class="card" style="margin-bottom:2.5rem; padding:28px;">
        <div class="section-header" style="margin-bottom:12px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Upload Source Resume Version</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:4px 0 0 0; line-height:1.5;">
              Supported formats: <strong>PDF (.pdf)</strong>, <strong>Microsoft Word (.docx)</strong>, <strong>Plain Text (.txt, .md)</strong>. Maximum file size: <strong>10 MB</strong>.
            </p>
          </div>
        </div>

        <div id="resumeDropzone" style="border:1px dashed rgba(255,255,255,0.18); background:rgba(0,0,0,0.15); border-radius:var(--radius-md); padding:24px; margin-top:16px;">
          <form action="/resumes/upload" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

            <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap;">
              <div style="flex:1; min-width:280px;">
                <input type="file" name="resumeFile" id="resumeFileInput" accept=".pdf,.docx,.txt,.md" required class="form-control" style="background:#0B0F19;">
              </div>
              <button type="submit" class="btn btn-primary" style="padding:0.75rem 1.5rem;">
                Upload &amp; Parse Resume
              </button>
            </div>

            <div style="margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.04); display:flex; gap:1.25rem; flex-wrap:wrap; color:var(--text-dim); font-size:0.75rem;">
              <span>AES-256-GCM Encrypted</span>
              <span>&bull;</span>
              <span>Sandboxed AST Extraction</span>
              <span>&bull;</span>
              <span>Secret Scrubber Protected</span>
            </div>
          </form>
        </div>
      </div>

      <!-- Resumes Version History -->
      <div>
        <div class="section-header" style="margin-bottom:16px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Resume Version History</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px; margin-bottom:0;">Chronological record of candidate resume snapshots and parsing states.</p>
          </div>
          <span class="badge badge-cyan" style="font-size:0.75rem;">${resumesList.length} ${resumesList.length === 1 ? 'version' : 'versions'}</span>
        </div>

        ${
          resumesList.length === 0
            ? `
          <div class="empty-state">
            <div class="empty-state-icon" style="font-size:1.5rem; opacity:0.6;">∅</div>
            <h3 style="margin-top:8px;">No Source Resumes Uploaded Yet</h3>
            <p>
              Upload your existing resume (PDF, DOCX, TXT) above to seed your baseline candidate narrative, extract structured claims, and establish your active Base Resume for <strong>${escapeHtml(candidateName)}</strong>.
            </p>
          </div>
        `
            : `
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 90px;">Version</th>
                  <th>Original Filename</th>
                  <th style="width: 90px;">Size</th>
                  <th style="width: 170px;">SHA-256 Digest</th>
                  <th style="width: 170px;">Lifecycle State</th>
                  <th style="width: 120px;">Uploaded</th>
                  <th style="text-align: right; width: 180px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${resumesList
                  .map(
                    (r) => `
                  <tr>
                    <td>
                      <span style="font-weight: 700; color: var(--accent-indigo); font-family: var(--font-mono); font-size: 0.875rem;">
                        v${r.version}
                      </span>
                    </td>
                    <td>
                      <div style="font-weight: 600; color: var(--text-main); font-size: 0.875rem;">${escapeHtml(r.fileName)}</div>
                      <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); margin-top:2px;">${escapeHtml(r.mimeType)}</div>
                    </td>
                    <td style="color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);">${formatBytes(r.fileSizeBytes)}</td>
                    <td>
                      <code style="font-size: 0.75rem; color: var(--text-muted);" title="${escapeHtml(r.contentHash)}">
                        ${escapeHtml(r.contentHash.slice(0, 12))}...
                      </code>
                    </td>
                    <td>
                      ${renderResumeStatusBadge(r.lifecycleState, r.isBaseResume)}
                    </td>
                    <td style="color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-mono);">
                      ${new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 0.5rem; align-items: center;">
                        <a href="/resumes/${escapeHtml(r.id)}" class="btn btn-secondary btn-sm" style="font-size: 0.78rem;">
                          Review Claims
                        </a>
                        <a href="/resumes/${escapeHtml(r.id)}/download" class="btn btn-secondary btn-sm" style="font-size: 0.78rem;" title="Download Decrypted Source">
                          Download
                        </a>
                        <form action="/resumes/${escapeHtml(r.id)}/delete" method="POST" onsubmit="return confirm('Are you sure you want to delete this resume version and its encrypted storage?');" style="display: inline;">
                          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
                          <button type="submit" class="btn btn-secondary btn-sm" style="font-size: 0.78rem; color: #f87171;" title="Delete Version">
                            Delete
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
    title: 'Source Resumes & Documents',
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
  const claimTypeCounts = {};
  for (const c of claims) {
    claimTypeCounts[c.claimType] = (claimTypeCounts[c.claimType] || 0) + 1;
  }
  const claimTypeLabels = {
    SKILL: 'Skill Claims',
    EXPERIENCE: 'Experience Claims',
    EDUCATION: 'Education Claims',
    PROJECT: 'Project Claims',
    CERTIFICATION: 'Certification Claims',
    CONTACT: 'Contact & Links',
    SUMMARY: 'Summary Claims',
  };

  const content = `
    <div class="container" style="max-width:960px;">
      <!-- Back Navigation -->
      <a href="/resumes" class="back-nav-link">
        <span aria-hidden="true">←</span> Back to Resumes
      </a>

      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a href="/dashboard">Overview</a>
        <span class="separator">/</span>
        <a href="/resumes">Resumes</a>
        <span class="separator">/</span>
        <span class="current">v${resume.version} — ${escapeHtml(resume.fileName)}</span>
      </div>

      <!-- Architecture Pipeline Banner -->
      <div class="pipeline-banner">
        <div class="pipeline-header">
          <span class="pipeline-title">Resume &amp; Career Document Ingestion Pipeline</span>
          <span style="font-size:0.75rem; color:var(--text-dim);">Sandboxed AST Text Extraction</span>
        </div>
        <div class="pipeline-steps">
          <div class="pipeline-step">Source: ${escapeHtml(resume.fileName)}</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Multi-Format Parser</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active">${sections.length} Parsed Sections</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step active">${claims.length} Extracted Claims [CLAIMED]</div>
          <span class="pipeline-arrow">→</span>
          <div class="pipeline-step">Base Resume Narrative</div>
        </div>
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 style="font-size:1.75rem; display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin:4px 0 8px 0; font-weight:800; letter-spacing:-0.02em;">
            <span>${escapeHtml(resume.fileName)}</span>
            <span style="font-size:0.9rem; font-weight:400; color:var(--text-muted);">(v${resume.version})</span>
            ${renderResumeStatusBadge(resume.lifecycleState, resume.isBaseResume)}
          </h1>
        </div>

        <a href="/resumes/${escapeHtml(resume.id)}/download" class="btn btn-secondary btn-sm">
          Download Decrypted Source
        </a>
      </div>

      ${flashMessage ? `<div class="alert alert-success">${escapeHtml(flashMessage)}</div>` : ''}
      ${errorMessage ? `<div class="alert alert-error">${escapeHtml(errorMessage)}</div>` : ''}

      <!-- Metadata summary bar -->
      <div class="card" style="margin-bottom:2rem; padding:1.25rem;">
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:1rem;">
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">File Size</div>
            <div style="font-size:1rem; font-weight:600; color:var(--text-main); font-family:var(--font-mono); margin-top:4px;">${formatBytes(resume.fileSizeBytes)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">MIME Format</div>
            <div style="font-size:1rem; font-weight:600; color:var(--text-main); font-family:var(--font-mono); margin-top:4px;">${escapeHtml(resume.mimeType)}</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Parsed Sections</div>
            <div style="font-size:1rem; font-weight:600; color:var(--text-main); margin-top:4px;">${sections.length} sections</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Extracted Claims</div>
            <div style="font-size:1rem; font-weight:600; color:var(--text-main); margin-top:4px;">${claims.length} assertions</div>
          </div>
          <div>
            <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">SHA-256 Hash</div>
            <div style="font-size:0.8rem; font-family:var(--font-mono); color:var(--accent-cyan); margin-top:4px;" title="${escapeHtml(resume.contentHash)}">
              ${escapeHtml(resume.contentHash.slice(0, 16))}...
            </div>
          </div>
        </div>
      </div>

      <!-- Review & Promotion Form -->
      <div class="card" style="margin-bottom:2rem; padding:28px;">
        <div class="section-header" style="margin-bottom:12px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Review &amp; Promote Candidate Claims</h2>
            <p style="color:var(--text-muted); font-size:0.85rem; margin:4px 0 0 0; line-height:1.5;">
              Approve parsed claims to integrate them into your candidate profile. Approved skills will be marked with the <span class="badge badge-claimed">CLAIMED</span> truth classification and can serve as your active Base Resume narrative.
            </p>
          </div>
        </div>

        <form action="/resumes/${escapeHtml(resume.id)}/approve" method="POST">
          <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

          <div style="margin-bottom: 1.5rem; padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 0.9rem;">
              <input type="checkbox" name="promoteToBase" value="true" ${resume.isBaseResume ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-indigo); cursor:pointer;">
              <span>Set this resume version as my active <strong>Base Resume</strong></span>
            </label>
            <div style="color: var(--text-dim); font-size: 0.8rem; margin-left: 2rem; margin-top: 0.25rem;">
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
              <label class="form-label" style="margin-bottom: 0.75rem; display: block; font-weight:600;">
                Extracted Skills from Resume (${skillClaims.length} found)
              </label>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; max-height: 200px; overflow-y: auto; padding: 0.75rem; background: rgba(0, 0, 0, 0.2); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                ${skillClaims
                  .map(
                    (sc) => `
                  <label style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(255, 255, 255, 0.04); padding: 0.35rem 0.7rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); cursor: pointer; font-size: 0.825rem; color: var(--text-main);">
                    <input type="checkbox" name="approvedSkillClaims" value="${escapeHtml(sc.statement)}" checked style="accent-color: var(--accent-indigo); cursor:pointer;">
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
            <span>Save &amp; Confirm Claims</span>
          </button>
        </form>
      </div>

      <!-- Parsed Sections Breakdown -->
      <div style="margin-bottom:2.5rem;">
        <div class="section-header" style="margin-bottom:1rem;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0;">Parsed Resume Sections</h2>
            <p style="font-size:0.85rem; color:var(--text-dim); margin-top:2px; margin-bottom:0;">Structured document blocks parsed from source file.</p>
          </div>
          <span class="badge badge-cyan" style="font-size:0.75rem;">${sections.length} ${sections.length === 1 ? 'section' : 'sections'}</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:1rem;">
          ${sections
            .map(
              (sec) => `
            <div class="card" style="padding:20px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border-subtle);">
                <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-main); text-transform:uppercase; letter-spacing:0.04em; margin:0;">${escapeHtml(sec.sectionType)}</h3>
                <span style="color:var(--text-dim); font-size:0.75rem; font-family:var(--font-mono);">Order #${sec.orderIndex}</span>
              </div>
              ${
                sec.structuredData?.skills && Array.isArray(sec.structuredData.skills)
                  ? `
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
                  ${sec.structuredData.skills
                    .map(
                      (sk) =>
                        `<span class="tag" style="background:rgba(99,102,241,0.12); color:var(--text-main); border-color:rgba(99,102,241,0.25); font-size:0.75rem;">${escapeHtml(sk)}</span>`
                    )
                    .join(' ')}
                </div>
              `
                  : ''
              }
              ${
                sec.structuredData?.github ||
                sec.structuredData?.linkedin ||
                sec.structuredData?.email
                  ? `
                <div style="display:flex; flex-wrap:wrap; gap:14px; margin-bottom:10px; font-size:0.8rem; font-family:var(--font-mono);">
                  ${sec.structuredData.github ? `<span><span style="color:var(--text-dim);">github:</span> <a href="${escapeHtml(sec.structuredData.github)}" target="_blank" rel="noopener" style="color:var(--accent-indigo); text-decoration:none;">${escapeHtml(sec.structuredData.github)}</a></span>` : ''}
                  ${sec.structuredData.linkedin ? `<span><span style="color:var(--text-dim);">linkedin:</span> <a href="${escapeHtml(sec.structuredData.linkedin)}" target="_blank" rel="noopener" style="color:var(--accent-indigo); text-decoration:none;">${escapeHtml(sec.structuredData.linkedin)}</a></span>` : ''}
                  ${sec.structuredData.email ? `<span><span style="color:var(--text-dim);">email:</span> ${escapeHtml(sec.structuredData.email)}</span>` : ''}
                </div>
              `
                  : ''
              }
              <div style="color:var(--text-muted); font-size:0.875rem; white-space:pre-wrap; line-height:1.6;">${escapeHtml(sec.rawText)}</div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Extracted Claims Section -->
      <div class="card" style="padding:24px; margin-top:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:1rem; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <h2 style="font-size:1.2rem; font-weight:700; color:var(--text-main); margin:0; display:flex; align-items:center; gap:8px;">
              <span>Extracted Self-Reported Claims</span>
              <span class="badge badge-claimed" style="font-size:0.75rem;">${claims.length} ${claims.length === 1 ? 'claim' : 'claims'}</span>
            </h2>
            <p style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 0 0;">
              Atomic facts and skills extracted from your resume. Unverified until corroborated against connected repository source code.
            </p>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <input
              type="text"
              id="claimSearchInput"
              placeholder="Search claims..."
              style="padding:6px 12px; font-size:0.8rem; background:rgba(0,0,0,0.25); border:1px solid var(--border-subtle); border-radius:var(--radius-md); color:var(--text-main); outline:none; min-width:200px;"
              oninput="filterClaimsTable()"
            />
          </div>
        </div>

        ${
          claims.length > 0
            ? `
        <!-- Interactive Category Filter Tabs -->
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:1.25rem;" id="claimFilterTabs">
          <button
            type="button"
            class="btn btn-secondary btn-sm claim-tab-btn active"
            data-filter="ALL"
            onclick="setClaimFilter('ALL', this)"
            style="font-size:0.75rem; padding:4px 10px;"
          >
            All (${claims.length})
          </button>
          ${Object.entries(claimTypeCounts)
            .map(
              ([type, count]) => `
            <button
              type="button"
              class="btn btn-secondary btn-sm claim-tab-btn"
              data-filter="${escapeHtml(type)}"
              onclick="setClaimFilter('${escapeHtml(type)}', this)"
              style="font-size:0.75rem; padding:4px 10px;"
            >
              ${escapeHtml(claimTypeLabels[type] || type)} (${count})
            </button>
          `
            )
            .join('')}
        </div>

        <div class="table-responsive">
          <table class="data-table" id="claimsTable">
            <thead>
              <tr>
                <th style="width:130px;">Claim Type</th>
                <th>Statement</th>
                <th style="width:240px;">Context / Origin</th>
                <th style="width:180px;">Truth Classification</th>
              </tr>
            </thead>
            <tbody>
              ${claims
                .map((c) => {
                  const cleanContext = (c.context || 'Resume extraction')
                    .replace(/\s*\[Unverified User Claim\]/gi, '')
                    .trim();

                  const meta = c.metadata || {};

                  // Scope badge styling
                  let scopeBadge = '';
                  if (meta.scope) {
                    const scopeColors = {
                      HYBRID:
                        'background:rgba(99,102,241,0.12); color:#a5b4fc; border:1px solid rgba(99,102,241,0.25);',
                      GLOBAL:
                        'background:rgba(56,189,248,0.12); color:#7dd3fc; border:1px solid rgba(56,189,248,0.25);',
                      PROJECT_SCOPED:
                        'background:rgba(245,158,11,0.12); color:#fcd34d; border:1px solid rgba(245,158,11,0.25);',
                      EXPERIENCE_SCOPED:
                        'background:rgba(16,185,129,0.12); color:#6ee7b7; border:1px solid rgba(16,185,129,0.25);',
                    };
                    const style =
                      scopeColors[meta.scope] ||
                      'background:rgba(255,255,255,0.06); color:var(--text-muted);';
                    scopeBadge = `<span style="font-size:0.68rem; padding:2px 6px; border-radius:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; ${style}">${escapeHtml(meta.scope)}</span>`;
                  }

                  // Occurrence badge
                  let occurrenceBadge = '';
                  if (meta.occurrenceCount && meta.occurrenceCount > 1) {
                    occurrenceBadge = `<span style="font-size:0.68rem; background:rgba(255,255,255,0.06); border:1px solid var(--border-subtle); color:var(--text-main); padding:2px 6px; border-radius:4px; font-weight:600; font-family:var(--font-mono);">${meta.occurrenceCount} mentions</span>`;
                  }

                  // Linked technologies tags (for projects or experience)
                  const techs = meta.technologies || meta.technologiesUsed || [];
                  const techTags =
                    Array.isArray(techs) && techs.length > 0
                      ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">
                        ${techs.map((t) => `<span style="font-size:0.7rem; background:rgba(0,0,0,0.3); border:1px solid var(--border-subtle); padding:1px 6px; border-radius:3px; color:var(--text-dim);">${escapeHtml(typeof t === 'string' ? t : t.name || t.slug)}</span>`).join('')}
                      </div>`
                      : '';

                  return `
                <tr class="claim-row" data-type="${escapeHtml(c.claimType)}">
                  <td>
                    <span class="tag" style="font-weight:600; font-size:0.725rem; text-transform:uppercase; letter-spacing:0.04em; display:inline-block;">
                      ${escapeHtml(c.claimType)}
                    </span>
                  </td>
                  <td style="color:var(--text-main); font-size:0.875rem; font-weight:500; line-height:1.5;">
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                      <span>${escapeHtml(c.statement)}</span>
                      ${occurrenceBadge}
                      ${scopeBadge}
                    </div>
                    ${techTags}
                  </td>
                  <td style="color:var(--text-dim); font-size:0.8rem; line-height:1.4;">
                    ${escapeHtml(cleanContext)}
                  </td>
                  <td>
                    <span class="badge badge-claimed" style="font-size:0.72rem;">
                      CLAIMED [Unverified User Claim]
                    </span>
                  </td>
                </tr>
              `;
                })
                .join('')}
            </tbody>
          </table>
        </div>

        <script>
          let activeClaimType = 'ALL';

          function setClaimFilter(type, btn) {
            activeClaimType = type;
            document.querySelectorAll('#claimFilterTabs .claim-tab-btn').forEach(b => {
              b.classList.remove('active');
              b.style.borderColor = 'var(--border-subtle)';
            });
            btn.classList.add('active');
            btn.style.borderColor = 'var(--accent-cyan)';
            filterClaimsTable();
          }

          function filterClaimsTable() {
            const query = (document.getElementById('claimSearchInput')?.value || '').toLowerCase().trim();
            const rows = document.querySelectorAll('#claimsTable tbody tr.claim-row');

            rows.forEach(row => {
              const rowType = row.getAttribute('data-type') || '';
              const rowText = row.innerText.toLowerCase();

              const matchesType = activeClaimType === 'ALL' || rowType === activeClaimType;
              const matchesSearch = !query || rowText.includes(query);

              if (matchesType && matchesSearch) {
                row.style.display = '';
              } else {
                row.style.display = 'none';
              }
            });
          }
        </script>
        `
            : `
        <div class="alert alert-info" style="margin-bottom:1rem;">
          <strong>No structured claims were extracted.</strong> This can happen when the resume format lacks standard section headings (e.g., "Skills", "Experience", "Education") or when the parser cannot identify structured entries. The raw parsed sections above still contain your resume content. Supported section headings: Skills, Work Experience, Education, Projects, Certifications, Summary.
        </div>
        `
        }
      </div>
    </div>
  `;

  return renderLayout({
    title: `Resume v${resume.version} Review`,
    activeNav: 'resumes',
    content,
    user,
  });
}
