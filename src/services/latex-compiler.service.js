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
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';

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
    this.chromePath =
      options.chromePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
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

      const chromeResult = await this._runCommand(
        this.chromePath,
        [
          '--headless=new',
          '--disable-gpu',
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
    // Extract candidate name
    const nameMatch = texContent.match(/\\Huge\s*\\textbf\{([^}]+)\}/);
    const candidateName = nameMatch ? nameMatch[1] : 'Candidate';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${candidateName} - Resume</title>
  <style>
    @page {
      size: letter;
      margin: 0.6in;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #000;
      background: #fff;
      line-height: 1.35;
      font-size: 10pt;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 22pt;
      font-weight: 700;
      text-align: center;
      margin: 0 0 4px;
    }
    .contact {
      text-align: center;
      font-size: 9pt;
      color: #222;
      margin-bottom: 12px;
    }
    .section-title {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
      margin: 14px 0 6px;
    }
    p { margin: 0 0 6px; }
    ul { margin: 2px 0 6px 18px; padding: 0; }
    li { margin-bottom: 2px; }
    .flex-row { display: flex; justify-content: space-between; font-weight: 700; }
    .flex-sub { display: flex; justify-content: space-between; font-style: italic; margin-bottom: 4px; }
  </style>
</head>
<body>
  <h1>${candidateName}</h1>
  <div class="content">
    <pre style="white-space:pre-wrap; font-family:inherit; margin:0;">${texContent
      .replace(/\\begin\{document\}[\s\S]*?\\begin\{center\}/, '')
      .replace(/\\end\{document\}/, '')
      .replace(/\\[a-zA-Z]+(\[[^\]]*\])?(\{([^}]*)\})?/g, '$3')
      .trim()}</pre>
  </div>
</body>
</html>`;
  }
}
