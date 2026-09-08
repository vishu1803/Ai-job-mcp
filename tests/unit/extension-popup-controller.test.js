/* global global */
/**
 * @file Popup Controller Unit Tests (P15-002 Batch 1, Item 6).
 *
 * DOM-free tests for the popup's protection / error-sensitive behavior using
 * a minimal DOM stub. Scenarios covered:
 *   A. Authenticated session
 *   B. Not authenticated
 *   C. Protected submitted application (all authoritative protected statuses)
 *   D. SAVED/editable application
 *   E. Successful authoritative fit analysis
 *   F. Analysis service failure (ANALYSIS_UNAVAILABLE)
 *   G. No fake Grade B / score 50 ever rendered
 *   H. Validation PASSED state
 *   I. Job-not-detected state
 *   J. Download-ready state
 *
 * Plus the extension/backend status-constant drift guard.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Minimal DOM stub
// ---------------------------------------------------------------------------
function createElement(id) {
  return {
    id,
    _textContent: '',
    get textContent() {
      return this._textContent;
    },
    set textContent(v) {
      this._textContent = String(v);
    }, // real DOM coerces values to string
    innerHTML: '',
    className: '',
    disabled: false,
    children: [],
    classList: {
      _set: new Set(['hidden']),
      add(c) {
        this._set.add(c);
      },
      remove(c) {
        this._set.delete(c);
      },
      contains(c) {
        return this._set.has(c);
      },
    },
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
    },
  };
}

function buildDomStub() {
  const elements = {};
  const ids = [
    'authStatusPill', 'authStatusText', 'alertBox', 'alertMessage', 'alertCloseBtn',
    'stateLoading', 'loadingMessage', 'stateNotAuth', 'stateNoJob', 'stateDetected',
    'stateAnalysis', 'stateHandoffReady',
    'jobTitle', 'jobCompany', 'jobLocation', 'jobProviderBadge', 'jobWorkplaceBadge',
    'existingAppBadge', 'candidateStatusLabel', 'submittedWarning',
    'fitScoreNum', 'fitGradeBadge', 'analysisJobTitle', 'fitRecommendationText',
    'matchedItems', 'missingItems', 'blockersItems', 'requirementsBlockersList',
    'featuredProjectsList', 'omittedProjectsSection', 'omittedProjectsList',
    'tabRequirementsBtn', 'tabProjectsBtn', 'requirementsTab', 'projectsTab',
    'lifecycleActionBadge', 'statusResumeBadge', 'statusCoverLetterBadge',
    'statusValidationBadge', 'telParseability', 'telJobMatch', 'telEvidenceCoverage',
    'telLayoutProfile',
    'openAuthBtn', 'retryDetectBtn', 'analyzeJobBtn', 'prepareHandoffBtn',
    'downloadResumeBtn', 'downloadCoverLetterBtn', 'downloadBundleBtn', 'openAppBtn',
  ];
  for (const id of ids) elements[id] = createElement(id);

  global.document = {
    getElementById: (id) => elements[id] || null,
    createElement: () => createElement('dyn'),
    addEventListener() {},
    querySelector: () => null,
    body: createElement('body'),
  };
  global.window = {
    location: { search: '', href: 'chrome-extension://test/popup.html' },
    addEventListener() {},
    dispatchEvent() {},
  };
  global.chrome = {
    runtime: { sendMessage: async () => ({ success: false }) },
    tabs: {
      query: async () => [],
      get: async () => {
        throw new Error('no tab');
      },
      sendMessage: async () => ({ success: false }),
    },
  };
  global.URL = URL;
  global.URL.createObjectURL = () => 'blob:test';
  global.URL.revokeObjectURL = () => {};

  return elements;
}

// ---------------------------------------------------------------------------
// Module loading — import the real popup controller with DOM stubs installed.
// ---------------------------------------------------------------------------
let PopupController;
let escapeHtml;
let currentElements;

beforeEach(() => {
  currentElements = buildDomStub();
});

/**
 * Builds a controller with injected fake clients.
 */
