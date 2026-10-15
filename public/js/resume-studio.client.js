import { connectStudioDocuments } from './resume-studio-documents.client.js';
import { sameIds, compareDrafts, selectionKeys } from './resume-studio-state.js';
/**
 * @file Resume Studio Client-Side Controller (Slice 3: AI Proposals & Safe Conflict Merge)
 *
 * Implements:
 * 1. Evidence-Grounded AI Bullet Proposals:
 *    - POST /api/v1/resume-studio/drafts/:id/proposals
 *    - GET /api/v1/resume-studio/drafts/:id/proposals/:proposalId
 *    - POST /api/v1/resume-studio/drafts/:id/proposals/:proposalId/decision
 * 2. Safe Field-Level Concurrency Conflict Resolution & Review (HTTP 409 DRAFT_REVISION_CONFLICT):
 *    - Compares server updates vs local candidate edits
 *    - Preserves non-conflicting field updates automatically from both sides
 *    - Prompts explicit candidate choice for direct field collisions
 *    - Never silently overwrites or discards candidate work
 * 3. Persistent Draft Creation, Retrieval & Autosave (Slice 2)
 * 4. Content Selection Management (experiences, projects [max 4], bullets, skills)
 * 5. Accurate Editing Preview (clearly labeled as client simulation, not verified compiled PDF)
 * 6. Deterministic Candidate-Job Qualification Analysis (Slice 1)
 */

