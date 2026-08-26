/**
 * @file Unit Tests: Application Tracking Service (Phase 12 / P12-002)
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import { ZodError } from 'zod';
import { ApplicationTrackingService } from '../../src/services/application-tracking.service.js';
import { closeDatabase } from '../../src/db/index.js';
import { ValidationError, AuthorizationError } from '../../src/errors/index.js';

describe('Application Tracking Service Unit Tests (P12-002)', () => {
  const service = new ApplicationTrackingService();

  after(async () => {
    await closeDatabase();
  });

  describe('1. Context & RBAC Authorization Enforcement', () => {
    it('throws ValidationError when context is missing or invalid', async () => {
      await assert.rejects(
        () => service.getApplicationDetails(null, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
        ValidationError
      );
      await assert.rejects(
        () => service.getApplicationDetails({}, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
        ValidationError
      );
    });

    it('rejects mutating operations for READONLY role with AuthorizationError (403)', async () => {
      const readOnlyContext = {
        tenantId: 'dca1a69b-9e8c-47c8-9a55-01bbcd7a7063',
        userId: '2c569a22-3fd4-4f7a-8bc7-f229c4c9d06c',
        role: 'READONLY',
      };

      await assert.rejects(
        () =>
          service.createApplication(readOnlyContext, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', {
            companyName: 'Acme',
            jobTitle: 'Dev',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          service.updateApplicationStatus(
            readOnlyContext,
            '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            'APPLIED'
          ),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          service.addApplicationStage(readOnlyContext, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', {
            stageType: 'RECRUITER_SCREEN',
            title: 'Screen',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          service.updateStageOutcome(
            readOnlyContext,
            '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            'PASSED'
          ),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          service.attachTailoredDocument(readOnlyContext, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', {
            candidateId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            documentType: 'TAILORED_RESUME',
            title: 'Resume',
            content: {},
          }),
        AuthorizationError
      );

      await assert.rejects(
        () => service.deleteApplication(readOnlyContext, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'),
        AuthorizationError
      );
    });
  });

  describe('2. Input & State Machine Pre-Validation', () => {
    const validContext = {
      tenantId: 'dca1a69b-9e8c-47c8-9a55-01bbcd7a7063',
      userId: '2c569a22-3fd4-4f7a-8bc7-f229c4c9d06c',
      role: 'MEMBER',
    };

    it('requires candidateId on createApplication and listApplications', async () => {
      await assert.rejects(
        () =>
          service.createApplication(validContext, null, { companyName: 'Acme', jobTitle: 'Dev' }),
        (err) => err instanceof ValidationError && err.message.includes('candidateId is required')
      );
      await assert.rejects(
        () => service.listApplications(validContext, null),
        (err) => err instanceof ValidationError && err.message.includes('candidateId is required')
      );
    });

    it('requires applicationId on detail, status, stage, document, and delete methods', async () => {
      await assert.rejects(
        () => service.getApplicationDetails(validContext, null),
        ValidationError
      );
      await assert.rejects(
        () => service.updateApplicationStatus(validContext, null, 'APPLIED'),
        ValidationError
      );
      await assert.rejects(
        () =>
          service.addApplicationStage(validContext, null, {
            stageType: 'RECRUITER_SCREEN',
            title: 'Screen',
          }),
        ValidationError
      );
      await assert.rejects(
        () =>
          service.attachTailoredDocument(validContext, null, {
            candidateId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            documentType: 'TAILORED_RESUME',
            title: 'Resume',
            content: {},
          }),
        ValidationError
      );
      await assert.rejects(() => service.deleteApplication(validContext, null), ValidationError);
    });

    it('validates stage outcome options and throws ZodError on invalid enum', async () => {
      await assert.rejects(
        () =>
          service.updateStageOutcome(
            validContext,
            '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            'INVALID_OUTCOME'
          ),
        ZodError
      );
    });
  });
});
