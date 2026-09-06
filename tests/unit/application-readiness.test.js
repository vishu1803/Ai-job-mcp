/**
 * @file Unit Tests: Application Readiness Service (Issue 1)
 *
 * Verifies:
 * 1. Canonical evaluation of all 8 screening fields from database profile records.
 * 2. Link discrimination: project repository URLs (e.g. https://github.com/vishu1803/repo)
 *    never satisfy the candidate profile-level GitHub link.
 * 3. Semantic separation: Document Readiness (READY/BLOCKED) is strictly separated from
 *    Screening Profile Completeness (COMPLETE/INCOMPLETE).
 * 4. Deep profile anchor links for incomplete fields.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationReadinessService } from '../../src/services/application-readiness.service.js';

describe('ApplicationReadinessService', () => {
  const service = new ApplicationReadinessService();

  const realCandidateProfile = {
    displayName: 'Vishwanath Nishad',
    canonicalEmail: 'vishwanatnishad@gmail.com',
    profileMetadata: {
      userCustom: {
        phone: '+91-9876543210',
        portfolioLinks: [
          { platform: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad' },
          { platform: 'GitHub', url: 'https://github.com/vishu1803' },
          { platform: 'Portfolio', url: 'https://vishwanath.dev' },
        ],
      },
      careerPreferences: {
        workAuthorization: ['Authorized to work in India', 'US Remote (B1/B2/Visitor)'],
        visaSponsorshipRequired: false,
        availabilityDate: '2026-10-01',
      },
    },
    identities: [{ provider: 'GITHUB_APP', externalUsername: 'vishu1803' }],
  };

  it('1. evaluates all 8 screening fields from authoritative profile paths', () => {
    const { items, semantics } = service.evaluateReadiness({
      candidateProfile: realCandidateProfile,
      jobPosting: { company: 'Vercel', title: 'Backend Engineer' },
    });

    assert.equal(items.length, 8);

    // Email
    const email = items.find((i) => i.field === 'email');
    assert.equal(email.status, 'READY');
    assert.equal(email.value, 'vishwanatnishad@gmail.com');
    assert.equal(email.profileAnchor, '/profile#section-contact');

    // Phone
    const phone = items.find((i) => i.field === 'phone');
    assert.equal(phone.status, 'READY');
    assert.equal(phone.value, '+91-9876543210');
    assert.equal(phone.profileAnchor, '/profile#section-contact');

    // Work Auth
    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.status, 'NEEDS_CONFIRMATION');
    assert.ok(workAuth.value.includes('Authorized to work in India'));
    assert.equal(workAuth.profileAnchor, '/profile#section-readiness');

    // Visa Sponsorship
    const visa = items.find((i) => i.field === 'visaSponsorship');
    assert.equal(visa.status, 'NEEDS_CONFIRMATION');
    assert.equal(visa.value, 'No Sponsorship Needed');
    assert.equal(visa.profileAnchor, '/profile#section-readiness');

    // LinkedIn
    const linkedin = items.find((i) => i.field === 'linkedin');
    assert.equal(linkedin.status, 'READY');
    assert.equal(linkedin.value, 'https://linkedin.com/in/vishwanath-nishad');
    assert.equal(linkedin.profileAnchor, '/profile#section-links');

    // GitHub Profile
    const github = items.find((i) => i.field === 'github');
    assert.equal(github.status, 'READY');
    assert.equal(github.value, 'https://github.com/vishu1803');
    assert.equal(github.profileAnchor, '/profile#section-links');

    // Portfolio
    const portfolio = items.find((i) => i.field === 'portfolio');
    assert.equal(portfolio.status, 'READY');
    assert.equal(portfolio.value, 'https://vishwanath.dev');
    assert.equal(portfolio.profileAnchor, '/profile#section-links');

    // Availability
    const avail = items.find((i) => i.field === 'availability');
    assert.equal(avail.status, 'READY');
    assert.equal(avail.value, '2026-10-01');
    assert.equal(avail.profileAnchor, '/profile#section-preferences');

    // Semantics
    assert.equal(semantics.profileComplete, true);
    assert.equal(semantics.missingProfileFields.length, 0);
    assert.equal(semantics.needsConfirmationFields.length, 2);
  });

  it('2. strictly discriminates project repos from candidate profile GitHub URL', () => {
    const profileWithOnlyProjectRepo = {
      displayName: 'Test Candidate',
      canonicalEmail: 'test@example.org',
      profileMetadata: {
        userCustom: {
          portfolioLinks: [
            // Project repository link - NOT profile link!
            { platform: 'GitHub', url: 'https://github.com/vishu1803/Collaborative-task-manager' },
          ],
        },
      },
      identities: [],
    };

    const { items } = service.evaluateReadiness({
      candidateProfile: profileWithOnlyProjectRepo,
    });

    const github = items.find((i) => i.field === 'github');
    // A project repo URL MUST NOT satisfy the candidate profile-level GitHub field
    assert.equal(github.status, 'MISSING');
    assert.equal(github.value, null);
    assert.ok(github.notes.includes('not linked'));
  });

  it('3. marks missing fields truthfully and includes profile section anchors', () => {
    const emptyProfile = {
      displayName: 'Bare Candidate',
      canonicalEmail: 'bare@example.org',
      profileMetadata: {},
      identities: [],
    };

    const { items, semantics } = service.evaluateReadiness({
      candidateProfile: emptyProfile,
    });

    assert.equal(semantics.profileComplete, false);
    assert.ok(semantics.missingProfileFields.includes('phone'));
    assert.ok(semantics.missingProfileFields.includes('workAuthorization'));
    assert.ok(semantics.missingProfileFields.includes('visaSponsorship'));
    assert.ok(semantics.missingProfileFields.includes('linkedin'));
    assert.ok(semantics.missingProfileFields.includes('github'));

    const phone = items.find((i) => i.field === 'phone');
    assert.equal(phone.status, 'MISSING');
    assert.equal(phone.profileAnchor, '/profile#section-contact');
  });

  it('4. accepts explicit screening question answers overriding profile preferences', () => {
    const profileWithPreferences = {
      displayName: 'Candidate',
      canonicalEmail: 'candidate@example.org',
      profileMetadata: {
        careerPreferences: {
          visaSponsorshipRequired: true,
        },
      },
      identities: [],
    };

    const explicitAnswers = {
      visaSponsorship: 'No sponsorship needed for this role',
      workAuthorization: 'Authorized via CPT/OPT',
    };

    const { items } = service.evaluateReadiness({
      candidateProfile: profileWithPreferences,
      answers: explicitAnswers,
    });

    const visa = items.find((i) => i.field === 'visaSponsorship');
    assert.equal(visa.value, 'No sponsorship needed for this role');

    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.value, 'Authorized via CPT/OPT');
  });
});
