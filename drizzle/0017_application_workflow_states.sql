-- Migration 0017: Application Workflow States (Phase 9.5 Application State Consistency)
-- Adds explicit workflow lifecycle states to application_status enum:
-- PREPARED, APPROVAL_PENDING, APPROVED, HANDOFF_READY, READY_FOR_FINAL_REVIEW, SUBMITTED, FAILED

ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'PREPARED';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'APPROVAL_PENDING';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'HANDOFF_READY';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'READY_FOR_FINAL_REVIEW';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "public"."application_status" ADD VALUE IF NOT EXISTS 'FAILED';
