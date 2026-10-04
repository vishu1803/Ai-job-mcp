/**
 * @file Phase 1 Requirement Semantics Regression Test Suite
 *
 * Verifies canonical requirement semantic preservation:
 * - Multiline education clauses preserve semantic qualifiers across linebreaks
 * - Single-line education clauses correctly detect preferred vs required cues
 * - Technical skill classification (6 REQUIRED, 4 PREFERRED) does not regress
 * - Mixed baseline JD maintains canonical education as PREFERRED and technical skills intact
 * - normalizeJobInput preserves canonical importance and required flags
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

describe('Phase 1 — Canonical Requirement Semantics', () => {
  // ---------------------------------------------------------------------------
  // TEST 1 — Multiline preferred education
  // ---------------------------------------------------------------------------
  it('TEST 1 — Multiline preferred education resolves to PREFERRED and required=false', async () => {
    const input = `Bachelor's degree in Computer Science, Electronics Engineering,
or related field preferred.`;

    // 1. Direct JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
    assert.ok(eduReq, 'Education requirement must be extracted');
    assert.equal(eduReq.importance, 'PREFERRED');
    assert.equal(eduReq.weight, 0.4);

    // 2. parseJobDescriptionSections
    const sections = parseJobDescriptionSections(input);
    const sectionEdu = sections.find((s) => s.category === 'EDUCATION' || /bachelor/i.test(s.text));
    assert.ok(sectionEdu, 'Education item must be extracted in section parsing');
    assert.equal(sectionEdu.importance, 'PREFERRED');

    // 3. Canonical normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normEdu = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
    );
    assert.ok(normEdu, 'Normalized requirement must exist for education');
    assert.equal(normEdu.importance, 'PREFERRED');
    assert.equal(normEdu.required, false);
  });

  // ---------------------------------------------------------------------------
  // TEST 2 — Multiline required education
  // ---------------------------------------------------------------------------
  it('TEST 2 — Multiline required education resolves to REQUIRED and required=true', async () => {
    const input = `Bachelor's degree in Computer Science, Electronics Engineering,
or related field required.`;

    // 1. Direct JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
    assert.ok(eduReq, 'Education requirement must be extracted');
    assert.equal(eduReq.importance, 'REQUIRED');
    assert.equal(eduReq.weight, 0.75);

    // 2. parseJobDescriptionSections
    const sections = parseJobDescriptionSections(input);
    const sectionEdu = sections.find((s) => s.category === 'EDUCATION' || /bachelor/i.test(s.text));
    assert.ok(sectionEdu, 'Education item must be extracted in section parsing');
    assert.equal(sectionEdu.importance, 'REQUIRED');

    // 3. Canonical normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normEdu = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
    );
    assert.ok(normEdu, 'Normalized requirement must exist for education');
    assert.equal(normEdu.importance, 'REQUIRED');
    assert.equal(normEdu.required, true);

    // Multiline "must be completed" variant
    const completedInput = `Bachelor's degree in Computer Science,
or related field must be completed.`;
    const parsedCompleted = await JobDescriptionParser.parse({ rawText: completedInput });
    const completedEdu = parsedCompleted.requirements.find((r) => r.category === 'EDUCATION');
    assert.ok(completedEdu, 'Education requirement must be extracted');
    assert.equal(completedEdu.importance, 'REQUIRED');

    const normCompleted = normalizeJobInput({ description: completedInput });
    const normCompletedEdu = normCompleted.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
    );
    assert.ok(normCompletedEdu, 'Normalized education must exist');
    assert.equal(normCompletedEdu.importance, 'REQUIRED');
    assert.equal(normCompletedEdu.required, true);
  });

  // ---------------------------------------------------------------------------
  // TEST 3 — Single-line preferred education
  // ---------------------------------------------------------------------------
  it('TEST 3 — Single-line preferred education variants resolve to PREFERRED and required=false', async () => {
    const variants = [
      "Bachelor's degree preferred",
      "Bachelor's degree is preferred",
      "Bachelor's degree desired",
      "Bachelor's degree nice to have",
    ];

    for (const variant of variants) {
      // Direct parser
      const parsed = await JobDescriptionParser.parse({ rawText: variant });
      const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
      assert.ok(eduReq, `Education must be extracted for: "${variant}"`);
      assert.equal(
        eduReq.importance,
        'PREFERRED',
        `Expected PREFERRED for: "${variant}" in JobDescriptionParser`
      );

      // Section parser
      const sections = parseJobDescriptionSections(variant);
      const sectionEdu = sections.find(
        (s) => s.category === 'EDUCATION' || /bachelor/i.test(s.text)
      );
      assert.ok(sectionEdu, `Section education item must be found for: "${variant}"`);
      assert.equal(
        sectionEdu.importance,
        'PREFERRED',
        `Expected PREFERRED in sections for: "${variant}"`
      );

      // Canonical normalizeJobInput
      const normalized = normalizeJobInput({ description: variant });
      const normEdu = normalized.normalizedRequirements.find(
        (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
      );
      assert.ok(normEdu, `Normalized education must be found for: "${variant}"`);
      assert.equal(
        normEdu.importance,
        'PREFERRED',
        `Expected normalized PREFERRED for: "${variant}"`
      );
      assert.equal(normEdu.required, false, `Expected required=false for: "${variant}"`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 4 — Single-line required education
  // ---------------------------------------------------------------------------
  it('TEST 4 — Single-line required education variants resolve to REQUIRED and required=true', async () => {
    const variants = [
      "Bachelor's degree required",
      "Bachelor's degree is required",
    ];

    for (const variant of variants) {
      // Direct parser
      const parsed = await JobDescriptionParser.parse({ rawText: variant });
      const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
      assert.ok(eduReq, `Education must be extracted for: "${variant}"`);
      assert.equal(
        eduReq.importance,
        'REQUIRED',
        `Expected REQUIRED for: "${variant}" in JobDescriptionParser`
      );

      // Section parser
      const sections = parseJobDescriptionSections(variant);
      const sectionEdu = sections.find(
        (s) => s.category === 'EDUCATION' || /bachelor/i.test(s.text)
      );
      assert.ok(sectionEdu, `Section education item must be found for: "${variant}"`);
      assert.equal(
        sectionEdu.importance,
        'REQUIRED',
        `Expected REQUIRED in sections for: "${variant}"`
      );

      // Canonical normalizeJobInput
      const normalized = normalizeJobInput({ description: variant });
      const normEdu = normalized.normalizedRequirements.find(
        (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
      );
      assert.ok(normEdu, `Normalized education must be found for: "${variant}"`);
      assert.equal(
        normEdu.importance,
        'REQUIRED',
        `Expected normalized REQUIRED for: "${variant}"`
      );
      assert.equal(normEdu.required, true, `Expected required=true for: "${variant}"`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 5 — Existing technical required skills must NOT regress
  // ---------------------------------------------------------------------------
  it('TEST 5 — Existing technical required skills must NOT regress', async () => {
    const input = `Required:
JavaScript, React, Node.js, PostgreSQL, REST APIs, Git.`;

    const expectedRequiredSkills = [
      'javascript',
      'react',
      'node-js',
      'postgresql',
      'rest-api',
      'git',
    ];

    // 1. Direct JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const parsedSkills = parsed.requirements.filter((r) => r.category === 'SKILL');
    assert.equal(parsedSkills.length, 6, 'Must extract all 6 required skills');
    for (const skill of parsedSkills) {
      assert.equal(
        skill.importance,
        'REQUIRED',
        `Skill ${skill.skillSlug} must have importance REQUIRED`
      );
    }

    // 2. Canonical normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normReqs = normalized.normalizedRequirements.filter((r) => r.category === 'SKILL');
    assert.equal(normReqs.length, 6, 'normalizeJobInput must preserve all 6 skills');

    for (const skillSlug of expectedRequiredSkills) {
      const match = normReqs.find((r) => r.skillSlug === skillSlug);
      assert.ok(match, `Normalized skill ${skillSlug} must be present`);
      assert.equal(match.importance, 'REQUIRED', `Skill ${skillSlug} must remain REQUIRED`);
      assert.equal(match.required, true, `Skill ${skillSlug} must have required=true`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 6 — Existing technical preferred skills must NOT regress
  // ---------------------------------------------------------------------------
  it('TEST 6 — Existing technical preferred skills must NOT regress', async () => {
    const input = `Preferred:
Next.js, Docker, TypeScript, FastAPI.`;

    const expectedPreferredSkills = [
      'next-js',
      'docker',
      'typescript',
      'fastapi',
    ];

    // 1. Direct JobDescriptionParser
    const parsed = await JobDescriptionParser.parse({ rawText: input });
    const parsedSkills = parsed.requirements.filter((r) => r.category === 'SKILL');
    assert.equal(parsedSkills.length, 4, 'Must extract all 4 preferred skills');
    for (const skill of parsedSkills) {
      assert.equal(
        skill.importance,
        'PREFERRED',
        `Skill ${skill.skillSlug} must have importance PREFERRED`
      );
    }

    // 2. Canonical normalizeJobInput
    const normalized = normalizeJobInput({ description: input });
    const normReqs = normalized.normalizedRequirements.filter((r) => r.category === 'SKILL');
    assert.equal(normReqs.length, 4, 'normalizeJobInput must preserve all 4 skills');

    for (const skillSlug of expectedPreferredSkills) {
      const match = normReqs.find((r) => r.skillSlug === skillSlug);
      assert.ok(match, `Normalized skill ${skillSlug} must be present`);
      assert.equal(match.importance, 'PREFERRED', `Skill ${skillSlug} must remain PREFERRED`);
      assert.equal(match.required, false, `Skill ${skillSlug} must have required=false`);
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 7 — Mixed baseline JD
  // ---------------------------------------------------------------------------
  it('TEST 7 — Mixed baseline JD preserves canonical education as PREFERRED and technical skills intact', async () => {
    // 1. Direct JobDescriptionParser (used by analyze_job_fit)
    const parsed = await JobDescriptionParser.parse({ rawText: BASELINE_JD });

    // Education requirement
    const eduReq = parsed.requirements.find((r) => r.category === 'EDUCATION');
    assert.ok(eduReq, 'Education requirement must be present');
    assert.equal(eduReq.importance, 'PREFERRED', 'Canonical education must be PREFERRED');
    assert.equal(eduReq.weight, 0.4);

    // Required skills
    const requiredSlugs = ['javascript', 'react', 'node-js', 'postgresql', 'rest-api', 'git'];
    for (const slug of requiredSlugs) {
      const skill = parsed.requirements.find(
        (r) => r.category === 'SKILL' && r.skillSlug === slug
      );
      assert.ok(skill, `Required skill ${slug} must be extracted`);
      assert.equal(skill.importance, 'REQUIRED', `Skill ${slug} must be REQUIRED`);
    }

    // Preferred skills
    const preferredSlugs = ['next-js', 'docker', 'typescript', 'fastapi'];
    for (const slug of preferredSlugs) {
      const skill = parsed.requirements.find(
        (r) => r.category === 'SKILL' && r.skillSlug === slug
      );
      assert.ok(skill, `Preferred skill ${slug} must be extracted`);
      assert.equal(skill.importance, 'PREFERRED', `Skill ${slug} must be PREFERRED`);
    }

    // 2. Canonical normalizeJobInput
    const normalized = normalizeJobInput({ description: BASELINE_JD });
    const normEdu = normalized.normalizedRequirements.find(
      (r) => r.category === 'EDUCATION' || /bachelor/i.test(r.name || r.skillSlug)
    );
    assert.ok(normEdu, 'Normalized education requirement must be present');
    assert.equal(normEdu.importance, 'PREFERRED');
    assert.equal(normEdu.required, false);

    for (const slug of ['javascript', 'react', 'postgresql', 'git']) {
      const match = normalized.normalizedRequirements.find((r) =>
        (r.skillSlug || r.name).toLowerCase().includes(slug)
      );
      assert.ok(match, `Technical skill ${slug} must exist in normalized`);
      assert.equal(match.importance, 'REQUIRED');
      assert.equal(match.required, true);
    }

    for (const slug of ['next-js', 'docker', 'typescript', 'fastapi']) {
      const match = normalized.normalizedRequirements.find((r) =>
        (r.skillSlug || r.name).toLowerCase().includes(slug)
      );
      assert.ok(match, `Technical skill ${slug} must exist in normalized`);
      assert.equal(match.importance, 'PREFERRED');
      assert.equal(match.required, false);
    }
  });
});
