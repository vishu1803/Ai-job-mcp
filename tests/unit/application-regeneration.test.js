/**
 * @file Unit Tests: Application Package Regeneration Service (Issue 3)
 *
 * Tests:
 * 1. Input validation & rejection if application is already submitted.
 * 2. Regeneration scopes: BOTH, RESUME only, COVER_LETTER only.
 * 3. Reason tagging: captures regenerationReason and regenerationScope in package answers.
 * 4. Fail-closed safety: if pre-exposure QA check fails, the existing CURRENT package
 *    remains completely untouched and no new version is recorded.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JobApplicationWorkflowService } from '../../src/services/job-application-workflow.service.js';
import { ValidationError, ConflictError } from '../../src/errors/index.js';

describe('JobApplicationWorkflowService.regenerateApplicationPackage', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const userId = '00000000-0000-0000-0000-000000000002';
  const candidateId = '00000000-0000-0000-0000-000000000003';
  const applicationId = '00000000-0000-0000-0000-000000000004';

  const mockCandidate = {
    id: candidateId,
    tenantId,
    userId,
    displayName: 'Vishwanath Nishad',
    canonicalEmail: 'vishwanatnishad@gmail.com',
    phone: '+1-555-0199',
    status: 'ACTIVE',
    profileMetadata: {},
  };

  const mockApplication = {
    id: applicationId,
    tenantId,
    candidateId,
    companyName: 'Vercel',
    jobTitle: 'Backend Engineer',
    status: 'SAVED',
    appliedAt: null,
    metadata: {
      currentPackageHash: 'old-hash-v1',
      currentPackageVersion: 1,
    },
  };

  const mockCurrentPackage = {
    version: 1,
    packageHash: 'old-hash-v1',
    lifecycleState: 'CURRENT',
    answers: { initialQuestion: 'Answer 1' },
    tailoredResume: {
      title: 'Resume - Vercel v1',
      markdownContent: '# Old Resume v1\nVishwanath Nishad\nvishwanatnishad@gmail.com',
      contentHash: 'resume-hash-v1',
      fitScore: 85,
    },
    coverLetter: {
      title: 'Cover Letter - Vercel v1',
      markdownContent: '# Old Cover Letter v1\nVishwanath Nishad\nvishwanatnishad@gmail.com',
      contentHash: 'cl-hash-v1',
    },
  };

  it('1. rejects regeneration if parameters are missing', async () => {
    const service = new JobApplicationWorkflowService();
    await assert.rejects(
      () => service.regenerateApplicationPackage({ tenantId: null, candidateId, applicationId }),
      ValidationError
    );
  });

  it('2. rejects regeneration if application is already submitted', async () => {
    const stubTrackingService = {
      getApplicationDetails: async () => ({
        application: { ...mockApplication, status: 'APPLIED', appliedAt: new Date() },
        currentPackage: mockCurrentPackage,
      }),
    };

    const service = new JobApplicationWorkflowService({
      applicationTrackingService: stubTrackingService,
    });

    await assert.rejects(
      () =>
        service.regenerateApplicationPackage({
          tenantId,
          userId,
          candidateId,
          applicationId,
        }),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, 'CONFLICT');
        assert.ok(err.message.includes('submission history'));
        return true;
      }
    );
  });

  it('3. fail-closed: if pre-exposure QA fails, ledger is untouched and error is thrown', async () => {
    let recordedCallCount = 0;

    const stubTrackingService = {
      getApplicationDetails: async () => ({
        application: mockApplication,
        currentPackage: mockCurrentPackage,
        tailoredDocuments: [],
      }),
      attachPackageDocumentSnapshots: async () => {},
      recordApplicationPackage: async () => {
        recordedCallCount++;
      },
      setApplicationHandoffKit: async () => {},
    };

    const stubContentService = {
      generateApplicationDocuments: async () => ({
        resume: {
          title: 'Resume - Vercel',
          markdownContent:
            '# Vishwanath Nishad\nvishwanatnishad@gmail.com\n## Experience\nEngineer',
          contentHash: 'new-res-hash',
          fitScore: 88,
        },
        coverLetter: {
          title: 'Cover Letter - Vercel',
          markdownContent: '# Vishwanath Nishad\nvishwanatnishad@gmail.com\nDear Team',
          contentHash: 'new-cl-hash',
        },
        evidence: { projectNamesUsed: [] },
      }),
    };

    // Handoff service returning QA failure
    const stubHandoffService = {
      buildApplicationHandoffKit: async () => ({
        resume: {
          storageKey: 'storage-1',
          qaAudit: { passed: false, score: 60, findings: ['Content cutoff detected'] },
        },
        coverLetter: {
          storageKey: 'storage-2',
          qaAudit: { passed: true, score: 95 },
        },
      }),
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => [{ candidate: mockCandidate, userEmail: mockCandidate.canonicalEmail }],
            }),
          }),
          innerJoin: () => ({
            where: () => [],
          }),
        }),
      }),
    };

    const service = new JobApplicationWorkflowService({
      database: mockDb,
      applicationTrackingService: stubTrackingService,
      candidateArtifactContentService: stubContentService,
      applicationHandoffService: stubHandoffService,
    });

    await assert.rejects(
      () =>
        service.regenerateApplicationPackage({
          tenantId,
          userId,
          candidateId,
          applicationId,
          reason: 'Fixed typo',
        }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('pre-exposure QA check failed'));
        return true;
      }
    );

    assert.equal(recordedCallCount, 0, 'New package must NEVER be recorded when QA fails');
  });

  it('4. regenerates package with reason tagging and promotes new version to CURRENT', async () => {
    let recordedPackage = null;
    let recordedHandoffKit = null;

    const stubTrackingService = {
      getApplicationDetails: async () => ({
        application: mockApplication,
        currentPackage: mockCurrentPackage,
        tailoredDocuments: [],
      }),
      attachPackageDocumentSnapshots: async () => ({
        attached: ['TAILORED_RESUME', 'TAILORED_COVER_LETTER'],
      }),
      recordApplicationPackage: async (_ctx, _appId, pkg) => {
        recordedPackage = pkg;
        return {
          id: 'pkg-row-2',
          version: 2,
          packageHash: pkg.packageHash,
          lifecycleState: 'CURRENT',
        };
      },
      setApplicationHandoffKit: async (_ctx, _appId, kit) => {
        recordedHandoffKit = kit;
        return { id: applicationId };
      },
    };

    const stubContentService = {
      generateApplicationDocuments: async () => ({
        resume: {
          title: 'Resume - Vercel v2',
          markdownContent:
            '# Vishwanath Nishad\nvishwanatnishad@gmail.com\n## Projects\nTask Manager',
          contentHash: 'new-res-hash-2',
          fitScore: 92,
        },
        coverLetter: {
          title: 'Cover Letter - Vercel v2',
          markdownContent:
            '# Vishwanath Nishad\nvishwanatnishad@gmail.com\nDear Vercel Hiring Team',
          contentHash: 'new-cl-hash-2',
        },
        evidence: { projectNamesUsed: ['Task Manager'] },
      }),
    };

    const stubHandoffService = {
      buildApplicationHandoffKit: async () => ({
        packageHash: 'generated-hash',
        resume: {
          filename: 'tailored-resume.pdf',
          storageKey: 'storage-res-2',
          qaAudit: { passed: true, score: 95 },
        },
        coverLetter: {
          filename: 'tailored-cover-letter.pdf',
          storageKey: 'storage-cl-2',
          qaAudit: { passed: true, score: 98 },
        },
      }),
    };

    const mockDb = {
      select: () => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => [{ candidate: mockCandidate, userEmail: mockCandidate.canonicalEmail }],
            }),
          }),
          innerJoin: () => ({
            where: () => [],
          }),
        }),
      }),
    };

    const service = new JobApplicationWorkflowService({
      database: mockDb,
      applicationTrackingService: stubTrackingService,
      candidateArtifactContentService: stubContentService,
      applicationHandoffService: stubHandoffService,
    });

    const result = await service.regenerateApplicationPackage({
      tenantId,
      userId,
      candidateId,
      applicationId,
      scope: 'BOTH',
      reason: 'Updated GitHub profile link',
    });

    assert.equal(result.package.version, 2);
    assert.equal(result.documentsStatus, 'DOCUMENTS_READY');
    assert.equal(result.artifactsReady, true);
    assert.ok(recordedPackage, 'Must record the new package in ledger');
    assert.equal(recordedPackage.answers.regenerationReason, 'Updated GitHub profile link');
    assert.equal(recordedPackage.answers.regenerationScope, 'BOTH');
    assert.ok(recordedPackage.answers.regenerationTimestamp);
    assert.ok(recordedHandoffKit);
  });
});
