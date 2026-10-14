import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import {
  onePageResumeView,
  planOnePagePresentation,
  fitOnePageResume,
  onePageResumeMarkdown,
} from '../../src/services/one-page-resume.service.js';
import { StructuredResumeDocumentSchema } from '../../src/domain/career/resume.schemas.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';
const fixture = resumeQualityProfileByKey['long-history'];
const source = () =>
  buildStructuredResumeDocument({
    candidateProfile: fixture.profile,
    jobPosting: fixture.jobPosting,
  });
test('one-page selection is deterministic and retains complete source roles and dates', () => {
  const full = source(),
    before = structuredClone(full);
  const presentation = planOnePagePresentation(full, fixture.jobPosting, 3);
  assert.deepEqual(presentation, planOnePagePresentation(full, fixture.jobPosting, 3));
  const view = onePageResumeView({ ...full, presentation });
  assert.ok(view.experience.length <= 2);
  assert.equal(full.experience.length, 15);
  assert.deepEqual(full, before);
  for (const entry of view.experience)
    assert.deepEqual(entry.startDate, full.experience.find((e) => e.id === entry.id).startDate);
  assert.equal(
    StructuredResumeDocumentSchema.parse({ ...full, presentation }).presentation.mode,
    'ONE_PAGE'
  );
});
test('all omissions are explicit, present source paths and protected identity/education stay intact', () => {
  const full = source(),
    presentation = planOnePagePresentation(full, fixture.jobPosting, 3);
  assert.ok(presentation.decisions.length > 0);
  for (const d of presentation.decisions)
    assert.notEqual(
      d.path.split('.').reduce((node, key) => node?.[key], full),
      undefined
    );
  const view = onePageResumeView({ ...full, presentation });
  assert.deepEqual(view.candidateIdentity, {
    ...full.candidateIdentity,
    headline: full.candidateIdentity.masterHeadline || `Target role: ${full.targetRole}`,
  });
  assert.deepEqual(view.education, full.education);
  assert.match(onePageResumeMarkdown({ ...full, presentation }), /Synthetic Software Company/);
});
test('strict presentation cannot hide identity, invented fields, duplicate paths or sections', () => {
  const full = source(),
    contract = planOnePagePresentation(full, {}, 0);
  for (const path of ['candidateIdentity.email', 'education.0', 'projects.999'])
    assert.throws(
      () =>
        onePageResumeView({
          ...full,
          presentation: { ...contract, decisions: [{ path, action: 'OMITTED', reason: 'bad' }] },
        }),
      /Invalid|missing/
    );
  assert.throws(
    () => onePageResumeView({ ...full, presentation: { ...contract, sectionOrder: ['SUMMARY'] } }),
    /retain every/
  );
  if (contract.decisions.length)
    assert.throws(
      () =>
        onePageResumeView({
          ...full,
          presentation: { ...contract, decisions: [contract.decisions[0], contract.decisions[0]] },
        }),
      /duplicate/
    );
});
test('latest dated role stays selected even when saved chronology is ascending', () => {
  const full = source();
  full.experience.reverse();
  const view = onePageResumeView({ ...full, presentation: planOnePagePresentation(full, {}, 3) });
  assert.ok(view.experience.some((e) => e.endDate === '2024-01'));
});
test('bounded fitting only retries physical overflow and preserves the source', async () => {
  let calls = 0;
  const full = source(),
    before = structuredClone(full);
  const result = await fitOnePageResume(
    full,
    {},
    {
      generator: { generateTailoredResumeLatex: () => ({ texContent: 'fixture' }) },
      compiler: {
        compileLatexToPdf: async ({ strictOnePage }) => {
          assert.equal(strictOnePage, true);
          calls++;
          if (calls < 3) throw Object.assign(new Error('overflow'), { code: 'ONE_PAGE_OVERFLOW' });
          return { pageCount: 1 };
        },
      },
    }
  );
  assert.equal(calls, 3);
  assert.equal(result.presentation.pass, 2);
  assert.deepEqual(full, before);
});
test('four unsuccessful physical renders return actionable controlled failure', async () => {
  let calls = 0;
  await assert.rejects(
    fitOnePageResume(
      source(),
      {},
      {
        generator: { generateTailoredResumeLatex: () => ({ texContent: 'fixture' }) },
        compiler: {
          compileLatexToPdf: async () => {
            calls++;
            throw Object.assign(new Error('overflow'), {
              code: 'ONE_PAGE_OVERFLOW',
              details: { pageCount: 2 },
            });
          },
        },
      }
    ),
    { code: 'ONE_PAGE_OVERFLOW', statusCode: 422 }
  );
  assert.equal(calls, 4);
});
test('unknown page count, missing renderer or unrelated failures never become one-page success', async () => {
  let calls = 0;
  await assert.rejects(
    fitOnePageResume(
      source(),
      {},
      {
        generator: { generateTailoredResumeLatex: () => ({ texContent: 'fixture' }) },
        compiler: {
          compileLatexToPdf: async () => {
            calls++;
            return {};
          },
        },
      }
    ),
    { code: 'ONE_PAGE_UNVERIFIABLE' }
  );
  assert.equal(calls, 1);
});
test('legacy snapshots without strict presentation render unchanged', () => {
  const full = source();
  assert.equal(onePageResumeView(full), full);
});
test('repository-inferred associations stay in source but do not become proficiency claims', () => {
  const full = source();
  full.skills = {
    categories: [
      {
        categoryName: 'Languages',
        skills: [
          { slug: 'react', displayName: 'React', provenanceStatus: 'INFERRED' },
          { slug: 'python', displayName: 'Python', provenanceStatus: 'CLAIMED' },
        ],
      },
    ],
  };
  const selected = {
    ...full,
    presentation: planOnePagePresentation(full, { description: 'React' }, 0),
  };
  const view = onePageResumeView(selected);
  assert.equal(full.skills.categories[0].skills.length, 2);
  assert.deepEqual(
    view.skills.categories[0].skills.map((s) => s.displayName),
    ['Python']
  );
  assert.ok(selected.presentation.decisions.some((d) => d.path === 'skills.categories.0.skills.0'));
});
test('verbose authored summaries condense only complete original sentences', () => {
  const full = source();
  full.summary.text = [
    'Documented API request and error handling.',
    'An original candidate-authored sentence with lengthy explanatory details about documented deployment practices and regression tests. '.repeat(
      6
    ),
  ].join(' ');
  const presentation = planOnePagePresentation(full, fixture.jobPosting, 0);
  assert.ok(presentation.condensations.length);
  const view = onePageResumeView({ ...full, presentation });
  assert.ok(full.summary.text.includes(view.summary.text));
  assert.ok(view.summary.text.split(/\s+/).length <= 65);
  assert.throws(
    () =>
      onePageResumeView({
        ...full,
        presentation: {
          ...presentation,
          condensations: [{ path: 'summary.text', sentenceIndices: [999], reason: 'invented' }],
        },
      }),
    /Invalid/
  );
});
test('exact summary and project repetition is omitted explicitly without deleting identities', () => {
  const full = source();
  full.projects = [
    {
      projectId: 'one',
      name: 'First',
      description: 'A documented API.',
      technologies: [],
      bullets: [{ text: 'Implemented API validation.' }],
    },
    {
      projectId: 'two',
      name: 'Second',
      description: 'A documented API.',
      technologies: [],
      bullets: [{ text: 'Implemented API validation.' }],
    },
  ];
  full.summary.text = 'Implemented API validation.';
  const presentation = planOnePagePresentation(full, {}, 0);
  const view = onePageResumeView({ ...full, presentation });
  assert.equal(full.projects.length, 2);
  assert.equal(view.projects.length, 1);
  assert.equal(view.summary.text, '');
  assert.ok(presentation.decisions.some((d) => d.path === 'summary.text'));
  assert.ok(presentation.decisions.some((d) => d.path === 'projects.1'));
});
test('sentence condensation retains Node.js, .NET, decimal metrics and abbreviations exactly', () => {
  const full = source();
  full.summary.text =
    'Dr. Chen documented Node.js APIs using .NET services and measured 3.5 seconds in candidate-provided work. ' +
    'An original sentence about documented procedures and review practices. '.repeat(10);
  const presentation = planOnePagePresentation(full, { description: 'Node.js .NET APIs' }, 0);
  const view = onePageResumeView({ ...full, presentation });
  assert.match(
    view.summary.text,
    /Dr\. Chen documented Node\.js APIs using \.NET services and measured 3\.5 seconds/
  );
  assert.ok(full.summary.text.includes(view.summary.text));
});
test('selected volunteering and custom sections survive Markdown preview aliases', () => {
  const full = source();
  full.sectionOrder.push('VOLUNTEER', 'CUSTOM');
  full.optionalSections.volunteerExperience = [
    {
      title: 'Workshop mentor',
      organization: 'Source Community',
      description: 'Documented accessible workshop exercises.',
    },
  ];
  full.optionalSections.customSections = [
    { title: 'Professional Activities', items: ['Reviewed original source documentation.'] },
  ];
  const selected = { ...full, presentation: planOnePagePresentation(full, {}, 0) };
  assert.match(onePageResumeMarkdown(selected), /Workshop mentor/);
  assert.match(onePageResumeMarkdown(selected), /Reviewed original source documentation/);
});

test('generated summary does not leave an isolated lower priority accomplishment as biography', () => {
  const full = source();
  const originalBullet = 'Documented candidate-provided integration test behavior.';
  full.projects = [
    {
      projectId: 'existing-source-project',
      displayName: 'Source project',
      description: 'Documented candidate-provided functionality.',
      technologies: [],
      bullets: [{ text: 'Implemented frontend form validation.' }, { text: originalBullet }],
    },
  ];
  const summary =
    'Implemented frontend form validation. Documented additional source test behavior.';
  full.summary = { ...full.summary, text: summary, composedFromFactIds: ['source-fact-id'] };
  const before = structuredClone(full);
  const presentation = planOnePagePresentation(full, { title: 'Frontend Developer' }, 3);
  const view = onePageResumeView({ ...full, presentation });
  assert.equal(view.summary.text, '');
  assert.ok(
    presentation.decisions.some(
      (d) => d.path === 'summary.text' && /source accomplishments/.test(d.reason)
    )
  );
  assert.deepEqual(full, before);
  assert.equal(full.summary.text, summary);
});
