import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, closeDatabase, pool } from '../../src/db/index.js';
import { skillCatalog } from '../../src/db/schema.js';
import { sql, inArray } from 'drizzle-orm';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';

describe('1. Skill Catalog Verification', () => {
  const TARGET_SKILLS = [
    'aws', 'gcp', 'azure', 'kubernetes', 'docker', 'terraform',
    'redis', 'nginx', 'reverse-proxy', 'load-balancing',
    'kafka', 'rabbitmq', 'opentelemetry', 'prometheus', 'grafana',
    'ai-assisted-development', 'github-copilot', 'cursor', 'claude-code',
    'rag', 'ai-agents', 'mcp',
  ];

  let catalogEntries = [];

  before(async () => {
    catalogEntries = await db.select().from(skillCatalog);
  });

  after(async () => {
    await closeDatabase(pool);
  });

  it('skill_catalog is non-empty', () => {
    assert.ok(catalogEntries.length > 100, `Expected >100, got ${catalogEntries.length}`);
    console.log(`  ✅ Total catalog entries: ${catalogEntries.length}`);
  });

  it('all 22 target skills exist in catalog', () => {
    const slugs = new Set(catalogEntries.map(e => e.slug));
    const missing = TARGET_SKILLS.filter(s => !slugs.has(s));
    if (missing.length > 0) {
      console.log('  ❌ Missing:', missing);
    }
    assert.strictEqual(missing.length, 0, `Missing skills: ${missing.join(', ')}`);
    console.log(`  ✅ All ${TARGET_SKILLS.length} target skills present`);
  });

  it('aliases resolve via SkillTaxonomyEngine', () => {
    const aliases = ['Amazon Web Services', 'Google Cloud Platform', 'k8s', 'redis', 'docker', 'kubernetes'];
    for (const alias of aliases) {
      const result = SkillTaxonomyEngine.normalizeSkill(alias);
      assert.ok(result.isKnown, `Alias '${alias}' should resolve to known skill`);
    }
    console.log('  ✅ Aliases resolve correctly');
  });

  it('no duplicate canonical slugs', () => {
    const slugs = catalogEntries.map(e => e.slug);
    const unique = new Set(slugs);
    assert.strictEqual(slugs.length, unique.size, 'Duplicate slugs found');
    console.log('  ✅ No duplicate slugs');
  });

  it('categories are populated', () => {
    const categories = new Set(catalogEntries.map(e => e.category));
    console.log(`  ✅ Categories: ${[...categories].join(', ')}`);
    assert.ok(categories.size >= 10, `Expected >=10 categories, got ${categories.size}`);
  });
});
