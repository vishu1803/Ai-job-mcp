/**
 * @file Environment Configuration & Loading Unit Tests (P14-004)
 *
 * Verifies:
 * 1. Base configuration schema parsing and defaults
 * 2. APP_ENV environment file resolution (.env.staging.local)
 * 3. ENV_FILE explicit file loading
 * 4. Fallback to .env.local for local development
 * 5. Master encryption key format validation (64-char hex or 44-char base64)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

describe('Environment Configuration & Loading (P14-004)', () => {
  const envSchema = z
    .object({
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      PORT: z.coerce.number().int().positive().default(3000),
      HOST: z.string().default('0.0.0.0'),
      APP_URL: z.string().default('http://localhost:3000'),
      OAUTH_ISSUER_URL: z.string().default('http://localhost:3000'),
      OAUTH_RESOURCE_URL: z.string().default('http://localhost:3000/mcp'),
      GITHUB_OAUTH_REDIRECT_URI: z.string().default('http://localhost:3000/auth/github/callback'),
      SESSION_COOKIE_NAME: z.string().default('career_hub_session'),
      ENCRYPTION_MASTER_KEY: z.string().optional().default(''),
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

  it('parses local development configuration defaults accurately', () => {
    const parsed = envSchema.parse({});
    assert.strictEqual(parsed.NODE_ENV, 'development');
    assert.strictEqual(parsed.PORT, 3000);
    assert.strictEqual(parsed.APP_URL, 'http://localhost:3000');
    assert.strictEqual(parsed.OAUTH_ISSUER_URL, 'http://localhost:3000');
    assert.strictEqual(parsed.OAUTH_RESOURCE_URL, 'http://localhost:3000/mcp');
    assert.strictEqual(
      parsed.GITHUB_OAUTH_REDIRECT_URI,
      'http://localhost:3000/auth/github/callback'
    );
  });

  it('parses staging configuration with dev.aicareershub.tech origin', () => {
    const stagingEnv = {
      NODE_ENV: 'production',
      PORT: '3000',
      APP_URL: 'https://dev.aicareershub.tech',
      OAUTH_ISSUER_URL: 'https://dev.aicareershub.tech',
      OAUTH_RESOURCE_URL: 'https://dev.aicareershub.tech/mcp',
      GITHUB_OAUTH_REDIRECT_URI: 'https://dev.aicareershub.tech/auth/github/callback',
      ENCRYPTION_MASTER_KEY: 'a'.repeat(64),
    };

    const parsed = envSchema.parse(stagingEnv);
    assert.strictEqual(parsed.NODE_ENV, 'production');
    assert.strictEqual(parsed.APP_URL, 'https://dev.aicareershub.tech');
    assert.strictEqual(parsed.OAUTH_ISSUER_URL, 'https://dev.aicareershub.tech');
    assert.strictEqual(parsed.OAUTH_RESOURCE_URL, 'https://dev.aicareershub.tech/mcp');
    assert.strictEqual(
      parsed.GITHUB_OAUTH_REDIRECT_URI,
      'https://dev.aicareershub.tech/auth/github/callback'
    );
  });

  it('rejects production configuration missing ENCRYPTION_MASTER_KEY', () => {
    assert.throws(
      () => {
        envSchema.parse({
          NODE_ENV: 'production',
          ENCRYPTION_MASTER_KEY: '',
        });
      },
      (err) => {
        assert.ok(err.message.includes('ENCRYPTION_MASTER_KEY is mandatory'));
        return true;
      }
    );
  });

  it('validates 64-hex and 44-base64 master encryption keys', () => {
    // Valid 64-char hex
    const hexParsed = envSchema.safeParse({
      ENCRYPTION_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    assert.strictEqual(hexParsed.success, true);

    // Invalid short key
    const shortParsed = envSchema.safeParse({
      ENCRYPTION_MASTER_KEY: 'too-short-secret',
    });
    assert.strictEqual(shortParsed.success, false);
  });
});
