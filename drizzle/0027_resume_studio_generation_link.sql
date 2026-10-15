ALTER TABLE resume_studio_drafts ADD COLUMN generation_id uuid REFERENCES resume_generations(id);
--> statement-breakpoint
CREATE UNIQUE INDEX studio_drafts_generation_unique ON resume_studio_drafts(generation_id);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_resume_studio_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c candidates%ROWTYPE; r resumes%ROWTYPE; u users%ROWTYPE; g resume_generations%ROWTYPE;
BEGIN
  SELECT * INTO c FROM candidates WHERE id = NEW.candidate_id FOR SHARE;
  SELECT * INTO u FROM users WHERE id = NEW.user_id FOR SHARE;
  IF c.tenant_id IS DISTINCT FROM NEW.tenant_id OR c.user_id IS DISTINCT FROM NEW.user_id
    OR u.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Draft owner scope mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.generation_id IS NOT NULL THEN
      SELECT * INTO g FROM resume_generations WHERE id=NEW.generation_id FOR SHARE;
      IF g.tenant_id IS DISTINCT FROM NEW.tenant_id OR g.user_id IS DISTINCT FROM NEW.user_id
        OR g.candidate_id IS DISTINCT FROM NEW.candidate_id OR g.source_resume_id IS DISTINCT FROM NEW.source_resume_id
        OR g.source_version IS DISTINCT FROM NEW.source_version OR g.source_content_hash IS DISTINCT FROM NEW.source_content_hash
        OR NEW.revision <> 1 THEN
        RAISE EXCEPTION 'Draft generation scope/version mismatch' USING ERRCODE='23514';
      END IF;
    ELSE
    SELECT * INTO r FROM resumes WHERE id = NEW.source_resume_id FOR SHARE;
    IF r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.candidate_id IS DISTINCT FROM NEW.candidate_id
      OR NOT coalesce(r.is_base_resume,false) OR r.lifecycle_state::text <> 'BASE_RESUME'
      OR r.version IS DISTINCT FROM NEW.source_version OR r.content_hash IS DISTINCT FROM NEW.source_content_hash
      OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'Draft master scope/version mismatch' USING ERRCODE='23514';
    END IF;
    END IF;
  ELSE
    IF NEW.generation_id IS DISTINCT FROM OLD.generation_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
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
