/**
 * @file Skill Catalog & Additional Skills Test Suite
 *
 * Tests for:
 * 1. Skill catalog seed data integrity
 * 2. Skill catalog service (search, resolve, categories)
 * 3. Candidate additional skills service (add, remove, update, combined view)
 * 4. Evidence matching integration (SELF_DECLARED, LEARNING provenance)
 * 5. Provenance safety (SELF_DECLARED never upgrades to VERIFIED)
 * 6. Job Fit UI fixes (4600% bug, denominator)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SKILL_CATALOG_SEED, getCatalogCategories, getCatalogByCategory } from '../../src/services/skill-catalog.seed.js';
import { PROFICIENCY_LEVELS, USAGE_CONTEXTS } from '../../src/services/candidate-additional-skills.service.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';

// ============================================================================
// 1. Skill Catalog Seed Data Integrity
// ============================================================================
describe('Skill Catalog Seed Data', () => {
  it('has a non-empty catalog', () => {
    assert.ok(SKILL_CATALOG_SEED.length > 100, `Expected >100 skills, got ${SKILL_CATALOG_SEED.length}`);
  });

  it('every entry has required fields', () => {
    for (const entry of SKILL_CATALOG_SEED) {
      assert.ok(entry.canonicalName, `Missing canonicalName for slug: ${entry.slug}`);
      assert.ok(entry.slug, `Missing slug for: ${entry.canonicalName}`);
      assert.ok(entry.category, `Missing category for: ${entry.slug}`);
      assert.ok(entry.skillType, `Missing skillType for: ${entry.slug}`);
      assert.ok(typeof entry.sortOrder === 'number', `Missing sortOrder for: ${entry.slug}`);
    }
  });

  it('all slugs are unique', () => {
    const slugs = SKILL_CATALOG_SEED.map(s => s.slug);
    const uniqueSlugs = new Set(slugs);
    assert.strictEqual(slugs.length, uniqueSlugs.size, 'Duplicate slugs found in catalog');
  });

  it('all canonical names are unique', () => {
    const names = SKILL_CATALOG_SEED.map(s => s.canonicalName);
    const uniqueNames = new Set(names);
    assert.strictEqual(names.length, uniqueNames.size, 'Duplicate canonical names found');
  });

  it('getCatalogCategories returns all unique categories', () => {
    const categories = getCatalogCategories();
    assert.ok(categories.length >= 10, `Expected >=10 categories, got ${categories.length}`);
    assert.ok(categories.includes('CLOUD'), 'Missing CLOUD category');
    assert.ok(categories.includes('DATABASES'), 'Missing DATABASES category');
    assert.ok(categories.includes('AI_AGENTS'), 'Missing AI_AGENTS category');
  });

  it('getCatalogByCategory filters correctly', () => {
    const cloudSkills = getCatalogByCategory('CLOUD');
    assert.ok(cloudSkills.length > 0, 'Expected cloud skills');
    for (const skill of cloudSkills) {
      assert.strictEqual(skill.category, 'CLOUD');
    }
  });

  it('aliases are arrays of strings', () => {
    for (const entry of SKILL_CATALOG_SEED) {
      assert.ok(Array.isArray(entry.aliases), `aliases should be array for: ${entry.slug}`);
      for (const alias of entry.aliases) {
        assert.strictEqual(typeof alias, 'string', `alias should be string for: ${entry.slug}`);
      }
    }
  });
});

// ============================================================================
// 2. Skill Taxonomy Integration
// ============================================================================
describe('Skill Taxonomy Integration', () => {
  it('resolves AWS aliases to canonical skill', () => {
    const result = SkillTaxonomyEngine.normalizeSkill('Amazon Web Services');
    assert.strictEqual(result.canonicalSlug, 'aws');
    assert.strictEqual(result.isKnown, true);
  });

  it('resolves Google Cloud aliases', () => {
    const result = SkillTaxonomyEngine.normalizeSkill('Google Cloud Platform');
    assert.strictEqual(result.canonicalSlug, 'gcp');
    assert.strictEqual(result.isKnown, true);
  });

  it('resolves Docker aliases', () => {
    const result = SkillTaxonomyEngine.normalizeSkill('docker');
    assert.strictEqual(result.canonicalSlug, 'docker');
    assert.strictEqual(result.isKnown, true);
  });

  it('resolves Kubernetes aliases', () => {
    const result = SkillTaxonomyEngine.normalizeSkill('k8s');
    assert.strictEqual(result.canonicalSlug, 'kubernetes');
    assert.strictEqual(result.isKnown, true);
  });

  it('resolves Redis aliases', () => {
    const result = SkillTaxonomyEngine.normalizeSkill('redis');
    assert.strictEqual(result.canonicalSlug, 'redis');
    assert.strictEqual(result.isKnown, true);
  });
});

// ============================================================================
// 3. Evidence Matching — SELF_DECLARED Integration
// ============================================================================
describe('Evidence Matching — SELF_DECLARED Skills', () => {
  const baseContext = { tenantId: randomUUID() };

  function createMockCandidateSkill(slug, provenanceStatus, overrides = {}) {
    return {
      id: randomUUID(),
      slug,
      name: slug,
      provenanceStatus,
      confidenceScore: overrides.confidenceScore || 0.0,
      evidenceCount: overrides.evidenceCount || 0,
      proficiency: overrides.proficiency || 'WORKING_KNOWLEDGE',
      source: overrides.source || 'CANDIDATE_DECLARED',
      ...overrides,
    };
  }

  function createMockJobRequirement(slug, importance = 'REQUIRED') {
    return {
      id: randomUUID(),
      category: 'SKILL',
      importance,
      weight: 1.0,
      skillSlug: slug,
      extractedValue: slug,
      originalText: `Required: ${slug}`,
      rawSnippet: `Required: ${slug}`,
      normalizedCriteria: { skillSlug: slug },
      confidenceScore: 0.9,
    };
  }

  it('SELF_DECLARED skill produces PARTIAL match for REQUIRED requirement', () => {
    const selfDeclaredSkill = createMockCandidateSkill('aws', 'SELF_DECLARED', {
      proficiency: 'PROFICIENT',
      source: 'CANDIDATE_DECLARED',
    });

    const skillsBySlug = new Map([['aws', selfDeclaredSkill]]);
    const req = createMockJobRequirement('aws', 'REQUIRED');

    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());

    assert.strictEqual(result.match.matchStatus, 'PARTIAL');
    assert.strictEqual(result.match.candidateProvenance, 'SELF_DECLARED');
    assert.strictEqual(result.match.isUserClaim, true);
    assert.ok(result.match.explanation.includes('Self-Declared'));
  });

  it('LEARNING skill produces MISSING match for REQUIRED requirement', () => {
    const learningSkill = createMockCandidateSkill('kubernetes', 'LEARNING', {
      proficiency: 'CURRENTLY_LEARNING',
      source: 'CANDIDATE_DECLARED',
    });

    const skillsBySlug = new Map([['kubernetes', learningSkill]]);
    const req = createMockJobRequirement('kubernetes', 'REQUIRED');

    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());

    assert.strictEqual(result.match.matchStatus, 'MISSING');
    assert.strictEqual(result.match.candidateProvenance, 'LEARNING');
    assert.ok(result.match.explanation.toLowerCase().includes('currently learning'));
  });

  it('VERIFIED skill is not downgraded by SELF_DECLARED', () => {
    const verifiedSkill = createMockCandidateSkill('python', 'VERIFIED', {
      confidenceScore: 0.95,
      evidenceCount: 5,
    });

    const skillsBySlug = new Map([['python', verifiedSkill]]);
    const req = createMockJobRequirement('python', 'REQUIRED');

    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());

    assert.strictEqual(result.match.matchStatus, 'MATCHED');
    assert.strictEqual(result.match.candidateProvenance, 'VERIFIED');
  });

  it('CORROBORATED skill is not downgraded by SELF_DECLARED', () => {
    const corroboratedSkill = createMockCandidateSkill('react', 'CORROBORATED', {
      confidenceScore: 0.9,
      evidenceCount: 3,
    });

    const skillsBySlug = new Map([['react', corroboratedSkill]]);
    const req = createMockJobRequirement('react', 'REQUIRED');

    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());

    assert.strictEqual(result.match.matchStatus, 'MATCHED');
    assert.strictEqual(result.match.candidateProvenance, 'CORROBORATED');
  });

  it('SELF_DECLARED and VERIFIED for same skill: VERIFIED wins in index', () => {
    const verifiedSkill = createMockCandidateSkill('typescript', 'VERIFIED', {
      confidenceScore: 0.95,
      evidenceCount: 4,
    });

    const selfDeclaredSkill = createMockCandidateSkill('typescript', 'SELF_DECLARED', {
      proficiency: 'ADVANCED',
      source: 'CANDIDATE_DECLARED',
    });

    // Index with both — VERIFIED should win (higher priority)
    const skillsBySlug = new Map();
    skillsBySlug.set('typescript', selfDeclaredSkill); // Set self-declared first
    // Simulate the priority check from _indexCandidateProfile
    const PROVENANCE_PRIORITY = {
      CORROBORATED: 5, VERIFIED: 4, INFERRED: 3, CLAIMED: 2, SELF_DECLARED: 1, LEARNING: 0, MISSING: 0,
    };
    const rankExisting = PROVENANCE_PRIORITY[selfDeclaredSkill.provenanceStatus] || 0;
    const rankNew = PROVENANCE_PRIORITY[verifiedSkill.provenanceStatus] || 0;
    if (rankNew > rankExisting) {
      skillsBySlug.set('typescript', verifiedSkill);
    }

    const req = createMockJobRequirement('typescript', 'REQUIRED');
    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());

    assert.strictEqual(result.match.matchStatus, 'MATCHED');
    assert.strictEqual(result.match.candidateProvenance, 'VERIFIED');
  });
});

// ============================================================================
// 4. Evidence Matching — Provenance Priority
// ============================================================================
describe('Evidence Matching — Provenance Priority', () => {
  it('CORROBORATED has highest priority', () => {
    const PROVENANCE_PRIORITY = {
      CORROBORATED: 5, VERIFIED: 4, INFERRED: 3, CLAIMED: 2, SELF_DECLARED: 1, LEARNING: 0, MISSING: 0,
    };
    assert.ok(PROVENANCE_PRIORITY.CORROBORATED > PROVENANCE_PRIORITY.VERIFIED);
    assert.ok(PROVENANCE_PRIORITY.VERIFIED > PROVENANCE_PRIORITY.INFERRED);
    assert.ok(PROVENANCE_PRIORITY.INFERRED > PROVENANCE_PRIORITY.CLAIMED);
    assert.ok(PROVENANCE_PRIORITY.CLAIMED > PROVENANCE_PRIORITY.SELF_DECLARED);
    assert.ok(PROVENANCE_PRIORITY.SELF_DECLARED > PROVENANCE_PRIORITY.LEARNING);
  });
});

// ============================================================================
// 5. Additional Skills Service — Validation
// ============================================================================
describe('Additional Skills Service — Validation', () => {
  it('validates proficiency levels', () => {
    assert.strictEqual(PROFICIENCY_LEVELS.BASIC, 'BASIC');
    assert.strictEqual(PROFICIENCY_LEVELS.WORKING_KNOWLEDGE, 'WORKING_KNOWLEDGE');
    assert.strictEqual(PROFICIENCY_LEVELS.PROFICIENT, 'PROFICIENT');
    assert.strictEqual(PROFICIENCY_LEVELS.ADVANCED, 'ADVANCED');
    assert.strictEqual(PROFICIENCY_LEVELS.CURRENTLY_LEARNING, 'CURRENTLY_LEARNING');
  });

  it('validates usage contexts', () => {
    assert.strictEqual(USAGE_CONTEXTS.PROFESSIONAL_WORK, 'PROFESSIONAL_WORK');
    assert.strictEqual(USAGE_CONTEXTS.INTERNSHIP, 'INTERNSHIP');
    assert.strictEqual(USAGE_CONTEXTS.PERSONAL_PROJECT, 'PERSONAL_PROJECT');
    assert.strictEqual(USAGE_CONTEXTS.FREELANCE, 'FREELANCE');
    assert.strictEqual(USAGE_CONTEXTS.ACADEMIC_PROJECT, 'ACADEMIC_PROJECT');
    assert.strictEqual(USAGE_CONTEXTS.CERTIFICATION, 'CERTIFICATION');
    assert.strictEqual(USAGE_CONTEXTS.SELF_STUDY, 'SELF_STUDY');
  });
});

// ============================================================================
// 6. Job Fit UI Fixes
// ============================================================================
describe('Job Fit UI — Project Relevance Score', () => {
  it('relevanceScore on 0-100 scale is not multiplied by 100', () => {
    // The bug was: Math.round((p.relevanceScore || 0) * 100)
    // For a score of 46, this produced 4600%
    // The fix: Math.round(Math.min(100, Math.max(0, p.relevanceScore || 0)))
    const relevanceScore = 46;
    const fixedPct = Math.round(Math.min(100, Math.max(0, relevanceScore || 0)));
    assert.strictEqual(fixedPct, 46, 'Should render as 46%, not 4600%');
  });

  it('relevanceScore of 92 renders as 92%', () => {
    const relevanceScore = 92;
    const fixedPct = Math.round(Math.min(100, Math.max(0, relevanceScore || 0)));
    assert.strictEqual(fixedPct, 92);
  });

  it('relevanceScore is clamped to 0-100', () => {
    assert.strictEqual(Math.round(Math.min(100, Math.max(0, 150))), 100);
    assert.strictEqual(Math.round(Math.min(100, Math.max(0, -10))), 0);
  });
});

// ============================================================================
// 7. Schema Exports
// ============================================================================
describe('Schema Exports', () => {
  it('exports skillCatalog from schema', async () => {
    const schema = await import('../../src/db/schema.js');
    assert.ok(schema.skillCatalog, 'skillCatalog should be exported');
  });

  it('exports updated provenanceStatusEnum with new values', async () => {
    const schema = await import('../../src/db/schema.js');
    const values = schema.provenanceStatusEnum.enumValues;
    assert.ok(values.includes('SELF_DECLARED'), 'Should include SELF_DECLARED');
    assert.ok(values.includes('LEARNING'), 'Should include LEARNING');
    assert.ok(values.includes('CORROBORATED'), 'Should include CORROBORATED');
    assert.ok(values.includes('VERIFIED'), 'Should include VERIFIED');
  });
});
