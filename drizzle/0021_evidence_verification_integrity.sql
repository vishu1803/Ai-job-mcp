-- ISSUE-06: preserve historical rows; remove unsupported verification, never re-sign/re-label old proof.
UPDATE evidence_items SET metadata = metadata || jsonb_build_object('verification',
  jsonb_build_object('version','github-source-fact-v1','status','OBSERVED',
    'reason','HISTORICAL_PROVENANCE_REVALIDATION_REQUIRED','previousMetadata',metadata->'verification'))
WHERE source_provider = 'GITHUB_APP';
--> statement-breakpoint
UPDATE candidate_skills SET metadata = metadata || jsonb_build_object('issue06HistoricalStatus',provenance_status),
  provenance_status = CASE WHEN metadata->>'isUserClaim' = 'true' OR metadata->>'source' = 'RESUME_UPLOAD'
    THEN 'CLAIMED'::provenance_status ELSE 'INFERRED'::provenance_status END
WHERE provenance_status IN ('VERIFIED','CORROBORATED');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invalidate_repository_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.connection_id IS DISTINCT FROM NEW.connection_id
    OR OLD.candidate_id IS DISTINCT FROM NEW.candidate_id OR OLD.external_resource_id IS DISTINCT FROM NEW.external_resource_id
    OR OLD.metadata->>'evidenceEpoch' IS DISTINCT FROM NEW.metadata->>'evidenceEpoch' THEN
    IF OLD.metadata->>'evidenceEpoch' IS NOT DISTINCT FROM NEW.metadata->>'evidenceEpoch' THEN
      NEW.metadata := jsonb_set(NEW.metadata, '{evidenceEpoch}', to_jsonb(gen_random_uuid()::text));
    END IF;
    UPDATE evidence_items SET metadata = jsonb_set(metadata, '{verification}',
      coalesce(metadata->'verification','{}'::jsonb) || '{"status":"INVALID","reason":"SOURCE_REVALIDATION_REQUIRED"}'::jsonb)
    WHERE resource_id = OLD.id AND source_provider = 'GITHUB_APP';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER resource_evidence_invalidation BEFORE UPDATE ON resources
FOR EACH ROW EXECUTE FUNCTION invalidate_repository_evidence();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION invalidate_connection_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.encrypted_credentials IS DISTINCT FROM OLD.encrypted_credentials
    OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    UPDATE resources SET metadata = jsonb_set(metadata, '{evidenceEpoch}', to_jsonb(gen_random_uuid()::text))
    WHERE connection_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER connection_evidence_invalidation AFTER UPDATE ON resource_connections
