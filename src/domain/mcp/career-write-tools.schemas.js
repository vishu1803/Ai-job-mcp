/**
 * @file Model Context Protocol (MCP) Career Write Tools Domain Schemas (P9-005 / ARCH-035).
 *
 * Defines canonical input, output, and tool definition schemas for approved
 * GitHub project modification write tools:
 * 1. propose_project_improvement (career:write / MEMBER)
 * 2. confirm_and_create_pr (career:write / MEMBER)
 *
 * Design Invariants:
 * - Anti-Primitive Boundary: Zero generic write primitives (no raw write_file, create_branch, create_commit).
 * - Sovereign Context: Zero trust in client-supplied tenant, user, or installation identities.
 * - Explicit Human Approval: confirm_and_create_pr strictly requires confirmed === true.
 * - Anti-Self-Approval Stopping Protocol: Proposal output returns explicit human confirmation instructions.
 * - Accurate MCP Annotations: Non-read-only hints, open-world hint, idempotent confirm.
 */

import { z } from 'zod';
import { McpRoleEnum } from './mcp.schemas.js';

/**
 * Input schema for propose_project_improvement tool.
 */
export const ProposeProjectImprovementInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('Candidate ID must be a valid UUID')
      .optional()
      .describe('Optional target candidate profile UUID. Defaults to authenticated user persona.'),
    jobDescriptionId: z
      .string()
      .uuid('Job Description ID must be a valid UUID')
      .optional()
      .describe('Optional ID of previously analyzed job description stored in tenant workspace.'),
    jobDescriptionText: z
      .string()
      .min(50, 'Job description text must be at least 50 characters')
      .max(50000, 'Job description text must not exceed 50,000 characters')
      .optional()
      .describe('Raw job description text to parse and extract missing skill requirements from.'),
    targetSkillSlugs: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Skill slugs must be kebab-case')
          .max(64)
      )
      .max(10, 'Maximum 10 target skills per proposal')
      .optional()
      .describe('Optional explicit filter for specific skill gaps to address.'),
    targetRepositoryId: z
      .string()
      .uuid('Repository Resource ID must be a valid UUID')
      .optional()
      .describe('Optional specific connected repository resource ID to enhance.'),
  })
  .strict()
  .refine((data) => Boolean(data.jobDescriptionId || data.jobDescriptionText), {
    message: 'Either jobDescriptionId or jobDescriptionText must be provided',
    path: ['jobDescriptionText'],
  });

/**
 * Output schema for propose_project_improvement tool.
 */
export const ProposeProjectImprovementOutputSchema = z
  .object({
    proposalId: z.string().uuid(),
    ticketId: z.string().uuid(),
    status: z.literal('PENDING_HUMAN_APPROVAL'),
    actionType: z.literal('PROJECT_IMPROVEMENT_PR'),
    title: z.string().max(256),
    rationale: z.string().max(2000),
    targetSkill: z.object({
      slug: z.string(),
      name: z.string(),
      gapStatus: z.enum([
        'MISSING',
        'PARTIAL',
        'INSUFFICIENT_EVIDENCE',
        'ADJACENT_COVERAGE',
        'UNKNOWN',
      ]),
      confidenceScore: z.number().min(0).max(1),
    }),
    repository: z.object({
      id: z.string().uuid(),
      name: z.string(),
      defaultBranch: z.string(),
      baseBranch: z.string(),
      targetBranch: z.string().regex(/^feat\/career-hub-[a-z0-9-]+$/),
      expectedHeadSha: z.string().length(40),
    }),
    patchSummary: z.object({
      fileCount: z.number().int().min(1).max(10),
      totalDiffLines: z.number().int().min(1).max(500),
      files: z.array(
        z.object({
          path: z.string(),
          changeType: z.enum(['CREATE', 'MODIFY']),
          additions: z.number().int().nonnegative(),
          deletions: z.number().int().nonnegative(),
          diffPreview: z.string().max(4000),
        })
      ),
    }),
    verificationPlan: z.object({
      instructions: z.string().max(2000),
      recommendedTests: z.array(z.string()).max(10),
    }),
    approvalRequirements: z.object({
      requiredRole: z.literal('MEMBER'),
      expiresAt: z.string().datetime(),
      ttlSeconds: z.number().int().positive(),
      confirmationInstructions: z.string(),
    }),
  })
  .strict();

/**
 * Input schema for confirm_and_create_pr tool.
 */
export const ConfirmAndCreatePrInputSchema = z
  .object({
    ticketId: z
      .string()
      .uuid('ticketId must be a valid UUID matching an existing approval ticket')
      .describe('The unique ApprovalTicket UUID returned by propose_project_improvement.'),
    confirmed: z
      .literal(true, {
        errorMap: () => ({
          message: 'confirmed must be explicitly true to authorize repository modification',
        }),
      })
      .describe('Explicit human confirmation flag. Must be strictly boolean true.'),
    idempotencyKey: z
      .string()
      .min(16, 'Idempotency key must be at least 16 characters')
      .max(128, 'Idempotency key cannot exceed 128 characters')
      .optional()
      .describe('Optional client-supplied idempotency key to safely retry requests.'),
    userNotes: z
      .string()
      .max(500, 'User notes cannot exceed 500 characters')
      .optional()
      .describe('Optional human reviewer audit notes recorded in ticket history.'),
  })
  .strict();

/**
 * Output schema for confirm_and_create_pr tool.
 */
export const ConfirmAndCreatePrOutputSchema = z
  .object({
    operationId: z.string().uuid(),
    ticketId: z.string().uuid(),
    status: z.literal('EXECUTED'),
    repositoryName: z.string(),
    baseBranch: z.string(),
    targetBranch: z.string().regex(/^feat\/career-hub-[a-z0-9-]+$/),
    commitSha: z.string().length(40),
    pullRequest: z.object({
      number: z.number().int().positive(),
      url: z.string().url(),
      title: z.string(),
      state: z.literal('open'),
      draft: z.literal(true),
    }),
    executedAt: z.string().datetime(),
  })
  .strict();

/**
 * Canonical Tool Definitions for MCP Server Registration (2026-07-28 Spec).
 */
export const CAREER_WRITE_TOOL_DEFINITIONS = Object.freeze({
  propose_project_improvement: {
    name: 'propose_project_improvement',
    description:
      'Analyzes candidate skill gaps against a job description, generates an evidence-grounded code patch, ' +
      'and mints an ActionApprovalTicket. STOP: Do NOT invoke confirm_and_create_pr automatically. ' +
      'Present the diff and ticketId to the human user and await explicit confirmation.',
    inputSchema: ProposeProjectImprovementInputSchema,
    outputSchema: ProposeProjectImprovementOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },

  confirm_and_create_pr: {
    name: 'confirm_and_create_pr',
    description:
      'Authorizes and executes an approved ActionApprovalTicket to create an isolated feature branch ' +
      'and open a Draft Pull Request on GitHub. Requires explicit human confirmation.',
    inputSchema: ConfirmAndCreatePrInputSchema,
    outputSchema: ConfirmAndCreatePrOutputSchema,
    requiredRole: McpRoleEnum.enum.MEMBER,
    requiredScopes: ['career:write'],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
});
