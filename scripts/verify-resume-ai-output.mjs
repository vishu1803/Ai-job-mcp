/** Synthetic accepted-provider content through the real shared generator/compiler. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { generateResumeContent } from '../src/services/resume-generation-content.service.js';
import { onePageResumeView } from '../src/services/one-page-resume.service.js';
import { LatexDocumentGenerator } from '../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { resumeQualityProfileByKey } from '../tests/fixtures/prd002-resume-profiles.js';
import { fixtureProvider } from '../tests/fixtures/resume-writing-provider.js';
import { closeDatabase } from '../src/db/index.js';

assert.equal(process.env.NODE_ENV, 'test', 'Synthetic fixture operation requires test environment');
const directory = path.resolve('output/unified-resume/accepted-provider');
await fs.mkdir(directory, { recursive: true });
const candidate = structuredClone(resumeQualityProfileByKey.student.profile);
const original = structuredClone(candidate);
const generator = new LatexDocumentGenerator();
const compiler = new LatexCompilerService();
const outputs = [];
try {
  for (const [key, title, requirements] of [
    ['backend', 'Backend Engineer', ['Node.js', 'PostgreSQL']],
    ['fullstack', 'Full-Stack Engineer', ['React', 'Node.js']],
  ]) {
    const jobPosting = {
      title,
      company: 'Synthetic Example',
      description: `${title} role requiring ${requirements.join(', ')} for event forms and lending endpoints.`,
      requirements,
    };
    const generated = await generateResumeContent({
      candidateProfile: candidate,
      jobPosting,
      selectedProjects: candidate.projects,
      selectedSkills: candidate.skills,
      projectRankings: candidate.projects.map((p, index) => ({
        projectId: p.id,
        projectName: p.name,
        status: 'SELECTED',
        relevanceScore: 100 - index,
        rank: index + 1,
      })),
      aiProvider: fixtureProvider(),
      generator,
      compiler,
    });
    assert.equal(generated.safeStructuredResume.writing.providerUsed, true);
    assert.equal(generated.safeEvidenceReceipt.overallStatus, 'PASS');
    const { texContent } = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume: generated.safeStructuredResume },
    });
    const compiled = await compiler.compileLatexToPdf({
      texContent,
      jobName: `synthetic-${key}`,
      strictOnePage: true,
    });
    assert.equal(compiled.pageCount, 1);
    const pdfName = `${key}.pdf`;
    await fs.writeFile(path.join(directory, pdfName), compiled.pdfBuffer);
    await fs.writeFile(
      path.join(directory, `${key}.json`),
      JSON.stringify(generated, null, 2) + '\n'
    );
    const selected = onePageResumeView(generated.safeStructuredResume);
    outputs.push({
      key,
      pdf: pdfName,
      summary: selected.summary.text,
      bullets: selected.projects.flatMap((p) => p.bullets.map((b) => b.text)),
      pdfHash: createHash('sha256').update(compiled.pdfBuffer).digest('hex'),
      compiler: compiled.compilerUsed,
      provider: generated.safeStructuredResume.writing.provider,
      providerUsed: true,
      pageCount: compiled.pageCount,
    });
  }
  assert.notEqual(outputs[0].summary, outputs[1].summary);
  assert.deepEqual(candidate, original);
  await fs.writeFile(
    path.join(directory, 'source-master.synthetic.json'),
    JSON.stringify(original, null, 2) + '\n'
  );
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    JSON.stringify(
      { synthetic: true, providerFixture: true, liveProvider: false, outputs },
      null,
      2
    ) + '\n'
  );
  console.log(
    JSON.stringify({
      directory,
      documents: outputs.length,
      providerWordingUsed: true,
      liveProvider: false,
    })
  );
} finally {
  await closeDatabase();
}
