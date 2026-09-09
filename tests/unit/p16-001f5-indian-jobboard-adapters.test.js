/**
 * @file Unit Tests: P16-001F-5 Indian Job-Board Adapters & Detector Coverage
 *
 * Regression coverage for the P16-001F-5 multi-site extension work:
 * - New adapters: Naukri, iimjobs, Shine, Foundit, TimesJobs, Hirect,
 *   Cutshort, Instahyre
 * - JSON-LD helper now extracts requirement bullets from HTML descriptions
 * - Detector registers the new providers and treats them as structured
 * - Tab selector prioritizes Indian job boards
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobPageDetector } from '../../extension/job-detection/job-page-detector.js';
import { NaukriAdapter } from '../../extension/job-detection/adapters/naukri.adapter.js';
import { IimjobsAdapter } from '../../extension/job-detection/adapters/iimjobs.adapter.js';
import { ShineAdapter } from '../../extension/job-detection/adapters/shine.adapter.js';
import { FounditAdapter } from '../../extension/job-detection/adapters/foundit.adapter.js';
import { TimesJobsAdapter } from '../../extension/job-detection/adapters/timesjobs.adapter.js';
import { HirectAdapter } from '../../extension/job-detection/adapters/hirect.adapter.js';
import { CutshortAdapter } from '../../extension/job-detection/adapters/cutshort.adapter.js';
import { InstahyreAdapter } from '../../extension/job-detection/adapters/instahyre.adapter.js';
import { extractJobPostingJsonLd, jsonLdToJobPayload } from '../../extension/job-detection/json-ld.js';
import { selectJobTab, ATS_HOST_PATTERNS } from '../../extension/popup/job-tab-selector.js';

/**
 * Minimal DOM mock sufficient for adapter extraction paths.
 */
function createMockDocument({ elements = {}, scripts = [], bodyText = '', meta = {} } = {}) {
  return {
    body: { textContent: bodyText },
    querySelector(selector) {
      if (elements[selector]) return elements[selector];
      if (selector.startsWith('meta[')) {
        const propMatch = selector.match(/(?:property|name)="([^"]+)"/);
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
      if (selector === 'script') return scripts.map((s) => ({ textContent: s }));
      if (elements[selector]) {
        return Array.isArray(elements[selector]) ? elements[selector] : [elements[selector]];
      }
      return [];
    },
  };
}

function buildLdJobPosting(overrides = {}) {
  return {
    '@type': 'JobPosting',
    title: 'Senior Backend Engineer',
    hiringOrganization: { '@type': 'Organization', name: 'DataKart Pvt Ltd' },
    jobLocation: {
      address: { addressLocality: 'Bengaluru', addressRegion: 'Karnataka', addressCountry: 'IN' },
    },
    description:
      '<p>We are hiring! You will build payment infrastructure.</p><ul><li>5+ years building backend services</li><li>Strong Node.js or Java skills</li><li>UPI/payment systems experience preferred</li></ul>',
    employmentType: 'FULL_TIME',
    ...overrides,
  };
}

// ============================================================================
// JSON-LD helper: requirement extraction from HTML descriptions
// ============================================================================

describe('P16-001F-5: JSON-LD requirement extraction', () => {
  it('extracts <li> bullets as requirements from HTML descriptions', () => {
    const payload = jsonLdToJobPayload(buildLdJobPosting(), 'https://x.example/job/1', 'X');
    assert.equal(payload.requirements.length, 3);
    assert.equal(payload.requirements[0], '5+ years building backend services');
    assert.equal(payload.requirements[1], 'Strong Node.js or Java skills');
  });

  it('returns empty requirements for plain-text descriptions (no throw)', () => {
    const payload = jsonLdToJobPayload(
      buildLdJobPosting({ description: 'Plain text only description without any lists.' }),
      'https://x.example/job/2',
      'X'
    );
    assert.deepEqual(payload.requirements, []);
  });

  it('preserves prior JSON-LD behavior (title/company/location/workplace)', () => {
    const payload = jsonLdToJobPayload(
      buildLdJobPosting({ jobLocationType: 'TELECOMMUTE' }),
      'https://x.example/job/3',
      'X'
    );
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Pvt Ltd');
    assert.equal(payload.location, 'Bengaluru, Karnataka, IN');
    assert.equal(payload.workplace, 'REMOTE');
  });

  it('extractJobPostingJsonLd finds JobPosting inside @graph wrappers', () => {
    const doc = createMockDocument({
      scripts: [
        JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [{ '@type': 'WebSite', name: 'Board' }, buildLdJobPosting()],
        }),
      ],
    });
    const found = extractJobPostingJsonLd(doc);
    assert.ok(found, 'JobPosting must be found in @graph');
    assert.equal(found.title, 'Senior Backend Engineer');
  });
});

