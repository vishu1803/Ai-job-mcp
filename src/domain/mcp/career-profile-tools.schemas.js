/**
 * @file MCP Career Profile Tool Definitions & Schemas (P14-004C / ARCH-056).
 *
 * Defines tool definitions, JSON schemas, and RBAC/scope configurations for the Career Profile tools:
 * 1. get_career_profile (career:read / READONLY)
 * 2. update_career_preferences (career:write / MEMBER)
 */

import { z } from 'zod';

export const CAREER_PROFILE_TOOL_DEFINITIONS = {
  get_career_profile: {
    name: 'get_career_profile',
    description:
      'Retrieves the candidate’s persistent career profile, target roles, preferred locations, compensation floors, and verified skills summary.',
    requiredScopes: ['career:read'],
    requiredRole: 'READONLY',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'Optional candidate UUID. If omitted, uses the authenticated candidate.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'object' },
      },
      required: ['profile'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },

  update_career_preferences: {
    name: 'update_career_preferences',
    description:
      'Updates the candidate’s persistent job search preferences (target roles, locations, remote preference, salary floor, tech stack) with strict user sovereignty.',
    requiredScopes: ['career:write'],
    requiredRole: 'MEMBER',
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: {
          type: 'string',
          description: 'Optional candidate UUID. If omitted, uses the authenticated candidate.',
        },
        targetRoles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of target job titles or roles.',
        },
        preferredLocations: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of preferred geographic locations or timezones.',
        },
        remotePreference: {
          type: 'string',
          enum: ['REMOTE_ONLY', 'REMOTE_FIRST', 'HYBRID', 'ON_SITE', 'FLEXIBLE'],
          description: 'Remote work policy preference.',
        },
        employmentTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'],
          },
          description: 'Desired employment types.',
        },
        salaryFloor: {
          type: 'number',
          description: 'Minimum required base salary compensation.',
        },
        salaryCurrency: {
          type: 'string',
          description: '3-letter currency code (e.g. USD, EUR, INR).',
        },
        industries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target industry sectors.',
        },
        companiesToAvoid: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of company names to exclude from search results.',
        },
        companiesToPrioritize: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of preferred company names.',
        },
        preferredTechStack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred programming languages, frameworks, and tools.',
        },
        workAuthorization: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit user-provided work authorization countries (never inferred).',
        },
        visaSponsorshipRequired: {
          type: 'boolean',
          description: 'Whether visa sponsorship is required.',
        },
        availabilityDate: {
          type: 'string',
          description: 'Availability start date or notice period.',
        },
        relocationPreference: {
          type: 'string',
          enum: ['WILLING_TO_RELOCATE', 'NOT_WILLING', 'REMOTE_ONLY'],
          description: 'Relocation preference.',
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        preferences: { type: 'object' },
        message: { type: 'string' },
      },
      required: ['preferences', 'message'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
};

export const GetCareerProfileInputSchema = z.strictObject({
  candidateId: z.string().uuid().optional(),
});
