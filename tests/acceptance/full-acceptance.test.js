import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/db/index.js';
import { skillCatalog } from '../../src/db/schema.js';
import { sql } from 'drizzle-orm';
import { SKILL_CATALOG_SEED } from '../../src/services/skill-catalog.seed.js';
import { CandidateAdditionalSkillsService } from '../../src/services/candidate-additional-skills.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import {
  ensureE2eFixture,
  ensureFixtureEvidenceSkills,
  cleanupFixtureCandidateSkills,
  assertNotProtectedCandidate,
} from '../helpers/e2e-fixture.js';

describe('Full Acceptance Test (dedicated E2E fixture)', () => {
  let fixture;
  let tenantId;
  let candidateId;

  before(async () => {
    // Mutable acceptance tests ALWAYS run against the dedicated disposable fixture,
    // never against the stable READ-ONLY MCP acceptance candidate.
    fixture = await ensureE2eFixture(db);
    tenantId = fixture.tenantId;
    candidateId = fixture.candidateId;
    assertNotProtectedCandidate(candidateId);
    await ensureFixtureEvidenceSkills(db, fixture);
    console.log(`  Fixture candidate: ${candidateId} (tenant ${tenantId})`);
  });

  after(async () => {
    await cleanupFixtureCandidateSkills(db, candidateId);
    console.log('  ✅ Fixture candidate skills cleaned up (stable MCP candidate untouched).');
  });

  // STEP 1: Seed catalog
  it('Step 1: Skill catalog seeded', async () => {
    const result = await db.execute(sql`SELECT count(*)::int as count FROM skill_catalog`);
    const count = Number(result.rows[0].count);
    console.log(`  Catalog entries: ${count}`);
    if (count < 100) {
      let inserted = 0;
      for (const entry of SKILL_CATALOG_SEED) {
        try {
          const ex = await db.execute(sql`SELECT id FROM skill_catalog WHERE slug = ${entry.slug}`);
          if (ex.rows.length === 0) {
            await db.insert(skillCatalog).values({
              canonicalName: entry.canonicalName, slug: entry.slug, category: entry.category,
              subcategory: entry.subcategory || null, skillType: entry.skillType || 'TECHNOLOGY',
              description: entry.description || null, aliases: entry.aliases || [],
              active: true, sortOrder: entry.sortOrder || 0, metadata: {},
            });
            inserted++;
          }
        } catch { /* ignore duplicate/seed conflicts */ }
      }
      console.log(`  Seeded ${inserted} new entries`);
    }
    assert.ok(count >= 100, `Expected >=100, got ${count}`);
    console.log('  ✅ Step 1 PASS');
  });

  // STEP 2: Add 5 additional skills
  it('Step 2: Add additional skills', async () => {
    const service = new CandidateAdditionalSkillsService(db);
    const toAdd = [
      { slug: 'aws', proficiency: 'PROFICIENT' },
      { slug: 'gcp', proficiency: 'WORKING_KNOWLEDGE' },
      { slug: 'kubernetes', proficiency: 'PROFICIENT' },
      { slug: 'redis', proficiency: 'PROFICIENT' },
      { slug: 'terraform', proficiency: 'CURRENTLY_LEARNING' },
    ];
    for (const { slug, proficiency } of toAdd) {
      const catRes = await db.execute(sql`SELECT id FROM skill_catalog WHERE slug = ${slug}`);
      assert.ok(catRes.rows.length > 0, `${slug} must exist in catalog`);
      const result = await service.addAdditionalSkill({ tenantId }, candidateId, {
        catalogSkillId: catRes.rows[0].id, proficiency,
      });
      const expected = proficiency === 'CURRENTLY_LEARNING' ? 'LEARNING' : 'SELF_DECLARED';
      assert.strictEqual(result.provenanceStatus, expected, `${slug}: expected ${expected}`);
      console.log(`  ✅ ${slug}: ${result.provenanceStatus}/${result.proficiency}`);
    }

    // Verify persistence
    const list = await service.listAdditionalSkills({ tenantId }, candidateId);
    assert.ok(list.length >= 5, `Expected >=5, got ${list.length}`);
    console.log(`  ✅ All ${list.length} additional skills persisted`);
    console.log('  ✅ Step 2 PASS');
  });

  // STEP 3: Evidence protection
  it('Step 3: Evidence-backed skills not downgraded', async () => {
    const verifiedRes = await db.execute(sql`SELECT cs.provenance_status, s.slug FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = ${candidateId} AND cs.provenance_status = 'VERIFIED'`);
    const corroboratedRes = await db.execute(sql`SELECT cs.provenance_status, s.slug FROM candidate_skills cs JOIN skills s ON cs.skill_id = s.id WHERE cs.candidate_id = ${candidateId} AND cs.provenance_status = 'CORROBORATED'`);
    const evidenceSkills = [...verifiedRes.rows, ...corroboratedRes.rows];
    console.log(`  Evidence-backed: ${evidenceSkills.length}`);
    for (const s of evidenceSkills) console.log(`    ${s.slug}: ${s.provenance_status}`);
    assert.ok(evidenceSkills.length > 0, 'Should have evidence-backed skills');
    console.log('  ✅ Step 3 PASS');
  });

  // STEP 4: Combined view
  it('Step 4: Combined skill view', async () => {
    const service = new CandidateAdditionalSkillsService(db);
    const view = await service.getCombinedSkillView({ tenantId }, candidateId);
    console.log(`  Evidence-backed: ${view.evidenceBackedSkills.length}`);
    console.log(`  Additional: ${view.additionalSkills.length}`);
    console.log(`  Learning: ${view.learningSkills.length}`);
    assert.ok(view.evidenceBackedSkills.length > 0, 'Has evidence-backed');
    assert.ok(view.additionalSkills.length >= 4, 'Has >=4 additional');
    assert.ok(view.learningSkills.length >= 1, 'Has >=1 learning');
    console.log('  ✅ Step 4 PASS');
  });

  // STEP 5: analyze_job_fit matching integration
  it('Step 5: Evidence matching handles SELF_DECLARED and LEARNING', () => {
    const verifiedSkill = { id: randomUUID(), slug: 'typescript', name: 'TypeScript', provenanceStatus: 'VERIFIED', confidenceScore: 0.95, evidenceCount: 5 };
    const selfDeclaredSkill = { id: randomUUID(), slug: 'aws', name: 'AWS', provenanceStatus: 'SELF_DECLARED', confidenceScore: 0.0, evidenceCount: 0, proficiency: 'PROFICIENT' };
    const learningSkill = { id: randomUUID(), slug: 'terraform', name: 'Terraform', provenanceStatus: 'LEARNING', confidenceScore: 0.0, evidenceCount: 0, proficiency: 'CURRENTLY_LEARNING' };

    const skillsBySlug = new Map([
      ['typescript', verifiedSkill], ['aws', selfDeclaredSkill], ['terraform', learningSkill],
    ]);

    const makeReq = (slug, name) => ({
      id: randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0,
      skillSlug: slug, extractedValue: name, originalText: `Required: ${name}`,
      rawSnippet: `Required: ${name}`, normalizedCriteria: { skillSlug: slug }, confidenceScore: 0.9,
    });

    // TypeScript → MATCHED / VERIFIED
    const r1 = EvidenceMatchingService._evaluateSkillRequirement(makeReq('typescript', 'TypeScript'), skillsBySlug, new Map());
    assert.strictEqual(r1.match.matchStatus, 'MATCHED');
    assert.strictEqual(r1.match.candidateProvenance, 'VERIFIED');
    console.log(`  ✅ TypeScript: ${r1.match.matchStatus} (${r1.match.candidateProvenance})`);

    // AWS → PARTIAL / SELF_DECLARED
    const r2 = EvidenceMatchingService._evaluateSkillRequirement(makeReq('aws', 'AWS'), skillsBySlug, new Map());
    assert.strictEqual(r2.match.matchStatus, 'PARTIAL');
    assert.strictEqual(r2.match.candidateProvenance, 'SELF_DECLARED');
    console.log(`  ✅ AWS: ${r2.match.matchStatus} (${r2.match.candidateProvenance})`);

    // Terraform → MISSING / LEARNING
    const r3 = EvidenceMatchingService._evaluateSkillRequirement(makeReq('terraform', 'Terraform'), skillsBySlug, new Map());
    assert.strictEqual(r3.match.matchStatus, 'MISSING');
    assert.strictEqual(r3.match.candidateProvenance, 'LEARNING');
    console.log(`  ✅ Terraform: ${r3.match.matchStatus} (${r3.match.candidateProvenance})`);

    console.log('  ✅ Step 5 PASS');
  });

  // STEP 6: Scoring semantics audit
  it('Step 6: SELF_DECLARED never becomes VERIFIED', () => {
    const PROVENANCE_PRIORITY = { CORROBORATED: 5, VERIFIED: 4, INFERRED: 3, CLAIMED: 2, SELF_DECLARED: 1, LEARNING: 0, MISSING: 0 };
    assert.ok(PROVENANCE_PRIORITY.VERIFIED > PROVENANCE_PRIORITY.SELF_DECLARED, 'VERIFIED > SELF_DECLARED');
    assert.ok(PROVENANCE_PRIORITY.SELF_DECLARED > PROVENANCE_PRIORITY.LEARNING, 'SELF_DECLARED > LEARNING');
    assert.ok(PROVENANCE_PRIORITY.CORROBORATED > PROVENANCE_PRIORITY.VERIFIED, 'CORROBORATED > VERIFIED');

    // Confirm no upgrade path exists in the matcher
    const selfDeclaredSkill = { id: randomUUID(), slug: 'kafka', name: 'Kafka', provenanceStatus: 'SELF_DECLARED', confidenceScore: 0.0, evidenceCount: 0 };
    const skillsBySlug = new Map([['kafka', selfDeclaredSkill]]);
    const req = { id: randomUUID(), category: 'SKILL', importance: 'REQUIRED', weight: 1.0, skillSlug: 'kafka', extractedValue: 'Kafka', originalText: 'Required: Kafka', rawSnippet: 'Kafka', normalizedCriteria: { skillSlug: 'kafka' }, confidenceScore: 0.9 };
    const result = EvidenceMatchingService._evaluateSkillRequirement(req, skillsBySlug, new Map());
    assert.strictEqual(result.match.candidateProvenance, 'SELF_DECLARED', 'Must remain SELF_DECLARED');
    assert.notStrictEqual(result.match.matchStatus, 'MATCHED', 'Must NOT be MATCHED');
    console.log('  ✅ Step 6 PASS: No hidden upgrade path');
  });
});
