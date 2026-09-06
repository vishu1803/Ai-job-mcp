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
    assert.equal(visa.status, 'NEEDS_CONFIRMATION');
    assert.equal(visa.hasConflict, true);

    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.value, 'Authorized via CPT/OPT');
    assert.equal(workAuth.status, 'NEEDS_CONFIRMATION');
    assert.equal(workAuth.hasConflict, false);
  });

  it('5. flags conflicting phone numbers with NEEDS_CONFIRMATION and single resolved value', () => {
    const candidateWithPhone = {
      displayName: 'Vishwanath',
      canonicalEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {
        userCustom: { phone: '7905087928' },
      },
      identities: [],
    };

    // Conflicting phone in application answers
    const { items } = service.evaluateReadiness({
      candidateProfile: candidateWithPhone,
      answers: { phone: '+91 9876543210' },
    });

    const phone = items.find((i) => i.field === 'phone');
    assert.equal(phone.value, '+91 9876543210');
    assert.equal(phone.status, 'NEEDS_CONFIRMATION');
    assert.equal(phone.hasConflict, true);
    assert.equal(phone.source, 'APPLICATION_ANSWERS');
    assert.ok(phone.notes.includes('Conflict detected'));
    assert.ok(phone.notes.includes('7905087928'));
  });

  it('6. flags conflicting visa sponsorship with NEEDS_CONFIRMATION and single resolved value', () => {
    const candidateWithSponsorship = {
      displayName: 'Vishwanath',
      canonicalEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {
        careerPreferences: { visaSponsorshipRequired: true },
      },
      identities: [],
    };

    // Conflicting answer: user says "No sponsorship needed"
    const { items } = service.evaluateReadiness({
      candidateProfile: candidateWithSponsorship,
      answers: { visaSponsorship: 'No sponsorship needed' },
    });

    const visa = items.find((i) => i.field === 'visaSponsorship');
    assert.equal(visa.value, 'No sponsorship needed');
    assert.equal(visa.status, 'NEEDS_CONFIRMATION');
    assert.equal(visa.hasConflict, true);
    assert.equal(visa.source, 'APPLICATION_ANSWERS');
    assert.ok(visa.notes.includes('Conflict detected'));
    assert.ok(visa.notes.includes('Sponsorship Required'));
  });

  it('7. flags conflicting earliest start dates with NEEDS_CONFIRMATION and single resolved value', () => {
    const candidateWithAvailability = {
      displayName: 'Vishwanath',
      canonicalEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {
        careerPreferences: { availabilityDate: '2026-10-01' },
      },
      identities: [],
    };

    // Conflicting answer: "Immediate (within 2 weeks)"
    const { items } = service.evaluateReadiness({
      candidateProfile: candidateWithAvailability,
      answers: { availability: 'Immediate (within 2 weeks)' },
    });

    const avail = items.find((i) => i.field === 'availability');
    assert.equal(avail.value, 'Immediate (within 2 weeks)');
    assert.equal(avail.status, 'NEEDS_CONFIRMATION');
    assert.equal(avail.hasConflict, true);
    assert.equal(avail.source, 'APPLICATION_ANSWERS');
    assert.ok(avail.notes.includes('Conflict detected'));
    assert.ok(avail.notes.includes('2026-10-01'));
  });

  it('8. flags conflicting work authorization jurisdictions with NEEDS_CONFIRMATION', () => {
    const candidateWithWorkAuth = {
      displayName: 'Vishwanath',
      canonicalEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {
        careerPreferences: { workAuthorization: ['Authorize to work in India'] },
      },
      identities: [],
    };

    // Conflicting answer: "US Citizen / Green Card"
    const { items } = service.evaluateReadiness({
      candidateProfile: candidateWithWorkAuth,
      answers: { workAuthorization: 'US Citizen / Green Card' },
    });

    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.value, 'US Citizen / Green Card');
    assert.equal(workAuth.status, 'NEEDS_CONFIRMATION');
    assert.equal(workAuth.hasConflict, true);
    assert.equal(workAuth.source, 'APPLICATION_ANSWERS');
    assert.ok(workAuth.notes.includes('Conflict detected'));
    assert.ok(workAuth.notes.includes('Authorize to work in India'));
  });

  it('9. resolves authentic stored candidate profile to deterministic single values with explicit sources and zero "A / B" alternatives', () => {
    // Exact schema of Vishwanath Nishad's canonical stored DB profile
    const storedVishwanathProfile = {
      displayName: 'Vishwanath Nishad',
      canonicalEmail: 'vishwanatnishad@gmail.com',
      profileMetadata: {
        userCustom: {
          phone: '7905087928',
          portfolioLinks: [
            { url: 'https://leetcode.com/u/vishwanatnishad', label: 'LEETCODE' },
            { url: 'https://linkedin.com/in/vishwanath-nishad', label: 'LINKEDIN' },
            { url: 'https://github.com/vishu1803', label: 'GITHUB' },
            { url: 'https://my-portfolio-kappa-beige-71.vercel.app/', label: 'PORTFOLIO' },
          ],
        },
        careerPreferences: {
          workAuthorization: ['Authorize to work in India'],
          visaSponsorshipRequired: true,
          availabilityDate: '2026-10-01',
        },
      },
      identities: [
        {
          provider: 'GITHUB_APP',
          externalUsername: 'vishu1803',
          verified: true,
        },
      ],
    };

    const { items } = service.evaluateReadiness({
      candidateProfile: storedVishwanathProfile,
      answers: {},
    });

    for (const item of items) {
      assert.ok(item.value !== undefined, `Field ${item.field} must have a defined value`);
      if (item.value !== null) {
        assert.ok(
          !item.value.includes(' / ') && !item.value.includes(' OR '),
          `Field ${item.field} must resolve to exactly ONE value without alternatives: "${item.value}"`
        );
      }
      assert.ok(item.source, `Field ${item.field} must specify its resolution source`);
    }

    const email = items.find((i) => i.field === 'email');
    assert.equal(email.value, 'vishwanatnishad@gmail.com');
    assert.equal(email.source, 'PROFILE_CANONICAL');
    assert.equal(email.status, 'READY');

    const phone = items.find((i) => i.field === 'phone');
    assert.equal(phone.value, '7905087928');
    assert.equal(phone.source, 'PROFILE_USER_CUSTOM');
    assert.equal(phone.status, 'READY');

    const workAuth = items.find((i) => i.field === 'workAuthorization');
    assert.equal(workAuth.value, 'Authorize to work in India');
    assert.equal(workAuth.source, 'PROFILE_CAREER_PREFERENCES');
    assert.equal(workAuth.status, 'NEEDS_CONFIRMATION');

    const visa = items.find((i) => i.field === 'visaSponsorship');
    assert.equal(visa.value, 'Sponsorship Required');
    assert.equal(visa.source, 'PROFILE_CAREER_PREFERENCES');
    assert.equal(visa.status, 'NEEDS_CONFIRMATION');

    const linkedin = items.find((i) => i.field === 'linkedin');
    assert.equal(linkedin.value, 'https://linkedin.com/in/vishwanath-nishad');
    assert.equal(linkedin.source, 'PROFILE_PORTFOLIO_LINKS');
    assert.equal(linkedin.status, 'READY');

    const github = items.find((i) => i.field === 'github');
    assert.equal(github.value, 'https://github.com/vishu1803');
    assert.equal(github.source, 'GITHUB_APP_IDENTITY');
    assert.equal(github.status, 'READY');

    const portfolio = items.find((i) => i.field === 'portfolio');
    assert.equal(portfolio.value, 'https://my-portfolio-kappa-beige-71.vercel.app/');
    assert.equal(portfolio.source, 'PROFILE_PORTFOLIO_LINKS');
    assert.equal(portfolio.status, 'READY');

    const avail = items.find((i) => i.field === 'availability');
    assert.equal(avail.value, '2026-10-01');
    assert.equal(avail.source, 'PROFILE_CAREER_PREFERENCES');
    assert.equal(avail.status, 'READY');
  });
});
