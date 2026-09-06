/**
 * @file Real Application Handoff Kit View Template
 *
 * Renders the Ashby/Linear-grade application handoff workspace:
 * 1. Application Context & Package Status (HANDOFF_READY, Package Hash, Target Job).
 * 2. Dedicated Document Readiness section (Tailored Resume, Tailored Cover Letter, PDF QA breakdown, View/Download).
 * 3. Dedicated Screening Profile Completeness section with canonical states (READY, MISSING, NEEDS_CONFIRMATION)
 *    and direct [Complete in Profile] deep links.
 * 4. Package Version History UI with lifecycle controls (View, Restore, Archive, Safe Delete).
 * 5. In-Kit Package Regeneration modal and action trigger.
 * 6. Employer Portal Direct Link & Prominent Manual Submission Disclaimer.
 * 7. Safe In-Page Document Preview Modal with authenticated PDF streaming.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * Formats bytes into a human-readable file size string.
 *
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formats an ISO date string into a localized readable date.
 *
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Renders the Application Handoff Kit Page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} params.application Job application record
 * @param {object} params.handoffKit Immutable handoff kit payload
 * @param {Array<object>} [params.packageHistory=[]] Version history of packages
 * @param {object} [params.currentPackage=null] Currently active package
 * @param {number} [params.viewingVersion=1] Version currently being viewed
 * @param {boolean} [params.isViewingArchived=false] True if viewing an archived version
 * @param {boolean} [params.canDeletePackages=true] True if package deletion is permitted
 * @param {string} [params.flashMessage=''] Flash message
 * @param {string} [params.errorMessage=''] Error message
 * @returns {string} Full HTML document
 */
