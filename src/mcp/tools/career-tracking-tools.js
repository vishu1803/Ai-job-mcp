/**
 * @file Implementation of MCP Career Tracking Tools (Phase 12 / P12-003 / ARCH-044)
 *
 * Implements the 7 core job application tracking MCP tools:
 * 1. track_job_application (career:write / MEMBER)
 * 2. update_application_status (career:write / MEMBER)
 * 3. add_application_stage (career:write / MEMBER)
 * 4. update_application_stage_outcome (career:write / MEMBER)
 * 5. attach_application_document (career:write / MEMBER)
 * 6. get_job_application (career:read / READONLY)
 * 7. list_active_applications (career:read / READONLY)
 *
 * Adheres to:
 * - Pure Transport/Authorization Wrapper: Delegates directly to ApplicationTrackingService.
 * - Multi-Tenant Sovereign Isolation: 404 default-deny on any cross-tenant request.
 * - RBAC & Scope Enforcement: career:write for mutations, career:read for queries.
 * - Bounded Output Envelopes: <= 25 KB for details, <= 15 KB for list summaries.
 * - Sensitive Data Protection & Secret Scrubbing via SecretScrubber.
 */

import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { candidates, jobApplications } from '../../db/schema.js';
import { NotFoundError } from '../../errors/index.js';
import { ApplicationTrackingService } from '../../services/application-tracking.service.js';
import { SecretScrubber } from '../../extractors/github/security/secret-scrubber.js';
import { assertToolPermission } from '../../security/mcp-auth.js';
import {
  CAREER_TRACKING_TOOL_DEFINITIONS,
  TrackJobApplicationInputSchema,
  TrackJobApplicationOutputSchema,
  UpdateApplicationStatusInputSchema,
  UpdateApplicationStatusOutputSchema,
  AddApplicationStageInputSchema,
  AddApplicationStageOutputSchema,
  UpdateApplicationStageOutcomeInputSchema,
  UpdateApplicationStageOutcomeOutputSchema,
  AttachApplicationDocumentInputSchema,
  AttachApplicationDocumentOutputSchema,
  GetJobApplicationInputSchema,
  GetJobApplicationOutputSchema,
  ListActiveApplicationsInputSchema,
  ListActiveApplicationsOutputSchema,
  MAX_RAW_JD_CHARS_IN_GET,
  MAX_STAGES_PER_GET,
  MAX_DOCUMENTS_PER_GET,
} from '../../domain/mcp/career-tracking-tools.schemas.js';

/**
 * Resolves the target candidate ID for an authenticated request.
 *
 * @param {import('../../domain/mcp/mcp.schemas.js').McpRequestContext} context Authenticated context
 * @param {string} [candidateId] Optional explicit candidate UUID
 * @param {object} [dbClient=defaultDb] Database client
 * @returns {Promise<string>} Resolved candidate ID
 */
async function resolveTargetCandidateId(context, candidateId, dbClient = defaultDb) {
  if (candidateId) {
    const [cand] = await dbClient
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, context.tenantId)))
      .limit(1);

    if (!cand) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }
    return cand.id;
  }

  if (context.userId) {
    const [userCand] = await dbClient
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.tenantId, context.tenantId), eq(candidates.userId, context.userId)))
      .limit(1);

    if (userCand) {
      return userCand.id;
    }
  }

  const [firstCand] = await dbClient
    .select({ id: candidates.id })
    .from(candidates)
    .where(eq(candidates.tenantId, context.tenantId))
    .limit(1);

  if (!firstCand) {
    throw new NotFoundError('No candidate profile found for this tenant.');
  }
  return firstCand.id;
}

// =============================================================================
// Tool Handlers
// =============================================================================

/**
 * 1. track_job_application handler
 */
export async function handleTrackJobApplication(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.track_job_application);

  const input = TrackJobApplicationInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const targetCandidateId = await resolveTargetCandidateId(context, input.candidateId, dbClient);

  const application = await trackingService.createApplication(context, targetCandidateId, {
    companyName: SecretScrubber.scrub(input.companyName),
    jobTitle: SecretScrubber.scrub(input.jobTitle),
    jobUrl: input.jobUrl || null,
    source: input.source || 'MANUAL',
    location: input.location ? SecretScrubber.scrub(input.location) : null,
    workplaceType: input.workplaceType || null,
    employmentType: input.employmentType || null,
    rawJobDescription: input.rawJobDescription
      ? SecretScrubber.scrub(input.rawJobDescription)
      : null,
    compensation: input.compensation || {},
    notes: input.notes ? SecretScrubber.scrub(input.notes) : null,
    status: input.status || 'SAVED',
  });

  const output = {
    application: {
      id: application.id,
      candidateId: application.candidateId,
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      status: application.status,
      appliedAt: application.appliedAt ? application.appliedAt.toISOString() : null,
      source: application.source,
      location: application.location,
      workplaceType: application.workplaceType,
      employmentType: application.employmentType,
      createdAt: application.createdAt.toISOString(),
    },
    message: `Job application at ${application.companyName} for ${application.jobTitle} tracked successfully in ${application.status} status.`,
  };

  return TrackJobApplicationOutputSchema.parse(output);
}

