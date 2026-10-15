CREATE TABLE resume_generations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  source_resume_id uuid NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_content_hash text NOT NULL CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
  parent_generation_id uuid REFERENCES resume_generations(id),
  application_id uuid REFERENCES job_applications(id) ON DELETE SET NULL,
  application_package_id uuid REFERENCES application_packages(id) ON DELETE SET NULL,
  origin text NOT NULL CHECK (origin IN ('WEB','MCP','EXTENSION','STUDIO_ENTRY','REGENERATION')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  encrypted_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX resume_generations_owner_request_unique ON resume_generations(tenant_id,candidate_id,idempotency_key);
CREATE INDEX idx_resume_generations_owner ON resume_generations(tenant_id,user_id,candidate_id,created_at);
CREATE INDEX idx_resume_generations_user ON resume_generations(user_id);
CREATE INDEX idx_resume_generations_candidate ON resume_generations(candidate_id);
CREATE INDEX idx_resume_generations_source ON resume_generations(source_resume_id);
CREATE INDEX idx_resume_generations_parent ON resume_generations(parent_generation_id);
CREATE INDEX idx_resume_generations_application ON resume_generations(application_id);
CREATE INDEX idx_resume_generations_package ON resume_generations(application_package_id);
--> statement-breakpoint
CREATE FUNCTION guard_resume_generation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c candidates%ROWTYPE; r resumes%ROWTYPE; p resume_generations%ROWTYPE;
  a job_applications%ROWTYPE; k application_packages%ROWTYPE; u users%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only FK-driven unlinking after explicit application/package deletion is allowed.
    IF (to_jsonb(NEW) - 'application_id' - 'application_package_id') IS DISTINCT FROM
       (to_jsonb(OLD) - 'application_id' - 'application_package_id')
       OR (NEW.application_id IS DISTINCT FROM OLD.application_id AND NEW.application_id IS NOT NULL)
       OR (NEW.application_package_id IS DISTINCT FROM OLD.application_package_id AND NEW.application_package_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Resume generation is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM candidates WHERE id=NEW.candidate_id FOR SHARE;
  SELECT * INTO u FROM users WHERE id=NEW.user_id FOR SHARE;
  SELECT * INTO r FROM resumes WHERE id=NEW.source_resume_id FOR SHARE;
  IF c.tenant_id IS DISTINCT FROM NEW.tenant_id OR c.user_id IS DISTINCT FROM NEW.user_id
    OR c.status::text <> 'ACTIVE' OR u.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.candidate_id IS DISTINCT FROM NEW.candidate_id
    OR NOT coalesce(r.is_base_resume,false) OR r.lifecycle_state::text <> 'BASE_RESUME'
    OR r.version IS DISTINCT FROM NEW.source_version OR r.content_hash IS DISTINCT FROM NEW.source_content_hash THEN
    RAISE EXCEPTION 'Generation source/owner mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.parent_generation_id IS NOT NULL THEN
    SELECT * INTO p FROM resume_generations WHERE id=NEW.parent_generation_id FOR SHARE;
    IF p.tenant_id IS DISTINCT FROM NEW.tenant_id OR p.candidate_id IS DISTINCT FROM NEW.candidate_id THEN
      RAISE EXCEPTION 'Generation parent scope mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.application_id IS NOT NULL THEN
    SELECT * INTO a FROM job_applications WHERE id=NEW.application_id FOR SHARE;
    IF a.tenant_id IS DISTINCT FROM NEW.tenant_id OR a.candidate_id IS DISTINCT FROM NEW.candidate_id THEN
      RAISE EXCEPTION 'Generation application scope mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.application_package_id IS NOT NULL THEN
    SELECT * INTO k FROM application_packages WHERE id=NEW.application_package_id FOR SHARE;
    IF k.tenant_id IS DISTINCT FROM NEW.tenant_id OR k.candidate_id IS DISTINCT FROM NEW.candidate_id
      OR k.application_id IS DISTINCT FROM NEW.application_id THEN
      RAISE EXCEPTION 'Generation package scope mismatch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER resume_generation_guard BEFORE INSERT OR UPDATE ON resume_generations
FOR EACH ROW EXECUTE FUNCTION guard_resume_generation();
