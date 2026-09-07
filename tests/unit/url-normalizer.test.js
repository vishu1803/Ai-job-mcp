/**
 * @file Unit Tests for Job URL Normalizer & Canonical Job ID Derivation (P14-028).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJobUrl, deriveCanonicalJobId } from '../../src/utils/url-normalizer.js';
import { evaluateJobSuitability, rankSuitableJobs } from '../../src/services/job-selection-policy.js';

describe('Job URL Normalizer & Canonical Job ID Derivation', () => {
  it('normalizes greenhouse job URLs by standardizing host and removing tracking params', () => {
    const url1 = 'https://boards.greenhouse.io/vercel/jobs/123456?gh_jid=123456&utm_source=linkedin#app';
    const normalized1 = normalizeJobUrl(url1);
    assert.strictEqual(normalized1, 'https://boards.greenhouse.io/vercel/jobs/123456');

    const url2 = 'https://job-boards.greenhouse.io/vercel/jobs/123456/';
    const normalized2 = normalizeJobUrl(url2);
    assert.strictEqual(normalized2, 'https://boards.greenhouse.io/vercel/jobs/123456');

    // Both URLs point to the same canonical posting
    assert.strictEqual(normalized1, normalized2);
  });

  it('normalizes lever job URLs stripping tracking query parameters', () => {
    const url = 'https://jobs.lever.co/stripe/a1b2c3d4-e5f6?lever-source=Indeed&tracking_id=987';
    const normalized = normalizeJobUrl(url);
    assert.strictEqual(normalized, 'https://jobs.lever.co/stripe/a1b2c3d4-e5f6');
  });

  it('preserves significant query params for generic job boards while stripping tracking', () => {
    const url = 'https://careers.example.com/posting?dept=engineering&utm_medium=email';
    const normalized = normalizeJobUrl(url);
    assert.strictEqual(normalized, 'https://careers.example.com/posting?dept=engineering');
  });

  it('derives canonical job ID from explicit canonicalJobId, jobId, or standard URLs', () => {
    assert.strictEqual(
      deriveCanonicalJobId({ canonicalJobId: 'canon-123' }),
      'canon-123'
    );

    assert.strictEqual(
      deriveCanonicalJobId({ jobId: 'gh-456' }),
      'gh-456'
    );

    const greenhouseId = deriveCanonicalJobId({
      directPortalUrl: 'https://boards.greenhouse.io/vercel/jobs/789012?utm_source=test',
    });
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(greenhouseId));

    const leverId = deriveCanonicalJobId({
      applicationUrl: 'https://jobs.lever.co/stripe/uuid-lever-role-123',
    });
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leverId));
  });

  it('returns null for empty or invalid inputs', () => {
    assert.strictEqual(normalizeJobUrl(null), null);
    assert.strictEqual(normalizeJobUrl(''), null);
    assert.strictEqual(deriveCanonicalJobId({}), null);
  });
});

describe('Job Selection Policy (6 Dimensions & NO_SUITABLE_JOB Gating)', () => {
  const candidatePreferences = {
    desiredRole: 'Software Engineer',
    preferredLocations: ['Remote', 'San Francisco, CA'],
    remoteOnly: true,
    minSalary: 140000,
  };

  it('evaluates individual job suitability using evaluateJobSuitability', () => {
    const singleJob = {
      id: 'job-single',
      title: 'Senior Software Engineer',
      company: 'Vercel',
      location: 'Remote',
      salary: { min: 160000, max: 200000 },
      fitScore: 88,
    };
    const evaluation = evaluateJobSuitability(singleJob, candidatePreferences);
    assert.strictEqual(evaluation.isSuitable, true);
    assert.ok(evaluation.rankingScore > 0);
  });

  it('evaluates and ranks multiple jobs according to the 6 dimensions', () => {
    const jobs = [
      {
        id: 'job-1',
        title: 'Senior Software Engineer',
        company: 'Vercel',
        location: 'Remote',
        salary: { min: 160000, max: 200000 },
        fitScore: 88,
        domain: 'Cloud Infrastructure',
        seniority: 'SENIOR',
        postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'job-2',
        title: 'Staff Software Engineer',
        company: 'Acme',
        location: 'San Francisco, CA',
        salary: { min: 180000, max: 220000 },
        fitScore: 75,
        domain: 'Payments',
        seniority: 'STAFF',
        postedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
    ];

    const result = rankSuitableJobs(jobs, candidatePreferences);
    assert.strictEqual(result.hasSuitableJob, true);
    assert.strictEqual(result.suitableJobs.length, 2);
    assert.strictEqual(result.topJob.id, 'job-1');
  });

  it('returns NO_SUITABLE_JOB when fit score is severely substandard (e.g. 24.9%)', () => {
    const lowFitJobs = [
      {
        id: 'bad-job-1',
        title: 'Lead Data Scientist',
        company: 'BioTech Corp',
        location: 'Remote',
        fitScore: 24.9,
      },
    ];

    const result = rankSuitableJobs(lowFitJobs, candidatePreferences);
    assert.strictEqual(result.hasSuitableJob, false);
    assert.strictEqual(result.policyCode, 'NO_SUITABLE_JOB');
    assert.strictEqual(result.topJob, null);
    assert.ok(result.reason.includes('None of the 1 evaluated job postings met the minimum criteria'));
  });

  it('returns NO_SUITABLE_JOB when location violates hard preferences', () => {
    const onSiteJobs = [
      {
        id: 'onsite-job',
        title: 'Senior Software Engineer',
        company: 'Bank Corp',
        location: 'Frankfurt, Germany (On-site required 5 days/week)',
        fitScore: 85,
      },
    ];

    const result = rankSuitableJobs(onSiteJobs, candidatePreferences);
    assert.strictEqual(result.hasSuitableJob, false);
    assert.strictEqual(result.policyCode, 'NO_SUITABLE_JOB');
  });
});
