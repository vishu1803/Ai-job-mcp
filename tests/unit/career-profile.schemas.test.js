/**
 * @file Unit Tests for Candidate Career Preferences & Profile Schemas (P14-004C).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CareerPreferencesSchema,
  UpdateCareerPreferencesInputSchema,
  CandidateCareerProfileSchema,
  NoticePeriodEnum,
  normalizeNoticePeriod,
  formatNoticePeriodLabel,
  WorkAuthorizationRecordSchema,
} from '../../src/domain/candidate/career-preferences.schemas.js';

describe('Career Preferences & Profile Domain Schemas (P14-004C)', () => {
  it('1. parses default CareerPreferences with safe honest empty shape (no dangerous concrete defaults)', () => {
    const parsed = CareerPreferencesSchema.parse({});
    assert.deepEqual(parsed.targetRoles, []);
    assert.deepEqual(parsed.preferredLocations, []);
    assert.equal(parsed.remotePreference, null, 'remotePreference must be null when unset');
    assert.deepEqual(parsed.employmentTypes, [], 'employmentTypes must be empty array when unset');
    assert.equal(parsed.salaryFloor, null);
    assert.equal(parsed.targetSalary, null);
    assert.equal(parsed.salaryCurrency, null, 'salaryCurrency must be null when unset (not defaulted to USD)');
    assert.equal(parsed.visaSponsorshipRequired, null, 'visaSponsorshipRequired must be null when unset (not defaulted to false)');
    assert.equal(parsed.relocationPreference, null, 'relocationPreference must be null when unset (not defaulted to REMOTE_ONLY)');
    assert.equal(parsed.noticePeriod, null, 'noticePeriod must be null when unset');
    assert.equal(parsed.timezone, null, 'timezone must be null when unset');
  });

  it('2. validates complete customized career preferences', () => {
    const input = {
      targetRoles: ['Staff Backend Engineer', 'Distributed Systems Architect'],
      preferredLocations: ['Remote', 'San Francisco, CA'],
      remotePreference: 'REMOTE_ONLY',
      employmentTypes: ['FULL_TIME', 'CONTRACT'],
      salaryFloor: 195000,
      targetSalary: 220000,
      salaryCurrency: 'USD',
      compensationPeriod: 'YEARLY',
      compensationType: 'TOTAL_COMP',
      industries: ['FinTech', 'Developer Tools'],
      companiesToAvoid: ['Unethical Corp'],
      companiesToPrioritize: ['Stripe', 'Datadog'],
      preferredTechStack: ['Node.js', 'Fastify', 'PostgreSQL', 'Docker'],
      workAuthorization: ['United States', 'India'],
      visaSponsorshipRequired: false,
      availabilityDate: 'Immediate',
      noticePeriod: 'IMMEDIATE',
      relocationPreference: 'REMOTE_ONLY',
      timezone: 'America/Los_Angeles',
    };

    const parsed = CareerPreferencesSchema.parse(input);
    assert.equal(parsed.salaryFloor, 195000);
    assert.equal(parsed.targetSalary, 220000);
    assert.equal(parsed.compensationPeriod, 'YEARLY');
    assert.equal(parsed.remotePreference, 'REMOTE_ONLY');
    assert.equal(parsed.noticePeriod, 'IMMEDIATE');
    assert.equal(parsed.targetRoles.length, 2);
    assert.equal(parsed.preferredTechStack.length, 4);
    assert.equal(parsed.workAuthorization.length, 2);
    assert.equal(parsed.timezone, 'America/Los_Angeles');
  });

  it('3. rejects invalid currency code and negative salary floors', () => {
    assert.throws(() => {
      CareerPreferencesSchema.parse({ salaryFloor: -1000 });
    });

    assert.throws(() => {
      CareerPreferencesSchema.parse({ salaryCurrency: 'US' }); // must be 3 chars
    });
  });

  it('4. validates UpdateCareerPreferencesInputSchema for partial updates', () => {
    const partial = {
      targetRoles: ['Principal Architect'],
      salaryFloor: 220000,
      remotePreference: 'REMOTE_FIRST',
      noticePeriod: '30_DAYS',
    };

    const parsed = UpdateCareerPreferencesInputSchema.parse(partial);
    assert.equal(parsed.salaryFloor, 220000);
    assert.equal(parsed.remotePreference, 'REMOTE_FIRST');
    assert.equal(parsed.noticePeriod, '30_DAYS');
    assert.deepEqual(parsed.targetRoles, ['Principal Architect']);
  });

  it('5. validates CandidateCareerProfileSchema complete view', () => {
    const profileInput = {
      candidateId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      tenantId: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
      displayName: 'Alex Mercer',
      headline: 'Staff Distributed Systems Engineer',
      summary: 'Passionate about high-throughput distributed systems.',
      currentRole: 'Senior Backend Engineer',
      seniority: 'SENIOR',
      yearsOfExperience: 8,
      canonicalEmail: 'alex@example.com',
      portfolioLinks: [{ label: 'GITHUB_APP', url: 'https://github.com/alexmercer' }],
      jobPreferences: {
        targetRoles: ['Staff Engineer'],
        remotePreference: 'REMOTE_ONLY',
        salaryFloor: 200000,
      },
      verifiedSkillsSummary: ['Node.js', 'Fastify', 'PostgreSQL'],
    };

    const parsed = CandidateCareerProfileSchema.parse(profileInput);
    assert.equal(parsed.displayName, 'Alex Mercer');
    assert.equal(parsed.verifiedSkillsSummary.length, 3);
    assert.equal(parsed.jobPreferences.salaryFloor, 200000);
  });

  it('6. distinguishes NOT_SET and UNKNOWN from explicit NO for visa sponsorship', () => {
    const parsedNotSet = CareerPreferencesSchema.parse({ visaSponsorshipRequired: 'NOT_SET' });
    assert.equal(parsedNotSet.visaSponsorshipRequired, 'NOT_SET');
    assert.notEqual(parsedNotSet.visaSponsorshipRequired, false);

    const parsedUnknown = CareerPreferencesSchema.parse({ visaSponsorshipRequired: 'UNKNOWN' });
    assert.equal(parsedUnknown.visaSponsorshipRequired, 'UNKNOWN');
    assert.notEqual(parsedUnknown.visaSponsorshipRequired, false);

    const parsedNo = CareerPreferencesSchema.parse({ visaSponsorshipRequired: false });
    assert.equal(parsedNo.visaSponsorshipRequired, false);

    const parsedYes = CareerPreferencesSchema.parse({ visaSponsorshipRequired: true });
    assert.equal(parsedYes.visaSponsorshipRequired, true);
  });

  it('7. validates NoticePeriodEnum and normalizer helpers', () => {
    assert.equal(normalizeNoticePeriod('immediate'), 'IMMEDIATE');
    assert.equal(normalizeNoticePeriod('Immediately'), 'IMMEDIATE');
    assert.equal(normalizeNoticePeriod('1-2 weeks'), '1_TO_2_WEEKS');
    assert.equal(normalizeNoticePeriod('30 days'), '30_DAYS');
    assert.equal(normalizeNoticePeriod('1 month'), '30_DAYS');
    assert.equal(normalizeNoticePeriod('60 days'), '60_DAYS');
    assert.equal(normalizeNoticePeriod('90 days'), '90_DAYS');
    assert.equal(normalizeNoticePeriod('45 calendar days'), 'CUSTOM');

    assert.equal(formatNoticePeriodLabel('IMMEDIATE'), 'Immediate');
    assert.equal(formatNoticePeriodLabel('30_DAYS'), '30 days');
    assert.equal(formatNoticePeriodLabel('CUSTOM', '45 days'), '45 days');
  });

  it('8. validates structured WorkAuthorizationRecordSchema', () => {
    const authRecord = {
      country: 'United States',
      status: 'STUDENT_VISA_OPT_CPT',
      sponsorshipRequired: true,
      visaType: 'F-1 OPT',
      expiryDate: '2027-06-30',
      notes: 'Eligible for STEM extension',
    };

    const parsed = WorkAuthorizationRecordSchema.parse(authRecord);
    assert.equal(parsed.country, 'United States');
    assert.equal(parsed.status, 'STUDENT_VISA_OPT_CPT');
    assert.equal(parsed.sponsorshipRequired, true);

    const prefs = CareerPreferencesSchema.parse({
      workAuthorization: [authRecord, 'India'],
    });
    assert.equal(prefs.workAuthorization.length, 2);
  });

  it('9. validates structured compensation support with period and type', () => {
    const prefs = CareerPreferencesSchema.parse({
      salaryFloor: 150000,
      targetSalary: 180000,
      salaryCurrency: 'EUR',
      compensationPeriod: 'YEARLY',
      compensationType: 'BASE_PLUS_BONUS',
    });

    assert.equal(prefs.salaryFloor, 150000);
    assert.equal(prefs.targetSalary, 180000);
    assert.equal(prefs.salaryCurrency, 'EUR');
    assert.equal(prefs.compensationPeriod, 'YEARLY');
    assert.equal(prefs.compensationType, 'BASE_PLUS_BONUS');
  });

  it('10. backward compatibility: existing legacy profiles continue loading cleanly', () => {
    const legacyPreferences = {
      targetRoles: ['Backend Engineer'],
      remotePreference: 'FLEXIBLE',
      employmentTypes: ['FULL_TIME'],
      salaryFloor: 120000,
      salaryCurrency: 'USD',
      visaSponsorshipRequired: false,
      relocationPreference: 'REMOTE_ONLY',
    };

    const parsed = CareerPreferencesSchema.parse(legacyPreferences);
    assert.equal(parsed.remotePreference, 'FLEXIBLE');
    assert.deepEqual(parsed.employmentTypes, ['FULL_TIME']);
    assert.equal(parsed.salaryCurrency, 'USD');
    assert.equal(parsed.visaSponsorshipRequired, false);
    assert.equal(parsed.relocationPreference, 'REMOTE_ONLY');
    assert.equal(parsed.noticePeriod, null);
    assert.equal(parsed.targetSalary, null);
  });
});
