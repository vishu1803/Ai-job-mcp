/**
 * @file Unit Tests for Candidate Career Preferences & Profile Schemas (P14-004C).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CareerPreferencesSchema,
  UpdateCareerPreferencesInputSchema,
  CandidateCareerProfileSchema,
} from '../../src/domain/candidate/career-preferences.schemas.js';

describe('Career Preferences & Profile Domain Schemas (P14-004C)', () => {
  it('1. parses default CareerPreferences with valid empty shape', () => {
    const parsed = CareerPreferencesSchema.parse({});
    assert.deepEqual(parsed.targetRoles, []);
    assert.deepEqual(parsed.preferredLocations, []);
    assert.equal(parsed.remotePreference, 'FLEXIBLE');
    assert.deepEqual(parsed.employmentTypes, ['FULL_TIME']);
    assert.equal(parsed.salaryFloor, null);
    assert.equal(parsed.salaryCurrency, 'USD');
    assert.equal(parsed.visaSponsorshipRequired, false);
    assert.equal(parsed.relocationPreference, 'REMOTE_ONLY');
  });

  it('2. validates complete customized career preferences', () => {
    const input = {
      targetRoles: ['Staff Backend Engineer', 'Distributed Systems Architect'],
      preferredLocations: ['Remote', 'San Francisco, CA'],
      remotePreference: 'REMOTE_ONLY',
      employmentTypes: ['FULL_TIME', 'CONTRACT'],
      salaryFloor: 195000,
      salaryCurrency: 'USD',
      industries: ['FinTech', 'Developer Tools'],
      companiesToAvoid: ['Unethical Corp'],
      companiesToPrioritize: ['Stripe', 'Datadog'],
      preferredTechStack: ['Node.js', 'Fastify', 'PostgreSQL', 'Docker'],
      workAuthorization: ['United States', 'India'],
      visaSponsorshipRequired: false,
      availabilityDate: 'Immediate',
      relocationPreference: 'REMOTE_ONLY',
    };

    const parsed = CareerPreferencesSchema.parse(input);
    assert.equal(parsed.salaryFloor, 195000);
    assert.equal(parsed.remotePreference, 'REMOTE_ONLY');
    assert.equal(parsed.targetRoles.length, 2);
    assert.equal(parsed.preferredTechStack.length, 4);
    assert.equal(parsed.workAuthorization.length, 2);
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
    };

    const parsed = UpdateCareerPreferencesInputSchema.parse(partial);
    assert.equal(parsed.salaryFloor, 220000);
    assert.equal(parsed.remotePreference, 'REMOTE_FIRST');
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
});
