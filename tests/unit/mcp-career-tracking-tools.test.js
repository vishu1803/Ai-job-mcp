/**
 * @file Unit Tests: MCP Career Tracking Tools (Phase 12 / P12-003)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ZodError } from 'zod';
import {
  CAREER_TRACKING_TOOL_DEFINITIONS,
  TrackJobApplicationInputSchema,
  UpdateApplicationStatusInputSchema,
  AddApplicationStageInputSchema,
  UpdateApplicationStageOutcomeInputSchema,
  AttachApplicationDocumentInputSchema,
  GetJobApplicationInputSchema,
  ListActiveApplicationsInputSchema,
} from '../../src/domain/mcp/career-tracking-tools.schemas.js';
import {
  handleTrackJobApplication,
  handleUpdateApplicationStatus,
  handleAddApplicationStage,
  handleUpdateApplicationStageOutcome,
  handleAttachApplicationDocument,
  handleGetJobApplication,
  handleListActiveApplications,
} from '../../src/mcp/tools/career-tracking-tools.js';
import { AuthorizationError, AuthenticationError } from '../../src/errors/index.js';

describe('MCP Career Tracking Tools Unit Tests (P12-003)', () => {
  const memberContext = {
    tenantId: 'dca1a69b-9e8c-47c8-9a55-01bbcd7a7063',
    userId: '2c569a22-3fd4-4f7a-8bc7-f229c4c9d06c',
    role: 'MEMBER',
    scopes: ['career:read', 'career:write'],
    tokenScopes: ['career:read', 'career:write'],
  };

  const readOnlyContext = {
    tenantId: 'dca1a69b-9e8c-47c8-9a55-01bbcd7a7063',
    userId: '2c569a22-3fd4-4f7a-8bc7-f229c4c9d06c',
    role: 'READONLY',
    scopes: ['career:read'],
    tokenScopes: ['career:read'],
  };

  describe('1. Schema Validation & Constraints', () => {
    it('TrackJobApplicationInputSchema validates valid input and rejects missing required fields', () => {
      const valid = TrackJobApplicationInputSchema.parse({
        companyName: 'Anthropic',
        jobTitle: 'Research Engineer',
        source: 'COMPANY_CAREERS',
        workplaceType: 'HYBRID',
        employmentType: 'FULL_TIME',
        status: 'SAVED',
      });
      assert.strictEqual(valid.companyName, 'Anthropic');
      assert.strictEqual(valid.status, 'SAVED');

      assert.throws(() => TrackJobApplicationInputSchema.parse({}), ZodError);
      assert.throws(() => TrackJobApplicationInputSchema.parse({ companyName: '' }), ZodError);
    });

    it('UpdateApplicationStatusInputSchema validates valid status and rejects illegal strings', () => {
      const valid = UpdateApplicationStatusInputSchema.parse({
        applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        status: 'INTERVIEWING',
        reason: 'Recruiter reached out',
      });
      assert.strictEqual(valid.status, 'INTERVIEWING');

      assert.throws(
        () =>
          UpdateApplicationStatusInputSchema.parse({
            applicationId: 'not-a-uuid',
            status: 'INTERVIEWING',
          }),
        ZodError
      );

      assert.throws(
        () =>
          UpdateApplicationStatusInputSchema.parse({
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            status: 'UNKNOWN_STATUS',
          }),
        ZodError
      );
    });

    it('AddApplicationStageInputSchema validates stageType and rejects unknown keys', () => {
      const valid = AddApplicationStageInputSchema.parse({
        applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        stageType: 'TECHNICAL_ASSESSMENT',
        title: 'System Design Deep Dive',
      });
      assert.strictEqual(valid.stageType, 'TECHNICAL_ASSESSMENT');

      // orderIndex should not be accepted from client (rejected by strict)
      assert.throws(
        () =>
          AddApplicationStageInputSchema.parse({
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            stageType: 'TECHNICAL_ASSESSMENT',
            title: 'System Design',
            orderIndex: 99,
          }),
        ZodError
      );
    });

    it('UpdateApplicationStageOutcomeInputSchema validates valid outcomes and bounds feedback', () => {
      const valid = UpdateApplicationStageOutcomeInputSchema.parse({
        stageId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        outcome: 'PASSED',
        feedback: 'Great performance.',
      });
      assert.strictEqual(valid.outcome, 'PASSED');

      assert.throws(
        () =>
          UpdateApplicationStageOutcomeInputSchema.parse({
            stageId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            outcome: 'INVALID_OUTCOME',
          }),
        ZodError
      );
    });

    it('AttachApplicationDocumentInputSchema rejects client-supplied contentHash or version', () => {
      const valid = AttachApplicationDocumentInputSchema.parse({
        applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        documentType: 'TAILORED_RESUME',
        title: 'Tailored Resume',
        content: { summary: 'Experienced engineer' },
      });
      assert.strictEqual(valid.documentType, 'TAILORED_RESUME');

      assert.throws(
        () =>
          AttachApplicationDocumentInputSchema.parse({
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            documentType: 'TAILORED_RESUME',
            title: 'Tailored Resume',
            content: {},
            contentHash: 'client-supplied-fake-hash',
          }),
        ZodError
      );
    });

    it('GetJobApplicationInputSchema and ListActiveApplicationsInputSchema enforce bounds', () => {
      const getValid = GetJobApplicationInputSchema.parse({
        applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        includeFullJd: true,
      });
      assert.strictEqual(getValid.includeFullJd, true);

      const listValid = ListActiveApplicationsInputSchema.parse({
        limit: 25,
        offset: 10,
        companyName: 'OpenAI',
      });
      assert.strictEqual(listValid.limit, 25);
      assert.strictEqual(listValid.offset, 10);

      // Max limit is 50
      assert.throws(() => ListActiveApplicationsInputSchema.parse({ limit: 100 }), ZodError);
    });
  });

  describe('2. Tool Definitions & Advisory Annotations Registry', () => {
    it('verifies 7 tools exist with approved annotations and RBAC rules', () => {
      const tools = Object.keys(CAREER_TRACKING_TOOL_DEFINITIONS);
      assert.strictEqual(tools.length, 7);

      assert.ok(CAREER_TRACKING_TOOL_DEFINITIONS.track_job_application);
      assert.strictEqual(
        CAREER_TRACKING_TOOL_DEFINITIONS.track_job_application.annotations.readOnlyHint,
        false
      );
      assert.deepStrictEqual(
        CAREER_TRACKING_TOOL_DEFINITIONS.track_job_application.requiredScopes,
        ['career:write']
      );

      assert.ok(CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application);
      assert.strictEqual(
        CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application.annotations.readOnlyHint,
        true
      );
      assert.strictEqual(
        CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application.annotations.idempotentHint,
        true
      );
      assert.deepStrictEqual(CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application.requiredScopes, [
        'career:read',
      ]);

      assert.ok(CAREER_TRACKING_TOOL_DEFINITIONS.list_active_applications);
      assert.strictEqual(
        CAREER_TRACKING_TOOL_DEFINITIONS.list_active_applications.annotations.readOnlyHint,
        true
      );
    });
  });

  describe('3. RBAC & Scope Enforcement on Tool Handlers', () => {
    it('rejects mutating tools for READONLY role with AuthorizationError (403)', async () => {
      await assert.rejects(
        () =>
          handleTrackJobApplication(readOnlyContext, {
            companyName: 'Google',
            jobTitle: 'L6 SRE',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          handleUpdateApplicationStatus(readOnlyContext, {
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            status: 'APPLIED',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          handleAddApplicationStage(readOnlyContext, {
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            stageType: 'RECRUITER_SCREEN',
            title: 'HR Call',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          handleUpdateApplicationStageOutcome(readOnlyContext, {
            stageId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            outcome: 'PASSED',
          }),
        AuthorizationError
      );

      await assert.rejects(
        () =>
          handleAttachApplicationDocument(readOnlyContext, {
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            documentType: 'TAILORED_RESUME',
            title: 'Resume',
            content: {},
          }),
        AuthorizationError
      );
    });

    it('rejects calls without context with AuthenticationError', async () => {
      await assert.rejects(
        () =>
          handleGetJobApplication(null, {
            applicationId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          }),
        AuthenticationError
      );
    });

    it('handleListActiveApplications delegates to service with memberContext', async () => {
      const mockService = {
        listApplications: async () => ({
          items: [
            {
              id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
              companyName: 'Linear',
              jobTitle: 'Product Engineer',
              status: 'APPLIED',
              source: 'MANUAL',
              workplaceType: 'REMOTE',
              location: 'San Francisco, CA',
              appliedAt: new Date('2026-08-01T00:00:00.000Z'),
              createdAt: new Date('2026-08-01T00:00:00.000Z'),
              updatedAt: new Date('2026-08-01T00:00:00.000Z'),
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
          hasMore: false,
        }),
      };

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' }],
            }),
          }),
        }),
      };

      const res = await handleListActiveApplications(
        memberContext,
        { limit: 10, offset: 0 },
        { applicationTrackingService: mockService, db: mockDb }
      );

      assert.strictEqual(res.total, 1);
      assert.strictEqual(res.items[0].companyName, 'Linear');
    });
  });
});
