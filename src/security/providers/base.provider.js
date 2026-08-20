/**
 * @file Base Identity Provider interface/class for pluggable authentication.
 *
 * Defines the contract that all external identity providers (GitHub, Google, OIDC)
 * must implement to integrate with the Antigravity Career Hub authentication pipeline.
 */

/**
 * @typedef {Object} NormalizedUserProfile
 * @property {string} provider Provider identifier (e.g. 'github', 'google')
 * @property {string} providerUserId Immutable external subject identifier from the IdP
 * @property {string} email Verified primary email address
 * @property {string} displayName User's display name or username
 * @property {string | null} avatarUrl URL to user's profile avatar
 */

/**
 * @typedef {Object} AuthorizationUrlParams
 * @property {string} state Cryptographically random anti-CSRF state
 * @property {string} codeChallenge S256 PKCE code challenge
 * @property {string} [redirectUri] OAuth callback redirect URI
 * @property {string[]} [scopes] Requested OAuth scopes
 */

/**
 * @typedef {Object} ExchangeCodeParams
 * @property {string} code Authorization code received from IdP callback
 * @property {string} codeVerifier PKCE code verifier
 * @property {string} [redirectUri] OAuth callback redirect URI
 */

/**
 * @typedef {Object} ProviderTokens
 * @property {string} accessToken OAuth access token
 * @property {string} tokenType Token type (e.g. 'bearer')
 * @property {string} [scope] Granted scopes
 */

/**
 * Abstract Base Identity Provider.
 */
export class BaseIdentityProvider {
  /**
   * @param {string} name Provider identifier
   */
  constructor(name) {
    if (new.target === BaseIdentityProvider) {
      throw new TypeError('Cannot construct BaseIdentityProvider instances directly');
    }
    this.name = name;
  }

  /**
   * Generates the external authorization URL for starting the OAuth 2.1 flow.
   *
   * @param {AuthorizationUrlParams} params Authorization parameters
   * @returns {string} Fully qualified authorization URL
   * @abstract
   */
  getAuthorizationUrl(_params) {
    throw new Error('getAuthorizationUrl() must be implemented by subclass');
  }

  /**
   * Exchanges an authorization code and PKCE code verifier for provider tokens.
   *
   * @param {ExchangeCodeParams} _params Exchange parameters
   * @returns {Promise<ProviderTokens>} Provider access tokens
   * @abstract
   */
  async exchangeCode(_params) {
    throw new Error('exchangeCode() must be implemented by subclass');
  }

  /**
   * Fetches and normalizes user profile from the identity provider.
   *
   * @param {string} _accessToken Provider access token
   * @returns {Promise<NormalizedUserProfile>} Normalized user profile
   * @abstract
   */
  async getUserProfile(_accessToken) {
    throw new Error('getUserProfile() must be implemented by subclass');
  }
}
