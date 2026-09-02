/**
 * @file Schema Definitions for MCP Career Read Tools (P7-004 / ARCH-023)
 *
 * Implements strict Zod validation contracts for the 4 core read-only MCP career tools:
 * 1. get_candidate_profile
 * 2. list_verified_skills
 * 3. inspect_project_evidence
 * 4. analyze_job_fit
 *
 * Enforces output budgets, advisory annotations, and safe response structures.
 */

import { z } from 'zod';
import { McpRoleEnum } from './mcp.schemas.js';
import {
  SkillGapSeverityEnum,
  SkillGapEvidenceTrustEnum,
} from '../career/evidence-matching.schemas.js';

// =============================================================================
// Output Budget Constants
// =============================================================================

export const MAX_PROFILE_OUTPUT_BYTES = 15360; // 15 KB
export const MAX_SKILLS_PAGE_SIZE = 50;
export const DEFAULT_SKILLS_PAGE_SIZE = 20;
export const MAX_EVIDENCE_PAGE_SIZE = 20;
export const DEFAULT_EVIDENCE_PAGE_SIZE = 10;
export const MAX_EVIDENCE_EXCERPT_CHARS = 500;
export const MAX_JOB_DESCRIPTION_CHARS = 20000; // 20 KB
export const MIN_JOB_DESCRIPTION_CHARS = 50;

// =============================================================================
// Advisory Tool Annotations (MCP 2026-07-28 Standard)
// =============================================================================

export const CAREER_READ_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const CAREER_READ_TOOL_COST_METADATA = Object.freeze({
  get_candidate_profile: {
    estimatedCost: 'low',
    expectedLatencyMs: 35,
    externalApiCalls: 0,
    maximumOutputBytes: MAX_PROFILE_OUTPUT_BYTES,
  },
  list_verified_skills: {
    estimatedCost: 'low',
    expectedLatencyMs: 20,
    externalApiCalls: 0,
    maximumOutputBytes: 20480,
  },
  inspect_project_evidence: {
    estimatedCost: 'medium',
    expectedLatencyMs: 40,
    externalApiCalls: 0,
    maximumOutputBytes: 30720,
  },
  analyze_job_fit: {
    estimatedCost: 'high',
    expectedLatencyMs: 120,
    externalApiCalls: 0,
    maximumOutputBytes: 25600,
  },
});

// =============================================================================
// 1. get_candidate_profile Schemas
// =============================================================================

export const GetCandidateProfileInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe(
        'Optional candidate UUID. If omitted, defaults to the candidate persona linked to the authenticated user.'
      ),
    includeExperience: z
      .boolean()
      .default(true)
      .describe('Whether to include structured work experience entries (capped at top 5).'),
    includeProjects: z
      .boolean()
      .default(true)
      .describe('Whether to include highlighted projects (capped at top 5).'),
    includeSkillsSummary: z
      .boolean()
      .default(true)
      .describe('Whether to include verified skills summary (capped at top 15-20 skills).'),
    includeEducation: z
      .boolean()
      .default(true)
      .describe('Whether to include structured education entries (capped at top 5).'),
    includeCertifications: z
      .boolean()
      .default(true)
      .describe('Whether to include professional certifications (capped at top 5).'),
    includeLanguages: z
      .boolean()
      .default(true)
      .describe('Whether to include language proficiencies (capped at top 5).'),
  })
  .strict();

