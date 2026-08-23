CREATE TYPE "public"."mcp_client_type" AS ENUM('PERSONAL', 'THIRD_PARTY');--> statement-breakpoint
CREATE TYPE "public"."mcp_token_status" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "mcp_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"status" "mcp_token_status" DEFAULT 'ACTIVE' NOT NULL,
	"client_type" "mcp_client_type" DEFAULT 'PERSONAL' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_api_tokens" ADD CONSTRAINT "mcp_api_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_api_tokens" ADD CONSTRAINT "mcp_api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_api_tokens_token_hash_unique" ON "mcp_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_mcp_api_tokens_tenant_id" ON "mcp_api_tokens" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_api_tokens_user_id" ON "mcp_api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_mcp_api_tokens_tenant_status" ON "mcp_api_tokens" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_mcp_api_tokens_user_status" ON "mcp_api_tokens" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_mcp_api_tokens_expires_at" ON "mcp_api_tokens" USING btree ("expires_at");