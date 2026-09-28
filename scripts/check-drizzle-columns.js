#!/usr/bin/env node
/**
 * @file Static audit: drizzle table column references that do not exist.
 *
 * Why this exists: a `pgTable` column object is a plain JS object, so reading a
 * property that was never declared (`jobApplications.matchScore`) yields
 * `undefined` with no error. The failure only surfaces deep inside drizzle's query
 * builder at execution time, and every call site that swallowed the rejection made
 * the bug invisible -- the read silently returned an empty list instead.
 *
 * This script parses the exported tables and their real column keys out of
 * `src/db/schema.js`, then reports every `<table>.<property>` access in the scanned
 * sources whose property is not a column of that table. For each finding it also
 * reports which tables DO have the property, which is usually enough to name the
 * intended column.
 *
 * Usage:
 *   node scripts/check-drizzle-columns.js [paths...] [--json]
 *
 * Exits with a non-zero status when any invalid reference is found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = path.join(PROJECT_ROOT, 'src', 'db', 'schema.js');
const DEFAULT_ROOTS = ['src', 'scripts', 'tests'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build', '.freebuff']);

/**
 * Drizzle attaches non-column members to table objects; they are not schema bugs.
 */
const NON_COLUMN_MEMBERS = new Set(['Symbol', 'Table', 'getSQL', 'shouldOmitSQLParens']);

/**
 * Blanks out string literals, template literals and comments while preserving the
 * byte offsets of the source, so offsets found in the masked text can be mapped back
 * onto the original. Template literal `${...}` expressions are blanked too, which is
 * acceptable: the scanned sources do not reference tables inside them.
 *
 * @param {string} src
 * @returns {string}
 */
function maskLiterals(src) {
  const out = [...src];
  let state = 'code';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    if (state === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        state = 'line-comment';
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        state = 'block-comment';
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        state = c === "'" ? 'single' : c === '"' ? 'double' : 'template';
        out[i] = ' ';
      }
      i += 1;
      continue;
    }

    if (state === 'line-comment') {
      if (c === '\n') state = 'code';
      else out[i] = ' ';
      i += 1;
      continue;
    }

    if (state === 'block-comment') {
      if (c === '*' && src[i + 1] === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        state = 'code';
        continue;
      }
      if (c !== '\n') out[i] = ' ';
      i += 1;
      continue;
    }

    const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
    if (c === '\\') {
      out[i] = ' ';
      if (i + 1 < n) out[i + 1] = ' ';
      i += 2;
      continue;
    }
    if (c === quote) {
      out[i] = ' ';
      i += 1;
      state = 'code';
      continue;
    }
    if (c !== '\n') out[i] = ' ';
    i += 1;
  }

  return out.join('');
}

/**
 * Finds the index of the `}` matching the `{` at `openIndex` in masked source.
 *
 * @param {string} masked
 * @param {number} openIndex
 * @returns {number} Index of the closing brace, or -1.
 */
