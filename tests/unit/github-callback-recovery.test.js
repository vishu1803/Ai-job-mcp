// Real Fastify error dispatch; synthetic authenticated context, no provider claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { errorHandler } from '../../src/plugins/error-handler.js';
import { AuthenticationError } from '../../src/errors/index.js';
import { Writable } from 'node:stream';
import { githubFixture } from '../helpers/github-installation.fixture.js';

const callbacks = [
  '/integrations/github/install/callback',
  '/integrations/github/authorize/callback',
];

async function requestFailure({
  path,
  signedIn = true,
  accept = 'text/html',
  code = 'INVALID_OAUTH_STATE',
  reason,
}) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.get(path, async (request) => {
    if (signedIn) {
      request.user = { id: 'fixture-user' };
      request.auth = { tenantId: 'fixture-tenant' };
    }
    const error = new AuthenticationError(
      'Invalid, expired, or already used installation state',
      code
    );
    if (reason) Object.defineProperty(error, 'installationStateFailure', { value: reason });
    throw error;
  });
  try {
    return await app.inject({ url: `${path}?state=synthetic-private-state`, headers: { accept } });
  } finally {
    await app.close();
  }
}

for (const path of callbacks) {
  test(`signed-in browser returns to Sources after rejected ${path}`, async () => {
    const response = await requestFailure({ path });
    assert.equal(response.statusCode, 302);
    const target = new URL(response.headers.location, 'https://fixture.example');
    assert.equal(target.pathname, '/sources');
    assert.match(target.searchParams.get('error'), /new connection.*10 minutes/i);
    assert.doesNotMatch(response.headers.location, /synthetic-private-state/);
    assert.equal(response.headers['set-cookie'], undefined);
  });
  test(`JSON rejection retains 401 and its original code for ${path}`, async () => {
    const response = await requestFailure({ path, accept: 'application/json' });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'INVALID_OAUTH_STATE');
    assert.equal(response.headers.location, undefined);
  });
}

test('unauthenticated connector failure still requires login', async () => {
  const response = await requestFailure({ path: callbacks[0], signedIn: false });
  assert.match(response.headers.location, /^\/login\?error=/);
});

test('wrong-phase browser callback explains the GitHub App configuration recovery', async () => {
  const response = await requestFailure({ path: callbacks[1], reason: 'PHASE_MISMATCH' });
  assert.equal(response.statusCode, 302);
  const target = new URL(response.headers.location, 'https://fixture.example');
  assert.equal(target.pathname, '/sources');
  const message = target.searchParams.get('error');
  assert.match(message, /turn off.*Request user authorization \(OAuth\) during installation/i);
  assert.match(message, /Setup URL.*\/integrations\/github\/install\/callback/);
  assert.match(message, /Callback URL.*\/integrations\/github\/authorize\/callback/);
  assert.match(message, /Redirect on update/);
  assert.match(message, /new connection from Sources/);
  assert.doesNotMatch(response.headers.location, /PHASE_MISMATCH|synthetic-private-state/);
  assert.equal(response.headers['set-cookie'], undefined);
});

test('wrong-phase JSON rejection remains 401 without browser guidance or diagnostics', async () => {
  const response = await requestFailure({
    path: callbacks[1],
    reason: 'PHASE_MISMATCH',
    accept: 'application/json',
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'INVALID_OAUTH_STATE');
  assert.equal(response.headers.location, undefined);
  assert.doesNotMatch(response.body, /PHASE_MISMATCH|Setup URL|installationStateFailure/);
});

test('other authentication failures on connector callbacks still require login', async () => {
  const response = await requestFailure({ path: callbacks[1], code: 'SESSION_EXPIRED' });
  assert.match(response.headers.location, /^\/login\?error=/);
});

test('login OAuth state failure retains its existing recovery', async () => {
  const response = await requestFailure({ path: '/auth/github/callback' });
  assert.match(response.headers.location, /^\/login\?error=/);
});

test('native connector rejection logs its safe reason without changing the API response', async () => {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = Fastify({ logger: { level: 'warn', stream } });
  const { service } = githubFixture({});
  app.setErrorHandler(errorHandler);
  app.get(callbacks[1], (request) => {
    const user = { id: 'fixture-user', tenantId: 'fixture-tenant', role: 'OWNER' };
    request.user = user;
    request.auth = { tenantId: user.tenantId };
    service.validateInstallationState({
      user,
      tenantId: user.tenantId,
      session: {
        id: 'fixture-session',
        userId: user.id,
        tenantId: user.tenantId,
        githubUserId: '101',
      },
      phase: 'authorize',
      stateToken: 'synthetic-private-state-value',
      cookieToken: undefined,
    });
  });
  try {
    const response = await app.inject({
      url: callbacks[1],
      headers: { accept: 'application/json' },
    });
    assert.equal(response.statusCode, 401);
    const body = response.json();
    assert.equal(body.error.code, 'INVALID_OAUTH_STATE');
    assert.equal(body.error.details, null);
    assert.doesNotMatch(response.body, /installationStateFailure|MISSING_COOKIE|synthetic-private/);
    const warning = output
      .trim()
      .split('\n')
      .map(JSON.parse)
      .find((entry) => entry.code === 'INVALID_OAUTH_STATE');
    assert.equal(warning.installationStateFailure, 'MISSING_COOKIE');
    assert.equal(warning.requestId, body.error.requestId);
    assert.doesNotMatch(output, /synthetic-private|fixture-session|fixture-user|fixture-tenant/);
  } finally {
    await app.close();
  }
});
