/**
 * @file Canonical Domain Zod Schemas for Project Improvement Recommendations (P9-001)
 *
 * Implements the domain contracts approved in P9-001A (ARCH-031 / ADR-052):
 * 1. PatchOperationEnum ('CREATE', 'MODIFY', 'DELETE')
 * 2. ProposalStatusEnum ('PROPOSED', 'BLOCKED', 'INVALID')
 * 3. ProposalRiskLevelEnum ('LOW', 'MEDIUM', 'HIGH')
 * 4. StructuredPatchFileSchema & PatchSummarySchema
 * 5. VerificationPlanSchema
 * 6. ProjectImprovementProposalSchema
 * 7. ProjectImprovementRequestSchema
 * 8. Patch safety & deterministic fingerprinting utilities
 */

import { z } from 'zod';
import crypto from 'node:crypto';
import {
  SafeSlugSchema,
  SafePosixFilePathSchema,
  ConfidenceScoreSchema,
  DateOrIsoStringSchema,
} from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema } from './evidence-matching.schemas.js';

// ---------------------------------------------------------------------------
// 1. Domain Enumerations
// ---------------------------------------------------------------------------

export const PatchOperationEnum = z.enum(['CREATE', 'MODIFY', 'DELETE']);

export const ProposalStatusEnum = z.enum(['PROPOSED', 'BLOCKED', 'INVALID']);

export const ProposalRiskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);

export const ProjectImprovementErrorReasonEnum = z.enum([
  'NO_SUITABLE_REPOSITORY',
  'UNSUPPORTED_SKILL_GAP',
  'INSUFFICIENT_EVIDENCE',
  'INVALID_PATCH',
  'PATH_POLICY_VIOLATION',
  'SECRET_DETECTED',
  'PROTECTED_FILE',
  'PATCH_TOO_LARGE',
  'FABRICATED_EVIDENCE',
  'TENANT_MISMATCH',
]);

// ---------------------------------------------------------------------------
// 2. Safety Constants & Blocklists
// ---------------------------------------------------------------------------

export const BLOCKED_PATH_PATTERNS = Object.freeze([
  /^\.git(\/|$)/i,
  /^\.github\/workflows(\/|$)/i,
  /^\.circleci(\/|$)/i,
  /^\.gitlab-ci\.ya?ml$/i,
  /^\.travis\.ya?ml$/i,
  /^azure-pipelines\.ya?ml$/i,
  /^Jenkinsfile$/i,
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa(\..+)?$/i,
  /^id_ed25519(\..+)?$/i,
  /^package-lock\.json$/i,
  /^pnpm-lock\.ya?ml$/i,
  /^yarn\.lock$/i,
]);

export const BLOCKED_BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.mp4',
  '.mp3',
  '.wav',
  '.mov',
  '.avi',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.iso',
  '.dmg',
  '.pdf',
  '.doc',
  '.docx',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.class',
  '.pyc',
  '.o',
  '.a',
  '.wasm',
  '.jar',
  '.war',
  '.ear',
]);

export const MAX_FILES_PER_PROPOSAL = 10;
export const MAX_TOTAL_DIFF_LINES = 500;
export const MAX_TOTAL_PAYLOAD_BYTES = 102400; // 100 KB
export const MAX_SINGLE_FILE_CONTENT_CHARS = 50000;

// ---------------------------------------------------------------------------
// 3. Patch Safety & Hash Utilities
// ---------------------------------------------------------------------------

/**
 * Validates a file path against all safety constraints, blocklists, and extensions.
 *
 * @param {string} rawPath Relative POSIX path
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePatchPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    return { valid: false, error: 'File path cannot be empty' };
  }

  const normalized = rawPath.trim().replace(/\\/g, '/');

  // Absolute path check
  if (normalized.startsWith('/') || /^[a-zA-Z]:/i.test(normalized)) {
    return { valid: false, error: 'Absolute paths are strictly prohibited' };
  }

  // Path traversal check
  if (normalized.includes('..') || normalized.includes('\0') || normalized.includes('%00')) {
    return { valid: false, error: 'Path traversal or null bytes are strictly prohibited' };
  }

  // Blocked path patterns (workflows, .git, .env, etc.)
  for (const pattern of BLOCKED_PATH_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        valid: false,
        error: `Protected file or workflow path '${normalized}' is prohibited from modification`,
      };
    }
  }

  // Binary extension check
  const lastDot = normalized.lastIndexOf('.');
  if (lastDot !== -1) {
    const ext = normalized.slice(lastDot).toLowerCase();
    if (BLOCKED_BINARY_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        error: `Binary file extension '${ext}' is prohibited in structured patches`,
      };
    }
  }

  return { valid: true };
}

/**
 * Computes a deterministic SHA-256 hex string for given content.
 *
 * @param {string} content
 * @returns {string} 64-char hex SHA-256
 */
export function computeFileSha256(content) {
  return crypto
    .createHash('sha256')
    .update(typeof content === 'string' ? content : '')
    .digest('hex');
}