function matchBrace(masked, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Collects the property keys declared at the top level of an object literal.
 *
 * @param {string} masked Masked source
 * @param {number} openIndex Index of the opening `{`
 * @param {number} closeIndex Index of the matching `}`
 * @returns {Set<string>}
 */
function topLevelKeys(masked, openIndex, closeIndex) {
  const keys = new Set();
  let depth = 0;
  let expectKey = false;

  for (let i = openIndex; i <= closeIndex; i += 1) {
    const c = masked[i];

    if (c === '{') {
      depth += 1;
      if (depth === 1) expectKey = true;
      continue;
    }
    if (c === '}') {
      depth -= 1;
      continue;
    }
    if (depth !== 1) continue;

    if (c === ',') {
      expectKey = true;
      continue;
    }
    if (!expectKey) continue;
    // Wait for the first non-whitespace character so the key regex can anchor on it.
    if (/\s/.test(c)) continue;

    const rest = masked.slice(i);
    if (rest.startsWith('...')) {
      expectKey = false;
      continue;
    }
    const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(rest);
    if (key) keys.add(key[1]);
    expectKey = false;
  }

  return keys;
}

/**
 * Parses every `export const <name> = pgTable('table', { ...columns... })` declaration.
 *
 * @param {string} source Raw schema source
 * @returns {Map<string, { tableName: string, columns: Set<string> }>}
 */
export function extractTables(source) {
  const masked = maskLiterals(source);
  const tables = new Map();
  const declaration = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(/g;

  let match;
  while ((match = declaration.exec(masked))) {
    const openIndex = masked.indexOf('{', match.index);
    if (openIndex === -1 || openIndex === masked.length - 1) continue;

    const closeIndex = matchBrace(masked, openIndex);
    if (closeIndex === -1) continue;

    const columns = topLevelKeys(masked, openIndex, closeIndex);
    if (columns.size === 0) continue;

    tables.set(match[1], { tableName: match[1], columns });
  }

  return tables;
}

/**
 * Maps local identifiers in a file onto schema table names via its import statements.
 *
 * @param {string} source Raw file source
 * @param {Map<string, object>} tables
 * @returns {Map<string, string>} Local identifier -> table name
 */
export function resolveTableImports(source, tables) {
  const masked = maskLiterals(source);
  const mapping = new Map();
  const importKeyword = /\bimport\b/g;

  let match;
  while ((match = importKeyword.exec(masked))) {
    const start = match.index;
    const fromIndex = masked.indexOf('from', start);
    const semicolon = masked.indexOf(';', start);
    if (fromIndex === -1 || (semicolon !== -1 && semicolon < fromIndex)) continue;

    const statement = masked.slice(start + 'import'.length, fromIndex);
    const specifier = /^\s*['"]([^'"]+)['"]/.exec(source.slice(fromIndex + 'from'.length));
    if (!specifier) continue;
    if (!/(^|\/)schema\.js$/.test(specifier[1])) continue;

    for (const clause of statement.split(',')) {
      const named = /^\s*\{?\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*\}?\s*$/.exec(
        clause
      );
      if (!named) continue;
      const imported = named[1];
      const local = named[2] || named[1];
      if (tables.has(imported)) mapping.set(local, imported);
    }
  }

  return mapping;
}

/**
 * Reports `<table>.<property>` accesses whose property is not a column of that table.
 *
 * @param {string} source Raw file source
 * @param {Map<string, object>} tables
 * @returns {Array<{ line: number, column: number, member: string, table: string, property: string, existsOn: string[] }>}
 */
export function findInvalidColumnReferences(source, tables) {
  const masked = maskLiterals(source);
  const localToTable = resolveTableImports(source, tables);
  const findings = [];
  if (localToTable.size === 0) return findings;

  const lines = source.split('\n');
  // The negative lookbehind skips properties that are not the root of the expression,
  // so `candidate.skills.length` does not match `skills.length` as if `skills` were a table.
  const usage = /(?<![.\w$])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g;

  let match;
  while ((match = usage.exec(masked))) {
    const [, local, property] = match;
    const tableName = localToTable.get(local);
    if (!tableName) continue;

    const table = tables.get(tableName);
    if (table.columns.has(property)) continue;
    if (property.startsWith('$') || NON_COLUMN_MEMBERS.has(property)) continue;

    const before = masked.slice(0, match.index);
    const line = before.split('\n').length;
    const column = match.index - (before.lastIndexOf('\n') + 1) + 1;

    findings.push({
      line,
      column,
      member: `${local}.${property}`,
      table: tableName,
      property,
      existsOn: [...tables.entries()]
        .filter(([, candidate]) => candidate.columns.has(property))
        .map(([name]) => name),
      snippet: (lines[line - 1] || '').trim(),
    });
  }

  return findings;
}

/**
 * Recursively collects scannable source files under a path.
 *
 * @param {string} target
 * @returns {string[]}
 */
function collectFiles(target) {
  const absolute = path.resolve(PROJECT_ROOT, target);
  if (!fs.existsSync(absolute)) return [];

  const stat = fs.statSync(absolute);
  if (stat.isFile()) return SCAN_EXTENSIONS.has(path.extname(absolute)) ? [absolute] : [];

  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...collectFiles(path.join(absolute, entry.name)));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(absolute, entry.name));
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const targets = args.filter((arg) => !arg.startsWith('--'));
  const roots = targets.length > 0 ? targets : DEFAULT_ROOTS;

  const tables = extractTables(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  if (tables.size === 0) {
    console.error('❌ Could not parse any tables from src/db/schema.js');
    process.exitCode = 1;
    return;
  }

  const files = [...new Set(roots.flatMap((root) => collectFiles(root)))];
  const results = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const findings = findInvalidColumnReferences(source, tables);
    if (findings.length > 0) {
      results.push({ file: path.relative(PROJECT_ROOT, file).split(path.sep).join('/'), findings });
    }
  }

  const total = results.reduce((sum, entry) => sum + entry.findings.length, 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        { tablesParsed: tables.size, filesScanned: files.length, total, results },
        null,
        2
      )
    );
  } else {
    console.log(`Parsed ${tables.size} tables from src/db/schema.js`);
    console.log(`Scanned ${files.length} files\n`);

    if (total === 0) {
      console.log('✅ No invalid table column references found.');
    } else {
      for (const { file, findings } of results) {
        console.log(file);
        for (const finding of findings) {
          const hint =
            finding.existsOn.length > 0
              ? `  (property exists on: ${finding.existsOn.join(', ')})`
              : '  (property exists on no table)';
          console.log(`  ${finding.line}:${finding.column}  ${finding.member}${hint}`);
          console.log(`      ${finding.snippet}`);
        }
        console.log('');
      }
      console.log(`❌ ${total} invalid column reference(s) in ${results.length} file(s).`);
    }
  }

  if (total > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
