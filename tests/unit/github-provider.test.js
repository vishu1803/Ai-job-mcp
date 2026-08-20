import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubProvider } from '../../src/security/providers/github.provider.js';
import { AuthenticationError, DependencyError } from '../../src/errors/index.js';

describe('GitHub Identity Provider Adapter (P2-002)', () => {
  const CLIENT_ID = 'test_github_client_id_123';
  const CLIENT_SECRET = 'test_github_client_secret_456';
  const REDIRECT_URI = 'http://localhost:3000/auth/github/callback';

  describe('1. Authorization URL Generation', () => {
    it('constructs valid GitHub OAuth 2.1 authorization URL with PKCE (S256)', () => {
      const provider = new GitHubProvider({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
      });

      const urlString = provider.getAuthorizationUrl({
        state: 'random_state_hex_12345',
        codeChallenge: 'code_challenge_base64url_67890',
      });

      const url = new URL(urlString);
      assert.strictEqual(url.origin, 'https://github.com');
      assert.strictEqual(url.pathname, '/login/oauth/authorize');
      assert.strictEqual(url.searchParams.get('client_id'), CLIENT_ID);
      assert.strictEqual(url.searchParams.get('redirect_uri'), REDIRECT_URI);
      assert.strictEqual(url.searchParams.get('state'), 'random_state_hex_12345');
      assert.strictEqual(url.searchParams.get('code_challenge'), 'code_challenge_base64url_67890');
      assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
      assert.strictEqual(url.searchParams.get('scope'), 'read:user user:email');
    });

    it('throws error when client ID is missing', () => {
      const provider = new GitHubProvider({});
      assert.throws(
        () =>
          provider.getAuthorizationUrl({
            state: 'state_123',
            codeChallenge: 'challenge_123',
          }),
        (err) => err instanceof AuthenticationError && err.code === 'AUTH_CONFIG_MISSING'
      );
    });

    it('throws error when state or PKCE challenge is missing', () => {
      const provider = new GitHubProvider({ clientId: CLIENT_ID });
      assert.throws(
        () => provider.getAuthorizationUrl({ state: '', codeChallenge: 'challenge' }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_OAUTH_STATE'
      );
      assert.throws(
        () => provider.getAuthorizationUrl({ state: 'state', codeChallenge: '' }),
        (err) => err instanceof AuthenticationError && err.code === 'INVALID_PKCE'
      );
    });
  });

  describe('2. Authorization Code Exchange', () => {
    it('exchanges code for access token successfully', async () => {
      const mockFetch = async (url, options) => {
        assert.strictEqual(url, 'https://github.com/login/oauth/access_token');
        assert.strictEqual(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.strictEqual(body.client_id, CLIENT_ID);
        assert.strictEqual(body.code, 'valid_auth_code_123');
        assert.strictEqual(body.code_verifier, 'valid_code_verifier_456');

        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'gho_synthetic_token_789',
            token_type: 'bearer',
            scope: 'read:user,user:email',
          }),
        };
      };

      const provider = new GitHubProvider({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        redirectUri: REDIRECT_URI,
        fetchFn: mockFetch,
      });

      const tokens = await provider.exchangeCode({
        code: 'valid_auth_code_123',
        codeVerifier: 'valid_code_verifier_456',
      });

      assert.strictEqual(tokens.accessToken, 'gho_synthetic_token_789');
      assert.strictEqual(tokens.tokenType, 'bearer');
    });

    it('throws AuthenticationError when GitHub returns OAuth error response', async () => {
      const mockFetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        }),
      });

      const provider = new GitHubProvider({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        provider.exchangeCode({ code: 'expired_code', codeVerifier: 'verifier' }),
        (err) => err instanceof AuthenticationError && err.code === 'OAUTH_EXCHANGE_FAILED'
      );
    });

    it('throws DependencyError on network communication failure', async () => {
      const mockFetch = async () => {
        throw new Error('Network connection timeout');
      };

      const provider = new GitHubProvider({
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        fetchFn: mockFetch,
      });

      await assert.rejects(
        provider.exchangeCode({ code: 'auth_code', codeVerifier: 'verifier' }),
        (err) => err instanceof DependencyError && err.statusCode === 503
      );
    });
  });

  describe('3. User Profile Fetch & Normalization', () => {
    it('fetches user profile with public email and normalizes fields', async () => {
      const mockFetch = async (url) => {
        if (url === 'https://api.github.com/user') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 97516061,
              login: 'octocat',
              name: 'The Octocat',
              email: 'octocat@github.com',
              avatar_url: 'https://avatars.githubusercontent.com/u/97516061?v=4',
            }),
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const provider = new GitHubProvider({ fetchFn: mockFetch });
      const profile = await provider.getUserProfile('gho_test_token');

      assert.strictEqual(profile.provider, 'github');
      assert.strictEqual(profile.providerUserId, '97516061');
      assert.strictEqual(profile.email, 'octocat@github.com');
      assert.strictEqual(profile.displayName, 'The Octocat');
      assert.strictEqual(profile.avatarUrl, 'https://avatars.githubusercontent.com/u/97516061?v=4');
    });

    it('fetches private email from /user/emails when profile email is null', async () => {
      const mockFetch = async (url) => {
        if (url === 'https://api.github.com/user') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 12345678,
              login: 'private_user',
              name: null,
              email: null,
              avatar_url: null,
            }),
          };
        }
        if (url === 'https://api.github.com/user/emails') {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { email: 'unverified@example.com', primary: false, verified: false },
              { email: 'verified_primary@example.com', primary: true, verified: true },
            ],
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      };

      const provider = new GitHubProvider({ fetchFn: mockFetch });
      const profile = await provider.getUserProfile('gho_test_token');

      assert.strictEqual(profile.providerUserId, '12345678');
      assert.strictEqual(profile.email, 'verified_primary@example.com');
      assert.strictEqual(profile.displayName, 'private_user');
      assert.strictEqual(profile.avatarUrl, null);
    });
  });
});
