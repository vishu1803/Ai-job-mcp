/**
 * @file Safe Code Import Scanner (P4-003)
 *
 * Scans entrypoint and key source code files for active library import statements
 * using linear, non-backtracking regular expressions.
 *
 * Strictly adheres to:
 * - Zero code execution (no eval, vm, import() or dynamic execution)
 * - Maximum 500 characters per scanned line
 * - Maximum 1000 lines per scanned file
 * - EvidenceType: CODE_IMPORT_USAGE
 * - Confidence: 1.00
 */

export class ImportScanner {
  static MAX_LINES = 1000;
  static MAX_LINE_LENGTH = 500;

  /**
   * Checks if the file is an entrypoint or representative source file suitable for import scanning.
   *
   * @param {string} filePath - Relative file path.
   * @returns {boolean}
   */
  static isScannableSourceFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const lower = filePath.toLowerCase();

    // Skip minified, test fixtures, node_modules, vendor
    if (
      lower.includes('min.js') ||
      lower.includes('bundle.js') ||
      lower.includes('.min.') ||
      lower.includes('vendor/') ||
      lower.includes('node_modules/') ||
      lower.includes('dist/') ||
      lower.includes('build/')
    ) {
      return false;
    }

    const fileName = lower.split('/').pop() || lower;

    // Common entrypoints and key files
    return (
      fileName === 'index.js' ||
      fileName === 'index.ts' ||
      fileName === 'app.js' ||
      fileName === 'app.ts' ||
      fileName === 'server.js' ||
      fileName === 'server.ts' ||
      fileName === 'main.js' ||
      fileName === 'main.ts' ||
      fileName === 'main.py' ||
      fileName === 'app.py' ||
      fileName === 'server.py' ||
      fileName === 'main.go' ||
      fileName === 'main.rs' ||
      fileName === 'lib.rs' ||
      fileName.endsWith('.routes.js') ||
      fileName.endsWith('.service.js') ||
      fileName.endsWith('.controller.js')
    );
  }

  /**
   * Scans source code lines for verified import statements.
   *
   * @param {string} content - Raw source code text.
   * @param {string} filePath - File path (used to determine language patterns).
   * @returns {Array<{ rawImport: string, packageName: string, confidence: number, rawExcerpt: string, lineRange: { start: number, end: number } }>}
   */
  static scanImports(content, filePath) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const rawLines = content.split(/\r?\n/);
    const lineLimit = Math.min(rawLines.length, ImportScanner.MAX_LINES);
    const lowerPath = (filePath || '').toLowerCase();

    const extracted = [];
    let inGoImportBlock = false;

    for (let i = 0; i < lineLimit; i++) {
      let line = rawLines[i];
      if (line.length > ImportScanner.MAX_LINE_LENGTH) {
        line = line.slice(0, ImportScanner.MAX_LINE_LENGTH);
      }
      const trimmed = line.trim();

      if (
        !trimmed ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('/*')
      ) {
        continue;
      }

      // 1. JavaScript / TypeScript imports
      if (
        lowerPath.endsWith('.js') ||
        lowerPath.endsWith('.ts') ||
        lowerPath.endsWith('.mjs') ||
        lowerPath.endsWith('.cjs')
      ) {
        // ES Module: import ... from 'pkg'
        const esmMatch = trimmed.match(/^import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
        if (esmMatch) {
          const pkg = esmMatch[1].trim();
          if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
            extracted.push({
              rawImport: pkg,
              packageName: pkg,
              confidence: 1.0,
              rawExcerpt: trimmed,
              lineRange: { start: i + 1, end: i + 1 },
            });
          }
          continue;
        }

        // CommonJS: require('pkg') or const x = require('pkg')
        const cjsMatch = trimmed.match(/require\(['"]([^'"]+)['"]\)/);
        if (cjsMatch) {
          const pkg = cjsMatch[1].trim();
          if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
            extracted.push({
              rawImport: pkg,
              packageName: pkg,
              confidence: 1.0,
              rawExcerpt: trimmed,
              lineRange: { start: i + 1, end: i + 1 },
            });
          }
          continue;
        }
      }

      // 2. Python imports
      if (lowerPath.endsWith('.py')) {
        // from pkg import ...
        const fromMatch = trimmed.match(/^from\s+([a-zA-Z0-9_]+)(?:\.[a-zA-Z0-9_]+)*\s+import/);
        if (fromMatch) {
          const pkg = fromMatch[1].trim();
          extracted.push({
            rawImport: pkg,
            packageName: pkg.toLowerCase().replace(/_/g, '-'),
            confidence: 1.0,
            rawExcerpt: trimmed,
            lineRange: { start: i + 1, end: i + 1 },
          });
          continue;
        }

        // import pkg, import pkg.sub
        const importMatch = trimmed.match(/^import\s+([a-zA-Z0-9_]+)/);
        if (importMatch) {
          const pkg = importMatch[1].trim();
          extracted.push({
            rawImport: pkg,
            packageName: pkg.toLowerCase().replace(/_/g, '-'),
            confidence: 1.0,
            rawExcerpt: trimmed,
            lineRange: { start: i + 1, end: i + 1 },
          });
          continue;
        }
      }

      // 3. Go imports
      if (lowerPath.endsWith('.go')) {
        if (trimmed.startsWith('import (')) {
          inGoImportBlock = true;
          continue;
        }

        if (inGoImportBlock) {
          if (trimmed === ')') {
            inGoImportBlock = false;
            continue;
          }

          const quotedMatch = trimmed.match(/['"]([^'"]+)['"]/);
          if (quotedMatch) {
            const pkg = quotedMatch[1].trim();
            extracted.push({
              rawImport: pkg,
              packageName: pkg,
              confidence: 1.0,
              rawExcerpt: trimmed,
              lineRange: { start: i + 1, end: i + 1 },
            });
          }
          continue;
        }

        const singleGoMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
        if (singleGoMatch) {
          const pkg = singleGoMatch[1].trim();
          extracted.push({
            rawImport: pkg,
            packageName: pkg,
            confidence: 1.0,
            rawExcerpt: trimmed,
            lineRange: { start: i + 1, end: i + 1 },
          });
          continue;
        }
      }

      // 4. Rust use statements
      if (lowerPath.endsWith('.rs')) {
        const useMatch = trimmed.match(/^use\s+([a-zA-Z0-9_]+)::/);
        if (useMatch) {
          const crateName = useMatch[1].trim();
          if (
            crateName !== 'crate' &&
            crateName !== 'super' &&
            crateName !== 'self' &&
            crateName !== 'std'
          ) {
            extracted.push({
              rawImport: crateName,
              packageName: crateName.toLowerCase().replace(/_/g, '-'),
              confidence: 1.0,
              rawExcerpt: trimmed,
              lineRange: { start: i + 1, end: i + 1 },
            });
          }
          continue;
        }
      }
    }

    return extracted;
  }
}
