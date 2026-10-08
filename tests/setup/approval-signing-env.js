/** Explicit test-only key injection. Never imported by src or production start. */
import crypto from 'node:crypto';
import { config } from '../../src/config/env.js';

// Check AFTER dotenv/config bootstrap: ENV_FILE must not switch to production
// after a preloader has injected public test keys into the process environment.
if (config.NODE_ENV !== 'test') {
  throw new Error('Approval test key setup requires NODE_ENV=test');
}

export const TEST_ACTION_APPROVAL_SECRET = crypto
  .createHash('sha256')
  .update('TEST ONLY: action approval domain fixture, never deploy')
  .digest('hex');
export const TEST_APPLICATION_APPROVAL_SECRET = crypto
  .createHash('sha256')
  .update('TEST ONLY: application approval domain fixture, never deploy')
  .digest('hex');

config.ACTION_APPROVAL_HMAC_SECRET ??= TEST_ACTION_APPROVAL_SECRET;
config.CAREER_HUB_APPROVAL_SECRET ??= TEST_APPLICATION_APPROVAL_SECRET;
process.env.ACTION_APPROVAL_HMAC_SECRET ??= config.ACTION_APPROVAL_HMAC_SECRET;
process.env.CAREER_HUB_APPROVAL_SECRET ??= config.CAREER_HUB_APPROVAL_SECRET;
