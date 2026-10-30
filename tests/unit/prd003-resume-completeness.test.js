import { it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { EducationNormalizer } from '../../src/utils/education-normalizer.js';
import { SourceExperienceSnapshotSchema } from '../../src/domain/career/resume.schemas.js';
import { composeStructuredResumeDocument } from '../../src/services/resume-accomplishment-composer.service.js';

import { profile } from '../fixtures/prd003-resume-profile.js';
import { normalizeResumeSourceSections } from '../../src/utils/resume-source-normalizer.js';
import { StructuredResumeDocumentSchema } from '../../src/domain/career/resume.schemas.js';
import {
  assertSemanticEquivalence,
  computeResumeSemanticFingerprint,
} from '../../src/services/structured-resume.service.js';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { buildArtifactContentDisposition } from '../../src/utils/artifact-filename-builder.js';
const build = (changes = {}) =>
  buildStructuredResumeDocument({
    candidateProfile: { ...profile, ...changes },
    jobPosting: { title: 'Research Assistant', description: 'Research accessible computing.' },
  });
const tex = (doc) =>
  new LatexDocumentGenerator().generateTailoredResumeLatex({
    applicationPackage: { structuredResume: doc },
  }).texContent;

it('preserves current education, grade, location, honors and stable IDs', () => {
  const education = build().education[0];
  assert.equal(education.isCurrent, true);
  assert.equal(education.grade, '3.9/4');
  assert.equal(education.location, 'Delhi');
  assert.deepEqual(education.honors, ['Faculty recognition']);
  assert.equal(EducationNormalizer.normalize(profile.education)[0].id, 'edu-1');
});
it('renders education and complete certification fields automatically', () => {
  const text = tex(build());
  for (const expected of [
    'Present',
    '3.9/4',
    'Delhi',
    'Faculty recognition',
    'Fixture License',
    'Fixture Board',
    'CRED-1',
    'Jun 2027',
    'issuer.example.test',
  ])
    assert.ok(text.includes(expected), expected);
});
it('preserves source optional sections and all their meaningful rendered fields', () => {
  const doc = build();
  assert.equal(doc.optionalSections.publications[0]?.id, 'pub-1');
  assert.equal(doc.optionalSections.awards[0]?.id, 'award-1');
  assert.equal(doc.optionalSections.achievements[0]?.id, 'achievement-1');
  const text = tex(doc);
  for (const expected of [
    'Accessible Systems',
    'Fixture Journal',
    'journal.example.test',
    'Presented an accessibility study.',
    'Recognition for accessible design.',
  ])
    assert.ok(text.includes(expected), expected);
});
it('preserves language, volunteer, leadership and supported custom content', () => {
  const text = tex(build());
  for (const expected of [
    'Hindi',
    'Native',
    'Workshop Facilitator',
    'Fixture Community',
    'Student Representative',
    'Fixture Council',
    'Professional Activities',
    'Reviewed accessibility guidelines.',
  ])
    assert.ok(text.includes(expected), expected);
});
it('preserves authored experience highlights and full dates', () => {
  const doc = build();
  assert.deepEqual(doc.experience[0].bullets, profile.experience[0].highlights);
  assert.ok(tex(doc).includes('1 Jun 2024'));
});
it('does not let tailoring omit populated authoritative sections', () => {
  const doc = buildStructuredResumeDocument({
    candidateProfile: profile,
    jobPosting: { title: 'Research Assistant' },
    tailoringPlan: { sectionOrder: ['HEADER', 'SUMMARY'] },
  });
  assert.ok(doc.sectionOrder.includes('EDUCATION'));
  assert.ok(doc.sectionOrder.includes('CERTIFICATIONS'));
  const composed = composeStructuredResumeDocument(doc);
  assert.deepEqual(composed.education, doc.education);
  assert.deepEqual(composed.optionalSections, doc.optionalSections);
});
it('rejects impossible dates and reversed non-current chronology', () => {
  assert.equal(
    SourceExperienceSnapshotSchema.safeParse({ startDate: '2026-99', endDate: '2020-01' }).success,
    false
  );
  assert.equal(
    SourceExperienceSnapshotSchema.safeParse({ startDate: '2024-02-30' }).success,
    false
  );
  assert.equal(
    SourceExperienceSnapshotSchema.safeParse({ startDate: '2025', endDate: '2024' }).success,
    false
  );
});
it('handles missing arrays and nullable optional sections without invention', () => {
  const doc = build({
    experience: null,
    education: null,
    certifications: null,
    publications: null,
    achievements: null,
    awards: null,
    languages: null,
    volunteerExperience: null,
    leadership: null,
    customSections: null,
    summary: '',
  });
  assert.deepEqual(doc.education, []);
  assert.deepEqual(doc.experience, []);
  assert.equal(doc.summary.text, '');
  assert.ok(!tex(doc).includes('Experienced'));
});

for (const [label, changes] of Object.entries({
  student: { experience: [], education: profile.education },
  experienced: {
    experience: [
      ...profile.experience,
      {
        ...profile.experience[0],
        id: 'work-2',
        title: 'Engineer',
        company: 'Second Employer',
        startDate: '2020',
        endDate: '2022',
      },
    ],
  },
  'career changer': { headline: 'Research Career Changer' },
  research: { publications: profile.publications },
  'multiple degrees and credentials': {
    education: [
      ...profile.education,
      { institution: 'Second University', degree: 'BSc', endDate: '2022' },
    ],
    certifications: [...profile.certifications, { name: 'Second Credential' }],
  },
  'missing dates and incomplete history': {
    experience: [{ title: 'Assistant', bullets: ['Documented interfaces.'] }],
    education: [{ institution: 'University' }],
  },
}))
  it(`preserves authoritative sections for ${label}`, () => {
    const doc = build(changes);
    const expected = normalizeResumeSourceSections({ ...profile, ...changes });
    assert.deepEqual(doc.education, expected.education);
    assert.deepEqual(doc.certifications, expected.certifications);
    assert.deepEqual(doc.optionalSections, expected.optionalSections);
    assert.equal(doc.experience.length, expected.experience.length);
  });

it('normalizes legacy aliases, numeric GPA, month names and stable IDs idempotently without mutation', () => {
  const input = {
    education: [
      { school: 'Legacy University', degree: 'BA', gpa: 3.8, startDate: 'Sep 2020', year: '2024' },
    ],
    certifications: [{ name: 'Credential', issuer: 'Board', expiryDate: '2027' }],
    languages: ['Hindi'],
  };
  const before = structuredClone(input);
  const first = normalizeResumeSourceSections(input);
  const second = normalizeResumeSourceSections({ ...first, ...first.optionalSections });
  assert.deepEqual(second, first);
  assert.deepEqual(input, before);
  assert.equal(first.education[0].grade, '3.8');
  assert.equal(first.education[0].startDate, '2020-09');
  assert.equal(first.certifications[0].issuingOrganization, 'Board');
  assert.equal(first.optionalSections.languages[0].proficiency, undefined);
});

for (const [label, changes] of Object.entries({
  'unexpected array object': { education: { institution: 'University' } },
  'invalid URL': { certifications: [{ name: 'Credential', credentialUrl: 'invalid' }] },
  'unrecognized enum': { languages: [{ language: 'Hindi', proficiency: 'EXPERT' }] },
  'invalid calendar date': { education: [{ institution: 'University', endDate: '2023-02-29' }] },
  'uncertain legacy date': { experience: [{ company: 'Employer', startDate: 'Spring 2020' }] },
  'overlong field': { certifications: [{ name: 'x'.repeat(256) }] },
  'malformed bullet': { experience: [{ title: 'Engineer', bullets: [{}] }] },
}))
  it(`rejects ${label} without mutating source`, () => {
    const before = structuredClone(changes);
    assert.throws(() => normalizeResumeSourceSections(changes));
    assert.deepEqual(changes, before);
  });

it('omits empty records/bullets and deduplicates exact records without merging distinct degrees', () => {
  const doc = build({
    experience: [
      {},
      { title: 'Engineer', bullets: ['', ' ', 'Built interfaces.', 'Built interfaces.'] },
    ],
    education: [
      profile.education[0],
      profile.education[0],
      { ...profile.education[0], id: 'edu-2', degree: 'PhD' },
    ],
  });
  assert.equal(doc.experience.length, 1);
  assert.deepEqual(doc.experience[0].bullets, ['Built interfaces.']);
  assert.equal(doc.education.length, 2);
  assert.ok(!tex(doc).includes('\\item \n'));
});

it('retains unknown legacy metadata explicitly with a review warning', () => {
  const doc = build({
    education: [{ ...profile.education[0], thesisAdvisor: 'Dr Candidate Supplied' }],
  });
  assert.equal(doc.education[0].legacyFields.thesisAdvisor, 'Dr Candidate Supplied');
  assert.ok(doc.sourceWarnings.some((w) => w.includes('thesisAdvisor')));
});

it('reads a legacy 2.0.0 snapshot and does not alter its authoritative records', () => {
  const legacy = build();
  delete legacy.sourceWarnings;
  for (const field of ['languages', 'volunteerExperience', 'leadership', 'customSections'])
    delete legacy.optionalSections[field];
  const normalized = StructuredResumeDocumentSchema.parse(legacy);
  assert.deepEqual(normalized.education, legacy.education);
  assert.deepEqual(normalized.optionalSections.languages, []);
});

it('optimizer integrity includes education dates, credential URLs and optional fields', () => {
  const doc = build();
  for (const mutate of [
    (d) => {
      d.education[0].grade = '4.0';
    },
    (d) => {
      d.certifications[0].credentialUrl = 'https://evil.example.test';
    },
    (d) => {
      d.optionalSections.publications = [];
    },
  ]) {
    const changed = structuredClone(doc);
    mutate(changed);
    assert.notEqual(
      computeResumeSemanticFingerprint(changed),
      computeResumeSemanticFingerprint(doc)
    );
    assert.throws(() => assertSemanticEquivalence(doc, changed), /semantic violation/);
  }
});

it('aliases in section order render each authoritative section once', () => {
  const doc = build();
  doc.sectionOrder = ['PROFESSIONAL_EXPERIENCE', 'EXPERIENCE', ...doc.sectionOrder];
  assert.equal(
    (tex(doc).match(/\\ats(?:first)?section\{(?:Professional )?Experience\}/g) || []).length,
    1
  );
});

it('retains literal braces and backslashes in the actual Chrome HTML conversion', () => {
  const doc = build({ education: [{ ...profile.education[0], honors: ['C++ _ # $ { } ~ ^ \\'] }] });
  const html = new LatexCompilerService()._convertLatexToAtsHtml(tex(doc));
  assert.ok(html.includes('&#123;'));
  assert.ok(html.includes('&#125;'));
  assert.ok(html.includes('&#92;'));
});

it('uses an ASCII-safe HTTP header with an authentic Unicode filename', () => {
  const header = buildArtifactContentDisposition('José 林 - Resume.pdf');
  assert.ok(/^[\x20-\x7e]+$/.test(header));
  assert.ok(header.includes("filename*=UTF-8''"));
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]), 'José 林 - Resume.pdf');
});

