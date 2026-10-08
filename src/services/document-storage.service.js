/**
 * @file Encrypted Document Blob Storage Service (P13.5-003 / ARCH-052).
 *
 * Implements authenticated AES-256-GCM encryption for raw binary source resumes
 * (PDF, DOCX, TXT) with unique per-document IVs and SHA-256 content hashing.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { SecurityError, ValidationError } from '../errors/index.js';
import { db } from '../db/index.js';
import { assertArtifactReceipt } from './evidence/artifact-policy.js';

const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';
// Server-only capability: a JSON boolean cannot bypass legacy artifact quarantine.
export const ORIGINAL_SOURCE_READ = Symbol('owned source-resume original');

export class DocumentStorageService {
  /**
   * @param {object} [options={}]
   * @param {string} [options.storageDir] Root storage directory
   * @param {string|Buffer} [options.masterKey] Master encryption key override
   * @param {object} [options.s3Provider] Optional S3-compatible / Cloudflare R2 object storage provider
   */
  constructor(options = {}) {
    this.database = options.database || db;
    this.storageDir = options.storageDir || path.resolve(process.cwd(), 'storage', 'documents');
    this.s3Provider = options.s3Provider || null;
    const rawKey = options.masterKey || config.ENCRYPTION_MASTER_KEY;
    if (!rawKey) {
      throw new SecurityError(
        'ENCRYPTION_MASTER_KEY is required and must be configured in environment',
        'MISSING_ENCRYPTION_KEY'
      );
    }
    this.key =
      Buffer.isBuffer(rawKey) && rawKey.length === 32
        ? rawKey
        : crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Sanitizes a tenant ID and storage key to prevent directory traversal attacks.
   *
   * @private
   * @param {string} tenantId
   * @param {string} storageKey
   * @returns {string} Safe absolute file path
   */
  _getSafeFilePath(tenantId, storageKey) {
    if (
      !tenantId ||
      typeof tenantId !== 'string' ||
      !storageKey ||
      typeof storageKey !== 'string'
    ) {
      throw new ValidationError('Tenant ID and storage key must be non-empty strings');
    }

    if (
      tenantId.includes('..') ||
      tenantId.includes('/') ||
      tenantId.includes('\\') ||
      storageKey.includes('..') ||
      storageKey.includes('/') ||
      storageKey.includes('\\')
    ) {
      throw new SecurityError(
        'Path traversal attempt detected in document storage',
        'TRAVERSAL_DETECTED'
      );
    }

    const sanitizedTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedKey = storageKey.replace(/[^a-zA-Z0-9_-]/g, '');

    if (!sanitizedTenantId || !sanitizedKey) {
      throw new SecurityError('Invalid or malicious document path coordinates', 'INVALID_PATH');
    }

    const tenantDir = path.join(this.storageDir, sanitizedTenantId);
    const targetFile = path.join(tenantDir, `${sanitizedKey}.enc`);

    // Guard against directory traversal
    const relative = path.relative(tenantDir, targetFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new SecurityError(
        'Path traversal attempt detected in document storage',
        'TRAVERSAL_DETECTED'
      );
    }

    return { tenantDir, targetFile };
  }

  /**
   * Encrypts and persists a binary source resume.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {Buffer} params.buffer Raw plaintext binary buffer
   * @param {string} [params.originalFileName] Original uploaded filename
   * @param {string} [params.mimeType] MIME type
   * @returns {Promise<{ storageKey: string, contentHash: string, fileSizeBytes: number }>}
   */
  async storeEncryptedDocument({
    tenantId,
    candidateId,
    buffer,
    originalFileName: _originalFileName,
    mimeType: _mimeType,
    generatedPackage = null,
  }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ValidationError('Document buffer must be a non-empty Buffer');
    }

    // 1. Calculate immutable SHA-256 hash of original plaintext
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageKey = crypto.randomUUID();
    if (generatedPackage) {
      await assertArtifactReceipt(
        this.database,
        { tenantId, candidateId },
        generatedPackage.receipt,
        generatedPackage.bodyHash
      );
    }
    // Authenticated, server-written envelope. Legacy unmarked bytes are quarantined;
    // dates, names, S3 metadata and client-supplied version labels are not authority.
    const plaintext = Buffer.from(
      JSON.stringify({
        format: 'career-document-envelope/v1',
        tenantId,
        candidateId,
        purpose: generatedPackage ? 'GENERATED_ARTIFACT' : 'CLAIMED_SOURCE_ORIGINAL',
        generatedPackage,
        contentHash,
        bytes: buffer.toString('base64'),
      })
    );

    // 2. Generate random 12-byte initialization vector
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    // 3. Encrypt payload and extract auth tag
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 4. Pack: IV (12B) + AuthTag (16B) + Ciphertext
    const payload = Buffer.concat([iv, authTag, ciphertext]);

    // 5. Persist: via S3 provider if configured, or atomic local file write
    if (this.s3Provider) {
      await this.s3Provider.putEncryptedObject({
        tenantId,
        key: storageKey,
        buffer: payload,
        metadata: {
          contentHash,
          originalLength: String(buffer.length),
        },
      });
    } else {
      const { tenantDir, targetFile } = this._getSafeFilePath(tenantId, storageKey);
      await fs.mkdir(tenantDir, { recursive: true });
      await fs.writeFile(targetFile, payload);
    }

    return {
      storageKey,
      contentHash,
      fileSizeBytes: buffer.length,
    };
  }

  /**
   * Retrieves and decrypts a binary source document for an authorized tenant.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.storageKey
   * @returns {Promise<Buffer>} Decrypted plaintext binary buffer
   */
  async getDecryptedDocument({
    tenantId,
    candidateId,
    storageKey,
    sourceOriginalAuthority,
    expectedPackageHash,
  }) {
    let encryptedPayload;

    if (this.s3Provider) {
      try {
        encryptedPayload = await this.s3Provider.getEncryptedObject({
          tenantId,
          key: storageKey,
        });
      } catch (err) {
        if (err.name === 'NotFoundError') {
          throw new ValidationError(
            `Document not found in storage: ${storageKey}`,
            'DOCUMENT_NOT_FOUND'
          );
        }
        throw err;
      }
    } else {
      const { targetFile } = this._getSafeFilePath(tenantId, storageKey);
      try {
        encryptedPayload = await fs.readFile(targetFile);
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new ValidationError(
            `Document not found in storage: ${storageKey}`,
            'DOCUMENT_NOT_FOUND'
          );
        }
        throw err;
      }
    }

    if (encryptedPayload.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
      throw new SecurityError('Corrupted encrypted document payload', 'CORRUPT_PAYLOAD');
    }

    // Unpack: IV (12B) + AuthTag (16B) + Ciphertext
    const iv = encryptedPayload.subarray(0, IV_LENGTH_BYTES);
    const authTag = encryptedPayload.subarray(
      IV_LENGTH_BYTES,
      IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
    );
    const ciphertext = encryptedPayload.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

    let plaintext;
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new SecurityError(
        'Document decryption failed: Authentication tag mismatch or corrupted ciphertext',
        'DECRYPTION_FAILED'
      );
    }
    let envelope;
    try {
      envelope = JSON.parse(plaintext.toString('utf8'));
    } catch {
      /* legacy bytes */
    }
    if (envelope?.format !== 'career-document-envelope/v1') {
      // Only the scoped source-resume repository may request historical originals.
      // No download/export/MCP/extension route accepts this option from a client.
      if (sourceOriginalAuthority === ORIGINAL_SOURCE_READ && !expectedPackageHash)
        return plaintext;
      throw new ValidationError(
        'Historical artifact quarantined; regenerate and review',
        'ARTIFACT_REVALIDATION_REQUIRED'
      );
    }
    if (envelope.tenantId !== tenantId || (candidateId && envelope.candidateId !== candidateId)) {
      throw new SecurityError('Document ownership mismatch', 'FORBIDDEN');
    }
    if (envelope.purpose === 'GENERATED_ARTIFACT') {
      if (
        !candidateId ||
        (expectedPackageHash && envelope.generatedPackage?.packageHash !== expectedPackageHash)
      ) {
        throw new SecurityError('Artifact package/candidate mismatch', 'FORBIDDEN');
      }
      await assertArtifactReceipt(
        this.database,
        { tenantId, candidateId: envelope.candidateId },
        envelope.generatedPackage?.receipt,
        envelope.generatedPackage?.bodyHash
      );
    } else if (envelope.purpose !== 'CLAIMED_SOURCE_ORIGINAL' || expectedPackageHash) {
      throw new ValidationError(
        'Unknown document trust provenance',
        'ARTIFACT_REVALIDATION_REQUIRED'
      );
    }
    const bytes = Buffer.from(envelope.bytes, 'base64');
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== envelope.contentHash) {
      throw new SecurityError('Document integrity mismatch', 'CORRUPT_PAYLOAD');
    }
    return bytes;
  }

  /**
   * Permanently deletes an encrypted source document from disk.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.storageKey
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteEncryptedDocument({ tenantId, storageKey }) {
    if (this.s3Provider) {
      return await this.s3Provider.deleteObject({ tenantId, key: storageKey });
    }

    const { targetFile } = this._getSafeFilePath(tenantId, storageKey);
    try {
      await fs.unlink(targetFile);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Checks if an encrypted document exists.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.storageKey
   * @returns {Promise<boolean>}
   */
  async hasEncryptedDocument({ tenantId, storageKey }) {
    if (this.s3Provider) {
      const head = await this.s3Provider.headObject({ tenantId, key: storageKey });
      return Boolean(head?.exists);
    }

    const { targetFile } = this._getSafeFilePath(tenantId, storageKey);
    try {
      await fs.access(targetFile);
      return true;
    } catch {
      return false;
    }
  }
}

export const documentStorageService = new DocumentStorageService();
