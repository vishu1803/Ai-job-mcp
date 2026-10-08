-- Additive; preserve existing approvals/snapshots. Legacy consumed tickets stay spent.
CREATE TABLE application_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id uuid NOT NULL REFERENCES application_approval_tickets(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  package_version integer NOT NULL,
  package_hash text NOT NULL,
  status text NOT NULL DEFAULT 'CLAIMED',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  external_reference text,
  failure_classification text,
  result jsonb,
  CONSTRAINT application_execution_status_check CHECK (status IN ('CLAIMED','STARTED','SUCCEEDED','FAILED','UNKNOWN'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_application_execution_approval ON application_executions(approval_id);
--> statement-breakpoint
CREATE INDEX idx_application_execution_tenant_status ON application_executions(tenant_id,status);
-- Rollback: disable submission and stop ALL workers first. Retain this table as
-- forensic evidence; never reset consumed tickets or run vulnerable old workers.
