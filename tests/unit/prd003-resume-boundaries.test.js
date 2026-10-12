import { it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { normalizeResumeSourceSections } from '../../src/utils/resume-source-normalizer.js';
import { CareerArtifactExportService } from '../../src/services/career-artifact-export.service.js';
import { registerCurrentNarrativeArtifact } from '../../src/services/evidence/narrative-policy.js';
import { profile } from '../fixtures/prd003-resume-profile.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { reconcileCandidateProjects } from '../../src/services/candidate-artifact-content.service.js';
import { assertSemanticEquivalence } from '../../src/services/structured-resume.service.js';
import { ResumeEntityResolver } from '../../src/domain/career/resume-entity-resolver.js';

const project = {
  id: 'authored-project',
  name: 'Accessible Interface',
  description: 'Candidate-described keyboard navigation research prototype.',
  repositoryUrl: 'https://github.com/fixture/interface',
  liveUrl: 'https://fixture.github.io/interface',
  technologies: ['JavaScript'],
  bullets: [
    'Implemented keyboard navigation for the interface.',
    'Documented accessible user interaction requirements.',
    'Reviewed interface tests for input validation.',
  ],
};

const context = { tenantId: crypto.randomUUID(), userId: crypto.randomUUID() };
const service = new CareerArtifactExportService();
const build = (changes = {}) =>
  buildStructuredResumeDocument({ candidateProfile: { ...profile, ...changes } });
// Unit fixtures establish only the existing server registration boundary, never a persisted seal.
const artifact = (fields) =>
  registerCurrentNarrativeArtifact({
    resumeId: crypto.randomUUID(),
    tenantId: context.tenantId,
    candidateId: crypto.randomUUID(),
    ...fields,
  });

it('PRD-003 preserves saved contact links including two links on the same platform', () => {
  const links = [
    { label: 'Research', url: 'https://github.com/fixture/research' },
    { label: 'Teaching', url: 'https://github.com/fixture/teaching' },
  ];
  const doc = build({
    profileMetadata: {
      userCustom: { portfolioLinks: links, phone: '+91 12345', location: 'Pune' },
    },
  });
  assert.deepEqual(
    doc.candidateIdentity.links.map((l) => l.url),
    links.map((l) => l.url)
  );
  assert.equal(doc.candidateIdentity.location, 'Pune');
});
it('PRD-003 preserves work summary and description as authored fields', () => {
  const experience = [
    {
      ...profile.experience[0],
      summary: 'Supported accessible research.',
      description: 'Maintained participant documentation.',
    },
  ];
  const source = normalizeResumeSourceSections({ experience }).experience[0];
  assert.equal(source.summary, experience[0].summary);
  assert.equal(source.description, experience[0].description);
  assert.equal(build({ experience }).experience[0].summary, source.summary);
});
it('PRD-003 canonical structured resume exports all populated fields', () => {
  const doc = build();
  for (const format of ['JSON_RESUME', 'MARKDOWN', 'PLAIN_TEXT']) {
    const content = service.exportResume(context, artifact({ structuredResume: doc }), null, {
      format,
    }).content;
    for (const expected of [
      'fixture@example.test',
      'Fixture Board',
      'CRED-1',
      'Accessible Systems',
      'Faculty recognition',
      'Hindi',
      'Workshop Facilitator',
      'Student Representative',
      'Reviewed accessibility guidelines.',
    ])
      assert.ok(content.includes(expected), format + ': ' + expected);
  }
});
it('PRD-003 legacy exports do not invent location, dates or repository authorship', () => {
  const resume = artifact({
    skills: [],
    experience: [{ title: 'Assistant', company: 'Fixture', bullets: [] }],
    education: [],
    projects: [{ name: 'Repository reference', bullets: [] }],
  });
  const json = JSON.parse(
    service.exportResume(context, resume, null, { format: 'JSON_RESUME' }).content
  );
  assert.notEqual(json.basics.location.city, 'San Francisco');
  assert.deepEqual(json.projects[0].roles || [], []);
  for (const format of ['MARKDOWN', 'PLAIN_TEXT']) {
    const text = service.exportResume(context, resume, null, { format }).content;
    assert.ok(!text.includes('2020'));
    assert.ok(!text.includes('Present'));
  }
});
it('PRD-003 legacy text exports retain education, credentials and optional sections', () => {
  const resume = artifact({
    ...profile,
    skills: [],
    optionalSections: normalizeResumeSourceSections(profile).optionalSections,
  });
  for (const format of ['MARKDOWN', 'PLAIN_TEXT']) {
    const text = service.exportResume(context, resume, profile, { format }).content;
    for (const expected of [
      '3.9/4',
      'Faculty recognition',
      'Fixture Board',
      'CRED-1',
      'Accessible Systems',
      'Hindi',
    ])
      assert.ok(text.includes(expected), format + ': ' + expected);
  }
});
it('PRD-003 canonical export rejects unregistered or mutated narratives', () => {
  const item = artifact({ structuredResume: build() });
  item.structuredResume.education[0].degree = 'Invented Degree';
  assert.throws(() => service.exportResume(context, item), /quarantined/);
});
it('PRD-003 selected projects preserve authoritative descriptions and both URLs', () => {
  const doc = build({ projects: [project] });
  assert.equal(doc.projects.length, 1);
  assert.equal(doc.projects[0].description, project.description);
  assert.equal(doc.projects[0].projectId, project.id);
  assert.equal(doc.projects[0].liveUrl, project.liveUrl);
});
it('PRD-003 renderer never clips an already selected canonical project bullet', () => {
  const doc = build({ projects: [project] });
  doc.projects[0].bullets.push({
    text: 'Maintained additional candidate-authored documentation.',
    evidenceRefs: [],
    provenanceStatus: 'USER_PROVIDED',
  });
  const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
    applicationPackage: { structuredResume: doc },
  }).texContent;
  assert.ok(tex.includes('Maintained additional candidate-authored documentation.'));
});
it('PRD-003 source project reconciliation retains saved IDs and explicit repository/live links', () => {
  const result = reconcileCandidateProjects({
    profileProjects: [],
    resumeDataProjects: [project],
    storedProjects: [],
  });
  assert.equal(result[0].id, project.id);
  assert.equal(result[0].repositoryUrl, project.repositoryUrl);
  assert.equal(result[0].liveUrl, project.liveUrl);
});
it('PRD-003 exports use the saved identity and retain all canonical contact links', () => {
  const doc = build({
    portfolioLinks: [{ label: 'Research', url: 'https://research.example.test' }],
  });
  const item = artifact({ structuredResume: doc });
  const json = JSON.parse(
    service.exportResume(
      context,
      item,
      { displayName: 'Later changed name' },
      { format: 'JSON_RESUME' }
    ).content
  );
  assert.equal(json.basics.name, profile.displayName);
  assert.equal(json.basics.profiles[0].url, doc.candidateIdentity.links[0].url);
  assert.equal(json.meta.antigravity.atsMatchScore, undefined);
});
it('PRD-003 unchanged JSON exports are byte deterministic and do not mutate the artifact', () => {
  const item = artifact({ structuredResume: build() });
  const before = structuredClone(item);
  const a = service.exportResume(context, item, null, { format: 'JSON_RESUME' });
  const b = service.exportResume(context, item, null, { format: 'JSON_RESUME' });
  assert.equal(a.sha256Checksum, b.sha256Checksum);
  assert.equal(a.content, b.content);
  assert.deepEqual(item, before);
});
it('PRD-003 anonymized canonical exports redact saved identity instead of only legacy candidate fields', () => {
  const item = artifact({
    structuredResume: build({
      phone: '+91 12345',
      location: 'Pune',
      portfolioLinks: [{ url: 'https://private.example.test', label: 'Portfolio' }],
    }),
  });
  const json = JSON.parse(
    service.exportResume(context, item, null, { format: 'CANONICAL_JSON', anonymize: true }).content
  );
  assert.equal(json.structuredResume.candidateIdentity.displayName, '[REDACTED_NAME]');
  assert.equal(json.structuredResume.candidateIdentity.email, '[REDACTED_EMAIL]');
  assert.deepEqual(json.structuredResume.candidateIdentity.links, []);
  assert.equal(json.structuredResume.candidateIdentity.location, null);
});
it('PRD-003 omitted claimed entries cannot leak through JSON Resume extensions', () => {
  const doc = build({
    certifications: [{ name: 'Candidate declared credential', provenanceStatus: 'CLAIMED' }],
  });
  const item = artifact({ structuredResume: doc });
  const json = JSON.parse(
    service.exportResume(context, item, null, {
      format: 'JSON_RESUME',
      includeUnverifiedClaims: false,
    }).content
  );
  assert.deepEqual(json.meta.antigravity.sourceSections.certifications, []);
  assert.deepEqual(json.certificates, []);
});
it('PRD-003 malformed registered structured output fails rather than being replaced with invented legacy defaults', () => {
  const doc = build();
  doc.education = { degree: 'Malformed' };
  assert.throws(
    () =>
      service.exportResume(context, artifact({ structuredResume: doc }), null, {
        format: 'JSON_RESUME',
      }),
    /array/
  );
});
it('PRD-003 description mutation violates the semantic preservation guard', () => {
  const doc = build({ projects: [project] });
  const changed = structuredClone(doc);
  changed.projects[0].description = 'Invented result';
  assert.throws(() => assertSemanticEquivalence(doc, changed), /semantic violation/);
});
it('PRD-003 explicit saved summary wins over a stale source summary and preserves wording', () => {
  const doc = build({
    summary: 'Stale statement',
    profileMetadata: {
      userCustom: { summary: 'Candidate corrected accessible computing summary.' },
    },
  });
  assert.equal(doc.summary.text, 'Candidate corrected accessible computing summary.');
});
it('PRD-003 explicit empty summary stays empty on an incomplete profile instead of introducing engineering experience', () => {
  const doc = build({
    headline: '',
    summary: '',
    skills: [],
    projects: [],
    experience: [
      { title: 'Assistant', summary: 'Candidate-provided documentation work.', bullets: [] },
    ],
  });
  assert.equal(doc.summary.text, '');
  assert.ok(!JSON.stringify(doc.candidateIdentity).includes('Software Engineer'));
});
it('PRD-003 renders an exact project description/bullet duplicate only once', () => {
  const doc = build({ projects: [project] });
  if (!doc.projects[0].bullets.some((bullet) => bullet.text === project.description))
    doc.projects[0].bullets.push({
      text: project.description,
      provenanceStatus: 'USER_PROVIDED',
      evidenceRefs: [],
    });
  const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
    applicationPackage: { structuredResume: doc },
  }).texContent;
  assert.equal(tex.split(project.description).length - 1, 1);
  for (const format of ['MARKDOWN', 'PLAIN_TEXT']) {
    const text = service.exportResume(context, artifact({ structuredResume: doc }), null, {
      format,
    }).content;
    assert.equal(text.split(project.description).length - 1, 1);
  }
});
it('PRD-003 additive work fields do not change the serialization of legacy records without these fields', () => {
  const record = normalizeResumeSourceSections({
    experience: [{ company: 'Fixture', title: 'Assistant' }],
  }).experience[0];
  assert.equal(Object.hasOwn(record, 'summary'), false);
  assert.equal(Object.hasOwn(record, 'description'), false);
  assert.deepEqual(normalizeResumeSourceSections({ experience: [record] }).experience[0], record);
});
it('PRD-003 retains the saved professional headline over a stale direct profile headline', () => {
  const doc = build({
    headline: 'Stale headline',
    profileMetadata: { userCustom: { headline: 'Accessible Computing Researcher' } },
  });
  assert.equal(doc.candidateIdentity.headline, 'Accessible Computing Researcher');
  assert.equal(doc.candidateIdentity.masterHeadline, 'Accessible Computing Researcher');
});
it('PRD-003 explicit saved contact clears do not resurrect stale contact values', () => {
  const doc = build({
    phone: '+91 99999',
    location: 'Stale location',
    githubUrl: 'https://github.com/fixture/stale',
    profileMetadata: { userCustom: { phone: null, location: null, portfolioLinks: [] } },
  });
  assert.equal(doc.candidateIdentity.phone, null);
  assert.equal(doc.candidateIdentity.location, null);
  assert.deepEqual(doc.candidateIdentity.links, []);
});
it('PRD-003 ID-less uploaded projects remain resolvable and stable after reconciliation', () => {
  const { id: _id, ...sourceProject } = project;
  const first = reconcileCandidateProjects({ resumeDataProjects: [sourceProject] });
  assert.ok(first[0].id);
  const again = reconcileCandidateProjects({ resumeDataProjects: [sourceProject] });
  assert.equal(again[0].id, first[0].id);
  assert.equal(build({ projects: first }).projects[0].projectId, first[0].id);
  const linked = reconcileCandidateProjects({
    resumeDataProjects: [sourceProject],
    profileProjects: [project],
  });
  assert.equal(linked[0].id, project.id);
});
it('PRD-003 project source URLs do not become technology claims or duplicated descriptions', () => {
  const graph = ResumeEntityResolver.resolveCanonicalGraph([
    {
      sectionType: 'PROJECTS',
      structuredData: {
        projects: [
          {
            title: project.name,
            technologies: ['JavaScript'],
            bullets: [...project.bullets, `Source Code: ${project.repositoryUrl}`],
            urls: [project.repositoryUrl],
          },
        ],
      },
    },
  ]);
  assert.equal(graph.canonicalProjects[0].description, null);
  assert.deepEqual(
    graph.canonicalProjects[0].technologies.map((tech) => tech.name),
    ['JavaScript']
  );
  assert.equal(graph.canonicalSkills.has('github'), false);
});
it('PRD-003 canonical source resolution retains explicit project IDs and descriptions', () => {
  const graph = ResumeEntityResolver.resolveCanonicalGraph([
    {
      sectionType: 'PROJECTS',
      structuredData: { projects: [{ ...project, title: project.name }] },
    },
  ]);
  assert.equal(graph.canonicalProjects[0].id, project.id);
  assert.equal(graph.canonicalProjects[0].description, project.description);
});
it('PRD-003 reads formerly unknown work text without discarding legacy metadata or changing saved IDs', () => {
  const source = {
    id: 'historical-work',
    company: 'Fixture Lab',
    legacyFields: {
      summary: 'Supported accessible research.',
      description: 'Maintained participant documentation.',
      customFlag: 'retain for review',
    },
  };
  const normalized = normalizeResumeSourceSections({ experience: [source] }).experience[0];
  assert.equal(normalized.id, source.id);
  assert.equal(normalized.summary, source.legacyFields.summary);
  assert.equal(normalized.description, source.legacyFields.description);
  assert.deepEqual(normalized.legacyFields, source.legacyFields);
  const cleared = normalizeResumeSourceSections({ experience: [{ ...source, summary: null }] })
    .experience[0];
  assert.equal(cleared.summary, null);
});
it('PRD-003 rejects nontext work summaries and descriptions without mutating input', () => {
  for (const [field, value] of [
    ['summary', 0],
    ['description', false],
  ]) {
    const source = { company: 'Fixture Lab', [field]: value };
    assert.throws(() => normalizeResumeSourceSections({ experience: [source] }));
    assert.equal(source[field], value);
  }
});
