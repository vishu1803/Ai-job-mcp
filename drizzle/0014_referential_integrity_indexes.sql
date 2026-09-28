-- Migration 0014: Referential Integrity Indexes
-- Adds covering indexes for foreign keys that PostgreSQL has to scan whenever the
-- referenced row is deleted or updated. Each of these columns backs a CASCADE or
-- SET NULL rule, so without an index every parent delete degrades into a sequential
-- scan of the child table:
--   1. sessions.tenant_id                        -> tenants (CASCADE)
--   2. audit_logs.user_id                        -> users   (SET NULL)
--   3. action_approval_tickets.user_id            -> users   (CASCADE)
--   4. action_approval_tickets.approved_by_user_id -> users  (SET NULL)
--   5. candidate_claims.corroborating_evidence_id -> evidence_items (SET NULL)
-- candidate_claims is the sharpest case: GitHub evidence is re-extracted and replaced
-- routinely, and each evidence delete otherwise scans the whole claims table.
-- Idempotent, so it is safe to re-run against environments that already have them.

CREATE INDEX IF NOT EXISTS "idx_sessions_tenant_id" ON "sessions" ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_id" ON "audit_logs" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_action_approval_tickets_user_id"
  ON "action_approval_tickets" ("user_id");

CREATE INDEX IF NOT EXISTS "idx_action_approval_tickets_approved_by_user_id"
  ON "action_approval_tickets" ("approved_by_user_id");

CREATE INDEX IF NOT EXISTS "idx_candidate_claims_corroborating_evidence_id"
  ON "candidate_claims" ("corroborating_evidence_id");
