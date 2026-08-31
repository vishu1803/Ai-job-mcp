import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TenureCalculator } from '../../src/utils/tenure-calculator.js';

describe('TenureCalculator', () => {
  it('calculates discrete 4-month internship accurately', () => {
    const experiences = [
      {
        company: 'Tech Corp',
        title: 'Software Developer Intern',
        rawDateRange: 'June 2024 – September 2024',
        isCurrent: false,
      },
    ];

    const res = TenureCalculator.calculateTenure(experiences);
    assert.equal(res.totalExperienceMonths, 4); // June, July, August, September = 4 months
    assert.equal(res.totalExperienceYears, 0.3);
    assert.equal(res.professionalTenureMonths, 0); // Internship excluded from professional tenure
    assert.equal(res.professionalTenureYears, 0);
    assert.equal(res.softwareEngineeringMonths, 4);
    assert.equal(res.hasCurrentEmployment, false);
  });

  it('merges overlapping roles without double-counting', () => {
    const experiences = [
      {
        company: 'Company A',
        title: 'Full Stack Engineer',
        rawDateRange: '01/2022 - 12/2023', // 24 months (2022-01 to 2023-12)
        isCurrent: false,
      },
      {
        company: 'Company B',
        title: 'Backend Consultant',
        rawDateRange: '06/2022 - 06/2023', // Overlapping interval
        isCurrent: false,
      },
    ];

    const res = TenureCalculator.calculateTenure(experiences);
    assert.equal(res.totalExperienceMonths, 24);
    assert.equal(res.professionalTenureMonths, 24);
    assert.equal(res.totalExperienceYears, 2);
  });

  it('sums sequential non-overlapping tenures correctly', () => {
    const experiences = [
      {
        company: 'Startup A',
        title: 'Junior Developer',
        rawDateRange: '01/2020 - 12/2021', // 24 months
        isCurrent: false,
      },
      {
        company: 'Scaleup B',
        title: 'Senior Developer',
        rawDateRange: '01/2022 - 12/2023', // 24 months
        isCurrent: false,
      },
    ];

    const res = TenureCalculator.calculateTenure(experiences);
    assert.equal(res.totalExperienceMonths, 48);
    assert.equal(res.totalExperienceYears, 4);
    assert.equal(res.professionalTenureMonths, 48);
    assert.equal(res.professionalTenureYears, 4);
  });

  it('handles empty experience array safely', () => {
    const res = TenureCalculator.calculateTenure([]);
    assert.equal(res.totalExperienceMonths, 0);
    assert.equal(res.totalExperienceYears, 0);
    assert.equal(res.professionalTenureMonths, 0);
    assert.equal(res.professionalTenureYears, 0);
    assert.equal(res.hasCurrentEmployment, false);
  });
});
