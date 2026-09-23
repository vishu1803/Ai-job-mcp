/**
 * @file Resilient LaTeX / PDF Compilation Service
 *
 * Compiles ATS-oriented LaTeX source documents into standard, selectable-text vector PDFs.
 *
 * Multi-Tier Compilation Strategy:
 * 1. Primary Engine: Tectonic (tools/bin/tectonic.exe or system PATH)
 *    - Standalone, hermetic XeTeX-based compiler with local format caching.
 * 2. Secondary Engine: System pdflatex / xelatex (if present on PATH).
 * 3. Resilient Fallback: Headless Chrome vector printer (--headless=new --print-to-pdf)
 *    - Translates semantic ATS document into crisp vector PDF if no native TeX compiler exists.
 *
 * Security & Sandboxing:
 * - Isolated temporary build directories per compilation job.
 * - Strict timeout enforcement (15s ceiling).
 * - Automatic cleanup of all build artifacts (.aux, .log, .out, .xdv).
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { logger } from '../utils/logger.js';

/**
 * Resolves the Chrome or Chromium executable across Windows, Linux, and CI environments.
 *
 * @returns {string} Executable path
 */
export function resolveChromeExecutable() {
  const configured = process.env.CHROME_BIN;
  if (configured && fsSync.existsSync(configured)) return configured;

  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  for (const candidate of [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  throw new Error('Chrome/Chromium executable not found. Set CHROME_BIN or install Chromium.');
}

export class LatexCompilerService {
  /**
   * @param {object} [options={}]
   * @param {string} [options.tectonicPath] Override path to tectonic binary
   * @param {string} [options.chromePath] Override path to chrome binary
   */
  constructor(options = {}) {
    this.logger = logger.child({ module: 'LatexCompilerService' });
    this.tectonicPath =
      options.tectonicPath || path.resolve(process.cwd(), 'tools', 'bin', 'tectonic.exe');
    if (options.chromePath) {
      this.chromePath = options.chromePath;
    } else {
      try {
        this.chromePath = resolveChromeExecutable();
      } catch {
        this.chromePath = null;
      }
    }
  }

  /**
   * Compiles LaTeX source text into a PDF binary buffer.
   *
   * @param {object} params
   * @param {string} params.texContent LaTeX source document
   * @param {string} [params.jobName='document'] Output file prefix
   * @returns {Promise<{ pdfBuffer: Buffer, texContent: string, compilerUsed: string, success: boolean }>}
   */
  async compileLatexToPdf({ texContent, jobName = 'document' }) {
    if (!texContent || typeof texContent !== 'string') {
      throw new Error('LaTeX content must be a non-empty string');
    }

    const runId = crypto.randomUUID();
    const workDir = path.join(os.tmpdir(), `career-hub-latex-${runId}`);
    await fs.mkdir(workDir, { recursive: true });

    const texFilePath = path.join(workDir, `${jobName}.tex`);
    const pdfFilePath = path.join(workDir, `${jobName}.pdf`);

    await fs.writeFile(texFilePath, texContent, 'utf8');

    try {
      // 1. Attempt Primary: Tectonic Compiler
      const tectonicAvailable = await this._binaryExists(this.tectonicPath);
      if (tectonicAvailable) {
        try {
          const result = await this._runCommand(
            this.tectonicPath,
            [texFilePath, '--outdir', workDir],
            { cwd: workDir, timeoutMs: 25000 }
          );

          if (result.exitCode === 0 && (await this._binaryExists(pdfFilePath))) {
            const pdfBuffer = this._normalizePdfMetadata(await fs.readFile(pdfFilePath));
            this.logger.info(
              { runId, compiler: 'tectonic' },
              'LaTeX compilation succeeded via Tectonic'
            );
            return {
              pdfBuffer,
              texContent,
              compilerUsed: 'tectonic',
              success: true,
            };
          }
        } catch (tectonicErr) {
          this.logger.warn(
            { error: tectonicErr.message },
            'Tectonic compilation failed, attempting fallback'
          );
        }
      }

      // 2. Attempt Secondary: System pdflatex
      try {
        const pdflatexResult = await this._runCommand(
          'pdflatex',
          ['-interaction=nonstopmode', '-output-directory', workDir, texFilePath],
          { cwd: workDir, timeoutMs: 20000 }
        );

        if (pdflatexResult.exitCode === 0 && (await this._binaryExists(pdfFilePath))) {
          const pdfBuffer = this._normalizePdfMetadata(await fs.readFile(pdfFilePath));
          this.logger.info(
            { runId, compiler: 'pdflatex' },
            'LaTeX compilation succeeded via pdflatex'
          );
          return {
            pdfBuffer,
            texContent,
            compilerUsed: 'pdflatex',
            success: true,
          };
        }
      } catch {
        // Fall through to Headless Chrome
      }

      // 3. Resilient Fallback: Headless Chrome Vector PDF
      this.logger.info({ runId }, 'Compiling document via Headless Chrome vector printer fallback');
      const fallbackHtml = this._convertLatexToAtsHtml(texContent);
      const htmlPath = path.join(workDir, `${jobName}.html`);
      await fs.writeFile(htmlPath, fallbackHtml, 'utf8');

      const executable = this.chromePath || resolveChromeExecutable();
      const chromeResult = await this._runCommand(
        executable,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--no-pdf-header-footer',
          `--print-to-pdf=${pdfFilePath}`,
          htmlPath,
        ],
        { cwd: workDir, timeoutMs: 15000 }
      );

      if (chromeResult.exitCode === 0 && (await this._binaryExists(pdfFilePath))) {
        const pdfBuffer = this._normalizePdfMetadata(await fs.readFile(pdfFilePath));
        return {
          pdfBuffer,
          texContent,
          compilerUsed: 'chrome_headless',
          success: true,
        };
      }

      throw new Error('All LaTeX and PDF compilation engines failed to produce output');
    } finally {
      // Safe cleanup of sandbox directory
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Checks if an executable exists at the given path.
   *
   * @private
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  async _binaryExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes wall-clock variability from compiler-generated PDF metadata while
   * preserving the PDF's byte layout. Chrome's vector-print fallback writes
   * CreationDate and ModDate values on every run; replacing only the 14-digit
   * timestamp with a same-length fixed value keeps identical document inputs
   * byte-deterministic without weakening artifact hash verification.
   *
   * @private
   * @param {Buffer} pdfBuffer
   * @returns {Buffer}
   */
  _normalizePdfMetadata(pdfBuffer) {
    if (!Buffer.isBuffer(pdfBuffer)) return pdfBuffer;

    const latin1 = pdfBuffer.toString('latin1');
    const normalized = latin1.replace(
      /(\/(?:CreationDate|ModDate)\s*\(D:)\d{14}([+-]\d{2}'\d{2}'|Z)(\))/g,
      '$120000101000000$2$3'
    );
    return normalized === latin1 ? pdfBuffer : Buffer.from(normalized, 'latin1');
  }

  /**
   * Spawns an external CLI process with timeout and standard output capture.
   *
   * @private
   * @param {string} cmd
   * @param {Array<string>} args
   * @param {object} options
   * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
   */
  _runCommand(cmd, args, { cwd, timeoutMs = 15000 }) {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, {
        cwd,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Compilation command '${cmd}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    });
  }

  /**
   * Generates a semantic, single-column HTML representation matching the LaTeX ATS resume.
   * Used as the resilient fallback for Chrome headless vector PDF printing.
   *
   * @private
   * @param {string} texContent
   * @returns {string} Clean HTML
   */
  _convertLatexToAtsHtml(texContent) {
    const cleanLatexText = (text) => {
      if (!text) return '';
      return text
        .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '<a href="$1">$2</a>')
        .replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
        .replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
        .replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>')
        .replace(/\\setlength\s*\\[a-zA-Z]+\s*\{?[^}\s]*\}?/g, '')
        .replace(/\\setlength\{?\\[a-zA-Z]+\}?\{?[^}\s]*\}?/g, '')
        .replace(/\\small\b/g, '')
        .replace(/\\large\b/g, '')
        .replace(/\\Huge\b/g, '')
        .replace(/\\LARGE\b/g, '')
        .replace(/\\normalsize\b/g, '')
        .replace(/\\scshape\b/g, '')
        .replace(/\\bfseries\b/g, '')
        .replace(/\\itshape\b/g, '')
        .replace(/\\noindent\b/g, '')
        .replace(/\\centering\b/g, '')
        .replace(/\\raggedright\b/g, '')
        .replace(/\\hfill\b/g, ' ')
        .replace(/\\par\b/g, '')
        .replace(/\\vspace\{[^}]+\}/g, '')
        .replace(/\\hspace\{[^}]+\}/g, '')
        .replace(/\\hrule\s+height\s+[^\\ \n]+/g, '')
        .replace(/\\hrule\b/g, '')
        .replace(/\\\\/g, '<br>')
        .replace(/\\&/g, '&')
        .replace(/\\%/g, '%')
        .replace(/\\\$/g, '$')
        .replace(/\\#/g, '#')
        .replace(/\\_/g, '_')
        .replace(/\\\{/g, '{')
        .replace(/\\\}/g, '}')
        .replace(/\\textasciitilde\{\}/g, '~')
        .replace(/\\textasciicircum\{\}/g, '^')
        .replace(/\$\\cdot\$/g, '·')
        .replace(/\\cdot\b/g, '·')
        .replace(/---/g, '—')
        .replace(/--/g, '–')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/\{([^{}]+)\}/g, '$1')
        .replace(/\{|\}/g, '')
        .trim();
    };

    // Extract body between \begin{document} and \end{document}
    let body = texContent;
    const docMatch = texContent.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (docMatch) {
      body = docMatch[1];
    }

    // Remove LaTeX comments
    body = body
      .split('\n')
      .map((line) => line.replace(/(^|[^\\])%.*$/, '$1'))
      .join('\n');

    // Extract candidate name
    let candidateName = '';
    const nameMatch =
      body.match(/\\(?:Huge|LARGE|large)\s*\\textbf\{([^}]+)\}/) ||
      body.match(/\\textbf\{\\Huge\s+([^}]+)\}/) ||
      body.match(/\\textbf\{([^}]+)\}/);
    if (nameMatch) {
      candidateName = cleanLatexText(nameMatch[1]);
    } else {
      const firstLine =
        body
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)[0] || '';
      candidateName = cleanLatexText(firstLine) || 'Candidate';
    }

    // Extract headline if present
    let headline = '';
    const headlineMatch = body.match(/\\(?:large|normalsize)\s*\\textbf\{([^}]+)\}/);
    if (headlineMatch && cleanLatexText(headlineMatch[1]) !== candidateName) {
      headline = cleanLatexText(headlineMatch[1]);
    }

    // Split into sections
    const sectionSplitter = /\\(?:atsfirstsection|atssection|section\*?)\{([^}]+)\}/g;
    const sections = [];
    let preHeader = '';

    const headerEnd = body.search(/\\(?:atsfirstsection|atssection|section\*?)\{/);
    if (headerEnd !== -1) {
      preHeader = body.slice(0, headerEnd);
      sectionSplitter.lastIndex = headerEnd;
    } else {
      preHeader = body;
    }

    // Extract contact line from preHeader
    let contactHtml = '';
    const contactLines = preHeader
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.includes(candidateName) && (!headline || !l.includes(headline)));
    if (contactLines.length > 0) {
      const rawContact = contactLines.join(' ');
      contactHtml = cleanLatexText(rawContact);
    }

    let match;
    while ((match = sectionSplitter.exec(body)) !== null) {
      const title = match[1];
      const startIndex = sectionSplitter.lastIndex;
      const nextMatch = body
        .slice(startIndex)
        .search(/\\(?:atsfirstsection|atssection|section\*?)\{/);
      const content =
        nextMatch !== -1 ? body.slice(startIndex, startIndex + nextMatch) : body.slice(startIndex);
      sections.push({ title: cleanLatexText(title), content });
    }

    let htmlBody = `<div class="header">
    <h1 class="candidate-name">${candidateName}</h1>
    ${headline ? `<div class="candidate-headline">${headline}</div>` : ''}
    ${contactHtml ? `<div class="contact-line">${contactHtml}</div>` : ''}
  </div>`;

    if (sections.length === 0) {
      const cleaned = cleanLatexText(body);
      htmlBody += `<div class="content">${cleaned
        .split('\n\n')
        .map((p) => `<p>${cleanLatexText(p)}</p>`)
        .join('')}</div>`;
    } else {
      for (const sec of sections) {
        htmlBody += `<div class="section">
        <div class="section-title">${sec.title}</div>`;

        const chunks = sec.content.split(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/);
        for (let i = 0; i < chunks.length; i++) {
          if (i % 2 === 1) {
            const items = chunks[i]
              .split(/\\item\b/)
              .map((it) => it.trim())
              .filter(Boolean);
            if (items.length > 0) {
              htmlBody += `<ul>${items.map((it) => `<li>${cleanLatexText(it)}</li>`).join('')}</ul>`;
            }
          } else {
            const textChunk = chunks[i].trim();
            if (textChunk) {
              const paragraphs = textChunk
                .split(/(?:\\par|\n\s*\n)/)
                .map((p) => p.trim())
                .filter(Boolean);
              for (const p of paragraphs) {
                const cleanedP = cleanLatexText(p);
                if (cleanedP) {
                  htmlBody += `<p>${cleanedP}</p>`;
                }
              }
            }
          }
        }
        htmlBody += `</div>`;
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${candidateName} - Resume</title>
  <style>
    @page {
      size: letter;
      margin: 0.38in 0.48in;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.22;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      text-align: center;
      margin-bottom: 3pt;
    }
    .candidate-name {
      font-size: 16pt;
      font-weight: 700;
      margin: 0 0 1pt;
      line-height: 1.1;
      text-align: center;
    }
    .candidate-headline {
      font-size: 9.5pt;
      font-weight: 600;
      margin: 0 0 1pt;
      text-align: center;
    }
    .contact-line {
      font-size: 8.5pt;
      color: #222222;
      margin: 0 0 3pt;
      text-align: center;
    }
    .section {
      margin-top: 3pt;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 700;
      border-bottom: 0.5pt solid #000000;
      padding-bottom: 1pt;
      margin: 3.5pt 0 1.5pt;
    }
    p {
      margin: 0 0 1.5pt;
    }
    ul {
      margin: 1pt 0 2pt 14pt;
      padding: 0;
    }
    li {
      margin-bottom: 0.5pt;
      line-height: 1.2;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
  </style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;
  }
}
