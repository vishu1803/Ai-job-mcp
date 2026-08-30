/**
 * @file Disaster Recovery Backup Restore & Verification Service (P14-005 / ARCH-055).
 *
 * Implements end-to-end verification, decryption, and restoration of
 * independent logical backup packages into target isolated databases and document stores.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { SecurityError, ValidationError } from '../errors/index.js';
import { DocumentStorageService } from './document-storage.service.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;

export class BackupRestoreService {
  /**
   * @param {object} [options={}]
   * @param {string|Buffer} [options.masterKey] External encryption key override
   * @param {string} [options.targetDocumentDir] Target directory to restore document blobs into
   */
  constructor(options = {}) {
    const rawKey =
      options.masterKey ||
      process.env.BACKUP_ENCRYPTION_KEY ||
      process.env.ENCRYPTION_MASTER_KEY ||
      'default-career-hub-dev-encryption-key-32b';
    this.key = crypto.createHash('sha256').update(rawKey).digest();
    this.targetDocumentDir =
      options.targetDocumentDir || path.resolve(process.cwd(), 'storage', 'documents');
  }

  /**
   * Decrypts an AES-256-GCM envelope buffer:
   * [12-byte IV][16-byte Auth Tag][Ciphertext]
   *
   * @param {Buffer} envelopeBuffer
   * @returns {Buffer} Plaintext buffer
   */
  decryptBuffer(envelopeBuffer) {
    if (
      !Buffer.isBuffer(envelopeBuffer) ||
      envelopeBuffer.length < IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
    ) {
      throw new SecurityError('Invalid encrypted envelope payload', 'INVALID_ENVELOPE');
    }
    const iv = envelopeBuffer.subarray(0, IV_LENGTH_BYTES);
    const authTag = envelopeBuffer.subarray(
      IV_LENGTH_BYTES,
      IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
    );
    const ciphertext = envelopeBuffer.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new SecurityError(
        'Decryption failed: authentication tag verification failure or wrong encryption key',
        'DECRYPTION_FAILED'
      );
    }
  }

  /**
   * Verifies the complete cryptographic integrity of a backup package.
   *
   * @param {string} packagePath Path to backup package root directory
   * @returns {Promise<object>} Parsed master manifest
   */
  async verifyPackageIntegrity(packagePath) {
    const manifestPath = path.join(packagePath, 'manifest.json');
    let manifestRaw;
    try {
      manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      throw new ValidationError(`Backup manifest not found at: ${manifestPath}`);
    }

    const manifest = JSON.parse(manifestRaw);
    if (!manifest.packageChecksum || !manifest.files || !Array.isArray(manifest.files)) {
      throw new SecurityError(
        'Malformed backup package manifest or missing checksum',
        'MALFORMED_MANIFEST'
      );
    }

    // Verify each file hash
    for (const fileMeta of manifest.files) {
      const filePath = path.join(packagePath, fileMeta.path);
      let fileBuf;
      try {
        fileBuf = await fs.readFile(filePath);
      } catch {
        throw new SecurityError(
          `Missing backup package file: ${fileMeta.path}`,
          'MISSING_BACKUP_FILE'
        );
      }

      const calculatedHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      if (calculatedHash !== fileMeta.sha256) {
        throw new SecurityError(
          `Checksum mismatch for package file ${fileMeta.path}. Expected: ${fileMeta.sha256}, Actual: ${calculatedHash}`,
          'CHECKSUM_MISMATCH'
        );
      }
    }

    return manifest;
  }

  /**
   * Restores database data from an encrypted package into a target database.
   *
   * @param {string} packagePath Path to backup package
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} targetDb Target Drizzle instance
   * @param {object} [options={}]
   * @param {boolean} [options.runMigrations=true] Whether to run Drizzle migrations first
   * @returns {Promise<{ restoredTables: number, restoredRows: number }>}
   */
  async restoreDatabase(packagePath, targetDb, options = {}) {
    await this.verifyPackageIntegrity(packagePath);

    if (options.runMigrations !== false) {
      await migrate(targetDb, { migrationsFolder: './drizzle' });
    }

    const encDumpPath = path.join(packagePath, 'database', 'database.dump.enc');
    const encBuffer = await fs.readFile(encDumpPath);
    const decryptedBuffer = this.decryptBuffer(encBuffer);

    const dumpJson = JSON.parse(decryptedBuffer.toString('utf-8'));
    if (!dumpJson.tables || !dumpJson.tableOrder) {
      throw new ValidationError('Invalid database dump structure in decrypted payload');
    }

    let totalRestoredRows = 0;
    let totalRestoredTables = 0;

    try {
      if (targetDb.session?.client?.query) {
        await targetDb.session.client.query("SET session_replication_role = 'replica';");
      } else {
        await targetDb.execute(sql.raw("SET session_replication_role = 'replica';"));
      }
    } catch {
      // Ignore if database role does not have permission to modify session_replication_role
    }

    try {
      for (const tableName of dumpJson.tableOrder) {
        const rows = dumpJson.tables[tableName] || [];
        if (rows.length === 0) continue;

        totalRestoredTables++;
        const BATCH_SIZE = 50;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          if (batch.length === 0) continue;

          const columns = Object.keys(batch[0]);
          const colList = columns.map((c) => `"${c}"`).join(', ');

          const valuePlaceholders = [];
          const flatValues = [];

          batch.forEach((row, rowIdx) => {
            const rowPlaceholders = [];
            columns.forEach((col, colIdx) => {
              const paramIndex = rowIdx * columns.length + colIdx + 1;
              rowPlaceholders.push(`$${paramIndex}`);
              const val = row[col];
              if (
                val !== null &&
                typeof val === 'object' &&
                !(val instanceof Date) &&
                !Buffer.isBuffer(val)
              ) {
                flatValues.push(JSON.stringify(val));
              } else {
                flatValues.push(val);
              }
            });
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
          });

          const insertSql = `INSERT INTO "public"."${tableName}" (${colList}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING;`;

          if (targetDb.session?.client?.query) {
            await targetDb.session.client.query(insertSql, flatValues);
          } else {
            await targetDb.execute(sql.raw(insertSql), flatValues);
          }

          totalRestoredRows += batch.length;
        }
      }
    } finally {
      try {
        if (targetDb.session?.client?.query) {
          await targetDb.session.client.query("SET session_replication_role = 'origin';");
        } else {
          await targetDb.execute(sql.raw("SET session_replication_role = 'origin';"));
        }
      } catch {
        // Ignore reset failure
      }
    }

    return {
      restoredTables: totalRestoredTables,
      restoredRows: totalRestoredRows,
    };
  }

  /**
   * Restores document blobs from backup package into the target document directory.
   *
   * @param {string} packagePath Path to backup package
   * @param {string} [targetDir] Destination directory override
   * @returns {Promise<{ restoredFiles: number, verifiedHashes: boolean }>}
   */
  async restoreDocuments(packagePath, targetDir) {
    const destination = targetDir || this.targetDocumentDir;
    const docsManifestPath = path.join(packagePath, 'documents', 'manifest.json');
    const docsManifest = JSON.parse(await fs.readFile(docsManifestPath, 'utf-8'));

    let restoredCount = 0;
    for (const fileMeta of docsManifest.files) {
      const srcFile = path.join(packagePath, 'documents', fileMeta.tenantId, fileMeta.fileName);
      const tenantDestDir = path.join(destination, fileMeta.tenantId);
      const destFile = path.join(tenantDestDir, fileMeta.fileName);

      await fs.mkdir(tenantDestDir, { recursive: true });
      const fileData = await fs.readFile(srcFile);
      await fs.writeFile(destFile, fileData);

      const checkHash = crypto.createHash('sha256').update(fileData).digest('hex');
      if (checkHash !== fileMeta.sha256) {
        throw new SecurityError(
          `Document hash verification failed during restore for ${fileMeta.fileName}`,
          'CORRUPT_DOCUMENT_RESTORE'
        );
      }
      restoredCount++;
    }

    return {
      restoredFiles: restoredCount,
      verifiedHashes: true,
    };
  }

  /**
   * Tests cryptographic decryptability of restored document blobs using DocumentStorageService.
   *
   * @param {string} tenantId Tenant ID
   * @param {string} storageKey Storage key UUID
   * @param {string} [storageDir] Storage directory
   * @returns {Promise<{ plaintext: Buffer, contentHash: string }>}
   */
  async verifyDocumentDecryptability(tenantId, storageKey, storageDir) {
    const docService = new DocumentStorageService({
      storageDir: storageDir || this.targetDocumentDir,
      masterKey: this.key,
    });
    const result = await docService.getDecryptedDocument({ tenantId, storageKey });
    return result;
  }
}