it('stable generated IDs survive JSONB-style key ordering even in legacy fields', () => {
  const a = normalizeResumeSourceSections({
    education: [{ institution: 'University', originalMetadata: { b: 2, a: 1 } }],
  });
  const b = normalizeResumeSourceSections({
    education: [{ originalMetadata: { a: 1, b: 2 }, institution: 'University' }],
  });
  assert.equal(a.education[0].id, b.education[0].id);
});

it('mixed legacy education keeps complete records and rejects guessed seasonal dates', () => {
  const result = normalizeResumeSourceSections({
    education: [profile.education[0], 'Second University | MSc | 2020 - 2022'],
  });
  assert.equal(result.education[0].id, profile.education[0].id);
  assert.deepEqual(result.education[0].honors, profile.education[0].honors);
  assert.throws(
    () =>
      normalizeResumeSourceSections({
        education: [{ institution: 'University', rawDateRange: 'Spring 2020 - Fall 2022' }],
      }),
    /Unrecognized resume date/
  );
  assert.throws(
    () => normalizeResumeSourceSections({ education: [{ institution: 'University', gpa: NaN }] }),
    /finite/
  );
});

it('preserves conflicting legacy aliases rather than silently losing their source values', () => {
  const result = normalizeResumeSourceSections({
    certifications: [
      { name: 'License', issuingOrganization: 'Current Board', issuer: 'Legacy Board' },
    ],
  });
  assert.equal(result.certifications[0].issuingOrganization, 'Current Board');
  assert.equal(result.certifications[0].legacyFields.issuer, 'Legacy Board');
});

