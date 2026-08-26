CREATE TYPE "public"."application_status" AS ENUM('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEWING', 'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."stage_outcome" AS ENUM('PENDING', 'PASSED', 'FAILED', 'SKIPPED', 'RESCHEDULED');--> statement-breakpoint
CREATE TYPE "public"."stage_type" AS ENUM('DISCOVERY', 'RESUME_SUBMITTED', 'RECRUITER_SCREEN', 'TECHNICAL_ASSESSMENT', 'SYSTEM_DESIGN', 'BEHAVIORAL', 'ONSITE_LOOP', 'OFFER_NEGOTIATION', 'POST_OFFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."tailored_document_type" AS ENUM('TAILORED_RESUME', 'TAILORED_COVER_LETTER', 'PORTFOLIO_RECOMMENDATION', 'CUSTOM_NOTE');--> statement-breakpoint
CREATE TABLE "application_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"stage_type" "stage_type" NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" "stage_outcome" DEFAULT 'PENDING' NOT NULL,
	"interviewer_names" jsonb DEFAULT '[]' NOT NULL,
	"feedback" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"job_title" text NOT NULL,
	"job_url" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"location" text,
	"workplace_type" text,
	"employment_type" text,
	"raw_job_description" text,
	"parsed_job_description" jsonb,
	"ats_fit_snapshot" jsonb,
	"status" "application_status" DEFAULT 'SAVED' NOT NULL,
	"applied_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"compensation" jsonb DEFAULT '{}' NOT NULL,
	"notes" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailored_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"document_type" "tailored_document_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"rendered_markdown" text,
	"rendered_plain_text" text,
	"content_hash" text NOT NULL,
	"citation_refs" jsonb DEFAULT '[]' NOT NULL,
	"integrity_score" real,
	"ats_fit_score" real,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_stages" ADD CONSTRAINT "application_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_stages" ADD CONSTRAINT "application_stages_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_documents" ADD CONSTRAINT "tailored_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_documents" ADD CONSTRAINT "tailored_documents_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_documents" ADD CONSTRAINT "tailored_documents_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_application_stages_tenant_application" ON "application_stages" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "idx_application_stages_app_order" ON "application_stages" USING btree ("application_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_job_applications_tenant_id" ON "job_applications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_tenant_candidate" ON "job_applications" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_job_applications_tenant_status" ON "job_applications" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_job_applications_tenant_company" ON "job_applications" USING btree ("tenant_id","company_name");--> statement-breakpoint
CREATE INDEX "idx_job_applications_tenant_applied" ON "job_applications" USING btree ("tenant_id","applied_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tailored_docs_tenant_application" ON "tailored_documents" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "idx_tailored_docs_tenant_candidate" ON "tailored_documents" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_tailored_docs_content_hash" ON "tailored_documents" USING btree ("content_hash");