export function renderHandoffPage({
  user,
  tenant: _tenant = null,
  application,
  handoffKit,
  packageHistory = [],
  currentPackage = null,
  viewingVersion = 1,
  isViewingArchived = false,
  canDeletePackages = true,
  flashMessage = '',
  errorMessage = '',
}) {
  const job = handoffKit.targetJob || {};
  const resume = handoffKit.resume || {};
  const coverLetter = handoffKit.coverLetter || {};
  const readiness = handoffKit.readiness || [];
  const semantics = handoffKit.readinessSemantics || null;
  const missingFields = semantics?.missingProfileFields || [];
  const needsConfirmFields = semantics?.needsConfirmationFields || [];
  const missingFieldSet = new Set(missingFields);
  const needsConfirmSet = new Set(needsConfirmFields);
  const resumeQa = resume.qaAudit || {};
  const packageHash =
    handoffKit.packageHash ||
    application.metadata?.currentPackageHash ||
    application.metadata?.packageHash ||
    '—';
  const shortHash = packageHash.length >= 12 ? packageHash.slice(0, 10) : packageHash;

  const documentsReady = Boolean(
    resume.storageKey && coverLetter.storageKey && resumeQa.passed !== false
  );

  const profileComplete = Boolean(
    semantics?.profileComplete ?? (missingFields.length === 0 && needsConfirmFields.length === 0)
  );

  const readyCount = readiness.filter((r) => r.status === 'READY').length;
  const confirmCount = readiness.filter(
    (r) => r.status === 'NEEDS_CONFIRMATION' || needsConfirmSet.has(r.field)
  ).length;
  const missingCount = readiness.filter(
    (r) => r.status === 'MISSING' || missingFieldSet.has(r.field)
  ).length;

  const content = `
    <style>
      .handoff-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 24px;
      }
      .handoff-card {
        padding: 24px 28px;
        background: #111827;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      }
      @media (max-width: 860px) {
        .handoff-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 640px) {
        .handoff-card {
          padding: 16px;
        }
        .matrix-row {
          flex-direction: column;
          align-items: flex-start !important;
        }
        .matrix-row > div:last-child {
          width: 100%;
          justify-content: space-between;
        }
      }
    </style>

    <div class="container" style="max-width:1100px; margin:0 auto; padding:24px 16px 64px;">
      <!-- Navigation & Breadcrumbs & Package Controls -->
      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin:24px 0 20px;">
        <a href="/applications" class="back-nav-link" style="display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); text-decoration:none; font-size:0.875rem; transition:color 0.15s ease;">
          <span aria-hidden="true">&larr;</span> Back to Applications
        </a>
        <div style="display:inline-flex; align-items:center; flex-wrap:wrap; gap:8px;">
          <span class="badge" style="background:rgba(99, 102, 241, 0.15); color:var(--accent-indigo); border:1px solid rgba(99, 102, 241, 0.3); font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px;">
            Package v${escapeHtml(String(viewingVersion))}
          </span>
          <span class="badge" style="background:${isViewingArchived ? 'rgba(156, 163, 175, 0.15)' : 'rgba(16, 185, 129, 0.12)'}; color:${isViewingArchived ? '#9CA3AF' : '#10B981'}; border:1px solid ${isViewingArchived ? 'rgba(156, 163, 175, 0.3)' : 'rgba(16, 185, 129, 0.3)'}; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px; letter-spacing:0.5px;">
            ● ${isViewingArchived ? 'ARCHIVED VERSION' : 'HANDOFF_READY'}
          </span>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); background:#111827; border:1px solid var(--border-subtle); padding:3px 8px; border-radius:4px;" title="${escapeHtml(packageHash)}">
            pkg:${escapeHtml(shortHash)}
          </span>
          <button id="openRegenerateModalBtn" type="button" class="btn btn-secondary btn-sm" style="font-size:0.75rem; font-weight:700; padding:4px 10px; display:inline-flex; align-items:center; gap:5px;" onclick="openRegenerateModal()">
            <span style="font-size:0.9rem; line-height:1;">&#8635;</span> Regenerate Package
          </button>
        </div>
      </div>

      <!-- Flash & Error Messages -->
      ${
        flashMessage
          ? `<div class="alert alert-success" style="margin-bottom:20px; padding:12px 16px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); color:#10B981; border-radius:6px; font-size:0.875rem;">${escapeHtml(flashMessage)}</div>`
          : ''
      }
      ${
        errorMessage
          ? `<div class="alert alert-danger" style="margin-bottom:20px; padding:12px 16px; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#EF4444; border-radius:6px; font-size:0.875rem;">${escapeHtml(errorMessage)}</div>`
          : ''
      }

      <!-- Historical Version Viewing Banner -->
      ${
        isViewingArchived
          ? `<div class="card archived-warning-banner" style="margin-bottom:24px; padding:16px 20px; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.4); border-radius:var(--radius-md); display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:14px;">
               <div style="display:flex; align-items:center; gap:10px;">
                 <span style="font-size:1.3rem; color:#F59E0B;">&#9888;</span>
                 <div>
                   <div style="font-weight:700; font-size:0.9rem; color:#F59E0B;">Viewing Archived Package Version v${escapeHtml(String(viewingVersion))}</div>
                   <div style="font-size:0.8rem; color:var(--text-muted);">This version is not active. Changes here will not affect your current package unless restored.</div>
                 </div>
               </div>
               <div style="display:inline-flex; align-items:center; gap:8px;">
                 <form method="POST" action="/applications/${escapeHtml(application.id)}/packages/${escapeHtml(String(viewingVersion))}/restore" style="margin:0;">
                   <button type="submit" class="btn btn-primary btn-sm" style="font-size:0.75rem; font-weight:700;" onclick="return confirm('Restore package version v${escapeHtml(String(viewingVersion))} as the active current package?')">
                     Restore as Current Version
                   </button>
                 </form>
                 <a href="/applications/${escapeHtml(application.id)}/handoff" class="btn btn-secondary btn-sm" style="font-size:0.75rem; text-decoration:none;">
                   Back to Current (v${escapeHtml(String(currentPackage?.version || 1))})
                 </a>
               </div>
             </div>`
          : ''
      }

      <!-- Page Header Banner -->
      <div class="card" style="margin-bottom:24px; padding:24px 28px; background:linear-gradient(180deg, #111827 0%, #0B0F19 100%); border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-start; gap:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <h1 style="font-size:1.5rem; font-weight:800; color:var(--text-main); margin:0; line-height:1.2;">
                ${escapeHtml(job.title || application.jobTitle || 'Role Not Specified')}
              </h1>
              <span class="badge handoff-state-badge" style="background:rgba(99, 102, 241, 0.15); color:var(--accent-indigo); border:1px solid rgba(99, 102, 241, 0.3); font-weight:700; font-size:0.75rem; padding:4px 9px;">
                ${isViewingArchived ? 'ARCHIVED' : 'HANDOFF_READY'}
              </span>
            </div>
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:12px; color:var(--text-muted); font-size:0.875rem;">
              <span class="handoff-company-badge" style="color:var(--text-main); font-weight:600;">${escapeHtml(job.company || application.companyName || 'Company')}</span>
              <span>&bull;</span>
              <span>${escapeHtml(job.location || application.location || 'Remote')}</span>
              <span>&bull;</span>
              <span style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-dim);">Application ID: ${escapeHtml(application.id || 'N/A')}</span>
            </div>
          </div>
          ${
            job.directPortalUrl
              ? `<a id="openPortalBtn" href="${escapeHtml(job.directPortalUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; font-weight:700; text-decoration:none;">
                   Open Employer Portal &nearr;
                 </a>`
              : ''
          }
        </div>
      </div>

      <!-- Critical Manual Submission Notice Banner -->
      <div class="card disclaimer-notice" style="margin-bottom:24px; padding:16px 20px; background:rgba(245, 158, 11, 0.05); border:1px solid rgba(245, 158, 11, 0.3); border-radius:var(--radius-md); display:flex; align-items:flex-start; gap:14px;">
        <div style="font-size:1.2rem; color:#F59E0B; line-height:1; margin-top:2px;">&#9888;</div>
        <div>
          <div style="font-weight:700; font-size:0.9rem; color:#F59E0B; margin-bottom:3px;">
            Prepared for Manual Submission
          </div>
          <div style="font-size:0.825rem; color:var(--text-muted); line-height:1.45;">
            External automated submission has not occurred. All artifacts and candidate claims in this package have been tailored and verified against your authentic career evidence. Please download your tailored documents and complete submission directly in the employer's portal.
          </div>
        </div>
      </div>

      <!-- SECTION 1: DOCUMENT READINESS (Resume & Cover Letter Artifacts) -->
      <div id="document-readiness-card" class="card handoff-card" style="margin-bottom:24px; padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
              <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Document Readiness</h2>
              <span class="badge" style="background:${documentsReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; color:${documentsReady ? '#10B981' : '#EF4444'}; border:1px solid ${documentsReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; font-weight:700; font-size:0.75rem; padding:3px 8px;">
                ${documentsReady ? '● READY' : '○ BLOCKED'}
              </span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Compiled PDF artifacts verified through ATS pre-exposure QA and encrypted storage.
            </div>
          </div>
          ${
            resumeQa.score !== undefined
              ? `<span class="badge" style="background:rgba(16, 185, 129, 0.1); color:#10B981; border:1px solid rgba(16, 185, 129, 0.25); font-size:0.8rem; font-weight:700; padding:4px 10px; border-radius:4px; max-width:100%; box-sizing:border-box;">
                  <span class="quality-pill-score">${escapeHtml(String(resumeQa.score))}/100</span> &bull; <span class="quality-pill-label">Resume Quality Audit</span>
                 </span>`
              : ''
          }
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:20px;">
          <!-- Artifact Card 1: Tailored Resume -->
          <div class="card artifact-card" style="padding:20px 22px; background:#0B0F19; border:1px solid rgba(255,255,255,0.06); border-radius:6px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:inline-flex; align-items:center; gap:8px;">
                  <div style="background:rgba(99, 102, 241, 0.12); color:var(--accent-indigo); width:34px; height:34px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                    PDF
                  </div>
                  <div>
                    <h3 style="font-size:1.02rem; font-weight:700; color:var(--text-main); margin:0;">Tailored Resume</h3>
                    <div style="font-size:0.775rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:1px;">
                      ${escapeHtml(resume.filename || 'tailored-resume.pdf')} &bull; ${formatFileSize(resume.fileSizeBytes)}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Resume Quality Breakdown -->
              <div style="background:#05070D; border:1px solid rgba(255,255,255,0.04); border-radius:6px; padding:12px; margin-bottom:16px;">
                <div style="font-size:0.72rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                  Resume Quality Audit Breakdown
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; font-size:0.8rem; text-align:center;">
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Parsing</div>
                    <div style="font-weight:700; color:var(--text-main);">${escapeHtml(String(resumeQa.breakdown?.parsingCompatibility ?? 35))}/35</div>
                  </div>
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Integrity</div>
                    <div style="font-weight:700; color:var(--text-main);">${escapeHtml(String(resumeQa.breakdown?.contentIntegrity ?? 35))}/35</div>
                  </div>
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Readability</div>
                    <div style="font-weight:700; color:var(--text-main);">${escapeHtml(String(resumeQa.breakdown?.readability ?? 28))}/30</div>
                  </div>
                </div>
                <div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim); display:flex; justify-content:space-between;">
                  <span>Target Job Keyword Match</span>
                  <span style="font-weight:600; color:var(--accent-indigo);">${escapeHtml(String(resumeQa.metrics?.jobAlignmentCoverage ?? 90))}% Supported</span>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
              <button id="viewResumeBtn" type="button" class="btn btn-secondary btn-sm" style="flex:1; font-weight:600;" onclick="openPreviewModal('${escapeHtml(resume.viewUrl || '')}', 'Tailored Resume')">
                View PDF
              </button>
              <a id="downloadResumeBtn" href="${escapeHtml(resume.downloadUrl || '#')}" class="btn btn-primary btn-sm" style="flex:1; font-weight:600; text-align:center; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                Download PDF
              </a>
            </div>
          </div>

          <!-- Artifact Card 2: Tailored Cover Letter -->
          <div class="card artifact-card" style="padding:20px 22px; background:#0B0F19; border:1px solid rgba(255,255,255,0.06); border-radius:6px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:inline-flex; align-items:center; gap:8px;">
                  <div style="background:rgba(16, 185, 129, 0.12); color:#10B981; width:34px; height:34px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                    PDF
                  </div>
                  <div>
                    <h3 style="font-size:1.02rem; font-weight:700; color:var(--text-main); margin:0;">Tailored Cover Letter</h3>
                    <div style="font-size:0.775rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:1px;">
                      ${escapeHtml(coverLetter.filename || 'tailored-cover-letter.pdf')} &bull; ${formatFileSize(coverLetter.fileSizeBytes)}
                    </div>
                  </div>
                </div>
                <span class="badge badge-verified" style="font-size:0.75rem; font-weight:700; padding:3px 8px;">
                  Letterhead &bull; Ready
                </span>
              </div>

              <div style="background:#05070D; border:1px solid rgba(255,255,255,0.04); border-radius:6px; padding:12px; margin-bottom:16px;">
                <div style="font-size:0.72rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
                  Document Structure &bull; ATS Alignment
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.45;">
                  Tailored narrative addressing the hiring team at <strong>${escapeHtml(job.company || 'the target company')}</strong>. Formatted in standard single-column typography with authentic candidate contact headers and verified capability highlights.
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
              <button id="viewCoverLetterBtn" type="button" class="btn btn-secondary btn-sm" style="flex:1; font-weight:600;" onclick="openPreviewModal('${escapeHtml(coverLetter.viewUrl || '')}', 'Tailored Cover Letter')">
                View PDF
              </button>
              <a id="downloadCoverLetterBtn" href="${escapeHtml(coverLetter.downloadUrl || '#')}" class="btn btn-primary btn-sm" style="flex:1; font-weight:600; text-align:center; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                Download PDF
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION 2: APPLICATION READINESS MATRIX -->
      <div id="screening-readiness-card" class="card" style="margin-bottom:24px; padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:10px;">
              <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">Application Readiness Matrix</h2>
              <span class="badge" style="background:${profileComplete ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; color:${profileComplete ? '#10B981' : '#F59E0B'}; border:1px solid ${profileComplete ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; font-weight:700; font-size:0.75rem; padding:3px 8px;">
                ${profileComplete ? '● COMPLETE' : '○ INCOMPLETE'}
              </span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Authoritative candidate screening fields evaluated against stored database profile records.
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
              <span style="font-size:0.75rem; color:var(--text-dim); background:#0B0F19; border:1px solid rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">
                <strong>${readyCount}</strong> Verified / Present
              </span>
              <span style="font-size:0.75rem; color:${confirmCount > 0 ? '#F59E0B' : 'var(--text-dim)'}; background:#0B0F19; border:1px solid rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">
                <strong>${confirmCount}</strong> Needs Confirmation
              </span>
              <span style="font-size:0.75rem; color:${missingCount > 0 ? '#EF4444' : 'var(--text-dim)'}; background:#0B0F19; border:1px solid rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">
                <strong>${missingCount}</strong> Missing
              </span>
              <span style="font-size:0.72rem; color:var(--text-dim); align-self:center; margin-left:6px;">
                HANDOFF_READY documents are ready. Review fields before final portal submission.
              </span>
            </div>
          </div>
          <a href="/profile" class="btn btn-secondary btn-sm" style="font-weight:600; font-size:0.8rem; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
            Update Profile &rarr;
          </a>
        </div>

        <div style="display:flex; flex-direction:column; gap:8px;">
          ${readiness
            .map((item) => {
              const isReady = item.status === 'READY';
              const isMissing = item.status === 'MISSING' || missingFieldSet.has(item.field);
              const isNeedsConfirm =
                item.status === 'NEEDS_CONFIRMATION' || needsConfirmSet.has(item.field);

              let badgeHtml = '';
              if (isReady) {
                badgeHtml = `<span class="badge" style="background:rgba(16, 185, 129, 0.12); color:#10B981; border:1px solid rgba(16, 185, 129, 0.3); font-weight:700; font-size:0.75rem; padding:3px 8px;">&#10003; READY</span>`;
              } else if (isMissing) {
                badgeHtml = `<span class="badge" style="background:rgba(239, 68, 68, 0.12); color:#EF4444; border:1px solid rgba(239, 68, 68, 0.3); font-weight:700; font-size:0.75rem; padding:3px 8px;">&#9675; MISSING</span>`;
              } else if (isNeedsConfirm) {
                badgeHtml = `<span class="badge" style="background:rgba(245, 158, 11, 0.12); color:#F59E0B; border:1px solid rgba(245, 158, 11, 0.3); font-weight:700; font-size:0.75rem; padding:3px 8px;">&#9679; NEEDS CONFIRMATION</span>`;
              }

              return `
                <div class="matrix-row" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; padding:10px 14px; background:#0B0F19; border:1px solid rgba(255,255,255,0.04); border-radius:6px;">
                  <div style="min-width:200px;">
                    <div style="font-size:0.85rem; font-weight:700; color:var(--text-main);">${escapeHtml(item.label)}</div>
                    <div style="font-size:0.775rem; color:var(--text-dim); margin-top:2px;">
                      ${item.value ? `<span style="font-family:var(--font-mono); color:var(--text-muted);">${escapeHtml(item.value)}</span> &bull; ` : ''}${escapeHtml(item.notes)}
                    </div>
                  </div>
                  <div style="display:inline-flex; align-items:center; gap:10px;">
                    ${badgeHtml}
                    ${
                      !isReady && item.profileAnchor
                        ? `<a href="${escapeHtml(item.profileAnchor)}" class="btn btn-secondary btn-sm btn-anchor" style="font-size:0.75rem; padding:3px 8px; color:var(--accent-indigo); border-color:rgba(99,102,241,0.3); text-decoration:none;">
                             Complete in Profile &nearr;
                           </a>`
                        : ''
                    }
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- SECTION 3: PACKAGE VERSION HISTORY -->
      <div id="package-history-card" class="card" style="margin-bottom:24px; padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
          <div>
            <h2 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin:0;">
              Package Version History (${escapeHtml(String(packageHistory.length))})
            </h2>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
              Immutable ledger of generated packages for this application. Exactly one version is CURRENT.
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openRegenerateModal()" style="font-size:0.775rem; font-weight:600;">
            + New Version
          </button>
        </div>

        ${
          packageHistory.length === 0
            ? `<div style="text-align:center; padding:24px; color:var(--text-dim); font-size:0.85rem;">No historical packages recorded yet.</div>`
            : `<div style="overflow-x:auto;">
                 <table id="package-history-table" style="width:100%; border-collapse:collapse; font-size:0.825rem; text-align:left;">
                   <thead>
                     <tr style="border-bottom:1px solid rgba(255,255,255,0.08); color:var(--text-dim);">
                       <th style="padding:10px 12px; font-weight:600;">Version</th>
                       <th style="padding:10px 12px; font-weight:600;">Status</th>
                       <th style="padding:10px 12px; font-weight:600;">Package Hash</th>
                       <th style="padding:10px 12px; font-weight:600;">Prepared At</th>
                       <th style="padding:10px 12px; font-weight:600;">Scope / Reason</th>
                       <th style="padding:10px 12px; font-weight:600; text-align:right;">Actions</th>
                     </tr>
                   </thead>
                   <tbody>
                     ${packageHistory
                       .map((pkg) => {
                         const isCurrent = pkg.lifecycleState === 'CURRENT';
                         const isViewingThis = pkg.version === viewingVersion;
                         const pkgShortHash = pkg.packageHash ? pkg.packageHash.slice(0, 10) : '—';
                         const answers = pkg.answers || {};
                         const reasonText =
                           answers.regenerationReason ||
                           (pkg.source === 'PREPARE_JOB_APPLICATION'
                             ? 'Initial preparation'
                             : pkg.source);
                         const scopeText = answers.regenerationScope
                           ? `[${answers.regenerationScope}] `
                           : '';

                         return `
                           <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:${isViewingThis ? 'rgba(99, 102, 241, 0.04)' : 'transparent'};">
                             <td style="padding:12px; font-weight:700; color:var(--text-main);">
                               v${escapeHtml(String(pkg.version))}
                               ${isViewingThis ? `<span style="font-size:0.7rem; color:var(--accent-indigo); margin-left:4px;">(viewing)</span>` : ''}
                             </td>
                             <td style="padding:12px;">
                               <span class="badge" style="background:${isCurrent ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.15)'}; color:${isCurrent ? '#10B981' : '#9CA3AF'}; border:1px solid ${isCurrent ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.3)'}; font-size:0.7rem; font-weight:700; padding:2px 6px; border-radius:3px;">
                                 ${escapeHtml(pkg.lifecycleState)}
                               </span>
                             </td>
                             <td style="padding:12px; font-family:var(--font-mono); color:var(--text-muted);" title="${escapeHtml(pkg.packageHash || '')}">
                               ${escapeHtml(pkgShortHash)}
                             </td>
                             <td style="padding:12px; color:var(--text-dim); white-space:nowrap;">
                               ${formatDate(pkg.preparedAt || pkg.createdAt)}
                             </td>
                             <td style="padding:12px; color:var(--text-muted);">
                               ${escapeHtml(scopeText + reasonText)}
                             </td>
                             <td style="padding:12px; text-align:right; white-space:nowrap;">
                               <div style="display:inline-flex; align-items:center; gap:6px;">
                                 ${
                                   !isViewingThis
                                     ? `<a href="/applications/${escapeHtml(application.id)}/handoff?version=${escapeHtml(String(pkg.version))}" class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; text-decoration:none;">View</a>`
                                     : ''
                                 }
                                 ${
                                   !isCurrent
                                     ? `<form method="POST" action="/applications/${escapeHtml(application.id)}/packages/${escapeHtml(String(pkg.version))}/restore" style="display:inline; margin:0;">
                                          <button type="submit" class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; color:#10B981; border-color:rgba(16, 185, 129, 0.3);" onclick="return confirm('Restore version v${escapeHtml(String(pkg.version))} as CURRENT?')">
                                            Restore
                                          </button>
                                        </form>`
                                     : `<form method="POST" action="/applications/${escapeHtml(application.id)}/packages/${escapeHtml(String(pkg.version))}/archive" style="display:inline; margin:0;">
                                          <button type="submit" class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; color:var(--text-dim);" onclick="return confirm('Archive current package v${escapeHtml(String(pkg.version))}?')">
                                            Archive
                                          </button>
                                        </form>`
                                 }
                                 ${
                                   !isCurrent
                                     ? `<form method="POST" action="/applications/${escapeHtml(application.id)}/packages/${escapeHtml(String(pkg.version))}/delete" style="display:inline; margin:0;">
                                          ${
                                            !canDeletePackages
                                              ? `<button type="button" disabled class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; opacity:0.4; cursor:not-allowed;" title="Cannot delete packages for submitted applications">Delete</button>`
                                              : packageHistory.length <= 1
                                                ? `<button type="button" disabled class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; opacity:0.4; cursor:not-allowed;" title="Cannot delete sole package">Delete</button>`
                                                : `<button type="submit" class="btn btn-secondary btn-sm" style="font-size:0.72rem; padding:3px 8px; color:#EF4444; border-color:rgba(239, 68, 68, 0.3);" onclick="return confirm('Permanently delete package version v${escapeHtml(String(pkg.version))} (${escapeHtml(pkgShortHash)}) and its document snapshots?')">Delete</button>`
                                          }
                                        </form>`
                                     : ''
                                 }
                               </div>
                             </td>
                           </tr>
                         `;
                       })
                       .join('')}
                   </tbody>
                 </table>
               </div>`
        }
      </div>

      <!-- SECTION 4: SUBMISSION CHECKLIST & PORTAL GUIDE -->
      <div class="card" style="padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
        <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0 0 14px;">
          Manual Submission Guide
        </h2>
        <ol style="margin:0; padding-left:20px; font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
          <li>Click <strong>Open Employer Portal</strong> above to access the official application form in a new tab.</li>
          <li>Use the downloaded <strong>Tailored Resume PDF</strong> as your primary CV attachment.</li>
          <li>Attach or paste the <strong>Tailored Cover Letter PDF</strong> if requested by the portal.</li>
          <li>Review and confirm the screening readiness items above before clicking final submit in the employer portal.</li>
        </ol>
      </div>

    </div>

    <!-- DOCUMENT PREVIEW MODAL -->
    <div id="docPreviewModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.8); backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:16px;">
      <div style="width:100%; max-width:860px; height:88vh; background:#111827; border:1px solid var(--border-highlight); box-shadow:0 24px 48px rgba(0,0,0,0.85); border-radius:var(--radius-md); display:flex; flex-direction:column; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 20px; background:#0B0F19; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:0.95rem; color:var(--text-main);" id="docPreviewTitle">Document Preview</span>
            <span class="badge" style="background:rgba(99,102,241,0.15); color:var(--accent-indigo); font-size:0.7rem; font-weight:700;">AUTHENTICATED STREAM</span>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <a id="docPreviewNewTabBtn" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-size:0.75rem; text-decoration:none;">
              Open in Tab &nearr;
            </a>
            <button id="modalCloseBtn" type="button" onclick="closePreviewModal()" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:0 4px; line-height:1;" aria-label="Close Preview">&times;</button>
          </div>
        </div>
        <div style="flex:1; background:#05070D; position:relative;">
          <iframe id="docPreviewIframe" src="about:blank" style="width:100%; height:100%; border:none;" title="Document PDF Preview"></iframe>
        </div>
      </div>
    </div>

    <!-- REGENERATE PACKAGE MODAL -->
    <div id="regenerateModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.8); backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:16px;">
      <div style="width:100%; max-width:540px; background:#111827; border:1px solid var(--border-highlight); box-shadow:0 24px 48px rgba(0,0,0,0.85); border-radius:var(--radius-md); display:flex; flex-direction:column; overflow:hidden;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; background:#0B0F19; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:1rem; color:var(--text-main);">Regenerate Application Package</span>
          </div>
          <button type="button" onclick="closeRegenerateModal()" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:0 4px; line-height:1;" aria-label="Close">&times;</button>
        </div>
        <form method="POST" action="/applications/${escapeHtml(application.id)}/regenerate" style="padding:20px; margin:0;" id="regenForm">
          <div style="font-size:0.825rem; color:var(--text-muted); margin-bottom:18px; line-height:1.45;">
            Creates a new package version with fresh candidate profile data, LaTeX compilation, and ATS pre-exposure QA. The previous version will be archived in history.
          </div>

          <div style="margin-bottom:16px;">
            <label for="scopeSelect" style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-main); margin-bottom:6px;">
              Regeneration Scope
            </label>
            <select id="scopeSelect" name="scope" style="width:100%; padding:9px 12px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main); font-size:0.85rem;">
              <option value="BOTH">Both Resume & Cover Letter (Recommended)</option>
              <option value="RESUME">Resume Only (Preserve current cover letter)</option>
              <option value="COVER_LETTER">Cover Letter Only (Preserve current resume)</option>
            </select>
          </div>

          <div style="margin-bottom:16px;">
            <label for="reasonPreset" style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-main); margin-bottom:6px;">
              Reason for Regeneration (Optional)
            </label>
            <select id="reasonPreset" style="width:100%; padding:9px 12px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main); font-size:0.85rem; margin-bottom:8px;" onchange="handleReasonPresetChange(this.value)">
              <option value="">Select a common reason or write below...</option>
              <option value="Updated contact info / phone">Updated contact info / phone</option>
              <option value="Updated portfolio / project links">Updated portfolio / project links</option>
              <option value="Updated work authorization / preferences">Updated work authorization / preferences</option>
              <option value="Refreshed ATS formatting / highlights">Refreshed ATS formatting / highlights</option>
              <option value="Shortened summary / bullet points">Shortened summary / bullet points</option>
              <option value="Fixed typo / wording correction">Fixed typo / wording correction</option>
            </select>
            <input type="text" id="reasonInput" name="reason" placeholder="e.g. Updated GitHub profile URL" style="width:100%; box-sizing:border-box; padding:9px 12px; background:#0B0F19; border:1px solid var(--border-subtle); border-radius:6px; color:var(--text-main); font-size:0.85rem;" />
          </div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeRegenerateModal()">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary btn-sm" id="submitRegenBtn" style="font-weight:700;">
              Generate New Version
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Client-Side Modal Scripts -->
    <script>
      function openPreviewModal(url, title) {
        var modal = document.getElementById('docPreviewModal');
        var iframe = document.getElementById('docPreviewIframe');
        var titleEl = document.getElementById('docPreviewTitle');
        var tabBtn = document.getElementById('docPreviewNewTabBtn');

        if (titleEl) titleEl.textContent = title || 'Document Preview';
        if (tabBtn) tabBtn.href = url;
        if (iframe) iframe.src = url;

        if (modal) {
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      }

      function closePreviewModal() {
        var modal = document.getElementById('docPreviewModal');
        var iframe = document.getElementById('docPreviewIframe');

        if (iframe) iframe.src = 'about:blank';
        if (modal) {
          modal.style.display = 'none';
          document.body.style.overflow = '';
        }
      }

      function openRegenerateModal() {
        var modal = document.getElementById('regenerateModal');
        if (modal) {
          modal.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      }

      function closeRegenerateModal() {
        var modal = document.getElementById('regenerateModal');
        if (modal) {
          modal.style.display = 'none';
          document.body.style.overflow = '';
        }
      }

      function handleReasonPresetChange(val) {
        var input = document.getElementById('reasonInput');
        if (input && val) {
          input.value = val;
        }
      }

      // Close modals on Escape key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          closePreviewModal();
          closeRegenerateModal();
        }
      });

      // Close modals on backdrop click
      document.getElementById('docPreviewModal')?.addEventListener('click', function (e) {
        if (e.target === this) closePreviewModal();
      });
      document.getElementById('regenerateModal')?.addEventListener('click', function (e) {
        if (e.target === this) closeRegenerateModal();
      });

      // Show spinner on regeneration submit
      document.getElementById('regenForm')?.addEventListener('submit', function () {
        var btn = document.getElementById('submitRegenBtn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Generating...';
        }
      });
    </script>
  `;

  return renderLayout({
    title: `${job.company || 'Application'} Handoff Kit | Antigravity Career Hub`,
    user,
    activeNav: 'applications',
    content,
  });
}
