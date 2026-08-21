CREATE TYPE "public"."connection_auth_type" AS ENUM('APP_INSTALLATION', 'OAUTH2_CODE', 'API_KEY', 'SERVICE_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."resource_connection_status" AS ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."resource_provider" AS ENUM('GITHUB_APP', 'GITLAB', 'GOOGLE_DRIVE', 'ONEDRIVE', 'NOTION', 'CUSTOM_API');--> statement-breakpoint
CREATE TABLE "resource_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "resource_provider" NOT NULL,
	"auth_type" "connection_auth_type" NOT NULL,
	"display_name" text NOT NULL,
	"external_account_id" text NOT NULL,
	"external_account_name" text,
	"installation_id" text,
	"encrypted_credentials" text NOT NULL,
	"key_version" text DEFAULT 'v1' NOT NULL,
	"status" "resource_connection_status" DEFAULT 'PENDING' NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"expires_at" timestamp with time zone,
	"refreshed_at" timestamp with time zone,
	"last_validated_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resource_connections" ADD CONSTRAINT "resource_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_connections" ADD CONSTRAINT "resource_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_connections_tenant_provider_account_unique" ON "resource_connections" USING btree ("tenant_id","provider","external_account_id");--> statement-breakpoint
CREATE INDEX "idx_resource_connections_tenant_id" ON "resource_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_resource_connections_user_id" ON "resource_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_resource_connections_tenant_status" ON "resource_connections" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_resource_connections_expires_at" ON "resource_connections" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_resource_connections_key_version" ON "resource_connections" USING btree ("key_version");