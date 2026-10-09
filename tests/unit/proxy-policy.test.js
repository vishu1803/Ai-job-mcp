import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProxyPolicy,
  normalizeIp,
  parseTrustedProxies,
  resolveClientIdentity,
} from '../../src/security/proxy-policy.js';
import { envSchema } from '../../src/config/env.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { safeRequestSerializer } from '../../src/utils/logger.js';

for (const input of ['', '   ', undefined, false, []]) {
  test(`no implicit proxy trust: ${JSON.stringify(input)}`, () => {
    const policy = createProxyPolicy(input);
    assert.equal(policy.trust('127.0.0.1'), false);
    assert.equal(policy.trust('10.0.0.1'), false);
  });
}
for (const input of [
  '*',
  'true',
  true,
  1,
  () => true,
  'loopback',
  'uniquelocal',
  'localhost',
  '127.1',
  '0127.0.0.1',
  '1.2.3.4:80',
  '::/0',
  '0.0.0.0/0',
  '1.2.3.4/33',
  '::1/129',
  '1.2.3.4/255.255.255.0',
  '::ffff:192.0.2.0/95',
  '::ffff:192.0.2.0/96',
  'fe80::1%eth0',
  '1.2.3.4,',
  ',1.2.3.4',
  '1.2.3.4//24',
  [''],
  ['*'],
]) {
  test(`invalid proxy configuration rejected: ${String(input)}`, () =>
    assert.throws(() => createProxyPolicy(input), /TRUSTED_PROXY_CIDRS/));
}
test('deduplicates mapped, equivalent IPv6 and subnet forms', () => {
  assert.deepEqual(
    parseTrustedProxies(
      '192.0.2.1,::ffff:c000:201,::ffff:192.0.2.1,2001:db8::1,2001:0db8:0:0:0:0:0:1'
    ),
    ['192.0.2.1/32', '2001:db8::1/128']
  );
  assert.deepEqual(parseTrustedProxies('192.0.2.1/24,192.0.2.0/24,::ffff:192.0.2.12/120'), [
    '192.0.2.0/24',
  ]);
});
test('IPv4/mapped/IPv6 matching is family-safe', () => {
  const policy = createProxyPolicy('192.0.2.0/24,2001:db8::/64,::ffff:198.51.100.0/120');
  for (const ip of [
    '192.0.2.12',
    '::ffff:192.0.2.12',
    '::ffff:c000:20c',
    '2001:db8::2',
    '198.51.100.8',
  ])
    assert.equal(policy.trust(ip), true);
  for (const ip of ['192.0.3.1', '2001:db9::1', '::192.0.2.12', '198.51.101.8', 'bad'])
    assert.equal(policy.trust(ip), false);
  assert.equal(normalizeIp('::FFFF:C000:020C'), '192.0.2.12');
  assert.equal(normalizeIp('2001:0DB8:0000:0:0:0:0:1'), '2001:db8::1');
});
for (const mode of ['development', 'test', 'production']) {
  for (const value of ['', '127.0.0.1,2001:db8::/64', '*', '192.0.2.0/99']) {
    test(`env validation ${mode}/${value || 'absent'}`, () => {
      const result = envSchema.safeParse({
        NODE_ENV: mode,
        TRUSTED_PROXY_CIDRS: value,
        ENCRYPTION_MASTER_KEY: randomBytes(32).toString('hex'),
        ACTION_APPROVAL_HMAC_SECRET: randomBytes(32).toString('hex'),
        CAREER_HUB_APPROVAL_SECRET: randomBytes(32).toString('hex'),
      });
      assert.equal(result.success, value === '' || value.startsWith('127.'));
      if (result.success && value === '') assert.deepEqual(result.data.TRUSTED_PROXY_CIDRS, []);
    });
  }
}
for (const value of ['', '127.0.0.1', '*', 'malformed/12']) {
  test(`real production config bootstrap ${value || 'no proxies'}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import {config} from './src/config/env.js'; console.log('PROXY_CONFIG_ACCEPTED', config.TRUSTED_PROXY_CIDRS.length)",
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          ENV_FILE: 'nonexistent-issue08-test.env',
          APP_ENV: 'issue08-test',
          NODE_ENV: 'production',
          TRUSTED_PROXY_CIDRS: value,
          ENCRYPTION_MASTER_KEY: randomBytes(32).toString('hex'),
          ACTION_APPROVAL_HMAC_SECRET: randomBytes(32).toString('hex'),
          CAREER_HUB_APPROVAL_SECRET: randomBytes(32).toString('hex'),
        },
      }
    );
    assert.equal(result.status, value === '' || value === '127.0.0.1' ? 0 : 1);
    if (result.status !== 0) {
      assert.match(result.stderr, /TRUSTED_PROXY_CIDRS/);
      assert.doesNotMatch(result.stdout, /PROXY_CONFIG_ACCEPTED/);
    }
  });
}
test('missing identity is not an IP/auth throttle bypass', () => {
  const limiter = new McpRateLimiter({ ipLimit: 1, authLimit: 1 });
  assert.equal(limiter.checkIpLimitResult(undefined).allowed, true);
  assert.equal(limiter.checkIpLimitResult(null).allowed, false);
  assert.equal(limiter.checkAuthLimit('').allowed, true);
  assert.equal(limiter.checkAuthLimit(null).allowed, false);
  assert.throws(() => limiter.checkIpLimit(''), /Rate limit exceeded/);
});

test('invalid explicit dotenv proxy configuration overrides valid process configuration and stops bootstrap', () => {
  const directory = mkdtempSync(join(tmpdir(), 'issue08-env-'));
  const envFile = join(directory, 'proxy.env');
  try {
    writeFileSync(envFile, 'TRUSTED_PROXY_CIDRS=*\n');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import './src/config/env.js'; console.log('SHOULD_NOT_SERVE')",
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          ENV_FILE: envFile,
          NODE_ENV: 'production',
          TRUSTED_PROXY_CIDRS: '127.0.0.1',
          ENCRYPTION_MASTER_KEY: randomBytes(32).toString('hex'),
          ACTION_APPROVAL_HMAC_SECRET: randomBytes(32).toString('hex'),
          CAREER_HUB_APPROVAL_SECRET: randomBytes(32).toString('hex'),
        },
      }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /TRUSTED_PROXY_CIDRS/);
    assert.doesNotMatch(result.stdout, /SHOULD_NOT_SERVE/);
  } finally {
    unlinkSync(envFile);
    rmdirSync(directory);
  }
});
test('logs resolve identity before hooks and exclude raw attacker header values', () => {
  const proxyPolicy = createProxyPolicy('127.0.0.1');
  const req = {
    server: { proxyPolicy },
    socket: { remoteAddress: '127.0.0.1' },
    ip: 'attacker',
    headers: { 'x-forwarded-for': 'malicious-text', authorization: 'secret-test-material' },
  };
  const log = safeRequestSerializer(req);
  assert.equal(log.remoteAddress, '127.0.0.1');
  assert.equal(log.peerAddress, '127.0.0.1');
  assert.doesNotMatch(JSON.stringify(log), /malicious|secret-test/);
  assert.equal(resolveClientIdentity({ headers: {} }, proxyPolicy).clientIp, 'unknown');
  const established = safeRequestSerializer({ ...req, ip: '203.0.113.1', peerIp: '127.0.0.1' });
  assert.equal(
    established.remoteAddress,
    '203.0.113.1',
    'later header/schema mutations cannot change established log identity'
  );
});
