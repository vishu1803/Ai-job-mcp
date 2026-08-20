/**
 * @file GitHub OAuth 2.0 Identity Provider Adapter.
 *
 * Implements the BaseIdentityProvider interface for authenticating users via GitHub.
 * Utilizes native fetch with zero external OAuth dependencies.
 */

import { BaseIdentityProvider } from './base.provider.js';
import { AuthenticationError, DependencyError } from '../../errors/index.js';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_API_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_API_URL = 'https://api.github.com/user/emails';
const DEFAULT_USER_AGENT = 'Antigravity-Career-Hub-Auth';

export class GitHubProvider extends BaseIdentityProvider {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.clientId GitHub OAuth Client ID
   * @param {string} [options.clientSecret] GitHub OAuth Client Secret
   * @param {string} [options.redirectUri] Default OAuth callback redirect URI
   * @param {string} [options.userAgent] HTTP User-Agent header for GitHub API calls
   * @param {typeof fetch} [options.fetchFn] Custom fetch implementation (for testing)
   */
  constructor(options = {}) {
    super('github');
    this.clientId = options.clientId || '';
    this.clientSecret = options.clientSecret || '';
    this.redirectUri = options.redirectUri || '';
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.fetch = options.fetchFn || globalThis.fetch;
  }

  /**
   * Generates the GitHub OAuth authorization URL with PKCE (S256).
   *
   * @param {import('./base.provider.js').AuthorizationUrlParams} params Authorization parameters
   * @returns {string} Fully qualified GitHub authorization URL
   */
  getAuthorizationUrl(params) {
    if (!this.clientId) {
      throw new AuthenticationError(
        'GitHub OAuth client ID is not configured',
        'AUTH_CONFIG_MISSING'
      );
    }

    if (!params.state) {
      throw new AuthenticationError('OAuth state parameter is required', 'INVALID_OAUTH_STATE');
    }

    if (!params.codeChallenge) {
      throw new AuthenticationError('PKCE code challenge is required', 'INVALID_PKCE');
    }

    const redirectUri = params.redirectUri || this.redirectUri;
    const scopes = params.scopes || ['read:user', 'user:email'];

    const url = new URL(GITHUB_AUTH_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');

    return url.toString();
  }

  /**
   * Exchanges an authorization code and PKCE code verifier for a GitHub access token.
   *
   * @param {import('./base.provider.js').ExchangeCodeParams} params Exchange parameters
   * @returns {Promise<import('./base.provider.js').ProviderTokens>} Provider access tokens
   */
  async exchangeCode(params) {
    if (!params.code) {
      throw new AuthenticationError('Missing authorization code in callback', 'INVALID_CALLBACK');
    }

    if (!params.codeVerifier) {
      throw new AuthenticationError(
        'Missing PKCE code verifier for token exchange',
        'INVALID_PKCE'
      );
    }

    const redirectUri = params.redirectUri || this.redirectUri;

    let response;
    try {
      response = await this.fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent,
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code: params.code,
          code_verifier: params.codeVerifier,
          redirect_uri: redirectUri,
        }),
      });
    } catch (err) {
      throw new DependencyError(`Failed to connect to GitHub OAuth token service: ${err.message}`, {
        service: 'github',
      });
    }

    if (!response.ok) {
      throw new DependencyError(
        `GitHub token exchange failed with HTTP status ${response.status}`,
        {
          service: 'github',
          status: response.status,
        }
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new AuthenticationError(
        `GitHub OAuth error: ${data.error_description || data.error}`,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    if (!data.access_token) {
      throw new AuthenticationError(
        'GitHub did not return an access token in the authorization response',
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'bearer',
      scope: data.scope || '',
    };
  }

  /**
   * Fetches user profile and verified email from GitHub API.
   *
   * @param {string} accessToken GitHub OAuth access token
   * @returns {Promise<import('./base.provider.js').NormalizedUserProfile>} Normalized user profile
   */
  async getUserProfile(accessToken) {
    if (!accessToken) {
      throw new AuthenticationError(
        'Missing access token for profile resolution',
        'AUTHENTICATION_ERROR'
      );
    }

    let userResponse;
    try {
      userResponse = await this.fetch(GITHUB_USER_API_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': this.userAgent,
        },
      });
    } catch (err) {
      throw new DependencyError(`Failed to connect to GitHub User API: ${err.message}`, {
        service: 'github',
      });
    }

    if (!userResponse.ok) {
      throw new DependencyError(`GitHub User API returned HTTP status ${userResponse.status}`, {
        service: 'github',
        status: userResponse.status,
      });
    }

    const userData = await userResponse.json();

    if (!userData.id) {
      throw new AuthenticationError('GitHub user profile missing identifier', 'INVALID_PROFILE');
    }

    let email = userData.email;

    // If email is not public, fetch from /user/emails endpoint
    if (!email) {
      try {
        const emailsResponse = await this.fetch(GITHUB_EMAILS_API_URL, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': this.userAgent,
          },
        });

        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          if (Array.isArray(emails) && emails.length > 0) {
            const primaryVerified = emails.find((e) => e.primary && e.verified);
            const verified = emails.find((e) => e.verified);
            email = primaryVerified?.email || verified?.email || emails[0]?.email;
          }
        }
      } catch {
        // Fall back to synthetic placeholder if private and email fetch fails
      }
    }

    if (!email) {
      email = `${userData.login || userData.id}@users.noreply.github.com`;
    }

    return {
      provider: 'github',
      providerUserId: String(userData.id),
      email: email.toLowerCase(),
      displayName: userData.name || userData.login || `User ${userData.id}`,
      avatarUrl: userData.avatar_url || null,
    };
  }
}
