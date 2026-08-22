/**
 * @file Base Manifest Parser Contract (P4-003)
 *
 * Defines the abstract interface and bounded safety controls for manifest parsers.
 * Guarantees zero code execution and bounded processing.
 */

export class BaseManifestParser {
  /**
   * Maximum allowed manifest file size in bytes (1 MB).
   */
  static MAX_FILE_SIZE = 1_048_576;

  /**
   * Maximum lines scanned per manifest.
   */
  static MAX_LINES = 1_000;

  /**
   * Maximum character length per scanned line.
   */
  static MAX_LINE_LENGTH = 500;

  /**
   * Checks if this parser handles the given file path.
   *
   * @param {string} _filePath - POSIX file path.
   * @returns {boolean}
   */
  canParse(_filePath) {
    throw new Error('canParse() must be implemented by subclass');
  }

  /**
   * Parses raw file content into extracted manifest items.
   *
   * @param {string} _content - Raw text content of manifest.
   * @param {string} _filePath - Relative file path.
   * @returns {Array<{ name: string, versionConstraint?: string, isDev?: boolean, isIndirect?: boolean, confidence: number, rawExcerpt: string, lineRange?: { start: number, end: number } }>}
   */
  parse(_content, _filePath) {
    throw new Error('parse() must be implemented by subclass');
  }

  /**
   * Validates and normalizes raw text input before parser execution.
   *
   * @param {string} content - Raw content.
   * @returns {string[]} Bounded array of lines (<= 1000 lines, <= 500 chars/line).
   */
  sanitizeAndSplitLines(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    if (content.length > BaseManifestParser.MAX_FILE_SIZE) {
      // Bounded slice
      content = content.slice(0, BaseManifestParser.MAX_FILE_SIZE);
    }

    const rawLines = content.split(/\r?\n/);
    const safeLines = [];

    const lineLimit = Math.min(rawLines.length, BaseManifestParser.MAX_LINES);
    for (let i = 0; i < lineLimit; i++) {
      const line = rawLines[i];
      if (line.length > BaseManifestParser.MAX_LINE_LENGTH) {
        safeLines.push(line.slice(0, BaseManifestParser.MAX_LINE_LENGTH));
      } else {
        safeLines.push(line);
      }
    }

    return safeLines;
  }
}
