import 'dotenv/config';
import { z } from 'zod';

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
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/career_hub_dev'),
  DATABASE_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: z
    .enum(['true', 'false', 'require', 'disable'])
    .default('false')
    .transform((val) => val === 'true' || val === 'require'),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

/** @type {AppConfig} */
export const config = parsedEnv.data;
