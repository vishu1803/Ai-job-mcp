/**
 * @file Canonical Application Readiness Resolver Service
 *
 * Implements the single source of truth for Application Readiness evaluation across:
 * 1. Application Handoff Kit workspace
 * 2. Portfolio & Candidate Profile readiness summaries
 * 3. Application preparation workflows
 *
 * Invariants Enforced:
 * 1. Zero Synthetic Data: Evaluates authentic database records only (userCustom, careerPreferences,
 *    identities, and explicit candidate application answers). Missing values are flagged as MISSING.
 * 2. Strict Link Discrimination: Candidate profile-level GitHub link (https://github.com/username) is
 *    strictly separated from technical project repository URLs. Project URLs NEVER satisfy the profile GitHub link.
 * 3. Standardized Status Taxonomy: Every evaluated field is strictly one of:
 *    - PRESENT: Field is documented and verified in profile records.
 *    - NEEDS_CONFIRMATION: Field is present but requires jurisdiction/employer confirmation (e.g. Work Auth, Visa).
 *    - MISSING: Field has not been provided by the candidate.
 * 4. Distinct Readiness Semantics: Explicitly separates DOCUMENT READINESS (compiled, QA-passed artifacts)
 *    from SCREENING PROFILE COMPLETENESS.
 */

import { logger } from '../utils/logger.js';

