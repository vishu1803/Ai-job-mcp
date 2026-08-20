/**
 * @file AES-256-GCM Secret Encryption & Decryption Foundation
 *
 * Implements authenticated encryption at rest for sensitive credentials (OAuth tokens,
 * refresh tokens, API keys) following ADR-016 and docs/security.md.
 *
 * Features:
 * - AES-256-GCM authenticated encryption with 128-bit authentication tag
 * - Cryptographically random 96-bit (12-byte) IV per operation
 * - Additional Authenticated Data (AAD) binding format version and key version
 * - Key versioning support for seamless cryptographic key rotation
 * - Strict 64 KB plaintext limit to prevent abuse
 * - Zero plaintext/key leakage in logs or error messages
 * - Structured object and compact string serialization formats with Zod validation
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { CryptoError } from '../errors/index.js';
import { config } from '../config/env.js';

export { CryptoError };

export const CURRENT_ENCRYPTION_FORMAT_VERSION = 1;
export const DEFAULT_KEY_VERSION = 'v1';
export const ALGORITHM = 'aes-256-gcm';
export const IV_LENGTH_BYTES = 12; // 96 bits recommended for GCM
export const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
export const KEY_LENGTH_BYTES = 32; // 256 bits
export const MAX_PLAINTEXT_BYTES = 64 * 1024; // 64 KB maximum payload
export const COMPACT_PREFIX = 'enc:v1:';

/**
 * Zod schema for structured encrypted secret payloads.
 */
export const EncryptedPayloadSchema = z.object({
  version: z.literal(CURRENT_ENCRYPTION_FORMAT_VERSION),
  keyVersion: z.string().min(1).max(64),
  iv: z.string().min(16).max(32),
  tag: z.string().min(20).max(32),
  ciphertext: z.string(),
});

/**
 * @typedef {z.infer<typeof EncryptedPayloadSchema>} EncryptedPayload
 */

/**
 * Normalizes a raw encryption key into a 32-byte Buffer.
 * Supports 32-byte Buffers, 64-char Hex strings, 44-char Base64 strings, and 32-byte UTF-8 strings.
 *
 * @param {string | Buffer} keyInput Raw key input
 * @returns {Buffer} 32-byte cryptographic key Buffer
 * @throws {CryptoError} If key format or length is invalid
 */
export function normalizeKey(keyInput) {
  if (!keyInput) {
    throw new CryptoError('Master encryption key is required and cannot be empty', 'INVALID_KEY');
  }

  if (Buffer.isBuffer(keyInput)) {
    if (keyInput.length !== KEY_LENGTH_BYTES) {
      throw new CryptoError(
        `Master encryption key Buffer must be exactly ${KEY_LENGTH_BYTES} bytes, got ${keyInput.length}`,
        'INVALID_KEY'
      );
    }
    return keyInput;
  }

  if (typeof keyInput === 'string') {
    // 64-character hexadecimal string
    if (/^[0-9a-fA-F]{64}$/.test(keyInput)) {
      return Buffer.from(keyInput, 'hex');
    }

    // 32-byte UTF-8 string
    if (Buffer.byteLength(keyInput, 'utf8') === KEY_LENGTH_BYTES) {
      return Buffer.from(keyInput, 'utf8');
    }

    // Base64 string representing 32 bytes
    if (/^[A-Za-z0-9+/_-]{43,44}={0,2}$/.test(keyInput)) {
      const b64Buf = Buffer.from(keyInput, 'base64');
      if (b64Buf.length === KEY_LENGTH_BYTES) {
        return b64Buf;
      }
    }

    throw new CryptoError(
      `Master encryption key string must decode to exactly ${KEY_LENGTH_BYTES} bytes (e.g. 64 hex characters)`,
      'INVALID_KEY'
    );
  }

  throw new CryptoError('Master encryption key must be a string or Buffer', 'INVALID_KEY');
}

/**
 * Resolves the 32-byte cryptographic key Buffer for a given key version.
 *
 * @param {string} keyVersion Target key version identifier
 * @param {object} [options={}] Key resolution options
 * @param {string | Buffer} [options.key] Direct explicit key
 * @param {Record<string, string | Buffer>} [options.keys] Explicit key ring mapping
 * @returns {Buffer} 32-byte key Buffer
 * @throws {CryptoError} If key version cannot be resolved or is invalid
 */
export function resolveKey(keyVersion, options = {}) {
  if (options.key) {
    return normalizeKey(options.key);
  }

  if (options.keys && options.keys[keyVersion]) {
    return normalizeKey(options.keys[keyVersion]);
  }

  const activeVersion = config.ENCRYPTION_KEY_VERSION || DEFAULT_KEY_VERSION;
  if (keyVersion === activeVersion && config.ENCRYPTION_MASTER_KEY) {
    return normalizeKey(config.ENCRYPTION_MASTER_KEY);
  }

  throw new CryptoError(
    `Unknown encryption key version: "${keyVersion}". Configure a matching key to decrypt.`,
    'UNKNOWN_KEY_VERSION'
  );
}

