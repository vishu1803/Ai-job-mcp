/**
 * @file P58 Unit Tests: Portal Identity & Multi-Signal Job Detection Engine
 *
 * Validates:
 * 1. Strict separation of portal identity from job detection.
 * 2. LinkedIn-type portal detection (public and logged-in DOM structures).
 * 3. Rejection of LinkedIn non-job pages (feed, profile, notifications).
 * 4. LinkedIn SPA navigation & URL normalization (currentJobId preserved).
 * 5. Multi-portal coverage: Greenhouse, Lever, Workday, Generic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AdapterRegistry,
  KNOWN_PORTAL_CAPABILITIES,
} from '../../extension/job-detection/adapter-registry.js';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { JobDetectionEngine } from '../../extension/job-detection/detection-engine.js';
import { LinkedInAdapter } from '../../extension/job-detection/adapters/linkedin.adapter.js';
import { GenericCareerPageAdapter } from '../../extension/job-detection/adapters/generic-career.adapter.js';
import {
  normalizeJobPostingUrl,
  deriveJobFingerprint,
  isSameJobIdentity,
} from '../../extension/lib/job-identity.js';

function createMockDocument({ elements = {}, meta = {}, scripts = [], bodyText = '' } = {}) {
  return {
    body: { textContent: bodyText },
    querySelector(selector) {
      if (elements[selector]) {
        return elements[selector];
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
        return scripts.map((s) => ({ textContent: typeof s === 'string' ? s : JSON.stringify(s) }));
      }
      if (elements[selector]) {
        return Array.isArray(elements[selector]) ? elements[selector] : [elements[selector]];
      }
      return [];
    },
  };
}

describe('P58 Portal Identity & Job Detection Engine', () => {
  it('1. Strictly separates portal identity from job detection on non-job LinkedIn pages', () => {
    // A. LinkedIn Feed page
    const feedDom = createMockDocument({ bodyText: 'LinkedIn Feed Content' });
    const feedUrl = 'https://www.linkedin.com/feed/';

    const portalIdentity = AdapterRegistry.resolvePortalIdentity(feedUrl, feedDom);
    assert.strictEqual(portalIdentity.adapterId, 'LINKEDIN');
    assert.strictEqual(portalIdentity.portalName, 'LinkedIn Jobs');
    assert.strictEqual(portalIdentity.confidence, 'HIGH');

    const resolution = AdapterRegistry.resolve(feedDom, feedUrl);
    assert.strictEqual(resolution.adapterId, 'LINKEDIN');
    assert.strictEqual(resolution.metadata.portalName, 'LinkedIn Jobs');
    assert.strictEqual(resolution.isJobPage, false, 'Feed page must NOT be flagged as a job page');

    const detection = JobDetectionEngine.evaluate(feedDom, feedUrl);
    assert.strictEqual(detection.detected, false);
    assert.strictEqual(detection.jobData, null);
    assert.strictEqual(detection.portalMetadata.portalName, 'LinkedIn Jobs');
    assert.strictEqual(detection.portalMetadata.confidence, 'HIGH');

    // B. LinkedIn User Profile page
    const profileDom = createMockDocument({ bodyText: 'Jane Doe Software Architect' });
    const profileUrl = 'https://www.linkedin.com/in/janedoe/';

    const profileRes = AdapterRegistry.resolve(profileDom, profileUrl);
    assert.strictEqual(profileRes.adapterId, 'LINKEDIN');
    assert.strictEqual(
      profileRes.isJobPage,
      false,
      'Profile page must NOT be flagged as a job page'
    );

    const profileDet = JobDetectionEngine.evaluate(profileDom, profileUrl);
    assert.strictEqual(profileDet.detected, false);
    assert.strictEqual(profileDet.jobData, null);
    assert.strictEqual(profileDet.portalMetadata.portalName, 'LinkedIn Jobs');
  });

  it('2. Extracts real LinkedIn public guest DOM fixture correctly', () => {
    const mockList = [
      { textContent: '3+ years of experience with Python and FastAPI' },
      { textContent: 'Strong experience with PostgreSQL and Docker' },
      { textContent: 'Experience deploying on AWS or Kubernetes' },
    ];

    const descNode = {
      textContent:
        'About the role: We are hiring a Senior Python Engineer to build scalable microservices. Requirements include Python, FastAPI, and Docker. Apply now to join our team.',
      querySelectorAll(selector) {
        if (selector === 'li') return mockList;
        return [];
      },
    };

    const dom = createMockDocument({
      elements: {
        'h1.top-card-layout__title': { textContent: 'Senior Python Engineer' },
        'a.topcard__org-name-link': { textContent: 'Acme Corp' },
        'span.topcard__flavor--bullet': { textContent: 'San Francisco, CA (Remote)' },
        '.show-more-less-html__markup': descNode,
      },
      bodyText: 'Senior Python Engineer Acme Corp San Francisco',
    });

    const url = 'https://www.linkedin.com/jobs/view/4198765432';

    assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);

    const payload = LinkedInAdapter.extract(dom, url);
    assert.strictEqual(payload.title, 'Senior Python Engineer');
    assert.strictEqual(payload.company, 'Acme Corp');
    assert.strictEqual(payload.location, 'San Francisco, CA (Remote)');
    assert.strictEqual(payload.workplace, 'REMOTE');
    assert.strictEqual(payload.externalJobId, '4198765432');
    assert.ok(payload.description.includes('About the role'));
    assert.strictEqual(payload.requirements.length, 3);
    assert.ok(payload.requirements[0].includes('FastAPI'));

    const detection = JobDetectionEngine.evaluate(dom, url);
    assert.strictEqual(detection.detected, true);
    assert.strictEqual(detection.confidence, 'HIGH');
    assert.strictEqual(detection.portalMetadata.portalName, 'LinkedIn Jobs');
  });

  it('3. Extracts real LinkedIn logged-in unified card DOM fixture correctly', () => {
    const mockList = [
      { textContent: '5+ years of experience in site reliability engineering' },
      { textContent: 'Proficiency in Go or Python' },
      { textContent: 'Deep expertise in Terraform and Kubernetes' },
    ];

    const descNode = {
      textContent:
        'We are seeking a Staff Infrastructure Engineer to lead our Kubernetes platform. Apply now to join our high-scale team.',
      querySelectorAll(selector) {
        if (selector === 'li') return mockList;
        return [];
      },
    };

    const dom = createMockDocument({
      elements: {
        '.job-details-jobs-unified-top-card__job-title': {
          textContent: 'Staff Infrastructure Engineer',
        },
        '.job-details-jobs-unified-top-card__company-name': { textContent: 'DataScale Systems' },
        '.job-details-jobs-unified-top-card__bullet': { textContent: 'New York, NY · Hybrid' },
        '#job-details': descNode,
      },
    });

    const url = 'https://www.linkedin.com/jobs/search/?currentJobId=4123456789';

    assert.strictEqual(LinkedInAdapter.canHandle(dom, url), true);

    const payload = LinkedInAdapter.extract(dom, url);
    assert.strictEqual(payload.title, 'Staff Infrastructure Engineer');
    assert.strictEqual(payload.company, 'DataScale Systems');
    assert.strictEqual(payload.workplace, 'HYBRID');
    assert.strictEqual(payload.externalJobId, '4123456789');
    assert.strictEqual(payload.requirements.length, 3);
  });

  it('4. Preserves LinkedIn currentJobId across SPA route changes and derives distinct fingerprints', () => {
    const jobAUrl =
      'https://www.linkedin.com/jobs/search/?currentJobId=4111111111&refId=abc&trackingId=xyz';
    const jobBUrl =
      'https://www.linkedin.com/jobs/search/?currentJobId=4222222222&refId=def&trackingId=uvw';

    const cleanA = normalizeJobPostingUrl(jobAUrl);
    const cleanB = normalizeJobPostingUrl(jobBUrl);

    // currentJobId must be preserved; tracking params (refId, trackingId) stripped
    assert.ok(
      cleanA.includes('currentJobId=4111111111'),
      'currentJobId must be preserved in cleanA'
    );
    assert.ok(!cleanA.includes('trackingId'), 'trackingId must be stripped');
    assert.ok(
      cleanB.includes('currentJobId=4222222222'),
      'currentJobId must be preserved in cleanB'
    );
    assert.notStrictEqual(cleanA, cleanB, 'Clean URLs must not collapse to the same search root');

    const jobA = {
      provider: 'LINKEDIN',
      externalJobId: '4111111111',
      title: 'Backend Engineer',
      company: 'Acme',
      url: jobAUrl,
    };
    const jobB = {
      provider: 'LINKEDIN',
      externalJobId: '4222222222',
      title: 'Frontend Engineer',
      company: 'Acme',
      url: jobBUrl,
    };

    const fpA = deriveJobFingerprint(jobA);
    const fpB = deriveJobFingerprint(jobB);

    assert.notStrictEqual(fpA, fpB, 'Fingerprints for distinct currentJobIds must differ');
    assert.strictEqual(isSameJobIdentity(jobA, jobB), false, 'isSameJobIdentity must return false');
  });

  it('5. Correctly resolves portal identity across Greenhouse, Lever, Workday, and Generic', () => {
    const testPortals = [
      {
        url: 'https://boards.greenhouse.io/stripe/jobs/123456',
        expectedId: 'GREENHOUSE',
        expectedName: 'Greenhouse ATS',
      },
      {
        url: 'https://jobs.lever.co/netflix/abcdef',
        expectedId: 'LEVER',
        expectedName: 'Lever ATS',
      },
      {
        url: 'https://acme.wd5.myworkdayjobs.com/Careers/job/NY/Engineer_R123',
        expectedId: 'WORKDAY',
        expectedName: 'Workday ATS',
      },
      {
        url: 'https://www.indeed.com/viewjob?jk=1234567890',
        expectedId: 'INDEED',
        expectedName: 'Indeed Jobs',
      },
      {
        url: 'https://www.naukri.com/job-listings-python-dev-123',
        expectedId: 'NAUKRI',
        expectedName: 'Naukri.com',
      },
      {
        url: 'https://careers.uber.com/jobs/123',
        expectedId: 'GENERIC',
        expectedName: 'Generic Career Portal',
      },
    ];

    for (const tp of testPortals) {
      const identity = AdapterRegistry.resolvePortalIdentity(tp.url);
      assert.strictEqual(identity.adapterId, tp.expectedId, `Adapter mismatch for ${tp.url}`);
      assert.strictEqual(identity.portalName, tp.expectedName, `PortalName mismatch for ${tp.url}`);
    }
  });

  it('6. Generic adapter strictly rejects known specialized portal domains', () => {
    assert.strictEqual(
      GenericCareerPageAdapter.canHandle(null, 'https://www.linkedin.com/feed/'),
      false
    );
    assert.strictEqual(
      GenericCareerPageAdapter.canHandle(null, 'https://boards.greenhouse.io/'),
      false
    );
    assert.strictEqual(GenericCareerPageAdapter.canHandle(null, 'https://jobs.lever.co/'), false);
    assert.strictEqual(
      GenericCareerPageAdapter.canHandle(null, 'https://company.myworkdayjobs.com/'),
      false
    );
    assert.strictEqual(GenericCareerPageAdapter.canHandle(null, 'https://www.indeed.com/'), false);

    // Generic adapter handles real third-party career portals
    assert.strictEqual(
      GenericCareerPageAdapter.canHandle(null, 'https://jobs.ashbyhq.com/startup/123'),
      true
    );
    assert.strictEqual(
      GenericCareerPageAdapter.canHandle(null, 'https://company.bamboohr.com/careers/456'),
      true
    );
  });
});
