/** Offline before/after proof: identical synthetic facts, production composer and renderer. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import {
  retainedMasterSkills,
  resumeSkillRetentionProfile,
  resumeSkillRetentionJob,
} from '../fixtures/resume-quality-skill-retention.js';

const before = process.argv.includes('--before');
const outputArg =
  process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'output/pdf/test-retention';
const output = path.resolve(outputArg);
if (before) {
  const target = pathToFileURL(path.resolve('src/services/structured-resume.service.js')).href;
  const baseline = execFileSync(
    'git',
    [
      '-c',
      `safe.directory=${process.cwd().replaceAll('\\', '/')}`,
      'show',
      'HEAD:src/services/structured-resume.service.js',
    ],
    { encoding: 'utf8' }
  );
  registerHooks({
    load(url, context, nextLoad) {
      return url === target
        ? { format: 'module', source: baseline, shortCircuit: true }
        : nextLoad(url, context);
    },
  });
}
const { buildStructuredResumeSnapshot } =
  await import('../../src/services/structured-resume.service.js');
const { LatexDocumentGenerator } =
  await import('../../src/services/latex-document-generator.service.js');
const { LatexCompilerService } = await import('../../src/services/latex-compiler.service.js');
const { fitOnePageResume, onePageResumeView } =
  await import('../../src/services/one-page-resume.service.js');
const generator = new LatexDocumentGenerator();
const compiler = new LatexCompilerService({
  pdflatexPath: 'missing-offline-quality-tex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null;
await fs.mkdir(output, { recursive: true });
const results = [];
for (const stage of ['junior', 'mid', 'experienced']) {
  for (const target of ['backend', 'full-stack']) {
    const profile = resumeSkillRetentionProfile();
    profile.displayName = `Synthetic ${stage} Candidate`;
    profile.links = [{ label: 'Portfolio', url: 'https://portfolio.example.test/candidate' }];
    profile.summary =
      'Builds TypeScript and Node.js APIs with PostgreSQL and Docker. Maintains NestJS and Python Flask services with request validation and integration tests.';
    profile.education = [
      {
        id: 'education-1',
        institution: 'Synthetic University',
        degree: 'BSc',
        fieldOfStudy: 'Computer Science',
        startDate: '2007-09',
        endDate: '2011-06',
      },
    ];
    const roles = stage === 'junior' ? 0 : stage === 'mid' ? 1 : 3;
    profile.experience = Array.from({ length: roles }, (_, i) => ({
      id: `experience-${i}`,
      title: 'Backend Engineer',
      company: `Synthetic Software Company ${i + 1}`,
      startDate: `${2021 - i * 5}-01`,
      endDate: i === 0 ? null : `${2026 - i * 5}-01`,
      location: 'Remote',
      employmentType: 'FULL_TIME',
      provenanceStatus: 'CLAIMED',
      highlights: [
        'Implemented Node.js API validation and documented error responses.',
        'Added PostgreSQL transaction tests and investigated failed requests.',
        'Maintained Docker development workflows and reviewed deployment checks.',
      ],
    }));
    profile.projects = [
      {
        id: '00000000-0000-4000-8000-000000000004',
        name: 'Library API',
        description: 'An API for a library lending workflow.',
        technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
        repositoryUrl: 'https://github.com/synthetic-fixture/library-api',
        provenanceStatus: 'CLAIMED',
        bullets: [
          'Implemented lending endpoints with TypeScript and Node.js.',
          'Added PostgreSQL migrations for books and lending records.',
          'Wrote integration tests for checkout validation and error responses.',
        ],
      },
    ];
    const unchanged = structuredClone(profile);
    const job = resumeSkillRetentionJob(target);
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile: profile,
      jobPosting: job,
      options: {
        projectRankings: [
          {
            projectId: profile.projects[0].id,
            rank: 1,
            relevanceScore: 80,
            selectionStatus: 'SELECTED',
          },
        ],
      },
    });
    assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
    const document = await fitOnePageResume(snapshot.structuredResume, job, {
      generator,
      compiler,
    });
    const view = onePageResumeView(document);
    const skills = view.skills.categories.flatMap((c) => c.skills.map((s) => s.name));
    assert.deepEqual(new Set(skills), new Set(before ? ['NestJS', 'Flask'] : retainedMasterSkills));
    assert.equal(view.experience.length, roles);
    assert.equal(view.projects.length, 1);
    for (const role of view.experience) assert.equal(role.bullets.length, 3);
    assert.deepEqual(profile, unchanged);
    const tex = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume: document },
    }).texContent;
    const compiled = await compiler.compileLatexToPdf({
      texContent: tex,
      jobName: `quality-${stage}-${target}`,
      strictOnePage: true,
    });
    const name = `${stage}-${target}-${before ? 'before' : 'after'}`;
    await fs.writeFile(path.join(output, name + '.pdf'), compiled.pdfBuffer);
    await fs.writeFile(
      path.join(output, name + '.view.json'),
      JSON.stringify(view, null, 2) + '\n'
    );
    results.push({
      name,
      skillCount: skills.length,
      skills,
      experienceCount: roles,
      projectCount: view.projects.length,
      sectionOrder: view.sectionOrder,
      receipt: snapshot.evidenceValidationReceipt.overallStatus,
      // Keep upstream composition omissions distinct from final page fitting.
      factCompositionReport: snapshot.factCompositionReport,
      presentationDecisions: document.presentation?.decisions || [],
      renderer: compiled.engine || compiled.compiler || 'CHROME_FALLBACK_FORCED',
    });
    console.log(`${name}: skills=${skills.length}, experience=${roles}, projects=1, receipt=PASS`);
  }
}
await fs.writeFile(
  path.join(output, `${before ? 'before' : 'after'}-selection-audit.json`),
  JSON.stringify(results, null, 2) + '\n'
);
