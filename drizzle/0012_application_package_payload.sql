-- Migration 0012: Application Package Payload Snapshot
-- Preserves exact, immutable applicationPackage snapshot in application_packages table

ALTER TABLE "application_packages" ADD COLUMN IF NOT EXISTS "package_payload" jsonb;
