CREATE TABLE resume_studio_documents (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES resume_studio_drafts(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot_hash text NOT NULL CHECK (source_snapshot_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  encrypted_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (draft_id,revision) REFERENCES resume_studio_revisions(draft_id,revision) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_studio_documents_revision ON resume_studio_documents(draft_id,revision);
--> statement-breakpoint
CREATE FUNCTION guard_resume_studio_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d resume_studio_drafts%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Studio document is immutable' USING ERRCODE='23514'; END IF;
  SELECT * INTO d FROM resume_studio_drafts WHERE id=NEW.draft_id FOR SHARE;
  IF d.revision IS DISTINCT FROM NEW.revision OR d.content_hash IS DISTINCT FROM NEW.content_hash
    OR d.source_snapshot_hash IS DISTINCT FROM NEW.source_snapshot_hash THEN
    RAISE EXCEPTION 'Studio document draft mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER studio_document_guard BEFORE INSERT OR UPDATE ON resume_studio_documents
FOR EACH ROW EXECUTE FUNCTION guard_resume_studio_document();
