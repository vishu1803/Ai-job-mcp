import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EducationNormalizer } from '../../src/utils/education-normalizer.js';

describe('EducationNormalizer', () => {
  it('parses real multi-line education structure correctly', () => {
    const rawLines = [
      'Rajkiya Engineering College, Sonbhadra',
      'Bachelor of Technology in Computer Science and Engineering',
      '2021 – 2025',
      'Relevant Coursework: Data Structures, Operating Systems, Computer Networks, Database Management Systems, C, C++, Java',
      'CGPA: 8.2 / 10.0',
    ];

    const result = EducationNormalizer.normalize(rawLines);
    assert.equal(result.length, 1);

    const edu = result[0];
    assert.equal(edu.institution, 'Rajkiya Engineering College');
    assert.equal(edu.location, 'Sonbhadra');
    assert.equal(edu.degree, 'Bachelor of Technology in Computer Science and Engineering');
    assert.equal(edu.fieldOfStudy, 'Computer Science and Engineering');
    assert.equal(edu.degreeType, 'BACHELOR');
    assert.equal(edu.startDate, '2021');
    assert.equal(edu.endDate, '2025');
    assert.equal(edu.isCurrent, false);
    assert.equal(edu.gradeOrGpa, '8.2 / 10.0');

    // Coursework must NOT become fake institutions
    assert.deepEqual(edu.coursework, [
      'Data Structures',
      'Operating Systems',
      'Computer Networks',
      'Database Management Systems',
      'C',
      'C++',
      'Java',
    ]);
  });

  it('parses piped single-line education entry', () => {
    const rawLine = 'Stanford University | M.S. in Artificial Intelligence | 2022 - 2024';
    const result = EducationNormalizer.normalize(rawLine);
    assert.equal(result.length, 1);

    const edu = result[0];
    assert.equal(edu.institution, 'Stanford University');
    assert.equal(edu.degree, 'M.S. in Artificial Intelligence');
    assert.equal(edu.fieldOfStudy, 'Artificial Intelligence');
    assert.equal(edu.degreeType, 'MASTER');
    assert.equal(edu.startDate, '2022');
    assert.equal(edu.endDate, '2024');
  });

  it('classifies various degree types correctly', () => {
    assert.equal(EducationNormalizer.classifyDegreeType('Ph.D. in Computer Science'), 'DOCTORATE');
    assert.equal(EducationNormalizer.classifyDegreeType('Associate of Science in IT'), 'ASSOCIATE');
    assert.equal(
      EducationNormalizer.classifyDegreeType('Full-Stack Web Development Bootcamp'),
      'BOOTCAMP'
    );
    assert.equal(
      EducationNormalizer.classifyDegreeType('Diploma in Electrical Engineering'),
      'DIPLOMA'
    );
  });
});
