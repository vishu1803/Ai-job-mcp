/**
 * @file Resilient LaTeX / PDF Compilation Service
 *
 * Compiles ATS-oriented LaTeX source documents into standard, selectable-text vector PDFs.
 *
 * Multi-Tier Compilation Strategy (provider-neutral: every engine is discovered and
 * invoked through the same abstraction, none is platform-baked):
 * 1. Primary Engine: Tectonic — resolved from an explicit override, `TECTONIC_BIN`,
 *    the repo-local `tools/bin/tectonic[.exe]`, or the system PATH.
 *    - Standalone, hermetic XeTeX-based compiler with local format caching.
 * 2. Secondary Engine: System pdflatex / xelatex (if present on PATH).
 * 3. Resilient Fallback: Headless Chrome vector printer (--headless=new --print-to-pdf)
 *    - Translates semantic ATS document into crisp vector PDF if no native TeX compiler exists.
 *
 * Security & Sandboxing:
 * - Isolated temporary build directories per compilation job.
 * - Explicit, configurable per-engine timeouts (options or PDF_COMPILE_*_TIMEOUT_MS env).
 * - Automatic cleanup of all build artifacts (.aux, .log, .out, .xdv).
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';

let cachedFontFaces = null;
function getLatinModernFontFaces() {
  if (cachedFontFaces !== null) return cachedFontFaces;
  try {
    const fontsDir = fileURLToPath(new URL('../assets/fonts/latin-modern', import.meta.url));
    const reg = fsSync
      .readFileSync(path.join(fontsDir, 'lmroman-regular-webfont.ttf'))
      .toString('base64');
    const bold = fsSync
      .readFileSync(path.join(fontsDir, 'lmroman-bold-webfont.ttf'))
      .toString('base64');
    const italic = fsSync
      .readFileSync(path.join(fontsDir, 'lmroman-italic-webfont.ttf'))
      .toString('base64');
    const boldItalic = fsSync
      .readFileSync(path.join(fontsDir, 'lmroman-bolditalic-webfont.ttf'))
      .toString('base64');
    cachedFontFaces = `
    @font-face {
      font-family: 'Latin Modern Roman';
      src: url('data:font/truetype;base64,${reg}') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Latin Modern Roman';
      src: url('data:font/truetype;base64,${bold}') format('truetype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Latin Modern Roman';
      src: url('data:font/truetype;base64,${italic}') format('truetype');
      font-weight: 400;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: 'Latin Modern Roman';
      src: url('data:font/truetype;base64,${boldItalic}') format('truetype');
      font-weight: 700;
      font-style: italic;
      font-display: swap;
    }`;
  } catch {
    cachedFontFaces = '';
  }
  return cachedFontFaces;
}

/**
 * Locates an executable on the system PATH without shelling out.
 *
 * @param {string} name Bare executable name (e.g. 'tectonic')
 * @returns {string|null} Absolute path when found, otherwise null
 */
function findExecutableOnPath(name) {
  const pathExt = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const separator = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH || '').split(separator).filter(Boolean);

  for (const dir of dirs) {
    for (const ext of pathExt) {
      const candidate = path.join(dir, `${name}${ext}`);
      try {
        if (fsSync.existsSync(candidate)) return candidate;
      } catch {
        // Unreadable PATH entry; keep searching
      }
    }
  }
  return null;
}

/**
 * Resolves the Chrome or Chromium executable across Windows, Linux, and CI environments.
 *
 * @returns {string} Executable path
 * @throws {Error} When no Chrome/Chromium installation can be located
 */
export function resolveChromeExecutable() {
  const configured = process.env.CHROME_BIN;
  if (configured && fsSync.existsSync(configured)) return configured;

  const platformCandidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ]
      : [
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
        ];

  for (const candidate of platformCandidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }

  // Final resort: PATH lookup by conventional binary name.
  for (const name of ['chromium', 'chromium-browser', 'google-chrome', 'chrome']) {
    const resolved = findExecutableOnPath(name);
    if (resolved) return resolved;
  }

  throw new Error('Chrome/Chromium executable not found. Set CHROME_BIN or install Chromium.');
}

