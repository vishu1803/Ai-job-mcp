/** Real Chrome documents; these lower-level source probes are not approved application packages. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { profile } from '../fixtures/prd003-resume-profile.js';

const output = path.resolve(process.argv[2]);
await fs.mkdir(output, { recursive: true });
const compiler = new LatexCompilerService({
  pdflatexPath: 'nonexistent-prd003-pdflatex',
  chromeTimeoutMs: 45000,
});
compiler.tectonicPath = null;
const fixtures = {
  student: { ...profile, experience: [] },
  'experienced-multipage': {
    ...profile,
    headline: 'Research Engineer',
    experience: Array.from({ length: 20 }, (_, i) => ({
      id: 'role-' + i,
      title: 'Research Engineer',
      company: 'Fixture Employer ' + (i + 1),
      startDate: String(1990 + i),
      endDate: String(1991 + i),
      location: 'Remote',
      technologies: ['C++', 'Python'],
      bullets: [
        'Documented accessible research interfaces and implemented candidate-provided engineering workflows.',
        'Reviewed user interaction requirements and maintained source documentation for research collaborators.',
      ],
    })),
  },
  'long-fields': {
    ...profile,
    education: [
      {
        ...profile.education[0],
        honors: [
          'Research on A&B interfaces: 50% is a candidate-provided label, using C++ and symbols _ # $ { } ~ ^ \\.',
        ],
      },
    ],
    publications: [
      {
        ...profile.publications[0],
        title: 'Accessible Systems and International Interfaces '.repeat(6),
        url: 'https://journal.example.test/' + 'long-path/'.repeat(30) + '?a=1&b=2',
      },
    ],
  },
};
for (const [name, candidateProfile] of Object.entries(fixtures)) {
  const document = buildStructuredResumeDocument({
    candidateProfile,
    jobPosting: { title: 'Research Assistant' },
  });
  const tex = new LatexDocumentGenerator().generateTailoredResumeLatex({
    applicationPackage: { structuredResume: document },
  }).texContent;
  const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: name });
  await fs.writeFile(path.join(output, name + '.pdf'), result.pdfBuffer);
  await fs.writeFile(path.join(output, name + '.tex'), tex);
  await fs.writeFile(path.join(output, name + '.json'), JSON.stringify(document, null, 2));
  console.log(name + ': ' + result.compilerUsed + ', ' + result.pdfBuffer.length + ' bytes');
}
