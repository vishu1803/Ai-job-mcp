/**
 * @file Node.js Manifest Parser (`package.json`) (P4-003)
 *
 * Implements declarative, prototype-safe parsing of `package.json` files.
 * Extracts `dependencies`, `devDependencies`, `peerDependencies`, and `engines`.
 *
 * Security Controls:
 * - Strips __proto__, constructor, and prototype keys
 * - Limits JSON object depth to <= 5 levels
 * - Discards scripts, commands, and author data
 * - Zero code execution
 */

import { BaseManifestParser } from './base-manifest-parser.js';

export class NodeManifestParser extends BaseManifestParser {
  /**
   * Identifies if this parser handles the file path.
   *
   * @param {string} filePath
   * @returns {boolean}
   */
  canParse(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const lower = filePath.toLowerCase();
    return lower === 'package.json' || lower.endsWith('/package.json');
  }

  /**
   * Recursively checks JSON depth and strips prototype-polluting keys.
   *
   * @param {any} value
   * @param {number} depth
   * @returns {any}
   */
  static sanitizeParsedJson(value, depth = 0) {
    if (depth > 5) {
      return null;
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, 200) // bounded array
        .map((item) => NodeManifestParser.sanitizeParsedJson(item, depth + 1));
    }

    const cleanObj = Object.create(null);
    for (const key of Object.keys(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      cleanObj[key] = NodeManifestParser.sanitizeParsedJson(value[key], depth + 1);
    }
    return cleanObj;
  }

  /**
   * Calculates maximum object nesting depth.
   *
   * @param {any} value
   * @param {number} currentDepth
   * @returns {number}
   */
  static getMaxDepth(value, currentDepth = 0) {
    if (value === null || typeof value !== 'object') {
      return currentDepth;
    }
    let max = currentDepth;
    for (const key of Object.keys(value)) {
      max = Math.max(max, NodeManifestParser.getMaxDepth(value[key], currentDepth + 1));
    }
    return max;
  }

  /**
   * Parses package.json content safely.
   *
   * @param {string} content - Raw package.json string.
   * @param {string} filePath - Relative file path.
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  parse(content, _filePath) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    // Bounded input limit
    const bounded = content.slice(0, BaseManifestParser.MAX_FILE_SIZE);

    let parsed;
    try {
      // Safe reviver to block prototype poisoning during parsing
      const raw = JSON.parse(bounded, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          return undefined;
        }
        return value;
      });
      parsed = NodeManifestParser.sanitizeParsedJson(raw, 0);
    } catch {
      // Return empty array on malformed JSON without crashing
      return [];
    }

    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    // Reject objects nested deeper than 5 levels
    if (NodeManifestParser.getMaxDepth(parsed) > 5) {
      return [];
    }

    const extracted = [];
    const lines = content.split(/\r?\n/);

    // Helper to find rough line number for excerpt
    const findLineNumber = (pkgName) => {
      for (let i = 0; i < Math.min(lines.length, 1000); i++) {
        if (lines[i].includes(`"${pkgName}"`)) {
          return i + 1;
        }
      }
      return 1;
    };

    // 1. Production Dependencies (confidence: 1.00)
    if (parsed.dependencies && typeof parsed.dependencies === 'object') {
      for (const [pkg, version] of Object.entries(parsed.dependencies)) {
        if (typeof pkg !== 'string' || !pkg.trim() || typeof version !== 'string') continue;
        const line = findLineNumber(pkg);
        const versionStr = typeof version === 'string' ? version : '';
        extracted.push({
          name: pkg.trim(),
          versionConstraint: versionStr,
          isDev: false,
          confidence: 1.0,
          rawExcerpt: `"${pkg}": "${versionStr}"`,
          lineRange: { start: line, end: line },
        });
      }
    }

    // 2. Dev Dependencies (confidence: 0.75)
    if (parsed.devDependencies && typeof parsed.devDependencies === 'object') {
      for (const [pkg, version] of Object.entries(parsed.devDependencies)) {
        if (typeof pkg !== 'string' || !pkg.trim()) continue;
        const line = findLineNumber(pkg);
        const versionStr = typeof version === 'string' ? version : '';
        extracted.push({
          name: pkg.trim(),
          versionConstraint: versionStr,
          isDev: true,
          confidence: 0.75,
          rawExcerpt: `"${pkg}": "${versionStr}"`,
          lineRange: { start: line, end: line },
        });
      }
    }

    // 3. Peer Dependencies (confidence: 0.75)
    if (parsed.peerDependencies && typeof parsed.peerDependencies === 'object') {
      for (const [pkg, version] of Object.entries(parsed.peerDependencies)) {
        if (typeof pkg !== 'string' || !pkg.trim()) continue;
        const line = findLineNumber(pkg);
        const versionStr = typeof version === 'string' ? version : '';
        extracted.push({
          name: pkg.trim(),
          versionConstraint: versionStr,
          isDev: false,
          confidence: 0.75,
          rawExcerpt: `"${pkg}": "${versionStr}"`,
          lineRange: { start: line, end: line },
        });
      }
    }

    // 4. Runtime Engines (e.g. node, npm) (confidence: 0.85)
    if (parsed.engines && typeof parsed.engines === 'object') {
      for (const [engine, version] of Object.entries(parsed.engines)) {
        if (typeof engine !== 'string' || !engine.trim()) continue;
        const line = findLineNumber(engine);
        const versionStr = typeof version === 'string' ? version : '';
        extracted.push({
          name: engine.trim() === 'node' ? 'node-js' : engine.trim(),
          versionConstraint: versionStr,
          isDev: false,
          confidence: 0.85,
          rawExcerpt: `"${engine}": "${versionStr}"`,
          lineRange: { start: line, end: line },
        });
      }
    }

    return extracted;
  }
}