/**
 * 2. update_application_status handler
 */
export async function handleUpdateApplicationStatus(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.update_application_status);

  const input = UpdateApplicationStatusInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const sanitizedReason = input.reason ? SecretScrubber.scrub(input.reason) : null;
  const updated = await trackingService.updateApplicationStatus(
    context,
    input.applicationId,
    input.status,
    sanitizedReason
  );

  const output = {
    application: {
      id: updated.id,
      companyName: updated.companyName,
      jobTitle: updated.jobTitle,
      status: updated.status,
      appliedAt: updated.appliedAt ? updated.appliedAt.toISOString() : null,
      closedAt: updated.closedAt ? updated.closedAt.toISOString() : null,
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: `Application status for ${updated.companyName} (${updated.jobTitle}) updated to ${updated.status}.`,
  };

  return UpdateApplicationStatusOutputSchema.parse(output);
}

/**
 * 3. add_application_stage handler
 */
export async function handleAddApplicationStage(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.add_application_stage);

  const input = AddApplicationStageInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const sanitizedInterviewers = (input.interviewerNames || []).map((n) => SecretScrubber.scrub(n));

  const stage = await trackingService.addApplicationStage(context, input.applicationId, {
    stageType: input.stageType,
    title: SecretScrubber.scrub(input.title),
    scheduledAt: input.scheduledAt || null,
    interviewerNames: sanitizedInterviewers,
  });

  const output = {
    stage: {
      id: stage.id,
      applicationId: stage.applicationId,
      stageType: stage.stageType,
      title: stage.title,
      orderIndex: stage.orderIndex,
      outcome: stage.outcome,
      scheduledAt: stage.scheduledAt ? stage.scheduledAt.toISOString() : null,
      createdAt: stage.createdAt.toISOString(),
    },
    message: `Interview stage "${stage.title}" (${stage.stageType}) added to application at index ${stage.orderIndex}.`,
  };

  return AddApplicationStageOutputSchema.parse(output);
}

/**
 * 4. update_application_stage_outcome handler
 */
export async function handleUpdateApplicationStageOutcome(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.update_application_stage_outcome);

  const input = UpdateApplicationStageOutcomeInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const sanitizedFeedback = input.feedback ? SecretScrubber.scrub(input.feedback) : null;

  const updated = await trackingService.updateStageOutcome(
    context,
    input.stageId,
    input.outcome,
    sanitizedFeedback,
    { scheduledAt: input.rescheduledAt }
  );

  const output = {
    stage: {
      id: updated.id,
      applicationId: updated.applicationId,
      stageType: updated.stageType,
      title: updated.title,
      orderIndex: updated.orderIndex,
      outcome: updated.outcome,
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
      scheduledAt: updated.scheduledAt ? updated.scheduledAt.toISOString() : null,
      hasFeedback: Boolean(updated.feedback),
      updatedAt: updated.updatedAt.toISOString(),
    },
    message: `Stage "${updated.title}" outcome updated to ${updated.outcome}.`,
  };

  return UpdateApplicationStageOutcomeOutputSchema.parse(output);
}

/**
 * 5. attach_application_document handler
 */
export async function handleAttachApplicationDocument(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.attach_application_document);

  const input = AttachApplicationDocumentInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  // Resolve target candidate from application if not explicitly supplied
  let candidateId = input.candidateId;
  if (!candidateId) {
    const [app] = await dbClient
      .select({ candidateId: jobApplications.candidateId })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.id, input.applicationId),
          eq(jobApplications.tenantId, context.tenantId)
        )
      )
      .limit(1);

    if (!app) {
      throw new NotFoundError(`Job application not found: ${input.applicationId}`);
    }
    candidateId = app.candidateId;
  }

  const document = await trackingService.attachTailoredDocument(context, input.applicationId, {
    candidateId,
    documentType: input.documentType,
    title: SecretScrubber.scrub(input.title),
    content: input.content,
    renderedMarkdown: input.renderedMarkdown || null,
    renderedPlainText: input.renderedPlainText || null,
    citationRefs: input.citationRefs || [],
    integrityScore: input.integrityScore || null,
    atsFitScore: input.atsFitScore || null,
    metadata: input.metadata || {},
  });

  const output = {
    document: {
      id: document.id,
      applicationId: document.applicationId,
      candidateId: document.candidateId,
      documentType: document.documentType,
      version: document.version,
      contentHash: document.contentHash,
      citationRefsCount: document.citationRefs.length,
      integrityScore: document.integrityScore,
      atsFitScore: document.atsFitScore,
      createdAt: document.createdAt.toISOString(),
    },
    message: `Attached ${document.documentType} v${document.version} to application successfully.`,
  };

  return AttachApplicationDocumentOutputSchema.parse(output);
}

/**
 * 6. get_job_application handler
 */
