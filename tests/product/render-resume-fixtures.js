/** Controlled local artifact-boundary probe; no provider/database/external action.
 * Usage: node tests/product/render-resume-fixtures.js <existing-or-new-temp-output-dir>
 * Uses the real headless Chrome fallback deliberately, not a compiler mock. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { countPdfPages } from '../../src/services/resume-quality-assessment.service.js';

const outputDirectory = path.resolve(process.argv[2]);
await fs.mkdir(outputDirectory, { recursive: true });
const compiler = new LatexCompilerService({
  pdflatexPath: 'nonexistent-audit-pdflatex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null; // Avoid TeX bundle/bootstrap network dependencies for this fallback-specific probe.
const generator = new LatexDocumentGenerator();
const parser = new ResumeParserService();
const baseline = {
  displayName: 'Synthetic Candidate',
  canonicalEmail: 'candidate@example.test',
  headline: 'Software Developer',
  skills: [],
  projects: [],
};
const projects = Array.from({ length: 5 }, (_, index) => ({
  id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
  name: `Synthetic Portfolio Project ${index + 1}`,
  technologies: ['JavaScript'],
  description: 'A candidate-authored web project.',
  bullets: [
    'Built web interfaces for a synthetic portfolio project.',
    'Implemented input validation for local forms.',
  ],
  repositoryUrl: `https://github.com/synthetic-example/project-${index + 1}`,
}));
const student = {
  ...baseline,
  displayName: 'Synthetic Student',
  projects,
  education: [
    {
      institution: 'Synthetic University',
      degree: 'BEng',
      startDate: '2023-09',
      endDate: '2027-06',
      isCurrent: true,
    },
  ],
};
const experienced = {
  ...baseline,
  displayName: 'Synthetic Professional',
  experience: Array.from({ length: 9 }, (_, index) => ({
    title: `Software Engineer ${index + 1}`,
    company: `Synthetic Employer ${index + 1}`,
    startDate: `${2025 - index}-01`,
    endDate: `${2025 - index}-12`,
    bullets: [
      'Implemented maintainable web services using JavaScript and PostgreSQL for internal workflows.',
      'Built structured validation and error handling for service requests.',
      'Documented integration behavior and wrote focused regression checks.',
    ],
  })),
  education: [
    { institution: 'Synthetic Institute', degree: 'BEng', startDate: '2010', endDate: '2014' },
  ],
};
const unicode = {
  ...baseline,
  displayName: 'Synthetic José 林',
  projects: [
    {
      ...projects[0],
      name: 'A very long synthetic project title '.repeat(4),
      bullets: ['Built Unicode interfaces for naïve café customers with résumé data.'],
      repositoryUrl: 'https://github.com/synthetic-example/' + 'long-project-name-'.repeat(15),
    },
  ],
};
const results = [];
for (const [persona, candidateProfile] of Object.entries({
  incomplete: baseline,
  student,
  experienced,
  unicode,
})) {
  try {
    const snapshot = buildStructuredResumeSnapshot({
      candidateProfile,
      jobPosting: { title: 'Software Developer' },
    }); // Standalone/base rendering, no invented job eligibility.
    const resume = snapshot.structuredResume;
    const { texContent } = generator.generateTailoredResumeLatex({
      applicationPackage: { structuredResume: resume, targetJob: { title: 'Software Developer' } },
    });
    await fs.writeFile(path.join(outputDirectory, `${persona}.tex`), texContent);
    const compiled = await compiler.compileLatexToPdf({ texContent, jobName: persona });
    await fs.writeFile(path.join(outputDirectory, `${persona}.pdf`), compiled.pdfBuffer);
    const extractedText = parser.extractRawText({ buffer: compiled.pdfBuffer, format: 'PDF' });
    await fs.writeFile(path.join(outputDirectory, `${persona}.txt`), extractedText);
    results.push({
      persona,
      receiptStatus: snapshot.evidenceValidationReceipt.overallStatus,
      receiptViolations: snapshot.evidenceValidationReceipt.violations.map((v) => v.violationType),
      compiler: compiled.compilerUsed,
      bytes: compiled.pdfBuffer.length,
      pageCount: countPdfPages(compiled.pdfBuffer),
      selectedProjects: resume.projects.length,
      experienceRecords: resume.experience.length,
      extractedCharacters: extractedText.length,
      nameExtracted: extractedText.includes(candidateProfile.displayName),
    });
  } catch (error) {
    results.push({ persona, blockedOrFailed: true, reason: error.message });
  }
}
await fs.writeFile(path.join(outputDirectory, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
