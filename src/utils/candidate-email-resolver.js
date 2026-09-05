/**
 * @file Candidate Email Resolution & Synthetic Domain Detection (P14-005AW).
 *
 * Implements sovereign candidate email resolution policy across the platform:
 * 1. Identifies synthetic, RFC 2606 reserved, or test placeholder domains.
 * 2. Enforces authentic candidate identity precedence:
 *    - Genuine non-synthetic canonicalEmail
 *    - Genuine non-synthetic linked user account email (users.email)
 *    - Genuine non-synthetic parsed resume contact email
 * 3. Prevents legacy fixture values (e.g. vishw@example.com) from leaking
 *    into application artifacts or profile surfaces.
 */

import { ValidationError } from '../errors/index.js';

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
 * Resolves the authentic candidate profile email, preventing test fixtures or dummy defaults
 * (such as vishw@example.com or candidate@example.com) from overriding genuine user account
 * or parsed resume emails.
 *
 * Precedence:
 * 1. candidate.canonicalEmail (if non-synthetic)
 * 2. linked user.email from users table (if non-synthetic)
 * 3. candidate.profileMetadata.resumeData.identity.email (if non-synthetic)
 * 4. Synthetic fallback only when no non-synthetic email exists (for mock/unit test environments)
 *
 * @param {object} cand Candidate record
 * @param {string|null|undefined} userEmail User account email
 * @param {object} [options={}]
 * @param {boolean} [options.allowNullable=false] If true, returns null instead of throwing ValidationError when no email exists.
 * @returns {string|null} Resolved email
 */
export function resolveCandidateEmail(cand, userEmail, options = {}) {
  const resumeEmail = cand?.profileMetadata?.resumeData?.identity?.email;
  const canonical = cand?.canonicalEmail?.trim();
  const linkedUserEmail = userEmail?.trim();
  const parsedResumeEmail = resumeEmail ? String(resumeEmail).trim() : null;

  // 1. Prioritize authentic non-synthetic emails
  if (canonical && !isSyntheticEmail(canonical)) {
    return canonical;
  }
  if (linkedUserEmail && !isSyntheticEmail(linkedUserEmail)) {
    return linkedUserEmail;
  }
  if (parsedResumeEmail && !isSyntheticEmail(parsedResumeEmail)) {
    return parsedResumeEmail;
  }

  // 2. In purely synthetic test environments, fall back to available test fixture emails
  if (canonical) return canonical;
  if (linkedUserEmail) return linkedUserEmail;
  if (parsedResumeEmail) return parsedResumeEmail;

  if (options && options.allowNullable) {
    return null;
  }

  throw new ValidationError(
    'Candidate profile email is required to prepare a job application.',
    'MISSING_CANDIDATE_EMAIL'
  );
}