/**
 * Resolves the Tectonic executable deterministically across platforms.
 *
 * Precedence:
 * 1. Explicit `options.tectonicPath` (test/embedding override)
 * 2. `TECTONIC_BIN` environment variable (used by Linux CI installs)
 * 3. Repo-local `tools/bin/tectonic[.exe]`
 * 4. System PATH
 *
 * @param {string} [override] Explicit path override
 * @returns {string|null} Resolved executable path, or null when unavailable
 */
export function resolveTectonicExecutable(override) {
  const explicit = [override, process.env.TECTONIC_BIN].filter(Boolean);
  for (const candidate of explicit) {
    try {
      if (fsSync.existsSync(candidate)) return candidate;
    } catch {
      // Invalid override; fall through to conventional locations
    }
  }

  const localBinary = path.resolve(
    process.cwd(),
    'tools',
    'bin',
    process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'
  );
  if (fsSync.existsSync(localBinary)) return localBinary;

  return findExecutableOnPath('tectonic');
}

/**
 * Resolves an explicit, configurable timeout in milliseconds.
 * Explicit constructor options win, then environment overrides, then the fallback.
 *
 * @param {number|undefined} optionValue Explicit per-instance value
 * @param {string} envName Environment variable name
 * @param {number} fallback Default ceiling
 * @returns {number} Positive timeout in milliseconds
 */
