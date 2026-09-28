#!/usr/bin/env node
/**
 * @file Compares the live database against `src/db/schema.js`.
 *
 * Why: the schema file is the source of truth for every query the app issues, but a
 * migration that was never applied (or applied partially) leaves the database missing
 * columns or indexes that the code already relies on. Nothing catches that at build
 * time, and a missing index is invisible while a missing column is a hard failure.
 *
 * Read-only: issues information_schema / pg_catalog queries only.
 *
 * Usage:
 *   node scripts/audit-database-drift.js [--json]
 */

import { sql } from 'drizzle-orm';
import { parseSchema } from './audit-schema-integrity.js';

const asJson = process.argv.includes('--json');

const { db, closeDatabase } = await import('../src/db/index.js');
const { parseSchema: parse } = await import('./audit-schema-integrity.js');

const schemaTables = parse(
  (await import('node:fs')).readFileSync(new URL('../src/db/schema.js', import.meta.url), 'utf8')
);

try {
  const columnsResult = await db.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, column_name
  `);
  const columnRows = columnsResult.rows || columnsResult;

  const indexResult = await db.execute(sql`
    select tablename, indexname
    from pg_indexes
    where schemaname = 'public'
  `);
  const indexRows = indexResult.rows || indexResult;

  const liveColumns = new Map();
  for (const row of columnRows) {
    const table = row.table_name;
    if (!liveColumns.has(table)) liveColumns.set(table, new Set());
    liveColumns.get(table).add(row.column_name);
  }

  const liveIndexes = new Set(indexRows.map((row) => row.indexname));

  const missingTables = [];
  const missingColumns = [];
  const missingIndexes = [];
  const undeclaredColumns = [];

  // The parser already captured the physical (snake_case) names declared in schema.js,
  // so no name-guessing or text slicing is needed here.
  for (const table of schemaTables) {
    const physical = table.physicalName;
    if (!physical) continue;

    if (!liveColumns.has(physical)) {
      missingTables.push({ schemaName: table.name, physical });
      continue;
    }

    for (const column of table.columns) {
      if (column.physicalName && !liveColumns.get(physical).has(column.physicalName)) {
        missingColumns.push({
          table: physical,
          column: column.physicalName,
          schemaProperty: `${table.name}.${column.name}`,
        });
      }
    }

    for (const index of table.indexNames || []) {
      if (!liveIndexes.has(index)) missingIndexes.push({ table: physical, index });
    }
  }

  const result = { missingTables, missingColumns, missingIndexes, undeclaredColumns };

  // Drift is always a defect: a missing table or column breaks queries outright, and a
  // missing index silently degrades them. Only then does this fail the build.
  const drift = missingTables.length + missingColumns.length + missingIndexes.length;

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    if (drift > 0) process.exitCode = 1;
  } else {
    console.log(`Schema tables: ${schemaTables.length}`);
    console.log(`Live public tables with columns: ${liveColumns.size}`);
    console.log(`Live indexes: ${liveIndexes.size}\n`);

    console.log(`Tables declared in schema but absent from the database: ${missingTables.length}`);
    for (const t of missingTables) console.log(`  - ${t.schemaName} (${t.physical})`);
    console.log('');

    console.log(`Declared columns missing from the database: ${missingColumns.length}`);
    for (const c of missingColumns) console.log(`  - ${c.table}.${c.column}`);
    console.log('');

    console.log(`Declared indexes missing from the database: ${missingIndexes.length}`);
    for (const i of missingIndexes) console.log(`  - ${i.table}  ${i.index}`);
    console.log('');

    if (drift === 0) {
      console.log('✅ Live database matches src/db/schema.js.');
    } else {
      console.log(`❌ ${drift} declared object(s) missing from the live database.`);
      process.exitCode = 1;
    }
  }
} finally {
  await closeDatabase();
}