(function () {
  'use strict';

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const container = document.querySelector('.rs-container');
  const jobForm = document.getElementById('jobTargetForm');
  const baseResumeSelect = document.getElementById('baseResumeSelect');
  const jobTitleInput = document.getElementById('jobTitle');
  const jobCompanyInput = document.getElementById('jobCompany');
  const jobUrlInput = document.getElementById('jobSourceUrl');
  const jobDescTextarea = document.getElementById('jobDescription');
  const charCounter = document.getElementById('charCounter');
  const btnCreateDraft = document.getElementById('btnCreateDraft');
  const btnAnalyze = document.getElementById('btnRunAnalysis');
  const alertContainer = document.getElementById('studioAlertContainer');

  // Status & Concurrency Indicators
  const saveStatusEl = document.getElementById('rsSaveStatus');
  const saveStatusTextEl = document.getElementById('rsSaveStatusText');
  const revisionBadgeEl = document.getElementById('rsRevisionBadge');
  const conflictBanner = document.getElementById('rsConflictBanner');
  const actualRevEl = document.getElementById('rsActualRev');
  const expectedRevEl = document.getElementById('rsExpectedRev');
  const btnConflictReview = document.getElementById('btnConflictReview');
  const btnConflictReload = document.getElementById('btnConflictReload');

  // Conflict Review Modal
  const conflictModalBackdrop = document.getElementById('rsConflictModalBackdrop');
  const conflictModalBody = document.getElementById('rsConflictModalBody');
  const btnCloseConflictModal = document.getElementById('btnCloseConflictModal');
  const btnConflictModalCancel = document.getElementById('btnConflictModalCancel');
  const btnConflictModalApply = document.getElementById('btnConflictModalApply');

  // Workspace & Cards
  const splitWorkspace = document.getElementById('studioSplitWorkspace');
  const leftPane = document.getElementById('studioLeftPane');
  const divider = document.getElementById('studioDivider');
  const structuredEditorCard = document.getElementById('structuredEditorCard');
  const structuredEditorContainer = document.getElementById('structuredEditorContainer');
  const draftIdDisplay = document.getElementById('rsDraftIdDisplay');
  const editorStateBadge = document.getElementById('rsEditorStateBadge');
  const targetIndicatorEl = document.getElementById('studioTargetIndicator');

  // Scoreboard Elements
  const fitScoreEl = document.getElementById('valFitScore');
  const fitBandEl = document.getElementById('valFitBand');
  const kwCoverageEl = document.getElementById('valKwCoverage');
  const kwDetailEl = document.getElementById('valKwDetail');

  // Tabs & Panels
  const tabButtons = document.querySelectorAll('.rs-tab-btn');
  const tabPanels = document.querySelectorAll('.rs-tab-panel');
  const reqListEl = document.getElementById('reqListContainer');
  const projectListEl = document.getElementById('projectListContainer');
  const writingContainerEl = document.getElementById('writingDiagnosticsContainer');
  const denominatorAuditContainer = document.getElementById('denominatorAuditContainer');

  // Drawers
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const drawerDiagnostics = document.getElementById('drawerDiagnostics');
  const drawerEvidence = document.getElementById('drawerEvidence');
  const drawerModular = document.getElementById('drawerModular');
  const modularDrawerContent = document.getElementById('modularDrawerContent');
  const btnOpenDiagnostics = document.getElementById('btnOpenDiagnostics');
  const btnOpenEvidence = document.getElementById('btnOpenEvidence');
  const btnOpenModular = document.getElementById('btnOpenModular');

  // =========================================================================
  // State Management
  // =========================================================================
  let currentDraft = null;
  let savedDraft = null;
  let saveTask = null;
  let decisionBusy = false;
  let restoreBusy = false;
  const busyDisabled = new WeakMap();
  function setInteractionBusy(value) {
    restoreBusy = value;
    for (const field of [
      ...structuredEditorContainer.querySelectorAll('input,textarea,button'),
      btnCreateDraft,
      btnOpenModular,
    ]) {
      if (value) {
        busyDisabled.set(field, field.disabled);
        field.disabled = true;
      } else if (busyDisabled.has(field)) {
        field.disabled = busyDisabled.get(field);
        busyDisabled.delete(field);
      }
    }
    structuredEditorCard.setAttribute('aria-busy', String(value));
  }
  let currentRevision = 1;
  let isSaving = false;
  let hasConflict = false;
  let saveDebounceTimer = null;
  let conflictData = null;

  // Active Pending Mutation Queue
  const pendingEdits = new Map(); // nodeId -> { nodeId, text }
  let activeSelection = {
    experienceIds: new Set(),
    projectIds: new Set(),
    bulletIds: new Set(),
    skillIds: new Set(),
  };

  // Proposals Map: nodeId -> proposal object
  const activeProposals = new Map();

  // Node Indexing Caches
  let nodesById = new Map();
  let nodesByPath = new Map();

  // Read-only state check
  const isReadOnly = container?.dataset?.readonly === 'true';
  const documents = connectStudioDocuments({
    state: () => ({
      draft: currentDraft,
      pending: isSaving || pendingEdits.size > 0 || hasSelectionChanged(),
      readonly: isReadOnly,
      conflict: hasConflict,
    }),
    save: saveDraft,
    csrf: getCsrfToken,
    message: showAlert,
    onConflict: handleRevisionConflict,
    onRestore: initializeDraft,
    setInteractionBusy,
  });

  // CSRF retrieval
  function getCsrfToken() {
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag && metaTag.content) return metaTag.content;
    const inputTag = document.querySelector('input[name="_csrf"]');
    if (inputTag && inputTag.value) return inputTag.value;
    if (container && container.dataset.csrf) return container.dataset.csrf;
    return '';
  }

  // HTML Escaping Utility
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Display Alerts
  function showAlert(message, type = 'error') {
    if (!alertContainer) return;
    alertContainer.innerHTML = `
      <div class="rs-alert rs-alert-${type}" role="alert">
        ${escapeHtml(message)}
      </div>
    `;
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearAlert() {
    if (alertContainer) alertContainer.innerHTML = '';
  }

  // Save Status Indicator
  function setSaveStatus(state, message) {
    if (!saveStatusEl || !saveStatusTextEl) return;
    saveStatusEl.style.display = 'inline-flex';
    saveStatusEl.className = `rs-save-status rs-save-${state}`;
    saveStatusTextEl.textContent = message;
    document.getElementById('btnRetrySave').hidden = state !== 'failed';
  }

  // Character Counter
  function updateCharCount() {
    if (!jobDescTextarea || !charCounter) return;
    const len = jobDescTextarea.value.trim().length;
    charCounter.textContent = `${len.toLocaleString()} characters (min 100)`;
    if (len < 100) {
      charCounter.className = 'rs-char-counter warning';
    } else if (len > 50000) {
      charCounter.className = 'rs-char-counter danger';
      charCounter.textContent = `${len.toLocaleString()} chars (truncation warning at 50,000)`;
    } else {
      charCounter.className = 'rs-char-counter';
    }
  }

  if (jobDescTextarea) {
    jobDescTextarea.addEventListener('input', updateCharCount);
  }

  // Tab Navigation
  document.querySelector('.rs-tab-nav').setAttribute('role', 'tablist');
  tabPanels.forEach((panel) => panel.setAttribute('role', 'tabpanel'));
  tabButtons.forEach((btn) => {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', btn.dataset.tab);
    btn.setAttribute('aria-selected', String(btn.classList.contains('active')));
    btn.tabIndex = btn.classList.contains('active') ? 0 : -1;
    btn.addEventListener('keydown', (event) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const buttons = [...tabButtons],
        index = buttons.indexOf(btn);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      buttons[next].click();
    });
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      tabButtons.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      tabButtons.forEach((button) => {
        button.setAttribute('aria-selected', String(button === btn));
        button.tabIndex = button === btn ? 0 : -1;
      });
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Drawer Controls
  let layer = null,
    previousFocus = null;
  function focusLayer(element) {
    layer = element;
    previousFocus = document.activeElement;
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    splitWorkspace.inert = true;
    document.querySelector('.rs-header').inert = true;
    element.querySelector('button,input,textarea,a[href]')?.focus();
  }
  function releaseLayer() {
    if (!layer) return;
    layer = null;
    splitWorkspace.inert = false;
    document.querySelector('.rs-header').inert = false;
    previousFocus?.focus();
  }
  document.addEventListener('keydown', (event) => {
    if (!layer) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAllDrawers();
      closeConflictModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...layer.querySelectorAll('button,input,textarea,a[href]')].filter(
      (el) => !el.disabled && el.getClientRects().length
    );
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  function openDrawer(drawer) {
    if (!drawer) return;
    closeAllDrawers();
    drawer.classList.add('open');
    if (drawerBackdrop) drawerBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    focusLayer(drawer);
  }

  function closeAllDrawers() {
    [drawerDiagnostics, drawerEvidence, drawerModular].forEach((d) => {
      if (d) d.classList.remove('open');
    });
    if (drawerBackdrop) drawerBackdrop.classList.remove('open');
    document.body.style.overflow = '';
    releaseLayer();
  }

  if (btnOpenDiagnostics)
    btnOpenDiagnostics.addEventListener('click', () => openDrawer(drawerDiagnostics));
  if (btnOpenEvidence)
    btnOpenEvidence.addEventListener('click', () => {
      if (currentDraft) {
        const host = document.getElementById('evidenceItemsContainer');
        host.replaceChildren();
        const note = document.createElement('p');
        note.textContent =
          'This draft was cloned from your reviewed master, version ' +
          currentDraft.sourceVersion +
          '. Its statements are candidate-reported claims. Wording edits do not independently verify them.';
        const link = document.createElement('a');
        link.href = '/resumes/' + currentDraft.sourceResumeId;
        link.textContent = 'Open original master';
        host.append(note, link);
      }
      openDrawer(drawerEvidence);
    });
  if (btnOpenModular) btnOpenModular.addEventListener('click', () => openDrawer(drawerModular));
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeAllDrawers);

  document.querySelectorAll('.rs-drawer-close').forEach((btn) => {
    btn.addEventListener('click', closeAllDrawers);
  });

  // Divider Resizing
  let isDraggingDivider = false;
  if (divider && leftPane && splitWorkspace) {
    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDraggingDivider = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingDivider) return;
      const workspaceRect = splitWorkspace.getBoundingClientRect();
      const newLeftWidth = e.clientX - workspaceRect.left;
      const totalWidth = workspaceRect.width;
      const pct = (newLeftWidth / totalWidth) * 100;
      if (pct >= 30 && pct <= 70) {
        leftPane.style.width = `${pct}%`;
        divider.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingDivider) {
        isDraggingDivider = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // =========================================================================
  // Indexing & Node Lookups
  // =========================================================================
  function indexNodes(nodes) {
    nodesById = new Map();
    nodesByPath = new Map();
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      nodesById.set(node.nodeId, node);
      const pathStr = Array.isArray(node.path) ? node.path.join('.') : String(node.path);
      nodesByPath.set(pathStr, node);
    }
  }

  function getNodeText(structuredResume, path) {
    if (!structuredResume || !Array.isArray(path)) return '';
    let target = structuredResume;
    for (let i = 0; i < path.length; i++) {
      if (target === undefined || target === null) return '';
      target = target[path[i]];
    }
    return typeof target === 'string' ? target : '';
  }

  // =========================================================================
  // Draft Lifecycle Operations
  // =========================================================================
  function initializeDraft(draft) {
    clearAlert();
    currentDraft = structuredClone(draft);
    savedDraft = structuredClone(draft);
    currentRevision = typeof draft.revision === 'number' ? draft.revision : 1;
    hasConflict = false;
    pendingEdits.clear();
    activeProposals.clear();

    if (conflictBanner) conflictBanner.classList.remove('active');
    closeConflictModal();

    indexNodes(draft.nodes || []);

    const sel = draft.selection || {};
    activeSelection = {
      experienceIds: new Set(sel.experienceIds || []),
      projectIds: new Set(sel.projectIds || []),
      bulletIds: new Set(sel.bulletIds || []),
      skillIds: new Set(sel.skillIds || []),
    };

    if (revisionBadgeEl) {
      revisionBadgeEl.style.display = 'inline-block';
      revisionBadgeEl.textContent = `Rev ${currentRevision}`;
    }

    if (draftIdDisplay) {
      draftIdDisplay.textContent = `Draft ID: ${draft.id.slice(0, 8)}…`;
    }

    if (editorStateBadge) {
      editorStateBadge.textContent = isReadOnly ? 'Read Only' : 'Active Draft';
    }

    if (targetIndicatorEl && draft.jobTarget) {
      const title = draft.jobTarget.title || 'Target Role';
      const company = draft.jobTarget.company ? ` at ${draft.jobTarget.company}` : '';
      targetIndicatorEl.innerHTML = `<span>Target: <strong>${escapeHtml(title + company)}</strong></span>`;
    }

    if (draft.jobTarget) {
      if (jobTitleInput && draft.jobTarget.title) {
        jobTitleInput.value = draft.jobTarget.title;
      }
      if (jobCompanyInput && draft.jobTarget.company) {
        jobCompanyInput.value = draft.jobTarget.company;
      }
      if (jobUrlInput && draft.jobTarget.sourceUrl) {
        jobUrlInput.value = draft.jobTarget.sourceUrl;
      }
      if (jobDescTextarea && draft.jobTarget.rawDescription) {
        jobDescTextarea.value = draft.jobTarget.rawDescription;
        updateCharCount();
      }
    }

    if (structuredEditorCard) {
      structuredEditorCard.style.display = 'block';
    }
    document.getElementById('rsJobDetails').open = false;

    for (const field of [jobTitleInput, jobCompanyInput, jobUrlInput, jobDescTextarea])
      if (field) field.readOnly = true;
    renderStructuredEditor(draft);
    renderLiveDocumentPreview(draft);
    renderModularDrawer();

    setSaveStatus('saved', 'All changes saved');
    documents.loaded();
    loadProposals(draft.id);
    refreshDraftDiagnostics();

    const tabDoc = document.getElementById('tabDocumentPreview');
    if (tabDoc) tabDoc.click();
  }

  async function createDraft() {
    clearAlert();
    if (isReadOnly || restoreBusy) return;
    if (currentDraft) {
      await saveDraft();
      if (hasConflict || pendingEdits.size || hasSelectionChanged()) return;
    }

    const resumeId = baseResumeSelect ? baseResumeSelect.value : null;
    if (!resumeId) {
      showAlert('Please select an owned canonical base resume.');
      return;
    }

    const title = (jobTitleInput ? jobTitleInput.value : '').trim();
    const company = (jobCompanyInput ? jobCompanyInput.value : '').trim();
    const sourceUrl = (jobUrlInput ? jobUrlInput.value : '').trim();
    const rawDescription = (jobDescTextarea ? jobDescTextarea.value : '').trim();

    if (rawDescription.length < 100) {
      showAlert('Job description must be at least 100 characters to create a tailored draft.');
      if (jobDescTextarea) jobDescTextarea.focus();
      return;
    }

    const jobTarget = { rawDescription };
    if (title) jobTarget.title = title;
    if (company) jobTarget.company = company;
    if (sourceUrl) jobTarget.sourceUrl = sourceUrl;

    const payload = {
      source: { kind: 'RESUME', resumeId },
      jobTarget,
    };

    const csrfToken = getCsrfToken();

    if (btnCreateDraft) {
      btnCreateDraft.disabled = true;
      btnCreateDraft.innerHTML = `<span class="rs-spinner" aria-hidden="true"></span> <span>Creating Draft…</span>`;
    }

    try {
      const response = await fetch('/api/v1/resume-studio/drafts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
          Origin: window.location.origin,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          showAlert('Your session has expired. Please sign in again.');
        } else if (response.status === 403) {
          showAlert(json?.error?.message || 'Access denied or CSRF token invalid.');
        } else if (response.status === 404) {
          showAlert(
            json?.error?.message || 'Base master resume not found or unlinked to candidate.'
          );
        } else if (response.status === 409) {
          showAlert(json?.error?.message || 'Master resume snapshot is unavailable or not ready.');
        } else {
          showAlert(json?.error?.message || `Failed to create draft (HTTP ${response.status}).`);
        }
        return;
      }

      if (json && json.success && json.data) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('draftId', json.data.id);
        window.history.replaceState(null, '', newUrl.toString());

        initializeDraft(json.data);
      }
    } catch (err) {
      showAlert(`Network error: ${err.message || 'Failed to connect to draft service.'}`);
    } finally {
      if (btnCreateDraft) {
        btnCreateDraft.disabled = false;
        btnCreateDraft.innerHTML = `<span>Create Tailored Draft</span>`;
      }
    }
  }

  async function openGeneratedResume(generationId) {
    clearAlert();
    setSaveStatus('saving', 'Opening generated resume...');
    try {
      const response = await fetch('/api/v1/resume-studio/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': getCsrfToken(),
          Origin: window.location.origin,
        },
        body: JSON.stringify({ generationId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !json.data) {
        showAlert(
          json?.error?.message || 'Could not open this generated resume. Refresh to retry.'
        );
        setSaveStatus('failed', 'Open failed');
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('generationId');
      url.searchParams.set('draftId', json.data.id);
      window.history.replaceState(null, '', url.toString());
      initializeDraft(json.data);
    } catch {
      showAlert('Could not connect to the resume service. Refresh to retry opening this version.');
      setSaveStatus('failed', 'Open failed');
    }
  }

  async function loadDraft(draftId) {
    if (!draftId) return;
    clearAlert();

    setSaveStatus('saving', 'Loading draft…');

    try {
      const response = await fetch(`/api/v1/resume-studio/drafts/${encodeURIComponent(draftId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Origin: window.location.origin,
        },
        credentials: 'include',
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          showAlert('Session expired. Please sign in again.');
        } else if (response.status === 404) {
          showAlert('Persisted draft not found or unauthorized.');
        } else {
          showAlert(json?.error?.message || `Failed to load draft (HTTP ${response.status}).`);
        }
        setSaveStatus('failed', 'Load failed');
        return;
      }

      if (json && json.success && json.data) {
        initializeDraft(json.data);
      }
    } catch (err) {
      showAlert(`Network error: ${err.message || 'Failed to load draft.'}`);
      setSaveStatus('failed', 'Load failed');
    }
  }

  // =========================================================================
  // Autosave & Concurrency Control (expectedRevision)
  // =========================================================================
  function queueTextEdit(nodeId, newText) {
    if (!currentDraft || isReadOnly || hasConflict || restoreBusy) return;

    pendingEdits.set(nodeId, { nodeId, text: newText });

    // Invalidate active proposal on this node if candidate manually edited text
    for (const [id, proposal] of activeProposals) renderProposalCard(id, proposal);

    applyLocalTextEditToModel(nodeId, newText);
    updateRoleLabels();
    renderLiveDocumentPreview(currentDraft);

    setSaveStatus('unsaved', 'Unsaved changes');

    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveDraft();
    }, 750);
  }

  function toggleSelection(kind, id, isIncluded) {
    if (!currentDraft || isReadOnly || hasConflict || restoreBusy) return;

    const set = activeSelection[kind];
    if (!set) return;

    if (kind === 'projectIds' && isIncluded) {
      if (set.size >= 4) {
        showAlert('Maximum 4 projects can be selected for this draft.', 'warning');
        renderStructuredEditor(currentDraft);
        return;
      }
    }

    if (isIncluded) {
      set.add(id);
    } else {
      set.delete(id);
    }
    for (const [node, proposal] of activeProposals) renderProposalCard(node, proposal);

    renderLiveDocumentPreview(currentDraft);
    renderModularDrawer();

    setSaveStatus('unsaved', 'Unsaved changes');

    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveDraft();
    }, 300);
  }

  function saveDraft() {
    if (saveTask) return saveTask;
    saveTask = performSaveDraft().finally(() => {
      saveTask = null;
    });
    return saveTask;
  }

  async function performSaveDraft() {
    if (!currentDraft || isSaving || hasConflict || isReadOnly) return;

    if (pendingEdits.size === 0 && !hasSelectionChanged()) {
      setSaveStatus('saved', 'All changes saved');
      return;
    }

    const editsPayload = Array.from(pendingEdits.values());
    const selectionPayload = {
      experienceIds: Array.from(activeSelection.experienceIds),
      projectIds: Array.from(activeSelection.projectIds),
      bulletIds: Array.from(activeSelection.bulletIds),
      skillIds: Array.from(activeSelection.skillIds),
    };

    const payload = {
      expectedRevision: currentRevision,
    };
    if (editsPayload.length > 0) {
      payload.edits = editsPayload;
    }
    payload.selection = selectionPayload;

    const inFlightEdits = new Map(pendingEdits);
    isSaving = true;
    setSaveStatus('saving', 'Saving…');

    const csrfToken = getCsrfToken();

    try {
      const response = await fetch(
        `/api/v1/resume-studio/drafts/${encodeURIComponent(currentDraft.id)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-csrf-token': csrfToken,
            Origin: window.location.origin,
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        isSaving = false;

        if (response.status === 409) {
          // HTTP 409 CONFLICT: DRAFT_REVISION_CONFLICT
          await handleRevisionConflict(json);
          return;
        }

        if (response.status === 401) {
          showAlert('Session expired while saving. Please sign in in another tab and retry.');
        } else if (response.status === 403) {
          showAlert(json?.error?.message || 'Permission denied or CSRF invalid.');
        } else if (response.status === 400) {
          showAlert(json?.error?.message || 'Validation error while saving edits.');
        } else if (response.status === 413) {
          showAlert('Draft content exceeds storage bound (1 MiB plaintext).');
        } else {
          showAlert(json?.error?.message || `Save failed (HTTP ${response.status}).`);
        }

        setSaveStatus('failed', 'Save failed');
        return;
      }

      // Success 200 OK
      isSaving = false;
      if (json && json.success && json.data) {
        savedDraft = structuredClone(json.data);
        clearAlert();
        currentDraft = structuredClone(json.data);
        currentRevision = currentDraft.revision;

        for (const [nodeId, edit] of inFlightEdits.entries()) {
          if (pendingEdits.get(nodeId)?.text === edit.text) {
            pendingEdits.delete(nodeId);
            const node = nodesById.get(nodeId),
              field = structuredEditorContainer.querySelector(
                `.rs-edit-input[data-node-id="${nodeId}"]`
              );
            if (node && field) field.value = getNodeText(currentDraft.structuredResume, node.path);
          }
        }
        for (const edit of pendingEdits.values()) applyLocalTextEditToModel(edit.nodeId, edit.text);
        updateRoleLabels();

        if (revisionBadgeEl) {
          revisionBadgeEl.textContent = `Rev ${currentRevision}`;
        }

        if (pendingEdits.size > 0 || hasSelectionChanged()) {
          await performSaveDraft();
        } else {
          setSaveStatus('saved', 'All changes saved');
          documents.schedule();
          refreshDraftDiagnostics();
        }
        for (const [node, proposal] of activeProposals) renderProposalCard(node, proposal);
      }
    } catch (err) {
      isSaving = false;
      showAlert(`Network error while saving: ${err.message}`);
      setSaveStatus('failed', 'Network error');
    }
  }

  function hasSelectionChanged() {
    if (!currentDraft || !currentDraft.selection) return false;
    return selectionKeys.some((key) => !sameIds(activeSelection[key], savedDraft.selection[key]));
  }

  function applyLocalTextEditToModel(nodeId, newText) {
    const node = nodesById.get(nodeId);
    if (!node || !currentDraft || !currentDraft.structuredResume) return;
    const path = node.path;
    if (!Array.isArray(path)) return;

    let target = currentDraft.structuredResume;
    for (let i = 0; i < path.length - 1; i++) {
      if (target[path[i]] === undefined) return;
      target = target[path[i]];
    }
    target[path[path.length - 1]] = newText;
    if (path[0] === 'experience' && path[2] === 'endDate' && newText?.trim())
      target.isCurrent = /^(present|current|ongoing)$/i.test(newText.trim());
  }
  function updateRoleLabels() {
    for (const label of structuredEditorContainer.querySelectorAll('[data-role-index]')) {
      const role = currentDraft.structuredResume.experience[Number(label.dataset.roleIndex)];
      label.textContent =
        label.dataset.roleField === 'title'
          ? role.title || 'Role'
          : label.dataset.roleField === 'company'
            ? role.company
              ? 'at ' + role.company
              : ''
            : [role.startDate, role.isCurrent ? 'Present' : role.endDate]
                .filter(Boolean)
                .join(' – ');
    }
  }

  // =========================================================================
  // Part A: Safe Field-Level Concurrency Conflict Resolution
  // =========================================================================

  /**
   * Handles 409 DRAFT_REVISION_CONFLICT:
   * Fetches latest server version, computes field-level differences, and retains unsaved local edits.
   */
  async function handleRevisionConflict(errorJson) {
    hasConflict = true;
    structuredEditorContainer?.querySelectorAll('input,textarea,button').forEach((input) => {
      input.disabled = true;
    });
    documents.invalidate();
    const details = errorJson?.error?.details?.[0] || {};
    const actualRev = details.actualRevision || currentRevision + 1;
    const expRev = details.expectedRevision || currentRevision;

    // Fetch latest authoritative server draft without destroying local work
    let serverDraft = null;
    try {
      const res = await fetch(
        `/api/v1/resume-studio/drafts/${encodeURIComponent(currentDraft.id)}`,
        {
          headers: { Accept: 'application/json' },
        }
      );
      const data = await res.json();
      if (data?.success && data?.data) {
        serverDraft = data.data;
      }
    } catch {
      serverDraft = null;
    }

    conflictData = {
      expectedRevision: expRev,
      actualRevision: actualRev,
      baseDraft: structuredClone(savedDraft),
      localSelection: Object.fromEntries(
        selectionKeys.map((key) => [key, [...activeSelection[key]]])
      ),
      serverDraft,
      preservedEdits: new Map(pendingEdits),
      fieldConflicts: [],
      safeMerges: [],
    };

    // Analyze Field Differences
    if (serverDraft) {
      analyzeConflictDiffs(conflictData);
    }

    if (actualRevEl) actualRevEl.textContent = String(actualRev);
    if (expectedRevEl) expectedRevEl.textContent = String(expRev);
    if (conflictBanner) conflictBanner.classList.add('active');

    setSaveStatus('conflict', 'Revision conflict detected');
  }

  /**
   * Classifies changes into Safe Non-Conflicting Merges vs Direct Collisions.
   */
  function analyzeConflictDiffs(data) {
    Object.assign(
      data,
      compareDrafts(data.baseDraft, data.serverDraft, data.preservedEdits, data.localSelection)
    );
    for (const entry of [...data.fieldConflicts, ...data.safeMerges])
      entry.fieldLabel = formatNodePathLabel(entry.path);
  }

  function formatNodePathLabel(path) {
    if (!Array.isArray(path)) return 'Field';
    const label = (key) =>
      String(key)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (char) => char.toUpperCase());
    if (path[0] === 'candidateIdentity') return label(path[1]);
    if (path[0] === 'summary') return 'Professional Summary';
    if (path[0] === 'experience') {
      const idx = path[1];
      if (path[2] === 'bullets') return `Experience #${idx + 1} Bullet #${path[3] + 1}`;
      return `Experience #${idx + 1}: ${label(path[2])}`;
    }
    if (path[0] === 'projects') {
      const idx = path[1];
      if (path[2] === 'bullets') return `Project #${idx + 1} Bullet #${path[3] + 1}`;
      return `Project #${idx + 1}: ${label(path[2])}`;
    }
    return path.join(' · ');
  }

  function openConflictModal() {
    if (!conflictModalBackdrop || !conflictData) return;
    renderConflictModalContent(conflictData);
    conflictModalBackdrop.classList.add('open');
    focusLayer(conflictModalBackdrop);
  }

  function closeConflictModal() {
    if (conflictModalBackdrop) conflictModalBackdrop.classList.remove('open');
    releaseLayer();
  }

  function renderConflictModalContent(data) {
    if (!conflictModalBody) return;

    let html = `
      <div style="font-size:0.82rem; color:var(--rs-text-secondary); margin-bottom:16px; line-height:1.45;">
        Another session updated this draft on the server (now at <strong>Revision ${data.actualRevision}</strong>).
        Your unsaved edits from <strong>Revision ${data.expectedRevision}</strong> have been safely retained in memory.
      </div>
    `;

    // 1. Safe Non-Conflicting Updates
    if (data.safeMerges && data.safeMerges.length > 0) {
      html += `
        <div class="rs-conflict-field-card safe-merge">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="font-size:0.82rem; color:var(--rs-status-verified);">
              ✓ Safe Non-Conflicting Server Updates (${data.safeMerges.length})
            </strong>
            <span class="rs-badge" style="font-size:0.65rem;">Auto-Mergeable</span>
          </div>
          <div style="font-size:0.75rem; color:var(--rs-text-secondary); margin-bottom:6px;">
            These fields were updated on the server and do not conflict with your local edits. They will be safely preserved:
          </div>
          <ul style="margin:0; padding-left:18px; font-size:0.75rem; color:var(--rs-text-muted);">
            ${data.safeMerges.map((s) => `<li><strong>${escapeHtml(s.fieldLabel)}</strong></li>`).join('')}
          </ul>
        </div>
      `;
    }

    // 2. Direct Field Collisions
    if (data.fieldConflicts && data.fieldConflicts.length > 0) {
      html += `
        <div style="font-size:0.82rem; font-weight:600; color:var(--rs-text-primary); margin:14px 0 8px;">
          Direct Field Conflicts (${data.fieldConflicts.length}) — Select Which Version to Keep:
        </div>
      `;

      data.fieldConflicts.forEach((c, idx) => {
        html += `
          <div class="rs-conflict-field-card direct-conflict" data-conflict-idx="${idx}">
            <div style="font-size:0.82rem; font-weight:600; color:var(--rs-text-primary); margin-bottom:6px;">
              ${escapeHtml(c.fieldLabel)}
            </div>

            <div class="rs-conflict-choice-row">
              <label class="rs-conflict-option ${c.selectedChoice === 'local' ? 'selected' : ''}" style="display:block;">
                <input type="radio" name="conflict-choice-${idx}" value="local" ${c.selectedChoice === 'local' ? 'checked' : ''} style="margin-right:6px;">
                <strong style="font-size:0.78rem; color:var(--rs-text-primary);">Keep My Local Edit</strong>
                <div style="font-size:0.75rem; color:var(--rs-text-secondary); margin-top:4px; font-style:italic;">
                  "${escapeHtml(c.localText)}"
                </div>
              </label>

              <label class="rs-conflict-option ${c.selectedChoice === 'server' ? 'selected' : ''}" style="display:block;">
                <input type="radio" name="conflict-choice-${idx}" value="server" ${c.selectedChoice === 'server' ? 'checked' : ''} style="margin-right:6px;">
                <strong style="font-size:0.78rem; color:var(--rs-text-primary);">Take Server Version (Rev ${data.actualRevision})</strong>
                <div style="font-size:0.75rem; color:var(--rs-text-secondary); margin-top:4px; font-style:italic;">
                  "${escapeHtml(c.serverText)}"
                </div>
              </label>
            </div>
          </div>
        `;
      });
    } else {
      html += `
        <div class="rs-card" style="font-size:0.8rem; color:var(--rs-text-secondary); padding:12px;">
          No direct field collisions detected. All server updates and local candidate edits can be merged cleanly with zero data loss.
        </div>
      `;
    }

    conflictModalBody.innerHTML = html;
    btnConflictModalApply.disabled =
      !data.serverDraft || data.fieldConflicts.some((c) => !c.selectedChoice);

    // Attach Radio Change Handlers
    conflictModalBody.querySelectorAll('input[type="radio"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const row = e.target.closest('.rs-conflict-choice-row');
        if (row) {
          row
            .querySelectorAll('.rs-conflict-option')
            .forEach((opt) => opt.classList.remove('selected'));
          e.target.closest('.rs-conflict-option').classList.add('selected');
        }
        const card = e.target.closest('.rs-conflict-field-card');
        const cIdx = parseInt(card.dataset.conflictIdx, 10);
        if (data.fieldConflicts[cIdx]) {
          data.fieldConflicts[cIdx].selectedChoice = e.target.value;
          btnConflictModalApply.disabled = data.fieldConflicts.some((c) => !c.selectedChoice);
        }
      });
    });
  }

  // Conflict Resolution Buttons
  if (btnConflictReview) {
    btnConflictReview.addEventListener('click', openConflictModal);
  }

  if (btnCloseConflictModal) {
    btnCloseConflictModal.addEventListener('click', closeConflictModal);
  }

  if (btnConflictModalCancel) {
    btnConflictModalCancel.addEventListener('click', () => {
      closeConflictModal();
      setSaveStatus('conflict', 'Save paused (local edits retained)');
    });
  }

  if (btnConflictReload) {
    btnConflictReload.addEventListener('click', () => {
      if (!currentDraft) return;
      loadDraft(currentDraft.id);
    });
  }

  if (btnConflictModalApply) {
    btnConflictModalApply.addEventListener('click', async () => {
      if (!conflictData?.serverDraft || conflictData.fieldConflicts.some((c) => !c.selectedChoice))
        return;

      // Prepare merged structured draft
      const serverDraft = conflictData.serverDraft;
      const mergedEdits = [];

      // 1. Candidate's non-conflicting edits
      for (const [nodeId, edit] of conflictData.preservedEdits.entries()) {
        const isConflicting = conflictData.fieldConflicts.some((c) => c.nodeId === nodeId);
        if (!isConflicting) {
          mergedEdits.push(edit);
        }
      }

      // 2. Resolved conflicting fields
      for (const c of conflictData.fieldConflicts) {
        if (c.selectedChoice === 'local') {
          mergedEdits.push({ nodeId: c.nodeId, text: c.localText });
        }
      }

      // Adopt server draft baseline and revision
      savedDraft = structuredClone(serverDraft);
      currentDraft = structuredClone(serverDraft);
      activeSelection = Object.fromEntries(
        selectionKeys.map((key) => [key, new Set(conflictData.selection[key])])
      );
      currentRevision = serverDraft.revision;
      indexNodes(currentDraft.nodes);

      // Re-populate pending edits with resolved items
      pendingEdits.clear();
      for (const e of mergedEdits) {
        pendingEdits.set(e.nodeId, e);
      }

      hasConflict = false;
      closeConflictModal();
      if (conflictBanner) conflictBanner.classList.remove('active');

      for (const edit of pendingEdits.values()) applyLocalTextEditToModel(edit.nodeId, edit.text);
      renderStructuredEditor(currentDraft);
      renderModularDrawer();
      await saveDraft();
    });
  }

  // =========================================================================
  // Part B: Evidence-Grounded AI Bullet Proposals
  // =========================================================================

  /**
   * Requests a source-preserving bullet proposal via POST /drafts/:id/proposals.
   */
  async function requestProposal(nodeId) {
    if (!currentDraft || isReadOnly || hasConflict) return;
    clearAlert();

    // Flush any pending text autosave before requesting proposal to coordinate revisions
    if (saveTask || pendingEdits.size > 0 || hasSelectionChanged()) {
      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      await saveDraft();
      if (hasConflict || pendingEdits.size || hasSelectionChanged()) return;
    }

    const draftId = currentDraft.id;
    const slot = document.getElementById(`proposal-slot-${nodeId}`);
    const triggerBtn = document.querySelector(`.rs-btn-propose[data-bullet-node-id="${nodeId}"]`);

    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.innerHTML = `<span class="rs-spinner-sm"></span> <span>Refining…</span>`;
    }

    if (slot) {
      slot.innerHTML = `
        <div class="rs-proposal-card" style="padding:10px 14px;">
          <div style="font-size:0.75rem; color:var(--rs-text-secondary); display:flex; align-items:center; gap:6px;">
            <span class="rs-spinner-sm"></span> Evaluating source-preserving wording refinement…
          </div>
        </div>
      `;
    }

    const csrfToken = getCsrfToken();

    try {
      const response = await fetch(
        `/api/v1/resume-studio/drafts/${encodeURIComponent(currentDraft.id)}/proposals`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-csrf-token': csrfToken,
            Origin: window.location.origin,
          },
          credentials: 'include',
          body: JSON.stringify({
            expectedRevision: currentRevision,
            nodeId,
          }),
        }
      );

      const json = await response.json().catch(() => null);

      if (currentDraft?.id !== draftId) return;
      if (!response.ok) {
        if (response.status === 422) {
          const reason =
            json?.error?.message ||
            'No source-preserving wording change found. Original text already concise.';
          renderProposalUnsupported(slot, reason);
        } else if (response.status === 409) {
          showAlert(
            'Draft was updated during proposal generation. Please save or refresh to evaluate current text.'
          );
          if (slot) slot.innerHTML = '';
        } else if (response.status === 503) {
          renderProposalUnsupported(
            slot,
            'Proposal service temporarily unavailable. You can continue editing manually.'
          );
        } else {
          renderProposalUnsupported(
            slot,
            json?.error?.message || `Proposal generation failed (HTTP ${response.status}).`
          );
        }
        return;
      }

      if (json && json.success && json.data) {
        const proposal = json.data;
        activeProposals.set(nodeId, proposal);
        renderProposalCard(nodeId, proposal);
      }
    } catch (err) {
      renderProposalUnsupported(slot, `Network error: ${err.message}`);
    } finally {
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = `<span>Wording</span>`;
      }
    }
  }

  function renderProposalUnsupported(slot, message) {
    if (!slot) return;
    slot.innerHTML = `
      <div class="rs-proposal-card" style="border-color:var(--rs-border); padding:8px 12px; margin:6px 0 10px 24px;">
        <div style="font-size:0.74rem; color:var(--rs-text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span>${escapeHtml(message)}</span>
          <button type="button" class="rs-drawer-close" style="font-size:1rem; cursor:pointer;" onclick="this.closest('.rs-proposal-card').remove()">&times;</button>
        </div>
      </div>
    `;
  }

  function renderProposalCard(nodeId, proposal) {
    const slot = document.getElementById(`proposal-slot-${nodeId}`);
    if (!slot) return;

    const isStale =
      proposal.status === 'STALE' ||
      proposal.baseRevision !== currentRevision ||
      pendingEdits.size > 0 ||
      hasSelectionChanged();
    const reqText = proposal.jobRequirement?.text || 'Target Skill';
    const truthState = proposal.truthState || 'CLAIMED';
    const claimLabel =
      proposal.claimLabel || (truthState === 'CLAIMED' ? '[Unverified User Claim]' : 'VERIFIED');

    slot.innerHTML = `
      <div class="rs-proposal-card ${isStale ? 'stale' : ''}" id="proposal-${proposal.id}" data-proposal-id="${proposal.id}" data-node-id="${nodeId}">
        <div class="rs-proposal-header">
          <div class="rs-proposal-title">
            <span class="rs-proposal-badge">Wording suggestion</span>
            <span class="rs-req-chip">${escapeHtml(reqText)}</span>
          </div>
          <span class="rs-status-tag rs-status-tag-${truthState}">
            <span class="rs-status-dot"></span>${escapeHtml(claimLabel)}
          </span>
        </div>

        ${
          isStale
            ? `<div class="rs-proposal-stale-notice">
                 <span>Stale proposal: Draft revision has advanced since generation. Re-evaluate current text.</span>
               </div>`
            : ''
        }

        <div class="rs-proposal-diff-box">
          <div class="rs-proposal-diff-row orig">
            <span class="rs-diff-tag">Original</span>
            <div class="rs-proposal-text-orig">${escapeHtml(proposal.originalText)}</div>
          </div>
          <div class="rs-proposal-diff-row proposed">
            <span class="rs-diff-tag">Proposed</span>
            <div class="rs-proposal-text-proposed">${escapeHtml(proposal.proposedText)}</div>
          </div>
        </div>

        <div class="rs-proposal-rationale">
          <strong>Rationale:</strong> ${escapeHtml(proposal.rationale || 'Source-preserving filler cleanup and normalization.')}
        </div>

        ${
          proposal.evidenceLinks && proposal.evidenceLinks.length > 0
            ? `<div class="rs-proposal-evidence">
                 <span style="font-weight:600; font-size:0.72rem; color:var(--rs-text-secondary);">Supporting Evidence:</span>
                 ${proposal.evidenceLinks
                   .map(
                     (e) => `
                     <button type="button" class="rs-evidence-link rs-btn rs-inspect-proposal-source">
                       Inspect ${e.sourceKind === 'DRAFT_EDIT' ? 'candidate edit' : 'master wording'} (${escapeHtml(e.truthState || 'CLAIMED')})
                     </button>
                   `
                   )
                   .join('')}
               </div>`
            : ''
        }

        <div class="rs-proposal-footer">
          <button type="button"
                  class="rs-btn rs-btn-primary rs-btn-sm rs-btn-accept-proposal"
                  data-proposal-id="${proposal.id}"
                  data-node-id="${nodeId}"
                  ${isStale || isReadOnly ? 'disabled' : ''}>
            Accept Proposal
          </button>
          <button type="button"
                  class="rs-btn rs-btn-sm rs-btn-reject-proposal"
                  data-proposal-id="${proposal.id}"
                  data-node-id="${nodeId}"
                  ${isStale || isReadOnly ? 'disabled' : ''}>
            Reject
          </button>
        </div>
      </div>
    `;

    // Attach Action Listeners
    const card = slot.querySelector('.rs-proposal-card');
    const acceptBtn = card.querySelector('.rs-btn-accept-proposal');
    const rejectBtn = card.querySelector('.rs-btn-reject-proposal');
    card.querySelectorAll('.rs-inspect-proposal-source').forEach((button, index) =>
      button.addEventListener('click', () => {
        const evidence = proposal.evidenceLinks[index],
          host = document.getElementById('evidenceItemsContainer');
        host.replaceChildren();
        const source = document.createElement('blockquote');
        source.textContent = evidence.sourceText;
        const note = document.createElement('p');
        note.textContent = `${evidence.truthState}: candidate-reported wording from ${evidence.sourceKind === 'DRAFT_EDIT' ? 'draft revision ' + evidence.draftRevision : 'master version ' + evidence.sourceVersion}. This is not independently verified evidence.`;
        host.append(source, note);
        openDrawer(drawerEvidence);
      })
    );

    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => decideProposal(proposal.id, nodeId, 'ACCEPT'));
    }
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => decideProposal(proposal.id, nodeId, 'REJECT'));
    }
  }

  /**
   * Submits candidate explicit decision (ACCEPT / REJECT) via POST /proposals/:id/decision.
   */
  async function decideProposal(proposalId, nodeId, decision) {
    if (!currentDraft || isReadOnly || hasConflict || decisionBusy) return;
    await saveDraft();
    if (hasConflict || pendingEdits.size || hasSelectionChanged()) return;

    const proposal = activeProposals.get(nodeId);
    if (!proposal) return;
    const draftId = currentDraft.id;

    if (decision === 'ACCEPT' && proposal.baseRevision !== currentRevision) {
      showAlert(
        'Cannot accept proposal: draft revision has changed. Proposal is stale.',
        'warning'
      );
      proposal.status = 'STALE';
      renderProposalCard(nodeId, proposal);
      return;
    }

    const csrfToken = getCsrfToken();
    decisionBusy = true;

    try {
      const response = await fetch(
        `/api/v1/resume-studio/drafts/${encodeURIComponent(currentDraft.id)}/proposals/${encodeURIComponent(proposalId)}/decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-csrf-token': csrfToken,
            Origin: window.location.origin,
          },
          credentials: 'include',
          body: JSON.stringify({
            expectedRevision: currentRevision,
            decision,
          }),
        }
      );

      const json = await response.json().catch(() => null);

      if (currentDraft?.id !== draftId) return;
      if (!response.ok) {
        if (response.status === 409) {
          const reason = json?.error?.details?.[0]?.reason;
          if (reason === 'STALE_PROPOSAL') {
            showAlert(
              'Proposal is stale: draft revision has advanced. Please re-evaluate current wording.',
              'warning'
            );
            proposal.status = 'STALE';
            renderProposalCard(nodeId, proposal);
          } else {
            await handleRevisionConflict(json);
          }
        } else {
          showAlert(json?.error?.message || `Decision failed (HTTP ${response.status}).`);
        }
        return;
      }

      if (json && json.success && json.data) {
        const result = json.data;
        if (decision === 'ACCEPT' && result.draft) {
          // Update draft and revision authoritatively
          savedDraft = structuredClone(result.draft);
          currentDraft = structuredClone(result.draft);
          for (const edit of pendingEdits.values())
            applyLocalTextEditToModel(edit.nodeId, edit.text);
          currentRevision = result.draft.revision;
          indexNodes(currentDraft.nodes);

          // Update bullet textarea in UI
          const textarea = document.querySelector(`.rs-bullet-textarea[data-node-id="${nodeId}"]`);
          if (textarea) {
            textarea.value = pendingEdits.get(nodeId)?.text ?? proposal.proposedText;
            textarea.classList.remove('dirty');
          }

          // Update revision badge and document preview
          if (revisionBadgeEl) revisionBadgeEl.textContent = `Rev ${currentRevision}`;
          renderLiveDocumentPreview(currentDraft);
          for (const [id, other] of activeProposals) renderProposalCard(id, other);
          if (pendingEdits.size || hasSelectionChanged()) await saveDraft();
          else {
            setSaveStatus('saved', 'All changes saved');
            documents.schedule();
            refreshDraftDiagnostics();
          }
        }

        // Remove active proposal card
        activeProposals.delete(nodeId);
        const slot = document.getElementById(`proposal-slot-${nodeId}`);
        if (slot) slot.innerHTML = '';
      }
    } catch (err) {
      showAlert(`Network error: ${err.message}`);
    } finally {
      decisionBusy = false;
    }
  }

  // =========================================================================
  // Structured Editor Rendering
  // =========================================================================
  function renderStructuredEditor(draft) {
    if (!structuredEditorContainer) return;
    const sr = draft.structuredResume || {};
    const prov = draft.nodeProvenance || {};

    let html = '<details class="rs-source-details"><summary>Contact and role details</summary>';
    for (const node of draft.nodes.filter(
      (n) =>
        n.editable &&
        (n.kind === 'IDENTITY' || n.kind === 'TEXT') &&
        n.path.at(-1) !== 'description'
    )) {
      const label = formatNodePathLabel(node.path);
      html += `<label class="rs-label">${escapeHtml(label)}<input class="rs-input rs-edit-input" data-node-id="${node.nodeId}" value="${escapeHtml(getNodeText(sr, node.path))}" ${isReadOnly ? 'disabled' : ''}></label>`;
    }
    html += '</details>';

    // 1. Professional Summary Section
    const summaryNode = nodesByPath.get('summary.text');
    if (summaryNode) {
      const summaryText = sr.summary?.text || '';
      const summaryProv = prov[summaryNode.nodeId]?.truthState || 'CLAIMED';
      html += `
        <div class="rs-node-group">
          <div class="rs-entry-header">
            <span style="font-weight:600; font-size:0.85rem; color:var(--rs-text-primary);">Professional Summary</span>
            <span class="rs-status-tag rs-status-tag-${summaryProv}"><span class="rs-status-dot"></span>${escapeHtml(summaryProv)}</span>
          </div>
          <textarea class="rs-bullet-textarea rs-edit-input"
                    data-node-id="${summaryNode.nodeId}"
                    ${!summaryNode.editable || isReadOnly ? 'disabled' : ''}
                    placeholder="Candidate professional summary..."
                    style="width:100%; min-height:64px;">${escapeHtml(summaryText)}</textarea>
        </div>
      `;
    }

    // 2. Work Experience Section
    const experiences = Array.isArray(sr.experience) ? sr.experience : [];
    if (experiences.length > 0) {
      html += `
        <div class="rs-node-group">
          <div style="font-weight:700; font-size:0.88rem; color:var(--rs-text-primary); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.04em;">
            Work Experience
          </div>
      `;

      experiences.forEach((exp, expIdx) => {
        const expNode = nodesByPath.get(`experience.${expIdx}`);
        const expNodeId = expNode ? expNode.nodeId : `exp-${expIdx}`;
        const isExpIncluded = activeSelection.experienceIds.has(expNodeId);
        const descNode = nodesByPath.get(`experience.${expIdx}.description`);

        html += `
          <div class="rs-card" style="margin-bottom:12px; background:var(--rs-surface);" data-item-id="${expNodeId}">
            <div class="rs-entry-header">
              <label class="rs-entry-toggle-wrap" style="cursor:pointer;">
                <input type="checkbox"
                       class="rs-checkbox rs-toggle-exp"
                       data-node-id="${expNodeId}"
                       ${isExpIncluded ? 'checked' : ''}
                       ${isReadOnly ? 'disabled' : ''}>
                <strong data-role-index="${expIdx}" data-role-field="title" style="font-size:0.85rem; color:var(--rs-text-primary);">${escapeHtml(exp.title || 'Role')}</strong>
                <span data-role-index="${expIdx}" data-role-field="company" style="font-size:0.8rem; color:var(--rs-text-secondary);">${exp.company ? 'at ' + escapeHtml(exp.company) : ''}</span>
              </label>
              <span data-role-index="${expIdx}" data-role-field="dates" style="font-size:0.75rem; color:var(--rs-text-muted); font-family:var(--rs-font-mono);">
                ${escapeHtml([exp.startDate, exp.isCurrent ? 'Present' : exp.endDate].filter(Boolean).join(' – '))}
              </span>
            </div>

            <!-- Editable Description -->
            ${
              descNode && descNode.editable
                ? `<div style="margin-bottom:10px;">
                    <textarea class="rs-bullet-textarea rs-edit-input"
                              data-node-id="${descNode.nodeId}"
                              placeholder="Role summary..."
                              ${isReadOnly ? 'disabled' : ''}
                              style="width:100%; min-height:42px;">${escapeHtml(exp.description || '')}</textarea>
                  </div>`
                : ''
            }

            <!-- Bullets -->
            <div style="margin-top:8px;">
              <div style="font-size:0.75rem; font-weight:600; color:var(--rs-text-secondary); margin-bottom:6px;">
                Experience Bullets (Select &amp; Tailor Wording)
              </div>
        `;

        const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];
        bullets.forEach((bulletText, bIdx) => {
          const bulletNode = nodesByPath.get(`experience.${expIdx}.bullets.${bIdx}`);
          const bulletNodeId = bulletNode ? bulletNode.nodeId : `exp-${expIdx}-b-${bIdx}`;
          const isBulletIncluded = activeSelection.bulletIds.has(bulletNodeId);
          const bulletProv = bulletNode
            ? prov[bulletNode.nodeId]?.truthState || 'CLAIMED'
            : 'CLAIMED';

          html += `
            <div class="rs-bullet-edit-row ${isBulletIncluded ? '' : 'rs-bullet-excluded'}" id="bullet-row-${bulletNodeId}">
              <input type="checkbox"
                     class="rs-checkbox rs-toggle-bullet"
                     data-bullet-node-id="${bulletNodeId}"
                     ${isBulletIncluded ? 'checked' : ''}
                     ${isReadOnly ? 'disabled' : ''}
                     title="Include/exclude this bullet">
              <textarea class="rs-bullet-textarea rs-edit-input"
                        data-node-id="${bulletNodeId}"
                        ${!bulletNode?.editable || isReadOnly ? 'disabled' : ''}>${escapeHtml(bulletText)}</textarea>
              <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
                <span class="rs-status-tag rs-status-tag-${bulletProv}" style="font-size:0.65rem;">
                  <span class="rs-status-dot"></span>${escapeHtml(bulletProv)}
                </span>
                ${
                  !isReadOnly && bulletNode?.editable
                    ? `<button type="button" class="rs-btn-propose" data-bullet-node-id="${bulletNodeId}" title="Refine bullet wording with grounded evidence">
                         <span>Wording</span>
                       </button>`
                    : ''
                }
              </div>
            </div>
            <!-- Slot for Proposal Card below bullet -->
            <div class="rs-proposal-slot" id="proposal-slot-${bulletNodeId}"></div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    // 3. Portfolio Projects Section (Max 4 selected)
    const projects = Array.isArray(sr.projects) ? sr.projects : [];
    if (projects.length > 0) {
      const selectedProjectCount = activeSelection.projectIds.size;

      html += `
        <div class="rs-node-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-weight:700; font-size:0.88rem; color:var(--rs-text-primary); text-transform:uppercase; letter-spacing:0.04em;">
              Portfolio Projects
            </div>
            <span style="font-size:0.75rem; color:${selectedProjectCount >= 4 ? 'var(--rs-status-claimed)' : 'var(--rs-text-secondary)'};">
              Selected: <strong>${selectedProjectCount} / 4 max</strong>
            </span>
          </div>
      `;

      projects.forEach((proj, pIdx) => {
        const projNode = nodesByPath.get(`projects.${pIdx}`);
        const projNodeId = projNode ? projNode.nodeId : `proj-${pIdx}`;
        const isProjIncluded = activeSelection.projectIds.has(projNodeId);
        const disableProjectCheck = !isProjIncluded && selectedProjectCount >= 4;
        const descNode = nodesByPath.get(`projects.${pIdx}.description`);

        html += `
          <div class="rs-card" style="margin-bottom:12px; background:var(--rs-surface);" data-item-id="${projNodeId}">
            <div class="rs-entry-header">
              <label class="rs-entry-toggle-wrap" style="cursor:pointer;">
                <input type="checkbox"
                       class="rs-checkbox rs-toggle-proj"
                       data-node-id="${projNodeId}"
                       ${isProjIncluded ? 'checked' : ''}
                       ${disableProjectCheck || isReadOnly ? 'disabled' : ''}
                       title="${disableProjectCheck ? 'Maximum 4 projects can be selected' : 'Include project'}">
                <strong style="font-size:0.85rem; color:var(--rs-text-primary);">${escapeHtml(proj.name || 'Project')}</strong>
              </label>
              <span class="rs-badge" style="font-size:0.68rem;">PROJECT</span>
            </div>

            <!-- Editable Description -->
            ${
              descNode && descNode.editable
                ? `<div style="margin-bottom:8px;">
                    <textarea class="rs-bullet-textarea rs-edit-input"
                              data-node-id="${descNode.nodeId}"
                              placeholder="Project description..."
                              ${isReadOnly ? 'disabled' : ''}
                              style="width:100%; min-height:42px;">${escapeHtml(proj.description || '')}</textarea>
                  </div>`
                : ''
            }

            <!-- Project Bullets -->
            <div style="margin-top:8px;">
        `;

        const bullets = Array.isArray(proj.bullets) ? proj.bullets : [];
        bullets.forEach((bulletText, bIdx) => {
          const bulletNode = nodesByPath.get(`projects.${pIdx}.bullets.${bIdx}`);
          const bulletNodeId = bulletNode ? bulletNode.nodeId : `proj-${pIdx}-b-${bIdx}`;
          const isBulletIncluded = activeSelection.bulletIds.has(bulletNodeId);
          const bulletProv = bulletNode
            ? prov[bulletNode.nodeId]?.truthState || 'CLAIMED'
            : 'CLAIMED';

          html += `
            <div class="rs-bullet-edit-row ${isBulletIncluded ? '' : 'rs-bullet-excluded'}" id="bullet-row-${bulletNodeId}">
              <input type="checkbox"
                     class="rs-checkbox rs-toggle-bullet"
                     data-bullet-node-id="${bulletNodeId}"
                     ${isBulletIncluded ? 'checked' : ''}
                     ${isReadOnly ? 'disabled' : ''}>
              <textarea class="rs-bullet-textarea rs-edit-input"
                        data-node-id="${bulletNodeId}"
                        ${!bulletNode?.editable || isReadOnly ? 'disabled' : ''}>${escapeHtml(bulletText)}</textarea>
              <div style="display:flex; flex-direction:column; gap:4px; margin-top:2px;">
                <span class="rs-status-tag rs-status-tag-${bulletProv}" style="font-size:0.65rem;">
                  <span class="rs-status-dot"></span>${escapeHtml(bulletProv)}
                </span>
                ${
                  !isReadOnly && bulletNode?.editable
                    ? `<button type="button" class="rs-btn-propose" data-bullet-node-id="${bulletNodeId}" title="Refine bullet wording with grounded evidence">
                         <span>Wording</span>
                       </button>`
                    : ''
                }
              </div>
            </div>
            <!-- Slot for Proposal Card below bullet -->
            <div class="rs-proposal-slot" id="proposal-slot-${bulletNodeId}"></div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }

    // 4. Skills Section
    const skills = Array.isArray(sr.skills) ? sr.skills : [];
    if (skills.length > 0) {
      html += `
        <div class="rs-node-group" style="border-bottom:none;">
          <div style="font-weight:700; font-size:0.88rem; color:var(--rs-text-primary); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.04em;">
            Skills &amp; Competencies
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
      `;

      skills.forEach((skill, sIdx) => {
        const skillNode = nodesByPath.get(`skills.${sIdx}`);
        const skillNodeId = skillNode ? skillNode.nodeId : `skill-${sIdx}`;
        const isSkillIncluded = activeSelection.skillIds.has(skillNodeId);
        const skillName = typeof skill === 'string' ? skill : skill.name || skill.skillName || '';
        const skillProv = skillNode ? prov[skillNode.nodeId]?.truthState || 'CLAIMED' : 'CLAIMED';

        html += `
          <label style="display:inline-flex; align-items:center; gap:6px; background:var(--rs-surface); border:1px solid var(--rs-border); padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">
            <input type="checkbox"
                   class="rs-checkbox rs-toggle-skill"
                   data-node-id="${skillNodeId}"
                   ${isSkillIncluded ? 'checked' : ''}
                   ${isReadOnly ? 'disabled' : ''}>
            <span style="color:var(--rs-text-primary);">${escapeHtml(skillName)}</span>
            <span class="rs-status-tag rs-status-tag-${skillProv}" style="padding:1px 4px; font-size:0.6rem;">
              <span class="rs-status-dot"></span>${escapeHtml(skillProv)}
            </span>
          </label>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    structuredEditorContainer.innerHTML = html;
    attachEditorEventListeners();
  }

  function attachEditorEventListeners() {
    structuredEditorContainer.querySelectorAll('.rs-edit-input').forEach((input) => {
      const node = nodesById.get(input.dataset.nodeId);
      if (node) input.setAttribute('aria-label', formatNodePathLabel(node.path));
    });
    structuredEditorContainer.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      const node = nodesById.get(input.dataset.nodeId || input.dataset.bulletNodeId);
      if (node) input.setAttribute('aria-label', 'Include ' + formatNodePathLabel(node.path));
    });
    // Textarea edits
    structuredEditorContainer.querySelectorAll('.rs-edit-input').forEach((input) => {
      input.addEventListener('input', (e) => {
        const nodeId = e.target.dataset.nodeId;
        const node = nodesById.get(nodeId);
        const nullable =
          ['IDENTITY', 'TEXT'].includes(node?.kind) &&
          !(node?.path[0] === 'projects' && node?.path[2] === 'name');
        const val = nullable && !e.target.value.trim() ? null : e.target.value;
        e.target.classList.add('dirty');
        queueTextEdit(nodeId, val);
      });
    });

    // Proposal trigger buttons
    structuredEditorContainer.querySelectorAll('.rs-btn-propose').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const b = e.target.closest('.rs-btn-propose');
        const bulletNodeId = b?.dataset?.bulletNodeId;
        if (bulletNodeId) {
          requestProposal(bulletNodeId);
        }
      });
    });

    // Experience toggles
    structuredEditorContainer.querySelectorAll('.rs-toggle-exp').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        toggleSelection('experienceIds', e.target.dataset.nodeId, e.target.checked);
      });
    });

    // Project toggles
    structuredEditorContainer.querySelectorAll('.rs-toggle-proj').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        toggleSelection('projectIds', e.target.dataset.nodeId, e.target.checked);
      });
    });

    // Bullet toggles
    structuredEditorContainer.querySelectorAll('.rs-toggle-bullet').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const bulletNodeId = e.target.dataset.bulletNodeId;
        const row = e.target.closest('.rs-bullet-edit-row');
        if (row) {
          if (e.target.checked) {
            row.classList.remove('rs-bullet-excluded');
          } else {
            row.classList.add('rs-bullet-excluded');
          }
        }
        toggleSelection('bulletIds', bulletNodeId, e.target.checked);
      });
    });

    // Skill toggles
    structuredEditorContainer.querySelectorAll('.rs-toggle-skill').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        toggleSelection('skillIds', e.target.dataset.nodeId, e.target.checked);
      });
    });
  }

  // =========================================================================
  // Part C: Live Document Preview Rendering (10pt serif typography)
  // =========================================================================
  function renderLiveDocumentPreview(draft) {
    if (!draft) return;
    documents.invalidate();
  }

  // =========================================================================
  // Modular Selection Drawer Sync
  // =========================================================================
  function renderModularDrawer() {
    if (!modularDrawerContent || !currentDraft) return;
    modularDrawerContent.replaceChildren();
    const overview = document.createElement('p');
    overview.textContent =
      activeSelection.experienceIds.size +
      ' roles, ' +
      activeSelection.projectIds.size +
      ' projects and ' +
      activeSelection.skillIds.size +
      ' skills included. Your source records stay unchanged.';
    modularDrawerContent.append(overview);
    for (const [section, key, selector] of [
      ['experience', 'experienceIds', '.rs-toggle-exp'],
      ['projects', 'projectIds', '.rs-toggle-proj'],
    ]) {
      currentDraft.structuredResume[section].forEach((item, index) => {
        const node = nodesByPath.get(section + '.' + index);
        if (!node) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rs-btn rs-selection-jump';
        button.textContent =
          (activeSelection[key].has(node.nodeId) ? 'Included: ' : 'Excluded: ') +
          (item.name || [item.title, item.company].filter(Boolean).join(' at '));
        button.addEventListener('click', () => {
          closeAllDrawers();
          const field = structuredEditorContainer.querySelector(
            selector + '[data-node-id="' + node.nodeId + '"]'
          );
          field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          field?.focus({ preventScroll: true });
        });
        modularDrawerContent.append(button);
      });
    }
  }

  // =========================================================================
  // Slice 1: Deterministic Analysis Engine Integration
  // =========================================================================
  function renderAnalysisData(data) {
    if (!data) return;

    if (fitScoreEl && data.candidateFit) {
      fitScoreEl.textContent = String(data.candidateFit.overallScore);
      if (fitBandEl) {
        fitBandEl.textContent = data.candidateFit.fitBand;
        fitBandEl.className = `rs-fit-band rs-fit-band-${data.candidateFit.fitBand}`;
      }
    } else if (fitScoreEl) {
      fitScoreEl.textContent = '—';
      fitBandEl.textContent = 'No evaluable requirements';
    }

    if (kwCoverageEl && data.keywordCoverage) {
      kwCoverageEl.textContent = data.keywordCoverage.overallCoveragePercent + '%';
      kwDetailEl.textContent = 'Lexical coverage; claims and verified evidence are distinct.';
    }

    if (reqListEl && Array.isArray(data.keywords)) {
      renderRequirementsList(data.keywords);
    }

    if (projectListEl && data.projectRelevance) {
      renderProjectsList(data.projectRelevance);
    }

    if (writingContainerEl && data.writingQuality?.report) {
      renderWritingDiagnostics(data.writingQuality?.report);
    } else if (writingContainerEl) {
      writingContainerEl.textContent = 'No selected bullets to evaluate.';
    }

    if (denominatorAuditContainer && data.candidateFit?.scoreBreakdown?.denominatorAudit) {
      renderDenominatorAudit(data.candidateFit.scoreBreakdown.denominatorAudit);
    }
  }

  function renderRequirementsList(keywords) {
    if (!reqListEl) return;
    let html = '';
    keywords.forEach((kw) => {
      const state = kw.truthState || 'CLAIMED';
      const match = {
        EXACT_VERIFIED: 'Exact match',
        EXACT_CLAIMED: 'Exact wording; candidate claim',
        TAXONOMY_EQUIVALENT: 'Equivalent terminology',
        RELATED_INSUFFICIENT: 'Related skill; insufficient for this requirement',
        MISSING_IN_PROFILE: 'Missing from profile',
        UNSUPPORTED_ON_RESUME: 'Unsupported wording',
      }[kw.category];
      html += `
        <div class="rs-req-card">
          <div class="rs-req-card-header">
            <span class="rs-req-name">${escapeHtml(kw.term)}</span>
            <span class="rs-status-tag rs-status-tag-${state}">
              <span class="rs-status-dot"></span>
              ${escapeHtml(state)}
            </span>
          </div>
          <div style="font-size:0.75rem; color:var(--rs-text-secondary); margin-bottom:4px;">
            ${escapeHtml(match)}. ${kw.satisfiesRequirement ? 'Supported by verified evidence' : 'Not supported by verified evidence'}
          </div>
          <button type="button" class="rs-btn rs-inspect-requirement" data-term="${escapeHtml(kw.term)}">Inspect basis</button>
        </div>
      `;
    });
    reqListEl.innerHTML = html;
    reqListEl.querySelectorAll('.rs-inspect-requirement').forEach((button) =>
      button.addEventListener('click', () => {
        const keyword = keywords.find((k) => k.term === button.dataset.term);
        document.getElementById('evidenceItemsContainer').textContent = keyword.explanation;
        openDrawer(drawerEvidence);
      })
    );
  }

  function renderProjectsList(projectEvaluations) {
    if (!projectListEl) return;
    const evaluated = projectEvaluations.projectRankings || [];
    let html = '';
    evaluated.forEach((p) => {
      html += `
        <div class="rs-card" style="margin-bottom:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong style="font-size:0.85rem; color:var(--rs-text-primary);">${escapeHtml(p.projectName)}</strong>
            <span class="rs-badge" style="font-size:0.68rem;">Score: ${p.relevanceScore}</span>
          </div>
          <div style="font-size:0.75rem; color:var(--rs-text-secondary);">
            Matched Keywords: ${escapeHtml((p.contributingSkills || []).join(', ') || 'None')}
          </div>
        </div>
      `;
    });
    projectListEl.innerHTML = html;
  }

  function renderWritingDiagnostics(writing) {
    if (!writingContainerEl) return;
    const q = writing.quantification;
    let html = `<p class="rs-card-desc">${q.totalBullets} selected bullets; ${q.quantifiedBulletCount} contain candidate-supplied metrics. Metrics are optional and remain unverified claims.</p>`;
    html +=
      '<ul>' + writing.findings.map((f) => `<li>${escapeHtml(f.message)}</li>`).join('') + '</ul>';
    html +=
      '<ul>' +
      writing.recommendations.map((text) => `<li>${escapeHtml(text)}</li>`).join('') +
      '</ul>';
    if (!writing.findings.length && !writing.recommendations.length)
      html += '<p>No writing findings from these rules.</p>';
    html +=
      '<button type="button" class="rs-btn" id="rsReviewWriting">Review wording in editor</button>';
    writingContainerEl.innerHTML = html;
    document.getElementById('rsReviewWriting').addEventListener('click', () => {
      const input = structuredEditorContainer.querySelector('textarea');
      input?.scrollIntoView({ block: 'center' });
      input?.focus();
    });
  }

  function renderDenominatorAudit(da) {
    if (!denominatorAuditContainer) return;
    denominatorAuditContainer.innerHTML = `
      <div style="font-size:0.8rem; color:var(--rs-text-secondary); margin-bottom:12px;">
        Earned <strong>${da.totalEarnedPoints}</strong> of <strong>${da.totalPossiblePoints}</strong> audited points.
      </div>
      <div class="rs-card" style="font-size:0.75rem;">
        <div>Required Skills: ${da.requiredSkills?.earnedPoints} / ${da.requiredSkills?.possiblePoints}</div>
        <div>Preferred Skills: ${da.preferredSkills?.earnedPoints} / ${da.preferredSkills?.possiblePoints}</div>
        <div>Project Relevance: ${da.projectRelevance?.earnedPoints} / ${da.projectRelevance?.possiblePoints}</div>
        <div>Experience: ${da.experience?.earnedPoints} / ${da.experience?.possiblePoints}</div>
        <div>Education: ${da.education?.earnedPoints} / ${da.education?.possiblePoints}</div>
        <div>Evidence Confidence: ${da.evidenceConfidence?.earnedPoints} / ${da.evidenceConfidence?.possiblePoints}</div>
      </div>
    `;
  }

  async function runAnalysis(e) {
    if (e) e.preventDefault();
    clearAlert();

    const title = (jobTitleInput ? jobTitleInput.value : '').trim();
    const company = (jobCompanyInput ? jobCompanyInput.value : '').trim();
    const sourceUrl = (jobUrlInput ? jobUrlInput.value : '').trim();
    const rawDescription = (jobDescTextarea ? jobDescTextarea.value : '').trim();

    if (rawDescription.length < 100) {
      showAlert(
        'Job description must be at least 100 characters for deterministic qualification analysis.'
      );
      if (jobDescTextarea) jobDescTextarea.focus();
      return;
    }

    const jobTarget = { rawDescription };
    if (title) jobTarget.title = title;
    if (company) jobTarget.company = company;
    if (sourceUrl) jobTarget.sourceUrl = sourceUrl;

    const csrfToken = getCsrfToken();

    if (btnAnalyze) {
      btnAnalyze.disabled = true;
      btnAnalyze.innerHTML = `<span class="rs-spinner" aria-hidden="true"></span> <span>Analyzing…</span>`;
    }

    try {
      const response = await fetch('/api/v1/resume-studio/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-csrf-token': csrfToken,
          Origin: window.location.origin,
        },
        credentials: 'include',
        body: JSON.stringify({ jobTarget }),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          showAlert('Your session has expired. Please sign in again.');
        } else if (response.status === 403) {
          showAlert(json?.error?.message || 'Access denied or CSRF token invalid.');
        } else if (response.status === 400) {
          showAlert(json?.error?.message || 'Invalid job target description.');
        } else {
          showAlert(json?.error?.message || `Analysis request failed (HTTP ${response.status}).`);
        }
        return;
      }

      if (json && json.success && json.data) {
        renderAnalysisData(json.data);
      }
    } catch (err) {
      showAlert(`Network error: ${err.message || 'Failed to connect to analysis engine.'}`);
    } finally {
      if (btnAnalyze) {
        btnAnalyze.disabled = false;
        btnAnalyze.innerHTML = `<span>Analyze Fit</span>`;
      }
    }
  }

  // =========================================================================
  async function refreshDraftDiagnostics() {
    if (!currentDraft) return;
    const id = currentDraft.id,
      revision = currentRevision;
    try {
      const response = await fetch('/api/v1/resume-studio/drafts/' + id + '/diagnostics', {
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const value = await response.json();
      if (
        currentDraft?.id === id &&
        currentRevision === value.data.revision &&
        revision === currentRevision
      )
        renderAnalysisData(value.data.analysis);
    } catch {
      /* No fallback score. */
    }
  }
  async function loadProposals(id) {
    try {
      const response = await fetch('/api/v1/resume-studio/drafts/' + id + '/proposals', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const value = await response.json();
      if (currentDraft?.id !== id) return;
      const seen = new Set();
      for (const proposal of value.data.proposals) {
        if (seen.has(proposal.nodeId)) continue;
        seen.add(proposal.nodeId);
        if (
          ['PENDING', 'STALE'].includes(proposal.status) &&
          !activeProposals.has(proposal.nodeId)
        ) {
          activeProposals.set(proposal.nodeId, proposal);
          renderProposalCard(proposal.nodeId, proposal);
        }
      }
    } catch {
      /* Manual editing remains available; no fixture substitution. */
    }
  }

  document.querySelectorAll('#studioReturnLink,.ch-primary-nav a,.ch-brand').forEach((link) =>
    link.addEventListener('click', async (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !currentDraft) return;
      event.preventDefault();
      await saveDraft();
      if (hasConflict || pendingEdits.size || hasSelectionChanged()) {
        showAlert(
          'Save or resolve your changes before leaving. Your local wording is retained.',
          'warning'
        );
        return;
      }
      window.location.assign(link.href);
    })
  );
  if (divider && leftPane)
    divider.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = Number(divider.getAttribute('aria-valuenow') || 50);
      const next =
        event.key === 'Home'
          ? 30
          : event.key === 'End'
            ? 70
            : Math.max(30, Math.min(70, current + (event.key === 'ArrowRight' ? 5 : -5)));
      leftPane.style.width = `${next}%`;
      divider.setAttribute('aria-valuenow', String(next));
    });

  // Initial Event Bindings & Startup
  // =========================================================================
  if (btnCreateDraft) {
    btnCreateDraft.addEventListener('click', createDraft);
  }
  document.getElementById('btnRetrySave').addEventListener('click', saveDraft);
  window.addEventListener('beforeunload', (event) => {
    if (pendingEdits.size || hasSelectionChanged()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  if (btnAnalyze) {
    btnAnalyze.addEventListener('click', runAnalysis);
  }
  if (jobForm) {
    jobForm.addEventListener('submit', runAnalysis);
  }

  const urlParams = new URLSearchParams(window.location.search);
  updateCharCount();
  const initialDraftId = urlParams.get('draftId') || container?.dataset?.draftId;

  if (initialDraftId) {
    loadDraft(initialDraftId);
  } else if (urlParams.get('generationId')) {
    openGeneratedResume(urlParams.get('generationId'));
  }

  // =========================================================================
  // Test Helpers & Synthetic Fixture Loaders
  // =========================================================================
  updateCharCount();
})();
