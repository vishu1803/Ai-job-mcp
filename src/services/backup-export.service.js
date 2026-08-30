/**
 * @file Independent Logical Backup & Envelope Encryption Service (P14-005 / ARCH-055).
 *
 * Implements vendor-independent, encrypted logical backups combining:
 * 1. PostgreSQL logical schema + data exports (encrypted with AES-256-GCM)
 * 2. Raw encrypted document blobs (storage/documents/) preserved as ciphertext
 * 3. Tamper-evident SHA-256 cryptographic manifest & package checksums
 * 4. Zero credentials or keys embedded in output artifacts
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { config } from '../config/env.js';
import { metricsService } from '../monitoring/metrics.service.js';
import { SecurityError, ValidationError } from '../errors/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_VERSION = 'v1';

export class BackupExportService {
  /**
   * @param {object} [options={}]
   * @param {string|Buffer} [options.masterKey] External encryption key override
   * @param {string} [options.keyVersion='v1'] Key version identifier
   * @param {string} [options.documentStorageDir] Root document storage path
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [options.database=db]
   */
  constructor(options = {}) {
    this.keyVersion = options.keyVersion || KEY_VERSION;
    const rawKey =
      options.masterKey ||
      process.env.BACKUP_ENCRYPTION_KEY ||
      config.ENCRYPTION_MASTER_KEY ||
      'default-career-hub-dev-encryption-key-32b';
    this.key = crypto.createHash('sha256').update(rawKey).digest();
    this.documentStorageDir =
      options.documentStorageDir || path.resolve(process.cwd(), 'storage', 'documents');
    this.database = options.database || db;
  }

  /**
   * Encrypts a plaintext buffer using AES-256-GCM envelope format:
   * [12-byte IV][16-byte Auth Tag][Ciphertext]
   *
   * @param {Buffer} plaintextBuffer
   * @returns {{ encryptedBuffer: Buffer, iv: string, authTag: string }}
   */
  encryptBuffer(plaintextBuffer) {
    if (!Buffer.isBuffer(plaintextBuffer)) {
      throw new ValidationError('Plaintext must be provided as a Buffer');
    }
    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const envelope = Buffer.concat([iv, authTag, encrypted]);
    return {
      encryptedBuffer: envelope,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
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
   * Performs an in-engine logical export of all public application tables.
   * Returns deterministic JSON dump payload.
   *
   * @returns {Promise<{ dumpPayload: object, metadata: object }>}
   */
  async extractLogicalDatabaseDump() {
    // Ordered tables ensuring foreign key consistency on restore
    const tableOrder = [
      'tenants',
      'users',
      'sessions',
      'candidates',
      'candidate_identities',
      'candidate_claims',
      'skills',
      'candidate_skills',
      'resource_connections',
      'resources',
      'projects',
      'project_resources',
      'evidence_items',
      'job_applications',
      'application_stages',
      'tailored_documents',
      'resumes',
      'resume_sections',
      'action_approval_tickets',
      'oauth_clients',
      'oauth_authorization_codes',
      'oauth_tokens',
      'mcp_api_tokens',
      'audit_logs',
    ];

    const tablesData = {};
    const tableCounts = {};

    for (const tableName of tableOrder) {
      try {
        const queryRes = await this.database.execute(
          sql.raw(`SELECT * FROM "public"."${tableName}";`)
        );
        const rows = queryRes.rows || [];
        tablesData[tableName] = rows;
        tableCounts[tableName] = rows.length;
      } catch {
        // Handle optional or missing tables safely
        tablesData[tableName] = [];
        tableCounts[tableName] = 0;
      }
    }

    const dumpPayload = {
      format: 'career-hub-logical-json-v1',
      exportedAt: new Date().toISOString(),
      tableOrder,
      tables: tablesData,
    };

    const payloadJson = JSON.stringify(dumpPayload, null, 2);
    const dumpSha256 = crypto.createHash('sha256').update(payloadJson).digest('hex');

    const metadata = {
      tableCounts,
      totalTables: tableOrder.length,
      totalRows: Object.values(tableCounts).reduce((a, b) => a + b, 0),
      dumpSha256,
      payloadSizeBytes: Buffer.byteLength(payloadJson),
    };

    return { dumpPayload, metadata, payloadBuffer: Buffer.from(payloadJson, 'utf-8') };
  }

  /**
   * Generates a full independent backup package in the target destination directory.
   *
   * @param {string} destinationDir Root directory where backup package should be written
   * @param {object} [options={}]
   * @param {string} [options.backupId] Custom backup ID override
   * @returns {Promise<{ backupId: string, packagePath: string, manifest: object }>}
   */
  async exportBackupPackage(destinationDir, options = {}) {
    const backupId = options.backupId || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const packagePath = path.join(destinationDir, backupId);
    const dbDir = path.join(packagePath, 'database');
    const docsDir = path.join(packagePath, 'documents');

    try {
      await fs.mkdir(dbDir, { recursive: true });
      await fs.mkdir(docsDir, { recursive: true });

      // 1. Export & Encrypt Database Dump
      const { metadata: dbMeta, payloadBuffer } = await this.extractLogicalDatabaseDump();
      const { encryptedBuffer: encDbBuffer } = this.encryptBuffer(payloadBuffer);

      const dbDumpFile = path.join(dbDir, 'database.dump.enc');
      await fs.writeFile(dbDumpFile, encDbBuffer);

      const encDbHash = crypto.createHash('sha256').update(encDbBuffer).digest('hex');
      const dbManifest = {
        backupId,
        type: 'database',
        keyVersion: this.keyVersion,
        encryptionAlgorithm: ALGORITHM,
        unencryptedSizeBytes: payloadBuffer.length,
        encryptedSizeBytes: encDbBuffer.length,
        encryptedSha256: encDbHash,
        plaintextSha256: dbMeta.dumpSha256,
        totalTables: dbMeta.totalTables,
        totalRows: dbMeta.totalRows,
        tableCounts: dbMeta.tableCounts,
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(dbDir, 'manifest.json'),
        JSON.stringify(dbManifest, null, 2),
        'utf-8'
      );

      // 2. Snapshot Encrypted Document Blobs (storage/documents)
      let docCount = 0;
      let totalDocBytes = 0;
      const documentFiles = [];

      try {
        const tenantEntries = await fs.readdir(this.documentStorageDir, { withFileTypes: true });
        for (const tenant of tenantEntries) {
          if (tenant.isDirectory()) {
            const tenantSrc = path.join(this.documentStorageDir, tenant.name);
            const tenantDest = path.join(docsDir, tenant.name);
            await fs.mkdir(tenantDest, { recursive: true });

            const files = await fs.readdir(tenantSrc, { withFileTypes: true });
            for (const f of files) {
              if (f.isFile() && f.name.endsWith('.enc')) {
                const srcPath = path.join(tenantSrc, f.name);
                const destPath = path.join(tenantDest, f.name);
                const fileBuf = await fs.readFile(srcPath);
                await fs.writeFile(destPath, fileBuf);

                const fileHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
                docCount++;
                totalDocBytes += fileBuf.length;
                documentFiles.push({
                  tenantId: tenant.name,
                  storageKey: f.name.replace('.enc', ''),
                  fileName: f.name,
                  sizeBytes: fileBuf.length,
                  sha256: fileHash,
                });
              }
            }
          }
        }
      } catch {
        // Document directory may be empty or non-existent in pristine setups
      }

      const docsManifest = {
        backupId,
        type: 'documents',
        fileCount: docCount,
        totalBytes: totalDocBytes,
        files: documentFiles,
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(docsDir, 'manifest.json'),
        JSON.stringify(docsManifest, null, 2),
        'utf-8'
      );

      // 3. Compute Package SHA-256 Checksum Manifest
      const packageFiles = [
        { path: 'database/database.dump.enc', sha256: encDbHash, sizeBytes: encDbBuffer.length },
        {
          path: 'database/manifest.json',
          sha256: crypto
            .createHash('sha256')
            .update(JSON.stringify(dbManifest, null, 2))
            .digest('hex'),
          sizeBytes: Buffer.byteLength(JSON.stringify(dbManifest, null, 2)),
        },
        {
          path: 'documents/manifest.json',
          sha256: crypto
            .createHash('sha256')
            .update(JSON.stringify(docsManifest, null, 2))
            .digest('hex'),
          sizeBytes: Buffer.byteLength(JSON.stringify(docsManifest, null, 2)),
        },
        ...documentFiles.map((d) => ({
          path: `documents/${d.tenantId}/${d.fileName}`,
          sha256: d.sha256,
          sizeBytes: d.sizeBytes,
        })),
      ];

      const totalPackageBytes = packageFiles.reduce((acc, f) => acc + f.sizeBytes, 0);
      const masterManifestContent = {
        backupId,
        application: 'antigravity-career-hub',
        appVersion: '1.0.0',
        schemaVersion: '0008_material_peter_quill',
        keyVersion: this.keyVersion,
        encryptionAlgorithm: ALGORITHM,
        createdAt: new Date().toISOString(),
        totalPackageBytes,
        database: dbManifest,
        documents: docsManifest,
        files: packageFiles,
      };

      const masterManifestJson = JSON.stringify(masterManifestContent, null, 2);
      const packageChecksum = crypto.createHash('sha256').update(masterManifestJson).digest('hex');
      masterManifestContent.packageChecksum = packageChecksum;

      await fs.writeFile(
        path.join(packagePath, 'manifest.json'),
        JSON.stringify(masterManifestContent, null, 2),
        'utf-8'
      );

      // 4. Record Metrics
      metricsService.recordBackupSuccess({ sizeBytes: totalPackageBytes });
      await metricsService.collectDocumentMetrics(this.documentStorageDir);

      return {
        backupId,
        packagePath,
        manifest: masterManifestContent,
      };
    } catch (error) {
      metricsService.recordBackupFailure();
      // Clean up failed staging package directory
      try {
        await fs.rm(packagePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failure
      }
      throw error;
    }
  }
}
