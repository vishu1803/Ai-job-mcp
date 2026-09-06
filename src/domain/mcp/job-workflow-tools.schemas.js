/**
 * @file MCP Job Workflow Tool Definitions & Schemas (P14-004B / ARCH-055).
 *
 * Defines tool definitions, JSON schemas, and RBAC/scope configurations for the 8 job workflow tools:
 * 1. search_jobs (career:read / READONLY)
 * 2. get_job_posting (career:read / READONLY)
 * 3. prepare_job_application (career:read / MEMBER)
 * 4. validate_job_application (career:read / MEMBER)
 * 5. create_application_preview (career:read / MEMBER)
 * 6. request_application_approval (career:write / MEMBER)
 * 7. submit_job_application (career:write / MEMBER)
 * 8. get_application_submission_status (career:read / READONLY)
 */

import { z } from 'zod';
import {
  SearchJobsInputSchema,
  GetJobPostingInputSchema,
  NormalizedJobPostingSchema,
  ApplicationPackageSchema,
  ValidateJobApplicationInputSchema,
} from '../job/job-workflow.schemas.js';

export const JOB_WORKFLOW_TOOL_DEFINITIONS = {
  search_jobs: {
    name: 'search_jobs',
    description:
      'Searches normalized job postings across supported feeds and public ATS boards (Greenhouse, Lever) with source attribution.',
    requiredScopes: ['career:read'],
    requiredRole: 'READONLY',
    inputSchema: SearchJobsInputSchema,
  },
  get_job_posting: {
    name: 'get_job_posting',
    description:
      'Retrieves the full normalized job posting details, responsibilities, requirements, and application URL by Job ID.',
    requiredScopes: ['career:read'],
    requiredRole: 'READONLY',
    inputSchema: GetJobPostingInputSchema,
  },
  prepare_job_application: {
    name: 'prepare_job_application',
    description:
      'Orchestrates candidate profile, verified repository evidence, tailored resume, and cover letter into a complete application package.',
    requiredScopes: ['career:read'],
    requiredRole: 'MEMBER',
    inputSchema: z.object({
      candidateId: z.string().uuid().optional(),
      jobPosting: NormalizedJobPostingSchema,
      answers: z.record(z.string(), z.string()).optional().default({}),
    }),
  },
  validate_job_application: {
    name: 'validate_job_application',
    description:
      'Validates application package completeness, duplicate application detection, and destination portal submission capability.',
    requiredScopes: ['career:read'],
    requiredRole: 'MEMBER',
    inputSchema: ValidateJobApplicationInputSchema,
  },
  create_application_preview: {
    name: 'create_application_preview',
    description:
      'Produces the exact human-reviewable application package preview with distinct VERIFIED vs CLAIMED truth labels.',
    requiredScopes: ['career:read'],
    requiredRole: 'MEMBER',
    inputSchema: z.object({
      applicationPackage: ApplicationPackageSchema,
    }),
  },
  request_application_approval: {
    name: 'request_application_approval',
    description:
      'Creates a single-use, 15-minute cryptographic approval ticket bound to the application package hash.',
    requiredScopes: ['career:write'],
    requiredRole: 'MEMBER',
    inputSchema: z.object({
      candidateId: z.string().uuid().optional(),
      jobId: z.string().min(1),
      destinationUrl: z.string().url(),
      packageHash: z.string().length(64),
      notes: z.string().optional(),
    }),
  },
  submit_job_application: {
    name: 'submit_job_application',
    description:
      'High-risk external submission boundary. Strictly requires a valid, pre-approved single-use ticket. For unsupported portals, returns instant manual handoff kit.',
    requiredScopes: ['career:write'],
    requiredRole: 'MEMBER',
    inputSchema: z.object({
      candidateId: z.string().uuid().optional(),
      approvalTicketId: z.string().uuid(),
      packageHash: z.string().length(64),
      destinationUrl: z.string().url(),
      applicationPackage: ApplicationPackageSchema,
    }),
  },
  get_application_submission_status: {
    name: 'get_application_submission_status',
    description:
      'Retrieves the status and external submission reference of a tracked job application.',
    requiredScopes: ['career:read'],
    requiredRole: 'READONLY',
    inputSchema: z.object({
      applicationId: z.string().uuid(),
    }),
    outputSchema: z
      .object({
        applicationId: z.string().uuid(),
        candidateId: z.string().uuid(),
        companyName: z.string(),
        jobTitle: z.string(),
        jobUrl: z.string().nullable().optional(),
        status: z.string(),
        trackingStatus: z.string(),
        externalReference: z.string().nullable().optional(),
        packageHash: z.string().length(64).nullable().optional(),
        appliedAt: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        stages: z.array(z.record(z.unknown())),
        tailoredDocuments: z.array(
          z
            .object({
              id: z.string().uuid().nullable().optional(),
              applicationId: z.string().uuid(),
              candidateId: z.string().uuid(),
              documentType: z.enum([
                'TAILORED_RESUME',
                'TAILORED_COVER_LETTER',
                'PORTFOLIO_RECOMMENDATION',
                'CUSTOM_NOTE',
              ]),
              version: z.number().int().positive(),
              packageVersion: z.number().int().positive().nullable().optional(),
              title: z.string(),
              contentHash: z.string().length(64),
              packageHash: z.string().length(64).nullable().optional(),
              citationRefsCount: z.number().int().nonnegative(),
              integrityScore: z.number().nullable().optional(),
              atsFitScore: z.number().nullable().optional(),
              createdAt: z.string(),
              artifactReference: z.string().optional(),
              filename: z.string().optional(),
              mimeType: z.string().optional(),
              fileSizeBytes: z.number().int().positive().optional(),
              availabilityStatus: z.enum(['READY', 'BLOCKED']).optional(),
              viewUrl: z.string().optional(),
              downloadUrl: z.string().optional(),
              // PDF byte hash for artifact integrity; contentHash is the
              // authoritative Markdown hash from the current package.
              pdfContentHash: z.string().length(64).optional(),
              qaScore: z.number().min(0).max(100).optional(),
              qaPassed: z.boolean().optional(),
            })
            .passthrough()
        ),
        createdAt: z.string().nullable().optional(),
        updatedAt: z.string().nullable().optional(),
      })
      .passthrough(),
    exposeOutputSchema: true,
  },
};
