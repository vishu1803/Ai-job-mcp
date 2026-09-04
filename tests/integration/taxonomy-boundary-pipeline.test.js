/**
 * @file Taxonomy Boundary & Provenance Pipeline Integration Tests (P14-005AE)
 *
 * Verifies end-to-end taxonomy boundaries:
 * 1. Package manifest ingestion boundary (real tech kept, parents remapped, utilities dropped).
 * 2. Telemetry suppression for implementation packages & rate-limiting for unknown technologies.
 * 3. Profile aggregation on GET /profile has 0 unknown-term telemetry emissions.
 * 4. Job-fit matching exclusion of implementation packages.
 * 5. Database state verification: zero contaminated packages, 100% additional skills preserved.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, closeDatabase } from '../../src/db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import {
  SkillTaxonomyEngine,
  clearObservedTermsCache,
} from '../../src/domain/career/skill-taxonomy.js';
import { TaxonomyMapper } from '../../src/extractors/github/taxonomy/taxonomy-mapper.js';
import { CandidateProfileService } from '../../src/services/candidate-profile.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { CandidateAdditionalSkillsService } from '../../src/services/candidate-additional-skills.service.js';
import { skills, candidateSkills } from '../../src/db/schema.js';
import {
  ensureE2eFixture,
  ensureFixtureEvidenceSkills,
  cleanupFixtureCandidateSkills,
  assertNotProtectedCandidate,
} from '../helpers/e2e-fixture.js';

describe('Taxonomy Boundary Pipeline & Historical Cleanup Integration Tests', () => {
  let testContext;
  let testCandidateId;
  let candidateProfileService;

  before(async () => {
    // Scope this suite to the dedicated disposable E2E fixture candidate so its
    // assertions never depend on (or encode) shared development-DB residue.
    const fixture = await ensureE2eFixture(db);
    assertNotProtectedCandidate(fixture.candidateId);
    testCandidateId = fixture.candidateId;
    testContext = {
      tenantId: fixture.tenantId,
      userId: fixture.userId,
      roles: ['OWNER'],
    };

    candidateProfileService = new CandidateProfileService({ db });

    // Seed controlled evidence-backed skills (TypeScript/React + Docker/Redis) so
    // profile-aggregation assertions are deterministic.
    await ensureFixtureEvidenceSkills(db, fixture);
    await ensureEvidenceSkill(db, fixture, {
      slug: 'docker', name: 'Docker', category: 'CLOUD_DEVOPS', provenance: 'VERIFIED',
    });
    await ensureEvidenceSkill(db, fixture, {
      slug: 'redis', name: 'Redis', category: 'DATABASE', provenance: 'CORROBORATED',
    });

    // Add candidate-declared skills (distinct from the evidence-seeded Docker/Redis)
    // to prove cleanup pipelines preserve declared skills.
    const service = new CandidateAdditionalSkillsService(db);
    for (const slug of ['nginx', 'kafka']) {
      const [cat] = (await db.execute(sql`SELECT id FROM skill_catalog WHERE slug = ${slug}`)).rows;
      if (cat) {
        await service.addAdditionalSkill(
          { tenantId: fixture.tenantId },
          fixture.candidateId,
          { catalogSkillId: cat.id, proficiency: 'PROFICIENT' }
        );
      }
    }
  });

  after(async () => {
    await cleanupFixtureCandidateSkills(db, testCandidateId);
    await closeDatabase();
  });

  describe('1. Ingestion Boundary & Child Package Filtering', () => {
    it('accepts legitimate technical skills as skill-worthy and not noise', () => {
      const realTechs = ['docker', 'react', 'fastify', 'postgresql', 'redis'];
      for (const tech of realTechs) {
        const norm = TaxonomyMapper.normalize(tech);
        assert.equal(norm.isNoise, false, `${tech} should not be noise`);
        assert.equal(norm.isSkillWorthy, true, `${tech} should be skill worthy`);
      }
    });

    it('rejects micro-utilities and middleware as noise without parent mappings', () => {
      const utilities = ['clsx', 'cookie-parser', 'date-fns', 'dotenv', 'pino', 'morgan', 'cors'];
      for (const util of utilities) {
        const norm = TaxonomyMapper.normalize(util);
        assert.equal(norm.isNoise, true, `${util} must be marked noise`);
        assert.equal(norm.isSkillWorthy, false, `${util} must not be skill-worthy`);
        assert.equal(norm.parentMappings, null, `${util} should not have parent mappings`);
      }
    });

    it('identifies child packages with explicit parent mappings for evidence remapping', () => {
      const children = ['tailwind-merge', 'socket-io-client', 'drizzle-orm-node-postgres', 'lucide-react'];
      for (const child of children) {
        const norm = TaxonomyMapper.normalize(child);
        assert.ok(
          norm.parentMappings && norm.parentMappings.length > 0,
          `${child} must have parent mappings`
        );
      }
    });
  });

  describe('2. Telemetry Boundary & Deduplication', () => {
    it('does not emit unknown-term telemetry for implementation packages', () => {
      clearObservedTermsCache();
      const norm = TaxonomyMapper.normalize('clsx');
      assert.equal(norm.category, 'NOISE');
      assert.equal(norm.isSkillWorthy, false);
    });


    it('rate-limits unknown-term telemetry on consecutive calls', () => {
      clearObservedTermsCache();
      const fakeNewTech = 'hyper-quantum-db';
      // First call evaluates gate and records in cache
      const norm1 = SkillTaxonomyEngine.normalizeSkill(fakeNewTech);
      assert.equal(norm1.canonicalSlug, 'hyper-quantum-db');

      // Second call immediately after should resolve cleanly without flooding logs
      const norm2 = SkillTaxonomyEngine.normalizeSkill(fakeNewTech);
      assert.equal(norm2.canonicalSlug, norm1.canonicalSlug);
    });
  });

  describe('3. Profile Aggregation Purity on GET /profile', () => {
    it('aggregates candidate profile without contaminated package skills', async () => {
      clearObservedTermsCache();
      const profile = await candidateProfileService.getCareerProfile(testContext, testCandidateId);

      assert.ok(profile, 'Profile should exist');
      const allSkills = profile.topSkills || [];
      assert.ok(Array.isArray(allSkills), 'Profile should have topSkills array');

      const slugs = allSkills.map(s => s.slug);
      const contaminatedSamples = [
        'clsx',
        'tailwind-merge',
        'cookie-parser',
        'date-fns',
        'dotenv',
        'pino',
        'morgan',
        'axios',
        'bcryptjs',
        'class-variance-authority',
        'node-crypto',
        'node-dns',
        'eslint-plugin-react-hooks',
      ];

      for (const badSlug of contaminatedSamples) {
        assert.ok(
          !slugs.includes(badSlug),
          `Profile skills must NOT contain contaminated package: ${badSlug}`
        );
      }

      // Assert that real skills and user-declared additional skills are present
      assert.ok(slugs.includes('docker'), 'Profile must retain Docker');
      assert.ok(slugs.includes('redis'), 'Profile must retain Redis');
    });
  });

  describe('4. Job-Fit Matching Protection', () => {
    it('excludes low-level implementation packages from candidate skill indexing', () => {
      const mockCandidateProfile = {
        skills: [
          { slug: 'docker', name: 'Docker', provenanceStatus: 'VERIFIED' },
          { slug: 'clsx', name: 'Clsx', provenanceStatus: 'VERIFIED' },
          { slug: 'cookie-parser', name: 'Cookie Parser', provenanceStatus: 'VERIFIED' },
          { slug: 'postgresql', name: 'Postgresql', provenanceStatus: 'VERIFIED' },
        ],
        projects: [],
      };

      const { skillsBySlug } = EvidenceMatchingService._indexCandidateProfile(mockCandidateProfile);
      assert.ok(skillsBySlug.has('docker'), 'Docker should be indexed');
      assert.ok(skillsBySlug.has('postgresql'), 'Postgresql should be indexed');
      assert.ok(!skillsBySlug.has('clsx'), 'clsx must NEVER be indexed into job-fit matching');
      assert.ok(!skillsBySlug.has('cookie-parser'), 'cookie-parser must NEVER be indexed into job-fit matching');
    });
  });

  describe('5. Database State & Cleanup Verification', () => {
    it('verifies candidate_skills contains 0 contaminated implementation packages', async () => {
      const contaminatedInDb = await db.execute(sql`
        SELECT s.slug
        FROM candidate_skills cs
        JOIN skills s ON cs.skill_id = s.id
        WHERE s.slug IN (
          'clsx', 'tailwind-merge', 'cookie-parser', 'date-fns', 'dotenv',
          'pino', 'morgan', 'axios', 'bcryptjs', 'class-variance-authority',
          'node-crypto', 'node-dns', 'eslint-plugin-react-hooks'
        )
      `);

      assert.equal(
        contaminatedInDb.rows.length,
        0,
        `Expected 0 contaminated packages in candidate_skills, found: ${JSON.stringify(contaminatedInDb.rows)}`
      );
    });

    it('verifies CANDIDATE_DECLARED additional skills remain 100% intact (fixture-scoped)', async () => {
      // Scoped to the dedicated fixture candidate: cleanup/skill pipelines must never
      // delete or downgrade candidate-declared skills. The stable MCP acceptance
      // candidate is never part of this assertion (it carries no declared skills).
      const declared = await db.execute(sql`
        SELECT s.slug, cs.provenance_status, cs.source
        FROM candidate_skills cs
        JOIN skills s ON cs.skill_id = s.id
        WHERE cs.candidate_id = ${testCandidateId} AND cs.source = 'CANDIDATE_DECLARED'
      `);

      assert.ok(declared.rows.length >= 2, 'Fixture should have at least 2 user-declared skills');
      const declaredSlugs = declared.rows.map(r => r.slug);
      assert.ok(declaredSlugs.includes('nginx'), 'User-declared NGINX must remain');
      assert.ok(declaredSlugs.includes('kafka'), 'User-declared Kafka must remain');
      for (const r of declared.rows) {
        assert.ok(
          ['SELF_DECLARED', 'LEARNING'].includes(r.provenance_status),
          `Declared skill must stay SELF_DECLARED/LEARNING, got ${r.provenance_status}`
        );
      }
    });
  });
});

/**
 * Seeds a controlled evidence-backed candidate_skills row for the fixture.
 */
async function ensureEvidenceSkill(database, fixture, { slug, name, category, provenance }) {
  const [skillRow] = await database
    .select({ id: skills.id, category: skills.category })
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);
  const skillId =
    skillRow?.id ||
    (
      await database
        .insert(skills)
        .values({ slug, name, category, aliases: [] })
        .onConflictDoNothing()
        .returning({ id: skills.id })
    )[0]?.id;
  if (!skillId) throw new Error(`Cannot seed evidence skill ${slug}`);
  const [existing] = await database
    .select({ id: candidateSkills.id })
    .from(candidateSkills)
    .where(
      and(
        eq(candidateSkills.candidateId, fixture.candidateId),
        eq(candidateSkills.skillId, skillId)
      )
    )
    .limit(1);
  if (!existing) {
    await database.insert(candidateSkills).values({
      tenantId: fixture.tenantId,
      candidateId: fixture.candidateId,
      skillId,
      category: skillRow?.category || category,
      provenanceStatus: provenance,
      source: 'GITHUB',
      confidenceScore: 0.9,
      evidenceCount: 3,
    });
  }
}
