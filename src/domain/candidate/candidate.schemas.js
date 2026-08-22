/**
 * @file Canonical Domain Zod Schemas for Candidate, Skills, Projects, and Evidence
 *
 * Implements the domain contracts approved in P4-001A (ARCH-007 / ADR-027):
 * 1. CandidateProfileSchema
 * 2. CandidateIdentitySchema
 * 3. SkillSchema & SkillWithEvidenceSchema
 * 4. ProjectSchema & ProjectEvidenceSchema
 * 5. ResourceSummarySchema
 * 6. EvidenceSourceLocationSchema
 * 7. EvidenceNodeSchema
 *
 * Strict validation rules:
 * - Strict object boundaries preventing accidental secret or provider payload propagation
 * - Bounded metadata objects
 * - POSIX path traversal rejection
 * - Secret/PII-safe 1024-character excerpt bounds
 * - Decimal confidence scores [0.00, 1.00]
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. Domain Enumerations
// ---------------------------------------------------------------------------

export const CandidateStatusEnum = z.enum(['ACTIVE', 'ARCHIVED', 'SUSPENDED']);

export const ResourceProviderEnum = z.enum([
  'GITHUB_APP',
  'GITLAB',
  'LINKEDIN',
  'GOOGLE',
  'MANUAL',
  'GOOGLE_DRIVE',
  'ONEDRIVE',
  'NOTION',
  'CUSTOM_API',
]);

export const ResourceTypeEnum = z.enum(['REPOSITORY', 'DOCUMENT', 'PROFILE', 'PORTFOLIO_SITE']);

export const ResourceStatusEnum = z.enum(['ACTIVE', 'DISCONNECTED', 'DELETED', 'ERROR']);

export const SkillCategoryEnum = z.enum([
  'LANGUAGE',
  'FRAMEWORK',
  'DATABASE',
  'CLOUD_DEVOPS',
  'TOOL',
  'ARCHITECTURE',
  'CONCEPT',
]);

export const ProvenanceStatusEnum = z.enum(['VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING']);

export const EvidenceTypeEnum = z.enum([
  'PACKAGE_MANIFEST_DEPENDENCY',
  'CODE_IMPORT_USAGE',
  'FILE_PATTERN_MATCH',
  'COMMIT_CONTRIBUTION',
  'README_SPECIFICATION',
  'DIRECTORY_STRUCTURE',
  'DOCUMENT_CLAIM',
]);

// ---------------------------------------------------------------------------
// 2. Common & Security-Hardened Primitives
// ---------------------------------------------------------------------------

/**
 * Validates dates accepted either as native Date objects or ISO 8601 strings.
 */
export const DateOrIsoStringSchema = z.union([
  z.date(),
  z.string().refine(
    (val) => {
      const parsed = Date.parse(val);
      return !Number.isNaN(parsed);
    },
    { message: 'Must be a valid ISO 8601 date string' }
  ),
]);

/**
 * Normalized confidence score strictly bounded between 0.00 and 1.00.
 */
export const ConfidenceScoreSchema = z
  .number()
  .min(0, { message: 'Confidence score must be greater than or equal to 0.0' })
  .max(1, { message: 'Confidence score must be less than or equal to 1.0' });

/**
 * Disallowed secret keys in any metadata payload.
 */
const DISALLOWED_METADATA_SECRET_KEYS = new Set([
  'encryptedcredentials',
  'accesstoken',
  'refreshtoken',
  'privatekey',
  'appjwt',
  'installationtoken',
  'webhooksecret',
  'authorizationheader',
  'password',
  'secret',
  'token',
  'clientsecret',
  'apikey',
  'secretkey',
]);

/**
 * Bounded, secret-free metadata JSON schema.
 */
