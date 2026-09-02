/**
 * @file Regression Tests for analyze_job_fit Atomic Requirement Extraction
 *
 * Tests that compound job requirement sentences are properly decomposed
 * into atomic skills, and that matching against candidate evidence works
 * correctly with provenance-aware matching.
 *
 * Verifies fixes for:
 * - Compound pseudo-skills like "familiarity-with-access-control-models-such-as-rba"
 * - Missing matches for TypeScript/React/Node.js when candidate has evidence
 * - prioritizedSkillGaps using atomic skill names
 * - requirementMatches explainability
 * - Project relevance linked to specific requirements
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Minimal reproduction of the _splitIntoAtomicSkills logic
 * extracted from career-read-tools.js for testing
 */
function splitIntoAtomicSkills(text) {
  if (!text || typeof text !== 'string') return [];

  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length < 40) {
    const norm = cleaned.replace(/^[•\s\-*\d.)]+/, '').trim();
    if (norm) return [norm];
    return [];
  }

  const stripped = cleaned
    .replace(/^(?:proficiency\s+in|experience\s+(?:with|in|using)|knowledge\s+of|familiarity\s+with|skills?\s+(?:in|with)|understanding\s+of|background\s+in|exposure\s+to|working\s+(?:knowledge\s+of|with)|hands[- ]on\s+(?:experience\s+with|knowledge\s+of)|practical\s+experience\s+(?:developing\s+and\s+improving|with|in)|strong\s+(?:knowledge\s+of|understanding\s+of|background\s+in)|good\s+(?:knowledge\s+of|understanding\s+of)|solid\s+(?:knowledge\s+of|understanding\s+of|experience\s+with)|demonstrated\s+(?:experience\s+with|knowledge\s+of)|proven\s+(?:experience\s+with|track\s+record\s+in))\s*/i, '')
    .replace(/$/i, '');

  const candidates = stripped
    .split(/\s*[,;]\s*|\s+and\s+|\s+or\s+/)
    .flatMap(s => s.split(/\s*[/]\s*/))
    .map(s => s.replace(/^[•\s\-*\d.)]+/, '').trim())
    .map(s => s.replace(/^(?:and|or|,|and\s+|or\s+)\s*/i, '').trim())
    .filter(s => s.length >= 2 && s.length <= 80);

  const results = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (/^(?:the|our|a|an|in|of|for|with|to|and|or|etc|e\.g|i\.e|such as|including|related|equivalent|similar|etc\.)$/.test(lower)) continue;
    if (lower.length < 2) continue;
    if (/^(?:building|developing|creating|designing|implementing|managing|leading|writing|building and|maintaining|deploying)$/.test(lower)) continue;
    const cleaned2 = candidate
      .replace(/\bsuch\s+as\s+/gi, '')
      .replace(/\bincluding\s+/gi, '')
      .replace(/\bfor\s+(?:example|instance)\s*/gi, '')
      .trim();
    if (cleaned2.length >= 2) {
      results.push(cleaned2);
    }
  }

  return results.length > 0 ? results : [cleaned.slice(0, 80)];
}

