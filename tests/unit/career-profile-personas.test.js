/**
 * @file Unit tests for 12 Candidate Career Personas (P14-004D / ARCH-056).
 *
 * Tests:
 * 1. Fresh graduate with past internships only
 * 2. Current full-time employee with past internships
 * 3. Student currently enrolled with active education
 * 4. Freelancer / Contractor
 * 5. Career transitioner with non-tech past experience
 * 6. Senior / Lead with 10+ years experience
 * 7. Overlapping employment dates (no double counting)
 * 8. Malformed date strings ("Summer 2024", "June 2024 – September 2024", "2024")
 * 9. Education coursework isolation (no fake institutions)
 * 10. Multi-part institution and location formatting
 * 11. Python stdlib and internal module noise filtering
 * 12. MCP semantic consistency between get_candidate_profile and get_career_profile
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DateRangeNormalizer } from '../../src/utils/date-range-normalizer.js';
import { EducationNormalizer } from '../../src/utils/education-normalizer.js';
import { TenureCalculator } from '../../src/utils/tenure-calculator.js';
import { CareerStatusDerivation } from '../../src/utils/career-status-derivation.js';
import { ImportScanner } from '../../src/extractors/github/code-scanners/import-scanner.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('Career Profile 12 Personas & Normalization Pipeline', () => {
  // Persona 1: Fresh Graduate with Past Internship Only
  it('Persona 1: Fresh graduate with historical internship retains headline as currentRole and null currentEmployment', () => {
    const rawDates = 'June 2024 – September 2024';
    const dateNorm = DateRangeNormalizer.normalize(rawDates);

    assert.equal(dateNorm.isCurrent, false);
    assert.equal(dateNorm.startDate, '2024-06');
    assert.equal(dateNorm.endDate, '2024-09');

    const experiences = [
      {
        company: 'Tech Corp',
        title: 'Full Stack Developer Intern',
        employmentType: TenureCalculator.inferEmploymentType({
          title: 'Full Stack Developer Intern',
        }),
        startDate: dateNorm.startDate,
        endDate: dateNorm.endDate,
        isCurrent: dateNorm.isCurrent,
        rawDateRange: dateNorm.rawDateRange,
      },
    ];

    const currentEmployment = CareerStatusDerivation.deriveCurrentEmployment(experiences);
    assert.equal(
      currentEmployment,
      null,
      'Past internship must not populate active currentEmployment'
    );

    const currentRole = CareerStatusDerivation.resolveCurrentRole({
      userCustomRole: null,
      headline: 'Full-Stack & Backend Developer',
      currentEmployment,
    });
    assert.equal(
      currentRole,
      'Full-Stack & Backend Developer',
      'Headline must be preserved as currentRole'
    );

    const tenure = TenureCalculator.calculateTenure(experiences);
    assert.equal(tenure.totalExperienceMonths, 4);
    assert.equal(
      tenure.professionalTenureMonths,
      0,
      'Internships are excluded from professional non-intern tenure'
    );

    const education = [
      {
        institution: 'Rajkiya Engineering College',
        degree: 'Bachelor of Technology',
        isCurrent: false,
        endDate: '2024',
      },
    ];

    const careerStatus = CareerStatusDerivation.deriveCareerStatus({
      experiences,
      education,
      professionalTenureMonths: tenure.professionalTenureMonths,
    });
    assert.equal(careerStatus, 'FRESHER');

    const seniority = CareerStatusDerivation.deriveSeniority({
      experiences,
      education,
      professionalTenureYears: tenure.professionalTenureYears,
    });
    assert.equal(seniority, 'ENTRY_LEVEL');
  });

  // Persona 2: Current Full-Time Employee with Past Internships
  it('Persona 2: Active full-time engineer correctly populates currentEmployment and EMPLOYED status', () => {
    const experiences = [
      {
        company: 'Acme SaaS',
        title: 'Software Engineer',
        employmentType: 'FULL_TIME',
        startDate: '2023-01',
        endDate: null,
        isCurrent: true,
      },
      {
        company: 'Startup Lab',
        title: 'Software Engineering Intern',
        employmentType: 'INTERNSHIP',
        startDate: '2022-06',
        endDate: '2022-08',
        isCurrent: false,
      },
    ];

    const currentEmployment = CareerStatusDerivation.deriveCurrentEmployment(experiences);
    assert.ok(currentEmployment);
    assert.equal(currentEmployment.title, 'Software Engineer');
    assert.equal(currentEmployment.company, 'Acme SaaS');

    const currentRole = CareerStatusDerivation.resolveCurrentRole({
      headline: 'Backend Developer',
      currentEmployment,
    });
    assert.equal(currentRole, 'Backend Developer');

    const careerStatus = CareerStatusDerivation.deriveCareerStatus({ experiences });
    assert.equal(careerStatus, 'EMPLOYED');
  });

  // Persona 3: Student Currently Enrolled
  it('Persona 3: Student with active education without full-time job is classified as STUDENT', () => {
    const education = [
      {
        institution: 'State University',
        degree: 'Bachelor of Science in Computer Science',
        startDate: '2022-09',
        endDate: null,
        isCurrent: true,
      },
    ];

    const careerStatus = CareerStatusDerivation.deriveCareerStatus({
      experiences: [],
      education,
      professionalTenureMonths: 0,
    });
    assert.equal(careerStatus, 'STUDENT');
  });

  // Persona 4: Freelancer / Independent Contractor
  it('Persona 4: Freelance contractor is classified with FREELANCE/CONTRACTOR status', () => {
    const experiences = [
      {
        company: 'Self-Employed',
        title: 'Freelance Cloud Architect',
        employmentType: 'FREELANCE',
        startDate: '2023-01',
        endDate: null,
        isCurrent: true,
      },
    ];

    const careerStatus = CareerStatusDerivation.deriveCareerStatus({ experiences });
    assert.equal(careerStatus, 'FREELANCE');
  });

  // Persona 5: Career Transitioner
  it('Persona 5: Career transitioner differentiates software engineering tenure vs total tenure', () => {
    const experiences = [
      {
        company: 'Old Corp',
        title: 'Operations Manager',
        employmentType: 'FULL_TIME',
        startDate: '2018-01',
        endDate: '2022-01',
        isCurrent: false,
      },
      {
        company: 'Tech Studio',
        title: 'Junior Full Stack Developer',
        employmentType: 'FULL_TIME',
        startDate: '2023-01',
        endDate: '2024-01',
        isCurrent: false,
      },
    ];

    const tenure = TenureCalculator.calculateTenure(experiences);
    assert.ok(tenure.totalExperienceMonths >= 60);
    assert.equal(tenure.softwareEngineeringMonths, 13);
  });

  // Persona 6: Senior / Staff Engineer with 10+ Years
  it('Persona 6: Senior engineer with > 8 years achieves SENIOR/STAFF seniority', () => {
    const experiences = [
      {
        company: 'Enterprise MegaCorp',
        title: 'Staff Infrastructure Engineer',
        employmentType: 'FULL_TIME',
        startDate: '2014-01',
        endDate: null,
        isCurrent: true,
      },
    ];

    const tenure = TenureCalculator.calculateTenure(experiences);
    const seniority = CareerStatusDerivation.deriveSeniority({
      experiences,
      professionalTenureYears: tenure.professionalTenureYears,
    });
    assert.ok(['SENIOR', 'LEAD', 'STAFF'].includes(seniority));
  });

  // Persona 7: Overlapping Employment Dates (No Double Counting)
  it('Persona 7: Overlapping employment dates merge continuous calendar intervals', () => {
    const experiences = [
      {
        company: 'Company A',
        title: 'Backend Engineer',
        employmentType: 'FULL_TIME',
        startDate: '2023-01',
        endDate: '2023-08',
        isCurrent: false,
      },
      {
        company: 'Company B',
        title: 'Part-time Consultant',
        employmentType: 'PART_TIME',
        startDate: '2023-04',
        endDate: '2023-12',
        isCurrent: false,
      },
    ];

    const tenure = TenureCalculator.calculateTenure(experiences);
    // 2023-01 to 2023-12 is exactly 12 months, not 8 + 9 = 17 months
    assert.equal(tenure.totalExperienceMonths, 12);
  });

  // Persona 8: Malformed Date Formats
  it('Persona 8: Normalizes varied real-world date formats safely', () => {
    const cases = [
      { input: 'Summer 2024', start: '2024-06', end: '2024-08', isCurrent: false },
      { input: '06/2024 - 09/2024', start: '2024-06', end: '2024-09', isCurrent: false },
      { input: '2022 - Present', start: '2022', end: null, isCurrent: true },
      { input: 'Q1 2023 - Q3 2023', start: '2023-01', end: '2023-09', isCurrent: false },
    ];

    for (const c of cases) {
      const res = DateRangeNormalizer.normalize(c.input);
      assert.equal(res.startDate, c.start);
      assert.equal(res.endDate, c.end);
      assert.equal(res.isCurrent, c.isCurrent);
    }
  });

  // Persona 9: Education Coursework Isolation
  it('Persona 9: Isolates Relevant Coursework tokens without generating fake degrees', () => {
    const rawEducationText = `
Bachelor of Technology in Information Technology
Rajkiya Engineering College, Sonbhadra
Relevant Coursework: Operating Systems, Data Structures & Algorithms, Computer Networks, Database Management Systems, C, Java, Python
    `.trim();

    const normalized = EducationNormalizer.normalize(rawEducationText);
    assert.equal(normalized.length, 1, 'Should create exactly 1 education record');
    assert.equal(normalized[0].degree, 'Bachelor of Technology in Information Technology');
    assert.equal(normalized[0].institution, 'Rajkiya Engineering College');
    assert.equal(normalized[0].location, 'Sonbhadra');
    assert.ok(Array.isArray(normalized[0].coursework));
    assert.ok(normalized[0].coursework.includes('Operating Systems'));
    assert.ok(normalized[0].coursework.includes('Data Structures & Algorithms'));
  });

  // Persona 10: Multi-Part Institution and Location Normalization
  it('Persona 10: Preserves comma-separated institution locations without splitting into fake degrees', () => {
    const entries = [
      'Bachelor of Technology | Rajkiya Engineering College, Sonbhadra | 2020 - 2024',
    ];
    const normalized = EducationNormalizer.normalize(entries);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].degree, 'Bachelor of Technology');
    assert.equal(normalized[0].institution, 'Rajkiya Engineering College');
    assert.equal(normalized[0].location, 'Sonbhadra');
    assert.equal(normalized[0].startDate, '2020');
    assert.equal(normalized[0].endDate, '2024');
  });

  // Persona 11: Python Noise Filtering
  it('Persona 11: Filters stdlib and internal Python modules from AST and taxonomy classification', () => {
    const pythonCode = `
import time
import random
import os
import sys
import json
import fastify
from server import app
from tasks import worker
    `.trim();

    const scanned = ImportScanner.scanImports(pythonCode, 'main.py');
    const packages = scanned.map((s) => s.packageName);

    assert.ok(packages.includes('fastify'));
    assert.ok(!packages.includes('time'));
    assert.ok(!packages.includes('random'));
    assert.ok(!packages.includes('server'));
    assert.ok(!packages.includes('tasks'));

    assert.equal(SkillTaxonomyEngine.classify('time'), null);
    assert.equal(SkillTaxonomyEngine.classify('random'), null);
    assert.equal(SkillTaxonomyEngine.classify('tasks'), null);
  });

  // Persona 12: Semantic Invariants & Identity Isolation
  it('Persona 12: Preserves user custom role override and isolates from active employment title', () => {
    const experiences = [
      {
        company: 'Mega Corp',
        title: 'Junior Developer',
        employmentType: 'FULL_TIME',
        startDate: '2023-01',
        isCurrent: true,
      },
    ];

    const currentEmployment = CareerStatusDerivation.deriveCurrentEmployment(experiences);
    assert.equal(currentEmployment.title, 'Junior Developer');

    // Custom user role takes highest precedence
    const customRole = CareerStatusDerivation.resolveCurrentRole({
      userCustomRole: 'Principal Cloud Architect',
      headline: 'Full-Stack Developer',
      currentEmployment,
    });
    assert.equal(customRole, 'Principal Cloud Architect');

    // Without custom role, headline takes precedence over employment title
    const headlineRole = CareerStatusDerivation.resolveCurrentRole({
      userCustomRole: null,
      headline: 'Senior Distributed Systems Architect',
      currentEmployment,
    });
    assert.equal(headlineRole, 'Senior Distributed Systems Architect');

    // Without custom role or headline, employment title is fallback
    const fallbackRole = CareerStatusDerivation.resolveCurrentRole({
      userCustomRole: null,
      headline: null,
      currentEmployment,
    });
    assert.equal(fallbackRole, 'Junior Developer');
  });
});
