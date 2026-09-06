-- Migration 0010: Application Package Version Ledger (P14-005BA)
-- Adds:
-- 1. package_lifecycle_state enum (CURRENT / ARCHIVED)
-- 2. application_packages table: immutable package version ledger per application
-- 3. package_hash sync columns on job_applications metadata are NOT backfilled here;
--    historical kits keep working via metadata.handoffKit.
--
-- Invariants enforced by this schema:
-- - (tenantId, applicationId, packageHash) is unique: re-preparing an identical
--   package is idempotent.
-- - Exactly one version per application should be CURRENT; the service layer
--   atomically demotes the previous CURRENT version when a new one is recorded.

-- 1. Lifecycle state enum for package versions
DO $$ BEGIN
  CREATE TYPE "package_lifecycle_state" AS ENUM ('CURRENT', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Application package version ledger
CREATE TABLE IF NOT EXISTS "application_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "application_id" uuid NOT NULL REFERENCES "job_applications"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "version" integer NOT NULL DEFAULT 1,
  "package_hash" text NOT NULL,
  "resume_content_hash" text,
  "cover_letter_content_hash" text,
  "fit_score" real,
  "answers" jsonb DEFAULT '{}' NOT NULL,
  "source" text DEFAULT 'PREPARE_JOB_APPLICATION' NOT NULL,
  "lifecycle_state" "package_lifecycle_state" DEFAULT 'CURRENT' NOT NULL,
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Unique version identity per application (idempotent re-preparation)
CREATE UNIQUE INDEX IF NOT EXISTS "application_packages_tenant_app_hash_unique"
  ON "application_packages" ("tenant_id", "application_id", "package_hash");

CREATE INDEX IF NOT EXISTS "idx_application_packages_tenant_application"
  ON "application_packages" ("tenant_id", "application_id");

CREATE INDEX IF NOT EXISTS "idx_application_packages_current"
  ON "application_packages" ("tenant_id", "application_id", "lifecycle_state");

CREATE INDEX IF NOT EXISTS "idx_application_packages_tenant_candidate"
  ON "application_packages" ("tenant_id", "candidate_id");

CREATE INDEX IF NOT EXISTS "idx_application_packages_hash"
  ON "application_packages" ("package_hash");
