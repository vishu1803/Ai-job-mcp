DO $$ BEGIN
 CREATE TYPE "public"."application_approval_ticket_status" AS ENUM('ISSUED', 'PENDING', 'APPROVED', 'CONSUMED', 'EXPIRED', 'REVOKED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "application_approval_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"application_id" uuid,
	"job_id" text NOT NULL,
	"destination_url" text NOT NULL,
	"package_hash" text NOT NULL,
	"package_version" integer,
	"status" "application_approval_ticket_status" DEFAULT 'ISSUED' NOT NULL,
	"signature" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_approval_tickets" ADD CONSTRAINT "application_approval_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_approval_tickets" ADD CONSTRAINT "application_approval_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_approval_tickets" ADD CONSTRAINT "application_approval_tickets_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "application_approval_tickets" ADD CONSTRAINT "application_approval_tickets_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_tenant_status" ON "application_approval_tickets" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_tenant_candidate" ON "application_approval_tickets" USING btree ("tenant_id","candidate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_tenant_application" ON "application_approval_tickets" USING btree ("tenant_id","application_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_tenant_user" ON "application_approval_tickets" USING btree ("tenant_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_expires_at" ON "application_approval_tickets" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_app_approval_hash" ON "application_approval_tickets" USING btree ("package_hash");