FOR EACH ROW EXECUTE FUNCTION invalidate_connection_evidence();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_evidence_verification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r resources%ROWTYPE; p jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
    OR NEW.source_provider IS DISTINCT FROM OLD.source_provider OR NEW.source_location IS DISTINCT FROM OLD.source_location
    OR NEW.evidence_type IS DISTINCT FROM OLD.evidence_type) THEN
    RAISE EXCEPTION 'Evidence provenance is immutable' USING ERRCODE='23514';
  END IF;
  SELECT * INTO r FROM resources WHERE id = NEW.resource_id FOR SHARE;
  IF r.tenant_id IS DISTINCT FROM NEW.tenant_id OR r.candidate_id IS DISTINCT FROM NEW.candidate_id THEN
    RAISE EXCEPTION 'Evidence source scope mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.skill_id IS NOT NULL AND TG_OP = 'UPDATE' AND OLD.skill_id IS NOT NULL AND NEW.skill_id <> OLD.skill_id THEN
    RAISE EXCEPTION 'Evidence skill binding is immutable' USING ERRCODE='23514';
  END IF;
  p := NEW.metadata->'verification';
  IF p->>'status' = 'VERIFIED' THEN
    IF NEW.source_provider <> 'GITHUB_APP' OR NEW.evidence_type <> 'CODE_IMPORT_USAGE'
      OR p->>'version' IS DISTINCT FROM 'github-source-fact-v1'
      OR p->>'scope' IS DISTINCT FROM 'REPOSITORY_STATIC_REFERENCE'
      OR p->>'method' IS DISTINCT FROM 'ACORN_AST'
      OR p->>'validation' IS DISTINCT FROM 'PINNED_TREE_AND_GIT_BLOB'
      OR p->>'tenantId' IS DISTINCT FROM NEW.tenant_id::text
      OR p->>'candidateId' IS DISTINCT FROM NEW.candidate_id::text
      OR p->>'resourceId' IS DISTINCT FROM NEW.resource_id::text
      OR p->>'epoch' IS DISTINCT FROM r.metadata->>'evidenceEpoch'
      OR p->>'epoch' IS NULL OR r.status <> 'ACTIVE'
      OR coalesce(p->>'commitSha','') !~ '^[a-f0-9]{40}$'
      OR coalesce(p->>'blobSha','') !~ '^[a-f0-9]{40}$'
      OR p->>'commitSha' IS DISTINCT FROM NEW.source_location->>'commitSha'
      OR p->>'filePath' IS DISTINCT FROM NEW.source_location->>'filePath'
      OR p->'lineRange' IS DISTINCT FROM NEW.source_location->'lineRange'
      OR coalesce(NEW.source_location->'lineRange'->>'start','') !~ '^[1-9][0-9]{0,6}$'
      OR coalesce(NEW.source_location->'lineRange'->>'end','') !~ '^[1-9][0-9]{0,6}$'
      OR (NEW.source_location->'lineRange'->>'end')::int < (NEW.source_location->'lineRange'->>'start')::int
      OR p->>'observedAt' IS NULL OR (p->>'observedAt')::timestamptz > clock_timestamp()
      OR (p->>'observedAt')::timestamptz < clock_timestamp() - interval '24 hours'
      OR p->'attribution'->>'status' IS DISTINCT FROM 'UNATTRIBUTED'
      OR coalesce(p->>'repositoryId','') !~ '^[0-9]+$'
      OR coalesce(p->>'repository','') !~ '^[A-Za-z0-9-]+/[A-Za-z0-9_.-]+$'
      OR p->>'repositoryUrl' IS DISTINCT FROM 'https://github.com/' || (p->>'repository')
      OR coalesce(NEW.metadata->>'rawImport','') = ''
      OR p->>'fact' IS DISTINCT FROM format('Repository %s contains a static module reference to "%s" in %s:%s at %s.',
        p->>'repository', NEW.metadata->>'rawImport', p->>'filePath', NEW.source_location->'lineRange'->>'start', p->>'commitSha')
      OR NOT (p->>'repositoryId' = r.external_resource_id OR p->>'repository' = r.external_resource_id)
      OR NOT EXISTS (SELECT 1 FROM resource_connections c JOIN candidates ca ON ca.id = NEW.candidate_id
        WHERE c.id = r.connection_id AND c.tenant_id = NEW.tenant_id AND ca.tenant_id = NEW.tenant_id
        AND c.user_id = ca.user_id AND c.status = 'ACTIVE' AND (c.expires_at IS NULL OR c.expires_at > now())) THEN
      RAISE EXCEPTION 'Source verification requirements not met' USING ERRCODE='23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.metadata->'verification'->>'status' = 'INVALID'
      AND OLD.metadata->'verification'->>'epoch' = p->>'epoch' THEN
      RAISE EXCEPTION 'Invalid evidence requires a new ingestion epoch' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER evidence_verification_guard BEFORE INSERT OR UPDATE ON evidence_items
FOR EACH ROW EXECUTE FUNCTION guard_evidence_verification();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_candidate_skill_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- No existing writer independently verifies candidate competence. Repository source
  -- facts remain usable, but a candidate-level skill label is an inference/self-report.
  IF NEW.provenance_status IN ('VERIFIED','CORROBORATED') THEN
    NEW.metadata := NEW.metadata || jsonb_build_object('issue06RejectedPromotion',NEW.provenance_status);
    NEW.provenance_status := 'INFERRED';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.provenance_status = 'CLAIMED' AND NEW.provenance_status = 'INFERRED' THEN
    NEW.provenance_status := 'CLAIMED';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER candidate_skill_verification_guard BEFORE INSERT OR UPDATE ON candidate_skills
FOR EACH ROW EXECUTE FUNCTION guard_candidate_skill_verification();
