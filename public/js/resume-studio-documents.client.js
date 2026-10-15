import { nodeText } from './resume-studio-state.js';

export function connectStudioDocuments({
  state,
  save,
  csrf,
  message,
  onConflict,
  onRestore,
  setInteractionBusy,
}) {
  const status = document.getElementById('rsDocumentStatus'),
    preview = document.getElementById('rsDocumentPreview');
  const pdf = document.getElementById('btnExportPdf'),
    word = document.getElementById('btnExportDocx');
  const approve = document.getElementById('btnApprovePackage'),
    reviewed = document.getElementById('rsApprovalReviewed');
  const zoom = document.getElementById('rsDocumentZoom');
  function scalePreview() {
    const canvas = preview.querySelector('.rs-pdf-page');
    if (canvas)
      canvas.style.width = zoom.value === 'FIT' ? '100%' : (795 * Number(zoom.value)) / 100 + 'px';
  }
  zoom.addEventListener('change', scalePreview);
  let compiled = null,
    timer = null,
    busy = false,
    approvalBusy = false,
    restoring = false,
    approvedDocumentId = null;
  const endpoint = () => '/api/v1/resume-studio/drafts/' + state().draft.id;
  const ready = () =>
    compiled?.status === 'READY' &&
    compiled.revision === state().draft?.revision &&
    !state().pending &&
    !state().readonly &&
    !state().conflict;
  function controls() {
    pdf.disabled = word.disabled = reviewed.disabled = !ready();
    approve.disabled =
      !ready() || !reviewed.checked || approvalBusy || compiled?.id === approvedDocumentId;
  }
  async function request(path, body) {
    const response = await fetch(endpoint() + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined
          ? {}
          : { 'Content-Type': 'application/json', 'x-csrf-token': csrf() }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      if (
        path !== '/preview' &&
        response.status === 409 &&
        error?.error?.details?.[0]?.reason === 'DRAFT_REVISION_CONFLICT' &&
        (!body || body.expectedRevision === state().draft?.revision)
      )
        await onConflict(error);
      throw Error(error?.error?.message || 'Request failed. Your draft is preserved.');
    }
    return response;
  }
  function showDocument(value) {
    compiled = value;
    reviewed.checked = false;
    controls();
    const v = value.verification;
    status.textContent =
      value.status === 'READY'
        ? 'One A4 page · Ready to export'
        : `${v.pageCount} pages · Review selection before export. Nothing was removed.`;
    preview.replaceChildren();
    const canvas = document.createElement('div');
    canvas.className = 'rs-pdf-page';
    const image = document.createElement('img');
    image.src = value.previewImageUrl;
    image.alt = 'Actual compiled resume, page 1';
    canvas.append(image);
    for (const node of value.pageMap.filter((n) => n.pageIndex === 0)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rs-pdf-node';
      button.dataset.nodeId = node.nodeId;
      const input = document.querySelector(`.rs-edit-input[data-node-id="${node.nodeId}"]`);
      button.setAttribute('aria-label', 'Edit ' + (input?.value || 'resume text').slice(0, 100));
      Object.assign(button.style, {
        top: (node.bounds.top / 841.89) * 100 + '%',
        left: (node.bounds.left / 595.276) * 100 + '%',
        width: (node.bounds.width / 595.276) * 100 + '%',
        height: (node.bounds.height / 841.89) * 100 + '%',
      });
      button.addEventListener('click', () => {
        const field = document.querySelector(`.rs-edit-input[data-node-id="${node.nodeId}"]`);
        field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        field?.focus({ preventScroll: true });
      });
      canvas.append(button);
    }
    preview.append(canvas);
    scalePreview();
    const link = document.createElement('a');
    link.href = value.previewPdfUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent =
      'Open selectable PDF' + (v.pageCount > 1 ? ` preview (${v.pageCount} pages)` : '');
    preview.append(link);
    const details = document.createElement('details'),
      summary = document.createElement('summary'),
      checks = document.createElement('p');
    summary.textContent = 'Document checks';
    checks.textContent = `${v.pageCount} physical A4 page(s); minimum measured font ${v.minimumFontPt.toFixed(4)}pt (10pt configured; 0.05pt measurement tolerance). Embedded fonts and Unicode maps ${v.fontsEmbedded && v.unicodeMaps ? 'checked' : 'need review'}; selected text ${v.textPreserved ? 'preserved' : 'needs review'}; reading order ${v.readingOrder ? 'checked' : 'needs review'}; margins ${v.marginIn}in. ${v.failedChecks.length ? 'Export blocked: ' + v.failedChecks.join(', ') : 'PDF and Word text checks passed.'}`;
    details.append(summary, checks);
    preview.append(details);
    if (value.status !== 'READY') {
      const selection = document.createElement('button');
      selection.className = 'rs-btn';
      selection.textContent = 'Review included content';
      selection.addEventListener('click', () => document.getElementById('btnOpenModular').click());
      preview.append(selection);
    }
  }
  async function refresh() {
    if (!state().draft || busy) return;
    await save();
    if (state().pending || state().conflict) return;
    const id = state().draft.id,
      revision = state().draft.revision;
    busy = true;
    status.textContent = 'Compiling and checking the saved document…';
    try {
      const response = await request(
        state().readonly ? '/document' : '/preview',
        state().readonly ? undefined : { expectedRevision: revision }
      );
      const value = (await response.json()).data;
      if (state().draft.id === id && state().draft.revision === revision && !state().pending)
        showDocument(value);
    } catch (error) {
      if (state().draft.id === id && state().draft.revision === revision) {
        status.textContent = 'Document unavailable. Your draft is saved.';
        message(error.message);
      }
    } finally {
      busy = false;
      controls();
      if (
        state().draft.id === id &&
        state().draft.revision !== revision &&
        !state().pending &&
        !state().conflict
      )
        schedule();
    }
  }
  function schedule() {
    clearTimeout(timer);
    // Background preview must not retry a failed save or hide its recovery control.
    // Explicit refresh/export may flush edits; scheduled work uses acknowledged state.
    timer = setTimeout(() => {
      if (!state().pending && !state().conflict) refresh();
    }, 1200);
  }
  function invalidate() {
    controls();
    reviewed.checked = false;
    status.textContent = 'Document will update after changes are saved.';
  }
  async function download(format) {
    await save();
    if (!ready()) return;
    try {
      const response = await request('/export', {
        expectedRevision: state().draft.revision,
        documentId: compiled.id,
        format,
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'resume.' + format.toLowerCase();
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      message(error.message);
    }
  }
  document.getElementById('btnCompilePreview').addEventListener('click', refresh);
  pdf.addEventListener('click', () => download('PDF'));
  word.addEventListener('click', () => download('DOCX'));
  reviewed.addEventListener('change', controls);
  approve.addEventListener('click', async () => {
    await save();
    if (!ready() || !reviewed.checked || approvalBusy) return;
    const draftId = state().draft.id;
    approvalBusy = true;
    controls();
    try {
      const response = await request('/approval', {
        expectedRevision: state().draft.revision,
        documentId: compiled.id,
        reviewed: true,
      });
      const value = (await response.json()).data;
      if (state().draft?.id !== draftId) return;
      approvedDocumentId = value.documentId;
      status.textContent = 'Package approved. No application was submitted.';
      approve.textContent = 'Approved';
      approve.dataset.packageHash = value.packageHash;
      if (value.applicationId) {
        const back = document.getElementById('studioReturnLink');
        back.href = '/applications/' + encodeURIComponent(value.applicationId) + '/apply';
        back.textContent = 'Back to application';
      }
    } catch (error) {
      message(error.message);
    } finally {
      approvalBusy = false;
      controls();
    }
  });
  const history = document.getElementById('rsHistory'),
    list = document.getElementById('rsHistoryList'),
    review = document.getElementById('rsHistoryReview');
  history.addEventListener('toggle', async () => {
    if (!history.open || !state().draft) return;
    const draftId = state().draft.id;
    try {
      const value = (await (await request('/history')).json()).data;
      if (state().draft?.id !== draftId) return;
      list.replaceChildren();
      for (const item of value.revisions) {
        const button = document.createElement('button');
        button.className = 'rs-btn';
        button.textContent = 'Version ' + item.revision;
        button.addEventListener('click', () => inspectHistory(item.revision));
        list.append(button);
      }
    } catch (error) {
      message(error.message);
    }
  });
  async function inspectHistory(revision) {
    const draftId = state().draft.id;
    try {
      const past = (await (await request('/history/' + revision)).json()).data;
      if (state().draft?.id !== draftId) return;
      review.replaceChildren();
      let changes = 0;
      for (const node of past.nodes.filter((n) => n.editable)) {
        const before = nodeText(past.structuredResume, node.path),
          now = nodeText(state().draft.structuredResume, node.path);
        if (before === now) continue;
        const field = document.createElement('p');
        field.textContent = `${node.path.join(' / ')}: ${before || '(empty)'} → ${now || '(empty)'}`;
        review.append(field);
        changes++;
      }
      const note = document.createElement('p');
      note.textContent = changes
        ? 'Restoring also restores that version’s content selection.'
        : 'Wording matches the current draft. Restoring also restores that version’s content selection.';
      review.append(note);
      const restore = document.createElement('button');
      restore.className = 'rs-btn';
      restore.textContent = 'Restore version ' + revision;
      restore.disabled = state().readonly;
      restore.addEventListener('click', async () => {
        if (state().draft?.id !== draftId || restoring) return;
        await save();
        if (state().pending || state().conflict || state().draft?.id !== draftId) return;
        restoring = true;
        restore.disabled = true;
        setInteractionBusy(true);
        try {
          const value = (
            await (
              await request('/restore', {
                expectedRevision: state().draft.revision,
                restoreRevision: revision,
              })
            ).json()
          ).data;
          onRestore(value);
          history.open = false;
        } catch (error) {
          message(error.message);
        } finally {
          setInteractionBusy(false);
          restoring = false;
          restore.disabled = state().readonly;
        }
      });
      review.append(restore);
    } catch (error) {
      message(error.message);
    }
  }
  return {
    invalidate,
    schedule,
    loaded() {
      compiled = null;
      history.open = false;
      list.replaceChildren();
      review.replaceChildren();
      reviewed.checked = false;
      approve.textContent = 'Approve package';
      controls();
      schedule();
    },
  };
}
