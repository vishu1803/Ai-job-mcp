/** Real bootstrap probes in isolated child processes; never load a private .env. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { config } from '../../src/config/env.js';

const moduleUrl = (path) => new URL(`../../${path}`, import.meta.url).href;
const freshKey = () => crypto.randomBytes(32).toString('hex');
const names = ['ACTION_APPROVAL_HMAC_SECRET', 'CAREER_HUB_APPROVAL_SECRET'];
const baseEnvironment = () => {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    ENCRYPTION_MASTER_KEY: freshKey(),
    ACTION_APPROVAL_HMAC_SECRET: freshKey(),
    CAREER_HUB_APPROVAL_SECRET: freshKey(),
    SESSION_COOKIE_SECRET: freshKey(),
    AUTH_SECRET: freshKey(),
    LOG_LEVEL: 'error',
    DATABASE_URL: config.DATABASE_URL,
    DATABASE_SSL: 'false',
    DATABASE_POOL_MIN: '0',
    APP_URL: 'https://approval-startup.example',
    GITHUB_APP_ID: '',
    GITHUB_APP_PRIVATE_KEY: '',
    GITHUB_APP_SLUG: '',
    GITHUB_APP_CLIENT_ID: '',
    GITHUB_APP_CLIENT_SECRET: '',
  };
  for (const name of ['ENV_FILE', 'APP_ENV', 'NODE_TEST_CONTEXT', 'npm_lifecycle_event'])
    delete env[name];
  // An empty optional numeric ID is not valid; omit it entirely.
  delete env.GITHUB_APP_ID;
  return env;
};
function run(code, env) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: tmpdir(),
    env,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  assert.ok(!result.error, 'isolated bootstrap probe must finish, not time out');
  // Assertion messages deliberately never contain child output or key material.
  for (const name of names) {
    if (env[name]?.trim())
      assert.ok(
        !(result.stdout + result.stderr).includes(env[name]),
        'bootstrap must not disclose signing material'
      );
  }
  return result;
}
const startup = `await import(${JSON.stringify(moduleUrl('src/index.js'))});
setTimeout(() => process.exit(3), 3000);`;

describe('ISSUE-05 production bootstrap fails before serving protected functionality', () => {
  it('valid independent keys allow actual app listen and both production signers', () => {
    const result = run(
      `
      const { buildApp } = await import(${JSON.stringify(moduleUrl('src/app.js'))});
      const { signTicketPayload, verifyTicketSignature } = await import(${JSON.stringify(moduleUrl('src/security/approval-signer.js'))});
      const { signApplicationTicket, verifyApplicationTicketSignature } = await import(${JSON.stringify(moduleUrl('src/services/job-application-workflow.service.js'))});
      const ticket = {tenantId:'tenant', userId:'user', ticketId:'ticket', packageHash:'hash', destinationUrl:'https://employer.example', expiresAt:new Date(Date.now()+60000).toISOString()};
      if (!verifyTicketSignature({...ticket,hmacSignature:signTicketPayload(ticket)})) process.exit(5);
      if (!verifyApplicationTicketSignature(ticket,signApplicationTicket(ticket))) process.exit(6);
      const app = buildApp({ logger: false });
      await app.listen({port:0,host:'127.0.0.1'});
      if (!app.server.listening) process.exit(7);
      console.log('APP_LISTENING_WITH_VALID_KEYS');
      await app.close();
      const {closeDatabase} = await import(${JSON.stringify(moduleUrl('src/db/index.js'))});
      await closeDatabase(); process.exit(0);
    `,
      baseEnvironment()
    );
    assert.equal(result.status, 0, 'valid production bootstrap must succeed');
    assert.ok(result.stdout.includes('APP_LISTENING_WITH_VALID_KEYS'));
  });
  for (const name of names) {
    const cases = {
      missing: undefined,
      empty: '',
      whitespace: '  ',
      'too short': 'short',
      placeholder: '<independently-generated-random-32-byte-key>',
      example: 'example-secret-not-generated-by-a-cryptographically-secure-random-source',
      'repeated encoded key': 'ab'.repeat(32),
    };
    for (const [label, value] of Object.entries(cases)) {
      it(`${name} ${label}: real entry point refuses startup`, () => {
        const env = baseEnvironment();
        if (value === undefined) delete env[name];
        else env[name] = value;
        const result = run(startup, env);
        assert.equal(result.status, 1);
        assert.ok(result.stderr.includes(name));
        assert.ok(result.stderr.includes('Invalid environment variables'));
      });
    }
  }
  it('both missing: real entry point refuses startup', () => {
    const env = baseEnvironment();
    for (const name of names) delete env[name];
    const result = run(startup, env);
    assert.equal(result.status, 1);
    for (const name of names) assert.ok(result.stderr.includes(name));
  });
  it('same decoded key under different encoding: real entry point refuses startup', () => {
    const env = baseEnvironment();
    env.CAREER_HUB_APPROVAL_SECRET = Buffer.from(env.ACTION_APPROVAL_HMAC_SECRET, 'hex').toString(
      'base64'
    );
    const result = run(startup, env);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('must be independent'));
  });
  it('bypassing initial validation cannot construct app or sign/verify in production without keys', () => {
    const result = run(
      `
      const {config} = await import(${JSON.stringify(moduleUrl('src/config/env.js'))});
      const {buildApp} = await import(${JSON.stringify(moduleUrl('src/app.js'))});
      const action = await import(${JSON.stringify(moduleUrl('src/security/approval-signer.js'))});
      const application = await import(${JSON.stringify(moduleUrl('src/services/job-application-workflow.service.js'))});
      const ticket = {tenantId:'tenant',expiresAt:new Date().toISOString()};
      const a = action.signTicketPayload(ticket), b = application.signApplicationTicket(ticket);
      delete config.ACTION_APPROVAL_HMAC_SECRET; delete config.CAREER_HUB_APPROVAL_SECRET;
      let rejected = 0;
      for (const fn of [()=>buildApp({logger:false}),()=>action.signTicketPayload(ticket),()=>application.signApplicationTicket(ticket)]) {
        try { fn(); } catch(error) { if(error.code==='INVALID_APPROVAL_SECRET') rejected++; }
      }
      if(rejected!==3 || action.verifyTicketSignature({...ticket,hmacSignature:a}) || application.verifyApplicationTicketSignature(ticket,b)) process.exit(4);
      console.log('BYPASS_FAILS_CLOSED'); process.exit(0);
    `,
      baseEnvironment()
    );
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('BYPASS_FAILS_CLOSED'));
  });
  it('test-only preload refuses production rather than injecting fixture keys', () => {
    const env = baseEnvironment();
    const result = run(
      `await import(${JSON.stringify(moduleUrl('tests/setup/approval-signing-env.js'))});`,
      env
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('requires NODE_ENV=test'));
  });
  it('dotenv cannot switch a test preload to non-test configuration with injected keys', () => {
    const env = baseEnvironment();
    env.NODE_ENV = 'test';
    env.ENV_FILE = fileURLToPath(new URL('../../.env.example', import.meta.url));
    for (const name of names) delete env[name];
    const result = run(
      `await import(${JSON.stringify(moduleUrl('tests/setup/approval-signing-env.js'))});`,
      env
    );
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('ACTION_APPROVAL_HMAC_SECRET'));
    assert.ok(result.stderr.includes('CAREER_HUB_APPROVAL_SECRET'));
  });
  it('test environment without explicitly injected keys cannot sign or verify', () => {
    const env = baseEnvironment();
    env.NODE_ENV = 'test';
    for (const name of names) delete env[name];
    const result = run(
      `
      const action = await import(${JSON.stringify(moduleUrl('src/security/approval-signer.js'))});
      const application = await import(${JSON.stringify(moduleUrl('src/services/job-application-workflow.service.js'))});
      const ticket = {tenantId:'tenant',expiresAt:new Date().toISOString()};
      let rejected = 0;
      for(const fn of [()=>action.signTicketPayload(ticket),()=>application.signApplicationTicket(ticket)]) {
        try { fn(); } catch(error) { if(error.code==='INVALID_APPROVAL_SECRET') rejected++; }
      }
      if(rejected!==2 || action.verifyTicketSignature({...ticket,hmacSignature:'ab'.repeat(32)}) || application.verifyApplicationTicketSignature(ticket,'ab'.repeat(32))) process.exit(4);
      console.log('NO_TEST_FALLBACK'); process.exit(0);
    `,
      env
    );
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('NO_TEST_FALLBACK'));
  });
});
