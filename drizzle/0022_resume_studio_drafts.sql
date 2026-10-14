CREATE TABLE resume_studio_drafts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  source_resume_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot_hash text NOT NULL CHECK (source_snapshot_hash ~ '^[a-f0-9]{64}$'),
  encrypted_source text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  encrypted_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_studio_drafts_owner ON resume_studio_drafts (tenant_id, user_id, candidate_id);
--> statement-breakpoint
CREATE TABLE resume_studio_revisions (
  draft_id uuid NOT NULL REFERENCES resume_studio_drafts(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  encrypted_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, revision)
);
--> statement-breakpoint
CREATE FUNCTION guard_resume_studio_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c candidates%ROWTYPE; r resumes%ROWTYPE; u users%ROWTYPE;
BEGIN
  SELECT * INTO c FROM candidates WHERE id = NEW.candidate_id FOR SHARE;
  SELECT * INTO u FROM users WHERE id = NEW.user_id FOR SHARE;
  IF c.tenant_id IS DISTINCT FROM NEW.tenant_id OR c.user_id IS DISTINCT FROM NEW.user_id
    OR u.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Draft owner scope mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO r FROM resumes WHERE id = NEW.source_resume_id FOR SHARE;
    IF r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.candidate_id IS DISTINCT FROM NEW.candidate_id
      OR NOT coalesce(r.is_base_resume,false) OR r.lifecycle_state::text <> 'BASE_RESUME'
      OR r.version IS DISTINCT FROM NEW.source_version OR r.content_hash IS DISTINCT FROM NEW.source_content_hash
      OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'Draft master scope/version mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
      OR NEW.source_resume_id IS DISTINCT FROM OLD.source_resume_id OR NEW.source_version IS DISTINCT FROM OLD.source_version
      OR NEW.source_content_hash IS DISTINCT FROM OLD.source_content_hash
      OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
      OR NEW.encrypted_source IS DISTINCT FROM OLD.encrypted_source OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.revision::bigint <> OLD.revision::bigint + 1 THEN
      RAISE EXCEPTION 'Draft source is immutable; revision must advance once' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER studio_draft_scope_guard BEFORE INSERT OR UPDATE ON resume_studio_drafts
FOR EACH ROW EXECUTE FUNCTION guard_resume_studio_draft();
--> statement-breakpoint
CREATE FUNCTION guard_resume_studio_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d resume_studio_drafts%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Draft revision snapshots are immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO d FROM resume_studio_drafts WHERE id = NEW.draft_id FOR SHARE;
  IF d.revision IS DISTINCT FROM NEW.revision OR d.content_hash IS DISTINCT FROM NEW.content_hash
    OR d.encrypted_content IS DISTINCT FROM NEW.encrypted_content THEN
    RAISE EXCEPTION 'Draft revision snapshot mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER studio_revision_guard BEFORE INSERT OR UPDATE ON resume_studio_revisions
FOR EACH ROW EXECUTE FUNCTION guard_resume_studio_revision();
