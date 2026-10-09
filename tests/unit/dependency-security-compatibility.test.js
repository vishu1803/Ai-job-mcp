import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';

const require = createRequire(import.meta.url);
const proxyaddr = require('proxy-addr');
const expand = require('brace-expansion');
const minimatch = require('minimatch');
const root = fileURLToPath(new URL('../../', import.meta.url));
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));

for (const [name, minimum] of [
  ['proxy-addr', '2.0.8'],
  ['@modelcontextprotocol/sdk', '1.31.0'],
  ['brace-expansion', '1.1.21'],
]) {
  test(`${name}: every locked copy is patched and installed consistently`, () => {
    const copies = Object.entries(lock.packages).filter(([path]) =>
      path.endsWith(`node_modules/${name}`)
    );
    assert.ok(copies.length > 0);
    for (const [path, record] of copies) {
      const installed = JSON.parse(
        readFileSync(new URL(`../../${path}/package.json`, import.meta.url), 'utf8')
      );
      assert.equal(
        installed.version,
        record.version,
        'Run npm ci; an inconsistent tree is not acceptance'
      );
      const patched =
        name === 'brace-expansion'
          ? require('semver').satisfies(
              record.version,
              '>=1.1.21 <2 || >=2.1.7 <3 || >=3.0.9 <4 || >=5.0.12'
            )
          : require('semver').gte(record.version, minimum);
      assert.ok(patched, `${path} must be non-vulnerable`);
    }
  });
}

const request = (remoteAddress, forwarded) => ({
  socket: { remoteAddress },
  headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
});

for (const [name, subnet, address, trusted] of [
  ['IPv4 in range', '10.0.0.0/8', '10.2.3.4', true],
  ['IPv4 outside range', '10.0.0.0/8', '198.51.100.4', false],
  ['mapped IPv4 in IPv4 range', '10.0.0.0/8', '::ffff:10.2.3.4', true],
  ['native IPv6 in range', '2001:db8::/32', '2001:db8::1', true],
  ['native IPv6 outside range', '2001:db8::/32', '2001:db9::1', false],
  ['mapped subnet with correct prefix', '::ffff:10.0.0.0/104', '10.2.3.4', true],
  ['mapped subnet excludes foreign IPv4', '::ffff:10.0.0.0/104', '198.51.100.4', false],
  ['short mapped prefix cannot trust all IPv4', '::ffff:10.0.0.0/8', '198.51.100.4', false],
  [
    'short mapped prefix cannot trust mapped attackers',
    '::ffff:10.0.0.0/8',
    '::ffff:198.51.100.4',
    false,
  ],
  ['native IPv6 subnet cannot trust IPv4', '::/1', '198.51.100.4', false],
  ['invalid address is not trusted', '10.0.0.0/8', 'not-an-ip', false],
]) {
  test(`proxy-addr: ${name}`, () => assert.equal(proxyaddr.compile(subnet)(address), trusted));
}

test('proxy-addr: direct socket identity without forwarding', () => {
  assert.equal(proxyaddr(request('198.51.100.4'), proxyaddr.compile('10.0.0.0/8')), '198.51.100.4');
});
test('proxy-addr: untrusted socket ignores forged forwarded IP', () => {
  assert.equal(
    proxyaddr(request('198.51.100.4', '203.0.113.9'), proxyaddr.compile('10.0.0.0/8')),
    '198.51.100.4'
  );
});
test('proxy-addr: trusted chain stops at the first untrusted hop', () => {
  assert.equal(
    proxyaddr(
      request('10.2.3.4', '203.0.113.9, 198.51.100.4, 10.1.2.3'),
      proxyaddr.compile('10.0.0.0/8')
    ),
    '198.51.100.4'
  );
});
test('proxy-addr: trusted chain resolves client and IPv6 direct connection', () => {
  const trust = proxyaddr.compile(['10.0.0.0/8', '2001:db8::/32']);
  assert.equal(proxyaddr(request('10.2.3.4', '203.0.113.9, 10.1.2.3'), trust), '203.0.113.9');
  assert.equal(proxyaddr(request('2001:db9::1', '203.0.113.9'), trust), '2001:db9::1');
});
test('proxy-addr: malformed forwarded chain cannot bypass an untrusted socket', () => {
  assert.equal(
    proxyaddr(request('198.51.100.4', 'garbage, , ::g'), proxyaddr.compile('10.0.0.0/8')),
    '198.51.100.4'
  );
  assert.throws(() => proxyaddr.compile('invalid-subnet'));
});
test('proxy-addr: forwarding changes cannot rotate rate-limit identity on an untrusted socket', () => {
  const limiter = new McpRateLimiter({ ipLimit: 1 });
  const trust = proxyaddr.compile('::ffff:10.0.0.0/8');
  limiter.checkIpLimit(proxyaddr(request('198.51.100.4', '203.0.113.1'), trust));
  assert.throws(
    () => limiter.checkIpLimit(proxyaddr(request('198.51.100.4', '203.0.113.2'), trust)),
    { code: 'RATE_LIMITED' }
  );
});

