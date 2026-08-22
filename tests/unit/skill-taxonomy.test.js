/**
 * @file Unit Tests for Canonical Skill Normalizer & Taxonomy Engine (P5-002)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SkillTaxonomyEngine,
  CANONICAL_SKILLS,
  SKILL_CATEGORIES,
  MAX_SKILL_INPUT_LENGTH,
  normalizeSkill,
  resolveCanonicalSkill,
  getSkillMetadata,
  getAliases,
  getRelationships,
  isKnownSkill,
  validateTaxonomyGraph,
} from '../../src/domain/career/skill-taxonomy.js';
import { TaxonomyMapper } from '../../src/extractors/github/taxonomy/taxonomy-mapper.js';

describe('Skill Normalizer & Taxonomy Engine (P5-002)', () => {
  // ---------------------------------------------------------------------------
  // 1. Core Normalization & Canonical Naming Stability
  // ---------------------------------------------------------------------------
  describe('1. Core Normalization & Canonical Naming Stability', () => {
    const requiredCanonicalSlugs = [
      'postgresql',
      'react',
      'node-js',
      'go',
      'rust',
      'typescript',
      'python',
      'fastapi',
      'next-js',
      'fastify',
      'express',
      'django',
      'tokio',
      'grpc',
      'docker',
      'kubernetes',
      'aws',
      'gcp',
      'azure',
      'terraform',
      'github-actions',
      'zod',
      'pydantic',
      'vitest',
      'jest',
      'pytest',
      'serde',
      'pandas',
      'drizzle-orm',
      'prisma',
    ];

    it('resolves all required canonical slugs with exact identity', () => {
      for (const slug of requiredCanonicalSlugs) {
        const result = normalizeSkill(slug);
        assert.ok(result, `Failed to normalize canonical slug '${slug}'`);
        assert.equal(result.canonicalSlug, slug);
        assert.equal(result.isKnown, true);
        assert.equal(result.isCustom, false);
        assert.equal(result.requiresReview, false);
        assert.equal(result.normalizationConfidence, 1.0);
        assert.ok(SKILL_CATEGORIES.includes(result.category));
      }
    });

    it('handles case-insensitivity seamlessly (e.g., POSTGRESQL, React, TypeScript)', () => {
      assert.equal(normalizeSkill('POSTGRESQL').canonicalSlug, 'postgresql');
      assert.equal(normalizeSkill('React').canonicalSlug, 'react');
      assert.equal(normalizeSkill('TypeScript').canonicalSlug, 'typescript');
      assert.equal(normalizeSkill('Docker').canonicalSlug, 'docker');
      assert.equal(normalizeSkill('KuBeRnEtEs').canonicalSlug, 'kubernetes');
    });

    it('normalizes Unicode characters via NFKC', () => {
      // Full-width characters
      const fullWidth = 'Ｐｙｔｈｏｎ';
      const result = normalizeSkill(fullWidth);
      assert.equal(result.canonicalSlug, 'python');
      assert.equal(result.canonicalName, 'Python');
    });

    it('normalizes package prefixes, scopes and version suffixes', () => {
      assert.equal(normalizeSkill('@fastify/cors').canonicalSlug, 'fastify');
      assert.equal(normalizeSkill('@fastify/jwt').canonicalSlug, 'fastify');
      assert.equal(normalizeSkill('@prisma/client').canonicalSlug, 'prisma');
      assert.equal(normalizeSkill('github.com/gin-gonic/gin').canonicalSlug, 'gin');
      assert.equal(normalizeSkill('google.golang.org/grpc').canonicalSlug, 'grpc');
      assert.equal(normalizeSkill('react (v18.2.0)').canonicalSlug, 'react');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Critical Technology Aliases
  // ---------------------------------------------------------------------------
  describe('2. Critical Technology Aliases', () => {
    it('normalizes PostgreSQL variations to canonical postgresql', () => {
      const variants = [
        'Postgres',
        'POSTGRES',
        'postgresql',
        'PostgreSQL',
        'PostgreSQL DB',
        'postgres-db',
        'pg',
        'psycopg2',
        'psycopg2-binary',
        'asyncpg',
        'pg-promise',
        'pg-pool',
        'pq',
        'github.com/lib/pq',
      ];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'postgresql', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'PostgreSQL');
        assert.equal(res.category, 'DATABASE');
      }
    });

    it('normalizes React variations to canonical react', () => {
      const variants = ['React', 'React.js', 'ReactJS', 'reactjs', 'react-dom'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'react', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'React');
        assert.equal(res.category, 'FRAMEWORK');
      }
    });

    it('normalizes Node.js variations to canonical node-js (NOT nodejs)', () => {
      const variants = ['Node', 'Node.js', 'NodeJS', 'nodejs', 'node-js', 'v8-node'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'node-js', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'Node.js');
        assert.equal(res.category, 'LANGUAGE');
      }
    });

    it('normalizes Next.js variations to canonical next-js', () => {
      const variants = ['Next', 'Next.js', 'NextJS', 'nextjs', 'next-js'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'next-js', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'Next.js');
        assert.equal(res.category, 'FRAMEWORK');
      }
    });

    it('normalizes FastAPI variations to canonical fastapi', () => {
      const variants = ['FastAPI', 'Fast API', 'fast-api', 'fastapi'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'fastapi', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'FastAPI');
        assert.equal(res.category, 'FRAMEWORK');
      }
    });

    it('normalizes Gin variations to canonical gin', () => {
      const variants = ['Gin', 'gin', 'gin-gonic', 'github.com/gin-gonic/gin'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'gin', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'Gin');
        assert.equal(res.category, 'FRAMEWORK');
      }
    });

    it('normalizes Go variations to canonical go', () => {
      const variants = ['Go', 'golang', 'go-lang'];
      for (const v of variants) {
        const res = normalizeSkill(v);
        assert.equal(res.canonicalSlug, 'go', `Failed for variant '${v}'`);
        assert.equal(res.canonicalName, 'Go');
        assert.equal(res.category, 'LANGUAGE');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Category 50+ Curated Synonym Variations
  // ---------------------------------------------------------------------------
  describe('3. Multi-Category 50+ Curated Synonym Variations', () => {
    const synonymMap = [
      // Databases
      { input: 'mongo', expected: 'mongodb', cat: 'DATABASE' },
      { input: 'mongoose', expected: 'mongodb', cat: 'DATABASE' },
      { input: 'ioredis', expected: 'redis', cat: 'DATABASE' },
      { input: 'mysql2', expected: 'mysql', cat: 'DATABASE' },
      { input: 'better-sqlite3', expected: 'sqlite', cat: 'DATABASE' },
      { input: 'drizzle-kit', expected: 'drizzle-orm', cat: 'DATABASE' },
      { input: 'typeorm', expected: 'typeorm', cat: 'DATABASE' },
      { input: 'sqlalchemy', expected: 'sqlalchemy', cat: 'DATABASE' },
      { input: 'gorm.io/gorm', expected: 'gorm', cat: 'DATABASE' },
      { input: 'sqlx-core', expected: 'sqlx', cat: 'DATABASE' },
      { input: 'diesel-rs', expected: 'diesel', cat: 'DATABASE' },
      { input: 'apache-kafka', expected: 'kafka', cat: 'DATABASE' },

      // Frameworks
      { input: 'vue3', expected: 'vue', cat: 'FRAMEWORK' },
      { input: 'vue.js', expected: 'vue', cat: 'FRAMEWORK' },
      { input: 'angularjs', expected: 'angular', cat: 'FRAMEWORK' },
      { input: '@sveltejs/kit', expected: 'svelte', cat: 'FRAMEWORK' },
      { input: 'nest.js', expected: 'nestjs', cat: 'FRAMEWORK' },
      { input: 'tailwind-css', expected: 'tailwindcss', cat: 'FRAMEWORK' },
      { input: 'djangorestframework', expected: 'django', cat: 'FRAMEWORK' },
      { input: 'flask-restful', expected: 'flask', cat: 'FRAMEWORK' },
      { input: 'gofiber', expected: 'fiber', cat: 'FRAMEWORK' },
      { input: 'actix-framework', expected: 'actix-web', cat: 'FRAMEWORK' },
      { input: 'tokio-axum', expected: 'axum', cat: 'FRAMEWORK' },
      { input: '@grpc/grpc-js', expected: 'grpc', cat: 'FRAMEWORK' },
      { input: 'spring-boot', expected: 'spring', cat: 'FRAMEWORK' },
      { input: 'torchvision', expected: 'pytorch', cat: 'FRAMEWORK' },
      { input: 'keras', expected: 'tensorflow', cat: 'FRAMEWORK' },
      { input: 'dotnet-core', expected: 'dotnet', cat: 'FRAMEWORK' },

      // Languages
      { input: 'py3', expected: 'python', cat: 'LANGUAGE' },
      { input: 'cplusplus', expected: 'cpp', cat: 'LANGUAGE' },
      { input: 'c#', expected: 'c-sharp', cat: 'LANGUAGE' },
      { input: 'csharp', expected: 'c-sharp', cat: 'LANGUAGE' },
      { input: 'jdk', expected: 'java', cat: 'LANGUAGE' },
      { input: 'kts', expected: 'kotlin', cat: 'LANGUAGE' },
      { input: 'html5', expected: 'html', cat: 'LANGUAGE' },
      { input: 'css3', expected: 'css', cat: 'LANGUAGE' },

      // Cloud / DevOps
      { input: 'docker-engine', expected: 'docker', cat: 'CLOUD_DEVOPS' },
      { input: 'docker-compose-v2', expected: 'docker-compose', cat: 'CLOUD_DEVOPS' },
      { input: 'kubectl', expected: 'kubernetes', cat: 'CLOUD_DEVOPS' },
      { input: 'amazon web services', expected: 'aws', cat: 'CLOUD_DEVOPS' },
      { input: 'boto3', expected: 'aws', cat: 'CLOUD_DEVOPS' },
      { input: 'google-cloud-platform', expected: 'gcp', cat: 'CLOUD_DEVOPS' },
      { input: 'microsoft azure', expected: 'azure', cat: 'CLOUD_DEVOPS' },
      { input: 'gh-actions', expected: 'github-actions', cat: 'CLOUD_DEVOPS' },
      { input: 'gitlab-pipelines', expected: 'gitlab-ci', cat: 'CLOUD_DEVOPS' },

      // Tools & AI/ML
      { input: 'zod-schema', expected: 'zod', cat: 'TOOL' },
      { input: 'pydantic-v2', expected: 'pydantic', cat: 'TOOL' },
      { input: 'vite-test', expected: 'vitest', cat: 'TOOL' },
      { input: 'ts-jest', expected: 'jest', cat: 'TOOL' },
      { input: 'pytest-cov', expected: 'pytest', cat: 'TOOL' },
      { input: 'serde_json', expected: 'serde', cat: 'TOOL' },
      { input: 'sklearn', expected: 'scikit-learn', cat: 'TOOL' },
      { input: 'protocol-buffers', expected: 'protobuf', cat: 'TOOL' },

      // Concepts & Architecture
      { input: 'microservice-architecture', expected: 'microservices', cat: 'ARCHITECTURE' },
      { input: 'event-sourcing', expected: 'event-driven-architecture', cat: 'ARCHITECTURE' },
      { input: 'restful-api', expected: 'rest-api', cat: 'ARCHITECTURE' },
      { input: 'rdbms', expected: 'relational-database', cat: 'ARCHITECTURE' },
      { input: 'apollo-graphql', expected: 'graphql', cat: 'CONCEPT' },
      { input: 'pkce', expected: 'oauth', cat: 'CONCEPT' },
      { input: 'infosec', expected: 'application-security', cat: 'CONCEPT' },
      { input: 'ansi-sql', expected: 'sql', cat: 'CONCEPT' },
    ];

    it(`verifies all ${synonymMap.length} curated synonyms map to correct canonical slugs and categories`, () => {
      assert.ok(synonymMap.length >= 50, `Expected >= 50 synonyms, got ${synonymMap.length}`);
      for (const item of synonymMap) {
        const res = normalizeSkill(item.input);
        assert.ok(res, `Failed to normalize '${item.input}'`);
        assert.equal(
          res.canonicalSlug,
          item.expected,
          `Input '${item.input}' mapped to '${res.canonicalSlug}', expected '${item.expected}'`
        );
        assert.equal(
          res.category,
          item.cat,
          `Input '${item.input}' category '${res.category}', expected '${item.cat}'`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Ambiguity Disambiguation
  // ---------------------------------------------------------------------------
  describe('4. Ambiguity Disambiguation', () => {
    it('normalizes "Go" with technical context to language "go"', () => {
      const withContext1 = normalizeSkill('go', {
        context: 'Experienced Go programming developer',
      });
      assert.equal(withContext1.canonicalSlug, 'go');
      assert.equal(withContext1.normalizationConfidence, 0.85);

      const withContext2 = normalizeSkill('Go', {
        context: 'Backend systems in Go language with high concurrency',
      });
      assert.equal(withContext2.canonicalSlug, 'go');
    });

    it('rejects ambiguous prose "go to the office" or "go for a walk"', () => {
      const prose1 = normalizeSkill('go', { context: 'Please go to the office tomorrow' });
      assert.equal(prose1, null);

      const prose2 = normalizeSkill('go', { context: 'go for lunch' });
      assert.equal(prose2, null);
    });

    it('normalizes "Spring" with technical context to framework "spring"', () => {
      const springTech = normalizeSkill('spring', {
        context: 'Senior Java Spring Boot microservices developer',
      });
      assert.equal(springTech.canonicalSlug, 'spring');
      assert.equal(springTech.canonicalName, 'Spring Framework');
    });

    it('rejects seasonal prose "spring season" or "spring summer"', () => {
      const springSeason = normalizeSkill('spring', {
        context: 'Spring season weather is pleasant',
      });
      assert.equal(springSeason, null);
    });

    it('normalizes "aws cloud" to canonical "aws"', () => {
      const awsRes = normalizeSkill('aws', { context: 'AWS cloud architect' });
      assert.equal(awsRes.canonicalSlug, 'aws');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Unknown Terms & Safe Slugification
  // ---------------------------------------------------------------------------
  describe('5. Unknown Terms & Safe Slugification', () => {
    it('handles uncataloged tools safely without inventing false aliases', () => {
      const result = normalizeSkill('CustomSuperTool2026');
      assert.equal(result.canonicalSlug, 'customsupertool2026');
      assert.equal(result.canonicalName, 'Customsupertool2026');
      assert.equal(result.category, 'TOOL');
      assert.equal(result.isKnown, false);
      assert.equal(result.isCustom, true);
      assert.equal(result.requiresReview, true);
      assert.equal(result.normalizationConfidence, 0.5);
    });

    it('sanitizes non-alphanumeric characters into valid kebab-case slug', () => {
      const result = normalizeSkill('My Fancy Telemetry Engine v2!');
      assert.equal(result.canonicalSlug, 'my-fancy-telemetry-engine-v2');
      assert.equal(result.isKnown, false);
      assert.equal(result.isCustom, true);
    });

    it('handles empty, whitespace-only, or invalid inputs with safe fallback', () => {
      const emptyRes = normalizeSkill('');
      assert.equal(emptyRes.canonicalSlug, 'unknown-tool');
      assert.equal(emptyRes.isKnown, false);

      const nullRes = normalizeSkill(null);
      assert.equal(nullRes.canonicalSlug, 'unknown-tool');
    });

    it('respects input length bounds (MAX_SKILL_INPUT_LENGTH = 100)', () => {
      const oversized = 'a'.repeat(200);
      const res = normalizeSkill(oversized);
      assert.ok(res.canonicalSlug.length <= 50);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Relationship Graph & Directed Edges
  // ---------------------------------------------------------------------------
  describe('6. Relationship Graph & Directed Edges', () => {
    it('validates framework-to-language BUILT_ON relationships', () => {
      const reactRel = getRelationships('react');
      assert.ok(reactRel.builtOn.includes('javascript'));

      const nextRel = getRelationships('next-js');
      assert.ok(nextRel.builtOn.includes('react'));
      assert.ok(nextRel.builtOn.includes('javascript'));

      const fastapiRel = getRelationships('fastapi');
      assert.ok(fastapiRel.builtOn.includes('python'));

      const ginRel = getRelationships('gin');
      assert.ok(ginRel.builtOn.includes('go'));

      const tokioRel = getRelationships('tokio');
      assert.ok(tokioRel.builtOn.includes('rust'));

      const actixRel = getRelationships('actix-web');
      assert.ok(actixRel.builtOn.includes('rust'));
    });

    it('validates driver/utility ECOSYSTEM_OF relationships', () => {
      const awsRel = getRelationships('aws');
      assert.ok(awsRel);

      const drizzleRel = getRelationships('drizzle-orm');
      assert.ok(drizzleRel.ecosystemOf.includes('postgresql'));
    });

    it('validates engine/tool IMPLEMENTS relationships', () => {
      const pgRel = getRelationships('postgresql');
      assert.ok(pgRel.implements.includes('relational-database'));
      assert.ok(pgRel.implements.includes('sql'));

      const kafkaRel = getRelationships('kafka');
      assert.ok(kafkaRel.implements.includes('event-driven-architecture'));

      const grpcRel = getRelationships('grpc');
      assert.ok(grpcRel.implements.includes('microservices'));
      assert.ok(grpcRel.implements.includes('rpc'));
    });

    it('validates taxonomy graph integrity with zero dangling edges', () => {
      const validation = validateTaxonomyGraph();
      assert.equal(validation.isValid, true);
      assert.ok(validation.totalSkills >= 50);
      assert.ok(validation.totalAliases >= 100);
      assert.ok(validation.totalRelationships >= 50);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. TaxonomyMapper Adapter Backward Compatibility
  // ---------------------------------------------------------------------------
  describe('7. TaxonomyMapper Adapter Backward Compatibility', () => {
    it('delegates normalize method to SkillTaxonomyEngine seamlessly', () => {
      const norm1 = TaxonomyMapper.normalize('pg');
      assert.equal(norm1.slug, 'postgresql');
      assert.equal(norm1.name, 'PostgreSQL');
      assert.equal(norm1.category, 'DATABASE');

      const norm2 = TaxonomyMapper.normalize('FastAPI');
      assert.equal(norm2.slug, 'fastapi');
      assert.equal(norm2.name, 'FastAPI');
      assert.equal(norm2.category, 'FRAMEWORK');

      const norm3 = TaxonomyMapper.normalize('nodejs');
      assert.equal(norm3.slug, 'node-js');
      assert.equal(norm3.name, 'Node.js');
      assert.equal(norm3.category, 'LANGUAGE');
    });

    it('exposes precompiled TAXONOMY_CATALOG dictionary', () => {
      assert.ok(TaxonomyMapper.TAXONOMY_CATALOG);
      assert.equal(TaxonomyMapper.TAXONOMY_CATALOG.react.slug, 'react');
      assert.equal(TaxonomyMapper.TAXONOMY_CATALOG.postgresql.slug, 'postgresql');
      assert.equal(TaxonomyMapper.TAXONOMY_CATALOG.docker.slug, 'docker');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Security & Prototype Pollution Hardening
  // ---------------------------------------------------------------------------
  describe('8. Security & Prototype Pollution Hardening', () => {
    it('prevents prototype pollution on __proto__ or constructor inputs', () => {
      const protoRes = normalizeSkill('__proto__');
      assert.equal(protoRes.isKnown, false);
      assert.equal(Object.prototype.polluted, undefined);

      const constructorRes = normalizeSkill('constructor');
      assert.equal(constructorRes.isKnown, false);
    });

    it('isKnownSkill returns false for nonexistent or malicious keys', () => {
      assert.equal(isKnownSkill('__proto__'), false);
      assert.equal(isKnownSkill('valueOf'), false);
      assert.equal(isKnownSkill('nonexistent-tech-xyz'), false);
      assert.equal(isKnownSkill('postgresql'), true);
      assert.equal(isKnownSkill('react'), true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Static Class API & Standalone Helper Equivalence
  // ---------------------------------------------------------------------------
  describe('9. Static Class API & Standalone Helper Equivalence', () => {
    it('resolveCanonicalSkill resolves valid canonical slugs', () => {
      const pgMeta = resolveCanonicalSkill('postgresql');
      assert.equal(pgMeta.name, 'PostgreSQL');
      assert.equal(pgMeta.category, 'DATABASE');

      const classMeta = SkillTaxonomyEngine.resolveCanonicalSkill('postgresql');
      assert.deepEqual(pgMeta, classMeta);

      assert.equal(resolveCanonicalSkill('nonexistent'), null);
      assert.equal(resolveCanonicalSkill(null), null);
    });

    it('getSkillMetadata returns canonical metadata', () => {
      const meta = getSkillMetadata('react');
      assert.equal(meta.slug, 'react');
      assert.equal(meta.name, 'React');
      assert.ok(meta.description.length > 0);
    });

    it('getAliases returns registered aliases for known skills', () => {
      const aliases = getAliases('node-js');
      assert.ok(aliases.includes('nodejs'));
      assert.ok(aliases.includes('node.js'));

      assert.deepEqual(getAliases('nonexistent'), []);
    });

    it('verifies CANONICAL_SKILLS catalog and MAX_SKILL_INPUT_LENGTH constant', () => {
      assert.ok(CANONICAL_SKILLS.postgresql);
      assert.equal(MAX_SKILL_INPUT_LENGTH, 100);
      assert.ok(Object.isFrozen(CANONICAL_SKILLS));
    });
  });
});
