-- Migration 0011: Canonical Application Identity and Active Duplicate Prevention
-- Preferred identity: (tenant_id, candidate_id, canonical_job_id)
-- Secondary identity: (tenant_id, candidate_id, normalized_job_url)

ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "canonical_job_id" text;
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "normalized_job_url" text;

-- Backfill normalized_job_url from existing job_url
UPDATE "job_applications"
SET "normalized_job_url" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REPLACE("job_url", 'job-boards.greenhouse.io', 'boards.greenhouse.io'),
      '\?.*$', ''
    ),
    '/+$', ''
  )
)
WHERE "job_url" IS NOT NULL AND "normalized_job_url" IS NULL;

-- Backfill canonical_job_id from metadata if present
UPDATE "job_applications"
SET "canonical_job_id" = COALESCE(
  "metadata"->>'canonicalJobId',
  "metadata"->>'jobId'
)
WHERE "canonical_job_id" IS NULL AND ("metadata"->>'canonicalJobId' IS NOT NULL OR "metadata"->>'jobId' IS NOT NULL);

-- Create partial unique index on (tenant_id, candidate_id, canonical_job_id) for active applications
CREATE UNIQUE INDEX IF NOT EXISTS "uq_job_applications_active_canonical_job"
  ON "job_applications" ("tenant_id", "candidate_id", "canonical_job_id")
  WHERE "status" NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED') AND "canonical_job_id" IS NOT NULL;

-- Create partial unique index on (tenant_id, candidate_id, normalized_job_url) for active applications
CREATE UNIQUE INDEX IF NOT EXISTS "uq_job_applications_active_normalized_url"
  ON "job_applications" ("tenant_id", "candidate_id", "normalized_job_url")
  WHERE "status" NOT IN ('REJECTED', 'WITHDRAWN', 'ARCHIVED') AND "normalized_job_url" IS NOT NULL;
