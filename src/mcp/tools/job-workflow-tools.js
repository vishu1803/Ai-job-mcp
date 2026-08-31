/**
 * @file Implementation of MCP Job Workflow Tools (P14-004B / ARCH-055).
 *
 * Implements the 8 core job application workflow MCP tools:
 * 1. search_jobs (career:read / READONLY)
 * 2. get_job_posting (career:read / READONLY)
 * 3. prepare_job_application (career:read / MEMBER)
 * 4. validate_job_application (career:read / MEMBER)
 * 5. create_application_preview (career:read / MEMBER)
 * 6. request_application_approval (career:write / MEMBER)
 * 7. submit_job_application (career:write / MEMBER)
 * 8. get_application_submission_status (career:read / READONLY)
 */

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { candidates } from '../../db/schema.js';
import { config } from '../../config/env.js';
import { NotFoundError } from '../../errors/index.js';
import { JobDiscoveryService } from '../../services/job-discovery.service.js';
import { JobApplicationWorkflowService } from '../../services/job-application-workflow.service.js';
import { ApplicationTrackingService } from '../../services/application-tracking.service.js';
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
import { assertToolPermission } from '../../security/mcp-auth.js';
import { JOB_WORKFLOW_TOOL_DEFINITIONS } from '../../domain/mcp/job-workflow-tools.schemas.js';

/**
 * Resolves target candidate ID for the authenticated request.
 *
 * @param {object} context
 * @param {string} [candidateId]
 * @param {object} [dbClient=defaultDb]
 * @returns {Promise<string>}
 */
async function resolveCandidateId(context, candidateId, dbClient = defaultDb) {
  if (candidateId) {
    const [cand] = await dbClient
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!cand) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`, 'CANDIDATE_NOT_FOUND');
    }
    return cand.id;
  }

  const [cand] = await dbClient
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.tenantId, context.tenantId))
    .limit(1);

  if (!cand) {
    throw new NotFoundError(
      `No candidate profile found for tenant ${context.tenantId}`,
      'CANDIDATE_NOT_FOUND'
    );
  }
  return cand.id;
}

export function registerJobWorkflowTools(
  server,
  {
    database = defaultDb,
    jobDiscoveryService = null,
    jobApplicationWorkflowService = null,
    applicationTrackingService = null,
  } = {}
) {
  const discoveryService =
    jobDiscoveryService ||
    new JobDiscoveryService({
      greenhouseBoards: (config.GREENHOUSE_BOARDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((boardToken) => ({ boardToken })),
      leverSites: (config.LEVER_SITES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((site) => ({ site })),
      fetchTimeoutMs: config.JOB_BOARD_FETCH_TIMEOUT_MS,
    });
  const workflowService =
    jobApplicationWorkflowService || new JobApplicationWorkflowService({ database });
  const trackingService =
    applicationTrackingService || new ApplicationTrackingService({ database });

  // ---------------------------------------------------------------------------
  // 1. search_jobs (career:read / READONLY)
  // ---------------------------------------------------------------------------
  server.registerTool(JOB_WORKFLOW_TOOL_DEFINITIONS.search_jobs, async (context, params) => {
    assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.search_jobs);

    const result = await discoveryService.searchJobs(params);
    return result;
  });

  // ---------------------------------------------------------------------------
  // 2. get_job_posting (career:read / READONLY)
  // ---------------------------------------------------------------------------
  server.registerTool(JOB_WORKFLOW_TOOL_DEFINITIONS.get_job_posting, async (context, params) => {
    assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.get_job_posting);

    const result = await discoveryService.getJobPosting(params);
    return result;
  });

  // ---------------------------------------------------------------------------
  // 3. prepare_job_application (career:read / MEMBER)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.prepare_job_application,
    async (context, params) => {
      assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.prepare_job_application);

      const targetCandidateId = await resolveCandidateId(context, params.candidateId, database);

      const result = await workflowService.prepareJobApplication({
        tenantId: context.tenantId,
        candidateId: targetCandidateId,
        jobPosting: params.jobPosting,
        answers: params.answers || {},
      });

      return result;
    }
  );

  // ---------------------------------------------------------------------------
  // 4. validate_job_application (career:read / MEMBER)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.validate_job_application,
    async (context, params) => {
      assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.validate_job_application);

      const targetCandidateId = await resolveCandidateId(
        context,
        params.applicationPackage?.candidateId,
        database
      );

      const result = await workflowService.validateJobApplication({
        tenantId: context.tenantId,
        candidateId: targetCandidateId,
        applicationPackage: params.applicationPackage,
        destinationUrl: params.destinationUrl,
      });

      return result;
    }
  );

  // ---------------------------------------------------------------------------
  // 5. create_application_preview (career:read / MEMBER)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.create_application_preview,
    async (context, params) => {
      assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.create_application_preview);

      const previewMarkdown = workflowService.createApplicationPreview(params.applicationPackage);

      return {
        previewMarkdown: SecretScrubber.scrub(previewMarkdown),
        packageHash: params.applicationPackage.packageHash,
      };
    }
  );

  // ---------------------------------------------------------------------------
  // 6. request_application_approval (career:write / MEMBER)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.request_application_approval,
    async (context, params) => {
      assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.request_application_approval);

      const targetCandidateId = await resolveCandidateId(context, params.candidateId, database);

      const ticket = await workflowService.requestApplicationApproval({
        tenantId: context.tenantId,
        userId: context.userId || context.id,
        candidateId: targetCandidateId,
        clientId: context.clientId || 'mcp-client',
        jobId: params.jobId,
        destinationUrl: params.destinationUrl,
        packageHash: params.packageHash,
      });

      return ticket;
    }
  );

  // ---------------------------------------------------------------------------
  // 7. submit_job_application (career:write / MEMBER)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.submit_job_application,
    async (context, params) => {
      assertToolPermission(context, JOB_WORKFLOW_TOOL_DEFINITIONS.submit_job_application);

      const targetCandidateId = await resolveCandidateId(
        context,
        params.candidateId || params.applicationPackage?.candidateId,
        database
      );

      const result = await workflowService.submitJobApplication({
        tenantId: context.tenantId,
        userId: context.userId || context.id,
        candidateId: targetCandidateId,
        approvalTicketId: params.approvalTicketId,
        packageHash: params.packageHash,
        destinationUrl: params.destinationUrl,
        applicationPackage: params.applicationPackage,
      });

      return result;
    }
  );

  // ---------------------------------------------------------------------------
  // 8. get_application_submission_status (career:read / READONLY)
  // ---------------------------------------------------------------------------
  server.registerTool(
    JOB_WORKFLOW_TOOL_DEFINITIONS.get_application_submission_status,
    async (context, params) => {
      assertToolPermission(
        context,
        JOB_WORKFLOW_TOOL_DEFINITIONS.get_application_submission_status
      );

      const appRecord = await trackingService.getApplication(context, params.applicationId);

      return appRecord;
    }
  );
}
