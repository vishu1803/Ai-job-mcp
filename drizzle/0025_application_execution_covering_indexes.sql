CREATE INDEX IF NOT EXISTS idx_application_execution_tenant_user ON application_executions(tenant_id,user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_application_execution_tenant_candidate ON application_executions(tenant_id,candidate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_application_execution_tenant_application ON application_executions(tenant_id,application_id);