/**
 * Computes Additional Authenticated Data (AAD) Buffer for GCM integrity binding.
 *
 * @param {number} version Format version
 * @param {string} keyVersion Key version
 * @returns {Buffer} AAD Buffer
 */
export function getAad(version, keyVersion) {
  return Buffer.from(`v${version}:${keyVersion}`, 'utf8');
}

/**
 * Serializes an EncryptedPayload into a compact string representation.
 * Format: enc:v1:<keyVersion>:<iv_base64url>:<tag_base64url>:<ciphertext_base64url>
 *
 * @param {EncryptedPayload} payload Structured payload
 * @returns {string} Compact serialized encrypted string
 */
export function serializeEncryptedPayload(payload) {
  const parsed = EncryptedPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new CryptoError(
      'Cannot serialize malformed encrypted payload object',
      'MALFORMED_PAYLOAD',
      parsed.error.issues
    );
  }

  return `${COMPACT_PREFIX}${parsed.data.keyVersion}:${parsed.data.iv}:${parsed.data.tag}:${parsed.data.ciphertext}`;
}

/**
 * Deserializes an encrypted secret from either a compact string or a structured object.
 *
 * @param {string | object} input Compact string or structured payload
 * @returns {EncryptedPayload} Validated structured payload
 * @throws {CryptoError} If format is invalid or malformed
 */
export function deserializeEncryptedPayload(input) {
  if (!input) {
    throw new CryptoError(
      'Encrypted payload input is required and cannot be empty',
      'MALFORMED_PAYLOAD'
    );
  }

  if (typeof input === 'object' && !Buffer.isBuffer(input)) {
    const parsed = EncryptedPayloadSchema.safeParse(input);
    if (!parsed.success) {
      throw new CryptoError(
        'Invalid encrypted payload object structure',
        'MALFORMED_PAYLOAD',
        parsed.error.issues
      );
    }
    return parsed.data;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();

    if (trimmed.startsWith(COMPACT_PREFIX)) {
      const parts = trimmed.split(':');
      // Expected parts: ['enc', 'v1', keyVersion, iv, tag, ciphertext]
      if (parts.length !== 6) {
        throw new CryptoError(
          'Malformed compact encrypted payload string: incorrect segment count',
          'MALFORMED_PAYLOAD'
        );
      }

      const payload = {
        version: CURRENT_ENCRYPTION_FORMAT_VERSION,
        keyVersion: parts[2],
        iv: parts[3],
        tag: parts[4],
        ciphertext: parts[5],
      };

      const parsed = EncryptedPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        throw new CryptoError(
          'Malformed compact encrypted payload string: segment validation failed',
          'MALFORMED_PAYLOAD',
          parsed.error.issues
        );
      }

      return parsed.data;
    }

    // Attempt JSON parsing if string starts with '{'
    if (trimmed.startsWith('{')) {
      try {
        const jsonParsed = JSON.parse(trimmed);
        const parsed = EncryptedPayloadSchema.safeParse(jsonParsed);
        if (parsed.success) {
          return parsed.data;
        }
      } catch {
        // Fall through to error below
      }
    }

    throw new CryptoError(
      'Invalid encrypted payload string: expected compact "enc:v1:..." format or JSON object',
      'MALFORMED_PAYLOAD'
    );
  }

  throw new CryptoError(
    'Encrypted payload must be a string or structured object',
    'MALFORMED_PAYLOAD'
  );
}

/**
 * Checks whether a given string is a valid compact encrypted secret representation.
 *
 * @param {any} value Input to check
 * @returns {boolean} True if string matches compact encrypted format
 */
