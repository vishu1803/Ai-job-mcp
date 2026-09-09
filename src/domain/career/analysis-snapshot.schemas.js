import { z } from 'zod';
import crypto from 'node:crypto';

/**
 * Authoritative Analysis Snapshot Contract Version (P16-001F-3B).
 * Enforces generation contract integrity between Analyze and Prepare phases.
 */
export const ANALYSIS_SNAPSHOT_CONTRACT_VERSION = 'P16-001F';

/**
 * Snapshot time-to-live: 2 hours (in milliseconds).
 */
export const ANALYSIS_SNAPSHOT_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Computes a deterministic SHA-256 hash of the canonical job fields
 * that materially affect parsing and analysis.
 *
 * Excludes transient browser-only fields (session IDs, scrape tab IDs, timestamps).
 *
 * @param {object} job Raw or normalized job posting payload
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function computeJobContentHash(job) {
  if (!job || typeof job !== 'object') return '';

  const company = String(job.company || job.companyName || '').trim().toLowerCase();
  const title = String(job.title || job.jobTitle || '').trim().toLowerCase();
  const description = String(job.description || job.rawJobDescription || job.rawText || '').trim();
  const location = String(job.location || '').trim().toLowerCase();
  const workplace = String(job.workplace || job.workplaceType || '').trim().toLowerCase();
  const employmentType = String(job.employmentType || '').trim().toLowerCase();

  const canonicalPayload = JSON.stringify({
    company,
    title,
    description,
    location,
    workplace,
    employmentType,
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

/**
 * Zod schema for validated Job Analysis Snapshot data.
 */
export const JobAnalysisSnapshotSchema = z.object({
  id: z.string().uuid(),
  contractVersion: z.literal(ANALYSIS_SNAPSHOT_CONTRACT_VERSION).default(ANALYSIS_SNAPSHOT_CONTRACT_VERSION),
  tenantId: z.string().uuid(),
  candidateId: z.string().uuid(),
  canonicalJobId: z.string().min(1),
  normalizedJobUrl: z.string().nullable().optional(),
  jobContentHash: z.string().min(1),
  analyzedAt: z.union([z.string(), z.date()]),
  overallFit: z.record(z.any()).default({}),
  matchAnalysis: z.record(z.any()).default({}),
  projectRankings: z.array(z.record(z.any())).default([]),
  topRelevantProjects: z.array(z.record(z.any())).optional().default([]),
  parsedJobDescription: z.record(z.any()).default({}),
  metadata: z.record(z.any()).optional().default({}),
});
