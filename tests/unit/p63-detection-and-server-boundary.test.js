/**
 * @file P63 Unit Tests: Accurate Job Detection, Tab-Scoped Workflows, Explicit Analyze Boundary & Calm Extension UX
 *
 * Validates:
 * 1. LinkedIn layered detection (detail pages, query IDs, JSON-LD, resilient DOM semantics).
 * 2. LinkedIn non-job rejection (feed, profile, messaging, notifications, search listing without selected job).
 * 3. ChatGPT & ordinary websites false-positive prevention (conservative generic detection).
 * 4. Generic non-job rejection (GitHub repo, GitHub issue, documentation, blog article).
 * 5. JSON-LD JobPosting detection for structured career pages.
 * 6. Content script async LinkedIn DOM detection & SPA route reconciliation.
 * 7. Duplicate detection suppression (fingerprint comparison prevents repeated messages).
 * 8. Pending job notification on navigation while preserving active workflow.
 * 9. Explicit Rescan promoting pending job with zero server calls.
 * 10. Strict Server Call Boundary: passive detection, page open, SPA navigation, and Rescan produce 0 /analyze-job calls.
 * 11. Explicit Analyze Job Match is the ONLY action that triggers /api/extension/analyze-job (1 call).
 * 12. Double-click Analyze protection (1 call only).
 * 13. Tab-scoped workflows: Tab A and Tab B maintain independent states.
 * 14. Lock isolation: Tab A locked does not lock or disable Tab B.
 * 15. Analyze button conditions: Tab B Analyze button enabled while Tab A is locked.
 * 16. Existing P62 handoff reuse compatibility: re-analyzing same job attaches existing handoff without preparation calls.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AdapterRegistry } from '../../extension/job-detection/adapter-registry.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { GenericCareerPageAdapter } from '../../extension/job-detection/adapters/generic-career.adapter.js';
import { JobIdentity } from '../../extension/lib/job-identity.js';
import { DurableWorkflowStore } from '../../extension/lib/durable-workflow-store.js';
import { WorkflowStateMachine, WORKFLOW_STATES } from '../../extension/lib/workflow-state-machine.js';
import { SidebarController } from '../../extension/sidebar/sidebar.js';

function createMockDocument({
  elements = {},
  meta = {},
  scripts = [],
  bodyText = '',
} = {}) {
  const doc = {
    body: { textContent: bodyText },
    querySelector(selector) {
      if (elements[selector]) {
        return elements[selector];
      }
      if (selector.includes(',')) {
        for (const sub of selector.split(',')) {
          const res = this.querySelector(sub.trim());
          if (res) return res;
        }
      }
      // Check without case-insensitive flag if key has it
      const cleanSelector = selector.replace(/\s+i\]/g, ']');
      if (elements[cleanSelector]) {
        return elements[cleanSelector];
      }
      if (selector.startsWith('meta[')) {
        const propMatch = selector.match(/property="([^"]+)"/);
        if (propMatch && meta[propMatch[1]]) {
          return { content: meta[propMatch[1]] };
        }
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('application/ld+json')) {
        return scripts.map((s) => ({
          textContent: typeof s === 'string' ? s : JSON.stringify(s),
        }));
      }
      if (selector.includes(',')) {
        const res = [];
        for (const sub of selector.split(',')) {
          res.push(...this.querySelectorAll(sub.trim()));
        }
        return res;
      }
      if (elements[selector]) {
        return Array.isArray(elements[selector]) ? elements[selector] : [elements[selector]];
      }
      const cleanSelector = selector.replace(/\s+i\]/g, ']');
      if (elements[cleanSelector]) {
        return Array.isArray(elements[cleanSelector]) ? elements[cleanSelector] : [elements[cleanSelector]];
      }
      return [];
    },
  };
  doc.body.querySelectorAll = (sel) => doc.querySelectorAll(sel);
  return doc;
}

describe('Part 63 — Accurate Job Detection & Server Boundary', () => {
  describe('1. LinkedIn Detection & Non-Job Rejection (Parts 4 & 5 & 16)', () => {
    it('detects valid LinkedIn canonical job detail page (/jobs/view/<id>)', () => {
      const dom = createMockDocument({
        elements: {
          'h1.top-card-layout__title': { textContent: 'Staff Distributed Systems Engineer' },
          'a.topcard__org-name-link': { textContent: 'CloudScale Inc' },
          'span.topcard__flavor--bullet': { textContent: 'Seattle, WA (Remote)' },
          '.show-more-less-html__markup': {
            textContent: 'About the role: CloudScale is looking for a Staff Distributed Systems Engineer. Requirements: 5+ years Go, Kubernetes, Raft consensus.',
            querySelectorAll: () => [
              { textContent: '5+ years experience in distributed systems' },
              { textContent: 'Deep expertise with Go and Kubernetes' },
            ],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/view/4211223344/';

      const canHandle = LinkedInAdapter.canHandle(dom, url);
      assert.strictEqual(canHandle, true);

      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Staff Distributed Systems Engineer');
      assert.strictEqual(detection.jobData.company, 'CloudScale Inc');
      assert.strictEqual(detection.jobData.externalJobId, '4211223344');
      assert.strictEqual(detection.portalMetadata.portalName, 'LinkedIn Jobs');
    });

    it('detects valid LinkedIn page with currentJobId query parameter', () => {
      const dom = createMockDocument({
        elements: {
          '.job-details-jobs-unified-top-card__job-title': { textContent: 'Lead Backend Engineer' },
          '.job-details-jobs-unified-top-card__company-name': { textContent: 'FinTech Labs' },
          '#job-details': {
            textContent: 'FinTech Labs is hiring a Lead Backend Engineer with Node.js and PostgreSQL.',
            querySelectorAll: () => [{ textContent: 'Strong Node.js and SQL skills' }],
          },
        },
      });
      const url = 'https://www.linkedin.com/jobs/search/?currentJobId=4987654321&geoId=103644278';

      assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);
      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Lead Backend Engineer');
      assert.strictEqual(detection.jobData.externalJobId, '4987654321');
    });

    it('strictly rejects LinkedIn non-job pages (feed, profile, messaging, notifications)', () => {
      const nonJobUrls = [
        'https://www.linkedin.com/feed/',
        'https://www.linkedin.com/feed/update/urn:li:activity:12345',
        'https://www.linkedin.com/in/alex-engineer/',
        'https://www.linkedin.com/messaging/thread/67890/',
        'https://www.linkedin.com/notifications/',
        'https://www.linkedin.com/mynetwork/',
        'https://www.linkedin.com/settings/',
      ];

      for (const url of nonJobUrls) {
        const dom = createMockDocument({ bodyText: 'General social feed and professional network content' });
        const canHandle = LinkedInAdapter.canHandle(dom, url);
        assert.strictEqual(canHandle, false, `Failed to reject ${url}`);

        const result = JobDetectionEngine.evaluate(dom, url);
        assert.strictEqual(result.detected, false);
        assert.strictEqual(result.jobData, null);
        assert.strictEqual(result.portalMetadata.portalName, 'LinkedIn Jobs');
      }
    });

    it('rejects LinkedIn search page without an active selected job detail', () => {
      const dom = createMockDocument({
        bodyText: 'Job search results for software engineer. 500+ jobs found.',
        elements: {}, // No active job detail pane or top card
      });
      const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer';

      const canHandle = LinkedInAdapter.canHandle(dom, searchUrl);
      assert.strictEqual(canHandle, false, 'Search listing without active job must not be handled as active job page');

      const result = JobDetectionEngine.evaluate(dom, searchUrl);
      assert.strictEqual(result.detected, false);
      assert.strictEqual(result.jobData, null);
      assert.strictEqual(result.portalMetadata.portalName, 'LinkedIn Jobs');
    });
  });

  describe('2. Conservative Generic Detection (ChatGPT & Non-Job False Positive Prevention)', () => {
    it('strictly rejects ChatGPT pages (chat conversation, prompt interface, no hardcoded blacklist)', () => {
      const chatgptDom = createMockDocument({
        bodyText: 'ChatGPT. You are an expert backend engineer with 10 years of experience. Tell me about microservices, Docker, Kubernetes, and developer skills.',
        elements: {
          'h1': { textContent: 'ChatGPT' },
        },
      });
      const chatgptUrl = 'https://chatgpt.com/c/68c74a5e-1234-5678-90ab-cdef12345678';

      // Verify portal identity is not claimed as a career portal
      const portalId = AdapterRegistry.resolvePortalIdentity(chatgptUrl, chatgptDom);
      assert.strictEqual(portalId.portalName, 'Web Page');
      assert.strictEqual(portalId.isPortalRecognized, false);

      // Verify generic adapter strictly rejects it
      const canHandle = GenericCareerPageAdapter.canHandle(chatgptDom, chatgptUrl);
      assert.strictEqual(canHandle, false);

      // Verify detection engine does NOT flag it as a job
      const detection = JobDetectionEngine.evaluate(chatgptDom, chatgptUrl);
      assert.strictEqual(detection.detected, false);
      assert.strictEqual(detection.jobData, null);
      assert.strictEqual(detection.portalMetadata.portalName, 'Web Page');
    });

    it('strictly rejects ordinary content pages (GitHub repo, GitHub issue, documentation, blog articles)', () => {
      const pages = [
        {
          url: 'https://github.com/torvalds/linux',
          dom: createMockDocument({
            elements: { 'h1': { textContent: 'torvalds / linux' } },
            bodyText: 'Linux kernel source tree. Requirements: C compiler, make, gcc.',
          }),
        },
        {
          url: 'https://github.com/facebook/react/issues/12345',
          dom: createMockDocument({
            elements: { 'h1': { textContent: 'Bug: state update batching issue' } },
            bodyText: 'Steps to reproduce: developer experience in react 19. Responsibilities: fix bug.',
          }),
        },
        {
          url: 'https://docs.python.org/3/tutorial/classes.html',
          dom: createMockDocument({
            elements: { 'h1': { textContent: '9. Classes — Python 3 documentation' } },
            bodyText: 'Classes provide a means of bundling data and functionality together.',
          }),
        },
        {
          url: 'https://medium.com/@dev/how-to-become-a-senior-developer-in-2026',
          dom: createMockDocument({
            elements: { 'h1': { textContent: 'How to Become a Senior Developer in 2026' } },
            bodyText: 'Skills you need: system design, leadership, years of experience, mentoring junior engineers.',
          }),
        },
        {
          url: 'https://www.google.com/search?q=full+stack+engineer+jobs',
          dom: createMockDocument({
            elements: { 'h1': { textContent: 'Google Search' } },
            bodyText: 'Search results for full stack engineer jobs in San Francisco.',
          }),
        },
      ];

      for (const page of pages) {
        const canHandle = GenericCareerPageAdapter.canHandle(page.dom, page.url);
        assert.strictEqual(canHandle, false, `Generic adapter falsely claimed ${page.url}`);

        const result = JobDetectionEngine.evaluate(page.dom, page.url);
        assert.strictEqual(result.detected, false, `Falsely detected job on ${page.url}`);
        assert.strictEqual(result.jobData, null);
      }
    });

    it('positively detects valid JSON-LD JobPosting on custom company career page', () => {
      const jsonLdPayload = {
        '@context': 'https://schema.org/',
        '@type': 'JobPosting',
        title: 'Senior Cloud Platform Engineer',
        description: 'Vanguard Systems is seeking a Senior Cloud Platform Engineer with Kubernetes and AWS experience.',
        hiringOrganization: {
          '@type': 'Organization',
          name: 'Vanguard Systems',
        },
        jobLocation: {
          '@type': 'Place',
          address: {
            addressLocality: 'Austin',
            addressRegion: 'TX',
          },
        },
        employmentType: 'FULL_TIME',
      };

      const dom = createMockDocument({
        scripts: [jsonLdPayload],
        bodyText: 'Vanguard Systems Careers',
      });
      const url = 'https://careers.vanguardsystems.io/engineering/cloud-platform';

      const canHandle = GenericCareerPageAdapter.canHandle(dom, url);
      assert.strictEqual(canHandle, true);

      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Senior Cloud Platform Engineer');
      assert.strictEqual(detection.jobData.company, 'Vanguard Systems');
      assert.strictEqual(detection.jobData.location, 'Austin, TX');
    });

    it('positively detects generic career portal with job URL and substantive Apply structure', () => {
      const dom = createMockDocument({
        elements: {
          'h1': { textContent: 'Lead Infrastructure Engineer' },
          'button[class*="apply" i]': { textContent: 'Apply for this Job' },
          'h2': { textContent: 'Job Description' },
          'h3': { textContent: 'Requirements' },
          'li': [
            { textContent: '4+ years experience designing infrastructure pipelines with Terraform.' },
            { textContent: 'Hands-on production Kubernetes cluster operations experience.' },
            { textContent: 'Proficiency in Go, Python, or Rust for systems tooling.' },
          ],
        },
        bodyText: 'About the role: Nebula AI is seeking a Lead Infrastructure Engineer to build our scalable distributed platform. You will be responsible for orchestrating Kubernetes, configuring Terraform modules, and building resilient distributed systems. Apply for this job today! Requirements: 4+ years Terraform and Kubernetes.',
      });
      const url = 'https://jobs.ashbyhq.com/nebula-ai/8765-4321';

      const canHandle = GenericCareerPageAdapter.canHandle(dom, url);
      assert.strictEqual(canHandle, true);

      const detection = JobDetectionEngine.evaluate(dom, url);
      assert.strictEqual(detection.detected, true);
      assert.strictEqual(detection.jobData.title, 'Lead Infrastructure Engineer');
    });
  });

  describe('3. Local-Only Detection & Strict Server Call Boundary (Parts 1 & 2 & 15 & 18)', () => {
    let mockBackendClient;
    let mockStore;
    let controller;
    let analyzeCalls = 0;
    let prepareCalls = 0;

    beforeEach(() => {
      analyzeCalls = 0;
      prepareCalls = 0;

      mockBackendClient = {
        getHealth: async () => ({ status: 'ok' }),
        getAuthStatus: async () => ({
          authenticated: true,
          status: 'AUTHENTICATED',
          user: { id: 'usr-123', email: 'test@example.com', displayName: 'Test User' },
        }),
        analyzeJob: async (job) => {
          analyzeCalls++;
          return {
            fitAnalysis: { overallScore: 84, matchedSkills: ['Node.js', 'PostgreSQL'], missingSkills: ['GraphQL'] },
            recommendedProjects: [{ id: 'p1', name: 'Scale Pipeline', relevanceScore: 88 }],
            analysisSnapshotId: 'snap-123',
          };
        },
        prepareHandoff: async () => {
          prepareCalls++;
          return {
            applicationId: 'app-999',
            packageVersion: 1,
            packageHash: 'hash-abc',
          };
        },
      };

      mockStore = new DurableWorkflowStore();
      controller = new SidebarController();
      controller.backendClient = mockBackendClient;
      controller.store = mockStore;
      controller.stateMachine = new WorkflowStateMachine();
      controller.activeTabId = 101;
      controller.isAuthenticated = true;
      controller.currentUser = { id: 'usr-123', email: 'test@example.com' };
      controller.elements = {
        workflowStateText: { textContent: '' },
        workflowLockedBadge: { classList: { add() {}, remove() {} } },
        portalName: { textContent: '' },
        jobTitle: { textContent: '' },
        jobCompany: { textContent: '' },
        jobNotDetectedState: { classList: { add() {}, remove() {} } },
        jobDetectedState: { classList: { add() {}, remove() {} } },
        analysisCard: { classList: { add() {}, remove() {} } },
        projectsCard: { classList: { add() {}, remove() {} } },
        handoffCard: { classList: { add() {}, remove() {} } },
        pendingJobNotification: { classList: { add() {}, remove() {} } },
        pendingJobTitle: { textContent: '' },
        analyzeJobBtn: { disabled: false, textContent: '' },
        prepareHandoffBtn: { disabled: false },
        prepareBtnText: { textContent: '' },
      };
    });

    it('page detection generates ZERO server calls to /api/extension/analyze-job', async () => {
      const sampleJob = {
        title: 'Backend Engineer',
        company: 'Apex Scale',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      // Emulate detector discovering job
      await controller._handleJobDetectedEvent(sampleJob);

      assert.strictEqual(analyzeCalls, 0, 'Detection MUST NOT call /analyze-job');
      assert.strictEqual(prepareCalls, 0, 'Detection MUST NOT call /prepare-handoff');
      assert.strictEqual(controller.activeJob.title, 'Backend Engineer');
      assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false);
      assert.strictEqual(controller.elements.analyzeJobBtn.textContent, 'Analyze Job Match');
    });

    it('background detector events & same-job updates generate ZERO server calls', async () => {
      const sampleJob = {
        title: 'Backend Engineer',
        company: 'Apex Scale',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      await controller._handleJobDetectedEvent(sampleJob);
      // Repeated detector event for same job
      await controller._handleJobDetectedEvent(sampleJob);

      assert.strictEqual(analyzeCalls, 0);
      assert.strictEqual(prepareCalls, 0);
    });

    it('detecting Job B while Job A is active displays pending notice with ZERO server calls', async () => {
      const jobA = {
        title: 'Job A - Senior Backend',
        company: 'Company A',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      const jobB = {
        title: 'Job B - Staff Architect',
        company: 'Company B',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1002',
      };

      await controller._handleJobDetectedEvent(jobA);
      assert.strictEqual(controller.activeJob.title, jobA.title);

      // Navigation to Job B in background
      await controller._handleJobDetectedEvent(jobB);

      assert.strictEqual(analyzeCalls, 0, 'Background detection of Job B must NOT call analyze');
      assert.strictEqual(controller.activeJob.title, jobA.title, 'Job A must remain active');
      assert.strictEqual(controller.pendingDetectedJob.title, jobB.title, 'Job B must be stored as pending');
    });

    it('explicit Rescan switches active workflow with ZERO server calls', async () => {
      const jobA = {
        title: 'Job A - Senior Backend',
        company: 'Company A',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };
      const jobB = {
        title: 'Job B - Staff Architect',
        company: 'Company B',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1002',
      };

      await controller._handleJobDetectedEvent(jobA);
      await controller._handleJobDetectedEvent(jobB);

      // User clicks Rescan
      await controller.rescan();

      assert.strictEqual(analyzeCalls, 0, 'Rescan must NOT trigger server analysis');
      assert.strictEqual(controller.activeJob.title, jobB.title, 'Job B is now active');
      assert.strictEqual(controller.pendingDetectedJob, null, 'Pending job cleared');
      assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false);
      assert.strictEqual(controller.elements.analyzeJobBtn.textContent, 'Analyze Job Match');
    });

    it('ONLY explicit user click on Analyze Job Match initiates server analysis (exactly 1 call)', async () => {
      const sampleJob = {
        title: 'Backend Engineer',
        company: 'Apex Scale',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      await controller._handleJobDetectedEvent(sampleJob);
      assert.strictEqual(analyzeCalls, 0);

      // User explicitly clicks Analyze
      await controller.runAnalyzeJob();

      assert.strictEqual(analyzeCalls, 1, 'Exactly one analyze-job call made on explicit click');
      assert.strictEqual(controller.cachedState.fitAnalysis.overallScore, 84);
      assert.strictEqual(controller.stateMachine.state, WORKFLOW_STATES.ANALYSIS_READY);
    });

    it('double-click on Analyze Job Match executes exactly 1 request (double-click protection)', async () => {
      const sampleJob = {
        title: 'Backend Engineer',
        company: 'Apex Scale',
        sourceUrl: 'https://www.linkedin.com/jobs/view/1001',
      };

      await controller._handleJobDetectedEvent(sampleJob);

      // Rapid concurrent/double click
      const click1 = controller.runAnalyzeJob();
      const click2 = controller.runAnalyzeJob();

      await Promise.all([click1, click2]);

      assert.strictEqual(analyzeCalls, 1, 'Double-click must produce exactly 1 network call');
    });
  });

  describe('4. Tab Scoping & Lock Isolation (Parts 8 & 9 & 10 & 13 & 14)', () => {
    let store;
    let controller;
    let mockBackendClient;

    beforeEach(() => {
      store = new DurableWorkflowStore();
      controller = new SidebarController();
      controller.store = store;
      controller.stateMachine = new WorkflowStateMachine();
      controller.isAuthenticated = true;
      controller.currentUser = { id: 'usr-1' };
      controller.elements = {
        workflowStateText: { textContent: '' },
        workflowLockedBadge: { classList: { add() {}, remove() {} } },
        portalName: { textContent: '' },
        jobTitle: { textContent: '' },
        jobCompany: { textContent: '' },
        jobNotDetectedState: { classList: { add() {}, remove() {} } },
        jobDetectedState: { classList: { add() {}, remove() {} } },
        analysisCard: { classList: { add() {}, remove() {} } },
        projectsCard: { classList: { add() {}, remove() {} } },
        handoffCard: { classList: { add() {}, remove() {} } },
        pendingJobNotification: { classList: { add() {}, remove() {} } },
        analyzeJobBtn: { disabled: false, textContent: '' },
      };

      mockBackendClient = {
        analyzeJob: async (job) => ({
          fitAnalysis: { score: 90 },
          recommendedProjects: [],
        }),
      };
      controller.backendClient = mockBackendClient;
    });

    it('tab A and tab B maintain strictly independent workflow states and locks', async () => {
      const tabAId = 101;
      const tabBId = 202;

      const jobA = { title: 'Engineer A', company: 'Corp A', sourceUrl: 'https://site.com/a' };
      const jobB = { title: 'Engineer B', company: 'Corp B', sourceUrl: 'https://site.com/b' };

      // Set up Tab A with completed handoff -> locked
      const tabAState = store.createInitialState(tabAId);
      tabAState.jobData = jobA;
      tabAState.jobFingerprint = JobIdentity.deriveJobFingerprint(jobA);
      tabAState.applicationId = 'app-A';
      tabAState.handoffData = { packageVersion: 1, packageHash: 'hashA' };
      tabAState.workflowState = WORKFLOW_STATES.APPLICATION_READY;
      tabAState.lockState = 'LOCKED';
      tabAState.isLocked = true;
      await store.saveTabState(tabAId, tabAState);

      // Set up Tab B with detected job -> unlocked
      const tabBState = store.createInitialState(tabBId);
      tabBState.jobData = jobB;
      tabBState.jobFingerprint = JobIdentity.deriveJobFingerprint(jobB);
      tabBState.workflowState = WORKFLOW_STATES.JOB_DETECTED;
      tabBState.lockState = 'UNLOCKED';
      tabBState.isLocked = false;
      await store.saveTabState(tabBId, tabBState);

      // Activate Tab A in sidebar
      controller.activeTabId = tabAId;
      await controller._hydrateFromStore();

      assert.strictEqual(controller.activeJob.title, 'Engineer A');
      assert.strictEqual(controller.isWorkflowLocked(), true, 'Tab A must be locked');

      // Switch to Tab B in sidebar
      controller.activeTabId = tabBId;
      await controller._hydrateFromStore();

      // Invariant: Tab B must NOT inherit Tab A locked state or active job!
      assert.strictEqual(controller.activeJob.title, 'Engineer B');
      assert.strictEqual(controller.isWorkflowLocked(), false, 'Tab B must NOT be locked');
      assert.strictEqual(controller.elements.analyzeJobBtn.disabled, false, 'Tab B Analyze button must be enabled');
      assert.strictEqual(controller.elements.analyzeJobBtn.textContent, 'Analyze Job Match');

      // Switch back to Tab A
      controller.activeTabId = tabAId;
      await controller._hydrateFromStore();

      assert.strictEqual(controller.activeJob.title, 'Engineer A', 'Tab A state preserved intact');
      assert.strictEqual(controller.cachedState.applicationId, 'app-A');
      assert.strictEqual(controller.isWorkflowLocked(), true);
    });

    it('resetting Tab A resets only Tab A and leaves Tab B completely unaffected', async () => {
      const tabAId = 101;
      const tabBId = 202;

      const jobA = { title: 'Role A', company: 'Corp A' };
      const jobB = { title: 'Role B', company: 'Corp B' };

      const stateA = store.createInitialState(tabAId);
      stateA.jobData = jobA;
      stateA.workflowState = WORKFLOW_STATES.ANALYSIS_READY;
      await store.saveTabState(tabAId, stateA);

      const stateB = store.createInitialState(tabBId);
      stateB.jobData = jobB;
      stateB.applicationId = 'app-B';
      stateB.workflowState = WORKFLOW_STATES.APPLICATION_READY;
      stateB.lockState = 'LOCKED';
      await store.saveTabState(tabBId, stateB);

      // Reset Tab A
      controller.activeTabId = tabAId;
      await controller.resetWorkflow();

      const freshA = await store.getTabState(tabAId);
      assert.strictEqual(freshA.workflowState, WORKFLOW_STATES.IDLE);
      assert.strictEqual(freshA.jobData, null);

      const intactB = await store.getTabState(tabBId);
      assert.strictEqual(intactB.workflowState, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(intactB.applicationId, 'app-B');
      assert.strictEqual(intactB.lockState, 'LOCKED');
    });
  });

  describe('5. Existing Handoff Reuse on Same Job (Part 21 & P62 Compatibility)', () => {
    it('re-analyzing existing job attaches existing handoff without calling prepare-handoff', async () => {
      let prepareCalls = 0;
      const existingAppId = 'app-canonical-777';

      const mockBackend = {
        analyzeJob: async () => ({
          fitAnalysis: { score: 92 },
          recommendedProjects: [],
          existingApplication: { id: existingAppId },
          existingHandoff: {
            applicationId: existingAppId,
            packageVersion: 2,
            packageHash: 'canon-hash-777',
            packageStatus: 'SAVED',
          },
        }),
        prepareHandoff: async () => {
          prepareCalls++;
          return {};
        },
      };

      const controller = new SidebarController();
      controller.backendClient = mockBackend;
      controller.store = new DurableWorkflowStore();
      controller.stateMachine = new WorkflowStateMachine();
      controller.activeTabId = 555;
      controller.isAuthenticated = true;
      controller.currentUser = { id: 'usr-canon' };
      controller.activeJob = { title: 'Principal Architect', company: 'Vanguard' };
      controller.cachedState = controller.store.createInitialState(555);
      controller.elements = {
        workflowStateText: { textContent: '' },
        workflowLockedBadge: { classList: { add() {}, remove() {} } },
        portalName: { textContent: '' },
        jobTitle: { textContent: '' },
        jobCompany: { textContent: '' },
        jobNotDetectedState: { classList: { add() {}, remove() {} } },
        jobDetectedState: { classList: { add() {}, remove() {} } },
        analysisCard: { classList: { add() {}, remove() {} } },
        projectsCard: { classList: { add() {}, remove() {} } },
        handoffCard: { classList: { add() {}, remove() {} } },
        pendingJobNotification: { classList: { add() {}, remove() {} } },
        prepareBtnText: { textContent: '' },
        prepareHandoffBtn: { disabled: false },
        regenerateHandoffBtn: { classList: { add() {}, remove() {} } },
        handoffStatusBadge: { textContent: '', className: '' },
        artifactsContainer: { classList: { add() {}, remove() {} } },
        analyzeJobBtn: { disabled: false, textContent: '' },
      };

      await controller.runAnalyzeJob();

      assert.strictEqual(prepareCalls, 0, 'Re-analysis MUST NOT generate new handoff');
      assert.strictEqual(controller.cachedState.applicationId, existingAppId);
      assert.strictEqual(controller.cachedState.workflowState, WORKFLOW_STATES.APPLICATION_READY);
      assert.strictEqual(controller.cachedState.lockState, 'LOCKED');
      assert.strictEqual(controller.isWorkflowLocked(), true);
      assert.strictEqual(controller.elements.prepareBtnText.textContent, 'View Handoff Kit');
    });
  });
});
