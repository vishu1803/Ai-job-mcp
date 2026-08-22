/**
 * @file Canonical Domain Zod Schemas for Career Artifact Export Engine (P6-004)
 *
 * Implements the domain contracts approved in P6-004A (ARCH-020 / ADR-040):
 * - ExportFormatEnum (JSON_RESUME, MARKDOWN, PLAIN_TEXT, CANONICAL_JSON)
 * - CitationStyleEnum (NONE, INLINE, FOOTNOTES, METADATA_ONLY)
 * - ExportLineEndingEnum (LF, CRLF)
 * - ExportEncodingEnum (UTF-8, ASCII)
 * - ExportArtifactTypeEnum (RESUME, COVER_LETTER, PORTFOLIO, CAREER_SUMMARY, UNKNOWN)
 * - ExportPrivacySchema
 * - ExportOptionsSchema
 * - JsonResumeSchema (RFC/jsonresume.org v1.0.0 validator)
 * - ExportedArtifactMetadataSchema
 * - ExportedArtifactSchema
 */

import { z } from 'zod';
import { DateOrIsoStringSchema } from '../candidate/candidate.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const ExportFormatEnum = z.enum(['JSON_RESUME', 'MARKDOWN', 'PLAIN_TEXT', 'CANONICAL_JSON']);

export const CitationStyleEnum = z.enum(['NONE', 'INLINE', 'FOOTNOTES', 'METADATA_ONLY']);

export const ExportLineEndingEnum = z.enum(['LF', 'CRLF']);

export const ExportEncodingEnum = z.enum(['UTF-8', 'ASCII']);

export const ExportArtifactTypeEnum = z.enum([
  'RESUME',
  'COVER_LETTER',
  'PORTFOLIO',
  'CAREER_SUMMARY',
  'UNKNOWN',
]);

// ---------------------------------------------------------------------------
// 2. Privacy & Request Options Schemas
// ---------------------------------------------------------------------------

export const ExportPrivacySchema = z
  .object({
    anonymize: z.boolean().default(false),
    includeUnverifiedClaims: z.boolean().default(true),
    stripInternalIds: z.boolean().default(false),
  })
  .strict();

export const ExportOptionsSchema = z
  .object({
    format: ExportFormatEnum.default('MARKDOWN'),
    citationStyle: CitationStyleEnum.default('NONE'),
    anonymize: z.boolean().default(false),
    includeUnverifiedClaims: z.boolean().default(true),
    stripInternalIds: z.boolean().default(false),
    lineEnding: ExportLineEndingEnum.default('LF'),
    encoding: ExportEncodingEnum.default('UTF-8'),
    fileName: z.string().trim().min(1).max(255).optional(),
    candidateProfile: z.record(z.unknown()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. JSON Resume Standard v1.0.0 Validation Schema
// ---------------------------------------------------------------------------

const JsonResumeLocationSchema = z
  .object({
    address: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    countryCode: z.string().optional().nullable(),
    region: z.string().optional().nullable(),
  })
  .strict();

const JsonResumeProfileSchema = z
  .object({
    network: z.string().optional(),
    username: z.string().optional(),
    url: z.string().optional().nullable(),
  })
  .strict();

const JsonResumeBasicsSchema = z
  .object({
    name: z.string().optional(),
    label: z.string().optional(),
    image: z.string().optional(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    summary: z.string().optional(),
    location: JsonResumeLocationSchema.optional(),
    profiles: z.array(JsonResumeProfileSchema).optional(),
  })
  .strict();

const JsonResumeWorkSchema = z
  .object({
    name: z.string().optional(),
    position: z.string().optional(),
    url: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    highlights: z.array(z.string()).optional(),
  })
  .strict();

const JsonResumeVolunteerSchema = z
  .object({
    organization: z.string().optional(),
    position: z.string().optional(),
    url: z.string().optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    highlights: z.array(z.string()).optional(),
  })
  .strict();

const JsonResumeEducationSchema = z
  .object({
    institution: z.string().optional(),
    url: z.string().optional().nullable(),
    area: z.string().optional().nullable(),
    studyType: z.string().optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    score: z.string().optional().nullable(),
    courses: z.array(z.string()).optional(),
  })
  .strict();

const JsonResumeAwardSchema = z
  .object({
    title: z.string().optional(),
    date: z.string().optional().nullable(),
    awarder: z.string().optional(),
    summary: z.string().optional().nullable(),
  })
  .strict();

const JsonResumeCertificateSchema = z
  .object({
    name: z.string().optional(),
    date: z.string().optional().nullable(),
    issuer: z.string().optional(),
    url: z.string().optional().nullable(),
  })
  .strict();

const JsonResumePublicationSchema = z
  .object({
    name: z.string().optional(),
    publisher: z.string().optional(),
    releaseDate: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
  })
  .strict();

const JsonResumeSkillSchema = z
  .object({
    name: z.string().optional(),
    level: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  })
  .strict();

const JsonResumeLanguageSchema = z
  .object({
    language: z.string().optional(),
    fluency: z.string().optional(),
  })
  .strict();

const JsonResumeInterestSchema = z
  .object({
    name: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  })
  .strict();

const JsonResumeReferenceSchema = z
  .object({
    name: z.string().optional(),
    reference: z.string().optional(),
  })
  .strict();

const JsonResumeProjectSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional().nullable(),
    highlights: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    url: z.string().optional().nullable(),
    roles: z.array(z.string()).optional(),
    entity: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
  })
  .strict();

export const JsonResumeSchema = z
  .object({
    basics: JsonResumeBasicsSchema.optional(),
    work: z.array(JsonResumeWorkSchema).optional(),
    volunteer: z.array(JsonResumeVolunteerSchema).optional(),
    education: z.array(JsonResumeEducationSchema).optional(),
    awards: z.array(JsonResumeAwardSchema).optional(),
    certificates: z.array(JsonResumeCertificateSchema).optional(),
    publications: z.array(JsonResumePublicationSchema).optional(),
    skills: z.array(JsonResumeSkillSchema).optional(),
    languages: z.array(JsonResumeLanguageSchema).optional(),
    interests: z.array(JsonResumeInterestSchema).optional(),
    references: z.array(JsonResumeReferenceSchema).optional(),
    projects: z.array(JsonResumeProjectSchema).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Exported Artifact Output Schemas
// ---------------------------------------------------------------------------

export const ExportedArtifactMetadataSchema = z
  .object({
    artifactType: ExportArtifactTypeEnum,
    format: ExportFormatEnum,
    citationStyle: CitationStyleEnum,
    anonymized: z.boolean(),
    includeUnverifiedClaims: z.boolean(),
    encoding: ExportEncodingEnum,
    lineEnding: ExportLineEndingEnum,
    characterLength: z.number().int().nonnegative(),
    lineCount: z.number().int().nonnegative(),
    byteLength: z.number().int().nonnegative(),
    exportedAt: DateOrIsoStringSchema,
    generatorVersion: z.string().default('v1.0.0'),
  })
  .strict();

export const ExportedArtifactSchema = z
  .object({
    artifactId: z.string().uuid({ message: 'Artifact ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    artifactType: ExportArtifactTypeEnum,
    format: ExportFormatEnum,
    mimeType: z.string().trim().min(1).max(100),
    fileName: z.string().trim().min(1).max(255),
    content: z.string(),
    sha256Checksum: z.string().length(64),
    metadata: ExportedArtifactMetadataSchema,
  })
  .strict();