// ============================================================================
// Naukri adapter
// ============================================================================

describe('P16-001F-5: NaukriAdapter', () => {
  const URL = 'https://www.naukri.com/job-listings-senior-backend-engineer-datakart-private-limited-bengaluru-101224000001';

  it('handles naukri.com URLs', () => {
    assert.ok(NaukriAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts from __NEXT_DATA__ hydration state', () => {
    const nextData = {
      props: {
        pageProps: {
          jobDetails: {
            title: 'Senior Backend Engineer',
            companyName: 'DataKart Private Limited',
            jobDescription:
              '<ul><li>Build payment APIs with Node.js</li><li>Own UPI integration</li></ul>',
            location: 'Bengaluru / Bangalore',
            salary: '18-25 LPA',
          },
        },
      },
    };
    const doc = createMockDocument({
      elements: { '#__NEXT_DATA__': { textContent: JSON.stringify(nextData) } },
      bodyText: 'job page',
    });
    Object.defineProperty(doc, 'querySelector', {
      value: function (selector) {
        if (selector === '#__NEXT_DATA__') {
          return { textContent: JSON.stringify(nextData) };
        }
        return null;
      },
    });

    const payload = NaukriAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'NAUKRI');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Private Limited');
    assert.equal(payload.location, 'Bengaluru / Bangalore');
    assert.ok(payload.description.includes('Build payment APIs'));
    assert.equal(payload.workplace, 'ON_SITE');
  });

  it('falls back to og:title decomposition ("<Role> - <Company> - <Years> - <Location>")', () => {
    const doc = createMockDocument({
      meta: {
        'og:title': 'Senior Backend Engineer - DataKart Private Limited - 5-8 yrs - Bengaluru',
        'og:description': 'Build payment infrastructure for a fintech scale-up.',
      },
      elements: {
        '.job-desc': {
          textContent: 'Build payment APIs. UPI integration. 5+ years experience required.',
          querySelectorAll: () => [
            { textContent: '5+ years building backend services in Node.js' },
            { textContent: 'UPI or payment gateway integration experience' },
          ],
        },
      },
    });
    const payload = NaukriAdapter.extract(doc, URL);
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Private Limited');
    assert.equal(payload.location, 'Bengaluru');
    assert.equal(payload.requirements.length, 2);
    assert.equal(payload.provider, 'NAUKRI');
  });
});

// ============================================================================
// iimjobs adapter
// ============================================================================

describe('P16-001F-5: IimjobsAdapter', () => {
  const URL = 'https://www.iimjobs.com/job/senior-product-manager-fintech-bengaluru-1234567';

  it('handles iimjobs.com URLs', () => {
    assert.ok(IimjobsAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts via JSON-LD with requirements from description HTML', () => {
    const doc = createMockDocument({
      scripts: [JSON.stringify(buildLdJobPosting())],
    });
    const payload = IimjobsAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'IIMJOBS');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Pvt Ltd');
    assert.equal(payload.requirements.length, 3);
  });
});

// ============================================================================
// Shine adapter
// ============================================================================

describe('P16-001F-5: ShineAdapter', () => {
  const URL = 'https://www.shine.com/job/senior-backend-engineer/datakart/1234567';

  it('handles shine.com URLs', () => {
    assert.ok(ShineAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts via JSON-LD when present', () => {
    const doc = createMockDocument({ scripts: [JSON.stringify(buildLdJobPosting())] });
    const payload = ShineAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'SHINE');
    assert.equal(payload.title, 'Senior Backend Engineer');
  });

  it('extracts via DOM fallback when JSON-LD absent', () => {
    const desc = {
      textContent: 'Own the payments ledger. 5+ years experience required.',
      querySelectorAll: () => [{ textContent: '5+ years of backend engineering experience' }],
    };
    const doc = createMockDocument({
      elements: {
        '.job-title-title': { textContent: 'Senior Backend Engineer' },
        '.job-company-name': { textContent: 'DataKart' },
        '#job-description': desc,
      },
    });
    const payload = ShineAdapter.extract(doc, URL);
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart');
    assert.equal(payload.requirements.length, 1);
  });
});