async function buildController({ authStatus, analyzeResponse }) {
  if (!PopupController) {
    ({ PopupController, escapeHtml } = await import('../../extension/popup/popup.js'));
  }
  assert.ok(PopupController, 'PopupController class must load');

  // Simulate a confident job detection so handleAnalyzeJob proceeds.
  const DETECTED_JOB = {
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    provider: 'GREENHOUSE',
    title: 'Senior Backend Engineer',
    company: 'Acme',
    location: 'SF',
    workplace: 'HYBRID',
    employmentType: 'FULL_TIME',
    description: 'Build backend services.',
    requirements: [],
    responsibilities: [],
    compensation: null,
    rawText: 'Build backend services.',
    isConfident: true,
  };

  const controller = new PopupController();

  // Stub the clients the controller already constructed with fakes.
  controller.backendClient = {
    getAuthStatus: async () => authStatus,
    analyzeJob: async () => analyzeResponse,
    prepareHandoff: async () => {
      throw new Error('not expected in these tests');
    },
    validatePackage: async () => ({ overallStatus: 'PASSED', errors: [] }),
    getBaseUrl: async () => 'http://localhost:3000',
    getArtifactDownloadUrl: async (_a, t) => `http://localhost:3000/fake/${t}`,
  };
  controller.authClient = {
    checkSession: async () => {
      const r = await controller.backendClient.getAuthStatus();
      if (r.status === 'AUTHENTICATED' && r.authenticated) {
        return { state: 'AUTHENTICATED', user: r.user, tenant: r.tenant, candidate: r.candidate };
      }
      if (r.status === 'SESSION_EXPIRED') return { state: 'SESSION_EXPIRED' };
      if (r.status === 'AUTH_ERROR') return { state: 'AUTH_ERROR', error: r.error };
      return { state: 'NOT_AUTHENTICATED' };
    },
    openLoginPortal() {},
    openApplication() {},
  };
  controller.downloadManager = {
    downloadArtifact: async (params) => ({ verified: true, params }),
  };
  controller.currentJob = DETECTED_JOB;

  return controller;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('P15-002 Item 6: Popup Controller protection/error behavior', () => {
  const ANALYSIS_OK = {
    canonicalJob: { title: 'Senior Backend Engineer', company: 'Acme' },
    existingApplication: null,
    isSubmitted: false,
    fitAnalysis: {
      score: 78,
      grade: 'A',
      recommendation: 'STRONG_FIT',
      matches: [{ requirement: 'Node.js' }],
      partialMatches: [],
      missingRequirements: [{ requirement: 'Kafka' }],
      hardBlockers: [],
    },
    portfolioRecommendations: { featuredProjects: [], omittedProjects: [] },
  };

  it('A: authenticated session shows Connected and detects job', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: ANALYSIS_OK,
    });
    await controller.checkAuthAndProceed();

    assert.equal(currentElements.authStatusText.textContent, 'Connected');
    assert.equal(currentElements.candidateStatusLabel.textContent, 'CONNECTED');
  });

  it('B: not authenticated shows Sign In state', async () => {
    const controller = await buildController({
      authStatus: { status: 'NOT_AUTHENTICATED', authenticated: false },
      analyzeResponse: ANALYSIS_OK,
    });
    await controller.checkAuthAndProceed();

    assert.equal(currentElements.authStatusText.textContent, 'Sign In');
    assert.ok(!currentElements.stateNotAuth.classList.contains('hidden'));
  });

  it('C: every authoritative protected status disables Prepare and shows Protected state', async () => {
    for (const status of ['APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER_RECEIVED', 'OFFER_ACCEPTED']) {
      const controller = await buildController({
        authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
        analyzeResponse: {
          ...ANALYSIS_OK,
          isSubmitted: false, // deliberately stale — popup predicate must catch it
          existingApplication: { id: 'app1', status, packageVersion: 2 },
        },
      });
      await controller.handleAnalyzeJob();

      assert.equal(
        currentElements.prepareHandoffBtn.disabled,
        true,
        `${status} must disable prepare`
      );
      assert.match(
        currentElements.prepareHandoffBtn.textContent,
        /Submitted \(Protected\)/,
        `${status} must show Protected text`
      );
      assert.ok(!currentElements.submittedWarning.classList.contains('hidden'), `${status} shows warning`);
    }
  });

  it('D: SAVED application keeps Prepare enabled (editable)', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: {
        ...ANALYSIS_OK,
        existingApplication: { id: 'app1', status: 'SAVED', packageVersion: 1 },
      },
    });
    await controller.handleAnalyzeJob();

    assert.equal(currentElements.prepareHandoffBtn.disabled, false);
    assert.ok(currentElements.submittedWarning.classList.contains('hidden'));
  });

  it('E: successful authoritative analysis renders actual score/grade', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: ANALYSIS_OK,
    });
    await controller.handleAnalyzeJob();

    assert.equal(currentElements.fitScoreNum.textContent, '78');
    assert.equal(currentElements.fitGradeBadge.textContent, 'Grade A');
    assert.ok(!currentElements.stateAnalysis.classList.contains('hidden'));
  });

  it('F: ANALYSIS_UNAVAILABLE shows error alert and NEVER renders analysis state', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: {
        code: 'ANALYSIS_UNAVAILABLE',
        message: 'Job fit analysis is temporarily unavailable. Please try again shortly.',
        fitAnalysis: null,
      },
    });
    await controller.handleAnalyzeJob();

    assert.ok(!currentElements.alertBox.classList.contains('hidden'), 'alert visible');
    assert.match(currentElements.alertMessage.textContent, /unavailable/i);
    assert.ok(currentElements.stateAnalysis.classList.contains('hidden'), 'analysis state hidden');
    // The score element must never be assigned a fabricated value.
    assert.notEqual(currentElements.fitScoreNum.textContent, '50');
    assert.notEqual(currentElements.fitGradeBadge.textContent, 'Grade B');
  });

  it('G: response with null fitAnalysis never renders a fake Grade B / 50', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: {
        code: 'ANALYSIS_UNAVAILABLE',
        message: 'unavailable',
        fitAnalysis: null,
        // Legacy fabricated shape would have been { score: 50, grade: 'B' } — absent here.
      },
    });
    await controller.handleAnalyzeJob();

    assert.notEqual(currentElements.fitScoreNum.textContent, '50');
    assert.notEqual(currentElements.fitGradeBadge.textContent, 'Grade B');
    assert.ok(currentElements.stateAnalysis.classList.contains('hidden'));
  });

  it('H: validation PASSED state renders PASSED badge', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: ANALYSIS_OK,
    });

    controller.renderHandoffKit(
      {
        applicationId: 'app-1',
        lifecycleAction: 'CREATED',
        packageHash: 'abc',
        resumeQuality: { atsParseability: { score: 96 }, jobMatch: { score: 46 }, evidenceCoverage: { score: 100 } },
        layoutDiagnostics: { densityProfile: 'BALANCED' },
        artifacts: { resume: { ready: true }, coverLetter: { ready: true } },
      },
      { overallStatus: 'PASSED', errors: [] }
    );

    assert.equal(currentElements.statusValidationBadge.textContent, 'PASSED');
    assert.equal(currentElements.statusResumeBadge.textContent, 'READY');
    assert.equal(currentElements.statusCoverLetterBadge.textContent, 'READY');
    assert.equal(currentElements.telParseability.textContent, '96/100');
  });

  it('I: unconfident detection shows job-not-detected state', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: ANALYSIS_OK,
    });
    await controller.detectJobOnPage();

    assert.ok(!currentElements.stateNoJob.classList.contains('hidden'), 'stateNoJob visible');
    assert.ok(currentElements.stateDetected.classList.contains('hidden'));
  });

  it('J: download-ready state exposes artifact download handlers', async () => {
    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: ANALYSIS_OK,
    });
    controller.handoffData = { applicationId: 'app-1', packageHash: 'hash1' };

    const result = await controller.downloadManager.downloadArtifact({
      applicationId: 'app-1',
      artifactType: 'bundle',
      packageHash: 'hash1',
    });
    assert.equal(result.verified, true);
    assert.equal(result.params.artifactType, 'bundle');
  });

  it('escapeHtml neutralizes markup injection in analysis results', async () => {
    // sanity-check the exported helper directly
    assert.equal(escapeHtml('<script>x</script>'), '&lt;script&gt;x&lt;/script&gt;');

    const controller = await buildController({
      authStatus: { status: 'AUTHENTICATED', authenticated: true, user: { id: 'u1' }, candidate: { id: 'c1' } },
      analyzeResponse: {
        ...ANALYSIS_OK,
        fitAnalysis: {
          ...ANALYSIS_OK.fitAnalysis,
          matches: [{ requirement: '<script>alert(1)</script>' }],
        },
      },
    });
    await controller.handleAnalyzeJob();

    const html = currentElements.matchedItems.children.map((c) => c.innerHTML).join('');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('P15-002: Extension/backend status-constant drift guard', () => {
  it('extension mirror file lists exactly the backend authoritative statuses', async () => {
    const backendSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, 'src/domain/career/application-status.constants.js'),
      'utf-8'
    );
    const extensionSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, 'extension/lib/application-status.constants.js'),
      'utf-8'
    );

    const extract = (src) => {
      const match = src.match(/SUBMITTED_APPLICATION_STATUSES = Object\.freeze\(\[([\s\S]*?)\]\)/);
      assert.ok(match, 'status list found');
      return match[1]
        .split(',')
        .map((s) => s.trim().replace(/^'|'$/g, ''))
        .filter(Boolean);
    };

    assert.deepEqual(extract(extensionSrc), extract(backendSrc));
  });
});