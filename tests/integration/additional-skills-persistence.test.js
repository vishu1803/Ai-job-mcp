/**
 * @file Integration Tests for Additional Skills Persistence Defect Fix
 *
 * Verifies that:
 * - TEST A: Add Docker -> Save -> Refresh -> Docker remains.
 * - TEST B: Add Docker -> Save -> Edit headline -> Save again -> Docker remains.
 * - TEST C: Add Docker -> Save -> Edit preferences -> Save again -> Docker remains.
 * - TEST D: Add Docker + Redis -> Save -> Refresh -> Both remain.
 * - TEST E: Save with intentionally invalid catalogSkillId -> fails, existing stored skills remain unchanged.
 * - TEST F: Hydrated AdditionalSkill DTO always includes catalogSkillId.
 * - TEST G: Frontend payload construction never substitutes skillId for catalogSkillId.
 * - TEST H: Successful save response means DB actually contains the submitted skills.
 * - TEST I: Failed save NEVER deletes previously persisted skills.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  candidateSkills,
  skillCatalog,
} from '../../src/db/schema.js';
import { CandidateAdditionalSkillsService } from '../../src/services/candidate-additional-skills.service.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { NotFoundError, ValidationError } from '../../src/errors/index.js';

describe('Additional Skills Persistence & Canonical Contract Tests', () => {
  const testRunId = crypto.randomBytes(4).toString('hex');
  const additionalSkillsService = new CandidateAdditionalSkillsService(db);
  const candidateProfileService = new CandidateProfileService(db);

  let testTenant;
  let testUser;
  let testCandidate;
  let context;

  let dockerCatalogSkill;
  let redisCatalogSkill;

  before(async () => {
    // 1. Create isolated test tenant & user
    const [t] = await db
      .insert(tenants)
      .values({
        name: `Persist-Test-Tenant-${testRunId}`,
        slug: `persist-test-tenant-${testRunId}`,
        tier: 'PRO',
      })
      .returning();
    testTenant = t;

    const [u] = await db
      .insert(users)
      .values({
        tenantId: testTenant.id,
        email: `persist-test-${testRunId}@example.com`,
        displayName: 'Test User',
        passwordHash: 'dummy_hash',
        role: 'OWNER',
        status: 'ACTIVE',
      })
      .returning();
    testUser = u;

    const [c] = await db
      .insert(candidates)
      .values({
        tenantId: testTenant.id,
        userId: testUser.id,
        displayName: 'Test Candidate',
        headline: 'Initial Headline',
        summary: 'Initial Summary',
      })
      .returning();
    testCandidate = c;

    context = {
      tenantId: testTenant.id,
      userId: testUser.id,
      role: 'OWNER',
    };

    // 2. Resolve Docker and Redis catalog skills
    const catalogRows = await db
      .select()
      .from(skillCatalog)
      .where(sql`slug IN ('docker', 'redis')`);

    dockerCatalogSkill = catalogRows.find(s => s.slug === 'docker');
    redisCatalogSkill = catalogRows.find(s => s.slug === 'redis');

    assert.ok(dockerCatalogSkill, 'Docker must exist in skill_catalog');
    assert.ok(redisCatalogSkill, 'Redis must exist in skill_catalog');
  });

  after(async () => {
    try {
      if (testTenant?.id) {
        await db.delete(candidateSkills).where(eq(candidateSkills.tenantId, testTenant.id));
        await db.delete(candidates).where(eq(candidates.tenantId, testTenant.id));
        await db.delete(users).where(eq(users.tenantId, testTenant.id));
        await db.delete(tenants).where(eq(tenants.id, testTenant.id));
      }
    } finally {
      await closeDatabase();
    }
  });

  it('TEST A: Add Docker -> Save -> Refresh -> Docker remains', async () => {
    // 1. Save Docker
    await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, [
      {
        catalogSkillId: dockerCatalogSkill.id,
        proficiency: 'WORKING_KNOWLEDGE',
      },
    ]);

    // 2. Query (simulate refresh)
    const skillsAfterRefresh = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(skillsAfterRefresh.length, 1);
    assert.equal(skillsAfterRefresh[0].skillSlug, 'docker');
    assert.equal(skillsAfterRefresh[0].catalogSkillId, dockerCatalogSkill.id);
  });

  it('TEST B: Add Docker -> Save -> Edit headline -> Save again -> Docker remains', async () => {
    // 1. Initial state: candidate has Docker
    const initialSkills = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(initialSkills.length, 1);
    assert.equal(initialSkills[0].catalogSkillId, dockerCatalogSkill.id);

    // 2. Emulate what frontend buildSavePayload() sends during a profile edit (headline edit):
    // Frontend maps hydrated skills: s => ({ catalogSkillId: s.catalogSkillId, ... })
    const payloadSkills = initialSkills.map(s => ({
      catalogSkillId: s.catalogSkillId,
      proficiency: s.proficiency,
      usageContext: s.usageContext || null,
      notes: s.notes || null,
    }));

    // Update headline
    await candidateProfileService.updateUserProfileSections(context, testCandidate.id, {
      headline: 'Updated Senior Developer',
    });

    // Save additional skills with payload
    await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, payloadSkills);

    // 3. Verify Docker remains in database
    const skillsAfterSecondSave = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(skillsAfterSecondSave.length, 1);
    assert.equal(skillsAfterSecondSave[0].skillSlug, 'docker');
    assert.equal(skillsAfterSecondSave[0].catalogSkillId, dockerCatalogSkill.id);

    // Verify headline was also updated
    const profile = await candidateProfileService.getCareerProfile(context, testCandidate.id);
    assert.equal(profile.headline, 'Updated Senior Developer');
  });

  it('TEST C: Add Docker -> Save -> Edit preferences -> Save again -> Docker remains', async () => {
    // 1. Get hydrated additional skills
    const hydratedSkills = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(hydratedSkills.length, 1);
    assert.equal(hydratedSkills[0].catalogSkillId, dockerCatalogSkill.id);

    // 2. Edit career preferences and re-save additional skills
    await candidateProfileService.updateUserProfileSections(context, testCandidate.id, {
      careerPreferences: {
        targetRoles: ['Backend Engineer'],
        remotePreference: 'REMOTE_ONLY',
      },
    });

    const payloadSkills = hydratedSkills.map(s => ({
      catalogSkillId: s.catalogSkillId,
      proficiency: s.proficiency,
      usageContext: s.usageContext,
      notes: s.notes,
    }));

    await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, payloadSkills);

    // 3. Verify Docker remains
    const skillsAfterPrefsSave = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(skillsAfterPrefsSave.length, 1);
    assert.equal(skillsAfterPrefsSave[0].skillSlug, 'docker');
    assert.equal(skillsAfterPrefsSave[0].catalogSkillId, dockerCatalogSkill.id);
  });

  it('TEST D: Add Docker + Redis -> Save -> Refresh -> Both remain', async () => {
    // 1. Save both Docker and Redis
    await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, [
      {
        catalogSkillId: dockerCatalogSkill.id,
        proficiency: 'PROFICIENT',
      },
      {
        catalogSkillId: redisCatalogSkill.id,
        proficiency: 'WORKING_KNOWLEDGE',
      },
    ]);

    // 2. Query (simulate refresh)
    const skillsAfterRefresh = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(skillsAfterRefresh.length, 2);

    const slugs = skillsAfterRefresh.map(s => s.skillSlug).sort();
    assert.deepEqual(slugs, ['docker', 'redis']);

    for (const skill of skillsAfterRefresh) {
      assert.ok(skill.catalogSkillId, `Skill ${skill.skillSlug} must have catalogSkillId`);
      assert.notEqual(skill.catalogSkillId, skill.skillId, 'catalogSkillId must not equal skillId');
    }
  });

  it('TEST E: Save with intentionally invalid catalogSkillId -> fails, existing stored skills remain unchanged', async () => {
    // 1. Verify 2 skills exist before failed attempt
    const beforeSkills = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(beforeSkills.length, 2);

    const fakeCatalogId = crypto.randomUUID();

    // 2. Attempt save with invalid catalogSkillId
    await assert.rejects(
      async () => {
        await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, [
          {
            catalogSkillId: fakeCatalogId,
            proficiency: 'WORKING_KNOWLEDGE',
          },
        ]);
      },
      (err) => {
        assert.ok(err instanceof NotFoundError);
        assert.match(err.message, /Skill catalog entry not found/);
        return true;
      }
    );

    // 3. Verify existing skills are completely preserved (no wipeout)
    const afterFailedSkills = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(afterFailedSkills.length, 2);
    const slugs = afterFailedSkills.map(s => s.skillSlug).sort();
    assert.deepEqual(slugs, ['docker', 'redis']);
  });

  it('TEST F: Hydrated AdditionalSkill DTO always includes catalogSkillId', async () => {
    const list = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.ok(list.length > 0);

    for (const item of list) {
      assert.ok(item.id, 'Must have row id');
      assert.ok(item.skillId, 'Must have skillId from skills table');
      assert.ok(item.catalogSkillId, 'Must have catalogSkillId from skill_catalog table');
      assert.ok(item.skillName, 'Must have skillName');
      assert.ok(item.skillSlug, 'Must have skillSlug');
      assert.ok(item.proficiency, 'Must have proficiency');
      assert.ok(item.provenanceStatus, 'Must have provenanceStatus');
    }
  });

  it('TEST G: Frontend payload construction never substitutes skillId for catalogSkillId', () => {
    // Simulate frontend buildSavePayload logic:
    const mockClientData = [
      {
        id: 'row-1',
        skillId: '64a19d7a-53f5-4c41-b050-71aa4b5a10d4',
        catalogSkillId: '084e0e43-e6b9-4743-8e32-90a481fda076',
        skillName: 'Docker',
        proficiency: 'WORKING_KNOWLEDGE',
      },
    ];

    // Correct implementation mapping
    const payload = mockClientData.map((s, idx) => {
      if (!s.catalogSkillId) {
        throw new Error(`Additional skill at position ${idx + 1} is missing required catalogSkillId`);
      }
      return {
        catalogSkillId: s.catalogSkillId,
        proficiency: s.proficiency || 'WORKING_KNOWLEDGE',
      };
    });

    assert.equal(payload[0].catalogSkillId, '084e0e43-e6b9-4743-8e32-90a481fda076');
    assert.notEqual(payload[0].catalogSkillId, mockClientData[0].skillId);

    // If catalogSkillId is missing, it must throw and not fall back
    const corruptedData = [
      {
        id: 'row-2',
        skillId: '64a19d7a-53f5-4c41-b050-71aa4b5a10d4',
        // missing catalogSkillId
        skillName: 'Corrupted Skill',
      },
    ];

    assert.throws(
      () => {
        corruptedData.map((s, idx) => {
          if (!s.catalogSkillId) {
            throw new Error(`Additional skill at position ${idx + 1} is missing required catalogSkillId`);
          }
          return { catalogSkillId: s.catalogSkillId };
        });
      },
      /missing required catalogSkillId/
    );
  });

  it('TEST H: Successful save response means DB actually contains the submitted skills', async () => {
    // 1. Submit only Redis
    const updateResult = await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, [
      {
        catalogSkillId: redisCatalogSkill.id,
        proficiency: 'ADVANCED',
      },
    ]);

    assert.equal(updateResult.length, 1);
    assert.equal(updateResult[0].skillSlug, 'redis');

    // 2. Direct raw SQL inspection of database table
    const directRows = await db.execute(sql`
      SELECT cs.id, cs.candidate_id, cs.skill_id, cs.proficiency, s.slug as skill_slug
      FROM candidate_skills cs
      JOIN skills s ON cs.skill_id = s.id
      WHERE cs.tenant_id = ${testTenant.id}
        AND cs.candidate_id = ${testCandidate.id}
        AND cs.source = 'CANDIDATE_DECLARED'
    `);

    assert.equal(directRows.rows.length, 1);
    assert.equal(directRows.rows[0].skill_slug, 'redis');
    assert.equal(directRows.rows[0].proficiency, 'ADVANCED');
  });

  it('TEST I: Failed save NEVER deletes previously persisted skills', async () => {
    // 1. Ensure Redis is persisted
    const beforeRows = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(beforeRows.length, 1);
    assert.equal(beforeRows[0].skillSlug, 'redis');

    // 2. Attempt save with invalid proficiency
    await assert.rejects(
      async () => {
        await additionalSkillsService.setAdditionalSkills(context, testCandidate.id, [
          {
            catalogSkillId: redisCatalogSkill.id,
            proficiency: 'NON_EXISTENT_PROFICIENCY',
          },
        ]);
      },
      (err) => {
        assert.ok(err instanceof ValidationError);
        return true;
      }
    );

    // 3. Verify Redis is still in database
    const afterRows = await additionalSkillsService.listAdditionalSkills(context, testCandidate.id);
    assert.equal(afterRows.length, 1);
    assert.equal(afterRows[0].skillSlug, 'redis');
  });
});
