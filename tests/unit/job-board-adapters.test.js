/**
 * @file Unit Test Suite for Job Board Adapters (Greenhouse & Lever).
 *
 * Verifies:
 * 1. Greenhouse adapter normalizes API responses correctly
 * 2. Lever adapter normalizes API responses correctly
 * 3. Both adapters handle network errors gracefully
 * 4. Both adapters handle timeouts gracefully
 * 5. Both adapters handle malformed responses gracefully
 * 6. Employment type mapping works correctly
 * 7. Workplace type inference works correctly
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { GreenhouseAdapter } from '../../src/services/job-board-adapters/greenhouse.adapter.js';
import { LeverAdapter } from '../../src/services/job-board-adapters/lever.adapter.js';

// ============================================================================
// Greenhouse Adapter Tests
// ============================================================================

describe('GreenhouseAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new GreenhouseAdapter({
      boardToken: 'testcompany',
      timeoutMs: 5000,
    });
  });

  it('has correct metadata', () => {
    const meta = adapter.getMeta();
    assert.equal(meta.provider, 'GREENHOUSE');
    assert.equal(meta.boardToken, 'testcompany');
    assert.ok(meta.baseUrl.includes('greenhouse.io'));
  });

  it('fetchJobs returns normalized jobs from valid API response', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        jobs: [
          {
            id: 12345,
            title: 'Senior Software Engineer',
            updated_at: '2026-08-20T10:00:00Z',
            location: { name: 'San Francisco, CA' },
            absolute_url: 'https://boards.greenhouse.io/testcompany/jobs/12345',
            content: '<p>We are looking for a <strong>Python</strong> and <strong>React</strong> engineer.</p><li>Build APIs</li><li>Write tests</li>',
            departments: [{ id: 1, name: 'Engineering' }],
            offices: [{ id: 1, name: 'SF Office', location: 'San Francisco, CA' }],
          },
        ],
        meta: { total: 1 },
      }),
    }));

    // Override global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();

      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].source, 'GREENHOUSE');
      assert.equal(jobs[0].company, 'Testcompany');
      assert.equal(jobs[0].title, 'Senior Software Engineer');
      assert.equal(jobs[0].location, 'San Francisco, CA');
      assert.ok(jobs[0].id.startsWith('gh-testcompany-'));
      assert.ok(jobs[0].skills.includes('Python'));
      assert.ok(jobs[0].skills.includes('React'));
      assert.ok(jobs[0].applicationUrl.includes('greenhouse.io'));
      assert.ok(jobs[0].retrievedAt);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on network error', async () => {
    const mockFetch = mock.fn(async () => {
      throw new Error('Network error');
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on non-OK status', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 404,
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on timeout', async () => {
    const mockFetch = mock.fn(async () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs handles empty jobs array', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ jobs: [], meta: { total: 0 } }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('infers workplace type from location', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        jobs: [
          { id: 1, title: 'Job 1', location: { name: 'Remote' }, content: '' },
          { id: 2, title: 'Job 2', location: { name: 'New York, NY' }, content: 'Hybrid work' },
          { id: 3, title: 'Job 3', location: { name: 'SF Office' }, content: '' },
        ],
        meta: { total: 3 },
      }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.equal(jobs[0].workplaceType, 'REMOTE');
      assert.equal(jobs[1].workplaceType, 'HYBRID');
      assert.equal(jobs[2].workplaceType, 'ONSITE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================================
// Lever Adapter Tests
// ============================================================================

describe('LeverAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new LeverAdapter({
      site: 'testcompany',
      timeoutMs: 5000,
    });
  });

  it('has correct metadata', () => {
    const meta = adapter.getMeta();
    assert.equal(meta.provider, 'LEVER');
    assert.equal(meta.site, 'testcompany');
    assert.ok(meta.baseUrl.includes('lever.co'));
  });

  it('fetchJobs returns normalized postings from valid API response', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: 'abc123',
          text: 'Full Stack Engineer',
          categories: {
            location: 'Remote',
            commitment: 'Full-time',
            team: 'Engineering',
            department: 'Product',
          },
          workplaceType: 'remote',
          descriptionPlain: 'We need a Node.js and React engineer with PostgreSQL experience.',
          hostedUrl: 'https://jobs.lever.co/testcompany/abc123',
          applyUrl: 'https://jobs.lever.co/testcompany/abc123/apply',
          createdAt: 1724000000000,
          salaryRange: { min: 120000, max: 160000, currency: 'USD', interval: 'yearly' },
          lists: [
            { text: 'Responsibilities', content: '<li>Build features</li><li>Write tests</li>' },
            { text: 'Requirements', content: '<li>3+ years experience</li>' },
          ],
        },
      ],
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();

      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].source, 'LEVER');
      assert.equal(jobs[0].company, 'Testcompany');
      assert.equal(jobs[0].title, 'Full Stack Engineer');
      assert.equal(jobs[0].location, 'Remote');
      assert.equal(jobs[0].workplaceType, 'REMOTE');
      assert.equal(jobs[0].employmentType, 'FULL_TIME');
      assert.ok(jobs[0].id.startsWith('lever-testcompany-'));
      assert.ok(jobs[0].skills.includes('Node.js'));
      assert.ok(jobs[0].skills.includes('React'));
      assert.ok(jobs[0].skills.includes('PostgreSQL'));
      assert.equal(jobs[0].salary.min, 120000);
      assert.equal(jobs[0].salary.max, 160000);
      assert.ok(jobs[0].applicationUrl.includes('lever.co'));
      assert.ok(jobs[0].retrievedAt);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on network error', async () => {
    const mockFetch = mock.fn(async () => {
      throw new Error('Connection refused');
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on non-OK status', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs returns empty array on timeout', async () => {
    const mockFetch = mock.fn(async () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fetchJobs handles non-array response', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ error: 'not found' }),
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.deepEqual(jobs, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps employment types correctly', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        { id: '1', text: 'Job 1', categories: { commitment: 'Intern' } },
        { id: '2', text: 'Job 2', categories: { commitment: 'Part-time' } },
        { id: '3', text: 'Job 3', categories: { commitment: 'Contract' } },
        { id: '4', text: 'Job 4', categories: { commitment: 'Full-time' } },
        { id: '5', text: 'Job 5', categories: {} },
      ],
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.equal(jobs[0].employmentType, 'INTERNSHIP');
      assert.equal(jobs[1].employmentType, 'PART_TIME');
      assert.equal(jobs[2].employmentType, 'CONTRACT');
      assert.equal(jobs[3].employmentType, 'FULL_TIME');
      assert.equal(jobs[4].employmentType, 'FULL_TIME');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps workplace types correctly', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        { id: '1', text: 'Job 1', workplaceType: 'remote' },
        { id: '2', text: 'Job 2', workplaceType: 'hybrid' },
        { id: '3', text: 'Job 3', workplaceType: 'on-site' },
        { id: '4', text: 'Job 4', workplaceType: 'unspecified' },
        { id: '5', text: 'Job 5' },
      ],
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.equal(jobs[0].workplaceType, 'REMOTE');
      assert.equal(jobs[1].workplaceType, 'HYBRID');
      assert.equal(jobs[2].workplaceType, 'ONSITE');
      assert.equal(jobs[3].workplaceType, 'ONSITE');
      assert.equal(jobs[4].workplaceType, 'ONSITE');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('extracts skills from description text', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: '1',
          text: 'Engineer',
          descriptionPlain:
            'Experience with Python, Django, PostgreSQL, Docker, Kubernetes, and AWS required.',
        },
      ],
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.ok(jobs[0].skills.includes('Python'));
      assert.ok(jobs[0].skills.includes('Django'));
      assert.ok(jobs[0].skills.includes('PostgreSQL'));
      assert.ok(jobs[0].skills.includes('Docker'));
      assert.ok(jobs[0].skills.includes('Kubernetes'));
      assert.ok(jobs[0].skills.includes('AWS'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('extracts list sections for responsibilities and requirements', async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: '1',
          text: 'Engineer',
          lists: [
            { text: 'Responsibilities', content: '<li>Build APIs</li><li>Write docs</li>' },
            { text: 'Requirements', content: '<li>5+ years experience</li><li>BS in CS</li>' },
            { text: 'Benefits', content: '<li>Health insurance</li>' },
          ],
        },
      ],
    }));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const jobs = await adapter.fetchJobs();
      assert.equal(jobs[0].responsibilities.length, 2);
      assert.ok(jobs[0].responsibilities[0].includes('Build APIs'));
      assert.equal(jobs[0].requirements.length, 2);
      assert.ok(jobs[0].requirements[0].includes('5+ years'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
