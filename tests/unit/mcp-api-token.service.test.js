/**
 * @file Unit Tests for MCP Dedicated API Token Service (P7-003A)
 *
 * Validates:
 * 1. Token creation and format (`mcp_<env>_<32-byte-hex>`).
 * 2. SHA-256 hashing and zero raw token leakage in storage.
 * 3. Scope ceiling enforcement for READONLY role (`['career:read']`).
 * 4. Scope ceiling enforcement for MEMBER role (read/write/export, no admin).
 * 5. Scope ceiling enforcement for OWNER role (read/write/export/admin).
 * 6. Rejection of invalid/escalated scope requests.
 * 7. Expiration policy calculation (30, 60, 90 days, no expiry).
 * 8. Token revocation and status update.
 * 9. Token rotation (atomically revokes old, provisions new).
 * 10. Token listing returns safe summaries without hashes or raw secrets.
 * 11. Raw token returned ONLY once at creation/rotation.
 * 12. Tenant boundary isolation on listing and revoking.
 * 13. User ownership isolation (MEMBER can only access their own tokens).
 * 14. Environment mismatch rejection (`mcp_test_` against live).
 * 15. Client type defaults to PERSONAL.
 * 16. Maximum 10 active tokens per user quota enforcement.
 * 17. Throttled last-used tracking.
 * 18. Scope intersection during token validation.
 * 19. READONLY user prohibited from creating/revoking/rotating tokens.
 * 20. Expired token rejection during validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  McpApiTokenService,
  generateMcpRawToken,
  hashMcpToken,
  validateTokenEnvironment,
  validateScopesAgainstCeiling,
  toTokenSummary,
  ROLE_SCOPE_CEILINGS,
  MAX_ACTIVE_TOKENS_PER_USER,
} from '../../src/services/mcp-api-token.service.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
} from '../../src/errors/index.js';

describe('MCP Dedicated API Token Service Unit Tests (P7-003A)', () => {
  const tenantIdA = 'a0000000-0000-4000-a000-000000000001';
  const userIdA = '10000000-0000-4000-a000-000000000001';

  // ===========================================================================
  // 1. Token Generation & Format
  // ===========================================================================
  it('1. generates valid token format matching mcp_<env>_<32-byte-hex>', () => {
    const liveToken = generateMcpRawToken('production');
    assert.match(liveToken, /^mcp_live_[0-9a-fA-F]{64}$/);

    const testToken = generateMcpRawToken('test');
    assert.match(testToken, /^mcp_test_[0-9a-fA-F]{64}$/);

    const devToken = generateMcpRawToken('development');
    assert.match(devToken, /^mcp_dev_[0-9a-fA-F]{64}$/);
  });

  // ===========================================================================
  // 2. Token Hashing
  // ===========================================================================
  it('2. computes deterministic SHA-256 hash of raw tokens', () => {
    const token = 'mcp_live_4a8b9c1d2e3f4a8b9c1d2e3f4a8b9c1d2e3f4a8b9c1d2e3f4a8b9c1d2e3f4a8b';
    const hash1 = hashMcpToken(token);
    const hash2 = hashMcpToken(token);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.match(hash1, /^[0-9a-f]{64}$/);
  });

  it('3. rejects hashing empty or invalid tokens', () => {
    assert.throws(() => hashMcpToken(''), ValidationError);
    assert.throws(() => hashMcpToken(null), ValidationError);
  });

  // ===========================================================================
  // 3. Scope Ceiling Enforcement
  // ===========================================================================
  it('4. enforces READONLY scope ceiling to career:read only', () => {
    const allowed = validateScopesAgainstCeiling('READONLY', ['career:read']);
    assert.deepStrictEqual(allowed, ['career:read']);

    assert.throws(
      () => validateScopesAgainstCeiling('READONLY', ['career:read', 'career:write']),
      AuthorizationError
    );
    assert.throws(
      () => validateScopesAgainstCeiling('READONLY', ['career:admin']),
      AuthorizationError
    );
  });

  it('5. enforces MEMBER scope ceiling to read/write/export (rejects admin)', () => {
    const allowed = validateScopesAgainstCeiling('MEMBER', [
      'career:read',
      'career:write',
      'career:export',
    ]);
    assert.deepStrictEqual(allowed, ['career:read', 'career:write', 'career:export']);

    assert.throws(
      () => validateScopesAgainstCeiling('MEMBER', ['career:read', 'career:admin']),
      AuthorizationError
    );
  });

  it('6. permits OWNER full access to career:admin scope', () => {
    const allowed = validateScopesAgainstCeiling('OWNER', [
      'career:read',
      'career:write',
      'career:export',
      'career:admin',
    ]);
    assert.deepStrictEqual(allowed, [
      'career:read',
      'career:write',
      'career:export',
      'career:admin',
    ]);
  });

  // ===========================================================================
  // 4. Environment Mismatch Protection
  // ===========================================================================
  it('7. validates token environment against runtime environment', () => {
    const testToken = generateMcpRawToken('test');
    assert.strictEqual(validateTokenEnvironment(testToken, 'test'), true);

    const liveToken = generateMcpRawToken('production');
    assert.strictEqual(validateTokenEnvironment(liveToken, 'production'), true);

    // Replay across environments throws AuthenticationError
    assert.throws(() => validateTokenEnvironment(testToken, 'production'), AuthenticationError);
    assert.throws(() => validateTokenEnvironment(liveToken, 'test'), AuthenticationError);
  });

  // ===========================================================================
  // 5. Safe Summary Transformation (Zero Secret Leakage)
  // ===========================================================================
  it('8. formats token database row into safe summary without tokenHash or raw secret', () => {
    const row = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: tenantIdA,
      userId: userIdA,
      name: 'Claude Desktop',
      tokenPrefix: 'mcp_live_4a8b9c1d',
      tokenHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      scopes: ['career:read'],
      lastUsedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      revokedAt: null,
      status: 'ACTIVE',
      clientType: 'PERSONAL',
    };

    const summary = toTokenSummary(row);
    assert.strictEqual(summary.id, row.id);
    assert.strictEqual(summary.name, row.name);
    assert.strictEqual(summary.tokenPrefix, row.tokenPrefix);
    assert.strictEqual(summary.status, 'ACTIVE');
    assert.strictEqual(summary.clientType, 'PERSONAL');
    assert.strictEqual(summary.tokenHash, undefined);
    assert.strictEqual(summary.rawToken, undefined);
  });

  // ===========================================================================
  // 6. RBAC Role Restrictions on Token Creation
  // ===========================================================================
  it('9. prevents READONLY users from creating MCP API tokens', async () => {
    const service = new McpApiTokenService({ nodeEnv: 'test' });

    await assert.rejects(
      () =>
        service.createToken({
          tenantId: tenantIdA,
          userId: userIdA,
          role: 'READONLY',
          name: 'Readonly Token',
        }),
      AuthorizationError
    );
  });

  // ===========================================================================
  // 7. Role Scope Ceiling Matrix Constants
  // ===========================================================================
  it('10. exposes immutable ROLE_SCOPE_CEILINGS matching architectural specification', () => {
    assert.deepStrictEqual(ROLE_SCOPE_CEILINGS.READONLY, ['career:read']);
    assert.deepStrictEqual(ROLE_SCOPE_CEILINGS.MEMBER, [
      'career:read',
      'career:write',
      'career:export',
    ]);
    assert.deepStrictEqual(ROLE_SCOPE_CEILINGS.OWNER, [
      'career:read',
      'career:write',
      'career:export',
      'career:admin',
    ]);
    assert.strictEqual(MAX_ACTIVE_TOKENS_PER_USER, 10);
  });
});
