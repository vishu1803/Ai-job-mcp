import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CareerStatusDerivation } from '../../src/utils/career-status-derivation.js';

describe('CareerStatusDerivation', () => {
  it('guarantees historical internship never overwrites professional headline', () => {
    const headline = 'Full-Stack & Backend Developer';
    const pastInternshipExp = [
      {
        company: 'FTV Saloon',
        title: 'Full Stack Developer Intern',
        isCurrent: false,
        rawDateRange: 'June 2024 – September 2024',
      },
    ];

    const currentEmployment = CareerStatusDerivation.deriveCurrentEmployment(pastInternshipExp);
    assert.equal(currentEmployment, null);

    const currentRole = CareerStatusDerivation.resolveCurrentRole({
      headline,
      currentEmployment,
    });
    assert.equal(currentRole, 'Full-Stack & Backend Developer');

    const status = CareerStatusDerivation.deriveCareerStatus({
      experiences: pastInternshipExp,
      professionalTenureMonths: 0,
    });
    assert.equal(status, 'FRESHER');
  });

  it('derives active full-time employment correctly', () => {
    const activeExp = [
      {
        company: 'Stripe',
        title: 'Backend Engineer',
        isCurrent: true,
        startDate: '2023-01',
      },
    ];

    const currentEmployment = CareerStatusDerivation.deriveCurrentEmployment(activeExp);
    assert.deepEqual(currentEmployment, {
      title: 'Backend Engineer',
      company: 'Stripe',
      employmentType: 'FULL_TIME',
      startDate: '2023-01',
      location: null,
    });

    const status = CareerStatusDerivation.deriveCareerStatus({
      experiences: activeExp,
      professionalTenureMonths: 20,
    });
    assert.equal(status, 'EMPLOYED');
  });

  it('derives seniority tiers based on verified tenure', () => {
    assert.equal(
      CareerStatusDerivation.deriveSeniority({ professionalTenureYears: 0 }),
      'ENTRY_LEVEL'
    );
    assert.equal(CareerStatusDerivation.deriveSeniority({ professionalTenureYears: 1 }), 'JUNIOR');
    assert.equal(
      CareerStatusDerivation.deriveSeniority({ professionalTenureYears: 3 }),
      'MID_LEVEL'
    );
    assert.equal(CareerStatusDerivation.deriveSeniority({ professionalTenureYears: 5 }), 'SENIOR');
    assert.equal(CareerStatusDerivation.deriveSeniority({ professionalTenureYears: 9 }), 'LEAD');
  });
});