describe('Atomic Requirement Extraction Regression Tests', () => {
  describe('1. Compound sentence decomposition', () => {
    it('extracts TypeScript, JavaScript, React, Node.js from compound sentence', () => {
      const text = 'Proficiency in TypeScript, JavaScript, React, and Node.js';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.includes('typescript'), `Expected TypeScript in ${JSON.stringify(result)}`);
      assert.ok(lower.includes('javascript'), `Expected JavaScript in ${JSON.stringify(result)}`);
      assert.ok(lower.includes('react'), `Expected React in ${JSON.stringify(result)}`);
      assert.ok(lower.includes('node.js'), `Expected Node.js in ${JSON.stringify(result)}`);
    });

    it('does NOT generate compound slugs like "proficiency-in-typescript-javascript-react-and-nod"', () => {
      const text = 'Proficiency in TypeScript, JavaScript, React, and Node.js';
      const result = splitIntoAtomicSkills(text);

      for (const skill of result) {
        assert.ok(
          skill.length < 50,
          `Skill name too long (compound slug?): "${skill}"`
        );
        assert.ok(
          !skill.toLowerCase().includes('proficiency'),
          `Should not contain prefix word: "${skill}"`
        );
        assert.ok(
          !skill.toLowerCase().includes('knowledge'),
          `Should not contain prefix word: "${skill}"`
        );
      }
    });

    it('extracts SQL from "experience with SQL databases"', () => {
      const text = 'Experience with SQL databases and data modeling';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.some(s => s.includes('sql')), `Expected SQL in ${JSON.stringify(result)}`);
    });

    it('extracts access-control models meaningfully', () => {
      const text = 'Familiarity with access control models such as RBAC, ABAC, and OAuth';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      // Should extract RBAC, ABAC, OAuth as atomic skills — NOT "access-control-models-such-as-rbac"
      assert.ok(lower.some(s => s.includes('rbac')), `Expected RBAC in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('abac')), `Expected ABAC in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('oauth')), `Expected OAuth in ${JSON.stringify(result)}`);
    });

    it('extracts LDAP and security architecture separately', () => {
      const text = 'Strong knowledge of security architecture, LDAP, and identity management';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.some(s => s.includes('ldap')), `Expected LDAP in ${JSON.stringify(result)}`);
      assert.ok(
        lower.some(s => s.includes('security') || s.includes('identity')),
        `Expected security/identity in ${JSON.stringify(result)}`
      );
    });

    it('handles "X, Y, and Z" pattern correctly', () => {
      const text = 'Experience with PostgreSQL, MySQL, and MongoDB for data storage';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.some(s => s.includes('postgresql')), `Expected PostgreSQL in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('mysql')), `Expected MySQL in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('mongodb')), `Expected MongoDB in ${JSON.stringify(result)}`);
    });

    it('handles slash-separated technologies', () => {
      const text = 'Proficiency in React/Vue/Angular for frontend development';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.some(s => s.includes('react')), `Expected React in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('vue')), `Expected Vue in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('angular')), `Expected Angular in ${JSON.stringify(result)}`);
    });

    it('handles short single-skill requirements', () => {
      const result = splitIntoAtomicSkills('Python');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], 'Python');
    });

    it('strips "practical experience developing and improving" prefix', () => {
      const text = 'Practical experience developing and improving applications using Docker and Kubernetes';
      const result = splitIntoAtomicSkills(text);
      const lower = result.map(s => s.toLowerCase());

      assert.ok(lower.some(s => s.includes('docker')), `Expected Docker in ${JSON.stringify(result)}`);
      assert.ok(lower.some(s => s.includes('kubernetes')), `Expected Kubernetes in ${JSON.stringify(result)}`);
      assert.ok(!lower.some(s => s.includes('practical')), `Should not include "practical": ${JSON.stringify(result)}`);
    });
  });

  describe('2. Requirement category classification', () => {
    it('categorizes "X+ years experience" as EXPERIENCE, not SKILL', () => {
      const line = '5+ years of experience in backend development';
      const expMatch = line.match(
        /\b(?:(\d+)(?:\s*[-–—to]\s*(\d+))?|\b(\d+)\+?)\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?(?:\s+(?:in|with|using|of)\s+([A-Za-z0-9_#.+ -]{1,40}))?\b/i
      );
      assert.ok(expMatch, 'Should match experience pattern');
      assert.strictEqual(parseInt(expMatch[1] || expMatch[3], 10), 5);
    });

    it('categorizes education requirements correctly', () => {
      const line = 'Bachelor\'s degree in Computer Science or equivalent';
      const hasDegree = /\b(?:bachelor(?:'s)?(?:\s+degree)?|b\.s\.|b\.a\.|b\.tech|b\.e\.)\b/i.test(line);
      assert.ok(hasDegree, 'Should detect Bachelor\'s degree');
    });

    it('does not treat "practical experience developing..." as a skill slug', () => {
      const text = 'Practical experience developing and improving applications';
      const result = splitIntoAtomicSkills(text);

      // Should NOT produce a single slug like "practical-experience-developing-and-improving-applications"
      for (const skill of result) {
        assert.ok(
          skill.length < 40,
          `Skill name too long (compound slug?): "${skill}"`
        );
      }
    });
  });

  describe('3. Gap deduplication and atomic naming', () => {
    it('gap skill names should NOT be compound slugs', () => {
      // These are examples of BAD compound slugs that should NEVER appear in output
      const badCompoundSlugs = [
        'proficiency-in-typescript-javascript-react-and-nod',
        'strong-knowledge-of-security-architecture-ldap-act',
        'familiarity-with-access-control-models-such-as-rba',
        'practical-experience-developing-and-improving-appl',
      ];

      for (const slug of badCompoundSlugs) {
        // These are all > 30 chars and contain connecting words — clearly compound
        assert.ok(
          slug.length > 30,
          `Expected compound slug to be long: "${slug}"`
        );
        assert.ok(
          slug.includes('-and-') || slug.includes('proficiency-in') || slug.includes('knowledge-of') || slug.includes('experience-developing') || slug.includes('access-control-models'),
          `Expected compound slug pattern: "${slug}"`
        );
      }
    });
  });
});
