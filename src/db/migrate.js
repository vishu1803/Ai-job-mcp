import { performance } from 'node:perf_hooks';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool, closeDatabase } from './index.js';
import { logger } from '../utils/logger.js';

/**
 * Executes pending SQL migrations from the specified folder.
 *
 * @param {object} [options={}] Migration configuration options
 * @param {string} [options.migrationsFolder='./drizzle'] Migrations directory path
 * @returns {Promise<void>}
 */
export async function runMigrations(options = { migrationsFolder: './drizzle' }) {
  const startTime = performance.now();
  logger.info({ folder: options.migrationsFolder }, 'Starting database schema migration...');

  try {
    await migrate(db, options);
    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    logger.info({ durationMs }, 'Database migrations completed successfully');
  } catch (err) {
    logger.error({ err }, 'Database migration failed');
    throw err;
  }
}

// Standalone execution handler for CLI invocation
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.js') || process.argv[1].endsWith('migrate'));

if (isDirectExecution) {
  try {
    await runMigrations();
    await closeDatabase(pool);
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration runner execution failed');
    await closeDatabase(pool).catch(() => {});
    process.exit(1);
  }
}
