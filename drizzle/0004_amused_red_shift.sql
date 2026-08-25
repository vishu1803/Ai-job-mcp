CREATE TYPE "public"."approval_ticket_status" AS ENUM('PENDING', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TABLE "action_approval_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"action_type" text DEFAULT 'PROJECT_IMPROVEMENT_PR' NOT NULL,
	"repository_name" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"target_branch" text NOT NULL,
	"expected_head_sha" text NOT NULL,
	"patch_fingerprint" text NOT NULL,
	"patch_summary" jsonb NOT NULL,
	"hmac_signature" text NOT NULL,
	"status" "approval_ticket_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"failure_reason" text,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"idempotency_key" text,
	"execution_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_approval_tickets" ADD CONSTRAINT "action_approval_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approval_tickets" ADD CONSTRAINT "action_approval_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approval_tickets" ADD CONSTRAINT "action_approval_tickets_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approval_tickets" ADD CONSTRAINT "action_approval_tickets_resource_id_resource_connections_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_approval_tickets" ADD CONSTRAINT "action_approval_tickets_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_approval_tickets_tenant_status" ON "action_approval_tickets" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_approval_tickets_candidate" ON "action_approval_tickets" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_approval_tickets_resource" ON "action_approval_tickets" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "idx_approval_tickets_expires_at" ON "action_approval_tickets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_approval_tickets_idempotency" ON "action_approval_tickets" USING btree ("tenant_id","idempotency_key");