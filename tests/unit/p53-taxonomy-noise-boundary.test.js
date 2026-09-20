/**
 * @file Unit Tests: Taxonomy Noise Boundary & Genuine Technology Extraction (P53)
 *
 * Verifies the generic architectural boundary between:
 * 1. Raw job description text (prose, values, legal, mission, diversity, company marketing)
 * 2. Candidate technical and job requirement concepts
 *
 * Ensures:
 * - Ordinary prose/legal/company-value sentences do NOT reach technical taxonomy classification
 * - Genuine technical terms (Python, Node.js, TypeScript, AWS, API Gateway, Lambda, EC2, RDS,
 *   ECS, PostgreSQL, MariaDB, DynamoDB, MongoDB, REST APIs, distributed systems, operational
 *   excellence, incident management) continue to be extracted and normalized accurately
 * - Unknown-term observation logging is suppressed for prose while remaining active for genuine
 *   uncataloged technical terms
 * - The taxonomy graph remains 100% valid with 0 dangling edges
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeJobInput,
  parseJobDescriptionSections,
} from '../../src/services/job-normalization.service.js';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import {
  SkillTaxonomyEngine,
  CANONICAL_SKILLS,
  validateTaxonomyGraph,
} from '../../src/domain/career/skill-taxonomy.js';
import {
  SkillWorthinessGate,
  SKILL_CLASSIFICATIONS,
} from '../../src/domain/career/skill-worthiness-gate.js';

describe('P53: Taxonomy Noise Boundary & Genuine Technology Extraction', () => {
  const crunchyrollJobDescription = `
About Crunchyroll:
Crunchyroll, LLC is an independently operated joint venture between US-based Sony Pictures Entertainment and Japan's Aniplex, a subsidiary of Sony Music Entertainment (Japan) Inc., both subsidiaries of Tokyo-based Sony Group.

Our Values:
* Service: We serve our community with humility, enabling fans to connect.
* Our mission of helping people belong reflects community.

Our Commitment to Diversity and Inclusion:
We are committed to building a diverse and inclusive team.
* We are an equal opportunity employer and value diversity at our company.

Requirements:
* 3+ years experience with Python, Node.js, or TypeScript
* Experience with AWS, Lambda, API Gateway, EC2, RDS, ECS
* Strong knowledge of databases such as PostgreSQL, MariaDB, DynamoDB, or MongoDB
* Experience designing REST APIs and distributed systems
* Focus on operational excellence and incident management

Equal Opportunity Employer:
We do not discriminate on the basis of race, religion, color, national origin, gender, sexual orientation, age, marital status, veteran status, or disability status.
`;

  // ---------------------------------------------------------------------------
  // 1. Job Description Section Partitioning & Non-Requirement Filtering
  // ---------------------------------------------------------------------------
  describe('1. Section Partitioning & Non-Requirement Filtering', () => {
    it('does not extract items from About Company, Values, Diversity, or Legal sections', () => {
      const items = parseJobDescriptionSections(crunchyrollJobDescription);

      // Verify no company prose, values, diversity, or legal statements are in items
      for (const item of items) {
        assert.ok(
          !item.text.toLowerCase().includes('sony pictures'),
          `Company overview line must not be extracted: ${item.text}`
        );
        assert.ok(
          !item.text.toLowerCase().includes('we serve our community'),
          `Company values bullet must not be extracted: ${item.text}`
        );
        assert.ok(
          !item.text.toLowerCase().includes('helping people belong'),
          `Mission bullet must not be extracted: ${item.text}`
        );
        assert.ok(
          !item.text.toLowerCase().includes('equal opportunity employer'),
          `Diversity/legal text must not be extracted: ${item.text}`
        );
        assert.ok(
          !item.text.toLowerCase().includes('do not discriminate'),
          `Legal non-discrimination text must not be extracted: ${item.text}`
        );
      }
    });

    it('extracts technical requirements from the Requirements section', () => {
      const items = parseJobDescriptionSections(crunchyrollJobDescription);
      assert.ok(items.length > 0, 'Should extract requirement items');

      const allText = items.map((i) => i.text).join(' ');
      assert.ok(allText.includes('Python'), 'Should contain Python');
      assert.ok(allText.includes('AWS'), 'Should contain AWS');
      assert.ok(allText.includes('PostgreSQL'), 'Should contain PostgreSQL');
      assert.ok(allText.includes('REST APIs'), 'Should contain REST APIs');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. normalizeJobInput Output Verification
  // ---------------------------------------------------------------------------
  describe('2. normalizeJobInput Canonical Requirements Boundary', () => {
    it('produces only genuine technical and engineering concepts without prose sentences', () => {
      const result = normalizeJobInput({
        title: 'Software Engineer, Service Monetization',
        description: crunchyrollJobDescription,
      });

      const concepts = result.normalizedRequirements.map((r) => r.normalizedConcept);

      // Assert ordinary prose is NOT in normalizedRequirements
      const forbiddenProseSubstrings = [
        'service we serve our community',
        'helping people belong',
        'equal opportunity employer',
        'value diversity',
        'crunchyroll llc',
        'sony pictures',
        'do not discriminate',
      ];

      for (const concept of concepts) {
        for (const forbidden of forbiddenProseSubstrings) {
          assert.ok(
            !concept.includes(forbidden),
            `Normalized requirements must not contain ordinary prose: "${concept}"`
          );
        }
      }

      // Assert all genuine technical requirements are extracted
      const expectedTechnologies = [
        'python',
        'node.js',
        'typescript',
        'aws',
        'aws lambda',
        'aws ec2',
        'aws rds',
        'aws ecs',
        'postgresql',
        'mariadb',
        'amazon dynamodb',
        'mongodb',
        'rest api',
        'operational excellence',
        'incident management',
      ];

      for (const tech of expectedTechnologies) {
        assert.ok(
          concepts.includes(tech),
          `Expected genuine technology "${tech}" to be present in concepts: ${JSON.stringify(concepts)}`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SkillWorthinessGate Natural Language Boundary
  // ---------------------------------------------------------------------------
  describe('3. SkillWorthinessGate Natural Language Boundary', () => {
    const proseSamples = [
      'service-we-serve-our-community-with-humility-enabl',
      'our-commitment-to-diversity-and-inclusion',
      'our-mission-of-helping-people-belong-reflects-comm',
      'we-are-an-equal-opportunity-employer-and-value-div',
      'crunchyroll-llc-is-an-independently-operated-joint',
      'Service: We serve our community with humility, enabling fans to connect.',
      'Our mission of helping people belong reflects community.',
      'We are an equal opportunity employer and value diversity at our company.',
      'We do not discriminate on the basis of race, religion, color, national origin.',
    ];

    it('classifies all ordinary prose samples as NATURAL_LANGUAGE', () => {
      for (const sample of proseSamples) {
        const classification = SkillWorthinessGate.classify(sample);
        assert.strictEqual(
          classification,
          SKILL_CLASSIFICATIONS.NATURAL_LANGUAGE,
          `Sample "${sample}" must be classified as NATURAL_LANGUAGE`
        );
      }
    });

    it('returns isPlausibleSkill = false for ordinary prose, suppressing telemetry', () => {
      for (const sample of proseSamples) {
        const isPlausible = SkillWorthinessGate.isPlausibleSkill(sample);
        assert.strictEqual(isPlausible, false, `Sample "${sample}" must not be plausible skill`);
      }
    });

    it('returns isPlausibleSkill = true for genuine unknown technologies', () => {
      const unknownTechs = ['triton-inference-server', 'turbopack', 'duckdb', 'clickhouse'];

      for (const tech of unknownTechs) {
        const isPlausible = SkillWorthinessGate.isPlausibleSkill(tech);
        assert.strictEqual(
          isPlausible,
          true,
          `Genuine unknown tech "${tech}" must remain plausible skill`
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. SkillTaxonomyEngine Normalization & Canonical Skills
  // ---------------------------------------------------------------------------
  describe('4. SkillTaxonomyEngine Canonical Mapping of Genuine Technologies', () => {
    const genuineTerms = [
      { input: 'Python', expectedSlug: 'python', expectedCategory: 'LANGUAGE' },
      { input: 'Node.js', expectedSlug: 'node-js', expectedCategory: 'LANGUAGE' },
      { input: 'TypeScript', expectedSlug: 'typescript', expectedCategory: 'LANGUAGE' },
      { input: 'PostgreSQL', expectedSlug: 'postgresql', expectedCategory: 'DATABASE' },
      { input: 'AWS', expectedSlug: 'aws', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'Lambda', expectedSlug: 'lambda', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'AWS Lambda', expectedSlug: 'lambda', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'API Gateway', expectedSlug: 'api-gateway', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'AWS API Gateway', expectedSlug: 'api-gateway', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'Docker', expectedSlug: 'docker', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'CI/CD', expectedSlug: 'ci-cd', expectedCategory: 'ARCHITECTURE' },
      {
        input: 'distributed systems',
        expectedSlug: 'distributed-systems',
        expectedCategory: 'ARCHITECTURE',
      },
      { input: 'REST APIs', expectedSlug: 'rest-api', expectedCategory: 'ARCHITECTURE' },
      { input: 'databases', expectedSlug: 'database', expectedCategory: 'ARCHITECTURE' },
      {
        input: 'operational excellence',
        expectedSlug: 'operational-excellence',
        expectedCategory: 'CONCEPT',
      },
      {
        input: 'incident management',
        expectedSlug: 'incident-management',
        expectedCategory: 'CONCEPT',
      },
      { input: 'EC2', expectedSlug: 'ec2', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'RDS', expectedSlug: 'rds', expectedCategory: 'DATABASE' },
      { input: 'ECS', expectedSlug: 'ecs', expectedCategory: 'CLOUD_DEVOPS' },
      { input: 'MariaDB', expectedSlug: 'mariadb', expectedCategory: 'DATABASE' },
      { input: 'DynamoDB', expectedSlug: 'dynamodb', expectedCategory: 'DATABASE' },
      { input: 'MongoDB', expectedSlug: 'mongodb', expectedCategory: 'DATABASE' },
    ];

    for (const { input, expectedSlug, expectedCategory } of genuineTerms) {
      it(`normalizes "${input}" to canonical slug "${expectedSlug}" (${expectedCategory})`, () => {
        const norm = SkillTaxonomyEngine.normalizeSkill(input);
        assert.ok(norm, `Expected valid normalization for "${input}"`);
        assert.strictEqual(norm.canonicalSlug, expectedSlug, `Slug mismatch for "${input}"`);
        assert.strictEqual(norm.category, expectedCategory, `Category mismatch for "${input}"`);
        assert.strictEqual(norm.isKnown, true, `Expected "${input}" to be known`);
        assert.notStrictEqual(norm.category, 'NOISE', `Expected "${input}" not to be noise`);
      });
    }

    it('rejects ordinary prose as NOISE with isNoise = true', () => {
      const prose = 'service-we-serve-our-community-with-humility-enabl';
      const norm = SkillTaxonomyEngine.normalizeSkill(prose);
      assert.ok(norm, 'Should return normalization object');
      assert.strictEqual(norm.category, 'NOISE');
      assert.strictEqual(norm.isNoise, true);
      assert.strictEqual(norm.isSkillWorthy, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Taxonomy Graph Integrity
  // ---------------------------------------------------------------------------
  describe('5. Taxonomy Graph Integrity', () => {
    it('validates taxonomy graph with zero dangling edges', () => {
      const graph = validateTaxonomyGraph();
      assert.strictEqual(graph.isValid, true);
      assert.ok(graph.totalSkills >= 180, `Expected at least 180 skills, got ${graph.totalSkills}`);
      assert.ok(
        graph.totalRelationships >= 450,
        `Expected at least 450 relationships, got ${graph.totalRelationships}`
      );
    });
  });
});
