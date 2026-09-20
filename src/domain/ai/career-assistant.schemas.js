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
 * Valid Copilot Page Contexts (P90 Strict Enum).
 */
export const COPILOT_PAGE_CONTEXTS = Object.freeze([
  'dashboard',
  'profile',
  'jobs',
  'applications',
  'resumes',
  'sources',
]);

export const CopilotPageContextSchema = z.enum([
  'dashboard',
  'profile',
  'jobs',
  'applications',
  'resumes',
  'sources',
]);

/**
 * Normalizes any route path, URL string, or legacy context alias to exactly one of the six
 * canonical Career Copilot page contexts:
 * 'dashboard' | 'profile' | 'jobs' | 'applications' | 'resumes' | 'sources'.
 *
 * Route normalization mapping:
 * - /apps/radar, radar, job, /jobs, /jobs/:id, /job/* -> 'jobs'
 * - /applications, /applications/:id, application, /apply, /handoff -> 'applications'
 * - /profile, /profile#*, preferences, eligibility -> 'profile'
 * - /resumes, /resumes/:id, resume -> 'resumes'
 * - /sources, /sources/*, source -> 'sources'
 * - /dashboard, dashboard, home, overview, / -> 'dashboard'
 * - Any unrecognized or missing context -> 'dashboard'
 *
 * @param {string} [rawContextOrPath='']
 * @returns {'dashboard'|'profile'|'jobs'|'applications'|'resumes'|'sources'}
 */
export function normalizeCopilotPageContext(rawContextOrPath) {
  if (!rawContextOrPath || typeof rawContextOrPath !== 'string') {
    return 'dashboard';
  }

  const clean = rawContextOrPath.trim().toLowerCase().split('?')[0].split('#')[0];

  // Direct canonical match
  if (COPILOT_PAGE_CONTEXTS.includes(clean)) {
    return clean;
  }

  // Jobs / Radar routes and legacy aliases
  if (
    clean === 'radar' ||
    clean === 'job' ||
    clean === 'jobs' ||
    clean.includes('radar') ||
    clean.startsWith('/apps/radar') ||
    clean.startsWith('/jobs') ||
    clean.startsWith('/job')
  ) {
    return 'jobs';
  }

  // Applications / Apply / Handoff routes and legacy aliases
  if (
    clean === 'application' ||
    clean === 'applications' ||
    clean.startsWith('/applications') ||
    clean.startsWith('/application') ||
    clean.startsWith('/apply') ||
    clean.startsWith('/handoff')
  ) {
    return 'applications';
  }

  // Profile routes and aliases
  if (
    clean === 'profile' ||
    clean.startsWith('/profile') ||
    clean === 'preferences' ||
    clean === 'eligibility'
  ) {
    return 'profile';
  }

  // Resumes routes and aliases
  if (
    clean === 'resume' ||
    clean === 'resumes' ||
    clean.startsWith('/resumes') ||
    clean.startsWith('/resume')
  ) {
    return 'resumes';
  }

  // Sources routes and aliases
  if (
    clean === 'source' ||
    clean === 'sources' ||
    clean.startsWith('/sources') ||
    clean.startsWith('/source')
  ) {
    return 'sources';
  }

  // Dashboard / home / root / overview aliases
  if (
    clean === 'dashboard' ||
    clean === 'home' ||
    clean === 'overview' ||
    clean.startsWith('/dashboard') ||
    clean === '/'
  ) {
    return 'dashboard';
  }

  return 'dashboard';
}

/**
 * Supported Product Action IDs (P90 Strict Allowlist).
 * The model must NEVER output executable routes or URLs directly.
 */
export const SUPPORTED_PRODUCT_ACTION_IDS = Object.freeze([
  'complete_profile',
  'review_sources',
  'check_readiness',
  'review_resume',
  'view_matching_jobs',
  'review_applications',
  'tailor_resume',
]);

export const SupportedProductActionIdSchema = z.enum([
  'complete_profile',
  'review_sources',
  'check_readiness',
  'review_resume',
  'view_matching_jobs',
  'review_applications',
  'tailor_resume',
]);

/**
 * Finding severity classification.
 */
export const StructuredFindingSeveritySchema = z.enum(['critical', 'warning', 'info']);

/**
 * Structured Finding Item.
 */
export const StructuredAssistantFindingSchema = z
  .object({
    severity: StructuredFindingSeveritySchema.default('info'),
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
  })
  .strict();

/**
 * Structured Action Item.
 * Must NOT contain arbitrary URLs, routes, or href fields.
 */
export const StructuredAssistantActionSchema = z
  .object({
    id: SupportedProductActionIdSchema,
    label: z.string().min(1).max(60),
    primary: z.boolean().optional(),
  })
  .strict();

/**
 * Structured AI Response Contract (P90 Schema).
 * Summary: 1–2 sentences maximum.
 * Findings: Maximum 5 items.
 * Actions: Maximum 3 items (at most 1 primary action).
 */
export const StructuredAssistantResponseSchema = z
  .object({
    summary: z.string().min(1).max(350),
    findings: z.array(StructuredAssistantFindingSchema).max(5).default([]),
    actions: z.array(StructuredAssistantActionSchema).max(3).default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    const primaryCount = data.actions.filter((a) => a.primary === true).length;
    if (primaryCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maximum of one primary action allowed.',
        path: ['actions'],
      });
    }
  });

/**
 * Trusted Action Navigation Map.
 * Application code strictly maps trusted action IDs to client routes.
 */
export const TRUSTED_ACTION_NAVIGATION_MAP = Object.freeze({
  complete_profile: { path: '/profile', label: 'Complete profile' },
  review_sources: { path: '/sources', label: 'Review sources' },
  check_readiness: { path: '/profile#eligibility', label: 'Check readiness' },
  review_resume: { path: '/resumes', label: 'Review resume' },
  view_matching_jobs: { path: '/apps/radar', label: 'View matching jobs' },
  review_applications: { path: '/applications', label: 'Review applications' },
  tailor_resume: { path: '/resumes', label: 'Tailor resume' },
});

/**
 * Portal Navigation Suggestion Schema (QUARANTINED LEGACY CONTRACT).
 *
 * @deprecated QUARANTINED: Legacy AI navigation contract that allowed arbitrary paths.
 * Career Copilot strictly enforces:
 * AI action ID -> TRUSTED_ACTION_NAVIGATION_MAP -> frontend route.
 * The model must NEVER output arbitrary url, href, route, or path strings.
 * Preserved strictly for backward-compatibility with archived message records.
 */
export const NavigationSuggestionSchema = z
  .object({
    label: z.string().min(1),
    path: z.string().min(1),
    description: z.string().optional(),
  })
  .strict();

/**
 * Assistant Conversational Message Schema.
 */
export const AssistantMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  structuredResponse: StructuredAssistantResponseSchema.nullable().optional(),
  timestamp: z.string(),
  citations: z.array(EvidenceSourceSchema).default([]),
  proposals: z.array(SafeUpdateProposalSchema).default([]),
  conflicts: z.array(ProfileConflictSchema).default([]),
  /** @deprecated Quarantined legacy navigation suggestions. Copilot navigation uses structuredResponse.actions */
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
