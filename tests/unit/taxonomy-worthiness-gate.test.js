import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SkillWorthinessGate,
  SKILL_CLASSIFICATIONS,
} from '../../src/domain/career/skill-worthiness-gate.js';
import { resolveParentSkills } from '../../src/domain/career/parent-skill-mappings.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { TaxonomyMapper } from '../../src/extractors/github/taxonomy/taxonomy-mapper.js';

describe('Skill Worthiness Gate & Taxonomy Boundary Tests', () => {
  describe('Classification & Gate Evaluation', () => {
    it('correctly classifies real programming languages as REAL_SKILL and skill-worthy', () => {
      const languages = ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'c++'];
      for (const lang of languages) {
        const evalRes = SkillWorthinessGate.evaluate(lang);
        assert.equal(evalRes.isSkillWorthy, true, `${lang} should be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.REAL_SKILL,
          `${lang} should be REAL_SKILL`
        );
      }
    });

    it('correctly classifies core databases and infrastructure as TECHNOLOGY and skill-worthy', () => {
      const techs = ['docker', 'kubernetes', 'redis', 'postgresql', 'mongodb', 'kafka', 'git'];
      for (const tech of techs) {
        const evalRes = SkillWorthinessGate.evaluate(tech);
        assert.equal(evalRes.isSkillWorthy, true, `${tech} should be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.TECHNOLOGY,
          `${tech} should be TECHNOLOGY`
        );
      }
    });

    it('correctly classifies frameworks as FRAMEWORK and skill-worthy', () => {
      const frameworks = [
        'react',
        'next-js',
        'express',
        'fastify',
        'django',
        'fastapi',
        'tailwindcss',
      ];
      for (const fw of frameworks) {
        const evalRes = SkillWorthinessGate.evaluate(fw);
        assert.equal(evalRes.isSkillWorthy, true, `${fw} should be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.FRAMEWORK,
          `${fw} should be FRAMEWORK`
        );
      }
    });

    it('correctly rejects micro-utilities and styling helpers as IMPLEMENTATION_DETAIL', () => {
      const utilities = [
        'clsx',
        'classnames',
        'tailwind-merge',
        'class-variance-authority',
        'cva',
        'date-fns',
        'dotenv',
        'dotenv-cli',
        'cross-env',
        'pino',
        'morgan',
        'cookie-parser',
        'cors',
        'helmet',
        'bcryptjs',
      ];
      for (const util of utilities) {
        const evalRes = SkillWorthinessGate.evaluate(util);
        assert.equal(evalRes.isSkillWorthy, false, `${util} must NOT be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL,
          `${util} should be IMPLEMENTATION_DETAIL`
        );
      }
    });

    it('correctly rejects internal modules and platform built-ins', () => {
      const internals = [
        'node:crypto',
        'node-crypto',
        'node-dns',
        'node-fs',
        'node-perf-hooks',
        '@internal/auth',
      ];
      for (const mod of internals) {
        const evalRes = SkillWorthinessGate.evaluate(mod);
        assert.equal(evalRes.isSkillWorthy, false, `${mod} must NOT be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.INTERNAL_MODULE,
          `${mod} should be INTERNAL_MODULE`
        );
      }
    });

    it('correctly rejects config presets and linter plugins', () => {
      const presets = [
        '@types/node',
        '@types/react',
        'eslint-config-next',
        'eslint-plugin-react-hooks',
        'eslint-config-prettier',
        'prettier-plugin-tailwindcss',
      ];
      for (const preset of presets) {
        const evalRes = SkillWorthinessGate.evaluate(preset);
        assert.equal(evalRes.isSkillWorthy, false, `${preset} must NOT be skill-worthy`);
        assert.equal(
          evalRes.classification,
          SKILL_CLASSIFICATIONS.CONFIG_PRESET,
          `${preset} should be CONFIG_PRESET`
        );
      }
    });
  });

  describe('Parent-Skill Evidence Mappings', () => {
    it('resolves tailwind-merge to tailwindcss', () => {
      const parents = resolveParentSkills('tailwind-merge');
      assert.ok(parents && parents.length > 0);
      assert.equal(parents[0].parentSlug, 'tailwindcss');
      assert.ok(parents[0].confidence >= 0.8);
    });

    it('resolves drizzle-orm-node-postgres to both drizzle-orm and postgresql', () => {
      const parents = resolveParentSkills('drizzle-orm-node-postgres');
      assert.ok(parents && parents.length === 2);
      const slugs = parents.map((p) => p.parentSlug);
      assert.ok(slugs.includes('drizzle-orm'));
      assert.ok(slugs.includes('postgresql'));
    });

    it('resolves socket-io-client to socket-io', () => {
      const parents = resolveParentSkills('socket-io-client');
      assert.ok(parents && parents.length > 0);
      assert.equal(parents[0].parentSlug, 'socket-io');
    });

    it('resolves react UI helpers to react', () => {
      const helpers = ['lucide-react', 'react-icons', 'framer-motion', 'cmdk'];
      for (const h of helpers) {
        const parents = resolveParentSkills(h);
        assert.ok(parents, `${h} should have parent mappings`);
        assert.ok(
          parents.some((p) => p.parentSlug === 'react'),
          `${h} should map to react`
        );
      }
    });

    it('returns null for unmapped generic utilities without parents', () => {
      assert.equal(resolveParentSkills('clsx'), null);
      assert.equal(resolveParentSkills('dotenv'), null);
      assert.equal(resolveParentSkills('cookie-parser'), null);
    });
  });

  describe('Taxonomy Normalization & Telemetry Boundary', () => {
    it('normalizes known technologies normally', () => {
      const norm = SkillTaxonomyEngine.normalizeSkill('docker');
      assert.equal(norm.canonicalSlug, 'docker');
      assert.equal(Boolean(norm.isNoise), false);
      assert.equal(norm.category, 'CLOUD_DEVOPS');
    });

    it('marks rejected packages as NOISE and not skill-worthy', () => {
      const rejected = ['clsx', 'tailwind-merge', 'date-fns', 'dotenv', 'pino', 'morgan'];
      for (const pkg of rejected) {
        const norm = TaxonomyMapper.normalize(pkg);
        assert.ok(norm.isNoise, `${pkg} should be marked as noise`);
        assert.equal(norm.category, 'NOISE', `${pkg} category should be NOISE`);
        assert.equal(norm.isSkillWorthy, false, `${pkg} isSkillWorthy should be false`);
      }
    });

    it('isSkillWorthy returns false for all implementation details', () => {
      assert.equal(SkillWorthinessGate.isSkillWorthy('clsx'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('tailwind-merge'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('cookie-parser'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('date-fns'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('dotenv'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('pino'), false);
      assert.equal(SkillWorthinessGate.isSkillWorthy('docker'), true);
      assert.equal(SkillWorthinessGate.isSkillWorthy('react'), true);
      assert.equal(SkillWorthinessGate.isSkillWorthy('postgresql'), true);
    });
  });
});
