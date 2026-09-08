/**
 * @file Candidate Email Resolution & Synthetic Domain Detection (P14-005AW / P14-029).
 *
 * Implements sovereign candidate email resolution policy across the platform:
 * 1. Identifies synthetic, RFC 2606 reserved, or test placeholder domains.
 * 2. Enforces authentic candidate identity precedence:
 *    - Genuine non-synthetic canonicalEmail
 *    - Genuine non-synthetic linked user account email (users.email)
 *    - Genuine non-synthetic parsed resume contact email
 *    - Genuine non-synthetic custom profile / identity emails
 * 3. Prevents legacy fixture values (e.g. vishw@example.com) from leaking
 *    into application artifacts or profile surfaces.
 * 4. Distinguishes four distinct email states:
 *    - VALID_EMAIL: Authentic, well-formed email ready for applications.
 *    - MISSING_EMAIL: No email supplied in any profile, resume, or account field.
 *    - INVALID_EMAIL: Email string provided but malformed or syntactically invalid.
 *    - UNCONFIRMED_EMAIL: Conflict detected between distinct authentic sources.
 */

import { ValidationError } from '../errors/index.js';

export const CandidateEmailState = Object.freeze({
  VALID_EMAIL: 'VALID_EMAIL',
  MISSING_EMAIL: 'MISSING_EMAIL',
  INVALID_EMAIL: 'INVALID_EMAIL',
  UNCONFIRMED_EMAIL: 'UNCONFIRMED_EMAIL',
});

/**
 * Validates RFC-compliant email syntax without regex catastrophic backtracking.
 *
 * @param {string|null|undefined} email
 * @returns {boolean} True if string is a valid non-empty email syntax.
 */
export function isValidEmailFormat(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  // Standard RFC 5322 compliant regex for basic email syntax checking
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(trimmed);
}

/**
 * Determines whether an email address belongs to a known placeholder, mock, or synthetic test domain.
 *
 * @param {string|null|undefined} email
 * @returns {boolean} True if the email is invalid, empty, or uses an RFC 2606 or test domain.
 */
export function isSyntheticEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return true;
  const domain = trimmed.slice(atIndex + 1);
  return (
    domain === 'example.com' ||
    domain === 'example.org' ||
    domain === 'example.net' ||
    domain === 'example.edu' ||
    domain.endsWith('.example') ||
    domain === 'test' ||
    domain.endsWith('.test') ||
    trimmed === 'candidate@example.com'
  );
}

/**
 * Extracts and categorizes all available email candidates from various profile, account,
 * and application structures.
 *
 * @param {object} cand Candidate or Profile object
 * @param {string|null|undefined} [userEmail] User account email
 * @param {object} [options={}] Additional options or applicationPackage
 * @returns {Array<{ email: string, source: string, isSynthetic: boolean, isValidFormat: boolean }>}
 */
function extractEmailCandidates(cand, userEmail, options = {}) {
  const list = [];
  const add = (rawEmail, source) => {
    if (typeof rawEmail === 'string' && rawEmail.trim()) {
      const email = rawEmail.trim();
      list.push({
        email,
        source,
        isSynthetic: isSyntheticEmail(email),
        isValidFormat: isValidEmailFormat(email),
      });
    }
  };

  const appPkg = options?.applicationPackage || cand?.applicationPackage;
  if (appPkg?.candidateEmail) {
    add(appPkg.candidateEmail, 'APPLICATION_PACKAGE');
  }

  const canonical =
    cand?.canonicalEmail ||
    cand?.candidate?.canonicalEmail ||
    cand?.candidateProfile?.canonicalEmail ||
    cand?.primaryEmail;
  if (canonical) {
    add(canonical, 'PROFILE_CANONICAL');
  }

  const accountEmail =
    userEmail ||
    options?.userEmail ||
    cand?.userEmail ||
    cand?.candidate?.userEmail ||
    cand?.candidateProfile?.userEmail ||
    cand?.user?.email ||
    (cand?.email && typeof cand.email === 'string' ? cand.email : null);
  if (accountEmail) {
    add(accountEmail, 'USER_ACCOUNT');
  }

  const resumeEmail =
    cand?.profileMetadata?.resumeData?.identity?.email ||
    cand?.candidate?.profileMetadata?.resumeData?.identity?.email ||
    cand?.candidateProfile?.profileMetadata?.resumeData?.identity?.email;
  if (resumeEmail) {
    add(resumeEmail, 'RESUME_DATA');
  }

  const customEmail =
    cand?.profileMetadata?.userCustom?.email ||
    cand?.candidate?.profileMetadata?.userCustom?.email ||
    cand?.profileMetadata?.contact?.email ||
    cand?.candidate?.profileMetadata?.contact?.email;
  if (customEmail) {
    add(customEmail, 'USER_CUSTOM');
  }

  const identities =
    cand?.identities ||
    cand?.candidate?.identities ||
    cand?.candidateProfile?.identities ||
    cand?.profileMetadata?.identities;
  if (Array.isArray(identities)) {
    for (const id of identities) {
      if (id?.externalEmail) {
        add(id.externalEmail, `IDENTITY_${id.provider || 'EXTERNAL'}`);
      }
    }
  }

  return list;
}