for (const [pattern, expected] of [
  ['src/{api,web}.js', ['src/api.js', 'src/web.js']],
  ['{1..3}', ['1', '2', '3']],
  ['{a,{b,c}}', ['a', 'b', 'c']],
  ['literal\\{a,b\\}', ['literal{a,b}']],
  ['', []],
]) {
  test(`brace-expansion: preserves ordinary pattern ${JSON.stringify(pattern)}`, () =>
    assert.deepEqual(expand(pattern), expected));
}
test('minimatch tooling still expands braces and rejects unrelated paths', () => {
  assert.equal(
    minimatch('tests/unit/security.test.js', 'tests/{unit,integration}/*.test.js'),
    true
  );
  assert.equal(minimatch('src/security.js', 'tests/{unit,integration}/*.test.js'), false);
});
for (const [name, expression] of [
  ['deep nesting', "'{'.repeat(3500) + 'a,b' + '}'.repeat(3500)"],
  ['chained comma groups', "'{' + '{a},'.repeat(7500) + 'b}'"],
  ['rewrite CPU guard', "'{a}' + '}'.repeat(3500) + ',z}'"],
]) {
  test(`brace-expansion: ${name} finishes without process crash`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const expand=require('brace-expansion'); const output=expand(${expression}, {max:10,maxLength:100000}); if(!Array.isArray(output)) process.exit(1);`,
      ],
      { cwd: root, encoding: 'utf8', timeout: 10000 }
    );
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
  });
}

const oauthProvider = (issuer) => ({
  clientMetadata: {},
  clientInformation: async () => ({
    client_id: 'synthetic-client',
    client_secret: 'synthetic-test-only-key',
    issuer,
  }),
  prepareTokenRequest: async () => new URLSearchParams({ grant_type: 'client_credentials' }),
});
test('patched MCP SDK refuses credentials bound to another authorization server', async () => {
  const { fetchToken } = await import('@modelcontextprotocol/sdk/client/auth.js');
  let requests = 0;
  await assert.rejects(
    fetchToken(oauthProvider('https://trusted.example'), 'https://attacker.example', {
      fetchFn: async () => {
        requests++;
        throw new Error('Must not send credentials');
      },
    }),
    /bound to authorization server/
  );
  assert.equal(requests, 0);
});
test('patched MCP SDK preserves a legitimate issuer-bound token exchange', async () => {
  const { fetchToken } = await import('@modelcontextprotocol/sdk/client/auth.js');
  let requests = 0;
  const tokens = await fetchToken(
    oauthProvider('https://trusted.example'),
    'https://trusted.example',
    {
      fetchFn: async (url, init) => {
        requests++;
        assert.equal(String(url), 'https://trusted.example/token');
        assert.ok(new globalThis.Headers(init.headers).has('authorization'));
        return globalThis.Response.json({
          access_token: 'synthetic-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        });
      },
    }
  );
  assert.equal(tokens.access_token, 'synthetic-access-token');
  assert.equal(requests, 1);
});
test('patched MCP SDK does not follow a token-endpoint redirect to another origin', async () => {
  const { fetchToken } = await import('@modelcontextprotocol/sdk/client/auth.js');
  const urls = [];
  await assert.rejects(
    fetchToken(oauthProvider('https://trusted.example'), 'https://trusted.example', {
      fetchFn: async (url, init) => {
        urls.push(String(url));
        assert.equal(init.redirect, 'manual');
        return new globalThis.Response(null, {
          status: 302,
          headers: { location: 'https://attacker.example/token' },
        });
      },
    }),
    /HTTP 302/
  );
  assert.deepEqual(urls, ['https://trusted.example/token']);
});
test('patched v1 MCP SDK initializes, invokes tools, reads resources and closes', async () => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const server = new McpServer({ name: 'dependency-test', version: '1.0.0' });
  const client = new Client({ name: 'dependency-client', version: '1.0.0' });
  server.registerTool('echo', { inputSchema: { message: z.string() } }, async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  }));
  server.registerResource('status', 'test://dependency-status', {}, async (uri) => ({
    contents: [{ uri: uri.href, text: 'ready' }],
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal((await client.listTools()).tools[0].name, 'echo');
    assert.equal(
      (await client.callTool({ name: 'echo', arguments: { message: 'safe' } })).content[0].text,
      'safe'
    );
    assert.equal(
      (await client.readResource({ uri: 'test://dependency-status' })).contents[0].text,
      'ready'
    );
    const invalid = await client.callTool({ name: 'echo', arguments: { message: 5 } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});
