CREATE TYPE "public"."candidate_status" AS ENUM('ACTIVE', 'ARCHIVED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('PACKAGE_MANIFEST_DEPENDENCY', 'CODE_IMPORT_USAGE', 'FILE_PATTERN_MATCH', 'COMMIT_CONTRIBUTION', 'README_SPECIFICATION', 'DIRECTORY_STRUCTURE', 'DOCUMENT_CLAIM');--> statement-breakpoint
CREATE TYPE "public"."provenance_status" AS ENUM('VERIFIED', 'INFERRED', 'CLAIMED', 'MISSING');--> statement-breakpoint
CREATE TYPE "public"."resource_status" AS ENUM('ACTIVE', 'DISCONNECTED', 'DELETED', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('REPOSITORY', 'DOCUMENT', 'PROFILE', 'PORTFOLIO_SITE');--> statement-breakpoint
CREATE TYPE "public"."skill_category" AS ENUM('LANGUAGE', 'FRAMEWORK', 'DATABASE', 'CLOUD_DEVOPS', 'TOOL', 'ARCHITECTURE', 'CONCEPT');--> statement-breakpoint
ALTER TYPE "public"."resource_provider" ADD VALUE 'LINKEDIN';--> statement-breakpoint
ALTER TYPE "public"."resource_provider" ADD VALUE 'GOOGLE';--> statement-breakpoint
ALTER TYPE "public"."resource_provider" ADD VALUE 'MANUAL';--> statement-breakpoint
CREATE TABLE "candidate_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"provider" "resource_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"external_username" text,
	"external_email" text,
	"profile_url" text,
	"avatar_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"category" "skill_category" NOT NULL,
	"provenance_status" "provenance_status" DEFAULT 'CLAIMED' NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"primary_evidence_id" uuid,
	"first_observed_at" timestamp with time zone,
	"last_observed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"headline" text,
	"summary" text,
	"canonical_email" text,
	"profile_metadata" jsonb DEFAULT '{}' NOT NULL,
	"status" "candidate_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"project_id" uuid,
	"skill_id" uuid,
	"evidence_type" "evidence_type" NOT NULL,
	"source_provider" "resource_provider" NOT NULL,
	"source_location" jsonb NOT NULL,
	"excerpt" text,
	"confidence_score" real DEFAULT 1 NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"role_in_project" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"headline" text,
	"summary" text,
	"role" text,
	"is_highlighted" boolean DEFAULT false NOT NULL,
	"start_date" date,
	"end_date" date,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid,
	"candidate_id" uuid,
	"provider" "resource_provider" NOT NULL,
	"resource_type" "resource_type" DEFAULT 'REPOSITORY' NOT NULL,
	"external_resource_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"url" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" "resource_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" "skill_category" NOT NULL,
	"aliases" jsonb DEFAULT '[]' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidate_identities" ADD CONSTRAINT "candidate_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_identities" ADD CONSTRAINT "candidate_identities_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_connection_id_resource_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."resource_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_identities_tenant_provider_account_unique" ON "candidate_identities" USING btree ("tenant_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_identities_tenant_id" ON "candidate_identities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_identities_tenant_candidate" ON "candidate_identities" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_skills_tenant_candidate_skill_unique" ON "candidate_skills" USING btree ("tenant_id","candidate_id","skill_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_skills_tenant_id" ON "candidate_skills" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_skills_tenant_candidate" ON "candidate_skills" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_skills_tenant_skill" ON "candidate_skills" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_skills_provenance" ON "candidate_skills" USING btree ("tenant_id","provenance_status");--> statement-breakpoint
CREATE INDEX "idx_candidates_tenant_id" ON "candidates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_tenant_user" ON "candidates" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_items_tenant_id" ON "evidence_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_items_tenant_candidate" ON "evidence_items" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_items_tenant_resource" ON "evidence_items" USING btree ("tenant_id","resource_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_items_tenant_project" ON "evidence_items" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_evidence_items_tenant_skill" ON "evidence_items" USING btree ("tenant_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_resources_project_resource_unique" ON "project_resources" USING btree ("project_id","resource_id");--> statement-breakpoint
CREATE INDEX "idx_project_resources_tenant_id" ON "project_resources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_project_resources_tenant_project" ON "project_resources" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "idx_project_resources_tenant_resource" ON "project_resources" USING btree ("tenant_id","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_tenant_candidate_slug_unique" ON "projects" USING btree ("tenant_id","candidate_id","slug");--> statement-breakpoint
CREATE INDEX "idx_projects_tenant_id" ON "projects" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_projects_tenant_candidate" ON "projects" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_tenant_provider_external_id_unique" ON "resources" USING btree ("tenant_id","provider","external_resource_id");--> statement-breakpoint
CREATE INDEX "idx_resources_tenant_id" ON "resources" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_resources_tenant_candidate" ON "resources" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "idx_resources_tenant_connection" ON "resources" USING btree ("tenant_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_slug_unique" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_skills_category" ON "skills" USING btree ("category");