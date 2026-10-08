-- Stop all old application instances before applying; do not mixed-version roll out.
-- Legacy families have no trustworthy lineage (the old code could branch).
-- Preserve history, but require fresh authorization rather than infer ownership.
ALTER TABLE oauth_tokens
  ADD COLUMN authorization_code_id uuid REFERENCES oauth_authorization_codes(id) ON DELETE SET NULL,
  ADD COLUMN predecessor_id uuid REFERENCES oauth_tokens(id) ON DELETE SET NULL,
  ADD COLUMN rotated_at timestamptz,
  ADD COLUMN family_revoked_at timestamptz;
--> statement-breakpoint
UPDATE oauth_tokens SET is_revoked = true, revoked_at = COALESCE(revoked_at, now()),
  family_revoked_at = now(), updated_at = now();
--> statement-breakpoint
-- Unconsumed pre-upgrade codes also require fresh consent.
UPDATE oauth_authorization_codes SET is_consumed = true,
  consumed_at = COALESCE(consumed_at, now()) WHERE is_consumed = false;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_oauth_tokens_authorization_code ON oauth_tokens(authorization_code_id);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_oauth_tokens_predecessor ON oauth_tokens(predecessor_id);
--> statement-breakpoint
CREATE UNIQUE INDEX uq_oauth_tokens_active_family ON oauth_tokens(family_id) WHERE is_revoked = false;
