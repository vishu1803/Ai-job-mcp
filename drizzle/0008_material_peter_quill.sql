CREATE TYPE "public"."resume_lifecycle_state" AS ENUM('SOURCE', 'PARSED', 'USER_APPROVED', 'BASE_RESUME', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."resume_section_type" AS ENUM('SUMMARY', 'WORK_EXPERIENCE', 'EDUCATION', 'SKILLS', 'PROJECTS', 'CERTIFICATIONS', 'CONTACT_INFO', 'OTHER');--> statement-breakpoint
CREATE TABLE "candidate_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"resume_id" uuid,
	"claim_type" text NOT NULL,
	"statement" text NOT NULL,
	"context" text,
	"provenance_status" "provenance_status" DEFAULT 'CLAIMED' NOT NULL,
	"is_corroborated" boolean DEFAULT false NOT NULL,
	"corroborating_evidence_id" uuid,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resume_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"section_type" "resume_section_type" NOT NULL,
	"raw_text" text NOT NULL,
	"structured_data" jsonb DEFAULT '{}' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"file_name" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"content_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"lifecycle_state" "resume_lifecycle_state" DEFAULT 'SOURCE' NOT NULL,
	"is_base_resume" boolean DEFAULT false NOT NULL,
	"parse_error" text,
	"parsed_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD CONSTRAINT "candidate_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD CONSTRAINT "candidate_claims_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD CONSTRAINT "candidate_claims_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_claims" ADD CONSTRAINT "candidate_claims_corroborating_evidence_id_evidence_items_id_fk" FOREIGN KEY ("corroborating_evidence_id") REFERENCES "public"."evidence_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_sections" ADD CONSTRAINT "resume_sections_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_candidate_claims_tenant_candidate" ON "candidate_claims" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_claims_resume" ON "candidate_claims" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_claims_status" ON "candidate_claims" USING btree ("tenant_id","provenance_status");--> statement-breakpoint
CREATE INDEX "idx_resume_sections_tenant_resume" ON "resume_sections" USING btree ("tenant_id","resume_id");--> statement-breakpoint
CREATE INDEX "idx_resume_sections_tenant_candidate" ON "resume_sections" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_resume_sections_resume_order" ON "resume_sections" USING btree ("resume_id","order_index");--> statement-breakpoint
CREATE INDEX "idx_resumes_tenant_candidate" ON "resumes" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_resumes_tenant_state" ON "resumes" USING btree ("tenant_id","lifecycle_state");--> statement-breakpoint
CREATE INDEX "idx_resumes_content_hash" ON "resumes" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_resumes_candidate_version" ON "resumes" USING btree ("candidate_id","version");