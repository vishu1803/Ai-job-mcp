/** Four identical synthetic source comparisons. Baseline uses an isolated HEAD loader. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { fitOnePageResume, onePageResumeView } from '../../src/services/one-page-resume.service.js';
import { resumeQualityProfileByKey } from '../fixtures/prd002-resume-profiles.js';
const before = process.argv.includes('--before');
const output = path.resolve(process.argv[2]);
await fs.mkdir(output, { recursive: true });
const generator = new LatexDocumentGenerator(),
  compiler = new LatexCompilerService({
    pdflatexPath: 'missing-comparison-tex',
    chromeTimeoutMs: 45000,
  });
compiler.tectonicPath = null;
for (const name of ['fresher', 'experienced', 'project-heavy', 'jd-tailored']) {
  const fixture = resumeQualityProfileByKey[name === 'jd-tailored' ? 'fullstack' : name];
  const jobPosting =
    name === 'jd-tailored'
      ? {
          title: 'Frontend Developer',
          description:
            'Build accessible React interfaces with TypeScript validation and keyboard navigation.',
        }
      : fixture.jobPosting;
  const candidateProfile = fixture.profile;
  const aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
    candidateProfile,
    targetJobPosting: jobPosting,
    selectedProjects: candidateProfile.projects,
    selectedSkills: candidateProfile.skills,
    aiProvider: false,
  });
  const projectRankings = candidateProfile.projects.map((p, index) => ({
    projectId: p.id,
    rank: index + 1,
    relevanceScore: 80,
    selectionStatus: 'SELECTED',
  }));
  const snapshot = buildStructuredResumeSnapshot({
    candidateProfile,
    jobPosting,
    options: { aiContent, projectRankings },
  });
  const document = before
    ? snapshot.structuredResume
    : await fitOnePageResume(snapshot.structuredResume, jobPosting, { generator, compiler });
  const tex = generator.generateTailoredResumeLatex({
    applicationPackage: { structuredResume: document },
  }).texContent;
  const compiled = await compiler.compileLatexToPdf({
    texContent: tex,
    jobName: name,
    strictOnePage: !before,
  });
  await fs.writeFile(path.join(output, name + '.pdf'), compiled.pdfBuffer);
  await fs.writeFile(path.join(output, name + '.tex'), tex);
  await fs.writeFile(path.join(output, name + '.json'), JSON.stringify(document, null, 2));
  await fs.writeFile(
    path.join(output, name + '.view.json'),
    JSON.stringify(onePageResumeView(document), null, 2)
  );
  console.log(
    name +
      ': ' +
      (before ? 'BEFORE' : 'AFTER') +
      ' receipt=' +
      snapshot.evidenceValidationReceipt.overallStatus +
      ' pages=' +
      (compiled.pageCount ?? 'inspect independently')
  );
}
