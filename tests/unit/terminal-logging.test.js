import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from '../../src/plugins/error-handler.js';
import { validateResponse } from '../../src/middleware/validate.js';
import { buildApp } from '../../src/app.js';
import { createLogger } from '../../src/utils/logger.js';

test('HTTP callback logs omit query secrets on success, validation failure and missing routes', async () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = Fastify({ loggerInstance: createLogger({ level: 'trace' }, stream) });
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  const paths = [
    '/auth/github/callback',
    '/integrations/github/install/callback',
    '/integrations/github/authorize/callback',
  ];
  for (const path of paths) {
    app.get(path, async (request) => ({ code: request.query.code, state: request.query.state }));
  }
  app.get(
    '/__logging/invalid/callback',
    { preSerialization: validateResponse(z.object({ ok: z.literal(true) })) },
    async () => ({ ok: false })
  );
  try {
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    const query =
      '?code=synthetic-oauth-code&state=synthetic-signed-state&%63ode=synthetic-encoded-code&state=synthetic-duplicate-state';
    for (const path of [...paths, '/__logging/invalid/callback', '/__logging/missing/callback']) {
      const response = await fetch(base + path + query);
      assert.equal(
        response.status,
        paths.includes(path) ? 200 : path.includes('/invalid/') ? 500 : 404
      );
      const body = await response.json();
      if (paths.includes(path)) {
        assert.deepEqual(body.code, ['synthetic-oauth-code', 'synthetic-encoded-code']);
        assert.deepEqual(body.state, ['synthetic-signed-state', 'synthetic-duplicate-state']);
      }
      const incoming = output
        .trim()
        .split('\n')
        .map(JSON.parse)
        .find((entry) => entry.req?.url === path);
      assert.ok(incoming, 'Missing sanitized incoming request path');
      assert.equal(incoming.req.method, 'GET');
      assert.equal(incoming.req.id, response.headers.get('x-request-id') || incoming.reqId);
    }
    for (const secret of [
      'synthetic-oauth-code',
      'synthetic-signed-state',
      'synthetic-encoded-code',
      'synthetic-duplicate-state',
    ]) {
      assert.ok(!output.includes(secret), 'Callback secret leaked to terminal');
    }
  } finally {
    await app.close();
  }
});

test('verbose terminal mode emits every level to stdout and keeps redaction', () => {
  const source = `
    import { logger, createChildLogger, getLoggerConfig } from './src/utils/logger.js';
    for (const level of ['trace','debug','info','warn','error','fatal']) logger[level]('terminal-' + level);
    createChildLogger({ service: 'fixture' }).debug({ token: 'synthetic-terminal-secret' }, 'child-debug');
    if (getLoggerConfig({ level: 'warn' }).level !== 'warn') throw new Error('Override lost');
  `;
  const child = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', source, '--', '--verbose-logs'],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      timeout: 15000,
    }
  );
  assert.equal(child.status, 0, child.stderr);
  const logs = child.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    assert.ok(
      logs.some((entry) => entry.msg === 'terminal-' + level),
      level + ' missing'
    );
  assert.equal(logs.find((entry) => entry.msg === 'child-debug').token, '[REDACTED]');
  assert.ok(!child.stdout.includes('synthetic-terminal-secret'));
});

test('real HTTP logs explicit and thrown 500s with correlation and private stacks', async () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk;
      done();
    },
  });
  const app = buildApp({ loggerInstance: createLogger({ level: 'trace' }, stream) });
  app.get('/__logging/handled', async (_request, reply) =>
    reply.code(500).send({ error: 'Fixture failure' })
  );
  app.get('/__logging/thrown', async () => {
    const error = new Error('Synthetic handoff exception');
    error.token = 'synthetic-exception-secret';
    throw error;
  });
  try {
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    for (const path of ['/__logging/handled', '/__logging/thrown']) {
      const response = await fetch(url + path, {
        headers: {
          authorization: 'Bearer synthetic-header-secret',
          cookie: 'test=synthetic-cookie-secret',
        },
      });
      assert.equal(response.status, 500);
      const body = await response.text();
      assert.ok(!body.includes('Synthetic handoff exception'));
      assert.ok(!body.includes('terminal-logging.test.js'));
      const logs = output
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const failure = logs.find(
        (entry) => entry.msg === 'HTTP request failed' && entry.url === path
      );
      assert.ok(failure, 'No error-level terminal event for ' + path);
      assert.equal(failure.level, 50);
      assert.equal(failure.statusCode, 500);
      assert.equal(failure.requestId, response.headers.get('x-request-id'));
      assert.equal(failure.method, 'GET');
      assert.ok(failure.durationMs >= 0);
    }
    const logs = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const exception = logs.find((entry) => entry.err?.message === 'Synthetic handoff exception');
    assert.ok(exception.err.stack.includes('terminal-logging.test.js'));
    assert.equal(exception.err.token, '[REDACTED]');
    for (const value of [
      'synthetic-header-secret',
      'synthetic-cookie-secret',
      'synthetic-exception-secret',
    ])
      assert.ok(!output.includes(value));
  } finally {
    await app.close();
  }
});
