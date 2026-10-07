-- Do not choose an owner or delete data automatically. Duplicate historical claims
-- intentionally fail this migration and require incident review before deployment.
CREATE UNIQUE INDEX "resource_connections_github_installation_unique"
  ON "resource_connections" ("installation_id")
  WHERE "provider" = 'GITHUB_APP' AND "installation_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "github_user_id" text;
--> statement-breakpoint
CREATE TABLE "github_installation_states" (
  "state_hash" text PRIMARY KEY,
  "session_id" text NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "phase" text NOT NULL CONSTRAINT "github_installation_states_phase" CHECK ("phase" IN ('install', 'authorize')),
  "installation_id" text,
  "encrypted_code_verifier" text,
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "github_installation_states_phase_context" CHECK (
    ("phase" = 'install' AND "installation_id" IS NULL AND "encrypted_code_verifier" IS NULL)
    OR ("phase" = 'authorize' AND "installation_id" IS NOT NULL AND "encrypted_code_verifier" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX "idx_github_installation_states_session" ON "github_installation_states" ("session_id");
CREATE INDEX "idx_github_installation_states_tenant" ON "github_installation_states" ("tenant_id");
CREATE INDEX "idx_github_installation_states_user" ON "github_installation_states" ("user_id");
CREATE INDEX "idx_github_installation_states_expiry" ON "github_installation_states" ("expires_at");
