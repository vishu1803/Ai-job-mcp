/**
 * @file Rust Manifest Parser (`Cargo.toml`) (P4-003)
 *
 * Implements declarative line-based TOML section parsing for Rust `Cargo.toml` files.
 * Extracts `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, and `[workspace.dependencies]`.
 *
 * Security Controls:
 * - Line length capped at 500 characters, max 1000 lines
 * - Zero code execution (never invokes `cargo`)
 */

import { BaseManifestParser } from './base-manifest-parser.js';

export class RustManifestParser extends BaseManifestParser {
  /**
   * Identifies if this parser handles the file path.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  canParse(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const lower = filePath.toLowerCase();
    return lower === 'cargo.toml' || lower.endsWith('/cargo.toml');
  }

  /**
   * Parses Cargo.toml content safely.
   *
   * @param {string} content - Raw Cargo.toml text.
   * @param {string} filePath - Relative file path.
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  parse(content, _filePath) {
    const lines = this.sanitizeAndSplitLines(content);
    if (!lines.length) {
      return [];
    }

    const extracted = [];
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      let line = rawLine.trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      // Strip inline comments
      const commentIdx = line.indexOf('#');
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx).trim();
      }

      // Detect [section]
      const sectionMatch = line.match(/^\[([^\]]+)\]/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toLowerCase().trim();
        continue;
      }

      const isProdSection = currentSection === 'dependencies';
      const isDevSection =
        currentSection === 'dev-dependencies' || currentSection === 'build-dependencies';
      const isWorkspaceSection = currentSection === 'workspace.dependencies';

      if (isProdSection || isDevSection || isWorkspaceSection) {
        // Formats:
        // tokio = "1.0"
        // tokio = { version = "1.0", features = ["full"] }
        // tokio.workspace = true
        const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/);
        if (kvMatch) {
          const crateName = kvMatch[1].toLowerCase().replace(/_/g, '-');
          const valueStr = kvMatch[2].trim();

          let versionConstraint = '';
          const versionMatch = valueStr.match(/version\s*=\s*['"]([^'"]+)['"]/);
          if (versionMatch) {
            versionConstraint = versionMatch[1];
          } else {
            const simpleVersionMatch = valueStr.match(/^['"]([^'"]+)['"]/);
            if (simpleVersionMatch) {
              versionConstraint = simpleVersionMatch[1];
            }
          }

          let confidence = 1.0;
          if (isDevSection) {
            confidence = 0.75;
          } else if (isWorkspaceSection) {
            confidence = 0.9;
          }

          extracted.push({
            name: crateName,
            versionConstraint,
            isDev: isDevSection,
            confidence,
            rawExcerpt: rawLine.trim(),
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
      }
    }

    return extracted;
  }
}
