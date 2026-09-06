/**
 * @file Unit Tests: Safe Application-Level Deletion Service and UI Contract
 *
 * Tests:
 * 1. safeDeleteApplication authorization & validation (tenantId, candidateId).
 * 2. Rejection of submitted applications (status=APPLIED, appliedAt !== null, externalSubmissionState=SUBMITTED).
 * 3. Cascade deletion of child records (packages, tailored documents, stages, application).
 * 4. Reference-counting protection for encrypted storage artifacts.
 * 5. Audit event emission (job_application.deleted).
 * 6. UI Contract: renderApplicationsPage correctly shows Delete button ONLY for unsubmitted applications.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { renderApplicationsPage } from '../../src/views/applications.page.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../../src/errors/index.js';

describe('Safe Application Deletion Service & UI Contract', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const candidateId = '00000000-0000-0000-0000-000000000003';
  const otherCandidateId = '00000000-0000-0000-0000-000000000099';
  const applicationId = '00000000-0000-0000-0000-000000000004';

  const memberContext = { tenantId, userId, candidateId, role: 'MEMBER' };
  const readOnlyContext = { tenantId, userId, candidateId, role: 'READONLY' };

  describe('1. Parameter & RBAC Validation', () => {
    const service = new ApplicationTrackingService();

    it('rejects missing or empty context', async () => {
      await assert.rejects(
        () => service.safeDeleteApplication(null, applicationId),
        ValidationError
      );
      await assert.rejects(() => service.safeDeleteApplication({}, applicationId), ValidationError);
    });

    it('rejects READONLY role on deletion', async () => {
      await assert.rejects(
        () => service.safeDeleteApplication(readOnlyContext, applicationId),
        AuthorizationError
      );
    });

    it('rejects missing applicationId', async () => {
      await assert.rejects(
        () => service.safeDeleteApplication(memberContext, null),
        ValidationError
      );
    });
  });

  describe('2. Candidate Authorization & Existence Checks', () => {
    it('rejects if application is not found in tenant', async () => {
      const mockDb = {
        transaction: async (cb) => {
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => [], // Not found
                }),
              }),
            }),
          };
          return cb(tx);
        },
      };

      const service = new ApplicationTrackingService({ database: mockDb });

      await assert.rejects(
        () => service.safeDeleteApplication(memberContext, applicationId),
        (err) => {
          assert.ok(err instanceof NotFoundError);
          assert.ok(err.message.includes('not found'));
          return true;
        }
      );
    });

    it('rejects if candidateId does not match application owner', async () => {
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
                      candidateId: otherCandidateId, // Different candidate
                      status: 'SAVED',
                      appliedAt: null,
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
        () => service.safeDeleteApplication(memberContext, applicationId),
        (err) => {
          assert.ok(err instanceof AuthorizationError);
          assert.ok(err.message.includes('Candidate not authorized'));
          return true;
        }
      );
    });
  });

  describe('3. Submission Safety Gate (Immutable History Protection)', () => {
    it('blocks deletion when status is APPLIED', async () => {
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
                      candidateId,
                      status: 'APPLIED',
                      appliedAt: null,
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
        () => service.safeDeleteApplication(memberContext, applicationId),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.ok(err.message.includes('Submitted applications cannot be deleted'));
          return true;
        }
      );
    });

    it('blocks deletion when appliedAt is not null even if status is SAVED', async () => {
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
                      candidateId,
                      status: 'SAVED',
                      appliedAt: '2026-09-05T11:17:31Z',
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
        () => service.safeDeleteApplication(memberContext, applicationId),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.ok(err.message.includes('submission history'));
          return true;
        }
      );
    });

    it('blocks deletion when metadata.externalSubmissionState is SUBMITTED', async () => {
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
                      candidateId,
                      status: 'SAVED',
                      appliedAt: null,
                      metadata: { externalSubmissionState: 'SUBMITTED' },
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
        () => service.safeDeleteApplication(memberContext, applicationId),
        (err) => {
          assert.ok(err instanceof ConflictError);
          assert.ok(err.message.includes('submission history'));
          return true;
        }
      );
    });
  });

  describe('4. Successful Application Deletion & Reference Counting', () => {
    it('deletes application and cascades children, protecting shared storage keys', async () => {
      const deletedTables = [];
      const auditEvents = [];
      const physicallyDeletedStorageKeys = [];

      const mockDb = {
        transaction: async (cb) => {
          let selectCall = 0;
          const tx = {
            select: (_fields) => ({
              from: (_table) => ({
                where: () => {
                  selectCall++;
                  if (selectCall === 1) {
                    // Application lookup
                    return {
                      for: () => [
                        {
                          id: applicationId,
                          tenantId,
                          candidateId,
                          status: 'ARCHIVED',
                          appliedAt: null,
                          companyName: 'Vercel',
                          jobTitle: 'Backend Engineer',
                          metadata: {
                            jobId: 'job-100',
                            handoffKit: {
                              resume: { storageKey: 'unshared-resume-key' },
                              coverLetter: { storageKey: 'shared-cover-letter-key' },
                            },
                          },
                        },
                      ],
                    };
                  }
                  if (selectCall === 2) {
                    // appPackages
                    return [
                      { id: 'pkg-1', applicationId, version: 1 },
                      { id: 'pkg-2', applicationId, version: 2 },
                    ];
                  }
                  if (selectCall === 3) {
                    // appDocs
                    return [
                      {
                        id: 'doc-1',
                        applicationId,
                        storageKey: 'unshared-resume-key',
                        metadata: { artifact: { storageKey: 'unshared-resume-key' } },
                      },
                    ];
                  }
                  if (selectCall === 4) {
                    // stageCountRes
                    return [{ total: 2 }];
                  }
                  if (selectCall === 5) {
                    // allOtherDocs
                    return [
                      {
                        metadata: { artifact: { storageKey: 'other-doc-key' } },
                      },
                    ];
                  }
                  if (selectCall === 6) {
                    // allOtherApps (holds shared-cover-letter-key)
                    return [
                      {
                        id: 'other-app-999',
                        metadata: {
                          handoffKit: {
                            coverLetter: { storageKey: 'shared-cover-letter-key' },
                          },
                        },
                      },
                    ];
                  }
                  if (selectCall === 7) {
                    // allOtherPackages
                    return [];
                  }
                  return [];
                },
              }),
            }),
            delete: (table) => ({
              where: () => {
                deletedTables.push(table);
                return Promise.resolve();
              },
            }),
            insert: (table) => ({
              values: (val) => {
                auditEvents.push({ table, val });
                return Promise.resolve();
              },
            }),
          };
          return cb(tx);
        },
      };

      const mockDocStorage = {
        deleteEncryptedDocument: async ({ tenantId: _t, storageKey }) => {
          physicallyDeletedStorageKeys.push(storageKey);
        },
      };

      const service = new ApplicationTrackingService({
        database: mockDb,
        documentStorage: mockDocStorage,
      });

      const result = await service.safeDeleteApplication(memberContext, applicationId);

      assert.strictEqual(result.deleted, true);
      assert.strictEqual(result.applicationId, applicationId);

      // Verify unshared key was scheduled and deleted physically
      assert.deepStrictEqual(result.storageKeys, ['unshared-resume-key']);
      assert.deepStrictEqual(physicallyDeletedStorageKeys, ['unshared-resume-key']);

      // Verify shared key was protected
      assert.ok(
        !physicallyDeletedStorageKeys.includes('shared-cover-letter-key'),
        'Shared cover letter key must not be physically deleted'
      );

      // Verify cascading table deletions occurred (4 tables: packages, tailoredDocs, stages, application)
      assert.strictEqual(deletedTables.length, 4);

      // Verify audit event
      assert.strictEqual(auditEvents.length, 1);
      assert.strictEqual(auditEvents[0].val.eventType, 'job_application.deleted');
      assert.strictEqual(auditEvents[0].val.resourceId, applicationId);
      assert.strictEqual(auditEvents[0].val.details.deletedPackagesCount, 2);
      assert.strictEqual(auditEvents[0].val.details.deletedArtifactsCount, 1);
    });
  });

  describe('5. Career Pipeline UI Delete Action Contract', () => {
    const mockUser = { id: userId, email: 'vishu@example.com' };

    it('renders Delete button for unsubmitted SAVED or ARCHIVED applications', () => {
      const applications = [
        {
          id: 'app-unsub-saved',
          companyName: 'Acme',
          jobTitle: 'Backend Dev',
          status: 'SAVED',
          appliedAt: null,
          metadata: { externalSubmissionState: 'HANDOFF_READY' },
        },
        {
          id: 'app-unsub-archived',
          companyName: 'Beta Corp',
          jobTitle: 'Infra Engineer',
          status: 'ARCHIVED',
          appliedAt: null,
          metadata: {},
        },
      ];

      const html = renderApplicationsPage({
        user: mockUser,
        applications,
      });

      assert.ok(
        html.includes('/applications/app-unsub-saved/delete'),
        'Must render delete form for unsubmitted SAVED app'
      );
      assert.ok(
        html.includes('/applications/app-unsub-archived/delete'),
        'Must render delete form for unsubmitted ARCHIVED app'
      );
      assert.ok(
        html.includes(
          'Delete this Acme — Backend Dev application (app-unsu) and its Handoff Kit artifacts?'
        ),
        'Must include correct confirm dialogue'
      );
    });

    it('does NOT render Delete button for submitted applications', () => {
      const applications = [
        {
          id: 'app-submitted-applied',
          companyName: 'Vercel',
          jobTitle: 'Software Engineer',
          status: 'APPLIED',
          appliedAt: '2026-09-05T11:17:31Z',
          metadata: { externalSubmissionState: 'SUBMITTED' },
        },
        {
          id: 'app-submitted-status-saved',
          companyName: 'Vercel',
          jobTitle: 'Software Engineer',
          status: 'SAVED', // Status says SAVED, but appliedAt timestamp is present
          appliedAt: '2026-09-05T11:17:31Z',
          metadata: {},
        },
        {
          id: 'app-submitted-meta',
          companyName: 'Stripe',
          jobTitle: 'Backend Engineer',
          status: 'SAVED',
          appliedAt: null,
          metadata: { externalSubmissionState: 'SUBMITTED' },
        },
        {
          id: 'app-interviewing',
          companyName: 'Linear',
          jobTitle: 'Fullstack Dev',
          status: 'INTERVIEWING',
          appliedAt: null,
          metadata: {},
        },
      ];

      const html = renderApplicationsPage({
        user: mockUser,
        applications,
      });

      assert.ok(
        !html.includes('/applications/app-submitted-applied/delete'),
        'Must NOT render delete form for APPLIED app'
      );
      assert.ok(
        !html.includes('/applications/app-submitted-status-saved/delete'),
        'Must NOT render delete form for app with appliedAt timestamp'
      );
      assert.ok(
        !html.includes('/applications/app-submitted-meta/delete'),
        'Must NOT render delete form for app with externalSubmissionState SUBMITTED'
      );
      assert.ok(
        !html.includes('/applications/app-interviewing/delete'),
        'Must NOT render delete form for INTERVIEWING app'
      );
    });
  });
});
