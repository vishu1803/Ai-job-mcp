CREATE TABLE resume_studio_proposals (
  id uuid PRIMARY KEY,
  draft_id uuid NOT NULL REFERENCES resume_studio_drafts(id) ON DELETE CASCADE,
  base_revision integer NOT NULL CHECK (base_revision > 0),
  node_id uuid NOT NULL,
  base_content_hash text NOT NULL CHECK (base_content_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot_hash text NOT NULL CHECK (source_snapshot_hash ~ '^[a-f0-9]{64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  encrypted_payload text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  decision_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK ((status = 'PENDING' AND decision_revision IS NULL AND decided_at IS NULL)
    OR (status <> 'PENDING' AND decision_revision > 0 AND decided_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX idx_studio_proposals_draft ON resume_studio_proposals(draft_id, base_revision);
--> statement-breakpoint
CREATE FUNCTION guard_resume_studio_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d resume_studio_drafts%ROWTYPE;
BEGIN
  SELECT * INTO d FROM resume_studio_drafts WHERE id = NEW.draft_id FOR SHARE;
  IF TG_OP = 'INSERT' THEN
    IF d.revision IS DISTINCT FROM NEW.base_revision OR d.content_hash IS DISTINCT FROM NEW.base_content_hash
      OR d.source_snapshot_hash IS DISTINCT FROM NEW.source_snapshot_hash OR NEW.status <> 'PENDING' THEN
      RAISE EXCEPTION 'Proposal base draft mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.status <> 'PENDING' OR NEW.status NOT IN ('ACCEPTED','REJECTED')
      OR NEW.id IS DISTINCT FROM OLD.id OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
      OR NEW.node_id IS DISTINCT FROM OLD.node_id OR NEW.base_revision IS DISTINCT FROM OLD.base_revision
      OR NEW.base_content_hash IS DISTINCT FROM OLD.base_content_hash
      OR NEW.source_snapshot_hash IS DISTINCT FROM OLD.source_snapshot_hash
      OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash OR NEW.encrypted_payload IS DISTINCT FROM OLD.encrypted_payload
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR d.source_snapshot_hash IS DISTINCT FROM NEW.source_snapshot_hash
      OR (NEW.status='ACCEPTED' AND (d.revision::bigint <> NEW.base_revision::bigint + 1 OR NEW.decision_revision IS DISTINCT FROM d.revision))
      OR (NEW.status='REJECTED' AND (d.revision IS DISTINCT FROM NEW.base_revision OR NEW.decision_revision IS DISTINCT FROM d.revision
        OR d.content_hash IS DISTINCT FROM NEW.base_content_hash)) THEN
      RAISE EXCEPTION 'Proposal body/decision is immutable or stale' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER studio_proposal_guard BEFORE INSERT OR UPDATE ON resume_studio_proposals
FOR EACH ROW EXECUTE FUNCTION guard_resume_studio_proposal();
