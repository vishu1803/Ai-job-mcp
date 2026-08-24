/**
 * @file Static Database Lifecycle Teardown Audit (P8-002 Invariant Enforcement)
 *
 * Scans all integration test suites to verify that any test file importing
 * the singleton PostgreSQL `db` or `pool` properly registers a teardown hook
 * and deterministically invokes `closeDatabase()` upon test completion.
 *
 * Fast, deterministic, zero network calls, zero PostgreSQL dependency.
 *
 * Exit code 0: All database-using integration tests have compliant teardown.
 * Exit code 1: One or more integration tests violate database lifecycle invariants.
 */

import fs from 'node:fs';
import path from 'node:path';

function findTestFiles(dir) {
  let results = [];
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(findTestFiles(fullPath));
    } else if (entry.endsWith('.test.js')) {
      results.push(fullPath.replace(/\\/g, '/'));
    }
  }
  return results;
}

const INTEGRATION_DIR = 'tests/integration';

export function runDbLifecycleAudit(testDir = INTEGRATION_DIR) {
  const files = findTestFiles(testDir);
  const violations = [];
  const audited = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');

    // Check if file imports from src/db (creating or accessing the singleton pool)
    const importsDbModule = /from\s+['"][^'"]*src\/db(\/index(\.js)?)?['"]/.test(content);
    const importsDb = /import\s+[\s\S]*?\bdb\b[\s\S]*?from\s+['"][^'"]*src\/db/.test(content);
    const importsPool = /import\s+[\s\S]*?\bpool\b[\s\S]*?from\s+['"][^'"]*src\/db/.test(content);

    const isDbUser = importsDbModule || importsDb || importsPool;

    if (!isDbUser) {
      continue;
    }

    const importsCloseDb =
      /import\s+[\s\S]*?\bcloseDatabase\b[\s\S]*?from\s+['"][^'"]*src\/db/.test(content);
    const hasAfterHook = /\bafter\s*\(/.test(content);
    const callsCloseDb = /closeDatabase\s*\(/.test(content);

    const issues = [];
    if (!importsCloseDb) {
      issues.push('Missing "closeDatabase" import from src/db/index.js');
    }
    if (!hasAfterHook) {
      issues.push('Missing "after()" teardown hook');
    }
    if (!callsCloseDb) {
      issues.push('Missing "closeDatabase()" invocation in teardown');
    }

    if (issues.length > 0) {
      violations.push({ file, issues });
    } else {
      audited.push({ file });
    }
  }

  return { files, audited, violations };
}

// CLI Execution
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('check-db-lifecycle.js')) {
  console.log('🔍 Running static integration test database lifecycle audit...\n');
  const { files, audited, violations } = runDbLifecycleAudit();

  console.log(`Audited ${files.length} integration test files:`);
  console.log(`  - DB-using files verified: ${audited.length}`);
  console.log(`  - Violations detected:      ${violations.length}\n`);

  if (violations.length > 0) {
    console.error('❌ Database lifecycle audit FAILED with the following violations:\n');
    for (const v of violations) {
      console.error(`  [${v.file}]`);
      v.issues.forEach((issue) => console.error(`    - ${issue}`));
    }
    console.error(
      '\nRule: Any integration test that imports the database pool must import and invoke closeDatabase() in an after() hook.'
    );
    process.exit(1);
  }

  console.log(
    '✅ Database lifecycle audit PASSED: All database-using integration tests have compliant teardown hooks.\n'
  );
  process.exit(0);
}
