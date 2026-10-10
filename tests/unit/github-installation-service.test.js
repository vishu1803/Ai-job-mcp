import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {
  GitHubInstallationService,
  getInstallationCookieOptions,
} from '../../src/services/github-installation.service.js';
import { githubFixture, masterKey, installation } from '../helpers/github-installation.fixture.js';

const context = {
  tenantId: 'tenant-a',
  user: { id: 'user-a', tenantId: 'tenant-a', role: 'OWNER' },
  session: { id: 'session-a', userId: 'user-a', tenantId: 'tenant-a', githubUserId: '101' },
};
const payload = () => ({
  userId: 'user-a',
  tenantId: 'tenant-a',
  sessionId: 'session-a',
  githubUserId: '101',
  phase: 'authorize',
  installationId: '9001',
  nonce: 'test-nonce',
  expiresAt: Date.now() + 600000,
  callbackUrl: 'http://localhost:3000/integrations/github/authorize/callback',
});
const sign = (data) => {
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${encoded}.${crypto.createHmac('sha256', masterKey).update(encoded).digest('base64url')}`;
};

describe('ISSUE-01 installation state and lifecycle validation', () => {
  it('derives the fixed connector callback from the configured public address', () => {
    const service = new GitHubInstallationService({
      db: {},
      appUrl: 'https://dev.aicareershub.tech/',
      authManager: {},
      masterKey,
    });
    assert.equal(
      service.callbackUrl,
      'https://dev.aicareershub.tech/integrations/github/authorize/callback'
    );
    const token = sign({ ...payload(), callbackUrl: service.callbackUrl });
    assert.equal(
      service.validateInstallationState({
        ...context,
        stateToken: token,
        cookieToken: token,
        phase: 'authorize',
      }).callbackUrl,
      service.callbackUrl
    );
  });
  it('rejects localhost state after the configured connector address changes', () => {
    const service = new GitHubInstallationService({
      db: {},
      appUrl: 'https://dev.aicareershub.tech',
      authManager: {},
      masterKey,
    });
    const token = sign(payload());
    assert.throws(
      () =>
        service.validateInstallationState({
          ...context,
          stateToken: token,
          cookieToken: token,
          phase: 'authorize',
        }),
      { code: 'INVALID_OAUTH_STATE' }
    );
  });
  it('accepts signed session/user/tenant/identity/callback/installation context', () => {
    const { service } = githubFixture({});
    const token = sign(payload());
    assert.equal(
      service.validateInstallationState({
        ...context,
        stateToken: token,
        cookieToken: token,
        phase: 'authorize',
      }).installationId,
      '9001'
    );
  });

  const invalidCases = [
    ['missing state', () => ({ stateToken: undefined })],
    ['oversized state', () => ({ stateToken: 'x'.repeat(4097), cookieToken: 'x'.repeat(4097) })],
    [
      'malformed payload',
      () => {
        const encoded = Buffer.from('{').toString('base64url');
        const token = `${encoded}.${crypto.createHmac('sha256', masterKey).update(encoded).digest('base64url')}`;
        return { stateToken: token, cookieToken: token };
      },
    ],
    [
      'null payload',
      () => {
        const token = sign(null);
        return { stateToken: token, cookieToken: token };
      },
    ],
    ['missing cookie', () => ({ cookieToken: undefined })],
    ['mismatched cookie', () => ({ cookieToken: 'different' })],
    [
      'invalid signature',
      () => ({ stateToken: 'encoded.invalid', cookieToken: 'encoded.invalid' }),
    ],
    [
      'expired state',
      () => {
        const t = sign({ ...payload(), expiresAt: Date.now() - 1 });
        return { stateToken: t, cookieToken: t };
      },
    ],
    [
      'invalid expiry',
      () => {
        const t = sign({ ...payload(), expiresAt: null });
        return { stateToken: t, cookieToken: t };
      },
    ],
    [
      'another user',
      () => ({
        user: { ...context.user, id: 'other' },
        session: { ...context.session, userId: 'other' },
      }),
    ],
    [
      'another tenant',
      () => ({
        tenantId: 'other',
        user: { ...context.user, tenantId: 'other' },
        session: { ...context.session, tenantId: 'other' },
      }),
    ],
    ['another session', () => ({ session: { ...context.session, id: 'other' } })],
    ['another GitHub identity', () => ({ session: { ...context.session, githubUserId: '102' } })],
    [
      'another callback',
      () => {
        const t = sign({ ...payload(), callbackUrl: 'https://attacker.example/callback' });
        return { stateToken: t, cookieToken: t };
      },
    ],
    ['wrong phase', () => ({ phase: 'install' })],
  ];
  const failureReasons = {
    'missing state': 'MISSING_STATE',
    'oversized state': 'STATE_TOO_LONG',
    'malformed payload': 'MALFORMED_PAYLOAD',
    'null payload': 'MALFORMED_PAYLOAD',
    'missing cookie': 'MISSING_COOKIE',
    'mismatched cookie': 'COOKIE_MISMATCH',
    'invalid signature': 'INVALID_SIGNATURE',
    'expired state': 'EXPIRED_STATE',
    'invalid expiry': 'INVALID_EXPIRY',
    'another user': 'USER_MISMATCH',
    'another tenant': 'TENANT_MISMATCH',
    'another session': 'SESSION_MISMATCH',
    'another GitHub identity': 'GITHUB_IDENTITY_MISMATCH',
    'another callback': 'CALLBACK_MISMATCH',
    'wrong phase': 'PHASE_MISMATCH',
  };
  for (const [name, change] of invalidCases)
    it(`rejects ${name}`, () => {
      const { service } = githubFixture({});
      const token = sign(payload());
      assert.throws(
        () =>
          service.validateInstallationState({
            ...context,
            stateToken: token,
            cookieToken: token,
            phase: 'authorize',
            ...change(),
          }),
        (error) => {
          assert.equal(error.code, 'INVALID_OAUTH_STATE');
          assert.equal(error.statusCode, 401);
          assert.equal(error.details, null);
          assert.equal(error.installationStateFailure, failureReasons[name]);
          assert.ok(!JSON.stringify(error).includes('installationStateFailure'));
          return true;
        }
      );
    });

  it('rejects legacy sessions instead of comparing usernames or email', async () => {
    const { service } = githubFixture({});
    await assert.rejects(
      service.createInstallationState({
        ...context,
        session: { ...context.session, githubUserId: null },
      }),
      { code: 'GITHUB_LOGIN_REQUIRED' }
    );
  });
  it('rejects READONLY and unknown roles', async () => {
    for (const role of ['READONLY', 'ADMIN', undefined]) {
      const { service } = githubFixture({});
      await assert.rejects(
        service.createInstallationState({ ...context, user: { ...context.user, role } }),
        { statusCode: 403 }
      );
    }
  });
  it('legacy direct link and update methods cannot bypass OAuth', async () => {
    const { service, calls } = githubFixture({});
    for (const method of ['linkInstallation', 'updateInstallation']) {
      await assert.rejects(service[method]({ ...context, installationId: 9001 }), {
        code: 'INVALID_OAUTH_STATE',
      });
    }
    assert.equal(calls.length, 0);
  });
  it('missing App user credentials fail closed', async () => {
    const { service, calls } = githubFixture({});
    service.clientSecret = '';
    await assert.rejects(service.createInstallationState(context), {
      code: 'MISSING_GITHUB_APP_CONFIG',
    });
    assert.equal(calls.length, 0);
  });
  it('App visibility alone returns data but never writes a connection', async () => {
    const { service, calls } = githubFixture({});
    assert.equal((await service.verifyGitHubInstallation(9001)).id, 9001);
    assert.equal(calls.length, 1);
  });
  for (const [name, response] of [
    ['suspended', installation({ suspended_at: '2026-10-07T00:00:00Z' })],
    ['wrong installation ID', installation({ id: 9002 })],
    ['wrong App ID', installation({ app_id: 42 })],
    ['missing account', installation({ account: null })],
    ['missing suspension field', installation({ suspended_at: undefined })],
    ['missing contents permission', installation({ permissions: { metadata: 'read' } })],
  ])
    it(`rejects ${name} App installation responses`, async () => {
      const { service } = githubFixture({}, { appResponse: response });
      await assert.rejects(service.verifyGitHubInstallation(9001), {
        code: 'INSTALLATION_ACCESS_DENIED',
      });
    });
  it('production cookie satisfies __Host requirements independently of database TLS', async () => {
    for (const DATABASE_SSL of [false, true]) {
      const app = Fastify();
      await app.register(cookie);
      const { name, ...options } = getInstallationCookieOptions({
        NODE_ENV: 'production',
        DATABASE_SSL,
      });
      app.get('/', (_req, reply) => reply.setCookie(name, 'test-state', options).send('ok'));
      const response = await app.inject('/');
      const header = response.headers['set-cookie'];
      assert.ok(header.startsWith('__Host-gh_install_state='));
      assert.match(header, /; Path=\/(;|$)/);
      assert.match(header, /; Secure/);
      assert.match(header, /; HttpOnly/);
      assert.match(header, /; SameSite=Lax/);
      assert.doesNotMatch(header, /Domain=/i);
      await app.close();
    }
  });
});
