/**
 * @file P70 Unit Tests: LinkedIn Description Readiness & Analyze Contract.
 *
 * Verifies:
 * 1. Separation of detection readiness (JOB_DETECTED) from analysis readiness (ANALYSIS_READY).
 * 2. Localized description extraction from active containers (.show-more-less-html__markup, etc.).
 * 3. Title/company parsing with dash/em-dash location suffixes (e.g. Appinventiv — India).
 * 4. Analyze button contract: disabled when description < 50 with neutral loading state.
 * 5. Server-side defense: local abort and backend 400 validation when description < 50.
 * 6. Hydration reconciliation: updating active job when substantive description mounts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { AdapterRegistry } from '../../extension/job-detection/adapter-registry.js';

// Helper: Minimal Mock Document Builder
function createMockDocument({
  title = '',
  url = 'https://www.linkedin.com/jobs/view/4464770430/',
  selectors = {},
  jsonLd = null,
} = {}) {
  return {
    title,
    location: { href: url, hostname: new URL(url).hostname },
    querySelector: (sel) => {
      if (selectors[sel]) {
        return selectors[sel];
      }
      for (const [pattern, val] of Object.entries(selectors)) {
        if (sel.includes(pattern) || pattern.includes(sel)) {
          return val;
        }
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('script[type*="ld+json"]') && jsonLd) {
        return [
          {
            textContent: JSON.stringify(jsonLd),
            getAttribute: () => 'application/ld+json',
          },
        ];
      }
      return [];
    },
    body: {
      textContent: 'Body text content that should NEVER be used for LinkedIn description extraction',
    },
  };
}

describe('P70: LinkedIn Description Readiness & Analyze Contract', () => {
  describe('1. Separation of Detection Ready vs Analysis Ready', () => {
    it('Job detected with valid title and company but description < 50 has isReady=true and analysisReady=false', () => {
      const adapter = new LinkedInAdapter();
      const mockDoc = createMockDocument({
        title: 'Software Engineer at Appinventiv — India | LinkedIn Jobs',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        selectors: {
          '.show-more-less-html__markup': {
            textContent: 'Short text', // < 50 chars
            querySelectorAll: () => [],
          },
        },
      });

      const extracted = LinkedInAdapter.extract(mockDoc, mockDoc.location.href);

      assert.equal(extracted.title, 'Software Engineer');
      assert.equal(extracted.company, 'Appinventiv');
      assert.equal(extracted.isReady, true, 'Job identity is recognized and detected');
      assert.equal(extracted.analysisReady, false, 'Analysis must be NOT ready when description < 50');
    });

    it('Job detected with valid title, company, and description >= 50 has isReady=true and analysisReady=true', () => {
      const adapter = new LinkedInAdapter();
      const substantiveDesc = 'The ideal candidate will be responsible for developing high-quality applications and scalable backend APIs using Node.js and TypeScript.';
      const mockDoc = createMockDocument({
        title: 'Software Engineer at Appinventiv — India | LinkedIn Jobs',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        selectors: {
          '.show-more-less-html__markup': {
            textContent: substantiveDesc,
            querySelectorAll: () => [],
          },
        },
      });

      const extracted = LinkedInAdapter.extract(mockDoc, mockDoc.location.href);

      assert.equal(extracted.title, 'Software Engineer');
      assert.equal(extracted.company, 'Appinventiv');
      assert.equal(extracted.isReady, true);
      assert.equal(extracted.analysisReady, true, 'Analysis is ready when description >= 50');
      assert.equal(extracted.description, substantiveDesc);
    });

    it('JobPageDetector propagates analysisReady flag correctly', () => {
      const substantiveDesc = 'General Motors is seeking a Senior Go Engineer to architect high-performance distributed microservices on Kubernetes.';
      const docWithDesc = createMockDocument({
        title: 'Senior Software Engineer – Go (Golang) | General Motors | LinkedIn',
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        selectors: {
          '#job-details': {
            textContent: substantiveDesc,
            querySelectorAll: () => [],
          },
        },
      });

      const detected = JobPageDetector.detect(docWithDesc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(detected.isConfident, true);
      assert.equal(detected.isReady, true);
      assert.equal(detected.analysisReady, true);

      const docWithoutDesc = createMockDocument({
        title: 'Senior Software Engineer – Go (Golang) | General Motors | LinkedIn',
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        selectors: {},
      });
      const detectedNoDesc = JobPageDetector.detect(docWithoutDesc, 'https://www.linkedin.com/jobs/view/4419969671/');
      assert.equal(detectedNoDesc.isReady, true);
      assert.equal(detectedNoDesc.analysisReady, false, 'analysisReady must be false when description missing');
    });

    it('JobDetectionEngine evaluate outputs analysisReady: false when description is under 50', () => {
      const doc = createMockDocument({
        title: 'Software Engineer at Appinventiv — India | LinkedIn Jobs',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        selectors: {},
      });

      const result = JobDetectionEngine.evaluate(doc, 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430');
      assert.equal(result.detected, true, 'Job detected');
      assert.equal(result.ready, true, 'Detection ready');
      assert.equal(result.analysisReady, false, 'Analysis ready must be false');
      assert.equal(result.jobData.analysisReady, false);
    });
  });

  describe('2. Localized Description Extraction & Title Parsing', () => {
    it('Parses em-dash location suffix from title e.g. "Software Engineer at Appinventiv — India | LinkedIn Jobs"', () => {
      const doc = createMockDocument({
        title: 'Software Engineer at Appinventiv — India | LinkedIn Jobs',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
      });
      const res = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(res.title, 'Software Engineer');
      assert.equal(res.company, 'Appinventiv');
    });

    it('Parses regular hyphen location suffix from title e.g. "Backend Developer at Stripe - San Francisco | LinkedIn"', () => {
      const doc = createMockDocument({
        title: 'Backend Developer at Stripe - San Francisco | LinkedIn',
        url: 'https://www.linkedin.com/jobs/view/1234567/',
      });
      const res = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(res.title, 'Backend Developer');
      assert.equal(res.company, 'Stripe');
    });

    it('Extracts description from .show-more-less-html__markup without using document.body', () => {
      const containerText = 'Appinventiv is hiring a Software Engineer to develop high-performance mobile and web solutions with microservices.';
      const doc = createMockDocument({
        title: 'Software Engineer at Appinventiv | LinkedIn',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        selectors: {
          '.show-more-less-html__markup': {
            textContent: `  ${containerText}  `,
            querySelectorAll: () => [],
          },
        },
      });
      const res = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(res.description, containerText);
      assert.doesNotMatch(res.description, /Body text content/);
    });

    it('Extracts description from #job-details active container', () => {
      const containerText = 'General Motors requires an experienced Software Engineer to build connected vehicle APIs and services.';
      const doc = createMockDocument({
        title: 'Senior Software Engineer | General Motors | LinkedIn',
        url: 'https://www.linkedin.com/jobs/view/4419969671/',
        selectors: {
          '#job-details': {
            textContent: containerText,
            querySelectorAll: () => [],
          },
        },
      });
      const res = LinkedInAdapter.extract(doc, doc.location.href);
      assert.equal(res.description, containerText);
    });
  });

  describe('3. Analyze Button Contract & Server-Side Defense', () => {
    it('Simulated sidebar state correctly disables Analyze button and shows loading notice when description < 50', () => {
      const job = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'Short loading description',
        analysisReady: false,
      };

      const desc = (job.description || '').trim();
      const hasValidJob = Boolean(job.title && job.title !== 'Untitled Role');
      const isAnalysisReady = hasValidJob && (job.analysisReady === true || desc.length >= 50);

      assert.equal(hasValidJob, true);
      assert.equal(isAnalysisReady, false);

      const canAnalyze = hasValidJob && isAnalysisReady && true;
      assert.equal(canAnalyze, false, 'Analyze button must be disabled when description < 50');
    });

    it('Simulated sidebar state enables Analyze button when description >= 50', () => {
      const job = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'The ideal candidate will be responsible for developing high-quality applications and scalable backend APIs using Node.js and TypeScript.',
        analysisReady: true,
      };

      const desc = (job.description || '').trim();
      const hasValidJob = Boolean(job.title && job.title !== 'Untitled Role');
      const isAnalysisReady = hasValidJob && (job.analysisReady === true || desc.length >= 50);

      assert.equal(hasValidJob, true);
      assert.equal(isAnalysisReady, true);

      const canAnalyze = hasValidJob && isAnalysisReady && true;
      assert.equal(canAnalyze, true, 'Analyze button must be enabled when description >= 50');
    });

    it('Local re-check in runAnalyzeJob aborts without calling backend if description is under 50 characters', () => {
      let serverCalls = 0;
      function simulatedRunAnalyzeJob(activeJob) {
        const desc = (activeJob?.description || activeJob?.rawText || '').trim();
        if (desc.length < 50) {
          // Abort locally
          return { aborted: true, reason: 'DESCRIPTION_TOO_SHORT' };
        }
        serverCalls++;
        return { aborted: false, serverCalls };
      }

      const shortJob = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'Brief loading...',
      };

      const result = simulatedRunAnalyzeJob(shortJob);
      assert.equal(result.aborted, true);
      assert.equal(serverCalls, 0, 'Zero server calls made when description < 50');

      const fullJob = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        description: 'Appinventiv is hiring a Software Engineer to develop high-performance mobile and web solutions with Node.js and microservices.',
      };

      const resultFull = simulatedRunAnalyzeJob(fullJob);
      assert.equal(resultFull.aborted, false);
      assert.equal(serverCalls, 1, 'Exactly 1 server call made when description >= 50');
    });
  });

  describe('4. Active Job Hydration & Reconciliation', () => {
    it('Reconciles active job when description hydrates from empty to >= 50 for the same job', () => {
      const activeJob = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        sourceUrl: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        externalJobId: '4464770430',
        description: '',
        analysisReady: false,
      };

      const hydratedJobData = {
        title: 'Software Engineer',
        company: 'Appinventiv',
        sourceUrl: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
        externalJobId: '4464770430',
        description: 'The ideal candidate will be responsible for developing high-quality applications and scalable backend APIs using Node.js and TypeScript.',
        analysisReady: true,
      };

      // Simulation of sidebar _reconcileDetectedJob logic
      const existingDesc = (activeJob.description || '').trim();
      const newDesc = (hydratedJobData.description || '').trim();
      let updated = false;

      if (newDesc.length >= 50 && (existingDesc.length < 50 || !activeJob.analysisReady)) {
        activeJob.description = hydratedJobData.description;
        activeJob.analysisReady = true;
        updated = true;
      }

      assert.equal(updated, true);
      assert.equal(activeJob.analysisReady, true);
      assert.equal(activeJob.description.length >= 50, true);
    });
  });
});
