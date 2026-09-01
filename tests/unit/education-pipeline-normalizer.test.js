import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EducationNormalizer } from '../../src/utils/education-normalizer.js';

describe('Education Normalizer & Pipeline Bug Fix Test Suite', () => {
  // 1. Institution + Location
  it('1. should correctly extract institution and location from single and piped lines', () => {
    const raw =
      'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025\nBachelor of Technology in Electronics Engineering';
    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 1);
    assert.equal(result[0].institution, 'Rajkiya Engineering College');
    assert.equal(result[0].location, 'Sonbhadra');
  });

  // 2. Degree + Field of Study
  it('2. should correctly classify degree and extract field of study', () => {
    const raw =
      'Rajkiya Engineering College | Sonbhadra\nBachelor of Technology in Electronics Engineering';
    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 1);
    assert.equal(result[0].degree, 'Bachelor of Technology in Electronics Engineering');
    assert.equal(result[0].degreeType, 'BACHELOR');
    assert.equal(result[0].fieldOfStudy, 'Electronics Engineering');
  });

  // 3. Graduation Date
  it('3. should correctly parse graduation date into endDate and null startDate', () => {
    const raw =
      'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025\nBachelor of Technology in Electronics Engineering';
    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 1);
    assert.equal(result[0].endDate, '2025-07');
    assert.equal(result[0].startDate, null);
    assert.equal(result[0].isCurrent, false);
    assert.equal(result[0].rawDateRange, 'Graduation: July 2025');
  });

  // 4. Coursework
  it('4. should isolate coursework lines, strip trailing punctuation, and attach to record', () => {
    const raw = `Rajkiya Engineering College | Sonbhadra | Graduation: July 2025
● Bachelor of Technology in Electronics Engineering
Relevant Coursework: Data Structures & Algorithms, C, Python, System Modeling, Digital Logic.
Core CS Focus: Data Structures & Algorithms, Operating Systems, DBMS, Computer Networks`;
    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 1);
    assert.deepEqual(result[0].coursework, [
      'Data Structures & Algorithms',
      'C',
      'Python',
      'System Modeling',
      'Digital Logic',
      'Operating Systems',
      'DBMS',
      'Computer Networks',
    ]);
  });

  // 5. Current Student
  it('5. should correctly represent currently enrolled students (isCurrent = true, endDate = null)', () => {
    const raw = `Stanford University | Stanford, CA | Expected: June 2026
● Master of Science in Computer Science
Currently enrolled`;
    const rawResult = EducationNormalizer.normalize(raw);
    assert.equal(rawResult.length, 1);
    assert.equal(rawResult[0].isCurrent, true);
    assert.equal(rawResult[0].endDate, null);

    const structured = [
      {
        institution: 'Stanford University',
        degree: 'Master of Science in Computer Science',
        degreeType: 'MASTER',
        location: 'Stanford, CA',
        isCurrent: true,
        startDate: '2024-09',
        endDate: null,
        coursework: ['Artificial Intelligence'],
      },
    ];
    const result = EducationNormalizer.normalize(structured);

    assert.equal(result.length, 1);
    assert.equal(result[0].isCurrent, true);
    assert.equal(result[0].endDate, null);
    assert.equal(result[0].institution, 'Stanford University');
  });

  // 6. Completed Degree
  it('6. should correctly represent completed degree (endDate != null, isCurrent = false)', () => {
    const raw =
      'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025\nBachelor of Technology in Electronics Engineering';
    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 1);
    assert.equal(result[0].isCurrent, false);
    assert.notEqual(result[0].endDate, null);
    assert.equal(result[0].endDate, '2025-07');
  });

  // 7. Multiple Genuine Degrees
  it('7. should support multiple genuine degrees without collapsing them into one', () => {
    const multiDegrees = [
      {
        institution: 'Stanford University',
        degree: 'Master of Science in Computer Science',
        degreeType: 'MASTER',
        fieldOfStudy: 'Computer Science',
        location: 'Stanford, CA',
        endDate: '2025-06',
        isCurrent: false,
        coursework: ['Artificial Intelligence', 'Distributed Systems'],
        provenanceStatus: 'USER_PROVIDED',
      },
      {
        institution: 'Rajkiya Engineering College',
        degree: 'Bachelor of Technology in Electronics Engineering',
        degreeType: 'BACHELOR',
        fieldOfStudy: 'Electronics Engineering',
        location: 'Sonbhadra',
        endDate: '2023-05',
        isCurrent: false,
        coursework: ['Data Structures & Algorithms', 'DBMS'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ];

    const result = EducationNormalizer.normalize(multiDegrees);

    assert.equal(result.length, 2);
    assert.equal(result[0].institution, 'Stanford University');
    assert.equal(result[0].degreeType, 'MASTER');
    assert.equal(result[1].institution, 'Rajkiya Engineering College');
    assert.equal(result[1].degreeType, 'BACHELOR');
  });

  // 8. Unrelated Institutions
  it('8. should keep genuinely different institutions distinct in raw text stream', () => {
    const raw = `Stanford University | Stanford, CA | Graduation: June 2025
● Master of Science in Computer Science
Relevant Coursework: Machine Learning

Rajkiya Engineering College | Sonbhadra | Graduation: July 2023
● Bachelor of Technology in Electronics Engineering
Relevant Coursework: Data Structures & Algorithms`;

    const result = EducationNormalizer.normalize(raw);

    assert.equal(result.length, 2);
    assert.equal(result[0].institution, 'Stanford University');
    assert.equal(result[1].institution, 'Rajkiya Engineering College');
    assert.deepEqual(result[0].coursework, ['Machine Learning']);
    assert.deepEqual(result[1].coursework, ['Data Structures & Algorithms']);
  });

  // 9. Fragmented Resume Lines (Real bug scenario)
  it('9. should consolidate fragmented resume lines into a single coherent education record', () => {
    const rawLines = [
      'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025',
      '● Bachelor of Technology in Electronics Engineering',
      'Relevant Coursework: Data Structures & Algorithms, C, Python, System Modeling, Digital Logic.',
      'Core CS Focus: Data Structures & Algorithms, Operating Systems, DBMS, Computer Networks',
    ];

    const result = EducationNormalizer.normalize(rawLines);

    assert.equal(result.length, 1);
    assert.equal(result[0].institution, 'Rajkiya Engineering College');
    assert.equal(result[0].degree, 'Bachelor of Technology in Electronics Engineering');
    assert.equal(result[0].location, 'Sonbhadra');
    assert.equal(result[0].endDate, '2025-07');
    assert.equal(result[0].coursework.length, 8);
  });

  // 10. Duplicate / Corrupted Objects Consolidation
  it('10. should consolidate corrupted objects (where C and OS were institutions) into 1 record', () => {
    const dbCorruptedFragments = [
      {
        text: 'Rajkiya Engineering College | Sonbhadra | Graduation: July 2025',
        degree: 'Rajkiya Engineering College',
        endDate: null,
        startDate: null,
        institution: 'Sonbhadra',
        fieldOfStudy: 'Graduation: July 2025',
        provenanceStatus: 'CLAIMED',
      },
      {
        text: 'Bachelor of Technology in Electronics Engineering',
        degree: null,
        endDate: null,
        startDate: null,
        institution: 'Bachelor of Technology in Electronics Engineering',
        fieldOfStudy: null,
        provenanceStatus: 'CLAIMED',
      },
      {
        text: 'Relevant Coursework: Data Structures & Algorithms, C, Python, System Modeling, Digital Logic.',
        degree: 'Relevant Coursework: Data Structures & Algorithms',
        endDate: null,
        startDate: null,
        institution: 'C',
        fieldOfStudy: 'Python',
        provenanceStatus: 'CLAIMED',
      },
      {
        text: 'Core CS Focus: Data Structures & Algorithms, Operating Systems, DBMS, Computer Networks',
        degree: 'Core CS Focus: Data Structures & Algorithms',
        endDate: null,
        startDate: null,
        institution: 'Operating Systems',
        fieldOfStudy: 'DBMS',
        provenanceStatus: 'CLAIMED',
      },
    ];

    const result = EducationNormalizer.normalize(dbCorruptedFragments);

    assert.equal(result.length, 1);
    assert.equal(result[0].institution, 'Rajkiya Engineering College');
    assert.equal(result[0].location, 'Sonbhadra');
    assert.equal(result[0].degree, 'Bachelor of Technology in Electronics Engineering');
    assert.equal(result[0].degreeType, 'BACHELOR');
    assert.equal(result[0].endDate, '2025-07');
    assert.equal(result[0].isCurrent, false);
    assert.equal(result[0].coursework.length, 8);
    assert.ok(result[0].coursework.includes('System Modeling'));
    assert.ok(result[0].coursework.includes('Digital Logic'));
  });

  // 11. User Correction
  it('11. should preserve user edits and USER_PROVIDED provenance', () => {
    const userEdits = [
      {
        institution: 'Rajkiya Engineering College',
        degree: 'Bachelor of Technology in Electronics Engineering',
        degreeType: 'BACHELOR',
        fieldOfStudy: 'Electronics Engineering',
        location: 'Varanasi, India',
        startDate: null,
        endDate: '2025-07',
        isCurrent: false,
        rawDateRange: 'Graduation: July 2025',
        coursework: ['Data Structures & Algorithms', 'C++', 'System Modeling'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ];

    const result = EducationNormalizer.normalize(userEdits, { provenanceStatus: 'USER_PROVIDED' });

    assert.equal(result.length, 1);
    assert.equal(result[0].location, 'Varanasi, India');
    assert.equal(result[0].provenanceStatus, 'USER_PROVIDED');
    assert.deepEqual(result[0].coursework, [
      'Data Structures & Algorithms',
      'C++',
      'System Modeling',
    ]);
  });

  // 12. Provenance Preservation
  it('12. should preserve CLAIMED vs USER_PROVIDED vs VERIFIED provenance status', () => {
    const claimedRes = EducationNormalizer.normalize('Rajkiya Engineering College | Sonbhadra', {
      provenanceStatus: 'CLAIMED',
    });
    assert.equal(claimedRes[0].provenanceStatus, 'CLAIMED');

    const userRes = EducationNormalizer.normalize('Rajkiya Engineering College | Sonbhadra', {
      provenanceStatus: 'USER_PROVIDED',
    });
    assert.equal(userRes[0].provenanceStatus, 'USER_PROVIDED');

    const verifiedRes = EducationNormalizer.normalize('Rajkiya Engineering College | Sonbhadra', {
      provenanceStatus: 'VERIFIED',
    });
    assert.equal(verifiedRes[0].provenanceStatus, 'VERIFIED');
  });
});
