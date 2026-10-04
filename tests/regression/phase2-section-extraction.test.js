/**
 * @file Phase 2 Section Extraction & Requirement Inflation Regression Test Suite
 *
 * Verifies that:
 * - Responsibility prose is recognized and does not produce artificial requirements
 * - Standard responsibilities headers do not convert duties into requirements
 * - Duties prose is recognized without requirement inflation
 * - Required and Preferred sections maintain strict priority classifications
 * - Responsibilities followed by requirements extract only genuine requirements
 * - Complete baseline JD produces exactly 11 canonical requirements without prose inflation
 * - normalizeJobInput produces no artificial responsibility fragments
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import {
  parseJobDescriptionSections,
  normalizeJobInput,
} from '../../src/services/job-normalization.service.js';

const BASELINE_JD = `Junior Full Stack Engineer

We are hiring a Junior Full Stack Engineer in India.

Required:
JavaScript, React, Node.js, PostgreSQL, REST APIs, Git.

Preferred:
Next.js, Docker, TypeScript, FastAPI.

Responsibilities include building frontend applications,
designing REST APIs, working with PostgreSQL databases,
writing tests, debugging production issues, and collaborating
with engineers.

Bachelor's degree in Computer Science, Electronics Engineering,
or related field preferred.

Remote or hybrid work in India.
Candidates should be eligible to work in India.`;

describe('Phase 2 — Section Extraction & Requirement Inflation', () => {
  // ---------------------------------------------------------------------------
  // TEST 1 — Prose responsibilities
  // ---------------------------------------------------------------------------
  it('TEST 1 — Prose responsibilities do not produce artificial requirements', async () => {
    const input = `Responsibilities include building frontend applications,
designing REST APIs, working with PostgreSQL databases,
writing tests, debugging production issues, and collaborating
with engineers.`;

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    assert.equal(
      parsed.requirements.length,
      0,
      'JobDescriptionParser must not extract requirements from pure responsibility prose'
    );

    // 2. parseJobDescriptionSections
    const sections = parseJobDescriptionSections(input);
    assert.equal(
      sections.length,
      0,
      'parseJobDescriptionSections must not extract requirement items from responsibility prose'
    );

    // 3. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    assert.equal(
      normalized.normalizedRequirements.length,
      0,
      'normalizeJobInput must not create artificial requirements from responsibility prose'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Standard responsibilities header
  // ---------------------------------------------------------------------------
  it('TEST 2 — Standard responsibilities header does not convert duties into requirements', async () => {
    const input = `Responsibilities:
Build frontend applications.
Design REST APIs.`;

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    assert.equal(
      parsed.requirements.length,
      0,
      'JobDescriptionParser must not convert duties under Responsibilities: into requirements'
    );

    // 2. parseJobDescriptionSections
    const sections = parseJobDescriptionSections(input);
    assert.equal(
      sections.length,
      0,
      'parseJobDescriptionSections must not create requirement items from responsibility section duties'
    );

    // 3. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    assert.equal(
      normalized.normalizedRequirements.length,
      0,
      'normalizeJobInput must not create requirements from duties under responsibilities header'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Duties prose
  // ---------------------------------------------------------------------------
  it('TEST 3 — Duties prose does not inflate requirements', async () => {
    const input = `Duties include maintaining backend services and debugging APIs.`;

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    assert.equal(
      parsed.requirements.length,
      0,
      'JobDescriptionParser must not extract requirements from duties prose'
    );

    // 2. parseJobDescriptionSections
    const sections = parseJobDescriptionSections(input);
    assert.equal(
      sections.length,
      0,
      'parseJobDescriptionSections must not create requirement items from duties prose'
    );

    // 3. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    assert.equal(
      normalized.normalizedRequirements.length,
      0,
      'normalizeJobInput must not produce requirements from duties prose'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Required section regression
  // ---------------------------------------------------------------------------
  it('TEST 4 — Required section regression preserves all six required skills', async () => {
    const input = `Required:
JavaScript
React
Node.js
PostgreSQL
REST APIs
Git`;

    const expectedSlugs = ['javascript', 'react', 'node-js', 'postgresql', 'rest-api', 'git'];

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const parsedSkills = parsed.requirements.filter((r) => r.category === 'SKILL');
    assert.equal(parsedSkills.length, 6, 'Must extract all 6 required skills');
    for (const skill of parsedSkills) {
      assert.equal(skill.importance, 'REQUIRED', `Skill ${skill.skillSlug} must be REQUIRED`);
    }

    // 2. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normReqs = normalized.normalizedRequirements.filter((r) => r.category === 'SKILL');
    assert.equal(normReqs.length, 6, 'normalizeJobInput must contain all 6 skills');

    for (const slug of expectedSlugs) {
      const match = normReqs.find((r) => r.skillSlug === slug);
      assert.ok(match, `Normalized skill ${slug} must be present`);
      assert.equal(match.importance, 'REQUIRED', `Skill ${slug} must be REQUIRED`);
      assert.equal(match.required, true, `Skill ${slug} must have required=true`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Preferred section regression
  // ---------------------------------------------------------------------------
  it('TEST 5 — Preferred section regression preserves all four preferred skills', async () => {
    const input = `Preferred:
Next.js
Docker
TypeScript
FastAPI`;

    const expectedSlugs = ['next-js', 'docker', 'typescript', 'fastapi'];

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const parsedSkills = parsed.requirements.filter((r) => r.category === 'SKILL');
    assert.equal(parsedSkills.length, 4, 'Must extract all 4 preferred skills');
    for (const skill of parsedSkills) {
      assert.equal(skill.importance, 'PREFERRED', `Skill ${skill.skillSlug} must be PREFERRED`);
    }

    // 2. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normReqs = normalized.normalizedRequirements.filter((r) => r.category === 'SKILL');
    assert.equal(normReqs.length, 4, 'normalizeJobInput must contain all 4 preferred skills');

    for (const slug of expectedSlugs) {
      const match = normReqs.find((r) => r.skillSlug === slug);
      assert.ok(match, `Normalized skill ${slug} must be present`);
      assert.equal(match.importance, 'PREFERRED', `Skill ${slug} must be PREFERRED`);
      assert.equal(match.required, false, `Skill ${slug} must have required=false`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Responsibilities followed by requirements
  // ---------------------------------------------------------------------------
  it('TEST 6 — Responsibilities followed by requirements creates only genuine requirements', async () => {
    const input = `Responsibilities include building frontend applications.

Required:
React
Node.js
PostgreSQL`;

    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    assert.equal(parsed.requirements.length, 3, 'Must extract exactly 3 requirements');
    const parsedSlugs = parsed.requirements.map((r) => r.skillSlug);
    assert.deepEqual(parsedSlugs.sort(), ['node-js', 'postgresql', 'react']);

    // 2. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    assert.equal(
      normalized.normalizedRequirements.length,
      3,
      'normalizeJobInput must contain exactly 3 requirements'
    );

    const normSlugs = normalized.normalizedRequirements.map((r) => r.skillSlug);
    assert.deepEqual(normSlugs.sort(), ['node-js', 'postgresql', 'react']);

    for (const r of normalized.normalizedRequirements) {
      assert.equal(r.importance, 'REQUIRED');
      assert.equal(r.required, true);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Complete baseline JD
  // ---------------------------------------------------------------------------
  it('TEST 7 — Complete baseline JD produces exactly 11 canonical requirements without prose inflation', async () => {
    // 1. JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: BASELINE_JD });
    assert.equal(
      parsed.requirements.length,
      11,
      'JobDescriptionParser must extract exactly 11 requirements'
    );

    // 2. normalizeJobInput
    const normalized = normalizeJobInput({ description: BASELINE_JD });
    assert.equal(
      normalized.normalizedRequirements.length,
      11,
      'normalizeJobInput must extract exactly 11 requirements (no prose inflation)'
    );

    // Verify 6 REQUIRED technical skills
    const expectedRequired = ['javascript', 'react', 'node-js', 'postgresql', 'rest-api', 'git'];
    for (const slug of expectedRequired) {
      const match = normalized.normalizedRequirements.find((r) => r.skillSlug === slug);
      assert.ok(match, `Required skill ${slug} must be present`);
      assert.equal(match.importance, 'REQUIRED', `Skill ${slug} must be REQUIRED`);
      assert.equal(match.required, true, `Skill ${slug} must have required=true`);
    }

    // Verify 4 PREFERRED technical skills
    const expectedPreferred = ['next-js', 'docker', 'typescript', 'fastapi'];
    for (const slug of expectedPreferred) {
      const match = normalized.normalizedRequirements.find((r) => r.skillSlug === slug);
      assert.ok(match, `Preferred skill ${slug} must be present`);
      assert.equal(match.importance, 'PREFERRED', `Skill ${slug} must be PREFERRED`);
      assert.equal(match.required, false, `Skill ${slug} must have required=false`);
    }

    // Verify 1 PREFERRED education
    const eduMatch = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.text)
    );
    assert.ok(eduMatch, 'Education requirement must be present');
    assert.equal(eduMatch.importance, 'PREFERRED', 'Education requirement must be PREFERRED');
    assert.equal(eduMatch.required, false, 'Education requirement must have required=false');

    // Verify no false requirements exist
    const slugs = normalized.normalizedRequirements.map((r) => r.skillSlug || r.name);
    assert.ok(
      !slugs.includes('responsibilities-include-building-frontend'),
      'Rogue responsibilities prose must not be present'
    );
    assert.ok(!slugs.includes('with-engineers'), 'Rogue prepositional phrase must not be present');
    assert.ok(
      !slugs.includes('database-management'),
      'Rogue generic database-management concept must not be present'
    );
    assert.ok(
      !slugs.includes('writing-tests-debugging-production-issues-and-collaborating'),
      'Rogue prose fragment must not be present'
    );
  });

  // ---------------------------------------------------------------------------
  // TEST 8 — Normalization path & Headerless combination
  // ---------------------------------------------------------------------------
  it('TEST 8 — Normalization path distinguishes education, responsibility prose, and explicit skills', async () => {
    const input = `Bachelor's degree preferred.

Responsibilities include building frontend applications.

JavaScript and React experience required.`;

    // 1. Direct JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    assert.equal(parsed.requirements.length, 3, 'JobDescriptionParser must extract exactly 3 requirements');

    const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
    assert.ok(eduReq, 'Education must be extracted');
    assert.equal(eduReq.importance, 'PREFERRED');

    const jsReq = parsed.requirements.find((r) => r.skillSlug === 'javascript');
    assert.ok(jsReq, 'JavaScript must be extracted');
    assert.equal(jsReq.importance, 'REQUIRED');

    const reactReq = parsed.requirements.find((r) => r.skillSlug === 'react');
    assert.ok(reactReq, 'React must be extracted');
    assert.equal(reactReq.importance, 'REQUIRED');

    // 2. normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    assert.equal(
      normalized.normalizedRequirements.length,
      3,
      'normalizeJobInput must extract exactly 3 requirements'
    );

    const normEdu = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.text)
    );
    assert.ok(normEdu, 'Normalized education must exist');
    assert.equal(normEdu.importance, 'PREFERRED');
    assert.equal(normEdu.required, false);

    const normJs = normalized.normalizedRequirements.find((r) => r.skillSlug === 'javascript');
    assert.ok(normJs, 'Normalized JavaScript must exist');
    assert.equal(normJs.importance, 'REQUIRED');
    assert.equal(normJs.required, true);

    const normReact = normalized.normalizedRequirements.find((r) => r.skillSlug === 'react');
    assert.ok(normReact, 'Normalized React must exist');
    assert.equal(normReact.importance, 'REQUIRED');
    assert.equal(normReact.required, true);

    // Verify responsibility prose was completely omitted
    const normSlugs = normalized.normalizedRequirements.map((r) => r.skillSlug || r.name);
    assert.ok(
      !normSlugs.includes('responsibilities-include-building-frontend'),
      'Responsibility prose must not become a normalized requirement'
    );
  });
});
