-- Migration 0009: Canonical Skill Registry + Additional Skills
-- Adds:
-- 1. SELF_DECLARED and LEARNING to provenance_status enum
-- 2. proficiency, source, usageContext, yearsExperience, lastUsedAt, notes to candidate_skills
-- 3. skill_catalog table for the reusable UI skill catalog

-- 1. Extend provenance_status enum with new values
ALTER TYPE "provenance_status" ADD VALUE IF NOT EXISTS 'CORROBORATED' BEFORE 'INFERRED';
ALTER TYPE "provenance_status" ADD VALUE IF NOT EXISTS 'SELF_DECLARED' BEFORE 'MISSING';
ALTER TYPE "provenance_status" ADD VALUE IF NOT EXISTS 'LEARNING' BEFORE 'MISSING';

-- 2. Add columns to candidate_skills for Additional Skills support
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "proficiency" varchar(30) DEFAULT 'WORKING_KNOWLEDGE';
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "source" varchar(30) DEFAULT 'GITHUB';
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "usage_context" varchar(50);
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "years_experience" real;
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
ALTER TABLE "candidate_skills" ADD COLUMN IF NOT EXISTS "notes" text;

-- 3. Create skill_catalog table for the reusable UI catalog
CREATE TABLE IF NOT EXISTS "skill_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "canonical_name" varchar(120) NOT NULL,
  "slug" varchar(80) NOT NULL,
  "category" varchar(30) NOT NULL,
  "subcategory" varchar(80),
  "skill_type" varchar(30) DEFAULT 'TECHNOLOGY',
  "description" text,
  "aliases" jsonb DEFAULT '[]',
  "parent_skill_id" uuid,
  "active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS "skill_catalog_slug_unique" ON "skill_catalog" ("slug");

-- Index on category for fast filtering
CREATE INDEX IF NOT EXISTS "idx_skill_catalog_category" ON "skill_catalog" ("category");

-- Index on subcategory
CREATE INDEX IF NOT EXISTS "idx_skill_catalog_subcategory" ON "skill_catalog" ("subcategory");

-- Index on active for filtering
CREATE INDEX IF NOT EXISTS "idx_skill_catalog_active" ON "skill_catalog" ("active");

-- Index on sort_order for ordering
CREATE INDEX IF NOT EXISTS "idx_skill_catalog_sort_order" ON "skill_catalog" ("sort_order");

-- Foreign key for parent_skill_id (self-referential)
ALTER TABLE "skill_catalog" ADD CONSTRAINT "skill_catalog_parent_skill_id_fk"
  FOREIGN KEY ("parent_skill_id") REFERENCES "skill_catalog"("id") ON DELETE SET NULL;
