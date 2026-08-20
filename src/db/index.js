import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { schema } from './schema.js';

const { Pool } = pg;

/**
 * Extracts and sanitizes database configuration parameters for safe logging and metrics.
 *
 * @param {string} [connectionString=config.DATABASE_URL] Raw database URL
 * @returns {object} Sanitized connection parameters with zero exposed credentials
 */
export function parseSanitizedDbUrl(connectionString = config.DATABASE_URL) {
  try {
    const parsed = new URL(connectionString);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
      database: parsed.pathname.replace(/^\//, ''),
      user: parsed.username || 'postgres',
      ssl: config.DATABASE_SSL,
      poolMin: config.DATABASE_POOL_MIN,
      poolMax: config.DATABASE_POOL_MAX,
    };
  } catch {
    return {
      host: 'unknown',
      port: 5432,
      database: 'unknown',
      ssl: config.DATABASE_SSL,
      poolMin: config.DATABASE_POOL_MIN,
      poolMax: config.DATABASE_POOL_MAX,
    };
  }
}

/**
 * Builds the pg.Pool configuration object.
 * Provides provider-neutral SSL detection supporting any PostgreSQL provider requiring TLS.
 *
 * @param {object} [overrides={}] Custom pool options overrides
 * @returns {import('pg').PoolConfig} Configured pg Pool options
 */
export function getPoolConfig(overrides = {}) {
  const rawUrl = config.DATABASE_URL || '';
  const urlLower = rawUrl.toLowerCase();
  const isSslQuery =
    urlLower.includes('sslmode=require') ||
    urlLower.includes('sslmode=verify-full') ||
    urlLower.includes('sslmode=verify-ca') ||
    urlLower.includes('ssl=true');
  const isRemoteHost =
    Boolean(urlLower) &&
    !urlLower.includes('localhost') &&
    !urlLower.includes('127.0.0.1') &&
    !urlLower.includes('host.docker.internal');
  const useSsl = config.DATABASE_SSL || isSslQuery || isRemoteHost;

  // Strip query-level SSL params from the connection string so pg doesn't conflict with explicit ssl options
  let cleanConnectionString = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete('sslmode');
    parsed.searchParams.delete('ssl');
    cleanConnectionString = parsed.toString();
  } catch {
    // If URL parsing fails, fallback to rawUrl
  }

  return {
    connectionString: cleanConnectionString,
    min: config.DATABASE_POOL_MIN,
    max: config.DATABASE_POOL_MAX,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ...overrides,
  };
}

/**
 * Factory function to create a new PostgreSQL connection pool.
 *
 * @param {object} [overrides={}] Custom configuration overrides
 * @returns {import('pg').Pool} Configured pg Pool instance
 */
export function createPool(overrides = {}) {
  const poolConfig = getPoolConfig(overrides);
  const poolInstance = new Pool(poolConfig);

  poolInstance.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client pool');
  });

  return poolInstance;
}

/**
 * Factory function to initialize Drizzle ORM over a given pg Pool instance.
 *
 * @param {import('pg').Pool} [poolInstance=pool] Target pg Pool instance
 * @param {object} [dbSchema=schema] Database schema definition
 * @returns {import('drizzle-orm/node-postgres').NodePgDatabase<typeof schema>} Configured Drizzle ORM instance
 */
export function createDb(poolInstance = pool, dbSchema = schema) {
  return drizzle(poolInstance, { schema: dbSchema });
}

/**
 * Default singleton PostgreSQL connection pool instance.
 */
export const pool = createPool();

/**
 * Default singleton Drizzle ORM instance.
 */
export const db = createDb(pool);

/**
 * Executes a lightweight health check query against the database.
 *
 * @param {import('pg').Pool} [poolInstance=pool] Target connection pool
 * @returns {Promise<{ status: 'healthy' | 'unhealthy', latencyMs: number, timestamp: string, error?: string }>} Health check result
 */
export async function checkDatabaseHealth(poolInstance = pool) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    const result = await poolInstance.query('SELECT 1 AS alive');
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    if (result && result.rows && result.rows[0]?.alive === 1) {
      return {
        status: 'healthy',
        latencyMs,
        timestamp,
      };
    }

    return {
      status: 'unhealthy',
      latencyMs,
      timestamp,
      error: 'Unexpected query response from database',
    };
  } catch (err) {
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;
    const sanitized = parseSanitizedDbUrl();

    logger.warn(
      { err, host: sanitized.host, port: sanitized.port, database: sanitized.database, latencyMs },
      'Database health check probe failed'
    );

    return {
      status: 'unhealthy',
      latencyMs,
      timestamp,
      error: /** @type {Error} */ (err).message || 'Database connection error',
    };
  }
}

/**
 * Gracefully terminates the PostgreSQL connection pool.
 *
 * @param {import('pg').Pool} [poolInstance=pool] Target connection pool
 * @returns {Promise<void>}
 */
export async function closeDatabase(poolInstance = pool) {
  try {
    await poolInstance.end();
    logger.info('PostgreSQL connection pool drained and closed successfully');
  } catch (err) {
    logger.error({ err }, 'Error while closing PostgreSQL connection pool');
    throw err;
  }
}