// ============================================================================
// Foundit adapter
// ============================================================================

describe('P16-001F-5: FounditAdapter', () => {
  const URL = 'https://www.foundit.in/job/senior-backend-engineer-datakart-bengaluru';

  it('handles foundit.in URLs', () => {
    assert.ok(FounditAdapter.canHandle(createMockDocument(), URL));
  });

  it('decomposes og:title "hiring" convention from server-rendered pages', () => {
    const doc = createMockDocument({
      meta: {
        'og:title': 'Senior Backend Engineer hiring DataKart Private Limited - Bengaluru',
      },
      elements: {
        '#jobDescription': {
          textContent: 'Build payment APIs. UPI integration experience required.',
          querySelectorAll: () => [{ textContent: '5+ years backend experience with Node.js' }],
        },
      },
    });
    const payload = FounditAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'FOUNDIT');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Private Limited');
    assert.equal(payload.location, 'Bengaluru');
    assert.equal(payload.requirements.length, 1);
  });
});

// ============================================================================
// TimesJobs adapter
// ============================================================================

describe('P16-001F-5: TimesJobsAdapter', () => {
  const URL = 'https://www.timesjobs.com/jobdetail/senior-backend-engineer-datakart-bengaluru-123456789';

  it('handles timesjobs.com URLs', () => {
    assert.ok(TimesJobsAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts title/company/description/requirements from DOM', () => {
    const desc = {
      textContent: 'Own the payments ledger and settlement pipelines.',
      querySelectorAll: () => [
        { textContent: '5+ years of backend engineering experience' },
        { textContent: 'Strong Node.js and PostgreSQL skills' },
      ],
    };
    const doc = createMockDocument({
      elements: {
        '.job-title': { textContent: 'Senior Backend Engineer' },
        '.company-name': { textContent: 'DataKart Pvt Ltd' },
        '#jobDescription': desc,
      },
    });
    const payload = TimesJobsAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'TIMESJOBS');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart Pvt Ltd');
    assert.equal(payload.requirements.length, 2);
  });
});

// ============================================================================
// Hirect / Cutshort / Instahyre adapters
// ============================================================================

describe('P16-001F-5: HirectAdapter', () => {
  it('handles hirect.in URLs', () => {
    const URL = 'https://www.hirect.in/job-detail/67f42e3f9c8b5e2a1d4f7b8c';
    assert.ok(HirectAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts via JSON-LD when present', () => {
    const URL = 'https://www.hirect.in/job-detail/67f42e3f9c8b5e2a1d4f7b8c';
    const doc = createMockDocument({ scripts: [JSON.stringify(buildLdJobPosting())] });
    const payload = HirectAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'HIRECT');
    assert.equal(payload.title, 'Senior Backend Engineer');
  });

  it('falls back to OG meta + DOM', () => {
    const URL = 'https://www.hirect.in/job-detail/abc123';
    const doc = createMockDocument({
      meta: { 'og:title': 'Growth Product Manager', 'og:site_name': 'Hirect' },
      elements: {
        h1: { textContent: 'Growth Product Manager' },
        '[class*="company-name"]': { textContent: 'Finlyft Technologies' },
        '[class*="job-description"]': {
          textContent: 'Own the B2B growth funnel for a seed-stage startup.',
          querySelectorAll: () => [{ textContent: '3+ years of product management experience' }],
        },
      },
    });
    const payload = HirectAdapter.extract(doc, URL);
    assert.equal(payload.title, 'Growth Product Manager');
    assert.equal(payload.company, 'Finlyft Technologies');
  });
});

describe('P16-001F-5: CutshortAdapter', () => {
  const URL = 'https://cutshort.io/jobs/senior-backend-engineer-bengaluru';

  it('handles cutshort.io URLs', () => {
    assert.ok(CutshortAdapter.canHandle(createMockDocument(), URL));
  });

  it('extracts from __NEXT_DATA__ hydration with skills as requirements', () => {
    const nextData = {
      props: {
        pageProps: {
          job: {
            title: 'Senior Backend Engineer',
            company: { name: 'Razorpay-ish Startup' },
            description: '<p>Build payment infrastructure.</p>',
            skills: ['Node.js', 'PostgreSQL', 'Redis'],
            location: 'Bengaluru',
          },
        },
      },
    };
    const doc = createMockDocument({
      elements: { '#__NEXT_DATA__': { textContent: JSON.stringify(nextData) } },
    });
    const payload = CutshortAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'CUTSHORT');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'Razorpay-ish Startup');
    assert.deepEqual(payload.requirements, ['Node.js', 'PostgreSQL', 'Redis']);
  });
});

