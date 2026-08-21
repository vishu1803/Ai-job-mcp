/**
 * @file Unit Tests for AES-256-GCM Secret Encryption Foundation (P2-001)
 *
 * Tests:
 * - Round-trip encryption and decryption (string & Buffer)
 * - Cryptographic randomization (unique IV per call)
 * - Wrong key rejection
 * - Tampering detection (ciphertext, IV, auth tag, AAD/key version)
 * - Malformed payload rejection
 * - Sizing bounds (64 KB limit enforcement)
 * - Empty string and complex Unicode handling
 * - Key rotation workflow
 * - Key/plaintext non-leakage in payloads and error objects
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptSecret,
  decryptSecret,
  rotateSecret,
  normalizeKey,
  resolveKey,
  serializeEncryptedPayload,
  deserializeEncryptedPayload,
  isEncryptedSecret,
  generateRandomEncryptionKey,
  CryptoError,
  MAX_PLAINTEXT_BYTES,
  CURRENT_ENCRYPTION_FORMAT_VERSION,
} from '../../src/security/encryption.js';
import { config } from '../../src/config/env.js';

describe('AES-256-GCM Secret Encryption Foundation (P2-001)', () => {
  const TEST_KEY_1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const TEST_KEY_2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const TEST_KEY_RING = {
    v1: TEST_KEY_1,
    v2: TEST_KEY_2,
  };

  describe('1. Round-Trip Encryption and Decryption', () => {
    it('encrypts and decrypts ASCII plaintext string correctly', () => {
      const plaintext = 'ghp_super_secret_github_personal_access_token_12345';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });

      assert.strictEqual(typeof encrypted, 'string');
      assert.ok(encrypted.startsWith('enc:v1:'));

      const decrypted = decryptSecret(encrypted, { key: TEST_KEY_1 });
      assert.strictEqual(decrypted, plaintext);
    });

    it('encrypts and decrypts structured object format (format: object)', () => {
      const plaintext = 'oauth_refresh_token_xyz_987654321';
      const encryptedObj = encryptSecret(plaintext, {
        key: TEST_KEY_1,
        keyVersion: 'v1',
        format: 'object',
      });

      assert.strictEqual(typeof encryptedObj, 'object');
      assert.strictEqual(encryptedObj.version, CURRENT_ENCRYPTION_FORMAT_VERSION);
      assert.strictEqual(encryptedObj.keyVersion, 'v1');
      assert.strictEqual(typeof encryptedObj.iv, 'string');
      assert.strictEqual(typeof encryptedObj.tag, 'string');
      assert.strictEqual(typeof encryptedObj.ciphertext, 'string');

      const decrypted = decryptSecret(encryptedObj, { key: TEST_KEY_1 });
      assert.strictEqual(decrypted, plaintext);
    });

    it('encrypts and decrypts raw Buffer plaintext and returns Buffer with encoding: buffer', () => {
      const rawBytes = crypto.randomBytes(64);
      const encrypted = encryptSecret(rawBytes, { key: TEST_KEY_1 });

      const decryptedBuffer = decryptSecret(encrypted, {
        key: TEST_KEY_1,
        encoding: 'buffer',
      });

      assert.ok(Buffer.isBuffer(decryptedBuffer));
      assert.ok(decryptedBuffer.equals(rawBytes));
    });

    it('handles empty secret string gracefully', () => {
      const plaintext = '';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });

      const decrypted = decryptSecret(encrypted, { key: TEST_KEY_1 });
      assert.strictEqual(decrypted, '');
    });
  });

  describe('2. Randomization & Nonce Uniqueness', () => {
    it('produces distinct ciphertexts and IVs when encrypting identical plaintext twice', () => {
      const plaintext = 'identical_secret_value_for_randomization_test';

      const enc1 = encryptSecret(plaintext, { key: TEST_KEY_1 });
      const enc2 = encryptSecret(plaintext, { key: TEST_KEY_1 });

      assert.notStrictEqual(enc1, enc2);

      const parsed1 = deserializeEncryptedPayload(enc1);
      const parsed2 = deserializeEncryptedPayload(enc2);

      assert.notStrictEqual(parsed1.iv, parsed2.iv);
      assert.notStrictEqual(parsed1.tag, parsed2.tag);
      assert.notStrictEqual(parsed1.ciphertext, parsed2.ciphertext);

      assert.strictEqual(decryptSecret(enc1, { key: TEST_KEY_1 }), plaintext);
      assert.strictEqual(decryptSecret(enc2, { key: TEST_KEY_1 }), plaintext);
    });
  });

  describe('3. Key Management & Wrong Key Rejection', () => {
    it('fails decryption when decrypted with a different valid key', () => {
      const plaintext = 'sensitive_client_secret_xyz';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });

      assert.throws(
        () => decryptSecret(encrypted, { key: TEST_KEY_2 }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          assert.strictEqual(err.statusCode, 500);
          return true;
        }
      );
    });

    it('resolves keys from key ring mapping using keyVersion header', () => {
      const plaintext = 'multi_version_key_ring_secret';

      const encV1 = encryptSecret(plaintext, {
        keyVersion: 'v1',
        keys: TEST_KEY_RING,
      });
      const encV2 = encryptSecret(plaintext, {
        keyVersion: 'v2',
        keys: TEST_KEY_RING,
      });

      const parsed1 = deserializeEncryptedPayload(encV1);
      const parsed2 = deserializeEncryptedPayload(encV2);

      assert.strictEqual(parsed1.keyVersion, 'v1');
      assert.strictEqual(parsed2.keyVersion, 'v2');

      assert.strictEqual(decryptSecret(encV1, { keys: TEST_KEY_RING }), plaintext);
      assert.strictEqual(decryptSecret(encV2, { keys: TEST_KEY_RING }), plaintext);
    });

    it('throws UNKNOWN_KEY_VERSION when payload specifies unconfigured key version', () => {
      const encrypted = `enc:v1:v99:1234567890123456:1234567890123456789012:abcdef`;

      assert.throws(
        () => decryptSecret(encrypted, { keys: TEST_KEY_RING }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'UNKNOWN_KEY_VERSION');
          return true;
        }
      );
    });
  });

  describe('4. Tampering & Integrity Verification', () => {
    it('fails decryption if ciphertext is tampered', () => {
      const plaintext = 'integrity_test_payload';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });
      const payload = deserializeEncryptedPayload(encrypted);

      // Flip first char of ciphertext
      const tamperedCiphertext =
        payload.ciphertext[0] === 'A'
          ? 'B' + payload.ciphertext.slice(1)
          : 'A' + payload.ciphertext.slice(1);
      payload.ciphertext = tamperedCiphertext;

      assert.throws(
        () => decryptSecret(payload, { key: TEST_KEY_1 }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          return true;
        }
      );
    });

    it('fails decryption if authentication tag is tampered', () => {
      const plaintext = 'auth_tag_tamper_test';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });
      const payload = deserializeEncryptedPayload(encrypted);

      // Flip first char of tag
      const tamperedTag =
        payload.tag[0] === 'X' ? 'Y' + payload.tag.slice(1) : 'X' + payload.tag.slice(1);
      payload.tag = tamperedTag;

      assert.throws(
        () => decryptSecret(payload, { key: TEST_KEY_1 }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          return true;
        }
      );
    });

    it('fails decryption if IV is tampered', () => {
      const plaintext = 'iv_tamper_test';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });
      const payload = deserializeEncryptedPayload(encrypted);

      // Flip first char of IV
      const tamperedIv =
        payload.iv[0] === 'Z' ? 'W' + payload.iv.slice(1) : 'Z' + payload.iv.slice(1);
      payload.iv = tamperedIv;

      assert.throws(
        () => decryptSecret(payload, { key: TEST_KEY_1 }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          return true;
        }
      );
    });

    it('fails decryption if keyVersion (AAD) is swapped between identical keys', () => {
      // Both v1 and v2 use the identical key, but AAD binds keyVersion in the GCM tag!
      const duplicateRing = { v1: TEST_KEY_1, v2: TEST_KEY_1 };
      const plaintext = 'aad_binding_verification';
      const encrypted = encryptSecret(plaintext, {
        keyVersion: 'v1',
        keys: duplicateRing,
      });

      const payload = deserializeEncryptedPayload(encrypted);
      payload.keyVersion = 'v2'; // Swap header version

      assert.throws(
        () => decryptSecret(payload, { keys: duplicateRing }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'AUTHENTICATION_FAILED');
          return true;
        }
      );
    });
  });

  describe('5. Input Validation & Malformed Payloads', () => {
    it('rejects null, undefined, or non-string/Buffer plaintext inputs', () => {
      assert.throws(
        () => encryptSecret(null, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'INVALID_PLAINTEXT'
      );
      assert.throws(
        () => encryptSecret(undefined, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'INVALID_PLAINTEXT'
      );
      assert.throws(
        () => encryptSecret(12345, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'INVALID_PLAINTEXT'
      );
      assert.throws(
        () => encryptSecret({ token: 'abc' }, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'INVALID_PLAINTEXT'
      );
    });

    it('rejects malformed compact string formats', () => {
      assert.throws(
        () => decryptSecret('not-encrypted-string', { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'MALFORMED_PAYLOAD'
      );
      assert.throws(
        () => decryptSecret('enc:v1:v1:short', { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'MALFORMED_PAYLOAD'
      );
      assert.throws(
        () => decryptSecret('enc:v2:v1:iv:tag:cipher', { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'MALFORMED_PAYLOAD'
      );
    });

    it('rejects invalid IV length and invalid Tag length during deserialization', () => {
      const invalidIvPayload = {
        version: 1,
        keyVersion: 'v1',
        iv: Buffer.alloc(8).toString('base64url'), // 8 bytes instead of 12
        tag: Buffer.alloc(16).toString('base64url'),
        ciphertext: 'abcdef',
      };

      assert.throws(
        () => decryptSecret(invalidIvPayload, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'MALFORMED_PAYLOAD'
      );

      const invalidTagPayload = {
        version: 1,
        keyVersion: 'v1',
        iv: Buffer.alloc(12).toString('base64url'),
        tag: Buffer.alloc(8).toString('base64url'), // 8 bytes instead of 16
        ciphertext: 'abcdef',
      };

      assert.throws(
        () => decryptSecret(invalidTagPayload, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'MALFORMED_PAYLOAD'
      );
    });
  });

  describe('6. Sizing Bounds & Plaintext Limits', () => {
    it('encrypts and decrypts reasonably large secret up to 64 KB', () => {
      const largeSecret = 'A'.repeat(MAX_PLAINTEXT_BYTES);
      const encrypted = encryptSecret(largeSecret, { key: TEST_KEY_1 });
      const decrypted = decryptSecret(encrypted, { key: TEST_KEY_1 });

      assert.strictEqual(decrypted.length, MAX_PLAINTEXT_BYTES);
      assert.strictEqual(decrypted, largeSecret);
    });

    it('rejects plaintext exceeding maximum allowed size of 64 KB', () => {
      const oversizedSecret = 'A'.repeat(MAX_PLAINTEXT_BYTES + 1);

      assert.throws(
        () => encryptSecret(oversizedSecret, { key: TEST_KEY_1 }),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'PAYLOAD_TOO_LARGE');
          return true;
        }
      );
    });
  });

  describe('7. Unicode, Multilingual & Emoji Support', () => {
    it('preserves UTF-8 multi-byte characters and emojis without corruption', () => {
      const complexSecret = '🔐 Key: 日本語 漢字 / العربية / हिन्दी / 🚀 Antigravity 100% ✨';
      const encrypted = encryptSecret(complexSecret, { key: TEST_KEY_1 });
      const decrypted = decryptSecret(encrypted, { key: TEST_KEY_1 });

      assert.strictEqual(decrypted, complexSecret);
    });
  });

  describe('8. Secret & Key Leakage Prevention', () => {
    it('does not contain the master key in the encrypted ciphertext package', () => {
      const plaintext = 'my_precious_api_token';
      const encrypted = encryptSecret(plaintext, { key: TEST_KEY_1 });

      assert.ok(!encrypted.includes(TEST_KEY_1));
      assert.ok(!encrypted.includes(Buffer.from(TEST_KEY_1, 'hex').toString('base64url')));
    });

    it('does not leak plaintext or master key in error messages or error properties', () => {
      const secret = 'TOP_SECRET_NEVER_LOG_ME_XYZ_999';
      const encrypted = encryptSecret(secret, { key: TEST_KEY_1 });

      try {
        decryptSecret(encrypted, { key: TEST_KEY_2 });
        assert.fail('Expected decryptSecret to throw');
      } catch (err) {
        assert.ok(!err.message.includes(secret));
        assert.ok(!err.message.includes(TEST_KEY_1));
        assert.ok(!err.message.includes(TEST_KEY_2));
        assert.ok(!JSON.stringify(err).includes(secret));
      }
    });
  });

  describe('9. Key Rotation Workflow', () => {
    it('rotates secret from old key version (v1) to new key version (v2)', () => {
      const plaintext = 'oauth_token_to_be_rotated';
      const encV1 = encryptSecret(plaintext, {
        keyVersion: 'v1',
        keys: TEST_KEY_RING,
      });

      const rotatedV2 = rotateSecret(encV1, {
        oldKeyOptions: { keys: TEST_KEY_RING },
        newKeyOptions: { keyVersion: 'v2', keys: TEST_KEY_RING },
      });

      const parsedV2 = deserializeEncryptedPayload(rotatedV2);
      assert.strictEqual(parsedV2.keyVersion, 'v2');

      // Old payload decrypts with v1
      assert.strictEqual(decryptSecret(encV1, { key: TEST_KEY_1 }), plaintext);

      // Rotated payload decrypts with v2
      assert.strictEqual(decryptSecret(rotatedV2, { key: TEST_KEY_2 }), plaintext);

      // Rotated payload fails with old single key v1
      assert.throws(
        () => decryptSecret(rotatedV2, { key: TEST_KEY_1 }),
        (err) => err instanceof CryptoError && err.code === 'AUTHENTICATION_FAILED'
      );
    });
  });

  describe('10. Utilities & Key Helpers', () => {
    it('isEncryptedSecret returns true for valid compact encrypted strings and false for others', () => {
      const valid = encryptSecret('hello', { key: TEST_KEY_1 });
      assert.strictEqual(isEncryptedSecret(valid), true);
      assert.strictEqual(isEncryptedSecret('plain_text_value'), false);
      assert.strictEqual(isEncryptedSecret(''), false);
      assert.strictEqual(isEncryptedSecret(null), false);
      assert.strictEqual(isEncryptedSecret(123), false);
      assert.strictEqual(isEncryptedSecret('enc:v1:v1:corrupt'), false);
    });

    it('generateRandomEncryptionKey produces 64-hex char string that normalizes to 32 bytes', () => {
      const randomKey = generateRandomEncryptionKey();
      assert.strictEqual(typeof randomKey, 'string');
      assert.strictEqual(randomKey.length, 64);
      assert.ok(/^[0-9a-f]{64}$/.test(randomKey));

      const normalized = normalizeKey(randomKey);
      assert.strictEqual(normalized.length, 32);
    });

    it('resolves environment master key when configured or throws MISSING_KEY when unconfigured', () => {
      if (config.ENCRYPTION_MASTER_KEY) {
        const resolved = resolveKey('v1');
        assert.ok(Buffer.isBuffer(resolved));
        assert.strictEqual(resolved.length, 32);
      } else {
        assert.throws(
          () => resolveKey('v1'),
          (err) => {
            assert.ok(err instanceof CryptoError);
            assert.strictEqual(err.code, 'MISSING_KEY');
            return true;
          }
        );
      }
    });

    it('normalizeKey accepts 32-byte Buffer, 64-hex, and 44-base64 strings', () => {
      const buf = crypto.randomBytes(32);
      assert.ok(normalizeKey(buf).equals(buf));
      assert.ok(normalizeKey(buf.toString('hex')).equals(buf));
      assert.ok(normalizeKey(buf.toString('base64')).equals(buf));
    });

    it('normalizeKey explicitly rejects raw UTF-8 human passphrases to prevent weak keys', () => {
      const humanPassphrase = 'my_super_secret_password_32bytes!';
      assert.throws(
        () => normalizeKey(humanPassphrase),
        (err) => {
          assert.ok(err instanceof CryptoError);
          assert.strictEqual(err.code, 'INVALID_KEY');
          return true;
        }
      );
    });

    it('normalizeKey rejects invalid keys (wrong lengths, malformed encodings, null)', () => {
      assert.throws(
        () => normalizeKey('short_key'),
        (err) => err instanceof CryptoError && err.code === 'INVALID_KEY'
      );
      assert.throws(
        () => normalizeKey(null),
        (err) => err instanceof CryptoError && err.code === 'INVALID_KEY'
      );
      assert.throws(
        () => normalizeKey(Buffer.alloc(16)),
        (err) => err instanceof CryptoError && err.code === 'INVALID_KEY'
      );
      assert.throws(
        () => normalizeKey('0123456789abcdef0123456789abcdef0123456789abcdef0123456789zzzzzz'), // invalid hex
        (err) => err instanceof CryptoError && err.code === 'INVALID_KEY'
      );
    });

    it('serializeEncryptedPayload formats structured payload into valid compact string', () => {
      const payload = {
        version: 1,
        keyVersion: 'v1',
        iv: '1234567890123456',
        tag: '1234567890123456789012',
        ciphertext: 'abcdef',
      };
      const serialized = serializeEncryptedPayload(payload);
      assert.strictEqual(serialized, 'enc:v1:v1:1234567890123456:1234567890123456789012:abcdef');
    });

    it('resolveKey resolves direct key and key ring mappings', () => {
      const resolvedDirect = resolveKey('v1', { key: TEST_KEY_1 });
      assert.strictEqual(resolvedDirect.length, 32);

      const resolvedRing = resolveKey('v2', { keys: TEST_KEY_RING });
      assert.strictEqual(resolvedRing.length, 32);
    });
  });
});
