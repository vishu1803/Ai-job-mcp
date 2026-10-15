/**
 * @file Interactive Client-Side Engine for AI Tailored Resume Studio Prototype.
 * Handles split-pane resizing, PageMap click-to-edit sync, proposal decisions,
 * stale invalidation, evidence inspection, and adaptive 1-page geometry solving.
 */

const rawSyntheticData = (typeof window !== 'undefined' && window.SYNTHETIC_DATA) 
  ? window.SYNTHETIC_DATA 
  : (typeof SYNTHETIC_DATA !== 'undefined' ? SYNTHETIC_DATA : {});

// Application State Model
const state = {
  data: JSON.parse(JSON.stringify(rawSyntheticData)),
  activeMode: 'split',      // 'editor' | 'split' | 'preview'
  activeKeyword: null,      // Active highlighted keyword
  proposalOpen: false,      // Whether AI proposal card is displayed
  isStale: false,           // Whether current proposal is stale
  isOverflowing: false,     // Simulated 2-page overflow state
  isTightSpacing: false,    // Whether 1-page adaptive micro-spacing is active
  activeDiagTab: 'fit',     // 'fit' | 'writing' | 'parse' | 'evidence'
  zoom: 1.0,
  splitRatio: 0.5,          // 50% / 50%
  activeNodeId: null,
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// DOM Element References
const editorContent = document.getElementById('editorContent');
const paperInner = document.getElementById('paperInner');
const resumePaper = document.getElementById('resumePaper');
const keywordChipsBar = document.getElementById('keywordChipsBar');
const editorPane = document.getElementById('editorPane');
const previewPane = document.getElementById('previewPane');
const resizerGutter = document.getElementById('resizerGutter');
const pageBudgetBadge = document.getElementById('pageBudgetBadge');
const pageBudgetText = document.getElementById('pageBudgetText');
const pageCutoffLine = document.getElementById('pageCutoffLine');
const fitBtnLabel = document.getElementById('fitBtnLabel');
const diagnosticsDrawer = document.getElementById('diagnosticsDrawer');
const contentSelectorDrawer = document.getElementById('contentSelectorDrawer');
const contentSelectorBody = document.getElementById('contentSelectorBody');
const evidenceModal = document.getElementById('evidenceModal');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const diagTabContent = document.getElementById('diagTabContent');

// ---------------------------------------------------------------------------
// 1. Initialization & Render Loop
// ---------------------------------------------------------------------------
function init() {
  renderKeywordChips();
  renderEditor();
  renderResumePaper();
  setupResizer();
  setupModeSwitcher();
  setupDiagnosticsTabs();
  setupEventListeners();
  setupDemoStateSwitcher();
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 2. Keyword Chips Bar (Editorial Architectural Tags)
// ---------------------------------------------------------------------------
window.currentKwFilter = 'all';

window.filterKeywordChips = function (filter) {
  window.currentKwFilter = filter;
  ['kwFilterAll', 'kwFilterMatched', 'kwFilterGaps'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  if (filter === 'all' && document.getElementById('kwFilterAll')) document.getElementById('kwFilterAll').classList.add('active');
  if (filter === 'matched' && document.getElementById('kwFilterMatched')) document.getElementById('kwFilterMatched').classList.add('active');
  if (filter === 'gaps' && document.getElementById('kwFilterGaps')) document.getElementById('kwFilterGaps').classList.add('active');
  renderKeywordChips();
};

function renderKeywordChips() {
  keywordChipsBar.innerHTML = '';
  const filter = window.currentKwFilter || 'all';

  // Matched Keywords
  if (filter === 'all' || filter === 'matched') {
    state.data.keywords.matched.forEach((kw) => {
      const chip = document.createElement('span');
      chip.className = 'kw-chip matched';
      chip.dataset.keyword = kw.term;
      chip.innerHTML = `<span class="chip-dot"></span><span>${escapeHtml(kw.term)}</span>`;
      chip.title = `Exact Match (${kw.count} occurrences). Click to highlight in resume.`;
      chip.onclick = () => highlightKeyword(kw.term);
      keywordChipsBar.appendChild(chip);
    });

    state.data.keywords.equivalent.forEach((kw) => {
      const chip = document.createElement('span');
      chip.className = 'kw-chip equiv';
      chip.dataset.keyword = kw.canonical;
      chip.innerHTML = `<span class="chip-dot"></span><span>&approx; ${escapeHtml(kw.term)}</span>`;
      chip.title = `Taxonomy Synonyms for ${kw.canonical}.`;
      chip.onclick = () => highlightKeyword(kw.canonical);
      keywordChipsBar.appendChild(chip);
    });
  }

  // Gaps (Related + Missing)
  if (filter === 'all' || filter === 'gaps') {
    state.data.keywords.related.forEach((kw) => {
      const chip = document.createElement('span');
      chip.className = 'kw-chip related';
      chip.dataset.keyword = kw.term;
      chip.innerHTML = `<span class="chip-dot"></span><span>? ${escapeHtml(kw.term)}</span>`;
      chip.title = `Related to ${kw.relationTo}. Insufficient for exact requirement (Rule 27).`;
      chip.onclick = () => highlightKeyword(kw.term);
      keywordChipsBar.appendChild(chip);
    });

    state.data.keywords.missing.forEach((kw) => {
      const chip = document.createElement('span');
      chip.className = 'kw-chip missing';
      chip.dataset.keyword = kw.term;
      chip.innerHTML = `<span class="chip-dot"></span><span>! ${escapeHtml(kw.term)}</span>`;
      chip.title = `Missing requirement in candidate profile.`;
      keywordChipsBar.appendChild(chip);
    });
  }
}

function highlightKeyword(term) {
  state.activeKeyword = state.activeKeyword === term ? null : term;

  // Toggle active class on chips
  document.querySelectorAll('.kw-chip').forEach((c) => {
    if (c.dataset.keyword === state.activeKeyword) {
      c.classList.add('active-highlight');
    } else {
      c.classList.remove('active-highlight');
    }
  });

  // Highlight bullets in editor and preview
  document.querySelectorAll('.bullet-card').forEach((card) => {
    const text = card.querySelector('.bullet-input')?.value || '';
    if (state.activeKeyword && text.toLowerCase().includes(state.activeKeyword.toLowerCase())) {
      card.classList.add('active-target');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      card.classList.remove('active-target');
    }
  });

  document.querySelectorAll('.cv-node').forEach((node) => {
    const text = node.textContent || '';
    if (state.activeKeyword && text.toLowerCase().includes(state.activeKeyword.toLowerCase())) {
      node.classList.add('active-highlight');
    } else {
      node.classList.remove('active-highlight');
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Render Structured Editor (Editorial Document Layout)
// ---------------------------------------------------------------------------
function renderEditor() {
  const d = state.data;
  let html = '';

  // 01 / Summary Section
  html += `
    <div class="editor-section" id="sec-summary">
      <div class="section-head">
        <span class="section-title">01 / Professional Summary</span>
        <span class="section-meta">29 words &bull; Grounded</span>
      </div>
      <div class="section-body">
        <textarea class="bullet-input" id="inputSummary" style="min-height:70px;">${escapeHtml(d.candidate.summary)}</textarea>
      </div>
    </div>
  `;

  // 02 / Experience Section
  html += `
    <div class="editor-section" id="sec-experience">
      <div class="section-head">
        <span class="section-title">02 / Work Experience</span>
        <span class="section-meta">${d.experience.filter((e) => e.included).length} Roles Active &bull; Modular Selection</span>
      </div>
      <div class="section-body">
  `;

  d.experience.forEach((exp) => {
    if (!exp.included) return;
    html += `
      <div class="role-block">
        <div class="role-header-row">
          <div>
            <span class="role-title">${escapeHtml(exp.role)}</span>
            <span class="role-company">&mdash; ${escapeHtml(exp.company)}</span>
          </div>
          <span class="role-dates">${escapeHtml(exp.period)}</span>
        </div>
    `;

    exp.bullets.forEach((b) => {
      if (!b.included) return;
      const isTarget = b.id === 'exp-1-b1';
      html += `
        <div class="bullet-card ${isTarget ? 'active-target' : ''}" id="card-${b.id}" data-node-id="${b.id}">
          <div class="bullet-card-header">
            <div>
              ${
                b.evidenceId
                  ? `<button class="evidence-tag-btn" onclick="window.inspectEvidence('${b.evidenceId}')" title="Inspect verified commit proof">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                      <span>commit ${d.evidenceRegistry[b.evidenceId]?.commitSha?.slice(0, 7) || 'Verified'} &bull; ${d.evidenceRegistry[b.evidenceId]?.filePath?.split('/').pop() || 'repo'}</span>
                     </button>`
                  : `<span class="assertion-note">Candidate Assertion</span>`
              }
            </div>
            <button class="btn-polish-ai" onclick="window.triggerProposal('${b.id}')" title="Generate Google XYZ rewrite proposal">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              <span>Polish with Evidence</span>
            </button>
          </div>
          <textarea class="bullet-input" id="input-${b.id}" data-node-id="${b.id}" oninput="window.handleBulletInput('${b.id}', this)">${escapeHtml(b.text)}</textarea>

          <!-- Proposal Card Container -->
          ${isTarget && state.proposalOpen ? renderProposalCard(b.proposal) : ''}
        </div>
      `;
    });

    html += `</div>`;
  });

  html += `</div></div>`;

  // 03 / Technical Projects Section
  html += `
    <div class="editor-section" id="sec-projects">
      <div class="section-head">
        <span class="section-title">03 / Selected Technical Projects</span>
        <span class="section-meta">Cosine Similarity Ranked</span>
      </div>
      <div class="section-body">
  `;

  d.projects.forEach((proj) => {
    if (!proj.included) return;
    html += `
      <div class="bullet-card" id="card-${proj.id}" data-node-id="${proj.id}">
        <div class="bullet-card-header">
          <div>
            <strong style="color:var(--text-main); font-size:0.875rem;">${escapeHtml(proj.name)}</strong>
            <span style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);"> (${escapeHtml(proj.repo)})</span>
            <span style="font-size:0.7rem; color:var(--accent-emerald); font-family:var(--font-mono); margin-left:8px;">${proj.relevanceScore}% match</span>
          </div>
          <button class="evidence-tag-btn" onclick="window.inspectEvidence('${proj.evidenceId}')">
            <span>commit ${d.evidenceRegistry[proj.evidenceId]?.commitSha?.slice(0, 7) || 'Verified'}</span>
          </button>
        </div>
        <textarea class="bullet-input" style="min-height:48px;">${escapeHtml(proj.description)}</textarea>
      </div>
    `;
  });

  html += `</div></div>`;

  // 04 / Technical Skills Section
  html += `
    <div class="editor-section" id="sec-skills">
      <div class="section-head">
        <span class="section-title">04 / Technical Skills</span>
        <span class="section-meta">Rule 27 Partitioned</span>
      </div>
      <div class="section-body">
        <div style="font-size:0.825rem; line-height:1.6; color:var(--text-secondary);">
          <div><strong style="color:var(--text-main);">Distributed Systems &amp; Languages:</strong> Go, Rust, C++, Raft / Paxos, eBPF Kernel Routing</div>
          <div style="margin-top:4px;"><strong style="color:var(--text-main);">Cloud &amp; Infrastructure:</strong> Kubernetes, AWS / Multi-Cloud, Terraform, Linux Internals</div>
        </div>
      </div>
    </div>
  `;

  editorContent.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 4. Proposal Card Renderer (Editorial Diff Review Block)
// ---------------------------------------------------------------------------
function renderProposalCard(proposal) {
  if (!proposal) return '';
  const isStale = state.isStale;

  return `
    <div class="proposal-box ${isStale ? 'stale' : ''}" id="proposalBox">
      <div class="proposal-head">
        <div class="proposal-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>AI Editorial Proposal &mdash; Google XYZ [${escapeHtml(proposal.targetKeyword)}]</span>
        </div>
        <span style="font-size:0.7rem; color:var(--text-dim); font-family:var(--font-mono);">Model: Evidence-Grounded</span>
      </div>

      <div class="proposal-stale-banner">
        <strong>Proposal Stale:</strong> The underlying bullet was modified. "Accept Proposal" is paused to protect your edits.
        <a href="javascript:void(0)" onclick="window.realignProposal()" style="color:#FBBF24; text-decoration:underline; margin-left:6px; font-weight:600;">Re-align with Current Text</a>
      </div>

      <div class="diff-block">
        <div class="diff-before">
          <div style="font-size:0.68rem; font-weight:600; text-transform:uppercase; color:#FDA4AF; margin-bottom:2px; letter-spacing:0.04em;">Original Bullet</div>
          <div>${escapeHtml(proposal.originalText)}</div>
        </div>
        <div class="diff-after">
          <div style="font-size:0.68rem; font-weight:600; text-transform:uppercase; color:#34D399; margin-bottom:2px; letter-spacing:0.04em;">Proposed Grounded Rewrite</div>
          <div>${escapeHtml(proposal.proposedText)}</div>
        </div>
      </div>

      <div class="proposal-formula">
        <span>Formula Rationale:</span> ${escapeHtml(proposal.formula)}
      </div>

      <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:10px; font-family:var(--font-mono);">
        <span>Provenance:</span> Verified via commit 
        <a href="javascript:void(0)" onclick="window.inspectEvidence('${proposal.evidenceId}')" style="color:#C084FC; text-decoration:underline;">avance-infra/edge-proxy#e3f7556</a>
      </div>

      <div class="proposal-actions">
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" id="btnAcceptProposal" ${isStale ? 'disabled style="opacity:0.35; cursor:not-allowed;"' : ''} onclick="window.acceptProposal()">
            Accept Proposal
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.editProposalInPlace()">
            Edit in Place
          </button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="window.dismissProposal()">
          Dismiss
        </button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// 5. Render High-Legibility Resume Paper (1-Page Vector Sheet)
// ---------------------------------------------------------------------------
function renderResumePaper() {
  const d = state.data;
  let html = '';

  // Header
  html += `
    <header class="cv-header cv-node" data-node-id="cand_header" onclick="window.focusEditorNode('sec-summary')">
      <h1 class="cv-name">${escapeHtml(d.candidate.name)}</h1>
      <div class="cv-contact">
        <span>${escapeHtml(d.candidate.location)}</span> &bull;
        <span>${escapeHtml(d.candidate.email)}</span> &bull;
        <span>${escapeHtml(d.candidate.phone)}</span> &bull;
        <span>${escapeHtml(d.candidate.github)}</span> &bull;
        <span>${escapeHtml(d.candidate.linkedin)}</span>
      </div>
    </header>
  `;

  // Professional Summary
  html += `
    <section class="cv-section cv-node" data-node-id="cand_summary" onclick="window.focusEditorNode('sec-summary')">
      <h2 class="cv-section-title">Professional Summary</h2>
      <p style="margin:0; font-size:9.6pt; color:#1F2937;">${escapeHtml(d.candidate.summary)}</p>
    </section>
  `;

  // Work Experience
  html += `<section class="cv-section"><h2 class="cv-section-title">Professional Experience</h2>`;
  d.experience.forEach((exp) => {
    if (!exp.included) return;
    html += `
      <div class="cv-item">
        <div class="cv-item-header">
          <span>${escapeHtml(exp.role)} &mdash; ${escapeHtml(exp.company)}</span>
          <span style="font-weight:400; font-size:9.2pt;">${escapeHtml(exp.period)}</span>
        </div>
        <div class="cv-item-sub">
          <span>${escapeHtml(exp.location)}</span>
        </div>
        <ul class="cv-bullets">
    `;

    exp.bullets.forEach((b) => {
      if (!b.included) return;
      html += `
        <li class="cv-node" data-node-id="${b.id}" id="cv-${b.id}" onclick="window.focusEditorNode('card-${b.id}')">
          ${escapeHtml(b.text)}
        </li>
      `;
    });

    html += `</ul></div>`;
  });
  html += `</section>`;

  // Technical Projects
  const includedProjects = d.projects.filter((p) => p.included);
  if (includedProjects.length > 0) {
    html += `<section class="cv-section"><h2 class="cv-section-title">Technical Projects</h2>`;
    includedProjects.forEach((proj) => {
      html += `
        <div class="cv-item cv-node" data-node-id="${proj.id}" onclick="window.focusEditorNode('card-${proj.id}')">
          <div class="cv-item-header">
            <span>${escapeHtml(proj.name)}</span>
            <span style="font-weight:400; font-size:8.8pt; font-family:monospace;">${escapeHtml(proj.repo)}</span>
          </div>
          <p style="margin:2px 0 0; font-size:9.5pt; color:#1F2937;">${escapeHtml(proj.description)}</p>
        </div>
      `;
    });
    html += `</section>`;
  }

  // Technical Skills
  html += `
    <section class="cv-section cv-node" onclick="window.focusEditorNode('sec-skills')">
      <h2 class="cv-section-title">Technical Skills</h2>
      <div style="font-size:9.4pt; color:#1F2937; line-height:1.45;">
        <div><strong>Distributed Systems &amp; Languages:</strong> Go, Rust, C++, Raft / Paxos, eBPF Kernel Routing</div>
        <div><strong>Cloud &amp; Infrastructure:</strong> Kubernetes, AWS / Multi-Cloud, Terraform, Linux Internals</div>
      </div>
    </section>
  `;

  // Education
  html += `
    <section class="cv-section">
      <h2 class="cv-section-title">Education</h2>
      <div class="cv-item">
        <div class="cv-item-header">
          <span>Master of Science in Computer Science &mdash; University of Washington</span>
          <span style="font-weight:400; font-size:9pt;">May 2011</span>
        </div>
        <div style="font-size:8.8pt; color:#4B5563; font-style:italic;">Thesis: Asynchronous Byzantine Fault Tolerance in Geographically Distributed Clusters.</div>
      </div>
    </section>
  `;

  paperInner.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 6. PageMap Click-to-Edit Synchronized Navigation
// ---------------------------------------------------------------------------
window.focusEditorNode = function (targetId) {
  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('active-target');
    const input = el.querySelector('textarea');
    if (input) input.focus();
    setTimeout(() => el.classList.remove('active-target'), 2000);
  }
};

// ---------------------------------------------------------------------------
// 7. Proposal Lifecycle & canApplyProposal Stale Guard
// ---------------------------------------------------------------------------
window.triggerProposal = function (bulletId) {
  state.proposalOpen = true;
  state.isStale = false;
  renderEditor();
  const card = document.getElementById(`card-${bulletId}`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.handleBulletInput = function (bulletId, textarea) {
  const bullet = state.data.experience[0].bullets.find((b) => b.id === bulletId);
  if (!bullet || !bullet.proposal) return;

  // Evaluate canApplyProposal: string-equality check
  const isMatch = textarea.value.trim() === bullet.proposal.originalText.trim();
  state.isStale = !isMatch;

  const proposalBox = document.getElementById('proposalBox');
  const btnAccept = document.getElementById('btnAcceptProposal');
  if (proposalBox && btnAccept) {
    if (state.isStale) {
      proposalBox.classList.add('stale');
      btnAccept.disabled = true;
      btnAccept.style.opacity = '0.4';
      btnAccept.style.cursor = 'not-allowed';
    } else {
      proposalBox.classList.remove('stale');
      btnAccept.disabled = false;
      btnAccept.style.opacity = '1';
      btnAccept.style.cursor = 'pointer';
    }
  }

  // Update paper live
  bullet.text = textarea.value;
  renderResumePaper();
};

window.realignProposal = function () {
  const bullet = state.data.experience[0].bullets[0];
  const input = document.getElementById(`input-${bullet.id}`);
  if (input) {
    input.value = bullet.proposal.originalText;
    bullet.text = bullet.proposal.originalText;
    state.isStale = false;
    renderEditor();
    renderResumePaper();
  }
};

window.acceptProposal = function () {
  if (state.isStale) return;
  const bullet = state.data.experience[0].bullets[0];
  bullet.text = bullet.proposal.proposedText;
  state.proposalOpen = false;
  renderEditor();
  renderResumePaper();

  // Show flash
  const ind = document.getElementById('saveStatusIndicator');
  if (ind) {
    ind.innerHTML = `<span style="color:#34D399; font-weight:700;">✓ Proposal Applied to Draft</span>`;
    setTimeout(() => {
      ind.innerHTML = `<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--accent-emerald);"></span><span>Saved (just now)</span>`;
    }, 2500);
  }
};

window.editProposalInPlace = function () {
  const bullet = state.data.experience[0].bullets[0];
  const input = document.getElementById(`input-${bullet.id}`);
  if (input) {
    input.value = bullet.proposal.proposedText;
    input.focus();
    window.handleBulletInput(bullet.id, input);
  }
};

window.dismissProposal = function () {
  state.proposalOpen = false;
  renderEditor();
};

// ---------------------------------------------------------------------------
// 8. Evidence Inspector Modal
// ---------------------------------------------------------------------------
window.inspectEvidence = function (evidenceId) {
  const ev = state.data.evidenceRegistry[evidenceId];
  if (!ev) return;

  const modal = document.getElementById('evidenceModal');
  const body = document.getElementById('modalBody');
  const backdrop = document.getElementById('drawerBackdrop');

  body.innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700; margin-bottom:2px;">
        ${ev.type.replace('_', ' ')} PROVENANCE RECORD
      </div>
      <div style="font-size:1.05rem; font-weight:700; color:var(--text-main);">${escapeHtml(ev.repo || 'Repository Proof')}</div>
    </div>

    <div style="background:#070B14; border:1px solid var(--border-subtle); border-radius:var(--radius-xs); padding:10px 14px; margin-bottom:14px; font-size:0.8rem; line-height:1.6;">
      <div><strong style="color:var(--text-muted);">Commit SHA:</strong> <span style="font-family:var(--font-mono); color:#C084FC;">${escapeHtml(ev.commitSha || 'N/A')}</span></div>
      <div><strong style="color:var(--text-muted);">File Path:</strong> <span style="font-family:var(--font-mono); color:var(--text-secondary);">${escapeHtml(ev.filePath || 'Repository root')}</span></div>
      <div><strong style="color:var(--text-muted);">Author:</strong> ${escapeHtml(ev.author || 'Elena Rostova')}</div>
      <div><strong style="color:var(--text-muted);">Verification Timestamp:</strong> ${escapeHtml(ev.verifiedAt || '2026-10-14')} (Grounded via GitHub App API)</div>
      ${ev.commitMessage ? `<div style="margin-top:4px;"><strong style="color:var(--text-muted);">Commit Message:</strong> <em>"${escapeHtml(ev.commitMessage)}"</em></div>` : ''}
    </div>

    ${
      ev.diffSnippet
        ? `
      <div style="font-size:0.75rem; font-weight:700; color:var(--text-muted); margin-bottom:4px;">VERIFIED CODE DIFF:</div>
      <pre class="diff-terminal">${escapeHtml(ev.diffSnippet)}</pre>
    `
        : ''
    }

    <div style="display:flex; justify-content:flex-end; margin-top:16px;">
      <button class="btn btn-secondary btn-sm" onclick="window.closeEvidenceModal()">Close Inspector</button>
    </div>
  `;

  modal.classList.add('open');
  backdrop.classList.add('open');
};

window.closeEvidenceModal = function () {
  document.getElementById('evidenceModal').classList.remove('open');
  document.getElementById('drawerBackdrop').classList.remove('open');
};

// ---------------------------------------------------------------------------
// 9. Diagnostics Drawer & Tabs
// ---------------------------------------------------------------------------
function setupDiagnosticsTabs() {
  const tabs = [
    { id: 'tabDiagFit', key: 'fit' },
    { id: 'tabDiagWriting', key: 'writing' },
    { id: 'tabDiagParse', key: 'parse' },
    { id: 'tabDiagEvidence', key: 'evidence' },
  ];

  tabs.forEach((t) => {
    document.getElementById(t.id).onclick = () => {
      tabs.forEach((o) => document.getElementById(o.id).classList.remove('active'));
      document.getElementById(t.id).classList.add('active');
      state.activeDiagTab = t.key;
      renderDiagContent();
    };
  });
}

function renderDiagContent() {
  const d = state.data.diagnostics;
  let html = '';

  if (state.activeDiagTab === 'fit') {
    html = `
      <div class="score-circle-wrap">
        <div class="circle-score-val">${d.atsFit.score}</div>
        <div>
          <strong style="color:var(--text-main); font-size:1.05rem;">ATS Candidate-Job Fit</strong>
          <div style="font-size:0.8rem; color:var(--accent-emerald); font-weight:600;">Status: STRONG MATCH (Score &gt; 85)</div>
          <div style="font-size:0.75rem; color:var(--text-dim); margin-top:2px;">Evaluated deterministically via AtsFitScoreService</div>
        </div>
      </div>
      <div style="font-size:0.825rem; line-height:1.6; color:var(--text-secondary);">
        <div style="padding:8px 0; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; font-weight:600;"><span>Core Tech Match</span><span>48 / 50 pts</span></div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${d.atsFit.breakdown.requirements.note}</div>
        </div>
        <div style="padding:8px 0; border-bottom:1px solid var(--border-subtle);">
          <div style="display:flex; justify-content:space-between; font-weight:600;"><span>Seniority &amp; Scope</span><span>25 / 25 pts</span></div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${d.atsFit.breakdown.seniority.note}</div>
        </div>
        <div style="padding:8px 0;">
          <div style="display:flex; justify-content:space-between; font-weight:600;"><span>Project Alignment</span><span>15 / 15 pts</span></div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${d.atsFit.breakdown.projects.note}</div>
        </div>
      </div>
    `;
  } else if (state.activeDiagTab === 'writing') {
    html = `
      <div style="background:#0A0F1D; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong style="color:var(--text-main); font-size:0.95rem;">Action Verb Strength</strong>
          <span style="font-size:1.2rem; font-weight:800; color:#34D399;">${d.writingQuality.actionVerbStrength}%</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);">
          9 of 9 bullet points begin with strong active engineering verbs (Architected, Engineered, Led, Spearheaded, Designed).
        </div>
      </div>
      <div style="background:#0A0F1D; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong style="color:var(--text-main); font-size:0.95rem;">Quantified Metrics</strong>
          <span style="font-size:1.2rem; font-weight:800; color:#34D399;">${d.writingQuality.metricCoverageCount} / ${d.writingQuality.totalBulletsCount}</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-muted);">
          78% metric coverage. Authentically grounded; candidate was not penalized for roles lacking quantitative numbers.
        </div>
      </div>
      <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-md); padding:14px; font-size:0.8rem;">
        <strong style="color:#FBBF24;">Repetition Alert:</strong> "Architected" is used 3 times.
        <div style="margin-top:6px;">
          <button class="btn btn-secondary btn-sm" onclick="window.triggerProposal('exp-1-b1')">Replace in Bullet 1 with "Engineered"</button>
        </div>
      </div>
    `;
  } else if (state.activeDiagTab === 'parse') {
    html = `
      <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Honest ATS Parseability (100% Pass)</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${d.parseability.checks
          .map(
            (c) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#0A0F1D; padding:10px 14px; border-radius:var(--radius-xs); border:1px solid var(--border-subtle); font-size:0.8rem;">
            <span style="color:var(--text-secondary);">${escapeHtml(c.name)}</span>
            <span style="color:#34D399; font-weight:700; font-family:var(--font-mono);">✓ PASS</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  } else if (state.activeDiagTab === 'evidence') {
    html = `
      <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:12px;">Radical Evidence Verification</div>
      <div style="background:#0A0F1D; border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:16px; font-size:0.825rem; line-height:1.8;">
        <div><strong style="color:#34D399;">✓ Verified Claims:</strong> 11 (backed by commit &amp; PR hashes)</div>
        <div><strong style="color:#A78BFA;">• Candidate-Reported Claims:</strong> 3 (AWS Nitro claims from master resume)</div>
        <div><strong style="color:var(--accent-rose);">✗ Hallucinations:</strong> 0 (Strict Zero-Fabrication Invariant)</div>
        <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-subtle); font-weight:700; color:var(--text-main);">
          Confidence Score: ${d.evidenceVerification.confidenceScore}
        </div>
      </div>
    `;
  }

  diagTabContent.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 10. Modular Content Selection Drawer (Teal Paradigm)
// ---------------------------------------------------------------------------
function renderContentSelector() {
  const d = state.data;
  let html = `
    <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:16px;">
      Check or uncheck positions and projects to customize your narrative for <strong>CloudScale Systems</strong> without mutating your master profile.
    </div>
  `;

  // Roles
  html += `<div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:8px;">Experience Roles</div>`;
  d.experience.forEach((exp) => {
    html += `
      <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:#0A0F1D; border:1px solid var(--border-subtle); border-radius:var(--radius-xs); margin-bottom:6px; cursor:pointer; font-size:0.825rem;">
        <input type="checkbox" ${exp.included ? 'checked' : ''} onchange="window.toggleRoleInclusion('${exp.id}', this.checked)">
        <span style="color:var(--text-main); font-weight:600;">${escapeHtml(exp.role)} &mdash; ${escapeHtml(exp.company)}</span>
      </label>
    `;
  });

  // Projects
  html += `<div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin:18px 0 8px 0;">Technical Projects</div>`;
  d.projects.forEach((proj) => {
    html += `
      <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; background:#0A0F1D; border:1px solid var(--border-subtle); border-radius:var(--radius-xs); margin-bottom:6px; cursor:pointer; font-size:0.825rem;">
        <input type="checkbox" ${proj.included ? 'checked' : ''} onchange="window.toggleProjectInclusion('${proj.id}', this.checked)">
        <div style="flex:1;">
          <div style="color:var(--text-main); font-weight:600;">${escapeHtml(proj.name)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(proj.repo)} &bull; ${proj.relevanceScore}% Relevance</div>
        </div>
      </label>
    `;
  });

  contentSelectorBody.innerHTML = html;
}

window.toggleRoleInclusion = function (roleId, checked) {
  const role = state.data.experience.find((e) => e.id === roleId);
  if (role) {
    role.included = checked;
    renderEditor();
    renderResumePaper();
  }
};

window.toggleProjectInclusion = function (projId, checked) {
  const proj = state.data.projects.find((p) => p.id === projId);
  if (proj) {
    proj.included = checked;
    renderEditor();
    renderResumePaper();
  }
};

// ---------------------------------------------------------------------------
// 11. Resizer Gutter (Mouse & Touch Dragging)
// ---------------------------------------------------------------------------
function setupResizer() {
  let isDragging = false;

  const startDrag = (e) => {
    isDragging = true;
    resizerGutter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  };

  const onDrag = (e) => {
    if (!isDragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const containerWidth = window.innerWidth;
    const ratio = Math.max(0.3, Math.min(0.7, clientX / containerWidth));
    state.splitRatio = ratio;

    editorPane.style.width = `${ratio * 100}%`;
    previewPane.style.width = `${(1 - ratio) * 100}%`;
  };

  const stopDrag = () => {
    if (isDragging) {
      isDragging = false;
      resizerGutter.classList.remove('dragging');
      document.body.style.cursor = '';
    }
  };

  resizerGutter.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);

  resizerGutter.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', onDrag, { passive: true });
  window.addEventListener('touchend', stopDrag);
}

// ---------------------------------------------------------------------------
// 12. Layout Mode Switcher (Editor / Split / Preview)
// ---------------------------------------------------------------------------
function setupModeSwitcher() {
  const btnEditor = document.getElementById('btnModeEditor');
  const btnSplit = document.getElementById('btnModeSplit');
  const btnPreview = document.getElementById('btnModePreview');

  const setMode = (mode) => {
    state.activeMode = mode;
    [btnEditor, btnSplit, btnPreview].forEach((b) => b.classList.remove('active'));

    if (mode === 'editor') {
      btnEditor.classList.add('active');
      editorPane.style.width = '100%';
      editorPane.style.display = 'flex';
      previewPane.style.display = 'none';
      resizerGutter.style.display = 'none';
    } else if (mode === 'preview') {
      btnPreview.classList.add('active');
      previewPane.style.width = '100%';
      previewPane.style.display = 'flex';
      editorPane.style.display = 'none';
      resizerGutter.style.display = 'none';
    } else {
      btnSplit.classList.add('active');
      editorPane.style.width = `${state.splitRatio * 100}%`;
      previewPane.style.width = `${(1 - state.splitRatio) * 100}%`;
      editorPane.style.display = 'flex';
      previewPane.style.display = 'flex';
      resizerGutter.style.display = 'flex';
    }
  };

  btnEditor.onclick = () => setMode('editor');
  btnSplit.onclick = () => setMode('split');
  btnPreview.onclick = () => setMode('preview');
}

// ---------------------------------------------------------------------------
// 13. Event Listeners & Adaptive Geometry Solver Trigger
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Diagnostics Drawer
  document.getElementById('btnOpenDiagnostics').onclick = () => {
    diagnosticsDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    renderDiagContent();
  };
  document.getElementById('btnCloseDrawer').onclick = () => {
    diagnosticsDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  };

  // Modular Content Selector Drawer
  document.getElementById('btnOpenContentSelector').onclick = () => {
    contentSelectorDrawer.classList.add('open');
    drawerBackdrop.classList.add('open');
    renderContentSelector();
  };
  document.getElementById('btnCloseContentSelector').onclick = () => {
    contentSelectorDrawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  };

  // Backdrop click closes drawers
  drawerBackdrop.onclick = () => {
    diagnosticsDrawer.classList.remove('open');
    contentSelectorDrawer.classList.remove('open');
    window.closeEvidenceModal();
  };

  document.getElementById('btnCloseModal').onclick = window.closeEvidenceModal;

  // Adaptive 1-Page Geometry Solver
  document.getElementById('btnAutoFit').onclick = () => {
    state.isTightSpacing = !state.isTightSpacing;
    if (state.isTightSpacing) {
      resumePaper.classList.add('tight-spacing');
      pageBudgetBadge.className = 'page-budget-indicator fit';
      pageBudgetText.textContent = '1 Page Target (100% Fit)';
      fitBtnLabel.textContent = 'Standard Margins';
      resumePaper.classList.remove('overflow-simulated');
    } else {
      resumePaper.classList.remove('tight-spacing');
      if (state.isOverflowing) {
        resumePaper.classList.add('overflow-simulated');
        pageBudgetBadge.className = 'page-budget-indicator overflow';
        pageBudgetText.textContent = 'Page Count: 2 Pages (Overflow)';
      }
      fitBtnLabel.textContent = 'Fit to 1 Page';
    }
  };

  // Zoom Controls
  document.getElementById('btnZoomIn').onclick = () => {
    state.zoom = Math.min(1.4, state.zoom + 0.1);
    resumePaper.style.transform = `scale(${state.zoom})`;
    resumePaper.style.transformOrigin = 'top center';
    document.getElementById('zoomLevelText').textContent = `${Math.round(state.zoom * 100)}%`;
  };
  document.getElementById('btnZoomOut').onclick = () => {
    state.zoom = Math.max(0.7, state.zoom - 0.1);
    resumePaper.style.transform = `scale(${state.zoom})`;
    resumePaper.style.transformOrigin = 'top center';
    document.getElementById('zoomLevelText').textContent = `${Math.round(state.zoom * 100)}%`;
  };
}

// ---------------------------------------------------------------------------
// 14. Demo State Switcher (Reviewer Convenience Toolbar)
// ---------------------------------------------------------------------------
function setupDemoStateSwitcher() {
  const btns = {
    stateDefault: document.getElementById('stateDefault'),
    stateProposal: document.getElementById('stateProposal'),
    stateStale: document.getElementById('stateStale'),
    stateOverflow: document.getElementById('stateOverflow'),
    stateEvidence: document.getElementById('stateEvidence'),
    stateAudit: document.getElementById('stateAudit'),
  };

  const clearActive = () => Object.values(btns).forEach((b) => b.classList.remove('active'));

  btns.stateDefault.onclick = () => {
    clearActive();
    btns.stateDefault.classList.add('active');
    state.proposalOpen = false;
    state.isStale = false;
    state.isOverflowing = false;
    state.isTightSpacing = false;
    resumePaper.classList.remove('overflow-simulated', 'tight-spacing');
    pageBudgetBadge.className = 'page-budget-indicator fit';
    pageBudgetText.textContent = '1 Page Target (100% Fit)';
    drawerBackdrop.click();
    renderEditor();
    renderResumePaper();
  };

  btns.stateProposal.onclick = () => {
    clearActive();
    btns.stateProposal.classList.add('active');
    drawerBackdrop.click();
    window.triggerProposal('exp-1-b1');
  };

  btns.stateStale.onclick = () => {
    clearActive();
    btns.stateStale.classList.add('active');
    drawerBackdrop.click();
    window.triggerProposal('exp-1-b1');
    const input = document.getElementById('input-exp-1-b1');
    if (input) {
      input.value = 'Architected global edge proxy with custom modifications.';
      window.handleBulletInput('exp-1-b1', input);
    }
  };

  btns.stateOverflow.onclick = () => {
    clearActive();
    btns.stateOverflow.classList.add('active');
    drawerBackdrop.click();
    state.isOverflowing = true;
    state.isTightSpacing = false;
    resumePaper.classList.remove('tight-spacing');
    resumePaper.classList.add('overflow-simulated');
    pageBudgetBadge.className = 'page-budget-indicator overflow';
    pageBudgetText.textContent = 'Page Count: 2 Pages (Overflow)';
  };

  btns.stateEvidence.onclick = () => {
    clearActive();
    btns.stateEvidence.classList.add('active');
    window.inspectEvidence('ev-1');
  };

  btns.stateAudit.onclick = () => {
    clearActive();
    btns.stateAudit.classList.add('active');
    document.getElementById('btnOpenDiagnostics').click();
  };
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);
