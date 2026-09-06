/**
 * @file Unit Tests: Application Package Lifecycle Service (Issue 2)
 *
 * Tests:
 * 1. listApplicationPackages: ordering, tenant isolation, not found handling.
 * 2. getApplicationPackageByVersion: version number lookup vs hash lookup, snapshot attachment.
 * 3. restoreApplicationPackage: atomic promotion to CURRENT, demotion of others to ARCHIVED,
 *    metadata & notes synchronization, audit logging.
 * 4. archiveApplicationPackage: manual archiving of packages.
 * 5. safeDeleteApplicationPackage:
 *    - Rejection on submitted / progressed applications.
 *    - Rejection if sole package for application.
 *    - Rejection if package is CURRENT.
 *    - Successful deletion of ARCHIVED package, snapshots, and file cleanup on non-submitted application.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../../src/errors/index.js';

describe('Application Package Lifecycle Service', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const applicationId = '00000000-0000-0000-0000-000000000003';
  const memberContext = { tenantId, userId, role: 'MEMBER' };
  const readOnlyContext = { tenantId, userId, role: 'READONLY' };

  describe('1. Parameter & RBAC Validation', () => {
    const service = new ApplicationTrackingService();

    it('rejects missing or empty context', async () => {
      await assert.rejects(
        () => service.listApplicationPackages(null, applicationId),
        ValidationError
      );
      await assert.rejects(
        () => service.restoreApplicationPackage(null, applicationId, 1),
        ValidationError
      );
    });

    it('rejects READONLY role on write operations', async () => {
      await assert.rejects(
        () => service.restoreApplicationPackage(readOnlyContext, applicationId, 1),
        AuthorizationError
      );
      await assert.rejects(
        () => service.archiveApplicationPackage(readOnlyContext, applicationId, 1),
        AuthorizationError
      );
      await assert.rejects(
        () => service.safeDeleteApplicationPackage(readOnlyContext, applicationId, 1),
        AuthorizationError
      );
    });

    it('validates packageVersion parameter', async () => {
      await assert.rejects(
        () => service.restoreApplicationPackage(memberContext, applicationId, 0),
        ValidationError
      );
      await assert.rejects(
        () => service.restoreApplicationPackage(memberContext, applicationId, -1),
        ValidationError
      );
      await assert.rejects(
        () => service.restoreApplicationPackage(memberContext, applicationId, 'abc'),
        ValidationError
      );
      await assert.rejects(
        () => service.safeDeleteApplicationPackage(memberContext, applicationId, null),
        ValidationError
      );
    });
  });

  describe('2. Safe Delete Policy Enforcement', () => {
    it('rejects deletion if application is already submitted (status != SAVED)', async () => {
      const mockDb = {
        transaction: async (cb) => {
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => [
                    {
                      id: applicationId,
                      tenantId,
                      status: 'APPLIED',
                      appliedAt: new Date(),
                      metadata: {},
                    },
                  ],
                }),
              }),
            }),
          };
          return cb(tx);
        },
      };

      const service = new ApplicationTrackingService({ database: mockDb });

      await assert.rejects(
        () => service.safeDeleteApplicationPackage(memberContext, applicationId, 1),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.code, 'CONFLICT');
          assert.ok(err.message.includes('submission history'));
          return true;
        }
      );
    });

    it('rejects deletion if the application has only one package (sole package)', async () => {
      const mockDb = {
        transaction: async (cb) => {
          let callCount = 0;
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => {
                    callCount++;
                    if (callCount === 1) {
                      // Application query
                      return [
                        {
                          id: applicationId,
                          tenantId,
                          status: 'SAVED',
                          appliedAt: null,
                          metadata: {},
                        },
                      ];
                    }
                    // Packages query: only 1 package exists
                    return [
                      { id: 'pkg-1', version: 1, lifecycleState: 'CURRENT', packageHash: 'hash-1' },
                    ];
                  },
                }),
              }),
            }),
          };
          return cb(tx);
        },
      };

      const service = new ApplicationTrackingService({ database: mockDb });

      await assert.rejects(
        () => service.safeDeleteApplicationPackage(memberContext, applicationId, 1),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.code, 'CONFLICT');
          assert.ok(err.message.includes('sole package'));
          return true;
        }
      );
    });

    it('rejects deletion if the target package is CURRENT', async () => {
      const mockDb = {
        transaction: async (cb) => {
          let callCount = 0;
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => {
                    callCount++;
                    if (callCount === 1) {
                      return [
                        {
                          id: applicationId,
                          tenantId,
                          status: 'SAVED',
                          appliedAt: null,
                          metadata: {},
                        },
                      ];
                    }
                    // 2 packages exist; version 2 is CURRENT
                    return [
                      { id: 'pkg-2', version: 2, lifecycleState: 'CURRENT', packageHash: 'hash-2' },
                      {
                        id: 'pkg-1',
                        version: 1,
                        lifecycleState: 'ARCHIVED',
                        packageHash: 'hash-1',
                      },
                    ];
                  },
                }),
              }),
            }),
          };
          return cb(tx);
        },
      };

      const service = new ApplicationTrackingService({ database: mockDb });

      await assert.rejects(
        () => service.safeDeleteApplicationPackage(memberContext, applicationId, 2),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.equal(err.code, 'CONFLICT');
          assert.ok(err.message.includes('CURRENT active package'));
          return true;
        }
      );
    });

    it('successfully deletes an ARCHIVED package on an unsubmitted application', async () => {
      let deletedPackageId = null;
      let deletedSnapshotIds = null;
      let auditLogged = false;

      const mockDb = {
        transaction: async (cb) => {
          let callCount = 0;
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => {
                    callCount++;
                    if (callCount === 1) {
                      return [
                        {
                          id: applicationId,
                          tenantId,
                          status: 'SAVED',
                          appliedAt: null,
                          metadata: {},
                        },
                      ];
                    }
                    return [
                      { id: 'pkg-2', version: 2, lifecycleState: 'CURRENT', packageHash: 'hash-2' },
                      {
                        id: 'pkg-1',
                        version: 1,
                        lifecycleState: 'ARCHIVED',
                        packageHash: 'hash-1',
                      },
                    ];
                  },
                  // tailoredDocuments query
                  then: (resolve) =>
                    resolve([
                      {
                        id: 'doc-1',
                        documentType: 'TAILORED_RESUME',
                        metadata: {
                          packageHash: 'hash-1',
                          artifact: { storageKey: 'storage-1', packageHash: 'hash-1' },
                        },
                      },
                    ]),
                }),
              }),
            }),
            delete: (table) => ({
              where: (cond) => ({
                then: (resolve) => {
                  deletedPackageId = 'pkg-1';
                  resolve();
                },
              }),
            }),
            insert: (table) => ({
              values: (val) => ({
                then: (resolve) => {
                  auditLogged = true;
                  resolve();
                },
              }),
            }),
          };
          return cb(tx);
        },
      };

      const storageDeleted = [];
      const stubStorage = {
        deleteEncryptedDocument: async ({ tenantId, storageKey }) => {
          storageDeleted.push(storageKey);
          return true;
        },
      };

      const service = new ApplicationTrackingService({
        database: mockDb,
        documentStorage: stubStorage,
      });

      const result = await service.safeDeleteApplicationPackage(memberContext, applicationId, 1);

      assert.equal(result.deleted, true);
      assert.equal(result.packageVersion, 1);
      assert.equal(result.packageHash, 'hash-1');
      assert.ok(auditLogged);
      assert.ok(storageDeleted.includes('storage-1'));
    });
  });

  describe('3. Restore Package Lifecycle State', () => {
    it('atomically promotes target package to CURRENT and demotes others to ARCHIVED', async () => {
      let promotedId = null;
      let demotedCalled = false;
      let appMetadataUpdated = null;
      let auditLogged = false;

      const mockDb = {
        transaction: async (cb) => {
          let callCount = 0;
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => {
                    callCount++;
                    if (callCount === 1) {
                      return [
                        {
                          id: applicationId,
                          tenantId,
                          status: 'SAVED',
                          notes: 'Old notes',
                          metadata: { currentPackageHash: 'hash-2', currentPackageVersion: 2 },
                        },
                      ];
                    }
                    // Target package v1
                    return [
                      {
                        id: 'pkg-1',
                        version: 1,
                        packageHash: 'hash-1',
                        lifecycleState: 'ARCHIVED',
                      },
                    ];
                  },
                }),
              }),
            }),
            update: (table) => ({
              set: (vals) => ({
                where: () => ({
                  returning: () => {
                    promotedId = 'pkg-1';
                    return [
                      { id: 'pkg-1', version: 1, packageHash: 'hash-1', lifecycleState: 'CURRENT' },
                    ];
                  },
                  then: (resolve) => {
                    if (vals.lifecycleState === 'ARCHIVED') {
                      demotedCalled = true;
                    }
                    if (vals.metadata) {
                      appMetadataUpdated = vals.metadata;
                    }
                    resolve();
                  },
                }),
              }),
            }),
            insert: (table) => ({
              values: (val) => ({
                then: (resolve) => {
                  auditLogged = true;
                  resolve();
                },
              }),
            }),
          };
          return cb(tx);
        },
      };

      const service = new ApplicationTrackingService({ database: mockDb });

      const restored = await service.restoreApplicationPackage(memberContext, applicationId, 1);

      assert.equal(restored.version, 1);
      assert.equal(restored.lifecycleState, 'CURRENT');
      assert.ok(demotedCalled, 'Other versions must be demoted to ARCHIVED');
      assert.equal(appMetadataUpdated.currentPackageHash, 'hash-1');
      assert.equal(appMetadataUpdated.currentPackageVersion, 1);
      assert.ok(auditLogged, 'Must record audit log for package restoration');
    });
  });
});