it('parses explicit comma-separated degree and institution without adding a placeholder', () => {
  const records = EducationNormalizer.normalize(
    'MSc in Computing, Fixture University | Sep 2023 - Present'
  );
  assert.equal(records[0].degree, 'MSc in Computing');
  assert.equal(records[0].institution, 'Fixture University');
  assert.equal(records[0].fieldOfStudy, 'Computing');
});

for (const [label, modelOutput] of Object.entries({
  malformed: '{',
  null: null,
  'missing arrays': {},
  'fabricated credentials': {
    education: [{ degree: 'Invented PhD' }],
    certifications: [{ name: 'Invented Credential' }],
    summary: 'Invented employer and 90% achievement.',
  },
}))
  it(`ignores advisory AI ${label} while preserving authoritative records`, async () => {
    const provider = { generateStructured: async () => modelOutput };
    const aiContent = await new AiResumeContentGeneratorService().generateResumeAiContent({
      candidateProfile: profile,
      targetJobPosting: { title: 'Research Assistant' },
      aiProvider: provider,
    });
    const doc = buildStructuredResumeDocument({
      candidateProfile: profile,
      jobPosting: { title: 'Research Assistant' },
      options: { aiContent },
    });
    assert.deepEqual(doc.education, build().education);
    assert.deepEqual(doc.certifications, build().certifications);
    assert.deepEqual(doc.optionalSections, build().optionalSections);
    assert.equal(
      doc.summary.text,
      'Documented accessible interfaces. Completed coursework in Human Factors.'
    );
    assert.equal(profile.summary, 'I study accessible computing.');
    assert.equal(doc.writing.providerUsed, false);
    assert.ok(!tex(doc).includes('Invented'));
  });