export class ApplicationReadinessService {
  /**
   * @param {object} [dependencies={}]
   */
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || logger.child({ module: 'ApplicationReadinessService' });
  }

  /**
   * Evaluates application readiness across canonical candidate profile and application data.
   *
   * @param {object} params
   * @param {object} [params.candidateProfile] Full candidate profile DTO (from CandidateProfileService.getProfile)
   * @param {object} [params.candidate] Direct candidate database record
   * @param {object} [params.applicationPackage] Prepared ApplicationPackage
   * @param {object} [params.answers] Application screening answers
   * @param {object} [params.jobPosting] Target job posting details
   * @returns {{ items: Array<object>, semantics: object }} Standardized readiness items and computed semantics
   */
  evaluateReadiness({
    candidateProfile = null,
    candidate: directCandidate = null,
    applicationPackage = null,
    answers = null,
    jobPosting = null,
  }) {
    // 1. Resolve normalized candidate root and profile metadata
    const cand = candidateProfile?.candidate || directCandidate || candidateProfile || {};
    const metadata = cand.profileMetadata || candidateProfile?.profileMetadata || {};
    const userCustom = metadata.userCustom || {};
    const careerPreferences = metadata.careerPreferences || metadata.jobPreferences || {};
    const combinedAnswers = {
      ...(applicationPackage?.answers || {}),
      ...(answers || {}),
    };

    const identities = Array.isArray(candidateProfile?.identities)
      ? candidateProfile.identities
      : Array.isArray(metadata.identities)
        ? metadata.identities
        : [];

    const portfolioLinks =
      Array.isArray(userCustom.portfolioLinks) && userCustom.portfolioLinks.length > 0
        ? userCustom.portfolioLinks
        : Array.isArray(metadata.contact?.links) && metadata.contact.links.length > 0
          ? metadata.contact.links
          : Array.isArray(candidateProfile?.portfolioLinks)
            ? candidateProfile.portfolioLinks
            : [];

    const items = [];

    // -------------------------------------------------------------------------
    // 1. Candidate Email (PRESENT | MISSING)
    // -------------------------------------------------------------------------
    const email =
      applicationPackage?.candidateEmail ||
      cand.canonicalEmail ||
      candidateProfile?.userEmail ||
      candidateProfile?.canonicalEmail ||
      candidateProfile?.primaryEmail ||
      cand.email ||
      null;

    const hasValidEmail =
      Boolean(email) &&
      typeof email === 'string' &&
      email.includes('@') &&
      !email.toLowerCase().includes('example.com');

    items.push({
      field: 'email',
      label: 'Candidate Email',
      value: hasValidEmail ? email.trim() : null,
      status: hasValidEmail ? 'READY' : 'MISSING',
      presence: hasValidEmail ? 'PRESENT' : 'MISSING',
      notes: hasValidEmail
        ? 'Authoritative primary account email verified'
        : 'Valid candidate email required in Profile',
      profileSection: 'contact',
      profileAnchor: '/profile#section-contact',
    });

    // -------------------------------------------------------------------------
    // 2. Contact Phone (PRESENT | MISSING)
    // -------------------------------------------------------------------------
    const rawPhone =
      applicationPackage?.candidatePhone ||
      candidateProfile?.candidatePhone ||
      userCustom.phone ||
      cand.phone ||
      metadata.phone ||
      metadata.contact?.phone ||
      metadata.identity?.phone ||
      null;

    const hasPhone =
      Boolean(rawPhone) && typeof rawPhone === 'string' && rawPhone.trim().length > 0;

    items.push({
      field: 'phone',
      label: 'Contact Phone',
      value: hasPhone ? rawPhone.trim() : null,
      status: hasPhone ? 'READY' : 'MISSING',
      presence: hasPhone ? 'PRESENT' : 'MISSING',
      notes: hasPhone
        ? 'Candidate phone number registered'
        : 'Phone number not yet provided in Profile',
      profileSection: 'contact',
      profileAnchor: '/profile#section-contact',
    });

    // -------------------------------------------------------------------------
    // 3. Work Authorization (NEEDS_CONFIRMATION | MISSING)
    // -------------------------------------------------------------------------
    let rawWorkAuth = combinedAnswers.workAuthorization || null;
    if (!rawWorkAuth && careerPreferences.workAuthorization) {
      rawWorkAuth = Array.isArray(careerPreferences.workAuthorization)
        ? careerPreferences.workAuthorization.join(', ')
        : careerPreferences.workAuthorization;
    }
    if (!rawWorkAuth && userCustom.workAuthorization) {
      rawWorkAuth = userCustom.workAuthorization;
    }
    if (!rawWorkAuth && metadata.readiness?.workAuthorization) {
      rawWorkAuth = metadata.readiness.workAuthorization;
    }
    if (!rawWorkAuth && metadata.identity?.workAuthorization) {
      rawWorkAuth = metadata.identity.workAuthorization;
    }

    const hasWorkAuth =
      Boolean(rawWorkAuth) && typeof rawWorkAuth === 'string' && rawWorkAuth.trim().length > 0;

    items.push({
      field: 'workAuthorization',
      label: 'Work Authorization',
      value: hasWorkAuth ? rawWorkAuth.trim() : null,
      status: hasWorkAuth ? 'NEEDS_CONFIRMATION' : 'MISSING',
      presence: hasWorkAuth ? 'PRESENT' : 'MISSING',
      notes: hasWorkAuth
        ? 'Requires candidate confirmation for target job jurisdiction'
        : 'Work authorization status not yet documented in Profile or Answers',
      profileSection: 'readiness',
      profileAnchor: '/profile#section-readiness',
    });

    // -------------------------------------------------------------------------
    // 4. Visa Sponsorship (NEEDS_CONFIRMATION | MISSING)
    // -------------------------------------------------------------------------
    let rawSponsorship = combinedAnswers.visaSponsorship ?? combinedAnswers.visaSponsorshipRequired;
    if (rawSponsorship === undefined || rawSponsorship === null) {
      rawSponsorship =
        careerPreferences.visaSponsorshipRequired ??
        userCustom.visaSponsorshipRequired ??
        metadata.readiness?.visaSponsorshipRequired ??
        metadata.identity?.visaSponsorshipRequired;
    }

    let sponsorshipValue = null;
    if (typeof rawSponsorship === 'boolean') {
      sponsorshipValue = rawSponsorship ? 'Sponsorship Required' : 'No Sponsorship Needed';
    } else if (rawSponsorship !== undefined && rawSponsorship !== null) {
      const strVal = String(rawSponsorship).trim();
      if (strVal.length > 0) sponsorshipValue = strVal;
    }

    items.push({
      field: 'visaSponsorship',
      label: 'Visa Sponsorship',
      value: sponsorshipValue,
      status: sponsorshipValue !== null ? 'NEEDS_CONFIRMATION' : 'MISSING',
      presence: sponsorshipValue !== null ? 'PRESENT' : 'MISSING',
      notes:
        sponsorshipValue !== null
          ? 'Confirm sponsorship requirements with target employer'
          : 'Visa sponsorship preference not set in Profile',
      profileSection: 'readiness',
      profileAnchor: '/profile#section-readiness',
    });

    // -------------------------------------------------------------------------
    // 5. LinkedIn Profile (READY | MISSING)
    // -------------------------------------------------------------------------
    const linkedInEntry = portfolioLinks.find(
      (l) =>
        String(l.label || l.platform || '').toUpperCase() === 'LINKEDIN' ||
        (l.url && /linkedin\.com/i.test(l.url))
    );
    const linkedInUrl = linkedInEntry?.url || null;
    const hasLinkedIn = Boolean(linkedInUrl) && /^https?:\/\//i.test(linkedInUrl);

    items.push({
      field: 'linkedin',
      label: 'LinkedIn Profile',
      value: hasLinkedIn ? linkedInUrl.trim() : null,
      status: hasLinkedIn ? 'READY' : 'MISSING',
      presence: hasLinkedIn ? 'PRESENT' : 'MISSING',
      notes: hasLinkedIn
        ? 'Connected professional LinkedIn profile link'
        : 'LinkedIn profile link not added to links collection',
      profileSection: 'links',
      profileAnchor: '/profile#section-links',
    });

    // -------------------------------------------------------------------------
    // 6. Candidate GitHub (Profile-level only — strictly excludes project repos)
    // -------------------------------------------------------------------------
    let profileGithubUrl = null;

    // Check connected GitHub identity
    const ghIdentity = identities.find(
      (id) =>
        (id.provider === 'GITHUB_APP' || id.provider === 'GITHUB') && Boolean(id.externalUsername)
    );
    if (ghIdentity?.externalUsername) {
      profileGithubUrl = `https://github.com/${ghIdentity.externalUsername}`;
    }

    // Check portfolio links collection (match profile link: https://github.com/username)
    if (!profileGithubUrl) {
      const ghLink = portfolioLinks.find(
        (l) =>
          String(l.label || l.platform || '').toUpperCase() === 'GITHUB' ||
          (l.url && /^https?:\/\/github\.com\/[a-zA-Z0-9_-]+\/?$/i.test(l.url))
      );
      if (ghLink?.url) {
        // Enforce link discrimination: project repos (e.g. github.com/user/repo) must NOT satisfy candidate GitHub
        const isProjectRepo = /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(ghLink.url);
        if (!isProjectRepo) {
          profileGithubUrl = ghLink.url;
        }
      }
    }

    // Check explicit candidate username
    if (!profileGithubUrl) {
      const explicitUser =
        candidateProfile?.githubUsername || cand.githubUsername || metadata.githubUsername;
      if (explicitUser && typeof explicitUser === 'string') {
        profileGithubUrl = `https://github.com/${explicitUser.replace(/^https?:\/\/github\.com\//i, '').replace(/\/.*$/, '')}`;
      }
    }

    const hasProfileGithub = Boolean(profileGithubUrl);

    items.push({
      field: 'github',
      label: 'Candidate GitHub',
      value: hasProfileGithub ? profileGithubUrl.trim() : null,
      status: hasProfileGithub ? 'READY' : 'MISSING',
      presence: hasProfileGithub ? 'PRESENT' : 'MISSING',
      notes: hasProfileGithub
        ? 'Verified candidate profile-level GitHub link'
        : 'GitHub profile URL not linked in Profile',
      profileSection: 'links',
      profileAnchor: '/profile#section-links',
    });

    // -------------------------------------------------------------------------
    // 7. Portfolio Site (READY | MISSING)
    // -------------------------------------------------------------------------
    const portfolioSite = portfolioLinks.find(
      (l) =>
        String(l.label || l.platform || '').toUpperCase() === 'PORTFOLIO' ||
        (l.url &&
          !/github\.com/i.test(l.url) &&
          !/linkedin\.com/i.test(l.url) &&
          !/leetcode\.com/i.test(l.url))
    );
    const portfolioUrl = portfolioSite?.url || null;
    const hasPortfolio = Boolean(portfolioUrl) && /^https?:\/\//i.test(portfolioUrl);

    items.push({
      field: 'portfolio',
      label: 'Code / Portfolio',
      value: hasPortfolio ? portfolioUrl.trim() : null,
      status: hasPortfolio ? 'READY' : 'MISSING',
      presence: hasPortfolio ? 'PRESENT' : 'MISSING',
      notes: hasPortfolio
        ? 'Personal portfolio website linked'
        : 'Portfolio website not specified in Profile',
      profileSection: 'links',
      profileAnchor: '/profile#section-links',
    });

    // -------------------------------------------------------------------------
    // 8. Earliest Availability / Notice Period (READY | MISSING)
    // -------------------------------------------------------------------------
    const rawAvailability =
      combinedAnswers.availability ||
      combinedAnswers.availabilityDate ||
      careerPreferences.availabilityDate ||
      userCustom.availability ||
      userCustom.availabilityDate ||
      metadata.jobPreferences?.availabilityDate ||
      null;

    const hasAvailability =
      Boolean(rawAvailability) &&
      typeof rawAvailability === 'string' &&
      rawAvailability.trim().length > 0;

    items.push({
      field: 'availability',
      label: 'Earliest Start Date',
      value: hasAvailability ? rawAvailability.trim() : null,
      status: hasAvailability ? 'READY' : 'MISSING',
      presence: hasAvailability ? 'PRESENT' : 'MISSING',
      notes: hasAvailability
        ? 'Candidate start date recorded in Job Search Intent'
        : 'Availability date not specified in Job Search Intent',
      profileSection: 'preferences',
      profileAnchor: '/profile#section-preferences',
    });

    // -------------------------------------------------------------------------
    // Semantics Computation
    // -------------------------------------------------------------------------
    const missingProfileFields = items
      .filter((item) => item.status === 'MISSING')
      .map((item) => item.field);

    const needsConfirmationFields = items
      .filter((item) => item.status === 'NEEDS_CONFIRMATION')
      .map((item) => item.field);

    const profileComplete = missingProfileFields.length === 0;

    // Document readiness check if handoffKit/applicationPackage is provided
    const resumeQaPassed = Boolean(
      applicationPackage?.tailoredResume?.artifact?.qaPassed ??
      candidateProfile?.handoffKit?.resume?.qaAudit?.passed
    );
    const coverLetterQaPassed = Boolean(
      applicationPackage?.coverLetter?.artifact?.qaPassed ??
      candidateProfile?.handoffKit?.coverLetter?.qaAudit?.passed
    );
    const documentsReady = resumeQaPassed && coverLetterQaPassed;

    const semantics = {
      documentsReady,
      profileComplete,
      documentsStatus: documentsReady ? 'DOCUMENTS_READY' : 'DOCUMENTS_BLOCKED',
      profileStatus: profileComplete ? 'PROFILE_COMPLETE' : 'PROFILE_INCOMPLETE',
      missingProfileFields,
      needsConfirmationFields,
      summary: profileComplete
        ? needsConfirmationFields.length > 0
          ? `All screening profile fields present. Confirm ${needsConfirmationFields.length} item(s) (${needsConfirmationFields.join(', ')}) with the candidate before submission.`
          : 'All applicant screening fields verified and complete.'
        : `Screening profile is incomplete (missing: ${missingProfileFields.join(', ')}). HANDOFF_READY does not imply these fields are complete.`,
    };

    return { items, semantics };
  }
}
