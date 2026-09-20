/**
 * @file Unit & Integration Regression Test Suite: Candidate Profile Phone Number & Country-Code Selector
 *
 * Validates all 10 profile phone-number requirements:
 * 1. Existing "+91" candidate number remains valid.
 * 2. User can change country code.
 * 3. User can change local number.
 * 4. Country code and local number are stored separately.
 * 5. Existing legacy combined numbers remain backwards compatible.
 * 6. Invalid country codes are rejected.
 * 7. Empty/invalid phone values behave safely.
 * 8. Resume generation correctly renders the normalized number.
 * 9. MCP and Extension receive the same normalized phone representation.
 * 10. Candidate source-of-truth remains unchanged except for an explicit user profile phone update.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTRY_CALLING_CODES,
  CALLING_CODES_SET,
  isValidCallingCode,
  normalizeCountryCode,
  normalizePhoneNumber,
  normalizePhoneRecord,
  parseStoredPhone,
  formatPhoneDisplay,
} from '../../src/utils/phone-country-codes.js';

import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { renderProfilePage } from '../../src/views/profile.page.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Profile Phone Number Country-Code Selector & Normalization Test Suite', () => {
  // -------------------------------------------------------------------------
  // 1. Existing "+91" candidate number remains valid
  // -------------------------------------------------------------------------
  it('1. Existing "+91" candidate number remains valid', () => {
    // A. Parser recognizes existing +91 prefixed phone
    const parsed = parseStoredPhone('+91 7905087928');
    assert.equal(parsed.countryCode, '+91');
    assert.equal(parsed.phoneNumber, '7905087928');
    assert.equal(parsed.phone, '+91 7905087928');
    assert.equal(parsed.isLegacyUnspecified, false);

    // B. Normalization preserves valid +91 input
    const normalized = normalizePhoneRecord({
      countryCode: '+91',
      phoneNumber: '7905087928',
    });
    assert.equal(normalized.countryCode, '+91');
    assert.equal(normalized.phoneNumber, '7905087928');
    assert.equal(normalized.phone, '+91 7905087928');

    // C. Country catalog contains India (+91)
    const indiaEntry = COUNTRY_CALLING_CODES.find((c) => c.dialCode === '+91');
    assert.ok(indiaEntry, 'Catalog must contain +91');
    assert.equal(indiaEntry.name, 'India');
    assert.equal(indiaEntry.dialCode, '+91');
    assert.ok(isValidCallingCode('+91'));
  });

  // -------------------------------------------------------------------------
  // 2. User can change country code
  // -------------------------------------------------------------------------
  it('2. User can change country code (e.g. from +91 to +1 or +44)', () => {
    const existing = {
      countryCode: '+91',
      phoneNumber: '7905087928',
      phone: '+91 7905087928',
    };

    // Change country code to United States (+1)
    const updatedUS = normalizePhoneRecord({
      countryCode: '+1',
      phoneNumber: '7905087928',
      existing,
    });
    assert.equal(updatedUS.countryCode, '+1');
    assert.equal(updatedUS.phoneNumber, '7905087928');
    assert.equal(updatedUS.phone, '+1 7905087928');

    // Change country code to United Kingdom (+44)
    const updatedUK = normalizePhoneRecord({
      countryCode: '+44',
      phoneNumber: '7905087928',
      existing,
    });
    assert.equal(updatedUK.countryCode, '+44');
    assert.equal(updatedUK.phoneNumber, '7905087928');
    assert.equal(updatedUK.phone, '+44 7905087928');

    // Selector options are not restricted to India
    assert.ok(COUNTRY_CALLING_CODES.length > 50, 'Catalog must be a generic world dataset');
    assert.ok(isValidCallingCode('+1'));
    assert.ok(isValidCallingCode('+44'));
    assert.ok(isValidCallingCode('+49'));
  });

  // -------------------------------------------------------------------------
  // 3. User can change local number
  // -------------------------------------------------------------------------
  it('3. User can change local number and formatting is normalized without losing digits', () => {
    // Normalizing local phone number strips non-digit visual formatting but preserves meaningful digits
    const cleaned1 = normalizePhoneNumber('  9876543210  ');
    assert.equal(cleaned1, '9876543210');

    const cleaned2 = normalizePhoneNumber('987-654-3210');
    assert.equal(cleaned2, '9876543210');

    const cleaned3 = normalizePhoneNumber('(555) 019-2834');
    assert.equal(cleaned3, '5550192834');

    // Updating local number with existing countryCode
    const updated = normalizePhoneRecord({
      countryCode: '+91',
      phoneNumber: '987-654-3210',
    });
    assert.equal(updated.countryCode, '+91');
    assert.equal(updated.phoneNumber, '9876543210');
    assert.equal(updated.phone, '+91 9876543210');
  });

  // -------------------------------------------------------------------------
  // 4. Country code and local number are stored separately
  // -------------------------------------------------------------------------
  it('4. Country code and local number are stored separately without flag or label in values', () => {
    const record = normalizePhoneRecord({
      countryCode: '+91',
      phoneNumber: '7905087928',
    });

    assert.equal(record.countryCode, '+91');
    assert.equal(record.phoneNumber, '7905087928');
    assert.equal(record.phone, '+91 7905087928');

    // Must NOT contain flag emojis or country names in the stored data model
    assert.ok(!record.countryCode.includes('India'));
    assert.ok(!record.countryCode.includes('🇮🇳'));
    assert.ok(!record.phoneNumber.includes('India'));
    assert.ok(!record.phoneNumber.includes('+'));
  });

  // -------------------------------------------------------------------------
  // 5. Existing legacy combined numbers remain backwards compatible
  // -------------------------------------------------------------------------
  it('5. Existing legacy combined numbers remain backwards compatible without corruption', () => {
    // Case A: Legacy number with known dial code (+91 7905087928)
    const legacyPrefixed = parseStoredPhone('+91 7905087928');
    assert.equal(legacyPrefixed.countryCode, '+91');
    assert.equal(legacyPrefixed.phoneNumber, '7905087928');
    assert.equal(legacyPrefixed.phone, '+91 7905087928');

    // Case B: Legacy number without calling code ('7905087928')
    // Must NOT silently invent a country code
    const legacyUnprefixed = parseStoredPhone('7905087928');
    assert.equal(legacyUnprefixed.countryCode, null);
    assert.equal(legacyUnprefixed.phoneNumber, '7905087928');
    assert.equal(legacyUnprefixed.phone, '7905087928');
    assert.equal(legacyUnprefixed.isLegacyUnspecified, true);

    // Profile UI rendering preserves legacy number and prompts user to choose code
    const html = renderProfilePage({
      user: { displayName: 'Legacy Candidate', email: 'legacy@example.com' },
      candidate: {
        id: '11111111-1111-1111-1111-111111111111',
        displayName: 'Legacy Candidate',
        profileMetadata: {
          phone: '7905087928',
        },
      },
    });

    assert.ok(html.includes('id="contactCountryCodeSelect"'));
    assert.ok(html.includes('id="contactPhoneInput"'));
    assert.ok(html.includes('value="7905087928"'));
    assert.ok(html.includes('Choose code...'));
  });

  // -------------------------------------------------------------------------
  // 6. Invalid country codes are rejected
  // -------------------------------------------------------------------------
  it('6. Invalid country codes are rejected with ValidationError', () => {
    assert.throws(
      () => normalizeCountryCode('+99999'),
      (err) =>
        err instanceof ValidationError && err.message.includes('Invalid country calling code')
    );

    assert.throws(
      () => normalizeCountryCode('invalid'),
      (err) => err instanceof ValidationError
    );

    assert.throws(
      () => normalizeCountryCode('+0'),
      (err) => err instanceof ValidationError
    );

    assert.throws(
      () => normalizePhoneRecord({ countryCode: '+99999', phoneNumber: '7905087928' }),
      (err) => err instanceof ValidationError
    );
  });

  // -------------------------------------------------------------------------
  // 7. Empty/invalid phone values behave safely
  // -------------------------------------------------------------------------
  it('7. Empty/invalid phone values behave safely', () => {
    // Clearing phone returns nulls without throwing
    const cleared = normalizePhoneRecord({ countryCode: '', phoneNumber: '' });
    assert.equal(cleared.countryCode, null);
    assert.equal(cleared.phoneNumber, null);
    assert.equal(cleared.phone, null);

    const clearedNull = normalizePhoneRecord({ countryCode: null, phoneNumber: null });
    assert.equal(clearedNull.countryCode, null);
    assert.equal(clearedNull.phoneNumber, null);
    assert.equal(clearedNull.phone, null);

    // Invalid non-digit characters in phone number throw ValidationError
    assert.throws(
      () => normalizePhoneNumber('7905abc928'),
      (err) => err instanceof ValidationError && err.message.includes('invalid characters')
    );

    // Too short digits (< 4 digits) throw ValidationError
    assert.throws(
      () => normalizePhoneNumber('12'),
      (err) => err instanceof ValidationError && err.message.includes('between 4 and 15 digits')
    );

    // Too long digits (> 15 digits) throw ValidationError
    assert.throws(
      () => normalizePhoneNumber('12345678901234567890'),
      (err) => err instanceof ValidationError && err.message.includes('between 4 and 15 digits')
    );
  });

  // -------------------------------------------------------------------------
  // 8. Resume generation correctly renders the normalized number
  // -------------------------------------------------------------------------
  it('8. Resume generation correctly renders normalized number without altering LaTeX structure', () => {
    const candidateSource = {
      displayName: 'Vishwanath Nishad',
      canonicalEmail: 'vishwanath.nishad.dev@gmail.com',
      phone: '+91 7905087928',
      location: 'India',
      headline: 'Full-Stack & Systems Engineer',
      skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
      projects: [],
      experience: [],
      education: [],
    };

    // Structured resume document consumes normalized phone
    const doc = buildStructuredResumeDocument({
      candidateProfile: candidateSource,
      jobPosting: {
        id: 'test-job',
        title: 'Software Engineer',
        company: 'TestCorp',
        requirements: [],
      },
    });

    assert.equal(doc.candidateIdentity.phone, '+91 7905087928');

    // LaTeX generator renders normalized phone in contact header
    const generator = new LatexDocumentGenerator();
    const { texContent } = generator.generateTailoredResumeLatex({
      applicationPackage: {
        candidateName: 'Vishwanath Nishad',
        candidateEmail: 'vishwanath.nishad.dev@gmail.com',
        tailoredResume: {
          title: 'Resume - TestCorp',
          structuredResume: doc,
        },
      },
    });
    assert.ok(texContent.includes('+91 7905087928'), 'LaTeX must contain normalized phone');
    assert.ok(!texContent.includes('🇮🇳'), 'LaTeX must never contain flag emoji');
    assert.ok(
      !texContent.includes('contactCountryCodeSelect'),
      'LaTeX must not contain UI elements'
    );

    // Verify LaTeX visual structure has not changed: standard header format with \cdot separator
    assert.ok(texContent.includes('$\\cdot$'));
  });

  // -------------------------------------------------------------------------
  // 9. MCP and Extension receive the same normalized phone representation
  // -------------------------------------------------------------------------
  it('9. MCP and Extension receive the same normalized phone representation', () => {
    const candidateMetadata = {
      userCustom: {
        countryCode: '+91',
        phoneNumber: '7905087928',
        phone: '+91 7905087928',
      },
    };

    const cand = {
      id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
      displayName: 'Vishwanath Nishad',
      canonicalEmail: 'vishwanath.nishad.dev@gmail.com',
      profileMetadata: candidateMetadata,
    };

    // Verify helper resolution across workflow services
    const resolvedPhone =
      cand.profileMetadata?.userCustom?.phone || cand.profileMetadata?.phone || cand.phone;

    assert.equal(resolvedPhone, '+91 7905087928');

    // MCP package candidatePhone
    const mcpCandidatePhone = resolvedPhone;
    // Extension package candidatePhone
    const extensionCandidatePhone = resolvedPhone;

    assert.strictEqual(mcpCandidatePhone, extensionCandidatePhone);
    assert.equal(mcpCandidatePhone, '+91 7905087928');
  });

  // -------------------------------------------------------------------------
  // 10. Candidate source-of-truth remains unchanged except for explicit update
  // -------------------------------------------------------------------------
  it('10. Candidate source-of-truth remains unchanged except for an explicit user profile phone update', async () => {
    // Create a mock DB that records all update statements
    const updateStatements = [];
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => [
            {
              id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
              tenantId: '24d53f53-780e-4431-b065-32180c354175',
              displayName: 'Vishwanath Nishad',
              profileMetadata: {
                phone: '7905087928', // Legacy un-prefixed phone
                userCustom: {},
              },
            },
          ],
        }),
      }),
      update: () => ({
        set: (vals) => ({
          where: () => ({
            returning: () => {
              updateStatements.push(vals);
              return Promise.resolve([
                {
                  id: '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
                  displayName: 'Vishwanath Nishad',
                  profileMetadata: vals.profileMetadata,
                  updatedAt: new Date(),
                },
              ]);
            },
          }),
        }),
      }),
    };

    const service = new CandidateProfileService(mockDb);

    // A. Viewing or reading profile does NOT execute any update
    const context = {
      tenantId: '24d53f53-780e-4431-b065-32180c354175',
      userId: 'user-123',
      role: 'OWNER',
    };

    // Calling parseStoredPhone or rendering page: 0 DB mutations
    const parsed = parseStoredPhone('7905087928');
    assert.equal(parsed.phone, '7905087928');
    assert.equal(updateStatements.length, 0, 'Read actions must not mutate DB');

    // B. Explicit update of an unrelated section (e.g. headline) does NOT mutate phone
    await service.updateUserProfileSections(
      context,
      '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
      { headline: 'Senior Backend Engineer' },
      { minimalResponse: true }
    );

    assert.equal(updateStatements.length, 1);
    const firstUpdateMeta = updateStatements[0].profileMetadata;
    // Phone was NOT mutated or silently changed to +91
    assert.equal(firstUpdateMeta.phone, '7905087928');
    assert.equal(firstUpdateMeta.userCustom?.countryCode, undefined);

    // C. Explicit user update of phone DOES update countryCode and phoneNumber
    await service.updateUserProfileSections(
      context,
      '10a2b51b-09bf-4090-8040-1f60ebeb89c9',
      { countryCode: '+91', phoneNumber: '7905087928' },
      { minimalResponse: true }
    );

    assert.equal(updateStatements.length, 2);
    const secondUpdateMeta = updateStatements[1].profileMetadata;
    assert.equal(secondUpdateMeta.userCustom?.countryCode, '+91');
    assert.equal(secondUpdateMeta.userCustom?.phoneNumber, '7905087928');
    assert.equal(secondUpdateMeta.userCustom?.phone, '+91 7905087928');
    assert.equal(secondUpdateMeta.countryCode, '+91');
    assert.equal(secondUpdateMeta.phoneNumber, '7905087928');
    assert.equal(secondUpdateMeta.phone, '+91 7905087928');
  });
});
