/**
 * @file Canonical Candidate Profile Schema (Phase 3 - ATS Canonical Parsing Layer)
 *
 * Implements the universal, canonical candidate profile contract.
 * One canonical representation feeds all downstream intelligence engines:
 * - Keyword coverage
 * - Job fit scoring
 * - Experience analysis
 * - Project analysis
 * - Quality analysis
 * - ATS simulation
 * - Tailoring
 * - Application handoff
 */

import { z } from 'zod';
import { SafeSlugSchema, ConfidenceScoreSchema } from '../candidate/candidate.schemas.js';

export const CANONICAL_PROFILE_SCHEMA_VERSION = '1.0.0';

export const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'FOUNDER',
  'OPEN_SOURCE',
  'ACADEMIC',
  'PERSONAL',
  'OTHER',
]);

export const ProjectComplexityLevelEnum = z.enum([
  'TUTORIAL',
  'BASIC_CRUD',
  'UTILITY',
  'INTERMEDIATE',
  'ADVANCED',
  'PRODUCTION_GRADE',
]);

export const OpenSourceRoleEnum = z.enum([
  'MAINTAINER',
  'CORE_CONTRIBUTOR',
  'EXTERNAL_CONTRIBUTOR',
  'ORGANIZATION_MEMBER',
]);

// ---------------------------------------------------------------------------
// 1. Identity & Contact Information
// ---------------------------------------------------------------------------

export const CanonicalLinksSchema = z
  .object({
    github: z.string().trim().url().nullable().optional(),
    linkedin: z.string().trim().url().nullable().optional(),
    portfolio: z.string().trim().url().nullable().optional(),
    website: z.string().trim().url().nullable().optional(),
    other: z
      .array(
        z.object({
          label: z.string().trim().min(1),
          url: z.string().trim().url(),
        })
      )
      .default([]),
  })
  .strict();

export const CanonicalContactSchema = z
  .object({
    email: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    city: z.string().trim().nullable().optional(),
    state: z.string().trim().nullable().optional(),
    country: z.string().trim().nullable().optional(),
    postalCode: z.string().trim().nullable().optional(),
  })
  .strict();

export const CanonicalIdentitySchema = z
  .object({
    name: z.string().trim().min(1, { message: 'Candidate name is required' }).max(255),
    headline: z.string().trim().max(500).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    workAuthorization: z.string().trim().max(255).nullable().optional(),
    contact: CanonicalContactSchema.default({}),
    links: CanonicalLinksSchema.default({}),
  })
  .strict();

// ---------------------------------------------------------------------------
// 2. Summary & Highlights
// ---------------------------------------------------------------------------

export const CanonicalSummarySchema = z
  .object({
    text: z.string().trim().default(''),
    rawText: z.string().trim().default(''),
    yearsOfExperience: z.number().nonnegative().nullable().optional(),
    highlightedAreas: z.array(z.string().trim()).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Technical & Professional Skills
// ---------------------------------------------------------------------------

export const CanonicalSkillItemSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
    slug: SafeSlugSchema.optional(),
    category: z
      .enum([
        'LANGUAGE',
        'FRAMEWORK',
        'DATABASE',
        'CLOUD_DEVOPS',
        'TOOL',
        'ARCHITECTURE',
        'CONCEPT',
        'OTHER',
      ])
      .default('OTHER'),
    yearsOfExperience: z.number().nonnegative().nullable().optional(),
    lastUsed: z.string().trim().nullable().optional(),
    context: z.string().trim().nullable().optional(),
    confidence: ConfidenceScoreSchema.default(1.0),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Professional Experience
// ---------------------------------------------------------------------------

export const CanonicalExperienceEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    company: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(255),
    employmentType: EmploymentTypeEnum.default('FULL_TIME'),
    location: z.string().trim().max(255).nullable().optional(),
    startDate: z.string().trim().min(1),
    endDate: z.string().trim().nullable().optional(),
    isCurrent: z.boolean().default(false),
    durationMonths: z.number().int().nonnegative().default(0),
    responsibilities: z.array(z.string().trim()).default([]),
    technologies: z.array(z.string().trim()).default([]),
    bullets: z.array(z.string().trim()).default([]),
    scale: z.string().trim().nullable().optional(),
    impact: z.string().trim().nullable().optional(),
    leadership: z.string().trim().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Education
// ---------------------------------------------------------------------------

export const CanonicalEducationEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    institution: z.string().trim().min(1).max(255),
    degree: z.string().trim().min(1).max(255),
    fieldOfStudy: z.string().trim().max(255).nullable().optional(),
    startDate: z.string().trim().nullable().optional(),
    endDate: z.string().trim().nullable().optional(),
    graduationYear: z.number().int().positive().nullable().optional(),
    gpa: z.string().trim().nullable().optional(),
    honors: z.array(z.string().trim()).default([]),
    bullets: z.array(z.string().trim()).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Technical Projects
// ---------------------------------------------------------------------------

export const CanonicalProjectEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().nullable().optional(),
    role: z.string().trim().nullable().optional(),
    technologies: z.array(z.string().trim()).default([]),
    url: z.string().trim().url().nullable().optional(),
    githubUrl: z.string().trim().url().nullable().optional(),
    bullets: z.array(z.string().trim()).default([]),
    projectType: z
      .enum(['APPLICATION', 'LIBRARY', 'TOOL', 'RESEARCH', 'OPEN_SOURCE', 'TUTORIAL', 'OTHER'])
      .default('APPLICATION'),
    complexityLevel: ProjectComplexityLevelEnum.default('INTERMEDIATE'),
  })
  .strict();

