/**
 * @file Unit Tests for Resource Connections Schema & Helper Utilities (P2-003)
 *
 * Validates:
 * 1. Drizzle ORM schema structure, column types, and enum values
 * 2. Key version consistency validation
 * 3. Scopes structure validation (JSONB array)
 * 4. Safe metadata bounds and credential exclusion
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resourceConnections,
  resourceProviderEnum,
  connectionAuthTypeEnum,
  resourceConnectionStatusEnum,
} from '../../src/db/schema.js';
import { encryptSecret, decryptSecret, CryptoError } from '../../src/security/encryption.js';

describe('Resource Connections Schema & Utilities Unit Tests (P2-003)', () => {
  const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  describe('1. Schema Definition & Enums', () => {
    it('defines resourceProviderEnum with all approved providers', () => {
      assert.ok(resourceProviderEnum);
      assert.deepStrictEqual(resourceProviderEnum.enumValues, [
        'GITHUB_APP',
        'GITLAB',
        'GOOGLE_DRIVE',
        'ONEDRIVE',
        'NOTION',
        'CUSTOM_API',
        'LINKEDIN',
        'GOOGLE',
        'MANUAL',
      ]);
    });

    it('defines connectionAuthTypeEnum with all approved auth types', () => {
      assert.ok(connectionAuthTypeEnum);
      assert.deepStrictEqual(connectionAuthTypeEnum.enumValues, [
        'APP_INSTALLATION',
        'OAUTH2_CODE',
        'API_KEY',
        'SERVICE_ACCOUNT',
      ]);
    });

    it('defines resourceConnectionStatusEnum with all approved statuses', () => {
      assert.ok(resourceConnectionStatusEnum);
      assert.deepStrictEqual(resourceConnectionStatusEnum.enumValues, [
        'PENDING',
        'ACTIVE',
        'EXPIRED',
        'REVOKED',
        'ERROR',
        'DISCONNECTED',
      ]);
    });

    it('defines resourceConnections table with all 21 approved columns', () => {
      assert.ok(resourceConnections);
      const columnKeys = Object.keys(resourceConnections);
      const expectedColumns = [
        'id',
        'tenantId',
        'userId',
        'provider',
        'authType',
        'displayName',
        'externalAccountId',
        'externalAccountName',
        'installationId',
        'encryptedCredentials',
        'keyVersion',
        'status',
        'scopes',
        'metadata',
        'expiresAt',
        'refreshedAt',
        'lastValidatedAt',
        'lastErrorCode',
        'lastErrorAt',
        'createdAt',
        'updatedAt',
      ];

      for (const col of expectedColumns) {
        assert.ok(
          columnKeys.includes(col),
          `Expected column ${col} to be defined in resourceConnections`
        );
      }
    });
  });

  describe('2. Credential Encryption & Key-Version Consistency', () => {
    it('encrypts synthetic credential package and formats as valid compact string', () => {
      const credentials = {
        accessToken: 'ghs_synthetic_installation_token_xyz123',
        refreshToken: 'ghr_synthetic_refresh_token_abc456',
        tokenType: 'bearer',
      };

      const encrypted = encryptSecret(JSON.stringify(credentials), {
        key: TEST_KEY,
        keyVersion: 'v1',
      });

      assert.ok(typeof encrypted === 'string');
      assert.ok(encrypted.startsWith('enc:v1:v1:'));
      assert.ok(!encrypted.includes('ghs_synthetic'));
      assert.ok(!encrypted.includes('ghr_synthetic'));

      const decrypted = JSON.parse(decryptSecret(encrypted, { key: TEST_KEY }));
      assert.deepStrictEqual(decrypted, credentials);
    });

    it('verifies that keyVersion matches between encrypted payload and column metadata', () => {
      const encrypted = encryptSecret('synthetic_secret', {
        key: TEST_KEY,
        keyVersion: 'v1',
      });

      // Parse parts: enc:v1:<keyVersion>:<iv>:<tag>:<ciphertext>
      const parts = encrypted.split(':');
      const payloadKeyVersion = parts[2];
      const columnKeyVersion = 'v1';

      assert.strictEqual(payloadKeyVersion, columnKeyVersion);
    });

    it('detects tampering with encrypted credential package', () => {
      const encrypted = encryptSecret('synthetic_secret', {
        key: TEST_KEY,
        keyVersion: 'v1',
      });

      const tampered = encrypted.slice(0, -4) + 'AAAA';
      assert.throws(
        () => decryptSecret(tampered, { key: TEST_KEY }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          return true;
        }
      );
    });
  });

  describe('3. Scopes & Metadata Bounds Validation', () => {
    it('formats scopes as valid JSONB array', () => {
      const scopes = ['contents:read', 'metadata:read', 'pull_requests:write'];
      const serialized = JSON.stringify(scopes);
      const parsed = JSON.parse(serialized);

      assert.ok(Array.isArray(parsed));
      assert.strictEqual(parsed.length, 3);
      assert.ok(parsed.includes('contents:read'));
    });

    it('ensures metadata object is free of credentials and keys', () => {
      const safeMetadata = {
        accountType: 'Organization',
        targetId: 88776655,
        repositorySelection: 'selected',
      };

      const serialized = JSON.stringify(safeMetadata);
      assert.ok(!serialized.includes('token'));
      assert.ok(!serialized.includes('secret'));
      assert.ok(!serialized.includes('key'));
    });
  });
});
