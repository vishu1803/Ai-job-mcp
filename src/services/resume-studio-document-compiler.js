import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LatexCompilerService } from './latex-compiler.service.js';
import { LatexDocumentGenerator } from './latex-document-generator.service.js';
import { buildStudioDocx } from './native-docx-export.service.js';
import { studioDocumentContent } from './resume-studio-document-content.js';
import { AppError } from '../errors/index.js';

const inspector = fileURLToPath(new URL('../../scripts/inspect-studio-pdf.py', import.meta.url));
const layouts = [
  { marginIn: 0.6, lineHeight: 1.24, spacingPt: 2 },
  { marginIn: 0.52, lineHeight: 1.24, spacingPt: 1.5 },
  { marginIn: 0.5, lineHeight: 1.16, spacingPt: 1 },
  { marginIn: 0.5, lineHeight: 1.16, spacingPt: 0.5 },
];

class StudioPreviewCompiler extends LatexCompilerService {
  constructor(layout) {
    super({ logger: { info() {}, warn() {}, error() {} } });
    this.layout = layout;
  }
  _convertLatexToAtsHtml(tex) {
    const html = super._convertLatexToAtsHtml(tex),
      l = this.layout;
    return html.replace(
      '</style>',
      `@page {margin:${l.marginIn}in;} html,body,li {line-height:${l.lineHeight};} .candidate-name {line-height:1.35;} .candidate-headline,.contact-line,.links-line {line-height:1.30;} li {margin-bottom:${l.spacingPt}pt;} .section {margin-top:${l.spacingPt + 2}pt;} .section-title {margin:${l.spacingPt + 2}pt 0 ${l.spacingPt}pt;} p {margin-bottom:${l.spacingPt}pt;} </style>`
    );
  }
  // Preview may expose measured overflow. The export gate below is independent,
  // requires exactly one page, and never returns these overfull bytes as final.
  _assertStrictOnePage(bytes, count) {
    if (count === 1) super._assertStrictOnePage(bytes, count);
  }
}

function inspect(root) {
  return new Promise((resolve, reject) => {
    const defaultPythonPath = path.join(os.tmpdir(), 'product-pdf-inspection');
    const pythonPath =
      process.env.STUDIO_PDF_PYTHONPATH ||
      (fsSync.existsSync(defaultPythonPath) ? defaultPythonPath : undefined);
    const child = spawn(process.env.STUDIO_PDF_PYTHON || 'python', [inspector, root], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        ...(pythonPath ? { PYTHONPATH: pythonPath } : {}),
      },
    });
    let size = 0;
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      size += chunk.length;
      if (size > 65536) child.kill();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new AppError(
          'Document verifier unavailable. Configure the PDF inspection runtime.',
          503,
          'DOCUMENT_VERIFIER_UNAVAILABLE'
        )
      );
    }, 30000);
    child.on('error', () => {
      clearTimeout(timer);
      reject(
        new AppError(
          'Document verifier unavailable. Configure the PDF inspection runtime.',
          503,
          'DOCUMENT_VERIFIER_UNAVAILABLE'
        )
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else if (code === 42)
        reject(
          new AppError(
            'Selected content exceeds the preview page limit. Review the included content.',
            422,
            'DOCUMENT_REVIEW_REQUIRED'
          )
        );
      else
        reject(
          new AppError(
            'Document verification failed. Review source text or check the inspection runtime.',
            503,
            'DOCUMENT_VERIFIER_UNAVAILABLE'
          )
        );
    });
  });
}

export async function compileStudioDocument(draft) {
  const model = studioDocumentContent(draft);
  if (!model.content.candidateIdentity.displayName || !model.content.candidateIdentity.email)
    throw new AppError(
      'Add your name and email before compiling the document.',
      422,
      'DOCUMENT_IDENTITY_REQUIRED'
    );
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'career-studio-inspect-'));
  try {
    await fs.writeFile(path.join(root, 'input.json'), JSON.stringify(model));
    const { texContent } = new LatexDocumentGenerator().generateTailoredResumeLatex({
      applicationPackage: { structuredResume: model.render },
      layoutOverrides: { fontSize: 10 },
    });
    let result;
    for (const layout of layouts) {
      let compiled;
      try {
        compiled = await new StudioPreviewCompiler(layout).compileLatexToPdf({
          texContent,
          jobName: 'studio-resume',
          strictOnePage: true,
        });
      } catch (compileErr) {
        console.error(
          '[STUDIO COMPILE ERROR]:',
          compileErr?.message,
          compileErr?.code,
          compileErr?.stack
        );
        throw new AppError(
          'Document compiler unavailable. Retry or check the configured Chrome renderer.',
          503,
          'DOCUMENT_COMPILER_UNAVAILABLE'
        );
      }
      const docx = buildStudioDocx(model.blocks, layout);
      await fs.writeFile(path.join(root, 'resume.pdf'), compiled.pdfBuffer);
      await fs.writeFile(path.join(root, 'resume.docx'), docx);
      await inspect(root);
      const observed = JSON.parse(await fs.readFile(path.join(root, 'result.json'), 'utf8'));
      result = {
        pdf: compiled.pdfBuffer.toString('base64'),
        docx: docx.toString('base64'),
        png: observed.png,
        verification: {
          ...observed.verification,
          marginIn: layout.marginIn,
          lineHeight: layout.lineHeight,
          compiler: 'chrome_headless',
        },
        pageMap: observed.pageMap,
        selectedResume: model.content,
        text: observed.text,
      };
      if (!observed.verification.failedChecks.length) break;
      // Geometry cannot repair missing source text, unsafe glyphs or bad reading order.
      if (
        observed.verification.failedChecks.some(
          (check) => !['ONE_PAGE', 'MARGINS', 'OVERLAPS'].includes(check)
        )
      )
        break;
    }
    return result;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
