/**
 * @file Canonical Domain Zod Schemas for Cover Letter Drafting (P6-002)
 *
 * Implements domain contracts approved in ARCH-018 / ADR-038:
 * - CoverLetterToneEnum (PROFESSIONAL, CONCISE, CONFIDENT, WARM)
 * - CoverLetterParagraphTypeEnum (OPENING, COMPANY_ALIGNMENT, RELEVANT_EXPERIENCE, PROJECT_EVIDENCE, MOTIVATION, CLOSING)
 * - CoverLetterParagraphSchema
 * - CoverLetterMetadataSchema
 * - TailoredCoverLetterSchema
 * - CoverLetterDraftRequestSchema
 */

import { z } from 'zod';
import { ConfidenceScoreSchema, DateOrIsoStringSchema } from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';
import { CareerAssertionStatusEnum, IntegrityStatusEnum } from './integrity-gate.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const CoverLetterToneEnum = z.enum(['PROFESSIONAL', 'CONCISE', 'CONFIDENT', 'WARM']);

export const CoverLetterParagraphTypeEnum = z.enum([
  'OPENING',
  'COMPANY_ALIGNMENT',
  'RELEVANT_EXPERIENCE',
  'PROJECT_EVIDENCE',
  'MOTIVATION',
  'CLOSING',
]);

// ---------------------------------------------------------------------------
// 2. Cover Letter Paragraph Schema
// ---------------------------------------------------------------------------

export const CoverLetterParagraphSchema = z
  .object({
    id: z.string().uuid({ message: 'Paragraph ID must be a valid UUID' }),
    paragraphType: CoverLetterParagraphTypeEnum,
    text: z.string().trim().min(1).max(3000),
    assertionIds: z.array(z.string().uuid()).default([]),
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
    status: CareerAssertionStatusEnum.default('VERIFIED'),
    confidenceScore: ConfidenceScoreSchema.default(1.0),
    relevanceScore: z.number().min(0).max(100).default(0.0),
    matchedKeywords: z.array(z.string().trim()).default([]),
    claimLabel: z.string().trim().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Cover Letter Metadata Schema
// ---------------------------------------------------------------------------

export const CoverLetterMetadataSchema = z
  .object({
    generatedAt: DateOrIsoStringSchema,
    sourceCandidateVersion: DateOrIsoStringSchema.optional(),
    sourceJobVersion: DateOrIsoStringSchema.optional(),
    assertionSetId: z.string().uuid().nullable().optional(),
    generatorVersion: z.string().default('v1.0.0'),
    tone: CoverLetterToneEnum.default('PROFESSIONAL'),
    totalParagraphs: z.number().int().min(3).max(6).default(4),
    verifiedParagraphs: z.number().int().nonnegative().default(0),
    inferredParagraphs: z.number().int().nonnegative().default(0),
    claimedParagraphs: z.number().int().nonnegative().default(0),
    omittedSkillsCount: z.number().int().nonnegative().default(0),
    wordCount: z.number().int().nonnegative().default(0),
    characterCount: z.number().int().nonnegative().default(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Request Configuration Schema
// ---------------------------------------------------------------------------

export const CoverLetterDraftRequestSchema = z
  .object({
    tone: CoverLetterToneEnum.default('PROFESSIONAL').optional(),
    targetParagraphCount: z.number().int().min(3).max(6).default(4).optional(),
    preferredProjectIds: z.array(z.string().uuid()).optional(),
    recipientName: z.string().trim().max(255).optional(),
    llmAdapter: z.record(z.any()).optional(),
    letterId: z.string().uuid().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Root Tailored Cover Letter Schema
// ---------------------------------------------------------------------------

export const TailoredCoverLetterSchema = z
  .object({
    letterId: z.string().uuid({ message: 'Letter ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    targetJobId: z.string().uuid({ message: 'Target Job ID must be a valid UUID' }),
    recipientName: z.string().trim().max(255).nullable().optional(),
    companyName: z.string().trim().min(1).max(255),
    roleTitle: z.string().trim().min(1).max(255),
    paragraphs: z
      .array(CoverLetterParagraphSchema)
      .min(3, { message: 'Cover letter must contain at least 3 paragraphs' })
      .max(6, { message: 'Cover letter must contain at most 6 paragraphs' }),
    overallFitScore: z.number().min(0).max(100).default(0.0),
    integrityStatus: IntegrityStatusEnum.default('PASS'),
    metadata: CoverLetterMetadataSchema,
  })
  .strict();
