import assert from 'node:assert/strict';
import { GitHubInstallationService } from '../../src/services/github-installation.service.js';

export const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export function installation(overrides = {}) {
  return {
    id: 9001,
    app_id: 123456,
    account: { id: 101, login: 'owner', type: 'User' },
    suspended_at: null,
    repository_selection: 'selected',
    permissions: { contents: 'read', metadata: 'read' },
    ...overrides,
  };
}

// Mock only the remote GitHub HTTP boundary; service/state/SQL/transactions remain real.
export function githubFixture(db, options = {}) {
  const calls = [];
  const appInstallation = options.installation || installation();
  const authManager = {
    appId: 123456,
    baseUrl: 'https://api.github.com',
    getAppJwt: () => 'app-jwt',
  };
  const fetchFn = async (url, request) => {
    calls.push({ url, request });
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal);
    const path = new URL(url).pathname;
    if (options.fail?.[path]) {
      const failure = options.fail[path];
      if (failure === 'network') throw new Error('Network unavailable');
      if (failure === 'json')
        return {
          ok: true,
          json: async () => {
            throw new Error('Invalid JSON');
          },
        };
      return { ok: false, status: failure, json: async () => ({ message: 'Remote failure' }) };
    }
    let body;
    if (path === '/login/oauth/access_token') {
      assert.equal(request.method, 'POST');
      const form = new URLSearchParams(request.body);
      assert.equal(form.get('client_id'), 'Iv1.test');
      assert.equal(
        form.get('redirect_uri'),
        'http://localhost:3000/integrations/github/authorize/callback'
      );
      assert.ok(form.get('code_verifier')?.length >= 43);
      body = options.token || { access_token: 'ghu_test_user_token', token_type: 'bearer' };
    } else {
      assert.equal(
        request.headers.Authorization,
        path.startsWith('/app/') ? 'Bearer app-jwt' : 'Bearer ghu_test_user_token'
      );
      if (path === '/user')
        body = options.profile || { id: 101, login: 'renamed-owner', type: 'User' };
      else if (path === '/user/installations') {
        body =
          options.listResponse ||
          (options.pages
            ? options.pages[Number(new URL(url).searchParams.get('page')) - 1]
            : {
                total_count: (options.accessible || [appInstallation]).length,
                installations: options.accessible || [appInstallation],
              });
      } else if (path.startsWith('/user/memberships/orgs/')) {
        body = options.membership || {
          state: 'active',
          role: 'admin',
          organization: { id: appInstallation.account.id },
        };
      } else if (path.startsWith('/app/installations/')) {
        await options.beforeAppResponse?.();
        body = options.appResponse || appInstallation;
      } else throw new Error(`Unexpected endpoint: ${path}`);
    }
    return { ok: true, status: 200, json: async () => body };
  };
  const service = new GitHubInstallationService({
    db,
    authManager,
    masterKey,
    keyVersion: 'v1',
    clientId: 'Iv1.test',
    clientSecret: 'test-secret',
    appSlug: 'test-app',
    appUrl: 'http://localhost:3000',
    fetchFn,
  });
  return { service, calls };
}

export async function authorizedFlow(service, context, installationId = 9001) {
  const start = await service.createInstallationState(context);
  const authorization = await service.beginUserAuthorization({
    ...context,
    installationId,
    stateToken: start.stateToken,
    cookieToken: start.stateToken,
  });
  return {
    ...context,
    code: 'valid-code',
    stateToken: authorization.stateToken,
    cookieToken: authorization.stateToken,
  };
}
