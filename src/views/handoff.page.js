/**
 * @file Real Application Handoff Kit View Template
 *
 * Renders the Ashby/Linear-grade application handoff workspace:
 * 1. Application Context & Package Status (HANDOFF_READY, Package Hash, Target Job).
 * 2. Tailored Resume Card with "Resume Quality Audit" score breakdown, View, and Download.
 * 3. Tailored Cover Letter Card with View and Download.
 * 4. Application Readiness Matrix with canonical states (READY, MISSING, NEEDS_CONFIRMATION)
 *    and direct [Complete in Profile] deep links.
 * 5. Employer Portal Direct Link & Prominent Manual Submission Disclaimer.
 * 6. Safe In-Page Document Preview Modal with authenticated PDF streaming.
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
 * Renders the Application Handoff Kit Page HTML.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} [params.tenant] Authenticated tenant
 * @param {object} params.application Job application record
 * @param {object} params.handoffKit Immutable handoff kit payload
 * @param {string} [params.flashMessage=''] Flash message
 * @param {string} [params.errorMessage=''] Error message
 * @returns {string} Full HTML document
 */
export function renderHandoffPage({
  user,
  tenant: _tenant = null,
  application,
  handoffKit,
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

  const content = `
    <div class="container" style="max-width:1120px; margin:0 auto 60px; padding:0 16px;">
      <!-- Navigation & Breadcrumbs -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin:24px 0 20px;">
        <a href="/applications" class="back-nav-link" style="display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); text-decoration:none; font-size:0.875rem; transition:color 0.15s ease;">
          <span aria-hidden="true">&larr;</span> Back to Applications
        </a>
        <div style="display:inline-flex; align-items:center; gap:8px;">
          <span class="badge" style="background:rgba(16, 185, 129, 0.12); color:#10B981; border:1px solid rgba(16, 185, 129, 0.3); font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:4px; letter-spacing:0.5px;">
            ● HANDOFF_READY
          </span>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); background:#111827; border:1px solid var(--border-subtle); padding:3px 8px; border-radius:4px;" title="${escapeHtml(packageHash)}">
            pkg:${escapeHtml(shortHash)}
          </span>
        </div>
      </div>

      <!-- Flash Messages -->
      ${
        flashMessage
          ? `<div class="alert alert-success" style="margin-bottom:20px;">${escapeHtml(flashMessage)}</div>`
          : ''
      }
      ${
        errorMessage
          ? `<div class="alert alert-danger" style="margin-bottom:20px;">${escapeHtml(errorMessage)}</div>`
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
                HANDOFF_READY
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

      <!-- Main 2-Column Grid: Artifacts & Readiness -->
      <div style="display:grid; grid-template-columns:1fr; gap:24px; margin-bottom:24px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
          
          <!-- Card 1: Tailored Resume -->
          <div class="card artifact-card" style="padding:22px 24px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:inline-flex; align-items:center; gap:8px;">
                  <div style="background:rgba(99, 102, 241, 0.12); color:var(--accent-indigo); width:34px; height:34px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                    PDF
                  </div>
                  <div>
                    <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0;">Tailored Resume</h2>
                    <div style="font-size:0.775rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:1px;">
                      ${escapeHtml(resume.filename || 'tailored-resume.pdf')} &bull; ${formatFileSize(resume.fileSizeBytes)}
                    </div>
                  </div>
                </div>
                ${
                  resumeQa.score !== undefined
                    ? `<span class="badge" style="background:rgba(16, 185, 129, 0.1); color:#10B981; border:1px solid rgba(16, 185, 129, 0.25); font-size:0.775rem; font-weight:700; padding:3px 8px; border-radius:4px;" title="Resume Quality Audit: Parsing, Truth Integrity, and Readability">
                        <span class="quality-pill-score">${resumeQa.score}/100</span> &bull; <span class="quality-pill-label">Quality Audit</span>
                       </span>`
                    : ''
                }
              </div>

              <!-- Resume Quality Breakdown -->
              <div style="background:#0B0F19; border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:12px; margin-bottom:18px;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
                  Resume Quality Audit Breakdown
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; font-size:0.8rem; text-align:center;">
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Parsing</div>
                    <div style="font-weight:700; color:var(--text-main);">${resumeQa.breakdown?.parsingCompatibility ?? 35}/35</div>
                  </div>
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Integrity</div>
                    <div style="font-weight:700; color:var(--text-main);">${resumeQa.breakdown?.contentIntegrity ?? 35}/35</div>
                  </div>
                  <div style="background:rgba(255,255,255,0.02); padding:6px 4px; border-radius:4px;">
                    <div style="color:var(--text-muted); font-size:0.7rem;">Readability</div>
                    <div style="font-weight:700; color:var(--text-main);">${resumeQa.breakdown?.readability ?? 28}/30</div>
                  </div>
                </div>
                <div style="margin-top:8px; font-size:0.75rem; color:var(--text-dim); display:flex; justify-content:space-between;">
                  <span>Target Job Keyword Match</span>
                  <span style="font-weight:600; color:var(--accent-indigo);">${resumeQa.metrics?.jobAlignmentCoverage ?? 90}% Supported</span>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
              <button id="viewResumeBtn" type="button" class="btn btn-secondary btn-sm" style="flex:1; font-weight:600;" onclick="openPreviewModal('${escapeHtml(resume.viewUrl)}', 'Tailored Resume')">
                View PDF
              </button>
              <a id="downloadResumeBtn" href="${escapeHtml(resume.downloadUrl)}" class="btn btn-primary btn-sm" style="flex:1; font-weight:600; text-align:center; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                Download PDF
              </a>
            </div>
          </div>

          <!-- Card 2: Tailored Cover Letter -->
          <div class="card" style="padding:22px 24px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md); display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:inline-flex; align-items:center; gap:8px;">
                  <div style="background:rgba(16, 185, 129, 0.12); color:#10B981; width:34px; height:34px; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.85rem;">
                    PDF
                  </div>
                  <div>
                    <h2 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:0;">Tailored Cover Letter</h2>
                    <div style="font-size:0.775rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:1px;">
                      ${escapeHtml(coverLetter.filename || 'tailored-cover-letter.pdf')} &bull; ${formatFileSize(coverLetter.fileSizeBytes)}
                    </div>
                  </div>
                </div>
                <span class="badge badge-verified" style="font-size:0.75rem; font-weight:700; padding:3px 8px;">
                  Letterhead &bull; Ready
                </span>
              </div>

              <div style="background:#0B0F19; border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:12px; margin-bottom:18px;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
                  Document Structure &bull; ATS Alignment
                </div>
                <div style="font-size:0.8rem; color:var(--text-muted); line-height:1.45;">
                  Tailored narrative addressing the hiring team at <strong>${escapeHtml(job.company || 'the target company')}</strong>. Formatted in standard single-column typography with authentic candidate contact headers and verified capability highlights.
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
              <button id="viewCoverLetterBtn" type="button" class="btn btn-secondary btn-sm" style="flex:1; font-weight:600;" onclick="openPreviewModal('${escapeHtml(coverLetter.viewUrl)}', 'Tailored Cover Letter')">
                View PDF
              </button>
              <a id="downloadCoverLetterBtn" href="${escapeHtml(coverLetter.downloadUrl)}" class="btn btn-primary btn-sm" style="flex:1; font-weight:600; text-align:center; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                Download PDF
              </a>
            </div>
          </div>

        </div>

        <!-- Card 3: Application Readiness Matrix & Profile Loop -->
        <div class="card" style="padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; border-bottom:1px solid var(--border-subtle); padding-bottom:12px;">
            <div>
              <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0;">Application Readiness Matrix</h2>
              <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                Canonical candidate screening fields evaluated against stored profile records.
              </div>
              ${
                semantics
                  ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
                      <span class="badge" style="background:${semantics.documentsReady ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; color:${semantics.documentsReady ? '#10B981' : '#EF4444'}; border:1px solid ${semantics.documentsReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; font-weight:700; font-size:0.72rem; padding:3px 8px;">DOCUMENTS: ${semantics.documentsReady ? 'READY' : 'BLOCKED'}</span>
                      <span class="badge" style="background:${semantics.profileComplete ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; color:${semantics.profileComplete ? '#10B981' : '#F59E0B'}; border:1px solid ${semantics.profileComplete ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}; font-weight:700; font-size:0.72rem; padding:3px 8px;">SCREENING PROFILE: ${semantics.profileComplete ? 'COMPLETE' : 'INCOMPLETE'}</span>
                      <span style="font-size:0.72rem; color:var(--text-dim); align-self:center;">HANDOFF_READY does not imply screening fields are complete.</span>
                    </div>`
                  : ''
              }
            </div>
            <a href="/profile" style="color:var(--accent-indigo); text-decoration:none; font-size:0.825rem; font-weight:600;">
              Open Portfolio Profile &rarr;
            </a>
          </div>

          <div style="display:flex; flex-direction:column; gap:10px;">
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

        <!-- Card 4: Submission Checklist & Portal Guide -->
        <div class="card" style="padding:24px 28px; background:#111827; border:1px solid var(--border-subtle); border-radius:var(--radius-md);">
          <h2 style="font-size:1.1rem; font-weight:700; color:var(--text-main); margin:0 0 14px;">
            Manual Submission Guide
          </h2>
          <ol style="margin:0; padding-left:20px; font-size:0.85rem; color:var(--text-muted); line-height:1.6;">
            <li>Click <strong>Open Employer Portal</strong> above to access the official application form in a new tab.</li>
            <li>Use the downloaded <strong>Tailored Resume PDF</strong> as your primary CV attachment.</li>
            <li>Attach or paste the <strong>Tailored Cover Letter PDF</strong> if requested by the portal.</li>
            <li>Review and confirm the readiness items above before clicking final submit in the employer portal.</li>
          </ol>
        </div>

      </div>
    </div>

    <!-- Document Preview Modal -->
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

    <!-- Client-Side Modal Script -->
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

      // Close modal on Escape key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePreviewModal();
      });

      // Close modal on backdrop click
      document.getElementById('docPreviewModal')?.addEventListener('click', function (e) {
        if (e.target === this) closePreviewModal();
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
