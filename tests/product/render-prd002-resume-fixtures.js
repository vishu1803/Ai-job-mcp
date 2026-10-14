/** Actual Chrome artifacts; synthetic source data only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { defaultAiResumeContentGenerator } from '../../src/services/ai-resume-content-generator.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import {
  fitOnePageResume,
  onePageResumeView,
  onePageResumeMarkdown,
} from '../../src/services/one-page-resume.service.js';
import { resumeQualityProfiles } from '../fixtures/prd002-resume-profiles.js';
const output = path.resolve(process.argv[2]);
await fs.mkdir(output, { recursive: true });
const generator = new LatexDocumentGenerator();
const compiler = new LatexCompilerService({
  pdflatexPath: 'missing-prd002-tex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null;
const results = [];
for (const { key, profile, jobPosting } of resumeQualityProfiles) {
  const projectRankings = profile.projects.map((p, index) => ({
    projectId: p.id,
    rank: index + 1,
    relevanceScore: 80,
    selectionStatus: 'SELECTED',
  }));
  const aiContent = await defaultAiResumeContentGenerator.generateResumeAiContent({
    candidateProfile: profile,
    targetJobPosting: jobPosting,
    selectedProjects: profile.projects,
    selectedSkills: profile.skills,
    aiProvider: false,
  });
  const snapshot = buildStructuredResumeSnapshot({
    candidateProfile: profile,
    jobPosting,
    options: { projectRankings, aiContent },
  });
  if (snapshot.evidenceValidationReceipt.overallStatus !== 'PASS')
    throw new Error(
      key + ': integrity ' + JSON.stringify(snapshot.evidenceValidationReceipt.violations)
    );
  try {
    const document = await fitOnePageResume(snapshot.structuredResume, jobPosting, {
      generator,
      compiler,
    });
    const tex = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume: document },
    }).texContent;
    const pdf = await compiler.compileLatexToPdf({
      texContent: tex,
      jobName: key,
      strictOnePage: true,
    });
    await fs.writeFile(path.join(output, key + '.pdf'), pdf.pdfBuffer);
    await fs.writeFile(path.join(output, key + '.tex'), tex);
    await fs.writeFile(path.join(output, key + '.json'), JSON.stringify(document, null, 2));
    await fs.writeFile(
      path.join(output, key + '.view.json'),
      JSON.stringify(onePageResumeView(document), null, 2)
    );
    await fs.writeFile(path.join(output, key + '.md'), onePageResumeMarkdown(document));
    results.push({
      key,
      status: 'PASS',
      pages: pdf.pageCount,
      pass: document.presentation.pass,
      omissions: document.presentation.decisions.length,
      projects: document.projects.length,
      selectedProjects: onePageResumeView(document).projects.length,
    });
  } catch (error) {
    if (error.code !== 'ONE_PAGE_OVERFLOW') throw error;
    results.push({ key, status: 'CONTROLLED_FAILURE', code: error.code, message: error.message });
  }
  console.log(JSON.stringify(results.at(-1)));
}
// Required genuinely unfit essential education cannot be silently removed.
const profile = structuredClone(resumeQualityProfiles[1].profile);
profile.education = Array.from({ length: 35 }, (_, index) => ({
  ...profile.education[0],
  id: 'degree-' + index,
  institution: 'Essential Synthetic Institution ' + index,
}));
const snapshot = buildStructuredResumeSnapshot({
  candidateProfile: profile,
  jobPosting: { title: 'Backend Developer' },
  options: { aiContent: { summary: { text: '' } } },
});
try {
  await fitOnePageResume(snapshot.structuredResume, {}, { generator, compiler });
  throw new Error('Unfit education was accepted');
} catch (error) {
  if (error.code !== 'ONE_PAGE_OVERFLOW') throw error;
  results.push({
    key: 'unfit-essential-education',
    status: 'CONTROLLED_FAILURE',
    code: error.code,
  });
}
await fs.writeFile(path.join(output, 'render-results.json'), JSON.stringify(results, null, 2));