// ---------------------------------------------------------------------------
// 7. Open Source Contributions
// ---------------------------------------------------------------------------

export const CanonicalOpenSourceContributionSchema = z
  .object({
    id: z.string().trim().min(1),
    repository: z.string().trim().min(1),
    organization: z.string().trim().nullable().optional(),
    role: OpenSourceRoleEnum.default('EXTERNAL_CONTRIBUTOR'),
    prUrl: z.string().trim().url().nullable().optional(),
    issueUrl: z.string().trim().url().nullable().optional(),
    description: z.string().trim().min(1),
    technologies: z.array(z.string().trim()).default([]),
    starsCount: z.number().int().nonnegative().nullable().optional(),
    mergedPrCount: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 8. Certifications
// ---------------------------------------------------------------------------

export const CanonicalCertificationEntrySchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
    issuingOrganization: z.string().trim().min(1).max(255),
    issueDate: z.string().trim().nullable().optional(),
    expirationDate: z.string().trim().nullable().optional(),
    credentialId: z.string().trim().nullable().optional(),
    credentialUrl: z.string().trim().url().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 9. Publications & Achievements
// ---------------------------------------------------------------------------

export const CanonicalPublicationSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().nullable().optional(),
    date: z.string().trim().nullable().optional(),
    url: z.string().trim().url().nullable().optional(),
    authors: z.array(z.string().trim()).default([]),
    summary: z.string().trim().nullable().optional(),
  })
  .strict();

export const CanonicalAchievementSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(500),
    date: z.string().trim().nullable().optional(),
    description: z.string().trim().min(1),
    category: z.string().trim().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 10. Source Artifact & Audit Quality Metadata
// ---------------------------------------------------------------------------

export const SourceArtifactMetadataSchema = z
  .object({
    format: z.enum(['PDF', 'DOCX', 'TXT', 'MARKDOWN']),
    fileName: z.string().trim().min(1),
    fileSizeBytes: z.number().int().nonnegative(),
    sha256: z.string().trim().min(1),
    parsedAt: z.string().trim().min(1),
  })
  .strict();

export const ArtifactQualityAuditSchema = z
  .object({
    parseabilityScore: z.number().min(0).max(100),
    qualityStatus: z.enum(['PASS', 'WARNING', 'FAIL']),
    issues: z.array(z.string().trim()).default([]),
  })
  .strict();

export const CanonicalParseMetadataSchema = z
  .object({
    parserVersion: z.string().trim().min(1),
    extractionConfidence: ConfidenceScoreSchema,
    warnings: z.array(z.string().trim()).default([]),
    unrecognizedSections: z.array(z.string().trim()).default([]),
    rawSectionCount: z.number().int().nonnegative().default(0),
  })
  .strict();

// ---------------------------------------------------------------------------
// 11. Canonical Candidate Profile (Universal Master Contract)
// ---------------------------------------------------------------------------

export const CanonicalCandidateProfileSchema = z
  .object({
    schemaVersion: z.string().default(CANONICAL_PROFILE_SCHEMA_VERSION),
    tenantId: z.string().uuid().optional(),
    candidateId: z.string().uuid().optional(),
    sourceArtifact: SourceArtifactMetadataSchema,
    artifactQuality: ArtifactQualityAuditSchema,
    identity: CanonicalIdentitySchema,
    summary: CanonicalSummarySchema,
    skills: z.array(CanonicalSkillItemSchema).default([]),
    experience: z.array(CanonicalExperienceEntrySchema).default([]),
    education: z.array(CanonicalEducationEntrySchema).default([]),
    projects: z.array(CanonicalProjectEntrySchema).default([]),
    openSourceContributions: z.array(CanonicalOpenSourceContributionSchema).default([]),
    certifications: z.array(CanonicalCertificationEntrySchema).default([]),
    publications: z.array(CanonicalPublicationSchema).default([]),
    achievements: z.array(CanonicalAchievementSchema).default([]),
    parseMetadata: CanonicalParseMetadataSchema,
  })
  .strict();
