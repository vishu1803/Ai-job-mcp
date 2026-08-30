#!/usr/bin/env node
/**
 * @file Independent Logical Backup Export Script (P14-005).
 *
 * Exports an encrypted, vendor-independent logical backup package containing:
 * - AES-256-GCM encrypted PostgreSQL database dump
 * - AES-256-GCM encrypted document blobs from storage/documents/
 * - Tamper-evident cryptographic SHA-256 manifest
 *
 * Usage:
 *   node scripts/backup-export.js [--out <directory>]
 */

import path from 'node:path';
import { BackupExportService } from '../src/services/backup-export.service.js';
import { closeDatabase } from '../src/db/index.js';

async function main() {
  const args = process.argv.slice(2);
  let outputDir = path.resolve(process.cwd(), 'storage', 'backups');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outputDir = path.resolve(args[i + 1]);
      i++;
    }
  }

  console.log('================================================================');
  console.log('📦 CAREER HUB - INDEPENDENT LOGICAL BACKUP EXPORT');
  console.log('================================================================');
  console.log(`Destination: ${outputDir}`);
  console.log('Starting export and envelope encryption (AES-256-GCM)...');

  const startTime = Date.now();
  try {
    const exportService = new BackupExportService();
    const result = await exportService.exportBackupPackage(outputDir);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n✅ Backup Export Complete!');
    console.log(`Backup ID:         ${result.backupId}`);
    console.log(`Package Path:      ${result.packagePath}`);
    console.log(`Package Checksum:  ${result.manifest.packageChecksum}`);
    console.log(`Key Version:       ${result.manifest.keyVersion}`);
    console.log(`Total Package:     ${(result.manifest.totalPackageBytes / 1024).toFixed(2)} KB`);
    console.log(
      `Database Tables:   ${result.manifest.database.totalTables} tables (${result.manifest.database.totalRows} rows)`
    );
    console.log(
      `Document Files:    ${result.manifest.documents.fileCount} encrypted files (${(result.manifest.documents.totalBytes / 1024).toFixed(2)} KB)`
    );
    console.log(`Elapsed Time:      ${duration}s`);
    console.log('================================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Backup Export Failed:', error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
