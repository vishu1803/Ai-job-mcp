import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load base .env if present
dotenv.config();

// Load .env.local if present with override priority for local development
const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

/**
 * @typedef {Object} AppConfig
 * @property {'development' | 'production' | 'test'} NODE_ENV
 * @property {number} PORT
 * @property {string} HOST
 * @property {'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'} LOG_LEVEL
 * @property {string} DATABASE_URL
 * @property {number} DATABASE_POOL_MIN
 * @property {number} DATABASE_POOL_MAX
 * @property {boolean} DATABASE_SSL
 * @property {number} DATABASE_STATEMENT_TIMEOUT_MS
 * @property {string} ENCRYPTION_MASTER_KEY
 * @property {string} ENCRYPTION_KEY_VERSION
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/career_hub_dev'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(1),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
  DATABASE_SSL: z
    .enum(['true', 'false', 'require', 'disable'])
    .default('false')
    .transform((val) => val === 'true' || val === 'require'),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .default(
      () =>
        process.env.ENCRYPTION_KEY ||
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    ),
  ENCRYPTION_KEY_VERSION: z.string().default('v1'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

/** @type {AppConfig} */
export const config = parsedEnv.data;
