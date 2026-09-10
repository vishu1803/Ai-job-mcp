import fs from 'node:fs';

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(`${ROOT}/${rel}`, 'utf8');
}

function write(rel, content) {
  fs.writeFileSync(`${ROOT}/${rel}`, content, 'utf8');
}

function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`P16-001G patch target not found: ${label}`);
  }
  const first = source.indexOf(needle, index + 1);
  if (first !== -1) {
    throw new Error(`P16-001G patch target is ambiguous: ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

const strategyPath = 'src/services/resume-content-strategy.service.js';
const strategy = read(strategyPath);
const strategyNeedle = "import { TenureCalculator } from '../utils/tenure-calculator.js';\n";
const strategyReplacement = `${strategyNeedle}\nimport { compressProfessionalBullet, polishProfessionalSummary } from './resume-professional-composition.service.js';\n`;
write(strategyPath, replaceOnce(strategy, strategyNeedle, strategyReplacement, 'strategy imports'));

const servicePath = 'src/services/structured-resume.service.js';
let service = read(servicePath);
const serviceImportNeedle = "import { CandidateArtifactContentService } from './candidate-artifact-content.service.js';\n";
const serviceImportReplacement = `${serviceImportNeedle}import { composeStructuredResumeDocument } from './resume-professional-composition.service.js';\n`;
service = replaceOnce(service, serviceImportNeedle, serviceImportReplacement, 'structured service import');
service = replaceOnce(
  service,
  '  return StructuredResumeDocumentSchema.parse(doc);\n',
  '  const composedDoc = composeStructuredResumeDocument(doc);\n  return StructuredResumeDocumentSchema.parse(composedDoc);\n',
  'structured document return'
);
write(servicePath, service);

const latexPath = 'src/services/latex-document-generator.service.js';
let latex = read(latexPath);
latex = replaceOnce(
  latex,
  "? `\\\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.slice(0, 6).join(', '))}}`\n",
  "? `\\\\textit{Relevant Coursework: ${escapeLatex(edu.coursework.join(', '))}}`\n",
  'all education coursework rendering'
);

const preambleNeedle = "\\\\usepackage[T1]{fontenc}\n\\\\usepackage[margin=0.5in]{geometry}\n\\\\usepackage{hyperref}\n";
const preambleReplacement = "\\\\usepackage[T1]{fontenc}\n\\\\renewcommand{\\\\familydefault}{\\\\sfdefault}\n\\\\usepackage[margin=0.5in]{geometry}\n\\\\usepackage{hyperref}\n";
latex = replaceOnce(latex, preambleNeedle, preambleReplacement, 'modern sans-serif preamble');

latex = replaceOnce(
  latex,
  '{\\\\Huge \\\\textbf{${escapeLatex(candidateName)}}}\\\\par',
  '{\\\\LARGE \\\\textbf{${escapeLatex(candidateName)}}}\\\\par',
  'header name size'
);
latex = replaceOnce(
  latex,
  '{\\\\large \\\\textbf{${escapeLatex(candidateHeadline)}}}\\\\par',
  '{\\\\normalsize \\\\textbf{${escapeLatex(candidateHeadline)}}}\\\\par',
  'header headline size'
);

const sectionMacroNeedle = `\\\\newcommand{\\\\atssection}[1]{%\n  \\\\vspace{\\\\atsSectionToSection}%\n  {\\\\noindent\\\\large\\\\textbf{\\\\uppercase{#1}}}\\\\par\n  \\\\vspace{1.5pt}\\\\hrule\\\\vspace{\\\\atsHeadingToContent}%\n}\n`;
const sectionMacroReplacement = `\\\\newcommand{\\\\atssection}[1]{%\n  \\\\vspace{\\\\atsSectionToSection}%\n  {\\\\noindent\\\\normalsize\\\\bfseries\\\\uppercase{#1}}\\\\par\n  \\\\vspace{1pt}\\\\hrule height 0.6pt\\\\vspace{\\\\atsHeadingToContent}%\n}\n`;
latex = replaceOnce(latex, sectionMacroNeedle, sectionMacroReplacement, 'section macro');

const firstSectionNeedle = `\\\\newcommand{\\\\atsfirstsection}[1]{%\n  \\\\vspace{\\\\atsHeaderToSection}%\n  {\\\\noindent\\\\large\\\\textbf{\\\\uppercase{#1}}}\\\\par\n  \\\\vspace{1.5pt}\\\\hrule\\\\vspace{\\\\atsHeadingToContent}%\n}\n`;
const firstSectionReplacement = `\\\\newcommand{\\\\atsfirstsection}[1]{%\n  \\\\vspace{\\\\atsHeaderToSection}%\n  {\\\\noindent\\\\normalsize\\\\bfseries\\\\uppercase{#1}}\\\\par\n  \\\\vspace{1pt}\\\\hrule height 0.6pt\\\\vspace{\\\\atsHeadingToContent}%\n}\n`;
latex = replaceOnce(latex, firstSectionNeedle, firstSectionReplacement, 'first section macro');
write(latexPath, latex);

console.log('P16-001G source patch applied');
