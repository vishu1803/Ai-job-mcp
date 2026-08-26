/**
 * @file Authentication Orchestration Service.
 *
 * Implements provider-neutral authentication logic:
 * 1. OAuth 2.1 flow initiation (PKCE + state generation)
 * 2. Callback validation and identity resolution
 * 3. Transactional user and personal tenant workspace provisioning
 * 4. Audit logging of authentication lifecycle events
 */

import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { tenants, users, candidates, candidateIdentities, auditLogs } from '../db/schema.js';
import { generateOAuthState, validateAndConsumeOAuthState } from './oauth-state.js';
import { createSession } from './session.service.js';
import { sanitizeAuditDetails } from '../utils/audit-sanitizer.js';
import { AuthenticationError, AuthorizationError } from '../errors/index.js';
import { GitHubProvider } from './providers/github.provider.js';
import { config } from '../config/env.js';

/**
 * Generates a clean URL-friendly slug for a personal tenant workspace.
 *
 * @param {string} name User display name
 * @param {string} [email=''] User email address
 * @returns {string} Unique tenant slug
 */
export function generateTenantSlug(name, email = '') {
  const base = (name || email.split('@')[0] || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'workspace'}-${suffix}`;
}

export class AuthService {
  /**
   * @param {Object} options Configuration & dependencies
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} options.db Database instance
   * @param {Map<string, import('./providers/base.provider.js').BaseIdentityProvider>} [options.providers] Identity provider registry
   */
  constructor(options) {
    if (!options || !options.db) {
      throw new Error('AuthService requires a database instance');
    }
    this.db = options.db;
    this.providers = options.providers || new Map();
    this.encryptionKey = options.encryptionKey;

    // Register default GitHub provider if not already supplied
    if (!this.providers.has('github')) {
      this.providers.set(
        'github',
        new GitHubProvider({
          clientId: config.GITHUB_CLIENT_ID,
          clientSecret: config.GITHUB_CLIENT_SECRET,
          redirectUri: config.GITHUB_OAUTH_REDIRECT_URI,
        })
      );
    }
  }

  /**
   * Gets a registered identity provider adapter.
   *
   * @param {string} providerName Provider key (e.g. 'github')
   * @returns {import('./providers/base.provider.js').BaseIdentityProvider} Provider instance
   * @throws {AuthenticationError} If provider is unknown or unsupported
   */
  getProvider(providerName) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new AuthenticationError(
        `Unsupported identity provider: "${providerName}"`,
        'UNSUPPORTED_PROVIDER'
      );
    }
    return provider;
  }

  /**
   * Initiates the OAuth 2.1 authorization flow with PKCE and encrypted transient state.
   *
   * @param {string} providerName Identity provider name
   * @param {Object} [options={}] Flow options
   * @param {string} [options.redirectUri] Custom redirect URI override
   * @param {string | Buffer} [options.encryptionKey] Encryption key override for tests
   * @returns {{ authorizationUrl: string, transitCookieValue: string }} Authorization URL and state cookie
   */
  startOAuthFlow(providerName, options = {}) {
    const provider = this.getProvider(providerName);

    const statePkg = generateOAuthState({
      provider: providerName,
      returnTo: options.returnTo,
      encryptionKey: options.encryptionKey || this.encryptionKey,
    });

    const authorizationUrl = provider.getAuthorizationUrl({
      state: statePkg.state,
      codeChallenge: statePkg.codeChallenge,
      redirectUri: options.redirectUri,
    });

    return {
      authorizationUrl,
      transitCookieValue: statePkg.transitCookieValue,
    };
  }

  /**
   * Processes the OAuth callback: verifies state/PKCE, exchanges token, resolves user/tenant,
   * creates server-side session, and logs audit record.
   *
   * @param {string} providerName Identity provider name
   * @param {Object} params Callback parameters
   * @param {string} params.code Authorization code
   * @param {string} params.state State parameter from query
   * @param {string} params.transitCookieValue Encrypted transit cookie
   * @param {string} [params.redirectUri] Redirect URI override
   * @param {string | null} [params.ipAddress=null] Client IP address
   * @param {string | null} [params.userAgent=null] Client User-Agent
   * @param {string | null} [params.requestId=null] Trace correlation ID
   * @param {string | Buffer} [params.encryptionKey] Master encryption key override
   * @returns {Promise<{ session: { rawToken: string, sessionId: string, expiresAt: Date }, user: typeof users.$inferSelect, tenant: typeof tenants.$inferSelect, candidate: typeof candidates.$inferSelect | null, isNewUser: boolean, onboardingState: string, returnTo: string | null }>} Created session and account metadata
   */
  async handleOAuthCallback(providerName, params) {
    const provider = this.getProvider(providerName);

    // 1. Validate PKCE & state integrity
    const { codeVerifier, returnTo } = validateAndConsumeOAuthState(
      params.state,
      params.transitCookieValue,
      {
        provider: providerName,
        encryptionKey: params.encryptionKey || this.encryptionKey,
      }
    );

    // 2. Exchange authorization code for provider access tokens
    const tokens = await provider.exchangeCode({
      code: params.code,
      codeVerifier,
      redirectUri: params.redirectUri,
    });

    // 3. Fetch normalized user profile
    const profile = await provider.getUserProfile(tokens.accessToken);

    // 4. Resolve or create user, tenant, candidate & candidateIdentity atomically in a transaction
    return await this.db.transaction(async (tx) => {
      // Find existing user by verified email
      const existingUsers = await tx.select().from(users).where(eq(users.email, profile.email));

      let user;
      let tenant;
      let candidate = null;
      let isNewUser = false;
      let onboardingState = 'COMPLETED';

      if (existingUsers.length > 0) {
        user = existingUsers[0];

        if (user.status === 'SUSPENDED') {
          throw new AuthorizationError(
            'Account is suspended. Contact support.',
            'ACCOUNT_SUSPENDED'
          );
        }

        if (user.status === 'DELETED') {
          throw new AuthorizationError('Account has been deactivated.', 'ACCOUNT_DELETED');
        }

        // Fetch user's existing tenant
        const tenantRows = await tx.select().from(tenants).where(eq(tenants.id, user.tenantId));

        if (!tenantRows || tenantRows.length === 0) {
          throw new AuthenticationError('User tenant record not found', 'TENANT_NOT_FOUND');
        }
        tenant = tenantRows[0];

        // Update display name or avatar if updated on IdP
        if (profile.avatarUrl && profile.avatarUrl !== user.avatarUrl) {
          await tx
            .update(users)
            .set({ avatarUrl: profile.avatarUrl, updatedAt: new Date() })
            .where(eq(users.id, user.id));
          user.avatarUrl = profile.avatarUrl;
        }

        // Fetch existing candidate profile for this user and tenant
        const candidateRows = await tx
          .select()
          .from(candidates)
          .where(and(eq(candidates.tenantId, tenant.id), eq(candidates.userId, user.id)));

        if (candidateRows.length > 0) {
          candidate = candidateRows[0];
          onboardingState =
            candidate.profileMetadata?.systemInferred?.onboardingState || 'COMPLETED';
        }
      } else {
        // Provision new personal workspace tenant
        isNewUser = true;
        onboardingState = 'REGISTERED';
        const tenantSlug = generateTenantSlug(profile.displayName, profile.email);
        const [newTenant] = await tx
          .insert(tenants)
          .values({
            name: `${profile.displayName}'s Workspace`,
            slug: tenantSlug,
            tier: 'FREE',
          })
          .returning();

        tenant = newTenant;

        // Provision new user as OWNER
        const [newUser] = await tx
          .insert(users)
          .values({
            tenantId: tenant.id,
            email: profile.email,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role: 'OWNER',
            status: 'ACTIVE',
          })
          .returning();

        user = newUser;

        // Provision initial candidate persona with REGISTERED onboarding state
        const initialMetadata = {
          userCustom: {},
          systemInferred: {
            onboardingState: 'REGISTERED',
          },
        };

        const [newCandidate] = await tx
          .insert(candidates)
          .values({
            tenantId: tenant.id,
            userId: user.id,
            displayName: profile.displayName,
            canonicalEmail: profile.email,
            profileMetadata: initialMetadata,
            status: 'ACTIVE',
          })
          .returning();

        candidate = newCandidate;

        // Provision candidate identity for GitHub
        const resourceProvider =
          providerName.toLowerCase() === 'github' ? 'GITHUB_APP' : providerName.toUpperCase();

        await tx
          .insert(candidateIdentities)
          .values({
            tenantId: tenant.id,
            candidateId: candidate.id,
            provider: resourceProvider,
            externalAccountId: profile.providerUserId,
            externalUsername: profile.displayName,
            externalEmail: profile.email,
            avatarUrl: profile.avatarUrl,
            verified: true,
            verifiedAt: new Date(),
            metadata: {},
          })
          .returning();
      }

      // 5. Mint server-side database session
      const session = await createSession(tx, {
        userId: user.id,
        tenantId: tenant.id,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      });

      // 6. Record audit log entry
      try {
        const sanitizedDetails = sanitizeAuditDetails({
          provider: providerName,
          providerUserId: profile.providerUserId,
          isNewUser,
          candidateId: candidate?.id || null,
        });

        await tx.insert(auditLogs).values({
          tenantId: tenant.id,
          userId: user.id,
          eventType: isNewUser ? 'auth.registered' : 'auth.login_succeeded',
          resourceType: 'user',
          resourceId: user.id,
          details: sanitizedDetails,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          requestId: params.requestId || null,
        });
      } catch {
        // Non-blocking audit log insert
      }

      return {
        session,
        user,
        tenant,
        candidate,
        isNewUser,
        onboardingState,
        returnTo: returnTo || null,
      };
    });
  }
}
