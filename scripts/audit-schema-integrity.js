#!/usr/bin/env node
/**
 * @file Static audit of schema-level integrity and indexing gaps.
 *
 * Complements `check-drizzle-columns.js` (which finds references to columns that do
 * not exist). This one reads the *definitions* and reports structural gaps that are
 * invisible at runtime but show up as slow queries or unpoliced data:
 *
 *   1. foreign key columns with no index covering them
 *   2. columns that look like foreign keys but declare no `.references(...)`
 *   3. `*_at` audit columns missing a default
 *   4. NOT NULL columns with no default (every insert must supply them explicitly)
 *   5. tenant-scoped tables missing a tenant-leading index
 *
 * Read-only: it parses `src/db/schema.js` and prints a report.
 *
 * Usage:
 *   node scripts/audit-schema-integrity.js [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTableImports } from './check-drizzle-columns.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_FILE = path.join(PROJECT_ROOT, 'src', 'db', 'schema.js');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');

/**
 * Blanks string literals and comments while preserving offsets.
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
 * @param {string} masked
 * @param {number} openIndex
 * @returns {number}
 */
function matchDelimiter(masked, openIndex, open = '{', close = '}') {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    if (masked[i] === open) depth += 1;
    else if (masked[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Splits the top-level property entries of an object literal.
 *
 * @param {string} masked
 * @param {number} openIndex
 * @param {number} closeIndex
 * @returns {Array<{ name: string, text: string, start: number }>}
 */
function topLevelEntries(masked, openIndex, closeIndex) {
  const entries = [];
  let depth = 0;
  let parens = 0;
  let name = null;
  let entryStart = -1;

  for (let i = openIndex + 1; i <= closeIndex; i += 1) {
    const c = masked[i];
    if (c === '{' || c === '(' || c === '[') {
      if (c === '{') depth += 1;
      else parens += 1;
    } else if (c === '}' || c === ')' || c === ']') {
      if (c === '}') depth -= 1;
      else parens -= 1;
    }

    if (depth === 0 && parens === 0) {
      if (c === ',' || i === closeIndex) {
        if (name !== null && entryStart !== -1) {
          entries.push({ name, text: masked.slice(entryStart, i), start: entryStart, end: i });
        }
        name = null;
        entryStart = -1;
        continue;
      }
      if (name === null) {
        const rest = masked.slice(i);
        if (/^\s*\.\.\./.test(rest)) {
          // Spread: not a declared column.
          name = '__spread__';
          entryStart = i;
          continue;
        }
        const key = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(rest);
        if (key) {
          name = key[1];
          entryStart = i + key[0].length;
        }
      }
    }
  }

  return entries;
}

/**
 * Parses tables, their columns, and their declared indexes.
 *
 * @param {string} source
 * @returns {Array<object>}
 */
export function parseSchema(source) {
  const masked = maskLiterals(source);
  const tables = [];
  const declaration = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(/g;

  let match;
  while ((match = declaration.exec(masked))) {
    const callOpen = match.index + match[0].length - 1;
    const callClose = matchDelimiter(masked, callOpen, '(', ')');
    if (callClose === -1) continue;

    const body = masked.slice(callOpen, callClose);
    const columnsOpen = body.indexOf('{');
    if (columnsOpen === -1) continue;
    const columnsClose = matchDelimiter(body, columnsOpen);
    if (columnsClose === -1) continue;

    // Offsets from the masked body map 1:1 onto the raw body, so the physical column
    // names (blanked out during masking) can be read back from the original text.
    const rawBody = source.slice(callOpen, callClose);
    const physicalTable = (/^\s*\(\s*'([^']+)'/.exec(rawBody) || [])[1] || null;

    const columns = topLevelEntries(body, columnsOpen, columnsClose)
      .filter((entry) => entry.name !== '__spread__')
      .map((entry) => {
        const raw = rawBody.slice(entry.start, entry.end);
        return {
          name: entry.name,
          physicalName: (/^[\s\S]*?\(\s*'([^']+)'/.exec(raw) || [])[1] || null,
          references: /\.\s*references\s*\(/.test(entry.text),
          referenceTarget:
            (/\(\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\./.exec(entry.text) || [])[1] || null,
          notNull: /\.\s*notNull\s*\(/.test(entry.text),
          hasDefault:
            /\.\s*default(?:Random|Now|sql)?\s*\(/.test(entry.text) || /\.\s*\$/.test(entry.text),
          isPrimaryKey: /\.\s*primaryKey\s*\(/.test(entry.text),
        };
      });

    // Indexes live in the third argument: (table) => [ index(...).on(table.col) ]
    const indexes = [];
    const indexNames = [];
    const indexRe =
      /(uniqueIndex|index)\s*\(([^)]*)\)\s*\.\s*on\s*\(([\s\S]*?)\)\s*(?:\.\s*where\s*\(|,|\]|$)/g;
    const remainder = rawBody.slice(columnsClose);
    let indexMatch;
    while ((indexMatch = indexRe.exec(remainder))) {
      const declaredName = (/^\s*'([^']+)'/.exec(indexMatch[2]) || [])[1] || null;
      const cols = [...indexMatch[3].matchAll(/table\s*\.\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
      if (declaredName) indexNames.push(declaredName);
      if (cols.length > 0) indexes.push(cols);
    }

    tables.push({
      name: match[1],
      physicalName: physicalTable,
      columns,
      indexes,
      indexNames,
    });
  }

  return tables;
}

/**
 * @param {Array<object>} tables
 * @returns {object}
 */
export function auditSchema(tables) {
  const findings = {
    unindexedForeignKeys: [],
    foreignKeysOnlyInComposite: [],
    unconstrainedReferenceLike: [],
    timestampsWithoutDefault: [],
    notNullWithoutDefault: [],
    tablesWithoutTenantIndex: [],
  };

  for (const table of tables) {
    // A foreign key is served if it appears in ANY position of an index: this schema
    // is tenant-scoped, so `WHERE tenantId = ? AND candidateId = ?` is fully served by
    // a (tenantId, candidateId) composite even though the FK is not the leading column.
    const indexedAnywhere = new Map();
    const leadingIndexed = new Set();
    for (const cols of table.indexes) {
      leadingIndexed.add(cols[0]);
      for (const column of cols) {
        if (!indexedAnywhere.has(column)) indexedAnywhere.set(column, []);
        indexedAnywhere.get(column).push(cols.join(','));
      }
    }

    const hasTenantColumn = table.columns.some((c) => c.name === 'tenantId');
    const tenantIndexed = table.indexes.some((cols) => cols[0] === 'tenantId');

    if (hasTenantColumn && !tenantIndexed) {
      findings.tablesWithoutTenantIndex.push(table.name);
    }

    for (const column of table.columns) {
      if (column.isPrimaryKey) continue;

      if (column.references && !indexedAnywhere.has(column.name)) {
        findings.unindexedForeignKeys.push({
          table: table.name,
          column: column.name,
          references: column.referenceTarget,
        });
      } else if (column.references && !leadingIndexed.has(column.name)) {
        findings.foreignKeysOnlyInComposite.push({
          table: table.name,
          column: column.name,
          coveredBy: indexedAnywhere.get(column.name).join(' | '),
        });
      }

      const referenceLike = /(?:^|[a-z])Id$/.test(column.name);
      if (referenceLike && !column.references && !['tenantId', 'id'].includes(column.name)) {
        findings.unconstrainedReferenceLike.push({ table: table.name, column: column.name });
      }

      if (/(?:^|_)at$|At$/.test(column.name) && !column.hasDefault && column.notNull) {
        findings.timestampsWithoutDefault.push({ table: table.name, column: column.name });
      }

      if (column.notNull && !column.hasDefault && !column.references) {
        findings.notNullWithoutDefault.push({ table: table.name, column: column.name });
      }
    }
  }

  return findings;
}

/**
 * Collects JS files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function collectSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git'].includes(entry.name)) continue;
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Finds `update(...).set({...})` calls on tables that own an `updated_at` column where
 * the SET clause omits `updatedAt`. The schema declares no `$onUpdate` hook, so those
 * writes leave the timestamp at its previous value and every `ORDER BY updated_at
 * DESC` consumer silently reads a stale ordering.
 *
 * @param {Array<object>} tables
 * @returns {Array<{ file: string, line: number, table: string, snippet: string }>}
 */
export function auditUpdatedAtMaintenance(tables) {
  const owners = new Set(
    tables.filter((t) => t.columns.some((c) => c.name === 'updatedAt')).map((t) => t.name)
  );
  const tablePlaceholders = new Map([...owners].map((name) => [name, { columns: new Set() }]));
  const misses = [];

  for (const file of collectSourceFiles(SRC_ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    const importMap = resolveTableImports(source, tablePlaceholders);
    if (importMap.size === 0) continue;

    const updateRe = /\.update\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
    let match;
    while ((match = updateRe.exec(source))) {
      const table = importMap.get(match[1]);
      if (!table || !owners.has(table)) continue;

      const setIndex = source.indexOf('.set(', match.index);
      if (setIndex === -1 || setIndex - match.index > 400) continue;

      const openIndex = source.indexOf('{', setIndex);
      if (openIndex === -1) continue;

      // Determine whether the SET payload carries updatedAt. The payload is either an
      // inline object literal or a variable that the call site populates beforehand,
      // so both forms have to be resolved or variable payloads report false positives.
      const setOpen = source.indexOf('(', setIndex);
      let setClose = -1;
      let depth = 0;
      for (let i = setOpen; i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        else if (source[i] === ')') {
          depth -= 1;
          if (depth === 0) {
            setClose = i;
            break;
          }
        }
      }
      if (setClose === -1) continue;

      const argumentText = source.slice(setOpen + 1, setClose).trim();
      let maintained = /updatedAt/.test(argumentText);
      let payload = argumentText;

      if (!maintained && /^[A-Za-z_$][\w$]*$/.test(argumentText)) {
        // Variable payload: look back for a statement that puts updatedAt on it.
        const context = source.slice(Math.max(0, setIndex - 6000), setIndex);
        const escaped = argumentText.replace(/[$]/g, '\\$');
        const assignsTimestamp = new RegExp(
          `(?:${escaped}\\s*\\.\\s*updatedAt\\s*=)|(?:${escaped}\\s*=\\s*\\{[^}]*updatedAt)|(?:${escaped}\\s*=\\s*[A-Za-z_$][\\w$]*\\s*\\()`,
          'm'
        );
        maintained = assignsTimestamp.test(context);
        payload = `via variable ${argumentText}`;
      }

      if (maintained) continue;

      const line = source.slice(0, match.index).split('\n').length;
      misses.push({
        file: path.relative(PROJECT_ROOT, file).split(path.sep).join('/'),
        line,
        table,
        payload,
        snippet: (source.split('\n')[line - 1] || '').trim(),
      });
    }
  }

  return misses;
}

function main() {
  const asJson = process.argv.includes('--json');
  const tables = parseSchema(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  const findings = auditSchema(tables);
  findings.updatedAtNotMaintained = auditUpdatedAtMaintenance(tables);

  if (asJson) {
    console.log(JSON.stringify({ tablesParsed: tables.length, findings }, null, 2));
    if (findings.unindexedForeignKeys.length + findings.updatedAtNotMaintained.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`Parsed ${tables.length} tables\n`);

  const section = (title, rows, format) => {
    console.log(`${title}: ${rows.length}`);
    for (const row of rows) console.log(`  - ${format(row)}`);
    console.log('');
  };

  section(
    'Foreign key columns absent from every index',
    findings.unindexedForeignKeys,
    (r) => `${r.table}.${r.column}${r.references ? ` -> ${r.references}` : ''}`
  );
  console.log(
    `Foreign keys indexed only as a non-leading column of a composite: ${findings.foreignKeysOnlyInComposite.length}`
  );
  for (const r of findings.foreignKeysOnlyInComposite) {
    console.log(`  - ${r.table}.${r.column}  (covered by ${r.coveredBy})`);
  }
  console.log('');
  section(
    'Reference-like columns without a declared FK constraint',
    findings.unconstrainedReferenceLike,
    (r) => `${r.table}.${r.column}`
  );
  section(
    'Timestamp columns without a default',
    findings.timestampsWithoutDefault,
    (r) => `${r.table}.${r.column}`
  );
  section(
    'NOT NULL columns without a default (insert must always supply)',
    findings.notNullWithoutDefault,
    (r) => `${r.table}.${r.column}`
  );
  section(
    'Tenant-scoped tables with no tenant-leading index',
    findings.tablesWithoutTenantIndex,
    (t) => t
  );
  section(
    'update().set() omitting updatedAt on a table that owns the column',
    findings.updatedAtNotMaintained,
    (r) => `${r.file}:${r.line}  (${r.table})  ${r.snippet}  [${r.payload}]`
  );

  // Only the two sections above are defects. The remaining sections are informational:
  // soft references, required-without-default columns and reference timestamps are all
  // legitimate design choices, so they must not fail a build.
  const blocking = findings.unindexedForeignKeys.length + findings.updatedAtNotMaintained.length;
  if (blocking === 0) {
    console.log('✅ No unindexed foreign keys and no write path leaving updatedAt stale.');
  } else {
    console.log(`❌ ${blocking} blocking schema-integrity issue(s).`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
