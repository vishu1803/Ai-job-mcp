import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SkillTaxonomyEngine,
  GENERIC_NOISE_TERMS,
} from '../../src/domain/career/skill-taxonomy.js';

describe('Noise Skill Remediation — Taxonomy Logic', () => {
  it('GENERIC_NOISE_TERMS includes all expected local module names', () => {
    const expectedNoise = [
      'app',
      'server',
      'main',
      'core',
      'config',
      'utils',
      'helpers',
      'models',
      'views',
      'controllers',
      'services',
      'routes',
      'handlers',
      'schemas',
      'constants',
      'tests',
      'common',
      'lib',
      'shared',
      'index',
      'run',
      'cli',
      'db',
      'database',
      'api',
      'auth',
      'middleware',
      'tasks',
      'forms',
      'parser',
    ];
    for (const term of expectedNoise) {
      assert.ok(GENERIC_NOISE_TERMS.has(term), `'${term}' should be in GENERIC_NOISE_TERMS`);
    }
  });

  it('normalizeSkill returns isNoise for all core local module terms', () => {
    // Core local module names that must always be classified as NOISE
    const coreNoise = [
      'app',
      'server',
      'main',
      'core',
      'config',
      'utils',
      'helpers',
      'models',
      'views',
      'controllers',
      'services',
      'routes',
      'handlers',
      'schemas',
      'constants',
      'tests',
      'common',
      'lib',
      'shared',
      'index',
      'run',
      'cli',
      'db',
      'api',
      'auth',
      'middleware',
      'tasks',
      'forms',
      'parser',
    ];
    for (const term of coreNoise) {
      const result = SkillTaxonomyEngine.normalizeSkill(term);
      assert.ok(result, `'${term}' should return a result`);
      assert.equal(result.isNoise, true, `'${term}' should be isNoise`);
      assert.equal(result.category, 'NOISE', `'${term}' should have category NOISE`);
    }
  });

  it('normalizeSkill does NOT return isNoise for legitimate technologies', () => {
    const legitimate = [
      'fastapi',
      'django',
      'flask',
      'pydantic',
      'numpy',
      'pandas',
      'requests',
      'react',
      'next.js',
      'fastify',
      'express',
      'vue',
      'angular',
      'svelte',
      'postgresql',
      'mongodb',
      'redis',
      'docker',
      'kubernetes',
      'typescript',
      'python',
      'go',
      'rust',
      'java',
    ];
    for (const tech of legitimate) {
      const result = SkillTaxonomyEngine.normalizeSkill(tech);
      assert.ok(result, `'${tech}' should return a result`);
      assert.notEqual(result.isNoise, true, `'${tech}' should NOT be isNoise`);
      assert.notEqual(result.category, 'NOISE', `'${tech}' should NOT have category NOISE`);
    }
  });

  it('noise slug set is deterministic across calls', () => {
    const slugs1 = new Set();
    const slugs2 = new Set();

    for (const term of GENERIC_NOISE_TERMS) {
      const r1 = SkillTaxonomyEngine.normalizeSkill(term);
      if (r1?.isNoise) slugs1.add(r1.canonicalSlug);
    }
    for (const term of GENERIC_NOISE_TERMS) {
      const r2 = SkillTaxonomyEngine.normalizeSkill(term);
      if (r2?.isNoise) slugs2.add(r2.canonicalSlug);
    }

    assert.equal(slugs1.size, slugs2.size, 'Noise slug set size should be deterministic');
    for (const slug of slugs1) {
      assert.ok(slugs2.has(slug), `Slug '${slug}' should appear in both sets`);
    }
  });

  it('noise skills produce safe slugs (no special characters)', () => {
    for (const term of GENERIC_NOISE_TERMS) {
      const result = SkillTaxonomyEngine.normalizeSkill(term);
      if (result?.isNoise) {
        assert.match(
          result.canonicalSlug,
          /^[a-z0-9-]+$/,
          `Slug '${result.canonicalSlug}' for '${term}' should be alphanumeric with dashes only`
        );
      }
    }
  });
});

describe('Noise Skill Remediation — Edge Cases', () => {
  it('empty noise set produces empty result', () => {
    const emptySet = new Set();
    const noiseSlugs = new Set();
    for (const term of emptySet) {
      const r = SkillTaxonomyEngine.normalizeSkill(term);
      if (r?.isNoise) noiseSlugs.add(r.canonicalSlug);
    }
    assert.equal(noiseSlugs.size, 0);
  });

  it('mixed noise and non-noise terms produce correct partition', () => {
    const mixedTerms = ['app', 'fastapi', 'server', 'react', 'core', 'postgresql'];
    const noiseSlugs = [];
    const legitSlugs = [];

    for (const term of mixedTerms) {
      const r = SkillTaxonomyEngine.normalizeSkill(term);
      if (r?.isNoise) {
        noiseSlugs.push(term);
      } else {
        legitSlugs.push(term);
      }
    }

    assert.deepEqual(noiseSlugs, ['app', 'server', 'core']);
    assert.deepEqual(legitSlugs, ['fastapi', 'react', 'postgresql']);
  });
});
