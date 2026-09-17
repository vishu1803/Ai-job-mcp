/**
 * @file P80 Unit Tests: Final Identity Primitive Hardening.
 *
 * Validates:
 * 1. CanonicalJobIdentity.isValid() authoritative anchors:
 *    - ChatGPT title + URL => invalid canonical identity
 *    - Arbitrary article title + URL => invalid canonical identity
 *    - Provider + externalJobId => valid
 *    - CanonicalJobId => valid
 *    - Provider + normalizedUrl => valid
 *    - Title + company + URL => valid
 * 2. isSameJobIdentity() unknown fingerprint comparison:
 *    - UNKNOWN_FINGERPRINT constant exported and equals 64 zeroes
 *    - deriveJobFingerprint returns UNKNOWN_FINGERPRINT for unknown-job
 *    - isSameJobIdentity never considers two unknown fingerprints equal (unknown fingerprint != unknown fingerprint)
 * 3. Portal identity comparison:
 *    - Valid LinkedIn identity comparison
 *    - Valid Greenhouse identity comparison
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CanonicalJobIdentity,
  JobIdentityAuthority,
  UNKNOWN_FINGERPRINT,
  isSameJobIdentity,
  deriveJobFingerprint,
  JobIdentity,
} from '../../extension/lib/job-identity.js';

describe('P80: Final Identity Primitive Hardening', () => {
  describe('1. CanonicalJobIdentity.isValid() Authoritative Anchors', () => {
    it('ChatGPT title + URL => invalid canonical identity', () => {
      const chatGptIdentity = new CanonicalJobIdentity({
        title: 'ChatGPT',
        url: 'https://chatgpt.com/',
        sourceUrl: 'https://chatgpt.com/',
      });
      assert.strictEqual(
        chatGptIdentity.isValid(),
        false,
        'ChatGPT title + URL alone must not be considered a valid canonical job identity'
      );
    });

    it('arbitrary article title + URL => invalid canonical identity', () => {
      const articleIdentity = new CanonicalJobIdentity({
        title: 'Understanding Distributed Consensus in 2026',
        url: 'https://techblog.example.com/posts/distributed-consensus',
        sourceUrl: 'https://techblog.example.com/posts/distributed-consensus',
      });
      assert.strictEqual(
        articleIdentity.isValid(),
        false,
        'Arbitrary article title + URL without company or provider must be invalid'
      );
    });

    it('provider + externalJobId => valid', () => {
      const providerExternalId = new CanonicalJobIdentity({
        title: 'Senior Systems Engineer',
        provider: 'LINKEDIN',
        externalJobId: '4466834190',
      });
      assert.strictEqual(
        providerExternalId.isValid(),
        true,
        'Provider + externalJobId must satisfy authoritative anchor'
      );
    });

    it('canonicalJobId => valid', () => {
      const canonicalId = new CanonicalJobIdentity({
        title: 'Principal Cloud Architect',
        canonicalJobId: 'canon-job-8899',
      });
      assert.strictEqual(
        canonicalId.isValid(),
        true,
        'canonicalJobId must satisfy authoritative anchor'
      );
    });

    it('provider + normalizedUrl => valid', () => {
      const providerUrl = new CanonicalJobIdentity({
        title: 'Infrastructure Platform Lead',
        provider: 'GREENHOUSE',
        url: 'https://boards.greenhouse.io/cloudflare/jobs/8102350',
      });
      assert.strictEqual(
        providerUrl.isValid(),
        true,
        'Provider + normalizedUrl must satisfy authoritative anchor'
      );
    });

    it('title + company + URL => valid', () => {
      const titleCompanyUrl = new CanonicalJobIdentity({
        title: 'Full Stack Engineer',
        company: 'Jobgether',
        url: 'https://www.linkedin.com/jobs/view/4466834190/',
      });
      assert.strictEqual(
        titleCompanyUrl.isValid(),
        true,
        'Validated title + company + URL must satisfy authoritative anchor'
      );
    });

    it('generic company placeholder ("Company") does not satisfy validated company anchor', () => {
      const genericCompany = new CanonicalJobIdentity({
        title: 'Frontend Developer',
        company: 'Company',
        url: 'https://generic.org/jobs/123',
      });
      assert.strictEqual(
        genericCompany.isValid(),
        false,
        'Generic placeholder "Company" must not be treated as a validated company'
      );
    });

    it('untitled role is strictly invalid regardless of anchors', () => {
      const untitled = new CanonicalJobIdentity({
        title: 'Untitled Role',
        company: 'Acme',
        url: 'https://acme.com/jobs/1',
        provider: 'LEVER',
        externalJobId: '123',
      });
      assert.strictEqual(untitled.isValid(), false);
    });
  });

  describe('2. isSameJobIdentity() & UNKNOWN_FINGERPRINT Hardening', () => {
    it('UNKNOWN_FINGERPRINT is exported and contains exactly 64 zeroes', () => {
      assert.strictEqual(typeof UNKNOWN_FINGERPRINT, 'string');
      assert.strictEqual(UNKNOWN_FINGERPRINT.length, 64);
      assert.strictEqual(UNKNOWN_FINGERPRINT, '0'.repeat(64));
      assert.strictEqual(JobIdentity.UNKNOWN_FINGERPRINT, UNKNOWN_FINGERPRINT);
    });

    it('deriveJobFingerprint returns UNKNOWN_FINGERPRINT for unknown-job', () => {
      const fpEmpty = deriveJobFingerprint({});
      assert.strictEqual(fpEmpty, UNKNOWN_FINGERPRINT);

      const fpNull = deriveJobFingerprint(null);
      assert.strictEqual(fpNull, UNKNOWN_FINGERPRINT);

      const fpNoDetails = deriveJobFingerprint({ title: '', company: '', url: '' });
      assert.strictEqual(fpNoDetails, UNKNOWN_FINGERPRINT);
    });

    it('unknown fingerprint != unknown fingerprint (empty objects)', () => {
      const isSame = isSameJobIdentity({}, {});
      assert.strictEqual(
        isSame,
        false,
        'Two unknown jobs with empty fields must never be considered the same job identity'
      );
    });

    it('unknown fingerprint != unknown fingerprint (explicit UNKNOWN_FINGERPRINT)', () => {
      const jobA = { fingerprint: UNKNOWN_FINGERPRINT };
      const jobB = { fingerprint: UNKNOWN_FINGERPRINT };
      assert.strictEqual(
        isSameJobIdentity(jobA, jobB),
        false,
        'Two jobs with UNKNOWN_FINGERPRINT must never match on fingerprint'
      );
    });

    it('unknown fingerprint != unknown fingerprint (two CanonicalJobIdentity instances with no anchors)', () => {
      const idA = new CanonicalJobIdentity({});
      const idB = new CanonicalJobIdentity({});
      assert.strictEqual(idA.fingerprint, UNKNOWN_FINGERPRINT);
      assert.strictEqual(idB.fingerprint, UNKNOWN_FINGERPRINT);
      assert.strictEqual(
        idA.isSameAs(idB),
        false,
        'Two canonical identities with UNKNOWN_FINGERPRINT must not be equal'
      );
      assert.strictEqual(isSameJobIdentity(idA, idB), false);
    });
  });

  describe('3. Portal Identity Comparison Regressions', () => {
    it('valid LinkedIn identity comparison (same provider and externalJobId)', () => {
      const jobA = new CanonicalJobIdentity({
        provider: 'LINKEDIN',
        externalJobId: '4466834190',
        title: 'Full Stack Engineer',
        company: 'Jobgether',
        url: 'https://www.linkedin.com/jobs/view/4466834190/',
      });
      const jobB = new CanonicalJobIdentity({
        provider: 'LINKEDIN',
        externalJobId: '4466834190',
        title: 'Full Stack Engineer',
        company: 'Jobgether',
        url: 'https://www.linkedin.com/jobs/view/4466834190/?trackingId=xyz789&refId=feed',
      });

      assert.strictEqual(jobA.isValid(), true);
      assert.strictEqual(jobB.isValid(), true);
      assert.strictEqual(
        jobA.isSameAs(jobB),
        true,
        'Two LinkedIn postings for the same externalJobId must match identity'
      );
      assert.strictEqual(isSameJobIdentity(jobA, jobB), true);
    });

    it('valid LinkedIn identity comparison (different externalJobIds => false)', () => {
      const jobQuikHire = new CanonicalJobIdentity({
        provider: 'LINKEDIN',
        externalJobId: '4466448213',
        title: 'Backend Software Engineer (Remote)',
        company: 'Quik Hire Staffing',
        url: 'https://www.linkedin.com/jobs/view/4466448213/',
      });
      const jobAppinventiv = new CanonicalJobIdentity({
        provider: 'LINKEDIN',
        externalJobId: '4464770430',
        title: 'Software Engineer',
        company: 'Appinventiv',
        url: 'https://in.linkedin.com/jobs/view/software-engineer-at-appinventiv-4464770430',
      });

      assert.strictEqual(jobQuikHire.isValid(), true);
      assert.strictEqual(jobAppinventiv.isValid(), true);
      assert.strictEqual(
        jobQuikHire.isSameAs(jobAppinventiv),
        false,
        'Quik Hire and Appinventiv jobs must be distinct identities'
      );
      assert.strictEqual(isSameJobIdentity(jobQuikHire, jobAppinventiv), false);
    });

    it('valid Greenhouse identity comparison (same provider and externalJobId / clean URL)', () => {
      const ghJob1 = new CanonicalJobIdentity({
        provider: 'GREENHOUSE',
        externalJobId: '8102350',
        title: 'Systems Engineer',
        company: 'Cloudflare',
        url: 'https://boards.greenhouse.io/cloudflare/jobs/8102350',
      });
      const ghJob2 = new CanonicalJobIdentity({
        provider: 'GREENHOUSE',
        externalJobId: '8102350',
        title: 'Systems Engineer',
        company: 'Cloudflare',
        url: 'https://boards.greenhouse.io/cloudflare/jobs/8102350?gh_jid=8102350&source=linkedin',
      });

      assert.strictEqual(ghJob1.isValid(), true);
      assert.strictEqual(ghJob2.isValid(), true);
      assert.strictEqual(
        ghJob1.isSameAs(ghJob2),
        true,
        'Greenhouse jobs with same external ID and tracking query must be identical'
      );
      assert.strictEqual(isSameJobIdentity(ghJob1, ghJob2), true);
    });

    it('valid Greenhouse identity comparison (distinct externalJobIds => false)', () => {
      const ghJob1 = new CanonicalJobIdentity({
        provider: 'GREENHOUSE',
        externalJobId: '8102350',
        title: 'Systems Engineer',
        company: 'Cloudflare',
        url: 'https://boards.greenhouse.io/cloudflare/jobs/8102350',
      });
      const ghJob2 = new CanonicalJobIdentity({
        provider: 'GREENHOUSE',
        externalJobId: '8102351',
        title: 'Product Security Engineer',
        company: 'Cloudflare',
        url: 'https://boards.greenhouse.io/cloudflare/jobs/8102351',
      });

      assert.strictEqual(
        ghJob1.isSameAs(ghJob2),
        false,
        'Greenhouse jobs with different external IDs must be distinct'
      );
      assert.strictEqual(isSameJobIdentity(ghJob1, ghJob2), false);
    });
  });
});
