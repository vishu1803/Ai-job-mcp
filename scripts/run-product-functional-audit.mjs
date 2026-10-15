/** Controlled audit harness. It does not migrate, deploy, or call an employer. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node scripts/run-product-functional-audit.mjs [--integration --database-url postgres://.../product_audit_NAME] [--env-only]'
  );
  console.log(
    'Default: defect observations, including controlled Chromium. Integration requires an empty disposable loopback database with all 22 migrations. Expected known defects cause a nonzero exit. --env-only writes the isolated environment for explicit migration before running tests.'
  );
  process.exit(0);
}
const integration = args.includes('--integration');
const dbIndex = args.indexOf('--database-url');
const databaseUrl =
  dbIndex >= 0 ? args[dbIndex + 1] : 'postgres://postgres@127.0.0.1:1/product_audit_observations';
const target = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(target.protocol) ||
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  !/^\/product_audit_[a-zA-Z0-9_]+$/.test(target.pathname) ||
  target.search
) {
  throw new Error(
    'Only explicitly named product_audit_* loopback PostgreSQL databases are allowed.'
  );
}
if (integration && dbIndex < 0) throw new Error('--integration requires --database-url');

const output = await fs.mkdtemp(path.join(os.tmpdir(), 'career-product-audit-run-'));
const envFile = path.join(output, 'audit.env');
const configuration = {
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl,
  DATABASE_SSL: 'false',
  DATABASE_CA_CERT: '',
  LOG_LEVEL: 'error',
  APP_ENV: '',
  APP_URL: 'http://127.0.0.1:3000',
  TRUSTED_PROXY_CIDRS: '',
  ENCRYPTION_MASTER_KEY: crypto.randomBytes(32).toString('hex'),
  ACTION_APPROVAL_HMAC_SECRET: crypto.randomBytes(32).toString('hex'),
  CAREER_HUB_APPROVAL_SECRET: crypto.randomBytes(32).toString('hex'),
  SESSION_COOKIE_SECRET: 'public-test-only-product-functional-audit',
  GITHUB_APP_ID: '1',
  GITHUB_CLIENT_ID: '',
  GITHUB_CLIENT_SECRET: '',
  GITHUB_APP_CLIENT_ID: '',
  GITHUB_APP_CLIENT_SECRET: '',
  GITHUB_APP_PRIVATE_KEY: '',
  GITHUB_WEBHOOK_SECRET: '',
  GITHUB_APP_WEBHOOK_SECRET: '',
  GEMINI_API_KEY: '',
  GOOGLE_CLOUD_PROJECT: '',
  GOOGLE_APPLICATION_CREDENTIALS: '',
  AI_PROVIDER: 'gemini',
  TEST_LIVE_AI: 'false',
  GREENHOUSE_BOARDS: '',
  LEVER_SITES: '',
  ALLOW_SYNTHETIC_JOBS: 'false',
};
await fs.writeFile(
  envFile,
  Object.entries(configuration)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
);
console.log(`Audit environment and logs: ${output}`);
if (args.includes('--env-only')) process.exit(0);
if (integration) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl, ssl: false });
  await client.connect();
  try {
    const {
      rows: [state],
    } = await client.query(
      'SELECT (SELECT count(*) FROM tenants)::int AS tenants, (SELECT count(*) FROM drizzle.__drizzle_migrations)::int AS migrations'
    );
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const journal = JSON.parse(
      await fs.readFile(path.resolve('drizzle/meta/_journal.json'), 'utf8')
    );
    if (state.tenants !== 0 || state.migrations !== journal.entries.length) {
      throw new Error(
        `Audit requires zero tenants and exactly ${journal.entries.length} applied migrations; no tests executed.`
      );
    }
  } finally {
    await client.end();
  }
}
const files = integration
  ? [
      'tests/unit/extension-prepare-handoff-regression.test.js',
      'tests/integration/web-application-routes.test.js',
      'tests/integration/mcp-final-transport-acceptance.test.js',
      'tests/unit/p86-job-application-workflow.test.js',
      'tests/integration/source-resume-ingestion.test.js',
      'tests/integration/handoff-kit-lifecycle.test.js',
      'tests/integration/mcp-application-artifact-tools.test.js',
      'tests/integration/mcp-workflow-remediation.test.js',
      'tests/integration/application-approval-content-binding.test.js',
      'tests/integration/application-tracking.service.test.js',
      'tests/integration/candidate-profile.service.test.js',
    ]
  : [
      'tests/product/resume-functional-audit.test.js',
      'tests/product/extension-functional-audit.test.js',
      'tests/product/other-feature-journeys.test.js',
    ];
const result = spawnSync(
  process.execPath,
  [
    '--import',
    './tests/setup/approval-signing-env.js',
    '--test',
    '--test-concurrency=1',
    '--test-timeout=180000',
    ...files,
  ],
  {
    cwd: root,
    env: { ...process.env, ...configuration, ENV_FILE: envFile },
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }
);
await fs.writeFile(path.join(output, 'tests.log'), (result.stdout || '') + (result.stderr || ''));
console.log(
  (result.stdout || '')
    .split(/\r?\n/)
    .filter((line) => /^# (tests|pass|fail|cancelled|skipped|duration_ms)/.test(line))
    .join('\n')
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
