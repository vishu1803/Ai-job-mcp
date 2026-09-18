/**
 * @file AI Career Assistant Domain Schemas & Contracts (P87 Phase 1)
 *
 * Defines Zod schemas and invariants for the AI Career Assistant layer:
 * 1. AI is NOT a source of truth.
 * 2. Canonical candidate profile, evidence provenance, ATS engine, and
 *    ApplicationReadinessService remain authoritative.
 * 3. AI update proposals require explicit evidence citations and explicit user confirmation.
 * 4. Zero silent mutations of candidate profile, work authorization, or application submissions.
 * 5. Conflicts between profile and applications must be identified without autonomous resolution.
 */

import { z } from 'zod';

/**
 * Valid Evidence Provenance Source Types.
 */
export const EvidenceSourceTypeSchema = z.enum([
  'USER_INPUT',
  'RESUME',
  'UPLOADED_DOC',
  'EXISTING_PROFILE',
  'APPLICATION',
  'JOB_DESCRIPTION',
  'REPOSITORY_CODE',
  'FACT_INVENTORY',
]);

/**
 * Structured Evidence Source Citation.
 */
export const EvidenceSourceSchema = z.object({
  type: EvidenceSourceTypeSchema,
  label: z.string().min(1),
  referenceId: z.string().optional().nullable(),
  quote: z.string().optional().nullable(),
  verified: z.boolean().default(false),
});

/**
 * Proposal Status State Machine.
 */
export const ProposalStatusSchema = z.enum(['PROPOSED', 'CONFIRMED', 'REJECTED', 'APPLIED']);

/**
 * Safe Update Proposal Schema.
 * Every suggested change to candidate profile data must instantiate this schema
 * and be explicitly confirmed by the candidate before any mutation can occur.
 */
export const SafeUpdateProposalSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(['JOB_PREFERENCES', 'PROFILE_INFO', 'PORTFOLIO_LINKS', 'GENERAL']),
  field: z.string().min(1),
  fieldLabel: z.string().min(1),
  currentValue: z.any().nullable().optional(),
  proposedValue: z.any(),
  evidence: EvidenceSourceSchema,
  reason: z.string().min(1),
  status: ProposalStatusSchema.default('PROPOSED'),
  requiresUserConfirmation: z.literal(true).default(true),
  createdAt: z.string(),
  confirmedAt: z.string().nullable().optional(),
});

/**
 * Profile Conflict Item Schema.
 * When candidate profile and application data or resume claims disagree,
 * the assistant must identify the conflict without choosing one unilaterally.
 */
export const ProfileConflictSchema = z.object({
  field: z.string().min(1),
  fieldLabel: z.string().min(1),
  profileValue: z.any().nullable().optional(),
  applicationValue: z.any().nullable().optional(),
  notes: z.string().min(1),
  resolutionOptions: z
    .array(z.string())
    .default(['KEEP_PROFILE', 'USE_APPLICATION', 'EDIT_PROFILE']),
});

/**
 * Portal Navigation Suggestion Schema.
 */
export const NavigationSuggestionSchema = z.object({
  label: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional(),
});

/**
 * Assistant Conversational Message Schema.
 */
export const AssistantMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  timestamp: z.string(),
  citations: z.array(EvidenceSourceSchema).default([]),
  proposals: z.array(SafeUpdateProposalSchema).default([]),
  conflicts: z.array(ProfileConflictSchema).default([]),
  navigationSuggestions: z.array(NavigationSuggestionSchema).default([]),
  state: z.string().default('SUCCESS'),
  error: z.string().nullable().optional(),
});

/**
 * Safe update payload for submitting user confirmation.
 */
export const ConfirmProposalInputSchema = z.object({
  proposalId: z.string().uuid(),
  confirmedByUser: z.boolean(),
  notes: z.string().optional(),
});

/**
 * Prohibited fields for automatic or unconfirmed mutation.
 * The AI assistant is strictly forbidden from directly updating these fields.
 */
export const PROHIBITED_AUTO_MUTATION_FIELDS = Object.freeze([
  'workAuthorization',
  'visaSponsorshipRequired',
  'skills',
  'experience',
  'education',
  'certifications',
  'salaryFloor',
  'targetSalary',
  'legalDeclarations',
  'applicationSubmission',
]);

/**
 * Standard Portal Routes for AI Assistant Navigation Guidance.
 */
export const CANONICAL_PORTAL_ROUTES = Object.freeze({
  OVERVIEW: { path: '/dashboard', label: 'Dashboard Overview' },
  PROFILE: { path: '/profile', label: 'Profile Workspace' },
  PREFERENCES: { path: '/profile#tab-preferences', label: 'Job Search Preferences' },
  ELIGIBILITY: { path: '/profile#tab-eligibility', label: 'Work Eligibility & Notice' },
  SKILLS: { path: '/skills', label: 'Verified Skills' },
  PROJECTS: { path: '/projects', label: 'Projects & Code Evidence' },
  RESUMES: { path: '/resumes', label: 'Resumes & Claims' },
  RADAR: { path: '/apps/radar', label: 'Job Fit Radar' },
  APPLICATIONS: { path: '/applications', label: 'Job Applications Pipeline' },
  SOURCES: { path: '/sources', label: 'Connected Sources' },
  CONNECT: { path: '/connect', label: 'AI Connect & Tokens' },
});