export async function handleGetJobApplication(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application);

  const input = GetJobApplicationInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const details = await trackingService.getApplicationDetails(context, input.applicationId);
  const { application, stages, tailoredDocuments } = details;

  // Bounded Output Shaping
  let rawJd = null;
  if (input.includeFullJd && application.rawJobDescription) {
    rawJd = application.rawJobDescription.slice(0, MAX_RAW_JD_CHARS_IN_GET);
  }

  const boundedStages = stages.slice(0, MAX_STAGES_PER_GET).map((s) => ({
    id: s.id,
    stageType: s.stageType,
    title: s.title,
    orderIndex: s.orderIndex,
    outcome: s.outcome,
    scheduledAt: s.scheduledAt ? s.scheduledAt.toISOString() : null,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    interviewerNames: s.interviewerNames || [],
    feedback: s.feedback ? SecretScrubber.scrub(s.feedback) : null,
    createdAt: s.createdAt.toISOString(),
  }));

  const boundedDocuments = tailoredDocuments.slice(0, MAX_DOCUMENTS_PER_GET).map((d) => ({
    id: d.id,
    documentType: d.documentType,
    version: d.version,
    title: d.title,
    contentHash: d.contentHash,
    citationRefsCount: Array.isArray(d.citationRefs) ? d.citationRefs.length : 0,
    integrityScore: d.integrityScore,
    atsFitScore: d.atsFitScore,
    createdAt: d.createdAt.toISOString(),
  }));

  const output = {
    application: {
      id: application.id,
      candidateId: application.candidateId,
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      jobUrl: application.jobUrl,
      source: application.source,
      location: application.location,
      workplaceType: application.workplaceType,
      employmentType: application.employmentType,
      status: application.status,
      appliedAt: application.appliedAt ? application.appliedAt.toISOString() : null,
      closedAt: application.closedAt ? application.closedAt.toISOString() : null,
      compensation: application.compensation || {},
      notes: application.notes ? SecretScrubber.scrub(application.notes) : null,
      rawJobDescription: rawJd,
      createdAt: application.createdAt.toISOString(),
      updatedAt: application.updatedAt.toISOString(),
    },
    stages: boundedStages,
    tailoredDocuments: boundedDocuments,
  };

  return GetJobApplicationOutputSchema.parse(output);
}

/**
 * 7. list_active_applications handler
 */
export async function handleListActiveApplications(context, args, deps = {}) {
  assertToolPermission(context, CAREER_TRACKING_TOOL_DEFINITIONS.list_active_applications);

  const input = ListActiveApplicationsInputSchema.parse(args);
  const dbClient = deps.db || defaultDb;
  const trackingService =
    deps.applicationTrackingService || new ApplicationTrackingService({ database: dbClient });

  const targetCandidateId = await resolveTargetCandidateId(context, input.candidateId, dbClient);

  // Default to active funnel if no explicit status filter provided
  const statusFilter = input.status || [
    'SAVED',
    'APPLIED',
    'SCREENING',
    'INTERVIEWING',
    'OFFER_RECEIVED',
  ];

  const result = await trackingService.listApplications(
    context,
    targetCandidateId,
    {
      status: statusFilter,
      companyName: input.companyName,
      source: input.source,
      workplaceType: input.workplaceType,
    },
    {
      limit: input.limit,
      offset: input.offset,
    }
  );

  // Compact summary items without sensitive compensation numbers or raw JDs
  const compactItems = result.items.map((app) => ({
    id: app.id,
    companyName: app.companyName,
    jobTitle: app.jobTitle,
    status: app.status,
    source: app.source,
    workplaceType: app.workplaceType,
    location: app.location,
    appliedAt: app.appliedAt ? app.appliedAt.toISOString() : null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  }));

  const output = {
    items: compactItems,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
    hasMore: result.hasMore,
  };

  return ListActiveApplicationsOutputSchema.parse(output);
}

// =============================================================================
// Registration Helper for McpServerWrapper
// =============================================================================

/**
 * Registers all 7 application tracking tools onto an McpServerWrapper instance.
 *
 * @param {import('../server.js').McpServerWrapper} mcpServer Server wrapper instance
 * @param {object} [deps={}] Optional dependency overrides
 */
export function registerCareerTrackingTools(mcpServer, deps = {}) {
  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.track_job_application,
    async (context, args) => handleTrackJobApplication(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.update_application_status,
    async (context, args) => handleUpdateApplicationStatus(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.add_application_stage,
    async (context, args) => handleAddApplicationStage(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.update_application_stage_outcome,
    async (context, args) => handleUpdateApplicationStageOutcome(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.attach_application_document,
    async (context, args) => handleAttachApplicationDocument(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.get_job_application,
    async (context, args) => handleGetJobApplication(context, args, deps)
  );

  mcpServer.registerTool(
    CAREER_TRACKING_TOOL_DEFINITIONS.list_active_applications,
    async (context, args) => handleListActiveApplications(context, args, deps)
  );
}
