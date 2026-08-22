/**
 * @file Go Module Manifest Parser (`go.mod`) (P4-003)
 *
 * Implements declarative line-based parsing of `go.mod` files.
 * Extracts direct and indirect dependencies, and Go toolchain version.
 *
 * Security Controls:
 * - Line length capped at 500 characters, max 1000 lines
 * - Discards replace, retract, and exclude directives
 * - Zero code execution (never invokes `go` binary)
 */

import { BaseManifestParser } from './base-manifest-parser.js';

export class GoManifestParser extends BaseManifestParser {
  /**
   * Identifies if this parser handles the file path.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  canParse(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const lower = filePath.toLowerCase();
    return lower === 'go.mod' || lower.endsWith('/go.mod');
  }

  /**
   * Parses go.mod text content.
   *
   * @param {string} content - Raw go.mod text.
   * @param {string} filePath - Relative file path.
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, isIndirect?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  parse(content, _filePath) {
    const lines = this.sanitizeAndSplitLines(content);
    if (!lines.length) {
      return [];
    }

    const extracted = [];
    let inRequireBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (!line || line.startsWith('//')) {
        continue;
      }

      // 1. Detect Go toolchain version: "go 1.22" or "go 1.22.0"
      const goVersionMatch = line.match(/^go\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
      if (goVersionMatch) {
        extracted.push({
          name: 'go',
          versionConstraint: goVersionMatch[1],
          isDev: false,
          isIndirect: false,
          confidence: 1.0,
          rawExcerpt: line,
          lineRange: { start: i + 1, end: i + 1 },
        });
        continue;
      }

      // 2. Detect require (...) block boundaries
      if (line.startsWith('require (')) {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock) {
        if (line === ')') {
          inRequireBlock = false;
          continue;
        }

        // Inside block: "github.com/gin-gonic/gin v1.9.1" or "... // indirect"
        const depMatch = line.match(/^([a-zA-Z0-9_./-]+)\s+([v0-9a-zA-Z.-]+)(?:\s+\/\/\s*(.+))?$/);
        if (depMatch) {
          const modPath = depMatch[1];
          const version = depMatch[2];
          const comment = depMatch[3] || '';
          const isIndirect = comment.toLowerCase().includes('indirect');

          extracted.push({
            name: modPath,
            versionConstraint: version,
            isDev: false,
            isIndirect,
            confidence: isIndirect ? 0.6 : 1.0,
            rawExcerpt: line,
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
        continue;
      }

      // 3. Single-line require: "require github.com/gin-gonic/gin v1.9.1"
      if (line.startsWith('require ')) {
        const singleMatch = line.match(
          /^require\s+([a-zA-Z0-9_./-]+)\s+([v0-9a-zA-Z.-]+)(?:\s+\/\/\s*(.+))?$/
        );
        if (singleMatch) {
          const modPath = singleMatch[1];
          const version = singleMatch[2];
          const comment = singleMatch[3] || '';
          const isIndirect = comment.toLowerCase().includes('indirect');

          extracted.push({
            name: modPath,
            versionConstraint: version,
            isDev: false,
            isIndirect,
            confidence: isIndirect ? 0.6 : 1.0,
            rawExcerpt: line,
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
      }
    }

    return extracted;
  }
}