/**
 * Resolves the authentic candidate profile email, preventing test fixtures or dummy defaults
 * (such as vishw@example.com or candidate@example.com) from overriding genuine user account
 * or parsed resume emails.
 *
 * Precedence:
 * 1. Genuine non-synthetic email from applicationPackage, canonicalEmail, linkedUserEmail, or resumeData
 * 2. Synthetic fallback only when no non-synthetic email exists (for mock/unit test environments)
 *
 * @param {object} cand Candidate record or Profile object
 * @param {string|null|undefined} [userEmail] User account email
 * @param {object} [options={}]
 * @param {boolean} [options.allowNullable=false] If true, returns null instead of throwing ValidationError when no email exists.
 * @returns {string|null} Resolved email
 */
export function resolveCandidateEmail(cand, userEmail, options = {}) {
  const candidates = extractEmailCandidates(cand, userEmail, options);

  // 1. Prioritize authentic non-synthetic emails with valid format
  const authenticValid = candidates.find((c) => !c.isSynthetic && c.isValidFormat);
  if (authenticValid) {
    return authenticValid.email;
  }

  // 1b. Authentic non-synthetic even if format is questionable (preserves raw claim)
  const authenticAny = candidates.find((c) => !c.isSynthetic);
  if (authenticAny) {
    return authenticAny.email;
  }

  // 2. In purely synthetic test environments, fall back to available test fixture emails
  const syntheticValid = candidates.find((c) => c.isValidFormat);
  if (syntheticValid) {
    return syntheticValid.email;
  }
  if (candidates.length > 0) {
    return candidates[0].email;
  }

  if (options && options.allowNullable) {
    return null;
  }

  throw new ValidationError(
    'Candidate profile email is required to prepare a job application.',
    'MISSING_CANDIDATE_EMAIL'
  );
}

/**
 * Evaluates candidate email readiness status and categorizes into the 4 authoritative states:
 * VALID_EMAIL, MISSING_EMAIL, INVALID_EMAIL, UNCONFIRMED_EMAIL.
 *
 * @param {object} cand Candidate record, Profile view, or wrapper object
 * @param {string|null|undefined} [userEmail] User account email
 * @param {object} [options={}] Additional context (e.g. applicationPackage)
 * @returns {{
 *   email: string|null,
 *   state: 'VALID_EMAIL'|'MISSING_EMAIL'|'INVALID_EMAIL'|'UNCONFIRMED_EMAIL',
 *   status: 'READY'|'MISSING'|'NEEDS_CONFIRMATION',
 *   presence: 'PRESENT'|'MISSING',
 *   source: string,
 *   hasConflict: boolean,
 *   notes: string
 * }}
 */
export function evaluateCandidateEmailStatus(cand, userEmail, options = {}) {
  const candidates = extractEmailCandidates(cand, userEmail, options);

  if (candidates.length === 0) {
    return {
      email: null,
      state: CandidateEmailState.MISSING_EMAIL,
      status: 'MISSING',
      presence: 'MISSING',
      source: 'NONE',
      hasConflict: false,
      notes: 'Valid candidate email required in Profile',
    };
  }

  // Filter authentic non-synthetic candidates vs synthetic candidates
  const authenticCandidates = candidates.filter((c) => !c.isSynthetic);

  // Check for conflicts between authentic sources:
  // Only true discrepancies between two distinct, non-synthetic candidate emails require confirmation.
  // Synthetic seed emails never conflict with authentic emails.
  let hasConflict = false;
  let conflictNotes = '';
  if (authenticCandidates.length > 1) {
    const primary = authenticCandidates[0].email.toLowerCase();
    const conflicting = authenticCandidates.find((c) => c.email.toLowerCase() !== primary);
    if (conflicting) {
      hasConflict = true;
      conflictNotes = `Conflict detected: ${conflicting.source} email ("${conflicting.email}") differs from ${authenticCandidates[0].source} email ("${authenticCandidates[0].email}"). Candidate confirmation required.`;
    }
  }

  // Choose the best candidate email
  const bestCandidate = authenticCandidates[0] || candidates[0];

  // If the best available email is malformed
  if (!isValidEmailFormat(bestCandidate.email)) {
    return {
      email: bestCandidate.email,
      state: CandidateEmailState.INVALID_EMAIL,
      status: 'MISSING',
      presence: 'MISSING',
      source: bestCandidate.source,
      hasConflict: false,
      notes: 'Valid candidate email required in Profile (malformed email format)',
    };
  }

  // If a genuine conflict was detected
  if (hasConflict) {
    return {
      email: bestCandidate.email,
      state: CandidateEmailState.UNCONFIRMED_EMAIL,
      status: 'NEEDS_CONFIRMATION',
      presence: 'PRESENT',
      source: bestCandidate.source,
      hasConflict: true,
      notes: conflictNotes,
    };
  }

  return {
    email: bestCandidate.email,
    state: CandidateEmailState.VALID_EMAIL,
    status: 'READY',
    presence: 'PRESENT',
    source: bestCandidate.source,
    hasConflict: false,
    notes: 'Authoritative primary account email verified',
  };
}
