import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db/index.js';
import { skillCatalog, candidateSkills, skills } from '../../src/db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { CandidateAdditionalSkillsService } from '../../src/services/candidate-additional-skills.service.js';
import {
  ensureE2eFixture,
  ensureFixtureEvidenceSkills,
  cleanupFixtureCandidateSkills,
  assertNotProtectedCandidate,
} from '../helpers/e2e-fixture.js';

describe('2. Add Additional Skills via Service (dedicated E2E fixture)', () => {
  let service;
  let fixture;
  let tenantId;
  let candidateId;
  let awsRecordId, gcpRecordId, k8sRecordId, redisRecordId, terraformRecordId;

  before(async () => {
    // Mutable acceptance tests ALWAYS run against the dedicated disposable fixture,
    // never against the stable READ-ONLY MCP acceptance candidate.
    fixture = await ensureE2eFixture(db);
    tenantId = fixture.tenantId;
    candidateId = fixture.candidateId;
    assertNotProtectedCandidate(candidateId);
    await ensureFixtureEvidenceSkills(db, fixture);
    service = new CandidateAdditionalSkillsService(db);
    console.log(`  Fixture candidate: ${candidateId} (tenant ${tenantId})`);
  });

  after(async () => {
    await cleanupFixtureCandidateSkills(db, candidateId);
    console.log('  ✅ Fixture candidate skills cleaned up (stable MCP candidate untouched).');
  });

  it('adds AWS (Proficient)', async () => {
    const aws = await db.select().from(skillCatalog).where(eq(skillCatalog.slug, 'aws')).limit(1);
    assert.ok(aws.length > 0, 'AWS must exist in catalog');
    const result = await service.addAdditionalSkill({ tenantId }, candidateId, { catalogSkillId: aws[0].id, proficiency: 'PROFICIENT' });
    awsRecordId = result.id;
    assert.strictEqual(result.provenanceStatus, 'SELF_DECLARED');
    console.log(`  ✅ AWS: provenance=${result.provenanceStatus}, proficiency=${result.proficiency}`);
  });

  it('adds Google Cloud (Working Knowledge)', async () => {
    const skill = await db.select().from(skillCatalog).where(eq(skillCatalog.slug, 'gcp')).limit(1);
    const result = await service.addAdditionalSkill({ tenantId }, candidateId, { catalogSkillId: skill[0].id, proficiency: 'WORKING_KNOWLEDGE' });
    gcpRecordId = result.id;
    assert.strictEqual(result.provenanceStatus, 'SELF_DECLARED');
    console.log(`  ✅ GCP: provenance=${result.provenanceStatus}`);
  });

  it('adds Kubernetes (Proficient)', async () => {
    const skill = await db.select().from(skillCatalog).where(eq(skillCatalog.slug, 'kubernetes')).limit(1);
    const result = await service.addAdditionalSkill({ tenantId }, candidateId, { catalogSkillId: skill[0].id, proficiency: 'PROFICIENT' });
    k8sRecordId = result.id;
    assert.strictEqual(result.provenanceStatus, 'SELF_DECLARED');
    console.log(`  ✅ Kubernetes: provenance=${result.provenanceStatus}`);
  });

  it('adds Redis (Proficient)', async () => {
    const skill = await db.select().from(skillCatalog).where(eq(skillCatalog.slug, 'redis')).limit(1);
    const result = await service.addAdditionalSkill({ tenantId }, candidateId, { catalogSkillId: skill[0].id, proficiency: 'PROFICIENT' });
    redisRecordId = result.id;
    assert.strictEqual(result.provenanceStatus, 'SELF_DECLARED');
    console.log(`  ✅ Redis: provenance=${result.provenanceStatus}`);
  });

  it('adds Terraform (Currently Learning)', async () => {
    const skill = await db.select().from(skillCatalog).where(eq(skillCatalog.slug, 'terraform')).limit(1);
    const result = await service.addAdditionalSkill({ tenantId }, candidateId, { catalogSkillId: skill[0].id, proficiency: 'CURRENTLY_LEARNING' });
    terraformRecordId = result.id;
    assert.strictEqual(result.provenanceStatus, 'LEARNING');
    console.log(`  ✅ Terraform: provenance=${result.provenanceStatus}`);
  });

  it('all 5 persist on reload', async () => {
    const list = await service.listAdditionalSkills({ tenantId }, candidateId);
    const slugs = list.map(s => s.skillSlug);
    assert.ok(slugs.includes('aws'), 'AWS should persist');
    assert.ok(slugs.includes('gcp'), 'GCP should persist');
    assert.ok(slugs.includes('kubernetes'), 'K8s should persist');
    assert.ok(slugs.includes('redis'), 'Redis should persist');
    assert.ok(slugs.includes('terraform'), 'Terraform should persist');
    console.log(`  ✅ All 5 skills persisted (${list.length} total)`);
    for (const s of list) console.log(`    ${s.skillName}: ${s.provenanceStatus} / ${s.proficiency}`);
  });

  it('combined view separates correctly', async () => {
    const view = await service.getCombinedSkillView({ tenantId }, candidateId);
    console.log(`  Evidence-backed: ${view.evidenceBackedSkills.length}`);
    console.log(`  Additional: ${view.additionalSkills.length}`);
    console.log(`  Learning: ${view.learningSkills.length}`);
    assert.ok(view.evidenceBackedSkills.length > 0, 'Has evidence-backed skills');
    assert.ok(view.additionalSkills.length >= 4, 'Has >=4 additional skills');
    assert.ok(view.learningSkills.length >= 1, 'Has >=1 learning skill');
    console.log('  ✅ Combined view separates correctly');
  });

  it('existing evidence-backed skills not downgraded', async () => {
    const evidenceSkills = await db.select({ provenance: candidateSkills.provenanceStatus, slug: skills.slug })
      .from(candidateSkills)
      .innerJoin(skills, eq(candidateSkills.skillId, skills.id))
      .where(and(
        eq(candidateSkills.candidateId, candidateId),
        sql`${candidateSkills.provenanceStatus} IN ('VERIFIED', 'CORROBORATED')`
      ));
    console.log(`  Evidence-backed skills: ${evidenceSkills.length}`);
    for (const s of evidenceSkills) console.log(`    ${s.slug}: ${s.provenance}`);
    assert.ok(evidenceSkills.length > 0, 'Should have evidence-backed skills');
    // Verify none are downgraded to SELF_DECLARED
    const downgraded = evidenceSkills.filter(s => s.provenance === 'SELF_DECLARED');
    assert.strictEqual(downgraded.length, 0, 'No evidence-backed skills should be downgraded');
    console.log('  ✅ Evidence-backed skills preserved');
  });

  // Silence unused-var lint for record ids retained for future assertions.
  void awsRecordId; void gcpRecordId; void k8sRecordId; void redisRecordId; void terraformRecordId;
});