function resolveTimeoutMs(optionValue, envName, fallback) {
  const raw = optionValue ?? process.env[envName];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Default per-engine compile ceilings. These are deliberately generous: TeX engines
 * may need to bootstrap their format/bundle cache on a cold CI runner, and headless
 * Chromium cold-starts slowly in constrained containers. Every ceiling is explicitly
 * overridable per instance or through the environment rather than hard-coded inline.
 */
export const DEFAULT_COMPILE_TIMEOUTS_MS = Object.freeze({
  tectonic: 180000,
  pdflatex: 120000,
  chrome: 90000,
});

export class LatexCompilerService {
  /**
   * @param {object} [options={}]
   * @param {string} [options.tectonicPath] Override path to tectonic binary
   * @param {string} [options.chromePath] Override path to chrome binary
   * @param {string} [options.pdflatexPath] Override path to pdflatex binary
   * @param {number} [options.tectonicTimeoutMs] Explicit Tectonic compile ceiling
   * @param {number} [options.pdflatexTimeoutMs] Explicit pdflatex compile ceiling
   * @param {number} [options.chromeTimeoutMs] Explicit headless-Chrome compile ceiling
   */
  constructor(options = {}) {
    this.logger = logger.child({ module: 'LatexCompilerService' });
    this.tectonicPath = resolveTectonicExecutable(options.tectonicPath);
    this.pdflatexPath = options.pdflatexPath || 'pdflatex';
    if (options.chromePath) {
      this.chromePath = options.chromePath;
    } else {
      try {
        this.chromePath = resolveChromeExecutable();
      } catch {
        this.chromePath = null;
      }
    }

    this.timeouts = {
      tectonic: resolveTimeoutMs(
        options.tectonicTimeoutMs,
        'PDF_COMPILE_TECTONIC_TIMEOUT_MS',
        DEFAULT_COMPILE_TIMEOUTS_MS.tectonic
      ),
      pdflatex: resolveTimeoutMs(
        options.pdflatexTimeoutMs,
        'PDF_COMPILE_PDFLATEX_TIMEOUT_MS',
        DEFAULT_COMPILE_TIMEOUTS_MS.pdflatex
      ),
      chrome: resolveTimeoutMs(
        options.chromeTimeoutMs,
        'PDF_COMPILE_CHROME_TIMEOUT_MS',
        DEFAULT_COMPILE_TIMEOUTS_MS.chrome
      ),
    };
  }

  /**
   * Compiles LaTeX source text into a PDF binary buffer.
   *
   * @param {object} params
   * @param {string} params.texContent LaTeX source document
   * @param {string} [params.jobName='document'] Output file prefix
   * @param {boolean} [params.strictOnePage=false] Use the A4 Chrome renderer and fail closed on overflow
   * @returns {Promise<{ pdfBuffer: Buffer, texContent: string, compilerUsed: string, success: boolean }>}
   */
  async compileLatexToPdf({ texContent, jobName = 'document', strictOnePage = false }) {
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
      const tectonicAvailable =
        !strictOnePage &&
        Boolean(this.tectonicPath) &&
        (await this._binaryExists(this.tectonicPath));
      if (tectonicAvailable) {
        try {
          const result = await this._runCommand(
            this.tectonicPath,
            [texFilePath, '--outdir', workDir],
            { cwd: workDir, timeoutMs: this.timeouts.tectonic }
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
      if (!strictOnePage) {
        try {
          const pdflatexResult = await this._runCommand(
            this.pdflatexPath,
            ['-interaction=nonstopmode', '-output-directory', workDir, texFilePath],
            { cwd: workDir, timeoutMs: this.timeouts.pdflatex }
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
          `--user-data-dir=${path.join(workDir, 'chrome-profile')}`,
          `--print-to-pdf=${pdfFilePath}`,
          htmlPath,
        ],
        { cwd: workDir, timeoutMs: this.timeouts.chrome }
      );

      if (chromeResult.exitCode === 0 && (await this._binaryExists(pdfFilePath))) {
        const pdfBuffer = this._normalizePdfMetadata(await fs.readFile(pdfFilePath));
        const pageCount = new PdfGeometryAnalyzer()._detectPageCount(pdfBuffer);
        if (strictOnePage) this._assertStrictOnePage(pdfBuffer, pageCount);
        return {
          pdfBuffer,
          texContent,
          compilerUsed: 'chrome_headless',
          pageCount,
          success: true,
        };
      }

      const attempted = [
        tectonicAvailable ? `tectonic (${this.tectonicPath})` : 'tectonic (unavailable)',
        `pdflatex (${this.pdflatexPath})`,
        `chrome (${executable}, exit ${chromeResult.exitCode})`,
      ].join(', ');
      throw new Error(
        `All LaTeX and PDF compilation engines failed to produce output. Tried: ${attempted}`
      );
    } finally {
      // Safe cleanup of sandbox directory
      try {
        await fs.rm(workDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /** The bounded Chrome printer emits ordinary page objects and MediaBox entries.
   * Require agreement between its leaf pages and the existing page-tree detector;
   * unknown or inconsistent output is never accepted as one physical page.
   */
  _assertStrictOnePage(pdfBuffer, pageCount) {
    const pdfText = pdfBuffer.toString('latin1');
    const leafCount = (pdfText.match(/\/Type\s*\/Page\b/g) || []).length;
    if (!Number.isInteger(pageCount) || pageCount < 1 || leafCount !== pageCount) {
      throw Object.assign(
        new Error(
          'Cannot verify the physical PDF page count. Retry strict export with the supported Chrome renderer.'
        ),
        {
          code: 'ONE_PAGE_UNVERIFIABLE',
          statusCode: 422,
        }
      );
    }
    if (pageCount !== 1) {
      throw Object.assign(
        new Error(
          `Strict one-page resume produced ${pageCount} pages. Select fewer relevant bullets or optional entries, or shorten verbose descriptions; saved candidate information is preserved.`
        ),
        {
          code: 'ONE_PAGE_OVERFLOW',
          statusCode: 422,
          details: { pageCount, targetPageCount: 1 },
        }
      );
    }
    const boxes = [
      ...pdfText.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g),
    ];
    if (
      !boxes.length ||
      boxes.some((box) => {
        const coordinates = box.slice(1).map(Number);
        return (
          !coordinates.every(Number.isFinite) ||
          Math.abs(coordinates[2] - coordinates[0] - 595.276) > 1 ||
          Math.abs(coordinates[3] - coordinates[1] - 841.89) > 1
        );
      })
    ) {
      throw Object.assign(
        new Error(
          'Strict one-page export requires a verifiable A4 page. Retry with the supported A4 renderer.'
        ),
        {
          code: 'ONE_PAGE_LAYOUT_INVALID',
          statusCode: 422,
        }
      );
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
      return (
        text
          // Escape source text before introducing the renderer's own HTML tags.
          // A legitimate C++ <T> description must not become an HTML element.
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          // The canonical TeX generator emits literal angles through math mode.
          .replace(/\$&lt;\$/g, '&lt;')
          .replace(/\$&gt;\$/g, '&gt;')
          // Keep literal source braces/backslashes distinct from TeX grouping syntax.
          .replace(/\\\{/g, '&#123;')
          .replace(/\\\}/g, '&#125;')
          .replace(/\\textbackslash\{\}/g, '&#92;')
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
          .replace(/\\fontsize\{[^}]+\}\{[^}]+\}/g, '')
          .replace(/\\selectfont\b/g, '')
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
          .replace(/\\textasciitilde\{\}/g, '~')
          .replace(/\\textasciicircum\{\}/g, '^')
          .replace(/\\textbar\{\}/g, ' · ')
          .replace(/\\textbar\b/g, ' · ')
          .replace(/\$\\\|\$/g, ' | ')
          .replace(/\$\|\$/g, ' | ')
          .replace(/\$\\cdot\$/g, '·')
          .replace(/\\cdot\b/g, '·')
          .replace(/---/g, '—')
          .replace(/--/g, '–')
          .replace(/\\texttt\{([^}]+)\}/g, '$1')
          .replace(/\\[a-zA-Z]+/g, '')
          .replace(/\{([^{}]+)\}/g, '$1')
          .replace(/\{|\}/g, '')
          .trim()
      );
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
    // Source literals such as \{, \} and \textbackslash{} are content,
    // not the closing delimiter of the surrounding TeX command.
    const fieldPattern = String.raw`((?:\\[a-zA-Z]+\{\}|\\[{}]|[^{}])+)`;
    const nameMatch =
      body.match(new RegExp(String.raw`\\fontsize\{(?:2[0-9]|1[8-9])(?:\.[0-9]+)?pt\}\{[0-9.]+(?:pt)?\}\s*\\selectfont\s*\\textbf\{${fieldPattern}\}`)) ||
      body.match(new RegExp(String.raw`\\(?:Huge|LARGE)\s*\\textbf\{${fieldPattern}\}`)) ||
      body.match(new RegExp(String.raw`\\textbf\{\\Huge\s+${fieldPattern}\}`)) ||
      body.match(new RegExp(String.raw`\\fontsize\{[0-9.]+(?:pt)?\}\{[0-9.]+(?:pt)?\}\s*\\selectfont\s*\\textbf\{${fieldPattern}\}`)) ||
      body.match(new RegExp(String.raw`\\textbf\{${fieldPattern}\}`));
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

    // Extract headline if present (typically 12-14pt or large/normalsize)
    let headline = '';
    let headlineMatch = null;
    const allFontsizeMatches = [
      ...body.matchAll(
        new RegExp(
          String.raw`\\fontsize\{[0-9.]+(?:pt)?\}\{[0-9.]+(?:pt)?\}\s*\\selectfont\s*\\textbf\{${fieldPattern}\}`,
          'g'
        )
      ),
    ];
    for (const m of allFontsizeMatches) {
      if (cleanLatexText(m[1]) !== candidateName) {
        headlineMatch = m;
        headline = cleanLatexText(m[1]);
        break;
      }
    }
    if (!headlineMatch) {
      const legacyHeadlineMatch = body.match(
        new RegExp(String.raw`\\(?:large|normalsize)\s*\\textbf\{${fieldPattern}\}`)
      );
      if (legacyHeadlineMatch && cleanLatexText(legacyHeadlineMatch[1]) !== candidateName) {
        headlineMatch = legacyHeadlineMatch;
        headline = cleanLatexText(legacyHeadlineMatch[1]);
      }
    }

    // Split into sections
    const sectionSplitter = new RegExp(
      String.raw`\\(?:atsfirstsection|atssection|section\*?)\{${fieldPattern}\}`,
      'g'
    );
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
    const contactLines = preHeader
      .split('\n')
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          (nameMatch ? !l.includes(nameMatch[0]) : !l.includes(candidateName)) &&
          (!headlineMatch || !l.includes(headlineMatch[0]))
      );
    const cleanedContactLines = contactLines.map(cleanLatexText).filter(Boolean);
    let contactLineHtml = '';
    let linksLineHtml = '';
    if (cleanedContactLines.length === 1) {
      contactLineHtml = cleanedContactLines[0];
    } else if (cleanedContactLines.length > 1) {
      contactLineHtml = cleanedContactLines[0];
      linksLineHtml = cleanedContactLines
        .slice(1)
        .map((line) => `<div class="links-line">${line}</div>`)
        .join('\n    ');
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
    ${contactLineHtml ? `<div class="contact-line">${contactLineHtml}</div>` : ''}
    ${linksLineHtml || ''}
  </div>`;

    if (sections.length === 0) {
      const cleaned = cleanLatexText(body);
      htmlBody += `<div class="content">${cleaned
        .split('\n\n')
        .map((p) => `<p>${p}</p>`)
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
              .slice(1)
              .map((it) => cleanLatexText(it.trim()))
              .filter(Boolean);
            if (items.length > 0) {
              htmlBody += `<ul>${items.map((it) => `<li>${it}</li>`).join('')}</ul>`;
            }
          } else {
            const textChunk = chunks[i].trim();
            if (textChunk) {
              const paragraphs = textChunk
                .split(/(?:\\par|\n\s*\n)/)
                .map((p) => p.trim())
                .filter(Boolean);
              for (const p of paragraphs) {
                const alignedParts = p.split(/\\hfill\b/);
                if (alignedParts.length > 1) {
                  const left = cleanLatexText(alignedParts.shift());
                  const right = cleanLatexText(alignedParts.join(' '));
                  if (left && right) {
                    // Logical order remains entry title, then dates/links.
                    // Flex wrapping preserves long text without a layout table.
                    htmlBody += `<p class="entry-heading"><span class="entry-label">${left}</span> <span class="entry-meta">${right}</span></p>`;
                    continue;
                  }
                }
                const cleanedP = cleanLatexText(p);
                if (cleanedP) {
                  const subLines = cleanedP
                    .split('<br>')
                    .map((l) => l.trim())
                    .filter(Boolean);
                  for (const line of subLines) {
                    htmlBody += `<p>${line}</p>`;
                  }
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
${getLatinModernFontFaces()}
    @page {
      size: A4;
      margin: 13mm 12mm 14mm 12mm;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: "Latin Modern Roman", "LMRoman10", "Computer Modern", "CMU Serif", serif;
      font-size: 10pt;
      line-height: 1.24;
      overflow-wrap: anywhere;
      -webkit-font-smoothing: antialiased;
    }
    .header {
      text-align: center;
      margin-bottom: 5pt;
      break-inside: avoid;
    }
    .candidate-name {
      font-size: 21pt;
      font-weight: 700;
      margin: 0 0 2pt;
      line-height: 1.15;
      text-align: center;
    }
    .candidate-headline {
      font-size: 12.5pt;
      font-weight: 700;
      margin: 0 0 2pt;
      text-align: center;
      line-height: 1.2;
    }
    .contact-line {
      font-size: 9.5pt;
      color: #222222;
      margin: 0 0 2pt;
      text-align: center;
      line-height: 1.2;
    }
    .links-line {
      font-size: 8.5pt;
      color: #222222;
      margin: 1pt 0 2pt;
      text-align: center;
      line-height: 1.2;
      white-space: nowrap;
    }
    .contact-line a, .links-line a {
      color: #000000;
      text-decoration: none;
    }
    .section {
      margin-top: 8pt;
    }
    .section-title {
      font-size: 10.5pt;
      font-weight: 700;
      border-bottom: 0.5pt solid #000000;
      padding-bottom: 1.5pt;
      margin: 5pt 0 3pt;
      break-after: avoid;
    }
    p {
      margin: 0 0 2.5pt;
      orphans: 2;
      widows: 2;
    }
    .entry-heading {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 2pt 8pt;
      break-after: avoid;
    }
    .entry-label {
      flex: 1 1 60%;
      min-width: 0;
    }
    .entry-meta {
      flex: 0 1 auto;
      max-width: 100%;
      margin-left: auto;
      text-align: right;
    }
    ul {
      margin: 2pt 0 4pt 14pt;
      padding: 0;
      list-style-type: disc;
    }
    li {
      margin-bottom: 2pt;
      line-height: 1.26;
      break-inside: avoid;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
  </style>
</head>
<body data-renderer-version="chrome-ats-a4-v2">
  ${htmlBody}
</body>
</html>`;
  }
}
