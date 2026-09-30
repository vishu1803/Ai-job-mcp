/**
 * @file Schema Definitions for MCP ATS Intelligence Tools (Phase 20)
 *
 * Implements strict Zod contracts for the 5 industry-grade ATS MCP tools:
 * 1. analyze_resume_ats
 * 2. analyze_candidate_job_fit
 * 3. analyze_application_readiness
 * 4. simulate_ats
 * 5. simulate_recruiter_search
 */

import { z } from 'zod';
import { McpRoleEnum } from './mcp.schemas.js';

export const ATS_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

// 1. analyze_resume_ats
export const AnalyzeResumeAtsInputSchema = z
  .object({
    resumeText: z.string().min(50).max(50000),
    targetAts: z
      .enum(['GENERIC', 'WORKDAY', 'GREENHOUSE', 'LEVER', 'ICIMS', 'TALEO'])
      .optional()
      .default('GENERIC'),
  })
  .strict();

export const AnalyzeResumeAtsOutputSchema = z
  .object({
    parseabilityScore: z.number().min(0).max(100),
    targetAts: z.string(),
    targetCompatibility: z.object({
      compatibilityTier: z.string(),
      compatibilityScore: z.number(),
      specificRisks: z.array(z.string()),
    }),
    allProfiles: z.record(z.string(), z.any()),
    extractionSimulation: z.object({
      overallExtractionScore: z.number(),
      confidence: z.number(),
      detectedIssues: z.array(z.any()),
    }),
    summary: z.string(),
  })
  .strict();

// 2. analyze_candidate_job_fit
export const AnalyzeCandidateJobFitInputSchema = z
  .object({
    jobDescription: z.string().min(50).max(50000),
    resumeText: z.string().max(50000).optional(),
    candidateProfile: z.record(z.any()).optional(),
    roleProfile: z.string().optional(),
  })
  .strict();

export const AnalyzeCandidateJobFitOutputSchema = z
  .object({
    fitScore: z.number().min(0).max(100),
    fitBand: z.string(),
    roleProfileApplied: z.string(),
    componentBreakdown: z.record(z.string(), z.number()),
    missingRequirements: z.array(z.string()),
    matchedRequirements: z.array(z.string()),
    explainability: z.object({
      lostPointsTotal: z.number(),
      topRemediationActions: z.array(z.string()),
    }),
    summary: z.string(),
  })
  .strict();

// 3. analyze_application_readiness
export const AnalyzeApplicationReadinessInputSchema = z
  .object({
    jobDescription: z.string().min(50).max(50000),
    resumeText: z.string().max(50000).optional(),
    candidateProfile: z.record(z.any()).optional(),
  })
  .strict();

export const AnalyzeApplicationReadinessOutputSchema = z
  .object({
    readinessScore: z.number().min(0).max(100),
    readinessBand: z.enum(['READY_TO_APPLY', 'APPLY_WITH_CAUTION', 'NOT_READY']),
    recommendation: z.enum(['RECOMMENDED', 'NEEDS_POLISHING', 'DO_NOT_SUBMIT']),
    safetyGateApplied: z.boolean(),
    safetyGateReason: z.string().nullable(),
    scoreBreakdown: z.record(z.string(), z.number()),
    checklist: z.array(
      z.object({
        check: z.string(),
        passed: z.boolean(),
        severity: z.string(),
        recommendation: z.string(),
      })
    ),
    summary: z.string(),
  })
  .strict();

// 4. simulate_ats
export const SimulateAtsInputSchema = z
  .object({
    resumeText: z.string().min(50).max(50000),
  })
  .strict();

export const SimulateAtsOutputSchema = z
  .object({
    extractionScore: z.number().min(0).max(100),
    candidateName: z.string(),
    contactFound: z.boolean(),
    skillsCount: z.number(),
    experiencePositionsCount: z.number(),
    detectedSections: z.array(z.string()),
    parsingPitfalls: z.array(z.string()),
    summary: z.string(),
  })
  .strict();

// 5. simulate_recruiter_search
export const SimulateRecruiterSearchInputSchema = z
  .object({
    query: z.string().min(1).max(500),
    resumeText: z.string().max(50000).optional().default(''),
    candidateSkills: z.array(z.string()).optional().default([]),
  })
  .strict();

export const SimulateRecruiterSearchOutputSchema = z
  .object({
    booleanQuery: z.string(),
    searchFound: z.boolean(),
    coverage: z.number().min(0).max(100),
    matchedKeywords: z.array(z.string()),
    partialKeywords: z.array(z.string()),
    missingKeywords: z.array(z.string()),
    explanation: z.string(),
  })
  .strict();

// =============================================================================
// Tool Catalog Definitions
// =============================================================================

export const ATS_INTELLIGENCE_TOOL_DEFINITIONS = Object.freeze({
  analyze_resume_ats: {
    name: 'analyze_resume_ats',
    description:
      'Parses resume text and assesses ATS parseability, entity extraction risks, and compatibility across 6 major ATS systems (Generic, Workday, Greenhouse, Lever, iCIMS, Taleo).',
    inputSchema: AnalyzeResumeAtsInputSchema,
    outputSchema: AnalyzeResumeAtsOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: ATS_TOOL_ANNOTATIONS,
  },
  analyze_candidate_job_fit: {
    name: 'analyze_candidate_job_fit',
    description:
      'Evaluates candidate qualifications against a job description, computing multi-dimensional fit, role-specific scoring, and lost-point explainability.',
    inputSchema: AnalyzeCandidateJobFitInputSchema,
    outputSchema: AnalyzeCandidateJobFitOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: ATS_TOOL_ANNOTATIONS,
  },
  analyze_application_readiness: {
    name: 'analyze_application_readiness',
    description:
      'Computes the blended Application Readiness Score, evaluating document parseability, job fit, keyword coverage, safety caps, and formal go/no-go recommendation.',
    inputSchema: AnalyzeApplicationReadinessInputSchema,
    outputSchema: AnalyzeApplicationReadinessOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: ATS_TOOL_ANNOTATIONS,
  },
  simulate_ats: {
    name: 'simulate_ats',
    description:
      'Simulates ATS parser entity extraction, identifying unparseable formatting, missing sections, and formatting pitfalls.',
    inputSchema: SimulateAtsInputSchema,
    outputSchema: SimulateAtsOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: ATS_TOOL_ANNOTATIONS,
  },
  simulate_recruiter_search: {
    name: 'simulate_recruiter_search',
    description:
      'Simulates recruiter Boolean search queries against a resume, computing exact and aliased keyword coverage.',
    inputSchema: SimulateRecruiterSearchInputSchema,
    outputSchema: SimulateRecruiterSearchOutputSchema,
    requiredRole: McpRoleEnum.enum.READONLY,
    requiredScopes: ['career:read'],
    annotations: ATS_TOOL_ANNOTATIONS,
  },
});