describe('P16-001F-5: InstahyreAdapter', () => {
  const URL = 'https://www.instahyre.com/senior-backend-engineer-jobs';

  it('handles instahyre.com URLs', () => {
    assert.ok(InstahyreAdapter.canHandle(createMockDocument(), URL));
  });

  it('decomposes og:title "<Role> - <Company>" convention', () => {
    const doc = createMockDocument({
      meta: { 'og:title': 'Senior Backend Engineer - DataKart', 'og:description': 'Payments infra role.' },
      elements: {
        '[class*="job-description"]': {
          textContent: 'Build high-throughput payment APIs.',
          querySelectorAll: () => [{ textContent: '4+ years building distributed systems' }],
        },
      },
    });
    const payload = InstahyreAdapter.extract(doc, URL);
    assert.equal(payload.provider, 'INSTAHYRE');
    assert.equal(payload.title, 'Senior Backend Engineer');
    assert.equal(payload.company, 'DataKart');
    assert.equal(payload.requirements.length, 1);
  });
});

// ============================================================================
// Detector registration & confidence gating
// ============================================================================

describe('P16-001F-5: JobPageDetector registration', () => {
  it('registers all new Indian providers ahead of the generic adapter', () => {
    const providers = JobPageDetector.adapters.map((a) => a.provider);
    for (const p of ['NAUKRI', 'IIMJOBS', 'SHINE', 'FOUNDIT', 'TIMESJOBS', 'HIRECT', 'CUTSHORT', 'INSTAHYRE']) {
      assert.ok(providers.includes(p), `${p} must be registered`);
    }
    assert.ok(
      providers.indexOf('NAUKRI') < providers.indexOf('GENERIC'),
      'Indian adapters must precede the generic fallback'
    );
  });

  it('treats Indian providers as structured (no extra job-signal gate)', () => {
    // A Naukri URL with a plausible payload must be confident without needing
    // the generic adapter's job-signal heuristics.
    const doc = createMockDocument({
      meta: { 'og:title': 'Senior Backend Engineer - DataKart Private Limited - 5-8 yrs - Bengaluru' },
      elements: {
        '.job-desc': {
          textContent: 'Build payment APIs with 5+ years of experience. Responsibilities include UPI integration and settlement reconciliation.',
          querySelectorAll: () => [],
        },
      },
    });
    const payload = JobPageDetector.detect(
      doc,
      'https://www.naukri.com/job-listings-senior-backend-engineer-datakart-101224000001'
    );
    assert.equal(payload.provider, 'NAUKRI');
    assert.equal(payload.isConfident, true);
  });
});

// ============================================================================
// Tab selector priorities
// ============================================================================

describe('P16-001F-5: job tab selector', () => {
  it('prioritizes Indian job boards over arbitrary tabs', () => {
    const tabs = [
      { id: 1, url: 'https://mail.google.com/mail/u/0' },
      { id: 2, url: 'https://www.naukri.com/job-listings-senior-engineer-101224000001' },
      { id: 3, url: 'https://github.com/vishu1803/Product-Data-Explorer' },
    ];
    const selected = selectJobTab(tabs);
    assert.equal(selected.id, 2);
    assert.equal(selected.matchedPattern, 'naukri.com');
  });

  it('keeps global ATS priority ahead of Indian boards (first-listed wins)', () => {
    const tabs = [
      { id: 1, url: 'https://www.naukri.com/job-listings-x-1' },
      { id: 2, url: 'https://boards.greenhouse.io/acme/jobs/42' },
    ];
    const selected = selectJobTab(tabs);
    assert.equal(selected.id, 2, 'Greenhouse (listed first) should win');
    assert.ok(ATS_HOST_PATTERNS.indexOf('boards.greenhouse.io') < ATS_HOST_PATTERNS.indexOf('naukri.com'));
  });

  it('covers all Indian boards in ATS_HOST_PATTERNS', () => {
    for (const pattern of ['naukri.com', 'shine.com', 'foundit.in', 'iimjobs.com', 'timesjobs.com', 'hirect.in', 'cutshort.io', 'instahyre.com']) {
      assert.ok(ATS_HOST_PATTERNS.includes(pattern), `${pattern} must be in ATS_HOST_PATTERNS`);
    }
  });
});
