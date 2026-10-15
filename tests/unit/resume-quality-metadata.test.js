/** Synthetic source records only: real acceptance resumes stay outside the repository. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  normalizeStudioMaster,
  createStudioNodes,
  defaultStudioSelection,
} from '../../src/services/resume-studio-draft-content.js';
import { studioDocumentContent } from '../../src/services/resume-studio-document-content.js';
import {
  LatexDocumentGenerator,
  formatEmploymentMetadata,
} from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';

function model() {
  const structuredResume = normalizeStudioMaster(
    {
      identity: {
        name: 'Synthetic Candidate',
        email: 'candidate@example.test',
        location: 'Home City',
        github: 'https://github.com/synthetic-fixture',
      },
      summary: '',
      skills: ['TypeScript', 'PostgreSQL'],
      experience: [
        {
          id: 'role',
          title: 'Developer Intern',
          company: 'Synthetic Employer',
          location: 'Remote',
          employmentType: 'INTERNSHIP',
          startDate: '2024-06',
          endDate: '2024-09',
          bullets: ['Implemented PostgreSQL queries for the TypeScript API.'],
        },
      ],
      education: [
        {
          id: 'education',
          degree: 'BSc',
          institution: 'Synthetic University',
          location: 'College City',
          startDate: '2021',
          endDate: '2025',
          coursework: ['Databases'],
        },
      ],
    },
    crypto.randomUUID()
  );
  const nodes = createStudioNodes(structuredResume);
  return studioDocumentContent({
    structuredResume,
    nodes,
    selection: defaultStudioSelection(nodes),
  });
}
function rendered() {
  const result = model();
  const { texContent } = new LatexDocumentGenerator().generateTailoredResumeLatex({
    applicationPackage: { structuredResume: result.render },
  });
  return {
    ...result,
    texContent,
    html: new LatexCompilerService()._convertLatexToAtsHtml(texContent),
  };
}

test('employment metadata forms one readable block without orphaned location/type lines', () => {
  const { html, blocks } = rendered();
  assert.match(html, /<p><em>Remote \| Internship<\/em><\/p>/);
  assert.doesNotMatch(html, /<p>(?:<em>)?(?:Remote|INTERNSHIP)(?:<\/em>)?<\/p>/);
  assert.ok(blocks.some((b) => b.text === 'Remote | Internship'));
  assert.ok(!blocks.some((b) => b.text === 'Remote' || b.text === 'INTERNSHIP'));
});

test('education location stays with its institution, before coursework', () => {
  const { html, blocks } = rendered();
  assert.match(html, /<em>Synthetic University \| College City<\/em>/);
  assert.ok(
    html.indexOf('Synthetic University | College City') <
      html.indexOf('Relevant Coursework: Databases')
  );
  assert.ok(blocks.some((b) => b.text === 'Synthetic University | College City'));
  assert.ok(!blocks.some((b) => b.text === 'College City'));
});

test('Chrome header separates contact/profile groups and preserves working links', () => {
  const { html } = rendered();
  assert.match(
    html,
    /candidate@example\.test<\/a> · <a href="https:\/\/github\.com\/synthetic-fixture"/
  );
  assert.equal((html.match(/href="mailto:candidate@example.test"/g) || []).length, 1);
  assert.equal((html.match(/href="https:\/\/github.com\/synthetic-fixture"/g) || []).length, 1);
});

test('formatting retains authored facts, dates, selected skills and the source records', () => {
  const { content, html } = rendered();
  assert.equal(content.experience[0].employmentType, 'INTERNSHIP');
  assert.equal(content.experience[0].location, 'Remote');
  assert.equal(content.education[0].location, 'College City');
  for (const fact of [
    'TypeScript',
    'PostgreSQL',
    'Implemented PostgreSQL queries',
    'Jun 2024',
    'Sep 2024',
    '2021',
    '2025',
  ])
    assert.ok(html.includes(fact), fact);
  assert.doesNotMatch(html, /\b(?:AWS|Kubernetes|40%)\b/);
});

test('unknown authored employment labels remain literal and cannot resolve object properties', () => {
  for (const type of ['toString', '__proto__', 'Candidate-authored label'])
    assert.equal(formatEmploymentMetadata('Remote', type), 'Remote | ' + type);
  assert.equal(formatEmploymentMetadata(null, 'PART_TIME'), 'Part time');
});
