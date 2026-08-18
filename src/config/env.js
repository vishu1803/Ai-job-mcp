import 'dotenv/config';
import { z } from 'zod';

/**
 * @typedef {Object} AppConfig
 * @property {'development' | 'production' | 'test'} NODE_ENV
 * @property {number} PORT
 * @property {string} HOST
 * @property {'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'} LOG_LEVEL
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

/** @type {AppConfig} */
export const config = parsedEnv.data;
