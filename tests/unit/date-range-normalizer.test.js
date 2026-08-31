import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateRangeNormalizer } from '../../src/utils/date-range-normalizer.js';

describe('DateRangeNormalizer', () => {
  it('parses Month Year – Month Year ("June 2024 – September 2024")', () => {
    const res = DateRangeNormalizer.normalize('June 2024 – September 2024');
    assert.equal(res.startDate, '2024-06');
    assert.equal(res.endDate, '2024-09');
    assert.equal(res.isCurrent, false);
    assert.equal(res.rawDateRange, 'June 2024 – September 2024');
    assert.equal(res.startYear, 2024);
    assert.equal(res.startMonth, 6);
    assert.equal(res.endYear, 2024);
    assert.equal(res.endMonth, 9);
    assert.equal(res.isUncertain, false);
  });

  it('parses numeric mm/yyyy - mm/yyyy ("06/2024 - 09/2024")', () => {
    const res = DateRangeNormalizer.normalize('06/2024 - 09/2024');
    assert.equal(res.startDate, '2024-06');
    assert.equal(res.endDate, '2024-09');
    assert.equal(res.isCurrent, false);
  });

  it('parses year to Present ("2022 - Present")', () => {
    const res = DateRangeNormalizer.normalize('2022 - Present');
    assert.equal(res.startDate, '2022');
    assert.equal(res.endDate, null);
    assert.equal(res.isCurrent, true);
    assert.equal(res.startYear, 2022);
    assert.equal(res.endYear, null);
  });

  it('parses mm/yyyy to Present ("05/2021 - Present")', () => {
    const res = DateRangeNormalizer.normalize('05/2021 - Present');
    assert.equal(res.startDate, '2021-05');
    assert.equal(res.endDate, null);
    assert.equal(res.isCurrent, true);
  });

  it('parses season ("Summer 2024")', () => {
    const res = DateRangeNormalizer.normalize('Summer 2024');
    assert.equal(res.startDate, '2024-06');
    assert.equal(res.endDate, '2024-08');
    assert.equal(res.isCurrent, false);
  });

  it('parses single year ("2024")', () => {
    const res = DateRangeNormalizer.normalize('2024');
    assert.equal(res.startDate, '2024');
    assert.equal(res.endDate, null);
    assert.equal(res.isCurrent, false);
  });

  it('parses year range ("2024 – 2025")', () => {
    const res = DateRangeNormalizer.normalize('2024 – 2025');
    assert.equal(res.startDate, '2024');
    assert.equal(res.endDate, '2025');
    assert.equal(res.isCurrent, false);
  });

  it('parses quarters ("Q1 2023 - Q3 2023")', () => {
    const res = DateRangeNormalizer.normalize('Q1 2023 - Q3 2023');
    assert.equal(res.startDate, '2023-01');
    assert.equal(res.endDate, '2023-09');
    assert.equal(res.isCurrent, false);
  });

  it('handles empty and unparseable input gracefully', () => {
    const emptyRes = DateRangeNormalizer.normalize('');
    assert.equal(emptyRes.startDate, null);
    assert.equal(emptyRes.endDate, null);
    assert.equal(emptyRes.isUncertain, true);

    const gibberish = DateRangeNormalizer.normalize('Random text that is not a date');
    assert.equal(gibberish.startDate, null);
    assert.equal(gibberish.endDate, null);
    assert.equal(gibberish.isUncertain, true);
    assert.equal(gibberish.rawDateRange, 'Random text that is not a date');
  });
});
