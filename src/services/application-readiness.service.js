/**
 * @file Canonical Application Readiness Resolver Service
 *
 * Implements the single source of truth for Application Readiness evaluation across:
 * 1. Application Handoff Kit workspace
 * 2. Portfolio & Candidate Profile readiness summaries
 * 3. Application preparation workflows
 *
 * Invariants Enforced:
 * 1. Single Value Resolution: Each readiness field resolves to exactly ONE value. No alternative "A / B" output.
 * 2. Deterministic Precedence: Explicit precedence hierarchy:
 *    APPLICATION_ANSWERS > PROFILE_CAREER_PREFERENCES > PROFILE_USER_CUSTOM > VERIFIED_IDENTITIES > RESUME_CLAIM.
 * 3. Explicit Conflict Detection: When two sources provide conflicting data, the resolver returns
 *    status: 'NEEDS_CONFIRMATION', hasConflict: true, and notes explaining the conflict.
 * 4. Zero Synthetic Data: Evaluates authentic database records only. Stored profile data is never silently rewritten.
 * 5. Strict Link Discrimination: Candidate profile-level GitHub link (https://github.com/username) is
 *    strictly separated from technical project repository URLs. Project URLs NEVER satisfy the profile GitHub link.
 * 6. Standardized Status Taxonomy: Every evaluated field is strictly one of:
 *    - READY: Field is verified, unambiguous, and documented.
 *    - NEEDS_CONFIRMATION: Field is present but requires confirmation (e.g. Work Auth, Visa, or conflicting sources).
 *    - MISSING: Field has not been provided by the candidate.
 * 7. Distinct Readiness Semantics: Explicitly separates DOCUMENT READINESS (compiled, QA-passed artifacts)
 *    from SCREENING PROFILE COMPLETENESS.
 */

import { logger } from '../utils/logger.js';

function normalizeDigits(str) {
  if (!str) return '';
  return String(str).replace(/\D/g, '');
}

function normalizeAuth(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/authorized/g, 'authorize')
    .replace(/[^a-z0-9]/g, '');
}

