-- Migration 0013: Job Analysis Snapshots (P16-001F-3B)
-- Preserves authoritative server-side analysis snapshots for candidate job evaluations.
-- Enforces:
-- 1. Tenant and candidate ownership isolation.
-- 2. Exact canonical job binding and content-hash staleness validation.
-- 3. Idempotent snapshot reuse without requiring premature application creation.

CREATE TABLE IF NOT EXISTS "job_analysis_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contract_version" text NOT NULL DEFAULT 'P16-001F',
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "canonical_job_id" text NOT NULL,
  "normalized_job_url" text,
  "job_content_hash" text NOT NULL,
  "analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "overall_fit" jsonb DEFAULT '{}' NOT NULL,
  "match_analysis" jsonb DEFAULT '{}' NOT NULL,
  "project_rankings" jsonb DEFAULT '[]' NOT NULL,
  "parsed_job_description" jsonb DEFAULT '{}' NOT NULL,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_job_analysis_snapshots_lookup"
  ON "job_analysis_snapshots" ("tenant_id", "candidate_id", "canonical_job_id");

CREATE INDEX IF NOT EXISTS "idx_job_analysis_snapshots_tenant_candidate"
  ON "job_analysis_snapshots" ("tenant_id", "candidate_id");

CREATE INDEX IF NOT EXISTS "idx_job_analysis_snapshots_hash"
  ON "job_analysis_snapshots" ("job_content_hash");
