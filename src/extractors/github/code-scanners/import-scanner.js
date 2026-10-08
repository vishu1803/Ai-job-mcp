/**
 * ISSUE-06: JavaScript static references, not execution/proficiency verification.
 * Unsupported syntax/languages fail closed. Never execute repository content.
 */
import { parse } from 'acorn';
import { isObservationOnlyPath } from '../../../services/evidence/verification-policy.js';

export class ImportScanner {
  static MAX_LINES = 1000;
  static MAX_LINE_LENGTH = 500;
  static MAX_BYTES = 256 * 1024;

  static isScannableSourceFile(filePath) {
    return (
      typeof filePath === 'string' &&
      /\.(?:js|mjs|cjs)$/.test(filePath) &&
      !isObservationOnlyPath(filePath)
    );
  }

  static scanImports(content, filePath) {
    if (
      typeof content !== 'string' ||
      !this.isScannableSourceFile(filePath) ||
      Buffer.byteLength(content) > this.MAX_BYTES ||
      content.split('\n').length > this.MAX_LINES ||
      /@generated|automatically generated|do not edit/i.test(content.slice(0, 2000))
    )
      return [];
    let ast;
    try {
      ast = parse(content, {
        ecmaVersion: 'latest',
        sourceType: filePath.endsWith('.cjs') ? 'commonjs' : 'module',
        locations: true,
      });
    } catch {
      return []; // Includes TS/JSX, malformed input and unsupported grammar. No regex fallback.
    }
    const extracted = [];
    // ESM declarations are unambiguous static references. CommonJS require can be
    // shadowed; don't claim verified references without scope-aware binding resolution.
    for (const node of ast.body) {
      if (
        !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
      )
        continue;
      const pkg = node.source?.value;
      if (
        typeof pkg !== 'string' ||
        pkg.length > 512 ||
        pkg.startsWith('.') ||
        pkg.startsWith('/') ||
        pkg.startsWith('node:') ||
        !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[^\s]+)?$/i.test(pkg)
      )
        continue;
      extracted.push({
        rawImport: pkg,
        packageName: pkg,
        confidence: 1,
        extractionMethod: 'ACORN_AST',
        rawExcerpt: content.slice(node.start, node.end),
        lineRange: { start: node.loc.start.line, end: node.loc.end.line },
      });
    }
    return extracted;
  }
}
