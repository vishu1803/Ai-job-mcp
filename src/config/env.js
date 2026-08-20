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
 * @property {string} GITHUB_CLIENT_ID
 * @property {string} GITHUB_CLIENT_SECRET
 * @property {string} GITHUB_OAUTH_REDIRECT_URI
 * @property {string} SESSION_COOKIE_NAME
 * @property {string} SESSION_COOKIE_SECRET
 * @property {number} SESSION_TTL_SECONDS
 * @property {string} APP_URL
 */

const envSchema = z
  .object({
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
      .optional()
      .default(() => process.env.ENCRYPTION_KEY || ''),
    ENCRYPTION_KEY_VERSION: z.string().default('v1'),
    GITHUB_CLIENT_ID: z.string().optional().default(''),
    GITHUB_CLIENT_SECRET: z.string().optional().default(''),
    GITHUB_OAUTH_REDIRECT_URI: z.string().default('http://localhost:3000/auth/github/callback'),
    SESSION_COOKIE_NAME: z.string().default('career_hub_session'),
    SESSION_COOKIE_SECRET: z.string().optional().default(''),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
    APP_URL: z.string().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && !data.ENCRYPTION_MASTER_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_MASTER_KEY is mandatory in production environment',
        path: ['ENCRYPTION_MASTER_KEY'],
      });
    }

    if (data.ENCRYPTION_MASTER_KEY) {
      const isHex = /^[0-9a-fA-F]{64}$/.test(data.ENCRYPTION_MASTER_KEY);
      const isB64 =
        /^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(data.ENCRYPTION_MASTER_KEY) &&
        Buffer.from(data.ENCRYPTION_MASTER_KEY, 'base64').length === 32;

      if (!isHex && !isB64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'ENCRYPTION_MASTER_KEY must be a 32-byte key encoded as 64 hex characters or 44 base64 characters',
          path: ['ENCRYPTION_MASTER_KEY'],
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

/** @type {AppConfig} */
export const config = parsedEnv.data;
