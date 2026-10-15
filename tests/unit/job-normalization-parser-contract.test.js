import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobDescriptionParser } from '../../src/domain/career/job-parser.js';
import {
  normalizeJobInput,
  normalizeJobRequirementString,
} from '../../src/services/job-normalization.service.js';

test('canonical parser requirements survive normalization through extractedValue', async () => {
  const description =
    'Requirements: Node.js API development and PostgreSQL database migrations. Implement supported API endpoints and write integration tests for validation and error responses.';
  const parsed = await JobDescriptionParser.parse(
    { source: 'PASTE', title: 'Backend Engineer', rawText: description },
    { tenantId: '00000000-0000-4000-8000-000000000900' }
  );
  assert.ok(parsed.requirements.length >= 2);
  const output = normalizeJobInput({
    title: 'Backend Engineer',
    requirements: parsed.requirements,
  });
  const concepts = output.normalizedRequirements.map((r) => r.normalizedConcept);
  assert.ok(concepts.includes('node.js'));
  assert.ok(concepts.includes('postgresql'));
  assert.ok(!concepts.includes('kubernetes'));
  assert.ok(output.normalizedRequirements.every((r) => r.importance === 'REQUIRED'));
});

test('existing explicit requirement wording retains precedence over extractedValue', () => {
  assert.equal(
    normalizeJobRequirementString({ text: 'Python', extractedValue: 'Unrelated value' }),
    'Python'
  );
  assert.equal(
    normalizeJobRequirementString({ category: 'SKILL', extractedValue: ' PostgreSQL ' }),
    'PostgreSQL'
  );
  assert.equal(
    normalizeJobRequirementString({ category: 'SKILL', extractedValue: { unsafe: 'shape' } }),
    ''
  );
});
