import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildApp } from '../../src/app.js';
import { closeDatabase } from '../../src/db/index.js';
import { McpRateLimiter } from '../../src/security/mcp-rate-limiter.js';
import { extractClientIp } from '../../src/utils/extract-client-ip.js';
import { safeRequestSerializer } from '../../src/utils/logger.js';

after(async () => {
  await closeDatabase();
});
async function listen(
  t,
  proxies = false,
  host = '127.0.0.1',
  limiter = new McpRateLimiter({ ipLimit: 2, authLimit: 2 })
) {
  const app = buildApp({
    logger: false,
    trustProxy: proxies,
    rateLimiter: limiter,
    authService: {
      startOAuthFlow: () => ({
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        transitCookieValue: 'explicit-test-transit',
      }),
    },
  });
  app.get('/test/identity', async (req) => ({
    ip: req.ip,
    ips: req.ips,
    peer: req.peerIp,
    extracted: extractClientIp(req),
    log: safeRequestSerializer(req),
  }));
  app.get('/test/authenticated-bucket', async (req, reply) => {
    // Synthetic token/tenant identities, never supplied by IP headers.
    const result = limiter.checkTenantLimitResult('synthetic-tenant');
    return reply.code(result.allowed ? 200 : 429).send({ tenant: 'synthetic-tenant', ip: req.ip });
  });
  await app.listen({ host, port: 0 });
  t.after(() => app.close());
  return { app, limiter, host, port: app.server.address().port };
}
function request(server, headers = {}, path = '/test/identity', localAddress) {
  return new Promise((resolve, reject) => {
    const mcp = path === '/mcp';
    const req = http.request(
      {
        hostname: server.host,
        port: server.port,
        localAddress,
        path,
        method: mcp ? 'POST' : 'GET',
        headers: { ...headers, ...(mcp ? { 'content-type': 'application/json' } : {}) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data.startsWith('{') ? JSON.parse(data) : data,
          })
        );
      }
    );
    req.on('error', reject);
    req.end(mcp ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) : undefined);
  });
}
test('buildApp cannot accept wildcard/hop-count/function proxy bypasses', () => {
  for (const trustProxy of [true, 1, () => true, '*', 'loopback'])
    assert.throws(() => buildApp({ trustProxy, logger: false }), /TRUSTED_PROXY_CIDRS/);
});
test('default application configuration ignores forged forwarding identity', async (t) => {
  const app = buildApp({ logger: false });
  app.get('/test/default', async (req) => ({ ip: req.ip }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  const result = await request(
    { host: '127.0.0.1', port: app.server.address().port },
    { 'x-forwarded-for': '203.0.113.10' },
    '/test/default'
  );
  assert.equal(result.body.ip, '127.0.0.1');
});
for (const header of ['x-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'forwarded']) {
  test(`untrusted TCP peer cannot rotate ${header} into new MCP/login buckets`, async (t) => {
    const server = await listen(t);
    const mcp = [],
      auth = [];
    for (let i = 10; i < 15; i++) {
      const headers = {
        [header]: header === 'forwarded' ? `for=203.0.113.${i}` : `203.0.113.${i}`,
      };
      const identity = (await request(server, headers)).body;
      assert.equal(identity.ip, '127.0.0.1');
      assert.equal(identity.extracted, identity.ip);
      assert.equal(identity.log.remoteAddress, identity.ip);
      assert.equal(identity.log.peerAddress, identity.peer);
      mcp.push((await request(server, headers, '/mcp')).status);
      auth.push((await request(server, headers, '/auth/github')).status);
    }
    assert.deepEqual(mcp, [401, 401, 429, 429, 429]);
    assert.deepEqual(auth, [302, 302, 429, 429, 429]);
    assert.equal([...server.limiter.hits.keys()].filter((key) => key.startsWith('ip:')).length, 1);
  });
}
test('unknown ingress is not trusted even if another proxy is configured', async (t) => {
  const server = await listen(t, '192.0.2.10');
  assert.equal((await request(server, { 'x-forwarded-for': '203.0.113.10' })).body.ip, '127.0.0.1');
});
for (const [header, expected] of [
  ['203.0.113.10', '203.0.113.10'],
  ['192.0.2.99, 203.0.113.10', '203.0.113.10'],
  ['192.0.2.99, 203.0.113.10, 10.0.0.2', '203.0.113.10'],
  ['192.0.2.99, 203.0.113.10, 10.0.0.1, 10.0.0.2', '203.0.113.10'],
  ['192.0.2.99, 172.16.0.50, 10.0.0.2', '172.16.0.50'],
  ['::ffff:203.0.113.10', '203.0.113.10'],
  ['::FFFF:CB00:710A', '203.0.113.10'],
  ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
  ['192.0.2.99, 2001:db8::1, 2001:db8:ffff::2', '2001:db8::1'],
]) {
  test(`trusted real TCP ingress stops correctly: ${header}`, async (t) => {
    const server = await listen(t, '127.0.0.1,10.0.0.0/24,2001:db8:ffff::/64');
    const identity = (
      await request(server, { 'x-forwarded-for': header, 'cf-connecting-ip': '192.0.2.200' })
    ).body;
    assert.equal(identity.ip, expected);
    assert.equal(identity.extracted, expected);
    assert.equal(identity.peer, '127.0.0.1');
    assert.equal(identity.log.remoteAddress, expected);
  });
}
for (const value of [
  '',
  'not-an-ip',
  '1.2.3.4:123',
  'unknown,203.0.113.1',
  '203.0.113.1,,10.0.0.1',
  '[2001:db8::1]',
  'fe80::1%eth0',
  '203.0.113.1,'.repeat(33),
]) {
  test(`malformed trusted chain collapses to peer: ${value.slice(0, 50)}`, async (t) => {
    const server = await listen(t, '127.0.0.1');
    const result = await request(server, { 'x-forwarded-for': value });
    assert.equal(result.status, 200);
    assert.equal(result.body.ip, '127.0.0.1');
  });
}
test('trusted ingress with no XFF ignores alternative identity headers', async (t) => {
  const server = await listen(t, '127.0.0.1');
  assert.equal(
    (
      await request(server, {
        'cf-connecting-ip': '203.0.113.1',
        'x-real-ip': '203.0.113.2',
        forwarded: 'for=203.0.113.3',
      })
    ).body.ip,
    '127.0.0.1'
  );
});
test('sanitized trusted ingress distinguishes clients and mapped forms share buckets', async (t) => {
  const server = await listen(t, '127.0.0.1');
  for (const ip of ['203.0.113.1', '::ffff:203.0.113.1'])
    assert.equal((await request(server, { 'x-forwarded-for': ip }, '/mcp')).status, 401);
  assert.equal(
    (await request(server, { 'x-forwarded-for': '::ffff:cb00:7101' }, '/mcp')).status,
    429
  );
  assert.equal((await request(server, { 'x-forwarded-for': '203.0.113.2' }, '/mcp')).status, 401);
});
test('real IPv6 TCP peer and mapped CIDR configuration', async (t) => {
  const server = await listen(t, '::1', '::1');
  const identity = (await request(server, { 'x-forwarded-for': '2001:db8::9' })).body;
  assert.equal(identity.peer, '::1');
  assert.equal(identity.ip, '2001:db8::9');
  const mapped = await listen(t, '::ffff:127.0.0.1/128');
  assert.equal(
    (await request(mapped, { 'x-forwarded-for': '203.0.113.9' })).body.ip,
    '203.0.113.9'
  );
});
test('tenant buckets remain independent of rotating trusted client IPs', async (t) => {
  const server = await listen(t, '127.0.0.1', '127.0.0.1', new McpRateLimiter({ tenantLimit: 1 }));
  assert.equal(
    (await request(server, { 'x-forwarded-for': '203.0.113.1' }, '/test/authenticated-bucket'))
      .status,
    200
  );
  assert.equal(
    (await request(server, { 'x-forwarded-for': '203.0.113.2' }, '/test/authenticated-bucket'))
      .status,
    429
  );
});
test('two instances and restart preserve trust policy (limiter state is process-local)', async (t) => {
  for (let i = 0; i < 3; i++) {
    const server = await listen(t, false);
    assert.equal(
      (await request(server, { 'x-forwarded-for': `203.0.113.${i}` })).body.ip,
      '127.0.0.1'
    );
  }
});

test('allowlisted loopback is not an implicit allowlist for other loopback peers', async (t) => {
  const server = await listen(t, '127.0.0.1');
  const identity = (
    await request(server, { 'x-forwarded-for': '203.0.113.99' }, '/test/identity', '127.0.0.2')
  ).body;
  assert.equal(identity.peer, '127.0.0.2');
  assert.equal(identity.ip, '127.0.0.2');
});

test('untrusted real IPv6 peer cannot rotate forwarding headers into new buckets', async (t) => {
  const server = await listen(t, false, '::1');
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const headers = { 'x-forwarded-for': `2001:db8::${i + 1}` };
    assert.equal((await request(server, headers)).body.ip, '::1');
    statuses.push((await request(server, headers, '/mcp')).status);
  }
  assert.deepEqual(statuses, [401, 401, 429]);
});

test('trusted ingress cannot override fixed XFF identity with rotating alternative headers', async (t) => {
  const server = await listen(t, '127.0.0.1');
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const headers = {
      'x-forwarded-for': '203.0.113.20',
      'cf-connecting-ip': `192.0.2.${i}`,
      'x-real-ip': `198.51.100.${i}`,
      forwarded: `for=2001:db8::${i}`,
    };
    assert.equal((await request(server, headers)).body.ip, '203.0.113.20');
    statuses.push((await request(server, headers, '/mcp')).status);
  }
  assert.deepEqual(statuses, [401, 401, 429]);
});

async function relay(t, host, target, edge) {
  const server = http.createServer((incoming, outgoing) => {
    const peer = incoming.socket.remoteAddress;
    const headers = {
      ...incoming.headers,
      'x-forwarded-for': edge ? peer : `${incoming.headers['x-forwarded-for']}, ${peer}`,
    };
    delete headers['cf-connecting-ip'];
    delete headers['x-real-ip'];
    delete headers.forwarded;
    const upstream = http.request(
      {
        hostname: target.host,
        port: target.port,
        localAddress: host,
        path: incoming.url,
        method: incoming.method,
        headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode, response.headers);
        response.pipe(outgoing);
      }
    );
    upstream.on('error', () => {
      outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  t.after(
    () =>
      new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  );
  return { host, port: server.address().port };
}

for (const trustEdge of [true, false]) {
  test(`real two-relay TCP chain with edge trusted=${trustEdge}`, async (t) => {
    const application = await listen(t, trustEdge ? '127.0.0.2,127.0.0.3' : '127.0.0.3');
    const inner = await relay(t, '127.0.0.3', application, false);
    const edge = await relay(t, '127.0.0.2', inner, true);
    const identity = (
      await request(
        edge,
        { 'x-forwarded-for': '192.0.2.99,198.51.100.99' },
        '/test/identity',
        '127.0.0.4'
      )
    ).body;
    assert.equal(identity.peer, '127.0.0.3');
    assert.equal(identity.ip, trustEdge ? '127.0.0.4' : '127.0.0.2');
    assert.ok(!identity.ips.includes('192.0.2.99'));
  });
}