export const GetCandidateProfileOutputSchema = z
  .object({
    candidate: z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      headline: z.string().nullable(),
      summary: z.string().nullable(),
      currentRole: z.string().nullable().optional(),
      currentEmployment: z
        .object({
          title: z.string(),
          company: z.string(),
          employmentType: z.string(),
          startDate: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
      careerStatus: z.string().optional(),
      seniority: z.string().nullable().optional(),
      yearsOfExperience: z.number().nullable().optional(),
      experienceDuration: z
        .object({
          totalMonths: z.number().int().nonnegative(),
          totalYears: z.number().nonnegative(),
          professionalMonths: z.number().int().nonnegative(),
          professionalYears: z.number().nonnegative(),
        })
        .optional(),
      location: z.string().nullable().optional(),
      canonicalEmail: z.string().nullable(),
      status: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      portfolioLinks: z
        .array(
          z.object({
            label: z.string(),
            url: z.string(),
          })
        )
        .optional()
        .default([]),
    }),
    profileCompletenessScore: z.number().min(0).max(100),
    profileCompleteness: z
      .object({
        score: z.number().min(0).max(100),
        status: z.string(),
        isReadyForJobSearch: z.boolean(),
        missingRequiredForSearch: z.array(z.string()).default([]),
        missingOptional: z.array(z.string()).default([]),
        actionableFeedback: z.string(),
      })
      .optional(),
    profileReadiness: z
      .object({
        score: z.number().min(0).max(100),
        status: z.string(),
        isComplete: z.boolean(),
        missingFields: z.array(z.string()).default([]),
        actionableFeedback: z.string(),
      })
      .optional(),
    jobSearchReadiness: z
      .object({
        score: z.number().min(0).max(100),
        status: z.string(),
        isReadyForJobSearch: z.boolean(),
        missingRequiredForSearch: z.array(z.string()).default([]),
        missingOptional: z.array(z.string()).default([]),
        actionableFeedback: z.string(),
      })
      .optional(),
    jobPreferences: z
      .object({
        targetRoles: z.array(z.string()).default([]),
        preferredLocations: z.array(z.string()).default([]),
        remotePreference: z
          .enum(['REMOTE_ONLY', 'REMOTE_FIRST', 'HYBRID', 'ON_SITE', 'FLEXIBLE'])
          .default('FLEXIBLE'),
        employmentTypes: z
          .array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP']))
          .default(['FULL_TIME']),
        salaryFloor: z.number().nullable().default(null),
        salaryCurrency: z.string().default('USD'),
        industries: z.array(z.string()).default([]),
        companiesToAvoid: z.array(z.string()).default([]),
        companiesToPrioritize: z.array(z.string()).default([]),
        preferredTechStack: z.array(z.string()).default([]),
        relocationPreference: z
          .enum(['WILLING_TO_RELOCATE', 'NOT_WILLING', 'REMOTE_ONLY'])
          .default('REMOTE_ONLY'),
      })
      .optional(),
    eligibility: z
      .object({
        workAuthorization: z.array(z.string()).default([]),
        visaSponsorshipRequired: z.boolean().default(false),
        availabilityDate: z.string().nullable().default(null),
      })
      .optional(),
    identities: z.array(
      z.object({
        provider: z.string(),
        externalUsername: z.string().nullable(),
        verified: z.boolean(),
      })
    ),
    connectedResourcesSummary: z.object({
      totalConnected: z.number().int().nonnegative(),
      publicRepositories: z.number().int().nonnegative(),
      privateRepositories: z.number().int().nonnegative(),
    }),
    portfolioLinks: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
        })
      )
      .max(10)
      .optional()
      .default([]),
    topSkills: z
      .array(
        z.object({
          slug: z.string(),
          name: z.string(),
          category: z.string(),
          tier: z.enum(['PRIMARY', 'SIGNAL']).optional(),
          confidenceScore: z.number().min(0).max(1),
          evidenceCount: z.number().int().nonnegative(),
          provenanceStatus: z.enum([
            'VERIFIED',
            'CORROBORATED',
            'INFERRED',
            'CLAIMED',
            'USER_PROVIDED',
          ]),
        })
      )
      .max(20)
      .optional(),
    highlightedProjects: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string(),
          headline: z.string().nullable().optional(),
          role: z.string().nullable().optional(),
          summary: z.string().nullable().optional(),
          technologies: z.array(z.string()).max(15).optional().default([]),
          repositoryUrl: z.string().nullable().optional(),
          bullets: z.array(z.string()).max(3).optional().default([]),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          linkedResourceCount: z.number().int().nonnegative().optional(),
          verifiedSignalCount: z.number().int().nonnegative().optional(),
          provenanceStatus: z
            .enum(['VERIFIED', 'CORROBORATED', 'CLAIMED', 'UNVERIFIED', 'USER_PROVIDED'])
            .optional(),
        })
      )
      .max(5)
      .optional(),
    recentExperience: z
      .array(
        z.object({
          company: z.string(),
          title: z.string(),
          employmentType: z.string().optional(),
          location: z.string().nullable().optional(),
          startDate: z.string().nullable(),
          endDate: z.string().nullable(),
          isCurrent: z.boolean(),
          rawDateRange: z.string().nullable().optional(),
          bullets: z.array(z.string()).max(3).optional().default([]),
          technologies: z.array(z.string()).max(15).optional().default([]),
          verifiedSkillsUsed: z.array(z.string()).max(10).optional().default([]),
          provenanceStatus: z
            .enum(['VERIFIED', 'CLAIMED', 'USER_PROVIDED', 'CORROBORATED'])
            .optional(),
        })
      )
      .max(5)
      .optional(),
    education: z
      .array(
        z.object({
          institution: z.string(),
          degree: z.string().nullable().optional(),
          fieldOfStudy: z.string().nullable().optional(),
          degreeType: z.string().optional(),
          location: z.string().nullable().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          isCurrent: z.boolean().optional().default(false),
          rawDateRange: z.string().nullable().optional(),
          coursework: z.array(z.string()).max(15).optional().default([]),
          gradeOrGpa: z.string().nullable().optional(),
          provenanceStatus: z
            .enum(['VERIFIED', 'CORROBORATED', 'CLAIMED', 'USER_PROVIDED'])
            .optional()
            .default('CLAIMED'),
        })
      )
      .max(5)
      .optional(),
    certifications: z
      .array(
        z.object({
          name: z.string(),
          issuer: z.string().nullable().optional(),
          issueDate: z.string().nullable().optional(),
          expiryDate: z.string().nullable().optional(),
          credentialId: z.string().nullable().optional(),
          credentialUrl: z.string().nullable().optional(),
          provenanceStatus: z.string().optional().default('CLAIMED'),
        })
      )
      .max(5)
      .optional(),
    languages: z
      .array(
        z.object({
          language: z.string(),
          proficiency: z.string().nullable().optional(),
          provenanceStatus: z.string().optional().default('CLAIMED'),
        })
      )
      .max(5)
      .optional(),
    _meta: z
      .object({
        cacheControl: z
          .object({
            cacheScope: z.literal('tenant-private'),
            ttlMs: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// 2. list_verified_skills Schemas
// =============================================================================

export const ListVerifiedSkillsInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. Defaults to authenticated candidate.'),
    category: z
      .string()
      .max(50)
      .optional()
      .describe(
        'Optional category filter (e.g. "LANGUAGES", "BACKEND", "FRONTEND", "DATABASE", "DEVOPS", "SECURITY", "ARCHITECTURE", "TESTING").'
      ),
    minConfidence: z
      .number()
      .min(0.0)
      .max(1.0)
      .default(0.0)
      .describe('Minimum confidence threshold (0.0 to 1.0).'),
    includeEvidenceRefs: z
      .boolean()
      .default(false)
      .describe('Whether to include primary evidence reference identifiers.'),
    page: z
      .number()
      .int()
      .positive()
      .default(1)
      .describe('Page number for pagination (1-indexed).'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_SKILLS_PAGE_SIZE)
      .default(DEFAULT_SKILLS_PAGE_SIZE)
      .describe(`Number of items per page (maximum ${MAX_SKILLS_PAGE_SIZE}).`),
  })
  .strict();

export const ListVerifiedSkillsOutputSchema = z
  .object({
    items: z.array(
      z.object({
        skillId: z.string().uuid(),
        slug: z.string(),
        name: z.string(),
        category: z.string(),
        provenanceStatus: z.enum(['VERIFIED', 'CORROBORATED']),
        confidenceScore: z.number().min(0).max(1),
        evidenceCount: z.number().int().nonnegative(),
        firstObservedAt: z.string().nullable(),
        lastObservedAt: z.string().nullable(),
        primaryEvidence: z
          .object({
            evidenceId: z.string().uuid(),
            evidenceType: z.string(),
            sourceProvider: z.string(),
            resourceId: z.string().uuid().nullable(),
            filePath: z.string().nullable(),
            commitSha: z.string().nullable(),
          })
          .nullable()
          .optional(),
      })
    ),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalCount: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNextPage: z.boolean(),
    }),
    _meta: z
      .object({
        cacheControl: z
          .object({
            cacheScope: z.literal('tenant-private'),
            ttlMs: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// 3. inspect_project_evidence Schemas
// =============================================================================

export const InspectProjectEvidenceInputSchema = z
  .object({
    projectId: z
      .string()
      .uuid('projectId must be a valid UUIDv4')
      .describe('The UUID of the project to inspect.'),
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. Defaults to authenticated candidate.'),
    evidenceType: z
      .enum([
        'PACKAGE_MANIFEST_DEPENDENCY',
        'CODE_IMPORT_USAGE',
        'CODE_USAGE',
        'CONFIG_SYNTAX_DECLARATION',
        'COMMIT_CONTRIBUTION',
        'FILE_PATTERN_MATCH',
        'DIRECTORY_STRUCTURE',
        'README_SPECIFICATION',
      ])
      .optional()
      .describe('Optional filter by evidence extraction type.'),
    skillSlug: z
      .string()
      .max(64)
      .optional()
      .describe(
        'Optional filter by canonical skill slug (e.g. "postgresql", "fastify", "docker").'
      ),
    page: z.number().int().positive().default(1).describe('Page number for evidence pagination.'),
    pageSize: z
      .number()
      .int()
      .min(1)
      .max(MAX_EVIDENCE_PAGE_SIZE)
      .default(DEFAULT_EVIDENCE_PAGE_SIZE)
      .describe(`Evidence items per page (maximum ${MAX_EVIDENCE_PAGE_SIZE}).`),
  })
  .strict();

export const InspectProjectEvidenceOutputSchema = z
  .object({
    project: z.object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      headline: z.string().nullable(),
      summary: z.string().nullable(),
      role: z.string().nullable(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
    linkedResources: z.array(
      z.object({
        id: z.string().uuid(),
        provider: z.string(),
        name: z.string(),
        url: z.string().nullable(),
        isPrivate: z.boolean(),
      })
    ),
    evidenceItems: z.array(
      z.object({
        evidenceId: z.string().uuid(),
        skillSlug: z.string().nullable(),
        skillName: z.string().nullable(),
        evidenceType: z.string(),
        confidenceScore: z.number().min(0).max(1),
        sourceLocation: z.object({
          filePath: z.string().nullable(),
          commitSha: z.string().nullable(),
          lineRange: z.string().nullable(),
        }),
        sanitizedExcerpt: z.string().max(MAX_EVIDENCE_EXCERPT_CHARS),
        detectedAt: z.string(),
      })
    ),
    pagination: z.object({
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
      totalCount: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNextPage: z.boolean(),
    }),
    _meta: z
      .object({
        cacheControl: z
          .object({
            cacheScope: z.literal('tenant-private'),
            ttlMs: z.number().int().positive(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// 4. analyze_job_fit Schemas
// =============================================================================

export const AnalyzeJobFitInputSchema = z
  .object({
    candidateId: z
      .string()
      .uuid('candidateId must be a valid UUIDv4')
      .optional()
      .describe('Optional candidate UUID. Defaults to authenticated candidate.'),
    jobId: z
      .string()
      .uuid('jobId must be a valid UUIDv4')
      .optional()
      .describe('Optional job UUID to resolve existing saved job posting.'),
    jobDescriptionText: z
      .string()
      .min(
        MIN_JOB_DESCRIPTION_CHARS,
        `Job description must contain at least ${MIN_JOB_DESCRIPTION_CHARS} characters`
      )
      .max(
        MAX_JOB_DESCRIPTION_CHARS,
        `Job description must not exceed ${MAX_JOB_DESCRIPTION_CHARS} characters (${MAX_JOB_DESCRIPTION_CHARS / 1000} KB budget)`
      )
      .optional()
      .describe('Raw textual job description or posting to analyze against candidate profile.'),
    jobTitle: z
      .string()
      .max(100)
      .optional()
      .describe('Optional job title for contextual parsing (e.g. "Senior Backend Engineer").'),
    companyName: z.string().max(100).optional().describe('Optional hiring company name.'),
    targetRoleLevel: z
      .enum(['INTERN', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'LEAD', 'PRINCIPAL', 'DIRECTOR'])
      .optional()
      .describe('Target seniority level override.'),
    maxRecommendedProjects: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe('Maximum number of top-ranked relevant projects to return (maximum 5).'),
    maxSkillGaps: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe('Maximum number of prioritized skill gaps to return (maximum 10).'),
  })
  .strict()
  .refine(
    (data) => data.jobId || data.jobDescriptionText,
    'Either jobId or jobDescriptionText must be provided'
  );

export const AnalyzeJobFitOutputSchema = z
  .object({
    jobContext: z.object({
      jobId: z.string().uuid().nullable().optional(),
      externalJobId: z.string().nullable().optional(),
      provider: z.string().nullable().optional(),
      company: z.string().nullable().optional(),
      extractedTitle: z.string().nullable(),
      extractedLevel: z.string().nullable(),
      totalRequirementsIdentified: z.number().int().nonnegative(),
      sourceUrl: z.string().nullable().optional(),
      applicationUrl: z.string().nullable().optional(),
    }),
    overallFit: z.object({
      atsScore: z.number().min(0).max(100).nullable(),
      matchGrade: z.enum([
        'EXCELLENT',
        'STRONG',
        'GOOD',
        'MODERATE',
        'WEAK',
        'LOW',
        'INSUFFICIENT_DATA',
      ]),
      analysisStatus: z.enum(['COMPLETE', 'INSUFFICIENT_DATA', 'DEGRADED']).default('COMPLETE'),
      isFallbackScore: z.boolean().default(false),
      zeroRequirementWarning: z.string().nullable().optional().default(null),
      fitSummary: z.string(),
      scoreBreakdown: z.object({
        requiredSkillsScore: z.number(),
        preferredSkillsScore: z.number(),
        projectRelevanceScore: z.number(),
        experienceFitScore: z.number(),
        educationFitScore: z.number(),
        locationFitScore: z.number(),
        evidenceConfidenceScore: z.number(),
        rawScore: z.number().optional(),
        scoreCap: z.number().nullable().optional(),
        isCapped: z.boolean().optional(),
        criticalGapCount: z.number().int().nonnegative().optional(),
        highGapCount: z.number().int().nonnegative().optional(),
        explanation: z.any().nullable().optional(),
        experienceFit: z
          .object({
            status: z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN', 'NOT_APPLICABLE']),
            explanation: z.string(),
          })
          .optional(),
        educationFit: z
          .object({
            status: z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN', 'NOT_APPLICABLE']),
            explanation: z.string(),
          })
          .optional(),
        locationFit: z
          .object({
            status: z.enum([
              'MATCHED',
              'PARTIAL',
              'MISSING',
              'MISMATCH',
              'UNKNOWN',
              'NOT_APPLICABLE',
            ]),
            explanation: z.string(),
          })
          .optional(),
      }),
    }),
    requirementSummary: z.object({
      matchedCount: z.number().int().nonnegative(),
      partialCount: z.number().int().nonnegative(),
      missingCount: z.number().int().nonnegative(),
      unknownCount: z.number().int().nonnegative(),
      keyMatchedSkills: z.array(z.string()).max(10),
      keyMissingSkills: z.array(z.string()).max(10),
    }),
    requirementMatches: z
      .array(
        z.object({
          requirementId: z.string().optional(),
          originalRequirement: z.string(),
          normalizedRequirement: z.string(),
          category: z.string(),
          required: z.boolean(),
          matchStatus: z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNKNOWN']),
          candidateSkills: z.array(z.string()).default([]),
          candidateProvenance: z
            .enum(['VERIFIED', 'CORROBORATED', 'CLAIMED', 'NONE', 'INFERRED', 'USER_PROVIDED'])
            .default('NONE'),
          provenanceTrustClass: z.string().optional(),
          matchConfidence: z.number().min(0).max(1).optional(),
          primaryEvidence: z.any().nullable().optional(),
          supportingEvidence: z.array(z.any()).default([]),
          explanation: z.string(),
        })
      )
      .optional(),
    topRelevantProjects: z
      .array(
        z.object({
          projectId: z.string().uuid(),
          projectName: z.string(),
          relevanceScore: z.number().min(0).max(100),
          relevanceRank: z.number().int().positive(),
          matchedRequirements: z.array(z.any()).max(5),
          matchedArchitecturalDimensions: z.array(z.string()).max(10),
          scoreBreakdown: z.any().nullable().optional(),
          summary: z.string().nullable(),
          supportingEvidence: z.array(z.any()).optional().default([]),
        })
      )
      .max(5),
    prioritizedSkillGaps: z
      .array(
        z
          .object({
            skillSlug: z.string(),
            skillName: z.string(),
            category: z.string(),
            // Actionability axis (client-facing ranking).
            priority: z.enum(['CRITICAL', 'IMPORTANT', 'NICE_TO_HAVE']),
            // Reason-category axis — why the gap exists.
            severity: SkillGapSeverityEnum,
            // Evidence-trust axis — trust state of the backing evidence.
            // Kept strictly separate from `severity`; `LOW_TRUST` here plus
            // severity=INSUFFICIENT_EVIDENCE is how low-trust (vendored,
            // generated, node_modules) evidence is represented.
            evidenceTrust: SkillGapEvidenceTrustEnum.default('NO_EVIDENCE'),
            remediationAdvice: z.string(),
          })
          .strict()
      )
      .max(10),
    evidenceBacking: z.object({
      verifiedSkillsCount: z.number().int().nonnegative(),
      totalEvidenceItemsCited: z.number().int().nonnegative(),
    }),
    _meta: z
      .object({
        cacheControl: z
          .object({
            cacheScope: z.literal('tenant-private'),
            ttlMs: z.number().int().positive(),
          })
          .optional(),
        ui: z
          .object({
            resourceUri: z.string(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

// =============================================================================
// Tool Catalog Definitions (Ready for McpServer Registration)
// =============================================================================

export const CAREER_READ_TOOL_DEFINITIONS = Object.freeze({
  get_candidate_profile: {
    name: 'get_candidate_profile',
    description:
      'Retrieves a high-level candidate profile summary, verified skills rollup, highlighted projects, and work experience.',
    inputSchema: GetCandidateProfileInputSchema,
    outputSchema: GetCandidateProfileOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_READ_TOOL_ANNOTATIONS,
  },
  list_verified_skills: {
    name: 'list_verified_skills',
    description:
      'Lists paginated candidate skills verified by code repository evidence with confidence scores and evidence counts.',
    inputSchema: ListVerifiedSkillsInputSchema,
    outputSchema: ListVerifiedSkillsOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_READ_TOOL_ANNOTATIONS,
  },
  inspect_project_evidence: {
    name: 'inspect_project_evidence',
    description:
      'Inspects detailed repository evidence, commit SHAs, file paths, and sanitized code excerpts for a specific candidate project.',
    inputSchema: InspectProjectEvidenceInputSchema,
    outputSchema: InspectProjectEvidenceOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_READ_TOOL_ANNOTATIONS,
  },
  analyze_job_fit: {
    name: 'analyze_job_fit',
    description:
      'Analyzes candidate profile against a job description text, producing ATS fit score, requirement matches, and ranked project recommendations.',
    inputSchema: AnalyzeJobFitInputSchema,
    outputSchema: AnalyzeJobFitOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: CAREER_READ_TOOL_ANNOTATIONS,
    _meta: {
      ui: {
        resourceUri: 'ui://career-hub/job-fit-radar/v1',
      },
    },
  },
});
