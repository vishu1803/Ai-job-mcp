/**
 * @file Python Manifest Parser (`requirements.txt`, `Pipfile`, `pyproject.toml`) (P4-003)
 *
 * Implements declarative, static line-based parsing of Python dependency manifests.
 *
 * Security Controls:
 * - Line length capped at 500 characters, max 1000 lines
 * - Rejects unsafe pip arguments: -r, -e, -i, --extra-index-url, --find-links, git+, urls
 * - Strips version constraints, extras, and environment markers safely
 * - Zero code execution (never invokes python or pip)
 */

import { BaseManifestParser } from './base-manifest-parser.js';

export class PythonManifestParser extends BaseManifestParser {
  /**
   * Identifies if this parser handles the file path.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  canParse(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const lower = filePath.toLowerCase();
    const fileName = lower.split('/').pop() || lower;

    return (
      fileName.endsWith('requirements.txt') ||
      fileName.startsWith('requirements') ||
      fileName === 'pipfile' ||
      fileName === 'pyproject.toml'
    );
  }

  /**
   * Parses Python manifest content.
   *
   * @param {string} content - Raw manifest text.
   * @param {string} filePath - Relative file path.
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  parse(content, filePath) {
    const lines = this.sanitizeAndSplitLines(content);
    if (!lines.length) {
      return [];
    }

    const lower = filePath.toLowerCase();
    const fileName = lower.split('/').pop() || lower;

    if (fileName === 'pyproject.toml') {
      return this._parsePyprojectToml(lines);
    }

    if (fileName === 'pipfile') {
      return this._parsePipfile(lines);
    }

    // Default: requirements.txt (and variants)
    const isDevFile = lower.includes('dev') || lower.includes('test') || lower.includes('local');

    return this._parseRequirementsTxt(lines, isDevFile);
  }

  /**
   * Parses requirements.txt lines safely.
   *
   * @param {string[]} lines
   * @param {boolean} isDevFile
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  _parseRequirementsTxt(lines, isDevFile) {
    const extracted = [];

    // Blocklist of unsafe pip flags / URL prefixes
    const UNSAFE_PREFIX_REGEX =
      /^\s*(-r|-e|-i|-f|--requirement|--editable|--index-url|--extra-index-url|--find-links|git\+|https?:|svn\+|hg\+|bzr\+)/i;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      let line = rawLine.trim();

      // 1. Skip empty lines and full comment lines
      if (!line || line.startsWith('#')) {
        continue;
      }

      // 2. Reject unsafe pip flags or external URLs
      if (UNSAFE_PREFIX_REGEX.test(line)) {
        continue;
      }

      // 3. Strip inline comments
      const commentIdx = line.indexOf('#');
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx).trim();
      }

      // 4. Strip environment markers (; python_version >= '3.8')
      const markerIdx = line.indexOf(';');
      if (markerIdx !== -1) {
        line = line.slice(0, markerIdx).trim();
      }

      // 5. Match package name and optional version
      // Python package names: letters, numbers, _, -, .
      const pkgMatch = line.match(/^([a-zA-Z0-9_.-]+)(?:\[[^\]]*\])?(?:\s*([=><!~^].*))?$/);
      if (pkgMatch) {
        const rawPkgName = pkgMatch[1];
        const versionStr = (pkgMatch[2] || '').trim();

        // Normalize package name (Python packages treat _ and - equivalently)
        const normalizedPkg = rawPkgName.toLowerCase().replace(/_/g, '-');

        if (normalizedPkg.length >= 2) {
          extracted.push({
            name: normalizedPkg,
            versionConstraint: versionStr,
            isDev: isDevFile,
            confidence: isDevFile ? 0.75 : 1.0,
            rawExcerpt: rawLine.trim(),
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
      }
    }

    return extracted;
  }

  /**
   * Parses pyproject.toml dependencies section safely.
   *
   * @param {string[]} lines
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  _parsePyprojectToml(lines) {
    const extracted = [];
    let currentSection = '';
    let inDependenciesArray = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) continue;

      // Section header [section]
      const sectionMatch = line.match(/^\[([^\]]+)\]/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toLowerCase();
        inDependenciesArray = false;
        continue;
      }

      const isDevSection =
        currentSection.includes('dev') ||
        currentSection.includes('test') ||
        currentSection.includes('group.dev') ||
        currentSection.includes('group.test') ||
        currentSection.includes('optional-dependencies');

      // Detect dependencies array: dependencies = [ ... ] or test = [ ... ]
      if (line.includes('= [') || line.includes('=[')) {
        inDependenciesArray = true;
        continue;
      }

      if (inDependenciesArray) {
        if (line.includes(']')) {
          inDependenciesArray = false;
        }
        // Extract quoted string "fastapi>=0.100"
        const arrayItemMatch = line.match(
          /['"]([a-zA-Z0-9_.-]+)(?:\[[^\]]*\])?(?:\s*([=><!~^][^'"]*))?['"]/
        );
        if (arrayItemMatch) {
          const pkg = arrayItemMatch[1].toLowerCase().replace(/_/g, '-');
          const version = (arrayItemMatch[2] || '').trim();
          extracted.push({
            name: pkg,
            versionConstraint: version,
            isDev: isDevSection,
            confidence: isDevSection ? 0.75 : 1.0,
            rawExcerpt: line,
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
        continue;
      }

      // Poetry/Flit style: package-name = "^0.100" or package-name = { version = "^0.100" }
      if (
        currentSection.includes('dependencies') ||
        currentSection === 'tool.poetry.dependencies' ||
        currentSection === 'project.optional-dependencies'
      ) {
        const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/);
        if (kvMatch && !kvMatch[2].startsWith('[')) {
          const pkg = kvMatch[1].toLowerCase().replace(/_/g, '-');
          if (pkg !== 'python') {
            extracted.push({
              name: pkg,
              versionConstraint: kvMatch[2].replace(/['"{}]/g, '').trim(),
              isDev: isDevSection,
              confidence: isDevSection ? 0.75 : 1.0,
              rawExcerpt: line,
              lineRange: { start: i + 1, end: i + 1 },
            });
          }
        }
      }
    }

    return extracted;
  }

  /**
   * Parses Pipfile sections safely.
   *
   * @param {string[]} lines
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  _parsePipfile(lines) {
    const extracted = [];
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (!line || line.startsWith('#')) continue;

      const sectionMatch = line.match(/^\[([^\]]+)\]/);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toLowerCase();
        continue;
      }

      const isDev = currentSection.includes('dev');
      if (currentSection === 'packages' || currentSection === 'dev-packages') {
        const kvMatch = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/);
        if (kvMatch) {
          const pkg = kvMatch[1].toLowerCase().replace(/_/g, '-');
          extracted.push({
            name: pkg,
            versionConstraint: kvMatch[2].replace(/['"{}]/g, '').trim(),
            isDev,
            confidence: isDev ? 0.75 : 1.0,
            rawExcerpt: line,
            lineRange: { start: i + 1, end: i + 1 },
          });
        }
      }
    }

    return extracted;
  }
}
