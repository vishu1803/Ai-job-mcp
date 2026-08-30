/**
 * @file AI Connection Status & Lifecycle Service (P14-004B / ARCH-056).
 *
 * Provides real-time, database-derived connection states for:
 * 1. Anthropic Claude (OAuth 2.1 PKCE / Hosted Metadata)
 * 2. OpenAI ChatGPT (OAuth 2.1 PKCE / Web / Custom Actions)
 * 3. Google Gemini / Antigravity Agents (Dedicated Personal MCP API Tokens)
 *
 * Guarantees:
 * - Zero secret leakage (no tokens, hashes, or client secrets returned).
 * - Real DB state reflection (CONNECTED, NOT_CONNECTED, REVOKED, REFRESHABLE, TOKEN_EXPIRED).
 * - Safe provider-level revocation.
 */

import { eq, and, desc } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { oauthTokens, mcpApiTokens } from '../db/schema.js';
import { ValidationError } from '../errors/index.js';
import { logger as defaultLogger } from '../utils/logger.js';

export class AiConnectionStatusService {
  /**
   * @param {object} [options={}]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=defaultDb]
   * @param {import('pino').Logger} [options.logger=defaultLogger]
   */
  constructor(options = {}) {
    this.db = options.database || defaultDb;
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Retrieves sanitized, non-secret connection metadata for all supported AI providers.
   *
   * @param {object} params
   * @param {string} params.tenantId Authenticated Tenant UUID
   * @param {string} params.userId Authenticated User UUID
   * @param {string} [params.baseUrl='http://localhost:3000'] Server base URL
   * @returns {Promise<{ providers: Array<object>, mcpEndpoint: string, generatedAt: string }>}
   */
  async getConnectionStatus({ tenantId, userId, baseUrl = 'http://localhost:3000' }) {
    if (!tenantId || !userId) {
      throw new ValidationError(
        'tenantId and userId are required to query connection status.',
        'INVALID_PARAMETERS'
      );
    }

    const now = new Date();

    // 1. Fetch all OAuth tokens for this user
    const userOAuthTokens = await this.db
      .select({
        id: oauthTokens.id,
        clientId: oauthTokens.clientId,
        tokenScopes: oauthTokens.tokenScopes,
        accessTokenExpiresAt: oauthTokens.accessTokenExpiresAt,
        isRevoked: oauthTokens.isRevoked,
        createdAt: oauthTokens.createdAt,
      })
      .from(oauthTokens)
      .where(and(eq(oauthTokens.tenantId, tenantId), eq(oauthTokens.userId, userId)))
      .orderBy(desc(oauthTokens.createdAt));

    // 2. Fetch all Personal MCP API tokens for this user
    const userMcpTokens = await this.db
      .select({
        id: mcpApiTokens.id,
        name: mcpApiTokens.name,
        scopes: mcpApiTokens.scopes,
        expiresAt: mcpApiTokens.expiresAt,
        status: mcpApiTokens.status,
        createdAt: mcpApiTokens.createdAt,
        lastUsedAt: mcpApiTokens.lastUsedAt,
      })
      .from(mcpApiTokens)
      .where(and(eq(mcpApiTokens.tenantId, tenantId), eq(mcpApiTokens.userId, userId)))
      .orderBy(desc(mcpApiTokens.createdAt));

    // --- A. Evaluate Claude Status ---
    const claudeTokens = userOAuthTokens.filter(
      (t) =>
        t.clientId?.startsWith('claude-') ||
        t.clientId?.includes('claude.ai') ||
        t.clientId?.includes('anthropic.com')
    );

    let claudeStatus = 'NOT_CONNECTED';
    let claudeLastConnected = null;
    let claudeScopes = ['career:read', 'career:write'];

    if (claudeTokens.length > 0) {
      const latest = claudeTokens[0];
      claudeLastConnected = latest.createdAt.toISOString();
      claudeScopes = latest.tokenScopes || claudeScopes;

      if (latest.isRevoked) {
        claudeStatus = 'REVOKED';
      } else if (new Date(latest.accessTokenExpiresAt) < now) {
        // Access token expired, check if unrevoked token exists
        const hasUnrevoked = claudeTokens.some((t) => !t.isRevoked);
        claudeStatus = hasUnrevoked ? 'REFRESHABLE' : 'TOKEN_EXPIRED';
      } else {
        claudeStatus = 'CONNECTED';
      }
    }

    // --- B. Evaluate ChatGPT Status ---
    const chatgptTokens = userOAuthTokens.filter(
      (t) =>
        t.clientId?.startsWith('chatgpt-') ||
        t.clientId?.includes('chatgpt.com') ||
        t.clientId?.includes('openai.com')
    );

    let chatgptStatus = 'NOT_CONNECTED';
    let chatgptLastConnected = null;
    let chatgptScopes = ['career:read'];

    if (chatgptTokens.length > 0) {
      const latest = chatgptTokens[0];
      chatgptLastConnected = latest.createdAt.toISOString();
      chatgptScopes = latest.tokenScopes || chatgptScopes;

      if (latest.isRevoked) {
        chatgptStatus = 'REVOKED';
      } else if (new Date(latest.accessTokenExpiresAt) < now) {
        const hasUnrevoked = chatgptTokens.some((t) => !t.isRevoked);
        chatgptStatus = hasUnrevoked ? 'REFRESHABLE' : 'TOKEN_EXPIRED';
      } else {
        chatgptStatus = 'CONNECTED';
      }
    }

    // --- C. Evaluate Gemini / Agent Tokens Status ---
    const activeMcpTokens = userMcpTokens.filter(
      (t) => t.status === 'ACTIVE' && (!t.expiresAt || new Date(t.expiresAt) > now)
    );

    let geminiStatus = 'NOT_CONNECTED';
    let geminiLastConnected = null;
    let geminiScopes = ['career:read'];

    if (activeMcpTokens.length > 0) {
      geminiStatus = 'CONNECTED';
      geminiLastConnected = activeMcpTokens[0].createdAt.toISOString();
      geminiScopes = activeMcpTokens[0].scopes || geminiScopes;
    } else if (userMcpTokens.length > 0) {
      geminiStatus = userMcpTokens[0].status === 'REVOKED' ? 'REVOKED' : 'TOKEN_EXPIRED';
      geminiLastConnected = userMcpTokens[0].createdAt.toISOString();
    }

    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    return {
      providers: [
        {
          id: 'claude',
          name: 'Anthropic Claude',
          type: 'OAUTH_2_1',
          status: claudeStatus,
          authMethod: 'OAuth 2.1 + PKCE (S256)',
          scopes: claudeScopes,
          connectedAt: claudeLastConnected,
          clientIds: ['claude-web', 'claude-desktop', 'claude-code'],
          mcpEndpoint: `${cleanBaseUrl}/mcp`,
          environment: cleanBaseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
        },
        {
          id: 'chatgpt',
          name: 'OpenAI ChatGPT',
          type: 'OAUTH_2_1',
          status: chatgptStatus,
          authMethod: 'OAuth 2.1 + PKCE (S256)',
          scopes: chatgptScopes,
          connectedAt: chatgptLastConnected,
          clientIds: ['chatgpt-web', 'chatgpt-desktop'],
          mcpEndpoint: `${cleanBaseUrl}/mcp`,
          environment: cleanBaseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
        },
        {
          id: 'gemini',
          name: 'Google Gemini & AGY',
          type: 'PERSONAL_MCP_TOKEN',
          status: geminiStatus,
          authMethod: 'Personal MCP API Token (SHA-256)',
          scopes: geminiScopes,
          connectedAt: geminiLastConnected,
          mcpEndpoint: `${cleanBaseUrl}/mcp`,
          environment: cleanBaseUrl.includes('localhost') ? 'Local Development' : 'Public Staging',
        },
      ],
      mcpEndpoint: `${cleanBaseUrl}/mcp`,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Safely revokes active connection authorizations for a specific provider.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.userId
   * @param {string} params.provider Provider ID ('claude' | 'chatgpt' | 'gemini')
   * @returns {Promise<{ revokedCount: number, provider: string }>}
   */
  async revokeProviderConnection({ tenantId, userId, provider }) {
    if (!tenantId || !userId || !provider) {
      throw new ValidationError(
        'tenantId, userId, and provider are required.',
        'INVALID_PARAMETERS'
      );
    }

    let revokedCount = 0;

    if (provider === 'claude' || provider === 'chatgpt') {
      const allTokens = await this.db
        .select({ id: oauthTokens.id, clientId: oauthTokens.clientId })
        .from(oauthTokens)
        .where(
          and(
            eq(oauthTokens.tenantId, tenantId),
            eq(oauthTokens.userId, userId),
            eq(oauthTokens.isRevoked, false)
          )
        );

      const targetTokens = allTokens.filter((t) => {
        if (provider === 'claude') {
          return (
            t.clientId?.startsWith('claude-') ||
            t.clientId?.includes('claude.ai') ||
            t.clientId?.includes('anthropic.com')
          );
        }
        return (
          t.clientId?.startsWith('chatgpt-') ||
          t.clientId?.includes('chatgpt.com') ||
          t.clientId?.includes('openai.com')
        );
      });

      for (const t of targetTokens) {
        await this.db
          .update(oauthTokens)
          .set({ isRevoked: true, revokedAt: new Date(), updatedAt: new Date() })
          .where(eq(oauthTokens.id, t.id));
        revokedCount++;
      }
    } else if (provider === 'gemini') {
      const activeTokens = await this.db
        .select({ id: mcpApiTokens.id })
        .from(mcpApiTokens)
        .where(
          and(
            eq(mcpApiTokens.tenantId, tenantId),
            eq(mcpApiTokens.userId, userId),
            eq(mcpApiTokens.status, 'ACTIVE')
          )
        );

      for (const t of activeTokens) {
        await this.db
          .update(mcpApiTokens)
          .set({ status: 'REVOKED', revokedAt: new Date() })
          .where(eq(mcpApiTokens.id, t.id));
        revokedCount++;
      }
    }

    this.logger.info(
      { tenantId, userId, provider, revokedCount },
      'Provider connection authorizations revoked'
    );

    return { revokedCount, provider };
  }
}