/**
 * Computes a deterministic HMAC / SHA-256 fingerprint for a collection of structured patch files.
 *
 * @param {Array<{ path: string, operation: string, sha256?: string, content?: string }>} files
 * @returns {string} 64-char hex SHA-256
 */
export function computePatchFingerprint(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return crypto.createHash('sha256').update('EMPTY_PATCH').digest('hex');
  }

  // Deterministically sort by path
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const canonicalString = sorted
    .map((f) => {
      const fileSha = f.sha256 || computeFileSha256(f.content || '');
      return `${f.operation}:${f.path}:${fileSha}`;
    })
    .join('\n');

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

// ---------------------------------------------------------------------------
// 4. Structured Patch & Verification Schemas
// ---------------------------------------------------------------------------

export const StructuredPatchFileSchema = z
  .object({
    path: SafePosixFilePathSchema,
    operation: PatchOperationEnum,
    content: z.string().max(MAX_SINGLE_FILE_CONTENT_CHARS, {
      message: `File content exceeds maximum length of ${MAX_SINGLE_FILE_CONTENT_CHARS} characters`,
    }),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/, { message: 'sha256 must be a 64-character lowercase hex string' }),
    diffLinesCount: z.number().int().nonnegative().optional().default(0),
  })
  .strict();

export const PatchSummarySchema = z
  .object({
    fileCount: z.number().int().min(1).max(MAX_FILES_PER_PROPOSAL),
    additionsCount: z.number().int().nonnegative().default(0),
    deletionsCount: z.number().int().nonnegative().default(0),
    totalDiffLines: z.number().int().nonnegative().max(MAX_TOTAL_DIFF_LINES),
    files: z.array(StructuredPatchFileSchema).min(1).max(MAX_FILES_PER_PROPOSAL),
    patchFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/, { message: 'patchFingerprint must be a 64-char hex string' }),
  })
  .strict();

export const VerificationPlanSchema = z
  .object({
    buildInstructions: z.string().trim().min(1).max(1000),
    testCommands: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
    expectedOutcomes: z.array(z.string().trim().min(1).max(500)).max(5).default([]),
    rollbackAdvice: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .default('Delete the feature branch if tests fail.'),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Project Improvement Proposal Schema
// ---------------------------------------------------------------------------

export const ProjectImprovementProposalSchema = z
  .object({
    proposalId: z.string().uuid({ message: 'proposalId must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'tenantId must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'candidateId must be a valid UUID' }),
    jobDescriptionId: z.string().uuid({ message: 'jobDescriptionId must be a valid UUID' }),
    resourceId: z.string().uuid({ message: 'resourceId must be a valid UUID' }),
    repositoryName: z.string().trim().min(1).max(255),
    targetBranch: z.string().regex(/^feat\/career-hub-[a-z0-9-]+$/, {
      message: 'targetBranch must follow feat/career-hub-<slug> convention',
    }),
    targetSkillSlugs: z.array(SafeSlugSchema).min(1).max(5),
    targetSkillNames: z.array(z.string().trim().min(1).max(100)).min(1).max(5),
    gapType: z.enum(['MISSING', 'PARTIAL']),
    title: z.string().trim().min(5).max(150),
    rationale: z.string().trim().min(10).max(2000),
    architecturalChange: z.string().trim().min(10).max(2000),
    expectedFiles: z.array(SafePosixFilePathSchema).min(1).max(MAX_FILES_PER_PROPOSAL),
    patch: PatchSummarySchema,
    evidenceRefs: z.array(EvidenceRefSchema).max(10).default([]),
    verificationPlan: VerificationPlanSchema,
    riskLevel: ProposalRiskLevelEnum.default('LOW'),
    confidenceScore: ConfidenceScoreSchema.default(0.95),
    status: ProposalStatusEnum.default('PROPOSED'),
    blockReason: z.string().trim().max(255).nullable().optional(),
    createdAt: DateOrIsoStringSchema.default(() => new Date()),
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Project Improvement Request Schema
// ---------------------------------------------------------------------------

export const ProjectImprovementRequestSchema = z
  .object({
    context: z
      .object({
        tenantId: z.string().uuid({ message: 'Context tenantId must be a valid UUID' }),
        userId: z.string().uuid().optional(),
      })
      .strict(),
    candidateProfile: z.object({
      candidate: z.object({
        id: z.string().uuid(),
        tenantId: z.string().uuid(),
      }),
      skills: z.array(z.any()).default([]),
      projects: z.array(z.any()).default([]),
      evidence: z.array(z.any()).default([]),
    }),
    jobDescription: z.object({
      id: z.string().uuid(),
      tenantId: z.string().uuid(),
      requirements: z.array(z.any()).min(1),
    }),
    targetSkillSlugs: z.array(SafeSlugSchema).max(5).optional(),
    repositoryId: z.string().uuid().optional(),
  })
  .strict();