function parseSponsorshipBool(val) {
  if (val === true || val === false) return val;
  if (typeof val === 'string') {
    const s = val.toLowerCase().trim();
    if (/^(true|yes|y|required|sponsorship required|will require|require)/i.test(s)) return true;
    if (
      /^(false|no|n|not required|no sponsorship|no sponsorship needed|no sponsorship required|none)/i.test(
        s
      )
    )
      return false;
  }
  return null;
}

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
    const careerPreferences =
      candidateProfile?.jobPreferences ||
      metadata.careerPreferences ||
      metadata.jobPreferences ||
      {};
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
    // 1. Candidate Email (READY | NEEDS_CONFIRMATION | MISSING)
    // Precedence: APPLICATION_PACKAGE > PROFILE_CANONICAL > USER_ACCOUNT
    // -------------------------------------------------------------------------
    const pkgEmail = applicationPackage?.candidateEmail?.trim() || null;
    const profileEmail =
      cand.canonicalEmail?.trim() ||
      candidateProfile?.canonicalEmail?.trim() ||
      candidateProfile?.primaryEmail?.trim() ||
      null;
    const accountEmail = cand.email?.trim() || candidateProfile?.userEmail?.trim() || null;

    const emailCandidate = pkgEmail || profileEmail || accountEmail;
    const hasValidEmail =
      Boolean(emailCandidate) &&
      typeof emailCandidate === 'string' &&
      emailCandidate.includes('@') &&
      !emailCandidate.toLowerCase().includes('example.com');

    let emailConflict = false;
    if (pkgEmail && profileEmail && pkgEmail.toLowerCase() !== profileEmail.toLowerCase()) {
      emailConflict = true;
    }

    const emailStatus = !hasValidEmail ? 'MISSING' : emailConflict ? 'NEEDS_CONFIRMATION' : 'READY';

    items.push({
      field: 'email',
      label: 'Candidate Email',
      value: hasValidEmail ? emailCandidate : null,
      status: emailStatus,
      presence: hasValidEmail ? 'PRESENT' : 'MISSING',
      source: pkgEmail
        ? 'APPLICATION_PACKAGE'
        : profileEmail
          ? 'PROFILE_CANONICAL'
          : accountEmail
            ? 'USER_ACCOUNT'
            : 'NONE',
      hasConflict: emailConflict,
      notes: !hasValidEmail
        ? 'Valid candidate email required in Profile'
        : emailConflict
          ? `Conflict detected: Application package email ("${pkgEmail}") differs from canonical profile email ("${profileEmail}"). Candidate confirmation required.`
          : 'Authoritative primary account email verified',
      profileSection: 'contact',
      profileAnchor: '/profile#section-contact',
    });

    // -------------------------------------------------------------------------
    // 2. Contact Phone (READY | NEEDS_CONFIRMATION | MISSING)
    // Precedence: APPLICATION_ANSWERS > PROFILE_USER_CUSTOM > CANDIDATE_RECORD > RESUME_CLAIM
    // -------------------------------------------------------------------------
    const appPhone =
      (typeof combinedAnswers.phone === 'string' && combinedAnswers.phone.trim()) ||
      (typeof applicationPackage?.candidatePhone === 'string' &&
        applicationPackage.candidatePhone.trim()) ||
      null;

    const profileUserPhone =
      (typeof userCustom.phone === 'string' && userCustom.phone.trim()) || null;

    const recordPhone =
      (typeof cand.phone === 'string' && cand.phone.trim()) ||
      (typeof metadata.phone === 'string' && metadata.phone.trim()) ||
      (typeof metadata.contact?.phone === 'string' && metadata.contact.phone.trim()) ||
      null;

    const resumePhone =
      (typeof metadata.resumeData?.identity?.phone === 'string' &&
        metadata.resumeData.identity.phone.trim()) ||
      (typeof metadata.identity?.phone === 'string' && metadata.identity.phone.trim()) ||
      null;

    const effectiveProfilePhone = profileUserPhone || recordPhone || resumePhone;
    const phoneCandidate = appPhone || effectiveProfilePhone;

    let phoneConflict = false;
    if (appPhone && effectiveProfilePhone) {
      const d1 = normalizeDigits(appPhone);
      const d2 = normalizeDigits(effectiveProfilePhone);
      if (d1 && d2 && d1 !== d2) {
        phoneConflict = true;
      }
    } else if (profileUserPhone && resumePhone) {
      const d1 = normalizeDigits(profileUserPhone);
      const d2 = normalizeDigits(resumePhone);
      if (d1 && d2 && d1 !== d2) {
        phoneConflict = true;
      }
    }

    const hasPhone = Boolean(phoneCandidate) && phoneCandidate.length > 0;
    const phoneStatus = !hasPhone ? 'MISSING' : phoneConflict ? 'NEEDS_CONFIRMATION' : 'READY';

    items.push({
      field: 'phone',
      label: 'Contact Phone',
      value: hasPhone ? phoneCandidate : null,
      status: phoneStatus,
      presence: hasPhone ? 'PRESENT' : 'MISSING',
      source: appPhone
        ? 'APPLICATION_ANSWERS'
        : profileUserPhone
          ? 'PROFILE_USER_CUSTOM'
          : recordPhone
            ? 'CANDIDATE_RECORD'
            : resumePhone
              ? 'RESUME_CLAIM'
              : 'NONE',
      hasConflict: phoneConflict,
      notes: !hasPhone
        ? 'Phone number not yet provided in Profile'
        : phoneConflict
          ? `Conflict detected: Application answers specify "${appPhone}" while Profile contains "${effectiveProfilePhone}". Candidate confirmation required.`
          : 'Candidate phone number registered in Profile',
      profileSection: 'contact',
      profileAnchor: '/profile#section-contact',
    });

    // -------------------------------------------------------------------------
    // 3. Work Authorization (NEEDS_CONFIRMATION | MISSING)
    // Precedence: APPLICATION_ANSWERS > PROFILE_CAREER_PREFERENCES > PROFILE_USER_CUSTOM > RESUME_CLAIM
    // -------------------------------------------------------------------------
    const appWorkAuth =
      typeof combinedAnswers.workAuthorization === 'string' &&
      combinedAnswers.workAuthorization.trim().length > 0
        ? combinedAnswers.workAuthorization.trim()
        : null;

    let prefWorkAuth = null;
    if (careerPreferences.workAuthorization) {
      prefWorkAuth = Array.isArray(careerPreferences.workAuthorization)
        ? careerPreferences.workAuthorization.join(', ')
        : String(careerPreferences.workAuthorization);
      prefWorkAuth = prefWorkAuth.trim();
    }

    const userCustomWorkAuth =
      typeof userCustom.workAuthorization === 'string' &&
      userCustom.workAuthorization.trim().length > 0
        ? userCustom.workAuthorization.trim()
        : null;

    const metadataWorkAuth =
      (typeof metadata.readiness?.workAuthorization === 'string' &&
        metadata.readiness.workAuthorization.trim()) ||
      (typeof metadata.identity?.workAuthorization === 'string' &&
        metadata.identity.workAuthorization.trim()) ||
      null;

    const effectivePrefWorkAuth = prefWorkAuth || userCustomWorkAuth || metadataWorkAuth;
    const workAuthCandidate = appWorkAuth || effectivePrefWorkAuth;

    let workAuthConflict = false;
    if (appWorkAuth && effectivePrefWorkAuth) {
      if (normalizeAuth(appWorkAuth) !== normalizeAuth(effectivePrefWorkAuth)) {
        workAuthConflict = true;
      }
    }

    const hasWorkAuth = Boolean(workAuthCandidate) && workAuthCandidate.length > 0;
    const workAuthStatus = !hasWorkAuth ? 'MISSING' : 'NEEDS_CONFIRMATION';

    items.push({
      field: 'workAuthorization',
      label: 'Work Authorization',
      value: hasWorkAuth ? workAuthCandidate : null,
      status: workAuthStatus,
      presence: hasWorkAuth ? 'PRESENT' : 'MISSING',
      source: appWorkAuth
        ? 'APPLICATION_ANSWERS'
        : prefWorkAuth
          ? 'PROFILE_CAREER_PREFERENCES'
          : userCustomWorkAuth
            ? 'PROFILE_USER_CUSTOM'
            : metadataWorkAuth
              ? 'RESUME_CLAIM'
              : 'NONE',
      hasConflict: workAuthConflict,
      notes: !hasWorkAuth
        ? 'Work authorization status not yet documented in Profile or Answers'
        : workAuthConflict
          ? `Conflict detected: Application answer ("${appWorkAuth}") differs from Profile preference ("${effectivePrefWorkAuth}"). Candidate confirmation required.`
          : 'Requires candidate confirmation for target job jurisdiction',
      profileSection: 'readiness',
      profileAnchor: '/profile#section-readiness',
    });

    // -------------------------------------------------------------------------
    // 4. Visa Sponsorship (NEEDS_CONFIRMATION | MISSING)
    // Precedence: APPLICATION_ANSWERS > PROFILE_CAREER_PREFERENCES > PROFILE_USER_CUSTOM > RESUME_CLAIM
    // -------------------------------------------------------------------------
    const rawAppSponsorship =
      combinedAnswers.visaSponsorship ?? combinedAnswers.visaSponsorshipRequired;
    const rawPrefSponsorship =
      careerPreferences.visaSponsorshipRequired ??
      userCustom.visaSponsorshipRequired ??
      metadata.readiness?.visaSponsorshipRequired ??
      metadata.identity?.visaSponsorshipRequired;

    const appBool =
      rawAppSponsorship !== undefined && rawAppSponsorship !== null
        ? parseSponsorshipBool(rawAppSponsorship)
        : null;

    const prefBool =
      rawPrefSponsorship !== undefined && rawPrefSponsorship !== null
        ? parseSponsorshipBool(rawPrefSponsorship)
        : null;

    let visaConflict = false;
    if (appBool !== null && prefBool !== null && appBool !== prefBool) {
      visaConflict = true;
    }

    let resolvedVisaString = null;
    let visaSource = 'NONE';

    if (rawAppSponsorship !== undefined && rawAppSponsorship !== null) {
      visaSource = 'APPLICATION_ANSWERS';
      if (typeof rawAppSponsorship === 'boolean') {
        resolvedVisaString = rawAppSponsorship ? 'Sponsorship Required' : 'No Sponsorship Needed';
      } else {
        resolvedVisaString = String(rawAppSponsorship).trim();
      }
    } else if (rawPrefSponsorship !== undefined && rawPrefSponsorship !== null) {
      visaSource =
        careerPreferences.visaSponsorshipRequired !== undefined
          ? 'PROFILE_CAREER_PREFERENCES'
          : userCustom.visaSponsorshipRequired !== undefined
            ? 'PROFILE_USER_CUSTOM'
            : 'RESUME_CLAIM';
      if (typeof rawPrefSponsorship === 'boolean') {
        resolvedVisaString = rawPrefSponsorship ? 'Sponsorship Required' : 'No Sponsorship Needed';
      } else {
        resolvedVisaString = String(rawPrefSponsorship).trim();
      }
    }

    const hasVisa = Boolean(resolvedVisaString) && resolvedVisaString.length > 0;
    const visaStatus = !hasVisa ? 'MISSING' : 'NEEDS_CONFIRMATION';

    items.push({
      field: 'visaSponsorship',
      label: 'Visa Sponsorship',
      value: hasVisa ? resolvedVisaString : null,
      status: visaStatus,
      presence: hasVisa ? 'PRESENT' : 'MISSING',
      source: visaSource,
      hasConflict: visaConflict,
      notes: !hasVisa
        ? 'Visa sponsorship preference not set in Profile'
        : visaConflict
          ? `Conflict detected: Application answer specifies "${resolvedVisaString}" while Profile declares "${prefBool ? 'Sponsorship Required' : 'No Sponsorship Needed'}". Candidate confirmation required.`
          : 'Confirm sponsorship requirements with target employer',
      profileSection: 'readiness',
      profileAnchor: '/profile#section-readiness',
    });

    // -------------------------------------------------------------------------
    // 5. LinkedIn Profile (READY | NEEDS_CONFIRMATION | MISSING)
    // Precedence: PROFILE_PORTFOLIO_LINKS > LINKEDIN_IDENTITY
    // -------------------------------------------------------------------------
    const linkedInEntry = portfolioLinks.find(
      (l) =>
        String(l.label || l.platform || '').toUpperCase() === 'LINKEDIN' ||
        (l.url && /linkedin\.com/i.test(l.url))
    );
    const linkedInIdentity = identities.find(
      (id) =>
        (id.provider === 'LINKEDIN' || id.provider === 'LINKEDIN_OAUTH') &&
        Boolean(id.profileUrl || id.externalUsername)
    );

    const portfolioLinkedIn = linkedInEntry?.url?.trim() || null;
    const identityLinkedIn =
      linkedInIdentity?.profileUrl?.trim() ||
      (linkedInIdentity?.externalUsername
        ? `https://linkedin.com/in/${linkedInIdentity.externalUsername}`
        : null);

    let linkedinConflict = false;
    if (
      portfolioLinkedIn &&
      identityLinkedIn &&
      portfolioLinkedIn.toLowerCase() !== identityLinkedIn.toLowerCase()
    ) {
      linkedinConflict = true;
    }

    const resolvedLinkedIn = portfolioLinkedIn || identityLinkedIn;
    const hasLinkedIn = Boolean(resolvedLinkedIn) && /^https?:\/\//i.test(resolvedLinkedIn);
    const linkedinStatus = !hasLinkedIn
      ? 'MISSING'
      : linkedinConflict
        ? 'NEEDS_CONFIRMATION'
        : 'READY';

    items.push({
      field: 'linkedin',
      label: 'LinkedIn Profile',
      value: hasLinkedIn ? resolvedLinkedIn : null,
      status: linkedinStatus,
      presence: hasLinkedIn ? 'PRESENT' : 'MISSING',
      source: portfolioLinkedIn
        ? 'PROFILE_PORTFOLIO_LINKS'
        : identityLinkedIn
          ? 'LINKEDIN_IDENTITY'
          : 'NONE',
      hasConflict: linkedinConflict,
      notes: !hasLinkedIn
        ? 'LinkedIn profile link not added to links collection'
        : linkedinConflict
          ? 'Conflict detected between connected LinkedIn identity and profile link. Candidate confirmation required.'
          : 'Connected professional LinkedIn profile link',
      profileSection: 'links',
      profileAnchor: '/profile#section-links',
    });

    // -------------------------------------------------------------------------
    // 6. Candidate GitHub (READY | NEEDS_CONFIRMATION | MISSING)
    // Profile-level only — strictly excludes project repos
    // Precedence: GITHUB_APP_IDENTITY > PROFILE_PORTFOLIO_LINKS > CANDIDATE_RECORD
    // -------------------------------------------------------------------------
    let identityGithubUrl = null;
    const ghIdentity = identities.find(
      (id) =>
        (id.provider === 'GITHUB_APP' || id.provider === 'GITHUB') && Boolean(id.externalUsername)
    );
    if (ghIdentity?.externalUsername) {
      identityGithubUrl = `https://github.com/${ghIdentity.externalUsername}`;
    }

    let linkGithubUrl = null;
    const ghLink = portfolioLinks.find(
      (l) =>
        String(l.label || l.platform || '').toUpperCase() === 'GITHUB' ||
        (l.url && /^https?:\/\/github\.com\/[a-zA-Z0-9_-]+\/?$/i.test(l.url))
    );
    if (ghLink?.url) {
      const isProjectRepo = /^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(ghLink.url);
      if (!isProjectRepo) {
        linkGithubUrl = ghLink.url.trim();
      }
    }

    let candGithubUrl = null;
    const explicitUser =
      candidateProfile?.githubUsername || cand.githubUsername || metadata.githubUsername;
    if (explicitUser && typeof explicitUser === 'string') {
      const cleaned = explicitUser
        .replace(/^https?:\/\/github\.com\//i, '')
        .replace(/\/.*$/, '')
        .trim();
      if (cleaned.length > 0) {
        candGithubUrl = `https://github.com/${cleaned}`;
      }
    }

    let githubConflict = false;
    if (identityGithubUrl && linkGithubUrl) {
      const u1 = identityGithubUrl.toLowerCase().replace(/\/+$/, '');
      const u2 = linkGithubUrl.toLowerCase().replace(/\/+$/, '');
      if (u1 !== u2) {
        githubConflict = true;
      }
    }

    const resolvedGithub = identityGithubUrl || linkGithubUrl || candGithubUrl;
    const hasGithub = Boolean(resolvedGithub);
    const githubStatus = !hasGithub ? 'MISSING' : githubConflict ? 'NEEDS_CONFIRMATION' : 'READY';

    items.push({
      field: 'github',
      label: 'Candidate GitHub',
      value: hasGithub ? resolvedGithub : null,
      status: githubStatus,
      presence: hasGithub ? 'PRESENT' : 'MISSING',
      source: identityGithubUrl
        ? 'GITHUB_APP_IDENTITY'
        : linkGithubUrl
          ? 'PROFILE_PORTFOLIO_LINKS'
          : candGithubUrl
            ? 'CANDIDATE_RECORD'
            : 'NONE',
      hasConflict: githubConflict,
      notes: !hasGithub
        ? 'GitHub profile URL not linked in Profile'
        : githubConflict
          ? 'Conflict detected between verified GitHub identity and profile link. Candidate confirmation required.'
          : 'Verified candidate profile-level GitHub link',
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
    const portfolioUrl = portfolioSite?.url?.trim() || null;
    const hasPortfolio = Boolean(portfolioUrl) && /^https?:\/\//i.test(portfolioUrl);

    items.push({
      field: 'portfolio',
      label: 'Code / Portfolio',
      value: hasPortfolio ? portfolioUrl : null,
      status: hasPortfolio ? 'READY' : 'MISSING',
      presence: hasPortfolio ? 'PRESENT' : 'MISSING',
      source: hasPortfolio ? 'PROFILE_PORTFOLIO_LINKS' : 'NONE',
      hasConflict: false,
      notes: hasPortfolio
        ? 'Personal portfolio website linked'
        : 'Portfolio website not specified in Profile',
      profileSection: 'links',
      profileAnchor: '/profile#section-links',
    });

    // -------------------------------------------------------------------------
    // 8. Earliest Availability / Notice Period (READY | NEEDS_CONFIRMATION | MISSING)
    // Precedence: APPLICATION_ANSWERS > PROFILE_CAREER_PREFERENCES > PROFILE_USER_CUSTOM
    // -------------------------------------------------------------------------
    const appAvail =
      (typeof combinedAnswers.availability === 'string' && combinedAnswers.availability.trim()) ||
      (typeof combinedAnswers.availabilityDate === 'string' &&
        combinedAnswers.availabilityDate.trim()) ||
      null;

    const prefAvail =
      (typeof careerPreferences.availabilityDate === 'string' &&
        careerPreferences.availabilityDate.trim()) ||
      (typeof userCustom.availability === 'string' && userCustom.availability.trim()) ||
      (typeof userCustom.availabilityDate === 'string' && userCustom.availabilityDate.trim()) ||
      (typeof metadata.jobPreferences?.availabilityDate === 'string' &&
        metadata.jobPreferences.availabilityDate.trim()) ||
      null;

    let availConflict = false;
    if (appAvail && prefAvail && appAvail.toLowerCase() !== prefAvail.toLowerCase()) {
      availConflict = true;
    }

    const resolvedAvail = appAvail || prefAvail;
    const hasAvail = Boolean(resolvedAvail) && resolvedAvail.length > 0;
    const availStatus = !hasAvail ? 'MISSING' : availConflict ? 'NEEDS_CONFIRMATION' : 'READY';

    items.push({
      field: 'availability',
      label: 'Earliest Start Date',
      value: hasAvail ? resolvedAvail : null,
      status: availStatus,
      presence: hasAvail ? 'PRESENT' : 'MISSING',
      source: appAvail
        ? 'APPLICATION_ANSWERS'
        : careerPreferences.availabilityDate
          ? 'PROFILE_CAREER_PREFERENCES'
          : prefAvail
            ? 'PROFILE_USER_CUSTOM'
            : 'NONE',
      hasConflict: availConflict,
      notes: !hasAvail
        ? 'Availability date not specified in Job Search Intent'
        : availConflict
          ? `Conflict detected: Application answer specifies "${appAvail}" while Profile preference specifies "${prefAvail}". Candidate confirmation required.`
          : 'Candidate start date recorded in Job Search Intent',
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

    items.readiness = items;
    items.readinessSemantics = semantics;

    return { items, semantics };
  }
}