export function isEncryptedSecret(value) {
  if (typeof value !== 'string' || !value.startsWith(COMPACT_PREFIX)) {
    return false;
  }
  try {
    deserializeEncryptedPayload(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts a plaintext secret string or Buffer using AES-256-GCM.
 *
 * @param {string | Buffer} plaintext Plaintext secret to encrypt
 * @param {object} [options={}] Encryption options
 * @param {string} [options.keyVersion] Key version identifier (defaults to configured active version)
 * @param {string | Buffer} [options.key] Explicit 32-byte key override
 * @param {Record<string, string | Buffer>} [options.keys] Key ring map
 * @param {Buffer} [options.iv] Explicit 12-byte IV (for testing/deterministic fixtures only)
 * @param {'string' | 'object'} [options.format='string'] Output format ('string' returns compact string, 'object' returns EncryptedPayload)
 * @returns {string | EncryptedPayload} Compact string (default) or structured EncryptedPayload object
 * @throws {CryptoError} On invalid inputs, keys, or sizing limits
 */
export function encryptSecret(plaintext, options = {}) {
  if (plaintext === null || plaintext === undefined) {
    throw new CryptoError(
      'Plaintext secret is required and cannot be null or undefined',
      'INVALID_PLAINTEXT'
    );
  }

  if (typeof plaintext !== 'string' && !Buffer.isBuffer(plaintext)) {
    throw new CryptoError('Plaintext secret must be a string or Buffer', 'INVALID_PLAINTEXT');
  }

  const byteLength = Buffer.isBuffer(plaintext)
    ? plaintext.length
    : Buffer.byteLength(plaintext, 'utf8');

  if (byteLength > MAX_PLAINTEXT_BYTES) {
    throw new CryptoError(
      `Plaintext size (${byteLength} bytes) exceeds maximum secret payload limit of ${MAX_PLAINTEXT_BYTES} bytes`,
      'PAYLOAD_TOO_LARGE'
    );
  }

  const keyVersion = options.keyVersion || config.ENCRYPTION_KEY_VERSION || DEFAULT_KEY_VERSION;
  const keyBuffer = resolveKey(keyVersion, options);

  let iv = options.iv;
  if (iv) {
    if (!Buffer.isBuffer(iv) || iv.length !== IV_LENGTH_BYTES) {
      throw new CryptoError(
        `Custom IV must be a Buffer of exactly ${IV_LENGTH_BYTES} bytes`,
        'INVALID_IV'
      );
    }
  } else {
    iv = crypto.randomBytes(IV_LENGTH_BYTES);
  }

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const aad = getAad(CURRENT_ENCRYPTION_FORMAT_VERSION, keyVersion);
  cipher.setAAD(aad);

  const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');

  const ciphertextBuffer = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);

  const tagBuffer = cipher.getAuthTag();

  /** @type {EncryptedPayload} */
  const payload = {
    version: CURRENT_ENCRYPTION_FORMAT_VERSION,
    keyVersion,
    iv: iv.toString('base64url'),
    tag: tagBuffer.toString('base64url'),
    ciphertext: ciphertextBuffer.toString('base64url'),
  };

  return options.format === 'object' ? payload : serializeEncryptedPayload(payload);
}

/**
 * Decrypts an AES-256-GCM encrypted secret back to plaintext.
 *
 * @param {string | object} encryptedInput Compact encrypted string or structured payload
 * @param {object} [options={}] Decryption options
 * @param {string | Buffer} [options.key] Explicit 32-byte key override
 * @param {Record<string, string | Buffer>} [options.keys] Key ring map
 * @param {'utf8' | 'buffer'} [options.encoding='utf8'] Output encoding ('utf8' string or raw Buffer)
 * @returns {string | Buffer} Decrypted plaintext secret
 * @throws {CryptoError} On authentication tag failure, tampering, wrong key, or malformed input
 */
export function decryptSecret(encryptedInput, options = {}) {
  const payload = deserializeEncryptedPayload(encryptedInput);

  if (payload.version !== CURRENT_ENCRYPTION_FORMAT_VERSION) {
    throw new CryptoError(
      `Unsupported encryption format version: ${payload.version}. Expected ${CURRENT_ENCRYPTION_FORMAT_VERSION}.`,
      'UNSUPPORTED_VERSION'
    );
  }

  const keyBuffer = resolveKey(payload.keyVersion, options);

  const ivBuffer = Buffer.from(payload.iv, 'base64url');
  if (ivBuffer.length !== IV_LENGTH_BYTES) {
    throw new CryptoError(
      `Invalid IV length in encrypted payload: expected ${IV_LENGTH_BYTES} bytes, got ${ivBuffer.length}`,
      'MALFORMED_PAYLOAD'
    );
  }

  const tagBuffer = Buffer.from(payload.tag, 'base64url');
  if (tagBuffer.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new CryptoError(
      `Invalid authentication tag length in encrypted payload: expected ${AUTH_TAG_LENGTH_BYTES} bytes, got ${tagBuffer.length}`,
      'MALFORMED_PAYLOAD'
    );
  }

  const ciphertextBuffer = Buffer.from(payload.ciphertext, 'base64url');

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
    decipher.setAuthTag(tagBuffer);
    const aad = getAad(payload.version, payload.keyVersion);
    decipher.setAAD(aad);

    const decryptedBuffer = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);

    return options.encoding === 'buffer' ? decryptedBuffer : decryptedBuffer.toString('utf8');
  } catch (err) {
    // Prevent sensitive internal OpenSSL crypto errors from escaping
    if (err instanceof CryptoError) {
      throw err;
    }
    throw new CryptoError(
      'Secret decryption failed: ciphertext, IV, authentication tag, or key is corrupted or tampered',
      'AUTHENTICATION_FAILED'
    );
  }
}

/**
 * Re-encrypts an existing encrypted secret under a new key or key version.
 *
 * @param {string | object} encryptedInput Existing encrypted payload
 * @param {object} rotationOptions Rotation options
 * @param {object} [rotationOptions.oldKeyOptions={}] Decryption options for the old key
 * @param {object} [rotationOptions.newKeyOptions={}] Encryption options for the new key
 * @returns {string | EncryptedPayload} Re-encrypted secret under the new key
 */
export function rotateSecret(encryptedInput, rotationOptions = {}) {
  const plaintext = decryptSecret(encryptedInput, rotationOptions.oldKeyOptions || {});
  return encryptSecret(plaintext, rotationOptions.newKeyOptions || {});
}

/**
 * Helper utility to generate a cryptographically random 32-byte hex key.
 *
 * @returns {string} 64-character hexadecimal key string
 */
export function generateRandomEncryptionKey() {
  return crypto.randomBytes(KEY_LENGTH_BYTES).toString('hex');
}
