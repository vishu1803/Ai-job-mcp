/**
 * @file Requirement Semantics Schemas (Phase 10 - Requirement Semantics)
 *
 * Implements expanded requirement classification, gating, and Boolean operators:
 * - Importance: REQUIRED, PREFERRED, NICE_TO_HAVE, CONDITIONAL, LOCATION_GATED,
 *   AUTHORIZATION_GATED, EXPERIENCE_GATED, EDUCATION_GATED, CERTIFICATION_GATED, OPTIONAL
 * - Operators: AND, OR, EQUIVALENT, NONE
 * - Requirement Groups (e.g. React AND JavaScript vs React OR Vue)
 */

import { z } from 'zod';
import { SafeSlugSchema } from '../candidate/candidate.schemas.js';

export const ExtendedRequirementImportanceEnum = z.enum([
  'REQUIRED',
  'PREFERRED',
  'NICE_TO_HAVE',
  'CONDITIONAL',
  'LOCATION_GATED',
  'AUTHORIZATION_GATED',
  'EXPERIENCE_GATED',
  'EDUCATION_GATED',
  'CERTIFICATION_GATED',
  'OPTIONAL',
]);

export const RequirementLogicalOperatorEnum = z.enum(['AND', 'OR', 'EQUIVALENT', 'NONE']);

export const SemanticRequirementItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    slug: SafeSlugSchema.optional(),
    importance: ExtendedRequirementImportanceEnum.default('REQUIRED'),
    category: z.enum([
      'SKILL',
      'EXPERIENCE',
      'EDUCATION',
      'DOMAIN',
      'LOCATION',
      'ELIGIBILITY',
      'CERTIFICATION',
      'OTHER',
    ]).default('SKILL'),
    allowsEquivalent: z.boolean().default(false),
    approvedEquivalents: z.array(z.string().trim()).default([]),
    weight: z.number().nonnegative().default(1.0),
  })
  .strict();

export const RequirementGroupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    operator: RequirementLogicalOperatorEnum.default('AND'),
    requirements: z.array(SemanticRequirementItemSchema).min(1),
    minMatchesRequired: z.number().int().positive().default(1),
    explanation: z.string().optional(),
  })
  .strict();

export const GroupMatchEvaluationSchema = z
  .object({
    groupId: z.string(),
    groupName: z.string(),
    operator: RequirementLogicalOperatorEnum,
    status: z.enum(['MATCHED', 'PARTIAL', 'MISSING', 'UNSATISFIED_GATE']),
    earnedScoreRatio: z.number().min(0).max(1.0),
    matchedRequirements: z.array(z.string()),
    missingRequirements: z.array(z.string()),
    reason: z.string(),
  })
  .strict();