export const SafeMetadataSchema = z
  .record(z.unknown())
  .default({})
  .superRefine((val, ctx) => {
    if (!val || typeof val !== 'object') return;

    for (const key of Object.keys(val)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (DISALLOWED_METADATA_SECRET_KEYS.has(normalizedKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Secret or credential key '${key}' is strictly forbidden in metadata`,
          path: [key],
        });
      }
    }
  });

/**
 * Regex for clean, safe URL slug (lowercase alphanumeric with single internal hyphens).
 */
export const SafeSlugSchema = z
  .string()
  .min(1, { message: 'Slug must not be empty' })
  .max(128, { message: 'Slug must not exceed 128 characters' })
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must contain only lowercase alphanumeric characters and hyphens without consecutive or leading/trailing hyphens',
  });

// ---------------------------------------------------------------------------
// 3. Evidence Source Location & Excerpt Schemas
// ---------------------------------------------------------------------------

/**
 * Strict relative POSIX file path validator preventing path traversal attacks.
 */
export const SafePosixFilePathSchema = z
  .string()
  .min(1, { message: 'File path cannot be empty' })
  .max(1024, { message: 'File path cannot exceed 1024 characters' })
  .superRefine((val, ctx) => {
    if (val.includes('\\')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'File path must use POSIX forward slashes, backslashes are rejected',
      });
      return;
    }
    if (val.includes('\0') || val.includes('%00')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Null bytes are strictly prohibited in file paths',
      });
      return;
    }
    if (val.startsWith('/') || val.startsWith('./')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'File path must be relative without leading slash or ./',
      });
      return;
    }
    const segments = val.split('/');
    if (segments.some((seg) => seg === '..' || seg === '.' || seg === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Path traversal segments (..) or empty directory segments are prohibited',
      });
    }
  });

/**
 * 40-character hex Git commit SHA.
 */
export const GitCommitShaSchema = z.string().regex(/^[0-9a-fA-F]{40}$/, {
  message: 'commitSha must be a valid 40-character hexadecimal Git SHA',
});

/**
 * Structured line range object.
 */
export const EvidenceLineRangeSchema = z
  .strictObject({
    start: z.number().int().positive({ message: 'lineRange.start must be a positive integer' }),
    end: z.number().int().positive({ message: 'lineRange.end must be a positive integer' }),
  })
  .refine((range) => range.end >= range.start, {
    message: 'lineRange.end must be greater than or equal to lineRange.start',
  });

/**
 * Structured AST symbol context.
 */
export const EvidenceAstContextSchema = z.strictObject({
  symbol: z.string().min(1).max(256),
  type: z.string().min(1).max(128),
});

/**
 * Evidence source location schema.
 */
export const EvidenceSourceLocationSchema = z.strictObject({
  filePath: SafePosixFilePathSchema,
  commitSha: GitCommitShaSchema.optional().nullable(),
  lineRange: EvidenceLineRangeSchema.optional().nullable(),
  astContext: EvidenceAstContextSchema.optional().nullable(),
});

/**
 * Secret-safe, 1024-character bounded evidence excerpt.
 */
export const EvidenceExcerptSchema = z
  .string()
  .max(1024, { message: 'Evidence excerpt must not exceed 1024 characters' })
  .superRefine((val, ctx) => {
    if (!val) return;

    // Detect private keys
    if (val.includes('-----BEGIN') && val.includes('PRIVATE KEY-----')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Evidence excerpt contains private key material and is rejected',
      });
      return;
    }

    // Detect GitHub App / Personal access tokens
    if (/gh[sopru]_[A-Za-z0-9_]{20,}/.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Evidence excerpt contains GitHub token patterns and is rejected',
      });
      return;
    }

    // Detect raw Authorization headers
    if (/bearer\s+[a-zA-Z0-9_.-]{20,}/i.test(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Evidence excerpt contains Bearer token and is rejected',
      });
    }
  });

// ---------------------------------------------------------------------------
// 4. Evidence Node Schema
// ---------------------------------------------------------------------------

export const EvidenceNodeSchema = z.strictObject({
  id: z.string().uuid({ message: 'Evidence ID must be a valid UUID' }),
  tenantId: z.string().uuid().optional(),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  resourceId: z.string().uuid({ message: 'Resource ID must be a valid UUID' }),
  projectId: z.string().uuid().optional().nullable(),
  skillId: z.string().uuid().optional().nullable(),
  evidenceType: EvidenceTypeEnum,
  sourceProvider: ResourceProviderEnum,
  sourceLocation: EvidenceSourceLocationSchema,
  excerpt: EvidenceExcerptSchema.optional().nullable(),
  confidenceScore: ConfidenceScoreSchema.default(1.0),
  detectedAt: DateOrIsoStringSchema.default(() => new Date()),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
});

// ---------------------------------------------------------------------------
// 5. Resource Summary Schema
// ---------------------------------------------------------------------------

export const ResourceSummarySchema = z.strictObject({
  id: z.string().uuid({ message: 'Resource ID must be a valid UUID' }),
  tenantId: z.string().uuid().optional(),
  connectionId: z.string().uuid().optional().nullable(),
  candidateId: z.string().uuid().optional().nullable(),
  provider: ResourceProviderEnum,
  resourceType: ResourceTypeEnum.default('REPOSITORY'),
  externalResourceId: z.string().min(1, { message: 'externalResourceId is required' }),
  name: z.string().min(1, { message: 'Resource name is required' }),
  displayName: z.string().min(1, { message: 'Resource displayName is required' }),
  url: z.string().url().optional().nullable(),
  isPrivate: z.boolean().default(false),
  status: ResourceStatusEnum.default('ACTIVE'),
  lastSyncedAt: DateOrIsoStringSchema.optional().nullable(),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

// ---------------------------------------------------------------------------
// 6. Candidate Identity Schema
// ---------------------------------------------------------------------------

export const CandidateIdentitySchema = z.strictObject({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  provider: ResourceProviderEnum,
  externalAccountId: z.string().min(1, { message: 'externalAccountId is required' }),
  externalUsername: z.string().min(1, { message: 'externalUsername is required' }),
  externalEmail: z.string().email().optional().nullable(),
  profileUrl: z.string().url().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  verified: z.boolean().default(false),
  verifiedAt: DateOrIsoStringSchema.optional().nullable(),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

// ---------------------------------------------------------------------------
// 7. Skill Taxonomy & Skill With Evidence Schemas
// ---------------------------------------------------------------------------

export const SkillSchema = z.strictObject({
  id: z.string().uuid().optional(),
  slug: SafeSlugSchema,
  name: z.string().min(1, { message: 'Skill name is required' }),
  category: SkillCategoryEnum,
  aliases: z.array(z.string()).default([]),
  description: z.string().optional().nullable(),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

export const SkillWithEvidenceSchema = z.strictObject({
  id: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  skillId: z.string().uuid().optional().nullable(),
  name: z.string().min(1, { message: 'Skill name is required' }),
  slug: SafeSlugSchema.optional(),
  category: SkillCategoryEnum,
  provenanceStatus: ProvenanceStatusEnum.default('CLAIMED'),
  confidenceScore: ConfidenceScoreSchema.default(0.0),
  evidenceCount: z.number().int().min(0).default(0),
  primaryEvidenceId: z.string().uuid().optional().nullable(),
  firstObservedAt: DateOrIsoStringSchema.optional().nullable(),
  lastObservedAt: DateOrIsoStringSchema.optional().nullable(),
  evidence: z.array(EvidenceNodeSchema).default([]),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

// ---------------------------------------------------------------------------
// 8. Project & Project Evidence Schemas
// ---------------------------------------------------------------------------

export const ProjectSchema = z.strictObject({
  id: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  tenantId: z.string().uuid().optional(),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  name: z.string().min(1, { message: 'Project name is required' }),
  slug: SafeSlugSchema,
  headline: z.string().max(500).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  role: z.string().max(255).optional().nullable(),
  isHighlighted: z.boolean().default(false),
  startDate: z.union([z.date(), z.string()]).optional().nullable(),
  endDate: z.union([z.date(), z.string()]).optional().nullable(),
  resources: z.array(ResourceSummarySchema).default([]),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

export const ProjectEvidenceSchema = z.strictObject({
  id: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  tenantId: z.string().uuid().optional(),
  candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  name: z.string().min(1, { message: 'Project name is required' }),
  slug: SafeSlugSchema,
  headline: z.string().max(500).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  role: z.string().max(255).optional().nullable(),
  isHighlighted: z.boolean().default(false),
  startDate: z.union([z.date(), z.string()]).optional().nullable(),
  endDate: z.union([z.date(), z.string()]).optional().nullable(),
  resources: z.array(ResourceSummarySchema).default([]),
  evidence: z.array(EvidenceNodeSchema).default([]),
  confidenceScore: ConfidenceScoreSchema.default(1.0),
  provenanceStatus: ProvenanceStatusEnum.default('VERIFIED'),
  metadata: SafeMetadataSchema.default({}),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});

// ---------------------------------------------------------------------------
// 9. Candidate Profile Schema
// ---------------------------------------------------------------------------

export const CandidateProfileSchema = z.strictObject({
  id: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
  tenantId: z.string().uuid().optional(),
  userId: z.string().uuid().optional().nullable(),
  displayName: z.string().min(1, { message: 'displayName is required' }).max(255),
  headline: z.string().max(500).optional().nullable(),
  summary: z.string().max(5000).optional().nullable(),
  canonicalEmail: z
    .string()
    .email({ message: 'canonicalEmail must be a valid email' })
    .optional()
    .nullable(),
  status: CandidateStatusEnum.default('ACTIVE'),
  profileMetadata: SafeMetadataSchema.default({}),
  identities: z.array(CandidateIdentitySchema).default([]),
  skills: z.array(SkillWithEvidenceSchema).default([]),
  projects: z.array(ProjectEvidenceSchema).default([]),
  createdAt: DateOrIsoStringSchema.optional(),
  updatedAt: DateOrIsoStringSchema.optional(),
});
