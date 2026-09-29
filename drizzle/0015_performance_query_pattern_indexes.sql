-- Migration 0015: Performance Query Pattern Indexes (Phase 2)
-- Adds composite covering indexes matching high-frequency query patterns:
-- 1. job_applications: (tenant_id, candidate_id, updated_at DESC, id DESC)
--    Supports deterministic paginated application queries without sequential scan and quicksort.
-- 2. evidence_items: (tenant_id, candidate_id, project_id, confidence_score DESC, detected_at DESC)
--    Supports handoff/profile evidence reconciliation matching project evidence by confidence.

CREATE INDEX IF NOT EXISTS "idx_job_applications_tenant_candidate_updated"
  ON "job_applications" ("tenant_id", "candidate_id", "updated_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_evidence_items_tenant_candidate_project"
  ON "evidence_items" ("tenant_id", "candidate_id", "project_id", "confidence_score" DESC, "detected_at" DESC);
